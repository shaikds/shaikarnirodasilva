import { describe, expect, it } from 'vitest';
import {
  canEnter,
  furthestReachable,
  nextStep,
  prevStep,
  resolveStep,
  stepBlocker,
  STEPS,
  type WizardFacts,
} from '../lib/wizard';

const fresh: WizardFacts = {
  pinOk: false,
  paired: false,
  pairSkipped: false,
  cameraCount: 0,
  tableCount: 0,
  zoneCount: 0,
  tableErrors: 0,
  zoneErrors: 0,
  configErrors: 0,
  dirty: false,
};

const complete: WizardFacts = {
  ...fresh,
  pinOk: true,
  paired: true,
  cameraCount: 1,
  tableCount: 2,
  zoneCount: 3,
};

describe('wizard step gating', () => {
  it('a new edge can only open the PIN step', () => {
    expect(furthestReachable(fresh)).toBe('pin');
    expect(STEPS.filter((s) => canEnter(s, fresh))).toEqual(['pin']);
    expect(resolveStep('zones', fresh)).toBe('pin');
  });

  it('pairing can be skipped for local-only mode', () => {
    const f = { ...fresh, pinOk: true };
    expect(stepBlocker('pair', f)).toBe('pairOrSkip');
    expect(canEnter('cameras', f)).toBe(false);
    expect(canEnter('cameras', { ...f, pairSkipped: true })).toBe(true);
    expect(canEnter('cameras', { ...f, paired: true })).toBe(true);
  });

  it('cameras need at least one camera; tables may be empty (auto-detect)', () => {
    const f = { ...fresh, pinOk: true, pairSkipped: true };
    expect(stepBlocker('cameras', f)).toBe('cameraRequired');
    const withCamera = { ...f, cameraCount: 1 };
    expect(stepBlocker('tables', withCamera)).toBeNull();
    expect(canEnter('zones', withCamera)).toBe(true);
    expect(stepBlocker('zones', withCamera)).toBe('tableRequired');
    expect(stepBlocker('tables', { ...withCamera, tableCount: 1, tableErrors: 1 })).toBe('tableErrors');
  });

  it('zones need a zone and no zone errors', () => {
    expect(stepBlocker('zones', { ...complete, zoneCount: 0 })).toBe('zoneRequired');
    expect(stepBlocker('zones', { ...complete, zoneErrors: 2 })).toBe('zoneErrors');
    expect(canEnter('uniform', { ...complete, zoneErrors: 2 })).toBe(false);
  });

  it('uniform and coverage never block; review needs a valid, saved config', () => {
    expect(stepBlocker('uniform', complete)).toBeNull();
    expect(stepBlocker('coverage', complete)).toBeNull();
    expect(stepBlocker('review', { ...complete, configErrors: 1 })).toBe('configErrors');
    expect(stepBlocker('review', { ...complete, dirty: true })).toBe('unsaved');
    expect(canEnter('live', { ...complete, dirty: true })).toBe(false);
    expect(canEnter('live', complete)).toBe(true);
    expect(furthestReachable(complete)).toBe('live');
  });

  it('a later step resolves to the furthest reachable one, earlier steps stay open', () => {
    const f = { ...complete, cameraCount: 0 };
    expect(resolveStep('review', f)).toBe('cameras');
    expect(resolveStep('pair', f)).toBe('pair');
  });

  it('next/prev follow the step order', () => {
    expect(nextStep('pin')).toBe('pair');
    expect(nextStep('live')).toBeNull();
    expect(prevStep('pin')).toBeNull();
    expect(prevStep('zones')).toBe('tables');
  });
});
