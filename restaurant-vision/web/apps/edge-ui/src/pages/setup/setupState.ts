// Context, hook and query keys of the setup wizard (the provider is in SetupContext.tsx).
import type { SiteConfig } from '@rv/shared';
import { createContext, useContext } from 'react';
import type { CameraOut, SetupStatus } from '../../api/types';
import type { Issue } from '../../lib/validation';
import type { WizardFacts } from '../../lib/wizard';

export const SETUP_STATUS_KEY = ['local', 'setup-status'] as const;
export const CONFIG_KEY = ['local', 'config'] as const;
export const CAMERAS_KEY = ['local', 'cameras'] as const;
export const COVERAGE_KEY = ['local', 'coverage'] as const;

export interface SetupContextValue {
  status: SetupStatus | undefined;
  statusLoading: boolean;
  refetchStatus: () => void;
  pinOk: boolean;
  /** Draft config (null until loaded or while locked). */
  config: SiteConfig | null;
  /** What the edge has (null: no config saved yet). */
  serverConfig: SiteConfig | null;
  configLoading: boolean;
  configError: unknown;
  setConfig: (update: (config: SiteConfig) => SiteConfig) => void;
  /** Throws away unsaved edits. */
  resetDraft: () => void;
  dirty: boolean;
  /** Saves the draft (or `next`) with `PUT /local/config`. Resolves true on success. */
  save: (next?: SiteConfig) => Promise<boolean>;
  saving: boolean;
  saveError: unknown;
  clearSaveError: () => void;
  streams: CameraOut[];
  streamsLoading: boolean;
  refetchStreams: () => Promise<unknown>;
  pairSkipped: boolean;
  setPairSkipped: (value: boolean) => void;
  issues: Issue[];
  facts: WizardFacts;
}

export const SetupContext = createContext<SetupContextValue | null>(null);

export function useSetup(): SetupContextValue {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error('useSetup must be used inside <SetupProvider>');
  return ctx;
}
