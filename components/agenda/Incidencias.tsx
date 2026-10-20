'use client'

/**
 * ⚠️ **Incidencias del trabajo** (Darío, 20-oct-2026): algo roto, insumos u otro. Lo de caja,
 * mercadería y clientes se reporta desde el POS.
 *
 * - En «Hoy», cada una ve **las suyas** y el botón «Reportar incidencia» (`MisIncidencias`).
 * - Darío las ve **todas** en «Agenda → Incidencias» (`PanelIncidencias`), contesta y las resuelve.
 * Todas le suenan al celular; las urgentes con 🔴. Las respuestas le suenan al otro lado.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, EmptyState, Modal, Notice, StatusPill, color, font, space, weight } from '@/components/ui'
import { EQUIPO_AGENDA, type PersonaEquipo } from '@/lib/agenda/equipo'
import {
  TIPOS_INCIDENCIA, crearIncidencia, estadoIncidencia, leerIncidencias, responderIncidencia, tipoIncidencia,
  type Incidencia, type TipoIncidencia,
} from '@/lib/agenda/incidencias'
import { Tilde } from './EditorRegla'
import { EditorFotos, MiniaturasFotos } from './FotosTarea'
import { Titulo } from './Titulo'

const nombreDe = (u: string) => (EQUIPO_AGENDA.find((p) => p.name === u)?.nombre ?? u).split(' ')[0]

const cuando = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })

const areaTexto: React.CSSProperties = {
  width: '100%', padding: space[2], borderRadius: 8, border: `1px solid ${color.line2}`,
  fontSize: font.base, fontFamily: 'inherit', background: 'transparent', color: color.ink, resize: 'vertical',
}

function useIncidencias() {
  const [lista, setLista] = useState<Incidencia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(() => {
    leerIncidencias().then((l) => { setLista(l); setError(null) }).catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron leer.'))
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const poner = (i: Incidencia) => setLista((xs) => [i, ...(xs ?? []).filter((x) => x.id !== i.id)].sort((a, b) => b.id.localeCompare(a.id)))
  return { lista, error, poner }
}

/** En «Hoy»: las mías y el botón. `para` = la solapa de la compañera, en el celular compartido. */
export function MisIncidencias({ para }: { para?: PersonaEquipo }) {
  const { lista, error, poner } = useIncidencias()
  const [nueva, setNueva] = useState(false)
  const quien = para?.name
  // Las abiertas, y las resueltas de los últimos 3 días: lo viejo ya no dice nada.
  const [corte] = useState(() => Date.now() - 3 * 86400_000)
  const mias = (lista ?? []).filter((i) => (!quien || i.autor === quien) && (i.estado === 'abierta' || Date.parse(i.resuelta?.at ?? i.creado) > corte))

  return (
    <section style={{ display: 'grid', gap: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <Titulo>⚠️ Incidencias</Titulo>
        <Button variant="soft" tone="neutral" size="sm" onClick={() => setNueva(true)}>Reportar incidencia</Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {mias.map((i) => <TarjetaIncidencia key={i.id} inc={i} onCambio={poner} por={quien} />)}
      {nueva && <ModalIncidencia por={quien} onCerrar={() => setNueva(false)} onListo={(i) => { poner(i); setNueva(false) }} />}
    </section>
  )
}

/** Para Darío: todas, lo abierto arriba y lo urgente primero. */
export function PanelIncidencias() {
  const { lista, error, poner } = useIncidencias()
  const [verResueltas, setVerResueltas] = useState(false)
  if (error) return <Notice tone="danger">{error}</Notice>
  if (!lista) return <div style={{ color: color.mut, fontSize: font.sm }}>Cargando…</div>
  const abiertas = lista.filter((i) => i.estado === 'abierta').sort((a, b) => Number(b.urgente) - Number(a.urgente) || b.id.localeCompare(a.id))
  const resueltas = lista.filter((i) => i.estado === 'resuelta')
  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      {abiertas.length === 0 && <EmptyState icon="✅" title="No hay incidencias abiertas." dashed />}
      {abiertas.map((i) => <TarjetaIncidencia key={i.id} inc={i} onCambio={poner} dario />)}
      {resueltas.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setVerResueltas((x) => !x)}>
            {verResueltas ? 'Ocultar resueltas' : `Ver resueltas (${resueltas.length})`}
          </Button>
        </div>
      )}
      {verResueltas && resueltas.map((i) => <TarjetaIncidencia key={i.id} inc={i} onCambio={poner} dario />)}
    </div>
  )
}

function TarjetaIncidencia({ inc, onCambio, dario = false, por }: { inc: Incidencia; onCambio: (i: Incidencia) => void; dario?: boolean; por?: string }) {
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = tipoIncidencia(inc.tipo)
  const resuelta = inc.estado === 'resuelta'

  const correr = async (fn: () => Promise<Incidencia>) => {
    setOcupado(true)
    setError(null)
    try { onCambio(await fn()); setTexto('') } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    } finally { setOcupado(false) }
  }

  return (
    <Card padding={3} style={{ opacity: resuelta ? 0.7 : 1, borderColor: inc.urgente && !resuelta ? color.danger : undefined }}>
      <div style={{ display: 'grid', gap: space[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <span style={{ fontWeight: weight.semibold, color: color.ink }}>{t ? `${t.icono} ${t.label}` : 'Incidencia'}</span>
          {inc.urgente && !resuelta && <StatusPill tone="danger" label="Urgente" />}
          {resuelta && <StatusPill tone="success" label="Resuelta" />}
          <span style={{ marginLeft: 'auto', fontSize: font.xs, color: color.mut }}>
            {dario ? `${nombreDe(inc.autor)} · ` : ''}{cuando(inc.creado)}
          </span>
        </div>
        <div style={{ fontSize: font.base, color: color.ink2, whiteSpace: 'pre-wrap' }}>{inc.texto}</div>
        <MiniaturasFotos fotos={inc.fotos} />

        {inc.mensajes.map((m, k) => (
          <div key={k} style={{
            fontSize: font.sm, padding: space[2], borderRadius: 8, whiteSpace: 'pre-wrap',
            background: m.de === inc.autor ? color.surface : color.brandBg, color: color.ink2,
          }}>
            <b>{nombreDe(m.de)}</b> · <span style={{ color: color.mut }}>{cuando(m.at)}</span>
            <div>{m.texto}</div>
          </div>
        ))}

        {error && <Notice tone="danger">{error}</Notice>}
        {!resuelta && (
          <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} placeholder="Responder" style={{ ...areaTexto, flex: 1 }} />
            <Button variant="solid" tone="brand" size="sm" disabled={!texto.trim() || ocupado} onClick={() => correr(() => responderIncidencia(inc.id, texto, por))}>Enviar</Button>
          </div>
        )}
        {dario && (
          <div>
            <Button variant="soft" tone={resuelta ? 'neutral' : 'success'} size="sm" disabled={ocupado}
              onClick={() => correr(() => estadoIncidencia(inc.id, resuelta ? 'abierta' : 'resuelta'))}>
              {resuelta ? 'Reabrir' : 'Marcar resuelta'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

function ModalIncidencia({ por, onCerrar, onListo }: { por?: string; onCerrar: () => void; onListo: (i: Incidencia) => void }) {
  const [tipo, setTipo] = useState<TipoIncidencia | null>(null)
  const [texto, setTexto] = useState('')
  const [fotos, setFotos] = useState<string[]>([])
  const [urgente, setUrgente] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listo = !!tipo && !!texto.trim()

  const mandar = async () => {
    if (!tipo || !listo) return
    setGuardando(true)
    setError(null)
    try {
      onListo(await crearIncidencia({ tipo, texto: texto.trim(), urgente, fotos, por }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mandar.')
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Reportar incidencia"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="soft" tone="neutral" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" tone="brand" onClick={mandar} disabled={!listo || guardando}>{guardando ? 'Enviando…' : 'Enviar'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[4] }}>
        {error && <Notice tone="danger">{error}</Notice>}
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {TIPOS_INCIDENCIA.map((t) => (
            <Tilde key={t.key} puesto={tipo === t.key} label={`${t.icono} ${t.label}`} onToggle={() => setTipo(t.key as TipoIncidencia)} />
          ))}
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="¿Qué pasó?" style={areaTexto} />
        <EditorFotos fotos={fotos} onChange={setFotos} />
        <Tilde puesto={urgente} label="🔴 Es urgente" onToggle={() => setUrgente((x) => !x)} />
      </div>
    </Modal>
  )
}
