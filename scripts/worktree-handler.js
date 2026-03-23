#!/usr/bin/env node

// Claude Code Hook Observer — WorktreeCreate Passthrough
// Logs the event via hook-handler.js, then creates a git worktree and prints its path.
// stdout MUST contain only the worktree path (Claude Code reads it).
// Cross-platform replacement for worktree-handler.sh.

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      let input;
      try {
        input = JSON.parse(raw);
      } catch {
        input = {};
      }

      const name = input.name || 'unnamed';
      const cwd = input.cwd || process.cwd();

      // Log the event via hook-handler.js in background (fire-and-forget)
      const handlerPath = path.join(__dirname, 'hook-handler.js');
      const child = spawn(process.execPath, [handlerPath], {
        stdio: ['pipe', 'ignore', 'ignore'],
        detached: true,
      });
      child.stdin.write(raw);
      child.stdin.end();
      child.unref();

      // Set worktree path
      const worktreePath = path.join(cwd, '.claude', 'worktrees', name);

      // Create parent directory
      fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

      // Create git worktree (all git output to stderr)
      execFileSync('git', ['-C', cwd, 'worktree', 'add', worktreePath, 'HEAD'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Print the absolute path (the ONLY stdout — Claude Code reads this)
      process.stdout.write(worktreePath);
    } catch (err) {
      // Write error to stderr, never block Claude Code
      process.stderr.write(String(err) + '\n');
      process.exitCode = 1;
    }
  });
}

main();
