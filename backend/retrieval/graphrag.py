import os
import json
import re
from dotenv import load_dotenv
from groq import Groq
from backend.graph.schema import get_neo4j_driver
from backend.retrieval.vector_store import query_vector_store

# Load env variables from root directory
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(dotenv_path)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def extract_entities_from_query(query: str) -> list:
    """Uses Groq to extract potential entities and their types from the search query."""
    if not GROQ_API_KEY:
        return []
        
    client = Groq(api_key=GROQ_API_KEY)
    
    prompt = (
        "Identify and extract all industrial entity names from the following user query.\n"
        "Assign them a type (Equipment, Component, Failure, Symptom, Action, Procedure, Regulation, Engineer, Document).\n"
        "Return ONLY a raw JSON object with a single key 'entities' containing the list of entity objects:\n"
        '{"entities": [{"name": "Boiler-12", "type": "Equipment"}, {"name": "steam leak", "type": "Failure"}]}\n\n'
        f"Query: {query}"
    )
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            response_format={"type": "json_object"}
        )
        
        text = response.choices[0].message.content.strip()
        # Clean markdown code blocks if present
        if text.startswith("```"):
            text = re.sub(r"^```json\s*", "", text)
            text = re.sub(r"^```\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            
        data = json.loads(text.strip())
        return data.get("entities", [])
    except Exception as e:
        print(f"Failed to extract entities from query: {e}")
        return []

def query_neo4j_subgraph(entities: list) -> str:
    """Given a list of entities, returns a text representation of the 2-hop subgraphs around them in Neo4j."""
    driver = get_neo4j_driver()
    relationships_text = []
    seen_relations = set()
    
    for entity in entities:
        name = entity.get("name")
        if not name:
            continue
            
        # Match nodes up to 2 hops away, case-insensitive
        cypher = """
        MATCH (n) WHERE toLower(n.name) = toLower($name)
        MATCH path = (n)-[r*1..2]-(m)
        RETURN path LIMIT 25
        """
        
        try:
            with driver.session() as session:
                result = session.run(cypher, name=name)
                for record in result:
                    path = record.get("path")
                    if path:
                        # Iterate through relationships in the path
                        for rel in path.relationships:
                            start_node = rel.start_node
                            end_node = rel.end_node
                            
                            # Node details
                            s_label = list(start_node.labels)[0] if start_node.labels else "Entity"
                            s_name = start_node.get("name", "Unknown")
                            e_label = list(end_node.labels)[0] if end_node.labels else "Entity"
                            e_name = end_node.get("name", "Unknown")
                            r_type = rel.type
                            
                            rel_str = f"({s_label}: {s_name}) -[:{r_type}]-> ({e_label}: {e_name})"
                            if rel_str not in seen_relations:
                                seen_relations.add(rel_str)
                                relationships_text.append(rel_str)
        except Exception as e:
            print(f"Error traversing Neo4j for {name}: {e}")
            
    if not relationships_text:
        return "No matching relationships found in knowledge graph."
        
    return "\n".join(relationships_text)

def get_rca_chain(query: str, entities: list) -> list:
    """Checks if the query is an RCA query and returns a structured causal chain from Neo4j."""
    query_lower = query.lower()
    is_rca = any(k in query_lower for k in ["why did", "root cause", "failure", "fail", "symptom", "rca"])
    
    if not is_rca:
        return []
        
    # Find any Equipment node in entities or text
    eq_name = None
    for entity in entities:
        if entity.get("type") == "Equipment":
            eq_name = entity.get("name")
            break
            
    driver = get_neo4j_driver()
    
    # If no Equipment found in entities, look up all Equipment nodes and substring-match them
    if not eq_name:
        try:
            with driver.session() as session:
                result = session.run("MATCH (e:Equipment) RETURN e.name as name")
                for record in result:
                    name = record.get("name")
                    if name and name.lower() in query_lower:
                        eq_name = name
                        break
        except Exception as e:
            print(f"Failed to fetch equipment names for RCA: {e}")
            
    if not eq_name:
        return []
        
    # Query causal chain
    cypher = """
    MATCH (e:Equipment {name: $name})<-[:PART_OF]-(c:Component)<-[:CAUSED_BY]-(f:Failure)-[:EXHIBITED_SYMPTOM]->(s:Symptom)
    OPTIONAL MATCH (f)<-[:RESOLVED]-(a:Action)
    RETURN e.name as equipment, c.name as component, f.name as failure, s.name as symptom, a.name as action
    """
    
    chain = []
    try:
        with driver.session() as session:
            result = session.run(cypher, name=eq_name)
            for record in result:
                chain.append({
                    "equipment": record.get("equipment"),
                    "component": record.get("component"),
                    "failure": record.get("failure"),
                    "symptom": record.get("symptom"),
                    "action": record.get("action")
                })
    except Exception as e:
        print(f"Failed to execute RCA query for {eq_name}: {e}")
        
    return chain

def retrieve_hybrid_context(query: str) -> dict:
    """Runs entity extraction, Neo4j traversals, ChromaDB similarity search, and combines context."""
    entities = extract_entities_from_query(query)
    
    # 1. Neo4j Traversal (if entities found)
    graph_context = "No entity context found."
    if entities:
        graph_context = query_neo4j_subgraph(entities)
        
    # 2. Vector Store Similarity Search (always run)
    vector_results = query_vector_store(query, top_k=5)
    vector_context_list = []
    citations = []
    for res in vector_results:
        text = res["chunk_text"]
        filename = res["metadata"].get("filename", "Unknown File")
        vector_context_list.append(f"[{filename}]: {text}")
        citations.append({
            "chunk_text": text,
            "filename": filename
        })
        
    vector_context = "\n\n".join(vector_context_list) if vector_context_list else "No relevant documents found."
    
    # 3. Combine contexts
    combined_context = f"--- KNOWLEDGE GRAPH CONTEXT ---\n{graph_context}\n\n--- DOCUMENT VECTOR CONTEXT ---\n{vector_context}"
    
    # 4. Check for RCA structure
    rca_chain = get_rca_chain(query, entities)
    
    return {
        "entities": entities,
        "graph_context": graph_context,
        "vector_context": vector_context,
        "combined_context": combined_context,
        "citations": citations,
        "rca_chain": rca_chain
    }
