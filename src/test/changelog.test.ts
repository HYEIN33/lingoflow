/**
 * Tests for src/data/changelog.ts — the changelog data + version-compare
 * helpers used by the changelog bell / toast.
 *
 * Why test pure data file? Three reasons:
 *   1. compareVersions() has off-by-one semantics that must hold for
 *      the bell to light up correctly.
 *   2. CHANGELOG entries must conform to the ChangelogEntry shape;
 *      shipping a malformed entry would crash the bell at runtime.
 *   3. entriesNewerThan() / latestEntry() are the bell's only public
 *      surface — they must be idempotent and order-stable.
 */
import { describe, it, expect } from 'vitest';
import {
  CHANGELOG,
  compareVersions,
  entriesNewerThan,
  latestEntry,
} from '../data/changelog';

describe('compareVersions()', () => {
  it('returns 0 for identical versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns positive when a > b on major', () => {
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('returns negative when a < b on major', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('returns positive when a > b on minor', () => {
    expect(compareVersions('1.3.0', '1.2.999')).toBeGreaterThan(0);
  });

  it('returns negative when a < b on patch', () => {
    expect(compareVersions('0.2.10', '0.2.11')).toBeLessThan(0);
  });

  it('treats missing patch as 0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });

  it('treats missing minor as 0', () => {
    expect(compareVersions('1', '1.0.0')).toBe(0);
  });

  it('does NOT compare prerelease/metadata (we only use M.m.p)', () => {
    // Naive implementation drops anything past the third dot — this
    // is documented behaviour, not a bug. Lock it in case someone
    // later "fixes" it and breaks the bell.
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
  });
});

describe('CHANGELOG data integrity', () => {
  it('is non-empty', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it('every entry has the required ChangelogEntry shape', () => {
    for (const entry of CHANGELOG) {
      expect(typeof entry.version).toBe('string');
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(typeof entry.date).toBe('string');
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.title).toBe('string');
      expect(entry.title.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.changes)).toBe(true);
      expect(entry.changes.length).toBeGreaterThan(0);
      for (const change of entry.changes) {
        expect(typeof change).toBe('string');
        expect(change.length).toBeGreaterThan(0);
      }
      // isMajor is optional; if present must be boolean.
      if ('isMajor' in entry) {
        expect(typeof entry.isMajor).toBe('boolean');
      }
    }
  });

  it('is ordered newest-first (each entry >= the next)', () => {
    for (let i = 0; i < CHANGELOG.length - 1; i++) {
      const cmp = compareVersions(CHANGELOG[i].version, CHANGELOG[i + 1].version);
      expect(cmp).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('entriesNewerThan()', () => {
  it('returns ALL entries when seenVersion is null (first launch)', () => {
    expect(entriesNewerThan(null)).toEqual(CHANGELOG);
  });

  it('returns nothing when seenVersion equals the latest', () => {
    const latest = CHANGELOG[0].version;
    expect(entriesNewerThan(latest)).toEqual([]);
  });

  it('returns only entries strictly newer than seenVersion', () => {
    if (CHANGELOG.length < 2) return; // skip if changelog is too short
    const second = CHANGELOG[1].version;
    const result = entriesNewerThan(second);
    expect(result.length).toBe(1);
    expect(result[0].version).toBe(CHANGELOG[0].version);
  });

  it('returns everything when seenVersion is older than all entries', () => {
    expect(entriesNewerThan('0.0.0')).toEqual(CHANGELOG);
  });

  it('returns empty when seenVersion is newer than the latest (defensive)', () => {
    expect(entriesNewerThan('999.999.999')).toEqual([]);
  });
});

describe('latestEntry()', () => {
  it('returns the first (newest) entry', () => {
    expect(latestEntry()).toBe(CHANGELOG[0]);
  });

  it('is never null when CHANGELOG has entries', () => {
    expect(latestEntry()).not.toBeNull();
  });
});
