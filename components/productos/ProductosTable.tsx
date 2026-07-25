'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { DetalleVariante } from '@/components/productos/DetalleVariante'
import { Lightbox } from '@/components/productos/Lightbox'
import { asegurarTnPromo, useTnImages } from '@/components/productos/useTnImages'
import { generarReporteSale } from '@/components/productos/reporteSale'
import { BotonActualizarInventario } from '@/components/productos/BotonActualizarInventario'
import { formatLifespan } from '@/lib/etl/helpers'
import type { DatosETL, Producto } from '@/lib/etl/tipos'
import { LIFESPAN_SIN_DATO } from '@/lib/etl/tipos'
import {
  colorStock,
  filtrarProductos,
  lifespanDaysByMode,
  mesLabel,
  mesesIngreso,
  proveedores,
  type ModoVidaUtil,
} from '@/lib/productos'
import { imagenDe, imagenesDe, type IndiceTn } from '@/lib/tn'
import { paginar, sortList, totalPaginas } from '@/lib/tabla'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  BuscarInput,
  Button,
  DatosGate,
  EmptyState,
  FaseBadge,
  FilterBar,
  MenuMulti,
  MiniBar,
  Paginacion,
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
  useFiltroUrl,
} from '@/components/ui'

/**
 * "📊 Por producto" (key `productos`, BDI + Zattia).
 *
 * Filtros, selector de vida útil, orden por columna, paginado de a 50, foto de TN,
 * detalle de variantes expandible y selección para el reporte de sale. La lógica de
 * dominio vive en `lib/productos.ts` y `lib/tabla.ts`, con paridad contra el fixture ETL.
 *
 * Rediseño jul-2026 (patrón Listado): es la sección más cargada de filtros y estaban los
 * siete en una sola fila corrida junto a las acciones, sin distinguir "qué filtro" de
 * "qué hago". Ahora las acciones (generar sale, actualizar inventario) van al header y
 * los filtros a la barra de abajo. La cabecera de la tabla es pegajosa, el orden se
 * marca solo en la columna activa, y **la selección para el sale se ve siempre**: antes,
 * como sobrevive a filtros y páginas, era fácil generar un PDF con productos que ya no
 * estaban en pantalla sin darse cuenta.
 */

type ColOrden = 'name' | 'lastSale' | 'sales7' | 'sales30' | 'sales90' | 'lifespan' | 'stock'

export function ProductosTable() {
  const { datos, error } = useDatosMonitor()
  const { marca } = useSesion()
  const tnIdx = useTnImages(marca)

  const [busqueda, setBusqueda] = useFiltroUrl<string>('q', '')
  const [estado, setEstado] = useFiltroUrl<string>('estado', '')
  const [proveedor, setProveedor] = useState('')
  const [ingresos, setIngresos] = useState<Set<string>>(new Set())
  const [ocultarSinStock, setOcultarSinStock] = useState(false)
  const [modoVU, setModoVU] = useState<ModoVidaUtil>('30d')
  const [col, setCol] = useState<ColOrden>('sales30')
  const [dir, setDir] = useState(-1)
  const [page, setPage] = useState(1)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ imagenes: string[]; nombre: string } | null>(null)
  const [outletSel, setOutletSel] = useState<Set<string>>(new Set())
  const [generando, setGenerando] = useState(false)

  const productos = useMemo(() => datos?.allProductos ?? [], [datos])
  const listaProv = useMemo(() => proveedores(productos), [productos])
  const meses = useMemo(() => mesesIngreso(productos), [productos])

  // Volver a la página 1 cuando cambia el conjunto filtrado (el legacy resetea pageState
  // en cada handler de filtro). Un effect sobre la firma de los filtros.
  const firmaFiltros = `${busqueda}|${estado}|${proveedor}|${[...ingresos].sort().join(',')}|${ocultarSinStock}|${modoVU}`
  const primeraRef = useRef(true)
  useEffect(() => {
    if (primeraRef.current) {
      primeraRef.current = false
      return
    }
    setPage(1)
  }, [firmaFiltros])

  const filtrada = useMemo(
    () => filtrarProductos(productos, { busqueda, estado, proveedor, ingresos, ocultarSinStock }),
    [productos, busqueda, estado, proveedor, ingresos, ocultarSinStock],
  )

  // El legacy pisa `lifespan` con el valor del modo (sentinel si no hay dato) ANTES de
  // ordenar, así la columna "Vida útil" ordena por el modo elegido. Se replica sobre una
  // copia con el campo pisado.
  const ordenada = useMemo(() => {
    const conLifespan = filtrada.map((p) => ({ ...p, lifespan: lifespanDaysByMode(p, modoVU) ?? LIFESPAN_SIN_DATO }))
    return sortList(conLifespan, col, dir)
  }, [filtrada, modoVU, col, dir])

  const paginas = totalPaginas(ordenada.length)
  const pageClamp = Math.min(page, Math.max(1, paginas))
  const slice = useMemo(() => paginar(ordenada, pageClamp), [ordenada, pageClamp])

  function ordenar(c: ColOrden) {
    if (col === c) setDir((d) => d * -1)
    else {
      setCol(c)
      setDir(-1)
    }
    setPage(1)
  }

  function toggleOutlet(id: string, on: boolean) {
    setOutletSel((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  }

  // La selección persiste a través de páginas y filtros (el legacy filtra sobre
  // allProductos, no sobre la página). El precio promo se asegura al click.
  async function generarSale() {
    if (!outletSel.size || generando) return
    setGenerando(true)
    try {
      const promoIdx = await asegurarTnPromo(marca)
      const sel = productos.filter((p) => outletSel.has(p.id))
      await generarReporteSale(sel, promoIdx, modoVU)
    } finally {
      setGenerando(false)
    }
  }

  const th = (c: ColOrden, label: string, align?: 'right') => (
    <Th align={align} onClick={() => ordenar(c)} sort={col === c ? (dir === -1 ? 'desc' : 'asc') : null}>
      {label}
    </Th>
  )

  return (
    <DatosGate datos={datos} error={error} esqueleto="tabla">
      {(d) => (
        <>
          <HeaderAcciones>
            <BotonActualizarInventario />
            <Button variant="solid" tone="brand" onClick={() => void generarSale()} loading={generando} disabled={!outletSel.size}>
              Generar sale{outletSel.size ? ` (${outletSel.size})` : ''}
            </Button>
          </HeaderAcciones>

          <FilterBar>
            <BuscarInput value={busqueda} onChange={setBusqueda} placeholder="Buscar producto…" />
            <Select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ width: 180 }} aria-label="Estado">
              <option value="">Todos los estados</option>
              <option value="crecimiento">Crecimiento</option>
              <option value="madurez">Madurez</option>
              <option value="declive">Declive</option>
              <option value="dormido">Dormido</option>
              <option value="obsoleto">Obsoleto</option>
            </Select>
            <Select value={proveedor} onChange={(e) => setProveedor(e.target.value)} style={{ width: 190 }} aria-label="Proveedor">
              <option value="">Todos los proveedores</option>
              {listaProv.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            {meses.length > 0 && (
              <MenuMulti
                opciones={meses.map(({ mes, cantidad }) => ({ key: mes, label: mesLabel(mes), n: cantidad }))}
                seleccion={ingresos}
                onCambiar={setIngresos}
                vacio="Todos los meses"
                etiqueta={(n, unico) => (n === 1 && unico ? unico : `${n} meses`)}
              />
            )}
            <Select value={modoVU} onChange={(e) => setModoVU(e.target.value as ModoVidaUtil)} style={{ width: 210 }} aria-label="Modo de vida útil">
              <option value="7d">Vida útil: últimos 7d</option>
              <option value="15d">Vida útil: últimos 15d</option>
              <option value="30d">Vida útil: últimos 30d</option>
              <option value="firstSale">Vida útil: desde 1ª venta</option>
            </Select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.mut, whiteSpace: 'nowrap', cursor: 'pointer' }}>
              <input type="checkbox" checked={ocultarSinStock} onChange={(e) => setOcultarSinStock(e.target.checked)} style={{ accentColor: 'var(--mo-brand-solid)' }} />
              Ocultar sin stock
            </label>
          </FilterBar>

          {/* La selección sobrevive a filtros y páginas: si no se dice, se termina
              generando un PDF con productos que ya no están a la vista. */}
          {outletSel.size > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space[3],
                flexWrap: 'wrap',
                marginBottom: space[3],
                padding: '8px 12px',
                background: color.brandBg,
                border: `1px solid ${color.brandBorder}`,
                borderRadius: 'var(--mo-r-lg)',
                fontSize: font.base,
                color: color.brand,
              }}
            >
              <span>
                <b>{outletSel.size}</b> {outletSel.size === 1 ? 'producto marcado' : 'productos marcados'} para el sale
                {outletSel.size > slice.filter((p) => outletSel.has(p.id)).length && <span style={{ opacity: 0.8 }}> (algunos fuera de esta página o del filtro)</span>}
              </span>
              <Button size="sm" variant="ghost" tone="brand" onClick={() => setOutletSel(new Set())} style={{ marginLeft: 'auto' }}>
                Limpiar selección
              </Button>
            </div>
          )}

          {ordenada.length === 0 ? (
            <EmptyState icon="🔍" title="Ningún producto coincide" hint={busqueda ? `Nada para "${busqueda}".` : 'Probá aflojando los filtros.'} dashed />
          ) : (
            <>
              <TableWrap maxHeight={640}>
                <THead>
                  <Tr>
                    <Th width={36} />
                    <Th width={72}>Foto</Th>
                    {th('name', 'Producto')}
                    {th('lastSale', 'Última venta')}
                    {th('sales7', 'Ventas 7d', 'right')}
                    {th('sales30', 'Ventas 30d', 'right')}
                    {th('sales90', 'Ventas 90d', 'right')}
                    {th('lifespan', 'Vida útil est.')}
                    {th('stock', 'Stock', 'right')}
                    <Th>Estado</Th>
                  </Tr>
                </THead>
                <TBody>
                  {slice.map((p) => (
                    <FilaProducto
                      key={p.id}
                      p={p}
                      modoVU={modoVU}
                      tnIdx={tnIdx}
                      datos={d}
                      marcado={outletSel.has(p.id)}
                      onMarcar={(on) => toggleOutlet(p.id, on)}
                      expandido={expandido === p.id}
                      onToggle={() => setExpandido((id) => (id === p.id ? null : p.id))}
                      onFoto={(imagenes) => setLightbox({ imagenes, nombre: p.name })}
                    />
                  ))}
                </TBody>
              </TableWrap>

              <Paginacion pagina={pageClamp} paginas={paginas} total={ordenada.length} onCambiar={setPage} singular="producto" plural="productos" />
            </>
          )}

          {lightbox && <Lightbox imagenes={lightbox.imagenes} nombre={lightbox.nombre} onClose={() => setLightbox(null)} />}
        </>
      )}
    </DatosGate>
  )
}

function FilaProducto({
  p,
  modoVU,
  tnIdx,
  datos,
  marcado,
  onMarcar,
  expandido,
  onToggle,
  onFoto,
}: {
  p: Producto
  modoVU: ModoVidaUtil
  tnIdx: IndiceTn | null
  datos: DatosETL
  marcado: boolean
  onMarcar: (on: boolean) => void
  expandido: boolean
  onToggle: () => void
  onFoto: (imagenes: string[]) => void
}) {
  const meta = [p.sku, p.proveedor].filter(Boolean).join(' · ')
  const lsStr = formatLifespan(lifespanDaysByMode(p, modoVU), p.stock)
  const foto = tnIdx ? imagenDe(p, tnIdx) : null
  return (
    <>
      <Tr onClick={onToggle} style={expandido ? { background: color.brandBg } : undefined}>
        <Td align="center" style={{ cursor: 'default' }}>
          <span onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={marcado}
              onChange={(e) => onMarcar(e.target.checked)}
              title="Marcar para el reporte de sale"
              aria-label={`Marcar ${p.name} para el sale`}
              style={{ accentColor: 'var(--mo-brand-solid)', cursor: 'pointer' }}
            />
          </span>
        </Td>
        <Td tall>
          <span onClick={(e) => e.stopPropagation()}>
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={foto}
                loading="lazy"
                alt={p.name}
                onClick={() => onFoto(imagenesDe(p, tnIdx!))}
                style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, background: color.bg2, cursor: 'zoom-in', display: 'block' }}
              />
            ) : (
              <span style={{ display: 'flex', width: 44, height: 44, borderRadius: 6, background: color.bg2, color: color.mut2, fontSize: 9, alignItems: 'center', justifyContent: 'center' }}>
                sin foto
              </span>
            )}
          </span>
        </Td>
        <Td tall style={{ maxWidth: 240 }}>
          <div style={{ fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
          {meta ? <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 1 }}>{meta}</div> : null}
        </Td>
        <Td tall style={{ color: color.mut }}>
          {p.lastSale || <span style={{ color: color.mut2 }}>Sin ventas</span>}
          {p.daysSinceLast < 999 && <div style={{ fontSize: font.xs, color: color.mut2 }}>{p.daysSinceLast}d atrás</div>}
        </Td>
        <Td align="right" style={{ fontWeight: 600, color: color.success }}>
          {p.sales7}
        </Td>
        <Td align="right" strong>
          {p.sales30}
        </Td>
        <Td align="right">{p.sales90}</Td>
        <Td style={{ color: color.mut, fontSize: font.sm }}>{lsStr}</Td>
        <Td align="right" tall>
          {p.stock}
          <MiniBar pct={p.stock / 2} tono={colorStock(p.stock)} derecha />
        </Td>
        <Td>
          <FaseBadge fase={p.phase} />
        </Td>
      </Tr>
      {expandido && (
        <Tr>
          <Td colSpan={10} style={{ padding: 0, background: color.bg, height: 'auto' }}>
            <DetalleVariante allVvar={datos.allVvar} allVariantes={datos.allVariantes} pid={p.id} />
          </Td>
        </Tr>
      )}
    </>
  )
}
