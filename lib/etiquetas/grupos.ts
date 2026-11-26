/**
 * Etiquetas › Precio de campaña — LAS CAMPAÑAS QUE SE ETIQUETAN JUNTAS (Bruno, 26-nov, Black Friday: «unificar todas las campañas de
 * black friday en una, todas tienen un factor común que es bf»).
 *
 * 🔑 Las campañas de BF de Zattia son DOS («Black Friday 2026» y «· Liquidar») sólo porque la Caja cobra distinto la forma de pago
 * (15/10 y 10/10, `pctCampanias`). ⛔ Se fusionan: la Caja cobraría mal. Se juntan EN ESTA PANTALLA: las de la misma línea y el
 * mismo rótulo impreso (`nombreComercial`, «BLACK ZATTIA») son una opción más del selector, con una sola lista para escanear y
 * para recorrer el local. Cada prenda sigue imprimiendo el rótulo y la forma de pago de SU campaña (`rotuloDe`).
 */

export type CampaniaAgrupable = { id: string; nombre: string; linea?: string | null; nombreComercial?: string | null }
export type GrupoCampanias = { id: string; nombre: string; miembros: string[] }

export const PREFIJO_GRUPO = 'grupo:'
export const esGrupo = (id: string) => id.startsWith(PREFIJO_GRUPO)

/** Las campañas con el mismo rótulo en la misma línea, de a 2 o más. El orden es el de la lista (la más nueva primero). */
export function gruposDeCampanias(campanias: CampaniaAgrupable[]): GrupoCampanias[] {
  const m = new Map<string, { rotulo: string; linea: string; ids: string[] }>()
  for (const c of campanias || []) {
    const rotulo = (c.nombreComercial || '').trim()
    if (!rotulo) continue
    const linea = c.linea || ''
    const k = `${linea}:${rotulo.toUpperCase()}`
    const g = m.get(k) || { rotulo, linea, ids: [] }
    g.ids.push(c.id)
    m.set(k, g)
  }
  return [...m.entries()]
    .filter(([, g]) => g.ids.length > 1)
    .map(([k, g]) => ({ id: PREFIJO_GRUPO + k, nombre: `${g.rotulo} · todas juntas (${g.ids.length} campañas)`, miembros: g.ids }))
}

/**
 * Las listas de cada campaña del grupo, en una. Un producto que está en dos se queda con la PRIMERA (la más nueva) y se cuenta en
 * `repetidos`: la pantalla lo dice, ⛔ elige en silencio.
 */
export function unirCampanias<I extends { pid: string }, R>(listas: { items: I[]; rotulo: R }[]): { items: I[]; rotuloPorPid: Record<string, R>; repetidos: string[] } {
  const items: I[] = []
  const rotuloPorPid: Record<string, R> = {}
  const repetidos: string[] = []
  for (const l of listas) {
    for (const i of l.items || []) {
      if (rotuloPorPid[i.pid] !== undefined) {
        repetidos.push(i.pid)
        continue
      }
      rotuloPorPid[i.pid] = l.rotulo
      items.push(i)
    }
  }
  return { items, rotuloPorPid, repetidos }
}
