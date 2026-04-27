---
title: "Design prototype 对齐生产的整轮 sweep —— 保留用户决定 + 面向用户 changelog + tab 排版修复"
date: 2026-04-22
category: best-practices
module: frontend-ui
problem_type: best_practice
component: frontend_stimulus
severity: medium
related_components:
  - documentation
  - tooling
applies_when:
  - "已有定稿的 HTML / Figma 原型 + 共享 CSS，但生产代码长期漂移"
  - "需要跨 10+ 组件批量对齐视觉而不破坏用户已经批准的修改"
  - "面向终端用户的 changelog 被技术术语污染需要重写"
  - "全局 tab 栏改形状 / 内容后出现 flex wrap 折行"
  - "一个 UI 有两个入口或两份实现，需要统一而不改 props 链"
tags:
  - design-parity
  - tailwind-v4
  - glass-thick
  - changelog-rewrite
  - component-dedup
  - tab-layout
  - react-19
  - user-facing-copy
  - custom-event-bus
---

# Design prototype 对齐生产的整轮 sweep

## Context

MemeFlow 进入"设计原型 → 生产代码"的最后收尾阶段：让 `design-prototypes/*.html`（login / slang-dictionary / wordbook / classroom / review / grammar / paywall / user / leaderboard / modals / guidelines 共 11 个静态 HTML + `_shared.css` 设计 token）和 `src/pages/*.tsx` + `src/components/*.tsx` 的生产实现达到 98% 视觉与结构对齐。

这个阶段的典型挑战有三个：

1. **用户已经在原型之外叠加了不少自主决定** —— 例如 Logo 用 Lucide `Languages` 图标而不是原型 logomark、主容器宽度收紧到 `max-w-2xl`、Classroom 加了合规 modal、复习页加了"再练一次"按钮。这些改动不能被"1:1 对齐原型"的 sweep 覆盖。
2. **原型里的视觉细节量很大** —— 字号、圆角、字体族（`font-display` / `font-zh-serif`）、`<em>` 斜体强调、蓝 / 紫色主题配色、`glass-thick` / `glass-shell` 液态玻璃层级、`t-mono-strong` 数字字重。人肉读 HTML 一定漏。
3. **Changelog 长期写成"技术 diff 罗列"** —— `glass-thick rounded-xl` / CSP / schema bump / dispatchEvent 这类词对终端用户是噪音，他们看不出关心的功能到底改了什么。

顺带出现两次 Tab 横排折行 bug —— 都是 `flex` 子项宽度计算在 `max-width` 容器下的同一个陷阱。

## Guidance

### 1. 分批 audit + 分批改 + 分批 deploy

不要一次性改完 50 处差异再部署。每批 10 处左右就 `npm run build && firebase deploy --only hosting` 并在生产域名上截图验证。一次性大改一旦回归，根因定位成本指数级上升。典型节奏：

```
Batch 1  登录 / 启动 / 维护     → build → deploy → 截图
Batch 2  梗百科                 → build → deploy → 截图
Batch 3  单词本 / 翻译          → build → deploy → 截图
Batch 4  复习 / 语法 / 课堂同传  → build → deploy → 截图
...
```

### 2. 派并行 audit agent，主 agent 只消费清单

主 agent 不要自己逐行读 11 份 HTML。开 3 个 `general-purpose` subagent 并行，每个负责 3-4 个页面组。prompt 要求返回**三档差异清单**：

- 🔴 **结构差异**：DOM 层级、组件缺失、交互行为
- 🟡 **视觉差异**：字号、圆角、间距、颜色 token
- 🟢 **文案差异**：标题、按钮文字、空态提示

主 agent 拿到合并清单后直接按优先级批量改，省掉上下文里塞 11 份 HTML 的 token 开销。

### 3. "用户保留清单"必须写进每个 audit prompt

派发 audit agent 时，prompt 的第一段要列出**用户已确认不能改回的 N 项**，例如：

```
【保留清单 — 不得改动】
- Logo 图标使用 Lucide <Languages />，不要换回原型 logomark
- 主容器宽度 max-w-2xl，不要放宽到 max-w-4xl
- Classroom 首次打开合规 modal 保留
- 复习页"再练一次"按钮保留
- Leaderboard "积分规则" 收成 collapsible
- ...
```

否则 agent 会把原型当唯一真值源，把用户的决定当"bug"修掉。用户的三句高频抱怨 —— *"你怎么又把我改的覆盖了"* / *"我给你举的例子都没改"* / *"日志写得不面向用户"* —— 每一句都对应这里一条规则没执行。

### 4. 一份 UI 两个入口 —— 用全局 CustomEvent 解耦

发现 `UserProfile.tsx` 里内嵌了 81 行 Settings Drawer JSX，而 `SettingsModal.tsx` 又是独立实现。不要改 props 链让父组件传 `onOpenSettings` —— 用浏览器原生事件总线：

**入口侧（任意组件内）**：
```tsx
<button onClick={() => window.dispatchEvent(new CustomEvent('memeflow:open-settings'))}>
  设置
</button>
```

**接收侧（`SettingsModal.tsx` 内部）**：
```tsx
useEffect(() => {
  const h = () => setIsOpen(true);
  window.addEventListener('memeflow:open-settings', h);
  return () => window.removeEventListener('memeflow:open-settings', h);
}, []);
```

UserProfile 里那 81 行 drawer 直接删掉。事件命名用 `memeflow:` 前缀避免冲突。

**Why not props?** UserProfile 和 SettingsModal 在组件树上不是父子关系（SettingsModal 由 header 渲染、UserProfile 由路由渲染），要 props 传递得把 `onOpenSettings` 拉到 App.tsx 级别再反向下发，污染面大。事件总线是对这类"远距离耦合"的最小侵入解。

### 5. Tab 横排折行 bug 的标准防御

**症状**：Tab 栏改成"完整胶囊 + 单行图标文字"后，6 个 tab 在 `max-w-2xl` (672px) 容器下折成两行。

**根因**：`flex` 子项给了 `flex-1 min-w-[80px]`，父容器到 max-width 上限后，子项算出来的内容宽度 > 80px 就把自己挤到下一行。

**修复三件套（缺一不可）**：

```tsx
// Before — 在 max-w-2xl 下折行
<div className="flex gap-2">
  <button className="flex-1 min-w-[80px]">翻译</button>
  <button className="flex-1 min-w-[80px]">课堂同传</button>
  {/* ... 4 more tabs */}
</div>

// After — 允许横向滚动而不是折行
<div className="flex flex-nowrap overflow-x-auto gap-2">
  <button className="flex-1 min-w-fit shrink-0">翻译</button>
  <button className="flex-1 min-w-fit shrink-0">课堂同传</button>
  {/* ... */}
</div>
```

- `flex-nowrap` — 禁止折行
- `shrink-0` — 子项不被压缩
- `min-w-fit` — 按内容宽度撑开而不是硬 80px
- `overflow-x-auto`（父容器）— 塞不下时横向滚动兜底

**每次改 tab 形状 / 文案 / 内部结构之后，必须在最大容器宽度（`max-w-2xl` / `max-w-4xl`）下截图验证。** 本次 sweep 中这个 bug 出现了两次。

### 6. Changelog 面向用户的写法规则

- **禁止技术术语**：`glass-thick` / `rounded-xl` / CSP / schema / hasOnly / dispatchEvent 一律不出现
- **用"以前 → 现在"对比句式**："以前每次打开都要重新选语言，现在记住你上次的选择"
- **超过 15 条就按分类 tag 收敛**：`【复习】...` / `【单词本】...` / `【翻译/语法】...` / `【统一视觉】...`
- **合并版本号**：把多个细颗粒版本合并时，version 字段**回退到合并后的版本号**（例：0.3.6 合并到 0.3.1）。`compareVersions` 要做 defensive 读取（空串 / undefined 当 `0.0.0`），保证 `localStorage` 里老的 last-seen-version（可能是已经被删的 0.3.5）仍能触发铃铛红点。见 `src/data/changelog.ts` 的 `readLastSeen` 实现。

### 7. 原型 → 代码的 token 对照表

建表是一次性投入，后续所有批次复用：

| 原型（Tailwind 原子） | 生产（CSS 变量 / 组件类） |
|---|---|
| `text-gray-900` | `var(--ink)` |
| `text-gray-600` / `text-gray-700` | `var(--ink-body)` |
| `text-gray-400` / `text-gray-500` | `var(--ink-muted)` |
| `text-gray-300` | `var(--ink-subtle)` |
| `border-gray-100` / `border-gray-200` | `var(--ink-hairline)` |
| `bg-white`（hero 卡 / 付费弹窗 / 登录卡） | `glass-thick` |
| `bg-white`（data 卡 / 列表项） | `surface` |
| `text-red-*` | `var(--red-warn)` |
| `rounded-3xl shadow-xl` | `surface !rounded-[18px]`（去掉重阴影） |

对照表写进 `CLAUDE.md` 或 audit prompt 里，agent 就不会每次都重新猜。

## Why This Matters

- 三句用户抱怨 —— "你怎么又把我改的覆盖了" / "我给你举的例子都没改" / "日志写得不面向用户" —— 每一句都对应 Guidance 里一条规则没执行。这不是努力程度问题，是 prompt 工程 + 流程纪律问题。
- Tab 折行 bug 在两次连续会话里出现两次，是 `flex` 计算模型在 `max-width` 容器下的经典陷阱。写进知识库后，下次改 tab 形状前先搜这条。
- 一份 UI 两个入口是组件演化中最容易腐烂的点。CustomEvent 方案把侵入面控制在两处（入口 + 接收），比"props 拉到顶+下传"成本低得多。

## When to Apply

- 从 HTML / Figma 原型 1:1 迁移到 React 生产代码的**收尾阶段**（而不是新建页面时）
- 多轮用户反馈循环中需要**跨会话保留**用户的小决定
- **Release notes 的读者是终端用户**而不是工程师
- 任何"一份 UI 有两个入口 / 两份实现"的组件统一

## Examples

### Tab wrap 修复

```tsx
// Before — 在 max-w-2xl 下折行
<div className="flex gap-2">
  <button className="flex-1 min-w-[80px]">每日挑战</button>
  {/* 6 个 tab 全挤 */}
</div>

// After — 允许横向滚动而不是折行
<div className="flex flex-nowrap overflow-x-auto gap-2">
  <button className="flex-1 min-w-fit shrink-0">每日挑战</button>
</div>
```

### 设置入口统一（去掉 81 行重复 drawer）

```tsx
// Before — UserProfile.tsx
const [showSettings, setShowSettings] = useState(false);
return (
  <>
    <button onClick={() => setShowSettings(true)}>设置</button>
    {showSettings && (
      <motion.div className="fixed inset-0 ...">
        {/* 81 行 drawer JSX：Subscription / Account / Notifications / Logout */}
      </motion.div>
    )}
  </>
);

// After — UserProfile.tsx
<button onClick={() => window.dispatchEvent(new CustomEvent('memeflow:open-settings'))}>
  设置
</button>
// 81 行 drawer 删除

// SettingsModal.tsx
useEffect(() => {
  const h = () => setIsOpen(true);
  window.addEventListener('memeflow:open-settings', h);
  return () => window.removeEventListener('memeflow:open-settings', h);
}, []);
```

### Changelog 简化

```ts
// Before — 35 条技术 diff（用户看不懂）
'把 review card 的 rounded-xl 改成 surface !rounded-[18px]',
'wordbook hero 从 bg-white 升级为 glass-thick',
'登录页 auth-head 改成 horizontal flex 避免 overflow',
// ... 33 条类似

// After — 12 条分类 headline（用户一眼看到价值）
'【复习】加了"再练一次 / 全部重练"：学过的词想提前刷一遍不用等几天',
'【单词本】顶上 4 个指标做成仪表盘条；桌面多了左侧文件夹栏',
'【统一视觉】登录 / 付费 / 维护 / 个人中心全部换成统一毛玻璃',
// ...
```

## Related

- [`docs/solutions/bugs/firestore-isuserselfupdate-whitelist-silent-write-failure-2026-04-13.md`](../bugs/firestore-isuserselfupdate-whitelist-silent-write-failure-2026-04-13.md) — 同属 "silent write" 家族，UserProfile 贡献分数提交后后台没存的 bug 在本次 sweep 前就已经修过；两条 doc 合起来看 "silent failure 的两种根因"（规则白名单 vs UI 入口重复）。
- `design-prototypes/*.html` + `design-prototypes/_shared.css` — 原型源文件，本次对齐的 canonical 参照
- `src/index.css` — 生产设计 token 定义（`--ink` / `--blue-accent` / `glass-thick` / `glass-shell` 等）
- `src/data/changelog.ts` — `readLastSeen` 的 defensive 读取实现，在 version 回退场景下保证铃铛仍然亮
