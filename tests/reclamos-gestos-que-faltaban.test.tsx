// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * **Dos pendientes que las pantallas NOMBRABAN y ⛔ no podían tildar** (D13 y D14 de la auditoría
 * del 28-ago-2026). Es la misma forma, por tercera y cuarta vez:
 * [[feedback_areben_pendiente_derivado_sin_gesto]] — el estado existe, el pendiente se dibuja, y el
 * gesto que lo cierra ⛔ no está en ninguna pantalla.
 *
 * - **D13**: `anulado` estaba en la lista de estados, en los colores y en `faltantesParaCerrar`, y
 *   ⛔ ninguna pantalla lo podía poner ⇒ la única forma de sacar de la lista un reclamo abierto por
 *   error era **eliminarlo**, y con él se iban el número, el historial y las fotos.
 * - **D14**: todo cambio nace con `envio_nuevo_estado: 'pendiente'` y la columna escribe *«Falta
 *   despachar lo que se le manda»*; para tildarlo había que irse a Reclamos o a Retornos, con el
 *   cambio abierto adelante.
 */

const FILAS: ReclamoRow[] = []

vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return { ...real, leerReclamos: vi.fn(async () => ({ filas: FILAS, hayMas: false })) }
})

const { Devoluciones } = await import('@/components/reclamos/Reclamos')
const { ArmarCambio } = await import('@/components/reclamos/ArmarCambio')
const { ToastProvider } = await import('@/components/ui/Toast')
const { SesionProvider } = await import('@/components/SesionProvider')

const base = {
  id: 1, store: 'bdi', estado: 'borrador', motivo: 'falla', cliente: 'Quien Sea',
  items: [{ sku: 'X', producto: 'P', cantidad: 1, precio: '1000.00' }],
  reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  cupon_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', reingreso_estado: 'no_aplica',
  reclamo_correo_estado: 'no_aplica', cobro_estado: 'no_aplica',
} as unknown as ReclamoRow

/**
 * Monta la pantalla con estas filas y devuelve **los botones y el texto**.
 *
 * 🔴 **El texto ⛔ no es decoración: sin él los tests negativos son vacíos.** La lista de Reclamos
 * abre en la pestaña «Abiertos», que ⛔ no dibuja lo cerrado ni lo anulado — o sea que
 * *«el botón no está»* se cumple igual **porque la fila no está**, y un mutante que muestre el
 * botón siempre pasa entero. Por eso cada test negativo comprueba primero que la fila SE VE.
 * Es el mismo «el cero afirma» del módulo, del lado del test.
 */
const pintar = async (
  Pantalla: () => React.ReactNode, filas: ReclamoRow[], ruta: string, pestana?: string,
): Promise<{ botones: string[]; texto: string }> => {
  window.history.replaceState(null, '', ruta)
  FILAS.length = 0
  FILAS.push(...filas)
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Pantalla /></ToastProvider></SesionProvider>)
  })
  if (pestana) {
    const t = [...div.querySelectorAll('[role="tab"]')].find((x) => (x.textContent || '').includes(pestana))
    if (!t) throw new Error(`no está la pestaña «${pestana}»`)
    await act(async () => { (t as HTMLElement).click() })
  }
  const salida = {
    botones: [...div.querySelectorAll('button')].map((b) => (b.textContent || '').trim()),
    texto: div.textContent || '',
  }
  await act(async () => { root.unmount() })
  div.remove()
  return salida
}

const enReclamos = (filas: ReclamoRow[], pestana?: string) => pintar(Devoluciones, filas, '/postventa', pestana)
const enCambios = (filas: ReclamoRow[]) => pintar(ArmarCambio, filas, '/postventa?tab=cambios')

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

describe('🔴 D13 · anular un reclamo que no debió existir', () => {
  it('🔴 sobre un reclamo abierto, Administración lo puede anular', async () => {
    const { botones } = await enReclamos([base])
    expect(botones.some((b) => b.includes('Anular el reclamo'))).toBe(true)
  })

  /**
   * 🔑 **El rótulo dice cuál de los dos «anular» es.** En la misma fila puede estar «Anulé en GN»,
   * que es la VENTA en Gestión Nube y ⛔ no el reclamo: dos cosas distintas con el mismo verbo.
   */
  it('y ⛔ no se confunde con el de la VENTA en Gestión Nube', async () => {
    const resuelto = {
      ...base, estado: 'resuelto', compensacion: 'plata_total', stock_estado: 'pendiente',
      gn_venta_number: '14231',
    } as unknown as ReclamoRow
    const { botones } = await enReclamos([resuelto])
    // ⚠️ El rótulo del de la venta se busca por FORMA (`…en GN`) y ⛔ no letra por letra: es texto
    // que la corrida de vocabulario puede reescribir («Anulé» → «Anular»), y lo que este test fija
    // es que **son dos botones distintos**, ⛔ no cómo se llama cada uno.
    expect(botones.some((b) => /Anul.* en GN/.test(b))).toBe(true)
    expect(botones.some((b) => b.includes('Anular el reclamo'))).toBe(true)
  })

  /**
   * Un reclamo ya cerrado o ya anulado ⛔ no se vuelve a anular: `ESTADOS_ABIERTOS` los deja afuera.
   *
   * ⚠️ **Se mira en la pestaña «Todos»**, y sin eso el test es vacío: «Abiertos» ⛔ no dibuja estas
   * filas, así que el botón faltaría igual con el guard roto.
   */
  it('⛔ sobre uno cerrado ⛔ no aparece — y la fila SÍ está', async () => {
    const cerrado = { ...base, estado: 'cerrado', compensacion: 'plata_total' } as unknown as ReclamoRow
    const { botones, texto } = await enReclamos([cerrado], 'Todos')
    expect(texto).toContain('R-0001')
    expect(botones.some((b) => b.includes('Anular el reclamo'))).toBe(false)
  })

  it('⛔ ni sobre uno ya anulado — y la fila SÍ está', async () => {
    const anulado = { ...base, estado: 'anulado' } as unknown as ReclamoRow
    const { botones, texto } = await enReclamos([anulado], 'Todos')
    expect(texto).toContain('R-0001')
    expect(botones.some((b) => b.includes('Anular el reclamo'))).toBe(false)
  })

  /**
   * 🔴 **Y que escriba `anulado`, ⛔ no otra cosa.** El rótulo y el verbo son dos cosas: un botón
   * bien rotulado que manda `cerrado` deja el reclamo contado como resuelto —y es el estado que
   * **exige que no falte nada**, así que además contestaría 409 sobre un caso que no debió existir.
   */
  it('🔴 apretarlo manda `estado: anulado`', async () => {
    let mandado: Record<string, unknown> | null = null
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => {
      const cuerpo = init?.body ? JSON.parse(init.body) as Record<string, unknown> : null
      if (cuerpo?.action === 'estado') mandado = cuerpo
      return { ok: true, status: 200, json: async () => ({ ok: true, devoluciones: [] }) }
    }))
    // Sin `ConfirmProvider` alrededor, `useConfirmar` cae al diálogo nativo (ver `Confirm.tsx`).
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    FILAS.length = 0
    FILAS.push(base)
    const div = document.createElement('div')
    document.body.appendChild(div)
    const root = createRoot(div)
    window.history.replaceState(null, '', '/postventa')
    await act(async () => {
      root.render(<SesionProvider><ToastProvider><Devoluciones /></ToastProvider></SesionProvider>)
    })
    const b = [...div.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Anular el reclamo'))
    expect(b).toBeTruthy()
    await act(async () => { b!.click() })
    await act(async () => { root.unmount() })
    div.remove()
    vi.unstubAllGlobals()

    expect(mandado).toMatchObject({ action: 'estado', estado: 'anulado', id: 1 })
  })
})

describe('🔴 D14 · despachar un cambio, sin cambiar de pantalla', () => {
  const CAMBIO = {
    ...base, estado: 'borrador', compensacion: 'otro_producto', motivo: 'talle',
    items_nuevos: [{ sku: 'Y', producto: 'OTRO', cantidad: 1, precio: '1000.00' }],
    pagado: true, diferencia: 0,
  } as unknown as ReclamoRow

  it('🔴 con el paquete pendiente, el botón está en Cambios', async () => {
    const conPendiente = { ...CAMBIO, envio_nuevo_estado: 'pendiente' } as unknown as ReclamoRow
    const { botones } = await enCambios([conPendiente])
    // ⚠️ Por FORMA y ⛔ no letra por letra: «Despaché» / «Despachar» es exactamente lo que la
    // corrida de vocabulario reescribe, y lo que se fija acá es que el gesto ESTÉ, ⛔ no su tiempo
    // verbal.
    expect(botones.some((b) => /Despach/.test(b))).toBe(true)
  })

  /**
   * ⚠️ La mitad negativa: el botón sigue **el pendiente**, ⛔ no el estado. Sin esto, «mostrarlo
   * siempre» pasaría el test de arriba — y el freno del servidor contestaría 409 sobre un cambio
   * que no tiene nada para mandar.
   */
  it('⛔ y ⛔ no aparece cuando ya se despachó', async () => {
    const hecho = { ...CAMBIO, envio_nuevo_estado: 'hecho' } as unknown as ReclamoRow
    const { botones, texto } = await enCambios([hecho])
    expect(texto).toContain('R-0001')
    expect(botones.some((b) => /Despach/.test(b))).toBe(false)
  })

  it('⛔ ni cuando el cambio ⛔ no manda nada', async () => {
    const nada = { ...CAMBIO, envio_nuevo_estado: 'no_aplica' } as unknown as ReclamoRow
    const { botones, texto } = await enCambios([nada])
    expect(texto).toContain('R-0001')
    expect(botones.some((b) => /Despach/.test(b))).toBe(false)
  })
})
