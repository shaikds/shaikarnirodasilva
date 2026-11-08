// Wizard chrome: progress (stepper), the current step, Back / Next. Steps are URL routes
// (`/setup/<step>`); a step that is not reachable yet redirects to the furthest one that is.
import { Button, cn, LoadingBlock, PageHeader, useTranslation } from '@rv/shared';
import { ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { ServerErrors } from '../../components/ServerErrors';
import {
  canEnter,
  CONFIG_STEPS,
  furthestReachable,
  isStepId,
  nextStep,
  OPTIONAL_STEPS,
  prevStep,
  resolveStep,
  stepBlocker,
  stepIndex,
  STEPS,
  type StepId,
} from '../../lib/wizard';
import { CamerasStep } from './CamerasStep';
import { CoverageStep } from './CoverageStep';
import { LiveStep } from './LiveStep';
import { PairStep } from './PairStep';
import { PinStep } from './PinStep';
import { ReviewStep } from './ReviewStep';
import { useSetup } from './setupState';
import { TablesStep } from './TablesStep';
import { UniformStep } from './UniformStep';
import { ZonesStep } from './ZonesStep';

export interface StepProps {
  /** Moves on after the step finished its own action (e.g. PIN accepted). */
  onDone: () => void;
}

const STEP_COMPONENTS: Record<StepId, ComponentType<StepProps>> = {
  pin: PinStep,
  pair: PairStep,
  cameras: CamerasStep,
  tables: TablesStep,
  zones: ZonesStep,
  uniform: UniformStep,
  coverage: CoverageStep,
  review: ReviewStep,
  live: LiveStep,
};

export function SetupLayout() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t('setup.title')} subtitle={t('setup.subtitle')} />
      <Outlet />
    </div>
  );
}

function useReady(): boolean {
  const ctx = useSetup();
  return !ctx.statusLoading && !ctx.configLoading;
}

/** `/setup`: open the furthest step the installer can work on. */
export function SetupIndex() {
  const ctx = useSetup();
  if (!useReady()) return <LoadingBlock />;
  return <Navigate to={furthestReachable(ctx.facts)} replace />;
}

export function SetupStepRoute() {
  const { step } = useParams();
  const ctx = useSetup();
  const ready = useReady();
  // Gating applies when a step is entered. Once inside, a half-typed edit that briefly makes an
  // earlier step invalid (e.g. clearing a seats field) must not throw the installer out; only
  // losing the PIN does.
  const entered = useRef<StepId | null>(null);
  if (!isStepId(step)) return <Navigate to="/setup" replace />;
  if (!ready) return <LoadingBlock />;
  const stillInside = entered.current === step && (ctx.facts.pinOk || step === 'pin');
  if (!stillInside && !canEnter(step, ctx.facts)) {
    entered.current = null;
    return <Navigate to={`/setup/${resolveStep(step, ctx.facts)}`} replace />;
  }
  entered.current = step;
  return <WizardFrame step={step} />;
}

function WizardFrame({ step }: { step: StepId }) {
  const { t } = useTranslation();
  const ctx = useSetup();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [attempted, setAttempted] = useState(false);
  const Step = STEP_COMPONENTS[step];
  const index = stepIndex(step);
  const blocker = stepBlocker(step, ctx.facts);
  const next = nextStep(step);
  const back = prevStep(step);
  const isConfigStep = CONFIG_STEPS.includes(step);

  // Move focus to the step heading on step change (screen readers, keyboard users).
  useEffect(() => {
    setAttempted(false);
    window.scrollTo?.({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const leave = async (target: StepId | null) => {
    if (isConfigStep && ctx.dirty && ctx.config) {
      const ok = await ctx.save();
      if (!ok) return false;
    }
    if (target) navigate(`/setup/${target}`);
    else navigate('/');
    return true;
  };

  const goNext = async () => {
    setAttempted(true);
    // Saving first can clear "unsaved" on the review step.
    if (blocker && blocker !== 'unsaved') return;
    await leave(next);
  };

  const skipPair = () => {
    ctx.setPairSkipped(true);
    navigate(`/setup/${next}`);
  };

  const nextLabel =
    step === 'live'
      ? t('setup.finish')
      : step === 'review'
        ? t('setup.saveAndContinue')
        : isConfigStep && ctx.dirty
          ? t('setup.saveAndNext')
          : step === 'uniform'
            ? t('setup.nextOrSkip')
            : t('setup.next');

  return (
    <div className="flex flex-col gap-4">
      <Stepper current={step} onGo={(s) => void leave(s)} />

      <section aria-labelledby="step-title" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="step-title" ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none sm:text-xl">
            {t(`steps.${step}.title`)}
          </h2>
          <span className="text-sm text-muted">
            {t('setup.stepOf', { n: index + 1, total: STEPS.length })}
            {OPTIONAL_STEPS.includes(step) && ` · ${t('setup.optional')}`}
          </span>
        </div>
        <p className="mb-4 max-w-3xl text-sm text-muted">{t(`steps.${step}.intro`)}</p>
        <Step onDone={() => void leave(next)} />
      </section>

      {isConfigStep && ctx.saveError != null && (
        <ServerErrors error={ctx.saveError} title={t('setup.saveFailed')} onDismiss={ctx.clearSaveError} />
      )}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="lg"
            disabled={!back || ctx.saving}
            onClick={() => back && void leave(back)}
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:-scale-x-100" />
            {t('setup.back')}
          </Button>
          <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
            {blocker && blocker !== 'unsaved' && (attempted || step !== 'pin') && (
              <p id="next-blocker" role={attempted ? 'alert' : undefined} className="text-sm text-muted">
                {t(`blockers.${blocker}`)}
              </p>
            )}
            {step === 'pair' && !ctx.facts.paired && (
              <Button variant="secondary" size="lg" onClick={skipPair}>
                {t('pair.skip')}
              </Button>
            )}
            <Button
              size="lg"
              loading={ctx.saving}
              aria-disabled={!!blocker && blocker !== 'unsaved' ? true : undefined}
              aria-describedby={blocker && blocker !== 'unsaved' ? 'next-blocker' : undefined}
              className={cn(blocker && blocker !== 'unsaved' && 'opacity-60')}
              onClick={() => void goNext()}
            >
              {nextLabel}
              <ArrowRight aria-hidden="true" className="h-4 w-4 rtl:-scale-x-100" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stepper({ current, onGo }: { current: StepId; onGo: (step: StepId) => void }) {
  const { t } = useTranslation();
  const ctx = useSetup();
  const currentIndex = stepIndex(current);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [current]);

  return (
    <nav aria-label={t('setup.progress')}>
      <div
        className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label={t('setup.progress')}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={currentIndex + 1}
        aria-valuetext={t('setup.stepOf', { n: currentIndex + 1, total: STEPS.length })}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${((currentIndex + 1) / STEPS.length) * 100}%` }}
        />
      </div>
      <ol ref={listRef} className="flex gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const reachable = canEnter(s, ctx.facts);
          const done = i < currentIndex && stepBlocker(s, ctx.facts) === null;
          const isCurrent = s === current;
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  isCurrent
                    ? 'border-primary bg-primary text-primary-fg'
                    : done
                      ? 'border-success bg-success-soft text-success'
                      : 'border-border bg-surface text-muted',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : !reachable ? <Lock className="h-3 w-3" /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{t(`steps.${s}.short`)}</span>
              {done && <span className="sr-only">{t('setup.done')}</span>}
            </>
          );
          return (
            <li key={s} className="shrink-0">
              {reachable && !isCurrent ? (
                <button
                  type="button"
                  onClick={() => onGo(s)}
                  className="flex min-h-tap items-center gap-2 rounded-lg px-2 text-sm text-fg hover:bg-surface-2"
                >
                  {content}
                </button>
              ) : (
                <span
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-disabled={!reachable || undefined}
                  className={cn(
                    'flex min-h-tap items-center gap-2 rounded-lg px-2 text-sm',
                    isCurrent ? 'bg-primary-soft font-semibold text-primary' : 'text-muted',
                  )}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
