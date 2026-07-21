# 🏭 Industrial Knowledge Intelligence (IKI) System
## Panel Presentation Guide

---

## 🎯 Project Overview (Say This First)

> "Our project is an **AI-powered Industrial Knowledge Intelligence System** that transforms unstructured industrial documents — maintenance logs, SOPs, compliance reports — into a **living, queryable Knowledge Graph**. It helps industrial engineers find root causes of equipment failures, monitor compliance gaps, and get verified answers in **seconds instead of hours**."

**Tech Stack at a Glance:**
| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript (Vite) |
| Backend | FastAPI (Python) |
| Knowledge Graph | Neo4j |
| Vector Search | ChromaDB |
| LLM | Claude 3.5 Sonnet (Anthropic) |
| Database | SQLite (sessions, queue, history) |

---

## 📌 Section 1 — Review Queue (`ReviewQueuePage.tsx`)

### What Is It?
The **Ingestion Review Queue** is the **human-in-the-loop gate** that ensures only verified facts enter the Knowledge Graph.

### How It Works — Technical Flow

```
Document Uploaded → AI Extracts Triples → Confidence Score Assigned
    ├── Score ≥ 0.75 → Auto-committed to Neo4j (no human needed)
    ├── Score 0.50–0.74 → Sent to Review Queue (human must decide)
    └── Score < 0.50 → Auto-rejected (too uncertain)
```

A **Triple** is the basic unit of knowledge:
```
[Entity1: Equipment: Boiler-12] -CAUSED_BY-> [Entity2: Failure: Pressure Leak]
```

### What the Engineer Sees
| Column | Meaning |
|--------|---------|
| **Proposed Relationship (Triple)** | The fact the AI extracted (e.g., "Boiler-12 → CAUSED_BY → Pressure Valve Failure") |
| **Evidence Snippet** | The exact sentence from the document that supports this fact |
| **Source Document** | Which file the fact came from |
| **Confidence %** | How certain the AI is (shown in amber — 50–74%) |
| **Approve / Reject buttons** | Engineer clicks ✅ to commit to Neo4j, or ❌ to discard |

### Why It Matters for Industrial Engineers
- ✅ **Prevents hallucinations** — no unverified AI guesses enter the system
- ✅ **Domain expert stays in control** — the engineer validates ambiguous facts
- ✅ **Audit trail** — every approval/rejection is logged
- ✅ **Builds trust** — the system learns only what the engineer confirms is true

### 🗣️ Talking Point for Panel
> *"Traditional systems accept all extracted data blindly. Our Review Queue means an industrial engineer — who understands the real plant floor context — acts as the final gate before any relationship enters the knowledge base. This is critical in safety-critical environments."*

---

## 📌 Section 2 — Maintenance Dashboard (`MaintenanceDashboard.tsx`)

### What Is It?
A **Predictive Risk Monitoring Dashboard** that automatically scores every piece of equipment using failure data stored in the Knowledge Graph.

### How It Works — Technical Flow
```
Neo4j Knowledge Graph
    → Query all Equipment nodes
    → Count: failures, symptoms, resolved actions, unresolved failures
    → Compute Risk Score (0–100%)
    → Classify: HIGH / MEDIUM / LOW risk
    → Auto-refresh every 60 seconds
```

### Risk Score Formula (Explained Simply)
The risk score is computed from the knowledge graph data:
- **More failures recorded** → higher score
- **More unresolved failures** → higher score
- **More maintenance actions taken** → lowers the score

### What the Engineer Sees

| UI Element | What It Shows |
|------------|--------------|
| **Summary cards (top)** | Count of HIGH / MEDIUM / LOW risk equipment at a glance |
| **Equipment Cards** | Each machine with: risk score bar, failure count, symptom count, resolved action count |
| **⚠️ Unresolved badge** | Red alert if failures exist with no recorded fix |
| **AI explanation** | Plain-English reason for the risk score |
| **"Ask AI" button** | One-click to open Chat with a pre-filled question about that machine |
| **Performance stats panel** | IKI query time vs. traditional search (seconds vs. 15–30 minutes!) |

### Why It Matters for Industrial Engineers
- ✅ **Proactive, not reactive** — catch equipment at risk BEFORE it breaks down
- ✅ **Single dashboard** — no need to dig through maintenance logs manually
- ✅ **Direct AI link** — click "Ask AI about Boiler-12" and instantly start a conversation
- ✅ **Quantified improvement** — shows real proof: *"IKI answers in 3.5s vs traditional 15–30 minutes"*

### 🗣️ Talking Point for Panel
> *"In a real plant, an engineer might spend 2–3 hours going through maintenance logs to determine which equipment needs priority attention. Our Maintenance Dashboard computes risk scores from the Knowledge Graph in real-time and refreshes every 60 seconds — turning a manual, time-consuming task into an instant, data-driven decision."*

---

## 📌 Section 3 — Chat Box (`ChatPage.tsx`)

### What Is It?
A **Trust-Verified AI Reasoning Engine** — not just a chatbot. Every answer is cross-checked against both the Knowledge Graph (Neo4j) and document database (ChromaDB).

### How It Works — The 5-Step Pipeline (Show This!)

```
User Question
    ↓
Step 1: Entity Extraction  →  "What entities are in this question? (Boiler-12, Pressure Valve...)"
    ↓
Step 2: Knowledge Graph Traversal  →  Queries Neo4j for relationships between entities
    ↓
Step 3: Vector Similarity Search  →  ChromaDB finds relevant document chunks
    ↓
Step 4: LLM Generation  →  Claude 3.5 Sonnet drafts the answer using both sources
    ↓
Step 5: Grounding & Fact-Check  →  Answer is verified against Knowledge Graph facts
    ↓
Final Answer with: grounding score, citations, causal chain, conflict detection
```

### What the Engineer Sees

| UI Feature | What It Does |
|------------|-------------|
| **Message Bubbles** | User question + AI answer, with sentence-level confidence highlighting |
| **Grounding Score Badge** | % of answer statements backed by your verified documents |
| **⚠️ Conflict Detection** | If AI answer contradicts Knowledge Graph → red alert shows BOTH versions side-by-side |
| **✅ Verification Panel** | Lists which facts were confirmed in the Knowledge Graph |
| **Citations Expander** | Shows exactly which page of which document the fact came from |
| **Reasoning Path Expander** | Step-by-step audit trail of every agent action taken |
| **Causal Chain View** | Structured Equipment → Component → Failure → Symptom → Action breakdown |
| **Performance Bar** | Timing breakdown (graph retrieval / vector search / LLM / verification) |
| **Chat History Sidebar** | All previous sessions saved, can resume any conversation |

### Example Questions to Demo
```
⚡ "Why did Boiler-12 fail? Explain root cause."
📖 "What standard regulations govern Boiler-12?"
🔍 "What maintenance actions were taken after the pressure valve failure?"
```

### Why It Matters for Industrial Engineers
- ✅ **Not a black box** — every claim shows its source document and page number
- ✅ **Self-correcting** — if AI hallucinates something the graph contradicts, a red conflict banner appears
- ✅ **Root Cause Analysis** — causal chain view maps Equipment → Failure → Symptom → Action automatically
- ✅ **Regulation-aware** — can answer compliance questions using ingested SOP/regulation documents
- ✅ **Persistent memory** — all queries saved; engineer can resume a session any time

### 🗣️ Talking Point for Panel
> *"Traditional search tools give you keywords and links — you still have to read and interpret. Our Chat Box gives a verified, grounded answer and tells you exactly how confident it is and where every claim came from. If the AI is wrong, the system itself flags it with a Conflict Detected banner."*

---

## 📌 Section 4 — Knowledge Graph (`GraphPage.tsx`)

### What Is It?
An **interactive visual map** of all relationships in your industrial knowledge base — connecting Equipment, Failures, Components, Symptoms, Actions, Regulations, and Engineers.

### How It Works — Technical Details
```
Neo4j Graph Database
    → Fetches all nodes + relationships
    → Renders as interactive Force-Directed 2D Graph
    → Click any node → inspect its connections in the sidebar
    → Search by equipment name to filter the subgraph
```

### Node Types & Colors (Show the Legend!)
| Color | Entity Type | Example |
|-------|------------|---------|
| 🔵 Blue | Equipment | Boiler-12, Pump-A |
| 🔴 Red | Failure | Pressure Leak, Motor Burnout |
| 🟠 Orange | Component | Pressure Valve, Bearing |
| 🟢 Green | Action | Replaced valve, Lubricated shaft |
| 🟣 Purple | Regulation | ISO 9001, OSHA Standard |
| 🩵 Teal | Symptom | Vibration, Overheating |

### Three Sidebar Tabs — Inspector / Compliance / Patterns

#### 🔍 Inspector Tab
- Click any node on the graph
- See: Entity Type, Node Name, all incoming/outgoing relationships
- Great for tracing: *"What is Boiler-12 connected to?"*

#### 📋 Compliance Tab
- Shows **Compliance Gap Table** — which equipment lacks required regulation/SOP links
- AI-generated **Compliance Report** (click "Generate Report" → full markdown report)
- Summary: equipment count, regulation count, gap count, fully compliant status

#### 📊 Patterns Tab
- **Failure Pattern Detection** — identifies recurring failure sequences across equipment
- **Failure Intelligence Summary** — total failures, components analysed, symptoms tracked
- Each pattern card has an **"Ask AI"** button to instantly query the chat

### Why It Matters for Industrial Engineers
- ✅ **Holistic view** — see all plant knowledge at once, not buried in files
- ✅ **Compliance audit** — immediately see which equipment is missing SOP/regulation links
- ✅ **Pattern discovery** — if Pump-A and Pump-B both fail with the same symptom, the pattern engine surfaces this
- ✅ **Regulatory reporting** — one-click AI-generated compliance report

### 🗣️ Talking Point for Panel
> *"Industrial facilities often have knowledge scattered across hundreds of documents. Our Knowledge Graph visualizes every relationship — between machines, components, failures, and regulations — in a single interactive map. The Compliance tab automatically identifies gaps: equipment that is not yet linked to a regulation or SOP is flagged immediately, which is incredibly valuable during audits."*

---

## 🚀 Summary Slide — How IKI Helps Industrial Engineers

| Problem (Traditional) | IKI Solution | Benefit |
|----------------------|-------------|---------|
| Root cause analysis takes 2–3 hours | Chat → answer in seconds with causal chain | ⚡ Speed |
| Risk assessment is manual and periodic | Maintenance Dashboard auto-refreshes every 60s | 📊 Proactive |
| AI answers can't be trusted blindly | Grounding score + conflict detection + citations | ✅ Trust |
| Knowledge locked in PDFs/Word docs | Knowledge Graph extracts and links all facts | 🔗 Connectivity |
| Compliance audit is manual | Compliance Gap Table + AI report generation | 📋 Audit-Ready |
| Uncertain AI extractions corrupt the database | Review Queue with human approval gate | 🛡️ Safety |

---

## 💡 Key Technical Differentiators to Highlight

1. **Hybrid Retrieval** — combines Knowledge Graph (structured) + Vector Search (semantic) for best of both worlds
2. **Grounding Score** — every answer rated for factual accuracy, not just fluency
3. **Self-Conflict Detection** — system catches its own errors using graph verification
4. **Human-in-the-Loop** — Review Queue prevents graph corruption from low-confidence extractions
5. **Full Audit Trail** — every agent step logged and visible to the engineer

---

> [!TIP]
> **Demo Order Suggestion:** Start with **Knowledge Graph** (wow factor — the visual), then **Chat** (most interactive), then **Maintenance** (practical value), then **Review Queue** (explain the trust mechanism). This creates a logical story: *"Here's what the system knows → Here's how you ask it → Here's how it keeps you safe → Here's how the knowledge gets built."*
