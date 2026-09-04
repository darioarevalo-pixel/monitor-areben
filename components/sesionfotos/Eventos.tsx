'use client'

import { useState } from 'react'
import { Badge, Button, Field, Input, Select, color, useConfirmar } from '@/components/ui'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { FichaModelo } from './FichaModelo'
import {
  bloqueoEliminarEvento,
  conDescripcionEvento,
  conDisparadorEvento,
  conDuracion,
  conEstadoEvento,
  conEvento,
  conFechaEvento,
  conHora,
  crearEvento,
  cuandoDe,
  hijasDe,
  sinEvento,
  type SesionEvento,
} from '@/lib/sesionfotos/evento'
import { DISPARADORES, DISPARADOR_LABEL, esDisparador, type Disparador } from '@/lib/solicitudes/disparador'
import { resumenDeModelo } from '@/lib/sesionfotos/modelo'
import type { Solicitud } from '@/lib/sesionfotos/tipos'

/**
 * Las SESIONES planificadas: el evento como padre de las solicitudes (Fase 2 del octavo).
 *
 * Lo pidió Bruno el 3-sep-2026: *«sesión de fotos es un evento […] con modelo, fecha, hora, tiempo
 * aproximado. Dentro de la misma además tiene que poder solicitarse varias solicitudes de
 * productos»*. Hasta hoy la solicitud **era** la sesión, 1 a 1.
 *
 * 🔑 **Este bloque lo dibuja SÓLO Sesión de fotos.** Solicitudes internas comparte el motor de UI
 * (`SolicitudesInner`) y ⛔ no le pasa eventos, así que no le aparece nada — que es la objeción que
 * el propio Bruno levantó: *«el motor es de administración, habría que ver si no hay problema»*.
 *
 * ⛔ **Crear un evento ⛔ no siembra nada en la Agenda todavía** (Fase 5) y ⛔ no toca Gestión Nube:
 * un evento es cuándo y con quién, ⛔ no un retiro de mercadería.
 */
export function Eventos({
  eventos,
  solicitudes,
  editable,
  usuario,
  persistir,
  onPedirProductos,
  onVerSolicitud,
}: {
  eventos: SesionEvento[]
  solicitudes: Solicitud[]
  editable: boolean
  usuario: string
  persistir: (mutar: (l: SesionEvento[]) => SesionEvento[]) => Promise<boolean>
  /** Abre el borrador de una solicitud ya colgada de este evento. */
  onPedirProductos: (eventoId: string) => void
  onVerSolicitud: (id: string) => void
}) {
  const { avisar, confirmar } = useConfirmar()
  const [creando, setCreando] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)

  const guardar = (e: SesionEvento) => persistir((l) => conEvento(l, e))

  const onEliminar = async (e: SesionEvento) => {
    const bloqueo = bloqueoEliminarEvento(e, solicitudes)
    if (bloqueo) {
      await avisar({ titulo: 'No se puede eliminar', mensaje: bloqueo })
      return
    }
    const ok = await confirmar({
      titulo: 'Eliminar la sesión',
      tono: 'danger',
      ok: 'Eliminar',
      mensaje: `Se elimina la sesión "${e.descripcion || e.fecha}" de la lista. No hay papelera.`,
    })
    if (ok) persistir((l) => sinEvento(l, e.id))
  }

  const planificadas = eventos.filter((e) => e.estado === 'planificado')
  const cerradas = eventos.filter((e) => e.estado === 'cerrado')

  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: 9, padding: '10px 12px', margin: '10px 0', background: color.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>
          Sesiones planificadas{planificadas.length ? ` (${planificadas.length})` : ''}{' '}
          <InfoPopover titulo="La sesión y sus pedidos">
            Una sesión de fotos es un evento: cuándo es, cuánto dura y quién es la modelo. Los pedidos de
            productos se le cuelgan adentro y pueden ser varios — por ejemplo, uno de Zattia y otro de
            Stunned, que son dos solicitudes porque el catálogo se corta por línea. Una solicitud
            pedida desde acá queda enganchada a la sesión; la que se pide con «Nueva solicitud» queda
            suelta, como siempre.
          </InfoPopover>
        </div>
        {editable ? (
          <Button size="sm" variant={creando ? 'outline' : 'solid'} onClick={() => setCreando((v) => !v)}>
            {creando ? 'Cancelar' : '+ Nueva sesión'}
          </Button>
        ) : null}
      </div>

      {creando ? (
        <FormNueva
          usuario={usuario}
          onCancelar={() => setCreando(false)}
          onCrear={async (e) => {
            const ok = await guardar(e)
            if (ok) {
              setCreando(false)
              setAbierto(e.id)
            }
          }}
        />
      ) : null}

      {!planificadas.length && !creando ? (
        <div style={{ fontSize: 12, color: color.mut2 }}>
          Todavía no hay ninguna sesión planificada. Las solicitudes sueltas de abajo siguen andando igual.
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {planificadas.map((e) => (
          <FilaEvento
            key={e.id}
            e={e}
            hijas={hijasDe(solicitudes, e.id)}
            editable={editable}
            usuario={usuario}
            abierto={abierto === e.id}
            onAbrir={() => setAbierto((a) => (a === e.id ? null : e.id))}
            onGuardar={guardar}
            onEliminar={() => onEliminar(e)}
            onPedirProductos={() => onPedirProductos(e.id)}
            onVerSolicitud={onVerSolicitud}
          />
        ))}
      </div>

      {cerradas.length ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: color.mut2, cursor: 'pointer' }}>{cerradas.length} cerradas</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {cerradas.map((e) => (
              <FilaEvento
                key={e.id}
                e={e}
                hijas={hijasDe(solicitudes, e.id)}
                editable={editable}
                usuario={usuario}
                abierto={abierto === e.id}
                onAbrir={() => setAbierto((a) => (a === e.id ? null : e.id))}
                onGuardar={guardar}
                onEliminar={() => onEliminar(e)}
                onPedirProductos={() => onPedirProductos(e.id)}
                onVerSolicitud={onVerSolicitud}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}

/** El alta: lo mínimo para que la sesión exista. Lo demás se completa adentro. */
function FormNueva({ usuario, onCrear, onCancelar }: { usuario: string; onCrear: (e: SesionEvento) => void; onCancelar: () => void }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [hora, setHora] = useState('')
  const [duracion, setDuracion] = useState('')
  const [desc, setDesc] = useState('')
  const [disparador, setDisparador] = useState<string>('')

  return (
    <div style={{ border: `1px solid ${color.brandBorder}`, background: color.brandBg, borderRadius: 8, padding: '8px 10px', margin: '6px 0 10px' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Día">
          <Input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} style={{ width: 150 }} />
        </Field>
        <Field label="Hora" hint="Si todavía no se sabe, dejala vacía.">
          <Input type="time" value={hora} onChange={(ev) => setHora(ev.target.value)} style={{ width: 110 }} />
        </Field>
        <Field label="Dura (min)" hint="El tiempo aproximado.">
          <Input type="number" min={1} value={duracion} onChange={(ev) => setDuracion(ev.target.value)} style={{ width: 100 }} placeholder="90" />
        </Field>
        <Field label="Para qué es">
          <Input value={desc} onChange={(ev) => setDesc(ev.target.value)} style={{ width: 200 }} placeholder="Primavera-verano" />
        </Field>
        <Field label="De dónde viene">
          <Select value={disparador} onChange={(ev) => setDisparador(ev.target.value)} style={{ width: 160 }}>
            <option value="">Sin definir</option>
            {DISPARADORES.map((d) => (
              <option key={d} value={d}>
                {DISPARADOR_LABEL[d]}
              </option>
            ))}
          </Select>
        </Field>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
          <Button
            size="sm"
            disabled={!fecha}
            onClick={() =>
              onCrear(
                crearEvento({
                  id: 'ev' + Date.now() + '_' + Math.floor(Math.random() * 100000),
                  fecha,
                  creado: Date.now(),
                  creadoPor: usuario,
                  hora,
                  duracionMin: Number(duracion),
                  descripcion: desc,
                  disparador: esDisparador(disparador) ? disparador : null,
                }),
              )
            }
          >
            Crear
          </Button>
          <Button size="sm" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: color.mut, marginTop: 6 }}>
        La modelo se elige después, adentro de la sesión. Lo que no se sabe todavía se deja vacío: ⛔ no
        se guarda una hora inventada.
      </div>
    </div>
  )
}

/** Una sesión en la lista: cuándo es, quién es la modelo, y sus pedidos. */
function FilaEvento({
  e,
  hijas,
  editable,
  usuario,
  abierto,
  onAbrir,
  onGuardar,
  onEliminar,
  onPedirProductos,
  onVerSolicitud,
}: {
  e: SesionEvento
  hijas: Solicitud[]
  editable: boolean
  usuario: string
  abierto: boolean
  onAbrir: () => void
  onGuardar: (e: SesionEvento) => void
  onEliminar: () => void
  onPedirProductos: () => void
  onVerSolicitud: (id: string) => void
}) {
  return (
    <div style={{ border: `1px solid ${color.line}`, background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {e.descripcion || 'Sesión sin nombre'}{' '}
            {e.disparador ? (
              <Badge tone="brand" subtle>
                {DISPARADOR_LABEL[e.disparador as Disparador]}
              </Badge>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: color.mut2 }}>
            📅 {cuandoDe(e)}
            {e.modelo ? ` · 👗 ${resumenDeModelo(e.modelo)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: hijas.length ? color.ink2 : color.mut }}>
            {hijas.length === 0 ? 'sin pedidos' : hijas.length === 1 ? '1 pedido' : `${hijas.length} pedidos`}
          </span>
          {editable ? (
            <Button size="sm" variant="outline" onClick={onPedirProductos}>
              + Pedir productos
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onAbrir}>
            {abierto ? 'Cerrar' : 'Abrir'}
          </Button>
        </div>
      </div>

      {hijas.length ? (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {hijas.map((h) => (
            <button
              key={h.id}
              onClick={() => onVerSolicitud(h.id)}
              style={{ fontSize: 11, border: `1px solid ${color.line}`, background: color.bg, borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}
              title="Abrir la solicitud"
            >
              {h.descripcion || h.id} · {h.items.length} ít. · {h.estado}
            </button>
          ))}
        </div>
      ) : null}

      {abierto ? (
        <div style={{ marginTop: 8, borderTop: `1px solid ${color.bg2}`, paddingTop: 8 }}>
          {editable ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="Día">
                <Input type="date" value={e.fecha} onChange={(ev) => onGuardar(conFechaEvento(e, ev.target.value))} style={{ width: 150 }} />
              </Field>
              <Field label="Hora">
                <Input type="time" value={e.hora || ''} onChange={(ev) => onGuardar(conHora(e, ev.target.value))} style={{ width: 110 }} />
              </Field>
              <Field label="Dura (min)">
                <Input
                  type="number"
                  min={1}
                  value={e.duracionMin ?? ''}
                  onChange={(ev) => onGuardar(conDuracion(e, ev.target.value))}
                  style={{ width: 100 }}
                  placeholder="90"
                />
              </Field>
              <Field label="Para qué es">
                <Input value={e.descripcion} onChange={(ev) => onGuardar(conDescripcionEvento(e, ev.target.value))} style={{ width: 200 }} />
              </Field>
              <Field label="De dónde viene">
                <Select
                  value={e.disparador || ''}
                  onChange={(ev) => onGuardar(conDisparadorEvento(e, esDisparador(ev.target.value) ? ev.target.value : null))}
                  style={{ width: 160 }}
                >
                  <option value="">Sin definir</option>
                  {DISPARADORES.map((d) => (
                    <option key={d} value={d}>
                      {DISPARADOR_LABEL[d]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          {/* 🔑 La MISMA ficha de la solicitud, ⛔ no una copia. Sin talles sugeridos: el evento
              todavía no tiene ninguna prenda en la mano, y una lista fija impondría un alfabeto. */}
          <FichaModelo s={e} talles={[]} editable={editable} usuario={usuario} setWork={(f) => onGuardar(f(e))} />

          {hijas.length ? (
            <div style={{ fontSize: 11, color: color.mut, marginTop: 2 }}>
              ⚠️ Cambiar el día acá ⛔ no le cambia la fecha a los {hijas.length === 1 ? 'pedido ya hecho' : `${hijas.length} pedidos ya hechos`}: esa se
              corrige en cada uno.
            </div>
          ) : null}

          {editable ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <Button size="sm" variant="outline" onClick={() => onGuardar(conEstadoEvento(e, e.estado === 'cerrado' ? 'planificado' : 'cerrado'))}>
                {e.estado === 'cerrado' ? 'Volver a abrir' : 'Marcar como hecha'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onEliminar}>
                Eliminar
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const hoyISO = () => new Date().toISOString().slice(0, 10)
