import { describe, it, expect, vi } from 'vitest';
import { CurveCache } from '../../scripts/psychro/curveCache.js';

describe('CurveCache', () => {
  it('stores and retrieves a value', () => {
    const cache = new CurveCache();
    const compute = vi.fn(() => [1, 2, 3]);
    const result = cache.getOrCompute('key1', compute);
    expect(result).toEqual([1, 2, 3]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('returns cached value without recomputing', () => {
    const cache = new CurveCache();
    const compute = vi.fn(() => 42);
    cache.getOrCompute('k', compute);
    const result2 = cache.getOrCompute('k', compute);
    expect(result2).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('evicts oldest entry when maxSize is exceeded', () => {
    const cache = new CurveCache(2);
    cache.getOrCompute('a', () => 1);
    cache.getOrCompute('b', () => 2);
    cache.getOrCompute('c', () => 3); // should evict 'a'
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.size()).toBe(2);
  });

  it('invalidates a specific key', () => {
    const cache = new CurveCache();
    cache.getOrCompute('x', () => 99);
    expect(cache.has('x')).toBe(true);
    const removed = cache.invalidate('x');
    expect(removed).toBe(true);
    expect(cache.has('x')).toBe(false);
  });

  it('returns false when invalidating a missing key', () => {
    const cache = new CurveCache();
    expect(cache.invalidate('missing')).toBe(false);
  });

  it('clears all entries', () => {
    const cache = new CurveCache();
    cache.getOrCompute('p', () => 1);
    cache.getOrCompute('q', () => 2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('serializes object keys to JSON', () => {
    const cache = new CurveCache();
    const key = { T: 25, RH: 50 };
    const compute = vi.fn(() => 'value');
    cache.getOrCompute(key, compute);
    // Same object content should hit the cache
    cache.getOrCompute({ T: 25, RH: 50 }, compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('returns all stored keys', () => {
    const cache = new CurveCache();
    cache.getOrCompute('a', () => 1);
    cache.getOrCompute('b', () => 2);
    const keys = cache.keys();
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });

  it('moves accessed entry to most-recent to avoid premature eviction', () => {
    const cache = new CurveCache(2);
    cache.getOrCompute('a', () => 1);
    cache.getOrCompute('b', () => 2);
    // Access 'a' to make it most-recent
    cache.getOrCompute('a', () => 1);
    // Add 'c' — should evict 'b' not 'a'
    cache.getOrCompute('c', () => 3);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });
});
