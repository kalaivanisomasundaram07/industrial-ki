#!/bin/bash
# Start backend and frontend concurrently
echo "Starting Industrial Knowledge Intelligence..."
cd backend &&
python -m uvicorn main:app --port 8000
or
python -m uvicorn backend.main:app --port 8000
cd frontend && npm run dev &
wait
