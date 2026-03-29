#!/usr/bin/env node

// Claude Code Hook Observer — Universal Event Logger
// Reads hook event JSON from stdin, enriches with metadata, appends to JSONL file.
// Exits 0 always to never block Claude Code.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function getDataDir() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data-dir' && args[i + 1]) return args[i + 1];
  }
  return path.join(os.homedir(), '.claude', 'hook-observer-data');
}

const DATA_DIR = getDataDir();
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        // If stdin isn't valid JSON, wrap the raw text
        event = { _raw: raw, hook_event_name: 'Unknown' };
      }

      // Add observer metadata
      event._observer = {
        event_id: 'evt_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
        timestamp: Date.now(),
        received_at: new Date().toISOString(),
      };

      // Ensure data directory exists
      fs.mkdirSync(DATA_DIR, { recursive: true });

      // Append as single JSONL line
      fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n');
    } catch {
      // Silently ignore errors — never block Claude Code
    }

    // Write empty JSON to stdout (expected by Claude Code for async hooks)
    process.stdout.write('{}');
  });
}

main();
