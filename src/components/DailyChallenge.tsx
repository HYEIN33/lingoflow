import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '../firebase';
import { Zap, ChevronDown, ChevronUp, Eye, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DailyChallengeProps {
  uiLang: 'en' | 'zh';
}

interface SlangEntry {
  id: string;
  term: string;
}

interface SlangMeaning {
  id: string;
  meaning: string;
  example: string;
}

export function DailyChallenge({ uiLang }: DailyChallengeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [slang, setSlang] = useState<SlangEntry | null>(null);
  const [meanings, setMeanings] = useState<SlangMeaning[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  // Per-day dismissal for the "completed" bar. User can tap × after
  // finishing today to get the bar off their home screen until tomorrow,
  // when a fresh challenge rolls out. No-op if they haven't completed yet
  // (no × is rendered in that state).
  const todayStr = new Date().toISOString().split('T')[0];
  const todayKey = `daily_challenge_${todayStr}`;
  const dismissKey = `daily_challenge_dismissed_${todayStr}`;
  const [dismissed, setDismissed] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem(dismissKey) === 'true'
  );

  useEffect(() => {
    // Check if already completed today
    if (localStorage.getItem(todayKey)) {
      setCompleted(true);
      setIsExpanded(false);
      setLoading(false);
      return;
    }

    const fetchRandomSlang = async () => {
      try {
        // Get total count by fetching a small set and picking random
        const q = query(collection(db, 'slangs'), orderBy('createdAt', 'desc'), firestoreLimit(20));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          setLoading(false);
          return;
        }

        const slangs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SlangEntry));
        const randomIndex = Math.floor(Math.random() * slangs.length);
        setSlang(slangs[randomIndex]);
      } catch (error) {
        console.error('Error fetching daily challenge:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRandomSlang();
  }, [todayKey]);

  const handleReveal = async () => {
    if (!slang) return;
    setRevealed(true);

    try {
      const meaningsQ = query(
        collection(db, 'slang_meanings'),
        where('slangId', '==', slang.id),
        where('status', '==', 'approved'),
        orderBy('upvotes', 'desc'),
        firestoreLimit(3)
      );
      const snapshot = await getDocs(meaningsQ);
      setMeanings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SlangMeaning)));
    } catch (error) {
      console.error('Error fetching meanings:', error);
    }

    // Mark as completed and auto-collapse after delay
    localStorage.setItem(todayKey, 'true');
    setCompleted(true);
    setTimeout(() => setIsExpanded(false), 2000);
  };

  if (loading || (!slang && !completed)) return null;
  // User tapped × after completing today → hide entirely until tomorrow,
  // when a fresh `todayStr` makes `dismissKey` a different localStorage key
  // and the bar naturally reappears for the new challenge.
  if (completed && dismissed) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();  // don't toggle isExpanded when tapping ×
    localStorage.setItem(dismissKey, 'true');
    setDismissed(true);
  };

  return (
    <div className="mb-4 relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-[14px] glass-thick !rounded-[14px] border-[1.5px] border-[rgba(91,127,232,0.35)] px-[18px] py-[14px] text-left hover:shadow-sm transition-shadow"
        style={{
          backgroundImage:
            'linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.55)), radial-gradient(circle at 90% 0%, rgba(137,163,240,0.4), transparent 65%)',
        }}
      >
        <span className="w-9 h-9 rounded-[12px] inline-flex items-center justify-center text-white bg-gradient-to-br from-[#5B7FE8] to-[#89A3F0] shadow-[0_4px_10px_rgba(91,127,232,0.35)] shrink-0">
          <Zap className="w-[18px] h-[18px]" fill="currentColor" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display italic font-semibold text-[14px] text-[var(--blue-accent)]">
            — {uiLang === 'zh' ? 'daily challenge' : 'daily challenge'}
          </div>
          <div className="font-zh-serif text-[13px] text-[var(--ink-body)] truncate">
            {uiLang === 'zh' ? '每日挑战' : 'Daily Challenge'}
            {slang ? ` · ${slang.term}` : ''}
            {completed && (
              <span className="ml-2 text-xs bg-[rgba(47,99,23,0.1)] text-[var(--green-ok)] px-2 py-0.5 rounded-full font-medium">
                {uiLang === 'zh' ? '已完成' : 'Done'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-display italic text-[13px] text-[var(--blue-accent)] hidden sm:inline">
            {isExpanded
              ? (uiLang === 'zh' ? '收起 ↑' : 'collapse ↑')
              : (uiLang === 'zh' ? '展开揭晓 →' : 'reveal →')}
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--blue-accent)]" /> : <ChevronDown className="w-4 h-4 text-[var(--blue-accent)]" />}
          {completed && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleDismiss}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDismiss(e as any); }}
              className="ml-1 p-1 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[rgba(10,14,26,0.04)] rounded-md transition-colors cursor-pointer"
              title={uiLang === 'zh' ? '今日关闭（明日重新出现）' : 'Hide for today'}
              aria-label={uiLang === 'zh' ? '关闭今日挑战' : 'Dismiss today\'s challenge'}
            >
              <X className="w-4 h-4" />
            </span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="surface !rounded-[18px] border-[var(--ink-hairline)] p-5 mt-2">
              {completed && !slang ? (
                <p className="text-center font-zh-serif text-[13px] text-[var(--ink-body)]">
                  {uiLang === 'zh' ? '今日挑战已完成，明天再来！' : "Today's challenge is done. Come back tomorrow!"}
                </p>
              ) : slang ? (
                <div className="space-y-3">
                  <div className="text-center">
                    <p className="font-display italic font-bold text-[28px] text-[var(--ink)] tracking-[-0.03em] mb-1">{slang.term}</p>
                    <p className="font-zh-serif text-[13px] text-[var(--ink-body)]">
                      {uiLang === 'zh' ? '你知道这个梗是什么意思吗？' : 'Do you know what this means?'}
                    </p>
                  </div>

                  {!revealed ? (
                    <div className="text-center">
                      <button
                        onClick={handleReveal}
                        className="inline-flex items-center gap-2 bg-[var(--ink)] text-white px-5 py-2.5 rounded-xl font-zh-serif text-sm font-bold hover:bg-[#1a2440] transition-colors shadow-[0_4px_12px_rgba(10,14,26,0.25)]"
                      >
                        <Eye className="w-4 h-4" />
                        {uiLang === 'zh' ? '揭晓答案' : 'Reveal Answer'}
                      </button>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                    >
                      {meanings.length > 0 ? (
                        meanings.map((m) => (
                          <div key={m.id} className="bg-[rgba(91,127,232,0.05)] border border-[rgba(91,127,232,0.2)] rounded-xl p-3">
                            <p className="font-zh-serif text-[var(--ink)] text-sm font-medium leading-[1.75]">{m.meaning}</p>
                            {m.example && (
                              <p className="font-display italic text-[var(--ink-body)] text-xs mt-1">"{m.example}"</p>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-[var(--ink-muted)] text-sm">
                          {uiLang === 'zh' ? '暂无解释' : 'No meanings yet'}
                        </p>
                      )}
                    </motion.div>
                  )}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
