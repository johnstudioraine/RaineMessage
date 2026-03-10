import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const IMESSAGE_TO = process.env.IMESSAGE_TO;

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

  // Split proposal from metadata (separated by ---)
  const parts = text.split(/\n---\n/);
  const proposal = parts[0].trim();
  const metadata = parts.length > 1 ? parts.slice(1).join("\n---\n").trim() : null;

  return { proposal, metadata };
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
    ? `\n\nClient Questions:\n${project.clientQuestions}`
    : "";

  return `🔵 NEW JOB 🔵\n\n${project.title}\n\n${project.description}${questions}\n\n${budget} (${budgetType}) | ${skills}\n${country} | Spent: ${spent} | Hires: ${hires} | Rating: ${rating} | Verified: ${verified}\n\n${project.url}`;
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

          // Skip jobs published before bot started
          const publishedTs = project.publishedTimestamp || 0;
          if (publishedTs < botStartTime) {
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

          // Send job post via iMessage (plain text version)
          const iMsgJob = formatJobForIMessage(project);
          await sendIMessage(iMsgJob);

          // Draft proposal
          try {
            const jobText = formatJobForAI(project);
            const { proposal, metadata } = await generateProposal(jobText);

            // Send label (HTML), then proposal as clean copyable message
            await bot.sendMessage(targetChat, "🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢\n<b>DRAFT PROPOSAL</b>", { parse_mode: "HTML" });
            const chunks = proposal.match(/[\s\S]{1,4000}/g) || [proposal];
            for (const chunk of chunks) {
              await bot.sendMessage(targetChat, chunk);
            }
            if (metadata) {
              await bot.sendMessage(targetChat, `🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡\n<b>METADATA</b>\n\n${escapeHtml(metadata)}`, { parse_mode: "HTML" });
            }

            // Send proposal via iMessage
            await sendIMessage(`🟢 DRAFT PROPOSAL 🟢\n\n${proposal}`);
            if (metadata) {
              await sendIMessage(`🟡 METADATA 🟡\n\n${metadata}`);
            }
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
            const { proposal, metadata } = await generateProposal(jobText);
            await sendIMessage(`🟢 DRAFT PROPOSAL 🟢\n\n${proposal}`);
            if (metadata) await sendIMessage(`🟡 METADATA 🟡\n\n${metadata}`);
          } catch (err) {
            await sendIMessage(`Error drafting: ${err.message}`);
          }
        }
      } else if (text.startsWith("ask ") || text.startsWith("/ask ")) {
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
        await sendIMessage("Commands:\n• status — bot health check\n• draft [job description] — generate a proposal\n• ask [questions] — answer client questions in your voice\n• help — show this list");
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
