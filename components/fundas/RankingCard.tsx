'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import {
  computarRanking,
  defaultsRanking,
  fmMonthLabel,
  ordenarProds,
  totalesBase,
  type OrdenProd,
} from '@/lib/fundas/ranking'
import type { DatosRanking } from '@/lib/fundas/tipos'

type Col = 'pos' | 'model' | 'qty' | 'pct'
const TITULOS: Record<Col, string> = { pos: '#', model: 'Modelo', qty: 'Vendidas', pct: '% del total' }

/** Suma o saca un valor de un Set devolviendo uno nuevo (React necesita ref nueva). */
function toggleSet<T>(s: Set<T>, v: T, on: boolean): Set<T> {
  const n = new Set(s)
  if (on) n.add(v)
  else n.delete(v)
  return n
}

/**
 * Ranking por modelo: chart (recharts) + tabla + paneles de selección + corte
 * por agotamiento. Port de renderFundasPorModelo (index.html:5357-5495) y de los
 * selectores de initFundasSelectors (3102-3163).
 *
 * Es la card más pesada en estado interactivo (dos paneles de checkboxes, el
 * corte con su propia UI), pero read-only pura: no persiste nada. Valida el
 * cableado del store en la ruta sombra.
 */
export function RankingCard({ datos }: { datos: DatosRanking }) {
  const base = useMemo(() => totalesBase(datos.allFundasStats), [datos])
  const def = useMemo(() => defaultsRanking(datos), [datos])
  const totalModels = def.modelos.length
  const totalProds = useMemo(() => Object.keys(base.prodTotals).length, [base])

  const [rangeStart, setRangeStart] = useState(def.rangeStart)
  const [rangeEnd, setRangeEnd] = useState(def.rangeEnd)
  const [checkedModels, setCheckedModels] = useState(def.checkedModels)
  const [checkedProds, setCheckedProds] = useState(def.checkedProds)
  const [prodSort, setProdSort] = useState<OrdenProd>('qty')
  const [corteEnabled, setCorteEnabled] = useState(def.corteEnabled)
  const [corteN, setCorteN] = useState(3)
  const [corteDiseno, setCorteDiseno] = useState<string | undefined>(undefined)
  const [modelSearch, setModelSearch] = useState('')
  const [prodSearch, setProdSearch] = useState('')
  const [modelosOpen, setModelosOpen] = useState(false)
  const [prodsOpen, setProdsOpen] = useState(false)
  const [sortCol, setSortCol] = useState<Col>('pos')
  const [sortAsc, setSortAsc] = useState(true)

  // Opciones del corte = fundas elegidas, alfabético (index.html:5352-5354).
  const corteOpciones = useMemo(() => [...checkedProds].sort((a, b) => a.localeCompare(b, 'es')), [checkedProds])

  // Reconciliar el diseño de corte cuando cambia la selección (5355-5365):
  // se mantiene si sigue elegido, si no cae a un "wave case" o al primero.
  useEffect(() => {
    setCorteDiseno((prev) => {
      if (prev && checkedProds.has(prev)) return prev
      const wc = [...checkedProds].find((p) => p.toLowerCase().includes('wave case'))
      return wc ?? corteOpciones[0]
    })
  }, [checkedProds, corteOpciones])

  const prodsOrdenados = useMemo(
    () => ordenarProds(base.prodTotals, base.prodFirstMes, prodSort),
    [base, prodSort],
  )

  const resultado = useMemo(
    () =>
      computarRanking(datos, {
        rangeStart,
        rangeEnd,
        checkedModels,
        totalModels,
        checkedProds,
        totalProds,
        corteEnabled,
        corteN,
        corteDiseno,
      }),
    [datos, rangeStart, rangeEnd, checkedModels, totalModels, checkedProds, totalProds, corteEnabled, corteN, corteDiseno],
  )

  const filasOrdenadas = useMemo(() => {
    return [...resultado.filas].sort((a, b) => {
      const v = sortCol === 'model' ? a.model.localeCompare(b.model, 'es') : a[sortCol] - b[sortCol]
      return sortAsc ? v : -v
    })
  }, [resultado, sortCol, sortAsc])

  function sort(col: Col) {
    if (sortCol === col) setSortAsc((a) => !a)
    else {
      setSortCol(col)
      setSortAsc(col !== 'model') // numéricos desc por defecto, modelo asc
    }
  }

  const top = resultado.filas.slice(0, 20)
  const chartData = top.map((f) => ({ model: f.model, qty: f.qty }))
  const chartHeight = Math.max(280, top.length * 32 + 60)
  const rangeLabel =
    resultado.effStart === resultado.effEnd
      ? fmMonthLabel(resultado.effStart)
      : `${fmMonthLabel(resultado.effStart)} – ${fmMonthLabel(resultado.effEnd)}`
  const prodFilterActive = checkedProds.size < totalProds
  const totalTexto =
    `${resultado.total.toLocaleString('es-AR')} fundas · ${resultado.cantModelos} modelos` +
    (prodFilterActive ? ` · ${checkedProds.size} fundas` : '') +
    ` · ${rangeLabel}`

  const meses = def.meses

  return (
    <div>
      <div className="toolbar">
        <label style={{ fontSize: 12, color: '#666' }}>Desde</label>
        <select value={rangeStart} onChange={(e) => setRangeStart(e.target.value)}>
          {meses.map((m) => (
            <option key={m} value={m}>{fmMonthLabel(m)}</option>
          ))}
        </select>
        <label style={{ fontSize: 12, color: '#666' }}>Hasta</label>
        <select value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)}>
          {meses.map((m) => (
            <option key={m} value={m}>{fmMonthLabel(m)}</option>
          ))}
        </select>
        <button className="btn-sm" onClick={() => { setModelosOpen((o) => !o); setProdsOpen(false) }}>Modelos ▾</button>
        <button className="btn-sm" onClick={() => { setProdsOpen((o) => !o); setModelosOpen(false) }}>Fundas ▾</button>
        <span style={{ borderLeft: '1.5px solid #E5E7EB', height: 20, margin: '0 2px' }} />
        <label style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={corteEnabled} onChange={(e) => setCorteEnabled(e.target.checked)} />
          Cortar al agotarse
        </label>
        <select value={corteN} onChange={(e) => setCorteN(parseInt(e.target.value))} style={{ width: 48 }}>
          {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#666' }}>modelos de</span>
        <select
          value={corteDiseno ?? ''}
          onChange={(e) => setCorteDiseno(e.target.value)}
          style={{ maxWidth: 200, fontSize: 12 }}
        >
          {corteOpciones.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {resultado.corte.visible && (
        <div style={{ fontSize: 11, color: '#888', padding: '2px 0 4px' }}>{resultado.corte.mensaje}</div>
      )}

      {modelosOpen && (
        <div className="fm-models-panel">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <strong style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '.04em' }}>Modelos de iPhone</strong>
            <input type="text" placeholder="Buscar..." value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
            <button className="btn-sm" onClick={() => setCheckedModels(new Set(def.modelos))}>Todos</button>
            <button className="btn-sm" onClick={() => setCheckedModels(new Set())}>Ninguno</button>
          </div>
          <div className="fm-models-grid">
            {def.modelos.map((m) => {
              const oculto = modelSearch && !m.toLowerCase().includes(modelSearch.toLowerCase())
              return (
                <label key={m} className="fm-model-label" style={{ display: oculto ? 'none' : 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', padding: '3px 5px', borderRadius: 4 }}>
                  <input type="checkbox" checked={checkedModels.has(m)} onChange={(e) => setCheckedModels((s) => toggleSet(s, m, e.target.checked))} />
                  {m}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {prodsOpen && (
        <div className="fm-models-panel">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <strong style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '.04em' }}>Nombre de funda</strong>
            <input type="text" placeholder="Buscar..." value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
            <select value={prodSort} onChange={(e) => setProdSort(e.target.value as OrdenProd)} style={{ fontSize: 12, padding: '3px 6px' }}>
              <option value="qty">Más vendidas</option>
              <option value="alpha">Alfabético</option>
              <option value="date">Fecha de ingreso</option>
            </select>
            <button className="btn-sm" onClick={() => setCheckedProds(new Set(prodsOrdenados))}>Todos</button>
            <button className="btn-sm" onClick={() => setCheckedProds(new Set())}>Ninguno</button>
            {[10, 20, 30].map((n) => (
              <button key={n} className="btn-sm" onClick={() => setCheckedProds(new Set(prodsOrdenados.slice(0, n)))}>Top {n}</button>
            ))}
          </div>
          <div className="fm-models-grid">
            {prodsOrdenados.map((p) => {
              const oculto = prodSearch && !p.toLowerCase().includes(prodSearch.toLowerCase())
              return (
                <label key={p} className="fm-prod-label" style={{ display: oculto ? 'none' : 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', padding: '3px 5px', borderRadius: 4 }}>
                  <input type="checkbox" checked={checkedProds.has(p)} onChange={(e) => setCheckedProds((s) => toggleSet(s, p, e.target.checked))} />
                  {p}
                </label>
              )
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="chart-wrap" style={{ height: chartHeight }}>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#888', marginBottom: 4 }}>{rangeLabel}</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 8 }}>
              <CartesianGrid horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis type="category" dataKey="model" width={140} tick={{ fill: '#444', fontSize: 12 }} />
              <Bar dataKey="qty" fill="#7F77DD" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>Ranking por modelo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#aaa' }}>{totalTexto}</span>
            <button className="btn-sm" disabled title="La simulación llega en el próximo paso del port" style={{ fontSize: 11, opacity: 0.5, cursor: 'not-allowed' }}>↓ Importar a simulación</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              {(['pos', 'model', 'qty', 'pct'] as Col[]).map((c) => (
                <th
                  key={c}
                  onClick={() => sort(c)}
                  style={{ cursor: 'pointer', width: c === 'pos' ? 32 : undefined }}
                >
                  {TITULOS[c]}{sortCol === c ? (sortAsc ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filasOrdenadas.map((r) => (
              <tr key={r.model}>
                <td style={{ color: '#888', fontSize: 11, width: 32 }}>{r.pos}</td>
                <td style={{ fontWeight: 500 }}>{r.model}</td>
                <td style={{ fontWeight: 600 }}>{r.qty.toLocaleString('es-AR')}</td>
                <td style={{ color: '#666' }}>
                  {r.pct}%
                  <div style={{ display: 'inline-block', width: 60, height: 4, background: '#e5e5e5', borderRadius: 2, marginLeft: 6, verticalAlign: 'middle' }}>
                    <div style={{ width: `${Math.min(100, r.pct)}%`, height: '100%', background: '#7F77DD', borderRadius: 2 }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
