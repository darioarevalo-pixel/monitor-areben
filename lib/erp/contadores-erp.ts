'use client'

/**
 * Contadores rojos del menú y de las pestañas del ERP (diseño §9: «contador rojo cuando hay algo para hacer»).
 * 🔑 Son los MISMOS números de las listas (`contarVistas` de Stock y Productos, como «Para hacer» de Inicio): ⛔ otra cuenta.
 * 🔑 Cuentan sobre la MISMA línea que la pantalla a la que llevan (Zattia o Stunned): la pantalla de Stock filtra por línea, y un contador de las dos juntas no cuadraba con su «Negativos».
 * `Erp` se remonta al cambiar de sección y de pestaña ⇒ el resultado vive en el módulo, por marca, 2 minutos: si no, cada click releería las listas.
 */

import { useEffect, useMemo, useState } from 'react'
import { leerListaDeProductos, leerListaDeStock, type MarcaErp } from '@/lib/erp/cliente'
import type { LineaErp } from '@/lib/erp/linea-erp'
import { contarVistas as vistasDeStock, filtrar as filtrarStock } from '@/lib/erp/stock-lista.core.js'
import { contarVistas as vistasDeProductos, filtrar as filtrarProductos } from '@/lib/erp/productos-lista.core.js'

/** `seccion` o `seccion/pestaña` → cuánto hay para hacer (sólo lo que es mayor a 0). */
export type ContadoresErp = Record<string, number>

const VIGENCIA_MS = 2 * 60 * 1000
type Crudo = { filasStock?: Parameters<typeof filtrarStock>[0]; filasProductos?: Parameters<typeof filtrarProductos>[0] }
const guardados = new Map<MarcaErp, { cuando: number; crudo: Crudo }>()

/** Lo que cuenta cada lugar: ⛔ se muestra un 0 (sin nada para hacer, no hay contador). */
export const contadoresDe = (neg: number | null | undefined, sinCosto: number | null | undefined): ContadoresErp => {
  const c: ContadoresErp = {}
  if (neg) { c.stock = neg; c['stock/stock'] = neg }
  if (sinCosto) { c.productos = sinCosto; c['productos/productos'] = sinCosto }
  return c
}

/** Cuenta lo leído sobre una línea (`''` = sin línea, como las marcas que no la tienen): el MISMO `filtrar` + `contarVistas` de las listas. */
export const contar = (crudo: Crudo, linea: LineaErp): ContadoresErp =>
  contadoresDe(
    crudo.filasStock ? vistasDeStock(filtrarStock(crudo.filasStock, { linea })).neg : undefined,
    crudo.filasProductos ? vistasDeProductos(filtrarProductos(crudo.filasProductos, { linea })).sincosto : undefined,
  )

export function useContadoresErp(marca: MarcaErp, linea: LineaErp): ContadoresErp {
  const [c, setC] = useState<{ marca: MarcaErp; crudo: Crudo } | null>(null)
  useEffect(() => {
    const g = guardados.get(marca)
    if (g && Date.now() - g.cuando < VIGENCIA_MS) return
    let vivo = true
    const crudo: Crudo = { ...g?.crudo }
    const poner = () => {
      guardados.set(marca, { cuando: Date.now(), crudo: { ...crudo } })
      if (vivo) setC({ marca, crudo: { ...crudo } })
    }
    // Si una lista no se lee, ese contador no aparece (⛔ un número inventado): el menú sigue igual.
    leerListaDeStock(marca).then((d) => { crudo.filasStock = d.filas; poner() }).catch(() => {})
    // Sin `costos` el servidor ⛔ manda el costo ⇒ ⛔ hay «productos sin costo» que contar: ese contador ⛔ aparece.
    leerListaDeProductos(marca).then((d) => { if (d.costos) { crudo.filasProductos = d.filas; poner() } }).catch(() => {})
    return () => { vivo = false }
  }, [marca])
  // Lo recién leído, o lo guardado de esa marca (al volver de otra sección no se relee): ⛔ el de la otra marca.
  const crudo = c?.marca === marca ? c.crudo : guardados.get(marca)?.crudo
  return useMemo(() => (crudo ? contar(crudo, linea) : {}), [crudo, linea])
}
