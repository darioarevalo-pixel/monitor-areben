'use client'

import { useEffect, useMemo, useState } from 'react'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { auditVariantes, bustAudit, despublicar, publicar } from '@/lib/tncat/cliente'
import { candidatosAOcultar } from '@/lib/tncat/agotados'
import type { ProductoFchk } from '@/lib/tncat/tipos'
import type { Marca } from '@/lib/nav.datos'
import { Card, color, useConfirmar } from '@/components/ui'

/**
 * Ocultar agotados (card 5 de tncat): lista los productos que la tienda muestra sin stock
 * (todas las variantes en 0) y siguen publicados, y permite despublicarlos — reversible
 * (deshacer republica). Escritura EN VIVO sobre TiendaNube. Por qué decide con el stock de
 * la tienda y no con el de Gestión Nube → `lib/tncat/agotados.ts:1`.
 */
export function AgotadosCard({ marca }: { marca: Marca }) {
  const { confirmar } = useConfirmar()
  const [productos, setProductos] = useState<ProductoFchk[] | null>(null)
  const [errorTienda, setErrorTienda] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [ocultados, setOcultados] = useState<Set<string>>(new Set())
  const [ultimoLote, setUltimoLote] = useState<(string | number)[]>([])
  const [procesando, setProcesando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    // El setState va en el callback de la promesa (no en el cuerpo del effect).
    auditVariantes(marca)
      .then((p) => {
        if (!vivo) return
        setProductos(p)
        setErrorTienda(false)
      })
      .catch(() => vivo && setErrorTienda(true))
    return () => {
      vivo = false
    }
  }, [marca])

  const todos = useMemo(() => (productos ? candidatosAOcultar(productos) : []), [productos])
  const lista = todos.filter((c) => !ocultados.has(String(c.tnId)))
  const cargando = !productos

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
    const ok = await confirmar({
      titulo: 'Ocultar en la tienda online',
      tono: 'warning',
      ok: `Ocultar ${ids.length}`,
      mensaje: `${ids.length === 1 ? 'El producto deja de verse' : `Los ${ids.length} productos dejan de verse`} en la tienda EN VIVO. Es reversible: se vuelven a mostrar desde "Con stock".`,
    })
    if (!ok) return
    setProcesando(true)
    setMsg(null)
    const r = await despublicar(marca, ids)
    setProcesando(false)
    if (!r.ok) {
      setMsg('No se pudo ocultar: ' + (r.error || 'error del servidor') + '.')
      return
    }
    setOcultados((prev) => new Set([...prev, ...ids.map(String)]))
    setUltimoLote(ids)
    setSel(new Set())
    setMsg(`Oculté ${r.ocultados ?? ids.length} producto(s).`)
    void bustAudit(marca)
  }

  const deshacer = async () => {
    if (!ultimoLote.length || procesando) return
    setProcesando(true)
    const r = await publicar(marca, ultimoLote)
    setProcesando(false)
    if (!r.ok) {
      setMsg('No se pudo deshacer: ' + (r.error || 'error') + '.')
      return
    }
    setOcultados((prev) => {
      const n = new Set(prev)
      ultimoLote.forEach((id) => n.delete(String(id)))
      return n
    })
    setMsg(`Volví a mostrar ${ultimoLote.length} producto(s).`)
    setUltimoLote([])
    void bustAudit(marca)
  }

  const nSel = lista.filter((c) => sel.has(String(c.tnId))).length

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Ocultar agotados</div>
        <InfoPopover titulo="Ocultar agotados">
          Productos que en la tienda figuran sin stock (todas sus variantes en 0) y siguen visibles. Ocultarlos
          los despublica (no los elimina): si algún día reingresan, aparecen en “Mostrar con stock”. Un producto
          con stock en alguna variante no aparece acá.
        </InfoPopover>
      </div>

      {msg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: color.successBg, border: `1px solid ${color.successBorder}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>
          <span>{msg}</span>
          {ultimoLote.length > 0 && (
            <button className="btn-sm" disabled={procesando} onClick={() => void deshacer()} style={{ background: '#fff', border: `1px solid ${color.line2}`, marginLeft: 'auto' }}>
              Deshacer
            </button>
          )}
        </div>
      )}

      {errorTienda ? (
        <div style={{ color: color.dangerInk, fontSize: 14, padding: '10px 2px' }}>
          No se pudo leer la tienda. Volvé a entrar en un rato.
        </div>
      ) : cargando ? (
        <div style={{ color: color.mut2, padding: '10px 2px' }}>Cargando la tienda…</div>
      ) : lista.length === 0 ? (
        <div style={{ color: color.successInk, fontSize: 14, padding: '10px 2px' }}>
          No hay productos agotados publicados en la tienda.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <button className="btn-sm" onClick={toggleTodos} style={{ background: '#fff', border: `1px solid ${color.line2}` }}>
              {todosSel ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
            <span style={{ fontSize: 13, color: color.mut }}>
              {lista.length} agotado(s) publicado(s){nSel > 0 ? ` · ${nSel} seleccionado(s)` : ''}
            </span>
            <button
              className="btn-sm"
              disabled={nSel === 0 || procesando}
              onClick={() => void ocultar()}
              style={{ background: nSel === 0 ? color.line : color.ink, color: nSel === 0 ? color.mut2 : '#fff', border: 'none', marginLeft: 'auto' }}
            >
              {procesando ? 'Ocultando…' : `Ocultar ${nSel || ''}`}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lista.map((c) => {
              const id = String(c.tnId)
              return (
                <label
                  key={id}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', border: `1px solid ${color.line}`, borderRadius: 8, padding: '8px 11px', cursor: 'pointer' }}
                >
                  <input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>{c.nombre}</div>
                    {c.sku && <div style={{ fontSize: 12, color: color.mut2 }}>SKU {c.sku}</div>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: color.dangerInk, background: color.dangerBg, borderRadius: 6, padding: '2px 8px' }}>
                    sin stock
                  </span>
                </label>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
