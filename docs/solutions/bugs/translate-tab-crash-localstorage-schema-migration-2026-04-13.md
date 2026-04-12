---
title: Translate tab red-screens for all returning users after localStorage schema change
date: 2026-04-13
category: bugs
module: lingoflow-frontend
problem_type: production_bug
component: translate-tab
severity: critical
symptoms:
  - "Translate tab shows React ErrorBoundary 'Something went wrong' for 100% of users with prior search history in localStorage"
  - "Console error: Cannot read properties of undefined (reading 'length')"
  - "First-time / incognito users unaffected — masks the bug in dev"
  - "Sentry shows the throw originating in useSearchHistory hook on first render"
root_cause: schema_migration_without_backfill
resolution_type: code_fix
tags:
  - react
  - localstorage
  - schema-migration
  - error-boundary
  - useSearchHistory
  - lingoflow
---

# Translate tab red-screens for all returning users after localStorage schema change

## Problem

`useSearchHistory` was changed from storing `string[]` to `{text: string, timestamp: number}[]` without a migration path. Every returning user had legacy `string[]` data in localStorage. On first render the hook called `.text` / `.length` on raw strings, threw `TypeError`, and the React ErrorBoundary swallowed the entire Translate tab into a red screen.

## Symptoms

- 100% crash rate on Translate tab for any user who had ever saved a search before the schema change
- Production Sentry shows `TypeError: Cannot read properties of undefined (reading 'length')`
- Local dev with empty localStorage works fine — bug only fires in real production accounts
- Bundle file: `dist/assets/index-Bwlv0noF.js:127:68590` (post-build line, traces back to `src/hooks/useSearchHistory.ts`)

## What Didn't Work

- **Reading the React component tree** — the throw site is the hook, not the component. Looking at `TranslatePage.tsx` for `.length` calls wasted time.
- **Reproducing in localhost dev** — fresh localStorage means no legacy data, no crash. Have to seed `localStorage.setItem('searchHistory', JSON.stringify(['hello', 'world']))` first.
- **Adding `?? []` defaults** — the array exists, the *items* are wrong shape. Defaults on the array don't help.

## Solution

Defensive deserializer in `useSearchHistory` that accepts both old and new shapes:

```ts
const [history, setHistory] = useState<SearchHistoryItem[]>(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => {
        if (typeof item === 'string') return { text: item, timestamp: 0 };
        if (item && typeof item.text === 'string') {
          return { text: item.text, timestamp: Number(item.timestamp) || 0 };
        }
        return null;
      })
      .filter((x): x is SearchHistoryItem => x !== null);
  } catch {
    return [];
  }
});
```

Also fixed a related crash in `App.tsx:1121` where `translationResult.usages[i]` was accessed without `?.`:

```ts
// Before
const u = translationResult.usages[selectedUsageIndex];
// After
const u = translationResult.usages?.[selectedUsageIndex];
```

## Why This Works

The deserializer treats localStorage as **untrusted input**. Old data, hand-edited data, partial writes, browser extensions corrupting JSON — all fall through to safe defaults. The `filter` strips anything that doesn't match the expected shape. The `try/catch` covers `JSON.parse` failures.

## Prevention

1. **Treat localStorage as untrusted**. It's not your schema — it's whatever was there from any prior version of the app, any browser extension, any debugging session. Always validate on read.

2. **Write a regression test that seeds legacy data**. Created `src/test/useSearchHistory.test.ts` with 7 cases:
   ```ts
   it('migrates legacy string[] format', () => {
     localStorage.setItem('searchHistory', JSON.stringify(['hello', 'world']));
     const { result } = renderHook(() => useSearchHistory());
     expect(result.current.history).toEqual([
       { text: 'hello', timestamp: 0 },
       { text: 'world', timestamp: 0 },
     ]);
   });
   ```

3. **Never ship a localStorage schema change without a migration**. If you must, version the key (`searchHistory_v2`) so old data is silently abandoned instead of crashing the read.

4. **ErrorBoundary should report to Sentry, not just show a fallback**. A red screen on production with no Sentry breadcrumb means you find out from a user, not from telemetry.

5. **Test in a real browser with seeded localStorage** before claiming a release is safe. Localhost dev with an empty profile is a different app.
