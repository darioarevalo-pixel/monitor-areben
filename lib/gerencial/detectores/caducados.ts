/**
 * Detector de stock a depurar (área stock): productos sin stock y con la última venta
 * hace más de N días — candidatos a dar de baja en TN/GN.
 *
 * Deriva del ETL (`stock`, `lastSale`, `daysSinceLast` por producto) en vez de la
 * consulta dedicada de la sección Caducados: es un aviso barato, no la lista fina. Por
 * eso replica el criterio de `lib/caducados.candidatos` (sin stock + con una última
 * venta anterior al corte), pero mira solo la ventana de ventas que ya cargó el ETL —
 * la baja real se hace en la sección Caducados, con su ventana ancha (~2 años).
 */

import type { Marca } from '@/lib/nav.generated'
import type { Producto } from '@/lib/etl/tipos'
import type { Accionable } from '../tipos'
import type { Umbrales } from '../umbrales'

function ejemplos(nombres: string[], n = 3): string {
  const top = nombres.slice(0, n)
  const resto = nombres.length - top.length
  return top.join(', ') + (resto > 0 ? ` y ${resto} más` : '')
}

export function detectarCaducados(marca: Marca, productos: Producto[], u: Umbrales): Accionable[] {
  const cads = productos.filter(
    (p) => p.stock === 0 && p.lastSale != null && p.daysSinceLast >= u.caducadosDias,
  )
  if (!cads.length) return []
  return [
    {
      id: `stock:caducados:${marca}`,
      area: 'stock',
      severidad: 'oportunidad',
      marca,
      titulo: `${cads.length} producto(s) para depurar`,
      detalle: `Sin stock y sin ventas hace +${u.caducadosDias} días. Ej.: ${ejemplos(cads.map((p) => p.name))}.`,
      recomendacion: 'Verificar y dar de baja en TiendaNube y Gestión Nube para limpiar el catálogo.',
      valor: cads.length,
      acciones: [{ tipo: 'link', seccion: 'caducados', label: 'Ver caducados' }],
    },
  ]
}
