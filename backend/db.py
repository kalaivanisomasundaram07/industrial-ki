"""
backend/db.py — Shared Neo4j driver singleton with connection pooling.

All backend modules import get_neo4j_driver() from here.
The driver is created ONCE at process startup and reused for every request,
eliminating the per-request connection overhead.
"""
import os
from neo4j import GraphDatabase
from dotenv import load_dotenv

# Load env variables from the project root .env
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path)

NEO4J_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER     = os.getenv("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "neo4j")

# Module-level singleton — created ONCE, reused for every request
_neo4j_driver = None


def get_neo4j_driver():
    """Return (and lazily create) the shared pooled Neo4j driver."""
    global _neo4j_driver
    if _neo4j_driver is None:
        _neo4j_driver = GraphDatabase.driver(
            NEO4J_URI,
            auth=(NEO4J_USER, NEO4J_PASSWORD),
            max_connection_pool_size=50,
            connection_acquisition_timeout=30,
            max_transaction_retry_time=15,
            keep_alive=True,
        )
    return _neo4j_driver


def close_neo4j_driver():
    """Close the driver cleanly on shutdown."""
    global _neo4j_driver
    if _neo4j_driver is not None:
        _neo4j_driver.close()
        _neo4j_driver = None
