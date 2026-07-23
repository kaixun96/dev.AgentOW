# 如何使用 agentOW

agentOW 是一个面向 odsp-web 开发的自动化 Harness。它可以从需求出发，完成代码调研、计划、实现、构建、测试、页面验证、代码审查，并最终创建 Draft PR。

但 agentOW 不是需求和项目知识的替代品。要可靠地使用 Auto 或 Batch 模式，正确的顺序是：

```text
项目 Context（Source of Truth）
        ↓
跨 Session Memory（始终先读取 Context）
        ↓
agentOW（执行、验证和交付）
```

## 1. 为什么必须 Spec-driven

人在需求不完整时会提问、查资料或依赖隐含经验；零交互的 Agent 无法在执行中等待这些信息。它只能根据启动时能够读取到的上下文做出假设。

因此，**充足、准确、可定位的 Context 是零交互使用 Harness 的前提**。Prompt 越短，Agent 对长期 Context 的依赖越强。没有 Source of Truth 时直接运行 Auto 或 Batch，常见结果包括：

- 正确实现了错误的需求；
- 重复已经由其他人完成的工作；
- 使用过时的架构或设计；
- 无法判断 UI 的预期状态；
- 在多个合理方案之间做出不可审计的猜测。

Spec-driven 不等于先写一份巨大而完美的 Spec。它意味着：项目事实有一个明确位置，任务有可验证的成功标准，Agent 遇到冲突时知道应该相信什么。

## 2. 建立项目 Context

为项目建立一个长期维护的 Context，作为人和 Agent 共同使用的 Source of Truth。它可以放在：

- 私有 GitHub repository 中，适合跨团队、跨代码库管理；
- odsp-web repository 内，适合与代码一起版本化；
- 现有的团队文档 repository 中，只要所有执行环境都能访问。

不要一开始追求完整。可以先让 AI 阅读项目相关代码并总结结构，再由熟悉项目的人校正。一个实用的初始结构如下：

```text
project-context/
├── README.md              # Context 入口、阅读顺序、文档索引
├── architecture.md        # 代码结构、组件边界、数据流
├── product-spec.md        # 用户问题、需求、验收标准
├── engineering-design.md  # 技术方案、约束、兼容性要求
├── design.md              # Figma、截图、视觉状态和交互说明
├── decisions.md           # 已确认的决策及原因
├── terminology.md         # 业务和代码术语
├── status.md              # 当前进展、负责人、已完成工作
├── work-items.md          # ADO Query、Area Path 和任务跟踪入口
└── lessons.md             # 实际运行后发现的问题和经验
```

`README.md` 应当是稳定入口，说明：

1. 这个项目解决什么问题；
2. 哪些文件必须先读；
3. 不同类型的问题应查阅哪个文件；
4. 信息冲突时的优先级；
5. 当前状态以及对应的 ADO Query 或 Work Item 在哪里。

### 可以放入 Context 的内容

- AI 根据代码生成、并经过人工校正的架构概览；
- PM Spec、用户场景和验收标准；
- Developer Design、API contract、数据流和依赖关系；
- Figma 链接、导出图、关键页面截图和交互状态；
- 已确认的技术决策、限制条件和不做事项；
- 相关 PR、Work Item、实验结果和历史背景；
- 团队成员已经完成或正在进行的工作；
- ADO Bug List、TODO Work Items 的 Query 和筛选规则；
- agentOW 运行后暴露出的错误假设和新知识。

任务的标题、状态、负责人、验收标准和依赖关系应以 ADO Work Item 为准。Context 只需要记录稳定的项目背景以及如何找到这些 Work Items，不要复制一份容易过期的本地任务列表。

链接本身不一定能被 Agent 访问。对于有权限限制的 Figma、PM 文档或会议记录，应在 Context 中保存必要的文字摘要、截图或导出内容，并标明原始来源和更新时间。

### 让 AI 帮助创建第一版

可以从下面的 Prompt 开始：

```text
请阅读与 <项目名> 相关的代码，创建一份项目 Context。

先总结：
1. 项目目标和用户场景；
2. 主要目录、组件和职责；
3. 关键数据流和依赖；
4. 构建、测试和本地验证方式；
5. 当前无法从代码确认的问题。

不要猜测业务事实。无法确认的内容列入 Open Questions，并为每项结论附上代码路径。
```

然后逐步补充 PM Spec、Developer Design、Figma 和团队决策。Context 应当像代码一样接受 Review，并随着项目演进持续修改，而不是一次生成后长期不管。

## 3. 建立跨 Session Memory

只有 Context 还不够。每个新 Session 必须知道它存在，并在讨论或修改项目之前先读取它。

建议添加一条简短、稳定的全局指令。它只负责把 Agent 路由到 Source of Truth，不要把全部项目知识复制进 Memory：

```markdown
## <项目名> Context

Whenever a request discusses <项目名>:
1. Read <Context repository or directory>/README.md first.
2. Follow its reading order and treat the referenced project context as the source of truth.
3. Check status.md and the referenced ADO Work Items before planning changes so you account for current state and work completed by other contributors.
4. If the request conflicts with the context, surface the conflict instead of silently choosing one.
5. After discovering durable new project knowledge, update the appropriate context document.
```

### 为什么建议通过 dotfiles 配置

如果只在一个 Session 中口头说明，这条规则会随着 Session 结束而丢失；如果只配置在一个 Codespace 中，新建 Codespace 后还要重新设置。

把指令放进个人 dotfiles repository，可以让每个 Codespace 自动获得相同的项目入口：

- Copilot CLI：`$HOME/.copilot/copilot-instructions.md`，或 `$HOME/.copilot/instructions/*.instructions.md`
- Claude Code：可由 dotfiles 将相同规则安装到个人级 `CLAUDE.md`

如何创建和配置个人 dotfiles，参见 ODSP-Web Wiki：[Using dotfiles for personal customization](https://dev.azure.com/onedrive/ODSP-Web/_wiki/wikis/ODSP-Web.wiki/141505/Using-dotfiles-for-personal-customization)。

推荐在 dotfiles 中保存一份项目指令，再由安装脚本复制或链接到对应 CLI 的个人指令目录。Context 本身仍然放在独立 repository 或 odsp-web 中；Memory 只保存入口路径和读取规则。

这对多人协作尤其重要：

- 每个 Session 都从相同背景开始；
- Agent 在开发前能够看到其他人已经完成的工作；
- 新成员不需要依赖口头传递即可快速理解项目；
- Context 的 Git 历史能够记录项目知识如何变化。

个人 Memory 只适合保存“去哪里读”的稳定规则。团队共享的架构、状态和决策必须留在项目 Context 中，不能只存在某个人的 dotfiles 里。

## 4. 安装 agentOW

### Claude Code

```bash
claude plugin marketplace add kaixun96/dev.AgentOW
claude plugin install agentOW@agentOW
```

Claude 版本还需要启用 Agent Teams，并在运行前打开 auto-accept。具体前置条件见项目 [README](../README.md#prerequisites)。

### Copilot CLI

```bash
copilot plugin marketplace add kaixun96/dev.AgentOW
copilot plugin install agentow-copilot@agentOW
```

Copilot CLI 需要先完成 `copilot auth`。

首次在一个 Claude/Copilot terminal session 中运行 agentOW 时，会先执行自动 Bootstrap：

- 自动安装本地可信 marketplace 中缺失的 Playwright、ODSP 基础 MCP 和 Review 插件；
- 任务引用 Figma、ADO、Bluebird、Wiki 或 Learn 时，自动安装 opt-in MCP；
- UI 任务自动安装截图合成和 pixel diff 依赖；
- Claude 自动补齐 Agent Teams 设置；
- Azure CLI 已存在时自动安装 Azure DevOps extension。

新插件和 Agent Teams 设置需要重启 Claude/Copilot 或 terminal 才能加载。Bootstrap 会停止在 Planning 之前并明确告知重启。登录、Figma OAuth、AAD consent、Playwright 首次登录和 tenant fixture 仍需用户完成。结果保存在 `.aero/<session>/capabilities.json`，同一个 terminal session 后续运行不会重复安装。

## 5. 选择运行模式

| 场景 | Claude Code | Copilot CLI | 交互 |
|---|---|---|---|
| 单任务、需要确认需求和计划 | `/ow-team` | `/agentow` | 有 |
| 单任务、Context 已充分 | `/ow-team --auto` | `/agentow --auto` | 零交互 |
| 多个独立任务 | `/ow-batch` | `/ow-batch` | 启动后零交互 |

### Interactive：用于补齐 Context

当需求仍有歧义、设计尚未决定或第一次处理某类任务时，先使用 Interactive 模式：

```text
/agentow
按照 project-context/product-spec.md 实现 PhotoGrid loading 状态。
```

把对话中形成的稳定结论写回 Context。Interactive 模式不只是完成任务，也是在提高后续 Auto 和 Batch 的可靠性。

### Auto：Context 充分后的单任务执行

```text
/agentow --auto
读取 ADO Work Item 1234567，并按照其中的描述和验收标准完成任务。
```

Auto 模式不会等待需求澄清或计划审批。Agent 会把必要假设记录到运行产物中，因此任务描述必须能够定位到明确的 Spec 和验收标准。

### Batch：批量处理独立任务

```text
/ow-batch
读取这个 ADO Bug Query 中的所有 Active Bug 并逐个处理：
<ADO Query URL>
```

或直接输入：

```text
/ow-batch
依次处理以下 ADO Work Items：
1234567
1234568
1234569
```

agentOW 应先从 ADO 获取每个 Work Item 的最新描述、讨论、验收标准和关联项，再生成 Batch 任务。Batch 中的每一项都应当可以独立验证、独立创建 PR。不要把相互依赖的多个步骤伪装成独立任务；这类工作应先合并为一个 Spec，或明确依赖顺序。

## 6. 验证和运行产物

agentOW 的目标不是“生成代码”，而是“产生可审查的交付结果”。一次完整运行会保留计划、实现记录、评估、Review 和最终状态。

对于可见 UI 变更，Playwright 的 BEFORE/AFTER 截图是强制 Gate。无法打开页面、通过认证、定位元素或实际写出截图时，Evaluator 必须报告失败原因，不能在没有截图证据时声称视觉验证通过。

运行进度和产物位于：

```text
/workspaces/odsp-web/.aero/<session>/
```

重点查看：

- `progress.log`：实时状态；
- `plan.md`：计划、假设和验收标准；
- `evaluation/`：验证报告和截图；
- `review.md`：代码审查结果；
- `final.md`：最终状态和 PR。

Batch 运行还会生成 `summary.md` 和每个任务的独立日志。

## 7. 推荐的日常工作流

1. 在 Context 中创建或更新 Spec、设计以及 ADO Work Item 入口。
2. 确认 Memory 能让新 Session 自动找到 Context。
3. 第一次处理新领域时使用 Interactive 模式。
4. 将对话产生的稳定知识写回 Context。
5. 当任务和验收标准已经明确时使用 Auto。
6. 当多个任务彼此独立时使用 Batch。
7. Review Draft PR、截图和运行产物。
8. 把错误假设、遗漏约束和新决策继续写回 Context。

这个循环的核心不是让 Prompt 越写越长，而是让 Source of Truth 越来越准确。agentOW 负责稳定地执行流程；项目 Context 决定它是否在解决正确的问题。
