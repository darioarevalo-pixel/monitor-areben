// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { DecidirReclamo } from '@/components/reclamos/DecidirReclamo'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * 🔴 **La foto es la evidencia con la que se contesta la pregunta que decide, y se veía a 96 px.**
 *
 * En este módulo el escenario —lo que determina la plata en tres de los once casos— se elige
 * mirando lo que cargó el cliente: si la diferencia es objetiva, si la falla deja el producto
 * inútil, qué le mandaron por error. Hasta el 27-ago-2026 lo único que había era un recorte
 * cuadrado de 96 px con `object-fit: cover`, o sea **una miniatura recortada de la prueba**. Una
 * raspadura no se ve ahí. Pedido de Bruno el 27-ago: *«que en la vista de administración se pueda
 * agrandar la foto del producto»*.
 *
 * 🔑 **Este test MONTA el componente de verdad y aprieta el botón**, en vez de mirar el fuente. Es
 * el único de las pantallas del repo que lo hace, y por una razón concreta: `Modal` usa un portal,
 * y `renderToStaticMarkup` —el oráculo que usan `postventa-pantalla.test.tsx` y compañía— tira
 * *«Portals are not currently supported by the server renderer»*. Montar es lo que queda, y de
 * paso es mejor: lo que hay que fijar no es que exista un `<Lightbox>` en el JSX sino que **el
 * click abra la foto entera**, que es lo que la persona hace.
 */

const RECLAMO = {
  id: 42, store: 'bdi', orden_tn: '20700', estado: 'en_revision', motivo: 'falla',
  cliente: 'Ana', items: [{ producto: 'FUNDA X', variante: null, cantidad: 1 }],
  fotos: [{ url: 'https://blob/primera.jpg' }, { url: 'https://blob/segunda.jpg' }],
} as unknown as ReclamoRow

/** Monta el modal en un host limpio y devuelve los botones de ampliar. */
async function abrirDecidir(reclamo: ReclamoRow) {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <DecidirReclamo marca="bdi" reclamo={reclamo} onClose={() => {}} onListo={() => {}} />,
    )
  })
  return [...document.querySelectorAll('button')]
    .filter((b) => /Ampliar la foto/.test(b.getAttribute('aria-label') || ''))
}

const lightbox = () => document.querySelector('.mo-lightbox img')

beforeAll(() => {
  // React exige esta bandera para que `act` no avise en cada render.
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

describe('Decidir — la foto del cliente se puede ver entera', () => {
  it('cada foto es algo que se puede tocar, no una imagen muerta', async () => {
    const botones = await abrirDecidir(RECLAMO)
    // Que sean `<button>` y no `<img onClick>` es lo que hace que se llegue con el teclado y que un
    // lector de pantalla lo anuncie. Y el `aria-label` numerado es lo que las distingue entre sí.
    expect(botones).toHaveLength(2)
    expect(botones[1].getAttribute('aria-label')).toBe('Ampliar la foto 2 de 2')
  })

  it('antes de tocar nada NO hay ninguna foto abierta', async () => {
    await abrirDecidir(RECLAMO)
    // Sin esta aserción, un lightbox que estuviera siempre abierto pasaría el test de abajo.
    expect(lightbox()).toBeNull()
  })

  it('tocar la segunda abre ESA foto a pantalla completa', async () => {
    const botones = await abrirDecidir(RECLAMO)
    await act(async () => { botones[1].click() })
    // La segunda, no la primera: un lightbox que siempre muestra `fotos[0]` es el error fácil acá.
    expect(lightbox()?.getAttribute('src')).toBe('https://blob/segunda.jpg')
  })

  it('un reclamo sin fotos no muestra ningún botón de ampliar', async () => {
    const botones = await abrirDecidir({ ...RECLAMO, fotos: [] } as unknown as ReclamoRow)
    expect(botones).toHaveLength(0)
  })
})
