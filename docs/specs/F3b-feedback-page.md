# F3b · 独立 Feedback 页

- 状态：Done（2026-10-15）
- 依赖：F1（颜色）、F4（入口按钮在顶部栏和侧栏）
- 影响范围：新增 `components/FeedbackView.jsx`；修改 `AppShell.jsx`、`lib/views.js`、`SourcesView.jsx`、`styles.css`

## 1. 背景

Figma 有一个独立的反馈页，用来收集**对助手整体使用体验**的评价：

- 标题 "Help us improve your experience."，副标题 "Tell us how well the assistant supported your work today."
- **评分**（必填）：5 个按钮 `1 Not useful / 2 Slightly / 3 Helpful / 4 Very helpful / 5 Excellent`
- **分类**（可选，单选标签）：`Answer accuracy / Ease of use / Response speed / Content coverage`
- **补充评论**（可选，多行文本）
- "Submit feedback" 按钮，未选评分时禁用
- 提交后是成功卡片："Thank you, {名字}."，按钮 "Back to chat" / "Done"
- 入口：聊天页顶部的 "Share feedback" 按钮和侧栏里的 Feedback 项

原型目前只有**针对单条回答**的反馈（点赞 / 点踩 / Flag / 记录内容缺口），汇总在 Knowledge sources 页的队列里，没有整体体验反馈。

## 2. 目标

- 新增与 Figma 一致的反馈页。
- 和现有的单条回答反馈**并存**，分工清楚：
  - 单条回答反馈 → 这条答案对不对（给内容团队改知识库）；
  - 整体反馈页 → 这个工具好不好用（给产品团队改产品）。

## 3. 方案

### 3.1 路由与入口

- `lib/views.js` 增加 `feedback: { label: 'Feedback', icon: 'message-square' }`。
- 入口（由 F4 提供位置）：
  - 顶部栏右侧 "Share feedback" 按钮（次级按钮样式，手机宽度下只显示图标）；
  - 侧栏底部 "Share feedback" 项。
- 进入时记住来源页（`returnTo`，默认 `assistant`），"Back to chat" 回到来源页，并保留原来的对话。

### 3.2 页面结构（`FeedbackView.jsx`）

```
┌───────────────────────────────────────────────┐
│ ‹ Back to chat                                │
│ ASSISTANT FEEDBACK (eyebrow)                  │
│ Help us improve your experience.              │
│ Tell us how well the assistant supported…     │
│                                               │
│ How useful was your experience? *             │
│ [1 Not useful][2 Slightly][3 Helpful][4][5]   │
│                                               │
│ What would you like to comment on?            │
│ (Answer accuracy)(Ease of use)(Response…)(…)  │
│                                               │
│ Additional comments  Optional                 │
│ ┌───────────────────────────────────────────┐ │
│ └───────────────────────────────────────────┘ │
│                          [Submit feedback →]  │
└───────────────────────────────────────────────┘
```

- 白色卡片，最大宽度 680px，水平居中，页面背景 `var(--bg)`。
- 评分：`role="radiogroup"`，每个按钮 `role="radio"` + `aria-checked`，支持方向键切换；选中态边框 `var(--brand)`、底色 `var(--brand-soft)`。
- 分类：单选标签，再点一次取消选择；选中态同上。
- 评论：`<textarea>`，最多 1000 字，右下角显示字数；超过上限禁止继续输入。
- 提交按钮：没选评分时禁用，鼠标悬停提示 "Choose a rating to submit"。
- 手机宽度（< 620px）：评分按钮只显示数字，文字标签隐藏（用 `aria-label` 保留完整含义）。

### 3.3 成功态

```
        ✓  (Mint 底色方块，Navy 勾)
     FEEDBACK RECEIVED
   Thank you, {firstName}.
 Your input helps us make the assistant more useful…
   [Back to chat]   [Done]
```

- **"Done" 的行为与 Figma 不同**：Figma 是回到登录页（等于登出），方案改为回到聊天页的新对话。原因：员工提交反馈后通常还要继续工作，登出会打断。见待决问题 Q1。
- "Back to chat" 回到 `returnTo`，保留原对话。

### 3.4 数据

提交时生成：

```js
{
  id, kind: 'survey',
  rating: 1..5,
  category: 'Answer accuracy' | 'Ease of use' | 'Response speed' | 'Content coverage' | null,
  comment: string,          // 去掉首尾空格，可为空
  by: user.name, at: Date,
  conversationId: activeId  // 提交时正在看的对话，可为空，方便追溯
}
```

- F5b 之前：存入 `AppShell` 现有的 `feedback` 状态（与 flag / gap 同一个列表）。
- F5b 之后：同时 `POST /api/feedback`（接口见 F5b），失败时显示 toast "Couldn't send feedback. Try again." 并保留表单内容。
- Knowledge sources 页的反馈队列增加 "Survey" 类型的展示：显示评分、分类、评论；表头统计卡片 "Flagged by staff" 只统计 flag + gap，另加一张 "Avg. rating" 卡片。

## 4. 不做

- 不做匿名提交选项（内部工具，默认带姓名）。
- 不做反馈统计报表（只在队列中列出）。

## 5. 验收标准

- [ ] 顶部栏和侧栏都能进入反馈页；"Back to chat" 回到原对话。
- [ ] 文案、评分标签、分类标签与 Figma 一致。
- [ ] 未选评分时提交按钮禁用；只选评分即可提交。
- [ ] 评分组支持键盘方向键操作，读屏能读出当前选中项。
- [ ] 提交后显示成功卡片，名字为当前用户的名。
- [ ] "Done" 回到聊天新对话，不会登出（若 Q1 结论不同则按结论）。
- [ ] Knowledge sources 队列能看到 Survey 记录。
- [ ] 375px 宽度下布局正常，评分按钮只显示数字。

## 6. 待决问题

- **Q1**：成功页 "Done" 回到聊天（方案）还是像 Figma 一样回到登录页？

## 7. 评审记录

| 日期 | 评审人 | 结论 | 备注 |
|---|---|---|---|
| | | | |
