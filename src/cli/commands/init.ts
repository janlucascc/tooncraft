import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WebtoonEpisodeInput } from '../../schema/story.js';

export interface InitCommandOptions {
  force?: boolean;
}

const STARTER_EPISODE: WebtoonEpisodeInput = {
  schemaVersion: '1.0.0',
  title: 'Untitled Awakening',
  episodeNumber: 1,
  author: 'Your Name',
  genre: 'Action Fantasy',
  synopsis: 'Starter ToonCraft episode showing procedural scenery, character silhouettes, bubbles and pacing.',
  theme: 'solo-system',
  canvas: {
    width: 800,
    sliceMaxHeight: 1280,
  },
  cast: [
    {
      id: 'hero',
      name: 'Kael',
      role: 'protagonist',
      silhouettePreset: 'hooded-mage',
      palette: {
        skin: '#F2C9AC',
        hair: '#141B2D',
        eyes: '#38BDF8',
        outfitPrimary: '#1E293B',
        outfitAccent: '#38BDF8',
        aura: '#38BDF8',
      },
    },
  ],
  panels: [
    {
      id: 'p1-establishing',
      height: 760,
      camera: 'establishing',
      moodDescription: 'Hero stands before a glowing dungeon cavern.',
      frame: { type: 'full-bleed', borderWidth: 0 },
      layers: [
        { type: 'backdrop', kind: 'night-sky', colors: ['#020617', '#0F172A', '#1E3A8A'], starsDensity: 0.5 },
        { type: 'environment', preset: 'dungeon-cavern', perspectiveY: 72, fogOpacity: 0.35 },
        {
          type: 'character_figure',
          characterId: 'hero',
          framing: 'full-body',
          pose: 'facing-away',
          expression: 'neutral',
          position: { x: 50, y: 98 },
          scale: 0.72,
        },
        { type: 'effect', kind: 'mana-particles', color: '#60A5FA', intensity: 0.5 },
      ],
      bubbles: [
        {
          id: 'b1-narration',
          type: 'narration',
          text: 'Every hunter remembers the first time the gate called their name.',
          position: { x: 50, y: 14 },
          maxWidth: 460,
        },
      ],
      pacingAfter: 'dramatic_pause',
      pacingTransition: 'fade-to-black',
      seed: 101,
    },
    {
      id: 'p2-awakening',
      height: 620,
      camera: 'close-up',
      moodDescription: 'Close-up with glowing eyes and holographic system notification.',
      frame: { type: 'diagonal-both', skewDeg: 5, borderWidth: 4 },
      layers: [
        { type: 'backdrop', kind: 'radial-gradient', colors: ['#1E3A8A', '#020617'] },
        {
          type: 'character_figure',
          characterId: 'hero',
          framing: 'close-up',
          pose: 'standing',
          expression: 'menacing-glow',
          position: { x: 50, y: 100 },
          scale: 1.05,
          glowEyes: true,
        },
        { type: 'effect', kind: 'speedlines-radial', color: '#93C5FD', intensity: 0.55 },
      ],
      bubbles: [
        {
          id: 'b2-system',
          type: 'system_window',
          text: 'You have met the requirements to become a **Player**.\nWill you accept?',
          position: { x: 50, y: 24 },
          maxWidth: 420,
          style: { headerTitle: '[ SYSTEM NOTIFICATION ]' },
        },
        {
          id: 'b3-hero',
          characterId: 'hero',
          type: 'speech',
          text: '**Accept.**',
          position: { x: 74, y: 82 },
          maxWidth: 180,
          tail: { enabled: true, style: 'sharp', target: { x: 54, y: 66 } },
        },
      ],
      sfx: [
        {
          id: 'sfx1-ping',
          text: 'DING!!',
          style: 'glow',
          position: { x: 18, y: 48 },
          fontSize: 48,
          rotation: -12,
          primaryColor: '#93C5FD',
          strokeColor: '#020617',
        },
      ],
      pacingAfter: 'normal',
      seed: 202,
    },
  ],
};

export function runInit(dir: string, opts: InitCommandOptions): number {
  const targetDir = resolve(dir);
  const filePath = join(targetDir, 'story.json');

  if (existsSync(filePath) && !opts.force) {
    console.error(`✖ "${filePath}" already exists. Pass --force to overwrite.`);
    return 1;
  }

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(STARTER_EPISODE, null, 2) + '\n', 'utf8');
  console.log(`✔ Created starter episode at ${filePath}`);
  console.log(`  Next: tooncraft render "${filePath}" --format html --out ./out`);
  return 0;
}
