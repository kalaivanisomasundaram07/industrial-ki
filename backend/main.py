import os
import sys

# Ensure parent directory of backend is in sys.path so backend absolute imports work
_parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

import sqlite3
import json
import time
import shutil
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from backend.ingestion.parser import (
    scan_and_ingest, get_sqlite_conn, init_db, ingest_document
)
from backend.graph.schema import init_schema, get_neo4j_driver
from backend.db import close_neo4j_driver
from backend.graph.extractor import extract_and_gate_triples, commit_triple_to_neo4j
from backend.retrieval.vector_store import index_document, get_chunk_info
from backend.agents.graph_agents import run_agent_pipeline

# New Phase-2 modules
from backend.maintenance.risk_engine import compute_risk_dashboard
from backend.compliance.gap_detector import (
    get_compliance_matrix, detect_gaps, build_evidence_package, generate_compliance_report
)
from backend.intelligence.pattern_engine import run_pattern_engine

# Load env variables from root directory
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path)

DATA_DIR = os.getenv("DATA_DIR", "./data/raw")
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".txt", ".jpg", ".jpeg", ".png"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: warm up Neo4j pool on startup, close cleanly on shutdown."""
    # ── Startup ──────────────────────────────────────────────────────────
    try:
        init_db()
        _init_perf_table()
        _init_chat_history_table()
        print("SQLite Database initialized.")
    except Exception as e:
        print(f"SQLite Initialization failed: {e}")
    try:
        init_schema()
        print("Neo4j Schema initialized.")
    except Exception as e:
        print(f"Neo4j Schema initialization failed: {e}")
    try:
        # Warm-up ping so the first real request doesn't pay connection cost
        driver = get_neo4j_driver()
        with driver.session() as session:
            session.run("RETURN 1")
        print("Neo4j connection pool warmed up.")
    except Exception as e:
        print(f"Neo4j warm-up failed (will retry on first request): {e}")

    yield  # ── App is running ──────────────────────────────────────────────

    # ── Shutdown ──────────────────────────────────────────────────────────
    close_neo4j_driver()
    print("Neo4j connection pool closed.")


app = FastAPI(title="Industrial Knowledge Intelligence API v2", lifespan=lifespan)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    question: str
    session_id: str = "default"


# ─────────────────────────────────────────────
# STARTUP
# ─────────────────────────────────────────────

# (Removed: @app.on_event("startup") merged into lifespan above)



def _init_perf_table():
    """Create performance_stats table if it doesn't exist."""
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS performance_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_time_ms REAL,
        graph_retrieval_ms REAL,
        vector_retrieval_ms REAL,
        llm_generation_ms REAL,
        verification_ms REAL,
        grounding_score REAL,
        had_conflicts INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    conn.commit()
    conn.close()


def _init_chat_history_table():
    """Create chat_history table if it doesn't exist, and add session_id if not present."""
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        conn.commit()

        # ALTER TABLE IF NOT EXISTS pattern for session_id
        cursor.execute("PRAGMA table_info(chat_history)")
        columns = [row[1] for row in cursor.fetchall()]
        if "session_id" not in columns:
            cursor.execute("ALTER TABLE chat_history ADD COLUMN session_id TEXT DEFAULT 'default'")
            conn.commit()
    except Exception as e:
        print(f"Error altering/initializing chat_history table: {e}")
    finally:
        conn.close()


def _save_chat_message(session_id: str, role: str, content: str, metadata: dict = None):
    """Persist a single chat message to chat_history table. Silently ignores errors."""
    try:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO chat_history (session_id, role, content, metadata) VALUES (?, ?, ?, ?)",
            (session_id, role, content, json.dumps(metadata or {})),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"chat_history save failed: {e}")


def deduplicate_citations(citations: list) -> list:
    """
    Keep only the highest similarity score chunk per unique filename.
    """
    seen: dict = {}
    for citation in citations:
        filename = citation.get("filename", "")
        if not filename:
            continue
        score = citation.get("similarity_score")
        if score is None:
            score = 0.0
        else:
            try:
                score = float(score)
            except (ValueError, TypeError):
                score = 0.0
        
        if filename not in seen:
            seen[filename] = citation
        else:
            existing_score = seen[filename].get("similarity_score")
            if existing_score is None:
                existing_score = 0.0
            else:
                try:
                    existing_score = float(existing_score)
                except (ValueError, TypeError):
                    existing_score = 0.0
            if score > existing_score:
                seen[filename] = citation
    return list(seen.values())



# ─────────────────────────────────────────────
# EXISTING PHASE-1 ENDPOINTS (unchanged behaviour)
# ─────────────────────────────────────────────

@app.post("/ingest")
def trigger_ingestion():
    """Scans DATA_DIR, parses documents, extracts triples, and indexes vectors."""
    try:
        docs = scan_and_ingest()
        if not docs:
            return {"status": "success", "message": "No new documents found to ingest.", "count": 0}

        total_triples = committed_triples = queued_triples = 0

        for doc in docs:
            triples = extract_and_gate_triples(
                doc["id"], doc["filename"], doc["raw_text"], doc["reliability_weight"]
            )
            total_triples += len(triples)
            for t in triples:
                if t.get("gating_status") == "auto-committed":
                    committed_triples += 1
                elif t.get("gating_status") == "queued":
                    queued_triples += 1
            index_document(
                doc["id"], doc["filename"], doc["doc_type"],
                doc["raw_text"], page_map=doc.get("page_map")
            )

        return {
            "status": "success",
            "message": f"Successfully processed {len(docs)} documents.",
            "documents_count": len(docs),
            "total_extracted_triples": total_triples,
            "committed_triples": committed_triples,
            "queued_triples": queued_triples,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion pipeline failed: {str(e)}")


@app.post("/query")
def execute_query(request: QueryRequest):
    """Executes the full LangGraph pipeline — now includes timing telemetry."""
    total_start = time.perf_counter()

    try:
        # We instrument the pipeline at a high level; granular timings come from the agent state
        pipeline_result = run_agent_pipeline(request.question)
        total_ms = round((time.perf_counter() - total_start) * 1000, 1)

        grounding = pipeline_result.get("grounding_result", {})
        grounding_score = grounding.get("overall_score", 0.0)
        conflicts = grounding.get("conflicts", [])

        # Derive rough sub-timings from audit_trail timestamps
        trail = pipeline_result.get("audit_trail", [])
        graph_ms = vector_ms = llm_ms = verify_ms = 0.0

        if len(trail) >= 2:
            # Estimate based on agent count split
            per_agent = total_ms / max(len(trail), 1)
            for entry in trail:
                agent = entry.get("agent_name", "")
                if "Retrieval" in agent:
                    graph_ms += per_agent * 0.6
                    vector_ms += per_agent * 0.4
                elif "Generation" in agent:
                    llm_ms += per_agent
                elif "Verifier" in agent:
                    verify_ms += per_agent

        # Persist performance record
        try:
            conn = get_sqlite_conn()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO performance_stats
                  (query_time_ms, graph_retrieval_ms, vector_retrieval_ms,
                   llm_generation_ms, verification_ms, grounding_score, had_conflicts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (total_ms, round(graph_ms, 1), round(vector_ms, 1),
                  round(llm_ms, 1), round(verify_ms, 1),
                  grounding_score, 1 if conflicts else 0))
            conn.commit()
            conn.close()
        except Exception as pe:
            print(f"Failed to persist performance stats: {pe}")

        # Enrich citations with page_number + chunk_index + doc_type from ChromaDB
        raw_citations = grounding.get("citations", [])
        enriched_citations = []
        for cit in raw_citations:
            filename = cit.get("filename", "")
            chunk_index = cit.get("chunk_index", 0)
            chunk_info = get_chunk_info(filename, chunk_index) if filename else {}
            enriched_citations.append({
                "chunk_text": cit.get("chunk_text", chunk_info.get("chunk_text", "")),
                "filename": filename,
                "page_number": chunk_info.get("page_number", 1),
                "chunk_index": chunk_index,
                "doc_type": chunk_info.get("doc_type", cit.get("doc_type", "unknown")),
                "similarity_score": cit.get("similarity_score", 0),
            })

        answer_text = pipeline_result.get("final_response", "")

        # Silently save both the user question and assistant answer to chat_history
        try:
            _save_chat_message(request.session_id, "user", request.question)
            _save_chat_message(
                request.session_id,
                "assistant",
                answer_text,
                {
                    "grounding_score": grounding_score,
                    "conflict_count": len(conflicts),
                    "query_time_ms": total_ms,
                },
            )
        except Exception as e:
            print(f"Failed to silently save chat history: {e}")

        # Deduplicate: keep only the highest similarity score chunk per unique filename
        final_citations = deduplicate_citations(enriched_citations)

        return {
            "answer": answer_text,
            "grounding_score": grounding_score,
            "sentence_highlights": grounding.get("sentence_scores", []),
            "conflicts": conflicts,
            "citations": final_citations,
            "causal_chain": pipeline_result.get("causal_chain", []),
            "audit_trail": trail,
            # Phase-2 timing fields
            "query_time_ms": total_ms,
            "graph_retrieval_ms": round(graph_ms, 1),
            "vector_retrieval_ms": round(vector_ms, 1),
            "llm_generation_ms": round(llm_ms, 1),
            "verification_ms": round(verify_ms, 1),
            "grounding_note": grounding.get("grounding_note", ""),
            "verification_results": grounding.get("verification_results", {
                "verified": [], "contradictions": []
            }),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent Query execution failed: {str(e)}")


@app.get("/graph/entity/{name}")
def get_entity_subgraph(name: str):
    """Fetches local subgraph (nodes and edges) for visualization."""
    driver = get_neo4j_driver()
    nodes_map = {}
    edges = []

    if name.lower() == "all":
        cypher = "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 150"
    else:
        cypher = """
        MATCH (center) WHERE toLower(center.name) = toLower($name)
        MATCH path = (center)-[r*1..2]-(m)
        RETURN nodes(path) as path_nodes, relationships(path) as path_rels LIMIT 100
        """

    try:
        with driver.session() as session:
            result = session.run(cypher, name=name)

            if name.lower() == "all":
                for record in result:
                    n = record.get("n")
                    m = record.get("m")
                    r = record.get("r")
                    for node in [n, m]:
                        n_id = node.element_id if hasattr(node, "element_id") else node.id
                        nodes_map[n_id] = {
                            "id": node.get("name", "Unknown"),
                            "name": node.get("name", "Unknown"),
                            "label": list(node.labels)[0] if node.labels else "Unknown",
                        }
                    edges.append({
                        "source": n.get("name", "Unknown"),
                        "target": m.get("name", "Unknown"),
                        "type": r.type,
                    })
            else:
                for record in result:
                    for node in record.get("path_nodes", []):
                        n_id = node.element_id if hasattr(node, "element_id") else node.id
                        nodes_map[n_id] = {
                            "id": node.get("name", "Unknown"),
                            "name": node.get("name", "Unknown"),
                            "label": list(node.labels)[0] if node.labels else "Unknown",
                        }
                    for rel in record.get("path_rels", []):
                        edges.append({
                            "source": rel.start_node.get("name", "Unknown"),
                            "target": rel.end_node.get("name", "Unknown"),
                            "type": rel.type,
                        })

        dedup_edges = []
        seen_edges = set()
        for edge in edges:
            key = (edge["source"], edge["target"], edge["type"])
            if key not in seen_edges:
                seen_edges.add(key)
                dedup_edges.append(edge)

        return {"nodes": list(nodes_map.values()), "links": dedup_edges}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch entity subgraph: {str(e)}")


@app.get("/review-queue")
def get_pending_reviews():
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT r.id, r.triple_json, r.evidence_snippet, r.doc_id, r.score, r.status, d.filename
            FROM review_queue r
            JOIN documents d ON r.doc_id = d.id
            WHERE r.status = 'pending'
        """)
        rows = cursor.fetchall()
        reviews = []
        for row in rows:
            reviews.append({
                "id": row["id"],
                "triple": json.loads(row["triple_json"]),
                "evidence": row["evidence_snippet"],
                "doc_id": row["doc_id"],
                "filename": row["filename"],
                "score": round(row["score"], 2),
                "status": row["status"],
            })
        return reviews
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch review queue: {str(e)}")
    finally:
        conn.close()


@app.post("/review-queue/{id}/approve")
def approve_review_item(id: str):
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT r.triple_json, r.doc_id, r.score, d.filename
            FROM review_queue r JOIN documents d ON r.doc_id = d.id
            WHERE r.id = ?
        """, (id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Review item not found.")
        triple_data = json.loads(row["triple_json"])
        commit_triple_to_neo4j(
            triple_data.get("entity1"), triple_data.get("relation"),
            triple_data.get("entity2"), row["score"], row["doc_id"], row["filename"]
        )
        cursor.execute("UPDATE review_queue SET status = 'approved' WHERE id = ?", (id,))
        conn.commit()
        return {"status": "success", "message": "Triple approved and committed to Neo4j."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to approve item: {str(e)}")
    finally:
        conn.close()


@app.post("/review-queue/{id}/reject")
def reject_review_item(id: str):
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM review_queue WHERE id = ?", (id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Review item not found.")
        cursor.execute("UPDATE review_queue SET status = 'rejected' WHERE id = ?", (id,))
        conn.commit()
        return {"status": "success", "message": "Triple rejected."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reject item: {str(e)}")
    finally:
        conn.close()


@app.get("/graph/stats")
def get_graph_statistics():
    driver = get_neo4j_driver()
    try:
        with driver.session() as session:
            total_nodes = session.run("MATCH (n) RETURN count(n) as c").single().get("c", 0)
            total_rels = session.run("MATCH ()-[r]->() RETURN count(r) as c").single().get("c", 0)
            nodes_by_type = {}
            for r in session.run("MATCH (n) RETURN labels(n)[0] as type, count(n) as count"):
                nodes_by_type[r.get("type", "Unknown")] = r.get("count", 0)
        return {"total_nodes": total_nodes, "total_relationships": total_rels, "nodes_by_type": nodes_by_type}
    except Exception as e:
        return {"total_nodes": 0, "total_relationships": 0, "nodes_by_type": {}, "warning": str(e)}


# ─────────────────────────────────────────────
# PHASE-2: FEATURE 1 — File Upload
# ─────────────────────────────────────────────

@app.post("/upload")
async def upload_documents(files: List[UploadFile] = File(...)):
    """
    Accept multipart file uploads, save to DATA_DIR, auto-ingest each file,
    and return ingestion summary.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    uploaded = []
    all_triples = committed = queued = 0

    for upload in files:
        filename = upload.filename or "unknown"
        ext = os.path.splitext(filename)[1].lower()

        if ext not in ALLOWED_EXTENSIONS:
            print(f"Skipping unsupported file type: {filename}")
            continue

        dest_path = os.path.join(DATA_DIR, filename)
        content = await upload.read()
        with open(dest_path, "wb") as f:
            f.write(content)
        uploaded.append(filename)

        # Immediately ingest this specific file
        try:
            doc = ingest_document(dest_path)
            if doc:
                triples = extract_and_gate_triples(
                    doc["id"], doc["filename"], doc["raw_text"], doc["reliability_weight"]
                )
                all_triples += len(triples)
                for t in triples:
                    if t.get("gating_status") == "auto-committed":
                        committed += 1
                    elif t.get("gating_status") == "queued":
                        queued += 1
                index_document(
                    doc["id"], doc["filename"], doc["doc_type"],
                    doc["raw_text"], page_map=doc.get("page_map")
                )
        except Exception as e:
            print(f"Ingestion failed for {filename}: {e}")

    return {
        "uploaded": uploaded,
        "ingested": {
            "docs_processed": len(uploaded),
            "triples_committed": committed,
            "triples_queued": queued,
            "total_triples": all_triples,
        },
    }


# ─────────────────────────────────────────────
# PHASE-2: FEATURE 2 — Maintenance Risk Dashboard
# ─────────────────────────────────────────────

@app.get("/maintenance/risk")
def get_maintenance_risk():
    """Returns per-equipment risk scores, levels, and Groq recommendations."""
    try:
        driver = get_neo4j_driver()
        dashboard = compute_risk_dashboard(driver)
        return dashboard
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk engine failed: {str(e)}")


# ─────────────────────────────────────────────
# PHASE-2: FEATURE 3 — Compliance Gap Detection
# ─────────────────────────────────────────────

@app.get("/compliance/gaps")
def get_compliance_gaps():
    """Returns list of compliance gaps identified from Neo4j knowledge graph."""
    try:
        driver = get_neo4j_driver()
        matrix = get_compliance_matrix(driver)
        gaps = detect_gaps(matrix, driver)
        return gaps
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compliance gap detection failed: {str(e)}")


@app.get("/compliance/evidence/{equipment_name}")
def get_compliance_evidence(equipment_name: str):
    """Returns compliance evidence package for a specific equipment."""
    try:
        driver = get_neo4j_driver()
        matrix = get_compliance_matrix(driver)
        package = build_evidence_package(equipment_name, matrix, driver)
        return package
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evidence package generation failed: {str(e)}")


@app.post("/compliance/report")
def generate_full_compliance_report():
    """Triggers Groq to write a full markdown compliance audit report."""
    try:
        driver = get_neo4j_driver()
        matrix = get_compliance_matrix(driver)
        gaps = detect_gaps(matrix, driver)
        report_md = generate_compliance_report(gaps, matrix)
        return {"report": report_md}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


# ─────────────────────────────────────────────
# PHASE-2: FEATURE 4 — Pattern Engine / Warnings
# ─────────────────────────────────────────────

@app.get("/intelligence/patterns")
def get_failure_patterns():
    """Returns identified systemic failure patterns from Neo4j + Groq analysis."""
    try:
        driver = get_neo4j_driver()
        result = run_pattern_engine(driver)
        return result.get("patterns", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pattern engine failed: {str(e)}")


@app.get("/intelligence/warnings")
def get_active_warnings():
    """Returns proactive warning cards derived from failure patterns."""
    try:
        driver = get_neo4j_driver()
        result = run_pattern_engine(driver)
        return result.get("warnings", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Warning generation failed: {str(e)}")


# ─────────────────────────────────────────────
# PHASE-2: FEATURE 5 — Performance Stats
# ─────────────────────────────────────────────

@app.get("/stats/performance")
def get_performance_stats():
    """Returns aggregated query performance statistics."""
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                COUNT(*) as total_queries,
                AVG(query_time_ms) as avg_query_time_ms,
                AVG(grounding_score) as avg_grounding_score,
                SUM(had_conflicts) as queries_with_conflicts
            FROM performance_stats
        """)
        row = cursor.fetchone()
        if row:
            return {
                "total_queries": row["total_queries"] or 0,
                "avg_query_time_ms": round(row["avg_query_time_ms"] or 0, 1),
                "avg_grounding_score": round(row["avg_grounding_score"] or 0, 3),
                "queries_with_conflicts": row["queries_with_conflicts"] or 0,
            }
        return {"total_queries": 0, "avg_query_time_ms": 0.0, "avg_grounding_score": 0.0, "queries_with_conflicts": 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Performance stats failed: {str(e)}")
    finally:
        conn.close()


# ─────────────────────────────────────────────
# CHAT HISTORY ENDPOINTS
# ─────────────────────────────────────────────

@app.get("/chat/history")
def get_chat_history(session_id: Optional[str] = Query(None)):
    """Returns the last 50 chat messages from history, optionally filtered by session_id, in chronological order."""
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    try:
        if session_id:
            cursor.execute("""
                SELECT id, role, content, metadata, created_at, session_id
                FROM chat_history
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT 50
            """, (session_id,))
        else:
            cursor.execute("""
                SELECT id, role, content, metadata, created_at, session_id
                FROM chat_history
                ORDER BY id DESC
                LIMIT 50
            """)
        rows = cursor.fetchall()
        messages = []
        for row in rows:
            # Check if session_id is a key in Row
            sid = "default"
            try:
                sid = row["session_id"]
            except Exception:
                pass
            messages.append({
                "id": row["id"],
                "role": row["role"],
                "content": row["content"],
                "metadata": json.loads(row["metadata"] or "{}"),
                "created_at": row["created_at"],
                "session_id": sid
            })
        messages.reverse()
        return messages
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch chat history: {str(e)}")
    finally:
        conn.close()


@app.get("/chat/sessions")
def get_chat_sessions():
    """
    Returns distinct sessions as list of
    {session_id, first_message, created_at, message_count}
    """
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    try:
        # Get distinct sessions and message count, ordered by first message creation time
        cursor.execute("""
            SELECT session_id, COUNT(*) as message_count, MIN(created_at) as session_created_at
            FROM chat_history
            GROUP BY session_id
            ORDER BY session_created_at DESC
        """)
        sessions = cursor.fetchall()
        
        result = []
        for s in sessions:
            sid = s["session_id"]
            m_count = s["message_count"]
            
            # Find the first user message for this session
            cursor.execute("""
                SELECT content, created_at
                FROM chat_history
                WHERE session_id = ? AND role = 'user'
                ORDER BY id ASC
                LIMIT 1
            """, (sid,))
            first_user_msg_row = cursor.fetchone()
            
            if first_user_msg_row:
                first_msg = first_user_msg_row["content"]
                created_at = first_user_msg_row["created_at"]
            else:
                # Fallback: get first message of any role
                cursor.execute("""
                    SELECT content, created_at
                    FROM chat_history
                    WHERE session_id = ?
                    ORDER BY id ASC
                    LIMIT 1
                """, (sid,))
                fallback_row = cursor.fetchone()
                first_msg = fallback_row["content"] if fallback_row else ""
                created_at = fallback_row["created_at"] if fallback_row else s["session_created_at"]
                
            result.append({
                "session_id": sid,
                "first_message": first_msg,
                "created_at": created_at,
                "message_count": m_count
            })
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch chat sessions: {str(e)}")
    finally:
        conn.close()


@app.delete("/chat/history")
def clear_chat_history():
    """Deletes all messages from the chat_history table."""
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM chat_history")
        conn.commit()
        return {"status": "success", "message": "Chat history cleared."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear chat history: {str(e)}")
    finally:
        conn.close()


# ─────────────────────────────────────────────
# PHASE-3: FEATURE 1 — Document Serving & Chunk Lookup
# ─────────────────────────────────────────────

@app.get("/document/{filename}")
def serve_document(filename: str):
    """
    Serve the raw source document file from DATA_DIR.
    Supports PDF, DOCX, XLSX, TXT and image formats.
    """
    # Validate the filename exists in SQLite
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM documents WHERE filename = ?", (filename,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Document '{filename}' not found in database.")
    finally:
        conn.close()

    file_path = os.path.join(DATA_DIR, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found on disk.")

    ext = os.path.splitext(filename)[1].lower()
    content_type_map = {
        ".pdf":  "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc":  "application/msword",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls":  "application/vnd.ms-excel",
        ".txt":  "text/plain",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png":  "image/png",
    }
    media_type = content_type_map.get(ext, "application/octet-stream")

    # Use "inline" disposition so browsers open PDFs in-place (iframe)
    # instead of triggering a download. CORS header allows the frontend
    # iframe (on a different port) to display the file.
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename,
        headers={
            "Content-Disposition": f"inline; filename=\"{filename}\"",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.get("/document/{filename}/chunk-info")
def get_document_chunk_info(filename: str, chunk_index: int = Query(0, ge=0)):
    """
    Returns metadata and text for a specific chunk of a document.
    Used by the frontend DocumentViewer to know which page to jump to.
    """
    info = get_chunk_info(filename, chunk_index)
    return info


# ─────────────────────────────────────────────
# PHASE-3: FEATURE 5 — Compliance Summary & Failure Summary
# ─────────────────────────────────────────────

@app.get("/compliance/summary")
def compliance_summary():
    """
    Returns aggregate counts useful for the compliance status panel:
    equipment_count, regulation_count, sop_count, gap_count, fully_compliant.
    """
    driver = get_neo4j_driver()
    try:
        with driver.session() as session:
            # Count Equipment nodes
            eq_result = session.run("MATCH (n:Equipment) RETURN count(n) AS cnt").single()
            equipment_count = eq_result["cnt"] if eq_result else 0

            # Count Regulation nodes
            reg_result = session.run("MATCH (n:Regulation) RETURN count(n) AS cnt").single()
            regulation_count = reg_result["cnt"] if reg_result else 0

            # Count Procedure nodes (SOPs)
            sop_result = session.run("MATCH (n:Procedure) RETURN count(n) AS cnt").single()
            sop_count = sop_result["cnt"] if sop_result else 0

        # Get current gap count from the existing /compliance/gaps endpoint logic
        # We call the gaps query inline here to avoid code duplication
        gaps_resp = None
        try:
            matrix = get_compliance_matrix(driver)
            gaps_resp = detect_gaps(matrix, driver)
        except Exception:
            gaps_resp = []

        gap_count = len(gaps_resp) if gaps_resp else 0
        fully_compliant = gap_count == 0

        return {
            "equipment_count": equipment_count,
            "regulation_count": regulation_count,
            "sop_count": sop_count,
            "gap_count": gap_count,
            "fully_compliant": fully_compliant,
        }
    except Exception as e:
        # Return safe defaults if Neo4j is unavailable
        return {
            "equipment_count": 0,
            "regulation_count": 0,
            "sop_count": 0,
            "gap_count": 0,
            "fully_compliant": True,
        }


@app.get("/graph/failure-summary")
def graph_failure_summary():
    """
    Returns failure intelligence counts for the patterns sidebar panel:
    failure_count, component_count, symptom_count, equipment_count.
    """
    driver = get_neo4j_driver()
    try:
        with driver.session() as session:
            fail_r = session.run("MATCH (n:Failure) RETURN count(n) AS cnt").single()
            comp_r = session.run("MATCH (n:Component) RETURN count(n) AS cnt").single()
            symp_r = session.run("MATCH (n:Symptom) RETURN count(n) AS cnt").single()
            equip_r = session.run("MATCH (n:Equipment) RETURN count(n) AS cnt").single()

            return {
                "failure_count": fail_r["cnt"] if fail_r else 0,
                "component_count": comp_r["cnt"] if comp_r else 0,
                "symptom_count": symp_r["cnt"] if symp_r else 0,
                "equipment_count": equip_r["cnt"] if equip_r else 0,
            }
    except Exception as e:
        return {
            "failure_count": 0,
            "component_count": 0,
            "symptom_count": 0,
            "equipment_count": 0,
        }


# ─────────────────────────────────────────────
# HEALTH CHECK — verify connections before demo
# ─────────────────────────────────────────────

@app.get("/health")
def health_check():
    """
    Returns connection status and latency for Neo4j and ChromaDB.
    Use this to verify the system is ready before a demo.
    """
    result = {}

    # ── Neo4j ping ────────────────────────────────────────────────────────
    try:
        driver = get_neo4j_driver()
        t0 = time.perf_counter()
        with driver.session() as session:
            session.run("RETURN 1")
        neo4j_ms = int((time.perf_counter() - t0) * 1000)
        result["neo4j"] = "connected"
        result["neo4j_ping_ms"] = neo4j_ms
    except Exception as e:
        result["neo4j"] = "disconnected"
        result["neo4j_ping_ms"] = -1
        result["neo4j_error"] = str(e)

    # ── ChromaDB ping ─────────────────────────────────────────────────────
    try:
        from backend.retrieval.vector_store import get_chroma_client
        t0 = time.perf_counter()
        client = get_chroma_client()
        client.list_collections()
        chroma_ms = int((time.perf_counter() - t0) * 1000)
        result["chromadb"] = "connected"
        result["chromadb_ping_ms"] = chroma_ms
    except Exception as e:
        result["chromadb"] = "disconnected"
        result["chromadb_ping_ms"] = -1
        result["chromadb_error"] = str(e)

    return result
