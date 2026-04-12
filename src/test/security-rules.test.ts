/**
 * Static audit tests for firestore.rules and storage.rules.
 *
 * These are NOT full emulator-based rule tests (those would need Java +
 * Firebase emulator, which is too heavy for the default test run). They
 * are regression guards that read the rules files as text and assert
 * specific structural properties that MUST hold after recent security
 * fixes. If anyone accidentally re-introduces the hardcoded admin email
 * or deletes storage.rules, these tests fail loudly in CI.
 *
 * Complement with full emulator tests (see docs/solutions/rules-testing.md
 * if/when emulator-based testing is set up).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const firestoreRulesPath = join(ROOT, 'firestore.rules');
const storageRulesPath = join(ROOT, 'storage.rules');
const firebaseJsonPath = join(ROOT, 'firebase.json');
const adminHtmlPath = join(ROOT, 'public', 'admin.html');

describe('firestore.rules — security audit', () => {
  const rules = readFileSync(firestoreRulesPath, 'utf-8');

  it('file exists', () => {
    expect(existsSync(firestoreRulesPath)).toBe(true);
  });

  it('uses rules_version 2', () => {
    expect(rules).toMatch(/rules_version\s*=\s*['"]2['"]/);
  });

  it('has NO hardcoded admin email', () => {
    // Regression for P0 fix: admin backdoor via "caizewei11@gmail.com"
    // was removed on 2026-04-13.
    expect(rules).not.toMatch(/caizewei11@gmail\.com/);
    expect(rules).not.toMatch(/request\.auth\.token\.email\s*==\s*['"]/);
  });

  it('isAdmin() uses custom claim OR role field, not email', () => {
    const isAdminMatch = rules.match(/function isAdmin\(\)\s*\{[\s\S]*?\n\s*\}/);
    expect(isAdminMatch).toBeTruthy();
    const isAdminBody = isAdminMatch![0];
    expect(isAdminBody).toContain('request.auth.token.admin');
    // Must NOT contain email comparison
    expect(isAdminBody).not.toMatch(/\.email\s*==/);
  });

  it('slang_comments collection has rules', () => {
    // Regression for P0 fix: slang_comments had no rules → permission-denied
    // on slang detail page.
    expect(rules).toMatch(/match\s*\/slang_comments\/\{/);
  });

  it('slang_reports collection has rules', () => {
    expect(rules).toMatch(/match\s*\/slang_reports\/\{/);
  });

  it('slang_reports reads gated to admin only', () => {
    const section = rules.match(/match\s*\/slang_reports\/\{[^}]*\}[\s\S]*?\n\s*\}/);
    expect(section).toBeTruthy();
    expect(section![0]).toMatch(/allow read:\s*if isAdmin\(\)/);
  });

  it('users collection requires ownership for reads', () => {
    const section = rules.match(/match\s*\/users\/\{userId\}[\s\S]*?\n\s*\}/);
    expect(section).toBeTruthy();
    expect(section![0]).toMatch(/allow read:\s*if.*isOwner\(userId\)/);
  });

  it('user profile create cannot set isPro to true', () => {
    // Prevents free users from granting themselves Pro on signup.
    expect(rules).toMatch(/request\.resource\.data\.isPro\s*==\s*false/);
  });

  it('slang_meaning create must start with 0 upvotes', () => {
    // Prevents seeding new meaning with inflated vote count.
    expect(rules).toMatch(/request\.resource\.data\.upvotes\s*==\s*0/);
  });

  it('isUserSelfUpdate whitelist contains user-editable fields and excludes sensitive ones', () => {
    // Regression for the silent-write-failure bug: displayName and photoURL
    // were missing from the hasOnly() whitelist, so the UserProfile UI
    // edits silently failed at the rules layer. See
    // docs/solutions/bugs/firestore-isuserselfupdate-whitelist-silent-write-failure-2026-04-13.md
    const fnMatch = rules.match(/function isUserSelfUpdate\([\s\S]*?\n\s*\}/);
    expect(fnMatch).toBeTruthy();
    const body = fnMatch![0];
    // Required user-editable fields
    expect(body).toContain("'displayName'");
    expect(body).toContain("'photoURL'");
    expect(body).toContain("'tabOrder'");
    expect(body).toContain("'hasCompletedOnboarding'");
    // Sensitive fields MUST NOT be in the self-update whitelist
    expect(body).not.toContain("'isPro'");
    expect(body).not.toContain("'role'");
    expect(body).not.toContain("'reputationScore'");
    expect(body).not.toContain("'approvedSlangCount'");
  });

  it('users update is gated by isAdmin OR (isOwner AND isUserSelfUpdate)', () => {
    const section = rules.match(/match\s*\/users\/\{userId\}[\s\S]*?\n\s*\}/);
    expect(section).toBeTruthy();
    expect(section![0]).toMatch(/allow update:\s*if isAdmin\(\)\s*\|\|\s*\(isOwner\(userId\)\s*&&\s*isUserSelfUpdate/);
  });

  it('slang_meanings counter update enforces single-step delta', () => {
    // The upvote/downvote rule must require exactly +/-1 to prevent
    // arbitrary vote count manipulation.
    const fnMatch = rules.match(/function isValidCounterUpdate[\s\S]*?\n\s*\}\s*\n/);
    expect(fnMatch).toBeTruthy();
    expect(fnMatch![0]).toMatch(/math\.abs\([^)]*upvotes[^)]*\)\s*==\s*1/);
    // Must check the slang_upvotes companion doc to prevent double-voting
    expect(fnMatch![0]).toContain('slang_upvotes');
  });

  it('slang_upvotes create requires uid_meaningId composite path', () => {
    // Path enforcement prevents one user from voting in another user's name.
    const section = rules.match(/match\s*\/slang_upvotes\/\{upvoteId\}[\s\S]*?\n\s*\}/);
    expect(section).toBeTruthy();
    expect(section![0]).toMatch(/upvoteId\s*==\s*request\.auth\.uid\s*\+/);
    expect(section![0]).toMatch(/request\.resource\.data\.userId\s*==\s*request\.auth\.uid/);
  });

  it('slang_searches create allows expireAt for TTL-based cleanup', () => {
    // The TTL policy on slang_searches.expireAt requires this field to be
    // writable. Without the rule guard, the field would be rejected.
    const section = rules.match(/match\s*\/slang_searches\/\{searchId\}[\s\S]*?\n\s*\}/);
    expect(section).toBeTruthy();
    expect(section![0]).toContain('expireAt');
  });
});

describe('storage.rules — security audit', () => {
  it('storage.rules file exists (missing file = bucket wide open)', () => {
    // Regression for P0 fix: storage.rules was missing entirely prior to
    // 2026-04-13, leaving Firebase Storage at default (either test mode
    // or production deny, depending on project age).
    expect(existsSync(storageRulesPath)).toBe(true);
  });

  const rules = existsSync(storageRulesPath) ? readFileSync(storageRulesPath, 'utf-8') : '';

  it('uses rules_version 2', () => {
    expect(rules).toMatch(/rules_version\s*=\s*['"]2['"]/);
  });

  it('has a catch-all default-deny rule', () => {
    expect(rules).toMatch(/match\s*\/\{allPaths=\*\*\}[\s\S]*?allow read,\s*write:\s*if false/);
  });

  it('avatar upload enforces owner-only + image + size cap', () => {
    const section = rules.match(/match\s*\/users\/\{uid\}\/avatar[\s\S]*?\n\s*\}/);
    expect(section).toBeTruthy();
    expect(section![0]).toContain('isOwner(uid)');
    expect(section![0]).toContain('isImage()');
    expect(section![0]).toMatch(/sizeUnder\(\d+\)/);
  });

  it('slang media enforces size caps per type', () => {
    const section = rules.match(/match\s*\/slangs\/\{slangId\}\/media\/\{file\}[\s\S]*?\n\s*\}/);
    expect(section).toBeTruthy();
    expect(section![0]).toMatch(/isImage\(\)\s*&&\s*sizeUnder/);
    expect(section![0]).toMatch(/isVideo\(\)\s*&&\s*sizeUnder/);
  });
});

describe('firebase.json — deployment config audit', () => {
  const json = JSON.parse(readFileSync(firebaseJsonPath, 'utf-8'));

  it('storage block points to storage.rules', () => {
    expect(json.storage).toBeDefined();
    expect(json.storage.rules).toBe('storage.rules');
  });

  it('firestore block points to firestore.rules', () => {
    expect(json.firestore.rules).toBe('firestore.rules');
  });

  it('hosting.headers declares security headers', () => {
    const headers = json.hosting.headers?.[0]?.headers || [];
    const keys = headers.map((h: any) => h.key);
    expect(keys).toContain('X-Frame-Options');
    expect(keys).toContain('X-Content-Type-Options');
    expect(keys).toContain('Referrer-Policy');
    expect(keys).toContain('Content-Security-Policy');
  });

  it('X-Frame-Options is DENY', () => {
    const h = json.hosting.headers[0].headers.find((h: any) => h.key === 'X-Frame-Options');
    expect(h.value).toBe('DENY');
  });

  it('X-Content-Type-Options is nosniff', () => {
    const h = json.hosting.headers[0].headers.find((h: any) => h.key === 'X-Content-Type-Options');
    expect(h.value).toBe('nosniff');
  });

  it('CSP defines a default-src directive', () => {
    const csp = json.hosting.headers[0].headers.find((h: any) => h.key === 'Content-Security-Policy');
    expect(csp).toBeDefined();
    expect(csp.value).toMatch(/default-src/);
  });
});

describe('UX hygiene — no native dialogs in src/', () => {
  // Project policy: use sonner toast or shadcn AlertDialog instead of
  // window.alert / window.confirm. Native dialogs are inconsistent on
  // mobile and break the design system.
  function walkSrc(dir: string): string[] {
    const out: string[] = [];
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'test' || entry.name === 'node_modules') continue;
        out.push(...walkSrc(full));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  const files = walkSrc(join(ROOT, 'src'));

  it('no window.alert calls in src/ (excluding tests)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf-8');
      // Match alert( but allow .alert (e.g. variable.alert) — also skip toast.error("alert ...")
      if (/(?:^|[^.\w])alert\s*\(/.test(content)) {
        offenders.push(f);
      }
    }
    expect(offenders, `Replace alert() with sonner toast: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no window.confirm calls in src/ (excluding tests)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf-8');
      if (/window\.confirm\s*\(/.test(content) || /(?:^|[^.\w])confirm\s*\(/.test(content)) {
        offenders.push(f);
      }
    }
    expect(offenders, `Replace window.confirm with sonner toast action: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('admin.html — frontend admin gate audit', () => {
  it('admin.html file exists', () => {
    expect(existsSync(adminHtmlPath)).toBe(true);
  });

  const html = readFileSync(adminHtmlPath, 'utf-8');

  it('has NO hardcoded admin email constant', () => {
    // Regression for P0 fix: ADMIN_EMAIL = 'caizewei11@gmail.com' removed
    expect(html).not.toMatch(/const\s+ADMIN_EMAIL\s*=\s*['"]caizewei/);
    expect(html).not.toMatch(/caizewei11@gmail\.com/);
  });

  it('uses custom claim for admin check', () => {
    expect(html).toMatch(/getIdTokenResult/);
    expect(html).toMatch(/claims\.admin/);
  });
});
