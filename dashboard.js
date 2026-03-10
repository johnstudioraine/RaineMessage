#!/usr/bin/env node
// dashboard.js — Live bot monitor, accessible from anywhere
// Run: node dashboard.js
// Then use cloudflared tunnel for external access

import { createServer } from "http";
import { readFileSync, statSync, createReadStream } from "fs";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = join(__dirname, "bot.log");
const HISTORY_PATH = join(__dirname, "job-history.json");
const PORT = process.env.DASHBOARD_PORT || 7777;

// SSE clients
const clients = new Set();

// Tail -f the log file
function startTailing() {
  const tail = spawn("tail", ["-f", "-n", "80", LOG_PATH]);
  tail.stdout.on("data", (chunk) => {
    const lines = chunk.toString();
    for (const client of clients) {
      client.write(`data: ${JSON.stringify(lines)}\n\n`);
    }
  });
  tail.on("close", () => {
    // Restart if tail dies
    setTimeout(startTailing, 1000);
  });
}

function getJobHistory() {
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function getBotStatus() {
  try {
    const log = readFileSync(LOG_PATH, "utf-8");
    const lines = log.split("\n").filter(Boolean);
    const last50 = lines.slice(-50);

    // Find last message in/out
    const lastIn = last50.findLast((l) => l.includes("[iMessage In]"));
    const lastOut = last50.findLast((l) => l.includes("[iMessage Out]"));
    const lastJob = last50.findLast((l) => l.includes("[VOLLNA]"));
    const lastError = last50.findLast(
      (l) =>
        l.toLowerCase().includes("error") &&
        !l.includes("command not found: compdef"),
    );
    const lastHeartbeat = last50.findLast((l) => l.includes("Heartbeat"));

    return { lastIn, lastOut, lastJob, lastError, lastHeartbeat };
  } catch {
    return {};
  }
}

const HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RaineBot Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      color: #e0e0e0;
      font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
      font-size: 13px;
    }
    .header {
      background: #111;
      border-bottom: 1px solid #222;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .header h1 {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 8px;
      animation: pulse 2s infinite;
    }
    .status-dot.live { background: #22c55e; }
    .status-dot.dead { background: #ef4444; animation: none; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .tabs {
      display: flex;
      gap: 0;
      background: #111;
      border-bottom: 1px solid #222;
      padding: 0 20px;
    }
    .tab {
      padding: 10px 16px;
      cursor: pointer;
      color: #888;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .tab:hover { color: #ccc; }
    .tab.active {
      color: #22c55e;
      border-bottom-color: #22c55e;
    }
    .panel { display: none; padding: 16px 20px; }
    .panel.active { display: block; }

    /* Status cards */
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .card {
      background: #151515;
      border: 1px solid #222;
      border-radius: 8px;
      padding: 14px;
    }
    .card-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      margin-bottom: 6px;
    }
    .card-value {
      font-size: 13px;
      color: #ccc;
      word-break: break-all;
    }
    .card-value.highlight { color: #22c55e; }
    .card-value.error { color: #ef4444; }

    /* Log view */
    #log {
      background: #0d0d0d;
      border: 1px solid #1a1a1a;
      border-radius: 8px;
      padding: 12px;
      height: calc(100vh - 200px);
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.6;
    }
    #log .line { margin: 0; }
    .line-msg-in { color: #60a5fa; }
    .line-msg-out { color: #34d399; }
    .line-vollna { color: #fbbf24; }
    .line-error { color: #f87171; }
    .line-api { color: #a78bfa; }

    /* Jobs table */
    .job-list { list-style: none; }
    .job-item {
      background: #151515;
      border: 1px solid #222;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 8px;
    }
    .job-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;
    }
    .job-meta {
      font-size: 12px;
      color: #888;
    }
    .job-meta a { color: #60a5fa; text-decoration: none; }
    .job-budget { color: #22c55e; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center">
      <span class="status-dot live" id="statusDot"></span>
      <h1>RaineBot</h1>
    </div>
    <span id="clock" style="color:#666"></span>
  </div>
  <div class="tabs">
    <div class="tab active" data-tab="live">Live Feed</div>
    <div class="tab" data-tab="status">Status</div>
    <div class="tab" data-tab="jobs">Job History</div>
  </div>
  <div class="panel active" id="panel-live">
    <div id="log"></div>
  </div>
  <div class="panel" id="panel-status">
    <div class="cards" id="statusCards"></div>
  </div>
  <div class="panel" id="panel-jobs">
    <ul class="job-list" id="jobList"></ul>
  </div>

  <script>
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
      });
    });

    // Clock
    setInterval(() => {
      document.getElementById('clock').textContent = new Date().toLocaleTimeString();
    }, 1000);

    // SSE live log
    const logEl = document.getElementById('log');
    let lastActivity = Date.now();

    function colorLine(text) {
      if (text.includes('[iMessage In]')) return 'line-msg-in';
      if (text.includes('[iMessage Out]')) return 'line-msg-out';
      if (text.includes('[VOLLNA]')) return 'line-vollna';
      if (text.toLowerCase().includes('error')) return 'line-error';
      if (text.includes('[API]') || text.includes('[Chat]') || text.includes('[iMessage Chat]')) return 'line-api';
      return '';
    }

    const evtSource = new EventSource('/stream');
    evtSource.onmessage = (e) => {
      lastActivity = Date.now();
      const text = JSON.parse(e.data);
      const lines = text.split('\\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const div = document.createElement('div');
        div.className = 'line ' + colorLine(line);
        div.textContent = line;
        logEl.appendChild(div);
      }
      // Auto-scroll
      logEl.scrollTop = logEl.scrollHeight;
      // Keep log manageable
      while (logEl.children.length > 500) logEl.removeChild(logEl.firstChild);
    };
    evtSource.onerror = () => {
      document.getElementById('statusDot').className = 'status-dot dead';
    };

    // Check liveness
    setInterval(() => {
      const dot = document.getElementById('statusDot');
      dot.className = (Date.now() - lastActivity < 120000) ? 'status-dot live' : 'status-dot dead';
    }, 5000);

    // Load status
    async function loadStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const cards = document.getElementById('statusCards');
        cards.innerHTML = '';
        const items = [
          ['Last Message In', data.lastIn, ''],
          ['Last Message Out', data.lastOut, 'highlight'],
          ['Last Vollna Job', data.lastJob, 'highlight'],
          ['Last Error', data.lastError, 'error'],
          ['Last Heartbeat', data.lastHeartbeat, ''],
        ];
        for (const [label, value, cls] of items) {
          cards.innerHTML += '<div class="card"><div class="card-label">' + label +
            '</div><div class="card-value ' + cls + '">' + (value || 'None') + '</div></div>';
        }
      } catch {}
    }

    // Load jobs
    async function loadJobs() {
      try {
        const res = await fetch('/api/jobs');
        const jobs = await res.json();
        const list = document.getElementById('jobList');
        list.innerHTML = '';
        for (const job of jobs.reverse()) {
          const time = job.timestamp ? new Date(job.timestamp).toLocaleString() : '';
          const budget = typeof job.budget === 'object'
            ? (job.budget.amount ? '$' + job.budget.amount : JSON.stringify(job.budget))
            : (job.budget || '?');
          list.innerHTML += '<li class="job-item">' +
            '<div class="job-title">' + (job.title || 'Untitled') + '</div>' +
            '<div class="job-meta">' +
              '<span class="job-budget">' + budget + '</span> · ' +
              time + ' · ' +
              (job.url ? '<a href="https://' + job.url + '" target="_blank">View on Upwork</a>' : '') +
            '</div></li>';
        }
      } catch {}
    }

    loadStatus();
    loadJobs();
    setInterval(loadStatus, 15000);
    setInterval(loadJobs, 30000);
  </script>
</body>
</html>`;

const server = createServer((req, res) => {
  if (req.url === "/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.url === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getBotStatus()));
    return;
  }

  if (req.url === "/api/jobs") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getJobHistory()));
    return;
  }

  // Serve dashboard
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(HTML);
});

startTailing();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Dashboard] Live at http://localhost:${PORT}`);
  console.log(`[Dashboard] For external access, run:`);
  console.log(
    `  npx cloudflared tunnel --url http://localhost:${PORT}`,
  );
});
