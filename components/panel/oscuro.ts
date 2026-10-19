import type { CSSProperties } from 'react'
import { color } from '@/components/ui/tokens'

/**
 * El azul noche del encabezado del panel (rediseño del 19-oct-2026, «Encabezado oscuro»): la
 * misma barra oscura del Monitor, arriba de la ficha, de «Hoy» y de «Pagos».
 *
 * 🔑 **No se repinta cada componente: se redefinen los colores del kit adentro del bloque.** Todo
 * lo que vive adentro (el Instagram, la marca de la comunidad, los casilleros, las chapas) ya pinta
 * con `var(--mo-*)`, así que con esto se lee claro sobre oscuro sin tocarlos uno por uno.
 */
export const SOBRE_OSCURO = {
  '--mo-ink': 'var(--mo-side-active-ink)',
  '--mo-ink2': 'var(--mo-side-ink)',
  '--mo-mut': 'var(--mo-side-ink2)',
  '--mo-mut2': 'var(--mo-side-ink2)',
  '--mo-line': 'var(--mo-side-line)',
  '--mo-line2': 'var(--mo-side-line)',
  '--mo-bg': 'var(--mo-side-hover)',
  '--mo-bg2': 'var(--mo-side-hover)',
  '--mo-surface': 'var(--mo-side-bg2)',
  '--mo-brand': 'var(--mo-side-accent)',
  '--mo-brand-bg': 'var(--mo-side-hover)',
  '--mo-brand-border': 'var(--mo-side-line)',
  '--mo-success-ink': 'var(--mo-side-ok)',
  '--mo-success-bg': 'var(--mo-side-ok-bg)',
  '--mo-success-border': 'var(--mo-side-ok-border)',
  '--mo-warning-ink': 'var(--mo-side-warn)',
  '--mo-warning-bg': 'var(--mo-side-warn-bg)',
  '--mo-warning-border': 'var(--mo-side-warn-border)',
  '--mo-danger': 'var(--mo-side-danger)',
  '--mo-danger-ink': 'var(--mo-side-danger)',
  '--mo-danger-bg': 'var(--mo-side-danger-bg)',
  '--mo-danger-border': 'var(--mo-side-danger-border)',
  background: `linear-gradient(180deg, ${color.sideBg} 0%, ${color.sideBg2} 100%)`,
  color: color.sideActiveInk,
} as CSSProperties
