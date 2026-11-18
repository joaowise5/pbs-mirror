# F3a · 启动 Loading 页

- 状态：Done（2026-10-15）
- 依赖：F1（颜色 token）
- 影响范围：新增 `components/LoadingScreen.jsx`；修改 `App.jsx`、`styles.css`

## 1. 背景

Figma 的流程是 **Loading → Login → Chat → Feedback**。原型直接从 Login 开始，没有 Loading 页。

Figma 的 Loading 页：纯色 `#2638C4` 背景，居中白色 logo 标志 + 外圈旋转环，
标题 "Preparing your workspace"，副标题 "Connecting to the support knowledge base…"，下方一条 Mint 色的不定进度条。

## 2. 目标

- 视觉与 Figma 一致。
- Loading 页要有实际作用，不是固定等 1.3 秒：在这段时间里恢复登录会话、检查后端是否可用。

## 3. 方案

### 3.1 何时显示

只在**应用首次加载**时显示一次。登录成功后进入聊天页**不再**显示 Loading（避免每次登录多等一下）。

### 3.2 启动时做什么

`App.jsx` 增加 `booting` 状态，初始为 `true`，挂载后并行执行：

1. `auth.currentUser()`：恢复会话（现在是同步读 sessionStorage，以后接 SSO 时会变成异步，所以统一按 Promise 处理）。
2. `assistant.health()`：请求后端 `GET /health`，超时 3 秒。F5b 之前的 mock 实现直接返回 `{ ok: true }`。

两者都完成，并且**至少显示 600ms**（避免一闪而过）后，`booting = false`：

- 有会话 → 进聊天页；无会话 → 进登录页。
- 健康检查结果存到 App 状态 `backendStatus: 'online' | 'offline'`，传给 F4 顶部栏的状态指示（"Knowledge base online" / "Knowledge base offline"）。
- 后端不可用**不阻塞**进入应用：用户仍能登录，提问时会走 F5b 定义的错误态。

```
mount ──► [currentUser, health(timeout 3s), wait(600ms)] ──► booting=false
                                                          ├─ user? → AppShell
                                                          └─ none  → LoginScreen
```

### 3.3 组件

`LoadingScreen.jsx`（无 props，只负责展示）：

```jsx
<main className="loading" role="status" aria-live="polite">
  <div className="loading__mark"><LogoMark /><span className="loading__ring" /></div>
  <h1>Preparing your workspace</h1>
  <p>Connecting to the support knowledge base…</p>
  <div className="loading__track"><span /></div>
</main>
```

- Logo 继续使用占位 `LogoMark`（Logo 替换本轮不做），渲染为白色。
- 样式：背景 `var(--brand)`；旋转环边框 `rgba(255,255,255,.12)`，顶部一段 `var(--mint)`，1s 匀速旋转；进度条底 `rgba(255,255,255,.12)`，滑块 `var(--mint)`。
- `prefers-reduced-motion: reduce` 时关闭旋转与滑动动画，进度条改为静态 50% 宽度。

## 4. 不做

- 不加"跳过"按钮（最长等待 3 秒，不需要）。
- 不做加载失败的独立错误页（离线状态在聊天页顶部栏体现）。

## 5. 验收标准

- [ ] 刷新页面先看到 Loading 页，文案与 Figma 一致。
- [ ] 无会话时进入登录页；登录后刷新页面直接进入聊天页（会话恢复生效）。
- [ ] Loading 至少显示 600ms，最多约 3 秒（后端无响应时）。
- [ ] 登录成功后不再出现 Loading 页。
- [ ] 关闭后端时，Loading 结束后能正常进入应用，顶部栏显示 offline（与 F4 联调）。
- [ ] 开启系统"减少动态效果"后无动画。
- [ ] 读屏软件能读出 "Preparing your workspace"。

## 6. 待决问题

无。

## 7. 评审记录

| 日期 | 评审人 | 结论 | 备注 |
|---|---|---|---|
| | | | |
