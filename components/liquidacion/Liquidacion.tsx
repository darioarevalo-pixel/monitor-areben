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
 * ▶️ **Las cuatro tandas están.** El cajón (crear la campaña, mandarle productos, moverles el
 * estado), el modal que le pone el precio a cada uno con el simulador al lado (`DefinirPrecio.tsx`,
 * ←/→ para pasar al siguiente sin cerrar), **escribir los precios en Gestión Nube** y la pestaña
 * **Resultado** (`Resultado.tsx`).
 *
 * ⚠️ **Este docblock decía que la tanda 3 estaba trabada porque el token no puede escribir
 * productos. Dejó de ser cierto el 13-ago-2026**, cuando Gestión Nube habilitó la ability: el
 * aplicador escribe el precio promocional y lo verifica contra lo que devuelve el PATCH. El
 * Resultado sigue valiendo igual —lo aplicado puede fallar, y el precio de LISTA se sigue cargando a
 * mano en GN— pero ya no es el único control posible.
 *
 * 🔴 **Y de que el Monitor escriba precios sale el aviso de la portada**: una oferta escrita en la
 * tienda no vence sola, y la campaña que la dejó puesta ya está cerrada. Ver `AvisoColgadas`.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { puedeVer } from '@/lib/permisos'
import {
  avisos, campaniaEditable, confirmarItem, contar, filtrarGrilla, itemsSinRevisar, leerEscalera,
  nuevoIdLiquidacion, opcionesDeGrilla,
  pidsPorAplicar, porEscalera,
  reprecificar, resumenCampania,
  TIPO_CAMPANIA, TIPOS_CAMPANIA, tipoDe, TOPE_APLICAR, TOPE_MASIVO,
  type Colgadas, type EstadoCampania, type EstadoItem, type Liquidacion as Campania,
  type LiquidacionItem, type MotivoColgada, type TipoCampania,
} from '@/lib/liquidacion'
import {
  aplicarPrecios, borrarCampania, cambiarEstadoCampania, compartirCampania, crearCampania,
  decidirMasivo, estadoItem, guardarItem, leerCampanias, leerItems, quitarItem, renombrarCampania,
  revisarItem, type Permisos,
} from '@/lib/liquidacion/persistencia'
import { ponerPuenteAsignar } from '@/lib/tncat/puente'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useDestacados } from '@/components/destacados/useDestacados'
import { Estrella } from '@/components/destacados/Estrella'
// El editor de renglones y el diseño de la etiqueta viven en Etiquetas: es SU etiqueta, acá sólo se
// decide. Ver `components/etiquetas/EditorLineas.tsx`.
import { EditorLineas, TAMANIOS } from '@/components/etiquetas/EditorLineas'
import { buildLibrePdf } from '@/lib/etiquetas/pdf'
import {
  etiquetaDeCampania, MAX_LINEAS_ABAJO, MAX_TEXTO_LINEA, TAM_PRECIO_DEFAULT, TAM_PRECIO_MAX, TAM_PRECIO_MIN,
  type EtiquetaCampania,
} from '@/lib/liquidacion/etiqueta'
import { DefinirPrecio } from './DefinirPrecio'
import { Bitacora } from './Bitacora'
import { Resultado } from './Resultado'
import { Revision } from './Revision'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Badge, BuscarInput, Button, Card, EmptyState, Esqueleto, Field, FilterBar, Input, KpiCard,
  Lightbox, Modal, Notice, Select, StatusPill, TBody, THead, TableWrap, Tabs, Td, Th, Tr, formatMoney,
  useConfirmar, useFiltroUrl, useToast, color, font, radius, space, weight, type Tone,
} from '@/components/ui'

/**
 * Las pestañas que tienen componente propio. `productos` es el default y **no figura acá**: cualquier
 * `?t=` desconocido cae ahí.
 *
 * Está en una lista sola porque el `?t=` se pregunta en dos lugares —cuál marcar como activa y qué
 * dibujar abajo— y con la condición escrita a mano en los dos, sumar una pestaña es acordarse de
 * las dos. Al sumar la tercera ya se notaba.
 */
const PESTANIAS_PROPIAS = ['revision', 'resultado', 'bitacora']

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
/**
 * La escalera que trae el prompt de «Precios de mesa», sólo como punto de partida: se edita ahí
 * mismo y no se guarda en ningún lado.
 *
 * Son precios de cartel —redondos, terminados en 900— porque el número de una mesa lo lee alguien
 * parado adelante, no una planilla. Cuál corresponde a cada campaña lo decide quien la arma: acá
 * no hay una regla de negocio escondida, hay un renglón para no tipear seis números de cero.
 */
const MESAS_SUGERIDAS = '5900, 9900, 14900, 19900, 24900, 29900'

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
  const [colgadas, setColgadas] = useState<Colgadas | null>(null)
  const [sacando, setSacando] = useState(false)
  const [puede, setPuede] = useState<Permisos>({ aplicar: false, admin: false })
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useFiltroUrl<string>('liq', '')
  const [editando, setEditando] = useState<Campania | 'nueva' | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const d = await leerCampanias(marca)
      setCampanias(d.campanias)
      setColgadas(d.colgadas)
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

  async function guardarCampania(datos: { nombre: string; nombreComercial: string | null; etiqueta: EtiquetaCampania; tipo: TipoCampania; desde: string | null; hasta: string | null; nota: string | null }) {
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

  /**
   * Sacarles la oferta a las que quedaron colgadas, desde la portada.
   *
   * 🔑 **Reusa la misma acción que el botón de la campaña** (`aplicar` con `modo:'sacar'`), que es la
   * única que le escribe precios a Gestión Nube y ya tiene su permiso, su verificación del PATCH y su
   * renglón en la bitácora. Acá no hay un segundo camino de escritura: hay otro que llama al mismo.
   *
   * ⚠️ **Van a precio de LISTA.** Devolverle a cada uno la oferta que tenía antes de su campaña pide
   * la foto congelada, que en la portada no está bajada — y bajar los ítems de todas las campañas
   * para dibujar un aviso sería pagar el payload entero. El que necesite esa salida la tiene adentro
   * de la campaña, con «Volver a la oferta que tenían»; el cartel lo dice.
   */
  async function sacarColgadas() {
    const objetivo = (colgadas?.colgadas || []).filter((c) => c.seSacaDesdeAca)
    if (!objetivo.length) return
    const ok = await confirmar({
      titulo: 'Sacarles la oferta',
      mensaje: `${objetivo.length} ${objetivo.length === 1 ? 'producto vuelve' : 'productos vuelven'} a su precio de lista en Gestión Nube, y de ahí a la tienda. Si alguno ya estaba en oferta antes de su campaña, esto le sube el precio por encima de donde estaba: para devolverle ESA oferta hay que hacerlo desde la campaña, con «Volver a la oferta que tenían».`,
      ok: 'Dejar a precio de lista',
      tono: 'danger',
    })
    if (!ok) return

    setSacando(true)
    const malos: string[] = []
    try {
      // Una llamada por campaña: `aplicar` valida que el producto sea un ítem de la campaña que se le
      // pasa. Y de a `TOPE_APLICAR`, que es el tope que hace cumplir el handler.
      const porCampania = new Map<string, string[]>()
      for (const c of objetivo) porCampania.set(c.liqId, [...(porCampania.get(c.liqId) || []), c.pid])
      for (const [liqId, pids] of porCampania) {
        for (let i = 0; i < pids.length; i += TOPE_APLICAR) {
          const res = await aplicarPrecios(marca, liqId, pids.slice(i, i + TOPE_APLICAR), 'sacar', 'lista')
          for (const r of res) if (!r.ok) malos.push(`${r.pid}: ${r.error || 'no se pudo'}`)
        }
      }
      await cargar()
      if (malos.length) toast.error(`Quedaron ${malos.length} sin sacar. ${malos[0]}`)
      else toast.ok('Listo: las ofertas quedaron sacadas.')
    } catch (e) {
      await cargar()
      toast.error(e instanceof Error ? e.message : 'No se pudieron sacar las ofertas.')
    } finally {
      setSacando(false)
    }
  }

  async function borrar(c: Campania) {
    const ok = await confirmar({
      titulo: 'Eliminar la campaña',
      mensaje: c.conteo.total
        ? `"${c.nombre}" tiene ${c.conteo.total} ${c.conteo.total === 1 ? 'producto' : 'productos'}${c.conteo.definidos + c.conteo.confirmados ? `, ${c.conteo.definidos + c.conteo.confirmados} con precio decidido` : ''}. Se elimina todo.`
        : `Se elimina "${c.nombre}".`,
      ok: 'Eliminar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarCampania(marca, c.id)
      if (abierta === c.id) setAbierta('')
      await cargar()
      toast.ok('Campaña eliminada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
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
        <>
          {/*
            🔑 **El aviso va acá, arriba de la lista, y no adentro de la campaña.** La campaña que
            dejó ese precio puesto está cerrada o vencida, y a una campaña terminada no vuelve a
            entrar nadie: el aviso ahí no lo ve nunca. Liquidación es la pantalla que se abre para
            armar el sale siguiente, así que es donde el que arma se entera.
          */}
          <AvisoColgadas
            colgadas={colgadas}
            puedeAplicar={puede.aplicar}
            sacando={sacando}
            onSacar={() => void sacarColgadas()}
            onAbrirCampania={(id) => setAbierta(id)}
          />
          <ListaCampanias
            campanias={campanias}
            onAbrir={(c) => setAbierta(c.id)}
            onNueva={() => setEditando('nueva')}
            onBorrar={borrar}
          />
        </>
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

// ── El aviso de las ofertas colgadas ──────────────────────────────────────────────────────────

const MOTIVO_COLGADA: Record<MotivoColgada, { label: string; tono: Tone; ayuda: string }> = {
  'fuera-de-alcance': {
    label: 'Fuera de alcance',
    tono: 'danger',
    ayuda: 'El producto ya no está como aplicado en ninguna campaña (se lo sacó, o la campaña se eliminó). El botón «sacar» de la campaña no lo alcanza: hay que sacarle la oferta a mano en Gestión Nube.',
  },
  'campania-cerrada': {
    label: 'Campaña cerrada',
    tono: 'warning',
    ayuda: 'La campaña que le puso este precio ya no está viva, y el precio sigue puesto en la tienda.',
  },
  'vigencia-vencida': {
    label: 'Vigencia vencida',
    tono: 'warning',
    ayuda: 'La campaña terminó según su fecha y el precio sigue puesto en la tienda.',
  },
}

/** Cuántas filas se muestran antes de resumir. Un sale entero sin levantar son cientos. */
const TOPE_COLGADAS_A_LA_VISTA = 8

/**
 * Una oferta escrita en Gestión Nube no vence sola: la saca alguien. Mientras esté puesta, la tienda
 * cobra ese precio — y el que la dejó puesta ya cerró la campaña y no vuelve a mirarla.
 *
 * 🔑 **Las que no tienen stock también se listan.** Es el caso que pidió Bruno: el que se agotó
 * durante el sale y vuelve en septiembre con el precio de agosto puesto. Esconderlas sería esperar a
 * que el problema aparezca en la caja.
 */
function AvisoColgadas({
  colgadas, puedeAplicar, sacando, onSacar, onAbrirCampania,
}: {
  colgadas: Colgadas | null
  puedeAplicar: boolean
  sacando: boolean
  onSacar: () => void
  onAbrirCampania: (liqId: string) => void
}) {
  if (!colgadas || !colgadas.colgadas.length) return null

  const { colgadas: filas, conStock, sinStock } = colgadas
  const sacables = filas.filter((c) => c.seSacaDesdeAca)
  // El botón sale sólo si entra en una llamada. Arriba del tope son decenas de llamadas contra
  // Gestión Nube: eso ya existe adentro de la campaña, con barra de progreso y con la opción de
  // devolverles la oferta previa. Duplicarlo acá sería una segunda máquina de escribir precios.
  const deUnaVez = sacables.length > 0 && sacables.length <= TOPE_APLICAR

  return (
    <Notice tone={conStock > 0 ? 'danger' : 'warning'} style={{ marginBottom: space[4] }}>
      <div style={{ lineHeight: 1.7 }}>
        <b>
          {filas.length === 1
            ? 'Una oferta sigue puesta en la tienda'
            : `${filas.length} ofertas siguen puestas en la tienda`}{' '}
          sin campaña viva que las respalde.
        </b>{' '}
        {conStock > 0 && (
          <>
            <b>{conStock}</b> {conStock === 1 ? 'tiene' : 'tienen'} stock hoy: se{' '}
            {conStock === 1 ? 'está vendiendo' : 'están vendiendo'} a ese precio ahora mismo.{' '}
          </>
        )}
        {sinStock > 0 && (
          <>
            {sinStock === 1 ? 'La otra está agotada' : `Las otras ${sinStock} están agotadas`} y el
            precio les queda puesto para el día que vuelvan con stock.
          </>
        )}
      </div>

      <div style={{ marginTop: space[3], display: 'grid', gap: space[2] }}>
        {filas.slice(0, TOPE_COLGADAS_A_LA_VISTA).map((c) => {
          const m = MOTIVO_COLGADA[c.motivo]
          return (
            <div key={c.pid} style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', fontSize: font.sm }}>
              <b style={{ fontWeight: weight.medium }}>{c.producto || c.pid}</b>
              <span style={{ color: color.mut }}>
                {c.sku || '—'} · a <b>{formatMoney(c.precio)}</b> ·{' '}
                {c.stock > 0 ? `${c.stock} ${c.stock === 1 ? 'unidad' : 'unidades'}` : 'sin stock'}
              </span>
              <span title={m.ayuda}><StatusPill tone={m.tono} label={m.label} /></span>
              {c.seSacaDesdeAca && (
                <Button variant="ghost" size="sm" onClick={() => onAbrirCampania(c.liqId)}>
                  {c.liqNombre || 'la campaña'}
                </Button>
              )}
            </div>
          )
        })}
        {filas.length > TOPE_COLGADAS_A_LA_VISTA && (
          <div style={{ fontSize: font.sm, color: color.mut }}>
            y {filas.length - TOPE_COLGADAS_A_LA_VISTA} más.
          </div>
        )}
      </div>

      <div style={{ marginTop: space[3], display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        {puedeAplicar && deUnaVez && (
          <Button variant="solid" tone="danger" size="sm" onClick={onSacar} loading={sacando}>
            Sacarles la oferta ({sacables.length})
          </Button>
        )}
        <span style={{ fontSize: font.sm, color: color.mut }}>
          {sacables.length === 0
            ? 'Ninguna se puede sacar desde el Monitor: hay que hacerlo en Gestión Nube.'
            : deUnaVez
              ? 'Vuelven a su precio de lista.'
              : `Son ${sacables.length}: se sacan desde la campaña, que muestra el progreso y deja devolverles la oferta que tenían antes.`}
          {sacables.length < filas.length && sacables.length > 0 &&
            ` Las ${filas.length - sacables.length} «fuera de alcance» van a mano en Gestión Nube.`}
        </span>
      </div>
    </Notice>
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
        hint="Una campaña de sale junta los productos que se van a liquidar, con su precio y su fecha. Los productos entran desde Análisis → Por producto, con «Enviar a liquidación»."
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
                <b style={{ fontWeight: weight.semibold }}>{c.nombre}</b> <EtiquetaTipo campania={c} />
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
                  <Button variant="ghost" tone="danger" size="sm" onClick={() => onBorrar(c)}>Eliminar</Button>
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
   * Los dos cortes para revisar de a tandas (pedido de Bruno, 11-sep). Van en la URL como el resto:
   * revisar 351 productos es volver varias veces, y un filtro que se pierde al recargar obliga a
   * rearmar la tanda de cero.
   *
   * 🔑 **`mesa` es el que ⛔ no se podía improvisar**: por tipo alcanzaba con escribir «SWEATER» en
   * el buscador, pero por precio ⛔ no había ninguna forma — y una feria de mesas está armada
   * justamente por precio.
   */
  const [mesa, setMesa] = useFiltroUrl<string>('mesa', '')
  const [prenda, setPrenda] = useFiltroUrl<string>('prenda', '')
  /**
   * Qué producto está abierto en el modal, y en qué orden se recorren.
   *
   * 🔑 **El orden se congela al abrir.** La grilla ordena por estado (primero lo que falta
   * decidir), así que guardar un precio mueve la fila de lugar: si el ←/→ leyera la lista viva, el
   * "siguiente" sería otro producto cada vez que se guarda uno y se terminaría saltando la mitad.
   */
  const [definiendo, setDefiniendo] = useState<{ orden: string[]; i: number } | null>(null)
  /**
   * Las ⭐ de ESTA campaña: cuáles de estos productos son los que se comunican.
   *
   * ⚠️ El alcance es la campaña (`campania.id`), ⛔ no el producto a secas: un básico barato puede
   * ser la estrella de una feria al costo y no serlo nunca más. La ⭐ general vive en Análisis →
   * Por producto, con el mismo botón y `liq = null`. Ver `sql/migrate-destacados.sql`.
   */
  const destacados = useDestacados(marca, campania.id)
  /**
   * La foto que se está mirando en grande. Se guarda el nombre además del `src` porque el
   * lightbox tapa la fila: sin el rótulo no se sabe de cuál de los 351 productos es la foto.
   */
  const [foto, setFoto] = useState<{ src: string | null; nombre: string } | null>(null)
  /**
   * Los productos marcados en la lista, por pid.
   *
   * 🔑 **La selección SOBREVIVE al filtro y a la búsqueda**, igual que la de "Mandar a
   * liquidación": revisar una campaña de 351 es ir juntando de a tandas —los de una familia,
   * después los de otra—, y limpiarla en cada tecla del buscador obligaría a hacerlo de una sola
   * vez. Por eso la barra dice cuántos hay marcados FUERA de lo que se está viendo.
   */
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
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

  // Qué clase de cambio de precio es: manda los rótulos y apaga los avisos que no aplican.
  const tipo = tipoDe(campania)
  const rotulos = TIPO_CAMPANIA[tipo]
  const resumen = useMemo(() => resumenCampania(items || [], tipo), [items, tipo])
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
    // 🔑 La MISMA regla que cuenta las opciones de los selectores (`opcionesDeGrilla`): con dos
    // implementaciones, el número del selector y lo que dibuja la tabla pueden dejar de coincidir.
    return filtrarGrilla(items || [], { estado: filtro, q: busqueda, mesa, prenda })
      // Primero lo que espera una decisión nuestra; dentro de cada grupo, el que tiene más plata
      // parada arriba. Ordenar por nombre pondría a la vista lo que da lo mismo mirar primero.
      .sort((a, b) => {
        // `confirmado` pesa lo mismo que `definido`: para esta grilla los dos son "ya tiene
        // precio", y separarlos mandaría al fondo justo los que un revisor acaba de mirar.
        const peso = (e: EstadoItem) =>
          e === 'pendiente' ? 0 : e === 'definido' || e === 'confirmado' ? 1 : e === 'aplicado' ? 2 : 3
        return peso(a.estado) - peso(b.estado) || b.foto.costo * b.foto.stock - a.foto.costo * a.foto.stock
      })
  }, [items, busqueda, filtro, mesa, prenda])

  /**
   * Las opciones de los dos cortes, **contadas sobre lo que dejan pasar los OTROS filtros**.
   *
   * 🔴 **Un número que no mira el resto miente**: con «Sin revisar» puesto, una mesa que dijera «27»
   * y mostrara 15 manda a buscar doce productos que ⛔ no están. Cada selector se cuenta a sí mismo
   * ignorando **su propia** elección —si no, la lista se quedaría con una sola opción— y respetando
   * las de los demás.
   */
  const opciones = useMemo(
    () => opcionesDeGrilla(items || [], { estado: filtro, q: busqueda, mesa, prenda }),
    [items, busqueda, filtro, mesa, prenda],
  )

  /** Confirmar es de admin, y sólo mientras la campaña se pueda editar — la misma puerta que Revisión. */
  const puedeConfirmar = puede.admin && campaniaEditable(campania.estado)
  /**
   * De lo marcado, lo que **realmente** se puede confirmar: la regla es `itemsSinRevisar` del
   * núcleo, la misma que usa la pestaña Revisión. Marcar un confirmado, un pendiente sin precio o
   * un objetado no rompe nada — simplemente no entra, y la barra lo dice con el número.
   */
  const confirmables = useMemo(
    () => itemsSinRevisar((items || []).filter((i) => marcados.has(i.pid))),
    [items, marcados],
  )
  /** Marcados que el filtro o la búsqueda de ahora NO están mostrando. Va en la barra. */
  const marcadosFuera = useMemo(
    () => marcados.size - visibles.filter((i) => marcados.has(i.pid)).length,
    [marcados, visibles],
  )
  /** Los de la vista de ahora que se podrían confirmar: es lo que marca "Marcar los que se ven". */
  const visiblesConfirmables = useMemo(() => itemsSinRevisar(visibles), [visibles])

  function marcar(pid: string, on: boolean) {
    setMarcados((s) => {
      const n = new Set(s)
      if (on) n.add(pid)
      else n.delete(pid)
      return n
    })
  }

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
      if (!seguir) return void toast.ok(item.decision.precioSale ? 'Precio guardado.' : 'Precio eliminado.')
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
      toast.error(e instanceof Error ? e.message : 'No se pudo sacar.')
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
   * Confirmar muchos precios de una — el mismo motor para los dos caminos que llevan acá.
   *
   * 🔑 **El cartel dice cuántos tienen un aviso ALTO**, que es lo único que la revisión de a uno
   * hubiera cazado y esto se saltea. El 13-ago-2026 se confirmaron 260 con un script y quedaron
   * adentro 7 con el precio de sale por debajo del costo: sin ese número, «confirmar todos» parece
   * gratis.
   *
   * 🔑 **Uno solo, y no una copia por pantalla.** Entran por «Confirmar los que faltan» (pestaña
   * Revisión) y por «Confirmar los marcados» (lista de Productos); lo único que cambia es de dónde
   * salió la lista, y eso es una frase del cartel, no otra función. `comoSeEligieron` existe para
   * que el cartel no mienta sobre lo que se está por confirmar.
   */
  async function confirmarEnMasa(lista: LiquidacionItem[], comoSeEligieron: string) {
    if (!lista.length) {
      toast.error('No hay precios para confirmar.')
      return
    }
    const conAvisoAlto = lista.filter((i) => avisos(i, tipo).some((a) => a.nivel === 'alto'))
    const ok = await confirmar({
      titulo: lista.length === 1
        ? 'Confirmar 1 precio sin mirarlo de a uno'
        : `Confirmar ${lista.length} precios sin mirarlos de a uno`,
      mensaje: `${comoSeEligieron} ${conAvisoAlto.length
        ? `De los ${lista.length}, hay ${conAvisoAlto.length} con un aviso importante sin resolver (precio abajo del costo, costo que no vino de Gestión Nube o sin precio de lista): ${conAvisoAlto.slice(0, 4).map((i) => i.foto.nombre).join(', ')}${conAvisoAlto.length > 4 ? '…' : ''}. Confirmándolos en masa, nadie los va a mirar.`
        : 'Quedan listos para escribirse en Gestión Nube sin que nadie los haya mirado de a uno.'}`,
      ok: `Confirmar los ${lista.length}`,
      tono: conAvisoAlto.length ? 'danger' : 'brand',
    })
    if (!ok) return
    setOcupadoMasivo(true)
    try {
      for (let i = 0; i < lista.length; i += TOPE_MASIVO) {
        await Promise.all(lista.slice(i, i + TOPE_MASIVO).map((it) => revisarItem(marca, campania.id, confirmarItem(it, yo))))
      }
      await cargar()
      onCambio()
      setMarcados(new Set())
      toast.ok(lista.length === 1 ? '1 confirmado.' : `${lista.length} confirmados.`)
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

  /**
   * Los precios de una feria: una escalera de precios redondos y cada producto a la mesa que le
   * cubre el costo.
   *
   * 🔑 **No es «otro precio para todos» con otro número.** Ahí el precio sale de un % sobre la
   * lista y cada prenda termina distinta; acá el precio lo fija la MESA, que es lo que dice el
   * cartel. La regla vive en `porEscalera`; esto sólo pregunta, muestra y guarda.
   *
   * 🔑 **Los que quedan afuera se NOMBRAN.** Sin costo, o más caros que el último escalón: la
   * pantalla no les inventa una mesa — se definen a mano, que es donde se ve el margen.
   */
  async function preciosDeMesa() {
    const txt = window.prompt(
      'Los precios de las mesas, separados por coma. Cada producto va a la primera mesa que le cubre el costo.',
      MESAS_SUGERIDAS,
    )
    if (txt == null) return
    const escalera = leerEscalera(txt)
    if (!escalera) {
      toast.error('Poné los precios separados por coma, por ejemplo: 5900, 9900, 14900.')
      return
    }
    const { cambiados, yaEstaban, afuera } = porEscalera(items || [], escalera, yo)
    if (!cambiados.length) {
      toast.error(yaEstaban.length ? 'Ya estaban todos en su mesa.' : 'Ningún producto entra en esas mesas.')
      return
    }
    // El reparto va con la cuenta por mesa: «se cambian 381 precios» no deja ver que la mesa de
    // $5.900 se lleva 2.622 prendas y la de $29.900 seis.
    const porMesa = escalera
      .map((e) => ({ e, n: cambiados.filter((i) => i.decision.precioSale === e).length }))
      .filter((x) => x.n > 0)
      .map((x) => `$${x.e.toLocaleString('es-AR')}: ${x.n}`)
      .join(' · ')
    const sobran = afuera.length
      ? ` Quedan afuera ${afuera.length}: ${afuera.slice(0, 3).map((a) => `${a.nombre} (${a.motivo === 'sin-costo' ? 'sin costo' : `costo $${Math.round(a.costo).toLocaleString('es-AR')}`})`).join(' · ')}${afuera.length > 3 ? ' y otros' : ''}. Esos se definen a mano.`
      : ''
    const ok = await confirmar({
      titulo: `Repartir ${cambiados.length} ${cambiados.length === 1 ? 'producto' : 'productos'} en ${porMesa.split(' · ').length} mesas`,
      mensaje: `${porMesa}.${yaEstaban.length ? ` Otros ${yaEstaban.length} ya estaban en su mesa y no se tocan.` : ''}${sobran} Quedan para revisar y después hay que escribirlos en Gestión Nube: esto todavía no toca la tienda.`,
      ok: `Poner ${cambiados.length} precios`,
      tono: 'brand',
    })
    if (!ok) return
    setOcupadoMasivo(true)
    try {
      for (let i = 0; i < cambiados.length; i += TOPE_MASIVO) {
        await decidirMasivo(marca, campania.id, cambiados.slice(i, i + TOPE_MASIVO))
      }
      await cargar()
      onCambio()
      toast.ok(`${cambiados.length} precios de mesa puestos.${afuera.length ? ` ${afuera.length} sin mesa, a definir a mano.` : ''}`)
    } catch (e) {
      await cargar()
      toast.error(e instanceof Error ? e.message : 'No se pudieron poner los precios.')
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

  /**
   * Abre (o cierra) la lista de precios de esta campaña para Marketing (sección «Precios de
   * campaña»).
   *
   * 🔑 **Es un interruptor y ⛔ no se deriva del estado**: la Feria de Septiembre arranca el lunes
   * con los precios decididos y **sin publicar en la tienda**, y Marketing tiene que armar las
   * piezas antes. Del otro lado ⛔ no viaja el costo: ver `lib/precios/core.core.js`.
   */
  async function compartir(valor: boolean) {
    try {
      await compartirCampania(marca, campania.id, valor)
      onCambio()
      toast.ok(valor
        ? 'Marketing ya ve la lista de precios de esta campaña, en «Precios de campaña».'
        : 'Marketing dejó de ver la lista de precios de esta campaña.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar con quién se comparte.')
    }
  }

  const rot = ROTULO_CAMPANIA[campania.estado] || ROTULO_CAMPANIA.borrador

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <Button variant="ghost" size="sm" onClick={onVolver}>← Campañas</Button>
        <h2 style={{ margin: 0, fontSize: font.xl, fontWeight: weight.semibold }}>{campania.nombre}</h2>
        <StatusPill tone={rot.tono} label={rot.label} />
        <EtiquetaTipo campania={campania} />
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
          {campaniaEditable(campania.estado) && puedeVer(perfil, marca, 'productos') && (
            <Button variant="ghost" size="sm" onClick={() => router.push(`/productos?liq=${encodeURIComponent(campania.id)}`)}>
              Agregar productos
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onEditar}>Editar</Button>
          {/*
            🔴 **Compartir con Marketing es de ADMIN, y por eso el botón cuelga de `puede.admin`.**
            Abre la campaña a un área que ⛔ no tiene permiso de Liquidación justamente porque acá
            adentro está el costo. Lo que Marketing ve del otro lado pasa por una lista blanca
            —foto, lista, precio, % off, stock— pero **quién abre la puerta** es otra pregunta.

            ⛔ Y una campaña `cerrada` no se ofrece: sus precios ya no rigen, y dejarla visible es la
            misma clase de mentira que la oferta colgada (la regla también está del lado del
            servidor, en `compartidaConMarketing`).
          */}
          {puede.admin && campaniaEditable(campania.estado) && (
            <Button
              variant={campania.compartida ? 'soft' : 'ghost'}
              tone={campania.compartida ? 'success' : 'neutral'}
              size="sm"
              title={campania.compartida
                ? `Marketing ve esta lista de precios en «Precios de campaña»${campania.compartidaPor ? `. La compartió ${campania.compartidaPor}` : ''}. Sin costo ni margen.`
                : 'Deja que Marketing vea a qué precio va cada producto, sin costo ni margen, antes de que los precios estén en la tienda.'}
              onClick={() => void compartir(!campania.compartida)}
            >
              {campania.compartida ? '✓ La ve Marketing' : 'Compartir con Marketing'}
            </Button>
          )}
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
          {campaniaEditable(campania.estado) && puede.aplicar && (
            <Button variant="ghost" size="sm" disabled={ocupadoMasivo || !!aplicando} onClick={() => void preciosDeMesa()}>
              Precios de mesa
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
          value={PESTANIAS_PROPIAS.includes(pestania) ? pestania : 'productos'}
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
            {
              key: 'bitacora',
              label: 'Actividad',
              // ⛔ **Sin badge, a propósito.** Los otros dos cuentan pendientes —algo que hacer—; acá
              // el número sólo crecería, y un contador que nunca baja se deja de mirar a la semana.
              hint: 'Qué precio se escribió en Gestión Nube y cuál se sacó, con quién y cuándo',
            },
          ]}
        />
      )}

      {items !== null && pestania === 'resultado' && (
        <Resultado campania={campania} items={items} puedeSincronizar={puede.admin} />
      )}

      {items !== null && pestania === 'bitacora' && (
        <Bitacora liqId={campania.id} marca={marca} items={items} />
      )}

      {items !== null && pestania === 'revision' && (
        <Revision
          items={items}
          tipo={tipo}
          puedeRevisar={puede.admin && campaniaEditable(campania.estado)}
          ingresoDe={ingresoDe}
          onRevisar={guardarRevision}
          onConfirmarTodos={(sinRevisar) => confirmarEnMasa(sinRevisar, 'Son los que todavía no pasaron por revisión.')}
        />
      )}

      {items !== null && !PESTANIAS_PROPIAS.includes(pestania) && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[3], marginBottom: space[4] }}>
            <KpiCard label="Productos" value={String(resumen.total)} sub={resumen.pendientes ? `${resumen.pendientes} sin definir` : 'todos definidos'} />
            <KpiCard label="Plata parada" value={formatMoney(resumen.plataInmovilizada)} sub="costo del stock que se quiere mover" />
            <KpiCard label={rotulos.promedio} value={pct(resumen.descPromedio)} sub="ponderado por stock" />
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
            {/*
              🔑 **Los dos cortes para revisar de a tandas** (Bruno, 11-sep-2026). Van acá y ⛔ no en
              la pestaña Revisión porque **es acá donde se elige QUÉ se confirma**: la barra de
              marcados y «Marcar los N que se ven» trabajan sobre lo que este filtro deja a la
              vista, así que filtrar una mesa y confirmarla entera ya es una tanda.

              ⛔ **Sólo se dibujan si hay más de uno**: un selector con una sola opción ⛔ no filtra
              nada y ocupa el mismo lugar que algo que sí sirve.
            */}
            {opciones.mesas.length > 1 && (
              <Select value={mesa} onChange={(e) => setMesa(e.target.value)} style={{ width: 180 }} aria-label="Precio de mesa">
                <option value="">Todos los precios</option>
                {opciones.mesas.map((m) => (
                  <option key={m.precio} value={String(m.precio)}>{formatMoney(m.precio)} ({m.n})</option>
                ))}
              </Select>
            )}
            {opciones.prendas.length > 1 && (
              <Select value={prenda} onChange={(e) => setPrenda(e.target.value)} style={{ width: 180 }} aria-label="Tipo de prenda">
                <option value="">Todas las prendas</option>
                {opciones.prendas.map((t) => (
                  <option key={t.tipo} value={t.tipo}>{t.tipo} ({t.n})</option>
                ))}
              </Select>
            )}
            {/*
              El atajo que hace útil a la selección: filtrar «Definidos», buscar «CORPIÑO» y marcar
              de una todo lo que quedó a la vista. Sin esto, confirmar 351 sigue siendo 351 clics.
              🔑 Sólo marca los CONFIRMABLES de la vista, no todo lo que se ve: marcar un confirmado
              o un descartado infla el contador con productos que después no van a entrar.
            */}
            {puedeConfirmar && visiblesConfirmables.length > 0 && (
              <Button size="sm" variant="soft" tone="brand" onClick={() => setMarcados((m) => new Set([...m, ...visiblesConfirmables.map((i) => i.pid)]))}>
                Marcar los {visiblesConfirmables.length} que se ven
              </Button>
            )}
          </FilterBar>

          {/*
            🔑 **La barra de marcados sólo aparece cuando hay algo marcado**, y dice tres cosas que
            de otro modo el que confirma no puede saber: cuántos marcó, cuántos de esos se pueden
            confirmar de verdad, y cuántos quedaron marcados FUERA del filtro que está mirando.
            Sin ese último número, achicar la búsqueda y apretar "Confirmar los marcados" confirma
            productos que no están en pantalla.
          */}
          {marcados.size > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
                marginBottom: space[3], padding: '8px 12px',
                background: color.brandBg, border: `1px solid ${color.brandBorder}`,
                borderRadius: radius.lg, fontSize: font.base, color: color.brand,
              }}
            >
              <span>
                <b>{marcados.size}</b> {marcados.size === 1 ? 'producto marcado' : 'productos marcados'}
                {confirmables.length !== marcados.size && (
                  <span style={{ opacity: 0.8 }}>
                    {' '}· {confirmables.length === 0
                      ? 'ninguno se puede confirmar (ya confirmados, sin precio, descartados u objetados)'
                      : `${confirmables.length} para confirmar; el resto ya está confirmado, sin precio, descartado u objetado`}
                  </span>
                )}
                {marcadosFuera > 0 && <span style={{ opacity: 0.8 }}> · {marcadosFuera} fuera de este filtro</span>}
              </span>
              {puedeConfirmar && (
                <Button
                  size="sm"
                  variant="solid"
                  tone="brand"
                  loading={ocupadoMasivo}
                  disabled={!confirmables.length}
                  onClick={() => void confirmarEnMasa(confirmables, 'Son los que marcaste en la lista.')}
                >
                  Confirmar {confirmables.length} {confirmables.length === 1 ? 'precio' : 'precios'}
                </Button>
              )}
              <Button size="sm" variant="ghost" tone="brand" onClick={() => setMarcados(new Set())} style={{ marginLeft: 'auto' }}>
                Limpiar selección
              </Button>
            </div>
          )}

          {!visibles.length ? (
            <EmptyState
              title={items.length ? 'Ningún producto con ese filtro' : 'La campaña está vacía'}
              hint={
                items.length
                  ? 'Probá con otro estado o limpiá la búsqueda.'
                  : 'Los productos entran desde Análisis → Por producto: tildalos y usá «Enviar a liquidación».'
              }
            />
          ) : (
            <TableWrap>
              <THead>
                <Tr>
                  {puedeConfirmar && <Th width={34} />}
                  <Th width={40} />
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
                    tipo={tipo}
                    puedeMover={campaniaEditable(campania.estado)}
                    onDefinir={() => setDefiniendo({ orden: visibles.map((v) => v.pid), i: n })}
                    onFoto={() => setFoto({ src: i.foto.imagen, nombre: i.foto.nombre })}
                    marcable={puedeConfirmar}
                    marcado={marcados.has(i.pid)}
                    onMarcar={(on) => marcar(i.pid, on)}
                    estrella={destacados.porProducto.get(i.pid) || null}
                    onEstrella={() => destacados.alternar({ id: i.pid, nombre: i.foto.nombre, sku: i.foto.sku })}
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
          tipo={tipo}
          posicion={definiendo.i + 1}
          total={definiendo.orden.length}
          puedeEditar={campaniaEditable(campania.estado)}
          onAnterior={definiendo.i > 0 ? () => irAlIndice(definiendo.i - 1) : null}
          onSiguiente={definiendo.i < definiendo.orden.length - 1 ? () => irAlIndice(definiendo.i + 1) : null}
          onGuardar={guardarDecision}
          onEstado={(estado) => estadoDesdeModal(enModal, estado)}
          onCerrar={() => setDefiniendo(null)}
        />
      )}

      <Lightbox src={foto?.src || null} alt={foto?.nombre || ''} onCerrar={() => setFoto(null)} />
    </>
  )
}

function FilaItem({
  item, tipo, puedeMover, onDefinir, onDescartar, onVolver, onQuitar, onFoto, marcable, marcado,
  onMarcar, estrella, onEstrella,
}: {
  item: LiquidacionItem
  tipo: TipoCampania
  puedeMover: boolean
  onDefinir: () => void
  onDescartar: () => void
  onVolver: () => void
  onQuitar: () => void
  onFoto: () => void
  marcable: boolean
  marcado: boolean
  onMarcar: (on: boolean) => void
  /** La ⭐ de ESTA campaña. `null` = no está destacado. Ver `sql/migrate-destacados.sql`. */
  estrella: Parameters<typeof Estrella>[0]['marcado']
  onEstrella: () => Promise<void>
}) {
  const rot = ROTULO_ITEM[item.estado] || ROTULO_ITEM.pendiente
  const problemas = avisos(item, tipo).filter((a) => a.nivel === 'alto')
  const apagado = item.estado === 'descartado'

  return (
    <Tr onClick={onDefinir} style={apagado ? { opacity: 0.55 } : undefined}>
      {/*
        El tilde vive DENTRO de la fila que ya abre "Definir", así que el `stopPropagation` va en el
        contenedor y no sólo en el input: sin él, tildar abría el modal encima de la lista.
      */}
      {marcable && (
        <Td style={{ width: 34 }} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={marcado}
            onChange={(e) => onMarcar(e.target.checked)}
            aria-label={`Marcar ${item.foto.nombre}`}
            style={{ accentColor: 'var(--mo-brand-solid)', display: 'block', cursor: 'pointer' }}
          />
        </Td>
      )}
      {/*
        La ⭐ de la campaña: cuál de estos productos es el que se comunica. Va acá y ⛔ no sólo en la
        pantalla de Marketing porque **el momento de decidirlo es éste**: quien está barriendo los
        351 precios es quien sabe cuál es la oferta que vale contar. Es la misma lección de
        Faltantes que ya está escrita en `useClavados.ts` — una lista nueva no existe hasta que
        entra donde se toma el trabajo.
      */}
      <Td style={{ width: 40 }}>
        <Estrella marcado={estrella} nombre={item.foto.nombre} onAlternar={onEstrella} titulo="de esta campaña" />
      </Td>
      <Td style={{ width: 48 }}>
        {/*
          🔑 **La miniatura abre la FOTO, no la fila.** A 36 px no se ve si el corte es el que uno
          cree, y el único camino para mirarla era entrar a "Definir" producto por producto: son
          351 en la feria de Zattia. Es el mismo problema que ya estaba escrito en `GenDesc`
          ("la miniatura del encabezado no sirve: 44×55 px y su clic abre la fila").
          El `stopPropagation` es lo que separa los dos gestos: sin él la `<Tr>` de arriba abre el
          modal detrás del lightbox.
        */}
        {item.foto.imagen ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFoto() }}
            title="Ver la foto en grande"
            style={{
              padding: 0, border: 'none', background: 'none', display: 'block',
              cursor: 'zoom-in', lineHeight: 0, borderRadius: radius.sm, overflow: 'hidden',
              width: 36, height: 36,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.foto.imagen}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </button>
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

/**
 * Qué clase de cambio de precio es esta campaña.
 *
 * 🔑 **Sale sólo cuando NO es una liquidación.** Adentro de la sección Liquidación, una etiqueta que
 * dice «Liquidación» en todas las filas es ruido; la que importa es la que avisa que ésta **no** lo
 * es —una promo puntual o un ajuste que puede subir el precio—, y eso se lee mejor si aparece poco.
 */
function EtiquetaTipo({ campania }: { campania: Campania }) {
  const t = tipoDe(campania)
  if (t === 'liquidacion') return null
  // El `title` va en un span: `Badge` no acepta atributos sueltos.
  return <span title={TIPO_CAMPANIA[t].ayuda}><Badge tone="neutral">{TIPO_CAMPANIA[t].nombre}</Badge></span>
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
  onGuardar: (d: { nombre: string; nombreComercial: string | null; etiqueta: EtiquetaCampania; tipo: TipoCampania; desde: string | null; hasta: string | null; nota: string | null }) => Promise<void>
}) {
  const esNueva = editando === 'nueva'
  const previa = editando === 'nueva' ? null : editando

  const [nombre, setNombre] = useState(previa?.nombre || '')
  const [nombreComercial, setNombreComercial] = useState(previa?.nombreComercial || '')
  const [eti, setEti] = useState<EtiquetaCampania>(() => etiquetaDeCampania(previa?.etiqueta))
  const [tipo, setTipo] = useState<TipoCampania>(tipoDe(previa))
  const [desde, setDesde] = useState(previa?.desde || '')
  const [hasta, setHasta] = useState(previa?.hasta || '')
  const [nota, setNota] = useState(previa?.nota || '')
  const [guardando, setGuardando] = useState(false)

  const malLasFechas = !!desde && !!hasta && hasta < desde

  async function guardar() {
    if (!nombre.trim() || malLasFechas || guardando) return
    setGuardando(true)
    try {
      await onGuardar({ nombre: nombre.trim(), nombreComercial: nombreComercial.trim() || null, etiqueta: eti, tipo, desde: desde || null, hasta: hasta || null, nota: nota.trim() || null })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={esNueva ? 'Nueva campaña' : 'Editar campaña'}
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
      {/* 🔑 **El nombre de arriba es el INTERNO y éste es el que se IMPRIME.** Van separados porque
          tienen dos trabajos distintos: uno identifica la campaña dentro de seis meses y el otro
          tiene que entrar en una etiqueta de 5 cm. ⛔ Vacío es válido: la etiqueta sale sólo con el
          precio. Y vive en la campaña, ⛔ no en cada máquina: va impreso en miles de etiquetas y
          tiene que ser uno solo. */}
      <Field label="Nombre comercial" hint="Opcional. El que sale IMPRESO en la etiqueta, arriba del precio: «FERIA ZATTIA». Vacío = sólo el precio.">
        <Input value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} placeholder="FERIA ZATTIA" maxLength={40} />
      </Field>
      <Field label="Qué es" hint={TIPO_CAMPANIA[tipo].ayuda}>
        <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCampania)}>
          {TIPOS_CAMPANIA.map((t) => <option key={t} value={t}>{TIPO_CAMPANIA[t].nombre}</option>)}
        </Select>
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

      {/* ── La etiqueta de la campaña ────────────────────────────────────────────────────────────
          Idea de Bruno (11-sep-2026): *«no estaría mal pensar en que la edición de la etiqueta esté
          en la campaña con las condiciones del evento»*.

          🔴 **Es el lugar correcto porque las condiciones son del EVENTO, ⛔ no de la máquina que
          imprime.** Va en ~1.800 etiquetas y tiene que ser una sola: guardado en cada computadora,
          dos personas etiquetando desde dos lugares cuelgan carteles distintos y ⛔ nadie se entera
          hasta que las prendas están en la mesa.

          🔑 **La previa es el PDF de verdad**, con el mismo llamado que la impresión. */}
      <div style={{ borderTop: `1px solid ${color.line}`, margin: `${space[4]}px 0 ${space[3]}px` }} />
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>🏷️ La etiqueta de esta campaña</div>
      <div style={{ fontSize: 12, color: color.mut2, marginBottom: space[3] }}>
        Lo que sale impreso en la prenda, en 5 × 2,5 cm. El precio lo pone cada producto; acá se decide el resto.
      </div>

      <Field label="Nombre comercial" hint="Opcional. Sale IMPRESO arriba del precio: «FERIA ZATTIA». Vacío = sólo el precio.">
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <Input value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} placeholder="FERIA ZATTIA" maxLength={40} />
          <Select value={eti.tamTitulo} onChange={(e) => setEti({ ...eti, tamTitulo: e.target.value as EtiquetaCampania['tamTitulo'] })} style={{ width: 120 }}>
            {TAMANIOS.map(([val, t]) => <option key={val} value={val}>{t}</option>)}
          </Select>
        </div>
      </Field>

      <Field label="Debajo del precio" hint={`Las condiciones del evento: «EFECTIVO · TRANSFERENCIA». Hasta ${MAX_LINEAS_ABAJO} renglones.`}>
        <EditorLineas
          lineas={eti.abajo}
          setLineas={(abajo) => setEti({ ...eti, abajo })}
          placeholder="Renglón"
          max={MAX_LINEAS_ABAJO}
          maxLargo={MAX_TEXTO_LINEA}
        />
      </Field>

      <div style={{ display: 'flex', gap: space[4], alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Tamaño del precio" hint={`En puntos. El de siempre es ${TAM_PRECIO_DEFAULT}.`}>
          <Input
            type="number"
            min={TAM_PRECIO_MIN}
            max={TAM_PRECIO_MAX}
            value={String(eti.tamPrecio)}
            onChange={(e) => setEti({ ...eti, tamPrecio: Number(e.target.value) || TAM_PRECIO_DEFAULT })}
            style={{ width: 110 }}
          />
        </Field>
        <div>
          <div style={{ fontSize: 12, color: color.mut, marginBottom: 6 }}>Así sale</div>
          <PreviaEtiquetaCampania titulo={nombreComercial} eti={eti} />
        </div>
      </div>
      {/* ⚠️ El freno del alto ⛔ NO es una cuenta: es esto. Con el título, un precio grande y tres
          renglones abajo el conjunto se pasa de los 25 mm y sale cortado — y se ve acá. */}
    </Modal>
  )
}

/** Se exporta para el selector de campaña de Análisis, que necesita los mismos rótulos. */
export { ROTULO_CAMPANIA, contar }

/**
 * LA PREVIA DE LA ETIQUETA DE LA CAMPAÑA.
 *
 * 🔑 **Dibuja el PDF de verdad** —el mismo `buildLibrePdf` que imprime Etiquetas— y ⛔ no un HTML
 * parecido. Es el mismo criterio que `PreviaPdf` en Etiquetas: una previa armada aparte se ve linda
 * y miente el día que alguien toca una de las dos.
 *
 * 📌 El precio es de muestra: la campaña ⛔ no tiene uno, lo pone cada producto. Se dibuja un valor
 * fijo para que el tamaño se pueda juzgar.
 */
function PreviaEtiquetaCampania({ titulo, eti }: { titulo: string; eti: EtiquetaCampania }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    let anterior: string | null = null
    // Con espera: el título se escribe letra por letra y sin esto se arma un PDF por tecla.
    const t = setTimeout(() => {
      void (async () => {
        const pdf = await buildLibrePdf({
          grande: false,
          copias: 1,
          barcode: '',
          precio: 8990,
          lineas: [{ texto: titulo.trim(), tam: eti.tamTitulo, bold: true }],
          lineasAbajo: eti.abajo,
          tamPrecio: eti.tamPrecio,
        })
        if (!vivo || !pdf) return
        anterior = pdf.output('bloburl') as string
        setUrl(anterior)
      })()
    }, 300)
    return () => {
      vivo = false
      clearTimeout(t)
      if (anterior) URL.revokeObjectURL(anterior)
    }
  }, [titulo, eti])

  const caja = { width: 200, height: 100 }
  return url ? (
    <iframe src={url} title="Vista previa de la etiqueta de la campaña" style={{ ...caja, border: `1px solid ${color.line2}`, borderRadius: 6, background: '#fff' }} />
  ) : (
    <div style={{ ...caja, border: `1px dashed ${color.line2}`, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 12, color: color.mut2 }}>
      Dibujando…
    </div>
  )
}
