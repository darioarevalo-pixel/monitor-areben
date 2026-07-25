'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { categoriaDefault, mesLabel, rangoPeriodo, ventasPorTalle } from '@/lib/talles'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Card,
  DatosGate,
  Field,
  Select,
  TBody,
  THead,
  TableWrap,
  Td,
  Th,
  Tr,
  chartColor,
  color,
  font,
  space,
} from '@/components/ui'

/**
 * "📏 Por talle" (key `talles`, Zattia).
 *
 * Categoría + rango de meses (con atajo de período) → gráfico de barras + tabla por
 * talle. Read-only sobre `allTallesData` del store; la lógica vive en `lib/talles.ts`.
 *
 * Rediseño jul-2026 (patrón Analítica): la categoría —que es lo que manda sobre toda la
 * pantalla— va al header; el rango de meses queda abajo, agrupado y etiquetado (antes
 * eran cuatro selects sin jerarquía en una toolbar corrida, y el atajo de período se
 * confundía con el "desde"). La barra de porcentaje de cada talle usa el acento del
 * sistema.
 */
export function Talles() {
  const { datos, error } = useDatosMonitor()

  const categorias = useMemo(() => datos?.allTallesCategories ?? [], [datos])
  const meses = useMemo(() => datos?.allMonths ?? [], [datos])

  // Los defaults (categoría JEANS/primera, período 12m) se DERIVAN cuando el estado está
  // vacío — no se setean en un effect (rompería el CI). El usuario los pisa con los
  // selects; el atajo de período setea desde/hasta.
  const [categoria, setCategoria] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const rango12 = useMemo(() => rangoPeriodo(meses, 12), [meses])
  const catEfectiva = categoria || categoriaDefault(categorias)
  const desdeEf = desde || rango12?.desde || ''
  const hastaEf = hasta || rango12?.hasta || ''

  function aplicarPeriodo(periodo: number) {
    const r = rangoPeriodo(meses, periodo)
    if (r) {
      setDesde(r.desde)
      setHasta(r.hasta)
    }
  }

  const filas = useMemo(() => ventasPorTalle(datos?.allTallesData ?? [], catEfectiva, desdeEf, hastaEf), [datos, catEfectiva, desdeEf, hastaEf])
  const total = filas.reduce((s, f) => s + f.qty, 0)

  return (
    <>
      <HeaderAcciones>
        <Select value={catEfectiva} onChange={(e) => setCategoria(e.target.value)} style={{ minWidth: 190 }} aria-label="Categoría">
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </HeaderAcciones>

      <DatosGate datos={datos} error={error} esqueleto="tabla">
        {() => (
          <>
            <Card padding={4} style={{ marginBottom: space[4] }}>
              <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: space[4] }}>
                <Field label="Período" width={190}>
                  <Select defaultValue={12} onChange={(e) => aplicarPeriodo(parseInt(e.target.value))}>
                    <option value={3}>Últimos 3 meses</option>
                    <option value={6}>Últimos 6 meses</option>
                    <option value={12}>Últimos 12 meses</option>
                    <option value={0}>Todos</option>
                  </Select>
                </Field>
                <Field label="Desde" width={150}>
                  <Select value={desdeEf} onChange={(e) => setDesde(e.target.value)}>
                    {meses.map((m) => (
                      <option key={m} value={m}>
                        {mesLabel(m)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Hasta" width={150}>
                  <Select value={hastaEf} onChange={(e) => setHasta(e.target.value)}>
                    {meses.map((m) => (
                      <option key={m} value={m}>
                        {mesLabel(m)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filas} margin={{ left: 4, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid vertical={false} stroke={chartColor.grid} />
                    <XAxis dataKey="size" tick={{ fill: '#344054', fontSize: 13, fontWeight: 500 }} tickLine={false} axisLine={false} interval={0} />
                    <YAxis tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip cursor={{ fill: chartColor.brandSoft }} contentStyle={{ fontSize: 12, borderRadius: 10, border: `1px solid ${chartColor.grid}` }} />
                    <Bar dataKey="qty" name={catEfectiva} fill={chartColor.brand} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
              <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink }}>Por talle</h2>
              <span style={{ fontSize: font.sm, color: color.mut }}>
                {total.toLocaleString('es-AR')} {total === 1 ? 'unidad' : 'unidades'} · {filas.length} {filas.length === 1 ? 'talle' : 'talles'}
              </span>
            </div>

            <TableWrap maxHeight={520}>
              <THead>
                <Tr>
                  <Th width={40}>#</Th>
                  <Th>Talle</Th>
                  <Th align="right">Unidades vendidas</Th>
                  <Th>% del total</Th>
                </Tr>
              </THead>
              <TBody>
                {filas.length === 0 ? (
                  <Tr>
                    <Td colSpan={4} align="center" style={{ color: color.mut2, padding: 20 }}>
                      Sin datos para esta categoría y período
                    </Td>
                  </Tr>
                ) : (
                  filas.map((f, i) => {
                    const pct = total > 0 ? (f.qty / total) * 100 : 0
                    return (
                      <Tr key={f.size}>
                        <Td style={{ color: color.mut2, fontSize: font.xs }}>{i + 1}</Td>
                        <Td strong style={{ fontSize: font.lg }}>
                          {f.size}
                        </Td>
                        <Td align="right" strong>
                          {f.qty.toLocaleString('es-AR')}
                        </Td>
                        <Td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: color.mut }}>
                            <span style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(1)}%</span>
                            <span style={{ display: 'inline-block', width: 90, height: 5, background: color.bg2, borderRadius: 3 }}>
                              <span style={{ display: 'block', width: `${Math.min(100, pct)}%`, height: '100%', background: color.brandSolid, borderRadius: 3 }} />
                            </span>
                          </span>
                        </Td>
                      </Tr>
                    )
                  })
                )}
              </TBody>
            </TableWrap>
          </>
        )}
      </DatosGate>
    </>
  )
}
