#!/bin/bash
while true; do
  cd /home/z/my-project
  rm -f dev.log
  NODE_OPTIONS="--max-old-space-size=3072" npx next dev -p 3000 2>&1 | tee dev.log
  echo "=== Server crashed, restarting in 2s ===" >> dev.log
  sleep 2
done
