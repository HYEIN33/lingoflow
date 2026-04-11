import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../App';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Auto-login in QA test mode
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('qa')) {
      import('firebase/auth').then(({ signInAnonymously }) => {
        signInAnonymously(auth).catch(console.error);
      });
    }
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setIsAuthReady(true);
      if (user) {
        // Create or update user profile
        const userRef = doc(db, 'users', user.uid);
        try {
          const userDoc = await getDoc(userRef);
          const today = new Date().toISOString().split('T')[0];

          if (!userDoc.exists()) {
            const isAnonymous = user.isAnonymous;
            const newProfile: UserProfile = {
              userId: user.uid,
              isPro: isAnonymous,  // Beta testers (invite code) get Pro by default
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
            let updates: any = {};

            // Ensure required fields exist for older profiles
            if (data.isPro === undefined) updates.isPro = false;
            if (data.translationCount === undefined) updates.translationCount = 0;
            if (data.grammarCount === undefined) updates.grammarCount = 0;
            if (data.lastResetDate === undefined) updates.lastResetDate = today;

            // Reset daily limits
            if (data.lastResetDate !== today && data.lastResetDate !== undefined) {
              updates.translationCount = 0;
              updates.grammarCount = 0;
              updates.lastResetDate = today;
            }

            // Handle streak logic
            if (data.lastContributionDate) {
              const lastDate = new Date(data.lastContributionDate);
              const currentDate = new Date();
              const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

              if (diffDays > 1) {
                // Streak broken
                updates.currentStreak = 0;
              }
            }

            if (Object.keys(updates).length > 0) {
              await updateDoc(userRef, updates);
              setUserProfile({ ...data, ...updates });
            } else {
              setUserProfile(data);
            }
          }
        } catch (error) {
          console.error('Failed to sync user profile:', error);
        }

        // Test connection
        import('firebase/firestore').then(({ getDocFromServer, doc }) => {
          getDocFromServer(doc(db, '_connection_test_', 'ping')).catch(error => {
            if (error.message?.includes('client is offline')) {
              console.error("Firestore connection failed: client is offline. Check firebase-applet-config.json");
            }
          });
        });
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  return { user, userProfile, setUserProfile, isAuthReady };
}
