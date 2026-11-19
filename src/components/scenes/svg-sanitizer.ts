/**
 * Strict whitelist sanitizer for agent-authored `svg_raw` layers.
 *
 * - Only geometric / paint / filter elements are kept.
 * - Dangerous subtrees (script, foreignObject, style, iframe, image, a…) are
 *   removed entirely, together with their content.
 * - Event handlers (on*), `javascript:` and any external reference (http, //,
 *   data:) are stripped. `href` and `url()` may only point to local `#ids`.
 * - Every id is prefixed (and every local reference rewritten) so several
 *   panels can live in the same HTML document without collisions.
 */

export const ALLOWED_TAGS = new Set([
  'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath', 'defs', 'linearGradient', 'radialGradient', 'stop',
  'clipPath', 'mask', 'pattern', 'symbol', 'use', 'title', 'desc',
  'filter', 'feGaussianBlur', 'feOffset', 'feMerge', 'feMergeNode', 'feColorMatrix',
  'feBlend', 'feFlood', 'feComposite', 'feMorphology', 'feTurbulence',
  'feDisplacementMap', 'feDropShadow', 'feComponentTransfer', 'feFuncR', 'feFuncG',
  'feFuncB', 'feFuncA',
]);

const ALLOWED_ATTRS = new Set([
  'id', 'transform', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'fx', 'fy', 'fr', 'width', 'height', 'points', 'pathLength',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-miterlimit', 'opacity', 'clip-path', 'clip-rule', 'mask', 'filter',
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
  'spreadMethod', 'patternUnits', 'patternContentUnits', 'patternTransform', 'viewBox',
  'preserveAspectRatio', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
  'filterUnits', 'primitiveUnits', 'stdDeviation', 'dx', 'dy', 'in', 'in2', 'result',
  'mode', 'values', 'type', 'operator', 'k1', 'k2', 'k3', 'k4', 'radius',
  'baseFrequency', 'numOctaves', 'seed', 'stitchTiles', 'scale', 'xChannelSelector',
  'yChannelSelector', 'flood-color', 'flood-opacity', 'tableValues', 'slope',
  'intercept', 'amplitude', 'exponent', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'word-spacing',
  'href', 'xlink:href', 'startOffset', 'paint-order', 'mix-blend-mode', 'visibility',
  'display', 'rotate', 'lengthAdjust', 'textLength', 'transform-origin',
  'vector-effect', 'style', 'shape-rendering', 'color',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-miterlimit', 'opacity', 'stop-color', 'stop-opacity', 'font-family',
  'font-size', 'font-weight', 'font-style', 'text-anchor', 'letter-spacing',
  'mix-blend-mode', 'paint-order', 'display', 'visibility', 'flood-color',
  'flood-opacity', 'filter', 'clip-path', 'mask', 'transform', 'transform-origin',
]);

/** Elements dropped together with their whole content. */
const DROP_SUBTREE = new Set([
  'script', 'style', 'foreignObject', 'iframe', 'object', 'embed', 'image', 'img',
  'a', 'animate', 'animateTransform', 'animateMotion', 'set', 'audio', 'video',
  'canvas', 'html', 'body', 'head', 'link', 'meta', 'svg', 'feImage', 'switch',
  'handler', 'listener',
]);

export interface SanitizeOptions {
  /** Prefix applied to all ids (and local references). */
  idPrefix?: string;
}

export interface SanitizeResult {
  svg: string;
  /** Human-readable list of everything that was removed. */
  warnings: string[];
}

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'open'; name: string; attrs: Array<[string, string]>; selfClosing: boolean }
  | { kind: 'close'; name: string }
  | { kind: 'skip'; what: string };

const ATTR_RE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function decodeEntities(v: string): string {
  return v
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(v: string): string {
  // Keep existing entities, escape stray < and bare &.
  return v.replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const lt = input.indexOf('<', i);
    if (lt === -1) {
      tokens.push({ kind: 'text', value: input.slice(i) });
      break;
    }
    if (lt > i) tokens.push({ kind: 'text', value: input.slice(i, lt) });

    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4);
      i = end === -1 ? input.length : end + 3;
      tokens.push({ kind: 'skip', what: 'comment' });
      continue;
    }
    if (input.startsWith('<![CDATA[', lt)) {
      const end = input.indexOf(']]>', lt);
      i = end === -1 ? input.length : end + 3;
      tokens.push({ kind: 'skip', what: 'CDATA section' });
      continue;
    }
    if (input.startsWith('<?', lt) || input.startsWith('<!', lt)) {
      const end = input.indexOf('>', lt);
      i = end === -1 ? input.length : end + 1;
      tokens.push({ kind: 'skip', what: 'declaration/processing instruction' });
      continue;
    }

    // Find the end of the tag, respecting quoted attribute values.
    let j = lt + 1;
    let quote: string | null = null;
    while (j < input.length) {
      const ch = input[j]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
      j++;
    }
    const raw = input.slice(lt + 1, j);
    i = j + 1;

    if (raw.startsWith('/')) {
      tokens.push({ kind: 'close', name: raw.slice(1).trim().split(/\s/)[0] ?? '' });
      continue;
    }
    const selfClosing = /\/\s*$/.test(raw);
    const body = selfClosing ? raw.replace(/\/\s*$/, '') : raw;
    const nameMatch = body.match(/^\s*([^\s/>]+)/);
    if (!nameMatch) {
      tokens.push({ kind: 'text', value: '<' });
      i = lt + 1;
      continue;
    }
    const name = nameMatch[1]!;
    const attrSrc = body.slice(nameMatch[0].length);
    const attrList: Array<[string, string]> = [];
    let m: RegExpExecArray | null;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(attrSrc)) !== null) {
      attrList.push([m[1]!, decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')]);
    }
    tokens.push({ kind: 'open', name, attrs: attrList, selfClosing });
  }
  return tokens;
}

const DANGEROUS_VALUE = /(javascript|vbscript|data)\s*:|expression\s*\(|@import|behavior\s*:|-moz-binding/i;

function rewriteUrlRefs(value: string, prefix: string | undefined): string | null {
  let ok = true;
  const out = value.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (_m, _q, ref: string) => {
    const r = ref.trim();
    if (!r.startsWith('#')) {
      ok = false;
      return '';
    }
    return `url(#${prefix ? `${prefix}-` : ''}${r.slice(1)})`;
  });
  return ok ? out : null;
}

function sanitizeStyle(style: string, prefix: string | undefined, warnings: string[]): string {
  const kept: string[] = [];
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    let val = decl.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop)) {
      if (prop) warnings.push(`Removed style property "${prop}"`);
      continue;
    }
    if (DANGEROUS_VALUE.test(val)) {
      warnings.push(`Removed dangerous style value in "${prop}"`);
      continue;
    }
    const rewritten = rewriteUrlRefs(val, prefix);
    if (rewritten === null) {
      warnings.push(`Removed external url() in style "${prop}"`);
      continue;
    }
    val = rewritten;
    kept.push(`${prop}:${val}`);
  }
  return kept.join(';');
}

export function sanitizeSvgMarkup(markup: string, options: SanitizeOptions = {}): SanitizeResult {
  const prefix = options.idPrefix;
  const warnings: string[] = [];
  const tokens = tokenize(markup);
  const out: string[] = [];
  /** Stack of open elements; `kept=false` means we are inside a dropped subtree. */
  const stack: Array<{ name: string; kept: boolean }> = [];
  const dropping = () => stack.some((s) => !s.kept);

  for (const tok of tokens) {
    if (tok.kind === 'skip') {
      warnings.push(`Removed ${tok.what}`);
      continue;
    }
    if (tok.kind === 'text') {
      if (!dropping()) out.push(escapeText(tok.value));
      continue;
    }
    if (tok.kind === 'close') {
      // Pop until matching element (tolerates malformed nesting).
      const idx = [...stack].reverse().findIndex((s) => s.name === tok.name);
      if (idx === -1) continue;
      const realIdx = stack.length - 1 - idx;
      const popped = stack.splice(realIdx);
      if (!dropping()) {
        for (const p of popped.reverse()) if (p.kept) out.push(`</${p.name}>`);
      }
      continue;
    }

    // Open tag.
    const allowed = ALLOWED_TAGS.has(tok.name);
    if (dropping() || !allowed) {
      if (!dropping()) {
        warnings.push(
          DROP_SUBTREE.has(tok.name) || DROP_SUBTREE.has(tok.name.toLowerCase())
            ? `Removed forbidden <${tok.name}> element and its content`
            : `Removed unsupported <${tok.name}> element and its content`,
        );
      }
      if (!tok.selfClosing) stack.push({ name: tok.name, kept: false });
      continue;
    }

    const parts: string[] = [];
    for (const [rawName, rawValue] of tok.attrs) {
      const name = rawName;
      const lower = name.toLowerCase();
      if (lower.startsWith('on')) {
        warnings.push(`Removed event handler "${name}" on <${tok.name}>`);
        continue;
      }
      if (!ALLOWED_ATTRS.has(name)) {
        warnings.push(`Removed attribute "${name}" on <${tok.name}>`);
        continue;
      }
      let value = rawValue;
      if (DANGEROUS_VALUE.test(value) && name !== 'style') {
        warnings.push(`Removed dangerous value in "${name}" on <${tok.name}>`);
        continue;
      }
      if (name === 'href' || name === 'xlink:href') {
        if (!value.trim().startsWith('#')) {
          warnings.push(`Removed external reference "${name}" on <${tok.name}>`);
          continue;
        }
        value = `#${prefix ? `${prefix}-` : ''}${value.trim().slice(1)}`;
        parts.push(`href="${escapeAttr(value)}"`);
        continue;
      }
      if (name === 'id') {
        value = `${prefix ? `${prefix}-` : ''}${value}`;
      } else if (name === 'style') {
        value = sanitizeStyle(value, prefix, warnings);
        if (!value) continue;
      } else if (/url\(/i.test(value)) {
        const rewritten = rewriteUrlRefs(value, prefix);
        if (rewritten === null) {
          warnings.push(`Removed external url() in "${name}" on <${tok.name}>`);
          continue;
        }
        value = rewritten;
      }
      parts.push(`${name}="${escapeAttr(value)}"`);
    }

    const attrStr = parts.length ? ` ${parts.join(' ')}` : '';
    if (tok.selfClosing) out.push(`<${tok.name}${attrStr}/>`);
    else {
      out.push(`<${tok.name}${attrStr}>`);
      stack.push({ name: tok.name, kept: true });
    }
  }

  // Close any unclosed kept elements.
  for (const s of stack.reverse()) if (s.kept) out.push(`</${s.name}>`);

  return { svg: out.join(''), warnings };
}
