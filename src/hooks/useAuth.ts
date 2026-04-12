import { useState, useEffect } from 'react';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../App';

// Local-timezone YYYY-MM-DD (NOT UTC) — fixes daily-reset bug for non-UTC users
function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Calendar-day diff (not millisecond ceil) — fixes streak being broken at 24h+1min
function calendarDayDiff(fromIsoDate: string, to: Date = new Date()): number {
  const [fy, fm, fd] = fromIsoDate.split('-').map(Number);
  if (!fy || !fm || !fd) return 0;
  const a = new Date(fy, fm - 1, fd).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('qa')) {
      signInAnonymously(auth).catch(console.error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthReady(true);
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          const today = localDateStr();

          if (!userDoc.exists()) {
            const newProfile: UserProfile = {
              userId: firebaseUser.uid,
              isPro: false, // Pro is granted server-side only — no anonymous Pro
              translationCount: 0,
              grammarCount: 0,
              lastResetDate: today,
              tabOrder: ['slang', 'translate', 'grammar', 'history', 'review'],
              approvedSlangCount: 0,
              currentStreak: 0,
              reputationScore: 100,
              l1PenaltyCount: 0,
              hasCompletedOnboarding: false,
              createdAt: serverTimestamp()
            };
            await setDoc(userRef, newProfile);
            setUserProfile(newProfile);
          } else {
            const data = userDoc.data() as UserProfile;
            const updates: Partial<UserProfile> & Record<string, unknown> = {};

            // Backfill required fields with safe defaults (prevents NaN propagation)
            if (data.isPro === undefined) updates.isPro = false;
            if (data.translationCount === undefined || Number.isNaN(data.translationCount as number)) {
              updates.translationCount = 0;
            }
            if (data.grammarCount === undefined || Number.isNaN(data.grammarCount as number)) {
              updates.grammarCount = 0;
            }
            if (data.lastResetDate === undefined) updates.lastResetDate = today;

            // Daily reset (local timezone)
            if (data.lastResetDate !== undefined && data.lastResetDate !== today) {
              updates.translationCount = 0;
              updates.grammarCount = 0;
              updates.lastResetDate = today;
            }

            // Streak (calendar-day diff, not millisecond ceil)
            if (data.lastContributionDate) {
              const diffDays = calendarDayDiff(data.lastContributionDate);
              if (diffDays > 1) updates.currentStreak = 0;
            }

            if (Object.keys(updates).length > 0) {
              await updateDoc(userRef, updates as Record<string, unknown>);
              setUserProfile({ ...data, ...updates } as UserProfile);
            } else {
              setUserProfile(data);
            }
          }
        } catch (error) {
          console.error('Failed to sync user profile:', error);
          // Fallback: minimal profile from localStorage cache
          const cachedPro = localStorage.getItem('memeflow_isPro') === 'true';
          setUserProfile({
            userId: firebaseUser.uid,
            isPro: cachedPro,
            translationCount: 0,
            grammarCount: 0,
            lastResetDate: localDateStr(),
            tabOrder: ['slang', 'translate', 'grammar', 'history', 'review'],
            approvedSlangCount: 0,
            currentStreak: 0,
            reputationScore: 100,
            l1PenaltyCount: 0,
            hasCompletedOnboarding: cachedPro,
          });
        }
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  return { user, userProfile, setUserProfile, isAuthReady };
}
