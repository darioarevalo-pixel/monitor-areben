'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import {
  coloresDeAgotamiento,
  coloresOrdenados,
  cutoffDe,
  filtrarAgotamiento,
  filtrarVentas,
  fmtDate,
  proveedoresAgot,
  ventasPorColor,
  type FiltrosAgot,
} from '@/lib/colores'
import type { Agotamiento } from '@/lib/etl/tipos'

/**
 * "🎨 Por color" (key `colores`, Zattia) en Next — Tanda A #8.
 *
 * Port de renderColores/reloadColoresPanel (index.html:5713, 5688) y renderAgotamiento
 * (5808): dos sub-pestañas — Ventas por color (selección de colores + chart + tabla) y
 * Análisis de agotamiento (ratio por color congelado al primer sellout). Read-only
 * sobre `allColoresSales`/`allAgotamientoData`; lógica en `lib/colores.ts`. Flip directo.
 */
export function Colores() {
  const { datos, error } = useDatosMonitor()
  const [sub, setSub] = useState<'ventas' | 'agotamiento'>('ventas')

  if (error && !datos) {
    return <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>No se pudieron cargar los datos: {error}</div>
  }
  if (!datos) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab${sub === 'ventas' ? ' active' : ''}`} onClick={() => setSub('ventas')}>Ventas por color</button>
        <button className={`tab${sub === 'agotamiento' ? ' active' : ''}`} onClick={() => setSub('agotamiento')}>Análisis de agotamiento</button>
      </div>
      {sub === 'ventas' ? <PanelVentas /> : <PanelAgotamiento data={datos.allAgotamientoData} />}
    </div>
  )
}

function PanelVentas() {
  const { datos } = useDatosMonitor()
  const sales = useMemo(() => datos?.allColoresSales ?? [], [datos])
  const months = useMemo(() => datos?.allMonths ?? [], [datos])

  const [search, setSearch] = useState('')
  const [periodo, setPeriodo] = useState(12)
  const [colorSearch, setColorSearch] = useState('')
  // Colores DESTILDADOS. Al cambiar búsqueda/período se limpia (el legacy rearmaba
  // los checkboxes todos tildados). Se hace en los handlers, no en un effect.
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => filtrarVentas(sales, search, cutoffDe(periodo, months)), [sales, search, periodo, months])
  const colores = useMemo(() => coloresOrdenados(filtered), [filtered])
  const checked = useMemo(() => new Set(colores.filter((c) => !excluidos.has(c))), [colores, excluidos])
  const { filas, total } = useMemo(() => ventasPorColor(filtered, checked), [filtered, checked])

  function cambiarSearch(v: string) { setSearch(v); setExcluidos(new Set()) }
  function cambiarPeriodo(v: number) { setPeriodo(v); setExcluidos(new Set()) }
  function toggleColor(c: string, on: boolean) {
    setExcluidos((s) => { const n = new Set(s); if (on) n.delete(c); else n.add(c); return n })
  }

  const alturaChart = Math.max(240, filas.length * 26 + 60)

  return (
    <div>
      <div className="toolbar">
        <input type="text" placeholder="Buscar producto (ej: TOP)..." value={search} onChange={(e) => cambiarSearch(e.target.value)} style={{ width: 200 }} />
        <select value={periodo} onChange={(e) => cambiarPeriodo(parseInt(e.target.value))}>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={0}>Todos</option>
        </select>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '.04em' }}>Colores</strong>
          <input type="text" placeholder="Buscar color..." value={colorSearch} onChange={(e) => setColorSearch(e.target.value)} style={{ flex: 1, minWidth: 120, padding: '4px 8px', fontSize: 12 }} />
          <button className="btn-sm" onClick={() => setExcluidos(new Set())}>Todos</button>
          <button className="btn-sm" onClick={() => setExcluidos(new Set(colores))}>Ninguno</button>
        </div>
        <div className="fm-models-grid">
          {colores.map((c) => {
            const oculto = colorSearch && !c.toLowerCase().includes(colorSearch.toLowerCase())
            return (
              <label key={c} className="fm-model-label" style={{ display: oculto ? 'none' : 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', padding: '3px 5px', borderRadius: 4 }}>
                <input type="checkbox" checked={checked.has(c)} onChange={(e) => toggleColor(c, e.target.checked)} />
                {c}
              </label>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="chart-wrap" style={{ height: alturaChart }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filas} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="color" width={120} tick={{ fill: '#444', fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }} />
              <Bar dataKey="qty" fill="#D85A30" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
        <div style={{ padding: '12px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>Por color</span>
          <span style={{ fontSize: 11, color: '#aaa' }}>{total.toLocaleString('es-AR')} unidades · {filas.length} colores</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Color</th>
              <th>Vendidas</th>
              <th>% del total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const pct = total > 0 ? (f.qty / total) * 100 : 0
              return (
                <tr key={f.color}>
                  <td style={{ color: '#888', fontSize: 11, width: 32 }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{f.color}</td>
                  <td style={{ fontWeight: 600 }}>{f.qty.toLocaleString('es-AR')}</td>
                  <td style={{ color: '#666' }}>
                    {pct.toFixed(1)}%
                    <span style={{ display: 'inline-block', width: 60, height: 4, background: '#e5e5e5', borderRadius: 2, marginLeft: 6, verticalAlign: 'middle' }}>
                      <span style={{ display: 'block', width: `${Math.min(100, pct)}%`, height: '100%', background: '#D85A30', borderRadius: 2 }} />
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PanelAgotamiento({ data }: { data: Agotamiento[] }) {
  const [search, setSearch] = useState('')
  const [prov, setProv] = useState('')
  const [estado, setEstado] = useState<FiltrosAgot['estado']>('')

  const provs = useMemo(() => proveedoresAgot(data), [data])
  const lista = useMemo(() => filtrarAgotamiento(data, { search, prov, estado }), [data, search, prov, estado])

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input type="text" placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
        <select value={prov} onChange={(e) => setProv(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {provs.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value as FiltrosAgot['estado'])}>
          <option value="">Todos</option>
          <option value="agotado">Con agotamiento</option>
          <option value="en_curso">En curso</option>
        </select>
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12, lineHeight: 1.6 }}>
        El porcentaje de cada color se congela en el momento en que se agota la primera variante, evitando el sesgo que genera continuar acumulando ventas del color sobreviviente.
      </div>
      {lista.length === 0 ? (
        <div className="agot-empty">No hay productos con múltiples colores para analizar.</div>
      ) : (
        lista.map((prod) => <TarjetaAgot key={prod.product_id} prod={prod} />)
      )}
    </div>
  )
}

function TarjetaAgot({ prod }: { prod: Agotamiento }) {
  const colores = coloresDeAgotamiento(prod)
  const refLabel = prod.firstSelloutDate ? 'Ratio al momento del agotamiento' : 'Ratio acumulado actual'
  return (
    <div className="agot-card">
      <div className="agot-prod-name">{prod.product_name}</div>
      <div className="agot-prov">{prod.proveedor ? prod.proveedor : 'Sin proveedor'}</div>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>{refLabel}</div>
      {colores.map((c) => (
        <div key={c.color} className="agot-color-row">
          <span className="agot-color-name" style={c.isSoldOut ? { color: '#DC2626', fontWeight: 600 } : undefined} title={c.color}>
            {c.color}{c.isSoldOut ? ' ✗' : ''}
          </span>
          <div className="agot-bar-wrap"><div className="agot-bar-fill" style={{ width: `${Math.min(100, c.pct).toFixed(1)}%`, background: c.palette }} /></div>
          <span className="agot-pct">{c.pct.toFixed(1)}%</span>
          <span className="agot-units">{c.sold} / {c.initialStock} u</span>
        </div>
      ))}
      <div className="agot-footer">
        {prod.firstSelloutDate ? (
          <span className="agot-badge-agotado">Agotamiento {fmtDate(prod.firstSelloutDate)}</span>
        ) : (
          <span className="agot-badge-curso">En curso</span>
        )}
        {prod.firstSelloutDate && prod.soldOutColors.length ? (
          <span>Primer agotado: <strong>{prod.soldOutColors.join(', ')}</strong></span>
        ) : null}
      </div>
    </div>
  )
}
