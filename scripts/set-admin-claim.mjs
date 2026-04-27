#!/usr/bin/env node
/**
 * One-shot script to grant admin custom claim to a Firebase user.
 *
 * Usage:
 *   node scripts/set-admin-claim.mjs <email-or-uid>
 *
 * Example:
 *   node scripts/set-admin-claim.mjs caizewei11@gmail.com
 *
 * Prereqs:
 *   1. A service account JSON in scripts/ (NOT committed — it's in .gitignore).
 *      Download from: Firebase Console → Project settings → Service accounts →
 *      "Generate new private key". Save as scripts/memeflow-16ecf-service-account.json.
 *   2. The user must already exist (anonymous or email login counts).
 *
 * After running:
 *   - The user's next `getIdToken(true)` will include `admin: true` claim.
 *   - Firestore rules (`isAdmin()`) will recognize them immediately.
 *   - They can visit `/?admin` to load the Admin panel.
 *
 * To revoke:
 *   node scripts/set-admin-claim.mjs <email> --revoke
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));

const [, , identifier, flag] = process.argv;
const revoke = flag === '--revoke';

if (!identifier) {
  console.error('Usage: node scripts/set-admin-claim.mjs <email-or-uid> [--revoke]');
  process.exit(1);
}

const keyPath = join(__dirname, 'memeflow-16ecf-service-account.json');
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch (e) {
  console.error(`\n❌ 找不到 service account key：${keyPath}`);
  console.error('  请从 Firebase Console → Project settings → Service accounts');
  console.error('  → "Generate new private key" 下载，保存为 scripts/memeflow-16ecf-service-account.json\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function main() {
  // Resolve identifier → uid
  let user;
  try {
    user = identifier.includes('@')
      ? await admin.auth().getUserByEmail(identifier)
      : await admin.auth().getUser(identifier);
  } catch (e) {
    console.error(`❌ 找不到用户 ${identifier}：${e.message}`);
    process.exit(1);
  }

  const existingClaims = user.customClaims || {};
  const nextClaims = revoke
    ? { ...existingClaims, admin: false }
    : { ...existingClaims, admin: true };

  await admin.auth().setCustomUserClaims(user.uid, nextClaims);

  console.log(`\n✓ ${revoke ? '已撤销' : '已授予'} admin claim`);
  console.log(`  uid: ${user.uid}`);
  console.log(`  email: ${user.email || '(no email)'}`);
  console.log(`  displayName: ${user.displayName || '(none)'}`);
  console.log(`  claims 现状: ${JSON.stringify(nextClaims)}`);
  console.log(`\n下一步：`);
  if (revoke) {
    console.log(`  该用户下次登录/刷新 token 后，admin 权限立即失效。\n`);
  } else {
    console.log(`  1. 让该用户重新登录，或调用 getIdToken(true) 强制刷新 token`);
    console.log(`  2. 访问 https://memeflow-16ecf.web.app/?admin 进入管理后台\n`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Failed:', e);
  process.exit(1);
});
