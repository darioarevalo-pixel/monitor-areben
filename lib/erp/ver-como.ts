/**
 * «Ver como» del ERP (Bruno, 9-nov): el Admin elige un rol y ve el menú, los botones y los datos de ese rol, sin poder guardar.
 * 🔑 Vive en el módulo: `Erp` se remonta al cambiar de pestaña. Recargar la página vuelve a Admin.
 * ⛔ No importa nada del ERP: lo lee `lib/api-fetch.ts`, que está debajo de todo.
 */

import { useSyncExternalStore } from 'react'

let rol: string | null = null
const oyentes = new Set<() => void>()

export const rolVisto = () => rol

/** `null` o `'admin'` = volver a Admin. */
export function elegirRolVisto(r: string | null) {
  const nuevo = r === 'admin' ? null : r
  if (nuevo === rol) return
  rol = nuevo
  for (const o of oyentes) o()
}

export function alCambiarRolVisto(o: () => void) {
  oyentes.add(o)
  return () => { oyentes.delete(o) }
}

/** El rol elegido, y la pantalla se redibuja cuando cambia. */
export const useRolVisto = () => useSyncExternalStore(alCambiarRolVisto, rolVisto, () => null)

/** ¿Este navegador está mirando el ERP con otro rol ahora? Afuera de `/erp` nada cambia. */
export const viendoComoEnErp = () => rol !== null && typeof window !== 'undefined' && window.location.pathname.startsWith('/erp')
