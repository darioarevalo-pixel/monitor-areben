/**
 * Lógica pura de Sesión de fotos: las derivaciones que el legacy calculaba
 * inline dentro de sus funciones de render (index.html:10167-10291). Acá viven
 * sin DOM para poder testearlas contra el comportamiento legacy (paridad) y para
 * que el render en Next sea una proyección de estos valores, no una copia de la
 * cuenta.
 *
 * Cada función es un port literal; los números de línea apuntan al original.
 */

import { type Disparador, disparadoresDe, tieneDisparador } from '../solicitudes/disparador'
import type { ZonaPrenda } from './outfits'
import type { Cambio, EstadoSolicitud, Fase, ItemSolicitud, Origen, Solicitud } from './tipos'

/** El mapa de conteo de la fase: `verif` para preparado, `devuelto` para la vuelta. */
export function claveConteo(fase: Fase): 'verif' | 'devuelto' {
  return fase === 'devolucion' ? 'devuelto' : 'verif'
}

/** Cantidad efectivamente PREPARADA/escaneada de un ítem (topeada a lo pedido). Base real de venta y devolución. */
export function preparado(s: Solicitud, i: ItemSolicitud): number {
  return Math.min((s.verif || {})[i.vid] || 0, i.qty)
}

/**
 * ¿Este origen SALIÓ sin que nadie escaneara el retiro?
 *
 * Escanear el preparado es opcional en la práctica: se junta la mercadería, se mete en la bolsa y
 * se va. Cuando eso pasa, `verif` queda vacío, `preparado` da 0 para todos los ítems y la mitad de
 * abajo del ciclo se apaga entera **en silencio**: la tabla de devolución sale vacía, el panel de
 * no devueltos no aparece y el reporte de faltantes dice "volvió todo" aunque no haya vuelto nada.
 *
 * Las dos condiciones son necesarias y ninguna alcanza sola:
 *
 * - **`salio(s)`** — sin esto, una solicitud recién creada (que todavía no salió y obviamente no
 *   tiene escaneos) aparecería con todo pendiente de devolver. Es la misma puerta que habilita el
 *   control de devolución en la pantalla, y es lo que hace que esto no contradiga la paridad con
 *   el legacy: mientras no salió, la cuenta es la de siempre.
 * - **ningún escaneo en ESE origen** — "nadie escaneó" no es lo mismo que "se escaneó y no se
 *   encontró ninguno". Se mira por origen porque cada sector prepara lo suyo por separado:
 *   Depósito puede haber escaneado y Local no.
 *
 * ⚠️ La segunda condición mira si la **clave existe** en `verif`, no si vale 0. Un `0` explícito lo
 * escribe el ajuste a mano y significa "lo busqué y no está" — un dato, no una ausencia. Mirar
 * `preparado(s, i) === 0` mezclaba los dos casos y hacía reaparecer en la devolución justo lo que
 * el sector había marcado como no encontrado, que es exactamente lo que `8d8265e` vino a sacar.
 */
export function salioSinEscanear(s: Solicitud, origen: Origen): boolean {
  if (!salio(s)) return false
  const v = s.verif || {}
  const delOrigen = (s.items || []).filter((i) => i.origen === origen)
  return delOrigen.length > 0 && delOrigen.every((i) => v[i.vid] == null)
}

/**
 * Lo que SALIÓ de verdad. Es `preparado`, salvo que ese origen haya salido sin escanear: ahí lo
 * que salió es lo pedido, porque la mercadería se llevó igual.
 *
 * No reemplaza a `preparado` —el tope del escaneo del retiro y la venta siguen usándolo—:
 * reemplaza a la pregunta "¿cuánto tiene que volver?".
 */
export function salioEfectivo(s: Solicitud, i: ItemSolicitud): number {
  return salioSinEscanear(s, i.origen) ? i.qty : preparado(s, i)
}

/**
 * Cuántas unidades se esperan de un ítem EN ESTA FASE. Es la regla que separa las dos mitades
 * del ciclo, y vale para todo lo que cuenta: la lista que se muestra, el tope del escaneo, el
 * ajuste a mano, el cierre de fase y la vista combinada.
 *
 * - **Retiro**: lo pedido.
 * - **Devolución**: lo que efectivamente SALIÓ. Si de 10 se encontraron 7, vuelven 7 — los no
 *   encontrados no se venden, así que tampoco se devuelven. Si de ese origen no se escaneó nada,
 *   salió todo lo pedido (ver `sinEscaneoDeRetiro`).
 */
export function esperadoEn(s: Solicitud, i: ItemSolicitud, fase: Fase): number {
  return fase === 'devolucion' ? salioEfectivo(s, i) : i.qty
}

/**
 * Faltantes de devolución: ítems que aún no volvieron. El "esperado a devolver" es lo que
 * efectivamente SALIÓ (lo preparado por escaneo), NO lo pedido — así lo no encontrado durante la
 * separación no aparece como pendiente de devolver ni genera correcciones manuales. La excepción
 * es el origen que nunca se escaneó: ahí lo que salió es lo pedido.
 */
export function faltantes(s: Solicitud): Array<ItemSolicitud & { falta: number }> {
  const d = s.devuelto || {}
  return (s.items || [])
    .map((i) => ({ ...i, falta: salioEfectivo(s, i) - (d[i.vid] || 0) }))
    .filter((x) => x.falta > 0)
}

/**
 * ¿Ya salió físicamente? Hay venta creada, o hay ítems a mano y la solicitud
 * dejó de estar 'pendiente'. Habilita el control de devolución.
 * Port de sfSalio (index.html:10169).
 */
export function salio(s: Solicitud): boolean {
  return !!(s && s.ventas) || ((s.items || []).some((i) => i.manual) && !!s.estado && s.estado !== 'pendiente')
}

/**
 * ¿La fase está completa? Toda la solicitud preparada (o devuelta), es decir cada
 * ítem alcanzó su cantidad. Una solicitud sin ítems nunca está completa.
 * Port de sfFaseCompleta (index.html:10009).
 */
export function faseCompleta(s: Solicitud, fase: Fase): boolean {
  const m = s[claveConteo(fase)] || {}
  // Retiro: se completa cuando todo lo pedido está preparado. Devolución: cuando volvió todo lo que SALIÓ
  // (lo preparado), para que los no encontrados no impidan cerrar ni exijan corrección manual.
  return (s.items || []).length > 0 && s.items.every((i) => (m[i.vid] || 0) >= esperadoEn(s, i, fase))
}

/** Unidades pedidas de un origen. */
export function unidadesOrigen(s: Solicitud, origen: Origen): number {
  return (s.items || []).filter((i) => i.origen === origen).reduce((a, i) => a + i.qty, 0)
}

/** Orígenes que tienen ítems en la solicitud (los que hay que retirar). */
export function origenesConItems(s: Solicitud): Origen[] {
  const out: Origen[] = []
  for (const o of ['deposito', 'local'] as Origen[]) if ((s.items || []).some((i) => i.origen === o)) out.push(o)
  return out
}

/** ¿El origen ya se marcó como retirado físicamente? */
export function retiradoDe(s: Solicitud, origen: Origen): boolean {
  return !!s.retirado?.[origen]
}

/**
 * ¿Está TODO retirado? (todos los orígenes con ítems marcados). Solo aplica cuando ya
 * hay venta GN (separado): antes de separar no hay nada retirado.
 */
export function retiradoCompleto(s: Solicitud): boolean {
  const origs = origenesConItems(s)
  return !!s.ventas && origs.length > 0 && origs.every((o) => retiradoDe(s, o))
}

/**
 * Fase legible de la solicitud, con la distinción separado/retirado. Crear la venta GN
 * = SEPARADO (no retirado); el retiro físico se marca aparte por origen. Deriva del
 * estado interno + el flag `retirado` (no cambia el enum ni migra datos: `cargada` sigue
 * siendo "venta creada").
 */
export type FaseSolicitud = 'pendiente' | 'preparada' | 'separado' | 'retirado' | 'devuelta' | 'cerrada'
export function faseSolicitud(s: Solicitud): FaseSolicitud {
  if (s.estado === 'cerrada') return 'cerrada'
  if (s.estado === 'devuelta') return 'devuelta'
  if (s.estado === 'cargada') return retiradoCompleto(s) ? 'retirado' : 'separado'
  if (s.estado === 'preparada') return 'preparada'
  return 'pendiente'
}

/** Mutación pura: marca/desmarca el retiro físico de un origen en una solicitud. */
export function conRetirado(lista: Solicitud[], id: string, origen: Origen, val: boolean): Solicitud[] {
  return lista.map((s) => (s.id === id ? { ...s, retirado: { ...(s.retirado || {}), [origen]: val } } : s))
}

/** Fila del historial: los valores que el legacy computa por solicitud (index.html:10274-10284). */
export type FilaHistorial = {
  id: string
  descripcion: string
  fecha: string
  estado: string
  dep: number
  loc: number
  cerrada: boolean
  /** Unidades sin devolver que se muestran como badge ⏳; 0 si no aplica. */
  porDevolver: number
  /**
   * De qué proceso(s) viene la sesión. Vacío = no se anotó (todas las anteriores al
   * 24-ago-2026, y las que se crean por una puerta que no lo sabe). La fila muestra el
   * vacío en vez de taparlo: una sesión sin origen es un dato que falta, no un origen.
   * Son varios porque a una sesión de ingreso se le pueden sumar faltantes.
   */
  disparadores: Disparador[]
}

export function filaHistorial(s: Solicitud): FilaHistorial {
  const cerrada = s.estado === 'cerrada'
  const porDevolver =
    salio(s) && !cerrada && s.estado !== 'devuelta'
      ? faltantes(s).reduce((a, f) => a + f.falta, 0)
      : 0
  return {
    id: s.id,
    descripcion: s.descripcion || '',
    fecha: s.fecha || '',
    estado: s.estado,
    dep: unidadesOrigen(s, 'deposito'),
    loc: unidadesOrigen(s, 'local'),
    cerrada,
    porDevolver,
    disparadores: disparadoresDe(s),
  }
}

/**
 * El historial visible: oculta las cerradas salvo que se pida verlas, en el mismo
 * orden en que vienen del KV (más nueva primero, como las inserta sfProcesar con
 * unshift). Port de sfHistorialHtml (index.html:10271-10273).
 */
export function historialVisible(
  data: Solicitud[],
  verCerradas: boolean,
  origenes?: Origen[],
  disparador?: Disparador | null,
): Solicitud[] {
  const porEstado = (data || [])
    .filter((s) => verCerradas || s.estado !== 'cerrada')
    // El filtro por proceso mira la solicitud Y sus ítems: buscar «faltante» tiene que
    // encontrar también el faltante que se sumó a una sesión de ingreso, que es justo el
    // caso para el que existe el campo. `undefined`/`null` = sin filtrar.
    .filter((s) => !disparador || tieneDisparador(s, disparador))
  // Recorte por sector: sin esto, un usuario de Local que entra por /sesion-fotos veía TODAS las
  // solicitudes de la marca, incluidas las 100% de depósito — mientras que entrando por
  // /solicitudes veía solo las suyas. Eran dos puertas al mismo dato con criterios distintos.
  // `undefined` = ve todo (marketing, administración, dirección, admin).
  if (!origenes || !origenes.length) return porEstado
  return porEstado.filter((s) =>
    origenes.some((o) => (s.items || []).some((i) => i.origen === o)),
  )
}

/** Cuántas cerradas hay (para el toggle "Ver cerradas (N)"). */
export function contarCerradas(data: Solicitud[]): number {
  return (data || []).filter((s) => s.estado === 'cerrada').length
}

// ── Mutaciones puras (lista → lista) ────────────────────────────────────────────
// Cada una toca UNA sola solicitud por id y deja el resto intacto. Se aplican
// tanto al estado optimista como a la lista fresca re-leída antes de guardar (el
// merge por-solicitud), así que tienen que depender solo de su entrada.

/** Cambia el estado de una solicitud. Port de sfEstado (index.html:9930). */
export function conEstado(lista: Solicitud[], id: string, estado: EstadoSolicitud): Solicitud[] {
  return lista.map((s) => (s.id === id ? { ...s, estado } : s))
}

/** Cambia la descripción de una solicitud. Port de sfSetDesc (index.html:9934). */
export function conDescripcion(lista: Solicitud[], id: string, descripcion: string): Solicitud[] {
  return lista.map((s) => (s.id === id ? { ...s, descripcion } : s))
}

/**
 * ¿Se puede borrar la solicitud? Devuelve el motivo del bloqueo o null. Port de la
 * guarda de sfBorrar (index.html:9938): un no-admin no puede borrar una solicitud
 * que ya salió y todavía tiene devoluciones pendientes.
 */
export function bloqueoBorrado(s: Solicitud, admin: boolean): string | null {
  if (!admin && salio(s) && !['devuelta', 'cerrada'].includes(s.estado)) {
    return 'Esta solicitud ya salió y todavía tiene devoluciones pendientes. Cerrá la devolución primero, o pedile a un administrador que la elimine.'
  }
  return null
}

/** Quita una solicitud del historial. Port de sfBorrar. */
export function sinSolicitud(lista: Solicitud[], id: string): Solicitud[] {
  return lista.filter((s) => s.id !== id)
}

/** ¿Se puede quitar un ítem? Bloqueado si ya hay ventas creadas. Port de la guarda de sfEliminarItem. */
export function bloqueoQuitarItem(s: Solicitud): string | null {
  return s.ventas ? 'Ya se crearon las ventas de esta solicitud; no se puede sacar.' : null
}

/** ¿Se puede EDITAR la solicitud? Solo bloqueada si está cerrada (edición = solo monitor, no toca GN). */
export function bloqueoEdicion(s: Solicitud): string | null {
  return s.estado === 'cerrada' ? 'La solicitud está cerrada; no se puede editar.' : null
}

export type DatosEliminacion = { por: string; motivo: string; fecha: string; ts: number }
export type DatosCambio = { por: string; motivo: string; ts: number }

/** Appendea una entrada al historial de cambios de la solicitud. */
export function registrarCambio(s: Solicitud, c: Cambio): Solicitud {
  return { ...s, cambios: [...(s.cambios || []), c] }
}

/** Variante elegida al agregar (misma forma que devuelve `buscarProductos`). */
export type VarElegida = { vid: string; sid: string | null; size: string; sku: string; local: number; deposito: number }

/**
 * Construye el `ItemSolicitud` de una variante elegida, asignando el origen con la
 * misma lógica que `procesarDraft` (prioridad + fallback por stock). Para "agregar producto".
 */
export function itemDeVariante(v: VarElegida, pid: string, nombre: string, qty: number, prioridad: Origen, origenManual?: Origen): ItemSolicitud {
  const q = Math.max(1, Number(qty) || 1)
  const origen: Origen = origenManual ? origenManual : prioridad === 'local' ? (v.local >= q ? 'local' : 'deposito') : v.deposito >= q ? 'deposito' : 'local'
  return { vid: v.vid, pid, sid: v.sid, nombre, variante: v.size, sku: v.sku, qty: q, stockDep: v.deposito, stockLoc: v.local, origen }
}

/** Agrega un ítem a la solicitud + registra el cambio. Si el vid ya está, suma la cantidad. */
export function agregarItemSol(s: Solicitud, item: ItemSolicitud, datos: DatosCambio): Solicitud {
  const existe = (s.items || []).some((i) => i.vid === item.vid)
  const items = existe ? (s.items || []).map((i) => (i.vid === item.vid ? { ...i, qty: i.qty + item.qty } : i)) : [...(s.items || []), item]
  return registrarCambio({ ...s, items }, { ts: datos.ts, por: datos.por, accion: 'agregó', detalle: `${item.nombre} · ${item.variante} (${item.qty})`, motivo: datos.motivo })
}

/** Cambia la cantidad de un ítem + registra el cambio. Clampa verif/devuelto a la nueva qty. */
export function cambiarCantidadSol(s: Solicitud, vid: string, nuevaQty: number, datos: DatosCambio): Solicitud {
  const it = (s.items || []).find((i) => i.vid === vid)
  if (!it) return s
  const q = Math.max(1, Number(nuevaQty) || 1)
  if (q === it.qty) return s
  const ns: Solicitud = { ...s, items: s.items.map((i) => (i.vid === vid ? { ...i, qty: q } : i)) }
  if (s.verif && (s.verif[vid] || 0) > q) ns.verif = { ...s.verif, [vid]: q }
  if (s.devuelto && (s.devuelto[vid] || 0) > q) ns.devuelto = { ...s.devuelto, [vid]: q }
  return registrarCambio(ns, { ts: datos.ts, por: datos.por, accion: 'cambió cantidad', detalle: `${it.nombre} · ${it.variante}: ${it.qty} → ${q}`, motivo: datos.motivo })
}

// ── Bolsas numeradas (armado/packing) ──────────────────────────────────────────
// Repartir los ítems de una solicitud en bolsas numeradas (1..N), cada una un look.
// Organizativo puro: no toca GN ni stock, solo el campo `bolsa` de cada ítem.

/** Asigna (o limpia, con `n = null`) la bolsa de un ítem. */
export function asignarBolsa(s: Solicitud, vid: string, n: number | null): Solicitud {
  const bolsa = n == null ? undefined : Math.max(1, Math.floor(n))
  return { ...s, items: (s.items || []).map((i) => (i.vid === vid ? { ...i, bolsa } : i)) }
}

/**
 * Corrige (o suelta, con `zona = null`) la zona del outfit de un ítem: arriba · abajo · entera.
 *
 * Mismo molde que `asignarBolsa`, con una diferencia que es la regla: 🔑 **soltar la corrección
 * BORRA la clave, ⛔ no la deja en `null`.** Con la clave puesta en null la prenda quedaría
 * «decidida como nada», y lo que se quiere es lo contrario: que vuelva a valer la propuesta del
 * nombre, que mañana puede ser mejor que hoy. Ver `lib/sesionfotos/outfits.ts`.
 */
export function conZona(s: Solicitud, vid: string, zona: ZonaPrenda | null): Solicitud {
  const clasif = { ...(s.clasifOutfits || {}) }
  if (zona == null) delete clasif[vid]
  else clasif[vid] = zona
  if (!Object.keys(clasif).length) {
    const { clasifOutfits: _fuera, ...resto } = s
    return resto as Solicitud
  }
  return { ...s, clasifOutfits: clasif }
}

/** Una bolsa derivada: su número, sus ítems y las unidades totales. */
export type BolsaGrupo = { n: number | null; items: ItemSolicitud[]; totalU: number }

/**
 * Agrupa los ítems por bolsa, ordenadas ascendente; el grupo `n: null` (sin asignar)
 * va al final. Solo devuelve grupos con ítems.
 */
export function bolsasDe(s: Solicitud): BolsaGrupo[] {
  const mapa = new Map<number | null, ItemSolicitud[]>()
  for (const i of s.items || []) {
    const k = typeof i.bolsa === 'number' ? i.bolsa : null
    const arr = mapa.get(k)
    if (arr) arr.push(i)
    else mapa.set(k, [i])
  }
  const nums = [...mapa.keys()].filter((k): k is number => k != null).sort((a, b) => a - b)
  const orden: (number | null)[] = mapa.has(null) ? [...nums, null] : nums
  return orden.map((n) => {
    const items = mapa.get(n) || []
    return { n, items, totalU: items.reduce((a, i) => a + i.qty, 0) }
  })
}

/** La bolsa numerada más alta usada (0 si no hay ninguna). Para sugerir la próxima. */
export function maxBolsa(s: Solicitud): number {
  return (s.items || []).reduce((m, i) => (typeof i.bolsa === 'number' && i.bolsa > m ? i.bolsa : m), 0)
}

/** Cuántas bolsas numeradas distintas hay asignadas. */
export function contarBolsas(s: Solicitud): number {
  return new Set((s.items || []).map((i) => i.bolsa).filter((b): b is number => typeof b === 'number')).size
}

/**
 * Quita un ítem de la solicitud dejando rastro en `eliminados` y en el historial de
 * `cambios` (con quién, cuándo y por qué) y borrando su conteo de verif/devuelto. Port
 * de sfEliminarItem (index.html:9943), + registro del cambio (Fase C).
 */
export function sinItemSol(s: Solicitud, vid: string, datos: DatosEliminacion): Solicitud {
  const it = (s.items || []).find((i) => i.vid === vid)
  if (!it) return s
  const ns: Solicitud = {
    ...s,
    items: s.items.filter((i) => i.vid !== vid),
    eliminados: [
      ...(s.eliminados || []),
      { vid: it.vid, pid: it.pid, nombre: it.nombre, variante: it.variante, sku: it.sku || '', qty: it.qty, origen: it.origen, fecha: datos.fecha, por: datos.por, motivo: datos.motivo },
    ],
  }
  if (s.verif) {
    const verif = { ...s.verif }
    delete verif[vid]
    ns.verif = verif
  }
  if (s.devuelto) {
    const devuelto = { ...s.devuelto }
    delete devuelto[vid]
    ns.devuelto = devuelto
  }
  return registrarCambio(ns, { ts: datos.ts, por: datos.por, accion: 'sacó', detalle: `${it.nombre} · ${it.variante} (${it.qty})`, motivo: datos.motivo })
}
