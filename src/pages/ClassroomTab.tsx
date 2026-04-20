/**
 * ClassroomTab — live translation + class-aware AI chat (Spike).
 *
 * What it does:
 *   - Compliance gate (first-use only): force-read + consent dialog about
 *     audio going to Google's servers. Blocks access until acknowledged.
 *   - Audio source toggle: online class (tab capture) vs in-person (mic).
 *   - Start/Stop live session; streams PCM16 @ 16 kHz to Gemini Live.
 *   - Renders a scrolling bilingual subtitle stream.
 *   - Bottom chat bar: the user can ask AI anything about the class at any
 *     time. AI answers use the transcript-so-far as context, so the user
 *     can say "what did the professor mean by CAPM?" without copying any
 *     text themselves.
 *   - On stop, persists transcript to `classSessions/{autoId}`.
 *
 * Design note (2026-04-20): the original Spike had a red "replay last 15s"
 * button. Founder called it 鸡肋 during dogfooding — passive, narrow, info
 * redundant with the subtitle itself. Replaced with proactive chat because
 * a student's real confusion often spans multiple sentences and benefits
 * from multi-turn Q&A ("wait, what's the difference between X and Y?").
 *
 * What it's NOT:
 *   - Not productionized. No reconnect-on-drop, no transcript chunking
 *     for >1h classes, no speaker diarization, no multi-language.
 *   - The Spike's goal is a single PMF signal: do international students
 *     keep the session open for a full tutorial AND engage the chat? If
 *     yes → 3-4 week real MVP. If no → product direction was wrong.
 */
import React, { useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  Monitor,
  Play,
  Pause,
  Square,
  Loader2,
  AlertTriangle,
  Save,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { addDoc, collection, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { startLiveSession, LiveSessionHandle } from '../services/liveSession';
import ClassNotesModal from '../components/ClassNotesModal';
import LiveNotesPanel from '../components/LiveNotesPanel';
import { generateLiveNotes, type LiveNotes } from '../services/ai';
import { aiChat } from '../services/ai';

const COMPLIANCE_ACK_KEY = 'memeflow_classroom_compliance_ack';

// Keyterm presets — one-tap subject packs that prefill the keyterms box
// with vocabulary Deepgram Nova-3 often misrecognises for that subject.
// Users can mix-and-match (tap Finance + CS) or ignore and type their own.
// The terms themselves are English — Deepgram is an English ASR, so
// boosting "CAPM" as a literal keyterm works whether the UI is zh or en.
// Course presets — one-tap subject packs. Each course surfaces BOTH:
//   (a) a keyterm list for Deepgram to boost recognition, and
//   (b) the course name itself so Gemini translates with the right
//       domain register. The user just picks a subject; both layers
//       benefit automatically.
const COURSE_PRESETS: Array<{ zh: string; en: string; terms: string[] }> = [
  { zh: '经济学', en: 'Economics', terms: ['GDP', 'inflation', 'deflation', 'oligopoly', 'monopoly', 'elasticity', 'equilibrium', 'Keynesian', 'marginal', 'externality'] },
  { zh: '金融', en: 'Finance', terms: ['CAPM', 'WACC', 'beta', 'Sharpe ratio', 'arbitrage', 'derivative', 'Black-Scholes', 'portfolio', 'covariance', 'volatility'] },
  { zh: '会计', en: 'Accounting', terms: ['accrual', 'depreciation', 'amortization', 'EBITDA', 'goodwill', 'liability', 'equity', 'GAAP', 'IFRS', 'ledger'] },
  { zh: '计算机', en: 'CS', terms: ['recursion', 'heuristic', 'polymorphism', 'asynchronous', 'concurrency', 'Big-O', 'hashtable', 'compiler', 'runtime', 'semaphore'] },
  { zh: '数据科学', en: 'Data Science', terms: ['Bayesian', 'regression', 'overfitting', 'gradient descent', 'neural network', 'hyperparameter', 'tensor', 'correlation', 'clustering', 'variance'] },
  { zh: '工程', en: 'Engineering', terms: ['tolerance', 'Young modulus', 'shear stress', 'thermodynamics', 'viscosity', 'Reynolds number', 'hydraulic', 'kinematics', 'torque', 'fatigue'] },
  { zh: '法律', en: 'Law', terms: ['plaintiff', 'defendant', 'tort', 'liability', 'statute', 'jurisprudence', 'precedent', 'injunction', 'mens rea', 'actus reus'] },
  { zh: '医学', en: 'Medicine', terms: ['pathology', 'etiology', 'prognosis', 'hypertension', 'diabetes', 'oncology', 'cardiovascular', 'immunology', 'biopsy', 'clinical trial'] },
  { zh: '心理学', en: 'Psychology', terms: ['cognition', 'attachment', 'Freud', 'Piaget', 'neurosis', 'schema', 'reinforcement', 'phenomenology', 'behaviorism', 'dissonance'] },
  { zh: '传媒', en: 'Media Studies', terms: ['narrative', 'semiotics', 'hegemony', 'discourse', 'framing', 'propaganda', 'audience', 'postmodern', 'intertextuality', 'mediation'] },
  { zh: '哲学', en: 'Philosophy', terms: ['epistemology', 'ontology', 'metaphysics', 'phenomenology', 'existentialism', 'dialectic', 'a priori', 'empiricism', 'utilitarianism', 'Nietzsche'] },
];

type Status =
  | 'idle'
  | 'requesting-token'
  | 'connecting'
  | 'live'
  | 'stopped'
  | 'error';

// Two kinds of things live in the transcript stream, in chronological order:
//   - 'line'  — a Gemini Live subtitle (transcription + translation)
//   - 'qa'    — an AI Q&A exchange the user typed into the chat bar
// Rendering them in the same stream means the user sees their questions
// in the context where they asked them, not in a separate chat panel.
type StreamItem =
  | { kind: 'line'; id: number; translation: string; transcription: string; finalized: boolean }
  | { kind: 'qa'; id: number; question: string; answer: string; pending: boolean };

// Convert raw exceptions from startLiveSession (permissions, network, token,
// WebSocket) into short Chinese/English messages the user can act on.
// Order matters: check specific error names before falling back to message
// matching, because browsers localize error messages differently.
function friendlyStartError(e: any, source: 'tab' | 'mic', lang: 'en' | 'zh'): string {
  const name = e?.name || '';
  const msg = e?.message || String(e || '');
  const zh = lang === 'zh';

  // Browser permission / user-cancel cases. NotAllowedError covers both
  // "user clicked Block" and "user hit Cancel in the screen-picker".
  if (name === 'NotAllowedError' || /Permission denied|permission/i.test(msg)) {
    if (source === 'mic') {
      return zh
        ? '麦克风权限被拒了。点地址栏左边的锁 → 允许麦克风 → 再按开始。'
        : 'Microphone blocked. Open the site permissions (lock icon in the address bar) → allow microphone → retry.';
    }
    return zh
      ? '屏幕分享被拒了。再按开始，在弹窗里选上课的那个标签页。'
      : 'Screen share blocked or cancelled. Tap Start again and pick the class tab.';
  }
  if (name === 'NotFoundError' || /no.*device|no microphone/i.test(msg)) {
    return zh
      ? '找不到麦克风。检查一下麦克风是不是插好了或被占用了。'
      : 'No microphone found. Check your device is plugged in and not in use by another app.';
  }
  if (name === 'NotReadableError') {
    return zh
      ? '麦克风被别的程序占着。关掉 Zoom/录音软件后再试。'
      : 'Microphone is in use by another app. Close Zoom or any recorder and try again.';
  }
  // Our own throw for "share chosen but no tab audio ticked"
  if (/共享音频|Share tab audio|no audio track/i.test(msg)) {
    return zh
      ? '没勾上"共享标签页音频"。再按开始，在弹窗底部勾选后继续。'
      : 'You forgot to tick "Share tab audio" in the picker. Tap Start and tick it at the bottom.';
  }
  // Token mint failures
  if (/401|Missing auth|Invalid auth|Not signed in/i.test(msg)) {
    return zh
      ? '登录已过期，请刷新页面重新登录。'
      : 'Login expired. Refresh the page and sign in again.';
  }
  if (/Token mint failed|Token mint/i.test(msg)) {
    return zh
      ? '拿不到翻译服务的通行证，稍后再试。'
      : "Couldn't get a translation session token. Try again in a moment.";
  }
  // AudioWorklet init (Safari <15 / ancient browsers)
  if (/AudioWorklet|worklet|audioContext/i.test(msg)) {
    return zh
      ? '你的浏览器不支持课堂同传的音频处理。请用最新的 Chrome / Safari 15+ / Edge。'
      : 'Your browser lacks the audio support needed for live translation. Use latest Chrome, Safari 15+, or Edge.';
  }
  // WebSocket handshake timeout — most often a CSP / firewall / corporate
  // network block, less often a Gemini outage.
  if (/\u8d85\u65f6|timeout/i.test(msg) && /WebSocket|\u8fde\u63a5/i.test(msg)) {
    return zh
      ? '连不上翻译服务（10 秒超时）。换个网络再试，或确认没被公司 / 学校防火墙拦截。'
      : 'Translation service timed out after 10s. Try a different network or check firewall.';
  }
  // WebSocket rejected before open — expired token or model not available
  if (/\u88ab\u62d2\u7edd|WebSocket was rejected/i.test(msg)) {
    return zh
      ? '翻译服务拒绝连接，可能是会话过期。重新按开始试试。'
      : 'Translation service refused the connection — likely an expired session. Tap Start again.';
  }
  // Generic WebSocket / network catch-all
  if (/WebSocket|socket|network/i.test(msg)) {
    return zh
      ? '连不上翻译服务。检查网络，再按开始。'
      : "Can't reach the translation service. Check your network and retry.";
  }
  // Fallback: show the raw message so power users + Sentry don't lose info.
  return zh
    ? `启动失败：${msg || '未知错误'}`
    : `Start failed: ${msg || 'unknown error'}`;
}

export default function ClassroomTab({ uiLang }: { uiLang: 'en' | 'zh' }) {
  const [showCompliance, setShowCompliance] = useState<boolean>(
    () => typeof window !== 'undefined' && !localStorage.getItem(COMPLIANCE_ACK_KEY)
  );
  const [agreed, setAgreed] = useState(false);
  const [audioSource, setAudioSource] = useState<'tab' | 'mic'>('tab');
  const [mode] = useState<'tutorial' | 'lecture'>('tutorial'); // tutorial only in Spike
  const [status, setStatus] = useState<Status>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('');
  // paused mirrors the live session's pause state so the button label
  // updates synchronously. Always reset in handleStart and handleStop.
  const [paused, setPaused] = useState(false);
  // Course selection — user picks a subject (e.g. "金融" / "计算机") and
  // we use that to (a) feed matching keyterms to Deepgram and (b) tell
  // Gemini the class context for better translation register. We keep
  // the custom-course text input for subjects not in our preset list
  // (e.g. "营销", "海洋生物学" etc.) — the custom string is passed to
  // Gemini as the subject; no preset keyterms in that case.
  const COURSE_KEY = 'memeflow_classroom_course';
  const COURSE_CUSTOM_KEY = 'memeflow_classroom_course_custom';
  const [selectedCourse, setSelectedCourse] = useState<string | null>(() => {
    try { return localStorage.getItem(COURSE_KEY); } catch { return null; }
  });
  const [customCourse, setCustomCourse] = useState<string>(() => {
    try { return localStorage.getItem(COURSE_CUSTOM_KEY) || ''; } catch { return ''; }
  });
  const [courseExpanded, setCourseExpanded] = useState(false);

  // Live Notes — structured study notes refreshed during the session.
  // Regenerated at most every LIVE_NOTES_MIN_INTERVAL_MS and only when
  // enough new transcript has accumulated, so we don't hammer gemini-
  // 3-pro on a quiet room. The refs track "last run wall clock" and
  // "last transcript length" to make that decision cheap.
  const LIVE_NOTES_MIN_INTERVAL_MS = 45000;
  const LIVE_NOTES_MIN_NEW_CHARS = 200;
  const [liveNotes, setLiveNotes] = useState<LiveNotes | null>(null);
  const [liveNotesLoading, setLiveNotesLoading] = useState(false);
  const liveNotesLastRunRef = useRef<number>(0);
  const liveNotesLastLenRef = useRef<number>(0);
  const liveNotesInFlightRef = useRef<boolean>(false);

  const [stream, setStream] = useState<StreamItem[]>([]);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  // Users who've already learned what the AI chat bar does can dismiss
  // the hint so their home screen stays compact. Persisted across reloads
  // since the lesson doesn't need to be re-taught each session.
  const [showAskHint, setShowAskHint] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem('memeflow_classroom_ask_hint_dismissed') !== 'true'
  );
  const dismissAskHint = () => {
    try { localStorage.setItem('memeflow_classroom_ask_hint_dismissed', 'true'); } catch { /* quota */ }
    setShowAskHint(false);
  };

  const sessionRef = useRef<LiveSessionHandle | null>(null);
  const itemCounter = useRef(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Mirror of `stream` kept in a ref so async handlers (e.g. handleAsk's
  // buildTranscriptContext) read the latest value, not a stale closure.
  const streamRef = useRef<StreamItem[]>([]);
  useEffect(() => { streamRef.current = stream; }, [stream]);

  // Deepgram+Gemini flow: transcription arrives first (interim → final),
  // then translation fires once the segment finalizes and Gemini returns.
  //
  // appendTranscriptionDelta REPLACES the transcription on the current
  // live line (interim guesses supersede each other; final supersedes the
  // last interim). When isFinal=true we also lock the English text and
  // spawn a fresh line for the next utterance — Deepgram's next Results
  // batch could overlap with this one in flight, so the UI must be ready
  // to host it while translation for the just-finalized line is pending.
  //
  // appendTranslationDelta fills in the Chinese translation for the most
  // recent line that has a transcription but no translation yet. If it
  // can't find such a line (translation came back faster than the next
  // transcription), it appends a fresh line.
  // Simpler + more robust version. Previously we searched back for an
  // unfinalized 'line' and gave up if we hit a finalized one first — that
  // broke when AI QA bubbles sat between segments, because the loop would
  // hit the QA item and never find or create a line. Now we walk the
  // whole array, flip unfinalized lines to the new text, and if we never
  // found one, append a fresh line. Simpler, no early break. When isFinal,
  // we mark that specific line as finalized so the next interim starts a
  // new bubble — which is the correct behaviour the user actually wants.
  const upsertLiveLine = (text: string, isFinal: boolean) => {
    setStream((prev) => {
      const next = [...prev];
      let target = -1;
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].kind === 'line' && !(next[i] as any).finalized) {
          target = i;
          break;
        }
      }
      if (target === -1) {
        next.push({
          kind: 'line',
          id: itemCounter.current++,
          translation: '',
          transcription: text,
          finalized: isFinal,
        });
      } else {
        const existing = next[target] as { kind: 'line'; id: number; translation: string; transcription: string; finalized: boolean };
        next[target] = { ...existing, transcription: text, finalized: isFinal };
      }
      return next;
    });
  };

  // Paragraph-mode translation handler. liveSession ships ONE pair per
  // flush where `en` is the whole paragraph (N finalized sentences joined
  // by ' '), and `zh` is a single coherent Chinese paragraph. We must
  // collapse the flurry of per-sentence English bubbles into ONE bubble
  // that shows the full English paragraph with its Chinese translation
  // underneath — otherwise the UI renders 1 English line + 1 Chinese
  // line alternating, which is the exact bug the paragraph refactor
  // aimed to eliminate.
  //
  // Strategy: find the contiguous tail of `line` items that are (a)
  // finalized and (b) still lack a translation. Merge them into the
  // first one (its transcription becomes the joined paragraph, its
  // translation becomes `zh`), drop the rest.
  const applyTranslationBatch = (pairs: Array<{ en: string; zh: string }>) => {
    setStream((prev) => {
      let next = [...prev];
      for (const pair of pairs) {
        // Collect indices of un-translated finalized lines in order.
        const indices: number[] = [];
        for (let i = 0; i < next.length; i++) {
          const item = next[i];
          if (item.kind === 'line' && item.finalized && !item.translation) {
            indices.push(i);
          }
        }
        if (indices.length === 0) {
          // Nothing to merge into — append a fresh paragraph bubble.
          next.push({
            kind: 'line',
            id: itemCounter.current++,
            translation: pair.zh,
            transcription: pair.en,
            finalized: true,
          });
          continue;
        }
        // Merge: first un-translated line carries the full paragraph.
        const firstIdx = indices[0];
        const first = next[firstIdx] as {
          kind: 'line'; id: number; translation: string; transcription: string; finalized: boolean;
        };
        // Prefer the server-side joined paragraph for transcription so
        // it matches the zh exactly. Falls back to the line's own text
        // if the server somehow sent an empty en.
        const mergedTranscription = pair.en || indices.map((i) => (next[i] as any).transcription).join(' ');
        next[firstIdx] = { ...first, transcription: mergedTranscription, translation: pair.zh };
        // Drop the rest (in reverse so indices stay valid).
        for (let k = indices.length - 1; k >= 1; k--) {
          next.splice(indices[k], 1);
        }
      }
      return next;
    });
  };

  const appendTranscriptionDelta = (delta: string, isFinal: boolean) => {
    upsertLiveLine(delta, isFinal);
  };

  const finalizeCurrentLine = () => {
    setStream((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        const item = next[i];
        if (item.kind === 'line' && !item.finalized) {
          next[i] = { ...item, finalized: true };
          return next;
        }
      }
      return prev;
    });
  };

  // Auto-scroll to latest content as the stream grows.
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [stream]);

  // Live Notes refresh trigger. Runs on every stream change, guarded by
  // min-interval and min-new-chars. The async work happens in the
  // background; liveNotesInFlightRef prevents overlapping refreshes
  // (pro can take 20-40s on a big transcript).
  useEffect(() => {
    if (status !== 'live') return;
    if (liveNotesInFlightRef.current) return;

    // Concatenate all finalized English segments from the stream — this
    // is what the teacher has actually said so far. We deliberately
    // skip interim text so mid-word guesses don't poison the notes.
    const englishSoFar = stream
      .filter((item) => item.kind === 'line' && item.finalized && item.transcription)
      .map((item) => (item as any).transcription as string)
      .join(' ');

    const now = Date.now();
    const sinceLast = now - liveNotesLastRunRef.current;
    const newChars = englishSoFar.length - liveNotesLastLenRef.current;

    if (englishSoFar.length < LIVE_NOTES_MIN_NEW_CHARS) return; // not enough yet
    if (sinceLast < LIVE_NOTES_MIN_INTERVAL_MS) return;
    if (newChars < LIVE_NOTES_MIN_NEW_CHARS) return;

    liveNotesInFlightRef.current = true;
    liveNotesLastRunRef.current = now;
    liveNotesLastLenRef.current = englishSoFar.length;
    setLiveNotesLoading(true);

    const courseName =
      selectedCourse === '__custom__'
        ? customCourse.trim() || undefined
        : selectedCourse
          ? (COURSE_PRESETS.find((p) => p.zh === selectedCourse || p.en === selectedCourse)
              ? (uiLang === 'zh'
                  ? COURSE_PRESETS.find((p) => p.zh === selectedCourse || p.en === selectedCourse)!.zh
                  : COURSE_PRESETS.find((p) => p.zh === selectedCourse || p.en === selectedCourse)!.en)
              : selectedCourse)
          : undefined;

    generateLiveNotes(englishSoFar, { course: courseName })
      .then((notes) => setLiveNotes(notes))
      .catch((err) => {
        console.warn('[classroom] live notes generation failed:', err);
        Sentry.captureException(err, { tags: { component: 'ClassroomTab', op: 'generateLiveNotes' } });
      })
      .finally(() => {
        liveNotesInFlightRef.current = false;
        setLiveNotesLoading(false);
      });
  }, [stream, status, selectedCourse, customCourse, uiLang]);

  const acknowledgeCompliance = () => {
    if (!agreed) return;
    try { localStorage.setItem(COMPLIANCE_ACK_KEY, new Date().toISOString()); } catch { /* quota */ }
    setShowCompliance(false);
  };

  const handleStart = async () => {
    if (status === 'connecting' || status === 'live' || status === 'requesting-token') return;
    setStream([]);
    setPaused(false);
    // Reset Live Notes between sessions so the panel doesn't show last
    // class's summary while the new class is warming up.
    setLiveNotes(null);
    setLiveNotesLoading(false);
    liveNotesLastRunRef.current = 0;
    liveNotesLastLenRef.current = 0;
    liveNotesInFlightRef.current = false;
    try {
      // Resolve the course → (display name, keyterm list) pair.
      //   - If user picked a preset ("金融"), use its zh name + preset terms.
      //   - If user is on the "其他" path with a custom subject ("海洋生物"),
      //     pass the custom string as course (for Gemini context) but no
      //     keyterms (we don't have a vocab list for it).
      //   - If nothing selected, pass neither.
      let course: string | undefined;
      let keyterms: string[] = [];
      if (selectedCourse === '__custom__') {
        const t = customCourse.trim();
        if (t) course = t;
      } else if (selectedCourse) {
        const preset = COURSE_PRESETS.find((p) => p.zh === selectedCourse || p.en === selectedCourse);
        if (preset) {
          course = uiLang === 'zh' ? preset.zh : preset.en;
          keyterms = preset.terms;
        }
      }
      try {
        if (selectedCourse) localStorage.setItem(COURSE_KEY, selectedCourse);
        else localStorage.removeItem(COURSE_KEY);
        localStorage.setItem(COURSE_CUSTOM_KEY, customCourse);
      } catch { /* quota */ }
      const handle = await startLiveSession(
        { audioSource, mode, targetLang: 'zh-CN', course, keyterms },
        {
          onStatusChange: (s, detail) => {
            setStatus(s);
            setStatusDetail(detail || '');
            // If Deepgram drops the socket mid-session (network blip,
            // firewall, token expiry on long class), let the user know
            // they need to hit Start again rather than silently freezing.
            if (s === 'error' && detail) {
              toast.error(
                uiLang === 'zh'
                  ? `连接中断：${detail}。点「开始」重连。`
                  : `Connection dropped: ${detail}. Hit Start to reconnect.`
              );
              sessionRef.current = null;
            }
          },
          onTranslationBatch: applyTranslationBatch,
          onTranscriptionDelta: appendTranscriptionDelta,
        }
      );
      sessionRef.current = handle;
    } catch (e: any) {
      console.error('Start session failed:', e);
      // Map the dozen different ways "start" can fail into short, actionable
      // user copy. The raw error is always stashed in statusDetail so power
      // users + Sentry still see the full story.
      const friendly = friendlyStartError(e, audioSource, uiLang);
      setStatus('error');
      setStatusDetail(friendly);
      toast.error(friendly);
      Sentry.captureException(e, { tags: { component: 'ClassroomTab', op: 'startLiveSession', audioSource } });
    }
  };

  const togglePause = () => {
    const handle = sessionRef.current;
    if (!handle) return;
    if (handle.isPaused()) {
      handle.resume();
      setPaused(false);
    } else {
      handle.pause();
      setPaused(true);
    }
  };

  const handleStop = async () => {
    if (!sessionRef.current) return;
    const handle = sessionRef.current;
    const transcript = handle.getTranscript();
    try {
      await handle.stop();
    } finally {
      sessionRef.current = null;
      setPaused(false);
    }
    // Persist the session so the user can find their notes later.
    // Best-effort; a save failure doesn't punish the UX — they still have
    // the live subtitles on screen.
    const user = auth.currentUser;
    if (user && transcript.trim().length > 0) {
      try {
        await addDoc(collection(db, 'classSessions'), {
          uid: user.uid,
          mode,
          audioSource,
          startedAt: Timestamp.now(),
          endedAt: Timestamp.now(),
          transcript,
          createdAt: serverTimestamp(),
        });
        toast.success(uiLang === 'zh' ? '笔记已保存' : 'Notes saved');
      } catch (e: any) {
        console.warn('Save class session failed:', e);
        Sentry.captureException(e, { tags: { component: 'ClassroomTab', op: 'firestore.write', collection: 'classSessions' } });
        toast.error(uiLang === 'zh' ? '保存笔记失败' : 'Could not save notes');
      }
    }
  };

  // Pull the most recent N lines of subtitle translation to hand to the AI
  // as context. Cap at ~2000 chars so the system prompt + user question fit
  // comfortably within the model's context window on long sessions. We walk
  // back from newest → oldest and stop when we have enough.
  const buildTranscriptContext = (): string => {
    const items = streamRef.current;
    const lines: string[] = [];
    let total = 0;
    const MAX = 2000;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind !== 'line') continue;
      const piece = it.translation.trim();
      if (!piece) continue;
      if (total + piece.length > MAX) break;
      lines.unshift(piece); // preserve chronological order
      total += piece.length;
    }
    return lines.join('\n');
  };

  const handleAsk = async () => {
    const q = question.trim();
    if (!q || isAsking) return;
    setQuestion('');

    // Append a pending QA item at the current end of the stream so the user
    // sees their question immediately, in the context where they asked it.
    const qaId = itemCounter.current++;
    setStream((prev) => [
      ...prev,
      { kind: 'qa', id: qaId, question: q, answer: '', pending: true },
    ]);

    setIsAsking(true);
    try {
      const context = buildTranscriptContext();
      const systemContext = context
        ? `你是国际学生的课堂学习助手。用户正在上一节英文课，以下是老师最近讲过的内容（中文翻译）:\n\n${context}\n\n用户现在有一个问题，请用简洁的中文回答。如果问题涉及术语，给出中英对照。如果问题跨越了上面的上下文，可以据你自己的知识作答。`
        : '你是国际学生的学习助手。用户刚打开课堂同传，还没开始上课。请简洁地用中文回答他们的问题。';
      const answer = await aiChat([
        { role: 'user', text: systemContext },
        { role: 'ai', text: '好，我会根据课堂内容回答。' },
        { role: 'user', text: q },
      ]);
      setStream((prev) =>
        prev.map((it) =>
          it.kind === 'qa' && it.id === qaId ? { ...it, answer, pending: false } : it
        )
      );
    } catch (e: any) {
      console.error('Ask AI failed:', e);
      setStream((prev) =>
        prev.map((it) =>
          it.kind === 'qa' && it.id === qaId
            ? { ...it, answer: uiLang === 'zh' ? '（问答失败，请重试）' : '(Ask failed, try again)', pending: false }
            : it
        )
      );
      Sentry.captureException(e, { tags: { component: 'ClassroomTab', op: 'askAI' } });
    } finally {
      setIsAsking(false);
    }
  };

  const isLive = status === 'live';
  const isBusy = status === 'connecting' || status === 'requesting-token';

  // Safety cap: auto-stop after 60 minutes of uninterrupted live time.
  // Background: Deepgram bills by the minute, and a user who forgets to
  // hit Stop (left the tab open overnight) could silently burn hours of
  // transcription credit. One hour matches a typical lecture and is far
  // above any realistic legitimate session. Cap is enforced purely on
  // the client — not a security boundary, but a sharp edge for the
  // 99%-case "laptop left open" footgun.
  const MAX_SESSION_MINUTES = 60;
  useEffect(() => {
    if (status !== 'live') return;
    const t = setTimeout(() => {
      if (sessionRef.current) {
        toast.warning(
          uiLang === 'zh'
            ? `已自动结束：单次课堂同传最长 ${MAX_SESSION_MINUTES} 分钟，防止忘记关。`
            : `Auto-stopped: classroom sessions cap at ${MAX_SESSION_MINUTES} minutes to avoid runaway usage.`,
          { duration: 10000 }
        );
        void handleStop();
      }
    }, MAX_SESSION_MINUTES * 60 * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-6">
      {/* Compliance gate — force-read + consent before any audio capture. */}
      <AnimatePresence>
        {showCompliance && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="bg-amber-100 p-2 rounded-xl shrink-0">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="font-black text-xl text-gray-900 mb-1">
                    课堂同传：使用前必读
                  </h2>
                  <p className="text-sm text-gray-500">Read before using · 英文版见下</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-2">
                <p className="font-bold">此功能会把课堂音频流式上传到 Google Gemini 进行实时翻译。</p>
                <p>
                  请你在使用前：
                </p>
                <ul className="space-y-1 list-disc pl-5">
                  <li>确认你所在的大学/学院<strong>允许</strong>在课堂上使用此类工具（查学生手册或问教务）</li>
                  <li>必要时事先征得<strong>授课老师的同意</strong></li>
                  <li>不要在涉密/隐私敏感的讨论（医学、法律案例）中使用</li>
                </ul>
                <p className="text-xs text-amber-700 pt-2">
                  memeflow 不存储原始音频，转录完即丢弃。但"把课堂音频发给第三方"本身在部分学校政策里可能构成违规，后果由用户自担。
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-500">
                <strong>EN:</strong> This feature streams classroom audio to Google Gemini for real-time translation.
                Before using, confirm your institution permits such tools, obtain instructor consent
                where required, and avoid using in confidential/privileged sessions (medical, legal).
                memeflow does not persist raw audio. You assume responsibility for policy compliance.
              </div>

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 accent-blue-600"
                />
                <span className="text-sm text-gray-700">
                  我已阅读并理解上述内容，确认使用本功能所产生的责任由我自己承担。
                </span>
              </label>

              <button
                onClick={acknowledgeCompliance}
                disabled={!agreed}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
              >
                我理解并同意，进入课堂同传
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header + controls */}
      <div className="bg-white/60 backdrop-blur-md border border-white/60 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-black text-gray-900 text-lg">课堂同传</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              实时把英文课堂翻译成中文 · 内测功能
            </p>
          </div>
          <div className="flex items-center gap-1">
            {auth.currentUser && (
              <ClassNotesModal uiLang={uiLang} userId={auth.currentUser.uid} />
            )}
            <span className="text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-2 py-1 rounded-md">
              Beta
            </span>
          </div>
        </div>

        {/* Audio source toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAudioSource('tab')}
            disabled={isLive || isBusy}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              audioSource === 'tab'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white/70 text-gray-600 border border-gray-200 hover:bg-blue-50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Monitor className="w-4 h-4" />
            {uiLang === 'zh' ? '网课' : 'Online class'}
          </button>
          <button
            onClick={() => setAudioSource('mic')}
            disabled={isLive || isBusy}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              audioSource === 'mic'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white/70 text-gray-600 border border-gray-200 hover:bg-blue-50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Mic className="w-4 h-4" />
            {uiLang === 'zh' ? '线下课' : 'In-person class'}
          </button>
        </div>

        {/* Course picker: tap a subject and AI focuses on that domain.
            Collapsible so the header stays uncluttered for returning
            users who've already got their course pinned. */}
        <div className="rounded-xl border border-gray-200 bg-white/60">
          <button
            type="button"
            onClick={() => setCourseExpanded((v) => !v)}
            disabled={isLive || isBusy}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              {uiLang === 'zh' ? '这节课是什么课？（可选，让翻译更准）' : 'What class is this? (optional, better translation)'}
            </span>
            <span className="text-blue-600 font-bold">
              {(() => {
                if (!selectedCourse) return uiLang === 'zh' ? '未选' : 'none';
                if (selectedCourse === '__custom__') {
                  const t = customCourse.trim();
                  if (t) return t;
                  return uiLang === 'zh' ? '其他（未填写）' : 'Other (empty)';
                }
                const preset = COURSE_PRESETS.find((p) => p.zh === selectedCourse || p.en === selectedCourse);
                if (preset) return uiLang === 'zh' ? preset.zh : preset.en;
                return selectedCourse;
              })()}
            </span>
          </button>
          {courseExpanded && (
            <div className="px-3 pb-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {COURSE_PRESETS.map((p) => {
                  const active = selectedCourse === p.zh || selectedCourse === p.en;
                  return (
                    <button
                      key={p.en}
                      type="button"
                      disabled={isLive || isBusy}
                      onClick={() => setSelectedCourse(active ? null : p.zh)}
                      className={
                        'text-xs px-2.5 py-1 rounded-full border transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed ' +
                        (active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-200')
                      }
                    >
                      {uiLang === 'zh' ? p.zh : p.en}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={isLive || isBusy}
                  onClick={() => setSelectedCourse(selectedCourse === '__custom__' ? null : '__custom__')}
                  className={
                    'text-xs px-2.5 py-1 rounded-full border transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed ' +
                    (selectedCourse === '__custom__'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-200')
                  }
                >
                  {uiLang === 'zh' ? '其他…' : 'Other…'}
                </button>
              </div>

              {selectedCourse === '__custom__' && (
                <input
                  type="text"
                  value={customCourse}
                  onChange={(e) => setCustomCourse(e.target.value)}
                  disabled={isLive || isBusy}
                  placeholder={uiLang === 'zh' ? '比如：营销学、海洋生物、古典音乐史' : 'e.g. Marketing, Marine Biology'}
                  className="mt-2 w-full text-xs bg-white border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              )}

              <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                {uiLang === 'zh'
                  ? 'AI 会按这门课的场景翻译专业术语。会记住你上次选的。'
                  : 'AI translates with that subject\'s register. Your last pick is remembered.'}
              </p>
            </div>
          )}
        </div>

        {audioSource === 'tab' && !isLive && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-100">
            {uiLang === 'zh' ? (
              <>
                <strong>提示：</strong>
                点"开始"后浏览器会让你选上课用的那个标签页，
                <strong>记得勾上"共享标签页音频"</strong>。
              </>
            ) : (
              <>
                <strong>Tip:</strong> When you tap Start, the browser asks
                which tab to share — pick the class tab and{' '}
                <strong>tick "Share tab audio"</strong>.
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {!isLive ? (
            <button
              onClick={handleStart}
              disabled={isBusy}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isBusy
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <Play className="w-5 h-5" />}
              {isBusy
                ? (uiLang === 'zh'
                    ? (status === 'requesting-token' ? '准备中…' : '连接中…')
                    : (status === 'requesting-token' ? 'Preparing…' : 'Connecting…'))
                : (uiLang === 'zh' ? '开始' : 'Start')}
            </button>
          ) : (
            <>
              {/* Pause keeps the Deepgram connection warm (keepAlive still
                  fires) so resume is instant. When paused, no audio is
                  sent — useful for stepping away or between lectures. */}
              <button
                onClick={togglePause}
                className="flex items-center justify-center gap-2 bg-white text-gray-800 border border-gray-200 px-4 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                title={paused ? (uiLang === 'zh' ? '继续' : 'Resume') : (uiLang === 'zh' ? '暂停' : 'Pause')}
              >
                {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                <span className="hidden sm:inline">
                  {paused ? (uiLang === 'zh' ? '继续' : 'Resume') : (uiLang === 'zh' ? '暂停' : 'Pause')}
                </span>
              </button>
              <button
                onClick={handleStop}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors"
              >
                <Square className="w-5 h-5" />
                {uiLang === 'zh' ? '结束并保存笔记' : 'Stop & save notes'}
              </button>
            </>
          )}
        </div>

        {/* Hint: explain what the AI chat bar at the bottom does. First-run
            users see it; anyone who taps × never sees it again on this
            device. Persistence on purpose — re-teaching the same thing
            each session would be noise. */}
        {showAskHint && (
        <div className="relative pr-7 text-xs text-gray-500 leading-relaxed">
          <p>
            {uiLang === 'zh' ? (
              <>
                上课没听懂？直接在下方<span className="text-blue-600 font-semibold">「问 AI」</span>输入你的问题 —
                比如「老师刚才说的 CAPM 是啥？」AI 会根据已经讲过的内容用中文回答。
              </>
            ) : (
              <>
                Missed something? Just type your question in the{' '}
                <span className="text-blue-600 font-semibold">Ask AI</span>{' '}
                bar below — e.g. "what did the prof mean by CAPM?" AI replies in Chinese using what's been said so far.
              </>
            )}
          </p>
          <button
            onClick={dismissAskHint}
            aria-label={uiLang === 'zh' ? '收起提示' : 'Dismiss hint'}
            title={uiLang === 'zh' ? '我知道了，不再显示' : 'Got it, hide'}
            className="absolute top-0 right-0 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        )}

        {/* Status pill */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-block w-2 h-2 rounded-full ${
            status === 'live' ? 'bg-green-500 animate-pulse' :
            status === 'error' ? 'bg-red-500' :
            status === 'connecting' || status === 'requesting-token' ? 'bg-amber-500 animate-pulse' :
            'bg-gray-300'
          }`} />
          <span className="text-gray-500">
            {uiLang === 'zh' ? (
              <>
                {status === 'live' && '正在监听…'}
                {status === 'connecting' && '连接中…'}
                {status === 'requesting-token' && '准备中…'}
                {status === 'stopped' && '已结束'}
                {status === 'error' && (statusDetail || '启动失败，请重试')}
                {status === 'idle' && '未开始'}
              </>
            ) : (
              <>
                {status === 'live' && 'Listening…'}
                {status === 'connecting' && 'Connecting…'}
                {status === 'requesting-token' && 'Preparing…'}
                {status === 'stopped' && 'Stopped'}
                {status === 'error' && (statusDetail || 'Start failed, try again')}
                {status === 'idle' && 'Not started'}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Unified stream: subtitle lines + AI Q&A exchanges interleaved in
          chronological order so users see their questions sitting next to
          the bit of class that triggered them. */}
      <div
        ref={scrollerRef}
        className="bg-white/60 backdrop-blur-md border border-white/60 rounded-3xl p-5 min-h-[320px] max-h-[50vh] overflow-y-auto space-y-3 shadow-sm"
      >
        {stream.length === 0 && status !== 'live' && (
          <div className="text-center text-gray-400 py-16 text-sm">
            {uiLang === 'zh'
              ? '点"开始"后字幕会出现在这里。上课中可以随时问 AI 任何问题。'
              : 'Tap Start and subtitles will appear here. Ask AI anything while the class is live.'}
          </div>
        )}
        {stream.map((item) => {
          if (item.kind === 'line') {
            return (
              <div key={`l-${item.id}`} className={`space-y-1 ${item.finalized ? 'opacity-80' : ''}`}>
                {item.transcription && (
                  <p className="text-xs text-gray-400 leading-relaxed">{item.transcription}</p>
                )}
                <p className={`leading-relaxed ${
                  item.finalized
                    ? 'text-gray-800 text-base'
                    : 'text-gray-900 text-base font-medium'
                }`}>{item.translation}</p>
              </div>
            );
          }
          // QA bubble: rendered inside the subtitle stream. Blue-tinted
          // card so it stands out from plain subtitles without feeling
          // like a different app mode.
          return (
            <div key={`q-${item.id}`} className="bg-blue-50 border border-blue-100 rounded-xl p-3 my-2">
              <div className="flex items-start gap-2 mb-2">
                <div className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 mt-0.5">
                  {uiLang === 'zh' ? '你' : 'You'}
                </div>
                <p className="text-sm text-gray-800 leading-relaxed">{item.question}</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="bg-white border border-blue-200 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 mt-0.5 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  AI
                </div>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap flex-1">
                  {item.pending
                    ? <Loader2 className="w-4 h-4 animate-spin text-blue-400 inline" />
                    : item.answer}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live structured notes — refreshes in the background every 45s
          when new material has accumulated. Collapsible; only renders
          once there's something to show. */}
      <LiveNotesPanel notes={liveNotes} loading={liveNotesLoading} uiLang={uiLang} />

      {/* Ask-AI chat bar — always visible, works before/during/after
          live session. Uses aiChat() with the current transcript as
          system context so the user can ask "what did they mean by X?"
          without copy-pasting anything. */}
      <div className="bg-white/60 backdrop-blur-md border border-white/60 rounded-2xl p-3 shadow-sm flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-500 shrink-0 ml-1" />
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
          placeholder={uiLang === 'zh' ? '问 AI 任何问题…（如：刚才讲的 CAPM 是啥？）' : 'Ask AI anything… (e.g. what did they mean by CAPM?)'}
          disabled={isAsking}
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 placeholder:text-gray-400 disabled:opacity-50"
        />
        <button
          onClick={handleAsk}
          disabled={isAsking || question.trim().length === 0}
          className="bg-blue-600 text-white p-2 rounded-xl disabled:opacity-40 hover:bg-blue-700 transition-colors"
          aria-label={uiLang === 'zh' ? '发送' : 'Send'}
        >
          {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {/* Save indicator — toast also announces success, this is the inline confirmation */}
      {status === 'stopped' && stream.length > 0 && (
        <div className="flex items-center justify-center text-xs text-gray-400 gap-1.5">
          <Save className="w-3.5 h-3.5" />
          {uiLang === 'zh' ? '笔记已自动保存到云端' : 'Notes saved to the cloud'}
        </div>
      )}
    </div>
  );
}
