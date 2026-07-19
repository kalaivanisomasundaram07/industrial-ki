# 🏭 Industrial Knowledge Intelligence (IKI)

> **AI-powered Industrial Knowledge Intelligence Platform** that unifies heterogeneous industrial documents into a trusted knowledge system using **Neo4j Knowledge Graph**, **ChromaDB**, **LangGraph**, **FastAPI**, **React**, and **Groq LLM**.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Neo4j](https://img.shields.io/badge/Neo4j-008CC1?style=for-the-badge&logo=neo4j&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-Agentic_AI-blue?style=for-the-badge)
![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector_DB-purple?style=for-the-badge)

---

## 📖 Overview

Industrial organizations store SOPs, manuals, inspection reports, maintenance logs, and drawings across disconnected systems. This project ingests those documents, extracts knowledge, stores relationships in Neo4j, indexes document chunks in ChromaDB, and answers questions through a multi-agent GraphRAG pipeline with citations and grounding verification.

## ✨ Key Features

- 📄 Multi-format document ingestion (PDF, DOCX, XLSX, TXT, Images/OCR)
- 🕸️ Neo4j Knowledge Graph generation
- 🔍 Hybrid GraphRAG (Knowledge Graph + Vector Search)
- 🤖 LangGraph multi-agent workflow
- 📌 Source citations
- ✅ Grounding score verification
- ⚠️ Conflict detection for inconsistent document evidence
- 👨‍💼 Human review queue for low-confidence knowledge extraction
- 💬 Chat interface with session history

## 🏗️ Architecture

```text
Documents
(PDF/DOCX/XLSX/Images)
          │
          ▼
 Ingestion Pipeline
          │
 ┌────────┴─────────┐
 ▼                  ▼
Neo4j Graph     ChromaDB
 └────────┬─────────┘
          ▼
 Hybrid GraphRAG
          ▼
 LangGraph Agents
          ▼
 Trust Verification
          ▼
 FastAPI
          ▼
 React Frontend
```

## ⚙️ Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI |
| Frontend | React + TypeScript |
| LLM | Groq |
| Agent Framework | LangGraph |
| Knowledge Graph | Neo4j |
| Vector Store | ChromaDB |
| Embeddings | all-MiniLM-L6-v2 |
| Reranker | cross-encoder/ms-marco-MiniLM-L-6-v2 |
| Database | SQLite |
| OCR | Tesseract |

## 🚀 Installation

```bash
git clone <repository-url>
cd industrial-ki
cp .env.example .env
```

Configure `.env`:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
GROQ_API_KEY=your_key
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:5173

## 📂 Project Structure

```text
backend/
frontend/
data/
README.md
```

## 🔌 API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /upload | Upload documents |
| POST | /ingest | Ingest documents |
| POST | /query | Ask questions |
| GET | /review-queue | Pending reviews |
| GET | /health | Health check |

## 🎥 Demo Flow

1. Upload industrial documents.
2. Run ingestion.
3. Ask operational questions.
4. Review citations and grounding score.
5. Explore the knowledge graph.


## 🚀 Future Enhancements

- Role-based authentication
- Streaming responses
- Docker deployment
- Multi-user collaboration
