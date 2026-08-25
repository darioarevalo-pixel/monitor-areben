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
import { leerRetornos, marcarRecibido, marcarReingreso } from '@/lib/reclamos/cliente'
import {
  bandejaDeRetornos, detalleDeLoQueVuelve, textoDeReclamoAlCorreo, QUE_HACER_LABEL,
  type FilaRetorno, type RetornoRow,
} from '@/lib/reclamos/retornos'
import {
  DIAS_ALERTA, MOTIVO_LABEL, pideSeguimiento, trackingUrl, VIA_LABEL,
} from '@/lib/reclamos/tipos'

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
  const [anden, setAnden] = useState<'esperando' | 'guardar'>('esperando')
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

  const recibir = async (f: FilaRetorno) => {
    const si = await confirmar({
      titulo: `¿Llegó ${f.numero}?`,
      ok: 'Sí, lo tengo acá',
      mensaje: `${detalleDeLoQueVuelve(f.reclamo)}. Cuando lo confirmes pasa al otro andén, para ${
        f.queHacer === 'falla' ? 'darlo de alta en Fallas' : 'reingresarlo en Gestión Nube'
      }.`,
    })
    if (si) await accion(f.reclamo.id, () => marcarRecibido(marca, f.reclamo.id), 'Anotado: llegó.')
  }

  const reingresar = async (f: FilaRetorno) => {
    const si = await confirmar({
      titulo: 'Reingresado en Gestión Nube',
      ok: 'Sí, ya lo cargué',
      mensaje: `¿Ya le sumaste a mano la unidad al stock en GN? (${detalleDeLoQueVuelve(f.reclamo)}). El sistema no puede hacerlo por API: esto sólo deja el registro.`,
    })
    if (si) await accion(f.reclamo.id, () => marcarReingreso(marca, f.reclamo.id), 'Anotado: quedó reingresado.')
  }

  const lista = anden === 'esperando' ? bandeja.esperando : bandeja.guardar

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
      </div>

      <Instructivo
        titulo="¿Qué es esta pantalla?"
        pasos={[
          <>Acá está <b>todo lo que estamos esperando que vuelva</b>: lo que el cliente despachó, lo que va a traer al local, y lo de los cambios. Lo más viejo va primero.</>,
          <>Cuando el paquete llega, tocá <b>Llegó</b>. Con eso el reclamo deja de estar en la calle y pasa al otro andén.</>,
          <>En <b>Llegó, falta guardarlo</b> está lo que ya tenés en la mano y todavía no volvió al stock: tocá <b>Reingresado</b> cuando lo hayas cargado en Gestión Nube.</>,
          <>Si dice <b>Va a Fallas</b>, la unidad <b>no</b> vuelve a stock: se carga en Fallas y de ahí sigue Administración.</>,
        ]}
        ojo={<>Acá no se decide nada: qué se le devuelve al cliente y qué pasa con el producto ya se decidió en <b>Reclamos</b>. Si algo llegó y no está en esta lista, avisá — quiere decir que el reclamo quedó en otro estado.</>}
      />

      <Notice tone="neutral" style={{ marginBottom: space[3] }}>
        Esto es lo que <b>entra</b>. Lo que sale —reparto y cadetería del día— está en <b>Envíos del día</b>.
      </Notice>

      <Toolbar justify="between" style={{ marginBottom: space[3] }}>
        <Tabs
          variant="underline" value={anden} onChange={(k) => setAnden(k as 'esperando' | 'guardar')}
          items={[
            { key: 'esperando', label: `Esperando (${bandeja.esperando.length})` },
            { key: 'guardar', label: `Llegó, falta guardarlo (${bandeja.guardar.length})` },
          ]}
        />
        <Button variant="outline" onClick={() => void recargar()} disabled={cargando}>Recargar</Button>
      </Toolbar>

      {error && <Notice tone="danger">{error}</Notice>}

      {!cargando && !lista.length ? (
        <Card padding={4}>
          <EmptyState
            title={anden === 'esperando' ? 'No estamos esperando nada' : 'Nada pendiente de guardar'}
            hint={anden === 'esperando'
              ? 'Cuando Administración decida que un producto vuelve, aparece acá solo.'
              : 'Lo que llega y se reingresa sale de esta lista.'}
          />
        </Card>
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Reclamo</Th>
              <Th>Qué vuelve</Th>
              <Th>{anden === 'esperando' ? 'Cómo vuelve' : 'Qué hacer con él'}</Th>
              <Th>{anden === 'esperando' ? 'Esperando' : 'Llegó'}</Th>
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
                  <Td>
                    <div style={{ fontSize: font.sm }}>{detalleDeLoQueVuelve(d)}</div>
                    {/* Lo que traba: no es una alerta por tiempo, es algo que falta hacer ACÁ. */}
                    {f.traba && (
                      <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.warningInk, marginTop: 2 }}>
                        ⚠ {f.traba}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {anden === 'esperando' ? (
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
                        <Button size="sm" variant="solid" tone="brand" disabled={ocup} onClick={() => void recibir(f)}>Llegó</Button>
                      )}
                      {anden === 'guardar' && d.reingreso_estado === 'pendiente' && (
                        <Button size="sm" variant="solid" tone="brand" disabled={ocup} onClick={() => void reingresar(f)}>Reingresado</Button>
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
