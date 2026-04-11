import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Trophy, Crown, ChevronUp, ChevronDown, Clock, Star, Flame, Loader2 } from 'lucide-react';

export default function Leaderboard({ defaultTab = 'group', currentUserId, uiLang = 'zh', onUserClick }: { defaultTab?: 'group' | 'global' | 'monthly', currentUserId: string, uiLang?: 'en' | 'zh', groupId?: string, onUserClick?: (uid: string) => void }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [groupData, setGroupData] = useState<any[]>([]);
  const [globalData, setGlobalData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const nextSunday = new Date();
      nextSunday.setDate(now.getDate() + (7 - now.getDay()));
      nextSunday.setHours(23, 59, 59, 999);
      const diff = nextSunday.getTime() - now.getTime();
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);
      setTimeLeft(`${d}${uiLang === 'zh' ? '天' : 'd'} ${h}${uiLang === 'zh' ? '时' : 'h'} ${m}${uiLang === 'zh' ? '分' : 'm'} ${s}${uiLang === 'zh' ? '秒' : 's'}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [uiLang]);

  // Fetch real leaderboard data from Firestore users collection
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'users'), orderBy('approvedSlangCount', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      const users = snap.docs
        .filter(d => {
          const data = d.data();
          // Only show real users: must have a display name or be current user
          const isReal = data.displayName && data.displayName !== 'Anonymous';
          return (isReal || d.id === currentUserId) && (data.approvedSlangCount || 0) > 0;
        })
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            username: data.displayName || (d.id === currentUserId ? (uiLang === 'zh' ? '你' : 'You') : `${uiLang === 'zh' ? '用户' : 'User'} ${d.id.slice(0, 4)}`),
            weeklyScore: (data.approvedSlangCount || 0) * 10 + (data.currentStreak || 0) * 5,
            weeklyCount: data.approvedSlangCount || 0,
            totalScore: (data.approvedSlangCount || 0) * 10 + (data.reputationScore || 100),
            totalCount: data.approvedSlangCount || 0,
            avgQuality: data.reputationScore || 100,
            monthlyCount: data.approvedSlangCount || 0,
            likes: 0,
            topEntries: [],
            trend: data.currentStreak > 0 ? data.currentStreak : 0,
          };
        });
      setGroupData(users.slice(0, 10));
      setGlobalData(users);
      setMonthlyData(users.slice(0, 5));
      setIsLoading(false);
    }, () => setIsLoading(false));
    return () => unsub();
  }, [currentUserId, uiLang]);

  const getRankBadge = (index: number) => {
    if (index === 0) return <div className="w-8 h-8 bg-gradient-to-br from-amber-300 to-amber-500 rounded-full flex items-center justify-center shadow-md"><Crown className="w-4 h-4 text-white" /></div>;
    if (index === 1) return <div className="w-8 h-8 bg-gradient-to-br from-gray-300 to-gray-400 rounded-full flex items-center justify-center shadow-md"><span className="text-white font-bold text-xs">2</span></div>;
    if (index === 2) return <div className="w-8 h-8 bg-gradient-to-br from-amber-600 to-amber-700 rounded-full flex items-center justify-center shadow-md"><span className="text-white font-bold text-xs">3</span></div>;
    return <div className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 font-bold text-sm">{index + 1}</div>;
  };

  const renderGroupTab = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Timer */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-blue-600 text-xs font-medium mb-1">{uiLang === 'zh' ? '本周结算倒计时' : 'Weekly reset'}</p>
          <p className="text-gray-900 font-mono font-bold text-lg flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" /> {timeLeft}
          </p>
        </div>
        <div className="text-right">
          <p className="text-amber-500 text-xs font-bold">{uiLang === 'zh' ? 'Top 1 奖励' : 'Top 1 Reward'}</p>
          <p className="text-gray-500 text-[10px] mt-0.5">{uiLang === 'zh' ? '本周梗王称号 + 100次翻译额度' : 'Weekly Champion title + 100 translations'}</p>
        </div>
      </div>

      <div className="space-y-2">
        {groupData.map((user, index) => (
          <div
            key={user.id}
            onClick={() => onUserClick?.(user.id)}
            className={`flex items-center gap-3 p-4 rounded-2xl cursor-pointer transition-all ${
              user.id === currentUserId
                ? 'bg-blue-50 border-2 border-blue-300 shadow-sm'
                : 'bg-white/60 border border-white/60 hover:bg-white/80'
            }`}
          >
            {getRankBadge(index)}
            <div className="w-10 h-10 rounded-xl bg-blue-100 overflow-hidden shrink-0 flex items-center justify-center text-blue-600 font-bold">
              {user.username.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-gray-900 font-bold truncate flex items-center gap-2">
                {user.username}
                {user.id === currentUserId && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold">YOU</span>}
              </h4>
              <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-400" /> {user.weeklyCount} {uiLang === 'zh' ? '词条' : 'entries'}</span>
                {user.trend !== 0 && (
                  <span className={`flex items-center ${user.trend > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                    {user.trend > 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {Math.abs(user.trend)}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-gray-900 font-bold font-mono">{user.weeklyScore}</p>
              <p className="text-[10px] text-gray-400">{uiLang === 'zh' ? '积分' : 'pts'}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );

  const renderGlobalTab = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
      {globalData.map((user, index) => (
        <div
          key={user.id}
          onClick={() => onUserClick?.(user.id)}
          className={`flex items-center gap-3 p-4 rounded-2xl cursor-pointer transition-all ${
            index === 0 ? 'bg-amber-50 border border-amber-200' :
            user.id === currentUserId ? 'bg-blue-50 border-2 border-blue-300' :
            'bg-white/60 border border-white/60 hover:bg-white/80'
          }`}
        >
          {getRankBadge(user.rank ? user.rank - 1 : index)}
          <div className={`w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center font-bold ${index === 0 ? 'bg-amber-200 text-amber-700' : 'bg-blue-100 text-blue-600'}`}>
            {user.username.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className={`font-bold truncate flex items-center gap-2 ${index === 0 ? 'text-amber-700' : 'text-gray-900'}`}>
              {user.username}
              {index === 0 && <span className="text-[10px] bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-black">{uiLang === 'zh' ? '梗神' : 'Legend'} ⚡</span>}
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">{uiLang === 'zh' ? '累计' : 'Total'} {user.totalCount} {uiLang === 'zh' ? '词条' : 'entries'}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-gray-900 font-bold font-mono">{user.totalScore.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400">{uiLang === 'zh' ? '总积分' : 'total'}</p>
          </div>
        </div>
      ))}
    </motion.div>
  );

  const renderMonthlyTab = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      {monthlyData.map((user, index) => (
        <div key={user.id} className="bg-white/60 border border-white/60 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                {user.username.charAt(0)}
              </div>
              <div>
                <h4 className="text-gray-900 font-bold text-lg flex items-center gap-2">
                  {user.username}
                  {index === 0 && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
                </h4>
                <p className="text-sm text-gray-500">{uiLang === 'zh' ? '本月贡献' : 'This month'} {user.monthlyCount} {uiLang === 'zh' ? '词条' : 'entries'}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg text-sm font-bold border border-emerald-200">
                <span>{uiLang === 'zh' ? '质量' : 'Quality'}</span>
                <span>{user.avgQuality}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{user.likes} 👍</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[10px] text-gray-400 mb-2 uppercase tracking-wider font-bold">{uiLang === 'zh' ? '代表作' : 'Top Entries'}</p>
            <div className="flex flex-wrap gap-2">
              {user.topEntries.map((entry: string) => (
                <span key={entry} className="px-3 py-1 bg-white text-gray-700 rounded-lg text-sm border border-gray-200">{entry}</span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </motion.div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Trophy className="w-6 h-6 text-amber-500" />
        {uiLang === 'zh' ? '排行榜' : 'Leaderboard'}
      </h2>

      {/* Tabs */}
      <div className="flex bg-white/30 backdrop-blur-sm border border-white/50 p-1 rounded-2xl shadow-inner">
        {[
          { id: 'group', label: uiLang === 'zh' ? '本周小组' : 'Weekly' },
          { id: 'global', label: uiLang === 'zh' ? '全球总榜' : 'Global' },
          { id: 'monthly', label: uiLang === 'zh' ? '月度明星' : 'Monthly' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-white/70 text-blue-600 shadow-sm backdrop-blur-md border border-white/60'
                : 'text-gray-500 hover:text-gray-700 hover:bg-white/20'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>
      ) : groupData.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Trophy className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>{uiLang === 'zh' ? '还没有排行数据，去梗百科贡献吧！' : 'No leaderboard data yet. Start contributing!'}</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {activeTab === 'group' && renderGroupTab()}
          {activeTab === 'global' && renderGlobalTab()}
          {activeTab === 'monthly' && renderMonthlyTab()}
        </AnimatePresence>
      )}
    </div>
  );
}
