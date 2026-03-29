/** Paleta pastel — tema claro */
const PASTEL: Record<string, string> = {
  'Alimentación': '#6EBF9E',
  'Transporte':   '#7EB8F7',
  'Ocio':         '#F9C784',
  'Hogar':        '#B89EF0',
  'Salud':        '#F4A0C0',
  'Otros':        '#B0B8C1',
  'Sin categoría':'#D1D5DB',
}

/** Paleta eléctrica — tema oscuro */
const ELECTRIC: Record<string, string> = {
  'Alimentación': '#00FFB2',
  'Transporte':   '#38BEFF',
  'Ocio':         '#FFD600',
  'Hogar':        '#A855F7',
  'Salud':        '#FF4DA6',
  'Otros':        '#94A3B8',
  'Sin categoría':'#475569',
}

/** Devuelve el color de una categoría según el tema activo */
export function getCategoryColor(nombre: string, isDark: boolean): string {
  const palette = isDark ? ELECTRIC : PASTEL
  return palette[nombre] ?? (isDark ? '#94A3B8' : '#B0B8C1')
}
