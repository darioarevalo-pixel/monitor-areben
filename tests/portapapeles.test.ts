// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copiarAlPortapapeles } from '@/lib/portapapeles'

/**
 * 🔴 **Copiar al portapapeles falla seguido y falla CALLADO, y lo caro es lo que pasa después.**
 *
 * Hasta el 27-ago-2026, crear un reclamo hacía `navigator.clipboard?.writeText(link).catch(() => {})`
 * y el cartel decía «el link para el cliente quedó copiado» **pase lo que pase**. Cuando el
 * navegador no acepta —no hay contexto seguro, o perdió el gesto del usuario en un `await`— la
 * persona pega en WhatsApp **lo que hubiera antes en el portapapeles**: el link de otro cliente. No
 * hay error, no hay log, y del lado del cliente se ve como «me mandaron un link que no anda».
 *
 * Por eso el contrato de `copiarAlPortapapeles` tiene dos mitades y las dos se prueban acá:
 *   1. **nunca deja a la persona sin el texto** (si no copia, se lo muestra para copiar a mano), y
 *   2. **devuelve si lo hizo solo**, para que el que llama no pueda afirmar de arriba.
 */

const conClipboard = (impl: () => Promise<void>) => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(impl) }, configurable: true, writable: true,
  })
}
const sinClipboard = () => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true })
}

afterEach(() => { vi.restoreAllMocks() })

describe('copiarAlPortapapeles', () => {
  it('cuando el navegador acepta, dice que sí y NO molesta con el cuadro', async () => {
    conClipboard(async () => {})
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)

    expect(await copiarAlPortapapeles('https://monitor/reclamo/abc')).toBe(true)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://monitor/reclamo/abc')
    expect(prompt).not.toHaveBeenCalled()
  })

  it('cuando el navegador RECHAZA, dice que no y le muestra el texto para copiarlo a mano', async () => {
    conClipboard(async () => { throw new Error('NotAllowedError') })
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)

    expect(await copiarAlPortapapeles('https://monitor/reclamo/abc')).toBe(false)
    // Lo que importa no es el cartel: es que el link esté a la vista. Sin esto, un `false` honesto
    // deja a la persona igual de trabada que la mentira que reemplazó.
    expect(prompt).toHaveBeenCalledWith(expect.any(String), 'https://monitor/reclamo/abc')
  })

  it('cuando no hay portapapeles (contexto no seguro), tampoco miente', async () => {
    sinClipboard()
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)

    expect(await copiarAlPortapapeles('https://monitor/reclamo/abc')).toBe(false)
    expect(prompt).toHaveBeenCalledWith(expect.any(String), 'https://monitor/reclamo/abc')
  })
})

/**
 * La otra mitad: que los dos que copian **pasen por acá**.
 *
 * Es texto contra texto a propósito, igual que `blob-upload-sesion.test.ts`: lo que hay que impedir
 * no es un comportamiento sino **que vuelva a aparecer un `navigator.clipboard` suelto**, que es la
 * forma exacta que tenía el defecto. Un test de comportamiento del helper no puede ver eso: el
 * llamador que no lo usa no lo rompe.
 */
const raiz = join(__dirname, '..')

/**
 * El fuente SIN comentarios.
 *
 * 🔴 **Sin esto el test falla sobre su propia explicación.** Los dos archivos tienen, arriba del
 * arreglo, un comentario que cuenta cuál era el defecto — y para contarlo escribe
 * `navigator.clipboard` textual. Contar sobre el archivo crudo daba rojo con el código ya
 * arreglado. Ya está anotado en el repo como modo de falla propio de los tests de texto.
 *
 * Se sacan sólo comentarios de bloque: medido antes de escribirlo, ninguno de los dos archivos
 * tiene un `/*` adentro de un string, que es lo único que este recorte rompería.
 */
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '')

const leer = (rel: string) => sinComentarios(readFileSync(join(raiz, rel), 'utf8'))
const reclamos = leer('components/reclamos/Reclamos.tsx')
const copyButton = leer('components/ui/CopyButton.tsx')

describe('los que copian pasan por el helper, no por navigator.clipboard', () => {
  it('sacar los comentarios no se comió el código (si esto se cae, lo de abajo no significa nada)', () => {
    // Un recorte que devuelve vacío haría pasar todas las aserciones negativas de abajo.
    expect(reclamos).toContain('copiarAlPortapapeles')
    expect(copyButton).toContain('export function CopyButton')
  })

  it('el alta del reclamo copia el link con el helper', () => {
    expect(reclamos).toContain('copiarAlPortapapeles(linkDelCliente(token))')
  })

  it('el alta NO vuelve a tocar navigator.clipboard a mano', () => {
    expect(reclamos).not.toMatch(/navigator\.clipboard/)
  })

  it('el CopyButton del kit tampoco', () => {
    expect(copyButton).toContain('copiarAlPortapapeles')
    expect(copyButton).not.toMatch(/navigator\.clipboard/)
  })
})
