import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Edit2, Camera, X, ChevronRight, Bell, Lock, LogOut } from 'lucide-react';
import { TitleBadge } from './Leaderboard';

// Mock Data
const MOCK_USER = {
  username: 'Alex Chen',
  bio: 'Language enthusiast & culture explorer',
  joinedAt: '2025年10月',
  plan: 'free',
  stats: {
    totalContributions: 128,
    totalLikes: 450,
    currentStreak: 12,
    globalRank: 1204,
    weeklyScore: 850,
    reputation: '良好'
  },
  titles: {
    current: 'g1',
    highest: 'w3',
    badges: ['p1', 'p2', 'g3', 'g2', 'g1']
  }
};

const MOCK_ENTRIES = [
  { id: '1', word: 'YOLO', cnDef: '你只活一次', enDef: 'You only live once', status: 'approved', likes: 45, createdAt: '2026-04-01' },
  { id: '2', word: 'FOMO', cnDef: '错失恐惧症', enDef: 'Fear of missing out', status: 'rejected', rejectReason: '例句不够地道', likes: 0, createdAt: '2026-04-05' },
  { id: '3', word: 'Chillax', cnDef: '放轻松', enDef: 'Chill and relax', status: 'pending', likes: 0, createdAt: '2026-04-08' },
];

const MOCK_VOCAB = [
  { id: '1', word: 'Serendipity', definition: '意外发现珍奇事物的本领', savedAt: '2026-04-02', nextReview: '2026-04-10' },
  { id: '2', word: 'Ephemeral', definition: '短暂的', savedAt: '2026-04-03', nextReview: '2026-04-09' },
];

const MOCK_ACTIVITY = [
  { id: '1', type: 'achievement', description: '解锁了「本周梗王」头衔！', timestamp: '2天前', color: 'amber' },
  { id: '2', type: 'contribution', description: '发布了词条「YOLO」并获得 45 个赞', timestamp: '1周前', color: 'teal' },
  { id: '3', type: 'penalty', description: '因提交违规内容，信誉分 -5', timestamp: '2周前', color: 'coral' },
];

const CountUp = ({ to }: { to: number }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let start = 0;
    const duration = 1500;
    const increment = to / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= to) {
        setCount(to);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [to]);

  return <span>{count.toLocaleString()}</span>;
};

export default function UserProfile({ 
  uid, 
  isOwnProfile = true, 
  onOpenPayment, 
  onOpenOnboarding 
}: { 
  uid: string, 
  isOwnProfile?: boolean, 
  onOpenPayment: (source: string) => void, 
  onOpenOnboarding: () => void 
}) {
  const [activeTab, setActiveTab] = useState<'entries' | 'vocab' | 'activity'>('entries');
  const [showSettings, setShowSettings] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioText, setBioText] = useState(MOCK_USER.bio);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20 font-sans">
      {/* Header Section */}
      <div className="relative pt-12 pb-8 px-4 sm:px-8 bg-gradient-to-b from-teal-900/20 to-transparent border-b border-white/5">
        <div className="max-w-4xl mx-auto relative">
          {isOwnProfile && (
            <button 
              onClick={() => setShowSettings(true)}
              className="absolute top-0 right-0 p-2 text-gray-400 hover:text-white bg-white/5 rounded-full transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gray-800 border-4 border-[#0a0a0a] shadow-xl overflow-hidden relative group">
                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-gray-500">
                  {MOCK_USER.username.charAt(0)}
                </div>
                {isOwnProfile && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="w-8 h-8 text-white" />
                  </div>
                )}
              </div>
              {/* Highest Title Halo (if World Title) */}
              {MOCK_USER.titles.highest.startsWith('w') && (
                <div className="absolute inset-[-8px] rounded-full border-2 border-transparent bg-gradient-to-r from-amber-400 via-coral-500 to-teal-400 opacity-50 animate-spin-slow" style={{ maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', maskComposite: 'exclude', WebkitMaskComposite: 'destination-out' }} />
              )}
              {/* Current Title Badge */}
              <div className="absolute -bottom-2 -right-2 bg-[#0a0a0a] rounded-full p-1">
                <TitleBadge titleId={MOCK_USER.titles.current} size={36} />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold font-serif">{MOCK_USER.username}</h1>
                {MOCK_USER.plan === 'pro' ? (
                  <span className="bg-teal-500/20 text-teal-400 text-xs font-bold px-2 py-1 rounded-md border border-teal-500/30">Pro ✦</span>
                ) : (
                  <button onClick={() => onOpenPayment('default')} className="bg-white/10 hover:bg-white/20 text-gray-300 text-xs font-bold px-2 py-1 rounded-md transition-colors flex items-center gap-1">
                    Free <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-4">
                {isEditingBio ? (
                  <input 
                    autoFocus
                    value={bioText}
                    onChange={e => setBioText(e.target.value)}
                    onBlur={() => setIsEditingBio(false)}
                    onKeyDown={e => e.key === 'Enter' && setIsEditingBio(false)}
                    className="bg-white/10 border border-teal-500/50 rounded px-2 py-1 text-sm text-white w-full max-w-xs focus:outline-none"
                    maxLength={50}
                  />
                ) : (
                  <p className="text-gray-400 text-sm flex items-center gap-2">
                    {bioText}
                    {isOwnProfile && (
                      <button onClick={() => setIsEditingBio(true)} className="text-gray-600 hover:text-gray-300"><Edit2 className="w-3 h-3" /></button>
                    )}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-gray-500">
                <span>加入于 {MOCK_USER.joinedAt}</span>
                {MOCK_USER.titles.highest && (
                  <span className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-md">
                    曾获最高: <TitleBadge titleId={MOCK_USER.titles.highest} size={16} animate={false} />
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-12">
          {[
            { label: '词条贡献', value: MOCK_USER.stats.totalContributions, color: 'text-teal-400' },
            { label: '获赞总数', value: MOCK_USER.stats.totalLikes, color: 'text-amber-400' },
            { label: '连续贡献', value: MOCK_USER.stats.currentStreak, suffix: ' 天', color: 'text-white' },
            { label: '全球排名', value: MOCK_USER.stats.globalRank, prefix: '#', color: 'text-white' },
            { label: '本周积分', value: MOCK_USER.stats.weeklyScore, color: 'text-indigo-400' },
            { label: '信誉状态', value: MOCK_USER.stats.reputation, isString: true, color: 'text-green-400' },
          ].map((stat, i) => (
            <div key={i} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-center">
              <p className="text-gray-500 text-xs mb-1">{stat.label}</p>
              <p className={`text-2xl font-bold font-mono ${stat.color}`}>
                {stat.prefix}
                {stat.isString ? stat.value : <CountUp to={stat.value as number} />}
                {stat.suffix}
              </p>
            </div>
          ))}
        </div>

        {/* Badge Wall */}
        <div className="mb-12">
          <h3 className="text-lg font-bold mb-4 font-serif">成就徽章</h3>
          <div className="flex flex-wrap gap-4">
            {['p1', 'p2', 'p3', 'p4'].map(badgeId => {
              const isUnlocked = MOCK_USER.titles.badges.includes(badgeId);
              return (
                <div key={badgeId} className="relative group cursor-pointer">
                  <TitleBadge titleId={badgeId} size={48} locked={!isUnlocked} />
                  {!isUnlocked && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-gray-800 text-xs text-center p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      继续贡献以解锁此成就
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabs Section */}
        <div>
          <div className="flex gap-6 mb-6 border-b border-white/10">
            {[
              { id: 'entries', label: '我的词条' },
              { id: 'vocab', label: '生词本' },
              { id: 'activity', label: '活动记录' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === tab.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div layoutId="profileTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'entries' && (
              <motion.div key="entries" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
                {MOCK_ENTRIES.map(entry => (
                  <div key={entry.id} className={`bg-white/5 border rounded-xl p-4 flex items-center justify-between ${entry.status === 'rejected' ? 'border-coral-500/50 border-l-4' : 'border-white/5'}`}>
                    <div>
                      <h4 className="font-bold text-lg">{entry.word}</h4>
                      <p className="text-sm text-gray-400">{entry.cnDef} · {entry.enDef}</p>
                      {entry.status === 'rejected' && <p className="text-xs text-coral-400 mt-2">退回原因: {entry.rejectReason}</p>}
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-1 rounded-md ${
                        entry.status === 'approved' ? 'bg-teal-500/20 text-teal-400' :
                        entry.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-coral-500/20 text-coral-400'
                      }`}>
                        {entry.status === 'approved' ? '已发布' : entry.status === 'pending' ? '审核中' : '被退回'}
                      </span>
                      <p className="text-xs text-gray-500 mt-2">{entry.likes} 赞</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {activeTab === 'vocab' && (
              <motion.div key="vocab" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
                {MOCK_USER.plan === 'free' && (
                  <div className="bg-gradient-to-r from-teal-900/40 to-transparent border border-teal-500/30 rounded-xl p-4 mb-4 flex items-center justify-between">
                    <p className="text-sm text-teal-100">升级 Pro 解锁艾宾浩斯智能复习</p>
                    <button onClick={() => onOpenPayment('review_system')} className="bg-teal-500 text-black text-xs font-bold px-3 py-1.5 rounded-lg">升级</button>
                  </div>
                )}
                {MOCK_VOCAB.map(word => (
                  <div key={word.id} className="bg-white/5 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-lg">{word.word}</h4>
                      <p className="text-sm text-gray-400">{word.definition}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 mb-1">下次复习</p>
                      <p className="text-sm font-mono text-amber-400">{word.nextReview}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {activeTab === 'activity' && (
              <motion.div key="activity" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="relative pl-4 border-l border-white/10 space-y-6">
                {MOCK_ACTIVITY.map(act => (
                  <div key={act.id} className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-${act.color}-500 shadow-[0_0_10px_currentColor]`} />
                    <p className="text-sm text-white mb-1">{act.description}</p>
                    <p className="text-xs text-gray-500">{act.timestamp}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Settings Drawer */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-[#0f1115] border-l border-white/10 z-50 overflow-y-auto"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0f1115]/90 backdrop-blur">
                <h2 className="text-xl font-bold font-serif">设置</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-8">
                {/* Subscription */}
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">当前方案</h3>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-bold text-lg">{MOCK_USER.plan === 'pro' ? 'Pro ✦' : 'Free'}</span>
                      {MOCK_USER.plan === 'free' && <button onClick={() => onOpenPayment('default')} className="bg-teal-500 text-black text-xs font-bold px-3 py-1.5 rounded-lg">升级 Pro</button>}
                    </div>
                    {MOCK_USER.plan === 'free' && (
                      <div className="text-xs text-gray-400">
                        <p className="mb-2">距永久 Pro 兑换还差 {1500 - MOCK_USER.stats.weeklyScore} 积分</p>
                        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500" style={{ width: `${(MOCK_USER.stats.weeklyScore / 1500) * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Account */}
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">账号设置</h3>
                  <div className="space-y-2">
                    <button className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-sm">
                      <span>修改密码</span> <ChevronRight className="w-4 h-4 text-gray-500" />
                    </button>
                    <button className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-sm">
                      <span>绑定邮箱</span> <span className="text-gray-500 text-xs">alex@example.com</span>
                    </button>
                  </div>
                </div>

                {/* Notifications */}
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">通知设置</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl text-sm">
                      <span className="flex items-center gap-2"><Bell className="w-4 h-4" /> 推送通知</span>
                      <div className="w-10 h-6 bg-teal-500 rounded-full relative cursor-pointer">
                        <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="pt-8 border-t border-white/5">
                  <button className="w-full flex items-center justify-center gap-2 p-3 bg-coral-500/10 text-coral-500 hover:bg-coral-500/20 rounded-xl transition-colors text-sm font-bold">
                    <LogOut className="w-4 h-4" /> 退出登录
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
