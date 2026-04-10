import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '../firebase';
import { Zap, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [isExpanded, setIsExpanded] = useState(true);
  const [slang, setSlang] = useState<SlangEntry | null>(null);
  const [meanings, setMeanings] = useState<SlangMeaning[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const todayKey = `daily_challenge_${new Date().toISOString().split('T')[0]}`;

  useEffect(() => {
    // Check if already completed today
    if (localStorage.getItem(todayKey)) {
      setCompleted(true);
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

    // Mark as completed
    localStorage.setItem(todayKey, 'true');
    setCompleted(true);
  };

  if (loading || (!slang && !completed)) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl px-4 py-3 text-left hover:shadow-sm transition-shadow"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <span className="font-bold text-amber-800 text-sm">
            {uiLang === 'zh' ? '每日挑战' : 'Daily Challenge'}
          </span>
          {completed && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {uiLang === 'zh' ? '已完成' : 'Done'}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-amber-500" /> : <ChevronDown className="w-4 h-4 text-amber-500" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white/60 backdrop-blur-md border border-amber-100 rounded-2xl p-5 mt-2 shadow-sm">
              {completed && !slang ? (
                <p className="text-center text-amber-700 text-sm">
                  {uiLang === 'zh' ? '今日挑战已完成，明天再来！' : "Today's challenge is done. Come back tomorrow!"}
                </p>
              ) : slang ? (
                <div className="space-y-3">
                  <div className="text-center">
                    <p className="text-2xl font-black text-gray-900 mb-1">{slang.term}</p>
                    <p className="text-sm text-amber-700">
                      {uiLang === 'zh' ? '你知道这个梗是什么意思吗？' : 'Do you know what this means?'}
                    </p>
                  </div>

                  {!revealed ? (
                    <div className="text-center">
                      <button
                        onClick={handleReveal}
                        className="inline-flex items-center gap-2 bg-amber-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors shadow-sm"
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
                          <div key={m.id} className="bg-amber-50/50 border border-amber-100 rounded-xl p-3">
                            <p className="text-gray-900 text-sm font-medium">{m.meaning}</p>
                            {m.example && (
                              <p className="text-gray-500 text-xs mt-1 italic">"{m.example}"</p>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-gray-500 text-sm">
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
