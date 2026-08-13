'use client'

/**
 * El resultado de una campaña: qué se vendió de lo liquidado, y si el precio llegó a estar puesto.
 *
 * # Por qué esta pantalla existe
 *
 * Hasta acá, una campaña terminaba y no pasaba nada: la próxima se decidía de memoria. Y hay una
 * pregunta anterior a "¿vendió?" que nadie podía contestar: **¿el precio de sale estuvo puesto
 * alguna vez?** Los precios se cargan a mano en Gestión Nube —el token del Monitor no tiene permiso
 * para escribir productos— así que entre la decisión y el cliente hay una persona tipeando cuarenta
 * productos, y un producto que se olvidó se ve exactamente igual que uno cargado bien.
 *
 * El espejo guarda el precio **cobrado** en cada línea de venta (`venta_detalles.unit_price`), y eso
 * alcanza para responderlo sin preguntarle nada a nadie: si las catorce unidades salieron a precio
 * de lista, la campaña para el cliente no existió.
 *
 * # Las decisiones de esta pantalla
 *
 *  1. **Se puede mirar con la campaña andando**, no sólo al cerrar. El rango se corta en hoy y se
 *     avisa. Ver a mitad de camino que tres productos no se movieron deja hacer algo todavía;
 *     verlo al cerrar es una autopsia.
 *  2. 🔑 **Los descartados son el grupo de control.** Se miraron el mismo día, estaban en la misma
 *     situación y no se les tocó el precio. Si se movieron parecido, el descuento no era lo que
 *     hacía falta — y eso no cuesta ni una consulta extra.
 *  3. **Mayorista y las ventas técnicas se cuentan pero no se comparan.** Mayorista sale a precio
 *     mayorista y las técnicas (Sesión de Fotos, Fallas) a $0: mezcladas, cualquier producto bien
 *     cargado parecería mal cargado.
 *  4. **Lo resignado es sobre lo vendido**, no sobre el stock entero. La grilla de la campaña
 *     muestra el hipotético "si se vende todo"; acá es la plata que de verdad no entró.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  rangoDeCampania, resultadoCampania,
  type EstadoCarga, type Liquidacion as Campania, type LiquidacionItem, type ResultadoItem,
} from '@/lib/liquidacion'
import { leerVentasDeCampania } from '@/lib/liquidacion/ventas'
import { sincronizarVentas } from '@/lib/liquidacion/persistencia'
import {
  BuscarInput, Button, Card, EmptyState, Esqueleto, FilterBar, KpiCard, Notice, Select, StatusPill,
  TBody, THead, TableWrap, Td, Th, Tr, formatMoney, color, font, space, useToast, weight, type Tone,
} from '@/components/ui'

const ROTULO_CARGA: Record<EstadoCarga, { label: string; tono: Tone; ayuda: string }> = {
  puesto: {
    label: 'Se vendió al sale',
    tono: 'success',
    ayuda: 'Todas las unidades salieron al precio decidido: el precio estaba puesto.',
  },
  no_puesto: {
    label: 'Nunca se cargó',
    tono: 'danger',
    ayuda: 'Todo se vendió al precio de lista. El precio de sale no llegó a cargarse en Gestión Nube.',
  },
  a_medias: {
    label: 'A medias',
    tono: 'warning',
    ayuda: 'Parte se vendió al sale y parte no. Se cargó tarde, o quedó cargado en un canal solo.',
  },
  otro_precio: {
    label: 'Otro precio',
    tono: 'warning',
    ayuda: 'Se vendió a un precio que no es ni el de sale ni el de lista: puede ser un descuento de caja.',
  },
  sin_ventas: { label: 'No vendió', tono: 'neutral', ayuda: 'No se vendió ninguna unidad en el período.' },
  sin_precio: { label: 'Sin precio', tono: 'neutral', ayuda: 'No se le decidió un precio de sale.' },
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fechaCorta(f: string): string {
  const [, m, d] = f.split('-').map(Number)
  return `${d}-${MESES[m - 1]}`
}

/** Hoy en local, sin `toISOString` (que se corre de día por zona horaria). */
function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** `5.2×` · `0.8×`. El levante nulo es "antes no vendía nada", que no es un número. */
function levanteTxt(n: number | null): string {
  return n == null ? '—' : `${n >= 10 ? Math.round(n) : n.toFixed(1)}×`
}

/** `hace 3 min` · `hace 2 h`. Por debajo del minuto no se cuentan segundos: dice `recién`. */
function haceTxt(iso: string): string {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000)
  if (!Number.isFinite(min) || min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`
}

export function Resultado({
  campania,
  items,
  puedeSincronizar,
}: {
  campania: Campania
  items: LiquidacionItem[]
  /** Quién puede traer las ventas del día al espejo. Hoy, admin (ver la guarda del handler). */
  puedeSincronizar: boolean
}) {
  const { marca } = useSesion()
  const toast = useToast()
  const [lineas, setLineas] = useState<Awaited<ReturnType<typeof leerVentasDeCampania>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<string>('')
  const [sincronizando, setSincronizando] = useState(false)
  // Se siembra de la campaña y después la manda el servidor: recargar la lista entera de campañas
  // para refrescar un rótulo sería pagar el payload de todas para mover cuatro palabras.
  const [ventasSync, setVentasSync] = useState(campania.ventasSync)

  /**
   * El rango se congela al montar: `hoyLocal()` adentro del `useMemo` de abajo lo recalcularía en
   * cada render y el resultado se movería mientras se lo mira.
   */
  const [rango] = useState(() => rangoDeCampania(campania, hoyLocal()))

  const pids = useMemo(() => items.map((i) => i.pid), [items])

  const cargar = useCallback(async () => {
    if (!rango) return
    setError(null)
    try {
      setLineas(await leerVentasDeCampania(marca, pids, rango.desde, rango.hasta))
    } catch (e) {
      setLineas([])
      setError(e instanceof Error ? e.message : 'No se pudieron leer las ventas del período.')
    }
  }, [marca, pids, rango])

  // El lint prohíbe setState sincrónico en un efecto: la carga va adentro de un async suelto.
  useEffect(() => {
    void (async () => {
      setLineas(null)
      await cargar()
    })()
  }, [cargar])

  /**
   * Traer las ventas del día y volver a leer.
   *
   * 🔑 **El orden importa: primero se sincroniza, después se recarga.** Al revés, el botón mostraría
   * los mismos números de antes y parecería no haber hecho nada.
   */
  const sincronizar = useCallback(async () => {
    setSincronizando(true)
    try {
      const r = await sincronizarVentas(marca, campania.id)
      if (r.ventasSync) setVentasSync(r.ventasSync)
      await cargar()
      if (r.salteado) toast.info('Las ventas ya se habían traído hace menos de un minuto.')
      else if (r.truncado) toast.error(`Se trajeron ${r.ventas} ventas y puede faltar alguna: se llegó al tope de páginas.`)
      else toast.ok(`Listo: ${r.ventas} ${r.ventas === 1 ? 'venta' : 'ventas'} de ayer y hoy.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron traer las ventas de hoy.')
    } finally {
      setSincronizando(false)
    }
  }, [marca, campania.id, cargar, toast])

  const res = useMemo(
    () => (rango && lineas ? resultadoCampania(items, lineas, rango) : null),
    [items, lineas, rango],
  )

  const visibles = useMemo(() => {
    if (!res) return []
    const q = busqueda.trim().toLowerCase()
    return res.items
      .filter((i) => (filtro ? i.carga === filtro : i.estado !== 'pendiente'))
      .filter((i) => !q || i.nombre.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q))
      // Primero lo que hay que arreglar (nunca se cargó, a medias), después lo que más vendió.
      .sort((a, b) => {
        const peso = (c: EstadoCarga) => (c === 'no_puesto' ? 0 : c === 'a_medias' ? 1 : c === 'otro_precio' ? 2 : 3)
        return peso(a.carga) - peso(b.carga) || b.unidades - a.unidades
      })
  }, [res, busqueda, filtro])

  if (!rango) {
    return (
      <EmptyState
        title="La campaña no tiene fecha de inicio"
        hint="El resultado se mide entre dos fechas: sin la de inicio no hay período que mirar. Ponésela con «Editar»."
      />
    )
  }

  if (lineas === null) return <Esqueleto forma="tabla" />

  return (
    <>
      {error && <Notice tone="danger" style={{ marginBottom: space[4] }}>{error}</Notice>}

      {res && (
        <>
          {/*
            🔑 **El botón vive al lado del rango, no en una barra de acciones.** Lo que hace es
            corregir *hasta cuándo* llegan los datos que se están mirando, así que su lugar es
            pegado a la frase que dice hasta cuándo llegan. Sólo sale con la campaña andando: en una
            cerrada las ventas de hoy no son de la campaña.
          */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
              color: color.mut, fontSize: font.sm, marginBottom: space[3],
            }}
          >
            <span>
              {fechaCorta(res.desde)} → {fechaCorta(res.hasta)} · {res.dias} {res.dias === 1 ? 'día' : 'días'}
              {res.enCurso && ' · la campaña sigue andando, así que va hasta hoy'}
            </span>
            {res.enCurso && puedeSincronizar && (
              <>
                <Button size="sm" onClick={() => void sincronizar()} loading={sincronizando}>
                  Traer las ventas de hoy
                </Button>
                <span>
                  {ventasSync
                    ? `traídas ${haceTxt(ventasSync)}`
                    : 'el espejo se actualiza solo a las 3 de la mañana'}
                </span>
              </>
            )}
          </div>

          {/*
            El aviso de lo que no se cargó va arriba de todo y en rojo: es lo único de esta pantalla
            sobre lo que todavía se puede hacer algo. Un producto que se está vendiendo a precio de
            lista se arregla cargándolo ahora, si la campaña sigue viva.
          */}
          {(res.sinCargar > 0 || res.aMedias > 0) && (
            <Notice tone={res.sinCargar > 0 ? 'danger' : 'warning'} style={{ marginBottom: space[4] }}>
              {res.sinCargar > 0 && (
                <>
                  <b>{res.sinCargar}</b> {res.sinCargar === 1 ? 'producto se vendió entero' : 'productos se vendieron enteros'} al
                  precio de lista: el precio de sale <b>no llegó a cargarse en Gestión Nube</b>.{' '}
                </>
              )}
              {res.aMedias > 0 && (
                <>
                  <b>{res.aMedias}</b> {res.aMedias === 1 ? 'se vendió' : 'se vendieron'} parte al sale y parte no
                  (se cargó tarde, o quedó cargado en un canal solo).{' '}
                </>
              )}
              {res.enCurso && 'La campaña sigue viva: cargarlos ahora todavía sirve.'}
            </Notice>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[3], marginBottom: space[4] }}>
            <KpiCard
              label="Vendido de lo liquidado"
              value={String(res.liquidados.unidades)}
              sub={
                res.liquidados.pctMovido == null
                  ? `${res.liquidados.productos} productos`
                  : `${Math.round(res.liquidados.pctMovido)}% del stock que había`
              }
            />
            <KpiCard label="Facturado" value={formatMoney(res.liquidados.plata)} sub="sin mayorista ni ventas técnicas" />
            <KpiCard
              label="Resignado"
              value={formatMoney(res.liquidados.resignado)}
              sub="lo que costó el descuento, sobre lo vendido"
            />
            <KpiCard
              label="Levante"
              value={levanteTxt(res.liquidados.levante)}
              sub={
                res.liquidados.levante == null
                  ? 'antes no vendían nada'
                  : `${res.liquidados.ritmoDurante.toFixed(1)} por día vs ${res.liquidados.ritmoPrevio.toFixed(1)} antes`
              }
            />
          </div>

          {/*
            🔑 El grupo de control. Es la única lectura de esta pantalla que dice algo sobre la
            decisión y no sobre la ejecución: si los descartados se movieron parecido, lo que hizo
            falta no era el descuento.
          */}
          {res.control.productos > 0 && (
            <Card style={{ marginBottom: space[4], background: color.bg2 }}>
              <div style={{ fontSize: font.sm, lineHeight: 1.7 }}>
                <b>Los {res.control.productos} descartados, para comparar.</b> Se miraron el mismo día, estaban en
                la misma situación y no se les tocó el precio: vendieron <b>{res.control.unidades}</b>{' '}
                {res.control.unidades === 1 ? 'unidad' : 'unidades'}
                {res.control.pctMovido != null && ` (${Math.round(res.control.pctMovido)}% de su stock)`}, con un
                levante de <b>{levanteTxt(res.control.levante)}</b> contra{' '}
                <b>{levanteTxt(res.liquidados.levante)}</b> de los liquidados.
                {res.control.levante != null && res.liquidados.levante != null &&
                  res.control.levante >= res.liquidados.levante * 0.9 && (
                  <> Se movieron parecido <b>sin descuento</b>: mirá si el precio era el problema.</>
                )}
              </div>
            </Card>
          )}

          <FilterBar>
            <BuscarInput value={busqueda} onChange={setBusqueda} placeholder="Buscar producto o SKU…" />
            <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 210 }} aria-label="Cómo se vendió">
              <option value="">Todos los evaluados</option>
              {(['no_puesto', 'a_medias', 'otro_precio', 'puesto', 'sin_ventas'] as EstadoCarga[]).map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CARGA[c].label} ({res.items.filter((i) => i.carga === c).length})
                </option>
              ))}
            </Select>
          </FilterBar>

          {!visibles.length ? (
            <EmptyState
              title="Nada para mostrar con ese filtro"
              hint="Probá con otro estado o limpiá la búsqueda."
            />
          ) : (
            <TableWrap>
              <THead>
                <Tr>
                  <Th>Producto</Th>
                  <Th align="right">Sale</Th>
                  <Th align="right">Se cobró</Th>
                  <Th>Cómo salió</Th>
                  <Th align="right">Unid.</Th>
                  <Th align="right">Del stock</Th>
                  <Th align="right">Levante</Th>
                  <Th align="right">Facturado</Th>
                </Tr>
              </THead>
              <TBody>
                {visibles.map((i) => <FilaResultado key={i.pid} item={i} />)}
              </TBody>
            </TableWrap>
          )}

          {/*
            Las dos honestidades del número. Van en la pantalla y no en un comentario porque quien
            mira esto está por decidir la próxima campaña con estos datos.
          */}
          <Card style={{ marginTop: space[5], background: color.bg2 }}>
            <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.6 }}>
              El sync relee los últimos 90 días y borra lo que Gestión Nube ya no tiene: una venta
              anulada <b>desaparece</b> de estos números, así que una campaña reciente puede moverse
              de un día para el otro. Las ventas mayoristas y las técnicas del Monitor (Sesión de
              Fotos y Fallas) se cuentan aparte y no entran en el precio promedio.
            </div>
          </Card>
        </>
      )}
    </>
  )
}

function FilaResultado({ item }: { item: ResultadoItem }) {
  const rot = ROTULO_CARGA[item.carga]
  const canales = [
    item.porCanal.local.unidades > 0 && `${item.porCanal.local.unidades} local`,
    item.porCanal.online.unidades > 0 && `${item.porCanal.online.unidades} online`,
    item.porCanal.mayorista.unidades > 0 && `${item.porCanal.mayorista.unidades} mayorista`,
  ].filter(Boolean).join(' · ')

  return (
    <Tr>
      <Td>
        <div style={{ fontWeight: weight.medium }}>{item.nombre}</div>
        <div style={{ fontSize: font.xs, color: color.mut }}>
          {item.sku || '—'}
          {item.estado === 'descartado' && ' · descartado'}
          {canales && ` · ${canales}`}
        </div>
      </Td>
      <Td align="right">{item.precioDecidido ? formatMoney(item.precioDecidido) : '—'}</Td>
      <Td align="right">{item.precioReal == null ? '—' : formatMoney(item.precioReal)}</Td>
      <Td>
        <span title={rot.ayuda}><StatusPill tone={rot.tono} label={rot.label} /></span>
        {item.carga === 'a_medias' && (
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: 2 }}>
            {item.unidadesAlSale} al sale · {item.unidadesALista + item.unidadesOtroPrecio} no
          </div>
        )}
      </Td>
      <Td align="right">{item.unidades}</Td>
      <Td align="right">
        {item.pctStockMovido == null ? '—' : `${Math.round(item.pctStockMovido)}%`}
        <div style={{ fontSize: font.xs, color: color.mut }}>de {item.stockInicial}</div>
      </Td>
      <Td align="right">{levanteTxt(item.levante)}</Td>
      <Td align="right">{formatMoney(item.plata)}</Td>
    </Tr>
  )
}
