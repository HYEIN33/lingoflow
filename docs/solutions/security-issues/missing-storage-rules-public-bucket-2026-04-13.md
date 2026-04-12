---
title: Missing storage.rules leaves Firebase Storage bucket world-writable by default
date: 2026-04-13
category: security-issues
module: lingoflow-firebase-security
problem_type: security_issue
component: firebase-storage
severity: critical
symptoms:
  - "firebase.json had no 'storage' block — no rules file deployed at all"
  - "Firebase Storage default rules expire to allow public read+write after 30 days, then default deny — but if rules were ever permissive, the bucket may already be polluted"
  - "Slang meaning media uploads (image/video/audio) and user avatars went straight into a bucket with no per-path size limits, content-type checks, or owner enforcement"
  - "An attacker could upload arbitrary files to any path, exhausting the storage quota and potentially serving malicious content from a trusted domain"
root_cause: missing_security_config
resolution_type: config_change
tags:
  - firebase-storage
  - storage-rules
  - file-upload
  - missing-config
  - lingoflow
---

# Missing storage.rules leaves Firebase Storage bucket world-writable by default

## Problem

The repo had Firestore rules and Hosting config in `firebase.json`, but **no `storage` block and no `storage.rules` file**. Slang meaning uploads (image/video/audio) and user avatars wrote to the bucket via the client SDK with zero server-side enforcement of:

- Who can write to which path
- Maximum file size
- Allowed content types
- Owner verification (any logged-in user could overwrite anyone else's avatar)

## Symptoms

- `firebase.json` is missing a `storage` key entirely
- `storage.rules` file does not exist in the repo
- Client code in `SubmitMeaning.tsx` calls `uploadBytes(ref(storage, ...))` without any backend gate
- Bucket browser shows files in arbitrary paths with no quota enforcement
- An attacker who got an authenticated session could `PUT` a 10GB file and exhaust the project's storage budget

## What Didn't Work

- **Assuming Firebase has "secure defaults"** — for Storage, the default after the 30-day grace period is *deny all*, but during the grace period it's effectively wide open. And once you're past 30 days with no rules, *every* upload from your own client also fails, so you'll have shipped permissive code for months.
- **Trusting client-side validation** — the React form checks file size and type before upload. An attacker bypasses the form and calls the SDK directly. Client checks are UX; rules are security.

## Solution

Created `storage.rules` with per-path enforcement:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAuthenticated() { return request.auth != null; }
    function isOwner(uid) { return isAuthenticated() && request.auth.uid == uid; }
    function isImage() { return request.resource.contentType.matches('image/.*'); }
    function isVideo() { return request.resource.contentType.matches('video/.*'); }
    function isAudio() { return request.resource.contentType.matches('audio/.*'); }
    function sizeUnder(mb) { return request.resource.size < mb * 1024 * 1024; }

    // Avatar — owner-only, image only, 5 MB max
    match /users/{uid}/avatar/{file} {
      allow read: if true;
      allow write: if isOwner(uid) && isImage() && sizeUnder(5);
    }

    // Slang media — any authed user can upload, type-gated
    match /slangs/{slangId}/media/{file} {
      allow read: if true;
      allow write: if isAuthenticated() && (
        (isImage() && sizeUnder(10)) ||
        (isVideo() && sizeUnder(30)) ||
        (isAudio() && sizeUnder(10))
      );
    }

    // Default deny everything else
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

And added the storage block to `firebase.json`:

```json
{
  "storage": { "rules": "storage.rules" },
  ...
}
```

Then `firebase deploy --only storage` to push it.

## Why This Works

- **Per-path matchers** mean a user can only write to `users/{their-uid}/avatar/...`, not anyone else's. Path interpolation `{uid}` is checked against `request.auth.uid`.
- **Content-type matchers** prevent an attacker from uploading an `.html` or `.exe` file with an image extension and serving it from a trusted Firebase Hosting domain (XSS / phishing risk).
- **Size caps** bound the worst-case quota damage from a runaway script or malicious user.
- **Default deny** at the end means any path you forgot to whitelist is closed, not open.

## Prevention

1. **Always commit `storage.rules` next to `firestore.rules`**, even on greenfield projects. There's no good default.

2. **Static audit test** that fails the build if either rules file is missing:
   ```ts
   it('storage.rules exists', () => {
     expect(existsSync('storage.rules')).toBe(true);
   });
   it('firebase.json declares storage rules', () => {
     const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
     expect(config.storage?.rules).toBe('storage.rules');
   });
   ```
   Both are now in `src/test/security-rules.test.ts`.

3. **Treat client-side file validation as UX, not security.** Every check the React form does (size, MIME) must also exist in `storage.rules`. The form is for fast feedback; the rule is for actual enforcement.

4. **Audit existing bucket contents** after adding rules retroactively. If the bucket was open for any window, an attacker may have already left files. List with `gsutil ls -r gs://{bucket}` and grep for unexpected paths.

5. **Add a content-type allow-list, not a deny-list**. `image/.*` is fine; `!= 'application/x-msdownload'` is not, because there are infinite types you didn't think of.

6. **Set bucket lifecycle rules** in GCP Console to auto-delete orphaned uploads (e.g., files in `tmp/` older than 24h). Defense in depth against quota exhaustion.
