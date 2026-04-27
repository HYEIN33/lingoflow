import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OnboardingChecklistProps {
  uiLang: 'en' | 'zh';
  onDismiss: () => void;
}

interface ChecklistItem {
  key: string;
  labelZh: string;
  labelEn: string;
}

// 顺序对齐 user.html 原型 checklist: search → translate → save → contribute → review
const CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: 'search_slang', labelZh: '搜索一个梗', labelEn: 'Search a slang' },
  { key: 'translate_word', labelZh: '翻译一个单词', labelEn: 'Translate a word' },
  { key: 'save_wordbook', labelZh: '保存到单词本', labelEn: 'Save to wordbook' },
  { key: 'contribute_entry', labelZh: '贡献一个词条', labelEn: 'Contribute an entry' },
  { key: 'complete_review', labelZh: '完成一次复习', labelEn: 'Complete a review' },
];

const STORAGE_KEY = 'onboarding_checklist';

function getChecklist(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveChecklist(checklist: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(checklist));
}

// Export helper so other components can mark items complete
export function markOnboardingStep(key: string) {
  const checklist = getChecklist();
  if (!checklist[key]) {
    checklist[key] = true;
    saveChecklist(checklist);
    // Dispatch a custom event so the component can react
    window.dispatchEvent(new CustomEvent('onboarding-update'));
  }
}

export function OnboardingChecklist({ uiLang, onDismiss }: OnboardingChecklistProps) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>(getChecklist());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = () => {
      setChecklist({ ...getChecklist() });
    };
    window.addEventListener('onboarding-update', handler);
    return () => window.removeEventListener('onboarding-update', handler);
  }, []);

  const completedCount = CHECKLIST_ITEMS.filter(item => checklist[item.key]).length;
  const totalCount = CHECKLIST_ITEMS.length;

  if (dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mb-4 border border-[rgba(91,127,232,0.3)] rounded-[18px] px-6 py-[22px] relative max-w-[480px] mx-auto"
        style={{
          background: 'linear-gradient(135deg, rgba(232,238,252,0.9), rgba(221,229,247,0.88))',
        }}
      >
        <button
          onClick={() => {
            setDismissed(true);
            onDismiss();
          }}
          className="absolute top-3 right-3 p-1 text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-white/60 rounded-lg transition-colors"
          aria-label={uiLang === 'zh' ? '关闭' : 'Close'}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-3">
          <h3 className="font-display font-semibold text-[var(--ink)] text-[16px] tracking-[-0.02em] mb-1">
            {uiLang === 'zh' ? '新手任务 · Getting Started' : 'Getting Started'}
          </h3>
          <span className="font-display italic text-[12px] text-[var(--blue-accent)]">
            {completedCount} / {totalCount} {uiLang === 'zh' ? '已完成' : 'completed'}
          </span>
          {/* Progress bar */}
          <div className="mt-2.5 mb-3.5 h-[6px] bg-[rgba(91,127,232,0.15)] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #5B7FE8, #0A0E1A)' }}
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / totalCount) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        <ul className="list-none p-0 m-0">
          {CHECKLIST_ITEMS.map((item) => {
            const done = !!checklist[item.key];
            return (
              <li
                key={item.key}
                className="flex items-center gap-2.5 py-[9px] font-zh-sans text-[14px] font-medium tracking-[0.01em]"
              >
                <span
                  className={`w-[18px] h-[18px] shrink-0 rounded-full inline-flex items-center justify-center ${
                    done
                      ? 'bg-[var(--blue-accent)] text-white'
                      : 'border-[1.5px] border-[rgba(91,127,232,0.35)]'
                  }`}
                >
                  {done && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className={done ? 'text-[rgba(91,127,232,0.55)] line-through' : 'text-[var(--ink)]'}>
                  {uiLang === 'zh' ? item.labelZh : item.labelEn}
                </span>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </AnimatePresence>
  );
}
