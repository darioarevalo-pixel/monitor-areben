'use client'

/**
 * Etiqueta imprimible de una falla: dibuja el código de barras interno (CODE128 con JsBarcode, el
 * mismo motor que lib/etiquetas/pdf.ts) + producto/SKU/motivo. Toda la info identifica la unidad por
 * el barcode (no una cinta). Botón de imprimir (window.print sobre una ventana nueva).
 */

import { useEffect, useRef } from 'react'
import type { FallaRow } from '@/lib/postventa/fallas/tipos'

export function EtiquetaFalla({ falla, onClose }: { falla: FallaRow; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!falla.barcode || !canvasRef.current) return
      try {
        const JsBarcode = (await import('jsbarcode')).default
        if (vivo && canvasRef.current) {
          JsBarcode(canvasRef.current, falla.barcode, { format: 'CODE128', displayValue: true, fontSize: 16, width: 2, height: 60, margin: 8 })
        }
      } catch {
        /* si falla el render, queda el texto del barcode abajo */
      }
    })()
    return () => { vivo = false }
  }, [falla.barcode])

  const imprimir = () => {
    const canvas = canvasRef.current
    const img = canvas ? canvas.toDataURL('image/png') : ''
    const w = window.open('', '_blank', 'width=420,height=320')
    if (!w) return
    w.document.write(`
      <html><head><title>Etiqueta ${falla.barcode || ''}</title></head>
      <body style="font-family:system-ui,sans-serif;margin:16px;text-align:center">
        ${img ? `<img src="${img}" style="max-width:100%" />` : `<div style="font-family:monospace;font-size:20px">${falla.barcode || ''}</div>`}
        <div style="font-size:13px;font-weight:600;margin-top:4px">${(falla.producto || '').replace(/</g, '')}</div>
        <div style="font-size:12px;color:#555">${(falla.sku || '').replace(/</g, '')} · ${(falla.motivo || '').replace(/</g, '')}</div>
        <script>window.onload=function(){window.print()}</script>
      </body></html>`)
    w.document.close()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, minWidth: 320, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{falla.producto}</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>{falla.sku || 's/sku'} · {falla.motivo || 'sin motivo'}</div>
        {falla.barcode ? <canvas ref={canvasRef} /> : <div style={{ fontSize: 13, color: '#9CA3AF' }}>Sin código de barras.</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
          <button onClick={imprimir} disabled={!falla.barcode} style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid #D97706', color: '#B45309', background: '#FFFBEB', cursor: 'pointer' }}>🖨️ Imprimir</button>
          <button onClick={onClose} style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer' }}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
