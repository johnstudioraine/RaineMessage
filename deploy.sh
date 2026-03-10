#!/bin/bash
# Self-deploy: waits 5 seconds (so the AI can send its response), then restarts the bot
# Usage: bash /Users/rainebot/nsclaude/deploy.sh

echo "[Deploy] Restarting bot in 5 seconds..."
sleep 5
pkill -f 'node bot.js' 2>/dev/null
sleep 1
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd /Users/rainebot/nsclaude
nohup node bot.js > bot.log 2>&1 &
echo "[Deploy] Bot restarted at $(date)"
