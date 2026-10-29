import { useSyncExternalStore } from 'react'

/**
 * ¿Se dibuja la vista de CELULAR? Una sola regla para las pantallas que tienen una (nació en la Caja, 27-oct; el ERP la
 * reusa desde el 29-oct). `?movil=1` la prende desde la PC para probarla y `?movil=0` la apaga aunque la pantalla sea chica.
 *
 *  - `hasta`: el ancho máximo (en px) que cuenta como celular.
 *  - `pideTactil`: además tiene que ser táctil. La Caja lo pide (una ventana angosta en la PC del local ⛔ puede perder el
 *    ticket); el ERP ⛔: su menú cambia por CSS a los 900 px (`--mo-bp-shell`) y la lista tiene que cambiar con él.
 */
export type ReglaMovil = { hasta: number; pideTactil: boolean }

/** El corte del shell (`--mo-bp-shell` en tokens.css y las `@media (max-width: 900px)` de globals.css). */
export const ANCHO_SHELL = 900

export function esMovilCon(regla: ReglaMovil, { search, ancho, tactil }: { search: string; ancho: number | null; tactil: boolean }): boolean {
  const forzado = new URLSearchParams(search).get('movil')
  if (forzado === '1') return true
  if (forzado === '0') return false
  return (!regla.pideTactil || tactil) && ancho != null && ancho <= regla.hasta
}

/** `pointer: coarse` = el dedo es el puntero principal (celular o tablet); el mouse de la PC es `fine`. */
const tactilAhora = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
const oir = (avisar: () => void) => {
  window.addEventListener('resize', avisar)
  return () => window.removeEventListener('resize', avisar)
}

/** En el servidor (y en la primera pintada) es `false`: ahí ⛔ hay pantalla que medir. */
export function useMovilCon(regla: ReglaMovil): boolean {
  const leer = () => esMovilCon(regla, { search: window.location.search, ancho: window.innerWidth, tactil: tactilAhora() })
  return useSyncExternalStore(oir, leer, () => false)
}

/** La del ERP: pantalla de 900 px o menos, con mouse o con dedo (la misma que pasa el menú abajo). */
export const usePantallaAngosta = () => useMovilCon({ hasta: ANCHO_SHELL, pideTactil: false })
