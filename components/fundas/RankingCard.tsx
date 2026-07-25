'use client'

import { useMemo, useState } from 'react'
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
import { Button, Card, Field, Input, Notice, Select, TBody, THead, TableWrap, Td, Th, Tr, chartColor, color, font, radius, space } from '@/components/ui'

/** Panel de selección (modelos / fundas): una bandeja dentro de la card de filtros. */
const PANEL: React.CSSProperties = {
  background: color.bg,
  border: `1px solid ${color.line}`,
  borderRadius: radius.lg,
  padding: 12,
  marginTop: space[3],
}
const GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
  gap: 2,
  maxHeight: 200,
  overflowY: 'auto',
  marginTop: 8,
}
const OPCION: React.CSSProperties = {
  alignItems: 'center',
  gap: 6,
  fontSize: font.sm,
  cursor: 'pointer',
  padding: '3px 5px',
  borderRadius: radius.sm,
}

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
export function RankingCard({ datos, onImportar }: { datos: DatosRanking; onImportar?: (filas: { model: string; pct: number }[]) => void }) {
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
  // La elección manual del diseño de corte; el efectivo se deriva abajo.
  const [corteDisenoSel, setCorteDisenoSel] = useState<string | undefined>(undefined)
  const [modelSearch, setModelSearch] = useState('')
  const [prodSearch, setProdSearch] = useState('')
  const [modelosOpen, setModelosOpen] = useState(false)
  const [prodsOpen, setProdsOpen] = useState(false)
  const [sortCol, setSortCol] = useState<Col>('pos')
  const [sortAsc, setSortAsc] = useState(true)

  // Opciones del corte = fundas elegidas, alfabético (index.html:5352-5354).
  const corteOpciones = useMemo(() => [...checkedProds].sort((a, b) => a.localeCompare(b, 'es')), [checkedProds])

  // Diseño de corte efectivo (5355-5365): se respeta la elección manual mientras
  // siga entre las fundas elegidas; si no, cae a un "wave case" o al primero. Es
  // estado derivado, así que se calcula en el render, no con un effect.
  const corteDiseno =
    corteDisenoSel && checkedProds.has(corteDisenoSel)
      ? corteDisenoSel
      : ([...checkedProds].find((p) => p.toLowerCase().includes('wave case')) ?? corteOpciones[0])

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
      {/* La fila de filtros flotaba pelada sobre el lienzo —el mismo defecto que tenía
          Gerencial en la tanda 8— y con ella el aviso del corte y los dos paneles de
          selección. Va todo dentro de UNA card: es un solo control, el de "qué período y
          qué fundas estoy mirando". */}
      <Card padding={3} style={{ marginBottom: space[4] }}>
        <div className="mo-filterbar" style={{ marginBottom: 0 }}>
          <Field label="Desde" width={130}>
            <Select value={rangeStart} onChange={(e) => setRangeStart(e.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>{fmMonthLabel(m)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Hasta" width={130}>
            <Select value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>{fmMonthLabel(m)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Modelos de iPhone" width={170}>
            <Button
              variant="outline"
              onClick={() => { setModelosOpen((o) => !o); setProdsOpen(false) }}
              aria-expanded={modelosOpen}
              style={{ justifyContent: 'space-between', width: '100%' }}
            >
              {checkedModels.size === totalModels ? 'Todos' : `${checkedModels.size} de ${totalModels}`}
              <span aria-hidden style={{ opacity: 0.5 }}>▾</span>
            </Button>
          </Field>
          <Field label="Fundas" width={170}>
            <Button
              variant="outline"
              onClick={() => { setProdsOpen((o) => !o); setModelosOpen(false) }}
              aria-expanded={prodsOpen}
              style={{ justifyContent: 'space-between', width: '100%' }}
            >
              {checkedProds.size === totalProds ? 'Todas' : `${checkedProds.size} de ${totalProds}`}
              <span aria-hidden style={{ opacity: 0.5 }}>▾</span>
            </Button>
          </Field>

          <span style={{ borderLeft: `1.5px solid ${color.line}`, height: 28, margin: '0 2px', alignSelf: 'flex-end' }} />

          <label
            style={{ fontSize: font.base, color: color.ink2, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap', height: 'var(--mo-ctl-h)', alignSelf: 'flex-end' }}
          >
            <input
              type="checkbox"
              checked={corteEnabled}
              onChange={(e) => setCorteEnabled(e.target.checked)}
              style={{ accentColor: 'var(--mo-brand-solid)' }}
            />
            Cortar al agotarse
          </label>
          <Field label="Modelos" width={80}>
            <Select value={corteN} onChange={(e) => setCorteN(parseInt(e.target.value))} disabled={!corteEnabled}>
              {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label="de la funda" width={210}>
            <Select value={corteDiseno ?? ''} onChange={(e) => setCorteDisenoSel(e.target.value)} disabled={!corteEnabled}>
              {corteOpciones.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
        </div>

        {/* El "✂" se saca acá y no en `lib/fundas/ranking`: la regla del rediseño es no
            tocar lib para que la paridad contra el legacy no se mueva, y el Notice ya
            aporta su propia forma de "esto es un aviso". */}
        {resultado.corte.visible && (
          <Notice style={{ marginTop: space[3] }}>{resultado.corte.mensaje.replace(/^\s*✂\s*/, '')}</Notice>
        )}

        {modelosOpen && (
          <div style={PANEL}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <strong style={{ fontSize: font.xs, color: color.mut, letterSpacing: 0 }}>Modelos de iPhone</strong>
              <Input type="search" placeholder="Buscar…" value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} style={{ flex: 1, minWidth: 120, width: 'auto' }} />
              <Button size="sm" variant="outline" onClick={() => setCheckedModels(new Set(def.modelos))}>Todos</Button>
              <Button size="sm" variant="outline" onClick={() => setCheckedModels(new Set())}>Ninguno</Button>
            </div>
            <div style={GRID}>
              {def.modelos.map((m) => {
                const oculto = modelSearch && !m.toLowerCase().includes(modelSearch.toLowerCase())
                return (
                  <label key={m} style={{ ...OPCION, display: oculto ? 'none' : 'flex' }}>
                    <input type="checkbox" checked={checkedModels.has(m)} onChange={(e) => setCheckedModels((s) => toggleSet(s, m, e.target.checked))} style={{ accentColor: 'var(--mo-brand-solid)' }} />
                    {m}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {prodsOpen && (
          <div style={PANEL}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <strong style={{ fontSize: font.xs, color: color.mut, letterSpacing: 0 }}>Nombre de funda</strong>
              <Input type="search" placeholder="Buscar…" value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} style={{ flex: 1, minWidth: 120, width: 'auto' }} />
              <Select value={prodSort} onChange={(e) => setProdSort(e.target.value as OrdenProd)} style={{ width: 170 }}>
                <option value="qty">Más vendidas</option>
                <option value="alpha">Alfabético</option>
                <option value="date">Fecha de ingreso</option>
              </Select>
              <Button size="sm" variant="outline" onClick={() => setCheckedProds(new Set(prodsOrdenados))}>Todas</Button>
              <Button size="sm" variant="outline" onClick={() => setCheckedProds(new Set())}>Ninguna</Button>
              {[10, 20, 30].map((n) => (
                <Button key={n} size="sm" variant="outline" onClick={() => setCheckedProds(new Set(prodsOrdenados.slice(0, n)))}>Top {n}</Button>
              ))}
            </div>
            <div style={GRID}>
              {prodsOrdenados.map((p) => {
                const oculto = prodSearch && !p.toLowerCase().includes(prodSearch.toLowerCase())
                return (
                  <label key={p} style={{ ...OPCION, display: oculto ? 'none' : 'flex' }}>
                    <input type="checkbox" checked={checkedProds.has(p)} onChange={(e) => setCheckedProds((s) => toggleSet(s, p, e.target.checked))} style={{ accentColor: 'var(--mo-brand-solid)' }} />
                    {p}
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: space[4] }}>
        <div className="chart-wrap" style={{ height: chartHeight }}>
          <div style={{ textAlign: 'center', fontSize: font.xs, color: color.mut2, marginBottom: 4 }}>{rangeLabel}</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 8 }}>
              <CartesianGrid horizontal={false} stroke={chartColor.grid} />
              <XAxis type="number" tick={{ fill: chartColor.axis, fontSize: 11 }} />
              <YAxis type="category" dataKey="model" width={140} tick={{ fill: chartColor.axisFuerte, fontSize: 12 }} />
              <Bar dataKey="qty" fill={chartColor.brand} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[2] }}>
        <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink }}>Ranking por modelo</h2>
        <span style={{ fontSize: font.sm, color: color.mut }}>{totalTexto}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onImportar?.(filasOrdenadas.map((f) => ({ model: f.model, pct: f.pct })))}
          title="Lleva este ranking (en el orden actual) a la simulación"
          style={{ marginLeft: 'auto' }}
        >
          Importar a simulación
        </Button>
      </div>

      <TableWrap maxHeight={560}>
        <THead>
          <Tr>
            {/* La posición tiene ancho propio y va a la derecha: pegada al borde
                izquierdo quedaba encimada contra la línea de la tabla. */}
            <Th align="right" width={44} onClick={() => sort('pos')} sort={sortCol === 'pos' ? (sortAsc ? 'asc' : 'desc') : null}>
              {TITULOS.pos}
            </Th>
            {(['model', 'qty', 'pct'] as Col[]).map((c) => (
              <Th
                key={c}
                align={c === 'qty' ? 'right' : 'left'}
                onClick={() => sort(c)}
                sort={sortCol === c ? (sortAsc ? 'asc' : 'desc') : null}
              >
                {TITULOS[c]}
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {filasOrdenadas.map((r) => (
            <Tr key={r.model}>
              <Td align="right" style={{ color: color.mut2, fontVariantNumeric: 'tabular-nums', paddingRight: 14 }}>
                {r.pos}
              </Td>
              <Td strong>{r.model}</Td>
              <Td align="right" strong>
                {r.qty.toLocaleString('es-AR')}
              </Td>
              <Td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: color.mut }}>
                  <span style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.pct}%</span>
                  <span style={{ display: 'inline-block', width: 70, height: 5, background: color.bg2, borderRadius: 3 }}>
                    <span style={{ display: 'block', width: `${Math.min(100, r.pct)}%`, height: '100%', background: color.brandSolid, borderRadius: 3 }} />
                  </span>
                </span>
              </Td>
            </Tr>
          ))}
        </TBody>
      </TableWrap>
    </div>
  )
}
