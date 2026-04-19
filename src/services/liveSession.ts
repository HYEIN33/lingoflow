/**
 * Classroom live-translation session — Gemini Live client.
 *
 * Flow:
 *   1. callsite picks an audio source (mic or tab capture) and calls startSession()
 *   2. we fetch an ephemeral token from /liveToken (short-lived, single-use)
 *   3. open a WebSocket to Gemini Live with that token as the API key
 *   4. AudioWorklet consumes the MediaStream, emits 16 kHz PCM16 chunks
 *   5. we stream those chunks to Gemini as realtime_input
 *   6. Gemini emits transcription + translation deltas; we route them to
 *      the UI via the onPartial / onFinal callbacks
 *
 * Design intentionally keeps state machine explicit so UI can render
 * connection status. The Spike does NOT implement reconnection — if the
 * socket drops, the UI tells the user to hit start again. That's fine for
 * a 48h validation experiment; reconnection logic is v0.3.1+.
 */

import { auth } from '../firebase';

type SessionStatus =
  | 'idle'
  | 'requesting-token'
  | 'connecting'
  | 'live'
  | 'stopped'
  | 'error';

export interface LiveSessionCallbacks {
  onStatusChange: (status: SessionStatus, detail?: string) => void;
  // Called with every text delta from Gemini. Concatenate in the UI.
  // This is the translated text — already in the user's target language.
  onTranslationDelta: (delta: string) => void;
  // Called when Gemini emits a turn-complete signal. UI can commit the
  // current partial as a finalized line and start a fresh bubble.
  onTurnComplete: () => void;
  // Original-language transcription of what the speaker said. Kept
  // separate so UI can show both the English transcript and the Chinese
  // translation in a dual-lane view.
  onTranscriptionDelta?: (delta: string) => void;
}

export interface LiveSessionOptions {
  /**
   * 'tab' → getDisplayMedia (share a Zoom/Teams tab with 'share audio' ticked)
   * 'mic' → getUserMedia (laptop microphone)
   *
   * Both return a MediaStream; we don't care which one the browser picks,
   * as long as it has an audio track.
   */
  audioSource: 'tab' | 'mic';
  /** 'tutorial' (fast, short-utterance UI) vs 'lecture' (long paragraphs). */
  mode: 'tutorial' | 'lecture';
  /** Target language for translation — Spike ships with zh-CN only. */
  targetLang?: 'zh-CN';
}

export interface LiveSessionHandle {
  stop(): Promise<void>;
  /**
   * Grabs the last N seconds of audio we've streamed. Used by the
   * "I didn't get that" button to re-translate a recent clip with the
   * heavier gemini-2.5-pro model. Returns a base64-encoded WAV.
   */
  getRecentAudio(seconds: number): string | null;
  /** Current transcript as plain text, for saving to Firestore on stop. */
  getTranscript(): string;
}

// How many seconds of recent audio we keep for the "didn't get that"
// feature. 30 covers a professor's typical thought chunk.
const RECENT_AUDIO_SECONDS = 30;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // Int16
const RECENT_BUFFER_BYTES = RECENT_AUDIO_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE;

async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

async function mintEphemeralToken(): Promise<{ token: string; model: string }> {
  const idToken = await getAuthToken();
  const res = await fetch('/api/live-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Token mint failed: ${res.status}`);
  }
  const data = await res.json();
  return { token: data.token, model: data.model };
}

async function captureAudioStream(source: 'tab' | 'mic'): Promise<MediaStream> {
  if (source === 'tab') {
    // getDisplayMedia prompts the user to share a window/tab. They MUST
    // tick "Share tab audio" in the Chrome picker — we surface a hint in
    // the UI before calling this.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // required — Chrome refuses audio-only capture
      audio: {
        // These are requests, not guarantees — browser may ignore.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    // We don't actually need the video track; drop it to save CPU.
    stream.getVideoTracks().forEach((t) => t.stop());
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('未捕获到音频 — 请在系统分享对话框里勾选“共享音频”');
    }
    return stream;
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

/**
 * Opens a Gemini Live WebSocket session and pipes mic/tab audio to it.
 * Resolves with a handle once the session is live and ready for audio;
 * rejects if token minting or WebSocket handshake fails.
 */
export async function startLiveSession(
  opts: LiveSessionOptions,
  cb: LiveSessionCallbacks
): Promise<LiveSessionHandle> {
  cb.onStatusChange('requesting-token');
  const { token, model } = await mintEphemeralToken();

  cb.onStatusChange('connecting');
  // eslint-disable-next-line no-console
  console.info('[live] capturing audio, source=', opts.audioSource);
  const mediaStream = await captureAudioStream(opts.audioSource);
  // eslint-disable-next-line no-console
  console.info('[live] got MediaStream, tracks=', mediaStream.getTracks().length);

  // Gemini Live WebSocket URL — the ephemeral token goes in as the
  // `access_token` query param in v1alpha.
  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?access_token=${encodeURIComponent(token)}`;
  // eslint-disable-next-line no-console
  console.info('[live] opening WebSocket…');
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  // Accumulate transcript on the fly so Firestore save on stop() is cheap.
  let transcript = '';
  // Ring buffer of recent PCM — for the "didn't get that" feature.
  const recentPcm = new Uint8Array(RECENT_BUFFER_BYTES);
  let recentWriteOffset = 0;
  let recentFilled = false;

  // iOS Safari sometimes rejects new AudioContext in a non-user-gesture
  // continuation. We keep it here (after getUserMedia resolved, which IS
  // part of the gesture chain) and surface errors instead of swallowing.
  // eslint-disable-next-line no-console
  console.info('[live] creating AudioContext + worklet…');
  let audioCtx: AudioContext;
  let worklet: AudioWorkletNode;
  let sourceNode: MediaStreamAudioSourceNode;
  try {
    audioCtx = new AudioContext({ sampleRate: 48000 });
    await audioCtx.audioWorklet.addModule('/audio-worklets/pcm16-worklet.js');
    sourceNode = audioCtx.createMediaStreamSource(mediaStream);
    worklet = new AudioWorkletNode(audioCtx, 'pcm16-worklet');
    sourceNode.connect(worklet);
  } catch (e: any) {
    mediaStream.getTracks().forEach((t) => t.stop());
    try { ws.close(); } catch { /* not open yet */ }
    throw new Error(`AudioWorklet init failed: ${e?.message || e} — 你的浏览器可能不支持（iOS 建议用 Safari 15+ 或 Chrome）`);
  }
  // We don't connect to destination — we're consuming, not playing back.

  const langInstruction =
    opts.targetLang === 'zh-CN' || !opts.targetLang
      ? 'You are translating a university classroom for a Chinese international student. Output ONLY the Chinese translation of what the speaker is saying, in natural, fluent Mandarin. If the speaker is already speaking Chinese, echo verbatim. Do not add commentary, headers, or notes. Never refuse — always translate.'
      : 'Translate to the target language only.';

  // Hard timeout on the WS handshake. Without this the "connecting…" state
  // could spin forever (e.g. a CSP block silently drops the upgrade).
  const HANDSHAKE_TIMEOUT_MS = 10000;
  await new Promise<void>((resolve, reject) => {
    let opened = false;
    const timer = setTimeout(() => {
      if (!opened) {
        try { ws.close(); } catch { /* already closing */ }
        reject(new Error('WebSocket 连接超时 (10s) — 检查网络或稍后重试'));
      }
    }, HANDSHAKE_TIMEOUT_MS);
    ws.addEventListener('open', () => {
      opened = true;
      clearTimeout(timer);
      // eslint-disable-next-line no-console
      console.info('[live] WebSocket open, sending setup…');
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${model}`,
            generation_config: {
              response_modalities: ['TEXT'],
              temperature: 0.2,
            },
            system_instruction: { parts: [{ text: langInstruction }] },
            input_audio_transcription: {},
          },
        })
      );
      cb.onStatusChange('live');
      resolve();
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      if (!opened) reject(new Error('WebSocket 连接失败 — 可能是 CSP / 网络问题'));
      else cb.onStatusChange('error', 'socket error');
    });
    ws.addEventListener('close', (ev) => {
      clearTimeout(timer);
      if (!opened) {
        // Closed before open — Gemini rejected the handshake.
        reject(new Error(`WebSocket 被拒绝 (code=${ev.code})，可能是 token 过期或模型不可用`));
      } else {
        cb.onStatusChange('stopped');
      }
    });
  });

  // Forward PCM chunks to Gemini + to our recent-audio ring buffer.
  worklet.port.onmessage = (ev) => {
    const pcm = ev.data?.pcm as ArrayBuffer | undefined;
    if (!pcm || ws.readyState !== WebSocket.OPEN) return;
    // Store in ring buffer (write, wrap)
    const bytes = new Uint8Array(pcm);
    let written = 0;
    while (written < bytes.byteLength) {
      const space = recentPcm.byteLength - recentWriteOffset;
      const toWrite = Math.min(space, bytes.byteLength - written);
      recentPcm.set(bytes.subarray(written, written + toWrite), recentWriteOffset);
      recentWriteOffset += toWrite;
      written += toWrite;
      if (recentWriteOffset >= recentPcm.byteLength) {
        recentWriteOffset = 0;
        recentFilled = true;
      }
    }
    // Send to Gemini Live as base64 PCM.
    const b64 = arrayBufferToBase64(pcm);
    ws.send(
      JSON.stringify({
        realtime_input: {
          media_chunks: [{ mime_type: 'audio/pcm;rate=16000', data: b64 }],
        },
      })
    );
  };

  ws.addEventListener('message', (ev) => {
    // Live server sends JSON text messages for control + content; when
    // response_modalities is TEXT we always get strings.
    try {
      const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
      if (!msg) return;
      // Server response shape: { serverContent: { modelTurn: { parts: [{text}] }, turnComplete, inputTranscription }}
      const serverContent = msg.serverContent || msg.server_content;
      if (serverContent) {
        const modelTurn = serverContent.modelTurn || serverContent.model_turn;
        if (modelTurn?.parts) {
          for (const p of modelTurn.parts) {
            if (p.text) {
              cb.onTranslationDelta(p.text);
              transcript += p.text;
            }
          }
        }
        const inputTx = serverContent.inputTranscription || serverContent.input_transcription;
        if (inputTx?.text && cb.onTranscriptionDelta) {
          cb.onTranscriptionDelta(inputTx.text);
        }
        if (serverContent.turnComplete || serverContent.turn_complete) {
          transcript += '\n';
          cb.onTurnComplete();
        }
      }
    } catch (e) {
      // Non-JSON messages (keepalives, binary) — ignore.
    }
  });

  return {
    async stop() {
      try { ws.close(); } catch { /* already closed */ }
      try { worklet.disconnect(); } catch { /* nothing */ }
      try { sourceNode.disconnect(); } catch { /* nothing */ }
      mediaStream.getTracks().forEach((t) => t.stop());
      try { await audioCtx.close(); } catch { /* nothing */ }
      cb.onStatusChange('stopped');
    },
    getRecentAudio(seconds: number): string | null {
      const wanted = Math.min(RECENT_AUDIO_SECONDS, Math.max(1, seconds));
      const wantedBytes = wanted * SAMPLE_RATE * BYTES_PER_SAMPLE;
      if (!recentFilled && recentWriteOffset < wantedBytes) {
        if (recentWriteOffset === 0) return null;
        // Not enough audio yet; give them what we have.
        return pcmToWavBase64(recentPcm.subarray(0, recentWriteOffset));
      }
      // Stitch the ring buffer: last `wantedBytes` bytes, in chronological
      // order. If not yet wrapped, trivial; otherwise slice-and-join.
      if (!recentFilled) {
        return pcmToWavBase64(
          recentPcm.subarray(Math.max(0, recentWriteOffset - wantedBytes), recentWriteOffset)
        );
      }
      const out = new Uint8Array(wantedBytes);
      const startFromOldest = (recentWriteOffset + recentPcm.byteLength - wantedBytes) % recentPcm.byteLength;
      if (startFromOldest + wantedBytes <= recentPcm.byteLength) {
        out.set(recentPcm.subarray(startFromOldest, startFromOldest + wantedBytes));
      } else {
        const first = recentPcm.byteLength - startFromOldest;
        out.set(recentPcm.subarray(startFromOldest), 0);
        out.set(recentPcm.subarray(0, wantedBytes - first), first);
      }
      return pcmToWavBase64(out);
    },
    getTranscript() {
      return transcript;
    },
  };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + chunk, bytes.byteLength)) as any
    );
  }
  return btoa(binary);
}

// Wrap raw PCM16 @ 16 kHz mono into a WAV container. Used by getRecentAudio
// so the "didn't get that" path can hand a normal audio file to the heavy
// Gemini 2.5 Pro model without teaching it PCM framing.
function pcmToWavBase64(pcm: Uint8Array): string {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataSize = pcm.byteLength;
  const fileSize = dataSize + 36;

  // "RIFF" chunk
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, fileSize, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  // "fmt " subchunk
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);            // subchunk size
  view.setUint16(20, 1, true);             // PCM format
  view.setUint16(22, 1, true);             // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE, true); // byte rate
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);            // bits per sample
  // "data" subchunk
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, dataSize, true);

  const combined = new Uint8Array(header.byteLength + dataSize);
  combined.set(new Uint8Array(header), 0);
  combined.set(pcm, header.byteLength);
  return arrayBufferToBase64(combined.buffer);
}
