# Debug Guide — Studio Raine Bot

## Architecture

```
MacBook (johnraine) ──scp──> Mac Mini (rainebot@192.168.12.134)
                                 |
                              bot.js (runs 24/7 via nohup)
                                 |
                    +------------+------------+
                    |            |            |
               Vollna API   Claude API   Telegram API
               (job feed)   (proposals)  (notifications)
                                 |
                            osascript
                            (iMessage)
                                 |
                          John's iPhone
```

## Key Files

| File | Location | Purpose |
|------|----------|---------|
| bot.js | ~/nsclaude/ (both machines) | Main bot — polls Vollna, generates proposals, sends to Telegram + iMessage |
| system-prompt.md | ~/nsclaude/ | Claude's instructions for writing proposals as John |
| .env | ~/nsclaude/ | API keys (ANTHROPIC, TELEGRAM, VOLLNA, IMESSAGE_TO) |
| test.js | ~/nsclaude/ | Test script — sends fake job through full iMessage pipeline |
| bot.log | ~/nsclaude/ (Mac Mini only) | Runtime log |

## .env Format (CRITICAL)

Each key MUST be on its own line. A missing newline caused IMESSAGE_TO to silently fail:
```
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=838...
TELEGRAM_CHAT_ID=-100...
VOLLNA_API_KEY=00de...
IMESSAGE_TO=+19292910750
```

## Common Commands

### Check if bot is running
```bash
ssh rainebot@192.168.12.134 "ps aux | grep node | grep -v grep"
```

### Check logs
```bash
ssh rainebot@192.168.12.134 "tail -30 ~/nsclaude/bot.log"
```

### Restart bot
```bash
ssh rainebot@192.168.12.134 "pkill -9 -f node; sleep 5; cd ~/nsclaude && nohup /opt/homebrew/bin/node bot.js > bot.log 2>&1 &"
```
IMPORTANT: Always kill first, wait 5 seconds, then start. Otherwise 409 Telegram conflicts.

### Push code changes
```bash
scp /Users/johnraine/Documents/nsclaude/bot.js rainebot@192.168.12.134:~/nsclaude/
```

### Push and restart (one command)
```bash
scp /Users/johnraine/Documents/nsclaude/bot.js rainebot@192.168.12.134:~/nsclaude/ && ssh rainebot@192.168.12.134 "pkill -9 -f node; sleep 5; cd ~/nsclaude && nohup /opt/homebrew/bin/node bot.js > bot.log 2>&1 &"
```

### Test iMessage directly
```bash
ssh rainebot@192.168.12.134 "osascript -e 'tell application \"Messages\" to send \"test\" to participant \"+19292910750\" of (1st account whose service type = iMessage)'"
```

### Test full pipeline (iMessage + Claude proposal)
```bash
scp /Users/johnraine/Documents/nsclaude/test.js rainebot@192.168.12.134:~/nsclaude/ && ssh rainebot@192.168.12.134 "cd ~/nsclaude && /opt/homebrew/bin/node test.js"
```

### Check Vollna filters
```bash
ssh rainebot@192.168.12.134 "cd ~/nsclaude && /opt/homebrew/bin/node -e \"import 'dotenv/config'; const r=await fetch('https://api.vollna.com/v1/filters',{headers:{'X-API-TOKEN':process.env.VOLLNA_API_KEY}}); console.log(await r.json());\""
```

### Check jobs in a filter
```bash
ssh rainebot@192.168.12.134 "cd ~/nsclaude && /opt/homebrew/bin/node -e \"import 'dotenv/config'; const r=await fetch('https://api.vollna.com/v1/filters/31584/projects',{headers:{'X-API-TOKEN':process.env.VOLLNA_API_KEY}}); const d=await r.json(); console.log('Jobs:',d.data?.length); d.data?.slice(0,5).forEach(j=>console.log('-',j.title));\""
```

## Troubleshooting

### No notifications coming through
1. Check bot is running: `ps aux | grep node`
2. Check logs for errors: `tail -30 ~/nsclaude/bot.log`
3. Check .env has IMESSAGE_TO on its own line: `grep IMESSAGE ~/nsclaude/.env`
4. Check Vollna API returns jobs (see command above)
5. Bot skips jobs published before it started — restart processes only new jobs

### 409 Conflict errors
Two bot instances running. Fix:
```bash
pkill -9 -f node; sleep 5
```
Then restart. The sleep is critical — Telegram needs time to release the polling connection.

### iMessage not sending
1. Test direct osascript (see command above)
2. Check IMESSAGE_TO in .env (must be on own line!)
3. Check Messages app is signed into iCloud on Mac Mini
4. Mac Mini must have a DIFFERENT iCloud than your phone (rainebot iCloud → john's phone = received as blue bubble)

### Bot not picking up jobs
- Bot only processes jobs published AFTER it starts (botStartTime check)
- To process older jobs temporarily: change `Math.floor(Date.now() / 1000)` to `Math.floor(Date.now() / 1000) - 7200` (2 hours back)
- Only the "AI" filter exists (id: 31584) — add more filters in Vollna dashboard for other job types
- Vollna API key: filter id 31584

### Crontab (auto-restart on reboot)
```bash
ssh rainebot@192.168.12.134 "crontab -l"
```
Should show:
```
@reboot sleep 15 && cd /Users/rainebot/nsclaude && /opt/homebrew/bin/node bot.js >> /Users/rainebot/nsclaude/bot.log 2>&1 &
```

## Bugs We Fixed (Session: March 10, 2026)

1. **IMESSAGE_TO not being read** — .env had no newline between VOLLNA_API_KEY and IMESSAGE_TO. dotenv parsed them as one key. Fix: ensure each key on its own line.

2. **sendIMessage was fire-and-forget** — Original function used callback-style execFile but didn't return a promise. Script would exit before osascript finished. Fix: wrapped in Promise, added await to all call sites.

3. **Jobs not triggering notifications** — botStartTime check skipped all jobs published before bot started. After restart, all existing jobs are "old." This is by design — prevents flood on restart. Use `- 7200` trick to process older jobs temporarily.

4. **Wrong node path in crontab** — Initially set to `/usr/local/bin/node` but Mac Mini has `/opt/homebrew/bin/node`. Check with `which node`.

## Mac Mini Details

- Host: rainebot@192.168.12.134
- User: rainebot
- iCloud: separate account (NOT john.yehia — that's why iMessages show as received)
- Node: /opt/homebrew/bin/node (v25.8.0)
- Working dir: /Users/rainebot/nsclaude/
- Auto-starts on reboot via crontab
