/**
 * Acceso al endpoint propio `/api/meta-ads` (métricas de Meta Ads). Usa `apiFetch`
 * para mandar el header `x-monitor-auth` (el endpoint exige usuario logueado).
 *
 * Distingue "no se pudo leer" de "se leyó": una respuesta OK con cuentas/anuncios
 * vacíos es un éxito; solo `{ok:false}` significa que ni siquiera se pudo consultar
 * (token faltante, red, etc.).
 */

import { apiFetch } from '../api-fetch'
import type { PedidoAccion, ResultadoAccion } from './acciones'
import type {
  DetalleCuenta, PresetMetaAds, RespuestaConjuntos, RespuestaCreativos, RespuestaDiagnostico,
  RespuestaEtapas, RespuestaOverview,
} from './tipos'

export type Lectura<T> = { ok: true; dato: T } | { ok: false; motivo: string }

export type OpcionesMetaAds =
  | { preset: PresetMetaAds }
  | { since: string; until: string }

function rangoQS(opts: OpcionesMetaAds): URLSearchParams {
  const p = new URLSearchParams()
  if ('since' in opts) {
    p.set('since', opts.since)
    p.set('until', opts.until)
  } else {
    p.set('preset', opts.preset)
  }
  return p
}

async function pedir<T>(qs: URLSearchParams): Promise<Lectura<T>> {
  try {
    const r = await apiFetch(`/api/meta-ads?${qs.toString()}`)
    let d: (T & { ok?: boolean }) | { ok?: boolean; error?: unknown } | null = null
    try {
      d = await r.json()
    } catch {
      return { ok: false, motivo: `respuesta no-JSON (HTTP ${r.status})` }
    }
    if (!r.ok || !d || (d as { ok?: boolean }).ok !== true) {
      const err = (d as { error?: unknown })?.error
      // `detalle` trae el mensaje REAL de Meta (ej. token vencido). El endpoint lo
      // devuelve pero antes se descartaba, así que el error se veía genérico.
      const detalle = (d as { detalle?: unknown })?.detalle
      const extra = detalle ? ` — ${String(detalle).slice(0, 200)}` : ''
      return { ok: false, motivo: `HTTP ${r.status}: ${String(err ?? '').slice(0, 150)}${extra}` }
    }
    return { ok: true, dato: d as T }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/** Overview: las cuentas del token con su total (para el selector). */
export function traerOverview(opts: OpcionesMetaAds): Promise<Lectura<RespuestaOverview>> {
  return pedir<RespuestaOverview>(rangoQS(opts))
}

/** Detalle de una cuenta: totales + campañas/anuncios + serie diaria + placements. */
export function traerDetalleCuenta(accountId: string, opts: OpcionesMetaAds): Promise<Lectura<DetalleCuenta>> {
  const qs = rangoQS(opts)
  qs.set('account', accountId)
  return pedir<DetalleCuenta>(qs)
}

/**
 * Censo de campañas para el diagnóstico de etapas (TOFU/MOFU/BOFU), repartido por línea de pauta.
 *
 * **No lleva marca**: las tres líneas se pautean desde la misma cuenta publicitaria, así que el
 * censo que hay que pedirle a Meta es idéntico para las tres y pedirlo una vez por marca sería
 * triplicar el gasto de Graph para cortar los mismos datos. El servidor devuelve sólo las líneas que
 * el perfil puede ver, así que el corte de permisos sigue siendo suyo, no de la pantalla.
 *
 * La ventana es fija (30 o 90 días, ver `UMBRALES_ETAPA`) y por eso no toma el rango del selector
 * del Resumen.
 */
export function traerEtapas(dias?: number): Promise<Lectura<RespuestaEtapas>> {
  const qs = new URLSearchParams({ recurso: 'etapas' })
  if (dias) qs.set('dias', String(dias))
  return pedir<RespuestaEtapas>(qs)
}

/**
 * Los avisos de UNA campaña, con su creativo: la imagen, el título, el texto y el botón.
 *
 * Va por campaña y a demanda —cuando alguien despliega la fila—, no junto con el censo: son tres
 * llamadas a Graph por campaña, y el censo lista más de 170. La ventana es la misma del censo,
 * porque el gasto de cada aviso se lee al lado del de su campaña y con otra ventana no cerrarían.
 */
export function traerCreativos(campaignId: string, dias?: number): Promise<Lectura<RespuestaCreativos>> {
  const qs = new URLSearchParams({ recurso: 'creativos', campania: campaignId })
  if (dias) qs.set('dias', String(dias))
  return pedir<RespuestaCreativos>(qs)
}

/**
 * ¿El token puede escribir en Meta? Solo admin.
 *
 * Sin `probar` contesta lo que se puede saber sin tocar nada (`user_tasks` por cuenta y los
 * scopes, si Meta los da). Con `probar` hace además una **escritura idempotente** —pisar el
 * nombre de una campaña con el que ya tiene— que es la única forma de distinguir "falta el scope
 * `ads_management`" de "falta el permiso de la cuenta", porque los dos fallan igual desde afuera.
 */
export function traerDiagnostico(probar = false): Promise<Lectura<RespuestaDiagnostico>> {
  const qs = new URLSearchParams({ recurso: 'diagnostico' })
  if (probar) qs.set('probar', '1')
  return pedir<RespuestaDiagnostico>(qs)
}

/**
 * Los conjuntos de UNA campaña, con su presupuesto, su estado y su gasto.
 *
 * A demanda al desplegar la fila, igual que los creativos: el censo lista más de 170 campañas.
 * Es también el modo que dice si la campaña es **CBO** —si tiene el presupuesto a nivel campaña—,
 * que es lo único que no se puede saber mirando el conjunto.
 */
export function traerConjuntos(campaignId: string, dias?: number): Promise<Lectura<RespuestaConjuntos>> {
  const qs = new URLSearchParams({ recurso: 'conjuntos', campania: campaignId })
  if (dias) qs.set('dias', String(dias))
  return pedir<RespuestaConjuntos>(qs)
}

/**
 * **Escribe en Meta.** El único camino de escritura del monitor: pausar/activar y cambiar el
 * presupuesto, a nivel campaña, conjunto o aviso.
 *
 * Lo que se manda es sólo la intención; el servidor lee el objeto, verifica el nivel, resuelve de
 * qué marca es la campaña, chequea el permiso EN ESA MARCA y recién ahí escribe —y después relee
 * para confirmar que quedó puesto—. Ver `api/_meta-acciones.js`.
 *
 * El `idem` va en el pedido y lo genera la pantalla **al apretar el botón** (`nuevoIdem()`): es lo
 * que hace que un doble clic no se convierta en dos escrituras.
 *
 * `sinLinea` en la respuesta de error distingue el 409 de «esta campaña no tiene marca» de
 * cualquier otro rechazo: es el único que se arregla asignándola, y por eso la pantalla le pone un
 * botón en vez de un cartel rojo.
 */
export type FalloAccion = { ok: false; motivo: string; sinLinea?: boolean; campaignId?: string }

export async function accionarMeta(pedido: PedidoAccion): Promise<{ ok: true; dato: ResultadoAccion } | FalloAccion> {
  try {
    const r = await apiFetch('/api/meta-ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
    })
    let d: (Partial<ResultadoAccion> & { ok?: boolean; error?: unknown; detalle?: unknown; sinLinea?: boolean; campaignId?: string }) | null = null
    try {
      d = await r.json()
    } catch {
      return { ok: false, motivo: `respuesta no-JSON (HTTP ${r.status})` }
    }
    if (!r.ok || !d || d.ok !== true) {
      // `detalle` trae el mensaje REAL de Meta (`error_user_msg` cuando lo hay). El error de arriba
      // es el nuestro, en castellano; el de abajo es el que sirve para entender qué pasó allá.
      const extra = d?.detalle ? ` — ${String(d.detalle).slice(0, 200)}` : ''
      return {
        ok: false,
        motivo: `${String(d?.error ?? `HTTP ${r.status}`).slice(0, 200)}${extra}`,
        sinLinea: d?.sinLinea,
        campaignId: d?.campaignId,
      }
    }
    return { ok: true, dato: d as ResultadoAccion }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Pausa o activa un anuncio. Envoltorio de `accionarMeta` para no tocar al llamador del Resumen.
 *
 * ⚠️ Ya **no** es un camino propio: el gate viejo era un booleano global (`.some()` sobre las dos
 * marcas, sin mirar de quién era la campaña) y con las tres líneas en una sola cuenta eso alcanzaba
 * para que alguien de una marca pausara la pauta de otra. Ahora pasa por el mismo guard que el
 * resto, incluido el 409 de «esta campaña todavía no tiene marca».
 */
export async function pausarAnuncio(
  adId: string,
  status: 'ACTIVE' | 'PAUSED',
  idem: string,
): Promise<Lectura<{ status: string }>> {
  const r = await accionarMeta({ accion: 'estado', nivel: 'aviso', objetoId: adId, campos: { status }, idem })
  if (!r.ok) return { ok: false, motivo: r.motivo }
  return { ok: true, dato: { status: String(r.dato.quedo?.status ?? status) } }
}
