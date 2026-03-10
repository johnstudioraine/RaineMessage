import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import Anthropic from "@anthropic-ai/sdk";
import { query as agentQuery } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const IMESSAGE_TO = process.env.IMESSAGE_TO;

// ── Typing Indicator (placeholder — not implemented yet) ──

// ── iMessage AI Chat: Full Claude Agent via Agent SDK ──

// Session ID for conversation continuity (persists until bot restart)
let agentSessionId = null;

// Follow-up message handling: collect messages sent while agent is thinking
let isAgentProcessing = false;
let pendingFollowUps = [];

// Run Claude Agent — full Claude Code capabilities via iMessage
async function runImessageChat(userMsg) {
  let result = "";

  const options = {
    allowedTools: ["WebSearch", "WebFetch", "Read", "Glob", "Grep", "Bash", "Write"],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    maxTurns: 15,
    cwd: "/Users/rainebot/nsclaude",
    systemPrompt: `You are John Raine's AI — his right hand, running 24/7 on his Mac Mini via iMessage. You're not a generic assistant. You know John, you know the business, you're a partner.

WHO JOHN IS:
John Raine runs Studio Raine — a one-man AI-powered creative and technical studio. He's not a freelancer. He's a studio.
- Helped BUILD ChatGPT, Google Gemini, Meta's Llama, Cursor IDE, and GitHub Copilot at Scale AI
- AI Performance Strategist at Google (2 years) — LLM alignment, accuracy, search relevance
- AI Systems Consultant at Facebook — content moderation, ad targeting, LLM training
- Operations Manager at Amazon — AI-driven logistics at massive scale
- Currently doing $20-30K/month on Upwork + off-platform upsells. Target: $100K/month.
- Superpower: lands $2-5K projects, upsells to $8-20K+. Every client should buy 3+ times.
- Services: branding, web design, social media strategy, AI video production, interactive media, technical/data projects
- Notable project: The Solarium — interactive visual novel on Steam with Candid Bay Productions ($20K+ ongoing)
- Philosophy: maximum independence, high ticket only, never hourly, project-based pricing, pressure makes him faster

HOW TO TALK TO JOHN:
- Direct. No corporate fluff. No "great question!" BS.
- Push him when he's stalling. He responds to pressure.
- If he's spiraling or anxious, redirect to action — don't confirm the anxiety.
- He already knows what to do. Usually just needs someone to say "go."
- Match his energy. If he's casual, be casual. If he's locked in, be sharp.

WHAT YOU ARE:
You are the AI chat component of RaineMessage — a bot system John built that:
1. MONITORS UPWORK via Vollna API — polls every 30 seconds for new jobs matching his filters
2. AUTO-DRAFTS PROPOSALS — Claude writes proposals in John's voice, sends them to his phone via iMessage + Telegram
3. AI CHAT (you) — John texts you anything and you handle it with full agent capabilities

When John says "that job" or "the proposal you just sent" or "is this client legit" — he means jobs from the Vollna pipeline. Read /Users/rainebot/nsclaude/job-history.json for the last 50 jobs with titles, descriptions, URLs, proposals, and metadata. Read bot.log for system activity.

SELF-KNOWLEDGE:
Your full system reference is at /Users/rainebot/nsclaude/self.md — this describes your architecture, capabilities, feature history, and key files. Read it when John asks what you can do, how you work, or what changed recently. When a new feature is added, it gets logged there.

PERSISTENT MEMORY:
You lose context between sessions. To remember things across conversations, read and write to /Users/rainebot/nsclaude/memory.json. Check this file at the START of every conversation for context John has asked you to remember. When John says "remember this" or you learn something important about his preferences, save it there.

FORMATTING (you are sending iMessages, not documents):
- Plain text ONLY — no markdown, no asterisks, no headers, no code blocks
- Use simple dashes (-) for lists
- Keep responses phone-readable
- No emojis unless John uses them first

CAPABILITIES:
You have full agent capabilities — web search, file reading, shell commands, everything. USE THEM. Research people, check files, run commands, build things. Never say "I can't do that." You're running on John's Mac Mini with full access.

CRITICAL — GUI SESSION AND FILE SENDING:
You run via nohup/SSH which has NO display access and NO ability to send files via osascript directly. Two rules:
1. For screenshots/GUI: MUST use gui-run.sh. Direct screencapture WILL FAIL.
2. For sending files/images to John: MUST use send-image.sh. Do NOT try osascript "send POSIX file" yourself — it silently fails from your context.

To take a screenshot and send it to John (EXACT commands, do not deviate):
  bash /Users/rainebot/nsclaude/gui-run.sh "/Users/rainebot/nsclaude/screenshot.sh"
  bash /Users/rainebot/nsclaude/send-image.sh /tmp/screenshot.png

To screenshot a specific folder open in Finder:
  bash /Users/rainebot/nsclaude/gui-run.sh "/Users/rainebot/nsclaude/screenshot.sh /Users/rainebot/Documents"
  bash /Users/rainebot/nsclaude/send-image.sh /tmp/screenshot.png

IMPORTANT: send-image.sh is the ONLY way to send files to John. Always use it. It handles the GUI session context internally.

SCREENSHOT VERIFICATION (mandatory):
After taking a screenshot, ALWAYS read /tmp/screenshot.png with your Read tool to visually inspect it BEFORE sending. Think critically about what John actually wants to SEE:
- If he says "prove the file is there" — the specific file MUST be visible in the screenshot. Not just the folder, the actual file name must be readable. If it is not visible, scroll, resize the window, use "open -R /path/to/file" to reveal it highlighted, then retake.
- If he says "screenshot my documents" — the Documents folder contents must be fully showing, not just a Finder sidebar or wrong directory.
- If he asks for visual evidence of something specific — that exact thing must be clearly visible in the image.
- Think like John looking at this on his phone: "Can I clearly see the proof I asked for?"
If the answer is no — fix the view (navigate, scroll, resize, use open -R to highlight) and retake. Do NOT send a screenshot that doesn't contain the specific visual proof requested. Retake as many times as needed.

SELF-MODIFICATION:
You can edit your own code and add features to yourself. When John asks you to add a feature:
1. Read the relevant files (bot.js, self.md, etc.)
2. Make the edits using Write/Edit tools
3. Update self.md Feature Log with the new feature and exact timestamp
4. Update memory.json if relevant
5. Tell John what you changed
6. Run: nohup bash /Users/rainebot/nsclaude/deploy.sh &
   This waits 5 seconds (so your response sends first), then restarts the bot with your changes.
IMPORTANT: deploy.sh kills and restarts the bot process, which kills YOU. So send your full response BEFORE running deploy.sh. Never run deploy.sh in the middle of a response.

API BILLING:
There is no API endpoint to check balance. Whenever John asks about his API balance, credits, billing, how much he has left, usage, cost, or anything related to API spending — always include this link in your response: https://platform.claude.com/settings/billing

COMPUTER USE — GUI AUTOMATION (Anthropic Official Computer Use Tool):
You can control the Mac Mini's screen like a human — click, type, scroll, open apps, navigate any GUI. This uses Anthropic's official Computer Use API under the hood.

To use computer control, run this command via Bash:
  node /Users/rainebot/nsclaude/computer-use.js "description of what to do on screen"

Examples:
  node /Users/rainebot/nsclaude/computer-use.js "Open Safari and go to linkedin.com"
  node /Users/rainebot/nsclaude/computer-use.js "Take a screenshot and describe what's on screen"
  node /Users/rainebot/nsclaude/computer-use.js "Click the Sign In button, type johnyehia3@gmail.com in the email field, and click Continue"
  node /Users/rainebot/nsclaude/computer-use.js "Open Finder, navigate to Documents, and list what's there"

The computer-use.js script runs a full agent loop: it takes screenshots, sees the screen, clicks/types/scrolls, verifies results, and repeats until the task is done. It returns a text summary of what it did and what it saw.

IMPORTANT: This is powerful. It can control ANY app on the Mac Mini. Use it when John asks you to do something visual — browse the web, open apps, interact with GUIs, fill out forms, take screenshots of specific things.

For quick file/URL opens without full computer use, you can still use:
  bash /Users/rainebot/nsclaude/gui-run.sh "open https://example.com"
  bash /Users/rainebot/nsclaude/gui-run.sh "open -a Safari"

VOLLNA JOB HISTORY:
- Past processed jobs are saved in /Users/rainebot/nsclaude/job-history.json (last 50 jobs with titles, URLs, descriptions, budgets, skills, proposals, and timestamps)
- Each entry in job-history.json has a "timestamp" field (ISO 8601, e.g. "2026-03-10T09:30:00.000Z") showing when the bot processed/saw the job. Use this for time-based queries like "past hour" or "today".
- To check the latest jobs from your Vollna filter (may include jobs not yet in job-history.json):
  curl -s -H "X-API-TOKEN: $VOLLNA_API_KEY" https://api.vollna.com/v1/filters/31584/projects | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);(j.data||[]).forEach(p=>console.log(JSON.stringify({title:p.title,budget:p.budget,url:p.url,publishedOn:p.publishedOn||p.publishedTimestamp||p.date_created||'unknown'},null,2)))"
- When John asks about jobs, missed jobs, or what's been posted — ALWAYS read job-history.json first (it has timestamps). Then hit the Vollna API for anything newer. Compare timestamps to answer time-based questions accurately.
- If a job in job-history.json has a "timestamp" within the user's requested window, include it. Don't say "no timestamps" — job-history.json always has them.

For full self-reference including architecture, all capabilities, and feature history with timestamps, read /Users/rainebot/nsclaude/self.md.`,
  };

  // Resume previous session for conversation continuity
  if (agentSessionId) {
    options.resume = agentSessionId;
  }

  // Try up to 2 times (retry once on failure, clearing stale session)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      for await (const message of agentQuery({ prompt: userMsg, options })) {
        if (message.type === "system" && message.subtype === "init") {
          agentSessionId = message.session_id;
        }
        if ("result" in message) {
          result = message.result;
        }
      }
      break; // Success — exit retry loop
    } catch (err) {
      console.error(`[Agent SDK Error] attempt=${attempt}`, err.message);
      if (attempt === 0) {
        // First failure — clear stale session and retry
        agentSessionId = null;
        delete options.resume;
      } else {
        result = `Error: ${err.message}`;
      }
    }
  }

  return result;
}

// Send iMessage via AppleScript (returns a promise so we can await it)
function sendIMessage(text) {
  if (!IMESSAGE_TO) return Promise.resolve();
  return new Promise((resolve) => {
    const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
    const script = `tell application "Messages" to send "${escaped}" to participant "${IMESSAGE_TO}" of (1st account whose service type = iMessage)`;
    execFile("osascript", ["-e", script], (err) => {
      if (err) console.error("[iMessage] Error:", err.message);
      else console.log("[iMessage] Sent:", text.slice(0, 60) + "...");
      resolve();
    });
  });
}

if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === "your-bot-token-here") {
  console.error("Set TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic();

const systemPrompt = readFileSync(join(__dirname, "system-prompt.md"), "utf-8");

// Track which messages we've already processed
const processed = new Set();

// Detect if a message looks like an Upwork job post from Vollna
function isJobPost(text) {
  if (!text) return false;
  const lower = text.toLowerCase();

  // Vollna-specific format (strongest signal)
  const vollnaSignals = [
    "fixed budget:",
    "hourly budget:",
    "site: upwork.com",
    "client rank:",
    "published:",
    "filter:",
    "payment method verified",
    "upwork bot by vollna",
  ];
  const vollnaMatches = vollnaSignals.filter((s) => lower.includes(s));
  if (vollnaMatches.length >= 2) return true;

  // Generic Upwork job post signals (fallback)
  const genericSignals = [
    "posted",
    "fixed-price",
    "hourly",
    "budget",
    "proposals",
    "upwork.com",
    "skills and expertise",
    "project type",
    "freelancer",
    "apply",
    "client rank",
    "job post",
  ];
  const genericMatches = genericSignals.filter((s) => lower.includes(s));
  return genericMatches.length >= 2;
}

// Generate proposal from job description
async function generateProposal(jobText) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Here is an Upwork job post. Draft a proposal.\n\n${jobText}`,
      },
    ],
  });

  const text = response.content[0].text;

  // Split into: proposal, questions, metadata
  // Format: proposal text \n---QUESTIONS---\n Q/A pairs \n---\n metadata
  let proposal, questions = [], metadata = null;

  const qSplit = text.split(/\n---QUESTIONS---\n/);
  if (qSplit.length > 1) {
    proposal = qSplit[0].trim();
    const rest = qSplit[1];
    const metaSplit = rest.split(/\n---\n/);
    const qBlock = metaSplit[0].trim();
    metadata = metaSplit.length > 1 ? metaSplit.slice(1).join("\n---\n").trim() : null;

    // Parse Q/A pairs
    const lines = qBlock.split("\n");
    let currentQ = null;
    for (const line of lines) {
      if (line.startsWith("Q: ")) {
        currentQ = line.slice(3).trim();
      } else if (line.startsWith("A: ") && currentQ) {
        questions.push({ q: currentQ, a: line.slice(3).trim() });
        currentQ = null;
      }
    }
  } else {
    const parts = text.split(/\n---\n/);
    proposal = parts[0].trim();
    metadata = parts.length > 1 ? parts.slice(1).join("\n---\n").trim() : null;
  }

  return { proposal, questions, metadata };
}

// Log ALL incoming updates for debugging
bot.on("polling_error", (err) => console.error("Polling error:", err.message));

// Check if message is from Vollna bot
function isFromVollna(msg) {
  const username = (msg.from?.username || "").toLowerCase();
  const firstName = (msg.from?.first_name || "").toLowerCase();
  return username.includes("vollna") || firstName.includes("vollna") || username.includes("upwork");
}

// Handle incoming messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const fromUser = msg.from?.username || msg.from?.first_name || msg.from?.id;
  const isBot = msg.from?.is_bot || false;

  console.log(`[MSG] chat=${chatId} type=${msg.chat.type} from=${fromUser} isBot=${isBot} text="${(msg.text || msg.caption || "").slice(0, 120)}"`);

  // Skip if already processed
  if (processed.has(messageId)) return;
  processed.add(messageId);

  // Clean up old processed IDs (keep last 1000)
  if (processed.size > 1000) {
    const arr = [...processed];
    arr.slice(0, arr.length - 1000).forEach((id) => processed.delete(id));
  }

  const text = msg.text || msg.caption || "";

  // Command: /chatid — get the chat ID for .env setup
  if (text === "/chatid") {
    await bot.sendMessage(chatId, `Chat ID: \`${chatId}\``, {
      parse_mode: "Markdown",
    });
    return;
  }

  // Command: /ask — answer additional application questions in John's voice
  if (text.startsWith("/ask")) {
    const questions = text.replace("/ask", "").trim();
    const repliedTo = msg.reply_to_message?.text || msg.reply_to_message?.caption || "";

    if (!questions) {
      await bot.sendMessage(
        chatId,
        "Paste the extra questions after /ask. Example: /ask What is your experience with Stripe?"
      );
      return;
    }

    await bot.sendMessage(chatId, "Answering...");

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          ...(repliedTo
            ? [
                {
                  role: "user",
                  content: `Here is an Upwork job post. Draft a proposal.\n\n${repliedTo}`,
                },
                {
                  role: "assistant",
                  content: "(proposal was already written for this job)",
                },
              ]
            : []),
          {
            role: "user",
            content: `The Upwork application has additional questions I need to answer. Answer each one in the same tone as the proposal: short, confident, human, plain text, no fluff. Each answer should be 1-3 sentences max.\n\nQuestions:\n${questions}`,
          },
        ],
      });

      const answer = response.content[0].text;
      const chunks = answer.match(/[\s\S]{1,4000}/g) || [answer];
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk);
      }
    } catch (err) {
      await bot.sendMessage(chatId, `Error: ${err.message}`);
    }
    return;
  }

  // Command: /draft — force draft a proposal from a reply or pasted text
  if (text.startsWith("/draft")) {
    const jobText =
      msg.reply_to_message?.text ||
      msg.reply_to_message?.caption ||
      text.replace("/draft", "").trim();

    if (!jobText) {
      await bot.sendMessage(
        chatId,
        "Reply to a job post with /draft, or paste the job description after /draft"
      );
      return;
    }

    await bot.sendMessage(chatId, "Drafting proposal...");

    try {
      const { proposal, metadata } = await generateProposal(jobText);
      const chunks = proposal.match(/[\s\S]{1,4000}/g) || [proposal];
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk);
      }
      if (metadata) {
        await bot.sendMessage(chatId, metadata);
      }
    } catch (err) {
      await bot.sendMessage(chatId, `Error: ${err.message}`);
    }
    return;
  }

  // Command: /skip — mark a job as not worth it
  if (text === "/skip") {
    return; // just ignore
  }

  // Auto-detect job posts: from Vollna bot OR matching job post signals
  const vollnaMessage = isFromVollna(msg);
  const jobDetected = isJobPost(text);

  if (vollnaMessage || jobDetected) {
    const reason = vollnaMessage ? "Vollna bot" : "keyword match";
    console.log(`Job detected [${reason}] [${messageId}] in chat ${chatId}: ${text.slice(0, 120)}...`);

    // Always send drafts to the Studio Raine group
    const targetChat = CHAT_ID || chatId.toString();

    try {
      const { proposal, metadata } = await generateProposal(text);
      const chunks = proposal.match(/[\s\S]{1,4000}/g) || [proposal];
      for (const chunk of chunks) {
        await bot.sendMessage(targetChat, chunk);
      }
      if (metadata) {
        await bot.sendMessage(targetChat, metadata);
      }
    } catch (err) {
      await bot.sendMessage(targetChat, `Error: ${err.message}`);
    }
    return;
  }

  // If someone sends a message directly to the bot (DM), treat it as a job post
  if (msg.chat.type === "private" && text.length > 100) {
    await bot.sendMessage(chatId, "Drafting proposal...");

    try {
      const { proposal, metadata } = await generateProposal(text);
      const chunks = proposal.match(/[\s\S]{1,4000}/g) || [proposal];
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk);
      }
      if (metadata) {
        await bot.sendMessage(chatId, metadata);
      }
    } catch (err) {
      await bot.sendMessage(chatId, `Error: ${err.message}`);
    }
  }
});

// Handle photos with captions (screenshots of job posts)
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const caption = msg.caption || "";

  if (caption.length > 50 || msg.chat.type === "private") {
    await bot.sendMessage(
      chatId,
      "I can see the screenshot but I can only read text right now. Paste the job description as text, or use Vollna's text notifications."
    );
  }
});

// ============================================
// VOLLNA API POLLING — Auto-fetch & draft
// ============================================

const VOLLNA_API_KEY = process.env.VOLLNA_API_KEY;
const VOLLNA_BASE = "https://api.vollna.com/v1";
const POLL_INTERVAL = 30_000; // 30 seconds

// Track jobs we've already drafted for
const processedJobs = new Set();
const botStartTime = Math.floor(Date.now() / 1000);
let jobsProcessed = 0;
let lastJobTitle = "None yet";

// Format a Vollna project into readable text for the AI
function formatJobForAI(project) {
  const budget = project.budget?.amount || "Not specified";
  const budgetType = project.budget?.type || "";
  const client = project.clientDetails || {};
  const skills = Array.isArray(project.skills) ? project.skills.join(", ") : project.skills || "";
  const questions = project.clientQuestions
    ? "\n\nClient Questions:\n" + project.clientQuestions
    : "";

  return `${project.title}

${project.description}${questions}

Budget: ${budget} (${budgetType})
Skills: ${skills}
Experience: ${project.experienceLevel || "Not specified"}
Duration: ${project.durationLabel || "Not specified"}
Client Country: ${client.country || "Unknown"}
Client Spent: ${client.totalSpent || "Unknown"}
Client Hires: ${client.totalHires || 0}
Client Rating: ${client.rating || "N/A"}
Payment Verified: ${client.paymentMethodVerified ? "Yes" : "No"}
URL: ${project.url}`;
}

// Format full job post for Telegram (HTML)
function formatJobMessage(project) {
  const budget = project.budget?.amount || "?";
  const budgetType = project.budget?.type || "";
  const client = project.clientDetails || {};
  const country = client.country || "Unknown";
  const spent = client.totalSpent || "?";
  const hires = client.totalHires || 0;
  const rating = client.rating || "N/A";
  const verified = client.paymentMethodVerified ? "Yes" : "No";
  const skills = Array.isArray(project.skills) ? project.skills.join(", ") : project.skills || "None listed";
  const experience = project.experienceLevel || "Not specified";
  const duration = project.durationLabel || "Not specified";
  const questions = project.clientQuestions
    ? `\n\n<b>Client Questions:</b>\n${escapeHtml(project.clientQuestions)}`
    : "";

  return `🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵
<b>NEW JOB</b>

<b>${escapeHtml(project.title)}</b>

${escapeHtml(project.description)}${questions}

━━━━━━━━━━━━━━━━━━
💰 <b>${escapeHtml(budget)}</b> (${escapeHtml(budgetType)})
🛠 ${escapeHtml(skills)}
📊 ${escapeHtml(experience)} | ${escapeHtml(duration)}
━━━━━━━━━━━━━━━━━━
👤 ${escapeHtml(country)} | Spent: ${escapeHtml(spent)} | Hires: ${hires} | ⭐ ${rating} | ${verified === "Yes" ? "✅ Verified" : "❌ Unverified"}

🔗 <a href="${project.url}">Open on Upwork</a>`;
}

// Format job post for iMessage (plain text, no HTML)
function formatJobForIMessage(project) {
  const budget = project.budget?.amount || "?";
  const budgetType = project.budget?.type || "";
  const client = project.clientDetails || {};
  const country = client.country || "Unknown";
  const spent = client.totalSpent || "?";
  const hires = client.totalHires || 0;
  const rating = client.rating || "N/A";
  const verified = client.paymentMethodVerified ? "Yes" : "No";
  const skills = Array.isArray(project.skills) ? project.skills.join(", ") : project.skills || "None listed";
  const questions = project.clientQuestions
    ? `\nClient Questions:\n${project.clientQuestions}`
    : "";

  // Returns array of separate bubbles
  return [
    `🔵 NEW JOB: ${project.title}`,
    `${budget} (${budgetType}) | ${country} | Spent: ${spent} | Hires: ${hires} | Rating: ${rating} | Verified: ${verified}\n\n${skills}`,
    `${project.description}${questions}`,
    `${project.url}`,
  ];
}

// Escape HTML special chars for Telegram
function escapeHtml(text) {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function pollVollna() {
  if (!VOLLNA_API_KEY) return;

  try {
    // Get all filters
    const filtersRes = await fetch(`${VOLLNA_BASE}/filters`, {
      headers: { "X-API-TOKEN": VOLLNA_API_KEY },
    });
    const filtersData = await filtersRes.json();
    const filters = filtersData.data || [];

    for (const filter of filters) {
      try {
        const res = await fetch(`${VOLLNA_BASE}/filters/${filter.id}/projects`, {
          headers: { "X-API-TOKEN": VOLLNA_API_KEY },
        });
        const data = await res.json();
        const projects = data.data || [];

        for (const project of projects) {
          const jobId = project.url || project.title;
          if (processedJobs.has(jobId)) continue;

          // Skip jobs published more than 1 hour before bot started
          // (allows catching recent jobs after a restart)
          const publishedTs = project.publishedTimestamp || 0;
          if (publishedTs < botStartTime - 3600) {
            processedJobs.add(jobId); // Mark as seen so we don't check again
            continue;
          }

          processedJobs.add(jobId);

          console.log(`[VOLLNA] New job from filter "${filter.name}": ${project.title}`);
          jobsProcessed++;
          lastJobTitle = project.title;

          const targetChat = CHAT_ID;
          if (!targetChat) continue;

          // Send full job post (HTML formatted)
          await bot.sendMessage(targetChat, formatJobMessage(project), {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });

          // Send job post via iMessage (separate bubbles)
          const iMsgBubbles = formatJobForIMessage(project);
          for (const bubble of iMsgBubbles) {
            await sendIMessage(bubble);
          }

          // Draft proposal
          try {
            const jobText = formatJobForAI(project);
            const { proposal, questions, metadata } = await generateProposal(jobText);

            // Telegram: label, proposal, questions, metadata
            await bot.sendMessage(targetChat, "🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢\n<b>DRAFT PROPOSAL</b>", { parse_mode: "HTML" });
            const chunks = proposal.match(/[\s\S]{1,4000}/g) || [proposal];
            for (const chunk of chunks) {
              await bot.sendMessage(targetChat, chunk);
            }
            if (questions.length > 0) {
              const qText = questions.map(qa => `Q: ${qa.q}\nA: ${qa.a}`).join("\n\n");
              await bot.sendMessage(targetChat, `🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠\n<b>APPLICATION QUESTIONS</b>\n\n${escapeHtml(qText)}`, { parse_mode: "HTML" });
            }
            if (metadata) {
              await bot.sendMessage(targetChat, `🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡\n<b>METADATA</b>\n\n${escapeHtml(metadata)}`, { parse_mode: "HTML" });
            }

            // iMessage: clean separate bubbles
            await sendIMessage("🟢 DRAFT PROPOSAL");
            await sendIMessage(proposal);
            if (questions.length > 0) {
              await sendIMessage("🟠 APPLICATION QUESTIONS");
              for (const qa of questions) {
                await sendIMessage(`Q: ${qa.q}`);
                await sendIMessage(qa.a);
              }
            }

            // Save to job history so AI chat can reference it
            const jobRecord = {
              timestamp: new Date().toISOString(),
              title: project.title,
              url: project.url,
              description: project.description?.slice(0, 500),
              budget: project.budget || project.hourlyRange || "Not specified",
              skills: (project.skills || []).join(", "),
              proposal: proposal,
              metadata: metadata || "",
            };
            try {
              const historyPath = join(__dirname, "job-history.json");
              const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, "utf-8")) : [];
              history.push(jobRecord);
              // Keep last 50 jobs
              if (history.length > 50) history.splice(0, history.length - 50);
              writeFileSync(historyPath, JSON.stringify(history, null, 2));
            } catch {}

          } catch (err) {
            await bot.sendMessage(targetChat, `Draft error: ${err.message}`);
          }

          // Small delay between jobs to avoid rate limits
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (err) {
        console.error(`[VOLLNA] Error polling filter ${filter.name}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[VOLLNA] Poll error:", err.message);
  }

  // Clean up old processed jobs (keep last 500)
  if (processedJobs.size > 500) {
    const arr = [...processedJobs];
    arr.slice(0, arr.length - 500).forEach((id) => processedJobs.delete(id));
  }
}

// Start polling
if (VOLLNA_API_KEY) {
  console.log("Vollna API polling active. Checking every 30s...");
  pollVollna(); // Initial poll
  setInterval(pollVollna, POLL_INTERVAL);
} else {
  console.log("No VOLLNA_API_KEY — Vollna polling disabled.");
}

// ============================================
// HOURLY HEARTBEAT — iMessage status ping
// ============================================

function formatUptime() {
  const seconds = Math.floor(Date.now() / 1000) - botStartTime;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

setInterval(() => {
  const msg = `Bot alive. Uptime: ${formatUptime()}. Jobs processed: ${jobsProcessed}. Last: ${lastJobTitle}`;
  sendIMessage(msg);
  console.log(`[HEARTBEAT] ${msg}`);
}, 60 * 60 * 1000); // Every hour

// ============================================
// iMESSAGE STATUS WATCHER — Reply to "status"
// ============================================

import Database from "better-sqlite3";

const IMESSAGE_DB = `/Users/rainebot/Library/Messages/chat.db`;
let lastCheckedRowId = 0;

// Get the latest row ID on startup so we don't process old messages
try {
  const db = new Database(IMESSAGE_DB, { readonly: true });
  const row = db.prepare("SELECT MAX(ROWID) as maxId FROM message").get();
  lastCheckedRowId = row?.maxId || 0;
  db.close();
  console.log(`[iMessage Watcher] Starting from row ${lastCheckedRowId}`);
} catch (err) {
  console.error("[iMessage Watcher] Could not read chat.db:", err.message);
}

async function checkIncomingIMessages() {
  try {
    const db = new Database(IMESSAGE_DB, { readonly: true });
    const rows = db.prepare(`
      SELECT m.ROWID, m.text, m.is_from_me, h.id as handle_id
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE m.ROWID > ? AND m.is_from_me = 0
      ORDER BY m.ROWID ASC
      LIMIT 10
    `).all(lastCheckedRowId);
    db.close();

    for (const row of rows) {
      lastCheckedRowId = row.ROWID;
      const text = (row.text || "").trim().toLowerCase();
      const from = row.handle_id || "";

      // Only respond to messages from John's number
      if (!from.includes("9292910750") && !from.includes("john")) continue;

      console.log(`[iMessage In] from=${from}: "${row.text}"`);

      if (text === "status" || text === "status?") {
        const statusMsg = `Bot alive\nUptime: ${formatUptime()}\nJobs processed: ${jobsProcessed}\nLast job: ${lastJobTitle}\nVollna filter: AI (id 31584)\nPolling: every 30s`;
        sendIMessage(statusMsg);
      } else if (text.startsWith("draft ") || text.startsWith("/draft ")) {
        const jobText = (row.text || "").replace(/^\/?draft\s+/i, "").trim();
        if (!jobText) {
          await sendIMessage("Paste the job description after 'draft'. Example: draft Looking for an AI expert to build...");
        } else {
          await sendIMessage("Drafting proposal...");
          try {
            const { proposal } = await generateProposal(jobText);
            await sendIMessage("🟢 DRAFT PROPOSAL");
            await sendIMessage(proposal);
          } catch (err) {
            await sendIMessage(`Error drafting: ${err.message}`);
          }
        }
      } else if (text.startsWith("/ask ")) {
        const questions = (row.text || "").replace(/^\/?ask\s+/i, "").trim();
        if (!questions) {
          await sendIMessage("Paste questions after 'ask'. Example: ask What is your experience with Stripe?");
        } else {
          await sendIMessage("Answering...");
          try {
            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 1500,
              system: systemPrompt,
              messages: [
                {
                  role: "user",
                  content: `The Upwork application has additional questions I need to answer. Answer each one in the same tone as the proposal: short, confident, human, plain text, no fluff. Each answer should be 1-3 sentences max.\n\nQuestions:\n${questions}`,
                },
              ],
            });
            await sendIMessage(`🟡 ANSWERS 🟡\n\n${response.content[0].text}`);
          } catch (err) {
            await sendIMessage(`Error answering: ${err.message}`);
          }
        }
      } else if (text === "help" || text === "commands") {
        await sendIMessage("Commands:\n• status — bot health check\n• draft [job description] — generate a proposal\n• ask [questions] — answer client questions in your voice\n• Just text anything else — chat with Claude directly\n• help — show this list");
      } else if ((row.text || "").trim().length > 0) {
        const userMsg = (row.text || "").trim();

        // If agent is already processing, collect as follow-up
        if (isAgentProcessing) {
          console.log(`[iMessage Follow-up] "${userMsg.slice(0, 80)}..."`);
          pendingFollowUps.push(userMsg);
          continue;
        }

        // Freeform chat with Claude Agent SDK
        console.log(`[iMessage Chat] "${userMsg.slice(0, 80)}..."`);
        isAgentProcessing = true;
        pendingFollowUps = [];
        await sendIMessage("⏳");
        try {
          const reply = await runImessageChat(userMsg);
          isAgentProcessing = false;
          await sendIMessage(reply);
        } catch (err) {

          isAgentProcessing = false;
          pendingFollowUps = [];
          await sendIMessage(`Error: ${err.message}`);
        }
      }
    }
  } catch (err) {
    // Silently fail — chat.db might be locked
  }
}

// Check for incoming iMessages every 5 seconds
setInterval(checkIncomingIMessages, 5000);

console.log("Studio Raine Proposal Bot is running.");
console.log("Commands:");
console.log("  /chatid  — Get this chat's ID for .env");
console.log("  /draft   — Force draft from replied message or pasted text");
console.log("  /ask     — Answer application questions");
console.log("  Auto     — Vollna API polls every 30s and drafts proposals");
console.log("  iMessage 'status' — Reply with bot health");
console.log("  iMessage 'draft [job]' — Generate proposal via iMessage");
console.log("  iMessage 'ask [questions]' — Answer client questions via iMessage");
console.log("  iMessage 'help' — List iMessage commands");
console.log("  Heartbeat — iMessage every hour");
