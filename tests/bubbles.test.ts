import { describe, expect, it } from 'vitest';
import { BubbleSchema, type BubbleType } from '../src/schema/bubble.js';
import { resolveTheme } from '../src/templates/themes.js';
import { DefsCollector, IdFactory } from '../src/components/svg-utils.js';
import { renderBubble } from '../src/components/bubbles/render-bubble.js';

const ALL_TYPES: BubbleType[] = [
  'speech',
  'thought',
  'shout',
  'whisper',
  'narration',
  'system_window',
  'phone_chat',
  'telepathy',
];

describe('bubbles & tail-router', () => {
  it.each(ALL_TYPES)('renders valid SVG for bubble type "%s"', (type) => {
    const bubble = BubbleSchema.parse({
      id: `b-${type}`,
      type,
      text: 'Testing **bold** and *italic* text inside a bubble.',
      position: { x: 50, y: 40 },
      tail: { enabled: true, style: type === 'thought' ? 'dots' : 'curved', target: { x: 30, y: 80 } },
      style: type === 'system_window' ? { headerTitle: '[ ALERT ]' } : undefined,
    });
    const defs = new DefsCollector(new IdFactory('t'));
    const svg = renderBubble(bubble, {
      box: { width: 800, height: 600 },
      defs,
      theme: resolveTheme('solo-system'),
    });
    expect(svg).toContain(`data-bubble-type="${type}"`);
    expect(svg).toContain('<text');
    expect(svg).toContain('<tspan');
    if (type === 'system_window') expect(svg).toContain('[ ALERT ]');
    if (type === 'thought') expect(svg).toContain('<circle');
  });

  it.each(['left', 'right', 'top', 'bottom'] as const)(
    'supports offscreen tail direction "%s"',
    (dir) => {
      const bubble = BubbleSchema.parse({
        id: `off-${dir}`,
        type: 'speech',
        text: 'Offscreen speaker!',
        position: { x: 50, y: 50 },
        tail: { enabled: true, style: 'sharp', offscreenDirection: dir },
      });
      const svg = renderBubble(bubble, {
        box: { width: 800, height: 600 },
        defs: new DefsCollector(new IdFactory('o')),
        theme: resolveTheme('cyberpunk-neon'),
      });
      // Two tail passes (stroke + fill) + body path = at least 3 <path> elements.
      expect((svg.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(3);
    },
  );
});
