/**
 * La marca de la Caja, en UN lugar (rediseño, fase 3): lo que ven la clienta en su pantalla y el tótem.
 *
 * Hoy la Caja es sólo de Zattia. 🔑 El POS es UNO solo y la marca es configuración (Bruno, 5-oct): la
 * fase de multimarca (V4) pasa esto a `caja_config`. Mientras, ⛔ se copia en cada pantalla.
 * El logo ⛔ va acá: es el del ticket, que ya está en la configuración (`ticket_logo`).
 */
import { color } from '@/components/ui/tokens'

export const MARCA_CAJA = {
  nombre: 'Zattia',
  /** El color de identidad: en la pantalla de la clienta y el tótem es el color principal. */
  acento: color.brand,
  acentoBg: color.brandBg,
} as const
