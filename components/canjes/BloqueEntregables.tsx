'use client'

/**
 * Lo que prometió publicar, y la prueba de que lo publicó.
 *
 * **El cumplimiento lo carga el equipo, no ella.** Al portal no se le agrega esta pantalla: es
 * mucho pedirle, y ella ya sabe lo que acordó — no se le corre atrás por el sistema. Marketing
 * pega el link de cada publicación y los números a mano.
 *
 * ⚠️ Una evidencia **sin verificar no cuenta**. Sin ese paso, pegar un link roto cerraría el canje,
 * y el cumplimiento es justamente lo único que este módulo existe para medir.
 */

import { useState } from 'react'
import {
  Badge, Button, EmptyState, Field, Input, Modal, Notice, SectionCard, Select, StatusPill,
  color, font, space, weight, useConfirmar, useToast, type Tone,
} from '@/components/ui'
import {
  agregarEntregable, agregarEvidencia, borrarEvidencia, quitarEntregable, verificarEvidencia,
} from '@/lib/canjes/cliente'
import {
  ENTREGABLE_LABEL, TIPOS_ENTREGABLE, cumplimiento, entregableEnCriollo,
  type CanjeEntregable, type CanjeEvidencia, type CanjeRow, type TipoEntregable,
} from '@/lib/canjes/tipos'

export function BloqueEntregables({
  canje, entregables, evidencias, onCambio, editable,
}: {
  canje: CanjeRow
  entregables: CanjeEntregable[]
  evidencias: CanjeEvidencia[]
  onCambio: () => void
  editable: boolean
}) {
  const toast = useToast()
  const { confirmar, pedirTexto } = useConfirmar()
  const [sumando, setSumando] = useState(false)
  const [cargandoEvidencia, setCargandoEvidencia] = useState<CanjeEntregable | null>(null)

  const cump = cumplimiento(entregables, evidencias, new Date())
  const sueltas = evidencias.filter((e) => e.entregable_id == null)

  async function quitar(e: CanjeEntregable) {
    const ok = await confirmar({
      titulo: 'Sacar del acuerdo',
      mensaje: `${entregableEnCriollo(e.tipo, e.cantidad_comprometida)}. Si ya hay evidencias cargadas, quedan en el canje pero sin contar para nada.`,
      ok: 'Sacar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await quitarEntregable(canje.store, canje.id, e.id)
      onCambio()
    } catch (err) {
      toast.error(String((err as Error)?.message || err))
    }
  }

  async function verificar(ev: CanjeEvidencia, ok: boolean) {
    let motivo: string | null = null
    if (!ok) {
      motivo = await pedirTexto('¿Por qué no sirve? Queda registrado.', '', { titulo: 'Rechazar la evidencia', ok: 'Rechazar' })
      if (!motivo) return
    }
    try {
      await verificarEvidencia(canje.store, canje.id, ev.id, ok, motivo ?? undefined)
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    }
  }

  return (
    <SectionCard
      title="Qué prometió publicar"
      subtitle="Lo cargás vos: al portal no se le pide el cumplimiento."
      actions={
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <StatusPill
            tone={cump.completo ? 'success' : cump.vencidos.length ? 'warning' : 'action'}
            label={`${cump.cumplidas} de ${cump.comprometidas}`}
          />
          {editable && <Button variant="outline" size="sm" onClick={() => setSumando(true)}>Sumar</Button>}
        </div>
      }
    >
      {cump.vencidos.length > 0 && (
        <div style={{ marginBottom: space[3] }}>
          <Notice tone="warning">
            {cump.vencidos.length === 1
              ? 'Hay un entregable vencido sin publicar.'
              : `Hay ${cump.vencidos.length} entregables vencidos sin publicar.`}
          </Notice>
        </div>
      )}

      {!entregables.length ? (
        <EmptyState
          dashed
          title="Todavía no se acordó nada"
          hint="Sumá lo que se comprometió a publicar: sin esto no hay nada que verificar después."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {cump.porEntregable.map((c) => {
            const suyas = evidencias.filter((e) => e.entregable_id === c.entregable.id)
            return (
              <div key={c.entregable.id} style={{ border: `1px solid ${color.line}`, borderRadius: 8, padding: space[3] }}>
                <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontWeight: weight.medium }}>
                    {entregableEnCriollo(c.entregable.tipo, c.comprometidas)}
                  </strong>
                  {!c.entregable.obligatorio && <Badge tone="neutral" subtle>Opcional</Badge>}
                  <StatusPill
                    tone={c.completo ? 'success' : c.vencido ? 'danger' : 'neutral'}
                    label={`${c.cumplidas}/${c.comprometidas}`}
                  />
                  {/* El plazo se cuenta desde la entrega, no desde el acuerdo: al acordar todavía
                      no se sabe cuándo llega el pedido. */}
                  <span style={{ color: c.vencido ? color.danger : color.mut, fontSize: font.sm }}>
                    {c.entregable.vence_el
                      ? `Vence el ${c.entregable.vence_el}`
                      : `${c.entregable.plazo_dias ?? '—'} días desde que le llegue`}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: space[1] }}>
                    {editable && (
                      <Button variant="outline" size="sm" onClick={() => setCargandoEvidencia(c.entregable)}>
                        Cargar publicación
                      </Button>
                    )}
                    {editable && !suyas.length && (
                      <Button variant="ghost" tone="danger" size="sm" onClick={() => void quitar(c.entregable)}>Sacar</Button>
                    )}
                  </span>
                </div>

                {suyas.length > 0 && (
                  <div style={{ marginTop: space[2], display: 'flex', flexDirection: 'column', gap: space[1] }}>
                    {suyas.map((ev) => (
                      <Evidencia key={ev.id} ev={ev} editable={editable} onVerificar={verificar} onBorrar={async () => {
                        const ok = await confirmar({ mensaje: 'Borrar esta evidencia.', ok: 'Borrar', tono: 'danger' })
                        if (!ok) return
                        try {
                          await borrarEvidencia(canje.store, canje.id, ev.id)
                          onCambio()
                        } catch (e) { toast.error(String((e as Error)?.message || e)) }
                      }} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Las evidencias sin entregable: quedaron huérfanas al sacar uno del acuerdo. Se muestran
          igual — borrarlas en silencio sería perder trabajo que alguien hizo. */}
      {sueltas.length > 0 && (
        <div style={{ marginTop: space[3] }}>
          <div style={{ color: color.mut, fontSize: font.sm, fontWeight: weight.medium, marginBottom: 4 }}>
            Sin entregable asociado
          </div>
          {sueltas.map((ev) => (
            <Evidencia key={ev.id} ev={ev} editable={editable} onVerificar={verificar} onBorrar={async () => {
              try {
                await borrarEvidencia(canje.store, canje.id, ev.id)
                onCambio()
              } catch (e) { toast.error(String((e as Error)?.message || e)) }
            }} />
          ))}
        </div>
      )}

      {sumando && (
        <SumarEntregable
          canje={canje}
          onCerrar={() => setSumando(false)}
          onListo={() => { setSumando(false); onCambio() }}
        />
      )}
      {cargandoEvidencia && (
        <CargarEvidencia
          canje={canje}
          entregable={cargandoEvidencia}
          onCerrar={() => setCargandoEvidencia(null)}
          onListo={() => { setCargandoEvidencia(null); onCambio() }}
        />
      )}
    </SectionCard>
  )
}

const EV_TONE = (ev: CanjeEvidencia): Tone => (ev.verificada ? 'success' : ev.rechazada_motivo ? 'danger' : 'warning')

function Evidencia({
  ev, editable, onVerificar, onBorrar,
}: {
  ev: CanjeEvidencia
  editable: boolean
  onVerificar: (ev: CanjeEvidencia, ok: boolean) => Promise<void>
  onBorrar: () => Promise<void>
}) {
  return (
    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm }}>
      <StatusPill
        tone={EV_TONE(ev)}
        label={ev.verificada ? 'Verificada' : ev.rechazada_motivo ? 'Rechazada' : 'Sin verificar'}
      />
      {ev.url_publicacion ? (
        <a href={ev.url_publicacion} target="_blank" rel="noopener noreferrer" style={{ color: color.brand }}>
          Ver la publicación
        </a>
      ) : (
        <span style={{ color: color.mut }}>Sólo captura</span>
      )}
      {ev.fecha_publicacion && <span style={{ color: color.mut2 }}>{ev.fecha_publicacion}</span>}
      {ev.rechazada_motivo && <span style={{ color: color.danger }}>{ev.rechazada_motivo}</span>}
      {editable && (
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {!ev.verificada && <Button variant="ghost" size="sm" onClick={() => void onVerificar(ev, true)}>Verificar</Button>}
          {!ev.rechazada_motivo && <Button variant="ghost" size="sm" onClick={() => void onVerificar(ev, false)}>Rechazar</Button>}
          <Button variant="ghost" tone="danger" size="sm" onClick={() => void onBorrar()}>Borrar</Button>
        </span>
      )}
    </div>
  )
}

function SumarEntregable({
  canje, onCerrar, onListo,
}: {
  canje: CanjeRow
  onCerrar: () => void
  onListo: () => void
}) {
  const toast = useToast()
  const [tipo, setTipo] = useState<TipoEntregable>('historia_ig')
  const [cantidad, setCantidad] = useState('1')
  const [plazo, setPlazo] = useState('')
  const [obligatorio, setObligatorio] = useState(true)
  const [guardando, setGuardando] = useState(false)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Sumar al acuerdo"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button
            variant="solid"
            tone="brand"
            loading={guardando}
            onClick={async () => {
              setGuardando(true)
              try {
                await agregarEntregable(canje.store, canje.id, {
                  tipo,
                  cantidad_comprometida: Math.max(1, Number(cantidad) || 1),
                  plazo_dias: plazo === '' ? null : Number(plazo),
                  obligatorio,
                })
                onListo()
              } catch (e) {
                toast.error(String((e as Error)?.message || e))
              } finally {
                setGuardando(false)
              }
            }}
          >
            Sumar
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {/* Lista CERRADA en código: una lista abierta se llena de duplicados (`Reel`, `reel ig`,
            `REEL`) y estos tipos alimentan el puntaje y los avisos. */}
        <Field label="Qué">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEntregable)}>
            {TIPOS_ENTREGABLE.map((t) => <option key={t} value={t}>{ENTREGABLE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Cuántas">
          <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </Field>
        <Field label="Plazo" hint="Días DESDE que le llega el pedido, no desde hoy">
          <Input type="number" value={plazo} placeholder="Por defecto" onChange={(e) => setPlazo(e.target.value)} />
        </Field>
      </div>
      <label style={{ display: 'flex', gap: space[2], alignItems: 'center', marginTop: space[3] }}>
        <input type="checkbox" checked={obligatorio} onChange={(e) => setObligatorio(e.target.checked)} />
        <span>Obligatorio (si no se cumple, traba el cierre y aparece como vencido)</span>
      </label>
    </Modal>
  )
}

function CargarEvidencia({
  canje, entregable, onCerrar, onListo,
}: {
  canje: CanjeRow
  entregable: CanjeEntregable
  onCerrar: () => void
  onListo: () => void
}) {
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [captura, setCaptura] = useState('')
  const [fecha, setFecha] = useState('')
  const [alcance, setAlcance] = useState('')
  const [interacciones, setInteracciones] = useState('')
  const [guardando, setGuardando] = useState(false)

  const puede = url.trim() !== '' || captura.trim() !== ''

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Cargar ${ENTREGABLE_LABEL[entregable.tipo].toLowerCase()}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button
            variant="solid"
            tone="brand"
            loading={guardando}
            disabled={!puede}
            onClick={async () => {
              setGuardando(true)
              try {
                await agregarEvidencia(canje.store, canje.id, {
                  entregable_id: entregable.id,
                  url_publicacion: url.trim() || null,
                  captura_url: captura.trim() || null,
                  fecha_publicacion: fecha || null,
                  metricas: {
                    alcance: alcance === '' ? null : Number(alcance),
                    interacciones: interacciones === '' ? null : Number(interacciones),
                  },
                })
                onListo()
              } catch (e) {
                toast.error(String((e as Error)?.message || e))
              } finally {
                setGuardando(false)
              }
            }}
          >
            Cargar
          </Button>
        </>
      }
    >
      <Field label="Link de la publicación" hint="El de Instagram o TikTok">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://instagram.com/p/…" />
      </Field>
      {/* Las historias vencen a las 24 h: para esas, la captura ES la prueba. */}
      <div style={{ marginTop: space[3] }}>
        <Field label="Link de la captura" hint="Para historias: el link se cae a las 24 h y la captura es la única prueba">
          <Input value={captura} onChange={(e) => setCaptura(e.target.value)} />
        </Field>
      </div>
      <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginTop: space[3] }}>
        <Field label="Cuándo se publicó" hint="Se compara con el vencimiento">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Field label="Alcance"><Input type="number" value={alcance} onChange={(e) => setAlcance(e.target.value)} /></Field>
        <Field label="Interacciones"><Input type="number" value={interacciones} onChange={(e) => setInteracciones(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: space[3], color: color.mut2, fontSize: font.sm }}>
        Las métricas se cargan a mano: cada formato reporta distinto y la API de Instagram está
        fuera de alcance. Sin ellas el canje cierra igual, sólo que sin CPM.
      </div>
    </Modal>
  )
}
