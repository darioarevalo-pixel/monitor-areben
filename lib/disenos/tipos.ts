/**
 * Tipos del tablero de Selección de diseños. Todo local (localStorage
 * `monitor_designboard_v1`): imágenes base64, votos, notas y clasificación. La
 * votación online (endpoint `votacion`) junta votos del equipo. Port de
 * index.html:3486-3898.
 */

export type EstadoDiseno = 'revisar' | 'confirmado' | 'duda' | 'rechazado'

export type Diseno = {
  id: string
  name: string
  /** data URL (base64) de la miniatura. */
  url: string
  nota: string
  up: number
  down: number
  estado: EstadoDiseno
}

export type OrdenDiseno = 'carga' | 'tildes' | 'cruces' | 'saldo'

/** Los cuatro estados, en el orden del tablero, con sus colores. Port de DB_ESTADOS. */
export const DB_ESTADOS: { k: EstadoDiseno; lbl: string; ico: string; color: string; bg: string; rgb: [number, number, number] }[] = [
  { k: 'revisar', lbl: 'Por revisar', ico: '🕓', color: '#6B7280', bg: '#F9FAFB', rgb: [107, 114, 128] },
  { k: 'confirmado', lbl: 'Confirmados', ico: '✅', color: '#16A34A', bg: '#F0FDF4', rgb: [22, 163, 74] },
  { k: 'duda', lbl: 'En duda', ico: '🤔', color: '#D97706', bg: '#FFFBEB', rgb: [217, 119, 6] },
  { k: 'rechazado', lbl: 'Rechazados', ico: '❌', color: '#DC2626', bg: '#FEF2F2', rgb: [220, 38, 38] },
]
