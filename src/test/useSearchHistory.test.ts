/**
 * Regression tests for useSearchHistory localStorage migration.
 *
 * Background: an earlier version of useSearchHistory stored history as
 * plain string[] in localStorage. The current version expects
 * {text: string, timestamp: number}[]. If a user had stored data from the
 * old version, `item.text.length` would throw TypeError on mount, which
 * bubbled up through App.tsx -> ErrorBoundary and crashed the entire
 * Translate tab with "Something went wrong".
 *
 * These tests lock down the migration behavior so it cannot regress.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSearchHistory } from '../hooks/useSearchHistory';

const STORAGE_KEY = 'memeflow_search_history';

describe('useSearchHistory — localStorage migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when localStorage is empty', () => {
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  it('parses fresh object-shape data correctly', () => {
    const fresh = [
      { text: 'plot twist', timestamp: 1700000000000 },
      { text: 'yyds', timestamp: 1700000001000 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[0].text).toBe('plot twist');
    expect(result.current.history[0].timestamp).toBe(1700000000000);
  });

  it('migrates legacy string[] shape to object shape', () => {
    // This is the shape that caused the Translate tab crash.
    const legacy = ['plot twist', 'yyds', '六女一'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toHaveLength(3);
    expect(result.current.history[0]).toEqual({ text: 'plot twist', timestamp: 0 });
    expect(result.current.history[1]).toEqual({ text: 'yyds', timestamp: 0 });
    expect(result.current.history[2]).toEqual({ text: '六女一', timestamp: 0 });
    // Critically: every item must have a defined .text so downstream
    // `item.text.length` reads never throw.
    result.current.history.forEach(item => {
      expect(typeof item.text).toBe('string');
      expect(() => item.text.length).not.toThrow();
    });
  });

  it('filters out malformed entries (null, undefined, missing text)', () => {
    const dirty = [
      { text: 'good', timestamp: 100 },
      null,
      undefined,
      { text: undefined, timestamp: 200 },
      { timestamp: 300 }, // missing text
      { text: 42 }, // wrong type
      'legacy string',
      { text: 'also good', timestamp: 400 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dirty));
    const { result } = renderHook(() => useSearchHistory());
    // Valid: 'good', legacy string, 'also good' → 3 entries
    expect(result.current.history).toHaveLength(3);
    expect(result.current.history.map(i => i.text)).toEqual(['good', 'legacy string', 'also good']);
  });

  it('handles non-array JSON without throwing', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }));
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  it('handles corrupt JSON without throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  it('coerces non-numeric timestamp to 0', () => {
    const data = [{ text: 'hello', timestamp: 'bad' }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history[0].timestamp).toBe(0);
  });
});
