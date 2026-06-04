/**
 * Language detection + locale mapping for the speech / translation paths.
 * Centralised here so the regex (and the lang→locale map) live in one
 * place — older code copy-pasted `/[一-龥]/` and `/[一-龥]/`
 * (numerically the same range, visually different) which drifted over
 * time. Consolidated 2026-05-06.
 */

/** Supported TTS / language-hint codes for Gemini speech and Web Speech. */
export type TtsLang = 'zh' | 'en' | 'ja' | 'ko';

/** True if the input contains at least one CJK Unified Ideograph. */
export function hasChinese(text: string): boolean {
  return /[一-龥]/.test(text);
}

/**
 * BCP-47 locale strings for `SpeechSynthesisUtterance.lang`. Only used
 * by the browser-fallback path in useAudio when the Gemini TTS proxy
 * fails — the proxy itself takes raw `TtsLang` codes.
 */
export const SPEECH_SYNTHESIS_LOCALE: Record<TtsLang, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
};
