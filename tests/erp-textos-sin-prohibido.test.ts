// El «⛔» de las notas quiere decir «no»; en una pantalla se lee como un emoji y la frase dice lo contrario
// («⛔ mueve el stock ni sale a GN», 15-oct). Ningún texto del ERP lo lleva fuera de un comentario.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ARCHIVOS = [
  ...readdirSync('components/erp').filter((f) => f.endsWith('.tsx')).map((f) => `components/erp/${f}`),
  'api/_erp.js',
  'api/_facturacion.js',
  ...readdirSync('lib/erp').filter((f) => /\.(js|ts)$/.test(f)).map((f) => `lib/erp/${f}`),
]
const COMENTARIO = /^\s*(\/\/|\*|\/\*|\{\/\*)/

describe('textos del ERP sin «⛔»', () => {
  it.each(ARCHIVOS)('%s', (archivo) => {
    const lineas = readFileSync(archivo, 'utf8').split('\n')
    const malas = lineas.flatMap((l, i) => (l.includes('⛔') && !COMENTARIO.test(l) ? [`${i + 1}: ${l.trim().slice(0, 100)}`] : []))
    expect(malas).toEqual([])
  })
})
