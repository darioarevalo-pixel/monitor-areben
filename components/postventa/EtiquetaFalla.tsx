'use client'

/**
 * Etiqueta imprimible de una falla: 50×25 mm, con todo lo que hace falta para identificar la
 * unidad sin abrir el sistema — qué es, de qué talle, por qué está acá y su código interno.
 *
 * Antes salía por `window.open` + `document.write`: sin tamaño de etiqueta, o sea a hoja
 * completa y con el tamaño que decidiera el driver, que es por qué se veía chica. Ahora usa la
 * misma cañería que las etiquetas de producto —`buildLibrePdf` para la geometría e
 * `imprimirPdf` para mandarla a la impresora desde un iframe oculto, sin pestaña nueva—, que
 * es la que ya sale bien en la Zebra.
 */

import { useEffect, useRef, useState } from 'react'
import type { FallaRow } from '@/lib/postventa/fallas/tipos'
import { buildLibrePdf, imprimirPdf } from '@/lib/etiquetas/pdf'
import { Button, color, useToast } from '@/components/ui'

/** Las líneas de la etiqueta, en orden. Lo vacío no ocupa lugar (buildLibrePdf lo descarta). */
function lineasDe(falla: FallaRow) {
  const variante = (falla.variante || '').trim()
  const sku = (falla.sku || '').trim()
  return [
    { texto: `FALLA${falla.motivo ? ' · ' + falla.motivo : ''}`, tam: 'chico' as const, bold: true },
    { texto: falla.producto || '', tam: 'subtitulo' as const, bold: true },
    { texto: [variante, sku].filter(Boolean).join(' · '), tam: 'chico' as const, bold: false },
  ]
}

export function EtiquetaFalla({ falla, onClose }: { falla: FallaRow; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [imprimiendo, setImprimiendo] = useState(false)
  const toast = useToast()

  // Vista previa en pantalla (el PDF se arma recién al imprimir).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!falla.barcode || !canvasRef.current) return
      try {
        const JsBarcode = (await import('jsbarcode')).default
        if (vivo && canvasRef.current) {
          JsBarcode(canvasRef.current, falla.barcode, { format: 'CODE128', displayValue: true, fontSize: 26, width: 3, height: 100, margin: 10 })
        }
      } catch {
        /* si falla el render, queda el texto del barcode abajo */
      }
    })()
    return () => { vivo = false }
  }, [falla.barcode])

  const imprimir = async () => {
    if (!falla.barcode) return
    setImprimiendo(true)
    try {
      const pdf = await buildLibrePdf({ grande: false, copias: 1, barcode: falla.barcode, precio: null, lineas: lineasDe(falla) })
      if (pdf) imprimirPdf(pdf)
    } catch (e) {
      toast.error('No se pudo armar la etiqueta: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setImprimiendo(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: color.surface, borderRadius: 12, padding: 20, minWidth: 320, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: color.dangerInk, letterSpacing: 0.4 }}>FALLA{falla.motivo ? ' · ' + falla.motivo : ''}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: color.ink, marginTop: 4 }}>{falla.producto}</div>
        <div style={{ fontSize: 12, color: color.mut, marginBottom: 12 }}>
          {[falla.variante, falla.sku].filter(Boolean).join(' · ') || 's/variante'}
        </div>
        {falla.barcode ? <canvas ref={canvasRef} /> : <div style={{ fontSize: 13, color: color.mut2 }}>Sin código de barras.</div>}
        <div style={{ fontSize: 11, color: color.mut2, marginTop: 8 }}>Se imprime en 50 × 25 mm.</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
          <Button variant="solid" tone="warning" onClick={imprimir} disabled={!falla.barcode} loading={imprimiendo}>
            Imprimir
          </Button>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  )
}
