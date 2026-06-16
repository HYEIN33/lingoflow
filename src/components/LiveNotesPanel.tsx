/**
 * LiveNotesPanel — structured study notes that refresh alongside the
 * live classroom transcript. Renders a Gemini-3-Pro-generated object
 * with three sections: title, overview bullets, and key points.
 *
 * ClassroomTab owns the refresh timer and the accumulating transcript;
 * this component renders the result and owns three pieces of UI state:
 * the collapse toggle, a 1s `now` tick for the "updated Xs ago"
 * counter, and (2026-06-16) an inline-edit layer so learners can fix
 * up the AI's overview/keyPoints before saving.
 *
 * Edit-vs-AI-refresh conflict (the load-bearing UX detail):
 *   - The panel gets a fresh `notes` prop every ~25s. We keep a local
 *     editable working copy in `draft`.
 *   - While `editing` is true we FREEZE incoming `notes` — keystrokes
 *     can never be clobbered by a mid-edit AI refresh.
 *   - Once the user has touched anything (`dirty`), their version is
 *     authoritative even after they leave edit mode: a newer AI summary
 *     does NOT silently overwrite it. Instead a "AI 有更新 · 采用" chip
 *     appears so fresh AI content stays one click away without destroying
 *     manual edits.
 *   - When `dirty` is false the draft transparently follows the AI prop
 *     (the original always-fresh behaviour).
 * `onSaveToNotes(notes)` receives the edited draft so the saved/exported
 * object is whatever the user actually sees.
 *
 * Visual note (2026-04-22): switched from the old blue-glass card to
 * the prototype's plain white surface (`surface` token) so this panel
 * blends with the rest of the redesigned classroom. The AUTO pill and
 * "updated Xs ago" timestamp give learners a confidence signal that
 * the notes are current without needing to poke at it.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronUp, ChevronDown, Loader2, Save, Download, Pencil, Check, RefreshCw, Plus, X } from 'lucide-react';
import type { LiveNotes } from '../services/ai';

interface Props {
  notes: LiveNotes | null;
  loading: boolean;
  uiLang: 'zh' | 'en';
  lastUpdatedAt?: number;
  // Save / export receive the *effective* notes — the user's edited
  // draft when they've changed anything, else the AI version. Parent
  // can ignore the arg and fall back to its own `liveNotes` state.
  onSaveToNotes?: (notes?: LiveNotes) => void;
  onExportPdf?: (notes?: LiveNotes) => void;
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

  // ---- Inline edit layer -------------------------------------------------
  // `draft` is the local editable copy. `editing` freezes AI refreshes.
  // `dirty` means the user has changed something and their version wins.
  // `pendingAi` holds an AI summary that arrived while the draft was dirty
  // (or being edited) so we can offer "采用最新" without clobbering edits.
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<LiveNotes | null>(notes);
  const [pendingAi, setPendingAi] = useState<LiveNotes | null>(null);
  // Track the latest AI prop by identity so the sync effect only fires on
  // a genuinely new summary, not on every parent re-render.
  const lastNotesRef = useRef<LiveNotes | null>(notes);

  useEffect(() => {
    if (notes === lastNotesRef.current) return; // same object — nothing new
    lastNotesRef.current = notes;
    if (!notes) {
      // Session reset — drop everything back to the clean AI-followed state.
      setDraft(null);
      setDirty(false);
      setPendingAi(null);
      return;
    }
    if (editing || dirty) {
      // User is mid-edit or has manual edits — never overwrite. Stash the
      // fresh AI summary so they can opt into it via the "采用最新" chip.
      setPendingAi(notes);
    } else {
      // Clean state — follow AI transparently (original behaviour).
      setDraft(notes);
    }
  }, [notes, editing, dirty]);

  // Effective notes shown + saved/exported: edited draft when the user has
  // a working copy, else the raw AI prop.
  const effective: LiveNotes | null = draft ?? notes;

  const enterEdit = () => {
    // Snapshot whatever is currently effective into the draft so edits
    // start from what the user sees, then freeze AI refreshes.
    setDraft(effective ? { ...effective, overview: [...(effective.overview ?? [])], keyPoints: [...(effective.keyPoints ?? [])] } : null);
    setEditing(true);
  };
  const finishEdit = () => setEditing(false);

  const adoptLatestAi = () => {
    if (!pendingAi) return;
    setDraft(pendingAi);
    setPendingAi(null);
    setDirty(false);
    setEditing(false);
  };

  const updateList = (field: 'overview' | 'keyPoints', i: number, value: string) => {
    setDraft((d) => {
      const base = d ?? effective;
      if (!base) return d;
      const list = [...(base[field] ?? [])];
      list[i] = value;
      return { ...base, overview: [...(base.overview ?? [])], keyPoints: [...(base.keyPoints ?? [])], [field]: list };
    });
    setDirty(true);
  };
  const removeItem = (field: 'overview' | 'keyPoints', i: number) => {
    setDraft((d) => {
      const base = d ?? effective;
      if (!base) return d;
      const list = (base[field] ?? []).filter((_, idx) => idx !== i);
      return { ...base, overview: [...(base.overview ?? [])], keyPoints: [...(base.keyPoints ?? [])], [field]: list };
    });
    setDirty(true);
  };
  const addItem = (field: 'overview' | 'keyPoints') => {
    setDraft((d) => {
      const base = d ?? effective;
      if (!base) return d;
      return { ...base, overview: [...(base.overview ?? [])], keyPoints: [...(base.keyPoints ?? [])], [field]: [...(base[field] ?? []), ''] };
    });
    setDirty(true);
  };
  const updateTitle = (value: string) => {
    setDraft((d) => {
      const base = d ?? effective;
      if (!base) return d;
      return { ...base, overview: [...(base.overview ?? [])], keyPoints: [...(base.keyPoints ?? [])], title: value };
    });
    setDirty(true);
  };

  // When there's nothing to show AND we're not live, hide the panel
  // (idle home screen). During a live session we render an empty-state
  // card instead of hiding — keeps the feature discoverable and tells
  // the user notes will appear soon.
  if (!effective && !loading && !isLive) return null;

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
            <>AUTO · {zh ? '每 25 秒刷新' : 'refresh 25s'}</>
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

        {/* Adopt-latest-AI chip — only shown when a newer AI summary is
            waiting because the user has manual edits we refuse to clobber.
            One click swaps in the fresh AI version (discards manual edits). */}
        {pendingAi && expanded && (
          <button
            type="button"
            onClick={adoptLatestAi}
            className="font-mono-meta text-[10px] text-[var(--blue-accent-text)] bg-[rgba(91,127,232,0.1)] hover:bg-[rgba(91,127,232,0.18)] py-[3px] px-[8px] rounded-[6px] inline-flex items-center gap-1 transition-colors cursor-pointer border-0"
            title={zh ? '用最新的 AI 笔记替换当前编辑' : 'Replace with the latest AI notes'}
          >
            <RefreshCw className="w-[10px] h-[10px]" />
            {zh ? 'AI 有更新 · 采用' : 'New · adopt'}
          </button>
        )}

        {/* Edit / done toggle — only when we have something to edit. While
            editing, incoming AI refreshes are frozen (see top-of-file note). */}
        {effective && expanded && (
          <button
            type="button"
            onClick={editing ? finishEdit : enterEdit}
            className="font-zh-sans font-semibold text-[11.5px] text-[var(--blue-accent-text)] bg-transparent border-0 p-0 cursor-pointer inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
            aria-label={editing ? (zh ? '完成编辑' : 'Done editing') : (zh ? '编辑笔记' : 'Edit notes')}
          >
            {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {editing ? (zh ? '完成' : 'Done') : (zh ? '编辑' : 'Edit')}
          </button>
        )}

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
          ? 'AI 笔记功能完善中 · 字幕实时，笔记每 25 秒刷新一次概要'
          : 'Live Notes is still catching up · subtitles stream in real-time, notes refresh a summary every 25s'}
      </p>

      {/* Empty-state card — shown during live sessions when we don't
          have notes yet. Without this the whole panel vanishes and users
          think the feature is broken. */}
      {expanded && !effective && isLive && (
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
        {expanded && effective && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Editing banner — confirms AI refresh is paused so the user
                knows their typing is safe from the 25s overwrite. */}
            {editing && (
              <div
                className="mb-3 font-mono-meta text-[10.5px] text-[var(--blue-accent-text)] bg-[rgba(91,127,232,0.08)] rounded-[8px] py-[6px] px-[10px] inline-flex items-center gap-1.5"
                style={{ letterSpacing: '0.04em' }}
              >
                <Pencil className="w-3 h-3" />
                {zh ? '编辑中 · 已暂停 AI 自动刷新' : 'Editing · AI auto-refresh paused'}
              </div>
            )}

            <div className="space-y-3">
              {/* Title */}
              {editing ? (
                <input
                  type="text"
                  value={effective.title ?? ''}
                  onChange={(e) => updateTitle(e.target.value)}
                  placeholder={zh ? '笔记标题' : 'Notes title'}
                  className="w-full font-zh-serif font-semibold text-[var(--ink-body)] text-[16px] leading-tight bg-[var(--surface-solid)] border border-[var(--ink-hairline)] rounded-[8px] px-[10px] py-[6px] focus:outline-none focus:border-[var(--blue-accent-text)]"
                />
              ) : (
                effective.title && (
                  <h3 className="font-zh-serif font-semibold text-[var(--ink-body)] text-[16px] leading-tight m-0">
                    {effective.title}
                  </h3>
                )
              )}

              {/* Overview */}
              {(editing || (effective.overview && effective.overview.length > 0)) && (
                <section>
                  {editing && (
                    <h4 className="text-[10px] font-mono-meta tracking-[0.2em] text-[var(--ink-soft)] uppercase mb-2">
                      {zh ? '概述 · OVERVIEW' : 'OVERVIEW'}
                    </h4>
                  )}
                  {editing ? (
                    <EditableList
                      items={effective.overview ?? []}
                      onChange={(i, v) => updateList('overview', i, v)}
                      onRemove={(i) => removeItem('overview', i)}
                      onAdd={() => addItem('overview')}
                      addLabel={zh ? '添加一条概述' : 'Add overview item'}
                      zh={zh}
                    />
                  ) : (
                    <ul
                      className="m-0 pl-[18px] font-zh-serif text-[14px] text-[rgba(10,14,26,0.78)]"
                      style={{ lineHeight: 1.95 }}
                    >
                      {effective.overview!.map((line, i) => (
                        <li key={`ov-${i}`}>
                          <StrongAwareText text={line} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {/* Key points */}
              {(editing || (effective.keyPoints && effective.keyPoints.length > 0)) && (
                <section>
                  <h4 className="text-[10px] font-mono-meta tracking-[0.2em] text-[var(--blue-accent)] uppercase mb-2 mt-3">
                    {zh ? '重点 · KEY POINTS' : 'KEY POINTS'}
                  </h4>
                  {editing ? (
                    <EditableList
                      items={effective.keyPoints ?? []}
                      onChange={(i, v) => updateList('keyPoints', i, v)}
                      onRemove={(i) => removeItem('keyPoints', i)}
                      onAdd={() => addItem('keyPoints')}
                      addLabel={zh ? '添加一条重点' : 'Add key point'}
                      zh={zh}
                    />
                  ) : (
                    <ul
                      className="m-0 pl-[18px] font-zh-serif text-[14px] text-[rgba(10,14,26,0.78)]"
                      style={{ lineHeight: 1.95 }}
                    >
                      {effective.keyPoints!.map((line, i) => (
                        <li key={`kp-${i}`}>
                          <StrongAwareText text={line} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {/* Save row — only when we have notes to save */}
              <div className="mt-[14px] pt-[14px] border-t border-[var(--ink-hairline)] flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onSaveToNotes?.(effective ?? undefined)}
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
                  onClick={() => onExportPdf?.(effective ?? undefined)}
                  disabled={!onExportPdf}
                  className="px-3.5 py-2 rounded-[10px] bg-transparent border border-[var(--ink-hairline)] text-[var(--ink-body)] font-zh-sans font-semibold text-[12.5px] hover:bg-[rgba(10,14,26,0.04)] inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {zh ? '导出 PDF' : 'Export PDF'}
                </button>
                <span className="ml-auto font-zh-serif text-[11px] text-[var(--ink-muted)]">
                  {dirty
                    ? (zh ? '已含你的手动编辑' : 'Includes your manual edits')
                    : (zh ? '停止录音后会自动保存完整笔记' : 'Full notes auto-save when you stop recording')}
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
 * EditableList — the inline-edit view of an overview / keyPoints array.
 * Each item is an auto-growing textarea so multi-line edits don't clip,
 * with a remove button per row and an "add item" affordance. Pure
 * controlled component: all mutations bubble up via callbacks so the
 * parent's `draft` state stays the single source of truth.
 */
function EditableList({
  items,
  onChange,
  onRemove,
  onAdd,
  addLabel,
  zh,
}: {
  items: string[];
  onChange: (i: number, value: string) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
  addLabel: string;
  zh: boolean;
}) {
  return (
    <div className="space-y-2">
      {items.map((line, i) => (
        <div key={`edit-${i}`} className="flex items-start gap-2">
          <textarea
            value={line}
            onChange={(e) => onChange(i, e.target.value)}
            rows={1}
            ref={(el) => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            className="flex-1 resize-none font-zh-serif text-[14px] text-[var(--ink-body)] bg-[var(--surface-solid)] border border-[var(--ink-hairline)] rounded-[8px] px-[10px] py-[6px] leading-[1.7] focus:outline-none focus:border-[var(--blue-accent-text)]"
          />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="mt-[6px] text-[var(--ink-muted)] hover:text-[#C0392B] transition-colors bg-transparent border-0 p-1 cursor-pointer shrink-0"
            aria-label={zh ? '删除这条' : 'Remove item'}
            title={zh ? '删除这条' : 'Remove item'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="font-zh-sans font-semibold text-[12px] text-[var(--blue-accent-text)] bg-transparent border-0 p-0 cursor-pointer inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
      >
        <Plus className="w-3.5 h-3.5" />
        {addLabel}
      </button>
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
