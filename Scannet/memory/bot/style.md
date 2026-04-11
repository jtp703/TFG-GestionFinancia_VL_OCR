# Estilo y convenciones — Scannet

## Reglas de desarrollo [siempre vigentes]

- Stack definitivo: no proponer migraciones ni tecnologías alternativas
- Confirmar antes de instalar dependencias nuevas
- Comentar métodos con funcionalidad de forma breve
- Todo secret en variables de entorno, nunca en código fuente
- scan.ts solo OCR, categorize.ts solo categorización — nunca mezclar
- Frontend nunca llama directamente a APIs externas

## Sistema de diseño

**Fuente:** Inter 400/500 únicamente (Google Fonts, sin 600/700/italic)

```
H1: 28px/500   H2: 20px/500   Body: 15px/400   Caption: 12px/400   Dato XL: 36px/500
```

**Tokens de color:**
```
--bg:        #F7F5F0 (claro)  /  #1A1F2E (oscuro)
--surface:   #FFFFFF (claro)  /  #252B3B (oscuro)
--color-brand: #0E6B55  (brand-dark: #0A4F3E, brand-light: #E6F5F1)
--text-primary: #111111 / #F0F0F0
--text-muted:   #6B7280 / #9CA3AF
--border:    rgba(0,0,0,0.08) / rgba(255,255,255,0.08)
```

**Colores categorías (pastel claro / eléctrico oscuro):**
```
Alimentación: #F4A261 / #FF6B2B   Transporte: #81B1D4 / #00AAFF
Ocio:         #A8D5A2 / #00E676   Hogar:      #C9A8D4 / #E040FB
Salud:        #F2A0AC / #FF4081   Otros:      #B5C4B1 / #69F0AE
```

**Componentes:**
- Card: `background: --surface; border: 0.5px solid --border; border-radius: 12px; padding: 1rem 1.25rem`
- CTA: `background: --color-brand; color: #FFF; border-radius: 10px; padding: 10px 20px; font: 15px/500`
- Ghost: `background: transparent; border: 0.5px solid --border; color: --text-muted; border-radius: 10px`
- Input: `background: --surface; border: 0.5px solid --border; border-radius: 8px; focus: border-color --color-brand`

**Animaciones:** 200ms ease-out para tema, drill-down, slides. 150ms para fades y nav activo.
Prohibido: bounce, spring, blur, glassmorphism, sombras animadas, box-shadow (salvo focus rings).
NO usar gradientes. NO más de dos pesos tipográficos.

## Fuera de scope v1.0 — NO implementar

Historial meses anteriores · Edición/eliminación tickets guardados · Metas de ahorro
Notificaciones · Categorías personalizables · RGPD · Multi-idioma · Paginación/infinite scroll
Selector de tipo de gráfico · Reconocimiento offline
