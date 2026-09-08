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
  SkelCelda,
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
import {
  curva,
  estrellas,
  paraAvisar,
  productosOrdenados,
  ritmo,
  semanas,
  VENTANAS_ESTRELLAS,
  type Estrella,
  type Estrellas,
} from '@/lib/prm/movimiento'
import { diaDeIngreso } from '@/lib/recepciones/core'

/** Las ventanas que ofrece el bloque. La orden de compra más vieja es de junio de 2026. */
const VENTANAS = [90, 180, 365] as const

const entero = (n: number) => Math.round(n).toLocaleString('es-AR')
const decimal = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/**
 * «8/9 a las 11:45». 🔴 **En la zona de ARGENTINA y explícita**: `sync_state.updated_at` es UTC, y
 * formatearlo con el reloj de quien mira lo corre tres horas — un stock de las 11:45 que dice
 * «14:45» se lee como más fresco de lo que es, que es justo el error caro acá.
 */
function fechaCorta(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * «en 5 días» · «ya lo colocó». 🔴 **El cero acá ⛔ no es un plazo, es un hecho**: «en 0 días» se
 * lee como un dato roto y lo que dice es que de lo que trajo ⛔ no queda nada.
 */
function plazo(dias: number | null): string {
  if (dias == null) return '—'
  if (dias < 1) return 'ya lo colocó'
  return `en ${entero(dias)} d`
}

/** «18 ago». El año no entra: la ventana más larga es un año y el eje se lee por la forma. */
function semanaCorta(lunes: string): string {
  const [, m, d] = lunes.split('-')
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(d)} ${MESES[Number(m) - 1] ?? ''}`
}

export function MovimientoProveedor({ marca, id, hoy }: { marca: string; id: string; hoy: string }) {
  const [dias, setDias] = useState<number>(180)
  const [ventana, setVentana] = useState<number>(VENTANAS_ESTRELLAS[1])
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
    // 🔑 El stock llega como lista y se usa como índice: la fila del producto ⛔ no puede recorrer
    // 350 renglones por cada una de sus celdas.
    const stock = new Map((mov.stockPorProducto || []).map((s) => [`${s.store}:${s.producto_id}`, s.unidades]))
    return {
      // 🔴 **Lo que entró hace poco, y ⛔ no lo más vendido de siempre.** Son dos preguntas y la de
      // abajo (`filas`) gana siempre por acumulación: un producto de junio con 40 vendidas le pasa
      // por arriba a uno de la semana pasada colocado entero en cinco días, y el único que se
      // puede recomprar a tiempo es el segundo. Ver `lib/prm/estrellas.core.js`.
      e: estrellas(mov.productos, mov.ventas, hoy, { dias: ventana, stock: mov.stockMudo?.length ? null : stock }),
      serie: semanas(mov.ocs, mov.ventas, hoy, mov.desdeVentas, (o) =>
        diaDeIngreso({ fecha_ingreso: o.fecha_ingreso ?? null, confirmada_at: o.confirmada_at, recibido_en: o.recibido_en ?? '' }),
      ),
      r: ritmo(mov.ventas, hoy),
      c: curva(mov.productos, mov.ventas, hoy),
      filas: productosOrdenados(mov.productos, mov.ventas, hoy),
      compradas: mov.productos.reduce((a, p) => a + p.unidades, 0) + mov.sinCruce.unidades,
      vendidas: mov.ventas.reduce((a, v) => a + v.unidades, 0),
    }
  }, [mov, hoy, ventana])

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

  const { e, serie, r, c, filas, compradas, vendidas } = calculado
  // 🔴 El denominador del ranking son los productos que SÍ cruzaron. Los que no, se dicen aparte.
  const nuncaVendieron = filas.filter((f) => f.vendidas === 0).length
  /**
   * 🔴 **Cambiar la ventana deja los números VIEJOS abajo de un rótulo NUEVO.** «Vendido (90 días)»
   * mostrando lo de 30 es una afirmación falsa, ⛔ no un retardo: por eso mientras llega la
   * respuesta la tarjeta muestra el esqueleto y ⛔ no el número anterior.
   *
   * 🔴 **Y muestra una BARRA que late, ⛔ no tres puntitos.** Bruno, 8-sep-2026: *«estaría bueno que
   * marque algo como cargando, en vez de que marque en cero los resultados»*. Los puntos ya no
   * afirmaban un cero, pero se leen como un dato vacío igual. Ver `SkelCelda`.
   */
  const val = (t: string) => (cargando ? <SkelCelda ancho={40} /> : t)
  /**
   * Cuándo se sincronizó el espejo de stock. 🔴 **Va al lado del número y ⛔ no en un tooltip**: el
   * sync de inventario lo aprieta una persona, así que un stock sin fecha se lee como «ahora» y
   * puede ser de anteayer. Con dos marcas se toma la MÁS VIEJA: es la que limita lo que se puede
   * afirmar de la tabla entera.
   */
  const stockAl = fechaCorta((mov.stockAl || []).map((s) => s.cuando).sort()[0])

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <p style={{ fontSize: font.sm, color: color.mut, margin: 0 }}>
        Se cuentan las ventas de <strong>los productos que este proveedor trajo</strong> en sus
        órdenes. ⛔ No es «cuánto de lo suyo se vendió»: el mismo producto puede haber entrado por
        otra orden, de otro proveedor, o ya estar en el depósito. Por eso vendido puede dar más que
        comprado, y no es un error.
      </p>

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <KpiCard label="Comprado" value={val(entero(compradas))} sub={`${mov.ocs.length} orden(es)`} />
        <KpiCard label={`Vendido (${dias} días)`} value={val(entero(vendidas))} />
        <KpiCard label="Últimos 7 días" value={val(entero(r.d7))} sub={`${decimal(r.porDia7)}/día`} />
        <KpiCard label="Últimos 30 días" value={val(entero(r.d30))} sub={`${decimal(r.porDia30)}/día`} />
        <KpiCard label="Productos suyos" value={val(entero(filas.length))} sub={nuncaVendieron ? `${nuncaVendieron} sin vender` : 'todos vendieron'} />
        <Field label="Ventana de ventas" hint="Las órdenes más viejas son de junio de 2026.">
          <Select value={String(dias)} onChange={(e) => setDias(Number(e.target.value))}>
            {VENTANAS.map((v) => (
              <option key={v} value={v}>{v} días</option>
            ))}
          </Select>
        </Field>
      </div>

      {/*
        🔴 Los cuatro carteles del cero. Cada uno dice algo que un número no puede decir solo, y
        los cuatro son la diferencia entre «no vendió» y «no lo pude preguntar» —o «todavía no
        estaba cargado».
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
      {mov.recruzados > 0 && (
        <Notice tone="neutral">
          {mov.recruzados} renglón(es) de sus órdenes se dieron de alta en Gestión Nube{' '}
          <strong>después</strong> de que entrara el aviso, así que se cruzaron recién ahora. Sus
          ventas están contadas abajo.
        </Notice>
      )}
      {c.antes > 0 && (
        <Notice tone="neutral">
          {entero(c.antes)} unidades de estos productos se vendieron <strong>antes</strong> de que
          llegara su primera orden. Es la prueba de que ⛔ no son productos exclusivos suyos.
        </Notice>
      )}

      <BloqueEstrellas
        e={e}
        ventana={ventana}
        onVentana={setVentana}
        stockMudo={mov.stockMudo || []}
        stockAl={stockAl}
      />

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

/**
 * **Lo que entró hace poco y ya se vende** — el bloque que contesta *¿a quién le recompro, y qué?*.
 *
 * 🔑 **Está separado del componente que carga a propósito**: así se puede montar con datos a mano y
 * mirar lo único que importa acá, que es **qué dice cuando no hay un número**. Los tres ceros que
 * afirman de más —el que llegó hoy, el que ⛔ no vendió y el que ⛔ no está en el espejo— viven en
 * este JSX, y con el fetch adentro ⛔ no habría forma de verlos sin una red de mentira.
 */
export function BloqueEstrellas({
  e,
  ventana,
  onVentana,
  stockMudo,
  stockAl,
}: {
  e: Estrellas
  ventana: number
  onVentana: (v: number) => void
  stockMudo: string[]
  stockAl: string | null
}) {
  return (
    <Card>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: space[1] }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: font.md, fontWeight: weight.semibold }}>Lo que entró hace poco y ya se vende</div>
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[1] }}>
            Sus productos que llegaron por <strong>primera vez</strong> en la ventana, ordenados por
            cuándo se termina lo que trajo. Es otra pregunta que la tabla de abajo: aquélla ordena
            por lo más vendido de siempre, y ahí un producto de junio le gana por acumulación a uno
            de la semana pasada que se colocó entero — y el único que se puede recomprar a tiempo es
            el segundo.
          </div>
        </div>
        <Field label="Ventana de ingreso">
          <Select value={String(ventana)} onChange={(ev) => onVentana(Number(ev.target.value))}>
            {VENTANAS_ESTRELLAS.map((v) => (
              <option key={v} value={v}>{v} días</option>
            ))}
          </Select>
        </Field>
      </div>

      {!e.filas.length ? (
        <p style={{ fontSize: font.sm, color: color.mut, margin: 0 }}>
          Ninguna orden suya trajo un producto nuevo en los últimos {ventana} días.
          {e.repuestos > 0 && ` ${e.repuestos} producto(s) que ya había traído antes volvieron a entrar.`}
        </p>
      ) : (
        <>
          <TableWrap>
            <THead>
              <Tr>
                <Th>Producto</Th>
                <Th align="right">Llegó</Th>
                <Th align="right">Compradas</Th>
                <Th align="right">Vendidas</Th>
                <Th align="right">Colocado</Th>
                <Th align="right">Por día</Th>
                <Th align="right">Se termina</Th>
                <Th align="right">Stock hoy</Th>
              </Tr>
            </THead>
            <TBody>
              {e.filas.map((f: Estrella) => (
                <Tr key={f.clave}>
                  <Td strong>
                    {/* 🔑 La misma marca que decide el mail, y ⛔ no una segunda idea de «estrella». */}
                    {paraAvisar(f) ? '⭐ ' : ''}
                    {f.nombre ?? f.sku ?? f.producto_id}
                  </Td>
                  <Td align="right" mono>hace {entero(f.dias)} d</Td>
                  <Td align="right" mono>{entero(f.unidades)}</Td>
                  <Td align="right" mono>{entero(f.vendidas)}</Td>
                  {/* ⛔ Un guion y ⛔ no un 0%: sin unidades compradas no hay fracción que sacar. */}
                  <Td align="right" mono>{f.colocado == null ? '—' : `${Math.round(f.colocado * 100)}%`}</Td>
                  {/* ⛔ El que llegó hoy ⛔ no tiene ritmo cero: no tiene ritmo. */}
                  <Td align="right" mono>{f.porDia == null ? '—' : decimal(f.porDia)}</Td>
                  <Td align="right" mono>{plazo(f.seAgotaEn)}</Td>
                  {/* 🔴 `null` es «no se pudo preguntar» o «no está en el espejo», ⛔ no «no queda». */}
                  <Td align="right" mono>{f.stock == null ? '—' : entero(f.stock)}</Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[2] }}>
            <strong>Se termina</strong> es cuándo ⛔ no queda nada <strong>de lo que él trajo</strong>,
            al ritmo de estos días. <strong>Stock hoy</strong> es otra cosa: el stock del producto
            entero en Gestión Nube, depósito y local. Los dos ⛔ no se restan entre sí: medido el
            8-sep-2026 sobre 109 productos, «comprado − vendido» daba el stock en 97 y ⛔ no en 12
            —TOP TERRA compró 5, vendió 5 y tiene 5— porque la reposición ⛔ no siempre entra por
            una orden.
            {' '}⭐ es lo que se avisa por mail.
            {stockAl && ` El espejo de stock se sincronizó por última vez el ${stockAl}, y lo aprieta una persona desde Reposición: no se actualiza solo.`}
            {e.repuestos > 0 && ` ${e.repuestos} producto(s) suyos volvieron a entrar en la ventana y ⛔ no están acá: de un repuesto ⛔ no se puede decir «colocó el X% de lo que trajo», porque lo vendido sale de un montón donde también está el stock viejo.`}
            {e.sinFecha > 0 && ` ${e.sinFecha} producto(s) quedaron afuera: ninguna orden suya traía fecha.`}
            {stockMudo.length > 0 && ` El stock de ${stockMudo.join(' y ')} ⛔ no se pudo leer, así que esa columna va en «—» y ⛔ no en 0.`}
          </div>
        </>
      )}
    </Card>
  )
}
