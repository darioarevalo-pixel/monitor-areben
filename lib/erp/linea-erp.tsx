'use client'

import { createContext, useContext } from 'react'

/**
 * La línea que se mira en el ERP: el selector de abajo a la izquierda ofrece BDI · Zattia · Stunned, pero en el
 * código Stunned es una LÍNEA de Zattia (`docs/lineas.md`): elegirla = marca zattia + línea `stunned`.
 * `''` = sin corte (BDI, que no tiene líneas); las pantallas filtran por esta línea en vez de tener su propio selector.
 */
export type LineaErp = '' | 'zattia' | 'stunned'

const LineaCtx = createContext<LineaErp>('')

export const ProveedorLineaErp = LineaCtx.Provider

export function useLineaErp(): LineaErp {
  return useContext(LineaCtx)
}

// `Erp` se remonta al cambiar de sección: la línea elegida vive acá, fuera del componente, para que no vuelva sola a Zattia.
let elegida: LineaErp = 'zattia'
export const lineaElegida = (): LineaErp => elegida
export const elegirLinea = (l: LineaErp) => { elegida = l }
