#!/bin/bash

echo "Starting Industrial Knowledge Intelligence..."

python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT
