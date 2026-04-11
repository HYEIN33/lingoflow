import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const oldKey = JSON.parse(readFileSync(resolve(__dirname, 'old-service-account.json'), 'utf8'));
const newKey = JSON.parse(readFileSync(resolve(__dirname, 'new-service-account.json'), 'utf8'));

const oldApp = initializeApp({ credential: cert(oldKey) }, 'old');
const newApp = initializeApp({ credential: cert(newKey) }, 'new');

// Old project: custom database ID
const oldDb = getFirestore(oldApp, 'ai-studio-e4b5c619-e556-4bff-b9dc-4cd16b61ce62');
// New project: default database
const newDb = getFirestore(newApp);

async function migrateCollection(name) {
  console.log(`\n📦 ${name}`);
  const snapshot = await oldDb.collection(name).get();
  if (snapshot.empty) { console.log('  ⏭ empty'); return 0; }
  console.log(`  📊 ${snapshot.size} docs`);

  let batch = newDb.batch();
  let count = 0, bc = 0;
  for (const d of snapshot.docs) {
    batch.set(newDb.collection(name).doc(d.id), d.data());
    count++; bc++;
    if (bc >= 450) { await batch.commit(); batch = newDb.batch(); bc = 0; console.log(`  ✅ ${count}/${snapshot.size}`); }
  }
  if (bc > 0) await batch.commit();
  console.log(`  ✅ ${count} done`);
  return count;
}

async function main() {
  console.log(`🔄 From: ${oldKey.project_id} → To: ${newKey.project_id}\n`);

  const cols = await oldDb.listCollections();
  const names = cols.map(c => c.id);
  console.log(`Collections: ${names.join(', ') || '(none, trying defaults)'}`);

  const toMigrate = names.length > 0 ? names : ['users', 'words', 'slang', 'slang_meanings'];
  let total = 0;
  for (const c of toMigrate) {
    try { total += await migrateCollection(c); }
    catch (e) { console.error(`  ❌ ${c}: ${e.message}`); }
  }
  console.log(`\n✅ Done! ${total} documents migrated`);
  process.exit(0);
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
