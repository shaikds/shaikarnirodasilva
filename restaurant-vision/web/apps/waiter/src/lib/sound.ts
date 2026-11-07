// Alert chime generated with WebAudio (no audio files) plus vibration.
// Browsers only allow audio after a user gesture, so the context is unlocked on the first tap.

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const w = window as Window & { webkitAudioContext?: AudioCtor };
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** True when the browser still needs a tap before sounds can play. */
export function audioLocked(): boolean {
  return ctx === null || ctx.state === 'suspended';
}

/** Resumes audio on the first user gesture (call once at startup). */
export function installAudioUnlock(onUnlocked?: () => void): () => void {
  const unlock = () => {
    const c = audioContext();
    if (!c) return;
    void c.resume().then(() => {
      onUnlocked?.();
      remove();
    });
  };
  const remove = () => {
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  return remove;
}

function tone(c: AudioContext, freq: number, start: number, duration: number, volume: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Two rising notes; three for urgent alerts. */
export function playAlertSound(urgent = false): boolean {
  const c = audioContext();
  if (!c || c.state !== 'running') return false;
  const t0 = c.currentTime + 0.01;
  tone(c, 880, t0, 0.18, 0.35);
  tone(c, 1320, t0 + 0.2, 0.28, 0.35);
  if (urgent) tone(c, 1760, t0 + 0.5, 0.3, 0.3);
  return true;
}

export const VIBRATION_PATTERN = [220, 120, 220];

export function vibrate(urgent = false): boolean {
  try {
    return navigator.vibrate?.(urgent ? [...VIBRATION_PATTERN, 120, 320] : VIBRATION_PATTERN) ?? false;
  } catch {
    return false;
  }
}
