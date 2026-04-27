/**
 * ChangelogToast — pops a single toast in the bottom-right when the user
 * opens the app and is seeing a NEW major version for the first time.
 *
 * Rules:
 *   - Only fires for `isMajor: true` entries. Minor patches only light up
 *     the bell (quiet rollout).
 *   - Acknowledging (click 知道了 / close) writes lastSeen so it won't pop
 *     again. Same key as ChangelogBell so clicking either one dismisses both.
 *   - Never pops on the very first session (no lastSeen → null). New users
 *     don't need to be told "v0.2.0 is better than the v0.1 you never saw"
 *     — they need to be told what this app IS, which is the onboarding's job.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Sparkles, X } from 'lucide-react';
import { CHANGELOG, compareVersions, latestEntry } from '../data/changelog';
import { LAST_SEEN_VERSION_KEY } from './ChangelogBell';

// Track whether we've already fired this session's toast. React StrictMode
// double-invokes useEffect in dev and we don't want a double pop.
let firedThisSession = false;

function readLastSeen(): string | null {
  try { return localStorage.getItem(LAST_SEEN_VERSION_KEY); } catch { return null; }
}
function writeLastSeen(version: string) {
  try { localStorage.setItem(LAST_SEEN_VERSION_KEY, version); } catch { /* quota */ }
}

interface ChangelogToastProps {
  currentVersion: string;
}

export default function ChangelogToast({ currentVersion }: ChangelogToastProps) {
  useEffect(() => {
    if (firedThisSession) return;
    firedThisSession = true;

    const lastSeen = readLastSeen();
    const latest = latestEntry();
    if (!latest) return;

    // Case 1: first-ever visit. Don't pop — let onboarding handle them.
    // But still write the version so next time they DO see updates.
    if (lastSeen === null) {
      writeLastSeen(currentVersion);
      return;
    }

    // Case 2: already current. Nothing new to say.
    if (compareVersions(latest.version, lastSeen) <= 0) return;

    // Case 3: minor rollout (isMajor !== true). Bell handles it quietly.
    if (!latest.isMajor) return;

    // Case 4: major update since last visit → pop toast.
    const toastId = toast.custom(
      (t) => (
        <div className="bg-gradient-to-br from-[#5B7FE8] to-[#0A0E1A] text-white rounded-2xl shadow-2xl px-5 py-4 max-w-sm flex items-start gap-3">
          <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-md">
                v{latest.version} 来了
              </span>
            </div>
            <h3 className="font-bold text-base mb-2 leading-tight">{latest.title}</h3>
            <ul className="space-y-1 mb-3">
              {latest.changes.slice(0, 3).map((c, i) => (
                <li key={i} className="text-xs text-white/90 leading-relaxed flex gap-1.5">
                  <span className="text-white/60 shrink-0">·</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                writeLastSeen(currentVersion);
                toast.dismiss(t);
              }}
              className="text-xs font-bold bg-white text-[#5B7FE8] px-3 py-1.5 rounded-lg hover:bg-[rgba(91,127,232,0.08)] transition-colors"
            >
              知道了
            </button>
          </div>
          <button
            onClick={() => {
              writeLastSeen(currentVersion);
              toast.dismiss(t);
            }}
            className="text-white/60 hover:text-white transition-colors shrink-0"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ),
      {
        duration: 12000,  // ~12s — long enough to read 3 bullets, short enough
                          // not to camp if ignored. Hovering the toast freezes
                          // the timer (sonner default).
        position: 'bottom-right',
      }
    );
    void toastId;
  }, [currentVersion]);

  return null;
}
