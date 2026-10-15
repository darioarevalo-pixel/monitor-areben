// El «⛔» de las notas quiere decir «no»; en una pantalla se lee como un emoji y la frase dice lo contrario
// («⛔ mueve el stock ni sale a GN», 15-oct). Bruno, 15-oct («dale»): NINGÚN texto del monitor lo lleva fuera de un
// comentario —las pantallas, sus núcleos y sus handlers—, y lo que viene del motor sin traducción pasa por `textoDelMotor`.
// La única excepción es un ícono a propósito (la caja «Nunca» de `components/ui/Markdown.tsx`).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MENSAJE_ERROR_MOTOR, textoDelMotor } from '../lib/erp/venta.core.js'

/** Lo mismo que `tests/vocabulario.test.ts`: fuera los comentarios de bloque (también los de JSX) y de línea. */
function sinComentarios(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    if (src.startsWith('/*', i)) {
      const j = src.indexOf('*/', i + 2)
      i = j === -1 ? src.length : j + 2
    } else if (src.startsWith('//', i)) {
      const j = src.indexOf('\n', i)
      i = j === -1 ? src.length : j
    } else {
      out += src[i]
      i += 1
    }
  }
  return out
}

const archivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e)
    return statSync(p).isDirectory() ? archivos(p) : /\.(tsx?|m?js)$/.test(p) ? [p] : []
  })

/** Todo el monitor que llega a una pantalla. `motor/` es la copia del motor (se cuida en su repo: `test/textos.test.mjs`). */
const ARCHIVOS = ['components', 'app', 'lib', 'api'].filter((d) => existsSync(d)).flatMap(archivos)

/** Los íconos a propósito: el archivo y la línea exacta (⛔ «el archivo entero»: lo demás de ese archivo también se mira). */
const ICONOS = [{ archivo: join('components', 'ui', 'Markdown.tsx'), linea: "icono: '⛔'" }]

describe('textos del monitor sin «⛔»', () => {
  it('encuentra los archivos', () => {
    expect(ARCHIVOS).toContain('components/erp/CambioCaja.tsx')
    expect(ARCHIVOS).toContain('api/_erp.js')
    expect(ARCHIVOS).toContain('components/prm/MovimientoProveedor.tsx')
    expect(ARCHIVOS.some((f) => f.startsWith('motor'))).toBe(false)
  })

  it.each(ARCHIVOS)('%s', (archivo) => {
    const malas = sinComentarios(readFileSync(archivo, 'utf8'))
      .split('\n')
      .filter((l) => l.includes('⛔') && !ICONOS.some((x) => x.archivo === archivo && l.includes(x.linea)))
      .map((l) => l.trim().slice(0, 100))
    expect(malas).toEqual([])
  })

  it('las traducciones del motor tampoco', () => {
    expect(Object.values(MENSAJE_ERROR_MOTOR).filter((m) => m.includes('⛔'))).toEqual([])
  })
})

describe('textoDelMotor', () => {
  it('un código traducido dice la traducción', () => {
    expect(textoDelMotor({ codigo: 'SIN_FACTURA', mensaje: 'La venta 7 ⛔ tiene factura' })).toBe(MENSAJE_ERROR_MOTOR.SIN_FACTURA)
  })
  it('uno sin traducción dice el del motor, con «no» en vez de «⛔»', () => {
    expect(textoDelMotor({ codigo: 'NUEVO', mensaje: 'Un cambio entre marcas ⛔ se puede todavía' })).toBe('Un cambio entre marcas no se puede todavía')
  })
})
