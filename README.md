# RaineMessage

**You get Upwork jobs and ready-to-submit proposals delivered straight to your phone via iMessage. No checking Upwork. No writing proposals. Just review, paste, submit.**

## Why I Built This

I was losing jobs on Upwork because I wasn't fast enough. Good projects get 20+ proposals in the first hour. By the time I'd see a job, open it, write a proposal, and submit — the client already had 15 people to choose from.

Now my bot checks for new jobs every 30 seconds, writes a full proposal in my voice using AI, and texts it to my phone. I see the job and a ready-to-paste proposal at the same time. I've gone from "maybe I'll check Upwork later" to responding within minutes of a job being posted.

## What It Actually Does

1. **Watches Upwork for you** — Uses Vollna (a job monitoring service) to scan Upwork based on your filters
2. **Writes proposals automatically** — When a new job appears, it sends the description to Claude (AI) with your personal system prompt that knows your background, writing style, and credentials
3. **Texts you everything via iMessage** — You get the job posting + a draft proposal + metadata (how good the fit is, red flags, upsell angles) right on your phone
4. **Telegram backup** — Same notifications go to Telegram in case iMessage ever hiccups
5. **You can text it back** — Reply "status" to check if it's running, "draft [job]" to generate a proposal on demand, or "ask [questions]" to get client question answers in your voice

## What You Need

- **A Mac that stays on 24/7** — I use a Mac Mini at home. It needs to run macOS because iMessage only works on Apple devices. This is your always-on server.
- **A separate iCloud account on that Mac** — So when it sends you an iMessage, your phone receives it as a message from someone else (not from yourself). I created a second iCloud just for the Mac Mini.
- **Your daily-use iPhone** — Where you receive everything
- **A Vollna account** ($62/mo) — Monitors Upwork and provides the API that feeds your bot. Set up filters for the types of jobs you want.
- **An Anthropic API key** (~$5-15/mo) — Powers Claude, the AI that writes your proposals
- **A Telegram bot** (free) — Backup notification channel. Takes 2 minutes to set up via @BotFather on Telegram.
- **Node.js** installed on the Mac

## Setup

### 1. Clone this repo on your Mac (the always-on one)

```bash
git clone https://github.com/johnstudioraine/RaineMessage.git
cd RaineMessage
npm install
```

### 2. Create your .env file

```bash
cp .env.example .env
```

Then fill in your keys:

```
ANTHROPIC_API_KEY=your-anthropic-key
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id
VOLLNA_API_KEY=your-vollna-api-key
IMESSAGE_TO=+1XXXXXXXXXX
```

**Where to get each key:**
- **ANTHROPIC_API_KEY** — Sign up at console.anthropic.com, go to API Keys, create one
- **TELEGRAM_BOT_TOKEN** — Open Telegram, message @BotFather, send `/newbot`, follow the steps. It gives you a token.
- **TELEGRAM_CHAT_ID** — Start the bot, create a group, add your bot to it, then send `/chatid` in the group. The bot will reply with the chat ID.
- **VOLLNA_API_KEY** — Sign up at vollna.com, go to your dashboard settings, find the API key section
- **IMESSAGE_TO** — Your phone number with country code (e.g. +19175551234)

Each key MUST be on its own line. Seriously. If two keys end up on the same line, things will silently break.

### 3. Customize your system prompt

Edit `system-prompt.md` — this is what tells Claude how to write proposals as YOU. Put your background, credentials, writing style, and the kind of projects you do. The better this is, the better your auto-generated proposals will be.

### 4. Set up your Vollna filters

Go to vollna.com, create filters for the types of Upwork jobs you want. The bot will automatically pick up all your filters.

### 5. Make sure iMessage works

Open the Messages app on your always-on Mac. Sign in with your secondary iCloud account. Send a test message to your phone number to confirm it arrives.

### 6. Start the bot

```bash
nohup node bot.js > bot.log 2>&1 &
```

### 7. Auto-start on reboot (so it survives restarts)

```bash
crontab -e
```

Add this line:

```
@reboot sleep 15 && cd /path/to/RaineMessage && /opt/homebrew/bin/node bot.js >> /path/to/RaineMessage/bot.log 2>&1 &
```

Replace `/path/to/RaineMessage` with wherever you cloned the repo. The `sleep 15` gives macOS time to finish booting before the bot starts.

## Using It

Once it's running, you don't touch anything. Jobs come to your phone.

**You'll automatically get:**
- 🔵 **NEW JOB** — Full job description as soon as it's posted on Upwork
- 🟢 **DRAFT PROPOSAL** — Ready-to-paste proposal written in your voice
- 🟡 **METADATA** — Fit score, red flags, and upsell angles
- **Hourly heartbeat** — A message every hour confirming the bot is alive with stats

## Commands

### iMessage (text these to your Mac's iCloud number)

| Command | What it does | Example |
|---------|-------------|---------|
| `status` | Bot health check — uptime, jobs processed, last job | Just text "status" |
| `draft [job]` | Generate a proposal from any job description | "draft Looking for an AI expert to build a chatbot for my e-commerce store. Budget $5K..." |
| `ask [questions]` | Answer client application questions in your voice | "ask What is your experience with Shopify? How would you approach this project?" |
| `help` | List all available commands | Just text "help" |

### Telegram (backup — same features, different format)

| Command | What it does | Example |
|---------|-------------|---------|
| `/chatid` | Returns the chat ID (for initial .env setup) | Send in your bot's group chat |
| `/draft [job]` | Generate a proposal from pasted text | "/draft Looking for an AI expert..." |
| `/ask [questions]` | Answer client questions in your voice | "/ask What's your experience with Stripe?" |
| Forward a Vollna message | Auto-detects job posts and drafts a proposal | Just forward it to the bot |
| Paste a long message (100+ chars) in DM | Treats it as a job post and drafts a proposal | Paste the job description directly |

## Monthly Cost

| Service | Cost |
|---------|------|
| Vollna | $62/mo |
| Claude API | ~$5-15/mo |
| Telegram | Free |
| iMessage | Free |
| **Total** | **~$67-77/mo** |

If it helps you land even one extra $3K+ project a month, that's a 40x return.

## Docs

- [How It Works](docs/HOW-IT-WORKS.md) — Full architecture, flow diagrams, and explanation of every component
- [Debug Guide](docs/DEBUG-GUIDE.md) — Troubleshooting commands, common problems, and fixes
