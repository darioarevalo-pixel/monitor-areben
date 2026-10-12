/**
 * **Las paradas del chequeo con mapa** (Darío, 12-oct-2026): cada barra del local en el orden en que
 * se camina (el `orden` del Mapa del local guardado), para elegir el lugar con UN toque desde la
 * ubicación flotante (`UbicacionFlotante.tsx`) en vez de las cinco filas de botones de
 * `ElegirEspacio`.
 *
 * 🔑 La estructura (doble barra, doble largo) sale del mapa guardado: el chequeo semanal ⛔ la
 * releva. Si en el salón cambió, se corrige desde «Otro lugar…» (o con el chequeo sin mapa).
 * 🔑 **Lo ya escaneado se deja de ofrecer**: *«normalmente no se vuelve a un lugar donde ya
 * chequeaste»*. Un lugar está hecho si tiene al menos un escaneo en este recorrido.
 */

import { leerEspacio, lugarDe, type PosEspacio } from '@/lib/mapa-local/relevamiento'
import type { MapaLocal } from '@/lib/mapa-local/tipos'

export type Parada = {
  /** El texto que se guarda en cada escaneo: `D01 arriba`, `D07-08 abajo`, `ISLA`. */
  lugar: string
  /** El perchero, para agrupar en la lista: `D01`, `D07-08`, `ISLA`. */
  modulo: string
  pos: PosEspacio
}

/** Las barras del mapa en el orden en que se camina el local. */
export function paradasDelMapa(mapa: Pick<MapaLocal, 'modulos'> | null): Parada[] {
  const out: Parada[] = []
  for (const m of [...(mapa?.modulos ?? [])].sort((a, b) => a.orden - b.orden)) {
    const e = leerEspacio(m.codigo)
    if (!e) continue
    const largo = e.pared !== 'isla' && (m.anchoCm ?? 0) >= 150
    // Igual que `ElegirEspacio`: doble si el mapa le conoce una barra alta o baja.
    const doble = e.pared !== 'isla' && m.niveles.some((n) => n.pos === 'alta' || n.pos === 'baja')
    const modulo = lugarDe({ pared: e.pared, numero: e.numero, pos: 'simple', largo })
    for (const pos of doble ? (['alta', 'baja'] as const) : (['simple'] as const)) {
      out.push({ lugar: lugarDe({ pared: e.pared, numero: e.numero, pos, largo }), modulo, pos })
    }
  }
  return out
}

/**
 * La clave de un lugar para saber si dos textos nombran la misma barra: `D7 abajo`, `D07 baja` y
 * `D07-08 abajo` son lo mismo. Lo que ⛔ es del mapa, en minúscula y sin espacios de más.
 */
export function claveLugar(lugar: string): string {
  const e = leerEspacio(lugar)
  if (e) return `${e.codigo}|${e.pos}`
  return String(lugar || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Los lugares (por `claveLugar`) que ya tienen al menos un escaneo en el recorrido. */
export function lugaresHechos(escaneos: { lugar: string }[]): Set<string> {
  return new Set(escaneos.map((e) => claveLugar(e.lugar)).filter(Boolean))
}

/**
 * La parada que sigue a `actual` y que todavía ⛔ se escaneó. Si ⛔ queda ninguna después, vuelve a
 * buscar desde el principio (una que se salteó). `null` = ya están todas.
 */
export function siguienteParada(paradas: Parada[], actual: string, hechos: Set<string>): Parada | null {
  const k = claveLugar(actual)
  const i = paradas.findIndex((p) => claveLugar(p.lugar) === k)
  const libre = (p: Parada) => !hechos.has(claveLugar(p.lugar)) && claveLugar(p.lugar) !== k
  return paradas.slice(i + 1).find(libre) ?? paradas.slice(0, Math.max(i, 0)).find(libre) ?? null
}
