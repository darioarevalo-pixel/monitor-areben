'use client'

/**
 * **Retornos** — la bandeja de lo que estamos esperando que vuelva.
 *
 * La miran Depósito y Local: son los que abren la caja. Antes esto vivía adentro de cada reclamo
 * (`via_retorno`, `seguimiento_vuelta`, el estado `en_transito`, la alerta a los 15 días), así que
 * para saber qué estábamos esperando había que abrirlos de a uno — y nadie lo hacía.
 *
 * ⛔ **No es Envíos del día**, que es lo que SALE (reparto y cadetería del local). Acá está lo que
 * ENTRA de vuelta.
 *
 * Son dos andenes y dos gestos, nada más: *llegó* y *ya lo guardé en Gestión Nube*. Todo lo que
 * decide plata o destino se decidió antes, en Reclamos, y acá sólo se lee.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Button, Card, CopyButton, EmptyState, KpiCard, Notice, SectionCard, StatusPill, Tabs, Toolbar,
  TableWrap, THead, TBody, Tr, Th, Td,
  color, font, space, weight, useConfirmar, useToast,
  Instructivo,
} from '@/components/ui'
import { leerRetornos, marcarDespachado, marcarRecibido, marcarReingreso } from '@/lib/reclamos/cliente'
import {
  bandejaDeRetornos, detalleDeLoQueVuelve, textoDeReclamoAlCorreo, QUE_HACER_LABEL,
  type FilaRetorno, type RetornoRow,
} from '@/lib/reclamos/retornos'
import {
  DIAS_ALERTA, MOTIVO_LABEL, etiquetaEM, pideSeguimiento, trackingUrl, VIA_LABEL,
  type UnidadQueVuelve,
} from '@/lib/reclamos/tipos'

type Anden = 'esperando' | 'guardar' | 'despachar'

/** "hace 3 días" / "hoy". El número es la columna por la que se ordena todo. */
function haceCuanto(dias: number): string {
  if (dias <= 0) return 'hoy'
  return `hace ${dias} día${dias === 1 ? '' : 's'}`
}

export function Retornos() {
  const { marca } = useSesion()
  const toast = useToast()
  const { confirmar } = useConfirmar()

  const [filas, setFilas] = useState<RetornoRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [anden, setAnden] = useState<Anden>('esperando')
  const [ocupado, setOcupado] = useState<number | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setFilas(await leerRetornos(marca))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la bandeja.')
    } finally {
      setCargando(false)
    }
  }, [marca])

  // El setState va DENTRO del await, no en el cuerpo del effect: el linter del repo rechaza el
  // setState síncrono en un effect (dispara renders en cascada). Mismo patrón que Reclamos.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const d = await leerRetornos(marca)
        if (vivo) setFilas(d)
      } catch (e) {
        if (vivo) setError((e as Error).message)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [marca])

  const bandeja = useMemo(() => bandejaDeRetornos(filas), [filas])
  const tarde = bandeja.esperando.filter((f) => f.tarde).length
  const sinDespachar = bandeja.despachar.filter((f) => f.tarde).length

  const accion = async (id: number, fn: () => Promise<void>, ok: string) => {
    setOcupado(id)
    try {
      await fn()
      toast.ok(ok)
      await recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.')
    } finally {
      setOcupado(null)
    }
  }

  /**
   * Llegó. **De a una unidad o todo junto**: un reclamo puede tener dos productos y la caja traer
   * uno, y hasta el 25-ago-2026 esto era entero o nada — tildarlo con uno solo en la mano dejaba al
   * otro sin que lo buscara nadie.
   */
  const recibir = async (f: FilaRetorno, unidad?: UnidadQueVuelve) => {
    const que = unidad
      ? `${unidad.item.producto}${unidad.item.variante ? ` · ${unidad.item.variante}` : ''}`
      : detalleDeLoQueVuelve(f.reclamo)
    const quedan = f.faltan.length - (unidad ? 1 : f.faltan.length)
    const si = await confirmar({
      titulo: unidad ? `¿Llegó esto de ${f.numero}?` : `¿Llegó ${f.numero}?`,
      ok: 'Sí, lo tengo acá',
      mensaje: `${que}. ${quedan > 0
        ? `Van a quedar ${quedan} producto${quedan > 1 ? 's' : ''} esperando, así que el reclamo sigue en camino.`
        : `Cuando lo confirmes pasa al otro andén, para ${f.queHacer === 'falla' ? 'darlo de alta en Fallas' : 'reingresarlo en Gestión Nube'}.`}`,
    })
    if (!si) return
    await accion(
      f.reclamo.id,
      async () => { await marcarRecibido(marca, f.reclamo.id, unidad ? { unidades: [unidad.i] } : undefined) },
      quedan > 0 ? 'Anotado. Falta el resto.' : 'Anotado: llegó.',
    )
  }

  const reingresar = async (f: FilaRetorno) => {
    const si = await confirmar({
      titulo: 'Reingresado en Gestión Nube',
      ok: 'Sí, ya lo cargué',
      mensaje: `¿Ya le sumaste a mano la unidad al stock en GN? (${detalleDeLoQueVuelve(f.reclamo)}). El sistema no puede hacerlo por API: esto sólo deja el registro.`,
    })
    if (si) await accion(f.reclamo.id, () => marcarReingreso(marca, f.reclamo.id), 'Anotado: quedó reingresado.')
  }

  /**
   * Despaché. **Es el gesto que le faltaba a Depósito**: el pendiente lo dejan el cambio, la
   * reposición y el reenvío, y hasta ahora sólo se podía tildar desde Reclamos —que es de
   * Administración—, así que quien de verdad pone el paquete en la calle no tenía dónde decirlo.
   */
  const despachar = async (f: FilaRetorno) => {
    const si = await confirmar({
      titulo: `¿Ya salió lo de ${f.numero}?`,
      ok: 'Sí, ya lo despaché',
      mensaje: `${f.sale || 'Lo que se le manda al cliente'}. Tildalo cuando el paquete esté en la calle, no cuando esté armado.`,
    })
    if (si) await accion(f.reclamo.id, () => marcarDespachado(marca, f.reclamo.id), 'Anotado: ya salió.')
  }

  const lista = bandeja[anden]

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <KpiCard label="Esperando que vuelva" value={String(bandeja.esperando.length)} />
        <KpiCard
          label={`Sin aparecer hace ${DIAS_ALERTA.transito}+ días`}
          value={String(tarde)}
          sub="preguntar en el correo"
          tone={tarde ? 'danger' : 'neutral'}
        />
        <KpiCard
          label="Llegó y falta guardarlo"
          value={String(bandeja.guardar.length)}
          tone={bandeja.guardar.length ? 'warning' : 'neutral'}
        />
        {/* El paquete que SALE. Iba en la misma operación y no se veía en ningún lado que
            Depósito pudiera abrir. */}
        <KpiCard
          label="Falta despachar"
          value={String(bandeja.despachar.length)}
          sub={sinDespachar ? `${sinDespachar} hace ${DIAS_ALERTA.despacho}+ días` : 'lo que se le manda al cliente'}
          tone={sinDespachar ? 'danger' : bandeja.despachar.length ? 'warning' : 'neutral'}
        />
      </div>

      <Instructivo
        titulo="¿Qué es esta pantalla?"
        pasos={[
          <>Acá está <b>todo lo que estamos esperando que vuelva</b>: lo que el cliente despachó, lo que va a traer al local, y lo de los cambios. Lo más viejo va primero.</>,
          <>Cuando el paquete llega, tocá <b>Llegó</b>. Con eso el reclamo deja de estar en la calle y pasa al otro andén.</>,
          <>En <b>Llegó, falta guardarlo</b> está lo que ya tenés en la mano y todavía no volvió al stock: tocá <b>Reingresado</b> cuando lo hayas cargado en Gestión Nube.</>,
          <>Si dice <b>Va a Fallas</b>, la unidad <b>no</b> vuelve a stock: se carga en Fallas y de ahí sigue Administración.</>,
          <>En <b>Falta despachar</b> está lo que hay que <b>mandarle</b> al cliente: el cambio, la reposición y el reenvío. Tocá <b>Despaché</b> cuando el paquete esté en la calle, no cuando esté armado.</>,
        ]}
        ojo={<>Acá no se decide nada: qué se le devuelve al cliente y qué pasa con el producto ya se decidió en <b>Reclamos</b>. Si algo llegó y no está en esta lista, avisá — quiere decir que el reclamo quedó en otro estado.</>}
      />

      <Notice tone="neutral" style={{ marginBottom: space[3] }}>
        Esto es lo que <b>entra</b>, y el paquete que sale <b>por el mismo caso</b>. El reparto y la
        cadetería del día están en <b>Envíos del día</b>.
      </Notice>

      <Toolbar justify="between" style={{ marginBottom: space[3] }}>
        <Tabs
          variant="underline" value={anden} onChange={(k) => setAnden(k as Anden)}
          items={[
            { key: 'esperando', label: `Esperando (${bandeja.esperando.length})` },
            { key: 'guardar', label: `Llegó, falta guardarlo (${bandeja.guardar.length})` },
            { key: 'despachar', label: `Falta despachar (${bandeja.despachar.length})` },
          ]}
        />
        <Button variant="outline" onClick={() => void recargar()} disabled={cargando}>Recargar</Button>
      </Toolbar>

      {error && <Notice tone="danger">{error}</Notice>}

      {!cargando && !lista.length ? (
        <Card padding={4}>
          <EmptyState
            title={{
              esperando: 'No estamos esperando nada',
              guardar: 'Nada pendiente de guardar',
              despachar: 'No hay nada para mandar',
            }[anden]}
            hint={{
              esperando: 'Cuando Administración decida que un producto vuelve, aparece acá solo.',
              guardar: 'Lo que llega y se reingresa sale de esta lista.',
              despachar: 'Acá caen los cambios, las reposiciones y los reenvíos: lo que se le manda al cliente.',
            }[anden]}
          />
        </Card>
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Reclamo</Th>
              <Th>{anden === 'despachar' ? 'Qué le mandamos' : 'Qué vuelve'}</Th>
              <Th>{{ esperando: 'Cómo vuelve', guardar: 'Qué hacer con él', despachar: 'Con qué sale' }[anden]}</Th>
              <Th>{{ esperando: 'Esperando', guardar: 'Llegó', despachar: 'Decidido' }[anden]}</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {lista.map((f) => {
              const d = f.reclamo
              const ocup = ocupado === d.id
              return (
                <Tr key={d.id}>
                  <Td>
                    <div style={{ fontWeight: weight.semibold }}>{f.numero}</div>
                    <div style={{ fontSize: font.xs, color: color.mut2 }}>
                      {d.orden_tn ? `#${d.orden_tn}` : '—'} · {d.cliente || 'sin nombre'}
                    </div>
                    <div style={{ fontSize: font.xs, color: color.mut2 }}>{MOTIVO_LABEL[d.motivo] || d.motivo}</div>
                  </Td>
                  {/* `wrap` + `maxWidth`: el `<Td>` hereda `white-space: nowrap` y acá abajo van
                      dos textos libres largos —lo que traba y lo que le mandamos—, que estirarían
                      la tabla a lo ancho. Mismo defecto que tenía la columna de pendientes de
                      Reclamos. */}
                  <Td wrap style={{ maxWidth: 300 }}>
                    <div style={{ fontSize: font.sm }}>
                      {anden === 'despachar' ? (f.sale || '—') : detalleDeLoQueVuelve(d)}
                    </div>
                    {/* Lo que traba: no es una alerta por tiempo, es algo que falta hacer ACÁ. */}
                    {f.traba && (
                      <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.warningInk, marginTop: 2 }}>
                        ⚠ {f.traba}
                      </div>
                    )}
                    {/* El otro medio caso: si además le tenemos que mandar algo, se dice acá. Antes
                        había que abrir Reclamos —que Depósito no puede— para enterarse. */}
                    {anden !== 'despachar' && f.sale && (
                      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2 }}>
                        ↗ Le mandamos: {f.sale}{f.faltaDespacharlo ? ' — todavía sin despachar' : ' ✓ despachado'}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {anden === 'despachar' ? (
                      <>
                        {/* La solicitud de envío y el código de ida. ⛔ Sin link: el transportista
                            de la IDA no se guarda (`via_retorno` es el de la vuelta), y un link al
                            buscador equivocado es peor que ninguno. */}
                        <div style={{ fontSize: font.sm }}>{d.solicitud_envio ? etiquetaEM(d.solicitud_envio) : 'Sin solicitud de envío'}</div>
                        {d.seguimiento_ida && (
                          <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2 }}>{d.seguimiento_ida}</div>
                        )}
                      </>
                    ) : anden === 'esperando' ? (
                      <>
                        <div style={{ fontSize: font.sm }}>{d.via_retorno ? VIA_LABEL[d.via_retorno] : '—'}</div>
                        {d.seguimiento_vuelta && (
                          <div style={{ fontSize: font.xs, marginTop: 2 }}>
                            {trackingUrl(d.via_retorno, d.seguimiento_vuelta)
                              ? <a href={trackingUrl(d.via_retorno, d.seguimiento_vuelta) || undefined} target="_blank" rel="noreferrer" style={{ color: color.action }}>↗ {d.seguimiento_vuelta}</a>
                              : d.seguimiento_vuelta}
                          </div>
                        )}
                        <div style={{ marginTop: 4 }}>
                          <StatusPill tone={f.queHacer === 'falla' ? 'warning' : 'neutral'} label={QUE_HACER_LABEL[f.queHacer]} dot={false} />
                        </div>
                      </>
                    ) : (
                      <StatusPill tone={f.queHacer === 'falla' ? 'warning' : 'brand'} label={QUE_HACER_LABEL[f.queHacer]} dot={false} />
                    )}
                  </Td>
                  <Td>
                    <div style={{ fontSize: font.sm, fontWeight: f.tarde ? weight.semibold : weight.normal, color: f.tarde ? color.dangerInk : color.ink2 }}>
                      {haceCuanto(f.dias)}
                    </div>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {anden === 'esperando' && (
                        f.faltan.length > 1 ? (
                          // Con dos o más esperados, cada uno se tilda por su nombre: la caja
                          // llega como llega, y "Llegó" a secas obliga a mentir en la mitad de los
                          // casos. El "Llegaron los N" sigue estando para el caso normal.
                          <>
                            {f.faltan.map((u) => (
                              <Button key={u.i} size="sm" variant="outline" tone="brand" disabled={ocup} onClick={() => void recibir(f, u)}>
                                Llegó: {u.item.producto}
                              </Button>
                            ))}
                            <Button size="sm" variant="solid" tone="brand" disabled={ocup} onClick={() => void recibir(f)}>
                              Llegaron los {f.faltan.length}
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="solid" tone="brand" disabled={ocup} onClick={() => void recibir(f)}>Llegó</Button>
                        )
                      )}
                      {anden === 'guardar' && d.reingreso_estado === 'pendiente' && (
                        <Button size="sm" variant="solid" tone="brand" disabled={ocup} onClick={() => void reingresar(f)}>Reingresado</Button>
                      )}
                      {anden === 'despachar' && (
                        <Button size="sm" variant="solid" tone="brand" disabled={ocup} onClick={() => void despachar(f)}>Despaché</Button>
                      )}
                      {/* El paquete que no aparece: el renglón para preguntar en el correo, ya
                          armado. Sin esto hay que abrir el reclamo y copiar cuatro cosas a mano. */}
                      {anden === 'esperando' && f.tarde && pideSeguimiento(d.via_retorno) && (
                        <CopyButton getText={() => textoDeReclamoAlCorreo(f)} label="Copiar para el correo" tone="neutral" />
                      )}
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </TableWrap>
      )}

      <SectionCard title="Qué NO se hace desde acá" style={{ marginTop: space[4] }}>
        <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.8 }}>
          Devolver la plata, anular la venta o decidir el destino del producto son de
          <b> Administración → Reclamos</b>. Si te llega algo que no tiene reclamo abierto, no entra
          por acá: es una <b>falla</b> (si vino con un problema) o hay que abrir el reclamo primero.
        </div>
      </SectionCard>
    </div>
  )
}

export default Retornos
