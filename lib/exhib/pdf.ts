/**
 * Reporte PDF del chequeo de exhibición: resumen + secciones por estado + categorías
 * a corregir en TN. Cliente-only (jsPDF dinámico). Port de exhibGenerarPDF
 * (index.html:7901-7945). El confirm por faltantes sin marcar vive en el componente.
 */

import { compartirODescargarPDF } from '../pdf'
import { agruparPDF } from './core'
import type { ExhibErrores, ExhibEstados, ExhibItem } from './tipos'

type Opts = { lista: ExhibItem[]; persona: string; catLabel: string; estados: ExhibEstados; errores: ExhibErrores; marca: 'zattia' | 'bdi' }

export async function generarReporteExhib({ lista, persona, catLabel, estados, errores, marca }: Opts): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 14
  let y = 16
  const marcaLbl = marca === 'zattia' ? 'Zattia' : 'BDI'
  const grupos = agruparPDF(lista, estados)

  const line = (txt: string, opt: { bold?: boolean; fs?: number; color?: [number, number, number]; x?: number } = {}) => {
    pdf.setFont('helvetica', opt.bold ? 'bold' : 'normal')
    pdf.setFontSize(opt.fs || 10)
    const c = opt.color || [34, 34, 34]
    pdf.setTextColor(c[0], c[1], c[2])
    ;(pdf.splitTextToSize(txt, W - M * 2 - (opt.x ? opt.x - M : 0)) as string[]).forEach((w) => {
      if (y > 285) {
        pdf.addPage()
        y = 16
      }
      pdf.text(w, opt.x || M, y)
      y += (opt.fs || 10) * 0.45 + 1.4
    })
  }

  const fecha = new Date()
  const fStr = fecha.toLocaleDateString('es-AR') + ' ' + fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.setTextColor(0, 0, 0)
  pdf.text('Chequeo de exhibición — ' + marcaLbl, M, y)
  y += 8
  line('Fecha: ' + fStr)
  line('Realizado por: ' + persona)
  line('Categoría: ' + catLabel)
  line('Total chequeado: ' + lista.length + ' variantes')
  y += 2
  line(`Exhibido: ${grupos.exhibido.length}  ·  Solucionado: ${grupos.solucionado.length}  ·  Una sola unidad: ${grupos['una-unidad'].length}  ·  No se encuentra: ${grupos['no-encuentra'].length}` + (grupos['sin-marcar'].length ? `  ·  Sin revisar: ${grupos['sin-marcar'].length}` : ''), { bold: true })

  const seccion = (titulo: string, items: ExhibItem[], color: [number, number, number]) => {
    if (!items.length) return
    if (y > 268) {
      pdf.addPage()
      y = 16
    }
    y += 4
    line(titulo + ' (' + items.length + ')', { bold: true, fs: 11, color })
    items.forEach((it) => line('•  ' + it.name + ' · ' + it.size + ' · SKU: ' + (it.sku || '—'), { fs: 9, x: M + 3 }))
  }
  seccion('EXHIBIDO CORRECTAMENTE', grupos.exhibido, [22, 163, 74])
  seccion('FALTANTE — NO SE ENCUENTRA (revisar / conteo urgente)', grupos['no-encuentra'], [220, 38, 38])
  seccion('FALTANTE — Exhibición una sola unidad', grupos['una-unidad'], [217, 119, 6])
  seccion('FALTANTE — No exhibido, ya solucionado', grupos.solucionado, [37, 99, 235])
  if (grupos['sin-marcar'].length) seccion('FALTANTE — Sin revisar', grupos['sin-marcar'], [107, 114, 128])

  const errArr = Object.values(errores)
  if (errArr.length) {
    if (y > 264) {
      pdf.addPage()
      y = 16
    }
    y += 4
    line('CATEGORÍA A CORREGIR EN TN (' + errArr.length + ')', { bold: true, fs: 11, color: [180, 83, 9] })
    errArr.forEach((e) => line('•  ' + e.name + ' · SKU: ' + (e.sku || '—') + ' — TN: «' + e.catTN + '» -> deberia: «' + e.catCorrecta + '»' + (e.tnId ? ' (TN #' + e.tnId + ')' : ''), { fs: 9, x: M + 3, color: [146, 64, 14] }))
  }

  await compartirODescargarPDF(pdf, 'chequeo-exhibicion-' + marca + '-' + fecha.toISOString().slice(0, 10) + '.pdf', 'Chequeo de exhibición — ' + marcaLbl)
}
