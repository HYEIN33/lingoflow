---
title: Hardcoded admin email in Firestore rules and admin.html is a single-account-takeover backdoor
date: 2026-04-13
category: security-issues
module: lingoflow-firebase-security
problem_type: security_issue
component: authorization
severity: high
symptoms:
  - "firestore.rules isAdmin() returned true if request.auth.token.email == 'caizewei11@gmail.com'"
  - "public/admin.html had a constant ADMIN_EMAIL = 'caizewei11@gmail.com' and gated the admin UI on email match"
  - "Anyone who phishes that single Google account gets full destructive admin (delete users, edit slang corpus, modify reputation, etc.)"
  - "Rotating the admin requires a code change + redeploy, not a console click"
root_cause: hardcoded_credential
resolution_type: rules_change
tags:
  - firebase
  - firestore-rules
  - authorization
  - hardcoded-credentials
  - admin-backdoor
  - custom-claims
  - lingoflow
---

# Hardcoded admin email in Firestore rules and admin.html is a single-account-takeover backdoor

## Problem

Both `firestore.rules` and `public/admin.html` contained the literal string `'caizewei11@gmail.com'` as the admin identity check. The Firestore rule was:

```javascript
function isAdmin() {
  return isAuthenticated() &&
         request.auth.token.email == 'caizewei11@gmail.com';
}
```

And `admin.html` had:

```js
const ADMIN_EMAIL = 'caizewei11@gmail.com';
if (user.email === ADMIN_EMAIL) { /* show admin panel */ }
```

This means: (a) the entire admin attack surface collapses to one Gmail account being phished, (b) rotating admins requires a code change and redeploy, (c) the admin email is publicly visible in the production bundle and rules export, (d) you can't delegate admin to a teammate without sharing a Google account.

## Symptoms

- Single point of failure: phish one mailbox, get full destructive admin
- `gh secret-scan` won't catch this because it's not a token, it's a logic bug
- Adding a second admin requires editing `firestore.rules` and `admin.html`, then `firebase deploy`, then waiting for hosting cache to clear

## Solution

Replace email check with **custom claim OR Firestore role field**, both server-controlled:

```javascript
// firestore.rules
function isAdmin() {
  return isAuthenticated() && (
    request.auth.token.admin == true ||
    (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
  );
}
```

```js
// public/admin.html
const tokenResult = await user.getIdTokenResult(true);
const isAdmin = tokenResult.claims.admin === true;
```

To grant admin, the project owner does **one** of:
- **Custom claim** (preferred): a small Cloud Function or Admin SDK script calls `admin.auth().setCustomUserClaims(uid, { admin: true })`. User signs out / in to refresh the ID token.
- **Firestore role field**: in the Firebase Console, set `users/{uid}.role = 'admin'` directly. Effective immediately, no token refresh needed.

The second path exists so existing admins keep working without a Cloud Function migration, and so a recovery path exists if custom claims get corrupted.

## Why This Works

- **Custom claims** are signed by Firebase Auth and only mutable via the Admin SDK (which bypasses these rules and lives server-side). Even a full client compromise can't escalate to admin.
- **Firestore role field** is mutable only by `isAdmin()` (or directly via the Console, which is gated by IAM). A rogue client can't promote itself because the rule that allows writes to `users/{uid}` whitelists fields via `hasOnly([...])` and `role` is *not* on that list.
- Rotating admins is a Console click, not a code change.
- Adding a second admin doesn't require trusting them with anyone's Gmail credentials.

## Prevention

1. **Never hardcode user identifiers in security rules**. The rule should encode the *property* (is-admin, owns-this-document) not the *identity*.

2. **Static audit test in CI** that fails the build if `firestore.rules` or any HTML/JS file under `public/` contains `@gmail.com`, `@outlook.com`, etc. The repo now has `src/test/security-rules.test.ts` doing this:
   ```ts
   it('firestore.rules contains no hardcoded emails', () => {
     const rules = readFileSync('firestore.rules', 'utf8');
     expect(rules).not.toMatch(/['"`][\w.+-]+@[\w-]+\.[\w.-]+['"`]/);
   });
   it('admin.html contains no hardcoded admin emails', () => {
     const html = readFileSync('public/admin.html', 'utf8');
     expect(html).not.toMatch(/ADMIN_EMAIL\s*=/);
   });
   ```

3. **Document the two paths** (custom claim vs role field) in `README.md` so the operator knows how to grant/revoke admin without grepping for the old hardcoded email.

4. **Audit `request.auth.token.email` usage** across the entire rules file. Email is *not* a stable identifier (Google lets users change primary email on a workspace account), and it's a phishing target. Use `uid` or claims instead.
