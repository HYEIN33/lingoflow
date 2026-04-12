---
title: Firebase anonymous auth collapses permissive Firestore rules into a public database
date: 2026-04-13
category: security-issues
module: lingoflow-firebase-security
problem_type: security_issue
component: authentication
severity: critical
symptoms:
  - "Any anonymous visitor could update or delete documents in the shared slangs/slang_meanings collections, wiping the corpus"
  - "New anonymous users were auto-granted isPro=true; any user could self-elevate isPro via a client-side updateDoc"
  - "public/admin.html had no auth gate and used anonymous sign-in — a one-click destructive console for any visitor"
  - "Cloud Function /api/generate accepted unauthenticated requests from any origin with a non-functional in-memory per-IP rate limit, draining the Gemini API budget"
root_cause: missing_permission
resolution_type: config_change
tags:
  - firebase
  - firestore-rules
  - anonymous-auth
  - authorization
  - cloud-functions
  - gemini-api
  - privilege-escalation
  - rate-limiting
---

# Firebase anonymous auth collapses permissive Firestore rules into a public database

## Problem

A Firebase web app combined anonymous authentication with Firestore rules that only checked `isAuthenticated()`, which collapsed the security posture to "public read/write" because any visitor can obtain an anonymous auth token in one click. Four compounding layers (an unguarded admin tool, a client-defaulted `isPro` flag, an unrestricted `users/{uid}` update rule, and a Cloud Function LLM proxy with `cors: true` and no auth) meant any internet user could drain the Gemini API key, elevate themselves to Pro, and delete the shared slang corpus.

## Symptoms

- Any visitor minted an auth token with `signInAnonymously()` and satisfied every `allow if isAuthenticated()` rule.
- Loading `/admin.html` while anonymous returned full read/write/delete on `slangs` and `slang_meanings` — including bulk-delete and "一键修复" buttons that iterated the entire collection.
- A new anonymous user was created with `isPro: user.isAnonymous` → `isPro: true`, unlocking paid features for free.
- Because the `users/{uid}` update rule had no field whitelist, any authed user could open devtools and run `updateDoc(doc(db,'users',uid),{isPro:true})` to self-elevate.
- The `apiGenerate` Cloud Function used `cors: true` and had zero auth. Rate limiting was a `Map` inside one function instance, so N cold-started instances had N independent counters — effectively no limit.
- No model whitelist on the proxy meant a caller could request `gemini-1.5-pro` (or any future expensive model) and bill it.

## What Didn't Work

- **`allow if isAuthenticated()` as an access gate.** With anonymous auth on, `request.auth != null` is true for every visitor. Equivalent to `allow if true`. Not a security boundary.
- **Client-side `userProfile.isPro` gates.** The client can always lie. Hiding the Pro UI doesn't matter — the Firestore SDK is available in devtools.
- **`isPro: user.isAnonymous` "to make onboarding frictionless."** Made the anonymous path a privilege-escalation path.
- **In-memory per-IP rate limiting on Cloud Functions.** `Map` lives in one instance. Autoscaling spawns fresh maps per instance. Attackers parallelize across cold starts.
- **`cors: true` on a paid-API proxy.** Emits `Access-Control-Allow-Origin: *`. Free for attackers, billed to you.
- **"Hiding" admin.html by not linking to it.** Firebase Hosting serves everything in `public/`. Security by obscurity fails against anyone who runs `gobuster` or reads the hosting config.
- **Gating admin.html on `isAuthenticated()`.** Same collapse — anonymous users are authenticated.
- **(session history)** A prior session stripped all auth code from the frontend to unblock a demo but left the `firestore.rules` `isAuthenticated()` gates and the `signInAnonymously()` scaffold in place. Auth ripped out of the client does not weaken the rules — it weakens the *assumption* the rules were written against. Any rule referencing auth must be re-audited whenever the auth strategy changes.

## Solution

Six coordinated changes. Each is defense-in-depth — any one alone is insufficient.

### 1. `firestore.rules` — field-whitelisted self-update on `users/{uid}`

```js
// BEFORE (effective)
match /users/{userId} {
  allow read, write: if isAuthenticated() && request.auth.uid == userId;
}
```

```js
// AFTER
function isUserSelfUpdate(before, after) {
  return after.diff(before).affectedKeys().hasOnly([
    'tabOrder', 'lastContributionDate', 'currentStreak',
    'hasCompletedOnboarding', 'translationCount', 'grammarCount',
    'lastResetDate', 'titleLevel1', 'titleLevel2', 'titleLevel3',
    'hasUploadedMedia', 'folders', 'wordFolderMap'
  ]);
}

match /users/{userId} {
  allow read: if isOwner(userId) || isAdmin();
  allow create: if isOwner(userId)
                && isValidUserProfile(request.resource.data)
                && request.resource.data.isPro == false;
  allow update: if isAdmin()
                || (isOwner(userId) && isUserSelfUpdate(resource.data, request.resource.data));
}
```

Note: `create` pins `isPro == false`. `isPro`, `reputationScore`, and penalty fields are absent from the whitelist, so only the Admin SDK (Cloud Functions) or `isAdmin()` can mutate them.

### 2. `firestore.rules` — lockdown on shared corpus

```js
match /slangs/{slangId} {
  allow read: if isAuthenticated();
  allow create: if isAuthenticated() && isValidSlang(request.resource.data);
  // Only admins can mutate or delete shared slang terms
  allow update, delete: if isAdmin();
}

match /slang_meanings/{meaningId} {
  allow read: if isAuthenticated();
  allow create: if isAuthenticated()
                && isValidSlangMeaning(request.resource.data)
                && request.resource.data.upvotes == 0;
  // Counter updates: anyone authed (gated by isValidCounterUpdate);
  // full edits: author or admin
  allow update: if isAuthenticated() && (
    isValidCounterUpdate(meaningId) ||
    isAdmin() ||
    (resource.data.authorId == request.auth.uid && isValidSlangMeaning(request.resource.data))
  );
  allow delete: if isAdmin() || (isAuthenticated() && resource.data.authorId == request.auth.uid);
}
```

`isValidCounterUpdate` enforces that `upvotes` can only move by ±1 and must be paired with a matching create/delete in `slang_upvotes/{uid}_{meaningId}`.

```js
function isAdmin() {
  return isAuthenticated() &&
    (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
      (request.auth.token.email == "caizewei11@gmail.com" && request.auth.token.email_verified == true));
}
```

### 3. `src/hooks/useAuth.ts` — default `isPro: false`

```ts
// BEFORE
const newProfile: UserProfile = {
  userId: user.uid,
  isPro: user.isAnonymous,   // BUG: anonymous => Pro
  // ...
};
```

```ts
// AFTER
onAuthStateChanged(auth, async (firebaseUser) => {
  // callback param renamed from `user` to stop shadowing outer state
  const newProfile: UserProfile = {
    userId: firebaseUser.uid,
    isPro: false, // Pro is granted server-side only
    // ...
  };
});
```

### 4. `public/admin.html` — Google sign-in + email allowlist

```html
<script type="module">
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

const ADMIN_EMAIL = 'caizewei11@gmail.com';

async function init() {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { /* show error */ return; }

  onAuthStateChanged(auth, async (u) => {
    if (!u) return;
    if (u.email !== ADMIN_EMAIL || !u.emailVerified) {
      await signOut(auth);
      document.body.innerHTML = '<div>⛔ 此页面仅限管理员访问</div>';
      return;
    }
    await loadAllData(); // proceed
  });
}
</script>
```

This is *defense-in-depth* with the rules. Even if someone patches the HTML client-side, Firestore still rejects writes because `isAdmin()` requires a verified email claim or `role: 'admin'` document.

### 5. `functions/index.js` — ID token + Firestore rate limit + CORS allowlist + model whitelist

```js
const ALLOWED_ORIGINS = new Set([
  'https://memeflow-16ecf.web.app',
  'https://memeflow-16ecf.firebaseapp.com',
  'http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173',
]);

async function checkRateLimit(uid) {
  const db = admin.firestore();
  const ref = db.collection('_rate_limits').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : { calls: [] };
    const calls = (data.calls || []).filter(t => t.toMillis() > dayAgo.toMillis());
    const lastMinute = calls.filter(t => t.toMillis() > minuteAgo.toMillis()).length;
    if (lastMinute >= MAX_PER_MINUTE) return { allowed: false, reason: 'minute' };
    if (calls.length >= MAX_PER_DAY)   return { allowed: false, reason: 'day' };
    calls.push(now);
    tx.set(ref, { calls }, { merge: true });
    return { allowed: true };
  });
}

exports.apiGenerate = onRequest(
  { secrets: ['GEMINI_API_KEY'], cors: false },
  async (req, res) => {
    if (!applyCors(req, res)) { res.status(403).json({ error: 'Origin not allowed' }); return; }
    if (req.method !== 'POST') { res.status(405).end(); return; }

    // Require Firebase ID token
    const token = (req.headers.authorization || '').replace(/^Bearer /, '') || null;
    if (!token) { res.status(401).json({ error: 'Missing auth token' }); return; }
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(token); }
    catch { res.status(401).json({ error: 'Invalid auth token' }); return; }

    // Per-uid rate limit (survives autoscaling)
    const rl = await checkRateLimit(decoded.uid);
    if (!rl.allowed) { res.status(429).json({ error: 'Rate limit exceeded' }); return; }

    // Model whitelist (cost gate)
    const ALLOWED_MODELS = new Set([
      'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp',
      'gemini-1.5-flash', 'gemini-1.5-flash-8b',
    ]);
    if (!ALLOWED_MODELS.has(req.body?.model)) {
      res.status(400).json({ error: 'Model not allowed' });
      return;
    }
    // proceed to call Gemini...
  }
);
```

Four defenses stack: CORS allowlist → ID-token verification → per-uid Firestore rate limit → model whitelist. Rate-limit failures **fail closed** (503) to protect the budget if Firestore is degraded.

### 6. `src/services/ai.ts` — attach Bearer token

```ts
async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try { return await user.getIdToken(); } catch { return null; }
}

async function callGeminiProxy(model, contents, config) {
  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch('/api/generate', { method: 'POST', headers, body: JSON.stringify(body) });
  // ...
}
```

## Why This Works

**The threat model you have to internalize: anonymous authentication is a UX convenience, not a security boundary.** It gives a stable `uid` for per-device state without a signup wall — that's all. It does NOT prove the caller is a real user, a paying user, or even a different person than the last call. Any security decision that depends on "is this a real user?" must be answered by something stronger: password, verified email, OAuth, custom claim, server-checked role, or matching `uid` on a resource you control.

Three invariants drive the fixes:

1. **Authorize actions, not identities.** Replace `allow if isAuthenticated()` with `allow if isOwner(resource.data.userId)`, `allow if isAdmin()`, or explicit ownership matching. The rule should answer "is THIS uid allowed to do THIS action on THIS resource?" — not "is this request signed?"

2. **Field-level whitelists are the only way to protect sensitive fields on owner-writable docs.** `affectedKeys().hasOnly([...])` means the client can only change listed fields; any other diff rejects the write atomically. Sensitive fields absent from the whitelist are physically unmutable from a client — only Admin SDK or `isAdmin()` can write them. This is how "server grants Pro, client cannot self-grant" is enforced in Firebase.

3. **Rate limiting and money-gating must be stateful, stable-keyed, and fail-closed.** An in-memory `Map` in a serverless process is effectively per-request state. The counter must live in a shared store (Firestore transaction, Redis) and key on a spoof-resistant identity — `uid` after `verifyIdToken`, never `req.ip`. When the counter is unavailable, return 503 (fail closed). Failing open drains the budget.

Layered together: an anonymous visitor on `admin.html` fails the admin.html email check **and** the Firestore `isAdmin()` rule. A scripted Pro-flag upgrade fails the `isUserSelfUpdate` field whitelist. A Gemini proxy abuser fails at CORS, then at `verifyIdToken`, then at the Firestore rate limit, then at the model whitelist. No single layer is the security boundary — every layer rejects the attack independently.

## Prevention

Concrete rules and audit patterns for future Firebase projects:

1. **Never write `allow if isAuthenticated()` when anonymous auth is enabled.** Use `isOwner()`, `isAdmin()`, or resource-ownership matching. Treat `isAuthenticated()` as a precondition, never a sufficient condition. If the bare check is truly needed, name it `hasToken()` so reviewers feel the smell.

2. **Always use `affectedKeys().hasOnly([...])` field whitelists on `users/{uid}` updates** and any owner-writable doc. If a field isn't in the whitelist, only Admin SDK can write it.

3. **`create` rules must pin sensitive fields to safe defaults.** `request.resource.data.isPro == false`, `role == 'user'`, etc. Don't let the first write be privilege escalation.

4. **Cloud Functions that cost money must `verifyIdToken()` and rate-limit on uid**, stored in Firestore or Redis — never an in-memory `Map`. Run inside a Firestore transaction to avoid double-spend races.

5. **Never gate money-or-safety features on client-side state alone.** The client can always lie. Ask: "what stops a user from running `updateDoc(...)` in devtools?" If the answer is "the UI doesn't expose it," there is no security.

6. **Admin tools hosted on public hosting must be gated by a server-checked role.** Verified email claim, custom claim, or a `role: 'admin'` doc. The HTML page itself should also `signOut()` and blank the DOM on rejection as defense-in-depth, but Firestore rules are the real gate.

7. **Never ship `cors: true` on a paid or sensitive API.** Allowlist specific origins. `cors: true` means "any website can POST from a user's browser" — free for attackers, billed to you.

8. **Whitelist models/operations on LLM proxies.** `ALLOWED_MODELS`, size caps on `contents`, max `maxOutputTokens`. Users will pick the most expensive option if you let them.

9. **Rate-limit failures must fail closed.** If Firestore is down, return 503. "Fail open on auth/rate-limit" turns degraded dependencies into bill explosions.

10. **Audit `public/` for every HTML file.** Firebase Hosting serves everything. Every HTML file is a potential admin interface; every one needs an auth gate.

11. **(session history)** Whenever auth strategy changes (stripping login for a demo, switching providers, adding anonymous fallback), re-audit **every** `firestore.rules` clause that mentions auth. The rules were written against an *assumption* about what "authenticated" means. Changing the auth strategy without updating the rules turns the rules into fiction.

### Audit / grep patterns to run on any Firebase repo

```sh
# Red flags — every hit is a potential public write if anonymous auth is on
rg "allow if isAuthenticated" firestore.rules
rg "allow (read|write).*if true" firestore.rules

# If this is present, every isAuthenticated() check in rules is effectively public
rg "signInAnonymously" src/

# These fields must appear in a whitelist helper, never in a blanket update rule
rg "isPro|isAdmin|role|reputation" firestore.rules

# Public CORS on a billed API
rg "cors: true|Access-Control-Allow-Origin.*\*" functions/

# HTTPS functions that never verify an ID token
rg "onRequest" functions/ -A 20 | rg -L "verifyIdToken"

# In-memory counters are broken in serverless
rg "new Map|const \w+Map.*=.*new Map" functions/
rg "req\.ip" functions/

# Any branch that grants privileges from anonymous state
rg "user\.isAnonymous" src/
```

CI lint ideas: fail the build if `firestore.rules` contains `allow .* if isAuthenticated\(\)\s*$` with no other conjunct, or if `functions/index.js` contains `cors: true`.

## Related Issues

- Commits `78d7574..4835e94` on `main` — the 9 atomic fixes that closed this vulnerability
- Parallel review protocol: 5 reviewers (security-sentinel, architecture-strategist, maintainability-reviewer, performance-oracle, correctness-reviewer) were dispatched in parallel and 3 of 5 independently identified the `firebaseUser.uid` ReferenceError at `useAuth.ts:93` — a useful signal that multi-reviewer convergence is a strong bug indicator
- Follow-up compound-worthy topics from the same session (not yet documented): SlangDictionary 30s-refetch Firestore quota burn, Vite `manualChunks` config for Firebase apps, 3-tier long-translation layout (`word`/`sentence`/`paragraph`), async-callback shadow-variable pitfall
