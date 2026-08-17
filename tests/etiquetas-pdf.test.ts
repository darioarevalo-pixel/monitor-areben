import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

/**
 * Paridad del dibujo de las etiquetas.
 *
 * 🔴 **`lib/etiquetas/pdf.ts` no tenía un solo test**, y es el archivo que decide qué sale de la
 * impresora: las tres copias del layout, el precio tachado, el auto-shrink del SKU. La geometría
 * (5 × 2,5 cm, Code 128) **sale en una Zebra real** y el archivo es un port byte-fiel del legacy, o
 * sea que acá no hay nada que «mejorar»: lo único que se puede hacer es no moverlo sin darse
 * cuenta.
 *
 * 🔑 **Se compara la CINTA de órdenes de dibujo, no el PDF binario.** Un `Buffer` de jsPDF cambia
 * con la versión de la librería, con la fecha de creación y con cualquier metadato, así que un
 * test contra los bytes daría rojo por motivos que no son el dibujo — y, peor, no diría *qué*
 * cambió. La cinta dice cada `text`/`line`/`addImage` con su posición, su cuerpo y su tipografía:
 * un renglón corrido dos décimas se lee en el diff.
 *
 * ⚠️ **El jsPDF de acá es un doble.** `splitTextToSize` y `getTextWidth` son deterministas y no
 * miden la fuente real, así que la cinta **no prueba que un nombre largo entre en la etiqueta** —
 * prueba que el layout no se movió. Lo que mide de verdad el ancho es la Zebra.
 *
 * ⛔ **Si un cambio de dibujo es a propósito**, se regenera con `ETIQUETAS_PARIDAD=escribir`, se
 * mira el diff del `.json` renglón por renglón y se commitea junto con el cambio.
 */

// ⚠️ Al lado del test y NO en `tests/fixtures/`, que está gitignoreado: los tests que dependen de
// esa carpeta se auto-skipean cuando el archivo no está, y una paridad que en el CI no compara nada
// es exactamente el verde que no significa nada.
const CINTA = 'tests/etiquetas-pdf.paridad.json'

/** Lo que la cinta registra de una llamada. */
type Orden = string

let cinta: Orden[] = []

/** Ancho fingido: cada carácter mide medio cuerpo. Determinista y suficiente para el layout. */
const anchoDe = (txt: string, fs: number) => txt.length * fs * 0.5

class PdfDoble {
  fs = 16
  font = 'helvetica/normal'
  constructor(opts: Record<string, unknown>) {
    cinta.push(`nuevo(${JSON.stringify(opts)})`)
  }
  addPage(formato: number[], orient: string) { cinta.push(`addPage(${formato.join('x')}|${orient})`) }
  setFont(f: string, estilo: string) { this.font = `${f}/${estilo}` }
  setFontSize(fs: number) { this.fs = fs }
  setTextColor(c: number) { cinta.push(`color(${c})`) }
  setDrawColor(c: number) { cinta.push(`trazo(${c})`) }
  setFillColor(...c: number[]) { cinta.push(`relleno(${c.join(',')})`) }
  setLineWidth(w: number) { cinta.push(`grosor(${w})`) }
  getTextWidth(txt: string) { return anchoDe(txt, this.fs) }
  splitTextToSize(txt: string, ancho: number): string[] {
    const porLinea = Math.max(1, Math.floor(ancho / (this.fs * 0.5)))
    const out: string[] = []
    for (const palabra of String(txt).split(/\s+/)) {
      const ultima = out[out.length - 1]
      if (ultima && (ultima + ' ' + palabra).length <= porLinea) out[out.length - 1] = `${ultima} ${palabra}`
      else out.push(palabra)
    }
    return out.length ? out : ['']
  }
  text(txt: string | string[], x: number, y: number, opts?: Record<string, unknown>) {
    const cuerpo = Array.isArray(txt) ? txt.join(' ⏎ ') : txt
    cinta.push(`text("${cuerpo}"@${red(x)},${red(y)} ${opts?.align}/${opts?.baseline} ${this.font} ${this.fs})`)
  }
  line(x1: number, y1: number, x2: number, y2: number) { cinta.push(`line(${red(x1)},${red(y1)}→${red(x2)},${red(y2)})`) }
  circle(x: number, y: number, r: number, modo: string) { cinta.push(`circle(${red(x)},${red(y)},${r},${modo})`) }
  addImage(_data: string, fmt: string, x: number, y: number, w: number, h: number) {
    cinta.push(`img(${fmt}@${red(x)},${red(y)} ${red(w)}x${red(h)})`)
  }
}

/** Dos décimas de milímetro es el grano de la Zebra; más decimales son ruido de coma flotante. */
const red = (n: number) => Math.round(n * 100) / 100

vi.mock('jspdf', () => ({ jsPDF: PdfDoble }))
vi.mock('jsbarcode', () => ({ default: () => {} }))

// El dibujo de las barras hace `document.createElement('canvas')`. Sin esto cae al `catch` que
// escribe el número como texto, que es otro camino: el que corre en el navegador es éste.
vi.stubGlobal('document', {
  createElement: () => ({ toDataURL: () => 'data:image/png;base64,XX' }),
})

const { buildEtiquetasPdf, buildLibrePdf } = await import('@/lib/etiquetas/pdf')
type VarianteEti = import('@/lib/etiquetas/tipos').VarianteEti

/** Un producto fijo. Nada de esto se toca: mover el fixture invalida la comparación. */
const PRENDA: VarianteEti = {
  id: 'v1', pid: '101', name: 'Jean Foster Tiro Alto', size: '38', sku: 'JF-38', barcode: '7790001234567', stock: 4,
}
const SIN_SKU: VarianteEti = { ...PRENDA, id: 'v2', sku: '', name: 'Top Aurea', size: 'U' }

const CTX = {
  precioDe: () => 34990,
  promoDe: () => ({ normal: 52990, promo: 34990 }),
  fpLines: [
    { texto: 'FORMAS DE PAGO', tam: 'titulo' as const, bold: true },
    { texto: '3 cuotas sin interés', tam: 'normal' as const, bold: false },
  ],
}

async function grabar(fn: () => Promise<unknown>): Promise<Orden[]> {
  cinta = []
  await fn()
  return cinta
}

describe('el dibujo de las etiquetas no se mueve', () => {
  it('los cuatro modos, la de formas de pago y la libre dan la misma cinta de siempre', async () => {
    const salida: Record<string, Orden[]> = {}
    for (const modo of ['dep', 'loc', 'promo', 'sku'] as const) {
      salida[modo] = await grabar(() => buildEtiquetasPdf([PRENDA], modo, CTX))
      salida[`${modo}-sin-sku`] = await grabar(() => buildEtiquetasPdf([SIN_SKU], modo, CTX))
    }
    // El lote real mezcla: dos prendas, separador y la de formas de pago intercalada.
    salida['lote'] = await grabar(() => buildEtiquetasPdf([PRENDA, null, SIN_SKU, { __fp: true }], 'loc', CTX))
    // La cola decide el dibujo prenda por prenda: la que vuelve a precio de lista no lleva tachado.
    salida['cola-mixta'] = await grabar(() =>
      buildEtiquetasPdf([PRENDA, SIN_SKU], 'promo', { ...CTX, modoDe: (v) => (v.sku ? 'promo' : 'loc') }),
    )
    // 🔴 Precio cero en la etiqueta de precio: cae a la de información, sin precio y sin avisar.
    salida['loc-precio-cero'] = await grabar(() => buildEtiquetasPdf([PRENDA], 'loc', { ...CTX, precioDe: () => 0 }))
    salida['libre-chica'] = await grabar(() =>
      buildLibrePdf({ grande: false, copias: 2, barcode: '779000', precio: 12990, lineas: CTX.fpLines }),
    )
    salida['libre-grande'] = await grabar(() =>
      buildLibrePdf({ grande: true, copias: 1, barcode: '', precio: null, lineas: CTX.fpLines }),
    )

    if (process.env.ETIQUETAS_PARIDAD === 'escribir') {
      writeFileSync(CINTA, JSON.stringify(salida, null, 2) + '\n')
    }
    expect(salida).toEqual(JSON.parse(readFileSync(CINTA, 'utf8')))
  })

  it('la etiqueta libre vacía no dibuja nada: devuelve null', async () => {
    expect(await buildLibrePdf({ grande: false, copias: 1, barcode: '', precio: null, lineas: [] })).toBeNull()
  })
})
