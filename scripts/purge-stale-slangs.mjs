#!/usr/bin/env node
// Executes the confirmed deletion list from audit-deletion-dryrun.json:
//   1. full backup of every doc (slang + its meanings) → deleted-backup-202606.json
//   2. batched deletes (meanings first, then slang docs)
//   3. one summary entry in admin_audit_log
// User confirmed full A+B+C+D purge on 2026-06-11.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'memeflow-16ecf-service-account.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
db.settings({ databaseId: 'default' });
const { FieldValue } = admin.firestore;

const list = JSON.parse(readFileSync(join(__dirname, 'audit-deletion-dryrun.json'), 'utf8'));
console.log(`purging ${list.length} slangs (with their meanings)…`);

// ---- 1. backup full docs ----
const backup = [];
for (const item of list) {
  const slangSnap = await db.collection('slangs').doc(item.id).get();
  if (!slangSnap.exists) { backup.push({ id: item.id, missing: true }); continue; }
  const meaningsSnap = await db.collection('slang_meanings').where('slangId', '==', item.id).get();
  backup.push({
    id: item.id,
    cat: item.cat,
    slang: slangSnap.data(),
    meanings: meaningsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
}
// Timestamps aren't JSON-serializable cleanly — normalize.
const json = JSON.stringify(backup, (k, v) => (v && v._seconds !== undefined ? new Date(v._seconds * 1000).toISOString() : v), 1);
writeFileSync(join(__dirname, 'deleted-backup-202606.json'), json);
const totalMeanings = backup.reduce((n, b) => n + (b.meanings?.length || 0), 0);
console.log(`backup written: ${backup.length} slangs, ${totalMeanings} meanings`);

// ---- 2. batched deletes ----
let batch = db.batch();
let ops = 0;
let deletedSlangs = 0;
let deletedMeanings = 0;
const flush = async () => { if (ops > 0) { await batch.commit(); batch = db.batch(); ops = 0; } };

for (const b of backup) {
  if (b.missing) continue;
  for (const m of b.meanings) {
    batch.delete(db.collection('slang_meanings').doc(m.id));
    deletedMeanings++;
    if (++ops >= 400) await flush();
  }
  batch.delete(db.collection('slangs').doc(b.id));
  deletedSlangs++;
  if (++ops >= 400) await flush();
}
await flush();

// ---- 3. audit log ----
await db.collection('admin_audit_log').add({
  action: 'bulk_purge_stale_slangs',
  reason: 'novelty audit 2026-06 (user-confirmed dry-run list)',
  deletedSlangs,
  deletedMeanings,
  backupFile: 'scripts/deleted-backup-202606.json',
  at: FieldValue.serverTimestamp(),
});

console.log(`done: deleted ${deletedSlangs} slangs + ${deletedMeanings} meanings. audit log written.`);
process.exit(0);
