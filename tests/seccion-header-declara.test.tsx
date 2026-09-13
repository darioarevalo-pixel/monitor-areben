import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { declaracionDe } from '@/lib/secciones-declaracion'

/**
 * **Que la declaración se USE en el encabezado, ⛔ no que exista en un mapa.**
 *
 * El test de al lado (`seccion-declara`) obliga a que el texto esté escrito; éste obliga a que la
 * pantalla lo pase al popover. Son dos fallas distintas y la segunda es la que ya pasó: los 62
 * textos estaban escritos desde siempre y ⛔ no se veían en ninguna sección — sólo en `/usuarios`,
 * cuando un admin reparte permisos.
 *
 * ⚠️ **Por qué el `InfoPopover` se mockea en vez de mirar el HTML**: el de verdad monta su panel
 * recién al abrirlo, y por un portal ⇒ el texto ⛔ NO está en el markup del servidor. Un test que
 * buscara el párrafo en el HTML pasaría a verde el día que el componente le pase `undefined` al
 * popover. Acá se captura lo que el encabezado LE ENTREGA, que es la decisión que se quiere fijar.
 */

const ruta = { v: ['productos'] as string[] }
vi.mock('next/navigation', () => ({ useParams: () => ({ seccion: ruta.v }) }))
vi.mock('@/components/layout/acciones', () => ({ useRegistrarSlot: () => undefined }))
vi.mock('@/components/layout/AyudaDeSeccion', () => ({ AyudaDeSeccion: () => null }))
vi.mock('@/components/ui/InfoPopover', () => ({
  InfoPopover: ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
    <i data-info={titulo}>{children}</i>
  ),
}))

const { SeccionHeader } = await import('@/components/layout/SeccionHeader')
const pintar = (seccion: string, partes = [seccion]) => {
  ruta.v = partes
  return renderToStaticMarkup(<SeccionHeader seccion={seccion} />)
}

describe('el encabezado publica la declaración de la sección', () => {
  it('le entrega al ⓘ el texto largo de la sección', () => {
    const html = pintar('productos')
    expect(html).toContain('data-info="Qué hace y qué escribe"')
    const larga = declaracionDe('productos') ?? ''
    expect(larga.trim().length).toBeGreaterThan(40)
    expect(html).toContain(larga.slice(0, 30))
  })

  it('en una sección que sólo mira, el texto dice que ⛔ no escribe', () => {
    expect(pintar('resumen')).toMatch(/No escribe nada/i)
  })

  it('⛔ NO dibuja el ⓘ en una ZONA: ahí el encabezado es de la zona, ⛔ no de la sección', () => {
    // Es la misma regla que arregló «Producir explicaba Rendimiento» el 30-ago-2026: una sección
    // puede ser varias pantallas, y la declaración es de la sección entera.
    const html = pintar('meta-ads', ['meta-ads', 'producir'])
    expect(html).not.toContain('data-info=')
  })
})
