import React, { useEffect, useRef } from 'react';
import { Loader2, ChevronRight, CheckCircle, AlertCircle, Mic, MicOff } from 'lucide-react';
import { motion } from 'motion/react';
import { GrammarCheckResult } from '../services/ai';
import { cn } from '../lib/utils';
import { Language, translations } from '../i18n';
import { UserProfile } from '../App';
import { UsageBadge } from '../components/UsageBadge';

interface GrammarPageProps {
  grammarInput: string;
  setGrammarInput: (v: string) => void;
  isCheckingGrammar: boolean;
  grammarResult: GrammarCheckResult | null;
  isListening: boolean;
  uiLang: Language;
  onCheckGrammar: (e?: React.FormEvent) => void;
  onToggleListening: () => void;
  userProfile?: UserProfile | null;
  onOpenPaywall?: (trigger: string) => void;
}

export default function GrammarPage(props: GrammarPageProps) {
  const {
    grammarInput, setGrammarInput, isCheckingGrammar, grammarResult,
    isListening, uiLang, onCheckGrammar, onToggleListening,
    userProfile, onOpenPaywall
  } = props;

  const t = translations[uiLang];

  // Verdict card ref — scroll the result card into view the moment a check
  // lands (and the moment the loader appears). On phones the verdict sat
  // well below the textarea and users didn't realize it had rendered.
  const verdictRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isCheckingGrammar || grammarResult) {
      requestAnimationFrame(() => {
        verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [isCheckingGrammar, grammarResult]);

  // Corrected 文本里把 edits.correctedText 蓝色高亮。
  // 字段缺失或无匹配就退化为纯文本。
  const highlightCorrected = (text: string, edits?: { correctedText: string }[]) => {
    if (!text) return <>{text}</>;
    const tos = (edits || []).map(e => e.correctedText).filter(Boolean);
    if (!tos.length) return <>{text}</>;
    const escaped = tos.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')})`, 'g');
    const parts = text.split(regex);
    return (
      <>
        {parts.map((p, i) =>
          tos.includes(p)
            ? <strong key={i} className="text-[var(--blue-accent)] font-semibold">{p}</strong>
            : <React.Fragment key={i}>{p}</React.Fragment>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {/* Eyebrow */}
      <div className="flex items-baseline gap-[10px] mb-[14px] pl-[6px]">
        <span className="inline-block w-4 h-px bg-[var(--ink-rule)] translate-y-[-4px]" />
        <span className="font-display italic text-[13px] text-[var(--ink-muted)]">grammar</span>
        {uiLang === 'zh' && (
          <span className="font-zh-sans text-[11.5px] tracking-[0.12em] text-[var(--ink-subtle)]">语法检查</span>
        )}
        <UsageBadge bucket="grammar" isPro={!!userProfile?.isPro} uiLang={uiLang} onUpgrade={() => onOpenPaywall?.('usage_badge')} className="ml-auto" />
      </div>

      {/* Grammar Input — glass-thick card */}
      <form onSubmit={onCheckGrammar} className="glass-thick rounded-[28px] p-[20px_22px_22px] relative group">
        <textarea
          value={grammarInput}
          onChange={(e) => setGrammarInput(e.target.value)}
          placeholder={t.grammarPlaceholder}
          rows={4}
          className="w-full bg-transparent border-0 outline-none resize-none font-zh-serif text-[16px] leading-[1.7] text-[var(--ink)] placeholder:font-display placeholder:italic placeholder:text-[var(--ink-subtle)] placeholder:font-normal min-h-[140px]"
        />
        <div className="mt-3 pt-[14px] border-t border-[var(--ink-hairline)] flex items-center justify-between">
          <div className="font-mono-meta text-[11px] text-[var(--ink-subtle)]">
            {grammarInput.length} / 2000
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleListening}
              className={cn(
                "inline-flex items-center gap-[6px] px-[16px] py-[10px] rounded-[16px] transition-all cursor-pointer font-zh-sans font-semibold text-[13px]",
                isListening
                  ? "bg-[var(--red-warn)] text-white shadow-[0_4px_12px_rgba(229,56,43,0.3)]"
                  : "bg-white border border-[var(--border-solid)] text-[var(--ink-body)] hover:text-[var(--ink)]"
              )}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              mic
            </button>
            <button
              type="submit"
              disabled={isCheckingGrammar || !grammarInput.trim()}
              className="inline-flex items-center gap-[8px] bg-[var(--ink)] text-white px-[18px] py-[12px] rounded-[16px] disabled:opacity-40 transition-all hover:bg-[#1a2440] shadow-[0_4px_12px_rgba(10,14,26,0.25)] font-bold text-[14px]"
            >
              {isCheckingGrammar ? (
                <Loader2 className="w-[14px] h-[14px] animate-spin" />
              ) : (
                <>
                  check
                  <ChevronRight className="w-[14px] h-[14px]" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Verdict surface — anchors scrollIntoView for both the loading
          skeleton and the rendered result. scroll-mt-24 keeps the sticky
          header from overlapping the top of the card. */}
      <div ref={verdictRef} className="scroll-mt-24">

      {/* Inline loading state — without this the submit button's tiny
          spinner was the only feedback that anything was happening. */}
      {isCheckingGrammar && !grammarResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface !rounded-[18px] p-6 md:p-8 mt-4"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--blue-accent)]" />
            <span className="font-display italic text-[14px] text-[var(--ink-body)]">
              {uiLang === 'zh' ? '检查中…' : 'checking…'}
            </span>
          </div>
          <div className="space-y-2">
            <div className="h-3 rounded-[6px] bg-[rgba(10,14,26,0.06)] animate-pulse w-[76%]" />
            <div className="h-3 rounded-[6px] bg-[rgba(10,14,26,0.06)] animate-pulse w-[60%]" />
          </div>
        </motion.div>
      )}

      {/* Grammar Result — no errors 分支完整重做 */}
      {grammarResult && !grammarResult.hasErrors && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface !rounded-[18px] p-6 md:p-8 mt-4"
        >
          <div className="flex items-start gap-3 mb-4">
            <span className="w-10 h-10 rounded-[12px] bg-[rgba(47,99,23,0.12)] text-[var(--green-ok)] inline-flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <div>
              <h3 className="m-0 font-display font-semibold text-[22px] tracking-[-0.02em] text-[var(--ink)] leading-tight">
                {uiLang === 'zh' ? '这句没毛病' : 'All good'}
              </h3>
              <p className="m-0 mt-1 font-zh-serif text-[13px] text-[var(--ink-muted)]">
                {uiLang === 'zh' ? '语法、搭配、语气都顺' : 'Grammar, collocation, tone all check out'}
              </p>
            </div>
          </div>

          <blockquote className="m-0 px-5 py-4 rounded-[12px] border border-[rgba(76,143,59,0.25)] bg-[rgba(47,99,23,0.06)] font-display italic text-[16px] leading-[1.7] text-[var(--ink-body)]">
            "{grammarInput || grammarResult.original || ''}"
          </blockquote>

          {grammarResult.explanation ? (
            <div className="mt-5">
              <h4 className="font-mono-meta text-[10px] tracking-[0.2em] uppercase font-bold text-[var(--ink-soft)] mb-2">
                {uiLang === 'zh' ? 'why it works · 为什么写得好' : 'why it works'}
              </h4>
              <p className="m-0 font-zh-serif text-[14px] leading-[1.85] text-[var(--ink-body)]">
                {grammarResult.explanation}
              </p>
              {grammarResult.explanationZh && uiLang === 'en' && (
                <p className="m-0 mt-2 font-zh-serif italic text-[13px] leading-[1.85] text-[var(--ink-muted)]">
                  {grammarResult.explanationZh}
                </p>
              )}
            </div>
          ) : (
            // 兜底文案 —— AI 没回 explanation 时
            <div className="mt-5">
              <p className="m-0 font-zh-serif text-[14px] leading-[1.85] text-[var(--ink-body)]">
                {uiLang === 'zh' ? '你写得很地道，没有语法问题。' : 'Your writing is natural and grammatically clean.'}
              </p>
            </div>
          )}

          {/* upgrade · 想更地道 — 用 academicSuggestion 代替任务里说的 styleSuggestion 字段 */}
          {(grammarResult.academicSuggestion || grammarResult.styleFeedback) && (
            <div className="mt-5 p-4 rounded-[12px] bg-[rgba(91,127,232,0.06)] border border-[rgba(91,127,232,0.18)]">
              <div className="font-mono-meta text-[10px] tracking-[0.2em] uppercase font-bold text-[var(--blue-accent)] mb-1">
                {uiLang === 'zh' ? 'upgrade · 想更地道' : 'upgrade'}
              </div>
              <p className="m-0 font-zh-serif text-[13.5px] leading-[1.85] text-[var(--ink-body)]">
                {grammarResult.academicSuggestion || grammarResult.styleFeedback}
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Grammar Result — has errors 分支保持原结构 */}
      {grammarResult && grammarResult.hasErrors && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface p-[28px_32px] !rounded-[18px]"
        >
          <div className="flex items-start gap-3 sm:gap-4 pb-[20px] border-b border-[var(--ink-hairline)]">
            <div className="w-10 h-10 rounded-[12px] inline-flex items-center justify-center shrink-0 bg-[rgba(232,180,60,0.18)] text-[#8A5D0E]">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-[22px] tracking-[-0.02em] text-[var(--ink)] mb-[2px]">
                <em className="italic">
                  {uiLang === 'zh'
                    ? `发现 ${grammarResult.edits?.length || 0} 处问题`
                    : `Found ${grammarResult.edits?.length || 0} ${grammarResult.edits?.length === 1 ? 'issue' : 'issues'}`}
                </em>
              </h3>
              <p className="font-zh-serif text-[13px] text-[var(--ink-body)] line-clamp-1">{grammarResult.original}</p>
            </div>
          </div>

          {grammarResult.hasErrors && (
            <div className="pt-[22px] space-y-[22px]">
              <div>
                <h4 className="font-mono-meta text-[11px] font-extrabold tracking-[0.22em] uppercase text-[var(--ink-soft)] mb-[12px]">
                  {t.correctedVersion}
                </h4>
                <div
                  className="p-[18px_22px] rounded-[18px] border border-[rgba(91,127,232,0.18)]"
                  style={{ background: 'linear-gradient(135deg, rgba(91,127,232,0.08), rgba(137,163,240,0.12))' }}
                >
                  <p className="font-zh-serif text-[17px] font-bold leading-[1.75] text-[var(--ink)]">
                    {highlightCorrected(grammarResult.corrected, grammarResult.edits)}
                  </p>
                </div>
              </div>

              {grammarResult.edits && grammarResult.edits.length > 0 && (
                <div className="pt-[22px] border-t border-[var(--ink-hairline)]">
                  <h4 className="font-mono-meta text-[11px] font-extrabold tracking-[0.22em] uppercase text-[var(--ink-soft)] mb-[12px]">
                    {uiLang === 'zh' ? '具体修改 · specific edits' : 'Specific Edits'}
                  </h4>
                  <div className="flex flex-col gap-[10px]">
                    {grammarResult.edits.map((edit, idx) => (
                      <div key={idx} className="p-[14px_18px] rounded-[14px] border border-[var(--ink-hairline)] bg-white/55">
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-[14px] items-center">
                          <span className="font-display italic text-[var(--red-warn)] line-through decoration-[rgba(229,56,43,0.6)]">
                            {edit.originalText}
                          </span>
                          <ChevronRight className="w-4 h-4 text-[var(--ink-subtle)]" />
                          <span className="font-display font-semibold tracking-[-0.01em] text-[var(--blue-accent)]">
                            {edit.correctedText}
                          </span>
                        </div>
                        <p className="mt-[8px] pt-[8px] border-t border-dashed border-[rgba(10,14,26,0.08)] font-zh-serif text-[13px] leading-[1.75] text-[var(--ink-body)]">
                          {edit.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-[22px] border-t border-[var(--ink-hairline)]">
                <h4 className="font-mono-meta text-[11px] font-extrabold tracking-[0.22em] uppercase text-[var(--ink-soft)] mb-[12px]">
                  {t.explanation}
                </h4>
                <p className="font-zh-sans font-medium text-[14px] leading-[1.9] text-[var(--ink-body)] pl-[14px] border-l-2 border-[rgba(91,127,232,0.3)]">
                  {grammarResult.explanation}
                </p>
                {grammarResult.explanationZh && uiLang === 'en' && (
                  <p className="font-zh-serif italic text-[14px] leading-[1.9] text-[var(--ink-muted)] mt-[10px] pl-[14px] border-l-2 border-[rgba(91,127,232,0.15)]">
                    {grammarResult.explanationZh}
                  </p>
                )}
              </div>
            </div>
          )}

          {grammarResult.styleFeedback && (
            <div className="pt-[22px] mt-[22px] border-t border-[var(--ink-hairline)]">
              <h4 className="font-mono-meta text-[11px] font-extrabold tracking-[0.22em] uppercase text-[var(--ink-soft)] mb-[12px]">
                {uiLang === 'zh' ? 'style feedback · 风格检测' : 'Style Feedback'}
              </h4>
              <div className="bg-[rgba(168,168,217,0.12)] border border-[rgba(168,168,217,0.25)] rounded-[18px] p-[18px_22px]">
                <p className="font-zh-serif text-[14px] leading-[1.85] text-[var(--ink)] m-0 mb-[14px]">
                  {grammarResult.styleFeedback}
                </p>
                {grammarResult.academicSuggestion && (
                  <div className="pt-[14px] border-t border-dashed border-[rgba(125,110,163,0.25)]">
                    <span className="block font-mono-meta text-[10px] font-extrabold tracking-[0.2em] uppercase text-[#7D6EA3] mb-[6px]">
                      {uiLang === 'zh' ? 'Academic / Formal 建议' : 'Academic / Formal suggestion'}
                    </span>
                    <p className="font-display italic text-[17px] leading-[1.6] text-[var(--ink)] m-0">
                      {grammarResult.academicSuggestion}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}

      </div>
      {/* /verdictRef anchor */}
    </div>
  );
}
