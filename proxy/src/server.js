/**
 * memeflow Deepgram WebSocket relay.
 *
 * 浏览器到 Deepgram 之间的 WebSocket 中转。给两边各开一条连接，把音频
 * 包从浏览器侧搬到 Deepgram，再把 Deepgram 的转录结果搬回浏览器。
 *
 * 为什么要搬一道：
 *   1. 浏览器到 Deepgram 直连跑在用户家网上，抖一下就丢音频。中间塞
 *      一台云端服务器后，"服务器到 Deepgram"这段跑在 Google 骨干
 *      网上几乎不会抖；用户网抖时我们这边能缓冲。
 *   2. 真正的杀手锏：缓冲 + 重连补送。我们把每个客户端最近 30 秒的
 *      PCM 音频压成环形 buffer，Deepgram 那边一旦断了我们自动重连，
 *      然后把"断的瞬间到重连成功"那段缓冲音频重新喂回去 —— 浏览器
 *      端完全不知道发生了什么，转录也不漏字。
 *   3. Deepgram 真 key 留在服务器上，浏览器永远拿不到。
 *
 * 鉴权：浏览器连进来时把 Firebase ID token 放在 Sec-WebSocket-Protocol
 * 子协议里（浏览器原生 WebSocket 不让设 Authorization 头），我们用
 * firebase-admin 校验，过了再给桥接 Deepgram。
 *
 * 部署：Cloud Run，单容器单 Node 进程，每个客户端一条逻辑连接。
 */

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const admin = require('firebase-admin');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

// ─── 启动配置 ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 8080;
// Secret Manager 里的 key 末尾常常带换行/空白，直接当 HTTP header 用会让
// Node.js 抛 ERR_INVALID_CHAR 把进程整个炸掉（看到过整页 stack trace 才
// 反应过来）。这里强制 trim 掉，安全又便宜。
const DEEPGRAM_API_KEY = (process.env.DEEPGRAM_API_KEY || '').trim();
const ALLOWED_ORIGINS_RAW = (process.env.ALLOWED_ORIGINS ||
  'https://memeflow-16ecf.web.app,https://memeflow-16ecf.firebaseapp.com,http://localhost:3000,http://localhost:5173'
).split(',').map((s) => s.trim()).filter(Boolean);

// 把 ALLOWED_ORIGINS 拆成精确匹配 + 后缀匹配两类。
// 一个 entry 以 "*." 开头则视为后缀匹配（Firebase preview channel 用），
// 比如 "*.web.app" 能放行 https://memeflow-16ecf--preview-xxx.web.app。
// 实际部署只在白名单里写明确的项目级前缀（避免误开放给别人的 firebase 项目）。
const ALLOWED_ORIGIN_EXACT = new Set();
const ALLOWED_ORIGIN_PREFIX = []; // [{scheme, suffix}] 数组
for (const o of ALLOWED_ORIGINS_RAW) {
  // 支持简易前缀通配：例如 'https://memeflow-16ecf--*.web.app' →
  // 任何 'https://memeflow-16ecf--' 开头并以 '.web.app' 结尾的 origin 都放行
  const star = o.indexOf('*');
  if (star === -1) {
    ALLOWED_ORIGIN_EXACT.add(o);
  } else {
    ALLOWED_ORIGIN_PREFIX.push({ prefix: o.slice(0, star), suffix: o.slice(star + 1) });
  }
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGIN_EXACT.has(origin)) return true;
  for (const { prefix, suffix } of ALLOWED_ORIGIN_PREFIX) {
    if (origin.startsWith(prefix) && origin.endsWith(suffix) && origin.length > prefix.length + suffix.length) {
      return true;
    }
  }
  return false;
}

if (!DEEPGRAM_API_KEY) {
  console.error('[proxy] FATAL: DEEPGRAM_API_KEY env var missing');
  process.exit(1);
}

// firebase-admin 在 Cloud Run 上跑会自动用 metadata server 拿身份。
// 本地跑时需要 GOOGLE_APPLICATION_CREDENTIALS 指向一个 service account
// JSON。projectId 我们直接写死，省得 ADC 找不到的时候报模糊错。
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'memeflow-16ecf' });
}

// ─── 单连接的环形音频缓冲 ────────────────────────────────────────────────

const SAMPLE_RATE = 16000;          // 跟前端 worklet 输出对齐
const BYTES_PER_SAMPLE = 2;          // linear16
const BUFFER_SECONDS = 30;
const RING_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * BUFFER_SECONDS;

class AudioRing {
  constructor() {
    this.buf = Buffer.allocUnsafe(RING_BYTES);
    this.write = 0;
    this.filled = false;
    // 自纪元起的"已经写过的字节总数" —— 用于在重连补送时，
    // 知道断点之前是哪个绝对位置，从而切出"断点到当前"的窗口。
    this.bytesEver = 0;
  }
  push(chunk) {
    let written = 0;
    while (written < chunk.length) {
      const space = this.buf.length - this.write;
      const toWrite = Math.min(space, chunk.length - written);
      chunk.copy(this.buf, this.write, written, written + toWrite);
      this.write += toWrite;
      written += toWrite;
      if (this.write >= this.buf.length) {
        this.write = 0;
        this.filled = true;
      }
    }
    this.bytesEver += chunk.length;
  }
  // 返回从 absoluteByteOffset 之后到现在的所有字节。如果太久远（已经被
  // 环形覆盖掉），返回我们手上还能给的最早的字节。
  sliceFrom(absoluteByteOffset) {
    const oldest = Math.max(0, this.bytesEver - (this.filled ? this.buf.length : this.write));
    const start = Math.max(absoluteByteOffset, oldest);
    const wantedBytes = this.bytesEver - start;
    if (wantedBytes <= 0) return Buffer.alloc(0);

    if (!this.filled) {
      // 缓冲区还没绕过一圈，bytesEver === this.write，直接读 [write-N, write)
      return Buffer.from(this.buf.slice(this.write - wantedBytes, this.write));
    }
    const startInRing = (this.write + this.buf.length - wantedBytes) % this.buf.length;
    if (startInRing + wantedBytes <= this.buf.length) {
      return Buffer.from(this.buf.slice(startInRing, startInRing + wantedBytes));
    }
    const out = Buffer.allocUnsafe(wantedBytes);
    const firstChunk = this.buf.length - startInRing;
    this.buf.copy(out, 0, startInRing, this.buf.length);
    this.buf.copy(out, firstChunk, 0, wantedBytes - firstChunk);
    return out;
  }
}

// ─── 单个客户端会话 ─────────────────────────────────────────────────────

class Session {
  constructor(clientWs, uid, dgOpts) {
    this.clientWs = clientWs;
    this.uid = uid;
    this.dgOpts = dgOpts;
    this.ring = new AudioRing();
    this.deepgramConn = null;
    this.deepgramReady = false;
    this.closed = false;
    this.reconnectAttempts = 0;
    this.lastDeepgramByteOffset = 0;
    // 待发的音频队列：Deepgram 还没 ready 时（首次连接 + 重连）暂存
    this.pendingChunks = [];
    this.keepAliveTimer = null;
    this.startedAt = Date.now();
  }

  start() {
    this.openDeepgram();
    this.keepAliveTimer = setInterval(() => {
      if (!this.deepgramConn || !this.deepgramReady) return;
      try {
        // Deepgram 协议：每 ≤10s 发一次 KeepAlive 防 NET-0001。
        this.deepgramConn.send(JSON.stringify({ type: 'KeepAlive' }));
      } catch { /* 下个 tick 重试 */ }
    }, 5000);
  }

  openDeepgram() {
    const dg = createClient(DEEPGRAM_API_KEY);
    let conn;
    try {
      conn = dg.listen.live(this.dgOpts);
    } catch (e) {
      console.warn(`[session ${this.uid}] deepgram create failed:`, e.message);
      this.scheduleReconnect();
      return;
    }
    this.deepgramConn = conn;
    this.deepgramReady = false;

    conn.on(LiveTranscriptionEvents.Open, () => {
      this.deepgramReady = true;
      this.reconnectAttempts = 0;
      console.info(`[session ${this.uid}] deepgram open`);

      // 关键：补送"断点之前 → 现在"那段缓冲音频。第一次连接时
      // lastDeepgramByteOffset === 0，bytesEver 也基本是 0，所以
      // 不会发任何东西。重连时这段就是"漏字救援包"。
      const replay = this.ring.sliceFrom(this.lastDeepgramByteOffset);
      if (replay.length > 0) {
        console.info(`[session ${this.uid}] replaying ${replay.length} bytes after reconnect`);
        try { conn.send(replay); } catch (e) {
          console.warn(`[session ${this.uid}] replay send failed:`, e.message);
        }
      }
      // 把暂存到 pendingChunks 的"重连期间收到的新音频"也清空
      while (this.pendingChunks.length > 0) {
        const c = this.pendingChunks.shift();
        try { conn.send(c); } catch { /* drop */ }
      }
      this.lastDeepgramByteOffset = this.ring.bytesEver;

      // 通知前端：已连上 Deepgram。前端按这个事件把 UI 翻到 'live'。
      this.sendToClient({ type: 'proxy_status', status: 'live' });
    });

    conn.on(LiveTranscriptionEvents.Transcript, (data) => {
      this.sendToClient({ type: 'Results', ...data });
    });
    conn.on(LiveTranscriptionEvents.UtteranceEnd, (data) => {
      this.sendToClient({ type: 'UtteranceEnd', ...data });
    });
    conn.on(LiveTranscriptionEvents.SpeechStarted, (data) => {
      this.sendToClient({ type: 'SpeechStarted', ...data });
    });
    conn.on(LiveTranscriptionEvents.Metadata, (data) => {
      this.sendToClient({ type: 'Metadata', ...data });
    });
    conn.on(LiveTranscriptionEvents.Close, (ev) => {
      console.warn(`[session ${this.uid}] deepgram close code=${ev?.code} reason=${ev?.reason}`);
      this.deepgramReady = false;
      if (!this.closed) this.scheduleReconnect();
    });
    conn.on(LiveTranscriptionEvents.Error, (err) => {
      console.error(`[session ${this.uid}] deepgram error:`, err?.message || err);
    });
  }

  scheduleReconnect() {
    if (this.closed) return;
    this.deepgramReady = false;
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > 5) {
      console.error(`[session ${this.uid}] giving up after 5 reconnects`);
      this.sendToClient({ type: 'proxy_status', status: 'error', detail: 'deepgram_unreachable' });
      this.close();
      return;
    }
    const delay = Math.min(500 * Math.pow(2, this.reconnectAttempts - 1), 8000);
    console.info(`[session ${this.uid}] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => {
      if (this.closed) return;
      this.openDeepgram();
    }, delay);
  }

  pushAudio(buf) {
    // 永远先写本地环形缓冲，再决定能否发 Deepgram。
    // 这样无论 Deepgram 是否就绪，客户端给的音频都不会丢。
    this.ring.push(buf);
    if (this.deepgramConn && this.deepgramReady) {
      try {
        this.deepgramConn.send(buf);
        this.lastDeepgramByteOffset = this.ring.bytesEver;
      } catch (e) {
        // 发送失败 = socket 死了。先暂存，等 Open 时一起发。
        this.pendingChunks.push(Buffer.from(buf));
      }
    } else {
      this.pendingChunks.push(Buffer.from(buf));
      // 别让重连慢的时候内存爆掉：超过 30s 的 pending 直接丢
      // （反正缓冲 ring 里也存着，重连后会 sliceFrom 全部补回去）
      const maxPending = SAMPLE_RATE * BYTES_PER_SAMPLE * BUFFER_SECONDS;
      let total = 0;
      for (const c of this.pendingChunks) total += c.length;
      while (total > maxPending && this.pendingChunks.length > 1) {
        const dropped = this.pendingChunks.shift();
        total -= dropped.length;
      }
    }
  }

  sendToClient(obj) {
    if (this.clientWs.readyState !== WebSocket.OPEN) return;
    try {
      this.clientWs.send(JSON.stringify(obj));
    } catch { /* 客户端可能正在关闭，忽略 */ }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    try { this.deepgramConn?.requestClose(); } catch { /* nothing */ }
    try { this.clientWs.close(1000, 'session closed'); } catch { /* nothing */ }
    const seconds = Math.round((Date.now() - this.startedAt) / 1000);
    console.info(`[session ${this.uid}] closed after ${seconds}s, ${this.ring.bytesEver} bytes`);
  }
}

// ─── HTTP/WS 服务器 ─────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  // Origin 白名单
  const origin = req.headers.origin || '';
  if (!isOriginAllowed(origin)) {
    console.warn(`[upgrade] reject bad origin: ${origin}`);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  // 浏览器 WebSocket 不能塞自定义 header，约定把 Firebase ID token 放
  // 在 Sec-WebSocket-Protocol 里：第一个子协议固定是 "memeflow.v1"，
  // 第二个是 "token.<ID_TOKEN>"。服务器 echo 第一个子协议。
  const protoHeader = req.headers['sec-websocket-protocol'] || '';
  const protos = protoHeader.split(',').map((s) => s.trim());
  const tokenProto = protos.find((p) => p.startsWith('token.'));
  if (!tokenProto || !protos.includes('memeflow.v1')) {
    console.warn('[upgrade] missing protocols:', protos);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  const idToken = tokenProto.slice('token.'.length);
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    console.warn('[upgrade] bad firebase token:', e.message);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // URL 上 query string 里读 Deepgram 配置（model / keyterm / 课程名等）
  const url = new URL(req.url, `http://${req.headers.host}`);
  const dgOpts = {
    model: url.searchParams.get('model') || 'nova-3',
    language: url.searchParams.get('language') || 'en-US',
    encoding: 'linear16',
    sample_rate: SAMPLE_RATE,
    channels: 1,
    interim_results: true,
    smart_format: true,
    endpointing: parseInt(url.searchParams.get('endpointing') || '1500', 10),
    utterance_end_ms: parseInt(url.searchParams.get('utterance_end_ms') || '2000', 10),
    vad_events: true,
    punctuate: true,
  };
  const keytermsRaw = url.searchParams.get('keyterm');
  if (keytermsRaw) {
    dgOpts.keyterm = keytermsRaw.split('|').slice(0, 50);
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, decoded, dgOpts);
  });
});

wss.on('connection', (ws, req, decoded, dgOpts) => {
  const uid = decoded.uid;
  console.info(`[connection] uid=${uid} from ${req.socket.remoteAddress}`);

  const session = new Session(ws, uid, dgOpts);

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      // PCM 音频
      session.pushAudio(Buffer.isBuffer(data) ? data : Buffer.from(data));
      return;
    }
    // 文本帧（控制消息）
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'KeepAlive') {
        // 客户端心跳，无需做事，连接活着就够了。
        return;
      }
      if (msg.type === 'CloseStream') {
        // 客户端要 finalize：把 buffer 里所有东西吐出来，不关连接
        try {
          session.deepgramConn?.send(JSON.stringify({ type: 'CloseStream' }));
        } catch { /* nothing */ }
        return;
      }
    } catch { /* 不是 JSON，忽略 */ }
  });

  ws.on('close', () => {
    console.info(`[connection] uid=${uid} closed by client`);
    session.close();
  });
  ws.on('error', (e) => {
    console.warn(`[connection] uid=${uid} ws error:`, e.message);
    session.close();
  });

  session.start();
});

server.listen(PORT, () => {
  console.info(`[proxy] listening on :${PORT}, allowed origins=${ALLOWED_ORIGINS_RAW.join(',')}`);
});

// 优雅关停 —— Cloud Run 给 SIGTERM 后有 10s 排空时间
process.on('SIGTERM', () => {
  console.info('[proxy] SIGTERM, draining…');
  server.close(() => process.exit(0));
});
