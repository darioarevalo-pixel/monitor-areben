'use client'

/**
 * "📩 Mensajes de clientes" (key `buzon`).
 *
 * # Qué problema resuelve, dicho como pasa
 *
 * Entra un mail el domingo pidiendo cambiar un talle. Nadie abre la casilla. El lunes a las 9 se
 * arma el paquete y sale con lo que la clienta ya había pedido cambiar. El mail existía, la orden
 * existía, y no había ningún lugar donde las dos cosas se tocaran.
 *
 * 🔑 **Esta pantalla no es el lugar donde el problema se arregla: es el lugar donde el dato existe.**
 * El arreglo está en Envíos, que pregunta antes de dejar avanzar un paquete cuya orden tiene un
 * mensaje sin resolver (ver `lib/buzon/core.ts`). Por eso lo único que esta pantalla tiene que hacer
 * muy bien es **atar el mensaje a un número de orden** — sin eso, la fila es una nota que no frena
 * nada.
 *
 * ⛔ **No es Reclamos y Cambios**, que está frenado y contesta otra pregunta: ahí vive el proceso de
 * una devolución ya aceptada. Acá la unidad de medida es el tiempo.
 */

import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Esqueleto,
  Field,
  Input,
  MarcaChip,
  Modal,
  Notice,
  StatusPill,
  Tabs,
  color,
  font,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'
import { aInputLocal, desdeInputLocal, haceCuanto, ordenarBandeja } from '@/lib/buzon/core'
import { atarAOrden, borrarMensaje, guardarMensaje, reabrirMensaje, resolverMensaje } from '@/lib/buzon/cliente'
import type { MensajeBuzon } from '@/lib/buzon/tipos'
import { useBuzon } from './useBuzon'

/** El `<textarea>` del kit: misma forma que un Input, con alto propio. Igual que en Atención. */
function AreaTexto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="mo-input mo-input--multi" style={{ width: '100%', boxSizing: 'border-box' }} {...props} />
}

type Borrador = { orden_numero: string; remitente: string; asunto: string; cuerpo: string; recibido_en: string }

const vacio = (): Borrador => ({
  orden_numero: '',
  remitente: '',
  asunto: '',
  cuerpo: '',
  // La hora de ahora, no la del mail: quien carga a mano suele estar leyendo un mail viejo y tiene
  // que poder corregirla. Arranca en algo válido para que el camino corto no pida tocar la fecha.
  recibido_en: aInputLocal(new Date()),
})

export function Buzon() {
  const { marca } = useSesion()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [pestania, setPestania] = useState<'abiertos' | 'todos'>('abiertos')
  const { mensajes, ahora, cargando, error, recargar } = useBuzon()

  const [form, setForm] = useState<Borrador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [resolviendo, setResolviendo] = useState<MensajeBuzon | null>(null)
  const [accion, setAccion] = useState('')

  const abiertos = useMemo(() => mensajes.filter((m) => !m.resuelto), [mensajes])
  const lista = useMemo(
    () => ordenarBandeja(pestania === 'abiertos' ? abiertos : mensajes),
    [mensajes, abiertos, pestania],
  )
  // Los que nadie ató a una orden. Se cuentan aparte porque son los que **no frenan nada**: es la
  // única forma de que "hay 4 mensajes abiertos" no se lea como "hay 4 paquetes protegidos".
  const sinOrden = useMemo(() => abiertos.filter((m) => !m.orden_numero).length, [abiertos])

  async function guardar() {
    if (!form) return
    if (!form.cuerpo.trim()) return toast.error('Falta lo que escribió la clienta.')
    if (!marca) return toast.error('Elegí una marca en el encabezado.')
    setGuardando(true)
    try {
      await guardarMensaje({
        store: marca,
        orden_numero: form.orden_numero || null,
        remitente: form.remitente || null,
        asunto: form.asunto || null,
        cuerpo: form.cuerpo,
        recibido_en: desdeInputLocal(form.recibido_en),
        origen: 'a_mano',
      })
      setForm(null)
      await recargar()
      toast.ok(form.orden_numero ? 'Cargado. La fila de Envíos ya lo muestra.' : 'Cargado. Sin número de orden no frena ningún despacho.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function resolver() {
    if (!resolviendo) return
    if (!accion.trim()) return toast.error('Contá en una línea qué se hizo.')
    try {
      await resolverMensaje(resolviendo.id, accion)
      setResolviendo(null)
      setAccion('')
      await recargar()
      toast.ok('Resuelto. Envíos deja de preguntar por esta orden.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo resolver.')
    }
  }

  async function reabrir(m: MensajeBuzon) {
    try {
      await reabrirMensaje(m.id)
      await recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo reabrir.')
    }
  }

  async function borrar(m: MensajeBuzon) {
    const ok = await confirmar({
      titulo: '¿Borrar este mensaje?',
      mensaje: `${m.remitente || 'Sin remitente'} · ${m.asunto || m.cuerpo.slice(0, 80)}`,
      ok: 'Borrarlo',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarMensaje(m.id)
      await recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
  }

  async function atar(m: MensajeBuzon, valor: string) {
    try {
      const { orden_numero } = await atarAOrden(m.id, valor || null)
      await recargar()
      toast.ok(orden_numero ? `Atado a la orden #${orden_numero}.` : 'Quedó sin orden: no frena ningún despacho.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo atar a la orden.')
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      <HeaderAcciones>
        <Button variant="solid" tone="brand" onClick={() => setForm(vacio())}>
          Cargar un mensaje
        </Button>
      </HeaderAcciones>

      <Notice tone="action">
        Lo que la clienta escribió y todavía no se resolvió. Mientras un mensaje esté abierto,{' '}
        <strong>Envíos avisa antes de dejar avanzar el paquete de esa orden</strong> — por eso lo que hay
        que cargar sí o sí es el número de orden.
      </Notice>

      {error && <Notice tone="danger">{error}</Notice>}

      {/* 🔴 El cartel de los que no frenan nada. Un mensaje sin orden se guarda bien, se ve bien, y
          no protege ningún paquete: sin decirlo, la bandeja llena se lee como "está todo cubierto". */}
      {sinOrden > 0 && (
        <Notice tone="warning">
          {sinOrden === 1 ? 'Hay 1 mensaje abierto sin número de orden' : `Hay ${sinOrden} mensajes abiertos sin número de orden`}: ésos{' '}
          <strong>no frenan ningún despacho</strong>. Poneles el número desde la fila.
        </Notice>
      )}

      <Tabs
        value={pestania}
        onChange={(k) => setPestania(k as 'abiertos' | 'todos')}
        items={[
          { key: 'abiertos', label: 'Sin resolver', badge: abiertos.length || undefined, hint: 'Lo que todavía puede frenar un despacho.' },
          { key: 'todos', label: 'Todos', hint: 'Incluye los resueltos, con quién los resolvió y qué hizo.' },
        ]}
      />

      {cargando ? (
        <Esqueleto />
      ) : !lista.length ? (
        <EmptyState
          icon="📩"
          title={pestania === 'abiertos' ? 'No hay mensajes sin resolver' : 'Todavía no se cargó ningún mensaje'}
          hint="Cuando llegue un mail pidiendo un cambio, cargalo acá con el número de orden: Envíos avisa antes de que el paquete salga."
        />
      ) : (
        <div style={{ display: 'grid', gap: space[3] }}>
          {lista.map((m) => (
            <Tarjeta
              key={m.id}
              mensaje={m}
              ahora={ahora}
              onResolver={() => {
                setResolviendo(m)
                setAccion('')
              }}
              onReabrir={() => void reabrir(m)}
              onBorrar={() => void borrar(m)}
              onAtar={(v) => void atar(m, v)}
            />
          ))}
        </div>
      )}

      {form && (
        <Modal abierto titulo="Cargar un mensaje de una clienta" onCerrar={() => setForm(null)} cerrarConFondo={false}>
          <div style={{ display: 'grid', gap: space[4] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.sm, color: color.mut }}>
              Marca: <MarcaChip marca={marca || 'bdi'} /> — sale del encabezado.
            </div>
            <Field label="Número de orden" hint="El de Tienda Nube. Sin esto el mensaje no frena ningún despacho.">
              <Input
                value={form.orden_numero}
                onChange={(e) => setForm({ ...form, orden_numero: e.target.value })}
                placeholder="1234"
                autoFocus
              />
            </Field>
            <Field label="Quién escribió" hint="El mail o el nombre, como venga.">
              <Input value={form.remitente} onChange={(e) => setForm({ ...form, remitente: e.target.value })} placeholder="ana@mail.com" />
            </Field>
            <Field label="Asunto">
              <Input value={form.asunto} onChange={(e) => setForm({ ...form, asunto: e.target.value })} placeholder="Cambio de talle" />
            </Field>
            <Field label="Qué escribió">
              <AreaTexto value={form.cuerpo} onChange={(e) => setForm({ ...form, cuerpo: e.target.value })} rows={5} />
            </Field>
            {/* 🔑 La fecha es la del MAIL, no la de la carga. Un mail del domingo cargado el martes
                sigue siendo del domingo, y "hace 2 días" es justamente el número que hace que
                alguien lo mire. */}
            <Field label="Cuándo lo escribió" hint="La fecha del mail, no la de hoy.">
              <Input type="datetime-local" value={form.recibido_en} onChange={(e) => setForm({ ...form, recibido_en: e.target.value })} />
            </Field>
            <div style={{ display: 'flex', gap: space[3], justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button variant="solid" tone="brand" disabled={guardando} onClick={() => void guardar()}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {resolviendo && (
        <Modal abierto titulo="¿Qué se hizo con este mensaje?" onCerrar={() => setResolviendo(null)}>
          <div style={{ display: 'grid', gap: space[4] }}>
            <div style={{ fontSize: font.sm, color: color.mut }}>
              {resolviendo.asunto || resolviendo.cuerpo.slice(0, 120)}
            </div>
            {/* Se pide y no es opcional: "resuelto" a secas no le dice nada a quien lo lee el martes,
                y es lo único que queda cuando el paquete ya salió. */}
            <Field label="En una línea" hint="Ej.: «se cambió el talle antes de armar el paquete» o «se le avisó que ya había salido».">
              <Input value={accion} onChange={(e) => setAccion(e.target.value)} autoFocus />
            </Field>
            <div style={{ display: 'flex', gap: space[3], justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setResolviendo(null)}>
                Cancelar
              </Button>
              <Button variant="solid" tone="success" onClick={() => void resolver()}>
                Marcar resuelto
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Una fila de la bandeja. El número de orden se edita en el lugar: es el dato que enciende el freno. */
function Tarjeta({
  mensaje,
  ahora,
  onResolver,
  onReabrir,
  onBorrar,
  onAtar,
}: {
  mensaje: MensajeBuzon
  ahora: number
  onResolver: () => void
  onReabrir: () => void
  onBorrar: () => void
  onAtar: (v: string) => void
}) {
  const [orden, setOrden] = useState(mensaje.orden_numero || '')
  const espera = haceCuanto(mensaje.recibido_en, ahora)

  return (
    <Card>
      <div style={{ display: 'flex', gap: space[3], justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <MarcaChip marca={mensaje.store} />
          {mensaje.resuelto ? (
            <StatusPill tone="success" label="RESUELTO" />
          ) : (
            <StatusPill tone="danger" label="SIN RESOLVER" />
          )}
          {mensaje.origen === 'mail' ? <Badge>del mail</Badge> : <Badge>a mano</Badge>}
          <strong>{mensaje.asunto || '(sin asunto)'}</strong>
        </div>
        <div style={{ fontSize: font.sm, color: color.mut }}>{espera || mensaje.recibido_en}</div>
      </div>

      <div style={{ marginTop: space[2], whiteSpace: 'pre-wrap' }}>{mensaje.cuerpo}</div>

      <div style={{ marginTop: space[2], fontSize: font.sm, color: color.mut }}>
        {mensaje.remitente || 'Sin remitente'}
      </div>

      {mensaje.resuelto ? (
        <div style={{ marginTop: space[3], fontSize: font.sm, color: color.mut }}>
          {mensaje.accion} — {mensaje.resuelto_por || 'alguien'}
        </div>
      ) : null}

      <div style={{ marginTop: space[3], display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Orden">
          <Input
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            onBlur={() => {
              if ((orden || '') !== (mensaje.orden_numero || '')) onAtar(orden)
            }}
            placeholder="sin orden"
            style={{ width: 120 }}
          />
        </Field>
        {mensaje.resuelto ? (
          <Button size="sm" variant="outline" onClick={onReabrir}>
            Reabrir
          </Button>
        ) : (
          <Button size="sm" variant="solid" tone="success" onClick={onResolver}>
            Resolver
          </Button>
        )}
        <Button size="sm" variant="ghost" tone="danger" onClick={onBorrar}>
          Borrar
        </Button>
      </div>
    </Card>
  )
}
