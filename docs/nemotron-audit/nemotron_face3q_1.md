# Análise Técnica: Defeitos Geométricos no Rig 3D de Cabeça (head-3d.ts)

**Arquivo analisado:** `src/templates/head-3d.ts`  
**Funções alvo:** `makeProjector` (L80-96), `surf()` (L157-162), `faceD` (L216-255), `variableStrokeFromSegments` contorno facial (L480-534)  
**Problemas:** (1) Quinas secas na bochecha direita (lado far) em ângulos 3/4; (2) Risco preto horizontal/diagonal cruzando cabelo/mandíbula esquerda.

---

## 1. `makeProjector` (L80-96) — Projeção Perspectiva

```typescript
function makeProjector(yawDeg: number, pitchDeg: number) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  return (x: number, y: number, z: number): ProjPt => {
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const y2 = y * cosP - z1 * sinP;
    const z2 = y * sinP + z1 * cosP;
    const s = FOCAL / (FOCAL - z2);
    return { x: HEAD_CX + x1 * s, y: HEAD_CY + y2 * s, z: z2, s };
  };
}
```

**Avaliação:** Matematicamente correto. Ordem de rotação: **Yaw (Y) → Pitch (X)** → divisão perspectiva `s = FOCAL/(FOCAL - z2)`. `FOCAL = 340` (L78), `HEAD_CY = -542` (L77). Não há erro aqui que cause os defeitos relatados.

---

## 2. `surf()` (L157-162) — Parameterização do Elipsoide Craniano

```typescript
const surf = (thetaDeg: number, y: number, rScale = 1.0): ProjPt => {
  const th = (thetaDeg * Math.PI) / 180;
  const yNorm = clamp(y / ry, -0.96, 0.96);
  const ring = Math.sqrt(Math.max(0.08, 1 - yNorm * yNorm * 0.72));
  return proj(Math.sin(th) * rx * ring * rScale, y, Math.cos(th) * rz * ring * rScale);
};
```

### Problema Crítico: Fator `0.72` na Linha 160

```typescript
const ring = Math.sqrt(Math.max(0.08, 1 - yNorm * yNorm * 0.72));
```

Este fator **achata o elipsoide nos polos** (topo/base do crânio) mas cria **curvatura não-uniforme ao longo de Y**.

- Em `y = 0` (equador): `yNorm = 0` → `ring = 1.0` (raio total `rx`, `rz`)
- Em `y = ±ry` (polos): `yNorm = ±1` → `ring = √(1 - 0.72) = √0.28 ≈ 0.53` (raio reduzido a 53%)
- Em `y = cheekY = ry * 0.42` (L169): `yNorm = 0.42` → `ring = √(1 - 0.42² × 0.72) = √(1 - 0.127) = √0.873 ≈ 0.934`
- Em `y = mouthY = ry * 0.74` (L171): `yNorm = 0.74` → `ring = √(1 - 0.74² × 0.72) = √(1 - 0.394) = √0.606 ≈ 0.778`

**Consequência:** A seção horizontal do crânio encolhe **não-linearmente** com Y. Pontos na mesma longitude (`thetaDeg`) mas Ys diferentes **não estão alinhados radialmente** no espaço 3D — a "vertical" do elipsoide curva-se para dentro. Isso quebra a continuidade tangencial quando curvas 2D projetadas conectam pontos de Ys diferentes (ex: `farOrbit` em `eyeY+3` → `farCheek` em `cheekY` → `farLowerCheek` em `mouthY-2`).

---

## 3. `faceD` — Contorno da Silhueta 3/4 (L244-255)

```typescript
} else {
  // Smooth 15°..65° three-quarter silhouette
  faceD =
    `M${pt(skullTop)}` +
    `C${pt(proj(rx * 0.56, topY + 2, rz * 0.28))} ${pt(farTemple)} ${pt(farBrow)}` +
    `Q${pt(farOrbit)} ${pt(farCheek)}` +
    `C${pt(farLowerCheek)} ${pt(proj(rx * 0.34, chinY - 4.5, rz * 0.52))} ${pt(chinRight)}` +
    `Q${pt(chinPt)} ${pt(chinLeft)}` +
    `C${pt(nearJawLower)} ${pt(nearJawAngle)} ${pt(nearUpperJaw)}` +
    `Q${fmt(earRoot.x - 1)} ${fmt((nearUpperJaw.y + earRoot.y) * 0.5)} ${pt(earRoot)}` +
    `C${pt(backCranium)} ${pt(backTop)} ${pt(skullTop)}Z`;
}
```

### 3.1 Causa Raiz da "Quina Seca" na Bochecha Direita (L249-250)

**Junção Q → C no ponto `farCheek`:**

```
Segmento A (Quadrática): Q(farOrbit → farCheek)
Segmento B (Cúbica):     C(farLowerCheek → proj(...) → chinRight)  [inicia em farCheek]
```

Para continuidade **C¹ (tangente)** na junção, a derivada da quadrática em t=1 deve igualar a derivada da cúbica em t=0:

```
Quadrática Q(P0, P1, P2) onde P0=farBrow, P1=farOrbit, P2=farCheek:
  Q'(1) = 2 × (P2 - P1) = 2 × (farCheek - farOrbit)

Cúbica C(P0, P1, P2, P3) onde P0=farCheek, P1=farLowerCheek, P2=proj(...), P3=chinRight:
  C'(0) = 3 × (P1 - P0) = 3 × (farLowerCheek - farCheek)
```

**Condição de continuidade C¹:**
```
2 × (farCheek - farOrbit) = 3 × (farLowerCheek - farCheek)
⇔ farLowerCheek = farCheek + ⅔ × (farCheek - farOrbit)
```

**Realidade no código (L182-186):**
```typescript
const orbitIndent = lerp(1.0, 0.87, Math.sin(yawRad * 2));     // L182
const cheekPush   = lerp(0.99, 1.03, Math.sin(yawRad * 1.8));   // L183
const farOrbit    = surf(farAz - 7,  eyeY + 3, orbitIndent);    // L184
const farCheek    = surf(farAz - 5,  cheekY, cheekPush);        // L185
const farLowerCheek = surf(farAz - 15, mouthY - 2, 0.87);       // L186
```

Os três pontos são **calculados independentemente** com:
- Azimuths diferentes: `-7°`, `-5°`, `-15°` (diferença de 8° e 10°)
- Ys diferentes: `eyeY+3`, `cheekY`, `mouthY-2`
- Escalas radiais diferentes: `orbitIndent`, `cheekPush`, `0.87` fixo

**Não há garantia matemática de tangência.** A condição C¹ é violada sistematicamente → **cúspide (cusp) ou quina aguda** em `farCheek`.

### 3.2 Agravante: Parameterização `surf()` Não-Raial

Como mostrado na Seção 2, `surf(theta, y, scale)` **não preserva alinhamento radial** entre Ys diferentes devido ao fator `0.72`. Mesmo se azimuths fossem iguais, `farOrbit`, `farCheek`, `farLowerCheek` **não estariam colineares com o centro do elipsoide** → tangentes naturais não se alinham.

---

## 4. `variableStrokeFromSegments` — Contorno Variável (L480-534)

```typescript
if (yawDeg > 4 && yawDeg < 58) {
  headSvg += variableStrokeFromSegments(
    [
      { p0: farTemple,  p1: farBrow,       p2: farCheek,      wStart: lw*0.40, wMid: lw*0.65, wEnd: lw*0.78 },   // Seg 0
      { p0: farCheek,   p1: farLowerCheek, p2: chinRight,     wStart: lw*0.78, wMid: lw*0.92, wEnd: lw*1.05 },   // Seg 1
      { p0: chinRight,  p1: chinPt,        p2: chinLeft,      wStart: lw*1.05, wMid: lw*1.20, wEnd: lw*1.25 },   // Seg 2
      { p0: chinLeft,   p1: nearJawLower,  p2: nearJawAngle,  wStart: lw*1.25, wMid: lw*1.35, wEnd: lw*1.15 },   // Seg 3
      { p0: nearJawAngle, p1: nearUpperJaw, p2: earRoot,      wStart: lw*1.15, wMid: lw*0.85, wEnd: lw*0.45 },   // Seg 4
    ],
    skinInk,
  );
}
```

### 4.1 Causa do Risco Preto Horizontal/Diagonal na Mandíbula Esquerda

**Junção Segmento 3 → Segmento 4 no ponto `nearJawAngle`:**

- Seg 3 termina em `nearJawAngle` com largura `wEnd = lw * 1.15`
- Seg 4 inicia em `nearJawAngle` com largura `wStart = lw * 1.15`

**Larguras coincidem**, mas **`variableStrokeFromSegments` (em `manhwa-ink.js`) gera polígonos independentes por segmento** e **não garante junção C¹ entre segmentos adjacentes**.

O algoritmo típico de "variable stroke" (ribbon com largura variável) constrói:
1. Curva central (Bézier quadrática `p0-p1-p2`)
2. Offset perpendicular em cada ponto → bordas esquerda/direita
3. Triangulação → polígono preenchido

**Problema:** Na junção `nearJawAngle`, o **vetor normal (perpendicular à tangente) muda abruptamente** porque:
- Tangente final do Seg 3 ≈ direção `nearJawLower → nearJawAngle`
- Tangente inicial do Seg 4 ≈ direção `nearJawAngle → nearUpperJaw`

Estas direções formam um **ângulo interno agudo** na mandíbula (transição jaw angle → upper jaw). O offset perpendicular **roda bruscamente**, criando um **triângulo de sobreposição (overlap wedge)** ou **falha (gap wedge)** na borda do ribbon.

**Resultado visual:** Um **risco preto diagonal/horizontal** (a borda do wedge) cruzando a região da mandíbula esquerda, frequentemente invadindo o cabelo (que é desenhado depois, por cima, mas o stroke é opaco).

**Evidência no código:** O Segmento 3 usa `nearJawLower` (L195: `proj(-rx * 0.46, chinY - 6.5, rz * 0.28)`) como controle e `nearJawAngle` (L196: `proj(-rx * 0.78, mouthY + 2.5, -rz * 0.04)`) como fim. O Segmento 4 usa `nearJawAngle` como início e `nearUpperJaw` (L197: `proj(-rx * 0.91, cheekY + 3, -rz * 0.12)`) como controle. A mudança de direção é brusca: de **baixo-para-cima diagonal** (jaw angle) para **quase vertical** (upper jaw).

---

## 5. Correções Matemáticas Exatas

### 5.1 Correção da Quina Seca (Bochecha Direita) — `faceD` L249-250

**Opção A: Impor Continuidade C¹ Computando `farLowerCheek` Derivado**

Substituir L186 por:
```typescript
// Derivado para C¹: farLowerCheek = farCheek + ⅔ × (farCheek - farOrbit)
const farLowerCheek = {
  x: farCheek.x + 0.6667 * (farCheek.x - farOrbit.x),
  y: farCheek.y + 0.6667 * (farCheek.y - farOrbit.y),
  z: farCheek.z + 0.6667 * (farCheek.z - farOrbit.z),
  s: farCheek.s // aproximação; reprojetar se necessário
};
```
E remover `surf(farAz - 15, mouthY - 2, 0.87)` fixo.

**Opção B (Mais Robusta): Substituir Q+C por Cubica Única com Controles Simétricos**

```typescript
// Substituir L249-250:
`Q${pt(farOrbit)} ${pt(farCheek)}` +
`C${pt(farLowerCheek)} ${pt(proj(rx * 0.34, chinY - 4.5, rz * 0.52))} ${pt(chinRight)}`

// Por uma única cúbica com controles calculados para C¹ implícita:
const cheekCtrl1 = { x: farOrbit.x, y: farOrbit.y };          // P1 = farOrbit
const cheekCtrl2 = { x: farLowerCheek.x, y: farLowerCheek.y }; // P2 = farLowerCheek (recomputado)
`C${pt(cheekCtrl1)} ${pt(cheekCtrl2)} ${pt(chinRight)}`
```
Onde `farLowerCheek` é reposicionado para ficar na continuação da tangente.

**Opção C (Recomendada): Spline Catmull-Rom ou Cubica Monotônica por Pontos-Chave**

Definir array de pontos-chave `[farBrow, farOrbit, farCheek, farLowerCheek, chinRight]` e gerar spline C¹ contínua (ex: `spline(points, tension=0.5)`). Elimina junções manuais.

---

### 5.2 Correção do Risco Preto (Mandíbula Esquerda) — `variableStrokeFromSegments` L507-522

**Causa:** Mudança brusca de tangente em `nearJawAngle` entre Seg 3 e Seg 4.

**Correção no `faceD` (Geometria Base):** Suavizar a transição `nearJawAngle → nearUpperJaw`.

Em L196-197:
```typescript
const nearJawAngle = proj(-rx * 0.78, mouthY + 2.5, -rz * 0.04);
const nearUpperJaw = proj(-rx * 0.91, cheekY + 3, -rz * 0.12);
```

O vetor `nearJawAngle → nearUpperJaw` aponta **muito para cima e pouco para trás**. O vetor `nearJawLower → nearJawAngle` aponta **diagonal cima-esquerda**. Ângulo entre eles ≈ 60-80°.

**Fix:** Inserir ponto intermediário ou mover `nearUpperJaw` para alinhar tangentes.

```typescript
// Novo ponto de controle suave entre jawAngle e upperJaw
const nearJawBlend = {
  x: nearJawAngle.x * 0.5 + nearUpperJaw.x * 0.5,
  y: nearJawAngle.y * 0.5 + nearUpperJaw.y * 0.5,
  z: nearJawAngle.z * 0.5 + nearUpperJaw.z * 0.5,
};
```

E no `faceD` (L252-253), substituir:
```typescript
`C${pt(nearJawLower)} ${pt(nearJawAngle)} ${pt(nearUpperJaw)}`
```
Por:
```typescript
`C${pt(nearJawLower)} ${pt(nearJawAngle)} ${pt(nearJawBlend)}` +
`C${pt(nearJawBlend)} ${pt(nearUpperJaw)} ${pt(earRoot)}`
```
(Garante C¹ em `nearJawBlend` e `nearUpperJaw`)

**Correção no Stroke (L507-522):** Adicionar segmento intermediário ou fundir Seg 3+4.

```typescript
// Fundir em segmento único com 4 pontos (cúbica) ou usar spline
{
  p0: chinLeft,
  p1: nearJawLower,
  p2: nearJawAngle,
  p3: nearUpperJaw,  // Precisa de cubicTo no variableStroke
  wStart: lw * 1.25,
  wMid1: lw * 1.35,
  wMid2: lw * 1.15,
  wEnd: lw * 0.85,
}
```
*Requer suporte a 4 pontos em `variableStrokeFromSegments`.*

**Fix Mínimo (Sem Mudar `manhwa-ink.js`):** Garantir que `nearJawAngle` e `nearUpperJaw` gerem tangentes alinhadas.

```typescript
// L196-197: Ajustar nearUpperJaw para estar na continuação da tangente de nearJawLower→nearJawAngle
const jawDir = { x: nearJawAngle.x - nearJawLower.x, y: nearJawAngle.y - nearJawLower.y };
const jawLen = Math.hypot(jawDir.x, jawDir.y);
const nearUpperJaw = {
  x: nearJawAngle.x + (jawDir.x / jawLen) * 18,  // 18px adiante na mesma direção
  y: nearJawAngle.y + (jawDir.y / jawLen) * 18,
  z: nearJawAngle.z // manter Z aproximado
};
```

---

### 5.3 Correção Estrutural: Fator `0.72` em `surf()` (L160)

**Problema Raiz:** Parameterização elipsoidal não-ortogonal prejudica **todas** curvas que conectam Ys diferentes.

**Solução Definitiva:** Usar **elipsoide verdadeiro** (`ring = √(1 - yNorm²)`) ou **esfera** (`ring = 1`).

```typescript
// L160 - SUBSTITUIR:
const ring = Math.sqrt(Math.max(0.08, 1 - yNorm * yNorm * 0.72));
// POR (elipsoide padrão):
const ring = Math.sqrt(Math.max(0.08, 1 - yNorm * yNorm));
// OU (esfera - mais simples, curvatura uniforme):
const ring = 1.0;
```

**Impacto:** Requer recalibrar `rx`, `ry`, `rz` e todos `yNorm` landmarks (L165-172) para manter proporções visuais. Mas **elimina a causa sistêmica** de desalinhamento tangencial em todas as curvas faciais.

---

## 6. Resumo de Linhas Exatas para Correção

| Problema | Linhas Afetadas | Correção Prioritária |
|----------|-----------------|----------------------|
| **Quina seca bochecha direita** | L182-186 (cálculo pontos), L249-250 (faceD Q+C) | Impor C¹ via `farLowerCheek` derivado OU spline única |
| **Risco preto mandíbula esquerda** | L195-197 (nearJawAngle/UpperJaw), L252-253 (faceD), L507-522 (stroke segments) | Alinhar tangentes `nearJawLower→nearJawAngle→nearUpperJaw` + fundir stroke segments 3+4 |
| **Causa sistêmica (todas curvas Y-variável)** | L160 (`surf` ring factor 0.72) | Mudar para `ring = √(1-yNorm²)` ou `1.0` + recalibrar landmarks |

---

## 7. Validação Sugerida

Após correções, gerar **head-sheet** (comando `tooncraft head-sheet`) para yaw 30°, 45°, 60° e inspecionar:
1. **Bochecha direita (far):** Curvatura suave contínua temple→cheek→chin, sem quina em `farCheek`
2. **Mandíbula esquerda (near):** Stroke contínuo chin→jawAngle→earRoot, sem risco diagonal cruzando cabelo
3. **Modo `silhouetteOnly=true`**: Verificar se fill path `faceD` já está suave (sem stroke artifacts)
4. **Modo `debugGuides=true`**: Confirmar que `earRoot` (marcador amarelo) alinha com transição jaw→neck

---

**Nota:** `variableStrokeFromSegments` em `manhwa-ink.js` deve ser auditado separadamente para confirmar se gera polígonos por segmento (causa do wedge) ou ribbon contínuo. Se por segmento, a correção definitiva é fundir segmentos 3+4 em um só ou implementar junção C¹ no gerador de ribbon.