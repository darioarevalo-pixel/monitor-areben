'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { useSesionFotos } from './useSesionFotos'
import { type HistorialSolicitudes, type ResultadoCrearGen } from '@/components/solicitudes/useHistorialSolicitudes'
import { AYUDA_DESTINO, DESTINO_DEFAULT, MOTIVO_DEFAULT, motivosDe, necesitaAprobacion, PRESET_FOTOS, type PresetSolicitud } from '@/components/solicitudes/preset'
import type { TipoSol } from '@/lib/sesionfotos/tipos'
import { guardarAdminPass, leerAdminPass } from '@/lib/sesion'
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
  textoReporteFaltantes,
} from '@/lib/sesionfotos/pdf'
import {
  agregarManual,
  buscarProductos,
  draftVacio,
  expandirProductos,
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
  contarBolsas,
  contarCerradas,
  maxBolsa,
  faltantes,
  filaHistorial,
  historialVisible,
  itemDeVariante,
  origenesConItems,
  retiradoDe,
  salio,
  sinItemSol,
  sinSolicitud,
} from '@/lib/sesionfotos/core'
import { MOTIVOS_CAMBIO } from '@/lib/sesionfotos/tipos'
import type { EstadoSolicitud, Fase, ItemSolicitud, Origen, Solicitud } from '@/lib/sesionfotos/tipos'
import { puedePedir, puedeRetirar } from '@/lib/solicitudes/overview'
import { imprimirTicket80 } from '@/lib/sesionfotos/ticket'
import { tomarAltaSolicitud, tomarPuenteFotos, tomarVerSolicitud, type AltaSolicitud } from '@/lib/sesionfotos/puente'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { color, useConfirmar, useToast } from '@/components/ui'

/** Una mutación pura de la lista de solicitudes; se aplica optimista y con merge. */
type Persistir = (mutar: (l: Solicitud[]) => Solicitud[]) => Promise<boolean>
type CrearVentasDe = (s: Solicitud, cred: { user: string; pass: string }) => Promise<ResultadoCrearGen>

const DISABLED_TITLE = 'Disponible al completar la migración de Sesión de fotos'

/** Contraseña del Monitor para las ventas: cacheada por el login, o se pide una vez. Port de _getAdminPass. */
function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (prompt('Ingresá tu contraseña del Monitor (te la pido una sola vez):') || '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

export function SesionFotos() {
  const { marca } = useSesion()
  const sf = useSesionFotos(marca)
  return <SolicitudesInner sf={sf} preset={PRESET_FOTOS} />
}

/**
 * El motor de UI compartido por Sesión de fotos y Solicitudes internas (convergencia
 * Fase B): recibe el hook ya llamado (por eso las dos entradas usan su propio hook sin
 * romper las reglas de hooks) + el `preset` que las distingue. Fotos = preset default;
 * internas pasa PRESET_INTERNAS.
 */
export function SolicitudesInner({ sf, preset }: { sf: HistorialSolicitudes<Solicitud>; preset: PresetSolicitud }) {
  const { marca } = useSesion()
  // allVariantes del ETL → mapa código-de-barras → vid para el escaneo. Se baja en
  // paralelo con el historial; hasta que esté, el escaneo va deshabilitado.
  const { datos } = useDatosMonitor()
  const mapaBc = useMemo(() => construirMapaBc(datos?.allVariantes ?? []), [datos])
  const catalogoListo = !!datos

  if (sf.error && !sf.data) {
    return (
      <div style={{ padding: 16, color: color.dangerInk, fontSize: 13 }}>
        No se pudo leer el historial de {preset.etiqueta}: {sf.error}
      </div>
    )
  }
  if (!sf.data) return <div style={{ padding: 16, color: color.mut2 }}>Cargando…</div>

  // key={marca}: al cambiar de cuenta, el estado de UI (qué solicitud se ve, la
  // selección) se resetea remontando, sin setState en effects.
  return (
    <Contenido
      key={marca}
      preset={preset}
      data={sf.data}
      prioridad={sf.prioridad}
      persistir={sf.persistir}
      crearVentasDe={sf.crearVentasDe}
      cerrarAnuladas={sf.cerrarAnuladas}
      mapaBc={mapaBc}
      catalogoListo={catalogoListo}
      variantes={datos?.allVariantes ?? []}
      productos={datos?.allProductos ?? []}
    />
  )
}

function Contenido({
  preset,
  data,
  prioridad,
  persistir,
  crearVentasDe,
  cerrarAnuladas,
  mapaBc,
  catalogoListo,
  variantes,
  productos,
}: {
  preset: PresetSolicitud
  data: Solicitud[]
  prioridad: Origen
  persistir: Persistir
  crearVentasDe: CrearVentasDe
  cerrarAnuladas: () => Promise<number>
  mapaBc: Record<string, string>
  catalogoListo: boolean
  variantes: Variante[]
  productos: Producto[]
}) {
  const { confirmar, avisar } = useConfirmar()
  const { marca, perfil } = useSesion()
  const admin = esAdmin(perfil)
  const puedeQuitar = admin || puedeSub(perfil, marca, preset.seccionKey, 'quitar-item')
  const puedeEditarDesc = admin || puedeSub(perfil, marca, preset.seccionKey, 'editar-desc')
  const puedeRetiroDep = puedeRetirar(perfil, 'deposito')
  const puedeRetiroLoc = puedeRetirar(perfil, 'local')

  // Puente desde Marketing: si venimos con una selección de productos, abrimos el
  // borrador ya pre-cargado. Se toma UNA vez al montar (tomar consume), en el
  // inicializador de estado para no dispararlo en cada render.
  const [pidsPuente] = useState<string[] | null>(() => tomarPuenteFotos())
  // Puente desde Inicio: si venimos a ver una solicitud puntual, abrimos su detalle.
  const [verInicial] = useState<string | null>(() => tomarVerSolicitud())
  // Puente desde Solicitudes: el alta ya eligió motivo + destino, así que el borrador se
  // abre solo y con eso puesto (si no, se elegiría el motivo dos veces).
  const [altaInicial] = useState<AltaSolicitud | null>(() => tomarAltaSolicitud())

  const [verCerradas, setVerCerradas] = useState(false)
  const [viendo, setViendo] = useState<string | null>(verInicial)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [combiIds, setCombiIds] = useState<string[] | null>(null)
  const [armando, setArmando] = useState(!!pidsPuente?.length || !!altaInicial)

  const solViendo = viendo ? data.find((s) => s.id === viendo) ?? null : null
  const solsCombi = combiIds ? combiIds.map((id) => data.find((s) => s.id === id)).filter((s): s is Solicitud => !!s) : null

  // Borrar una solicitud (desde el historial). Port de sfBorrar: guarda de "ya salió",
  // confirm, y limpia la selección / la vista si apuntaban a ella.
  const onBorrar = async (s: Solicitud) => {
    const bloqueo = bloqueoBorrado(s, admin)
    if (bloqueo) {
      await avisar({ titulo: 'No se puede borrar', mensaje: bloqueo })
      return
    }
    const ok = await confirmar({
      titulo: 'Eliminar del historial',
      tono: 'danger',
      ok: 'Eliminar',
      mensaje: `Se borra la solicitud "${s.descripcion || s.id}" del historial compartido. No hay papelera.`,
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
          pidsIniciales={pidsPuente}
          alta={altaInicial}
          onCancelar={() => setArmando(false)}
          onCreada={(id) => {
            setArmando(false)
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
      🏷️ <b>Prioridad de retiro:</b>{' '}
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
  const visibles = useMemo(() => historialVisible(data, verCerradas), [data, verCerradas])
  const [chequeando, setChequeando] = useState(false)
  // Consumos pendientes de aprobación (para el aprobador). Lo define el DESTINO de cada
  // solicitud, no la sección: una de sesión de fotos también puede ser consumo.
  const consumosPend = data.filter((s) => necesitaAprobacion(s) && s.estado === 'pendiente')
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
          <button className="btn-primary" onClick={onNueva}>
            + Nueva solicitud
          </button>
        )}
        {seleccion.size >= 2 ? (
          <button
            className="btn-sm"
            onClick={onVerCombinada}
            style={{ background: color.brandBg, border: `1px solid ${color.brandBorder}`, color: color.brand, fontWeight: 600 }}
          >
            🔗 Ver combinadas ({seleccion.size})
          </button>
        ) : seleccion.size === 1 ? (
          <span style={{ fontSize: 12, color: color.mut2 }}>Tildá otra solicitud para combinarlas.</span>
        ) : null}
        {admin && (
          <button
            className="btn-sm"
            onClick={verificarAnulaciones}
            disabled={chequeando}
            title="Consulta en GN si las ventas ya se anularon y cierra esas solicitudes"
            style={{ background: '#fff', border: `1px solid ${color.line2}` }}
          >
            {chequeando ? '⏳ verificando en GN…' : '🔄 Verificar anulaciones en GN'}
          </button>
        )}
        {cerradasN > 0 && (
          <label style={{ fontSize: 12, color: color.mut, marginLeft: 'auto', cursor: 'pointer' }}>
            <input type="checkbox" checked={verCerradas} onChange={(e) => onToggleCerradas(e.target.checked)} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Ver cerradas ({cerradasN})
          </label>
        )}
      </div>
      <div style={{ fontSize: 12, color: color.mut2, letterSpacing: 0, marginBottom: 6 }}>
        Historial
      </div>
      {visibles.length === 0 ? (
        <div style={{ color: color.mut2, fontSize: 13 }}>Todavía no hay solicitudes.</div>
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
                  {f.cerrada ? '✅ ' : ''}
                  {f.descripcion || '(sin descripción)'}
                  {f.porDevolver ? (
                    <span style={{ background: color.dangerBg, color: color.dangerInk, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
                      ⏳ {f.porDevolver} por devolver
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12, color: color.mut2 }}>
                  {f.fecha} · 📦 {f.dep} · 🏪 {f.loc} · {f.estado}
                </div>
              </div>
              <button className="btn-sm" onClick={() => onVer(s.id)} style={{ background: '#fff', border: `1px solid ${color.line2}` }}>
                Ver
              </button>
              {puedeQuitar && (
                <button onClick={() => onBorrar(s)} title="Eliminar solicitud" style={{ border: 'none', background: 'none', color: color.mut2, fontSize: 15, cursor: 'pointer' }}>
                  🗑
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

/** Alerta el mensaje de error de un PDF/clipboard (equivalente a los alert del legacy). */
async function correrSalida(fn: () => void | Promise<void>) {
  try {
    await fn()
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e))
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
  const conf = (it: ItemSolicitud) => Math.min(conteo[it.vid] || 0, it.qty)

  const dep = s.items.filter((i) => i.origen === 'deposito')
  const loc = s.items.filter((i) => i.origen === 'local')
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
    const pass = obtenerPass()
    if (!pass) {
      await avisar('Necesito tu contraseña para crear las ventas.')
      return
    }
    setCreando(true)
    try {
      const r = await crearVentasDe(work, { user: usuario, pass })
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
    conMotivo(`Quitar "${it.nombre} · ${it.variante}"`, (motivo) =>
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
    const totQ = arr.reduce((a, i) => a + i.qty, 0)
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
          <button className="btn-sm" onClick={() => correrSalida(() => reportePDF(s, origen))} style={{ background: color.ink, color: '#fff' }}>
            📄 Reporte
          </button>
        </div>
        <div style={{ margin: '8px 0' }}>
          <ScanInput
            disabled={!catalogoListo}
            placeholder={catalogoListo ? `🔫 Escaneá para confirmar ${accionV} (o tipeá el SKU + Enter)…` : 'Cargando catálogo…'}
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
              <th style={{ padding: '3px 6px', textAlign: 'right' }}>{fase === 'devolucion' ? 'Devuelto' : 'Preparado'}/Ped.</th>
              <th style={{ padding: '3px 6px' }} />
            </tr>
          </thead>
          <tbody>
            {arr.map((i) => {
              const c = conf(i)
              const ok = c >= i.qty
              return (
                <tr key={i.vid} style={ok ? { background: color.successBg } : undefined}>
                  <td style={{ padding: '3px 6px', borderTop: `1px solid ${color.bg2}` }}>
                    {ok ? '✅' : '⬜'} {i.nombre}
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
                        {' '}{c}/{i.qty}{' '}
                        <BotonMini label="+" acento onClick={() => setWork((w) => ajustarManualSol(w, fase, i.vid, 1))} />
                      </>
                    ) : (
                      <>{c}/{i.qty}</>
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
                      <span style={{ fontSize: 11, color: color.brand, marginRight: 6 }} title="Bolsa">👜{i.bolsa}</span>
                    ) : null}
                    {editable && !i.manual ? (
                      <button
                        onClick={() => { const n = prompt(`Nueva cantidad de "${i.nombre} · ${i.variante}":`, String(i.qty)); if (n != null) onCambiarQty(i, parseInt(n, 10)) }}
                        title="Cambiar cantidad"
                        style={{ border: 'none', background: 'none', color: color.brandSolid, fontSize: 13, cursor: 'pointer' }}
                      >
                        ✏
                      </button>
                    ) : null}
                    {editable ? (
                      <button onClick={() => onQuitarItem(i)} title="Quitar de la solicitud" style={{ border: 'none', background: 'none', color: color.danger, fontSize: 14, cursor: 'pointer' }}>
                        ✕
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
        <button className="btn-sm" onClick={onVolver} style={{ background: '#fff', border: `1px solid ${color.line2}` }}>
          ← Volver
        </button>
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
        <button className="btn-sm" onClick={() => correrSalida(() => etiquetaBolsa(s))} title="Etiqueta 5×2,5 cm para la bolsa (con la descripción)" style={{ background: '#fff', border: `1px solid ${color.line2}` }}>
          🏷️ Etiqueta de bolsa
        </button>
        <button className="btn-sm" onClick={() => correrSalida(() => imprimirTicket80(s))} title="Ticket 80 mm con el detalle de todos los productos pedidos" style={{ background: '#fff', border: `1px solid ${color.line2}` }}>
          🧾 Ticket 80mm
        </button>
        {nBolsas > 0 ? (
          <>
            <button className="btn-sm" onClick={() => correrSalida(() => etiquetasBolsas(s))} title="Una etiqueta 5×2,5 cm por bolsa (BOLSA n/N)" style={{ background: '#fff', border: `1px solid ${color.line2}` }}>
              🏷️ Etiquetas de bolsas ({nBolsas})
            </button>
            <button className="btn-sm" onClick={() => correrSalida(() => reporteBolsasPDF(s))} title="Reporte A4 agrupado por bolsa (armado/packing)" style={{ background: '#fff', border: `1px solid ${color.line2}` }}>
              📄 Reporte por bolsa
            </button>
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
            {esConsumo ? '🔥 Consumo (baja definitiva)' : '🔁 Retornable'}{s.motivo ? ` · ${s.motivo}` : ''}
          </span>
          {s.estado === 'rechazada' ? <span style={{ color: color.dangerInk }}>✗ Rechazada{s.rechazadoMotivo ? `: ${s.rechazadoMotivo}` : ''}</span> : null}
          {s.aprobadoPor && s.estado !== 'rechazada' && s.estado !== 'pendiente' ? <span style={{ color: color.success }}>✓ Aprobada por {s.aprobadoPor}</span> : null}
          {pendienteDeAprobar && esAprobador ? (
            <>
              <button className="btn-sm" onClick={onAprobar} style={{ background: color.success, color: '#fff' }}>✓ Aprobar</button>
              <button className="btn-sm" onClick={onRechazar} style={{ background: '#fff', color: color.dangerInk, border: `1px solid ${color.dangerBorder}` }}>✗ Rechazar</button>
            </>
          ) : pendienteDeAprobar ? (
            <span style={{ color: color.warningInk }}>⏳ Esperando aprobación de un gerente.</span>
          ) : null}
        </div>
      ) : null}

      {s.ventas ? (
        <div style={{ background: color.successBg, border: `1px solid ${color.successBorder}`, borderRadius: 9, padding: '9px 12px', marginBottom: 10, fontSize: 13 }}>
          <div>
            ✅ <b>Separado</b> en GN:{' '}
            {(['deposito', 'local'] as Origen[])
              .filter((o) => s.ventas?.[o] && origenVisible(o))
              .map((o) => `${o === 'deposito' ? '📦' : '🏪'} N° ${NUM_VENTA(s.ventas![o]!)}`)
              .join(' · ')}{' '}
            <span style={{ color: color.mut2, fontSize: 11 }}>Se separó el stock (no es retiro). Para anular, hacelo en GN.</span>
          </div>
          {/* Retiro físico por sector: local retira lo suyo, depósito lo suyo. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {origenesConItems(s).filter(origenVisible).map((o) => {
              const yaRet = retiradoDe(s, o)
              const et = o === 'deposito' ? '📦 Depósito' : '🏪 Local'
              return yaRet ? (
                <span key={o} style={{ fontSize: 12, fontWeight: 700, color: color.successInk, background: color.successBg, border: `1px solid ${color.successBorder}`, borderRadius: 7, padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  ✅ {et} retirado
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
          <button className="btn-primary" onClick={onCrearVentas} disabled={creando}>
            {creando ? '⏳ Separando en GN…' : esConsumo ? '🧾 Crear venta en GN (descontar)' : '🧾 Crear venta en GN (separar)'}
          </button>{' '}
          <span style={{ color: color.mut2, fontSize: 12 }}>{esConsumo ? 'Descuenta el stock (baja definitiva).' : 'Separa el stock con el cliente “Sesión de fotos” (no es retiro).'}</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <BotonFase activo={fase === 'retiro'} onClick={() => { setFase('retiro'); setFb(null) }} label="Preparado" />
        {!esConsumo && <BotonFase activo={fase === 'devolucion'} onClick={() => { setFase('devolucion'); setFb(null) }} label="Devolución (al volver)" />}
      </div>

      {origenVisible('deposito') && grupo('📦 Retirar de Depósito', dep, 'deposito')}
      {origenVisible('local') && grupo('🏪 Retirar de Local', loc, 'local')}

      {/* Edición (Fase C): agregar productos. Quitar/cambiar cantidad van por ítem (✏/✕). */}
      {editable ? (
        <div style={{ margin: '4px 0 10px' }}>
          {s.ventas ? (
            <div style={{ background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 8, padding: '7px 11px', fontSize: 12, color: color.warningInk, marginBottom: 8 }}>
              ⚠ Esta solicitud ya tiene venta en GN. Los cambios acá <b>no ajustan GN</b> — reconciliá el stock a mano en Gestión Nube.
            </div>
          ) : null}
          {!agregando ? (
            <button className="btn-sm" onClick={() => setAgregando(true)} style={{ background: '#fff', border: `1px solid ${color.line2}` }}>+ Agregar producto</button>
          ) : (
            <div style={{ border: `1px solid ${color.brandBorder}`, background: color.brandBg, borderRadius: 9, padding: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input autoFocus value={busqAgregar} onChange={(e) => setBusqAgregar(e.target.value)} placeholder="Buscar producto para agregar…" style={{ flex: 1, padding: '7px 9px', border: `1px solid ${color.line2}`, borderRadius: 7 }} />
                <button className="btn-sm" onClick={() => { setAgregando(false); setBusqAgregar('') }} style={{ background: '#fff', border: `1px solid ${color.line2}` }}>Cerrar</button>
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
          <div style={{ fontSize: 12, fontWeight: 700, color: color.brand, marginBottom: 6 }}>👜 Bolsas ({nBolsas})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {grupos.map((g) => (
              <div key={g.n ?? 'sin'} style={{ border: `1px solid ${g.n != null ? color.brandBorder : color.line}`, background: '#fff', borderRadius: 8, padding: '6px 9px', minWidth: 150 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: g.n != null ? color.brand : color.mut2, marginBottom: 3 }}>
                  {g.n != null ? `👜 Bolsa ${g.n}` : 'Sin bolsa'} <span style={{ fontWeight: 500, color: color.mut2 }}>· {g.totalU} u.</span>
                </div>
                {g.items.map((i) => (
                  <div key={i.vid} style={{ fontSize: 11, color: color.ink2, padding: '1px 0' }}>
                    • {i.nombre} · {i.variante} {i.qty > 1 ? `(x${i.qty})` : ''} {i.origen === 'local' ? '🏪' : '📦'}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {editable ? <div style={{ fontSize: 11, color: color.mut, marginTop: 6 }}>Asigná bolsas con el campo 👜 de cada ítem (próxima libre: {proxBolsa}).</div> : null}
        </div>
      ) : null}

      {!esConsumo && salio(s) && falt.length > 0 && (fase === 'devolucion' || (s.devuelto && Object.keys(s.devuelto).length > 0)) ? (
        <div style={{ border: `1px solid ${color.dangerBorder}`, background: color.dangerBg, borderRadius: 9, padding: '10px 12px', margin: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{ fontWeight: 700, color: color.dangerInk }}>📋 Productos NO devueltos ({falt.reduce((a, f) => a + f.falta, 0)} u.)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn-sm" onClick={() => correrSalida(() => enviarReporte(s))} style={{ background: color.success, color: '#fff' }}>
                📤 Enviar a Marketing
              </button>
              <button className="btn-sm" onClick={() => correrSalida(() => copiarReporte(s, () => toast.ok('Reporte copiado: pegalo en WhatsApp.')))} style={{ background: '#fff', border: `1px solid ${color.dangerBorder}`, color: color.dangerInk }}>
                📋 Copiar
              </button>
              <button className="btn-sm" onClick={() => correrSalida(() => reporteFaltantesPDF(s))} style={{ background: color.ink, color: '#fff' }}>
                📄 PDF
              </button>
            </div>
          </div>
          {falt.map((f) => (
            <div key={f.vid} style={{ fontSize: 13, color: color.dangerInk, padding: '2px 0' }}>
              • {f.nombre} · {f.variante}
              {f.sku ? ` · ${f.sku}` : ''} — <b>faltan {f.falta} de {f.qty}</b> {f.origen === 'local' ? '🏪' : '📦'}
            </div>
          ))}
        </div>
      ) : null}

      {/* Historial de cambios (Fase C). Fallback al panel viejo de "Quitados" para data sin `cambios`. */}
      {s.cambios && s.cambios.length > 0 ? (
        <div style={{ border: `1px dashed ${color.brandBorder}`, borderRadius: 9, padding: '9px 12px', marginTop: 6, background: color.brandBg }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: color.brand, marginBottom: 4 }}>📝 Historial de cambios ({s.cambios.length})</div>
          {[...s.cambios].reverse().map((c, idx) => (
            <div key={idx} style={{ fontSize: 12, color: color.brand, padding: '1px 0' }}>
              • {fmtTs(c.ts)} · <b>{c.por || '—'}</b> {c.accion} {c.detalle}{c.motivo ? ` · "${c.motivo}"` : ''}
            </div>
          ))}
        </div>
      ) : s.eliminados && s.eliminados.length > 0 ? (
        <div style={{ border: `1px dashed ${color.dangerBorder}`, borderRadius: 9, padding: '9px 12px', marginTop: 6, background: color.dangerBg }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: color.dangerInk, marginBottom: 4 }}>
            🗑️ Quitados de la solicitud ({s.eliminados.length})
          </div>
          {s.eliminados.map((e, idx) => (
            <div key={`${e.vid}-${idx}`} style={{ fontSize: 12, color: color.dangerInk }}>
              • {e.nombre} · {e.variante} ({e.qty}) — {e.origen === 'deposito' ? '📦' : '🏪'} · {e.fecha}
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
          <button className="btn-sm" onClick={onCancelar} style={{ background: '#fff', border: `1px solid ${color.line2}` }}>Cancelar</button>
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
      ? (['deposito', 'local'] as Origen[]).filter((o) => s.ventas?.[o]).map((o) => `${o === 'deposito' ? '📦' : '🏪'} N° ${NUM_VENTA(s.ventas![o]!)}`).join(' · ')
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
            placeholder={catalogoListo ? `🔫 Escaneá para confirmar ${accionV} de las ${works.length} (o tipeá el SKU + Enter)…` : 'Cargando catálogo…'}
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
                    {ok ? '✅' : '⬜'} {i.nombre}
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
        <button className="btn-sm" onClick={onVolver} style={{ background: '#fff', border: `1px solid ${color.line2}` }}>
          ← Volver
        </button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>🔗 Vista combinada — {works.length} solicitudes</div>
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
            <>✅ <b>Devolución completa</b> de las {works.length} solicitudes.</>
          ) : (
            <>✅ <b>Preparación completa</b> de las {works.length} solicitudes.</>
          )}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <BotonFase activo={fase === 'retiro'} onClick={() => { setFase('retiro'); setFb(null) }} label="Preparado" />
        <BotonFase activo={fase === 'devolucion'} onClick={() => { setFase('devolucion'); setFb(null) }} label="Devolución (al volver)" />
      </div>
      {grupo('📦 Depósito (todas)', 'deposito')}
      {grupo('🏪 Local (todas)', 'local')}
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
  pidsIniciales,
  alta,
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
  pidsIniciales?: string[] | null
  /** Motivo + destino elegidos en Solicitudes al pedir el alta. */
  alta?: AltaSolicitud | null
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
  const draftInicial = () => draftVacio(alta?.motivo || motivosDe(preset)[0] || MOTIVO_DEFAULT, alta?.tipo || DESTINO_DEFAULT)
  // Con puente desde Marketing, arranca con esos productos expandidos (variantes con
  // stock, sin tildar) — el mismo estado que "Traer producto" de a uno. Inicializador
  // de useState: corre una sola vez.
  const [draft, setDraft] = useState<DraftT>(() =>
    pidsIniciales?.length ? expandirProductos(draftInicial(), pidsIniciales, variantes, productos) : draftInicial(),
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
    const sol = procesarDraft(draft, prioridad, { id: nuevoId(), fecha: hoyISO(), creado: Date.now(), creadoPor: usuario })
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
      {o === 'deposito' ? '📦 Depósito' : '🏪 Local'}
    </button>
  )

  return (
    <div>
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
              {t === 'retornable' ? '🔁 Retornable' : '🔥 Consumo'}
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
                        Traer producto
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
          placeholder={catalogoListo ? '🔫 Escaneá el código de barras…' : 'Cargando catálogo…'}
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
          <button className="btn-sm" onClick={addManual} style={{ background: '#fff', color: color.ink2, border: `1px solid ${color.line2}` }}>
            + Agregar
          </button>
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
                <button onClick={() => setDraft((d) => quitarProd(d, p.pid))} title="Quitar producto" style={{ border: 'none', background: 'none', color: color.mut2, cursor: 'pointer', fontSize: 15 }}>
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
                        {v.origenManual ? <span title="Ubicación fijada por escaneo" style={{ fontSize: 11 }}> {v.origenManual === 'local' ? '🏪' : '📦'}</span> : null}{' '}
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
              <div style={{ fontWeight: 700, fontSize: 13, color: color.warningInk, marginBottom: 4 }}>🆕 Nuevos escaneados (aún no en GN)</div>
              {draft.pendientes.map((pn) => (
                <div key={pn.barcode} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', borderTop: `1px solid ${color.warningBorder}` }}>
                  <span style={{ flex: 1, fontFamily: 'monospace' }}>
                    {pn.barcode} <span style={{ fontSize: 11, fontFamily: 'inherit' }}>{pn.origenManual === 'local' ? '🏪' : '📦'}</span>
                  </span>
                  <span style={{ color: color.warningInk, fontWeight: 600 }}>x{pn.qty}</span>
                  <button onClick={() => setDraft((d) => quitarPendiente(d, pn.barcode))} title="Quitar (mal escaneo)" style={{ border: 'none', background: 'none', color: color.mut2, cursor: 'pointer', fontSize: 15 }}>
                    ×
                  </button>
                </div>
              ))}
              <div style={{ fontSize: 11, color: color.warningInk, marginTop: 4 }}>Se guardan por código de barras. Cuando el producto se cargue en GN, se vinculan solos.</div>
            </div>
          )}

          {draft.manuales.length > 0 && (
            <div style={{ border: `1px dashed ${color.brandBorder}`, background: color.brandBg, borderRadius: 9, padding: '9px 11px', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: color.brand, marginBottom: 4 }}>✍️ Sin código (control a mano)</div>
              {draft.manuales.map((m) => (
                <div key={m.mid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', borderTop: `1px solid ${color.brandBorder}` }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {m.desc} <span style={{ fontSize: 11 }} title="Sale de Depósito">📦</span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={m.qty}
                    onChange={(e) => setDraft((d) => setManualQty(d, m.mid, e.target.value))}
                    title="Cantidad"
                    style={{ width: 56, textAlign: 'center', border: `1px solid ${color.brandBorder}`, borderRadius: 6, padding: '3px 4px', flex: '0 0 auto' }}
                  />
                  <button onClick={() => setDraft((d) => quitarManual(d, m.mid))} title="Quitar" style={{ border: 'none', background: 'none', color: color.mut2, cursor: 'pointer', fontSize: 15 }}>
                    ×
                  </button>
                </div>
              ))}
              <div style={{ fontSize: 11, color: color.brand, marginTop: 4 }}>No generan venta ni tocan stock. Se retiran de 📦 Depósito y se controla su devolución a mano.</div>
            </div>
          )}
        </>
      )}

      {/* Prioridad de retiro — config de lógica: abajo, sin color. */}
      <div style={{ fontSize: 12, color: color.mut, display: 'flex', alignItems: 'center', gap: 5, margin: '16px 0 12px' }}>
        🏷️ Prioridad de retiro: <b style={{ color: color.ink2 }}>{prioridad === 'local' ? 'Local primero' : 'Depósito primero'}</b>
        <InfoPopover titulo="Prioridad de retiro">
          De dónde se retira cada producto: <b>{prioridad === 'local' ? 'Local primero' : 'Depósito primero'}</b> (si no hay stock, del otro depósito). Lo escaneado respeta la ubicación que elijas; lo agregado a mano se asigna solo.{admin ? ' Se configura al completar la migración.' : ''}
        </InfoPopover>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={procesar} disabled={total === 0}>✓ Procesar ({total} u.)</button>
        <button className="btn-sm" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

/** Feedback de un escaneo en el borrador. */
function fbDraft(r: ResultadoDraftScan) {
  if (r.tipo === 'nuevo') {
    return (
      <span style={{ color: color.success }}>
        🆕 Nuevo (sin cargar): <b>{r.barcode}</b> (x{r.qty}) → {r.origen === 'local' ? '🏪 Local' : '📦 Depósito'}
      </span>
    )
  }
  return (
    <span style={{ color: color.success }}>
      ✓ Agregado: <b>{r.nombre}</b> · {r.size} (x{r.qty}) → {r.origen === 'local' ? '🏪 Local' : '📦 Depósito'}
    </span>
  )
}

// ── Helpers de UI ────────────────────────────────────────────────────────────────

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
async function enviarReporte(s: Solicitud) {
  const msg = textoReporteFaltantes(s)
  const nav = navigator as Navigator & { share?: (d: { title?: string; text: string }) => Promise<void> }
  if (nav.share) {
    try {
      await nav.share({ title: 'Productos no devueltos', text: msg })
      return
    } catch (e) {
      if (e && (e as Error).name === 'AbortError') return // cerró la hoja de compartir
      /* si falla el share, cae a copiar */
    }
  }
  await copiarReporte(s)
}
