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

import { useMemo, useState } from 'react'
import { PanelesDeSupuestos, type Cambiar } from '@/components/meta-ads/rentabilidad/Supuestos'
import { plata, roas as equis, decimal } from '@/lib/meta-ads/formato'
import {
  calcularRentabilidad, DEFAULTS, escenariosDeFreno, proyeccionStock,
  type Rentabilidad as Resultado, type Supuestos,
} from '@/lib/meta-ads/rentabilidad'
import { InfoPopover } from '@/components/ui/InfoPopover'
import {
  Card, KpiCard, Notice, SectionCard, TBody, TableWrap, Td, Th, THead, Tr,
  color, font, space, weight,
} from '@/components/ui'

/** Millones, para las cifras del stock entero: `$132,5M`. Abajo de un millón se escribe entero. */
const millones = (v: number) =>
  Math.abs(v) >= 1e6 ? `$${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M` : plata(v)

export function Rentabilidad() {
  const [s, setS] = useState<Supuestos>(DEFAULTS)
  const cambiar: Cambiar = (k, v) => setS((prev) => ({ ...prev, [k]: v }))

  const r = useMemo(() => calcularRentabilidad(s), [s])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
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
          <Notice tone="warning">
            <b>Son los supuestos de las fundas de BDI.</b> Lo que se mueve acá no se guarda: al salir
            de la pantalla vuelven los de origen.
          </Notice>
          <PanelesDeSupuestos s={s} cambiar={cambiar} />
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
