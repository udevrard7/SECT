#!/bin/bash
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=4096"

while true; do
  echo "[$(date)] Starting Next.js..."
  node node_modules/.bin/next dev -p 3000 &
  PID=$!
  
  # Attendre que le process meure ou que le port soit actif
  while kill -0 $PID 2>/dev/null; do
    sleep 1
  done
  
  echo "[$(date)] Process $PID died. Restarting in 5s..."
  sleep 5
done
