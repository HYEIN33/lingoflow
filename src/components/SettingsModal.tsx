/**
 * SettingsModal — gear icon in the header opens this. Houses the knobs
 * that used to crowd the header (language toggle, logout) plus a few
 * utility items (clear search history, feedback, about).
 *
 * Design note: anything that mutates user data or kicks them out needs a
 * second-tap confirmation. We use `toast.warning` with an action/cancel
 * pair — same pattern as the existing logout flow — so the UX is
 * consistent across the app and users already know how to respond.
 *
 * The modal is rendered via React Portal out of the header (which has
 * `backdrop-blur-md` that traps `position: fixed` descendants — same bug
 * we fixed for ChangelogBell).
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  Settings as SettingsIcon,
  X,
  Globe,
  Trash2,
  Mail,
  Info,
  LogOut,
  MessageSquare,
} from 'lucide-react';

type UiLang = 'zh' | 'en';

interface SettingsModalProps {
  uiLang: UiLang;
  setUiLang: (lang: UiLang) => void;
  currentVersion: string;
  onLogout: () => void;
  onClearSearchHistory: () => void;
  feedbackEmail: string;
  wechatQrSrc?: string;
}

export default function SettingsModal({
  uiLang,
  setUiLang,
  currentVersion,
  onLogout,
  onClearSearchHistory,
  feedbackEmail,
  wechatQrSrc,
}: SettingsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showWechat, setShowWechat] = useState(false);

  const zh = uiLang === 'zh';

  // 允许其他组件（例如 UserProfile 的齿轮按钮）通过全局事件打开本 modal，
  // 避免两份 Settings UI 并存。事件名 `memeflow:open-settings`。
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('memeflow:open-settings', handler);
    return () => window.removeEventListener('memeflow:open-settings', handler);
  }, []);

  // Double-confirm clear history: toast with undo-style action, same feel
  // as logout. If they hit the action button they really meant it.
  const handleClearHistory = () => {
    toast.warning(
      zh ? '确定要清除搜索历史吗？无法恢复。' : 'Clear search history? This cannot be undone.',
      {
        action: {
          label: zh ? '清除' : 'Clear',
          onClick: () => {
            onClearSearchHistory();
            toast.success(zh ? '搜索历史已清除' : 'Search history cleared');
          },
        },
        cancel: { label: zh ? '取消' : 'Cancel', onClick: () => {} },
        duration: 8000,
      }
    );
  };

  // Settings modal also offers logout — proxied through the app's existing
  // confirmLogout which already does the two-step toast.
  const handleLogoutClick = () => {
    setIsOpen(false); // close the panel so the toast is visible
    onLogout();
  };

  const openFeedbackEmail = () => {
    const subject = encodeURIComponent(zh ? 'MemeFlow 反馈' : 'MemeFlow feedback');
    const body = encodeURIComponent(
      zh
        ? `（请写下你的想法、问题或建议）\n\n---\n版本：${currentVersion}\n浏览器：${navigator.userAgent}`
        : `(Your feedback here)\n\n---\nVersion: ${currentVersion}\nBrowser: ${navigator.userAgent}`
    );
    window.location.href = `mailto:${feedbackEmail}?subject=${subject}&body=${body}`;
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-1.5 sm:p-2 hover:bg-gray-50 rounded-full transition-colors text-[var(--ink-muted)] hover:text-[#5B7FE8]"
        title={zh ? '设置' : 'Settings'}
        aria-label={zh ? '设置' : 'Settings'}
      >
        <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
              onClick={() => setIsOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="glass-thick rounded-[22px] max-w-[440px] w-full max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-[22px] py-[18px] border-b border-[var(--ink-hairline)]">
                  <h2 className="flex items-center gap-2 m-0 font-display font-bold text-[18px] tracking-[-0.02em] text-[var(--ink)]">
                    <SettingsIcon className="w-[18px] h-[18px] text-[var(--blue-accent)]" strokeWidth={1.8} />
                    {zh ? '设置 · Settings' : 'Settings · 设置'}
                  </h2>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-8 h-8 inline-flex items-center justify-center bg-transparent border-0 cursor-pointer text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-[rgba(10,14,26,0.04)] rounded-[9px] transition-colors"
                    aria-label={zh ? '关闭' : 'Close'}
                  >
                    <X className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>

                <div className="overflow-y-auto px-3 py-2.5">
                  {/* Language */}
                  <SettingRow
                    icon={<Globe className="w-[18px] h-[18px]" strokeWidth={1.8} />}
                    title={zh ? '界面语言 · Language' : 'Language · 界面语言'}
                    trailing={
                      <div className="inline-flex gap-[2px] p-[3px] bg-[rgba(10,14,26,0.06)] rounded-[9px]">
                        <button
                          onClick={() => setUiLang('zh')}
                          className={
                            'px-3 py-[5px] border-0 cursor-pointer font-zh-serif text-[11.5px] font-bold rounded-[7px] transition-colors ' +
                            (uiLang === 'zh'
                              ? 'bg-white text-[var(--blue-accent)] shadow-[0_1px_3px_rgba(10,14,26,0.08)]'
                              : 'bg-transparent text-[var(--ink-subtle)]')
                          }
                        >
                          中文
                        </button>
                        <button
                          onClick={() => setUiLang('en')}
                          className={
                            'px-3 py-[5px] border-0 cursor-pointer font-zh-serif text-[11.5px] font-bold rounded-[7px] transition-colors ' +
                            (uiLang === 'en'
                              ? 'bg-white text-[var(--blue-accent)] shadow-[0_1px_3px_rgba(10,14,26,0.08)]'
                              : 'bg-transparent text-[var(--ink-subtle)]')
                          }
                        >
                          EN
                        </button>
                      </div>
                    }
                  />

                  <div className="h-px bg-[var(--ink-hairline)] mx-[10px] my-1.5" />

                  {/* Feedback via email */}
                  <SettingButton
                    icon={<Mail className="w-[18px] h-[18px]" strokeWidth={1.8} />}
                    title={zh ? '邮件反馈 · Email feedback' : 'Email feedback · 邮件反馈'}
                    subtitle={feedbackEmail}
                    onClick={openFeedbackEmail}
                    chevron
                  />

                  {/* Feedback via wechat — only if QR exists */}
                  {wechatQrSrc && (
                    <SettingButton
                      icon={<MessageSquare className="w-[18px] h-[18px]" strokeWidth={1.8} />}
                      title={zh ? '微信联系开发者 · WeChat' : 'WeChat · 微信联系开发者'}
                      subtitle={zh ? '扫码加好友' : 'Scan QR to add'}
                      onClick={() => setShowWechat(true)}
                      chevron
                    />
                  )}

                  <div className="h-px bg-[var(--ink-hairline)] mx-[10px] my-1.5" />

                  {/* About */}
                  <SettingRow
                    icon={<Info className="w-[18px] h-[18px]" strokeWidth={1.8} />}
                    title={zh ? '关于 · About' : 'About · 关于'}
                    trailing={
                      <span className="font-mono-meta text-[11px] text-[var(--ink-subtle)] tabular-nums">
                        v{currentVersion}
                      </span>
                    }
                  />

                  {/* Danger zone */}
                  <div className="px-[14px] pt-2 pb-1">
                    <span className="font-mono-meta text-[9px] font-extrabold tracking-[0.2em] uppercase text-[rgba(229,56,43,0.65)]">
                      {zh ? 'danger zone · 谨慎操作' : 'danger zone'}
                    </span>
                  </div>

                  <SettingButton
                    icon={<Trash2 className="w-[18px] h-[18px]" strokeWidth={1.8} />}
                    title={zh ? '清除搜索历史' : 'Clear search history'}
                    subtitle={zh ? '清空本机上保存的翻译记录' : 'Removes local search history'}
                    onClick={handleClearHistory}
                    danger
                  />

                  <SettingButton
                    icon={<LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} />}
                    title={zh ? '退出登录 · Sign out' : 'Sign out · 退出登录'}
                    subtitle={zh ? '回到登录界面' : 'Return to sign-in'}
                    onClick={handleLogoutClick}
                    danger
                  />
                </div>

                <div className="px-6 py-3 border-t border-[var(--ink-hairline)] text-center">
                  <span className="font-zh-serif text-[11px] text-[var(--ink-subtle)]">
                    {zh ? '感谢你在用 MemeFlow · Thanks for using MemeFlow' : 'Thanks for using MemeFlow · 感谢你在用 MemeFlow'}
                  </span>
                </div>
              </motion.div>

              {/* WeChat QR overlay — appears on top of the settings sheet */}
              <AnimatePresence>
                {showWechat && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
                    onClick={() => setShowWechat(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0.9 }}
                      className="glass-thick rounded-[22px] p-6 text-center max-w-[300px] w-full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 className="m-0 mb-1 font-display font-semibold text-[18px] text-[var(--ink)]">
                        {zh ? '加开发者微信' : 'WeChat'}
                      </h3>
                      <p className="font-zh-serif text-[12px] text-[var(--ink-subtle)] m-0 mb-4">
                        {zh ? '扫码即可添加' : 'Scan to add'}
                      </p>
                      <img
                        src={wechatQrSrc}
                        alt="WeChat QR"
                        className="w-full rounded-[14px] border border-[var(--ink-hairline)]"
                      />
                      <button
                        onClick={() => setShowWechat(false)}
                        className="mt-4 w-full py-2.5 bg-transparent border border-[var(--ink-hairline)] hover:border-[var(--ink-rule)] text-[var(--ink-body)] font-zh-serif font-bold rounded-[12px] transition-colors text-[13px]"
                      >
                        {zh ? '关闭' : 'Close'}
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

function SettingRow({
  icon,
  title,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  trailing: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-[12px]">
      <span className="w-6 flex-shrink-0 text-[var(--ink-subtle)]">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-zh-sans font-semibold text-[14px] tracking-[0.01em] text-[var(--ink)]">
          {title}
        </div>
      </div>
      <div>{trailing}</div>
    </div>
  );
}

function SettingButton({
  icon,
  title,
  subtitle,
  onClick,
  danger,
  chevron,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'w-full flex items-center gap-3 px-3 py-3 rounded-[12px] text-left transition-colors cursor-pointer border-0 bg-transparent ' +
        (danger
          ? 'hover:bg-[rgba(229,56,43,0.08)]'
          : 'hover:bg-[rgba(91,127,232,0.06)]')
      }
    >
      <span
        className={
          'w-6 flex-shrink-0 ' +
          (danger ? 'text-[var(--red-warn)]' : 'text-[var(--ink-subtle)]')
        }
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={
            'font-zh-sans font-semibold text-[14px] tracking-[0.01em] ' +
            (danger ? 'text-[var(--red-warn)]' : 'text-[var(--ink)]')
          }
        >
          {title}
        </div>
        {subtitle && (
          <div className="font-zh-sans font-medium text-[12.5px] tracking-[0.01em] text-[var(--ink-body)] mt-1">
            {subtitle}
          </div>
        )}
      </div>
      {chevron && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--ink-subtle)] flex-shrink-0"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </button>
  );
}
