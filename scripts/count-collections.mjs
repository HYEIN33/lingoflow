#!/usr/bin/env node
// Quick read-only counts of the main Firestore collections.
// Useful to answer "how much data is actually in prod?"
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, 'memeflow-16ecf-service-account.json');
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// Project Firestore DB id is 'default' literally (not '(default)').
const db = admin.firestore();
db.settings({ databaseId: 'default' });

const collections = [
  'slangs', 'slang_meanings', 'slang_upvotes', 'slang_searches',
  'slang_comments', 'slang_reports',
  'users', 'words',
  'classSessions', 'classNotes', 'classFolders',
  'confusionSignals', 'admin_audit_log',
];

for (const name of collections) {
  try {
    const snap = await db.collection(name).count().get();
    console.log(`${name.padEnd(22)} ${snap.data().count}`);
  } catch (e) {
    console.log(`${name.padEnd(22)} ERROR ${e.code || e.message}`);
  }
}

// Sample top 5 slangs by createdAt to see if the corpus has real content
console.log('\n─── Top 5 slangs by createdAt ───');
try {
  const snap = await db.collection('slangs').orderBy('createdAt', 'desc').limit(5).get();
  for (const d of snap.docs) {
    const data = d.data();
    console.log(`  ${d.id.slice(0, 8)}  ${data.term || '(no term)'}`);
  }
} catch (e) {
  console.log('  ERROR', e.message);
}

process.exit(0);
