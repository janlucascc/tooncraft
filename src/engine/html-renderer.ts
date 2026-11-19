import { readFileSync } from 'node:fs';
import { FONT_FACES, type FontKey, getFontPath } from '../components/font-metrics.js';
import { escapeXml } from '../components/svg-utils.js';
import type { ComposedEpisode } from './composer.js';

export interface HtmlRenderOptions {
  /** Embed the bundled .ttf fonts as base64 data URIs so the HTML works 100% offline (default true). */
  embedFonts?: boolean;
  /** Include interactive panel inspector drawer (default true). */
  includeInspector?: boolean;
}

function buildEmbeddedFontCss(): string {
  return (Object.keys(FONT_FACES) as FontKey[])
    .map((key) => {
      const f = FONT_FACES[key];
      const b64 = readFileSync(getFontPath(key)).toString('base64');
      return `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style};font-display:swap;src:url('data:font/ttf;base64,${b64}') format('truetype');}`;
    })
    .join('\n');
}

function safeJsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

/**
 * Compile a composed episode into a standalone, zero-dependency HTML5 vertical
 * webtoon reader with reading progress bar, mobile/desktop viewport toggle,
 * cinema/paper mode and interactive director inspector.
 */
export function renderToHtml(composed: ComposedEpisode, options: HtmlRenderOptions = {}): string {
  const { episode, theme, layout, panels } = composed;
  const embedFonts = options.embedFonts ?? true;
  const includeInspector = options.includeInspector ?? true;

  const fontCss = embedFonts ? buildEmbeddedFontCss() : '';

  const inspectorData = panels.map((p) => ({
    id: p.panel.id,
    index: p.layout.index + 1,
    height: p.panel.height,
    camera: p.panel.camera,
    frame: p.panel.frame.type,
    pacingAfter: p.panel.pacingAfter,
    pacingPx: p.gutterAfter?.layout.height ?? 0,
    pacingTransition: p.panel.pacingTransition,
    moodDescription: p.panel.moodDescription ?? '',
    layers: p.panel.layers.map((l) => l.type),
    bubbleCount: p.panel.bubbles.length,
    sfxCount: p.panel.sfx.length,
  }));

  const panelsHtml = panels
    .map((p) => {
      const gutter = p.gutterAfter?.svg
        ? `<div class="tc-gutter" style="aspect-ratio:${layout.width}/${p.gutterAfter.layout.height}">${p.gutterAfter.svg}</div>`
        : '';
      return (
        `<section class="tc-panel" data-panel-index="${p.layout.index}" data-panel-id="${escapeXml(p.panel.id)}" tabindex="0">` +
        p.svg +
        `</section>` +
        gutter
      );
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeXml(episode.title)} — Ep. ${episode.episodeNumber} | ToonCraft</title>
<style>
${fontCss}
:root{
  --tc-scroll-bg:${theme.scrollBackground};
  --tc-room-bg:${theme.reader.background};
  --tc-text:${theme.reader.text};
  --tc-muted:${theme.reader.muted};
  --tc-accent:${theme.accent};
  --tc-accent2:${theme.accent2};
  --tc-strip-w:${layout.width}px;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--tc-room-bg);color:var(--tc-text);font-family:'Noto Sans',system-ui,-apple-system,sans-serif;scroll-behavior:smooth}
body[data-room="cinema"]{--tc-room-bg:#040507;--tc-text:#F3F4F6;--tc-muted:#9CA3AF}
body[data-room="paper"]{--tc-room-bg:#F3EFE6;--tc-text:#1F2937;--tc-muted:#6B7280}
body[data-viewport="mobile"] .tc-stage{max-width:390px;border-left:1px solid rgba(255,255,255,.12);border-right:1px solid rgba(255,255,255,.12);box-shadow:0 0 60px rgba(0,0,0,.55)}
body[data-viewport="fit"] .tc-stage{max-width:min(100vw,1080px)}

.tc-bar{
  position:fixed;top:0;left:0;right:0;z-index:100;
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:10px 18px;
  background:rgba(8,10,16,.84);backdrop-filter:blur(12px);
  border-bottom:1px solid rgba(255,255,255,.08);
  color:#F8FAFC;transition:transform .24s ease;
}
.tc-bar.hidden{transform:translateY(-105%)}
.tc-meta{display:flex;align-items:baseline;gap:10px;min-width:0}
.tc-badge{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;background:var(--tc-accent);color:#050608;flex:none}
.tc-title{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-sub{font-size:12px;color:#94A3B8;white-space:nowrap}
.tc-controls{display:flex;align-items:center;gap:6px;flex:none}
.tc-btn{
  appearance:none;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);
  color:#E2E8F0;font-size:12px;font-weight:600;padding:5px 10px;border-radius:6px;cursor:pointer;
  transition:background .15s,border-color .15s;
}
.tc-btn:hover{background:rgba(255,255,255,.14);border-color:var(--tc-accent)}
.tc-btn.active{background:var(--tc-accent);color:#050608;border-color:var(--tc-accent)}
.tc-progress{position:fixed;top:0;left:0;height:3px;width:0%;background:linear-gradient(90deg,var(--tc-accent),var(--tc-accent2));z-index:120;transition:width .08s linear}

.tc-stage{
  width:100%;max-width:var(--tc-strip-w);margin:56px auto 0;
  background:var(--tc-scroll-bg);
  padding-top:${layout.topPadding}px;padding-bottom:${layout.bottomPadding}px;
  transition:max-width .2s ease;
}
.tc-panel,.tc-gutter{display:block;width:100%;line-height:0;position:relative}
.tc-panel svg,.tc-gutter svg{display:block;width:100%;height:auto}
.tc-panel:focus{outline:2px solid var(--tc-accent);outline-offset:-2px}
body.tc-inspecting .tc-panel{cursor:pointer}
body.tc-inspecting .tc-panel.selected{outline:2px solid var(--tc-accent);outline-offset:-2px}

.tc-footer{
  max-width:var(--tc-strip-w);margin:0 auto;padding:36px 20px 64px;text-align:center;
  color:var(--tc-muted);font-size:13px;
}
.tc-footer strong{color:var(--tc-text)}
.tc-end-rule{width:64px;height:3px;border-radius:99px;background:var(--tc-accent);margin:0 auto 16px}

.tc-drawer{
  position:fixed;top:52px;right:0;bottom:0;width:320px;max-width:90vw;z-index:95;
  background:rgba(10,12,20,.95);backdrop-filter:blur(14px);color:#E2E8F0;
  border-left:1px solid rgba(255,255,255,.1);padding:18px;overflow-y:auto;
  transform:translateX(100%);transition:transform .22s ease;
  font-size:13px;
}
.tc-drawer.open{transform:translateX(0)}
.tc-drawer h3{margin:0 0 12px;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--tc-accent)}
.tc-kv{display:grid;grid-template-columns:110px 1fr;gap:6px 10px;margin-bottom:14px}
.tc-kv dt{color:#94A3B8}
.tc-kv dd{margin:0;color:#F8FAFC;font-weight:600}
.tc-chips{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 14px}
.tc-chip{font-size:11px;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}
.tc-mood{padding:10px;border-radius:6px;background:rgba(255,255,255,.05);line-height:1.45;color:#CBD5E1;margin-bottom:14px}
.tc-panel-nav{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px;margin-top:10px}
.tc-panel-nav button{padding:5px;font-size:12px}
@media(max-width:640px){.tc-sub{display:none}.tc-bar{padding:8px 12px}}
</style>
</head>
<body data-viewport="desktop" data-room="episode">
<div class="tc-progress" id="tc-progress"></div>
<header class="tc-bar" id="tc-bar">
  <div class="tc-meta">
    <span class="tc-badge">EP ${episode.episodeNumber}</span>
    <span class="tc-title">${escapeXml(episode.title)}</span>
    <span class="tc-sub" id="tc-counter">Panel 1 / ${panels.length} · ${escapeXml(episode.genre)}</span>
  </div>
  <div class="tc-controls">
    <button class="tc-btn active" data-vp="desktop" title="Webtoon native 800px">800px</button>
    <button class="tc-btn" data-vp="mobile" title="Mobile phone preview (390px)">Mobile</button>
    <button class="tc-btn" id="tc-room-btn" title="Switch reading room background">Room</button>
    ${includeInspector ? '<button class="tc-btn" id="tc-inspector-btn" title="Toggle Director Inspector (I)">Inspector</button>' : ''}
  </div>
</header>

<main class="tc-stage" id="tc-stage">
${panelsHtml}
</main>

<footer class="tc-footer">
  <div class="tc-end-rule"></div>
  <p><strong>${escapeXml(episode.title)}</strong> — Episode ${episode.episodeNumber}</p>
  <p>${escapeXml(episode.author)} · ${panels.length} panels · ${layout.width}×${layout.totalHeight}px · Rendered by <strong>ToonCraft</strong></p>
  <p style="font-size:11px;margin-top:10px;opacity:.7">Shortcuts: J / K next/prev panel · M mobile toggle · I inspector</p>
</footer>

${
  includeInspector
    ? `<aside class="tc-drawer" id="tc-drawer" aria-label="Director Inspector">
  <h3>Director Inspector</h3>
  <div id="tc-inspector-body">Click any panel to inspect its direction metadata.</div>
  <h3 style="margin-top:18px">Jump to Panel</h3>
  <div class="tc-panel-nav" id="tc-panel-nav"></div>
</aside>`
    : ''
}

<script>
(function(){
  const panels = Array.from(document.querySelectorAll('.tc-panel'));
  const meta = ${safeJsonForScript(inspectorData)};
  const progress = document.getElementById('tc-progress');
  const counter = document.getElementById('tc-counter');
  const bar = document.getElementById('tc-bar');
  const drawer = document.getElementById('tc-drawer');
  const inspectorBody = document.getElementById('tc-inspector-body');
  const inspectorBtn = document.getElementById('tc-inspector-btn');
  const nav = document.getElementById('tc-panel-nav');
  let activeIndex = 0;
  let lastY = window.scrollY;

  function updateScroll(){
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    progress.style.width = Math.min(100, Math.max(0, (window.scrollY / max) * 100)).toFixed(1) + '%';
    const mid = window.scrollY + window.innerHeight * 0.35;
    for(let i = 0; i < panels.length; i++){
      const r = panels[i].getBoundingClientRect();
      const top = r.top + window.scrollY;
      if(mid >= top && mid <= top + r.height){ activeIndex = i; break; }
    }
    counter.textContent = 'Panel ' + (activeIndex + 1) + ' / ' + panels.length + ' · ' + ${safeJsonForScript(episode.genre)};
    const y = window.scrollY;
    if(y > 140 && y > lastY + 8 && !(drawer && drawer.classList.contains('open'))) bar.classList.add('hidden');
    else if(y < lastY - 8 || y <= 140) bar.classList.remove('hidden');
    lastY = y;
  }
  window.addEventListener('scroll', updateScroll, { passive: true });
  updateScroll();

  function selectPanel(idx){
    activeIndex = Math.max(0, Math.min(panels.length - 1, idx));
    panels.forEach((p, i) => p.classList.toggle('selected', i === activeIndex));
    if(!inspectorBody) return;
    const m = meta[activeIndex];
    inspectorBody.innerHTML =
      '<dl class="tc-kv">' +
      '<dt>Panel</dt><dd>#' + m.index + ' (' + m.id + ')</dd>' +
      '<dt>Height</dt><dd>' + m.height + ' px</dd>' +
      '<dt>Camera</dt><dd>' + m.camera + '</dd>' +
      '<dt>Frame</dt><dd>' + m.frame + '</dd>' +
      '<dt>Pacing</dt><dd>' + m.pacingAfter + ' (' + m.pacingPx + 'px · ' + m.pacingTransition + ')</dd>' +
      '<dt>Overlays</dt><dd>' + m.bubbleCount + ' bubbles · ' + m.sfxCount + ' SFX</dd>' +
      '</dl>' +
      (m.moodDescription ? '<div class="tc-mood">' + m.moodDescription.replace(/</g,'&lt;') + '</div>' : '') +
      '<div class="tc-chips">' + m.layers.map(l => '<span class="tc-chip">' + l + '</span>').join('') + '</div>';
  }

  panels.forEach((p, i) => p.addEventListener('click', () => selectPanel(i)));
  if(nav){
    meta.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'tc-btn';
      b.textContent = '#' + m.index;
      b.addEventListener('click', () => { selectPanel(i); panels[i].scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      nav.appendChild(b);
    });
    selectPanel(0);
  }

  document.querySelectorAll('[data-vp]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.body.dataset.viewport = btn.dataset.vp;
      document.querySelectorAll('[data-vp]').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  const rooms = ['episode', 'cinema', 'paper'];
  let roomIdx = 0;
  document.getElementById('tc-room-btn').addEventListener('click', () => {
    roomIdx = (roomIdx + 1) % rooms.length;
    document.body.dataset.room = rooms[roomIdx];
  });

  function toggleInspector(){
    if(!drawer) return;
    const open = drawer.classList.toggle('open');
    document.body.classList.toggle('tc-inspecting', open);
    if(inspectorBtn) inspectorBtn.classList.toggle('active', open);
    if(open) { bar.classList.remove('hidden'); selectPanel(activeIndex); }
  }
  if(inspectorBtn) inspectorBtn.addEventListener('click', toggleInspector);

  window.addEventListener('keydown', e => {
    if(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if(e.key === 'j' || e.key === 'J'){ selectPanel(activeIndex + 1); panels[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if(e.key === 'k' || e.key === 'K'){ selectPanel(activeIndex - 1); panels[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if(e.key === 'i' || e.key === 'I'){ toggleInspector(); }
    else if(e.key === 'm' || e.key === 'M'){
      const next = document.body.dataset.viewport === 'mobile' ? 'desktop' : 'mobile';
      document.body.dataset.viewport = next;
      document.querySelectorAll('[data-vp]').forEach(b => b.classList.toggle('active', b.dataset.vp === next));
    }
  });
})();
</script>
</body>
</html>`;
}
