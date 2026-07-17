'use client'

import { useEffect, useState } from 'react'
import { agregarMensaje, borrarMensaje, editarMensaje, semillaFresca, type GrupoMensajes } from '@/lib/crm/banco'
import { guardarBanco, leerBanco } from '@/lib/kv/cliente'

/**
 * Banco de mensajes. Port de index.html:14293-14360.
 *
 * **La primera escritura del CRM en Next**, y a propósito la más barata: hoy
 * `mensajes:bdi` no existe en el KV, así que no hay un solo dato real que perder.
 * Si algo de esta capa está mal, se descubre acá y no con las 39 notas de 305
 * clientes.
 *
 * El guardado pasa por `guardarBanco`, que **exige el flag `cargado`**: sin una
 * lectura previa exitosa el POST no sale. Y ojo con el detalle: caer a la semilla
 * porque la clave no existe es un ÉXITO (`cargado: true`) — guardar la semilla
 * editada es exactamente lo que tiene que pasar la primera vez.
 */

type Props = { onCerrar: () => void }

export function BancoMensajes({ onCerrar }: Props) {
  const [banco, setBanco] = useState<GrupoMensajes[] | null>(null)
  const [cargado, setCargado] = useState(false)
  const [editando, setEditando] = useState<{ gi: number; mi: number } | null>(null)
  const [borrador, setBorrador] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await leerBanco<GrupoMensajes>('bdi')
      if (!vivo) return
      // r.dato === null → la clave no existe → semilla. Es el camino normal hoy.
      setBanco(r.ok && r.dato ? r.dato : semillaFresca())
      setCargado(r.ok)
      if (!r.ok) setError('No se pudo leer el banco del KV: no se puede guardar (guardar ahora lo borraría).')
    })()
    return () => {
      vivo = false
    }
  }, [])

  async function persistir(nuevo: GrupoMensajes[]) {
    setBanco(nuevo)
    const r = await guardarBanco({ store: 'bdi', banco: nuevo, cargado })
    if (!r.ok) setError('No se pudo guardar: ' + r.motivo)
    else setError(null)
  }

  function guardarEdicion(gi: number, mi: number) {
    if (!banco) return
    setEditando(null)
    persistir(editarMensaje(banco, gi, mi, borrador))
  }

  async function copiar(texto: string, id: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(id)
      setTimeout(() => setCopiado(null), 1200)
    } catch {
      setError('No se pudo copiar al portapapeles.')
    }
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: 'min(720px,100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>💬 Banco de mensajes</div>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>Clic en un mensaje para copiarlo. Editalo y se guarda solo.</div>
          </div>
          <button className="btn-sm" onClick={onCerrar}>Cerrar</button>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', padding: '7px 20px', fontSize: 12, color: '#991B1B' }}>⚠️ {error}</div>
        )}

        <div style={{ padding: '4px 20px 18px', overflowY: 'auto', flex: 1 }}>
          {!banco ? (
            <div style={{ padding: 24, color: '#9CA3AF', fontSize: 13 }}>Cargando…</div>
          ) : (
            banco.map((g, gi) => (
              <div key={g.grupo}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: '14px 0 8px' }}>{g.grupo}</div>
                {g.mensajes.map((m, mi) => {
                  const enEdicion = editando?.gi === gi && editando?.mi === mi
                  const id = `${gi}-${mi}`
                  return (
                    <div key={id} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 10, marginBottom: 6, background: '#FAFAFA' }}>
                      {enEdicion ? (
                        <>
                          <textarea
                            value={borrador}
                            onChange={(e) => setBorrador(e.target.value)}
                            autoFocus
                            style={{ width: '100%', minHeight: 60, fontSize: 12, fontFamily: 'inherit', padding: 6, border: '1px solid #D1D5DB', borderRadius: 6 }}
                          />
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button className="btn-sm btn-primary" onClick={() => guardarEdicion(gi, mi)}>Guardar</button>
                            <button className="btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
                            {/* Vaciar el texto y guardar borra el mensaje: es lo que hace el legacy. */}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', cursor: 'pointer' }} onClick={() => copiar(m, id)} title="Clic para copiar">
                            {m || <span style={{ color: '#9CA3AF' }}>(vacío)</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button className="btn-sm" onClick={() => copiar(m, id)}>{copiado === id ? '✓ Copiado' : '📋 Copiar'}</button>
                            <button className="btn-sm" onClick={() => { setEditando({ gi, mi }); setBorrador(m) }}>✏️ Editar</button>
                            <button className="btn-sm" onClick={() => { if (confirm('¿Borrar este mensaje?')) persistir(borrarMensaje(banco, gi, mi)) }}>🗑️</button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
                <button
                  className="btn-sm"
                  onClick={() => {
                    const nuevo = agregarMensaje(banco, gi)
                    setBanco(nuevo)
                    setEditando({ gi, mi: nuevo[gi].mensajes.length - 1 })
                    setBorrador('')
                  }}
                >
                  ➕ Agregar
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
