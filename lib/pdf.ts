/**
 * Compartir o descargar un PDF ya armado. Port de _pdfCompartir (index.html:7883):
 * en celular/tablet abre la hoja de compartir (ahí está "Guardar en Archivos"); en
 * escritorio (o si no hay Web Share) descarga directo. Reutilizable por cualquier
 * sección que exporte PDF (sale, etiquetas, conteos…).
 *
 * `pdf` es un jsPDF; se tipa laxo para no atar este helper a la versión del paquete.
 */
type JsPdfLike = {
  output: (tipo: 'blob') => Blob
  save: (filename: string) => void
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Dibuja una imagen (data URL) dentro de una caja, sin deformarla (fit + centrado).
 * Port de `_pdfAddImgFit` (index.html:7869). Compartido por diseños, exhib, etc.
 */
export function agregarImagenFit(pdf: any, dataUrl: string, x: number, y: number, boxW: number, boxH: number): void {
  try {
    const p = pdf.getImageProperties(dataUrl)
    const ar = (p.width || 1) / (p.height || 1)
    let w = boxW
    let h = w / ar
    if (h > boxH) {
      h = boxH
      w = h * ar
    }
    pdf.addImage(dataUrl, 'JPEG', x + (boxW - w) / 2, y + (boxH - h) / 2, w, h, undefined, 'SLOW')
  } catch {
    try {
      pdf.addImage(dataUrl, 'JPEG', x, y, boxW, boxH)
    } catch {
      /* imagen ilegible: se omite */
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function compartirODescargarPDF(pdf: JsPdfLike, filename: string, title?: string): Promise<void> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean
    share?: (data: { files: File[]; title?: string }) => Promise<void>
  }
  const esMobile =
    /iPhone|iPad|iPod|Android/i.test(nav.userAgent) ||
    ((nav.maxTouchPoints || 0) > 1 && /Macintosh/i.test(nav.userAgent))

  if (esMobile) {
    try {
      const blob = pdf.output('blob')
      const file = new File([blob], filename, { type: 'application/pdf' })
      if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: title || filename })
        return
      }
    } catch (e) {
      if (e && (e as Error).name === 'AbortError') return // el usuario cerró la hoja de compartir
    }
  }
  pdf.save(filename) // escritorio (o si no hay compartir) → descarga directa
}
