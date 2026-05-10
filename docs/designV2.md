# Design: Omni V2

Updated: 2026-04-08

## Problem Statement

随时随地和 AI 沟通，不只是坐在电脑前。

## Core Idea

一个 Plugin 接口 + 一个状态机。飞书是 Plugin，CC 也是 Plugin，Core 不关心它们的区别。

```
用户 → 飞书 Plugin → Core → CC Plugin → Core → 飞书 Plugin → 用户
```

## Constraints

- 个人使用，单用户
- 运行在 Mac Mini（常驻）
- TypeScript
- SQLite

## Plugin Interface

```
interface Plugin {
  name: string

  // Core 调用：有消息给这个 Plugin
  handle(conversationId: string, message: Message): void

  // Plugin 调用：要发消息
  send(conversationId: string, message: Message): void
}
```

不分 IMPlugin 和 AIPlugin。一个 Plugin 接口，所有插件平等。

### OmniCore

Core 只做两件事：消息路由 + 状态管理。

```
class OmniCore {
  plugins: Map<string, Plugin>
  stateMachine: StateMachine

  register(plugin: Plugin): void
  unregister(name: string): void

  createConversation(name: string, plugins: string[], context?: object): Conversation

  // Plugin 调用这个发消息
  onSend(conversationId: string, from: Plugin, message: Message) {
    // 1. 存消息
    // 2. 更新状态
    // 3. 路由给对话里其他 Plugin
    for (const plugin of this.getOtherPlugins(conversationId, from)) {
      plugin.handle(conversationId, message)
    }
  }
}
```

### Message

```
Message {
  conversationId: string
  fromPlugin: string       // "feishu" / "claude-code"
  content: string
  timestamp: timestamp
  type: "text" | "system"
}
```

## State Machine

3 个状态，够用：

```
idle → executing → idle（完成）
                → idle（错误/中断）
```

- idle：空闲，等待消息
- executing：AI 正在工作
- error：出错了（短暂停留后回到 idle）

状态存在 conversations 表的 execution 字段，不需要单独的表。

## CC Plugin

使用 Agent SDK（`@anthropic-ai/claude-agent-sdk`）。

### Session 管理

每个 Conversation 对应一个 CC session，session ID 存在 conversations.bindings 里：

```typescript
class CCPlugin implements Plugin {
  name = "claude-code"

  handle(conversationId: string, message: Message) {
    const conv = this.core.getConversation(conversationId)
    const sessionId = JSON.parse(conv.bindings)["claude-code"]

    const q = query({
      prompt: message.content,
      options: sessionId
        ? { resume: sessionId, persistSession: true }
        : { persistSession: true }
    })
    for await (const event of q) {
      if (event.type === "system" && event.subtype === "init") {
        // 首次对话，保存 sessionId
        const bindings = JSON.parse(conv.bindings)
        bindings["claude-code"] = event.session_id
        this.core.updateConversation(conversationId, { bindings: JSON.stringify(bindings) })
      }
      this.core.onSend(conversationId, this, {
        type: event.type === "result" ? "text" : "system",
        content: extractContent(event),
        timestamp: Date.now()
      })
    }
  }
}
```

### 为什么用 SDK 而不是 `claude -p`

- 内置 session 持久化，不需要自己拼上下文
- 内置 hooks 参数，不需要改 `~/.claude/settings.json`
- 内置 `canUseTool` 权限回调（P1 接飞书确认卡片）
- 内置中断（`query.close()` / `abortController`）
- Session 与 CLI 互通：`claude --resume <sessionId>`

### 执行队列

executing 状态下新消息排队，当前 query 结束后自动处理下一条。

## 飞书 Plugin

```typescript
class FeishuPlugin implements Plugin {
  name = "feishu"

  handle(conversationId: string, message: Message) {
    // 收到 CC 回复 → 发到飞书群
    const conv = this.core.getConversation(conversationId)
    const groupId = JSON.parse(conv.bindings)["feishu"]
    sendToFeishu(groupId, message.content)
  }

  // 飞书 webhook 收到用户消息 →
  onFeishuCallback(groupId: string, userMessage: string) {
    const conversationId = this.findConversationByBinding("feishu", groupId)
    if (!conversationId) {
      // 未知群 → 自动创建会话
      conversationId = this.core.createConversation(`feishu-${groupId}`, ["feishu", "claude-code"], {
        bindings: JSON.stringify({ feishu: groupId })
      })
    }
    this.core.onSend(conversationId, this, {
      type: "text",
      content: userMessage,
      timestamp: Date.now()
    })
  }
}
```

## 多会话管理

- 一个飞书群 = 一个 Conversation = 一个 CC session
- 新飞书群发来消息 → 自动创建会话（bindings 存 groupId）
- 不同群的消息路由到不同 session，上下文隔离
- CLI 接手：`omni list` 查 sessionId → `claude --resume <id>`

## Data Model

2 张表。

```sql
conversations {
  id          TEXT PRIMARY KEY,
  name        TEXT,
  execution   TEXT DEFAULT 'idle',   -- idle / executing / error
  context     TEXT,                  -- JSON: { "workingDirectory": "/path" }
  bindings    TEXT,                  -- JSON: { "feishu": "groupId", "claude-code": "sessionId" }
  created_at  TIMESTAMP,
  updated_at  TIMESTAMP
}

messages {
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),
  from_plugin     TEXT,
  content         TEXT,
  timestamp       TIMESTAMP,
  type            TEXT DEFAULT 'text'
}
```

**bindings 字段：** 存储每个插件在当前对话中的会话标识。格式为 JSON object，key 是 pluginName，value 是插件侧的 session ID（飞书 groupId、CC sessionId、大象 groupId 等）。插件启动时从自己那列读取，新增 IM 或 Agent 只需多一行 key-value。

## MVP

| Feature | MVP |
|---------|-----|
| OmniCore（消息路由 + 状态机） | Yes |
| Plugin 接口 | Yes |
| CC Plugin（Agent SDK） | Yes |
| 飞书 Plugin | Yes |
| SQLite（2 张表） | Yes |
| CLI（start/stop/status） | Yes |
| 确认流程（canUseTool + 飞书卡片） | P1 |
| 执行队列 | P1 |
| 大象 Plugin | Phase 2 |
| HTTP + WebSocket API | Phase 2 |
| Swift 灵动岛 | Phase 2 |
| Web 客户端 | Phase 3 |

## Success Criteria

飞书发消息 → CC 执行 → 结果回飞书。

## Next Steps

1. 初始化项目（TypeScript + SQLite）
2. 实现 Plugin 接口 + OmniCore
3. 实现 CC Plugin（SDK query + resume）
4. 实现飞书 Plugin（webhook + 消息收发）
5. 实现 CLI（start/stop/status）
6. 端到端测试

## ADR: Why Not im2cc

im2cc 已经能用（飞书 + CC + 灵动岛），但：
- 加 IM 需要改核心代码
- AI 和 IM 两侧架构不对称（ToolDriver 是插件化的，IM 侧不是）
- 没有统一 API 给外部客户端
- 子进程 + stream-json 的方式不如 SDK 干净

Omni V2 用一个 Plugin 接口统一两侧，更精巧。

## ADR: Why Agent SDK

1. 内置 session 持久化，省掉上下文管理
2. 内置 hooks 参数，不污染全局配置
3. 内置 canUseTool 权限回调
4. 内置中断机制
5. Session 与 CLI 互通（已验证）

## ADR: Why 2 Tables

插件侧数据（CC sessionId、飞书 groupId 等）存在 conversations.bindings JSON 字段里。不需要单独的表，不需要 Plugin 自己管文件。Omni 重启后 Plugin 从 bindings 恢复。加新 IM 或 Agent 只需多一个 key-value，不改 schema。
