'use client'

import { useEffect, useMemo, useState } from 'react'
import { guardarMapa, leerMapa } from '@/lib/kv/cliente'
import {
  agregar,
  agregarNota,
  borrarNota,
  eliminar,
  filtrarLeads,
  hableHoy,
  leadInstaHref,
  nuevoIdLead,
  setCadencia,
  setCampo,
  setEstado,
  setProximoManual,
  LEAD_ESTADO_LABEL,
  type EstadoLead,
  type Lead,
  type MapaLeads,
} from '@/lib/crm/leads'
import { normalizeArgPhone } from '@/lib/crm/core'

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
  pendiente: { txt: 'A contactar', col: '#DC2626', bg: '#FEE2E2', dot: '🔴' },
  vencido: { txt: 'Vencido', col: '#DC2626', bg: '#FEE2E2', dot: '🔴' },
  semana: { txt: 'Esta semana', col: '#B45309', bg: '#FEF3C7', dot: '🟡' },
  aldia: { txt: 'Al día', col: '#15803D', bg: '#DCFCE7', dot: '🟢' },
} as const

const fmtFecha = (d: string | null) => {
  if (!d) return '—'
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

export function Leads() {
  const [leads, setLeads] = useState<MapaLeads>({})
  const [cargado, setCargado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [verArchivados, setVerArchivados] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [nota, setNota] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await leerMapa<Lead>('crmleads', 'bdi')
      if (!vivo) return
      setLeads(r.ok ? r.dato : {})
      setCargado(r.ok)
      setCargando(false)
      if (!r.ok) setError('No se pudo leer los leads del KV: los guardados están bloqueados para no borrar los que hay.')
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
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>
        Prospectos con local a los que les hablás pero todavía no compraron.
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 11px', marginBottom: 12, fontSize: 12, color: '#991B1B' }}>
          ⚠️ {error}
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <button
          className="btn-sm"
          style={{ background: '#2563EB', color: '#fff' }}
          disabled={!cargado}
          title={cargado ? '' : 'El KV no se pudo leer'}
          onClick={() => {
            const id = nuevoIdLead(Date.now(), Math.random())
            persistir(agregar(leads, id))
            setAbierto(id)
          }}
        >
          ➕ Nuevo lead
        </button>
        <input type="text" placeholder="Buscar nombre, teléfono o Instagram..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label style={{ fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
          Ver archivados
        </label>
        <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
          {lista.length} lead{lista.length === 1 ? '' : 's'}
          {verArchivados ? ' archivados' : ''}
        </span>
      </div>

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
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#9CA3AF' }}>Cargando…</td></tr>
            ) : !lista.length ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#9CA3AF' }}>{verArchivados ? 'No hay leads archivados.' : 'Todavía no hay leads.'}</td></tr>
            ) : (
              lista.map((x) => {
                const wa = normalizeArgPhone(x.telefono)
                const insta = leadInstaHref(x.instagram)
                const chip = x._seg.estado !== 'none' ? CHIP[x._seg.estado as keyof typeof CHIP] : null
                // Sin reordenar: el índice de borrado es posicional (ver la cabecera).
                const ultNota = x.notas[0]
                return (
                  <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setAbierto(x.id)}>
                    <td><div style={{ fontWeight: 600 }}>{x.nombre || <span style={{ color: '#9CA3AF' }}>(sin nombre)</span>}</div></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {x.telefono && <div style={{ fontSize: 12 }}>{x.telefono}</div>}
                      {insta && (
                        <div style={{ fontSize: 11 }}>
                          <a href={insta} target="_blank" rel="noopener noreferrer" style={{ color: '#DB2777' }}>{x.instagram}</a>
                        </div>
                      )}
                      {wa && (
                        <a href={`https://web.whatsapp.com/send?phone=${wa}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#16A34A' }}>
                          WhatsApp
                        </a>
                      )}
                    </td>
                    <td>{x.ciudad || <span style={{ color: '#9CA3AF' }}>—</span>}</td>
                    <td>
                      {chip ? (
                        <>
                          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: chip.col, background: chip.bg, padding: '1px 7px', borderRadius: 999 }}>
                            {chip.dot} {chip.txt}
                          </span>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                            {x._seg.estado === 'pendiente' ? 'Sin primer contacto' : `${fmtFecha(x._seg.proximo)} · ${x._seg.dias === 0 ? 'hoy' : (x._seg.dias as number) < 0 ? `hace ${-(x._seg.dias as number)}d` : `en ${x._seg.dias}d`}`}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: '#9CA3AF' }}>—</span>
                      )}
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      {ultNota ? (
                        <>
                          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtFecha(ultNota.fecha)}</div>
                          <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ultNota.texto}</div>
                        </>
                      ) : (
                        <span style={{ color: '#9CA3AF' }}>—</span>
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
              <button className="btn-sm" onClick={() => setAbierto(null)}>Cerrar</button>
            </div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              {(['nombre', 'telefono', 'instagram', 'ciudad'] as const).map((campo) => (
                <label key={campo} style={{ fontSize: 12, color: '#6B7280' }}>
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
              <label style={{ fontSize: 12, color: '#6B7280' }}>Cadencia:</label>
              <select value={l.cadencia} onChange={(e) => persistir(setCadencia(leads, l.id, e.target.value))}>
                <option value="">Sin cadencia</option>
                <option value="semanal">Semanal</option>
                <option value="quincenal">Quincenal</option>
                <option value="mensual">Mensual</option>
              </select>
              <button className="btn-sm" onClick={() => persistir(hableHoy(leads, l.id))}>✅ Hablé hoy</button>
              <label style={{ fontSize: 12, color: '#6B7280' }}>Próximo:</label>
              <input type="date" value={l.proximo_manual || ''} onChange={(e) => persistir(setProximoManual(leads, l.id, e.target.value))} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Notas</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input type="text" placeholder="Agregar nota…" value={nota} onChange={(e) => setNota(e.target.value)} style={{ flex: 1 }} />
                <button className="btn-sm" onClick={() => { persistir(agregarNota(leads, l.id, nota)); setNota('') }}>Agregar</button>
              </div>
              {l.notas.map((n, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ color: '#9CA3AF', fontSize: 11, minWidth: 64 }}>{fmtFecha(n.fecha)}</span>
                  <span style={{ flex: 1 }}>{n.texto}</span>
                  <button className="btn-sm" onClick={() => { if (confirm('¿Borrar esta nota?')) persistir(borrarNota(leads, l.id, i)) }}>🗑️</button>
                </div>
              ))}
              {!l.notas.length && <div style={{ fontSize: 12, color: '#9CA3AF' }}>Sin notas.</div>}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
              {(['activo', 'comprado', 'descartado'] as EstadoLead[]).map((e) => (
                <button key={e} className="btn-sm" style={l.estado === e ? { background: '#111827', color: '#fff' } : undefined} onClick={() => persistir(setEstado(leads, l.id, e))}>
                  {LEAD_ESTADO_LABEL[e]}
                </button>
              ))}
              <button
                className="btn-sm"
                style={{ marginLeft: 'auto', color: '#DC2626' }}
                onClick={() => {
                  // Irreversible: el KV no tiene papelera.
                  if (confirm('¿Eliminar este lead para siempre? No se puede deshacer.')) {
                    persistir(eliminar(leads, l.id))
                    setAbierto(null)
                  }
                }}
              >
                🗑️ Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
