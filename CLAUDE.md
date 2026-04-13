# CLAUDE.md — lingoflow / memeflow

Project-level instructions for AI agents working in this repo.

## Project shape

- React 19 + Vite 6 + TypeScript + Tailwind v4
- Firebase: Hosting + Firestore + Storage + Cloud Functions
- AI: Google Gemini via `@google/genai`
- Observability: Sentry
- Tests: Vitest + Testing Library + `@firebase/rules-unit-testing`
- Production: https://memeflow-16ecf.web.app/

## Knowledge store: `docs/solutions/`

This repo has a searchable knowledge store of past bugs, security findings, and architectural decisions at `docs/solutions/`. Each entry has YAML frontmatter with `title`, `category`, `module`, `component`, `severity`, `tags`, `problem_type`, `root_cause`. Categories live as subdirectories (e.g. `security-issues/`, `bugs/`).

Relevant when:
- Implementing a new feature in an area someone has worked on before
- Debugging an error that may have been seen previously
- Touching Firestore rules, Storage rules, auth, Cloud Functions, or the Translate / SlangDictionary / UserProfile components
- Considering schema changes (localStorage, Firestore documents, frontmatter conventions)

Search by grepping titles, tags, or component names under `docs/solutions/` before changing code in those areas. The store grows by running `/ce:compound` after a non-trivial fix.

## Conventions

- **Plain language for user-facing reports.** Comments and docs aimed at the project owner should be in 中文 with concrete `现状 / 修后 / 不修后果` framing when describing changes. Code identifiers stay in English.
- **Errors must surface.** Wrap Firestore writes in try/catch and surface failures as `sonner` toast + `Sentry.captureException(e, { tags: { component: '...' } })`. Silent `console.error` is a bug.
- **Never hardcode user identifiers in security rules.** `firestore.rules` `isAdmin()` checks `request.auth.token.admin == true` OR `users/{uid}.data.role == 'admin'`. Adding any literal email or uid to a rule is a regression.
- **`hasOnly` whitelists are load-bearing.** When adding a writable field to `users/{uid}`, update `isUserSelfUpdate` in `firestore.rules` in the same change, or the write will silently fail.
- **localStorage is untrusted input.** Always defensively deserialize. See `src/hooks/useSearchHistory.ts` for the pattern. Bumping a schema requires either a migration or a versioned key.

## Critical files

- `firestore.rules`, `storage.rules`, `firebase.json` — security
- `functions/index.js` — `apiGenerate` Gemini proxy
- `src/services/ai.ts` — Gemini client + Sentry breadcrumbs
- `src/firebase.ts`, `src/sentry.ts`, `src/main.tsx` — bootstrap
- `src/hooks/useSearchHistory.ts` — localStorage migration pattern
- `src/test/security-rules.test.ts` — static rules audit (regression guard)
- `docs/solutions/` — knowledge store (see above)

## Don't

- Don't introduce `alert()` or `window.confirm()` — use `sonner` toast or shadcn `AlertDialog`. ESLint enforces this.
- Don't hardcode emails or uids in security rules or admin pages.
- Don't ship a localStorage schema change without a defensive deserializer or versioned key.
- Don't bypass `isUserSelfUpdate` whitelist by adding fields without auditing.
- Don't commit service account JSONs. `.gitignore` covers `scripts/*-service-account.json` and `.firebase/`.

## 审查流程：autoplan + preview + qa 三合一（强制执行）

**任何涉及 UI 的改动，autoplan 的 Design Review 阶段必须启动 dev server 截图。**
纯看代码做设计审查是不够的。中文分词在代码里看不出问题，到浏览器里才发现句子被当成单词处理。

### autoplan 截图驱动审查模式（强制）

**核心原则：gstack autoplan 是审查主导者，preview 是它的眼睛。**

autoplan 跑 CEO/Design/Eng 审查时，每个 phase 可以请求截图。请求方式：
- autoplan subagent 输出 `SCREENSHOT_REQUEST: {page}, {device}, {state}` 
- 主 agent 收到后用 preview 工具截图并提供给 subagent

**截图覆盖率要求：90%**

必须覆盖的矩阵（每个组合都要截）：

| 页面 | 空状态 | 有数据状态 | 特殊状态 |
|------|--------|-----------|---------|
| 翻译 | 无输入 | 中文句子翻译结果 | 翻译失败 |
| 梗百科 | 首页+搜索榜 | 词条详情 | 贡献表单 |
| 语法检查 | 空+示例引导 | 纠错结果 | — |
| 单词本 | 空 | 有词列表+详情 | — |
| 复习 | 卡片正面 | 答案揭示 | 无待复习 |
| 排行榜 | 有数据 | — | — |
| 个人中心 | 正常 | — | — |

设备：Desktop 1280x800、iPad 768x1024、iPhone 375x812

**Design Review 阶段：** 每张截图对照 7 个维度打分，视觉问题优先级 > 代码问题。
**改完 UI 后验证（不可跳过）：** preview_screenshot + preview_resize mobile + preview_snapshot a11y。

### 测试用中文输入（强制）

截图中翻译/语法检查必须用中文句子测试：
- `我在弄咖啡`、`今天天气不错`、`你好`（短）、`我觉得这个项目做得非常好，希望能够继续改进`（长）

### 测试必须用中文输入

这个 app 的目标用户是在美华人。测试时：
- 翻译功能必须用中文句子测试（不是英文单词）
- 测试用例：`我在弄咖啡`、`今天天气不错`、`你好` (短)、`我觉得这个项目做得非常好，希望能够继续改进` (长)
- 中文没有空格，任何依赖空格分词的逻辑都是 bug

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
