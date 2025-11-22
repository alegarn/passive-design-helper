/**
 * Curve caching module for psychrometric chart
 */
export class CurveCache {
  constructor(maxSize = 20) {
    this.maxSize = maxSize; this.cache = new Map();
  }
  getOrCompute(key, computeFn) {
    const stringKey = typeof key === 'string' ? key : JSON.stringify(key);
    if (this.cache.has(stringKey)) { const value = this.cache.get(stringKey); this.cache.delete(stringKey); this.cache.set(stringKey, value); return value; }
    const value = computeFn(); this.cache.set(stringKey, value); if (this.cache.size > this.maxSize) { const firstKey = this.cache.keys().next().value; this.cache.delete(firstKey); } return value;
  }
  invalidate(key) { const stringKey = typeof key === 'string' ? key : JSON.stringify(key); return this.cache.delete(stringKey); }
  clear() { this.cache.clear(); }
  size() { return this.cache.size; }
  has(key) { const stringKey = typeof key === 'string' ? key : JSON.stringify(key); return this.cache.has(stringKey); }
  keys() { return Array.from(this.cache.keys()); }
}
