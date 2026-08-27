// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * 🔴 **REHACER UNA DECISIÓN: el bucle de R-0022** (27-ago-2026).
 *
 * Bruno, con el segundo reclamo real de BDI ya decidido: *«pongo volver a decidir, confirmo el
 * primer paso, y cuando salgo sigue diciendo volver a decidir»*.
 *
 * La pantalla no estaba rota. R-0022 quedó decidido como **cambio**, y un cambio decidido vuelve a
 * `borrador` a propósito (lo termina el POS). Al reabrirlo con «Volver a decidir», `pasoGuardado`
 * miraba `compensacion != null` y marcaba **«El cliente» con un ✓**: el único paso que decide se
 * leía como ya hecho. La única pestaña en rojo era «El producto», así que confirmarla y salir era
 * literalmente lo que la pantalla estaba pidiendo — y `confirmarPaso` escribe por `editar`, que
 * ⛔ **no decide**. La fila salía igual que entró, con su botón «Volver a decidir» intacto.
 *
 * 🔑 Estos tests **montan el componente**, por lo mismo que documenta `reclamos-decidir-pestanas`:
 * `Modal` usa un portal y el renderer de servidor no lo soporta. El oráculo es lo que la pantalla
 * DICE y a quién le pega — ⛔ no el estado interno.
 */

const llamadas: Array<{ que: string; args: unknown[] }> = []
vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return {
    ...real,
    decidir: vi.fn(async (...a: unknown[]) => { llamadas.push({ que: 'decidir', args: a }); return 'resuelto' }),
    editarReclamo: vi.fn(async (...a: unknown[]) => { llamadas.push({ que: 'editar', args: a }) }),
  }
})

const { DecidirReclamo } = await import('@/components/reclamos/DecidirReclamo')
const { ToastProvider } = await import('@/components/ui/Toast')
const { puedeRehacerseLaDecision, estaDecidido, esCambio, registroDeRetencion } = await import('@/lib/reclamos/tipos')

/**
 * ⚠️ **La fila REAL de producción**, copiada de la base el 27-ago-2026: R-0022 de BDI, abierto por
 * micaresolani, con la foto que subió la clienta, y decidido por Bruno a las 13:13 como cambio.
 * Un fixture inventado no habría tenido lo que arma el bucle: `escenario` cargado, `envio_costo`
 * en null y `compensacion` puesta.
 */
const R22 = {
  id: 22, store: 'bdi', orden_tn: '21033', cliente: 'Victoria Singh',
  motivo: 'no_esperaba', escenario: 'coincide', estado: 'borrador',
  compensacion: 'otro_producto', destino_prenda: 'stock',
  retorno_decidido: true, via_retorno: 'andreani', envio_costo: null,
  expectativa: 'plata', monto_producto: 20682, monto_total: 20682,
  items: [
    { sku: 'ATE-025-17P-9DP', producto: 'TEMPLADO 9D PREMIUM', cantidad: 1, precio: '7990.00', pagado: 7191 },
    { sku: 'F-0210-17P', producto: 'CHELSEA CASE', cantidad: 1, precio: '14990.00', pagado: 13491 },
  ],
  fotos: [{ url: 'https://blob/foto.jpg' }],
  reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  cupon_estado: 'no_aplica', envio_nuevo_estado: 'pendiente', reingreso_estado: 'pendiente',
  reclamo_correo_estado: 'no_aplica', items_correctos: [], items_nuevos: [],
} as unknown as ReclamoRow

/** El mismo caso ANTES de decidirse: es el control de que los arreglos no tocan la decisión nueva. */
const SIN_DECIDIR = { ...R22, estado: 'en_revision', compensacion: null } as unknown as ReclamoRow

let cerrado = 0
let listo = 0
async function abrir(reclamo: ReclamoRow) {
  document.body.innerHTML = ''
  cerrado = 0; listo = 0
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    // ⚠️ Con `ToastProvider` de verdad: fuera de él `useToast` es un no-op, y un test que mira
    // el aviso sin proveedor pasaría verde contra una pantalla que no dice nada.
    createRoot(host).render(
      <ToastProvider>
        <DecidirReclamo marca="bdi" reclamo={reclamo} onClose={() => { cerrado++ }} onListo={() => { listo++ }} />
      </ToastProvider>,
    )
  })
}
const texto = () => document.body.textContent || ''
const botones = () => [...document.querySelectorAll('button')] as HTMLButtonElement[]
const boton = (t: string) => botones().find((b) => (b.textContent || '').includes(t))
const tabs = () => [...document.querySelectorAll('[role="tab"]')] as HTMLElement[]
/** Tipea en un NumberField como lo haría una persona, buscándolo por el texto de su label. */
async function tipear(label: string, valor: string) {
  const l = [...document.querySelectorAll('label')].find((x) => (x.textContent || '').includes(label))
  const input = l!.querySelector('input') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const tab = (n: string) => tabs().find((t) => (t.textContent || '').includes(n))!
/** El chip de una pestaña, que es lo que la persona lee para saber qué le falta. */
const chip = (n: string) => (tab(n).textContent || '').replace(n, '').trim()

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
beforeEach(() => { llamadas.length = 0 })

describe('Rehacer una decisión — el bucle de R-0022', () => {
  /** La precondición del reporte: la fila ofrece rehacer y ⛔ no ofrece decidir (es un cambio). */
  it('la fila real de producción es la que ofrece «Volver a decidir»', () => {
    expect(estaDecidido(R22)).toBe(true)
    expect(esCambio(R22)).toBe(true)
    expect(puedeRehacerseLaDecision(R22)).toBe(true)
  })

  /**
   * 🔴 **EL test del defecto.** Sin el arreglo, el chip de «El cliente» es «✓» y la pantalla le
   * dice a la persona que el paso que decide ya está hecho.
   */
  it('el paso que DECIDE ⛔ no aparece tildado al rehacer', async () => {
    await abrir(R22)
    expect(chip('El cliente')).not.toContain('✓')
    // ⚠️ La mitad que evita que el test pase por una pantalla con los tildes rotos: en la MISMA
    // corrida, «Qué pasó» sí sigue tildado — su `escenario` está en la base y «Confirmar paso» lo
    // reescribe, así que ahí el ✓ nunca fue mentira.
    expect(chip('Qué pasó')).toContain('✓')
  })

  /**
   * 🔑 La pantalla tiene que **decir** que la decisión vieja sigue en pie, y decirlo en las TRES
   * pestañas: el defecto fue justamente que la persona no llegó a la tercera.
   */
  it('avisa cuál es la decisión que sigue valiendo, en cualquier pestaña', async () => {
    await abrir(R22)
    for (const p of ['Qué pasó', 'El producto', 'El cliente']) {
      await act(async () => { tab(p).click() })
      expect(texto(), `pestaña ${p}`).toContain('ya está decidido')
      // Nombrar la decisión vieja es la mitad que sirve: "ya está decidido" solo no dice cómo.
      expect(texto(), `pestaña ${p}`).toContain('lo cambia por otro producto')
    }
  })

  it('en un reclamo sin decidir ⛔ no aparece ese aviso', async () => {
    await abrir(SIN_DECIDIR)
    expect(texto()).not.toContain('ya está decidido')
  })

  /**
   * 🔴 El gesto exacto del reporte: confirmar el primer paso pega a `editar` y ⛔ nunca a
   * `decidir`. Eso está bien —decidir es del último paso— y por eso el toast ⛔ no puede decir
   * «podés salir y seguir después» como si no hubiera nada en juego.
   */
  it('«Confirmar paso» escribe campos pero ⛔ no rehace la decisión, y lo dice', async () => {
    await abrir(R22)
    await act(async () => { boton('Confirmar paso')!.click() })
    expect(llamadas.map((l) => l.que)).toEqual(['editar'])
    expect(texto()).toContain('Todavía NO rehiciste la decisión')

    // Y el cierre del bucle: salir recarga la lista (`onListo`) y ⛔ nunca pasó por `decidir`, así
    // que la fila vuelve a pintarse con la resolución vieja y su botón «Volver a decidir». Eso es
    // exactamente lo que Bruno vio, y ahora la pantalla lo dijo antes de que pasara.
    await act(async () => { boton('Salir')!.click() })
    expect({ listo, cerrado }).toEqual({ listo: 1, cerrado: 0 })
    expect(llamadas.some((l) => l.que === 'decidir')).toBe(false)
    expect(puedeRehacerseLaDecision(R22)).toBe(true)
  })

  it('el botón del final se llama como el gesto que hace', async () => {
    await abrir(R22)
    await act(async () => { tab('El cliente').click() })
    expect(boton('Volver a decidir')).toBeTruthy()
    await abrir(SIN_DECIDIR)
    await act(async () => { tab('El cliente').click() })
    expect(boton('Confirmar la decisión')).toBeTruthy()
  })
})

/**
 * 🔴 **Las TRES mitades de la oferta viajan juntas.** `registroDeRetencion` rechaza el registro a
 * medias, y `retencion_forma` entró el 27-ago-2026 sin sumarse a los dos payloads que la mandan:
 * confirmar el paso «El producto» y confirmar la decisión habrían vuelto un 400 en cuanto alguien
 * registrara una oferta. Ningún test lo cazaba porque los dos payloads se arman en el componente.
 */
describe('la oferta de retención: lo que sale de la pantalla', () => {
  it('«Confirmar paso» manda la forma junto con la respuesta y el monto', async () => {
    await abrir(SIN_DECIDIR)
    await act(async () => { tab('El producto').click() })
    await act(async () => { boton('Se lo ofrecí igual')!.click() })
    await tipear('Cuánto se le ofrece', '5000')
    await act(async () => { boton('Aceptó: se lo queda')!.click() })
    await act(async () => { boton('Confirmar paso')!.click() })
    const campos = llamadas.find((l) => l.que === 'editar')?.args[2] as Record<string, unknown>
    expect(campos.retencion_respuesta).toBe('acepto')
    expect(campos).toHaveProperty('retencion_forma')
    expect(campos.retencion_forma).toBeTruthy()
  })

  /**
   * 🔴 La mitad cara: acá el 400 no habría dejado **cerrar el reclamo**. Y el oráculo ⛔ no es que
   * el campo exista en el payload, sino que `registroDeRetencion` —la misma función que corre en
   * el servidor— lo acepte: mandar la clave con un valor que el núcleo rechaza da 400 igual.
   */
  it('«Confirmar la decisión» manda una oferta que el núcleo acepta', async () => {
    await abrir(SIN_DECIDIR)
    await act(async () => { tab('El producto').click() })
    await act(async () => { boton('Se lo ofrecí igual')!.click() })
    await tipear('Cuánto se le ofrece', '5000')
    await act(async () => { boton('Aceptó: se lo queda')!.click() })
    await act(async () => { tab('El cliente').click() })
    await act(async () => { boton('Confirmar la decisión')!.click() })

    const d = llamadas.find((l) => l.que === 'decidir')?.args[0] as Record<string, unknown>
    expect(d, 'la pantalla tiene que llegar a decidir, no quedar trabada').toBeTruthy()
    const veredicto = registroDeRetencion({
      motivo: 'no_esperaba',
      escenario: 'coincide',
      respuesta: d.retencion_respuesta as never,
      monto: d.retencion_monto as number,
      forma: d.retencion_forma as never,
      retornoDecidido: d.retorno_decidido === true,
    })
    expect(veredicto.error).toBeUndefined()
    expect(veredicto.campos?.retencion_forma).toBeTruthy()
  })
})
