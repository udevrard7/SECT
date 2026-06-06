#!/bin/bash
trap 'echo "CAUGHT SIGNAL - exiting loop"; exit 0' SIGTERM SIGINT SIGHUP

while true; do
  echo "=== Starting Next.js server at $(date) ===" >> /tmp/sect-lifecycle.log
  cd /home/z/my-project
  NODE_OPTIONS="--max-old-space-size=2048" npx next dev -p 3000 2>&1 | tee dev.log
  EXIT_CODE=$?
  echo "=== Server exited with code $EXIT_CODE at $(date) ===" >> /tmp/sect-lifecycle.log
  sleep 3
done
