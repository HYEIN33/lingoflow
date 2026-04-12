const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

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

async function checkRateLimit(uid) {
  const db = admin.firestore();
  const ref = db.collection('_rate_limits').doc(uid);
  const now = admin.firestore.Timestamp.now();
  const minuteAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 60_000);
  const dayAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 86_400_000);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : { calls: [] };
    const calls = (data.calls || []).filter((t) => t.toMillis() > dayAgo.toMillis());
    const lastMinute = calls.filter((t) => t.toMillis() > minuteAgo.toMillis()).length;
    if (lastMinute >= MAX_PER_MINUTE) return { allowed: false, reason: 'minute' };
    if (calls.length >= MAX_PER_DAY) return { allowed: false, reason: 'day' };
    calls.push(now);
    // Hard cap array length so that future tuning (e.g. raising MAX_PER_DAY)
    // cannot cause unbounded document growth. Transaction atomicity guards
    // against lost updates between concurrent invocations.
    const trimmed = calls.slice(-MAX_PER_DAY);
    tx.set(ref, { calls: trimmed }, { merge: true });
    return { allowed: true };
  });
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

    // Per-uid rate limit (Firestore-backed, survives across function instances)
    //
    // FAIL-OPEN on Firestore errors. Rationale:
    // - Rate limit is a cost/abuse guardrail, not a security gate.
    // - Auth (verifyIdToken above) is the actual security gate.
    // - Gemini itself has its own daily/per-minute quota; GCP billing
    //   alerts are the cost hard stop.
    // - Previously fail-closed took the entire translate path down for
    //   all users whenever the _rate_limits collection read glitched
    //   (observed 2026-04-13: Firestore gRPC NOT_FOUND taking out /api/generate).
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
      console.error('Rate limit check failed, failing OPEN:', e);
      // fall through — allow this request; rely on Gemini quota as the
      // ultimate backstop. Monitor via GCP logs for sustained failure.
    }

    const { model, contents, config } = req.body || {};
    if (!model || !contents) {
      res.status(400).json({ error: 'Missing model or contents' });
      return;
    }
    // Whitelist models to prevent users billing expensive models
    const ALLOWED_MODELS = new Set([
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
    ]);
    if (!ALLOWED_MODELS.has(model)) {
      res.status(400).json({ error: 'Model not allowed' });
      return;
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: Array.isArray(contents) ? contents : [{ parts: [{ text: contents }] }],
            generationConfig: config || {},
          }),
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
