import os
import json
from typing import TypedDict, List, Dict, Any
from datetime import datetime
from dotenv import load_dotenv
from groq import Groq
from langgraph.graph import StateGraph, END
from backend.graph.schema import get_neo4j_driver
from backend.retrieval.graphrag import retrieve_hybrid_context, get_rca_chain
from backend.verification.grounding import evaluate_grounding

# Load env variables from root directory
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(dotenv_path)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

class AgentState(TypedDict):
    query: str
    query_type: str  # "general", "rca", "compliance"
    extracted_entities: List[Dict[str, Any]]
    graph_context: str
    vector_context: str
    answer_draft: str
    grounding_result: Dict[str, Any]
    final_response: str
    causal_chain: List[Dict[str, Any]]
    audit_trail: List[Dict[str, Any]]

def orchestrator_node(state: AgentState) -> Dict[str, Any]:
    query = state["query"]
    query_lower = query.lower()
    
    # Classify query type
    if any(k in query_lower for k in ["why did", "root cause", "failure", "fail", "symptom", "rca"]):
        q_type = "rca"
    elif any(k in query_lower for k in ["regulation", "compliance", "governed by", "rule", "standard", "sop"]):
        q_type = "compliance"
    else:
        q_type = "general"
        
    audit_record = {
        "agent_name": "OrchestratorAgent",
        "action_taken": f"Classified query type as: {q_type}",
        "timestamp": datetime.now().isoformat()
    }
    
    return {
        "query_type": q_type,
        "audit_trail": state.get("audit_trail", []) + [audit_record]
    }

def retrieval_router_node(state: AgentState) -> Dict[str, Any]:
    query = state["query"]
    
    # Call hybrid retrieval
    retrieval_data = retrieve_hybrid_context(query)
    
    audit_record = {
        "agent_name": "RetrievalRouterAgent",
        "action_taken": f"Retrieved hybrid context. Found {len(retrieval_data['entities'])} entities.",
        "timestamp": datetime.now().isoformat()
    }
    
    return {
        "extracted_entities": retrieval_data["entities"],
        "graph_context": retrieval_data["graph_context"],
        "vector_context": retrieval_data["vector_context"],
        "causal_chain": retrieval_data["rca_chain"],
        "audit_trail": state.get("audit_trail", []) + [audit_record]
    }

def rca_node(state: AgentState) -> Dict[str, Any]:
    query = state["query"]
    entities = state.get("extracted_entities", [])
    
    # Get structured causal chain
    chain = get_rca_chain(query, entities)
    
    audit_record = {
        "agent_name": "RCAAgent",
        "action_taken": f"Constructed causal chain with {len(chain)} links.",
        "timestamp": datetime.now().isoformat()
    }
    
    return {
        "causal_chain": chain,
        "audit_trail": state.get("audit_trail", []) + [audit_record]
    }

def compliance_node(state: AgentState) -> Dict[str, Any]:
    driver = get_neo4j_driver()
    entities = state.get("extracted_entities", [])
    
    # Direct query Neo4j for Regulation relationships
    # Gather any governed equipment and regulation details directly
    cypher = """
    MATCH (e:Equipment)-[r:GOVERNED_BY]->(reg:Regulation)
    RETURN e.name as equipment, reg.name as regulation
    """
    
    records_str = []
    try:
        with driver.session() as session:
            result = session.run(cypher)
            for record in result:
                records_str.append(f"Equipment '{record.get('equipment')}' is GOVERNED BY Regulation '{record.get('regulation')}'")
    except Exception as e:
        records_str.append(f"Failed to query compliance data from Neo4j: {str(e)}")
        
    if not records_str:
        response_text = "COMPLIANCE REPORT: No governing regulations found in the knowledge graph."
    else:
        response_text = "VERIFIED COMPLIANCE REPORT (Direct Graph Query):\n" + "\n".join([f"- {r}" for r in records_str])
        
    audit_record = {
        "agent_name": "ComplianceAgent",
        "action_taken": "Bypassed LLM generation. Queried Neo4j directly for regulation links.",
        "timestamp": datetime.now().isoformat()
    }
    
    return {
        "answer_draft": response_text,
        "final_response": response_text,
        "audit_trail": state.get("audit_trail", []) + [audit_record]
    }

def answer_generation_node(state: AgentState) -> Dict[str, Any]:
    query = state["query"]
    graph_ctx = state.get("graph_context", "")
    vector_ctx = state.get("vector_context", "")
    
    if not GROQ_API_KEY:
        draft = "Groq API key is not configured. Unable to draft response."
    else:
        client = Groq(api_key=GROQ_API_KEY)
        
        prompt = (
            "You are an Industrial Knowledge Intelligence reasoning agent.\n"
            "Answer the user query as accurately as possible using only the provided context.\n"
            "If the context does not contain enough information, explain what is missing.\n\n"
            "--- KNOWLEDGE GRAPH CONTEXT ---\n"
            f"{graph_ctx}\n\n"
            "--- DOCUMENT VECTOR CONTEXT ---\n"
            f"{vector_ctx}\n\n"
            f"Query: {query}"
        )
        
        try:
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0
            )
            draft = response.choices[0].message.content
        except Exception as e:
            draft = f"Failed to generate answer from Groq: {str(e)}"
            
    audit_record = {
        "agent_name": "AnswerGenerationAgent",
        "action_taken": "Generated draft response using Groq Llama-3.3.",
        "timestamp": datetime.now().isoformat()
    }
    
    return {
        "answer_draft": draft,
        "audit_trail": state.get("audit_trail", []) + [audit_record]
    }

def citation_verifier_node(state: AgentState) -> Dict[str, Any]:
    draft = state.get("answer_draft", "")
    
    # We retrieve the original citations from vector store matching the docs we query
    # To fetch the source chunks, we extract them from vector_context
    # But since vector_store chunks are in state, let's query the vector store directly inside verify if needed,
    # or pass a formatted list of chunks from graphrag.
    # To do this cleanly, we can call evaluate_grounding. Since grounding.py queries the vector store,
    # we can pass it the query itself to find matching chunks, or parse vector_context.
    # Let's run a similarity search again inside grounding, or pass the citations from state.
    # Let's pass the matching chunks. To get the matching chunks, we can run query_vector_store.
    from backend.retrieval.vector_store import query_vector_store
    retrieved_chunks = query_vector_store(state["query"], top_k=5)
    
    grounding_data = evaluate_grounding(draft, retrieved_chunks)
    
    audit_record = {
        "agent_name": "CitationVerifierAgent",
        "action_taken": f"Evaluated grounding. Score: {grounding_data['overall_score'] * 100:.0f}%. Found {len(grounding_data['conflicts'])} conflicts.",
        "timestamp": datetime.now().isoformat()
    }
    
    return {
        "grounding_result": grounding_data,
        "final_response": draft,
        "audit_trail": state.get("audit_trail", []) + [audit_record]
    }

# Routing function for Orchestrator
def orchestrator_router(state: AgentState):
    q_type = state.get("query_type", "general")
    if q_type == "compliance":
        return "compliance"
    else:
        return "retrieval_router"

# Routing function for RetrievalRouter
def retrieval_router_decider(state: AgentState):
    q_type = state.get("query_type", "general")
    if q_type == "rca":
        return "rca"
    else:
        return "answer_generation"

# Build LangGraph workflow
workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("orchestrator", orchestrator_node)
workflow.add_node("retrieval_router", retrieval_router_node)
workflow.add_node("rca", rca_node)
workflow.add_node("compliance", compliance_node)
workflow.add_node("answer_generation", answer_generation_node)
workflow.add_node("citation_verifier", citation_verifier_node)

# Set Entry Point
workflow.set_entry_point("orchestrator")

# Add Conditional Edges
workflow.add_conditional_edges(
    "orchestrator",
    orchestrator_router,
    {
        "compliance": "compliance",
        "retrieval_router": "retrieval_router"
    }
)

workflow.add_conditional_edges(
    "retrieval_router",
    retrieval_router_decider,
    {
        "rca": "rca",
        "answer_generation": "answer_generation"
    }
)

# Static edges
workflow.add_edge("rca", "answer_generation")
workflow.add_edge("answer_generation", "citation_verifier")
workflow.add_edge("compliance", "citation_verifier")
workflow.add_edge("citation_verifier", END)

# Compile
compiled_graph = workflow.compile()

def run_agent_pipeline(query: str) -> dict:
    initial_state = {
        "query": query,
        "query_type": "general",
        "extracted_entities": [],
        "graph_context": "",
        "vector_context": "",
        "answer_draft": "",
        "grounding_result": {},
        "final_response": "",
        "causal_chain": [],
        "audit_trail": []
    }
    
    result = compiled_graph.invoke(initial_state)
    return result
