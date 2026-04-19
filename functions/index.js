const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

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
// Classroom live translation — ephemeral token minting for Gemini Live.
// Called by the ClassroomTab before opening the WebSocket. We hold the
// real Gemini API key on the server and hand the client a short-lived
// token scoped to one Live session. The client connects directly to
// Gemini — audio never traverses this Function, so cost scales with user
// minutes not our bandwidth.
//
// Google Cloud quota limits sit on the API key side (see Console →
// APIs & Services → Gemini API → Quotas) — we rely on those to cap
// spend. This Function only authenticates the user and mints the token.
exports.liveToken = onRequest(
  { secrets: ['GEMINI_API_KEY'], cors: false, timeoutSeconds: 30 },
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

    // Mint a v1alpha ephemeral auth token. Single use, expires in 10 min.
    // (User must start the Live session within this window; once the
    // WebSocket is open the session is independent of the token.)
    //
    // Endpoint: POST /v1alpha/auth_tokens?key=<API_KEY>
    //
    // Accepted fields are `uses` and `expire_time` ONLY — the REST schema
    // does NOT accept the `live_connect_constraints` field that appears in
    // the JS SDK's LiveEphemeralParameters type. Sending that field returns
    // HTTP 400 "Unknown name live_connect_constraints" (verified 2026-04-20).
    // Max expiry is 20h per Google's policy; we use 10 min. The tradeoff
    // of an unconstrained token is that a stolen token could open any Live
    // model, but the 10-min single-use window makes that window tiny.
    const expireTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uses: 1,
            expire_time: expireTime,
          }),
        }
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        console.error('liveToken mint failed:', err);
        res.status(r.status).json({ error: err.error?.message || 'Token mint failed' });
        return;
      }
      const payload = await r.json();
      // `name` is the token string the client uses as its API key for Live.
      res.json({
        token: payload.name,
        expireTime,
        model: 'gemini-2.0-flash-live-001',
      });
    } catch (e) {
      console.error('liveToken error:', e);
      res.status(500).json({ error: e.message || 'Internal error' });
    }
  }
);
