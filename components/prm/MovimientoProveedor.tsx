'use client'

/**
 * **Cómo se mueve lo que le compro a este proveedor** — el bloque que cierra el ciclo del PRM.
 *
 * Lo pidió Bruno el 2-sep-2026: *«compra por semana, vendidos en los últimos días, curvas de venta
 * promedio»*. Hasta acá la ficha decía **si entrega** (las OCs) y, sólo en Zattia, **cuánto vende su
 * catálogo** (el ETL por `proveedor_gn`). Lo que faltaba es lo que se mira antes de recomprarle:
 * lo que entró, cuánto salió de eso, y **con qué forma**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 QUÉ MIDE, Y QUÉ ⛔ NO MIDE — y por qué está escrito EN LA PANTALLA
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * El puente es el **producto**, ⛔ no la unidad: se cuentan las ventas de los productos que este
 * proveedor trajo en sus órdenes. Eso ⛔ NO es «cuánto de lo suyo se vendió» — el mismo producto
 * pudo entrar por otra orden, de otro proveedor, o ya estar en el depósito.
 * **Medido: `CaseMe&Co` compró 793 unidades y sus productos vendieron 968.** Un 968 al lado de un
 * 793, sin la frase, se lee como un agujero de inventario. Por eso la frase va arriba y no en un
 * tooltip, y por eso «lo vendido antes de la primera llegada» se muestra en vez de tirarse.
 *
 * 🔴 **Los tres ceros que afirman de más tienen cada uno su cartel**: sin enganche (nadie ató este
 * local a un proveedor de Ingresos) · sin cruce (renglones que no matchearon con el espejo de
 * Gestión Nube) · marca muda (la base de esa marca no contestó). Ninguno es «no vendió nada».
 */
import { useEffect, useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Card,
  Esqueleto,
  Field,
  KpiCard,
  Notice,
  Select,
  TBody,
  TableWrap,
  THead,
  Td,
  Th,
  Tr,
  chartColor,
  color,
  font,
  space,
  weight,
} from '@/components/ui'
import { leerMovimiento, type Movimiento } from '@/lib/prm/cliente'
import { curva, productosOrdenados, ritmo, semanas } from '@/lib/prm/movimiento'
import { diaDeIngreso } from '@/lib/recepciones/core'

/** Las ventanas que ofrece el bloque. La orden de compra más vieja es de junio de 2026. */
const VENTANAS = [90, 180, 365] as const

const entero = (n: number) => Math.round(n).toLocaleString('es-AR')
const decimal = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/** «18 ago». El año no entra: la ventana más larga es un año y el eje se lee por la forma. */
function semanaCorta(lunes: string): string {
  const [, m, d] = lunes.split('-')
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(d)} ${MESES[Number(m) - 1] ?? ''}`
}

export function MovimientoProveedor({ marca, id, hoy }: { marca: string; id: string; hoy: string }) {
  const [dias, setDias] = useState<number>(180)
  const [mov, setMov] = useState<Movimiento | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        const m = await leerMovimiento(marca, id, dias)
        if (vivo) setMov(m)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el movimiento.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, id, dias])

  const calculado = useMemo(() => {
    if (!mov || mov.sinEnganche) return null
    // 🔑 La semana de una orden sale de `diaDeIngreso`, la MISMA función con la que Ingresos
    // muestra la fecha. Escribir acá otra cadena de preferencias es como se llega a una pantalla
    // que dice una fecha y un gráfico que usa otra.
    return {
      serie: semanas(mov.ocs, mov.ventas, hoy, mov.desdeVentas, (o) =>
        diaDeIngreso({ fecha_ingreso: o.fecha_ingreso ?? null, confirmada_at: o.confirmada_at, recibido_en: o.recibido_en ?? '' }),
      ),
      r: ritmo(mov.ventas, hoy),
      c: curva(mov.productos, mov.ventas, hoy),
      filas: productosOrdenados(mov.productos, mov.ventas, hoy),
      compradas: mov.productos.reduce((a, p) => a + p.unidades, 0) + mov.sinCruce.unidades,
      vendidas: mov.ventas.reduce((a, v) => a + v.unidades, 0),
    }
  }, [mov, hoy])

  if (cargando && !mov) return <Esqueleto />
  if (error) return <Notice tone="danger">{error}</Notice>
  if (!mov) return null

  if (mov.sinEnganche) {
    return (
      <Notice tone="neutral">
        Este local no está enganchado a ningún proveedor del sistema de Ingresos, así que no hay
        órdenes suyas de dónde salir. Elegilo arriba.
      </Notice>
    )
  }
  if (!calculado || !mov.ocs.length) {
    return (
      <Notice tone="neutral">
        Está enganchado y todavía no llegó ninguna orden de compra suya. ⛔ No es que no venda: es
        que no hay nada comprado que medir.
      </Notice>
    )
  }

  const { serie, r, c, filas, compradas, vendidas } = calculado
  // 🔴 El denominador del ranking son los productos que SÍ cruzaron. Los que no, se dicen aparte.
  const nuncaVendieron = filas.filter((f) => f.vendidas === 0).length

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <p style={{ fontSize: font.sm, color: color.mut, margin: 0 }}>
        Se cuentan las ventas de <strong>los productos que este proveedor trajo</strong> en sus
        órdenes. ⛔ No es «cuánto de lo suyo se vendió»: el mismo producto puede haber entrado por
        otra orden, de otro proveedor, o ya estar en el depósito. Por eso vendido puede dar más que
        comprado, y no es un error.
      </p>

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <KpiCard label="Comprado" value={entero(compradas)} sub={`${mov.ocs.length} orden(es)`} />
        <KpiCard label={`Vendido (${dias} días)`} value={entero(vendidas)} />
        <KpiCard label="Últimos 7 días" value={entero(r.d7)} sub={`${decimal(r.porDia7)}/día`} />
        <KpiCard label="Últimos 30 días" value={entero(r.d30)} sub={`${decimal(r.porDia30)}/día`} />
        <KpiCard label="Productos suyos" value={entero(filas.length)} sub={nuncaVendieron ? `${nuncaVendieron} sin vender` : 'todos vendieron'} />
        <Field label="Ventana de ventas" hint="Las órdenes más viejas son de junio de 2026.">
          <Select value={String(dias)} onChange={(e) => setDias(Number(e.target.value))}>
            {VENTANAS.map((v) => (
              <option key={v} value={v}>{v} días</option>
            ))}
          </Select>
        </Field>
      </div>

      {/*
        🔴 Los tres carteles del cero. Cada uno dice algo que un número no puede decir solo, y los
        tres son la diferencia entre «no vendió» y «no lo pude preguntar».
      */}
      {mov.marcasMudas.length > 0 && (
        <Notice tone="warning">
          No se pudo preguntar por las ventas de {mov.marcasMudas.join(' y ')}. Lo que ves abajo está
          incompleto, ⛔ y los ceros no son ceros.
        </Notice>
      )}
      {mov.sinCruce.lineas > 0 && (
        <Notice tone="neutral">
          {mov.sinCruce.lineas} renglón(es) de sus órdenes —{entero(mov.sinCruce.unidades)} unidades—
          ⛔ no cruzaron con el catálogo de Gestión Nube, así que de esos no se sabe qué se vendió.
          Están sumados en «Comprado» y afuera de todo lo demás.
        </Notice>
      )}
      {c.antes > 0 && (
        <Notice tone="neutral">
          {entero(c.antes)} unidades de estos productos se vendieron <strong>antes</strong> de que
          llegara su primera orden. Es la prueba de que ⛔ no son productos exclusivos suyos.
        </Notice>
      )}

      {/* ── La serie semanal: entró acá, se vendió allá ──────────────────────────────────── */}
      <Card>
        <div style={{ fontSize: font.md, fontWeight: weight.semibold, marginBottom: space[1] }}>Compras y ventas, por semana</div>
        <div style={{ fontSize: font.xs, color: color.mut, marginBottom: space[2] }}>
          Las dos en unidades y en la misma escala. Las semanas sin nada van en cero: son un dato.
        </div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke={chartColor.grid} />
              <XAxis
                dataKey="lunes" tickFormatter={semanaCorta} interval="preserveStartEnd" minTickGap={24}
                tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false}
              />
              <YAxis
                tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={52}
                tickFormatter={(v: number) => entero(v)}
              />
              <Tooltip
                labelFormatter={(v) => `Semana del ${semanaCorta(String(v))}`}
                formatter={(val: number, name) => [entero(val), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: color.mut }} />
              <Bar dataKey="compradas" name="Compradas" fill={chartColor.brand} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Line dataKey="vendidas" name="Vendidas" stroke={chartColor.success} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ── La curva: la FORMA con que se vende lo suyo ──────────────────────────────────── */}
      <Card>
        <div style={{ fontSize: font.md, fontWeight: weight.semibold, marginBottom: space[1] }}>
          Curva de venta, desde que entra
        </div>
        <div style={{ fontSize: font.xs, color: color.mut, marginBottom: space[2] }}>
          Unidades promedio por producto, semana a semana desde su primera llegada. Cada producto
          entra una vez y sólo cuenta en las semanas que ya cumplió, así que la cola ⛔ no se hunde
          por los que recién llegaron.
          {c.sinFecha > 0 && ` ${c.sinFecha} producto(s) quedaron afuera: ninguna orden suya traía fecha.`}
        </div>
        {!c.puntos.length ? (
          <p style={{ fontSize: font.sm, color: color.mut }}>Todavía no hay ningún producto suyo con fecha de llegada.</p>
        ) : (
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={c.puntos} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} stroke={chartColor.grid} />
                <XAxis
                  dataKey="semana" tickFormatter={(v: number) => `sem ${v}`} interval="preserveStartEnd" minTickGap={20}
                  tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false}
                />
                <YAxis
                  tick={{ fill: chartColor.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={52}
                  tickFormatter={(v: number) => decimal(v)}
                />
                <Tooltip
                  labelFormatter={(v) => `Semana ${v} desde que entró`}
                  formatter={(val: number, _n, item) => [
                    `${decimal(val)} u. por producto`,
                    `${(item?.payload as { maduros?: number })?.maduros ?? 0} producto(s) con esa edad`,
                  ]}
                />
                <Line dataKey="promedio" name="Promedio por producto" stroke={chartColor.brand} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ── Uno por uno ─────────────────────────────────────────────────────────────────── */}
      <TableWrap>
        <THead>
          <Tr>
            <Th>Producto</Th>
            <Th align="right">Compradas</Th>
            <Th align="right">Vendidas</Th>
            <Th align="right">Por semana</Th>
            <Th align="right">Semanas</Th>
          </Tr>
        </THead>
        <TBody>
          {filas.map((f) => (
            <Tr key={f.clave}>
              <Td strong>{f.nombre ?? f.sku ?? f.producto_id}</Td>
              <Td align="right" mono>{entero(f.unidades)}</Td>
              <Td align="right" mono>{entero(f.vendidas)}</Td>
              {/* ⛔ Un guion, no un 0: el que no cumplió una semana no tiene ritmo, no tiene ritmo cero. */}
              <Td align="right" mono>{f.porSemana == null ? '—' : decimal(f.porSemana)}</Td>
              <Td align="right" mono>{f.semanasEnCalle == null ? '—' : entero(f.semanasEnCalle)}</Td>
            </Tr>
          ))}
        </TBody>
      </TableWrap>
    </div>
  )
}
