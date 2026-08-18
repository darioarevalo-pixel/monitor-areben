'use client'

import { useMemo, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { useNorte } from './useNorte'
import { EditorCondiciones } from './EditorCondiciones'
import {
  avanceDeMeta,
  calendarioDePagos,
  diaDeAgotamiento,
  entradaDiaria,
  proyectarStock,
  ritmoDeSalida,
  salidaDiaria,
  sumarDias,
  veredicto,
} from '@/lib/norte/core'
import type { EstadoVeredicto } from '@/lib/norte/tipos'
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
 * ## 🔴 Lo que esta pantalla NO muestra, y por qué se dice en voz alta
 *
 * **No muestra contribución.** El payload del ETL trae unidades pero **no precios** (`FilaDetalle`
 * es `sale_id · product_id · quantity`), así que el ritmo sale exacto y la plata que deja cada
 * canal no se puede calcular desde acá. Aplicarle a mayorista la contribución de la tienda la
 * sobrestimaría **7,6 veces** —una funda mayorista deja $1.046 y una online $7.920—, y un número
 * inventado en una pantalla de Dirección es peor que un renglón vacío.
 *
 * ⇒ Por eso el calendario de pagos dice **cuánto y cuándo**, y no «cuántas veces está cubierto».
 * Falta el cruce por línea contra las dos bases, que es lo que ya hace `api/_memo.js`.
 */
export function Norte() {
  const { marca } = useSesion()
  const { datos, error: errorDatos, progreso, origen } = useDatosMonitor()
  const { importaciones, metas, admin, cargando, error, recargar } = useNorte(marca)
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
  const ritmo = useMemo(() => {
    if (!datos) return []
    const fechas = datos.ventas.map((v) => v.date_sale).filter(Boolean) as string[]
    if (!fechas.length) return []
    const hasta = fechas.reduce((a, b) => (a > b ? a : b)).slice(0, 10)
    const desde = sumarDias(hasta, -29)

    const unidadesPorVenta = new Map<string, number>()
    for (const d of datos.detalles) {
      const k = String(d.sale_id)
      unidadesPorVenta.set(k, (unidadesPorVenta.get(k) || 0) + (Number(d.quantity) || 0))
    }
    const filas = datos.ventas
      .filter((v) => v.date_sale && v.date_sale.slice(0, 10) >= desde && v.date_sale.slice(0, 10) <= hasta)
      .map((v) => ({ canal: v.channel, unidades: unidadesPorVenta.get(String(v.id)) || 0 }))
    return ritmoDeSalida(filas, 30, {})
  }, [datos])

  const salen = salidaDiaria(ritmo)

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
          <SectionCard title="Por dónde sale" subtitle="Unidades por día, últimos 30 días con venta">
            {ritmo.length === 0 ? (
              <EmptyState title="Sin ventas en la ventana" hint="No hay con qué medir el ritmo." />
            ) : (
              <TableWrap>
                <THead>
                  <Tr>
                    <Th>Canal</Th>
                    <Th align="right">Unidades por día</Th>
                    <Th align="right">Parte de la salida</Th>
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
                    </Tr>
                  ))}
                </TBody>
              </TableWrap>
            )}
            <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm }}>
              Son unidades, no plata: el ETL trae cantidades y no precios, así que la contribución de cada canal se
              calcula aparte y todavía no está en esta pantalla.
            </div>
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
                    </Tr>
                  </THead>
                  <TBody>
                    {pagos.map((p, i) => (
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
                      </Tr>
                    ))}
                  </TBody>
                </TableWrap>
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
