/**
 * Detector comercial: capital parado (stock que no rota) y productos en declive.
 * Envuelve datos que el ETL ya computa por producto (`daysSinceLast`, `phase.label`,
 * `stock`) — no recalcula ventas. Puro y testeable.
 */

import type { DatosETL } from '@/lib/etl/tipos'
import type { Marca } from '@/lib/nav.generated'
import type { Accionable } from '../tipos'
import type { Umbrales } from '../umbrales'

/** "A, B, C y N más" a partir de una lista de nombres, para el detalle de una señal agregada. */
function ejemplos(nombres: string[], n = 3): string {
  const top = nombres.slice(0, n)
  const resto = nombres.length - top.length
  return top.join(', ') + (resto > 0 ? ` y ${resto} más` : '')
}

export function detectarComercial(marca: Marca, etl: DatosETL, u: Umbrales): Accionable[] {
  const out: Accionable[] = []
  const prods = etl.allProductos

  // 1. Capital parado: hay stock pero no se vende hace mucho.
  const parados = prods
    .filter((p) => p.stock > 0 && p.daysSinceLast >= u.sinVentaDias)
    .sort((a, b) => b.stock - a.stock)
  if (parados.length) {
    out.push({
      id: `comercial:sinventa:${marca}`,
      area: 'comercial',
      severidad: parados.length >= u.sinVentaCritico ? 'critico' : 'atencion',
      marca,
      titulo: `${parados.length} producto(s) con stock sin vender hace +${u.sinVentaDias} días`,
      detalle: `Capital inmovilizado. Ej.: ${ejemplos(parados.map((p) => p.name))}.`,
      recomendacion: 'Revisar precio, poner en promo o liquidar para liberar capital.',
      valor: parados.length,
      acciones: [{ tipo: 'link', seccion: 'productos', label: 'Ver productos' }],
    })
  }

  // 2. Productos entrando en declive (fase del ciclo de vida que ya computa el ETL).
  const declive = prods.filter((p) => p.phase.label === 'declive')
  if (declive.length) {
    out.push({
      id: `comercial:declive:${marca}`,
      area: 'comercial',
      severidad: declive.length >= u.decliveCritico ? 'critico' : 'atencion',
      marca,
      titulo: `${declive.length} producto(s) en declive`,
      detalle: `Ventas en caída sostenida. Ej.: ${ejemplos(declive.map((p) => p.name))}.`,
      recomendacion: 'Decidir por cada uno: impulsar (fotos/ads/precio) o discontinuar.',
      valor: declive.length,
      acciones: [{ tipo: 'link', seccion: 'productos', label: 'Ver productos' }],
    })
  }

  return out
}
