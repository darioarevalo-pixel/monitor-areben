'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import {
  chartMensual,
  colorMargen,
  comparativaPeriodo,
  filtrarPorFecha,
  kpisProveedor,
  mesesEnRango,
  mesLabel,
  nombresProveedores,
  ranking,
  statsPeriodo,
} from '@/lib/proveedores'
import { PedidosCard } from './PedidosCard'
import { chartColor, color } from '@/components/ui'

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
  // Período de las MÉTRICAS (meses `YYYY-MM`), distinto del rango de "primera venta" de
  // abajo, que solo elige qué productos entran al ranking.
  const [mesDesde, setMesDesde] = useState('')
  const [mesHasta, setMesHasta] = useState('')

  const data = useMemo(() => datos?.allProveedoresData ?? {}, [datos])
  const nombres = useMemo(() => nombresProveedores(data), [data])
  const allMonths = useMemo(() => datos?.allMonths ?? [], [datos])
  const meses = useMemo(() => mesesEnRango(allMonths, mesDesde, mesHasta), [allMonths, mesDesde, mesHasta])
  const stats = useMemo(() => comparativaPeriodo(data, meses), [data, meses])
  const statsPorCompra = useMemo(() => [...stats].sort((a, b) => b.compraPeriodo - a.compraPeriodo), [stats])

  // Proveedor efectivo: el elegido si sigue existiendo, si no el primero.
  const provSel = prov && data[prov] ? prov : nombres[0] || ''
  const products = useMemo(() => data[provSel]?.products ?? [], [data, provSel])

  const kpis = useMemo(() => kpisProveedor(products), [products])
  const kpisPer = useMemo(() => statsPeriodo(products, meses), [products, meses])
  const chartDet = useMemo(() => chartMensual(products, datos?.allMonths ?? []), [products, datos])
  const filtered = useMemo(() => filtrarPorFecha(products, desde, hasta), [products, desde, hasta])
  const rank = useMemo(() => ranking(filtered), [filtered])

  if (error && !datos) {
    return <div style={{ padding: 16, color: color.dangerInk, fontSize: 13 }}>No se pudieron cargar los datos: {error}</div>
  }
  if (!datos) return <div style={{ padding: 16, color: color.mut2 }}>Cargando…</div>

  const compChart = stats.map((s) => ({ prov: s.prov, totalSold: s.vendidas, avgMargin: parseFloat(s.avgMargin.toFixed(1)) }))
  const compraChart = statsPorCompra.map((s) => ({ prov: s.prov, compra: Math.round(s.compraPeriodo) }))
  const periodoLabel = meses.length && meses.length < allMonths.length ? `${mesLabel(meses[0])} a ${mesLabel(meses[meses.length - 1])}` : 'todo el historial'
  const alturaCompra = Math.max(160, compraChart.length * 28 + 40)

  const dateLabel =
    desde || hasta
      ? ` — primera venta${desde ? ' desde ' + desde : ''}${hasta ? ' hasta ' + hasta : ''} (${filtered.length} productos)`
      : ` (${filtered.length} productos)`

  return (
    <div>
      {/* Período de las métricas. Va arriba de todo porque gobierna los números de abajo:
          antes la pantalla mostraba acumulados de toda la vida y el filtro de fecha solo
          elegía qué productos entraban, así que un proveedor con el que dejamos de trabajar
          podía seguir liderando el ranking. */}
      <div className="card">
        <div className="toolbar" style={{ marginBottom: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Período</span>
          <select value={mesDesde} onChange={(e) => setMesDesde(e.target.value)}>
            <option value="">Desde el principio</option>
            {allMonths.map((m) => (
              <option key={m} value={m}>{mesLabel(m)}</option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: color.mut }}>hasta</span>
          <select value={mesHasta} onChange={(e) => setMesHasta(e.target.value)}>
            <option value="">Último mes</option>
            {allMonths.map((m) => (
              <option key={m} value={m}>{mesLabel(m)}</option>
            ))}
          </select>
          {(mesDesde || mesHasta) && (
            <button className="btn-sm" onClick={() => { setMesDesde(''); setMesHasta('') }}>Todo el historial</button>
          )}
          <span style={{ fontSize: 12, color: color.mut2, marginLeft: 'auto' }}>
            Las unidades, la compra y la rentabilidad son de <b>{periodoLabel}</b>. El stock es de hoy.
          </span>
        </div>
      </div>

      {/* Comparativa entre proveedores */}
      <div className="card">
        <div style={TITULO_MB12}>Comparativa entre proveedores <span style={{ fontSize: 12, fontWeight: 400, color: color.mut2 }}>· {periodoLabel}</span></div>
        <div className="chart-wrap" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compChart} margin={{ left: 4, right: 4, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke={chartColor.grid} />
              <XAxis dataKey="prov" tick={{ fill: '#555', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={54} />
              <YAxis yAxisId="left" tick={{ fill: color.brandSolid, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: color.success, fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => v + '%'} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: `1px solid ${color.line}` }} />
              <Legend wrapperStyle={{ fontSize: 11, color: color.mut }} />
              <Bar yAxisId="left" dataKey="totalSold" name="Unidades vendidas" fill={chartColor.brand} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="right" dataKey="avgMargin" name="Rentabilidad %" fill={chartColor.success} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Compra estimada por proveedor ($)</div>
        <div className="chart-wrap" style={{ height: alturaCompra }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compraChart} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={chartColor.grid} />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} />
              <YAxis type="category" dataKey="prov" width={120} tick={{ fill: '#444', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => ['$' + v.toLocaleString('es-AR'), 'Compra estimada']} contentStyle={{ fontSize: 12, borderRadius: 6, border: `1px solid ${color.line}` }} />
              <Bar dataKey="compra" fill={chartColor.brand} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <PedidosCard data={data} meses={meses} periodoLabel={periodoLabel} />

      {/* Detalle por proveedor */}
      <div className="card" style={{ marginTop: 4 }}>
        <div style={TITULO_MB10}>Detalle por proveedor</div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select value={provSel} onChange={(e) => setProv(e.target.value)} style={{ minWidth: 180 }}>
            {nombres.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: color.mut }}>Primera venta desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <label style={{ fontSize: 12, color: color.mut }}>hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <button className="btn-sm" onClick={() => { setDesde(''); setHasta('') }}>Limpiar</button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        <Stat label="Stock hoy (unid.)" value={kpis.totalStock.toLocaleString('es-AR')} mod="info" />
        <Stat label={`Vendidas · ${periodoLabel}`} value={kpisPer.vendidas.toLocaleString('es-AR')} />
        <Stat label="Rentab. prom. (ponderada)" value={kpisPer.vendidas ? kpisPer.avgMargin.toFixed(1) + '%' : '—'} mod="success" />
        <Stat label="Reponer lo vendido" value={'$' + Math.round(kpisPer.compraPeriodo).toLocaleString('es-AR')} />
      </div>

      <div className="card">
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Unidades vendidas por mes</div>
        <div className="chart-wrap" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartDet} margin={{ left: 4, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke={chartColor.grid} />
              <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-40} textAnchor="end" height={44} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: `1px solid ${color.line}` }} />
              <Bar dataKey="value" name={provSel} fill={chartColor.success} radius={[4, 4, 0, 0]} />
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
