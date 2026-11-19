import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { composeEpisode } from '../src/engine/composer.js';
import { analyzeEpisodeNarrative } from '../src/engine/narrative-analyzer.js';
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

  it('scores narrative depth, flashback memoryTint, and dialogue friction via analyzeEpisodeNarrative', () => {
    const richEpisode = validateEpisode({
      title: 'Blood of the White Frost',
      theme: 'dark-fantasy',
      narrativeArc: {
        emotionalAnchor: 'Save younger brother Kori from frost-lung',
        centralConflict: 'Chief Brak orders the clan to abandon the dying boy',
        protagonistChoice: 'Taru accepts the Solar Heart curse to steal eternal fire',
        ironicCostOrTwist: 'He sleeps 3,000 years during the metamorphosis',
      },
      cast: [
        {
          id: 'taru',
          name: 'Taru',
          role: 'protagonist',
          silhouettePreset: 'primitive-hunter',
          narrativeProfile: {
            coreGoal: 'Bring fire back to Kori',
            woundOrFlaw: 'Refuses to abandon blood-kin',
            speechStyle: 'Short primal metaphors of bone, ember and frost',
          },
        },
        {
          id: 'brak',
          name: 'Chefe Brak',
          role: 'supporting',
          silhouettePreset: 'primitive-hunter',
          narrativeProfile: {
            coreGoal: 'Save the healthy hunters of the clan',
            woundOrFlaw: 'Hardened by thirty winters of famine',
            speechStyle: 'Cold tribal proverbs',
          },
        },
      ],
      panels: [
        {
          id: 'p1',
          height: 520,
          narrativeBeat: 'conflict-escalation',
          subtextNote: 'Brak masks his guilt behind ruthless survival law',
          layers: [{ type: 'backdrop', kind: 'solid', colors: ['#080A12'] }],
          bubbles: [
            { id: 'b1', characterId: 'brak', type: 'speech', text: 'Leave the boy, Taru.', position: { x: 30, y: 20 } },
            { id: 'b2', characterId: 'taru', type: 'speech', text: 'Then walk without me.', position: { x: 70, y: 60 } },
          ],
        },
        {
          id: 'p2',
          height: 500,
          narrativeBeat: 'flashback-memory',
          subtextNote: 'Taru remembers his oath to Kori before the last ember died',
          memoryTint: 'sepia-flashback',
          layers: [{ type: 'backdrop', kind: 'solid', colors: ['#1A120B'] }],
          bubbles: [
            { id: 'b3', characterId: 'taru', type: 'thought', text: 'Hold on until I return.', position: { x: 40, y: 30 } },
            { id: 'b4', characterId: 'taru', type: 'speech', text: 'I swear on our father’s flint.', position: { x: 65, y: 70 } },
          ],
        },
      ],
    });

    expect(richEpisode.success).toBe(true);
    if (!richEpisode.success) return;

    const analysis = analyzeEpisodeNarrative(richEpisode.data, 1);
    expect(analysis.score).toBeGreaterThanOrEqual(85);
    expect(['S', 'A']).toContain(analysis.grade);

    const composed = composeEpisode(richEpisode.data);
    expect(composed.panels[1]!.svg).toContain('data-memory-tint="sepia-flashback"');
  });
});
