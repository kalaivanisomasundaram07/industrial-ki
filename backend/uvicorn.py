import os
import sys

# Ensure parent directory of backend is in sys.path so backend absolute imports work
_parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

# Remove the current directory from sys.path to avoid recursive load of this wrapper
_current_dir = os.path.dirname(__file__)
if _current_dir in sys.path:
    sys.path.remove(_current_dir)

# Run the real uvicorn main module
import runpy
runpy.run_module("uvicorn", run_name="__main__")
