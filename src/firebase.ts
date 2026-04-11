import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, signInWithPhoneNumber, RecaptchaVerifier, ConfirmationResult } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, logEvent as firebaseLogEvent } from 'firebase/analytics';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export function logEvent(name: string, params?: Record<string, any>) {
  if (analytics) firebaseLogEvent(analytics, name, params);
}

const isDev = import.meta.env.DEV;

export const signIn = () => {
  // Headless browser / QA test mode: skip popup, go straight to anonymous
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

// Phone auth
let recaptchaVerifier: RecaptchaVerifier | null = null;

export function getRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
  }
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  return recaptchaVerifier;
}

export async function sendPhoneCode(phoneNumber: string, containerId: string): Promise<ConfirmationResult> {
  const verifier = getRecaptchaVerifier(containerId);
  const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
  logEvent('phone_code_sent');
  return result;
}

export type { ConfirmationResult };
