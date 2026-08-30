// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * 🔴 **D4 · «No aceptó» sobre un reclamo SIN decidir, del lado de la PANTALLA** (30-ago-2026).
 *
 * La regla y su cable están en `reclamos-contestar-oferta` y en `reclamos` (el reloj). Acá se fija
 * la tercera copia, que es la que lee una persona: **el confirm afirmaba «sigue lo que ya estaba
 * decidido» sin mirar si había una decisión**, con el nombre de la compensación en un ternario
 * **adentro del paréntesis** — o sea que sin decisión el texto quedaba igual de afirmativo, sólo
 * que sin nombrar nada. Es la quinta vuelta de la misma forma en este módulo:
 * [[feedback_areben_dos_lados_bien_y_la_pregunta_del_medio]].
 *
 * 🔑 **Se monta la pantalla y se lee lo DIBUJADO**, ⛔ no el código: el `Modal` del confirm usa un
 * portal, y lo que este test existe para probar es exactamente lo que la persona ve antes de
 * apretar.
 */

const FILAS: ReclamoRow[] = []

vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return { ...real, leerReclamos: vi.fn(async () => ({ filas: FILAS, hayMas: false })) }
})

const { Devoluciones } = await import('@/components/reclamos/Reclamos')
const { ToastProvider } = await import('@/components/ui/Toast')
// ⚠️ **Sin el `ConfirmProvider` no hay nada que leer**: `useConfirmar` cae al diálogo nativo del
// navegador, que en jsdom ⛔ no dibuja nada — o sea que el test pasaría vacío en las dos mitades.
const { ConfirmProvider } = await import('@/components/ui/Confirm')
const { SesionProvider } = await import('@/components/SesionProvider')

/** Una oferta viva de $13.491 esperando respuesta — el estado exacto de R-0022. */
const conOferta = {
  id: 22, store: 'bdi', estado: 'en_revision', motivo: 'no_esperaba', cliente: 'Quien Sea',
  items: [{ sku: 'X', producto: 'P', cantidad: 1, precio: '20000.00' }],
  fotos: ['una.jpg'],
  retencion_monto: 13491, retencion_forma: 'plata', retencion_respuesta: null,
  reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  cupon_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', reingreso_estado: 'no_aplica',
  reclamo_correo_estado: 'no_aplica', cobro_estado: 'no_aplica',
} as unknown as ReclamoRow

/** Monta la lista, aprieta «Registrar que no aceptó» y devuelve lo que el confirm DICE. */
const loQueDiceAlNoAceptar = async (fila: ReclamoRow): Promise<string> => {
  window.history.replaceState(null, '', '/postventa')
  FILAS.length = 0
  FILAS.push(fila)
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(
      <SesionProvider><ToastProvider><ConfirmProvider><Devoluciones /></ConfirmProvider></ToastProvider></SesionProvider>,
    )
  })
  const boton = [...document.querySelectorAll('button')]
    .find((b) => (b.textContent || '').includes('Registrar que no aceptó'))
  if (!boton) throw new Error('no está el botón «Registrar que no aceptó»')
  await act(async () => { (boton as HTMLElement).click() })
  // El confirm sale por un portal: se lee de `document`, ⛔ no del div montado.
  const texto = document.body.textContent || ''
  await act(async () => { root.unmount() })
  div.remove()
  return texto
}

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

describe('D4 · lo que la pantalla DICE antes de registrar el «no aceptó»', () => {
  /**
   * 🔴 El caso que lo destapó: `liberar-decision` borra `compensacion` y **deja la oferta en pie a
   * propósito**, así que la fila con oferta viva y ninguna rama guardada existe.
   */
  it('sin decisión guardada, ⛔ NO afirma que siga nada decidido', async () => {
    const dice = await loQueDiceAlNoAceptar({ ...conOferta, compensacion: null } as ReclamoRow)
    expect(dice).not.toContain('sigue lo que ya estaba decidido')
    expect(dice).toContain('no tiene ninguna decisión guardada')
  })

  /**
   * ⚠️ **La otra mitad, y sin ella el test es vacío**: con decisión el texto viejo es VERDADERO
   * —el rechazo cae sobre la salida «si dice que no», que ya está en la fila— y tiene que seguir
   * saliendo, con el nombre de la salida adentro.
   */
  it('con decisión guardada, sigue diciendo lo que estaba decidido y la nombra', async () => {
    const dice = await loQueDiceAlNoAceptar({ ...conOferta, compensacion: 'plata_total' } as ReclamoRow)
    expect(dice).toContain('sigue lo que ya estaba decidido')
    expect(dice).not.toContain('no tiene ninguna decisión guardada')
  })
})
