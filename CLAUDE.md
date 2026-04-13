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

### autoplan Design Review 截图要求

跑 `/autoplan` 时，Design Review 阶段必须：

1. 用 `preview_start` 启动 Vite dev server
2. 导航到改动涉及的每个页面，截图
3. 必须截的状态（每个都要）：
   - **空状态**：页面刚加载，没有数据
   - **有数据状态**：输入中文句子（如"我在弄咖啡"）触发翻译
   - **移动端**：`preview_resize` 到 375x812 再截图
4. 每张截图对照 Design Review 维度打分，发现的视觉问题直接写进 plan
5. 截图里发现的问题优先级 > 纯代码分析发现的问题（因为用户看到的是画面不是代码）

### 改完 UI 后验证（不可跳过）

任何 UI 代码改动后，必须：
1. `preview_screenshot` 确认布局正确
2. `preview_resize` mobile 确认移动端不溢出
3. `preview_snapshot` 确认 a11y 属性存在

### 测试必须用中文输入

这个 app 的目标用户是在美华人。测试时：
- 翻译功能必须用中文句子测试（不是英文单词）
- 测试用例：`我在弄咖啡`、`今天天气不错`、`你好` (短)、`我觉得这个项目做得非常好，希望能够继续改进` (长)
- 中文没有空格，任何依赖空格分词的逻辑都是 bug
