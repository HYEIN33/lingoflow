const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

if (!admin.apps.length) admin.initializeApp();

// This project's Firestore database is literally named 'default'
// (no parentheses). The firebase-admin SDK's admin.firestore() default
// targets '(default)' which does not exist here, so every call returns
// gRPC NOT_FOUND. Always go through getFirestore(app, 'default') to
// hit the real database. Verified 2026-04-13 via diagnostic endpoint.
const FIRESTORE_DB_ID = 'default';
function firestoreDb() {
  return getFirestore(admin.app(), FIRESTORE_DB_ID);
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MAX_PER_MINUTE = 30;
const MAX_PER_DAY = 300;

// Allowed origins — anything else gets a hard CORS reject
const ALLOWED_ORIGINS = new Set([
  'https://memeflow-16ecf.web.app',
  'https://memeflow-16ecf.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
]);

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '3600');
    return true;
  }
  return false;
}

// In-memory rate limit counters, keyed by uid. Each entry is an array of
// call timestamps (ms). Survives within a single Function instance; the
// async hydrate/flush logic merges with Firestore so limits stay reasonably
// accurate across instances.
//
// Trade-off vs the previous transaction-per-call design:
//   + Saves a 50-200ms Firestore transaction on every translate call.
//   + Faster responses, especially noticeable on cold translation clicks.
//   - Weaker across-instance consistency. If Cloud Run spins up a second
//     instance, that instance starts blind and a user can burst ~2x limits
//     briefly until both instances have hydrated from Firestore.
//   - On Function eviction, the last unflushed calls (<=10s window) may be
//     lost. Acceptable: we'd rather slightly under-count than pay per-call
//     Firestore latency for the 99% happy path.
const memCounters = new Map(); // uid -> { calls: number[], lastFlush: number, hydrated: boolean }

async function hydrateIfNeeded(uid) {
  const entry = memCounters.get(uid) || { calls: [], lastFlush: 0, hydrated: false };
  if (entry.hydrated) return entry;
  try {
    const db = firestoreDb();
    const snap = await db.collection('_rate_limits').doc(uid).get();
    if (snap.exists) {
      const data = snap.data();
      const fresh = (data.calls || [])
        .map((t) => (typeof t?.toMillis === 'function' ? t.toMillis() : 0))
        .filter((ms) => ms > Date.now() - 86_400_000);
      entry.calls = fresh;
    }
    entry.hydrated = true;
    memCounters.set(uid, entry);
  } catch (e) {
    // If Firestore is unhappy, proceed with empty in-memory state (fail-open
    // per instance, but still capped by instance-level counts). Log to console;
    // repeated failures show up in the Function logs.
    console.warn('Rate limit hydrate failed for', uid, e.message);
    entry.hydrated = true;
    memCounters.set(uid, entry);
  }
  return entry;
}

const FLUSH_INTERVAL_MS = 10_000;

function flushIfStale(uid, entry) {
  const now = Date.now();
  if (now - entry.lastFlush < FLUSH_INTERVAL_MS) return;
  entry.lastFlush = now;
  // Fire-and-forget. We intentionally do NOT await — the whole point is to
  // not block the hot path. Firestore write failures are logged; the in-memory
  // counter keeps working.
  const snapshot = entry.calls.slice(-MAX_PER_DAY);
  const ts = snapshot.map((ms) => admin.firestore.Timestamp.fromMillis(ms));
  firestoreDb()
    .collection('_rate_limits')
    .doc(uid)
    .set({ calls: ts }, { merge: true })
    .catch((e) => console.warn('Rate limit flush failed for', uid, e.message));
}

async function checkRateLimit(uid) {
  const entry = await hydrateIfNeeded(uid);
  const now = Date.now();
  const minuteAgo = now - 60_000;
  const dayAgo = now - 86_400_000;

  // Drop stale entries first
  entry.calls = entry.calls.filter((ms) => ms > dayAgo);
  const lastMinute = entry.calls.filter((ms) => ms > minuteAgo).length;
  if (lastMinute >= MAX_PER_MINUTE) return { allowed: false, reason: 'minute' };
  if (entry.calls.length >= MAX_PER_DAY) return { allowed: false, reason: 'day' };
  entry.calls.push(now);
  memCounters.set(uid, entry);
  flushIfStale(uid, entry);
  return { allowed: true };
}

exports.apiGenerate = onRequest(
  { secrets: ['GEMINI_API_KEY'], cors: false },
  async (req, res) => {
    const corsOk = applyCors(req, res);
    if (req.method === 'OPTIONS') {
      res.status(corsOk ? 204 : 403).end();
      return;
    }
    if (!corsOk) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Require Firebase ID token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'Missing auth token' });
      return;
    }
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch (e) {
      res.status(401).json({ error: 'Invalid auth token' });
      return;
    }
    const uid = decoded.uid;

    // Per-uid rate limit, in-memory with async Firestore flush. The first
    // call from a cold instance pays the one-time Firestore read for
    // hydration; subsequent calls are synchronous map lookups. See
    // checkRateLimit comments for the consistency trade-off.
    try {
      const rl = await checkRateLimit(uid);
      if (!rl.allowed) {
        const msg = rl.reason === 'minute'
          ? 'Rate limit exceeded — please wait a minute.'
          : 'Daily limit reached — try again tomorrow.';
        res.status(429).json({ error: msg });
        return;
      }
    } catch (e) {
      // Defensive: hydrate is already wrapped in try/catch, so this should
      // not fire. Still, fail-CLOSED on unexpected state so we don't leak
      // free API calls if something truly unexpected happens.
      console.error('Rate limit check failed:', e);
      res.status(503).json({ error: 'Rate limit service unavailable' });
      return;
    }

    const { model, contents, config, stream } = req.body || {};
    if (!model || !contents) {
      res.status(400).json({ error: 'Missing model or contents' });
      return;
    }
    // Whitelist models to prevent users billing expensive models. Kept narrow:
    // only the current-gen Flash family we actually use. Older models
    // (gemini-2.0-flash, gemini-1.5-flash) are deprecated for new users as
    // of April 2026 — kept them out so a stale client can't force a 404 loop.
    const ALLOWED_MODELS = new Set([
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash-lite',
      // Gemini 3 flash preview — used by the classroom live-translation
      // path for higher quality on spoken English + classroom register.
      // See 2026-04-20 benchmark in src/services/ai.ts translateSimple.
      'gemini-3-flash-preview',
      // Gemini 3 pro preview — used by the Live Notes feature to
      // produce structured study notes (summary + glossary + key
      // points). Notes refresh every ~60s, so pro's 10-40s latency
      // is acceptable in exchange for its much stronger reasoning
      // and structured-output adherence.
      'gemini-3-pro-preview',
      'gemini-2.5-pro',
    ]);
    if (!ALLOWED_MODELS.has(model)) {
      res.status(400).json({ error: 'Model not allowed' });
      return;
    }

    const gemBody = JSON.stringify({
      contents: Array.isArray(contents) ? contents : [{ parts: [{ text: contents }] }],
      generationConfig: config || {},
    });

    // Streaming branch — only used by translateSimple today. Response is
    // SSE-ish: newline-delimited JSON chunks from Gemini's streamGenerateContent
    // proxied straight through. Client (ai.ts streamGeminiProxy) reads them
    // incrementally so the user sees the first token at ~200-400ms instead
    // of waiting for the full response.
    if (stream) {
      try {
        const upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: gemBody,
          }
        );
        if (!upstream.ok || !upstream.body) {
          const data = await upstream.json().catch(() => ({}));
          res.status(upstream.status || 502).json({ error: data.error?.message || 'Gemini stream unavailable' });
          return;
        }
        res.status(200);
        res.set('Content-Type', 'text/event-stream');
        res.set('Cache-Control', 'no-cache');
        res.set('X-Accel-Buffering', 'no');
        // Pipe upstream SSE straight to the client. Firebase Functions v2
        // supports streaming responses; flush is implicit on write for
        // text/event-stream content type.
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
        res.end();
      } catch (e) {
        // If we've already sent headers, we can only close; otherwise surface
        if (!res.headersSent) {
          res.status(500).json({ error: e.message || 'Stream error' });
        } else {
          res.end();
        }
      }
      return;
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: gemBody,
        }
      );

      const data = await response.json();
      if (!response.ok) {
        res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });
        return;
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message || 'Internal error' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Classroom live translation — short-lived Deepgram token for the browser.
//
// Why Deepgram (not Gemini Live): we tried Gemini Live v1alpha first and
// got stuck on silent server-side disconnects (the protocol is in flux —
// camelCase vs snake_case, v1alpha vs v1beta, model names drift). Deepgram
// Nova-3 is a mature, well-documented real-time ASR with ~6-8% WER on
// academic/lecture audio. We transcribe here, then send finalized English
// sentences through our existing Gemini flash-lite translation pipeline.
//
// Token flow:
//   1. Client POSTs here with a Firebase auth Bearer token.
//   2. We authenticate + rate-limit the user the same way apiGenerate does.
//   3. We call Deepgram's /v1/auth/grant with our master key to mint a
//      30-second-TTL Bearer token (Deepgram "Temporary Token" API).
//   4. We return that token to the client; it opens a WebSocket directly
//      to api.deepgram.com with `Authorization: Token <tempKey>`.
//
// Audio never traverses this Function — it goes browser → Deepgram. That
// keeps Functions cost flat regardless of user minutes.
exports.liveToken = onRequest(
  { secrets: ['DEEPGRAM_API_KEY'], cors: false, timeoutSeconds: 30 },
  async (req, res) => {
    const corsOk = applyCors(req, res);
    if (req.method === 'OPTIONS') {
      res.status(corsOk ? 204 : 403).end();
      return;
    }
    if (!corsOk) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'Missing auth token' });
      return;
    }
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      res.status(401).json({ error: 'Invalid auth token' });
      return;
    }

    // Same rate-limit policy as apiGenerate — classroom usage counts
    // against the same per-user budget so a misbehaving client can't
    // spin up thousands of tokens and eat into the quota.
    try {
      const rl = await checkRateLimit(decoded.uid);
      if (!rl.allowed) {
        res.status(429).json({ error: 'Rate limit — try again shortly' });
        return;
      }
    } catch (e) {
      console.error('liveToken rate limit failed:', e);
      res.status(503).json({ error: 'Rate limit service unavailable' });
      return;
    }

    const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
    if (!DEEPGRAM_API_KEY) {
      res.status(500).json({ error: 'Server missing DEEPGRAM_API_KEY' });
      return;
    }
    try {
      // Deepgram's Temporary Token endpoint. ttl_seconds defaults to 30;
      // we ask for 60s so a slow user (e.g. picking a tab to share) has
      // enough time between clicking Start and the WS handshake. The
      // returned `access_token` is a short-lived Bearer — the client uses
      // it as `Authorization: Token <access_token>` on the WebSocket.
      const r = await fetch(
        'https://api.deepgram.com/v1/auth/grant',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl_seconds: 60 }),
        }
      );
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.error('liveToken Deepgram grant failed:', r.status, err);
        res.status(r.status).json({ error: `Deepgram grant failed: ${r.status}` });
        return;
      }
      const payload = await r.json();
      // Deepgram returns { access_token, expires_in } — pass through.
      res.json({
        token: payload.access_token,
        expiresIn: payload.expires_in,
        provider: 'deepgram',
      });
    } catch (e) {
      console.error('liveToken error:', e);
      res.status(500).json({ error: e.message || 'Internal error' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Admin moderation callables
//
// All of the following are v2 https `onCall` callables invoked from the
// React AdminPanel. Every one of them:
//   1. Verifies caller auth
//   2. Verifies caller is an admin — EITHER `request.auth.token.admin`
//      custom claim is true, OR `users/{uid}.role == 'admin'` in Firestore.
//      Same logic as `isAdmin()` in firestore.rules.
//   3. Runs the mutation inside a Firestore transaction so paired writes
//      (meaning.status + user.reputationScore + audit log) either all land
//      or all fail. No partial state.
//   4. Writes an `admin_audit_log` doc capturing who did what, when.
//
// Audit log shape:
//   { action, meaningId?, reportId?, authorId?, adminUid, at, ...extras }
//
// Reputation / count deltas:
//   approve  → reputationScore +10, approvedSlangCount +1
//   reject   → no reputation change (just records rejection reason)
//   dismiss  → no reputation change
//
// Batch operations are capped at 50 ids per call to keep the worst-case
// transaction latency bounded and avoid hitting the 500-write transaction
// limit on a pathological batch.
// ─────────────────────────────────────────────────────────────────────────

const AUDIT_COLLECTION = 'admin_audit_log';
const MAX_BATCH = 50;

async function assertAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }
  // Fast path: custom claim
  if (request.auth.token && request.auth.token.admin === true) return;
  // Fallback: users/{uid}.role == 'admin'
  const uid = request.auth.uid;
  try {
    const snap = await firestoreDb().collection('users').doc(uid).get();
    if (snap.exists && snap.data() && snap.data().role === 'admin') return;
  } catch (e) {
    console.error('assertAdmin Firestore lookup failed:', e);
  }
  throw new HttpsError('permission-denied', 'Admin only');
}

// Internal worker — runs one approve inside a transaction. Exposed so
// batchApprove can reuse without recursion through the callable wrapper.
async function doApprove(db, meaningId, adminUid) {
  return db.runTransaction(async (tx) => {
    const meaningRef = db.collection('slang_meanings').doc(meaningId);
    const meaningSnap = await tx.get(meaningRef);
    if (!meaningSnap.exists) {
      throw new HttpsError('not-found', `meaning ${meaningId} not found`);
    }
    const data = meaningSnap.data() || {};
    const authorId = data.authorId;
    const alreadyApproved = data.status === 'approved';

    tx.update(meaningRef, {
      status: 'approved',
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: adminUid,
    });

    // Only bump reputation on the first approval — re-approving an already
    // approved meaning (e.g. dup click in the admin panel) should not
    // inflate the author's score.
    if (authorId && !alreadyApproved) {
      const userRef = db.collection('users').doc(authorId);
      tx.set(
        userRef,
        {
          approvedSlangCount: FieldValue.increment(1),
          reputationScore: FieldValue.increment(10),
        },
        { merge: true }
      );
    }

    const auditRef = db.collection(AUDIT_COLLECTION).doc();
    tx.set(auditRef, {
      action: 'approve',
      meaningId,
      authorId: authorId || null,
      adminUid,
      at: FieldValue.serverTimestamp(),
    });

    return { ok: true, meaningId, authorId: authorId || null };
  });
}

async function doReject(db, meaningId, reason, adminUid) {
  return db.runTransaction(async (tx) => {
    const meaningRef = db.collection('slang_meanings').doc(meaningId);
    const meaningSnap = await tx.get(meaningRef);
    if (!meaningSnap.exists) {
      throw new HttpsError('not-found', `meaning ${meaningId} not found`);
    }
    const data = meaningSnap.data() || {};
    const authorId = data.authorId || null;

    tx.update(meaningRef, {
      status: 'rejected',
      rejectionReason: reason,
      rejectedAt: FieldValue.serverTimestamp(),
      rejectedBy: adminUid,
    });

    const auditRef = db.collection(AUDIT_COLLECTION).doc();
    tx.set(auditRef, {
      action: 'reject',
      meaningId,
      authorId,
      reason,
      adminUid,
      at: FieldValue.serverTimestamp(),
    });

    return { ok: true, meaningId };
  });
}

exports.approveSlangMeaning = onCall({ cors: false }, async (request) => {
  await assertAdmin(request);
  const { meaningId } = request.data || {};
  if (!meaningId || typeof meaningId !== 'string') {
    throw new HttpsError('invalid-argument', 'meaningId is required');
  }
  try {
    return await doApprove(firestoreDb(), meaningId, request.auth.uid);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('approveSlangMeaning failed:', e);
    throw new HttpsError('internal', e.message || 'approve failed');
  }
});

exports.rejectSlangMeaning = onCall({ cors: false }, async (request) => {
  await assertAdmin(request);
  const { meaningId, reason } = request.data || {};
  if (!meaningId || typeof meaningId !== 'string') {
    throw new HttpsError('invalid-argument', 'meaningId is required');
  }
  if (!reason || typeof reason !== 'string' || reason.length === 0 || reason.length >= 500) {
    throw new HttpsError('invalid-argument', 'reason is required (1..500 chars)');
  }
  try {
    return await doReject(firestoreDb(), meaningId, reason, request.auth.uid);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('rejectSlangMeaning failed:', e);
    throw new HttpsError('internal', e.message || 'reject failed');
  }
});

exports.batchApprove = onCall({ cors: false }, async (request) => {
  await assertAdmin(request);
  const { meaningIds } = request.data || {};
  if (!Array.isArray(meaningIds) || meaningIds.length === 0) {
    throw new HttpsError('invalid-argument', 'meaningIds must be a non-empty array');
  }
  if (meaningIds.length > MAX_BATCH) {
    throw new HttpsError('invalid-argument', `batch max is ${MAX_BATCH}`);
  }
  const db = firestoreDb();
  const results = [];
  const failures = [];
  // Sequential, not parallel — runTransaction lock contention across the
  // same author doc would thrash otherwise. 50 * ~100ms = 5s worst case.
  for (const id of meaningIds) {
    if (typeof id !== 'string' || !id) {
      failures.push({ meaningId: id, error: 'bad id' });
      continue;
    }
    try {
      const r = await doApprove(db, id, request.auth.uid);
      results.push(r);
    } catch (e) {
      failures.push({ meaningId: id, error: e.message || 'failed' });
    }
  }
  return { ok: true, approved: results.length, failed: failures.length, failures };
});

exports.batchReject = onCall({ cors: false }, async (request) => {
  await assertAdmin(request);
  const { meaningIds, reason } = request.data || {};
  if (!Array.isArray(meaningIds) || meaningIds.length === 0) {
    throw new HttpsError('invalid-argument', 'meaningIds must be a non-empty array');
  }
  if (meaningIds.length > MAX_BATCH) {
    throw new HttpsError('invalid-argument', `batch max is ${MAX_BATCH}`);
  }
  if (!reason || typeof reason !== 'string' || reason.length === 0 || reason.length >= 500) {
    throw new HttpsError('invalid-argument', 'reason is required (1..500 chars)');
  }
  const db = firestoreDb();
  const results = [];
  const failures = [];
  for (const id of meaningIds) {
    if (typeof id !== 'string' || !id) {
      failures.push({ meaningId: id, error: 'bad id' });
      continue;
    }
    try {
      const r = await doReject(db, id, reason, request.auth.uid);
      results.push(r);
    } catch (e) {
      failures.push({ meaningId: id, error: e.message || 'failed' });
    }
  }
  return { ok: true, rejected: results.length, failed: failures.length, failures };
});

// ─────────────────────────────────────────────────────────────────────────
// Bulk import — admin pastes a JSON array of slang entries. We run each
// entry in its own transaction (sequentially, not parallel) so a single
// bad row can't poison the whole batch and so we don't starve Firestore
// with contention on the slangs collection.
//
// Dedup policy: for each entry we look up existing `slangs` where
// `termLower == term.toLowerCase()`. If a slang doc exists we reuse its
// ID and attach the new meaning to it. Otherwise we create a new slang.
// The meaning is always newly created; we never overwrite existing
// meanings from import — collisions on (term, meaning) are not detected
// here, admins should dedupe upstream.
//
// Each entry produces an audit row `{ action: 'bulk_import_entry', ...}`
// so a bulk import is traceable one-entry-at-a-time, not just as a blob.
// ─────────────────────────────────────────────────────────────────────────
const BULK_IMPORT_MAX = 50;

exports.bulkImportSlangs = onCall({ cors: false, timeoutSeconds: 300 }, async (request) => {
  await assertAdmin(request);
  const { entries } = request.data || {};
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new HttpsError('invalid-argument', 'entries must be a non-empty array');
  }
  if (entries.length > BULK_IMPORT_MAX) {
    throw new HttpsError('invalid-argument', `Max ${BULK_IMPORT_MAX} entries per batch`);
  }

  const db = firestoreDb();
  const adminUid = request.auth.uid;
  let created = 0;
  let skipped = 0;
  const failures = [];

  for (let i = 0; i < entries.length; i += 1) {
    const raw = entries[i] || {};
    const term = typeof raw.term === 'string' ? raw.term.trim() : '';
    const meaning = typeof raw.meaning === 'string' ? raw.meaning.trim() : '';
    const example = typeof raw.example === 'string' ? raw.example.trim() : '';
    const authorName = typeof raw.authorName === 'string' && raw.authorName.trim()
      ? raw.authorName.trim().slice(0, 120)
      : 'Admin Import';

    if (!term || term.length > 100) {
      failures.push({ term: term || `(#${i})`, reason: 'term missing or > 100 chars' });
      continue;
    }
    if (!meaning || meaning.length > 1000) {
      failures.push({ term, reason: 'meaning missing or > 1000 chars' });
      continue;
    }
    if (example && example.length > 1000) {
      failures.push({ term, reason: 'example > 1000 chars' });
      continue;
    }

    try {
      const result = await db.runTransaction(async (tx) => {
        // Case-insensitive match. We rely on a `termLower` field being
        // present on newly-created slangs; legacy slangs without it get
        // matched via a second query on `term` (exact).
        const termLower = term.toLowerCase();
        const slangsCol = db.collection('slangs');

        // Primary lookup: termLower (written by this function). Fallback:
        // exact term (legacy docs predating termLower). We do these
        // reads inside the transaction so a concurrent admin import of
        // the same term won't double-create.
        let slangId = null;
        let reusedSlang = false;

        const byLower = await tx.get(slangsCol.where('termLower', '==', termLower).limit(1));
        if (!byLower.empty) {
          slangId = byLower.docs[0].id;
          reusedSlang = true;
        } else {
          const byExact = await tx.get(slangsCol.where('term', '==', term).limit(1));
          if (!byExact.empty) {
            slangId = byExact.docs[0].id;
            reusedSlang = true;
          }
        }

        if (!slangId) {
          const slangRef = slangsCol.doc();
          tx.set(slangRef, {
            term,
            termLower,
            createdAt: FieldValue.serverTimestamp(),
            source: 'bulk_import',
            importedBy: adminUid,
          });
          slangId = slangRef.id;
        }

        const meaningRef = db.collection('slang_meanings').doc();
        tx.set(meaningRef, {
          slangId,
          meaning,
          example: example || '',
          authorId: adminUid,
          authorName,
          upvotes: 0,
          status: 'approved',
          qualityScore: 100,
          createdAt: FieldValue.serverTimestamp(),
          approvedAt: FieldValue.serverTimestamp(),
          approvedBy: adminUid,
          importedBy: adminUid,
          source: 'bulk_import',
        });

        const auditRef = db.collection(AUDIT_COLLECTION).doc();
        tx.set(auditRef, {
          action: 'bulk_import_entry',
          slangTerm: term,
          slangId,
          meaningId: meaningRef.id,
          reusedSlang,
          adminUid,
          at: FieldValue.serverTimestamp(),
        });

        return { meaningId: meaningRef.id, reusedSlang };
      });

      if (result && result.meaningId) created += 1;
      else skipped += 1;
    } catch (e) {
      console.error('bulkImportSlangs entry failed:', term, e);
      failures.push({ term, reason: e.message || 'transaction failed' });
    }
  }

  return { created, skipped, failures };
});

// ─────────────────────────────────────────────────────────────────────────
// Export all slangs + slang_meanings — cursor-based pagination.
//
// 现状：之前一次 get() 全集合，超 5000 条 meaning 直接 resource-exhausted
//       hard-reject。随着 DB 变大，admin 就没法备份了。
// 修后：分页拉 meanings，每页 PAGE_SIZE 条，按 createdAt desc + startAfter
//       游标翻页。前端循环调用直到 hasMore=false，然后本地拼成完整包。
// 不修后果：meaning 过 5000 就永远导不出来，备份/迁移直接被堵。
//
// 协议：
//   input:  { cursor?: number }  // cursor 是 createdAt 的 millis
//   output: {
//     slangs?: Array,           // 只在首页 (!cursor) 返回 — slangs 总量小，一次拉全
//     meanings: Array,          // 当前页（≤ PAGE_SIZE 条，createdAt desc）
//     hasMore: boolean,
//     nextCursor: number|null,  // 下一页用的 createdAt millis（最后一条的 createdAt）
//     totalMeanings?: number,   // 只在首页返回（count 聚合查询一次）
//   }
//
// 每页都写一行 audit log {action:'export_page', cursor, count, adminUid, at}，
// 完整导出的足迹可以从多条 page 日志拼出来。
// ─────────────────────────────────────────────────────────────────────────
const EXPORT_PAGE_SIZE = 2000;

function tsToMillis(v) {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return v;
  return null;
}

function mapSlangDoc(d) {
  const data = d.data() || {};
  return {
    id: d.id,
    term: data.term || '',
    termLower: data.termLower || null,
    createdAt: tsToMillis(data.createdAt),
  };
}

function mapMeaningDoc(d) {
  const data = d.data() || {};
  return {
    id: d.id,
    slangId: data.slangId || '',
    meaning: data.meaning || '',
    example: data.example || '',
    authorId: data.authorId || '',
    authorName: data.authorName || '',
    upvotes: typeof data.upvotes === 'number' ? data.upvotes : 0,
    status: data.status || 'pending',
    qualityScore: typeof data.qualityScore === 'number' ? data.qualityScore : null,
    rejectionReason: data.rejectionReason || null,
    createdAt: tsToMillis(data.createdAt),
    approvedAt: tsToMillis(data.approvedAt),
    rejectedAt: tsToMillis(data.rejectedAt),
  };
}

exports.exportAllData = onCall({ cors: false, timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  await assertAdmin(request);
  const db = firestoreDb();
  const adminUid = request.auth.uid;
  const rawCursor = request.data && request.data.cursor;
  const cursor = typeof rawCursor === 'number' && Number.isFinite(rawCursor) ? rawCursor : null;

  try {
    // meanings 查询公用模板：createdAt desc，多拉 1 条用来探测 hasMore
    const meaningsCol = db.collection('slang_meanings');
    let meaningsQuery = meaningsCol.orderBy('createdAt', 'desc').limit(EXPORT_PAGE_SIZE + 1);
    if (cursor !== null) {
      // startAfter 基于 orderBy 字段值。传 Timestamp 对应"< cursor"那一刻的 meaning。
      meaningsQuery = meaningsCol
        .orderBy('createdAt', 'desc')
        .startAfter(admin.firestore.Timestamp.fromMillis(cursor))
        .limit(EXPORT_PAGE_SIZE + 1);
    }

    // 首页需要额外做两件事：全量拉 slangs + count meanings 总数。
    // 后续页只要 meanings 分页，省去重复工作。
    let slangs = null;
    let totalMeanings;
    if (cursor === null) {
      const [slangsSnap, countSnap] = await Promise.all([
        db.collection('slangs').get(),
        db.collection('slang_meanings').count().get(),
      ]);
      slangs = slangsSnap.docs.map(mapSlangDoc);
      // count() 返回 { data: () => { count: <number | Long> } }
      const c = countSnap.data().count;
      totalMeanings = typeof c === 'number' ? c : Number(c);
    }

    const meaningsSnap = await meaningsQuery.get();
    const docs = meaningsSnap.docs;
    const hasMore = docs.length > EXPORT_PAGE_SIZE;
    const pageDocs = hasMore ? docs.slice(0, EXPORT_PAGE_SIZE) : docs;
    const meanings = pageDocs.map(mapMeaningDoc);

    // nextCursor = 当前页最后一条的 createdAt（作为下一页的 startAfter 锚点）
    let nextCursor = null;
    if (hasMore && pageDocs.length > 0) {
      const last = pageDocs[pageDocs.length - 1];
      const ms = tsToMillis(last.data().createdAt);
      nextCursor = ms;
    }

    // Audit log — 每页一行，便于事后追踪一次完整导出由哪些 page 拼成。
    // 失败不致命，只降级 warn；不要让审计故障毁掉 admin 的导出。
    try {
      await db.collection(AUDIT_COLLECTION).add({
        action: 'export_page',
        cursor: cursor,
        count: meanings.length,
        hasMore,
        nextCursor,
        // 首页额外记录 slangs 全量大小 + 总数
        slangsCount: slangs ? slangs.length : undefined,
        totalMeanings: totalMeanings !== undefined ? totalMeanings : undefined,
        adminUid,
        at: FieldValue.serverTimestamp(),
      });
    } catch (auditErr) {
      console.warn('exportAllData audit log failed (non-fatal):', auditErr.message);
    }

    const response = {
      meanings,
      hasMore,
      nextCursor,
    };
    if (slangs !== null) response.slangs = slangs;
    if (totalMeanings !== undefined) response.totalMeanings = totalMeanings;
    return response;
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('exportAllData failed:', e);
    throw new HttpsError('internal', e.message || 'export failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────
// AI 重新评分 — 让 admin 一键让 Gemini 重评一条 meaning 的质量分。
//
// 现状：meaning.qualityScore 是创建时 autoQualityScore 生成的一次性分数。
// 修后：admin 在 Pending 卡片上点 "AI 重新评分" 就能让 Gemini 基于最新
//       的 prompt 重新打分并写回 qualityScore。
// 不修后果：质量分永远是创建那一刻的评估，prompt 迭代后无法回刷历史数据。
//
// 该 callable 直接调用 Gemini REST（没走 apiGenerate HTTP 端点），因为：
//   - apiGenerate 需要 Firebase ID token + CORS 包装，callable 里再走
//     HTTP 一圈是多余的；admin SDK 已经在 Function 上下文里。
//   - 用同一个 GEMINI_API_KEY secret + 同一个 allowed model 即可。
// ─────────────────────────────────────────────────────────────────────────
const RESCORE_MODEL = 'gemini-2.5-flash-lite';

async function geminiRescore(term, meaning, example) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'Server missing GEMINI_API_KEY');
  }
  const prompt = [
    '评估这条梗解释的质量（0-100 分）：',
    `- Term: ${term || '(unknown)'}`,
    `- 含义: ${meaning}`,
    `- 例句: ${example || '(无)'}`,
    '评分维度：准确性 / 完整性 / 例句自然度 / 无搬运。',
    '输出严格的 JSON 对象：{ "score": 整数 0-100, "reason": "一句话中文理由" }',
    '不要包含 markdown 代码块，不要输出任何 JSON 之外的文字。',
  ].join('\n');

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${RESCORE_MODEL}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error('geminiRescore upstream error:', resp.status, errText);
    throw new HttpsError('internal', `Gemini ${resp.status}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // 某些情况下 Gemini 仍然包了 ```json``` — 兜底剥一下
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('geminiRescore parse failed:', text);
      throw new HttpsError('internal', 'Gemini returned non-JSON output');
    }
  }
  const scoreNum = Number(parsed.score);
  if (!Number.isFinite(scoreNum)) {
    throw new HttpsError('internal', 'Gemini response missing numeric score');
  }
  const clamped = Math.max(0, Math.min(100, Math.round(scoreNum)));
  const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '';
  return { score: clamped, reason };
}

exports.rescoreMeaning = onCall(
  { cors: false, secrets: ['GEMINI_API_KEY'], timeoutSeconds: 60 },
  async (request) => {
    await assertAdmin(request);
    const { meaningId } = request.data || {};
    if (!meaningId || typeof meaningId !== 'string') {
      throw new HttpsError('invalid-argument', 'meaningId is required');
    }
    const db = firestoreDb();
    const adminUid = request.auth.uid;

    try {
      const meaningRef = db.collection('slang_meanings').doc(meaningId);
      const snap = await meaningRef.get();
      if (!snap.exists) {
        throw new HttpsError('not-found', `meaning ${meaningId} not found`);
      }
      const data = snap.data() || {};
      const oldScore = typeof data.qualityScore === 'number' ? data.qualityScore : null;

      // 去 slangs/{slangId} 拿 term（打分时给模型更多上下文）
      let term = '';
      if (data.slangId) {
        try {
          const slangSnap = await db.collection('slangs').doc(data.slangId).get();
          if (slangSnap.exists) {
            term = slangSnap.data().term || '';
          }
        } catch (e) {
          // term 缺失不致命，继续评分即可
          console.warn('rescoreMeaning: slang lookup failed:', e.message);
        }
      }

      const { score, reason } = await geminiRescore(term, data.meaning || '', data.example || '');

      // 写回分数 + 审计日志。admin SDK 绕规则，直接 update 即可。
      await meaningRef.update({
        qualityScore: score,
        lastRescoredAt: FieldValue.serverTimestamp(),
        lastRescoredBy: adminUid,
      });

      await db.collection(AUDIT_COLLECTION).add({
        action: 'rescore',
        meaningId,
        oldScore,
        newScore: score,
        reason,
        adminUid,
        at: FieldValue.serverTimestamp(),
      });

      return { score, reason, oldScore };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error('rescoreMeaning failed:', e);
      throw new HttpsError('internal', e.message || 'rescore failed');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// 封禁作者 — 把一个作者标记为 banned，同时把他所有 pending 的 meanings 拒掉。
//
// 现状：admin 只能一条一条拒绝 meanings，遇到刷垃圾的用户要重复操作几十次。
// 修后：一次调用 → 用户 isBanned=true + 所有 pending 内容批量 rejected。
// 不修后果：admin 面对 spam 攻击时疲于奔命；被封用户继续刷新内容。
//
// 封禁不删除用户账号、也不清他已通过的内容（保留审计痕迹）。前端可读
// isBanned 字段，决定是否允许该用户发帖（另行在客户端 / 其它 callable 里
// 加 gate）。本 callable 专注"打标 + 批量拒"两件事。
// ─────────────────────────────────────────────────────────────────────────
const BAN_PENDING_BATCH_CAP = 500; // 单次最多处理 500 条 pending，超过会返回 truncated

exports.banAuthor = onCall({ cors: false, timeoutSeconds: 120 }, async (request) => {
  await assertAdmin(request);
  const { authorId, reason } = request.data || {};
  if (!authorId || typeof authorId !== 'string') {
    throw new HttpsError('invalid-argument', 'authorId is required');
  }
  if (!reason || typeof reason !== 'string' || reason.length === 0 || reason.length >= 500) {
    throw new HttpsError('invalid-argument', 'reason is required (1..500 chars)');
  }
  const db = firestoreDb();
  const adminUid = request.auth.uid;

  if (authorId === adminUid) {
    throw new HttpsError('failed-precondition', 'Cannot ban yourself');
  }

  try {
    // 1) 打 ban 标到 users/{authorId}。用 set merge 而不是 update，防止
    //    目标用户 doc 还没存在（比如只在 auth 里有记录）时 update 报 not-found。
    await db.collection('users').doc(authorId).set(
      {
        isBanned: true,
        bannedAt: FieldValue.serverTimestamp(),
        bannedBy: adminUid,
        bannedReason: reason,
      },
      { merge: true }
    );

    // 2) 批量拒掉所有 pending。用 chunked batch（firestore 单 batch 上限 500 writes）。
    const pendingSnap = await db
      .collection('slang_meanings')
      .where('authorId', '==', authorId)
      .where('status', '==', 'pending')
      .limit(BAN_PENDING_BATCH_CAP + 1) // +1 用来检测是否被截断
      .get();

    const truncated = pendingSnap.size > BAN_PENDING_BATCH_CAP;
    const docs = truncated ? pendingSnap.docs.slice(0, BAN_PENDING_BATCH_CAP) : pendingSnap.docs;

    let affectedMeanings = 0;
    // 每 400 条一批，审计日志也一起写进同 batch 能降低 round trip。
    // 400 是保守上限：每条 meaning 一个 update + 一个 audit create = 2 writes/条，
    // 400 * 2 = 800 > 500 会超。所以按 200 条/批拆。
    const BATCH_SIZE = 200;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const slice = docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const d of slice) {
        batch.update(d.ref, {
          status: 'rejected',
          rejectionReason: 'Author banned',
          rejectedAt: FieldValue.serverTimestamp(),
          rejectedBy: adminUid,
        });
        const auditRef = db.collection(AUDIT_COLLECTION).doc();
        batch.set(auditRef, {
          action: 'reject',
          meaningId: d.id,
          authorId,
          reason: 'Author banned',
          adminUid,
          at: FieldValue.serverTimestamp(),
          sourceAction: 'ban_author',
        });
      }
      await batch.commit();
      affectedMeanings += slice.length;
    }

    // 3) ban 动作本身的 summary audit
    await db.collection(AUDIT_COLLECTION).add({
      action: 'ban_author',
      authorId,
      reason,
      affectedMeaningsCount: affectedMeanings,
      truncated,
      adminUid,
      at: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      affectedMeanings,
      truncated,
    };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('banAuthor failed:', e);
    throw new HttpsError('internal', e.message || 'ban failed');
  }
});

/**
 * unbanAuthor — 解除封禁
 * 只清除 isBanned 标记，不自动恢复之前被 ban 拒掉的 meanings（那些 meanings
 * 被明确拒绝过，恢复要单独走 approve 流程，避免"解封后历史垃圾一夜之间涌回"）。
 */
exports.unbanAuthor = onCall({ cors: false }, async (request) => {
  await assertAdmin(request);
  const { authorId } = request.data || {};
  if (!authorId || typeof authorId !== 'string') {
    throw new HttpsError('invalid-argument', 'authorId is required');
  }
  const db = firestoreDb();
  const adminUid = request.auth.uid;
  try {
    const userRef = db.collection('users').doc(authorId);
    const snap = await userRef.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', `user ${authorId} not found`);
    }
    const before = snap.data() || {};
    if (!before.isBanned) {
      throw new HttpsError('failed-precondition', 'User is not currently banned');
    }
    await userRef.set(
      {
        isBanned: false,
        unbannedAt: FieldValue.serverTimestamp(),
        unbannedBy: adminUid,
        // 保留 bannedReason / bannedAt / bannedBy 作为历史记录，方便后续追查
      },
      { merge: true }
    );
    await db.collection(AUDIT_COLLECTION).add({
      action: 'unban_author',
      authorId,
      previousReason: before.bannedReason || '',
      adminUid,
      at: FieldValue.serverTimestamp(),
    });
    return { success: true };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('unbanAuthor failed:', e);
    throw new HttpsError('internal', e.message || 'unban failed');
  }
});

/**
 * syncContributionStats — 用户自己不能写的敏感字段（reputationScore /
 * approvedSlangCount / 惩罚计数）统一通过这个 CF 走 admin SDK 写入。
 *
 * 客户端侧：提交词条成功后，把"应该怎么变"的 delta 传过来（而不是传目标值，
 * 防止被串改成超大值）。服务端重新读当前值 + 加 delta + 写回，保持 client
 * 不持有任意写权限。
 *
 * 调用者 = 作者本人（不是 admin）；所以不用 assertAdmin，但要校验 uid 必须
 * 等于 request.auth.uid。
 */
exports.syncContributionStats = onCall({ cors: false }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = request.auth.uid;
  const {
    action,         // 'contribute_success' | 'contribute_violation'
    violationLevel, // 'L1' | 'V1' | 'V2' | 'V3'（仅 violation）
  } = request.data || {};
  if (action !== 'contribute_success' && action !== 'contribute_violation') {
    throw new HttpsError('invalid-argument', 'Invalid action');
  }
  const db = firestoreDb();
  const userRef = db.collection('users').doc(uid);
  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError('not-found', 'User doc not found');
      const data = snap.data() || {};
      // 已被封禁的用户，任何贡献相关的 sync 都拒绝
      if (data.isBanned === true) {
        throw new HttpsError('permission-denied', 'User is banned');
      }

      const updates = {};

      if (action === 'contribute_success') {
        updates.approvedSlangCount = (data.approvedSlangCount || 0) + 1;
      } else if (action === 'contribute_violation') {
        // 按 SlangDictionary.tsx 原有的惩罚规则移过来
        if (violationLevel === 'L1') {
          const newL1 = (data.l1PenaltyCount || 0) + 1;
          updates.l1PenaltyCount = newL1;
          if (newL1 >= 5) {
            updates.l3PenaltyActive = true;
            updates.currentStreak = 0;
          } else if (newL1 >= 3) {
            updates.l2PenaltyUntil = admin.firestore.Timestamp.fromMillis(
              Date.now() + 48 * 3600 * 1000
            );
          }
        } else if (violationLevel === 'V1') {
          updates.currentStreak = 0;
          updates.vPenaltyLevel = Math.max(data.vPenaltyLevel || 0, 1);
          updates.reputationScore = Math.max(0, (data.reputationScore || 100) - 5);
        } else if (violationLevel === 'V2') {
          updates.vPenaltyLevel = Math.max(data.vPenaltyLevel || 0, 2);
          updates.reputationScore = Math.max(0, (data.reputationScore || 100) - 20);
        } else if (violationLevel === 'V3') {
          updates.vPenaltyLevel = 3;
          updates.reputationScore = 0;
        } else {
          throw new HttpsError('invalid-argument', 'Invalid violationLevel');
        }
      }

      tx.update(userRef, updates);
      return { action, violationLevel: violationLevel || null, updates };
    });

    // 审计
    await db.collection(AUDIT_COLLECTION).add({
      action: 'sync_contribution_stats',
      uid,
      subAction: action,
      violationLevel: violationLevel || null,
      at: FieldValue.serverTimestamp(),
    }).catch(() => {});

    return { success: true, ...result };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('syncContributionStats failed:', e);
    throw new HttpsError('internal', e.message || 'sync failed');
  }
});

exports.dismissReport = onCall({ cors: false }, async (request) => {
  await assertAdmin(request);
  const { reportId } = request.data || {};
  if (!reportId || typeof reportId !== 'string') {
    throw new HttpsError('invalid-argument', 'reportId is required');
  }
  const db = firestoreDb();
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.collection('slang_reports').doc(reportId);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError('not-found', `report ${reportId} not found`);
      }
      tx.update(ref, {
        status: 'dismissed',
        dismissedAt: FieldValue.serverTimestamp(),
        dismissedBy: request.auth.uid,
      });
      const auditRef = db.collection(AUDIT_COLLECTION).doc();
      tx.set(auditRef, {
        action: 'dismiss_report',
        reportId,
        adminUid: request.auth.uid,
        at: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true, reportId };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('dismissReport failed:', e);
    throw new HttpsError('internal', e.message || 'dismiss failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 数据修复 Repair tab — scanDataIssues + repairDataIssues
//
// 现状：AdminPanel 的 Repair tab 一直是 Placeholder，admin 想知道数据库
//       有没有孤儿 meaning、重复 term、缺 authorId、缺 qualityScore 只能
//       自己写脚本跑。
// 修后：admin 面板点一下"扫描数据问题"就能看到四类问题各有多少条，
//       每类对应一个"一键修复"按钮。所有修复写 admin_audit_log 留痕。
// 不修后果：数据健康靠手工盯，脏数据越积越多，线上出 bug 只能被动救火。
//
// 两个 callable 都是 admin-only：
//   - scanDataIssues 只读扫描，上限 5000 条 meaning（单次 callable 超时边界）。
//   - repairDataIssues 四种 action 之一（delete_orphans / merge_duplicates /
//     backfill_quality / delete_missing_author），每个 id 一个独立 transaction，
//     单次最多 500 条避免长任务超时。
// ─────────────────────────────────────────────────────────────────────────

const MAX_SCAN_MEANINGS = 5000;
const MAX_REPAIR_PER_CALL = 500;

async function scanIssues(db) {
  // Pass 1：把 slangs 全集合拉出来，建 id set + term(lower) 分组
  const slangsSnap = await db.collection('slangs').get();
  const slangIdSet = new Set();
  const termMap = new Map(); // termLower -> Array<{ id, createdAtMs }>
  slangsSnap.forEach((doc) => {
    slangIdSet.add(doc.id);
    const data = doc.data() || {};
    const term = typeof data.term === 'string' ? data.term.trim() : '';
    if (!term) return;
    const key = term.toLowerCase();
    const createdAtMs = data.createdAt && typeof data.createdAt.toMillis === 'function'
      ? data.createdAt.toMillis()
      : 0;
    if (!termMap.has(key)) termMap.set(key, []);
    termMap.get(key).push({ id: doc.id, createdAtMs });
  });

  const duplicateTerms = [];
  for (const [key, docs] of termMap.entries()) {
    if (docs.length > 1) {
      duplicateTerms.push({
        term: key,
        // 按 createdAt 升序，最早的在前（合并时默认保留最早那条）
        docIds: docs
          .slice()
          .sort((a, b) => a.createdAtMs - b.createdAtMs)
          .map((d) => d.id),
      });
    }
  }

  // Pass 2：扫 meanings，查三类问题
  const meaningsSnap = await db.collection('slang_meanings').limit(MAX_SCAN_MEANINGS).get();
  const orphanMeanings = [];
  const missingAuthor = [];
  const missingQualityScore = [];
  meaningsSnap.forEach((doc) => {
    const data = doc.data() || {};
    const meaningText = typeof data.meaning === 'string' ? data.meaning : '';
    const preview = meaningText.slice(0, 60);
    const slangId = data.slangId || '';
    if (slangId && !slangIdSet.has(slangId)) {
      orphanMeanings.push({ meaningId: doc.id, slangId, meaning: preview });
    }
    const authorId = data.authorId;
    if (!authorId || (typeof authorId === 'string' && authorId.trim() === '')) {
      missingAuthor.push({ meaningId: doc.id, slangId, meaning: preview });
    }
    if (data.qualityScore === undefined || data.qualityScore === null) {
      missingQualityScore.push({ meaningId: doc.id, slangId });
    }
  });

  return {
    orphanMeanings,
    duplicateTerms,
    missingAuthor,
    missingQualityScore,
    totals: {
      slangs: slangsSnap.size,
      meanings: meaningsSnap.size,
    },
    truncated: meaningsSnap.size >= MAX_SCAN_MEANINGS,
    scannedAt: Date.now(),
  };
}

exports.scanDataIssues = onCall({ cors: false, timeoutSeconds: 120 }, async (request) => {
  await assertAdmin(request);
  const db = firestoreDb();
  try {
    const result = await scanIssues(db);
    // 扫描是只读但仍写审计：知道谁在什么时刻看过数据健康面板。
    await db.collection(AUDIT_COLLECTION).add({
      action: 'scan_data_issues',
      totals: result.totals,
      orphanCount: result.orphanMeanings.length,
      dupCount: result.duplicateTerms.length,
      missingAuthorCount: result.missingAuthor.length,
      missingQualityCount: result.missingQualityScore.length,
      truncated: result.truncated,
      adminUid: request.auth.uid,
      at: FieldValue.serverTimestamp(),
    });
    return result;
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('scanDataIssues failed:', e);
    throw new HttpsError('internal', e.message || 'scan failed');
  }
});

// 四个修复 worker — 返回 { processed, failed[] }。单条失败不中断整批，
// 原因塞到 failed 里回传前端。

async function repairDeleteOrphans(db, targetIds) {
  const failed = [];
  let processed = 0;
  // Tx 内再查一次 slang 是否真不存在 —— 防止客户端 id 过期误删健康 meaning。
  for (const meaningId of targetIds) {
    try {
      await db.runTransaction(async (tx) => {
        const ref = db.collection('slang_meanings').doc(meaningId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('meaning not found');
        const data = snap.data() || {};
        const slangId = data.slangId || '';
        if (slangId) {
          const slangSnap = await tx.get(db.collection('slangs').doc(slangId));
          if (slangSnap.exists) throw new Error('slang exists — not an orphan');
        }
        tx.delete(ref);
      });
      processed += 1;
    } catch (e) {
      failed.push({ id: meaningId, reason: e.message || 'failed' });
    }
  }
  return { processed, failed };
}

async function repairBackfillQuality(db, targetIds) {
  const failed = [];
  let processed = 0;
  for (const meaningId of targetIds) {
    try {
      await db.runTransaction(async (tx) => {
        const ref = db.collection('slang_meanings').doc(meaningId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('meaning not found');
        const data = snap.data() || {};
        // 已有分数就跳过 —— 即使是低分也尊重它（避免覆盖掉低质评分）
        if (data.qualityScore !== undefined && data.qualityScore !== null) {
          return;
        }
        tx.update(ref, {
          qualityScore: 70,
          qualityScoreBackfilledAt: FieldValue.serverTimestamp(),
        });
      });
      processed += 1;
    } catch (e) {
      failed.push({ id: meaningId, reason: e.message || 'failed' });
    }
  }
  return { processed, failed };
}

async function repairDeleteMissingAuthor(db, targetIds) {
  const failed = [];
  let processed = 0;
  for (const meaningId of targetIds) {
    try {
      await db.runTransaction(async (tx) => {
        const ref = db.collection('slang_meanings').doc(meaningId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('meaning not found');
        const data = snap.data() || {};
        const authorId = data.authorId;
        if (authorId && typeof authorId === 'string' && authorId.trim() !== '') {
          throw new Error('author present — skipping');
        }
        tx.delete(ref);
      });
      processed += 1;
    } catch (e) {
      failed.push({ id: meaningId, reason: e.message || 'failed' });
    }
  }
  return { processed, failed };
}

// 合并重复 term：每组是一堆 slangId，大小写不敏感共享 term。保留 createdAt
// 最早的 slang doc，把所有指向 loser 的 meaning 改指向 keeper，然后删 loser。
// 每组一个 transaction；group 超 450 writes 时跳过（Firestore 单 tx 上限 500）。
async function repairMergeDuplicates(db, targetGroups) {
  const failed = [];
  let processed = 0;
  for (const group of targetGroups) {
    try {
      if (!group.docIds || group.docIds.length < 2) {
        throw new Error('group needs >=2 docs');
      }
      // 重新 fetch slangs —— 客户端传来的顺序可能过时
      const snaps = await Promise.all(
        group.docIds.map((id) => db.collection('slangs').doc(id).get())
      );
      const live = snaps
        .filter((s) => s.exists)
        .map((s) => {
          const d = s.data() || {};
          const ms = d.createdAt && typeof d.createdAt.toMillis === 'function'
            ? d.createdAt.toMillis()
            : 0;
          return { id: s.id, createdAtMs: ms };
        });
      if (live.length < 2) throw new Error('not enough live docs');
      live.sort((a, b) => a.createdAtMs - b.createdAtMs);
      const keepId = live[0].id;
      const loserIds = live.slice(1).map((x) => x.id);

      // 查所有指向 loser 的 meaning —— Firestore `in` 一次最多 10，分 chunk
      const loserChunks = [];
      for (let i = 0; i < loserIds.length; i += 10) {
        loserChunks.push(loserIds.slice(i, i + 10));
      }
      const meaningDocsToRepoint = [];
      for (const chunk of loserChunks) {
        const qs = await db
          .collection('slang_meanings')
          .where('slangId', 'in', chunk)
          .get();
        qs.forEach((d) => meaningDocsToRepoint.push(d.id));
      }

      const writes = meaningDocsToRepoint.length + loserIds.length;
      if (writes > 450) {
        throw new Error(`group too large (${writes} writes) — handle manually`);
      }

      await db.runTransaction(async (tx) => {
        for (const mId of meaningDocsToRepoint) {
          tx.update(db.collection('slang_meanings').doc(mId), { slangId: keepId });
        }
        for (const lId of loserIds) {
          tx.delete(db.collection('slangs').doc(lId));
        }
      });
      processed += 1;
    } catch (e) {
      failed.push({
        id: group.term || (group.docIds || []).join(','),
        reason: e.message || 'failed',
      });
    }
  }
  return { processed, failed };
}

exports.repairDataIssues = onCall({ cors: false, timeoutSeconds: 300 }, async (request) => {
  await assertAdmin(request);
  const { action, ids, groups } = request.data || {};
  const adminUid = request.auth.uid;
  const db = firestoreDb();

  const KNOWN = new Set([
    'delete_orphans',
    'merge_duplicates',
    'backfill_quality',
    'delete_missing_author',
  ]);
  if (!KNOWN.has(action)) {
    throw new HttpsError('invalid-argument', `unknown action: ${action}`);
  }

  try {
    // 没传 ids/groups 就现扫一遍，取前 MAX_REPAIR_PER_CALL 条
    let scan = null;
    if (!ids && !groups) {
      scan = await scanIssues(db);
    }

    let result = { processed: 0, failed: [] };

    if (action === 'delete_orphans') {
      const targetIds = Array.isArray(ids) && ids.length
        ? ids.slice(0, MAX_REPAIR_PER_CALL)
        : (scan ? scan.orphanMeanings.map((o) => o.meaningId).slice(0, MAX_REPAIR_PER_CALL) : []);
      result = await repairDeleteOrphans(db, targetIds);
    } else if (action === 'backfill_quality') {
      const targetIds = Array.isArray(ids) && ids.length
        ? ids.slice(0, MAX_REPAIR_PER_CALL)
        : (scan ? scan.missingQualityScore.map((o) => o.meaningId).slice(0, MAX_REPAIR_PER_CALL) : []);
      result = await repairBackfillQuality(db, targetIds);
    } else if (action === 'delete_missing_author') {
      const targetIds = Array.isArray(ids) && ids.length
        ? ids.slice(0, MAX_REPAIR_PER_CALL)
        : (scan ? scan.missingAuthor.map((o) => o.meaningId).slice(0, MAX_REPAIR_PER_CALL) : []);
      result = await repairDeleteMissingAuthor(db, targetIds);
    } else if (action === 'merge_duplicates') {
      const targetGroups = Array.isArray(groups) && groups.length
        ? groups
        : (scan ? scan.duplicateTerms : []);
      result = await repairMergeDuplicates(db, targetGroups);
    }

    await db.collection(AUDIT_COLLECTION).add({
      action: `repair_${action}`,
      ids: Array.isArray(ids) ? ids.slice(0, 100) : null,
      groupCount: Array.isArray(groups) ? groups.length : null,
      processed: result.processed,
      failedCount: result.failed.length,
      adminUid,
      at: FieldValue.serverTimestamp(),
    });

    return {
      processed: result.processed,
      failed: result.failed,
    };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('repairDataIssues failed:', e);
    throw new HttpsError('internal', e.message || 'repair failed');
  }
});
