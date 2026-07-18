'use client'

import { useMemo, useState } from 'react'
import { desglosePorVariante, type ColDetalle } from '@/lib/productos-detalle'
import type { VentasVariante, Variante } from '@/lib/etl/tipos'

/**
 * "▾ Desglose por variante": la fila que se despliega al abrir un producto. Port de
 * buildProductoDetalle (index.html:2903), con su propio mini-orden por columna
 * (default `total` desc). Read-only sobre el store.
 */
export function DetalleVariante({
  allVvar,
  allVariantes,
  pid,
}: {
  allVvar: Record<string, VentasVariante>
  allVariantes: Variante[]
  pid: string
}) {
  const [col, setCol] = useState<ColDetalle>('total')
  const [dir, setDir] = useState(-1)

  const { items, totalVendido } = useMemo(
    () => desglosePorVariante(allVvar, allVariantes, pid, col, dir),
    [allVvar, allVariantes, pid, col, dir],
  )

  function ordenar(c: ColDetalle) {
    if (col === c) setDir((d) => d * -1)
    else {
      setCol(c)
      setDir(c === 'size' ? 1 : -1) // alfabético arranca A→Z (index.html:2899)
    }
  }

  if (!items.length) {
    return <div style={{ padding: '12px 20px', color: '#aaa', fontSize: 12 }}>Sin variantes registradas</div>
  }

  const th = (c: ColDetalle, label: string, last = false) => (
    <th
      onClick={(e) => { e.stopPropagation(); ordenar(c) }}
      style={{
        fontSize: 11,
        color: '#888',
        fontWeight: 500,
        textAlign: 'left',
        padding: last ? '0 0 6px 0' : '0 16px 6px 0',
        cursor: 'pointer',
        userSelect: 'none',
        background: 'transparent',
        textTransform: 'none',
        letterSpacing: 0,
      }}
    >
      {label} {col === c ? (dir === -1 ? '↓' : '↑') : '↕'}
    </th>
  )

  return (
    <div style={{ padding: '10px 20px 14px' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#7F77DD', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
        ▾ Desglose por variante
      </div>
      <table style={{ width: 'auto' }}>
        <thead>
          <tr>
            {th('size', 'Variante')}
            {th('total', 'Total vendido')}
            {th('s7', 'Últimos 7d')}
            {th('s30', 'Últimos 30d')}
            {th('stock', 'Stock', true)}
          </tr>
        </thead>
        <tbody>
          {items.map((v) => {
            const pct = totalVendido > 0 ? Math.round((v.total / totalVendido) * 100) : 0
            const colStock = v.stock < 3 ? '#e24b4a' : v.stock < 10 ? '#ba7517' : '#666'
            return (
              <tr key={v.sid}>
                <td style={{ padding: '5px 16px 5px 0', fontSize: 13, color: '#333', fontWeight: 500 }}>{v.size || '—'}</td>
                <td style={{ padding: '5px 16px 5px 0', fontSize: 13, fontWeight: 600 }}>
                  {v.total.toLocaleString('es-AR')}
                  {totalVendido > 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 4 }}>{pct}%</span>}
                </td>
                <td style={{ padding: '5px 16px 5px 0', fontSize: 13, color: '#1D9E75', fontWeight: 600 }}>{v.s7.toLocaleString('es-AR')}</td>
                <td style={{ padding: '5px 16px 5px 0', fontSize: 13, color: '#666' }}>{v.s30.toLocaleString('es-AR')}</td>
                <td style={{ padding: '5px 0', fontSize: 13, color: colStock }}>{v.stock.toLocaleString('es-AR')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
