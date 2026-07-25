'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { asegurarTnPromo } from '@/components/productos/useTnImages'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { indexarTn, type IndiceTn } from '@/lib/tn'
import type { Marca } from '@/lib/nav'
import { auditVariantes, desvincularColor, vincularColor } from '@/lib/tncat/cliente'
import { stockPorProductoTn } from '@/lib/tncat/agotados'
import { aplicarRecortes, categoriasDe, coloresConFoto, filtrar, sinFoto, sinVincular } from '@/lib/tncat/fchk'
import { dejarDeIgnorar, ignorarProducto, leerIgnorados, MOTIVOS_IGNORAR } from '@/lib/tncat/ignorados'
import type { FiltroFchk, ProductoFchk } from '@/lib/tncat/tipos'
import { useConfirmar, useToast } from '@/components/ui'

const MAX = 150

/** Acción pendiente de confirmar en el modal (con preview grande). Nada escribe hasta Aceptar. */
type Accion = {
  tipo: 'vincular' | 'quitar'
  prodId: string | number
  color: string
  src: string | null // foto a mostrar en grande (candidata a vincular, o la actual a quitar)
  imageId?: string | number // solo en 'vincular'
  pending?: boolean
  error?: string
}

/**
 * Revisar fotos por variante (card 3, fchk). Encuentra productos donde una foto se
 * cargó pero no quedó pegada al color, o que no tienen ninguna. Tocá una foto del
 * producto para vincularla al color (ESCRIBE en TN). Port de fchk*.
 */
export function FotosCard({ marca }: { marca: Marca }) {
  const { pedirTexto } = useConfirmar()
  const toast = useToast()
  const { perfil } = useSesion()
  const { datos } = useDatosMonitor()
  const [data, setData] = useState<ProductoFchk[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<FiltroFchk>('problema')
  const [busqueda, setBusqueda] = useState('')
  const [accion, setAccion] = useState<Accion | null>(null)

  // Los tres recortes que hacen usable una lista de 200 y pico de productos.
  const [soloConStock, setSoloConStock] = useState(true)
  const [categoria, setCategoria] = useState<string>('')
  const [ignorados, setIgnorados] = useState<Set<string>>(new Set())
  const [verIgnorados, setVerIgnorados] = useState(false)
  const [idx, setIdx] = useState<IndiceTn | null>(null)

  useEffect(() => {
    let vivo = true
    // El índice de TN se usa para cruzar el stock de GN por producto (el match es el mismo
    // que usan Ocultar agotados y Márgenes).
    asegurarTnPromo(marca)
      .then((i) => vivo && setIdx(i))
      .catch(() => vivo && setIdx(indexarTn([])))
    leerIgnorados(marca)
      .then((l) => vivo && setIgnorados(new Set(l.map((x) => String(x.tn_id)))))
      .catch(() => {
        /* si no se pueden leer, se muestran todos: es peor esconder de más */
      })
    return () => {
      vivo = false
    }
  }, [marca])

  const stockPorTn = useMemo(() => (idx && datos ? stockPorProductoTn(datos.allProductos, idx) : undefined), [idx, datos])

  const ignorar = async (p: ProductoFchk) => {
    const motivo = await pedirTexto(`¿Por qué no hay que revisar "${p.name}"?`, MOTIVOS_IGNORAR[0], {
      titulo: 'Ignorar el producto',
      ok: 'Ignorar',
      placeholder: MOTIVOS_IGNORAR.join(' · '),
    })
    if (motivo === null) return
    const id = String(p.id)
    setIgnorados((prev) => new Set([...prev, id])) // optimista
    try {
      await ignorarProducto(marca, id, p.name, motivo.trim() || 'Otro', perfil?.name)
    } catch (e) {
      setIgnorados((prev) => {
        const n = new Set(prev)
        n.delete(id)
        return n
      })
      toast.error('No se pudo guardar: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const restaurar = async (p: ProductoFchk) => {
    const id = String(p.id)
    setIgnorados((prev) => {
      const n = new Set(prev)
      n.delete(id)
      return n
    })
    try {
      await dejarDeIgnorar(marca, id)
    } catch (e) {
      setIgnorados((prev) => new Set([...prev, id]))
      toast.error('No se pudo guardar: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const cargar = async (refrescar = false) => {
    setCargando(true)
    try {
      setData(await auditVariantes(marca, refrescar))
    } catch {
      setData([])
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      try {
        const d = await auditVariantes(marca)
        if (vivo) setData(d)
      } catch {
        if (vivo) setData([])
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  // Primero los recortes (stock / ignorados / categoría) y recién después el filtro de
  // problema: así los contadores de arriba cuentan lo que se está mirando, no el catálogo
  // entero. La pestaña "ignorados" muestra justamente lo apartado, para poder revertirlo.
  const visible = useMemo(
    () =>
      verIgnorados
        ? data.filter((p) => ignorados.has(String(p.id)))
        : aplicarRecortes(data, { soloConStock, stockPorTn, ignorados, categoria: categoria || null }),
    [data, verIgnorados, ignorados, soloConStock, stockPorTn, categoria],
  )
  const categorias = useMemo(() => categoriasDe(data), [data])
  const nSinVinc = visible.filter(sinVincular).length
  const nSinFoto = visible.filter(sinFoto).length
  const lista = filtrar(visible, filtro, busqueda)
  const nApartados = data.length - aplicarRecortes(data, { soloConStock, stockPorTn, ignorados, categoria: categoria || null }).length

  // Abren el modal de confirmación (con preview grande). NO escriben todavía.
  const pedirVincular = (prodId: string | number, imageId: string | number, color: string, src: string | null) =>
    setAccion({ tipo: 'vincular', prodId, imageId, color, src })
  const pedirQuitar = (prodId: string | number, color: string, src: string | null) =>
    setAccion({ tipo: 'quitar', prodId, color, src })

  // Confirmación del modal: recién acá se escribe en TiendaNube.
  const ejecutar = async () => {
    if (!accion || accion.pending) return
    const { tipo, prodId, color, imageId } = accion
    setAccion((a) => (a ? { ...a, pending: true, error: undefined } : a))
    try {
      const j =
        tipo === 'vincular'
          ? await vincularColor(marca, prodId, imageId as string | number, color)
          : await desvincularColor(marca, prodId, color)
      const hechas = tipo === 'vincular' ? j.variantesAsignadas : j.variantesDesasignadas
      if (j.ok && (j.variantesObjetivo ?? 0) > 0 && (hechas ?? 0) >= (j.variantesObjetivo ?? 0)) {
        // Refleja el cambio en memoria sin re-pegar al server. En 'quitar' la foto pasa a null.
        const nuevaFoto = tipo === 'vincular' ? accion.src : null
        setData((prev) =>
          prev.map((x) =>
            x.id !== prodId
              ? x
              : {
                  ...x,
                  variantes: (x.variantes || []).map((v) => (v.color === color ? { ...v, image_url: nuevaFoto } : v)),
                  variantes_con_foto: (x.variantes || []).filter((v) => (v.color === color ? nuevaFoto : v.image_url)).length,
                },
          ),
        )
        setAccion(null)
      } else {
        const detalle = j.error || ((j.variantesObjetivo ?? 0) === 0 ? `el color "${color}" no coincide con ninguna variante en TN` : `${tipo === 'vincular' ? 'vinculó' : 'quitó'} ${hechas ?? 0}/${j.variantesObjetivo}`)
        setAccion((a) => (a ? { ...a, pending: false, error: detalle } : a))
      }
    } catch {
      setAccion((a) => (a ? { ...a, pending: false, error: 'Error de conexión.' } : a))
    }
  }

  const btn = (k: FiltroFchk, t: string) => (
    <button
      onClick={() => setFiltro(k)}
      style={{ border: `1px solid ${filtro === k ? '#378ADD' : '#D1D5DB'}`, background: filtro === k ? '#378ADD' : '#fff', color: filtro === k ? '#fff' : '#374151', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
    >
      {t}
    </button>
  )

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>🔎 Revisar fotos por variante</div>
        <button className="btn-sm" onClick={() => cargar(true)} title="Volvé a traer el estado real desde TiendaNube" style={{ background: '#fff', border: '1px solid #D1D5DB', marginLeft: 'auto' }}>
          🔄 Actualizar
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 12px' }}>
        Encontrá los productos donde una foto se cargó pero <b>no quedó pegada al color</b>, o que no tienen ninguna foto. Tocá una foto para verla en grande y confirmar el cambio.
      </div>

      {cargando ? (
        <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando estado de fotos…</div>
      ) : (
        <>
          {/* Recortes: qué parte del catálogo se está mirando. Van arriba de los filtros de
              problema porque decidir "sobre qué" es anterior a decidir "qué buscar". */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }}>
            <label style={{ fontSize: 12.5, color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <input type="checkbox" checked={soloConStock} disabled={verIgnorados} onChange={(e) => setSoloConStock(e.target.checked)} />
              Solo con stock
            </label>
            <InfoPopover titulo="Solo con stock">
              La foto sirve para vender: si el producto no tiene unidades en Gestión Nube, arreglarla no es
              trabajo de hoy. Si un producto no se pudo cruzar con la tienda, se muestra igual — preferimos
              que sobre uno antes que esconder uno que sí hay que arreglar.
            </InfoPopover>

            {categorias.length > 0 && (
              <label style={{ fontSize: 12.5, color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                Categoría
                <select
                  value={categoria}
                  disabled={verIgnorados}
                  onChange={(e) => setCategoria(e.target.value)}
                  style={{ padding: '5px 8px', border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', maxWidth: 220 }}
                >
                  <option value="">Todas</option>
                  {categorias.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}

            <button
              className="btn-sm"
              onClick={() => setVerIgnorados((v) => !v)}
              style={{ background: verIgnorados ? '#EEF2FF' : '#fff', border: `1px solid ${verIgnorados ? '#C7D2FE' : '#D1D5DB'}`, color: verIgnorados ? '#3730A3' : '#374151', marginLeft: 'auto' }}
            >
              {verIgnorados ? '← Volver a la revisión' : `🚫 Ignorados (${ignorados.size})`}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            {btn('problema', 'Todos con problema')}
            {btn('sinvincular', `Sin vincular al color (${nSinVinc})`)}
            {btn('sinfoto', `Sin ninguna foto (${nSinFoto})`)}
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔎 Buscar producto…" style={{ flex: 1, minWidth: 180, padding: '7px 9px', border: '1px solid #D1D5DB', borderRadius: 7 }} />
          </div>

          {!verIgnorados && nApartados > 0 && (
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
              {nApartados === 1 ? 'Hay 1 producto fuera de esta vista' : `Hay ${nApartados} productos fuera de esta vista`} por los recortes de arriba.
            </div>
          )}

          {lista.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontSize: 13, padding: 16, textAlign: 'center' }}>
              {verIgnorados ? 'No hay productos apartados de la revisión.' : '✅ No hay productos con problema en este filtro.'}
            </div>
          ) : (
            <>
              {lista.slice(0, MAX).map((p) => (
                <ProductoFila
                  key={p.id}
                  p={p}
                  onPedirVincular={pedirVincular}
                  onPedirQuitar={pedirQuitar}
                  ignorado={verIgnorados}
                  onIgnorar={() => void ignorar(p)}
                  onRestaurar={() => void restaurar(p)}
                />
              ))}
              {lista.length > MAX ? <div style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', padding: 8 }}>Mostrando {MAX} de {lista.length}. Afiná con el buscador.</div> : null}
            </>
          )}
        </>
      )}

      {accion && <ModalConfirmar accion={accion} onCancelar={() => setAccion(null)} onAceptar={ejecutar} />}
    </div>
  )
}

/** Modal de confirmación con la foto en grande. Nada se escribe hasta Aceptar. */
function ModalConfirmar({ accion, onCancelar, onAceptar }: { accion: Accion; onCancelar: () => void; onAceptar: () => void }) {
  const quitar = accion.tipo === 'quitar'
  return (
    <div
      onClick={accion.pending ? undefined : onCancelar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 18, maxWidth: 460, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,.3)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          {quitar ? 'Quitar foto del color ' : 'Vincular foto al color '}
          <span style={{ color: '#378ADD' }}>{accion.color}</span>
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>
          {quitar ? 'La variante vuelve a quedar sin foto en TiendaNube.' : 'Se escribe en TiendaNube en vivo.'}
        </div>
        {accion.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={accion.src} alt="" style={{ display: 'block', width: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 10, background: '#F3F4F6', border: '1px solid #E5E7EB' }} />
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', background: '#F3F4F6', borderRadius: 10 }}>Sin vista previa</div>
        )}
        {accion.error ? <div style={{ color: '#DC2626', fontSize: 12, marginTop: 10 }}>No se pudo: {accion.error}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn-sm" onClick={onCancelar} disabled={accion.pending} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
            Cancelar
          </button>
          <button
            className="btn-sm"
            onClick={onAceptar}
            disabled={accion.pending}
            style={{ background: accion.pending ? '#93C5FD' : quitar ? '#DC2626' : '#378ADD', color: '#fff', border: 'none' }}
          >
            {accion.pending ? 'Guardando…' : quitar ? 'Quitar foto' : 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductoFila({
  p,
  onPedirVincular,
  onPedirQuitar,
  ignorado,
  onIgnorar,
  onRestaurar,
}: {
  p: ProductoFchk
  onPedirVincular: (prodId: string | number, imageId: string | number, color: string, src: string | null) => void
  onPedirQuitar: (prodId: string | number, color: string, src: string | null) => void
  ignorado?: boolean
  onIgnorar?: () => void
  onRestaurar?: () => void
}) {
  // Apartar un producto de la revisión (mayorista, prueba) o devolverlo a ella. Es lo que
  // hace que la lista pueda llegar a cero y sirva como tablero.
  const botonApartar = ignorado ? (
    <button onClick={onRestaurar} title="Volver a revisarlo" style={estiloApartar}>
      ↩︎ Revisar de nuevo
    </button>
  ) : (
    <button onClick={onIgnorar} title="No hace falta revisar este producto" style={estiloApartar}>
      🚫 No revisar
    </button>
  )

  if (sinFoto(p)) {
    return (
      <div style={{ border: '1px solid #FED7AA', background: '#FFF7ED', borderRadius: 9, padding: '10px 12px', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600, flex: 1, minWidth: 160 }}>
            {p.name} <span style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>sin ninguna foto</span>
          </div>
          {botonApartar}
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>
          Subí las fotos en <b>📷 Carga de imágenes</b> (arriba). Acá no hay nada para vincular todavía.
        </div>
      </div>
    )
  }
  const colores = coloresConFoto(p)
  const conFoto = colores.filter((c) => c.foto).length
  const nSin = colores.length - conFoto
  const imgs = p.imagenes || []
  return (
    <div style={{ border: `1px solid ${nSin ? '#FCA5A5' : '#E5E7EB'}`, background: nSin ? '#FEF2F2' : '#fff', borderRadius: 9, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, flex: 1, minWidth: 160 }}>
          {p.name} <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 400 }}>· {conFoto}/{colores.length} colores con foto{nSin ? ` · ${nSin} sin vincular` : ''}</span>
        </div>
        {botonApartar}
      </div>
      <div style={{ marginTop: 4 }}>
        {colores.map(({ color, foto }) =>
          foto ? (
            <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid #F1F5F9' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto}
                alt={color}
                onClick={() => onPedirQuitar(p.id, color, foto)}
                title={`Ver en grande / quitar la foto de ${color}`}
                style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 6, border: '2px solid #16A34A', flex: '0 0 auto', cursor: 'zoom-in' }}
              />
              <div style={{ fontSize: 13 }}>
                <b>{color}</b> <span style={{ color: '#16A34A' }}>✓ con foto</span>
              </div>
              <button
                onClick={() => onPedirQuitar(p.id, color, foto)}
                title={`Quitar la foto de ${color}`}
                style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
              >
                Quitar foto
              </button>
            </div>
          ) : (
            <div key={color} style={{ padding: '5px 0', borderTop: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 13 }}>
                <b>{color}</b> <span style={{ color: '#DC2626' }}>⚠ sin foto</span> <span style={{ color: '#9CA3AF', fontSize: 11 }}>— tocá una foto para vincularla:</span>
              </div>
              {imgs.length ? (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                  {imgs.map((im) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={im.id}
                      src={im.src}
                      onClick={() => onPedirVincular(p.id, im.id, color, im.src)}
                      title={`Vincular esta foto a ${color}`}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '2px solid #D1D5DB', cursor: 'pointer', flex: '0 0 auto' }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ),
        )}
      </div>
    </div>
  )
}

const estiloApartar: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#6B7280',
  background: '#fff',
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  padding: '3px 9px',
  cursor: 'pointer',
  flex: '0 0 auto',
}
