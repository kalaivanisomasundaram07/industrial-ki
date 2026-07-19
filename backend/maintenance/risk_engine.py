import os
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv
from groq import Groq

dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(dotenv_path)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")


def get_equipment_risk_data(driver) -> list:
    """Pull per-equipment failure, symptom, and action counts from Neo4j."""
    results = []
    cutoff = (datetime.now() - timedelta(days=90)).isoformat()

    cypher = """
    MATCH (e:Equipment)
    OPTIONAL MATCH (e)<-[:PART_OF]-(c:Component)<-[:CAUSED_BY]-(f:Failure)
    OPTIONAL MATCH (f)-[:EXHIBITED_SYMPTOM]->(s:Symptom)
    OPTIONAL MATCH (f)<-[:RESOLVED]-(a:Action)
    WITH e,
         count(DISTINCT f) AS failure_count,
         count(DISTINCT s) AS symptom_count,
         count(DISTINCT a) AS action_count,
         collect(DISTINCT f.name) AS failure_names,
         collect(DISTINCT a.name) AS action_names
    RETURN e.name AS equipment_name,
           failure_count,
           symptom_count,
           action_count,
           failure_names,
           action_names
    ORDER BY failure_count DESC
    """

    try:
        with driver.session() as session:
            result = session.run(cypher)
            for record in result:
                eq_name = record.get("equipment_name")
                if not eq_name:
                    continue

                failure_count = record.get("failure_count", 0)
                symptom_count = record.get("symptom_count", 0)
                action_count = record.get("action_count", 0)
                failure_names = record.get("failure_names", [])
                action_names = record.get("action_names", [])

                # Unresolved = failures exist but fewer actions than failures
                has_unresolved = failure_count > 0 and action_count < failure_count
                unresolved_penalty = 1.0 if has_unresolved else 0.0

                # Normalise counts to 0-1 scale (cap at 10)
                norm_failures = min(failure_count / 10.0, 1.0)
                norm_symptoms = min(symptom_count / 10.0, 1.0)

                risk_score = round(
                    norm_failures * 0.4 + norm_symptoms * 0.3 + unresolved_penalty * 0.3, 3
                )

                if risk_score > 0.7:
                    risk_level = "HIGH"
                elif risk_score >= 0.4:
                    risk_level = "MEDIUM"
                else:
                    risk_level = "LOW"

                results.append({
                    "equipment_name": eq_name,
                    "risk_score": risk_score,
                    "risk_level": risk_level,
                    "failure_count": failure_count,
                    "symptom_count": symptom_count,
                    "action_count": action_count,
                    "has_unresolved": has_unresolved,
                    "failure_names": [n for n in failure_names if n],
                    "action_names": [n for n in action_names if n],
                    "last_failure_date": None,   # Neo4j schema has no timestamp on failures yet
                    "explanation": "",           # filled in by LLM below
                })
    except Exception as e:
        print(f"Risk engine Neo4j query failed: {e}")

    return results


def generate_explanation(item: dict) -> str:
    """Generate a natural language maintenance recommendation using Groq."""
    if not GROQ_API_KEY:
        unresolved_str = "1 unresolved failure." if item["has_unresolved"] else "All failures resolved."
        return (
            f"{item['equipment_name']}: {item['failure_count']} failure(s) detected, "
            f"{item['symptom_count']} symptom(s) recorded. {unresolved_str} "
            f"Risk level: {item['risk_level']}."
        )

    client = Groq(api_key=GROQ_API_KEY)
    prompt = (
        f"You are an industrial maintenance expert. Write a concise 1-2 sentence maintenance recommendation for the following equipment status.\n"
        f"Equipment: {item['equipment_name']}\n"
        f"Failures detected: {item['failure_count']} ({', '.join(item['failure_names'][:3]) or 'none named'})\n"
        f"Symptoms recorded: {item['symptom_count']}\n"
        f"Actions taken: {item['action_count']}\n"
        f"Has unresolved failures: {item['has_unresolved']}\n"
        f"Risk level: {item['risk_level']}\n"
        "Return ONLY the recommendation sentence(s), no preamble."
    )

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=120,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Groq explanation failed for {item['equipment_name']}: {e}")
        return (
            f"{item['equipment_name']}: {item['failure_count']} failure(s), "
            f"{item['symptom_count']} symptom(s). Risk: {item['risk_level']}."
        )


def compute_risk_dashboard(driver) -> list:
    """Main entry point — returns full risk dashboard list."""
    items = get_equipment_risk_data(driver)

    for item in items:
        item["explanation"] = generate_explanation(item)

    return items
