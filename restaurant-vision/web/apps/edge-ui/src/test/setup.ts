import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { clearPin } from '../api/pin';

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

// jsdom has no PointerEvent: without it fireEvent.pointerDown() drops clientX/clientY.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

Element.prototype.scrollIntoView ??= function scrollIntoView() {};
window.scrollTo = () => undefined;
Element.prototype.setPointerCapture ??= function setPointerCapture() {};
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};

afterEach(() => {
  cleanup();
  clearPin();
  for (const s of [window.localStorage, window.sessionStorage]) {
    try {
      s.clear();
    } catch {
      // ignore
    }
  }
});
