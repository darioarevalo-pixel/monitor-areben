// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { LineaConCruce } from '@/lib/recepciones/cliente'
import type { Variante } from '@/lib/etl/tipos'

/**
 * **Traer una orden recibida al banco, montado y apretado** — Fase 4 del octavo.
 *
 * 🔑 **Monta y aprieta, ⛔ no lee el fuente.** Lo que se rompe callado acá ⛔ no es el cruce —eso lo
 * fija `sesionfotos-banco-oc.test.ts`— sino **lo que la pantalla hace con lo que el endpoint
 * contesta**, que es la mitad que ningún test del núcleo puede ver:
 *
 *  1. 🔴 **La respuesta trae la foto vieja (`en_gn`, `producto_id`) y el candidato entra igual.**
 *     Es el caso normal de una importación —186 de 819 renglones de Zattia— y el día que alguien
 *     "aproveche" esos campos, este test se pone rojo antes de que la sesión salga corta.
 *  2. 🔴 **Lo que ⛔ no entró se NOMBRA con su motivo**, y ⛔ no se resta en silencio del total.
 *  3. **El 403 se lee como falta de permiso**, ⛔ no como «no hay órdenes»: son dos manos distintas
 *     y la segunda manda a nadie a ningún lado.
 */

const leerRecepciones = vi.fn()
const leerRecepcion = vi.fn()
vi.mock('@/lib/recepciones/cliente', () => ({
  leerRecepciones: (...a: unknown[]) => leerRecepciones(...a),
  leerRecepcion: (...a: unknown[]) => leerRecepcion(...a),
}))

const { AgregarDesdeOC } = await import('@/components/sesionfotos/AgregarDesdeOC')

const gn = (p: Partial<Variante> & { id: string }): Variante => ({
  pid: p.id.split('_')[0], sid: '1', name: 'TOP LEVEL', size: 'M', stock: 0, local: 0, deposito: 0,
  sku: '', barcode: '', lastSale: null, daysSinceLast: 999,
  sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0, lifespan: 0,
  phase: { label: 'nuevo', cls: '' }, ...p,
})

const linea = (p: Partial<LineaConCruce>): LineaConCruce => ({
  id: 'zattia:469:0', oc_ref: 'zattia:469', orden: 0, sku: 'Z-100', codigo_barras: null,
  nombre: 'TOP LEVEL', talle: 'M', color: 'NEGRO', cantidad_pedida: 3, cantidad_contada: 3,
  diferencia: 0, observaciones: null, es_nuevo: true, imagen_url: null, imagen_thumb_url: null,
  // 🔴 La foto de cuando llegó la orden: el producto todavía ⛔ no estaba en GN.
  en_gn: false, producto_id: null,
  // El recruce en vivo, que es lo único que el cruce mira.
  en_gn_hoy: true, producto_id_hoy: 'p1',
  ...p,
})

const OC = {
  id: 'zattia:469', store: 'zattia', oc_id: 469, oc_label: 'OC-0469', oc_estado: 'recibida',
  fecha_compra: null, fecha_ingreso: '2026-09-01', confirmada_at: '2026-09-01T10:00:00Z',
  productos: 2, lineas: 2, unidades_pedidas: 6, unidades_contadas: 6, diferencia_unidades: 0,
  lineas_con_diferencia: 0, unidades_faltantes: 0, unidades_sobrantes: 0, lineas_nuevas: 2,
  cumplimiento: 100, totales_coinciden: true, lineas_recibidas: 2, espejo_consultado: true,
  skus_sin_espejo: 0, recibido_en: '2026-09-01T12:00:00Z',
}

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let cont: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  leerRecepciones.mockReset()
  leerRecepcion.mockReset()
  cont = document.createElement('div')
  document.body.appendChild(cont)
  root = createRoot(cont)
})
afterEach(() => {
  act(() => root.unmount())
  cont.remove()
})

const montar = async (onAgregar: (i: unknown[]) => number, variantes: Variante[], huerfanas: Variante[] = []) => {
  await act(async () => {
    root.render(<AgregarDesdeOC linea="zattia" variantes={variantes} huerfanas={huerfanas} onAgregar={onAgregar as never} />)
  })
}
const boton = (texto: string) => [...cont.querySelectorAll('button')].find((b) => (b.textContent || '').includes(texto))
const apretar = async (texto: string) => {
  const b = boton(texto)
  if (!b) throw new Error(`⛔ no está el botón «${texto}». Hay: ${[...cont.querySelectorAll('button')].map((x) => x.textContent).join(' | ')}`)
  await act(async () => { b.click() })
}
const elegirOC = async (id: string) => {
  const sel = cont.querySelector('select') as HTMLSelectElement
  await act(async () => {
    sel.value = id
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('traer una orden al banco', () => {
  it('🔴 la orden entra aunque el renglón haya llegado SIN estar en Gestión Nube', async () => {
    leerRecepciones.mockResolvedValue({ recepciones: [OC], eventos: { rotos: [], ultimo: null }, puede: { proveedores: false } })
    leerRecepcion.mockResolvedValue({ recepcion: OC, lineas: [linea({})], espejoConsultado: true, puede: { proveedores: false } })
    const traidos: unknown[][] = []
    await montar((items) => { traidos.push(items); return items.length }, [gn({ id: 'p1_1', sku: 'Z-100', name: 'TOP LEVEL', deposito: 4 })])

    await apretar('Agregar desde una orden recibida')
    expect(leerRecepciones).toHaveBeenCalledWith('zattia', 90)
    await elegirOC('zattia:469')
    await apretar('Agregar al banco')

    expect(leerRecepcion).toHaveBeenCalledWith('zattia', 'zattia:469')
    expect(traidos).toHaveLength(1)
    expect(traidos[0]).toEqual([
      expect.objectContaining({ vid: 'p1_1', candidato: 'oc', ocRef: 'zattia:469', ocLabel: 'OC-0469' }),
    ])
    expect(cont.textContent).toContain('1 prenda al banco')
  })

  it('🔴 lo que ⛔ no entró sale con su motivo, ⛔ no restado en silencio', async () => {
    leerRecepciones.mockResolvedValue({ recepciones: [OC], eventos: { rotos: [], ultimo: null }, puede: { proveedores: false } })
    leerRecepcion.mockResolvedValue({
      recepcion: OC,
      lineas: [
        linea({}),
        linea({ sku: 'Z-200', nombre: 'JEAN WIDE' }),            // cruza, pero sin una sola unidad
        linea({ sku: 'Z-900', nombre: 'BUZO NUEVO', en_gn_hoy: false }), // el espejo dice que ⛔ no está
      ],
      espejoConsultado: true,
      puede: { proveedores: false },
    })
    await montar((items) => items.length, [
      gn({ id: 'p1_1', sku: 'Z-100', deposito: 4 }),
      gn({ id: 'p2_1', sku: 'Z-200', name: 'JEAN WIDE', local: 0, deposito: 0 }),
    ])
    await apretar('Agregar desde una orden recibida')
    await elegirOC('zattia:469')
    await apretar('Agregar al banco')

    expect(cont.textContent).toContain('1 prenda al banco')
    expect(cont.textContent).toContain('2 renglones ⛔ no entraron')
    expect(cont.textContent).toContain('1 su producto todavía no está cargado en Gestión Nube')
    expect(cont.textContent).toContain('1 no queda ninguna unidad para fotografiar')
  })

  it('traerla dos veces ⛔ no la duplica, y el parte lo DICE', async () => {
    leerRecepciones.mockResolvedValue({ recepciones: [OC], eventos: { rotos: [], ultimo: null }, puede: { proveedores: false } })
    leerRecepcion.mockResolvedValue({ recepcion: OC, lineas: [linea({})], espejoConsultado: true, puede: { proveedores: false } })
    // El banco de verdad: `agregarAlBanco` ⛔ no duplica, así que la segunda vez entran 0.
    let veces = 0
    await montar(() => (veces++ === 0 ? 1 : 0), [gn({ id: 'p1_1', sku: 'Z-100', deposito: 4 })])
    await apretar('Agregar desde una orden recibida')
    await elegirOC('zattia:469')
    await apretar('Agregar al banco')
    expect(cont.textContent).toContain('1 prenda al banco')
    await apretar('Agregar al banco')
    expect(cont.textContent).toContain('0 prendas al banco')
    expect(cont.textContent).toContain('1 ya estaban')
  })

  it('el 403 se lee como falta de PERMISO, y dice dónde se destraba', async () => {
    leerRecepciones.mockRejectedValue(new Error('No tenés acceso a las recepciones de esta marca.'))
    await montar(() => 0, [])
    await apretar('Agregar desde una orden recibida')
    expect(cont.textContent).toContain('No tenés acceso')
    expect(cont.textContent).toContain('Lo que entró')
    // ⛔ Y no dice «sin órdenes», que mandaría a buscar una OC que sí existe.
    expect(cont.textContent).not.toContain('Sin órdenes')
    expect(cont.textContent).toContain('⛔ No se pudieron leer las órdenes')
  })

  it('sin órdenes en la ventana lo dice, y el botón de traer queda apagado', async () => {
    leerRecepciones.mockResolvedValue({ recepciones: [], eventos: { rotos: [], ultimo: null }, puede: { proveedores: false } })
    await montar(() => 0, [])
    await apretar('Agregar desde una orden recibida')
    expect(cont.textContent).toContain('Sin órdenes en los últimos 90 días')
    expect(boton('Agregar al banco')?.disabled).toBe(true)
  })

  it('⚠️ una sesión de STUNNED pide las órdenes de Zattia: las recepciones ⛔ no conocen las líneas', async () => {
    leerRecepciones.mockResolvedValue({ recepciones: [OC], eventos: { rotos: [], ultimo: null }, puede: { proveedores: false } })
    await act(async () => {
      root.render(<AgregarDesdeOC linea="stunned" variantes={[]} huerfanas={[]} onAgregar={() => 0} />)
    })
    await apretar('Agregar desde una orden recibida')
    expect(leerRecepciones).toHaveBeenCalledWith('zattia', 90)
  })
})
