# A11y PR 截图与录屏证据指南

本文是 agentOW A11y bug 修复中制作、验收和发布 PR 视觉/时序证据的**唯一规范性指南**。
`agentow-a11y` 定义端到端流程；凡涉及截图、录屏、音频、标注和 PR 附件，必须以本文为准。
其他笔记、历史 PR 或工具默认行为与本文冲突时，以本文为准。

## 1. 目标

证据必须让 reviewer 不依赖作者解释就能快速回答：

1. 原 bug 在哪里、表现是什么；
2. 修复后具体改变了什么；
3. 为什么这个改变满足 bug 的合理 Expected Behavior；
4. BEFORE 和 AFTER 是否来自相同场景；
5. AFTER 是否确实运行当前 PR 的精确 HEAD。

证据不是装饰，也不能只证明“页面能打开”。无法回答以上问题的图片或视频不得发布。

## 2. 先选择正确的证据类型

| 缺陷类型 | 必需 reviewer 证据 |
|---|---|
| 颜色、布局、可见文本、静态 focus indicator | 匹配的全页 BEFORE/AFTER + 清晰 target crop |
| accessible name、role、state、heading、relationship | 全页 BEFORE/AFTER + 标注对比图 + AX/UIA/DOM 机器证据 |
| 键盘焦点顺序、焦点移动、动态更新 | 真实连续 BEFORE/AFTER 视频 |
| Screen reader 朗读、重复/遗漏 announcement | 真实连续 BEFORE/AFTER 视频，包含同步音频或可核验 transcript |
| Voice Access 编号/overlay | 全 overlay 截图 + 完整 overlay map；涉及交互时再加视频 |
| reflow、zoom、responsive behavior | 固定 viewport/zoom 的匹配截图；动态变化时加视频 |

静态语义不能只靠截图推断；时序行为不能用截图拼接成“视频”。同一 bug 可同时需要多种证据。

## 3. 以原 bug 为验收合同

拍摄前必须：

- 阅读全部 bug 图片、视频、日志和 accessibility-tool export；
- 记录 canonical fixture、URL、viewport、缩放、页面状态、操作步骤、AT、模式和失败 target；
- 认真评估 Expected Behavior 是否合理；
- 合理时把 Expected Behavior 原样转成 acceptance criteria；
- 不合理或互相矛盾时，先记录具体原因和替代标准，不能静默改题。

最终媒体必须直接证明合理的 Expected Behavior 已满足，而不只是证明某个症状消失。

## 4. BEFORE/AFTER 等价性硬门禁

除 build selector 和目标缺陷本身外，BEFORE/AFTER 必须一致：

- canonical fixture、URL、route、query、flight、KS 和测试数据；
- 浏览器、viewport、device scale、页面 zoom 和 OS scale；
- scroll、目标位置和 target geometry；
- 页面 loading 完成状态；
- 展开/折叠、选中、hover、pressed、checked 和 modal/panel 状态；
- focus 起点及拍摄开始时的 active element；
- 浏览器 chrome、taskbar 和其他 OS surface 是否入镜；
- permission、GCM、debug consent 和其他 dialog 状态；
- AT、AT version、verbosity、mode、voice、speech rate 和音频路由；
- 视频的操作步骤、节奏、停顿点和结束状态。

必须保存机器可读的 `capture-state.json`，至少包含：

```json
{
  "url": "...",
  "viewport": {"width": 1024, "height": 768},
  "deviceScaleFactor": 1,
  "pageZoom": 1,
  "scrollX": 0,
  "scrollY": 0,
  "targetSelector": "...",
  "targetRect": {"x": 0, "y": 0, "width": 0, "height": 0},
  "activeElement": "...",
  "pageState": {"panel": "expanded"},
  "debugBar": "hidden",
  "dialogs": [],
  "browserChromeIncluded": true,
  "taskbarIncluded": false,
  "buildCommit": "..."
}
```

target rect 只能有渲染抖动允许范围内的小误差。任一无关状态不一致即为
`INVALID_EVIDENCE`，必须重拍；不得用裁剪、标注或文字解释掩盖差异。

## 5. 每次拍摄前的清场

1. 关闭无关窗口、toast、notification、DevTools 和 evaluator 控件。
2. 点击 `Hide` 去掉 debug bar；移除 manifest error、Knockout error、test harness 和代理提示。
3. 清除 permission、login、debug consent、GCM 和扩展弹窗。
4. 等待目标产品、字体、图标、图片、localization 和 changed-build assets 全部加载。
5. 把页面恢复到 canonical scroll、展开状态和 focus 起点。
6. 验证 target 完整可见，没有被 sticky UI、光标或 overlay 遮挡。
7. 记录 capture state 和实际加载的 build/commit。

最终 PR 媒体中不得出现任何 debug/test/evaluator scaffolding。为了调试保留的原始文件只能作为
内部 artifact，不能冒充 reviewer evidence。

## 6. 截图规范

### 6.1 必需输出

每个静态场景至少保留：

- `before-full.png` / `after-full.png`：完整 viewport，用于证明上下文和状态等价；
- `before-target.png` / `after-target.png`：同尺寸、同位置的 target crop；
- `comparison-annotated.png`：供 PR reviewer 直接阅读的并排标注图；
- BEFORE/AFTER 的 `capture-state.json`；
- 与语义结论对应的 AX/UIA/DOM JSON。

不能只发布 crop；全页图负责可信度，标注图负责可读性。

### 6.2 构图和匹配

- BEFORE 放左、AFTER 放右，顺序不得交换；
- 两侧使用相同尺寸、缩放、裁剪范围和视觉中心；
- 保持足够页面上下文，让 reviewer 能定位 target；
- target 必须清晰可见，不能依赖放大浏览器或下载原图才能理解；
- 不得把不同 fixture、不同 panel 状态或不同 scroll 的图拼在一起；
- 光标若无关应移出 target；若光标/focus 是缺陷一部分，则两侧位置必须可比。

### 6.3 标注图必须解释“为什么修复”

标注应少而明确，只强调与 acceptance criteria 直接相关的差异：

- 用短标题描述 BEFORE 缺陷和 AFTER 正确行为；
- 使用矩形、箭头或编号精确指向同一 target；
- 写出可观察值，例如 `Accessible name: "Added to favorites"`；
- AFTER 明确写出满足标准的值，例如
  `Accessible name: "Following, Added to favorites"`；
- 用一句结论连接 Expected Behavior/WCAG，例如
  `Visible label "Following" is now contained in the accessible name`。

对 heading level、accessible name、role、state、relationship 等不可见语义，必须把机器读取值
清晰叠加到对应 target 附近。不能仅贴 accessibility tree 大图让 reviewer 自己寻找。

标注不得：

- 遮住被证明的 UI；
- 添加产品中并不存在的 focus ring、文本或状态；
- 用红/绿颜色作为唯一信息通道；
- 宣称截图本身无法证明的朗读、顺序或动态行为。

## 7. 视频规范

### 7.1 何时必须录制

只要 bug 的核心包含时间、顺序或交互过程，就必须使用真实视频，包括：

- Tab/Arrow 焦点移动或 focus restore；
- keyboard trap、skip link、menu/dialog traversal；
- screen reader 朗读内容、次数、顺序或 live-region announcement；
- dynamic content、loading、toast 或状态变化；
- Voice Access voice command 到实际 action 的映射。

不得用两张图片、淡入淡出、幻灯片或后期动画模拟真实操作。这类文件即使是 MP4 也不是视频
证据，必须删除。

### 7.2 BEFORE/AFTER 视频结构

优先提供两个独立附件，名称和 PR 文案明确标为 BEFORE 与 AFTER。每段视频应：

1. 从同一稳定初始状态开始；
2. 短暂显示足够上下文和 target；
3. 以正常、可复现的速度执行 canonical steps；
4. 让真实 focus indicator、AT cursor、overlay 或状态变化连续可见；
5. 在关键结果处停留足够时间；
6. 不剪掉失败或成功发生前后的关键过渡；
7. 在同一 take 内完成，不使用静态帧替换实际过程。

需要剪辑时只能裁掉操作前后的空白，不得改变顺序、节奏或结果。

### 7.3 Screen reader 视频

Screen reader 证据必须同时证明“操作对象”和“实际输出”：

- 录入真实 Narrator/NVDA 音频，不能由 TTS 后期重配；
- 视频中必须能识别 focus/cursor 实际移动，而不是只听到孤立语音；
- 保留原始音频或 ETW/log，并生成带时间戳 transcript；
- transcript 只能辅助 reviewer，不能替代真实音频；
- BEFORE/AFTER 使用同一 voice、verbosity、mode、speech rate 和步骤；
- 确认 recorder 真正捕获系统级 AT cursor/overlay。

如果录制工具捕获不到 Narrator 系统 cursor、Voice Access overlay 或系统音频，证据状态是
`blocked`/`inconclusive`。必须更换能够捕获该 OS surface 的录制方式；不得发布缺失关键行为的
替代视频，也不得声称修复已被视觉验证。

### 7.4 可理解性和隐私

- 输出足够清晰，文字、focus ring 和 overlay 可辨认；
- 避免过度压缩、极低帧率、跳帧和音画不同步；
- 只录目标应用及必要 OS surface；
- 不展示凭据、token、个人通知、无关聊天或敏感客户数据；
- 不为“更好看”而隐藏与 bug 判断相关的 browser chrome 或 OS surface。

## 8. Voice Access 特殊规则

每个用于 finding 的编号必须有完整 `overlay-map.json`：

```json
{
  "label": 54,
  "screenPoint": {"x": 0, "y": 0},
  "surface": "page",
  "selector": "...",
  "role": "link",
  "name": "Learn more...",
  "actionable": true,
  "domRect": {"x": 0, "y": 0, "width": 0, "height": 0}
}
```

- `surface` 区分 `page`、`browser-chrome`、`os-taskbar`、`other-os`；
- 只有 `surface: page` 可用于产品 finding；
- 使用 screen point + DOM rect 或 UIA hit-test 归属编号；
- link/button/input 等 actionable target 显示编号是合法行为；
- 无法映射的编号为 `INCONCLUSIVE`，不能猜测为违规；
- 截图必须包含完整 overlay map，不能只裁出几个可疑编号。

## 9. 精确 HEAD 与真实性

AFTER 必须绑定实际 PR HEAD：

- 记录 commit SHA、changed-build selector、资源 URL 和成功响应；
- 证明受影响 package 的精确 HEAD asset 已加载并执行；
- 任何源码变化都会使旧 AFTER 失效，必须完整重拍；
- debug manifest error、fallback 到 deployed asset、404/CORS 或 error overlay 都使 AFTER 无效；
- 不得把历史 branch、近似 fixture 或手工修改 DOM 当作 AFTER。

BEFORE 使用 canonical target/deployed baseline；只有该改动本身引入 flight/KS 且 OFF 精确等于
pre-change path 时，才可用同一 changed build 的 OFF/ON 作为 BEFORE/AFTER。

## 10. PR 媒体制作与发布

PR description 的 Evidence 区必须按 reviewer 阅读顺序组织：

1. 一句话 defect / acceptance criteria；
2. BEFORE 媒体及一句可观察结论；
3. AFTER 媒体及一句可观察结论；
4. 标注对比图或视频；
5. 必要的机器证据摘要和 exact HEAD；
6. 媒体无法直接证明的限制。

附件必须：

- 通过 ADO Git pull-request attachment endpoint 上传；
- 使用最终的绝对 `https://onedrive.visualstudio.com/...` attachment URL；
- 不依赖本地路径、session artifact、临时 server、`dev.azure.com` 重写或短期 token URL；
- 不发 PR comment thread；全部 reviewer-safe 证据写入 PR description。

发布后必须在真实 PR 页面验收：

- 使用 reviewer 身份可见的实际页面打开；
- 图片返回正确 bytes，实际渲染尺寸非 0，清晰度足够；
- 视频播放器/下载链接存在且附件能完整播放；
- BEFORE/AFTER 标签和顺序正确；
- description 中没有 broken image、过期链接或旧证据；
- reviewer 能在数秒内看出 bug、修复和正确性理由。

API 上传成功、HTTP 200 或 markdown 文本正确都不能替代真实 PR 页面验收。

## 11. 判废与重做条件

出现以下任一项，证据必须判废并重做：

- debug bar、error overlay、evaluator UI 或 test scaffolding 入镜；
- BEFORE/AFTER 的展开、折叠、scroll、geometry、focus、dialog 或 loading 状态不同；
- AFTER 未加载精确 HEAD，或资源加载存在未解释失败；
- 图片没有同时提供上下文和可读的目标差异；
- 标注宣称媒体本身无法证明的行为；
- 语义 bug 没有 AX/UIA/DOM 机器证据；
- 时序 bug 使用静态截图或 slideshow 代替真实连续操作；
- screen reader 视频没有真实焦点/cursor 移动或真实音频；
- Voice Access overlay 没有完整归属；
- 媒体 URL 在实际 PR 页面无法加载或播放；
- reviewer 不能一眼看出“修了什么、为什么正确”。

不能在 PR 文案中解释或淡化无效证据。先删除无效附件引用，再重新采集和发布。

## 12. 最终发布清单

- [ ] 已读取全部原 bug 附件并确认合理 Expected Behavior。
- [ ] 已选择能证明该缺陷的正确媒体类型。
- [ ] BEFORE/AFTER capture state 完全匹配。
- [ ] 最终媒体没有 debug/test/error 污染。
- [ ] 同时保留 full viewport、target crop 和机器证据。
- [ ] 标注图直接说明 defect、change 和 acceptance criteria。
- [ ] 动态/焦点/朗读缺陷使用真实连续视频。
- [ ] Screen reader 视频包含真实移动和真实音频/transcript。
- [ ] AFTER 绑定并加载实际 PR HEAD。
- [ ] 附件使用 ADO PR attachment 和绝对 `visualstudio.com` URL。
- [ ] 已在真实 PR 页面验证图片尺寸和视频播放。
- [ ] 已删除旧的、错误的或误导性证据引用。

只有全部适用项满足后，媒体证据才可交付 reviewer。
