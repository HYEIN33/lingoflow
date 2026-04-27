/**
 * LiveNotesPanel — structured study notes that refresh alongside the
 * live classroom transcript. Renders a Gemini-3-Pro-generated object
 * with three sections: title, overview bullets, and key points.
 *
 * Shape in, shape out — no state mutation here. ClassroomTab owns the
 * refresh timer and the accumulating transcript; this component is
 * purely presentational except for the collapse toggle and a local
 * `now` tick that powers the "updated Xs ago" counter. That keeps the
 * refresh logic testable in isolation and the panel trivially reusable
 * (e.g. for past sessions).
 *
 * Visual note (2026-04-22): switched from the old blue-glass card to
 * the prototype's plain white surface (`surface` token) so this panel
 * blends with the rest of the redesigned classroom. The AUTO pill and
 * "updated Xs ago" timestamp give learners a confidence signal that
 * the notes are current without needing to poke at it.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronUp, ChevronDown, Loader2, Save, Download } from 'lucide-react';
import type { LiveNotes } from '../services/ai';

interface Props {
  notes: LiveNotes | null;
  loading: boolean;
  uiLang: 'zh' | 'en';
  lastUpdatedAt?: number;
  onSaveToNotes?: () => void;
  onExportPdf?: () => void;
  isSaving?: boolean;
  // Is the parent classroom session currently live? When true we show
  // an empty-state card ("开始录音几分钟后…") instead of hiding the panel
  // so users understand the feature exists and is warming up.
  isLive?: boolean;
}

export default function LiveNotesPanel({
  notes,
  loading,
  uiLang,
  lastUpdatedAt,
  onSaveToNotes,
  onExportPdf,
  isSaving,
  isLive,
}: Props) {
  const zh = uiLang === 'zh';
  const [expanded, setExpanded] = useState(true);

  // Tick once a second so "updated Xs ago" stays live. We don't need
  // sub-second precision — 1s is cheap and matches the prototype copy.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // When there's nothing to show AND we're not live, hide the panel
  // (idle home screen). During a live session we render an empty-state
  // card instead of hiding — keeps the feature discoverable and tells
  // the user notes will appear soon.
  if (!notes && !loading && !isLive) return null;

  const secsAgo = lastUpdatedAt ? Math.max(0, Math.floor((now - lastUpdatedAt) / 1000)) : 0;
  const agoText = !lastUpdatedAt
    ? zh ? 'updated just now' : 'updated just now'
    : secsAgo < 60
      ? `updated ${secsAgo}s ago`
      : `updated ${Math.floor(secsAgo / 60)}m ago`;

  return (
    <div
      id="classroom-live-notes-panel"
      className="surface !rounded-[14px] mt-5 p-[20px_24px]"
    >
      {/* Head — Clash italic title + AUTO pill + updated Xs ago */}
      <div className="flex items-center gap-[10px] mb-[14px]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-[10px] bg-transparent border-0 p-0 cursor-pointer"
          aria-label={zh ? '折叠/展开实时笔记' : 'Toggle live notes'}
        >
          <h4
            className="font-display italic font-medium text-[15px] text-[var(--ink-soft)] m-0"
            style={{ fontStyle: 'italic' }}
          >
            — live notes · {zh ? '实时笔记' : 'live notes'}
          </h4>
        </button>

        <span
          className="font-mono-meta text-[10px] text-[var(--blue-accent)] bg-[rgba(91,127,232,0.1)] py-[3px] px-[8px] rounded-[6px] uppercase"
          style={{ letterSpacing: '0.15em' }}
        >
          {loading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-[10px] h-[10px] animate-spin" />
              {zh ? 'AI 整理中' : 'SUMMARISING'}
            </span>
          ) : (
            <>AUTO · {zh ? '每 45 秒刷新' : 'refresh 45s'}</>
          )}
        </span>

        {/* BETA pill — Live Notes isn't yet "true" real-time (Gemini
            streaming + per-word updates). Setting expectations up front
            so users don't compare us unfavourably with EasyNoteAI-tier
            streaming note apps. */}
        <span
          className="font-mono-meta text-[9.5px] font-black tracking-[0.18em] uppercase bg-[rgba(232,180,60,0.22)] text-[#8A5D0E] py-[2px] px-[7px] rounded-[5px]"
          title={zh ? 'AI 笔记功能完善中' : 'Live Notes is still in beta'}
        >
          BETA
        </span>

        <span className="ml-auto font-mono-meta text-[11px] text-[var(--ink-muted)]">
          {agoText}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="bg-transparent border-0 p-0 cursor-pointer text-[var(--ink-muted)] hover:text-[var(--ink-body)] transition-colors"
          aria-label={expanded ? (zh ? '折叠' : 'Collapse') : (zh ? '展开' : 'Expand')}
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Beta-aware framing line — replaces the old mysterious AUTO chip
          behaviour with a single honest sentence so users know what to
          expect from Live Notes while the feature is still catching up. */}
      <p className="font-zh-serif text-[12px] text-[var(--ink-muted)] m-0 mb-[10px] leading-relaxed">
        {zh
          ? 'AI 笔记功能完善中 · 字幕实时，笔记每 45 秒刷新一次概要'
          : 'Live Notes is still catching up · subtitles stream in real-time, notes refresh a summary every 45s'}
      </p>

      {/* Empty-state card — shown during live sessions when we don't
          have notes yet. Without this the whole panel vanishes and users
          think the feature is broken. */}
      {expanded && !notes && isLive && (
        <div className="rounded-[12px] border border-dashed border-[var(--ink-hairline)] p-[18px_20px] bg-[rgba(10,14,26,0.02)]">
          <div className="font-mono-meta text-[10px] tracking-[0.18em] uppercase text-[var(--ink-soft)] mb-2 inline-flex items-center gap-1.5">
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                {zh ? 'AI 整理中…' : 'summarising…'}
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#E8C375] animate-pulse" />
                {zh ? '等待内容' : 'waiting for content'}
              </>
            )}
          </div>
          <p className="font-zh-serif text-[13.5px] text-[var(--ink-body)] m-0 leading-[1.75]">
            {zh
              ? '开始录音几分钟后 AI 会在这里生成笔记概要。字幕会立刻出现；笔记需要攒够一段讲课内容才会刷新。'
              : 'Once a few minutes of class have passed, AI will generate a summary here. Subtitles appear instantly; notes need enough transcript to refresh.'}
          </p>
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && notes && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3">
              {/* Title */}
              {notes.title && (
                <h3 className="font-zh-serif font-semibold text-[var(--ink-body)] text-[16px] leading-tight m-0">
                  {notes.title}
                </h3>
              )}

              {/* Overview */}
              {notes.overview && notes.overview.length > 0 && (
                <section>
                  <ul
                    className="m-0 pl-[18px] font-zh-serif text-[14px] text-[rgba(10,14,26,0.78)]"
                    style={{ lineHeight: 1.95 }}
                  >
                    {notes.overview.map((line, i) => (
                      <li key={`ov-${i}`}>
                        <StrongAwareText text={line} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Key points */}
              {notes.keyPoints && notes.keyPoints.length > 0 && (
                <section>
                  <h4 className="text-[10px] font-mono-meta tracking-[0.2em] text-[var(--blue-accent)] uppercase mb-2 mt-3">
                    {zh ? '重点 · KEY POINTS' : 'KEY POINTS'}
                  </h4>
                  <ul
                    className="m-0 pl-[18px] font-zh-serif text-[14px] text-[rgba(10,14,26,0.78)]"
                    style={{ lineHeight: 1.95 }}
                  >
                    {notes.keyPoints.map((line, i) => (
                      <li key={`kp-${i}`}>
                        <StrongAwareText text={line} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Save row — only when we have notes to save */}
              <div className="mt-[14px] pt-[14px] border-t border-[var(--ink-hairline)] flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onSaveToNotes}
                  disabled={isSaving || !onSaveToNotes}
                  className="px-3.5 py-2 rounded-[10px] bg-transparent border border-[var(--ink-hairline)] text-[var(--ink-body)] font-zh-sans font-semibold text-[12.5px] hover:bg-[rgba(10,14,26,0.04)] inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {zh ? '保存到笔记' : 'Save to notes'}
                </button>
                <button
                  type="button"
                  onClick={onExportPdf}
                  disabled={!onExportPdf}
                  className="px-3.5 py-2 rounded-[10px] bg-transparent border border-[var(--ink-hairline)] text-[var(--ink-body)] font-zh-sans font-semibold text-[12.5px] hover:bg-[rgba(10,14,26,0.04)] inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {zh ? '导出 PDF' : 'Export PDF'}
                </button>
                <span className="ml-auto font-zh-serif text-[11px] text-[var(--ink-muted)]">
                  {zh ? '停止录音后会自动保存完整笔记' : 'Full notes auto-save when you stop recording'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Render plain text, but if Gemini returns bold markers like **term**,
 * highlight the bolded fragment in blue semibold to match the prototype.
 * Falls back gracefully to plain text when no markers are present.
 */
function StrongAwareText({ text }: { text: string }) {
  if (!text.includes('**')) return <>{text}</>;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong
              key={i}
              className="text-[var(--blue-accent)] font-semibold"
            >
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
