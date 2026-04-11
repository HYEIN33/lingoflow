const { onRequest } = require('firebase-functions/v2/https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RATE_LIMIT = new Map(); // ip -> { count, resetAt }
const MAX_PER_MINUTE = 30;

exports.apiGenerate = onRequest(
  { cors: true, secrets: ['GEMINI_API_KEY'] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Rate limiting
    const ip = req.ip;
    const now = Date.now();
    const entry = RATE_LIMIT.get(ip) || { count: 0, resetAt: now + 60000 };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + 60000;
    }
    entry.count++;
    RATE_LIMIT.set(ip, entry);
    if (entry.count > MAX_PER_MINUTE) {
      res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
      return;
    }

    const { model, contents, config } = req.body;
    if (!model || !contents) {
      res.status(400).json({ error: 'Missing model or contents' });
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
