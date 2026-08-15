'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { CeldaEnSale } from '@/components/liquidacion/CeldaEnSale'
import { useVendidoSale } from '@/components/liquidacion/useVendidoSale'
import { useTnPromo } from '@/components/productos/useTnImages'
import { formatLifespan, lifespanDays } from '@/lib/etl/helpers'
import type { Variante } from '@/lib/etl/tipos'
import { ofertaHoy, type EnSale } from '@/lib/liquidacion/vendido'
import { colorStock } from '@/lib/productos'
import { paginar, sortList, totalPaginas } from '@/lib/tabla'
import { filtrarVariantes } from '@/lib/variantes'
import {
  BuscarInput,
  DatosGate,
  EmptyState,
  FaseBadge,
  FilterBar,
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
  useFiltroUrl,
} from '@/components/ui'

/**
 * "🔠 Por variante" (key `variantes`, BDI + Zattia).
 *
 * Buscar (nombre o variante) + estado, orden por columna (default ventas 30d desc) y
 * paginado de a 50. Comparte molde con `productos` (lib/tabla, formatLifespan,
 * colorStock). La vida útil es la de 30d ya precomputada por el ETL.
 *
 * Rediseño jul-2026 (patrón Listado): cabecera de tabla pegajosa —con 50 filas se perdía
 * el nombre de las columnas al scrollear—, orden con la flecha en la columna activa en
 * vez de un "↕" en todas, filtros en la URL, y las columnas numéricas alineadas a la
 * derecha con cifras tabulares para poder compararlas de un vistazo.
 */

type ColOrden = 'name' | 'size' | 'lastSale' | 'sales7' | 'sales30' | 'enSale30' | 'lifespan' | 'stock'

/** Mismo filtro que en Por producto; la explicación de cada opción está allá. */
type FiltroSale = '' | 'con' | 'sin' | 'hoy'

export function VariantesTable() {
  const { datos, error, progreso, origen } = useDatosMonitor()
  const { marca } = useSesion()
  const vendido = useVendidoSale(marca)
  const promoIdx = useTnPromo(marca)

  const [busqueda, setBusqueda] = useFiltroUrl<string>('q', '')
  const [estado, setEstado] = useFiltroUrl<string>('estado', '')
  const [filtroSale, setFiltroSale] = useState<FiltroSale>('')
  const [col, setCol] = useState<ColOrden>('sales30')
  const [dir, setDir] = useState(-1)
  const [page, setPage] = useState(1)

  const variantes = useMemo(() => datos?.allVariantes ?? [], [datos])

  /**
   * Los pid con oferta puesta hoy en Tienda Nube.
   *
   * 🔑 **Se cruza por PRODUCTO y no por variante**: la oferta de TN es del producto, y el `sku` de
   * una variante es el del talle — matchearlo contra el catálogo daría vacío o, peor, el producto
   * equivocado.
   */
  const pidsEnOferta = useMemo(() => {
    const s = new Set<string>()
    if (promoIdx) (datos?.allProductos ?? []).forEach((p) => ofertaHoy(p, promoIdx) && s.add(String(p.id)))
    return s
  }, [datos, promoIdx])

  const firmaFiltros = `${busqueda}|${estado}|${filtroSale}`
  const primeraRef = useRef(true)
  useEffect(() => {
    if (primeraRef.current) {
      primeraRef.current = false
      return
    }
    setPage(1)
  }, [firmaFiltros])

  const filtrada = useMemo(() => {
    const base = filtrarVariantes(variantes, { busqueda, estado })
    if (!filtroSale) return base
    if (filtroSale === 'hoy') return base.filter((v) => pidsEnOferta.has(String(v.pid)))
    const vendio = (v: Variante) => (vendido?.porVar.get(v.id)?.s30 ?? 0) > 0
    return base.filter((v) => (filtroSale === 'con' ? vendio(v) : !vendio(v)))
  }, [variantes, busqueda, estado, filtroSale, vendido, pidsEnOferta])

  // `enSale30` se pisa sobre una copia de la fila para poder ordenar por la columna, igual que
  // `lifespan` en Por producto: `sortList` ordena por una clave del objeto.
  const ordenada = useMemo(() => {
    const conSale = filtrada.map((v) => ({ ...v, enSale30: vendido?.porVar.get(v.id)?.s30 ?? 0 }))
    return sortList(conSale, col, dir)
  }, [filtrada, col, dir, vendido])

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

  const th = (c: ColOrden, label: string, align?: 'right') => (
    <Th align={align} onClick={() => ordenar(c)} sort={col === c ? (dir === -1 ? 'desc' : 'asc') : null}>
      {label}
    </Th>
  )

  return (
    <DatosGate datos={datos} error={error} progreso={progreso} origen={origen} esqueleto="tabla">
      {() => (
        <>
          <FilterBar>
            <BuscarInput value={busqueda} onChange={setBusqueda} placeholder="Buscar variante…" />
            <Select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ width: 200 }} aria-label="Estado">
              <option value="">Todos los estados</option>
              <option value="nuevo">Nuevo</option>
              <option value="crecimiento">Crecimiento</option>
              <option value="madurez">Madurez</option>
              <option value="declive">Declive</option>
              <option value="dormido">Dormido</option>
              <option value="obsoleto">Obsoleto</option>
            </Select>
            <Select
              value={filtroSale}
              onChange={(e) => setFiltroSale(e.target.value as FiltroSale)}
              disabled={!vendido}
              style={{ width: 210 }}
              aria-label="Ventas de sale"
            >
              <option value="">Con y sin sale</option>
              <option value="sin">Sin ventas de sale</option>
              <option value="con">Sólo lo vendido en sale</option>
              <option value="hoy">En oferta hoy en la tienda</option>
            </Select>
          </FilterBar>

          {ordenada.length === 0 ? (
            <EmptyState icon="🔍" title="Ninguna variante coincide" hint={busqueda ? `Nada para "${busqueda}".` : 'Probá con otro estado.'} dashed />
          ) : (
            <>
              <TableWrap maxHeight={620}>
                <THead>
                  <Tr>
                    {th('name', 'Producto')}
                    {th('size', 'Variante')}
                    {th('lastSale', 'Última venta')}
                    {th('sales7', 'Ventas 7d', 'right')}
                    {th('sales30', 'Ventas 30d', 'right')}
                    {th('enSale30', 'En sale 30d', 'right')}
                    {th('lifespan', 'Vida útil est.')}
                    {th('stock', 'Stock', 'right')}
                    <Th>Estado</Th>
                  </Tr>
                </THead>
                <TBody>
                  {slice.map((v) => (
                    <FilaVariante
                      key={v.id}
                      v={v}
                      enSale={vendido?.porVar.get(v.id) ?? null}
                      ofertaHoy={pidsEnOferta.has(String(v.pid))}
                    />
                  ))}
                </TBody>
              </TableWrap>

              <Paginacion pagina={pageClamp} paginas={paginas} total={ordenada.length} onCambiar={setPage} singular="variante" plural="variantes" />
            </>
          )}
        </>
      )}
    </DatosGate>
  )
}

function FilaVariante({ v, enSale, ofertaHoy }: { v: Variante; enSale: EnSale | null; ofertaHoy: boolean }) {
  const lsStr = formatLifespan(lifespanDays(v.stock, v.sales30), v.stock)
  return (
    <Tr>
      <Td strong style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {v.name}
      </Td>
      <Td style={{ color: color.mut }}>{v.size}</Td>
      <Td tall style={{ color: color.mut }}>
        {v.lastSale || <span style={{ color: color.mut2 }}>Sin ventas</span>}
        {v.daysSinceLast < 999 && <div style={{ fontSize: font.xs, color: color.mut2 }}>{v.daysSinceLast}d atrás</div>}
      </Td>
      <Td align="right" style={{ fontWeight: 600, color: color.success }}>
        {v.sales7}
      </Td>
      <Td align="right" strong>
        {v.sales30}
      </Td>
      <Td align="right">
        <CeldaEnSale enSale={enSale} total30={v.sales30} ofertaHoy={ofertaHoy} />
      </Td>
      <Td style={{ color: color.mut, fontSize: font.sm }}>{lsStr}</Td>
      <Td align="right" tall>
        {v.stock}
        <MiniBar pct={v.stock / 2} tono={colorStock(v.stock)} derecha />
      </Td>
      <Td>
        <FaseBadge fase={v.phase} />
      </Td>
    </Tr>
  )
}
