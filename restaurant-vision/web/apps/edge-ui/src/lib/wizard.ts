// Setup wizard steps and gating. Pure: the wizard computes `WizardFacts` from the live data and
// these functions decide what is reachable, so the rules are unit-tested in one place.

export const STEPS = [
  'pin',
  'pair',
  'cameras',
  'tables',
  'zones',
  'uniform',
  'coverage',
  'review',
  'live',
] as const;

export type StepId = (typeof STEPS)[number];

/** Steps the installer may skip (pairing: local-only mode; uniform: optional). */
export const OPTIONAL_STEPS: readonly StepId[] = ['pair', 'uniform'];

/** Steps whose edits live in the draft SiteConfig and are saved with `PUT /local/config`. */
export const CONFIG_STEPS: readonly StepId[] = ['cameras', 'tables', 'zones', 'review'];

export const isStepId = (v: unknown): v is StepId => STEPS.includes(v as StepId);

export interface WizardFacts {
  /** The PIN in this tab was accepted by the edge. */
  pinOk: boolean;
  paired: boolean;
  /** The installer chose local-only mode. */
  pairSkipped: boolean;
  cameraCount: number;
  tableCount: number;
  zoneCount: number;
  tableErrors: number;
  zoneErrors: number;
  configErrors: number;
  /** The draft differs from what the edge has. */
  dirty: boolean;
}

export type BlockReason =
  | 'pinRequired'
  | 'pairOrSkip'
  | 'cameraRequired'
  | 'tableRequired'
  | 'tableErrors'
  | 'zoneRequired'
  | 'zoneErrors'
  | 'configErrors'
  | 'unsaved';

/** Why the installer cannot move past `step` yet, or null when it is done. */
export function stepBlocker(step: StepId, f: WizardFacts): BlockReason | null {
  switch (step) {
    case 'pin':
      return f.pinOk ? null : 'pinRequired';
    case 'pair':
      return f.paired || f.pairSkipped ? null : 'pairOrSkip';
    case 'cameras':
      return f.cameraCount > 0 ? null : 'cameraRequired';
    case 'tables':
      if (f.tableCount === 0) return 'tableRequired';
      return f.tableErrors > 0 ? 'tableErrors' : null;
    case 'zones':
      if (f.zoneCount === 0) return 'zoneRequired';
      return f.zoneErrors > 0 ? 'zoneErrors' : null;
    case 'review':
      if (f.configErrors > 0) return 'configErrors';
      return f.dirty ? 'unsaved' : null;
    case 'uniform':
    case 'coverage':
    case 'live':
      return null;
  }
}

export const stepIndex = (step: StepId): number => STEPS.indexOf(step);

/** A step can be opened when every step before it is done. */
export function canEnter(step: StepId, f: WizardFacts): boolean {
  return STEPS.slice(0, stepIndex(step)).every((s) => stepBlocker(s, f) === null);
}

/** The furthest step the installer can open (the first one that is not done, or the last). */
export function furthestReachable(f: WizardFacts): StepId {
  return STEPS.find((s) => stepBlocker(s, f) !== null) ?? STEPS[STEPS.length - 1]!;
}

/** Where a request for `step` lands: the step itself, or the furthest reachable one before it. */
export function resolveStep(step: StepId, f: WizardFacts): StepId {
  if (canEnter(step, f)) return step;
  const furthest = furthestReachable(f);
  return stepIndex(furthest) < stepIndex(step) ? furthest : step;
}

export function nextStep(step: StepId): StepId | null {
  return STEPS[stepIndex(step) + 1] ?? null;
}

export function prevStep(step: StepId): StepId | null {
  const i = stepIndex(step);
  return i > 0 ? STEPS[i - 1]! : null;
}
