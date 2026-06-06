#!/bin/bash
# SECT Dev Server - Auto-restart wrapper
trap 'exit 0' SIGTERM SIGINT

LOG=/home/z/my-project/dev.log
while true; do
  cd /home/z/my-project
  echo "[$(date)] Starting Next.js dev server..." > $LOG
  NODE_OPTIONS="--max-old-space-size=2048" npx next dev -p 3000 2>&1 | tee -a $LOG
  EXIT=$?
  echo "[$(date)] Server exited with code $EXIT, restarting in 2s..." >> $LOG
  sleep 2
done
