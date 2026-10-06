/**
 * Eliminar de Tienda Nube lo que la pestaña marcó. Escribe en `bdi-catalogo`
 * (`tn-categorias`, acción `eliminar`), que es donde vive la clave de la tienda.
 *
 * 🔴 Sin vuelta atrás. Los frenos de verdad están del OTRO lado (`bdi-catalogo/api/_tn-eliminar.js`):
 * quién (sólo Darío y Bruno), nombre esperado, sin stock en la tienda y respaldo en el KV antes del
 * DELETE. Acá sólo se arman los lotes: el servidor acepta hasta 10 por pedido.
 */

import { apiFetch } from '@/lib/api-fetch'
import { normNombre } from '@/lib/caducados'
import type { Perfil } from '@/lib/permisos'
import type { Linea } from '@/lib/lineas'

const URL_TN = 'https://bdi-catalogo.vercel.app/api/tn-categorias'
const LOTE = 10

/** El mismo criterio que el servidor, para no mostrar un botón que va a contestar 403. */
export function puedeEliminarTn(perfil: Perfil | null): boolean {
  return !!perfil?.admin && ['BRUNO AREVALO', 'DARIO AREVALO'].includes(normNombre(perfil.name))
}

export type ResultadoEliminar = {
  id: string
  nombre: string
  resultado: 'eliminado' | 'salteado' | 'ya-no-estaba' | 'error'
  motivo?: string
}

/** Por qué no se eliminó, en criollo. */
export function motivoLegible(r: ResultadoEliminar): string {
  switch (r.motivo) {
    case 'tiene-stock':
      return 'tiene stock en la tienda'
    case 'stock-infinito':
      return 'en la tienda no lleva control de stock'
    case 'nombre-distinto':
      return 'en la tienda tiene otro nombre'
    default:
      return r.motivo || r.resultado
  }
}

export async function eliminarDeTn(
  store: Linea,
  items: { id: string; nombre: string }[],
  progreso: (hechos: number) => void,
): Promise<ResultadoEliminar[]> {
  const out: ResultadoEliminar[] = []
  for (let i = 0; i < items.length; i += LOTE) {
    const lote = items.slice(i, i + LOTE)
    const r = await apiFetch(`${URL_TN}?store=${store}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'eliminar', items: lote }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      // Un lote que falla entero no frena el resto, pero queda escrito producto por producto.
      lote.forEach((x) => out.push({ ...x, resultado: 'error', motivo: d.error || `HTTP ${r.status}` }))
    } else {
      out.push(...((d.resultados || []) as ResultadoEliminar[]))
    }
    progreso(Math.min(i + LOTE, items.length))
  }
  return out
}
