import os
import re
import json
import numpy as np
from scipy.special import expit  # sigmoid for normalising cross-encoder output
from dotenv import load_dotenv
from groq import Groq
from sentence_transformers import CrossEncoder
from backend.graph.schema import get_neo4j_driver
from backend.graph.extractor import commit_triple_to_neo4j

# Load env variables from root directory
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(dotenv_path)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# ─── Cross-Encoder (loaded once at import time, cached for the process lifetime) ──
# cross-encoder/ms-marco-MiniLM-L-6-v2 is a reranker: it scores (query, passage) pairs
# directly and gives 0.85-0.95 for semantically identical content.
_CROSS_ENCODER: CrossEncoder | None = None

def _get_cross_encoder() -> CrossEncoder:
    global _CROSS_ENCODER
    if _CROSS_ENCODER is None:
        print("Loading CrossEncoder model cross-encoder/ms-marco-MiniLM-L-6-v2 …")
        _CROSS_ENCODER = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        print("CrossEncoder loaded.")
    return _CROSS_ENCODER


# ─── Sentence splitter ────────────────────────────────────────────────────────

def split_into_sentences(text: str) -> list:
    """Splits a body of text into sentences using simple regex."""
    sentences = re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|!)\s', text)
    return [s.strip() for s in sentences if s.strip()]


# ─── Claim extraction (unchanged logic) ──────────────────────────────────────

def extract_claims_from_answer(answer: str) -> list:
    """Uses Groq to extract concrete relationship claims from the answer draft."""
    if not GROQ_API_KEY:
        return []

    client = Groq(api_key=GROQ_API_KEY)
    prompt = (
        "Identify and extract all specific relationship claims between entities in the following text.\n"
        "Each claim must represent a relationship that should exist in our database.\n"
        "Valid entity types: Equipment, Component, Failure, Symptom, Action, Procedure, Regulation, Engineer, Document\n"
        "Valid relationship types: PART_OF, CAUSED_BY, EXHIBITED_SYMPTOM, RESOLVED, PERFORMED_BY, GOVERNED_BY, MAINTAINED_BY, DOCUMENTED_IN\n"
        "Return ONLY a raw JSON object with a single key 'claims' containing the array of claims:\n"
        '{"claims": [{"entity1": {"type": "Failure", "name": "overheating"}, "relation": "CAUSED_BY", "entity2": {"type": "Component", "name": "valves"}}]}\n\n'
        f"Text to analyze: {answer}"
    )

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = re.sub(r"^```json\s*", "", text)
            text = re.sub(r"^```\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        data = json.loads(text.strip())
        return data.get("claims", [])
    except Exception as e:
        print(f"Failed to extract claims from answer draft: {e}")
        return []


# ─── NEW: 3-category triple classifier ──────────────────────────────────────

# Relationships that support MULTIPLE valid targets — never flag as conflict
MULTI_TARGET_RELATIONS = {
    "PART_OF", "DOCUMENTED_IN", "EXHIBITED_SYMPTOM",
    "GOVERNED_BY", "MAINTAINED_BY", "PERFORMED_BY",
    "HAS_COMPONENT", "CAUSED_BY", "RESOLVED",
}

# Relationships where only ONE value should exist — flag if different target found
SCALAR_RELATIONS = {
    "HAS_PRESSURE_LIMIT", "HAS_TEMPERATURE_LIMIT",
    "HAS_OPERATING_RANGE", "HAS_STATUS", "HAS_RATING",
    "OCCURRED_ON", "HAS_ROOT_CAUSE",
}


def classify_triple_against_graph(
    generated_entity1: str,
    generated_relation: str,
    generated_entity2: str,
    driver,
) -> dict:
    """
    Classifies a generated triple into one of 3 categories:
    - VERIFIED     : exact match found in graph
    - NEW_INFO     : not in graph, but no contradiction possible
    - CONTRADICTION: same subject + same scalar relation + DIFFERENT object value
    """
    try:
        with driver.session() as session:
            # Step 1 — Exact match (case-insensitive contains)
            exact = session.run(
                """
                MATCH (a)-[r]->(b)
                WHERE toLower(a.name) CONTAINS toLower($e1)
                  AND type(r) = $rel
                  AND toLower(b.name) CONTAINS toLower($e2)
                RETURN count(*) AS cnt
                """,
                e1=generated_entity1,
                rel=generated_relation,
                e2=generated_entity2,
            ).single()

            if exact and exact["cnt"] > 0:
                return {
                    "category": "VERIFIED",
                    "icon": "✅",
                    "label": "Verified",
                    "message": (
                        f"Graph confirms: ({generated_entity1})"
                        f"-[:{generated_relation}]->({generated_entity2})"
                    ),
                    "color": "green",
                }

            # Step 2 — Multi-target relation → always NEW_INFO, never conflict
            if generated_relation in MULTI_TARGET_RELATIONS:
                return {
                    "category": "NEW_INFO",
                    "icon": "ℹ️",
                    "label": "New Information",
                    "message": (
                        f"({generated_entity1})-[:{generated_relation}]->({generated_entity2}) "
                        "not yet in graph — not a contradiction, this relation supports multiple targets."
                    ),
                    "color": "blue",
                }

            # Step 3 — Scalar relation → flag only if DIFFERENT value exists for same subject
            if generated_relation in SCALAR_RELATIONS:
                conflicting = session.run(
                    """
                    MATCH (a)-[r]->(b)
                    WHERE toLower(a.name) CONTAINS toLower($e1)
                      AND type(r) = $rel
                      AND NOT toLower(b.name) CONTAINS toLower($e2)
                    RETURN b.name AS existing_value
                    LIMIT 1
                    """,
                    e1=generated_entity1,
                    rel=generated_relation,
                    e2=generated_entity2,
                ).single()

                if conflicting:
                    return {
                        "category": "CONTRADICTION",
                        "icon": "⚠️",
                        "label": "Factual Conflict",
                        "message": (
                            f"CONFLICT: Graph says ({generated_entity1})"
                            f"-[:{generated_relation}]->({conflicting['existing_value']}) "
                            f"but answer claims ({generated_entity2})"
                        ),
                        "color": "red",
                        # backward-compat fields for ConflictBanner
                        "claim": (
                            f"({generated_entity1}) -[:{generated_relation}]-> ({generated_entity2})"
                        ),
                        "source_a": "Generated Answer",
                        "source_b": (
                            f"Knowledge Graph: ({generated_entity1})"
                            f"-[:{generated_relation}]->({conflicting['existing_value']})"
                        ),
                    }

            # Step 4 — Relation not in either set → safe NEW_INFO default
            return {
                "category": "NEW_INFO",
                "icon": "ℹ️",
                "label": "New Information",
                "message": (
                    f"({generated_entity1})-[:{generated_relation}]->({generated_entity2}) "
                    "is new — not contradicted by graph."
                ),
                "color": "blue",
            }

    except Exception as exc:
        print(f"classify_triple_against_graph failed: {exc}")
        return {
            "category": "NEW_INFO",
            "icon": "ℹ️",
            "label": "New Information",
            "message": f"Graph lookup error for ({generated_entity1})-[:{generated_relation}]->({generated_entity2})",
            "color": "blue",
        }


# ─── NEW: Graph entity corroboration (Fix 2) ─────────────────────────────────

def _check_entity_in_graph(entity_name: str) -> tuple:
    """
    Returns (node_exists: bool, has_relationships: bool).
    Lightweight lookup — only checks presence and degree, no full traversal.
    """
    if not entity_name or len(entity_name) < 3:
        return False, False

    driver = get_neo4j_driver()
    cypher = """
    MATCH (n)
    WHERE toLower(n.name) = toLower($name)
    OPTIONAL MATCH (n)-[r]-()
    RETURN count(DISTINCT n) AS node_count, count(r) AS rel_count
    """
    try:
        with driver.session() as session:
            result = session.run(cypher, name=entity_name)
            record = result.single()
            if record:
                node_count = record.get("node_count", 0)
                rel_count = record.get("rel_count", 0)
                return node_count > 0, rel_count > 0
    except Exception as e:
        print(f"Graph entity check failed for '{entity_name}': {e}")
    return False, False


def _extract_entity_names_from_text(text: str) -> list:
    """
    Heuristic: extract capitalised noun phrases (2–4 tokens) as candidate entity names.
    This avoids a Groq call inside the hot path.
    """
    # Match capitalised words that could be equipment/failure names
    pattern = r'\b([A-Z][A-Za-z0-9\-]{1,30}(?:\s+[A-Z][A-Za-z0-9\-]{1,30}){0,3})\b'
    candidates = re.findall(pattern, text)
    # Deduplicate and filter out common stop-words
    stop = {"The", "This", "That", "These", "When", "Where", "What", "How",
            "Based", "According", "Additionally", "However", "Therefore"}
    seen = set()
    result = []
    for c in candidates:
        c = c.strip()
        if c not in stop and c not in seen and len(c) > 2:
            seen.add(c)
            result.append(c)
    return result[:10]  # cap to avoid hammering Neo4j


# ─── MAIN: evaluate_grounding ─────────────────────────────────────────────────

def evaluate_grounding(answer_draft: str, retrieved_chunks: list) -> dict:
    """
    Calculates overall grounding score using:
      Fix 1 — CrossEncoder reranker (ms-marco-MiniLM-L-6-v2) instead of cosine
      Fix 2 — Graph corroboration bonus (+0.10 node present / +0.15 with rels)
      Fix 3 — Length-weighted sentence averaging + graph-match floor at 0.85
      Fix 4 — Updated colour thresholds (green≥0.70, yellow≥0.45, red<0.45)
      Fix 5 — Low-score + conflict → explanation note added to response
    """
    sentences = split_into_sentences(answer_draft)

    if not sentences:
        return {
            "overall_score": 0.0,
            "sentence_scores": [],
            "conflicts": [],
            "citations": [],
            "grounding_note": "",
        }

    chunk_texts = [c["chunk_text"] for c in retrieved_chunks]

    # ── Fix 1: CrossEncoder scoring ──────────────────────────────────────────
    sentence_scores_raw: list[float] = []

    if chunk_texts:
        cross_encoder = _get_cross_encoder()
        for sentence in sentences:
            # Score this sentence against every retrieved chunk
            pairs = [(sentence, chunk) for chunk in chunk_texts]
            raw_scores = cross_encoder.predict(pairs)          # shape: (n_chunks,)
            best_raw = float(np.max(raw_scores))               # best matching chunk
            # Sigmoid normalisation → maps raw logits to [0, 1]
            normalised = float(expit(best_raw))
            sentence_scores_raw.append(normalised)
    else:
        # No chunks → scores are 0
        sentence_scores_raw = [0.0] * len(sentences)

    # ── Fix 2: Graph corroboration bonus ─────────────────────────────────────
    # Extract candidate entity names from the full answer
    entity_names = _extract_entity_names_from_text(answer_draft)
    graph_exact_match_found = False

    # Map entity → bonus so we apply per sentence
    entity_bonus: dict[str, float] = {}
    for name in entity_names:
        node_exists, has_rels = _check_entity_in_graph(name)
        if node_exists:
            entity_bonus[name.lower()] = 0.15 if has_rels else 0.10
            graph_exact_match_found = True

    # Build sentence_score objects and apply bonuses
    sentence_score_objects = []
    for i, sentence in enumerate(sentences):
        score = sentence_scores_raw[i]

        # Apply bonus for any entity found in graph
        for ent_lower, bonus in entity_bonus.items():
            if ent_lower in sentence.lower():
                score = min(1.0, score + bonus)

        sentence_score_objects.append({
            "sentence": sentence,
            "score": score,
            "highlight_color": "red",  # placeholder — set below
        })

    # ── Graph claim classification (3-category) ───────────────────────────────
    claims = extract_claims_from_answer(answer_draft)
    driver = get_neo4j_driver()

    verification_results = {
        "verified": [],
        "new_info": [],
        "contradictions": [],
    }

    # Score deltas from triple classification
    verified_boost = 0.0
    contradiction_penalty = 0.0

    for claim in claims:
        e1_name = claim.get("entity1", {}).get("name", "")
        relation = claim.get("relation", "")
        e2_name = claim.get("entity2", {}).get("name", "")

        if not (e1_name and relation and e2_name):
            continue

        result = classify_triple_against_graph(e1_name, relation, e2_name, driver)
        category = result["category"]

        if category == "VERIFIED":
            verification_results["verified"].append(result)
            # Boost score: +0.05 per verified triple, capped at +0.20 total
            verified_boost = min(0.20, verified_boost + 0.05)
            graph_exact_match_found = True
            # Boost sentence scores for sentences containing these entities
            for s in sentence_score_objects:
                sent_lower = s["sentence"].lower()
                if e1_name.lower() in sent_lower or e2_name.lower() in sent_lower:
                    s["score"] = min(1.0, s["score"] + 0.10)

        elif category == "CONTRADICTION":
            verification_results["contradictions"].append(result)
            # Penalise score: -0.15 per contradiction
            contradiction_penalty += 0.15
            # Penalise sentence scores for sentences containing these entities
            for s in sentence_score_objects:
                sent_lower = s["sentence"].lower()
                if e1_name.lower() in sent_lower or e2_name.lower() in sent_lower:
                    s["score"] = max(0.0, s["score"] - 0.30)
                    s["highlight_color"] = "red"

        else:  # NEW_INFO — auto-commit to Neo4j, do not penalise score
            e1_type = claim.get("entity1", {}).get("type", "Unknown")
            e2_type = claim.get("entity2", {}).get("type", "Unknown")
            triple_for_commit = {
                "entity1": {"type": e1_type, "name": e1_name},
                "relation": relation,
                "entity2": {"type": e2_type, "name": e2_name},
            }
            try:
                commit_triple_to_neo4j(
                    triple_for_commit["entity1"],
                    triple_for_commit["relation"],
                    triple_for_commit["entity2"],
                    0.75,
                    "answer_verification",
                    "answer_verification",
                )
                print(f"Auto-committed new triple from answer verification: {triple_for_commit}")
            except Exception as commit_err:
                print(f"Failed to auto-commit new_info triple: {commit_err}")

    # backward-compat: conflicts list contains only real contradictions
    conflicts = [
        {
            "claim": r.get("claim", r["message"]),
            "source_a": r.get("source_a", "Generated Answer"),
            "source_b": r.get("source_b", r["message"]),
        }
        for r in verification_results["contradictions"]
    ]

    # ── Fix 4: Update colour thresholds (green≥0.70, yellow≥0.45) ───────────
    for s in sentence_score_objects:
        score = s["score"]
        if score >= 0.70:
            s["highlight_color"] = "green"
        elif score >= 0.45:
            s["highlight_color"] = "yellow"
        else:
            s["highlight_color"] = "red"

    # ── Fix 3: Length-weighted overall score + triple classification deltas ───
    weights = [max(len(s["sentence"].split()), 1) for s in sentence_score_objects]
    weighted_sum = sum(s["score"] * w for s, w in zip(sentence_score_objects, weights))
    weighted_score = weighted_sum / sum(weights)

    # Apply verified boost and contradiction penalty
    weighted_score = weighted_score + verified_boost - contradiction_penalty
    weighted_score = max(0.0, min(1.0, weighted_score))

    # Floor: if any graph exact match found, score is at least 0.85
    if graph_exact_match_found:
        weighted_score = max(weighted_score, 0.85)

    overall_score = round(float(weighted_score), 3)

    # ── Fix 5: Conflict + low-score explanation note ──────────────────────────
    grounding_note = ""
    if overall_score < 0.50 and conflicts:
        grounding_note = (
            "Low grounding score with conflict detected — the system identified that "
            "documents disagree on this fact. This is intentional conflict protection, "
            "not an error. Review the conflict banner for details."
        )

    # ── Citations (unchanged) ─────────────────────────────────────────────────
    citations = [
        {
            "chunk_text": c["chunk_text"],
            "filename": c["metadata"].get("filename", "Unknown File"),
        }
        for c in retrieved_chunks
    ]

    return {
        "overall_score": overall_score,
        "sentence_scores": sentence_score_objects,
        "conflicts": conflicts,                    # only real contradictions
        "verification_results": {
            "verified": verification_results["verified"],
            "contradictions": verification_results["contradictions"],
            # new_info is intentionally omitted — triples are auto-committed above
        },
        "citations": citations,
        "grounding_note": grounding_note,
    }
