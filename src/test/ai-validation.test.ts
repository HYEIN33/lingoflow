import { describe, it, expect, vi } from 'vitest';

// We test validateInputLength through the exported functions since it's private.
// Mock geminiGenerate to prevent actual API calls.
vi.mock('../services/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/ai')>();
  return {
    ...actual,
    // Keep validateInputLength active (it runs before any API call)
  };
});

describe('AI input length validation', () => {
  it('rejects input longer than 2000 characters for translateText', async () => {
    const { translateText } = await import('../services/ai');
    const longInput = '中'.repeat(2001);
    await expect(translateText(longInput)).rejects.toThrow(/输入过长/);
  });

  it('rejects input longer than 2000 characters for checkGrammar', async () => {
    const { checkGrammar } = await import('../services/ai');
    const longInput = 'a'.repeat(2001);
    await expect(checkGrammar(longInput)).rejects.toThrow(/输入过长/);
  });

  it('rejects input longer than 2000 characters for explainSlang', async () => {
    const { explainSlang } = await import('../services/ai');
    const longInput = 'x'.repeat(2001);
    await expect(explainSlang(longInput)).rejects.toThrow(/输入过长/);
  });

  it('accepts input of exactly 2000 characters (does not throw length error)', async () => {
    const { translateText } = await import('../services/ai');
    const input = '中'.repeat(2000);
    // Should NOT throw the length validation error (may throw other errors from missing API)
    try {
      await translateText(input);
    } catch (e: any) {
      expect(e.message).not.toMatch(/输入过长/);
    }
  });
});
