import { describe, it, expect, vi } from 'vitest';
import { start, inFlightStore } from '../../stores/requestManager.js';
import { get } from 'svelte/store';

describe('Request Manager', () => {
  it('handles API failures', async () => {
    const error = new Error('API Failure');
    const executor = vi.fn().mockRejectedValue(error);
    
    // We can't easily wait for the internal finally block of the promise in requestManager.js
    // because that promise isn't returned directly, but rather wrapped.
    // However, we can track when it's removed from the store.
    
    const { promise, requestId } = start({ executor });
    
    try {
      await promise;
    } catch (e) {
      expect(e).toBe(error);
    }
    
    expect(executor).toHaveBeenCalledTimes(1);
    
    // Wait for the cleanup to manifest in the store
    // Use a polling mechanism or enough wait time for the microtask
    for(let i=0; i<10; i++) {
        if (!get(inFlightStore)[requestId]) break;
        await new Promise(r => setTimeout(r, 10));
    }
    
    expect(get(inFlightStore)[requestId]).toBeUndefined();
  });

  it('handles slow responses', async () => {
    const executor = (signal) => new Promise((resolve) => {
      setTimeout(() => resolve('done'), 10);
    });
    
    const { promise, requestId } = start({ executor });
    
    // Check if it's in flight
    expect(get(inFlightStore)[requestId]).toBeDefined();
    
    const result = await promise;
    expect(result).toBe('done');

    // Wait for cleanup
    for(let i=0; i<10; i++) {
        if (!get(inFlightStore)[requestId]) break;
        await new Promise(r => setTimeout(r, 10));
    }

    expect(get(inFlightStore)[requestId]).toBeUndefined();
  });

  it('deduplicates concurrent requests with same key', async () => {
    let callCount = 0;
    const executor = () => new Promise(resolve => {
      callCount++;
      setTimeout(() => resolve('result'), 50);
    });
    
    const req1 = start({ dedupeKey: 'key1', executor });
    const req2 = start({ dedupeKey: 'key1', executor });
    
    expect(req1.requestId).toBe(req2.requestId);
    expect(req1.promise).toBe(req2.promise);
    
    await req1.promise;
    expect(callCount).toBe(1);
  });

  it('handles cancellation via cancel(requestId)', async () => {
    let aborted = false;
    const executor = (signal) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve('too late'), 100);
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        aborted = true;
        reject(new Error('Aborted'));
      });
    });

    const { promise, requestId } = start({ executor });
    
    // Cancel it!
    const { cancel } = await import('../../stores/requestManager.js');
    cancel(requestId);
    
    try {
      await promise;
    } catch (e) {
      expect(e.message).toBe('Aborted');
    }
    
    expect(aborted).toBe(true);
    expect(get(inFlightStore)[requestId]).toBeUndefined();
  });
});