'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { asegurarTnPromo } from '@/components/productos/useTnImages'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { indexarTn, type IndiceTn } from '@/lib/tn'
import { bustAudit, despublicar, publicar } from '@/lib/tncat/cliente'
import { candidatosAOcultar } from '@/lib/tncat/agotados'
import type { Marca } from '@/lib/nav.generated'

/**
 * Ocultar agotados (card 5 de tncat): lista los productos sin stock (GN) que siguen
 * publicados en la tienda y permite despublicarlos — reversible (deshacer republica).
 * Escritura EN VIVO sobre TiendaNube. Solo productos ENTEROS agotados; la variante
 * puntual queda para más adelante (el audit no expone id/stock por variante).
 */
export function AgotadosCard({ marca }: { marca: Marca }) {
  const { datos } = useDatosMonitor()
  const [idx, setIdx] = useState<IndiceTn | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [ocultados, setOcultados] = useState<Set<string>>(new Set())
  const [ultimoLote, setUltimoLote] = useState<(string | number)[]>([])
  const [procesando, setProcesando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    // El setState va en el callback de la promesa (no en el cuerpo del effect). No
    // reseteamos a null: `datos` ya es null mientras el store cambia de marca, así que
    // el estado "cargando" se muestra igual y evitamos el render en cascada.
    asegurarTnPromo(marca)
      .then((i) => vivo && setIdx(i))
      .catch(() => vivo && setIdx(indexarTn([])))
    return () => {
      vivo = false
    }
  }, [marca])

  const todos = useMemo(
    () => (idx && datos ? candidatosAOcultar(datos.allProductos, idx) : []),
    [idx, datos],
  )
  const lista = todos.filter((c) => !ocultados.has(String(c.tnId)))
  const cargando = !idx || !datos

  const toggle = (id: string) => {
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const todosSel = lista.length > 0 && lista.every((c) => sel.has(String(c.tnId)))
  const toggleTodos = () => setSel(todosSel ? new Set() : new Set(lista.map((c) => String(c.tnId))))

  const ocultar = async () => {
    const ids = lista.filter((c) => sel.has(String(c.tnId))).map((c) => c.tnId)
    if (!ids.length || procesando) return
    if (!confirm(`Ocultar ${ids.length} producto(s) en la tienda online. Es reversible. ¿Seguir?`)) return
    setProcesando(true)
    setMsg(null)
    const r = await despublicar(marca, ids)
    setProcesando(false)
    if (!r.ok) {
      setMsg('⚠️ No se pudo ocultar: ' + (r.error || 'error del servidor') + '.')
      return
    }
    setOcultados((prev) => new Set([...prev, ...ids.map(String)]))
    setUltimoLote(ids)
    setSel(new Set())
    setMsg(`✅ Oculté ${r.ocultados ?? ids.length} producto(s).`)
    void bustAudit(marca)
  }

  const deshacer = async () => {
    if (!ultimoLote.length || procesando) return
    setProcesando(true)
    const r = await publicar(marca, ultimoLote)
    setProcesando(false)
    if (!r.ok) {
      setMsg('⚠️ No se pudo deshacer: ' + (r.error || 'error') + '.')
      return
    }
    setOcultados((prev) => {
      const n = new Set(prev)
      ultimoLote.forEach((id) => n.delete(String(id)))
      return n
    })
    setMsg(`↩️ Volví a mostrar ${ultimoLote.length} producto(s).`)
    setUltimoLote([])
    void bustAudit(marca)
  }

  const nSel = lista.filter((c) => sel.has(String(c.tnId))).length

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>🙈 Ocultar agotados</div>
        <InfoPopover titulo="Ocultar agotados">
          Productos sin stock (según Gestión Nube) que siguen visibles en la tienda. Ocultarlos los
          despublica (no los borra): si algún día reingresan, se vuelven a mostrar con “Deshacer” o
          desde la carga de imágenes. El match tienda↔sistema es aproximado: verificá el nombre antes.
        </InfoPopover>
      </div>

      {msg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>
          <span>{msg}</span>
          {ultimoLote.length > 0 && (
            <button className="btn-sm" disabled={procesando} onClick={() => void deshacer()} style={{ background: '#fff', border: '1px solid #D1D5DB', marginLeft: 'auto' }}>
              ↩️ Deshacer
            </button>
          )}
        </div>
      )}

      {cargando ? (
        <div style={{ color: '#9CA3AF', padding: '10px 2px' }}>Cargando productos y tienda…</div>
      ) : lista.length === 0 ? (
        <div style={{ color: '#059669', fontSize: 14, padding: '10px 2px' }}>
          ✅ No hay productos agotados publicados en la tienda.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <button className="btn-sm" onClick={toggleTodos} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
              {todosSel ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
            <span style={{ fontSize: 13, color: '#6B7280' }}>
              {lista.length} agotado(s) publicado(s){nSel > 0 ? ` · ${nSel} seleccionado(s)` : ''}
            </span>
            <button
              className="btn-sm"
              disabled={nSel === 0 || procesando}
              onClick={() => void ocultar()}
              style={{ background: nSel === 0 ? '#E5E7EB' : '#111827', color: nSel === 0 ? '#9CA3AF' : '#fff', border: 'none', marginLeft: 'auto' }}
            >
              {procesando ? 'Ocultando…' : `🙈 Ocultar ${nSel || ''}`}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lista.map((c) => {
              const id = String(c.tnId)
              return (
                <label
                  key={id}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 11px', cursor: 'pointer' }}
                >
                  <input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{c.gnNombre}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                      {c.sku ? `SKU ${c.sku} · ` : ''}en tienda: {c.tnNombre}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', background: '#FEF2F2', borderRadius: 6, padding: '2px 8px' }}>
                    sin stock
                  </span>
                </label>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
