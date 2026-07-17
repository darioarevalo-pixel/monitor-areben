/**
 * Persistencia de la simulación de Fundas. Es **100% localStorage, CERO
 * KV/server** (a diferencia del CRM): acá no hay endpoint.
 *
 * Dos correcciones críticas respecto del legacy (index.html:4819-4897):
 *
 * 1. **Namespace en sombra.** Mientras Fundas vive en `/fundas-modelo/next`, las
 *    claves llevan `next_` (`monitor_sim_next_bdi`), NO las reales. El editor se
 *    guarda en cada tecla; un tester jugando en la sombra con las claves reales
 *    pisaría un pedido guardado del equipo, y el flip de 1 línea NO restaura
 *    localStorage. Las claves reales se adoptan recién en el flip (Paso 5).
 *
 * 2. **NO evictar `monitor_v*`.** El legacy, ante `QuotaExceededError`, borraba
 *    las claves `monitor_v*` y reintentaba (4824-4832). Pero `monitor_v4_<marca>`
 *    es el caché ETL COMPARTIDO con el iframe/store: nukearlo corrompe todas las
 *    secciones del iframe. Acá la escritura simplemente falla y el caller avisa;
 *    las fotos (la fuente de la cuota) migran a Blob después del flip.
 */

import type { SimBloque, SimEstado } from './tipos'

const PREFIJO_SIM = 'monitor_sim_'
const PREFIJO_PEDIDOS = 'monitor_pedidos_'

/** La clave del editor. En sombra lleva `next_` para no pisar la real del equipo. */
export function claveSim(marca: string, sombra: boolean): string {
  return PREFIJO_SIM + (sombra ? 'next_' : '') + marca
}

/** La clave de los pedidos guardados. Idem: `next_` en sombra. */
export function clavePedidos(marca: string, sombra: boolean): string {
  return PREFIJO_PEDIDOS + (sombra ? 'next_' : '') + marca
}

/**
 * Escribe en localStorage SIN tocar `monitor_v*`. Devuelve false si el navegador
 * rechazó la escritura (cuota llena); el caller decide qué avisar. Nunca sacrifica
 * el caché compartido para salvar un pedido.
 */
export function guardarLS(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function leerLS(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function guardarEstado(marca: string, sombra: boolean, estado: SimEstado): boolean {
  return guardarLS(claveSim(marca, sombra), JSON.stringify(estado))
}

export function leerEstado(marca: string, sombra: boolean): SimEstado | null {
  const raw = leerLS(claveSim(marca, sombra))
  if (!raw) return null
  try {
    const s = JSON.parse(raw)
    return {
      rows: Array.isArray(s.rows) ? s.rows : [],
      vars: Array.isArray(s.vars) ? s.vars : [],
      varOn: !!s.varOn,
      total: typeof s.total === 'string' ? s.total : String(s.total ?? '100'),
      img: s.img || null,
      editando: s.editando || null,
    }
  } catch {
    return null // dato corrupto, ignorar (como el legacy, 4863)
  }
}

export function guardarPedidos(marca: string, sombra: boolean, pedidos: SimBloque[]): boolean {
  return guardarLS(clavePedidos(marca, sombra), JSON.stringify(pedidos))
}

export function leerPedidos(marca: string, sombra: boolean): SimBloque[] {
  const raw = leerLS(clavePedidos(marca, sombra))
  if (!raw) return []
  try {
    return JSON.parse(raw) || []
  } catch {
    return []
  }
}
