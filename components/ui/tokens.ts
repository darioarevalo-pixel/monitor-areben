/**
 * tokens.ts — Fundación del design-system del monitor (SaaS moderno, escalable).
 *
 * Fuente ÚNICA de verdad de color/espaciado/tipografía. Regla del kit:
 *  - NINGÚN componente ni sección nueva usa hex crudos: todo pasa por acá.
 *  - Los componentes se parametrizan con `variant` (forma) + `tone` (color semántico) + `size` (densidad).
 *  - Todo componente acepta `style` para override puntual (adopción sin fricción).
 *  - Un estado de negocio (ej. estado de un cambio) se mapea a un `Tone` en su feature (`lib/*`),
 *    y el `Tone` resuelve a un trío {fg,bg,border} coherente acá.
 *
 * Convivencia con globals.css: el kit usa objetos `React.CSSProperties` inline (vencen por especificidad
 * al scoping por elemento del CSS legacy bajo `.shell-content`). NO se agregan clases CSS globales.
 */

export const color = {
  // Texto
  ink: '#111827', // principal
  ink2: '#374151', // medio-fuerte (labels)
  mut: '#6B7280', // secundario
  mut2: '#9CA3AF', // terciario / placeholders

  // Superficies y bordes
  surface: '#FFFFFF',
  bg: '#F9FAFB',
  bg2: '#F3F4F6',
  line: '#E5E7EB', // borde estándar de cards/tablas
  line2: '#D1D5DB', // borde de inputs

  // Marca — ÁMBAR (acento del shell, refinado)
  brand: '#B45309',
  brandBorder: '#D97706',
  brandBg: '#FFFBEB',
  brandBg2: '#FDE68A',
  brandRing: '#FEF3C7', // ring de foco accesible

  // Acción — azul
  action: '#1D4ED8',
  actionAlt: '#378ADD',
  actionBg: '#EFF6FF',

  // Semánticos
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerInk: '#991B1B',
  success: '#15803D',
  successBg: '#ECFDF5',
  successBorder: '#A7F3D0',
  successInk: '#065F46',
  warning: '#B45309',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
} as const

export const radius = { sm: 6, md: 8, lg: 10, xl: 12, '2xl': 14, pill: 999 } as const

// Escala de espaciado (px). Claves numéricas = múltiplos de 4 (0.5 = 2px).
export const space = { 0.5: 2, 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const

export const font = { xs: 11, sm: 12, base: 13, md: 14, lg: 15, xl: 18, '2xl': 22, '3xl': 26 } as const

export const weight = { normal: 400, medium: 500, semibold: 600, bold: 700, heavy: 800 } as const

export const shadow = {
  sm: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.05)', // reposo (layered, sutil)
  md: '0 2px 4px rgba(16,24,40,.04), 0 6px 16px rgba(16,24,40,.08)', // hover / elevación media
  pop: '0 10px 28px rgba(16,24,40,.14)', // dropdowns / paneles flotantes
  modal: '0 12px 40px rgba(16,24,40,.18)',
} as const

/** Sombra de foco accesible (ring ámbar). Se aplica en :focus-visible de controles interactivos. */
export const focusRing = `0 0 0 3px ${color.brandRing}`

/** Fuente tabular para columnas de números (alinea decimales — detalle "SaaS"). */
export const tabularNums = "'DM Sans', system-ui, sans-serif"

export type Tone = 'neutral' | 'brand' | 'action' | 'success' | 'warning' | 'danger'

/** Un Tone → trío coherente {fg, bg, border}. Lo consumen Badge, StatusPill, Notice, KpiCard, botones soft. */
export const toneTokens: Record<Tone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: color.ink2, bg: color.bg2, border: color.line },
  brand: { fg: color.brand, bg: color.brandBg, border: color.brandBorder },
  action: { fg: color.action, bg: color.actionBg, border: '#BFDBFE' },
  success: { fg: color.successInk, bg: color.successBg, border: color.successBorder },
  warning: { fg: color.warning, bg: color.warningBg, border: color.warningBorder },
  danger: { fg: color.dangerInk, bg: color.dangerBg, border: color.dangerBorder },
}

/** Color "sólido" por tono (para botones variant=solid y acentos fuertes). */
export const toneSolid: Record<Tone, string> = {
  neutral: color.ink,
  brand: color.brand,
  action: color.action,
  success: color.success,
  warning: color.brandBorder,
  danger: color.danger,
}
