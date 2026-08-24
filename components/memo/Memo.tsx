'use client'

import { useEffect, useRef, useState } from 'react'
import { HeaderAcciones } from '@/components/layout/acciones'
import { InfoPopover } from '@/components/ui/InfoPopover'
import {
  Badge, Button, Card, EmptyState, Esqueleto, Notice, SectionCard,
  TBody, THead, TableWrap, Td, Th, Tr, color, font, formatMoney, radius, space, useToast,
} from '@/components/ui'
import { useGerencial } from '@/components/gerencial/useGerencial'
import { useSesion } from '@/components/SesionProvider'
import {
  LABEL_LINEA, LINEAS_MEMO, SISTEMAS, TEMAS,
  costoPorCompra, delta, etiquetaSemana, resumirCanales, semaforoPauta, semanaAnterior,
  semanaSiguiente, ticketPromedio,
  type Bloque, type Campo, type Foto, type Linea, type Semana, type Senales, type VentaLinea,
} from '@/lib/memo/tipos'
import { ETIQUETA_CANAL, type Canal } from '@/lib/liquidacion/resultado'
import { resumirClavados as resumirClav } from '@/lib/clavados/tipos'
import { resumirSenales, semanaHoy, useAutoguardado, useMemoSemanal } from './useMemoSemanal'

/**
 * Memo semanal (key `memo`), en Dirección.
 *
 * Es la otra mitad del panel Gerencial: aquél dice **qué decidir ahora**, éste dice **qué pasó esta
 * semana**. Tres bloques: la foto que calcula el monitor, los avances de los ocho sistemas, y el
 * acta que escriben Bruno y Darío.
 *
 * 🔑 **Cada casilla del acta es de UNA persona.** No es una decisión estética: si el acta fuera un
 * solo texto compartido, el que guarda segundo pisaría al primero sin error y sin aviso. La firma
 * es parte de la clave de la fila (ver `sql/migrate-memo.sql`).
 */
export function Memo() {
  const [semana, setSemana] = useState<Semana>(() => semanaHoy())
  const hoy = semanaHoy()
  const { memo, campos, foto, puedeEscribir, cargando, calculando, error, guardar, sellar, cerrar } =
    useMemoSemanal(semana.id)
  const { perfil } = useSesion()
  const toast = useToast()
  const yo = perfil?.name || ''

  const estaCerrado = memo?.estado === 'cerrado'
  // "Terminada" es que la semana de hoy ya es otra. El servidor lo vuelve a comprobar con su propio
  // reloj: acá sólo decide si el botón se ve, allá decide si se puede.
  const semanaTerminada = semana.ini < hoy.ini

  const onCerrar = async () => {
    try {
      await cerrar()
      toast.ok('Memo cerrado. Los números quedaron congelados.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar.')
    }
  }

  return (
    <>
      <HeaderAcciones>
        <InfoPopover titulo="Memo semanal">
          Qué pasó esta semana (lunes a domingo). Arriba, los números que arma el monitor; abajo, el
          avance de cada sistema y el acta que escribimos. Venta y pauta se congelan cuando la semana
          termina; el capital parado y los pendientes se congelan cuando se toman y van con la fecha
          puesta.
        </InfoPopover>
        <Button variant="ghost" onClick={() => setSemana(semanaAnterior(semana))}>← Semana anterior</Button>
        <Button
          variant="ghost"
          disabled={semana.ini >= hoy.ini}
          onClick={() => setSemana(semanaSiguiente(semana))}
        >
          Semana siguiente →
        </Button>
        {semana.id !== hoy.id && <Button variant="outline" onClick={() => setSemana(hoy)}>Esta semana</Button>}
      </HeaderAcciones>

      <Card padding={4} style={{ marginBottom: space[4] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <div style={{ fontSize: font.xl, fontWeight: 700, color: color.ink }}>{etiquetaSemana(semana)}</div>
          {estaCerrado ? (
            <Badge tone="success">Cerrado</Badge>
          ) : semanaTerminada ? (
            <Badge tone="warning">Terminada, sin cerrar</Badge>
          ) : (
            <Badge tone="neutral">En curso</Badge>
          )}
          <div style={{ flex: 1 }} />
          {puedeEscribir && !estaCerrado && semanaTerminada && (
            <Button variant="solid" onClick={onCerrar}>Cerrar la semana y congelar los números</Button>
          )}
        </div>
        {estaCerrado && memo?.cerrado_por && (
          <div style={{ fontSize: font.sm, color: color.mut2, marginTop: space[2] }}>
            Cerrado por {memo.cerrado_por}{memo.cerrado_at ? ` · ${new Date(memo.cerrado_at).toLocaleDateString('es-AR')}` : ''}
          </div>
        )}
      </Card>

      {error && <Notice tone="danger" icon="⚠" style={{ marginBottom: space[4] }}>{error}</Notice>}
      {!puedeEscribir && (
        <Notice tone="neutral" style={{ marginBottom: space[4] }}>
          Podés leer el memo, pero escribir en él es de administradores.
        </Notice>
      )}

      {cargando ? (
        <Esqueleto forma="tabla" filas={6} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <BloqueFoto foto={foto} calculando={calculando} congelada={estaCerrado} />
          <BloqueSenales
            senales={memo?.senales ?? null}
            tomadas={memo?.senales_tomadas_at ?? null}
            puedeEscribir={puedeEscribir && !estaCerrado}
            onSellar={sellar}
          />
          <BloqueCampos
            titulo="Avances por sistema"
            subtitulo="Qué se movió esta semana en cada uno de los ocho sistemas."
            bloque="avance"
            entradas={SISTEMAS}
            campos={campos}
            yo={yo}
            puedeEscribir={puedeEscribir && !estaCerrado}
            guardar={guardar}
            placeholder="Qué salió, qué se arregló, qué quedó a mitad de camino…"
          />
          <BloqueCampos
            titulo="El acta"
            subtitulo="Cada uno escribe en su casilla. Se guarda solo."
            bloque="acta"
            entradas={TEMAS}
            campos={campos}
            yo={yo}
            puedeEscribir={puedeEscribir && !estaCerrado}
            guardar={guardar}
            placeholder="Escribí acá…"
          />
        </div>
      )}
    </>
  )
}

// ── La foto ──────────────────────────────────────────────────────────────────────────────────────

function BloqueFoto({ foto, calculando, congelada }: { foto: Foto | null; calculando: boolean; congelada: boolean }) {
  if (calculando) {
    return (
      <SectionCard title="La foto de la semana" subtitle="Calculando la venta de las dos semanas…">
        <Esqueleto forma="tabla" filas={4} />
      </SectionCard>
    )
  }
  if (!foto) {
    return (
      <SectionCard title="La foto de la semana">
        <EmptyState icon="📉" title="Todavía no hay números para esta semana" dashed />
      </SectionCard>
    )
  }

  const lineas = LINEAS_MEMO.filter(
    (l) => foto.venta.actual[l] || foto.venta.previa[l] || foto.pauta.actual[l] || foto.pauta.previa[l],
  )

  return (
    <SectionCard
      title="La foto de la semana"
      subtitle={
        congelada
          ? 'Congelada al cerrar la semana. No se recalcula.'
          : 'Parcial: la semana todavía no cerró, así que estos números se van a mover.'
      }
    >
      {foto.problemas.length > 0 && (
        <Notice tone="warning" icon="⚠" style={{ marginBottom: space[3] }}>
          No se pudo leer todo ({foto.problemas.join(' · ')}). Lo que se ve es el resto — no es cero.
        </Notice>
      )}

      <TablaVenta foto={foto} lineas={lineas} />
      <div style={{ height: space[5] }} />
      <TablaCanal foto={foto} />
      <div style={{ height: space[5] }} />
      <TablaClavados foto={foto} />
      <div style={{ height: space[5] }} />
      <TablaPauta foto={foto} lineas={lineas} />

      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[3], lineHeight: 1.6 }}>
        Stunned es una línea de Zattia (los SKU que empiezan con <code>STU</code>), no una marca
        aparte. Una venta que mezcla las dos cuenta como un ticket en cada una: la mercadería y las
        unidades sí se reparten bien.
        <br />
        <strong>«Mercadería» no es «Facturado»:</strong> la tabla por línea no lleva el descuento ni
        el envío, porque son de la venta entera y una venta mixta no se puede partir. La tabla por
        canal sí los lleva —ahí cada venta tiene un solo canal— y es la que coincide con «Día a día»
        de Ventas mensuales.
      </div>
    </SectionCard>
  )
}

/** "+12,4%" / "—" cuando la semana anterior fue cero: de cero a algo no es "subió 100%". */
function Variacion({ actual, previo }: { actual: number; previo: number }) {
  const d = delta(actual, previo)
  if (d.pct === null) {
    return <span style={{ color: color.mut2 }} title="La semana anterior fue cero: no hay contra qué comparar">—</span>
  }
  const sube = d.pct >= 0
  return (
    <span style={{ color: sube ? 'var(--mo-success-ink)' : 'var(--mo-danger-ink)', fontWeight: 600 }}>
      {sube ? '+' : ''}{d.pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
    </span>
  )
}

function TablaVenta({ foto, lineas }: { foto: Foto; lineas: Linea[] }) {
  return (
    <>
      <div style={{ fontSize: font.md, fontWeight: 600, color: color.ink2, marginBottom: space[2] }}>
        Venta por línea, contra la semana del {foto.previa.ini.slice(8)} al {foto.previa.fin.slice(8)}
      </div>
      <TableWrap>
        <THead>
          <Tr>
            <Th>Línea</Th>
            {/* 🔴 Dice «Mercadería» y no «Facturado» a propósito: acá el descuento y el envío NO
                están, porque son de la VENTA y una venta mixta no se puede partir entre dos líneas
                sin inventar un criterio. La tabla de canal de abajo sí los lleva, y la brecha
                medida el 24-ago-2026 fue de $1.081.927 en una semana. Con el mismo rótulo, el
                lector cita el número que le tocó. */}
            <Th align="right">Mercadería</Th>
            <Th align="right">vs. anterior</Th>
            <Th align="right">Unidades</Th>
            <Th align="right">Tickets</Th>
            <Th align="right">Ticket promedio</Th>
          </Tr>
        </THead>
        <TBody>
          {lineas.length === 0 ? (
            <Tr><Td colSpan={6}><span style={{ color: color.mut2 }}>Sin ventas en la semana.</span></Td></Tr>
          ) : (
            lineas.map((l) => {
              const a = foto.venta.actual[l]
              const p = foto.venta.previa[l]
              return (
                <Tr key={l}>
                  <Td>{LABEL_LINEA[l]}</Td>
                  <Td align="right">{formatMoney(a?.facturado ?? 0)}</Td>
                  <Td align="right"><Variacion actual={a?.facturado ?? 0} previo={p?.facturado ?? 0} /></Td>
                  <Td align="right">{(a?.unidades ?? 0).toLocaleString('es-AR')}</Td>
                  <Td align="right">{(a?.tickets ?? 0).toLocaleString('es-AR')}</Td>
                  <Td align="right">{formatMoney(ticketPromedio(a))}</Td>
                </Tr>
              )
            })
          )}
        </TBody>
      </TableWrap>
    </>
  )
}

/**
 * Mayorista contra todo lo que no es mayorista, con el resto desglosado.
 *
 * 🔴 **Una semana cerrada antes del 24-ago-2026 no tiene este corte**, y no hay verbo de reabrir el
 * memo. El renglón dice «no se midió esa semana» en vez de dibujar ceros: un cero acá se leería
 * como «no hubo venta mayorista», que es un dato falso y para siempre.
 *
 * ⚠️ Las cuentas (qué es minorista, qué queda fuera del total) salen de `resumirCanales`, no de
 * este JSX. Es la misma regla que ya mordió en `semaforoPauta`: escrita dos veces, sacarla de un
 * lado la deja viva en el otro.
 */
function TablaCanal({ foto }: { foto: Foto }) {
  const titulo = (
    <div style={{ fontSize: font.md, fontWeight: 600, color: color.ink2, marginBottom: space[2] }}>
      Venta por canal, contra la semana del {foto.previa.ini.slice(8)} al {foto.previa.fin.slice(8)}
    </div>
  )

  if (!foto.canal) {
    return (
      <>
        {titulo}
        <Notice tone="neutral">
          Esta semana se cerró antes de que el memo midiera el canal, y una semana cerrada no se
          recalcula. <strong>No se midió</strong> — no es cero.
        </Notice>
      </>
    )
  }

  const r = resumirCanales(foto.canal.actual)
  const prev = resumirCanales(foto.canal.previa)
  const nombres = foto.canal.nombres || {}
  const parte = (v: number) => (r.total.facturado > 0 ? (v / r.total.facturado) * 100 : null)

  return (
    <>
      {titulo}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
        <TarjetaCanal titulo="Mayorista" v={r.mayorista} previo={prev.mayorista.facturado} parte={parte(r.mayorista.facturado)} />
        <TarjetaCanal titulo="Minorista" v={r.minorista} previo={prev.minorista.facturado} parte={parte(r.minorista.facturado)}
          detalle="Local + Online + Otros canales" />
      </div>

      <TableWrap>
        <THead>
          <Tr>
            <Th>Canal</Th>
            <Th align="right">Facturado</Th>
            <Th align="right">vs. anterior</Th>
            <Th align="right">Unidades</Th>
            <Th align="right">Tickets</Th>
            <Th align="right">Ticket promedio</Th>
          </Tr>
        </THead>
        <TBody>
          {r.desglose.map(({ canal, venta }) => (
            <Tr key={canal}>
              <Td>
                {ETIQUETA_CANAL[canal as Canal] || canal}
                {/* ⚠️ «Otros canales» es una bolsa: sin los nombres crudos nadie puede preguntar
                    qué cayó adentro, y hoy adentro está Mercadolibre. */}
                {nombres[canal]?.length ? (
                  <div style={{ fontSize: font.xs, color: color.mut2 }}>{nombres[canal].join(' · ')}</div>
                ) : null}
              </Td>
              <Td align="right">{formatMoney(venta.facturado)}</Td>
              <Td align="right">
                <Variacion actual={venta.facturado} previo={foto.canal!.previa[canal]?.facturado ?? 0} />
              </Td>
              <Td align="right">{venta.unidades.toLocaleString('es-AR')}</Td>
              <Td align="right">{venta.tickets.toLocaleString('es-AR')}</Td>
              <Td align="right">{formatMoney(ticketPromedio(venta))}</Td>
            </Tr>
          ))}
          <Tr>
            <Td><strong>Total</strong></Td>
            <Td align="right"><strong>{formatMoney(r.total.facturado)}</strong></Td>
            <Td align="right"><Variacion actual={r.total.facturado} previo={prev.total.facturado} /></Td>
            <Td align="right"><strong>{r.total.unidades.toLocaleString('es-AR')}</strong></Td>
            <Td align="right"><strong>{r.total.tickets.toLocaleString('es-AR')}</strong></Td>
            <Td align="right"><strong>{formatMoney(ticketPromedio(r.total))}</strong></Td>
          </Tr>
        </TBody>
      </TableWrap>

      {/* 🔴 Técnica se muestra SIEMPRE, también en cero: adentro cae el canal vacío, así que el día
          que Gestión Nube deje de mandar `channel` todas las ventas aparecen acá en vez de
          evaporarse. Un renglón que sólo se dibuja cuando tiene número no puede avisar de nada. */}
      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[3], lineHeight: 1.6 }}>
        <strong>Fuera del total:</strong> {ETIQUETA_CANAL.tecnica} — {formatMoney(r.tecnica.facturado)} en{' '}
        {r.tecnica.tickets.toLocaleString('es-AR')} movimiento(s)
        {nombres.tecnica?.length ? ` (${nombres.tecnica.join(' · ')})` : ''}. No son ventas: las crea el
        monitor para descontar stock (sesión de fotos, fallas y canjes).
        <br />
        Acá los <strong>tickets suman</strong> —una venta tiene un solo canal—, al revés que en la
        tabla por línea de arriba, donde una venta mixta cuenta un ticket en cada una.
      </div>
    </>
  )
}

function TarjetaCanal({
  titulo, v, previo, parte, detalle,
}: {
  titulo: string
  v: VentaLinea
  previo: number
  parte: number | null
  detalle?: string
}) {
  return (
    <Card padding={3} style={{ flex: '1 1 220px', minWidth: 220 }}>
      <div style={{ fontSize: font.sm, color: color.mut2 }}>{titulo}</div>
      <div style={{ fontSize: font.xl, fontWeight: 700, color: color.ink }}>{formatMoney(v.facturado)}</div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[1] }}>
        <Variacion actual={v.facturado} previo={previo} />
        {parte === null ? null : ` · ${parte.toLocaleString('es-AR', { maximumFractionDigits: 1 })}% del total`}
        {' · '}{v.tickets.toLocaleString('es-AR')} tickets
      </div>
      {detalle && <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[1] }}>{detalle}</div>}
    </Card>
  )
}

/**
 * Recupero de los clavados: cuánta plata vuelve de lo que ya se remarcó.
 *
 * 🔴 **Un clavado agotado sigue en la tabla y con toda su plata.** Es el que mejor salió, y medirlo
 * por su estado de hoy lo borraría justo del informe que existe para mostrarlo. La plata sale de la
 * venta de la semana, no de si hoy queda stock.
 *
 * 🔴 **Sin costo NO hay porcentaje, y se dice cuántos son.** Un recupero sin denominador no dice si
 * vamos bien o mal, y un costo 0 lo haría dar 100 %. Hoy en BDI son los 450 productos.
 */
function TablaClavados({ foto }: { foto: Foto }) {
  const titulo = (
    <div style={{ fontSize: font.md, fontWeight: 600, color: color.ink2, marginBottom: space[2] }}>
      Recupero de los clavados
    </div>
  )

  if (!foto.clavados) {
    return (
      <>
        {titulo}
        <Notice tone="neutral">
          Esta semana se cerró antes de que el memo midiera los clavados, y una semana cerrada no se
          recalcula. <strong>No se midió</strong> — no es cero.
        </Notice>
      </>
    )
  }

  const { renglones } = foto.clavados
  if (!renglones.length) {
    return (
      <>
        {titulo}
        <EmptyState
          icon="🏷️"
          title="Todavía no hay ningún producto marcado como clavado"
          hint="Se marcan desde la fila del producto, en Productos: es donde se mira uno para decidir bajarle el precio."
          dashed
        />
      </>
    )
  }

  // ⛔ El resumen se recalcula del núcleo y no se lee del jsonb: una semana cerrada vieja podría
  // traer un resumen con otra forma, y la regla de qué entra al total vive en un solo lugar.
  const r = resumirClav(renglones)
  const mesIni = renglones.find((x) => x.mesIni)?.mesIni

  return (
    <>
      {titulo}
      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
        <Card padding={3} style={{ flex: '1 1 220px', minWidth: 220 }}>
          <div style={{ fontSize: font.sm, color: color.mut2 }}>Recuperado esta semana</div>
          <div style={{ fontSize: font.xl, fontWeight: 700, color: color.ink }}>{formatMoney(r.recuperado)}</div>
          <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[1] }}>
            {r.productos} producto(s) marcado(s) · {r.agotados} ya agotado(s)
          </div>
        </Card>
        <Card padding={3} style={{ flex: '1 1 220px', minWidth: 220 }}>
          <div style={{ fontSize: font.sm, color: color.mut2 }}>Capital que sigue parado</div>
          {/* 🔴 Con NINGUNO medible, «$0» diría que ya no queda nada parado — que es lo contrario de
              lo que pasa. Es el mismo cero que afirma del porcentaje, y se calla igual. */}
          <div style={{ fontSize: font.xl, fontWeight: 700, color: r.sinCosto === r.productos ? color.mut2 : color.ink }}>
            {r.sinCosto === r.productos ? 'no medible' : formatMoney(r.parado)}
          </div>
          <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[1] }}>
            {r.pct === null
              ? 'sin costo no hay porcentaje'
              : `${r.pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}% recuperado`}
            {r.sinCosto > 0 && ` · ${r.sinCosto} sin costo, afuera de esta cuenta`}
          </div>
        </Card>
      </div>

      {/* 🔴 El aviso va SIEMPRE que haya alguno sin costo, y no escondido en un tooltip: el total de
          al lado se lee como si cubriera todo, y hoy en BDI no cubre nada. */}
      {r.sinCosto > 0 && (
        <Notice tone="warning" icon="⚠" style={{ marginBottom: space[3] }}>
          {r.sinCosto} de {r.productos} no tienen costo cargado en el espejo, así que su capital
          parado <strong>no se puede medir</strong> y queda afuera del total y del porcentaje. No es
          cero: es que no se sabe.
        </Notice>
      )}

      <TableWrap>
        <THead>
          <Tr>
            <Th>Producto</Th>
            <Th align="right">Recuperado (semana)</Th>
            <Th align="right">En el mes</Th>
            <Th align="right">Unidades</Th>
            <Th align="right">Stock</Th>
            <Th align="right">Sigue parado</Th>
          </Tr>
        </THead>
        <TBody>
          {renglones.map((c) => (
            <Tr key={`${c.store}:${c.producto_id}:${c.marcado_en}`}>
              <Td>
                {c.nombre || `#${c.producto_id}`}
                <div style={{ fontSize: font.xs, color: color.mut2 }}>
                  {c.sku ? `${c.sku} · ` : ''}{c.store === 'bdi' ? 'BDI' : 'Zattia'}
                  {c.agotado ? ' · agotado' : ''}
                </div>
              </Td>
              <Td align="right">{formatMoney(c.recuperado)}</Td>
              <Td align="right">{formatMoney(c.mes ?? 0)}</Td>
              <Td align="right">{c.unidades.toLocaleString('es-AR')}</Td>
              <Td align="right">{c.stock.toLocaleString('es-AR')}</Td>
              <Td align="right">
                {c.parado === null ? (
                  <span style={{ color: color.mut2 }} title="El espejo no tiene el costo de este producto: sin costo, el capital parado no se puede calcular. Un cero acá diría que ya se recuperó todo.">
                    sin costo
                  </span>
                ) : (
                  formatMoney(c.parado)
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </TableWrap>

      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[3], lineHeight: 1.6 }}>
        Un clavado <strong>sigue siendo clavado aunque venda</strong>: ya se le bajó el precio, y lo
        que se mide es cuánta plata vuelve. El que se agotó igual cuenta acá con todo lo que facturó
        esta semana — el número sale de la venta, no de cómo está hoy.
        <br />
        Es <strong>mercadería</strong>: el descuento y el envío son de la venta entera y no se pueden
        repartir entre los productos de un ticket.
        {mesIni && <> El mes va desde el {mesIni.slice(8)} de {mesIni.slice(5, 7)}.</>}
      </div>
    </>
  )
}

const TONO_SEMAFORO: Record<string, string> = {
  verde: 'var(--mo-success-ink)',
  amarillo: 'var(--mo-warning-ink)',
  rojo: 'var(--mo-danger-ink)',
}

function TablaPauta({ foto, lineas }: { foto: Foto; lineas: Linea[] }) {
  return (
    <>
      <div style={{ fontSize: font.md, fontWeight: 600, color: color.ink2, marginBottom: space[2] }}>
        Pauta de Meta
      </div>
      <TableWrap>
        <THead>
          <Tr>
            <Th>Línea</Th>
            <Th align="right">Gasto</Th>
            <Th align="right">vs. anterior</Th>
            <Th align="right">Compras</Th>
            <Th align="right">Costo por compra</Th>
            <Th align="right">Techo</Th>
          </Tr>
        </THead>
        <TBody>
          {lineas.length === 0 ? (
            <Tr><Td colSpan={6}><span style={{ color: color.mut2 }}>Sin pauta en la semana.</span></Td></Tr>
          ) : (
            lineas.map((l) => {
              const a = foto.pauta.actual[l]
              const p = foto.pauta.previa[l]
              const techo = foto.techos[l]
              const cpc = costoPorCompra(a)
              // 🔴 Acá había un `mudo = l === 'stunned'`, y tapaba un número que existe: la semana
              // del 10 al 16 Stunned trajo 1 compra. Lo que hace mudo al renglón es **no tener
              // compras**, no llamarse de una forma. El semáforo sale del núcleo y no se recalcula
              // acá: la regla ya estaba escrita y probada en `semaforoPauta`, y tenerla dos veces
              // es lo que dejó la excepción viva en un lado después de sacarla del otro.
              const sinCompras = (a?.compras ?? 0) === 0
              const sem = semaforoPauta(a, techo)
              return (
                <Tr key={l}>
                  <Td>{LABEL_LINEA[l]}</Td>
                  <Td align="right">{formatMoney(a?.gasto ?? 0)}</Td>
                  <Td align="right"><Variacion actual={a?.gasto ?? 0} previo={p?.gasto ?? 0} /></Td>
                  <Td align="right">{(a?.compras ?? 0).toLocaleString('es-AR')}</Td>
                  <Td align="right">
                    {sinCompras ? (
                      <span style={{ color: color.mut2 }} title="No hubo compras registradas en la semana: dividir el gasto por cero no da un número, y un cero acá se leería como «salió gratis»">
                        sin compras
                      </span>
                    ) : (
                      <span style={{ color: TONO_SEMAFORO[sem] ?? undefined, fontWeight: TONO_SEMAFORO[sem] ? 600 : 400 }}>
                        {formatMoney(cpc)}
                      </span>
                    )}
                  </Td>
                  <Td align="right">{formatMoney(techo ?? null)}</Td>
                </Tr>
              )
            })
          )}
        </TBody>
      </TableWrap>
    </>
  )
}

// ── Las señales ──────────────────────────────────────────────────────────────────────────────────

/**
 * Capital parado y pendientes: las señales "al momento".
 *
 * Se toman con un botón y no solas al abrir, por dos motivos que apuntan al mismo lado. El primero
 * es honesto: estas señales se mueven todos los días, así que lo único que las hace legibles seis
 * meses después es la fecha en que se tomaron — y un botón deja claro que ESE es el momento. El
 * segundo es de costo: calcularlas baja el ETL de las dos marcas, y hacerlo cada vez que alguien
 * relee un memo de marzo sería pagar el payload entero para no cambiar ni un número.
 */
function BloqueSenales({
  senales, tomadas, puedeEscribir, onSellar,
}: {
  senales: Senales | null
  tomadas: string | null
  puedeEscribir: boolean
  onSellar: (s: Senales) => Promise<void>
}) {
  const [tomando, setTomando] = useState(false)

  if (senales) {
    return (
      <SectionCard
        title="Capital parado y pendientes"
        subtitle={tomadas ? `Foto tomada el ${new Date(tomadas).toLocaleDateString('es-AR')}. No se actualiza.` : undefined}
      >
        <div style={{ display: 'flex', gap: space[3], marginBottom: space[3], flexWrap: 'wrap' }}>
          <Badge tone="danger">{senales.conteo.critico} crítico(s)</Badge>
          <Badge tone="warning">{senales.conteo.atencion} de atención</Badge>
          <Badge tone="success">{senales.conteo.oportunidad} oportunidad(es)</Badge>
        </div>
        {senales.items.length === 0 ? (
          <EmptyState icon="✅" title="No había señales abiertas cuando se tomó la foto" dashed />
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: space[1] }}>
            {senales.items.map((i, n) => (
              <li key={n} style={{ fontSize: font.base, color: color.ink2 }}>
                <span style={{ color: color.mut2, textTransform: 'uppercase', fontSize: font.xs }}>{i.marca}</span>{' '}
                {i.titulo}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Capital parado y pendientes"
      subtitle="Estas señales se mueven todos los días, así que se guardan con la fecha en que se toman."
    >
      {tomando ? (
        <TomarSenales onListo={onSellar} onError={() => setTomando(false)} />
      ) : puedeEscribir ? (
        <Button variant="outline" onClick={() => setTomando(true)}>Tomar la foto de hoy</Button>
      ) : (
        <EmptyState icon="📷" title="Todavía no se tomó la foto de esta semana" dashed />
      )}
    </SectionCard>
  )
}

/**
 * Monta el hook del panel Gerencial sólo cuando se aprieta el botón: es la forma de hacer perezosa
 * una carga que vive en un hook. Cuando termina, sella y se desmonta.
 */
function TomarSenales({ onListo, onError }: { onListo: (s: Senales) => Promise<void>; onError: () => void }) {
  const { accionables, cargando, errores } = useGerencial()
  const mandado = useRef(false)

  useEffect(() => {
    if (cargando || mandado.current) return
    mandado.current = true
    // Una semana sin señales también es una foto válida: se sella igual, con la lista vacía.
    onListo(resumirSenales(accionables)).catch(onError)
  }, [cargando, accionables, onListo, onError])

  return (
    <div>
      <div style={{ fontSize: font.sm, color: color.mut2, marginBottom: space[2] }}>
        Leyendo el stock y los pendientes de las dos marcas…
      </div>
      <Esqueleto forma="tabla" filas={3} />
      {errores.length > 0 && (
        <Notice tone="warning" icon="⚠" style={{ marginTop: space[3] }}>
          Algunas fuentes no cargaron ({errores.join(' · ')}). La foto va a guardar el resto.
        </Notice>
      )}
    </div>
  )
}

// ── Los campos escritos ──────────────────────────────────────────────────────────────────────────

function BloqueCampos({
  titulo, subtitulo, bloque, entradas, campos, yo, puedeEscribir, guardar, placeholder,
}: {
  titulo: string
  subtitulo: string
  bloque: Bloque
  entradas: { clave: string; label: string }[]
  campos: Campo[]
  yo: string
  puedeEscribir: boolean
  guardar: (b: Bloque, clave: string, texto: string) => Promise<void>
  placeholder: string
}) {
  return (
    <SectionCard title={titulo} subtitle={subtitulo}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
        {entradas.map((e) => {
          const delTema = campos.filter((c) => c.bloque === bloque && c.clave === e.clave)
          const mio = delTema.find((c) => c.autor === yo)
          const ajenos = delTema.filter((c) => c.autor !== yo && c.texto.trim())
          return (
            <div key={e.clave}>
              <div style={{ fontSize: font.md, fontWeight: 600, color: color.ink2, marginBottom: space[2] }}>
                {e.label}
              </div>

              {ajenos.map((c) => (
                <div
                  key={c.autor}
                  style={{
                    background: color.bg2, border: `1px solid ${color.line}`, borderRadius: radius.lg,
                    padding: space[3], marginBottom: space[2],
                  }}
                >
                  <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: space[1] }}>{c.autor}</div>
                  <div style={{ fontSize: font.base, color: color.ink2, whiteSpace: 'pre-wrap' }}>{c.texto}</div>
                </div>
              ))}

              {puedeEscribir ? (
                <CajaPropia
                  inicial={mio?.texto ?? ''}
                  placeholder={placeholder}
                  guardar={(t) => guardar(bloque, e.clave, t)}
                />
              ) : mio?.texto ? (
                <div style={{ fontSize: font.base, color: color.ink2, whiteSpace: 'pre-wrap' }}>{mio.texto}</div>
              ) : ajenos.length === 0 ? (
                <div style={{ fontSize: font.sm, color: color.mut2 }}>Sin escribir.</div>
              ) : null}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

const ROTULO_ESTADO = { limpio: '', guardando: 'Guardando…', guardado: 'Guardado', error: 'No se pudo guardar' }

function CajaPropia({
  inicial, placeholder, guardar,
}: {
  inicial: string
  placeholder: string
  guardar: (t: string) => Promise<void>
}) {
  const { texto, estado, alEscribir, alSalir } = useAutoguardado(guardar, inicial)
  return (
    <div>
      <textarea
        className="mo-input mo-input--multi"
        rows={3}
        value={texto}
        placeholder={placeholder}
        onChange={(ev) => alEscribir(ev.target.value)}
        onBlur={alSalir}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: font.base }}
      />
      <div
        style={{
          fontSize: font.xs, minHeight: 14, textAlign: 'right',
          color: estado === 'error' ? 'var(--mo-danger-ink)' : color.mut2,
        }}
      >
        {ROTULO_ESTADO[estado]}
      </div>
    </div>
  )
}
