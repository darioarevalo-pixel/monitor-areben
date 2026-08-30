// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * 🔴 **BKL-05 · el texto largo rompe la maquetación horizontal** — la mitad que quedaba viva del
 * informe del 30-ago-2026.
 *
 * El informe señalaba **la columna de pendientes**, que ya estaba arreglada (`wrap` + `maxWidth`
 * desde antes). El desborde de verdad estaba en la **primera columna**, y lo que lo produce ⛔ no
 * es el nombre del cliente: **es la alerta**. `<Td>` hereda `white-space: nowrap`
 * (`components/ui/Table.tsx`), así que un texto largo sale en **una sola línea indivisible** y
 * empuja la tabla entera — aparece la barra horizontal y las columnas de la derecha quedan fuera
 * de vista, que es exactamente lo que el informe describe.
 *
 * 🔑 **Y lo empeoró un arreglo del mismo día**: el aviso de D4 —*«El cliente no aceptó la oferta
 * hace N días y el reclamo sigue sin decisión»*, **77 caracteres medidos**— pasó a ser el texto
 * más largo del módulo, 20 más que el que era. ⇒ arreglar una cosa alargó el texto que rompía otra,
 * y ⛔ nada lo dijo.
 *
 * ⚠️ **Por eso el test es sobre TODA celda y ⛔ no sobre ésta**: una regla escrita en un comentario
 * ⛔ no frena nada ⇒ [[feedback_areben_invariante_escrito_no_frena]]. El día que alguien agregue
 * una columna con texto largo, o alargue un cartel, esto se pone rojo solo.
 */

const FILAS: ReclamoRow[] = []
vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return { ...real, leerReclamos: vi.fn(async () => ({ filas: FILAS, hayMas: false })) }
})

const { Devoluciones, ReclamosLocal } = await import('@/components/reclamos/Reclamos')
const { ToastProvider } = await import('@/components/ui/Toast')
const { SesionProvider } = await import('@/components/SesionProvider')

const hace = (d: number) => new Date(Date.now() - d * 86400000).toISOString()

/**
 * La fila que dispara el aviso MÁS LARGO del módulo, con el nombre más largo que puede tener un
 * cliente de verdad y una lista de pendientes cargada. ⚠️ Si el aviso no saliera, el test sería
 * **vacío**: por eso se comprueba primero que el texto ESTÉ.
 */
const laPeorFila = {
  id: 22, store: 'bdi', estado: 'en_revision', motivo: 'no_esperaba',
  cliente: 'María de los Ángeles Fernández Etchegaray',
  orden_tn: '21148',
  items: [{ sku: 'X', producto: 'P', cantidad: 1, precio: '20000.00' }],
  compensacion: null,
  retencion_monto: 13491, retencion_forma: 'plata', retencion_respuesta: 'rechazo',
  historial: [{ estado: 'en_revision', at: hace(12) }],
  created_at: hace(20), updated_at: hace(0),
  reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  cupon_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', reingreso_estado: 'no_aplica',
  reclamo_correo_estado: 'no_aplica', cobro_estado: 'no_aplica',
} as unknown as ReclamoRow

/**
 * La segunda fila: la que hace LARGA la columna de pendientes. ⚠️ **Sin ella el test mentía**: con
 * una sola fila `en_revision` el texto de pendientes es corto, así que el mutante que le sacaba el
 * `wrap` a esa celda **sobrevivía** — el test decía cubrir «toda celda» y cubría una.
 */
const laDeLosPendientes = {
  id: 23, store: 'bdi', estado: 'resuelto', motivo: 'falla', escenario: 'util',
  cliente: 'Otra Clienta', orden_tn: '21149',
  items: [{ sku: 'X', producto: 'P', cantidad: 2, precio: '20000.00', destino: 'falla' }],
  compensacion: 'plata_total', monto_total: 20000, destino_prenda: 'falla',
  retorno_decidido: true, via_retorno: 'andreani',
  created_at: hace(9), updated_at: hace(9),
  reintegro_estado: 'pendiente', stock_estado: 'pendiente', tn_stock_estado: 'pendiente',
  cupon_estado: 'pendiente', envio_nuevo_estado: 'pendiente', reingreso_estado: 'pendiente',
  reclamo_correo_estado: 'pendiente', cobro_estado: 'pendiente',
} as unknown as ReclamoRow

/** El largo a partir del cual una celda en una sola línea ya empuja la tabla. */
const LARGO = 40

/**
 * 🔑 **Lo que se mide es el TEXTO que ⛔ no se puede cortar, y los botones ⛔ no cuentan.**
 * La barra de acciones tiene ~60 caracteres de rótulos y ⛔ no desborda: su div interno es un flex
 * con `flexWrap: 'wrap'`, y **quien corta ahí es flexbox, ⛔ no `white-space`** —que sobre los
 * botones hace justo lo que se quiere: que ninguno parta su propio rótulo por la mitad—.
 * ⚠️ Sin esta resta el test da un falso positivo sobre esa celda, y un test que grita donde no hay
 * nada es un test que se termina apagando.
 */
const textoQueNoCorta = (td: HTMLTableCellElement): string => {
  const copia = td.cloneNode(true) as HTMLElement
  copia.querySelectorAll('button, a').forEach((b) => b.remove())
  return (copia.textContent || '').trim()
}

const celdasApretadas = async (Pantalla: () => React.ReactNode) => {
  window.history.replaceState(null, '', '/postventa')
  FILAS.length = 0
  FILAS.push(laPeorFila, laDeLosPendientes)
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Pantalla /></ToastProvider></SesionProvider>)
  })
  const malas = [...div.querySelectorAll('td')]
    .filter((td) => textoQueNoCorta(td).length > LARGO)
    .filter((td) => td.style.whiteSpace === 'nowrap')
    .map((td) => textoQueNoCorta(td).slice(0, 70))
  const texto = div.textContent || ''
  await act(async () => { root.unmount() })
  div.remove()
  return { malas, texto }
}

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

describe('🔴 BKL-05 · ninguna celda larga sale en una sola línea', () => {
  it('en Reclamos (Administración)', async () => {
    const { malas, texto } = await celdasApretadas(Devoluciones)
    // ⚠️ Primero: que el aviso ESTÉ. Sin esto el test se cumple sobre una tabla vacía.
    expect(texto).toContain('no aceptó la oferta')
    // ⚠️ Y que la columna de pendientes esté LLENA: es la otra celda que este test cuida, y con
    // una fila corta el mutante que le saca el `wrap` sobrevive.
    expect(texto).toMatch(/anular|devolver|descontar/i)
    expect(malas).toEqual([])
  })

  it('y en la pantalla del local', async () => {
    const { malas, texto } = await celdasApretadas(ReclamosLocal)
    expect(texto).toContain('no aceptó la oferta')
    expect(malas).toEqual([])
  })
})
