import type { FontPreset, ThemePreset } from '../schema/common.js';

/**
 * Fully resolved visual theme. Every renderer reads colors from here, so a
 * whole episode can be re-skinned by changing `theme` in story.json.
 */
export interface ResolvedTheme {
  name: ThemePreset;
  /** Scroll background between panels. */
  scrollBackground: string;
  /** Default panel border color. */
  panelBorder: string;
  /** Default bubble font preset. */
  fontPreset: FontPreset;
  /** Main accent (glows, highlights). */
  accent: string;
  /** Secondary accent. */
  accent2: string;
  /** Base dark tone used by procedural environments. */
  shadowTone: string;
  /** Sky / atmosphere base tones (top → bottom). */
  sky: [string, string];
  bubble: { fill: string; stroke: string; text: string };
  narration: { fill: string; stroke: string; text: string };
  system: { fill: string; stroke: string; text: string; accent: string; header: string };
  phone: { fill: string; stroke: string; text: string };
  sfx: { primary: string; stroke: string };
  /** HTML reader chrome. */
  reader: { background: string; text: string; muted: string };
}

const base = {
  bubble: { fill: '#FFFFFF', stroke: '#111111', text: '#111111' },
  sfx: { primary: '#FFFFFF', stroke: '#000000' },
};

export const THEMES: Record<ThemePreset, ResolvedTheme> = {
  'cyberpunk-neon': {
    name: 'cyberpunk-neon',
    scrollBackground: '#07060D',
    panelBorder: '#0B0B12',
    fontPreset: 'comic',
    accent: '#FF2E88',
    accent2: '#22D3EE',
    shadowTone: '#0D0A1A',
    sky: ['#1A0B2E', '#3B0F4F'],
    bubble: base.bubble,
    narration: { fill: '#0F0A1F', stroke: '#FF2E88', text: '#F5F3FF' },
    system: { fill: 'rgba(8,16,40,0.88)', stroke: '#22D3EE', text: '#E0F7FF', accent: '#22D3EE', header: '#FF2E88' },
    phone: { fill: '#22D3EE', stroke: '#0E7490', text: '#04131A' },
    sfx: { primary: '#FDE047', stroke: '#1A0B2E' },
    reader: { background: '#05040A', text: '#F5F3FF', muted: '#8B85A8' },
  },
  'dark-fantasy': {
    name: 'dark-fantasy',
    scrollBackground: '#0B0D13',
    panelBorder: '#050608',
    fontPreset: 'comic',
    accent: '#F59E0B',
    accent2: '#7C3AED',
    shadowTone: '#0E1016',
    sky: ['#111827', '#2A1E3B'],
    bubble: base.bubble,
    narration: { fill: '#1C1917', stroke: '#A16207', text: '#FEF3C7' },
    system: { fill: 'rgba(20,14,30,0.9)', stroke: '#A78BFA', text: '#EDE9FE', accent: '#A78BFA', header: '#F59E0B' },
    phone: { fill: '#E5E7EB', stroke: '#6B7280', text: '#111827' },
    sfx: { primary: '#FFFFFF', stroke: '#000000' },
    reader: { background: '#08090D', text: '#F3F4F6', muted: '#9CA3AF' },
  },
  'solo-system': {
    name: 'solo-system',
    scrollBackground: '#03060E',
    panelBorder: '#02040A',
    fontPreset: 'comic',
    accent: '#3B82F6',
    accent2: '#60A5FA',
    shadowTone: '#050B18',
    sky: ['#020617', '#0B1E3F'],
    bubble: base.bubble,
    narration: { fill: '#020817', stroke: '#1D4ED8', text: '#DBEAFE' },
    system: { fill: 'rgba(4,14,38,0.86)', stroke: '#60A5FA', text: '#E0EDFF', accent: '#60A5FA', header: '#93C5FD' },
    phone: { fill: '#1E3A8A', stroke: '#3B82F6', text: '#EFF6FF' },
    sfx: { primary: '#BFDBFE', stroke: '#020617' },
    reader: { background: '#02040A', text: '#E0EDFF', muted: '#6B84AD' },
  },
  'slice-of-life-pastel': {
    name: 'slice-of-life-pastel',
    scrollBackground: '#FFF8F1',
    panelBorder: '#3F3A44',
    fontPreset: 'comic',
    accent: '#F472B6',
    accent2: '#60A5FA',
    shadowTone: '#4B4453',
    sky: ['#BFE3FF', '#FFE4F1'],
    bubble: { fill: '#FFFFFF', stroke: '#3F3A44', text: '#2B2730' },
    narration: { fill: '#FFF1E6', stroke: '#F9A8D4', text: '#4B4453' },
    system: { fill: 'rgba(255,255,255,0.92)', stroke: '#F472B6', text: '#4B4453', accent: '#F472B6', header: '#60A5FA' },
    phone: { fill: '#BFDBFE', stroke: '#60A5FA', text: '#1E293B' },
    sfx: { primary: '#F472B6', stroke: '#FFFFFF' },
    reader: { background: '#FFF8F1', text: '#2B2730', muted: '#8C8494' },
  },
  'noir-thriller': {
    name: 'noir-thriller',
    scrollBackground: '#000000',
    panelBorder: '#000000',
    fontPreset: 'modern',
    accent: '#DC2626',
    accent2: '#E5E7EB',
    shadowTone: '#0A0A0A',
    sky: ['#0A0A0A', '#1F2937'],
    bubble: { fill: '#F5F5F5', stroke: '#000000', text: '#0A0A0A' },
    narration: { fill: '#0A0A0A', stroke: '#525252', text: '#E5E5E5' },
    system: { fill: 'rgba(10,10,10,0.92)', stroke: '#DC2626', text: '#F5F5F5', accent: '#DC2626', header: '#F5F5F5' },
    phone: { fill: '#262626', stroke: '#525252', text: '#F5F5F5' },
    sfx: { primary: '#F5F5F5', stroke: '#000000' },
    reader: { background: '#000000', text: '#E5E5E5', muted: '#737373' },
  },
  'action-shonen': {
    name: 'action-shonen',
    scrollBackground: '#FFFFFF',
    panelBorder: '#000000',
    fontPreset: 'comic',
    accent: '#EF4444',
    accent2: '#F97316',
    shadowTone: '#1C1917',
    sky: ['#FDE68A', '#FB923C'],
    bubble: base.bubble,
    narration: { fill: '#FFFBEB', stroke: '#000000', text: '#111111' },
    system: { fill: 'rgba(17,17,17,0.9)', stroke: '#F97316', text: '#FFF7ED', accent: '#F97316', header: '#FDE68A' },
    phone: { fill: '#FFEDD5', stroke: '#F97316', text: '#111111' },
    sfx: { primary: '#FDE047', stroke: '#000000' },
    reader: { background: '#F5F5F4', text: '#111111', muted: '#78716C' },
  },
  custom: {
    name: 'custom',
    scrollBackground: '#0B0D13',
    panelBorder: '#000000',
    fontPreset: 'comic',
    accent: '#38BDF8',
    accent2: '#F472B6',
    shadowTone: '#0F172A',
    sky: ['#0F172A', '#1E293B'],
    bubble: base.bubble,
    narration: { fill: '#111827', stroke: '#38BDF8', text: '#F9FAFB' },
    system: { fill: 'rgba(8,15,30,0.9)', stroke: '#38BDF8', text: '#E0F2FE', accent: '#38BDF8', header: '#F472B6' },
    phone: { fill: '#E5E7EB', stroke: '#9CA3AF', text: '#111827' },
    sfx: base.sfx,
    reader: { background: '#0B0D13', text: '#F9FAFB', muted: '#94A3B8' },
  },
};

export interface ThemeOverrides {
  backgroundColor?: string;
  fontPreset?: FontPreset;
}

export function resolveTheme(preset: ThemePreset, overrides: ThemeOverrides = {}): ResolvedTheme {
  const t = THEMES[preset];
  return {
    ...t,
    scrollBackground: overrides.backgroundColor ?? t.scrollBackground,
    fontPreset: overrides.fontPreset ?? t.fontPreset,
    reader: { ...t.reader, background: overrides.backgroundColor ?? t.reader.background },
  };
}
