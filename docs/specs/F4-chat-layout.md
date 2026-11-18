# F4 · 聊天页布局重构

- 状态：Done（2026-10-15）
- 依赖：F1（颜色 token）
- 影响范围：新增 `components/AppHeader.jsx`、`components/PlaceholderView.jsx`；修改 `AppShell.jsx`、`Sidebar.jsx`、`AssistantView.jsx`、`lib/views.js`、`styles.css`

## 1. 背景

### Figma 的聊天页

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Logo] PBS Wisconsin        ● Knowledge base online  (J) Jane  Sign out │  ← 全宽顶部栏（白底）
├───────────────┬──────────────────────────────────────────────────────┤
│ WORKSPACE     │ ✦ AI KNOWLEDGE ASSISTANT              [Share feedback]│  ← 标题栏
│ Customer      │ How can I help today?                                 │
│ Support       ├──────────────────────────────────────────────────────┤
│ [+ New chat]  │  [快捷卡片][快捷卡片]                                  │
│ Recent        │  [快捷卡片][快捷卡片]                                  │
│  · …          │  (✦) Hi Jane — I'm ready to help…                     │
│ Resources     │                                                       │
│  Staff handbook│                                                      │
│  Escalation…  │                                                       │
│ Share feedback├──────────────────────────────────────────────────────┤
│ ┌Need human ┐ │ [🔍 Ask about a policy, process, or customer issue… ➤]│
│ │help?      │ │ AI can make mistakes…   Enter to send · Shift+Enter…  │
│ └───────────┘ │                                                       │
└───────────────┴──────────────────────────────────────────────────────┘
   Navy 侧栏
```

### 原型现状

- 没有全宽顶部栏；用户头像、姓名、登出放在侧栏底部。
- 侧栏：Logo、New conversation、导航（Help Assistant / Team FAQ / Knowledge sources）、最近对话。
- 主区域顶部是一个小 topbar：页面标题 + "Passport · Live TV · Devices" 和 "Prototype · sample data" 两个标签。
- 欢迎区是居中的大标题 + 4 个建议问题。
- 回答卡片功能比 Figma 更完整（置信度、引用侧栏、复制成邮件、点赞点踩、Flag、内容缺口）。

## 2. 目标

- 布局结构对齐 Figma：全宽顶部栏 + Navy 侧栏 + 标题栏 + 对话区 + 底部输入框。
- **原型已有的回答功能全部保留**，只改外层布局和欢迎区。
- 不破坏现有的手机端抽屉式侧栏。

## 3. 方案

### 3.1 整体网格

```
.app            grid-template-rows: 64px 1fr;  grid-template-columns: 264px 1fr;
  AppHeader     grid-column: 1 / -1
  Sidebar       row 2, col 1
  main          row 2, col 2  （内部：标题栏 / 对话滚动区 / 输入框）
```

- < 900px：侧栏变为左侧抽屉（沿用现有 `.sidebar.is-open` + 遮罩），顶部栏左侧出现菜单按钮。

### 3.2 顶部栏 `AppHeader.jsx`（新增）

| 位置 | 内容 |
|---|---|
| 左 | 菜单按钮（仅 < 900px）· 占位 Logo（蓝色版）· "Help Assistant" 小字 |
| 右 | 状态：Mint 圆点 + "Knowledge base online"；离线时 Coral 圆点 + "Knowledge base offline"（来自 F3a 的 `backendStatus`） |
| 右 | 头像（姓名首字母，Navy 圆形）· 姓名 · "Sign out" 文字按钮 |
| 右 | "Prototype · sample data" 小标签：保留到 F5b 接入真实后端后删除 |

- 白底，底部 1px `var(--line)`。
- < 620px：隐藏状态文字（只留圆点）和姓名。
- 原侧栏底部的用户区删除。

### 3.3 侧栏 `Sidebar.jsx`（改造）

从上到下：

1. **Workspace 标题**：小标签 "WORKSPACE"（Mint）+ "Audience Services" + 一行说明 "Sourced answers for viewer questions."
   （Figma 写的是 "Customer Support"，我们的用户是 Audience Services 团队，用实际团队名。）
2. **"+ New conversation"** 按钮（沿用）。
3. **Recent conversations**（沿用现有逻辑：本次会话内的对话列表，可点击切换）。
4. **Resources** 分组：
   - Team FAQ（原型已有页面）
   - Knowledge sources（原型已有页面，带反馈数量角标）
   - Staff handbook（新增，见 3.6）
   - Escalation directory（新增，见 3.6）
5. 底部固定区：
   - "Share feedback" 项 → F3b 反馈页
   - "Need human help?" 卡片：Yellow 图标 + "Contact your team lead for urgent or sensitive cases."

- 选中项样式：底色 `rgba(255,255,255,.11)` + 左侧 3px Mint 色条。
- "Help Assistant" 不再作为导航项出现：点 "New conversation" 或任一最近对话即进入聊天视图。

### 3.4 标题栏（主区域顶部）

- 聊天视图：eyebrow "✦ AI KNOWLEDGE ASSISTANT" + 标题 "How can I help today?"；右侧 "Share feedback" 次级按钮。
- 其它视图（FAQ / Sources / Feedback / 占位页）：eyebrow 为分组名（"RESOURCES"），标题为页面名。
- 原 topbar 的 "Passport · Live TV · Devices" 标签删除。

### 3.5 欢迎区（新对话、还没有消息时）

按 Figma 改为"快捷卡片 + 助手问候气泡"，替换现在居中的大标题：

- **快捷卡片** 2×2 网格，每张卡片 = 标题 + 一行说明 + 右箭头。内容保留我们自己的业务场景（Figma 的示例是会员退款等，不符合实际知识库）：

  | 标题 | 说明 | 点击后发送的问题 |
  |---|---|---|
  | Passport videos locked | Activated but still can't watch | Member activated Passport but videos are still locked |
  | Set up Passport on Roku | Device activation steps | How do I set up Passport on Roku? |
  | Missing activation email | Resend or find the email | A member never got their activation email |
  | Show not on livestream | Live TV availability | Why is a show not available on the livestream? |

- **问候气泡**：助手头像 + "Hi {firstName} — describe what the viewer is asking and I'll find a sourced answer you can read back or paste into a reply."
- 原欢迎区底部的 "Grounded in N indexed sources · Cites every answer · Won't guess" 移到问候气泡下方，作为小字。
- 手机宽度下卡片单列。

### 3.6 Staff handbook / Escalation directory

目前没有内容来源（见待决问题 Q2）。方案：新增通用 `PlaceholderView.jsx`，显示图标 + 标题 + "This resource isn't connected yet. Ask your team lead for the current version." 两个导航项共用它，后续有内容再替换。

### 3.7 输入框

- 左侧加搜索图标；placeholder 改为 "Ask about a policy, process, or viewer issue…"。
- 下方提示改为两段，左右分布：
  - 左："AI can make mistakes. Confirm sensitive policies before sharing with viewers."
  - 右："Enter to send · Shift + Enter for a new line"（手机宽度隐藏）
- 发送逻辑、自动增高、中文输入法 `isComposing` 处理都保留。

### 3.8 状态与组件改动汇总

| 文件 | 改动 |
|---|---|
| `AppShell.jsx` | 渲染 `AppHeader`；新增 `backendStatus` prop 透传；视图切换增加 `handbook` / `escalation` / `feedback` |
| `lib/views.js` | 增加 `handbook`、`escalation`、`feedback`；每个视图加 `group` 字段（`resources` / `null`） |
| `Sidebar.jsx` | 按 3.3 重排；删除用户区 |
| `AssistantView.jsx` | 按 3.5、3.7 改欢迎区和输入框；消息渲染不变 |
| `Message.jsx` 等 | 不改 |

## 4. 不做

- 回答卡片（`Message.jsx`）的视觉和功能不改。
- 对话不持久化（刷新后对话丢失，和现在一样）。
- 不做全局搜索。

## 5. 验收标准

- [ ] 1440px 宽度下整体结构与第 1 节 Figma 示意一致。
- [ ] 顶部栏显示状态、头像、姓名、Sign out；Sign out 可用。
- [ ] 侧栏各项可用：新对话、最近对话切换、FAQ、Sources、两个占位页、Share feedback。
- [ ] 新对话显示 4 张快捷卡片和问候气泡，点击卡片会发送对应问题。
- [ ] 原有回答功能回归：verified / partial / no-answer 三种回答、引用侧栏、Copy、Copy as email、点赞点踩、Flag、Log as content gap 均正常。
- [ ] < 900px 时侧栏为抽屉，可用菜单按钮打开、点遮罩或按 Esc 关闭。
- [ ] 375px 宽度下无横向滚动。

## 6. 待决问题

- **Q1**：Team FAQ / Knowledge sources 两个页面保留吗？方案默认保留，放在 Resources 分组下。
- **Q2**：Staff handbook / Escalation directory 先做占位页（方案），还是链接到现有的内部文档地址？如有地址请提供。

## 7. 评审记录

| 日期 | 评审人 | 结论 | 备注 |
|---|---|---|---|
| | | | |
