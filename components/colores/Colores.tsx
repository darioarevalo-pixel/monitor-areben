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
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Badge,
  BuscarInput,
  Button,
  Card,
  DatosGate,
  EmptyState,
  FilterBar,
  Input,
  Select,
  TBody,
  THead,
  TableWrap,
  Tabs,
  Td,
  Th,
  Tr,
  chartColor,
  color,
  font,
  space,
  useFiltroUrl,
} from '@/components/ui'

/**
 * "🎨 Por color" (key `colores`, Zattia).
 *
 * Dos sub-pestañas: Ventas por color (selección de colores + gráfico + tabla) y Análisis
 * de agotamiento (ratio por color congelado al primer sellout). Read-only sobre
 * `allColoresSales`/`allAgotamientoData`; la lógica vive en `lib/colores.ts`.
 *
 * Rediseño jul-2026 (patrón Analítica): las sub-pestañas van al header y quedan en la
 * URL, así se puede compartir el link de "agotamiento". Se sacan las últimas clases del
 * CSS legacy que usaba esta sección (`.tabs`, `.fm-models-grid`, `.agot-*`): las tarjetas
 * de agotamiento pasan a Card y las barras de color al sistema.
 */
export function Colores() {
  const { datos, error, progreso, origen } = useDatosMonitor()
  const [sub, setSub] = useFiltroUrl<'ventas' | 'agotamiento'>('sub', 'ventas')

  return (
    <>
      <HeaderAcciones>
        <Tabs
          items={[
            { key: 'ventas', label: 'Ventas por color' },
            { key: 'agotamiento', label: 'Agotamiento' },
          ]}
          value={sub}
          onChange={(k) => setSub(k as 'ventas' | 'agotamiento')}
        />
      </HeaderAcciones>

      <DatosGate datos={datos} error={error} progreso={progreso} origen={origen} esqueleto="tabla">
        {(d) => (sub === 'ventas' ? <PanelVentas /> : <PanelAgotamiento data={d.allAgotamientoData} />)}
      </DatosGate>
    </>
  )
}

function PanelVentas() {
  const { datos } = useDatosMonitor()
  const sales = useMemo(() => datos?.allColoresSales ?? [], [datos])
  const months = useMemo(() => datos?.allMonths ?? [], [datos])

  const [search, setSearch] = useState('')
  const [periodo, setPeriodo] = useState(12)
  const [colorSearch, setColorSearch] = useState('')
  // Colores DESTILDADOS. Al cambiar búsqueda/período se limpia (el legacy rearmaba los
  // checkboxes todos tildados). Se hace en los handlers, no en un effect.
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => filtrarVentas(sales, search, cutoffDe(periodo, months)), [sales, search, periodo, months])
  const colores = useMemo(() => coloresOrdenados(filtered), [filtered])
  const checked = useMemo(() => new Set(colores.filter((c) => !excluidos.has(c))), [colores, excluidos])
  const { filas, total } = useMemo(() => ventasPorColor(filtered, checked), [filtered, checked])

  function cambiarSearch(v: string) {
    setSearch(v)
    setExcluidos(new Set())
  }
  function cambiarPeriodo(v: number) {
    setPeriodo(v)
    setExcluidos(new Set())
  }
  function toggleColor(c: string, on: boolean) {
    setExcluidos((s) => {
      const n = new Set(s)
      if (on) n.delete(c)
      else n.add(c)
      return n
    })
  }

  const alturaChart = Math.max(240, filas.length * 26 + 60)

  return (
    <>
      <FilterBar>
        <BuscarInput value={search} onChange={cambiarSearch} placeholder="Buscar producto (ej: TOP)…" />
        <Select value={periodo} onChange={(e) => cambiarPeriodo(parseInt(e.target.value))} style={{ width: 180 }} aria-label="Período">
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={0}>Todos</option>
        </Select>
      </FilterBar>

      <Card padding={4} style={{ marginBottom: space[4] }}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[3] }}>
          <strong style={{ fontSize: font.xs, color: color.mut, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Colores ({checked.size}/{colores.length})
          </strong>
          <Input value={colorSearch} onChange={(e) => setColorSearch(e.target.value)} placeholder="Buscar color…" style={{ flex: 1, minWidth: 140, maxWidth: 220 }} />
          <Button size="sm" variant="outline" onClick={() => setExcluidos(new Set())}>
            Todos
          </Button>
          <Button size="sm" variant="outline" onClick={() => setExcluidos(new Set(colores))}>
            Ninguno
          </Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
          {colores.map((c) => {
            const oculto = colorSearch && !c.toLowerCase().includes(colorSearch.toLowerCase())
            return (
              <label
                key={c}
                style={{
                  display: oculto ? 'none' : 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: font.sm,
                  color: color.ink2,
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: 6,
                }}
              >
                <input type="checkbox" checked={checked.has(c)} onChange={(e) => toggleColor(c, e.target.checked)} style={{ accentColor: 'var(--mo-brand-solid)' }} />
                {c}
              </label>
            )
          })}
        </div>
      </Card>

      <Card padding={4} style={{ marginBottom: space[4] }}>
        <div style={{ height: alturaChart }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filas} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={chartColor.grid} />
              <XAxis type="number" tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="color" width={120} tick={{ fill: '#344054', fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: chartColor.brandSoft }} contentStyle={{ fontSize: 12, borderRadius: 10, border: `1px solid ${chartColor.grid}` }} />
              <Bar dataKey="qty" fill={chartColor.brand} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
        <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink }}>Por color</h2>
        <span style={{ fontSize: font.sm, color: color.mut }}>
          {total.toLocaleString('es-AR')} {total === 1 ? 'unidad' : 'unidades'} · {filas.length} {filas.length === 1 ? 'color' : 'colores'}
        </span>
      </div>

      <TableWrap maxHeight={520}>
        <THead>
          <Tr>
            <Th width={40}>#</Th>
            <Th>Color</Th>
            <Th align="right">Vendidas</Th>
            <Th>% del total</Th>
          </Tr>
        </THead>
        <TBody>
          {filas.map((f, i) => {
            const pct = total > 0 ? (f.qty / total) * 100 : 0
            return (
              <Tr key={f.color}>
                <Td style={{ color: color.mut2, fontSize: font.xs }}>{i + 1}</Td>
                <Td strong>{f.color}</Td>
                <Td align="right" strong>
                  {f.qty.toLocaleString('es-AR')}
                </Td>
                <Td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: color.mut }}>
                    <span style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(1)}%</span>
                    <span style={{ display: 'inline-block', width: 70, height: 5, background: color.bg2, borderRadius: 3 }}>
                      <span style={{ display: 'block', width: `${Math.min(100, pct)}%`, height: '100%', background: color.brandSolid, borderRadius: 3 }} />
                    </span>
                  </span>
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </TableWrap>
    </>
  )
}

function PanelAgotamiento({ data }: { data: Agotamiento[] }) {
  const [search, setSearch] = useState('')
  const [prov, setProv] = useState('')
  const [estado, setEstado] = useState<FiltrosAgot['estado']>('')

  const provs = useMemo(() => proveedoresAgot(data), [data])
  const lista = useMemo(() => filtrarAgotamiento(data, { search, prov, estado }), [data, search, prov, estado])

  return (
    <>
      <FilterBar>
        <BuscarInput value={search} onChange={setSearch} placeholder="Buscar producto…" />
        <Select value={prov} onChange={(e) => setProv(e.target.value)} style={{ width: 210 }} aria-label="Proveedor">
          <option value="">Todos los proveedores</option>
          {provs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select value={estado} onChange={(e) => setEstado(e.target.value as FiltrosAgot['estado'])} style={{ width: 180 }} aria-label="Estado">
          <option value="">Todos</option>
          <option value="agotado">Con agotamiento</option>
          <option value="en_curso">En curso</option>
        </Select>
      </FilterBar>

      <p style={{ fontSize: font.sm, color: color.mut, marginBottom: space[4], lineHeight: 1.6, maxWidth: 760 }}>
        El porcentaje de cada color se congela en el momento en que se agota la primera variante: así no se acumulan las ventas del color sobreviviente, que sesgarían la comparación.
      </p>

      {lista.length === 0 ? (
        <EmptyState icon="🎨" title="No hay productos con varios colores para analizar" hint={search || prov || estado ? 'Probá aflojando los filtros.' : undefined} dashed />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: space[3] }}>
          {lista.map((prod) => (
            <TarjetaAgot key={prod.product_id} prod={prod} />
          ))}
        </div>
      )}
    </>
  )
}

function TarjetaAgot({ prod }: { prod: Agotamiento }) {
  const colores = coloresDeAgotamiento(prod)
  const refLabel = prod.firstSelloutDate ? 'Ratio al momento del agotamiento' : 'Ratio acumulado actual'
  return (
    <Card padding={4}>
      <div style={{ fontWeight: 700, fontSize: font.md, color: color.ink }}>{prod.product_name}</div>
      <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>{prod.proveedor || 'Sin proveedor'}</div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: space[2], textTransform: 'uppercase', letterSpacing: '.04em' }}>{refLabel}</div>

      {colores.map((c) => (
        <div key={c.color} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
          <span
            style={{
              width: 92,
              flexShrink: 0,
              fontSize: font.sm,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              ...(c.isSoldOut ? { color: color.danger, fontWeight: 600 } : { color: color.ink2 }),
            }}
            title={c.color}
          >
            {c.color}
            {c.isSoldOut ? ' ✗' : ''}
          </span>
          <span style={{ flex: 1, height: 6, background: color.bg2, borderRadius: 3, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', borderRadius: 3, width: `${Math.min(100, c.pct).toFixed(1)}%`, background: c.palette, transition: 'width .3s' }} />
          </span>
          <span style={{ width: 44, textAlign: 'right', fontSize: font.sm, fontWeight: 600, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{c.pct.toFixed(1)}%</span>
          <span style={{ width: 72, textAlign: 'right', fontSize: font.xs, color: color.mut2, fontVariantNumeric: 'tabular-nums' }}>
            {c.sold} / {c.initialStock} u
          </span>
        </div>
      ))}

      <div style={{ marginTop: space[3], paddingTop: space[2], borderTop: `1px solid ${color.line}`, fontSize: font.xs, color: color.mut, display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'center' }}>
        {prod.firstSelloutDate ? (
          <Badge tone="danger" subtle>
            Agotamiento {fmtDate(prod.firstSelloutDate)}
          </Badge>
        ) : (
          <Badge tone="success" subtle>
            En curso
          </Badge>
        )}
        {prod.firstSelloutDate && prod.soldOutColors.length ? (
          <span>
            Primer agotado: <strong style={{ color: color.ink2 }}>{prod.soldOutColors.join(', ')}</strong>
          </span>
        ) : null}
      </div>
    </Card>
  )
}
