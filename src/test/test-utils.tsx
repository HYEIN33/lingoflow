/**
 * Shared test utilities: mock factories for TranslateTab props,
 * Firebase mocks, and render helpers.
 */
import React from 'react';
import { vi } from 'vitest';
import type { TranslationResult, SlangExplanationResult } from '../services/ai';

// ---------- Mock translation result ----------
export function mockTranslationResult(overrides?: Partial<TranslationResult>): TranslationResult {
  return {
    original: '我在弄咖啡',
    authenticTranslation: "I'm making coffee",
    academicTranslation: 'I am preparing coffee',
    pronunciation: '/kɒfi/',
    usages: [{
      label: 'verb',
      labelZh: '动词',
      meaning: 'to make/prepare',
      meaningZh: '制作/准备',
      examples: [{ sentence: "I'm making coffee", translation: '我在弄咖啡' }],
      synonyms: ['prepare', 'brew'],
      antonyms: [],
      alternatives: ['fix', 'brew'],
      conjugations: {},
    }],
    slangTerms: ['弄'],
    ...overrides,
  };
}

// ---------- Mock slang insight ----------
export function mockSlangInsight(overrides?: Partial<SlangExplanationResult>): SlangExplanationResult {
  return {
    term: '弄',
    meaning: '做、搞、弄',
    meaningEn: 'to do, to make, to handle',
    origin: '日常口语',
    usage: '非常口语化的"做"，适用于各种语境',
    examples: [{ sentence: '你在弄什么？', translation: "What are you doing?" }],
    relatedTerms: ['搞', '做'],
    ...overrides,
  };
}

// ---------- Default TranslateTab props factory ----------
export function defaultTranslateTabProps() {
  return {
    inputText: '',
    setInputText: vi.fn(),
    isTranslating: false,
    translationResult: null as TranslationResult | null,
    selectedUsageIndex: 0,
    setSelectedUsageIndex: vi.fn(),
    showDetails: false,
    setShowDetails: vi.fn(),
    formalityLevel: 50,
    setFormalityLevel: vi.fn(),
    isFetchingSlang: false,
    slangInsights: [] as SlangExplanationResult[],
    isSaving: false,
    loadingAudioText: null as string | null,
    userProfile: { userId: 'test-uid', isPro: true, hasCompletedOnboarding: true } as any,
    uiLang: 'zh' as const,
    searchHistory: [] as any[],
    removeFromHistory: vi.fn(),
    clearHistory: vi.fn(),
    previousSearchWord: null as string | null,
    setPreviousSearchWord: vi.fn(),
    isExtractingPhoto: false,
    onPhotoCapture: vi.fn(),
    isListening: false,
    onToggleListening: vi.fn(),
    onTranslate: vi.fn(),
    onSearchWord: vi.fn(),
    onGoBack: vi.fn(),
    onSaveWord: vi.fn(),
    onSpeak: vi.fn(),
    onOpenPaywall: vi.fn(),
    onUpgrade: vi.fn(),
    onViewSlangEntry: vi.fn(),
    scene: 'chat' as const,
    setScene: vi.fn(),
    autoTranslateEnabled: false,
    toggleAutoTranslate: vi.fn(),
    savedWords: [] as any[],
    user: { uid: 'test-uid' } as any,
  };
}
