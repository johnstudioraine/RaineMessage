# Studio Raine Proposal Bot — How It All Works

## The Full Flow

### 1. Vollna (vollna.com) — watches Upwork FOR you
- You set up a filter called "AI" on Vollna's website
- Vollna scrapes Upwork every few minutes and collects jobs matching your filter
- Vollna has an API that lets your bot ask "what new jobs matched?"

### 2. Your bot (bot.js on Mac Mini) — runs 24/7
- Every 30 seconds, it calls Vollna's API: "Any new AI jobs?"
- If there's a new job, it does TWO things:

### 3. iMessage notification — sends you the raw job posting
- 🔵 NEW JOB 🔵 + job title, description, budget
- You see this on your iPhone instantly

### 4. Claude API — writes a proposal draft FOR you
- Bot sends the job posting to Claude with your system-prompt.md (which tells Claude to write like you, mention your Google/Meta/Scale AI background, etc.)
- Claude returns a draft proposal + metadata (fit score, red flags, upsell angle)
- Bot sends that to you via iMessage too: 🟢 DRAFT PROPOSAL 🟢

### 5. Telegram — same notifications go there as backup
- You don't need to check Telegram. It's a safety net in case iMessage breaks.

### The whole loop:
```
Upwork jobs → Vollna scrapes them → Bot polls Vollna API every 30s
                                         ↓
                                    New job found
                                         ↓
                              ┌──────────┴──────────┐
                              ↓                      ↓
                     iMessage to your phone    Claude writes proposal
                     (🔵 raw job posting)           ↓
                                              iMessage to your phone
                                              (🟢 draft proposal ready to paste)
                                              (🟡 metadata: fit score, flags, upsell)
```

**You get a job + a ready-to-submit proposal on your phone. You just review and paste it into Upwork.**

## Architecture

```
                YOUR PHONE (iPhone)
                    |
        +-----------+-----------+
        |                       |
   [Telegram App]         [iMessage]
   (backup only)          (primary)
        |                       |
   Telegram Cloud          Mac Mini
   (their servers)     (192.168.12.134)
        ^                   ^  |
        |                   |  |
        +-------+-----------+  |
                |              | osascript
          +-----+------+      | (tells Messages
          |  bot.js    |------+ app to send)
          |  (Node.js) |
          +-----+------+
                |
       +--------+--------+
       |                  |
  Vollna API        Claude API
  (job data)       (writes proposals)
       |                  |
   Upwork             Anthropic
  (source)           (your API key)
```

## iMessage Commands (text these to your Mac Mini's iCloud number)

| Command | What it does |
|---------|-------------|
| **status** | Bot health check — uptime, jobs processed, last job |
| **draft [job description]** | Paste a job description, get a proposal back |
| **ask [questions]** | Paste client questions, get answers in your voice |
| **help** | List all commands |

You also get an **automatic heartbeat every hour** — an iMessage confirming the bot is alive with stats.

## Telegram Commands (backup — same features)

| Command | What it does |
|---------|-------------|
| **/chatid** | Get the chat ID for .env setup |
| **/draft [job description]** | Generate a proposal from pasted text |
| **/ask [questions]** | Answer client questions in your voice |
| Forward a Vollna message | Auto-detects it and drafts a proposal |

## What Lives Where

### Mac Mini (rainebot@192.168.12.134) — the 24/7 server
```
/Users/rainebot/nsclaude/
  bot.js              ← the running program
  system-prompt.md    ← tells Claude how to write as John
  .env                ← all API keys
  package.json        ← list of libraries needed
  node_modules/       ← the actual libraries
  bot.log             ← output log (check this for errors)
```

### Your MacBook (johnraine@Johns-MBP) — where you edit code
```
/Users/johnraine/Documents/nsclaude/
  bot.js              ← your working copy (edit HERE)
  system-prompt.md    ← edit HERE then push to Mac Mini
  .env                ← same keys
  docs/               ← all documentation
  test.js             ← test script for iMessage pipeline
```

**Workflow:** Edit on MacBook → SCP to Mac Mini → Restart bot

## API Keys

| Key | What it does | Where to get a new one |
|-----|-------------|----------------------|
| ANTHROPIC_API_KEY | Pays for Claude to write proposals | console.anthropic.com |
| TELEGRAM_BOT_TOKEN | Lets bot send Telegram messages | @BotFather on Telegram |
| TELEGRAM_CHAT_ID | Which Telegram chat to send to | Send /chatid to your bot |
| VOLLNA_API_KEY | Access to Vollna's Upwork job data | vollna.com dashboard |
| IMESSAGE_TO | Phone number to send iMessages to | Just your number |

## Monthly Costs

| Service | Cost |
|---------|------|
| Vollna Agency | $62/mo |
| Claude API | ~$5-15/mo (depends on volume) |
| Telegram | Free |
| iMessage | Free |
| Mac Mini | Free (your hardware) |
| **Total** | **~$67-77/mo** |

## Why Telegram stays (even though you use iMessage)

Costs nothing — it's just a few extra lines of code. If iMessage ever breaks (Mac Mini restarts weird, Messages app signs out, iCloud hiccup), Telegram still works. You'll never look at Telegram unless iMessage stops working. Then you'll be glad it's there.
