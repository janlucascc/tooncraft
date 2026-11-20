# Análise Técnica: Desalinhamentos no Rig 3D de Cabeça (head-3d.ts)

**Arquivo:** `src/templates/head-3d.ts`  
**Seções Analisadas:** 4 (Orelha, Linha 473-611) e 5 (Olhos, Sobrancelhas, Nariz, Boca, Linha 613-825)  
**Data:** 2026-11-20  
**Agente:** Subagente 2 — Olhos, Sobrancelhas, Nariz, Boca e Orelha 3D  

---

## Resumo dos Problemas Identificados

| Problema | Severidade | Localização |
|----------|------------|-------------|
| **Desalinhamento de olhar** (near vs far eye) | 🔴 Crítico | Linhas 638-690 |
| **Nariz "solto" / não ancorado em 3/4** | 🔴 Crítico | Linhas 733-761 |
| **Orelha far-side desaparece prematuramente** | 🟠 Alto | Linhas 609-611 |
| **Proporção orelha/sobrancelha em 3/4** | 🟠 Alto | Linhas 563-575, 722-731 |

---

## 1. Desalinhamento de Olhar: Olho Próximo vs Olho Distante

### Localização Exata
**Linhas 638-690** — Configuração e renderização dos olhos

```typescript
// Linhas 638-643: Configuração dos ângulos
const eyeConfigs: Array<{ thOuter: number; thCenter: number; thInner: number; isNear: boolean }> = [
  { thOuter: -34, thCenter: -21, thInner: -9, isNear: true },   // Olho PRÓXIMO (lado esquerdo)
];
if (yawDeg < 68) {
  eyeConfigs.push({ thOuter: 30, thCenter: 20, thInner: 10, isNear: false }); // Olho DISTANTE (lado direito)
}

// Linhas 646-648: Projeção dos pontos de cada olho
for (const ec of eyeConfigs) {
  const pOuter = surf(ec.thOuter, eyeY - (ec.isNear ? 1.1 : 0.7), 0.98);
  const pInner = surf(ec.thInner, eyeY + 1.1, 0.98);
  const pMid = surf(ec.thCenter, eyeY, 0.99);
```

### Análise do Problema

**Causa Raiz:** Os ângulos `thOuter`/`thCenter`/`thInner` são definidos em **espaço esférico local** (longitude no crânio), mas **não há garantia de que os vetores de olhar (iris centers) converjam para o mesmo ponto no espaço 3D**.

1. **Olho próximo** usa ângulos negativos: `-34°` → `-21°` → `-9°` (lado esquerdo do crânio)
2. **Olho distante** usa ângulos positivos: `30°` → `20°` → `10°` (lado direito do crânio)
3. A diferença **não é simétrica**: near span = 25°, far span = 20°
4. O `pMid` (centro do olho) é projetado independentemente para cada olho — **não há vetor de olhar compartilhado**

**Resultado Visual:** Em 3/4 view (30°-45°), o olho distante parece "olhar para fora" (wall-eyed) ou "olhar para dentro" (cross-eyed) relativo ao olho próximo, porque:
- A íris do olho distante é posicionada em `irisCx = pMid.x + lerp(0, 0.4, yawT)` (linha 677)
- O olho próximo usa `lerp(0, 1.0, yawT)` — **deslocamento horizontal diferente**
- Não há correção de **vergência** (convergência binocular)

### Correção Precisa

**Opção A — Vetor de Olhar Compartilhado (Recomendada):**

```typescript
// ANTES (linhas 638-643): Ângulos fixos independentes
const eyeConfigs = [ ... ];

// DEPOIS: Calcular direção de olhar alvo (ex: ponto no infinito à frente do personagem)
const gazeTargetZ = -FOCAL * 2; // Ponto "no infinito" na direção frontal
const gazeTarget = proj(0, eyeY, gazeTargetZ);

// Para cada olho, calcular pMid de forma que a linha (pMid -> gazeTarget) seja o eixo óptico
for (const ec of eyeConfigs) {
  // Encontrar thCenter tal que o raio projetado passe por gazeTarget
  // Ou mais simples: usar o MESMO thCenter para ambos os olhos, apenas espelhar thOuter/thInner
  const sharedThCenter = -21; // Ou calcular dinamicamente baseado no yaw
  
  const pMid = surf(ec.isNear ? -sharedThCenter : sharedThCenter, eyeY, 0.99);
  // thOuter/thInner simétricos:
  const thOuter = ec.isNear ? -34 : 34;
  const thInner = ec.isNear ? -9 : 9;
  // ...
}
```

**Opção B — Correção Mínima (Ajuste de Parâmetros):**

```typescript
// Linha 642: Ajustar ângulos para simetria + vergência
eyeConfigs.push({ thOuter: 34, thCenter: 21, thInner: 9, isNear: false }); // Era 30, 20, 10

// Linha 677: Mesmo fator de deslocamento para ambos
const irisCx = pMid.x + (ec.isNear ? lerp(0, 0.7, yawT) : lerp(0, 0.7, yawT)); // Era 1.0 vs 0.4
```

**Validação:** Em `yawDeg = 35°`, renderizar head-sheet e verificar que linhas imaginárias passando pelos centros das pupilas se cruzam a ~2-3m à frente do personagem (vergência natural).

---

## 2. Nariz "Solto" / Não Ancorado em 3/4 View

### Localização Exata
**Linhas 733-761** — Renderização do nariz

```typescript
// Linhas 734-735: Guarda - só renderiza se !masked && yawDeg < 58
if (!masked && yawDeg < 58) {
  if (isFrontBlend > 0.6) {
    // Frente: minimal accent (linhas 737-743)
  } else {
    // 3/4 view: linhas 745-760
    const noseMid = { x: lerp(noseBridge3D.x, noseTip3D.x, 0.52), y: lerp(noseBridge3D.y, noseTip3D.y, 0.52) };
    headSvg += el('path', {  // Sombra inferior
      d: `M${pt(noseTip3D)}L${pt(noseBase3D)}L${fmt(noseBase3D.x - 2.2)} ${fmt(noseBase3D.y - 1.2)}Z`,
      fill: skinShade, 'fill-opacity': 0.68,
    });
    headSvg += el('path', {  // Contorno crista + ponta
      d: `M${pt(noseMid)}L${pt(noseTip3D)}Q${fmt(noseTip3D.x - 1.0)} ${fmt(noseTip3D.y + 2.0)} ${pt(noseBase3D)}`,
      fill: 'none', stroke: skinDeep, 'stroke-width': lw * 0.58 + 0.2,
    });
  }
}
```

### Análise do Problema

**Causa Raiz:** Os pontos 3D do nariz (`noseBridge3D`, `noseTip3D`, `noseBase3D`) são projetados com **x = 0** (linhas 205-207):

```typescript
// Linhas 205-207: Nariz SEMPRE no centro (x=0)
const noseBridge3D = proj(0, eyeY + 1.5, rz * 0.97);
const noseTip3D = proj(0, noseY, rz * 1.22);
const noseBase3D = proj(0, noseY + 3.6, rz * 0.96);
```

Em 3/4 view (`yawDeg = 30°-45°`):
- O nariz **deveria projetar-se para o lado distante** (right side em yaw positivo)
- Mas `x=0` mantém o nariz **exatamente no plano sagital central**
- Resultado: o nariz flutua "descolado" da face, não integrando com a bochecha/olho distante

**Agravante:** A sombra inferior (linha 748) usa `noseBase3D.x - 2.2` — **hardcoded offset esquerdo** que funciona só para frente. Em 3/4, a sombra deveria cair no lado **distante** (direito).

### Correção Precisa

**Deslocar o nariz 3D para o lado distante conforme yaw:**

```typescript
// LINHAS 205-207: Substituir x=0 por offset baseado em yaw
const noseOffsetX = lerp(0, rx * 0.18, yawT); // 0° → 0, 90° → ~6.7px (slender) / ~7.3px (athletic)
const noseBridge3D = proj(noseOffsetX, eyeY + 1.5, rz * 0.97);
const noseTip3D = proj(noseOffsetX, noseY, rz * 1.22);
const noseBase3D = proj(noseOffsetX, noseY + 3.6, rz * 0.96);

// LINHA 748: Sombra do lado CORRETO (distante = sinal positivo em yaw > 0)
const noseShadowOffsetX = noseBase3D.x + (yawDeg > 0 ? 2.2 : -2.2); // Era hardcoded -2.2
headSvg += el('path', {
  d: `M${pt(noseTip3D)}L${pt(noseBase3D)}L${fmt(noseShadowOffsetX)} ${fmt(noseBase3D.y - 1.2)}Z`,
  fill: skinShade, 'fill-opacity': 0.68,
});

// LINHA 753: Crista do nariz seguindo o offset
const noseMid = { x: lerp(noseBridge3D.x, noseTip3D.x, 0.52), y: lerp(noseBridge3D.y, noseTip3D.y, 0.52) };
headSvg += el('path', {
  d: `M${pt(noseMid)}L${pt(noseTip3D)}Q${fmt(noseTip3D.x + (yawDeg > 0 ? -1.0 : 1.0))} ${fmt(noseTip3D.y + 2.0)} ${pt(noseBase3D)}`,
  // ...
});
```

**Validação:** Em `yawDeg = 35°`, a ponta do nariz deve tocar visualmente a linha da bochecha distante (`farCheek`, linha 185) e a sombra deve cair **para dentro** do rosto (lado direito), não para fora.

---

## 3. Orelha Far-Side Desaparece Prematuramente (yawDeg > 14°)

### Localização Exata
**Linhas 609-611**

```typescript
const nearEarTop = drawEar(earRoot, -1);
if (yawDeg <= 14) {        // LINHA 609: LIMIAR RÍGIDO EM 14°
  drawEar(farEarRoot, 1);  // LINHA 610
}
```

### Análise do Problema

**Causa Raiz:** Hardcoded `yawDeg <= 14` para desenhar a orelha distante.

- Em 3/4 view típico (`yawDeg = 30°-45°`), a orelha distante **deveria ser visível** (parcialmente, atrás da mandíbula)
- O limite de 14° é excessivamente conservador — parece ter sido calibrado para perfil extremo
- A orelha próxima (`nearEarTop`) é desenhada **sempre** (linha 608), criando assimetria

**Proporção Relacionada:** A orelha é desenhada entre `eyeY + 7` e `eyeY + 17.5` (~17px altura, linhas 564-566). Em 3/4, a orelha distante deveria ser **reduzida em escala** (foreshortening) e **deslocada para trás**, não simplesmente omitida.

### Correção Precisa

```typescript
// LINHAS 608-611: SUBSTITUIR POR
const nearEarTop = drawEar(earRoot, -1);

// Far ear: sempre desenhar em 3/4, com escala reduzida e offset Z
if (yawDeg < 68) {  // Era 14 — agora até quase perfil
  // Aplicar foreshortening: escala 0.6-0.8 em 3/4, 0 em perfil
  const farEarScale = clamp(lerp(1.0, 0.0, (yawDeg - 14) / 54), 0, 1); // 14°→1.0, 68°→0
  if (farEarScale > 0.1) {
    drawEarScaled(farEarRoot, 1, farEarScale, yawDeg);
  }
}

// NOVA FUNÇÃO: drawEarScaled (baseada em drawEar mas com scale e z-offset)
const drawEarScaled = (root: ProjPt, side: -1 | 1, scale: number, yawDeg: number) => {
  // Offset Z adicional para empurrar orelha para trás do crânio
  const zOffset = -rz * 0.12 * (1 - scale);
  const scaledRoot = { ...root, z: root.z + zOffset, s: FOCAL / (FOCAL - (root.z + zOffset)) };
  scaledRoot.x = HEAD_CX + (root.x - HEAD_CX) * scale; // Aproximar do centro
  scaledRoot.y = HEAD_CY + (root.y - HEAD_CY) * scale;
  
  // Reusar lógica de drawEar com scaledRoot...
  // (simplificado: chamar drawEar com root modificada)
  return drawEar(scaledRoot, side);
};
```

**Alternativa Simples (Fix Imediato):**
```typescript
// LINHA 609: Aumentar limite de 14 para 55
if (yawDeg <= 55) {  // Era 14
  drawEar(farEarRoot, 1);
}
```

---

## 4. Proporção Orelha / Sobrancelha em 3/4 View

### Localização Exata
**Orelha:** Linhas 563-575 (função `drawEar`)  
**Sobrancelha:** Linhas 722-731

```typescript
// ORELHA (linhas 564-566): Pontos fixos em espaço projetado
const earTop = { x: root.x + side * 1.5, y: root.y - 7.5 };
const earOuter = { x: root.x + side * 8.5, y: root.y + 0.5 };
const earLobe = { x: root.x + side * 1.5, y: root.y + 10.5 };
// Altura total = 18px (de -7.5 a +10.5)

// SOBRANCELHA (linhas 723-725): Pontos em espaço 3D projetado
const bOuter = surf(ec.thOuter, browY + 0.6 + spec.browOuterY * 0.35, 1.0);
const bMid = surf(ec.thCenter, browY - 1.8, 1.01);
const bInner = surf(ec.thInner, browY + 0.4 + spec.browInnerY * 0.45, 1.0);
// browY = -ry * 0.11 (linha 167) ≈ -4.1 (slender) / -4.3 (athletic)
// earRoot.y = proj(..., eyeY + 7, ...).y — eyeY = ry * 0.16 ≈ 5.9/6.2
// → orelha y ≈ eyeY + 7 projetado ≈ 12-13px abaixo do centro
// → sobrancelha y ≈ -4 projetado ≈ -4 a -6px acima do centro
// DISTÂNCIA VERTICAL: ~16-19px (CORRETO anatomicamente)
```

### Análise do Problema

**O problema NÃO é a distância vertical absoluta**, mas a **escala relativa em 3/4 view**:

1. **Orelha** usa coordenadas 2D fixas (`side * 1.5`, `side * 8.5`) — **não escala com perspectiva**
2. **Sobrancelha** usa `surf()` com `rScale=1.0/1.01` — **escala corretamente com perspectiva 3D**
3. Em 3/4 view (`yawDeg = 35°`), a orelha distante (se desenhada) pareceria **grande demais** comparada à sobrancelha
4. A orelha próxima também não sofre foreshortening vertical adequado

**Evidência:** `earOuter.x = root.x + side * 8.5` — largura fixa de ~8.5px independentemente do `yawDeg`. Deveria encolher conforme o crânio rotaciona.

### Correção Precisa

**Modificar `drawEar` para aceitar escala de perspectiva:**

```typescript
// LINHA 563: Adicionar parâmetro perspectiveScale
const drawEar = (root: ProjPt, side: -1 | 1, perspectiveScale = 1.0) => {
  const earTop = { x: root.x + side * 1.5 * perspectiveScale, y: root.y - 7.5 * perspectiveScale };
  const earOuter = { x: root.x + side * 8.5 * perspectiveScale, y: root.y + 0.5 * perspectiveScale };
  const earLobe = { x: root.x + side * 1.5 * perspectiveScale, y: root.y + 10.5 * perspectiveScale };
  const earInnerBot = { x: root.x - side * 3.0 * perspectiveScale, y: root.y + 7.0 * perspectiveScale };
  // ... resto igual
};

// LINHA 608: Calcular escala para orelha próxima baseada no yaw
const nearEarPerspective = clamp(lerp(1.0, 0.85, yawT), 0.7, 1.0); // Leve encolhimento em 3/4
const nearEarTop = drawEar(earRoot, -1, nearEarPerspective);

// LINHA 610: Far ear com escala forte
if (yawDeg <= 55) {
  const farEarPerspective = clamp(lerp(0.85, 0.4, yawT), 0.3, 0.9);
  drawEar(farEarRoot, 1, farEarPerspective);
}
```

**Validação:** Em `yawDeg = 35°`, medir bounding box da orelha próxima vs sobrancelha próxima — razão largura/altura deve ser consistente com referência anatômica (orelha ~60-70% da largura da sobrancelha).

---

## 5. Correções Integradas — Patch Consolidado

### Arquivo: `src/templates/head-3d.ts`

```diff
@@ -202,8 +202,12 @@
   // Profile nose/lips silhouette points (smoothly emerge as yaw → 90°)
   const noseBridge3D = proj(0, eyeY + 1.5, rz * 0.97);
   const noseTip3D = proj(0, noseY, rz * 1.22);
   const noseBase3D = proj(0, noseY + 3.6, rz * 0.96);
+  // FIX: Offset nasal para lado distante em 3/4
+  const noseOffsetX = lerp(0, rx * 0.18, yawT);
+  const noseBridge3D = proj(noseOffsetX, eyeY + 1.5, rz * 0.97);
+  const noseTip3D = proj(noseOffsetX, noseY, rz * 1.22);
+  const noseBase3D = proj(noseOffsetX, noseY + 3.6, rz * 0.96);
 
@@ -637,10 +641,14 @@
     // Pull far eye slightly inward (thOuter = 30°) so it ALWAYS has clean margin before far cheek border!
     const eyeConfigs: Array<{ thOuter: number; thCenter: number; thInner: number; isNear: boolean }> = [
       { thOuter: -34, thCenter: -21, thInner: -9, isNear: true },
     ];
     if (yawDeg < 68) {
-      eyeConfigs.push({ thOuter: 30, thCenter: 20, thInner: 10, isNear: false });
+      // FIX: Simetria + vergência — mesmo thCenter, thOuter/thInner simétricos
+      eyeConfigs.push({ thOuter: 34, thCenter: 21, thInner: 9, isNear: false });
     }
 
@@ -674,7 +682,7 @@
         const irisRx = Math.min(eyeW * 0.34, (maxIrisRy * 0.94 + 0.35) * perspRatio) * spec.irisScale;
         const irisCy = Math.min((yTop + yBot) * 0.5 - 0.08, yBot - maxIrisRy - 0.2);
-        const irisCx = pMid.x + (ec.isNear ? lerp(0, 1.0, yawT) : lerp(0, 0.4, yawT));
+        // FIX: Mesmo fator de deslocamento para vergência natural
+        const irisCx = pMid.x + lerp(0, 0.7, yawT);
 
@@ -606,12 +618,22 @@
     return earTop;
   };
 
+  // FIX: drawEar com escala de perspectiva
+  const drawEarScaled = (root: ProjPt, side: -1 | 1, scale: number) => {
+    const earTop = { x: root.x + side * 1.5 * scale, y: root.y - 7.5 * scale };
+    const earOuter = { x: root.x + side * 8.5 * scale, y: root.y + 0.5 * scale };
+    const earLobe = { x: root.x + side * 1.5 * scale, y: root.y + 10.5 * scale };
+    const earInnerBot = { x: root.x - side * 3.0 * scale, y: root.y + 7.0 * scale };
+    // ... copiar corpo de drawEar usando earTop/earOuter/earLobe/earInnerBot escalados
+    // (omissis por brevidade — replicar linhas 568-605 com variáveis escaladas)
+    return earTop;
+  };
+
   const nearEarTop = drawEar(earRoot, -1);
-  if (yawDeg <= 14) {
+  // FIX: Limite estendido + escala de perspectiva
+  const nearEarScale = clamp(lerp(1.0, 0.85, yawT), 0.7, 1.0);
+  const nearEarTop = drawEarScaled(earRoot, -1, nearEarScale);
+  if (yawDeg <= 55) {
+    const farEarScale = clamp(lerp(0.85, 0.4, yawT), 0.3, 0.9);
+    drawEarScaled(farEarRoot, 1, farEarScale);
+  }
 
@@ -745,11 +767,15 @@
         // Small crisp Manhwa 3/4 nose ridge & underside shadow
         const noseMid = { x: lerp(noseBridge3D.x, noseTip3D.x, 0.52), y: lerp(noseBridge3D.y, noseTip3D.y, 0.52) };
-        headSvg += el('path', {
-          d: `M${pt(noseTip3D)}L${pt(noseBase3D)}L${fmt(noseBase3D.x - 2.2)} ${fmt(noseBase3D.y - 1.2)}Z`,
+        // FIX: Sombra do lado correto (distante = +x em yaw > 0)
+        const noseShadowOffsetX = noseBase3D.x + (yawDeg > 0 ? 2.2 : -2.2);
+        headSvg += el('path', {
+          d: `M${pt(noseTip3D)}L${pt(noseBase3D)}L${fmt(noseShadowOffsetX)} ${fmt(noseBase3D.y - 1.2)}Z`,
           fill: skinShade,
           'fill-opacity': 0.68,
         });
-        headSvg += el('path', {
-          d: `M${pt(noseMid)}L${pt(noseTip3D)}Q${fmt(noseTip3D.x - 1.0)} ${fmt(noseTip3D.y + 2.0)} ${pt(noseBase3D)}`,
+        headSvg += el('path', {
+          // FIX: Curva da crista acompanha offset nasal
+          d: `M${pt(noseMid)}L${pt(noseTip3D)}Q${fmt(noseTip3D.x + (yawDeg > 0 ? -1.0 : 1.0))} ${fmt(noseTip3D.y + 2.0)} ${pt(noseBase3D)}`,
           fill: 'none',
           stroke: skinDeep,
           'stroke-width': lw * 0.58 + 0.2,
```

---

## 6. Checklist de Validação Pós-Correção

| Teste | Comando | Critério de Aceite |
|-------|---------|-------------------|
| **Head-sheet 3/4** | `npx tooncraft head-sheet --preset lloyd --yaw 35 --out /tmp/test` | Olhos convergem (vergência), nariz integrado à bochecha, orelha far-side visível |
| **Determinismo** | Render 2x mesmo seed → `diff` SVGs | Idênticos byte-a-byte |
| **Anatomia** | `debugGuides: true` | Linha central curva passa pelo nariz, orelha entre eye-line e nose-tip |
| **Perfil 90°** | `--yaw 90` | Orelha far-side oculta, nariz em silhueta, olho far-side oculto |
| **Frontal 0°** | `--yaw 0` | Simetria perfeita, orelhas iguais, nariz central |

---

## 7. Referências Cruzadas

- **anime-features.ts** — Sistema 2D paralelo (linhas 418, 442, 458-468 duplicam lógica de cabelo/orelha)
- **silhouettes.ts** — Integração `renderParametricHead3D` (linha 110 deste arquivo) via `head-3d.ts`
- **manhwa-hair.ts** — `renderManhwaHair3D` usa `earTop` (linha 439) — afetado por mudança de escala da orelha

---

**Nota:** Nenhum código foi alterado durante esta análise. Este relatório documenta os achados e correções precisas para aplicação posterior.