import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeBackoff, LiveSocket, type LiveStatus } from '../live/socket';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close() {}
  open() {
    this.onopen?.();
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  drop(code = 1006) {
    this.onclose?.({ code });
  }
}

describe('computeBackoff', () => {
  it('grows exponentially up to the cap', () => {
    const mid = () => 0.5;
    expect(computeBackoff(0, undefined, mid)).toBe(1000);
    expect(computeBackoff(1, undefined, mid)).toBe(2000);
    expect(computeBackoff(3, undefined, mid)).toBe(8000);
    expect(computeBackoff(10, undefined, mid)).toBe(30000);
  });

  it('applies jitter within +-20%', () => {
    expect(computeBackoff(2, undefined, () => 0)).toBe(3200);
    expect(computeBackoff(2, undefined, () => 0.999999)).toBe(4800);
  });
});

describe('LiveSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
  });
  afterEach(() => vi.useRealTimers());

  function make(extra: Partial<ConstructorParameters<typeof LiveSocket>[0]> = {}) {
    const statuses: LiveStatus[] = [];
    const events: unknown[] = [];
    let n = 0;
    const socket = new LiveSocket({
      getUrl: () => `ws://x/ws?token=t${++n}`,
      onEvent: (e) => events.push(e),
      onStatus: (s) => statuses.push(s),
      backoff: { jitter: 0 },
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
      ...extra,
    });
    return { socket, statuses, events };
  }

  it('connects, delivers valid events and ignores garbage', () => {
    const { socket, statuses, events } = make();
    socket.start();
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.message({ type: 'occupancy.snapshot', site_id: 's', ts: 1 });
    FakeSocket.instances[0]!.message({ hello: 'world' });
    FakeSocket.instances[0]!.onmessage?.({ data: 'not json' });
    expect(statuses).toEqual(['connecting', 'open']);
    expect(events).toHaveLength(1);
    socket.stop();
  });

  it('passes edge live.snapshot messages to onSnapshot', () => {
    const onSnapshot = vi.fn();
    const { socket, events } = make({ onSnapshot });
    socket.start();
    FakeSocket.instances[0]!.open();
    const snapshot = {
      site_id: 's',
      ts: 1,
      tables: [],
      occupancy: null,
      queues: [],
      open_alerts: [],
      devices: [],
    };
    FakeSocket.instances[0]!.message({ type: 'live.snapshot', snapshot });
    FakeSocket.instances[0]!.message({ type: 'live.snapshot', snapshot: { nope: true } });
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
    expect(events).toHaveLength(0);
    socket.stop();
  });

  it('reconnects with backoff and a fresh URL', () => {
    const onOpen = vi.fn();
    const { socket, statuses } = make({ onOpen });
    socket.start();
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.drop();
    expect(statuses.at(-1)).toBe('reconnecting');
    vi.advanceTimersByTime(999);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1]!.url).toContain('token=t2');
    FakeSocket.instances[1]!.drop();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2); // second attempt waits 2 s
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(3);
    FakeSocket.instances[2]!.open();
    expect(onOpen).toHaveBeenLastCalledWith(true);
    socket.stop();
  });

  it('refreshes auth once on 4401 and stops on 4403', async () => {
    const refreshAuth = vi.fn(async () => true);
    const { socket, statuses } = make({ refreshAuth });
    socket.start();
    FakeSocket.instances[0]!.drop(4401);
    await vi.runOnlyPendingTimersAsync();
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1]!.drop(4403);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(statuses.at(-1)).toBe('closed');
  });

  it('stops on 4400 (bad request): retrying cannot help', () => {
    const { socket, statuses } = make();
    socket.start();
    FakeSocket.instances[0]!.drop(4400);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(statuses.at(-1)).toBe('closed');
  });
});
