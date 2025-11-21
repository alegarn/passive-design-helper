/**
 * Curve caching module for psychrometric chart
 * Implements simple LRU cache for Path2D objects and other computationally expensive curves
 */

/**
 * Simple LRU (Least Recently Used) cache for curve data
 */
export class CurveCache {
  /**
   * Create a new curve cache
   * @param {number} maxSize - Maximum number of entries to cache (default 20)
   */
  constructor(maxSize = 20) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Get cached value or compute and cache it
   * @param {string|Object} key - Cache key (will be JSON.stringify'd if object)
   * @param {Function} computeFn - Function to compute value if not in cache
   * @returns {*} Cached or computed value
   */
  getOrCompute(key, computeFn) {
    const stringKey = typeof key === 'string' ? key : JSON.stringify(key);
    
    if (this.cache.has(stringKey)) {
      // Move to end (mark as recently used)
      const value = this.cache.get(stringKey);
      this.cache.delete(stringKey);
      this.cache.set(stringKey, value);
      return value;
    }
    
    // Compute new value
    const value = computeFn();
    
    // Add to cache
    this.cache.set(stringKey, value);
    
    // Enforce size limit
    if (this.cache.size > this.maxSize) {
      // Remove oldest entry (first in Map)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    return value;
  }

  /**
   * Invalidate a specific cache entry
   * @param {string|Object} key - Cache key to invalidate
   * @returns {boolean} True if entry was found and removed
   */
  invalidate(key) {
    const stringKey = typeof key === 'string' ? key : JSON.stringify(key);
    return this.cache.delete(stringKey);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get current cache size
   * @returns {number} Number of entries in cache
   */
  size() {
    return this.cache.size;
  }

  /**
   * Check if cache contains key
   * @param {string|Object} key - Cache key to check
   * @returns {boolean} True if key exists in cache
   */
  has(key) {
    const stringKey = typeof key === 'string' ? key : JSON.stringify(key);
    return this.cache.has(stringKey);
  }

  /**
   * Get all cache keys (for debugging)
   * @returns {Array<string>} Array of cache keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }
}

// Development-only basic tests
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  const cache = new CurveCache(3);
  
  // Test basic getOrCompute
  let computeCount = 0;
  const value1 = cache.getOrCompute('key1', () => {
    computeCount++;
    return 'value1';
  });
  
  console.assert(value1 === 'value1' && computeCount === 1, 'First computation should work');
  
  // Test cache hit
  const value1Again = cache.getOrCompute('key1', () => {
    computeCount++;
    return 'value1-again';
  });
  
  console.assert(value1Again === 'value1' && computeCount === 1, 'Cache hit should not recompute');
  
  // Test LRU eviction
  cache.getOrCompute('key2', () => { computeCount++; return 'value2'; });
  cache.getOrCompute('key3', () => { computeCount++; return 'value3'; });
  cache.getOrCompute('key4', () => { computeCount++; return 'value4'; });
  
  console.assert(cache.size() === 3, 'Cache should respect max size');
  console.assert(!cache.has('key1'), 'Oldest entry should be evicted');
  
  // Test object keys
  const objKey = { Tmin: 0, Tmax: 50, Wmax: 0.03 };
  const objValue = cache.getOrCompute(objKey, () => { computeCount++; return 'objValue'; });
  
  console.assert(objValue === 'objValue', 'Object keys should work');
  
  // console.log('CurveCache module tests passed');
}