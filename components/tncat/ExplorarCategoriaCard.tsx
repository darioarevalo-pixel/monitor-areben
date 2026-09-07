'use client'

import { useEffect, useMemo, useState } from 'react'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { ETIQUETA_LINEA, type Linea } from '@/lib/lineas'
import { aplicarAsignarLote, auditProductos, bustAudit, traerCategorias } from '@/lib/tncat/cliente'
import {
  buscar,
  enCategoria,
  estaOculto,
  etiquetaAntiguedad,
  itemsParaAplicar,
  quedarianSinCategoria,
  type EstadoCat,
  type OrdenCat,
} from '@/lib/tncat/categorias'
import type { Categoria, ProductoCat } from '@/lib/tncat/tipos'
import { FotoTn } from './FotoTn'
import { Card, color, Lightbox, SelectorLinea, useConfirmar } from '@/components/ui'
import { useLinea } from '@/components/fundas/useDatosMonitor'

const CHUNK = 20
const MINI = 40

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
 *
 * 🔑 **La fila muestra la FOTO y hace cuánto entró el producto** (7-sep-2026). Las dos salen del
 * payload que la card ya bajaba: `images` y `created_at` vienen en el audit liviano, así que no
 * cuesta una llamada más. Sin la foto hay que acordarse de qué es cada nombre; sin la fecha no se
 * puede decidir lo único que importa en NEW IN —**498 de los 770 productos de Zattia están ahí, y
 * 279 hace más de 90 días**—, que es qué dejó de ser novedad.
 */
export function ExplorarCategoriaCard() {
  const { linea, lineas, setLinea } = useLinea()
  const { confirmar } = useConfirmar()
  const [categorias, setCategorias] = useState<Categoria[] | null>(null)
  const [catId, setCatId] = useState('')
  const [productos, setProductos] = useState<ProductoCat[] | null>(null)
  const [q, setQ] = useState('')
  const [qDentro, setQDentro] = useState('')
  const [orden, setOrden] = useState<OrdenCat>('antiguos')
  const [estado, setEstado] = useState<EstadoCat>('todos')
  const [sacar, setSacar] = useState<Set<string>>(new Set())
  const [sumar, setSumar] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState(false)
  // Se fija una vez: con `Date.now()` en cada render, dos filas del mismo día podrían contarse
  // distinto entre un dibujo y el siguiente.
  const [ahora] = useState(() => Date.now())
  /** La foto que se está mirando en grande, o `null`. Es la ORIGINAL, no la miniatura. */
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  /**
   * **Cambió la línea ⇒ se cae todo lo que se eligió sobre la tienda anterior.**
   *
   * 🔴 Lo tildado son `id` de producto **de la tienda que se está mirando**, y acá se aplican
   * DIRECTO (no hay un cruce por nombre en el medio que los revalide): con la otra línea elegida,
   * «Agregar los 12» escribiría `categories` sobre los productos de la otra tienda que tengan esos
   * números. La categoría elegida es de esa tienda también.
   *
   * Va durante el render y no en un efecto: es estado de esta card derivado de un valor que
   * cambió, y en un efecto se pinta un cuadro intermedio con los productos de la tienda anterior
   * y la categoría de la otra.
   */
  const [lineaMirada, setLineaMirada] = useState<Linea>(linea)
  if (linea !== lineaMirada) {
    setLineaMirada(linea)
    setCategorias(null)
    setProductos(null)
    setCatId('')
    setQ('')
    setQDentro('')
    setEstado('todos')
    setSacar(new Set())
    setSumar(new Set())
    setMsg(null)
  }

  useEffect(() => {
    let vivo = true
    traerCategorias(linea)
      .then((c) => vivo && setCategorias(c))
      .catch(() => vivo && setCategorias([]))
    auditProductos(linea)
      .then((p) => vivo && setProductos(p))
      .catch(() => vivo && setProductos([]))
    return () => {
      vivo = false
    }
  }, [linea])

  const catNombre = categorias?.find((c) => String(c.id) === catId)?.name ?? ''
  // Lo que está adentro, SIN filtrar: es la base del lote. Lo tildado se acumula entre búsquedas
  // igual que del lado de agregar, y aplicar sobre la vista filtrada perdería lo que no se ve.
  const dentro = useMemo(() => (productos && catId ? enCategoria(productos, catId) : []), [productos, catId])
  const dentroVista = useMemo(
    () => (productos && catId ? enCategoria(productos, catId, { q: qDentro, orden, estado }) : []),
    [productos, catId, qDentro, orden, estado],
  )
  const ocultosDentro = useMemo(() => dentro.filter(estaOculto).length, [dentro])
  /** ¿Ya están todos los que se ven? Decide si el botón de tanda tilda o destilda. */
  const vistaEntera = dentroVista.length > 0 && dentroVista.every((p) => sacar.has(String(p.id)))
  const tildadosOcultos = useMemo(() => {
    const visibles = new Set(dentroVista.map((p) => String(p.id)))
    return [...sacar].filter((id) => !visibles.has(id)).length
  }, [dentroVista, sacar])
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
    const uno = items.length === 1
    // Se conjuga de verdad: el mensaje decía «Se sacar de "NEW IN" en 26 productos» y el botón
    // «Sacar de en 26». Con 26 productos a punto de escribirse en la tienda, el cartel es lo único
    // que se lee antes.
    const verbo = accion === 'quitar' ? (uno ? 'Se saca' : 'Se sacan') : uno ? 'Se agrega' : 'Se agregan'
    const prep = accion === 'quitar' ? 'de' : 'a'
    const titulo = accion === 'quitar' ? 'Sacar de la categoría' : 'Agregar a la categoría'
    // 🔴 Sólo al SACAR: los que se quedan sin NINGUNA categoría no aparecen más en la navegación
    // de la tienda. Se dicen con nombre y ANTES de escribir — sacar de a uno no lo hacía visible,
    // sacar 91 de una sí.
    const huerfanos = accion === 'quitar' ? quedarianSinCategoria(items) : []
    const confirmado = await confirmar({
      titulo,
      tono: 'warning',
      ok: `${accion === 'quitar' ? 'Sacar' : 'Agregar'} ${uno ? '1' : `los ${items.length}`}`,
      mensaje: (
        <>
          {verbo} {uno ? '1 producto' : `${items.length} productos`} {prep} “{catNombre}”. Se escribe en la tienda EN
          VIVO de {ETIQUETA_LINEA[linea]}.
          {huerfanos.length > 0 && (
            <div style={{ marginTop: 10, fontWeight: 600 }}>
              {huerfanos.length === 1
                ? '1 de ellos se queda SIN NINGUNA categoría y deja'
                : `${huerfanos.length} de ellos se quedan SIN NINGUNA categoría y dejan`}{' '}
              de aparecer en la navegación de la tienda (se llega por buscador o link directo):{' '}
              <span style={{ fontWeight: 400 }}>
                {huerfanos.slice(0, 8).join(' · ')}
                {huerfanos.length > 8 ? ` … y ${huerfanos.length - 8} más` : ''}
              </span>
            </div>
          )}
        </>
      ),
    })
    if (!confirmado) return

    setAplicando(true)
    setMsg(null)
    let ok = 0
    const errores: string[] = []
    try {
      for (let i = 0; i < items.length; i += CHUNK) {
        const d = await aplicarAsignarLote(linea, items.slice(i, i + CHUNK))
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
      void bustAudit(linea)
    } catch (e) {
      setMsg('' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setAplicando(false)
    }
  }

  const fila = (p: ProductoCat, marcado: boolean, onToggle: () => void) => {
    const foto = (p.images || [])[0]
    const alta = p.created_at ? new Date(p.created_at).toLocaleDateString('es-AR') : null
    return (
      <label key={String(p.id)} style={{ display: 'flex', gap: 9, alignItems: 'center', border: `1px solid ${color.line}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
        <input type="checkbox" checked={marcado} onChange={onToggle} />
        {/* Sin foto se dibuja el hueco igual: si la fila se achicara, "sin foto" se leería como
            un renglón más corto y no como lo que es. */}
        {foto ? (
          /* 🔴 La fila entera es un <label>: sin frenar el evento acá, ampliar la foto TILDARÍA el
             producto para sacarlo de la categoría. El click se para en el span, no en la <img>,
             para que tape también el borde de la miniatura. */
          <span
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setAmpliada(foto)
            }}
            title="Ver la foto en grande"
            style={{ display: 'flex', flex: '0 0 auto', cursor: 'zoom-in' }}
          >
            <FotoTn src={foto} alt={p.name} ancho={MINI} style={{ width: MINI, height: MINI, objectFit: 'cover', borderRadius: 6, background: color.line }} />
          </span>
        ) : (
          <div title="El producto no tiene ninguna foto en la tienda" style={{ width: MINI, height: MINI, borderRadius: 6, background: color.line, color: color.mut2, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flex: '0 0 auto' }}>
            sin foto
          </div>
        )}
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>{p.name}</div>
          <div style={{ fontSize: 11.5, color: color.mut2 }}>
            {p.sku ? <>SKU {p.sku} · </> : null}
            {/* La fecha es el ALTA EN LA TIENDA, no el ingreso al depósito: se dice en el title
                para que nadie la lea como otra cosa. Sin fecha se dice "sin fecha", no 0 días. */}
            <span title={alta ? `Alta en la tienda: ${alta}` : 'El catálogo no trajo la fecha de alta'}>
              {etiquetaAntiguedad(p.created_at, ahora)}
            </span>
          </div>
        </div>
        {p.published === false ? <span style={{ fontSize: 11, color: color.warningInk, background: color.warningBg, borderRadius: 6, padding: '1px 7px' }}>oculto</span> : null}
      </label>
    )
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Explorar una categoría</div>
        <InfoPopover titulo="Explorar una categoría">
          Elegí una categoría y vas a ver <b>qué productos tiene hoy</b>, con su foto y{' '}
          <b>hace cuánto entraron a la tienda</b>, para sacar los que ya no van; y un buscador para{' '}
          <b>agregar</b> los que faltan. Sirve sobre todo para las categorías que cambian seguido (NEW IN,
          Best sellers, Ofertas). La fecha es la del <b>alta del producto en la tienda online</b>, no la del
          ingreso de la mercadería. Escribe en la tienda online al confirmar; TiendaNube no tiene un “sacar”:
          se manda la lista completa de categorías del producto, y de eso se encarga el sistema.
        </InfoPopover>
      </div>

      {/* ⚠️ Arriba del selector de categorías y no al lado del botón: las categorías que se listan
          abajo, los productos y lo que se escriba son de la tienda que diga acá. */}
      <SelectorLinea linea={linea} lineas={lineas} onChange={setLinea} />

      <select
        value={catId}
        onChange={(e) => {
          setCatId(e.target.value)
          setQDentro('')
          setEstado('todos')
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
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  <input
                    value={qDentro}
                    onChange={(e) => setQDentro(e.target.value)}
                    placeholder="Buscar acá adentro…"
                    style={{ flex: '1 1 140px', minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', border: `1px solid ${color.line2}`, borderRadius: 7 }}
                  />
                  <select
                    value={orden}
                    onChange={(e) => setOrden(e.target.value as OrdenCat)}
                    style={{ padding: '7px 8px', border: `1px solid ${color.line2}`, borderRadius: 7, fontSize: 12.5 }}
                  >
                    <option value="antiguos">Más viejos primero</option>
                    <option value="nuevos">Más nuevos primero</option>
                    <option value="nombre">A–Z</option>
                  </select>
                  {/* El filtro nombra lo que hay: "ocultos (91)" dice de entrada el tamaño del
                      trabajo, y con 0 no se ofrece un filtro que deja la lista vacía. */}
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value as EstadoCat)}
                    style={{ padding: '7px 8px', border: `1px solid ${color.line2}`, borderRadius: 7, fontSize: 12.5 }}
                  >
                    <option value="todos">Ocultos y visibles</option>
                    <option value="ocultos" disabled={ocultosDentro === 0}>
                      Sólo los ocultos ({ocultosDentro})
                    </option>
                    <option value="visibles" disabled={ocultosDentro === dentro.length}>
                      Sólo los visibles ({dentro.length - ocultosDentro})
                    </option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: color.mut2 }}>
                    {dentroVista.length === 0
                      ? 'Ninguno de los que están en la categoría coincide con este filtro.'
                      : `${dentroVista.length} de ${dentro.length}`}
                  </div>
                  {/* Tildar de a uno 91 ocultos no es trabajo, es una fuente de errores. El botón
                      dice SIEMPRE cuántos toca, y nunca escribe: el que escribe es el de abajo,
                      que además vuelve a confirmar. */}
                  {dentroVista.length > 0 && (
                    <button
                      onClick={() => {
                        const n = new Set(sacar)
                        dentroVista.forEach((p) => (vistaEntera ? n.delete(String(p.id)) : n.add(String(p.id))))
                        setSacar(n)
                      }}
                      style={{ background: 'none', border: 'none', color: color.brandSolid, cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}
                    >
                      {vistaEntera ? `Destildar estos ${dentroVista.length}` : `Tildar estos ${dentroVista.length}`}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflow: 'auto' }}>
                  {dentroVista.map((p) => fila(p, sacar.has(String(p.id)), () => toggle(sacar, setSacar, String(p.id))))}
                </div>
                {/* Lo tildado sobrevive al filtro (si no, buscar dos veces obligaría a tildar de
                    nuevo) ⇒ hay que decir cuántos van a salir sin estar a la vista. */}
                {tildadosOcultos > 0 && (
                  <div style={{ fontSize: 12, color: color.warningInk, marginTop: 6 }}>
                    {tildadosOcultos === 1 ? '1 tildado no se ve' : `${tildadosOcultos} tildados no se ven`} con esta búsqueda, y también{' '}
                    {tildadosOcultos === 1 ? 'sale' : 'salen'}.{' '}
                    <button onClick={() => setSacar(new Set())} style={{ background: 'none', border: 'none', color: color.brandSolid, cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}>
                      Destildar todo
                    </button>
                  </div>
                )}
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

      {/* Se le pasa la URL de TiendaNube TAL CUAL, sin `thumbTN`: la miniatura de 80 px estirada a
          pantalla completa se ve peor que la foto que la tienda ya sirve, y los 700 KB del original
          se bajan sólo cuando alguien la abre. Es la regla que ya está escrita en `thumb.ts`.
          El `Lightbox` es el del kit: cierra con Escape y con un click en cualquier lado. */}
      <Lightbox src={ampliada} alt="" onCerrar={() => setAmpliada(null)} />
    </Card>
  )
}
