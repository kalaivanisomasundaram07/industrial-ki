import os
import json
from dotenv import load_dotenv
from groq import Groq
from backend.ingestion.parser import get_sqlite_conn

dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(dotenv_path)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")


def get_compliance_matrix(driver) -> dict:
    """
    Returns {equipment_name: {regulations: [...], procedures: [...], documents: [...]}}
    """
    matrix = {}

    # Query governed regulations
    cypher_reg = """
    MATCH (e:Equipment)-[:GOVERNED_BY]->(r:Regulation)
    RETURN e.name AS equipment,
           r.name AS regulation,
           coalesce(r.standard_body, 'Unknown') AS standard_body
    """

    # Query linked procedures
    cypher_proc = """
    MATCH (e:Equipment)-[:MAINTAINED_BY]->(p:Procedure)
    RETURN e.name AS equipment,
           p.name AS procedure,
           coalesce(p.title, p.name) AS title,
           coalesce(p.sop_number, 'N/A') AS sop_number
    """

    # Query linked documents via failures
    cypher_docs = """
    MATCH (e:Equipment)<-[:PART_OF]-(c:Component)<-[:CAUSED_BY]-(f:Failure)-[:DOCUMENTED_IN]->(d:Document)
    RETURN e.name AS equipment, d.name AS doc_filename, d.id AS doc_id
    """

    # Query all equipment (to include equipment with no relations)
    cypher_all_eq = "MATCH (e:Equipment) RETURN e.name AS equipment"

    try:
        with driver.session() as session:
            # Seed all equipment
            res = session.run(cypher_all_eq)
            for r in res:
                eq = r.get("equipment")
                if eq:
                    matrix[eq] = {"regulations": [], "procedures": [], "documents": []}

            # Regulations
            res = session.run(cypher_reg)
            for r in res:
                eq = r.get("equipment")
                if eq and eq in matrix:
                    matrix[eq]["regulations"].append({
                        "name": r.get("regulation"),
                        "standard_body": r.get("standard_body"),
                    })

            # Procedures
            res = session.run(cypher_proc)
            for r in res:
                eq = r.get("equipment")
                if eq and eq in matrix:
                    matrix[eq]["procedures"].append({
                        "name": r.get("procedure"),
                        "title": r.get("title"),
                        "sop_number": r.get("sop_number"),
                    })

            # Documents
            res = session.run(cypher_docs)
            for r in res:
                eq = r.get("equipment")
                if eq and eq in matrix:
                    doc_entry = {"filename": r.get("doc_filename"), "doc_id": r.get("doc_id")}
                    if doc_entry not in matrix[eq]["documents"]:
                        matrix[eq]["documents"].append(doc_entry)

    except Exception as e:
        print(f"Compliance matrix query failed: {e}")

    return matrix


def detect_gaps(matrix: dict, driver) -> list:
    """
    Cross-checks regulations vs procedures and failures vs actions.
    Returns list of gap dicts.
    """
    gaps = []

    # Check: governed but no procedure
    for eq, data in matrix.items():
        regs = data.get("regulations", [])
        procs = data.get("procedures", [])

        for reg in regs:
            if not procs:
                # Generate gap description via Groq
                description = _gap_description(
                    eq, reg.get("name", "Unknown Regulation"),
                    "No maintenance SOP linked in the knowledge graph."
                )
                gaps.append({
                    "equipment": eq,
                    "regulation": reg.get("name", "Unknown"),
                    "gap_type": "MISSING_PROCEDURE",
                    "description": description,
                    "severity": "HIGH",
                })

    # Check: failures with no resolved action (unresolved failure gap)
    cypher_unresolved = """
    MATCH (e:Equipment)<-[:PART_OF]-(c:Component)<-[:CAUSED_BY]-(f:Failure)
    WHERE NOT (f)<-[:RESOLVED]-()
    RETURN e.name AS equipment, f.name AS failure
    """
    try:
        with driver.session() as session:
            res = session.run(cypher_unresolved)
            for r in res:
                eq = r.get("equipment")
                failure = r.get("failure")
                if eq and failure:
                    gaps.append({
                        "equipment": eq,
                        "regulation": "N/A",
                        "gap_type": "UNRESOLVED_FAILURE",
                        "description": f"{eq} has an unresolved failure: '{failure}'. No corrective action recorded.",
                        "severity": "CRITICAL",
                    })
    except Exception as e:
        print(f"Unresolved failure gap query failed: {e}")

    return gaps


def _gap_description(equipment: str, regulation: str, detail: str) -> str:
    """Generate a plain-English gap description using Groq if available."""
    if not GROQ_API_KEY:
        return f"{equipment} is governed by {regulation} but has no documented maintenance SOP linked in the knowledge graph."

    client = Groq(api_key=GROQ_API_KEY)
    prompt = (
        f"Write a single concise sentence describing this compliance gap for an industrial engineer:\n"
        f"Equipment: {equipment}\n"
        f"Regulation: {regulation}\n"
        f"Issue: {detail}\n"
        "Return only the sentence."
    )
    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=80,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return f"{equipment} is governed by {regulation} but {detail}"


def build_evidence_package(equipment_name: str, matrix: dict, driver) -> dict:
    """
    Build compliance evidence package for a specific equipment.
    Enriches document entries with SQLite metadata.
    """
    data = matrix.get(equipment_name, {"regulations": [], "procedures": [], "documents": []})

    # Enrich documents with SQLite ingestion metadata
    enriched_docs = []
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    for doc in data.get("documents", []):
        filename = doc.get("filename")
        if filename:
            try:
                cursor.execute(
                    "SELECT filename, doc_type, ingested_at FROM documents WHERE filename = ?",
                    (filename,)
                )
                row = cursor.fetchone()
                if row:
                    enriched_docs.append({
                        "filename": row["filename"],
                        "doc_type": row["doc_type"],
                        "ingested_at": row["ingested_at"],
                    })
                else:
                    enriched_docs.append({"filename": filename, "doc_type": "unknown", "ingested_at": None})
            except Exception:
                enriched_docs.append({"filename": filename, "doc_type": "unknown", "ingested_at": None})
    conn.close()

    compliance_status = "COMPLIANT" if data["regulations"] and data["procedures"] else (
        "NON_COMPLIANT" if data["regulations"] and not data["procedures"] else "UNREGULATED"
    )

    return {
        "equipment": equipment_name,
        "regulations": data["regulations"],
        "procedures": data["procedures"],
        "linked_documents": enriched_docs,
        "compliance_status": compliance_status,
        "generated_at": __import__("datetime").datetime.now().isoformat(),
    }


def generate_compliance_report(gaps: list, matrix: dict) -> str:
    """Use Groq to write a full markdown compliance report."""
    if not GROQ_API_KEY:
        lines = ["# Compliance Report\n"]
        lines.append(f"## Summary\nTotal gaps identified: {len(gaps)}\n")
        for g in gaps:
            lines.append(f"- **{g['equipment']}** ({g['gap_type']}): {g['description']}\n")
        return "\n".join(lines)

    client = Groq(api_key=GROQ_API_KEY)

    compliant_eq = [eq for eq, d in matrix.items() if d["regulations"] and d["procedures"]]
    non_compliant_eq = [eq for eq, d in matrix.items() if d["regulations"] and not d["procedures"]]

    gaps_summary = "\n".join(
        [f"- {g['equipment']} | {g['gap_type']} | {g['severity']}: {g['description']}" for g in gaps]
    ) or "No gaps found."

    prompt = (
        "You are an industrial compliance auditor. Write a professional compliance audit report in Markdown format.\n"
        f"Compliant equipment: {', '.join(compliant_eq) or 'None'}\n"
        f"Non-compliant equipment: {', '.join(non_compliant_eq) or 'None'}\n"
        f"Identified gaps:\n{gaps_summary}\n\n"
        "Include: Executive Summary, Compliance Status Table, Gap Analysis, Recommendations. "
        "Use Markdown headers, tables, and bullet points."
    )

    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1500,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return f"# Compliance Report\n\nReport generation failed: {str(e)}\n\n## Gaps\n{gaps_summary}"
