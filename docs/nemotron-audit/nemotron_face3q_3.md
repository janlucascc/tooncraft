# Análise Técnica: Far-Side Lock Flutuante e Costuras no Cabelo 3/4
**Arquivo:** `src/templates/manhwa-hair.ts`  
**Subagente:** 3 (Multi-Clump 3/4 Hair)  
**Data:** 2026-11-20  

---

## Resumo Executivo

A **mecha lateral direita (farSideLock)** flutua desconectada porque:
1. **Está no layer errado** — renderizada em `hairFrontSvg` (frente) quando deveria estar em `hairBackSvg` (trás) ou ser ocultada por oclusão da cabeça
2. **Não há culling por yaw** — a mecha é sempre desenhada, mesmo em ângulos onde a cabeça a bloqueia (3/4 → perfil)
3. **Geometria projeta para trás da cabeça** — `surf(farAz - 12, ...)` com `tipY` positivo (`ry * 0.32` / `ry * 0.65`) projeta a ponta na **superfície posterior** do crânio, mas o path é desenhado no espaço 2D como se estivesse à frente
4. **Falta ancoragem visual** — não conecta ao sideburn/ear framing do lado próximo, criando gap visível

Há **costuras/falhas adicionais** no cabelo 3/4: transição crown→bangs abrupta, sideburns não fundem com far-side lock, angel-ring highlight não acompanha yaw.

---

## 1. Far-Side Lock Masculino (Linhas 426–444)

### Código Problemático
```typescript
// Linhas 426–444
const farSideRoot = surf(farAz - 12, -ry * 0.38, 1.04);      // Raiz na têmpora lateral (lado distante)
const farSideTip = surf(farAz - 8, ry * 0.32, 1.03);          // PONTA: ry * 0.32 = ABAIXO do equador (positivo = posterior)
const farSideLock = buildHairClumpPath({
  root: farSideRoot,
  rootHalfW: lerp(4.2, 2.8, yawT),                            // Fina (3.5 @ 3/4)
  tip: { x: farSideTip.x + 1.5, y: farSideTip.y + 4 },       // Offset +4px PARA BAIXO
  midOffset: -2.4,                                            // Curva para "dentro" (normal aponta para fora da cabeça)
  tipOffset: 1.4,
  bellyScale: 0.86,
});
frontParts.push(renderClump(farSideLock, { ... }));           // ← RENDERIZADO NO FRONT LAYER
```

### Por Que Flutua Desconectada

| Problema | Linha | Explicação Técnica |
|----------|-------|-------------------|
| **Layer errado** | 443 | `frontParts.push()` coloca no `hairFrontSvg` (sobre rosto). Em 3/4 (`yawDeg ≈ 34°`), o lado distante (`farAz ≈ 60°`) está **oculto pela cabeça**. Deveria ir em `backParts` (hairBackSvg) ou ser suprimido. |
| **`tipY` positivo projeta posterior** | 427 | `surf(farAz - 8, ry * 0.32, 1.03)` → `y = +0.32 * ry` está **abaixo do equador** na superfície **traseira/lateral** do crânio. A mecha "sai" da têmpora e vai para trás da cabeça, mas o SVG desenha no plano 2D como se descesse pela face. |
| **Normal invertida para o lado distante** | 432 | `midOffset: -2.4` usa `nx, ny` calculados em `buildHairClumpPath` (linhas 94–95: `nx = -dy/len, ny = dx/len`). Como `tip.y > root.y` (desce), `dy > 0` → `nx < 0`. No lado distante, a normal aponta **para dentro do crânio**. `midOffset` negativo empurra **mais para dentro**. |
| **Sem culling por yaw** | — | Não há `if (yawDeg > LIMITE) return ''` ou `opacity = f(yawDeg)`. Em perfil (`yawDeg ≥ 58°`), a mecha deveria sumir completamente. |
| **Desconexão do sideburn** | 386–423 vs 426–444 | Near sideburns (linhas 386–423) ancoram em `surf(-56...)` e `surf(-48...)` (lado próximo). Far-side lock em `surf(farAz - 12...)` (lado distante). **Gap de ~90°–100° azimutal** sem mechas de transição. |

### Correção Exata (Masculino)

```typescript
// SUBSTITUIR linhas 426–444 por:

// Far-side lock: mover para hairBackSvg (Depth 1) com culling por yaw
const farSideLockYawMax = 42; // graus - além disso some (cabeça bloqueia)
if (yawDeg < farSideLockYawMax) {
  const farSideRoot = surf(farAz - 12, -ry * 0.38, 1.04);
  // Projetar ponta na MESMA superfície lateral (y negativo), não posterior
  const farSideTip = surf(farAz - 8, -ry * 0.18, 1.03); // ERA: ry * 0.32 (positivo)
  const farSideLock = buildHairClumpPath({
    root: farSideRoot,
    rootHalfW: lerp(4.2, 2.8, yawT),
    tip: { x: farSideTip.x + 1.5, y: farSideTip.y + 2 }, // ERA: +4
    midOffset: 2.4,  // ERA: -2.4 (inverter: empurrar para FORA da cabeça no lado distante)
    tipOffset: -1.4, // ERA: 1.4 (inverter)
    bellyScale: 0.86,
  });
  // Adicionar ao BACK layer (antes do crown volume)
  backParts.push(
    renderClump(farSideLock, {
      fill: midShade,
      ink,
      leftInkW: lw * 0.75,
      rightInkW: lw * 0.95,
      silhouetteOnly,
    }),
  );
}
// Adicionar mecha de transição (temple bridge) no front layer para preencher gap
if (yawDeg < 50) {
  const bridgeRoot = surf(lerp(nearAz + 10, farAz - 20, 0.5), -ry * 0.35, 1.03);
  const bridgeTip = surf(lerp(nearAz + 10, farAz - 20, 0.5), ry * 0.1, 1.04);
  const bridgeLock = buildHairClumpPath({
    root: bridgeRoot,
    rootHalfW: lerp(3.5, 2.0, yawT),
    tip: { x: bridgeTip.x, y: bridgeTip.y + 1 },
    midOffset: 0,
    tipOffset: 0,
    bellyScale: 0.8,
  });
  frontParts.push(renderClump(bridgeLock, {
    fill: midShade, ink, leftInkW: lw * 0.6, rightInkW: lw * 0.6, silhouetteOnly
  }));
}
```

---

## 2. Far-Side Lock Feminino (Linhas 759–781)

### Código Problemático
```typescript
// Linhas 759–781
const farSideRoot = surf(farAz - 12, -ry * 0.36, 1.045);
const farSideTip = surf(farAz - 10, ry * 0.65, 1.04);  // ry * 0.65 = BEM ABAIXO (queixo/colar)
const farSideLock = buildHairClumpPath({
  root: farSideRoot,
  rootHalfW: lerp(6.8, 4.2, yawT),
  tip: { x: farSideTip.x + 2, y: chinPt.y + (isLongFlowing ? 20 : 6) }, // Ancora no queixo!
  midOffset: 3.5,
  tipOffset: -2.8,
  bellyScale: 0.94,
});
frontParts.push(renderClump(farSideLock, { ... })); // ← FRONT LAYER
```

### Por Que Flutua Desconectada (Feminino)

| Problema | Linha | Explicação |
|----------|-------|------------|
| **Layer errado** | 780 | Mesmo problema: `frontParts` = sobre rosto. Cabelo longo no lado distante deve ir em `backParts`. |
| **`tipY = ry * 0.65` extremo** | 761 | Projeta na **base do crânio/posterior**. `chinPt.y` é referência anterior, mas `surf(farAz - 10, ry * 0.65...)` está na nuca. A mecha "atravessa" a cabeça geometricamente. |
| **Ancora no `chinPt.y` mas raiz na têmpora distante** | 765 | Cria mecha gigante que cruza o espaço 3D da cabeça. No 2D projeta como mecha flutuante longa sem conexão com raiz visível. |
| **Sem transição para curtain bangs** | 783–822 | Curtain bangs (linhas 783–822) ficam no lado frontal (`partAz ≈ -4° a +6°`). Far-side lock em `farAz - 12 ≈ 48°`. **Gap de ~50°–60°** sem mechas. |
| **Side locks femininos (near) não fundem** | 719–757 | Near side locks ancoram em `surf(-52...)` e `surf(-64...)` (lado próximo). Far-side em `farAz - 12`. Desconexão total. |

### Correção Exata (Feminino)

```typescript
// SUBSTITUIR linhas 759–781 por:

// Far-side cheek lock: mover para BACK layer com culling
const farSideLockYawMax = 38; // Mais conservador (cabelo longo = mais oclusão)
if (yawDeg < farSideLockYawMax) {
  const farSideRoot = surf(farAz - 12, -ry * 0.36, 1.045);
  // Ponta na MESMA face lateral (y negativo a leve positivo), NÃO na nuca
  const farSideTip = surf(farAz - 10, -ry * 0.05, 1.04); // ERA: ry * 0.65
  const farSideLock = buildHairClumpPath({
    root: farSideRoot,
    rootHalfW: lerp(6.8, 4.2, yawT),
    tip: { x: farSideTip.x + 2, y: farSideTip.y + (isLongFlowing ? 18 : 4) }, // ERA: chinPt.y + 20/6
    midOffset: -3.5,  // ERA: 3.5 (inverter: lado distante, normal aponta para dentro)
    tipOffset: 2.8,   // ERA: -2.8 (inverter)
    bellyScale: 0.94,
  });
  backParts.push(renderClump(farSideLock, {
    fill: midShade, ink,
    leftInkW: lw * 0.8, rightInkW: lw * 1.0,
    sheenColor: sheen, sheenWidth: lw * 0.85, sheenOpacity: 0.45,
    silhouetteOnly,
  }));
}

// Mecha de transição temple→cheek (preenche gap curtain bangs ↔ far-side)
if (yawDeg < 48) {
  const transRoot = surf(farAz - 24, -ry * 0.4, 1.03);
  const transTip = surf(farAz - 18, ry * 0.15, 1.04);
  const transLock = buildHairClumpPath({
    root: transRoot, rootHalfW: lerp(5.0, 3.0, yawT),
    tip: { x: transTip.x, y: transTip.y + 2 },
    midOffset: -2.0, tipOffset: 1.2, bellyScale: 0.85,
  });
  frontParts.push(renderClump(transLock, {
    fill: midShade, ink, leftInkW: lw * 0.7, rightInkW: lw * 0.7,
    sheenColor: sheen, sheenWidth: lw * 0.7, sheenOpacity: 0.4, silhouetteOnly
  }));
}
```

---

## 3. Outras Costuras/Falhas no Cabelo 3/4

### 3.1 Transição Crown Volume → Bangs Abrupta (Ambos)
**Linhas 383 / 544–567 (M) | 716 / 783–838 (F)**

```typescript
// Crown volume termina em frontTemple/nearTemple (linhas 234–235, 237)
// Bangs começam em rootAz = 42, 24, 8, -6, -22, -38, -52 (M)
// Gap angular: frontTemple ≈ farAz - 16 ≈ 44°, primeiro bang = 42° → OK
// Mas nearTemple ≈ -54°, último bang = -52° → OK angularmente
// PROBLEMA: Crown volume usa `surf()` com rScale 1.02–1.055 (volume)
// Bangs usam rScale 1.015 (raiz) → 1.05 (ponta) — DESCONTINUIDADE DE ESCALA
// Resultado: bangs "saltam" para fora do volume do crown visualmente
```

**Correção:** Unificar `rScale` base = `1.03` para crown edge e bang roots; adicionar mecha "bridge" sobreposta.

### 3.2 Sideburns Não Fundem com Far-Side Lock (Masculino)
**Linhas 386–423 (near sideburns) vs 426–444 (far lock)**

```typescript
// Near sideburn 1: root surf(-56, -ry*0.28), tip jawAngle+4
// Near sideburn 2: root surf(-48, -ry*0.38), tip jawAngle+8
// Far lock: root surf(farAz-12, -ry*0.38) ≈ surf(48, -ry*0.38)
// Gap: -48° a +48° = 96° sem cobertura lateral
// Em 3/4 (yawT≈0.5), o lado distante começa a aparecer — precisa de mechas intermediárias
```

**Correção:** Adicionar 2 "temple transition locks" entre `nearAz + 20` e `farAz - 20` no front layer.

### 3.3 Angel-Ring Highlight Não Acompanha Yaw (Ambos)
**Linhas 571–584 (M) | 880–893 (F)**

```typescript
// Masculino: sheenArc de surf(-42...) a surf(38...) via proj(0, -ry*0.88...)
// Feminino: haloArc de surf(-46...) a surf(44...) via proj(0, -ry*0.86...)
// PROBLEMA: Pontos fixos em azimute absoluto. Em yaw > 0, o highlight deveria rotacionar com a cabeça.
// Atualmente: highlight permanece centrado no canvas, não na cabeça rotacionada.
```

**Correção:** Basear azimutes em `nearAz`/`farAz` ou `yawT`:
```typescript
const sheenLeftAz  = lerp(-42, -60, yawT);  // Acompanha rotação
const sheenRightAz = lerp(38,  20,  yawT);
const sheenCenter  = proj(0, -ry * 0.88, rz * 0.78); // Centro fixo no topo
```

### 3.4 Crown Volume `backLow` Branch Inconsistente (Linhas 228–231)
```typescript
const backLow =
  yawDeg >= 50
    ? surf(nearAz + 6, ry * 0.22, 1.04)   // Perfil: ponto na lateral baixa
    : { x: earTop.x - 3.5, y: earTop.y + 3 }; // Frontal/3/4: hardcoded relative to earTop
// PROBLEMA: Descontinuidade em yawDeg = 50. earTop muda com yaw, mas branch fixo não.
// Em 3/4 (yawDeg=34), usa branch else → earTop.x - 3.5. Mas earTop já está rotacionado.
// Resultado: crown volume "pula" lateralmente near yaw=50.
```

**Correção:** Unificar em `surf()` contínuo:
```typescript
const backLow = surf(nearAz + lerp(4, 8, clamp((yawDeg - 30) / 20, 0, 1)), 
                     ry * lerp(-0.1, 0.22, clamp((yawDeg - 30) / 20, 0, 1)), 
                     1.04);
```

### 3.5 `nearSideRoot` Feminino Hardcoded (Linha 719)
```typescript
const nearSideRoot = surf(-52, -ry * 0.34, 1.045); // -52° fixo
// PROBLEMA: Não usa nearAz (que varia com yaw). Em yaw=0, nearAz≈-90; em yaw=34, nearAz≈-56.
// -52° só funciona near yaw=34. Em frontal, mecha nasce no lugar errado.
```

**Correção:** `const nearSideRoot = surf(nearAz + 8, -ry * 0.34, 1.045);`

### 3.6 `farSideTip` Masculino Usa `surf` Inconsistente (Linha 427)
```typescript
const farSideTip = surf(farAz - 8, ry * 0.32, 1.03);
// farAz ≈ 60° (yaw=34). surf(52°, +0.32*ry) → ponto na LATERAL POSTERIOR inferior.
// Deveria ser ponto na LATERAL ANTERIOR (face visível): y NEGATIVO ou leve positivo.
```

---

## 4. Lista Consolidada de Correções (Prioridade)

| # | Arquivo/Linha | Tipo | Correção |
|---|---------------|------|----------|
| 1 | M:426–444 | **Crítico** | Mover far-side lock para `backParts`, inverter `midOffset/tipOffset`, `tipY` negativo, culling `yawDeg < 42` |
| 2 | F:759–781 | **Crítico** | Mover para `backParts`, `tipY = -ry*0.05`, ancorar em `farSideTip.y` não `chinPt.y`, culling `yawDeg < 38` |
| 3 | M:386–423 + 426–444 | **Alto** | Adicionar 2 "temple bridge locks" entre near sideburns e far lock (front layer, culling `yawDeg < 50`) |
| 4 | F:719 | **Alto** | `nearSideRoot = surf(nearAz + 8, ...)` em vez de `-52` hardcoded |
| 5 | M:571–584 / F:880–893 | **Médio** | Angel-ring highlight azimutes baseados em `yawT`/`nearAz`/`farAz` |
| 6 | M:228–231 | **Médio** | `backLow` contínuo via `surf()` com `lerp` suave, sem branch hardcoded |
| 7 | M:236 / F:784 | **Médio** | `hairlineMid` / `partAz` usar `lerp` contínuo sem constantes mágicas |
| 8 | M:544–567 / F:824–838 | **Baixo** | Unificar `rScale` crown edge (1.03) com bang roots (1.015→1.03) |
| 9 | M:427 / F:761 | **Baixo** | Documentar convenção: `tipY` negativo = face anterior, positivo = posterior |

---

## 5. Causa Raiz Arquitetural

O problema fundamental: **o sistema de cabelo assume simetria bilateral implícita** mas o **render 3/4 quebra essa simetria**. 

- `nearAz` / `farAz` são fornecidos pelo head renderer (linhas 27–28 do `Hair3DProjection`)
- Mas as specs de cabelo (`bangSpecs`, `curtainSpecs`, `farSideLock`) usam **azimutes absolutos fixos** (42, 24, 8, -6, -52, etc.)
- Em frontal (`yaw=0`): `nearAz ≈ -90`, `farAz ≈ 90` → specs funcionam por simetria
- Em 3/4 (`yaw=34`): `nearAz ≈ -56`, `farAz ≈ 60` → specs **não acompanham** a rotação da cabeça

**Solução estrutural:** Todas as posições de mechas deveriam ser expressas **relativas a `nearAz`/`farAz`/`yawT`**, não em graus absolutos. Exemplo:
```typescript
// Em vez de: rootAz: 42
// Usar: rootAz: farAz - 18  // 18° à frente da têmpora distante
```

Isso eliminaria a necessidade de culling heurístico — as mechas naturalmente rotacionariam com a cabeça e seriam ocultadas pelo depth sorting correto (back vs front layer).

---

## 6. Como Testar a Correção

1. **Gerar head-sheet** em `yawDeg = 0, 15, 30, 45, 60, 90` para ambos sexos
2. **Verificar visualmente:**
   - Far-side lock some suavemente entre 35°–45° (não pop)
   - Nenhuma mecha flutua desconectada da têmpora/maxila
   - Crown volume → bangs transição suave (sem degrau de escala)
   - Angel-ring highlight rotaciona com a cabeça
   - Sideburns fundem com temple locks → far lock (quando visível)
3. **Diff pixel-a-pixel** entre frames consecutivos do head-sheet — deve ser suave

---

*Análise concluída. Nenhum arquivo foi alterado. Correções listadas com linhas exatas e código de substituição.*