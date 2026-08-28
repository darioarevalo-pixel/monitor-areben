'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { color, font, radius, space, type Tone } from '@/components/ui/tokens'
import { TEMP_UI } from '@/components/crm/temperatura'
import { addDiasISO, diaHabil, PLAZOS_DIAS, siguienteTemperatura } from '@/lib/crm/core'
import { plazoEnPalabras, ritmoDeCompra } from '@/lib/crm/ritmo'
import {
  buscarClientesPorNombre,
  buscarFicha,
  guardarConRelectura,
  guardarLeadsConRelectura,
  vincularTelefono,
  type FichaPanel,
  type RespuestaPanel,
} from '@/lib/crm/panel'
import { armarFicha } from '@/lib/crm/panel'
import {
  agregarNota,
  cumplirPendiente,
  escribiHoy,
  hoyISO,
  NOTAS_RAPIDAS,
  setDespacho,
  setPagina,
  setPendiente,
  setProximoManual,
  setTemperatura,
  setTenerEnCuenta,
} from '@/lib/crm/seguimiento'
import {
  agregarNota as agregarNotaLead,
  escribiHoyLead,
  leadInstaHref,
  leadNuevo,
  leadsPorTelefono,
  LEAD_ESTADO_LABEL,
  nuevoIdLead,
  setCampo as setCampoLead,
  setEstado as setEstadoLead,
  setProximoManual as setProximoLead,
  leadEstadoSeg,
  type EstadoLead,
  type Lead,
  type MapaLeads,
} from '@/lib/crm/leads'
import { AgendaDelDia } from './AgendaDelDia'
import { indexarTelefonos, buscarPorTelefono, normalizeArgPhone } from '@/lib/crm/telefono.core.js'
import { guardarMapa, leerMapa } from '@/lib/kv/cliente'
import type { FilaCliente, FilaDetalle, MapaSeguimiento, MapaTelefonos, Nota } from '@/lib/crm/tipos'

/**
 * El panel que la extensión de Chrome pega al costado de WhatsApp Web.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * El 95% de la venta mayorista se hace escribiendo por WhatsApp desde la computadora. El CRM tiene
 * todo lo que hace falta para esa conversación —qué compró, cuándo, qué se le dijo la última vez—
 * pero vive en otra pestaña, así que en la práctica no se mira. Y al revés: lo que pasa en la
 * conversación (contestó, no contestó, pidió precio) no se anota **en ninguna parte**, porque
 * anotarlo cuesta cambiar de pantalla en medio de hablar con alguien.
 *
 * Este panel invierte el sentido: en vez de llevar del monitor a WhatsApp, trae el monitor adonde
 * ya se trabaja.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * CÓMO LLEGA ACÁ EL NÚMERO
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * La extensión (`extension/`) sólo mira qué chat está abierto y monta un iframe de ESTA ruta con
 * el teléfono adentro: `/panel/5493834270554`. No lee datos, no guarda nada y no tiene tokens.
 * Todo lo demás pasa acá, en el origen del monitor, con la sesión y los permisos de siempre.
 *
 * 🔴 **El seguimiento se sigue guardando con la disciplina de `lib/kv/cliente.ts`**: los 305
 * clientes viven en una sola clave que se reescribe entera, y `guardarConRelectura` la relee justo
 * antes de escribir porque este panel se queda abierto horas mientras la sección Clientes, en otra
 * pestaña, toca la misma clave.
 *
 * ⚠️ **La sesión del panel es aparte de la del monitor.** Adentro de un iframe de otro sitio,
 * Chrome le da al monitor un `localStorage` propio (particionado por el sitio de arriba), así que
 * la primera vez hay que entrar una vez más acá adentro. Después queda igual que en cualquier
 * pestaña.
 */

// ── Piezas chicas ────────────────────────────────────────────────────────────

const fmtMonto = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

function fmtFecha(d: string | null): string {
  if (!d) return '—'
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}` : '—'
}

const SEG_TXT: Record<string, string> = {
  nuevos: 'Nuevo',
  activos: 'Compra seguido',
  riesgo: 'Se está enfriando',
  dormidos: 'Dormido',
  otros: '',
}

/**
 * 🔴 **"¿Cómo te fue?" salió del panel el 24-ago-2026.** Los cuatro botones (contestó / no
 * contestó / pidió precio / no le interesa) eran el bloque más grande de la pantalla y estaban
 * arriba de todo.
 *
 * Lo dijo Bruno el primer día de uso, y el argumento es el que vale: **es post-contacto**. En el
 * momento en que le escribís todavía no sabés qué pasó, y volver más tarde al chat de cada uno
 * para marcarlo es exactamente el trabajo extra que hizo que el CRM viejo no se usara ("me costaba
 * el registro y el proceso"). Un botón que exige una segunda visita no se toca nunca.
 *
 * Y no se pierde nada hoy: el embudo de la Parte 9 (contactados → respondieron → compraron) no
 * existe en ninguna pantalla, así que el dato se juntaba sin que nadie lo leyera.
 *
 * ⚠️ **Lo guardado NO se borra** y `registrarContacto` sigue existiendo: el día que el embudo
 * exista, el camino bueno es que la extensión mire **si entró un mensaje después del nuestro** y
 * lo deduzca sola, sin preguntar nada. Eso está sin probar; el botón manual ya se probó y perdió.
 *
 * ⚠️ Con esto, lo único que marca "le escribí hoy" son los botones de **Volver a hablarle**, que
 * hacen las dos cosas: anotan el contacto y corren la fecha.
 */

/**
 * La fila de "en cuántos días", que reemplazó a los tres botones de frase completa.
 *
 * Bruno, después de un día de uso: *"me parece que funciona más el calendario, y necesito más
 * opciones de recontacto — mañana, 1 2 3, 7 15 21 y 30, que sea medio factor común para que no sea
 * grande esa sección"*. Tres botones que decían "En 1 semana" ocupaban tres renglones para dar tres
 * opciones; **siete números debajo de un título ocupan uno solo y dan siete**.
 *
 * ⚠️ **Cada fichita muestra en qué día cae**, y ya corrido al lunes si caía fin de semana. Un "15"
 * pelado obliga a hacer la cuenta de cabeza, que es justo lo que hacía que se usara el calendario.
 */
function Plazos({ guardando, onElegir }: { guardando: boolean; onElegir: (dias: number) => void }) {
  const hoy = hoyISO()
  return (
    <>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 4 }}>En cuántos días</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {PLAZOS_DIAS.map((d) => {
          const cae = diaHabil(addDiasISO(hoy, d))
          return (
            <button
              key={d}
              type="button"
              disabled={guardando}
              onClick={() => onElegir(d)}
              title={`${d === 1 ? 'Mañana' : `En ${d} días`} · ${diaYFecha(cae)}`}
              style={{
                minWidth: 34,
                padding: '4px 8px',
                fontSize: font.sm,
                fontWeight: 600,
                color: color.ink2,
                background: color.surface,
                border: `1px solid ${color.line2}`,
                borderRadius: radius.md,
                cursor: guardando ? 'not-allowed' : 'pointer',
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </>
  )
}

/**
 * Qué decir después de elegir una fecha en el calendario.
 *
 * 🔑 **Si la fecha se corrió, hay que decirlo.** El sábado elegido se guarda como lunes (ver
 * `diaHabil`); un cambio silencioso en el dato que se acaba de tocar es cómo se deja de creer en
 * la pantalla.
 */
function avisoFecha(elegida: string): string {
  if (!elegida) return 'Listo'
  const habil = diaHabil(elegida)
  return habil === elegida ? `Listo · ${diaYFecha(habil)}` : `Ese día es fin de semana: quedó el ${diaYFecha(habil)}`
}

/** "lun 1/9". El día de la semana es lo que hace entender un "en 15" sin contar con los dedos. */
function diaYFecha(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

/**
 * Los tres campos que se separaron de la nota, en el orden en que se miran al abrir un chat:
 * primero lo que hay que hacer, después con quién se está hablando, al final cómo se le manda.
 *
 * `corto` es la etiqueta del chip de "todavía no está cargado": en un panel de 350 px, "Pendiente
 * para la próxima" ocupa un renglón entero para decir que está vacío.
 */
const CAMPOS = [
  {
    k: 'pendiente' as const,
    icono: '⏳',
    titulo: 'Pendiente para la próxima',
    corto: 'Pendiente',
    ph: 'Qué quedó para la próxima vez…',
  },
  {
    k: 'tener_en_cuenta' as const,
    icono: '📌',
    titulo: 'Para tener en cuenta',
    corto: 'Tener en cuenta',
    ph: 'Cómo es este cliente: locales, con quién se habla, cuándo conviene escribirle…',
  },
  {
    k: 'despacho' as const,
    icono: '📦',
    titulo: 'Cómo se le manda',
    corto: 'Cómo se le manda',
    ph: 'Transporte, sucursal, a nombre de quién…',
  },
]

/**
 * Una sección del panel.
 *
 * Antes eran rayitas: bloques separados por una línea de 1 px sobre el mismo fondo, que en una
 * columna angosta se leen como un solo bloque largo. Ahora cada uno es una tarjeta sobre el fondo
 * gris, que es lo que hace que se vean las partes sin tener que leerlas.
 */
function Bloque({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: color.surface,
        border: `1px solid ${color.line}`,
        borderRadius: radius.lg,
        padding: `${space[2]}px ${space[3]}px ${space[3]}px`,
        margin: `0 ${space[2]}px ${space[2]}px`,
      }}
    >
      {titulo && (
        <div style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase', marginBottom: 6 }}>
          {titulo}
        </div>
      )}
      {children}
    </section>
  )
}

function Chip({ children, tone = 'neutro' }: { children: React.ReactNode; tone?: 'neutro' | 'ok' | 'alerta' }) {
  const c =
    tone === 'ok'
      ? { fg: color.successInk, bg: color.successBg, bd: color.successBorder }
      : tone === 'alerta'
        ? { fg: color.warningInk, bg: color.warningBg, bd: color.warningBorder }
        : { fg: color.mut, bg: color.bg2, bd: color.line }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

// ── El panel ─────────────────────────────────────────────────────────────────

type Estado =
  | { t: 'cargando' }
  | { t: 'error'; motivo: string }
  | { t: 'ficha'; ficha: FichaPanel; crudo: RespuestaPanel }
  | { t: 'desconocido' }
  | { t: 'varios'; candidatos: FilaCliente[] }
  /** El chat es de un prospecto ya cargado. Antes esto no existía y se ofrecía cargarlo de nuevo. */
  | { t: 'lead'; lead: Lead }
  | { t: 'varios-leads'; candidatos: Lead[] }

export function PanelWhatsApp({ tel: telInicial }: { tel: string | null }) {
  /**
   * 🔑 **Cambiar de chat NO recarga el panel.**
   *
   * Antes la extensión cambiaba el `src` del iframe en cada chat, o sea que por cada cliente se
   * volvían a bajar el bundle, la sesión y las 771 entradas del KV — segundos, cada vez, para
   * mostrar algo que sólo cambia de cliente. Ahora el contenedor manda el número por
   * `postMessage` y acá sólo cambia este estado: lo único que se pide es la ficha nueva.
   *
   * La URL sigue trayendo el primer número (`telInicial`), que es lo que hace que el panel
   * funcione también abierto a mano.
   */
  const [telChat, setTelChat] = useState<string | null>(telInicial)

  /**
   * A quién se pidió ver desde la lista del día, con su id.
   *
   * 🔑 **Pedir la ficha por id se saltea el cruce por teléfono** —el índice de 12.500 números que
   * el servidor arma y cachea— y, sobre todo, **no espera a que WhatsApp abra el chat**: el clic
   * dispara las dos cosas a la vez y la ficha suele estar antes que la conversación.
   */
  const [pedido, setPedido] = useState<{ id: number; tel: string } | null>(null)

  // Si la extensión sí recarga el iframe (primera carga, o el panel todavía no estaba listo), el
  // número nuevo llega por la URL. Va como ajuste durante el render, que es el patrón de React
  // para reaccionar a un cambio de props sin encadenar un render de más.
  const [telUrl, setTelUrl] = useState(telInicial)
  if (telInicial !== telUrl) {
    setTelUrl(telInicial)
    setTelChat(telInicial)
  }

  useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      // Sólo lo que manda el contenedor de la extensión. El origen no se puede verificar desde
      // acá (`chrome-extension://…` es opaco), así que se filtra por la firma del mensaje y por
      // que venga del padre — que es lo único que puede hablarle a este iframe.
      if (e.source !== window.parent) return
      const d = e.data
      if (!d || d.fuente !== 'bdi-crm-panel' || d.tipo !== 'chat') return
      const nuevo = String(d.tel || '') || null
      setTelChat(nuevo)
      // El chat lo abrió WhatsApp; si es el que se pidió desde la lista, la ficha ya está puesta.
      setPedido((p) => (p && normalizeArgPhone(p.tel) === normalizeArgPhone(nuevo || '') ? p : null))
    }
    window.addEventListener('message', alMensaje)
    /**
     * 🔴 **Preguntar al montar, y no sólo esperar el aviso.**
     *
     * El aviso de "cambió el chat" se manda una vez y no se reintenta: si llega mientras esta
     * pantalla todavía se está armando —que es lo normal la primera vez, con el bundle y la sesión
     * cargando—, **se pierde y no hay quien lo repita**. El síntoma es exactamente el que se vio:
     * la lista del día funciona, y la ficha dice "abrí el chat de una persona" con el chat abierto.
     *
     * Antes no pasaba porque el número venía en la URL del panel, así que estaba ahí desde el
     * primer render. Al dejar de recargar el iframe (que es lo que hizo rápido el cambio de chat)
     * se abrió este agujero.
     */
    try {
      window.parent.postMessage({ fuente: 'bdi-crm-panel', tipo: 'que-chat' }, '*')
    } catch {}
    return () => window.removeEventListener('message', alMensaje)
  }, [])

  return <PanelInterno tel={telChat} pedido={pedido} setPedido={setPedido} />
}

function PanelInterno({
  tel,
  pedido,
  setPedido,
}: {
  tel: string | null
  pedido: { id: number; tel: string } | null
  setPedido: (p: { id: number; tel: string } | null) => void
}) {
  const [estado, setEstado] = useState<Estado>({ t: 'cargando' })
  const [crmSeg, setCrmSeg] = useState<MapaSeguimiento>({})
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [today] = useState(() => new Date())
  /**
   * Qué se está mirando. Sin chat abierto arranca en la lista: es la pantalla con la que se
   * empieza el día, y un cartel diciendo "abrí un chat" no le sirve a nadie que todavía no sabe a
   * quién abrir. Con un chat abierto arranca en la ficha, que es a lo que se vino.
   */
  const [solapa, setSolapa] = useState<'cliente' | 'hoy'>(tel ? 'cliente' : 'hoy')
  /**
   * ¿Corre adentro del panel de la extensión? Estar embebido es la única forma de saberlo desde
   * acá: el contenedor es de otro origen (`chrome-extension://…`) y no se puede leer. Alcanza —lo
   * único que decide es si el clic en un nombre puede abrir un chat o no.
   *
   * Se mide una sola vez, al montar. No hay riesgo de desajuste con el HTML del servidor: la
   * página no llega a renderizar el panel hasta que resolvió la sesión, que es cosa del navegador.
   */
  const [enExtension] = useState(() => typeof window !== 'undefined' && window.parent !== window)

  // El teléfono normalizado es la identidad del chat: lo que llega de la URL puede venir con
  // cualquier forma y no se compara crudo con nada.
  const telNorm = useMemo(() => normalizeArgPhone(tel), [tel])


  // Al cambiar de chat se vuelve a la ficha: el chat cambió porque se eligió a alguien (desde la
  // lista o a mano en WhatsApp), y lo que se quiere ver de ese alguien es su ficha.
  //
  // Va como ajuste durante el render y no como efecto: es el patrón de React para reaccionar a un
  // cambio de props, y no encadena un render de más como sí lo haría un `setState` en un efecto.
  const [telSolapa, setTelSolapa] = useState(telNorm)
  if (telNorm && telNorm !== telSolapa) {
    setTelSolapa(telNorm)
    setSolapa('cliente')
  }

  const decir = useCallback((txt: string, mal?: boolean) => {
    setAviso({ txt, mal })
    window.setTimeout(() => setAviso(null), mal ? 8000 : 2500)
  }, [])

  // ── Carga ──────────────────────────────────────────────────────────────────
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  /**
   * 🔴 **El KV se lee SIEMPRE, haya chat o no.**
   *
   * Antes se leía adentro del efecto de la ficha, después del `if (!telNorm) return`. Mientras el
   * panel sólo mostraba la ficha del chat abierto eso alcanzaba; con la solapa "Hoy" dejó de
   * alcanzar y de la peor manera: sin chat abierto el mapa quedaba vacío, así que la lista del día
   * decía **"no hay nadie para contactar"** con 300 vencidos adentro. Un error que se lee como un
   * dato tranquilizador es peor que uno que se lee como error.
   */
  const kv = useRef<{ seg: MapaSeguimiento; tel: MapaTelefonos; leads: MapaLeads }>({ seg: {}, tel: {}, leads: {} })
  const [kvListo, setKvListo] = useState(false)

  useEffect(() => {
    let activo = true
    ;(async () => {
      // 🔑 Los leads se leen ACÁ, con los otros dos, y no cuando hacen falta: el chat de un
      // prospecto se abre igual de rápido que el de un cliente, y pedir el mapa recién en ese
      // momento agregaría una espera justo en la pantalla que existe para no esperar.
      const [seg, telKv, leadsKv] = await Promise.all([
        leerMapa<MapaSeguimiento[string]>('crmseg', 'bdi'),
        leerMapa<string>('crmtel', 'bdi'),
        leerMapa<MapaLeads[string]>('crmleads', 'bdi'),
      ])
      if (!activo) return
      kv.current = { seg: seg.ok ? seg.dato : {}, tel: telKv.ok ? telKv.dato : {}, leads: leadsKv.ok ? leadsKv.dato : {} }
      setCrmSeg(kv.current.seg)
      setKvListo(true)
    })()
    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    // Sin número no hay nada que buscar (pasa en los grupos y en la pantalla de bienvenida). El
    // cartel lo pone el render, no un setState acá adentro.
    //
    // Y sin el KV tampoco: la ficha se calcula CON el seguimiento (cadencia, notas, temperatura),
    // y sin él saldría dibujada en blanco y después parpadearía.
    if ((!telNorm && !pedido) || !kvListo) return
    let activo = true
    ;(async () => {
      setEstado({ t: 'cargando' })

      // ⚠️ El mapa se lee del ref y NO del estado a propósito: si este efecto dependiera de
      // `crmSeg`, cada guardado de seguimiento —que lo cambia— volvería a pedirle la ficha al
      // servidor, cuando `mutar` ya la recalcula sola con el mapa nuevo.
      const mapaSeg = kv.current.seg

      // Con id no hace falta cruzar por teléfono: se pide derecho. Es el camino de la lista del
      // día, y el que permite mostrar la ficha sin esperar a que WhatsApp termine de abrir el chat.
      const r = await buscarFicha(pedido ? { clienteId: pedido.id } : { tel: telNorm }, mapaSeg, today)
      if (!activo) return

      if (r.estado === 'encontrado') {
        setEstado({ t: 'ficha', ficha: r.ficha, crudo: r.crudo })
        return
      }
      if (r.estado === 'varios') {
        setEstado({ t: 'varios', candidatos: r.candidatos })
        return
      }
      if (r.estado === 'error') {
        setEstado({ t: 'error', motivo: r.motivo })
        return
      }

      // ⚠️ Segundo intento antes de darlo por desconocido: el mapa `crm:tel:bdi`.
      //
      // Son 653 teléfonos cargados a mano desde el Excel de Gestión Nube, y **no están en la tabla
      // `clientes`**: viven sólo en el KV, que el servidor no lee. Sin este paso, todos esos
      // clientes aparecerían como números nuevos y se ofrecería cargarlos como lead — o sea,
      // duplicarlos.
      const mapaTel: MapaTelefonos = kv.current.tel
      const idx = indexarTelefonos(Object.entries(mapaTel).map(([id, phone]) => ({ id, phone })))
      const { ids } = buscarPorTelefono(idx, telNorm)
      if (ids.length === 1) {
        const r2 = await buscarFicha({ clienteId: ids[0] }, mapaSeg, today)
        if (!activo) return
        if (r2.estado === 'encontrado') {
          setEstado({ t: 'ficha', ficha: r2.ficha, crudo: r2.crudo })
          return
        }
      }

      /**
       * 🔴 **Tercer intento: los leads.** Esto faltaba, y se pagaba dos veces: al volver al chat
       * de un prospecto ya cargado el panel lo daba por número nuevo **y ofrecía cargarlo otra
       * vez** (de ahí los 2 duplicados que había el 24-ago), y no había forma de ponerle fecha ni
       * nota desde el chat (25 de 31 activos sin ninguna fecha).
       *
       * Va al final a propósito: si la persona ya compró, la ficha de cliente dice más que la de
       * prospecto.
       */
      const enc = leadsPorTelefono(kv.current.leads, telNorm)
      if (enc.leads.length === 1) {
        setEstado({ t: 'lead', lead: enc.leads[0] })
        return
      }
      if (enc.leads.length > 1) {
        setEstado({ t: 'varios-leads', candidatos: enc.leads })
        return
      }

      setEstado({ t: 'desconocido' })
    })()
    return () => {
      activo = false
    }
  }, [telNorm, today, kvListo, pedido])

  // ── Guardado ───────────────────────────────────────────────────────────────

  /**
   * Toda edición pasa por acá: relee el mapa, aplica el cambio, lo persiste y **recalcula la
   * ficha** con el mapa nuevo. Recalcular no es cosmética: el próximo contacto y el estado del
   * seguimiento salen del mapa, así que sin esto el panel seguiría mostrando el estado viejo
   * después de haberlo guardado bien.
   */
  const mutar = useCallback(
    async (fn: (m: MapaSeguimiento) => MapaSeguimiento, exito: string): Promise<boolean> => {
      if (estado.t !== 'ficha' || guardando) return false
      setGuardando(true)
      const r = await guardarConRelectura(fn)
      if (!vivo.current) return false
      setGuardando(false)
      if (!r.ok) {
        decir('No se pudo guardar: ' + r.motivo, true)
        return false
      }
      kv.current = { ...kv.current, seg: r.mapa }
      setCrmSeg(r.mapa)
      // Recalcular con el mapa recién guardado, sin volver a pedirle nada al servidor: las ventas
      // y el padrón no cambiaron, lo que cambió es el seguimiento.
      setEstado({ t: 'ficha', ficha: armarFicha(estado.crudo, r.mapa, today), crudo: estado.crudo })
      decir(exito)
      return true
    },
    [estado, guardando, decir, today],
  )

  /**
   * Lo mismo para los leads. Es otra clave del KV (`crm:leads:bdi`) y otra pantalla, pero la
   * disciplina es idéntica: relee, aplica, persiste y **deja el lead nuevo a la vista**.
   *
   * ⚠️ Actualiza también `kv.current.leads`, que es de donde sale el cruce por teléfono. Sin eso,
   * cambiar de chat y volver mostraría el lead como estaba antes del cambio.
   */
  const mutarLead = useCallback(
    async (id: string, fn: (m: MapaLeads) => MapaLeads, exito: string): Promise<boolean> => {
      if (guardando) return false
      setGuardando(true)
      const r = await guardarLeadsConRelectura(fn)
      if (!vivo.current) return false
      setGuardando(false)
      if (!r.ok) {
        decir('No se pudo guardar: ' + r.motivo, true)
        return false
      }
      kv.current = { ...kv.current, leads: r.mapa }
      const actualizado = r.mapa[id]
      if (actualizado) setEstado({ t: 'lead', lead: actualizado })
      decir(exito)
      return true
    },
    [guardando, decir],
  )

  /**
   * Abrir el chat de alguien de la lista.
   *
   * ⚠️ **Esto no navega nada por su cuenta**: acá adentro corre el monitor en un iframe del side
   * panel de Chrome, que no puede tocar la pestaña de WhatsApp. Le pasa el teléfono al contenedor
   * (`sidepanel.js`) y la extensión navega. Fuera de la extensión no lo escucha nadie, y por eso
   * `AgendaDelDia` avisa cuando está en una pestaña común.
   */
  const abrirChat = (id: number, telefono: string) => {
    if (!telefono) return
    // Primero la ficha —es nuestra y sale ya— y después el chat, que lo abre WhatsApp y tarda lo
    // que tarde. Al revés se ve el panel en blanco mientras la conversación carga.
    setPedido({ id, tel: telefono })
    setSolapa('cliente')
    try {
      window.parent.postMessage({ fuente: 'bdi-crm-panel', tipo: 'abrir-chat', tel: telefono }, '*')
    } catch (_e) {
      decir('No pude abrir el chat desde acá.', true)
    }
  }

  const solapas = (
    <div style={{ display: 'flex', borderBottom: `1px solid ${color.line2}`, background: color.bg2 }}>
      {([
        ['cliente', 'Cliente'],
        ['hoy', 'Hoy'],
      ] as const).map(([k, txt]) => (
        <button
          key={k}
          type="button"
          onClick={() => setSolapa(k)}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: font.xs,
            fontWeight: 700,
            cursor: 'pointer',
            border: 0,
            borderBottom: `2px solid ${solapa === k ? color.brandSolid : 'transparent'}`,
            background: 'none',
            color: solapa === k ? color.brand : color.mut,
          }}
        >
          {txt}
        </button>
      ))}
    </div>
  )

  if (solapa === 'hoy')
    return (
      <Envoltorio aviso={aviso}>
        {solapas}
        {kvListo ? (
          <AgendaDelDia crmSeg={crmSeg} today={today} onAbrirChat={abrirChat} puedeAbrirChat={enExtension} />
        ) : (
          <Cargando />
        )}
      </Envoltorio>
    )

  if (!telNorm)
    return (
      <Envoltorio>
        {solapas}
        <Vacio texto="Abrí el chat de una persona para ver su ficha, o mirá la lista en “Hoy”." />
      </Envoltorio>
    )
  if (estado.t === 'cargando') return <Envoltorio>{solapas}<Cargando /></Envoltorio>
  if (estado.t === 'error')
    return (
      <Envoltorio>
        {solapas}
        <Vacio texto={estado.motivo} mal />
      </Envoltorio>
    )

  if (estado.t === 'varios')
    return (
      <Envoltorio>
        {solapas}
        <div style={{ padding: space[3] }}>
          <p style={{ fontSize: font.sm, color: color.ink2, marginTop: 0 }}>
            Ese teléfono figura en más de un cliente. ¿Cuál es?
          </p>
          {estado.candidatos.map((c) => (
            <Button
              key={c.id}
              variant="ghost"
              style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }}
              onClick={async () => {
                setEstado({ t: 'cargando' })
                const r = await buscarFicha({ clienteId: c.id }, crmSeg, today)
                if (!vivo.current) return
                if (r.estado === 'encontrado') setEstado({ t: 'ficha', ficha: r.ficha, crudo: r.crudo })
                else setEstado({ t: 'desconocido' })
              }}
            >
              {c.name || `#${c.id}`}
              <span style={{ color: color.mut2, fontSize: font.xs }}> · {c.city || 'sin ciudad'}</span>
            </Button>
          ))}
        </div>
      </Envoltorio>
    )

  if (estado.t === 'varios-leads')
    return (
      <Envoltorio aviso={aviso}>
        {solapas}
        <div style={{ padding: space[3] }}>
          <p style={{ fontSize: font.sm, color: color.ink2, marginTop: 0 }}>
            Ese teléfono está en más de un prospecto. ¿Cuál es?
          </p>
          {estado.candidatos.map((l) => (
            <Button
              key={l.id}
              variant="outline"
              fullWidth
              style={{ justifyContent: 'flex-start', marginBottom: 6 }}
              onClick={() => setEstado({ t: 'lead', lead: l })}
            >
              {l.nombre || 'sin nombre'}
              <span style={{ color: color.mut2, fontSize: font.xs }}> · {l.ciudad || 'sin ciudad'}</span>
            </Button>
          ))}
        </div>
      </Envoltorio>
    )

  if (estado.t === 'lead')
    return (
      <Envoltorio aviso={aviso}>
        {solapas}
        <FichaLead
          key={estado.lead.id}
          lead={estado.lead}
          today={today}
          guardando={guardando}
          onMutar={(fn, exito) => mutarLead(estado.lead.id, fn, exito)}
        />
      </Envoltorio>
    )

  if (estado.t === 'desconocido')
    return (
      <Envoltorio aviso={aviso}>
        {solapas}
        <NumeroNuevo
          tel={telNorm}
          onVinculado={async (cliente) => {
            // Se recarga la ficha por id: el número ya quedó guardado, pero el índice del servidor
            // se rearma cada 6 h, así que buscar por teléfono todavía no lo encontraría.
            setEstado({ t: 'cargando' })
            const r = await buscarFicha({ clienteId: cliente.id }, kv.current.seg, today)
            if (!vivo.current) return
            if (r.estado === 'encontrado') setEstado({ t: 'ficha', ficha: r.ficha, crudo: r.crudo })
            else setEstado({ t: 'desconocido' })
            decir(`Listo: este número ahora abre la ficha de ${cliente.name || 'ese cliente'}`)
          }}
          onGuardado={(lead) => {
            // 🔑 Se queda en la ficha del prospecto recién creado, no en un cartel de "listo".
            // Cargar el lead y agendarlo son el mismo momento de la conversación; mandarlo a otra
            // pantalla para la fecha es exactamente lo que hacía que los leads no se agendaran.
            kv.current = { ...kv.current, leads: { ...kv.current.leads, [lead.id]: lead } }
            setEstado({ t: 'lead', lead })
            decir('Guardado como lead')
          }}
          onError={(txt) => decir(txt, true)}
        />
      </Envoltorio>
    )

  // ── La ficha ───────────────────────────────────────────────────────────────
  const { cliente: c, compras, segmento, via } = estado.ficha
  const seg = crmSeg[String(c.id)] || {}
  const t = TEMP_UI[c.temperatura]
  const notas = c.notas || []
  // Las ventas ya están en la ficha: la sugerencia no le pide nada más al servidor.
  const ritmo = ritmoDeCompra(c.ventas || [], today)

  return (
    <Envoltorio aviso={aviso}>
      {solapas}
      <div style={{ paddingTop: space[2] }}>
        {/* Encabezado */}
        <Bloque>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, lineHeight: 1.2 }}>{c.name || `#${c.id}`}</div>
              <div style={{ fontSize: font.xs, color: color.mut2 }}>
                {c.city || 'sin ciudad'} · #{c.id}
              </div>
              {/*
                El Instagram, que hasta ahora sólo se podía ver y escribir desde la sección. Y es
                acá donde uno se entera de cuál es: lo tenés en la conversación, no en el CRM.
                Medido el 23-ago-2026: **91 de 771** lo tienen cargado.
              */}
              <Instagram
                valor={seg.pagina || ''}
                guardando={guardando}
                onGuardar={(v) => mutar((m) => setPagina(m, c.id, v), v ? 'Instagram guardado' : 'Instagram eliminado')}
              />
            </div>
            <button
              onClick={() => mutar((m) => setTemperatura(m, c.id, siguienteTemperatura(c.temperatura)), 'Listo')}
              title={`${t.txt} — ${t.ayuda}`}
              disabled={guardando}
              style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', border: `1px solid ${t.bd}`, background: t.bg, color: t.fg }}
            >
              {t.txt}
            </button>
          </div>

          {via === 'cola' && (
            <div style={{ marginTop: 6, fontSize: font.xs, color: color.warningInk, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: radius.sm, padding: '4px 8px' }}>
              El teléfono no coincide exacto con el de la ficha (difieren en el principio). Fijate que sea esta persona.
            </div>
          )}

          {/*
            Los números como números. Antes la etiqueta y el valor tenían casi el mismo tamaño, así
            que "Pedidos 12" se leía como una frase; lo que se mira de un vistazo es el 12.
          */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <Dato k="Pedidos" v={String(c.total_sales)} />
            <Dato k="Total" v={fmtMonto(c.total_amount)} />
            <Dato k="Último" v={c.dias_ultimo === null ? '—' : c.dias_ultimo === 0 ? 'hoy' : `hace ${c.dias_ultimo}d`} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {SEG_TXT[segmento] && <Chip tone={segmento === 'dormidos' || segmento === 'riesgo' ? 'alerta' : 'neutro'}>{SEG_TXT[segmento]}</Chip>}
            {c.proximo_contacto && (
              <Chip tone={c.dias_proximo !== null && c.dias_proximo < 0 ? 'alerta' : 'neutro'}>
                Volver a hablarle: {fmtFecha(c.proximo_contacto)}
              </Chip>
            )}
          </div>
        </Bloque>

        {/*
          Lo que hay que saber de esta persona, arriba de todo: es a lo que se vino. El `key` con el
          id del cliente es lo que hace que al cambiar de chat no quede abierto el editor del
          anterior —ni su borrador— sobre la ficha de otro.
        */}
        <Contexto
          key={c.id}
          seg={seg}
          guardando={guardando}
          onGuardar={(campo, valor) => {
            const setter = campo === 'pendiente' ? setPendiente : campo === 'despacho' ? setDespacho : setTenerEnCuenta
            mutar((m) => setter(m, c.id, valor), 'Guardado')
          }}
          onTachar={() => mutar((m) => cumplirPendiente(m, c.id, hoyISO()), 'Listo, queda en las notas')}
        />

        {/* Lo último que llevó */}
        <Bloque titulo="Lo último que llevó">
          {compras.ultima ? (
            <>
              <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 4 }}>{fmtFecha(compras.ultima.fecha)}</div>
              <ListaCompra items={compras.ultima.items} />
            </>
          ) : (
            <div style={{ fontSize: font.sm, color: color.mut2 }}>Todavía no le vendimos nada.</div>
          )}
        </Bloque>

        {/* Volver a hablarle */}
        <Bloque titulo="Volver a hablarle">
          {/*
            🔑 **La sugerencia sale de lo que el cliente ya hace, no de un campo.** Reemplaza a la
            cadencia, que había que cargar a mano y que en 0 de los 771 clientes decidía la fecha.
            Y lo que se muestra no es el promedio —que solo no dice nada— sino **cuánto falta**:
            "compra cada 22 días, la última fue hace 20" ⇒ le toca en 2.

            ⚠️ Sugiere y no decide: es un botón más, con el número puesto. Elige el que habla.
          */}
          {ritmo && (
            <div style={{ marginBottom: 8 }}>
              {/*
                ⚠️ **Cuando ya le toca NO hay botón, hay un dato.** Agendarlo para hoy lo dejaría
                en la lista de hoy después de haberle escrito, o sea que reaparecería mañana como
                si nada. Si ya está pasado, lo que hay que elegir es un plazo hacia adelante — y
                eso lo elige el que está hablando, con el dato a la vista.
              */}
              {ritmo.enDias > 0 && (
                <Button
                  size="sm"
                  variant="soft"
                  tone="brand"
                  fullWidth
                  disabled={guardando}
                  onClick={() => mutar((m) => escribiHoy(m, c.id, ritmo.enDias), 'Listo')}
                >
                  {plazoEnPalabras(ritmo.enDias)}
                </Button>
              )}
              <div style={{ fontSize: font.xs, color: color.mut2, marginTop: ritmo.enDias > 0 ? 4 : 0, textAlign: 'center' }}>
                {ritmo.enDias === 0 && <b style={{ color: color.warningInk }}>Ya le tocaba comprar. </b>}
                Compra cada {ritmo.cadaDias} {ritmo.cadaDias === 1 ? 'día' : 'días'} · la última fue hace{' '}
                {ritmo.desdeUltima === 0 ? 'nada' : ritmo.desdeUltima === 1 ? '1 día' : `${ritmo.desdeUltima} días`}
              </div>
            </div>
          )}
          <Plazos guardando={guardando} onElegir={(d) => mutar((m) => escribiHoy(m, c.id, d), `Listo · ${diaYFecha(diaHabil(addDiasISO(hoyISO(), d)))}`)} />
          {/* El calendario, ancho: es lo que más se usa. */}
          <input
            className="mo-input"
            type="date"
            value={c.proximo_contacto || ''}
            disabled={guardando}
            onChange={(e) => mutar((m) => setProximoManual(m, c.id, e.target.value), avisoFecha(e.target.value))}
            style={{ width: '100%', fontSize: font.sm }}
          />
        </Bloque>

        {/* Notas: la bitácora de lo que se hizo. Lo que hay que TENER EN CUENTA ya está arriba. */}
        <Notas
          key={`notas-${c.id}`}
          notas={notas}
          guardando={guardando}
          onGuardar={(texto) => mutar((m) => agregarNota(m, c.id, texto, hoyISO()), 'Nota guardada')}
        />

        <div style={{ padding: `0 ${space[3]}px ${space[3]}px` }}>
          <a href="/clientes" target="_blank" rel="noreferrer" style={{ fontSize: font.sm, color: color.brand, textDecoration: 'none' }}>
            Abrir la ficha completa ↗
          </a>
        </div>
      </div>
    </Envoltorio>
  )
}

/**
 * El Instagram del cliente: se ve si está, y si no está se carga de un toque.
 *
 * 🔑 **Se carga acá porque acá es donde uno se entera.** El dato aparece en la conversación —te lo
 * pasa el cliente, o lo ves en su perfil— y hasta ahora había que salir del chat, abrir el CRM y
 * buscar la ficha. Por eso lo tienen 91 de 771.
 *
 * Cargado se ve como enlace y abre su perfil. Vacío es un chip apagado, del mismo tamaño que los
 * de los tres campos de abajo: lo que falta se ofrece, no se reclama.
 *
 * ⚠️ Guarda al salir del cuadro, como todo lo demás del panel: cada guardado reescribe el mapa
 * entero del KV. Vaciarlo lo borra.
 */
function Instagram({
  valor,
  guardando,
  onGuardar,
}: {
  valor: string
  guardando: boolean
  onGuardar: (v: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const href = leadInstaHref(valor)

  if (editando)
    return (
      <input
        autoFocus
        className="mo-input"
        defaultValue={valor}
        placeholder="@usuario o link de su Instagram"
        disabled={guardando}
        onBlur={(e) => {
          const txt = e.target.value.trim()
          setEditando(false)
          if (txt !== valor.trim()) onGuardar(txt)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        style={{ width: '100%', fontSize: font.xs, marginTop: 3, height: 24 }}
      />
    )

  if (!valor)
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        disabled={guardando}
        title="Cargar el Instagram de este cliente"
        style={{
          marginTop: 3,
          fontSize: 11,
          color: color.mut2,
          background: 'transparent',
          border: `1px dashed ${color.line2}`,
          borderRadius: radius.pill,
          padding: '2px 8px',
          cursor: 'pointer',
        }}
      >
        + Instagram
      </button>
    )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: font.xs, color: color.brand, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {valor} ↗
      </a>
      <button
        type="button"
        onClick={() => setEditando(true)}
        disabled={guardando}
        title="Cambiarlo"
        style={{ background: 'none', border: 0, padding: 0, color: color.mut2, fontSize: 11, cursor: 'pointer' }}
      >
        cambiar
      </button>
    </div>
  )
}

/**
 * Los tres campos que se separaron de la nota.
 *
 * 🔑 **Lo que está cargado se ve; lo que no, es un chip chiquito.** Tres cuadros vacíos esperando
 * texto ocupan media pantalla para no decir nada, y la pantalla es la de un panel al costado de
 * WhatsApp. Así el panel arranca del tamaño de lo que se sabe del cliente y crece con el uso.
 *
 * ⚠️ **Se guarda en el BLUR, no por tecla.** Cada guardado POSTea el mapa entero de 133 KB con los
 * 744 clientes adentro: guardar mientras se escribe sería un POST por letra. Enter también guarda
 * (Shift+Enter hace renglón nuevo), que es la convención de WhatsApp y ya es la del cuadro de notas.
 * Para borrar un campo se vacía el cuadro: guardar vacío saca la clave.
 */
function Contexto({
  seg,
  guardando,
  onGuardar,
  onTachar,
}: {
  seg: MapaSeguimiento[string]
  guardando: boolean
  onGuardar: (campo: 'pendiente' | 'tener_en_cuenta' | 'despacho', valor: string) => void
  onTachar: () => void
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const valor = (k: (typeof CAMPOS)[number]['k']) => (seg[k] || '').trim()
  const llenos = CAMPOS.filter((x) => valor(x.k) || abierto === x.k)
  const vacios = CAMPOS.filter((x) => !valor(x.k) && abierto !== x.k)

  return (
    <Bloque>
      {llenos.map((campo) => (
        <div key={campo.k} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: font.xs, fontWeight: 700, color: color.mut2 }}>
              {campo.icono} {campo.titulo}
            </span>
            {campo.k === 'pendiente' && valor('pendiente') && abierto !== 'pendiente' && (
              <Button size="sm" variant="ghost" tone="success" disabled={guardando} title="Ya está hecho: lo saca de acá y lo deja anotado en las notas" onClick={onTachar}>
                ✓ Listo
              </Button>
            )}
          </div>
          {abierto === campo.k ? (
            <textarea
              autoFocus
              className="mo-input"
              rows={2}
              defaultValue={valor(campo.k)}
              placeholder={campo.ph}
              disabled={guardando}
              onBlur={(e) => {
                const txt = e.target.value.trim()
                setAbierto(null)
                if (txt !== valor(campo.k)) onGuardar(campo.k, txt)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
              style={{ width: '100%', fontSize: font.sm, resize: 'vertical', marginTop: 2 }}
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setAbierto(campo.k)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setAbierto(campo.k)
              }}
              title="Tocá para editar"
              style={{ fontSize: font.sm, color: color.ink, cursor: 'text', whiteSpace: 'pre-wrap', lineHeight: 1.35 }}
            >
              {valor(campo.k)}
            </div>
          )}
        </div>
      ))}

      {vacios.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: llenos.length ? 4 : 0 }}>
          {vacios.map((campo) => (
            <button
              key={campo.k}
              type="button"
              onClick={() => setAbierto(campo.k)}
              disabled={guardando}
              title={campo.ph}
              style={{
                fontSize: 11,
                color: color.mut2,
                background: 'transparent',
                border: `1px dashed ${color.line2}`,
                borderRadius: radius.pill,
                padding: '3px 9px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              + {campo.icono} {campo.corto}
            </button>
          ))}
        </div>
      )}
    </Bloque>
  )
}

/**
 * Lo último que llevó, cortado a 3 renglones.
 *
 * Un cliente grande se comía media pantalla con la lista de compras y empujaba abajo del borde lo
 * que sí se usa —los botones de registrar—, que es peor que no mostrarla: se ve la parte que no se
 * toca y hay que buscar la que sí.
 */
function ListaCompra({ items }: { items: FilaDetalle[] }) {
  const [todo, setTodo] = useState(false)
  const TOPE = 3
  const visibles = todo ? items : items.slice(0, TOPE)
  return (
    <>
      {visibles.map((d, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: font.sm, padding: '2px 0' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.quantity}× {d.product_name}
            {d.size ? ` (${d.size})` : ''}
          </span>
          <span style={{ color: color.mut, whiteSpace: 'nowrap' }}>{fmtMonto(parseFloat(String(d.unit_price)) || 0)}</span>
        </div>
      ))}
      {items.length > TOPE && (
        <button
          type="button"
          onClick={() => setTodo((v) => !v)}
          style={{ marginTop: 4, padding: 0, background: 'none', border: 0, color: color.brand, fontSize: font.xs, fontWeight: 600, cursor: 'pointer' }}
        >
          {todo ? 'Ver menos' : `Ver los ${items.length}`}
        </button>
      )}
    </>
  )
}

/**
 * La bitácora: lo que se hizo, con fecha.
 *
 * Los seis botones **escriben en el cuadro, no guardan solos** (`NOTAS_RAPIDAS`, la misma lista que
 * la ficha del CRM): casi siempre hay algo que agregarle al texto base, y una nota guardada de un
 * toque equivocado hay que ir a borrarla a la sección.
 *
 * Y se ve más de una: mostrar sólo la última es lo que enterraba las notas viejas. Las de arriba
 * ahora son los tres campos, así que esto es historial y se puede desplegar cuando hace falta.
 */
function Notas({ notas, guardando, onGuardar }: { notas: Nota[]; guardando: boolean; onGuardar: (texto: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState('')
  const [todo, setTodo] = useState(false)
  const caja = useRef<HTMLTextAreaElement>(null)
  const TOPE = 2
  const visibles = todo ? notas : notas.slice(0, TOPE)

  const guardar = async () => {
    const txt = texto.trim()
    if (!txt || guardando) return
    // ⚠️ El cuadro se vacía SÓLO si se guardó. Si el POST falla —el KV entero, 133 KB, se
    // reescribe en cada nota— lo escrito se queda ahí para volver a intentar; borrarlo igual
    // perdía la nota justo cuando el aviso dice que no se guardó.
    if (await onGuardar(txt)) setTexto('')
  }

  return (
    <Bloque titulo="Notas">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
        {NOTAS_RAPIDAS.map((t) => (
          <button
            key={t}
            type="button"
            disabled={guardando}
            onClick={() => {
              setTexto((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))
              caja.current?.focus()
            }}
            style={{
              fontSize: 11,
              color: color.ink2,
              background: color.bg2,
              border: `1px solid ${color.line}`,
              borderRadius: radius.pill,
              padding: '3px 9px',
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        ref={caja}
        className="mo-input"
        value={texto}
        disabled={guardando}
        placeholder="Qué hablaron… (Enter guarda)"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void guardar()
          }
        }}
        rows={2}
        style={{ width: '100%', fontSize: font.sm, resize: 'vertical' }}
      />
      <Button size="sm" variant="outline" disabled={guardando || !texto.trim()} style={{ marginTop: 6 }} onClick={guardar}>
        Guardar nota
      </Button>

      <div style={{ marginTop: 8 }}>
        {visibles.map((n, i) => (
          <div key={i} style={{ fontSize: font.sm, color: color.mut, padding: '3px 0' }}>
            <span style={{ color: color.mut2 }}>{fmtFecha(n.fecha)}: </span>
            {n.texto}
          </div>
        ))}
        {!notas.length && <div style={{ fontSize: font.sm, color: color.mut2 }}>Sin notas todavía.</div>}
        {notas.length > TOPE && (
          <button
            type="button"
            onClick={() => setTodo((v) => !v)}
            style={{ marginTop: 4, padding: 0, background: 'none', border: 0, color: color.brand, fontSize: font.xs, fontWeight: 600, cursor: 'pointer' }}
          >
            {todo ? 'Ver menos' : `Ver las ${notas.length}`}
          </button>
        )}
      </div>
    </Bloque>
  )
}

/** Un número del encabezado: el valor manda, la etiqueta acompaña. */
function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: color.bg2, borderRadius: radius.md, padding: '5px 8px' }}>
      <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
      <div style={{ fontSize: 10, color: color.mut2, textTransform: 'uppercase', letterSpacing: 0.3 }}>{k}</div>
    </div>
  )
}

function Envoltorio({ children, aviso }: { children: React.ReactNode; aviso?: { txt: string; mal?: boolean } | null }) {
  return (
    <div style={{ background: color.bg, color: color.ink, minHeight: '100vh', fontSize: font.sm, paddingBottom: space[3] }}>
      {aviso && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            padding: '6px 12px',
            fontSize: font.xs,
            fontWeight: 600,
            background: aviso.mal ? color.dangerBg : color.successBg,
            color: aviso.mal ? color.dangerInk : color.successInk,
            borderBottom: `1px solid ${aviso.mal ? color.dangerBorder : color.successBorder}`,
          }}
        >
          {aviso.txt}
        </div>
      )}
      {children}
    </div>
  )
}

function Cargando() {
  return <div style={{ padding: space[3], color: color.mut2, fontSize: font.sm }}>Buscando…</div>
}

function Vacio({ texto, mal }: { texto: string; mal?: boolean }) {
  return <div style={{ padding: space[3], color: mal ? color.danger : color.mut2, fontSize: font.sm }}>{texto}</div>
}

/**
 * La ficha de un prospecto ya cargado.
 *
 * 🔴 **No existía, y era un agujero con dos bocas.** Al volver al chat de un lead, el panel lo
 * daba por número nuevo y ofrecía **cargarlo de nuevo** (el 24-ago-2026 ya había 2 duplicados
 * hechos así), y no había manera de agendarlo ni de anotarle nada sin salir de WhatsApp — que es
 * justo lo que el panel existe para evitar. Medido el mismo día: **25 de 31 leads activos sin
 * ninguna fecha**.
 *
 * Tiene lo que hace falta para un prospecto y nada más: cuándo volver a hablarle, qué se habló, y
 * los dos desenlaces que cambian lo que el sistema hace con él (compró / no va). Lo que no tiene
 * es el resumen de compras, por el motivo obvio.
 */
function FichaLead({
  lead,
  today,
  guardando,
  onMutar,
}: {
  lead: Lead
  today: Date
  guardando: boolean
  onMutar: (fn: (m: MapaLeads) => MapaLeads, exito: string) => Promise<boolean>
}) {
  const seg = leadEstadoSeg(lead, today)
  const notas = Array.isArray(lead.notas) ? lead.notas : []

  return (
    <div style={{ paddingTop: space[2] }}>
      <Bloque>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, lineHeight: 1.2 }}>
              {lead.nombre || 'Sin nombre'}
            </div>
            <div style={{ fontSize: font.xs, color: color.mut2 }}>{lead.ciudad || 'sin ciudad'}</div>
            {/* Editable también acá: en un prospecto el Instagram es la mitad de lo que se sabe
                de él, y muchas veces llega después de haberlo cargado. */}
            <Instagram
              valor={lead.instagram || ''}
              guardando={guardando}
              onGuardar={(v) => onMutar((m) => setCampoLead(m, lead.id, 'instagram', v), v ? 'Instagram guardado' : 'Instagram eliminado')}
            />
          </div>
          <Chip tone={lead.estado === 'activo' ? 'neutro' : 'ok'}>{LEAD_ESTADO_LABEL[lead.estado]}</Chip>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Chip>Todavía no compró</Chip>
          {seg.proximo && (
            <Chip tone={seg.estado === 'vencido' ? 'alerta' : 'neutro'}>Volver a hablarle: {fmtFecha(seg.proximo)}</Chip>
          )}
          {!seg.proximo && <Chip tone="alerta">Sin agendar</Chip>}
        </div>
      </Bloque>

      <Bloque titulo="Volver a hablarle">
        <Plazos guardando={guardando} onElegir={(d) => onMutar((m) => escribiHoyLead(m, lead.id, d), `Listo · ${diaYFecha(diaHabil(addDiasISO(hoyISO(), d)))}`)} />
        <input
          className="mo-input"
          type="date"
          value={lead.proximo_manual || ''}
          disabled={guardando}
          onChange={(e) => onMutar((m) => setProximoLead(m, lead.id, e.target.value), avisoFecha(e.target.value))}
          style={{ width: '100%', fontSize: font.sm }}
        />
      </Bloque>

      <Notas
        notas={notas}
        guardando={guardando}
        onGuardar={(texto) => onMutar((m) => agregarNotaLead(m, lead.id, texto), 'Nota guardada')}
      />

      <Bloque titulo="¿En qué quedó?">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            ['comprado', '✓ Ya compró', 'success'],
            ['descartado', '✕ Este no va', 'danger'],
          ] as [EstadoLead, string, Tone][]).map(([est, txt, tone]) => (
            <Button
              key={est}
              size="sm"
              variant="outline"
              tone={tone}
              disabled={guardando || lead.estado === est}
              onClick={() => onMutar((m) => setEstadoLead(m, lead.id, est), 'Listo')}
            >
              {txt}
            </Button>
          ))}
          {lead.estado !== 'activo' && (
            <Button size="sm" variant="ghost" disabled={guardando} onClick={() => onMutar((m) => setEstadoLead(m, lead.id, 'activo'), 'Listo')}>
              Volver a activo
            </Button>
          )}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 6 }}>
          {/* Que "ya compró" NO lo convierte en cliente hay que decirlo: el que lo toca espera que
              la próxima vez aparezca la ficha con las compras, y eso pasa cuando la venta entra
              por Gestión Nube, no acá. */}
          Cuando la venta entre por Gestión Nube va a aparecer solo como cliente, con sus compras.
        </div>
      </Bloque>

      <div style={{ padding: `0 ${space[3]}px ${space[3]}px` }}>
        <a href="/clientes" target="_blank" rel="noreferrer" style={{ fontSize: font.sm, color: color.brand, textDecoration: 'none' }}>
          Verlo en Leads ↗
        </a>
      </div>
    </div>
  )
}

// ── Número desconocido: o es un cliente que ya existe, o es un prospecto nuevo ───────────────

/**
 * Qué hacer con un número que no está.
 *
 * 🔴 **Antes acá había un solo camino: guardarlo como lead.** Y el caso más común no es ése — es
 * **un cliente que cambió de número**. Ofrecerle "guardar como lead" a alguien que ya te compró 8
 * veces es crear un prospecto duplicado de un cliente, y la ficha con sus compras sigue sin
 * aparecer. La única salida real era cambiarlo en Gestión Nube, que el monitor trae recién a la
 * madrugada siguiente: en el momento de la conversación, no servía.
 *
 * 🔑 **Enganchar el número NO pisa el viejo.** El nuevo se guarda en `crm:tel` y el que tenga
 * Gestión Nube sigue en el padrón; el panel mira el padrón primero y `crm:tel` después, así que
 * después de enganchar **los dos números abren la misma ficha**.
 *
 * También sirve para los **66 clientes del CRM que no tienen ningún teléfono cargado**: la primera
 * vez que escriben, quedan enganchados.
 */
function NumeroNuevo({
  tel,
  onVinculado,
  onGuardado,
  onError,
}: {
  tel: string
  onVinculado: (cliente: FilaCliente) => void
  onGuardado: (lead: Lead) => void
  onError: (t: string) => void
}) {
  const [camino, setCamino] = useState<'elegir' | 'cliente' | 'lead'>('elegir')

  if (camino === 'lead') return <NuevoLead tel={tel} onGuardado={onGuardado} onError={onError} onVolver={() => setCamino('elegir')} />
  if (camino === 'cliente')
    return <VincularCliente tel={tel} onVinculado={onVinculado} onError={onError} onVolver={() => setCamino('elegir')} />

  return (
    <div style={{ padding: space[3] }}>
      <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>Número nuevo</div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 12 }}>{tel} · no está en el CRM</div>

      <Button variant="outline" fullWidth style={{ marginBottom: 8, justifyContent: 'flex-start' }} onClick={() => setCamino('cliente')}>
        Ya es cliente mío, cambió de número
      </Button>
      <Button variant="outline" fullWidth style={{ justifyContent: 'flex-start' }} onClick={() => setCamino('lead')}>
        Es alguien nuevo, guardarlo como lead
      </Button>
    </div>
  )
}

/**
 * Buscar al cliente por nombre y engancharle este número.
 *
 * La búsqueda va contra el servidor y **sólo entre los clientes del CRM**: el padrón tiene 14.131
 * personas, que son todas las que pasaron por el local, y ninguna de ésas es a quien se está
 * buscando.
 */
function VincularCliente({
  tel,
  onVinculado,
  onError,
  onVolver,
}: {
  tel: string
  onVinculado: (cliente: FilaCliente) => void
  onError: (t: string) => void
  onVolver: () => void
}) {
  const [q, setQ] = useState('')
  /** Lo último que contestó el servidor, CON la consulta que lo pidió. */
  const [resultados, setResultados] = useState<{ q: string; filas: FilaCliente[] } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const texto = q.trim()
  const corto = texto.length < 2

  /**
   * Se busca al soltar la tecla un momento, no en cada letra: cada búsqueda es una consulta al
   * servidor y escribir "Nicolás" son siete.
   *
   * 🔑 **La respuesta viaja con la consulta que la pidió.** Dos búsquedas seguidas pueden volver
   * en cualquier orden: sin eso, la lista de "Nico" puede quedar dibujada abajo de "Nicolás".
   */
  useEffect(() => {
    if (corto) return
    let activo = true
    const t = window.setTimeout(async () => {
      const filas = await buscarClientesPorNombre(texto)
      if (activo) setResultados({ q: texto, filas })
    }, 300)
    return () => {
      activo = false
      window.clearTimeout(t)
    }
  }, [texto, corto])

  const alDia = resultados && resultados.q === texto ? resultados.filas : null

  const enganchar = async (c: FilaCliente) => {
    if (guardando) return
    setGuardando(true)
    const r = await vincularTelefono(c.id, tel)
    setGuardando(false)
    if (!r.ok) {
      onError('No se pudo guardar: ' + r.motivo)
      return
    }
    onVinculado(c)
  }

  return (
    <div style={{ padding: space[3] }}>
      <button
        type="button"
        onClick={onVolver}
        style={{ background: 'none', border: 0, padding: 0, color: color.brand, fontSize: font.xs, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}
      >
        ← Volver
      </button>
      <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>¿Quién es?</div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 10 }}>
        Buscalo por nombre y {tel} va a abrir su ficha de ahora en más. El número que tenga cargado sigue funcionando igual.
      </div>

      <input
        className="mo-input"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nombre del cliente o del local"
        style={{ width: '100%', marginBottom: 8 }}
      />

      {!corto && !alDia && <div style={{ fontSize: font.sm, color: color.mut2 }}>Buscando…</div>}
      {alDia && !alDia.length && (
        <div style={{ fontSize: font.sm, color: color.mut2 }}>Ninguno con ese nombre entre los clientes del CRM.</div>
      )}
      {(alDia || []).map((c) => (
          <Button
            key={c.id}
            variant="outline"
            fullWidth
            disabled={guardando}
            style={{ justifyContent: 'flex-start', marginBottom: 6, textAlign: 'left' }}
            onClick={() => enganchar(c)}
          >
            <span>
              {c.name || `#${c.id}`}
              <span style={{ color: color.mut2, fontSize: font.xs }}> · {c.city || 'sin ciudad'}</span>
            </span>
          </Button>
      ))}
    </div>
  )
}

// ── Número desconocido → lead ────────────────────────────────────────────────

/**
 * El formulario de lead.
 *
 * Es la mitad que hoy no se hace: cargar un prospecto cuesta cambiar de pantalla en medio de la
 * conversación, así que no se carga y el número se pierde. Acá el teléfono ya está puesto —es el
 * del chat— y lo único que hay que escribir es el nombre.
 *
 * Escribe en `crm:leads:bdi`, con la misma disciplina que la pestaña Leads: se lee primero y sin
 * lectura buena no se guarda, porque el POST reescribe el mapa entero.
 */
function NuevoLead({
  tel,
  onGuardado,
  onError,
  onVolver,
}: {
  tel: string
  onGuardado: (lead: Lead) => void
  onError: (t: string) => void
  onVolver: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [instagram, setInstagram] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    if (!nombre.trim() || guardando) return
    setGuardando(true)
    const previo = await leerMapa<Lead>('crmleads', 'bdi')
    if (!previo.ok) {
      setGuardando(false)
      onError('No se pudo leer los leads, así que no se guarda: guardar ahora eliminaría los que hay.')
      return
    }
    const id = nuevoIdLead(Date.now(), Math.random())
    // Sin fecha: se elige en la ficha, que es donde cae al guardar. "Eso lo elijo yo al momento
    // de ver si está frío o caliente" — y en el alta todavía no se sabe.
    const lead: Lead = { ...leadNuevo(id), nombre: nombre.trim(), telefono: tel, ciudad: ciudad.trim(), instagram: instagram.trim() }
    const mapa: MapaLeads = { ...previo.dato, [id]: lead }
    const r = await guardarMapa({ kind: 'crmleads', store: 'bdi', mapa, cargado: true })
    setGuardando(false)
    if (!r.ok) {
      onError('No se pudo guardar el lead: ' + r.motivo)
      return
    }
    onGuardado(lead)
  }

  return (
    <div style={{ padding: space[3] }}>
      <button
        type="button"
        onClick={onVolver}
        style={{ background: 'none', border: 0, padding: 0, color: color.brand, fontSize: font.xs, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}
      >
        ← Volver
      </button>
      <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>Prospecto nuevo</div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 10 }}>{tel} · todavía no compró</div>

      <input className="mo-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre o local" style={{ width: '100%', marginBottom: 6 }} />
      <input className="mo-input" value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Ciudad" style={{ width: '100%', marginBottom: 6 }} />
      <input className="mo-input" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@instagram" style={{ width: '100%', marginBottom: 6 }} />
      <Button size="sm" disabled={!nombre.trim() || guardando} onClick={guardar}>
        {guardando ? 'Guardando…' : 'Guardar como lead'}
      </Button>
    </div>
  )
}
