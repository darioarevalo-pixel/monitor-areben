'use client'

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { useVendidoSale } from '@/components/liquidacion/useVendidoSale'
import { enSaleDelMes } from '@/lib/liquidacion/vendido'
import {
  canalesOrdenados,
  categoriasOrdenadas,
  datosChart,
  filasCanal,
  filasCategoria,
  filtrarPeriodo,
  type Periodo,
} from '@/lib/ventas-mensuales'
import type { EstadisticaMensual } from '@/lib/etl/tipos'
import { HeaderAcciones } from '@/components/layout/acciones'
import { VentasDiarias } from './VentasDiarias'
import {
  Card,
  DatosGate,
  Select,
  Tabs,
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
  useFiltroUrl,
} from '@/components/ui'

/**
 * "📅 Ventas mensuales" (key `ventas-mensuales`, BDI + Zattia). **Dos pestañas.**
 *
 * *Por mes*: selector de período + gráfico de barras (items por mes) + tabla por categoría + tabla
 * por canal. Read-only sobre `allMonthlyStats` del store del ETL; la lógica vive en
 * `lib/ventas-mensuales.ts` con paridad contra el legacy y no se toca.
 *
 * *Día a día*: la venta de cada día, en plata y en unidades, con el corte por canal y contra la
 * semana anterior (`components/ventas-mensuales/VentasDiarias.tsx`).
 *
 * 🔑 **Por qué la serie diaria es una PESTAÑA y no una sección nueva** (decisión de Bruno,
 * 23-ago-2026): es la misma pregunta en otra granularidad, y la serie de ventas ya tiene casa. Una
 * sección nueva habría estrenado un permiso propio — y un permiso que nadie tilda es una pantalla
 * que no ve nadie. Adentro de ésta, quien ya mira las ventas mensuales encuentra el día sin que
 * haya que otorgarle nada.
 *
 * ⚠️ **Las dos pestañas NO comparten la fuente y por eso no comparten el selector.** «Por mes» sale
 * del ETL que ya está en el navegador; «Día a día» pide al servidor, porque la plata por renglón
 * **no está en el ETL** (ver `lib/liquidacion/ventas.ts`). Cada una trae su propio control al
 * header.
 *
 * Rediseño jul-2026 (patrón Analítica): el período va al header —es el control que manda
 * sobre toda la pantalla— y **queda en la URL**, así refrescar no te devuelve a los 12
 * meses de siempre. Las dos tablas son anchas (una columna por categoría / por canal), y
 * ahora scrollean adentro de su propia caja con la cabecera y la columna del mes fijas:
 * antes, al correrse a la derecha, no se sabía qué mes se estaba mirando.
 */
export function VentasMensuales() {
  // 🔑 La pestaña vive en la URL como todo filtro de esta pantalla: compartir el link de la venta
  // del día tiene que abrir la venta del día, no la serie mensual.
  const [tab, setTab] = useFiltroUrl<string>('t', 'mes')

  return (
    <>
      <Tabs
        items={[
          { key: 'mes', label: 'Por mes', guia: 'ventas-mes' },
          { key: 'dia', label: 'Día a día', guia: 'ventas-dia' },
        ]}
        value={tab === 'dia' ? 'dia' : 'mes'}
        onChange={setTab}
        style={{ marginBottom: space[4] }}
      />
      {tab === 'dia' ? <VentasDiarias /> : <PorMes />}
    </>
  )
}

function PorMes() {
  const { datos, error, progreso, origen } = useDatosMonitor()
  const [periodoStr, setPeriodo] = useFiltroUrl<string>('p', '12')
  const periodo = (parseInt(periodoStr) || 12) as Periodo

  return (
    <>
      <HeaderAcciones>
        <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: 190 }} aria-label="Período">
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={0}>Todos</option>
        </Select>
      </HeaderAcciones>

      <DatosGate datos={datos} error={error} progreso={progreso} origen={origen} esqueleto="tabla">
        {(d) => <Contenido stats={d.allMonthlyStats ?? []} periodo={periodo} />}
      </DatosGate>
    </>
  )
}

function Contenido({ stats, periodo }: { stats: EstadisticaMensual[]; periodo: Periodo }) {
  const { marca } = useSesion()
  const vendido = useVendidoSale(marca)
  const filtered = useMemo(() => filtrarPeriodo(stats, periodo), [stats, periodo])
  const cats = useMemo(() => categoriasOrdenadas(filtered), [filtered])
  const channels = useMemo(() => canalesOrdenados(filtered), [filtered])
  const filasCat = useMemo(() => filasCategoria(filtered, cats), [filtered, cats])
  const filasCh = useMemo(() => filasCanal(filtered, channels), [filtered, channels])
  const chart = useMemo(() => datosChart(filtered), [filtered])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Card padding={4}>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke={chartColor.grid} />
              <XAxis dataKey="label" tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-40} textAnchor="end" height={48} />
              <YAxis tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                cursor={{ fill: chartColor.brandSoft }}
                formatter={(v: number) => [v.toLocaleString('es-AR'), 'Items']}
                labelStyle={{ color: color.ink2, fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: `1px solid ${chartColor.grid}` }}
              />
              <Bar dataKey="items" fill={chartColor.brand} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Tabla titulo="Por categoría" nota={`${cats.length} ${cats.length === 1 ? 'categoría' : 'categorías'}`}>
        <TableWrap maxHeight={480}>
          <THead>
            <Tr>
              <Th style={COL_MES_TH}>Mes</Th>
              <Th align="right">Total items</Th>
              {/*
                Va pegado al total y antes que las categorías: es la advertencia sobre el número de
                al lado —cuánto de ese mes salió con una oferta puesta— y no una categoría más.
              */}
              <Th align="right">En sale</Th>
              <Th align="right">Prom./venta</Th>
              {cats.map((c) => (
                <Th key={c} align="right">
                  {c}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {filasCat.map((f) => {
              const sale = enSaleDelMes(vendido?.meses ?? {}, f.mes, f.items)
              return (
              <Tr key={f.mes}>
                <Td strong style={COL_MES_TD}>
                  {f.label}
                </Td>
                <Td align="right" strong>
                  {f.items.toLocaleString('es-AR')}
                </Td>
                <Td align="right" style={sale.u ? { color: color.warning } : { color: color.mut2 }}>
                  {sale.u ? (
                    <>
                      {sale.u.toLocaleString('es-AR')} <span style={{ fontSize: font.xs }}>({sale.pct}%)</span>
                    </>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td align="right">{f.prom}</Td>
                {f.cats.map((v, i) => (
                  <Td key={cats[i]} align="right" style={v == null ? { color: color.mut2 } : undefined}>
                    {v != null ? v.toLocaleString('es-AR') : '—'}
                  </Td>
                ))}
              </Tr>
              )
            })}
          </TBody>
        </TableWrap>
      </Tabla>

      <Tabla titulo="Por canal de venta" nota={`${channels.length} ${channels.length === 1 ? 'canal' : 'canales'}`}>
        <TableWrap maxHeight={480}>
          <THead>
            <Tr>
              <Th style={COL_MES_TH}>Mes</Th>
              <Th align="right">Total ventas</Th>
              {channels.map((c) => (
                <Th key={c} align="right">
                  {c}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {filasCh.map((f) => (
              <Tr key={f.mes}>
                <Td strong style={COL_MES_TD}>
                  {f.label}
                </Td>
                <Td align="right" strong>
                  {f.ventas.toLocaleString('es-AR')}
                </Td>
                {f.canales.map((c, i) => (
                  <Td key={channels[i]} align="right" style={!c.cnt ? { color: color.mut2 } : undefined}>
                    {c.cnt ? (
                      <>
                        {c.cnt} <span style={{ fontSize: font.xs, color: color.mut2 }}>({c.pct}%)</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      </Tabla>
    </div>
  )
}

/** Título de bloque + su tabla. El título va afuera de la caja para que la cabecera de la
    tabla pueda quedar pegajosa contra el borde de arriba. */
function Tabla({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
        <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, letterSpacing: -0.2 }}>{titulo}</h2>
        {nota && <span style={{ fontSize: font.sm, color: color.mut }}>{nota}</span>}
      </div>
      {children}
    </section>
  )
}

/* La columna del mes queda fija al scrollear a la derecha: con una columna por categoría
   la tabla se va muy lejos y sin esto no se sabe de qué mes es la fila que se mira. */
const COL_MES_TH: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 3 }
const COL_MES_TD: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: 'var(--mo-surface)',
  boxShadow: '1px 0 0 var(--mo-line)',
}
