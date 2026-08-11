/**
 * Qué fundas hay para cada modelo de celular. **Es lo que evita el canje caído.**
 *
 * Ya se cayeron dos canjes porque la creadora tenía un celular viejo del que no teníamos fundas, y
 * eso se supo tarde: el modelo se tipeaba a mano y nadie lo cruzaba contra el stock. Acá el modelo
 * deja de ser texto libre y pasa a ser una elección **contra lo que hay de verdad**.
 *
 * 🔑 **En BDI el modelo vive en el nombre de la VARIANTE, no en el del producto** (`iPhone 15 Pro`
 * como "talle" de la funda). Por eso agrupar por `modeloDe(size_name)` ya filtra solo las fundas:
 * los accesorios traen `Variante Única` o un color, y `modeloDe` les devuelve `null`.
 *
 * Puro y sin I/O: la lectura del espejo la hace el componente. `lib/reposicion/grupos.ts` y
 * `lib/fundas/ranking.ts` ya sabían sacar el modelo y ordenarlos — no se re-escribe ninguno de los
 * dos, porque el día que salga un iPhone nuevo tiene que aparecer en un solo lugar.
 */

import { conoceElModelo, iphoneModelSort } from '@/lib/fundas/ranking'
import { modeloDe } from '@/lib/reposicion/grupos'

/** Una fila del espejo `inventario`: hay una por variante **y por ubicación**. */
export type FilaInventario = {
  size_name?: string | null
  store_name?: string | null
  available_quantity?: number | null
}

export type StockDeModelo = {
  modelo: string
  /** Todas las ubicaciones sumadas: es lo que se puede mandar por correo. */
  total: number
  /** Sólo lo que está en el local, que es lo único que se puede entregar en el mostrador. */
  local: number
}

/** La ubicación que cuenta como "el local" en el espejo de Gestión Nube. */
const ES_LOCAL = (store: string | null | undefined) => String(store || '').trim().toLowerCase() === 'local'

/**
 * El stock de fundas por modelo, del más nuevo al más viejo.
 *
 * Sólo entran los modelos con **algo** en algún lado: un modelo en cero no se distingue de uno que
 * no vendemos, y para el que decide son la misma respuesta ("no le podemos dar nada").
 */
export function fundasPorModelo(filas: FilaInventario[]): StockDeModelo[] {
  const por = new Map<string, StockDeModelo>()
  for (const f of filas || []) {
    const modelo = modeloDe(String(f?.size_name || ''))
    if (!modelo) continue
    const n = Number(f?.available_quantity) || 0
    if (n <= 0) continue
    const prev = por.get(modelo) || { modelo, total: 0, local: 0 }
    prev.total += n
    if (ES_LOCAL(f?.store_name)) prev.local += n
    por.set(modelo, prev)
  }
  // Del más nuevo al más viejo, que es el orden en el que se pregunta. ⚠️ No alcanza con invertir
  // `iphoneModelSort`: los modelos que el orden canónico NO conoce se van al fondo con él, así que
  // invertido encabezarían la lista. Pasa de verdad con `iPhone 16 E`, que ahí figura `iPhone 16e`.
  return [...por.values()].sort((a, b) => {
    const ka = conoceElModelo(a.modelo)
    const kb = conoceElModelo(b.modelo)
    if (ka !== kb) return ka ? -1 : 1
    if (!ka) return a.modelo.localeCompare(b.modelo, 'es')
    return iphoneModelSort(b.modelo, a.modelo)
  })
}

/**
 * Lo que hay para el modelo que dice tener, o `null` si no hay nada.
 *
 * El texto se normaliza con la MISMA función que arma la lista (`modeloDe`), así "iphone 13",
 * "iPhone 13" y "IPHONE13" son el mismo modelo. Sin eso, alguien que lo tipea distinto ve
 * "no tenemos" sobre un modelo del que hay cincuenta.
 */
export function stockDelModelo(lista: StockDeModelo[], texto: string | null | undefined): StockDeModelo | null {
  const modelo = modeloDe(String(texto || ''))
  if (!modelo) return null
  return (lista || []).find((m) => m.modelo === modelo) || null
}
