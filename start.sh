#!/bin/bash
echo "[START] Launching process manager..."
node manager.js &
MANAGER_PID=$!
echo "[START] Manager PID: $MANAGER_PID"

trap "kill $MANAGER_PID 2>/dev/null" EXIT INT TERM

echo "[START] Launching dashboard..."
python3 server.py
