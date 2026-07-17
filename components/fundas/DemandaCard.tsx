'use client'

import { useMemo, useState } from 'react'
import { combinarDemanda, demandaPorModelo } from '@/lib/fundas/demanda'
import { iphoneModelSort } from '@/lib/fundas/ranking'
import type { DatosDemanda, FilaDemandaComb } from '@/lib/fundas/tipos'
import type { DatosETL } from '@/lib/etl/tipos'

type ColDem = 'model' | 'pMin' | 'pMay' | 'pComb'

/** Suma o saca un valor de un Set devolviendo uno nuevo. */
function toggleSet<T>(s: Set<T>, v: T, on: boolean): Set<T> {
  const n = new Set(s)
  if (on) n.delete(v)
  else n.add(v)
  return n
}

/**
 * Demanda por modelo (corregida). Port de fmDemandaRender/Paint
 * (index.html:3342-3441) y del markup (566-651). El cálculo pesado vive en
 * `lib/fundas/demanda.ts` (con paridad contra el legacy); acá va el estado de los
 * controles y el pintado.
 *
 * `today` se toma una vez por montaje: el legacy usaba `Date.now()` en cada
 * render, pero `DatosETL` no expone el reloj del store (queda dentro del ETL). Un
 * instante estable por montaje es lo mismo salvo cruzando la medianoche, y ahí es
 * más correcto.
 *
 * "Usar los elegidos" queda inerte hasta el Paso 3 (la simulación).
 */
export function DemandaCard({ datos, onUsar }: { datos: DatosETL; onUsar?: (rows: { model: string; pct: number }[]) => void }) {
  const [today] = useState(() => new Date())

  const [cutoff, setCutoff] = useState('2026-01-01')
  const [metric, setMetric] = useState<'aj' | 'vol'>('aj')
  const [capK, setCapK] = useState(2.5)
  const [corteOn, setCorteOn] = useState(true)
  const [corteDias, setCorteDias] = useState(30)
  const [corteMod, setCorteMod] = useState(5)
  const [wminTouched, setWminTouched] = useState(false)
  const [wminManual, setWminManual] = useState(20)
  const [sort, setSort] = useState<{ col: ColDem; dir: number }>({ col: 'pComb', dir: -1 })
  const [excl, setExcl] = useState<Set<string>>(new Set())

  const datosDem: DatosDemanda = useMemo(
    () => ({
      allVentas: datos.ventas,
      allDetalles: datos.detalles,
      invDepoMin: datos.invDepoMin,
      prodMeta: datos.prodMeta,
      fmKeyPids: datos.fmKeyPids,
      today,
    }),
    [datos, today],
  )

  const calc = useMemo(
    () => demandaPorModelo(datosDem, cutoff, capK, { on: corteOn, dias: corteDias, modelos: corteMod }),
    [datosDem, cutoff, capK, corteOn, corteDias, corteMod],
  )

  // Peso del minorista: si el usuario no lo tocó, se auto-pisa al real (3355).
  const sliderVal = wminTouched ? wminManual : Math.round(calc.wMinDefault * 100)
  const wMin = (sliderVal || 0) / 100

  const rows = useMemo(() => combinarDemanda(calc, metric, wMin), [calc, metric, wMin])

  const rowsSorted = useMemo(() => {
    const { col, dir } = sort
    return [...rows].sort((a, b) =>
      col === 'model' ? iphoneModelSort(a.model, b.model) * dir : (a[col] - b[col]) * dir,
    )
  }, [rows, sort])

  function sortBy(col: ColDem) {
    setSort((s) => (s.col === col ? { col, dir: -s.dir } : { col, dir: col === 'model' ? 1 : -1 }))
  }

  const selCount = rowsSorted.filter((r) => !excl.has(r.model)).length
  const allChecked = rowsSorted.length > 0 && selCount === rowsSorted.length

  const totalU = calc.totMin + calc.totMay
  const flecha = (k: ColDem) => (sort.col === k ? (sort.dir < 0 ? ' ▼' : ' ▲') : '')

  return (
    <div className="card" style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>Demanda por modelo (corregida)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#666' }}>Diseños lanzados desde:</label>
          <input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#444', marginBottom: 12 }}>
        {totalU > 0 ? (
          <>
            Del total de fundas (desde {cutoff}): <b>{Math.round((calc.totMin / totalU) * 100)}% minorista</b> ·{' '}
            <b>{Math.round((calc.totMay / totalU) * 100)}% mayorista</b>{' '}
            <span style={{ color: '#9CA3AF' }}>({calc.totMin.toLocaleString('es-AR')} / {calc.totMay.toLocaleString('es-AR')} unid.)</span>
          </>
        ) : (
          'No hay ventas de fundas en el período elegido.'
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap', fontSize: 12, color: '#666' }}>
        <span>Método:</span>
        <label style={{ cursor: 'pointer' }}>
          <input type="radio" name="fm-dem-metric" value="aj" checked={metric === 'aj'} onChange={() => setMetric('aj')} /> Ajustado por agotamiento <span style={{ color: '#9CA3AF' }}>(recomendado)</span>
        </label>
        <label style={{ cursor: 'pointer' }}>
          <input type="radio" name="fm-dem-metric" value="vol" checked={metric === 'vol'} onChange={() => setMetric('vol')} /> Volumen <span style={{ color: '#9CA3AF' }}>(crudo)</span>
        </label>
        {metric === 'aj' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#9CA3AF' }}>·</span> Tope del empujón ×
            <input type="number" value={capK} min={1} max={5} step={0.5} onChange={(e) => setCapK(parseFloat(e.target.value) || 2.5)} style={{ width: 54, textAlign: 'center', padding: '3px 5px', fontSize: 12 }} />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap', fontSize: 12, color: '#666' }}>
        <label style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={corteOn} onChange={(e) => setCorteOn(e.target.checked)} /> Cortar la ventana de cada diseño
        </label>
        <span style={{ color: '#9CA3AF' }}>— mido hasta lo que pase primero:</span>
        al mes{' '}
        <input type="number" value={corteDias} min={7} max={180} step={1} onChange={(e) => setCorteDias(parseInt(e.target.value) || 30)} style={{ width: 54, textAlign: 'center', padding: '3px 5px', fontSize: 12 }} /> días, o al agotarse{' '}
        <input type="number" value={corteMod} min={1} max={20} step={1} onChange={(e) => setCorteMod(parseInt(e.target.value) || 5)} style={{ width: 48, textAlign: 'center', padding: '3px 5px', fontSize: 12 }} /> modelos
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#666' }}>Peso de cada canal en la combinada:</span>
        <input
          type="range"
          min={0}
          max={100}
          value={sliderVal}
          onChange={(e) => { setWminTouched(true); setWminManual(parseFloat(e.target.value) || 0) }}
          style={{ width: 160 }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#378ADD' }}>
          Minorista {Math.round(wMin * 100)}% · Mayorista {Math.round((1 - wMin) * 100)}%
        </span>
      </div>

      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ width: 30, textAlign: 'center' }}>
              <input type="checkbox" checked={allChecked} onChange={(e) => setExcl(e.target.checked ? new Set() : new Set(rowsSorted.map((r) => r.model)))} title="Elegir todos / ninguno" />
            </th>
            <th onClick={() => sortBy('model')} style={{ cursor: 'pointer' }}>Modelo{flecha('model')}</th>
            <th onClick={() => sortBy('pMin')} style={{ width: 90, textAlign: 'center', cursor: 'pointer' }}>Minorista{flecha('pMin')}</th>
            <th onClick={() => sortBy('pMay')} style={{ width: 90, textAlign: 'center', cursor: 'pointer' }}>Mayorista{flecha('pMay')}</th>
            <th onClick={() => sortBy('pComb')} style={{ width: 140, textAlign: 'center', cursor: 'pointer' }}>Combinada{flecha('pComb')}</th>
          </tr>
        </thead>
        <tbody>
          {rowsSorted.length ? (
            rowsSorted.map((r: FilaDemandaComb) => {
              const sel = !excl.has(r.model)
              return (
                <tr key={r.model} style={sel ? undefined : { opacity: 0.4 }}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={sel} onChange={(e) => setExcl((s) => toggleSet(s, r.model, e.target.checked))} />
                  </td>
                  <td style={{ fontWeight: 500 }}>{r.model}</td>
                  <td style={{ textAlign: 'center', color: '#888' }}>{r.pMin.toFixed(1)}%</td>
                  <td style={{ textAlign: 'center', color: '#888' }}>{r.pMay.toFixed(1)}%</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>
                    {r.pComb.toFixed(1)}%
                    <div style={{ display: 'inline-block', width: 48, height: 4, background: '#eee', borderRadius: 2, marginLeft: 6, verticalAlign: 'middle' }}>
                      <div style={{ width: `${Math.min(100, r.pComb)}%`, height: '100%', background: '#7F77DD', borderRadius: 2 }} />
                    </div>
                  </td>
                </tr>
              )
            })
          ) : (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9CA3AF', padding: 16 }}>Sin datos de fundas en el período.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#9CA3AF', maxWidth: '58%' }}>
          <b>Ajustado</b>: volumen + empujón a los modelos agotados (capado por el tope). <b>Volumen</b>: unidades crudas. <b>Corte</b>: mide cada diseño en su ventana pareja (1 mes o hasta agotarse N modelos), para que los diseños viejos no acumulen ventaja por tener más tiempo. Agotamiento = Deposito Minorista en 0. Solo diseños lanzados desde la fecha elegida.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#6B7280' }}>{selCount} de {rowsSorted.length} modelos</span>
          <button
            className="btn-sm"
            onClick={() => {
              // Elegidos con peso > 0, renormalizados a 100% (fmDemandaUsar, 3454).
              const sel = rowsSorted.filter((r) => !excl.has(r.model) && r.pComb > 0)
              const suma = sel.reduce((s, r) => s + r.pComb, 0)
              onUsar?.(suma > 0 ? sel.map((r) => ({ model: r.model, pct: +((r.pComb / suma) * 100).toFixed(1) })) : [])
            }}
            title="Lleva los modelos tildados a la simulación (renormalizados a 100%)"
            style={{ background: '#378ADD', color: '#fff' }}
          >
            ↓ Usar los elegidos en la simulación
          </button>
        </div>
      </div>
    </div>
  )
}
