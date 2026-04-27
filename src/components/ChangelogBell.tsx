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
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CHANGELOG, compareVersions, entriesNewerThan } from '../data/changelog';

export const LAST_SEEN_VERSION_KEY = 'memeflow_last_seen_version';

function readLastSeen(): string | null {
  try {
    const raw = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    if (!raw) return null;
    // Defensive: if we've ever rolled the version number BACKWARD (happened
    // when we consolidated 0.3.x into a big 0.2.0 release), a returning
    // user's lastSeen could be higher than anything in CHANGELOG. Treat
    // that as "never seen" so the bell still lights up on the new headline.
    const newest = CHANGELOG[0]?.version;
    if (newest && compareVersions(raw, newest) > 0) return null;
    return raw;
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

  // Track "what lastSeen was when the user clicked the bell" separately
  // from the live lastSeen — the modal uses this snapshot to decide which
  // entries deserve a NEW pill. That way clicking the bell can update
  // React state (so the red dot disappears immediately) without also
  // hiding the NEW pills in the modal that just opened.
  const [snapshotAtOpen, setSnapshotAtOpen] = useState<string | null>(null);

  const handleOpen = () => {
    // Snapshot BEFORE we mutate lastSeen so the modal still knows which
    // entries were new from the user's POV.
    setSnapshotAtOpen(lastSeen);
    setIsOpen(true);
    if (hasUnseen) {
      writeLastSeen(currentVersion);
      setLastSeen(currentVersion); // kill the red dot right away
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative p-2 text-[var(--ink-muted)] hover:text-[#5B7FE8] transition-colors rounded-xl hover:bg-[rgba(91,127,232,0.08)]"
        title={hasUnseen ? '有新内容！' : '更新日志'}
        aria-label="更新日志"
      >
        <Bell className="w-5 h-5" />
        {hasUnseen && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
        )}
      </button>

      {createPortal(
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // Rendered into document.body via React Portal. Reason: the
            // <Bell> button lives inside <header> which applies
            // `backdrop-blur-md`. A backdrop-filter ancestor breaks
            // `position: fixed` — the fixed element gets constrained to
            // the ancestor's box instead of the viewport. Previously the
            // modal was showing up as a small panel in the middle of the
            // page, not covering the whole screen. Portal-ing out of the
            // header fixes the containing block to the viewport.
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4"
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
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--ink-hairline)]">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-[#5B7FE8]" />
                  <h2 className="font-black text-lg text-[var(--ink)]">更新日志</h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink-body)] hover:bg-[rgba(10,14,26,0.05)] rounded-xl transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Entries */}
              <div className="overflow-y-auto px-6 py-5 space-y-6">
                {CHANGELOG.map((entry) => {
                  const isUnseen = !snapshotAtOpen || compareVersions(entry.version, snapshotAtOpen) > 0;
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
                        <span className="font-black text-[#5B7FE8] text-sm">
                          v{entry.version}
                        </span>
                        <span className="text-xs text-[var(--ink-muted)]">{entry.date}</span>
                        {isUnseen && (
                          <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                            New
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-[var(--ink)] text-base mb-3 leading-snug">
                        {entry.title}
                      </h3>
                      <ul className="space-y-2">
                        {entry.changes.map((change, i) => (
                          <li
                            key={i}
                            className="text-sm text-[var(--ink-body)] leading-relaxed flex gap-2"
                          >
                            <span className="text-[rgba(91,127,232,0.6)] shrink-0">·</span>
                            <span>{change}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-[var(--ink-hairline)] text-center">
                <span className="text-xs text-[var(--ink-muted)]">
                  感谢你在用 MemeFlow 🙏
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </>
  );
}
