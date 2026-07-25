'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { asegurarTnPromo } from '@/components/productos/useTnImages'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { indexarTn, type IndiceTn } from '@/lib/tn'
import { bustAudit, despublicar, publicar } from '@/lib/tncat/cliente'
import { candidatosAMostrar } from '@/lib/tncat/agotados'
import type { Marca } from '@/lib/nav.datos'
import { Button, Card, TBody, THead, TableWrap, Td, Th, Tr, color, font, space, useConfirmar } from '@/components/ui'

/**
 * Mostrar con stock: productos **despublicados** en la tienda que hoy tienen stock en
 * Gestión Nube. Es el espejo de "Ocultar agotados" y el que faltaba.
 *
 * Ocultar lo agotado sale solo, porque lo dispara que se termine algo. Volver a mostrarlo
 * cuando reingresa mercadería no lo dispara nada: el producto queda invisible en la tienda
 * con unidades disponibles — plata quieta que nadie ve. El "Deshacer" de ocultar solo sirve
 * en la misma sesión; esta lista lo encuentra siempre.
 *
 * Escribe EN VIVO sobre TiendaNube, y es reversible: volver a ocultarlos es un clic.
 */
export function ConStockCard({ marca }: { marca: Marca }) {
  const { confirmar } = useConfirmar()
  const { datos } = useDatosMonitor()
  const [idx, setIdx] = useState<IndiceTn | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [publicados, setPublicados] = useState<Set<string>>(new Set())
  const [ultimoLote, setUltimoLote] = useState<(string | number)[]>([])
  const [procesando, setProcesando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    asegurarTnPromo(marca)
      .then((i) => vivo && setIdx(i))
      .catch(() => vivo && setIdx(indexarTn([])))
    return () => {
      vivo = false
    }
  }, [marca])

  const todos = useMemo(() => (idx && datos ? candidatosAMostrar(datos.allProductos, idx) : []), [idx, datos])
  const lista = todos.filter((c) => !publicados.has(String(c.tnId)))
  const cargando = !idx || !datos

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const todosSel = lista.length > 0 && lista.every((c) => sel.has(String(c.tnId)))
  const toggleTodos = () => setSel(todosSel ? new Set() : new Set(lista.map((c) => String(c.tnId))))

  const mostrar = async () => {
    const ids = lista.filter((c) => sel.has(String(c.tnId))).map((c) => c.tnId)
    if (!ids.length || procesando) return
    const ok = await confirmar({
      titulo: 'Mostrar en la tienda online',
      tono: 'warning',
      ok: `Mostrar ${ids.length}`,
      mensaje: `${ids.length === 1 ? 'El producto vuelve a verse' : `Los ${ids.length} productos vuelven a verse`} en la tienda EN VIVO. Es reversible: se pueden volver a ocultar desde acá.`,
    })
    if (!ok) return
    setProcesando(true)
    setMsg(null)
    const r = await publicar(marca, ids)
    setProcesando(false)
    if (!r.ok) {
      setMsg('No se pudo publicar: ' + (r.error || 'error del servidor') + '.')
      return
    }
    setPublicados((prev) => new Set([...prev, ...ids.map(String)]))
    setUltimoLote(ids)
    setSel(new Set())
    const n = r.publicados ?? ids.length
    setMsg(`${n === 1 ? 'Volvió a la tienda 1 producto' : `Volvieron a la tienda ${n} productos`}.`)
    void bustAudit(marca)
  }

  const deshacer = async () => {
    if (!ultimoLote.length || procesando) return
    setProcesando(true)
    const r = await despublicar(marca, ultimoLote)
    setProcesando(false)
    if (!r.ok) {
      setMsg('No se pudo deshacer: ' + (r.error || 'error') + '.')
      return
    }
    setPublicados((prev) => {
      const n = new Set(prev)
      ultimoLote.forEach((id) => n.delete(String(id)))
      return n
    })
    setMsg(`${ultimoLote.length === 1 ? 'Volví a ocultar 1 producto' : `Volví a ocultar ${ultimoLote.length} productos`}.`)
    setUltimoLote([])
    void bustAudit(marca)
  }

  const nSel = lista.filter((c) => sel.has(String(c.tnId))).length

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Mostrar con stock</div>
        <InfoPopover titulo="Mostrar con stock">
          Productos que están <b>ocultos</b> en la tienda pero hoy tienen stock en Gestión Nube — normalmente
          porque se agotaron, se despublicaron y después reingresaron. Publicarlos los vuelve a hacer visibles
          (es reversible). El match tienda↔sistema es aproximado: verificá el nombre antes.
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

      {cargando ? (
        <div style={{ color: color.mut2, padding: '10px 2px' }}>Cargando productos y tienda…</div>
      ) : lista.length === 0 ? (
        <div style={{ color: color.successInk, fontSize: 14, padding: '10px 2px' }}>No hay productos con stock ocultos en la tienda.</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[2] }}>
            <Button size="sm" variant="outline" onClick={toggleTodos}>
              {todosSel ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </Button>
            <span style={{ fontSize: font.base, color: color.mut }}>
              {lista.length === 1 ? '1 producto oculto con stock' : `${lista.length} productos ocultos con stock`}
              {nSel > 0 ? ` · ${nSel === 1 ? '1 seleccionado' : `${nSel} seleccionados`}` : ''}
            </span>
            <Button variant="solid" tone="brand" disabled={nSel === 0} loading={procesando} onClick={() => void mostrar()} style={{ marginLeft: 'auto' }}>
              {procesando ? 'Publicando…' : `Mostrar ${nSel || ''}`.trim()}
            </Button>
          </div>

          {/* Una sola superficie con las filas separadas por línea. Antes cada producto
              era una tarjeta suelta y entre una y otra se veía el lienzo: la lista se
              leía como un montón de cajas flotando, no como una lista. */}
          <TableWrap maxHeight={520}>
            <THead>
              <Tr>
                <Th width={44} />
                <Th>Producto</Th>
                <Th align="right" width={110}>
                  Stock
                </Th>
              </Tr>
            </THead>
            <TBody>
              {lista.map((c) => {
                const id = String(c.tnId)
                return (
                  <Tr key={id} onClick={() => toggle(id)}>
                    <Td align="center">
                      <input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} style={{ accentColor: 'var(--mo-brand-solid)', cursor: 'pointer' }} />
                    </Td>
                    <Td tall wrap>
                      <div style={{ fontWeight: 600, color: color.ink }}>{c.gnNombre}</div>
                      <div style={{ fontSize: font.sm, color: color.mut2 }}>
                        {c.sku ? `SKU ${c.sku} · ` : ''}en tienda: {c.tnNombre}
                      </div>
                    </Td>
                    <Td align="right">
                      <span style={{ fontSize: font.xs, fontWeight: 700, color: color.successInk, background: color.successBg, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                        {c.stock === 1 ? '1 unidad' : `${c.stock} unidades`}
                      </span>
                    </Td>
                  </Tr>
                )
              })}
            </TBody>
          </TableWrap>
        </>
      )}
    </Card>
  )
}
