// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * **El CABLE: que la lista dibuje los mensajes que dice la regla** (27-ago-2026).
 *
 * `tests/reclamos-mensajes-por-momento.test.ts` fija la función pura. Esto fija el otro lado, y es
 * la mitad que este módulo ya perdió dos veces: *«los dos lados estaban bien por separado y el bug
 * vivía en la pregunta del medio»*. Sin este archivo, alguien puede volver a escribir la condición
 * a mano en el JSX —que es de donde salió el defecto— con la regla y sus ocho tests en verde.
 *
 * 🔑 El oráculo es **lo que la pantalla dibuja**: los `label` de los botones de la fila. ⛔ No el
 * estado interno ni la lista que devuelve la regla.
 */

const FILAS: ReclamoRow[] = []

vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return { ...real, leerReclamos: vi.fn(async () => FILAS) }
})

const { Devoluciones } = await import('@/components/reclamos/Reclamos')
const { ToastProvider } = await import('@/components/ui/Toast')
const { SesionProvider } = await import('@/components/SesionProvider')

const base = {
  id: 1, store: 'bdi', estado: 'borrador', motivo: 'falla', cliente: 'Quien Sea',
  items: [{ sku: 'X', producto: 'P', cantidad: 1, precio: '1000.00' }],
  reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  cupon_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', reingreso_estado: 'no_aplica',
  reclamo_correo_estado: 'no_aplica',
} as unknown as ReclamoRow

/** Monta la lista con estas filas y devuelve el texto de los botones que quedaron dibujados. */
const botones = async (filas: ReclamoRow[]): Promise<string[]> => {
  FILAS.length = 0
  FILAS.push(...filas)
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Devoluciones /></ToastProvider></SesionProvider>)
  })
  const txt = [...div.querySelectorAll('button')].map((b) => b.textContent || '')
  await act(async () => { root.unmount() })
  div.remove()
  return txt
}

/**
 * **Aprieta el botón y devuelve lo que quedó en el portapapeles.**
 *
 * 🔑 El `label` dice cuál mensaje se ofrece; **esto dice cuál se copia**, que es lo único que llega
 * al cliente. Sin esta mitad, un botón bien rotulado que manda el texto de otro momento pasa
 * entero: los dos lados en verde y el bug en la pregunta del medio.
 */
const copiadoAlApretar = async (filas: ReclamoRow[], rotulo: string): Promise<string> => {
  let copiado = ''
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => { copiado = t } },
  })
  FILAS.length = 0
  FILAS.push(...filas)
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Devoluciones /></ToastProvider></SesionProvider>)
  })
  const b = [...div.querySelectorAll('button')].find((x) => (x.textContent || '').includes(rotulo))
  if (!b) throw new Error(`no está el botón «${rotulo}»`)
  await act(async () => { b.click() })
  await act(async () => { root.unmount() })
  div.remove()
  return copiado
}

/**
 * ⚠️ El texto del botón viene con el ícono pegado adelante (`📋Msj: pedir fotos`), así que se
 * busca por `includes` y se devuelve el rótulo limpio: comparar contra el string entero ataría el
 * test al ícono del kit, que ⛔ no es lo que se está probando.
 */
const conMensaje = (bs: string[]) =>
  bs.filter((b) => b.includes('Msj:')).map((b) => b.slice(b.indexOf('Msj:')))

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

describe('la lista dibuja los mensajes del momento', () => {
  beforeEach(() => { window.history.replaceState(null, '', '/postventa') })

  it('sin fotos: ofrece pedirlas', async () => {
    expect(conMensaje(await botones([base]))).toEqual(['Msj: pedir fotos'])
  })

  /**
   * 🔴 El defecto que reportó Bruno: *«si ya cargó fotos, y estamos en la parte de decisión, no hay
   * más fotos que cargar»*. Con la foto cargada, la columna de acciones queda **sin** ese botón.
   */
  it('🔴 con la foto ya cargada ⛔ no aparece «Msj: pedir fotos» en la fila', async () => {
    const conFoto = { ...base, estado: 'en_revision', fotos: [{ url: 'https://blob/1.jpg' }] } as unknown as ReclamoRow
    const bs = await botones([conFoto])
    expect(conMensaje(bs)).toEqual([])
    expect(bs.join(' ')).not.toContain('pedir fotos')
  })

  it('decidido: aparece el de resolución', async () => {
    const decidido = { ...base, estado: 'en_revision', compensacion: 'plata_total' } as unknown as ReclamoRow
    expect(conMensaje(await botones([decidido]))).toEqual(['Msj: resolución'])
  })

  /**
   * 🔴 **El botón que no existía**, y el momento en el que el reclamo pasa la mayor parte de su
   * vida: la oferta mandada, esperando que el cliente conteste.
   *
   * 🔑 Y las dos mitades: aparece el de la propuesta **y ⛔ NO el de resolución**. Mientras la
   * oferta espera, la resolución guardada es la salida *«por si dice que no»* — los dos botones
   * juntos son dos promesas distintas sobre el mismo reclamo, y la que salga primero es la que el
   * cliente va a reclamar después.
   */
  it('🔴 con la oferta esperando: aparece la propuesta y ⛔ NO la resolución', async () => {
    const esperando = {
      ...base, estado: 'resuelto', compensacion: 'plata_total',
      retencion_monto: 13491, retencion_forma: 'plata', retencion_respuesta: null,
    } as unknown as ReclamoRow
    const bs = await botones([esperando])
    expect(conMensaje(bs)).toEqual(['Msj: la propuesta'])
    expect(bs.join(' ')).not.toContain('resolución')
  })

  /**
   * 🔴 **El eslabón que faltaba del circuito** *(Administración decide · el local habla y ejecuta)*:
   * hasta el 28-ago-2026 la respuesta del cliente sólo se podía anotar reabriendo Decidir. Los dos
   * botones se dibujan **en el mismo momento que el mensaje de la propuesta** — que es el momento en
   * que la pregunta está hecha y falta la respuesta.
   */
  it('🔴 con la oferta esperando: aparecen «Aceptó» y «No aceptó»', async () => {
    const esperando = {
      ...base, estado: 'resuelto', compensacion: 'plata_total',
      retencion_monto: 13491, retencion_forma: 'plata', retencion_respuesta: null,
    } as unknown as ReclamoRow
    const bs = (await botones([esperando])).map((b) => b.trim())
    expect(bs).toContain('Aceptó')
    expect(bs).toContain('No aceptó')
  })

  /** ⛔ Y sin oferta esperando ⛔ no hay nada que contestar: los dos botones ⛔ no existen. */
  it('sin oferta esperando ⛔ no aparece ninguno de los dos', async () => {
    const decidido = { ...base, estado: 'en_revision', compensacion: 'plata_total' } as unknown as ReclamoRow
    const bs = (await botones([decidido])).map((b) => b.trim())
    expect(bs).not.toContain('Aceptó')
    expect(bs).not.toContain('No aceptó')
  })

  /**
   * 🔴 **El otro momento que no tenía mensaje**: en tránsito por correo y sin etiqueta todavía, el
   * cliente ⛔ no puede despachar nada y no lo sabe.
   */
  it('🔴 en tránsito sin etiqueta: ofrece avisarle que va en camino', async () => {
    const sinEtiqueta = { ...base, estado: 'en_transito', compensacion: 'plata_total', via_retorno: 'andreani' } as unknown as ReclamoRow
    expect(conMensaje(await botones([sinEtiqueta]))).toEqual(['Msj: resolución', 'Msj: la etiqueta va en camino'])
  })

  /** Contestada, no hay nada que preguntar: vuelve el de resolución. */
  it('contestada: se va la propuesta y vuelve la resolución', async () => {
    const contestada = {
      ...base, estado: 'resuelto', compensacion: 'plata_total',
      retencion_monto: 13491, retencion_forma: 'plata', retencion_respuesta: 'rechazo',
    } as unknown as ReclamoRow
    expect(conMensaje(await botones([contestada]))).toEqual(['Msj: resolución'])
  })

  /**
   * 🔴 **El cable del mensaje que no tenía botón** (28-ago-2026): la regla nueva no vale nada si el
   * JSX no la dibuja — que es exactamente la forma del defecto que se está arreglando (el texto
   * existía, probado, y nadie lo llamaba).
   */
  it('🔴 despachado lo que se le manda: la fila ofrece avisarle', async () => {
    const despachado = {
      ...base, estado: 'resuelto', compensacion: 'otro_producto',
      envio_nuevo_estado: 'hecho', seguimiento_ida: 'IDA9',
    } as unknown as ReclamoRow
    expect(conMensaje(await botones([despachado]))).toEqual(['Msj: resolución', 'Msj: ya lo despachamos'])
  })

  /**
   * 🔴 **Y que copie ESE mensaje.** El rótulo y el texto son dos cosas: `mensajeSeguimiento` toma
   * cuál de los tres momentos armar como un parámetro suelto, así que un botón bien rotulado que
   * pide *«plata»* dice que le devolvimos la plata a alguien a quien le mandamos un paquete.
   */
  it('🔴 y el botón copia el texto del despacho, ⛔ no el de otro momento', async () => {
    const despachado = {
      ...base, estado: 'resuelto', compensacion: 'otro_producto',
      envio_nuevo_estado: 'hecho', seguimiento_ida: 'IDA9', monto_total: 15283,
    } as unknown as ReclamoRow
    const txt = await copiadoAlApretar([despachado], 'Msj: ya lo despachamos')
    expect(txt).toContain('el producto de tu cambio')
    expect(txt).toContain('IDA9')
    expect(txt).not.toContain('devolución')
  })
})
