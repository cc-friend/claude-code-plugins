#!/usr/bin/env node

// Claude Code Hook Observer — Dashboard Server
// Zero-dependency Node.js HTTP server serving the observer dashboard and REST/SSE APIs.
// Uses only built-in modules: http, fs, path, os.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let port = 7890;
  let dataDir = path.join(os.homedir(), '.claude', 'hook-observer-data');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[++i], 10);
    } else if (args[i] === '--data-dir' && args[i + 1]) {
      dataDir = args[++i];
    }
  }
  return { port, dataDir };
}

const { port: PORT, dataDir: DATA_DIR } = parseArgs();
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

// ---------------------------------------------------------------------------
// Startup: ensure data directory and events file exist
// ---------------------------------------------------------------------------

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(EVENTS_FILE)) {
  fs.writeFileSync(EVENTS_FILE, '');
}

// ---------------------------------------------------------------------------
// SSE connection tracking
// ---------------------------------------------------------------------------

// Active SSE response objects so we can broadcast special events (e.g. clear).
const sseClients = new Set();

// Shared byte-offset tracker. When events are cleared we reset this so that
// new SSE connections (and existing watchers) start from byte 0.
let globalFileOffset = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read and parse every line in events.jsonl, skipping blank or corrupt lines.
 * Returns an empty array when the file is missing or empty.
 */
function readEvents() {
  try {
    const raw = fs.readFileSync(EVENTS_FILE, 'utf8');
    if (!raw.trim()) return [];

    const events = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // Skip corrupt / partial lines
      }
    }
    return events;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Set common CORS headers on every response.
 */
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

/**
 * Send a JSON body with the given status code.
 */
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(body);
}

/**
 * Determine a simple MIME type from a file extension.
 */
function mimeType(ext) {
  const map = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  return map[ext] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET / — serve the dashboard SPA.
 */
function handleIndex(req, res) {
  const filePath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 500, { error: 'Could not read index.html' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
}

/**
 * GET /api/events — return all (or filtered) events as a JSON array.
 * Supports ?since=<timestamp> to return only events newer than that timestamp.
 */
function handleGetEvents(req, res) {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let events = readEvents();

    const since = reqUrl.searchParams.get('since');
    if (since) {
      const sinceMs = Number(since);
      events = events.filter(e =>
        e._observer && e._observer.timestamp > sinceMs
      );
    }

    sendJson(res, 200, events);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

/**
 * GET /api/stats — aggregate statistics over all events.
 */
function handleGetStats(req, res) {
  try {
    const events = readEvents();

    const sessions = new Set();
    const eventCounts = {};
    const toolCounts = {};
    let errorCount = 0;

    for (const evt of events) {
      // Unique sessions
      if (evt.session_id) {
        sessions.add(evt.session_id);
      }

      // Event name counts
      const name = evt.hook_event_name || 'Unknown';
      eventCounts[name] = (eventCounts[name] || 0) + 1;

      // Tool usage counts (only when a tool_name is present)
      if (evt.tool_name) {
        toolCounts[evt.tool_name] = (toolCounts[evt.tool_name] || 0) + 1;
      }

      // Error counts: StopFailure or PostToolUseFailure
      if (name === 'StopFailure' || name === 'PostToolUseFailure') {
        errorCount++;
      }
    }

    sendJson(res, 200, {
      totalEvents: events.length,
      sessions: sessions.size,
      eventCounts,
      toolCounts,
      errorCount,
    });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

/**
 * DELETE /api/events — truncate the events file and notify SSE clients.
 */
function handleDeleteEvents(req, res) {
  try {
    fs.writeFileSync(EVENTS_FILE, '');

    // Reset the shared file offset so SSE watchers don't try to seek past EOF
    globalFileOffset = 0;

    // Broadcast a "clear" event to every connected SSE client
    for (const client of sseClients) {
      client.write('event: clear\ndata: {}\n\n');
    }

    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

/**
 * GET /api/events/export — download events.jsonl as a file attachment.
 */
function handleExportEvents(req, res) {
  try {
    const raw = fs.existsSync(EVENTS_FILE)
      ? fs.readFileSync(EVENTS_FILE)
      : Buffer.alloc(0);

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': 'attachment; filename="hook-observer-events.jsonl"',
    });
    res.end(raw);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

/**
 * GET /api/events/stream — Server-Sent Events endpoint.
 *
 * 1. Send all existing events on connect (respecting Last-Event-ID).
 * 2. Watch the file for new bytes and push them incrementally.
 * 3. Heartbeat every 15 s to keep the connection alive.
 */
function handleSSE(req, res) {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Register this client for broadcast messages (e.g. clear)
  sseClients.add(res);

  // Determine if we should skip events up to a Last-Event-ID
  const lastEventId = req.headers['last-event-id'] || null;

  // --- Send existing events ---------------------------------------------------

  const events = readEvents();
  let skipping = !!lastEventId; // If we have a Last-Event-ID, skip until found

  for (const evt of events) {
    const id = evt._observer && evt._observer.event_id;

    if (skipping) {
      if (id === lastEventId) {
        skipping = false; // Found the marker; send everything after this
      }
      continue;
    }

    res.write(`id: ${id || ''}\ndata: ${JSON.stringify(evt)}\n\n`);
  }

  // If Last-Event-ID was provided but not found, send all events
  // (the client may have been disconnected for a long time and the ID
  // was purged when events were cleared).
  if (skipping) {
    for (const evt of events) {
      const id = evt._observer && evt._observer.event_id;
      res.write(`id: ${id || ''}\ndata: ${JSON.stringify(evt)}\n\n`);
    }
  }

  // --- Track byte offset for incremental reads --------------------------------

  let fileOffset;
  try {
    const stat = fs.statSync(EVENTS_FILE);
    fileOffset = stat.size;
  } catch {
    fileOffset = 0;
  }

  // --- Watch file for new data -------------------------------------------------

  const onFileChange = () => {
    try {
      const stat = fs.statSync(EVENTS_FILE);

      // If the file was truncated (e.g. DELETE /api/events), reset offset
      if (stat.size < fileOffset) {
        fileOffset = 0;
      }

      // Nothing new to read
      if (stat.size === fileOffset) return;

      // Read only the new bytes
      const bytesToRead = stat.size - fileOffset;
      const buf = Buffer.alloc(bytesToRead);
      const fd = fs.openSync(EVENTS_FILE, 'r');
      fs.readSync(fd, buf, 0, bytesToRead, fileOffset);
      fs.closeSync(fd);

      fileOffset = stat.size;

      // Parse new lines and push as SSE messages
      const chunk = buf.toString('utf8');
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          const id = evt._observer && evt._observer.event_id;
          res.write(`id: ${id || ''}\ndata: ${JSON.stringify(evt)}\n\n`);
        } catch {
          // Skip corrupt / partial lines
        }
      }
    } catch {
      // File may have been removed or be inaccessible; ignore
    }
  };

  // fs.watchFile is poll-based — more reliable across platforms than fs.watch
  fs.watchFile(EVENTS_FILE, { interval: 300 }, onFileChange);

  // --- Heartbeat ---------------------------------------------------------------

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  // --- Cleanup on disconnect ---------------------------------------------------

  const cleanup = () => {
    sseClients.delete(res);
    fs.unwatchFile(EVENTS_FILE, onFileChange);
    clearInterval(heartbeat);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
}

// ---------------------------------------------------------------------------
// Main request router
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  // CORS headers on every response
  setCors(res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse URL path (strip query string)
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  try {
    // --- Static: dashboard -----------------------------------------------------
    if (req.method === 'GET' && pathname === '/') {
      handleIndex(req, res);
      return;
    }

    // --- API: events CRUD ------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/events/stream') {
      handleSSE(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/events/export') {
      handleExportEvents(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      handleGetEvents(req, res);
      return;
    }

    if (req.method === 'DELETE' && pathname === '/api/events') {
      handleDeleteEvents(req, res);
      return;
    }

    // --- API: stats ------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/stats') {
      handleGetStats(req, res);
      return;
    }

    // --- Static: other public assets -------------------------------------------
    if (req.method === 'GET' && !pathname.startsWith('/api/')) {
      const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(__dirname, 'public', safePath);

      // Prevent directory traversal outside public/
      if (!filePath.startsWith(path.join(__dirname, 'public'))) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          sendJson(res, 404, { error: 'Not found' });
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeType(ext) });
        res.end(data);
      });
      return;
    }

    // --- 404 -------------------------------------------------------------------
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`Hook Observer dashboard: http://localhost:${PORT}`);
});
