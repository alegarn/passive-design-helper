import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach, vi } from 'vitest';

// Fix for "mount is not available on the server" in Vitest/Svelte 5 tests
// This forces Svelte to believe it's in a browser environment
if (typeof window !== 'undefined') {
  window.HTMLCanvasElement.prototype.getContext = vi.fn();
  // Svelte 5 check: ensure we are not accidentally using server-side rendering in tests
}

afterEach(() => {
  cleanup();
});
