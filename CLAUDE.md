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
