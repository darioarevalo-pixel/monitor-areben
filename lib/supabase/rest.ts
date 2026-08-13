/**
 * Acceso REST a Supabase. Port de sbFetch / sbFetchWithCount / fetchAll
 * (index.html:1943-1985).
 *
 * Dos cambios de forma respecto del legacy, ninguno de comportamiento:
 *
 *  - La cuenta viaja por parámetro en vez de leerse del global `currentCuenta`.
 *    Era el acoplamiento principal de toda la capa de datos: con esto, cambiar de
 *    marca deja de ser mutar una variable que medio archivo lee de refilón.
 *  - `fetchAll` no llama a setStatus (que tocaba el DOM). Reporta por callback.
 *
 * **Va contra Supabase desde el cliente, con la anon key, a propósito.** Moverlo a
 * un route handler hoy no agrega seguridad — la anon key ya es pública (ver
 * lib/cuentas.ts) — y rompería el caché compartido con el iframe. Tiene sentido
 * recién después de RLS (Fase S).
 */

import type { Cuenta } from '../cuentas'

function headers(cuenta: Cuenta, conCount = false): HeadersInit {
  const h: Record<string, string> = {
    apikey: cuenta.key,
    Authorization: 'Bearer ' + cuenta.key,
  }
  if (conCount) h['Prefer'] = 'count=exact'
  return h
}

/**
 * Techo por página. Ninguna de estas consultas tenía uno.
 *
 * 🔑 **Sin timeout, una página que no vuelve nunca deja la pantalla en "cargando" para siempre.**
 * No es hipotético: la API de Supabase corta `ventas` por statement timeout de forma intermitente
 * (el CI tuvo que ponerle tres reintentos por eso, `ci.yml`) y ahí sí contesta — pero una conexión
 * que se cuelga a mitad, un túnel que muere o un celular que cambia de red no contestan nunca, y
 * `fetch` espera sin límite. El store se queda en `'cargando'` y no hay forma de salir salvo
 * recargar, sin ningún mensaje que diga qué pasó.
 *
 * 45 s es holgado a propósito: la página más pesada (`venta_detalles`, 1.000 filas) tarda unos
 * pocos segundos con la base sana, así que esto sólo se dispara cuando algo está roto de verdad.
 */
const TIMEOUT_MS = 45_000

async function pedir(cuenta: Cuenta, table: string, params: string, conCount = false): Promise<Response> {
  const corte = AbortSignal.timeout(TIMEOUT_MS)
  try {
    return await fetch(`${cuenta.url}/rest/v1/${table}?${params}`, { headers: headers(cuenta, conCount), signal: corte })
  } catch (e) {
    // El error de un abort dice "The operation was aborted", que no le sirve a nadie. Se traduce
    // acá y no en la pantalla para que las ~30 secciones que muestran este mensaje digan lo mismo.
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new Error(`La consulta de ${table} tardó más de ${TIMEOUT_MS / 1000} segundos y se cortó. Probá recargar.`)
    }
    throw e
  }
}

export async function sbFetch<T = unknown>(cuenta: Cuenta, table: string, params: string): Promise<T[]> {
  const res = await pedir(cuenta, table, params)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Error ${res.status} en ${table}: ${text.substring(0, 150)}`)
  }
  return res.json()
}

export async function sbFetchWithCount<T = unknown>(
  cuenta: Cuenta,
  table: string,
  params: string,
): Promise<{ data: T[]; total: number }> {
  const res = await pedir(cuenta, table, params, true)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Error ${res.status} en ${table}: ${text.substring(0, 150)}`)
  }
  const range = res.headers.get('Content-Range') || ''
  const total = parseInt(range.split('/')[1] || '0', 10)
  const data = await res.json()
  return { data, total }
}

const BATCH_SIZE = 1000

/**
 * Cuántas páginas se piden a la vez.
 *
 * 🔑 **Es el techo que faltaba.** Hasta el 13-ago-2026 esto disparaba TODAS las páginas de una,
 * "igual que el legacy", con un comentario que decía: *"si algún día son cientos, acá va el
 * límite"*. Ese día llega solo, porque el piso de la ventana de ventas es un `'2025-01-01'` fijo
 * (`lib/datos.ts:67`) y el payload crece aunque no se venda más.
 *
 * Con ~100.000 filas de `venta_detalles` son 100 páginas. El browser igual encola de a ~6 por
 * host, así que el problema nunca fue la red: es que las 100 respuestas quedaban **todas vivas en
 * memoria** hasta el `concat` final, o sea un pico de ~2x el payload. Al triple de ventas eso son
 * ~90 MB de pico sólo para bajar, y Safari en iOS mata la pestaña bastante antes.
 *
 * De a 6 el pico deja de escalar con el total, y el tiempo de pared casi no cambia porque 6 es
 * más o menos lo que el navegador iba a dejar en vuelo de todos modos.
 */
const MAX_EN_VUELO = 6

/**
 * Trae una tabla entera paginando de a 1000.
 *
 * Pide la primera página con `count=exact` para saber el total y, si hace falta más de una, trae
 * el resto en tandas de `MAX_EN_VUELO`.
 */
export async function fetchAll<T = unknown>(
  cuenta: Cuenta,
  table: string,
  baseParams: string,
  onProgress?: (label: string) => void,
  label?: string,
): Promise<T[]> {
  const { data: first, total } = await sbFetchWithCount<T>(cuenta, table, `${baseParams}&limit=${BATCH_SIZE}&offset=0`)
  if (onProgress && label) onProgress(label)
  if (first.length >= total || first.length < BATCH_SIZE) return first

  const offsets: number[] = []
  for (let off = BATCH_SIZE; off < total; off += BATCH_SIZE) offsets.push(off)

  // Se acumula sobre el mismo array en vez de juntar un array de arrays y aplastarlo al final:
  // `first.concat(...pages)` con cientos de páginas además desarma el spread en argumentos.
  const out = first
  for (let i = 0; i < offsets.length; i += MAX_EN_VUELO) {
    const tanda = await Promise.all(
      offsets
        .slice(i, i + MAX_EN_VUELO)
        .map((off) => sbFetch<T>(cuenta, table, `${baseParams}&limit=${BATCH_SIZE}&offset=${off}`)),
    )
    for (const pagina of tanda) out.push(...pagina)
  }
  return out
}
