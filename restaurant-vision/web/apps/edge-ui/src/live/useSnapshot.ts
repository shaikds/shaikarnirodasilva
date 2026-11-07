// The blurred setup snapshot of one camera as an in-memory object URL. Privacy: the image is
// never written to any storage; the URL is revoked as soon as it is replaced or unmounted, and
// every request is cache-busted and `no-store`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalApi } from '../api/LocalApiProvider';

export interface SnapshotState {
  url: string | null;
  loading: boolean;
  error: unknown;
  /** Wall-clock ms of the image on screen. */
  takenAt: number | null;
  refresh: () => void;
}

export function useSnapshot(
  cameraId: string | null,
  options: { autoRefreshMs?: number; enabled?: boolean } = {},
): SnapshotState {
  const api = useLocalApi();
  const { autoRefreshMs, enabled = true } = options;
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [takenAt, setTakenAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const urlRef = useRef<string | null>(null);

  const replaceUrl = useCallback((next: string | null) => {
    const old = urlRef.current;
    urlRef.current = next;
    setUrl(next);
    if (old) URL.revokeObjectURL(old);
  }, []);

  // A different camera: drop the old picture right away.
  useEffect(() => {
    replaceUrl(null);
    setError(null);
    setTakenAt(null);
  }, [cameraId, replaceUrl]);

  useEffect(() => {
    if (!cameraId || !enabled) return;
    const ctrl = new AbortController();
    setLoading(true);
    api
      .snapshot(cameraId, ctrl.signal)
      .then((blob) => {
        if (ctrl.signal.aborted) return;
        replaceUrl(URL.createObjectURL(blob));
        setTakenAt(Date.now());
        setError(null);
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [api, cameraId, enabled, nonce, replaceUrl]);

  // Auto refresh: schedule the next picture once the current one has arrived (no overlap).
  useEffect(() => {
    if (!autoRefreshMs || !enabled || loading || !cameraId) return;
    const id = setTimeout(() => setNonce((n) => n + 1), autoRefreshMs);
    return () => clearTimeout(id);
  }, [autoRefreshMs, enabled, loading, cameraId, takenAt, error]);

  useEffect(() => () => replaceUrl(null), [replaceUrl]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { url, loading, error, takenAt, refresh };
}
