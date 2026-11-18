# F5b · 后端结构化回答 + 前端接入

- 状态：Done（2026-10-15）
- 依赖：F5a（前端已迁入 `frontend/`，`assistant.js` 已支持 mock / api 切换）
- 影响范围：`backend/app.py`（拆分为多个模块）、`backend/requirements.txt`、新增 `backend/data/`、`backend/tests/`；`frontend/src/services/assistant.api.js`、`Message.jsx`（小改）、`.gitlab-ci.yml`

## 1. 背景

### 后端现状

- 只有 `POST /api/chat`：收 `{prompt}`，把问题原样发给 Claude（`claude-sonnet-4-5`，系统提示一句话），返回 `{response: "纯文本"}`。
- 没有知识库，回答不带来源，模型可能编造政策。
- 调用失败时把错误信息当成正常回答返回（前端无法区分成功和失败）。
- **`requirements.txt` 里没有 `anthropic`**（列的是没用到的 `openai`），按 README 安装后启动会报 `ModuleNotFoundError`。

### 前端期望

原型的回答卡片需要结构化数据（README 中已定义）：`status`、`confidence`、`summary`、`steps`、`details`、`note`、`citations[]`（含原文摘录）、`related[]`；拒答时 `status: "no_answer"` + `closest[]`。

## 2. 目标

- 新接口 `POST /api/ask` 返回前端需要的结构化回答，前端切到 `api` 模式后**UI 不用改**（除 3.6 的一处小改）。
- 回答只基于知识库；**引用的原文摘录由后端从知识库里取，不让模型自己写**，保证摘录真实。
- 找不到依据时明确拒答（no_answer），不猜。
- 错误用 HTTP 状态码表达，前端能显示错误态。
- 反馈（F3b 的 survey、单条回答的 flag / gap）能存到后端。

## 3. 方案

### 3.1 依赖与配置

`requirements.txt`：

```
fastapi
uvicorn
anthropic
python-dotenv
pydantic>=2
pytest          # 仅测试
httpx           # FastAPI TestClient 依赖
```

删除未使用的 `openai`。

`backend/.env`（不提交）新增可选项：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | 必填（mock 模式不需要后端） |
| `CLAUDE_MODEL` | `claude-opus-5-5` | 见待决问题 Q1 |
| `CLAUDE_EFFORT` | `low` | 问答场景要求快；回答质量不够再调高 |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | CORS 白名单，逗号分隔 |

### 3.2 目录结构

```
backend/
  app.py                 FastAPI 入口、路由、CORS
  assistant.py           组装提示、调用 Claude、校验输出
  knowledge_base.py      加载知识库、生成可引用段落
  feedback_store.py      反馈读写（JSON Lines 文件）
  schemas.py             Pydantic 请求 / 响应模型
  data/knowledge_base.json   由前端 knowledgeBase.js 转换而来（示例数据）
  data/feedback.jsonl        运行时生成，加入 .gitignore
  tests/test_api.py
```

### 3.3 接口

#### `GET /health`

```json
{ "status": "ok", "mode": "live" | "no_key", "model": "claude-opus-5-5", "sources": 7 }
```

F3a 的 Loading 页用它判断 online / offline；`mode: "no_key"` 时前端也显示 offline。

#### `POST /api/ask`

请求：

```json
{
  "question": "Member activated Passport but videos are still locked",
  "history": [ { "role": "user", "text": "…" }, { "role": "assistant", "text": "…" } ]
}
```

- `question`：必填，1–2000 字符。
- `history`：可选，同一对话里之前的问答（前端取最近 6 条；assistant 的 text 用 `summary`），用于理解追问。

响应 200：README 中定义的两种形状（`answered` / `no_answer`），字段说明见 3.5。

错误：

| 状态码 | 场景 | body |
|---|---|---|
| 422 | 参数不合法（FastAPI 自动） | FastAPI 默认格式 |
| 503 | 未配置 API key | `{ "error": "assistant_unavailable", "message": "…" }` |
| 502 | 调用 Claude 失败 / 超时（30 秒） | `{ "error": "upstream_error", "message": "…" }` |

#### `POST /api/feedback` / `GET /api/feedback`

- POST body 即 F3b 的数据结构（`kind: survey | flag | gap`），后端补 `id`、`at`，追加写入 `data/feedback.jsonl`，返回 201 + 记录。
- GET 返回全部记录（按时间倒序），给 Knowledge sources 页的反馈队列使用。
- 本期没有登录鉴权，`by` 字段由前端提交，后端不校验（见第 6 节风险）。

#### 删除 `POST /api/chat`

旧 demo 前端在 F5a 已删除，没有调用方了。

### 3.4 知识库与"可引用段落"

示例知识库只有 7 个来源、约 20 条问答，总量很小，**本期不做向量检索**：每次请求把整个知识库放进系统提示，由 Claude 选择相关内容。真实知识库接入时再换成检索（见待决问题 Q2）。

`knowledge_base.py` 启动时把知识库整理成两部分：

1. **参考内容**：每条问答的 summary / steps / details / note，供模型理解。
2. **可引用段落**：每条问答 `citations` 里的 excerpt，编号为 `P1`、`P2`…，每段记录它属于哪个来源（`S1`…）。

提示里要求模型：只能依据参考内容回答；引用时**只填段落编号**。后端拿到编号后，从知识库查出原文摘录和来源信息（标题、类型、负责人、更新日期）填到 `citations`。模型写的编号不存在时直接丢弃该引用；如果丢弃后一条引用都没有，整条回答降级为 `no_answer`。

系统提示（含知识库）放在请求最前面并开启 prompt caching，同一知识库的连续请求可以复用缓存，降低延迟和费用。

### 3.5 让 Claude 输出结构化结果

使用 Anthropic Python SDK 的结构化输出（`client.messages.parse` + Pydantic 模型），保证返回的 JSON 一定符合格式，不需要自己解析文本。

模型输出的结构（`schemas.ModelAnswer`）：

```python
class ModelAnswer(BaseModel):
    status: Literal["answered", "no_answer"]
    confidence: Literal["high", "medium"] | None   # no_answer 时为 None
    category: str | None
    summary: str
    steps: list[str]
    details: list[str]
    note: str
    passage_ids: list[str]        # 例如 ["P3", "P7"]
    related_entry_ids: list[str]  # 相关问答的 id，后端换成 {id, question}
```

后端把它转换成前端需要的响应（README 中的形状）：

| 前端字段 | 来源 |
|---|---|
| `status`、`confidence`、`category`、`summary`、`steps`、`details`、`note` | 模型输出 |
| `citations[]` | 由 `passage_ids` 查知识库得到（3.4） |
| `related[]` / `closest[]` | 由 `related_entry_ids` 查知识库得到；不存在的 id 丢弃 |
| `score` | **返回 `null`**。没有检索就没有真实的匹配分数，不让模型自己打分冒充 |
| `latencyMs` | 后端计时 |

其他调用细节：

- 模型、effort 读取 3.1 的配置；thinking 使用默认（adaptive）。
- 开启服务端拒答回退（Anthropic 的 refusal fallback，`fallbacks: "default"`）；若最终仍是拒答（`stop_reason == "refusal"`），后端返回 `no_answer`，不报错。
- 具体 SDK 写法在开发时对照官方文档确认，不在本文档里固定。

### 3.6 前端接入

- `services/assistant.api.js`：
  - `ask(question, { onStatus, history })`：先 `onStatus('Searching the knowledge base…')`，然后 `POST /api/ask`；非 2xx 时抛出带 `message` 的错误，`AppShell` 已有的 catch 会把它显示成错误态。
  - `health()`：`GET /health`，3 秒超时，失败返回 `{ ok: false }`。
- `AppShell.send()` 调用时传入 `history`（当前对话最近 6 条）。
- 反馈：`messageActions.submitFlag` / `logGap` 和 F3b 的提交同时调用 `POST /api/feedback`；Knowledge sources 页加载时 `GET /api/feedback`。
- `Message.jsx` 唯一改动：`score` 为 `null` 时不显示 "Match NN%"。
- 错误态文案按情况区分：503 → "The assistant isn't connected right now."；502 / 网络错误 → "Something went wrong reaching the assistant. Try again in a moment."

### 3.7 测试与 CI

`backend/tests/test_api.py`，用假的 Claude 客户端（不真正调用 API）覆盖：

- 正常回答：段落编号被替换成正确的原文摘录和来源信息；
- 模型返回不存在的段落编号 → 该引用被丢弃；全部无效 → 降级为 `no_answer`；
- 拒答（refusal）→ `no_answer`；
- 未配置 key → 503；上游异常 → 502；
- 空问题 / 超长问题 → 422；
- 反馈 POST 后 GET 能读到。

CI 的 `backend-lint` 增加：`pip install -r backend/requirements.txt && pytest backend/tests`。

## 4. 不做

- 向量数据库 / 文档导入流程（等真实知识库确定后另开 feature）。
- 流式输出（回答较短，先用一次性返回；体验不够再加）。
- SSO 登录与接口鉴权。
- 对话持久化。

## 5. 验收标准

- [ ] 按 README 全新安装后端，`uvicorn app:app` 能启动（`anthropic` 依赖问题修复）。
- [ ] 前端 `VITE_ASSISTANT_MODE=api` + 后端已配置 key：README 列出的三个示例问题分别得到 verified / partial / no-answer 三种结果。
- [ ] 每条引用的摘录与 `knowledge_base.json` 中的原文完全一致。
- [ ] 问知识库外的问题（如 "Can I get a refund on my tote bag?"）得到 no_answer，而不是编造的答案。
- [ ] 追问（如先问 Roku 激活，再问 "what about Fire TV?"）能结合上下文回答。
- [ ] 后端关闭时：Loading 后顶部栏显示 offline，提问显示错误态，页面不白屏。
- [ ] 未配置 key 时：`/health` 返回 `mode: "no_key"`，提问显示 "The assistant isn't connected right now."
- [ ] 反馈提交后，刷新页面在 Knowledge sources 队列里仍能看到。
- [ ] `pytest backend/tests` 全部通过，CI 通过。

## 6. 风险

| 风险 | 缓解 |
|---|---|
| 示例知识库是占位内容，不是 PBS 真实政策 | 顶部栏保留 "sample data" 提示，直到接入真实知识库 |
| 接口没有鉴权，任何能访问后端的人都能调用并产生 API 费用 | 本期只在本地 / 内网演示；上线前必须加 SSO 鉴权（另开 feature） |
| 把整个知识库放进提示，知识库变大后成本和延迟上升 | 真实知识库接入时改为检索（Q2） |
| 模型选错段落编号 | 后端校验编号 + 无有效引用时降级为 no_answer |

## 7. 待决问题

- **Q1**：用哪个模型、谁承担费用？方案默认 `claude-opus-5-5`（当前默认推荐），可通过 `CLAUDE_MODEL` 改成更便宜的型号。需要和 PBS 提供 key 的负责人确认额度。
- **Q2**：真实知识库从哪里来（PBS 帮助中心爬取、共享盘 PDF、内部 wiki）？谁负责提供和更新？这决定下一期检索方案。

## 8. 评审记录

| 日期 | 评审人 | 结论 | 备注 |
|---|---|---|---|
| | | | |
