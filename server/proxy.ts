import express from 'express';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const app = express();
app.use(express.json({ limit: '10mb' }));

// Server-side rate limiting per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per minute per IP
const RATE_WINDOW = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000);

app.post('/api/generate', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { model, contents, config, stream } = req.body;

    if (!model || !contents) {
      return res.status(400).json({ error: 'Missing required fields: model, contents' });
    }

    // Streaming branch — dev-only mirror of the production Firebase Function
    // behavior. Proxy Gemini's SSE stream straight through so translateSimple
    // renders a typewriter effect locally.
    if (stream) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: config }),
      });
      if (!upstream.ok || !upstream.body) {
        const errBody = await upstream.json().catch(() => ({}));
        return res.status(upstream.status || 502).json({ error: errBody.error?.message || `Gemini stream error: ${upstream.status}` });
      }
      res.status(200);
      res.set('Content-Type', 'text/event-stream');
      res.set('Cache-Control', 'no-cache');
      res.set('X-Accel-Buffering', 'no');
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } finally {
        res.end();
      }
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: config }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errBody.error?.message || `Gemini API error: ${response.status}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('Proxy error:', error.message);
    if (!res.headersSent) res.status(500).json({ error: error.message });
    else res.end();
  }
});

// Live token minting — dev-only Deepgram Temporary Token shim. Mirrors
// the prod Firebase Function minus the Firebase Auth check (localhost is
// trusted). Requires DEEPGRAM_API_KEY in the dev env (.env or shell).
app.post('/api/live-token', async (_req, res) => {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'DEEPGRAM_API_KEY not configured' });
  try {
    const r = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      return res.status(r.status).json({ error: `Deepgram grant failed: ${r.status} ${err}` });
    }
    const data = await r.json();
    res.json({ token: data.access_token, expiresIn: data.expires_in, provider: 'deepgram' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', rateLimit: RATE_LIMIT, window: '1m' });
});

const port = parseInt(process.env.PROXY_PORT || '3100');
app.listen(port, () => {
  console.log(`API proxy running on http://localhost:${port}`);
  console.log(`Rate limit: ${RATE_LIMIT} requests/minute per IP`);
});
