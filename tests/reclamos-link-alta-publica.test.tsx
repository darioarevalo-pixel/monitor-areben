// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReclamoRow } from '@/lib/reclamos/tipos'
import { mensajeAltaPublica } from '@/lib/reclamos/mensajes'
import { linkDelAltaPublica, linkDelCliente } from '@/lib/reclamos/cliente'

/**
 * **Por dónde le llega el link al cliente** (30-ago-2026). Bruno: *«mandan la consulta a algún
 * canal de comunicación, y le enviamos el link»* ⇒ el link ⛔ no sale de ningún automatismo: lo
 * pega **una persona** contestando un mensaje.
 *
 * 🔴 **La puerta existía desde el 30-ago y ⛔ no estaba en ninguna pantalla**: `/reclamo?m=bdi`
 * andaba, pero quien contesta el canal tenía que saberlo de memoria, y ⛔ no había ningún mensaje
 * para mandarlo — era el único momento del circuito sin texto.
 */

describe('el link del alta pública', () => {
  /**
   * 🔑 **Son DOS links distintos y el que los separa es el token**: `linkDelCliente` acuña uno por
   * reclamo, para uno que **ya existe**; el del alta es fijo por marca y sirve para el que todavía
   * ⛔ no existe. Confundirlos manda al cliente a un 404.
   */
  it('⛔ no es el link del reclamo ya creado', () => {
    expect(linkDelAltaPublica('bdi')).toContain('/reclamo?m=bdi')
    expect(linkDelAltaPublica('zattia')).toContain('/reclamo?m=zattia')
    expect(linkDelAltaPublica('bdi')).not.toBe(linkDelCliente('bdi'))
    // La marca viaja en el link: sin ella el portal ⛔ no sabe de qué tienda es la orden.
    expect(linkDelAltaPublica('zattia')).not.toContain('m=bdi')
  })

  /**
   * 🔴 🔑 **La mitad útil del mensaje: qué le va a pedir la puerta.** El alta pide el número de
   * pedido **y el mail con el que compró** —verificado contra la puerta viva el 30-ago—, y sin las
   * dos ⛔ no entra: el número solo es correlativo. Un mensaje que manda el link sin decirlo deja a
   * la persona rebotando en el primer paso, creyendo que el link no anda.
   */
  it('el mensaje avisa que le van a pedir el pedido Y el mail', () => {
    const texto = mensajeAltaPublica('https://x/reclamo?m=bdi')
    expect(texto).toContain('número de tu pedido')
    expect(texto).toContain('mail con el que compraste')
    expect(texto).toContain('https://x/reclamo?m=bdi')
  })

  /**
   * ⚠️ **⛔ No promete nada**, como los otros once que ⛔ no son hechos: ni plazos, ni plata, ni
   * que se resuelve. Es la regla que ordena los doce mensajes y ⛔ no una nueva.
   */
  it('⛔ no promete plazos ni resultados', () => {
    const texto = mensajeAltaPublica('https://x/reclamo?m=bdi')
    expect(texto).not.toMatch(/devolv|reintegr|cupón|24 h|horas|días hábiles/i)
  })
})

// ── Y el cable: que la pantalla lo OFREZCA ────────────────────────────────────

const FILAS: ReclamoRow[] = []
vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return { ...real, leerReclamos: vi.fn(async () => ({ filas: FILAS, hayMas: false })) }
})

const { Devoluciones, ReclamosLocal } = await import('@/components/reclamos/Reclamos')
const { ToastProvider } = await import('@/components/ui/Toast')
const { SesionProvider } = await import('@/components/SesionProvider')

/**
 * ⚠️ **El portapapeles se espía, ⛔ no se simula el helper.** Lo que hay que probar es **qué texto
 * termina en el portapapeles**, y `copiarAlPortapapeles` es justo el que decide qué se muestra
 * cuando el navegador dice que no. Mockearlo probaría el mock.
 */
const copiado: string[] = []
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (t: string) => { copiado.push(t) } },
})

const pintar = async (Pantalla: () => React.ReactNode, apretar?: string) => {
  window.history.replaceState(null, '', '/postventa')
  FILAS.length = 0
  copiado.length = 0
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Pantalla /></ToastProvider></SesionProvider>)
  })
  if (apretar) {
    const b = [...div.querySelectorAll('button')].find((x) => (x.textContent || '').includes(apretar))
    if (!b) throw new Error(`no está el botón «${apretar}»`)
    await act(async () => { (b as HTMLElement).click() })
  }
  const salida = {
    botones: [...div.querySelectorAll('button')].map((b) => (b.textContent || '').trim()),
    texto: div.textContent || '',
    copiado: copiado.join('\n'),
  }
  await act(async () => { root.unmount() })
  div.remove()
  return salida
}

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

/**
 * 🔴 **El cable es lo que faltaba, ⛔ no la regla.** El link y el mensaje pueden existir y estar
 * probados, y si ninguna pantalla los ofrece el cliente ⛔ no lo recibe nunca — que es exactamente
 * la forma [[feedback_areben_pendiente_derivado_sin_gesto]], por quinta vez en este módulo.
 */
describe('la pantalla ofrece el link', () => {
  it('Administración lo puede copiar', async () => {
    const { botones, texto } = await pintar(Devoluciones)
    expect(botones.some((b) => b.includes('Copiar el mensaje con el link'))).toBe(true)
    // Y dice lo que la puerta pide, para que no se mande el link a secas.
    expect(texto).toContain('mail con el que compraron')
  })

  /**
   * 🔑 **El local también, y es el que más lo necesita**: es quien atiende el canal. La descripción
   * de esa sección todavía cuenta el circuito viejo (*«abrí el reclamo y pasale el link»*), que
   * ahora es la segunda opción y ⛔ no la primera.
   */
  it('y el local también, que es quien atiende el canal', async () => {
    const { botones } = await pintar(ReclamosLocal)
    expect(botones.some((b) => b.includes('Copiar el mensaje con el link'))).toBe(true)
  })

  /**
   * 🔴 🔑 **Que el botón ESTÉ ⛔ no dice qué copia.** Con el test mirando sólo el rótulo, un
   * mutante que copiaba **el link pelado** —sin decirle a la persona que le van a pedir el mail—
   * sobrevivía entero. Lo que hay que fijar es **lo que termina en el portapapeles**.
   */
  it('🔴 lo que copia es el MENSAJE entero, ⛔ no el link pelado', async () => {
    const { copiado } = await pintar(Devoluciones, 'Copiar el mensaje con el link')
    expect(copiado).toContain('/reclamo?m=')
    expect(copiado).toContain('mail con el que compraste')
    // Y ⛔ no es sólo la URL: un link a secas ⛔ no tiene renglones.
    expect(copiado.split('\n').length).toBeGreaterThan(3)
  })

  /**
   * ⚠️ **La otra mitad: el botón de al lado copia el link SOLO**, para el que ya escribió su
   * propio texto. Sin esta mitad, el test de arriba se cumpliría con los dos botones iguales.
   */
  it('y el botón de al lado copia sólo el link', async () => {
    const { copiado } = await pintar(Devoluciones, 'Copiar sólo el link')
    expect(copiado).toContain('/reclamo?m=')
    expect(copiado).not.toContain('mail con el que compraste')
  })
})
