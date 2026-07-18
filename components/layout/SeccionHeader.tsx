import { categoriaDe, descripcionDe, tituloLimpio } from '@/lib/nav'

/**
 * Encabezado uniforme de cada sección servida por el shell: eyebrow de categoría +
 * título (sin emoji) + descripción curada. Lo inyecta `app/[[...seccion]]/page.tsx`
 * arriba del componente de la sección, así TODA sección lo tiene sin repetir markup.
 *
 * Es solo identidad (no hospeda acciones): los botones/filtros los pone cada sección
 * en su contenido, debajo. Los datos salen de `lib/nav` (título/categoría del nav +
 * mapa curado de descripciones).
 */
export function SeccionHeader({ seccion }: { seccion: string }) {
  const eyebrow = categoriaDe(seccion)
  const titulo = tituloLimpio(seccion)
  const desc = descripcionDe(seccion)

  return (
    <header className="seccion-header">
      {eyebrow && <div className="seccion-eyebrow">{eyebrow}</div>}
      <h1 className="seccion-titulo">{titulo}</h1>
      {desc && <p className="seccion-desc">{desc}</p>}
    </header>
  )
}
