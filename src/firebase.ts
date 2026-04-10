import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

const isDev = import.meta.env.DEV;

export const signIn = () => {
  // Headless browser / QA test mode: skip popup, go straight to anonymous
  if (isDev && new URLSearchParams(window.location.search).has('qa')) {
    return signInAnonymously(auth);
  }
  return signInWithPopup(auth, googleProvider).catch((error) => {
    if (isDev) {
      console.warn('Google sign-in failed in dev, falling back to anonymous:', error.code);
      return signInAnonymously(auth);
    }
    throw error;
  });
};
export const logOut = () => signOut(auth);
