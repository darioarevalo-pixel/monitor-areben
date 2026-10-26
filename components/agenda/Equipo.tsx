'use client'

/**
 * **Equipo** — cómo va cada una hoy, y el **+ Tarea** a la vista (Darío, 19-oct-2026, la maqueta).
 *
 * Una tarjeta por persona: estado, «x de y», la barra y la hora del último tilde. Al tocarla se abre
 * lo suyo de hoy, igual que lo ve ella. Las cuentas salen de `lib/agenda/equipo.ts`, que usa la misma
 * función que su «Hoy» y las mismas personas que el correo de la noche.
 *
 * ⚠️ «Última» es el último TILDE, ⛔ no la última vez que entró: el Monitor no guarda las entradas.
 */

import { useMemo, useState } from 'react'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, ButtonLink, Card, StatusPill, color, font, space, weight, useConfirmar, useToast } from '@/components/ui'
import { hoyIso, type ItemAgenda } from '@/lib/agenda'
import { avanceDelEquipo, type EstadoEquipo, type FilaEquipo } from '@/lib/agenda/equipo'
import { borrarItem, guardarItem } from '@/lib/agenda/cliente'
import { rotuloFecha } from '@/lib/fechas/semana'
import { useAgenda } from '@/store/useAgenda'
import { MiniaturasFotos } from './FotosTarea'
import { ModalTarea } from './ModalTarea'
import { BarraReserva } from './Reserva'

const ESTADO: Record<EstadoEquipo, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  'al-dia': { label: 'Al día', tone: 'success' },
  'a-medias': { label: 'A medias', tone: 'warning' },
  nada: { label: 'Sin marcar', tone: 'danger' },
  'sin-tareas': { label: 'Sin tareas', tone: 'neutral' },
}

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }) : null

export function Equipo() {
  const { items, hechos, cargar, puede } = useAgenda()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const hoy = hoyIso()
  const filas = useMemo(() => avanceDelEquipo(items, hechos, hoy), [items, hechos, hoy])
  const [abierta, setAbierta] = useState<string | null>(null)
  const [nueva, setNueva] = useState<string[] | null>(null)

  const onGuardar = async (i: ItemAgenda) => {
    await guardarItem(i)
    await cargar()
    setNueva(null)
    const quien = i.destino.tipo === 'personas' ? i.destino.personas : []
    if (i.reserva) return toast.ok('Guardada en la Reserva.')
    toast.ok(`Tarea asignada a ${filas.filter((f) => quien.includes(f.persona.name)).map((f) => f.persona.nombre.split(' ')[0]).join(', ')}.`)
  }

  const onEliminar = async (i: ItemAgenda) => {
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

  const cuenta = (k: EstadoEquipo) => filas.filter((f) => f.estado === k).length

  return (
    <>
      <HeaderAcciones>
        {puede.incidencias && <ButtonLink href="/agenda/incidencias" variant="soft" tone="neutral">⚠️ Incidencias</ButtonLink>}
        <Button variant="solid" tone="brand" onClick={() => setNueva([])}>+ Tarea</Button>
      </HeaderAcciones>

      <div style={{ display: 'grid', gap: space[3] }}>
        <BarraReserva />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {(Object.keys(ESTADO) as EstadoEquipo[]).filter((k) => cuenta(k)).map((k) => (
            <StatusPill key={k} tone={ESTADO[k].tone} label={`${cuenta(k)} ${ESTADO[k].label.toLowerCase()}`} />
          ))}
        </div>

        {filas.map((f) => (
          <Persona
            key={f.persona.name}
            f={f}
            abierta={abierta === f.persona.name}
            onAbrir={() => setAbierta((x) => (x === f.persona.name ? null : f.persona.name))}
            onTarea={() => setNueva([f.persona.name])}
            onEliminar={onEliminar}
          />
        ))}
      </div>

      {nueva && <ModalTarea para={nueva} onCerrar={() => setNueva(null)} onGuardar={onGuardar} />}
    </>
  )
}

function Persona({
  f, abierta, onAbrir, onTarea, onEliminar,
}: {
  f: FilaEquipo
  abierta: boolean
  onAbrir: () => void
  onTarea: () => void
  onEliminar: (i: ItemAgenda) => void
}) {
  const e = ESTADO[f.estado]
  const pct = f.total ? Math.round((f.hechas / f.total) * 100) : 0
  const ultima = hora(f.ultima)
  const iniciales = f.persona.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <Card style={{ padding: 0 }}>
      <button
        type="button"
        onClick={onAbrir}
        aria-expanded={abierta}
        style={{
          height: 'auto', width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left',
          display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: `4px ${space[3]}px`, alignItems: 'center',
          padding: space[3], color: color.ink,
        }}
      >
        <span style={{
          gridRow: 'span 2', width: 40, height: 40, borderRadius: 20, background: color.brandBg, color: color.brand,
          display: 'grid', placeItems: 'center', fontWeight: weight.bold, fontSize: font.sm,
        }}>{iniciales}</span>
        <span style={{ fontWeight: weight.semibold, fontSize: font.base }}>{f.persona.nombre}</span>
        <span style={{ display: 'flex', gap: space[2], alignItems: 'center', justifySelf: 'end' }}>
          {f.atrasadas > 0 && <StatusPill tone="warning" label={`${f.atrasadas} ${f.atrasadas === 1 ? 'atrasada' : 'atrasadas'}`} />}
          <StatusPill tone={e.tone} label={e.label} />
        </span>
        <span style={{ fontSize: font.sm, color: color.mut }}>
          {f.persona.lugar}{f.total ? ` · ${f.hechas} de ${f.total}` : ''}{ultima ? ` · última ${ultima}` : ''}
        </span>
        <span />
        {f.total > 0 && (
          <span style={{ gridColumn: '2 / 4', height: 6, borderRadius: 3, background: color.bg2, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: pct === 100 ? color.success : color.brandSolid }} />
          </span>
        )}
      </button>

      {abierta && (
        <div style={{ borderTop: `1px solid ${color.line}`, padding: `${space[2]}px ${space[3]}px ${space[3]}px`, display: 'grid', gap: space[2] }}>
          {f.pendientes.length === 0 && <div style={{ fontSize: font.sm, color: color.mut }}>Sin tareas para hoy.</div>}
          {f.pendientes.map((p) => (
            <div key={p.item.id} style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', padding: `${space[1]}px 0` }}>
              <span aria-label={p.hecho ? 'Hecha' : 'Pendiente'} style={{
                flex: '0 0 auto', width: 20, height: 20, borderRadius: 10, marginTop: 1, fontSize: 12, lineHeight: '20px', textAlign: 'center',
                border: `1px solid ${p.hecho ? color.success : color.line2}`, background: p.hecho ? color.success : 'transparent', color: '#fff',
              }}>{p.hecho ? '✓' : ''}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: font.sm, color: p.hecho ? color.mut : color.ink, textDecoration: p.hecho ? 'line-through' : undefined }}>
                    {p.item.titulo}
                  </span>
                  {p.desde && !p.hecho && <StatusPill tone="warning" label={`atrasada · del ${rotuloFecha(p.desde)}`} />}
                  {p.hecho && hora(p.hecho.hechoAt) && <span style={{ fontSize: font.xs, color: color.mut }}>{hora(p.hecho.hechoAt)}</span>}
                </div>
                {p.item.cuerpo && <div style={{ fontSize: font.xs, color: color.mut, whiteSpace: 'pre-line' }}>{p.item.cuerpo}</div>}
                <MiniaturasFotos fotos={p.item.fotos} />
              </div>
              {p.item.regla.tipo === 'unica' && (
                <Button variant="ghost" size="sm" onClick={() => onEliminar(p.item)}>Eliminar</Button>
              )}
            </div>
          ))}
          <div>
            <Button variant="outline" size="sm" onClick={onTarea}>+ Tarea para {f.persona.nombre.split(' ')[0]}</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
