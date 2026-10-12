/**
 * **Lo que el celular le manda al servidor para el correo del chequeo** (Darío, 12-oct-2026): el
 * mismo reporte que se ve en pantalla (`reporteDelChequeo`) más el resumen de la caminata. El
 * correo lo arma y lo manda `api/_exhib.js` con `lib/exhib/correo.core.js`.
 *
 * 🔑 Se calcula ACÁ porque el handler ⛔ puede importar TypeScript: el teléfono que cierra el
 * recorrido ya tiene el stock, los precios de TN y el mapa con que escaneó.
 */

import { CUENTAS } from '@/lib/cuentas'
import { fetchAll } from '@/lib/supabase/rest'
import type { MapaLocal } from '@/lib/mapa-local/tipos'
import type { Marca } from '@/lib/nav'
import { pasoPorElLector, vecesDe, type EscaneoLibre } from './libre'
import { reporteDelChequeo, type ReporteChequeo } from './reporte'
import type { ExhibItem } from './tipos'

/**
 * Los productos dados de alta en GN desde un día (`YYYY-MM-DD`): `productId` → día de alta. Si ⛔ se
 * pueden leer, vacío: el reporte sale igual, sin la marca «Nuevo».
 */
export async function altasDesde(marca: Marca, desde: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const filas = await fetchAll<{ id: number | string; created_at: string | null }>(CUENTAS[marca], 'productos', `select=id,created_at&created_at=gte.${desde}`)
    for (const f of filas) if (f.created_at) out.set(String(f.id), f.created_at.slice(0, 10))
  } catch {
    /* sin la marca «Nuevo» */
  }
  return out
}

export type ParaElCorreo = ReporteChequeo & {
  /** Lecturas que pasaron por el lector (con los repetidos). */
  escaneos: number
  /** Lecturas que ⛔ cruzaron con ninguna prenda («NO LEYÓ»). */
  noLeyo: number
  porLugar: { lugar: string; escaneos: number }[]
  nuevosDesde: { desde: string; hayAnterior: boolean } | null
}

export function paraElCorreo(
  escaneos: EscaneoLibre[],
  items: ExhibItem[],
  mapa: Pick<Partial<MapaLocal>, 'unaVariante' | 'tipos'> | null,
  nuevos: Map<string, string>,
  nuevosDesde: { desde: string; hayAnterior: boolean } | null,
): ParaElCorreo {
  const lugares = new Map<string, number>()
  let leidas = 0
  let noLeyo = 0
  for (const e of escaneos) {
    if (!e.encontrado) {
      noLeyo++
      continue
    }
    if (!pasoPorElLector(e)) continue
    leidas += vecesDe(e)
    lugares.set(e.lugar, (lugares.get(e.lugar) ?? 0) + vecesDe(e))
  }
  return {
    ...reporteDelChequeo(escaneos, items, mapa, nuevos),
    escaneos: leidas,
    noLeyo,
    porLugar: [...lugares].map(([lugar, n]) => ({ lugar, escaneos: n })),
    nuevosDesde,
  }
}
