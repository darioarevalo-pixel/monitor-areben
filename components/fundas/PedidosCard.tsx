'use client'

import { useState } from 'react'
import { computeFrom } from '@/lib/fundas/simulacion'
import { copiarOdescargarPNG, imagenDeTodos, pdfDeTodos } from '@/lib/fundas/export'
import type { SimBloque } from '@/lib/fundas/tipos'
import { Button, Card, color, font, useToast } from '@/components/ui'

type Props = {
  pedidos: SimBloque[]
  editando: string | null
  onEditar: (id: string) => void
  onDuplicar: (id: string) => void
  onEliminar: (id: string) => void
  onNombre: (id: string, val: string) => void
}

/**
 * Pedidos guardados para el proveedor. Port de fmBloquesRender (index.html:4985).
 * Arranca oculta hasta que hay pedidos (691, display:none). "Imagen de todo" y
 * "PDF de todo" quedan inertes hasta el Paso 4.
 */
export function PedidosCard({ pedidos, editando, onEditar, onDuplicar, onEliminar, onNombre }: Props) {
  const toast = useToast()
  const [imgMsg, setImgMsg] = useState('')
  const [pdfMsg, setPdfMsg] = useState('')

  const imagenTodo = async () => {
    if (!pedidos.length) return
    setImgMsg('Generando...')
    try {
      const canvas = await imagenDeTodos(pedidos)
      const res = await copiarOdescargarPNG(canvas, 'pedidos-proveedor.png')
      setImgMsg(res === 'copiado' ? '✓ Copiado' : '✓ Descargado')
    } catch {
      setImgMsg('')
      toast.error('No se pudo generar la imagen.')
      return
    }
    setTimeout(() => setImgMsg(''), 1500)
  }

  const pdfTodo = async () => {
    if (!pedidos.length) return
    setPdfMsg('Generando...')
    try {
      await pdfDeTodos(pedidos)
      setPdfMsg('✓ Listo')
    } catch {
      setPdfMsg('')
      toast.error('No se pudo generar el PDF.')
      return
    }
    setTimeout(() => setPdfMsg(''), 1500)
  }

  if (!pedidos.length) return null

  return (
    <Card style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: color.mut2, letterSpacing: 0 }}>
          Pedidos del proveedor <span style={{ color: color.brandSolid }}>({pedidos.length})</span>
        </span>
        {/* Las dos eran botones llenos (verde de WhatsApp y rojo) para dos exportaciones
            equivalentes: ni son la acción principal de la pantalla ni una es destructiva. */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" variant="outline" onClick={imagenTodo} loading={imgMsg === 'Generando...'} title="Una imagen con todos los pedidos juntos">
            {imgMsg || 'Imagen de todo'}
          </Button>
          <Button size="sm" variant="outline" onClick={pdfTodo} loading={pdfMsg === 'Generando...'} title="Un PDF con todos los pedidos">
            {pdfMsg || 'PDF de todo'}
          </Button>
        </div>
      </div>

      <div>
        {pedidos.map((b) => {
          const varOn = !!b.varOn && (b.vars || []).length > 0
          const filas = computeFrom(b.total, b.rows, b.vars, varOn)
          const totalU = filas.reduce((s, r) => s + r.qty, 0)
          const nModelos = filas.length
          const variantes = varOn ? b.vars.map((v) => v.name || 'var').join(' / ') : 'sin variantes'
          const esEdit = b.id === editando
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: `1px solid ${esEdit ? color.brandSolid : color.line}`, borderRadius: 8, marginBottom: 6, background: esEdit ? color.brandBg : color.surface, flexWrap: 'wrap' }}>
              <input
                value={b.nombre}
                onChange={(e) => onNombre(b.id, e.target.value)}
                style={{ fontWeight: 600, fontSize: 13, border: '1px solid transparent', background: 'transparent', width: 170, padding: '3px 5px', borderRadius: 6 }}
              />
              <span style={{ fontSize: 12, color: color.mut, flex: 1, minWidth: 140 }}>{totalU} u · {nModelos} modelo{nModelos === 1 ? '' : 's'} · {variantes}</span>
              {esEdit && <span style={{ fontSize: 11, color: color.brandSolid, fontWeight: 600 }}>● editando</span>}
              <Button size="sm" variant="outline" onClick={() => onEditar(b.id)}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => onDuplicar(b.id)} title="Duplicar este pedido">Duplicar</Button>
              <Button size="sm" variant="ghost" tone="danger" onClick={() => onEliminar(b.id)} title="Eliminar este pedido">Eliminar</Button>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 4 }}>Armá un pedido arriba y tocá <b>Guardar pedido</b>. Repetí con cada funda/diseño.</div>
    </Card>
  )
}
