import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, logEvent as firebaseLogEvent } from 'firebase/analytics';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export function logEvent(name: string, params?: Record<string, any>) {
  if (analytics) firebaseLogEvent(analytics, name, params);
}

const isDev = import.meta.env.DEV;

export const signIn = () => {
  if (isDev && new URLSearchParams(window.location.search).has('qa')) {
    return signInAnonymously(auth);
  }
  return signInWithPopup(auth, googleProvider).then((result) => {
    logEvent('login', { method: 'google' });
    return result;
  }).catch((error) => {
    if (isDev) {
      console.warn('Google sign-in failed in dev, falling back to anonymous:', error.code);
      return signInAnonymously(auth).then((result) => {
        logEvent('login', { method: 'anonymous' });
        return result;
      });
    }
    throw error;
  });
};
export const logOut = () => signOut(auth);

// Email auth
export async function emailSignUp(email: string, password: string) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  logEvent('login', { method: 'email_signup' });
  return result;
}

export async function emailSignIn(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  logEvent('login', { method: 'email' });
  return result;
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}
