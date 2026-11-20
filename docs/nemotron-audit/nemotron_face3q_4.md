# Análise: Bandana e Acessórios 2D Quebrados no Rosto 3/4 (Head3D)

**Arquivo:** `src/templates/silhouettes.ts`  
**Subagente:** 4 (Bandana, Acessórios e Overlays no Rosto 3/4)  
**Data:** 2026-11-20

---

## Resumo do Problema

Quando a pose é **`three-quarter`** e o **Head3D** está ativo (linhas 952-975), a **bandana (headband)** e outros acessórios 2D (chapéu, máscara, capuz) **flutuam desalinhados** porque:

1. São desenhados no array `upperFront` (linhas 832-894) com **coordenadas hardcoded para a cabeça 2D** (MANHWA_FACE_FRONT/FEMALE/PROFILE)
2. O Head3D substitui completamente a geometria da cabeça por uma **projeção paramétrica 3D→2D** com forma, orelhas, queixo e linha dos olhos diferentes
3. O `headTransform` (linha 1196) aplica `scale(0.78)` + translação, mas os acessórios 2D **não acompanham a nova anatomia 3D**

---

## Linhas Exatas do Problema

### 1. Ativação do Head3D (linhas 952-975)
```typescript
const head3D =
  threeQuarter && !isEntity && !away
    ? renderParametricHead3D({
        yawDeg: 34,
        pitchDeg: 4,
        // ...
        masked: outfit.mask,  // ← Único acessório passado pro Head3D
        // headband, hat, hood NÃO são passados!
      })
    : null;
```

### 2. Acessórios 2D no `upperFront` (linhas 832-894)
```typescript
// CHAPÉU (hat) - linhas 832-846
if (outfit.hat) {
  upperFront.push({ d: 'M-74 -566Q0 -590 74 -566Q60 -556 0 -566Q-60 -556 -74 -566Z', ... });
  upperFront.push({ d: 'M-40 -568C-44 -610 -30 -628 0 -630C30 -628 44 -610 40 -568Q0 -580 -40 -568Z', ... });
  upperFront.push({ d: 'M-41 -578Q0 -590 41 -578L40 -568Q0 -580 -40 -568Z', ... });
}

// CAPUZ (hood) - linhas 847-867
if (outfit.hood && !away) {
  upperFront.push({ d: 'M-36 -552L-26 -572L-14 -556L-4 -576L8 -556L20 -572L32 -552L36 -566Q0 -600 -36 -566Z', ... });
  upperFront.push({ d: 'M-62 -468C-74 -540 -48 -620 4 -624C56 -620 74 -540 62 -468L46 -470C52 -530 38 -588 0 -590C-38 -588 -52 -530 -46 -470Z', ... });
}

// BANDANA/HEADBAND - linhas 868-877
if ((outfit.headband || accessories.includes('headband')) && !away) {
  upperFront.push({ d: 'M-44 -558Q0 -572 44 -558L44 -548Q0 -562 -44 -548Z', fill: accent });  // Faixa principal
  upperFront.push({ d: 'M-42 -554C-68 -552 -92 -538 -118 -522C-96 -542 -76 -550 -60 -558C-84 -558 -104 -550 -128 -546C-100 -560 -70 -564 -42 -558Z', fill: accent });  // Pontas/esvoaçantes
}

// MÁSCARA (mask) - linhas 878-894
if (outfit.mask && !away) {
  upperFront.push({ d: profile ? 'M10 -522L50 -520L44 -500C30 -486 10 -484 -6 -492L-8 -516Z' : 'M-41 -524Q0 -516 41 -524C40 -508 30 -492 0 -484C-30 -492 -40 -508 -41 -524Z', ... });
  upperFront.push({ d: profile ? 'M12 -516L48 -516L47 -513L12 -513Z' : 'M-34 -516Q0 -510 34 -516L33 -513Q0 -507 -33 -513Z', ... });
}
```

**Todas essas paths usam coordenadas absolutas locais** (sistema: pés y=0, topo cabeça ~y=-610) **calculadas para a silhueta 2D**.

### 3. Montagem do `headContent` (linhas 1204-1221)
```typescript
const headContent = head3D
  ? head3D.neckAndCollarSvg +
    head3D.headSvg +
    faceOverlay +
    renderBase(upperFront) +           // ← PROBLEMA: renderiza acessórios 2D DENTRO do headTransform
    renderShade(upperFront.filter((p) => p.body !== false)) +
    eyesGlow +
    chinHandSvg
  : earsSvg +
    renderBase(headParts) +
    faceCelShadeSvg +
    renderShade(headParts.slice(-1)) +
    faceDetailsSvg +
    faceOverlay +
    hairFrontSvg +
    renderBase(upperFront) +           // ← Aqui funciona: acessórios 2D alinhados com cabeça 2D
    renderShade(upperFront.filter((p) => p.body !== false)) +
    eyesGlow;
```

### 4. O `headTransform` (linha 1196)
```typescript
const headTransform = `translate(0 -478) scale(0.78) translate(0 478)`;
```
Aplicado no grupo que envolve `headContent` (linha 1238-1240):
```typescript
`<g transform="${headTransform}">` +
headContent +
'</g>'
```

---

## Por Que a Bandana Flutua pela Direita no 3/4

### Geometria da Cabeça 2D vs 3D

| Aspecto | Cabeça 2D (MANHWA_FACE_FRONT) | Cabeça 3D (yaw=34°, pitch=4°) |
|---------|-------------------------------|--------------------------------|
| **Largura max** | ~120 unidades (x=-60 a +60) | Assimétrica: lado esquerdo (visível) mais largo, lado direito comprimido |
| **Orelha direita** | x ≈ +55 (perfil) / +45 (frontal) | Projetada para trás, x ≈ +20 a +30 |
| **Orelha esquerda** | x ≈ -55 / -45 | Mais visível, x ≈ -50 a -60 |
| **Queixo** | V-jaw simétrico centrado em x=0 | Deslocado para a esquerda (perspectiva) |
| **Linha dos olhos** | y ≈ -530 (horizontal) | Inclinada (pitch=4°), lado direito mais alto |
| **Testa** | y ≈ -570 a -600 | Mais recuada no lado direito |

### Coordenadas da Bandana (linhas 870, 874)
```typescript
// Faixa principal: M-44 -558 Q0 -572 44 -558
//   → Passa por x=-44, x=0, x=+44 em y≈-558 a -572
//   → Projetada para testa SIMÉTRICA centrada em x=0

// Pontas: M-42 -554 C-68 -552 -92 -538 -118 -522 ...
//   → Estende até x=-118 (esquerda) e implicitamente +118 (direita por simetria)
```

**No Head3D 3/4:**
- O lado **direito da testa é mais estreito e recuado** (perspectiva)
- A bandana 2D desenha até **x=+44/+118** mas a testa 3D mal vai até **x=+30**
- Resultado: **ponta direita da bandana flutua no ar** à direita da cabeça
- A faixa principal (y≈-558) fica **acima da linha dos olhos 3D** (que está inclinada)

---

## Todos os Acessórios/Overlays 2D Quebrados com Head3D

| Acessório | Linhas | Por Que Quebra | Head3D Tem Suporte? |
|-----------|--------|----------------|---------------------|
| **Headband/Bandana** | 868-877 | Coordenadas simétricas x=±44/±118; testa 3D é assimétrica | ❌ Não |
| **Hat (Chapéu)** | 832-846 | Copa e aba desenhadas para cabeça 2D simétrica; cabeça 3D tem topo achatado/assimétrico | ❌ Não |
| **Hood (Capuz)** | 847-867 | Contorno do capuz hardcoded para silhueta 2D; não acompanha neck/jaw 3D | ❌ Não |
| **Mask (Máscara)** | 878-894 | Tem variante `profile` mas não `threeQuarter`; máscara 3D precisa seguir mandíbula projetada | Parcial (`masked: outfit.mask` passado mas não usado para geometria 3D) |
| **FaceCelShadeSvg** | 1045-1058 | Sombreamento 2D (blush, lateral, franja) não projeta em geometria 3D | ❌ Substituído pelo shading 3D interno |
| **FaceDetailsSvg** | 1061-1079 | Olhos 6-layer 2D + sobrancelhas + boca + nariz; não alinham com órbitas 3D | ❌ Substituído por `head3D.headSvg` |
| **EarsSvg** | 1041-1044 | Orelhas 2D posicionadas para frontal/perfil; orelhas 3D estão em posições projetadas | ❌ Substituído por orelhas 3D |
| **HairBackSvg** | 983-987 | Cabelo traseiro 2D; substituído por `head3D.hairBackSvg` | ✅ Sim (head3D.hairBackSvg) |
| **HairFrontSvg** | 988-994 | Cabelo frontal 2D; substituído por vazio (head3D inclui frontal) | ✅ Sim (incluído no head3D.headSvg) |
| **NeckSvg** | 997-1001 | Pescoço 2D; substituído por `head3D.neckAndCollarSvg` | ✅ Sim |

---

## Correções Necessárias

### Correção 1: Desabilitar Acessórios 2D Quando Head3D Ativo (Mínima)

**Arquivo:** `src/templates/silhouettes.ts`  
**Linhas:** 832-894 (bloco `upperFront`)

```typescript
// ANTES (linhas 832-894): Sempre adiciona ao upperFront
if (outfit.hat) { ... }
if (outfit.hood && !away) { ... }
if ((outfit.headband || accessories.includes('headband')) && !away) { ... }
if (outfit.mask && !away) { ... }

// DEPOIS: Só adiciona se NÃO head3D
const use2DAccessories = !head3D;

if (use2DAccessories && outfit.hat) { ... }
if (use2DAccessories && outfit.hood && !away) { ... }
if (use2DAccessories && (outfit.headband || accessories.includes('headband')) && !away) { ... }
if (use2DAccessories && outfit.mask && !away) { ... }
```

**Por que funciona:** Evita renderizar geometria 2D incompatível. O Head3D deve implementar seus próprios acessórios.

---

### Correção 2: Passar Acessórios para o Head3D (Completa)

**Arquivo:** `src/templates/silhouettes.ts`  
**Linhas:** 952-975 (chamada `renderParametricHead3D`)

```typescript
const head3D =
  threeQuarter && !isEntity && !away
    ? renderParametricHead3D({
        yawDeg: 34,
        pitchDeg: 4,
        isSlender,
        palette,
        eyeStyle: character.eyeStyle ?? 'sharp-hunter',
        hairStyle,
        expression: layer.expression,
        glowEyes: layer.glowEyes,
        lightDirection: lightDir,
        shadingIntensity: shading,
        rimColor: rim,
        lw,
        ink,
        defs,
        earring: accessories.includes('earring'),
        accent,
        masked: outfit.mask,
        coatColor: outfitMain,
        debugGuides: process.env.TOONCRAFT_DEBUG_HEAD_GUIDES === '1',
        // NOVOS PARÂMETROS:
        headband: outfit.headband || accessories.includes('headband'),
        hat: outfit.hat,
        hood: outfit.hood,
      })
    : null;
```

**Requer:** Modificar `renderParametricHead3D` em `head-3d.ts` para aceitar e renderizar `headband`, `hat`, `hood` com geometria 3D projetada.

---

### Correção 3: Ajustar `headContent` Para Não Renderizar `upperFront` Duplicado (Linhas 1204-1211)

```typescript
const headContent = head3D
  ? head3D.neckAndCollarSvg +
    head3D.headSvg +
    faceOverlay +
    // renderBase(upperFront) +           // ← REMOVER: acessórios 2D não devem renderizar aqui
    // renderShade(upperFront.filter((p) => p.body !== false)) +  // ← REMOVER
    eyesGlow +
    chinHandSvg
  : // ... branch 2D inalterado
```

**Nota:** Se a Correção 1 for aplicada, `upperFront` estará vazio quando `head3D` ativo, então isso vira no-op. Mas é mais limpo remover explicitamente.

---

### Correção 4: Suporte a Máscara no Head3D (Já Parcial)

**Arquivo:** `src/templates/head-3d.ts`  
**Parâmetro:** `masked: outfit.mask` já é passado (linha 971)

**Verificar em `head-3d.ts`:** Se a máscara é realmente renderizada na geometria 3D projetada. Se não, implementar lá.

---

## Tabela de Ação Priorizada

| Prioridade | Ação | Esforço | Risco |
|------------|------|---------|-------|
| **P0** | Correção 1: Guard `!head3D` nos blocos `upperFront` (linhas 832-894) | 10 min | Baixo - só desliga 2D quebrado |
| **P0** | Correção 3: Remover `renderBase(upperFront)` do branch `head3D` (linha 1208) | 5 min | Baixo - limpeza |
| **P1** | Correção 2: Estender `renderParametricHead3D` com `headband`, `hat`, `hood` | 2-4 horas | Médio - requer trabalho em `head-3d.ts` |
| **P1** | Verificar/implementar máscara 3D em `head-3d.ts` | 1-2 horas | Médio |
| **P2** | Adicionar `scar-eye`, `faceOverlay` customizados ao Head3D | 1-2 horas | Baixo - menos usado |

---

## Código de Teste Para Validar

```json
{
  "character": {
    "id": "test-3q-bandana",
    "silhouettePreset": "martial-artist",
    "hairStyle": "spiky-manhwa",
    "eyeStyle": "sharp-hunter",
    "palette": { "skin": "#FDD6B5", "hair": "#2D1B15", "outfitPrimary": "#FFFFFF", "outfitAccent": "#EF4444", "eyes": "#3B82F6", "aura": "#F59E0B" }
  },
  "layer": {
    "type": "character_figure",
    "pose": "three-quarter",
    "framing": "bust",
    "position": { "x": 50, "y": 50 },
    "scale": 1.0,
    "flipX": false,
    "expression": "determined",
    "seed": 12345
  }
}
```

**Esperado após Correção 1:** Bandana não aparece (Head3D ativo sem suporte a bandana)  
**Esperado após Correção 2:** Bandana aparece **projetada corretamente** na testa 3D (segue assimetria yaw=34°)

---

## Conclusão

A **causa raiz** é a **duplicação de sistemas de cabeça** (Head3D vs 2D) sem coordenação de acessórios. O `upperFront` foi desenhado para a pipeline 2D pura. Quando o Head3D substitui a cabeça, os acessórios 2D órfãos ficam flutuando em coordenadas que não existem mais na geometria 3D.

**Solução mínima imediata:** Guard `!head3D` nos acessórios 2D (Correção 1 + 3).  
**Solução correta:** Migrar todos os acessórios de cabeça para o sistema Head3D paramétrico.