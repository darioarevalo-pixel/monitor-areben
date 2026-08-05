'use client'

/**
 * Liquidación — campañas de sale, de la selección a la decisión.
 *
 * # Por qué esta pantalla existe
 *
 * Decidir una liquidación eran tres pantallas y un archivo en el medio: se tildaban productos en
 * Análisis → Por producto y salía un **PDF**; se lo miraba producto por producto y se los cargaba
 * **a mano** en el simulador de Comisiones; y lo que convencía iba a una lista guardada en el
 * `localStorage` de una sola persona. La selección se perdía al recargar, nadie más la veía, y
 * había dos cosas llamadas "sale" que no comparten una línea de código.
 *
 * Acá una campaña tiene nombre y fechas, vive en la base y la ve todo el equipo.
 *
 * # Las decisiones de esta pantalla
 *
 *  1. **Campañas con nombre y fecha, no una lista viva.** "Sale invierno ago-2026" se puede mirar
 *     después para decidir la próxima; una lista que se pisa a sí misma, no.
 *  2. **La foto del producto se congela al entrar.** Costo, precio, stock y ventas son los del día
 *     en que se lo mandó, y la grilla los muestra tal cual. Si leyera el ETL de hoy, un producto
 *     definido la semana pasada mostraría otro margen que el que se aprobó y nadie sabría cuál se
 *     miró. Además el ETL no guarda historia: el número viejo no se puede recuperar.
 *  3. **Descartar no es quitar.** Un producto que se miró y no va deja su huella para que no vuelva
 *     a evaluarse en la próxima pasada. Quitarlo es para el que entró por error.
 *  4. 🔴 **El aviso de costo faltante frena.** Un costo que no vino de Gestión Nube **no es un
 *     costo cero**: con costo cero cualquier precio parece tener 100% de margen. En julio de 2026,
 *     428 productos de BDI quedaron costando cero en silencio. La grilla lo marca en la fila.
 *
 * ▶️ **Tandas 1 y 2 de 4.** Esto es el cajón —crear la campaña, mandarle productos, verlos y
 * moverles el estado— más el modal que le pone el precio a cada uno con el simulador de margen al
 * lado (`DefinirPrecio.tsx`, y ←/→ para pasar al siguiente sin cerrar). Escribir esos precios en
 * Gestión Nube es la tanda 3, y qué se vendió de lo liquidado, la 4.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  avisos, contar, nuevoIdLiquidacion, resumenCampania,
  type EstadoCampania, type EstadoItem, type Liquidacion as Campania, type LiquidacionItem,
} from '@/lib/liquidacion'
import {
  borrarCampania, cambiarEstadoCampania, crearCampania, estadoItem, guardarItem, leerCampanias,
  leerItems, quitarItem, renombrarCampania, type Permisos,
} from '@/lib/liquidacion/persistencia'
import { DefinirPrecio } from './DefinirPrecio'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  BuscarInput, Button, Card, EmptyState, Esqueleto, Field, FilterBar, Input, KpiCard, Modal,
  Notice, Select, StatusPill, TBody, THead, TableWrap, Td, Th, Tr, formatMoney, useConfirmar,
  useFiltroUrl, useToast, color, font, radius, space, weight, type Tone,
} from '@/components/ui'

const ROTULO_CAMPANIA: Record<EstadoCampania, { label: string; tono: Tone }> = {
  borrador: { label: 'Borrador', tono: 'neutral' },
  en_curso: { label: 'En curso', tono: 'brand' },
  aplicada: { label: 'Aplicada', tono: 'success' },
  cerrada: { label: 'Cerrada', tono: 'neutral' },
}

const ROTULO_ITEM: Record<EstadoItem, { label: string; tono: Tone }> = {
  pendiente: { label: 'Sin definir', tono: 'warning' },
  definido: { label: 'Definido', tono: 'brand' },
  descartado: { label: 'Descartado', tono: 'neutral' },
  aplicado: { label: 'Aplicado', tono: 'success' },
}

/** `2026-08-05` → `5-ago`. Sin `toLocaleDateString`, que se corre de día por zona horaria. */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fechaCorta(f: string | null): string {
  if (!f) return '—'
  const [, m, d] = f.split('-').map(Number)
  return `${d}-${MESES[m - 1]}`
}

function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n)}%`
}

export function Liquidacion() {
  const { marca } = useSesion()
  const { confirmar } = useConfirmar()
  const toast = useToast()

  const [campanias, setCampanias] = useState<Campania[] | null>(null)
  const [puede, setPuede] = useState<Permisos>({ aplicar: false, admin: false })
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useFiltroUrl<string>('liq', '')
  const [editando, setEditando] = useState<Campania | 'nueva' | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const d = await leerCampanias(marca)
      setCampanias(d.campanias)
      setPuede(d.puede)
    } catch (e) {
      setCampanias([])
      setError(e instanceof Error ? e.message : 'No se pudieron leer las campañas.')
    }
  }, [marca])

  // El `setCampanias(null)` va adentro del async y no en el cuerpo del efecto: el lint del repo
  // prohíbe el setState sincrónico dentro de un efecto (cascada de renders) y es el mismo patrón
  // que usa el calendario. Sirve para volver al esqueleto al cambiar de marca, en vez de dejar a
  // la vista las campañas de la marca anterior mientras bajan las otras.
  useEffect(() => {
    void (async () => {
      setCampanias(null)
      await cargar()
    })()
  }, [cargar])

  const laAbierta = useMemo(
    () => (abierta ? campanias?.find((c) => c.id === abierta) || null : null),
    [abierta, campanias],
  )

  // Una campaña que ya no está (la borró otra persona, o el link vino con un id viejo) devuelve a
  // la lista sola en vez de dejar la pantalla en blanco sin explicar nada.
  useEffect(() => {
    if (abierta && campanias && !laAbierta) setAbierta('')
  }, [abierta, campanias, laAbierta, setAbierta])

  async function guardarCampania(datos: { nombre: string; desde: string | null; hasta: string | null; nota: string | null }) {
    try {
      if (editando === 'nueva') {
        const c = await crearCampania(marca, { id: nuevoIdLiquidacion(), ...datos })
        setEditando(null)
        await cargar()
        setAbierta(c.id)
        toast.ok('Campaña creada.')
      } else if (editando) {
        await renombrarCampania(marca, editando.id, datos)
        setEditando(null)
        await cargar()
        toast.ok('Campaña guardada.')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  async function borrar(c: Campania) {
    const ok = await confirmar({
      titulo: 'Borrar la campaña',
      mensaje: c.conteo.total
        ? `"${c.nombre}" tiene ${c.conteo.total} ${c.conteo.total === 1 ? 'producto' : 'productos'}${c.conteo.definidos ? `, ${c.conteo.definidos} con precio decidido` : ''}. Se borra todo.`
        : `Se borra "${c.nombre}".`,
      ok: 'Borrar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarCampania(marca, c.id)
      if (abierta === c.id) setAbierta('')
      await cargar()
      toast.ok('Campaña borrada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
  }

  if (campanias === null) return <Esqueleto forma="tabla" />

  return (
    <>
      <HeaderAcciones>
        {!laAbierta && (
          <Button variant="solid" tone="brand" onClick={() => setEditando('nueva')}>
            Nueva campaña
          </Button>
        )}
      </HeaderAcciones>

      {error && <Notice tone="danger" style={{ marginBottom: space[4] }}>{error}</Notice>}

      {laAbierta ? (
        <DetalleCampania
          campania={laAbierta}
          puede={puede}
          onVolver={() => setAbierta('')}
          onEditar={() => setEditando(laAbierta)}
          onCambio={() => void cargar()}
        />
      ) : (
        <ListaCampanias
          campanias={campanias}
          onAbrir={(c) => setAbierta(c.id)}
          onNueva={() => setEditando('nueva')}
          onBorrar={borrar}
        />
      )}

      {editando && (
        <ModalCampania
          key={editando === 'nueva' ? 'nueva' : editando.id}
          editando={editando}
          onCerrar={() => setEditando(null)}
          onGuardar={guardarCampania}
        />
      )}
    </>
  )
}

// ── La lista de campañas ──────────────────────────────────────────────────────────────────────

function ListaCampanias({
  campanias, onAbrir, onNueva, onBorrar,
}: {
  campanias: Campania[]
  onAbrir: (c: Campania) => void
  onNueva: () => void
  onBorrar: (c: Campania) => void
}) {
  if (!campanias.length) {
    return (
      <EmptyState
        title="Todavía no hay ninguna campaña"
        hint="Una campaña de sale junta los productos que se van a liquidar, con su precio y su fecha. Los productos entran desde Análisis → Por producto, con «Mandar a liquidación»."
        action={<Button variant="solid" tone="brand" onClick={onNueva}>Nueva campaña</Button>}
      />
    )
  }

  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Campaña</Th>
          <Th>Estado</Th>
          <Th align="right">Productos</Th>
          <Th align="right">Con precio</Th>
          <Th>Vigencia</Th>
          <Th>Armó</Th>
          <Th />
        </Tr>
      </THead>
      <TBody>
        {campanias.map((c) => {
          const r = ROTULO_CAMPANIA[c.estado] || ROTULO_CAMPANIA.borrador
          return (
            <Tr key={c.id} onClick={() => onAbrir(c)}>
              <Td>
                <b style={{ fontWeight: weight.semibold }}>{c.nombre}</b>
                {c.nota && <div style={{ color: color.mut, fontSize: font.sm }}>{c.nota}</div>}
              </Td>
              <Td><StatusPill tone={r.tono} label={r.label} /></Td>
              <Td align="right">{c.conteo.total}</Td>
              <Td align="right">
                {c.conteo.definidos + c.conteo.aplicados}
                {c.conteo.pendientes > 0 && (
                  <span style={{ color: color.mut, fontSize: font.sm }}> · {c.conteo.pendientes} sin definir</span>
                )}
              </Td>
              <Td>{c.desde || c.hasta ? `${fechaCorta(c.desde)} → ${fechaCorta(c.hasta)}` : '—'}</Td>
              <Td style={{ color: color.mut }}>{c.creadoPor || '—'}</Td>
              <Td align="right">
                {/*
                  El `onClick` del kit no recibe el evento (`() => void`), así que el corte de la
                  propagación va en un span nativo: sin esto, borrar una campaña la abre primero.
                */}
                <span onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" tone="danger" size="sm" onClick={() => onBorrar(c)}>Borrar</Button>
                </span>
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

// ── Una campaña por dentro ────────────────────────────────────────────────────────────────────

function DetalleCampania({
  campania, puede, onVolver, onEditar, onCambio,
}: {
  campania: Campania
  puede: Permisos
  onVolver: () => void
  onEditar: () => void
  onCambio: () => void
}) {
  const { marca } = useSesion()
  const { confirmar } = useConfirmar()
  const toast = useToast()

  const [items, setItems] = useState<LiquidacionItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useFiltroUrl<string>('q', '')
  const [filtro, setFiltro] = useFiltroUrl<string>('f', '')
  /**
   * Qué producto está abierto en el modal, y en qué orden se recorren.
   *
   * 🔑 **El orden se congela al abrir.** La grilla ordena por estado (primero lo que falta
   * decidir), así que guardar un precio mueve la fila de lugar: si el ←/→ leyera la lista viva, el
   * "siguiente" sería otro producto cada vez que se guarda uno y se terminaría saltando la mitad.
   */
  const [definiendo, setDefiniendo] = useState<{ orden: string[]; i: number } | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setItems(await leerItems(marca, campania.id))
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : 'No se pudieron leer los productos.')
    }
  }, [marca, campania.id])

  useEffect(() => {
    void (async () => {
      setItems(null)
      await cargar()
    })()
  }, [cargar])

  const resumen = useMemo(() => resumenCampania(items || []), [items])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (items || [])
      .filter((i) => (filtro ? i.estado === filtro : true))
      .filter((i) => !q || i.foto.nombre.toLowerCase().includes(q) || (i.foto.sku || '').toLowerCase().includes(q))
      // Primero lo que espera una decisión nuestra; dentro de cada grupo, el que tiene más plata
      // parada arriba. Ordenar por nombre pondría a la vista lo que da lo mismo mirar primero.
      .sort((a, b) => {
        const peso = (e: EstadoItem) => (e === 'pendiente' ? 0 : e === 'definido' ? 1 : e === 'aplicado' ? 2 : 3)
        return peso(a.estado) - peso(b.estado) || b.foto.costo * b.foto.stock - a.foto.costo * a.foto.stock
      })
  }, [items, busqueda, filtro])

  async function moverEstado(item: LiquidacionItem, estado: EstadoItem) {
    try {
      await estadoItem(marca, campania.id, item.pid, estado)
      await cargar()
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el estado.')
    }
  }

  /**
   * El producto que está abierto en el modal, buscado por pid en la lista viva: el `orden` guarda
   * pid y no el ítem entero, así lo que se ve es lo último que contestó el servidor.
   *
   * Si no aparece —lo sacó otra persona mientras estaba abierto— el modal no se dibuja, que es lo
   * mismo que cerrarlo. Se resuelve al dibujar y no con un efecto: un efecto que hace `setState`
   * es una cascada de renders (y el lint del repo lo prohíbe).
   */
  const enModal = useMemo(() => {
    if (!definiendo || !items) return null
    return items.find((x) => x.pid === definiendo.orden[definiendo.i]) || null
  }, [definiendo, items])

  function irAlIndice(i: number) {
    setDefiniendo((d) => (d && i >= 0 && i < d.orden.length ? { ...d, i } : d))
  }

  /**
   * Descartar o volver a la pila desde el modal. Descartar **pasa al siguiente**: es una decisión
   * tomada sobre ese producto y quedarse mirándolo no sirve para nada.
   */
  async function estadoDesdeModal(item: LiquidacionItem, estado: 'descartado' | 'pendiente') {
    await moverEstado(item, estado)
    if (estado !== 'descartado' || !definiendo) return
    if (definiendo.i >= definiendo.orden.length - 1) setDefiniendo(null)
    else irAlIndice(definiendo.i + 1)
  }

  /** Guarda la decisión de un producto. `seguir` pasa al que viene sin cerrar el modal. */
  async function guardarDecision(item: LiquidacionItem, seguir: boolean) {
    try {
      await guardarItem(marca, campania.id, item)
      await cargar()
      onCambio()
      if (!seguir) return void toast.ok(item.decision.precioSale ? 'Precio guardado.' : 'Precio borrado.')
      const ultimo = !definiendo || definiendo.i >= definiendo.orden.length - 1
      if (ultimo) {
        setDefiniendo(null)
        toast.ok('Era el último de la lista.')
      } else {
        irAlIndice(definiendo.i + 1)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el precio.')
    }
  }

  async function quitar(item: LiquidacionItem) {
    const ok = await confirmar({
      titulo: 'Sacar de la campaña',
      mensaje: `"${item.foto.nombre}" sale de la campaña y no queda registro de que se lo evaluó. Si lo miraste y decidiste que no va, usá «Descartar»: así no vuelve a aparecer en la próxima pasada.`,
      ok: 'Sacar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await quitarItem(marca, campania.id, item.pid)
      await cargar()
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo quitar.')
    }
  }

  async function cambiarEstado(estado: EstadoCampania) {
    try {
      await cambiarEstadoCampania(marca, campania.id, estado)
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el estado.')
    }
  }

  const rot = ROTULO_CAMPANIA[campania.estado] || ROTULO_CAMPANIA.borrador

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <Button variant="ghost" size="sm" onClick={onVolver}>← Campañas</Button>
        <h2 style={{ margin: 0, fontSize: font.xl, fontWeight: weight.semibold }}>{campania.nombre}</h2>
        <StatusPill tone={rot.tono} label={rot.label} />
        {(campania.desde || campania.hasta) && (
          <span style={{ color: color.mut, fontSize: font.sm }}>
            {fechaCorta(campania.desde)} → {fechaCorta(campania.hasta)}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2] }}>
          <Button variant="ghost" size="sm" onClick={onEditar}>Editar</Button>
          {campania.estado === 'borrador' && (
            <Button variant="soft" tone="brand" size="sm" onClick={() => void cambiarEstado('en_curso')}>
              Marcar en curso
            </Button>
          )}
          {campania.estado === 'en_curso' && (
            <Button variant="ghost" size="sm" onClick={() => void cambiarEstado('borrador')}>Volver a borrador</Button>
          )}
          {campania.estado === 'aplicada' && (
            <Button variant="soft" size="sm" onClick={() => void cambiarEstado('cerrada')}>Cerrar campaña</Button>
          )}
        </div>
      </div>

      {error && <Notice tone="danger" style={{ marginBottom: space[4] }}>{error}</Notice>}

      {items === null ? (
        <Esqueleto forma="tabla" />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[3], marginBottom: space[4] }}>
            <KpiCard label="Productos" value={String(resumen.total)} sub={resumen.pendientes ? `${resumen.pendientes} sin definir` : 'todos definidos'} />
            <KpiCard label="Plata parada" value={formatMoney(resumen.plataInmovilizada)} sub="costo del stock que se quiere mover" />
            <KpiCard label="Descuento promedio" value={pct(resumen.descPromedio)} sub="ponderado por stock" />
            <KpiCard
              label="Se resigna"
              value={formatMoney(resumen.resigna)}
              sub="contra precio de lista, si se vende todo"
            />
          </div>

          {/*
            El aviso va acá arriba y no sólo en la fila: un costo que no vino de Gestión Nube hace
            que todos los márgenes de esta pantalla sean falsos, y eso no se descubre revisando
            fila por fila una lista de cuarenta.
          */}
          {resumen.conProblema > 0 && (
            <Notice tone="warning" style={{ marginBottom: space[4] }}>
              <b>{resumen.conProblema}</b> {resumen.conProblema === 1 ? 'producto tiene' : 'productos tienen'} algo
              que revisar antes de ponerle precio (costo que no vino de Gestión Nube, precio de lista
              en cero o sale por debajo del costo). Están marcados en la lista.
            </Notice>
          )}

          <FilterBar>
            <BuscarInput value={busqueda} onChange={setBusqueda} placeholder="Buscar producto o SKU…" />
            <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 190 }} aria-label="Estado">
              <option value="">Todos ({resumen.total})</option>
              <option value="pendiente">Sin definir ({resumen.pendientes})</option>
              <option value="definido">Definidos ({resumen.definidos})</option>
              <option value="descartado">Descartados ({resumen.descartados})</option>
              <option value="aplicado">Aplicados ({resumen.aplicados})</option>
            </Select>
          </FilterBar>

          {!visibles.length ? (
            <EmptyState
              title={items.length ? 'Ningún producto con ese filtro' : 'La campaña está vacía'}
              hint={
                items.length
                  ? 'Probá con otro estado o limpiá la búsqueda.'
                  : 'Los productos entran desde Análisis → Por producto: tildalos y usá «Mandar a liquidación».'
              }
            />
          ) : (
            <TableWrap>
              <THead>
                <Tr>
                  <Th />
                  <Th>Producto</Th>
                  <Th align="right">Precio</Th>
                  <Th align="right">Sale</Th>
                  <Th align="right">Desc.</Th>
                  <Th align="right">Margen</Th>
                  <Th align="right">Stock</Th>
                  <Th align="right">90 d</Th>
                  <Th>Estado</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {visibles.map((i, n) => (
                  <FilaItem
                    key={i.pid}
                    item={i}
                    puedeMover={campania.estado !== 'cerrada'}
                    onDefinir={() => setDefiniendo({ orden: visibles.map((v) => v.pid), i: n })}
                    onDescartar={() => void moverEstado(i, 'descartado')}
                    onVolver={() => void moverEstado(i, 'pendiente')}
                    onQuitar={() => void quitar(i)}
                  />
                ))}
              </TBody>
            </TableWrap>
          )}

          {/*
            Escribir el precio en Gestión Nube es la tanda 3. Decirlo acá es más honesto que dejar
            una pantalla que se ve terminada y no hace lo que promete el nombre.
          */}
          <Card style={{ marginTop: space[5], background: color.bg2 }}>
            <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.6 }}>
              Los precios decididos todavía <b>no están puestos en la tienda</b>: escribirlos en
              Gestión Nube es el paso que sigue (tanda 3
              {puede.aplicar ? '' : ' — y pide el permiso «Puede escribir los precios en Gestión Nube»'}).
              Hasta entonces, la campaña es la decisión tomada y compartida, no el precio aplicado.
            </div>
          </Card>
        </>
      )}

      {enModal && definiendo && (
        <DefinirPrecio
          // Remonta al pasar de producto: el formulario nace del ítem, sin efectos que lo rellenen.
          key={enModal.pid}
          item={enModal}
          posicion={definiendo.i + 1}
          total={definiendo.orden.length}
          puedeEditar={campania.estado !== 'cerrada'}
          onAnterior={definiendo.i > 0 ? () => irAlIndice(definiendo.i - 1) : null}
          onSiguiente={definiendo.i < definiendo.orden.length - 1 ? () => irAlIndice(definiendo.i + 1) : null}
          onGuardar={guardarDecision}
          onEstado={(estado) => estadoDesdeModal(enModal, estado)}
          onCerrar={() => setDefiniendo(null)}
        />
      )}
    </>
  )
}

function FilaItem({
  item, puedeMover, onDefinir, onDescartar, onVolver, onQuitar,
}: {
  item: LiquidacionItem
  puedeMover: boolean
  onDefinir: () => void
  onDescartar: () => void
  onVolver: () => void
  onQuitar: () => void
}) {
  const rot = ROTULO_ITEM[item.estado] || ROTULO_ITEM.pendiente
  const problemas = avisos(item).filter((a) => a.nivel === 'alto')
  const apagado = item.estado === 'descartado'

  return (
    <Tr onClick={onDefinir} style={apagado ? { opacity: 0.55 } : undefined}>
      <Td style={{ width: 48 }}>
        {item.foto.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.foto.imagen}
            alt=""
            style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: radius.sm, display: 'block' }}
          />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: radius.sm, background: color.bg2, border: `1px solid ${color.line}` }} />
        )}
      </Td>
      <Td>
        <div style={{ fontWeight: weight.medium }}>{item.foto.nombre}</div>
        <div style={{ color: color.mut, fontSize: font.sm }}>
          {item.foto.sku || 'sin SKU'}
          {item.foto.costo > 0 && !item.foto.sinCosto && ` · costo ${formatMoney(item.foto.costo)}`}
          {item.foto.diasSinVender > 0 && ` · sin vender hace ${item.foto.diasSinVender} d`}
        </div>
        {problemas.map((p, n) => (
          <div key={n} style={{ color: color.dangerInk, fontSize: font.sm, marginTop: space[0.5] }}>⚠ {p.texto}</div>
        ))}
      </Td>
      <Td align="right">
        {formatMoney(item.foto.precioNormal)}
        {item.foto.promoPrevia != null && (
          <div style={{ color: color.mut, fontSize: font.sm }}>hoy {formatMoney(item.foto.promoPrevia)}</div>
        )}
      </Td>
      <Td align="right">{item.decision.precioSale ? formatMoney(item.decision.precioSale) : '—'}</Td>
      <Td align="right">{pct(item.decision.pctDesc)}</Td>
      <Td align="right">{item.foto.sinCosto ? '—' : pct(item.decision.margen)}</Td>
      <Td align="right">{item.foto.stock}</Td>
      <Td align="right">{item.foto.ventas90}</Td>
      <Td><StatusPill tone={rot.tono} label={rot.label} /></Td>
      {/*
        El `onClick` del kit no recibe el evento (`() => void`), así que el corte de la propagación
        va en un span nativo: sin esto, descartar una fila abre además el modal de precio.
      */}
      <Td align="right" style={{ whiteSpace: 'nowrap' }}>
        <Button variant="soft" tone="brand" size="sm" onClick={onDefinir}>
          {item.decision.precioSale ? 'Ver' : 'Definir'}
        </Button>
        {puedeMover && item.estado !== 'aplicado' && (
          <span onClick={(e) => e.stopPropagation()}>
            {item.estado === 'descartado' ? (
              <Button variant="ghost" size="sm" onClick={onVolver}>Volver a la pila</Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onDescartar}>Descartar</Button>
            )}
            <Button variant="ghost" tone="danger" size="sm" onClick={onQuitar}>Sacar</Button>
          </span>
        )}
      </Td>
    </Tr>
  )
}

// ── Alta y edición de la campaña ──────────────────────────────────────────────────────────────

/**
 * ⚠️ El padre lo monta **sólo cuando hay algo que editar**, y con `key`: el formulario se rellena
 * en el inicializador del `useState`, no en un efecto. Rellenarlo con un efecto obliga a un
 * setState sincrónico adentro (cascada de renders, y el lint del repo lo prohíbe con razón); con
 * `key`, abrir otra campaña remonta el componente y el estado nace del valor correcto solo.
 */
function ModalCampania({
  editando, onCerrar, onGuardar,
}: {
  editando: Campania | 'nueva'
  onCerrar: () => void
  onGuardar: (d: { nombre: string; desde: string | null; hasta: string | null; nota: string | null }) => Promise<void>
}) {
  const esNueva = editando === 'nueva'
  const previa = editando === 'nueva' ? null : editando

  const [nombre, setNombre] = useState(previa?.nombre || '')
  const [desde, setDesde] = useState(previa?.desde || '')
  const [hasta, setHasta] = useState(previa?.hasta || '')
  const [nota, setNota] = useState(previa?.nota || '')
  const [guardando, setGuardando] = useState(false)

  const malLasFechas = !!desde && !!hasta && hasta < desde

  async function guardar() {
    if (!nombre.trim() || malLasFechas || guardando) return
    setGuardando(true)
    try {
      await onGuardar({ nombre: nombre.trim(), desde: desde || null, hasta: hasta || null, nota: nota.trim() || null })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={esNueva ? 'Nueva campaña de liquidación' : 'Editar campaña'}
      // Perder el nombre y las fechas por un clic al costado molesta más de lo que ayuda cerrar rápido.
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={!nombre.trim() || malLasFechas}>
            {esNueva ? 'Crear campaña' : 'Guardar'}
          </Button>
        </>
      }
    >
      <Field label="Nombre" hint="El que lo va a identificar dentro de seis meses: «Sale invierno ago-2026».">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Sale invierno ago-2026" data-foco />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
        <Field label="Desde" hint="Opcional.">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta" hint="Opcional.">
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
      </div>
      {malLasFechas && <Notice tone="danger">La fecha de fin es anterior a la de inicio.</Notice>}
      <Field label="Nota" hint="Opcional: por qué se arma, qué se busca mover.">
        <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Bajar el stock de camperas antes de la temporada" />
      </Field>
    </Modal>
  )
}

/** Se exporta para el selector de campaña de Análisis, que necesita los mismos rótulos. */
export { ROTULO_CAMPANIA, contar }
