/**
 * Migrate Firestore data from old project to new project.
 * Uses Firebase client SDK (no service account needed).
 *
 * Usage: node scripts/migrate-firestore.mjs
 */

import { initializeApp as initOld } from 'firebase/app';
import { initializeApp as initNew } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';

const OLD_CONFIG = {
  projectId: "gen-lang-client-0343041160",
  appId: "1:62018427733:web:dd4adb2b5cd607ab58addc",
  apiKey: "AIzaSyCOAkcdMpVBEckROWgmL7AlYma9kTdRmpc",
  authDomain: "gen-lang-client-0343041160.firebaseapp.com",
  storageBucket: "gen-lang-client-0343041160.firebasestorage.app",
};

const NEW_CONFIG = {
  projectId: "memeflow-16ecf",
  appId: "1:323800841633:web:1b0d0961e6e5dc431f5fe0",
  apiKey: "AIzaSyBx8N2ouJetgJAK7k0NiwWVf0eEjtgH1EM",
  authDomain: "memeflow-16ecf.firebaseapp.com",
  storageBucket: "memeflow-16ecf.firebasestorage.app",
};

// Initialize both apps
const oldApp = initOld(OLD_CONFIG, 'old');
const newApp = initNew(NEW_CONFIG, 'new');

// Old project uses a custom database ID
const oldDb = getFirestore(oldApp, 'ai-studio-e4b5c619-e556-4bff-b9dc-4cd16b61ce62');
const newDb = getFirestore(newApp);

// Collections to migrate
const COLLECTIONS = ['users', 'words', 'slang', 'slang_meanings'];

async function migrateCollection(name) {
  console.log(`\n📦 Migrating collection: ${name}`);

  try {
    const snapshot = await getDocs(collection(oldDb, name));

    if (snapshot.empty) {
      console.log(`  ⏭ Empty, skipping`);
      return 0;
    }

    console.log(`  📊 Found ${snapshot.size} documents`);

    let count = 0;
    let errors = 0;

    for (const docSnap of snapshot.docs) {
      try {
        const data = docSnap.data();
        await setDoc(doc(newDb, name, docSnap.id), data);
        count++;
        if (count % 10 === 0) {
          process.stdout.write(`  ✅ ${count}/${snapshot.size}\r`);
        }
      } catch (err) {
        errors++;
        console.error(`  ❌ Failed to migrate ${name}/${docSnap.id}:`, err.message);
      }
    }

    console.log(`  ✅ Migrated ${count}/${snapshot.size} documents (${errors} errors)`);
    return count;
  } catch (err) {
    console.error(`  ❌ Failed to read collection ${name}:`, err.message);
    return 0;
  }
}

async function main() {
  console.log('🔄 Starting Firestore migration');
  console.log(`   From: ${OLD_CONFIG.projectId}`);
  console.log(`   To:   ${NEW_CONFIG.projectId}`);

  let total = 0;

  for (const col of COLLECTIONS) {
    const count = await migrateCollection(col);
    total += count;
  }

  console.log(`\n✅ Migration complete! Total: ${total} documents migrated.`);
  process.exit(0);
}

main().catch(err => {
  console.error('💥 Migration failed:', err);
  process.exit(1);
});
