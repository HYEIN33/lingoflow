/**
 * ChangelogBell — the small bell icon in the header that lights up (red dot)
 * when there's a release the current user hasn't seen. Click opens a modal
 * with the full release history.
 *
 * "Seen" state lives in localStorage (`memeflow_last_seen_version`). It's a
 * version string, not a boolean — so we can tell the difference between
 * "never opened before" (null → everything is new) and "seen v0.2.0 but
 * v0.3.0 shipped since".
 *
 * The same key is read by ChangelogToast so the toast doesn't re-pop after
 * the user already acknowledged via the bell.
 */
import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CHANGELOG, compareVersions, entriesNewerThan } from '../data/changelog';

export const LAST_SEEN_VERSION_KEY = 'memeflow_last_seen_version';

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

function writeLastSeen(version: string) {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    // quota exceeded / disabled — harmless, red dot will reappear next load
  }
}

interface ChangelogBellProps {
  // Current app version, from package.json via vite define. Passing as prop
  // keeps the component pure and testable.
  currentVersion: string;
}

export default function ChangelogBell({ currentVersion }: ChangelogBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Read once on mount and track in state so clicking the bell removes the
  // dot immediately without waiting for parent re-render.
  const [lastSeen, setLastSeen] = useState<string | null>(readLastSeen());

  const unseen = entriesNewerThan(lastSeen);
  const hasUnseen = unseen.length > 0;

  const handleOpen = () => {
    setIsOpen(true);
    // Write lastSeen to localStorage immediately so the red dot disappears
    // on the bell right away and doesn't come back after reload. But we
    // deliberately do NOT setLastSeen(currentVersion) here — keeping the
    // React state at its old value for this session means the entries
    // still render their "New" pills. That's the whole point of the modal:
    // the user needs to SEE which entries are new. Previously setState
    // fired on click and the pills disappeared on the very next render —
    // the user opened the modal and saw a flat history with nothing
    // highlighted. On reload, lastSeen is fresh from localStorage, so the
    // pills are gone as intended.
    if (hasUnseen) {
      writeLastSeen(currentVersion);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative p-2 text-gray-400 hover:text-blue-600 transition-colors rounded-xl hover:bg-blue-50"
        title={hasUnseen ? '有新内容！' : '更新日志'}
        aria-label="更新日志"
      >
        <Bell className="w-5 h-5" />
        {hasUnseen && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // z-[100] > the app header's sticky z-10 and any tab bar's
            // blur layer. `isolate` creates a new stacking context so the
            // overlay can't be pierced by sticky siblings below.
            // bg-black/60 replaces /40 — previously the page behind was
            // bleeding through and the user saw tabs + search history
            // through the modal.
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] isolate flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-blue-600" />
                  <h2 className="font-black text-lg text-gray-900">更新日志</h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Entries */}
              <div className="overflow-y-auto px-6 py-5 space-y-6">
                {CHANGELOG.map((entry) => {
                  const isUnseen = !lastSeen || compareVersions(entry.version, lastSeen) > 0;
                  // After clicking Open we already wrote lastSeen, so isUnseen
                  // will be false here on subsequent opens. That's intentional —
                  // the "new" ribbon only shows the FIRST time they open after
                  // a release. Exception: if they opened during the session,
                  // setLastSeen already updated, so the ribbon disappears
                  // from the current render. Also intentional.
                  return (
                    <div key={entry.version}>
                      {/* Top row: version + date + optional NEW pill. Inline
                          instead of absolutely positioned — the old -top-2
                          -right-2 pill was getting clipped by the modal's
                          rounded-3xl + overflow-hidden container. */}
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <span className="font-black text-blue-600 text-sm">
                          v{entry.version}
                        </span>
                        <span className="text-xs text-gray-400">{entry.date}</span>
                        {isUnseen && (
                          <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                            New
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-gray-900 text-base mb-3 leading-snug">
                        {entry.title}
                      </h3>
                      <ul className="space-y-2">
                        {entry.changes.map((change, i) => (
                          <li
                            key={i}
                            className="text-sm text-gray-600 leading-relaxed flex gap-2"
                          >
                            <span className="text-blue-400 shrink-0">·</span>
                            <span>{change}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-gray-100 text-center">
                <span className="text-xs text-gray-400">
                  感谢你在用 MemeFlow 🙏
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
