import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Edit2, Camera, X, Bell, LogOut, Check, Loader2, Award, Flame, Star, MessageSquare } from 'lucide-react';
import { doc, updateDoc, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { UserProfile as UserProfileType } from '../App';

// Achievement Badge System
const ACHIEVEMENTS = [
  { id: 'apprentice', name: '梗学徒', nameEn: 'Slang Apprentice', icon: '📝', color: 'blue', requirement: '提交首个词条', condition: (p: UserProfileType) => (p.approvedSlangCount || 0) >= 1 },
  { id: 'observer', name: '文化观察员', nameEn: 'Culture Observer', icon: '👁️', color: 'indigo', requirement: '累计 5 个词条', condition: (p: UserProfileType) => (p.approvedSlangCount || 0) >= 5 },
  { id: 'streak7', name: '周打卡达人', nameEn: '7-Day Streak', icon: '🔥', color: 'orange', requirement: '连续贡献 7 天', condition: (p: UserProfileType) => (p.currentStreak || 0) >= 7 },
  { id: 'multimedia', name: '多模态先锋', nameEn: 'Multimedia Pioneer', icon: '🎬', color: 'purple', requirement: '上传多媒体词条', condition: (p: UserProfileType) => !!p.hasUploadedMedia },
  { id: 'expert', name: '梗百科编辑', nameEn: 'Slang Editor', icon: '✏️', color: 'emerald', requirement: '累计 20 个词条', condition: (p: UserProfileType) => (p.approvedSlangCount || 0) >= 20 },
  { id: 'legend', name: '梗神', nameEn: 'Slang Legend', icon: '⚡', color: 'amber', requirement: '累计 100 个词条', condition: (p: UserProfileType) => (p.approvedSlangCount || 0) >= 100 },
];

const BADGE_COLORS: Record<string, string> = {
  blue: 'from-blue-400 to-blue-600',
  indigo: 'from-indigo-400 to-indigo-600',
  orange: 'from-orange-400 to-orange-600',
  purple: 'from-purple-400 to-purple-600',
  emerald: 'from-emerald-400 to-emerald-600',
  amber: 'from-amber-400 to-amber-600',
};


export function AchievementBadge({ achievement, unlocked, size = 'md' }: { achievement: typeof ACHIEVEMENTS[0], unlocked: boolean, size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = size === 'sm' ? 'w-12 h-12 text-lg' : size === 'lg' ? 'w-20 h-20 text-3xl' : 'w-16 h-16 text-2xl';

  if (!unlocked) {
    return (
      <div className={`${sizeClasses} rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center opacity-40 grayscale`}>
        <span>{achievement.icon}</span>
      </div>
    );
  }

  return (
    <div className={`${sizeClasses} rounded-2xl bg-gradient-to-br ${BADGE_COLORS[achievement.color]} flex items-center justify-center shadow-lg`}>
      <span className="drop-shadow-md">{achievement.icon}</span>
    </div>
  );
}

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
  userProfile,
  isOwnProfile = true,
  uiLang = 'zh',
  onOpenPayment,
  onOpenOnboarding,
  onLogout
}: {
  uid: string,
  userProfile: UserProfileType | null,
  isOwnProfile?: boolean,
  uiLang?: 'en' | 'zh',
  onOpenPayment: (source: string) => void,
  onOpenOnboarding: () => void,
  onLogout?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'entries' | 'vocab' | 'activity'>('entries');
  const [showSettings, setShowSettings] = useState(false);

  // Editable fields
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Real data
  const [entries, setEntries] = useState<any[]>([]);

  const user = auth.currentUser;
  const displayName = user?.displayName || (user?.isAnonymous ? 'Anonymous' : 'User');
  const photoURL = user?.photoURL;

  useEffect(() => {
    if (!user) return;
    // Fetch user's slang contributions
    const q = query(
      collection(db, 'slang_meanings'),
      where('authorId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      alert(uiLang === 'zh' ? '图片不能超过 2MB' : 'Image must be less than 2MB');
      return;
    }

    setIsUploadingAvatar(true);
    setErrorMsg('');
    try {
      const ext = file.name.split('.').pop();
      const storageRef = ref(storage, `avatars/${user.uid}.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateProfile(user, { photoURL: url });
      await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
      window.location.reload();
    } catch (error) {
      console.error('Avatar upload failed:', error);
      setErrorMsg(uiLang === 'zh' ? '头像上传失败，请重试' : 'Avatar upload failed, please try again');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveName = async () => {
    if (!editName.trim() || !user) return;
    setIsSavingName(true);
    setErrorMsg('');
    try {
      await updateProfile(user, { displayName: editName.trim() });
      await updateDoc(doc(db, 'users', user.uid), { displayName: editName.trim() });
      setIsEditingName(false);
      window.location.reload();
    } catch (error) {
      console.error('Name update failed:', error);
      setErrorMsg(uiLang === 'zh' ? '用户名更新失败，请重试' : 'Name update failed, please try again');
    } finally {
      setIsSavingName(false);
    }
  };

  const unlockedAchievements = userProfile ? ACHIEVEMENTS.filter(a => a.condition(userProfile)) : [];

  return (
    <div className="space-y-6">
      {/* Profile Header Card */}
      <div className="bg-white/60 backdrop-blur-md border border-white/60 rounded-3xl p-6 shadow-sm">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative group">
            <div className="w-20 h-20 rounded-2xl bg-blue-100 overflow-hidden shadow-md">
              {photoURL ? (
                <img src={photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-blue-600">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {isOwnProfile && (
              <>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                    className="bg-white border border-blue-300 rounded-lg px-2 py-1 text-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                    maxLength={20}
                    placeholder={displayName}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSavingName}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setIsEditingName(false)} className="p-1 text-gray-400 hover:bg-gray-50 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900 truncate">{displayName}</h2>
                  {isOwnProfile && (
                    <button
                      onClick={() => { setEditName(displayName); setIsEditingName(true); }}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
              {userProfile?.isPro && (
                <span className="px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] font-black rounded-full">Pro</span>
              )}
            </div>

            {/* Title badges */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {userProfile?.titleLevel1 && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg border border-blue-200">{userProfile.titleLevel1}</span>
              )}
              {userProfile?.titleLevel2 && (
                <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-xs font-medium rounded-lg border border-purple-200">{userProfile.titleLevel2}</span>
              )}
              {userProfile?.titleLevel3 && (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-xs font-medium rounded-lg border border-amber-200">{userProfile.titleLevel3}</span>
              )}
            </div>

            {/* Quick Stats Row */}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> {userProfile?.approvedSlangCount || 0} {uiLang === 'zh' ? '词条' : 'entries'}</span>
              <span className="flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-400" /> {userProfile?.currentStreak || 0} {uiLang === 'zh' ? '天连续' : 'day streak'}</span>
            </div>
            {errorMsg && (
              <p className="text-red-500 text-xs mt-2 bg-red-50 px-3 py-1.5 rounded-lg">{errorMsg}</p>
            )}
          </div>

          {/* Settings */}
          {isOwnProfile && (
            <button onClick={() => setShowSettings(true)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: uiLang === 'zh' ? '词条贡献' : 'Contributions', value: userProfile?.approvedSlangCount || 0, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: uiLang === 'zh' ? '信誉分' : 'Reputation', value: userProfile?.reputationScore || 100, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: uiLang === 'zh' ? '连续天数' : 'Streak', value: userProfile?.currentStreak || 0, color: 'text-orange-600', bg: 'bg-orange-50', suffix: uiLang === 'zh' ? ' 天' : 'd' },
        ].map((stat, i) => (
          <div key={i} className={`${stat.bg} border border-white/60 rounded-2xl p-4 text-center`}>
            <p className="text-xs font-medium text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>
              <CountUp to={stat.value} />{stat.suffix}
            </p>
          </div>
        ))}
      </div>

      {/* Achievement Badges */}
      <div className="bg-white/60 backdrop-blur-md border border-white/60 rounded-3xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-500" />
          {uiLang === 'zh' ? '成就勋章' : 'Achievements'}
          <span className="text-xs font-normal text-gray-400">{unlockedAchievements.length}/{ACHIEVEMENTS.length}</span>
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {ACHIEVEMENTS.map((achievement) => {
            const unlocked = userProfile ? achievement.condition(userProfile) : false;
            return (
              <div key={achievement.id} className="flex flex-col items-center gap-1.5 group relative">
                <AchievementBadge achievement={achievement} unlocked={unlocked} size="md" />
                <span className={`text-[10px] font-medium text-center leading-tight ${unlocked ? 'text-gray-700' : 'text-gray-400'}`}>
                  {uiLang === 'zh' ? achievement.name : achievement.nameEn}
                </span>
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-28 bg-gray-800 text-white text-[10px] text-center p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {unlocked ? (uiLang === 'zh' ? '已解锁' : 'Unlocked') : achievement.requirement}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white/60 backdrop-blur-md border border-white/60 rounded-3xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { id: 'entries', label: uiLang === 'zh' ? '我的词条' : 'My Entries' },
            { id: 'activity', label: uiLang === 'zh' ? '活动记录' : 'Activity' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="profileTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          <AnimatePresence mode="wait">
            {activeTab === 'entries' && (
              <motion.div key="entries" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                {entries.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">{uiLang === 'zh' ? '还没有词条，去梗百科贡献吧' : 'No entries yet'}</p>
                  </div>
                ) : (
                  entries.map((entry: any) => (
                    <div key={entry.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{entry.meaning}</p>
                        {entry.example && <p className="text-sm text-gray-500 truncate mt-1">"{entry.example}"</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                          entry.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                          entry.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                          'bg-red-50 text-red-500'
                        }`}>
                          {entry.status === 'approved' ? (uiLang === 'zh' ? '已发布' : 'Published') :
                           entry.status === 'pending' ? (uiLang === 'zh' ? '审核中' : 'Pending') :
                           (uiLang === 'zh' ? '被退回' : 'Rejected')}
                        </span>
                        <span className="text-xs text-gray-400">{entry.upvotes || 0} 👍</span>
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {activeTab === 'activity' && (
              <motion.div key="activity" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-4">
                <div className="text-center py-8">
                  <Star className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">{uiLang === 'zh' ? '活动记录即将上线' : 'Coming soon'}</p>
                </div>
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
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white border-l border-gray-200 z-50 overflow-y-auto shadow-2xl"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur">
                <h2 className="text-xl font-bold text-gray-900">{uiLang === 'zh' ? '设置' : 'Settings'}</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-8">
                {/* Subscription */}
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">{uiLang === 'zh' ? '当前方案' : 'Plan'}</h3>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-lg text-gray-900">{userProfile?.isPro ? 'Pro' : 'Free'}</span>
                      {!userProfile?.isPro && (
                        <button onClick={() => onOpenPayment('default')} className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                          {uiLang === 'zh' ? '升级 Pro' : 'Upgrade'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Account */}
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">{uiLang === 'zh' ? '账号' : 'Account'}</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                      <span className="text-gray-600">{uiLang === 'zh' ? '邮箱' : 'Email'}</span>
                      <span className="text-gray-400 text-xs truncate max-w-[180px]">{user?.email || (user?.isAnonymous ? (uiLang === 'zh' ? '匿名用户' : 'Anonymous') : '-')}</span>
                    </div>
                  </div>
                </div>

                {/* Notifications */}
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">{uiLang === 'zh' ? '通知' : 'Notifications'}</h3>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                    <span className="flex items-center gap-2 text-gray-600"><Bell className="w-4 h-4" /> {uiLang === 'zh' ? '推送通知' : 'Push'}</span>
                    <div className="w-10 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow" />
                    </div>
                  </div>
                </div>

                {/* Logout */}
                <div className="pt-4 border-t border-gray-100">
                  <button
                    onClick={onLogout}
                    className="w-full flex items-center justify-center gap-2 p-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition-colors text-sm font-bold"
                  >
                    <LogOut className="w-4 h-4" /> {uiLang === 'zh' ? '退出登录' : 'Sign Out'}
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
