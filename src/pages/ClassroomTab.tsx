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
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Zap,
  Headphones,
  PictureInPicture2,
  StickyNote,
  MessageCircle,
} from 'lucide-react';
import { addDoc, collection, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { startLiveSession, LiveSessionHandle, LiveSessionStats } from '../services/liveSession';
import ClassNotesModal from '../components/ClassNotesModal';
import LiveNotesPanel from '../components/LiveNotesPanel';
import CourseSlides, { type CourseSlide } from '../components/CourseSlides';
import MessageLoading from '../components/ui/message-loading';
import { Checkbox } from '../components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import {
  useFloatingSubtitle,
  pickLatestSubtitles,
} from '../components/FloatingSubtitle';
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

export type Status =
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
export type StreamItem =
  | {
      kind: 'line';
      id: number;
      translation: string;
      transcription: string;
      finalized: boolean;
      failed?: boolean;
      // sealedByBatch: stable batchId from liveSession.flushBatch when this
      // line was claimed for translation. Set by handleBatchOpen, cleared
      // when the batch's zh lands. The presence of this field is what
      // tells the renderer "this card is closed, draw a divider after it
      // and put new transcripts in a fresh card below" — fixes the bug
      // where users saw their just-flushed paragraph still wearing the
      // "正在攒句" label and visually merged with new sentences.
      sealedByBatch?: string;
    }
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

// LiveActionToolbar — compact one-row control group for the two live-only
// utility actions (2026-06-16). Replaces the two separate full-width
// buttons (立即翻译 + 悬浮字幕) that were stacked and bulky.
//
//   - 立即翻译 (Flush now): point-press action — short-circuits the 8s
//     idle / 5s delayed-flush wait so the speaker's last paragraph is
//     translated immediately.
//   - 悬浮字幕 (Floating subtitle): a real TOGGLE — on/off, highlighted
//     when active. Wraps the existing useFloatingSubtitle open/close so
//     the PiP + fallback logic in FloatingSubtitle.tsx is untouched; we
//     only restyle + group the trigger.
//
// Rendered in two mirrored slots (inside the expanded config card;
// mirrored when the card is collapsed) so it stays one tap away.
function LiveActionToolbar({
  uiLang,
  onFlush,
  floatingActive,
  onToggleFloating,
}: {
  uiLang: 'zh' | 'en';
  onFlush: () => void;
  floatingActive: boolean;
  onToggleFloating: () => void;
}) {
  const zh = uiLang === 'zh';
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <button
        type="button"
        onClick={onFlush}
        className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-[10px] bg-white text-[var(--blue-accent-text)] border border-[rgba(91,127,232,0.3)] font-zh-sans text-[12.5px] font-bold hover:bg-[rgba(91,127,232,0.06)] transition-colors"
        title={zh ? '不等了，立刻把已经听到的句子翻译出来' : 'Translate what you have so far, now'}
      >
        <Zap className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
        {zh ? '立即翻译' : 'Flush now'}
      </button>
      <button
        type="button"
        onClick={onToggleFloating}
        aria-pressed={floatingActive}
        className={cn(
          'flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-[10px] font-zh-sans text-[12.5px] font-bold transition-colors border',
          floatingActive
            ? 'bg-[var(--blue-accent)] text-white border-[var(--blue-accent)] hover:bg-[var(--blue-accent-deep)]'
            : 'bg-white text-[var(--blue-accent-text)] border-[rgba(91,127,232,0.3)] hover:bg-[rgba(91,127,232,0.06)]'
        )}
        title={
          zh
            ? '把最新双语字幕弹成一个浮在所有窗口之上的小窗，边看 PPT 边看翻译（开关）'
            : 'Toggle a small subtitle window that floats above everything'
        }
      >
        <PictureInPicture2 className="w-3.5 h-3.5" />
        {floatingActive
          ? (zh ? '悬浮字幕 · 开' : 'Floating · on')
          : (zh ? '悬浮字幕' : 'Floating')}
      </button>
    </div>
  );
}

export default function ClassroomTab({
  uiLang,
  isPro = false,
  onOpenPaywall,
  status,
  setStatus,
  statusDetail,
  setStatusDetail,
  paused,
  setPaused,
  stream,
  setStream,
  sessionRef,
}: {
  uiLang: 'en' | 'zh';
  isPro?: boolean;
  onOpenPaywall?: (trigger: string) => void;
  // Hoisted state — kept in App.tsx so a tab switch unmounting the tab
  // body doesn't lose the running LiveSession. Without this, switching to
  // another tab and back would show "未开始" while the audio + Deepgram
  // socket continued running in the background.
  status: Status;
  setStatus: React.Dispatch<React.SetStateAction<Status>>;
  statusDetail: string;
  setStatusDetail: React.Dispatch<React.SetStateAction<string>>;
  paused: boolean;
  setPaused: React.Dispatch<React.SetStateAction<boolean>>;
  stream: StreamItem[];
  setStream: React.Dispatch<React.SetStateAction<StreamItem[]>>;
  sessionRef: React.MutableRefObject<LiveSessionHandle | null>;
}) {
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
  // status / statusDetail / paused are hoisted to App.tsx — see component
  // signature above. This survives the user switching tabs (which unmounts
  // ClassroomTab) without dropping the live session UI state.
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

  // 课件导入（2026-06-16）。课件可能在「上课前 / 上课中」就导入，但会话
  // 文档 classSessions 要到 handleStop 才写入；所以上传产物先存为本地
  // state（courseSlides），handleStop 时再随会话一起写进 courseSlides 字段。
  // slideSessionId 是这次组件挂载期间稳定的临时 id，用作 Storage 路径
  // /classSlides/{uid}/{slideSessionId}/ —— 跟最终的 classSessions 文档 id
  // 解耦（文档 id 是 addDoc 自动生成的，上传时还拿不到）。用 ref 保证整个
  // 生命周期不变，不会因重渲染换路径。
  const slideSessionIdRef = useRef<string>(
    `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const [courseSlides, setCourseSlides] = useState<CourseSlide[]>([]);

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
  //
  // 2026-06-16 调参 45s→25s / 200→120：让笔记滚动成形更快、更接近"实时"。
  // 没有更激进的原因：gemini-3-pro 单次调用慢（一大段转写要 20-40s）且
  // 有 token 成本，课堂代理还套了限流桶；25s + 120 字是"足够实时但不会
  // 在安静的房间空转、也不会撞限流"的平衡点。两个门槛是 AND 关系
  // （间隔够 && 新内容够），所以低门槛只在老师持续讲课时才会触发更频繁，
  // 短暂停顿不会浪费调用。
  const LIVE_NOTES_MIN_INTERVAL_MS = 25000;
  const LIVE_NOTES_MIN_NEW_CHARS = 120;
  const [liveNotes, setLiveNotes] = useState<LiveNotes | null>(null);
  const [liveNotesLoading, setLiveNotesLoading] = useState(false);
  // 笔记生成失败的可见错误态（2026-06-16）。之前 generateLiveNotes 失败只
  // console.warn + Sentry，UI 没有任何反馈，用户只看到笔记区空着不知道为
  // 什么坏了。现在把失败暴露成面板里的错误条 + 「重试」按钮，用户能主动重发。
  const [liveNotesError, setLiveNotesError] = useState<string | null>(null);
  // `notesLastUpdatedAt` is the wall-clock ms at which the panel last
  // received a fresh Gemini summary. Drives the "updated Xs ago" chip.
  // `isSavingLiveNotes` gates the save button while we write to Firestore.
  const [notesLastUpdatedAt, setNotesLastUpdatedAt] = useState<number>(0);
  const [isSavingLiveNotes, setIsSavingLiveNotes] = useState(false);
  const liveNotesLastRunRef = useRef<number>(0);
  const liveNotesLastLenRef = useRef<number>(0);
  const liveNotesInFlightRef = useRef<boolean>(false);

  // stream is hoisted to App.tsx — see component signature.
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  // Right-sidebar tab (2026-06-16): 笔记 / 问AI live in the same right
  // column now (left = subtitles, right = notes + chat). Defaults to
  // 'notes' so "看笔记" is the resting state; one tap switches to chat.
  const [sidebarTab, setSidebarTab] = useState<'notes' | 'chat'>('notes');

  // Translation mode is fixed at 'paragraph' since 2026-04-27 evening
  // (realtime mode retired — produced disjointed Chinese without
  // cross-sentence context). Kept as a const so callsites that read it
  // still work, but the UI no longer offers a toggle.
  const translationMode = 'paragraph' as const;

  // Show original English alongside Chinese? Default TRUE (bilingual)
  // because the new prompt strips parenthetical English from the zh
  // (so the bilingual layout is no longer redundant — original gives
  // English-learning users real value). Persisted in localStorage so
  // the choice survives refreshes.
  // 字幕永远中英对照（2026-05-02 移除"只看中文/中英对照"切换）。
  // 保留 showOriginal 这个名字让下方所有渲染逻辑无需改动，硬编码 true。
  const showOriginal = true;

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

  // sessionRef is hoisted to App.tsx — see component signature.
  // Set to true while we're tearing down after an error — tells the
  // onStatusChange handler to ignore stop()'s tail 'stopped' event so
  // the red error banner doesn't get overwritten with "Stopped".
  const cleanupAfterErrorRef = useRef(false);
  // Stashed by liveSession's onSessionStats (fires inside stop()) so handleStop
  // can persist the ASR quality metrics alongside the transcript. Cleared after
  // each write so a session without stats doesn't inherit the previous one's.
  const sessionStatsRef = useRef<LiveSessionStats | null>(null);
  const itemCounter = useRef(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Batch tracking for translation: maps batchId → the line item ids
  // this batch claimed at flush time. When the zh translation later
  // returns (possibly out of order vs other concurrent batches), we
  // merge into THESE exact ids — never "the first N un-translated
  // lines", which raced and deleted user-visible paragraphs in the
  // PR2 concurrent path.
  const batchToLineIdsRef = useRef<Map<string, number[]>>(new Map());
  // 30s 超时兜底：每个 batchId 配一个 timer，落 zh 时清；超时还没清就把
  // sealed 卡翻成"翻译失败 ⚠️ 重试"，用户至少能点重试，不会永远盯着"翻译中"。
  const batchTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  // Manual flush — distinct from reconnect. Reconnect is "stream is dead,
  // start over"; flush is "stream is alive but I want my last sentence
  // translated NOW instead of waiting for the 8s idle / 5s delayed-flush
  // timers to fire". Triggered by the「立即翻译」button on the live page.
  const handleManualFlush = () => {
    const handle = sessionRef.current;
    if (!handle) return;
    handle.forceFlush();
    toast.info(uiLang === 'zh' ? '正在立即翻译当前内容…' : 'Flushing pending text…');
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

  // Sentinel zh string returned by liveSession.translateBatch when Gemini
  // fails after retries.
  const TRANSLATION_FAILED_ZH = '（翻译失败，稍后重试）';

  // Called the moment liveSession flushes a paragraph batch (BEFORE the
  // network call). We snapshot which line item ids are "claimed" by this
  // batchId so when zh later returns we can merge into THOSE exact ids,
  // not "the first N un-translated lines" (which raced under concurrent
  // translates and deleted user-visible paragraphs).
  //
  // 2026-04-30: claim by transcription text (not by position count). The
  // old "claim first N un-sealed finalized lines" logic could mis-claim
  // a stale leftover line whose previous batch had failed to clear it,
  // causing the new batch's card to display the stale line's English
  // while the actual new content sat orphaned in another sealed card
  // that never received zh. Matching by exact transcription text avoids
  // this entirely.
  const handleBatchOpen = (batchId: string, sentences: string[]) => {
    setStream((prev) => {
      const remaining = sentences.map((s) => s.trim()).filter(Boolean);
      const claimed: number[] = [];
      const next = prev.map((item) => {
        if (item.kind !== 'line') return item;
        if (!item.finalized) return item;
        if (item.translation) return item;
        if (item.sealedByBatch) return item;
        const trimmed = (item.transcription || '').trim();
        const idx = remaining.indexOf(trimmed);
        if (idx === -1) return item;
        remaining.splice(idx, 1);
        claimed.push(item.id);
        return { ...item, sealedByBatch: batchId };
      });
      // Fallback: if we couldn't text-match all sentences (e.g. transcription
      // was reformatted between commit and onBatchOpen), claim any remaining
      // un-sealed finalized lines to fill the count. Prevents zero-claim
      // batches from leaving sealed cards orphaned.
      if (claimed.length < sentences.length) {
        const need = sentences.length - claimed.length;
        let still = need;
        for (let i = 0; i < next.length && still > 0; i++) {
          const item = next[i];
          if (item.kind !== 'line') continue;
          if (!item.finalized || item.translation || item.sealedByBatch) continue;
          next[i] = { ...item, sealedByBatch: batchId };
          claimed.push(item.id);
          still -= 1;
        }
      }
      batchToLineIdsRef.current.set(batchId, claimed);
      return next;
    });
    // 30s watchdog: if zh still hasn't landed, mark the sealed cards as
    // failed so the user gets a Retry button instead of staring at "翻译中".
    // Cleared automatically when applyTranslationBatch consumes the batchId.
    const timeoutId = setTimeout(() => {
      if (!batchToLineIdsRef.current.has(batchId)) return; // already settled
      const ids = batchToLineIdsRef.current.get(batchId) || [];
      batchToLineIdsRef.current.delete(batchId);
      setStream((prev) => prev.map((it) => {
        if (it.kind !== 'line') return it;
        if (!ids.includes(it.id)) return it;
        if (it.translation) return it;
        return { ...it, translation: TRANSLATION_FAILED_ZH, failed: true, sealedByBatch: undefined };
      }));
      // eslint-disable-next-line no-console
      console.warn(`[classroom] batch ${batchId} timed out after 30s — flipping ${ids.length} line(s) to failed state`);
    }, 30000);
    batchTimeoutsRef.current.set(batchId, timeoutId);
  };

  const applyTranslationBatch = (pairs: Array<{ en: string; zh: string; sentences: string[]; batchId: string }>) => {
    setStream((prev) => {
      let next = [...prev];
      for (const pair of pairs) {
        const isFailed = pair.zh === TRANSLATION_FAILED_ZH;
        const claimedIds = batchToLineIdsRef.current.get(pair.batchId) || [];
        // Free the claim now — the batch is settling, future batches
        // won't bump into these ids (they'll be 'translation' set,
        // which already excludes them in the claim walk above).
        batchToLineIdsRef.current.delete(pair.batchId);
        // Clear the 30s watchdog timer for this batchId (success path).
        const t = batchTimeoutsRef.current.get(pair.batchId);
        if (t) {
          clearTimeout(t);
          batchTimeoutsRef.current.delete(pair.batchId);
        }

        // Find the indices in the current stream that match the
        // claimed ids (positions may have shifted since onBatchOpen
        // due to other batches splicing). claimedIdsInOrder preserves
        // the original claim order so we know which becomes the
        // "first" (where merged content lands).
        const idToIdx = new Map<number, number>();
        for (let i = 0; i < next.length; i++) {
          const item = next[i];
          if (item.kind === 'line') idToIdx.set(item.id, i);
        }
        const liveIndices: number[] = [];
        for (const id of claimedIds) {
          const idx = idToIdx.get(id);
          if (idx !== undefined) liveIndices.push(idx);
        }

        if (liveIndices.length === 0) {
          // Nothing left to merge into — either the batch's lines were
          // never created (rare) or got deleted by some other code path.
          // Fallback: append a fresh translated line so the user still
          // sees the zh.
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

        // Merge: first claimed line gets the joined English + zh; the
        // rest are removed. Walk in reverse so splice doesn't shift
        // indices we haven't visited yet.
        const sortedIndices = [...liveIndices].sort((a, b) => a - b);
        const firstIdx = sortedIndices[0];
        const first = next[firstIdx] as {
          kind: 'line'; id: number; translation: string; transcription: string; finalized: boolean; failed?: boolean;
        };
        const mergedTranscription = pair.en || sortedIndices.map((i) => (next[i] as any).transcription).join(' ');
        next[firstIdx] = { ...first, transcription: mergedTranscription, translation: pair.zh, failed: isFailed };
        for (let k = sortedIndices.length - 1; k >= 1; k--) {
          next.splice(sortedIndices[k], 1);
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

  // Retry handler for a failed translation card.
  // Re-runs the same prompt liveSession would have built and updates the
  // line in place. While in flight the card swaps from "翻译失败 ⚠️ 重试"
  // back to "翻译中…" so users get clear feedback the retry is happening.
  //
  // Hardening (2026-04-27 evening):
  //   - Read the line via setStream's prev callback instead of the stream
  //     closure so a freshly-mounted retry handler always sees current state
  //     (avoids stale-closure race during concurrent batchId updates).
  //   - 15s timeout: a hung Gemini call must not leave the user staring
  //     at "翻译中▍" forever — flip back to failed state with an actionable
  //     toast.
  //   - Surface the actual error status (429 = rate limit, 503 = upstream
  //     overloaded, etc.) so users / Sentry know WHY.
  const retryFailedTranslation = async (lineId: number) => {
    let englishParagraph = '';
    setStream((prev) => {
      const target = prev.find((it) => it.kind === 'line' && it.id === lineId);
      if (target && target.kind === 'line') {
        englishParagraph = target.transcription;
      }
      return prev;
    });
    if (!englishParagraph) {
      toast.error(uiLang === 'zh' ? '找不到要重试的内容' : 'Nothing to retry');
      return;
    }

    // Reset to "in flight" state so user sees activity. translation=''
    // + failed=false makes the card render as a "still pending" group.
    setStream((prev) => prev.map((it) =>
      it.kind === 'line' && it.id === lineId
        ? { ...it, translation: '', failed: false }
        : it
    ));

    const activeCourse = resolveActiveCourse();
    const courseHint = activeCourse
      ? ` The class subject is: ${activeCourse}. Translate technical terms in that subject's convention; keep well-known English initialisms (e.g. CAPM, GDP, DNA) untranslated.`
      : '';
    const prompt = `You are a faithful simultaneous interpreter translating live English speech into Chinese for a Chinese international student.${courseHint}

The input below is a continuous paragraph of spoken English (transcribed by a speech model, so it may contain repetitions or filler). Produce a SINGLE faithful Chinese translation paragraph that preserves the speaker's voice and perspective.

CRITICAL — PRESERVE PERSON AND PERSPECTIVE:
- This is interpretation, NOT summarization or rewriting. Do NOT shift to third-person narration.
- "I" must become "我", NOT "他/她/老师/讲师/作者". If the speaker says "I love dancing", translate as "我喜欢跳舞", NEVER as "她说她喜欢跳舞" or "讲师说自己喜欢跳舞".
- "you" / "you guys" / "y'all" must become "你/你们/大家" addressed directly, NOT "听众/学生/观众".
- "we" must become "我们", NOT "大家".
- If a third party is being quoted (e.g. "Julia tells us..."), keep the quote as direct first-person Chinese ("朱莉娅说：'我...'") matching how it was uttered, instead of paraphrasing it as third-person.
- Do NOT add framing words like "讲师认为", "她表示", "据他所说" unless those words appear literally in the English source.

OTHER RULES:
- Output is ONE Chinese paragraph. PURE CHINESE ONLY — no English words, no parenthetical English glosses, no Latin characters anywhere.
- Do NOT write things like 新雪（fresh powder） or "可理解性输入（comprehensive input）". The user has the English source displayed alongside, so embedded English is redundant.
- Exception: well-known initialisms that even Chinese speakers leave untranslated — CAPM, GDP, DNA, AI, HTTP, API, CEO. Leave these as-is, no parentheses.
- Keep natural spoken Chinese (口语化), not stiff written Chinese.
- Clean up obvious filler words (um, uh, like, you know) and stutters, but do NOT paraphrase content or "smooth out" the speaker's meaning. Stay faithful to what was said.
- Do not add commentary about transcription quality.

English paragraph:
${englishParagraph}`;

    try {
      const zh = await Promise.race([
        translateSimple(prompt, undefined, 'classroom').then((s) => s.trim()),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('timeout: 15s')), 15000)
        ),
      ]);
      setStream((prev) => prev.map((it) =>
        it.kind === 'line' && it.id === lineId
          ? { ...it, translation: zh, failed: false }
          : it
      ));
    } catch (e: any) {
      const status = e?.status || (e?.message?.match(/(\d{3})/)?.[1]);
      const msg = e?.message || String(e);
      Sentry.captureException(e, {
        tags: { component: 'ClassroomTab', op: 'retryFailedTranslation', status: String(status || 'unknown') },
      });
      setStream((prev) => prev.map((it) =>
        it.kind === 'line' && it.id === lineId
          ? { ...it, translation: TRANSLATION_FAILED_ZH, failed: true }
          : it
      ));
      // Tailor the toast to the actual cause so users know what to do.
      let userMsg: string;
      if (status === 429 || /rate limit/i.test(msg)) {
        userMsg = uiLang === 'zh' ? '请求太频繁，请等几秒再试' : 'Too many requests, wait a few seconds';
      } else if (msg.includes('timeout')) {
        userMsg = uiLang === 'zh' ? '翻译超时（15 秒），网络可能不稳' : 'Translation timed out (15s)';
      } else if (status === 503) {
        userMsg = uiLang === 'zh' ? 'AI 服务暂时不可用，稍后重试' : 'AI service temporarily unavailable';
      } else if (status === 401 || status === 403) {
        userMsg = uiLang === 'zh' ? '登录可能过期，请刷新页面' : 'Session expired, please refresh';
      } else {
        userMsg = uiLang === 'zh' ? `重试失败：${msg.slice(0, 60)}` : `Retry failed: ${msg.slice(0, 60)}`;
      }
      toast.error(userMsg);
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

  // 内容签名：不只看 stream.length，还把每条的转写+译文长度算进去。
  // 修复（2026-06-16）"翻译出来不自动到最新"：译文是异步填进【已存在】的
  // line（applyTranslationBatch），stream.length 不变 → 旧 effect 只依赖
  // [stream] 数组引用变化，但更要命的是它在 React 重绘【之前】同步读
  // scrollHeight，量到的是【加译文变高之前】的旧高度，于是滚到旧底部，
  // 新译文又被推到屏幕外。两个修法：① 依赖加内容签名，译文变长也触发；
  // ② 用 requestAnimationFrame 把滚动推迟到重绘后，读到的是新高度。
  const streamContentSig = stream.reduce((n, it: any) =>
    n + (it.transcription?.length || 0) + (it.translation?.length || 0) + (it.answer?.length || 0), 0);

  // Auto-scroll on stream change — only when user is at bottom.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // 重绘前先判断用户是否在底部（基于当前可见高度），避免新内容撑高后误判。
    const wasAtBottom =
      el.scrollHeight - el.clientHeight - el.scrollTop <= STICK_THRESHOLD_PX;
    if (wasAtBottom) {
      // 推迟到下一帧：此时新译文已渲染、scrollHeight 是最新的，贴底才贴得准。
      const raf = requestAnimationFrame(() => {
        const e2 = scrollerRef.current;
        if (e2) e2.scrollTop = e2.scrollHeight;
      });
      lastSeenStreamLenRef.current = stream.length;
      setUnseenCount(0);
      return () => cancelAnimationFrame(raf);
    } else {
      const delta = stream.length - lastSeenStreamLenRef.current;
      if (delta > 0) setUnseenCount(delta);
    }
  }, [streamContentSig, stream.length]);

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

  // Resolve the course display name the same way several callsites need
  // it (live-notes job, save-to-notes). Centralised so all paths label
  // the notes with the course the user actually sees on screen.
  const resolveCourseLabel = (): string | undefined => {
    if (selectedCourse === '__custom__') return customCourse.trim() || undefined;
    if (!selectedCourse) return undefined;
    const preset = COURSE_PRESETS.find((p) => p.zh === selectedCourse || p.en === selectedCourse);
    if (preset) return uiLang === 'zh' ? preset.zh : preset.en;
    return selectedCourse;
  };

  // Collect all finalized English the teacher has said so far. We skip
  // interim text so mid-word guesses don't poison the notes. Used by both
  // the auto-refresh effect and the manual retry button.
  const collectFinalizedEnglish = (): string =>
    streamRef.current
      .filter((item) => item.kind === 'line' && item.finalized && item.transcription)
      .map((item) => (item as any).transcription as string)
      .join(' ');

  // Core notes generation, shared by the auto-refresh effect and the
  // manual「重试」button on the panel's error state. `force=true` skips
  // the throttle gates so a user-initiated retry runs immediately even if
  // we just failed seconds ago. On failure we surface a visible error
  // state (panel shows an error row + Retry) instead of the old silent
  // console.warn — a blank panel with no explanation read as "broken".
  const runLiveNotesGeneration = async (force = false) => {
    if (liveNotesInFlightRef.current) return;

    const englishSoFar = collectFinalizedEnglish();
    if (englishSoFar.length < LIVE_NOTES_MIN_NEW_CHARS) return; // not enough yet

    if (!force) {
      const now = Date.now();
      const sinceLast = now - liveNotesLastRunRef.current;
      const newChars = englishSoFar.length - liveNotesLastLenRef.current;
      if (sinceLast < LIVE_NOTES_MIN_INTERVAL_MS) return;
      if (newChars < LIVE_NOTES_MIN_NEW_CHARS) return;
    }

    liveNotesInFlightRef.current = true;
    liveNotesLastRunRef.current = Date.now();
    liveNotesLastLenRef.current = englishSoFar.length;
    setLiveNotesError(null);
    setLiveNotesLoading(true);

    try {
      const notes = await generateLiveNotes(englishSoFar, { course: resolveCourseLabel() });
      setLiveNotes(notes);
      setNotesLastUpdatedAt(Date.now());
      setLiveNotesError(null);
    } catch (err: any) {
      // Surface the failure — a blank panel with no reason looks broken.
      const msg = err?.message || String(err);
      console.warn('[classroom] live notes generation failed:', err);
      Sentry.captureException(err, { tags: { component: 'ClassroomTab', op: 'generateLiveNotes' } });
      setLiveNotesError(
        uiLang === 'zh'
          ? '笔记生成失败，点击重试'
          : 'Notes failed, tap to retry'
      );
      // Roll the "last len" pointer back so the next auto-refresh tick is
      // free to retry on its own as more transcript arrives, instead of
      // being blocked by the min-new-chars gate against this failed run.
      liveNotesLastLenRef.current = Math.max(0, englishSoFar.length - LIVE_NOTES_MIN_NEW_CHARS);
      if (msg) { /* msg retained for Sentry; user copy stays generic */ }
    } finally {
      liveNotesInFlightRef.current = false;
      setLiveNotesLoading(false);
    }
  };

  // Manual retry from the panel's error row. Forces an immediate run.
  const handleRetryLiveNotes = () => {
    void runLiveNotesGeneration(true);
  };

  // Live Notes refresh trigger. Runs on every stream change, guarded by
  // min-interval and min-new-chars inside runLiveNotesGeneration. The
  // async work happens in the background; liveNotesInFlightRef prevents
  // overlapping refreshes (pro can take 20-40s on a big transcript).
  useEffect(() => {
    if (status !== 'live') return;
    void runLiveNotesGeneration(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
   *
   * `edited` is the panel's effective notes (manual edits when present,
   * else the AI version). We persist that so what the user saves matches
   * what they see; fall back to `liveNotes` if the panel passed nothing.
   */
  const handleSaveLiveNotesToClassNotes = async (edited?: LiveNotes) => {
    const zh = uiLang === 'zh';
    const notesToSave = edited ?? liveNotes;
    if (!notesToSave) {
      toast.error(zh ? '还没有可保存的笔记' : 'No notes to save yet');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      toast.error(zh ? '请先登录再保存笔记' : 'Sign in to save notes');
      return;
    }
    // Resolve the course display name the same way the live-notes
    // refresh job does (shared helper), so saved notes carry the course
    // label the user was actually seeing on screen.
    const courseLabel = resolveCourseLabel();
    setIsSavingLiveNotes(true);
    try {
      await addDoc(collection(db, 'classNotes'), {
        uid: user.uid,
        title: notesToSave.title ?? '',
        overview: notesToSave.overview ?? [],
        keyPoints: notesToSave.keyPoints ?? [],
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
  const handleExportLiveNotesPdf = async (edited?: LiveNotes) => {
    const zh = uiLang === 'zh';
    const notesToExport = edited ?? liveNotes;
    if (!notesToExport) {
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
      const title = notesToExport.title || (zh ? 'MemeFlow 实时笔记' : 'MemeFlow Live Notes');
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

      writeSection(zh ? '概述 Overview' : 'Overview', notesToExport.overview || []);
      writeSection(zh ? '重点 Key Points' : 'Key Points', notesToExport.keyPoints || []);

      // Footer
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text('Generated by MemeFlow · memeflow.cn', margin, 820);

      const safeTitle = (notesToExport.title || 'memeflow-notes')
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
    setLiveNotesError(null);
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
          onBatchOpen: handleBatchOpen,
          onTranscriptionDelta: appendTranscriptionDelta,
          onTranslationPending: (pending, key) => {
            setPendingTranslations((prev) => {
              const next = new Set(prev);
              if (pending) next.add(key); else next.delete(key);
              return next;
            });
          },
          // Stash the ASR quality stats stop() computes so handleStop can
          // persist them with the transcript (see classSessions write below).
          onSessionStats: (stats) => { sessionStatsRef.current = stats; },
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
      // 恢复时再"封口"一次：把任何残留的 unfinalized line 锁住，让恢复
      // 后的第一段新转录建一个全新 line，不会覆盖暂停前的内容。
      setStream((prev) => prev.map((it) =>
        it.kind === 'line' && !it.finalized && it.transcription.trim()
          ? { ...it, finalized: true }
          : it
      ));
    } else {
      handle.pause();
      setPaused(true);
      // 暂停时把当前所有 unfinalized line 封口——避免恢复后新 interim
      // 把暂停前那段 interim 直接覆盖掉（用户报"音频转文字又开始覆盖"）。
      setStream((prev) => prev.map((it) =>
        it.kind === 'line' && !it.finalized && it.transcription.trim()
          ? { ...it, finalized: true }
          : it
      ));
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
      // 清掉所有 batch 超时 watchdog —— 会话结束就不再需要"30s 还没回就标失败"
      for (const t of batchTimeoutsRef.current.values()) clearTimeout(t);
      batchTimeoutsRef.current.clear();
    }
    // Persist the session so the user can find their notes later.
    // Best-effort; a save failure doesn't punish the UX — they still have
    // the live subtitles on screen.
    const user = auth.currentUser;
    if (user && transcript.trim().length > 0) {
      // onSessionStats fired inside handle.stop() above (already awaited), so
      // these are populated by now. Spread only when present so an early
      // teardown (no stats) still writes a valid doc — admin aggregation
      // treats missing fields as "untagged" rather than crashing.
      const stats = sessionStatsRef.current;
      try {
        await addDoc(collection(db, 'classSessions'), {
          uid: user.uid,
          mode,
          audioSource,
          startedAt: Timestamp.now(),
          endedAt: Timestamp.now(),
          transcript,
          createdAt: serverTimestamp(),
          // 课件导入（2026-06-16）：把本次会话期间上传的课件一并写进会话
          // 文档，方便日后在笔记/会话详情里回看。courseSlides 里的 uploadedAt
          // 是 epoch ms（number），Firestore 直接存数字即可，不必转 Timestamp。
          ...(courseSlides.length > 0 && { courseSlides }),
          ...(stats && {
            durationSec: stats.durationSec,
            finalEventCount: stats.finalEventCount,
            emptyFinalCount: stats.emptyFinalCount,
            emptyFinalRatio: stats.emptyFinalRatio,
            rescuedCount: stats.rescuedCount,
          }),
        });
        toast.success(uiLang === 'zh' ? '笔记已保存' : 'Notes saved');
      } catch (e: any) {
        console.warn('Save class session failed:', e);
        Sentry.captureException(e, { tags: { component: 'ClassroomTab', op: 'firestore.write', collection: 'classSessions' } });
        toast.error(uiLang === 'zh' ? '保存笔记失败' : 'Could not save notes');
      } finally {
        sessionStatsRef.current = null;
      }
    } else {
      sessionStatsRef.current = null;
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

  // 悬浮字幕窗（Document Picture-in-Picture）：把最近 2 条【已翻译完成】的
  // 双语字幕弹成一个浮在所有窗口之上的小窗，用户可边看 PPT 边看翻译。
  // latestSubtitles 随 stream 实时更新 → hook 内部把它渲染进 PiP 窗。
  const latestSubtitles = useMemo(() => pickLatestSubtitles(stream, 2), [stream]);
  const floatingSubtitle = useFloatingSubtitle(latestSubtitles, uiLang);

  // How much finalized English we've accumulated — feeds the LiveNotesPanel
  // "正在收集课堂内容…" guidance state so it can distinguish "waiting for
  // enough speech" from "loading" and "error".
  const collectedEnglishChars = useMemo(
    () =>
      stream
        .filter((item) => item.kind === 'line' && item.finalized && item.transcription)
        .reduce((sum, item) => sum + ((item as any).transcription as string).length, 0),
    [stream]
  );

  // Session timer (seconds) — shown mono-spaced in the live bar so users
  // can glance at elapsed time without checking system clock. Only counts
  // while status === 'live'; resets to 0 on stop.
  const [sessionElapsed, setSessionElapsed] = useState(0);
  // Session timer — counts elapsed seconds while live AND not paused.
  // Reset to 0 when leaving the live state entirely (stop / error).
  // Previously only checked isLive, so the seconds kept ticking even
  // when the user hit pause and there was no audio flowing → felt like
  // a bug because the user expected pause to mean "freeze everything".
  useEffect(() => {
    if (!isLive) { setSessionElapsed(0); return; }
    if (paused) return; // live but paused → freeze the counter
    const timer = setInterval(() => setSessionElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isLive, paused]);
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

  // Pro gate (added 2026-04-27 evening): the classroom feature went Pro-only
  // because (a) it's the most expensive call path — Deepgram WebSocket per
  // session + Gemini paragraph translates — and (b) Pro deserves a real
  // capability beyond cosmetic perks. Free users land on a paywall card
  // instead of the full UI. We render this BEFORE useEffects that depend
  // on session lifecycle so non-Pro users don't run any of that machinery.
  if (!isPro) {
    return (
      <div
        className="glass-thick rounded-[24px] p-[28px_32px] flex flex-col items-center text-center gap-4"
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0"
          style={{
            background: 'linear-gradient(135deg, #F0D78A, #E88B7D)',
            boxShadow: '0 6px 16px rgba(232,139,125,0.3)',
          }}
        >
          <Headphones className="w-7 h-7" />
        </div>
        <h2
          className="m-0"
          style={{
            fontFamily: '"Clash Display", system-ui, sans-serif',
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: '-0.015em',
            color: 'var(--ink)',
          }}
        >
          {uiLang === 'zh' ? (
            <>课堂同传是 <em style={{ fontStyle: 'italic', color: 'var(--blue-accent)' }}>Pro 专享</em></>
          ) : (
            <>Classroom live is <em style={{ fontStyle: 'italic', color: 'var(--blue-accent)' }}>Pro only</em></>
          )}
        </h2>
        <p
          className="m-0 max-w-[440px]"
          style={{
            fontFamily: '"Noto Serif SC", serif',
            fontSize: 14,
            lineHeight: 1.85,
            color: 'var(--ink-muted)',
          }}
        >
          {uiLang === 'zh'
            ? '上课时实时听英文录音，整段一段段地把中文翻译翻给你。配实时笔记 + 课堂问 AI，3 段并发翻译让长课不卡。'
            : 'Live English transcription with paragraph-level Chinese translation, live notes, and classroom Q&A. 3 paragraphs translate in parallel so long lectures stay snappy.'}
        </p>
        <ul
          className="m-0 p-0 list-none flex flex-col gap-2 max-w-[440px] w-full"
          style={{ fontFamily: '"Noto Sans SC", system-ui, sans-serif', fontSize: 13, color: 'var(--ink-body)' }}
        >
          {(uiLang === 'zh'
            ? ['长课不掉线 — 自动重连 + 卡住一键重启', '3 段同时翻译，跟得上快讲师', '实时笔记自动总结要点 + 待办', '课堂中可以随时问 AI 任何问题']
            : ['Auto-reconnect + manual recover for long lectures', '3-paragraph parallel translate keeps up with fast speakers', 'Live notes auto-summarize key points + todos', 'Ask AI anything mid-class']
          ).map((line, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-[var(--blue-accent)] shrink-0">·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            // Toast a hint — the actual paywall is on the profile tab
            // (this Tab is rendered in isolation; we don't have direct
            // access to setActiveTab here without prop drilling).
            toast.info(uiLang === 'zh' ? '前往「我的」→「升级 Pro」即可解锁。' : 'Open the profile tab and tap upgrade.');
          }}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white border-0 cursor-pointer mt-2"
          style={{
            background: 'linear-gradient(135deg, #F0D78A, #E88B7D)',
            boxShadow: '0 4px 12px rgba(232,139,125,0.35)',
            fontFamily: '"Clash Display", system-ui, sans-serif',
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.02em',
          }}
        >
          <Zap className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
          {uiLang === 'zh' ? '升级 Pro 解锁' : 'Upgrade to Pro'}
        </button>
      </div>
    );
  }

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

              <div className="flex items-start gap-2.5 select-none mb-4">
                <Checkbox
                  id="classroom-compliance-agree"
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="classroom-compliance-agree"
                  className="font-zh-serif text-[13px] text-[var(--ink-body)] cursor-pointer"
                >
                  我已阅读并理解上述内容，确认使用本功能所产生的责任由我自己承担。
                </label>
              </div>

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
          {/* 音源分区切换 —— 改用共享 ToggleGroup（type=single）。
              现状：原来是两个自定义 <button>，靠 className 三元手动画选中态。
              修后：复用 src/components/ui/toggle-group.tsx，选中态自动是品牌蓝底
                    白字；onValueChange 复用原来的 setAudioSource，业务逻辑不变。
              注意：单选 ToggleGroup 允许"再点一下取消选中"会回传空串 ''，那样
                    会让音源变成未选状态，所以 v==='' 时忽略，保持二选一互斥。 */}
          <ToggleGroup
            type="single"
            value={audioSource}
            onValueChange={(v) => {
              if (v === 'tab' || v === 'mic') setAudioSource(v);
            }}
            disabled={isLive || isBusy}
            className="flex-1 flex flex-wrap justify-start gap-1.5"
          >
            <ToggleGroupItem
              value="mic"
              aria-label={uiLang === 'zh' ? '麦克风 / 线下课' : 'microphone'}
              className="gap-1.5 rounded-full font-display italic text-[13px] tracking-[-0.01em]"
            >
              <Mic className="w-3 h-3" /> mic · {uiLang === 'zh' ? '麦克风' : 'mic'}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="tab"
              aria-label={uiLang === 'zh' ? '浏览器标签音频 / 在线课' : 'browser tab audio'}
              className="gap-1.5 rounded-full font-display italic text-[13px] tracking-[-0.01em]"
            >
              <Monitor className="w-3 h-3" /> tab audio · {uiLang === 'zh' ? '浏览器标签' : 'browser tab'}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Row 2 was the realtime/paragraph toggle — removed 2026-04-27
            because realtime produced disjointed Chinese and we now always
            run paragraph mode. */}

        {/* 字幕显示切换（2026-05-02 移除）：之前提供"只看中文 / 中英对照"
            两档让用户选；改为永远中英对照，UI 控件直接删掉。学英语场景
            英文原文是核心价值，不该让用户折腾这个开关。 */}

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

        {/* Row 5: 课件导入 — 上传 PDF/PPT/图片课件，同页展示。上传产物存进
            courseSlides 本地 state，handleStop 时随 classSessions 一起写库。
            课堂同传整体是 Pro 专享（非 Pro 在组件顶部就被 paywall 拦截，走不
            到这里），所以这里无需再加 Pro 门槛。 */}
        <div className="pt-[14px] mt-2 border-t border-[var(--ink-hairline)]">
          <CourseSlides
            uiLang={uiLang}
            sessionId={slideSessionIdRef.current}
            slides={courseSlides}
            onChange={setCourseSlides}
          />
        </div>

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

        {/* Live action toolbar — 立即翻译（点按）+ 悬浮字幕（开关）紧凑成
            一行小控件，体积比之前两个全宽按钮小很多，且放在一起。 */}
        {status === 'live' && (
          <LiveActionToolbar
            uiLang={uiLang}
            onFlush={handleManualFlush}
            floatingActive={floatingSubtitle.active}
            onToggleFloating={floatingSubtitle.active ? floatingSubtitle.close : floatingSubtitle.open}
          />
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

      {/* Mirror for collapsed-config view — same compact toolbar. */}
      {!isConfigExpanded && status === 'live' && (
        <LiveActionToolbar
          uiLang={uiLang}
          onFlush={handleManualFlush}
          floatingActive={floatingSubtitle.active}
          onToggleFloating={floatingSubtitle.active ? floatingSubtitle.close : floatingSubtitle.open}
        />
      )}

      {/* 悬浮字幕降级条 — 不支持 Document PiP 的浏览器（Safari/Firefox）点
          按钮时，这里渲染一个 fixed、底部居中、可拖拽的字幕条；支持 PiP 时
          为 null（字幕渲染在独立窗里）。 */}
      {floatingSubtitle.fallbackNode}

      {/* CLASSROOM WORKSPACE — 左右分栏（2026-06-16 修 iPad 适配）。
          断点从 lg(1024) 提到 xl(1280)：iPad 横屏(~1024-1180) 实测分栏后
          字幕被挤到一列窄字、右侧笔记又撑不满留大片空白。改成只有真正宽
          的桌面(≥1280) 才左右分栏，iPad/平板一律单列上下堆叠 —— 字幕全宽
          可读性好得多，笔记排在字幕下方。侧栏宽 380→340 收一点。
          两栏各自独立滚动，scrollerRef 贴底/↓N new 逻辑不动。 */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      {/* LEFT — TRANSCRIPT STREAM. min-height bumped so subtitles occupy
          the visual center of the classroom page. */}
      <div className="relative">
        {/* stream-fade — 底部白色渐隐层，让长字幕有"渐隐出底"的视觉。
            绝对定位盖在 scroller 底部，pointer-events-none 不拦滚动/点击。 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0 bottom-0 h-20 z-[1] rounded-b-[28px]"
          style={{
            background: 'linear-gradient(to bottom, rgba(244,247,255,0) 0%, #F4F7FF 100%)',
          }}
        />
        <div
          ref={scrollerRef}
          className="glass-thick rounded-[28px] p-[26px_28px_64px_40px] min-h-[440px] max-h-[72vh] overflow-y-auto relative"
        >
          {/* Floating notes-chip — switches the sidebar to the notes tab and
              scrolls the panel into view (the scrollIntoView matters on the
              <lg stacked layout where the sidebar sits below the stream). */}
          <button
            type="button"
            onClick={() => {
              setSidebarTab('notes');
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
            type Group =
              | { kind: 'pending-group'; items: LineItem[] }       // still accumulating, no batch yet
              | { kind: 'sealed-group'; batchId: string; items: LineItem[] }  // batch flushed, awaiting zh
              | { kind: 'translated-line'; item: LineItem };

            const groups: Group[] = [];
            for (const item of stream) {
              // QA exchanges now live in the right sidebar's「问 AI」tab
              // (2026-06-16) — skip them here so they don't render twice.
              if (item.kind === 'qa') continue;
              if (item.translation) {
                groups.push({ kind: 'translated-line', item });
                continue;
              }
              // Sealed (batchId set, awaiting zh) — group with siblings
              // of the same batchId, but NEVER merge with a pending-group
              // or another batch. This is what makes the divider land in
              // the right place: the moment a batch flushes, the renderer
              // sees its lines pop into a sealed-group, the next live
              // transcript starts a fresh pending-group below.
              if (item.sealedByBatch) {
                const last = groups[groups.length - 1];
                if (last && last.kind === 'sealed-group' && last.batchId === item.sealedByBatch) {
                  last.items.push(item);
                } else {
                  groups.push({ kind: 'sealed-group', batchId: item.sealedByBatch, items: [item] });
                }
                continue;
              }
              // Plain pending (still accumulating, no batch yet)
              const last = groups[groups.length - 1];
              if (last && last.kind === 'pending-group') {
                last.items.push(item);
              } else {
                groups.push({ kind: 'pending-group', items: [item] });
              }
            }

            return groups.map((group, idx) => {
              if (group.kind === 'translated-line') {
                const item = group.item;
                const isFailed = !!item.failed;
                return (
                  <div key={`l-${item.id}`} className={cn("py-[14px]", idx > 0 && "border-t border-dashed border-[rgba(10,14,26,0.07)]")}>
                    <span className={cn(
                      "inline-block font-mono-meta text-[9px] font-bold tracking-[0.15em] uppercase px-[7px] py-[2px] rounded-[5px] mb-2",
                      isFailed
                        ? "bg-[rgba(229,56,43,0.1)] text-[var(--red-warn)]"
                        : "bg-[rgba(91,127,232,0.1)] text-[var(--blue-accent)]"
                    )}>
                      {isFailed
                        ? (uiLang === 'zh' ? '翻译失败' : 'translation failed')
                        : 'paragraph · 整段翻译'}
                    </span>
                    {showOriginal && item.transcription && (
                      <p className="font-body-en text-[14px] leading-[1.5] text-[rgba(10,14,26,0.48)] m-0 mb-1.5">
                        "{item.transcription}"
                      </p>
                    )}
                    {isFailed ? (
                      <div className="flex items-center gap-3 mt-1">
                        <p className="font-zh-sans text-[14px] leading-[1.6] m-0 text-[var(--red-warn)]">
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
                      <p className="font-zh-sans text-[17px] leading-[1.8] m-0 text-[rgba(10,14,26,0.78)]">
                        {item.translation}
                      </p>
                    )}
                  </div>
                );
              }

              if (group.kind === 'sealed-group') {
                // Batch was flushed, awaiting Gemini's zh response. Render
                // as a closed card: "整段翻译" label + joined English +
                // "翻译中▍" cursor. The next group will start fresh below
                // (with a divider thanks to idx > 0).
                const joinedEnglish = group.items
                  .map((it) => it.transcription)
                  .filter(Boolean)
                  .join(' ');
                const groupKey = `sealed-${group.batchId}`;
                return (
                  <div key={groupKey} className={cn("py-[14px]", idx > 0 && "border-t border-dashed border-[rgba(10,14,26,0.07)]")}>
                    <span className="inline-block font-mono-meta text-[9px] font-bold tracking-[0.15em] uppercase px-[7px] py-[2px] rounded-[5px] mb-2 bg-[rgba(91,127,232,0.1)] text-[var(--blue-accent)]">
                      paragraph · 整段翻译
                    </span>
                    {showOriginal && joinedEnglish && (
                      <p className="font-body-en text-[14px] leading-[1.5] text-[rgba(10,14,26,0.48)] m-0 mb-1.5">
                        "{joinedEnglish}"
                      </p>
                    )}
                    <p className="font-zh-sans text-[17px] leading-[1.8] m-0 text-[var(--blue-accent)] font-semibold">
                      {uiLang === 'zh' ? '翻译中' : 'translating'}
                      <span className="inline-block w-2 h-[18px] align-[-3px] ml-1.5 bg-[var(--blue-accent)] animate-pulse" />
                    </p>
                  </div>
                );
              }

              // pending-group: still accumulating, no batch dispatched yet.
              // Show "正在攒句" label + joined English; NO "翻译中" cursor
              // (nothing's been translated yet — that label was
              // misleading and made users think translation was already
              // running while batch threshold hadn't fired).
              const joinedEnglish = group.items
                .map((it) => it.transcription)
                .filter(Boolean)
                .join(' ');
              const groupKey = `pg-${group.items[0]?.id ?? idx}`;
              return (
                <div key={groupKey} className={cn("py-[14px]", idx > 0 && "border-t border-dashed border-[rgba(10,14,26,0.07)]")}>
                  <span className="inline-block font-mono-meta text-[9px] font-bold tracking-[0.15em] uppercase px-[7px] py-[2px] rounded-[5px] mb-2 bg-[rgba(232,180,60,0.18)] text-[#8A5D0E]">
                    paragraph · 正在攒句
                  </span>
                  {showOriginal && joinedEnglish ? (
                    <p className="font-body-en text-[14px] leading-[1.5] text-[rgba(10,14,26,0.6)] m-0">
                      "{joinedEnglish}"
                      <span className="inline-block w-1.5 h-[14px] align-[-2px] ml-1 bg-[#8A5D0E] animate-pulse" />
                    </p>
                  ) : (
                    // showOriginal=false: don't render anything but the
                    // label so the user knows we're listening. Inline
                    // pulse cursor so it doesn't feel frozen.
                    <p className="font-zh-sans text-[14px] leading-[1.6] m-0 text-[var(--ink-muted)]">
                      {uiLang === 'zh' ? '正在听…' : 'listening…'}
                      <span className="inline-block w-1.5 h-[14px] align-[-2px] ml-1 bg-[#8A5D0E] animate-pulse" />
                    </p>
                  )}
                </div>
              );
            });
          })()}

          {/* Removed 2026-04-27: this global "翻译中…" indicator was
              redundant — each pending paragraph card already shows its
              own "翻译中▍" cursor inside the bubble. Two indicators
              looked like a bug to users. */}
        </div>
        {/* 跳到最新按钮（一键到底）。改成只要不在底部就显示——
            有新内容时显示数字，没有新内容时显示"跳到最新"。这样用户
            滚回去看历史时，永远能一键回到最新位置，不用手动滚。 */}
        {!isAtBottom && (
          <button
            type="button"
            onClick={jumpToLatest}
            aria-label={uiLang === 'zh' ? (unseenCount > 0 ? `跳到最新（${unseenCount} 条新内容）` : '跳到最新') : (unseenCount > 0 ? `Jump to latest (${unseenCount} new)` : 'Jump to latest')}
            className="absolute left-1/2 -translate-x-1/2 bottom-2 z-20 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--blue-accent)] text-white font-mono-meta text-[11px] font-semibold tracking-[0.05em] shadow-[0_4px_14px_rgba(91,127,232,0.4)] hover:bg-[var(--blue-accent-deep)] cursor-pointer border-0"
          >
            <span>↓</span>
            <span>
              {unseenCount > 0
                ? (uiLang === 'zh' ? `${unseenCount} 条新内容` : `${unseenCount} new`)
                : (uiLang === 'zh' ? '跳到最新' : 'Latest')}
            </span>
          </button>
        )}
      </div>{/* /LEFT column (relative wrapper) */}

      {/* RIGHT — 笔记 / 问AI 侧栏（2026-06-16）。
          桌面/iPad 横屏：sticky 固定在右侧，跟着字幕一起看；
          窄屏（<lg）：自然落到字幕下方，单列堆叠。
          两个 Tab 在同一个右侧栏：默认「笔记」，点一下切到「问 AI」，
          这样"看笔记"和"问 AI"集中在一处，不用到处找。 */}
      <div className="xl:sticky xl:top-4 flex flex-col gap-3 min-w-0">
        {/* Tab 切换条 */}
        <div className="surface !rounded-[14px] p-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSidebarTab('notes')}
            aria-pressed={sidebarTab === 'notes'}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] font-zh-sans font-bold text-[13px] transition-colors border-0 cursor-pointer',
              sidebarTab === 'notes'
                ? 'bg-[var(--ink)] text-white shadow-[0_3px_8px_rgba(10,14,26,0.18)]'
                : 'bg-transparent text-[var(--ink-muted)] hover:text-[var(--ink-body)]'
            )}
          >
            <StickyNote className="w-3.5 h-3.5" />
            {uiLang === 'zh' ? '笔记' : 'Notes'}
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('chat')}
            aria-pressed={sidebarTab === 'chat'}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] font-zh-sans font-bold text-[13px] transition-colors border-0 cursor-pointer relative',
              sidebarTab === 'chat'
                ? 'bg-[var(--ink)] text-white shadow-[0_3px_8px_rgba(10,14,26,0.18)]'
                : 'bg-transparent text-[var(--ink-muted)] hover:text-[var(--ink-body)]'
            )}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {uiLang === 'zh' ? '问 AI' : 'Ask AI'}
          </button>
        </div>

        {/* NOTES TAB */}
        {sidebarTab === 'notes' && (
          <LiveNotesPanel
            notes={liveNotes}
            loading={liveNotesLoading}
            uiLang={uiLang}
            lastUpdatedAt={notesLastUpdatedAt || undefined}
            onSaveToNotes={handleSaveLiveNotesToClassNotes}
            onExportPdf={handleExportLiveNotesPdf}
            isSaving={isSavingLiveNotes}
            isLive={isLive}
            errorMessage={liveNotesError}
            onRetry={handleRetryLiveNotes}
            collectedChars={collectedEnglishChars}
            minCharsForNotes={LIVE_NOTES_MIN_NEW_CHARS}
          />
        )}

        {/* CHAT TAB — reuses the existing chat state (question / isAsking /
            handleAsk) and the qa items already in `stream`. We just render
            a dedicated message list + input here instead of inline in the
            subtitle column, so "看笔记" and "问 AI" share one sidebar. */}
        {sidebarTab === 'chat' && (
          <div className="surface !rounded-[14px] flex flex-col overflow-hidden max-h-[72vh]">
            {/* messages */}
            <div className="flex-1 overflow-y-auto p-[18px_18px_12px] min-h-[200px]">
              {(() => {
                const qaItems = stream.filter((it): it is Extract<StreamItem, { kind: 'qa' }> => it.kind === 'qa');
                if (qaItems.length === 0) {
                  return (
                    <div className="font-zh-serif text-[13px] text-[var(--ink-muted)] leading-[1.85] py-2">
                      {uiLang === 'zh' ? (
                        <>上课没听懂？在下面输入你的问题 — 比如「老师刚才说的 CAPM 是啥？」AI 会根据已经讲过的内容用中文回答。</>
                      ) : (
                        <>Missed something? Type your question below — e.g. "what did the prof mean by CAPM?" AI replies using what's been said so far.</>
                      )}
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    {qaItems.map((item) => (
                      <div key={`chat-${item.id}`} className="space-y-1.5">
                        {/* user */}
                        <div className="flex justify-end">
                          <div className="max-w-[88%] px-3 py-2 rounded-[14px] rounded-tr-[4px] bg-[var(--ink)] text-white font-zh-serif text-[13.5px] leading-[1.7]">
                            {item.question}
                          </div>
                        </div>
                        {/* ai */}
                        <div className="flex justify-start">
                          <div className="max-w-[92%] px-3 py-2 rounded-[14px] rounded-tl-[4px] bg-[rgba(91,127,232,0.08)] border border-[rgba(91,127,232,0.18)] font-zh-serif text-[13.5px] leading-[1.75] text-[var(--ink)] whitespace-pre-wrap [&_strong]:text-[var(--blue-accent)] [&_strong]:font-semibold">
                            {item.pending
                              ? <MessageLoading className="w-6 h-5" />
                              : item.answer}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            {/* input */}
            <div className="p-[10px_12px] flex items-center gap-2 border-t border-[rgba(91,127,232,0.18)]">
              <Sparkles className="w-[18px] h-[18px] text-[var(--blue-accent)] shrink-0" />
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
                placeholder={uiLang === 'zh' ? '问 AI 任何问题…' : 'Ask AI anything…'}
                disabled={isAsking}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none font-zh-serif text-[14px] text-[var(--ink)] placeholder:font-display placeholder:italic placeholder:text-[rgba(10,14,26,0.45)] py-1.5 disabled:opacity-50"
              />
              <button
                onClick={handleAsk}
                disabled={isAsking || question.trim().length === 0}
                className="bg-[var(--ink)] text-white border-0 px-3.5 py-2 rounded-[12px] font-bold text-[13px] cursor-pointer inline-flex gap-1.5 items-center shadow-[0_4px_12px_rgba(10,14,26,0.25)] disabled:opacity-40 hover:bg-[#1a2440] shrink-0"
                aria-label={uiLang === 'zh' ? '发送' : 'Send'}
              >
                {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}
      </div>{/* /RIGHT sidebar */}
      </div>{/* /CLASSROOM WORKSPACE grid */}

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
