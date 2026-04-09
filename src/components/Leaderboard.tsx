import React, { useState, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, limit, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Trophy, Medal, Crown, ChevronUp, ChevronDown, Clock, Star, Flame, Globe } from 'lucide-react';

// --- TitleBadge Component ---
export const TitleBadge = ({ titleId, size = 50, animate = true, locked = false }: { titleId: string, size?: number, animate?: boolean, locked?: boolean }) => {
  const uniqueId = useId().replace(/:/g, '');
  
  const getBadgeConfig = () => {
    switch (titleId) {
      case 'w1': return { type: 'world', colors: { rim: ['#5A3800', '#B07A10', '#E8B820', '#9A6800'], face: ['#3A2400', '#906000', '#E0A820', '#FFF0A0', '#A07010', '#503000'] }, text: 'I' };
      case 'w2': return { type: 'world', colors: { rim: ['#1A2028', '#5A6870', '#B8C8D4', '#6A7880'], face: ['#0E1418', '#485860', '#A0B4C0', '#E8F2F8', '#5A6870', '#202830'] }, text: 'II' };
      case 'w3': return { type: 'world', colors: { rim: ['#2A1000', '#703018', '#B06830', '#804020'], face: ['#1A0800', '#602808', '#A86030', '#F0A870', '#804028', '#301000'] }, text: 'III' };
      case 'g1': return { type: 'group', colors: { rim: ['#5A3800', '#B07A10', '#E8B820', '#9A6800'], face: ['#3A2400', '#906000', '#E0A820', '#FFF0A0', '#A07010', '#503000'] } };
      case 'g2': return { type: 'group', colors: { rim: ['#1A2028', '#5A6870', '#B8C8D4', '#6A7880'], face: ['#0E1418', '#485860', '#A0B4C0', '#E8F2F8', '#5A6870', '#202830'] } };
      case 'g3': return { type: 'group', colors: { rim: ['#2A1000', '#703018', '#B06830', '#804020'], face: ['#1A0800', '#602808', '#A86030', '#F0A870', '#804028', '#301000'] } };
      case 'p1': return { type: 'personal', color: '#00c9a7' };
      case 'p2': return { type: 'personal', color: '#4a4e9a' };
      case 'p3': return { type: 'personal', color: '#f5a623' };
      case 'p4': return { type: 'personal', color: '#ff6b6b' };
      default: return { type: 'personal', color: '#888888' };
    }
  };

  const config = getBadgeConfig();
  const isWorld = config.type === 'world';
  const isGroup = config.type === 'group';
  const isPersonal = config.type === 'personal';

  if (locked || isPersonal) {
    const baseColor = locked ? '#555555' : config.color;
    return (
      <svg width={size} height={size} viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="25" cy="25" r="20" fill={baseColor} fillOpacity={locked ? 0.38 : 0.2} />
        <circle cx="25" cy="25" r="18" stroke={baseColor} strokeWidth="1" strokeOpacity={locked ? 0.5 : 0.8} />
        {locked ? (
          <path d="M20 20L30 30M30 20L20 30" stroke="#888" strokeWidth="2" strokeLinecap="round" />
        ) : (
          <circle cx="25" cy="25" r="4" fill={baseColor} />
        )}
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="overflow-visible">
      <defs>
        <radialGradient id={`rim-${uniqueId}`} cx="28%" cy="22%" r="80%">
          {config.colors?.rim.map((c, i) => <stop key={i} offset={`${(i / (config.colors.rim.length - 1)) * 100}%`} stopColor={c} />)}
        </radialGradient>
        <radialGradient id={`face-${uniqueId}`} cx="28%" cy="22%" r="80%">
          {config.colors?.face.map((c, i) => <stop key={i} offset={`${(i / (config.colors.face.length - 1)) * 100}%`} stopColor={c} />)}
        </radialGradient>
        {isWorld && animate && (
          <linearGradient id={`sweep-${uniqueId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="0.8" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        )}
      </defs>

      {/* Outer Rim */}
      <circle cx="25" cy="25" r="23" fill={`url(#rim-${uniqueId})`} />
      
      {/* Rotating Dashed Ring for World Titles */}
      {isWorld && (
        <motion.circle 
          cx="25" cy="25" r="21.5" 
          stroke="#FFF" strokeWidth="0.5" strokeOpacity="0.5" strokeDasharray="6 8" fill="none"
          animate={animate ? { rotate: 360 } : {}}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          style={{ originX: '50%', originY: '50%' }}
        />
      )}

      {/* Face */}
      <circle cx="25" cy="25" r="20" fill={`url(#face-${uniqueId})`} stroke="#000" strokeWidth="0.5" strokeOpacity="0.3" />

      {/* Rays for World Titles */}
      {isWorld && (
        <g opacity="0.35">
          {[...Array(12)].map((_, i) => (
            <line key={i} x1="25" y1="25" x2="25" y2="5" stroke="#FFF" strokeWidth="1" transform={`rotate(${i * 30} 25 25)`} />
          ))}
        </g>
      )}

      {/* Highlights */}
      <ellipse cx="20" cy="15" rx="12" ry="6" fill="#FFF" opacity="0.4" transform="rotate(-20 20 15)" />
      <ellipse cx="16" cy="12" rx="4" ry="2" fill="#FFF" opacity="0.62" transform="rotate(-20 16 12)" />

      {/* Inner Circle & Text for World Titles */}
      {isWorld && (
        <>
          <circle cx="25" cy="25" r="12" fill="#000" fillOpacity="0.2" stroke="#FFF" strokeWidth="0.5" strokeOpacity="0.5" />
          <text x="25" y="29" fontFamily="Playfair Display, serif" fontSize="12" fontWeight="bold" fill="#FFF" textAnchor="middle" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}>
            {config.text}
          </text>
        </>
      )}

      {/* Light Sweep Animation */}
      {isWorld && animate && (
        <motion.rect 
          x="-25" y="0" width="20" height="50" fill={`url(#sweep-${uniqueId})`} transform="skewX(-15)"
          animate={{ x: ['-100%', '250%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
          style={{ mixBlendMode: 'overlay' }}
          clipPath="url(#clip-face)"
        />
      )}
      <clipPath id="clip-face"><circle cx="25" cy="25" r="20" /></clipPath>
    </svg>
  );
};

// --- Leaderboard Component ---
export default function Leaderboard({ defaultTab = 'group', currentUserId, groupId, onUserClick }: { defaultTab?: 'group' | 'global' | 'monthly', currentUserId: string, groupId?: string, onUserClick?: (uid: string) => void }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [groupData, setGroupData] = useState<any[]>([]);
  const [globalData, setGlobalData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState('');

  // Mock Data Fallbacks
  const mockGroupData = [
    { id: 'u1', username: 'Alex Chen', avatar: '', weeklyScore: 1250, weeklyCount: 45, title: 'g1', trend: 2 },
    { id: 'u2', username: 'Sarah Smith', avatar: '', weeklyScore: 980, weeklyCount: 32, title: 'g2', trend: -1 },
    { id: currentUserId, username: 'You', avatar: '', weeklyScore: 850, weeklyCount: 28, title: 'g3', trend: 5 },
    { id: 'u4', username: 'David K.', avatar: '', weeklyScore: 720, weeklyCount: 20, title: 'p2', trend: 0 },
  ];

  const mockGlobalData = [
    { id: 'u5', username: 'LingoMaster', avatar: '', totalScore: 154200, totalCount: 5200, worldTitle: 'w1' },
    { id: 'u6', username: 'PolyglotPro', avatar: '', totalScore: 142000, totalCount: 4800, worldTitle: 'w2' },
    { id: 'u7', username: 'CultureBridge', avatar: '', totalScore: 128500, totalCount: 4100, worldTitle: 'w3' },
    { id: currentUserId, username: 'You', avatar: '', totalScore: 1500, totalCount: 45, worldTitle: null, rank: 1204 },
  ];

  const mockMonthlyData = [
    { id: 'u8', username: 'QualityKing', avatar: '', avgQuality: 98.5, monthlyCount: 120, likes: 450, topEntries: ['YOLO', 'FOMO'] },
    { id: currentUserId, username: 'You', avatar: '', avgQuality: 92.0, monthlyCount: 28, likes: 85, topEntries: ['Chillax'] },
  ];

  useEffect(() => {
    // Timer for weekly reset (Sunday 23:59)
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
      setTimeLeft(`${d}天 ${h}小时 ${m}分 ${s}秒`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Real data fetching would go here. Using mock data for now.
    setGroupData(mockGroupData);
    setGlobalData(mockGlobalData);
    setMonthlyData(mockMonthlyData);
  }, [groupId, currentUserId]);

  const renderGroupTab = () => (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
      <div className="bg-indigo-900/40 border border-indigo-500/30 rounded-2xl p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-indigo-200 text-sm font-medium mb-1">本周结算倒计时</p>
          <p className="text-white font-mono font-bold text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-400" /> {timeLeft}
          </p>
        </div>
        <div className="text-right">
          <p className="text-amber-400 text-sm font-bold">Top 1 奖励</p>
          <p className="text-indigo-100 text-xs mt-1">本周梗王称号 + 100次翻译额度</p>
        </div>
      </div>

      <div className="space-y-2">
        {groupData.map((user, index) => (
          <div 
            key={user.id} 
            onClick={() => onUserClick?.(user.id)}
            className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all ${
              user.id === currentUserId 
                ? 'bg-teal-900/20 border-l-4 border-teal-500 shadow-[inset_0_0_20px_rgba(0,201,167,0.1)]' 
                : 'bg-white/5 hover:bg-white/10 border border-white/5'
            }`}
          >
            <div className="w-8 text-center font-bold text-gray-400">
              {index === 0 ? <Crown className="w-6 h-6 text-amber-400 mx-auto" /> : 
               index === 1 ? <Medal className="w-6 h-6 text-gray-300 mx-auto" /> : 
               index === 2 ? <Medal className="w-6 h-6 text-amber-700 mx-auto" /> : 
               index + 1}
            </div>
            <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden shrink-0">
              {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold">{user.username.charAt(0)}</div>}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-white font-bold truncate flex items-center gap-2">
                {user.username}
                {user.id === currentUserId && <span className="text-[10px] bg-teal-500/20 text-teal-400 px-2 py-0.5 rounded-full">YOU</span>}
              </h4>
              <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-coral-400" /> {user.weeklyCount} 词条</span>
                {user.trend !== 0 && (
                  <span className={`flex items-center ${user.trend > 0 ? 'text-teal-400' : 'text-coral-400'}`}>
                    {user.trend > 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {Math.abs(user.trend)}
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-4">
              <div className="text-right">
                <p className="text-white font-bold font-mono">{user.weeklyScore}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">积分</p>
              </div>
              <TitleBadge titleId={user.title} size={36} />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );

  const renderGlobalTab = () => (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-2 pb-20">
      {globalData.map((user, index) => (
        <div 
          key={user.id}
          onClick={() => onUserClick?.(user.id)}
          className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all ${
            index === 0 ? 'bg-gradient-to-r from-amber-500/20 to-transparent border border-amber-500/30' :
            user.id === currentUserId ? 'bg-teal-900/20 border-l-4 border-teal-500' : 'bg-white/5 hover:bg-white/10 border border-white/5'
          }`}
        >
          <div className={`w-8 text-center font-bold ${index < 3 ? 'text-amber-400' : 'text-gray-400'}`}>
            {user.rank || index + 1}
          </div>
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-gray-700 overflow-hidden shrink-0">
              {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-lg">{user.username.charAt(0)}</div>}
            </div>
            {user.worldTitle && (
              <div className="absolute -bottom-2 -right-2">
                <TitleBadge titleId={user.worldTitle} size={24} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className={`font-bold truncate flex items-center gap-2 ${index === 0 ? 'text-amber-400 text-lg' : 'text-white'}`}>
              {user.username}
              {index === 0 && <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded-full font-black">梗神 ⚡</span>}
            </h4>
            <p className="text-xs text-gray-400 mt-1">累计贡献 {user.totalCount} 词条</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-white font-bold font-mono text-lg">{user.totalScore.toLocaleString()}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">总积分</p>
          </div>
        </div>
      ))}
      
      {/* Fixed Current User Footer if not in top list */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-900/90 backdrop-blur-xl border-t border-white/10 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-4 p-3 rounded-xl bg-teal-900/30 border border-teal-500/30">
          <div className="w-8 text-center font-bold text-teal-400">1204</div>
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 font-bold">Y</div>
          <div className="flex-1">
            <h4 className="text-white font-bold">You</h4>
            <p className="text-xs text-teal-400">距离上一名还差 150 积分</p>
          </div>
          <div className="text-right">
            <p className="text-white font-bold font-mono">1,500</p>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderMonthlyTab = () => (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
      {monthlyData.map((user, index) => (
        <div key={user.id} className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-coral-500 to-amber-500 p-0.5">
                <div className="w-full h-full bg-gray-900 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {user.username.charAt(0)}
                </div>
              </div>
              <div>
                <h4 className="text-white font-bold text-lg flex items-center gap-2">
                  {user.username}
                  {index === 0 && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
                </h4>
                <p className="text-sm text-gray-400">本月贡献 {user.monthlyCount} 词条</p>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center gap-1 bg-green-500/20 text-green-400 px-2 py-1 rounded-lg text-sm font-bold">
                <span>平均质量</span>
                <span>{user.avgQuality}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">获赞 {user.likes} 次</p>
            </div>
          </div>
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-bold">代表作</p>
            <div className="flex flex-wrap gap-2">
              {user.topEntries.map((entry: string) => (
                <span key={entry} className="px-3 py-1 bg-white/10 text-white rounded-lg text-sm">{entry}</span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold font-serif mb-8 text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-amber-400">
          排行榜 Leaderboard
        </h1>

        {/* Tabs */}
        <div className="flex gap-6 mb-8 border-b border-white/10 relative">
          {['group', 'global', 'monthly'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === tab ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {tab === 'group' ? '本周小组榜' : tab === 'global' ? '全球总榜' : '本月明星'}
              {activeTab === tab && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'group' && renderGroupTab()}
          {activeTab === 'global' && renderGlobalTab()}
          {activeTab === 'monthly' && renderMonthlyTab()}
        </AnimatePresence>
      </div>
    </div>
  );
}
