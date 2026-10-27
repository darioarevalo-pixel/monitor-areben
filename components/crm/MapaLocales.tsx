'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { leerMapa } from '@/lib/kv/cliente'
import { guardarLeadsConRelectura } from '@/lib/crm/persistencia'
import { nuevoIdLead, type Lead } from '@/lib/crm/leads'
import {
  ESTADO_LABEL,
  MEDIO_LABEL,
  accionProspecto,
  cargarProspectos,
  ciudades,
  contarPorEstado,
  enlaceMaps,
  enlaces,
  filtrarProspectos,
  leadExistente,
  patchLeadDesdeProspecto,
  textoEvento,
  type CuerpoAccion,
  type EstadoProspecto,
  type EventoProspecto,
  type Medio,
  type Prospecto,
} from '@/lib/crm/prospectos'
import { BuscarInput, Button, Chips, Modal, Notice, StatusPill, color, space, type Tone } from '@/components/ui'

/**
 * Pestaña «Mapa» del CRM: los locales de Google Maps que todavía no compran (26-oct-2026, Darío).
 *
 * Viven en la base (`prospecto_local` + `prospecto_evento`, vía `api/_prospectos.js`), ⛔ no en el
 * KV del CRM. Cada toque es una fila del historial. Cuando un local **responde**, pasa a Leads
 * (`crm:leads:bdi`, con la relectura de siempre) y recién ahí entra al panel de WhatsApp.
 *
 * 🔑 Tocar un medio (WhatsApp, Llamada, Instagram, Correo) abre el canal **y** anota el contacto:
 * es un solo gesto. La ventana se abre ANTES del pedido al servidor, o el navegador la bloquea.
 */

const MapaLeaflet = dynamic(() => import('./MapaLeaflet').then((m) => m.MapaLeaflet), { ssr: false })

const TONO: Record<EstadoProspecto, Tone> = {
  sin_contactar: 'brand',
  contactado: 'warning',
  respondio: 'success',
  descartado: 'danger',
}

const ORDEN_MEDIOS: Medio[] = ['whatsapp', 'llamada', 'instagram', 'correo']

const fmtFechaHora = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function MapaLocales({ onVerLead }: { onVerLead: (leadId: string) => void }) {
  const [locales, setLocales] = useState<Prospecto[]>([])
  const [eventos, setEventos] = useState<EventoProspecto[]>([])
  const [cargando, setCargando] = useState(true)
  const [sinTabla, setSinTabla] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ciudad, setCiudad] = useState('todas')
  const [estado, setEstado] = useState<EstadoProspecto | 'todos'>('todos')
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vivo = true
    cargarProspectos()
      .then((r) => {
        if (!vivo) return
        setLocales(r.locales)
        setEventos(r.eventos)
        setSinTabla(r.sinTabla)
      })
      .catch((e) => vivo && setError('No se pudo leer el mapa: ' + (e as Error).message))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
  }, [])

  const deCiudad = useMemo(() => filtrarProspectos(locales, { ciudad, estado: 'todos', q: '' }), [locales, ciudad])
  const lista = useMemo(() => filtrarProspectos(locales, { ciudad, estado, q }), [locales, ciudad, estado, q])
  const n = useMemo(() => contarPorEstado(deCiudad), [deCiudad])
  const listaCiudades = useMemo(() => ciudades(locales), [locales])

  const p = abierto ? locales.find((l) => l.id === abierto) || null : null
  const historial = useMemo(() => (p ? eventos.filter((e) => e.local_id === p.id) : []), [eventos, p])

  async function hacer(b: CuerpoAccion) {
    setOcupado(true)
    try {
      const r = await accionProspecto(b)
      setLocales((ls) => ls.map((l) => (l.id === r.local.id ? r.local : l)))
      setEventos((es) => [r.evento, ...es])
      setError(null)
      return true
    } catch (e) {
      setError('No se pudo guardar: ' + (e as Error).message)
      return false
    } finally {
      setOcupado(false)
    }
  }

  function contactar(local: Prospecto, medio: Medio, href: string) {
    if (medio === 'llamada' || medio === 'correo') window.location.href = href
    else window.open(href, '_blank', 'noopener')
    void hacer({ action: 'contacto', id: local.id, medio })
  }

  /**
   * «Respondió»: crea el lead (o usa el que ya hay con ese teléfono) y recién después ata el local.
   * 🔴 En ese orden: si falla el segundo paso, el lead existe y el botón se puede volver a tocar
   * (encuentra el mismo lead por teléfono). Al revés quedaría un local «Respondió» sin lead.
   */
  async function respondio(local: Prospecto) {
    setOcupado(true)
    try {
      const leads = await leerMapa<Lead>('crmleads', 'bdi')
      if (!leads.ok) throw new Error('no se pudieron leer los leads')
      let leadId = leadExistente(leads.dato, local)
      if (!leadId) {
        const id = nuevoIdLead(Date.now(), Math.random())
        const g = await guardarLeadsConRelectura(patchLeadDesdeProspecto(local, id))
        if (!g.ok) throw new Error(g.motivo)
        leadId = id
      }
      setOcupado(false)
      await hacer({ action: 'estado', id: local.id, estado: 'respondio', lead_id: leadId })
    } catch (e) {
      setError('No se pudo pasar a Leads: ' + (e as Error).message)
      setOcupado(false)
    }
  }

  async function guardarNota() {
    if (!p || !nota.trim()) return
    if (await hacer({ action: 'nota', id: p.id, texto: nota.trim() })) setNota('')
  }

  if (cargando) return <div style={{ color: color.mut, padding: space[4] }}>Cargando el mapa…</div>

  if (sinTabla) {
    return (
      <Notice tone="warning">
        Todavía no está creada la tabla de locales en la base. Cuando esté, los locales aparecen acá.
      </Notice>
    )
  }

  const opcionesCiudad = [{ key: 'todas', label: 'Todas', n: locales.length }, ...listaCiudades.map((c) => ({ key: c.ciudad, label: c.ciudad, n: c.n }))]
  const opcionesEstado = [
    { key: 'todos' as const, label: 'Todos', n: deCiudad.length },
    ...(['sin_contactar', 'contactado', 'respondio', 'descartado'] as EstadoProspecto[]).map((e) => ({ key: e, label: ESTADO_LABEL[e], n: n[e] })),
  ]

  return (
    <>
      {error && (
        <Notice tone="danger" style={{ marginBottom: space[3] }}>
          {error}
        </Notice>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginBottom: space[3] }}>
        <Chips opciones={opcionesCiudad} value={ciudad} onChange={setCiudad} />
        <Chips opciones={opcionesEstado} value={estado} onChange={(v) => setEstado(v as EstadoProspecto | 'todos')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: space[3] }}>
        <div style={{ height: 560, border: `1px solid ${color.line}`, borderRadius: 10 }}>
          <MapaLeaflet puntos={lista} elegido={abierto} onElegir={setAbierto} encuadre={ciudad} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: 560 }}>
          <BuscarInput value={q} onChange={setQ} placeholder="Buscar local, dirección o Instagram…" />
          <div style={{ overflowY: 'auto', marginTop: space[2], border: `1px solid ${color.line}`, borderRadius: 10, background: color.surface, flex: 1 }}>
            {lista.length === 0 ? (
              <div style={{ padding: space[4], color: color.mut }}>No hay locales con ese filtro.</div>
            ) : (
              lista.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setAbierto(l.id)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    height: 'auto',
                    alignItems: 'center',
                    gap: space[2],
                    padding: '8px 12px',
                    border: 'none',
                    borderBottom: `1px solid ${color.line}`,
                    background: l.id === abierto ? color.brandBg : 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nombre}</div>
                    <div style={{ fontSize: 12, color: color.mut2 }}>
                      {l.ciudad}
                      {l.rubro ? ` · ${l.rubro}` : ''}
                    </div>
                  </div>
                  <StatusPill tone={TONO[l.estado]} label={ESTADO_LABEL[l.estado]} />
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <Modal abierto={!!p} onCerrar={() => { setAbierto(null); setNota('') }} titulo={p?.nombre}>
        {p && <Ficha p={p} historial={historial} ocupado={ocupado} nota={nota} setNota={setNota}
          onContactar={contactar} onRespondio={respondio} onEstado={(e) => hacer({ action: 'estado', id: p.id, estado: e })}
          onGuardarNota={guardarNota} onVerLead={onVerLead} />}
      </Modal>
    </>
  )
}

function Ficha({
  p, historial, ocupado, nota, setNota, onContactar, onRespondio, onEstado, onGuardarNota, onVerLead,
}: {
  p: Prospecto
  historial: EventoProspecto[]
  ocupado: boolean
  nota: string
  setNota: (s: string) => void
  onContactar: (p: Prospecto, m: Medio, href: string) => void
  onRespondio: (p: Prospecto) => void
  onEstado: (e: EstadoProspecto) => void
  onGuardarNota: () => void
  onVerLead: (id: string) => void
}) {
  const hrefs = enlaces(p)
  const maps = enlaceMaps(p)
  const contactos = historial.filter((e) => e.tipo === 'contacto').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <StatusPill tone={TONO[p.estado]} label={ESTADO_LABEL[p.estado]} />
        <span style={{ fontSize: 13, color: color.mut }}>
          {[p.rubro, p.ciudad].filter(Boolean).join(' · ')}
          {p.estrellas != null ? ` · ★ ${p.estrellas}${p.resenas ? ` (${p.resenas})` : ''}` : ''}
        </span>
      </div>

      <div style={{ fontSize: 13, color: color.ink2 }}>
        {p.direccion || 'Sin dirección'}
        {maps && (
          <>
            {' · '}
            <a href={maps} target="_blank" rel="noopener noreferrer">Ver en Google Maps</a>
          </>
        )}
        {p.web && (
          <>
            {' · '}
            <a href={p.web.startsWith('http') ? p.web : `https://${p.web}`} target="_blank" rel="noopener noreferrer">Página</a>
          </>
        )}
      </div>

      <div>
        <div style={{ fontSize: 12, color: color.mut2, marginBottom: 6 }}>
          Contactar {contactos > 0 ? `· ya van ${contactos}` : ''}
        </div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {ORDEN_MEDIOS.map((m) => {
            const href = hrefs[m]
            return (
              <Button key={m} size="sm" variant="outline" disabled={!href || ocupado} onClick={() => href && onContactar(p, m, href)}>
                {MEDIO_LABEL[m]}
              </Button>
            )
          })}
        </div>
        {hrefs.whatsapp && !p.whatsapp_seguro && (
          <div style={{ fontSize: 12, color: color.mut2, marginTop: 4 }}>El número puede no tener WhatsApp.</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        {p.estado === 'respondio' && p.lead_id ? (
          <Button size="sm" variant="soft" tone="success" onClick={() => onVerLead(p.lead_id as string)}>Ver en Leads</Button>
        ) : (
          <Button size="sm" variant="solid" tone="success" disabled={ocupado} title="Respondió: lo pasa a Leads" onClick={() => onRespondio(p)}>Pasar a Leads</Button>
        )}
        {p.estado === 'descartado' ? (
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => onEstado(p.ultimo_contacto ? 'contactado' : 'sin_contactar')}>Reactivar</Button>
        ) : (
          p.estado !== 'respondio' && (
            <Button size="sm" variant="ghost" tone="danger" disabled={ocupado} onClick={() => onEstado('descartado')}>Descartar</Button>
          )
        )}
      </div>

      <div>
        <div style={{ display: 'flex', gap: space[2] }}>
          <input
            type="text"
            className="mo-input"
            style={{ flex: 1 }}
            placeholder="Nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onGuardarNota()}
          />
          <Button size="sm" variant="outline" disabled={!nota.trim() || ocupado} onClick={onGuardarNota}>Guardar</Button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: color.mut2, marginBottom: 6 }}>Historial</div>
        {historial.length === 0 ? (
          <div style={{ fontSize: 13, color: color.mut }}>Todavía no hay contactos con este local.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {historial.map((e) => (
              <div key={e.id} style={{ fontSize: 13, color: color.ink2 }}>
                <span style={{ color: color.mut2 }}>{fmtFechaHora(e.en)}</span> · {textoEvento(e)}
                {e.por ? <span style={{ color: color.mut2 }}> · {e.por}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
