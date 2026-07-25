'use client'

/**
 * El lugar fijo de la acción principal.
 *
 * Problema que resuelve: `SeccionHeader` lo renderiza el shell (`app/[[...seccion]]/page.tsx`)
 * y el contenido lo renderiza la sección, así que una sección no tenía forma de poner un
 * botón arriba. Resultado: cada pantalla se armaba su propia fila de botones donde le
 * tocaba —a veces sobre la tabla, a veces abajo, a veces adentro de una card— y el botón
 * importante aparecía en un lugar distinto en cada sección.
 *
 * Ahora el header expone un hueco y la sección le manda sus acciones con un portal:
 *
 *   <HeaderAcciones>
 *     <Button variant="solid" tone="brand" onClick={guardar}>Guardar</Button>
 *   </HeaderAcciones>
 *
 * Regla del rediseño: UNA sola acción `solid tone="brand"` por pantalla (la principal),
 * el resto `outline`. Las destructivas van `danger` y con confirmación.
 */
import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'

const SlotCtx = createContext<HTMLElement | null>(null)
const RegistrarCtx = createContext<((el: HTMLElement | null) => void) | null>(null)

export function AccionesProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <RegistrarCtx.Provider value={setSlot}>
      <SlotCtx.Provider value={slot}>{children}</SlotCtx.Provider>
    </RegistrarCtx.Provider>
  )
}

/** Lo usa SeccionHeader para publicar su hueco de acciones. */
export function useRegistrarSlot() {
  return useContext(RegistrarCtx)
}

/**
 * Manda sus hijos al header de la sección. Si el header todavía no montó (o la pantalla
 * no tiene header, como el login), no dibuja nada: nunca deja botones huérfanos.
 */
export function HeaderAcciones({ children }: { children: React.ReactNode }) {
  const slot = useContext(SlotCtx)
  return slot ? createPortal(children, slot) : null
}
