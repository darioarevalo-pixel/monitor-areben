/**
 * Export de pedidos a imagen y PDF. Port de fmBloqueToCanvas (index.html:5104),
 * fmGenerarImagenTodo (5015) y fmGenerarPDF (5051).
 *
 * Cliente-only (canvas, Image, clipboard). `jspdf` se carga por import dinámico,
 * así solo pesa en el bundle de quien toca "PDF de todo" (el legacy lo traía por
 * CDN; acá es npm).
 */

import { computeFrom } from './simulacion'
import type { SimBloque } from './tipos'

/** Lo que `bloqueToCanvas` necesita dibujar (subconjunto de SimBloque). */
export type BloqueDibujable = Pick<SimBloque, 'nombre' | 'total' | 'rows' | 'vars' | 'varOn' | 'img'>

/**
 * Carga una imagen para dibujarla en canvas. Resuelve null si falla (no rompe el
 * dibujo). `crossOrigin='anonymous'` es OBLIGATORIO: las fotos ahora pueden ser
 * URLs remotas de Vercel Blob, y sin esto taintean el canvas → `toDataURL`/`toBlob`
 * (la "📷 Imagen" de WhatsApp y el PDF) tiran SecurityError. Blob sirve con
 * `Access-Control-Allow-Origin:*`, así que el anónimo funciona; los data URLs
 * viejos no se ven afectados por el flag.
 */
function cargarImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => res(im)
    im.onerror = () => res(null)
    im.src = src
  })
}

/** Dibuja UN pedido en un canvas y lo devuelve. Port literal de fmBloqueToCanvas. */
export async function bloqueToCanvas(b: BloqueDibujable): Promise<HTMLCanvasElement> {
  const total = b.total || 0
  const vars = b.vars || []
  const varOn = !!b.varOn && vars.length > 0
  const data = computeFrom(total, b.rows || [], vars, varOn)

  const numCols = varOn ? [...vars.map((v, j) => v.name || 'Var ' + (j + 1)), 'Total'] : ['Cant.']
  const cellVal = (row: (typeof data)[number], k: number): number => {
    if (!varOn) return row.qty
    const parts = row.parts || []
    return k < parts.length ? parts[k] : row.qty // última col = Total
  }
  const colTotals = numCols.map((_, k) => data.reduce((s, row) => s + cellVal(row, k), 0))

  // Precargar las miniaturas de las variantes (son data URLs locales).
  const imgs: Record<number, HTMLImageElement> = {}
  if (varOn) {
    await Promise.all(
      vars.map(async (v, j) => {
        if (!v.img) return
        const im = await cargarImg(v.img)
        if (im) imgs[j] = im
      }),
    )
  }
  const hasImgs = Object.keys(imgs).length > 0

  const pedidoImg = b.img ? await cargarImg(b.img) : null

  const scale = 3
  const font = (size: number) => `${size * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  const fontB = (size: number) => `bold ${size * scale}px -apple-system, sans-serif`
  const thumb = 64 * scale
  const pad = 16 * scale
  const rowH = 32 * scale
  const headerH = (hasImgs ? 112 : 36) * scale
  const titleBandH = (pedidoImg ? 88 : 24) * scale
  const colModel = 180 * scale
  const colNum = 72 * scale
  const w = pad * 2 + colModel + numCols.length * colNum
  const h = headerH + (data.length + 1) * rowH + pad * 2 + titleBandH
  const numX = (k: number) => pad + colModel + k * colNum + colNum / 2

  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!

  // Fondo redondeado.
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  const r = 12 * scale
  ctx.moveTo(r, 0)
  ctx.lineTo(w - r, 0)
  ctx.quadraticCurveTo(w, 0, w, r)
  ctx.lineTo(w, h - r)
  ctx.quadraticCurveTo(w, h, w - r, h)
  ctx.lineTo(r, h)
  ctx.quadraticCurveTo(0, h, 0, h - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.fill()

  // Título (con foto del pedido arriba, si la hay).
  let y = pad
  const titulo = (b.nombre ? b.nombre + ' — ' : 'PEDIDO — ') + total + ' unidades'
  ctx.textAlign = 'left'
  if (pedidoImg) {
    const t = 72 * scale
    const ar = pedidoImg.width / pedidoImg.height
    let dw = t, dh = t
    if (ar > 1) dh = t / ar
    else dw = t * ar
    ctx.drawImage(pedidoImg, pad, y, dw, dh)
    ctx.fillStyle = '#111'
    ctx.font = fontB(13)
    ctx.fillText(titulo, pad + t + 12 * scale, y + t / 2 + 5 * scale)
  } else {
    ctx.fillStyle = '#888'
    ctx.font = fontB(11)
    ctx.fillText(titulo, pad, y + 11 * scale)
  }
  y += titleBandH

  // Header (con miniaturas arriba del nombre, si hay fotos).
  ctx.fillStyle = '#F3F4F6'
  ctx.fillRect(pad, y, w - pad * 2, headerH)
  const labelY = hasImgs ? y + headerH - 12 * scale : y + headerH / 2 + 4 * scale
  ctx.fillStyle = '#666'
  ctx.font = fontB(11)
  ctx.textAlign = 'left'
  ctx.fillText('Modelo', pad + 10 * scale, labelY)
  ctx.textAlign = 'center'
  numCols.forEach((label, k) => {
    if (hasImgs && imgs[k]) {
      const im = imgs[k]
      const ar = im.width / im.height
      let dw = thumb, dh = thumb
      if (ar > 1) dh = thumb / ar
      else dw = thumb * ar
      ctx.drawImage(im, numX(k) - dw / 2, y + 8 * scale, dw, dh)
    }
    ctx.fillStyle = '#666'
    ctx.font = fontB(11)
    ctx.fillText(label, numX(k), labelY)
  })
  y += headerH

  // Filas (zebra).
  data.forEach((row, i) => {
    if (i % 2 === 1) {
      ctx.fillStyle = '#F9FAFB'
      ctx.fillRect(pad, y, w - pad * 2, rowH)
    }
    ctx.fillStyle = '#111'
    ctx.font = font(12)
    ctx.textAlign = 'left'
    ctx.fillText(row.model, pad + 10 * scale, y + rowH / 2 + 5 * scale)
    ctx.textAlign = 'center'
    numCols.forEach((_, k) => {
      const isTotal = varOn && k === numCols.length - 1
      ctx.fillStyle = isTotal ? '#111' : '#1F4E78'
      ctx.font = fontB(12)
      ctx.fillText(String(cellVal(row, k)), numX(k), y + rowH / 2 + 5 * scale)
    })
    y += rowH
  })

  // Fila de totales.
  ctx.fillStyle = '#EEF2FF'
  ctx.fillRect(pad, y, w - pad * 2, rowH)
  ctx.fillStyle = '#444'
  ctx.font = fontB(12)
  ctx.textAlign = 'left'
  ctx.fillText('TOTAL', pad + 10 * scale, y + rowH / 2 + 5 * scale)
  ctx.textAlign = 'center'
  colTotals.forEach((t, k) => ctx.fillText(String(t), numX(k), y + rowH / 2 + 5 * scale))

  return c
}

/** Apila los canvases de todos los pedidos en uno solo. Port de fmGenerarImagenTodo. */
export async function imagenDeTodos(pedidos: SimBloque[]): Promise<HTMLCanvasElement> {
  const canvases: HTMLCanvasElement[] = []
  for (const b of pedidos) canvases.push(await bloqueToCanvas(b))
  const gap = 24 * 3
  const w = Math.max(...canvases.map((c) => c.width))
  const h = canvases.reduce((s, c) => s + c.height, 0) + gap * (canvases.length - 1)
  const big = document.createElement('canvas')
  big.width = w
  big.height = h
  const ctx = big.getContext('2d')!
  ctx.fillStyle = '#F3F4F6'
  ctx.fillRect(0, 0, w, h)
  let y = 0
  for (const c of canvases) {
    ctx.drawImage(c, 0, y)
    y += c.height + gap
  }
  return big
}

/** Genera y descarga un PDF con un pedido por sección. Port de fmGenerarPDF. */
export async function pdfDeTodos(pedidos: SimBloque[]): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 28
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2
  let cursorY = margin
  for (let i = 0; i < pedidos.length; i++) {
    const c = await bloqueToCanvas(pedidos[i])
    let drawW = maxW
    let drawH = (c.height * maxW) / c.width
    if (drawH > maxH) {
      drawH = maxH
      drawW = (c.width * maxH) / c.height
    }
    if (i > 0 && cursorY + drawH > pageH - margin) {
      pdf.addPage()
      cursorY = margin
    }
    pdf.addImage(c.toDataURL('image/png'), 'PNG', margin, cursorY, drawW, drawH)
    cursorY += drawH + 18
  }
  pdf.save('pedido-proveedor.pdf')
}

/**
 * Copia un canvas al portapapeles como PNG; si el navegador no deja (o no hay
 * gesto/https), lo descarga. Devuelve 'copiado' o 'descargado'. Port del patrón
 * clipboard-o-descarga que repiten fmSimCopiarImagen/fmGenerarImagenTodo.
 */
export function copiarOdescargarPNG(canvas: HTMLCanvasElement, nombreArchivo: string): Promise<'copiado' | 'descargado'> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const descargar = () => {
        const link = document.createElement('a')
        link.download = nombreArchivo
        link.href = canvas.toDataURL('image/png')
        link.click()
        resolve('descargado')
      }
      if (!blob || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
        descargar()
        return
      }
      navigator.clipboard
        .write([new ClipboardItem({ 'image/png': blob })])
        .then(() => resolve('copiado'))
        .catch(descargar)
    }, 'image/png')
  })
}
