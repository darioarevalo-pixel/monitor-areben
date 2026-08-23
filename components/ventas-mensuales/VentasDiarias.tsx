'use client'

import { useMemo } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSesion } from '@/components/SesionProvider'
import { useVentasDiarias } from './useVentasDiarias'
import { conSemanaAnterior, totalDelTramo, type Corte, type DiaConPrevio } from '@/lib/ventas-diarias'
import { ETIQUETA_CANAL, type Canal } from '@/lib/liquidacion/resultado'
import {
  Card, Esqueleto, KpiCard, Notice, Select, TBody, THead, TableWrap, Td, Th, Tr,
  chartColor, color, font, formatMoney, space, weight, useFiltroUrl,
} from '@/components/ui'
import { HeaderAcciones } from '@/components/layout/acciones'

/**
 * **«Día a día»** — la segunda pestaña de Ventas mensuales (key `ventas-mensuales`, BDI + Zattia).
 *
 * Contesta la pregunta que la serie mensual no puede: *¿cómo viene la venta esta semana?* Un mes
 * cerrado se ve recién el día 1, y una campaña que arranca un martes vive entera adentro de una
 * barra. Acá va el día, en plata y en unidades, con el corte por canal y contra la semana anterior.
 *
 * ⛔ **No sale del ETL: la sirve `api/_ventas-diarias.js`.** El ETL del navegador no baja
 * `venta_detalles.total` y no se lo va a hacer bajar — el motivo está en `lib/liquidacion/ventas.ts`.
 *
 * 🔴 **Tres cosas de esta pantalla existen para que un cero no mienta**, y ninguna es decoración:
 * la barra clarita del día que todavía se está midiendo, el rótulo de «Otros canales» con los
 * nombres crudos adentro, y el pie que dice hasta cuándo está leído el espejo. Sin ellas, un gráfico
 * de barras dibuja igual «el domingo no vendimos», «son las 11 de la mañana» y «Mercadolibre no
 * entra en ninguna columna».
 */

/** Las ventanas que ofrece la pantalla. El 90 es el tope: es hasta dónde el sync relee el espejo. */
const VENTANAS = [14, 30, 90] as const

/**
 * Un color por canal. Va acá y no en los tokens porque es una decisión de esta pantalla: el resto
 * del monitor todavía no dibuja canales apilados. Los nombres salen de `ETIQUETA_CANAL`.
 */
const COLOR_CANAL: Record<Canal, string> = {
  online: chartColor.brand,
  local: chartColor.success,
  mayorista: chartColor.warning,
  otro: '#7A5AF8',
  tecnica: chartColor.axis,
}

const entero = (n: number) => Math.round(n).toLocaleString('es-AR')

/** El día como «lun 18». El año no entra: la ventana más larga son 90 días. */
function diaCorto(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })
}

/**
 * La variación contra la semana anterior, **o `null`**.
 *
 * 🔴 Con la semana anterior en cero no hay porcentaje que calcular: dividir por cero daría `∞` y
 * "creció un 100%" sería una invención. La pantalla escribe «sin comparación» y no un número.
 */
function variacion(hoy: number, antes: number | null | undefined): number | null {
  if (antes == null || antes === 0) return null
  return (hoy - antes) / Math.abs(antes)
}

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: color.mut2 }}>sin comparación</span>
  const arriba = pct >= 0
  return (
    <span style={{ color: arriba ? chartColor.success : chartColor.danger, fontVariantNumeric: 'tabular-nums' }}>
      {arriba ? '▲' : '▼'} {Math.abs(pct * 100).toFixed(0)}%
    </span>
  )
}

export function VentasDiarias() {
  const { marca } = useSesion()
  const [diasStr, setDias] = useFiltroUrl<string>('d', '30')
  const dias = (VENTANAS as readonly number[]).includes(Number(diasStr)) ? Number(diasStr) : 30
  const [medida, setMedida] = useFiltroUrl<string>('m', 'plata')
  const { serie, cargando, error } = useVentasDiarias(marca, dias)

  const filas = useMemo(
    () => (serie ? conSemanaAnterior(serie, serie.visible) : []),
    [serie],
  )
  const resumen = useMemo(() => totalDelTramo(filas), [filas])

  return (
    <>
      <HeaderAcciones>
        <Select value={String(dias)} onChange={(e) => setDias(e.target.value)} style={{ width: 170 }} aria-label="Ventana">
          {VENTANAS.map((v) => <option key={v} value={v}>Últimos {v} días</option>)}
        </Select>
      </HeaderAcciones>

      {error && <Notice tone="danger" style={{ marginBottom: space[4] }}>{error}</Notice>}
      {cargando && <Esqueleto forma="tabla" />}

      {serie && !cargando && (
        <Contenido
          filas={filas}
          resumen={resumen}
          canales={serie.canales}
          nombresPorCanal={serie.nombresPorCanal}
          tecnicas={serie.tecnicas}
          control={serie.control}
          medidoHasta={serie.medidoHasta}
          dias={dias}
          medida={medida === 'unidades' ? 'unidades' : 'plata'}
          onMedida={setMedida}
        />
      )}
    </>
  )
}

type Medida = 'plata' | 'unidades'

function Contenido({
  filas, resumen, canales, nombresPorCanal, tecnicas, control, medidoHasta, dias, medida, onMedida,
}: {
  filas: DiaConPrevio[]
  resumen: { total: Corte; previo: Corte | null; conPrevio: number; incompletos: number }
  canales: Canal[]
  nombresPorCanal: Partial<Record<Canal, string[]>>
  tecnicas: number
  control: { facturado: number; totalPrice: number; ventas: number }
  medidoHasta: string | null
  dias: number
  medida: Medida
  onMedida: (m: string) => void
}) {
  const valor = (c: Corte) => (medida === 'plata' ? c.plata : c.unidades)
  const fmt = (n: number) => (medida === 'plata' ? formatMoney(n) : entero(n))

  const datos = useMemo(
    () => filas.map((f) => ({
      fecha: f.fecha,
      completo: f.completo,
      previo: f.previo ? valor(f.previo) : null,
      ...Object.fromEntries(canales.map((c) => [c, valor(f.porCanal[c])])),
    })),
    // `valor` cambia con la medida y se recalcula todo: es una vuelta sobre ≤90 filas.
    [filas, canales, medida], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div className="mo-kpis">
        <KpiCard
          label={`Facturado · ${dias} días`}
          value={formatMoney(resumen.total.plata)}
          sub={<>vs. semana anterior <Delta pct={variacion(resumen.total.plata, resumen.previo?.plata)} /></>}
        />
        <KpiCard
          label="Unidades"
          value={entero(resumen.total.unidades)}
          sub={<>vs. semana anterior <Delta pct={variacion(resumen.total.unidades, resumen.previo?.unidades)} /></>}
        />
        <KpiCard
          label="Compras"
          value={entero(resumen.total.compras)}
          sub={<>vs. semana anterior <Delta pct={variacion(resumen.total.compras, resumen.previo?.compras)} /></>}
        />
      </div>

      <Card padding={4}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
          <span style={{ fontSize: font.xl, fontWeight: weight.bold, letterSpacing: -0.2, color: color.ink }}>
            Día a día
          </span>
          <Select value={medida} onChange={(e) => onMedida(e.target.value)} style={{ width: 150 }} aria-label="Medida">
            <option value="plata">En plata</option>
            <option value="unidades">En unidades</option>
          </Select>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginLeft: 'auto' }}>
            {canales.map((c) => (
              <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.mut }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: COLOR_CANAL[c] }} />
                {ETIQUETA_CANAL[c]}
              </span>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.mut }}>
              <span style={{ width: 16, height: 2, background: chartColor.axisFuerte }} />
              Semana anterior
            </span>
          </div>
        </div>

        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={datos} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke={chartColor.grid} />
              <XAxis
                dataKey="fecha" tickFormatter={diaCorto} interval="preserveStartEnd" minTickGap={24}
                tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false}
              />
              <YAxis
                tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={64}
                tickFormatter={(v: number) => (medida === 'plata' ? `${Math.round(v / 1000)}k` : entero(v))}
              />
              <Tooltip
                labelFormatter={(v) => diaCorto(String(v))}
                formatter={(val: number, name) => [fmt(val), name]}
              />
              {canales.map((c) => (
                <Bar key={c} dataKey={c} stackId="v" name={ETIQUETA_CANAL[c]} fill={COLOR_CANAL[c]}>
                  {/*
                    🔴 La barra clarita es el día que TODAVÍA SE ESTÁ MIDIENDO. El espejo se llena a
                    las 4 de la mañana: sin esto, la media jornada de hoy se dibuja al lado de días
                    enteros y se lee como un derrumbe.
                  */}
                  {datos.map((d) => (
                    <Cell key={d.fecha} fillOpacity={d.completo === false ? 0.4 : 1} />
                  ))}
                </Bar>
              ))}
              <Line
                dataKey="previo" name="Semana anterior" stroke={chartColor.axisFuerte}
                strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <TableWrap>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead>
              <Tr>
                <Th>Día</Th>
                <Th align="right">Compras</Th>
                <Th align="right">Unidades</Th>
                <Th align="right">Facturado</Th>
                {canales.map((c) => <Th key={c} align="right">{ETIQUETA_CANAL[c]}</Th>)}
                <Th align="right">vs. semana ant.</Th>
              </Tr>
            </THead>
            <TBody>
              {[...filas].reverse().map((f) => (
                <Tr key={f.fecha}>
                  <Td>
                    {diaCorto(f.fecha)}
                    {f.completo === false && (
                      <span style={{ marginLeft: 6, fontSize: font.xs, color: chartColor.warning }}>midiéndose</span>
                    )}
                  </Td>
                  <Td align="right">{entero(f.total.compras)}</Td>
                  <Td align="right">{entero(f.total.unidades)}</Td>
                  <Td align="right">{formatMoney(f.total.plata)}</Td>
                  {canales.map((c) => <Td key={c} align="right">{fmt(valor(f.porCanal[c]))}</Td>)}
                  <Td align="right"><Delta pct={variacion(valor(f.total), f.previo ? valor(f.previo) : null)} /></Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableWrap>
      </Card>

      <AlPie
        canales={canales} nombresPorCanal={nombresPorCanal} tecnicas={tecnicas}
        control={control} medidoHasta={medidoHasta} incompletos={resumen.incompletos}
      />
    </div>
  )
}

/**
 * Lo que hay que saber para creerle a los números de arriba.
 *
 * 🔑 **Va siempre, aunque no haya nada raro que contar.** Callarse cuando todo está bien enseña a
 * no leer el pie, y el día que diga algo nadie lo mira. Es el mismo criterio que la línea de «leído
 * hace X» del resto del monitor.
 */
function AlPie({
  canales, nombresPorCanal, tecnicas, control, medidoHasta, incompletos,
}: {
  canales: Canal[]
  nombresPorCanal: Partial<Record<Canal, string[]>>
  tecnicas: number
  control: { facturado: number; totalPrice: number; ventas: number }
  medidoHasta: string | null
  incompletos: number
}) {
  // La diferencia se mide en plata y se muestra en plata: un porcentaje sobre decenas de millones
  // esconde justo la magnitud que decide si importa.
  const brecha = Math.abs(control.facturado - control.totalPrice)
  const cierra = control.facturado === 0 ? true : brecha / Math.abs(control.facturado) < 0.005
  const otros = nombresPorCanal.otro || []

  const lineas: React.ReactNode[] = [
    medidoHasta
      ? `El espejo de ventas está leído hasta el ${diaCorto(medidoHasta)}${incompletos > 0 ? `: el día de hoy se está midiendo y su barra va más clara` : ''}.`
      : 'No se pudo saber hasta cuándo está leído el espejo, así que ningún día se puede dar por cerrado.',
    `Facturado = lo de los renglones, menos el descuento, más el envío — la misma cuenta que usa Dirección. Cotejado contra el total que trae Gestión Nube en cada venta: ${cierra ? `coincide (${formatMoney(brecha)} de diferencia en ${entero(control.ventas)} ventas)` : `DIFIERE en ${formatMoney(brecha)} sobre ${entero(control.ventas)} ventas`}.`,
  ]
  if (canales.includes('otro') && otros.length) {
    lineas.push(`«${ETIQUETA_CANAL.otro}» son ${otros.join(', ')}: no tienen columna propia y sin este renglón su venta desaparecería del gráfico.`)
  }
  lineas.push(
    tecnicas > 0
      ? `Quedaron afuera ${entero(tecnicas)} ventas técnicas (Sesión de fotos, Fallas y canjes crean una venta en Gestión Nube sólo para descontar stock). Es el mismo criterio que usa el resto del monitor.`
      : 'No hubo ventas técnicas en la ventana.',
    'La comparación es contra el MISMO día de la semana anterior, no contra el día anterior: la venta tiene semana y un lunes contra un domingo siempre parece una hazaña.',
  )

  return (
    <div style={{ fontSize: font.sm, color: color.mut, display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {lineas.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}
