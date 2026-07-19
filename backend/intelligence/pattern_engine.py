import os
import json
from collections import defaultdict
from dotenv import load_dotenv
from groq import Groq

dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(dotenv_path)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")


def extract_failure_graph(driver) -> list:
    """
    Pull all failures with their causal components, symptoms, and resolutions.
    Returns list of failure records.
    """
    records = []

    cypher = """
    MATCH (e:Equipment)<-[:PART_OF]-(c:Component)<-[:CAUSED_BY]-(f:Failure)
    OPTIONAL MATCH (f)-[:EXHIBITED_SYMPTOM]->(s:Symptom)
    OPTIONAL MATCH (f)<-[:RESOLVED]-(a:Action)
    RETURN e.name AS equipment,
           c.name AS component,
           labels(c)[0] AS component_type,
           f.name AS failure,
           collect(DISTINCT s.name) AS symptoms,
           collect(DISTINCT a.name) AS actions
    """

    try:
        with driver.session() as session:
            result = session.run(cypher)
            for record in result:
                records.append({
                    "equipment": record.get("equipment"),
                    "component": record.get("component"),
                    "failure": record.get("failure"),
                    "symptoms": [s for s in record.get("symptoms", []) if s],
                    "actions": [a for a in record.get("actions", []) if a],
                })
    except Exception as e:
        print(f"Pattern engine Neo4j query failed: {e}")

    return records


def group_by_component(records: list) -> dict:
    """
    Group failure records by component name to identify recurring patterns.
    Returns {component_name: [records...]}
    """
    grouped = defaultdict(list)
    for r in records:
        comp = r.get("component")
        if comp:
            grouped[comp].append(r)
    return dict(grouped)


def analyze_patterns_with_groq(grouped: dict) -> list:
    """
    Feed grouped failure data to Groq to identify systemic patterns.
    Returns list of pattern objects.
    """
    if not grouped:
        return []

    # Build compact summary for LLM
    summary_lines = []
    for component, recs in grouped.items():
        equipments = list({r["equipment"] for r in recs if r.get("equipment")})
        failures = list({r["failure"] for r in recs if r.get("failure")})
        symptoms = list({s for r in recs for s in r.get("symptoms", [])})
        summary_lines.append(
            f"Component '{component}': affects equipment [{', '.join(equipments[:5])}], "
            f"failures [{', '.join(failures[:5])}], symptoms [{', '.join(symptoms[:5])}], "
            f"frequency={len(recs)}"
        )

    summary = "\n".join(summary_lines[:20])  # cap at 20 components

    if not GROQ_API_KEY:
        # Fallback: build patterns from grouping directly
        patterns = []
        for component, recs in grouped.items():
            if len(recs) >= 2:
                equipments = list({r["equipment"] for r in recs if r.get("equipment")})
                failures = list({r["failure"] for r in recs if r.get("failure")})
                patterns.append({
                    "pattern_name": f"Recurring {component} Failures",
                    "affected_equipment": equipments,
                    "root_cause": component,
                    "frequency": len(recs),
                    "recommendation": f"Inspect and schedule preventive maintenance for all {component} units.",
                })
        return patterns

    client = Groq(api_key=GROQ_API_KEY)
    prompt = (
        "Analyse these industrial failure records grouped by root cause component. "
        "Identify systemic patterns, recurring root causes, and equipment types most at risk.\n\n"
        f"{summary}\n\n"
        "Return a JSON object with a single key 'patterns' containing an array of pattern objects. "
        "Each object must have: pattern_name (string), affected_equipment (array of strings), "
        "root_cause (string), frequency (integer), recommendation (string)."
    )

    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content)
        return data.get("patterns", [])
    except Exception as e:
        print(f"Pattern analysis Groq call failed: {e}")
        # Fallback
        patterns = []
        for component, recs in grouped.items():
            if len(recs) >= 2:
                equipments = list({r["equipment"] for r in recs if r.get("equipment")})
                patterns.append({
                    "pattern_name": f"Recurring {component} Failures",
                    "affected_equipment": equipments,
                    "root_cause": component,
                    "frequency": len(recs),
                    "recommendation": f"Prioritise inspection of {component} units across all affected equipment.",
                })
        return patterns


def build_warning_cards(patterns: list) -> list:
    """Convert identified patterns into proactive warning cards."""
    warnings = []
    for p in patterns:
        frequency = p.get("frequency", 1)
        if frequency >= 3:
            severity = "CRITICAL"
        elif frequency >= 2:
            severity = "HIGH"
        else:
            severity = "MEDIUM"

        warnings.append({
            "warning_title": p.get("pattern_name", "Unknown Pattern"),
            "affected_equipment": p.get("affected_equipment", []),
            "pattern_description": f"Root cause: {p.get('root_cause', 'Unknown')}. Observed {frequency} time(s).",
            "recommendation": p.get("recommendation", "Review and schedule maintenance."),
            "severity": severity,
        })

    return warnings


def run_pattern_engine(driver) -> dict:
    """Main entry point. Returns both patterns and warnings."""
    records = extract_failure_graph(driver)
    grouped = group_by_component(records)
    patterns = analyze_patterns_with_groq(grouped)
    warnings = build_warning_cards(patterns)
    return {"patterns": patterns, "warnings": warnings}
