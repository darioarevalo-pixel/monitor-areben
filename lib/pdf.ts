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
