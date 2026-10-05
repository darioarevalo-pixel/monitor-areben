/**
 * La marca de la Caja en la PANTALLA (el chip del POS, la pantalla de la clienta y el tótem). Los datos
 * de la marca —nombre, local, depósito, modo Local— viven en `lib/caja/marcas.core.js`, que también lee
 * el servidor; acá se le suma el color, que es de la pantalla. 🔑 El POS es UNO solo y la marca es
 * configuración (Bruno, 5-oct). El logo ⛔ va acá: es el del ticket (`ticket_logo` de la configuración).
 *
 * ⚠️ El color de identidad todavía es el índigo del monitor: el de cada marca lo elige Bruno.
 */
import { color } from '@/components/ui/tokens'
import { MARCA_POR_DEFECTO, marcaDeCaja } from '@/lib/caja/marcas.core.js'

const datos = marcaDeCaja(MARCA_POR_DEFECTO)!

export const MARCA_CAJA = {
  nombre: datos.nombre,
  /** El color de identidad: en la pantalla de la clienta y el tótem es el color principal. */
  acento: color.brand,
  acentoBg: color.brandBg,
} as const
