import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChecklistItem {
  key: string;
  label: string;
  labelEn: string;
  done: boolean;
}

interface OnboardingChecklistModalProps {
  open: boolean;
  onClose: () => void;
  uiLang: 'en' | 'zh';
  items: ChecklistItem[];
}

/**
 * 新手任务 Modal —— 1:1 对齐 design-prototypes/user.html `.onboard` section
 *
 * 现状：点击 UserProfile 里的「新手任务」卡会打开这个 modal。之前打开的是
 *      SlangOnboarding（贡献词条 6 步 wizard），那个是另一个场景，不是新手任务。
 * 修后：modal 显示 5 项 checklist（搜索/翻译/保存/贡献/复习），点外部 / × 关闭。
 * 不修后果：用户点「新手任务」进入的是贡献词条向导，跟卡片文案「5 步了解全部功能」
 *         不符，信息混乱。
 */
export default function OnboardingChecklistModal({
  open,
  onClose,
  uiLang,
  items,
}: OnboardingChecklistModalProps) {
  // Esc 关闭 + body scroll lock（modal 打开时禁止底层滚动）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[480px] rounded-[22px] border border-[rgba(91,127,232,0.3)]"
            style={{
              padding: '22px 24px',
              background:
                'linear-gradient(135deg, rgba(232,238,252,0.95), rgba(221,229,247,0.92))',
            }}
          >
            <button
              onClick={onClose}
              aria-label={uiLang === 'zh' ? '关闭' : 'Close'}
              className="absolute top-3 right-3 p-1 rounded-lg text-[rgba(10,14,26,0.35)] hover:text-[var(--ink)] hover:bg-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h3
              className="font-display font-semibold text-[var(--ink)] text-[16px] tracking-[-0.02em]"
              style={{ margin: '0 0 4px' }}
            >
              {uiLang === 'zh'
                ? '新手任务 · Getting Started'
                : 'Getting Started · 新手任务'}
            </h3>
            <span className="font-display italic text-[12px] text-[var(--blue-accent)]">
              {uiLang === 'zh'
                ? `${done} / ${total} 已完成`
                : `${done} / ${total} completed`}
            </span>

            {/* Progress bar */}
            <div
              className="h-[6px] bg-[rgba(91,127,232,0.15)] rounded-full overflow-hidden"
              style={{ margin: '10px 0 14px' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #5B7FE8, #0A0E1A)' }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            <ul className="list-none p-0 m-0">
              {items.map((item) => (
                <li
                  key={item.key}
                  className={`flex items-center gap-[10px] py-[9px] font-zh-sans font-medium text-[14px] tracking-[0.01em] ${
                    item.done
                      ? 'text-[rgba(91,127,232,0.55)] line-through'
                      : 'text-[var(--ink)]'
                  }`}
                >
                  <span
                    className={`w-[18px] h-[18px] rounded-full inline-flex items-center justify-center shrink-0 ${
                      item.done
                        ? 'bg-[var(--blue-accent)] text-white'
                        : 'border-[1.5px] border-[rgba(91,127,232,0.35)]'
                    }`}
                  >
                    {item.done && (
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span>{uiLang === 'zh' ? item.label : item.labelEn}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
