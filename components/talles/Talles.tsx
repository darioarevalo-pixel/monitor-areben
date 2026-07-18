'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { categoriaDefault, mesLabel, rangoPeriodo, ventasPorTalle } from '@/lib/talles'

/**
 * "📏 Por talle" (key `talles`, Zattia) en Next — Tanda A #9.
 *
 * Port de renderTalles + initTallesSelectors (index.html:5916, 5878): categoría +
 * rango de meses (con atajo de período) → chart de barras + tabla por talle.
 * Read-only sobre `allTallesData` del store; lógica en `lib/talles.ts`. Flip directo.
 */
export function Talles() {
  const { datos, error } = useDatosMonitor()

  const categorias = useMemo(() => datos?.allTallesCategories ?? [], [datos])
  const meses = useMemo(() => datos?.allMonths ?? [], [datos])

  // Los defaults (categoría JEANS/primera, período 12m) se DERIVAN cuando el estado
  // está vacío — no se setean en un effect (rompería el CI). El usuario los pisa con
  // los selects; el atajo de período setea desde/hasta.
  const [categoria, setCategoria] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const rango12 = useMemo(() => rangoPeriodo(meses, 12), [meses])
  const catEfectiva = categoria || categoriaDefault(categorias)
  const desdeEf = desde || rango12?.desde || ''
  const hastaEf = hasta || rango12?.hasta || ''

  function aplicarPeriodo(periodo: number) {
    const r = rangoPeriodo(meses, periodo)
    if (r) { setDesde(r.desde); setHasta(r.hasta) }
  }

  const filas = useMemo(
    () => ventasPorTalle(datos?.allTallesData ?? [], catEfectiva, desdeEf, hastaEf),
    [datos, catEfectiva, desdeEf, hastaEf],
  )
  const total = filas.reduce((s, f) => s + f.qty, 0)

  if (error && !datos) {
    return <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>No se pudieron cargar los datos: {error}</div>
  }
  if (!datos) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>

  return (
    <div>
      <div className="toolbar">
        <label style={{ fontSize: 12, color: '#666' }}>Categoría</label>
        <select value={catEfectiva} onChange={(e) => setCategoria(e.target.value)} style={{ minWidth: 180 }}>
          {categorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select defaultValue={12} onChange={(e) => aplicarPeriodo(parseInt(e.target.value))}>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={0}>Todos</option>
        </select>
        <label style={{ fontSize: 12, color: '#666' }}>Desde</label>
        <select value={desdeEf} onChange={(e) => setDesde(e.target.value)}>
          {meses.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#666' }}>Hasta</label>
        <select value={hastaEf} onChange={(e) => setHasta(e.target.value)}>
          {meses.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="chart-wrap" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filas} margin={{ left: 4, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="size" tick={{ fill: '#444', fontSize: 13, fontWeight: 500 }} tickLine={false} axisLine={false} interval={0} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }} />
              <Bar dataKey="qty" name={catEfectiva} fill="#7F77DD" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
        <div style={{ padding: '12px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>Por talle</span>
          <span style={{ fontSize: 11, color: '#aaa' }}>{total.toLocaleString('es-AR')} unidades · {filas.length} talles</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Talle</th>
              <th>Unidades vendidas</th>
              <th>% del total</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>Sin datos para esta categoría y período</td>
              </tr>
            ) : (
              filas.map((f, i) => {
                const pct = total > 0 ? (f.qty / total) * 100 : 0
                return (
                  <tr key={f.size}>
                    <td style={{ color: '#888', fontSize: 11, width: 32 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, fontSize: 15 }}>{f.size}</td>
                    <td style={{ fontWeight: 600 }}>{f.qty.toLocaleString('es-AR')}</td>
                    <td style={{ color: '#666' }}>
                      {pct.toFixed(1)}%
                      <span style={{ display: 'inline-block', width: 80, height: 4, background: '#e5e5e5', borderRadius: 2, marginLeft: 6, verticalAlign: 'middle' }}>
                        <span style={{ display: 'block', width: `${Math.min(100, pct)}%`, height: '100%', background: '#7F77DD', borderRadius: 2 }} />
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
