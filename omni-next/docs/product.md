# Omni Next 产品方向

更新日期：2026-05-10

## 一句话定义

Omni 是一个 local-first 的 Codex 工作记忆和 skill 系统。

它管理所有 Codex session，异步分析每天的工作过程，提取可复用的 skill candidates，并在用户确认后写入本地 Markdown skills。

## 产品命题

Codex 正在变成真正能工作的编程协作者，但它的工作历史被困在一个个孤立的 session 里。

每个 session 里都有很多有价值的上下文：

- 用户真正想做什么
- Codex 尝试了什么
- 它碰过哪些文件、命令、分支、commit 和 PR
- 做过哪些决策
- 哪些地方失败了
- 下一步应该做什么
- 发现了哪些项目知识
- 暴露了哪些用户偏好

今天这些信息大多是线性的、噪声很高的，也很难被下一次工作复用。

Omni 要把 Codex session 变成持久、可搜索、可审查、可复用的工作技能库。

## 核心转向

旧的产品表述是：

> 随时随地和 AI 沟通，不只是坐在电脑前。

新的产品表述是：

> 管理所有 Codex session，并把每天的工作经验沉淀成可复用 skills。

这意味着 Omni 不再是一个 IM 集成工具，而是一个 Codex 工作记忆系统。

IM 仍然可以存在，但它不是产品中心。它只是一个客户端或通知入口。真正的中心是 Codex sessions、daily evolution jobs 和 Markdown skills。

## 为什么重要

Codex 可以执行工作，但用户需要一个地方来跨时间管理这些工作。

Omni 应该能回答这些问题：

- 现在有哪些 Codex session 正在运行？
- 这个 session 做成了什么？
- 它在哪个 repo、哪个分支上工作？
- 上次我们做过什么决策？
- 这个项目里哪些命令是有效的？
- 哪些经验应该被写成 skill，供未来 session 使用？
- 新 session 应该注入哪些 skills？
- 我能不能 resume、fork、archive 或总结一个 session？

Omni 的价值不只是远程访问 AI，而是让每一天的 Codex 工作成为下一次的上下文资产。

## 产品原则

### Session First

Omni 的第一对象不是聊天消息，而是 Codex session。

消息只是 session 的一部分。工具调用、命令输出、文件变更、权限确认、diff、截图、总结和提取出的事实，也都是 session 的一部分。

### Local First

Omni 运行在用户自己的机器上，可以看到本地 workspace、文件、git 状态和 Codex session 存储。

云同步可以以后再做。第一版应该是私密、可检查、贴近真实开发环境的。

### 异步学习，不阻塞工作

Codex 的主工作流不应该被学习流程阻塞。

Omni 先捕获 session events，再由后台 job 异步分析。第一版优先采用 by day 的学习节奏：

- 白天：Codex 正常工作，Omni 只捕获 sessions 和 events
- 晚上或手动触发：Daily Evolution Job 聚合当天 sessions
- 后台：提取 daily digest 和 skill candidates
- 前台：用户 review、编辑、合并或拒绝
- 写入：确认后的内容进入 Markdown skills

这个设计借鉴 Acontext 的异步 learning pipeline，但不按每个 task 立即学习，而是按天聚合后再沉淀，减少噪声。

### 不只是存档，而是沉淀 skill

只保存 transcript 不够。

Omni 必须从 session 中提取可以指导未来工作的 skill candidates：

- 决策
- todo
- 项目事实
- 用户偏好
- 命令
- bug
- 架构笔记
- 文件引用
- artifact

每一条 skill candidate 都应该能回到原始 session event，避免“AI 自己觉得是这样”的记忆污染。

### 复用才是回报

只有沉淀出来的 skills 能被复用，这个系统才有价值。

一个新 session 应该可以带着经过选择的 skills 启动：

- 以前 session 里提取出的项目事实
- 用户偏好
- 最近做过的决策
- 未完成的 todo
- 已知命令和环境配置
- 相关文件和 artifact

用户应该能选择哪些 skills 被带入下一次工作。

### Codex-Native IM，而不是通用 IM

Omni 可以长得像聊天，但它不应该变成一个通用 IM。

它应该避开通用 IM 的陷阱：

- 不做社交关系链
- 不做表情包生态
- 不做泛群聊产品
- 不陷入已读回执
- 不替代企业聊天工具

聊天界面的存在，是为了操作 Codex session。

## 核心对象

### Workspace

一个本地项目或工作目录。

例子：

- 一个 git repository
- 一个笔记文件夹
- 一个本地 app workspace

关键字段：

- id
- name
- path
- default branch
- project metadata
- created at
- last active at

### Session

一个 Codex 执行上下文。

例子：

- 一个 Codex thread
- 一个 Codex CLI session
- 一个从历史 session fork 出来的新 session

关键字段：

- id
- codex session id
- title
- workspace id
- status：`idle | running | awaiting_approval | completed | failed | archived`
- cwd
- branch
- model
- started at
- ended at
- last active at

### Session Event

session 内部的原始事件或归一化事件。

例子：

- 用户消息
- assistant 消息
- tool call
- command started
- command output
- file changed
- approval requested
- approval granted or denied
- result
- error

关键字段：

- id
- session id
- type
- payload
- timestamp

### Daily Digest

Daily Evolution Job 生成的当天工作摘要。

它不是长期 skill，而是用户 review 的入口：先让用户看懂今天发生了什么，再决定哪些经验值得沉淀。

例子：

- 今天主要讨论了 Omni 从 IM bot 转向 Codex 工作记忆系统。
- 今天调研了 Acontext、MemOS、Memoria、EvoSkill 等自进化项目。
- 今天形成了一个产品判断：第一版按天异步生成 skill candidates，而不是实时写长期记忆。

关键字段：

- id
- date
- summary
- completed items
- failed or blocked items
- repeated patterns
- candidate count
- source session ids
- created at
- updated at

### Artifact

session 中产生的持久产物或引用。

例子：

- diff
- file
- screenshot
- PR
- report
- log
- generated document

关键字段：

- id
- session id
- type
- uri
- metadata
- created at

### Daily Evolution Job

一个异步后台学习任务，按天聚合 Codex sessions。

它不直接写长期记忆，而是生成可审查的中间产物。

输入：

- 当天 Codex sessions
- session events
- command outputs
- file changes
- diff / PR / artifact
- 用户消息和 assistant 结果

输出：

- daily digest
- completed / failed / partial tasks
- repeated patterns
- user corrections
- skill candidates

关键字段：

- id
- date
- status：`pending | running | review_ready | failed | completed`
- source session ids
- digest
- created at
- updated at

### Skill Candidate

Daily Evolution Job 生成的候选 skill。

它还不是长期 skill，必须经过用户 review。

例子：

- “这个 repo 的 build/typecheck 流程”
- “调研 GitHub 项目时如何避免复述 README 大词”
- “遇到某类 CI 失败时先检查哪些日志”
- “产品讨论中如何把抽象概念降维成 MVP 闭环”

关键字段：

- id
- daily evolution job id
- title
- kind：`sop | warning | preference | project_fact | research_pattern`
- content
- source session ids
- source event ids
- status：`candidate | accepted | edited | rejected | merged`
- target skill id
- created at
- updated at

### Skill

用户确认后的长期可复用知识。

第一版优先使用 Markdown 文件承载 skill，而不是只写入向量库。这样用户可以读、改、review、diff 和版本控制。

建议结构：

```text
skills/
  product-research/
    SKILL.md
    self-evolving-agents.md
  repo-operations/
    SKILL.md
    omni.md
```

每个 `SKILL.md` 定义这个 skill 的适用场景、文件结构和记录规范。具体经验可以写在附属 Markdown 文件里。

关键字段：

- id
- name
- description
- path
- status：`active | archived`
- source candidate ids
- created at
- updated at

## 核心用户体验

用户打开 Omni 后，首先看到所有 Codex session。

每个 session 展示：

- title
- workspace
- 当前状态
- 最近活动时间
- 简短总结
- 重要 artifact
- 提取出的 todo 和决策

用户可以打开一个 session，看到 timeline：

- messages
- tool calls
- command outputs
- file changes
- approvals
- summaries
- linked skill candidates

用户可以从这些入口创建新 session：

- 一个空 prompt
- 一个已有 workspace
- 一个历史 session
- 选中的 skills
- 未完成 todo
- 另一个 session 的 fork

用户还可以打开 Daily Evolution 页面：

- 查看某一天 Codex 做了哪些事
- 查看系统生成的 daily digest
- review skill candidates
- accept / edit / reject / merge candidates
- 查看每条 candidate 的来源 session 和证据
- 将确认后的内容写入 Markdown skills

## MVP

第一版只需要证明一件事：

> Omni 可以捕获一天的 Codex sessions，异步生成 skill candidates，经用户确认后写入 Markdown skills，并在之后的 Codex session 中复用。

### MVP 功能

- 列出本地 workspaces
- 列出 Codex sessions
- 创建新的 Codex session
- resume 已有 Codex session
- 展示 session timeline
- 捕获原始 session events
- 生成 daily digest
- 按天提取 skill candidates
- 展示 skill candidates，并保留 source links
- 用户可以 accept / edit / reject / merge candidates
- 写入本地 Markdown skills
- 新 session 可以选择注入相关 skills

### 非 MVP

- 通用 IM
- 飞书或大象集成
- 移动端 app
- Swift 灵动岛
- 多人协作
- 云同步
- 通用插件市场
- 高级权限工作流
- 自动无审核写入长期 skill
- eval-driven self-improvement

## 第一条产品闭环

1. 用户一天内正常使用 Codex。
2. Omni 捕获当天的 sessions 和 events。
3. Daily Evolution Job 异步聚合当天工作。
4. Omni 生成 daily digest 和 skill candidates。
5. 用户 review、编辑、合并或拒绝 candidates。
6. 被接受的 candidates 写入 Markdown skills。
7. 用户之后启动另一个 Codex session。
8. Omni 推荐相关 skills。
9. 新 session 带着更好的工作经验开始。

这条闭环就是产品。

## 开放问题

- 今天能通过稳定 API 捕获多少 Codex session 信息？
- Omni 第一版应该 wrap Codex 执行，还是 import 已有 session，还是两者都做？
- 最小可用的 session event schema 是什么？
- Daily Evolution Job 应该每天自动跑，还是先手动触发？
- skill candidates 应该如何被确认、编辑、merge 或 reject？
- skill injection 应该每次显式选择，还是部分自动？
- 第一版 UI 应该是 local web app、desktop app，还是 terminal UI？
- session 应该和 workspace、task、branch、conversation 怎么对应？
- Markdown skills 应该放在 Omni 自己目录，还是写入每个 repo 的 `.omni/skills`？

## 工作名称

Omni 可以继续叫 Omni，但内部产品分类必须清楚：

> Codex 工作记忆和 skill 系统。

不是：

> AI IM。

不是：

> 远程聊天机器人。

不是：

> 通知桥。
