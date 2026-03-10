#!/usr/bin/env node
// computer-use.js — Anthropic Computer Use on native Mac Mini
// Uses the official computer_20251124 tool via Claude API
// The Agent SDK AI calls this via: node computer-use.js "task description"
//
// Requires: brew install cliclick
// Must be run on the Mac Mini (needs gui-run.sh for display access)

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const client = new Anthropic();
const BASE_DIR = resolve(new URL(".", import.meta.url).pathname);
const GUI_RUN = resolve(BASE_DIR, "gui-run.sh");
const SCREENSHOT_SH = resolve(BASE_DIR, "screenshot.sh");
const SEND_IMAGE = resolve(BASE_DIR, "send-image.sh");

const MAX_ITERATIONS = 25;
const SCREENSHOT_PATH = "/tmp/cu-screenshot.png";

// ── Get screen resolution ──
function getScreenResolution() {
  try {
    const output = execSync(
      `bash "${GUI_RUN}" "system_profiler SPDisplaysDataType"`,
      { encoding: "utf-8", timeout: 15000 }
    );
    const match = output.match(/Resolution:\s*(\d+)\s*x\s*(\d+)/);
    if (match) return { width: parseInt(match[1]), height: parseInt(match[2]) };
  } catch {}
  // Fallback — common Mac Mini resolution
  return { width: 1920, height: 1080 };
}

// ── Calculate API scale factor (images constrained to ~1568px longest edge, ~1.15MP) ──
function getScaleFactor(width, height) {
  const longEdge = Math.max(width, height);
  const totalPixels = width * height;
  const longEdgeScale = 1568 / longEdge;
  const totalPixelsScale = Math.sqrt(1_150_000 / totalPixels);
  return Math.min(1.0, longEdgeScale, totalPixelsScale);
}

// ── Take screenshot, return base64 ──
function takeScreenshot() {
  try {
    // Use screencapture directly via gui-run for custom output path
    execSync(
      `bash "${GUI_RUN}" "screencapture -x ${SCREENSHOT_PATH}"`,
      { timeout: 15000 }
    );
    const imageData = readFileSync(SCREENSHOT_PATH);
    return imageData.toString("base64");
  } catch (err) {
    console.error("[CU] Screenshot failed:", err.message);
    return null;
  }
}

// ── Execute GUI action via cliclick ──
function guiExec(cmd, timeout = 10000) {
  try {
    return execSync(`bash "${GUI_RUN}" "${cmd}"`, {
      encoding: "utf-8",
      timeout,
    });
  } catch (err) {
    console.error("[CU] GUI exec failed:", cmd, err.message);
    return "";
  }
}

// ── Map Claude key names to cliclick key names ──
function mapKeyToCli(key) {
  // Claude sends combos like "ctrl+a", "cmd+l", "Return", "Tab", etc.
  const keyMap = {
    Return: "return",
    Enter: "return",
    Tab: "tab",
    Escape: "escape",
    Backspace: "delete",
    Delete: "fwd-delete",
    Space: "space",
    Up: "arrow-up",
    Down: "arrow-down",
    Left: "arrow-left",
    Right: "arrow-right",
    Home: "home",
    End: "end",
    Page_Up: "pageup",
    Page_Down: "pagedown",
    F1: "f1", F2: "f2", F3: "f3", F4: "f4", F5: "f5", F6: "f6",
    F7: "f7", F8: "f8", F9: "f9", F10: "f10", F11: "f11", F12: "f12",
  };
  return keyMap[key] || key.toLowerCase();
}

// ── Handle a computer use action ──
function executeAction(action, input, scaleFactor) {
  const scaleCoord = (x, y) => [
    Math.round(x / scaleFactor),
    Math.round(y / scaleFactor),
  ];

  switch (action) {
    case "screenshot": {
      return { type: "screenshot" };
    }

    case "left_click": {
      const [x, y] = scaleCoord(...input.coordinate);
      guiExec(`cliclick c:${x},${y}`);
      return null;
    }

    case "right_click": {
      const [x, y] = scaleCoord(...input.coordinate);
      guiExec(`cliclick rc:${x},${y}`);
      return null;
    }

    case "double_click": {
      const [x, y] = scaleCoord(...input.coordinate);
      guiExec(`cliclick dc:${x},${y}`);
      return null;
    }

    case "triple_click": {
      const [x, y] = scaleCoord(...input.coordinate);
      guiExec(`cliclick tc:${x},${y}`);
      return null;
    }

    case "middle_click": {
      const [x, y] = scaleCoord(...input.coordinate);
      // cliclick doesn't have middle click, use AppleScript
      guiExec(`osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`);
      return null;
    }

    case "mouse_move": {
      const [x, y] = scaleCoord(...input.coordinate);
      guiExec(`cliclick m:${x},${y}`);
      return null;
    }

    case "left_click_drag": {
      const [sx, sy] = scaleCoord(...input.start_coordinate);
      const [ex, ey] = scaleCoord(...input.coordinate);
      guiExec(`cliclick dd:${sx},${sy} du:${ex},${ey}`);
      return null;
    }

    case "type": {
      const text = input.text;
      // Use AppleScript for reliable typing (handles special chars better)
      const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      guiExec(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`);
      return null;
    }

    case "key": {
      const keyStr = input.key;
      // Handle combos like "ctrl+a", "cmd+shift+t"
      const parts = keyStr.split("+");
      if (parts.length === 1) {
        // Single key
        guiExec(`cliclick kp:${mapKeyToCli(parts[0])}`);
      } else {
        // Modifier combo
        const modifiers = parts.slice(0, -1);
        const key = parts[parts.length - 1];

        // Map modifier names
        const modMap = {
          ctrl: "ctrl", control: "ctrl",
          cmd: "cmd", command: "cmd", super: "cmd",
          alt: "alt", option: "alt",
          shift: "shift",
        };

        const cliParts = [];
        for (const mod of modifiers) {
          cliParts.push(`kd:${modMap[mod.toLowerCase()] || mod.toLowerCase()}`);
        }
        cliParts.push(`kp:${mapKeyToCli(key)}`);
        for (const mod of modifiers.reverse()) {
          cliParts.push(`ku:${modMap[mod.toLowerCase()] || mod.toLowerCase()}`);
        }
        guiExec(`cliclick ${cliParts.join(" ")}`);
      }
      return null;
    }

    case "scroll": {
      const direction = input.direction || "down";
      const amount = input.amount || 3;
      // cliclick doesn't have scroll, use AppleScript
      const scrollDir = direction === "up" || direction === "left" ? 1 : -1;
      const axis = direction === "left" || direction === "right" ? "horizontal" : "vertical";
      for (let i = 0; i < amount; i++) {
        if (axis === "vertical") {
          guiExec(`osascript -e 'tell application "System Events" to scroll area 1 by ${scrollDir * 3}'`);
        }
      }
      // Fallback: use key presses for scrolling
      const scrollKey = direction === "up" ? "arrow-up" : direction === "down" ? "arrow-down" : direction === "left" ? "arrow-left" : "arrow-right";
      for (let i = 0; i < amount; i++) {
        guiExec(`cliclick kp:${scrollKey}`);
      }
      return null;
    }

    case "wait": {
      const ms = (input.duration || 1) * 1000;
      execSync(`sleep ${ms / 1000}`);
      return null;
    }

    case "left_mouse_down": {
      const [x, y] = scaleCoord(...input.coordinate);
      guiExec(`cliclick dd:${x},${y}`);
      return null;
    }

    case "left_mouse_up": {
      const [x, y] = scaleCoord(...input.coordinate);
      guiExec(`cliclick du:${x},${y}`);
      return null;
    }

    case "zoom": {
      // Zoom action: take screenshot of specific region at full res
      // input.region = [x1, y1, x2, y2]
      // For now, take a full screenshot — the model will handle the region
      return { type: "screenshot" };
    }

    default:
      console.error(`[CU] Unknown action: ${action}`);
      return null;
  }
}

// ── Main agent loop ──
async function runComputerUse(task) {
  const screen = getScreenResolution();
  const scaleFactor = getScaleFactor(screen.width, screen.height);
  const scaledWidth = Math.round(screen.width * scaleFactor);
  const scaledHeight = Math.round(screen.height * scaleFactor);

  console.error(`[CU] Screen: ${screen.width}x${screen.height}, Scale: ${scaleFactor.toFixed(3)}, API dims: ${scaledWidth}x${scaledHeight}`);

  const tools = [
    {
      type: "computer_20251124",
      name: "computer",
      display_width_px: screen.width,
      display_height_px: screen.height,
      display_number: 1,
    },
  ];

  const messages = [
    {
      role: "user",
      content: task,
    },
  ];

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.error(`[CU] Iteration ${iterations}/${MAX_ITERATIONS}`);

    let response;
    try {
      response = await client.beta.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        tools,
        messages,
        betas: ["computer-use-2025-11-24"],
        thinking: { type: "adaptive" },
      });
    } catch (err) {
      console.error("[CU] API error:", err.message);
      return `Computer use error: ${err.message}`;
    }

    // Add assistant response to history
    messages.push({ role: "assistant", content: response.content });

    // Process tool calls
    const toolResults = [];
    let hasText = "";

    for (const block of response.content) {
      if (block.type === "text") {
        hasText += block.text;
      }

      if (block.type === "tool_use" && block.name === "computer") {
        const action = block.input.action;
        console.error(`[CU] Action: ${action}`, action === "screenshot" ? "" : JSON.stringify(block.input));

        const result = executeAction(action, block.input, scaleFactor);

        if (result && result.type === "screenshot") {
          const base64 = takeScreenshot();
          if (base64) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: base64,
                  },
                },
              ],
            });
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "Screenshot failed — display may not be accessible",
              is_error: true,
            });
          }
        } else {
          // Non-screenshot action — return success
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Action executed successfully",
          });
        }
      }
    }

    // If no tool calls, we're done
    if (toolResults.length === 0) {
      console.error("[CU] Task complete");
      return hasText || "Task completed.";
    }

    // Send tool results back
    messages.push({ role: "user", content: toolResults });
  }

  return "Computer use reached maximum iterations. Task may be incomplete.";
}

// ── CLI entry point ──
const task = process.argv.slice(2).join(" ");
if (!task) {
  console.error("Usage: node computer-use.js 'task description'");
  process.exit(1);
}

console.error(`[CU] Task: ${task}`);
const result = await runComputerUse(task);
// Output result to stdout (Agent SDK reads this)
console.log(result);
