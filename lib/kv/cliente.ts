/**
 * El único acceso al KV de bdi-catalogo. Toda lectura y escritura pasa por acá.
 *
 * POR QUÉ ES UN SEAM Y NO UN `fetch` SUELTO
 * -----------------------------------------
 * El mismo endpoint lo usan hoy, cada uno con su propia copia del fetch:
 * ingresos (index.html:3916), sesión de fotos (9666), cupones (10658),
 * solicitudes-internas (10800), verif-ventas (11110), gen-talles (7255) y las 4
 * kinds del CRM. Esta capa la pagan las 23 secciones que faltan migrar, no solo
 * el CRM.
 *
 * LA REGLA QUE ESTE ARCHIVO EXISTE PARA HACER CUMPLIR
 * --------------------------------------------------
 * Cada guardado reescribe el mapa ENTERO. Si la lectura previa falló y el mapa
 * quedó vacío, guardar borra la clave. El servidor no protege: su única guarda es
 * `if (!map || typeof map !== 'object') return 400` y **`{}` es un objeto**
 * (bdi-catalogo/api/ingresos.js:62). Eso ya casi cuesta 305 clientes con 3 semanas
 * de notas y 653 teléfonos, sin backup en ningún lado.
 *
 * Por eso `guardarMapa` **exige el flag `cargado`**: no es un parámetro opcional
 * que se pueda olvidar, es obligatorio y TypeScript no deja llamar sin él. Si
 * alguien escribe una sección nueva contra el KV, se tiene que topar con la
 * pregunta "¿pude leer esto antes de pisarlo?".
 *
 * ⚠️ EL MODO DE FALLA NO ES UNA EXCEPCIÓN. El KV devuelve **500 con JSON válido**
 * (`{error:'KV no configurado'}`, ingresos.js:32), así que `await r.json()` NO
 * tira y un `try/catch` NO lo caza. Hay que mirar `r.ok` Y `d.ok`. Ese fue
 * exactamente el bug: el `catch` del legacy nunca corría.
 *
 * SEGURIDAD (ver A7 en el plan): estas claves **no piden credencial**. Se bajaron
 * los 653 teléfonos de clientes sin autenticarse. No se usa un route handler
 * porque no hay ningún token que esconder — sería cero seguridad y un modo de
 * falla nuevo, y no cerraría nada mientras el iframe le pegue directo. El día que
 * `bdi-catalogo` exija auth, el cambio es este archivo y nada más.
 */

import type { Marca } from '../nav.generated'

const API = 'https://bdi-catalogo.vercel.app/api/ingresos'

/** Las kinds que guardan un objeto `{map}`. */
export type KindMapa = 'crmtel' | 'crmseg' | 'crmleads' | 'talles'
/** `mensajes` es la excepción: guarda un array bajo `{bank}`. */
export type KindBanco = 'mensajes'
/** `cupones` guarda su array bajo `{cupones}` (otra clave más del mismo endpoint). */
export type KindCupones = 'cupones'
/**
 * Kinds que guardan un array bajo `{list}`. `sesionfotos` (historial de retiros
 * para fotos) y `solicitudesinternas` (retiros de uso interno con motivo/aprobación)
 * comparten forma: gemelas en el KV, misma disciplina de `cargado`.
 */
export type KindLista = 'sesionfotos' | 'solicitudesinternas'

/**
 * El resultado de leer. Distingue los tres desenlaces que el legacy mezclaba en
 * uno solo: no se pudo leer / se leyó y no hay nada / se leyó y hay datos.
 * Confundir el primero con el segundo es el bug.
 */
export type Lectura<T> = { ok: true; dato: T } | { ok: false; motivo: string }

export type Escritura = { ok: true; total: number } | { ok: false; motivo: string }

export const MOTIVO_NO_LEIDO =
  'No se pudo leer el KV, así que no se guarda nada: guardar ahora borraría lo que hay.'

async function pedir(url: string, init?: RequestInit): Promise<Lectura<Record<string, unknown>>> {
  try {
    const r = await fetch(url, init)
    let d: Record<string, unknown> | null = null
    try {
      d = (await r.json()) as Record<string, unknown>
    } catch {
      return { ok: false, motivo: `respuesta no-JSON (HTTP ${r.status})` }
    }
    // Los dos chequeos por separado: r.ok no alcanza (el KV manda 500 con JSON
    // válido) y d.ok tampoco (puede venir 200 con ok:false).
    if (!r.ok) return { ok: false, motivo: `HTTP ${r.status}: ${String(d?.error ?? '').slice(0, 120)}` }
    if (!d || d.ok !== true) return { ok: false, motivo: `el servidor respondió ok=false` }
    return { ok: true, dato: d }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Lee un mapa del KV.
 *
 * Un mapa vacío que el servidor confirmó es un ÉXITO, no un fallo: `{ok:true,
 * dato:{}}`. La diferencia con `{ok:false}` es toda la historia de este archivo.
 */
export async function leerMapa<T = unknown>(kind: KindMapa, store: Marca): Promise<Lectura<Record<string, T>>> {
  const r = await pedir(`${API}?kind=${kind}&store=${store}&nc=${Date.now()}`)
  if (!r.ok) return r
  const map = r.dato.map
  return { ok: true, dato: (map && typeof map === 'object' ? map : {}) as Record<string, T> }
}

/**
 * Lee el banco de mensajes. Devuelve `null` cuando la clave no existe — que es el
 * caso NORMAL hoy: `mensajes:bdi` nunca se escribió (verificado con el dump del
 * 17-jul-2026), así que el legacy siempre cae a su semilla. Caer a la semilla con
 * `ok:true` es correcto; hacerlo con `ok:false` sería el bug.
 */
export async function leerBanco<T = unknown>(store: Marca): Promise<Lectura<T[] | null>> {
  const r = await pedir(`${API}?kind=mensajes&store=${store}&nc=${Date.now()}`)
  if (!r.ok) return r
  return { ok: true, dato: Array.isArray(r.dato.bank) ? (r.dato.bank as T[]) : null }
}

/**
 * Lee el historial de Sesión de fotos (`kind=sesionfotos`, forma `{list:[...]}`).
 *
 * A diferencia del banco, la clave `sesionfotos:<marca>` SÍ existe y tiene datos
 * del equipo, así que distinguir "no se pudo leer" de "leí y está vacío" es
 * crítico: guardar tras una lectura fallida borraría el historial entero (es
 * exactamente el modo de falla que este archivo existe para prevenir). Una lista
 * vacía confirmada por el servidor es éxito: `{ok:true, dato:[]}`.
 */
export async function leerLista<T = unknown>(kind: KindLista, store: Marca): Promise<Lectura<T[]>> {
  const r = await pedir(`${API}?kind=${kind}&store=${store}&nc=${Date.now()}`)
  if (!r.ok) return r
  return { ok: true, dato: Array.isArray(r.dato.list) ? (r.dato.list as T[]) : [] }
}

export type OpcionesGuardarLista<T> = {
  kind: KindLista
  store: Marca
  lista: T[]
  /**
   * Igual que en guardarMapa/guardarBanco: obligatorio. El legacy (sfInit, 9821)
   * caía a `sfData=[]` cuando la lectura fallaba y después `sfGuardar` pisaba la
   * clave con esa lista vacía — el bug que casi cuesta 305 clientes, acá aplicado
   * al historial de fotos. Exigir `cargado` lo hace imposible de escribir.
   */
  cargado: boolean
}

export async function guardarLista<T>({ kind, store, lista, cargado }: OpcionesGuardarLista<T>): Promise<Escritura> {
  if (!cargado) return { ok: false, motivo: MOTIVO_NO_LEIDO }
  const r = await pedir(`${API}?kind=${kind}&store=${store}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, list: lista }),
  })
  if (!r.ok) return r
  return { ok: true, total: Number(r.dato.total ?? lista.length) }
}

/**
 * Lee los cupones (`kind=cupones`, forma `{cupones:[...]}`). Igual disciplina que
 * `leerLista`: distinguir "no se pudo leer" de "leí y está vacío" es crítico, porque
 * un guardado tras lectura fallida borraría todos los cupones del local. Array vacío
 * confirmado por el servidor = éxito.
 */
export async function leerCupones<T = unknown>(store: Marca): Promise<Lectura<T[]>> {
  const r = await pedir(`${API}?kind=cupones&store=${store}&nc=${Date.now()}`)
  if (!r.ok) return r
  return { ok: true, dato: Array.isArray(r.dato.cupones) ? (r.dato.cupones as T[]) : [] }
}

export type OpcionesGuardarCupones<T> = {
  store: Marca
  cupones: T[]
  /** Obligatorio, igual que las demás: sin lectura previa, guardar borraría la lista. */
  cargado: boolean
}

export async function guardarCupones<T>({ store, cupones, cargado }: OpcionesGuardarCupones<T>): Promise<Escritura> {
  if (!cargado) return { ok: false, motivo: MOTIVO_NO_LEIDO }
  const r = await pedir(`${API}?kind=cupones&store=${store}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, cupones }),
  })
  if (!r.ok) return r
  return { ok: true, total: Number(r.dato.total ?? cupones.length) }
}

export type OpcionesGuardarMapa<T> = {
  kind: KindMapa
  store: Marca
  mapa: Record<string, T>
  /**
   * ¿La lectura previa de ESTE mapa funcionó?
   *
   * Es obligatorio a propósito. Guardar reescribe la clave entera, así que
   * hacerlo sin haber leído la borra. No se puede llamar a esta función sin
   * contestar la pregunta.
   */
  cargado: boolean
}

export async function guardarMapa<T>({ kind, store, mapa, cargado }: OpcionesGuardarMapa<T>): Promise<Escritura> {
  if (!cargado) return { ok: false, motivo: MOTIVO_NO_LEIDO }
  const r = await pedir(`${API}?kind=${kind}&store=${store}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ map: mapa }),
  })
  if (!r.ok) return r
  return { ok: true, total: Number(r.dato.total ?? Object.keys(mapa).length) }
}

export type OpcionesGuardarBanco<T> = {
  store: Marca
  banco: T[]
  /** Igual que en guardarMapa: obligatorio. `[]` pasa la guarda del servidor (`!Array.isArray`). */
  cargado: boolean
}

export async function guardarBanco<T>({ store, banco, cargado }: OpcionesGuardarBanco<T>): Promise<Escritura> {
  if (!cargado) return { ok: false, motivo: MOTIVO_NO_LEIDO }
  const r = await pedir(`${API}?kind=mensajes&store=${store}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bank: banco }),
  })
  if (!r.ok) return r
  return { ok: true, total: Number(r.dato.total ?? banco.length) }
}
