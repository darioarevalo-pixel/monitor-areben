/**
 * Detector de precios (área comercial): productos vendidos por debajo del objetivo de
 * markup (margen que se está dejando) o muy por encima (posible freno de ventas).
 * Envuelve `computarFilas`/`desfase` de `lib/margenes` — no recalcula precios.
 * Recibe las filas ya computadas (el hook resuelve el índice de TiendaNube por marca).
 */

import type { Marca } from '@/lib/nav.generated'
import type { FilaMargen } from '@/lib/margenes'
import type { Accionable } from '../tipos'
import type { Umbrales } from '../umbrales'

function ejemplos(nombres: string[], n = 3): string {
  const top = nombres.slice(0, n)
  const resto = nombres.length - top.length
  return top.join(', ') + (resto > 0 ? ` y ${resto} más` : '')
}

export function detectarPrecios(marca: Marca, filas: FilaMargen[], u: Umbrales): Accionable[] {
  const out: Accionable[] = []

  // 1. Subprecio: markup por debajo del objetivo → se está dejando margen.
  const abajo = filas
    .filter((f) => f.desfase < -u.precioAbajoPts)
    .sort((a, b) => a.desfase - b.desfase)
  if (abajo.length) {
    out.push({
      id: `comercial:precio-bajo:${marca}`,
      area: 'comercial',
      severidad: 'atencion',
      marca,
      titulo: `${abajo.length} producto(s) por debajo del objetivo de margen`,
      detalle: `Se está dejando margen. Ej.: ${ejemplos(abajo.map((f) => f.p.name))}.`,
      recomendacion: 'Revisar precios: subir hacia el objetivo salvo que sea una promo buscada.',
      valor: abajo.length,
      acciones: [{ tipo: 'link', seccion: 'margenes', label: 'Ver márgenes' }],
    })
  }

  // 2. Sobreprecio marcado: muy por encima del objetivo → puede estar frenando ventas.
  const arriba = filas
    .filter((f) => f.desfase > u.precioArribaPts)
    .sort((a, b) => b.desfase - a.desfase)
  if (arriba.length) {
    out.push({
      id: `comercial:precio-alto:${marca}`,
      area: 'comercial',
      severidad: 'oportunidad',
      marca,
      titulo: `${arriba.length} producto(s) muy por encima del objetivo de margen`,
      detalle: `Precio agresivo. Ej.: ${ejemplos(arriba.map((f) => f.p.name))}.`,
      recomendacion: 'Chequear si el precio frena la rotación; considerar ajuste o combo.',
      valor: arriba.length,
      acciones: [{ tipo: 'link', seccion: 'margenes', label: 'Ver márgenes' }],
    })
  }

  return out
}
