'use client'

/**
 * Marketing — auditoría de fichas de TiendaNube cruzada con stock y ventas.
 *
 * Tanda 10 del rediseño. Era la sección más grande que había quedado entera en el CSS
 * legacy: `.btn-sm` con un color inventado por botón, `.card`, `<table>` cruda sin
 * cabecera pegajosa, un `inputStyle` propio, un multi-select a mano (`.mkt-multi`) y las
 * acciones flotando arriba del contenido en vez de en el header de sección.
 *
 * Tres decisiones que valen la pena escribir:
 *
 * 1. **"Pendientes de tabla (con stock)" era un botón verde sólido**, del mismo peso que
 *    la acción principal de la pantalla. No es una acción: es un filtro guardado. Pasó a
 *    chip de la barra de filtros, y ahí además se ve cuándo está puesto.
 * 2. **Los KPI son filtros.** Ahora lo dicen en reposo ("Filtrar →") y el que está
 *    aplicado queda con anillo — antes tocabas uno, la tabla se filtraba y nada en la
 *    pantalla decía que estaba filtrada.
 * 3. **La columna "Calidad TN" era una hilera de emojis** (📷 3 · 📝 ✗ · 📏 ✗). Pasó a
 *    badges con tono: se lee el problema, que es lo accionable, sin tener que descifrar
 *    qué significa cada dibujito.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { Lightbox } from '@/components/productos/Lightbox'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { HeaderAcciones } from '@/components/layout/acciones'
import { ponerPuenteFotos } from '@/lib/sesionfotos/puente'
import type { Variante } from '@/lib/etl/tipos'
import { adminBaseUrl, linkProducto } from '@/lib/tienda'
import { baseDeLinea, type Linea } from '@/lib/lineas'
import { SelectorLinea } from '@/components/ui'
import {
  aplicaTalles,
  buildLista,
  calcularStats,
  categoriasDisponibles,
  cohortesDisponibles,
  filtrarYOrdenar,
  mesLabelCorto,
  mesLabelLargo,
  tieneTabla,
  type Columna,
  type FiltroCalidad,
  type Filtros,
  type ItemMkt,
  type OrdenState,
  ventasPorCanal,
} from '@/lib/marketing/core'
import { useMarketing } from './useMarketing'
import {
  Badge,
  Button,
  Field,
  FilterBar,
  Input,
  KpiCard,
  MenuMulti,
  Select,
  TBody,
  THead,
  TableWrap,
  Td,
  Th,
  Tr,
  color,
  font,
  space,
  weight,
  useConfirmar,
} from '@/components/ui'

const STALE = 15 * 60 * 1000 // fotos "viejas" a partir de 15 min (salvaguarda del puente)
const TOPE = 300 // la tabla muestra como mucho 300 filas (igual que el legacy)

/** Las opciones del multi de estado, con su etiqueta. */
const OPCIONES_CALIDAD: { v: FiltroCalidad; label: string }[] = [
  { v: 'sin-foto', label: 'Sin foto en TN' },
  { v: 'pocas-fotos', label: 'Pocas fotos (1-2)' },
  { v: 'sin-desc', label: 'Sin descripción' },
  { v: 'prosa-corta', label: 'Descripción corta (menos de 120 caracteres)' },
  { v: 'sin-tabla', label: 'Le falta tabla de talles (Zattia)' },
  { v: 'sin-foto-desc', label: 'Sin foto NI descripción' },
  { v: 'no-publicado', label: 'Oculto en TN' },
  { v: 'var-sin-foto', label: 'Variantes sin foto propia' },
  { v: 'top-low-stock', label: 'Top ventas con stock bajo' },
]

const FILTROS_VACIOS: Filtros = {
  q: '',
  cohortes: new Set(),
  catTn: '',
  stock: '',
  stockMin: '',
  stockMax: '',
  calidades: new Set(),
}

export function Marketing() {
  const { avisar } = useConfirmar()
  // 🔑 **Por línea, y las DOS mitades tienen que cortarse juntas** (22-ago-2026): los productos del
  // Gestión Nube por `porLinea`, y el catálogo de Tienda Nube por `?store=`. Stunned comparte el GN
  // de Zattia pero tiene **tienda propia**, así que cruzar los 667 productos de Zattia contra la TN
  // de Stunned —o al revés— no da una lista corta: da una lista MENTIROSA, porque `buildLista`
  // descarta lo que no matchea y `matchTn` cae a un match por palabras del nombre.
  const { datos, linea, setLinea, lineas } = useDatosMonitor({ porLinea: true })
  const audit = useMarketing(linea)
  // Lo que no depende de la tienda —si la marca lleva tabla de talles— cuelga de la marca base.
  const marca = baseDeLinea(linea)
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
  const [filtros, setFiltros] = useState<Filtros>(() => ({ ...FILTROS_VACIOS, cohortes: new Set(), calidades: new Set() }))
  const [orden, setOrden] = useState<OrdenState>({ col: 'sales30', dir: -1 })
  const [expandido, setExpandido] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ imagenes: string[]; nombre: string } | null>(null)
  const [refrescando, setRefrescando] = useState(false)

  // Modo "elegir productos para sesión de fotos" (el puente).
  const [selMode, setSelMode] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())

  const talles = aplicaTalles(marca)

  const lista = useMemo(() => filtrarYOrdenar(base, filtros, orden, marca), [base, filtros, orden, marca])
  const stats = useMemo(() => calcularStats(base, marca), [base, marca])
  const cohortes = useMemo(() => (productos ? cohortesDisponibles(productos) : []), [productos])
  const categorias = useMemo(() => (audit.data ? categoriasDisponibles(audit.data.products) : []), [audit.data])

  const setFiltro = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros((f) => ({ ...f, [k]: v }))

  /** ¿El único estado tildado es este? (es lo que pone un click en su KPI) */
  const calidadUnica = (v: FiltroCalidad) => filtros.calidades.size === 1 && filtros.calidades.has(v)

  const toggleCalidadUnica = (v: FiltroCalidad) => {
    // Click en un KPI: fija ESE estado como único filtro (port de mktSetFiltro). Si ya
    // era el único, el segundo click lo saca — es lo que dice el pie de la tarjeta.
    setFiltros((f) => ({ ...f, calidades: calidadUnica(v) ? new Set() : new Set([v]) }))
  }

  const hayFiltro =
    !!filtros.q || !!filtros.catTn || !!filtros.stock || filtros.cohortes.size > 0 || filtros.calidades.size > 0

  const limpiarFiltros = () => setFiltros({ ...FILTROS_VACIOS, cohortes: new Set(), calidades: new Set() })

  // Atajo: con stock + le falta la tabla (no toca cat ni mes). Port de mktFiltroTablasPendientes.
  const pendientesPuesto = filtros.stock === 'con' && calidadUnica('sin-tabla')
  const filtroTablasPendientes = () =>
    setFiltros((f) =>
      pendientesPuesto
        ? { ...f, stock: '', calidades: new Set() }
        : { ...f, stock: 'con', calidades: new Set<FiltroCalidad>(['sin-tabla']) },
    )

  const sort = (col: Columna) =>
    setOrden((o) => (o.col === col ? { col, dir: (o.dir * -1) as 1 | -1 } : { col, dir: -1 }))

  const dirDe = (col: Columna) => (orden.col === col ? (orden.dir === -1 ? ('desc' as const) : ('asc' as const)) : null)

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
  const router = useRouter()

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
  const mandarSel = () => {
    if (!sel.size) {
      void avisar('Tildá al menos un producto para enviar a Sesión de fotos.')
      return
    }
    // Marketing manda el producto entero y sin tildar: acá se elige QUÉ producto, no qué talle.
    // Y sin disparador: este botón sirve igual para una campaña que para tapar un faltante, así
    // que lo pregunta el borrador (`disparadorPorPuerta('marketing')` devuelve null por lo mismo).
    ponerPuenteFotos({ pids: [...sel], vids: [], disparador: null })
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
  const actualizado = audit.data?.cachedAt ? new Date(audit.data.cachedAt) : null

  return (
    <div>
      <SelectorLinea linea={linea} lineas={lineas} onChange={setLinea} />
      <HeaderAcciones>
        {actualizado && (
          <span style={{ fontSize: font.xs, color: color.mut2 }}>
            TN actualizado: {actualizado.toLocaleDateString('es-AR')}{' '}
            {actualizado.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <Button
          variant="outline"
          onClick={() => void refrescarFotos()}
          loading={refrescando}
          title="Trae las fotos y datos más nuevos de TiendaNube (bypassa el cache). Tocalo si cargaste fotos recién."
        >
          {refrescando ? 'Actualizando fotos…' : 'Actualizar fotos'}
        </Button>
        {!selMode && (
          <Button
            variant="solid"
            tone="brand"
            onClick={() => void entrarSel()}
            disabled={refrescando}
            title="Elegí productos para enviarlos a Sesión de fotos"
          >
            Productos para sesión de fotos
          </Button>
        )}
      </HeaderAcciones>

      {/* KPIs. Son FILTROS, no números decorativos: tocar uno filtra la tabla de abajo, y
          volver a tocarlo lo saca. Antes eran `.stat` del CSS legacy con una grilla fija
          de 4 columnas, así que el quinto se caía de la fila; `mo-kpis` acomoda los que haya. */}
      <div className="mo-kpis">
        <KpiCard
          label="Sin foto en TN"
          value={stats.sinFoto}
          tone="danger"
          activo={calidadUnica('sin-foto')}
          accionActiva="Sacar filtro ✕"
          onClick={() => toggleCalidadUnica('sin-foto')}
        />
        <KpiCard
          label="Sin descripción"
          value={stats.sinDesc}
          tone="warning"
          activo={calidadUnica('sin-desc')}
          accionActiva="Sacar filtro ✕"
          onClick={() => toggleCalidadUnica('sin-desc')}
        />
        <KpiCard
          label="Descripción corta"
          value={stats.prosaCorta}
          tone="warning"
          activo={calidadUnica('prosa-corta')}
          accionActiva="Sacar filtro ✕"
          onClick={() => toggleCalidadUnica('prosa-corta')}
        />
        {talles && (
          <KpiCard
            label="Le falta tabla de talles"
            value={stats.sinTabla}
            tone="warning"
            activo={calidadUnica('sin-tabla')}
            accionActiva="Sacar filtro ✕"
            onClick={() => toggleCalidadUnica('sin-tabla')}
          />
        )}
        <KpiCard
          label="Sin foto ni descripción"
          value={stats.sinAmbos}
          tone="danger"
          activo={calidadUnica('sin-foto-desc')}
          accionActiva="Sacar filtro ✕"
          onClick={() => toggleCalidadUnica('sin-foto-desc')}
        />
        <KpiCard
          label="Top ventas con stock bajo"
          value={stats.topLow}
          tone="danger"
          activo={calidadUnica('top-low-stock')}
          accionActiva="Sacar filtro ✕"
          onClick={() => toggleCalidadUnica('top-low-stock')}
        />
      </div>

      {/* Filtros */}
      <FilterBar>
        <Field
          width={220}
          label={
            <>
              Buscar
              <InfoPopover titulo="Buscar">
                Filtra los productos por su <b>nombre o código (SKU)</b>.
              </InfoPopover>
            </>
          }
        >
          <Input type="search" value={filtros.q} onChange={(e) => setFiltro('q', e.target.value)} placeholder="Nombre o SKU…" />
        </Field>

        <Field
          label={
            <>
              Mes de ingreso
              <InfoPopover titulo="Mes de ingreso">
                Muestra los productos que <b>entraron al catálogo</b> en los meses tildados. Podés elegir <b>varios</b>. Sin
                nada tildado = todos.
              </InfoPopover>
            </>
          }
        >
          <MenuMulti
            opciones={cohortes.map((m) => ({ key: m, label: mesLabelLargo(m) }))}
            seleccion={filtros.cohortes}
            onCambiar={(next) => setFiltro('cohortes', next)}
            vacio="Todos los meses"
            etiqueta={(n, unico) => (n === 1 && unico ? unico : `${n} meses`)}
          />
        </Field>

        <Field
          width={200}
          label={
            <>
              Categoría TN
              <InfoPopover titulo="Categoría TN">
                Filtra por la <b>categoría</b> que tiene el producto en Tienda Nube.
              </InfoPopover>
            </>
          }
        >
          <Select value={filtros.catTn} onChange={(e) => setFiltro('catTn', e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          width={170}
          label={
            <>
              Stock
              <InfoPopover titulo="Stock">
                Filtra por stock disponible: <b>con stock</b>, <b>sin stock</b>, o un <b>rango</b> (ej. entre 1 y 5 para ver
                lo que está por agotarse). Independiente de los demás filtros.
              </InfoPopover>
            </>
          }
        >
          <Select value={filtros.stock} onChange={(e) => setFiltro('stock', e.target.value)}>
            <option value="">Todos</option>
            <option value="con">Con stock (&gt; 0)</option>
            <option value="sin">Sin stock (= 0)</option>
            <option value="rango">Entre un rango…</option>
          </Select>
        </Field>

        {filtros.stock === 'rango' && (
          <Field width={160} label="Rango de stock">
            <div style={{ display: 'flex', gap: 6 }}>
              <Input
                type="number"
                min={0}
                value={filtros.stockMin}
                onChange={(e) => setFiltro('stockMin', e.target.value)}
                placeholder="mín"
                aria-label="Stock mínimo"
              />
              <Input
                type="number"
                min={0}
                value={filtros.stockMax}
                onChange={(e) => setFiltro('stockMax', e.target.value)}
                placeholder="máx"
                aria-label="Stock máximo"
              />
            </div>
          </Field>
        )}

        <Field
          label={
            <>
              Estado de la ficha
              <InfoPopover titulo="Estado de la ficha">
                Filtra por el <b>estado de la publicación</b>. Podés elegir <b>varios</b> a la vez (ej. &quot;sin foto&quot; +
                &quot;sin descripción&quot; = los que les falta foto O descripción). Ideal para encontrar lo que hay que
                completar.
              </InfoPopover>
            </>
          }
        >
          <MenuMulti
            opciones={OPCIONES_CALIDAD.map((o) => ({ key: o.v, label: o.label }))}
            seleccion={filtros.calidades as Set<string>}
            onCambiar={(next) => setFiltro('calidades', next as Set<FiltroCalidad>)}
            vacio="Todos los estados"
            etiqueta={(n, unico) => (n === 1 && unico ? unico : `${n} estados`)}
            ancho={210}
          />
        </Field>

        {/* Es un filtro guardado, no una acción: antes era un botón verde sólido, del
            mismo peso visual que la acción principal de la pantalla. */}
        {talles && (
          <div className="mo-chips" style={{ alignSelf: 'flex-end' }}>
            <button
              type="button"
              className="mo-chip"
              aria-pressed={pendientesPuesto}
              onClick={filtroTablasPendientes}
              title="Filtra: con stock + le falta la tabla de talles. Después podés sumar Categoría (ej. Jeans) o Mes."
            >
              Pendientes de tabla (con stock)
              <span className="mo-chip-n">{stats.sinTabla}</span>
            </button>
          </div>
        )}

        {hayFiltro && (
          <Button variant="ghost" onClick={limpiarFiltros} style={{ alignSelf: 'flex-end' }} title="Resetear todos los filtros">
            Limpiar filtros
          </Button>
        )}

        {listo && (
          <span className="mo-filterbar-right" style={{ alignSelf: 'flex-end' }}>
            {lista.length > TOPE
              ? `Mostrando ${TOPE} de ${lista.length.toLocaleString('es-AR')} productos (refiná filtros para ver más)`
              : `${lista.length.toLocaleString('es-AR')} ${lista.length === 1 ? 'producto' : 'productos'}`}
          </span>
        )}
      </FilterBar>

      {/* Tabla */}
      <TableWrap>
        <THead>
          <Tr>
            {selMode && (
              <Th width={38} align="center">
                <input
                  type="checkbox"
                  checked={todosTildados}
                  onChange={(e) => selTodos(e.target.checked)}
                  title="Elegir todos / ninguno"
                  style={{ accentColor: 'var(--mo-brand-solid)' }}
                />
              </Th>
            )}
            <Th width={76}>Foto</Th>
            {/* En porcentaje y no en px: el nombre del producto es la columna que se lee,
                y con auto-layout se la comían las de ancho fijo. */}
            <Th width="32%" onClick={() => sort('name')} sort={dirDe('name')}>
              Producto
            </Th>
            <Th width={150} onClick={() => sort('cat_tn')} sort={dirDe('cat_tn')}>
              Cat. TN
            </Th>
            <Th width={190}>Calidad TN</Th>
            <Th width={80} align="right" onClick={() => sort('stock')} sort={dirDe('stock')}>
              Stock
            </Th>
            <Th width={96} align="right" onClick={() => sort('sales30')} sort={dirDe('sales30')}>
              Ventas 30d
            </Th>
            <Th width={124} align="center">
              Acciones
            </Th>
          </Tr>
        </THead>
        <TBody>
          {!listo ? (
            <Tr>
              <Td colSpan={colspan} align="center" tall style={{ padding: 30, color: color.mut2 }}>
                {audit.error ? `Error: ${audit.error}` : 'Cargando datos de TiendaNube y cruzando con stock/ventas…'}
              </Td>
            </Tr>
          ) : visibles.length === 0 ? (
            <Tr>
              <Td colSpan={colspan} align="center" tall style={{ padding: 30, color: color.mut2 }}>
                Sin resultados con los filtros actuales
              </Td>
            </Tr>
          ) : (
            visibles.map((x) => (
              <Fila
                key={x.gn.id}
                x={x}
                linea={linea}
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
        </TBody>
      </TableWrap>

      {/* Modo selección: la barra queda fija abajo mientras se elige, con el contador.
          Antes el "N elegidos" era un renglón gris al pie de la tabla, así que había que
          scrollear hasta el final para saber cuántos llevabas. Mismo patrón que la barra
          de pendientes de Ubicaciones. */}
      {selMode && (
        <div style={BARRA}>
          <span style={{ fontSize: font.base, color: color.ink2 }}>
            <b>{sel.size}</b> {sel.size === 1 ? 'producto elegido' : 'productos elegidos'}
          </span>
          <Button variant="ghost" onClick={cancelarSel} style={{ marginLeft: 'auto' }}>
            Cancelar
          </Button>
          <Button variant="solid" tone="brand" onClick={mandarSel} disabled={!sel.size}>
            Mandar a sesión de fotos
          </Button>
        </div>
      )}

      {lightbox && <Lightbox imagenes={lightbox.imagenes} nombre={lightbox.nombre} onClose={() => setLightbox(null)} />}
    </div>
  )
}

const BARRA: React.CSSProperties = {
  position: 'sticky',
  bottom: 0,
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  marginTop: 12,
  padding: '10px 14px',
  background: 'var(--mo-surface)',
  border: '1px solid var(--mo-line)',
  borderRadius: 'var(--mo-r-xl)',
  boxShadow: 'var(--mo-sh-pop)',
}

// ── Una fila de producto (+ su detalle expandible) ─────────────────────────────────
function Fila({
  x,
  linea,
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
  /** ⚠️ Los links a la TIENDA van por la LÍNEA, no por la marca: Stunned tiene la suya. */
  linea: Linea
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
  const fotoUrl = x.tn.images?.[0] || null
  const cohorteLabel = x.ingresoMes ? mesLabelCorto(x.ingresoMes) : ''
  const meta = [x.gn.category, cohorteLabel].filter(Boolean).join(' · ')
  const stockColor = x.stock === 0 ? color.danger : x.stock <= 5 ? color.warning : x.topLowStock ? color.danger : color.ink

  const handle = x.tn.handle || ''
  const tnId = x.tn.id || ''

  return (
    <>
      <Tr>
        {selMode && (
          <Td align="center">
            <input
              type="checkbox"
              checked={tildado}
              onChange={(e) => onToggleSel(e.target.checked)}
              title="Elegir para sesión de fotos"
              style={{ accentColor: 'var(--mo-brand-solid)' }}
            />
          </Td>
        )}
        <Td tall>
          {fotoUrl ? (
            // 60px y no 44: a 44 dos remeras negras son indistinguibles, y la foto es el
            // segundo identificador de una prenda.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="mo-thumb"
              src={fotoUrl}
              loading="lazy"
              onClick={() => onFoto((x.tn.images || []).filter(Boolean), x.gn.name)}
              alt={x.gn.name}
            />
          ) : (
            <div className="mo-thumb mo-thumb--vacio">Sin foto</div>
          )}
        </Td>
        <Td wrap tall onClick={onExpand} title="Ver stock completo y ventas por canal" style={{ cursor: 'pointer' }}>
          <div style={{ fontWeight: weight.medium }}>
            <span aria-hidden style={{ color: color.mut2, marginRight: 4 }}>
              {abierto ? '▾' : '▸'}
            </span>
            {x.gn.name}
          </div>
          {meta ? <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2 }}>{meta}</div> : null}
        </Td>
        {/* Un producto puede estar en 15 categorías de TN (todos los modelos de iPhone).
            Si se deja envolver, esa fila sola mide media pantalla y aplasta el nombre del
            producto, que es lo que se viene a leer. Se recorta y el detalle va al tooltip. */}
        <Td title={x.categoriasTNStr || undefined} style={{ fontSize: font.sm, color: color.mut, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {x.categoriasTNStr || '—'}
        </Td>
        <Td wrap>
          <CalidadTN x={x} talles={talles} />
        </Td>
        <Td align="right" strong>
          {x.topLowStock ? (
            <strong style={{ color: color.danger }} title="Top de ventas con stock bajo">
              {x.stock}
            </strong>
          ) : (
            <span style={{ color: stockColor }}>{x.stock}</span>
          )}
        </Td>
        <Td align="right" strong onClick={onExpand} title="Ver Local vs Tienda online" style={{ cursor: 'pointer', color: color.brandSolid }}>
          {x.sales30}
        </Td>
        <Td align="center">
          <span style={{ display: 'inline-flex', gap: 10, fontSize: font.sm }}>
            {handle ? (
              <a
                href={linkProducto(linea, handle) || undefined}
                target="_blank"
                rel="noreferrer"
                title="Ver en la tienda"
                style={{ color: color.brandSolid, fontWeight: weight.semibold }}
              >
                Tienda
              </a>
            ) : null}
            {tnId ? (
              <a
                href={`${adminBaseUrl(linea)}/${tnId}`}
                target="_blank"
                rel="noreferrer"
                title="Editar la ficha en el admin de TN"
                style={{ color: color.brand, fontWeight: weight.semibold }}
              >
                Editar
              </a>
            ) : null}
          </span>
        </Td>
      </Tr>
      {abierto && (
        <Detalle x={x} colspan={selMode ? 9 : 8} variantes={variantes} ventas={ventas} detalles={detalles} today={today} />
      )}
    </>
  )
}

/**
 * Calidad de la ficha en TN. Era una hilera de emojis (📷 3 · 📝 ✗ · 📏 ✗) que había que
 * traducir mentalmente; ahora cada carencia se nombra, que es lo accionable. El conteo de
 * fotos se queda siempre porque "3 fotos" y "6 fotos" no son lo mismo aunque las dos
 * estén bien.
 */
function CalidadTN({ x, talles }: { x: ItemMkt; talles: boolean }) {
  const img = x.tn.image_count ?? 0
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      <Badge tone={img === 0 ? 'danger' : img <= 2 ? 'warning' : 'success'}>
        {img === 0 ? 'Sin foto' : `${img} ${img === 1 ? 'foto' : 'fotos'}`}
      </Badge>
      {x.prosa.banda === 'nada' && <Badge tone="danger">Sin descripción</Badge>}
      {x.prosa.banda === 'corta' && <Badge tone="warning">Descripción corta ({x.prosa.largo})</Badge>}
      {talles && x.prosa.banda !== 'nada' && !tieneTabla(x.tn) && (
        <Badge tone="warning">Sin tabla de talles</Badge>
      )}
      {!x.tn.published && <Badge tone="neutral">Oculto</Badge>}
    </span>
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
    <div style={{ fontSize: font.xs, fontWeight: weight.bold, color: color.brand, letterSpacing: 0, marginBottom: 6 }}>{t}</div>
  )

  return (
    <tr>
      <td colSpan={colspan} style={{ background: color.bg, padding: '14px 22px', borderBottom: `1px solid ${color.line}` }}>
        <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
          <div>
            {titulo('Stock completo')}
            {vars.length ? (
              <table style={{ width: 'auto', fontSize: font.sm, borderCollapse: 'collapse' }}>
                <tbody>
                  {vars.map((v, i) => (
                    <tr key={i}>
                      <td style={{ padding: '2px 18px 2px 0', color: color.mut }}>{v.size || '—'}</td>
                      <td
                        style={{
                          padding: '2px 0',
                          textAlign: 'right',
                          fontWeight: weight.semibold,
                          fontVariantNumeric: 'tabular-nums',
                          color: v.stock <= 0 ? color.danger : v.stock <= 5 ? color.warning : color.ink,
                        }}
                      >
                        {v.stock}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `1px solid ${color.line}` }}>
                    <td style={{ padding: '5px 18px 2px 0', fontWeight: weight.bold }}>Total</td>
                    <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums' }}>
                      {totalStock}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <span style={{ color: color.mut2, fontSize: font.sm }}>Sin variantes con stock</span>
            )}
          </div>
          <div>
            {titulo('Ventas por canal')}
            <div style={{ fontSize: font.base, lineHeight: 1.7 }}>
              <div>
                <b>Local:</b> {canal.local} u
              </div>
              <div>
                <b>Tienda online:</b> {canal.online} u
              </div>
              <div style={{ color: color.mut2, fontSize: font.xs, marginTop: 4 }}>ventas de los últimos 30 días</div>
            </div>
          </div>
          <div>
            {titulo('Fotos por variante (TN)')}
            {conVariantes ? (
              <div style={{ fontSize: font.base, lineHeight: 1.6 }}>
                <div>
                  <b>{tn.variantes_con_foto || 0}</b> de {tn.variantes_total} variantes con foto propia
                </div>
                {sinFotoVar.length ? (
                  <div style={{ color: color.danger, marginTop: space[1] }}>
                    Sin foto propia (usan la principal):
                    <br />
                    <b>{sinFotoVar.join(' · ')}</b>
                  </div>
                ) : (
                  <div style={{ marginTop: space[1] }}>
                    <Badge tone="success">Todas las variantes tienen foto propia</Badge>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: color.mut2, fontSize: font.sm }}>Una sola variante o sin fotos en TN.</div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}
