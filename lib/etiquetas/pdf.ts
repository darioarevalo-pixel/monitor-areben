/**
 * Dibujo e impresión de los PDF de etiquetas. Cliente-only: usa jsPDF + JsBarcode
 * (canvas). Port BYTE-FIEL de _etiBuildPdf/_etiDrawFP/_etiPrint/_libreBuildPdf
 * (index.html:6826-7208) — la geometría de la etiqueta (5×2,5 cm, Code 128) sale en
 * una Zebra real, así que las medidas se copian tal cual, no se "mejoran".
 *
 * jsPDF y JsBarcode entran por import dinámico (como el resto de los PDF del proyecto,
 * ver lib/sesionfotos/pdf.ts): son de cliente y el bundle no los sube hasta imprimir.
 */

import type { LabelItem, LineaEtiqueta, ModoEtiqueta, Promo, VarianteEti } from './tipos'

const FP_FS: Record<string, number> = { titulo: 11, subtitulo: 9, normal: 8, chico: 6.5 }

export type CtxEtiqueta = {
  precioDe: (v: VarianteEti) => number
  promoDe: (v: VarianteEti) => Promo | null
  fpLines: LineaEtiqueta[]
  /**
   * Qué etiqueta le toca a ESTA prenda, cuando no es la misma para todo el lote.
   *
   * 🔑 **Lo pide la cola de reetiquetado, que mezcla dos casos por naturaleza.** El día que se
   * levanta un sale, los productos vuelven a precio de lista y su etiqueta es la de precio, sin
   * tachado; los que entran a una promo nueva llevan la de precio rebajado. Imprimir todo el lote
   * con un modo solo pondría un «antes» que no existe, o se comería el que sí.
   *
   * Sin esto puesto manda `modo`, que es el caso de las cuatro pestañas de siempre. No toca la
   * geometría: elige entre los dibujos que ya están.
   */
  modoDe?: (v: VarianteEti) => ModoEtiqueta
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdf = any

/** Dibuja la etiqueta de formas de pago centrada. Port de _etiDrawFP. */
function drawFP(pdf: Pdf, W: number, Hh: number, M: number, CX: number, fpLines: LineaEtiqueta[]) {
  const lines = fpLines.filter((l) => (l.texto || '').trim())
  if (!lines.length) return
  const gap = 0.8
  const ops = lines.map((l, idx) => {
    pdf.setFont('helvetica', l.bold ? 'bold' : 'normal')
    const fs = FP_FS[l.tam] || FP_FS.normal
    pdf.setFontSize(fs)
    const w = pdf.splitTextToSize(l.texto, W - M * 2)
    return { w, fs, bold: l.bold, h: w.length * (fs * 0.42), gap: idx ? gap : 0 }
  })
  const total = ops.reduce((s: number, o: { gap: number; h: number }) => s + o.gap + o.h, 0)
  let y = Math.max(1.2, (Hh - total) / 2)
  ops.forEach((o: { w: string[]; fs: number; bold: boolean; h: number; gap: number }) => {
    y += o.gap
    pdf.setFont('helvetica', o.bold ? 'bold' : 'normal')
    pdf.setFontSize(o.fs)
    pdf.text(o.w, CX, y, { align: 'center', baseline: 'top' })
    y += o.h
  })
}


/**
 * El cuerpo común de las etiquetas con código de barras: **nombre → variante → barras → SKU**,
 * centrado vertical, con un encabezado opcional arriba (el precio, o el precio tachado + el nuevo).
 *
 * ⚠️ **La geometría no se toca.** Los números salen del port byte-fiel del legacy y se imprimen en
 * una Zebra real; lo único que cambió al unificar es dónde están escritos. `tests/etiquetas-pdf.
 * test.ts` compara la cinta de órdenes de dibujo contra la de antes del refactor.
 *
 * ⚠️ **El `setFont` va ANTES del `splitTextToSize`**, y no es cosmético: en jsPDF el corte de línea
 * depende de la fuente activa, así que medir en normal y escribir en negrita parte el nombre en
 * otro lado.
 */
function dibujarCuerpo(pdf: Pdf, v: VarianteEti, barras: (y: number, h: number) => void, cfg: CuerpoEtiqueta) {
  const W = 50, Hh = 25, M = 2, CX = W / 2, margin = 1.3
  const enc = cfg.encabezado
  pdf.setFont('helvetica', cfg.nameBold ? 'bold' : 'normal')
  pdf.setFontSize(cfg.nameFS)
  const nom = pdf.splitTextToSize((v.name || '—').toUpperCase(), W - M * 2).slice(0, 2)
  const nameH = nom.length * cfg.nameLineH
  const skuBlock = v.sku ? cfg.gBarSku + cfg.skuLineH : 0
  const encBlock = enc ? enc.alto + enc.gap : 0
  const nonBar = encBlock + nameH + cfg.gNameVar + cfg.varLineH + cfg.gVarBar + skuBlock
  let barH = cfg.barH
  if (nonBar + barH > Hh - 2 * margin) barH = Math.max(4.5, Hh - 2 * margin - nonBar)
  let y = Math.max(margin, (Hh - (nonBar + barH)) / 2)

  if (enc) {
    enc.dibujar(y)
    y += enc.alto + enc.gap
    // El encabezado deja puesta su propia tipografía: el nombre la vuelve a fijar.
    pdf.setFont('helvetica', cfg.nameBold ? 'bold' : 'normal')
    pdf.setFontSize(cfg.nameFS)
  }
  pdf.text(nom, CX, y, { align: 'center', baseline: 'top' })
  y += nameH + cfg.gNameVar
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(cfg.varFS)
  pdf.text(pdf.splitTextToSize(v.size || '—', W - M * 2).slice(0, 1), CX, y, { align: 'center', baseline: 'top' })
  y += cfg.varLineH + cfg.gVarBar
  barras(y, barH)
  y += barH
  if (v.sku) {
    y += cfg.gBarSku
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(cfg.skuFS)
    pdf.text(v.sku, CX, y, { align: 'center', baseline: 'top' })
  }
}

type CuerpoEtiqueta = {
  nameFS: number; varFS: number; skuFS: number
  nameLineH: number; varLineH: number; skuLineH: number
  gNameVar: number; gVarBar: number; gBarSku: number
  /** Alto que se le da a las barras si entra; se achica hasta 4,5 mm antes de desbordar. */
  barH: number
  nameBold?: boolean
  encabezado?: { alto: number; gap: number; dibujar: (y: number) => void } | null
}

/** Con encabezado de precio: la tipografía se achica para dejarle lugar. */
const CUERPO_CHICO: CuerpoEtiqueta = {
  nameFS: 8, varFS: 7.5, skuFS: 7.5,
  nameLineH: 2.9, varLineH: 2.7, skuLineH: 2.8,
  gNameVar: 0.4, gVarBar: 1.2, gBarSku: 1.0,
  barH: 5.5,
}

/** Sin precio: sobra alto, así que el nombre va en negrita y todo entra más grande. */
const CUERPO_GRANDE: CuerpoEtiqueta = {
  nameFS: 9.5, varFS: 8.5, skuFS: 9,
  nameLineH: 3.6, varLineH: 3.2, skuLineH: 3.4,
  gNameVar: 0.7, gVarBar: 1.8, gBarSku: 1.2,
  barH: 7,
  nameBold: true,
  encabezado: null,
}

/** Construye el PDF de etiquetas (5×2,5 cm) según el modo. Port de _etiBuildPdf. */
export async function buildEtiquetasPdf(labels: LabelItem[], modoLote: ModoEtiqueta, ctx: CtxEtiqueta): Promise<Pdf> {
  const { jsPDF } = await import('jspdf')
  const JsBarcode = (await import('jsbarcode')).default
  const W = 50, Hh = 25, M = 2, CX = W / 2
  const pdf = new jsPDF({ unit: 'mm', format: [W, Hh], orientation: 'landscape' })
  const bw = 44

  labels.forEach((v, i) => {
    if (i > 0) pdf.addPage([W, Hh], 'landscape')
    if (!v) {
      pdf.setFillColor(90, 90, 90)
      pdf.circle(CX, Hh / 2, 0.4, 'F')
      return
    }
    pdf.setTextColor(0)
    if ('__fp' in v) {
      drawFP(pdf, W, Hh, M, CX, ctx.fpLines)
      return
    }
    // El modo del lote, salvo que el llamador decida prenda por prenda (ver `modoDe`).
    const modo = ctx.modoDe ? ctx.modoDe(v) : modoLote
    const barras = (y: number, h: number) => {
      try {
        const canvas = document.createElement('canvas')
        JsBarcode(canvas, String(v.barcode), { format: 'CODE128', displayValue: false, width: 2, height: 60, margin: 0 })
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', CX - bw / 2, y, bw, h)
      } catch {
        pdf.setFontSize(8)
        pdf.text(String(v.barcode), CX, y + h / 2, { align: 'center', baseline: 'middle' })
      }
    }

    if (modo === 'sku') {
      const txt = v.sku || ''
      pdf.setFont('helvetica', 'bold')
      let fs = 28
      pdf.setFontSize(fs)
      while (fs > 8 && pdf.getTextWidth(txt) > W - M * 2) {
        fs -= 1
        pdf.setFontSize(fs)
      }
      pdf.text(txt, CX, Hh / 2, { align: 'center', baseline: 'middle' })
      return
    }

    // Las tres etiquetas con código de barras son **el mismo cuerpo** —nombre, variante, barras y
    // SKU, centrado vertical— con otra tipografía y otro encabezado. Estaban escritas tres veces,
    // con constantes distintas cada una; acá se elige qué encabezado va y con qué cuerpo.
    const conPrecio = modo === 'loc'
    const precio = conPrecio ? ctx.precioDe(v) : 0
    const hasPrecio = conPrecio && precio > 0

    if (modo === 'promo') {
      const pr = ctx.promoDe(v) || { normal: ctx.precioDe(v), promo: ctx.precioDe(v) }
      dibujarCuerpo(pdf, v, barras, {
        ...CUERPO_CHICO,
        encabezado: {
          alto: 5.0,
          gap: 2.0,
          // El precio viejo tachado a la izquierda y el nuevo, grande, a la derecha.
          dibujar: (y) => {
            const oldX = W * 0.3, newX = W * 0.7, midY = y + 5.0 / 2
            const oldTxt = fmt(pr.normal)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(8)
            pdf.setTextColor(120)
            pdf.text(oldTxt, oldX, midY, { align: 'center', baseline: 'middle' })
            const ow = pdf.getTextWidth(oldTxt)
            pdf.setDrawColor(120)
            pdf.setLineWidth(0.35)
            pdf.line(oldX - ow / 2 - 0.4, midY, oldX + ow / 2 + 0.4, midY)
            pdf.setTextColor(0)
            pdf.setDrawColor(0)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(13.5)
            pdf.text(fmt(pr.promo), newX, midY, { align: 'center', baseline: 'middle' })
          },
        },
      })
      return
    }

    if (hasPrecio) {
      dibujarCuerpo(pdf, v, barras, {
        ...CUERPO_CHICO,
        encabezado: {
          alto: 4.6,
          gap: 2.0,
          dibujar: (y) => {
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(14)
            pdf.text('$ ' + Math.round(precio).toLocaleString('es-AR'), CX, y, { align: 'center', baseline: 'top' })
          },
        },
      })
      return
    }

    // Sin precio queda la etiqueta de información, que usa el alto de sobra para agrandar todo.
    // 🔴 Acá cae también la de precio con precio 0, en silencio; quien la frena antes de llegar es
    // `partirPorPrecio` en `core.ts`, que la parte y la nombra.
    dibujarCuerpo(pdf, v, barras, CUERPO_GRANDE)
  })
  return pdf
}

/** Etiqueta libre (5×2,5 cm o 10×15 cm) con texto, código de barras y/o precio. Port de _libreBuildPdf. */
export async function buildLibrePdf(cfg: { grande: boolean; copias: number; barcode: string; precio: number | null; lineas: LineaEtiqueta[] }): Promise<Pdf | null> {
  const { jsPDF } = await import('jspdf')
  const JsBarcode = (await import('jsbarcode')).default
  const { grande } = cfg
  const W = grande ? 100 : 50, Hh = grande ? 150 : 25
  const M = grande ? 7 : 2.5, CX = W / 2
  const FS = grande
    ? { titulo: 26, subtitulo: 19, normal: 14, chico: 11, precio: 44 }
    : { titulo: 12, subtitulo: 10, normal: 8.5, chico: 7, precio: 15 }
  const barH = grande ? 20 : 7, barW = grande ? 80 : 44
  const copias = Math.max(1, cfg.copias || 1)
  const barcode = (cfg.barcode || '').trim()
  const precio = cfg.precio
  const lineas = cfg.lineas.filter((l) => (l.texto || '').trim())
  if (!lineas.length && !barcode && precio == null) return null

  const orient = grande ? 'portrait' : 'landscape'
  const pdf = new jsPDF({ unit: 'mm', format: [W, Hh], orientation: orient })
  const textGap = grande ? 2 : 0.8
  const ops: { type: 'text' | 'barcode' | 'precio'; wrapped?: string[]; fs?: number; bold?: boolean; h: number; gap: number }[] = []
  lineas.forEach((l) => {
    pdf.setFont('helvetica', l.bold ? 'bold' : 'normal')
    const fs = (FS as Record<string, number>)[l.tam] || FS.normal
    pdf.setFontSize(fs)
    const wrapped = pdf.splitTextToSize(l.texto, W - M * 2)
    ops.push({ type: 'text', wrapped, fs, bold: l.bold, h: wrapped.length * (fs * 0.42), gap: ops.length ? textGap : 0 })
  })
  if (barcode) ops.push({ type: 'barcode', h: barH, gap: ops.length ? (grande ? 4 : 1.2) : 0 })
  if (precio != null && !isNaN(precio)) ops.push({ type: 'precio', h: FS.precio * 0.42, gap: ops.length ? (grande ? 5 : 1.0) : 0 })
  const totalH = ops.reduce((s, o) => s + o.gap + o.h, 0)

  for (let c = 0; c < copias; c++) {
    if (c > 0) pdf.addPage([W, Hh], orient)
    pdf.setTextColor(0)
    let y = Math.max(M, (Hh - totalH) / 2)
    ops.forEach((o) => {
      y += o.gap
      if (o.type === 'text') {
        pdf.setFont('helvetica', o.bold ? 'bold' : 'normal')
        pdf.setFontSize(o.fs!)
        pdf.text(o.wrapped!, CX, y, { align: 'center', baseline: 'top' })
      } else if (o.type === 'barcode') {
        try {
          const canvas = document.createElement('canvas')
          JsBarcode(canvas, barcode, { format: 'CODE128', displayValue: true, fontSize: 26, width: 2, height: 60, margin: 0 })
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', CX - barW / 2, y, barW, barH)
        } catch {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(FS.normal)
          pdf.text(barcode, CX, y, { align: 'center', baseline: 'top' })
        }
      } else if (o.type === 'precio') {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(FS.precio)
        pdf.text('$ ' + (precio as number).toLocaleString('es-AR'), CX, y, { align: 'center', baseline: 'top' })
      }
      y += o.h
    })
  }
  return pdf
}

/**
 * Manda el PDF a imprimir sin abrir pestaña: lo carga en un iframe oculto y dispara
 * el diálogo de impresión (autoPrint). Port de _etiPrint.
 */
export function imprimirPdf(pdf: Pdf) {
  pdf.autoPrint()
  const url = pdf.output('bloburl')
  let f = document.getElementById('eti-print-frame') as HTMLIFrameElement | null
  if (!f) {
    f = document.createElement('iframe')
    f.id = 'eti-print-frame'
    Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(f)
  }
  f.src = url
}

// ── La etiqueta de bolsa: 10 × 15 cm con los SKU de un producto ──

/**
 * Geometría de la etiqueta grande.
 *
 * 🔑 **Acá manda el SKU y el nombre es el pie.** El depósito se ordena **por SKU** (Bruno,
 * 3-sep-2026): el número es lo que se busca de lejos y el nombre del producto sólo confirma que la
 * bolsa es la correcta. Por eso el SKU arranca enorme y se achica hasta entrar, y el nombre tiene un
 * cuerpo fijo y chico abajo de todo.
 *
 * ⚠️ **No es la geometría de la Zebra de 5 × 2,5.** Aquélla es un port byte-fiel y no se toca; ésta
 * nació acá y se puede ajustar mirando el diff de la cinta de `tests/etiquetas-pdf.test.ts`.
 */
const BOLSA = {
  W: 100,
  Hh: 150,
  M: 8,
  /** El SKU arranca así de grande y baja de a un punto hasta entrar a lo alto y a lo ancho. */
  fsMax: 46,
  fsMin: 15,
  /** El color, abajo de su SKU: dice cuál de las bolsas es, no se busca por él. */
  ratioVar: 0.42,
  fsVarMin: 8,
  gapSkuVar: 1.2,
  gapBloques: 4,
  /** El pie con el nombre del producto: cuerpo fijo, y el aire que lo separa de los SKU. */
  fsPie: 11,
  gapPie: 5,
}

/**
 * Cuántos SKU entran en una etiqueta antes de que el número deje de leerse de lejos: de ahí en más
 * el producto pasa a una segunda etiqueta en vez de amontonarlos. Con seis el cuerpo no baja de ~27
 * puntos, que es lo que se lee parado frente al estante.
 */
export const SKU_POR_BOLSA = 6

/**
 * Cómo se reparten los SKU de un producto en varias etiquetas: **parejo, no llenando la primera**.
 *
 * 🔴 Cortando de a seis, diez colores daban una etiqueta apretadísima y otra con dos SKU enormes —
 * la misma bolsa con dos etiquetas que no se parecen en nada. Repartidos, las dos salen de cinco y
 * con el mismo cuerpo.
 */
export function repartirSku<T>(vs: T[], tope = SKU_POR_BOLSA): T[][] {
  if (vs.length <= tope) return vs.length ? [vs] : []
  const hojas = Math.ceil(vs.length / tope)
  const porHoja = Math.ceil(vs.length / hojas)
  const out: T[][] = []
  for (let i = 0; i < vs.length; i += porHoja) out.push(vs.slice(i, i + porHoja))
  return out
}

/** Una bolsa del depósito: un producto y los SKU que van pegados en ella. */
export type BolsaSku = { producto: string; variantes: VarianteEti[] }

/** Alto en mm de la tira de SKU con un cuerpo dado. Una variante sin color no gasta su renglón. */
function altoBloques(vs: VarianteEti[], fs: number): number {
  const fsVar = Math.max(BOLSA.fsVarMin, fs * BOLSA.ratioVar)
  let alto = 0
  vs.forEach((v, i) => {
    if (i) alto += BOLSA.gapBloques
    alto += fs * 0.42
    if ((v.size || '').trim()) alto += BOLSA.gapSkuVar + fsVar * 0.42
  })
  return alto
}

/** El SKU más ancho con ese cuerpo. ⚠️ Deja puesta la tipografía: quien llama la vuelve a fijar. */
function anchoMayor(pdf: Pdf, vs: VarianteEti[], fs: number): number {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(fs)
  return vs.reduce((m: number, v) => Math.max(m, pdf.getTextWidth(v.sku || '')), 0)
}

function dibujarBolsa(pdf: Pdf, bolsa: BolsaSku) {
  const { W, Hh, M } = BOLSA
  const CX = W / 2
  const ancho = W - M * 2
  const vs = bolsa.variantes

  // El pie se mide PRIMERO: el lugar que ocupa es el que los SKU no tienen, y son ellos los que se
  // achican. Al revés, un nombre de dos renglones les comía el borde de abajo sin avisar.
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(BOLSA.fsPie)
  const pie = pdf.splitTextToSize((bolsa.producto || '—').toUpperCase(), ancho).slice(0, 2)
  const altoPie = pie.length * (BOLSA.fsPie * 0.42) + BOLSA.gapPie
  const disponible = Hh - M * 2 - altoPie

  let fs = BOLSA.fsMax
  while (fs > BOLSA.fsMin && (altoBloques(vs, fs) > disponible || anchoMayor(pdf, vs, fs) > ancho)) fs -= 1
  const fsVar = Math.max(BOLSA.fsVarMin, fs * BOLSA.ratioVar)

  let y = M + Math.max(0, (disponible - altoBloques(vs, fs)) / 2)
  vs.forEach((v, i) => {
    if (i) y += BOLSA.gapBloques
    pdf.setTextColor(0)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(fs)
    pdf.text(v.sku || '', CX, y, { align: 'center', baseline: 'top' })
    y += fs * 0.42
    const variante = (v.size || '').trim()
    if (variante) {
      y += BOLSA.gapSkuVar
      pdf.setTextColor(90)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(fsVar)
      pdf.text(pdf.splitTextToSize(variante, ancho).slice(0, 1), CX, y, { align: 'center', baseline: 'top' })
      y += fsVar * 0.42
    }
  })

  const yPie = Hh - M - pie.length * (BOLSA.fsPie * 0.42)
  pdf.setDrawColor(170)
  pdf.setLineWidth(0.3)
  pdf.line(M, yPie - BOLSA.gapPie / 2, W - M, yPie - BOLSA.gapPie / 2)
  pdf.setTextColor(90)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(BOLSA.fsPie)
  pdf.text(pie, CX, yPie, { align: 'center', baseline: 'top' })
}

/**
 * El PDF de las etiquetas de bolsa (10 × 15 cm): una hoja por bolsa, con sus SKU grandes y el
 * nombre del producto al pie.
 *
 * 🔑 **Una bolsa puede llevar varios SKU.** Es toda la razón del tamaño grande: los cuatro colores
 * de un producto van juntos y en 5 × 2,5 no entran.
 *
 * ⚠️ **Una variante sin SKU no entra**, porque no habría nada que imprimir; una bolsa que se queda
 * sin ninguna se saltea entera. Con todas vacías devuelve `null` en vez de un PDF en blanco, que es
 * lo que se manda a la impresora sin que nadie se entere.
 */
export async function buildSkuGrandePdf(bolsas: BolsaSku[]): Promise<Pdf | null> {
  const { jsPDF } = await import('jspdf')
  const { W, Hh } = BOLSA
  const hojas: BolsaSku[] = []
  for (const b of bolsas || []) {
    for (const tanda of repartirSku((b.variantes || []).filter((v) => (v.sku || '').trim()))) hojas.push({ producto: b.producto, variantes: tanda })
  }
  if (!hojas.length) return null
  const pdf = new jsPDF({ unit: 'mm', format: [W, Hh], orientation: 'portrait' })
  hojas.forEach((hoja, i) => {
    if (i > 0) pdf.addPage([W, Hh], 'portrait')
    dibujarBolsa(pdf, hoja)
  })
  return pdf
}
