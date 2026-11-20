# Subagente 6 — Relatório de Bugs: Fitas de Tinta Caligráfica & Compatibilidade @resvg/resvg-js

**Data:** 2026-11-20  
**Escopo:** `src/templates/manhwa-ink.ts`, chamadas de `variableStrokeFromSegments` / `taperedInkRibbon` em `head-3d.ts` e `manhwa-hair.ts`  
**Restrição:** Nenhum código alterado — apenas análise estática e identificação de bugs.

---

## Sumário Executivo

O sistema de fitas de tinta variável (`taperedInkRibbon`, `variableStrokeFromSegments`) é **arquiteturalmente sólido** (geometria pura, zero `stroke` uniforme, zero `clipPath` aninhado), mas contém **bugs críticos de quina/junção**, **riscos de vazamento de traços extras**, **tangentes colapsadas em endpoints**, e **incompatibilidades sutis com @resvg/resvg-js** que se manifestam em larguras sub-pixel e continuidade C¹ quebrada entre segmentos.

---

## 1. Bugs em `manhwa-ink.ts` (Núcleo do Sistema)

### 1.1 Tangente Incorreta em Endpoints — **CRÍTICO**
**Arquivo:** `manhwa-ink.ts`  
**Linhas:** 105-119 (`taperedInkRibbon`)

```typescript
for (let i = 0; i < count; i++) {
  const p = cPts[i]!;
  const prev = cPts[Math.max(0, i - 1)]!;   // BUG: i=0 → prev = cPts[0] (mesmo ponto)
  const next = cPts[Math.min(count - 1, i + 1)]!; // BUG: i=count-1 → next = cPts[count-1]
  // ...
  const len = Math.hypot(tx, ty);
  if (len < 1e-6) { tx = 1; ty = 0; } // Fallback arbitrário (eixo X)
}
```

**Problema:** Nos endpoints (`i=0` e `i=count-1`), `prev === p` e `next === p` → `len ≈ 0` → fallback para tangente `(1, 0)` (horizontal à direita). Isso **ignora a direção real da curva** no início/fim, gerando:
- Pontas rotacionadas incorretamente (não alinhadas à curva)
- Largura mal distribuída na ponta (o `halfW` usa normal de `(1,0)` → vertical)
- Artefato visual: ponta "achatada" ou virada 90° se a curva começar vertical

**Correção:** Usar derivada analítica da curva (quadrática/cúbica) no endpoint, ou amostrar um ponto `t=ε` e `t=1-ε` para estimar tangente real.

---

### 1.2 Junção entre Segmentos Quebra Continuidade C¹ — **CRÍTICO**
**Arquivo:** `manhwa-ink.ts`  
**Linhas:** 173-184 (`variableStrokeFromSegments`)

```typescript
const startIdx = sIdx === 0 ? 0 : 1; // Descarta primeiro ponto do segmento seguinte
for (let i = startIdx; i <= n; i++) {
  const t = n > 0 ? i / n : 0;
  allPts.push(sampled[i]!);
  allWidths.push(evalQuadWidth(seg.wStart, seg.wMid, seg.wEnd, t));
}
```

**Problema:** A concatenação assume que `seg[p].p2 === seg[p+1].p0` (posição) **E** que as tangentes coincidem (C¹). Na prática:
- `head-3d.ts` passa pontos 3D-projetados que **não garantem C¹** entre segmentos adjacentes
- `manhwa-hair.ts:259-261` concatena dois `sampleCubicBezier` com `.slice(1)` — o ponto de junção é compartilhado, mas **a derivada da curva muda abruptamente** (C⁰ apenas)
- Resultado: `taperedInkRibbon` calcula normal baseada em `prev→next` que cruza a junção → **espinho/artefato na quina** ou **inversão de normal** (fita vira do avesso)

**Evidência visual esperada:** "Dente de serra" ou bolha na junção de segmentos da mandíbula (head-3d.ts:481-525) e coroa do cabelo (manhwa-hair.ts:263).

---

### 1.3 `deduplicatePoints` Corrompe Perfil de Largura — **ALTO**
**Arquivo:** `manhwa-ink.ts`  
**Linhas:** 33-48

```typescript
function deduplicatePoints(pts: readonly P2[], widths: readonly number[]): { pts: P2[]; widths: number[] } {
  // ...
  for (let i = 0; i < pts.length; i++) {
    const w = widths[i] ?? lastW;
    // ...
    if (!prev || dist(prev, p) > 1e-3) {
      outPts.push(p);
      outW.push(Math.max(0.06, w)); // BUG: clamp arbitrário em 0.06
    }
  }
}
```

**Problemas:**
1. **Threshold `1e-3` hardcoded** — em coordenadas SVG típicas (canvas ~800px), `1e-3` = 0.001px (sub-pixel). Remove pontos legítimos em curvas apertadas; falha em remover duplicatas reais de `sampleCubicBezier` adjacentes.
2. **`Math.max(0.06, w)`** — piso arbitrário diferente do `evalQuadWidth` (piso 0.08, linha 153). Cria **discontinuity de largura** se deduplicação remove ponto onde `w < 0.06` mas próximo ponto tem `w > 0.08`.
3. **Perde correspondência ponto-largura** — ao remover ponto duplicado, a largura do ponto removido é descartada; o ponto mantido herda sua largura original, não a média/interpolação. Quebra o perfil de afilamento em pontas muito curtas.

---

### 1.4 `evalQuadWidth` Produz Valores Fora do Intervalo Esperado — **MÉDIO**
**Arquivo:** `manhwa-ink.ts`  
**Linhas:** 151-154

```typescript
function evalQuadWidth(wStart: number, wMid: number, wEnd: number, t: number): number {
  const w = (1 - t) * (1 - 2 * t) * wStart + 4 * t * (1 - t) * wMid + t * (2 * t - 1) * wEnd;
  return Math.max(0.08, w);
}
```

**Problema:** A interpolação quadrática de Lagrange para `(0,wStart), (0.5,wMid), (1,wEnd)` é correta **apenas se** `wMid` estiver entre `wStart` e `wEnd`. Se `wMid > max(wStart,wEnd)` (barriga) ou `wMid < min(...)` (cintura), a parábola **extrapola fora de [0,1]** para `t` próximo a 0.5, podendo gerar `w < 0` antes do `Math.max(0.08, w)`.

**Casos de uso reais que quebram:**
- `head-3d.ts:336-338` — `wStart=lw*1.15, wMid=lw*0.85, wEnd=lw*0.45` (decrescente monotônico) → OK
- `head-3d.ts:495-497` — `wStart=0.78, wMid=0.92, wEnd=1.05` (crescente) → OK
- `head-3d.ts:503-505` — `wStart=1.05, wMid=1.2, wEnd=1.25` (crescente) → OK
- **`head-3d.ts:778-780`** — `wStart=0.16, wMid=lw*0.65, wEnd=0.2` → **barriga extrema** (0.16 → ~0.5 → 0.2). Para `lw≈1.0`, `wMid≈0.65` >> `wEnd=0.2`. A parábola atinge pico >0.65 em `t≈0.5` e depois **despenca negativo** antes de `t=1` → clamp em 0.08 cria "degrau" na largura na ponta da boca.

---

### 1.5 Fechamento da Fita (`Z`) Assume Geometria Perfeita — **ALTO**
**Arquivo:** `manhwa-ink.ts`  
**Linhas:** 130-138

```typescript
let d = `M${fmt(left[0]!.x)} ${fmt(left[0]!.y)}`;
for (let i = 1; i < count; i++) d += `L${fmt(left[i]!.x)} ${fmt(left[i]!.y)}`;
for (let i = count - 1; i >= 0; i--) d += `L${fmt(right[i]!.x)} ${fmt(right[i]!.y)}`;
d += 'Z'; // Fecha automaticamente para left[0]
```

**Problema:** `Z` desenha linha reta de `right[0]` para `left[0]`. Se a largura no endpoint > 0 (ex: `0.15`), `left[0] ≠ right[0]` → **triângulo residual na ponta** (não afilado a zero). O mesmo no outro extremo (`left[count-1]` para `right[count-1]` via `Z` implícito do path).

**@resvg/resvg-js:** Renderiza o triângulo residual como artefato visível em pontas muito finas (sub-pixel). Em cabelo (lw*2.2 para sheen), a base da fita não fecha limpo.

**Correção:** Garantir `wStart = wEnd = 0` (ou ~0.001) nas pontas, ou adicionar ponto explícito de fechamento com largura zero.

---

### 1.6 Ausência de Miter Limit / Join Handling — **MÉDIO**
**Arquivo:** `manhwa-ink.ts`  
**Função:** `taperedInkRibbon` (linhas 90-145)

**Problema:** Em curvas de alta curvatura (raio pequeno), as normais `left`/`right` **cruzam** (self-intersection). A fita vira do avesso, criando laços invertidos. Não há:
- Detecção de cruzamento (`left[i]` cruza `right[i]` ou `left[i+1]`)
- Miter limit (corte da ponta externa em junções agudas)
- Fallback para `round join` / `bevel join` equivalente em geometria preenchida

**Casos críticos:** Cabelo `spiky-manhwa` (curvatura alta), boca `smirk` (curvatura alta em segmento curto), coroa `domePts` (junção de dois cubicos).

---

## 2. Bugs nas Chamadas — `head-3d.ts`

### 2.1 Contorno da Mandíbula (5 Segmentos) — Junções C⁰ — **CRÍTICO**
**Arquivo:** `head-3d.ts`  
**Linhas:** 481-525

```typescript
headSvg += variableStrokeFromSegments(
  [
    { p0: farTemple,   p1: farBrow,       p2: farCheek,     wStart: lw*0.4,  wMid: lw*0.65, wEnd: lw*0.78 },
    { p0: farCheek,    p1: farLowerCheek, p2: chinRight,    wStart: lw*0.78, wMid: lw*0.92, wEnd: lw*1.05 },
    { p0: chinRight,   p1: chinPt,        p2: chinLeft,     wStart: lw*1.05, wMid: lw*1.2,  wEnd: lw*1.25 },
    { p0: chinLeft,    p1: nearJawLower,  p2: nearJawAngle, wStart: lw*1.25, wMid: lw*1.35, wEnd: lw*1.15 },
    { p0: nearJawAngle,p1: nearUpperJaw,  p2: earRoot,      wStart: lw*1.15, wMid: lw*0.85, wEnd: lw*0.45 },
  ],
  skinInk,
);
```

**Problemas:**
1. **Pontos de junção (`farCheek`, `chinRight`, `chinLeft`, `nearJawAngle`, `earRoot`) são pontos 3D-projetados** — a tangente da curva 3D **não é preservada** na projeção 2D. A derivada 2D em `p2` do segmento N **≠** derivada 2D em `p0` do segmento N+1.
2. **Larguras casam numericamente** (wEnd[N] == wStart[N+1]) — **mas** a geometria não é C¹ → `variableStrokeFromSegments` amostra pontos adjacentes cruzando a junção → normal calculada em `taperedInkRibbon` aponta direção média errada → **espinho ou reentrância na mandíbula**.
3. Segmento 2 (`chinRight → chinPt → chinLeft`) tem **curvatura extrema** (queixo pontudo) — raio de curvatura ~2-3px. Com `lw*1.25` (~1.25px), a fita **auto-intersecta** na ponta do queixo.

---

### 2.2 Contornos do Pescoço (Linhas 330-355) — Segmentos Isolados — **ALTO**
**Linhas:** 330-341, 343-353, 357-370

```typescript
// Cada variableStrokeFromSegments chamado com UM segmento apenas
variableStrokeFromSegments([{ p0: neckBackTop, p1: ..., p2: neckBackBot, ... }], skinInk);
```

**Problema:** São **três fitas separadas** (costas, frente, esternocleidomastoideo) que **se tocam nos endpoints** (`neckBackTop`/`neckFrontTop` no topo, `neckBackBot`/`neckFrontBot` na base). Como são paths SVG independentes:
- **Gap sub-pixel** entre endpoints (arredondamento `fmt` + precisão float)
- **Overlap** se normais divergirem
- **@resvg** pode renderizar costura visível (linha fina clara/escura) onde as fitas se encontram

**Correção:** Unificar em único `variableStrokeFromSegments` com 3 segmentos conectados, ou garantir endpoints idênticos bit-a-bit.

---

### 2.3 Boca `smirk` (Linhas 772-784) — Barriga Extrema + Segmento Curto — **CRÍTICO**
**Linhas:** 772-784

```typescript
variableStrokeFromSegments(
  [{ p0: mLeft, p1: { x: mMid.x, y: mMid.y + 0.9 }, p2: { x: mRight.x, y: mRight.y - 1.5 },
    wStart: 0.16, wMid: lw * 0.65, wEnd: 0.2 }],
  skinDeep,
);
```

**Problemas:**
1. **Segmento único** com `wMid = lw*0.65` (~0.65) >> `wStart=0.16`, `wEnd=0.2` → `evalQuadWidth` **extrapola negativo** para `t>0.7` (ver 1.4). Clamp em 0.08 cria **degrau abrupto de largura** no canto da boca.
2. **Comprimento curto** (~13-15px) + curvatura alta → poucos samples (14 default) → amostragem grosseira da parábola de largura.
3. Ponta direita (`mRight.y - 1.5`) puxada para baixo — tangente no endpoint aponta ↓, mas fallback `(1,0)` em `taperedInkRibbon` força normal horizontal → **ponta virada 90°**.

---

### 2.4 Boca Neutra (Linhas 793-805) — Simétrico mas Mesmos Problemas — **ALTO**
**Linhas:** 793-805

```typescript
variableStrokeFromSegments(
  [{ p0: mLeft, p1: mMid, p2: mRight, wStart: 0.16, wMid: lw*0.62, wEnd: 0.16 }],
  skinDeep,
);
```

**Problema:** Mesmo padrão de barriga extrema (`wMid >> wStart/wEnd`) → clamp artifacts nas pontas. Simetria mascara mas não elimina.

---

## 3. Bugs nas Chamadas — `manhwa-hair.ts`

### 3.1 Coroa (`domePts`) — Junção de Dois Cúbicos — **CRÍTICO**
**Linhas:** 258-268

```typescript
const domePts = [
  ...sampleCubicBezier(backLow, surf(...), backHigh, apex, 12),
  ...sampleCubicBezier(apex, frontTop, surf(...), frontTemple, 12).slice(1),
];
parts.push(taperedInkRibbon(domePts, makeContourWidths(domePts.length, lw * 1.15, 0.2, 0.2), ink));
```

**Problema:** `apex` é ponto compartilhado (`.slice(1)` remove duplicata), mas **as tangentes dos dois cúbicos em `apex` não batem**:
- Primeiro cúbico: `apex` é `p3` (endpoint) → tangente = `3*(p3-p2)` direção `apex ← backHigh`
- Segundo cúbico: `apex` é `p0` (startpoint) → tangente = `3*(p1-p0)` direção `frontTop ← apex`
- **Não há garantia de colinearidade** → junção C⁰ com ângulo agudo → `taperedInkRibbon` vê `prev=backHigh_sample`, `next=frontTop_sample` → normal média errada → **espinho no ápice da coroa**.

---

### 3.2 `renderClump` — Fitas Left/Right Independentes — **ALTO**
**Linhas:** 178-195

```typescript
if (opts.leftInkW > 0.15) {
  parts.push(taperedInkRibbon(geom.leftEdge, makeContourWidths(...), opts.ink));
}
if (opts.rightInkW > 0.15) {
  parts.push(taperedInkRibbon(geom.rightEdge, makeContourWidths(...), opts.ink));
}
```

**Problema:** `leftEdge` e `rightEdge` são **curvas separadas** (amostradas do mesmo cúbico mas lados opostos). Em teoria formam as bordas de uma fita, mas:
- São renderizadas como **duas fitas independentes** (duas chamadas `taperedInkRibbon`)
- **Não compartilham endpoints** — `leftEdge[0] ≈ rootL`, `rightEdge[0] ≈ rootR` (separados por `2*rootHalfW`)
- **Gap na raiz** (base do tufo) onde as duas fitas não se encontram → buraco visível ou costura
- **Pontas independentes** — cada uma tem seu próprio artefato de fechamento (1.5)

**Correção:** Renderizar clump como **uma única fita fechada** (leftEdge + reverse(rightEdge)) via `taperedInkRibbon` unificado, ou usar `variableStrokeFromSegments` com segmentos emparelhados.

---

### 3.3 `makeContourWidths` — Perfil de Largura com `sin(π * t^0.85)` — **MÉDIO**
**Linhas:** 137-146

```typescript
function makeContourWidths(count: number, peakW: number, startW = 0.15, endW = 0.15): number[] {
  for (let i = 0; i < count; i++) {
    const t = i / last;
    const bell = Math.sin(Math.PI * Math.pow(t, 0.85));
    out.push(lerp(t < 0.5 ? startW : endW, peakW, bell));
  }
}
```

**Problemas:**
1. **`pow(t, 0.85)`** desvia a curva seno — pico ocorre em `t ≈ 0.53` (não 0.5). Assimétrico intencional? Não documentado.
2. **`lerp(startW, peakW, bell)`** para `t<0.5` e `lerp(endW, peakW, bell)` para `t≥0.5` — **discontinuidade na derivada em `t=0.5`** (mudança de `startW` para `endW` como base). Se `startW ≠ endW`, há canto no meio do perfil.
3. **`startW = endW = 0.15` default** — mas `taperedInkRibbon` espera pontas ~0.15 para fechar (1.5). Se `peakW` grande (ex: `lw*2.2` para sheen), a transição 0.15→2.2→0.15 é íngreme → poucos samples (12-16) subamostram a transição.

---

### 3.4 `renderStrayWisp` — Segmentos Quadráticos Curtos — **MÉDIO**
**Linhas:** 202-212

```typescript
function renderStrayWisp(p0, p1, p2, peakW, color, opacity = 0.92) {
  const pts = sampleQuadBezier(p0, p1, p2, 10);
  return taperedInkRibbon(pts, makeContourWidths(pts.length, peakW, 0.15, 0.15), color, opacity);
}
```

**Problema:** `sampleQuadBezier` com 10 steps → 11 pontos. Curva curta (~5-15px) + `peakW` pequeno (`lw*0.5` a `lw*0.75`) → **pontas em `t=0` e `t=1` usam fallback tangente `(1,0)`** (bug 1.1) → fios verticais/horizontais aleatórios em vez de alinhados à curva.

---

### 3.5 `buildCrownVolume` + `domePts` — Largura Base `0.2` vs `0.15` — **BAIXO**
**Linhas:** 263-267

```typescript
taperedInkRibbon(domePts, makeContourWidths(domePts.length, lw * 1.15, 0.2, 0.2), ink);
```

**Problema:** `startW=endW=0.2` > `0.15` (padrão `makeContourWidths` e `taperedInkRibbon` deduplicate). Cria **base da fita mais grossa que a ponta** — intencional para coroa? Mas `taperedInkRibbon` fecha com `Z` assumindo pontas finas → triângulo residual na base da coroa (mais visível que na ponta).

---

## 4. Incompatibilidades com @resvg/resvg-js

### 4.1 Larguras Sub-Pixel (< 0.5px) — Renderização Inconsistente
**Ocorrências:** `wStart=0.16`, `wEnd=0.16`, `0.15`, `0.12`, `0.2` em todo código.

**Comportamento resvg:** Geometria preenchida (`fill`) com largura < 0.5px é **rasterizada com anti-aliasing**, mas:
- **Não há garantia de consistência cross-platform** (CPU vs GPU, diferentes versões freetype/harfbuzz)
- **Pontas muito finas** (0.15px) podem **desaparecer** ou **renderizar como 1px** dependendo de transform/zoom
- **Diferença entre preview (browser SVG) e export (resvg)** — browser usa stroke nativo ou fill com AA diferente

**Mitigação:** Piso mínimo `0.5px` para larguras de tinta visíveis; usar `stroke` nativo para linhas finas (< 0.5px) e `fill` apenas para > 0.5px.

---

### 4.2 Paths Auto-Intersectantes — Comportamento Indefinido
**Origem:** Bugs 1.6, 2.1 (queixo), 3.1 (coroa), 3.2 (clump left/right).

**resvg:** Usa **even-odd fill rule** por default. Paths auto-intersectantes criam **regiões com winding number par = transparente, ímpar = preenchido**. Resultado visual imprevisível (buracos, ilhas).

**SVG Spec:** Paths auto-intersectantes são válidos mas comportamento de fill é implementation-defined para even-odd. resvg segue spec mas **differe de browsers** (Chrome/Firefox usam nonzero winding para alguns casos).

**Correção:** Garantir **zero auto-intersection** via:
- Detecção de cruzamento em `taperedInkRibbon` (comparar `left[i]` com `right[i]` e adjacentes)
- Clipping geométrico ou subdivisão em monotônicos
- Fallback para `stroke` nativo em curvas de alta curvatura

---

### 4.3 `fmt` (2 casas decimais) + Precisão Float — Gaps Sub-Pixel
**Arquivo:** `svg-utils.ts` (importado como `fmt`)

**Problema:** `fmt` arredonda para 2 casas decimais (`0.01px`). Em junções de segmentos (`variableStrokeFromSegments`), o endpoint de um segmento (`p2`) e startpoint do próximo (`p0`) **são o mesmo ponto matematicamente**, mas após `fmt` podem diferir em `0.01px` → gap visível no resvg (que não faz snap-to-pixel como browsers).

**Evidência:** `head-3d.ts:481-525` passa pontos `P2` calculados via `proj()` (float) → `variableStrokeFromSegments` → `sampleQuadBezier`/`sampleCubicBezier` → `taperedInkRibbon` → `fmt` no path data. Cada etapa acumula erro.

---

### 4.4 `fill-opacity` em Múltiplas Camadas Overlapping — Blending Order
**Ocorrências:** `manhwa-hair.ts` usa `opacity` em `taperedInkRibbon` (sheen 0.52, 0.58, 0.62, stray 0.85-0.92).

**Problema:** resvg compõe `fill-opacity` **por elemento**, na ordem do SVG. Múltiplas fitas overlapping (ex: sheen + leftInk + rightInk no mesmo clump) **blendam sequencialmente** → resultado depende da ordem de `parts.push()` em `renderClump`. Diferente de `stroke` nativo com `stroke-opacity` (que é por-traço).

**Não é bug per se**, mas **differe de browser** se ordem de elementos mudar.

---

## 5. Lista Consolidada de Correções (Priorizadas)

| Prioridade | Local | Bug | Correção Mínima |
|------------|-------|-----|-----------------|
| **P0** | `manhwa-ink.ts:105-119` | Tangente endpoint errada | Usar derivada analítica: para quadrática `2*(1-t)*(p1-p0) + 2*t*(p2-p1)` em `t=0` e `t=1`; para cúbica `3*(1-t)²*(p1-p0) + 6*(1-t)*t*(p2-p1) + 3*t²*(p3-p2)` |
| **P0** | `manhwa-ink.ts:173-184` | Junção C⁰ entre segmentos | Exigir C¹: validar que `seg[p].p2 === seg[p+1].p0` E tangentes colineares; ou inserir segmento de transição (Hermite) |
| **P0** | `manhwa-ink.ts:130-138` | Fechamento `Z` deixa triângulo residual | Forçar `wStart=wEnd=0` (ou 0.001) nas pontas; ou adicionar ponto explícito `left[0]=right[0]` antes do `Z` |
| **P0** | `head-3d.ts:481-525` | Mandíbula 5 segmentos C⁰ + auto-intersect | Unificar em 1-2 segmentos longos com controle de tangente; ou usar `buildHairClumpPath`-style single ribbon |
| **P0** | `head-3d.ts:772-784` | Boca `smirk` barriga extrema + tangente | Reduzir `wMid` para ≤ max(wStart,wEnd)*1.5; usar endpoint derivative fix |
| **P1** | `manhwa-ink.ts:33-48` | `deduplicatePoints` corrompe largura | Remover deduplicação (amostragem já limpa); ou usar threshold adaptativo `max(1e-3, avgStep*0.01)` e interpolar larguras |
| **P1** | `manhwa-ink.ts:151-154` | `evalQuadWidth` extrapola negativo | Clampar `wMid` em `[min(wStart,wEnd), max(wStart,wEnd)]` ou usar interpolação monotônica (Fritsch-Carlson) |
| **P1** | `manhwa-hair.ts:258-268` | Coroa junção C⁰ em `apex` | Garantir tangentes colineares em `apex` (ajustar `backHigh`/`frontTop`); ou usar único cúbico contínuo |
| **P1** | `manhwa-hair.ts:178-195` | Left/Right ink fitas separadas | Renderizar clump como fita única: `taperedInkRibbon(leftEdge + reverse(rightEdge), widthsCombinados)` |
| **P2** | `manhwa-ink.ts:90-145` | Auto-intersection em alta curvatura | Adicionar detecção: `if (cross(left[i], left[i+1], right[i], right[i+1])) subdividir ou miter` |
| **P2** | `manhwa-hair.ts:137-146` | `makeContourWidths` derivada descontínua em t=0.5 | Usar `bell = sin(π*t)` simétrico; ou `smoothstep` contínuo em derivadas |
| **P2** | `svg-utils.ts` (`fmt`) | Precisão 2 casas causa gaps | Aumentar para 3-4 casas (`fmt3`/`fmt4`) para geometria de fitas; ou usar `toFixed(3)` |
| **P3** | Geral | Larguras sub-pixel < 0.5px | Piso mínimo 0.5px para `fill`; usar `stroke` nativo para detalhes finos |
| **P3** | `head-3d.ts:330-370` | Pescoço 3 fitas separadas | Unificar em `variableStrokeFromSegments` multi-segmento |

---

## 6. Testes de Regressão Recomendados

1. **Snapshot visual** (resvg PNG) para:
   - Mandíbula 3/4 view (yaw=34°) — verificar ausência de espinhos em `chinPt`, `farCheek`, `nearJawAngle`
   - Boca `smirk` e neutra — pontas alinhadas à curva, sem degrau de largura
   - Coroa cabelo masculino/feminino — ápice suave, sem espinho
   - Clump de cabelo isolado — raiz fechada, ponta afilada, sem gap left/right

2. **Teste unitário geométrico:**
   - `taperedInkRibbon`: endpoints têm tangente paralela à curva (dot product > 0.99)
   - `variableStrokeFromSegments`: junções C¹ (ângulo entre tangentes < 1°)
   - `evalQuadWidth`: `w(t) ∈ [min(wStart,wEnd), max(wStart,wEnd)]` para todo `t∈[0,1]`
   - `deduplicatePoints`: largura preservada (soma de áreas ≈ original)

3. **Cross-render diff:** Browser SVG vs resvg PNG (pixel diff < 0.5% para fitas)

---

## 7. Conclusão

O sistema de fitas de tinta é **conceitualmente correto** (geometria preenchida, determinístico, resvg-safe em princípio), mas a **implementação de junções e endpoints tem falhas geométricas fundamentais** que geram artefatos visuais reais:

- **Endpoints usam tangente horizontal fixa** → pontas viradas
- **Segmentos concatenados sem C¹** → espinhos na mandíbula, coroa, clumps
- **Perfil de largura quadrático não monotônico** → clamp artifacts na boca
- **Fechamento `Z` assume ponta zero** → triângulos residuais
- **Left/Right renderizados separadamente** → gaps na raiz dos tufos

**Correção de alto impacto (< 1 dia):** Fixar tangentes analíticas (P0), forçar `wStart=wEnd≈0` nas pontas (P0), unificar mandíbula em 1-2 segmentos (P0), unificar left/right do clump (P1). Após isso, o sistema será **robusto para @resvg/resvg-js** e visualmente consistente cross-renderer.