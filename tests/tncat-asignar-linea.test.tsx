// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Linea } from '@/lib/lineas'
import { ponerPuenteAsignar } from '@/lib/tncat/puente'

/**
 * 🔴 **La asignación masiva de categorías escribe en UNA Tienda Nube, y hasta el 7-sep-2026 no
 * podía apuntar a la de Stunned.**
 *
 * El defecto no estaba en ninguna función: `bdi-catalogo/api/tn-categorias.js` conoce
 * `?store=stunned` desde que existe, y `lib/tncat/cliente.ts` ya tipaba el store como `Linea`. Lo
 * que fallaba era **qué argumento le pasaba la pantalla**: la card recibía `marca`
 * (`bdi|zattia`), así que los ingresos de Stunned se cruzaban contra el catálogo de Zattia y
 * volvían todos como «no encontrados» — sin error, sin nada roto, sólo una lista vacía. Es el
 * mismo defecto que `tests/lineas-cableado.test.ts` defiende para los hooks del catálogo.
 *
 * 🔑 **Y el cambio de línea tiene un filo propio**: `matched` son `id` de producto **de la tienda
 * que se cruzó**. Aplicar ese lote con la otra línea elegida escribiría `categories` sobre
 * productos ajenos elegidos por número, en la tienda en vivo, sin nada que lo avise. Por eso el
 * caso caro de este archivo es que al cambiar de línea el botón de aplicar **desaparezca**.
 *
 * ⚠️ Monta de verdad (`createRoot` + `act`) y no con `renderToStaticMarkup` como el resto de los
 * tests de pantalla del repo: lo que se prueba vive en un **efecto** y en un cambio de estado, y
 * el markup del primer cuadro no puede verlos. No hace falta `@testing-library/react` para eso.
 */

const llamadas: { fn: string; store: Linea }[] = []

vi.mock('@/lib/tncat/cliente', () => ({
  traerCategorias: (store: Linea) => {
    llamadas.push({ fn: 'traerCategorias', store })
    // Cada tienda tiene sus categorías, con ids propios: el `77` de Zattia y el de Stunned no son
    // el mismo lugar aunque se llamen igual.
    return Promise.resolve([{ id: store === 'stunned' ? 91 : 77, name: `REMERAS (${store})`, parent: null }])
  },
  previsualizarAsignar: (store: Linea) => {
    llamadas.push({ fn: 'previsualizarAsignar', store })
    return Promise.resolve({
      ok: true, categoria: `REMERAS (${store})`, total: 1,
      matched: [{ id: 1234, nombre: 'REMERA LISA', nuevas: [77] }],
      yaTenian: [], noEncontrados: [], quedanSinCategoria: [],
    })
  },
  aplicarAsignarLote: (store: Linea) => {
    llamadas.push({ fn: 'aplicarAsignarLote', store })
    return Promise.resolve({ ok: true, aplicados: 1, errores: [] })
  },
}))

/** El selector de línea de la card, movido desde el test como lo movería la persona. */
let cambiarLinea: ((l: Linea) => void) | null = null

vi.mock('@/components/fundas/useDatosMonitor', async () => {
  const { useState } = await import('react')
  return {
    useLinea: () => {
      const [linea, setLinea] = useState<Linea>('zattia')
      cambiarLinea = setLinea
      return { linea, setLinea, lineas: ['zattia', 'stunned'] as Linea[] }
    },
  }
})

const { AsignarCard } = await import('@/components/tncat/AsignarCard')

let cont: HTMLDivElement
let root: Root

beforeEach(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom no implementa `scrollIntoView` y la card la llama al llegar desde Comisiones.
  Element.prototype.scrollIntoView = () => {}
  llamadas.length = 0
  cambiarLinea = null
  cont = document.createElement('div')
  document.body.appendChild(cont)
  root = createRoot(cont)
  // Los nombres entran por el puente de Comisiones y no por el Excel: leer un `.xlsx` de verdad no
  // agrega nada acá, y este camino es el que ya usa la card cuando viene de la lista de sale.
  ponerPuenteAsignar(['REMERA LISA'])
  await act(async () => { root.render(<AsignarCard />) })
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  cont.remove()
})

/** Elegir una categoría del desplegable dispara la previsualización. */
async function elegirCategoria() {
  const select = cont.querySelector('select') as HTMLSelectElement
  const opcion = [...select.options].find((o) => o.value)!
  await act(async () => {
    select.value = opcion.value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  return opcion.value
}

const botonAplicar = () => [...cont.querySelectorAll('button')].find((b) => /Aplicar en TiendaNube/.test(b.textContent || ''))

describe('Asignar categoría escribe en la tienda de la LÍNEA elegida', () => {
  it('arranca en Zattia y le pide las categorías a esa tienda', () => {
    expect(llamadas).toEqual([{ fn: 'traerCategorias', store: 'zattia' }])
  })

  it('dibuja el selector de línea: sin él Stunned no tiene por dónde entrar', () => {
    expect(cont.textContent).toContain('Stunned')
  })

  it('🔴 con Stunned elegido, el cruce va contra la tienda de STUNNED', async () => {
    await act(async () => { cambiarLinea!('stunned') })
    await elegirCategoria()
    expect(llamadas.filter((l) => l.fn === 'previsualizarAsignar')).toEqual([
      { fn: 'previsualizarAsignar', store: 'stunned' },
    ])
  })

  it('cambiar de línea vuelve a pedir las categorías, que son de esa tienda', async () => {
    await act(async () => { cambiarLinea!('stunned') })
    expect(llamadas.map((l) => l.store)).toEqual(['zattia', 'stunned'])
  })

  it('🔴 cambiar de línea BORRA la previsualización: el lote tiene ids de la otra tienda', async () => {
    await elegirCategoria()
    expect(botonAplicar()).toBeTruthy() // cruzado contra Zattia, hay algo para aplicar

    await act(async () => { cambiarLinea!('stunned') })

    // Si esto sobreviviera, apretar «Aplicar» escribiría `categories` sobre los productos de
    // Stunned que tengan esos números de id — que no son los que se previsualizaron.
    expect(botonAplicar()).toBeFalsy()
    expect(cont.querySelector('select')!.value).toBe('')
  })

  it('el diálogo de confirmación nombra la tienda, que es lo último que se lee antes de escribir', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await act(async () => { cambiarLinea!('stunned') })
    await elegirCategoria()
    await act(async () => { botonAplicar()!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(confirm.mock.calls[0]?.[0]).toContain('Stunned')
    confirm.mockRestore()
  })
})
