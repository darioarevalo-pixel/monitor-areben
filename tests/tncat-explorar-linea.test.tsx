// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Linea } from '@/lib/lineas'

/**
 * 🔴 **«Explorar una categoría» es la asignación MANUAL —se tilda y se aplica— y hasta el
 * 7-sep-2026 tampoco podía apuntar a la tienda de Stunned.**
 *
 * Es la hermana de `tests/tncat-asignar-linea.test.tsx` y el defecto era el mismo: la card recibía
 * `marca`, así que con Stunned mostraba el catálogo de Zattia. Pero acá el filo del cambio de línea
 * es **peor**, y por eso este archivo existe aparte: en la card del Excel hay un cruce por nombre
 * en el medio que revalida contra la tienda elegida; acá lo tildado son `id` que se mandan
 * **directo** al PUT. Un lote armado mirando Zattia, aplicado con Stunned elegido, escribe
 * `categories` sobre los productos de Stunned que tengan esos números — en vivo y sin aviso.
 *
 * ⚠️ Monta de verdad (`createRoot` + `act`): lo que se prueba vive en un efecto y en un cambio de
 * estado, no en el markup del primer cuadro.
 */

const llamadas: { fn: string; store: Linea }[] = []

const PRODUCTOS: Record<Linea, { id: number; name: string; sku: string; category_ids: number[]; images: string[]; published: boolean; created_at: string }[]> = {
  zattia: [{ id: 222, name: 'JEAN WIDE', sku: 'ZAT-0001', category_ids: [77], images: [], published: true, created_at: '2026-09-01' }],
  stunned: [{ id: 222, name: 'REMERA SKATE', sku: 'STU-REM-0024-L', category_ids: [91], images: [], published: true, created_at: '2026-09-07' }],
  bdi: [],
}

vi.mock('@/lib/tncat/cliente', () => ({
  traerCategorias: (store: Linea) => {
    llamadas.push({ fn: 'traerCategorias', store })
    return Promise.resolve([{ id: store === 'stunned' ? 91 : 77, name: `REMERAS (${store})`, parent: null }])
  },
  auditProductos: (store: Linea) => {
    llamadas.push({ fn: 'auditProductos', store })
    return Promise.resolve(PRODUCTOS[store])
  },
  aplicarAsignarLote: (store: Linea) => {
    llamadas.push({ fn: 'aplicarAsignarLote', store })
    return Promise.resolve({ ok: true, aplicados: 1, errores: [] })
  },
  bustAudit: () => Promise.resolve(),
}))

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

const { ExplorarCategoriaCard } = await import('@/components/tncat/ExplorarCategoriaCard')
const { ConfirmProvider } = await import('@/components/ui/Confirm')

let cont: HTMLDivElement
let root: Root

beforeEach(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  llamadas.length = 0
  cambiarLinea = null
  cont = document.createElement('div')
  document.body.appendChild(cont)
  root = createRoot(cont)
  // Con el provider de verdad: el fallback de `useConfirmar` cae en `window.confirm`, que se come
  // el mensaje cuando es JSX (`textoPlano` sólo pasa strings) — y el aviso de la tienda es JSX.
  await act(async () => { root.render(<ConfirmProvider><ExplorarCategoriaCard /></ConfirmProvider>) })
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  cont.remove()
})

/** Elegir la primera categoría del desplegable: es lo que dibuja las dos columnas. */
async function elegirCategoria() {
  const select = cont.querySelector('select') as HTMLSelectElement
  const opcion = [...select.options].find((o) => o.value)!
  await act(async () => {
    select.value = opcion.value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** Tildar el primer producto de la columna «lo que está adentro hoy». */
async function tildarPrimero() {
  const check = cont.querySelector('label input[type="checkbox"]') as HTMLInputElement
  // `.click()` y no `checked = true`: poner la propiedad a mano cambia el DOM y **no** el estado de
  // React, y el test quedaba mirando un tilde que la card no tenía (el botón seguía deshabilitado).
  await act(async () => { check.click() })
}

describe('Explorar una categoría mira y escribe la tienda de la LÍNEA elegida', () => {
  it('arranca en Zattia: categorías y catálogo de esa tienda', () => {
    expect(llamadas).toEqual([
      { fn: 'traerCategorias', store: 'zattia' },
      { fn: 'auditProductos', store: 'zattia' },
    ])
  })

  it('dibuja el selector de línea: sin él Stunned no tiene por dónde entrar', () => {
    expect(cont.textContent).toContain('Stunned')
  })

  it('🔴 con Stunned elegido, el catálogo que se explora es el de STUNNED', async () => {
    await act(async () => { cambiarLinea!('stunned') })
    expect(llamadas.filter((l) => l.fn === 'auditProductos')).toEqual([
      { fn: 'auditProductos', store: 'zattia' },
      { fn: 'auditProductos', store: 'stunned' },
    ])
    await elegirCategoria()
    expect(cont.textContent).toContain('REMERA SKATE')
    expect(cont.textContent).not.toContain('JEAN WIDE')
  })

  it('🔴 cambiar de línea suelta la CATEGORÍA, que es lo que impide aplicar un lote de la otra tienda', async () => {
    await elegirCategoria()
    await tildarPrimero()
    expect(cont.querySelectorAll('input[type="checkbox"]:checked').length).toBe(1)

    await act(async () => { cambiarLinea!('stunned') })

    // El id de categoría era de Zattia: con él puesto sobre el catálogo de Stunned, la pantalla
    // diría «la categoría está vacía» de una tienda que sí la tiene — o peor, mostraría lo que
    // caiga bajo ese número en la otra.
    expect((cont.querySelector('select') as HTMLSelectElement).value).toBe('')
    // ⚠️ El `value` del `<select>` solo no alcanza como oráculo: con las categorías recargándose,
    // el desplegable cae a vacío igual aunque `catId` siga con el número de Zattia por dentro. Lo
    // que delata al id sobreviviente es el panel de abajo, que se dibuja sin nombre y anuncia
    // vacía una categoría que en Stunned tiene productos.
    expect(cont.textContent).not.toContain('La categoría está vacía')

    // Y con la categoría suelta no hay botón de aplicar: el lote de Zattia no tiene por dónde
    // escribirse en Stunned. (`sacar`/`sumar` se vacían también en el reset, pero eso es
    // redundancia: elegir cualquier categoría los limpia. Lo que cierra la puerta es esto.)
    expect([...cont.querySelectorAll('button')].some((b) => /Sacar de la categoría/.test(b.textContent || ''))).toBe(false)

    // Y al elegir categoría en Stunned se empieza limpio, con el catálogo de Stunned.
    await elegirCategoria()
    expect(cont.textContent).toContain('REMERA SKATE')
    expect(cont.querySelectorAll('input[type="checkbox"]:checked').length).toBe(0)
  })

  it('el diálogo de confirmación nombra la tienda antes de escribir en vivo', async () => {
    await act(async () => { cambiarLinea!('stunned') })
    await elegirCategoria()
    await tildarPrimero()
    const boton = [...cont.querySelectorAll('button')].find((b) => /Sacar de la categoría/.test(b.textContent || ''))!
    await act(async () => { boton.click() })
    // Zattia y Stunned tienen categorías con los mismos nombres: sin la tienda en el cartel, los
    // dos diálogos se leen igual.
    expect(document.body.textContent).toContain('tienda EN VIVO de Stunned')
    // Nada se escribió: el diálogo está abierto esperando.
    expect(llamadas.some((l) => l.fn === 'aplicarAsignarLote')).toBe(false)
  })
})
