import { describe, expect, it } from 'vitest';
import { sanitizeSvgMarkup } from '../src/components/scenes/svg-sanitizer.js';

describe('svg-sanitizer', () => {
  it('preserves legitimate SVG geometry, gradients and local #id references while prefixing ids', () => {
    const input = `<defs><linearGradient id="g1"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M0 0L100 100" fill="url(#g1)"/>`;
    const res = sanitizeSvgMarkup(input, { idPrefix: 'p0' });
    expect(res.warnings).toEqual([]);
    expect(res.svg).toContain('id="p0-g1"');
    expect(res.svg).toContain('fill="url(#p0-g1)"');
  });

  it('strips <script>, <foreignObject>, <image>, event handlers, javascript: and external URLs', () => {
    const hostile =
      `<g onclick="alert(1)">` +
      `<script>alert("xss")</script>` +
      `<foreignObject><body>evil</body></foreignObject>` +
      `<image href="https://evil.example/a.png"/>` +
      `<a href="javascript:alert(2)"><rect width="10" height="10"/></a>` +
      `<rect width="50" height="50" fill="url(https://evil.example/x#g)" onload="hack()"/>` +
      `</g>`;
    const res = sanitizeSvgMarkup(hostile, { idPrefix: 'safe' });
    expect(res.warnings.length).toBeGreaterThanOrEqual(5);
    expect(res.svg).not.toContain('script');
    expect(res.svg).not.toContain('alert');
    expect(res.svg).not.toContain('foreignObject');
    expect(res.svg).not.toContain('evil');
    expect(res.svg).not.toContain('onclick');
    expect(res.svg).not.toContain('onload');
    expect(res.svg).not.toContain('javascript:');
    expect(res.svg).toContain('<rect width="50" height="50"/>');
  });
});
