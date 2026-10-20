import { apiFetch } from '../api-fetch'
import { cola } from './telefono.core.js'
import { leEscribisteHoy, type EscritosHoy } from './escritos'

/**
 * «Pidieron hoy y ayer» — los pedidos y carritos del catálogo, arriba de «Hoy» en el panel (Darío,
 * 20-oct-2026: «que vea los pedidos del día así me comunico si no me habla»).
 *
 * 🔑 **Salen del catálogo y no de Gestión Nube.** Las ventas de GN llegan al Monitor una vez por
 * día, así que un pedido de hoy no estaría. El catálogo guarda cada pedido con el teléfono que
 * escribe el cliente, en el momento en que lo confirma.
 *
 * ⛔ El catálogo contesta sólo a administradores (son teléfonos de clientes). A cualquier otro le
 * da 403 y el grupo no se dibuja.
 */
const API = 'https://bdi-catalogo.vercel.app/api/pedido?panel=1'

export type PedidoCatalogo = { fecha: string; cliente: string; telefono: string; total: number; unidades: number }

export type DatosCatalogo = { pedidos: PedidoCatalogo[]; carritos: PedidoCatalogo[] }

export type ResultadoCatalogo = { t: 'ok'; datos: DatosCatalogo } | { t: 'sin-permiso' } | { t: 'error'; motivo: string }

export async function traerPedidosCatalogo(): Promise<ResultadoCatalogo> {
  try {
    const r = await apiFetch(API)
    if (r.status === 401 || r.status === 403) return { t: 'sin-permiso' }
    const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<DatosCatalogo>
    if (!r.ok || !d.ok) return { t: 'error', motivo: d.error || `Error ${r.status} trayendo los pedidos.` }
    return { t: 'ok', datos: { pedidos: d.pedidos || [], carritos: d.carritos || [] } }
  } catch (e) {
    return { t: 'error', motivo: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Cuándo fue tu último mensaje en cada chat, desde ayer a las 00:00 (últimos 8 dígitos → segundos).
 * Lo manda la extensión desde la 0.10.0; con una anterior llega `null` y se usa «le escribiste hoy».
 */
export type UltimosMios = Map<string, number>

export type FilaPedido = PedidoCatalogo & { key: string; carrito: boolean; hablado: boolean; ayer: boolean }

/**
 * ¿Le escribiste DESPUÉS del pedido? Con la hora de tu último mensaje se compara contra la del
 * pedido: un pedido de anoche al que ya le contestaste anoche no tiene que figurar «Sin hablar».
 */
export function yaLeEscribiste(p: PedidoCatalogo, ultimos: UltimosMios | null, escritos: EscritosHoy): boolean {
  if (ultimos) {
    const t = ultimos.get(cola(p.telefono))
    return !!t && t * 1000 >= Date.parse(p.fecha)
  }
  return leEscribisteHoy(escritos, [p.telefono])
}

/** Los sin hablar arriba; adentro, el más nuevo primero. */
export function armarFilasPedidos(lista: PedidoCatalogo[], carrito: boolean, today: Date, ultimos: UltimosMios | null, escritos: EscritosHoy): FilaPedido[] {
  const inicioHoy = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return lista
    .map((p, i) => ({
      ...p,
      key: `${carrito ? 'c' : 'p'}:${i}:${p.fecha}`,
      carrito,
      hablado: yaLeEscribiste(p, ultimos, escritos),
      ayer: Date.parse(p.fecha) < inicioHoy,
    }))
    .sort((a, b) => Number(a.hablado) - Number(b.hablado) || b.fecha.localeCompare(a.fecha))
}
