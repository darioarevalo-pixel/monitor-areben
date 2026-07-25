'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { formatLifespan, lifespanDays } from '@/lib/etl/helpers'
import type { Variante } from '@/lib/etl/tipos'
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

type ColOrden = 'name' | 'size' | 'lastSale' | 'sales7' | 'sales30' | 'lifespan' | 'stock'

export function VariantesTable() {
  const { datos, error } = useDatosMonitor()

  const [busqueda, setBusqueda] = useFiltroUrl<string>('q', '')
  const [estado, setEstado] = useFiltroUrl<string>('estado', '')
  const [col, setCol] = useState<ColOrden>('sales30')
  const [dir, setDir] = useState(-1)
  const [page, setPage] = useState(1)

  const variantes = useMemo(() => datos?.allVariantes ?? [], [datos])

  const firmaFiltros = `${busqueda}|${estado}`
  const primeraRef = useRef(true)
  useEffect(() => {
    if (primeraRef.current) {
      primeraRef.current = false
      return
    }
    setPage(1)
  }, [firmaFiltros])

  const filtrada = useMemo(() => filtrarVariantes(variantes, { busqueda, estado }), [variantes, busqueda, estado])
  const ordenada = useMemo(() => sortList(filtrada, col, dir), [filtrada, col, dir])

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
    <DatosGate datos={datos} error={error} esqueleto="tabla">
      {() => (
        <>
          <FilterBar>
            <BuscarInput value={busqueda} onChange={setBusqueda} placeholder="Buscar variante…" />
            <Select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ width: 200 }} aria-label="Estado">
              <option value="">Todos los estados</option>
              <option value="crecimiento">Crecimiento</option>
              <option value="madurez">Madurez</option>
              <option value="declive">Declive</option>
              <option value="dormido">Dormido</option>
              <option value="obsoleto">Obsoleto</option>
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
                    {th('lifespan', 'Vida útil est.')}
                    {th('stock', 'Stock', 'right')}
                    <Th>Estado</Th>
                  </Tr>
                </THead>
                <TBody>
                  {slice.map((v) => (
                    <FilaVariante key={v.id} v={v} />
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

function FilaVariante({ v }: { v: Variante }) {
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
