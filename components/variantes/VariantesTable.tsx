'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { formatLifespan, lifespanDays } from '@/lib/etl/helpers'
import type { Variante } from '@/lib/etl/tipos'
import { colorStock } from '@/lib/productos'
import { paginar, sortList, totalPaginas } from '@/lib/tabla'
import { filtrarVariantes } from '@/lib/variantes'

/**
 * "🔠 Por variante" (key `variantes`, BDI + Zattia) en Next — Tanda A #4.
 *
 * Port read-only de renderVariantes (index.html:2967): buscar (nombre O variante) +
 * estado, orden por columna (default `sales30` desc) y paginación (50). Reusa el
 * molde de `productos` (lib/tabla, formatLifespan, colorStock, CSS badge/mini-bar).
 * La vida útil es la de 30d ya precomputada por el ETL (`v.lifespan`), sin selector
 * de modo. Flip directo (read-only, bajo riesgo).
 */

type ColOrden = 'name' | 'size' | 'lastSale' | 'sales7' | 'sales30' | 'lifespan' | 'stock'

export function VariantesTable() {
  const { datos, error } = useDatosMonitor()

  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [col, setCol] = useState<ColOrden>('sales30')
  const [dir, setDir] = useState(-1)
  const [page, setPage] = useState(1)

  const variantes = useMemo(() => datos?.allVariantes ?? [], [datos])

  const firmaFiltros = `${busqueda}|${estado}`
  const primeraRef = useRef(true)
  useEffect(() => {
    if (primeraRef.current) { primeraRef.current = false; return }
    setPage(1)
  }, [firmaFiltros])

  const filtrada = useMemo(() => filtrarVariantes(variantes, { busqueda, estado }), [variantes, busqueda, estado])
  const ordenada = useMemo(() => sortList(filtrada, col, dir), [filtrada, col, dir])

  const paginas = totalPaginas(ordenada.length)
  const pageClamp = Math.min(page, Math.max(1, paginas))
  const slice = useMemo(() => paginar(ordenada, pageClamp), [ordenada, pageClamp])

  if (error && !datos) {
    return <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>No se pudieron cargar los datos: {error}</div>
  }
  if (!datos) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>

  function ordenar(c: ColOrden) {
    if (col === c) setDir((d) => d * -1)
    else {
      setCol(c)
      setDir(-1)
    }
    setPage(1)
  }

  const th = (c: ColOrden, label: string) => (
    <th onClick={() => ordenar(c)}>
      {label} {col === c ? (dir === -1 ? '↓' : '↑') : '↕'}
    </th>
  )

  return (
    <div>
      <div className="toolbar">
        <input type="text" placeholder="Buscar variante..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="crecimiento">Crecimiento</option>
          <option value="madurez">Madurez</option>
          <option value="declive">Declive</option>
          <option value="dormido">Dormido</option>
          <option value="obsoleto">Obsoleto</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              {th('name', 'Producto')}
              {th('size', 'Variante')}
              {th('lastSale', 'Última venta')}
              {th('sales7', 'Ventas 7d')}
              {th('sales30', 'Ventas 30d')}
              {th('lifespan', 'Vida útil est.')}
              {th('stock', 'Stock')}
              <th style={{ cursor: 'default' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((v) => (
              <FilaVariante key={v.id} v={v} />
            ))}
          </tbody>
        </table>
      </div>

      {paginas > 1 && (
        <div className="pagination">
          <button onClick={() => setPage((n) => Math.max(1, n - 1))} disabled={pageClamp === 1}>←</button>
          <span>Página {pageClamp} de {paginas} ({ordenada.length} registros)</span>
          <button onClick={() => setPage((n) => Math.min(paginas, n + 1))} disabled={pageClamp === paginas}>→</button>
        </div>
      )}
    </div>
  )
}

function FilaVariante({ v }: { v: Variante }) {
  const lsStr = formatLifespan(lifespanDays(v.stock, v.sales30), v.stock)
  return (
    <tr>
      <td style={{ fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</td>
      <td style={{ color: '#666', fontSize: 12 }}>{v.size}</td>
      <td style={{ color: '#666' }}>
        {v.lastSale || <span style={{ color: '#aaa' }}>Sin ventas</span>}
        <br />
        <span style={{ fontSize: 11, color: '#aaa' }}>{v.daysSinceLast < 999 ? v.daysSinceLast + 'd atrás' : ''}</span>
      </td>
      <td style={{ fontWeight: 600, color: '#1D9E75' }}>{v.sales7}</td>
      <td style={{ fontWeight: 500 }}>{v.sales30}</td>
      <td style={{ color: '#666', fontSize: 12 }}>{lsStr}</td>
      <td>
        {v.stock}
        <div className="mini-bar">
          <div className="mini-bar-fill" style={{ width: `${Math.min(100, v.stock / 2)}%`, background: colorStock(v.stock) }} />
        </div>
      </td>
      <td>
        <span className={`badge ${v.phase.cls}`}>{v.phase.label}</span>
      </td>
    </tr>
  )
}
