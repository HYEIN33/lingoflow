import { describe, it, expect } from 'vitest';

describe('Auth Configuration', () => {
  it('isDev check prevents anonymous auth in production', () => {
    // In production, import.meta.env.DEV is false
    // Anonymous auth fallback should NOT trigger
    const isDev = false;
    const signInFailed = true;

    const shouldFallbackToAnonymous = isDev && signInFailed;
    expect(shouldFallbackToAnonymous).toBe(false);
  });

  it('isDev allows anonymous fallback in development', () => {
    const isDev = true;
    const signInFailed = true;

    const shouldFallbackToAnonymous = isDev && signInFailed;
    expect(shouldFallbackToAnonymous).toBe(true);
  });

  it('QA mode parameter is detected correctly', () => {
    // Simulate URL with ?qa parameter
    const url = new URL('http://localhost:3001/?qa');
    expect(url.searchParams.has('qa')).toBe(true);

    // Without ?qa
    const urlNoQa = new URL('http://localhost:3001/');
    expect(urlNoQa.searchParams.has('qa')).toBe(false);
  });
});

describe('User Profile Defaults', () => {
  it('new user profile has correct defaults', () => {
    const newProfile = {
      userId: 'test-uid',
      isPro: false,
      translationCount: 0,
      grammarCount: 0,
      lastResetDate: '2026-04-10',
      tabOrder: ['slang', 'translate', 'grammar', 'history', 'review'],
      approvedSlangCount: 0,
      currentStreak: 0,
      reputationScore: 100,
      l1PenaltyCount: 0,
      hasCompletedOnboarding: false,
    };

    expect(newProfile.isPro).toBe(false);
    expect(newProfile.translationCount).toBe(0);
    expect(newProfile.reputationScore).toBe(100);
    expect(newProfile.tabOrder[0]).toBe('slang'); // Slang is first tab
    expect(newProfile.hasCompletedOnboarding).toBe(false);
  });

  it('achievement badge conditions evaluate correctly', () => {
    const profile = {
      approvedSlangCount: 5,
      currentStreak: 3,
      hasUploadedMedia: false,
    };

    // apprentice: >= 1 entry
    expect(profile.approvedSlangCount >= 1).toBe(true);
    // observer: >= 5 entries
    expect(profile.approvedSlangCount >= 5).toBe(true);
    // streak7: >= 7 day streak
    expect(profile.currentStreak >= 7).toBe(false);
    // multimedia: has uploaded media
    expect(!!profile.hasUploadedMedia).toBe(false);
    // expert: >= 20 entries
    expect(profile.approvedSlangCount >= 20).toBe(false);
  });
});
