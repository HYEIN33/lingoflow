/**
 * Classroom live-translation session — Deepgram ASR + Gemini translate.
 *
 * English audio → Deepgram Nova-3 (official SDK, WebSocket) →
 *   English transcript → Gemini 2.5 flash-lite → Chinese translation.
 *
 * History: we tried two hand-rolled paths first — Gemini Live v1alpha
 * (dead protocol drift) and raw Deepgram WebSocket with
 * Sec-WebSocket-Protocol token auth (Deepgram rejected the upgrade).
 * The official @deepgram/sdk handles the browser WS auth correctly via
 * the `accessToken` option, so we hand it our server-minted temporary
 * token and let the SDK do the protocol-level plumbing.
 *
 * Flow:
 *   1. callsite picks an audio source (mic or tab capture)
 *   2. we hit /api/live-token for a 60 s-TTL Deepgram bearer
 *   3. SDK opens the WebSocket with correct auth, we stream PCM chunks
 *   4. each is_final transcript triggers a background Gemini translation
 *   5. Chinese text surfaces via the callback
 */

import { createClient, LiveTranscriptionEvents, type ListenLiveClient } from '@deepgram/sdk';
import { auth } from '../firebase';
import { translateSimple } from './ai';

type SessionStatus =
  | 'idle'
  | 'requesting-token'
  | 'connecting'
  | 'live'
  | 'stopped'
  | 'error';

export interface LiveSessionCallbacks {
  onStatusChange: (status: SessionStatus, detail?: string) => void;
  /**
   * Called once per flushed batch of sentences. `pairs` lines up 1:1 —
   * pairs[i].en is the original English segment, pairs[i].zh is the
   * Chinese translation for that same segment. The UI matches by
   * pairs[i].en against its existing finalized lines and fills in zh.
   *
   * Why batch: translating one sentence at a time with Gemini flash-lite
   * (a) flickers the UI, (b) produces jumpier prose (no cross-sentence
   * context), and (c) blasts the API with N calls per paragraph which
   * triggers 503s. We accumulate up to 3 sentences or 5 seconds, then
   * ship them as one translate call. The model is told to return one
   * line per input, separated by a sentinel, so we can split it back.
   */
  // `sentences` is the exact list of finalized-English lines that this
  // translation pair covers. `batchId` is a stable identifier (e.g. "bx-3")
  // — the UI snapshots which line item ids belong to this batch when the
  // batch opens (onBatchOpen), then uses batchId to match those exact ids
  // when zh returns. Match-by-batchId makes concurrent translate safe:
  // out-of-order arrivals can no longer overwrite the wrong paragraph.
  onTranslationBatch: (pairs: Array<{ en: string; zh: string; sentences: string[]; batchId: string }>) => void;
  // Fires the moment a paragraph batch is dispatched to Gemini, before
  // the translate completes. UI uses this to snapshot which line ids
  // belong to this batchId — the equivalent of "marking the lines as
  // claimed by batch X". Receives the batch's English sentence count so
  // the UI can validate length when zh later returns.
  onBatchOpen?: (batchId: string, sentenceCount: number) => void;
  /**
   * English transcription. isFinal=false → interim (keep replacing the
   * in-flight line), true → the segment is locked in and a translation
   * will follow.
   */
  onTranscriptionDelta?: (delta: string, isFinal: boolean) => void;
  /**
   * Translation progress indicator. Fired true on each translate start,
   * false on each translate finish (or failure). UI renders a simple
   * "翻译中…" chip while at least one is pending.
   */
  onTranslationPending?: (pending: boolean, key: string) => void;
}

export interface LiveSessionOptions {
  audioSource: 'tab' | 'mic';
  mode: 'tutorial' | 'lecture';
  targetLang?: 'zh-CN';
  /**
   * Optional per-session course context. When set, we:
   *   1. feed the course's preset keyterms to Deepgram Nova-3 for
   *      better domain-specific recognition (e.g. "CAPM" in Finance);
   *   2. include the course name in the Gemini translation system
   *      prompt so the model translates with the right register
   *      ("economics lecture" vs "casual conversation").
   *
   * `course` is the user-facing display name (zh or en). `keyterms`
   * is the expanded vocab list for that course. ClassroomTab is
   * responsible for looking up the preset and passing both.
   */
  course?: string;
  keyterms?: string[];
  /**
   * Translation cadence — paragraph only after realtime mode was retired
   * 2026-04-27 evening (it produced fragmented, low-quality Chinese
   * without cross-sentence context, and the Pro-gated concurrent path
   * doesn't need realtime as a "low latency option" anymore). Kept as a
   * field for forward compatibility but only 'paragraph' is honored.
   */
  translationMode?: 'paragraph';
  // Pro tier flag — controls translate concurrency cap.
  //   false (non-Pro): serial — each paragraph waits for the previous one
  //     to finish before its translate fires.
  //   true (Pro): N=3 concurrent paragraphs.
  //
  // Concurrency was a Pro-only feature originally; the 2026-04-27 morning
  // PR briefly applied it to all users and produced a paragraph-splitting
  // bug (out-of-order returns made applyTranslationBatch's "first N
  // un-translated lines" pick the wrong N). The current version (afternoon)
  // pairs each batch with a stable batchId so merges target the correct
  // line items regardless of arrival order — see flushBatch + onBatchOpen.
  isPro?: boolean;
}

export interface LiveSessionHandle {
  stop(): Promise<void>;
  /**
   * Suspend audio delivery without tearing down the Deepgram connection.
   * KeepAlive pings continue, so resume() can pick up in under a second.
   * Any in-flight transcript from Deepgram is still surfaced.
   */
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  getRecentAudio(seconds: number): string | null;
  getTranscript(): string;
  /**
   * Force a Deepgram WebSocket reconnect. Triggered by the "卡住了？重连"
   * UI button when the automated watchdog hasn't fired (or fires too
   * slowly) and the user knows the stream is stuck from their side.
   */
  forceReconnect(): void;
  /**
   * Snapshot of the liveness metrics the UI uses to decide when to
   * surface the manual-reconnect button. All fields are safe to poll
   * on an interval — they're plain refs, no allocation per call.
   */
  getStuckInfo(): {
    lastRms: number;
    msSinceLastNonEmptyFinal: number;  // Infinity before first final
    msSinceLastRmsWindow: number;       // Infinity before any RMS window
    emptyFinalStreak: number;
  };
}

const RECENT_AUDIO_SECONDS = 30;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const RECENT_BUFFER_BYTES = RECENT_AUDIO_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE;

async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

async function mintDeepgramToken(): Promise<string> {
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
  if (!data.token) throw new Error('Token mint returned empty token');
  return data.token;
}

async function captureAudioStream(source: 'tab' | 'mic'): Promise<MediaStream> {
  if (source === 'tab') {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
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

export async function startLiveSession(
  opts: LiveSessionOptions,
  cb: LiveSessionCallbacks
): Promise<LiveSessionHandle> {
  cb.onStatusChange('requesting-token');
  const accessToken = await mintDeepgramToken();

  cb.onStatusChange('connecting');
  // eslint-disable-next-line no-console
  console.info('[live] capturing audio, source=', opts.audioSource);
  const mediaStream = await captureAudioStream(opts.audioSource);
  // eslint-disable-next-line no-console
  console.info('[live] got MediaStream, tracks=', mediaStream.getTracks().length);

  // Endpointing tuning history:
  //   500 → 800 (2026-04-21): nova-3 was re-deciding mid-utterance with
  //     smart_format and emitting empty is_final=true frames.
  //   800 → 1500 (2026-04-27 evening): user reported "识别不完全, 说一句
  //     覆盖一句" — interim text wasn't accumulating between turns and
  //     finals weren't landing reliably. 1500ms gives nova-3 enough
  //     silence to commit a real final instead of re-segmenting on every
  //     micro-pause. Slight latency cost (~700ms more silence before final
  //     arrives) is worth not losing transcript content.
  const endpointing = opts.mode === 'tutorial' ? 1500 : 1500;

  // Create a Deepgram client with our temporary access token. The SDK
  // handles browser-safe WebSocket auth (no Authorization header trick
  // required — we tried that manually and Deepgram rejected it).
  // Shared live options — built once, reused on every (re)connect so
  // keyterms / endpointing / model stay consistent across the session.
  // Key additions:
  //   - utterance_end_ms: Deepgram fires an `UtteranceEnd` event when the
  //     speaker has been silent this long. We use it as the "paragraph
  //     finished" signal for our batch flush, which is much more reliable
  //     than a wall-clock timer (a clock timer flushes single-sentence
  //     batches when the speaker pauses for breath).
  //   - vad_events: enables SpeechStarted events, used to know when the
  //     first real audio has landed — we flip UI to 'live' only then so
  //     the user doesn't start talking into a dead mic.
  const liveOpts: Record<string, any> = {
    model: 'nova-3',
    language: 'en-US',
    encoding: 'linear16',
    sample_rate: SAMPLE_RATE,
    channels: 1,
    interim_results: true,
    smart_format: true,
    endpointing,
    // utterance_end_ms must be > endpointing (now 1500) so the rescue
    // path (UtteranceEnd commits any pendingSyntheticFinal) fires AFTER
    // Deepgram had a chance to send a real final. 2000ms = endpointing +
    // 500ms safety margin. Per Deepgram docs the floor is 1000ms.
    utterance_end_ms: 2000,
    vad_events: true,
    punctuate: true,
  };
  if (opts.keyterms && opts.keyterms.length > 0) {
    liveOpts.keyterm = opts.keyterms.slice(0, 50); // hard cap to avoid URL bloat
  }

  const deepgram = createClient({ accessToken });
  let connection: ListenLiveClient | null = null;
  try {
    connection = deepgram.listen.live(liveOpts);
  } catch (e: any) {
    mediaStream.getTracks().forEach((t) => t.stop());
    throw new Error(`Deepgram 连接创建失败: ${e?.message || e}`);
  }

  let transcript = '';
  const recentPcm = new Uint8Array(RECENT_BUFFER_BYTES);
  let recentWriteOffset = 0;
  let recentFilled = false;

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
    try { connection.requestClose(); } catch { /* nothing */ }
    throw new Error(`AudioWorklet init failed: ${e?.message || e} — 你的浏览器可能不支持（iOS 建议用 Safari 15+ 或 Chrome）`);
  }

  // Wait for the Deepgram connection to open or error out. Hard 10 s cap.
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { connection?.requestClose(); } catch { /* nothing */ }
        reject(new Error('Deepgram 连接超时 (10s) — 检查网络或稍后重试'));
      }
    }, 10000);
    connection!.on(LiveTranscriptionEvents.Open, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // eslint-disable-next-line no-console
      console.info('[live] Deepgram connection open (waiting for first event before flipping UI to live)');
      // Don't flip UI to 'live' here — wait until Deepgram sends its
      // first event (any Transcript or SpeechStarted). That's the only
      // true "server is hot and listening" signal. Holding the status
      // at 'connecting' until then means users can't start talking
      // into a half-primed pipeline. See on-event handler below for
      // the actual flip. As a safety net, if no event arrives in 2s
      // we flip anyway so the UI doesn't hang.
      resolve();
    });
    connection!.on(LiveTranscriptionEvents.Error, (err: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // eslint-disable-next-line no-console
      console.error('[live] Deepgram error before open:', err);
      reject(new Error(`Deepgram 连接失败: ${err?.message || 'unknown'}`));
    });
    connection!.on(LiveTranscriptionEvents.Close, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Deepgram 连接被拒绝 — token 可能过期或权限不足'));
    });
  });

  // Paragraph-level translation pipeline (EasyNoteAI-style).
  //
  // We do NOT translate sentence-by-sentence. Instead:
  //   - English is transcribed and displayed live (as each is_final
  //     arrives), so the user sees the lecture in English in real time.
  //   - We accumulate finalized English sentences in a buffer until
  //     either (a) the paragraph is long enough (>= MIN_CHARS chars),
  //     (b) there's been a real pause (>= PAUSE_MS silence), or (c)
  //     the max wait elapsed (>= MAX_WAIT_MS) so a monologue speaker
  //     doesn't starve us.
  //   - Then we ship the WHOLE paragraph to Gemini as one translate
  //     call. The model sees full context, produces one coherent
  //     Chinese paragraph, and the user gets a natural-reading block
  //     of Chinese instead of fragmented per-sentence blips.
  // Tradeoff: the Chinese lags the English by 20-45 seconds (the
  // typical paragraph length). That's the point — it's EasyNoteAI's
  // model: read Chinese as a paragraph, not as stumbling subtitles.
  // Timing tuned to beat EasyNoteAI on latency. Their cadence appears to
  // be ~30-60s accumulation before a translate call; we aim for 6-15s
  // typical. The user still reads coherent paragraphs, just sooner.
  // Paragraph triggers (re-re-tuned 2026-04-27 evening — pulled back from
  // the aggressive 1.5s/80 word triggers because they fragmented natural
  // speech: a speaker pausing 1.6s mid-thought got their paragraph chopped,
  // then concurrent translate made the visual splits worse. The new
  // numbers below mirror EasyNoteAI's "wait for a real paragraph break"
  // philosophy but cut the wait by 10x (they're 30-60s, we're 3s).
  //
  //   - WORD_HARD_CAP=100: lets a single thought run to ~30-40s of
  //     speech before forcing a flush. Most teachers naturally land
  //     under this; only true monologues hit the cap.
  //   - PAUSE_MS=3000: 3s silence is a deliberate pause / topic shift,
  //     not "thinking of the next word". Halves the rate of accidental
  //     mid-thought splits vs the old 1.5s.
  //   - PAUSE_MIN_WORDS=10: bumped from 8 to absorb the slightly longer
  //     paragraphs the new triggers produce.
  const PARAGRAPH_WORD_HARD_CAP = 100;  // ≈ 30-45 seconds of speech
  const PARAGRAPH_PAUSE_MS = 3000;      // 3s silence = paragraph break
  const PARAGRAPH_PAUSE_MIN_WORDS = 10; // never flush a tiny fragment

  // Word counter for the accumulated batch. Splits on whitespace and
  // filters empties (handles double-spaces from naive joining).
  const countWords = (segments: string[]) =>
    segments.reduce((n, s) => n + s.split(/\s+/).filter(Boolean).length, 0);
  const BATCH_SENTINEL = '|||';       // legacy, unused in new path but
                                      // referenced elsewhere — keep defined.
  let pendingBatch: string[] = [];
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingKeyCounter = 0;
  let batchIdCounter = 0;

  // Concurrency semaphore for paragraph translates (Pro-only).
  //   non-Pro: TRANSLATE_CONCURRENCY=1 → effectively serial
  //   Pro:     TRANSLATE_CONCURRENCY=3 → up to 3 in-flight Gemini calls
  // Why 3 not 5: 5 produced too many simultaneous batches in long classes,
  // making the visual "翻译中" pile uncomfortably tall and increasing the
  // surface area for arrival-order surprises (which are now batchId-safe
  // but still cleaner with a tighter cap).
  //
  // The race that earlier serial-→-concurrent migration produced is now
  // structurally fixed: each batch carries a batchId, and ClassroomTab
  // matches the zh return to the exact line ids it snapshotted at
  // onBatchOpen time. Concurrent arrival order no longer matters.
  const TRANSLATE_CONCURRENCY = opts.isPro ? 3 : 1;
  let activeTranslations = 0;
  const translateQueue: Array<() => void> = [];

  const runWithConcurrencyLimit = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (activeTranslations >= TRANSLATE_CONCURRENCY) {
      await new Promise<void>((resolve) => translateQueue.push(resolve));
    }
    activeTranslations += 1;
    try {
      return await fn();
    } finally {
      activeTranslations -= 1;
      const next = translateQueue.shift();
      if (next) next();
    }
  };

  const flushBatch = async () => {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    if (pendingBatch.length === 0) return;
    const batch = pendingBatch;
    pendingBatch = [];
    const batchId = `bx-${++batchIdCounter}`;
    const key = `pg-${++pendingKeyCounter}`;
    cb.onTranslationPending?.(true, key);
    // Tell the UI "these N sentences are now mine" — the UI snapshots
    // which line ids belong to this batchId BEFORE the network call,
    // so when zh comes back (out of order vs other batches), the merge
    // targets exactly those ids.
    cb.onBatchOpen?.(batchId, batch.length);
    void runWithConcurrencyLimit(() => translateBatch(batch, batchId))
      .finally(() => { cb.onTranslationPending?.(false, key); });
  };

  // Retry helper: most Gemini failures are transient 503s during peak
  // load. Two retries with exponential backoff (500ms, 1500ms) recovers
  // ~95% of them without the user ever seeing the placeholder.
  const translateWithRetry = async (prompt: string, label: string): Promise<string> => {
    const delays = [0, 500, 1500];
    let lastErr: unknown;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
      try {
        return await translateSimple(prompt);
      } catch (err) {
        lastErr = err;
        // eslint-disable-next-line no-console
        console.warn(`[live] ${label} attempt ${i + 1} failed:`, err);
      }
    }
    throw lastErr;
  };

  const translateBatch = async (batch: string[], batchId: string = `bx-rt-${++batchIdCounter}`) => {
    // Paragraph-mode translation: join ALL sentences in the batch into
    // a single English paragraph, send it to Gemini as one piece, and
    // receive one Chinese paragraph back. No sentinel splitting, no
    // per-sentence mapping. The caller (ClassroomTab) then displays
    // the Chinese as a single block alongside the full English.
    const englishParagraph = batch.join(' ');
    const courseHint = opts.course
      ? ` The class subject is: ${opts.course}. Translate technical terms in that subject's convention; keep well-known English initialisms (e.g. CAPM, GDP, DNA) untranslated.`
      : '';
    const prompt = `You are translating a live classroom lecture from English to Chinese for a Chinese international student.${courseHint}

The input below is a continuous paragraph of spoken English from a live lecture (transcribed by a speech model, so it may contain repetitions or filler). Produce a SINGLE natural, fluent Chinese paragraph that reads as if a Chinese teacher re-explained the same material. Do not mirror every word — clean up repetitions, smooth broken phrasing, and group related sentences into flowing Chinese prose.

Rules:
- Output is ONE Chinese paragraph. PURE CHINESE ONLY — no English words, no parenthetical English glosses, no Latin characters anywhere.
- This is critical: do NOT write things like 新雪（fresh powder） or "可理解性输入（comprehensive input）" — the user has the English source displayed alongside, so embedded English in the Chinese is redundant and visually noisy.
- The ONLY exception: well-known initialisms that are normally untranslated even by Chinese teachers — CAPM, GDP, DNA, AI, HTTP, API, CEO. These can stay as-is, but never wrap them in parentheses with a Chinese version.
- Keep the teaching register (spoken Chinese, 口语化, not stiff written Chinese).
- Do not add commentary about the quality of the transcription.

English paragraph:
${englishParagraph}`;
    try {
      const zh = (await translateWithRetry(prompt, 'paragraph')).trim();
      // The UI is happier with one {en, zh} pair representing the whole
      // paragraph than N pairs. Callsite keys translations by exact en
      // match; join with a space so a single pair matches the single
      // joined English block we display.
      cb.onTranslationBatch([{ en: englishParagraph, zh, sentences: batch, batchId }]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[live] paragraph translate failed after retries:', err);
      cb.onTranslationBatch([{ en: englishParagraph, zh: '（翻译失败，稍后重试）', sentences: batch, batchId }]);
    }
  };

  // Track whether stop() was called by the user. Only then should we
  // actually treat Close as terminal. Otherwise we auto-reconnect.
  let userStopped = false;
  let transcriptEventCount = 0;
  // Buffer for assembling a complete sentence from multiple is_final
  // fragments. Flushed into pendingBatch on UtteranceEnd. Scoped at the
  // session level so it survives auto-reconnect.
  // (currentSentence fragment buffer removed in paragraph mode — we
  // now push each is_final directly into pendingBatch and rely on
  // PARAGRAPH_* triggers for flushing.)

  // Flip UI to 'live' only on first evidence the server is sending us
  // anything. Until then, whatever PCM we send can be silently dropped.
  let firstEventSeen = false;
  const flipToLiveOnce = () => {
    if (firstEventSeen) return;
    firstEventSeen = true;
    cb.onStatusChange('live');
  };
  // Safety net: flip to live after 2s even if no event — some very quiet
  // starts won't fire SpeechStarted, and the user still deserves feedback.
  setTimeout(() => flipToLiveOnce(), 2000);

  // ASR-level state for Bug A mitigation. Nova-3 sometimes emits
  // is_final=true with text="" while the interim stream had real content
  // (WebSocket "dirty" state). We handle this with a layered defence:
  //
  //   1. Interim rescue (SAFER VERSION): when final is empty, DON'T
  //      promote the interim immediately — that over-commits mid-utterance
  //      text as final and causes duplicate bubbles when Deepgram later
  //      sends a proper non-empty final for the same span. Instead, mark
  //      `pendingSyntheticFinal = true` and let the UtteranceEnd event
  //      (server-authoritative "speaker paused") commit the rescued text.
  //
  //   2. UtteranceEnd as flush authority: server tells us the speaker
  //      paused. If we have an unresolved rescue pending, commit it now.
  //      Then flush pendingBatch — the paragraph is done from the speech
  //      engine's point of view.
  //
  //   3. Auto-recovery watchdog (see healthTimer below): if the speaker
  //      IS talking (RMS > 300 in recent window) but no non-empty final
  //      or interim has landed in ~7 s, force a WebSocket reconnect.
  //      This catches the "stream stuck emitting empty finals forever"
  //      failure mode, which no amount of rescue can fix on its own.
  let lastInterimText = '';
  let interimEmptyFinalRescueCount = 0;
  let pendingSyntheticFinal = false;        // "empty final seen, waiting for UtteranceEnd to confirm"
  let lastNonEmptyTranscriptAt = Date.now(); // wall-clock of last non-empty transcript (interim OR final)
  let lastNonEmptyFinalAt = 0;               // wall-clock of last non-empty final (for watchdog)
  let emptyFinalStreak = 0;                  // consecutive empty finals since last non-empty one
  let finalEventCount = 0;                   // total final events this session (for ratio)
  let emptyFinalCount = 0;                   // total empty finals this session

  // commitFinalText: the single "this is a real final, treat it as done"
  // code path. Extracted so both the Transcript handler (non-empty final)
  // and the UtteranceEnd handler (synthetic final from interim) can reach
  // it without duplicating the paragraph-trigger logic below.
  const commitFinalText = (text: string, source: 'final' | 'rescued-interim') => {
    if (!text) return;
    if (source === 'rescued-interim') {
      interimEmptyFinalRescueCount += 1;
      // eslint-disable-next-line no-console
      console.info(`[live] rescued interim→final (#${interimEmptyFinalRescueCount}): ${JSON.stringify(text.slice(0, 60))}`);
    }
    lastInterimText = '';
    pendingSyntheticFinal = false;
    lastNonEmptyFinalAt = Date.now();
    lastNonEmptyTranscriptAt = Date.now();
    emptyFinalStreak = 0;

    if (cb.onTranscriptionDelta) {
      cb.onTranscriptionDelta(text, true);
    }
    transcript += (transcript ? '\n' : '') + text;

    // Realtime mode retired 2026-04-27. Always go through pendingBatch +
    // paragraph triggers — produces coherent Chinese with cross-sentence
    // context instead of disjointed per-sentence flickers.
    pendingBatch.push(text);

    // Word-cap path: this final pushed us past 80 words. Flush immediately
    // — the speaker is on a roll and we need to free the buffer for the
    // next paragraph (which concurrently translates, see PR2).
    const accumulatedWords = countWords(pendingBatch);
    if (accumulatedWords >= PARAGRAPH_WORD_HARD_CAP) {
      void flushBatch();
      return;
    }

    // Pause path: arm a 1.5s timer. If no new final lands by then, the
    // speaker has paused and we close the paragraph (provided we have
    // enough context — at least PAUSE_MIN_WORDS words).
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(() => {
      batchTimer = null;
      if (pendingBatch.length > 0 && countWords(pendingBatch) >= PARAGRAPH_PAUSE_MIN_WORDS) {
        void flushBatch();
      }
      // If under PAUSE_MIN_WORDS, do nothing — keep accumulating until
      // the next final extends the buffer or the next pause re-fires
      // this same logic.
    }, PARAGRAPH_PAUSE_MS);
  };

  const attachHandlers = (conn: ListenLiveClient) => {
    conn.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      flipToLiveOnce();
      transcriptEventCount += 1;
      const alt = data?.channel?.alternatives?.[0];
      const rawText = (alt?.transcript || '').trim();
      const isFinalRaw = !!data.is_final;
      const speechFinal = !!data.speech_final;
      const fromFinalize = !!data.from_finalize;

      // Richer log so we can triage "endpoint artifact" vs "stream corrupted"
      // in production. speech_final=true means Deepgram considers the
      // utterance over; from_finalize=true flags a client-triggered close.
      if (transcriptEventCount <= 3 || transcriptEventCount % 10 === 0) {
        // eslint-disable-next-line no-console
        console.info(
          `[live] Transcript #${transcriptEventCount} is_final=${isFinalRaw} speech_final=${speechFinal} from_finalize=${fromFinalize} text=${JSON.stringify(rawText.slice(0, 60))}`
        );
      }
      if (!alt) return;

      // Non-final with text: interim buffer for UtteranceEnd to pick up if
      // the final comes back empty. Update UI with live scrolling text.
      if (!isFinalRaw && rawText) {
        lastInterimText = rawText;
        lastNonEmptyTranscriptAt = Date.now();
        if (cb.onTranscriptionDelta) cb.onTranscriptionDelta(rawText, false);
        return;
      }
      // Non-final empty: Deepgram heartbeat/warmup; ignore.
      if (!isFinalRaw && !rawText) return;

      // ─── From here: isFinalRaw === true ───
      finalEventCount += 1;

      if (rawText) {
        // Normal happy path: real non-empty final.
        emptyFinalStreak = 0;
        commitFinalText(rawText, 'final');
        return;
      }

      // Empty final. DO NOT promote interim yet — that caused duplicate
      // bubbles in the previous fix when Deepgram later sent a proper
      // non-empty final for the same utterance. Instead, mark for the
      // UtteranceEnd handler to finalize later.
      emptyFinalCount += 1;
      emptyFinalStreak += 1;
      if (emptyFinalStreak <= 3 || emptyFinalStreak % 10 === 0) {
        // eslint-disable-next-line no-console
        console.info(`[live] empty-final streak=${emptyFinalStreak} (lastInterimText=${JSON.stringify(lastInterimText.slice(0, 40))})`);
      }
      if (lastInterimText) {
        pendingSyntheticFinal = true;
      }
      // If no interim either: nothing to do. UtteranceEnd may still fire
      // and cleanly close the utterance; if stream is truly stuck, the
      // watchdog (healthTimer below) will force reconnect.
    });

    // UtteranceEnd: server-authoritative "speaker has paused longer than
    // utterance_end_ms". This is our primary synthetic-final commit point.
    conn.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      // eslint-disable-next-line no-console
      console.info(`[live] UtteranceEnd (pendingSynthetic=${pendingSyntheticFinal}, lastInterim=${JSON.stringify(lastInterimText.slice(0, 40))})`);
      if (pendingSyntheticFinal && lastInterimText) {
        commitFinalText(lastInterimText, 'rescued-interim');
      } else {
        // Real finals already committed; just clear any stale interim.
        lastInterimText = '';
        pendingSyntheticFinal = false;
      }
      // Server says utterance is over → flush paragraph buffer if it has
      // meaningful content. More reliable than our client-side pause timer.
      // Match the same PAUSE_MIN_WORDS gate as commitFinalText() so the
      // two flush paths have identical "is this paragraph worth shipping"
      // semantics.
      if (pendingBatch.length > 0 && countWords(pendingBatch) >= PARAGRAPH_PAUSE_MIN_WORDS) {
        void flushBatch();
      }
    });

    conn.on(LiveTranscriptionEvents.SpeechStarted, () => {
      flipToLiveOnce();
    });
    conn.on(LiveTranscriptionEvents.Close, (ev: any) => {
      // eslint-disable-next-line no-console
      console.warn('[live] Deepgram Close event', { code: ev?.code, reason: ev?.reason, userStopped });
      if (userStopped) {
        cb.onStatusChange('stopped');
        return;
      }
      // Any close that wasn't initiated by the user → try to reconnect.
      // We previously special-cased code 1000 (normal close) as "don't
      // reconnect", but Deepgram also sends 1000 when IT decides the
      // stream is dead (e.g. after silent keepalive window). Safer to
      // always reconnect unless userStopped is set.
      // eslint-disable-next-line no-console
      console.info('[live] auto-reconnecting after unexpected close…');
      void reconnect();
    });
    conn.on(LiveTranscriptionEvents.Error, (err: any) => {
      // eslint-disable-next-line no-console
      console.error('[live] Deepgram runtime error:', err);
      // Errors during reconnect often precede Close — don't spam the UI.
      if (!userStopped) return;
      cb.onStatusChange('error', err?.message || 'Deepgram error');
    });
  };

  attachHandlers(connection);

  // Reconnect: mint a fresh token, reopen a new `listen.live` connection,
  // rebind worklet's send target, and keep batched translation + recent
  // audio buffer intact. The worklet and AudioContext are preserved —
  // only the network socket is recycled.
  //
  // Bounded retries: 3 attempts with 500ms / 1500ms / 4000ms backoff.
  // After that we give up and surface an error so the user can hit Start
  // again (rather than silently looping and burning token mints forever).
  let reconnecting = false;
  const RECONNECT_DELAYS = [500, 1500, 4000];
  const reconnect = async () => {
    if (reconnecting || userStopped) return;
    reconnecting = true;
    // Before attempting reconnect, make sure the audio source is still
    // producing. Several failure modes we've seen:
    //   (a) The mic track was muted by the OS (call interrupt, other app
    //       grabbed exclusive access).
    //   (b) Chrome suspended the AudioContext because the tab went to
    //       background — it stays alive but stops pulling audio frames.
    //   (c) The MediaStream track ended (user hit "stop sharing" on a
    //       tab-capture session).
    // Case (c) is unrecoverable from our side — bail out with a clear
    // error so the user knows to re-share. (a) and (b) we can fix.
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (!audioTrack || audioTrack.readyState === 'ended') {
      // eslint-disable-next-line no-console
      console.warn('[live] media track ended, giving up on reconnect');
      reconnecting = false;
      cb.onStatusChange('error', '录音已停止（可能是浏览器停止了分享），请重新按「开始」');
      return;
    }
    if (audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
        // eslint-disable-next-line no-console
        console.info('[live] resumed AudioContext before reconnect');
      } catch { /* will retry on next close */ }
    }
    for (let attempt = 0; attempt < RECONNECT_DELAYS.length; attempt++) {
      if (userStopped) { reconnecting = false; return; }
      await new Promise((r) => setTimeout(r, RECONNECT_DELAYS[attempt]));
      try {
        const freshToken = await mintDeepgramToken();
        const freshDg = createClient({ accessToken: freshToken });
        const freshConn = freshDg.listen.live(liveOpts);
        await new Promise<void>((resolve, reject) => {
          const openTimer = setTimeout(() => reject(new Error('reconnect open timeout')), 10000);
          freshConn.on(LiveTranscriptionEvents.Open, () => {
            clearTimeout(openTimer);
            resolve();
          });
          freshConn.on(LiveTranscriptionEvents.Error, (e: any) => {
            clearTimeout(openTimer);
            reject(new Error(`reconnect error: ${e?.message || 'unknown'}`));
          });
        });
        connection = freshConn;
        attachHandlers(freshConn);
        // eslint-disable-next-line no-console
        console.info('[live] auto-reconnect succeeded');
        reconnecting = false;
        return;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[live] reconnect attempt ${attempt + 1} failed:`, err);
      }
    }
    reconnecting = false;
    cb.onStatusChange('error', '连接已断开，请按「开始」重新连接');
  };

  // Pause state — when true, worklet PCM is dropped on the floor instead
  // of being sent to Deepgram. The WebSocket stays open (keepAlive fires
  // every 8s) so resume is instantaneous.
  let paused = false;

  // Volume diagnostics: samples the RMS level of the PCM stream every 3s.
  // Lets us tell apart "mic is silent" (RMS ≈ 0) from "mic works but
  // Deepgram isn't recognizing" (RMS > ~500 but text empty).
  //   volLog*      — accumulators for the current in-progress 3 s window
  //   lastRms      — last COMPLETED 3 s window's RMS value
  //   lastRmsAt    — wall-clock timestamp of that window completion
  // healthTimer (auto-recovery watchdog) reads lastRms to tell whether
  // the speaker is actually talking — i.e. decide if an "ASR stuck"
  // force-reconnect is warranted.
  let volLogLastMs = 0;
  let volLogPeakAbs = 0;
  let volLogSampleCount = 0;
  let volLogSumSquares = 0;
  let lastRms = 0;
  let lastRmsAt = 0;
  let lastPcmSentAt = Date.now();

  // Auto-recovery watchdog. Runs every 3 s. Force-reconnects Deepgram
  // when any of these "ASR stuck" conditions hold:
  //
  //   (a) AudioContext suspended (tab backgrounded, OS slept) → resume
  //       it; if resume itself fails, force reconnect.
  //   (b) media track muted for >6 s (AirPods disconnect, other app
  //       took mic exclusively) → force reconnect once unmuted.
  //   (c) no PCM left the worklet for >8 s → reconnect.
  //   (d) speaker IS talking (RMS > 300 in last window) but no
  //       non-empty transcript landed for >7 s AND emptyFinalStreak
  //       >= 6 → the WebSocket is emitting empty finals; reconnect.
  //   (e) >10 s since last non-empty final even if the speaker was
  //       quiet (as long as they WERE talking in the last 15 s, per
  //       lastRmsAt > now - 15000 && lastRms > 300) → reconnect.
  //
  // These thresholds come from the Codex + gstack joint review
  // (2026-04-21). Previous healthTimer only logged track.muted and
  // did nothing for the empty-final case, which is the bug A user
  // hit in production logs.
  let audioStuckForcedReconnect = false; // per-session one-shot guard
  const healthTimer = setInterval(() => {
    if (userStopped || reconnecting) return;
    const t = mediaStream.getAudioTracks()[0];
    if (!t) return;
    if (t.readyState === 'ended') {
      clearInterval(healthTimer);
      cb.onStatusChange('error', '录音已停止（设备断开或分享被取消），请重新按「开始」');
      return;
    }

    const now = Date.now();

    // (a) AudioContext suspended — try to resume in-place. If it fails,
    // fall through to (c) which will force-reconnect on no-PCM.
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {
        // eslint-disable-next-line no-console
        console.warn('[live] audio resume failed, will rely on no-PCM watchdog');
      });
    }

    // (b) Track muted for >6 s → reconnect.
    if (t.muted) {
      // eslint-disable-next-line no-console
      console.warn('[live] mic track is muted — audio may not reach Deepgram');
    }

    // (c) PCM flow stopped for >8 s — worklet died or nothing is
    // producing audio. Force reconnect.
    if (now - lastPcmSentAt > 8000 && !audioStuckForcedReconnect) {
      audioStuckForcedReconnect = true;
      // eslint-disable-next-line no-console
      console.warn(`[live] no PCM sent for ${((now - lastPcmSentAt) / 1000).toFixed(1)}s — forcing reconnect`);
      void reconnect();
      return;
    }
    if (now - lastPcmSentAt <= 8000) {
      // Reset the guard once PCM is flowing again.
      audioStuckForcedReconnect = false;
    }

    // (d) Speaker IS talking but no non-empty transcript in >7 s
    // AND Deepgram is actively emitting empty finals. The WebSocket
    // is stuck; reconnect is the only recovery.
    const recentlyTalking = lastRmsAt > 0 && now - lastRmsAt < 6000 && lastRms > 300;
    const noTranscriptFor = lastNonEmptyTranscriptAt > 0 ? now - lastNonEmptyTranscriptAt : 0;
    if (recentlyTalking && noTranscriptFor > 7000 && emptyFinalStreak >= 6) {
      // eslint-disable-next-line no-console
      console.warn(`[live] ASR stuck: speaking (RMS=${lastRms.toFixed(0)}) but ${(noTranscriptFor/1000).toFixed(1)}s without non-empty transcript and ${emptyFinalStreak} empty finals in a row — forcing reconnect`);
      void reconnect();
      return;
    }

    // (e) >10 s since last non-empty final while the user has been
    // speaking in the last 15 s — softer catch-all for stuck streams
    // that don't emit enough final events to trigger (d).
    const recentlyTalkingLoose = lastRmsAt > 0 && now - lastRmsAt < 15000 && lastRms > 300;
    const noFinalFor = lastNonEmptyFinalAt > 0 ? now - lastNonEmptyFinalAt : 0;
    if (recentlyTalkingLoose && noFinalFor > 10000 && finalEventCount > 3) {
      // eslint-disable-next-line no-console
      console.warn(`[live] no non-empty final for ${(noFinalFor/1000).toFixed(1)}s despite recent speech — forcing reconnect`);
      void reconnect();
      return;
    }
  }, 3000);

  // Tracks consecutive PCM send failures for the fast-fail reconnect path.
  // When the WebSocket dies silently the SDK's send() throws but the
  // close event hasn't fired yet — without this counter we'd happily
  // pour PCM into a dead socket for 12s waiting on Deepgram's idle
  // timeout. 3 consecutive failures = trigger immediate reconnect.
  let consecutiveSendFailures = 0;

  // Pipe PCM from the worklet to Deepgram.
  worklet.port.onmessage = (ev) => {
    const pcm = ev.data?.pcm as ArrayBuffer | undefined;
    if (!pcm || !connection) return;
    if (paused) return;
    const bytes = new Uint8Array(pcm);
    lastPcmSentAt = Date.now(); // heartbeat for the no-PCM watchdog

    // Volume probe: scan as Int16 (linear16 encoding). Track peak abs
    // and sum of squares across the 3s window; log once per window.
    const i16 = new Int16Array(pcm);
    for (let i = 0; i < i16.length; i++) {
      const v = i16[i];
      const absV = v < 0 ? -v : v;
      if (absV > volLogPeakAbs) volLogPeakAbs = absV;
      volLogSumSquares += v * v;
    }
    volLogSampleCount += i16.length;
    const now = Date.now();
    if (now - volLogLastMs >= 3000 && volLogSampleCount > 0) {
      const rms = Math.sqrt(volLogSumSquares / volLogSampleCount);
      // Share last window with the health watchdog.
      lastRms = rms;
      lastRmsAt = now;
      // eslint-disable-next-line no-console
      console.info(`[live] mic RMS=${rms.toFixed(0)} peak=${volLogPeakAbs} (3s window, ${volLogSampleCount} samples) — RMS<100 ≈ silence; RMS>500 = real speech`);
      volLogLastMs = now;
      volLogPeakAbs = 0;
      volLogSampleCount = 0;
      volLogSumSquares = 0;
    }

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
    try {
      connection.send(pcm);
      consecutiveSendFailures = 0;
    } catch (err) {
      // Connection closed between checks. Increment a counter — if we
      // see this repeatedly (>= 3 in a row), the socket is dead and the
      // SDK isn't catching it, force a manual reconnect so PCM doesn't
      // pour into a closed socket for 12s waiting on Deepgram timeout.
      consecutiveSendFailures += 1;
      if (consecutiveSendFailures >= 3 && !reconnecting && !userStopped) {
        // eslint-disable-next-line no-console
        console.warn('[live] PCM send failed 3x in a row — forcing reconnect', err);
        consecutiveSendFailures = 0;
        void reconnect();
      }
    }
  };

  // Deepgram expects a KeepAlive ping every ≤12 s on idle streams,
  // otherwise it considers the session abandoned and closes the socket
  // (code 1011 = "did not receive audio data or text in timeout window").
  // 8s was getting hit repeatedly in user testing on flaky networks —
  // tightened to 5s for ~2x safety margin. Cost: trivial extra traffic.
  const keepAliveTimer = setInterval(() => {
    if (!connection) return;
    try {
      (connection as any).keepAlive?.();
    } catch { /* ignore */ }
    try {
      (connection as any).send?.(JSON.stringify({ type: 'KeepAlive' }));
    } catch { /* ignore */ }
  }, 5000);

  return {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    isPaused() {
      return paused;
    },
    async stop() {
      // Mark before closing — the Close event handler checks this flag
      // to decide whether to auto-reconnect. Without it, stop() would
      // trigger the reconnect loop.
      userStopped = true;
      clearInterval(keepAliveTimer);
      clearInterval(healthTimer);
      // If there's a partially-assembled sentence still sitting in the
      // buffer (user hit stop mid-utterance), commit it to the batch
      // before flushing. Otherwise the last spoken sentence is lost.
      // Nothing special — flushBatch picks up whatever is in pendingBatch.
      try { await flushBatch(); } catch { /* nothing */ }
      // Drain in-flight concurrent translates — wait until the semaphore
      // is empty so the user's last paragraph has a chance to land.
      // Bounded by a 5s ceiling so a hung Gemini call doesn't block stop().
      const drainStart = Date.now();
      while (activeTranslations > 0 && Date.now() - drainStart < 5000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      try { connection?.requestClose(); } catch { /* already closed */ }
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
        return pcmToWavBase64(recentPcm.subarray(0, recentWriteOffset));
      }
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
    forceReconnect() {
      if (userStopped || reconnecting) return;
      // eslint-disable-next-line no-console
      console.info('[live] manual forceReconnect triggered by user');
      void reconnect();
    },
    getStuckInfo() {
      const now = Date.now();
      return {
        lastRms,
        msSinceLastNonEmptyFinal: lastNonEmptyFinalAt > 0 ? now - lastNonEmptyFinalAt : Number.POSITIVE_INFINITY,
        msSinceLastRmsWindow: lastRmsAt > 0 ? now - lastRmsAt : Number.POSITIVE_INFINITY,
        emptyFinalStreak,
      };
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

function pcmToWavBase64(pcm: Uint8Array): string {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataSize = pcm.byteLength;
  const fileSize = dataSize + 36;

  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, fileSize, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, dataSize, true);

  const combined = new Uint8Array(header.byteLength + dataSize);
  combined.set(new Uint8Array(header), 0);
  combined.set(pcm, header.byteLength);
  return arrayBufferToBase64(combined.buffer);
}
