'use client'

import { useEffect, useMemo, useState } from 'react'
import { InfoPopover } from '@/components/ui/InfoPopover'
import type { Marca } from '@/lib/nav'
import { aplicarAsignarLote, auditProductos, bustAudit, traerCategorias } from '@/lib/tncat/cliente'
import { buscar, enCategoria, itemsParaAplicar } from '@/lib/tncat/categorias'
import type { Categoria, ProductoCat } from '@/lib/tncat/tipos'
import { Card, color, useConfirmar } from '@/components/ui'

const CHUNK = 20

/**
 * Explorar una categoría: ver qué tiene adentro, sacar lo que ya no va y sumar lo que falta.
 *
 * Es el movimiento que faltaba. La asignación por Excel solo sabe AGREGAR, y para las
 * categorías vivas —Best sellers, Ofertas— el trabajo real es el inverso: sacar lo que dejó
 * de corresponder. Sin esto, esas categorías solo crecen y la tienda termina mostrando como
 * oferta algo que ya no lo es.
 *
 * Los dos lados de la pantalla son el mismo gesto: tildás productos y decidís si entran o
 * salen. Nada se escribe hasta confirmar, y se avisa siempre cuántos productos se tocan.
 */
export function ExplorarCategoriaCard({ marca }: { marca: Marca }) {
  const { confirmar } = useConfirmar()
  const [categorias, setCategorias] = useState<Categoria[] | null>(null)
  const [catId, setCatId] = useState('')
  const [productos, setProductos] = useState<ProductoCat[] | null>(null)
  const [q, setQ] = useState('')
  const [sacar, setSacar] = useState<Set<string>>(new Set())
  const [sumar, setSumar] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    traerCategorias(marca)
      .then((c) => vivo && setCategorias(c))
      .catch(() => vivo && setCategorias([]))
    auditProductos(marca)
      .then((p) => vivo && setProductos(p))
      .catch(() => vivo && setProductos([]))
    return () => {
      vivo = false
    }
  }, [marca])

  const catNombre = categorias?.find((c) => String(c.id) === catId)?.name ?? ''
  const dentro = useMemo(() => (productos && catId ? enCategoria(productos, catId) : []), [productos, catId])
  const candidatos = useMemo(() => (productos && catId ? buscar(productos, q, catId) : []), [productos, q, catId])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setter(n)
  }

  const aplicar = async (accion: 'agregar' | 'quitar') => {
    const elegidos = accion === 'quitar' ? sacar : sumar
    // Para agregar se busca en TODO el catálogo, no en los resultados de la búsqueda actual:
    // lo tildado se acumula entre búsquedas y se perdería al cambiar el texto.
    const base = accion === 'quitar' ? dentro : (productos ?? [])
    const items = itemsParaAplicar(base.filter((p) => elegidos.has(String(p.id))), catId, accion)
    if (!items.length || aplicando) return
    const verbo = accion === 'quitar' ? 'sacar de' : 'agregar a'
    const confirmado = await confirmar({
      titulo: `${verbo[0].toUpperCase()}${verbo.slice(1)} la categoría`,
      tono: 'warning',
      ok: `${verbo[0].toUpperCase()}${verbo.slice(1)} en ${items.length}`,
      mensaje: `Se ${verbo} "${catNombre}" en ${items.length === 1 ? '1 producto' : `${items.length} productos`}. Se escribe en la tienda EN VIVO.`,
    })
    if (!confirmado) return

    setAplicando(true)
    setMsg(null)
    let ok = 0
    const errores: string[] = []
    try {
      for (let i = 0; i < items.length; i += CHUNK) {
        const d = await aplicarAsignarLote(marca, items.slice(i, i + CHUNK))
        if (d.ok) {
          ok += d.aplicados || 0
          ;(d.errores || []).forEach((e) => errores.push(`${e.nombre || ''}: ${e.msg || e.status || ''}`))
        } else {
          errores.push(d.error || 'error del servidor')
        }
      }
      // Se refleja en memoria para no re-bajar el catálogo entero (y se bustea el caché del
      // audit, así la próxima lectura ya trae el estado real).
      setProductos((prev) =>
        prev
          ? prev.map((p) => {
              const it = items.find((x) => String(x.id) === String(p.id))
              return it ? { ...p, category_ids: it.nuevas } : p
            })
          : prev,
      )
      setSacar(new Set())
      setSumar(new Set())
      setMsg(`${ok === 1 ? '1 producto actualizado' : `${ok} productos actualizados`}${errores.length ? ` · ${errores.length} con error` : ''}.`)
      void bustAudit(marca)
    } catch (e) {
      setMsg('' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setAplicando(false)
    }
  }

  const fila = (p: ProductoCat, marcado: boolean, onToggle: () => void) => (
    <label key={String(p.id)} style={{ display: 'flex', gap: 9, alignItems: 'center', border: `1px solid ${color.line}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
      <input type="checkbox" checked={marcado} onChange={onToggle} />
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>{p.name}</div>
        {p.sku ? <div style={{ fontSize: 11.5, color: color.mut2 }}>SKU {p.sku}</div> : null}
      </div>
      {p.published === false ? <span style={{ fontSize: 11, color: color.warningInk, background: color.warningBg, borderRadius: 6, padding: '1px 7px' }}>oculto</span> : null}
    </label>
  )

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Explorar una categoría</div>
        <InfoPopover titulo="Explorar una categoría">
          Elegí una categoría y vas a ver <b>qué productos tiene hoy</b>, para sacar los que ya no van, y un
          buscador para <b>sumar</b> los que faltan. Sirve sobre todo para las categorías que cambian seguido
          (Best sellers, Ofertas). Escribe en la tienda online al confirmar; TiendaNube no tiene un “sacar”:
          se manda la lista completa de categorías del producto, y de eso se encarga el sistema.
        </InfoPopover>
      </div>

      <select
        value={catId}
        onChange={(e) => {
          setCatId(e.target.value)
          setSacar(new Set())
          setSumar(new Set())
          setMsg(null)
        }}
        style={{ padding: '7px 10px', border: `1px solid ${color.line2}`, borderRadius: 8, fontSize: 13, minWidth: 240, marginBottom: 10 }}
      >
        {categorias === null ? (
          <option value="">Cargando categorías…</option>
        ) : (
          <>
            <option value="">— Elegí una categoría —</option>
            {categorias.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>{c.name}</option>
            ))}
          </>
        )}
      </select>

      {msg && <div style={{ fontSize: 13, background: color.successBg, border: `1px solid ${color.successBorder}`, borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>{msg}</div>}

      {!catId ? null : productos === null ? (
        <div style={{ color: color.mut2, padding: '10px 2px' }}>Cargando productos de la tienda…</div>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {/* Lo que está adentro hoy → sacar */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              En “{catNombre}” ({dentro.length})
            </div>
            {dentro.length === 0 ? (
              <div style={{ fontSize: 13, color: color.mut2, padding: '8px 2px' }}>La categoría está vacía.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflow: 'auto' }}>
                  {dentro.map((p) => fila(p, sacar.has(String(p.id)), () => toggle(sacar, setSacar, String(p.id))))}
                </div>
                <button
                  className="btn-sm"
                  disabled={sacar.size === 0 || aplicando}
                  onClick={() => void aplicar('quitar')}
                  style={{ marginTop: 8, background: sacar.size ? color.danger : color.line, color: sacar.size ? '#fff' : color.mut2, border: 'none' }}
                >
                  {aplicando ? 'Aplicando…' : `Sacar de la categoría ${sacar.size || ''}`}
                </button>
              </>
            )}
          </div>

          {/* Buscar y sumar */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Agregar productos</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o SKU…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: `1px solid ${color.line2}`, borderRadius: 7, marginBottom: 6 }}
            />
            {q.trim() === '' ? (
              <div style={{ fontSize: 12.5, color: color.mut2, padding: '8px 2px' }}>
                Buscá y tildá los que quieras sumar. Podés hacer varias búsquedas: lo tildado se acumula hasta que aplicás.
              </div>
            ) : candidatos.length === 0 ? (
              <div style={{ fontSize: 13, color: color.mut2, padding: '8px 2px' }}>Sin resultados fuera de la categoría.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflow: 'auto' }}>
                {candidatos.map((p) => fila(p, sumar.has(String(p.id)), () => toggle(sumar, setSumar, String(p.id))))}
              </div>
            )}
            {sumar.size > 0 && (
              <div style={{ fontSize: 12, color: color.mut, marginTop: 6 }}>
                {sumar.size === 1 ? '1 producto tildado' : `${sumar.size} productos tildados`} (se mantienen aunque cambies la búsqueda).{' '}
                <button onClick={() => setSumar(new Set())} style={{ background: 'none', border: 'none', color: color.brandSolid, cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}>
                  Limpiar
                </button>
              </div>
            )}
            <button
              className="btn-sm"
              disabled={sumar.size === 0 || aplicando}
              onClick={() => void aplicar('agregar')}
              style={{ marginTop: 8, background: sumar.size ? color.success : color.line, color: sumar.size ? '#fff' : color.mut2, border: 'none' }}
            >
              {aplicando ? 'Aplicando…' : `Agregar a la categoría ${sumar.size || ''}`}
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}
