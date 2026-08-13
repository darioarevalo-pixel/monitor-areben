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
 * ▶️ **Tandas 1, 2 y 4 de 4.** El cajón (crear la campaña, mandarle productos, moverles el estado),
 * el modal que le pone el precio a cada uno con el simulador al lado (`DefinirPrecio.tsx`, ←/→ para
 * pasar al siguiente sin cerrar) y la pestaña **Resultado** (`Resultado.tsx`).
 *
 * 🔴 **La tanda 3 —escribir los precios en Gestión Nube— está trabada, y no por donde se creía.**
 * No es que falte saber el nombre del campo del promocional: el token del Monitor **no tiene permiso
 * para escribir productos**. `PATCH /api/v1/productos/{id}` contesta 403 «Invalid ability provided»
 * (probado contra un producto real el 5-ago-2026), y el mismo token lee inventario y escribe
 * observaciones sin problema. Hasta que Gestión Nube habilite esa ability, los precios se cargan a
 * mano — y de ahí sale la razón de ser del Resultado: contrastar lo decidido contra lo cobrado es el
 * único control posible sobre una carga manual de cuarenta productos.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { puedeVer } from '@/lib/permisos'
import {
  avisos, confirmarItem, contar, nuevoIdLiquidacion, pidsPorAplicar, reprecificar, resumenCampania,
  TOPE_APLICAR, TOPE_MASIVO,
  type EstadoCampania, type EstadoItem, type Liquidacion as Campania, type LiquidacionItem,
} from '@/lib/liquidacion'
import {
  aplicarPrecios, borrarCampania, cambiarEstadoCampania, crearCampania, decidirMasivo, estadoItem,
  guardarItem, leerCampanias, leerItems, quitarItem, renombrarCampania, revisarItem, type Permisos,
} from '@/lib/liquidacion/persistencia'
import { ponerPuenteAsignar } from '@/lib/tncat/puente'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { DefinirPrecio } from './DefinirPrecio'
import { Resultado } from './Resultado'
import { Revision } from './Revision'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  BuscarInput, Button, Card, EmptyState, Esqueleto, Field, FilterBar, Input, KpiCard, Modal,
  Notice, Select, StatusPill, TBody, THead, TableWrap, Tabs, Td, Th, Tr, formatMoney, useConfirmar,
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
  confirmado: { label: 'Confirmado', tono: 'success' },
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
        ? `"${c.nombre}" tiene ${c.conteo.total} ${c.conteo.total === 1 ? 'producto' : 'productos'}${c.conteo.definidos + c.conteo.confirmados ? `, ${c.conteo.definidos + c.conteo.confirmados} con precio decidido` : ''}. Se borra todo.`
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
                {c.conteo.definidos + c.conteo.confirmados + c.conteo.aplicados}
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
  const { marca, perfil } = useSesion()
  /** Quién está haciendo esto: va como autor del precio y del visto bueno. */
  const yo = perfil?.name || null
  const { confirmar } = useConfirmar()
  const toast = useToast()
  const router = useRouter()

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
  const [pestania, setPestania] = useFiltroUrl<string>('t', 'productos')
  /**
   * La escritura contra Gestión Nube, mientras corre.
   *
   * 🔑 **Hace falta un estado porque tarda minutos, no segundos**: son ~6 para una campaña de 260
   * contra el tope de GN. Un spinner mudo durante seis minutos se lee como "se colgó", y quien mira
   * recarga la página en el medio.
   */
  const [aplicando, setAplicando] = useState<{ modo: 'poner' | 'sacar'; hechos: number; total: number } | null>(null)
  const [fallidos, setFallidos] = useState<{ pid: string; error: string }[]>([])
  /** Los masivos que sólo tocan nuestra base (confirmar todos, recalcular precios). */
  const [ocupadoMasivo, setOcupadoMasivo] = useState(false)

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
  // Cuántos faltan escribir y cuántos tienen la oferta puesta. Los botones muestran el número: uno
  // que dice «Escribir 260 precios» se entiende antes de apretarlo.
  const porAplicar = useMemo(() => pidsPorAplicar(items || [], 'poner').length, [items])
  const porSacar = useMemo(() => pidsPorAplicar(items || [], 'sacar').length, [items])
  /** De los que tienen la oferta puesta, cuántos ya venían con una antes de la campaña. */
  const conOfertaPrevia = useMemo(
    () => (items || []).filter((i) => i.estado === 'aplicado' && (i.foto.promoPrevia || 0) > 0).length,
    [items],
  )

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (items || [])
      .filter((i) => (filtro ? i.estado === filtro : true))
      .filter((i) => !q || i.foto.nombre.toLowerCase().includes(q) || (i.foto.sku || '').toLowerCase().includes(q))
      // Primero lo que espera una decisión nuestra; dentro de cada grupo, el que tiene más plata
      // parada arriba. Ordenar por nombre pondría a la vista lo que da lo mismo mirar primero.
      .sort((a, b) => {
        // `confirmado` pesa lo mismo que `definido`: para esta grilla los dos son "ya tiene
        // precio", y separarlos mandaría al fondo justo los que un revisor acaba de mirar.
        const peso = (e: EstadoItem) =>
          e === 'pendiente' ? 0 : e === 'definido' || e === 'confirmado' ? 1 : e === 'aplicado' ? 2 : 3
        return peso(a.estado) - peso(b.estado) || b.foto.costo * b.foto.stock - a.foto.costo * a.foto.stock
      })
  }, [items, busqueda, filtro])

  /**
   * La fecha de alta del producto, del ETL. No está en la foto congelada y no hace falta que esté:
   * no se mueve nunca (ver el docblock de `Contexto` en `DefinirPrecio`). Si el ETL todavía no
   * cargó devuelve `null` y la columna muestra «—» — es contexto, no frena la revisión.
   */
  const { datos } = useDatosMonitor()
  const ingresos = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of datos?.allProductos ?? []) if (p.ingresoFecha) m[p.id] = p.ingresoFecha
    return m
  }, [datos])
  const ingresoDe = useCallback((pid: string) => ingresos[pid] ?? null, [ingresos])

  async function guardarRevision(item: LiquidacionItem) {
    try {
      await revisarItem(marca, campania.id, item)
      await cargar()
      onCambio()
      toast.ok(item.estado === 'confirmado' ? 'Precio confirmado.' : 'Devuelto con el motivo.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la revisión.')
    }
  }

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

  /**
   * Escribe (o saca) los precios de la campaña en Gestión Nube, de a `TOPE_APLICAR` por viaje.
   *
   * 🔑 **El bucle está acá y no en el servidor** porque una campaña grande no entra en el tiempo de
   * una función: contra el tope de GN son ~1,2 s por producto. Partirlo en viajes chicos da además
   * el progreso y la reanudación — los que ya se aplicaron salen solos de `pidsPorAplicar`, así que
   * cortar en la mitad y volver a apretar sigue donde quedó en vez de reescribir todo.
   *
   * 🔑 **Un producto que falla no frena la tanda ni se pierde**: queda nombrado en `fallidos`. Un
   * contador de errores sin los nombres obliga a revisar los 260 a mano para encontrar los 3.
   */
  /**
   * Confirmar de una todos los que no pasaron por revisión.
   *
   * 🔑 **El cartel dice cuántos tienen un aviso ALTO**, que es lo único que la revisión de a uno
   * hubiera cazado y esto se saltea. El 13-ago-2026 se confirmaron 260 con un script y quedaron
   * adentro 7 con el precio de sale por debajo del costo: sin ese número, «confirmar todos» parece
   * gratis.
   */
  async function confirmarTodos(sinRevisar: LiquidacionItem[]) {
    const conAvisoAlto = sinRevisar.filter((i) => avisos(i).some((a) => a.nivel === 'alto'))
    const ok = await confirmar({
      titulo: `Confirmar ${sinRevisar.length} precios sin mirarlos de a uno`,
      mensaje: conAvisoAlto.length
        ? `De los ${sinRevisar.length}, hay ${conAvisoAlto.length} con un aviso importante sin resolver (precio abajo del costo, costo que no vino de Gestión Nube o sin precio de lista): ${conAvisoAlto.slice(0, 4).map((i) => i.foto.nombre).join(', ')}${conAvisoAlto.length > 4 ? '…' : ''}. Confirmándolos en masa, nadie los va a mirar.`
        : `Quedan listos para escribirse en Gestión Nube sin que nadie los haya mirado de a uno.`,
      ok: `Confirmar los ${sinRevisar.length}`,
      tono: conAvisoAlto.length ? 'danger' : 'brand',
    })
    if (!ok) return
    setOcupadoMasivo(true)
    try {
      for (let i = 0; i < sinRevisar.length; i += TOPE_MASIVO) {
        await Promise.all(sinRevisar.slice(i, i + TOPE_MASIVO).map((it) => revisarItem(marca, campania.id, confirmarItem(it, yo))))
      }
      await cargar()
      onCambio()
      toast.ok(`${sinRevisar.length} confirmados.`)
    } catch (e) {
      await cargar()
      toast.error(e instanceof Error ? e.message : 'No se pudieron confirmar.')
    } finally {
      setOcupadoMasivo(false)
    }
  }

  /**
   * Cambiarle el precio a toda la campaña de una, con un % sobre el precio de lista.
   *
   * 🔑 **Es para terminar un sale sin volver de golpe al precio de lista**: bajar de −40% a −20% de
   * a uno son 260 modales. La cuenta la hace `reprecificar` con la regla de siempre, y los ítems
   * vuelven a `definido` — un precio nuevo es un precio que nadie miró.
   */
  async function reprecificarTodos() {
    const txt = window.prompt('¿Qué descuento sobre el precio de lista? (por ejemplo 20 para −20%)')
    if (txt == null) return
    const pct = Number(txt.replace(',', '.').replace('%', '').trim())
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      toast.error('Poné un número entre 1 y 99.')
      return
    }
    const nuevos = reprecificar(items || [], pct, yo)
    if (!nuevos.length) { toast.error('No hay productos con precio de lista para recalcular.'); return }
    // La vista previa va con nombres y números concretos: un «se van a cambiar 260 precios» no deja
    // ver que un producto de $52.490 termina en $41.990.
    const muestra = nuevos.slice(0, 3).map((i) => `${i.foto.nombre}: $${Math.round(i.foto.precioNormal).toLocaleString('es-AR')} → $${Math.round(i.decision.precioSale || 0).toLocaleString('es-AR')}`).join(' · ')
    const ok = await confirmar({
      titulo: `Dejar todo a −${pct}% del precio de lista`,
      mensaje: `Se les recalcula el precio a ${nuevos.length} productos: ${muestra}${nuevos.length > 3 ? ' · …' : ''}. Quedan para revisar y después hay que escribirlos en Gestión Nube: esto todavía no toca la tienda.`,
      ok: `Recalcular ${nuevos.length}`,
      tono: 'brand',
    })
    if (!ok) return
    setOcupadoMasivo(true)
    try {
      for (let i = 0; i < nuevos.length; i += TOPE_MASIVO) {
        await decidirMasivo(marca, campania.id, nuevos.slice(i, i + TOPE_MASIVO))
      }
      await cargar()
      onCambio()
      toast.ok(`${nuevos.length} precios recalculados a −${pct}%.`)
    } catch (e) {
      await cargar()
      toast.error(e instanceof Error ? e.message : 'No se pudieron recalcular.')
    } finally {
      setOcupadoMasivo(false)
    }
  }

  async function aplicar(modo: 'poner' | 'sacar', destino: 'lista' | 'previa' = 'lista') {
    const pids = pidsPorAplicar(items || [], modo)
    if (!pids.length) {
      toast.error(modo === 'poner' ? 'No hay precios confirmados para escribir.' : 'No hay ofertas puestas para sacar.')
      return
    }
    const minutos = Math.max(1, Math.round((pids.length * 1.3) / 60))
    const cuanto = minutos === 1 ? 'menos de un minuto' : `unos ${minutos} minutos`
    // Cuántos de los que se van a sacar tenían una oferta ANTES de la campaña. Es el número que
    // decide entre las dos salidas, y por eso va en el cartel: sin él, «volver a precio de lista»
    // parece inocuo y a esos les sube el precio más de lo que estaba antes del sale.
    const conPrevia = modo === 'sacar'
      ? (items || []).filter((i) => pids.includes(i.pid) && (i.foto.promoPrevia || 0) > 0).length
      : 0
    const ok = await confirmar({
      titulo: modo === 'poner'
        ? 'Escribir los precios en Gestión Nube'
        : destino === 'previa' ? 'Volver a la oferta que tenían' : 'Dejar todo a precio de lista',
      mensaje: modo === 'poner'
        ? `Se le va a escribir el precio de sale a ${pids.length} ${pids.length === 1 ? 'producto' : 'productos'} en Gestión Nube, y de ahí pasa a la tienda. Tarda ${cuanto}: no cierres la pestaña. Si se corta, se puede retomar.`
        : destino === 'previa'
          ? `A los ${conPrevia} que ya estaban en oferta cuando entraron a la campaña se les devuelve ESA oferta; los otros ${pids.length - conPrevia} quedan a precio de lista, que es como estaban. Tarda ${cuanto}.`
          : `${pids.length} ${pids.length === 1 ? 'producto vuelve' : 'productos vuelven'} a su precio de lista.${conPrevia > 0 ? ` ⚠️ Ojo: ${conPrevia} de ellos YA estaban en oferta antes del sale, así que a esos les vas a subir el precio por encima de donde estaban. Para eso está «Volver a la oferta que tenían».` : ''} Tarda ${cuanto}.`,
      ok: modo === 'poner' ? 'Escribir los precios' : destino === 'previa' ? 'Volver a la oferta previa' : 'Dejar a precio de lista',
      tono: modo === 'poner' ? 'brand' : 'danger',
    })
    if (!ok) return

    setFallidos([])
    setAplicando({ modo, hechos: 0, total: pids.length })
    const malos: { pid: string; error: string }[] = []
    try {
      for (let i = 0; i < pids.length; i += TOPE_APLICAR) {
        const tanda = pids.slice(i, i + TOPE_APLICAR)
        const res = await aplicarPrecios(marca, campania.id, tanda, modo, destino)
        for (const r of res) if (!r.ok) malos.push({ pid: r.pid, error: r.error || 'no se pudo' })
        setFallidos([...malos])
        setAplicando({ modo, hechos: Math.min(i + TOPE_APLICAR, pids.length), total: pids.length })
      }
      await cargar()
      /*
       * El estado de la campaña sigue a lo que hay puesto en Gestión Nube, en los dos sentidos.
       *
       * 🔑 **Volver a `en_curso` al sacar la última oferta se cazó ejerciendo el botón**: la campaña
       * quedaba «Aplicada» sin una sola oferta viva, o sea la pantalla afirmando que los precios
       * están puestos cuando no queda ninguno. Es la misma regla que ya valía para el ítem — sólo
       * que arriba no la había aplicado.
       *
       * Si algo falló no se mueve: el estado diría que entraron todos.
       */
      if (!malos.length) {
        const destino = modo === 'poner' ? 'aplicada' : 'en_curso'
        const mover = modo === 'poner' ? campania.estado === 'en_curso' : campania.estado === 'aplicada'
        if (mover) {
          try { await cambiarEstadoCampania(marca, campania.id, destino) } catch { /* secundario: los precios ya están escritos */ }
        }
      }
      onCambio()
      if (malos.length) toast.error(`Quedaron ${malos.length} sin ${modo === 'poner' ? 'escribir' : 'sacar'}. Están listados abajo.`)
      else toast.ok(modo === 'poner' ? `Listo: ${pids.length} ${pids.length === 1 ? 'precio escrito' : 'precios escritos'} en Gestión Nube.` : 'Listo: las ofertas quedaron sacadas.')
    } catch (e) {
      // Se corta la tanda, pero lo ya escrito quedó escrito y anotado: por eso se recarga igual.
      await cargar()
      onCambio()
      toast.error(e instanceof Error ? e.message : 'Se cortó la escritura en Gestión Nube.')
    } finally {
      setAplicando(null)
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
          {/*
            La otra puerta del "modo campaña". Una campaña no se arma de una sentada: se vuelve a
            Análisis varias veces con filtros distintos, y hasta ahora no había forma de saber qué
            ya se había mandado. Esto es sólo la navegación —el marcado lo hace `useCampaniaAbierta`
            del otro lado—, y por eso la campaña viaja en la URL.

            Se esconde sin el permiso de Análisis → Por producto: el shell rebota a Inicio a quien
            no lo tenga (`app/[[...seccion]]/page.tsx`), así que el botón sería una trampa.
          */}
          {campania.estado !== 'cerrada' && puedeVer(perfil, marca, 'productos') && (
            <Button variant="ghost" size="sm" onClick={() => router.push(`/productos?liq=${encodeURIComponent(campania.id)}`)}>
              Agregar productos
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onEditar}>Editar</Button>
          {campania.estado === 'borrador' && (
            <Button variant="soft" tone="brand" size="sm" onClick={() => void cambiarEstado('en_curso')}>
              Marcar en curso
            </Button>
          )}
          {campania.estado === 'en_curso' && (
            <Button variant="ghost" size="sm" onClick={() => void cambiarEstado('borrador')}>Volver a borrador</Button>
          )}
          {/*
            🔑 "Ya cargué los precios" la marca una persona, y es un cambio de criterio respecto de
            la tanda 1: `aplicada` la iba a poner el aplicador cuando terminara de escribir en
            Gestión Nube, pero ese aplicador no existe — el token del Monitor no tiene permiso para
            escribir productos (`PATCH /productos/{id}` contesta 403 «Invalid ability provided»), así
            que los precios se cargan a mano. Si nadie más lo va a escribir, el único que puede
            decirlo es quien lo cargó. **No se le cree a ciegas**: la pestaña Resultado contrasta esa
            marca contra el precio que se cobró de verdad.
          */}
          {/*
            🔑 **Frenado mientras falte revisar un precio.** Es la mitad visible de la puerta; la
            otra está en el handler, porque deshabilitar un botón no impide nada — se saltea
            recargando en otro estado. El cartel dice cuántos faltan y adónde ir: un botón apagado
            sin motivo es lo que hace pensar que la pantalla está rota.
          */}
          {/*
            El aplicador de verdad (tanda 3). Convive con «Ya cargué los precios», que se queda para
            cuando alguien los carga a mano en Gestión Nube: los dos caminos terminan en `aplicada`.
          */}
          {(campania.estado === 'en_curso' || campania.estado === 'aplicada') && puede.aplicar && porAplicar > 0 && (
            <Button
              variant="solid"
              tone="brand"
              size="sm"
              disabled={!!aplicando || resumen.definidos > 0}
              title={resumen.definidos > 0 ? `Faltan revisar ${resumen.definidos} en la pestaña Revisión.` : undefined}
              onClick={() => void aplicar('poner')}
            >
              {aplicando?.modo === 'poner'
                ? `Escribiendo ${aplicando.hechos} de ${aplicando.total}…`
                : `Escribir ${porAplicar} ${porAplicar === 1 ? 'precio' : 'precios'} en Gestión Nube`}
            </Button>
          )}
          {/*
            🔑 **Terminar un sale tiene TRES salidas, no una.** «Precio de lista» era la única y para
            los 44 de agosto que ya venían en oferta significaba subirles el precio por encima de
            donde estaban antes. «La oferta que tenían» los devuelve a su estado real, y
            «Otro precio» es para bajar de −40% a −20% sin volver a lista: eso no se escribe acá, se
            decide (vuelve a `definido`) y después se aplica por el camino de siempre.
          */}
          {(campania.estado === 'aplicada' || campania.estado === 'cerrada') && puede.aplicar && porSacar > 0 && (
            <>
              <Button variant="soft" tone="danger" size="sm" disabled={!!aplicando} onClick={() => void aplicar('sacar', 'lista')}>
                {aplicando?.modo === 'sacar'
                  ? `Sacando ${aplicando.hechos} de ${aplicando.total}…`
                  : `Sacar ${porSacar} ${porSacar === 1 ? 'oferta' : 'ofertas'}`}
              </Button>
              {conOfertaPrevia > 0 && (
                <Button variant="ghost" size="sm" disabled={!!aplicando} onClick={() => void aplicar('sacar', 'previa')}>
                  Volver a la oferta que tenían ({conOfertaPrevia})
                </Button>
              )}
            </>
          )}
          {(campania.estado === 'en_curso' || campania.estado === 'aplicada') && puede.aplicar && (
            <Button variant="ghost" size="sm" disabled={ocupadoMasivo || !!aplicando} onClick={() => void reprecificarTodos()}>
              Otro precio para todos
            </Button>
          )}
          {/*
            🔑 **La categoría de sale vive en Tienda Nube, no en Gestión Nube** (ningún producto con
            promo viva en GN tiene una), y el camino para escribirla YA EXISTE: la card «Asignar
            categoría» de tncat, con el puente que Comisiones estrenó. Acá no se construyó nada — se
            usa lo que está.

            🔑 **Manda los que se están VIENDO, no los 260.** Las subcategorías son por tipo de
            prenda (TOPS, JEANS, SWEATERS…), así que se busca «SWEATER» arriba y se mandan esos 32;
            sin filtro, van todos y sirve para la categoría general del sale. Un selector de tipo de
            prenda propio sería una segunda forma de filtrar la misma tabla.
          */}
          {visibles.length > 0 && puedeVer(perfil, marca, 'tncat') && (
            <Button
              variant="ghost"
              size="sm"
              title="Lleva los productos que estás viendo a Asignar categoría de Tienda Nube, con los nombres ya cargados"
              onClick={() => {
                const nn = [...new Set(visibles.map((i) => i.foto.nombre.trim()).filter(Boolean))]
                if (!nn.length) { toast.error('Estos productos no tienen nombre para cruzar contra Tienda Nube.'); return }
                ponerPuenteAsignar(nn)
                router.push('/tncat/categorias')
              }}
            >
              🗂️ Categoría en TN ({visibles.length})
            </Button>
          )}
          {campania.estado === 'en_curso' && puede.aplicar && (
            <Button
              variant="soft"
              tone="brand"
              size="sm"
              disabled={resumen.definidos > 0 || !!aplicando}
              title={
                resumen.definidos > 0
                  ? `Faltan revisar ${resumen.definidos} ${resumen.definidos === 1 ? 'precio' : 'precios'} en la pestaña Revisión.`
                  : undefined
              }
              onClick={() => void cambiarEstado('aplicada')}
            >
              {resumen.definidos > 0 ? `Faltan revisar ${resumen.definidos}` : 'Ya cargué los precios'}
            </Button>
          )}
          {(campania.estado === 'en_curso' || campania.estado === 'aplicada') && (
            <Button variant="soft" size="sm" onClick={() => void cambiarEstado('cerrada')}>Cerrar campaña</Button>
          )}
          {campania.estado === 'cerrada' && (
            <Button variant="ghost" size="sm" onClick={() => void cambiarEstado('en_curso')}>Reabrir</Button>
          )}
        </div>
      </div>

      {error && <Notice tone="danger" style={{ marginBottom: space[4] }}>{error}</Notice>}

      {/*
        🔑 **Los que fallaron se nombran, no se cuentan.** "3 productos no se pudieron escribir" en
        una campaña de 260 obliga a revisarlos todos a mano para encontrar cuáles. Con el nombre y el
        motivo, se arreglan esos tres. Quedan a la vista hasta la próxima corrida.
      */}
      {fallidos.length > 0 && (
        <Notice tone="warning" style={{ marginBottom: space[4] }}>
          <strong>{fallidos.length === 1 ? 'Un producto quedó sin escribir' : `${fallidos.length} productos quedaron sin escribir`}</strong>
          <ul style={{ margin: `${space[2]} 0 0`, paddingLeft: space[5] }}>
            {fallidos.map((f) => {
              const it = (items || []).find((i) => i.pid === f.pid)
              return <li key={f.pid} style={{ fontSize: font.sm }}>{it?.foto.nombre || f.pid}: {f.error}</li>
            })}
          </ul>
          <div style={{ marginTop: space[2], fontSize: font.sm, color: color.mut }}>
            Volvé a apretar el botón: los que ya entraron no se reescriben.
          </div>
        </Notice>
      )}

      {items === null ? (
        <Esqueleto forma="tabla" />
      ) : (
        <Tabs
          variant="underline"
          style={{ marginBottom: space[4] }}
          value={pestania === 'resultado' || pestania === 'revision' ? pestania : 'productos'}
          onChange={setPestania}
          items={[
            { key: 'productos', label: 'Productos', badge: resumen.total || undefined },
            {
              key: 'revision',
              label: 'Revisión',
              // El badge cuenta los que **esperan una mirada**, no los que ya pasaron: es un
              // pendiente, y un número que no baja nunca deja de mirarse a la semana.
              badge: resumen.definidos || undefined,
              hint: resumen.definidos
                ? `${resumen.definidos} ${resumen.definidos === 1 ? 'precio espera' : 'precios esperan'} una segunda mirada`
                : 'Todos los precios decididos ya están revisados',
            },
            {
              key: 'resultado',
              label: 'Resultado',
              // Sin fecha de inicio no hay período que mirar, y la pestaña lo dice adentro en vez
              // de desaparecer: que el resultado exista es lo que empuja a ponerle la fecha.
              hint: campania.desde
                ? 'Qué se vendió de lo liquidado, y si el precio llegó a estar puesto'
                : 'Necesita una fecha de inicio',
            },
          ]}
        />
      )}

      {items !== null && pestania === 'resultado' && (
        <Resultado campania={campania} items={items} puedeSincronizar={puede.admin} />
      )}

      {items !== null && pestania === 'revision' && (
        <Revision
          items={items}
          puedeRevisar={puede.admin && campania.estado !== 'cerrada'}
          ingresoDe={ingresoDe}
          onRevisar={guardarRevision}
          onConfirmarTodos={confirmarTodos}
        />
      )}

      {items !== null && pestania !== 'resultado' && pestania !== 'revision' && (
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
              <option value="confirmado">Confirmados ({resumen.confirmados})</option>
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
            Este cartel decía que el Monitor NO podía escribir los precios (el token daba 403
            «Invalid ability provided») y que se cargaban a mano. Desde el 13-ago-2026 los escribe:
            el token se regeneró con la ability de productos. Se deja el camino manual descrito
            porque sigue existiendo —«Ya cargué los precios»— pero ya no es el único.
          */}
          <Card style={{ marginTop: space[5], background: color.bg2 }}>
            <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.6 }}>
              Los precios decididos acá <b>se escriben en Gestión Nube</b> con el botón «Escribir los
              precios», y de ahí pasan a la tienda
              {puede.aplicar ? '' : ' (pide el permiso «Puede escribir los precios en Gestión Nube»)'}.
              Si los cargás a mano, marcá la campaña con «Ya cargué los precios». En los dos casos la
              pestaña <b>Resultado</b> te va a mostrar, contra lo que se cobró de verdad, cuáles
              quedaron puestos y cuáles se olvidaron.
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
