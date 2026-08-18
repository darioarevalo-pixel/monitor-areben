'use client'

import { useMemo, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { useNorte } from './useNorte'
import { EditorCondiciones } from './EditorCondiciones'
import {
  avanceDeMeta,
  calendarioDePagos,
  coberturaDePagos,
  contribucionDiaria,
  diaDeAgotamiento,
  entradaDiaria,
  proyectarStock,
  ritmoDeSalida,
  salidaDiaria,
  veredicto,
} from '@/lib/norte/core'
import { porUnidad, ventanaUltimos } from '@/lib/norte/contribucion'
import type { Contribucion, EstadoVeredicto } from '@/lib/norte/tipos'
import {
  Badge,
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
  const { importaciones, metas, contribucion, admin, cargando, error, recargar } = useNorte(marca)
  const [editando, setEditando] = useState<string | null>(null)
  const [cotizacion, setCotizacion] = useState(1380)

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

  const pagos = useMemo(() => calendarioDePagos(importaciones, cotizacion), [importaciones, cotizacion])
  /** Cada pago con cuánta contribución habrá acumulado el negocio para esa fecha. */
  const cubiertos = useMemo(() => coberturaDePagos(pagos, hoy, dejaPorDia), [pagos, hoy, dejaPorDia])
  const faltan = importaciones.filter((i) => !i.arribada && !i.condiciones?.cuotas?.length)
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
          <SectionCard title="Por dónde sale" subtitle="Unidades y plata por día, últimos 30 días con venta">
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
                          {i.condiciones?.cuotas?.length ? (
                            <>
                              {i.condiciones.moneda} {i.condiciones.costoUnitario} · {i.condiciones.cuotas.length} cuota
                              {i.condiciones.cuotas.length > 1 ? 's' : ''}
                            </>
                          ) : (
                            <span style={{ color: color.mut2 }}>falta cargar</span>
                          )}
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
                {faltan.length === 1
                  ? '1 importación sin costo ni plazos cargados. No aparece abajo'
                  : `${faltan.length} importaciones sin costo ni plazos cargados. No aparecen abajo`}
                : preferimos el renglón vacío antes que inventarles un costo.
              </Notice>
            )}
            {pagos.length === 0 ? (
              <EmptyState title="Sin vencimientos cargados" hint="Cargá el costo y las cuotas de cada importación." />
            ) : (
              <>
                <label
                  style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[3], fontSize: font.md }}
                >
                  Dólar a
                  <input
                    type="number"
                    value={cotizacion}
                    onChange={(e) => setCotizacion(Number(e.target.value) || 0)}
                    style={{ width: 96 }}
                  />
                  <span style={{ color: color.mut }}>movelo para ver cuánto pesa una devaluación</span>
                </label>
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
                          ${Math.round(p.montoPesos).toLocaleString('es-AR')}
                        </Td>
                        {dejaPorDia > 0 && (
                          <Td align="right" mono>
                            <span style={{ color: cobertura < 1 ? color.danger : undefined }}>
                              {cobertura === Infinity ? '—' : `${cobertura.toFixed(1)}×`}
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
          </SectionCard>

          <SectionCard title="Metas" subtitle="Un objetivo con su número al lado deja de ser una conversación">
            {metas.filter((m) => m.activa).length === 0 ? (
              <EmptyState title="Sin metas cargadas" hint="Se cargan por API; la pantalla para editarlas es el próximo paso." />
            ) : (
              <TableWrap>
                <THead>
                  <Tr>
                    <Th>Meta</Th>
                    <Th align="right">Objetivo</Th>
                    <Th align="right">Para cuándo</Th>
                    <Th align="right">Por semana</Th>
                  </Tr>
                </THead>
                <TBody>
                  {metas
                    .filter((m) => m.activa)
                    .map((m) => {
                      const a = avanceDeMeta({ ...m, medido: 0 }, hoy)
                      return (
                        <Tr key={m.key}>
                          <Td>{m.label}</Td>
                          <Td align="right" mono>
                            {m.objetivo.toLocaleString('es-AR')} {m.unidad}
                          </Td>
                          <Td align="right" mono>
                            {m.fechaObjetivo || '—'}
                          </Td>
                          <Td align="right" mono>
                            {a.porSemana === null ? '—' : a.porSemana.toFixed(1)}
                          </Td>
                        </Tr>
                      )
                    })}
                </TBody>
              </TableWrap>
            )}
            <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm }}>
              🔴 El medido de cada meta todavía no se calcula solo, así que la columna de avance no está: falta
              engancharlo a la serie de ventas por canal. Mostrarlo en cero se leería como «no avanzamos».
            </div>
          </SectionCard>
        </div>
        )}
      </DatosGate>
    </div>
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
