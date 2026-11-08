// State shared by the wizard steps: setup status, the PIN session, the draft SiteConfig (loaded
// from `GET /local/config`, saved with `PUT /local/config`), the edge's stored camera streams and
// the facts the step gating works from.
import { currentLanguage, type SiteConfig } from '@rv/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocalApi, usePinSession } from '../../api/context';
import type { CameraOut, SetupStatus } from '../../api/types';
import { emptyConfig, forSite, sameConfig } from '../../lib/config';
import { isStatus } from '../../lib/errors';
import { errorsOf, validateConfig, type Issue } from '../../lib/validation';
import type { WizardFacts } from '../../lib/wizard';

export const SETUP_STATUS_KEY = ['local', 'setup-status'] as const;
export const CONFIG_KEY = ['local', 'config'] as const;
export const CAMERAS_KEY = ['local', 'cameras'] as const;
export const COVERAGE_KEY = ['local', 'coverage'] as const;

const PAIR_SKIP_KEY = 'rv-edge-pair-skipped';

function readSkip(): boolean {
  try {
    return window.sessionStorage.getItem(PAIR_SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSkip(value: boolean) {
  try {
    if (value) window.sessionStorage.setItem(PAIR_SKIP_KEY, '1');
    else window.sessionStorage.removeItem(PAIR_SKIP_KEY);
  } catch {
    // ignore
  }
}

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

const SetupContext = createContext<SetupContextValue | null>(null);

export function SetupProvider({ children }: { children: ReactNode }) {
  const api = useLocalApi();
  const session = usePinSession();
  const qc = useQueryClient();

  const statusQuery = useQuery({
    queryKey: SETUP_STATUS_KEY,
    queryFn: ({ signal }) => api.setupStatus(signal),
    refetchInterval: 15_000,
  });
  const status = statusQuery.data;
  const pinOk = session.pin !== null && status?.pin_set !== false && session.problem !== 'locked';

  const configQuery = useQuery({
    queryKey: CONFIG_KEY,
    enabled: pinOk,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      try {
        return await api.getConfig(signal);
      } catch (err) {
        if (isStatus(err, 404)) return null; // no config yet: start a new one
        throw err;
      }
    },
  });

  const streamsQuery = useQuery({
    queryKey: CAMERAS_KEY,
    enabled: pinOk,
    queryFn: ({ signal }) => api.listCameras(signal),
    refetchInterval: 15_000,
  });

  const serverConfig = configQuery.data ?? null;
  const [draft, setDraft] = useState<SiteConfig | null>(null);
  const draftBase = useRef<SiteConfig | null>(null);

  // Adopt the server config when it (re)loads, unless the installer has unsaved edits.
  useEffect(() => {
    if (configQuery.data === undefined) return;
    setDraft((current) => {
      const untouched = current === null || sameConfig(current, draftBase.current);
      if (!untouched) return current;
      const next = configQuery.data ?? emptyConfig(status?.site_id, currentLanguage());
      draftBase.current = configQuery.data ?? null;
      return next;
    });
  }, [configQuery.data, status?.site_id]);

  // Locking (wrong PIN) drops the draft so nothing stale is shown after unlocking again.
  useEffect(() => {
    if (!pinOk) {
      setDraft(null);
      draftBase.current = null;
    }
  }, [pinOk]);

  const setConfig = useCallback((update: (config: SiteConfig) => SiteConfig) => {
    setDraft((current) => (current ? update(current) : current));
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(serverConfig ?? emptyConfig(status?.site_id, currentLanguage()));
    draftBase.current = serverConfig;
  }, [serverConfig, status?.site_id]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const save = useCallback(
    async (next?: SiteConfig) => {
      const body = next ?? draft;
      if (!body) return false;
      setSaving(true);
      setSaveError(null);
      try {
        const saved = await api.putConfig(forSite(body, status?.paired ? status.site_id : null));
        draftBase.current = saved;
        qc.setQueryData(CONFIG_KEY, saved);
        setDraft(saved);
        void qc.invalidateQueries({ queryKey: SETUP_STATUS_KEY });
        void qc.invalidateQueries({ queryKey: COVERAGE_KEY });
        void qc.invalidateQueries({ queryKey: CAMERAS_KEY });
        return true;
      } catch (err) {
        setSaveError(err);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [api, draft, qc, status?.paired, status?.site_id],
  );

  const [pairSkipped, setSkip] = useState(readSkip);
  const setPairSkipped = useCallback((value: boolean) => {
    writeSkip(value);
    setSkip(value);
  }, []);

  const dirty = draft !== null && !sameConfig(draft, serverConfig);
  const issues = useMemo(() => (draft ? validateConfig(draft) : []), [draft]);

  const facts = useMemo<WizardFacts>(() => {
    const errors = errorsOf(issues);
    // Two primary zones for one table is fixed on the zones step.
    const isZoneError = (i: Issue) => i.entity === 'zone' || i.code === 'multiplePrimary';
    return {
      pinOk,
      paired: !!status?.paired,
      pairSkipped,
      cameraCount: draft?.cameras.length ?? 0,
      tableCount: draft?.tables.length ?? 0,
      zoneCount: draft?.zones.length ?? 0,
      tableErrors: errors.filter((i) => i.entity === 'table' && !isZoneError(i)).length,
      zoneErrors: errors.filter(isZoneError).length,
      configErrors: errors.length,
      dirty,
    };
  }, [issues, draft, pinOk, status?.paired, pairSkipped, dirty]);

  const value: SetupContextValue = {
    status,
    statusLoading: statusQuery.isLoading,
    refetchStatus: () => void statusQuery.refetch(),
    pinOk,
    config: draft,
    serverConfig,
    configLoading: pinOk && (configQuery.isLoading || (configQuery.isSuccess && draft === null)),
    configError: configQuery.error,
    setConfig,
    resetDraft,
    dirty,
    save,
    saving,
    saveError,
    clearSaveError: () => setSaveError(null),
    streams: streamsQuery.data ?? [],
    streamsLoading: streamsQuery.isLoading,
    refetchStreams: () => streamsQuery.refetch(),
    pairSkipped,
    setPairSkipped,
    issues,
    facts,
  };
  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function useSetup(): SetupContextValue {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error('useSetup must be used inside <SetupProvider>');
  return ctx;
}
