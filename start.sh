#!/bin/bash

echo "Starting Industrial Knowledge Intelligence..."

cd backend

python -m uvicorn main:app --host 0.0.0.0 --port $PORT
