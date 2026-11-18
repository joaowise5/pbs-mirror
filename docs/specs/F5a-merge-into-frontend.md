# F5a · 把 prototype 迁入 frontend

- 状态：Done（2026-10-15）
- 依赖：F1、F3a、F3b、F4 完成（在 `prototype/` 中完成并验收后再迁移，减少迁移中途改设计的冲突）
- 影响范围：`frontend/`（整体替换 `src/`）、删除 `prototype/`、`README.md`、`.gitlab-ci.yml`

## 1. 背景

仓库里现在有两个前端：

| 目录 | 内容 | 端口 |
|---|---|---|
| `frontend/` | 单文件 demo（`App.jsx` 97 行，内联样式），直接 `fetch('http://localhost:8000/api/chat')` | 5173 |
| `prototype/` | 完整 UI 原型（登录、聊天、FAQ、Sources、引用侧栏…），数据全是 mock | 5174 |

两者技术栈相同（React 18 + Vite 5），依赖几乎一样。README 和 CI 都指向 `frontend/`，但真正的 UI 在 `prototype/`。

## 2. 目标

- `frontend/` 成为唯一前端，内容就是原型（含 F1–F4 改动）。
- 保留通过环境变量切换 **mock / 真实后端** 的能力：没有后端也能演示；后端接好后（F5b）改一个变量即可切换。
- 删除 `prototype/`，避免两份代码分叉。
- CI 能真正构建前端。

## 3. 方案

### 3.1 文件迁移

用 `git mv` 保留历史：

| 来源 | 目标 | 备注 |
|---|---|---|
| `prototype/src/**` | `frontend/src/**` | 覆盖 `frontend/src/App.jsx`、`main.jsx` |
| `prototype/index.html` | `frontend/index.html` | 标题 "PBS Wisconsin Help Assistant"，带 Inter 字体 |
| `prototype/vite.config.js` | `frontend/vite.config.js` | 端口改为 **5173**（后端 CORS 白名单就是 5173） |
| `prototype/package.json` | 合并进 `frontend/package.json` | 保留 `frontend` 的包名；依赖两边一致，重新生成 `package-lock.json` |
| `prototype/README.md` | 合并进 `frontend/README.md` | 保留"项目结构""对接后端"两节 |
| 旧 `frontend/src/App.jsx` 的请求逻辑 | 删除 | 由 `services/assistant.js` 的 api 模式取代（F5b） |

迁移后删除 `prototype/` 目录。

> 旧 `frontend/` 没有 `vite.config.js`，所以 `@vitejs/plugin-react` 实际没生效（没有 React Fast Refresh）。迁移后使用原型的配置，这个问题一并解决。

### 3.2 环境变量

新增 `frontend/.env.example`（提交到仓库），本地复制为 `.env.local`（`.gitignore` 需补规则，见 3.5）：

```
# mock = 使用前端内置的示例知识库，不需要后端
# api  = 调用 FastAPI 后端
VITE_ASSISTANT_MODE=mock
VITE_API_BASE_URL=http://localhost:8000
```

- `services/assistant.js` 拆成三个文件：
  - `services/assistant.mock.js`：现在的关键词检索（原样搬过去）
  - `services/assistant.api.js`：调用后端（F5b 实现，F5a 中先放一个抛出 "Not implemented" 的占位）
  - `services/assistant.js`：根据 `import.meta.env.VITE_ASSISTANT_MODE` 导出其中一个，对外接口不变：`ask(question, { onStatus })`、`health()`
- 默认 `mock`，所以迁移后不启动后端也能完整演示。
- 顶部栏的 "Prototype · sample data" 标签只在 `mock` 模式下显示。

### 3.3 示例数据

`src/data/knowledgeBase.js` 暂时保留在前端（mock 模式要用）。F5b 会把同一份数据复制到后端作为初始知识库，之后前端这份只给 mock 模式用。

### 3.4 CI

`.gitlab-ci.yml` 的 `frontend-lint` 现在只跑 `npm install --package-lock-only`，不会发现编译错误。改为：

```yaml
frontend-build:
  stage: lint
  image: node:18-alpine
  script:
    - cd frontend
    - npm ci
    - npm run build
```

### 3.5 文档

- 根目录 `README.md`：前端说明改为新的运行方式；增加 "Demo without backend（mock 模式）" 与 "Connect to backend（api 模式）" 两小节。
- `.gitignore`：确认 `frontend/.env.local` 被忽略（现有规则是 `.env` 和 `*.env`，**不覆盖** `.env.local`），补一条 `.env.*.local` 和 `.env.local`，同时用 `!.env.example` 放行示例文件。

## 4. 不做

- 不引入 TypeScript、ESLint、测试框架（可另开 feature）。
- 不改任何 UI。迁移前后页面应完全一致。

## 5. 验收标准

- [ ] 仓库中不再有 `prototype/` 目录；`git log --follow frontend/src/components/AppShell.jsx` 能看到原型时期的历史。
- [ ] `cd frontend && npm ci && npm run dev` 在 5173 端口启动，不启动后端也能走完 Loading → 登录 → 提问 → 反馈全流程。
- [ ] `npm run build` 成功。
- [ ] 迁移前后同一页面截图一致。
- [ ] `VITE_ASSISTANT_MODE=api` 时，未实现的 api 模式会在回答处显示错误态，不白屏。
- [ ] CI 的 `frontend-build` 任务通过。
- [ ] `.env.local` 不会被 git 跟踪。

## 6. 风险

- 迁移期间如果有人还在改 `prototype/`，会产生冲突。缓解：迁移前在群里通知，迁移 MR 尽快合并；之后所有改动在 `frontend/`。

## 7. 评审记录

| 日期 | 评审人 | 结论 | 备注 |
|---|---|---|---|
| | | | |
