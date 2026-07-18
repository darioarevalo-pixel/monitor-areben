'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { formatLifespan } from '@/lib/etl/helpers'
import type { Producto } from '@/lib/etl/tipos'
import { LIFESPAN_SIN_DATO } from '@/lib/etl/tipos'
import {
  colorStock,
  filtrarProductos,
  lifespanDaysByMode,
  mesLabel,
  mesesIngreso,
  proveedores,
  type ModoVidaUtil,
} from '@/lib/productos'
import { paginar, sortList, totalPaginas } from '@/lib/tabla'

/**
 * "📊 Por producto" (key `productos`, BDI + Zattia) en Next — Tanda A #3, PASO 1.
 *
 * Port read-only de renderProductos (index.html:2844-2891): filtros, selector de
 * vida útil, orden por columna, paginación (50) y badge de estado. La lógica de
 * dominio vive en `lib/productos.ts` (filtros/lifespan por modo/pills) y `lib/tabla.ts`
 * (orden/paginación), con paridad contra el fixture ETL. Sin fotos, sin detalle
 * expandible, sin selección de sale/PDF: esos son los Pasos 2 y 3. Por eso esto va
 * en la ruta sombra `/productos/next`, no flipeado.
 */

type ColOrden = 'name' | 'lastSale' | 'sales7' | 'sales30' | 'sales90' | 'lifespan' | 'stock'

export function ProductosTable() {
  const { datos, error } = useDatosMonitor()

  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [ingresos, setIngresos] = useState<Set<string>>(new Set())
  const [ocultarSinStock, setOcultarSinStock] = useState(false)
  const [modoVU, setModoVU] = useState<ModoVidaUtil>('30d')
  const [col, setCol] = useState<ColOrden>('sales30')
  const [dir, setDir] = useState(-1)
  const [page, setPage] = useState(1)
  const [ingresoOpen, setIngresoOpen] = useState(false)

  const productos = useMemo(() => datos?.allProductos ?? [], [datos])
  const listaProv = useMemo(() => proveedores(productos), [productos])
  const meses = useMemo(() => mesesIngreso(productos), [productos])

  // Volver a la página 1 cuando cambia el conjunto filtrado (index.html: pageState
  // se resetea en cada handler de filtro). Un effect sobre la firma de los filtros.
  const firmaFiltros = `${busqueda}|${estado}|${proveedor}|${[...ingresos].sort().join(',')}|${ocultarSinStock}|${modoVU}`
  const primeraRef = useRef(true)
  useEffect(() => {
    if (primeraRef.current) { primeraRef.current = false; return }
    setPage(1)
  }, [firmaFiltros])

  const filtrada = useMemo(
    () => filtrarProductos(productos, { busqueda, estado, proveedor, ingresos, ocultarSinStock }),
    [productos, busqueda, estado, proveedor, ingresos, ocultarSinStock],
  )

  // El legacy pisa `lifespan` con el valor del modo (sentinel 99999 si no hay dato)
  // ANTES de ordenar (index.html:2852), así la columna "Vida útil" ordena por el modo
  // elegido. Se replica sobre una copia con el campo pisado.
  const ordenada = useMemo(() => {
    const conLifespan = filtrada.map((p) => ({
      ...p,
      lifespan: lifespanDaysByMode(p, modoVU) ?? LIFESPAN_SIN_DATO,
    }))
    return sortList(conLifespan, col, dir)
  }, [filtrada, modoVU, col, dir])

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

  function toggleIngreso(m: string, on: boolean) {
    setIngresos((s) => {
      const n = new Set(s)
      if (on) n.add(m)
      else n.delete(m)
      return n
    })
  }

  const th = (c: ColOrden, label: string) => (
    <th onClick={() => ordenar(c)}>
      {label} {col === c ? (dir === -1 ? '↓' : '↑') : '↕'}
    </th>
  )

  const ingresoLbl =
    ingresos.size === 0 ? 'Todos los meses' : ingresos.size === 1 ? mesLabel([...ingresos][0]) : `${ingresos.size} meses`

  return (
    <div>
      <div className="toolbar">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="crecimiento">Crecimiento</option>
          <option value="madurez">Madurez</option>
          <option value="declive">Declive</option>
          <option value="dormido">Dormido</option>
          <option value="obsoleto">Obsoleto</option>
        </select>
        <select value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {listaProv.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {meses.length > 0 && (
          <div className="mkt-multi" style={{ minWidth: 180 }}>
            <button type="button" className="mkt-multi-btn" onClick={() => setIngresoOpen((o) => !o)}>
              <span style={ingresos.size ? { color: '#185fa5', fontWeight: 600 } : undefined}>{ingresoLbl}</span>
              <span style={{ opacity: 0.5 }}>▾</span>
            </button>
            {ingresoOpen && (
              <div className="mkt-multi-panel">
                {meses.map(({ mes, cantidad }) => (
                  <label key={mes}>
                    <input type="checkbox" checked={ingresos.has(mes)} onChange={(e) => toggleIngreso(mes, e.target.checked)} />
                    {mesLabel(mes)} <span style={{ opacity: 0.55 }}>({cantidad})</span>
                  </label>
                ))}
                {ingresos.size > 0 && (
                  <label style={{ borderTop: '1px solid #eee', marginTop: 4, paddingTop: 6, color: '#e24b4a' }} onClick={() => setIngresos(new Set())}>
                    ✕ Limpiar selección
                  </label>
                )}
              </div>
            )}
          </div>
        )}
        <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={ocultarSinStock} onChange={(e) => setOcultarSinStock(e.target.checked)} /> Ocultar sin stock
        </label>
        <select value={modoVU} onChange={(e) => setModoVU(e.target.value as ModoVidaUtil)}>
          <option value="7d">Vida útil: últimos 7d</option>
          <option value="15d">Vida útil: últimos 15d</option>
          <option value="30d">Vida útil: últimos 30d</option>
          <option value="firstSale">Vida útil: desde 1ª venta</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              {th('name', 'Producto')}
              {th('lastSale', 'Última venta')}
              {th('sales7', 'Ventas 7d')}
              {th('sales30', 'Ventas 30d')}
              {th('sales90', 'Ventas 90d')}
              {th('lifespan', 'Vida útil est.')}
              {th('stock', 'Stock')}
              <th style={{ cursor: 'default' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((p) => (
              <FilaProducto key={p.id} p={p} modoVU={modoVU} />
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

function FilaProducto({ p, modoVU }: { p: Producto; modoVU: ModoVidaUtil }) {
  const meta = [p.sku, p.proveedor].filter(Boolean).join(' · ')
  const lsStr = formatLifespan(lifespanDaysByMode(p, modoVU), p.stock)
  return (
    <tr>
      <td style={{ fontWeight: 500, maxWidth: 200 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
        {meta ? <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{meta}</div> : null}
      </td>
      <td style={{ color: '#666' }}>
        {p.lastSale || <span style={{ color: '#aaa' }}>Sin ventas</span>}
        <br />
        <span style={{ fontSize: 11, color: '#aaa' }}>{p.daysSinceLast < 999 ? p.daysSinceLast + 'd atrás' : ''}</span>
      </td>
      <td style={{ fontWeight: 600, color: '#1D9E75' }}>{p.sales7}</td>
      <td style={{ fontWeight: 500 }}>{p.sales30}</td>
      <td>{p.sales90}</td>
      <td style={{ color: '#666', fontSize: 12 }}>{lsStr}</td>
      <td>
        {p.stock}
        <div className="mini-bar">
          <div className="mini-bar-fill" style={{ width: `${Math.min(100, p.stock / 2)}%`, background: colorStock(p.stock) }} />
        </div>
      </td>
      <td>
        <span className={`badge ${p.phase.cls}`}>{p.phase.label}</span>
      </td>
    </tr>
  )
}
