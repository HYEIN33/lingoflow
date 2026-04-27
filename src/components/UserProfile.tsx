import React, { useState, useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Edit2, Camera, X, Bell, LogOut, Check, Loader2, Award, Flame, Star, MessageSquare, Download, Sparkles, ChevronRight, Zap } from 'lucide-react';
import { doc, updateDoc, collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db, auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { UserProfile as UserProfileType } from '../App';
import AvatarCropperModal from './AvatarCropperModal';
import OnboardingChecklistModal from './OnboardingChecklistModal';

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

/**
 * AchievementBadge — redesigned 2026-04-21.
 *
 * Previous: round metal coin with an embossed 初/观/连/媒/编/神 Chinese
 * character. Felt like a cheap gamified sticker and clashed with the
 * liquid-glass + Clash Display brand language.
 *
 * New: hex glass shield. Bronze = warm white glass + amber rim; silver =
 * cold blue glass + blue rim; gold = deep navy glass + conic gold rim with
 * ambient glow + gentle float. Icons use lucide glyphs (star / eye / zap /
 * image / pencil / sparkles) per achievement semantic. Locked state is a
 * frosted hex with a lock icon.
 *
 * The `achievement.symbol` field is ignored — we now map by id.
 */
const ACHIEVEMENT_ICONS: Record<string, (size: number) => React.ReactNode> = {
  apprentice: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.5 6.5L21 10l-5 4.5L17 22l-5-3-5 3 1-7.5L3 10l6.5-1.5z"/></svg>
  ),
  observer: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  ),
  streak7: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
  ),
  multimedia: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>
  ),
  expert: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
  ),
  legend: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 3 1.5 3L11 7 8 9l1 4-3-2-3 2 1-4-3-2 3.5-1L6 3z"/><path d="m18 3 1.5 3L23 7l-3 2 1 4-3-2-3 2 1-4-3-2 3.5-1L18 3z"/><path d="M12 14v8"/><path d="m9 20 3-2 3 2"/></svg>
  ),
};

const hexClipStyle: React.CSSProperties = {
  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
};

const hexGlassByTier = {
  bronze: {
    rim: 'linear-gradient(135deg, #E8C088 0%, #FFF5E4 40%, #C49A5C 100%)',
    glass: 'linear-gradient(135deg, rgba(255,251,244,0.92) 0%, rgba(248,238,223,0.68) 100%), radial-gradient(ellipse at 30% 25%, rgba(224,192,148,0.45) 0%, transparent 60%)',
    icon: '#5C3A0A',
    shadow: '0 8px 20px rgba(200,140,60,0.22)',
    glow: false,
  },
  silver: {
    rim: 'linear-gradient(135deg, #89A3F0 0%, #FFFFFF 45%, #5B7FE8 100%)',
    glass: 'linear-gradient(135deg, rgba(236,242,255,0.92) 0%, rgba(210,220,245,0.68) 100%), radial-gradient(ellipse at 30% 25%, rgba(91,127,232,0.45) 0%, transparent 60%)',
    icon: '#5B7FE8',
    shadow: '0 8px 20px rgba(91,127,232,0.22)',
    glow: false,
  },
  gold: {
    rim: 'conic-gradient(from 135deg, #FFE293 0deg, #FFFFFF 60deg, #FFCA5A 120deg, #FFE293 220deg, #FFFFFF 320deg, #FFE293 360deg)',
    glass: 'linear-gradient(135deg, rgba(30,40,80,0.92) 0%, rgba(10,14,26,0.85) 100%), radial-gradient(ellipse at 30% 25%, rgba(255,215,130,0.35) 0%, transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(91,127,232,0.5) 0%, transparent 55%)',
    icon: '#FFE8A8',
    shadow: '0 8px 20px rgba(91,127,232,0.22)',
    glow: true,
  },
} as const;

// Map DHH's tier names to the new hex-glass tiers
const TIER_MAP: Record<string, keyof typeof hexGlassByTier> = {
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
};

export function AchievementBadge({
  achievement,
  unlocked,
  size = 'md',
}: {
  achievement: typeof ACHIEVEMENTS[0];
  unlocked: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  // Sizes: hex shield is taller than it is wide (6:7 ratio from the polygon)
  const width = size === 'sm' ? 56 : size === 'lg' ? 96 : 72;
  const height = Math.round(width * (7 / 6));
  const iconSize = size === 'sm' ? 20 : size === 'lg' ? 32 : 26;

  if (!badgeStylesInjected && typeof document !== 'undefined') {
    const el = document.createElement('style');
    el.textContent = badgeStyles;
    document.head.appendChild(el);
    badgeStylesInjected = true;
  }

  const iconRenderer = ACHIEVEMENT_ICONS[achievement.id];

  if (!unlocked) {
    return (
      <div
        style={{ width, height, filter: 'drop-shadow(0 3px 8px rgba(10,14,26,0.06))' }}
        className="relative transition-transform"
      >
        {/* frosted rim */}
        <div
          style={{
            ...hexClipStyle,
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(10,14,26,0.15), rgba(255,255,255,0.6), rgba(10,14,26,0.15))',
            padding: '1.5px',
          }}
        >
          <div
            style={{
              ...hexClipStyle,
              position: 'absolute',
              inset: '1.5px',
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.3) 100%)',
              backdropFilter: 'blur(30px) saturate(180%)',
              WebkitBackdropFilter: 'blur(30px) saturate(180%)',
            }}
          />
        </div>
        {/* lock icon */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'rgba(10,14,26,0.35)' }}>
          <svg width={iconSize - 2} height={iconSize - 2} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        {/* gentle gloss */}
        <div
          style={{
            ...hexClipStyle,
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(155deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 45%)',
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  const tierKey = TIER_MAP[achievement.tier] || 'bronze';
  const tier = hexGlassByTier[tierKey];

  return (
    <div
      style={{
        width,
        height,
        filter: `drop-shadow(${tier.shadow})`,
        animation: tier.glow ? 'medal-float 4s ease-in-out infinite' : undefined,
      }}
      className="relative group cursor-pointer transition-transform hover:-translate-y-0.5"
    >
      {/* gold ambient glow */}
      {tier.glow && (
        <div
          style={{
            position: 'absolute',
            inset: '-8px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,215,130,0.25) 0%, transparent 60%)',
            animation: 'medal-glow 4s ease-in-out infinite',
            zIndex: -1,
          }}
        />
      )}

      {/* rim */}
      <div
        style={{
          ...hexClipStyle,
          position: 'absolute',
          inset: 0,
          background: tier.rim,
          padding: '1.5px',
        }}
      >
        {/* glass face */}
        <div
          style={{
            ...hexClipStyle,
            position: 'absolute',
            inset: '1.5px',
            background: tier.glass,
            backdropFilter: 'blur(30px) saturate(180%)',
            WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          }}
        />
      </div>

      {/* icon */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ color: tier.icon }}>
        {iconRenderer ? iconRenderer(iconSize) : null}
      </div>

      {/* specular highlight */}
      <div
        style={{
          ...hexClipStyle,
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(155deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 45%)',
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
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
  // showSettings state removed — gear button now dispatches a global
  // `memeflow:open-settings` event that SettingsModal listens for.
  const [showChecklist, setShowChecklist] = useState(false);

  // 新手任务 checklist 进度 —— 来源优先级：
  //   1. localStorage(`onboarding_checklist`)：OnboardingChecklist 组件沿用的 store，
  //      translate/slang/wordbook/review 页面在用户完成动作时会调 markOnboardingStep
  //   2. userProfile 字段作为兜底：有词条计数 / hasCompletedOnboarding 就认为对应项已完成
  //   3. 字段都没有 → done = false（按未完成展示）
  // 设计：读一次 + 监听 onboarding-update 自定义事件（OnboardingChecklist 里 dispatch 过）
  const [onboardLocal, setOnboardLocal] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('onboarding_checklist');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    const handler = () => {
      try {
        const raw = localStorage.getItem('onboarding_checklist');
        setOnboardLocal(raw ? JSON.parse(raw) : {});
      } catch {
        setOnboardLocal({});
      }
    };
    window.addEventListener('onboarding-update', handler);
    window.addEventListener('storage', handler); // 同 tab 跨组件变化靠 onboarding-update；跨 tab 靠 storage
    return () => {
      window.removeEventListener('onboarding-update', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const allDone = !!userProfile?.hasCompletedOnboarding;
  const checklistItems = [
    {
      key: 'search_slang',
      label: '搜索一个梗',
      labelEn: 'Search a slang',
      done: allDone || !!onboardLocal['search_slang'],
    },
    {
      key: 'translate_word',
      label: '翻译一个单词',
      labelEn: 'Translate a word',
      done:
        allDone ||
        !!onboardLocal['translate_word'] ||
        (userProfile?.translationCount ?? 0) > 0,
    },
    {
      key: 'save_wordbook',
      label: '保存到单词本',
      labelEn: 'Save to wordbook',
      done: allDone || !!onboardLocal['save_wordbook'],
    },
    {
      key: 'contribute_entry',
      label: '贡献一个词条',
      labelEn: 'Contribute an entry',
      done:
        allDone ||
        !!onboardLocal['contribute_entry'] ||
        (userProfile?.approvedSlangCount ?? 0) >= 1,
    },
    {
      key: 'complete_review',
      label: '完成一次复习',
      labelEn: 'Complete a review',
      done: allDone || !!onboardLocal['complete_review'],
    },
  ];
  const checklistDone = checklistItems.filter((i) => i.done).length;
  const checklistTotal = checklistItems.length;

  // Editable fields
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
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
      toast.error(uiLang === 'zh' ? '装备徽章失败' : 'Failed to equip badge');
      Sentry.captureException(e, { tags: { component: 'UserProfile', op: 'firestore.write', field: 'equippedBadge' } });
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

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(uiLang === 'zh' ? '图片不能超过 2MB' : 'Image must be less than 2MB');
      return;
    }
    // 打开裁剪 modal；真正的 storage 上传在 handleAvatarConfirm 里做
    setPendingAvatarFile(file);
    // 清掉 input value，保证同一张图再次选中时仍触发 change
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleAvatarConfirm = async (blob: Blob) => {
    if (!user) return;
    setIsUploadingAvatar(true);
    setErrorMsg('');
    try {
      const storageRef = ref(storage, `avatars/${user.uid}.jpg`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await updateProfile(user, { photoURL: url });
      await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
      setLocalPhotoURL(url);
      setPendingAvatarFile(null);
    } catch (error) {
      console.error('Avatar upload failed:', error);
      setErrorMsg(uiLang === 'zh' ? '头像上传失败，请重试' : 'Avatar upload failed, please try again');
      Sentry.captureException(error, { tags: { component: 'UserProfile', op: 'storage.upload', field: 'photoURL' } });
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
      Sentry.captureException(error, { tags: { component: 'UserProfile', op: 'firestore.write', field: 'displayName' } });
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
      a.download = `memeflow-wordbook-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(uiLang === 'zh' ? '导出失败' : 'Export failed');
      Sentry.captureException(error, { tags: { component: 'UserProfile', op: 'firestore.read', purpose: 'export' } });
    }
  };

  const unlockedAchievements = ACHIEVEMENTS.filter(a => userProfile && a.condition(userProfile));

  // 身份副标题 — 优先用已装备成就的中英文名；没装备就回退到"梗新人 / Slang Newbie"
  const profileTitle = equippedAchievement
    ? (uiLang === 'zh' ? equippedAchievement.name : equippedAchievement.nameEn)
    : (uiLang === 'zh' ? '梗新人' : 'Slang Newbie');

  return (
    <div className="space-y-6">
      {/* ============ PROFILE MAIN CARD (glass-thick) ============ */}
      <div className="glass-thick" style={{ borderRadius: 28, overflow: 'hidden' }}>
        {/* ---- profile-head ---- */}
        <div
          className="relative flex items-center flex-wrap"
          style={{ padding: '32px 36px 28px', paddingRight: 60, gap: 24 }}
        >
          {/* Avatar — 92×92 圆形蓝渐变 + 右下 camera-btn */}
          <div className="relative shrink-0">
            <div
              className="rounded-full text-white inline-flex items-center justify-center overflow-hidden"
              style={{
                width: 92,
                height: 92,
                background: 'linear-gradient(135deg, #89A3F0, #5B7FE8)',
                fontFamily: '"Clash Display", system-ui, sans-serif',
                fontWeight: 700,
                fontSize: 38,
                boxShadow: '0 8px 20px rgba(91,127,232,0.35)',
              }}
            >
              {photoURL ? (
                <img src={photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span>{displayName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            {isOwnProfile && (
              <>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute rounded-full inline-flex items-center justify-center"
                  title={uiLang === 'zh' ? '更换头像' : 'Change avatar'}
                  style={{
                    bottom: -4,
                    right: -4,
                    width: 32,
                    height: 32,
                    background: '#fff',
                    border: '2px solid rgba(91,127,232,0.25)',
                    color: 'var(--blue-accent)',
                    cursor: 'pointer',
                  }}
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
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

          {/* Meta */}
          <div className="flex-1 min-w-[240px]">
            {/* name-row: h1 + edit-icon + Pro badge */}
            <div className="flex items-center gap-[10px] mb-1.5">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                    className="bg-white border border-[rgba(91,127,232,0.4)] rounded-lg px-2 py-1 text-lg font-bold text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[#5B7FE8] w-40"
                    maxLength={20}
                    placeholder={displayName}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSavingName}
                    className="p-1 text-[#5B7FE8] hover:bg-[rgba(91,127,232,0.08)] rounded-lg"
                  >
                    {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setIsEditingName(false)} className="p-1 text-[var(--ink-muted)] hover:bg-[rgba(10,14,26,0.04)] rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <h1
                    className="m-0 truncate"
                    style={{
                      fontFamily: '"Clash Display", system-ui, sans-serif',
                      fontWeight: 700,
                      fontSize: 28,
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {displayName}
                  </h1>
                  {isOwnProfile && (
                    <button
                      onClick={() => { setEditName(displayName); setIsEditingName(true); }}
                      className="p-1 transition-colors"
                      style={{ background: 'transparent', border: 0, color: 'rgba(10,14,26,0.35)', cursor: 'pointer' }}
                      title={uiLang === 'zh' ? '编辑名字' : 'Edit name'}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--blue-accent)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(10,14,26,0.35)')}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
              {userProfile?.isPro && (
                <span
                  className="inline-flex items-center gap-1 text-white"
                  style={{
                    padding: '3px 10px',
                    borderRadius: 9999,
                    background: 'linear-gradient(135deg, #F0D78A, #E88B7D)',
                    fontFamily: '"Clash Display", system-ui, sans-serif',
                    fontStyle: 'italic',
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: '0.02em',
                  }}
                >
                  <Zap className="w-2.5 h-2.5" fill="currentColor" strokeWidth={0} />
                  Pro
                </span>
              )}
            </div>

            {/* title 身份副标题 */}
            <p
              className="m-0 mb-[10px]"
              style={{
                fontFamily: '"Noto Serif SC", serif',
                fontSize: 13,
                color: 'var(--blue-accent)',
              }}
            >
              {profileTitle}
            </p>

            {/* ruby-row — 4 个指标 */}
            <div className="flex flex-wrap gap-x-[18px] gap-y-[6px]">
              {(() => {
                const rubyStrong: React.CSSProperties = {
                  fontFamily: '"Clash Display", system-ui, sans-serif',
                  fontWeight: 700,
                  fontSize: 18,
                  color: 'var(--ink)',
                  letterSpacing: '-0.02em',
                };
                const rubyWrap: React.CSSProperties = {
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  fontFamily: '"Noto Serif SC", serif',
                  fontSize: 13,
                  color: 'rgba(10,14,26,0.72)',
                };
                return (
                  <>
                    <div style={rubyWrap}>
                      <strong style={rubyStrong}>{userProfile?.approvedSlangCount || 0}</strong>
                      {uiLang === 'zh' ? '贡献' : 'contributions'}
                    </div>
                    <div style={rubyWrap}>
                      <strong style={{ ...rubyStrong, color: '#E55B28' }}>{userProfile?.currentStreak || 0}</strong>
                      {uiLang === 'zh' ? '天连续' : 'day streak'}
                    </div>
                    <div style={rubyWrap}>
                      <strong style={rubyStrong}>{userProfile?.reputationScore ?? 100}</strong>
                      {uiLang === 'zh' ? '声望' : 'rep'}
                    </div>
                    <div style={rubyWrap}>
                      <strong style={rubyStrong}>{unlockedAchievements.length}</strong>
                      {uiLang === 'zh' ? '徽章' : 'badges'}
                    </div>
                  </>
                );
              })()}
            </div>

            {errorMsg && (
              <p className="text-[var(--red-warn)] text-xs mt-2 bg-[rgba(229,56,43,0.08)] px-3 py-1.5 rounded-lg">{errorMsg}</p>
            )}
          </div>

          {/* Settings 齿轮 — absolute 右上。点击派发全局事件 memeflow:open-settings，
              由 header 的 SettingsModal 监听并打开，避免两份 Settings UI 并存。 */}
          {isOwnProfile && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('memeflow:open-settings'))}
              className="absolute p-2 text-[var(--ink-muted)] hover:text-[var(--ink-body)] hover:bg-[rgba(10,14,26,0.04)] rounded-xl transition-colors"
              style={{ top: 18, right: 18 }}
              title={uiLang === 'zh' ? '设置' : 'Settings'}
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ---- Achievement Badges (合并进主卡，border-top 分段) ---- */}
        <div style={{ padding: '24px 36px 28px', borderTop: '1px solid var(--ink-hairline)' }}>
        <div className="flex items-baseline justify-between flex-wrap gap-x-3 gap-y-1 mb-[18px]">
          <h3
            className="m-0 inline-flex items-center gap-2 whitespace-nowrap"
            style={{
              fontFamily: '"Clash Display", system-ui, sans-serif',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 15,
              color: 'rgba(10,14,26,0.68)',
            }}
          >
            — {uiLang === 'zh' ? 'achievements · 成就徽章' : 'achievements'}
            <span className="text-[11px] font-mono-meta font-semibold tracking-[0.08em] text-[var(--ink-muted)] ml-1">{unlockedAchievements.length}/{ACHIEVEMENTS.length}</span>
          </h3>
          <span style={{ fontFamily: '"Noto Serif SC", serif', fontSize: 12.5, color: 'rgba(10,14,26,0.68)' }}>
            {uiLang === 'zh' ? '点击徽章装备' : 'Click a badge to equip'}
          </span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-[18px]">
          {ACHIEVEMENTS.map((achievement) => {
            const unlocked = userProfile ? achievement.condition(userProfile) : false;
            const isEquipped = equippedBadge === achievement.id;
            return (
              <button
                key={achievement.id}
                onClick={() => unlocked && handleEquipBadge(achievement.id)}
                className={`flex flex-col items-center gap-1.5 group relative rounded-2xl p-2 transition-all ${
                  isEquipped ? 'bg-[rgba(91,127,232,0.08)] ring-2 ring-[rgba(91,127,232,0.5)] shadow-sm' : 'hover:bg-[rgba(10,14,26,0.04)]'
                } ${!unlocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <AchievementBadge achievement={achievement} unlocked={unlocked} size="md" />
                <span className={`font-zh-serif text-[13px] font-medium text-center leading-tight ${isEquipped ? 'text-[#5B7FE8] font-bold' : unlocked ? 'text-[var(--ink-body)]' : 'text-[var(--ink-muted)]'}`}>
                  {uiLang === 'zh' ? achievement.name : achievement.nameEn}
                </span>
                {!unlocked && (
                  <span className="text-[9px] text-[var(--ink-muted)] text-center leading-tight">{achievement.requirement}</span>
                )}
                {isEquipped && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#5B7FE8] rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-28 bg-[var(--ink)] text-white text-[10px] text-center p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {isEquipped ? (uiLang === 'zh' ? '已佩戴 · 点击取消' : 'Equipped · Click to remove') : unlocked ? (uiLang === 'zh' ? '点击佩戴' : 'Click to equip') : achievement.requirement}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Contribution history (contrib-history 分段) ---- */}
      <div style={{ padding: '20px 36px 4px', borderTop: '1px solid var(--ink-hairline)' }}>
        {/* 保留 tab 头（"我的词条 / 活动记录"切换）— 放在 section 标题位置 */}
        <div className="flex items-center justify-between mb-[14px] flex-wrap gap-2">
          <h3
            className="m-0"
            style={{
              fontFamily: '"Clash Display", system-ui, sans-serif',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 15,
              color: 'rgba(10,14,26,0.68)',
            }}
          >
            — {uiLang === 'zh' ? 'recent contributions · 贡献历史' : 'recent contributions'}
          </h3>
          <div className="flex gap-1">
            {[
              { id: 'entries', label: uiLang === 'zh' ? '我的词条' : 'My Entries' },
              { id: 'activity', label: uiLang === 'zh' ? '活动记录' : 'Activity' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-1 px-3 text-xs font-semibold transition-colors relative rounded-lg ${activeTab === tab.id ? 'text-[#5B7FE8] bg-[rgba(91,127,232,0.08)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-body)]'}`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div layoutId="profileTab" className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#0A0E1A]" />
                )}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'entries' && (
            <motion.div key="entries" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
              {entries.length === 0 ? (
                <div
                  className="text-center p-10 rounded-[12px]"
                  style={{
                    background: 'rgba(255,255,255,0.4)',
                    border: '1px dashed var(--ink-hairline)',
                  }}
                >
                  <MessageSquare className="w-10 h-10 text-[var(--ink-subtle)] mx-auto mb-3" />
                  <p
                    className="text-sm m-0"
                    style={{ fontFamily: '"Noto Serif SC", serif', color: 'rgba(10,14,26,0.62)' }}
                  >
                    {uiLang === 'zh' ? '还没有词条，去梗百科贡献吧' : 'No entries yet — contribute in Slang Encyclopedia'}
                  </p>
                </div>
              ) : (
                entries.map((entry: any) => {
                  // entries 里没有 term 字段（meaning 才是条目解释），按 fallback：slangTerm → term → id 前 8 位
                  const term = entry.slangTerm || entry.term || (entry.id || '').slice(0, 8);
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-[12px] p-[12px_14px] rounded-[12px]"
                      style={{
                        background: 'rgba(255,255,255,0.5)',
                        border: '1px solid rgba(255,255,255,0.65)',
                      }}
                    >
                      <span
                        style={{
                          flex: '0 0 110px',
                          fontFamily: '"Clash Display", system-ui, sans-serif',
                          fontStyle: 'italic',
                          fontWeight: 600,
                          fontSize: 15,
                          color: 'var(--blue-accent)',
                        }}
                        className="truncate"
                      >
                        {term}
                      </span>
                      <span
                        className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden"
                        style={{
                          fontFamily: '"Noto Serif SC", serif',
                          fontSize: 13,
                          color: 'rgba(10,14,26,0.72)',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {entry.meaning || (uiLang === 'zh' ? '（无描述）' : '(no description)')}
                      </span>
                      <span
                        className="shrink-0 flex items-center gap-2"
                        style={{
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          fontSize: 11,
                          color: 'rgba(10,14,26,0.5)',
                        }}
                      >
                        ▲ <strong style={{ color: 'var(--blue-accent)' }}>{entry.upvotes || 0}</strong> · AI {entry.aiQuality ?? '--'}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium shrink-0 ${
                        entry.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                        entry.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                        'bg-red-50 text-red-500'
                      }`}>
                        {entry.status === 'approved' ? (uiLang === 'zh' ? '已发布' : 'Published') :
                         entry.status === 'pending' ? (uiLang === 'zh' ? '审核中' : 'Pending') :
                         (uiLang === 'zh' ? '被退回' : 'Rejected')}
                      </span>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {activeTab === 'activity' && (
            <motion.div key="activity" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-4">
              <div className="text-center py-8">
                <Star className="w-10 h-10 text-[var(--ink-subtle)] mx-auto mb-3" />
                <p className="text-[var(--ink-muted)] text-sm">{uiLang === 'zh' ? '活动记录即将上线' : 'Coming soon'}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---- Subscription (合并进主卡，border-top 分段) ---- */}
      <div style={{ padding: '22px 28px', borderTop: '1px solid var(--ink-hairline)', marginTop: 14 }}>
        <h3
          className="m-0 mb-[14px]"
          style={{
            fontFamily: '"Clash Display", system-ui, sans-serif',
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 15,
            color: 'rgba(10,14,26,0.68)',
          }}
        >
          — {uiLang === 'zh' ? 'subscription · 订阅状态' : 'subscription'}
        </h3>
        <div
          className="flex justify-between items-center gap-4 flex-wrap"
          style={{
            padding: '16px 18px',
            background: 'linear-gradient(135deg, rgba(91,127,232,0.1), rgba(137,163,240,0.08))',
            border: '1px solid rgba(91,127,232,0.22)',
            borderRadius: 14,
          }}
        >
          <div>
            <div
              className="inline-flex items-center gap-1.5"
              style={{
                fontFamily: '"Clash Display", system-ui, sans-serif',
                fontWeight: 700,
                fontSize: 18,
                color: 'var(--blue-accent)',
              }}
            >
              <Zap className="w-4 h-4" fill="currentColor" strokeWidth={0} />
              {userProfile?.isPro
                ? (uiLang === 'zh' ? 'MemeFlow Pro · 年付' : 'MemeFlow Pro · Yearly')
                : (uiLang === 'zh' ? 'Free · 免费版' : 'Free')}
            </div>
            <div
              className="mt-1"
              style={{
                fontFamily: '"Noto Sans SC", system-ui, sans-serif',
                fontWeight: 500,
                fontSize: 13,
                color: 'var(--ink-body)',
                letterSpacing: '0.01em',
              }}
            >
              {userProfile?.isPro
                ? (() => {
                    // 下次续费日期：当前没有 Firestore 字段存，用"今日 + 1 年"作占位显示，
                    // 避免显示"长期有效"造成误解；等后续接 Stripe/订阅才有真日期。
                    const next = new Date();
                    next.setFullYear(next.getFullYear() + 1);
                    const label = uiLang === 'zh'
                      ? `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
                      : next.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                    return uiLang === 'zh' ? `¥336 / 年 · 下次续费 ${label}` : `¥336 / yr · renews ${label}`;
                  })()
                : (uiLang === 'zh' ? '升级 Pro 解锁无限翻译 / 课堂同传无限时长' : 'Upgrade to unlock unlimited translations')}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {userProfile?.isPro ? (
              <>
                <button
                  onClick={() => toast.info(uiLang === 'zh' ? '即将开放 · 请邮件联系 caizewei11@gmail.com' : 'Coming soon · Email caizewei11@gmail.com')}
                  className="transition-colors"
                  style={{
                    padding: '8px 14px',
                    fontSize: 12.5,
                    background: 'transparent',
                    border: '1px solid var(--border-solid-strong)',
                    color: 'var(--ink-body)',
                    borderRadius: 10,
                    fontFamily: '"Noto Sans SC", system-ui, sans-serif',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {uiLang === 'zh' ? '管理订阅' : 'Manage'}
                </button>
                <button
                  onClick={() => toast.info(uiLang === 'zh' ? '即将开放 · 请邮件联系 caizewei11@gmail.com' : 'Coming soon · Email caizewei11@gmail.com')}
                  className="transition-colors"
                  style={{
                    padding: '8px 14px',
                    fontSize: 12.5,
                    background: 'transparent',
                    border: '1px solid rgba(229,56,43,0.25)',
                    color: 'var(--red-warn)',
                    borderRadius: 10,
                    fontFamily: '"Noto Sans SC", system-ui, sans-serif',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {uiLang === 'zh' ? '取消订阅' : 'Cancel'}
                </button>
              </>
            ) : (
              <button
                onClick={() => onOpenPayment('profile-subscription')}
                className="transition-colors"
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  background: 'var(--ink)',
                  border: '1px solid var(--ink)',
                  color: '#fff',
                  borderRadius: 12,
                  fontFamily: '"Noto Sans SC", system-ui, sans-serif',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {uiLang === 'zh' ? '立即升级 Pro' : 'Upgrade to Pro'}
              </button>
            )}
          </div>
        </div>
      </div>
      {/* ============ END PROFILE MAIN CARD ============ */}
      </div>

      {/* ============ ONBOARDING CHECKLIST entry ============ */}
      {isOwnProfile && (
        <button
          onClick={() => setShowChecklist(true)}
          className="surface !rounded-[14px] w-full flex items-center gap-3 transition-colors hover:bg-[rgba(91,127,232,0.04)]"
          style={{ padding: '16px 20px', cursor: 'pointer', textAlign: 'left' }}
        >
          <span
            className="inline-flex items-center justify-center rounded-full shrink-0"
            style={{
              width: 32,
              height: 32,
              background: 'rgba(91,127,232,0.1)',
              color: 'var(--blue-accent)',
            }}
          >
            <Sparkles className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div
              style={{
                fontFamily: '"Clash Display", system-ui, sans-serif',
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: 14,
                color: 'var(--ink)',
              }}
            >
              {uiLang === 'zh' ? '新手任务 · Getting Started' : 'Getting Started · 新手任务'}
            </div>
            <div
              className="mt-0.5"
              style={{
                fontFamily: '"Noto Serif SC", serif',
                fontSize: 12,
                color: 'var(--ink-muted)',
              }}
            >
              {checklistDone === checklistTotal
                ? (uiLang === 'zh' ? '✓ 已完成' : '✓ Completed')
                : (uiLang === 'zh'
                    ? `${checklistDone}/${checklistTotal} 已完成`
                    : `${checklistDone}/${checklistTotal} completed`)}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
        </button>
      )}

      {/* ============ DATA EXPORT ============ */}
      {isOwnProfile && (
        <div
          className="surface !rounded-[14px] flex items-center gap-4 flex-wrap"
          style={{ padding: '22px 26px' }}
        >
          <Download
            className="shrink-0"
            style={{ width: 28, height: 28, color: 'var(--blue-accent)', strokeWidth: 1.8 }}
          />
          <div className="flex-1 min-w-[240px]">
            <div
              style={{
                fontFamily: '"Clash Display", system-ui, sans-serif',
                fontWeight: 600,
                fontSize: 15,
                marginBottom: 2,
              }}
            >
              {uiLang === 'zh' ? '导出我的数据' : 'Export my data'}
            </div>
            <p
              className="m-0"
              style={{
                fontFamily: '"Noto Serif SC", serif',
                fontSize: 13,
                color: 'rgba(10,14,26,0.62)',
                lineHeight: 1.7,
              }}
            >
              {uiLang === 'zh'
                ? 'JSON 格式，当前仅包含单词本，后续会扩展到贡献词条、搜索历史、复习记录、课堂笔记。符合 GDPR 可移植性要求。'
                : 'JSON format. Currently includes wordbook only; will expand to contributions, search history, reviews and class notes. GDPR-portable.'}
            </p>
          </div>
          <button
            onClick={handleExportData}
            className="transition-colors"
            style={{
              padding: '11px 18px',
              fontSize: 13,
              background: 'var(--ink)',
              border: '1px solid var(--ink)',
              color: '#fff',
              borderRadius: 12,
              fontFamily: '"Noto Sans SC", system-ui, sans-serif',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {uiLang === 'zh' ? '下载 JSON' : 'Download JSON'}
          </button>
        </div>
      )}

      {/* ============ AVATAR CROPPER MODAL ============ */}
      {pendingAvatarFile && (
        <AvatarCropperModal
          file={pendingAvatarFile}
          uiLang={uiLang}
          onCancel={() => setPendingAvatarFile(null)}
          onConfirm={handleAvatarConfirm}
        />
      )}

      {/* ============ ONBOARDING CHECKLIST MODAL ============ */}
      <OnboardingChecklistModal
        open={showChecklist}
        onClose={() => setShowChecklist(false)}
        uiLang={uiLang}
        items={checklistItems}
      />

    </div>
  );
}
