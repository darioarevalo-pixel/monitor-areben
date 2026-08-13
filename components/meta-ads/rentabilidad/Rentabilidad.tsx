'use client'

/**
 * **Rentabilidad** — hasta cuánto se puede pagar por una compra, y por qué.
 *
 * # Qué contesta y a quién
 *
 * Contesta la única pregunta que todas las otras pantallas de Meta dejaban abierta: **¿esto rinde?**
 * Hasta acá cada «rinde / no rinde» era una opinión, porque el umbral vivía en una planilla aparte.
 * El que la mira es el que decide subir o bajar un presupuesto, y se tiene que ir con **un número**:
 * el techo de costo por compra.
 *
 * # Las tres decisiones de esta pantalla
 *
 * 1. 🔑 **La regla va ARRIBA de todo y en una frase.** Es lo único que hay que recordar; el resto
 *    del scroll existe para poder confiar en ella, no para leerlo cada vez.
 * 2. 🔑 **El semáforo es el costo por compra, no el ROAS.** El bloque «El mix de cobro» lo
 *    demuestra en vivo: entre todo-tarjeta y todo-transferencia el techo se mueve menos del 1% y el
 *    ROAS más del 10%. Como no sabemos el mix, el ROAS depende de un dato que no tenemos y el techo
 *    no. Corolario que ya confundió una vez y por eso está escrito en la pantalla: **si crece la
 *    transferencia, el ROAS de Ads Manager baja sin que la pauta empeore.**
 * 3. ⚠️ **Los supuestos son los de las fundas de BDI**, y el cartel lo dice. Esta tanda es
 *    estática: lo que se mueve vive en la pantalla y se pierde al salir. La tanda que sigue los
 *    persiste por marca (`api/datos.js?recurso=…`, ⛔ sin archivo nuevo en `api/`), y la tercera
 *    —la que de verdad la justifica— cruza el techo con `meta_ads_snapshot_dia` para que deje de
 *    ser una calculadora y pase a ser una alarma.
 *
 * La matemática está toda en `lib/meta-ads/rentabilidad.ts`, con su banco de pruebas. Acá no se
 * calcula nada: **dos implementaciones del mismo margen es cómo se termina discutiendo cuál está
 * bien.**
 */

import { useMemo } from 'react'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { PanelesDeSupuestos } from '@/components/meta-ads/rentabilidad/Supuestos'
import { useRentabilidad, type EstadoRentabilidad } from '@/components/meta-ads/rentabilidad/useRentabilidad'
import { plata, roas as equis, decimal } from '@/lib/meta-ads/formato'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import {
  calcularRentabilidad, escenariosDeFreno, proyeccionStock,
  type Rentabilidad as Resultado, type Supuestos,
} from '@/lib/meta-ads/rentabilidad'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import { InfoPopover } from '@/components/ui/InfoPopover'
import {
  Button, Card, KpiCard, Notice, SectionCard, Tabs, TBody, TableWrap, Td, Th, THead, Tr,
  color, font, space, weight, type TabItem,
} from '@/components/ui'

/** Millones, para las cifras del stock entero: `$132,5M`. Abajo de un millón se escribe entero. */
const millones = (v: number) =>
  Math.abs(v) >= 1e6 ? `$${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M` : plata(v)

export function Rentabilidad() {
  const { linea, setLinea, visibles } = useMeta()

  /**
   * 🔑 **La línea se valida al RENDERIZAR, no con un efecto que la corrija.**
   *
   * El eje de la sección admite «Todas», que acá no significa nada —el umbral es de una economía, y
   * tres economías no se promedian—. Así que se elige la primera visible y listo. Corregirlo con un
   * efecto dejaría un cuadro intermedio calculando contra otra línea, que es el patrón que ya mordió
   * tres veces en esta sección y que el lint del repo prohíbe (ver `ContextoMeta`).
   *
   * ⚠️ Tampoco se escribe el eje de vuelta: alguien que venía de Campañas mirando «Todas» y pasa
   * por acá tiene que encontrar «Todas» al volver. Lo que se elige EN estas pestañas sí lo escribe,
   * porque ahí la intención es explícita.
   */
  const laLinea: LineaPauta | null = linea !== 'todas' ? linea : (visibles[0] ?? null)

  if (!laLinea) {
    return <Notice tone="warning">No tenés ninguna línea de pauta habilitada para mirar.</Notice>
  }
  return <DeUnaLinea key={laLinea} laLinea={laLinea} visibles={visibles} setLinea={setLinea} />
}

/**
 * La pantalla de UNA línea.
 *
 * Va aparte y con `key={laLinea}` a propósito: cambiar de pestaña **remonta todo**. Cada línea es
 * su propia economía, y arrastrar lo que se estaba editando de BDI a la pestaña de Zattia sería
 * mostrarle a Zattia los números de otro producto.
 */
function DeUnaLinea({ laLinea, visibles, setLinea }: {
  laLinea: LineaPauta
  visibles: LineaPauta[]
  setLinea: (l: LineaPauta) => void
}) {
  const m = useRentabilidad(laLinea)
  const s = m.supuestos
  const r = useMemo(() => calcularRentabilidad(s), [s])

  const pestañas: TabItem[] = visibles.map((l) => ({ key: l, label: ETIQUETA_LINEA[l] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* Sin «Todas»: el umbral es de UNA economía. Sólo si hay más de una para elegir. */}
      {visibles.length > 1 && (
        <Tabs items={pestañas} value={laLinea} onChange={(k) => setLinea(k as LineaPauta)} />
      )}

      {m.error && <Notice tone="danger">{m.error}</Notice>}

      <Regla r={r} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: space[3] }}>
        <KpiCard
          label="Techo por compra"
          value={plata(r.costoMax)}
          tone="brand"
          sub={<>Hoy pagás {plata(s.costoHoy)} · <b>{decimal(r.aire)}× de aire</b></>}
          info={<InfoPopover titulo="Techo por compra">El semáforo. Es lo máximo que se puede pagar por una compra sin comerse más ganancia de la que se decidió entregarle a la pauta.</InfoPopover>}
        />
        <KpiCard
          label="ROAS objetivo"
          value={equis(r.roasObj)}
          sub={<>Punto de equilibrio: <b>{equis(r.roasBE)}</b></>}
          info={<InfoPopover titulo="ROAS objetivo">El ROAS que corresponde al techo. 🔴 El break-even NO es el objetivo: entre los dos se gana plata, sólo que menos de la decidida. Confundirlos hace apagar campañas que están dando ganancia.</InfoPopover>}
        />
        <KpiCard
          label="Presupuesto diario"
          value={plata(r.diario)}
          sub={<>Para {decimal(s.ventasDia)} ventas por día</>}
          info={<InfoPopover titulo="Presupuesto diario">Lo que se puede gastar por día si cada compra sale el techo y se llega al objetivo de ventas.</InfoPopover>}
        />
        <KpiCard
          label="Vaciar el stock"
          value={`${decimal(r.dias)} días`}
          sub={<>{Math.round(r.compras).toLocaleString('es-AR')} compras · {millones(r.factu)}</>}
          info={<InfoPopover titulo="Vaciar el stock">A ese ritmo de ventas, cuánto tarda en venderse el stock cargado y cuánto factura.</InfoPopover>}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: space[4], alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <DeDondeSalen m={m} linea={laLinea} />
          <PanelesDeSupuestos s={s} cambiar={m.cambiar} soloLectura={!m.puedeEditar} />
          <BarraDeGuardado m={m} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <Cascada s={s} r={r} />
          <Canales s={s} r={r} />
          <Escenarios s={s} r={r} />
          <Stock s={s} r={r} />
        </div>
      </div>
    </div>
  )
}

/**
 * De dónde salen los números que se están viendo. **Nunca calla.**
 *
 * Son tres estados y cada uno se lee distinto: los guardados de esta línea (con la firma de quién),
 * los defaults prestados porque la línea todavía no cargó los suyos, y los defaults porque la
 * lectura falló. El del medio es el que importa: los defaults son la economía de las fundas de BDI,
 * y mostrárselos a Zattia sin decirlo haría pasar el techo de un producto por el de otro.
 */
function DeDondeSalen({ m, linea }: { m: EstadoRentabilidad; linea: LineaPauta }) {
  if (m.cargando) return <Notice tone="neutral">Leyendo el umbral de {ETIQUETA_LINEA[linea]}…</Notice>

  if (!m.origen.guardado) {
    return (
      <Notice tone="warning">
        <b>{ETIQUETA_LINEA[linea]} todavía no tiene sus números.</b> Lo que se ve es la economía de
        las <b>fundas de BDI</b>, que es de donde salió esta calculadora
        {linea === 'bdi' ? '' : ' — otro producto, otro costo y otro margen'}.
        {m.puedeEditar ? ' Cargá los suyos y guardá.' : ' Todavía no hay nada guardado para esta línea.'}
      </Notice>
    )
  }

  const cuando = m.origen.cuando
    ? new Date(m.origen.cuando).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  return (
    <Notice tone="success">
      Los números de <b>{ETIQUETA_LINEA[linea]}</b>
      {m.origen.por ? <>, guardados por <b>{m.origen.por}</b></> : null}
      {cuando ? ` el ${cuando}` : null}.
      {!m.puedeEditar && ' Los podés mover para probar, pero el guardado es de un admin.'}
    </Notice>
  )
}

/**
 * Guardar y descartar. **Guardar es un botón y no un efecto**, y por eso esto existe.
 *
 * El umbral es lo que todas las otras pantallas leen como «rinde»: con autoguardado, arrastrar el
 * deslizador del reparto —que va de 10% a 100%— publicaría una decisión de negocio por cada pixel.
 * Mientras haya cambios sin guardar, la barra queda a la vista y lo dice.
 */
function BarraDeGuardado({ m }: { m: EstadoRentabilidad }) {
  if (!m.puedeEditar) {
    return (
      <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.5 }}>
        Mové lo que quieras: es una prueba tuya y no le cambia el umbral a nadie. Guardarlo es de un
        admin.
      </div>
    )
  }

  /**
   * 🔑 **Una línea sin fila propia se puede guardar SIN tocar nada.**
   *
   * Parecía un caso de borde y no lo es: el cartel de arriba dice «cargá los suyos y guardá», y con
   * el botón atado sólo a que haya cambios, la única forma de estrenar una línea era moverle algo y
   * volverlo atrás. Confirmar los números prestados **es** el acto: los convierte de «esto es lo de
   * BDI mientras no haya nada mejor» en «esto es lo de esta línea, y lo firmó alguien».
   */
  const estrenando = !m.origen.guardado
  const hayQueGuardar = m.sucio || estrenando
  const destacado = m.sucio

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: space[3],
        border: `1px solid ${destacado ? color.warningBorder : color.line}`,
        background: destacado ? color.warningBg : color.surface,
        borderRadius: 10,
      }}
    >
      <span style={{ fontSize: font.sm, color: destacado ? color.warningInk : color.mut2, flex: 1 }}>
        {m.sucio ? 'Hay cambios sin guardar' : estrenando ? 'Todavía sin guardar' : 'Sin cambios'}
      </span>
      {m.sucio && (
        <Button variant="ghost" size="sm" onClick={m.descartar} disabled={m.guardando}>
          Descartar
        </Button>
      )}
      <Button size="sm" onClick={() => void m.guardar()} disabled={!hayQueGuardar || m.guardando}>
        {m.guardando ? 'Guardando…' : estrenando && !m.sucio ? 'Guardar estos números' : 'Guardar'}
      </Button>
    </div>
  )
}

/** La frase que hay que recordar. Va arriba de todo y repite el número grande a propósito. */
function Regla({ r }: { r: Resultado }) {
  return (
    <Card style={{ background: color.brandBg, borderColor: color.brandBorder, fontSize: font.md, lineHeight: 1.6 }}>
      Subir el presupuesto mientras el conjunto <b>tope su techo</b> y el costo por compra esté
      debajo de <b style={{ color: color.brandSolid }}>{plata(r.costoMax)}</b>. Frenar cuando lo
      pasa. Apagar debajo de <b style={{ color: color.brandSolid }}>{equis(r.roasBE)}</b>, que es
      donde la pauta se come toda la ganancia.
    </Card>
  )
}

/** De lo que paga el cliente a lo que queda: la cascada de una compra entera. */
function Cascada({ s, r }: { s: Supuestos; r: Resultado }) {
  const u = s.unidades
  const filas: Array<[string, string, number, 'subtotal' | 'resta' | 'total']> = [
    ['Ingreso bruto', `${decimal(u)} unidades con descuento`, r.unidad.bruto * u, 'subtotal'],
    ['IVA', `${decimal(s.iva)}%`, -r.unidad.iva * u, 'resta'],
    ['Ingreso neto', '', r.unidad.neto * u, 'subtotal'],
    ['Producto', `${decimal(u)} × ${plata(s.costo)} sin IVA`, -r.unidad.producto * u, 'resta'],
    ['Ingresos Brutos', `${decimal(s.iibb)}%`, -r.unidad.iibb * u, 'resta'],
    ['Impuesto al cheque', `${decimal(s.cheque)}%`, -r.unidad.cheque * u, 'resta'],
    ['Comisiones', 'Tienda Nube + pasarela, según el mix', -r.unidad.comision * u, 'resta'],
    ['Queda para pauta y ganancia', '', r.contribPedido, 'total'],
  ]

  return (
    <SectionCard
      title="Una compra, de punta a punta"
      subtitle={`Ticket de ${plata(r.ticket)} — el mismo contra el que Meta calcula el ROAS`}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filas.map(([etq, sub, val, cls]) => (
          <div
            key={etq}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: space[3],
              padding: '7px 0',
              borderTop: cls === 'subtotal' || cls === 'total' ? `1px solid ${color.line}` : undefined,
              fontWeight: cls === 'total' ? weight.bold : cls === 'subtotal' ? weight.semibold : weight.normal,
              color: cls === 'total' ? color.successInk : cls === 'resta' ? color.mut : color.ink,
              fontSize: cls === 'total' ? font.lg : font.base,
            }}
          >
            <span>
              {etq}
              {sub && <span style={{ color: color.mut2, fontSize: font.xs, marginLeft: 6 }}>{sub}</span>}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{plata(val)}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: space[3], fontSize: font.sm, color: color.mut }}>
        Sobrevive <b style={{ color: color.ink2 }}>{decimal(r.margenPct)}%</b> de la venta bruta.
        Eso —y nada más— es lo que se reparte entre la pauta y la ganancia.
      </div>
    </SectionCard>
  )
}

/**
 * Los dos caminos de cobro, y **el bloque que sostiene toda la pantalla**: cuánto mueve el mix.
 *
 * El texto se arma con el resultado y no está clavado, porque el mismo motor con otros supuestos
 * puede dar vuelta la conclusión: si el descuento por transferencia sube lo suficiente, deja de
 * convenir. Un cartel fijo diciendo «transferencia deja más» mentiría en silencio.
 */
function Canales({ s, r }: { s: Supuestos; r: Resultado }) {
  const dif = r.transferencia.contrib - r.tarjeta.contrib
  const margen = (c: { contrib: number; bruto: number }) => (c.bruto > 0 ? (c.contrib / c.bruto) * 100 : 0)
  const { tarjeta: eT, transferencia: eX, spreadPct } = r.extremos
  const pesaPoco = spreadPct < 5

  return (
    <SectionCard
      title="Los dos caminos de cobro"
      info={<InfoPopover titulo="Los dos caminos de cobro">Todo por unidad. La transferencia cobra menos pero se ahorra la pasarela y la comisión de Tienda Nube.</InfoPopover>}
    >
      <TableWrap>
        <THead>
          <Tr>
            <Th>Por unidad</Th>
            <Th align="right">Con tarjeta</Th>
            <Th align="right">Por transferencia</Th>
          </Tr>
        </THead>
        <TBody>
          <Tr><Td>Precio que paga el cliente</Td><Td align="right">{plata(r.tarjeta.bruto)}</Td><Td align="right">{plata(r.transferencia.bruto)}</Td></Tr>
          <Tr><Td>Comisiones</Td><Td align="right">{plata(r.tarjeta.comision)}</Td><Td align="right">{plata(r.transferencia.comision)}</Td></Tr>
          <Tr>
            <Td><b>Te queda</b></Td>
            <Td align="right"><b style={{ color: dif <= 0 ? color.successInk : undefined }}>{plata(r.tarjeta.contrib)}</b></Td>
            <Td align="right"><b style={{ color: dif > 0 ? color.successInk : undefined }}>{plata(r.transferencia.contrib)}</b></Td>
          </Tr>
          <Tr><Td>Margen sobre la venta</Td><Td align="right">{decimal(margen(r.tarjeta))}%</Td><Td align="right">{decimal(margen(r.transferencia))}%</Td></Tr>
        </TBody>
      </TableWrap>

      <div style={{ marginTop: space[4], fontSize: font.base, lineHeight: 1.6 }}>
        {Math.abs(dif) < 1 ? (
          <>
            <b>Los dos caminos dejan lo mismo.</b> El descuento por transferencia se compensa exacto
            con la comisión que evita.
          </>
        ) : dif > 0 ? (
          <>
            <b>Transferencia deja {plata(dif)} más por unidad</b>, aunque cobre menos: el descuento
            sale más barato que la comisión que evita. 🔑 Empujarla es una palanca de margen que{' '}
            <b>no depende de la pauta</b> — a {Math.round(r.compras).toLocaleString('es-AR')} compras,
            cada punto de mix vale {plata((Math.abs(dif) * s.unidades * r.compras) / 100)}.
          </>
        ) : (
          <>
            <b>Tarjeta deja {plata(-dif)} más por unidad</b>: el descuento por transferencia salió
            más caro que la comisión que evita. Convendría achicarlo o empujar cuotas.
          </>
        )}
      </div>

      <div style={{ marginTop: space[4], paddingTop: space[3], borderTop: `1px solid ${color.line}`, fontSize: font.base, lineHeight: 1.6 }}>
        <div style={{ fontWeight: weight.semibold, marginBottom: space[1] }}>
          {pesaPoco ? 'El mix de cobro casi no mueve el techo' : 'El mix de cobro sí mueve el techo'}
          <InfoPopover titulo="El dato que falta">
            No sabemos qué proporción paga por transferencia. Este bloque existe para mostrar que,
            con estos supuestos, no hace falta saberlo para decidir.
          </InfoPopover>
        </div>
        <div>
          Entre <b>todo tarjeta</b> y <b>todo transferencia</b>, lo que se puede pagar por compra va
          de {plata(eT.costoMax)} a {plata(eX.costoMax)} — {decimal(spreadPct)}% de diferencia. El{' '}
          <b>ROAS</b>, en cambio, va de {equis(eT.roas)} a {equis(eX.roas)}, porque cambia el ticket
          que Meta reporta.
        </div>
        {pesaPoco && (
          <div style={{ marginTop: space[2], color: color.ink2 }}>
            ⇒ 🔑 <b>El semáforo es el costo por compra, no el ROAS</b>: es el único de los dos que no
            depende de un dato que no tenemos. Y si mañana crece la transferencia, el ROAS de Ads
            Manager va a <b>bajar sin que la pauta empeore</b> — no es una degradación.
          </div>
        )}
      </div>
    </SectionCard>
  )
}

/** Qué pasa si se le entrega a la pauta más o menos ganancia de la decidida. */
function Escenarios({ s, r }: { s: Supuestos; r: Resultado }) {
  const filas = escenariosDeFreno(s, r)
  return (
    <SectionCard
      title="Dónde poner el freno"
      subtitle="Cuánta de la ganancia se le entrega a la pauta, y qué techo sale de cada reparto"
    >
      <TableWrap>
        <THead>
          <Tr>
            <Th align="right">ROAS</Th>
            <Th>Reparto</Th>
            <Th align="right">Techo por compra</Th>
            <Th align="right">Por día</Th>
          </Tr>
        </THead>
        <TBody>
          {filas.map((e) => (
            <Tr key={e.reparto} style={e.elegido ? { background: color.brandBg } : undefined}>
              <Td align="right">
                <b style={{ color: e.tono === 'danger' ? color.danger : e.tono === 'warning' ? color.warning : e.tono === 'success' ? color.success : undefined }}>
                  {equis(e.roas)}
                </b>
              </Td>
              <Td>{e.etiqueta}</Td>
              <Td align="right">{plata(e.costoMax)}</Td>
              <Td align="right">{plata(e.diario)}</Td>
            </Tr>
          ))}
        </TBody>
      </TableWrap>
      <div style={{ marginTop: space[3], fontSize: font.sm, color: color.mut }}>
        La fila de arriba es el <b>punto de equilibrio</b>, no un objetivo: ahí la pauta se lleva
        toda la ganancia. Va en rojo por eso.
      </div>
    </SectionCard>
  )
}

/** Lo mismo, pero por el stock entero: la plata que hay del otro lado. */
function Stock({ s, r }: { s: Supuestos; r: Resultado }) {
  const filas = proyeccionStock(s, r)
  return (
    <SectionCard
      title={`Vender las ${s.stock.toLocaleString('es-AR')} unidades`}
      subtitle={`${Math.round(r.compras).toLocaleString('es-AR')} compras · ${millones(r.factu)} de facturación`}
    >
      <TableWrap>
        <THead>
          <Tr>
            <Th>Pagando por compra</Th>
            <Th align="right">Se va en pauta</Th>
            <Th align="right">Queda de ganancia</Th>
            <Th align="right">ROAS</Th>
          </Tr>
        </THead>
        <TBody>
          {filas.map((p) => (
            <Tr key={p.etiqueta}>
              <Td>
                {plata(p.costoPorCompra)}
                <span style={{ color: color.mut2, fontSize: font.xs, marginLeft: 6 }}>{p.etiqueta}</span>
              </Td>
              <Td align="right">{millones(p.pauta)}</Td>
              <Td align="right">
                <b style={{ color: p.ganancia > 0 ? color.successInk : color.danger }}>{millones(p.ganancia)}</b>
              </Td>
              <Td align="right">{equis(p.roas)}</Td>
            </Tr>
          ))}
        </TBody>
      </TableWrap>
    </SectionCard>
  )
}
