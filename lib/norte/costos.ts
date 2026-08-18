/** Re-export tipado de `costos.core.js`. El `.js` lo importa el handler, que no compila TS. */
import type { CostoBloque } from './tipos'

import { sanearCostos as _sanearCostos } from './costos.core.js'

export const sanearCostos: (raw: unknown) => CostoBloque[] = _sanearCostos
