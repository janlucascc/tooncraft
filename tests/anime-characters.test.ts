import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { composeEpisode } from '../src/engine/composer.js';
import { validateEpisode } from '../src/schema/index.js';

describe('high-fidelity anime/manhwa character engine & Pass-2 detail features', () => {
  it('validates and rasterizes primitive-hunter with Pass-2 accessories, weaponProp, and detailOverlaySvg', () => {
    const episode = {
      title: 'Pass 2 Character Showcase',
      theme: 'dark-fantasy',
      cast: [
        {
          id: 'taru',
          name: 'Taru',
          role: 'protagonist',
          silhouettePreset: 'primitive-hunter',
          eyeStyle: 'sharp-hunter',
          hairStyle: 'wild-primitive',
          accessories: ['scar-eye', 'tribal-marks', 'bone-necklace', 'earring'],
          palette: {
            skin: '#C68663',
            hair: '#1C120C',
            eyes: '#F59E0B',
            outfitPrimary: '#4A3222',
            outfitAccent: '#D97706',
            aura: '#F59E0B',
          },
        },
      ],
      panels: [
        {
          id: 'p1-hunter-close',
          height: 600,
          camera: 'close-up',
          frame: { type: 'standard' },
          layers: [
            { type: 'backdrop', kind: 'solid', colors: ['#0B0A10'] },
            {
              type: 'character_figure',
              characterId: 'taru',
              framing: 'close-up',
              pose: 'standing',
              expression: 'determined',
              position: { x: 50, y: 98 },
              shadingIntensity: 'heavy',
              lightDirection: 'bottom-fire',
              rimLightColor: '#F59E0B',
              auraIntensity: 0.7,
              weaponProp: 'stone-spear',
              detailOverlaySvg:
                '<circle cx="0" cy="-415" r="10" fill="#F59E0B" fill-opacity="0.45"/><path d="M-2 -415L-18 -435M2 -415L18 -435" fill="none" stroke="#FEF08A" stroke-width="1.5"/>',
            },
          ],
          bubbles: [],
          sfx: [],
        },
        {
          id: 'p2-awakening-full',
          height: 800,
          camera: 'low-angle',
          frame: { type: 'full-bleed', borderWidth: 0 },
          layers: [
            { type: 'backdrop', kind: 'radial-gradient', colors: ['#3B120B', '#09060C'] },
            {
              type: 'character_figure',
              characterId: 'taru',
              framing: 'full-body',
              pose: 'power-awakening',
              expression: 'pain',
              position: { x: 50, y: 94 },
              shadingIntensity: 'dramatic-noir',
              lightDirection: 'right',
              glowEyes: true,
              auraIntensity: 0.9,
              weaponProp: 'stone-spear',
            },
          ],
          bubbles: [],
          sfx: [],
        },
      ],
    };

    const validated = validateEpisode(episode);
    expect(validated.success).toBe(true);

    const composed = composeEpisode(episode);
    expect(composed.panels).toHaveLength(2);
    expect(composed.panels[0]!.svg).toContain('data-pass2-detail="true"');
    expect(composed.panels[0]!.svg).toContain('irisgrad');

    // Rasterize both panels with resvg to verify zero geom.rs issues
    for (const p of composed.panels) {
      const rendered = new Resvg(p.svg).render();
      expect(rendered.width).toBe(800);
    }
  });
});
