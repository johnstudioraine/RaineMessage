import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = new Anthropic();
const systemPrompt = readFileSync(join(__dirname, 'system-prompt.md'), 'utf-8');
const IMESSAGE_TO = process.env.IMESSAGE_TO;

const job = 'AI Chatbot for E-Commerce Store\n\nI need an AI expert to build a custom chatbot for my Shopify store. Budget: $5,000. Timeline: 2 weeks.\n\nSkills: AI, ChatGPT, Node.js, Shopify';

function sendIMessage(text) {
  if (!IMESSAGE_TO) return Promise.resolve();
  return new Promise((resolve) => {
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const script = 'tell application "Messages" to send "' + escaped + '" to participant "' + IMESSAGE_TO + '" of (1st account whose service type = iMessage)';
    execFile('osascript', ['-e', script], (err) => {
      if (err) console.error('iMessage error:', err.message);
      else console.log('iMessage sent!');
      resolve();
    });
  });
}

console.log('Sending job notification...');
await sendIMessage('🔵 NEW JOB 🔵\n\n' + job);

console.log('Generating proposal...');
const msg = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1500,
  system: systemPrompt,
  messages: [{ role: 'user', content: 'Here is an Upwork job post. Draft a proposal.\n\n' + job }]
});

const text = msg.content[0].text;
const parts = text.split(/\n---\n/);
const proposal = parts[0].trim();
const metadata = parts.length > 1 ? parts.slice(1).join('\n---\n').trim() : null;

console.log('Sending proposal...');
await sendIMessage('🟢 DRAFT PROPOSAL 🟢\n\n' + proposal);
if (metadata) await sendIMessage('🟡 METADATA 🟡\n\n' + metadata);
console.log('Done!');
