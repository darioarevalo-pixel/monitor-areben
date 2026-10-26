'use client'

/**
 * **Reserva**: tareas guardadas para después, sin dueño (Darío, 25-oct-2026). Cuando hay varias cosas
 * y el equipo está ocupado, se anotan acá y se asignan cuando alguien se libera.
 *
 * Es un `ItemAgenda` apagado con `reserva: true`: no entra en «Hoy», ni en el correo, ni avisa. Al
 * asignarla se prende, toma persona y fecha, y el servidor le manda el aviso como a una tarea nueva.
 * La barra vive arriba de «Equipo» y la lista se abre en una ventana: en el celular una tarjeta al
 * final de la pantalla quedaba escondida.
 */

import { useState } from 'react'
import { Button, Field, Input, Modal, Notice, color, font, space, useConfirmar, useToast } from '@/components/ui'
import { hoyIso, type ItemAgenda } from '@/lib/agenda'
import { sumarDias } from '@/lib/calendario'
import { EQUIPO_AGENDA } from '@/lib/agenda/equipo'
import { borrarItem, guardarItem } from '@/lib/agenda/cliente'
import { useAgenda } from '@/store/useAgenda'
import { Tilde } from './EditorRegla'
import { MiniaturasFotos } from './FotosTarea'

type Cuando = 'hoy' | 'manana' | 'otro'

export function BarraReserva() {
  const { items } = useAgenda()
  const reservadas = items.filter((i) => i.reserva)
  const [abierta, setAbierta] = useState(false)
  if (!reservadas.length) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          padding: `${space[3]}px ${space[4]}px`, borderRadius: 12, cursor: 'pointer',
          border: `1px solid ${color.line2}`, background: 'transparent', color: color.ink,
          fontSize: font.base, fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span>📥 Reserva · {reservadas.length} {reservadas.length === 1 ? 'guardada' : 'guardadas'}</span>
        <span aria-hidden>›</span>
      </button>
      {abierta && <ListaReserva reservadas={reservadas} onCerrar={() => setAbierta(false)} />}
    </>
  )
}

function ListaReserva({ reservadas, onCerrar }: { reservadas: ItemAgenda[]; onCerrar: () => void }) {
  const { cargar } = useAgenda()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [asignando, setAsignando] = useState<ItemAgenda | null>(null)

  const eliminar = async (i: ItemAgenda) => {
    const ok = await confirmar({ titulo: 'Eliminar la tarea', mensaje: i.titulo, ok: 'Eliminar', tono: 'danger' })
    if (!ok) return
    try {
      await borrarItem(i.id)
      await cargar()
      toast.ok('Tarea eliminada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Reserva" pie={<Button variant="soft" tone="neutral" onClick={onCerrar}>Cerrar</Button>}>
      <div style={{ display: 'grid', gap: space[3] }}>
        {reservadas.length === 0 && <Notice tone="neutral">No queda nada guardado.</Notice>}
        {reservadas.map((i) => (
          <div key={i.id} style={{ border: `1px solid ${color.line2}`, borderRadius: 12, padding: space[3], display: 'grid', gap: space[2] }}>
            <div style={{ fontWeight: 600 }}>{i.titulo}</div>
            {i.cuerpo && <div style={{ fontSize: font.sm, color: color.ink2 }}>{i.cuerpo}</div>}
            {!!i.fotos?.length && <MiniaturasFotos fotos={i.fotos} />}
            <div style={{ display: 'flex', gap: space[2] }}>
              <Button variant="solid" tone="brand" onClick={() => setAsignando(i)}>Asignar</Button>
              <Button variant="soft" tone="neutral" onClick={() => eliminar(i)}>Eliminar</Button>
            </div>
          </div>
        ))}
      </div>
      {asignando && (
        <ModalAsignar
          item={asignando}
          onCerrar={() => setAsignando(null)}
          onListo={async () => {
            setAsignando(null)
            await cargar()
          }}
        />
      )}
    </Modal>
  )
}

function ModalAsignar({ item, onCerrar, onListo }: { item: ItemAgenda; onCerrar: () => void; onListo: () => Promise<void> }) {
  const toast = useToast()
  const hoy = hoyIso()
  const [para, setPara] = useState<string[]>([])
  const [cuando, setCuando] = useState<Cuando>('hoy')
  const [otra, setOtra] = useState(sumarDias(hoy, 2))
  const [guardando, setGuardando] = useState(false)
  const fecha = cuando === 'hoy' ? hoy : cuando === 'manana' ? sumarDias(hoy, 1) : otra
  const listo = para.length > 0 && fecha >= hoy

  const asignar = async () => {
    if (!listo) return
    setGuardando(true)
    try {
      await guardarItem({
        ...item,
        reserva: false,
        activo: true,
        regla: { tipo: 'unica', fecha },
        destino: { tipo: 'personas', personas: para },
        arrastra: true,
      })
      toast.ok('Tarea asignada.')
      await onListo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo asignar.')
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Asignar"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="soft" tone="neutral" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" tone="brand" onClick={asignar} disabled={!listo || guardando}>{guardando ? 'Asignando…' : 'Asignar'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[4] }}>
        <div style={{ fontWeight: 600 }}>{item.titulo}</div>
        <Field label="Asignar a" required>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            {EQUIPO_AGENDA.map((p) => (
              <Tilde
                key={p.name}
                puesto={para.includes(p.name)}
                label={p.nombre.split(' ')[0]}
                onToggle={() => setPara((xs) => (xs.includes(p.name) ? xs.filter((x) => x !== p.name) : [...xs, p.name]))}
              />
            ))}
          </div>
        </Field>
        <Field label="Fecha">
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
            <Tilde puesto={cuando === 'hoy'} label="Hoy" onToggle={() => setCuando('hoy')} />
            <Tilde puesto={cuando === 'manana'} label="Mañana" onToggle={() => setCuando('manana')} />
            <Tilde puesto={cuando === 'otro'} label="Otro día" onToggle={() => setCuando('otro')} />
            {cuando === 'otro' && <Input type="date" value={otra} min={hoy} onChange={(e) => setOtra(e.target.value)} style={{ width: 170 }} />}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
