// The SVG editor turns pointer events into normalized coordinates at any rendered size.
import type { Zone } from '@rv/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZoneCanvas } from '../components/ZoneCanvas';
import { setupEdgeI18n } from '../test/utils';

let rect = { left: 0, top: 0, width: 400, height: 200 };
beforeEach(async () => {
  await setupEdgeI18n('en');
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect,
  );
});
afterEach(() => vi.useRealTimers());

const queue: Zone = {
  zone_id: 'q',
  camera_id: 'c',
  kind: 'queue',
  polygon: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.75, 0.75],
    [0.25, 0.75],
  ],
  line: null,
  table_id: null,
  primary: false,
};

const canvas = () => screen.getByTestId('zone-canvas');
const down = (x: number, y: number, extra: Record<string, unknown> = {}) =>
  fireEvent.pointerDown(canvas(), { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse', ...extra });

describe('ZoneCanvas', () => {
  it.each([
    { width: 400, height: 200, left: 0, top: 0 },
    { width: 1200, height: 600, left: 40, top: 100 },
  ])('adds vertices in normalized coordinates on a $width x $height canvas, closes on the first point', (r) => {
    rect = r;
    const onDrawPoint = vi.fn();
    const onDrawClose = vi.fn();
    const { rerender } = render(
      <ZoneCanvas imageUrl={null} imageAlt="cam" zones={[]} tables={[]} drawing={{ kind: 'queue', points: [] }} onDrawPoint={onDrawPoint} onDrawClose={onDrawClose} />,
    );
    const at = (fx: number, fy: number) => [r.left + fx * r.width, r.top + fy * r.height] as const;
    down(...at(0.25, 0.25));
    down(...at(0.75, 0.25));
    down(...at(0.75, 0.75));
    expect(onDrawPoint.mock.calls.map((c) => c[0])).toEqual([
      [0.25, 0.25],
      [0.75, 0.25],
      [0.75, 0.75],
    ]);
    rerender(
      <ZoneCanvas
        imageUrl={null}
        imageAlt="cam"
        zones={[]}
        tables={[]}
        drawing={{ kind: 'queue', points: onDrawPoint.mock.calls.map((c) => c[0]) }}
        onDrawPoint={onDrawPoint}
        onDrawClose={onDrawClose}
      />,
    );
    // A tap 5 px from the first point closes the polygon instead of adding a point.
    const [fx, fy] = at(0.25, 0.25);
    down(fx + 5, fy);
    expect(onDrawClose).toHaveBeenCalledTimes(1);
    expect(onDrawPoint).toHaveBeenCalledTimes(3);
  });

  it('drags a vertex of the selected zone', () => {
    rect = { left: 0, top: 0, width: 400, height: 200 };
    const onZonePoints = vi.fn();
    render(<ZoneCanvas imageUrl={null} imageAlt="cam" zones={[queue]} tables={[]} selectedZoneId="q" onZonePoints={onZonePoints} onSelectVertex={vi.fn()} />);
    down(100, 50); // vertex 0 at (0.25, 0.25)
    fireEvent.pointerMove(canvas(), { clientX: 60, clientY: 30, pointerId: 1 });
    expect(onZonePoints).toHaveBeenLastCalledWith('q', [
      [0.15, 0.15],
      [0.75, 0.25],
      [0.75, 0.75],
      [0.25, 0.75],
    ]);
    fireEvent.pointerUp(canvas(), { pointerId: 1 });
  });

  it('right-click deletes a vertex; long-press deletes on touch', () => {
    rect = { left: 0, top: 0, width: 400, height: 200 };
    const onDeleteVertex = vi.fn();
    render(<ZoneCanvas imageUrl={null} imageAlt="cam" zones={[queue]} tables={[]} selectedZoneId="q" onDeleteVertex={onDeleteVertex} onSelectVertex={vi.fn()} />);
    fireEvent.pointerDown(canvas(), { clientX: 300, clientY: 50, pointerId: 2, button: 2, pointerType: 'mouse' });
    fireEvent.contextMenu(canvas(), { clientX: 300, clientY: 50 });
    expect(onDeleteVertex).toHaveBeenCalledWith('q', 1);

    vi.useFakeTimers();
    down(300, 150, { pointerType: 'touch', pointerId: 3 });
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onDeleteVertex).toHaveBeenLastCalledWith('q', 2);
  });

  it('selects the shape under the pointer and deselects on empty space', () => {
    rect = { left: 0, top: 0, width: 400, height: 200 };
    const onSelect = vi.fn();
    render(<ZoneCanvas imageUrl={null} imageAlt="cam" zones={[queue]} tables={[]} onSelect={onSelect} onSelectVertex={vi.fn()} />);
    down(200, 100);
    expect(onSelect).toHaveBeenLastCalledWith('q');
    down(20, 190);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('keyboard: arrows nudge a focused vertex, Delete removes it', () => {
    const onZonePoints = vi.fn();
    const onDeleteVertex = vi.fn();
    render(
      <ZoneCanvas imageUrl={null} imageAlt="cam" zones={[queue]} tables={[]} selectedZoneId="q" onZonePoints={onZonePoints} onDeleteVertex={onDeleteVertex} onSelectVertex={vi.fn()} />,
    );
    const v = screen.getByRole('button', { name: /Point 1 of 4/ });
    fireEvent.keyDown(v, { key: 'ArrowRight' });
    expect(onZonePoints.mock.calls[0]![1][0]).toEqual([0.255, 0.25]);
    fireEvent.keyDown(v, { key: 'Delete' });
    expect(onDeleteVertex).toHaveBeenCalledWith('q', 0);
  });

  it('draws the entrance line with an arrow towards the inside', () => {
    const line: Zone = { ...queue, zone_id: 'l', kind: 'entrance_line', polygon: null, line: { a: [0.5, 1], b: [0.5, 0], in_direction: 'left_to_right' } };
    render(<ZoneCanvas imageUrl={null} imageAlt="cam" zones={[line]} tables={[]} />);
    const arrow = screen.getByTestId('in-arrow-l');
    expect(Number(arrow.getAttribute('x2'))).toBeGreaterThan(Number(arrow.getAttribute('x1')));
  });
});
