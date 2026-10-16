/**
 * **Copia en la compu de lo que todavía no se guardó.**
 *
 * # Por qué (16-oct-2026)
 *
 * A Lorena se le cortó la sesión a mitad de una devolución de una hora: el autoguardado falló
 * («Necesitás estar logueado»), lo escaneado quedó sólo en la memoria de la pestaña y al recargar se
 * perdió todo. Esto es la red: cada cambio que todavía no llegó a la base queda escrito acá, por
 * solicitud, y se borra recién cuando la base confirmó ESE contenido. Si la pestaña se cierra o se
 * recarga en el medio, al volver a abrir la solicitud se ofrece recuperarlo.
 *
 * Va por solicitud (`id`) y no por pantalla, así lo escaneado en la combinada aparece también al
 * abrir la solicitud sola, y al revés.
 *
 * Todo con try/catch: sin almacenamiento (modo incógnito, compu llena) el respaldo simplemente no
 * está, y el resto sigue andando igual que antes.
 */
import type { Solicitud } from './tipos'

const PREFIJO = 'monitor:sf-sin-guardar:'

export type Respaldo = { ts: number; sol: Solicitud }

/** Texto estable de un valor: mismas claves en el mismo orden, venga de donde venga. */
function estable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(estable).join(',') + ']'
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return (
      '{' +
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + estable(o[k]))
        .join(',') +
      '}'
    )
  }
  return JSON.stringify(v ?? null)
}

/**
 * ¿Son la misma solicitud? 🔑 Se compara con claves ordenadas porque la base devuelve el JSON con
 * otro orden que el que se mandó: comparar el texto crudo diría «distinto» siempre.
 */
export function mismaSolicitud(a: Solicitud, b: Solicitud): boolean {
  return estable(a) === estable(b)
}

export function guardarRespaldo(sol: Solicitud, ts = Date.now()): void {
  try {
    localStorage.setItem(PREFIJO + sol.id, JSON.stringify({ ts, sol } satisfies Respaldo))
  } catch {}
}

export function leerRespaldo(id: string): Respaldo | null {
  try {
    const raw = localStorage.getItem(PREFIJO + id)
    if (!raw) return null
    const r = JSON.parse(raw) as Respaldo
    return r && r.sol && r.sol.id === id ? r : null
  } catch {
    return null
  }
}

export function eliminarRespaldo(id: string): void {
  try {
    localStorage.removeItem(PREFIJO + id)
  } catch {}
}

/**
 * Borra el respaldo **sólo si es exactamente lo que se acaba de guardar**. Si mientras volvía la
 * respuesta se escaneó otra prenda, el respaldo ya tiene más que lo guardado y tiene que quedar.
 */
export function eliminarRespaldoSiIgual(sol: Solicitud): void {
  const r = leerRespaldo(sol.id)
  if (r && mismaSolicitud(r.sol, sol)) eliminarRespaldo(sol.id)
}

/**
 * Qué hay en la compu para estas solicitudes al abrirlas.
 *
 * - `distintos`: traen algo que la solicitud abierta no tiene → se ofrece recuperarlos.
 * - `iguales`: hay respaldo y coincide con lo abierto. 🔴 **Eso NO prueba que se haya guardado**: si
 *   el guardado falló, la lista en memoria ya tenía el cambio (se aplica antes de mandarlo), así que
 *   tocar «Volver» y abrir otra vez la solicitud muestra lo escaneado aunque la base no lo tenga.
 *   Por eso no se limpia acá: la pantalla lo vuelve a mandar al abrir, y se limpia cuando la base
 *   lo confirma. Si ya estaba guardado, ese envío no escribe nada (va sólo lo que cambió).
 */
export function clasificarRespaldos(sols: Solicitud[]): { distintos: Respaldo[]; iguales: boolean } {
  const distintos: Respaldo[] = []
  let iguales = false
  for (const s of sols) {
    const r = leerRespaldo(s.id)
    if (!r) continue
    if (mismaSolicitud(r.sol, s)) iguales = true
    else distintos.push(r)
  }
  return { distintos, iguales }
}
