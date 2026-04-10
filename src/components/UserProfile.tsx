import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Edit2, Camera, X, Bell, LogOut, Check, Loader2, Award, Flame, Star, MessageSquare } from 'lucide-react';
import { doc, updateDoc, collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db, auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { UserProfile as UserProfileType } from '../App';

// Achievement Badge System — game-quality metallic medals
// Reference: 3D Interactive Badge (dev.to), Genshin Impact achievement UI
const ACHIEVEMENTS = [
  { id: 'apprentice', name: '梗学徒', nameEn: 'Apprentice', symbol: '初', tier: 'bronze' as const, requirement: '提交首个词条', condition: (p: UserProfileType) => (p.approvedSlangCount || 0) >= 1 },
  { id: 'observer', name: '文化观察员', nameEn: 'Observer', symbol: '观', tier: 'bronze' as const, requirement: '累计 5 个词条', condition: (p: UserProfileType) => (p.approvedSlangCount || 0) >= 5 },
  { id: 'streak7', name: '周打卡达人', nameEn: 'Streak', symbol: '连', tier: 'silver' as const, requirement: '连续贡献 7 天', condition: (p: UserProfileType) => (p.currentStreak || 0) >= 7 },
  { id: 'multimedia', name: '多模态先锋', nameEn: 'Pioneer', symbol: '媒', tier: 'silver' as const, requirement: '上传多媒体词条', condition: (p: UserProfileType) => !!p.hasUploadedMedia },
  { id: 'expert', name: '梗百科编辑', nameEn: 'Editor', symbol: '编', tier: 'gold' as const, requirement: '累计 20 个词条', condition: (p: UserProfileType) => (p.approvedSlangCount || 0) >= 20 },
  { id: 'legend', name: '梗神', nameEn: 'Legend', symbol: '神', tier: 'gold' as const, requirement: '累计 100 个词条', condition: (p: UserProfileType) => (p.approvedSlangCount || 0) >= 100 },
];

const TIER_METAL = {
  bronze: {
    rim: 'conic-gradient(from 45deg, #8B5E3C, #D4A76A, #B8860B, #6B4226, #C49A6C, #8B5E3C)',
    face: 'radial-gradient(ellipse at 30% 20%, #F5DEB3, #D4A76A 40%, #B8860B 70%, #8B5E3C)',
    inset: 'inset 0 2px 4px rgba(245,222,179,0.5), inset 0 -2px 4px rgba(107,66,38,0.4)',
    outer: '0 4px 8px rgba(139,94,60,0.3), 0 1px 3px rgba(0,0,0,0.2)',
    text: '#5C3310',
    textShadow: '0 1px 0 rgba(245,222,179,0.6)',
    glow: false,
  },
  silver: {
    rim: 'conic-gradient(from 45deg, #71717A, #D4D4D8, #A1A1AA, #52525B, #E4E4E7, #71717A)',
    face: 'radial-gradient(ellipse at 30% 20%, #FAFAFA, #D4D4D8 40%, #A1A1AA 70%, #71717A)',
    inset: 'inset 0 2px 4px rgba(250,250,250,0.6), inset 0 -2px 4px rgba(82,82,91,0.3)',
    outer: '0 4px 8px rgba(113,113,122,0.3), 0 1px 3px rgba(0,0,0,0.15)',
    text: '#27272A',
    textShadow: '0 1px 0 rgba(250,250,250,0.7)',
    glow: false,
  },
  gold: {
    rim: 'conic-gradient(from 45deg, #92700C, #FFD700, #B8960F, #6B5208, #F5D442, #92700C)',
    face: 'radial-gradient(ellipse at 30% 20%, #FFF8DC, #FFD700 35%, #DAA520 65%, #B8860B)',
    inset: 'inset 0 2px 6px rgba(255,248,220,0.7), inset 0 -2px 6px rgba(107,82,8,0.4)',
    outer: '0 4px 12px rgba(255,215,0,0.4), 0 2px 4px rgba(0,0,0,0.2)',
    text: '#5C4A08',
    textShadow: '0 1px 0 rgba(255,248,220,0.8)',
    glow: true,
  },
};

// Injected once for gold animations
const badgeStyles = `
@keyframes medal-shimmer {
  0% { transform: translateX(-200%) rotate(-25deg); }
  100% { transform: translateX(200%) rotate(-25deg); }
}
@keyframes medal-glow {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(255,215,0,0.2), 0 4px 12px rgba(255,215,0,0.3); }
  50% { box-shadow: 0 0 16px 4px rgba(255,215,0,0.4), 0 4px 20px rgba(255,215,0,0.5); }
}
@keyframes medal-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
`;
let badgeStylesInjected = false;

export function AchievementBadge({ achievement, unlocked, size = 'md' }: { achievement: typeof ACHIEVEMENTS[0], unlocked: boolean, size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 44 : size === 'lg' ? 72 : 58;
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 24 : 18;
  const metal = TIER_METAL[achievement.tier];

  if (!badgeStylesInjected && typeof document !== 'undefined') {
    const el = document.createElement('style');
    el.textContent = badgeStyles;
    document.head.appendChild(el);
    badgeStylesInjected = true;
  }

  if (!unlocked) {
    return (
      <div style={{ width: px, height: px }} className="rounded-full relative">
        <div className="absolute inset-0 rounded-full" style={{
          background: 'conic-gradient(from 45deg, #D1D5DB, #E5E7EB, #D1D5DB, #9CA3AF, #E5E7EB, #D1D5DB)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }} />
        <div className="absolute inset-[3px] rounded-full" style={{
          background: 'radial-gradient(ellipse at 30% 20%, #F9FAFB, #E5E7EB 50%, #D1D5DB)',
          boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.5), inset 0 -1px 3px rgba(0,0,0,0.1)',
        }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize, color: '#9CA3AF', fontFamily: "'PingFang SC', 'Noto Sans SC', serif", fontWeight: 800 }} className="select-none">{achievement.symbol}</span>
        </div>
        <div className="absolute inset-0 rounded-full bg-white/30" />
      </div>
    );
  }

  return (
    <div
      style={{
        width: px, height: px,
        animation: metal.glow ? 'medal-float 3s ease-in-out infinite' : undefined,
      }}
      className="rounded-full relative group cursor-pointer transition-transform hover:scale-110"
    >
      {/* Ambient glow (gold only) */}
      {metal.glow && (
        <div className="absolute -inset-[6px] rounded-full" style={{
          animation: 'medal-glow 3s ease-in-out infinite',
        }} />
      )}

      {/* Outer rim — conic gradient for spinning metal look */}
      <div className="absolute inset-0 rounded-full" style={{
        background: metal.rim,
        boxShadow: metal.outer,
      }} />

      {/* Rim notch detail — dashed ring */}
      <div className="absolute inset-[2px] rounded-full" style={{
        border: '1px dashed rgba(255,255,255,0.25)',
      }} />

      {/* Face — radial gradient for convex 3D surface */}
      <div className="absolute inset-[4px] rounded-full" style={{
        background: metal.face,
        boxShadow: metal.inset,
      }} />

      {/* Embossed inner ring */}
      <div className="absolute inset-[8px] rounded-full" style={{
        border: '0.5px solid rgba(255,255,255,0.3)',
        boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.2), 0 0.5px 0 rgba(0,0,0,0.1)',
      }} />

      {/* Specular highlight — top-left ellipse */}
      <div className="absolute rounded-full" style={{
        top: '8%', left: '12%', width: '45%', height: '25%',
        background: 'radial-gradient(ellipse, rgba(255,255,255,0.6) 0%, transparent 70%)',
        transform: 'rotate(-20deg)',
      }} />

      {/* Small bright dot highlight */}
      <div className="absolute rounded-full" style={{
        top: '14%', left: '20%', width: '12%', height: '8%',
        background: 'rgba(255,255,255,0.8)',
        filter: 'blur(1px)',
        transform: 'rotate(-20deg)',
      }} />

      {/* Chinese character — embossed text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="select-none" style={{
          fontSize, fontWeight: 900,
          fontFamily: "'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', serif",
          color: metal.text,
          textShadow: metal.textShadow,
          letterSpacing: '-0.5px',
        }}>
          {achievement.symbol}
        </span>
      </div>

      {/* Animated sweep shimmer (gold only) */}
      {metal.glow && (
        <div className="absolute inset-[4px] rounded-full overflow-hidden pointer-events-none">
          <div style={{
            position: 'absolute',
            inset: '-50%',
            width: '40%',
            height: '200%',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 30%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.1) 70%, transparent 100%)',
            animation: 'medal-shimmer 4s ease-in-out infinite',
            mixBlendMode: 'overlay' as any,
          }} />
        </div>
      )}
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

  // Badge equip
  const [equippedBadge, setEquippedBadge] = useState(userProfile?.equippedBadge || '');
  const [showBadgePicker, setShowBadgePicker] = useState(false);

  const handleEquipBadge = async (badgeId: string) => {
    if (!user) return;
    const newBadge = equippedBadge === badgeId ? '' : badgeId; // toggle off if same
    setEquippedBadge(newBadge);
    setShowBadgePicker(false);
    try {
      await updateDoc(doc(db, 'users', user.uid), { equippedBadge: newBadge });
    } catch (e) {
      console.error('Failed to equip badge:', e);
    }
  };

  const equippedAchievement = ACHIEVEMENTS.find(a => a.id === equippedBadge);

  // Real data
  const [entries, setEntries] = useState<any[]>([]);

  const user = auth.currentUser;
  const [localDisplayName, setLocalDisplayName] = useState(user?.displayName || (user?.isAnonymous ? 'Anonymous' : 'User'));
  const [localPhotoURL, setLocalPhotoURL] = useState(user?.photoURL || null);
  const displayName = localDisplayName;
  const photoURL = localPhotoURL;

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
      setLocalPhotoURL(url);
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
      setLocalDisplayName(editName.trim());
    } catch (error) {
      console.error('Name update failed:', error);
      setErrorMsg(uiLang === 'zh' ? '用户名更新失败，请重试' : 'Name update failed, please try again');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    try {
      const q = query(collection(db, 'words'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const words = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const blob = new Blob([JSON.stringify(words, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lingoflow-wordbook-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const unlockedAchievements = ACHIEVEMENTS; // All achievements unlocked by default

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
                  <h2 className="text-xl font-bold text-gray-900 truncate flex items-center gap-2">
                    {displayName}
                    {equippedAchievement && (
                      <span className="shrink-0" title={uiLang === 'zh' ? equippedAchievement.name : equippedAchievement.nameEn}>
                        <AchievementBadge achievement={equippedAchievement} unlocked={true} size="sm" />
                      </span>
                    )}
                  </h2>
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
        <p className="text-[10px] text-gray-400 mb-3">{uiLang === 'zh' ? '点击勋章佩戴 / 取消佩戴' : 'Click a badge to equip / unequip'}</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {ACHIEVEMENTS.map((achievement) => {
            const unlocked = true;
            const isEquipped = equippedBadge === achievement.id;
            return (
              <button
                key={achievement.id}
                onClick={() => unlocked && handleEquipBadge(achievement.id)}
                className={`flex flex-col items-center gap-1.5 group relative rounded-2xl p-2 transition-all ${
                  isEquipped ? 'bg-blue-50 ring-2 ring-blue-400 shadow-sm' : 'hover:bg-gray-50'
                } ${!unlocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <AchievementBadge achievement={achievement} unlocked={unlocked} size="md" />
                <span className={`text-[10px] font-medium text-center leading-tight ${isEquipped ? 'text-blue-600 font-bold' : unlocked ? 'text-gray-700' : 'text-gray-400'}`}>
                  {uiLang === 'zh' ? achievement.name : achievement.nameEn}
                </span>
                {isEquipped && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-28 bg-gray-800 text-white text-[10px] text-center p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {isEquipped ? (uiLang === 'zh' ? '已佩戴 · 点击取消' : 'Equipped · Click to remove') : unlocked ? (uiLang === 'zh' ? '点击佩戴' : 'Click to equip') : achievement.requirement}
                </div>
              </button>
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
                    <button
                      onClick={handleExportData}
                      className="w-full flex items-center justify-center gap-2 p-3 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition-colors text-sm font-bold mt-2"
                    >
                      {uiLang === 'zh' ? '导出单词本' : 'Export Wordbook'}
                    </button>
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
