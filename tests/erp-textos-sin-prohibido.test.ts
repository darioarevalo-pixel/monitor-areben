// El «⛔» de las notas quiere decir «no»; en una pantalla se lee como un emoji y la frase dice lo contrario
// («⛔ mueve el stock ni sale a GN», 15-oct). Ningún texto del ERP lo lleva fuera de un comentario, y lo que viene
// del motor sin traducción pasa por `textoDelMotor`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
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

/** Todo lo del ERP: sus pantallas, sus núcleos y sus handlers (`api/_erp*.js` y la facturación). */
const ARCHIVOS = [
  ...archivos('components/erp'),
  ...archivos('lib/erp'),
  ...readdirSync('api').filter((f) => /^_erp.*\.js$/.test(f) || f === '_facturacion.js').map((f) => `api/${f}`),
]

describe('textos del ERP sin «⛔»', () => {
  it('encuentra los archivos', () => {
    expect(ARCHIVOS).toContain('components/erp/CambioCaja.tsx')
    expect(ARCHIVOS).toContain('api/_erp.js')
  })

  it.each(ARCHIVOS)('%s', (archivo) => {
    const malas = sinComentarios(readFileSync(archivo, 'utf8'))
      .split('\n')
      .filter((l) => l.includes('⛔'))
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
