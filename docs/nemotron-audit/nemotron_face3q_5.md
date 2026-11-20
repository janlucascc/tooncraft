# Análise Técnica: Pescoço, Gola, Ombros e Mão no Queixo 3/4 — ToonCraft

**Data:** 2026-11-20  
**Arquivos Analisados:**
- `src/templates/head-3d.ts` (linhas 286-418: `neckAndCollarSvg`)
- `src/templates/anatomy-bezier.ts` (linhas 705-756: `anatomicalChinThinkHand`)
- `src/templates/silhouettes.ts` (integração completa)

---

## 1. Por que a Gola Social Branca Aparece no `primitive-hunter`

### Causa Raiz
**Duas fontes de gola colidindo sem guarda condicional:**

| Fonte | Arquivo | Linhas | Condição Atual |
|-------|---------|--------|----------------|
| **Head 3D Rig** | `head-3d.ts` | 373-418 | **Sempre renderizada** (exceto `silhouetteOnly`) |
| **Primitive Hunter Torso** | `silhouettes.ts` | 1004-1007 | `renderPrimitiveHunterOutfit()` desenha peles/couros |

### Fluxo no `silhouettes.ts` (linhas 951-1211)
```typescript
const head3D = threeQuarter && !isEntity && !away
  ? renderParametricHead3D({ ..., coatColor: outfitMain, ... })
  : null;

// ...
const headContent = head3D
  ? head3D.neckAndCollarSvg +  // ← SEMPRE inclui gola branca (linha 374: collarColor default '#E2E8F0')
    head3D.headSvg + ...
  : ... // fallback 2D

// Primitive hunter torso (linha 1004-1007)
const primitiveTorsoSvg = outfit.primitive && !isEntity
  ? renderPrimitiveHunterOutfit(outfitMain, accent, skin, ink, lw, sh)
  : '';
```

### O Problema
1. **`head-3d.ts` linha 128-129:** `collarColor = '#E2E8F0'` (branco/azul-claro) é **hardcoded default**
2. **`silhouettes.ts` linha 972:** Passa `coatColor: outfitMain` mas **não sobrescreve `collarColor`**
3. **`renderPrimitiveHunterOutfit`** (em `anime-features.ts`) desenha **peles/couros rústicos** — sem gola social
4. **Resultado:** Gola branca refinada (terno) + torso peludo (caçador) = **incoerência visual gritante**

### Linhas Exatas do Conflito
- `head-3d.ts:128` — `collarColor?: string` (opcional, default linha 132: `'#E2E8F0'`)
- `head-3d.ts:374` — `const collarFill = silhouetteOnly ? silColor : collarColor;`
- `silhouettes.ts:972` — `coatColor: outfitMain` (passado mas **`collarColor` omitido**)
- `silhouettes.ts:1004-1007` — `primitiveTorsoSvg` desenha por cima mas **não suprime** `neckAndCollarSvg`

### Correção Mínima
**Em `silhouettes.ts` linha 954-974**, passar `collarColor` condicional:
```typescript
const head3D = threeQuarter && !isEntity && !away
  ? renderParametricHead3D({
      // ...
      collarColor: outfit.primitive ? darken(outfitMain, 0.15) : '#E2E8F0',  // ← CORREÇÃO
      coatColor: outfitMain,
      // ...
    })
  : null;
```

**Alternativa mais limpa** (em `head-3d.ts`): tornar `collarColor` obrigatório ou derivar de `coatColor` se não passado.

---

## 2. Por que a Cabeça da `shadow-entity` Flutua

### Causa Raiz
**Duas transformações de cabeça conflitantes + ausência de ancoragem no torso:**

### Transformação A: `headTransform` (linha 1196)
```typescript
const headTransform = `translate(0 -478) scale(0.78) translate(0 478)`;
```
- Encolhe cabeça 22% (`scale(0.78)`) centrada em `y=-478` (base do pescoço)
- Aplicada **após** `upperTransform` (linha 1238)

### Transformação B: `upperTransform` (linha 424)
```typescript
const upperTransform = `translate(${fmt(sk.hip.x)} ${fmt(upperShift)}) rotate(${fmt(sk.lean)} 0 ${REF_HIP_Y})`;
```
- `upperShift = sk.hip.y - REF_HIP_Y` (REF_HIP_Y = -288)

### O Problema para `shadow-entity` (`isEntity = true`)
1. **`head-3d.ts` NÃO é chamado** (linha 953: `threeQuarter && !isEntity && !away`)
2. **Fallback 2D** usa `MANHWA_FACE_PROFILE/FRONT` (linhas 820-824) — **sem pescoço/gola**
3. **`neckSvg` é vazio** (linha 999: `!isEntity ? renderNeckAndCollarCelShade(...) : ''`)
4. **Head flutua** porque:
   - `headTransform` escala em torno de `y=-478` (referência de pescoço que **não existe** para entity)
   - Torso `entity` é **todo preto** (`#07060C` linha 412-418) — sem separação visual pescoço/cabeça
   - `anatomicalTorsoPath` **não é desenhado** para entity (linha 746: `if (!outfit.primitive)`)

### Linhas Exatas
- `silhouettes.ts:402` — `const isEntity = outfit.entity;`
- `silhouettes.ts:412-418` — Paleta entity força tudo `#07060C`
- `silhouettes.ts:746` — `if (!outfit.primitive)` guarda `anatomicalTorsoPath` — **entity pula**
- `silhouettes.ts:953` — `head3D` condicional exclui entity
- `silhouettes.ts:999` — `neckSvg` vazio para entity
- `silhouettes.ts:1196` — `headTransform` assume pescoço em `y=-478`

### Correção
**Opção 1:** Desenhar torso base para entity (remover guarda `!outfit.primitive` na linha 746, adicionar `|| isEntity`)
```typescript
// Linha 746
if (!outfit.primitive || isEntity) {
  upperParts.push({ d: anatomicalTorsoPath(sk.shoulderHalf, isSlender, REF_HIP_Y), fill: outfitMain });
}
```

**Opção 2:** Ajustar `headTransform` para entity (ancorar no ombro/hip em vez de pescoço fictício)
```typescript
// Linha 1196
const headTransform = isEntity
  ? `translate(0 ${fmt(sk.hip.y + 180)}) scale(0.78) translate(0 ${fmt(-sk.hip.y - 180)})`  // ancorado no hip
  : `translate(0 -478) scale(0.78) translate(0 478)`;
```

**Opção 3 (recomendada):** Criar `renderEntityHeadNeck` dedicado que desenhe cabeça+pescoço unificados em preto com aura, sem depender de `headTransform` separado.

---

## 3. Problemas na Junção Pescoço/Gola/Ombro (3/4 View)

### 3.1 Desalinhamento Horizontal: Gola vs Ombro Rotacionado

**Em `head-3d.ts` (linhas 279-283):**
```typescript
const nearShoulderX = -baseShoulderW * lerp(1.0, 0.88, yawT) - 10 * yawT;
const farShoulderX = baseShoulderW * lerp(1.0, 0.44, yawT) + 6 * yawT;
const shoulderY = collarY + 20;
```

**Em `head-3d.ts` (linhas 376-378):**
```typescript
const nb = neckBackBot;   // x ≈ neckBackTop.x + neckLeanX - 2.0
const nf = neckFrontBot;  // x ≈ neckFrontTop.x + neckLeanX + 1.5
const collarMidX = (nb.x + nf.x) * 0.5 + 4 * yawT;
```

**Problema:** `collarMidX` (centro da gola V) **não acompanha** a rotação dos ombros. Em 3/4 (`yawT ≈ 0.38`):
- Ombro próximo (`nearShoulderX`) recua ~12% + 3.8px
- Gola (`collarMidX`) só desloca `+4 * yawT ≈ +1.5px`
- **Resultado:** Gola descolada do ombro, "flutuando" no espaço

### 3.2 Falta de Continuidade Visual: Pescoço → Gola → Ombro

**Pescoço (linhas 313-317):**
```typescript
const neckD = `M${pt(neckBackTop)}C...${pt(neckBackBot)}L${pt(neckFrontBot)}C...${pt(neckFrontTop)}Z`;
```
- `neckBackBot` / `neckFrontBot` terminam em `collarY + 10/12` (linhas 276-277)

**Gola V-base (linhas 382-388):**
```typescript
d: `M${fmt(nb.x - 5)} ${fmt(collarY - 2)}L${fmt(collarMidX + 2)} ${fmt(vBottomY)}L${fmt(nf.x + 5)} ${fmt(collarY + 2)}...`
```
- Inicia em `collarY - 2` (2px **acima** da base do pescoço!)
- `nb.x - 5` / `nf.x + 5` **não coincidem** com `neckBackBot.x` / `neckFrontBot.x`

**Lapela próxima (linhas 392-398):**
```typescript
d: `M${fmt(nb.x - 6)} ${fmt(collarY - 9)}Q${fmt(nb.x + 10)} ${fmt(collarY + 4)} ${fmt(nearLapelTipX)} ${fmt(nearLapelTipY)}...`
```
- Inicia em `collarY - 9` (9px acima do pescoço!)
- `nb.x - 6` vs `neckBackBot.x` → **gap/overlap**

### 3.3 Ombros do Torso (`silhouettes.ts`) Não Falam com Head 3D

**Em `silhouettes.ts`:** Ombros vêm de `skeletonFor()` (ex: linha 166-173 `three-quarter`):
```typescript
shoulderHalf: 44,
armBack: [{ x: -46, y: -452 }, ...],
armFront: [{ x: 34, y: -452 }, ...],
```

**Em `head-3d.ts`:** Ombros calculados localmente (linhas 280-283):
```typescript
const baseShoulderW = isSlender ? 58 : 76;
const nearShoulderX = -baseShoulderW * lerp(1.0, 0.88, yawT) - 10 * yawT;
```

**Desconexão total:** Dois sistemas de coordenadas independentes. O `upperTransform` (linha 424 `silhouettes.ts`) rota/translada o torso, mas `head-3d.ts` **ignora** isso — desenha em coordenadas locais fixas (`HEAD_CY = -542`).

### 3.4 Linha de Costura Dupla (Double Seam)

**Render order em `silhouettes.ts` (linhas 1223-1244):**
```typescript
const body =
  aura +
  rimPass +
  wisps +
  renderBase([...backLayer, ...legParts]) +      // Pernas
  renderShade([...backLayer, ...legParts]) +
  `<g transform="${upperTransform}">` +
  renderBase(upperBack) +                         // Braço traseiro
  `<g transform="${headTransform}">${hairBackSvg}${renderBase(hoodBack)}</g>` +
  neckSvg +                                       // ← Pescoço 2D (se não head3D)
  primitiveTorsoSvg +                             // ← Torso primitive
  renderBase(upperParts) +                        // ← Torso principal (inclui ombros!)
  clothingFoldsSvg +
  torsoAccessoriesSvg +
  renderShade(upperAll) +
  `<g transform="${headTransform}">` +
  headContent +                                   // ← Head 3D COM neckAndCollarSvg!
  '</g>' + ...
```

**Conflito:** 
1. `upperParts` inclui `anatomicalTorsoPath` (linha 747) que desenha **trapezius/ombros** até `y ≈ -474`
2. `headContent` (via `head3D`) inclui `neckAndCollarSvg` que desenha **seu próprio casaco/ombros** (linhas 291-310 `head-3d.ts`) até `coatBottomY = collarY + 66 ≈ -416`
3. **Sobreposição:** Dois casacos, dois ombros, duas golas na zona `y ∈ [-474, -416]`

### Correções Necessárias

| Problema | Local | Correção |
|----------|-------|----------|
| **Gola desalinhada ombro** | `head-3d.ts:378` | `collarMidX` deve usar `nearShoulderX`/`farShoulderX` como referência |
| **Gap pescoço→gola** | `head-3d.ts:382-388` | Iniciar gola V em `neckBackBot.x` / `neckFrontBot.x` exatos, `collarY` (não `-2`) |
| **Lapela descolada** | `head-3d.ts:392-398` | Ancorar em `neckBackBot` real, não `nb` (que é `neckBackBot`) |
| **Dois casacos/ombros** | `silhouettes.ts:1223-1244` | **Mutuamente exclusivos:** se `head3D` ativo, **pular** `anatomicalTorsoPath` e ombros em `upperParts` |
| **Coords head3d vs torso** | `head-3d.ts` | Aceitar `shoulderRef: { near: P, far: P, y: number }` do `skeletonFor` para alinhar |

### Refatoração Recomendada (Arquitetural)

**Unificar "Neck-Collar-Shoulder" em um único módulo:**

```typescript
// Novo: src/templates/neck-collar-shoulder.ts
export interface NeckCollarShoulderInput {
  yawDeg: number;
  pitchDeg: number;
  isSlender: boolean;
  skin: string;
  skinInk: string;
  coatColor: string;
  collarColor: string;
  // Referências do skeleton (fonte única da verdade)
  shoulderNear: P;
  shoulderFar: P;
  shoulderY: number;
  neckBaseY: number;  // onde pescoço encontra gola
  defs: DefsCollector;
  lw: number;
  ink: string;
  silhouetteOnly: boolean;
}

export function renderNeckCollarShoulder(input: NeckCollarShoulderInput): {
  svg: string;
  chinPoint: P;  // para head transform
}
```

**Benefícios:**
- Single source of truth para geometria pescoço/gola/ombro
- Elimina duplicação `head-3d.ts` (casaco/ombros) ↔ `silhouettes.ts` (torso/ombros)
- `anatomicalChinThinkHand` recebe `chinPoint` consistente
- `primitive-hunter` passa `collarColor = darken(coatColor, 0.15)` automaticamente
- `shadow-entity` usa versão simplificada (sem gola social)

---

## 4. `anatomicalChinThinkHand` — Integração 3/4 (Análise)

### Linhas 705-756 (`anatomy-bezier.ts`)
```typescript
export function anatomicalChinThinkHand(
  chin: P,      // ← Vem de head3D.chinPoint (projetado 3D)
  scale: number, // ← isSlender ? 0.84 : 0.95 (linha 979 silhouettes.ts)
  skin: string,
  ink: string,
  lw: number,
): string
```

### Uso em `silhouettes.ts` (linhas 977-980)
```typescript
const chinHandSvg =
  head3D && layer.framing === 'close-up' && !outfit.armor && (!layer.weaponProp || layer.weaponProp === 'none')
    ? anatomicalChinThinkHand(head3D.chinPoint, isSlender ? 0.84 : 0.95, skin, skinInk, lw)
    : '';
```

### Problemas Identificados

1. **Coordenadas Locais Hardcoded** (linhas 713, 719-737):
   ```typescript
   const p = (dx: number, dy: number) => `${fmt(chin.x + dx * s)} ${fmt(chin.y + dy * s)}`;
   // mainHand: M${p(4, 3)}C${p(9, 1)}...L${p(5, 52)}...
   ```
   - Assume `chin` como origem (0,0) local
   - `dx > 0` = direita (lado do observador em 3/4)
   - **Funciona** porque `headTransform` centraliza cabeça em x=0

2. **Escala Heurística** (linha 979):
   - `isSlender ? 0.84 : 0.95` — magic numbers sem base anatômica
   - Deveria derivar de `headTransform.scale (0.78)` + proporção mão/cabeça

3. **Sombra `rgba(0,0,0,0.14)` Hardcoded** (linha 714):
   - Não usa `skinShade` nem `celAlpha` do contexto
   - Inconsistente com resto do shading

4. **Condição de Ativação Restritiva** (linha 978):
   - Só em `close-up` + `head3D` + sem armadura + sem arma
   - **Não aparece em `three-quarter` framing** (onde faria mais sentido narrativamente)

5. **`midFinger` Duplicado** (linhas 719-721, 750-751):
   ```typescript
   const midFinger = `M${p(6, 12)}C${p(-2, 11)}...Z`;
   // Renderizado DUAS vezes: fill+stroke + fill shade
   ```
   - OK visualmente, mas desperdício

### Correções Sugeridas
```typescript
// Em silhouettes.ts linha 979
const handScale = 0.78 * (isSlender ? 1.08 : 1.22); // 0.78 = headTransform.scale

// Em anatomy-bezier.ts
export function anatomicalChinThinkHand(
  chin: P,
  scale: number,
  skin: string,
  ink: string,
  lw: number,
  skinShade: string,      // ← NOVO: sombra consistente
  celAlpha: number,       // ← NOVO: opacity consistente
): string
```

---

## 5. Resumo de Correções Priorizadas

| Prioridade | Item | Arquivo/Linhas | Esforço |
|------------|------|----------------|---------|
| **P0** | Gola branca no primitive-hunter | `silhouettes.ts:972` (passar `collarColor`) | 5 min |
| **P0** | Cabeça entity flutua | `silhouettes.ts:746, 953, 1196` (torso base + headTransform) | 30 min |
| **P1** | Gap pescoço→gola (Y mismatch) | `head-3d.ts:382-388` (usar `collarY` exato) | 15 min |
| **P1** | Gola desalinhada ombro (X mismatch) | `head-3d.ts:378` (usar `nearShoulderX`/`farShoulderX`) | 20 min |
| **P1** | Dois casacos/ombros sobrepostos | `silhouettes.ts:1223-1244` (mutuamente exclusivo) | 1h |
| **P2** | Unificar Neck-Collar-Shoulder module | Novo arquivo + refator `head-3d.ts` + `silhouettes.ts` | 1 semana |
| **P3** | `anatomicalChinThinkHand` scaling/shading | `anatomy-bezier.ts:705-756`, `silhouettes.ts:979` | 1h |

---

## 6. Diagramas de Fluxo (Para Implementação)

### Fluxo Atual (Problemático)
```
silhouettes.ts:renderCharacterFigure
  ├─ skeletonFor() → shoulder coords
  ├─ upperTransform (rotate/translate torso)
  ├─ head3D = renderParametricHead3D(yaw=34, coatColor=outfitMain)
  │   └─ neckAndCollarSvg (collarColor='#E2E8F0' DEFAULT, own shoulders)
  ├─ anatomicalTorsoPath (own shoulders, até y=-474)
  ├─ upperParts (blazer/gi/coat/armor overlays)
  ├─ headTransform (scale 0.78 @ y=-478)
  └─ COMPOSIÇÃO FINAL:
      upperParts (torso shoulders) + headContent (head3D neck+collars+own shoulders)
      = SOBREPOSIÇÃO ZONA y[-474, -416]
```

### Fluxo Corrigido (Proposto)
```
silhouettes.ts:renderCharacterFigure
  ├─ skeletonFor() → shoulder coords (FONTE ÚNICA)
  ├─ upperTransform
  ├─ NECK_COLLAR_SHOULDER = renderNeckCollarShoulder({
        yawDeg: 34,
        shoulderNear: sk.armFront[0],  // ou shoulder coords do skeleton
        shoulderFar: sk.armBack[0],
        shoulderY: sk.hip.y + offset,
        collarColor: outfit.primitive ? darken(outfitMain,0.15) : '#E2E8F0',
        coatColor: outfitMain,
        ...
      })
  ├─ IF head3D:
  │    headSvg = renderParametricHead3D({ ..., neckAndCollarSvg: '' })  // SEM pescoço/gola
  │    chinPoint = headSvg.chinPoint
  └─ COMPOSIÇÃO FINAL:
      upperParts (TORSO SEM OMBROS - apenas ribcage/waist) 
      + NECK_COLLAR_SHOULDER.svg (pescoço+gola+ombros UNIFICADOS)
      + headSvg (apenas cabeça/rosto/cabelo)
```

---

*Análise concluída. Nenhum arquivo foi modificado. Relatório salvo em `/home/janlucas/.gemini/antigravity/brain/8289083d-01a8-41d1-987c-ea5fdef6e0f5/scratch/nemotron_face3q_5.md`.*