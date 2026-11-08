// Uniform colour from the edge (hue in degrees, saturation and value 0..1) as a CSS colour.
/** HSV -> `hsl()` for a swatch. */
export function hsvToCss([h, s, v]: readonly [number, number, number]): string {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return `hsl(${Math.round(h)} ${Math.round(sl * 100)}% ${Math.round(l * 100)}%)`;
}
