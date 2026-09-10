/**
 * La ORDEN DE ETIQUETADO en PDF, para imprimir y entregar.
 *
 * Pedido de Bruno (10-sep): *«sólo lista como pdf común con precio y lista para imprimir, para
 * dársela a administración y le digo: hacé esto»*.
 *
 * 🔑 **La regla ⛔ no se copia acá.** Este script sólo DIBUJA: la cuenta entera —qué bajar, cuánto y
 * con qué etiqueta— vive en `feria-zattia-etiquetado.mjs` y llega por stdin. Cambiar la banda o el
 * horizonte se hace allá, y el PDF sale solo.
 *
 *   node scripts/feria-zattia-etiquetado.mjs --json | node scripts/feria-zattia-etiquetado-pdf.mjs
 *
 * Sale en `~/Downloads/orden-etiquetado-feria.pdf`. ⛔ No escribe en ninguna base.
 */
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const crudo = await new Promise(res => { let s = ''; process.stdin.on('data', d => s += d).on('end', () => res(s)) })
const { generado, minTalle, orden } = JSON.parse(crudo)
const ar = n => Number(n).toLocaleString('es-AR')
const total = orden.reduce((a, f) => a + f.bajar, 0)
const mesas = [...new Set(orden.map(f => f.etiqueta))].sort((a, b) => a - b)

const { jsPDF } = await import('jspdf')
const doc = new jsPDF({ unit: 'mm', format: 'a4' })
const IZQ = 16, DER = 194
let y = 0, pagina = 0

const pie = () => {
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(130)
  doc.text(`Feria Zattia · orden de etiquetado del depósito · calculada el ${generado}`, IZQ, 287)
  doc.text(String(pagina), DER, 287, { align: 'right' })
  doc.setTextColor(0)
}
const nuevaPagina = () => {
  if (pagina) { pie(); doc.addPage() }
  pagina++
  y = 20
  doc.setFont('helvetica', 'bold').setFontSize(13)
  doc.text('ORDEN DE ETIQUETADO — DEPÓSITO', IZQ, y)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  doc.text('Feria Zattia · lunes 14 de septiembre', DER, y, { align: 'right' })
  doc.setTextColor(0)
  y += 3
  doc.setDrawColor(30).setLineWidth(0.5).line(IZQ, y, DER, y)
  y += 8
}
const espacio = alto => { if (y + alto > 275) nuevaPagina() }

nuevaPagina()

// ── qué hay que hacer, en tres renglones ─────────────────────────────────────
doc.setFont('helvetica', 'bold').setFontSize(9.5)
doc.text('Qué hay que hacer', IZQ, y); y += 5
doc.setFont('helvetica', 'normal').setFontSize(9)
for (const l of [
  `1.  Imprimir las etiquetas en el Monitor, en Etiquetas, pestaña "Libre". Una tirada por precio, con el campo`,
  `    de copias. El código de barras va vacío: la etiqueta lleva SÓLO EL PRECIO, sin nombre.`,
  `2.  Bajar del depósito la cantidad indicada de cada producto, tomando ${minTalle} de cada talle.`,
  `3.  Pegarle a cada prenda la etiqueta del precio de su bloque, y dejarla separada POR PRECIO:`,
  `    cada bloque es una mesa de la feria.`,
  `4.  Si algún producto de esta lista YA ESTÁ en el salón, no lo bajes: anotalo y avisá.`,
]) { doc.text(l, IZQ, y); y += 4.6 }
y += 3

// ── el resumen de la impresión ───────────────────────────────────────────────
doc.setFont('helvetica', 'bold').setFontSize(9.5)
doc.text('Etiquetas a imprimir', IZQ, y); y += 5
doc.setFont('helvetica', 'normal').setFontSize(9)
doc.text('Se imprime el doble de lo que se pega: la etiqueta es sólo el precio, así que la de más sirve', IZQ, y); y += 4.6
doc.text('para reponer durante la feria sin volver a imprimir.', IZQ, y); y += 6

const colP = IZQ, colA = IZQ + 45, colB = IZQ + 80, colC = IZQ + 120
doc.setFont('helvetica', 'bold').setFontSize(8)
doc.text('PRECIO', colP, y); doc.text('PEGAR AHORA', colA, y); doc.text('IMPRIMIR', colB, y); doc.text('PRODUCTOS', colC, y)
y += 1.5; doc.setDrawColor(180).setLineWidth(0.2).line(IZQ, y, DER, y); y += 4.5
doc.setFont('helvetica', 'normal').setFontSize(9)
for (const m of mesas) {
  const fs = orden.filter(f => f.etiqueta === m), n = fs.reduce((a, f) => a + f.bajar, 0)
  doc.text(`$${ar(m)}`, colP, y); doc.text(String(n), colA, y); doc.text(String(n * 2), colB, y); doc.text(String(fs.length), colC, y)
  y += 4.8
}
doc.setDrawColor(180).line(IZQ, y - 3, DER, y - 3)
doc.setFont('helvetica', 'bold')
doc.text('TOTAL', colP, y); doc.text(String(total), colA, y); doc.text(String(total * 2), colB, y); doc.text(String(orden.length), colC, y)
y += 10

// ── la lista, un bloque por precio ───────────────────────────────────────────
for (const m of mesas) {
  const fs = orden.filter(f => f.etiqueta === m)
  const n = fs.reduce((a, f) => a + f.bajar, 0)
  espacio(24)
  doc.setFillColor(238, 238, 236).rect(IZQ, y - 4.5, DER - IZQ, 8, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(11)
  doc.text(`ETIQUETA  $${ar(m)}`, IZQ + 2, y + 1)
  doc.setFont('helvetica', 'normal').setFontSize(9)
  doc.text(`${n} prendas · ${fs.length} productos`, DER - 2, y + 1, { align: 'right' })
  y += 9

  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(110)
  doc.text('PRODUCTO', IZQ + 8, y); doc.text('TALLES', IZQ + 92, y)
  doc.text('BAJAR', IZQ + 140, y); doc.text('ETIQUETA', IZQ + 158, y)
  doc.setTextColor(0); y += 1.5
  doc.setDrawColor(200).setLineWidth(0.2).line(IZQ, y, DER, y); y += 5

  doc.setFont('helvetica', 'normal').setFontSize(9)
  for (const f of fs) {
    espacio(8)
    doc.setDrawColor(120).setLineWidth(0.3).rect(IZQ, y - 3.2, 4, 4)          // el casillero
    doc.text(f.nombre.slice(0, 40), IZQ + 8, y)
    doc.setFontSize(8).setTextColor(90)
    doc.text(f.listaTalles.join(' · ').slice(0, 26), IZQ + 92, y)
    doc.setTextColor(0).setFontSize(10).setFont('helvetica', 'bold')
    doc.text(String(f.bajar), IZQ + 141, y)
    doc.setFont('helvetica', 'normal').setFontSize(9)
    doc.text(`$${ar(f.etiqueta)}`, IZQ + 158, y)
    y += 6.2
  }
  y += 4
}

pie()
const salida = join(homedir(), 'Downloads', 'orden-etiquetado-feria.pdf')
writeFileSync(salida, Buffer.from(doc.output('arraybuffer')))
console.log(`${salida}  ·  ${pagina} páginas · ${orden.length} productos · ${total} prendas`)
