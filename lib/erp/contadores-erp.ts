'use client'

/**
 * Contadores rojos del menú y de las pestañas del ERP (diseño §9: «contador rojo cuando hay algo para hacer»).
 * 🔑 Son los MISMOS números de las listas (`contarVistas` de Stock y Productos, como «Para hacer» de Inicio): ⛔ otra cuenta.
 * `Erp` se remonta al cambiar de sección y de pestaña ⇒ el resultado vive en el módulo, por marca, 2 minutos: si no, cada click releería las listas.
 */

import { useEffect, useState } from 'react'
import { leerListaDeProductos, leerListaDeStock, type MarcaErp } from '@/lib/erp/cliente'
import { contarVistas as vistasDeStock } from '@/lib/erp/stock-lista.core.js'
import { contarVistas as vistasDeProductos } from '@/lib/erp/productos-lista.core.js'

/** `seccion` o `seccion/pestaña` → cuánto hay para hacer (sólo lo que es mayor a 0). */
export type ContadoresErp = Record<string, number>

const VIGENCIA_MS = 2 * 60 * 1000
const guardados = new Map<MarcaErp, { cuando: number; valor: ContadoresErp }>()

/** Lo que cuenta cada lugar: ⛔ se muestra un 0 (sin nada para hacer, no hay contador). */
export const contadoresDe = (neg: number | null | undefined, sinCosto: number | null | undefined): ContadoresErp => {
  const c: ContadoresErp = {}
  if (neg) { c.stock = neg; c['stock/stock'] = neg }
  if (sinCosto) { c.productos = sinCosto; c['productos/productos'] = sinCosto }
  return c
}

export function useContadoresErp(marca: MarcaErp): ContadoresErp {
  const [c, setC] = useState<{ marca: MarcaErp; valor: ContadoresErp } | null>(null)
  useEffect(() => {
    const g = guardados.get(marca)
    if (g && Date.now() - g.cuando < VIGENCIA_MS) return
    let vivo = true
    const parcial: { neg?: number; sinCosto?: number } = {}
    const poner = () => {
      const valor = contadoresDe(parcial.neg, parcial.sinCosto)
      guardados.set(marca, { cuando: Date.now(), valor })
      if (vivo) setC({ marca, valor })
    }
    // Si una lista no se lee, ese contador no aparece (⛔ un número inventado): el menú sigue igual.
    leerListaDeStock(marca).then((d) => { parcial.neg = vistasDeStock(d.filas).neg; poner() }).catch(() => {})
    leerListaDeProductos(marca).then((d) => { parcial.sinCosto = vistasDeProductos(d.filas).sincosto; poner() }).catch(() => {})
    return () => { vivo = false }
  }, [marca])
  // Lo recién leído, o lo guardado de esa marca (al volver de otra sección no se relee): ⛔ el de la otra marca.
  return c?.marca === marca ? c.valor : guardados.get(marca)?.valor ?? {}
}
