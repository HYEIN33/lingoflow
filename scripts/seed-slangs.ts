/**
 * Batch import slang entries into Firestore
 *
 * Usage:
 *   1. Edit scripts/slangs-data.json with your entries
 *   2. Run: npx tsx scripts/seed-slangs.ts
 *
 * JSON format: [{ "term": "...", "meaning": "...", "example": "...", "sentiment": "..." }, ...]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

interface SlangEntry {
  term: string;
  meaning: string;
  example: string;
  sentiment: string;
}

const dataPath = resolve(__dirname, 'slangs-data.json');
const SLANGS: SlangEntry[] = JSON.parse(readFileSync(dataPath, 'utf-8'));

if (SLANGS.length === 0) {
  console.log('slangs-data.json is empty. Add entries and re-run.');
  process.exit(0);
}

let BOT_AUTHOR_ID = '';
const BOT_AUTHOR_NAME = 'MemeFlow Bot';

async function seed() {
  console.log('Signing in anonymously...');
  const cred = await signInAnonymously(auth);
  BOT_AUTHOR_ID = cred.user.uid;
  console.log(`Signed in as ${BOT_AUTHOR_ID}`);
  console.log(`Importing ${SLANGS.length} entries...\n`);

  let created = 0;
  let skipped = 0;

  for (const slang of SLANGS) {
    const existing = await getDocs(query(collection(db, 'slangs'), where('term', '==', slang.term)));
    let slangId: string;

    if (!existing.empty) {
      slangId = existing.docs[0].id;
      console.log(`[skip] "${slang.term}" already exists`);
      skipped++;
    } else {
      const slangRef = await addDoc(collection(db, 'slangs'), {
        term: slang.term,
        createdAt: serverTimestamp(),
      });
      slangId = slangRef.id;
      console.log(`[new]  "${slang.term}" created`);
    }

    const existingMeaning = await getDocs(
      query(collection(db, 'slang_meanings'), where('slangId', '==', slangId), where('authorId', '==', BOT_AUTHOR_ID))
    );

    if (!existingMeaning.empty) {
      console.log(`       meaning already exists, skipping`);
      continue;
    }

    await addDoc(collection(db, 'slang_meanings'), {
      slangId,
      meaning: slang.meaning,
      example: slang.example,
      authorId: BOT_AUTHOR_ID,
      authorName: BOT_AUTHOR_NAME,
      qualityScore: 85,
      upvotes: Math.floor(Math.random() * 20) + 5,
      status: 'approved',
      voiceName: 'Kore',
      mediaUrl: null,
      mediaType: null,
      userAudioUrl: null,
      createdAt: serverTimestamp(),
    });

    created++;
    console.log(`       meaning added (${slang.sentiment})`);
  }

  console.log(`\nDone: ${created} meanings created, ${skipped} terms already existed`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
