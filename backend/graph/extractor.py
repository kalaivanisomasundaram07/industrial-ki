import os
import json
import uuid
import re
import sqlite3
from dotenv import load_dotenv
from groq import Groq
from backend.graph.schema import get_neo4j_driver
from backend.ingestion.parser import get_sqlite_conn

# Load env variables from root directory
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(dotenv_path)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Allowable node types and relationship mappings
VALID_LABELS = {"Equipment", "Component", "Failure", "Symptom", "Action", "Procedure", "Regulation", "Engineer", "Document"}
VALID_RELATIONS = {
    "PART_OF",
    "CAUSED_BY",
    "EXHIBITED_SYMPTOM",
    "RESOLVED",
    "PERFORMED_BY",
    "GOVERNED_BY",
    "MAINTAINED_BY",
    "DOCUMENTED_IN"
}

def clean_json_response(text: str) -> str:
    # Remove markdown code blocks if present
    match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    match_any = re.search(r"```\s*(.*?)\s*```", text, re.DOTALL)
    if match_any:
        return match_any.group(1).strip()
    return text.strip()

def check_corroboration(entity1: dict, relation: str, entity2: dict, current_doc_id: str) -> bool:
    # 1. Check in Neo4j if relationship exists with a different doc_id
    driver = get_neo4j_driver()
    e1_type = entity1.get("type")
    e1_name = entity1.get("name")
    e2_type = entity2.get("type")
    e2_name = entity2.get("name")
    
    if e1_type not in VALID_LABELS or e2_type not in VALID_LABELS or relation not in VALID_RELATIONS:
        return False
        
    cypher = f"""
    MATCH (e1:{e1_type} {{name: $name1}})-[r:{relation}]->(e2:{e2_type} {{name: $name2}})
    RETURN r.source_docs AS source_docs
    """
    
    try:
        with driver.session() as session:
            result = session.run(cypher, name1=e1_name, name2=e2_name)
            for record in result:
                source_docs = record.get("source_docs", [])
                if source_docs:
                    # If there's another document ID in the source docs list
                    if any(doc_id != current_doc_id for doc_id in source_docs):
                        return True
    except Exception as e:
        print(f"Neo4j corroboration check failed: {e}")
        
    # 2. Check in SQLite review_queue for same triple from a different doc_id
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT doc_id, triple_json FROM review_queue WHERE doc_id != ?", (current_doc_id,))
        rows = cursor.fetchall()
        for row in rows:
            try:
                t_data = json.loads(row["triple_json"])
                # Compare triple fields
                if (t_data.get("entity1", {}).get("name") == e1_name and 
                    t_data.get("entity1", {}).get("type") == e1_type and
                    t_data.get("relation") == relation and
                    t_data.get("entity2", {}).get("name") == e2_name and
                    t_data.get("entity2", {}).get("type") == e2_type):
                    return True
            except:
                continue
    except Exception as e:
        print(f"SQLite corroboration check failed: {e}")
    finally:
        conn.close()
        
    return False

def commit_triple_to_neo4j(entity1: dict, relation: str, entity2: dict, confidence: float, doc_id: str, doc_filename: str):
    driver = get_neo4j_driver()
    e1_type = entity1.get("type")
    e1_name = entity1.get("name")
    e2_type = entity2.get("type")
    e2_name = entity2.get("name")
    
    if e1_type not in VALID_LABELS or e2_type not in VALID_LABELS or relation not in VALID_RELATIONS:
        print(f"Skipping commit of invalid triple labels/relations: {e1_type} - {relation} - {e2_type}")
        return
        
    # Standard cypher to merge nodes and relationships
    cypher_merge = f"""
    MERGE (e1:{e1_type} {{name: $name1}})
    MERGE (e2:{e2_type} {{name: $name2}})
    MERGE (e1)-[r:{relation}]->(e2)
    ON CREATE SET r.confidence = $confidence, r.source_docs = [$doc_id]
    ON MATCH SET r.confidence = apoc.coll.max([r.confidence, $confidence]),
                 r.source_docs = case when not $doc_id in r.source_docs then r.source_docs + $doc_id else r.source_docs end
    """
    
    # Custom non-apoc version of ON MATCH fallback just in case APOC is not installed:
    cypher_merge_standard = f"""
    MERGE (e1:{e1_type} {{name: $name1}})
    MERGE (e2:{e2_type} {{name: $name2}})
    MERGE (e1)-[r:{relation}]->(e2)
    ON CREATE SET r.confidence = $confidence, r.source_docs = [$doc_id]
    ON MATCH SET r.confidence = case when $confidence > coalesce(r.confidence, 0) then $confidence else r.confidence end,
                 r.source_docs = case when not $doc_id in coalesce(r.source_docs, []) then coalesce(r.source_docs, []) + $doc_id else r.source_docs end
    """
    
    # Also merge Document node and link Failure to Document if applicable
    cypher_doc = """
    MERGE (d:Document {name: $doc_filename})
    ON CREATE SET d.id = $doc_id
    """
    
    cypher_fail_doc = """
    MATCH (f:Failure {name: $fail_name})
    MATCH (d:Document {name: $doc_filename})
    MERGE (f)-[r:DOCUMENTED_IN]->(d)
    """

    try:
        with driver.session() as session:
            # Run node and relationship merge
            session.run(cypher_merge_standard, name1=e1_name, name2=e2_name, confidence=confidence, doc_id=doc_id)
            # Run document merge
            session.run(cypher_doc, doc_filename=doc_filename, doc_id=doc_id)
            # If entity1 or entity2 is a Failure, link to Document
            if e1_type == "Failure":
                session.run(cypher_fail_doc, fail_name=e1_name, doc_filename=doc_filename)
            if e2_type == "Failure":
                session.run(cypher_fail_doc, fail_name=e2_name, doc_filename=doc_filename)
    except Exception as e:
        print(f"Failed to commit triple to Neo4j: {e}")

def extract_and_gate_triples(doc_id: str, filename: str, raw_text: str, reliability_weight: float):
    if not GROQ_API_KEY:
        print("Groq API key is not configured. Skipping extraction.")
        return []
        
    client = Groq(api_key=GROQ_API_KEY)
    
    # Format a prompt guiding Groq to return only the requested JSON list
    system_prompt = (
        "You are an expert knowledge graph extractor for industrial documents.\n"
        "Your task is to extract entity-relation triples from the provided document.\n"
        f"The valid Node Types are: {', '.join(VALID_LABELS)}\n"
        f"The valid Relationship Types are: {', '.join(VALID_RELATIONS)}\n"
        "Ensure all extracted node types and relationship types match the allowed lists exactly.\n"
        "For each triple, provide: \n"
        "1. entity1: {type, name}\n"
        "2. relation: must be one of the relationship types\n"
        "3. entity2: {type, name}\n"
        "4. confidence: a score between 0.0 and 1.0 indicating LLM confidence\n"
        "5. source_sentence: the sentence from the text containing this relationship\n\n"
        "Return ONLY a raw JSON object with a single key 'triples' containing the array of triples:\n"
        '{"triples": [{"entity1": {"type": "Equipment", "name": "Pump A"}, "relation": "PART_OF", "entity2": {"type": "Equipment", "name": "Cooling System"}, "confidence": 0.9, "source_sentence": "..."}]}'
    )
    
    user_prompt = f"Extract triples from this document:\n\n{raw_text[:8000]}" # Limit chunk size to avoid hitting tokens limit
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.0,
            response_format={"type": "json_object"}
        )
        
        response_text = response.choices[0].message.content
        cleaned_json = clean_json_response(response_text)
        data = json.loads(cleaned_json)
        triples = data.get("triples", [])
    except Exception as e:
        print(f"Groq API or JSON parsing failed for {filename}: {e}")
        return []
        
    results = []
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    
    for triple in triples:
        entity1 = triple.get("entity1", {})
        relation = triple.get("relation", "")
        entity2 = triple.get("entity2", {})
        llm_confidence = triple.get("confidence", 0.5)
        source_sentence = triple.get("source_sentence", "")
        
        # Verify node types and relations
        e1_type = entity1.get("type")
        e2_type = entity2.get("type")
        if e1_type not in VALID_LABELS or e2_type not in VALID_LABELS or relation not in VALID_RELATIONS:
            print(f"Discarding invalid triple types in {filename}: ({e1_type}) -[{relation}]-> ({e2_type})")
            continue
            
        # Calculate final confidence
        final_confidence = (llm_confidence * 0.6) + (reliability_weight * 0.4)
        
        # Corroboration check
        if check_corroboration(entity1, relation, entity2, doc_id):
            final_confidence = min(1.0, final_confidence + 0.15)
            
        triple["final_confidence"] = final_confidence
        
        # Confidence gating
        if final_confidence >= 0.75:
            # Auto-commit to Neo4j
            print(f"Auto-committing triple with confidence {final_confidence:.2f}: {entity1.get('name')} -[{relation}]-> {entity2.get('name')}")
            commit_triple_to_neo4j(entity1, relation, entity2, final_confidence, doc_id, filename)
            triple["gating_status"] = "auto-committed"
        elif final_confidence >= 0.50:
            # SQLite review queue
            queue_id = str(uuid.uuid4())
            triple_str = json.dumps({
                "entity1": entity1,
                "relation": relation,
                "entity2": entity2,
                "confidence": final_confidence
            })
            print(f"Queueing triple with confidence {final_confidence:.2f} to review queue.")
            try:
                cursor.execute("""
                    INSERT INTO review_queue (id, triple_json, evidence_snippet, doc_id, score, status)
                    VALUES (?, ?, ?, ?, ?, 'pending')
                """, (queue_id, triple_str, source_sentence, doc_id, final_confidence))
                conn.commit()
            except Exception as se:
                print(f"Failed to queue triple in SQLite: {se}")
            triple["gating_status"] = "queued"
        else:
            # Discard
            print(f"Discarding triple with low confidence {final_confidence:.2f}")
            triple["gating_status"] = "discarded"
            
        results.append(triple)
        
    conn.close()
    return results
