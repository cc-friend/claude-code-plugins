# Hook Observer - Claude Code Plugin

A collection of Useful Claude Code tools and plugins by Tom Chen. For now it only contains the Hook Observer plugin.

[中文](README.zh.md)

<!-- ## Add Marketplace

```bash
claude plugin marketplace add cc-friend/claude-code-plugins
```

## Plugins

| Plugin | Description |
|--------|-------------|
| [hook-observer](#hook-observer) | Captures all 22 hook events and logs them to JSONL |

--- -->

## Hook Observer

A Claude Code plugin that captures **all 22 hook events** and logs them to `~/.claude/hook-observer-data/events.jsonl`.

Useful for debugging hooks when developing plugins, keeping history, and learning how Claude Code works under the hood.

To view these events in a real-time web dashboard, use my [CC Dashboard for Claude Code](https://github.com/cc-friend/ccfriend).

### Install

```bash
claude plugin marketplace add cc-friend/claude-code-plugins
claude plugin install hook-observer@cc-friend
```

### Architecture

Once installed, every Claude Code hook event is logged to `~/.claude/hook-observer-data/events.jsonl` as JSONL (one JSON object per line), enriched with `_observer` metadata (event ID, timestamp).

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

### Supported Events

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

### Uninstallation

```bash
claude plugin uninstall hook-observer
```

### Development

```bash
claude --plugin-dir /path/to/claude-code-plugins/hook-observer
```

This loads the plugin for a single session without installing it (uninstallation would not be necessary).

## License

MIT
