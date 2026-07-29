'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  compararConMesPrevio,
  metricasPorMes,
  primeraCompraPorCliente,
  variacion,
  ventasMayoristas,
  type MetricaMes,
} from '@/lib/crm/metricas'
import type { FilaVenta } from '@/lib/crm/tipos'
// No sale del índice del kit; se importa directo, igual que en Sesión de fotos.
import { InfoPopover } from '@/components/ui/InfoPopover'
import {
  Card,
  KpiCard,
  Notice,
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
 * "Métricas" — la tercera pestaña de Clientes. El tablero de ventas mayoristas.
 *
 * Vive acá y no en una sección propia por dos razones concretas: **no gasta una
 * función de Vercel** (quedan 3 de 12) y **reusa el lote de ventas que la pestaña
 * Clientes ya bajó**, en vez de repetir la consulta. La lógica está entera en
 * `lib/crm/metricas.ts`, con tests; este archivo solo pinta.
 *
 * Ignora a propósito el selector Mayorista / Todos los canales del header: acá
 * mayorista es `channel_id` 10 y punto, así el número no cambia según qué
 * clientes estén marcados ★. Ver la decisión 1 de `lib/crm/metricas.ts`.
 */

const fmtMonto = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const fmtMontoCorto = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`)

/** Cuántos meses muestra la tabla y el gráfico. 0 = todos. */
const PERIODOS = [
  { v: 6, t: 'Últimos 6 meses' },
  { v: 12, t: 'Últimos 12 meses' },
  { v: 0, t: 'Todo' },
]

export function Metricas({ ventas, cargando }: { ventas: FilaVenta[]; cargando: boolean }) {
  const [periodo, setPeriodo] = useState(12)
  // Congelado al montar, igual que el TODAY del CRM: los cortes por día no deben
  // moverse solos si la pestaña queda abierta.
  const [hoy] = useState(() => new Date())

  const may = useMemo(() => ventasMayoristas(ventas), [ventas])
  const filas = useMemo(() => metricasPorMes(may, primeraCompraPorCliente(may)), [may])
  const comp = useMemo(() => compararConMesPrevio(may, hoy), [may, hoy])

  const visibles = useMemo(() => (periodo > 0 ? filas.slice(0, periodo) : filas), [filas, periodo])
  // El gráfico va al revés que la tabla: el tiempo se lee de izquierda a derecha.
  const chart = useMemo(() => [...visibles].reverse(), [visibles])

  if (cargando) {
    return <div style={{ padding: 24, color: color.mut2 }}>Cargando…</div>
  }

  if (!may.length) {
    return (
      <Notice tone="neutral" icon="ℹ">
        Todavía no hay ventas mayoristas cargadas para mostrar.
      </Notice>
    )
  }

  const a = comp.actual
  const p = comp.previo

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* El mes en curso, medido contra el anterior a la MISMA altura. Sin el recorte,
          el mes de hoy siempre parece un derrumbe: el 29 compite contra un mes de 30. */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2], flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, letterSpacing: -0.2 }}>
            {a ? a.label : 'Este mes'}
          </h2>
          <span style={{ fontSize: font.sm, color: color.mut }}>
            {comp.parcial
              ? `al día ${comp.dia} — comparado contra ${p ? p.label : 'el mes anterior'} al día ${comp.dia}, para que la comparación sea pareja`
              : `mes completo — comparado contra ${p ? p.label : 'el mes anterior'}`}
          </span>
        </div>

        <div className="mo-kpis">
          <KpiCard label="Ventas mayoristas" value={a ? a.ventas.toLocaleString('es-AR') : '0'} sub={<Delta actual={a?.ventas ?? 0} previo={p?.ventas ?? null} />} tone="brand" />
          <KpiCard label="Facturación" value={a ? fmtMonto(a.facturacion) : '$0'} sub={<Delta actual={a?.facturacion ?? 0} previo={p?.facturacion ?? null} />} />
          {/* `info` es un slot para un elemento (el ⓘ del kit), no un texto: pasarle un
              string lo pega contra el título. */}
          <KpiCard
            label="Clientes nuevos"
            value={a ? a.nuevos.toLocaleString('es-AR') : '0'}
            sub={<Delta actual={a?.nuevos ?? 0} previo={p?.nuevos ?? null} />}
            info={<InfoPopover titulo="Clientes nuevos">Compraron por primera vez por canal Mayorista.</InfoPopover>}
          />
          <KpiCard
            label="Clientes que repiten"
            value={a ? a.repiten.toLocaleString('es-AR') : '0'}
            sub={<Delta actual={a?.repiten ?? 0} previo={p?.repiten ?? null} />}
            info={<InfoPopover titulo="Clientes que repiten">Ya habían comprado antes por canal Mayorista.</InfoPopover>}
          />
          <KpiCard label="Ticket promedio" value={a ? fmtMonto(a.ticket) : '$0'} sub={<Delta actual={a?.ticket ?? 0} previo={p?.ticket ?? null} />} />
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Select value={periodo} onChange={(e) => setPeriodo(parseInt(e.target.value, 10))} style={{ width: 190 }} aria-label="Período">
          {PERIODOS.map((x) => (
            <option key={x.v} value={x.v}>{x.t}</option>
          ))}
        </Select>
      </div>

      <Card padding={4}>
        <h3 style={{ fontSize: font.md, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>Facturación y ventas por mes</h3>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke={chartColor.grid} />
              <XAxis dataKey="label" tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-40} textAnchor="end" height={48} />
              <YAxis yAxisId="plata" tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={fmtMontoCorto} />
              <YAxis yAxisId="cant" orientation="right" tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                cursor={{ fill: chartColor.brandSoft }}
                formatter={(v: number, name: string) => [name === 'Facturación' ? fmtMonto(v) : v.toLocaleString('es-AR'), name]}
                labelStyle={{ color: color.ink2, fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: `1px solid ${chartColor.grid}` }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="plata" dataKey="facturacion" name="Facturación" fill={chartColor.brand} radius={[4, 4, 0, 0]} />
              <Line yAxisId="cant" type="monotone" dataKey="ventas" name="Ventas" stroke={chartColor.success} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card padding={4}>
        <h3 style={{ fontSize: font.md, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>Clientes nuevos vs. que repiten</h3>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke={chartColor.grid} />
              <XAxis dataKey="label" tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-40} textAnchor="end" height={48} />
              <YAxis tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                cursor={{ fill: chartColor.brandSoft }}
                labelStyle={{ color: color.ink2, fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: `1px solid ${chartColor.grid}` }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* Apiladas: la altura total es la cantidad de clientes que compraron ese mes. */}
              <Bar dataKey="nuevos" name="Nuevos" stackId="c" fill={chartColor.brand} radius={[0, 0, 0, 0]} />
              <Bar dataKey="repiten" name="Repiten" stackId="c" fill={chartColor.success} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
          <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, letterSpacing: -0.2 }}>Mes a mes</h2>
          <span style={{ fontSize: font.sm, color: color.mut }}>{visibles.length} {visibles.length === 1 ? 'mes' : 'meses'}</span>
        </div>
        <TableWrap maxHeight={520}>
          <THead>
            <Tr>
              <Th>Mes</Th>
              <Th align="right">Ventas</Th>
              <Th align="right">Facturación</Th>
              <Th align="right">Ticket prom.</Th>
              <Th align="right">Clientes</Th>
              <Th align="right">Nuevos</Th>
              <Th align="right">Repiten</Th>
            </Tr>
          </THead>
          <TBody>
            {visibles.map((f) => (
              <FilaMes key={f.mes} f={f} enCurso={comp.parcial && f.mes === comp.actual?.mes} dia={comp.dia} />
            ))}
          </TBody>
        </TableWrap>
        <p style={{ fontSize: 11, color: color.mut2, marginTop: 8 }}>
          Mayorista = ventas con canal de venta Mayorista. No se filtra por estado de la venta: las anuladas se
          eliminan en Gestión Nube, no se marcan.
        </p>
      </section>
    </div>
  )
}

/** La variación contra el mes previo. Sin mes previo no se inventa un 0%. */
function Delta({ actual, previo }: { actual: number; previo: number | null }) {
  if (previo === null) return <span style={{ color: color.mut2 }}>sin mes previo para comparar</span>
  const v = variacion(actual, previo)
  if (v === null) return <span style={{ color: color.mut2 }}>el mes previo fue 0</span>
  // Sin esto, "no cambió" se pintaba "▲ 0%": una flecha para arriba que no sube nada.
  if (Math.round(v) === 0) return <span style={{ color: color.mut2 }}>igual que el mes previo</span>
  const sube = v > 0
  return (
    <span style={{ color: sube ? color.success : color.danger, fontWeight: 600 }}>
      {sube ? '▲' : '▼'} {Math.abs(v).toFixed(0)}% <span style={{ color: color.mut2, fontWeight: 400 }}>vs. mes previo</span>
    </span>
  )
}

function FilaMes({ f, enCurso, dia }: { f: MetricaMes; enCurso: boolean; dia: number }) {
  return (
    <Tr>
      <Td strong>
        {f.label}
        {/* El mes en curso está incompleto: decirlo en la fila evita leerlo como una caída. */}
        {enCurso && <span style={{ fontSize: 11, color: color.mut2, fontWeight: 400 }}> · al día {dia}</span>}
      </Td>
      <Td align="right" strong>{f.ventas.toLocaleString('es-AR')}</Td>
      <Td align="right" strong>{fmtMonto(f.facturacion)}</Td>
      <Td align="right">{fmtMonto(f.ticket)}</Td>
      <Td align="right">{f.clientes.toLocaleString('es-AR')}</Td>
      <Td align="right" style={{ color: f.nuevos ? color.brandSolid : color.mut2, fontWeight: f.nuevos ? 600 : 400 }}>
        {f.nuevos || '—'}
      </Td>
      <Td align="right">{f.repiten || '—'}</Td>
    </Tr>
  )
}
