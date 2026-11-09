import { describe, expect, it } from 'vitest';
import type { EdgeEvent, LiveSnapshot } from '../contracts';
import { alertWaitingS, applyEvent, isDeviceOnline } from '../live/applyEvent';

const base = {
  event_id: '01900000-0000-7000-8000-000000000000',
  site_id: 's1',
  schema_version: '1.0',
};

function snapshot(): LiveSnapshot {
  return {
    site_id: 's1',
    ts: 1000,
    tables: [
      {
        table_id: 't1',
        label: '1',
        seats: 4,
        state: 'empty',
        guest_count: 0,
        since_ts: 900,
        open_alert_ids: [],
      },
      {
        table_id: 't2',
        label: '2',
        seats: 2,
        state: 'attended',
        guest_count: 2,
        since_ts: 950,
        open_alert_ids: [],
      },
    ],
    occupancy: { ts: 990, guests: 2, tables_occupied: 1, tables_total: 2, staff_on_floor: 3 },
    queues: [],
    open_alerts: [],
    devices: [],
  };
}

const ev = (e: Partial<EdgeEvent> & Pick<EdgeEvent, 'type' | 'ts'>) =>
  ({ ...base, ...e }) as EdgeEvent;

describe('applyEvent', () => {
  it('moves a table to its new state and restarts its timer', () => {
    const s = applyEvent(
      snapshot(),
      ev({
        type: 'table.state_changed',
        ts: 1001,
        table_id: 't1',
        from_state: 'empty',
        to_state: 'seated',
        guest_count: 3,
        session_id: 'x',
      } as never),
    );
    expect(s.tables[0]).toMatchObject({ state: 'seated', guest_count: 3, since_ts: 1001 });
  });

  it('starts the timer at the backdated since_ts (contracts 1.1)', () => {
    const s = applyEvent(
      snapshot(),
      ev({
        type: 'table.state_changed',
        ts: 1030,
        table_id: 't1',
        from_state: 'empty',
        to_state: 'seated',
        guest_count: 2,
        session_id: 'x',
        since_ts: 1005,
      } as never),
    );
    expect(s.tables[0]).toMatchObject({ state: 'seated', since_ts: 1005 });
    // Stale check on the same value: a transition that began before the current state is old.
    const stale = applyEvent(
      s,
      ev({
        type: 'table.state_changed',
        ts: 1040,
        table_id: 't1',
        from_state: 'seated',
        to_state: 'empty',
        guest_count: 0,
        session_id: 'x',
        since_ts: 1001,
      } as never),
    );
    expect(stale).toBe(s);
  });

  it('ignores stale state changes', () => {
    const before = snapshot();
    const s = applyEvent(
      before,
      ev({
        type: 'table.state_changed',
        ts: 800,
        table_id: 't1',
        from_state: 'seated',
        to_state: 'empty',
        guest_count: 0,
        session_id: 'x',
      } as never),
    );
    expect(s).toBe(before);
  });

  it('runs the alert lifecycle: raised, acknowledged (anonymous), resolved', () => {
    let s = applyEvent(
      snapshot(),
      ev({
        type: 'alert.raised',
        ts: 1002,
        alert_id: 'a1',
        kind: 'waiter_needed',
        table_id: 't1',
        zone_id: null,
        severity: 'warn',
      } as never),
    );
    expect(s.open_alerts).toHaveLength(1);
    expect(s.open_alerts[0]).toMatchObject({
      alert_id: 'a1',
      status: 'open',
      table_label: '1',
      raised_at: 1002,
    });
    expect(s.tables[0]!.open_alert_ids).toEqual(['a1']);

    s = applyEvent(
      s,
      ev({
        type: 'alert.acknowledged',
        ts: 1003,
        alert_id: 'a1',
        ack_at: 1003,
        via: 'cloud',
      } as never),
    );
    expect(s.open_alerts[0]).toMatchObject({
      status: 'acknowledged',
      acked_at: 1003,
      ack_via: 'cloud',
    });
    expect(Object.keys(s.open_alerts[0]!)).not.toContain('user_id');

    s = applyEvent(
      s,
      ev({
        type: 'alert.resolved',
        ts: 1004,
        alert_id: 'a1',
        resolved_at: 1004,
        reason: 'staff_visit',
      } as never),
    );
    expect(s.open_alerts).toHaveLength(0);
    expect(s.tables[0]!.open_alert_ids).toEqual([]);
  });

  it('copies condition_since_ts and measures the wait from it', () => {
    const s = applyEvent(
      snapshot(),
      ev({
        type: 'alert.raised',
        ts: 1200,
        alert_id: 'a2',
        kind: 'waiter_needed',
        table_id: 't1',
        zone_id: null,
        severity: 'warn',
        condition_since_ts: 1010,
      } as never),
    );
    const alert = s.open_alerts[0]!;
    expect(alert.condition_since_ts).toBe(1010);
    expect(alertWaitingS(alert, 1250)).toBe(240);
    // 1.0 producers: no condition_since_ts, fall back to raised_at; never negative.
    expect(alertWaitingS({ ...alert, condition_since_ts: null }, 1250)).toBe(50);
    expect(alertWaitingS(alert, 1000)).toBe(0);
  });

  it('does not duplicate a replayed alert', () => {
    const raised = ev({
      type: 'alert.raised',
      ts: 1002,
      alert_id: 'a1',
      kind: 'long_queue',
      table_id: null,
      zone_id: 'q',
      severity: 'warn',
    } as never);
    const s = applyEvent(applyEvent(snapshot(), raised), raised);
    expect(s.open_alerts).toHaveLength(1);
    expect(s.open_alerts[0]!.table_label).toBeNull();
  });

  it('updates queue, occupancy and device health', () => {
    let s = applyEvent(
      snapshot(),
      ev({
        type: 'queue.snapshot',
        ts: 1005,
        zone_id: 'q',
        people: 5,
        parties_est: 2,
        longest_wait_s: 300,
        avg_wait_s: 120,
      } as never),
    );
    expect(s.queues).toEqual([
      { zone_id: 'q', ts: 1005, people: 5, parties_est: 2, longest_wait_s: 300, avg_wait_s: 120 },
    ]);
    s = applyEvent(
      s,
      ev({
        type: 'occupancy.snapshot',
        ts: 1006,
        guests: 9,
        tables_occupied: 2,
        tables_total: 2,
        staff_on_floor: 4,
      } as never),
    );
    expect(s.occupancy?.guests).toBe(9);
    s = applyEvent(
      s,
      ev({
        type: 'occupancy.snapshot',
        ts: 900,
        guests: 1,
        tables_occupied: 0,
        tables_total: 2,
        staff_on_floor: 1,
      } as never),
    );
    expect(s.occupancy?.guests).toBe(9);
    s = applyEvent(
      s,
      ev({
        type: 'edge.heartbeat',
        ts: 1007,
        device_id: 'd1',
        version: '0.1.0',
        cameras: [],
        cpu_pct: 30,
        mem_mb: 500,
        outbox_depth: 0,
        local_url: 'http://192.168.1.20:8787',
      } as never),
    );
    expect(s.devices[0]).toMatchObject({
      device_id: 'd1',
      online: true,
      last_seen_at: 1007,
      local_url: 'http://192.168.1.20:8787',
    });
    expect(isDeviceOnline(s.devices[0]!, 1050)).toBe(true);
    expect(isDeviceOnline(s.devices[0]!, 1200)).toBe(false);
  });

  it('ignores events of other sites', () => {
    const before = snapshot();
    expect(
      applyEvent(before, {
        ...ev({ type: 'occupancy.snapshot', ts: 2000 } as never),
        site_id: 'other',
      }),
    ).toBe(before);
  });
});
