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
import { aiChat, translateSimple } from '../services/ai';
import { cn } from '../lib/utils';

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
  | { kind: 'line'; id: number; translation: string; transcription: string; finalized: boolean; failed?: boolean }
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

export default function ClassroomTab({ uiLang, isPro = false }: { uiLang: 'en' | 'zh'; isPro?: boolean }) {
  const [showCompliance, setShowCompliance] = useState<boolean>(
    () => typeof window !== 'undefined' && !localStorage.getItem(COMPLIANCE_ACK_KEY)
  );
  const [agreed, setAgreed] = useState(false);
  // audioSource — persisted in localStorage so users who picked mic
  // last time don't have to re-pick on every visit. First-ever visit
  // defaults to 'mic' (Apr 2026 product call: most users record their
  // own speech rather than dub a tab; the tab path is the niche case).
  // Wrapped in try/catch because localStorage can throw in private mode
  // or when the quota is exhausted.
  const AUDIO_SOURCE_KEY = 'memeflow_classroom_audio_source';
  const [audioSource, setAudioSource] = useState<'tab' | 'mic'>(() => {
    try {
      const saved = localStorage.getItem(AUDIO_SOURCE_KEY);
      return saved === 'tab' || saved === 'mic' ? saved : 'mic';
    } catch {
      return 'mic';
    }
  });
  // Persist on every change so the next session picks up the same value
  // even if the user closes the tab without hitting Start.
  useEffect(() => {
    try { localStorage.setItem(AUDIO_SOURCE_KEY, audioSource); } catch { /* quota / private mode */ }
  }, [audioSource]);
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

  // UI state for startup friction + live focus:
  //   - `isConfigExpanded`: full config card vs. one-line summary. Starts
  //     true (idle) so new users see the options; auto-collapses when the
  //     session goes live, so the subtitle stream gets the screen.
  //   - `showCourseDetail`: whether the COURSE + CUSTOM rows are visible.
  //     Collapsed by default so first-time users aren't confronted with
  //     a wall of options — they can tap "修改" to expand.
  const [isConfigExpanded, setIsConfigExpanded] = useState(true);
  const [showCourseDetail, setShowCourseDetail] = useState(false);

  // Auto-collapse the config card the moment we leave `idle` — i.e. as
  // soon as the user hits Start. They can still tap "展开配置" to peek.
  useEffect(() => {
    if (status !== 'idle' && status !== 'stopped' && status !== 'error') {
      setIsConfigExpanded(false);
    } else if (status === 'idle') {
      setIsConfigExpanded(true);
    }
  }, [status]);

  // Live Notes — structured study notes refreshed during the session.
  // Regenerated at most every LIVE_NOTES_MIN_INTERVAL_MS and only when
  // enough new transcript has accumulated, so we don't hammer gemini-
  // 3-pro on a quiet room. The refs track "last run wall clock" and
  // "last transcript length" to make that decision cheap.
  const LIVE_NOTES_MIN_INTERVAL_MS = 45000;
  const LIVE_NOTES_MIN_NEW_CHARS = 200;
  const [liveNotes, setLiveNotes] = useState<LiveNotes | null>(null);
  const [liveNotesLoading, setLiveNotesLoading] = useState(false);
  // `notesLastUpdatedAt` is the wall-clock ms at which the panel last
  // received a fresh Gemini summary. Drives the "updated Xs ago" chip.
  // `isSavingLiveNotes` gates the save button while we write to Firestore.
  const [notesLastUpdatedAt, setNotesLastUpdatedAt] = useState<number>(0);
  const [isSavingLiveNotes, setIsSavingLiveNotes] = useState(false);
  const liveNotesLastRunRef = useRef<number>(0);
  const liveNotesLastLenRef = useRef<number>(0);
  const liveNotesInFlightRef = useRef<boolean>(false);

  const [stream, setStream] = useState<StreamItem[]>([]);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  // Translation mode — paragraph (smooth, slight delay) vs realtime
  // (per-sentence, low latency but jumpier). Persisted in localStorage.
  const TRANSLATION_MODE_KEY = 'memeflow_classroom_translation_mode';
  const [translationMode, setTranslationMode] = useState<'paragraph' | 'realtime'>(() => {
    try {
      const v = localStorage.getItem(TRANSLATION_MODE_KEY);
      return v === 'realtime' ? 'realtime' : 'paragraph';
    } catch { return 'paragraph'; }
  });
  useEffect(() => {
    try { localStorage.setItem(TRANSLATION_MODE_KEY, translationMode); } catch { /* quota */ }
  }, [translationMode]);

  // In-flight translation indicator — a Set of batch keys currently
  // translating. We render a "翻译中…" placeholder whenever the set is
  // non-empty so users know the Chinese is on its way and not broken.
  const [pendingTranslations, setPendingTranslations] = useState<Set<string>>(new Set());

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
  // Set to true while we're tearing down after an error — tells the
  // onStatusChange handler to ignore stop()'s tail 'stopped' event so
  // the red error banner doesn't get overwritten with "Stopped".
  const cleanupAfterErrorRef = useRef(false);
  const itemCounter = useRef(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Manual-reconnect visibility: show a "卡住了？重连" button when the
  // auto-recovery watchdog hasn't fired yet but the signal pattern looks
  // stuck from the user's side. Conditions (ANY triggers show):
  //   - >15 s since the last non-empty final AND user was speaking in
  //     the last 10 s (RMS > 300).
  //   - Empty-final streak >= 8 (watchdog triggers at streak 6 with
  //     tighter time conditions; this is the softer catch).
  // Refreshed every 2 s during a live session. Only relevant when
  // status === 'live'.
  const [showManualReconnect, setShowManualReconnect] = useState(false);
  useEffect(() => {
    if (status !== 'live') {
      if (showManualReconnect) setShowManualReconnect(false);
      return;
    }
    const id = setInterval(() => {
      const handle = sessionRef.current;
      if (!handle) return;
      const info = handle.getStuckInfo();
      const speakingRecently = info.msSinceLastRmsWindow < 10_000 && info.lastRms > 300;
      const longNoFinal = info.msSinceLastNonEmptyFinal > 15_000;
      const streakyEmpty = info.emptyFinalStreak >= 8;
      const shouldShow = (speakingRecently && longNoFinal) || streakyEmpty;
      setShowManualReconnect((prev) => (prev === shouldShow ? prev : shouldShow));
    }, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleManualReconnect = () => {
    sessionRef.current?.forceReconnect();
    setShowManualReconnect(false);
    toast.info(uiLang === 'zh' ? '正在重新连接识别引擎…' : 'Reconnecting ASR…');
  };
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
  // Sentinel zh string returned by liveSession.translateBatch when Gemini
  // fails after retries. Identifying it here lets the UI surface a "重试"
  // button (PR4 — 2026-04-27) instead of leaving the user with a frozen
  // "翻译失败" string and no recourse.
  const TRANSLATION_FAILED_ZH = '（翻译失败，稍后重试）';

  const applyTranslationBatch = (pairs: Array<{ en: string; zh: string; sentences: string[] }>) => {
    setStream((prev) => {
      let next = [...prev];
      for (const pair of pairs) {
        const isFailed = pair.zh === TRANSLATION_FAILED_ZH;
        // Realtime mode: session emits one pair per finalized sentence.
        // pair.en matches exactly one line; 1:1 match, no merge.
        if (translationMode === 'realtime') {
          let matched = false;
          for (let i = next.length - 1; i >= 0; i--) {
            const item = next[i];
            if (item.kind !== 'line') continue;
            if (!item.finalized) continue;
            if (item.translation) continue;
            if (item.transcription === pair.en) {
              next[i] = { ...item, translation: pair.zh, failed: isFailed };
              matched = true;
              break;
            }
          }
          if (!matched) {
            for (let i = 0; i < next.length; i++) {
              const item = next[i];
              if (item.kind === 'line' && item.finalized && !item.translation) {
                next[i] = { ...item, translation: pair.zh, failed: isFailed };
                matched = true;
                break;
              }
            }
          }
          if (!matched) {
            next.push({
              kind: 'line', id: itemCounter.current++,
              translation: pair.zh, transcription: pair.en, finalized: true, failed: isFailed,
            });
          }
          continue;
        }

        // Paragraph mode: session flushed N sentences and Gemini returned
        // ONE paragraph translation. We merge EXACTLY those N un-translated
        // finalized lines into the first — not "all un-translated finalized
        // lines", because between flushBatch() and Gemini's return, more
        // sentences may have landed in the stream. Greedy merging used to
        // swallow them (the "吞英文" bug: D arrived after flush, then got
        // splice-deleted when A+B+C's translation returned).
        //
        // Precise merge: only the first `pair.sentences.length` un-translated
        // finalized lines belong to THIS pair. Later ones stay untouched and
        // will be picked up by the next flushBatch+translate cycle.
        const N = Math.max(1, pair.sentences?.length ?? 1);
        const indices: number[] = [];
        for (let i = 0; i < next.length && indices.length < N; i++) {
          const item = next[i];
          if (item.kind === 'line' && item.finalized && !item.translation) {
            indices.push(i);
          }
        }
        if (indices.length === 0) {
          next.push({
            kind: 'line',
            id: itemCounter.current++,
            translation: pair.zh,
            transcription: pair.en,
            finalized: true,
            failed: isFailed,
          });
          continue;
        }
        const firstIdx = indices[0];
        const first = next[firstIdx] as {
          kind: 'line'; id: number; translation: string; transcription: string; finalized: boolean; failed?: boolean;
        };
        const mergedTranscription = pair.en || indices.map((i) => (next[i] as any).transcription).join(' ');
        next[firstIdx] = { ...first, transcription: mergedTranscription, translation: pair.zh, failed: isFailed };
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

  // Resolve current course context for prompt building. Mirrors the
  // logic in startSession (single source of truth would be nicer; this
  // small duplication is the simplest path while we keep startSession's
  // local-var idiom). Used by retryFailedTranslation below.
  const resolveActiveCourse = (): string | undefined => {
    if (selectedCourse === '__custom__') {
      const t = customCourse.trim();
      return t || undefined;
    }
    if (selectedCourse) {
      const preset = COURSE_PRESETS.find((p) => p.zh === selectedCourse || p.en === selectedCourse);
      if (preset) return uiLang === 'zh' ? preset.zh : preset.en;
    }
    return undefined;
  };

  // Retry handler for a failed translation card (PR4 — 2026-04-27).
  // Re-runs the same prompt liveSession would have built and updates the
  // line in place. While in flight the card swaps from "翻译失败 ⚠️ 重试"
  // back to "翻译中…" so users get clear feedback the retry is happening.
  const retryFailedTranslation = async (lineId: number) => {
    const target = stream.find((it) => it.kind === 'line' && it.id === lineId);
    if (!target || target.kind !== 'line') return;
    const englishParagraph = target.transcription;
    if (!englishParagraph) return;

    // Reset to "in flight" state so user sees activity.
    setStream((prev) => prev.map((it) =>
      it.kind === 'line' && it.id === lineId
        ? { ...it, translation: '', failed: false }
        : it
    ));

    const activeCourse = resolveActiveCourse();
    const courseHint = activeCourse
      ? ` The class subject is: ${activeCourse}. Translate technical terms in that subject's convention; keep well-known English initialisms (e.g. CAPM, GDP, DNA) untranslated.`
      : '';
    const prompt = `You are translating a live classroom lecture from English to Chinese for a Chinese international student.${courseHint}

The input below is a continuous paragraph of spoken English from a live lecture (transcribed by a speech model, so it may contain repetitions or filler). Produce a SINGLE natural, fluent Chinese paragraph that reads as if a Chinese teacher re-explained the same material. Do not mirror every word — clean up repetitions, smooth broken phrasing, and group related sentences into flowing Chinese prose.

Rules:
- Output is ONE Chinese paragraph. No bullet points, no numbering, no English.
- Keep the teaching register (口语化 / 教学用语), not stiff written Chinese.
- Preserve technical terms the student needs to learn; if the English phrase is the teaching target (e.g. "fresh powder", "pit stop"), keep it in parentheses after the Chinese gloss, like: 新雪（fresh powder）.
- Do not add commentary about the quality of the transcription.

English paragraph:
${englishParagraph}`;

    try {
      const zh = (await translateSimple(prompt)).trim();
      setStream((prev) => prev.map((it) =>
        it.kind === 'line' && it.id === lineId
          ? { ...it, translation: zh, failed: false }
          : it
      ));
    } catch (e) {
      Sentry.captureException(e, { tags: { component: 'ClassroomTab', op: 'retryFailedTranslation' } });
      setStream((prev) => prev.map((it) =>
        it.kind === 'line' && it.id === lineId
          ? { ...it, translation: TRANSLATION_FAILED_ZH, failed: true }
          : it
      ));
      toast.error(uiLang === 'zh' ? '重试失败，请稍后再试' : 'Retry failed, please try again later');
    }
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

  // Smart scroll (PR3 — 2026-04-27 upgrade):
  //   - User near bottom (within 100px) → auto-stick to latest, like a chat app
  //   - User scrolled up to read → don't yank, show a "↓ N new" button
  // The threshold is the standard YouTube Live / Discord cutoff. 100px ≈ 5
  // lines of subtitle text — enough to absorb line-height jitter from
  // streaming interim text but tight enough that "I scrolled up to read"
  // is detected reliably.
  const STICK_THRESHOLD_PX = 100;
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const lastSeenStreamLenRef = useRef(0);

  // Auto-scroll on stream change — only when user is at bottom.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (distanceFromBottom <= STICK_THRESHOLD_PX) {
      el.scrollTop = el.scrollHeight;
      lastSeenStreamLenRef.current = stream.length;
      setUnseenCount(0);
    } else {
      // User has scrolled away — count new items they haven't seen.
      // We approximate "new" by stream length growth since last bottom-stick.
      const delta = stream.length - lastSeenStreamLenRef.current;
      if (delta > 0) setUnseenCount(delta);
    }
  }, [stream]);

  // Track scroll position so the "↓ N new" pill knows when to hide.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const handler = () => {
      const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
      const atBottom = distanceFromBottom <= STICK_THRESHOLD_PX;
      setIsAtBottom(atBottom);
      if (atBottom) {
        lastSeenStreamLenRef.current = stream.length;
        setUnseenCount(0);
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [stream.length]);

  const jumpToLatest = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    lastSeenStreamLenRef.current = stream.length;
    setUnseenCount(0);
  };

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
      .then((notes) => {
        setLiveNotes(notes);
        setNotesLastUpdatedAt(Date.now());
      })
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

  /**
   * Save the current Live Notes snapshot to the `classNotes` collection
   * so the user can find it from the notes page later. This is an
   * explicit, in-the-moment save — unlike the classSessions write on
   * stop, which persists the raw transcript. Here we persist the
   * distilled, Gemini-generated study object.
   *
   * Write failures surface as a toast AND a Sentry event — silent fails
   * would make the button look broken.
   */
  const handleSaveLiveNotesToClassNotes = async () => {
    const zh = uiLang === 'zh';
    if (!liveNotes) {
      toast.error(zh ? '还没有可保存的笔记' : 'No notes to save yet');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      toast.error(zh ? '请先登录再保存笔记' : 'Sign in to save notes');
      return;
    }
    // Resolve the course display name the same way the live-notes
    // refresh job does, so saved notes carry the course label the user
    // was actually seeing on screen.
    let courseLabel: string | undefined;
    if (selectedCourse === '__custom__') {
      const t = customCourse.trim();
      if (t) courseLabel = t;
    } else if (selectedCourse) {
      const preset = COURSE_PRESETS.find((p) => p.zh === selectedCourse || p.en === selectedCourse);
      if (preset) courseLabel = uiLang === 'zh' ? preset.zh : preset.en;
      else courseLabel = selectedCourse;
    }
    setIsSavingLiveNotes(true);
    try {
      await addDoc(collection(db, 'classNotes'), {
        uid: user.uid,
        title: liveNotes.title ?? '',
        overview: liveNotes.overview ?? [],
        keyPoints: liveNotes.keyPoints ?? [],
        course: courseLabel ?? null,
        mode: translationMode,
        savedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      toast.success(zh ? '已保存到笔记' : 'Saved to notes');
    } catch (e) {
      console.error('[classroom] save live notes failed:', e);
      Sentry.captureException(e, { tags: { component: 'ClassroomTab', op: 'saveLiveNotes' } });
      toast.error(zh ? '保存失败，请稍后重试' : 'Save failed, please try again');
    } finally {
      setIsSavingLiveNotes(false);
    }
  };

  /**
   * "Export PDF" without pulling in a PDF library. We rely on the
   * browser's built-in print → "Save as PDF" flow: temporarily swap
   * document.title to the notes title (so the default filename is
   * meaningful) then trigger window.print. The toast tells the user
   * what to do in the print dialog.
   */
  const handleExportLiveNotesPdf = async () => {
    const zh = uiLang === 'zh';
    if (!liveNotes) {
      toast.error(zh ? '还没有可导出的笔记' : 'No notes to export yet');
      return;
    }
    try {
      // Lazy-load jspdf — keeps initial bundle lean for users who never export.
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 48;
      let y = margin;

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      const title = liveNotes.title || (zh ? 'MemeFlow 实时笔记' : 'MemeFlow Live Notes');
      doc.text(title, margin, y);
      y += 28;

      // Subtitle: date
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(new Date().toISOString().slice(0, 10), margin, y);
      y += 24;
      doc.setTextColor(0);

      const writeSection = (heading: string, lines: string[]) => {
        if (!lines || lines.length === 0) return;
        if (y > 760) { doc.addPage(); y = margin; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(heading, margin, y);
        y += 18;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        for (const line of lines) {
          // Strip ** markers (LiveNotes uses **bold** in text) — jsPDF core fonts don't handle mixed bold inline.
          const clean = (line || '').replace(/\*\*/g, '');
          const wrapped = doc.splitTextToSize('· ' + clean, pageW - margin * 2);
          for (const w of wrapped) {
            if (y > 780) { doc.addPage(); y = margin; }
            doc.text(w, margin, y);
            y += 15;
          }
          y += 4;
        }
        y += 10;
      };

      writeSection(zh ? '概述 Overview' : 'Overview', liveNotes.overview || []);
      writeSection(zh ? '重点 Key Points' : 'Key Points', liveNotes.keyPoints || []);

      // Footer
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text('Generated by MemeFlow · memeflow-16ecf.web.app', margin, 820);

      const safeTitle = (liveNotes.title || 'memeflow-notes')
        .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/gi, '')
        .slice(0, 48)
        .trim();
      doc.save(`${safeTitle || 'memeflow-notes'}-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success(zh ? '笔记已导出 PDF' : 'Notes exported as PDF');
    } catch (err) {
      console.error('export PDF failed', err);
      toast.error(zh ? '导出 PDF 失败' : 'PDF export failed');
    }
  };

  const handleStart = async () => {
    if (status === 'connecting' || status === 'live' || status === 'requesting-token') return;
    setStream([]);
    setPaused(false);
    // Reset Live Notes between sessions so the panel doesn't show last
    // class's summary while the new class is warming up.
    setLiveNotes(null);
    setLiveNotesLoading(false);
    setNotesLastUpdatedAt(0);
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
        { audioSource, mode, targetLang: 'zh-CN', course, keyterms, translationMode, isPro },
        {
          onStatusChange: (s, detail) => {
            // If we're actively cleaning up after an error (sessionRef
            // already nulled, stop() running), the inevitable 'stopped'
            // event from stop()'s tail must NOT overwrite our 'error'
            // banner. Drop it on the floor.
            if (s === 'stopped' && cleanupAfterErrorRef.current) {
              cleanupAfterErrorRef.current = false;
              return;
            }
            setStatus(s);
            setStatusDetail(detail || '');
            // If Deepgram drops the socket mid-session (network blip,
            // firewall, token expiry on long class), let the user know.
            // Also actively tear down the underlying session — previously
            // we just nulled the ref, but the audio worklet + mediaStream
            // kept running, producing the "Error 但字幕还在出" bug
            // (status='error' yet new finals trickling into the stream
            // for a few seconds). Calling stop() releases the worklet,
            // mic / tab capture, and the orphaned WebSocket cleanly.
            if (s === 'error' && detail) {
              toast.error(
                uiLang === 'zh'
                  ? `连接中断：${detail}。点上方红色「重新连接」按钮。`
                  : `Connection dropped: ${detail}. Tap the red "reconnect" button above.`
              );
              const dyingSession = sessionRef.current;
              sessionRef.current = null;
              if (dyingSession) {
                cleanupAfterErrorRef.current = true;
                // Fire-and-forget — stop() already swallows its own errors.
                void dyingSession.stop().catch((stopErr) => {
                  console.warn('[ClassroomTab] cleanup stop() after error failed:', stopErr);
                });
              }
            }
          },
          onTranslationBatch: applyTranslationBatch,
          onTranscriptionDelta: appendTranscriptionDelta,
          onTranslationPending: (pending, key) => {
            setPendingTranslations((prev) => {
              const next = new Set(prev);
              if (pending) next.add(key); else next.delete(key);
              return next;
            });
          },
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

  // Session timer (seconds) — shown mono-spaced in the live bar so users
  // can glance at elapsed time without checking system clock. Only counts
  // while status === 'live'; resets to 0 on stop.
  const [sessionElapsed, setSessionElapsed] = useState(0);
  useEffect(() => {
    if (!isLive) { setSessionElapsed(0); return; }
    const timer = setInterval(() => setSessionElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isLive]);
  const formatSessionTimer = () => {
    const m = Math.floor(sessionElapsed / 60);
    const s = sessionElapsed % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

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
    <div className="space-y-5">
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
              className="surface !rounded-[16px] border-l-[3px] border-l-[var(--red-warn)] p-[28px_32px] max-w-lg w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-[11px] bg-[rgba(229,56,43,0.12)] text-[var(--red-warn)] inline-flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-[20px] tracking-[-0.02em] text-[var(--ink)] m-0">
                    Before you start · 首次使用须知
                  </h2>
                  <p className="font-zh-serif text-[13px] font-medium text-[var(--ink-muted)] m-0 mt-0.5">
                    {uiLang === 'zh' ? '开启同传前必须读完并同意' : 'Read before starting'}
                  </p>
                </div>
              </div>

              <ul className="font-zh-serif text-[13.5px] leading-[1.9] text-[var(--ink-body)] pl-[18px] m-0 mb-5 space-y-1 list-disc">
                <li>
                  <strong className="text-[var(--red-warn)]">音频会上传到 Google 服务器</strong>处理。语音识别（Deepgram）和翻译（Gemini）都需要联网，不是本地运行。
                </li>
                <li>
                  memeflow <strong className="text-[var(--red-warn)]">不会长期保存</strong>你的原始音频。字幕文本会保存在你的账号下方便你复习。
                </li>
                <li>
                  请确认你<strong className="text-[var(--red-warn)]">有权</strong>把这节课/这个视频的音频送到外部服务器做处理——课程录制、版权内容、机密会议请谨慎使用。
                </li>
                <li>每个会话的字幕都会写到 <code className="font-mono-meta text-[12px] bg-[rgba(10,14,26,0.04)] px-1 py-0.5 rounded">classSessions/{'{sessionId}'}</code> 集合下，只有你自己能看。</li>
              </ul>

              <label className="flex items-start gap-2 cursor-pointer select-none mb-4">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 accent-[var(--blue-accent)]"
                />
                <span className="font-zh-serif text-[13px] text-[var(--ink-body)]">
                  我已阅读并理解上述内容，确认使用本功能所产生的责任由我自己承担。
                </span>
              </label>

              <div className="flex gap-2.5 pt-4 border-t border-[rgba(229,56,43,0.15)]">
                <button
                  onClick={() => setShowCompliance(false)}
                  className="px-[18px] py-3 rounded-[12px] bg-transparent border border-[rgba(10,14,26,0.15)] text-[var(--ink-muted)] font-zh-serif text-[13px] font-semibold cursor-pointer"
                >
                  {uiLang === 'zh' ? '先不用，返回' : 'Not now'}
                </button>
                <button
                  onClick={acknowledgeCompliance}
                  disabled={!agreed}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 rounded-[12px] bg-[var(--ink)] text-white border-0 font-bold text-[14px] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-[0_4px_12px_rgba(10,14,26,0.22)]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {uiLang === 'zh' ? '我已阅读并同意，开始使用' : 'I agree, start'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Eyebrow */}
      <div className="flex items-baseline gap-[10px] mb-[14px] pl-[4px]">
        <span style={{ width: '18px', height: '1px', background: 'var(--ink-rule)', transform: 'translateY(-4px)' }} />
        <span className="font-display italic text-[13px] text-[var(--ink-muted)]">classroom live</span>
        <span className="font-zh-sans text-[11.5px] tracking-[0.12em] text-[var(--ink-subtle)]">
          {uiLang === 'zh' ? '课堂同传' : 'live interpretation'}
        </span>
      </div>

      {/* LIVE STATUS BAR — single row, always on top */}
      <div className="glass-thick rounded-[22px] p-[14px_18px_14px_20px] flex items-center gap-[14px]">
        <div className="inline-flex items-center gap-2.5 flex-1 min-w-0">
          <span className={cn(
            "w-2.5 h-2.5 rounded-full shrink-0",
            status === 'live' ? "animate-pulse" : "",
            status === 'live' ? "bg-[#4C8F3B] shadow-[0_0_10px_rgba(76,143,59,0.75)]" :
            status === 'error' ? "bg-[var(--red-warn)]" :
            (status === 'connecting' || status === 'requesting-token') ? "bg-[#E8C375] animate-pulse" :
            "bg-[rgba(10,14,26,0.2)]"
          )} />
          <span className={cn(
            "font-display italic font-bold text-[16px] tracking-[-0.01em]",
            status === 'live' ? "text-[var(--green-ok)]" :
            status === 'error' ? "text-[var(--red-warn)]" :
            (status === 'connecting' || status === 'requesting-token') ? "text-[#8A5D0E]" :
            "text-[rgba(10,14,26,0.55)]"
          )}>
            {status === 'live' ? 'Listening' :
             status === 'connecting' ? 'Connecting…' :
             status === 'requesting-token' ? 'Preparing…' :
             status === 'stopped' ? 'Stopped' :
             status === 'error' ? 'Error' :
             'Not started'}
          </span>
          <span className="font-zh-sans font-medium text-[13px] text-[var(--ink-body)] tracking-[0.01em] truncate">
            {uiLang === 'zh' ? (
              <>
                · {status === 'live' && '正在监听'}
                {status === 'connecting' && '连接中'}
                {status === 'requesting-token' && '准备中'}
                {status === 'stopped' && '已结束'}
                {status === 'error' && (statusDetail || '启动失败')}
                {status === 'idle' && '未开始'}
              </>
            ) : (
              <>· {statusDetail || (status === 'idle' ? 'tap start' : '')}</>
            )}
          </span>
        </div>
        {isLive && (
          <>
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--ink)',
                padding: '0 14px',
                borderLeft: '1px solid var(--ink-rule)',
                borderRight: '1px solid var(--ink-rule)',
                letterSpacing: '0.04em',
              }}
            >
              {formatSessionTimer()}
            </span>
            <button
              onClick={togglePause}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[11px] border border-[var(--border-solid-strong)] bg-white/85 font-zh-sans font-bold text-[13px] text-[var(--ink)] tracking-[0.02em] cursor-pointer hover:bg-white"
              title={paused ? (uiLang === 'zh' ? '继续' : 'Resume') : (uiLang === 'zh' ? '暂停' : 'Pause')}
            >
              {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{paused ? (uiLang === 'zh' ? '继续' : 'resume') : (uiLang === 'zh' ? '暂停' : 'pause')}</span>
            </button>
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[12px] bg-[var(--ink)] text-white border-0 cursor-pointer font-bold text-[13px] shadow-[0_4px_12px_rgba(10,14,26,0.25)] hover:bg-[#1a2440]"
            >
              <Square className="w-3 h-3" />
              {uiLang === 'zh' ? '结束并保存' : 'stop & save'}
            </button>
          </>
        )}
        {/* Reconnect button when the session errored out (PR — 2026-04-27).
            We don't auto-expand the config card on error because most users
            just want to reconnect with the same settings, not re-pick a
            course. The button right here is the shortest path: one click,
            same settings, new session. */}
        {status === 'error' && (
          <button
            onClick={handleStart}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[12px] bg-[var(--red-warn)] text-white border-0 cursor-pointer font-bold text-[13px] shadow-[0_4px_12px_rgba(229,56,43,0.3)] hover:bg-[var(--red-deep)] disabled:opacity-50 shrink-0"
          >
            {isBusy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Play className="w-3.5 h-3.5" />}
            {uiLang === 'zh' ? '重新连接' : 'reconnect'}
          </button>
        )}
      </div>

      {/* Class notes modal — inline entry without the old Beta row
          (aligned with classroom.html prototype which doesn't render that row) */}
      {auth.currentUser && (
        <div className="flex justify-end -mt-2">
          <ClassNotesModal uiLang={uiLang} userId={auth.currentUser.uid} />
        </div>
      )}

      {/* CONFIG CARD — full form when idle, one-line summary while live.
          Wrapped in AnimatePresence + motion.div so the collapse/expand
          has a smooth height + fade crossfade instead of a brutal snap. */}
      <AnimatePresence mode="wait" initial={false}>
      {!isConfigExpanded && (
        <motion.div
          key="config-collapsed"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ overflow: 'hidden' }}
        >
        <div className="surface !rounded-[14px] p-[10px_16px] flex items-center gap-3 flex-wrap">
          <span className="font-mono-meta text-[10px] tracking-[0.2em] uppercase font-extrabold text-[var(--ink-soft)] shrink-0">
            config
          </span>
          <span className="font-zh-sans text-[12.5px] text-[var(--ink-body)] flex-1 min-w-0 truncate">
            {audioSource === 'tab'
              ? (uiLang === 'zh' ? 'tab audio · 标签页' : 'tab audio')
              : (uiLang === 'zh' ? 'mic · 麦克风' : 'mic')}
            {' · '}
            {translationMode === 'paragraph'
              ? (uiLang === 'zh' ? '整段翻译' : 'paragraph')
              : (uiLang === 'zh' ? '实时翻译' : 'realtime')}
            {' · '}
            {(() => {
              if (selectedCourse === '__custom__') {
                return customCourse.trim() || (uiLang === 'zh' ? '自定义课程' : 'custom');
              }
              if (selectedCourse) {
                const preset = COURSE_PRESETS.find((p) => p.zh === selectedCourse || p.en === selectedCourse);
                if (preset) return uiLang === 'zh' ? preset.zh : preset.en;
                return selectedCourse;
              }
              return uiLang === 'zh' ? '未选课程' : 'no course';
            })()}
          </span>
          <button
            type="button"
            onClick={() => setIsConfigExpanded(true)}
            className="font-display italic text-[12px] text-[var(--blue-accent)] bg-transparent border-0 cursor-pointer shrink-0 hover:underline"
          >
            {uiLang === 'zh' ? '展开配置 →' : 'show config →'}
          </button>
        </div>
        </motion.div>
      )}

      {isConfigExpanded && (
      <motion.div
        key="config-expanded"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ overflow: 'hidden' }}
      >
      <div className="surface !rounded-[14px] p-[18px_22px_20px]">
        {/* First-time hint: lowers startup friction by telling users they can
            just tap Start and adjust later, instead of tweaking every field. */}
        {status === 'idle' && stream.length === 0 && (
          <div className="font-zh-serif text-[12px] text-[var(--ink-muted)] bg-[rgba(91,127,232,0.08)] rounded-[10px] p-[10px_14px] mb-3 leading-relaxed border border-[rgba(91,127,232,0.15)]">
            {uiLang === 'zh' ? (
              <>
                <strong className="text-[var(--blue-accent)]">第一次用？</strong>
                 直接点「开始」试试 —— 默认 tab audio + 整段翻译 + 金融课程，稍后再改都行。
              </>
            ) : (
              <>
                <strong className="text-[var(--blue-accent)]">First time?</strong>
                {' '}Just tap Start — defaults are tab audio + paragraph + finance. You can tweak later.
              </>
            )}
          </div>
        )}
        {/* Collapse control while live (only visible when we were forced
            open by the user after session started) */}
        {status !== 'idle' && (
          <div className="flex justify-end -mt-1 mb-2">
            <button
              type="button"
              onClick={() => setIsConfigExpanded(false)}
              className="font-display italic text-[11.5px] text-[var(--ink-muted)] bg-transparent border-0 cursor-pointer hover:text-[var(--ink-body)]"
            >
              {uiLang === 'zh' ? '← 收起配置' : '← hide config'}
            </button>
          </div>
        )}
        {/* Row 1: audio source */}
        <div className="flex items-center gap-[14px] py-[10px]">
          <div className="shrink-0 w-[110px]">
            <div className="font-mono-meta text-[10.5px] tracking-[0.2em] uppercase font-extrabold text-[var(--ink-soft)]">audio</div>
            <div className="font-zh-sans font-semibold text-[12px] text-[var(--ink-body)] tracking-[0.02em] mt-1">
              {uiLang === 'zh' ? '声音来源' : 'source'}
            </div>
          </div>
          <div className="flex-1 flex flex-wrap gap-1.5">
            <button
              onClick={() => setAudioSource('mic')}
              disabled={isLive || isBusy}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-display italic text-[13px] tracking-[-0.01em] border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                audioSource === 'mic'
                  ? "bg-[var(--ink)] text-white border-[var(--ink)] shadow-[0_3px_8px_rgba(10,14,26,0.22)]"
                  : "bg-white/55 border-white/75 text-[rgba(10,14,26,0.7)] hover:text-[var(--ink)]"
              )}
            >
              {audioSource === 'mic' && <span className="w-1 h-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />}
              <Mic className="w-3 h-3" /> mic · {uiLang === 'zh' ? '麦克风' : 'mic'}
            </button>
            <button
              onClick={() => setAudioSource('tab')}
              disabled={isLive || isBusy}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-display italic text-[13px] tracking-[-0.01em] border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                audioSource === 'tab'
                  ? "bg-[var(--ink)] text-white border-[var(--ink)] shadow-[0_3px_8px_rgba(10,14,26,0.22)]"
                  : "bg-white/55 border-white/75 text-[rgba(10,14,26,0.7)] hover:text-[var(--ink)]"
              )}
            >
              {audioSource === 'tab' && <span className="w-1 h-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />}
              <Monitor className="w-3 h-3" /> tab audio · {uiLang === 'zh' ? '浏览器标签' : 'browser tab'}
            </button>
          </div>
        </div>

        {/* Row 2: mode */}
        <div className="flex items-center gap-[14px] py-[10px] border-t border-[var(--ink-hairline)]">
          <div className="shrink-0 w-[110px]">
            <div className="font-mono-meta text-[10.5px] tracking-[0.2em] uppercase font-extrabold text-[var(--ink-soft)]">mode</div>
            <div className="font-zh-sans font-semibold text-[12px] text-[var(--ink-body)] tracking-[0.02em] mt-1">
              {uiLang === 'zh' ? '翻译模式' : 'translation mode'}
            </div>
          </div>
          <div className="flex-1 flex flex-wrap items-center gap-1.5">
            {(['paragraph', 'realtime'] as const).map((m) => {
              const active = translationMode === m;
              return (
                <button
                  key={m}
                  onClick={() => setTranslationMode(m)}
                  disabled={isLive || isBusy}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-zh-serif text-[13px] border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    active
                      ? "bg-[var(--ink)] text-white border-[var(--ink)] shadow-[0_3px_8px_rgba(10,14,26,0.22)]"
                      : "bg-white/55 border-white/75 text-[rgba(10,14,26,0.7)] hover:text-[var(--ink)]"
                  )}
                >
                  {active && <span className="w-1 h-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />}
                  {m === 'paragraph'
                    ? (uiLang === 'zh' ? '整段翻译' : 'paragraph')
                    : (uiLang === 'zh' ? '实时翻译' : 'realtime')}
                </button>
              );
            })}
            <span className="ml-auto font-zh-serif text-[11px] text-[var(--ink-muted)] self-center">
              {translationMode === 'paragraph'
                ? (uiLang === 'zh' ? '几句英文攒成一段再翻，中文更顺 · 延迟几秒' : 'smoother Chinese, a few seconds of lag')
                : (uiLang === 'zh' ? '每句话讲完立刻翻译 · 延迟最低，但中文会碎一些' : 'immediate per-sentence, lowest lag')}
            </span>
          </div>
        </div>

        {/* Row 3 (collapsed): course summary — reduces the "wall of options"
            feeling for first-time users. One click expands the real picker. */}
        {!showCourseDetail && (
          <div className="flex items-center gap-[14px] py-[10px] border-t border-[var(--ink-hairline)]">
            <div className="shrink-0 w-[110px]">
              <div className="font-mono-meta text-[10.5px] tracking-[0.2em] uppercase font-extrabold text-[var(--ink-soft)]">course</div>
              <div className="font-zh-sans font-semibold text-[12px] text-[var(--ink-body)] tracking-[0.02em] mt-1">
                {uiLang === 'zh' ? '课程' : 'subject'}
              </div>
            </div>
            <div className="flex-1 flex items-center gap-2 flex-wrap">
              <span className="font-zh-serif text-[13px] text-[var(--ink-body)]">
                {(() => {
                  if (selectedCourse === '__custom__') {
                    const t = customCourse.trim();
                    return t ? t : (uiLang === 'zh' ? '自定义（未填）' : 'custom (empty)');
                  }
                  if (selectedCourse) {
                    const preset = COURSE_PRESETS.find((p) => p.zh === selectedCourse || p.en === selectedCourse);
                    if (preset) return uiLang === 'zh' ? preset.zh : preset.en;
                    return selectedCourse;
                  }
                  return uiLang === 'zh' ? '金融（默认建议）' : 'Finance (default)';
                })()}
              </span>
              <span className="font-zh-serif text-[11px] text-[var(--ink-muted)]">
                {uiLang === 'zh' ? '· 帮 AI 用对术语' : '· helps AI match terminology'}
              </span>
              <button
                type="button"
                onClick={() => setShowCourseDetail(true)}
                disabled={isLive || isBusy}
                className="ml-auto font-display italic text-[12px] text-[var(--blue-accent)] bg-transparent border-0 cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uiLang === 'zh' ? '修改 →' : 'change →'}
              </button>
            </div>
          </div>
        )}

        {/* Row 3 (expanded): course picker */}
        {showCourseDetail && (
        <div className="flex items-center gap-[14px] py-[10px] border-t border-[var(--ink-hairline)]">
          <div className="shrink-0 w-[110px]">
            <div className="font-mono-meta text-[10.5px] tracking-[0.2em] uppercase font-extrabold text-[var(--ink-soft)]">course</div>
            <div className="font-zh-sans font-semibold text-[12px] text-[var(--ink-body)] tracking-[0.02em] mt-1">
              {uiLang === 'zh' ? '课程' : 'subject'}
            </div>
          </div>
          <div className="flex-1 flex flex-wrap gap-1.5">
            {(courseExpanded ? COURSE_PRESETS : COURSE_PRESETS.slice(0, 5)).map((p) => {
              const active = selectedCourse === p.zh || selectedCourse === p.en;
              return (
                <button
                  key={p.en}
                  onClick={() => setSelectedCourse(active ? null : p.zh)}
                  disabled={isLive || isBusy}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-zh-serif text-[13px] border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    active
                      ? "bg-[var(--ink)] text-white border-[var(--ink)] shadow-[0_3px_8px_rgba(10,14,26,0.22)]"
                      : "bg-white/55 border-white/75 text-[rgba(10,14,26,0.7)] hover:text-[var(--ink)]"
                  )}
                >
                  {active && <span className="w-1 h-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />}
                  {uiLang === 'zh' ? p.zh : p.en}
                </button>
              );
            })}
            {COURSE_PRESETS.length > 5 && (
              <button
                onClick={() => setCourseExpanded((v) => !v)}
                className="font-display italic text-[12px] text-[var(--blue-accent)] px-2 py-1.5 bg-transparent border-0 cursor-pointer"
              >
                {courseExpanded
                  ? (uiLang === 'zh' ? '收起 ←' : 'collapse ←')
                  : `+ ${COURSE_PRESETS.length - 5} more →`}
              </button>
            )}
            <button
              onClick={() => setSelectedCourse(selectedCourse === '__custom__' ? null : '__custom__')}
              disabled={isLive || isBusy}
              className="font-display italic text-[12px] text-[rgba(10,14,26,0.5)] px-2 py-1.5 bg-transparent border-0 cursor-pointer"
            >
              {uiLang === 'zh' ? '其他…' : 'other…'}
            </button>
            <button
              type="button"
              onClick={() => setShowCourseDetail(false)}
              className="ml-auto font-display italic text-[11.5px] text-[var(--ink-muted)] px-2 py-1.5 bg-transparent border-0 cursor-pointer hover:text-[var(--ink-body)]"
            >
              {uiLang === 'zh' ? '收起 ↑' : 'collapse ↑'}
            </button>
          </div>
        </div>
        )}

        {/* Row 4: custom course input — only when "其他…" is active AND the
            course detail panel is expanded (otherwise the row is hidden). */}
        {showCourseDetail && selectedCourse === '__custom__' && (
          <div className="flex items-start gap-[14px] py-[10px] border-t border-[var(--ink-hairline)]">
            <div className="shrink-0 w-[110px]">
              <div className="font-mono-meta text-[10.5px] tracking-[0.2em] uppercase font-extrabold text-[var(--ink-soft)]">custom</div>
              <div className="font-zh-sans font-semibold text-[12px] text-[var(--ink-body)] tracking-[0.02em] mt-1">
                {uiLang === 'zh' ? '自定义' : 'custom'}
              </div>
            </div>
            <div className="flex-1 flex flex-col items-stretch gap-1.5">
              <input
                type="text"
                value={customCourse}
                onChange={(e) => setCustomCourse(e.target.value)}
                disabled={isLive || isBusy}
                placeholder={uiLang === 'zh' ? '比如：营销学、海洋生物、古典音乐史' : 'e.g. Marketing, Marine Biology'}
                className="w-full p-[10px_14px] border border-white/70 bg-white/60 rounded-[12px] outline-none font-zh-serif text-[14px] text-[var(--ink)] focus:border-[var(--blue-accent)]"
              />
              <p className="font-zh-serif text-[11px] text-[var(--ink-muted)] m-0 mt-1 px-0.5">
                {uiLang === 'zh'
                  ? 'AI 会按这门课的场景翻译专业术语。会记住你上次选的。'
                  : "AI translates with that subject's register. Your last pick is remembered."}
              </p>
            </div>
          </div>
        )}

        {/* Action buttons row — Start / Stop */}
        {!isLive && (
          <div className="flex items-center gap-2 pt-[14px] mt-2 border-t border-[var(--ink-hairline)]">
            <button
              onClick={handleStart}
              disabled={isBusy}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-[var(--ink)] text-white py-3 rounded-[12px] font-bold text-[14px] hover:bg-[#1a2440] transition-colors disabled:opacity-50 shadow-[0_4px_12px_rgba(10,14,26,0.22)]"
            >
              {isBusy
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <Play className="w-5 h-5" />}
              {isBusy
                ? (uiLang === 'zh'
                    ? (status === 'requesting-token' ? '准备中…' : '连接中…')
                    : (status === 'requesting-token' ? 'Preparing…' : 'Connecting…'))
                : (uiLang === 'zh' ? '开始同传' : 'Start')}
            </button>
          </div>
        )}

        {/* Tip */}
        {audioSource === 'tab' && !isLive && (
          <div className="font-zh-serif text-[12px] text-[var(--ink-muted)] bg-[rgba(10,14,26,0.04)] rounded-[10px] p-3 mt-3 leading-relaxed">
            {uiLang === 'zh' ? (
              <>
                <strong className="text-[var(--ink-body)]">提示：</strong>
                点"开始"后浏览器会让你选上课用的那个标签页，
                <strong className="text-[var(--ink-body)]">记得勾上"共享标签页音频"</strong>。
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

        {/* Ask-hint */}
        {showAskHint && (
          <div className="relative pr-7 font-zh-serif text-[12px] text-[var(--ink-muted)] leading-relaxed mt-3">
            <p className="m-0">
              {uiLang === 'zh' ? (
                <>
                  上课没听懂？直接在下方<span className="text-[var(--blue-accent)] font-semibold">「问 AI」</span>输入你的问题 —
                  比如「老师刚才说的 CAPM 是啥？」AI 会根据已经讲过的内容用中文回答。
                </>
              ) : (
                <>
                  Missed something? Just type your question in the{' '}
                  <span className="text-[var(--blue-accent)] font-semibold">Ask AI</span>{' '}
                  bar below — e.g. "what did the prof mean by CAPM?" AI replies in Chinese using what's been said so far.
                </>
              )}
            </p>
            <button
              onClick={dismissAskHint}
              aria-label={uiLang === 'zh' ? '收起提示' : 'Dismiss hint'}
              title={uiLang === 'zh' ? '我知道了，不再显示' : 'Got it, hide'}
              className="absolute top-0 right-0 p-1 text-[var(--ink-muted)] hover:text-[var(--ink-body)] hover:bg-[rgba(10,14,26,0.05)] rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Manual reconnect */}
        {showManualReconnect && status === 'live' && (
          <button
            type="button"
            onClick={handleManualReconnect}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[12px] bg-[var(--red-warn)] text-white font-zh-sans text-[13px] font-bold shadow-[0_4px_12px_rgba(229,56,43,0.3)] hover:bg-[var(--red-deep)] transition-colors"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            {uiLang === 'zh' ? '线路卡住？点这里重连' : 'Stuck? Reconnect'}
          </button>
        )}
      </div>
      </motion.div>
      )}
      </AnimatePresence>

      {/* Manual reconnect — also available when the config card is
          collapsed during live sessions, since the button used to live
          inside the card and would be hidden in summary mode. */}
      {!isConfigExpanded && showManualReconnect && status === 'live' && (
        <button
          type="button"
          onClick={handleManualReconnect}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[12px] bg-[var(--red-warn)] text-white font-zh-sans text-[13px] font-bold shadow-[0_4px_12px_rgba(229,56,43,0.3)] hover:bg-[var(--red-deep)] transition-colors"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          {uiLang === 'zh' ? '线路卡住？点这里重连' : 'Stuck? Reconnect'}
        </button>
      )}

      {/* TRANSCRIPT STREAM — widened visual focus. min-height bumped so
          subtitles occupy the visual center of the classroom page; bottom
          radius flattens to 0 so the Ask-AI dock reads as one continuous
          surface with the stream (see task D "合流"). */}
      <div className="relative">
        {/* stream-fade — 底部白色渐隐层，让焊接下来的 ask-bar 有"从字幕里浮出来"的视觉。
            对齐 classroom.html 原型 .stream-fade；绝对定位盖在 scroller 底部，
            pointer-events-none 避免拦截滚动或点击。 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0 bottom-0 h-20 z-[1] rounded-b-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(244,247,255,0) 0%, #F4F7FF 100%)',
          }}
        />
        <div
          ref={scrollerRef}
          className="glass-thick rounded-t-[28px] rounded-b-none p-[26px_28px_120px_40px] min-h-[440px] max-h-[62vh] overflow-y-auto relative"
        >
          {/* Floating notes-chip — scrolls the LiveNotesPanel into view. */}
          <button
            type="button"
            onClick={() => {
              const panel = document.getElementById('classroom-live-notes-panel');
              if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 border border-white/85 backdrop-blur-md font-display italic text-[12px] text-[rgba(10,14,26,0.6)] shadow-sm hover:text-[var(--blue-accent)]"
          >
            live notes
            <span className="font-mono-meta text-[10px] text-[var(--blue-accent)] bg-[rgba(91,127,232,0.1)] px-1.5 py-0.5 rounded">
              {liveNotes?.keyPoints?.length || 0}
            </span>
          </button>
          {/* Vertical rule on the left */}
          <div
            className="absolute top-8 bottom-8 left-5 w-[2px] rounded-[2px]"
            style={{ background: 'linear-gradient(180deg, rgba(91,127,232,0.45), rgba(91,127,232,0.05))' }}
          />

          {stream.length === 0 && status !== 'live' && (
            <div className="text-center font-zh-serif text-[13px] leading-[1.85] text-[var(--ink-muted)] py-5">
              {uiLang === 'zh' ? (
                <>
                  点 <em className="font-display italic not-italic text-[var(--blue-accent)] font-semibold italic">开始</em> 后字幕会出现在这里。<br />
                  上课中可以随时在底部<em className="font-display italic not-italic text-[var(--blue-accent)] font-semibold italic">问 AI</em>任何问题。
                </>
              ) : (
                <>Tap <em className="font-display italic text-[var(--blue-accent)] font-semibold">Start</em> to see subtitles. Ask AI anything during class.</>
              )}
            </div>
          )}

          {/* Render with on-the-fly grouping (PR3 — 2026-04-27).
              Consecutive `kind:'line'` items that are still un-translated
              (regardless of finalized state) merge into ONE visual card —
              no per-sentence dividers, no "1-sentence-at-a-time" feel.
              The card shows the joined English (live + finalized) and a
              single "翻译中…" pending indicator. The dashed-border divider
              only appears between groups, so users only see a divider
              when a paragraph has actually closed and translation has
              shipped. Translated lines (kind:'line' with .translation)
              render one-per-card as before — by then the merge in
              applyTranslationBatch has already collapsed N un-translated
              lines down to 1 translated line, so this loop sees a clean
              single entry per finalized paragraph. */}
          {(() => {
            type LineItem = Extract<typeof stream[number], { kind: 'line' }>;
            type QaItem = Extract<typeof stream[number], { kind: 'qa' }>;
            type Group =
              | { kind: 'pending-group'; items: LineItem[] }
              | { kind: 'translated-line'; item: LineItem }
              | { kind: 'qa'; item: QaItem };

            const groups: Group[] = [];
            for (const item of stream) {
              if (item.kind === 'qa') {
                groups.push({ kind: 'qa', item });
                continue;
              }
              if (item.translation) {
                groups.push({ kind: 'translated-line', item });
                continue;
              }
              // un-translated line → extend the open pending-group, or start one
              const last = groups[groups.length - 1];
              if (last && last.kind === 'pending-group') {
                last.items.push(item);
              } else {
                groups.push({ kind: 'pending-group', items: [item] });
              }
            }

            return groups.map((group, idx) => {
              if (group.kind === 'qa') {
                const item = group.item;
                return (
                  <div key={`q-${item.id}`} className="my-[18px] -mx-1.5 p-[16px_18px] border border-[rgba(91,127,232,0.2)] rounded-[18px]"
                    style={{ background: 'linear-gradient(135deg, rgba(91,127,232,0.12), rgba(137,163,240,0.06))' }}
                  >
                    <div className="flex gap-3 items-start">
                      <span className="shrink-0 px-[9px] py-[3px] rounded-[7px] font-mono-meta text-[10px] font-bold tracking-[0.08em] bg-[var(--ink)] text-white mt-0.5">
                        YOU
                      </span>
                      <p className="flex-1 min-w-0 font-zh-serif text-[14.5px] leading-[1.85] text-[var(--ink)] m-0">
                        {item.question}
                      </p>
                    </div>
                    <div className="flex gap-3 items-start mt-2.5 pt-3 border-t border-dashed border-[rgba(91,127,232,0.22)]">
                      <span className="shrink-0 px-[9px] py-[3px] rounded-[7px] font-mono-meta text-[10px] font-bold tracking-[0.08em] bg-white text-[var(--blue-accent)] border border-[rgba(91,127,232,0.3)] inline-flex items-center gap-1 mt-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> AI
                      </span>
                      <p className="flex-1 min-w-0 font-zh-serif text-[14.5px] leading-[1.85] text-[var(--ink)] m-0 whitespace-pre-wrap [&_strong]:text-[var(--blue-accent)] [&_strong]:font-semibold">
                        {item.pending
                          ? <Loader2 className="w-4 h-4 animate-spin text-[rgba(91,127,232,0.6)] inline" />
                          : item.answer}
                      </p>
                    </div>
                  </div>
                );
              }

              if (group.kind === 'translated-line') {
                const item = group.item;
                const isFailed = !!item.failed;
                return (
                  <div key={`l-${item.id}`} className={cn("py-[14px]", idx > 0 && "border-t border-dashed border-[rgba(10,14,26,0.07)]")}>
                    <span className={cn(
                      "inline-block font-mono-meta text-[9px] font-bold tracking-[0.15em] uppercase px-[7px] py-[2px] rounded-[5px] mb-2",
                      isFailed
                        ? "bg-[rgba(229,56,43,0.1)] text-[var(--red-warn)]"
                        : translationMode === 'paragraph'
                          ? "bg-[rgba(91,127,232,0.1)] text-[var(--blue-accent)]"
                          : "bg-[rgba(232,180,60,0.18)] text-[#8A5D0E]"
                    )}>
                      {isFailed
                        ? (uiLang === 'zh' ? '翻译失败' : 'translation failed')
                        : translationMode === 'paragraph' ? 'paragraph · 整段翻译' : 'realtime · 实时'}
                    </span>
                    {item.transcription && (
                      <p className="font-display italic text-[13px] leading-[1.5] text-[rgba(10,14,26,0.48)] m-0 mb-1.5">
                        "{item.transcription}"
                      </p>
                    )}
                    {isFailed ? (
                      <div className="flex items-center gap-3 mt-1">
                        <p className="font-zh-serif text-[14px] leading-[1.6] m-0 text-[var(--red-warn)]">
                          ⚠️ {uiLang === 'zh' ? '翻译失败，可点重试' : 'Translation failed'}
                        </p>
                        <button
                          type="button"
                          onClick={() => retryFailedTranslation(item.id)}
                          className="px-3 py-1 rounded-full bg-[var(--red-warn)] text-white font-mono-meta text-[10px] font-bold tracking-[0.05em] hover:bg-[var(--red-deep)] cursor-pointer border-0 shadow-[0_2px_8px_rgba(229,56,43,0.25)]"
                        >
                          {uiLang === 'zh' ? '重试' : 'Retry'}
                        </button>
                      </div>
                    ) : (
                      <p className="font-zh-serif text-[17px] leading-[1.8] m-0 text-[rgba(10,14,26,0.78)]">
                        {item.translation}
                      </p>
                    )}
                  </div>
                );
              }

              // pending-group: merged "still being typed / awaiting translation" card.
              // Join all items' English into ONE block. No per-item divider — the
              // whole group reads as one paragraph in flight.
              const joinedEnglish = group.items
                .map((it) => it.transcription)
                .filter(Boolean)
                .join(' ');
              const groupKey = `pg-${group.items[0]?.id ?? idx}`;
              return (
                <div key={groupKey} className={cn("py-[14px]", idx > 0 && "border-t border-dashed border-[rgba(10,14,26,0.07)]")}>
                  <span className={cn(
                    "inline-block font-mono-meta text-[9px] font-bold tracking-[0.15em] uppercase px-[7px] py-[2px] rounded-[5px] mb-2",
                    translationMode === 'paragraph'
                      ? "bg-[rgba(91,127,232,0.1)] text-[var(--blue-accent)]"
                      : "bg-[rgba(232,180,60,0.18)] text-[#8A5D0E]"
                  )}>
                    {translationMode === 'paragraph' ? 'paragraph · 正在攒句' : 'realtime · 正在翻'}
                  </span>
                  {joinedEnglish && (
                    <p className="font-display italic text-[13px] leading-[1.5] text-[rgba(10,14,26,0.48)] m-0 mb-1.5">
                      "{joinedEnglish}"
                    </p>
                  )}
                  <p className="font-zh-serif text-[17px] leading-[1.8] m-0 text-[var(--blue-accent)] font-semibold italic">
                    {uiLang === 'zh' ? '翻译中' : 'translating'}
                    <span className="inline-block w-2 h-[18px] align-[-3px] ml-1.5 bg-[var(--blue-accent)] animate-pulse" />
                  </p>
                </div>
              );
            });
          })()}

          {pendingTranslations.size > 0 && (
            <div className="flex items-center gap-2 font-mono-meta text-[11px] text-[var(--blue-accent)] px-1 py-1 mt-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{uiLang === 'zh' ? '翻译中…' : 'Translating…'}</span>
            </div>
          )}
        </div>
        {/* "↓ N 新内容" jump-to-latest pill (PR3 — 2026-04-27).
            Shows when user has scrolled up away from bottom AND new
            content has landed since. Click → smooth scroll to bottom +
            re-engage auto-stick. Positioned absolute over the scroller
            (above ask-AI dock), centered. */}
        {!isAtBottom && unseenCount > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            aria-label={uiLang === 'zh' ? `跳到最新（${unseenCount} 条新内容）` : `Jump to latest (${unseenCount} new)`}
            className="absolute left-1/2 -translate-x-1/2 bottom-2 z-20 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--blue-accent)] text-white font-mono-meta text-[11px] font-semibold tracking-[0.05em] shadow-[0_4px_14px_rgba(91,127,232,0.4)] hover:bg-[var(--blue-accent-deep)] cursor-pointer border-0"
          >
            <span>↓</span>
            <span>{uiLang === 'zh' ? `${unseenCount} 条新内容` : `${unseenCount} new`}</span>
          </button>
        )}
      </div>

      {/* Ask-AI dock — visually welded to the subtitle stream above.
          `rounded-t-none -mt-px` makes the two surfaces read as one
          continuous "classroom" block (task D 合流), rather than three
          disconnected islands. No longer sticky — it rides with the
          content so users don't lose the physical link to the subtitles. */}
      <div className="glass-thick rounded-b-[28px] rounded-t-none -mt-px p-[10px_12px_10px_16px] flex items-center gap-2.5 border-t border-[rgba(91,127,232,0.18)]">
        <Sparkles className="w-[18px] h-[18px] text-[var(--blue-accent)] shrink-0" />
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
          placeholder={uiLang === 'zh' ? '问 AI 任何问题…（如：CAPM 为啥实务里经常不准？）' : 'Ask AI anything…'}
          disabled={isAsking}
          className="flex-1 bg-transparent border-0 outline-none font-zh-serif text-[14px] text-[var(--ink)] placeholder:font-display placeholder:italic placeholder:text-[rgba(10,14,26,0.45)] py-1.5 disabled:opacity-50"
        />
        <button
          onClick={handleAsk}
          disabled={isAsking || question.trim().length === 0}
          className="bg-[var(--ink)] text-white border-0 px-[18px] py-2.5 rounded-[14px] font-bold text-[13px] tracking-[-0.005em] cursor-pointer inline-flex gap-1.5 items-center shadow-[0_4px_12px_rgba(10,14,26,0.25)] disabled:opacity-40 hover:bg-[#1a2440]"
          aria-label={uiLang === 'zh' ? '发送' : 'Send'}
        >
          {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <>
              ask AI
              <Send className="w-3 h-3" />
            </>
          )}
        </button>
      </div>

      {/* Live structured notes — moved BELOW the ask-AI dock so the
          subtitle stream + Q&A form one tight "classroom" group, with
          notes as an attached sidenote. */}
      <LiveNotesPanel
        notes={liveNotes}
        loading={liveNotesLoading}
        uiLang={uiLang}
        lastUpdatedAt={notesLastUpdatedAt || undefined}
        onSaveToNotes={handleSaveLiveNotesToClassNotes}
        onExportPdf={handleExportLiveNotesPdf}
        isSaving={isSavingLiveNotes}
        isLive={isLive}
      />

      {/* Save indicator */}
      {status === 'stopped' && stream.length > 0 && (
        <div className="flex items-center justify-center font-mono-meta text-[11px] text-[var(--ink-muted)] gap-1.5">
          <Save className="w-3.5 h-3.5" />
          {uiLang === 'zh' ? '笔记已自动保存到云端' : 'Notes saved to the cloud'}
        </div>
      )}
    </div>
  );
}
