import os
import sys

# Ensure parent directory of backend is in sys.path so backend absolute imports work
_parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

from dotenv import load_dotenv

# Load env variables from root directory
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(dotenv_path)

# Re-export the shared pooled driver from backend.db so that all modules that
# do `from backend.graph.schema import get_neo4j_driver` keep working unchanged.
from backend.db import get_neo4j_driver, close_neo4j_driver  # noqa: F401

def init_schema():
    driver = get_neo4j_driver()
    node_types = [
        "Equipment", 
        "Component", 
        "Failure", 
        "Symptom", 
        "Action", 
        "Procedure", 
        "Regulation", 
        "Engineer", 
        "Document"
    ]
    
    with driver.session() as session:
        for label in node_types:
            # Modern Neo4j 5+ syntax
            query_modern = f"CREATE CONSTRAINT {label.lower()}_name_unique IF NOT EXISTS FOR (n:{label}) REQUIRE n.name IS UNIQUE"
            # Fallback syntax for Neo4j 4.x or older if modern syntax fails
            query_legacy = f"CREATE CONSTRAINT ON (n:{label}) ASSERT n.name IS UNIQUE"
            
            try:
                session.run(query_modern)
                print(f"Created constraint for {label} (Modern syntax)")
            except Exception as e:
                print(f"Failed to create modern constraint for {label}, trying legacy. Error: {e}")
                try:
                    session.run(query_legacy)
                    print(f"Created constraint for {label} (Legacy syntax)")
                except Exception as e2:
                    print(f"Failed to create legacy constraint for {label}. Error: {e2}")

if __name__ == "__main__":
    try:
        init_schema()
        print("Neo4j Schema initialization complete.")
    except Exception as e:
        print(f"Failed to initialize schema. Make sure Neo4j is running. Error: {e}")
    finally:
        close_neo4j_driver()
