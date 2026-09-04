'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { SelectorLinea } from '@/components/ui'
import type { DatosETL } from '@/lib/etl/tipos'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { useSesionFotos } from './useSesionFotos'
import { FichaModelo } from './FichaModelo'
import { Eventos } from './Eventos'
import { useEventosSesion } from './useEventosSesion'
import { conBanco, type SesionEvento } from '@/lib/sesionfotos/evento'
import { marcarPedidos, pedidoDesdeBanco } from '@/lib/sesionfotos/banco'
import { type HistorialSolicitudes, type ResultadoCrearGen } from '@/components/solicitudes/useHistorialSolicitudes'
import { origenesDe } from '@/lib/inicio/core'
import { veTodo } from '@/lib/solicitudes/overview'
import { AYUDA_DESTINO, DESTINO_DEFAULT, MOTIVO_DEFAULT, motivosDe, necesitaAprobacion, PRESET_FOTOS, type PresetSolicitud } from '@/components/solicitudes/preset'
import type { TipoSol } from '@/lib/sesionfotos/tipos'
import { credencialConPrompt, type Credencial } from '@/lib/sesion'
import { agregarCombinada, faseCompletaCombi, type ItemCombinado } from '@/lib/sesionfotos/combinada'
import {
  ajustarManualSol,
  construirMapaBc,
  escanearCombi,
  escanearSol,
  type ResultadoCombi,
  type ResultadoEscaneo,
} from '@/lib/sesionfotos/escaneo'
import {
  etiquetaBolsa,
  etiquetasBolsas,
  reporteBolsasPDF,
  reporteFaltantesPDF,
  reportePDF,
  textoAvisoSolicitud,
  textoReporteFaltantes,
} from '@/lib/sesionfotos/pdf'
import {
  agregarManual,
  buscarProductos,
  draftVacio,
  expandirProductos,
  tildarVariantes,
  vidsAusentes,
  escanearDraft,
  procesarDraft,
  quitarManual,
  quitarPendiente,
  quitarProd,
  setManualQty,
  setVarQty,
  toggleVar,
  totalDraft,
  traerProducto,
  traerVariante,
  type Draft as DraftT,
  type ResultadoDraftScan,
} from '@/lib/sesionfotos/draft'
import type { Producto, Variante } from '@/lib/etl/tipos'
import {
  agregarItemSol,
  asignarBolsa,
  bloqueoBorrado,
  bloqueoEdicion,
  bolsasDe,
  cambiarCantidadSol,
  conZona,
  contarBolsas,
  contarCerradas,
  maxBolsa,
  esperadoEn,
  faltantes,
  filaHistorial,
  historialVisible,
  itemDeVariante,
  origenesConItems,
  retiradoDe,
  salio,
  salioSinEscanear,
  sinItemSol,
  sinSolicitud,
} from '@/lib/sesionfotos/core'
import { MOTIVOS_CAMBIO } from '@/lib/sesionfotos/tipos'
import {
  ROTULO_ZONA,
  alertasDe,
  aplicaOutfits,
  sinZona,
  zonasDe,
  type ZonaPrenda,
} from '@/lib/sesionfotos/outfits'
import { DISPARADOR_AYUDA, DISPARADOR_LABEL, DISPARADORES, type Disparador, esDisparador } from '@/lib/solicitudes/disparador'
import {
  conRespuestaFoto,
  contestarElResto,
  fotografiables,
  hayQuePreguntar,
  MOTIVOS_SIN_FOTO,
  respuestaFoto,
  resumenFotos,
} from '@/lib/sesionfotos/fotografiado'
import { talleNormalizado } from '@/lib/sesionfotos/modelo'
import type { EstadoSolicitud, Fase, ItemSolicitud, Origen, Solicitud } from '@/lib/sesionfotos/tipos'
import { puedePedir, puedeRetirar } from '@/lib/solicitudes/overview'
import { imprimirTicket80 } from '@/lib/sesionfotos/ticket'
import { tomarAltaSolicitud, tomarPuenteFotos, tomarVerSolicitud, type AltaSolicitud, type SeleccionFotos } from '@/lib/sesionfotos/puente'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { Badge, Button, Icono, color, useConfirmar, useToast } from '@/components/ui'

/** Una mutación pura de la lista de solicitudes; se aplica optimista y con merge. */
type Persistir = (mutar: (l: Solicitud[]) => Solicitud[]) => Promise<boolean>
type CrearVentasDe = (s: Solicitud, cred: Credencial) => Promise<ResultadoCrearGen>

const DISABLED_TITLE = 'Disponible al completar la migración de Sesión de fotos'

/**
 * Sesión de fotos **por línea** (22-ago-2026). Es la única de las operativas que lleva selector, y
 * la razón no es mirar: es que la solicitud de Stunned **va a otro lado**. Sus filas viven aparte
 * (`store='stunned'`) porque el ciclo termina subiendo la foto a la Tienda Nube de Stunned, que es
 * otra tienda con otro token — mientras que Exhibición, Etiquetas o Liquidación son el trabajo del
 * local sobre la mercadería, que es una sola y no se parte (`docs/lineas.md`).
 *
 * ⚠️ **El catálogo se corta con la línea, y eso es a propósito**: con las dos mezcladas se podría
 * meter una prenda de Zattia en una solicitud de Stunned, cuyas fotos van a la otra tienda. El
 * precio es que una sesión que fotografía las dos líneas son **dos solicitudes**.
 */
export function SesionFotos() {
  const { datos, linea, setLinea, lineas } = useDatosMonitor({ porLinea: true })
  const sf = useSesionFotos(linea)
  // 🔑 El cajón de EVENTOS lo monta SÓLO esta entrada: Solicitudes internas comparte el motor de
  // UI de abajo y ⛔ no le pasa nada, así que no le aparece el bloque. Es la objeción que Bruno
  // levantó él mismo — «el motor es de administración, habría que ver si no hay problema» —, y la
  // salida es ENVOLVER, ⛔ no reemplazar.
  const ev = useEventosSesion(linea)
  return (
    <SolicitudesInner
      sf={sf}
      eventos={ev}
      preset={PRESET_FOTOS}
      datos={datos}
      clave={linea}
      selector={<SelectorLinea linea={linea} lineas={lineas} onChange={setLinea} />}
    />
  )
}

/**
 * El motor de UI compartido por Sesión de fotos y Solicitudes internas (convergencia
 * Fase B): recibe el hook ya llamado (por eso las dos entradas usan su propio hook sin
 * romper las reglas de hooks) + el `preset` que las distingue. Fotos = preset default;
 * internas pasa PRESET_INTERNAS.
 *
 * 🔑 **`datos` lo pasa el llamador, no lo pide este componente.** Cada entrada decide si el ETL
 * viene cortado por línea (fotos) o entero (internas): pedirlo acá con un flag obligaría a
 * `useDatosMonitor` a computar la misma partición dos veces, una por cada hook montado.
 */
export function SolicitudesInner({
  sf,
  eventos,
  preset,
  datos,
  clave,
  selector,
}: {
  sf: HistorialSolicitudes<Solicitud>
  /**
   * El cajón de sesiones (eventos). Lo manda **sólo Sesión de fotos**; ausente en Solicitudes
   * internas, y ahí el bloque ⛔ no se dibuja.
   */
  eventos?: HistorialSolicitudes<SesionEvento>
  preset: PresetSolicitud
  /** El ETL de la línea (fotos) o de la marca entera (internas). `null` mientras carga. */
  datos: DatosETL | null
  /** Qué remonta el contenido: la línea en fotos, la marca en internas. */
  clave: string
  /** El selector de línea, dibujado arriba de todo. Sólo lo manda Sesión de fotos. */
  selector?: React.ReactNode
}) {
  // allVariantes del ETL → mapa código-de-barras → vid para el escaneo. Se baja en
  // paralelo con el historial; hasta que esté, el escaneo va deshabilitado.
  const mapaBc = useMemo(() => construirMapaBc(datos?.allVariantes ?? []), [datos])
  const catalogoListo = !!datos

  if (sf.error && !sf.data) {
    return (
      <div style={{ padding: 16, color: color.dangerInk, fontSize: 13 }}>
        {selector}
        No se pudo leer el historial de {preset.etiqueta}: {sf.error}
      </div>
    )
  }
  if (!sf.data)
    return (
      <div style={{ padding: 16, color: color.mut2 }}>
        {selector}
        Cargando…
      </div>
    )

  // key={clave}: al cambiar de cuenta —o de línea— el estado de UI (qué solicitud se ve, la
  // selección) se resetea remontando, sin setState en effects.
  return (
    <>
      {selector}
      <Contenido
        key={clave}
        preset={preset}
        data={sf.data}
        eventos={eventos}
        prioridad={sf.prioridad}
        persistir={sf.persistir}
        crearVentasDe={sf.crearVentasDe}
        cerrarAnuladas={sf.cerrarAnuladas}
        mapaBc={mapaBc}
        catalogoListo={catalogoListo}
        variantes={datos?.allVariantes ?? []}
        productos={datos?.allProductos ?? []}
        huerfanas={datos?.allVariantesHuerfanas ?? []}
        linea={clave}
      />
    </>
  )
}

function Contenido({
  preset,
  data,
  eventos,
  prioridad,
  persistir,
  crearVentasDe,
  cerrarAnuladas,
  mapaBc,
  catalogoListo,
  variantes,
  productos,
  huerfanas,
  linea,
}: {
  preset: PresetSolicitud
  data: Solicitud[]
  /** Sólo en Sesión de fotos. Ver `SolicitudesInner`. */
  eventos?: HistorialSolicitudes<SesionEvento>
  prioridad: Origen
  persistir: Persistir
  crearVentasDe: CrearVentasDe
  cerrarAnuladas: () => Promise<number>
  mapaBc: Record<string, string>
  catalogoListo: boolean
  variantes: Variante[]
  productos: Producto[]
  /**
   * Las variantes cuyo producto todavía ⛔ no está en Gestión Nube. ⛔ No se mezclan con
   * `variantes` —el pedido ⛔ no las puede expandir—: sirven sólo para que el banco pueda decir
   * «esto hay que cargarlo en GN» en vez de «no cruza».
   */
  huerfanas: Variante[]
  /**
   * La línea de la sesión. 🔑 Es `clave`, que en Sesión de fotos ES la línea; el bloque de eventos
   * —lo único que la usa— ⛔ no se dibuja en Solicitudes internas, donde `clave` es la marca.
   */
  linea: string
}) {
  const { confirmar, avisar } = useConfirmar()
  const { marca, perfil } = useSesion()
  const admin = esAdmin(perfil)
  const puedeQuitar = admin || puedeSub(perfil, marca, preset.seccionKey, 'quitar-item')
  const puedeEditarDesc = admin || puedeSub(perfil, marca, preset.seccionKey, 'editar-desc')
  const puedeRetiroDep = puedeRetirar(perfil, 'deposito')
  const puedeRetiroLoc = puedeRetirar(perfil, 'local')

  // Puente desde Marketing o desde la cola de fotos: si venimos con una selección, abrimos el
  // borrador ya pre-cargado. Se toma UNA vez al montar (tomar consume), en el
  // inicializador de estado para no dispararlo en cada render.
  const [selPuente] = useState<SeleccionFotos | null>(() => tomarPuenteFotos())
  // Puente desde Inicio: si venimos a ver una solicitud puntual, abrimos su detalle.
  const [verInicial] = useState<string | null>(() => tomarVerSolicitud())
  // Puente desde Solicitudes: el alta ya eligió motivo + destino, así que el borrador se
  // abre solo y con eso puesto (si no, se elegiría el motivo dos veces).
  const [altaInicial] = useState<AltaSolicitud | null>(() => tomarAltaSolicitud())

  const [verCerradas, setVerCerradas] = useState(false)
  const [viendo, setViendo] = useState<string | null>(verInicial)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [combiIds, setCombiIds] = useState<string[] | null>(null)
  const [armando, setArmando] = useState(!!selPuente?.pids.length || !!altaInicial)
  /**
   * De qué sesión (evento) es hija la solicitud que se está armando. `null` = suelta, que es lo
   * que sale por «Nueva solicitud» y por los puentes de Marketing y de la cola de fotos.
   */
  const [eventoAlArmar, setEventoAlArmar] = useState<string | null>(null)

  /**
   * Pedir del banco: arma la solicitud hija con lo elegido y devuelve lo que ⛔ no entró.
   *
   * 🔑 **Reusa el armado del borrador que ya existe** (`expandirProductos` + `tildarVariantes` +
   * `procesarDraft`) y ⛔ no construye ítems a mano. Eso ⛔ no es prolijidad: `expandirProductos`
   * deja afuera las variantes **sin stock**, así que una prenda que se agotó entre que entró al
   * banco y que se pidió ⛔ no entra — y `vidsAusentes` la nombra, para que la sesión ⛔ no salga
   * corta sin que nadie se entere.
   *
   * 🔴 **Se guardan las DOS puntas y en este orden**: primero la solicitud, después el banco con
   * los candidatos marcados. Si fallara la segunda, la solicitud existe y el banco vuelve a
   * ofrecer esas piezas —duplicar un pedido se ve y se arregla—, mientras que al revés el banco
   * diría «ya pedidas» piezas que ⛔ nunca salieron.
   */
  const pedirDelBanco = async (ev: SesionEvento, vids: string[], destino: Origen): Promise<string[] | null> => {
    if (!eventos) return null
    const { sol, ausentes } = pedidoDesdeBanco(ev.banco || [], vids, destino, { variantes, productos }, {
      id: nuevoId(),
      fecha: hoyISO(),
      creado: Date.now(),
      creadoPor: perfil?.name ?? '',
      eventoId: ev.id,
      descripcion: ev.descripcion || 'Sesión de fotos',
      // Los mismos dos ejes con los que nace cualquier borrador de este cajón (ver `Draft`).
      motivo: motivosDe(preset)[0] || MOTIVO_DEFAULT,
      tipo: DESTINO_DEFAULT,
      disparador: ev.disparador ?? null,
    })
    if (!sol) return ausentes
    const ok = await persistir((l) => [sol, ...l])
    if (!ok) return null
    const entraron = sol.items.map((i) => i.vid)
    await eventos.persistir((l) => l.map((x) => (x.id === ev.id ? conBanco(x, marcarPedidos(x.banco || [], entraron, sol.id)) : x)))
    return ausentes
  }

  const solViendo = viendo ? data.find((s) => s.id === viendo) ?? null : null
  const solsCombi = combiIds ? combiIds.map((id) => data.find((s) => s.id === id)).filter((s): s is Solicitud => !!s) : null

  // Borrar una solicitud (desde el historial). Port de sfBorrar: guarda de "ya salió",
  // confirm, y limpia la selección / la vista si apuntaban a ella.
  const onBorrar = async (s: Solicitud) => {
    const bloqueo = bloqueoBorrado(s, admin)
    if (bloqueo) {
      await avisar({ titulo: 'No se puede eliminar', mensaje: bloqueo })
      return
    }
    const ok = await confirmar({
      titulo: 'Eliminar del historial',
      tono: 'danger',
      ok: 'Eliminar',
      mensaje: `Se elimina la solicitud "${s.descripcion || s.id}" del historial compartido. No hay papelera.`,
    })
    if (!ok) return
    persistir((l) => sinSolicitud(l, s.id))
    if (viendo === s.id) setViendo(null)
    setSeleccion((sel) => {
      const n = new Set(sel)
      n.delete(s.id)
      return n
    })
  }

  return (
    <div>
      {armando ? (
        <Draft
          preset={preset}
          prioridad={prioridad}
          admin={admin}
          usuario={perfil?.name ?? ''}
          persistir={persistir}
          mapaBc={mapaBc}
          catalogoListo={catalogoListo}
          variantes={variantes}
          productos={productos}
          desdePuente={selPuente}
          alta={altaInicial}
          eventoId={eventoAlArmar}
          onCancelar={() => {
            setArmando(false)
            setEventoAlArmar(null)
          }}
          onCreada={(id) => {
            setArmando(false)
            setEventoAlArmar(null)
            setViendo(id)
          }}
        />
      ) : solsCombi && solsCombi.length >= 2 ? (
        <Combinada
          sols={solsCombi}
          prioridad={prioridad}
          admin={admin}
          persistir={persistir}
          mapaBc={mapaBc}
          catalogoListo={catalogoListo}
          onVolver={() => setCombiIds(null)}
        />
      ) : solViendo ? (
        <Detalle
          key={solViendo.id}
          preset={preset}
          solicitud={solViendo}
          prioridad={prioridad}
          admin={admin}
          puedeEditarDesc={puedeEditarDesc}
          puedeRetiroDep={puedeRetiroDep}
          puedeRetiroLoc={puedeRetiroLoc}
          usuario={perfil?.name ?? ''}
          persistir={persistir}
          crearVentasDe={crearVentasDe}
          mapaBc={mapaBc}
          catalogoListo={catalogoListo}
          variantes={variantes}
          onVolver={() => setViendo(null)}
        />
      ) : (
        <>
          {/* Las sesiones planificadas, arriba de las solicitudes. 🔴 Si el cajón de eventos no se
              pudo leer se dice en una línea y ⛔ NO se frena la sección: las solicitudes son el
              trabajo de todos los días y el evento es lo nuevo. */}
          {eventos ? (
            eventos.data ? (
              <Eventos
                eventos={eventos.data}
                solicitudes={data}
                editable={puedePedir(perfil)}
                usuario={perfil?.name ?? ''}
                variantes={variantes}
                huerfanas={huerfanas}
                linea={linea}
                persistir={eventos.persistir}
                onPedirDelBanco={pedirDelBanco}
                onPedirProductos={(id) => {
                  setEventoAlArmar(id)
                  setArmando(true)
                }}
                onVerSolicitud={setViendo}
              />
            ) : eventos.error ? (
              <div style={{ fontSize: 12, color: color.warningInk, margin: '8px 0' }}>
                No se pudieron leer las sesiones planificadas ({eventos.error}). Las solicitudes de abajo
                andan igual.
              </div>
            ) : null
          ) : null}
          <Historial
            preset={preset}
            data={data}
          admin={admin}
          puedeQuitar={puedeQuitar}
          verCerradas={verCerradas}
          onToggleCerradas={setVerCerradas}
          onVer={setViendo}
          onBorrar={onBorrar}
          onNueva={() => setArmando(true)}
          cerrarAnuladas={cerrarAnuladas}
          seleccion={seleccion}
          onToggleSel={(id, on) =>
            setSeleccion((s) => {
              const n = new Set(s)
              if (on) n.add(id)
              else n.delete(id)
              return n
            })
          }
            onVerCombinada={() => {
              setCombiIds([...seleccion].filter((id) => data.some((s) => s.id === id)))
              setViendo(null)
            }}
          />
        </>
      )}
    </div>
  )
}

/**
 * Autoguardado con debounce (500 ms, como el legacy) + flush al desmontar para no
 * perder el último escaneo si se toca "Volver" antes de que dispare. `persistUno`
 * tiene que ser estable (useCallback) o el debounce se reinicia en cada render.
 */
function useAutosave<T>(work: T, inicial: T, persistUno: (w: T) => void) {
  const guardado = useRef(inicial)
  const actual = useRef(inicial)
  useEffect(() => {
    actual.current = work
  }, [work])
  useEffect(() => {
    if (work === guardado.current) return
    const t = setTimeout(() => {
      guardado.current = work
      persistUno(work)
    }, 500)
    return () => clearTimeout(t)
  }, [work, persistUno])
  useEffect(() => {
    return () => {
      if (actual.current !== guardado.current) {
        guardado.current = actual.current
        persistUno(actual.current)
      }
    }
  }, [persistUno])
}

// ── Banner de prioridad de retiro (admin: select DESHABILITADO) ─────────────────

function Banner({ prioridad, admin }: { prioridad: Origen; admin: boolean }) {
  return (
    <div
      style={{
        background: color.brandBg,
        border: `1px solid ${color.brandBorder}`,
        borderRadius: 9,
        padding: '8px 11px',
        marginBottom: 10,
        fontSize: 12,
        color: color.brand,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <b>Prioridad de retiro:</b>{' '}
      {prioridad === 'local' ? (
        <span>
          <b>Local primero</b> (si no hay stock, se retira de Depósito)
        </span>
      ) : (
        <span>
          <b>Depósito primero</b> (si no hay stock, se retira de Local)
        </span>
      )}
      {admin && (
        <>
          <select value={prioridad} disabled title={DISABLED_TITLE} style={{ padding: '4px 6px', border: `1px solid ${color.brandBorder}`, borderRadius: 6, background: '#fff' }}>
            <option value="deposito">Depósito primero</option>
            <option value="local">Local primero</option>
          </select>
          <span style={{ color: color.mut2 }}>(solo admin)</span>
        </>
      )}
    </div>
  )
}

// ── Historial ───────────────────────────────────────────────────────────────────

function Historial({
  preset,
  data,
  admin,
  puedeQuitar,
  verCerradas,
  onToggleCerradas,
  onVer,
  onBorrar,
  onNueva,
  cerrarAnuladas,
  seleccion,
  onToggleSel,
  onVerCombinada,
}: {
  preset: PresetSolicitud
  data: Solicitud[]
  admin: boolean
  puedeQuitar: boolean
  verCerradas: boolean
  onToggleCerradas: (v: boolean) => void
  onVer: (id: string) => void
  onBorrar: (s: Solicitud) => void
  onNueva: () => void
  cerrarAnuladas: () => Promise<number>
  seleccion: Set<string>
  onToggleSel: (id: string, on: boolean) => void
  onVerCombinada: () => void
}) {
  const toast = useToast()
  const { marca: marcaHist, perfil: perfilHist } = useSesion()
  const cerradasN = useMemo(() => contarCerradas(data), [data])
  // Local ve solo lo de local, Depósito solo lo suyo — el mismo recorte que ya hacía
  // /solicitudes. Quien ve todo (marketing, administración, dirección) no recorta nada.
  const origenesHist = useMemo(() => (veTodo(perfilHist) ? undefined : origenesDe(perfilHist)), [perfilHist])
  // Filtro por proceso: «mostrame los faltantes» es la pregunta que el campo vino a
  // contestar, y encuentra también los que se sumaron a una sesión de otro origen.
  const esFotosHist = preset.kind === PRESET_FOTOS.kind
  const [filtroDisp, setFiltroDisp] = useState<Disparador | null>(null)
  const visibles = useMemo(
    () => historialVisible(data, verCerradas, origenesHist, esFotosHist ? filtroDisp : null),
    [data, verCerradas, origenesHist, esFotosHist, filtroDisp],
  )
  const [chequeando, setChequeando] = useState(false)
  // Consumos pendientes de aprobación (para el aprobador). Lo define el DESTINO de cada
  // solicitud, no la sección: una de sesión de fotos también puede ser consumo.
  const consumosPend = visibles.filter((s) => necesitaAprobacion(s) && s.estado === 'pendiente')
  const esAprobadorHist = admin || puedeSub(perfilHist, marcaHist, preset.seccionKey, 'aprobar')
  const verificarAnulaciones = async () => {
    setChequeando(true)
    try {
      const n = await cerrarAnuladas()
      if (n) toast.ok(`${n} ${n === 1 ? 'solicitud cerrada' : 'solicitudes cerradas'}: su venta fue anulada en GN.`)
      else toast.info('Todavía ninguna venta fue anulada en GN.')
    } finally {
      setChequeando(false)
    }
  }

  return (
    <div>
      {consumosPend.length > 0 && esAprobadorHist ? (
        <div style={{ background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 10, padding: '9px 13px', marginBottom: 12, fontSize: 13, color: color.warningInk }}>
          ⏳ <b>{consumosPend.length}</b> consumo(s) esperando tu aprobación. Abrí la solicitud para aprobar o rechazar.
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {/* Local y Depósito ejecutan, no piden: para ellos el botón no existe (ver
            `puedePedir`). Piden Marketing, Administración y los admins. */}
        {puedePedir(perfilHist) && (
          <Button variant="solid" tone="brand" onClick={onNueva}>
            + Nueva solicitud
          </Button>
        )}
        {seleccion.size >= 2 ? (
          <Button
            size="sm"
            variant="soft"
            tone="brand"
            onClick={onVerCombinada}
          >
            Ver combinadas ({seleccion.size})
          </Button>
        ) : seleccion.size === 1 ? (
          <span style={{ fontSize: 12, color: color.mut2 }}>Tildá otra solicitud para combinarlas.</span>
        ) : null}
        {admin && (
          <Button
            size="sm"
            variant="outline"
            onClick={verificarAnulaciones}
            disabled={chequeando}
            title="Consulta en GN si las ventas ya se anularon y cierra esas solicitudes"
          >
            {chequeando ? 'Verificando en GN…' : 'Verificar anulaciones en GN'}
          </Button>
        )}
        {cerradasN > 0 && (
          <label style={{ fontSize: 12, color: color.mut, marginLeft: 'auto', cursor: 'pointer' }}>
            <input type="checkbox" checked={verCerradas} onChange={(e) => onToggleCerradas(e.target.checked)} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Ver cerradas ({cerradasN})
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: color.mut2, letterSpacing: 0 }}>Historial</div>
        {esFotosHist ? (
          <label style={{ fontSize: 12, color: color.mut, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            De dónde viene
            <select
              value={filtroDisp || ''}
              onChange={(e) => setFiltroDisp((e.target.value || null) as Disparador | null)}
              style={{ padding: '3px 6px', border: `1px solid ${color.line2}`, borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
            >
              <option value="">Todas</option>
              {DISPARADORES.map((d) => <option key={d} value={d}>{DISPARADOR_LABEL[d]}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      {visibles.length === 0 ? (
        <div style={{ color: color.mut2, fontSize: 13 }}>
          {filtroDisp ? `Ninguna solicitud viene de "${DISPARADOR_LABEL[filtroDisp]}".` : 'Todavía no hay solicitudes.'}
        </div>
      ) : (
        visibles.map((s) => {
          const f = filaHistorial(s)
          return (
            <div
              key={s.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                border: `1px solid ${f.porDevolver ? color.dangerBorder : color.line}`,
                borderRadius: 9,
                padding: '9px 11px',
                marginBottom: 7,
                flexWrap: 'wrap',
                ...(f.cerrada ? { opacity: 0.6, background: color.bg } : f.porDevolver ? { background: color.dangerBg } : {}),
              }}
            >
              <input
                type="checkbox"
                checked={seleccion.has(s.id)}
                onChange={(e) => onToggleSel(s.id, e.target.checked)}
                title="Seleccionar para verificar/preparar combinadas"
                style={{ width: 17, height: 17, cursor: 'pointer', flex: '0 0 auto' }}
              />
              <div style={{ flex: 1, minWidth: 160, cursor: 'pointer' }} onClick={() => onVer(s.id)}>
                <div style={{ fontWeight: 600 }}>
                  {f.descripcion || '(sin descripción)'}
                  {f.cerrada ? <Badge tone="success" subtle style={{ marginLeft: 6 }}>Cerrada</Badge> : null}
                  {/* Una hija se reconoce en la lista plana. 🔑 Se muestra acá y ⛔ no se esconde
                      de la lista: es un retiro real, con venta en Gestión Nube, y el que busca
                      «qué salió del depósito» tiene que verla esté colgada o no. */}
                  {s.eventoId ? <Badge tone="brand" subtle style={{ marginLeft: 6 }}>de una sesión</Badge> : null}
                  {f.porDevolver ? (
                    <span style={{ background: color.dangerBg, color: color.dangerInk, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
                      {f.porDevolver} por devolver
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12, color: color.mut2 }}>
                  {f.fecha} · <MarcaOrigen o="deposito" soloIcono size={12} /> {f.dep} · <MarcaOrigen o="local" soloIcono size={12} /> {f.loc} · {f.estado}
                  {/* De dónde viene. Vacío se dice «sin origen»: es un dato que falta, no un
                      origen — esconderlo lo volvería invisible. Son varios cuando a una
                      sesión de ingreso se le sumaron faltantes. */}
                  {esFotosHist ? ` · ${f.disparadores.length ? f.disparadores.map((d) => DISPARADOR_LABEL[d]).join(' + ') : 'sin origen'}` : ''}
                </div>
                {/* El resultado, en la fila. Sin esto, una sesión cerrada sin una sola foto se ve
                    igual que una que salió perfecta: las dos dicen «cerrada». Se calcula acá y no
                    en `filaHistorial` porque `resumenFotos` importa de `core` y sería un ciclo. */}
                {esFotosHist ? <ResultadoFotos s={s} /> : null}
              </div>
              <Button size="sm" variant="outline" onClick={() => onVer(s.id)}>
                Ver
              </Button>
              {puedeQuitar && (
                <button onClick={() => onBorrar(s)} title="Eliminar solicitud" style={{ border: 'none', background: 'none', color: color.mut2, fontSize: 15, cursor: 'pointer' }}>
                  <Icono nombre="papelera" size={15} />
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Detalle de una solicitud ────────────────────────────────────────────────────

const NUM_VENTA = (v: { number?: number | string; id: number | string }) => String(v.number || v.id || '?')

/**
 * Corre una salida (PDF, etiqueta, clipboard) y avisa si falla. El aviso llega por
 * parámetro porque esta función vive fuera del componente y no puede usar el hook;
 * mismo criterio que `copiarReporte(s, onOk)` más abajo.
 */
async function correrSalida(fn: () => void | Promise<void>, onError: (msg: string) => void) {
  try {
    await fn()
  } catch (e) {
    onError(e instanceof Error ? e.message : String(e))
  }
}

function Detalle({
  preset,
  solicitud: s0,
  prioridad,
  admin,
  puedeEditarDesc,
  puedeRetiroDep,
  puedeRetiroLoc,
  usuario,
  persistir,
  crearVentasDe,
  mapaBc,
  catalogoListo,
  variantes,
  onVolver,
}: {
  preset: PresetSolicitud
  solicitud: Solicitud
  prioridad: Origen
  admin: boolean
  puedeEditarDesc: boolean
  puedeRetiroDep: boolean
  puedeRetiroLoc: boolean
  usuario: string
  persistir: Persistir
  crearVentasDe: CrearVentasDe
  mapaBc: Record<string, string>
  catalogoListo: boolean
  variantes: Variante[]
  onVolver: () => void
}) {
  const { avisar, pedirTexto } = useConfirmar()
  const toast = useToast()
  const { marca: marcaDetalle, perfil: perfilDetalle } = useSesion()
  const [creando, setCreando] = useState(false)
  // Copia de trabajo local (como sfData en memoria): todas las ediciones la mutan
  // al instante; un autosave con debounce la persiste con merge por-id.
  const [work, setWork] = useState<Solicitud>(s0)
  const [fase, setFase] = useState<Fase>('retiro')
  const [desc, setDesc] = useState(s0.descripcion || '')
  const [fb, setFb] = useState<{ key: string; r: ResultadoEscaneo } | null>(null)

  const persistUno = useCallback(
    (w: Solicitud) => persistir((l) => l.map((x) => (x.id === w.id ? w : x))),
    [persistir],
  )
  useAutosave(work, s0, persistUno)

  const s = work
  const conteo = s[fase === 'devolucion' ? 'devuelto' : 'verif'] || {}
  /**
   * Cuánto se espera de un ítem EN ESTA FASE. La cuenta vive en el core (`esperadoEn`): acá había
   * una copia inline y el día que el core sumó el caso "de este origen no se escaneó nada", la
   * pantalla se habría quedado con la cuenta vieja mientras el reporte usaba la nueva.
   */
  const esperado = (it: ItemSolicitud) => esperadoEn(s, it, fase)
  const conf = (it: ItemSolicitud) => Math.min(conteo[it.vid] || 0, esperado(it))

  // En devolución, lo que no salió no se lista.
  const delOrigen = (o: Origen) => s.items.filter((i) => i.origen === o && esperado(i) > 0)
  const dep = delOrigen('deposito')
  const loc = delOrigen('local')
  // Vista por sector: un usuario Local ve solo lo de local, Depósito solo lo de depósito.
  // `puedeRetiro*` = veTodo || tiene la función de ese origen (ver `puedeRetirar`).
  const origenVisible = (o: Origen) => (o === 'deposito' ? puedeRetiroDep : puedeRetiroLoc)
  // Solo quien ve TODOS los orígenes con ítems puede crear la venta GN (separa todo, es coordinación).
  const veTodosLosItems = origenesConItems(s).every(origenVisible)
  const falt = faltantes(s).filter((f) => origenVisible(f.origen))
  const hayVentables = s.items.some((i) => !i.nuevo)

  const onScan = (origen: Origen, code: string) => {
    if (!code.trim()) return
    const { sol: ns, resultado } = escanearSol(work, origen, fase, code.trim(), mapaBc)
    setWork(ns)
    setFb({ key: `${origen}-${fase}`, r: resultado })
  }

  // Marcar/desmarcar el retiro FÍSICO de un origen (el autosave lo persiste).
  const onRetirar = (origen: Origen, val: boolean) => setWork((w) => ({ ...w, retirado: { ...(w.retirado || {}), [origen]: val } }))
  const puedeRetiroDe = (o: Origen) => (o === 'deposito' ? puedeRetiroDep : puedeRetiroLoc)

  // Aprobación: la pide el DESTINO (consumo = baja definitiva), no la sección por la que
  // se entró. Un consumo sin aprobar no puede generar la venta en GN.
  const esConsumo = s.tipo === 'consumo'
  // De dónde viene (ingreso · campaña · faltante): solo el cajón de fotos lo lleva, y se
  // muestra aunque falte. `esDisparador` filtra lo que venga raro del KV.
  const esFotosDet = preset.kind === PRESET_FOTOS.kind
  // El resultado de la sesión: qué se fotografió de todo lo que salió. Sólo tiene sentido en el
  // cajón de fotos, y sólo una vez que salió algo (antes no hay nada que contestar).
  const preguntarFotos = esFotosDet && hayQuePreguntar(s)
  const resFotos = resumenFotos(s)
  const dispDet = esDisparador(s.disparador) ? s.disparador : null
  const pendienteDeAprobar = necesitaAprobacion(s) && s.estado === 'pendiente'
  const esAprobador = admin || puedeSub(perfilDetalle, marcaDetalle, preset.seccionKey, 'aprobar')
  const onAprobar = () => setWork((w) => ({ ...w, estado: 'aprobada', aprobadoPor: usuario, aprobadoFecha: new Date().toISOString() }))
  const onRechazar = async () => {
    const m = await pedirTexto('Motivo del rechazo (opcional)', '', { titulo: 'Rechazar la solicitud', ok: 'Rechazar' })
    if (m === null) return // cancelar no debe rechazar: antes, cancelar el prompt rechazaba igual
    setWork((w) => ({ ...w, estado: 'rechazada', rechazadoMotivo: m.trim(), aprobadoPor: usuario, aprobadoFecha: new Date().toISOString() }))
  }

  // Crear las ventas en GN (la única escritura IRREVERSIBLE). Pide la contraseña,
  // el hook re-lee fresco y aborta si ya hay ventas (anti-duplicado), y persiste.
  const onCrearVentas = async () => {
    const cred = await credencialConPrompt('del Monitor')
    if (!cred) {
      await avisar('No pude verificar tu identidad para crear las ventas. Volvé a entrar al Monitor y probá de nuevo.')
      return
    }
    setCreando(true)
    try {
      const r = await crearVentasDe(work, cred)
      if (r.tipo === 'no-leido') {
        await avisar({
          titulo: 'No se pudo crear',
          tono: 'danger',
          mensaje: 'No se pudo leer el historial para crear las ventas de forma segura, así que no se creó ninguna. Recargá y probá de nuevo.',
        })
        return
      }
      if (r.tipo === 'ya-tenia') {
        await avisar({ titulo: 'Ya estaban creadas', mensaje: 'Esta solicitud ya tiene sus ventas creadas en GN. No se creó ninguna de nuevo.' })
        setWork((w) => ({ ...w, ventas: r.ventas, estado: r.estadoSol as EstadoSolicitud }))
        return
      }
      if (Object.keys(r.ventas).length) setWork((w) => ({ ...w, ventas: { ...(w.ventas || {}), ...r.ventas }, estado: preset.estadoTrasVenta }))
      if (r.errores.length) {
        // Es la única escritura irreversible de la sección: un fallo parcial se cuenta
        // con un diálogo que hay que cerrar a mano, no con un Toast que se va solo.
        await avisar({
          titulo: 'No se pudieron crear todas las ventas',
          tono: 'danger',
          mensaje: r.errores.join('\n'),
        })
      }
    } finally {
      setCreando(false)
    }
  }

  // ── Edición (Fase C): agregar / quitar / cambiar cantidad, con motivo predefinido + historial ──
  const puedeEditar = admin || puedeSub(perfilDetalle, marcaDetalle, preset.seccionKey, 'editar')
  const editable = puedeEditar && bloqueoEdicion(s) === null
  // Picker de motivo: guarda la acción a ejecutar cuando el usuario elige el motivo.
  const [pedirMotivo, setPedirMotivo] = useState<{ titulo: string; onOk: (motivo: string) => void } | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [busqAgregar, setBusqAgregar] = useState('')
  const conMotivo = (titulo: string, fn: (motivo: string) => void) => setPedirMotivo({ titulo, onOk: (m) => { setPedirMotivo(null); fn(m) } })

  const onQuitarItem = (it: ItemSolicitud) =>
    conMotivo(`Sacar "${it.nombre} · ${it.variante}"`, (motivo) =>
      setWork((w) => sinItemSol(w, it.vid, { por: usuario, motivo, fecha: new Date().toISOString().slice(0, 10), ts: Date.now() })),
    )
  const onCambiarQty = (it: ItemSolicitud, nueva: number) => {
    const q = Math.max(1, Number(nueva) || 1)
    if (q === it.qty) return
    conMotivo(`Cambiar cantidad de "${it.nombre} · ${it.variante}" (${it.qty} → ${q})`, (motivo) =>
      setWork((w) => cambiarCantidadSol(w, it.vid, q, { por: usuario, motivo, ts: Date.now() })),
    )
  }
  // Asignar bolsa: organizativo (no toca GN/stock), sin motivo. n = null limpia.
  const onAsignarBolsa = (it: ItemSolicitud, n: number | null) => setWork((w) => asignarBolsa(w, it.vid, n))
  const grupos = bolsasDe(s)
  const nBolsas = contarBolsas(s)
  const proxBolsa = maxBolsa(s) + 1

  /**
   * Los outfits: cada bolsa es un look y cada prenda ocupa arriba, abajo o las dos.
   *
   * 🔑 **Se le pasa el nombre y ⛔ NO el catálogo.** El núcleo acepta las categorías de Gestión
   * Nube como segunda fuente, pero medido el 4-sep-2026 **el 100% de lo dado de alta desde julio
   * viene sin categoría** —y eso es justo lo que una sesión de fotos pide—, así que traer el
   * catálogo hasta acá sería cargar props para agregar casi nada. El nombre solo clasifica
   * **481 de las 501** con stock de Zattia.
   *
   * 🔴 En BDI `aplicaOutfits` da falso —fundas y cables ⛔ no son ropa— y el bloque entero
   * desaparece: el módulo se calla en vez de afirmar.
   */
  // Los talles que la modelo tuvo en la mano en ESTA sesión: es lo que sugiere su ficha, y sale
  // de las variantes reales para ⛔ no imponer un alfabeto (S/M/L contra 38/40/42, que conviven).
  const tallesDeLaSesion = [...new Set((s.items || []).map((i) => talleNormalizado(i.variante)).filter(Boolean))]

  const hayOutfits = aplicaOutfits(s.items)
  const zonas = zonasDe(s.items, s.clasifOutfits)
  const alertasOutfit = alertasDe(s.items, s.clasifOutfits)
  const aClasificar = sinZona(s.items, s.clasifOutfits)
  const onZona = (it: ItemSolicitud, z: ZonaPrenda | null) => setWork((w) => conZona(w, it.vid, z))
  const onAgregarVariante = (v: Variante) =>
    conMotivo(`Agregar "${v.name} · ${v.size}"`, (motivo) =>
      setWork((w) =>
        agregarItemSol(
          w,
          itemDeVariante({ vid: v.id, sid: v.sid, size: v.size, sku: v.sku, local: v.local, deposito: v.deposito }, v.pid, v.name, 1, prioridad),
          { por: usuario, motivo, ts: Date.now() },
        ),
      ),
    )

  const grupo = (titulo: string, arr: ItemSolicitud[], origen: Origen) => {
    if (!arr.length) return null
    const totQ = arr.reduce((a, i) => a + esperado(i), 0)
    const confTot = arr.reduce((a, i) => a + conf(i), 0)
    const completo = confTot >= totQ
    const accionN = fase === 'devolucion' ? 'devueltos' : 'preparados'
    const accionV = fase === 'devolucion' ? 'la devolución' : 'el preparado'
    const fbKey = `${origen}-${fase}`
    return (
      <div style={{ border: `1px solid ${completo ? color.successBorder : color.line}`, borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700 }}>
            {titulo} <span style={{ color: color.mut2, fontWeight: 500, fontSize: 12 }}>({confTot}/{totQ} {accionN})</span>
            {completo ? <span style={{ color: color.success, fontWeight: 700 }}> ✓ completo</span> : null}
          </div>
          <Button size="sm" variant="solid" tone="neutral" onClick={() => correrSalida(() => reportePDF(s, origen), toast.error)}>
            Reporte
          </Button>
        </div>
        {/* Si nadie escaneó el retiro de este sector, la devolución no tiene contra qué comparar:
            antes se apagaba sola y en silencio (tabla vacía, "volvió todo"). Ahora asume que salió
            lo pedido, y lo dice — porque es un supuesto, no un dato. */}
        {fase === 'devolucion' && salioSinEscanear(s, origen) ? (
          <div style={{ fontSize: 12, color: color.warningInk, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 8, padding: '6px 9px', margin: '8px 0' }}>
            Nadie escaneó el retiro de {origen === 'deposito' ? 'Depósito' : 'Local'}: se asume que salió
            todo lo pedido, así que eso es lo que hay que devolver.
          </div>
        ) : null}
        <div style={{ margin: '8px 0' }}>
          <ScanInput
            disabled={!catalogoListo}
            placeholder={catalogoListo ? `Escaneá para confirmar ${accionV} (o tipeá el SKU + Enter)…` : 'Cargando catálogo…'}
            onScan={(v) => onScan(origen, v)}
          />
        </div>
        {fb && fb.key === fbKey ? <div style={{ fontSize: 13, marginBottom: 6 }}>{fbTexto(fb.r)}</div> : null}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ fontSize: 11, color: color.mut2, textAlign: 'left' }}>
              <th style={{ padding: '3px 6px' }}>Producto</th>
              <th style={{ padding: '3px 6px' }}>Variante</th>
              <th style={{ padding: '3px 6px' }}>SKU</th>
              <th style={{ padding: '3px 6px', textAlign: 'right' }}>{fase === 'devolucion' ? 'Devuelto/Salió' : 'Preparado/Ped.'}</th>
              <th style={{ padding: '3px 6px' }} />
            </tr>
          </thead>
          <tbody>
            {arr.map((i) => {
              const c = conf(i)
              const esp = esperado(i)
              const ok = c >= esp
              return (
                <tr key={i.vid} style={ok ? { background: color.successBg } : undefined}>
                  <td style={{ padding: '3px 6px', borderTop: `1px solid ${color.bg2}` }}>
                    <MarcaOk ok={ok} /> {i.nombre}
                    {i.manual ? <EtiquetaMini texto="a mano" fg={color.brand} bg={color.brandBg} /> : i.nuevo ? <EtiquetaMini texto="sin venta" fg={color.warningInk} bg={color.warningBg} /> : null}
                  </td>
                  <td style={{ padding: '3px 6px', borderTop: `1px solid ${color.bg2}` }}>
                    {i.variante}
                    {i.nuevo && i.barcode ? (
                      <div style={{ fontSize: 11, color: color.mut2, fontFamily: 'monospace' }}>
                        {i.barcode}
                        {i.pendiente ? ' · pendiente en GN' : ''}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: '3px 6px', borderTop: `1px solid ${color.bg2}`, color: color.mut }}>{i.sku || '—'}</td>
                  <td style={{ padding: '3px 6px', borderTop: `1px solid ${color.bg2}`, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {i.manual ? (
                      <>
                        <BotonMini label="−" onClick={() => setWork((w) => ajustarManualSol(w, fase, i.vid, -1))} />
                        {' '}{c}/{esp}{' '}
                        <BotonMini label="+" acento onClick={() => setWork((w) => ajustarManualSol(w, fase, i.vid, 1))} />
                      </>
                    ) : (
                      <>{c}/{esp}</>
                    )}
                  </td>
                  <td style={{ padding: '3px 6px', borderTop: `1px solid ${color.bg2}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {editable ? (
                      <input
                        type="number"
                        min={1}
                        value={i.bolsa ?? ''}
                        onChange={(e) => { const v = e.target.value.trim(); onAsignarBolsa(i, v === '' ? null : parseInt(v, 10)) }}
                        title="Bolsa (dejá vacío para sacarla)"
                        placeholder=""
                        style={{ width: 38, textAlign: 'center', border: `1px solid ${color.line}`, borderRadius: 5, padding: '1px 2px', fontSize: 12, marginRight: 6 }}
                      />
                    ) : typeof i.bolsa === 'number' ? (
                      <span style={{ marginRight: 6 }}><Badge tone="brand" subtle>B{i.bolsa}</Badge></span>
                    ) : null}
                    {/* La zona del outfit. Sólo aparece si la sesión es de ropa (`aplicaOutfits`):
                        en BDI, donde todo son fundas, ⛔ no se pregunta nada.
                        🔑 «Sin zona» ⛔ no es un valor que se guarde: es soltar la corrección y
                        volver a lo que dice el nombre. */}
                    {hayOutfits && editable ? (
                      <select
                        value={s.clasifOutfits?.[i.vid] ?? ''}
                        onChange={(e) => onZona(i, (e.target.value || null) as ZonaPrenda | null)}
                        title={
                          zonas[i.vid]
                            ? `Zona del outfit: ${ROTULO_ZONA[zonas[i.vid] as ZonaPrenda]}${s.clasifOutfits?.[i.vid] ? ' (corregida a mano)' : ' (propuesta por el nombre)'}`
                            : 'Sin zona: el nombre no dice si va arriba o abajo. Elegila.'
                        }
                        style={{
                          fontSize: 11,
                          border: `1px solid ${zonas[i.vid] ? color.line : color.warningInk}`,
                          borderRadius: 5,
                          padding: '1px 2px',
                          marginRight: 6,
                          maxWidth: 96,
                          background: zonas[i.vid] ? '#fff' : color.warningBg,
                        }}
                      >
                        <option value="">{zonas[i.vid] ? `· ${ROTULO_ZONA[zonas[i.vid] as ZonaPrenda]}` : '· sin zona'}</option>
                        <option value="arriba">{ROTULO_ZONA.arriba}</option>
                        <option value="abajo">{ROTULO_ZONA.abajo}</option>
                        <option value="entero">{ROTULO_ZONA.entero}</option>
                      </select>
                    ) : hayOutfits && zonas[i.vid] ? (
                      <span style={{ marginRight: 6, fontSize: 11, color: color.mut2 }}>{ROTULO_ZONA[zonas[i.vid] as ZonaPrenda]}</span>
                    ) : null}
                    {editable && !i.manual ? (
                      <button
                        onClick={() => { const n = prompt(`Nueva cantidad de "${i.nombre} · ${i.variante}":`, String(i.qty)); if (n != null) onCambiarQty(i, parseInt(n, 10)) }}
                        title="Cambiar cantidad"
                        style={{ border: 'none', background: 'none', color: color.brandSolid, fontSize: 13, cursor: 'pointer' }}
                      >
                        <Icono nombre="lapiz" size={13} />
                      </button>
                    ) : null}
                    {editable ? (
                      <button onClick={() => onQuitarItem(i)} title="Sacar de la solicitud" style={{ border: 'none', background: 'none', color: color.danger, fontSize: 14, cursor: 'pointer' }}>
                        <Icono nombre="cruz" size={13} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <Button size="sm" variant="outline" onClick={onVolver}>
          ← Volver
        </Button>
        {puedeEditarDesc ? (
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => {
              if (desc !== s.descripcion) setWork((w) => ({ ...w, descripcion: desc }))
            }}
            placeholder="Descripción"
            title="Editar descripción de la solicitud"
            style={{ fontWeight: 700, fontSize: 15, border: 'none', borderBottom: `1px solid ${color.line}`, padding: '2px 0', minWidth: 200, flex: 1, background: 'transparent' }}
          />
        ) : (
          <div style={{ fontWeight: 700, fontSize: 15 }}>{s.descripcion || 'Solicitud'}</div>
        )}
        <span style={{ color: color.mut2, fontSize: 12 }}>{s.fecha}</span>
        {/* El "Reporte" de cada sector es la hoja con la que ese sector junta lo suyo, y por eso
            filtra por origen. Pero era la ÚNICA forma de imprimir: una solicitud con ítems en los
            dos lados salían dos papeles distintos y quien la pidió recibía siempre la mitad. Este
            botón sale solo cuando hay ítems en los dos y quien mira ve los dos (coordinación). */}
        {origenesConItems(s).length > 1 && veTodosLosItems ? (
          <Button size="sm" variant="outline" onClick={() => correrSalida(() => reportePDF(s, 'todos'), toast.error)} title="Un solo PDF con lo de Depósito y lo de Local, separado por sector">
            Reporte completo
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => correrSalida(() => etiquetaBolsa(s), toast.error)} title="Etiqueta 5×2,5 cm para la bolsa (con la descripción)">
          Etiqueta de bolsa
        </Button>
        <Button size="sm" variant="outline" onClick={() => correrSalida(() => imprimirTicket80(s), toast.error)} title="Ticket 80 mm con el detalle de todos los productos pedidos">
          Ticket 80mm
        </Button>
        {/* El aviso al sector. El badge del monitor solo se ve con la pantalla abierta; esto
            llega al teléfono. */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => correrSalida(() => compartirTexto('Solicitud nueva', textoAvisoSolicitud(s), () => toast.ok('Aviso copiado: pegalo en WhatsApp.')), toast.error)}
          title="Enviar el detalle por WhatsApp a quien la tiene que preparar"
        >
          Avisar
        </Button>
        {nBolsas > 0 ? (
          <>
            <Button size="sm" variant="outline" onClick={() => correrSalida(() => etiquetasBolsas(s), toast.error)} title="Una etiqueta 5×2,5 cm por bolsa (BOLSA n/N)">
              Etiquetas de bolsas ({nBolsas})
            </Button>
            <Button size="sm" variant="outline" onClick={() => correrSalida(() => reporteBolsasPDF(s), toast.error)} title="Reporte A4 agrupado por bolsa (armado/packing)">
              Reporte por bolsa
            </Button>
          </>
        ) : null}
        <label style={{ fontSize: 12, color: color.mut, marginLeft: 'auto' }}>
          Estado{' '}
          <select
            value={s.estado}
            onChange={(e) => setWork((w) => ({ ...w, estado: e.target.value as EstadoSolicitud }))}
            style={{ padding: '4px 6px', border: `1px solid ${color.line2}`, borderRadius: 6 }}
          >
            {(['pendiente', 'preparada', 'cargada', 'devuelta', 'cerrada'] as const).map((e) => (
              <option key={e} value={e}>{e === 'cargada' ? 'separado' : e}</option>
            ))}
          </select>
        </label>
      </div>

      <Banner prioridad={prioridad} admin={admin} />

      {/* Destino + aprobación. Toda solicitud tiene destino, así que siempre se muestra. */}
      {s.tipo ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: esConsumo ? color.warningInk : color.successInk, background: esConsumo ? color.warningBg : color.successBg, border: `1px solid ${esConsumo ? color.warningBorder : color.successBorder}`, borderRadius: 6, padding: '2px 8px' }}>
            {esConsumo ? 'Consumo (baja definitiva)' : 'Retornable'}{s.motivo ? ` · ${s.motivo}` : ''}
          </span>
          {/* De dónde viene. Se muestra también cuando FALTA: una sesión sin origen anotado
              es un dato que falta, y taparlo lo vuelve invisible justo cuando se está
              empezando a usar el campo. */}
          {esFotosDet ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: dispDet ? color.ink2 : color.mut2, background: color.bg, border: `1px solid ${color.line2}`, borderRadius: 6, padding: '2px 8px' }}>
              {dispDet ? DISPARADOR_LABEL[dispDet] : 'Sin origen'}
            </span>
          ) : null}
          {s.estado === 'rechazada' ? <span style={{ color: color.dangerInk }}>✗ Rechazada{s.rechazadoMotivo ? `: ${s.rechazadoMotivo}` : ''}</span> : null}
          {s.aprobadoPor && s.estado !== 'rechazada' && s.estado !== 'pendiente' ? <span style={{ color: color.success }}>✓ Aprobada por {s.aprobadoPor}</span> : null}
          {pendienteDeAprobar && esAprobador ? (
            <>
              <Button size="sm" variant="solid" tone="success" onClick={onAprobar}>Aprobar</Button>
              <Button size="sm" variant="outline" tone="danger" onClick={onRechazar}>Rechazar</Button>
            </>
          ) : pendienteDeAprobar ? (
            <span style={{ color: color.warningInk }}>⏳ Esperando aprobación de un gerente.</span>
          ) : null}
        </div>
      ) : null}

      {s.ventas ? (
        <div style={{ background: color.successBg, border: `1px solid ${color.successBorder}`, borderRadius: 9, padding: '9px 12px', marginBottom: 10, fontSize: 13 }}>
          <div>
            <b>Separado</b> en GN:{' '}
            {(['deposito', 'local'] as Origen[])
              .filter((o) => s.ventas?.[o] && origenVisible(o))
              .map((o) => `${ROTULO_ORIGEN[o]} N° ${NUM_VENTA(s.ventas![o]!)}`)
              .join(' · ')}{' '}
            <span style={{ color: color.mut2, fontSize: 11 }}>Se separó el stock (no es retiro). Para anular, hacelo en GN.</span>
          </div>
          {/* Retiro físico por sector: local retira lo suyo, depósito lo suyo. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {origenesConItems(s).filter(origenVisible).map((o) => {
              const yaRet = retiradoDe(s, o)
              const et = ROTULO_ORIGEN[o]
              return yaRet ? (
                <span key={o} style={{ fontSize: 12, fontWeight: 700, color: color.successInk, background: color.successBg, border: `1px solid ${color.successBorder}`, borderRadius: 7, padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {et} retirado
                  {puedeRetiroDe(o) ? (
                    <button onClick={() => onRetirar(o, false)} title="Deshacer" style={{ background: 'none', border: 'none', color: color.successInk, cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>deshacer</button>
                  ) : null}
                </span>
              ) : puedeRetiroDe(o) ? (
                <button key={o} onClick={() => onRetirar(o, true)} style={{ fontSize: 12, fontWeight: 600, color: color.brand, background: color.brandBg, border: `1px solid ${color.brandBorder}`, borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>
                  Marcar retirado de {et}
                </button>
              ) : (
                <span key={o} style={{ fontSize: 12, color: color.mut2, border: `1px solid ${color.line}`, borderRadius: 7, padding: '3px 9px' }}>{et}: sin retirar</span>
              )
            })}
          </div>
        </div>
      ) : hayVentables && veTodosLosItems && (!necesitaAprobacion(s) || s.estado === 'aprobada') ? (
        <div style={{ marginBottom: 10 }}>
          <Button variant="solid" tone="brand" onClick={onCrearVentas} disabled={creando}>
            {creando ? 'Separando en GN…' : esConsumo ? 'Crear venta en GN (descontar)' : 'Crear venta en GN (separar)'}
          </Button>{' '}
          <span style={{ color: color.mut2, fontSize: 12 }}>{esConsumo ? 'Descuenta el stock (baja definitiva).' : 'Separa el stock con el cliente “Sesión de fotos” (no es retiro).'}</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <BotonFase activo={fase === 'retiro'} onClick={() => { setFase('retiro'); setFb(null) }} label="Preparado" />
        {!esConsumo && <BotonFase activo={fase === 'devolucion'} onClick={() => { setFase('devolucion'); setFb(null) }} label="Devolución (al volver)" />}
      </div>

      {origenVisible('deposito') && grupo('Retirar de Depósito', dep, 'deposito')}
      {origenVisible('local') && grupo('Retirar de Local', loc, 'local')}

      {/* Edición (Fase C): agregar productos. Quitar/cambiar cantidad van por ítem (lápiz/cruz). */}
      {editable ? (
        <div style={{ margin: '4px 0 10px' }}>
          {s.ventas ? (
            <div style={{ background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 8, padding: '7px 11px', fontSize: 12, color: color.warningInk, marginBottom: 8 }}>
              ⚠ Esta solicitud ya tiene venta en GN. Los cambios acá <b>no ajustan GN</b> — reconciliá el stock a mano en Gestión Nube.
            </div>
          ) : null}
          {!agregando ? (
            <Button size="sm" variant="outline" onClick={() => setAgregando(true)}>+ Agregar producto</Button>
          ) : (
            <div style={{ border: `1px solid ${color.brandBorder}`, background: color.brandBg, borderRadius: 9, padding: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input autoFocus value={busqAgregar} onChange={(e) => setBusqAgregar(e.target.value)} placeholder="Buscar producto para agregar…" style={{ flex: 1, padding: '7px 9px', border: `1px solid ${color.line2}`, borderRadius: 7 }} />
                <Button size="sm" variant="outline" onClick={() => { setAgregando(false); setBusqAgregar('') }}>Cerrar</Button>
              </div>
              {busqAgregar.trim().length >= 2 ? (
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {buscarProductos(variantes, busqAgregar, new Set<string>()).slice(0, 20).map((r) => (
                    <div key={r.pid} style={{ background: '#fff', border: `1px solid ${color.line}`, borderRadius: 7, padding: '6px 9px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                        {r.vars.map((vv) => (
                          <button key={vv.vid} onClick={() => { const v = variantes.find((x) => x.id === vv.vid); if (v) onAgregarVariante(v) }} title={`Agregar ${vv.size}`} style={{ fontSize: 12, border: `1px solid ${color.brandBorder}`, background: '#fff', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                            + {vv.size} <span style={{ color: color.mut2 }}>({vv.stock})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 12, color: color.mut2 }}>Escribí al menos 2 letras.</div>}
            </div>
          )}
        </div>
      ) : null}

      {/* Bolsas (Fase C #3): resumen del armado por bolsa. Aparece si hay alguna asignada. */}
      {nBolsas > 0 ? (
        <div style={{ border: `1px solid ${color.brandBorder}`, borderRadius: 9, padding: '9px 12px', margin: '10px 0', background: color.brandBg }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: color.brand, marginBottom: 6 }}>
            Bolsas ({nBolsas})
            {hayOutfits ? <span style={{ fontWeight: 400, color: color.mut2 }}> · cada bolsa es un outfit: arriba + abajo, o una prenda entera</span> : null}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {grupos.map((g) => (
              <div key={g.n ?? 'sin'} style={{ border: `1px solid ${g.n != null ? color.brandBorder : color.line}`, background: '#fff', borderRadius: 8, padding: '6px 9px', minWidth: 150 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: g.n != null ? color.brand : color.mut2, marginBottom: 3 }}>
                  {g.n != null ? `Bolsa ${g.n}` : 'Sin bolsa'} <span style={{ fontWeight: 500, color: color.mut2 }}>· {g.totalU} u.</span>
                </div>
                {g.items.map((i) => (
                  <div key={i.vid} style={{ fontSize: 11, color: color.ink2, padding: '1px 0' }}>
                    • {i.nombre} · {i.variante} {i.qty > 1 ? `(x${i.qty})` : ''} <MarcaOrigen o={i.origen} soloIcono size={11} />
                    {hayOutfits && zonas[i.vid] ? <span style={{ color: color.mut2 }}> · {ROTULO_ZONA[zonas[i.vid] as ZonaPrenda]}</span> : null}
                  </div>
                ))}
                {/* El aviso, pegado a SU bolsa: leerlo en una lista aparte obliga a buscar cuál era. */}
                {g.n != null && alertasOutfit.some((a) => a.n === g.n) ? (
                  <div style={{ fontSize: 11, color: color.warningInk, background: color.warningBg, borderRadius: 5, padding: '2px 5px', marginTop: 4 }}>
                    {alertasOutfit.find((a) => a.n === g.n)?.texto}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {editable ? <div style={{ fontSize: 11, color: color.mut, marginTop: 6 }}>Asigná bolsas con el campo de bolsa de cada ítem (próxima libre: {proxBolsa}).</div> : null}
          {/* Lo que el sistema ⛔ NO pudo decir. Se muestra en vez de asumirlo: una prenda sin zona
              ⛔ no cuenta para el aviso, así que sin este renglón «no falta nada» podría ser
              «no sé nada». Los accesorios ⛔ no entran acá (`sinZona` los saca). */}
          {hayOutfits && aClasificar.length ? (
            <div style={{ fontSize: 11, color: color.warningInk, marginTop: 4 }}>
              {aClasificar.length === 1 ? 'Falta decir de qué zona es' : `Faltan clasificar ${aClasificar.length} prendas`}
              : {aClasificar.slice(0, 4).map((i) => i.nombre).join(' · ')}
              {aClasificar.length > 4 ? ` y ${aClasificar.length - 4} más` : ''}
              . Hasta que estén, el aviso de outfit incompleto ⛔ no las cuenta.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* La modelo y SU TALLE. Lo pidió Bruno el 3-sep-2026 para poder escribirlo después en la
          descripción del producto: es lo que la clienta pregunta antes de comprar y lo único de la
          sesión que, si no se anota en el momento, ya no se puede reconstruir.
          🔑 Se muestra desde que la sesión existe —⛔ no cuando ya salió algo, como el bloque de
          abajo—: la modelo se sabe al armarla, y el bloque también sirve para dejarla anotada. */}
      {esFotosDet ? <FichaModelo s={s} talles={tallesDeLaSesion} editable={editable} usuario={usuario} setWork={setWork} /> : null}

      {/* ¿Qué se fotografió? El RESULTADO de la sesión, que hasta el 24-ago-2026 no se registraba en
          ningún lado: una solicitud podía llegar a `cerrada` sin una sola foto sacada.
          🔴 Se muestra el «sin contestar» en vez de asumirlo: no saber si se fotografió no es lo
          mismo que saber que no. */}
      {preguntarFotos ? (
        <div style={{ border: `1px solid ${color.line}`, borderRadius: 9, padding: '10px 12px', margin: '10px 0', background: color.bg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{ fontWeight: 700 }}>
              ¿Qué se fotografió?{' '}
              <span style={{ fontWeight: 400, fontSize: 13, color: color.mut2 }}>
                {resFotos.si} sí · {resFotos.no} no ·{' '}
                <b style={{ color: resFotos.sinContestar ? color.warningInk : color.mut2 }}>{resFotos.sinContestar} sin contestar</b>
                {' '}de {resFotos.total}
              </span>
            </div>
            {editable && resFotos.sinContestar > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button size="sm" variant="outline" onClick={() => setWork((w) => contestarElResto(w, true, { por: usuario, ts: Date.now() }))}>
                  El resto sí ({resFotos.sinContestar})
                </Button>
              </div>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: color.mut2, marginBottom: 8 }}>
            Lo que no se fotografió sigue sin foto en la tienda, así que va a volver a aparecer en la cola.
            Marcarlo acá deja el registro de que ya se intentó, y por qué.
          </div>
          {fotografiables(s).map((i) => {
            const r = respuestaFoto(s, i.vid)
            const motivo = (s.fotos || {})[i.vid]?.motivo
            return (
              <div key={i.vid} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, padding: '3px 0', borderTop: `1px solid ${color.bg2}` }}>
                <span style={{ flex: 1, minWidth: 150 }}>
                  {i.nombre} · {i.variante}
                  {i.sku ? <span style={{ color: color.mut2 }}> · {i.sku}</span> : null}
                  {r === 'no' && motivo ? <span style={{ color: color.mut2 }}> — «{motivo}»</span> : null}
                </span>
                {editable ? (
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {/* Volver a apretar lo ya elegido lo devuelve a «sin contestar»: contestar por
                        error no puede ser irreversible. */}
                    <BotonMini
                      label="Sí"
                      acento={r === 'si'}
                      onClick={() => setWork((w) => conRespuestaFoto(w, i.vid, r === 'si' ? null : true, { por: usuario, ts: Date.now() }))}
                    />
                    <BotonMini
                      label="No"
                      acento={r === 'no'}
                      onClick={() => {
                        if (r === 'no') {
                          setWork((w) => conRespuestaFoto(w, i.vid, null, { por: usuario, ts: Date.now() }))
                          return
                        }
                        void (async () => {
                          const m = await pedirTexto(`¿Por qué no se pudo fotografiar "${i.nombre} · ${i.variante}"?`, '', {
                            titulo: 'No se fotografió',
                            placeholder: MOTIVOS_SIN_FOTO.join(' · '),
                            ok: 'Marcar',
                          })
                          if (m === null) return // cancelar no debe marcarlo
                          setWork((w) => conRespuestaFoto(w, i.vid, false, { por: usuario, motivo: m.trim(), ts: Date.now() }))
                        })()
                      }}
                    />
                  </span>
                ) : (
                  <span style={{ color: r === 'si' ? color.successInk : r === 'no' ? color.dangerInk : color.mut2, fontWeight: 600 }}>
                    {r === 'si' ? '✓ sí' : r === 'no' ? '✗ no' : 'sin contestar'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {!esConsumo && salio(s) && falt.length > 0 && (fase === 'devolucion' || (s.devuelto && Object.keys(s.devuelto).length > 0)) ? (
        <div style={{ border: `1px solid ${color.dangerBorder}`, background: color.dangerBg, borderRadius: 9, padding: '10px 12px', margin: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{ fontWeight: 700, color: color.dangerInk }}>Productos NO devueltos ({falt.reduce((a, f) => a + f.falta, 0)} u.)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Button size="sm" variant="solid" tone="success" onClick={() => correrSalida(() => enviarReporte(s), toast.error)}>
                Enviar a Marketing
              </Button>
              <Button size="sm" variant="outline" tone="danger" onClick={() => correrSalida(() => copiarReporte(s, () => toast.ok('Reporte copiado: pegalo en WhatsApp.')), toast.error)}>
                Copiar
              </Button>
              <Button size="sm" variant="solid" tone="neutral" onClick={() => correrSalida(() => reporteFaltantesPDF(s), toast.error)}>
                PDF
              </Button>
            </div>
          </div>
          {falt.map((f) => (
            <div key={f.vid} style={{ fontSize: 13, color: color.dangerInk, padding: '2px 0' }}>
              • {f.nombre} · {f.variante}
              {f.sku ? ` · ${f.sku}` : ''} — <b>faltan {f.falta} de {f.qty}</b> <MarcaOrigen o={f.origen} soloIcono size={11} />
            </div>
          ))}
        </div>
      ) : null}

      {/* Historial de cambios (Fase C). Fallback al panel viejo de "Quitados" para data sin `cambios`. */}
      {s.cambios && s.cambios.length > 0 ? (
        <div style={{ border: `1px dashed ${color.brandBorder}`, borderRadius: 9, padding: '9px 12px', marginTop: 6, background: color.brandBg }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: color.brand, marginBottom: 4 }}>Historial de cambios ({s.cambios.length})</div>
          {[...s.cambios].reverse().map((c, idx) => (
            <div key={idx} style={{ fontSize: 12, color: color.brand, padding: '1px 0' }}>
              • {fmtTs(c.ts)} · <b>{c.por || '—'}</b> {c.accion} {c.detalle}{c.motivo ? ` · "${c.motivo}"` : ''}
            </div>
          ))}
        </div>
      ) : s.eliminados && s.eliminados.length > 0 ? (
        <div style={{ border: `1px dashed ${color.dangerBorder}`, borderRadius: 9, padding: '9px 12px', marginTop: 6, background: color.dangerBg }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: color.dangerInk, marginBottom: 4 }}>
            Quitados de la solicitud ({s.eliminados.length})
          </div>
          {s.eliminados.map((e, idx) => (
            <div key={`${e.vid}-${idx}`} style={{ fontSize: 12, color: color.dangerInk }}>
              • {e.nombre} · {e.variante} ({e.qty}) — <MarcaOrigen o={e.origen} soloIcono size={11} /> · {e.fecha}
              {e.por ? ` · ${e.por}` : ''}
              {e.motivo ? ` · "${e.motivo}"` : ''}
            </div>
          ))}
        </div>
      ) : null}

      {pedirMotivo ? <MotivoModal titulo={pedirMotivo.titulo} onCancelar={() => setPedirMotivo(null)} onOk={pedirMotivo.onOk} /> : null}
    </div>
  )
}

/** Formatea un timestamp a "dd/mm HH:MM" (para el historial de cambios). */
function fmtTs(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Modal para elegir el motivo predefinido de un cambio (+ nota opcional). */
function MotivoModal({ titulo, onCancelar, onOk }: { titulo: string; onCancelar: () => void; onOk: (motivo: string) => void }) {
  const [nota, setNota] = useState('')
  const elegir = (m: string) => onOk(nota.trim() ? `${m} — ${nota.trim()}` : m)
  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 18, maxWidth: 420, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,.3)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{titulo}</div>
        <div style={{ fontSize: 12, color: color.mut2, marginBottom: 12 }}>Elegí el motivo del cambio (queda en el historial).</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {MOTIVOS_CAMBIO.map((m) => (
            <button key={m} onClick={() => elegir(m)} style={{ textAlign: 'left', fontSize: 13, fontWeight: 600, color: color.ink2, background: color.bg, border: `1px solid ${color.line}`, borderRadius: 8, padding: '9px 12px', cursor: 'pointer' }}>
              {m}
            </button>
          ))}
        </div>
        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${color.line2}`, borderRadius: 8, fontSize: 13, marginTop: 10 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Button size="sm" variant="outline" onClick={onCancelar}>Cancelar</Button>
        </div>
      </div>
    </div>
  )
}

// ── Vista combinada ─────────────────────────────────────────────────────────────

function Combinada({
  sols: sols0,
  prioridad,
  admin,
  persistir,
  mapaBc,
  catalogoListo,
  onVolver,
}: {
  sols: Solicitud[]
  prioridad: Origen
  admin: boolean
  persistir: Persistir
  mapaBc: Record<string, string>
  catalogoListo: boolean
  onVolver: () => void
}) {
  const [works, setWorks] = useState<Solicitud[]>(sols0)
  const [fase, setFase] = useState<Fase>('retiro')
  const [fb, setFb] = useState<{ key: string; r: ResultadoCombi } | null>(null)

  const persistTodas = useCallback(
    (ws: Solicitud[]) => persistir((l) => l.map((x) => ws.find((w) => w.id === x.id) ?? x)),
    [persistir],
  )
  useAutosave(works, sols0, persistTodas)

  const completa = faseCompletaCombi(works, fase)

  const nventa = (s: Solicitud) =>
    s.ventas
      ? (['deposito', 'local'] as Origen[]).filter((o) => s.ventas?.[o]).map((o) => `${ROTULO_ORIGEN[o]} N° ${NUM_VENTA(s.ventas![o]!)}`).join(' · ')
      : ''

  const onScan = (origen: Origen, code: string) => {
    if (!code.trim()) return
    const { sols: ns, resultado } = escanearCombi(works, origen, fase, code.trim(), mapaBc)
    setWorks(ns)
    setFb({ key: `combi-${origen}-${fase}`, r: resultado })
  }

  const grupo = (titulo: string, origen: Origen) => {
    const items = agregarCombinada(works, origen, fase)
    if (!items.length) return null
    const totQ = items.reduce((a, i) => a + i.ped, 0)
    const confTot = items.reduce((a, i) => a + i.conf, 0)
    const completo = confTot >= totQ
    const accionN = fase === 'devolucion' ? 'devueltos' : 'preparados'
    const accionV = fase === 'devolucion' ? 'la devolución' : 'el preparado'
    const fbKey = `combi-${origen}-${fase}`
    return (
      <div style={{ border: `1px solid ${completo ? color.successBorder : color.line}`, borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontWeight: 700 }}>
          {titulo} <span style={{ color: color.mut2, fontWeight: 500, fontSize: 12 }}>({confTot}/{totQ} {accionN})</span>
          {completo ? <span style={{ color: color.success, fontWeight: 700 }}> ✓ completo</span> : null}
        </div>
        <div style={{ margin: '8px 0' }}>
          <ScanInput
            disabled={!catalogoListo}
            placeholder={catalogoListo ? `Escaneá para confirmar ${accionV} de las ${works.length} (o tipeá el SKU + Enter)…` : 'Cargando catálogo…'}
            onScan={(v) => onScan(origen, v)}
          />
        </div>
        {fb && fb.key === fbKey ? <div style={{ fontSize: 13, marginBottom: 6 }}>{fbTextoCombi(fb.r)}</div> : null}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ fontSize: 11, color: color.mut2, textAlign: 'left' }}>
              <th style={{ padding: '3px 6px' }}>Producto</th>
              <th style={{ padding: '3px 6px' }}>Variante</th>
              <th style={{ padding: '3px 6px' }}>SKU</th>
              <th style={{ padding: '3px 6px', textAlign: 'right' }}>{fase === 'devolucion' ? 'Devuelto' : 'Preparado'}/Ped.</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i: ItemCombinado) => {
              const ok = i.conf >= i.ped
              return (
                <tr key={i.manual ? `m_${i.solId}_${i.vid}` : i.vid} style={ok ? { background: color.successBg } : undefined}>
                  <td style={{ padding: '3px 6px', borderTop: `1px solid ${color.bg2}` }}>
                    <MarcaOk ok={ok} /> {i.nombre}
                    {i.manual ? <EtiquetaMini texto="a mano" fg={color.brand} bg={color.brandBg} /> : null}
                  </td>
                  <td style={{ padding: '3px 6px', borderTop: `1px solid ${color.bg2}` }}>{i.variante}</td>
                  <td style={{ padding: '3px 6px', borderTop: `1px solid ${color.bg2}`, color: color.mut }}>{i.sku || '—'}</td>
                  <td style={{ padding: '3px 6px', borderTop: `1px solid ${color.bg2}`, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {i.manual && i.solId ? (
                      <>
                        <BotonMini label="−" onClick={() => setWorks((ws) => ws.map((s) => (s.id === i.solId ? ajustarManualSol(s, fase, i.vid, -1) : s)))} />
                        {' '}{i.conf}/{i.ped}{' '}
                        <BotonMini label="+" acento onClick={() => setWorks((ws) => ws.map((s) => (s.id === i.solId ? ajustarManualSol(s, fase, i.vid, 1) : s)))} />
                      </>
                    ) : (
                      <>{i.conf}/{i.ped}</>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <Button size="sm" variant="outline" onClick={onVolver}>
          ← Volver
        </Button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Vista combinada — {works.length} solicitudes</div>
      </div>
      <div style={{ border: `1px solid ${color.line}`, borderRadius: 9, padding: '9px 12px', marginBottom: 10, background: color.bg }}>
        {works.map((s) => (
          <div key={s.id} style={{ fontSize: 12, color: color.ink2 }}>
            • <b>{s.descripcion || '(sin descripción)'}</b> <span style={{ color: color.mut2 }}>· {s.fecha} · {s.estado}</span>
            {nventa(s) ? <span style={{ color: color.successInk }}> · {nventa(s)}</span> : null}
          </div>
        ))}
      </div>
      <Banner prioridad={prioridad} admin={admin} />
      {completa ? (
        <div style={{ background: color.successBg, border: `1px solid ${color.successBorder}`, borderRadius: 9, padding: '10px 12px', marginBottom: 10, fontSize: 13, color: color.successInk }}>
          {fase === 'devolucion' ? (
            <><b>Devolución completa</b> de las {works.length} solicitudes.</>
          ) : (
            <><b>Preparación completa</b> de las {works.length} solicitudes.</>
          )}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <BotonFase activo={fase === 'retiro'} onClick={() => { setFase('retiro'); setFb(null) }} label="Preparado" />
        <BotonFase activo={fase === 'devolucion'} onClick={() => { setFase('devolucion'); setFb(null) }} label="Devolución (al volver)" />
      </div>
      {grupo('Depósito (todas)', 'deposito')}
      {grupo('Local (todas)', 'local')}
    </div>
  )
}

// ── Armado de una solicitud nueva (draft) ──────────────────────────────────────

const nuevoId = () => 's' + Date.now() + '_' + Math.floor(Math.random() * 100000)
const nuevoMid = () => 'm' + Date.now() + '_' + Math.floor(Math.random() * 100000)
const hoyISO = () => new Date().toISOString().slice(0, 10)

function Draft({
  preset,
  prioridad,
  admin,
  usuario,
  persistir,
  mapaBc,
  catalogoListo,
  variantes,
  productos,
  desdePuente,
  alta,
  eventoId,
  onCancelar,
  onCreada,
}: {
  preset: PresetSolicitud
  prioridad: Origen
  admin: boolean
  usuario: string
  persistir: Persistir
  mapaBc: Record<string, string>
  catalogoListo: boolean
  variantes: Variante[]
  productos: Producto[]
  /** Ids de producto que llegan por el puente desde Marketing (borrador pre-cargado). */
  desdePuente?: SeleccionFotos | null
  /** Motivo + destino elegidos en Solicitudes al pedir el alta. */
  alta?: AltaSolicitud | null
  /**
   * De qué SESIÓN (evento) es hija esta solicitud, cuando se pidió desde adentro de una.
   * Ausente = solicitud suelta, que es como sale por «Nueva solicitud» y como quedó todo lo
   * anterior al 4-sep-2026. Ver `lib/sesionfotos/evento.ts`.
   */
  eventoId?: string | null
  onCancelar: () => void
  onCreada: (id: string) => void
}) {
  const { avisar } = useConfirmar()
  /**
   * Los motivos elegibles sin cambiar de cajón, más el actual si es uno viejo (el catálogo
   * cambió en la Fase 2: existían "Consumo" y "Prueba"). Sin ese agregado, abrir una
   * solicitud histórica le cambiaría el motivo solo por mirarla.
   */
  const motivosVisibles = (actual?: string) => {
    const propios = motivosDe(preset)
    return actual && !propios.includes(actual) ? [actual, ...propios] : propios
  }

  // Todo borrador nace con motivo y destino: son dos campos de la solicitud, no una capa
  // de "las internas". Si el alta vino de Solicitudes, arranca con lo que se eligió ahí.
  const draftInicial = () =>
    draftVacio(alta?.motivo || motivosDe(preset)[0] || MOTIVO_DEFAULT, alta?.tipo || DESTINO_DEFAULT, alta?.disparador ?? desdePuente?.disparador ?? null)
  // El tercer eje solo se pregunta en el cajón de fotos: una moldería o una muestra no
  // salen de un ingreso ni de un hueco del catálogo.
  const pideDisparador = preset.kind === PRESET_FOTOS.kind
  // Con puente (Marketing o la cola de fotos), arranca con esos productos expandidos y con las
  // variantes que la pantalla anterior ya eligió TILDADAS — el resto, sin tildar, como siempre.
  // Inicializador de useState: corre una sola vez.
  const [draft, setDraft] = useState<DraftT>(() =>
    desdePuente?.pids.length
      ? tildarVariantes(expandirProductos(draftInicial(), desdePuente.pids, variantes, productos), desdePuente.vids)
      : draftInicial(),
  )
  /**
   * Lo que se pidió y NO entró: variantes que la cola mandó y el borrador no pudo expandir. Debería
   * ser vacío —`cruzarParaSesion` ya filtra las que no tienen stock— y justamente por eso se
   * muestra: si aparece, es que las dos pantallas están mirando inventarios distintos, y eso hay
   * que verlo, no descubrirlo cuando la sesión sale corta.
   */
  const [faltaronDelPuente] = useState<string[]>(() =>
    desdePuente?.vids.length
      ? vidsAusentes(tildarVariantes(expandirProductos(draftInicial(), desdePuente.pids, variantes, productos), desdePuente.vids), desdePuente.vids)
      : [],
  )
  const [origenSel, setOrigenSel] = useState<Origen>(prioridad)
  const [busqueda, setBusqueda] = useState('')
  const [fbScan, setFbScan] = useState<ResultadoDraftScan | null>(null)
  const [manDesc, setManDesc] = useState('')
  const [manQty, setManQty] = useState('1')

  const total = totalDraft(draft)
  const yaEn = useMemo(() => new Set(draft.prods.map((p) => p.pid)), [draft])
  const resultados = useMemo(() => buscarProductos(variantes, busqueda, yaEn), [variantes, busqueda, yaEn])
  const vacio = draft.prods.length === 0 && draft.pendientes.length === 0 && draft.manuales.length === 0

  const onScan = (code: string) => {
    if (!code.trim()) return
    const { draft: nd, resultado } = escanearDraft(draft, code, mapaBc, variantes, origenSel, productos)
    setDraft(nd)
    setFbScan(resultado)
  }
  const addManual = () => {
    const desc = manDesc.trim()
    if (!desc) {
      void avisar('Escribí una descripción (ej. Remera estampa X).')
      return
    }
    setDraft((d) => agregarManual(d, nuevoMid(), desc, Math.max(1, parseInt(manQty) || 1)))
    setManDesc('')
    setManQty('1')
  }
  const procesar = () => {
    const sol = procesarDraft(draft, prioridad, { id: nuevoId(), fecha: hoyISO(), creado: Date.now(), creadoPor: usuario, ...(eventoId ? { eventoId } : {}) })
    if (!sol) {
      void avisar('Escaneá o tildá al menos un producto para procesar.')
      return
    }
    persistir((l) => [sol, ...l])
    onCreada(sol.id)
  }

  const chipOrigen = (o: Origen) => (
    <button
      key={o}
      onClick={() => setOrigenSel(o)}
      style={{
        border: `1px solid ${origenSel === o ? color.brandSolid : color.line2}`,
        background: origenSel === o ? color.brandSolid : '#fff',
        color: origenSel === o ? '#fff' : color.ink2,
        borderRadius: 8,
        padding: '5px 12px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <MarcaOrigen o={o} />
    </button>
  )

  return (
    <div>
      {faltaronDelPuente.length ? (
        <div style={{ background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 9, padding: '9px 12px', marginBottom: 10, fontSize: 13, color: color.warningInk }}>
          ⚠ <b>{faltaronDelPuente.length}</b> {faltaronDelPuente.length === 1 ? 'variante que se pidió no entró' : 'variantes que se pidieron no entraron'} al borrador
          (no aparecen con stock en Gestión Nube). Revisá que no falte nada antes de crear la solicitud.
        </div>
      ) : null}

      {/* Motivo (para qué sale) + destino (si vuelve). Dos ejes independientes: cualquier
          motivo puede tener cualquier destino — la foto de una remera vuelve, la de un
          vidrio templado no. Los dos botones están SIEMPRE visibles, con su explicación. */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: color.ink2, display: 'flex', alignItems: 'center', gap: 6 }}>
          Motivo
          <select
            value={draft.motivo || MOTIVO_DEFAULT}
            onChange={(e) => setDraft((d) => ({ ...d, motivo: e.target.value }))}
            style={{ padding: '7px 10px', border: `1px solid ${color.line2}`, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
          >
            {motivosVisibles(draft.motivo).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        {pideDisparador ? (
          <label style={{ fontSize: 13, color: color.ink2, display: 'flex', alignItems: 'center', gap: 6 }}>
            De dónde viene
            <select
              value={draft.disparador || ''}
              onChange={(e) => setDraft((d) => ({ ...d, disparador: (e.target.value || null) as Disparador | null }))}
              style={{ padding: '7px 10px', border: `1px solid ${color.line2}`, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              <option value="">— sin especificar —</option>
              {DISPARADORES.map((d) => <option key={d} value={d}>{DISPARADOR_LABEL[d]}</option>)}
            </select>
            {draft.disparador ? (
              <InfoPopover titulo={DISPARADOR_LABEL[draft.disparador]}>{DISPARADOR_AYUDA[draft.disparador]}</InfoPopover>
            ) : null}
          </label>
        ) : null}
        {/*
          🔑 **Lo que el origen decide dejó de ser sólo el filtro del historial** (29-ago-2026): al
          crear la sesión, sus pasos del manual se siembran en la Agenda de cada una, y de quién es
          el primero lo decide de dónde viene. Sin origen ⛔ no se siembra ninguno — y callarse eso
          sería que el que lo deja vacío crea que igual le van a caer.
        */}
        {pideDisparador ? (
          <span style={{ fontSize: 12, color: draft.disparador ? color.mut : color.warningInk, maxWidth: 340 }}>
            {draft.disparador
              ? 'Al crear la sesión, sus pasos caen en la Agenda de cada una.'
              : 'Sin esto la sesión se guarda igual, pero sus pasos ⛔ no caen en la Agenda: de quién es cada uno lo decide el origen.'}
          </span>
        ) : null}
        <span style={{ fontSize: 13, color: color.ink2 }}>Destino:</span>
        {(['retornable', 'consumo'] as TipoSol[]).map((t) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
              onClick={() => setDraft((d) => ({ ...d, tipo: t }))}
              style={{
                border: `1px solid ${draft.tipo === t ? color.brandSolid : color.line2}`,
                background: draft.tipo === t ? color.brandSolid : '#fff',
                color: draft.tipo === t ? '#fff' : color.ink2,
                borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {t === 'retornable' ? 'Retornable' : 'Consumo'}
            </button>
            <InfoPopover titulo={t === 'retornable' ? 'Retornable' : 'Consumo'}>{AYUDA_DESTINO[t]}</InfoPopover>
          </span>
        ))}
        {draft.tipo === 'consumo' ? <span style={{ fontSize: 12, color: color.warningInk }}>⚠ baja definitiva de stock · necesita aprobación</span> : null}
      </div>

      {/* Descripción — el "nombre" del pedido (arriba). */}
      <input
        value={draft.desc}
        onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))}
        placeholder={draft.motivo === 'Sesión de fotos' ? 'Descripción de la sesión (ej. Sesión otoño · jueves)' : '¿Para qué? (ej. molde falda otoño / video reel funda)'}
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: `1px solid ${color.line2}`, borderRadius: 8, fontSize: 14, marginBottom: 14 }}
      />

      {/* Agregar producto — la forma PRINCIPAL de pedir. */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: color.ink2, marginBottom: 6 }}>Agregar producto</div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          autoComplete="off"
          placeholder="Buscá por nombre o SKU y tocá el que querés…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: `1px solid ${color.line2}`, borderRadius: 8, fontSize: 14 }}
        />
        {busqueda.trim().length >= 2 && (
          <div style={{ marginTop: 4 }}>
            {resultados.length === 0 ? (
              <div style={{ fontSize: 12, color: color.mut2, padding: '4px 2px' }}>Sin resultados con stock.</div>
            ) : (
              <div style={{ border: `1px solid ${color.line}`, borderRadius: 8, maxHeight: 280, overflow: 'auto' }}>
                {resultados.map((r) => (
                  <div key={r.pid} style={{ padding: '7px 10px', borderTop: `1px solid ${color.bg2}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        {r.name}
                        {r.yaEsta ? <span style={{ color: color.success, fontSize: 11 }}> ✓ ya está</span> : null}
                      </span>
                      <button
                        onClick={() => setDraft((d) => traerProducto(d, r.pid, variantes, productos))}
                        style={{ border: `1px solid ${color.line2}`, background: '#fff', borderRadius: 7, padding: '2px 8px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Cargar producto
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                      {r.vars.map((v) => (
                        <button
                          key={v.vid}
                          onClick={() => setDraft((d) => traerVariante(d, r.pid, v.vid, variantes, productos))}
                          title={v.sku}
                          style={{ border: `1px solid ${color.brandBorder}`, background: color.brandBg, color: color.brand, borderRadius: 7, padding: '2px 8px', fontSize: 12, cursor: 'pointer' }}
                        >
                          {v.size} <span style={{ color: color.brand }}>({v.stock})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Escáner — secundario: para cuando ya separaste los productos físicamente. */}
      <div style={{ border: `1px solid ${color.line}`, background: color.bg, borderRadius: 9, padding: '9px 11px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: color.ink2 }}>¿Ya los separaste? Escaneálos</span>
          <InfoPopover titulo="Cargar por escáner">
            Si ya separaste los productos físicamente, escaneá el código de barras: se agregan solos con la ubicación elegida. Es una alternativa al buscador.
          </InfoPopover>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: color.mut }}>Sacás de:</span>
            {chipOrigen('deposito')}
            {chipOrigen('local')}
          </span>
        </div>
        <ScanInput
          disabled={!catalogoListo}
          placeholder={catalogoListo ? 'Escaneá el código de barras…' : 'Cargando catálogo…'}
          onScan={onScan}
        />
        <div style={{ fontSize: 13, marginTop: 8, minHeight: 18 }}>{fbScan ? fbDraft(fbScan) : null}</div>
      </div>

      {/* Producto sin código — alternativo (neutro, no protagonista, sin fondo violeta). */}
      <div style={{ border: `1px dashed ${color.line2}`, borderRadius: 9, padding: '9px 11px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
          <span style={{ fontWeight: 600, fontSize: 12.5, color: color.ink2 }}>¿No lo encontrás? Cargalo sin código</span>
          <InfoPopover titulo="Producto sin código de barra">
            Para prendas que todavía no tienen código de barras. No genera venta: solo se controla que salga y vuelva.
          </InfoPopover>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={manDesc}
            onChange={(e) => setManDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addManual()
              }
            }}
            placeholder="Descripción (ej. Remera estampa X)"
            style={{ flex: 1, minWidth: 200, padding: '7px 9px', border: `1px solid ${color.line2}`, borderRadius: 7 }}
          />
          <input
            type="number"
            min={1}
            value={manQty}
            onChange={(e) => setManQty(e.target.value)}
            title="Cantidad"
            style={{ width: 72, textAlign: 'center', padding: '7px 6px', border: `1px solid ${color.line2}`, borderRadius: 7 }}
          />
          <Button size="sm" variant="outline" onClick={addManual}>
            + Agregar
          </Button>
        </div>
      </div>

      {/* Agregados — lo que llevás pedido en esta sesión. */}
      <div style={{ fontSize: 13, fontWeight: 700, color: color.ink2, marginBottom: 6 }}>
        Agregados{total ? ` · ${total} u.` : ''}
      </div>
      {vacio ? (
        <div style={{ color: color.mut2, fontSize: 13, padding: '10px 0 4px' }}>
          Todavía no agregaste nada. Buscá un producto arriba para empezar a pedir.
        </div>
      ) : (
        <>
          {draft.prods.map((p) => (
            <div key={p.pid} style={{ border: `1px solid ${color.line}`, borderRadius: 9, padding: '9px 11px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                <button onClick={() => setDraft((d) => quitarProd(d, p.pid))} title="Sacar producto" style={{ border: 'none', background: 'none', color: color.mut2, cursor: 'pointer', fontSize: 15 }}>
                  ×
                </button>
              </div>
              <div style={{ marginTop: 4 }}>
                {p.variantes.length === 0 ? (
                  <span style={{ color: color.mut2, fontSize: 12 }}>sin variantes con stock</span>
                ) : (
                  p.variantes.map((v) => (
                    <label
                      key={v.vid}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', fontSize: 13, borderTop: `1px solid ${color.bg2}`, cursor: 'pointer', fontWeight: v.sel ? 600 : 400 }}
                    >
                      <input type="checkbox" checked={v.sel} onChange={(e) => setDraft((d) => toggleVar(d, p.pid, v.vid, e.target.checked))} style={{ flex: '0 0 auto' }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {v.size}
                        {v.origenManual ? <MarcaOrigen o={v.origenManual} soloIcono size={11} /> : null}{' '}
                        <span style={{ color: color.mut2, fontSize: 11, fontWeight: 400 }}>(stock {v.local + v.deposito}{v.sku ? ' · ' + v.sku : ''})</span>
                      </span>
                      {v.sel ? (
                        <input
                          type="number"
                          min={1}
                          value={v.qty}
                          onChange={(e) => setDraft((d) => setVarQty(d, p.pid, v.vid, e.target.value))}
                          title="Cantidad"
                          style={{ width: 56, textAlign: 'center', border: `1px solid ${color.line}`, borderRadius: 6, padding: '3px 4px', flex: '0 0 auto' }}
                        />
                      ) : null}
                    </label>
                  ))
                )}
              </div>
            </div>
          ))}

          {draft.pendientes.length > 0 && (
            <div style={{ border: `1px dashed ${color.warningBorder}`, background: color.warningBg, borderRadius: 9, padding: '9px 11px', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: color.warningInk, marginBottom: 4 }}>Nuevos escaneados (aún no en GN)</div>
              {draft.pendientes.map((pn) => (
                <div key={pn.barcode} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', borderTop: `1px solid ${color.warningBorder}` }}>
                  <span style={{ flex: 1, fontFamily: 'monospace' }}>
                    {pn.barcode} <MarcaOrigen o={pn.origenManual} soloIcono size={11} />
                  </span>
                  <span style={{ color: color.warningInk, fontWeight: 600 }}>x{pn.qty}</span>
                  <button onClick={() => setDraft((d) => quitarPendiente(d, pn.barcode))} title="Sacar (mal escaneo)" style={{ border: 'none', background: 'none', color: color.mut2, cursor: 'pointer', fontSize: 15 }}>
                    ×
                  </button>
                </div>
              ))}
              <div style={{ fontSize: 11, color: color.warningInk, marginTop: 4 }}>Se guardan por código de barras. Cuando el producto se cargue en GN, se vinculan solos.</div>
            </div>
          )}

          {draft.manuales.length > 0 && (
            <div style={{ border: `1px dashed ${color.brandBorder}`, background: color.brandBg, borderRadius: 9, padding: '9px 11px', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: color.brand, marginBottom: 4 }}>Sin código (control a mano)</div>
              {draft.manuales.map((m) => (
                <div key={m.mid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', borderTop: `1px solid ${color.brandBorder}` }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {m.desc} <MarcaOrigen o="deposito" soloIcono size={11} />
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={m.qty}
                    onChange={(e) => setDraft((d) => setManualQty(d, m.mid, e.target.value))}
                    title="Cantidad"
                    style={{ width: 56, textAlign: 'center', border: `1px solid ${color.brandBorder}`, borderRadius: 6, padding: '3px 4px', flex: '0 0 auto' }}
                  />
                  <button onClick={() => setDraft((d) => quitarManual(d, m.mid))} title="Sacar" style={{ border: 'none', background: 'none', color: color.mut2, cursor: 'pointer', fontSize: 15 }}>
                    ×
                  </button>
                </div>
              ))}
              <div style={{ fontSize: 11, color: color.brand, marginTop: 4 }}>No generan venta ni tocan stock. Se retiran de Depósito y se controla su devolución a mano.</div>
            </div>
          )}
        </>
      )}

      {/* Prioridad de retiro — config de lógica: abajo, sin color. */}
      <div style={{ fontSize: 12, color: color.mut, display: 'flex', alignItems: 'center', gap: 5, margin: '16px 0 12px' }}>
        Prioridad de retiro: <b style={{ color: color.ink2 }}>{prioridad === 'local' ? 'Local primero' : 'Depósito primero'}</b>
        <InfoPopover titulo="Prioridad de retiro">
          De dónde se retira cada producto: <b>{prioridad === 'local' ? 'Local primero' : 'Depósito primero'}</b> (si no hay stock, del otro depósito). Lo escaneado respeta la ubicación que elijas; lo agregado a mano se asigna solo.{admin ? ' Se configura al completar la migración.' : ''}
        </InfoPopover>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="solid" tone="brand" onClick={procesar} disabled={total === 0}>Procesar ({total} u.)</Button>
        <Button size="sm" variant="outline" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  )
}

/** Feedback de un escaneo en el borrador. */
function fbDraft(r: ResultadoDraftScan) {
  if (r.tipo === 'nuevo') {
    return (
      <span style={{ color: color.success }}>
        Nuevo (sin cargar): <b>{r.barcode}</b> (x{r.qty}) → <MarcaOrigen o={r.origen} />
      </span>
    )
  }
  return (
    <span style={{ color: color.success }}>
      ✓ Agregado: <b>{r.nombre}</b> · {r.size} (x{r.qty}) → <MarcaOrigen o={r.origen} />
    </span>
  )
}

// ── Helpers de UI ────────────────────────────────────────────────────────────────

/**
 * Origen de un ítem (Depósito / Local). Reemplaza a los 📦/🏪 que marcaban el sector
 * por toda la sección: los nombres de `Origen` coinciden con los del set de íconos,
 * y un ícono de trazo hereda el color de quien lo contiene (un emoji trae el suyo).
 */
const ROTULO_ORIGEN: Record<Origen, string> = { deposito: 'Depósito', local: 'Local' }

function MarcaOrigen({ o, soloIcono, size = 13 }: { o: Origen; soloIcono?: boolean; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }} title={ROTULO_ORIGEN[o]}>
      <Icono nombre={o} size={size} />
      {soloIcono ? null : ROTULO_ORIGEN[o]}
    </span>
  )
}

/** Casilla de "ya está preparado/devuelto" de las listas de escaneo (era ✅/⬜). */
function MarcaOk({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 15, height: 15, borderRadius: 4, flex: 'none', fontSize: 11, fontWeight: 700, lineHeight: 1,
        border: `1.5px solid ${ok ? color.success : color.line2}`,
        background: ok ? color.success : 'transparent',
        color: '#fff',
      }}
    >
      {ok ? '✓' : ''}
    </span>
  )
}

/** Feedback de un escaneo en el detalle. */
function fbTexto(r: ResultadoEscaneo) {
  if (r.tipo === 'no-encontrado') return <span style={{ color: color.danger }}>✗ &quot;{r.code}&quot; no está en esta lista (producto o talle equivocado).</span>
  if (r.tipo === 'ya-completo') return <span style={{ color: color.warning }}>⚠ {r.nombre} · {r.variante} ya estaba completo ({r.qty}).</span>
  return <span style={{ color: color.success }}>✓ {r.nombre} · {r.variante} ({r.done}/{r.qty})</span>
}

/** Feedback de un escaneo en la vista combinada. */
function fbTextoCombi(r: ResultadoCombi) {
  if (r.tipo === 'no-encontrado') return <span style={{ color: color.danger }}>✗ &quot;{r.code}&quot; no está en estas solicitudes (producto o talle equivocado).</span>
  if (r.tipo === 'ya-completo') return <span style={{ color: color.warning }}>⚠ {r.nombre} · {r.variante} ya está completo en las solicitudes.</span>
  return <span style={{ color: color.success }}>✓ {r.nombre} · {r.variante} ({r.done}/{r.qty})</span>
}

/** Input de escaneo: al Enter dispara onScan con el valor y limpia el campo. */
function ScanInput({ disabled, placeholder, onScan }: { disabled: boolean; placeholder: string; onScan: (v: string) => void }) {
  return (
    <input
      disabled={disabled}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          const v = e.currentTarget.value
          e.currentTarget.value = ''
          onScan(v)
        }
      }}
      style={{
        width: '100%',
        padding: '8px 10px',
        border: `2px solid ${disabled ? color.line : color.brandSolid}`,
        borderRadius: 8,
        fontSize: 14,
        boxSizing: 'border-box',
        background: disabled ? color.bg : '#fff',
      }}
    />
  )
}


function ResultadoFotos({ s }: { s: Solicitud }) {
  if (!hayQuePreguntar(s)) return null
  const r = resumenFotos(s)
  return (
    <div style={{ fontSize: 12, color: color.mut2 }}>
      📷 {r.si} de {r.total} fotografiadas
      {r.no ? <span style={{ color: color.dangerInk }}> · {r.no} no</span> : null}
      {r.sinContestar ? <span style={{ color: color.warningInk }}> · {r.sinContestar} sin contestar</span> : null}
    </div>
  )
}

function EtiquetaMini({ texto, fg, bg }: { texto: string; fg: string; bg: string }) {
  return (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: '0 6px', fontSize: 10, fontWeight: 600, marginLeft: 4 }}>
      {texto}
    </span>
  )
}

function BotonMini({ label, acento, onClick }: { label: string; acento?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${acento ? color.brand : color.brandBorder}`,
        background: acento ? color.brand : '#fff',
        color: acento ? '#fff' : color.brand,
        borderRadius: 6,
        width: 24,
        height: 24,
        lineHeight: 1,
        cursor: 'pointer',
        fontWeight: 700,
        verticalAlign: 'middle',
      }}
    >
      {label}
    </button>
  )
}

function BotonFase({ activo, onClick, label }: { activo: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${activo ? color.brandSolid : color.line2}`,
        background: activo ? color.brandSolid : '#fff',
        color: activo ? '#fff' : color.ink2,
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

/**
 * Copia el reporte al portapapeles. `onOk` lo pasa quien llama porque esto es una función
 * de módulo y no puede usar el hook del Toast; el fallback sigue siendo el `prompt()` del
 * navegador a propósito: es la única forma de que el texto quede seleccionable cuando el
 * portapapeles está bloqueado (pasa en iOS sin gesto del usuario).
 */
async function copiarReporte(s: Solicitud, onOk?: () => void) {
  const msg = textoReporteFaltantes(s)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(msg)
      onOk?.()
      return
    } catch {
      /* cae al prompt */
    }
  }
  prompt('Copiá el reporte:', msg)
}

/**
 * Enviar el reporte de no devueltos a Marketing: abre la hoja de compartir del sistema
 * (WhatsApp, mail, etc. en el cel); si no hay Web Share (escritorio), cae a copiar.
 */
/**
 * Comparte un texto por la hoja nativa del sistema (WhatsApp, mail, lo que haya). En escritorio
 * no existe, así que cae al portapapeles. Es lo único del monitor que llega al teléfono con la
 * pantalla cerrada — el badge del sidebar solo se enciende con la pestaña abierta.
 */
async function compartirTexto(titulo: string, msg: string, onOk?: () => void): Promise<void> {
  const nav = navigator as Navigator & { share?: (d: { title?: string; text: string }) => Promise<void> }
  if (nav.share) {
    try {
      await nav.share({ title: titulo, text: msg })
      return
    } catch (e) {
      if (e && (e as Error).name === 'AbortError') return // cerró la hoja de compartir
      /* si falla el share, cae a copiar */
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(msg)
      onOk?.()
      return
    } catch {
      /* cae al prompt */
    }
  }
  prompt('Copiá el texto:', msg)
}

async function enviarReporte(s: Solicitud) {
  await compartirTexto('Productos no devueltos', textoReporteFaltantes(s))
}
