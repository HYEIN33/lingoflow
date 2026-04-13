/**
 * Tests for the 5-item translation UX improvement batch.
 *
 * Covers:
 *  - Feedback flow: feedbackGiven set AFTER DB write, not before
 *  - Feedback reason maxLength enforcement
 *  - Aria-label presence on icon buttons
 *  - Auto-translate debounce timer cancelled on manual submit
 *  - AbortController cleanup in finally block
 *  - Scene prompt only accepts known values
 *  - Analytics wrapper has error handling
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const translateTabPath = join(ROOT, 'src', 'pages', 'TranslateTab.tsx');
const useTranslationPath = join(ROOT, 'src', 'hooks', 'useTranslation.ts');
const aiPath = join(ROOT, 'src', 'services', 'ai.ts');
const analyticsPath = join(ROOT, 'src', 'utils', 'analytics.ts');

const translateTab = readFileSync(translateTabPath, 'utf-8');
const useTranslation = readFileSync(useTranslationPath, 'utf-8');
const ai = readFileSync(aiPath, 'utf-8');
const analytics = readFileSync(analyticsPath, 'utf-8');

describe('Feedback flow — data loss prevention', () => {
  it('handleFeedback does NOT call setFeedbackGiven for down rating', () => {
    // The handleFeedback function for 'down' should show the reason form
    // but NOT set feedbackGiven — that happens only after successful DB write.
    const handleFeedback = translateTab.match(
      /const handleFeedback[\s\S]*?(?=\n\s*const submitFeedback)/
    );
    expect(handleFeedback).toBeTruthy();
    const body = handleFeedback![0];
    // Should NOT contain setFeedbackGiven(rating) before the return
    // The pattern: setFeedbackGiven appears only OUTSIDE handleFeedback (in submitFeedback)
    expect(body).not.toMatch(/setFeedbackGiven\(rating\)/);
  });

  it('submitFeedback sets feedbackGiven AFTER successful write (addDoc or dedup)', () => {
    const submitFeedback = translateTab.match(
      /const submitFeedback[\s\S]*?(?=\n\s*return\s*\()/
    );
    expect(submitFeedback).toBeTruthy();
    const body = submitFeedback![0];
    // setFeedbackGiven must appear inside the try block, AFTER the write logic
    // It should come after addDoc (normal path) or after dedup check (already submitted path)
    const setFeedbackPos = body.indexOf('setFeedbackGiven(rating)');
    expect(setFeedbackPos).toBeGreaterThan(-1);
    // Must be inside try block (not before it)
    const tryPos = body.indexOf('try {');
    expect(setFeedbackPos).toBeGreaterThan(tryPos);
    // Must NOT appear before the try block
    const beforeTry = body.substring(0, tryPos);
    expect(beforeTry).not.toContain('setFeedbackGiven');
  });

  it('submitFeedback has a finally block that resets isSubmittingFeedback', () => {
    const submitFeedback = translateTab.match(
      /const submitFeedback[\s\S]*?(?=\n\s*return\s*\()/
    );
    expect(submitFeedback).toBeTruthy();
    expect(submitFeedback![0]).toContain('finally');
    expect(submitFeedback![0]).toContain('setIsSubmittingFeedback(false)');
  });

  it('feedback buttons are disabled when isSubmittingFeedback is true', () => {
    // Both ThumbsUp and ThumbsDown buttons should check isSubmittingFeedback
    expect(translateTab).toContain('isSubmittingFeedback');
    const thumbsUpButton = translateTab.match(
      /onClick=\{[^}]*handleFeedback\('up'\)[^}]*\}[\s\S]*?disabled=\{([^}]+)\}/
    );
    expect(thumbsUpButton).toBeTruthy();
    expect(thumbsUpButton![1]).toContain('isSubmittingFeedback');
  });
});

describe('Feedback reason — input validation', () => {
  it('feedback reason input has maxLength=500', () => {
    // The reason input must cap at 500 chars to match Firestore rule
    expect(translateTab).toMatch(/maxLength=\{500\}/);
  });

  it('feedback submit button is disabled during submission', () => {
    // The submit button inside the reason form should be disabled when submitting
    // Match from the JSX conditional rendering of the feedback form
    const reasonSection = translateTab.match(
      /\{showFeedbackReason && \([\s\S]*?<\/form>/
    );
    expect(reasonSection).toBeTruthy();
    expect(reasonSection![0]).toContain('disabled={isSubmittingFeedback}');
  });
});

describe('Accessibility — aria-labels on icon buttons', () => {
  it('photo button has aria-label', () => {
    const photoButton = translateTab.match(
      /onClick=\{[^}]*photoInputRef[\s\S]*?<\/button>/
    );
    expect(photoButton).toBeTruthy();
    expect(photoButton![0]).toContain('aria-label');
  });

  it('auto-translate toggle has aria-label and aria-pressed', () => {
    const autoTranslateButton = translateTab.match(
      /onClick=\{[^}]*toggleAutoTranslate[\s\S]*?<\/button>/
    );
    expect(autoTranslateButton).toBeTruthy();
    expect(autoTranslateButton![0]).toContain('aria-label');
    expect(autoTranslateButton![0]).toContain('aria-pressed');
  });

  it('mic button has aria-label', () => {
    const micButton = translateTab.match(
      /onClick=\{onToggleListening\}[\s\S]*?<\/button>/
    );
    expect(micButton).toBeTruthy();
    expect(micButton![0]).toContain('aria-label');
  });

  it('submit button has aria-label', () => {
    const submitButton = translateTab.match(
      /type="submit"[\s\S]*?disabled=\{isTranslating[\s\S]*?<\/button>/
    );
    expect(submitButton).toBeTruthy();
    expect(submitButton![0]).toContain('aria-label');
  });

  it('thumbs-up button has aria-label', () => {
    const thumbsUp = translateTab.match(
      /handleFeedback\('up'\)[\s\S]*?<ThumbsUp/
    );
    expect(thumbsUp).toBeTruthy();
    expect(thumbsUp![0]).toContain('aria-label');
  });

  it('thumbs-down button has aria-label', () => {
    const thumbsDown = translateTab.match(
      /handleFeedback\('down'\)[\s\S]*?<ThumbsDown/
    );
    expect(thumbsDown).toBeTruthy();
    expect(thumbsDown![0]).toContain('aria-label');
  });
});

describe('Auto-translate — race condition prevention', () => {
  it('useTranslation has autoTimerRef for debounce cleanup', () => {
    expect(useTranslation).toContain('autoTimerRef');
    expect(useTranslation).toMatch(/useRef<.*?setTimeout.*?>\(null\)/);
  });

  it('handleTranslate clears autoTimerRef to prevent race', () => {
    // When manual translate fires, it should clear any pending auto-translate timer
    const handleTranslate = useTranslation.match(
      /const handleTranslate[\s\S]*?(?=\n\s*\/\/ Auto-translate)/
    );
    expect(handleTranslate).toBeTruthy();
    expect(handleTranslate![0]).toContain('clearTimeout(autoTimerRef.current)');
  });

  it('auto-translate useEffect stores timer in autoTimerRef', () => {
    // The debounce setTimeout must be stored in the ref, not a local variable
    expect(useTranslation).toMatch(/autoTimerRef\.current\s*=\s*setTimeout/);
  });

  it('auto-translate cleanup function clears autoTimerRef', () => {
    // The useEffect cleanup must clear the ref
    expect(useTranslation).toMatch(/clearTimeout\(autoTimerRef\.current\)/);
  });
});

describe('AbortController — lifecycle cleanup', () => {
  it('finally block nullifies abortControllerRef', () => {
    // The handleTranslate finally block (which also resets inFlightRef) must clear the controller
    const finallyBlock = useTranslation.match(/finally\s*\{[^}]*inFlightRef[^}]*\}/);
    expect(finallyBlock).toBeTruthy();
    expect(finallyBlock![0]).toContain('abortControllerRef.current = null');
  });
});

describe('Scene prompt — injection prevention', () => {
  it('translateText includes language direction detection', () => {
    const translateFn = ai.match(
      /export async function translateText[\s\S]*?return safeJsonParse/
    );
    expect(translateFn).toBeTruthy();
    // Must detect language direction for accurate translation
    expect(translateFn![0]).toContain('langDirection');
    expect(translateFn![0]).toContain('authenticTranslation');
    expect(translateFn![0]).toContain('academicTranslation');
  });

  it('scenePrompts only defines chat/business/writing', () => {
    const sceneMap = ai.match(/const scenePrompts[\s\S]*?\};/);
    expect(sceneMap).toBeTruthy();
    // Extract only the property keys inside the object literal (indented lines with colon)
    const objectBody = sceneMap![0].match(/=\s*\{([\s\S]*)\}/)?.[1] || '';
    const keys = objectBody.match(/^\s+(\w+):/gm)?.map(k => k.trim().replace(':', ''));
    expect(keys).toEqual(['chat', 'business', 'writing']);
  });
});

describe('Analytics — error resilience', () => {
  it('trackEvent wraps logEvent in try-catch', () => {
    expect(analytics).toContain('try');
    expect(analytics).toContain('catch');
    expect(analytics).toContain('logEvent');
  });
});

describe('Progress indicator — auto-translate visibility', () => {
  it('progress bar renders when isTranslating is true', () => {
    // There should be a visual indicator tied to isTranslating
    expect(translateTab).toMatch(/\{isTranslating\s*&&\s*\(/);
    // The indicator should have an animation class
    expect(translateTab).toMatch(/animate-pulse/);
  });
});
