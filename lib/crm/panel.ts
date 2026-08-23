/**
 * El panel de WhatsApp: traer la ficha de UN cliente y guardar lo que pasó en el contacto.
 *
 * Esta capa es la diferencia entre el panel y la sección Clientes. La sección baja el CRM entero
 * —27.990 ventas, 12.485 clientes, ~6 s— porque muestra una tabla de todos. El panel muestra a
 * uno, se rearma cada vez que se cambia de chat y vive adentro de WhatsApp: bajar todo eso ahí es
 * inviable. Por eso pide la **consulta puntual** de `api/_crm.js` (`action:'panel'`).
 *
 * 🔑 **Lo que NO cambia es el cálculo.** Los totales, el segmento y el resumen de compras salen de
 * `lib/crm/core.ts`, el mismo módulo que usa la ficha grande. Si el panel recalculara por su
 * cuenta, tarde o temprano las dos pantallas dirían números distintos sobre el mismo cliente y no
 * habría forma de saber cuál miente.
 *
 * ⚠️ **El guardado relee el KV justo antes de escribir, y eso es a propósito.**
 * `crm:seg:bdi` se guarda entero en cada POST (ver `lib/kv/cliente.ts`). El panel está pensado para
 * quedarse abierto toda la mañana al costado de WhatsApp, o sea que su copia del mapa envejece
 * horas — y mientras tanto la sección Clientes, en otra pestaña, escribe sobre la misma clave. Con
 * la copia vieja, guardar un contacto acá borraría todo lo que se hizo allá desde que el panel se
 * abrió. Releer cuesta ~100 ms y cierra esa ventana.
 */

import { apiFetch } from '../api-fetch'
import { guardarMapa, leerMapa } from '../kv/cliente'
import { calcularAgregado, resumenCompras, segmentoCliente } from './core'
import type {
  ClienteCRM,
  FilaCliente,
  FilaDetalle,
  FilaVenta,
  MapaSeguimiento,
  ResumenCompras,
  Segmento,
} from './tipos'

/** Cómo se resolvió el número del chat. `cola` es el único que puede estar equivocado. */
export type ViaCruce = 'exacto' | 'cola' | 'id' | ''

export type RespuestaPanel = {
  ok?: boolean
  encontrado?: boolean
  via?: ViaCruce
  cliente?: FilaCliente
  ventas?: FilaVenta[]
  detalles?: FilaDetalle[]
  /** Cuando el teléfono cae en más de un cliente: el panel pregunta en vez de elegir. */
  candidatos?: FilaCliente[]
  error?: string
}

/** La ficha ya calculada, que es lo único que mira el componente. */
export type FichaPanel = {
  cliente: ClienteCRM
  segmento: Segmento
  compras: ResumenCompras
  via: ViaCruce
}

export type ResultadoBusqueda =
  | { estado: 'encontrado'; ficha: FichaPanel; crudo: RespuestaPanel }
  | { estado: 'desconocido' }
  | { estado: 'varios'; candidatos: FilaCliente[] }
  | { estado: 'error'; motivo: string }

/**
 * Le pregunta al servidor por el número del chat (o directamente por un id, cuando el usuario ya
 * eligió entre dos candidatos).
 *
 * Un número desconocido **no es un error**: es el caso más común del día y el que abre el camino
 * de "guardar como lead". Por eso viene con 200 y estado propio.
 */
export async function buscarFicha(
  { tel, clienteId }: { tel?: string; clienteId?: number },
  crmSeg: MapaSeguimiento,
  today: Date,
): Promise<ResultadoBusqueda> {
  let d: RespuestaPanel
  try {
    const r = await apiFetch('/api/datos?recurso=crm', {
      method: 'POST',
      // ⚠️ Sin este header Vercel no parsea el body y el handler ve el teléfono vacío, sin error.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'panel', tel, clienteId }),
    })
    d = (await r.json().catch(() => ({}))) as RespuestaPanel
    if (!r.ok || !d.ok) return { estado: 'error', motivo: d.error || `Error ${r.status} buscando el cliente.` }
  } catch (e) {
    return { estado: 'error', motivo: e instanceof Error ? e.message : String(e) }
  }

  if (d.candidatos && d.candidatos.length > 1) return { estado: 'varios', candidatos: d.candidatos }
  if (!d.encontrado || !d.cliente) return { estado: 'desconocido' }

  // El crudo viaja junto con la ficha —y no se descarta— porque cada guardado de seguimiento
  // obliga a **recalcular** la ficha con el mapa nuevo: el próximo contacto y el estado salen del
  // KV, no del servidor. Sin esto, el panel tendría que volver a pedirle al servidor lo mismo que
  // ya tiene en memoria después de cada clic.
  return { estado: 'encontrado', ficha: armarFicha(d, crmSeg, today), crudo: d }
}

/**
 * De la respuesta cruda a la ficha, con `calcularAgregado` — el mismo agregado de la sección,
 * corrido sobre un cliente solo.
 *
 * ⚠️ **Se toma también de `descartados`.** Un cliente marcado como descartado sale de la tabla del
 * CRM a propósito, pero si te está escribiendo por WhatsApp **existe**: mostrarlo como desconocido
 * y ofrecer cargarlo de nuevo como lead sería duplicarlo.
 */
export function armarFicha(d: RespuestaPanel, crmSeg: MapaSeguimiento, today: Date): FichaPanel {
  const cliente = d.cliente as FilaCliente
  const ventas = d.ventas || []
  const detalles = d.detalles || []

  const { activos, descartados } = calcularAgregado({
    ventas,
    clientes: { [cliente.id]: cliente },
    crmSeg,
    // El panel no usa el override de teléfonos para ARMAR la ficha: el teléfono con el que se
    // llegó hasta acá es el del chat, que es el bueno por definición.
    crmTelOverride: {},
    today,
  })

  // Un cliente sin ninguna venta no entra al agregado (se arma desde las ventas). Es real: una
  // ficha cargada en Gestión Nube que todavía no compró. Se dibuja igual, en cero.
  const agregado: ClienteCRM = activos[0] ||
    descartados[0] || {
      id: cliente.id,
      name: cliente.name || '',
      email: cliente.email || '',
      phone: cliente.phone || '',
      city: cliente.city || '',
      province: cliente.province || '',
      first_sale: null,
      last_sale: null,
      dias_ultimo: null,
      dias_primero: null,
      total_sales: 0,
      total_amount: 0,
      avg_ticket: 0,
      ventas: [],
      cadencia: '',
      ultimo_contacto: null,
      proximo_contacto: null,
      seg_estado: 'none',
      dias_proximo: null,
      notas: [],
      en_difusion: false,
      temperatura: 'templado',
    }

  return {
    cliente: agregado,
    segmento: segmentoCliente(agregado),
    compras: resumenCompras(ventas, detalles),
    via: d.via || '',
  }
}

export type GuardadoSeg =
  | { ok: true; mapa: MapaSeguimiento }
  | { ok: false; motivo: string }

/**
 * Guarda un cambio de seguimiento releyendo el mapa primero.
 *
 * `patch` recibe el mapa **recién leído** y devuelve el mapa nuevo. Se pasa como función y no como
 * objeto ya armado por la misma razón por la que se relee: si el llamador armara el mapa nuevo con
 * su copia vieja, releer no serviría de nada.
 *
 * Si la lectura falla no se escribe: es la regla de `lib/kv/cliente.ts`, y acá pesa más que en
 * ningún lado —el panel es la pantalla que más veces por día toca esta clave—.
 */
export async function guardarConRelectura(
  patch: (mapa: MapaSeguimiento) => MapaSeguimiento,
): Promise<GuardadoSeg> {
  const previo = await leerMapa<MapaSeguimiento[string]>('crmseg', 'bdi')
  if (!previo.ok) return { ok: false, motivo: previo.motivo }
  const mapa = patch(previo.dato)
  const r = await guardarMapa({ kind: 'crmseg', store: 'bdi', mapa, cargado: true })
  return r.ok ? { ok: true, mapa } : { ok: false, motivo: r.motivo }
}
