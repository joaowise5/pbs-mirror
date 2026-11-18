# F1 · 品牌色值对齐 Figma

- 状态：Done（2026-10-15）
- 依赖：无
- 影响范围：`prototype/src/styles.css`（迁移后为 `frontend/src/styles.css`）

## 1. 背景

Figma 指定的品牌色：

| 角色 | 色值 |
|---|---|
| Primary（Cobalt） | `#2638C4` |
| Navy | `#0A145A` |
| White | `#FFFFFF` |
| Accent · Mint | `#48D3CD` |
| Accent · Yellow | `#FFCF00` |
| Accent · Coral | `#FE704E` |

原型现在的 token 接近但不一致（`--brand: #2a3ac0`、`--navy: #0e1550`、`--teal: #2bb3a0`），没有 Yellow / Coral；
`styles.css` 里还有约 30 处硬编码颜色，其中多处是旧品牌色的 rgba 写法（如 `rgba(42, 58, 192, .12)`），
只改 token 会漏掉。另外登录页背景是渐变，Figma 是纯色 `#2638C4`。

## 2. 目标

- 所有品牌色只在 `:root` 定义一次，组件里不再出现品牌色的十六进制或 rgba 字面量。
- 视觉与 Figma 一致：主色、导航深色、强调色、登录页纯色背景。
- 文字对比度满足 WCAG AA（正文 4.5:1，大字 3:1）。

## 3. 方案

### 3.1 Token 表（替换 `:root` 顶部）

| Token | 旧值 | 新值 | 说明 |
|---|---|---|---|
| `--brand` | `#2a3ac0` | `#2638C4` | Figma Primary |
| `--brand-strong` | `#1f2d9e` | `#1D2CA5` | hover / 按下态（Figma Make 里用的同一值） |
| `--brand-rgb` | — | `38, 56, 196` | 新增，供 `rgba(var(--brand-rgb), .12)` 使用 |
| `--brand-soft` | `#eef0fc` | `#EEF0FF` | 浅底（选中态、info 背景） |
| `--navy` | `#0e1550` | `#0A145A` | Figma Navy；标题文字、侧栏底色 |
| `--navy-rgb` | — | `10, 20, 90` | 新增，阴影用 |
| `--sidebar` | `#141c66` | `var(--navy)` | 侧栏改纯色 Navy（去掉渐变） |
| `--sidebar-2` | `#1c2680` | `#16217A` | 侧栏 hover / 选中底（Navy 提亮一档） |
| `--mint` | — | `#48D3CD` | 新增，替代 `--teal` |
| `--yellow` | — | `#FFCF00` | 新增 |
| `--coral` | — | `#FE704E` | 新增 |
| `--teal` | `#2bb3a0` | 删除 | 引用处改为 `--mint` |

语义色（`--ok / --warn / --danger` 及其 `-bg`）保留，但调整为与强调色同色系：

| Token | 新值 | 说明 |
|---|---|---|
| `--danger-bg` | `#FFF3F0` | Coral 浅底 |
| `--danger` | `#A43A24` | Coral 深色文字（白底对比度 ≥ 4.5:1） |
| `--warn-bg` | `#FFF8D9` | Yellow 浅底 |
| `--warn` | `#7A5B00` | Yellow 深色文字（≥ 4.5:1） |
| `--ok` / `--ok-bg` | 不变 | |

### 3.2 强调色的使用规则（对比度约束）

Mint、Yellow、Coral 在白底上对比度都不到 3:1，**不能当文字色**，只用于：

- 图标、圆点、左侧色条、徽章底色（徽章上的字用 `--navy`）；
- 例：在线状态点 = Mint；侧栏选中项左边条 = Mint；"Need human help?" 图标 = Yellow；"I don't know" 卡片强调 = Coral 浅底 + `--danger` 文字。

### 3.3 清理硬编码颜色

- 所有 `rgba(42, 58, 192, x)` → `rgba(var(--brand-rgb), x)`。
- 所有 `rgba(14, 21, 80, x)` / `rgba(8, 14, 70, x)` / `rgba(8, 12, 50, x)` → `rgba(var(--navy-rgb), x)`。
- `#2a3ac0`、`#eef0fc` 字面量 → 对应 token。
- `#fff`、`rgba(255,255,255,x)` 保留（白色不是品牌变量问题）。
- 灰阶（`#d9dceb`、`#9aa0b8`、`#fafbfe`）若已有接近的 token（`--line`、`--subtle`、`--bg`），合并到 token。
- 完成后执行 `grep -nE "#2a3ac0|42, 58, 192|14, 21, 80|teal" src/styles.css` 结果为空。

### 3.4 登录页背景

`.login` 的两层 radial-gradient 去掉，改为 `background: var(--brand);`，与 Figma 一致。

## 4. 不做

- Logo 替换（本轮跳过）。
- 字体：Figma 写 "PBS Sans (or similar)"，PBS Sans 没有授权文件，继续使用 Inter。
- 暗色模式。

## 5. 验收标准

- [ ] `:root` 中品牌色与第 1 节表格完全一致。
- [ ] 3.3 的 grep 检查结果为空。
- [ ] 登录页背景为纯色 `#2638C4`。
- [ ] 主按钮、链接、选中态、info 提示颜色随 token 变化，没有残留旧蓝色。
- [ ] 用浏览器 DevTools 抽查：正文、徽章文字、warn/danger 提示文字对比度 ≥ 4.5:1。
- [ ] 375px 与 1440px 宽度下截图对比无布局变化（本 feature 只改颜色）。

## 6. 风险

- 颜色改动面广，容易漏改。缓解：3.3 的 grep 作为验收硬条件。

## 7. 评审记录

| 日期 | 评审人 | 结论 | 备注 |
|---|---|---|---|
| | | | |
