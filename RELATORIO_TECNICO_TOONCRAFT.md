# Relatório Técnico Completo: ToonCraft — Análise Multi-Agente

**Data:** 2026-11-20  
**Diretório Analisado:** `/home/janlucas/.gemini/antigravity/scratch/tooncraft`  
**Metodologia:** 4 subagentes paralelos especializados (Arquitetura/Schema/Engine, Componentes/SVG/Fontes/Balões/Segurança, Templates/Rig 3D/Personagens, CLI/Testes/Qualidade)  
**Restrição:** Nenhum arquivo foi alterado durante a análise.

---

## Sumário Executivo

O **ToonCraft** é uma engine de authoring de webtoon procedural de **alta qualidade técnica**, com arquitetura modular bem definida, type-safety end-to-end via Zod/TypeScript, determinismo garantido via PRNG, e pipeline de renderização robusto (SVG → resvg → sharp). 

**Principais Fortes:**
- Arquitetura em camadas limpa (Schema → Engine → Components → Templates → CLI)
- Determinismo pixel-a-pixel (mesmo seed = mesmo output)
- Narrative Linter integrado ("Writer's Room" quantitativo)
- Smart Slicer compatível com Webtoon Canvas (evita cortar texto/SFX)
- HTML Reader standalone (offline, fonts embutidas, inspector)
- Head-Sheet QA para validação visual de rig 3D paramétrico
- Segurança via sanitizador SVG whitelist rigoroso

**Riscos Críticos Identificados:**
1. **Duplicação de sistema de cabeça** (head-3d.ts vs anime-features.ts vs silhouettes.ts) — inconsistência visual, manutenção 3x
2. **God function `renderCharacterFigure`** (1260 linhas em silhouettes.ts) — impossível testar/estender
3. **Shebang perdido no build CLI** — `dist/cli/index.js` não executa diretamente
4. **Non-determinismo em head-sheet** (`loadSystemFonts: true`)
5. **Memory pressure no export** (buffer RGBA full-height O(totalHeight))

---

## 1. Arquitetura Geral

### 1.1 Estrutura de Diretórios
```
src/
├── schema/           # Contratos Zod + tipos TS (story, panel, visual-layer, sfx, bubble, character, common)
├── engine/           # Orquestração: composer, panel-renderer, pacing-layout, narrative-analyzer, image-exporter, html-renderer, head-sheet, prng
├── components/       # Primitivas SVG: svg-utils, font-metrics, bubbles/*, frames/*, scenes/*, effects/*, sfx/*
├── templates/        # Temas, ambientes, rig 3D, anatomia, badges, silhuetas
├── cli/              # Commander.js: validate, render, init, inspect, head-sheet
tests/                # 9 arquivos de teste (~25 testes, integração real com rasterização)
```

### 1.2 Padrões Arquiteturais Identificados
| Padrão | Onde | Benefício |
|--------|------|-----------|
| **Discriminated Unions (Zod)** | `VisualLayerSchema`, `BubbleSchema`, `SfxSchema` | Type safety compile-time + validação runtime |
| **Dependency Injection via Context** | `SceneComposerContext`, `PanelRenderOptions` | Testabilidade, sem estado global |
| **Factory Pattern** | `IdFactory` (svg-utils) | IDs únicos por painel, sem colisão no HTML final |
| **Collector Pattern** | `DefsCollector` (svg-utils) | Deduplicação de `<defs>` (gradientes, filtros) |
| **PRNG Determinístico** | `createPrng` + `fork()` (prng.ts) | Reprodutibilidade pixel-a-pixel |
| **Smart Composition** | `composeEpisode` (composer.ts) | Layout computado 1x, reutilizado por SVG/HTML/Export |

### 1.3 Fluxo de Dados Principal
```
Input JSON → validateEpisode (Zod) 
    → resolveTheme + computeEpisodeLayout (pacing-layout)
    → renderPanelSvg × N (panel-renderer + procedural-composer)
    → ComposedEpisode (imutável)
    → [renderToHtml] + [exportToImages (resvg + sharp)]
```

---

## 2. Análise por Domínio

### 2.1 Schema & Engine (Subagente 1)

#### Schema (`src/schema/`)
- **8 schemas Zod** com `superRefine` para cross-refs (cast ↔ bubbles ↔ layers)
- **Discriminated Union `VisualLayer`**: 7 tipos (`backdrop`, `environment`, `character_figure`, `svg_raw`, `effect`, `emotion_badge`, `image_ref`)
- **`prefault({})`** (Zod 3.23+) aplica defaults durante parsing — `output` já vem resolvido
- **Validações rigorosas**: IDs únicos globais, coordenadas % em [0,100], cores hex/rgb, limites numéricos

#### Engine (`src/engine/`)
| Módulo | Responsabilidade | Destaque |
|--------|------------------|----------|
| `composer.ts` | Orquestração central | Fail-fast, warnings array, layout/render separados |
| `panel-renderer.ts` | SVG por painel | Pipeline z-ordered, IdFactory/DefsCollector por painel |
| `pacing-layout.ts` | Layout vertical + ritmo | Smart collision resolution bubbles, protected bands |
| `narrative-analyzer.ts` | "Writer's Room Linter" | 12 métricas + scoring 0-100 → Grade S/A/B/C/D |
| `image-exporter.ts` | PNG/WebP via resvg+sharp | Single composite RGBA → slice extraction via `.extract()` |
| `html-renderer.ts` | HTML5 reader standalone | Fonts base64, CSS vars, inspector, keyboard nav |
| `head-sheet.ts` | QA de personagem | Turnaround 0°→90° (shaded/silhouette/guides) |
| `prng.ts` | Mulberry32 + fork | Determinismo por painel + derivação estável por label |

#### Riscos Engine
- **Warnings array mutável** passado por referência — não thread-safe
- **`baseDir` default = `process.cwd()`** para `image_ref` — inseguro se `allowImages=true`
- **`limitInputPixels: false`** no sharp — remove proteção contra decompression bombs
- **Memory pressure**: `exportToImages` carrega tudo em RAM (buffer RGBA full-height)

---

### 2.2 Componentes SVG, Fontes, Balões, Segurança (Subagente 2)

#### `svg-utils.ts` — Utilitários Fundamentais
- **`DefsCollector.once()`** — deduplicação O(1) de gradientes/filtros
- **`IdFactory(prefix)`** — isolamento de IDs entre painéis
- **`parseColor`** — suporta hex/rgb/rgba, mas **falha silenciosamente** (retorna preto)
- **Bug**: `glowFilter` tem `feMergeNode in="b"` duplicado (redundante)

#### `font-metrics.ts` — Métricas Reais com `opentype.js`
- **6 fontes OFL embutidas** (Comic Neue, Bangers, Chakra Petch, Noto Sans)
- **Kerning real** + **wrap balanceado** (binary search 12 iterações)
- **Riscos**: `fontCache` nunca limpo (memory leak em batch), `letterSpacing` não afeta wrap, markup nesting não suportado

#### Sistema de Balões (`components/bubbles/`)
| Arquivo | Responsabilidade | Riscos |
|---------|------------------|--------|
| `bubble-geometry.ts` | Formas (ellipse, cloud, shout, chamfered), métricas, clamping | **Magic numbers ubíquos** (1.28, 1.46, 40, 34, 56...), `shoutShape` pode auto-intersectar |
| `render-bubble.ts` | SVG render + paint resolution (theme → char → bubble) | **`filter` no `<path>` body** vaza glow para fora do stroke; `narration` shadow hardcoded |
| `tail-router.ts` | Caudas (dots, curved, sharp, jagged) + perimeter attach | `inset=1.04` para dots (fora da borda), sem collision detection tail↔outros |

#### Segurança: `svg-sanitizer.ts` — **Crítico**
- **Tokenizer + stack walker** (sem DOM) — 21 tags, 40 attrs, 20 style props permitidos
- **ID rewriting completo** + **dangerous value detection** (`javascript:`, `data:`, `expression()`, etc.)
- **Risco**: `image` tag em `DROP_SUBTREE` mas sistema gera `<image>` via `image_ref` — se `svg_raw` contiver image, é removido silenciosamente

#### Frames & Efeitos
- **`panel-frame.ts`**: Even-odd matte (sem clipPath aninhado), 8 frame types, shattered procedural
- **`particles-aura.ts`**: rain, embers, mana, screen-crack, chromatic-glitch, impact-flash, vignette
- **`halftone.ts`**: Pattern SVG 45° + radial mask (screentone mangá)
- **`speedlines.ts`**: Radial (clear zone central) + Vertical (biased edges)
- **`render-sfx.ts`**: 3 modes (textPath curve, tremble per-char, default) + streak decorativo

---

### 2.3 Templates, Rig 3D, Renderização de Personagens (Subagente 3)

#### Duplicação Crítica: **3 Sistemas de Cabeça Incompatíveis**
| Sistema | Arquivo | Linhas | Status |
|---------|---------|--------|--------|
| **Head 3D Paramétrico** | `head-3d.ts` | 912 | Projeção perspectiva, landmarks 3D, shading cel, rim light |
| **Features 2D + Hair** | `anime-features.ts` | 1498+ | Expressões declarativas, contornos pré-baked, olhos 6-layer |
| **Silhueta Principal** | `silhouettes.ts` | 1260 | **God function** integra Head 3D opcionalmente + outfit system |

**Consequências**: Inconsistência visual, manutenção 3x, bugs de sincronia, código morto (`isProfileBlend` calculado mas `void`)

#### `anatomy-bezier.ts` — Anatomia Orgânica (Destaque Positivo)
- **G-Pen Tapered Strokes** autênticos (ribbon 0→max→0)
- **Continuidade C1** em cotovelo/joelho via bissectriz normal/tangente
- **Contorno ink-only** (aberto) termina em T-junction axilar — elimina "ball-joint rings"
- **Mãos alinhadas ao vetor antebraço** (7 variants: closed, detailed, weapon-grip, casting, relaxed, gestural, chin-think)
- **Zero dependências**, matemática pura, testável, escalável via `bulk` (0.78→1.18)

#### `silhouettes.ts` — **God Function** (1260 linhas)
```
renderCharacterFigure(layer, ctx):
  1. skeletonFor(pose, bodyType) → 24 configs hardcoded
  2. FRAMING_CROP (5 modos) hardcoded magic numbers
  3. upperTransform (translate + rotate)
  4. 14 render passes ordenados (aura → rim → wisps → hair back → legs → torso → neck → head 2D/3D → eyes → hair front → accessories → detailOverlay → dramatic shadows)
  5. Outfit system: 12 boolean flags via outfitFor(preset)
  6. Part[] abstraction (renderBase/Rim/Shade)
  7. Head 3D integration condicional complexa
  8. Chin-think hand se close-up + head3D
```

#### `environments.ts` — 9 Presets Procedurais
- Determinismo via `seed-preset`, camadas far→near, integração com `ResolvedTheme`
- **100+ magic numbers** (alleyW=0.24w, moonR=150, fenceStep=22, etc.)

#### `themes.ts` — Design Tokens
- 7 presets + `custom`, 13 tokens tipados, `resolveTheme` puro
- **Gap**: `fontPreset` só `comic`/`modern`, sem semantic tokens, sem dark/light mode

---

### 2.4 CLI, Testes, Qualidade (Subagente 4)

#### CLI (`src/cli/`)
- **Commander.js v15**, 5 comandos: `validate`, `render`, `init`, `inspect`, `head-sheet`
- **Global flags**: `--json` (todos), `--strict-svg` (validate only)
- **Bug Crítico**: `tsup` com `shims: false` + sem `banner` → **shebang perdido em `dist/cli/index.js`** (CLI publicado não executa diretamente)
- **Bug**: `parseAsync` sem `exitOverride()` → erros de validação do commander não passam pelo `.catch()`
- **Gap**: `render` não expõe `--strict-svg`

#### Testes (`tests/`)
| Arquivo | Testes | Destaque |
|---------|--------|----------|
| `schema.test.ts` | 5 | Validação Zod, duplicatas, cross-refs |
| `composer.test.ts` | 2 | E2E + hash SHA256 determinismo PNG |
| `cli.test.ts` | 3 | **Integração real** (spawn `tsx`) |
| `svg-sanitizer.test.ts` | 2 | XSS prevention, ID prefixing |
| `bubbles.test.ts` | 2 (param) | 16 tipos + offscreen tails |
| `pacing-layout.test.ts` | 3 | Bubble nudging, smart-slice logic |
| `font-metrics.test.ts` | 5 | Font loading, wrap, balance |
| `anime-characters.test.ts` | 2 | Pass-2 features, narrative scoring |
| `head-sheet.test.ts` | 1 (loop) | Determinismo + rasterização |

**Gaps Críticos**: Error paths CLI, font fallback, export modes isolados, narrative grades B-F, concorrência, stress test (50+ painéis)

#### Build Config
- **`tsup.config.ts`**: `external: ['sharp','@resvg/resvg-js']` correto, `splitting: true` bom, **`dts: false` + tsc separado = dupla compilação**
- **`vitest.config.ts`**: Sem coverage thresholds, sem setupFiles
- **`package.json`**: Version hardcoded, `@types/opentype.js` desnecessário (v2 tem types built-in)

---

## 3. Consolidação de Riscos Priorizados

| Prioridade | ID | Área | Descrição | Impacto | Esforço |
|------------|----|------|-----------|---------|---------|
| 🔴 **P0** | R1 | CLI/Build | Shebang perdido no `dist/cli/index.js` | CLI publicado não roda | Baixo (banner no tsup) |
| 🔴 **P0** | R2 | Templates | Duplicação Head 2D/3D (3 sistemas) | Inconsistência visual, bugs | Alto (unificação) |
| 🔴 **P0** | R3 | Engine | `loadSystemFonts: true` no head-sheet | Non-determinismo cross-machine | Baixo (usar só fontes bundladas) |
| 🔴 **P0** | R4 | Engine | `limitInputPixels: false` no sharp | Decompression bomb risk | Baixo (calcular limit seguro) |
| 🟠 **P1** | R5 | Templates | God function `renderCharacterFigure` (1260 linhas) | Impossível testar/estender | Alto (split em 6 módulos) |
| 🟠 **P1** | R6 | Components | `filter` no `<path>` body vaza glow | Visual incorreto em bubbles | Baixo (wrapper `<g filter>`) |
| 🟠 **P1** | R7 | Schema | `baseDir` default inseguro para `image_ref` | Path traversal se `allowImages=true` | Baixo (exigir `baseDir` explícito) |
| 🟡 **P2** | R8 | Components | Magic numbers ubíquos (500+ constants) | Tuning impossível sem code change | Médio (extrair constants) |
| 🟡 **P2** | R9 | Engine | Warnings array mutável não thread-safe | Race condition se concorrente | Baixo (clonar array ou imutável) |
| 🟡 **P2** | R10 | CLI | `parseAsync` sem `exitOverride()` | Exit codes inconsistentes | Baixo (adicionar `.exitOverride()`) |
| 🟡 **P2** | R11 | Tests | Sem coverage thresholds no vitest | Cobertura cai sem aviso | Baixo (adicionar thresholds) |
| 🟡 **P2** | R12 | Templates | Skeleton/Outfit hardcoded (24 poses, 12 flags) | Adicionar pose = cirurgia | Médio (data-driven) |
| 🟢 **P3** | R13 | Components | `svg-sanitizer` remove `image` tag gerada pelo sistema | `image_ref` vs `svg_raw` confusion | Baixo (documentar/allow data:) |
| 🟢 **P3** | R14 | Engine | Memory pressure export (buffer RGBA full-height) | OOM em episódios longos | Médio (streaming composite) |
| 🟢 **P3** | R15 | CLI | Version hardcoded no CLI (0.1.0) | Drift versão CLI vs package.json | Baixo (ler package.json) |

---

## 4. Dívida Técnica & Código Morto

### Código Morto Identificado
| Arquivo | Item | Linha |
|---------|------|-------|
| `head-3d.ts` | `isProfileBlend`, `isFrontBlend` calculados + `void isProfileBlend` | ~904 |
| `silhouettes.ts` | `gesturalHandSvg` declarada, nunca usada | ~412 |
| `svg-sanitizer.ts` | `DROP_SUBTREE` inclui `'svg'` mas schema `svg_raw` diz "sem root svg" | ~56 |
| `themes.ts` | `custom` theme duplica `dark-fantasy` com cores diferentes | — |

### Duplicação Significativa
1. **Head System ×3** — `head-3d.ts`, `anime-features.ts`, `silhouettes.ts`
2. **Ears/Neck/Face Shading/Hair** — duplicados entre `head-3d.ts` e `anime-features.ts`
3. **Cel-shadow logic** — `buildAnatomicalArm` + `buildAnatomicalLeg` em `anatomy-bezier.ts`
4. **Gradient builders** — OK, centralizados em `svg-utils.ts`

### Complexidade Desnecessária
- `head-3d.ts` (912 linhas) — deveria ser split: projector, anatomy, hair, eyes, neck-collar, shading
- `silhouettes.ts` (1260 linhas) — god function, 14 passes, skeleton hardcoded
- `svg-sanitizer.ts` (307 linhas) — tokenizer manual; `parse5`/`DOMParser` (Node 22+) seriam mais robustos

---

## 5. Performance & resvg

### Stack de Renderização
```
SVG String → @resvg/resvg-js (WASM/Rust) → PNG Buffer
     ↓
sharp (libvips) → Composite RGBA full-height → Slices via .extract() → PNG/WebP
```

### Otimizações Atuais
| Otimização | Local |
|------------|-------|
| Single composite RGBA | `image-exporter.ts:179-190` |
| Slice extraction via `.extract()` | `image-exporter.ts:219-225` |
| DefsCollector deduplica gradientes/filtros | `svg-utils.ts:74-81` |
| PRNG fork evita re-seed | `prng.ts:54` |
| IdFactory por painel | `panel-renderer.ts:110` |
| Fontes OFL carregadas 1x (module cache) | `font-metrics.ts` |

### Gargalos Identificados
| Gargalo | Impacto | Solução |
|---------|---------|---------|
| `Resvg` instanciado por painel | CPU + parse SVG repetido | Pool ou `renderTree()` reuse (API limitada) |
| `sharp` composite full-height RGBA | RAM O(totalHeight × width × 4B) | Streaming vertical `libvips join` |
| `readFileSync` fonts no HTML renderer | I/O síncrono bloqueante | Cache base64 em memória |
| `svg-sanitizer` tokenizer manual | CPU em `svg_raw` grandes | Lazy (já é), considerar `parse5` |
| `wrapBalanced` 12× wrap | CPU em bubbles longos | Cache por `(text, maxWidth, fontSize, fonts)` |

### Benchmarks Estimados (Modelo Mental)
| Operação | Complexidade | Tempo Estimado |
|----------|--------------|----------------|
| `composeEpisode` (validação) | O(panels × (bubbles+sfx+layers)) | Zod parse domina |
| `computeEpisodeLayout` | O(panels × bubbles²) | Bubbles ≤10 típico |
| `renderPanelSvg` | O(layers + bubbles + sfx) | String concat — rápido |
| `exportToImages` (rasterize) | O(panels × SVG_complexity) | ~10-50ms/painel (Resvg WASM) |
| `exportToImages` (composite) | O(totalHeight × width) | ~200-500ms episódio completo |
| Smart Slicer | O(slices × bands × scan_step) | Scan 8px — negligenciável |

---

## 6. Plano de Ação Priorizado

### Fase 1: Correções Críticas (Semana 1-2) — **P0**
| Ação | Arquivos | Esforço |
|------|----------|---------|
| Adicionar `banner: '#!/usr/bin/env node'` no entry `cli/index` do tsup | `tsup.config.ts` | 15 min |
| Mudar `loadSystemFonts: false` no head-sheet Resvg | `head-sheet.ts:23` | 5 min |
| Calcular `limitInputPixels` seguro no sharp (baseado em canvas) | `image-exporter.ts` | 30 min |
| Exigir `baseDir` explícito se `allowImages=true` | `procedural-composer.ts`, `validate.ts` | 1h |
| Adicionar `.exitOverride()` no commander | `cli/index.ts` | 15 min |
| Validar template `STARTER_EPISODE` em teste unitário | `tests/schema.test.ts` | 30 min |

### Fase 2: Refatoração de Alto ROI (Mês 1) — **P1-P2**
| Ação | Arquivos | Esforço |
|------|----------|---------|
| **Extrair constants** → `src/constants/{anatomy,head,environment,bubbles,frames}.ts` | Todos templates + components | 2-3 dias |
| **Split `silhouettes.ts`** em 6 módulos: `skeleton.ts`, `outfit.ts`, `parts.ts`, `passes.ts`, `head-integration.ts`, `figure-renderer.ts` | `silhouettes.ts` | 1 semana |
| **Unificar Head System**: Interface `HeadRenderer { render(ctx): HeadResult }` com `Head2D` + `Head3D` | `head-3d.ts`, `anime-features.ts`, `silhouettes.ts` | 1-2 semanas |
| **Data-driven Skeleton/Outfit**: `SKELETON_PRESETS: Record<Pose, Record<BodyType, SkeletonConfig>>` | `silhouettes.ts` | 3-4 dias |
| **Wrapper `<g filter>` para glow** em `render-bubble.ts` | `render-bubble.ts` | 1h |
| **Coverage thresholds** no vitest (lines: 80%, branches: 70%) | `vitest.config.ts` | 30 min |
| **Migrar para `tsup dts: true`** (single-pass build) | `tsup.config.ts`, remover `tsconfig.build.json` | 2h |

### Fase 3: Qualidade & Extensibilidade (Trimestre) — **P2-P3**
| Ação | Área | Esforço |
|------|------|---------|
| Testes de regressão visual (snapshot com `@resvg/resvg-js`) | Tests | 1 semana |
| Streaming image export (`mode: 'stream'` para episódios longos) | Engine | 1 semana |
| Font subsetting (apenas glyphs usados) no HTML renderer | Engine/HTML | 3-4 dias |
| Theme System v2: semantic tokens, dark/light mode, CSS vars export | Templates | 1 semana |
| Extensibilidade de badges/environments (config-driven) | Templates | 3-4 dias |
| Documentação arquitetural (ADRs) | Docs | Contínuo |
| Performance budget (SVG size/element count por framing/pose) | CI/Monitoring | 2 dias |

---

## 7. Métricas de Código (Consolidadas)

| Métrica | Valor |
|---------|-------|
| **Total TypeScript Source** | ~5.400 linhas (templates) + ~2.500 (engine/schema) + ~1.500 (components) + ~500 (cli) ≈ **9.900 linhas** |
| **Testes** | ~25 testes, ~683 linhas |
| **Magic Numbers Estimados** | ~545 (templates) + ~200 (components) + ~50 (engine) ≈ **795** |
| **Complexidade Ciclomática Máxima** | `silhouettes.ts` ~45, `anime-features.ts` ~40, `head-3d.ts` ~25 |
| **Arquivos TypeScript** | 37 (src) + 9 (tests) = 46 |
| **Dependências Runtime** | 13 (Zod, commander, sharp, resvg, opentype.js, fontkit, etc.) |
| **Dependências Dev** | 12 (vitest, tsup, typescript, @types/*, etc.) |

---

## 8. Conclusão

O **ToonCraft** é um projeto de **engenharia exemplar** para seu domínio:
- ✅ Arquitetura limpa, modular, type-safe
- ✅ Determinismo garantido (seed → pixel idêntico)
- ✅ Pipeline robusto (SVG → resvg → sharp)
- ✅ Features únicas (Narrative Linter, Head-Sheet QA, Smart Slicer, HTML Reader offline)
- ✅ Segurança levada a sério (sanitizador whitelist)
- ✅ Testes de integração reais com rasterização

**Bloqueadores para escala** são arquiteturais (duplicação Head, god function silhouettes) e de tooling (shebang, dual tsc). A dívida técnica é **concentrada e tratável** — não espalhada.

**Recomendação**: Executar **Fase 1 imediatamente** (correções críticas de 2-3 horas), depois **Fase 2 incrementalmente** (refatoração modular). O projeto está **pronto para produção** com as correções P0 aplicadas, e a arquitetura suporta evolução significativa sem rewrite.

---

*Relatório gerado via análise multi-agente paralela (4 subagentes especializados) sem modificação de arquivos.*