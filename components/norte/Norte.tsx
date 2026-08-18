'use client'

import { useMemo, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { useNorte } from './useNorte'
import { EditorCondiciones } from './EditorCondiciones'
import { EditorMeta } from './EditorMeta'
import { TablaMetas } from './TablaMetas'
import { PylLinea } from './PylLinea'
import {
  avanceDeMeta,
  calendarioDePagos,
  coberturaDePagos,
  contribucionDiaria,
  diaDeAgotamiento,
  entradaDiaria,
  estadoDeCompra,
  pagosEstimados,
  medirMeta,
  proyectarStock,
  ritmoDeSalida,
  salidaDiaria,
  sinCondiciones,
  veredicto,
} from '@/lib/norte/core'
import { porUnidad, ventanaUltimos } from '@/lib/norte/contribucion'
import type { Contribucion, EstadoVeredicto, ImportacionProyectada, Peldano } from '@/lib/norte/tipos'
import {
  Badge,
  Button,
  DatosGate,
  EmptyState,
  Notice,
  SectionCard,
  TBody,
  THead,
  TableWrap,
  Td,
  Th,
  Tr,
  color,
  font,
  space,
  weight,
} from '@/components/ui'

/**
 * **Norte** (área Dirección): hacia dónde vamos y si llegamos.
 *
 * Es el tercer tiempo de Dirección. Gerencial dice qué decidir *hoy*; el Memo semanal dice qué
 * *pasó*; Norte cruza el ritmo de venta real con las importaciones que vienen y contesta una sola
 * pregunta, arriba de todo: **¿el stock que entra sale a tiempo para pagarlo?**
 *
 * ## De dónde sale cada mitad, que no es la misma
 *
 * **Las unidades salen del ETL** (el payload cacheado en el navegador) y **la plata del servidor**
 * (`api/_norte.js`). No es una inconsistencia: el ETL trae cantidades y no precios —`FilaDetalle`
 * es `sale_id · product_id · quantity`— y además la regla del IVA vive en el dashboard. Las dos
 * mitades usan **la misma ventana** (`ventanaUltimos`, últimos 30 días con venta) y la pantalla
 * avisa si por alguna razón no coinciden: multiplicar el ritmo de una ventana por la contribución
 * de otra da un número que no existe.
 *
 * 🔴 **Lo que la contribución NO descuenta hoy**: las comisiones de cobro están en 0% en el
 * dashboard —nadie las cargó— y la cascada no resta IIBB ni impuesto al cheque, que el modelo de
 * rentabilidad de Meta Ads sí resta. La pantalla lo dice en vez de dejar creer que es el número
 * final.
 */
export function Norte() {
  const { marca } = useSesion()
  const { datos, error: errorDatos, progreso, origen } = useDatosMonitor()
  const { importaciones, metas, contribucion, pyl, admin, cargando, error, recargar } = useNorte(marca)
  const [editando, setEditando] = useState<string | null>(null)
  /** `{nueva:true}` o `{key}`: qué meta está abierta en el editor. `null` = ninguna. */
  const [metaEditando, setMetaEditando] = useState<{ nueva?: boolean; key?: string } | null>(null)

  const hoy = new Date().toISOString().slice(0, 10)

  /**
   * El ritmo de salida de los últimos 30 días.
   *
   * ⚠️ La ventana termina en el **último día con venta**, no en `hoy`: el día en curso está a medio
   * hacer y meterlo baja el promedio sin que haya pasado nada. Misma trampa que ya está
   * documentada en `scripts/medir-economia-bdi.mjs`.
   */
  /** La ventana del ETL. Es la misma regla que usa el servidor para la contribución. */
  const ventanaEtl = useMemo(
    () => (datos ? ventanaUltimos(datos.ventas.map((v) => v.date_sale), 30) : null),
    [datos],
  )

  /** Lo que deja cada unidad de cada canal. Vacío mientras no esté: `ritmoDeSalida` pone 0. */
  const dejaPorUnidad = useMemo(() => porUnidad(contribucion.canales), [contribucion])

  const ritmo = useMemo(() => {
    if (!datos || !ventanaEtl) return []
    const { desde, hasta } = ventanaEtl

    const unidadesPorVenta = new Map<string, number>()
    for (const d of datos.detalles) {
      const k = String(d.sale_id)
      unidadesPorVenta.set(k, (unidadesPorVenta.get(k) || 0) + (Number(d.quantity) || 0))
    }
    const filas = datos.ventas
      .filter((v) => v.date_sale && v.date_sale.slice(0, 10) >= desde && v.date_sale.slice(0, 10) <= hasta)
      .map((v) => ({ canal: v.channel, unidades: unidadesPorVenta.get(String(v.id)) || 0 }))
    return ritmoDeSalida(filas, 30, dejaPorUnidad)
  }, [datos, ventanaEtl, dejaPorUnidad])

  const salen = salidaDiaria(ritmo)
  const dejaPorDia = contribucionDiaria(ritmo)

  /**
   * 🔴 Las dos mitades tienen que estar mirando los mismos días. El caché del ETL vive en
   * IndexedDB y puede quedar atrás; multiplicar unidades de una ventana por la plata de otra da un
   * número plausible y falso, y nada falla. Se compara y se dice.
   */
  const ventanasDistintas = Boolean(
    ventanaEtl && contribucion.ventana && ventanaEtl.hasta !== contribucion.ventana.hasta,
  )

  /** De hoy (o de la primera llegada, si ya pasó) hasta la última importación con fecha. */
  const ventana = useMemo(() => {
    const conFecha = importaciones.filter((i) => !i.arribada && i.llega)
    if (!conFecha.length) return null
    const primera = conFecha[0].llega
    return { desde: hoy < primera ? hoy : primera, hasta: conFecha[conFecha.length - 1].llega }
  }, [importaciones, hoy])

  const entran = ventana ? entradaDiaria(importaciones, ventana.desde, ventana.hasta) : 0
  const v = veredicto(entran, salen)

  const proyeccion = useMemo(() => {
    if (!ventana || !salen) return []
    return proyectarStock({ stockInicial: 0, desde: ventana.desde, hasta: ventana.hasta, importaciones, salidaDia: salen })
  }, [ventana, salen, importaciones])

  /**
   * 🔑 **`hayPlata` no se deduce de que el número sea cero.** Cuando el dashboard no contesta,
   * `ritmoDeSalida` deja `contribUnidad` en 0 para lo que no sabe: medir igual daría «$0/día», que
   * afirma «no deja nada» en vez de «no se pudo medir».
   */
  const hayPlata = Boolean(contribucion.disponible && contribucion.canales?.length)

  /** El avance de cada meta activa, medido contra el mismo `ritmo` que se muestra arriba. */
  const avances = useMemo(
    () =>
      metas
        .filter((m) => m.activa)
        .map((m) => avanceDeMeta(m, medirMeta(m, { ritmo, hayPlata }), hoy)),
    [metas, ritmo, hayPlata, hoy],
  )

  /**
   * Las apagadas, que **se listan igual** —atenuadas, al final y sin medir—.
   *
   * 🔴 Antes la lista era `metas.filter((m) => m.activa)` y no había ninguna otra: destildar
   * «Activa» sacaba la meta de la pantalla **sin verbo de vuelta**. No se podía reactivar ni
   * borrar, y volver a crearla con el mismo nombre tampoco la recuperaba —la clave se desambigua y
   * nace una fila nueva, con la vieja al lado, muda—; el único camino era `psql`. La etiqueta del
   * tilde ya decía «no se pierden», y era cierto del dato y falso de la pantalla.
   *
   * 🔑 **No se miden.** El medido va al lado de un objetivo que alguien está persiguiendo; ponerle
   * un número a una meta apagada la devolvería a la conversación, que es justo lo que apagarla
   * quiso evitar. Lo que sí va es el objetivo: es lo que permite reconocerla, y dos metas pueden
   * llamarse igual.
   */
  const apagadas = useMemo(() => metas.filter((m) => !m.activa), [metas])

  const pagos = useMemo(() => calendarioDePagos(importaciones), [importaciones])
  /** Cada pago con cuánta contribución habrá acumulado el negocio para esa fecha. */
  const cubiertos = useMemo(() => coberturaDePagos(pagos, hoy, dejaPorDia), [pagos, hoy, dejaPorDia])
  /**
   * Lo que todavía no es deuda: mismas cuotas, contadas desde la llegada estimada o desde la fecha
   * de ingreso. Va en su propia tabla y no mezclado con los pagos — un pronóstico puesto al lado de
   * la deuda se lee como deuda.
   */
  const estimados = useMemo(() => pagosEstimados(importaciones), [importaciones])
  const faltan = useMemo(() => sinCondiciones(importaciones.filter((i) => !i.arribada)), [importaciones])
  const enEdicion = importaciones.find((i) => i.id === editando) || null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {error && <Notice tone="warning">{error}</Notice>}

      <SectionCard title="¿Sale a tiempo lo que entra?">
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <PillVeredicto estado={v.estado} />
          <div style={{ fontSize: font['2xl'], fontWeight: weight.semibold, lineHeight: 1.25 }}>{v.titular}</div>
          {v.estado !== 'sin-datos' && ventana && (
            <div style={{ color: color.mut, fontSize: font.sm }}>
              El ritmo sale de los últimos 30 días con venta; lo que entra, de las importaciones cargadas hasta el{' '}
              {ventana.hasta}.
            </div>
          )}
        </div>
      </SectionCard>

      <DatosGate datos={datos} error={errorDatos} progreso={progreso} origen={origen}>
        {() => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <SectionCard title="Por dónde sale" subtitle="Unidades, compras y plata por día, últimos 30 días con venta">
            {ventanasDistintas && (
              <Notice tone="warning">
                Las unidades están medidas hasta el {ventanaEtl!.hasta} y la plata hasta el{' '}
                {contribucion.ventana!.hasta}: no son los mismos días. Recargá para emparejarlas — multiplicadas dan un
                número que no existe.
              </Notice>
            )}
            {ritmo.length === 0 ? (
              <EmptyState title="Sin ventas en la ventana" hint="No hay con qué medir el ritmo." />
            ) : (
              <>
                <TableWrap>
                  <THead>
                    <Tr>
                      <Th>Canal</Th>
                      <Th align="right">Unidades por día</Th>
                      {/* Compras por día: NO es la columna de al lado dividida por nada. Una compra
                          lleva varias fundas, y cuánto varía es justamente lo que separa un canal
                          del otro. Va acá para que una meta de compras tenga contra qué cotejarse. */}
                      <Th align="right">Compras por día</Th>
                      <Th align="right">Parte de la salida</Th>
                      <Th align="right">Deja por unidad</Th>
                      <Th align="right">Deja por día</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {ritmo.map((r) => (
                      <Tr key={r.canal}>
                        <Td>{r.canal}</Td>
                        <Td align="right" mono>
                          {r.unidadesDia.toFixed(1)}
                        </Td>
                        <Td align="right" mono>
                          {r.ventasDia.toFixed(1)}
                        </Td>
                        <Td align="right" mono>
                          {salen ? Math.round((r.unidadesDia / salen) * 100) : 0}%
                        </Td>
                        {/* Sin dato va una raya, NO un $0: «no deja nada» y «no lo sabemos» son
                            cosas distintas y la de al lado es una decisión de plata. */}
                        <Td align="right" mono>
                          {dejaPorUnidad[r.canal] === undefined ? (
                            <span style={{ color: color.mut2 }}>—</span>
                          ) : (
                            `$${Math.round(r.contribUnidad).toLocaleString('es-AR')}`
                          )}
                        </Td>
                        <Td align="right" mono>
                          {dejaPorUnidad[r.canal] === undefined ? (
                            <span style={{ color: color.mut2 }}>—</span>
                          ) : (
                            `$${Math.round(r.contribDia).toLocaleString('es-AR')}`
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </TableWrap>
                {dejaPorDia > 0 && (
                  <div style={{ marginTop: space[3], fontSize: font.md }}>
                    Todo junto, el negocio deja <strong>${Math.round(dejaPorDia).toLocaleString('es-AR')} por día</strong>{' '}
                    de contribución.
                  </div>
                )}
              </>
            )}
            <NotaContribucion contribucion={contribucion} />
          </SectionCard>

          {/* El otro corte de la misma plata: por canal se decide POR DÓNDE sacar el stock; acá,
              CUÁNTO deja cada negocio. Los dos salen del mismo viaje y de la misma ventana. */}
          <PylLinea pyl={pyl} />

          <SectionCard title="Lo que viene" subtitle="Se cargan en Compras → Ingresos proyectados; acá se les agrega la economía">
            {cargando ? (
              <div style={{ color: color.mut }}>Cargando importaciones…</div>
            ) : importaciones.length === 0 ? (
              <EmptyState title="No hay importaciones cargadas" hint="Cargalas en Compras → Ingresos proyectados." />
            ) : (
              <>
                <TableWrap>
                  <THead>
                    <Tr>
                      <Th>Importación</Th>
                      <Th>Llega</Th>
                      <Th align="right">Unidades</Th>
                      <Th>Economía</Th>
                      {admin && <Th />}
                    </Tr>
                  </THead>
                  <TBody>
                    {importaciones.map((i) => (
                      <Tr key={i.id}>
                        <Td>
                          {i.desc} {i.arribada && <Badge tone="neutral" subtle>arribada</Badge>}
                        </Td>
                        <Td mono>{i.llega || <span style={{ color: color.mut2 }}>sin fecha</span>}</Td>
                        <Td align="right" mono>
                          {i.unidades.toLocaleString('es-AR')}
                        </Td>
                        <Td>
                          <Economia imp={i} />
                        </Td>
                        {admin && (
                          <Td>
                            <button
                              type="button"
                              onClick={() => setEditando(editando === i.id ? null : i.id)}
                              style={{ background: 'none', border: 0, color: color.brand, cursor: 'pointer', padding: 0 }}
                            >
                              {editando === i.id ? 'cerrar' : 'editar'}
                            </button>
                          </Td>
                        )}
                      </Tr>
                    ))}
                  </TBody>
                </TableWrap>

                {enEdicion && (
                  <EditorCondiciones
                    marca={marca}
                    importacion={enEdicion}
                    onListo={() => {
                      setEditando(null)
                      recargar()
                    }}
                  />
                )}

                {proyeccion.length > 0 && (
                  <div style={{ marginTop: space[3], fontSize: font.md }}>
                    {diaDeAgotamiento(proyeccion) ? (
                      <>
                        Al ritmo de hoy el depósito queda vacío el <strong>{diaDeAgotamiento(proyeccion)}</strong>.
                      </>
                    ) : (
                      <>
                        Al {ventana!.hasta} quedarían{' '}
                        <strong>{Math.round(proyeccion[proyeccion.length - 1].stock).toLocaleString('es-AR')}</strong>{' '}
                        unidades sin vender.
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </SectionCard>

          <SectionCard title="Lo que hay que pagar">
            {faltan.length > 0 && (
              <Notice tone="warning">
                {faltan.length === 1 ? '1 importación no se puede proyectar' : `${faltan.length} importaciones no se pueden proyectar`}:
                preferimos el renglón vacío antes que inventarles un costo.
                <ul style={{ margin: `${space[2]} 0 0`, paddingLeft: 18 }}>
                  {faltan.map(({ imp, falta }) => (
                    <li key={imp.id}>
                      <strong>{imp.desc}</strong> — falta {falta}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
            {/* La cotización va arriba de las DOS tablas: pesa igual sobre la deuda y sobre el
                estimativo, y dejarla adentro de la primera la escondía justo cuando no hay ninguna
                compra firme todavía — que es el caso de hoy. */}
            {pagos.length === 0 ? (
              <EmptyState
                title="Sin vencimientos firmes"
                hint={
                  estimados.length > 0
                    ? 'Ninguna compra tiene todavía el ingreso confirmado y su factura. Abajo está lo estimado.'
                    : 'Cargá el costo de cada material y las cuotas de cada importación.'
                }
              />
            ) : (
              <>
                <TableWrap>
                  <THead>
                    <Tr>
                      <Th>Fecha</Th>
                      <Th>Qué</Th>
                      <Th align="right">Monto</Th>
                      <Th align="right">En pesos</Th>
                      {dejaPorDia > 0 && <Th align="right">Cubierto</Th>}
                    </Tr>
                  </THead>
                  <TBody>
                    {cubiertos.map(({ pago: p, cobertura }, i) => (
                      <Tr key={`${p.importacionId}-${i}`}>
                        <Td mono strong={p.fecha >= hoy}>
                          {p.fecha}
                        </Td>
                        <Td>{p.etiqueta}</Td>
                        <Td align="right" mono>
                          {p.moneda} {Math.round(p.monto).toLocaleString('es-AR')}
                        </Td>
                        <Td align="right" mono>
                          <EnPesos monto={p.montoPesos} />
                        </Td>
                        {dejaPorDia > 0 && (
                          <Td align="right" mono>
                            <span style={{ color: cobertura !== null && cobertura < 1 ? color.danger : undefined }}>
                              {cobertura === null || cobertura === Infinity ? '—' : `${cobertura.toFixed(1)}×`}
                            </span>
                          </Td>
                        )}
                      </Tr>
                    ))}
                  </TBody>
                </TableWrap>
                {dejaPorDia > 0 && (
                  <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm }}>
                    «Cubierto» es la contribución acumulada hasta esa fecha contra todo lo que hay que pagar hasta ahí,
                    al ritmo de hoy. ⚠️ <strong>No es plata en la cuenta</strong>: con esa misma contribución se paga la
                    estructura. Debajo de 1× no alcanza ni en el mejor de los casos.
                  </div>
                )}
              </>
            )}

            {/* El pronóstico va DEBAJO y con su propio título: una fila estimada puesta entre las
                firmes se suma sin querer, y el total del mes pasa a incluir plata que nadie
                facturó. Cada renglón dice contra qué fecha se estimó. */}
            {estimados.length > 0 && (
              <div style={{ marginTop: space[4] }}>
                <div style={{ fontSize: font.md, fontWeight: weight.semibold }}>Todavía no es deuda: lo estimado</div>
                <div style={{ color: color.mut, fontSize: font.sm, margin: `${space[1]} 0 ${space[3]}` }}>
                  Compras con el costo de todos sus materiales cargado, pero sin factura. Los plazos se cuentan desde la
                  llegada estimada —o desde la fecha de ingreso, cuando ya está confirmada—, así que{' '}
                  <strong>esas fechas se van a mover</strong>.
                  {/* 🔴 Prometerle movimiento a TODAS es falso: una fecha pactada la escribió una
                      persona y no se mueve cuando llegue la factura. Se dice sólo si hay alguna. */}
                  {estimados.some((p) => p.pactada) && ' Las pactadas con el proveedor, no: ésas ya tienen día.'}
                </div>
                <TableWrap>
                  <THead>
                    <Tr>
                      <Th>Fecha estimada</Th>
                      <Th>Qué</Th>
                      <Th>De dónde sale la fecha</Th>
                      <Th align="right">Monto</Th>
                      <Th align="right">En pesos</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {estimados.map((p, i) => (
                      <Tr key={`est-${p.importacionId}-${i}`}>
                        <Td mono>{p.fecha}</Td>
                        <Td>{p.etiqueta}</Td>
                        {/* ⛔ `base` NO alcanza para contestar esto: existe siempre, pero cuando la
                            cuota trae fecha pactada no se usó para nada. Preguntarle sólo a `base`
                            era afirmar un cálculo que no ocurrió. */}
                        <Td>
                          {p.pactada ? (
                            <strong>pactada con el proveedor</strong>
                          ) : p.base === 'ingreso' ? (
                            'contada desde la fecha de ingreso'
                          ) : (
                            'contada desde la llegada estimada'
                          )}
                        </Td>
                        <Td align="right" mono>
                          {p.moneda} {Math.round(p.monto).toLocaleString('es-AR')}
                        </Td>
                        <Td align="right" mono>
                          <EnPesos monto={p.montoPesos} />
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </TableWrap>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Metas"
            subtitle="Un objetivo con su número al lado deja de ser una conversación"
            actions={
              admin && !metaEditando ? (
                <Button size="sm" onClick={() => setMetaEditando({ nueva: true })}>
                  Agregar meta
                </Button>
              ) : undefined
            }
          >
            {metaEditando && (
              <EditorMeta
                marca={marca}
                meta={metaEditando.nueva ? null : metas.find((m) => m.key === metaEditando.key) || null}
                usadas={metas.map((m) => m.key)}
                onListo={() => {
                  setMetaEditando(null)
                  recargar()
                }}
                onCancelar={() => setMetaEditando(null)}
              />
            )}

            <TablaMetas
              avances={avances}
              apagadas={apagadas}
              admin={admin}
              onEditar={(key) => setMetaEditando({ key })}
            />

            <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm }}>
              El medido de cada meta se calcula al abrir, contra{' '}
              {ventanaEtl ? `la venta del ${ventanaEtl.desde} al ${ventanaEtl.hasta}` : 'la venta de los últimos 30 días'}
              : no se guarda en ningún lado. ⚠️ Las metas de contribución necesitan el dashboard conectado — sin él dicen
              por qué no se pudieron medir, en vez de mostrar cero.
              {apagadas.length > 0 &&
                ` Las apagadas van al final, en gris y sin medir: se editan igual, y ahí se vuelven a prender o se borran.`}
            </div>
          </SectionCard>
        </div>
        )}
      </DatosGate>
    </div>
  )
}

/**
 * La celda «Economía» de cada importación: **en qué peldaño está y qué le falta para subir**.
 *
 * 🔑 Un «falta cargar» pelado no dice si falta el precio de un material, las cuotas o la firma del
 * ingreso — y son tres pendientes distintos, de tres personas distintas. El motor ya redacta esa
 * frase; acá sólo se dibuja.
 */
function Economia({ imp }: { imp: ImportacionProyectada }) {
  const e = estadoDeCompra(imp)
  if (e.peldano === 'incompleta') {
    return (
      <span style={{ color: color.mut2 }}>
        falta {e.falta}
      </span>
    )
  }
  return (
    <>
      <PillPeldano peldano={e.peldano} />{' '}
      <span style={{ whiteSpace: 'nowrap' }}>
        {e.moneda} {Math.round(e.total).toLocaleString('es-AR')}
      </span>
      {e.huerfanos.length > 0 && (
        <span style={{ color: color.warning }}> · sobra un costo sin material</span>
      )}
    </>
  )
}

const PELDANOS: Record<Exclude<Peldano, 'incompleta'>, { texto: string; tono: 'neutral' | 'warning' | 'success' }> = {
  estimada: { texto: 'estimada', tono: 'neutral' },
  confirmada: { texto: 'confirmada', tono: 'warning' },
  firme: { texto: 'con factura', tono: 'success' },
}

function PillPeldano({ peldano }: { peldano: Peldano }) {
  if (peldano === 'incompleta') return null
  const p = PELDANOS[peldano]
  return (
    <Badge tone={p.tono} subtle>
      {p.texto}
    </Badge>
  )
}

/**
 * Todo lo que hay que saber para poder creerle al número de al lado.
 *
 * 🔑 **Callarse también miente.** Una contribución calculada sobre el 40% de las ventas se ve
 * exactamente igual que una calculada sobre el 100%, y la diferencia decide distinto. Por eso acá
 * va siempre: sobre cuántas ventas se midió, qué quedó afuera y por qué, y qué NO está descontado.
 */
function NotaContribucion({ contribucion }: { contribucion: Contribucion }) {
  const chico = { marginTop: space[2], color: color.mut, fontSize: font.sm }

  if (!contribucion.disponible) {
    return (
      <div style={chico}>
        <strong>Son unidades, no plata.</strong>{' '}
        {contribucion.motivo || 'La contribución por canal todavía no se pudo calcular.'}
      </div>
    )
  }

  const c = contribucion.cobertura
  if (!c) return null
  const afuera = c.sinCuenta + c.sinCosto
  const pct = c.ventas > 0 ? Math.round((c.usadas / c.ventas) * 100) : 0

  return (
    <div style={chico}>
      {afuera > 0 && (
        <div style={{ marginBottom: space[1] }}>
          🔴 Calculado sobre <strong>{c.usadas} de {c.ventas} ventas ({pct}%)</strong> de la ventana.
          {c.sinCuenta > 0 && ` ${c.sinCuenta} no tienen cuenta de cobro clasificada`}
          {c.sinCosto > 0 && ` ${c.sinCuenta > 0 ? 'y ' : ''}${c.sinCosto} no tienen costo cargado`}
          : quedan afuera en vez de asumirles el IVA o el costo, que serían 21% y todo el margen de
          diferencia.
        </div>
      )}
      {c.cuentasDesconocidas.length > 0 && (
        <div style={{ marginBottom: space[1] }}>
          El dashboard no tiene clasificadas estas cuentas de cobro:{' '}
          <strong>{c.cuentasDesconocidas.join(' · ')}</strong>. Se cargan en su pantalla de Cuentas de cobro.
        </div>
      )}
      <div>
        Es venta menos IVA, costo{c.comisionesCargadas ? ' y comisiones' : ''} — la misma cascada del dashboard.
        {!c.comisionesCargadas && ' ⚠️ Las comisiones de cobro están en 0% en el dashboard, así que no están descontadas.'}
        {' '}Tampoco descuenta IIBB ni impuesto al cheque, que sí resta el techo de rentabilidad de Meta Ads.
      </div>
    </div>
  )
}

const TONOS: Record<EstadoVeredicto, { texto: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  holgado: { texto: 'Llega', tone: 'success' },
  ajustado: { texto: 'Justo', tone: 'warning' },
  'no-llega': { texto: 'No llega', tone: 'danger' },
  'sin-datos': { texto: 'Sin datos', tone: 'neutral' },
}

function PillVeredicto({ estado }: { estado: EstadoVeredicto }) {
  const t = TONOS[estado]
  return <Badge tone={t.tone}>{t.texto}</Badge>
}

/**
 * Un número con la unidad de su medidor pegada.
 *
 * 🔑 **La unidad va SIEMPRE, en las cuatro columnas.** Objetivo, medido, lo que falta y el ritmo
 * semanal son la misma magnitud, y son la razón por la que el medidor existe: un número suelto en
 * esta tabla se compara con el de al lado sin que nadie sepa si están en la misma escala.
 */

/**
 * El monto en pesos de un pago, **o por qué todavía no hay uno**.
 *
 * 🔑 Antes acá iba una conversión hecha con un dólar tipeado en un campo de la pantalla, bajo un
 * encabezado que decía «En pesos» a secas: se leía como deuda y era un supuesto. Ahora el peso sale
 * del cambio al que se emitieron los cheques —y desde ese momento el riesgo de devaluación lo toma
 * el proveedor, así que el número es firme—; mientras no esté, va una raya con el motivo.
 *
 * ⛔ Un cero acá diría que esa cuota no cuesta nada, que es la afirmación más cara de las tres.
 */
function EnPesos({ monto }: { monto: number | null }) {
  if (monto === null) {
    return (
      <span style={{ color: color.mut, fontSize: font.sm }} title="Se carga en la economía de la compra">
        falta a cuánto se pesificó
      </span>
    )
  }
  return <>${Math.round(monto).toLocaleString('es-AR')}</>
}
