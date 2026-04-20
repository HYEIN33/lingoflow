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
import { useState } from 'react';
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
        className="p-1.5 sm:p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-400 hover:text-blue-500"
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
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4"
              onClick={() => setIsOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <SettingsIcon className="w-5 h-5 text-blue-600" />
                    <h2 className="font-black text-lg text-gray-900">{zh ? '设置' : 'Settings'}</h2>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                    aria-label={zh ? '关闭' : 'Close'}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="overflow-y-auto px-4 py-3 space-y-1">
                  {/* Language */}
                  <SettingRow
                    icon={<Globe className="w-5 h-5" />}
                    title={zh ? '界面语言' : 'Language'}
                    trailing={
                      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                        <button
                          onClick={() => setUiLang('zh')}
                          className={
                            'px-3 py-1 text-xs font-bold rounded-md transition-colors ' +
                            (uiLang === 'zh' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500')
                          }
                        >
                          中文
                        </button>
                        <button
                          onClick={() => setUiLang('en')}
                          className={
                            'px-3 py-1 text-xs font-bold rounded-md transition-colors ' +
                            (uiLang === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500')
                          }
                        >
                          EN
                        </button>
                      </div>
                    }
                  />

                  <div className="h-px bg-gray-100 my-2" />

                  {/* Feedback via email */}
                  <SettingButton
                    icon={<Mail className="w-5 h-5" />}
                    title={zh ? '邮件反馈' : 'Email feedback'}
                    subtitle={feedbackEmail}
                    onClick={openFeedbackEmail}
                  />

                  {/* Feedback via wechat — only if QR exists */}
                  {wechatQrSrc && (
                    <SettingButton
                      icon={<MessageSquare className="w-5 h-5" />}
                      title={zh ? '微信联系开发者' : 'WeChat contact'}
                      subtitle={zh ? '扫码加好友' : 'Scan QR to add'}
                      onClick={() => setShowWechat(true)}
                    />
                  )}

                  <div className="h-px bg-gray-100 my-2" />

                  {/* About */}
                  <SettingRow
                    icon={<Info className="w-5 h-5" />}
                    title={zh ? '关于' : 'About'}
                    trailing={
                      <span className="text-xs text-gray-400 font-mono tabular-nums">
                        v{currentVersion}
                      </span>
                    }
                  />

                  <div className="h-px bg-gray-100 my-2" />

                  {/* Danger zone */}
                  <div className="px-2 pt-1 pb-0.5">
                    <span className="text-[10px] font-black tracking-wider text-red-400 uppercase">
                      {zh ? '谨慎操作' : 'Danger zone'}
                    </span>
                  </div>

                  <SettingButton
                    icon={<Trash2 className="w-5 h-5" />}
                    title={zh ? '清除搜索历史' : 'Clear search history'}
                    subtitle={zh ? '清空本机上保存的翻译记录' : 'Removes local search history'}
                    onClick={handleClearHistory}
                    danger
                  />

                  <SettingButton
                    icon={<LogOut className="w-5 h-5" />}
                    title={zh ? '退出登录' : 'Sign out'}
                    subtitle={zh ? '回到登录界面' : 'Return to sign-in'}
                    onClick={handleLogoutClick}
                    danger
                  />
                </div>

                <div className="px-6 py-3 border-t border-gray-100 text-center">
                  <span className="text-xs text-gray-400">
                    {zh ? '感谢你在用 MemeFlow 🙏' : 'Thanks for using MemeFlow 🙏'}
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
                    className="fixed inset-0 bg-black/70 z-[110] flex items-center justify-center p-4"
                    onClick={() => setShowWechat(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0.9 }}
                      className="bg-white rounded-3xl p-6 shadow-2xl text-center max-w-xs w-full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 className="font-black text-gray-900 mb-1">
                        {zh ? '加开发者微信' : 'WeChat'}
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">
                        {zh ? '扫码即可添加' : 'Scan to add'}
                      </p>
                      <img
                        src={wechatQrSrc}
                        alt="WeChat QR"
                        className="w-full rounded-2xl border border-gray-100"
                      />
                      <button
                        onClick={() => setShowWechat(false)}
                        className="mt-4 w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors text-sm"
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
    <div className="flex items-center justify-between px-3 py-3 rounded-xl">
      <div className="flex items-center gap-3 text-gray-700">
        <span className="text-gray-400">{icon}</span>
        <span className="font-medium text-sm">{title}</span>
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
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ' +
        (danger
          ? 'hover:bg-red-50 text-red-600'
          : 'hover:bg-blue-50 text-gray-700')
      }
    >
      <span className={danger ? 'text-red-400' : 'text-gray-400'}>{icon}</span>
      <div className="flex-1">
        <div className="font-medium text-sm">{title}</div>
        {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
    </button>
  );
}
