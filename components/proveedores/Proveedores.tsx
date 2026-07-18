'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import {
  chartMensual,
  colorMargen,
  comparativa,
  filtrarPorFecha,
  kpisProveedor,
  nombresProveedores,
  ranking,
} from '@/lib/proveedores'

/**
 * "🏭 Por proveedor" (key `proveedores`, Zattia) en Next — Tanda A #7.
 *
 * Port de renderProveedoresComparativa (index.html:5514) + renderProveedores (5585):
 * comparativa entre proveedores (2 charts) + detalle de uno (selector + rango de
 * primera venta + 4 KPIs + chart mensual + ranking). Read-only sobre
 * `allProveedoresData` del store; la lógica en `lib/proveedores.ts` con paridad
 * contra el fixture. Charts en recharts (como Fundas), no Chart.js.
 */
export function Proveedores() {
  const { datos, error } = useDatosMonitor()
  const [prov, setProv] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const data = useMemo(() => datos?.allProveedoresData ?? {}, [datos])
  const nombres = useMemo(() => nombresProveedores(data), [data])
  const stats = useMemo(() => comparativa(data), [data])
  const statsPorCompra = useMemo(() => [...stats].sort((a, b) => b.compra - a.compra), [stats])

  // Proveedor efectivo: el elegido si sigue existiendo, si no el primero.
  const provSel = prov && data[prov] ? prov : nombres[0] || ''
  const products = useMemo(() => data[provSel]?.products ?? [], [data, provSel])

  const kpis = useMemo(() => kpisProveedor(products), [products])
  const chartDet = useMemo(() => chartMensual(products, datos?.allMonths ?? []), [products, datos])
  const filtered = useMemo(() => filtrarPorFecha(products, desde, hasta), [products, desde, hasta])
  const rank = useMemo(() => ranking(filtered), [filtered])

  if (error && !datos) {
    return <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>No se pudieron cargar los datos: {error}</div>
  }
  if (!datos) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>

  const compChart = stats.map((s) => ({ prov: s.prov, totalSold: s.totalSold, avgMargin: parseFloat(s.avgMargin.toFixed(1)) }))
  const compraChart = statsPorCompra.map((s) => ({ prov: s.prov, compra: Math.round(s.compra) }))
  const alturaCompra = Math.max(160, compraChart.length * 28 + 40)

  const dateLabel =
    desde || hasta
      ? ` — primera venta${desde ? ' desde ' + desde : ''}${hasta ? ' hasta ' + hasta : ''} (${filtered.length} productos)`
      : ` (${filtered.length} productos)`

  return (
    <div>
      {/* Comparativa entre proveedores */}
      <div className="card">
        <div style={TITULO_MB12}>Comparativa entre proveedores</div>
        <div className="chart-wrap" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compChart} margin={{ left: 4, right: 4, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="prov" tick={{ fill: '#555', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={54} />
              <YAxis yAxisId="left" tick={{ fill: '#378ADD', fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#1D9E75', fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => v + '%'} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#666' }} />
              <Bar yAxisId="left" dataKey="totalSold" name="Unidades vendidas" fill="#378ADD" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="right" dataKey="avgMargin" name="Rentabilidad %" fill="#1D9E75" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Compra estimada por proveedor ($)</div>
        <div className="chart-wrap" style={{ height: alturaCompra }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compraChart} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} />
              <YAxis type="category" dataKey="prov" width={120} tick={{ fill: '#444', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => ['$' + v.toLocaleString('es-AR'), 'Compra estimada']} contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }} />
              <Bar dataKey="compra" fill="#7F77DD" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detalle por proveedor */}
      <div className="card" style={{ marginTop: 4 }}>
        <div style={TITULO_MB10}>Detalle por proveedor</div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select value={provSel} onChange={(e) => setProv(e.target.value)} style={{ minWidth: 180 }}>
            {nombres.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: '#666' }}>Primera venta desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <label style={{ fontSize: 12, color: '#666' }}>hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <button className="btn-sm" onClick={() => { setDesde(''); setHasta('') }}>Limpiar</button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        <Stat label="Stock total (unid.)" value={kpis.totalStock.toLocaleString('es-AR')} mod="info" />
        <Stat label="Unidades vendidas" value={kpis.totalSold.toLocaleString('es-AR')} />
        <Stat label="Rentabilidad prom." value={kpis.avgMargin !== null ? kpis.avgMargin.toFixed(1) + '%' : '—'} mod="success" />
        <Stat label="Compra estimada" value={kpis.estimatedPurchase !== null ? '$' + Math.round(kpis.estimatedPurchase).toLocaleString('es-AR') : '—'} />
      </div>

      <div className="card">
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Unidades vendidas por mes</div>
        <div className="chart-wrap" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartDet} margin={{ left: 4, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-40} textAnchor="end" height={44} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }} />
              <Bar dataKey="value" name={provSel} fill="#1D9E75" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
        <div style={{ padding: '12px 16px 4px', fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Productos más vendidos{dateLabel}
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Producto</th>
              <th>Vendidas</th>
              <th>Stock</th>
              <th>Rentab.</th>
            </tr>
          </thead>
          <tbody>
            {rank.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>Sin productos en ese rango de fechas</td>
              </tr>
            ) : (
              rank.map((p, i) => (
                <tr key={p.id}>
                  <td style={{ color: '#888', fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>
                    {p.name}
                    <br />
                    <span style={{ fontSize: 10, color: '#aaa' }}>Primera venta: {p.firstSale || '—'}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.soldTotal.toLocaleString('es-AR')}</td>
                  <td>{p.stock.toLocaleString('es-AR')}</td>
                  <td style={{ color: colorMargen(p.margin) }}>{p.margin !== null ? p.margin.toFixed(1) + '%' : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const TITULO_MB12: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }
const TITULO_MB10: React.CSSProperties = { ...TITULO_MB12, marginBottom: 10 }

function Stat({ label, value, mod }: { label: string; value: string; mod?: 'info' | 'success' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${mod ? ' ' + mod : ''}`}>{value}</div>
    </div>
  )
}
