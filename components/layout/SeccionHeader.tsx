'use client'

import { useCallback } from 'react'
import { categoriaDe, descripcionDe, tituloLimpio } from '@/lib/nav'
import { useRegistrarSlot } from '@/components/layout/acciones'

/**
 * Encabezado uniforme de cada sección servida por el shell: eyebrow de categoría +
 * título (sin emoji) + descripción curada. Lo inyecta `app/[[...seccion]]/page.tsx`
 * arriba del componente de la sección, así TODA sección lo tiene sin repetir markup.
 *
 * Rediseño jul-2026: además hospeda las ACCIONES. El div de la derecha es el hueco donde
 * cada sección manda su acción principal con `<HeaderAcciones>` (ver `acciones.tsx`), de
 * modo que en las ~40 pantallas el botón importante esté siempre en el mismo lugar.
 *
 * Los datos salen de `lib/nav` (título/categoría del nav + mapa curado de descripciones).
 */
export function SeccionHeader({ seccion }: { seccion: string }) {
  const eyebrow = categoriaDe(seccion)
  const titulo = tituloLimpio(seccion)
  const desc = descripcionDe(seccion)
  const registrar = useRegistrarSlot()

  // Callback ref y no useEffect: publica el nodo en el mismo commit en que existe, y lo
  // desregistra al desmontar (al cambiar de sección) sin dejar un slot muerto apuntando
  // al header viejo.
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      registrar?.(el)
    },
    [registrar],
  )

  return (
    <header className="seccion-header">
      <div className="seccion-header-txt">
        {eyebrow && <div className="seccion-eyebrow">{eyebrow}</div>}
        <h1 className="seccion-titulo">{titulo}</h1>
        {desc && <p className="seccion-desc">{desc}</p>}
      </div>
      <div className="seccion-acciones" ref={ref} />
    </header>
  )
}
