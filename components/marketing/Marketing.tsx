'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { Lightbox } from '@/components/productos/Lightbox'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { ponerPuenteFotos } from '@/lib/sesionfotos/puente'
import type { Variante } from '@/lib/etl/tipos'
import {
  adminBaseUrl,
  aplicaTalles,
  buildLista,
  calcularStats,
  categoriasDisponibles,
  cohortesDisponibles,
  filtrarYOrdenar,
  mesLabelCorto,
  mesLabelLargo,
  tieneTabla,
  tiendaBaseUrl,
  type Columna,
  type FiltroCalidad,
  type Filtros,
  type ItemMkt,
  type OrdenState,
  ventasPorCanal,
} from '@/lib/marketing/core'
import { useMarketing } from './useMarketing'

const STALE = 15 * 60 * 1000 // fotos "viejas" a partir de 15 min (salvaguarda del puente)
const TOPE = 300 // la tabla muestra como mucho 300 filas (igual que el legacy)

/** Las opciones del multi de estado, con su etiqueta. */
const OPCIONES_CALIDAD: { v: FiltroCalidad; label: string }[] = [
  { v: 'sin-foto', label: 'Sin foto en TN' },
  { v: 'pocas-fotos', label: 'Pocas fotos (1-2)' },
  { v: 'sin-desc', label: 'Sin descripción' },
  { v: 'sin-tabla', label: '📏 Le falta tabla de talles (Zattia)' },
  { v: 'sin-foto-desc', label: '❌ Sin foto NI descripción' },
  { v: 'no-publicado', label: 'Oculto en TN' },
  { v: 'var-sin-foto', label: '🎨 Variantes sin foto propia' },
  { v: 'top-low-stock', label: '⚠ Top ventas con stock bajo' },
]

export function Marketing() {
  const { marca } = useSesion()
  const { datos } = useDatosMonitor()
  const audit = useMarketing(marca)
  const productos = datos?.allProductos ?? null
  const listo = !!productos && !!audit.data

  // today congelado al montar, como el TODAY del legacy (para el corte de 30 días).
  const today = useMemo(() => new Date(), [])

  // Lista base enriquecida (GN ⨯ TN). Se recompone solo cuando cambian los datos.
  const base = useMemo<ItemMkt[]>(
    () => (productos && audit.data ? buildLista(productos, audit.data.products, marca) : []),
    [productos, audit.data, marca],
  )

  // ── Estado de UI ──────────────────────────────────────────────────────────────
  const [filtros, setFiltros] = useState<Filtros>(() => ({
    q: '',
    cohortes: new Set(),
    catTn: '',
    stock: '',
    stockMin: '',
    stockMax: '',
    calidades: new Set(),
  }))
  const [orden, setOrden] = useState<OrdenState>({ col: 'sales30', dir: -1 })
  const [expandido, setExpandido] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ imagenes: string[]; nombre: string } | null>(null)
  const [multiAbierto, setMultiAbierto] = useState<'cohorte' | 'calidad' | null>(null)
  const [refrescando, setRefrescando] = useState(false)

  // Modo "elegir productos para sesión de fotos" (el puente).
  const [selMode, setSelMode] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())

  const talles = aplicaTalles(marca)

  const lista = useMemo(() => filtrarYOrdenar(base, filtros, orden, marca), [base, filtros, orden, marca])
  const stats = useMemo(() => calcularStats(base, marca), [base, marca])
  const cohortes = useMemo(() => (productos ? cohortesDisponibles(productos) : []), [productos])
  const categorias = useMemo(() => (audit.data ? categoriasDisponibles(audit.data.products) : []), [audit.data])

  // Cerrar los paneles multi al hacer click afuera (port del listener del legacy).
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest('.mkt-multi')) setMultiAbierto(null)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  const setFiltro = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros((f) => ({ ...f, [k]: v }))

  const toggleCalidadUnica = (v: FiltroCalidad) => {
    // Click en un KPI: fija ESE estado como único filtro (port de mktSetFiltro).
    setFiltros((f) => ({ ...f, calidades: new Set([v]) }))
  }

  const limpiarFiltros = () =>
    setFiltros({ q: '', cohortes: new Set(), catTn: '', stock: '', stockMin: '', stockMax: '', calidades: new Set() })

  const filtroTablasPendientes = () => {
    // Atajo: con stock + le falta la tabla (no toca cat ni mes). Port de mktFiltroTablasPendientes.
    setFiltros((f) => ({ ...f, stock: 'con', calidades: new Set<FiltroCalidad>(['sin-tabla']) }))
  }

  const sort = (col: Columna) =>
    setOrden((o) => (o.col === col ? { col, dir: (o.dir * -1) as 1 | -1 } : { col, dir: -1 }))

  const refrescarFotos = async () => {
    setRefrescando(true)
    try {
      await audit.refrescar()
    } catch {
      /* el error queda en audit.error */
    } finally {
      setRefrescando(false)
    }
  }

  // ── Puente a Sesión de fotos ────────────────────────────────────────────────────
  const entrarSel = async () => {
    // Salvaguarda: si las fotos están viejas (>15 min), refrescar antes de elegir
    // (así no se mandan productos que ya tienen imágenes). Port de mktSelEntrar.
    if (!audit.data?.cachedAt || Date.now() - audit.data.cachedAt > STALE) {
      setRefrescando(true)
      try {
        await audit.refrescar()
      } catch {
        /* seguimos igual: mejor elegir con datos viejos que no poder elegir */
      } finally {
        setRefrescando(false)
      }
    }
    setSel(new Set())
    setSelMode(true)
  }
  const cancelarSel = () => {
    setSelMode(false)
    setSel(new Set())
  }
  const router = useRouter()
  const mandarSel = () => {
    if (!sel.size) {
      alert('Tildá al menos un producto para mandar a Sesión de fotos.')
      return
    }
    ponerPuenteFotos([...sel])
    setSelMode(false)
    router.push('/sesion-fotos')
  }
  const toggleSel = (pid: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s)
      if (on) n.add(String(pid))
      else n.delete(String(pid))
      return n
    })
  const selTodos = (on: boolean) =>
    setSel((s) => {
      const n = new Set(s)
      lista.forEach((x) => (on ? n.add(String(x.gn.id)) : n.delete(String(x.gn.id))))
      return n
    })
  const todosTildados = lista.length > 0 && lista.every((x) => sel.has(String(x.gn.id)))

  // ── Render ──────────────────────────────────────────────────────────────────────
  const visibles = lista.slice(0, TOPE)
  const colspan = selMode ? 9 : 8

  return (
    <div>
      {/* Barra de acciones (el título/descripción los pone el SeccionHeader del shell). */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {audit.data?.cachedAt ? (
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>
              TN actualizado: {new Date(audit.data.cachedAt).toLocaleDateString('es-AR')}{' '}
              {new Date(audit.data.cachedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          ) : null}
          <button
            className="btn-sm"
            onClick={refrescarFotos}
            disabled={refrescando}
            title="Trae las fotos y datos más nuevos de TiendaNube (bypassa el cache). Tocalo si cargaste fotos recién."
            style={{ background: '#fff', border: '1px solid #D1D5DB' }}
          >
            {refrescando ? '⏳ Actualizando fotos…' : '🔄 Actualizar fotos'}
          </button>
          {talles && (
            <button
              className="btn-sm"
              onClick={filtroTablasPendientes}
              title="Filtra: con stock + le falta la tabla de talles. Después podés sumar Categoría (ej. Jeans) o Mes."
              style={{ background: '#0F766E', color: '#fff' }}
            >
              📏 Pendientes de tabla (con stock)
            </button>
          )}
          {selMode ? (
            <>
              <button className="btn-sm" onClick={mandarSel} style={{ background: '#7C3AED', color: '#fff' }}>
                📷 Mandar a sesión de fotos ({sel.size})
              </button>
              <button className="btn-sm" onClick={cancelarSel} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
                Cancelar
              </button>
            </>
          ) : (
            <button
              className="btn-sm"
              onClick={entrarSel}
              disabled={refrescando}
              title="Elegí productos para mandarlos a Sesión de fotos"
              style={{ background: '#7C3AED', color: '#fff' }}
            >
              📷 Productos para sesión de fotos
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 14 }}>
        <div className="stat" style={{ cursor: 'pointer' }} onClick={() => toggleCalidadUnica('sin-foto')}>
          <div className="stat-label">Sin foto en TN</div>
          <div className="stat-value danger">{stats.sinFoto}</div>
        </div>
        <div className="stat" style={{ cursor: 'pointer' }} onClick={() => toggleCalidadUnica('sin-desc')}>
          <div className="stat-label">Sin descripción</div>
          <div className="stat-value warning">{stats.sinDesc}</div>
        </div>
        {talles && (
          <div className="stat" style={{ cursor: 'pointer' }} onClick={() => toggleCalidadUnica('sin-tabla')}>
            <div className="stat-label">📏 Le falta tabla de talles</div>
            <div className="stat-value warning">{stats.sinTabla}</div>
          </div>
        )}
        <div className="stat" style={{ cursor: 'pointer' }} onClick={() => toggleCalidadUnica('sin-foto-desc')}>
          <div className="stat-label">❌ Sin foto ni descripción</div>
          <div className="stat-value danger">{stats.sinAmbos}</div>
        </div>
        <div className="stat" style={{ cursor: 'pointer' }} onClick={() => toggleCalidadUnica('top-low-stock')}>
          <div className="stat-label">⚠ Top ventas con stock bajo</div>
          <div className="stat-value danger">{stats.topLow}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <Filtro
            label="Buscar"
            info={<>Filtra los productos por su <b>nombre o código (SKU)</b>.</>}
          >
            <input
              type="text"
              value={filtros.q}
              onChange={(e) => setFiltro('q', e.target.value)}
              placeholder="🔍 Nombre o SKU..."
              style={inputStyle}
            />
          </Filtro>

          <Filtro
            label="Mes de ingreso"
            info={
              <>
                Muestra los productos que <b>entraron al catálogo</b> en los meses tildados. Podés elegir <b>varios</b>. Sin
                nada tildado = todos.
              </>
            }
          >
            <MultiSelect
              open={multiAbierto === 'cohorte'}
              onToggle={() => setMultiAbierto((k) => (k === 'cohorte' ? null : 'cohorte'))}
              etiquetaVacia="Todos los meses"
              seleccion={filtros.cohortes}
              opciones={cohortes.map((m) => ({ v: m, label: mesLabelLargo(m) }))}
              onChange={(next) => setFiltro('cohortes', next)}
            />
          </Filtro>

          <Filtro
            label="Categoría TN"
            info={<>Filtra por la <b>categoría</b> que tiene el producto en Tienda Nube.</>}
          >
            <select value={filtros.catTn} onChange={(e) => setFiltro('catTn', e.target.value)} style={inputStyle}>
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Filtro>

          <Filtro
            label="Stock"
            info={
              <>
                Filtra por stock disponible: <b>con stock</b>, <b>sin stock</b>, o un <b>rango</b> (ej. entre 1 y 5 para ver
                lo que está por agotarse). Independiente de los demás filtros.
              </>
            }
          >
            <select value={filtros.stock} onChange={(e) => setFiltro('stock', e.target.value)} style={inputStyle}>
              <option value="">Todos</option>
              <option value="con">Con stock (&gt; 0)</option>
              <option value="sin">Sin stock (= 0)</option>
              <option value="rango">Entre un rango…</option>
            </select>
            {filtros.stock === 'rango' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  type="number"
                  min={0}
                  value={filtros.stockMin}
                  onChange={(e) => setFiltro('stockMin', e.target.value)}
                  placeholder="mín"
                  style={{ ...inputStyle, width: '50%', padding: '6px 8px' }}
                />
                <input
                  type="number"
                  min={0}
                  value={filtros.stockMax}
                  onChange={(e) => setFiltro('stockMax', e.target.value)}
                  placeholder="máx"
                  style={{ ...inputStyle, width: '50%', padding: '6px 8px' }}
                />
              </div>
            )}
          </Filtro>

          <Filtro
            label="Estado de la ficha"
            info={
              <>
                Filtra por el <b>estado de la publicación</b>. Podés elegir <b>varios</b> a la vez (ej. &quot;sin foto&quot; +
                &quot;sin descripción&quot; = los que les falta foto O descripción). Ideal para encontrar lo que hay que
                completar.
              </>
            }
          >
            <MultiSelect
              open={multiAbierto === 'calidad'}
              onToggle={() => setMultiAbierto((k) => (k === 'calidad' ? null : 'calidad'))}
              etiquetaVacia="Todos los estados"
              seleccion={filtros.calidades}
              opciones={OPCIONES_CALIDAD}
              onChange={(next) => setFiltro('calidades', next as Set<FiltroCalidad>)}
            />
          </Filtro>
        </div>
        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <button className="btn-sm" onClick={limpiarFiltros} title="Resetear todos los filtros">
            ✕ Limpiar filtros
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ fontSize: 13 }}>
          <thead>
            <tr>
              {selMode && (
                <th style={{ width: 34, textAlign: 'center' }}>
                  <input type="checkbox" checked={todosTildados} onChange={(e) => selTodos(e.target.checked)} title="Elegir todos / ninguno" />
                </th>
              )}
              <th style={{ width: 72 }}>Foto</th>
              <th onClick={() => sort('name')} style={{ cursor: 'pointer' }}>
                Producto ↕
              </th>
              <th onClick={() => sort('cat_tn')} style={{ cursor: 'pointer', width: 160 }}>
                Cat. TN ↕
              </th>
              <th style={{ width: 120, textAlign: 'center' }}>Calidad TN</th>
              <th onClick={() => sort('stock')} style={{ cursor: 'pointer', width: 80, textAlign: 'right' }}>
                Stock ↕
              </th>
              <th onClick={() => sort('sales30')} style={{ cursor: 'pointer', width: 90, textAlign: 'right' }}>
                Ventas 30d ↕
              </th>
              <th style={{ width: 100, textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!listo ? (
              <tr>
                <td colSpan={colspan} style={{ textAlign: 'center', padding: 30, color: '#9CA3AF' }}>
                  {audit.error ? `Error: ${audit.error}` : 'Cargando datos de TiendaNube y cruzando con stock/ventas…'}
                </td>
              </tr>
            ) : visibles.length === 0 ? (
              <tr>
                <td colSpan={colspan} style={{ textAlign: 'center', padding: 30, color: '#9CA3AF' }}>
                  Sin resultados con los filtros actuales
                </td>
              </tr>
            ) : (
              visibles.map((x) => (
                <Fila
                  key={x.gn.id}
                  x={x}
                  marca={marca}
                  talles={talles}
                  selMode={selMode}
                  tildado={sel.has(String(x.gn.id))}
                  abierto={String(expandido) === String(x.gn.id)}
                  variantes={datos?.allVariantes ?? []}
                  ventas={datos?.ventas ?? []}
                  detalles={datos?.detalles ?? []}
                  today={today}
                  onToggleSel={(on) => toggleSel(String(x.gn.id), on)}
                  onExpand={() => setExpandido((e) => (String(e) === String(x.gn.id) ? null : String(x.gn.id)))}
                  onFoto={(imagenes, nombre) => setLightbox({ imagenes, nombre })}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {listo && lista.length > 0 && (
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8, textAlign: 'right' }}>
          {selMode ? (
            <>
              <b>{sel.size}</b> elegidos ·{' '}
            </>
          ) : null}
          Mostrando {Math.min(lista.length, TOPE)} de {lista.length} productos
          {lista.length > TOPE ? ' (limitado a 300, refiná filtros para ver más)' : ''}
        </div>
      )}

      {lightbox && <Lightbox imagenes={lightbox.imagenes} nombre={lightbox.nombre} onClose={() => setLightbox(null)} />}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

// ── Un filtro con su etiqueta + botón de info (popover) ────────────────────────────
function Filtro({ label, info, children }: { label: string; info: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, marginBottom: 5, display: 'flex', alignItems: 'center' }}>
        {label}
        <InfoPopover titulo={label}>{info}</InfoPopover>
      </div>
      {children}
    </div>
  )
}

// ── Multi-select (mes de ingreso / estado de la ficha) ─────────────────────────────
function MultiSelect({
  open,
  onToggle,
  etiquetaVacia,
  seleccion,
  opciones,
  onChange,
}: {
  open: boolean
  onToggle: () => void
  etiquetaVacia: string
  seleccion: Set<string>
  opciones: { v: string; label: string }[]
  onChange: (next: Set<string>) => void
}) {
  const labelDe = (v: string) => opciones.find((o) => o.v === v)?.label ?? v
  const texto =
    seleccion.size === 0 ? etiquetaVacia : seleccion.size === 1 ? labelDe([...seleccion][0]) : `${seleccion.size} seleccionados`
  const activo = seleccion.size > 0

  const cambiar = (v: string, on: boolean) => {
    const n = new Set(seleccion)
    if (on) n.add(v)
    else n.delete(v)
    onChange(n)
  }

  return (
    <div className="mkt-multi">
      <button type="button" className="mkt-multi-btn" onClick={onToggle}>
        <span style={activo ? { color: '#185fa5', fontWeight: 600 } : undefined}>{texto}</span>
        <span style={{ opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div className="mkt-multi-panel">
          {opciones.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9CA3AF', padding: 6 }}>Sin opciones</div>
          ) : (
            opciones.map((o) => (
              <label key={o.v}>
                <input type="checkbox" checked={seleccion.has(o.v)} onChange={(e) => cambiar(o.v, e.target.checked)} /> {o.label}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Una fila de producto (+ su detalle expandible) ─────────────────────────────────
function Fila({
  x,
  marca,
  talles,
  selMode,
  tildado,
  abierto,
  variantes,
  ventas,
  detalles,
  today,
  onToggleSel,
  onExpand,
  onFoto,
}: {
  x: ItemMkt
  marca: 'bdi' | 'zattia'
  talles: boolean
  selMode: boolean
  tildado: boolean
  abierto: boolean
  variantes: Variante[]
  ventas: import('@/lib/etl/tipos').FilaVenta[]
  detalles: import('@/lib/etl/tipos').FilaDetalle[]
  today: Date
  onToggleSel: (on: boolean) => void
  onExpand: () => void
  onFoto: (imagenes: string[], nombre: string) => void
}) {
  const img = x.tn.image_count ?? 0
  const fotoUrl = x.tn.images?.[0] || null
  const cohorteLabel = x.ingresoMes ? mesLabelCorto(x.ingresoMes) : ''
  const meta = [x.gn.category, cohorteLabel].filter(Boolean).join(' · ')
  const stockColor = x.stock === 0 ? '#DC2626' : x.stock <= 5 ? '#D97706' : x.topLowStock ? '#DC2626' : '#111'

  const handle = x.tn.handle || ''
  const tnId = x.tn.id || ''

  return (
    <>
      <tr>
        {selMode && (
          <td style={{ textAlign: 'center' }}>
            <input type="checkbox" checked={tildado} onChange={(e) => onToggleSel(e.target.checked)} title="Elegir para sesión de fotos" />
          </td>
        )}
        <td>
          {fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="foto-thumb"
              src={fotoUrl}
              loading="lazy"
              onClick={() => onFoto((x.tn.images || []).filter(Boolean), x.gn.name)}
              alt={x.gn.name}
            />
          ) : (
            <div className="foto-thumb-placeholder">Sin foto</div>
          )}
        </td>
        <td onClick={onExpand} style={{ cursor: 'pointer' }} title="Ver stock completo y ventas por canal">
          <div style={{ fontWeight: 500 }}>
            {abierto ? '▾' : '▸'} {x.gn.name}
          </div>
          {meta ? <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{meta}</div> : null}
        </td>
        <td style={{ fontSize: 12, color: '#666' }}>{x.categoriasTNStr || '—'}</td>
        <td style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <span title={img === 0 ? 'Sin foto' : img <= 2 ? 'Pocas fotos' : 'OK'} style={{ color: img === 0 ? '#DC2626' : img <= 2 ? '#D97706' : '#16A34A' }}>
              📷 {img}
            </span>
            <span title={x.tn.has_desc ? 'OK' : 'Sin descripción'} style={{ color: x.tn.has_desc ? '#16A34A' : '#DC2626' }}>
              📝 {x.tn.has_desc ? '✓' : '✗'}
            </span>
            {talles && x.tn.has_desc ? (
              tieneTabla(x.tn) ? (
                <span title="Con tabla de talles" style={{ color: '#16A34A' }}>
                  📏 ✓
                </span>
              ) : (
                <span title="Le falta la tabla de talles" style={{ color: '#D97706' }}>
                  📏 ✗
                </span>
              )
            ) : null}
            {!x.tn.published ? (
              <span title="Oculto" style={{ color: '#DC2626' }}>
                ●
              </span>
            ) : null}
          </span>
        </td>
        <td style={{ textAlign: 'right', fontWeight: 500 }}>
          {x.topLowStock ? (
            <strong style={{ color: '#DC2626' }}>⚠ {x.stock}</strong>
          ) : (
            <span style={{ color: stockColor }}>{x.stock}</span>
          )}
        </td>
        <td onClick={onExpand} style={{ textAlign: 'right', fontWeight: 500, cursor: 'pointer', color: '#378ADD' }} title="Ver Local vs Tienda online">
          {x.sales30}
        </td>
        <td style={{ textAlign: 'center', fontSize: 18 }}>
          {handle ? (
            <a href={`${tiendaBaseUrl(marca)}/productos/${handle}`} target="_blank" rel="noreferrer" title="Ver en tienda" style={{ color: '#378ADD', textDecoration: 'none' }}>
              🌐
            </a>
          ) : null}{' '}
          {tnId ? (
            <a href={`${adminBaseUrl(marca)}/${tnId}`} target="_blank" rel="noreferrer" title="Editar en TN admin" style={{ color: '#6366F1', textDecoration: 'none' }}>
              ✏️
            </a>
          ) : null}
        </td>
      </tr>
      {abierto && (
        <Detalle x={x} colspan={selMode ? 9 : 8} variantes={variantes} ventas={ventas} detalles={detalles} today={today} />
      )}
    </>
  )
}

// ── Fila de detalle: stock por variante + ventas por canal + fotos por variante ────
function Detalle({
  x,
  colspan,
  variantes,
  ventas,
  detalles,
  today,
}: {
  x: ItemMkt
  colspan: number
  variantes: Variante[]
  ventas: import('@/lib/etl/tipos').FilaVenta[]
  detalles: import('@/lib/etl/tipos').FilaDetalle[]
  today: Date
}) {
  const pid = String(x.gn.id)
  const vars = variantes
    .filter((v) => String(v.pid) === pid)
    .map((v) => ({ size: v.size, stock: v.stock || 0 }))
    .sort((a, b) => (a.size || '').localeCompare(b.size || '', 'es', { numeric: true }))
  const totalStock = vars.reduce((s, v) => s + v.stock, 0)
  const canal = ventasPorCanal(pid, 30, ventas, detalles, today)

  const tn = x.tn
  const sinFotoVar = tn.variantes_sin_foto || []
  const conVariantes = (tn.image_count || 0) > 0 && (tn.variantes_total || 0) > 1

  const titulo = (t: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#7F77DD', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{t}</div>
  )

  return (
    <tr>
      <td colSpan={colspan} style={{ background: '#F9FAFB', padding: '14px 22px', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
          <div>
            {titulo('Stock completo')}
            {vars.length ? (
              <table style={{ width: 'auto', fontSize: 12, borderCollapse: 'collapse' }}>
                <tbody>
                  {vars.map((v, i) => (
                    <tr key={i}>
                      <td style={{ padding: '2px 18px 2px 0', color: '#555' }}>{v.size || '—'}</td>
                      <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 600, color: v.stock <= 0 ? '#DC2626' : v.stock <= 5 ? '#D97706' : '#111' }}>{v.stock}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '5px 18px 2px 0', fontWeight: 700 }}>Total</td>
                    <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 700 }}>{totalStock}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <span style={{ color: '#9CA3AF', fontSize: 12 }}>Sin variantes con stock</span>
            )}
          </div>
          <div>
            {titulo('Ventas por canal')}
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div>
                🏠 <b>Local:</b> {canal.local} u
              </div>
              <div>
                🌐 <b>Tienda online:</b> {canal.online} u
              </div>
              <div style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4 }}>ventas de los últimos 30 días</div>
            </div>
          </div>
          <div>
            {titulo('Fotos por variante (TN)')}
            {conVariantes ? (
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                <div>
                  <b>{tn.variantes_con_foto || 0}</b> de {tn.variantes_total} variantes con foto propia
                </div>
                {sinFotoVar.length ? (
                  <div style={{ color: '#DC2626', marginTop: 3 }}>
                    Sin foto propia (usan la principal):
                    <br />
                    <b>{sinFotoVar.join(' · ')}</b>
                  </div>
                ) : (
                  <div style={{ color: '#16A34A', marginTop: 3 }}>✓ Todas las variantes tienen foto propia</div>
                )}
              </div>
            ) : (
              <div style={{ color: '#9CA3AF', fontSize: 12 }}>Una sola variante o sin fotos en TN.</div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}
