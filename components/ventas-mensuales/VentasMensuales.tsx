'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import {
  canalesOrdenados,
  categoriasOrdenadas,
  datosChart,
  filasCanal,
  filasCategoria,
  filtrarPeriodo,
  type Periodo,
} from '@/lib/ventas-mensuales'

/**
 * "📅 Ventas mensuales" (key `ventas-mensuales`, BDI + Zattia) en Next.
 *
 * Port de renderVentasMensuales (index.html:2994-3070): selector de período +
 * gráfico de barras (items por mes) + tabla por categoría + tabla por canal.
 * Read-only puro sobre `allMonthlyStats` del store del ETL — Tanda A #2. La lógica
 * vive en `lib/ventas-mensuales.ts` con paridad contra el legacy; acá solo se
 * renderiza. El chart usa recharts (como Fundas), no Chart.js.
 */
export function VentasMensuales() {
  const { datos, error } = useDatosMonitor()
  const [periodo, setPeriodo] = useState<Periodo>(12)

  const stats = useMemo(() => datos?.allMonthlyStats ?? [], [datos])
  const filtered = useMemo(() => filtrarPeriodo(stats, periodo), [stats, periodo])
  const cats = useMemo(() => categoriasOrdenadas(filtered), [filtered])
  const channels = useMemo(() => canalesOrdenados(filtered), [filtered])
  const filasCat = useMemo(() => filasCategoria(filtered, cats), [filtered, cats])
  const filasCh = useMemo(() => filasCanal(filtered, channels), [filtered, channels])
  const chart = useMemo(() => datosChart(filtered), [filtered])

  if (error && !datos) {
    return <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>No se pudieron cargar los datos: {error}</div>
  }
  if (!datos) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>

  return (
    <div>
      <div className="toolbar">
        <select value={periodo} onChange={(e) => setPeriodo(parseInt(e.target.value) as Periodo)}>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={0}>Todos</option>
        </select>
      </div>

      <div className="card">
        <div className="chart-wrap" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-40} textAnchor="end" height={48} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                cursor={{ fill: 'rgba(55,138,221,0.08)' }}
                formatter={(v: number) => [v.toLocaleString('es-AR'), 'Items']}
                labelStyle={{ color: '#444', fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }}
              />
              <Bar dataKey="items" fill="#378ADD" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
        <div style={TITULO}>Por categoría</div>
        <table>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Total items</th>
              <th>Prom./venta</th>
              {cats.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filasCat.map((f) => (
              <tr key={f.mes}>
                <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{f.label}</td>
                <td style={{ fontWeight: 600 }}>{f.items.toLocaleString('es-AR')}</td>
                <td style={{ color: '#666' }}>{f.prom}</td>
                {f.cats.map((v, i) => (
                  <td key={cats[i]} style={{ color: '#666' }}>{v != null ? v.toLocaleString('es-AR') : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', overflowX: 'auto', marginTop: 0 }}>
        <div style={TITULO}>Por canal de venta</div>
        <table>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Total ventas</th>
              {channels.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filasCh.map((f) => (
              <tr key={f.mes}>
                <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{f.label}</td>
                <td style={{ fontWeight: 600 }}>{f.ventas.toLocaleString('es-AR')}</td>
                {f.canales.map((c, i) => (
                  <td key={channels[i]} style={{ color: '#666' }}>
                    {c.cnt ? (
                      <>
                        {c.cnt} <span style={{ fontSize: 10, color: '#aaa' }}>({c.pct}%)</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const TITULO: React.CSSProperties = {
  padding: '12px 16px 4px',
  fontSize: 12,
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
}
