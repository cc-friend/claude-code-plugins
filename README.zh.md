# Tom Chen 的 Claude Code 插件集

Tom Chen 的一系列实用 Claude Code 工具和插件。目前仅包含 Hook Observer 插件。

[English](README.md)

<!-- ## 添加 Marketplace

```bash
claude plugin marketplace add toolsu/claude-code-plugins
```

## 插件列表

| 插件 | 描述 |
|------|------|
| [hook-observer](#hook-observer) | 捕获全部 22 个 hook 事件并记录到 JSONL |

--- -->

## Hook Observer

一个 Claude Code 插件，捕获**全部 22 个 hook 事件**并记录到 `~/.claude/hook-observer-data/events.jsonl`。

适用于开发插件时调试 hook、保留历史记录，以及了解 Claude Code 的内部运作原理。

如需在实时 Web 仪表盘中查看这些事件，请使用 [Claude Code Dashboard](https://github.com/toolsu/claude-code-dashboard)。

### 安装

```bash
claude plugin marketplace add toolsu/claude-code-plugins
claude plugin install hook-observer@toolsu
```

### 架构

安装后，每个 Claude Code hook 事件都会以 JSONL 格式（每行一个 JSON 对象）记录到 `~/.claude/hook-observer-data/events.jsonl`，并附带 `_observer` 元数据（事件 ID、时间戳）。

```
Claude Code hook 事件（通过 stdin 传入 JSON）
        |
        v
scripts/hook-handler.js    添加元数据，追加写入 JSONL
        |
        v
~/.claude/hook-observer-data/events.jsonl
```

- **hook-handler.js**：21 个事件的通用日志记录器。从 stdin 读取 JSON，添加 `_observer` 元数据（`event_id`、`timestamp`），追加写入 JSONL 文件。立即以退出码 0 退出。
- **worktree-handler.js**：`WorktreeCreate` 透传处理器。记录事件后，运行 `git worktree add` 并将路径输出到 stdout。

所有 hook 均以 `async: true` 运行（`WorktreeCreate` 除外），因此不会拖慢 Claude Code。

### 支持的事件

| 分类 | 事件 | 描述 |
|------|------|------|
| 会话 | `SessionStart` | 会话开始或恢复 |
| 会话 | `UserPromptSubmit` | 用户提交提示词 |
| 会话 | `SessionEnd` | 会话终止 |
| 工具 | `PreToolUse` | 工具调用执行前 |
| 工具 | `PostToolUse` | 工具调用成功后 |
| 工具 | `PostToolUseFailure` | 工具调用失败后 |
| 工具 | `PermissionRequest` | 出现权限确认对话框 |
| 停止 | `Stop` | Claude 完成响应 |
| 停止 | `StopFailure` | 因 API 错误导致回合结束 |
| 代理 | `SubagentStart` | 子代理被创建 |
| 代理 | `SubagentStop` | 子代理完成 |
| 代理 | `TeammateIdle` | 队友即将进入空闲状态 |
| 任务 | `TaskCompleted` | 任务标记为已完成 |
| 任务 | `WorktreeCreate` | 正在创建工作树 |
| 任务 | `WorktreeRemove` | 正在移除工作树 |
| 配置 | `InstructionsLoaded` | CLAUDE.md 文件已加载 |
| 配置 | `ConfigChange` | 设置文件已更改 |
| 配置 | `PreCompact` | 上下文压缩前 |
| 配置 | `PostCompact` | 上下文压缩完成后 |
| MCP | `Elicitation` | MCP 服务器请求输入 |
| MCP | `ElicitationResult` | 用户响应 MCP 输入 |
| 通知 | `Notification` | Claude Code 发送通知 |

### 卸载

```bash
claude plugin uninstall hook-observer
```

### 开发

```bash
claude --plugin-dir /path/to/claude-code-plugins/hook-observer
```

这会在单次会话中加载插件，无需安装（也无需卸载）。

## 许可证

MIT
