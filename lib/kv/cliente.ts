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
 * SEGURIDAD: acá adentro viven `crmtel`, `crmseg` y `crmleads` — los teléfonos y el
 * seguimiento de los clientes. Estas claves **no pedían credencial**: se bajaron los 653
 * teléfonos sin autenticarse. Ese día llegó, y como decía este comentario, el cambio de este
 * lado fue un archivo: todo pasa por `apiFetch`, que manda el header `x-monitor-auth`.
 */

import { apiFetch } from '../api-fetch'
import type { Marca } from '../nav.datos'
import { camposAdmin, type Credencial } from '../sesion'

const API = 'https://bdi-catalogo.vercel.app/api/ingresos'

/** Las kinds que guardan un objeto `{map}`. */
export type KindMapa = 'crmtel' | 'crmseg' | 'crmleads' | 'talles'
/** `cupones` guarda su array bajo `{cupones}` (otra clave más del mismo endpoint). */
export type KindCupones = 'cupones'
/** `mensajes` guarda el banco de mensajes del CRM bajo `{bank}` (array de grupos). */
export type KindBanco = 'mensajes'
/** `verifventas` guarda el checklist de anuladas bajo `{resueltas}` (un mapa). */
export type KindResueltas = 'verifventas'
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

/**
 * ═══ LA SEGUNDA GUARDA: "no puede encoger de golpe" ═══
 *
 * `cargado` cubre el caso **"no pude leer"**. No cubre el otro, que es el que quedaba abierto:
 * **"leí bien y vino vacío"**. Si la clave del KV se borrara o venciera del lado del servidor, la
 * lectura sale `{ok:true, dato:{}}` —un éxito legítimo, indistinguible de una clave nueva— y el
 * guardado siguiente escribe un mapa de un solo cliente. Los otros 770 se van, y no hay backup.
 *
 * La guarda es la que haría cualquiera a ojo: **si hace un rato había 771 y ahora se va a guardar
 * con 3, eso no es una edición, es un accidente.** Se anota cuánto se llegó a ver en cada clave y
 * se rechaza la escritura que encoja más de la mitad.
 *
 * Vive acá y no en el CRM porque la clave sin backup no es la única: el historial de fotos, las
 * solicitudes internas, los cupones y el banco de mensajes se guardan igual (la clave entera, de
 * cero, en cada toque).
 *
 * ⚠️ **La cuenta es por pantalla abierta, no global.** Al recargar arranca en cero, y tiene que ser
 * así: una clave que de verdad está vacía —una marca nueva, una sección recién estrenada— tiene que
 * poder escribirse. Lo que la guarda impide es lo otro: que una pantalla que YA vio 771 clientes
 * guarde 3.
 *
 * ⚠️ **No protege de borrar de a uno.** Nadie puede vaciar la lista sin querer de un clic, pero
 * tampoco hay nada que detenga a alguien que borre 400 clientes uno por uno. Para eso está la copia
 * diaria, que es la otra mitad de la red.
 */
const vistas = new Map<string, number>()

/** Debajo de esto no hay nada que proteger: una lista de 5 puede pasar a 2 con toda razón. */
const PISO_VIGILADO = 20

/** Guardar menos de la mitad de lo que se llegó a ver es un accidente, no una edición. */
const FRACCION_MINIMA = 0.5

/** Anota cuánto se vio en una clave. Sólo sube: lo que importa es el máximo que hubo. */
function anotarVistas(clave: string, cantidad: number) {
  vistas.set(clave, Math.max(vistas.get(clave) ?? 0, cantidad))
}

/**
 * ¿Esta escritura encoge la clave de golpe? Devuelve el motivo del rechazo, o `null` si está bien.
 *
 * El mensaje va en las palabras del que lo va a leer en pantalla, no en las del que lo escribió:
 * dice qué pasó, que no se guardó nada y qué hacer.
 */
function motivoSiEncoge(clave: string, cantidad: number): string | null {
  const antes = vistas.get(clave) ?? 0
  if (antes < PISO_VIGILADO) return null
  if (cantidad >= Math.floor(antes * FRACCION_MINIMA)) return null
  return (
    `No se guardó nada: se iba a guardar con ${cantidad} cuando hace un rato había ${antes}. ` +
    `Recargá la pantalla y fijate que estén todos antes de volver a tocar.`
  )
}

export const MOTIVO_NO_LEIDO =
  'No se pudo leer el KV, así que no se guarda nada: guardar ahora eliminaría lo que hay.'

async function pedir(url: string, init?: RequestInit): Promise<Lectura<Record<string, unknown>>> {
  try {
    const r = await apiFetch(url, init)
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
  const map = (r.dato.map && typeof r.dato.map === 'object' ? r.dato.map : {}) as Record<string, T>
  anotarVistas(`${kind}:${store}`, Object.keys(map).length)
  return { ok: true, dato: map }
}

/**
 * Lee el historial de Sesión de fotos (`kind=sesionfotos`, forma `{list:[...]}`).
 *
 * La clave `sesionfotos:<marca>` existe y tiene datos
 * del equipo, así que distinguir "no se pudo leer" de "leí y está vacío" es
 * crítico: guardar tras una lectura fallida borraría el historial entero (es
 * exactamente el modo de falla que este archivo existe para prevenir). Una lista
 * vacía confirmada por el servidor es éxito: `{ok:true, dato:[]}`.
 */
export async function leerLista<T = unknown>(kind: KindLista, store: Marca): Promise<Lectura<T[]>> {
  const r = await pedir(`${API}?kind=${kind}&store=${store}&nc=${Date.now()}`)
  if (!r.ok) return r
  const list = Array.isArray(r.dato.list) ? (r.dato.list as T[]) : []
  anotarVistas(`${kind}:${store}`, list.length)
  return { ok: true, dato: list }
}

export type OpcionesGuardarLista<T> = {
  kind: KindLista
  store: Marca
  lista: T[]
  /**
   * Igual que en guardarMapa: obligatorio. El legacy (sfInit, 9821)
   * caía a `sfData=[]` cuando la lectura fallaba y después `sfGuardar` pisaba la
   * clave con esa lista vacía — el bug que casi cuesta 305 clientes, acá aplicado
   * al historial de fotos. Exigir `cargado` lo hace imposible de escribir.
   */
  cargado: boolean
}

export async function guardarLista<T>({ kind, store, lista, cargado }: OpcionesGuardarLista<T>): Promise<Escritura> {
  if (!cargado) return { ok: false, motivo: MOTIVO_NO_LEIDO }
  const encoge = motivoSiEncoge(`${kind}:${store}`, lista.length)
  if (encoge) return { ok: false, motivo: encoge }
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
  const lista = Array.isArray(r.dato.cupones) ? (r.dato.cupones as T[]) : []
  anotarVistas(`cupones:${store}`, lista.length)
  return { ok: true, dato: lista }
}

export type OpcionesGuardarCupones<T> = {
  store: Marca
  cupones: T[]
  /** Obligatorio, igual que las demás: sin lectura previa, guardar borraría la lista. */
  cargado: boolean
}

export async function guardarCupones<T>({ store, cupones, cargado }: OpcionesGuardarCupones<T>): Promise<Escritura> {
  if (!cargado) return { ok: false, motivo: MOTIVO_NO_LEIDO }
  const encoge = motivoSiEncoge(`cupones:${store}`, cupones.length)
  if (encoge) return { ok: false, motivo: encoge }
  const r = await pedir(`${API}?kind=cupones&store=${store}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, cupones }),
  })
  if (!r.ok) return r
  return { ok: true, total: Number(r.dato.total ?? cupones.length) }
}

/**
 * Lee el banco de mensajes del CRM (`kind=mensajes`, forma `{bank:[...]}`).
 *
 * ⚠️ La clave existe y tiene los 25 mensajes de fábrica, así que el modo de falla es real:
 * la guarda del servidor es `!Array.isArray(bank)` y **`[]` pasa**
 * (bdi-catalogo/api/ingresos.js:118). Un array vacío confirmado por el servidor es éxito;
 * una lectura fallida es otra cosa y bloquea el guardado.
 */
export async function leerBanco<T = unknown>(store: Marca): Promise<Lectura<T[]>> {
  const r = await pedir(`${API}?kind=mensajes&store=${store}&nc=${Date.now()}`)
  if (!r.ok) return r
  const bank = Array.isArray(r.dato.bank) ? (r.dato.bank as T[]) : []
  anotarVistas(`mensajes:${store}`, bank.length)
  return { ok: true, dato: bank }
}

export type OpcionesGuardarBanco<T> = {
  store: Marca
  banco: T[]
  /** Obligatorio: sin lectura previa, guardar deja el banco vacío y no hay backup. */
  cargado: boolean
}

export async function guardarBanco<T>({ store, banco, cargado }: OpcionesGuardarBanco<T>): Promise<Escritura> {
  if (!cargado) return { ok: false, motivo: MOTIVO_NO_LEIDO }
  const encoge = motivoSiEncoge(`mensajes:${store}`, banco.length)
  if (encoge) return { ok: false, motivo: encoge }
  const r = await pedir(`${API}?kind=mensajes&store=${store}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, bank: banco }),
  })
  if (!r.ok) return r
  return { ok: true, total: Number(r.dato.total ?? banco.length) }
}

/**
 * Lee el checklist de "ventas resueltas" (`kind=verifventas`, forma `{resueltas}`, un
 * mapa `tn_order → {resuelto,por,fecha,mes}`). Mapa vacío confirmado = éxito.
 */
export async function leerResueltas<T = unknown>(store: Marca): Promise<Lectura<Record<string, T>>> {
  const r = await pedir(`${API}?kind=verifventas&store=${store}&nc=${Date.now()}`)
  if (!r.ok) return r
  const m = (r.dato.resueltas && typeof r.dato.resueltas === 'object' ? r.dato.resueltas : {}) as Record<string, T>
  anotarVistas(`verifventas:${store}`, Object.keys(m).length)
  return { ok: true, dato: m }
}

export type OpcionesGuardarResueltas<T> = {
  store: Marca
  resueltas: Record<string, T>
  /** Obligatorio: sin lectura previa, guardar borraría el checklist. */
  cargado: boolean
}

export async function guardarResueltas<T>({ store, resueltas, cargado }: OpcionesGuardarResueltas<T>): Promise<Escritura> {
  if (!cargado) return { ok: false, motivo: MOTIVO_NO_LEIDO }
  const encoge = motivoSiEncoge(`verifventas:${store}`, Object.keys(resueltas).length)
  if (encoge) return { ok: false, motivo: encoge }
  const r = await pedir(`${API}?kind=verifventas&store=${store}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, resueltas }),
  })
  if (!r.ok) return r
  return { ok: true, total: Number(r.dato.total ?? Object.keys(resueltas).length) }
}

/**
 * Lee las importaciones proyectadas (la clave DEFAULT del endpoint, sin `kind`,
 * forma `{ingresos:[...]}`). Es el uso original de `api/ingresos`; las demás formas
 * (`{map}`/`{list}`/…) se le agregaron después con `kind`. Misma disciplina: distinguir
 * "no se pudo leer" de "leí y está vacío" es crítico, porque un guardado tras lectura
 * fallida borraría todas las importaciones. Array vacío confirmado = éxito.
 */
export async function leerIngresos<T = unknown>(store: Marca): Promise<Lectura<T[]>> {
  const r = await pedir(`${API}?store=${store}&nc=${Date.now()}`)
  if (!r.ok) return r
  return { ok: true, dato: Array.isArray(r.dato.ingresos) ? (r.dato.ingresos as T[]) : [] }
}

export type OpcionesGuardarIngresos<T> = {
  store: Marca
  ingresos: T[]
  /** El server valida que sea admin (config de usuarios en KV). Port del gate de ingresos.js. */
  cred: Credencial | null
  /** Obligatorio, igual que las demás: sin lectura previa, guardar borraría todo. */
  cargado: boolean
}

/**
 * Guarda las importaciones (solo admins: el server valida la credencial, que puede ser
 * usuario+contraseña o el token del proveedor). `prohibido` distingue el 403 (credencial
 * equivocada) para que el llamador olvide la pass cacheada, como `_olvidarAdminPass`.
 */
export type EscrituraIngresos = { ok: true } | { ok: false; motivo: string; prohibido?: boolean }

export async function guardarIngresos<T>({ store, ingresos, cred, cargado }: OpcionesGuardarIngresos<T>): Promise<EscrituraIngresos> {
  if (!cargado) return { ok: false, motivo: MOTIVO_NO_LEIDO }
  try {
    const r = await apiFetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store, ingresos, ...camposAdmin(cred) }),
    })
    let d: Record<string, unknown> | null = null
    try {
      d = (await r.json()) as Record<string, unknown>
    } catch {
      return { ok: false, motivo: `respuesta no-JSON (HTTP ${r.status})` }
    }
    if (r.status === 403) return { ok: false, motivo: String(d?.error ?? 'no autorizado'), prohibido: true }
    if (!r.ok || d?.ok !== true) return { ok: false, motivo: `HTTP ${r.status}: ${String(d?.error ?? '').slice(0, 120)}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
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
  const encoge = motivoSiEncoge(`${kind}:${store}`, Object.keys(mapa).length)
  if (encoge) return { ok: false, motivo: encoge }
  const r = await pedir(`${API}?kind=${kind}&store=${store}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ map: mapa }),
  })
  if (!r.ok) return r
  return { ok: true, total: Number(r.dato.total ?? Object.keys(mapa).length) }
}

/**
 * Sólo para los tests: la memoria de "cuántos había" es de módulo y se arrastra entre casos.
 * No la usa ninguna pantalla.
 */
export function _olvidarVistas() {
  vistas.clear()
}
