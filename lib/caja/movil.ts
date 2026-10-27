import { useSyncExternalStore } from 'react'

/**
 * La vista de CELULAR del POS (Bruno, 27-oct): sólo cambia la presentación, el cobro es el MISMO
 * (`lib/caja/core.core.js`). Se activa con la pantalla chica o con `?movil=1` (para probarla desde la PC);
 * `?movil=0` la apaga aunque la pantalla sea chica. 🔴 **Pantalla chica Y táctil**: una ventana angosta o un zoom
 * del 200 % en la PC del local ⛔ la activan (ahí no imprime el ticket y nadie lo nota hasta que la clienta se va).
 */
export const ANCHO_MOVIL = 640

export function esMovil({ search, ancho, tactil }: { search: string; ancho: number | null; tactil: boolean }): boolean {
  const forzado = new URLSearchParams(search).get('movil')
  if (forzado === '1') return true
  if (forzado === '0') return false
  return tactil && ancho != null && ancho <= ANCHO_MOVIL
}

/** `pointer: coarse` = el dedo es el puntero principal (celular o tablet); el mouse de la PC es `fine`. */
const tactilAhora = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
const leer = () => esMovil({ search: window.location.search, ancho: window.innerWidth, tactil: tactilAhora() })
const oir = (avisar: () => void) => {
  window.addEventListener('resize', avisar)
  return () => window.removeEventListener('resize', avisar)
}

/** En el servidor (y en la primera pintada) es `false`: ahí ⛔ hay pantalla que medir. */
export const useEsMovil = () => useSyncExternalStore(oir, leer, () => false)
