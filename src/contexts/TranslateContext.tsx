/**
 * TranslateContext — replaces 29 individual props drilled from App.tsx to TranslateTab.
 *
 * Groups related state into sub-objects for clarity:
 *   input, result, slang, audio, user, history, scene, actions
 *
 * The Provider lives in App.tsx and reshapes existing hook returns.
 * TranslateTab consumes via useTranslateContext().
 */
import { createContext, useContext } from 'react';
import type { TranslationResult, SlangExplanationResult } from '../services/ai';
import type { Language } from '../i18n';
import type { UserProfile, SavedWord } from '../App';
import type { TranslateScene } from '../hooks/useTranslation';
import type { User } from 'firebase/auth';

interface SearchHistoryItem {
  text: string;
  timestamp: number;
}

export interface TranslateContextValue {
  // Input
  inputText: string;
  setInputText: (v: string) => void;
  isTranslating: boolean;
  isExtractingPhoto: boolean;
  onPhotoCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isListening: boolean;
  onToggleListening: () => void;

  // Result
  translationResult: TranslationResult | null;
  selectedUsageIndex: number;
  setSelectedUsageIndex: (v: number) => void;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;

  // Formality
  formalityLevel: number;
  setFormalityLevel: (v: number) => void;

  // Slang
  isFetchingSlang: boolean;
  slangInsights: SlangExplanationResult[];

  // Save
  isSaving: boolean;

  // Audio
  loadingAudioText: string | null;

  // User + i18n
  userProfile: UserProfile | null;
  uiLang: Language;
  savedWords: SavedWord[];
  user: User | null;

  // Search history
  searchHistory: SearchHistoryItem[];
  removeFromHistory: (text: string) => void;
  clearHistory: () => void;

  // Navigation memory
  previousSearchWord: string | null;
  setPreviousSearchWord: (v: string | null) => void;

  // Scene
  scene: TranslateScene;
  setScene: (s: TranslateScene) => void;
  autoTranslateEnabled: boolean;
  toggleAutoTranslate: (enabled: boolean) => void;

  // Actions
  onTranslate: (e?: React.FormEvent) => void;
  onSearchWord: (word: string) => void;
  onGoBack: () => void;
  onSaveWord: (styleTag?: 'authentic' | 'academic' | 'standard') => void;
  onSpeak: (text: string) => void;
  onOpenPaywall: (trigger: string) => void;
  onUpgrade: () => void;
  onViewSlangEntry: (term: string) => void;
}

const TranslateContext = createContext<TranslateContextValue | null>(null);

export function TranslateProvider({ value, children }: { value: TranslateContextValue; children: React.ReactNode }) {
  return <TranslateContext.Provider value={value}>{children}</TranslateContext.Provider>;
}

export function useTranslateContext(): TranslateContextValue {
  const ctx = useContext(TranslateContext);
  if (!ctx) throw new Error('useTranslateContext must be used within TranslateProvider');
  return ctx;
}

export default TranslateContext;
