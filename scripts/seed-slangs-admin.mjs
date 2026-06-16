#!/usr/bin/env node
// Admin (service-account) bulk import for curated slang entries.
// Differences from seed-slangs.ts (anonymous-auth version):
//   - bypasses security rules via Admin SDK
//   - writes termLower (the dedup key bulkImportSlangs relies on)
//   - tags slangs with source so this batch is traceable/reversible
// Usage: node scripts/seed-slangs-admin.mjs [data-file.json]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, 'memeflow-16ecf-service-account.json');
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
db.settings({ databaseId: 'default' });
const { FieldValue } = admin.firestore;

const SOURCE_TAG = 'curated_import_202606';
const AUTHOR_ID = 'memeflow-bot-curated';
const AUTHOR_NAME = 'MemeFlow 精选';

const dataFile = process.argv[2] || join(__dirname, 'slangs-data-202606.json');
const entries = JSON.parse(readFileSync(dataFile, 'utf8'));
console.log(`importing ${entries.length} curated entries from ${dataFile}\n`);

let createdSlangs = 0;
let reusedSlangs = 0;
let createdMeanings = 0;
let skippedMeanings = 0;

for (const e of entries) {
  const term = (e.term || '').trim();
  const termLower = term.toLowerCase();
  if (!term || !e.meaning) continue;

  // Dedup: termLower first (CF convention), then exact term (legacy docs).
  let slangId = null;
  const byLower = await db.collection('slangs').where('termLower', '==', termLower).limit(1).get();
  if (!byLower.empty) {
    slangId = byLower.docs[0].id;
    reusedSlangs++;
  } else {
    const byExact = await db.collection('slangs').where('term', '==', term).limit(1).get();
    if (!byExact.empty) {
      slangId = byExact.docs[0].id;
      reusedSlangs++;
    }
  }
  if (!slangId) {
    const ref = await db.collection('slangs').add({
      term,
      termLower,
      createdAt: FieldValue.serverTimestamp(),
      source: SOURCE_TAG,
      importedBy: AUTHOR_ID,
    });
    slangId = ref.id;
    createdSlangs++;
  }

  // One curated meaning per slang from this batch — skip if already present.
  const existingMeaning = await db
    .collection('slang_meanings')
    .where('slangId', '==', slangId)
    .where('authorId', '==', AUTHOR_ID)
    .limit(1)
    .get();
  if (!existingMeaning.empty) {
    skippedMeanings++;
    continue;
  }

  await db.collection('slang_meanings').add({
    slangId,
    meaning: e.meaning,
    example: e.example || '',
    authorId: AUTHOR_ID,
    authorName: AUTHOR_NAME,
    qualityScore: 88,
    upvotes: Math.floor(Math.random() * 20) + 5,
    status: 'approved',
    voiceName: 'Kore',
    mediaUrl: null,
    mediaType: null,
    userAudioUrl: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  createdMeanings++;
  if (createdMeanings % 25 === 0) console.log(`  ...${createdMeanings} meanings written`);
}

console.log(`\ndone: slangs created=${createdSlangs} reused=${reusedSlangs}; meanings created=${createdMeanings} skipped=${skippedMeanings}`);
process.exit(0);
