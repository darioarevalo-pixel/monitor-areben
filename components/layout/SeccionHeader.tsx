'use client'

import { useCallback } from 'react'
import { useParams } from 'next/navigation'
import { categoriaDesde, descripcionDe, tituloDesde, zonaDe } from '@/lib/nav'
import { useRegistrarSlot } from '@/components/layout/acciones'
import { AyudaDeSeccion } from '@/components/layout/AyudaDeSeccion'

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
 *
 * 🔴 **Una sección puede ser VARIAS pantallas, y entonces el encabezado es de la ZONA** (30-ago-2026).
 * Meta tiene cuatro entradas de menú con la misma `key` —comparten permiso— así que las cuatro
 * imprimían el mismo título «Meta» y el mismo párrafo de doce renglones que cuenta la sección
 * entera: Producir explicaba Rendimiento. Ver `ZONAS` en `lib/nav.ts`.
 */
export function SeccionHeader({ seccion, grupo }: { seccion: string; grupo?: string | null }) {
  // `grupo` viene de `?g=`: una sección que cuelga de varios sectores tiene que decir de
  // cuál se entró, con el nombre que le da ESE sector.
  // 🔑 La zona sale del 2º tramo de la RUTA y ⛔ no de un estado: es lo mismo que mira el router de
  // Meta, así que un enlace reproduce el encabezado exacto.
  const partes = useParams().seccion
  const zona = zonaDe(seccion, Array.isArray(partes) ? partes[1] : null)
  const eyebrow = zona ? tituloDesde(seccion, grupo) : categoriaDesde(seccion, grupo)
  const titulo = zona ? zona.titulo : tituloDesde(seccion, grupo)
  const desc = zona ? zona.desc : descripcionDe(seccion)
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
        {/*
          La ayuda de esta pantalla —«Manual de uso» y «Tour virtual»—, si la hay. Va ACÁ y no
          adentro de `seccion-acciones`: ese div es un portal que llenan las secciones, y meterle un
          hijo fijo haría que el orden de los botones dependa de quién montó primero. Cada uno de los
          dos se dibuja sólo si existe.
        */}
        <AyudaDeSeccion seccion={seccion} />
      </div>
      <div className="seccion-acciones" ref={ref} />
    </header>
  )
}
