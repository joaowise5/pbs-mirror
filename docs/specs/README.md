# UI 对齐 Figma：方案文档索引

目标设计：Figma Make「PBS Chatbot」
https://www.figma.com/make/IgIp1jPeyHdoSBllfQi2YP/PBS-Chatbot

背景：`prototype/` 已有可点击的 React 原型，登录页基本对齐设计；聊天页功能多于设计但结构不同；
缺 Loading 页、Feedback 页；品牌色值不一致；`frontend/` 仍是无样式 demo，未接入原型。

本轮范围：差距清单中的 1、3、4、5。**Logo（第 2 项）本轮不做**，继续使用占位 SVG。

## 流程

1. 每个 feature 先写方案文档（本目录），状态为 `Draft`。
2. 团队评审：在文档末尾「评审记录」里写结论与修改意见，或直接在 MR 里评论。
3. 状态改为 `Approved` 后才开始开发；开发完成改为 `Done`。
4. 开发顺序按依赖排列（见下表「依赖」）。

## Feature 列表

| ID | 文档 | 内容 | 依赖 | 状态 |
|---|---|---|---|---|
| F1 | [F1-brand-tokens.md](F1-brand-tokens.md) | 品牌色值对齐 Figma，清理硬编码颜色 | — | Done |
| F3a | [F3a-loading-screen.md](F3a-loading-screen.md) | 启动 Loading 页 | F1 | Done |
| F3b | [F3b-feedback-page.md](F3b-feedback-page.md) | 独立 Feedback 页（评分 / 分类 / 评论 / 成功页） | F1, F4 | Done |
| F4 | [F4-chat-layout.md](F4-chat-layout.md) | 聊天页布局重构：顶部栏 + 新侧栏 | F1 | Done |
| F5a | [F5a-merge-into-frontend.md](F5a-merge-into-frontend.md) | 把 prototype 迁入 `frontend/`，成为唯一前端 | F1–F4 | Done |
| F5b | [F5b-backend-integration.md](F5b-backend-integration.md) | 后端 `/api/ask` 结构化回答 + 前端接入 | F5a | Done |

建议开发顺序：F1 → F4 → F3a → F3b → F5a → F5b。

## 共同约定

- 技术栈不变：React 18 + Vite 5，纯 CSS（`styles.css` 顶部 token），不引入 Tailwind / UI 库。
- 所有 UI 文案为英文（与 Figma 一致）。
- 响应式下限 375px；保留 `prefers-reduced-motion` 支持。
- 每个 feature 一个 commit（或一个 MR），提交信息引用 Feature ID。

## 待团队决定的问题（汇总）

各文档里的「待决问题」汇总在此，评审时请逐条给结论：

- F4-Q1：原型额外的 Team FAQ / Knowledge sources 两个页面保留吗？（方案默认：保留，放在侧栏 Resources 分组下）
- F4-Q2：Figma 的 Staff handbook / Escalation directory 目前没有内容来源，先做成占位页还是外链？
- F3b-Q1：Feedback 提交后去哪？Figma 是 "Done" 回到登录页（等于登出），方案建议改成回到聊天。
- F5b-Q1：模型选择与费用由谁拍板？（方案默认 `claude-opus-5-5`，可用环境变量覆盖）
- F5b-Q2：知识库内容从哪里来？本轮先把原型的 sample KB 搬到后端，真实 RAG 另开一期。
