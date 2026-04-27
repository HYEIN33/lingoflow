/**
 * Tests for src/lib/utils.ts — the cn() class-name merger that wraps
 * clsx + tailwind-merge. Tiny surface, but the tests serve two roles:
 *   1. Lock the contract (calls clsx then twMerge in order).
 *   2. Catch a regression if anyone ever swaps the order or drops one
 *      side, which would silently produce broken Tailwind output (e.g.
 *      conflicting `p-2 p-4` no longer collapsing).
 */
import { describe, it, expect } from 'vitest';
import { cn } from '../lib/utils';

describe('cn()', () => {
  it('returns empty string when called with no args', () => {
    expect(cn()).toBe('');
  });

  it('returns a single class unchanged', () => {
    expect(cn('p-2')).toBe('p-2');
  });

  it('joins multiple string args with spaces', () => {
    expect(cn('p-2', 'm-4', 'text-red-500')).toBe('p-2 m-4 text-red-500');
  });

  it('drops falsy values (the clsx contract)', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('honours conditional objects from clsx', () => {
    expect(cn('a', { b: true, c: false, d: true })).toBe('a b d');
  });

  it('flattens arrays', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('twMerge dedupes conflicting Tailwind classes (last wins)', () => {
    // This is the whole reason cn() exists — without twMerge, both
    // p-2 and p-4 ship to the DOM and Tailwind picks one unpredictably.
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('twMerge handles arbitrary-value variants too', () => {
    expect(cn('text-[10px]', 'text-[14px]')).toBe('text-[14px]');
  });
});
