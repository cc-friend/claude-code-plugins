# Claude Code Hook Observer

A Claude Code plugin that captures **all 22 hook events** and logs them to `~/.claude/hook-observer-data/events.jsonl`.

Useful for debugging hooks when developing plugins, keeping history, and learning how Claude Code works under the hood.

## Install

```bash
claude plugin marketplace add toolsu/claude-code-hook-observer
claude plugin install hook-observer@hook-observer-marketplace
```

## What It Does

Once installed, every Claude Code hook event is logged to `~/.claude/hook-observer-data/events.jsonl` as JSONL (one JSON object per line), enriched with `_observer` metadata (event ID, timestamp).

To view these events in a real-time web dashboard, use [CC Dashboard](https://github.com/toolsu/claude-code-dashboard).

## Development

```bash
claude --plugin-dir /path/to/claude-code-hook-observer
```

This loads the plugin for a single session without installing it.

## Architecture

```
Claude Code hook event (JSON via stdin)
        |
        v
scripts/hook-handler.js    Enriches with metadata, appends to JSONL
        |
        v
~/.claude/hook-observer-data/events.jsonl
```

- **hook-handler.js**: universal logger for 21 events. Reads JSON from stdin, enriches with `_observer` metadata (`event_id`, `timestamp`), appends to JSONL file. Exits 0 immediately.
- **worktree-handler.js**: `WorktreeCreate` passthrough. Logs the event, then runs `git worktree add` and prints the path to stdout.

All hooks run with `async: true` (except `WorktreeCreate`) so they never slow down Claude Code.

## Supported Events

| Category | Event | Description |
|----------|-------|-------------|
| Session | `SessionStart` | Session begins or resumes |
| Session | `UserPromptSubmit` | User submits a prompt |
| Session | `SessionEnd` | Session terminates |
| Tool | `PreToolUse` | Before a tool call executes |
| Tool | `PostToolUse` | After a tool call succeeds |
| Tool | `PostToolUseFailure` | After a tool call fails |
| Tool | `PermissionRequest` | Permission dialog appears |
| Stop | `Stop` | Claude finishes responding |
| Stop | `StopFailure` | Turn ends due to API error |
| Agent | `SubagentStart` | Subagent is spawned |
| Agent | `SubagentStop` | Subagent finishes |
| Agent | `TeammateIdle` | Teammate about to go idle |
| Task | `TaskCompleted` | Task marked as completed |
| Task | `WorktreeCreate` | Worktree being created |
| Task | `WorktreeRemove` | Worktree being removed |
| Config | `InstructionsLoaded` | CLAUDE.md file loaded |
| Config | `ConfigChange` | Settings file changed |
| Config | `PreCompact` | Before context compaction |
| Config | `PostCompact` | After compaction completes |
| MCP | `Elicitation` | MCP server requests input |
| MCP | `ElicitationResult` | User responds to MCP input |
| Notification | `Notification` | Claude Code sends notification |

## License

MIT
