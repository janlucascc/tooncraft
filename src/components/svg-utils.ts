/**
 * Pure SVG helpers shared by every renderer.
 */

/** Escape text for use inside SVG/XML text nodes and attribute values. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Round to 2 decimals to keep SVG output compact and stable. */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Format a number for SVG output. */
export function fmt(n: number): string {
  const v = r2(n);
  return Object.is(v, -0) ? '0' : String(v);
}

type AttrValue = string | number | boolean | undefined | null;

/** Serialize attributes, skipping undefined/null/false values. */
export function attrs(map: Record<string, AttrValue>): string {
  let out = '';
  for (const [k, v] of Object.entries(map)) {
    if (v === undefined || v === null || v === false) continue;
    const val = v === true ? k : typeof v === 'number' ? fmt(v) : escapeXml(v);
    out += ` ${k}="${val}"`;
  }
  return out;
}

/** Build an element string. */
export function el(tag: string, attributes: Record<string, AttrValue> = {}, children?: string): string {
  const a = attrs(attributes);
  return children === undefined || children === ''
    ? `<${tag}${a}/>`
    : `<${tag}${a}>${children}</${tag}>`;
}

/**
 * Generates document-unique ids for <defs> (gradients, clipPaths, filters).
 * Each panel uses its own prefix so multiple inline SVGs in the HTML reader
 * never collide.
 */
export class IdFactory {
  private counter = 0;
  constructor(public readonly prefix: string) {}
  next(kind: string): string {
    this.counter += 1;
    return `${this.prefix}-${kind}-${this.counter}`;
  }
}

/** Collects <defs> entries while a panel is rendered. */
export class DefsCollector {
  private readonly entries: string[] = [];
  private readonly keyed = new Map<string, string>();
  constructor(public readonly ids: IdFactory) {}

  /** Add a definition and return its id. */
  add(kind: string, build: (id: string) => string): string {
    const id = this.ids.next(kind);
    this.entries.push(build(id));
    return id;
  }

  /** Add a definition once per key (e.g. shared glow filter). */
  once(key: string, kind: string, build: (id: string) => string): string {
    const existing = this.keyed.get(key);
    if (existing) return existing;
    const id = this.add(kind, build);
    this.keyed.set(key, id);
    return id;
  }

  toString(): string {
    return this.entries.length ? `<defs>${this.entries.join('')}</defs>` : '';
  }
}

export interface PanelBox {
  width: number;
  height: number;
}

/** Percent (0–100) → pixel conversion inside a panel. */
export function pctX(box: PanelBox, x: number): number {
  return (x / 100) * box.width;
}
export function pctY(box: PanelBox, y: number): number {
  return (y / 100) * box.height;
}
export function pctPoint(box: PanelBox, p: { x: number; y: number }): { x: number; y: number } {
  return { x: pctX(box, p.x), y: pctY(box, p.y) };
}

/** Points → SVG polygon "points" attribute. */
export function pointsAttr(points: ReadonlyArray<{ x: number; y: number }>): string {
  return points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
}

/** Points → closed path data. */
export function polygonPath(points: ReadonlyArray<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M${fmt(first!.x)} ${fmt(first!.y)}${rest.map((p) => `L${fmt(p.x)} ${fmt(p.y)}`).join('')}Z`;
}

/** Glow filter (blurred copy merged under the source). */
export function glowFilter(id: string, stdDeviation: number, color?: string, strength = 1): string {
  const flood = color
    ? `<feFlood flood-color="${escapeXml(color)}" flood-opacity="${fmt(strength)}" result="c"/><feComposite in="c" in2="b" operator="in" result="b"/>`
    : '';
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="${fmt(stdDeviation)}" result="b"/>${flood}<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

/** Simple gaussian blur filter. */
export function blurFilter(id: string, stdDeviation: number): string {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${fmt(stdDeviation)}"/></filter>`;
}

/** Linear gradient with stops; angle in degrees (0 = left→right, 90 = top→bottom). */
export function linearGradient(
  id: string,
  stops: ReadonlyArray<{ offset: number; color: string; opacity?: number }>,
  angleDeg = 90,
  units: 'objectBoundingBox' | 'userSpaceOnUse' = 'objectBoundingBox',
  box?: { x1: number; y1: number; x2: number; y2: number },
): string {
  let coords: Record<string, number>;
  if (box) coords = box;
  else {
    const a = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(a) / 2;
    const dy = Math.sin(a) / 2;
    coords = { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
  }
  const s = stops
    .map((st) =>
      el('stop', { offset: st.offset, 'stop-color': st.color, 'stop-opacity': st.opacity }),
    )
    .join('');
  return el('linearGradient', { id, gradientUnits: units, ...coords }, s);
}

export function radialGradient(
  id: string,
  stops: ReadonlyArray<{ offset: number; color: string; opacity?: number }>,
  opts: { cx?: number; cy?: number; r?: number; fx?: number; fy?: number; units?: 'objectBoundingBox' | 'userSpaceOnUse' } = {},
): string {
  const s = stops
    .map((st) =>
      el('stop', { offset: st.offset, 'stop-color': st.color, 'stop-opacity': st.opacity }),
    )
    .join('');
  return el(
    'radialGradient',
    {
      id,
      gradientUnits: opts.units ?? 'objectBoundingBox',
      cx: opts.cx ?? 0.5,
      cy: opts.cy ?? 0.5,
      r: opts.r ?? 0.5,
      fx: opts.fx,
      fy: opts.fy,
    },
    s,
  );
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(color: string): Rgba {
  const c = color.trim();
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((ch) => ch + ch).join('');
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1]!.split(',').map((p) => parseFloat(p.trim()));
    return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function toHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Mix two colors; t=0 → a, t=1 → b. Returns opaque hex. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
    a: 1,
  });
}

export const darken = (c: string, t: number) => mix(c, '#000000', t);
export const lighten = (c: string, t: number) => mix(c, '#ffffff', t);

/** Relative luminance 0..1. */
export function luminance(color: string): number {
  const { r, g, b } = parseColor(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
