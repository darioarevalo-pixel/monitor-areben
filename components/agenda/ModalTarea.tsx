'use client'

/**
 * **+ Tarea**: mandarle una tarea a alguien, en el momento (Darío, 19-oct-2026, la maqueta).
 *
 * Es un `ItemAgenda` como cualquier otro —`pendiente`, `unica`, dirigido a personas— armado con
 * cinco campos y nada más: Tarea, Descripción, Fotos, Asignar a y Fecha. Nace **arrastrando**: si no
 * se hace ese día, al otro le aparece como atrasada. Para todo lo demás (rutinas, avisos, marcas,
 * manual) está el formulario completo de «Tareas fijas».
 */

import { useState } from 'react'
import { Button, Field, Input, Modal, Notice, color, font, space } from '@/components/ui'
import { hoyIso, type ItemAgenda } from '@/lib/agenda'
import { sumarDias } from '@/lib/calendario'
import { EQUIPO_AGENDA } from '@/lib/agenda/equipo'
import { mejorarDescripcion } from '@/lib/agenda/cliente'
import { Tilde } from './EditorRegla'
import { EditorFotos } from './FotosTarea'
import { itemVacio } from './ModalItem'

type Cuando = 'hoy' | 'manana' | 'otro'

export function ModalTarea({
  para: paraInicial = [],
  onCerrar,
  onGuardar,
}: {
  para?: string[]
  onCerrar: () => void
  onGuardar: (i: ItemAgenda) => Promise<void>
}) {
  const hoy = hoyIso()
  const [titulo, setTitulo] = useState('')
  const [desc, setDesc] = useState('')
  const [fotos, setFotos] = useState<string[]>([])
  const [importante, setImportante] = useState(false)
  const [para, setPara] = useState<string[]>(paraInicial)
  const [cuando, setCuando] = useState<Cuando>('hoy')
  const [otra, setOtra] = useState(sumarDias(hoy, 2))
  const [reserva, setReserva] = useState(false)
  // ✨ La propuesta de la IA: se muestra aparte y ⛔ no pisa lo escrito hasta que se aplica.
  const [propuesta, setPropuesta] = useState<string | null>(null)
  const [ordenando, setOrdenando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fecha = cuando === 'hoy' ? hoy : cuando === 'manana' ? sumarDias(hoy, 1) : otra
  const listo = titulo.trim() && (reserva || (para.length && fecha >= hoy))

  const ordenar = async () => {
    setOrdenando(true)
    setError(null)
    try {
      setPropuesta(await mejorarDescripcion(desc))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo ordenar la descripción.')
    }
    setOrdenando(false)
  }

  const guardar = async () => {
    if (!listo) return
    setGuardando(true)
    setError(null)
    try {
      await onGuardar({
        ...itemVacio('pendiente'),
        titulo: titulo.trim(),
        cuerpo: desc.trim() || null,
        fotos,
        regla: { tipo: 'unica', fecha },
        destino: reserva ? { tipo: 'todos' } : { tipo: 'personas', personas: para },
        arrastra: true,
        importante,
        // 📥 Guardada para después: apagada y sin dueño hasta que se asigne desde Equipo › Reserva.
        ...(reserva ? { reserva: true, activo: false } : {}),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Nueva tarea"
      cerrarConFondo={false}
      alTeclado
      pie={
        <>
          <Button variant="soft" tone="neutral" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" tone="brand" onClick={guardar} disabled={!listo || guardando}>{guardando ? 'Guardando…' : reserva ? 'Guardar' : 'Asignar'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[4] }}>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Tarea" required>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Contar el estante B3" autoFocus />
        </Field>
        <Field label="Descripción (opcional)">
          <textarea
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setPropuesta(null) }}
            rows={3}
            placeholder="Instrucciones, ubicación, detalles"
            style={{
              width: '100%', padding: space[2], borderRadius: 8,
              border: `1px solid ${color.line2}`, fontSize: font.base, fontFamily: 'inherit',
              background: 'transparent', color: color.ink, resize: 'vertical',
            }}
          />
          {desc.trim().length >= 8 && !propuesta && (
            <div style={{ marginTop: space[2] }}>
              <Button variant="soft" tone="brand" onClick={ordenar} disabled={ordenando}>{ordenando ? 'Ordenando…' : '✨ Ordenar con IA'}</Button>
            </div>
          )}
          {propuesta && (
            <div style={{ marginTop: space[2], border: `1px solid ${color.line2}`, borderRadius: 10, padding: space[3], display: 'grid', gap: space[2] }}>
              <div style={{ fontSize: font.sm, color: color.ink2 }}>Así quedaría</div>
              <div style={{ whiteSpace: 'pre-wrap', color: color.ink }}>{propuesta}</div>
              <div style={{ display: 'flex', gap: space[2] }}>
                <Button variant="solid" tone="brand" onClick={() => { setDesc(propuesta); setPropuesta(null) }}>Confirmar</Button>
                <Button variant="soft" tone="neutral" onClick={() => setPropuesta(null)}>Descartar</Button>
              </div>
            </div>
          )}
        </Field>
        <Field label="Fotos (opcional)">
          <EditorFotos fotos={fotos} onChange={setFotos} />
        </Field>
        <Field label="Asignar a" required>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            {EQUIPO_AGENDA.map((p) => (
              <Tilde
                key={p.name}
                puesto={para.includes(p.name)}
                label={p.nombre.split(' ')[0]}
                onToggle={() => { setReserva(false); setPara((xs) => (xs.includes(p.name) ? xs.filter((x) => x !== p.name) : [...xs, p.name])) }}
              />
            ))}
            <Tilde puesto={reserva} label="📥 Guardar para después" onToggle={() => { setReserva((x) => !x); setPara([]) }} />
          </div>
        </Field>
        {!reserva && <Field label="Fecha">
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
            <Tilde puesto={cuando === 'hoy'} label="Hoy" onToggle={() => setCuando('hoy')} />
            <Tilde puesto={cuando === 'manana'} label="Mañana" onToggle={() => setCuando('manana')} />
            <Tilde puesto={cuando === 'otro'} label="Otro día" onToggle={() => setCuando('otro')} />
            {cuando === 'otro' && (
              <Input type="date" value={otra} min={hoy} onChange={(e) => setOtra(e.target.value)} style={{ width: 170 }} />
            )}
          </div>
        </Field>}
        <Tilde puesto={importante} label="⭐ Importante: avisarme cuando la termine" onToggle={() => setImportante((x) => !x)} />
      </div>
    </Modal>
  )
}
