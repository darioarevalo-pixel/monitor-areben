'use client'

import { createContext, useContext } from 'react'
import { lineaDe } from '@/lib/lineas.core.js'

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

/**
 * La tienda del selector del menú: `bdi`, `zattia` o `stunned`. 🔑 Adentro de una marca ⛔ hay opciones de otra (Bruno,
 * 28-oct: «si estoy en Stunned, lo de adentro tiene que ser de Stunned»): las pantallas toman ESTO, ⛔ un selector propio.
 */
export function useTiendaErp(): 'bdi' | 'zattia' | 'stunned' {
  const l = useContext(LineaCtx)
  return l === '' ? 'bdi' : l
}

/**
 * El buscador de productos lee la base de Zattia, que trae las DOS líneas: se queda con las de la tienda elegida (`lineaDe`:
 * el prefijo `STU`). Sin esto, un ajuste o una transferencia de Stunned aceptaba un producto de Zattia (visto 30-oct).
 */
export function deLaTienda<T extends { sku: string | null }>(variantes: T[], tienda: 'bdi' | 'zattia' | 'stunned'): T[] {
  return tienda === 'bdi' ? variantes : variantes.filter((v) => lineaDe('zattia', v.sku) === tienda)
}

// `Erp` se remonta al cambiar de sección: la línea elegida vive acá, fuera del componente, para que no vuelva sola a Zattia.
// Y se guarda en el navegador: al recargar la página volvía a Zattia (Bruno, 29-oct). Sin `localStorage`, la de siempre.
const CLAVE = 'erp:linea'
let elegida: LineaErp | null = null
export function lineaElegida(): LineaErp {
  if (elegida) return elegida
  if (typeof window === 'undefined') return 'zattia'
  try { elegida = window.localStorage.getItem(CLAVE) === 'stunned' ? 'stunned' : 'zattia' } catch { elegida = 'zattia' }
  return elegida
}
export const elegirLinea = (l: LineaErp) => {
  elegida = l
  try { window.localStorage.setItem(CLAVE, l) } catch { /* sin almacenamiento: dura hasta recargar */ }
}
