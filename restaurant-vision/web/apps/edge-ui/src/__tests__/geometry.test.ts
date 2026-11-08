import { describe, expect, it } from 'vitest';
import {
  addVertex,
  boxFromCorners,
  centroid,
  hitTestEdge,
  hitTestShapes,
  hitTestVertex,
  inArrow,
  insertOnEdge,
  isValidPolygon,
  moveVertex,
  nudgeVertex,
  pointInPolygon,
  polygonArea,
  removeVertex,
  segmentSide,
  toNormalized,
  translate,
  type Pt,
} from '../lib/geometry';

const square: Pt[] = [
  [0.2, 0.2],
  [0.6, 0.2],
  [0.6, 0.6],
  [0.2, 0.6],
];

describe('polygon edits', () => {
  it('adds a vertex at the end or at an index, clamped to the image', () => {
    expect(addVertex([], [0.5, 0.5])).toEqual([[0.5, 0.5]]);
    expect(addVertex(square, [1.4, -0.2])).toEqual([...square, [1, 0]]);
    expect(addVertex(square, [0.1, 0.1], 0)[0]).toEqual([0.1, 0.1]);
    expect(insertOnEdge(square, 1, [0.6, 0.4])).toEqual([
      [0.2, 0.2],
      [0.6, 0.2],
      [0.6, 0.4],
      [0.6, 0.6],
      [0.2, 0.6],
    ]);
  });

  it('moves a vertex without touching the others and never mutates the input', () => {
    const copy = structuredClone(square);
    const moved = moveVertex(square, 2, [0.7, 0.75]);
    expect(moved[2]).toEqual([0.7, 0.75]);
    expect(moved.filter((_, i) => i !== 2)).toEqual(square.filter((_, i) => i !== 2));
    expect(square).toEqual(copy);
    expect(moveVertex(square, 0, [-1, 2])[0]).toEqual([0, 1]);
    expect(nudgeVertex(square, 0, 0.01, -0.01)[0]).toEqual([0.21, 0.19]);
  });

  it('deletes a vertex; out-of-range indexes are a no-op', () => {
    expect(removeVertex(square, 1)).toEqual([square[0], square[2], square[3]]);
    expect(removeVertex(square, 9)).toEqual(square);
  });

  it('translates a whole shape but keeps it inside the image', () => {
    const t = translate(square, 0.6, 0);
    expect(Math.max(...t.map((p) => p[0]))).toBe(1);
    expect(t[0]![0]).toBeCloseTo(0.6);
  });

  it('measures area and validity like rv_contracts', () => {
    expect(polygonArea(square)).toBeCloseTo(0.16);
    expect(isValidPolygon(square)).toBe(true);
    expect(isValidPolygon(square.slice(0, 2))).toBe(false);
    expect(
      isValidPolygon([
        [0.1, 0.1],
        [0.2, 0.2],
        [0.3, 0.3],
      ]),
    ).toBe(false);
    expect(isValidPolygon([[0.1, 0.1], [1.2, 0.1], [0.5, 0.5]] as Pt[])).toBe(false);
    expect(centroid(square)[0]).toBeCloseTo(0.4);
  });
});

describe('pointer coordinates', () => {
  it.each([
    { rect: { left: 0, top: 0, width: 800, height: 450 }, client: [400, 225], expected: [0.5, 0.5] },
    { rect: { left: 100, top: 50, width: 320, height: 180 }, client: [180, 95], expected: [0.25, 0.25] },
    { rect: { left: 10, top: 20, width: 1920, height: 1080 }, client: [1930, 1100], expected: [1, 1] },
    { rect: { left: 10, top: 20, width: 640, height: 360 }, client: [0, 0], expected: [0, 0] },
  ])('normalizes $client on a $rect.width x $rect.height element', ({ rect, client, expected }) => {
    expect(toNormalized(client[0]!, client[1]!, rect)).toEqual(expected);
  });

  it('keeps 4 decimals and survives a zero-size element', () => {
    expect(toNormalized(1, 1, { left: 0, top: 0, width: 3, height: 3 })).toEqual([0.3333, 0.3333]);
    expect(toNormalized(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual([0, 0]);
  });
});

describe('hit testing (pixel radius on the rendered image)', () => {
  const wide = { width: 1600, height: 900 };
  const small = { width: 320, height: 180 };

  it('finds the nearest vertex within the radius in pixels', () => {
    // 0.01 of 1600 px = 16 px away: a hit with an 18 px radius, a miss with 10 px.
    expect(hitTestVertex(square, [0.61, 0.2], wide, 18)).toBe(1);
    expect(hitTestVertex(square, [0.61, 0.2], wide, 10)).toBe(-1);
    // The same normalized distance is only 3.2 px on a small picture.
    expect(hitTestVertex(square, [0.61, 0.2], small, 10)).toBe(1);
  });

  it('finds edges, including the closing edge of a polygon', () => {
    expect(hitTestEdge(square, [0.4, 0.205], wide, 12)).toBe(0);
    expect(hitTestEdge(square, [0.2, 0.4], wide, 12)).toBe(3);
    expect(hitTestEdge(square, [0.2, 0.4], wide, 12, false)).toBe(-1);
  });

  it('point in polygon is boundary-inclusive and picks the topmost shape', () => {
    expect(pointInPolygon([0.4, 0.4], square)).toBe(true);
    expect(pointInPolygon([0.2, 0.4], square)).toBe(true);
    expect(pointInPolygon([0.7, 0.4], square)).toBe(false);
    const shapes = [
      { id: 'under', points: square, closed: true },
      { id: 'over', points: square.map(([x, y]) => [x + 0.1, y] as Pt), closed: true },
      { id: 'line', points: [[0.1, 0.9], [0.9, 0.9]] as Pt[], closed: false },
    ];
    expect(hitTestShapes(shapes, [0.5, 0.4], wide)).toBe('over');
    expect(hitTestShapes(shapes, [0.25, 0.4], wide)).toBe('under');
    expect(hitTestShapes(shapes, [0.5, 0.905], wide)).toBe('line');
    expect(hitTestShapes(shapes, [0.95, 0.05], wide)).toBeNull();
  });
});

describe('entrance line direction', () => {
  it('matches segment_side: right-hand side on screen is +1', () => {
    // Drawn bottom to top: the right side is x > 0.5 (geometry.py docstring example).
    expect(segmentSide([0.5, 1], [0.5, 0], [0.8, 0.5])).toBe(1);
    expect(segmentSide([0.5, 1], [0.5, 0], [0.2, 0.5])).toBe(-1);
  });

  it('points the arrow to the inside and flips with in_direction', () => {
    const size = { width: 1000, height: 500 };
    const ltr = inArrow([0.5, 1], [0.5, 0], 'left_to_right', size);
    expect(ltr.to[0]).toBeGreaterThan(500);
    const rtl = inArrow([0.5, 1], [0.5, 0], 'right_to_left', size);
    expect(rtl.to[0]).toBeLessThan(500);
  });

  it('makes a box from two corners in any order', () => {
    expect(boxFromCorners([0.6, 0.7], [0.2, 0.1])).toEqual([0.2, 0.1, 0.6, 0.7]);
  });
});
