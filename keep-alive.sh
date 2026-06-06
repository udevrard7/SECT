#!/bin/bash
while true; do
  cd /home/z/my-project
  NODE_OPTIONS="--max-old-space-size=2048" npx next dev -p 3000 2>&1 | tee dev.log
  echo "Server died, restarting in 3s..."
  sleep 3
done
