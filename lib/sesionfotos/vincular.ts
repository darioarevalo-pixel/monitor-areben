/**
 * Vincular los ítems que entraron SIN producto con su variante de Gestión Nube.
 *
 * Port de `sfVincularNuevos` (index.html:9800), que **nunca se había portado** a la app: el campo
 * `vinculado` existía en `tipos.ts` y no lo escribía nadie, mientras la pantalla seguía prometiendo
 * *«Cuando el producto se cargue en GN, se vinculan solos»*. Los `bc_` con `vinculado: true` que hay
 * en la base son de julio-2026, hechos por el legacy antes de morir.
 *
 * Y va más allá del port, porque el legacy sólo miraba los `bc_`: acá entran también los **`man_`**,
 * los cargados por el campo «Cargalo sin código». Ese campo dispara con Enter, así que **escanear
 * con el foco puesto ahí crea un ítem cuyo NOMBRE es el código** —con el SKU vacío y sin barcode—,
 * que es exactamente lo que dejó 152 prendas imposibles de devolver por escáner el 2-sep-2026.
 *
 * 🔴 **Lo que NO se toca, y no es un detalle:**
 * - **`vid`**. `verif`, `devuelto`, `fotos`, `clasifOutfits` y `bolsa` están indexados por `vid`:
 *   cambiarlo tira todo lo ya escaneado de esa solicitud.
 * - **`manual` y `nuevo`**. Decisión de Bruno (10-sep-2026): un ítem vinculado **sigue siendo «a
 *   mano»** — sigue sin venta en Gestión Nube, sigue con los botones −/+ y `salio()` sigue dando lo
 *   mismo. Crear la venta ahora separaría stock de mercadería que físicamente ya salió.
 *
 * Lo que sí se completa es la IDENTIDAD: nombre real, talle, SKU, código de barras y el `pid`/`sid`.
 */

import { normCodigo, pareceCodigo } from './codigo'
import type { ItemSolicitud, Solicitud } from './tipos'

/** Lo que hace falta de una variante del ETL para vincular. `allVariantes` lo cumple. */
export type VarianteVinculable = {
  id: string
  pid: string
  sid: string
  name?: string | null
  size?: string | null
  sku?: string | null
  barcode?: string | null
}

/**
 * Mapa `código normalizado → variante`, armado con el **barcode y el SKU** de cada variante.
 *
 * 🔴 **Una clave que cae en más de una variante se DESCARTA**, no se elige una. Vincular mal es peor
 * que no vincular: el ítem quedaría con el nombre de otra prenda y nadie lo notaría hasta contar la
 * devolución. Es el mismo criterio que usa `lib/canjes/venta-gn.ts` con los SKU repetidos.
 */
export function mapaDeCodigos(variantes: VarianteVinculable[]): Map<string, VarianteVinculable> {
  const porClave = new Map<string, VarianteVinculable | null>()
  const anotar = (raw: unknown, v: VarianteVinculable) => {
    const k = normCodigo(raw)
    if (!k) return
    const prev = porClave.get(k)
    if (prev === undefined) porClave.set(k, v)
    else if (prev && prev.id !== v.id) porClave.set(k, null) // ambigua: no sirve para nadie
  }
  for (const v of variantes || []) {
    anotar(v.barcode, v)
    anotar(v.sku, v)
  }
  const m = new Map<string, VarianteVinculable>()
  for (const [k, v] of porClave) if (v) m.set(k, v)
  return m
}

/**
 * El código con el que este ítem se puede buscar, o `null` si no tiene ninguno.
 *
 * El `barcode` manda cuando está (es el caso de los `bc_`, y el de un `man_` ya vinculado, así que
 * la función es idempotente). Si no hay, se usa el **nombre**, pero **sólo si tiene forma de
 * código**: un «Remera estampa X» ⛔ no es candidato a nada.
 */
export function codigoDeItem(i: ItemSolicitud): string | null {
  if (i.barcode) return String(i.barcode)
  if (i.nombre && pareceCodigo(i.nombre)) return String(i.nombre).trim()
  return null
}

/**
 * Vincula un ítem si se puede. Devuelve **el mismo objeto** cuando no hay nada que cambiar, así el
 * llamador decide por identidad si hubo cambios.
 *
 * Sólo mira los ítems `nuevo` (los `bc_` y los `man_`): una variante real ya tiene su identidad.
 * Si el código ⛔ no cruza con ninguna variante, igual se le copia a `barcode` — queda escaneable
 * hoy y se vincula solo el día que el producto entre a Gestión Nube.
 */
export function vincularItem(i: ItemSolicitud, mapa: Map<string, VarianteVinculable>): ItemSolicitud {
  if (!i.nuevo) return i
  const code = codigoDeItem(i)
  if (!code) return i
  const v = mapa.get(normCodigo(code))
  if (!v) {
    // Sin producto todavía: al menos que el código deje de estar sólo en el nombre.
    return i.barcode ? i : { ...i, barcode: code }
  }
  const prop: ItemSolicitud = {
    ...i,
    pid: String(v.pid),
    sid: String(v.sid),
    nombre: v.name || i.nombre,
    variante: v.size || '',
    sku: v.sku || '',
    barcode: v.barcode || code,
    pendiente: false,
    vinculado: true,
  }
  const igual =
    prop.pid === i.pid &&
    prop.sid === i.sid &&
    prop.nombre === i.nombre &&
    prop.variante === i.variante &&
    prop.sku === i.sku &&
    prop.barcode === i.barcode &&
    i.pendiente === false &&
    i.vinculado === true
  return igual ? i : prop
}

/** Una solicitud con sus ítems vinculados. Devuelve la misma si ninguno cambió. */
export function vincularSolicitud(s: Solicitud, mapa: Map<string, VarianteVinculable>): Solicitud {
  const items = (s.items || []).map((i) => vincularItem(i, mapa))
  return items.some((it, n) => it !== (s.items || [])[n]) ? { ...s, items } : s
}

/**
 * Todas las solicitudes del cajón. `cambios` es cuántas cambiaron, y es lo único que decide si vale
 * la pena guardar: sin eso, abrir la pantalla escribiría el cajón entero en cada carga.
 */
export function vincularSolicitudes<T extends Solicitud>(sols: T[], mapa: Map<string, VarianteVinculable>): { sols: T[]; cambios: number } {
  let cambios = 0
  const out = (sols || []).map((s) => {
    const ns = vincularSolicitud(s, mapa) as T
    if (ns !== s) cambios++
    return ns
  })
  return { sols: cambios ? out : sols, cambios }
}
