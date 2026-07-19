# Industrial Knowledge Intelligence

A trust and reasoning layer over industrial documents, using a Knowledge Graph (Neo4j) combined with vector search (ChromaDB) and verified grounding scores via Claude.

## Installation & Setup Instructions

Follow these exact steps to run the application locally:

Step 1: Open Neo4j Desktop → New Project → Add Local DBMS → Start it
Step 2: Open .env → replace YOUR_NEO4J_PASSWORD_HERE with your actual password
Step 3: Open .env → replace YOUR_ANTHROPIC_API_KEY_HERE with your actual API key
Step 4: Paste your documents (PDF, DOCX, XLSX, images) into data/raw/
Step 5: cd backend && pip install -r requirements.txt
Step 6: cd backend && uvicorn main:app --reload --port 8000
Step 7: cd frontend && npm install && npm run dev
Step 8: Open http://localhost:5173
Step 9: Click "Ingest Documents" or POST /ingest → wait for completion
Step 10: Start querying!
