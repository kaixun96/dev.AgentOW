# dev.AgentOW Architecture

## Invocation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER                                                                │
│  "/ow-team 帮我给 photo grid 加 loading spinner"                     │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  /ow-team SKILL  (主会话, 三重身份)                                   │
│  ─────────────────                                                   │
│  ① 创建 session: /workspaces/odsp-web/.aero/<name>/                   │
│       ├─ plans/                                                      │
│       ├─ report.json                                                 │
│       └─ progress.log                                                │
│                                                                      │
│  ② 调用 superpowers:brainstorming  ←──── 直接和用户交互               │
│       └─ 一问一答 → 提方案 → 用户确认 → refinedRequest                │
│                                                                      │
│  ③ TeamCreate + Spawn 5 agents (idle 先, orchestrator 最后)          │
│                                                                      │
│  ④ Monitor: tail -f progress.log  ←──── 用户看到实时进度              │
│                                                                      │
│  ⑤ 进入 user-relay 模式  ←──── 转发 orchestrator ↔ 用户的消息         │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ TeamCreate
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       AGENT TEAM (常驻)                              │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────┐      │
│   │  ow-orchestrator  (active, 驱动全流程)                    │      │
│   │  ────────────────                                         │      │
│   │  权限: ow-status, ow-pr-create, Read(session), Bash,      │      │
│   │       AskUserQuestion(via team-lead), SendMessage         │      │
│   │                                                            │      │
│   │  ❌ 不能读源码, 不能 build/test                            │      │
│   └────────────┬───────────────┬───────────────┬─────────────┘      │
│                │ SendMessage   │               │                     │
│                ▼               ▼               ▼                     │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│   │  ow-planner  │  │ ow-generator │  │ ow-evaluator │              │
│   │              │  │              │  │              │              │
│   │ - 读源码     │  │ - rush build │  │ - Playwright │              │
│   │ - Bluebird   │  │ - rush test  │  │   MCP 浏览器  │              │
│   │ - 写 plan.md │  │ - rush start │  │ - DOM 断言   │              │
│   │              │  │ - git commit │  │ - 截图证据    │              │
│   │ 写 report    │  │ - 发 code_done│ │ - 写 eval.md │              │
│   │ +SendMessage │  │   提前通知    │  │              │              │
│   └──────────────┘  └──────────────┘  └──────────────┘              │
│                              │                                       │
│                       ┌──────┴───────┐                              │
│                       ▼              ▼                              │
│                  ┌──────────────────────────┐                       │
│                  │    ow-review-agent       │                       │
│                  │  - git diff              │                       │
│                  │  - checklist 检查        │                       │
│                  │  - + superpowers deep review│                    │
│                  │  - 写 review.md          │                       │
│                  └──────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
                       │
                       │ 流程顺序
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PIPELINE (orchestrator 协调)                                        │
│                                                                      │
│  Step 1: planner → 写 plan.md → 发回 orchestrator                    │
│            │                                                         │
│  Step 1a:  └→ orchestrator → 用户审批 → approve                      │
│            │                                                         │
│  Step 2: generator → 写代码 + commit → 发 code_done                  │
│            │                                                         │
│  Step 3: ⚡ 并行触发 (orchestrator 同时派活)                          │
│            ├─ generator: 继续 build/test                             │
│            ├─ evaluator: 读代码 + Playwright UI 验证                 │
│            └─ review-agent: git diff 检查                            │
│            │                                                         │
│  Step 4: 收集 3 份结果                                                │
│            ├─ build FAIL? → 回到 Step 2 (max 5 cycles)               │
│            └─ build OK? → 继续                                       │
│            │                                                         │
│  Step 5: 自动调 ow-pr-create                                         │
│            ├─ git push origin <branch>                               │
│            └─ az repos pr create --draft true                        │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OUTPUT                                                              │
│                                                                      │
│  Session 目录:                       PR:                             │
│  .aero/<name>/                       https://dev.azure.com/.../      │
│   ├─ plans/plan.md                       pullrequest/12345           │
│   ├─ evaluation/                                                     │
│   │   ├─ 2026-04-17-iter1.md                                        │
│   │   └─ iter1/                                                      │
│   │       ├─ criterion-1-*.png                                      │
│   │       └─ criterion-2-*.png                                      │
│   ├─ review.md                                                       │
│   ├─ report.json (NDJSON)                                            │
│   └─ progress.log                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Supporting Infrastructure

```
MCP TOOLS (15)            SKILLS (10)               HOOKS (6)
─────────────             ───────────               ─────────
ow-status                 ow-team           ←── 入口  PreToolUse:
ow-rush                   ow-dev-build              ow-build|rush → ow-dev-build
ow-build                  ow-dev-test               ow-start → ow-dev-debuglink
ow-test                   ow-dev-git                ow-test → ow-dev-test
ow-start                  ow-dev-debuglink          ow-git → 内容匹配
ow-debuglink              ow-dev-playwright         Bash → ow-dev-pr (azcli)
ow-git                    ow-dev-pr                 browser_* → ow-dev-playwright
ow-pr-create              ow-ref-monorepo
ow-version                ow-ref-external-tools     PreCompact:
ow-session-* (6)          search-odspweb-wiki       reset-skill-guards
```

## Design Principles

1. **三层分离**: Tools(确定性) → Agents(工作流) → Skills(知识)
2. **Orchestrator 纯调度**: 不读源码, 不 build, 不 test
3. **Team 常驻**: 跨 cycle 保留上下文 (generator cycle 2 记得 cycle 1)
4. **并行优化**: code_done 后 evaluator + review 和 build 同时跑
5. **全文件中转**: agent 间通信走 NDJSON report.json
6. **用户最少介入**: 只需审批 plan, 其余全自动
