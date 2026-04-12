---
title: Firestore isUserSelfUpdate hasOnly whitelist silently rejects writes for fields the UI thinks it can edit
date: 2026-04-13
category: bugs
module: lingoflow-firebase-security
problem_type: silent_data_loss
component: firestore-rules
severity: high
symptoms:
  - "User edits displayName / photoURL in UserProfile UI, sees no error, but the change never persists"
  - "Leaderboard and slang meaning author cards keep showing stale displayName / avatar"
  - "Firestore client throws PERMISSION_DENIED but UI swallows it (or logs to console only)"
  - "Bug invisible until you read the rules and notice the field is missing from hasOnly()"
root_cause: incomplete_rule_whitelist
resolution_type: rules_change
tags:
  - firestore-rules
  - hasOnly
  - silent-failure
  - user-profile
  - lingoflow
---

# Firestore isUserSelfUpdate hasOnly whitelist silently rejects writes for fields the UI thinks it can edit

## Problem

`firestore.rules` defined `isUserSelfUpdate(before, after)` using `affectedKeys().hasOnly([...])` to whitelist which fields a user can mutate on their own profile. When `UserProfile.tsx` was extended to let users edit `displayName` and `photoURL`, the rule was never updated. Every write hit `PERMISSION_DENIED`, but the UI didn't surface the error — users saw the form "save", reloaded, and their changes were gone. Stale data leaked everywhere the leaderboard and slang cards read profile info.

## Symptoms

- "I changed my avatar 3 times and it keeps reverting"
- Leaderboard shows old display names months after users renamed themselves
- No Sentry alert because the Firestore client error was caught locally and `console.error`'d only
- `firestore.rules` `isUserSelfUpdate` whitelist looks reasonable in isolation; you only spot the gap by diffing it against what the UI actually writes

## What Didn't Work

- **Adding more validation in UserProfile.tsx** — the validation passed; the rule rejected.
- **Looking at the network tab for 4xx** — Firestore SDK uses gRPC/WebChannel, not REST; the failure shows up as a JS callback rejection, not a visible HTTP status in DevTools.

## Solution

Add the missing fields to the whitelist:

```javascript
function isUserSelfUpdate(before, after) {
  return after.diff(before).affectedKeys().hasOnly([
    'displayName',     // NEW
    'photoURL',        // NEW
    'tabOrder',
    'lastContributionDate',
    'currentStreak',
    'hasCompletedOnboarding',
    'translationCount',
    'grammarCount',
    'lastResetDate',
    'titleLevel1',
    'titleLevel2',
    'titleLevel3',
    'hasUploadedMedia',
    'folders',
    'wordFolderMap'
  ]);
}
```

Sensitive fields (`isPro`, `reputationScore`, penalty fields, `approvedSlangCount`) stay off the list — only `isAdmin()` or Cloud Functions can write them.

## Why This Works

`hasOnly([...])` is a *closed* whitelist: any field not in the list causes the entire write to fail. That's the right default for a security rule, but it means every UI feature that touches a new profile field has to update the rule in the same PR, or the feature ships broken.

## Prevention

1. **Cross-reference UI writes against rules in code review.** When a PR touches `UserProfile.tsx` (or any component that calls `updateDoc(userDoc, ...)`), grep `firestore.rules` for the changed field names.

2. **Surface Firestore errors as toasts, not console logs.** A `PERMISSION_DENIED` that the user can see is a bug report in 5 minutes. A silent one is months of stale data.
   ```ts
   try {
     await updateDoc(userDocRef, { displayName: newName, photoURL: newUrl });
     toast.success('Profile updated');
   } catch (e: any) {
     toast.error(`Save failed: ${e.code || e.message}`);
     Sentry.captureException(e, { tags: { component: 'user-profile' } });
   }
   ```

3. **Write a rules unit test** for every editable field. The repo now has `src/test/security-rules.test.ts` with static audits — for runtime checks add `@firebase/rules-unit-testing` cases that try to update each whitelisted field as the owning user and assert success.

4. **Comment the rule with the *why* and the date of the last audit**, so the next person who adds a profile field knows this list is load-bearing:
   ```javascript
   // displayName + photoURL are user-editable via the UserProfile UI so they
   // show up on the leaderboard and slang meaning cards. 2026-04-13 audit
   // unblocked these — previously UserProfile.tsx was trying to write them
   // but the rule silently rejected, leaving stale data everywhere.
   ```

5. **Pair `hasOnly` with explicit field-type checks** for the high-value fields, so a future bug that allows arbitrary writes still has a second line of defense.
