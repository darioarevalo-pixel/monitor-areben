'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { DetalleVariante } from '@/components/productos/DetalleVariante'
import { Lightbox } from '@/components/productos/Lightbox'
import { asegurarTnPromo, useTnImages } from '@/components/productos/useTnImages'
import { generarReporteSale } from '@/components/productos/reporteSale'
import { BotonActualizarInventario } from '@/components/productos/BotonActualizarInventario'
import { MandarALiquidacion } from '@/components/liquidacion/MandarALiquidacion'
import { useCampaniaAbierta } from '@/components/liquidacion/useCampaniaAbierta'
import { faltantes, TOPE_SUMAR, type EstadoItem } from '@/lib/liquidacion'
import { formatLifespan } from '@/lib/etl/helpers'
import type { DatosETL, Producto } from '@/lib/etl/tipos'
import { LIFESPAN_SIN_DATO } from '@/lib/etl/tipos'
import {
  antiguedad,
  colorStock,
  fechaCorta,
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
  Notice,
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
  radius,
  space,
  useFiltroUrl,
  useToast,
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

/** Cómo se ve un producto que ya está en la campaña activa. `aplicado` no llega desde acá. */
const ROTULO_EN_CAMPANIA: Record<EstadoItem, string> = {
  pendiente: 'ya está · sin definir',
  definido: 'ya está · con precio',
  confirmado: 'ya está · precio confirmado',
  descartado: 'ya está · descartado',
  aplicado: 'ya está · aplicado',
}

export function ProductosTable() {
  const { datos, error, progreso, origen } = useDatosMonitor()
  const { marca } = useSesion()
  const tnIdx = useTnImages(marca)
  const toast = useToast()

  /**
   * El "modo campaña": con una campaña de liquidación activa, la tabla marca qué productos ya se
   * mandaron. Una campaña se arma en varias vueltas con filtros distintos, y sin esto la segunda
   * vuelta se ve idéntica a la primera. Se entra por el selector de acá abajo o desde el botón
   * «Agregar productos» de la campaña, que navega con `?liq=<id>`.
   */
  const camp = useCampaniaAbierta(marca)

  const [busqueda, setBusqueda] = useFiltroUrl<string>('q', '')
  const [estado, setEstado] = useFiltroUrl<string>('estado', '')
  const [enCampania, setEnCampania] = useState<'' | 'faltan' | 'estan'>('')
  const [proveedor, setProveedor] = useState('')
  const [ingresos, setIngresos] = useState<Set<string>>(new Set())
  /**
   * En modo campaña arranca prendido: un sale mueve mercadería parada, y un producto agotado no
   * tiene nada que mover (uno con stock negativo es un error de inventario, tampoco se liquida).
   * El valor inicial cubre la llegada por `?liq=` desde «Agregar productos», donde nadie toca el
   * selector — se puede leer acá porque `camp.liq` sale de `useSearchParams()` y ya está resuelto
   * en el primer render. Sigue siendo apagable: para sacar de la campaña uno que se agotó después
   * de mandarlo, hay que poder verlo.
   */
  const [ocultarSinStock, setOcultarSinStock] = useState(() => !!camp.liq)
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
  const firmaFiltros = `${busqueda}|${estado}|${proveedor}|${[...ingresos].sort().join(',')}|${ocultarSinStock}|${modoVU}|${camp.liq}|${enCampania}`
  const primeraRef = useRef(true)
  useEffect(() => {
    if (primeraRef.current) {
      primeraRef.current = false
      return
    }
    setPage(1)
  }, [firmaFiltros])

  // Los seis filtros de siempre. El de campaña se aplica aparte porque los contadores de la barra
  // se cuentan sobre esto: filtrando por "sin mandar", "N de M ya están" se leería siempre 0 de M.
  const filtradaBase = useMemo(
    () => filtrarProductos(productos, { busqueda, estado, proveedor, ingresos, ocultarSinStock }),
    [productos, busqueda, estado, proveedor, ingresos, ocultarSinStock],
  )

  const porFaltar = useMemo(
    () => (camp.liq ? faltantes(filtradaBase, camp.yaEstan) : filtradaBase),
    [camp.liq, filtradaBase, camp.yaEstan],
  )

  const filtrada = useMemo(() => {
    if (!camp.liq || !enCampania) return filtradaBase
    return enCampania === 'faltan' ? porFaltar : filtradaBase.filter((p) => camp.yaEstan[p.id])
  }, [camp.liq, camp.yaEstan, enCampania, filtradaBase, porFaltar])

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

  /**
   * Marca de una vez todos los del filtro actual que **no** están en la campaña.
   *
   * Suma a lo que ya haya marcado en vez de reemplazarlo: la selección sobrevive a filtros a
   * propósito, y armar un sale es justamente ir juntando de a tandas (los de declive, después los
   * dormidos de tal proveedor). El tope se avisa **antes**, con el número: sin esto, el error
   * llegaría del servidor recién después de armar las trescientas fotos congeladas.
   */
  function marcarLosQueFaltan() {
    const total = new Set([...outletSel, ...porFaltar.map((p) => p.id)])
    if (total.size > TOPE_SUMAR) {
      toast.error(`Quedarían ${total.size} marcados y el tope por vez es ${TOPE_SUMAR}. Achicá el filtro y andá por tandas.`)
      return
    }
    setOutletSel(total)
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
    <DatosGate datos={datos} error={error} progreso={progreso} origen={origen} esqueleto="tabla">
      {(d) => (
        <>
          <HeaderAcciones>
            <BotonActualizarInventario />
            {/*
              El PDF queda: sigue siendo la forma de mirar la selección en papel o de mandársela a
              alguien. "Mandar a liquidación" es el camino nuevo —la campaña se guarda en la base y
              la ve todo el equipo—, y las dos salen de la MISMA selección.
            */}
            <MandarALiquidacion
              seleccion={productos.filter((p) => outletSel.has(p.id))}
              liqFijada={camp.campania}
              onListo={() => {
                setOutletSel(new Set())
                // Sin esto, los que acaban de entrar seguirían viéndose como disponibles hasta
                // recargar — que es exactamente el problema que este modo vino a resolver.
                camp.recargar()
              }}
            />
            <Button variant="solid" tone="brand" onClick={() => void generarSale()} loading={generando} disabled={!outletSel.size}>
              Generar sale{outletSel.size ? ` (${outletSel.size})` : ''}
            </Button>
          </HeaderAcciones>

          <FilterBar>
            <BuscarInput value={busqueda} onChange={setBusqueda} placeholder="Buscar producto…" />
            <Select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ width: 180 }} aria-label="Estado">
              <option value="">Todos los estados</option>
              <option value="nuevo">Nuevo</option>
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

            {/*
              La lista de campañas se pide al tocar el selector, no al montar la tabla: casi ninguna
              visita a "Por producto" va a liquidar algo, y sería un request por visita. Con `?liq=`
              en la URL la campaña activa ya vino con su nombre, así que se puede dibujar sin lista.
            */}
            <Select
              value={camp.liq}
              onFocus={camp.pedirAbiertas}
              onMouseDown={camp.pedirAbiertas}
              onChange={(e) => {
                camp.entrar(e.target.value)
                // Salir NO lo apaga: apagarle un filtro a alguien que lo dejó puesto a propósito
                // es peor que dejarlo.
                if (e.target.value) setOcultarSinStock(true)
              }}
              style={{ width: 230 }}
              aria-label="Campaña de liquidación"
            >
              <option value="">Sin campaña</option>
              {/* La activa se dibuja aunque la lista todavía no esté: si no, el selector se vería
                  en "Sin campaña" mientras la tabla ya está marcando productos. */}
              {camp.liq && !(camp.abiertas || []).some((c) => c.id === camp.liq) && (
                <option value={camp.liq}>{camp.campania?.nombre || 'Cargando…'}</option>
              )}
              {(camp.abiertas || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.conteo.total})
                </option>
              ))}
            </Select>

            {camp.liq && (
              <Select
                value={enCampania}
                onChange={(e) => setEnCampania(e.target.value as '' | 'faltan' | 'estan')}
                style={{ width: 190 }}
                aria-label="Ya está en la campaña"
              >
                <option value="">Todos ({filtradaBase.length})</option>
                <option value="faltan">Sin mandar ({porFaltar.length})</option>
                <option value="estan">Ya en la campaña ({filtradaBase.length - porFaltar.length})</option>
              </Select>
            )}
          </FilterBar>

          {camp.error && <Notice tone="warning" style={{ marginBottom: space[3] }}>{camp.error}</Notice>}

          {camp.campania && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space[3],
                flexWrap: 'wrap',
                marginBottom: space[3],
                padding: '8px 12px',
                background: color.bg2,
                border: `1px solid ${color.line}`,
                borderRadius: radius.lg,
                fontSize: font.base,
                color: color.ink,
              }}
            >
              <span>
                Sumando a <b>{camp.campania.nombre}</b>
                <span style={{ color: color.mut }}>
                  {' · '}
                  {filtradaBase.length - porFaltar.length} de {filtradaBase.length} de este filtro ya están
                  {/* Si no se dice, los dos números no cierran con lo que uno tenía en la cabeza. */}
                  {ocultarSinStock && ' · sin stock ocultos'}
                </span>
              </span>
              <Button size="sm" variant="soft" tone="brand" onClick={marcarLosQueFaltan} disabled={!porFaltar.length}>
                Marcar los que faltan ({porFaltar.length})
              </Button>
              <Button size="sm" variant="ghost" onClick={camp.salir} style={{ marginLeft: 'auto' }}>
                Salir de la campaña
              </Button>
            </div>
          )}

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
                    <Th width={78}>Foto</Th>
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
                      yaEsta={camp.liq ? camp.yaEstan[p.id] : undefined}
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
  yaEsta,
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
  /** En qué estado está este producto dentro de la campaña activa, si está. */
  yaEsta?: EstadoItem
  onMarcar: (on: boolean) => void
  expandido: boolean
  onToggle: () => void
  onFoto: (imagenes: string[]) => void
}) {
  const meta = [p.sku, p.proveedor].filter(Boolean).join(' · ')
  const lsStr = formatLifespan(lifespanDaysByMode(p, modoVU), p.stock)
  const foto = tnIdx ? imagenDe(p, tnIdx) : null
  // Se atenúa pero **el checkbox sigue vivo**: el mismo tilde alimenta "Generar sale", y un
  // producto que ya está en la campaña puede querer salir igual en el PDF. Mandarlo dos veces no
  // rompe nada — `sumar-items` no pisa lo que ya está y avisa cuántos ya estaban.
  return (
    <>
      <Tr
        onClick={onToggle}
        style={{
          ...(expandido ? { background: color.brandBg } : null),
          ...(yaEsta && !marcado ? { opacity: 0.55 } : null),
        }}
      >
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
                style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, background: color.bg2, border: `1px solid ${color.line}`, cursor: 'zoom-in', display: 'block' }}
              />
            ) : (
              <span
                style={{
                  display: 'flex',
                  width: 60,
                  height: 60,
                  borderRadius: 6,
                  background: color.bg2,
                  border: `1px dashed ${color.line2}`,
                  color: color.mut2,
                  fontSize: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                sin foto
              </span>
            )}
          </span>
        </Td>
        <Td tall style={{ maxWidth: 240 }}>
          <div style={{ fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
          {meta ? <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 1 }}>{meta}</div> : null}
          {/*
            Desde cuándo existe el producto. Va acá y no en una columna aparte porque es un dato de
            identidad, no una medición: contesta "¿esto es nuevo o lo tenemos hace un año?" antes de
            que uno mire una sola venta. Y es lo que le da sentido a la vida útil de al lado — 16
            días de stock a partir de una funda que ingresó anteayer se lee distinto que a partir de
            una de hace ocho meses.
          */}
          {p.ingresoFecha && (
            <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 1 }}>
              {fechaCorta(p.ingresoFecha)}
              {p.diasVivo !== null && <span style={{ opacity: 0.75 }}> · {antiguedad(p.diasVivo)}</span>}
            </div>
          )}
          {yaEsta && (
            <div style={{ fontSize: font.xs, color: yaEsta === 'descartado' ? color.mut2 : color.brand, marginTop: 2 }}>
              {ROTULO_EN_CAMPANIA[yaEsta]}
            </div>
          )}
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
        {/*
          Sin subtexto: la antigüedad que explica sobre cuántos días está hecha esta cuenta ya está
          debajo del nombre, y para TODOS los productos, no sólo los nuevos. Repetirla acá era el
          mismo dato dos veces en la misma fila.
        */}
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
