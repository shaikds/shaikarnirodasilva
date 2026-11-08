import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom lacks these browser APIs.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

let objectUrls = 0;
URL.createObjectURL ??= () => `blob:mock/${++objectUrls}`;
URL.revokeObjectURL ??= () => undefined;

Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.setPointerCapture ??= function setPointerCapture() {};
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};

afterEach(() => {
  cleanup();
  for (const s of [window.localStorage, window.sessionStorage]) {
    try {
      s.clear();
    } catch {
      // ignore
    }
  }
});
