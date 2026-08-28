'use client'

import { useEffect, useMemo, useState } from 'react'
import { guardarMapa, leerMapa } from '@/lib/kv/cliente'
import {
  agregar,
  agregarNota,
  borrarNota,
  eliminar,
  filtrarLeads,
  escribiHoyLead,
  leadInstaHref,
  nuevoIdLead,
  setCampo,
  setEstado,
  setProximoManual,
  LEAD_ESTADO_LABEL,
  type EstadoLead,
  type Lead,
  type MapaLeads,
} from '@/lib/crm/leads'
import { normalizeArgPhone } from '@/lib/crm/core'
import { Button, Notice, StatusPill, Toolbar, color, useConfirmar } from '@/components/ui'

/**
 * Vista de Leads. Port de index.html:13936-14247.
 *
 * **Escribe en `crm:leads:bdi`**, que hoy tiene 11 prospectos cargados a mano y
 * sin otra copia. Es la segunda escritura que se habilita, después del banco
 * (que no tenía nada que perder). El guardado pasa por `guardarMapa`, que exige
 * el flag `cargado`: sin lectura previa exitosa, el POST no sale.
 *
 * ⚠️ Las notas se borran **por índice posicional** y no tienen id (14216). Por eso
 * acá se muestran **en el orden en que están guardadas**, sin reordenar: si la
 * vista ordenara distinto, el índice apuntaría a otra nota y se borraría la
 * equivocada, sin confirmación y sin deshacer. Darles id es un cambio de datos y
 * va aparte.
 */

const CHIP = {
  pendiente: { txt: 'A contactar', tone: 'danger' },
  vencido: { txt: 'Vencido', tone: 'danger' },
  semana: { txt: 'Esta semana', tone: 'warning' },
  aldia: { txt: 'Al día', tone: 'success' },
} as const

const fmtFecha = (d: string | null) => {
  if (!d) return '—'
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

/**
 * `abrirId` — la ficha a abrir apenas se entra. La usa el bloque "Leads para contactar" de la
 * lista del día: tocar un nombre ahí tiene que llevar a SU ficha, no a la lista pelada.
 */
export function Leads({ abrirId }: { abrirId?: string | null } = {}) {
  const { confirmar } = useConfirmar()
  const [leads, setLeads] = useState<MapaLeads>({})
  const [cargado, setCargado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [verArchivados, setVerArchivados] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(abrirId || null)
  const [nota, setNota] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await leerMapa<Lead>('crmleads', 'bdi')
      if (!vivo) return
      setLeads(r.ok ? r.dato : {})
      setCargado(r.ok)
      setCargando(false)
      if (!r.ok) setError('No se pudo leer los leads del KV: los guardados están bloqueados para no eliminar los que hay.')
    })()
    return () => {
      vivo = false
    }
  }, [])

  async function persistir(nuevo: MapaLeads) {
    setLeads(nuevo)
    const r = await guardarMapa({ kind: 'crmleads', store: 'bdi', mapa: nuevo, cargado })
    if (!r.ok) setError('No se pudo guardar: ' + r.motivo)
    else setError(null)
  }

  const lista = useMemo(
    () => filtrarLeads(leads, { q: q.trim().toLowerCase(), verArchivados, today: new Date() }),
    [leads, q, verArchivados],
  )

  const l = abierto ? leads[abierto] : null

  return (
    <>
      <div style={{ fontSize: 12, color: color.mut2, marginBottom: 12 }}>
        Prospectos con local a los que les hablás pero todavía no compraron.
      </div>

      {error && (
        <Notice tone="danger" style={{ marginBottom: 12 }}>{error}</Notice>
      )}

      <Toolbar style={{ marginBottom: 14 }}>
        <Button
          size="sm"
          variant="solid"
          tone="brand"
          disabled={!cargado}
          title={cargado ? '' : 'El KV no se pudo leer'}
          onClick={() => {
            const id = nuevoIdLead(Date.now(), Math.random())
            persistir(agregar(leads, id))
            setAbierto(id)
          }}
        >
          + Nuevo lead
        </Button>
        <input type="text" placeholder="Buscar nombre, teléfono o Instagram..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label style={{ fontSize: 12, color: color.mut, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
          Ver archivados
        </label>
        <span style={{ fontSize: 12, color: color.mut2, marginLeft: 'auto' }}>
          {lista.length} lead{lista.length === 1 ? '' : 's'}
          {verArchivados ? ' archivados' : ''}
        </span>
      </Toolbar>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Lead</th>
              <th>Contacto</th>
              <th>Ciudad</th>
              <th>Próximo contacto</th>
              <th>Última nota</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: color.mut2 }}>Cargando…</td></tr>
            ) : !lista.length ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: color.mut2 }}>{verArchivados ? 'No hay leads archivados.' : 'Todavía no hay leads.'}</td></tr>
            ) : (
              lista.map((x) => {
                const wa = normalizeArgPhone(x.telefono)
                const insta = leadInstaHref(x.instagram)
                const chip = x._seg.estado !== 'none' ? CHIP[x._seg.estado as keyof typeof CHIP] : null
                // Sin reordenar: el índice de borrado es posicional (ver la cabecera).
                const ultNota = x.notas[0]
                return (
                  <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setAbierto(x.id)}>
                    <td><div style={{ fontWeight: 600 }}>{x.nombre || <span style={{ color: color.mut2 }}>(sin nombre)</span>}</div></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {x.telefono && <div style={{ fontSize: 12 }}>{x.telefono}</div>}
                      {insta && (
                        <div style={{ fontSize: 11 }}>
                          <a href={insta} target="_blank" rel="noopener noreferrer" style={{ color: color.brand }}>{x.instagram}</a>
                        </div>
                      )}
                      {wa && (
                        <a href={`https://web.whatsapp.com/send?phone=${wa}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: color.success }}>
                          WhatsApp
                        </a>
                      )}
                    </td>
                    <td>{x.ciudad || <span style={{ color: color.mut2 }}>—</span>}</td>
                    <td>
                      {chip ? (
                        <>
                          <StatusPill tone={chip.tone} label={chip.txt} />
                          <div style={{ fontSize: 11, color: color.mut2, marginTop: 2 }}>
                            {x._seg.estado === 'pendiente' ? 'Sin primer contacto' : `${fmtFecha(x._seg.proximo)} · ${x._seg.dias === 0 ? 'hoy' : (x._seg.dias as number) < 0 ? `hace ${-(x._seg.dias as number)}d` : `en ${x._seg.dias}d`}`}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: color.mut2 }}>—</span>
                      )}
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      {ultNota ? (
                        <>
                          <div style={{ fontSize: 11, color: color.mut2 }}>{fmtFecha(ultNota.fecha)}</div>
                          <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ultNota.texto}</div>
                        </>
                      ) : (
                        <span style={{ color: color.mut2 }}>—</span>
                      )}
                    </td>
                    <td><span style={{ fontSize: 11 }}>{LEAD_ESTADO_LABEL[x.estado] || x.estado}</span></td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {l && (
        <div onClick={() => setAbierto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 'min(560px,100%)', maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontWeight: 700 }}>{l.nombre || 'Lead nuevo'}</div>
              <Button size="sm" variant="outline" onClick={() => setAbierto(null)}>Cerrar</Button>
            </div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              {(['nombre', 'telefono', 'instagram', 'ciudad'] as const).map((campo) => (
                <label key={campo} style={{ fontSize: 12, color: color.mut }}>
                  {campo[0].toUpperCase() + campo.slice(1)}
                  <input
                    type="text"
                    value={l[campo]}
                    onChange={(e) => setLeads(setCampo(leads, l.id, campo, e.target.value))}
                    onBlur={() => persistir(leads)}
                    style={{ width: '100%', marginTop: 2 }}
                  />
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
              {/* La cadencia salió el 24-ago-2026 (ver `leadEstadoSeg`): cuándo volver lo elige la
                  persona que acaba de hablar, no una regla. "Hablé hoy" agenda a una semana, que
                  es el default de siempre y se corre en el calendario de al lado. */}
              <Button size="sm" variant="outline" onClick={() => persistir(escribiHoyLead(leads, l.id, 7))}>Hablé hoy</Button>
              <label style={{ fontSize: 12, color: color.mut }}>Próximo:</label>
              <input type="date" value={l.proximo_manual || ''} onChange={(e) => persistir(setProximoManual(leads, l.id, e.target.value))} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Notas</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input type="text" placeholder="Agregar nota…" value={nota} onChange={(e) => setNota(e.target.value)} style={{ flex: 1 }} />
                <Button size="sm" variant="outline" onClick={() => { persistir(agregarNota(leads, l.id, nota)); setNota('') }}>Agregar</Button>
              </div>
              {l.notas.map((n, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, padding: '4px 0', borderBottom: `1px solid ${color.bg2}` }}>
                  <span style={{ color: color.mut2, fontSize: 11, minWidth: 64 }}>{fmtFecha(n.fecha)}</span>
                  <span style={{ flex: 1 }}>{n.texto}</span>
                  <Button size="sm" variant="ghost" tone="danger" onClick={() => void (async () => { if (await confirmar({ titulo: 'Eliminar la nota', tono: 'danger', ok: 'Eliminar', mensaje: 'Se elimina esta nota del lead.' })) persistir(borrarNota(leads, l.id, i)) })()}></Button>
                </div>
              ))}
              {!l.notas.length && <div style={{ fontSize: 12, color: color.mut2 }}>Sin notas.</div>}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: `1px solid ${color.line}`, paddingTop: 12 }}>
              {(['activo', 'comprado', 'descartado'] as EstadoLead[]).map((e) => (
                <Button key={e} size="sm" variant={l.estado === e ? 'solid' : 'outline'} tone="neutral" onClick={() => persistir(setEstado(leads, l.id, e))}>
                  {LEAD_ESTADO_LABEL[e]}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                tone="danger"
                style={{ marginLeft: 'auto' }}
                onClick={() => void (async () => {
 // Irreversible: el KV no tiene papelera, y por eso el diálogo lo dice.
 const ok = await confirmar({
 titulo: 'Eliminar el lead',
 tono: 'danger',
 ok: 'Eliminar para siempre',
 mensaje: `Se elimina ${l.nombre || 'este lead'} con sus notas y su seguimiento. No hay papelera: no se puede deshacer.`,
 })
 if (ok) {
 persistir(eliminar(leads, l.id))
 setAbierto(null)
 }
 })()
 }
 >
 Eliminar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
