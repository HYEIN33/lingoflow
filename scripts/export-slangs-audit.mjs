#!/usr/bin/env node
// Read-only export of the full slang corpus for audit work:
//   - dedup baseline before bulk-importing new terms
//   - novelty/staleness review of existing entries
// Writes scripts/slangs-audit.json: [{ id, term, source, createdAt,
//   meanings: [{ id, meaning, example, status, qualityScore, upvotes }] }]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, 'memeflow-16ecf-service-account.json');
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
db.settings({ databaseId: 'default' });

// Pull everything (934 slangs / 852 meanings as of 2026-06 — small enough
// for a single in-memory join).
const [slangSnap, meaningSnap] = await Promise.all([
  db.collection('slangs').get(),
  db.collection('slang_meanings').get(),
]);

const meaningsBySlang = new Map();
for (const d of meaningSnap.docs) {
  const m = d.data();
  const list = meaningsBySlang.get(m.slangId) || [];
  list.push({
    id: d.id,
    meaning: m.meaning || '',
    example: m.example || '',
    status: m.status || '',
    qualityScore: m.qualityScore ?? null,
    upvotes: m.upvotes ?? 0,
  });
  meaningsBySlang.set(m.slangId, list);
}

const rows = slangSnap.docs.map((d) => {
  const s = d.data();
  return {
    id: d.id,
    term: s.term || '',
    source: s.source || '',
    createdAt: s.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || '',
    meanings: meaningsBySlang.get(d.id) || [],
  };
});

const out = join(__dirname, 'slangs-audit.json');
writeFileSync(out, JSON.stringify(rows, null, 1));

const empty = rows.filter((r) => r.meanings.length === 0);
console.log(`exported ${rows.length} slangs / ${meaningSnap.size} meanings → ${out}`);
console.log(`empty-shell slangs (no meanings at all): ${empty.length}`);
console.log(`sample empties: ${empty.slice(0, 10).map((r) => r.term).join(' | ')}`);
process.exit(0);
