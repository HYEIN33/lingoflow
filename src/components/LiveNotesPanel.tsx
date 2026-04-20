/**
 * LiveNotesPanel — structured study notes that refresh alongside the
 * live classroom transcript. Renders a Gemini-3-Pro-generated object
 * with four sections: title, overview bullets, vocabulary table, and
 * key points.
 *
 * Shape in, shape out — no state mutation here. ClassroomTab owns the
 * refresh timer and the accumulating transcript; this component is
 * purely presentational except for the collapse toggle. That keeps the
 * refresh logic testable in isolation and the panel trivially reusable
 * (e.g. for past sessions).
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, ChevronUp, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import type { LiveNotes } from '../services/ai';

interface Props {
  notes: LiveNotes | null;
  loading: boolean;
  uiLang: 'zh' | 'en';
}

export default function LiveNotesPanel({ notes, loading, uiLang }: Props) {
  const zh = uiLang === 'zh';
  const [expanded, setExpanded] = useState(true);

  // Only render the panel once there's something to show — pre-first-
  // refresh state would be a big empty block taking up screen space.
  if (!notes && !loading) return null;

  return (
    <div className="mt-4 bg-gradient-to-br from-indigo-50/80 to-purple-50/80 backdrop-blur-sm border border-indigo-200/60 rounded-3xl shadow-sm overflow-hidden">
      {/* Header — collapsible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-600" />
          <span className="font-black text-sm text-indigo-900">
            {zh ? 'Live 学习笔记' : 'Live Notes'}
          </span>
          {loading && (
            <span className="flex items-center gap-1 text-[10px] text-indigo-500 ml-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {zh ? 'AI 整理中' : 'AI summarising'}
            </span>
          )}
          {!loading && notes && (
            <span className="flex items-center gap-1 text-[10px] text-indigo-400 ml-1">
              <Sparkles className="w-3 h-3" />
              {zh ? 'Gemini 3 Pro' : 'Gemini 3 Pro'}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-indigo-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-indigo-400" />
        )}
      </button>

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
            <div className="px-5 pb-5 space-y-4">
              {/* Title */}
              {notes.title && (
                <h3 className="font-black text-indigo-900 text-lg leading-tight">
                  {notes.title}
                </h3>
              )}

              {/* Overview */}
              {notes.overview && notes.overview.length > 0 && (
                <section>
                  <h4 className="text-[10px] font-black tracking-[0.2em] text-indigo-500 uppercase mb-2">
                    {zh ? '概述' : 'Overview'}
                  </h4>
                  <ul className="space-y-1.5">
                    {notes.overview.map((line, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-800 leading-relaxed">
                        <span className="text-indigo-400 mt-1 shrink-0">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Vocabulary table — mobile-friendly: wrap on narrow screens */}
              {notes.vocabulary && notes.vocabulary.length > 0 && (
                <section>
                  <h4 className="text-[10px] font-black tracking-[0.2em] text-indigo-500 uppercase mb-2">
                    {zh ? '词汇预习' : 'Vocabulary'}
                  </h4>
                  <div className="rounded-xl border border-indigo-200/60 overflow-hidden bg-white/50">
                    {notes.vocabulary.map((v, i) => (
                      <div
                        key={i}
                        className={
                          'flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 px-3 py-2 text-sm ' +
                          (i > 0 ? 'border-t border-indigo-100' : '')
                        }
                      >
                        <div className="sm:w-32 shrink-0 font-bold text-indigo-700 font-mono text-[13px]">
                          {v.term}
                        </div>
                        <div className="flex-1">
                          <div className="text-gray-800">{v.meaning}</div>
                          {v.note && (
                            <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                              {v.note}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Key points */}
              {notes.keyPoints && notes.keyPoints.length > 0 && (
                <section>
                  <h4 className="text-[10px] font-black tracking-[0.2em] text-indigo-500 uppercase mb-2">
                    {zh ? '重点总结' : 'Key Points'}
                  </h4>
                  <ul className="space-y-1.5">
                    {notes.keyPoints.map((line, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-800 leading-relaxed">
                        <span className="text-purple-400 mt-1 shrink-0">◆</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
