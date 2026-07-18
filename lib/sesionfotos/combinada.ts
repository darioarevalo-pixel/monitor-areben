/**
 * Vista combinada: agrega los ítems de varias solicitudes por variante, dentro de
 * un origen, sumando pedido y confirmado. Port de `_sfCombiAgg` (index.html:10298)
 * y `sfFaseCompletaCombi` (10293), sin el global `sfData` (las solicitudes entran
 * por parámetro).
 *
 * Sutileza portada tal cual: los ítems "a mano" NO se agregan entre solicitudes
 * (clave `m_<vid>`, cada uno queda solo con su `solId`); el resto sí suma por vid.
 * Y el agregado NO arrastra `nuevo`/`barcode`, así que la vista combinada no
 * muestra ni el badge "sin venta" ni el código de barras — igual que el legacy.
 */

import { faseCompleta } from './core'
import type { Fase, Origen, Solicitud } from './tipos'

export type ItemCombinado = {
  vid: string
  nombre: string
  variante: string
  sku: string
  /** Total pedido de esta variante entre todas las solicitudes. */
  ped: number
  /** Total confirmado (preparado o devuelto) entre todas, cada uno topeado a su qty. */
  conf: number
  manual?: boolean
  /** Solo en manuales: la solicitud a la que pertenece (para el ajuste a mano). */
  solId?: string
}

export function agregarCombinada(sols: Solicitud[], origen: Origen, fase: Fase): ItemCombinado[] {
  const mk = fase === 'devolucion' ? 'devuelto' : 'verif'
  const map: Record<string, ItemCombinado> = {}
  sols.forEach((s) =>
    (s.items || [])
      .filter((i) => i.origen === origen)
      .forEach((i) => {
        if (i.manual) {
          map['m_' + i.vid] = {
            vid: i.vid,
            nombre: i.nombre,
            variante: i.variante,
            sku: i.sku,
            ped: i.qty,
            conf: Math.min((s[mk] || {})[i.vid] || 0, i.qty),
            manual: true,
            solId: s.id,
          }
          return
        }
        const e = map[i.vid] || (map[i.vid] = { vid: i.vid, nombre: i.nombre, variante: i.variante, sku: i.sku, ped: 0, conf: 0 })
        e.ped += i.qty
        e.conf += Math.min((s[mk] || {})[i.vid] || 0, i.qty)
      }),
  )
  return Object.values(map).sort(
    (a, b) =>
      (a.nombre || '').localeCompare(b.nombre || '', 'es') ||
      (a.variante || '').localeCompare(b.variante || '', 'es', { numeric: true }),
  )
}

/** ¿Todas las solicitudes combinadas completaron la fase? Port de sfFaseCompletaCombi. */
export function faseCompletaCombi(sols: Solicitud[], fase: Fase): boolean {
  return sols.length > 0 && sols.every((s) => faseCompleta(s, fase))
}
