'use client'

import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { ReposicionZattia } from './ReposicionZattia'
import { Esqueleto } from '@/components/ui'

/**
 * Las dos marcas reponen según ventas (`ReposicionZattia` + `lib/reposicion/porVentas.ts`): Zattia
 * desde el 11-oct-2026 y BDI desde el 12-oct. La pantalla vieja de BDI (mínimo fijo por modelo y
 * topes por producto, `lib/reposicion/core.ts`) se sacó ese día; lo que quedaba vivo de su
 * configuración está en `OpcionesBdi.tsx`.
 */
export function Reposicion() {
  const { marca } = useSesion()
  const { datos } = useDatosMonitor()
  if (!datos) return <Esqueleto forma="tabla" filas={8} />
  return <ReposicionZattia key={marca} allProductos={datos.allProductos ?? []} />
}
