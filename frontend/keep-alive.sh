#!/bin/bash
while true; do
  cd /home/z/my-project
  NODE_OPTIONS="--max-old-space-size=1024" npx next dev -p 3000 -H 0.0.0.0 2>&1 | tee dev.log
  echo "Server died, restarting in 3s..."
  sleep 3
done
