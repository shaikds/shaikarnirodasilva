// Device detection (FR-11.1): touch + small-screen heuristics. Kept tiny
// and dependency-free — this is the ONE place "is this a phone" is asked,
// so main.js and every UI module read the same answer.

export function isTouchDevice() {
  try {
    return ('ontouchstart' in window) ||
      (navigator.maxTouchPoints ?? 0) > 0 ||
      matchMedia('(pointer: coarse)').matches;
  } catch { return false; }
}

export function isSmallScreen() {
  return Math.min(innerWidth, innerHeight) < 760;
}

// the actual "show touch controls" gate: touch-capable AND phone-sized.
// A touchscreen laptop with a big display should still get the desktop
// (keyboard/mouse) experience — only a genuinely small touch device does.
export function isMobile() {
  return isTouchDevice() && isSmallScreen();
}
