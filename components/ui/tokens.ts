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
 * ⚠️ Los COLORES no son hex: son `var(--mo-*)` de `app/tokens.css`. La paleta se cambia
 * en un solo archivo CSS y toda la app (kit + secciones ya migradas) se reviste sola.
 * Por eso NUNCA se concatena ni se manipula un valor de `color` (nada de `color.brand + '20'`
 * ni de pasarlo a una función que espere hex): para transparencias, usá la var del tono.
 * Los números (space/font/radius) siguen siendo números: se usan en `React.CSSProperties`.
 *
 * Muerto el iframe legacy, el kit ya no necesita ganar por especificidad con estilos
 * inline: la forma de los primitivos vive en `components/ui/kit.css` (que sí puede
 * :hover, :focus-visible y @media) y acá quedan los valores.
 */

export const color = {
  // Texto
  ink: 'var(--mo-ink)', // principal
  ink2: 'var(--mo-ink2)', // medio-fuerte (labels)
  mut: 'var(--mo-mut)', // secundario
  mut2: 'var(--mo-mut2)', // terciario / placeholders

  // Superficies y bordes
  surface: 'var(--mo-surface)',
  bg: 'var(--mo-bg)',
  bg2: 'var(--mo-bg2)',
  line: 'var(--mo-line)', // borde estándar de cards/tablas
  scrim: 'var(--mo-scrim)', // velo oscuro SOBRE una foto (chapitas, lightbox)
  line2: 'var(--mo-line2)', // borde de inputs

  // Marca — ÍNDIGO (acento de firma: acción, activo, foco)
  brand: 'var(--mo-brand)',
  brandSolid: 'var(--mo-brand-solid)',
  brandBorder: 'var(--mo-brand-border)',
  brandBg: 'var(--mo-brand-bg)',
  brandBg2: 'var(--mo-brand-bg2)',
  brandRing: 'var(--mo-ring)', // ring de foco accesible

  // Acción — el MISMO índigo. Existe por compatibilidad: antes era el azul del legacy,
  // y tener dos azules compitiendo era justamente el problema.
  action: 'var(--mo-action)',
  actionAlt: 'var(--mo-action-solid)',
  actionBg: 'var(--mo-action-bg)',

  // Semánticos
  danger: 'var(--mo-danger)',
  dangerBg: 'var(--mo-danger-bg)',
  dangerBorder: 'var(--mo-danger-border)',
  dangerInk: 'var(--mo-danger-ink)',
  success: 'var(--mo-success)',
  successBg: 'var(--mo-success-bg)',
  successBorder: 'var(--mo-success-border)',
  successInk: 'var(--mo-success-ink)',
  warning: 'var(--mo-warning)', // ÁMBAR = advertencia y nada más
  warningBg: 'var(--mo-warning-bg)',
  warningBorder: 'var(--mo-warning-border)',
  warningInk: 'var(--mo-warning-ink)',
} as const

/**
 * ⚠️ La ÚNICA excepción a "los colores son var()": los gráficos.
 *
 * Recharts pinta con atributos de presentación del SVG (`fill="…"`), y ahí `var()` no
 * resuelve — quedaría todo negro. Estos hex tienen que espejar los de `app/tokens.css`:
 * si se cambia la paleta, se cambian los dos.
 */
export const chartColor = {
  brand: '#4F46E5',
  brandSoft: 'rgba(79,70,229,0.10)',
  grid: '#E4E7EC',
  axis: '#98A2B3',
  axisFuerte: '#344054',
  success: '#079455',
  warning: '#DC6803',
  danger: '#D92D20',
} as const

export const radius = { sm: 6, md: 8, lg: 10, xl: 12, '2xl': 14, pill: 999 } as const

// Escala de espaciado (px). Claves numéricas = múltiplos de 4 (0.5 = 2px).
export const space = { 0.5: 2, 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const

export const font = { xs: 11, sm: 12, base: 13, md: 14, lg: 15, xl: 18, '2xl': 22, '3xl': 26 } as const

export const weight = { normal: 400, medium: 500, semibold: 600, bold: 700, heavy: 800 } as const

export const shadow = {
  sm: 'var(--mo-sh-sm)', // reposo (layered, sutil)
  md: 'var(--mo-sh-md)', // hover / elevación media
  pop: 'var(--mo-sh-pop)', // dropdowns / paneles flotantes
  modal: 'var(--mo-sh-modal)',
} as const

/** Sombra de foco accesible (ring índigo). Se aplica en :focus-visible de controles interactivos. */
export const focusRing = `0 0 0 3px ${color.brandRing}`

/** Fuente tabular para columnas de números (alinea decimales — detalle "SaaS"). */
export const tabularNums = 'var(--mo-font)'

/**
 * Densidad operativa. El monitor se usa sobre planillas de 500 filas: la fila mide
 * 38px en compu y 44px en móvil (dedo, no mouse). Los valores viven en tokens.css
 * porque las clases de `kit.css` los necesitan; acá se exponen para los pocos casos
 * en que una sección arma su propia grilla.
 */
export const density = {
  rowH: 'var(--mo-row-h)',
  cellX: 'var(--mo-cell-x)',
  ctlH: 'var(--mo-ctl-h)',
} as const

export type Tone = 'neutral' | 'brand' | 'action' | 'success' | 'warning' | 'danger'

/** Un Tone → trío coherente {fg, bg, border}. Lo consumen Badge, StatusPill, Notice, KpiCard, botones soft. */
export const toneTokens: Record<Tone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: color.ink2, bg: color.bg2, border: color.line },
  brand: { fg: color.brand, bg: color.brandBg, border: color.brandBorder },
  action: { fg: color.action, bg: color.actionBg, border: 'var(--mo-action-border)' },
  success: { fg: color.successInk, bg: color.successBg, border: color.successBorder },
  warning: { fg: color.warningInk, bg: color.warningBg, border: color.warningBorder },
  danger: { fg: color.dangerInk, bg: color.dangerBg, border: color.dangerBorder },
}

/** Color "sólido" por tono (para botones variant=solid y acentos fuertes). */
export const toneSolid: Record<Tone, string> = {
  neutral: color.ink,
  brand: color.brandSolid,
  action: 'var(--mo-action-solid)',
  success: color.success,
  warning: 'var(--mo-warning-solid)',
  danger: color.danger,
}

/** Variante hover del sólido (la usa `kit.css`; en TS solo para casos puntuales). */
export const toneSolidHover: Record<Tone, string> = {
  neutral: color.ink2,
  brand: 'var(--mo-brand-solid-hover)',
  action: 'var(--mo-brand-solid-hover)',
  success: color.successInk,
  warning: color.warning,
  danger: color.dangerInk,
}
