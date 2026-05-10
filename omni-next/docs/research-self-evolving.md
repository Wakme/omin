# 自进化 Agent 项目调研

更新日期：2026-05-10

## 结论摘要

“自进化”不是完全空洞，但它在 GitHub 上被严重泛化。多数项目并不是让模型本身自动变强，而是在做更具体的闭环：

- 从历史 session / trajectory 中提取经验
- 把经验写成 memory、skill、policy、workflow 或 prompt variant
- 在下一次任务中召回
- 用任务结果、测试、benchmark 或人工反馈决定是否保留

因此，真正可落地的“自进化”更像：

> 经验捕获 + 结构化沉淀 + 可控召回 + 评价筛选。

对 Omni 来说，第一版不应该宣称“自进化”。更准确的方向是：

> 从 Codex session 中提取可追溯、可编辑、可复用的工作记忆。

等这个闭环成立后，再考虑把“记忆”升级为“技能”和“评测驱动的改进”。

## 调研范围

本次重点看这些项目和资料：

- [GitHub self-evolving topic](https://github.com/topics/self-evolving)
- [EvoAgentX](https://github.com/EvoAgentX/EvoAgentX)
- [Awesome Self-Evolving Agents](https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents)
- [AgentEvolver](https://github.com/modelscope/AgentEvolver)
- [Acontext](https://github.com/memodb-io/Acontext)
- [MemOS](https://github.com/MemTensor/MemOS)
- [Memoria](https://github.com/matrixorigin/Memoria)
- [GenericAgent](https://github.com/lsdefine/GenericAgent)
- [EvoSkill](https://github.com/sentient-agi/EvoSkill)
- [Hermes Agent Self-Evolution](https://github.com/NousResearch/hermes-agent-self-evolution)
- [CodeMesh](https://github.com/kiliman/codemesh)
- [self-evolve for OpenClaw](https://github.com/longmans/self-evolve)
- [HEBBS](https://github.com/hebbs-ai/hebbs)

## 一张总表

| 项目 | 它说自己在做什么 | 知识从哪来 | 怎么总结 / 沉淀 | 怎么召回 | 闭环动作 | 对 Omni 的启发 |
| --- | --- | --- | --- | --- | --- | --- |
| EvoAgentX | Self-evolving agent ecosystem | 用户目标、agentic workflow 执行轨迹、任务结果、评测数据集 | 自动构建 multi-agent workflow；通过 evaluator 给 workflow 表现打分；再用 self-evolving algorithms 优化 workflow | 召回的不是单条记忆，而是优化后的 workflow / agent 配置 | 生成 workflow → 执行 → 评测 → 优化 workflow → 再执行 | 自进化需要 evaluator；没有评价函数，只存记忆不算 evolution |
| AgentEvolver | Self-evolving training framework | 环境交互轨迹、agent rollout、自动生成的任务、跨任务经验、状态动作贡献 | self-questioning 生成任务；self-navigating 复用经验提高探索；self-attributing 给长轨迹做 credit assignment | 通过经验管理和 policy / training pipeline 影响后续探索与训练 | 造任务 → rollout → 经验总结 → 归因 → 训练 / 优化 agent policy | 更偏训练和研究；Omni 不应在 MVP 里碰这么重的 RL 闭环 |
| Acontext | Agent Skills as Memory Layer | session messages、tool calls、artifacts、task status、任务完成/失败信号、用户偏好 | Task Agent 抽取任务和状态；完成/失败后 LLM distillation 提取 what worked / what failed / preference；Skill Agent 写入 Markdown skill | agent 通过 `list_skills` / `get_skill` / `get_skill_file` 按需读取整份 skill 文件 | 存消息 → 抽任务 → 判断 success/failed → 蒸馏 → 写 skill → 下次 tool recall | 很接近 Omni：Codex daily/session → skill candidate → 用户确认 → Markdown skill |
| MemOS | Memory OS | 对话、长期记忆、knowledge base、tool traces、persona、多模态输入、用户反馈 | 统一 Memory API；结构化 graph memory；混合检索；智能去重；task auto-summary；memory feedback / correction | FTS5 + vector + tag/filter + memory-aware chat；可跨 agent / project / user 组合 memory cube | 存储 → 检索 → 用户反馈修正 → 去重 / 更新 → 后续对话使用 | memory 产品必须支持编辑、修正、隔离、共享；不是只写 embeddings |
| Memoria | Git for AI Agent Memory | agent 写入的 memory mutation、memory state、memory provenance | 每次 memory 变更进入版本化数据层；支持 snapshot、branch、merge、rollback、audit trail | agent 通过 MCP / API retrieve memory；用户可回滚或合并 memory 分支 | memory 写入 → 快照 → 分支试验 → merge / rollback → 审计 | Omni 的 memory/skill 需要来源和版本；避免脏记忆不可逆污染 |
| GenericAgent | Self-evolving skill tree | agent 真实执行路径：浏览器、终端、文件系统、手机控制、调试过程、成功结果 | 任务完成后把 execution path crystallize 成 skill；长期形成个人 skill tree | 下次类似任务直接召回 skill，用一行调用或已有流程替代重新探索 | 新任务 → 自主探索 → 完成验证 → crystallize skill → 下次复用 | “成功路径 → 技能”的表达很强；Omni by day 可以从成功 session 提炼操作 skill |
| EvoSkill | 自动发现和合成 reusable agent skills | coding agent 的失败 trajectories、失败模式、执行结果、eval traces | 分析 failure patterns；提出 skill 或 prompt 改进；用 GEPA/DSPy 风格算法生成候选 | 把保留下来的 skill 安装到 coding agent，让未来任务读取和执行 | 失败轨迹 → 失败归因 → 生成候选 skill → 评测 → 保留最佳 | Omni 后期可重点挖 failed Codex sessions，生成 pitfall / do-not-do / repair skill |
| Hermes Self-Evolution | 优化 skills/prompts/tools/code | Hermes session history、Claude Code / Copilot / Hermes traces、现有 skill/prompt/tool/code、synthetic eval data | GEPA 读取 execution traces，理解失败原因，生成 candidate variants；constraint gates 检查测试、大小、benchmark | 通过 PR 更新 Hermes Agent 的 skill/prompt/tool/code，未来运行自然使用新版 | 读当前资产 → 生成 eval dataset → 变异候选 → 评测 / gates → 最佳版本提 PR | 真正 evolution 要有候选、评测、约束和晋升机制；Omni 早期只做 candidate，不自动晋升 |
| CodeMesh | Self-improving MCP server | agent 调用 MCP tools 的探索过程、不清楚的 tool output、agent 写下的文档 | 当工具输出不清楚时，强制 agent 文档化后再继续；把探索经验变成 API / 输出说明 | 未来 agent 通过 CodeMesh 的 tool discovery / API docs 读取这些文档 | 工具探索 → 遇到不清楚 → 写文档 → 存入工具知识 → 下次少试错 | “把探索成本转成文档资产”很适合 Omni：命令、工具、repo 约定都可这样沉淀 |
| self-evolve | OpenClaw 自学习插件 | 对话、agent 输出、用户反馈、任务片段、episodic memories | 聚合多轮任务；检测反馈；更新 utility / Q values；写入 episodic memory store | prompt build 前检索 episodic memories 并注入上下文 | before_prompt recall → 执行 → feedback scoring → learning → persist episodic memory | 轻量闭环可以从 episodic memory + feedback score 开始，不一定先做复杂 skill |
| HEBBS | Memory engine | agent 写入的事件、实体相关历史、结果、因果关系、跨场景经验 | consolidation 把 episodes 变成 insights；支持 decay、reinforcement、revision lineage | 四种召回：similarity、temporal、causal、analogical | remember → recall → reflect/consolidate → decay/reinforce → insight query | Omni 召回不应只有“相似”；还要能问“之前按什么顺序做”“为什么失败”“哪个模式可迁移” |

## 类型拆解

### 1. Memory Layer

代表项目：MemOS、Memoria、HEBBS、Acontext 的一部分。

这一类的核心不是“进化”，而是“记忆工程”：

- 怎么存
- 怎么查
- 怎么改
- 怎么审计
- 怎么避免脏记忆污染未来上下文

MemOS 强调统一 memory API、图结构、可编辑、tool trace、多模态和反馈修正。Memoria 更像把 Git 的操作模型搬到 memory 上：snapshot、branch、merge、rollback。HEBBS 把 recall 分成 similarity、temporal、causal、analogical，而不是只做 top-k vector search。

对 Omni 的启发：

- Codex session 里提取出的 memory 必须能追溯来源。
- memory 需要状态：candidate、accepted、rejected、stale。
- memory 不应该只有 embedding 检索，还要支持按 workspace、文件、命令、时间、失败原因召回。

### 2. Skill Layer

代表项目：Acontext、GenericAgent、EvoSkill、CodeMesh。

这一类最接近我们讨论的 Omni。

它们不满足于存事实，而是把经验变成可复用的操作知识：

- “这个项目怎么跑测试”
- “遇到这个错误怎么修”
- “这个 MCP tool 的输出是什么意思”
- “这个 API 参数坑在哪里”
- “完成这种任务的标准步骤是什么”

Acontext 的设计尤其值得看：它把 session messages 作为输入，在任务完成或失败时触发学习，通过 LLM distillation 提取 what worked / what failed / preferences，再由 Skill Agent 写入 Markdown skill。它强调 Markdown、可编辑、可版本控制、可挂载到 sandbox。

GenericAgent 的说法更直接：第一次自主探索，完成后把 execution path crystallize 成 skill，下次类似任务直接召回。

CodeMesh 的 “auto-augmentation” 很产品化：agent 遇到不清楚的工具输出时，强制先写文档再继续。下一次 agent 不再重复试错。

对 Omni 的启发：

- 先不要做“全局智能记忆”，先做 Codex session 的 skill/fact extraction。
- 输出物可以是 Markdown 文件，而不是黑盒向量库。
- 每条 skill 都要有 evidence：来自哪个 session、哪个 command、哪个 diff、哪个错误。
- 失败也很重要，失败 session 可以产出 warning / pitfall / do-not-do。

### 3. Evaluation-Driven Evolution

代表项目：EvoAgentX、Hermes Agent Self-Evolution、AgentEvolver、EvoSkill 的后半段。

这一类才比较接近真正意义上的“进化”。

共同结构是：

1. 收集 execution traces 或 trajectories。
2. 找到失败、低效或不稳定的地方。
3. 生成多个候选改进：prompt、skill、workflow、tool description、code。
4. 用 benchmark、测试、constraint gates 或 evaluator 打分。
5. 只保留更好的版本。

Hermes Agent Self-Evolution 的流程很清楚：读取现有 skill/prompt/tool，生成 eval dataset，基于 execution traces 产生 candidate variants，经过 tests / size limits / benchmarks 等 constraint gates，最佳版本以 PR 形式进入主仓库。

对 Omni 的启发：

- 没有 eval，就不要轻易说“进化”。
- Omni 的第一步可以只是生成 candidate memory。
- 第二步才是用户确认。
- 第三步才是自动评测和晋升。

### 4. Agent Framework / Research System

代表项目：EvoAgentX、AgentEvolver、Awesome Self-Evolving Agents。

这一类更偏框架和研究，不适合直接变成 Omni MVP。

它们关注：

- 自动构建 multi-agent workflow
- 训练或优化 agent policy
- 任务生成
- 多 agent 协作和 co-evolution
- benchmark 和安全评估

这些项目证明“自进化”是一个研究方向，但也说明它很容易变大。Omni 如果一开始追这个，会失焦。

## “自进化”的真实闭环

调研后可以把“自进化”拆成五个层级：

### L0：Transcript Archive

只保存 session 记录。

价值低，只能搜索和回看。

### L1：Structured Memory

从 session 中提取 facts、decisions、todos、commands、pitfalls。

这是 Omni 的合理 MVP。

### L2：Skill Memory

把多次 session 中的经验合成可执行或可操作的 skill。

例如：

- “这个 repo 的测试流程”
- “发布前检查清单”
- “遇到某类 CI 错误的处理步骤”

这是 Omni 的第二阶段。

### L3：Feedback-Based Improvement

根据用户反馈、任务成功/失败、测试结果更新 memory/skill。

例如：

- 错误记忆被标记为 rejected
- 某个命令多次成功后提升权重
- 某个步骤导致失败后加入 warning

这是轻量自学习。

### L4：Eval-Driven Evolution

系统生成多个 skill/prompt/workflow 候选，用 eval 或真实任务结果筛选。

这是更接近真正“自进化”的阶段，但工程成本和安全风险都明显上升。

## 对 Omni 的产品判断

Omni 不应该直接做“大而全自进化 agent”。

Omni 的位置应该更窄：

> Codex session memory manager。

也就是：

- 捕获 Codex session
- 解析 session timeline
- 提取工作记忆
- 用户确认或编辑
- 下次 session 可选择注入

这比“自进化”更具体，也更容易验证价值。

## Omni MVP 建议

### 目标

证明一个闭环：

> 以前的 Codex session 能让下一次 Codex session 少重复上下文。

### 输入

- Codex session transcript
- command output
- file references
- diffs
- user corrections
- final result

### 提取对象

- project fact
- command
- decision
- pitfall
- preference
- todo
- file reference

### 存储形态

建议第一版同时支持两层：

- SQLite：结构化索引、状态、来源、检索
- Markdown：用户可读、可编辑、可版本控制的 memory/skill 文件

### 状态机

每条 memory 至少有这些状态：

- candidate：模型提取出来，还没确认
- accepted：用户确认可复用
- rejected：不应该再用
- stale：可能过期
- superseded：被更新版本替代

### 召回方式

第一版不要只做向量召回。

应该组合：

- workspace match
- file path match
- command match
- task title / summary match
- recency
- explicit user selection

## 建议避免的说法

不要说：

> Omni 是一个自进化 AI。

不要说：

> 它会越用越聪明。

这些都太泛。

建议说：

> Omni 从 Codex session 中提取可追溯的工作记忆，让后续 session 少重复、少踩坑、更快进入状态。

更产品化一点：

> Every Codex session teaches the next one.

中文可以是：

> 让每一次 Codex 工作，都成为下一次的上下文资产。

## 最值得借鉴的三个方向

### 1. Acontext 的 Markdown Skill Memory

原因：最接近 Omni。

关键点：

- 从 session run 学习
- task 完成/失败触发
- LLM distillation
- 写成 Markdown skill
- 用户可读、可改、可迁移

### 2. Memoria 的 Memory Version Control

原因：解决“脏记忆”问题。

关键点：

- memory 变更可审计
- 可 rollback
- 可 branch / merge
- 适合用户掌控

### 3. Hermes Self-Evolution 的 Eval Gate

原因：定义了什么才叫“进化”。

关键点：

- 候选改进
- execution traces
- eval dataset
- constraints
- 最佳版本晋升

Omni 早期不需要做完整 eval system，但应该预留字段和概念。

## 最后判断

“自进化”可以作为远期愿景，但不是第一版产品定义。

第一版应该叫：

> Codex 工作记忆系统。

第二阶段可以叫：

> Codex skill memory。

第三阶段才考虑：

> eval-driven self-improvement。

这样不会悬浮，也不会把产品带进不必要的研究复杂度。
