import os
import chromadb
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

# Load env variables from root directory
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(dotenv_path)

CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
COLLECTION_NAME = "industrial_ki"

_chroma_client = None
_model = None

def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
    return _chroma_client

def get_embedding_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model

def chunk_text(text: str, chunk_size: int = 400, overlap: int = 50) -> list:
    words = text.split()
    chunks = []
    if len(words) <= chunk_size:
        return [" ".join(words)]

    i = 0
    while i < len(words):
        chunk = words[i:i + chunk_size]
        chunks.append(" ".join(chunk))
        if i + chunk_size >= len(words):
            break
        i += (chunk_size - overlap)

    return chunks

def index_document(
    doc_id: str,
    filename: str,
    doc_type: str,
    raw_text: str,
    page_map: list = None  # Optional: list of (page_number, text) tuples for PDFs
):
    """
    Index a document into ChromaDB with chunk metadata including page_number.

    page_map: list of (page_number, page_text) tuples. If provided, chunks are
    built per-page so that each chunk carries an accurate page_number.
    If None, page_number is estimated from chunk position.
    """
    client = get_chroma_client()
    model = get_embedding_model()

    collection = client.get_or_create_collection(name=COLLECTION_NAME)

    # Remove existing chunks for this doc_id to avoid duplication on re-runs
    try:
        collection.delete(where={"doc_id": doc_id})
    except Exception as e:
        print(f"No existing chunks found to delete for doc_id {doc_id}: {e}")

    all_chunks = []
    all_page_numbers = []

    if page_map and len(page_map) > 0:
        # Build chunks per-page to preserve accurate page numbers
        for page_number, page_text in page_map:
            if not page_text or not page_text.strip():
                continue
            page_chunks = chunk_text(page_text)
            for chunk in page_chunks:
                all_chunks.append(chunk)
                all_page_numbers.append(page_number)
    else:
        # Fallback: chunk the entire text and estimate page number from position
        all_chunks = chunk_text(raw_text)
        for i, _ in enumerate(all_chunks):
            # Estimate: assume ~400 words per page (conservative)
            all_page_numbers.append(max(1, i + 1))

    if not all_chunks:
        return

    embeddings = model.encode(all_chunks).tolist()

    ids = [f"{doc_id}_chunk_{i}" for i in range(len(all_chunks))]
    metadatas = [
        {
            "doc_id": doc_id,
            "filename": filename,
            "chunk_index": i,
            "doc_type": doc_type,
            "page_number": all_page_numbers[i],
        }
        for i in range(len(all_chunks))
    ]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=all_chunks,
        metadatas=metadatas,
    )
    print(f"Indexed {len(all_chunks)} chunks in ChromaDB for {filename}")


def query_vector_store(query_text: str, top_k: int = 5) -> list:
    client = get_chroma_client()
    model = get_embedding_model()

    collection = client.get_or_create_collection(name=COLLECTION_NAME)

    query_embedding = model.encode([query_text]).tolist()

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=top_k,
    )

    formatted_results = []
    if results and "documents" in results and results["documents"]:
        docs = results["documents"][0]
        metas = results["metadatas"][0]
        distances = results["distances"][0] if "distances" in results else [0.0] * len(docs)

        for doc, meta, dist in zip(docs, metas, distances):
            formatted_results.append({
                "chunk_text": doc,
                "metadata": meta,
                "distance": dist,
            })

    return formatted_results


def get_chunk_info(filename: str, chunk_index: int) -> dict:
    """Retrieve metadata and text for a specific chunk by filename + chunk_index."""
    client = get_chroma_client()
    collection = client.get_or_create_collection(name=COLLECTION_NAME)

    try:
        results = collection.get(
            where={"$and": [{"filename": filename}, {"chunk_index": chunk_index}]},
            include=["documents", "metadatas"],
        )
        if results and results["documents"]:
            doc = results["documents"][0]
            meta = results["metadatas"][0]
            return {
                "filename": meta.get("filename", filename),
                "page_number": meta.get("page_number", 1),
                "chunk_text": doc,
                "chunk_index": meta.get("chunk_index", chunk_index),
                "doc_type": meta.get("doc_type", "unknown"),
            }
    except Exception as e:
        print(f"get_chunk_info failed for {filename} chunk {chunk_index}: {e}")
    return {
        "filename": filename,
        "page_number": 1,
        "chunk_text": "",
        "chunk_index": chunk_index,
        "doc_type": "unknown",
    }
