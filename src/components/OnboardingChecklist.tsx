import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingChecklistProps {
  uiLang: 'en' | 'zh';
  onDismiss: () => void;
}

interface ChecklistItem {
  key: string;
  labelZh: string;
  labelEn: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: 'search_slang', labelZh: '搜索一个梗', labelEn: 'Search a slang' },
  { key: 'translate_word', labelZh: '翻译一个单词', labelEn: 'Translate a word' },
  { key: 'contribute_entry', labelZh: '贡献一个词条', labelEn: 'Contribute an entry' },
  { key: 'save_wordbook', labelZh: '保存到单词本', labelEn: 'Save to wordbook' },
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
        className="mb-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200/60 rounded-2xl p-5 shadow-sm relative"
      >
        <button
          onClick={() => {
            setDismissed(true);
            onDismiss();
          }}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-3">
          <h3 className="font-bold text-indigo-900 text-sm">
            {uiLang === 'zh' ? '新手任务' : 'Getting Started'}
          </h3>
          <p className="text-xs text-indigo-600 mt-0.5">
            {completedCount}/{totalCount} {uiLang === 'zh' ? '已完成' : 'completed'}
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-indigo-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / totalCount) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        <ul className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => {
            const done = !!checklist[item.key];
            return (
              <li key={item.key} className="flex items-center gap-2.5">
                {done ? (
                  <CheckCircle className="w-4 h-4 text-indigo-500 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-indigo-300 shrink-0" />
                )}
                <span className={`text-sm ${done ? 'text-indigo-400 line-through' : 'text-indigo-800'}`}>
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
