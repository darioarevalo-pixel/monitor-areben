'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Icono } from '@/components/ui'
import { Aislado } from './Aislado'
import { Pagos } from './Pagos'
import { CalculadoraEnvio } from './CalculadoraEnvio'
import { ProximoContacto, RayaEstado, estadoDeFicha } from './ProximoContacto'
import { SOBRE_OSCURO } from './oscuro'
import type { QuienPaga } from './NuevoCompromiso'
import { color, font, radius, space, type Tone } from '@/components/ui/tokens'
import { TEMP_UI, vistaTemp } from '@/components/crm/temperatura'
import { addDiasISO, diaHabil, PLAZOS_DIAS, siguienteTemperatura } from '@/lib/crm/core'
import { ritmoDeCompra } from '@/lib/crm/ritmo'
import {
  buscarClientesPorNombre,
  buscarFicha,
  vincularTelefono,
  type FichaPanel,
  type RespuestaPanel,
} from '@/lib/crm/panel'
import { guardarConRelectura, guardarLeadsConRelectura } from '@/lib/crm/persistencia'
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
import { useComunidad, type AvisoComunidad, type Comunidad } from './useComunidad'
import { antiguedadFoto, estaEnComunidad } from '@/lib/crm/comunidad'
import { coincideNombre, palabraParaBuscar, palabrasDelNombre } from '@/lib/crm/nombre.core.js'
import { indexarTelefonos, buscarPorTelefono, normalizeArgPhone } from '@/lib/crm/telefono.core.js'
import { indexarEscritos, leEscribisteHoy, type EscritosHoy } from '@/lib/crm/escritos'
import { cola } from '@/lib/crm/telefono.core.js'

/**
 * El botón verde de WhatsApp, arriba en el encabezado de la ficha (Darío, 19-oct-2026: «no tiene el
 * botón de WhatsApp» — lo quiere siempre a la vista, con el ícono de WhatsApp).
 *
 * Desde la lista, el nombre abre la ficha sin pasar por WhatsApp (16-oct): éste es la vuelta. Si la
 * ficha ya es la del chat abierto no se vuelve a pedir el chat —la extensión podría recargar
 * WhatsApp para nada—: avisa que ya estás ahí.
 *
 * ⚠️ Es del panel de WhatsApp. En la tabla de Clientes del monitor el botón se sacó a pedido y no
 * vuelve (ver la ficha de la sección).
 */
function BotonAbrirChat({ tel, chatAbierto, onAbrir, onYaEsta }: { tel: string; chatAbierto: string; onAbrir: () => void; onYaEsta?: () => void }) {
  if (!cola(tel)) return null
  const yaEsta = cola(tel) === cola(chatAbierto)
  return (
    <button
      type="button"
      onClick={yaEsta ? onYaEsta : onAbrir}
      title={yaEsta ? 'Ya estás en su chat' : 'Abrir su chat en WhatsApp'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 26,
        padding: '0 10px',
        fontSize: font.xs,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        borderRadius: radius.md,
        border: 0,
        background: color.whatsapp,
        color: color.sideActiveInk,
        cursor: 'pointer',
      }}
    >
      <Icono nombre="whatsapp" size={14} />
      Abrir chat
    </button>
  )
}

/**
 * El encabezado de la ficha en azul noche (rediseño del 19-oct-2026): quién es, separado de lo que
 * se hace con él. Ver `SOBRE_OSCURO`.
 */
function Encabezado({ children }: { children: React.ReactNode }) {
  return <section style={{ ...SOBRE_OSCURO, padding: `${space[3]}px ${space[3]}px ${space[3] + 2}px` }}>{children}</section>
}

function useEscritosHoy(): EscritosHoy {
  const [escritos, setEscritos] = useState<EscritosHoy>(() => new Set())
  useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      if (e.source !== window.parent) return
      const d = e.data
      if (!d || d.fuente !== 'bdi-crm-panel' || d.tipo !== 'escritos-hoy' || !Array.isArray(d.tels)) return
      setEscritos(indexarEscritos(d.tels))
    }
    window.addEventListener('message', alMensaje)
    try {
      window.parent.postMessage({ fuente: 'bdi-crm-panel', tipo: 'que-escritos' }, '*')
    } catch {}
    return () => window.removeEventListener('message', alMensaje)
  }, [])
  return escritos
}

/**
 * El teléfono del chat, **también si no es argentino** (16-oct-2026).
 *
 * 🔴 `normalizeArgPhone` devuelve '' para un número de otro país (+51 970 616 406, Perú): el panel
 * lo leía como "no hay chat abierto" y mostraba «Abrí el chat de una persona» con la conversación
 * delante, sin forma de cargarla como prospecto. Si no es argentino quedan los dígitos tal cual:
 * el servidor y los leads cruzan igual (por los últimos 8 dígitos).
 *
 * ⛔ No se arregla en `normalizeArgPhone`: es también de Envíos, Canjes y el portal del cadete.
 */
export function telDelChat(t: string | null | undefined): string {
  const arg = normalizeArgPhone(t || '')
  if (arg) return arg
  const d = String(t || '').replace(/\D/g, '')
  return d.length >= 10 && d.length <= 15 ? d : ''
}
import { leerMapa } from '@/lib/kv/cliente'
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

/**
 * 🔑 **Cuando un teléfono cae en más de un cliente, la elección se recuerda** (19-oct-2026).
 * Antes el panel volvía a preguntar "¿Cuál es?" cada vez que se entraba al chat. Se guarda en
 * este navegador nada más: es una comodidad, y si falla el guardado el panel vuelve a preguntar.
 */
const CLAVE_ELECCION = 'panel:eleccion:'

function eleccionGuardada(tel: string): number | null {
  try {
    const v = Number(localStorage.getItem(CLAVE_ELECCION + tel))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

function guardarEleccion(tel: string, id: number | null) {
  try {
    if (id) localStorage.setItem(CLAVE_ELECCION + tel, String(id))
    else localStorage.removeItem(CLAVE_ELECCION + tel)
  } catch {}
}

const fmtMonto = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

function fmtFecha(d: string | null): string {
  if (!d) return '—'
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}` : '—'
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
 * El calendario de "Volver a hablarle".
 *
 * 🔴 **Escribir la fecha con el teclado no la guardaba** (Darío, 19-oct-2026). El campo guardaba
 * en cada cambio y se bloqueaba mientras guardaba: al tipear, Chrome ya avisa un cambio con el año
 * a medio escribir ("0002"), se mandaba eso, el campo quedaba trabado y el resto de lo tipeado se
 * perdía. Ahora lo escrito vive acá hasta que es una fecha completa y razonable, y el campo nunca
 * se bloquea.
 */
function CampoFecha({ valor, onGuardar, grande }: { valor: string; onGuardar: (v: string) => Promise<boolean> | void; grande?: boolean }) {
  const [txt, setTxt] = useState(valor)
  const ultimo = useRef(valor)
  // Si la fecha cambia de afuera (un botón de días, otro cliente), el casillero la toma. Ajuste
  // durante el render, el patrón de React para seguir una prop sin un render de más.
  const [valorPrevio, setValorPrevio] = useState(valor)
  if (valor !== valorPrevio) {
    setValorPrevio(valor)
    setTxt(valor)
  }
  useEffect(() => {
    ultimo.current = valor
  }, [valor])

  const completa = (v: string) => {
    const m = v.match(/^(\d{4})-\d{2}-\d{2}$/)
    return !!m && Number(m[1]) >= 2020 && Number(m[1]) <= 2100
  }
  const guardar = (v: string) => {
    if (v === ultimo.current || (v && !completa(v))) return
    const antes = ultimo.current
    ultimo.current = v
    // Si no se guardó (otro guardado en curso, o falló), se puede volver a intentar.
    Promise.resolve(onGuardar(v)).then((ok) => {
      if (ok === false && ultimo.current === v) ultimo.current = antes
    })
  }

  return (
    <input
      className="mo-input"
      type="date"
      value={txt}
      onChange={(e) => {
        setTxt(e.target.value)
        guardar(e.target.value)
      }}
      onBlur={() => guardar(txt)}
      style={
        grande
          ? // En la franja de «Próximo contacto» la fecha ES el dato: grande, sin caja que la achique.
            { width: '100%', maxWidth: 190, height: 34, padding: '0 2px', fontSize: 19, fontWeight: 700, color: color.ink, background: 'transparent', border: 0, boxShadow: 'none' }
          : { width: '100%', fontSize: font.sm }
      }
    />
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

/**
 * ¿Está en la comunidad mayorista? Sale de la lista que la extensión lee de WhatsApp Web (ver
 * `useComunidad`). Se compara contra más de un número y alcanza con que uno esté.
 *
 * Sin lista no dice nada, salvo que WhatsApp no la haya cargado todavía: eso tiene arreglo a mano
 * (abrir la comunidad una vez) y por eso se avisa.
 */
function MarcaComunidad({ comunidad, aviso, tels }: { comunidad: Comunidad | null; aviso: AvisoComunidad; tels: (string | null | undefined)[] }) {
  if (!comunidad) {
    if (aviso === 'sin-cargar') return <Chip>Para ver si está en la comunidad, abrí la comunidad una vez en WhatsApp</Chip>
    return null
  }
  const respuestas = tels.map((t) => estaEnComunidad(comunidad.indice, t))
  if (respuestas.every((r) => r === null)) return null
  const esta = respuestas.some((r) => r === true)
  const cuando = comunidad.enVivo ? 'recién leída de WhatsApp' : `lista de ${antiguedadFoto(comunidad.actualizado)}`
  return (
    // 🔑 Va en el encabezado, abajo del nombre, y con color propio (verde / rojo). Como etiqueta
    // amarilla junto a "Dormido" y "Volver a hablarle" no se veía (lo dijo Darío el 28-sep).
    <div
      title={`Según la lista de la comunidad (${comunidad.indice.total} personas, ${cuando})`}
      style={{
        display: 'inline-block',
        marginTop: 6,
        fontSize: font.sm,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${esta ? color.successBorder : color.dangerBorder}`,
        background: esta ? color.successBg : color.dangerBg,
        color: esta ? color.successInk : color.dangerInk,
      }}
    >
      {esta ? '✅ Está en la comunidad' : '✕ No está en la comunidad'}
    </div>
  )
}

/**
 * Quién está del otro lado del chat, para la pestaña "Pagos".
 *
 * 🔑 **Los tres casos son cobrables, y hasta el 3-sep-2026 sólo uno lo era.** Un mayorista nuevo
 * compra por WhatsApp y se carga a Gestión Nube después, cuando se arma el pedido — pero el cobro
 * se arregla en esa misma charla. Que el panel no tuviera nada que ofrecerle a un número
 * desconocido era perder justo el momento en que la cobranza se decide (lo levantó Darío usándolo).
 *
 * ⚠️ **Cuál teléfono viaja no es un detalle**: es la llave con la que después se reengancha la
 * compromiso. Cuando la ficha se resolvió POR ID (`via: 'id'` — se saltó acá desde una fila, o se
 * eligió entre dos candidatos) el número del chat abierto puede ser el de otra persona, así que en
 * ese caso manda el teléfono de la ficha. Si no, manda el del chat, que es con el que se anotó.
 */
export function quienPaga(estado: Estado, telNorm: string): QuienPaga | null {
  if (estado.t === 'ficha') {
    const telFicha = normalizeArgPhone(estado.ficha.cliente.phone || '') || null
    return {
      tipo: 'erp',
      id: estado.ficha.cliente.id,
      nombre: estado.ficha.cliente.name,
      telefono: estado.ficha.via === 'id' ? telFicha : telNorm || telFicha,
    }
  }
  // Un prospecto ya cargado que compra es exactamente el mismo caso: se sabe el nombre y el
  // número, no existe en Gestión Nube todavía.
  if (estado.t === 'lead') {
    return { tipo: 'sin-cargar', nombre: estado.lead.nombre, telefono: telDelChat(estado.lead.telefono) || telNorm }
  }
  if (estado.t === 'desconocido' && telNorm) {
    return { tipo: 'sin-cargar', nombre: '', telefono: telNorm }
  }
  return null
}

// ── El panel ─────────────────────────────────────────────────────────────────

export type Estado =
  | { t: 'cargando' }
  | { t: 'error'; motivo: string }
  /** `otros`: los demás clientes con el mismo teléfono, para poder cambiar la elección. */
  | { t: 'ficha'; ficha: FichaPanel; crudo: RespuestaPanel; otros?: FilaCliente[]; telOtros?: string }
  | { t: 'desconocido' }
  | { t: 'varios'; candidatos: FilaCliente[]; tel: string }
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
  /** El nombre con que está agendado el chat. Sólo para sugerir de quién es un número nuevo. */
  const [nombreChat, setNombreChat] = useState('')

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
      setNombreChat(String(d.nombre || ''))
      // El chat lo abrió WhatsApp; si es el que se pidió desde la lista, la ficha ya está puesta.
      setPedido((p) => (p && telDelChat(p.tel) === telDelChat(nuevo) ? p : null))
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

  // La comunidad se escucha acá arriba y no en la ficha: llega de la extensión una sola vez al
  // abrir (y después cada tanto), y no tiene que perderse porque en ese momento no había ficha.
  const { comunidad, aviso: avisoComunidad } = useComunidad()
  const escritos = useEscritosHoy()

  return (
    <>
      <PanelInterno tel={telChat} nombreChat={nombreChat} pedido={pedido} setPedido={setPedido} comunidad={comunidad} avisoComunidad={avisoComunidad} escritos={escritos} />
      {/* `key` = el chat: al pasar a otro cliente la cuenta arranca vacía. */}
      <Aislado nombre="Calculadora">
        <CalculadoraEnvio key={telChat || ''} />
      </Aislado>
    </>
  )
}

function PanelInterno({
  tel,
  nombreChat,
  pedido,
  setPedido,
  comunidad,
  avisoComunidad,
  escritos,
}: {
  tel: string | null
  nombreChat: string
  pedido: { id: number; tel: string } | null
  setPedido: (p: { id: number; tel: string } | null) => void
  comunidad: Comunidad | null
  avisoComunidad: AvisoComunidad
  escritos: EscritosHoy
}) {
  const [estado, setEstado] = useState<Estado>({ t: 'cargando' })
  const [crmSeg, setCrmSeg] = useState<MapaSeguimiento>({})
  /**
   * Los leads, en estado y no sólo en el `ref`.
   *
   * 🔑 **El `ref` es para el cruce por teléfono, que corre en un efecto; esto es para dibujar.**
   * La solapa "Hoy" ahora también muestra los prospectos, y un `ref` leído durante el render no
   * vuelve a dibujar cuando cambia — el lead que se acaba de agendar seguiría en la lista.
   * (`react-hooks/refs` lo prohíbe, y con razón: es el mismo error del 29-ago-2026 con el mapa.)
   */
  const [crmLeads, setCrmLeads] = useState<MapaLeads>({})
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [today] = useState(() => new Date())
  /**
   * Qué se está mirando. Sin chat abierto arranca en la lista: es la pantalla con la que se
   * empieza el día, y un cartel diciendo "abrí un chat" no le sirve a nadie que todavía no sabe a
   * quién abrir. Con un chat abierto arranca en la ficha, que es a lo que se vino.
   *
   * ⛔ **"Pagos" nunca arranca sola, y eso es lo que la hace gratis**: sus dos consultas salen
   * recién cuando alguien la toca. Si fuera la de entrada, cada chat abierto costaría leer el
   * saldo del dashboard y los compromisos — que es exactamente el error que dejó la ficha sin abrir
   * el 3-sep-2026 (ver `Aislado.tsx`).
   */
  const [solapa, setSolapa] = useState<'cliente' | 'hoy' | 'pagos'>(tel ? 'cliente' : 'hoy')
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
  const telNorm = useMemo(() => telDelChat(tel), [tel])


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
      setCrmLeads(kv.current.leads)
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

      /**
       * Con id no hace falta cruzar por teléfono: se pide derecho. Es el camino de la lista del
       * día, y el que permite mostrar la ficha sin esperar a que WhatsApp termine de abrir el chat.
       *
       * 🔴 **`id: 0` significa "no es un cliente, cruzalo por teléfono"**, y es lo que manda el
       * bloque de prospectos de la lista (29-ago-2026): un lead no tiene id numérico. Sin esto
       * caía en `clienteId: 0`, que no existe, y el panel terminaba ofreciendo **cargarlo como
       * lead de nuevo** — el duplicado que ya se pagó el 24-ago.
       *
       * ⚠️ Y el teléfono a cruzar es el del PEDIDO, no `telNorm`: cuando se toca un nombre de la
       * lista, WhatsApp todavía no navegó y `telNorm` sigue siendo el del chat anterior.
       */
      const telBuscar = pedido && !pedido.id ? telDelChat(pedido.tel) : telNorm
      const r = await buscarFicha(pedido?.id ? { clienteId: pedido.id } : { tel: telBuscar }, mapaSeg, today)
      if (!activo) return

      if (r.estado === 'encontrado') {
        setEstado({ t: 'ficha', ficha: r.ficha, crudo: r.crudo })
        return
      }
      if (r.estado === 'varios') {
        const elegido = eleccionGuardada(telBuscar)
        if (elegido && r.candidatos.some((c) => c.id === elegido)) {
          const r2 = await buscarFicha({ clienteId: elegido }, mapaSeg, today)
          if (!activo) return
          if (r2.estado === 'encontrado') {
            setEstado({ t: 'ficha', ficha: r2.ficha, crudo: r2.crudo, otros: r.candidatos, telOtros: telBuscar })
            return
          }
        }
        setEstado({ t: 'varios', candidatos: r.candidatos, tel: telBuscar })
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
      const { ids } = buscarPorTelefono(idx, telBuscar)
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
      const enc = leadsPorTelefono(kv.current.leads, telBuscar)
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
      setEstado({ ...estado, ficha: armarFicha(estado.crudo, r.mapa, today) })
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
      setCrmLeads(r.mapa)
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

  /**
   * Ver la ficha de alguien de la lista SIN abrir su chat (Darío, 15-oct-2026): para corregirle un
   * dato no hace falta pasar por la conversación. Es lo mismo que `abrirChat` menos el aviso a la
   * extensión; registrar desde ahí le escribe a ESA persona, no a la del chat abierto.
   */
  const verFicha = (id: number, telefono: string) => {
    if (!id && !telefono) return
    setPedido({ id, tel: telefono })
    setSolapa('cliente')
  }

  /**
   * Saltar de una fila de "Pagos" a esa persona.
   *
   * Con teléfono se abre el chat, que es lo que se quiere para reclamar; sin teléfono —las
   * compromisos viejos, anotadas antes de que el compromiso lo guardara— sólo queda mostrar la ficha.
   *
   * Que quede la ficha de alguien distinto al chat abierto no se desincroniza sola: el aviso de
   * "cambió el chat" limpia `pedido` cuando el número nuevo no es el que se había pedido, así que
   * el próximo chat que se abra manda.
   */
  const irAlCliente = (c: { cliente_id: string | null; cliente_telefono: string | null }) => {
    const id = Number(c.cliente_id)
    const idOk = Number.isFinite(id) && id > 0 ? id : 0
    if (c.cliente_telefono) {
      abrirChat(idOk, c.cliente_telefono)
      return
    }
    if (idOk) {
      setPedido({ id: idOk, tel: '' })
      setSolapa('cliente')
    }
  }

  /**
   * 🔑 Las pestañas quedan siempre arriba y cada chat nuevo arranca la ficha desde arriba
   * (19-oct-2026). Antes el panel quedaba a la altura del cliente anterior y había que subir para
   * ver Cliente / Hoy / Pagos.
   */
  useEffect(() => {
    try {
      window.scrollTo(0, 0)
    } catch {}
  }, [telNorm, pedido])

  const solapas = (
    <div style={{ display: 'flex', borderBottom: `1px solid ${color.sideBg}`, background: color.sideBg, position: 'sticky', top: 0, zIndex: 3 }}>
      {([
        ['cliente', 'Cliente'],
        ['hoy', 'Hoy'],
        ['pagos', 'Pagos'],
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
            borderBottom: `2px solid ${solapa === k ? color.sideAccent : 'transparent'}`,
            background: 'none',
            color: solapa === k ? color.sideActiveInk : color.sideInk2,
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
          <AgendaDelDia crmSeg={crmSeg} crmLeads={crmLeads} today={today} onAbrirChat={abrirChat} onVerFicha={verFicha} puedeAbrirChat={enExtension} escritos={escritos} />
        ) : (
          <Cargando />
        )}
      </Envoltorio>
    )

  /**
   * 🔑 **Va ANTES del corte por "no hay chat abierto", y no después.** Es una lista de trabajo que
   * cruza a todos los clientes: sirve igual con el chat cerrado, y el único que se pierde es el
   * formulario de anotar (que sí necesita saber quién va a transferir).
   *
   * El cliente sale de la ficha ya resuelta: nunca se anota un compromiso a nombre de nadie. Y
   * mientras la ficha carga se avisa aparte (`buscandoCliente`), para no mandar a abrir un chat
   * que ya está abierto.
   */
  if (solapa === 'pagos')
    return (
      <Envoltorio aviso={aviso}>
        {solapas}
        <Aislado nombre="Pagos">
          <Pagos
            cliente={quienPaga(estado, telNorm)}
            buscandoCliente={estado.t === 'cargando' && !!(telNorm || pedido)}
            onIrAlCliente={irAlCliente}
          />
        </Aislado>
      </Envoltorio>
    )

  // ⚠️ `pedido` también cuenta: desde la lista se puede ver la ficha de alguien sin ningún chat
  // abierto (el nombre abre la ficha, 15-oct-2026). Mirando sólo `telNorm` quedaba este cartel.
  if (!telNorm && !pedido)
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
                const { candidatos, tel } = estado
                setEstado({ t: 'cargando' })
                const r = await buscarFicha({ clienteId: c.id }, crmSeg, today)
                if (!vivo.current) return
                if (r.estado === 'encontrado') {
                  guardarEleccion(tel, c.id)
                  setEstado({ t: 'ficha', ficha: r.ficha, crudo: r.crudo, otros: candidatos, telOtros: tel })
                } else setEstado({ t: 'desconocido' })
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

  if (estado.t === 'lead') {
    const lead = estado.lead
    return (
      <Envoltorio
        aviso={aviso}
        pie={
          <PieLead
            key={lead.id}
            lead={lead}
            today={today}
            guardando={guardando}
            onMutar={(fn, exito) => mutarLead(lead.id, fn, exito)}
            leEscribiste={leEscribisteHoy(escritos, pedido ? [lead.telefono] : [telNorm, lead.telefono])}
          />
        }
      >
        {solapas}
        <RayaEstado
          estado={estadoDeFicha(
            leadEstadoSeg(lead, today).proximo,
            hoyISO(today),
            leEscribisteHoy(escritos, pedido ? [lead.telefono] : [telNorm, lead.telefono]) &&
              lead.ultimo_contacto !== hoyISO(today) &&
              !((lead.proximo_manual || '') > hoyISO(today)),
          )}
        />
        <FichaLead
          key={lead.id}
          lead={lead}
          guardando={guardando}
          onMutar={(fn, exito) => mutarLead(lead.id, fn, exito)}
          botonChat={<BotonAbrirChat tel={lead.telefono || ''} chatAbierto={telNorm} onAbrir={() => abrirChat(0, lead.telefono || '')} onYaEsta={() => decir('Ya estás en su chat')} />}
          marcaComunidad={<MarcaComunidad comunidad={comunidad} aviso={avisoComunidad} tels={[telNorm, lead.telefono || '']} />}
        />
      </Envoltorio>
    )
  }

  if (estado.t === 'desconocido')
    return (
      <Envoltorio aviso={aviso}>
        {solapas}
        <NumeroNuevo
          key={telNorm}
          tel={telNorm}
          nombreAgendado={nombreChat}
          onCobranza={() => setSolapa('pagos')}
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
            setCrmLeads(kv.current.leads)
            setEstado({ t: 'lead', lead })
            decir('Guardado como lead')
          }}
          onError={(txt) => decir(txt, true)}
        />
      </Envoltorio>
    )

  // ── La ficha ───────────────────────────────────────────────────────────────
  const { cliente: c, compras, via } = estado.ficha
  const seg = crmSeg[String(c.id)] || {}
  const t = TEMP_UI[vistaTemp(c)]
  const notas = c.notas || []
  // Las ventas ya están en la ficha: la sugerencia no le pide nada más al servidor.
  const ritmo = ritmoDeCompra(c.ventas || [], today)
  const hoyFicha = hoyISO(today)
  const faltaFecha =
    // 🔴 Si la ficha se abrió desde la lista, el chat abierto es el de OTRA persona: mirar su número
    // hacía decir "Le escribiste hoy" a quien no se le escribió (Darío, 19-oct-2026, Valentina Coba).
    leEscribisteHoy(escritos, via === 'id' ? [c.phone] : [telNorm, c.phone]) &&
    crmSeg[String(c.id)]?.ultimo_contacto !== hoyFicha &&
    !((c.proximo_contacto || '') > hoyFicha)

  const estadoFicha = estadoDeFicha(c.proximo_contacto, hoyFicha, faltaFecha)
  const telFicha = pedido?.tel || c.phone || ''

  return (
    <Envoltorio
      aviso={aviso}
      pie={
        <ProximoContacto
          fecha={c.proximo_contacto}
          hoy={hoyFicha}
          faltaFecha={faltaFecha}
          ritmo={ritmo}
          guardando={guardando}
          onPlazo={(d) => mutar((m) => escribiHoy(m, c.id, d), `Listo · ${diaYFecha(diaHabil(addDiasISO(hoyISO(), d)))}`)}
          calendario={
            <CampoFecha
              key={`fecha-${c.id}`}
              grande
              valor={c.proximo_contacto || ''}
              onGuardar={(v) => mutar((m) => setProximoManual(m, c.id, v), avisoFecha(v))}
            />
          }
        />
      }
    >
      {solapas}
      <RayaEstado estado={estadoFicha} />
      <Encabezado>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0, fontSize: 18, fontWeight: 700, color: color.ink, lineHeight: 1.2 }}>{c.name || `#${c.id}`}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            {/*
              La temperatura sin pintar (rediseño del 19-oct-2026): el rojo quedó sólo para
              «atrasado», y un 🔥 rojo arriba con un «Atrasado» rojo abajo eran dos cosas con el
              mismo color.
            */}
            <button
              onClick={() => mutar((m) => setTemperatura(m, c.id, siguienteTemperatura(c.temperatura)), 'Listo')}
              title={`${t.txt} — ${t.ayuda}`}
              disabled={guardando}
              style={{ cursor: 'pointer', height: 26, fontSize: 11, fontWeight: 600, padding: '0 9px', borderRadius: 999, whiteSpace: 'nowrap', border: `1px solid ${color.line}`, background: color.bg2, color: color.ink }}
            >
              {t.txt}
            </button>
            <BotonAbrirChat tel={telFicha} chatAbierto={telNorm} onAbrir={() => abrirChat(c.id, telFicha)} onYaEsta={() => decir('Ya estás en su chat')} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4, fontSize: font.xs, color: color.mut2 }}>
          <span>{c.city || 'sin ciudad'}</span>
          {estado.otros && estado.otros.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const tel = estado.telOtros || telNorm
                guardarEleccion(tel, null)
                setEstado({ t: 'varios', candidatos: estado.otros!, tel })
              }}
              style={{ background: 'none', border: 0, padding: 0, color: color.brand, fontSize: font.xs, cursor: 'pointer', textDecoration: 'underline' }}
            >
              ¿No es? Cambiar
            </button>
          )}
          {/*
            El Instagram, que hasta ahora sólo se podía ver y escribir desde la sección. Y es
            acá donde uno se entera de cuál es: lo tenés en la conversación, no en el CRM.
          */}
          <Instagram
            valor={seg.pagina || ''}
            guardando={guardando}
            onGuardar={(v) => mutar((m) => setPagina(m, c.id, v), v ? 'Instagram guardado' : 'Instagram eliminado')}
          />
        </div>
        {/* Los dos números: el del chat es el que está en la comunidad, pero si la ficha se abrió
            desde la lista, el chat todavía puede ser el anterior. */}
        <MarcaComunidad comunidad={comunidad} aviso={avisoComunidad} tels={via === 'id' ? [c.phone] : [telNorm, c.phone]} />

        {via === 'cola' && (
          <div style={{ marginTop: 6, fontSize: font.xs, color: color.warningInk, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: radius.sm, padding: '4px 8px' }}>
            El teléfono no coincide exacto con el de la ficha (difieren en el principio). Fijate que sea esta persona.
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <Dato k="Pedidos" v={String(c.total_sales)} />
          <Dato k="Total" v={fmtMonto(c.total_amount)} />
          <Dato k="Último" v={c.dias_ultimo === null ? '—' : c.dias_ultimo === 0 ? 'hoy' : `hace ${c.dias_ultimo}d`} />
        </div>
      </Encabezado>

      <div style={{ paddingTop: space[2] }}>
        {/*
          Las notas arriba, abiertas: es dónde quedaste con esta persona (Darío, 19-oct-2026). El
          despacho va adentro; «Pendiente» y «Tener en cuenta» sólo se ven si están cargados
          (medido ese día: 1 cliente cada uno de 782). El `key` con el id del cliente es lo que hace
          que al cambiar de chat no quede abierto el editor del anterior —ni su borrador—.
        */}
        <Notas
          key={`notas-${c.id}`}
          notas={notas}
          guardando={guardando}
          onGuardar={(texto) => mutar((m) => agregarNota(m, c.id, texto, hoyISO()), 'Nota guardada')}
          extra={
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
          }
        />

        <UltimaCompra key={`compra-${c.id}`} ultima={compras.ultima} />

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
 * La última compra, plegada en un renglón: fecha, cantidad de productos y total (Darío, 19-oct-2026:
 * «siento que es algo que no uso»). El detalle se abre al tocar.
 */
function UltimaCompra({ ultima }: { ultima: { fecha: string; items: FilaDetalle[] } | null }) {
  const [abierta, setAbierta] = useState(false)
  if (!ultima)
    return (
      <Bloque>
        <div style={{ fontSize: font.sm, color: color.mut2 }}>Todavía no le vendimos nada.</div>
      </Bloque>
    )
  const total = ultima.items.reduce((acc, d) => {
    const t = parseFloat(String(d.total ?? ''))
    return acc + (Number.isFinite(t) ? t : (Number(d.quantity) || 0) * (parseFloat(String(d.unit_price)) || 0))
  }, 0)
  const n = ultima.items.length
  return (
    <Bloque>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: 'auto', padding: 0, background: 'none', border: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', color: color.ink }}
      >
        <span style={{ fontSize: font.sm, fontWeight: 700 }}>Última compra</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: font.xs, color: color.mut2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          · {fmtFecha(ultima.fecha)} · {n} {n === 1 ? 'producto' : 'productos'} · {fmtMonto(total)}
        </span>
        <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" style={{ flex: 'none', color: color.mut2, transform: abierta ? 'none' : 'rotate(-90deg)', transition: 'transform 0.12s ease' }}>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {abierta && (
        <div style={{ marginTop: 6 }}>
          <ListaCompra items={ultima.items} />
        </div>
      )}
    </Bloque>
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
/**
 * Un texto que se toca para corregirlo: el nombre o la ciudad de un prospecto. Guarda al salir del
 * cuadro o con Enter, como el Instagram; Escape deja lo que estaba.
 */
function TextoEditable({
  valor,
  vacio,
  ayuda,
  guardando,
  estilo,
  onGuardar,
}: {
  valor: string
  vacio: string
  ayuda: string
  guardando: boolean
  estilo: React.CSSProperties
  onGuardar: (v: string) => void
}) {
  const [editando, setEditando] = useState(false)

  if (editando)
    return (
      <input
        autoFocus
        className="mo-input"
        defaultValue={valor}
        placeholder={ayuda}
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
          if (e.key === 'Escape') {
            e.currentTarget.value = valor
            e.currentTarget.blur()
          }
        }}
        style={{ ...estilo, width: '100%', margin: '1px 0' }}
      />
    )

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      disabled={guardando}
      title="Tocá para cambiarlo"
      style={{
        ...estilo,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        maxWidth: '100%',
        height: 'auto',
        padding: 0,
        background: 'none',
        border: 0,
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: estilo.fontSize,
        fontWeight: estilo.fontWeight,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valor || vacio}</span>
      <Icono nombre="lapiz" size={12} />
    </button>
  )
}

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
  // ⛔ «Pendiente» y «Tener en cuenta» ya no se ofrecen vacíos (Darío, 19-oct-2026: 1 cliente cada
  // uno de 782). Lo cargado se sigue viendo y editando; sólo el despacho se ofrece para cargar.
  const vacios = CAMPOS.filter((x) => x.k === 'despacho' && !valor(x.k) && abierto !== x.k)

  return (
    <div style={{ marginTop: space[2], paddingTop: space[2], borderTop: `1px solid ${color.line}` }}>
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
    </div>
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
function Notas({ notas, guardando, onGuardar, extra }: { notas: Nota[]; guardando: boolean; onGuardar: (texto: string) => Promise<boolean>; extra?: React.ReactNode }) {
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
      {extra}
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

/** Alto de la fila de pestañas: el aviso se pega justo debajo, sin taparlas. */
const ALTO_SOLAPAS = 31

/**
 * `pie` es la franja de «Próximo contacto»: va al fondo de la pantalla aunque la ficha sea corta
 * (por eso la columna con `flex: 1`) y se pega abajo al bajar.
 */
function Envoltorio({ children, aviso, pie }: { children: React.ReactNode; aviso?: { txt: string; mal?: boolean } | null; pie?: React.ReactNode }) {
  return (
    <div style={{ background: color.bg, color: color.ink, minHeight: '100vh', fontSize: font.sm, display: 'flex', flexDirection: 'column' }}>
      {aviso && (
        <div
          style={{
            position: 'sticky',
            top: ALTO_SOLAPAS,
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
      <div style={{ flex: 1, paddingBottom: space[3] }}>{children}</div>
      {pie}
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
  guardando,
  onMutar,
  marcaComunidad,
  botonChat,
}: {
  lead: Lead
  guardando: boolean
  onMutar: (fn: (m: MapaLeads) => MapaLeads, exito: string) => Promise<boolean>
  marcaComunidad: React.ReactNode
  botonChat: React.ReactNode
}) {
  const notas = Array.isArray(lead.notas) ? lead.notas : []

  return (
    <div>
      <Encabezado>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            {/* El nombre y la ciudad se corrigen acá (Darío, 16-oct-2026): muchas veces el prospecto
                se carga sin saber cómo se llama, y se entera después en la conversación. */}
            <TextoEditable
              valor={lead.nombre || ''}
              vacio="Sin nombre"
              ayuda="Su nombre"
              guardando={guardando}
              estilo={{ fontSize: 18, fontWeight: 700, color: color.ink, lineHeight: 1.2 }}
              onGuardar={(v) => onMutar((m) => setCampoLead(m, lead.id, 'nombre', v), 'Nombre guardado')}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <Chip tone={lead.estado === 'activo' ? 'neutro' : 'ok'}>{LEAD_ESTADO_LABEL[lead.estado]}</Chip>
            {botonChat}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <TextoEditable
            valor={lead.ciudad || ''}
            vacio="sin ciudad"
            ayuda="Su ciudad"
            guardando={guardando}
            estilo={{ fontSize: font.xs, color: color.mut2 }}
            onGuardar={(v) => onMutar((m) => setCampoLead(m, lead.id, 'ciudad', v), 'Ciudad guardada')}
          />
          {/* Editable también acá: en un prospecto el Instagram es la mitad de lo que se sabe
              de él, y muchas veces llega después de haberlo cargado. */}
          <Instagram
            valor={lead.instagram || ''}
            guardando={guardando}
            onGuardar={(v) => onMutar((m) => setCampoLead(m, lead.id, 'instagram', v), v ? 'Instagram guardado' : 'Instagram eliminado')}
          />
          <Chip>Todavía no compró</Chip>
        </div>
        {marcaComunidad}
      </Encabezado>

      <div style={{ paddingTop: space[2] }}>
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
    </div>
  )
}

/**
 * «Próximo contacto» del prospecto: la misma franja fija que la del cliente, sin ritmo de compra
 * (todavía no compró).
 */
function PieLead({
  lead,
  today,
  guardando,
  leEscribiste,
  onMutar,
}: {
  lead: Lead
  today: Date
  guardando: boolean
  leEscribiste: boolean
  onMutar: (fn: (m: MapaLeads) => MapaLeads, exito: string) => Promise<boolean>
}) {
  const seg = leadEstadoSeg(lead, today)
  const hoy = hoyISO(today)
  // Marcado = tocó un botón de días hoy, o ya tiene una fecha para más adelante.
  const faltaFecha = leEscribiste && lead.ultimo_contacto !== hoy && !((lead.proximo_manual || '') > hoy)
  return (
    <ProximoContacto
      fecha={seg.proximo}
      hoy={hoy}
      faltaFecha={faltaFecha}
      ritmo={null}
      guardando={guardando}
      onPlazo={(d) => onMutar((m) => escribiHoyLead(m, lead.id, d), `Listo · ${diaYFecha(diaHabil(addDiasISO(hoyISO(), d)))}`)}
      calendario={
        <CampoFecha
          key={`fecha-${lead.id}`}
          grande
          valor={lead.proximo_manual || ''}
          onGuardar={(v) => onMutar((m) => setProximoLead(m, lead.id, v), avisoFecha(v))}
        />
      }
    />
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
  nombreAgendado,
  onVinculado,
  onGuardado,
  onCobranza,
  onError,
}: {
  tel: string
  /** Con qué nombre está agendado este chat. Vacío si no se sabe. */
  nombreAgendado: string
  onVinculado: (cliente: FilaCliente) => void
  onGuardado: (lead: Lead) => void
  /** Ya compró y hay que cobrarle, aunque todavía no esté cargado en Gestión Nube. */
  onCobranza: () => void
  onError: (t: string) => void
}) {
  const [camino, setCamino] = useState<'elegir' | 'cliente' | 'lead'>('elegir')
  const sugeridos = useSugeridosPorNombre(nombreAgendado)
  const [enganchando, setEnganchando] = useState(false)

  const enganchar = async (c: FilaCliente) => {
    if (enganchando) return
    setEnganchando(true)
    const r = await vincularTelefono(c.id, tel)
    setEnganchando(false)
    if (!r.ok) {
      onError('No se pudo guardar: ' + r.motivo)
      return
    }
    onVinculado(c)
  }

  if (camino === 'lead') return <NuevoLead tel={tel} onGuardado={onGuardado} onError={onError} onVolver={() => setCamino('elegir')} />
  if (camino === 'cliente')
    return <VincularCliente tel={tel} onVinculado={onVinculado} onError={onError} onVolver={() => setCamino('elegir')} />

  return (
    <div style={{ padding: space[3] }}>
      <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>Número nuevo</div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 12 }}>{tel} · no está en el CRM</div>

      {/*
        🔑 **La sugerencia por nombre** (Darío, 28-sep-2026). Pasa seguido que el cliente escribe
        desde otro número que el de Gestión Nube (8 de 28 medidos ese día), y Darío lo agenda con el
        mismo nombre con que compra. El nombre SUGIERE; engancha sólo el toque de Darío — elegir solo
        anotaría notas y fechas en la ficha de otra persona cuando el nombre se repite.
      */}
      {sugeridos.length > 0 && (
        <div style={{ border: `1px solid ${color.successBorder}`, background: color.successBg, borderRadius: radius.sm, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: font.sm, fontWeight: 700, color: color.successInk, marginBottom: 2 }}>
            {sugeridos.length === 1 ? '¿Es este cliente?' : '¿Es alguno de estos clientes?'}
          </div>
          <div style={{ fontSize: font.xs, color: color.mut, marginBottom: 8 }}>
            Lo tenés agendado como «{nombreAgendado}». Tocalo y este número va a abrir su ficha.
          </div>
          {sugeridos.map((c) => (
            <Button
              key={c.id}
              variant="outline"
              fullWidth
              disabled={enganchando}
              style={{ justifyContent: 'flex-start', marginBottom: 6, textAlign: 'left', background: color.bg }}
              onClick={() => enganchar(c)}
            >
              <span>
                {c.name || `#${c.id}`}
                <span style={{ color: color.mut2, fontSize: font.xs }}> · {c.city || 'sin ciudad'} · #{c.id}</span>
              </span>
            </Button>
          ))}
        </div>
      )}

      <Button variant="outline" fullWidth style={{ marginBottom: 8, justifyContent: 'flex-start' }} onClick={() => setCamino('cliente')}>
        Ya es cliente mío, cambió de número
      </Button>
      <Button variant="outline" fullWidth style={{ marginBottom: 8, justifyContent: 'flex-start' }} onClick={() => setCamino('lead')}>
        Es alguien nuevo, guardarlo como lead
      </Button>
      {/*
        🔑 **El tercer camino, que faltaba** (Darío, 3-sep-2026). Un mayorista nuevo compra por
        WhatsApp y recién después se carga en Gestión Nube, cuando se arma el pedido — pero el cobro
        se arregla en la charla. Sin esto, el único momento en que se puede pedir que le transfiera
        al contador es justo el momento en que el panel no tenía nada para ofrecer.

        No crea nada acá: lleva a "Pagos", que ya sabe anotar un compromiso con el nombre a mano y el
        teléfono de este chat, y engancharla sola cuando el cliente por fin exista.
      */}
      <Button variant="outline" fullWidth style={{ justifyContent: 'flex-start' }} onClick={onCobranza}>
        Ya compró y le tengo que cobrar
      </Button>
    </div>
  )
}

/**
 * Los clientes cuyo nombre coincide con el nombre agendado del chat (hasta 3). Busca en el servidor
 * por la palabra más larga —suele ser el apellido— y se queda con los que tienen TODAS las palabras
 * del nombre agendado. Con una sola palabra no sugiere nada: "Martina" sola son demasiadas.
 */
function useSugeridosPorNombre(nombre: string): FilaCliente[] {
  const palabras = useMemo(() => palabrasDelNombre(nombre), [nombre])
  const clave = palabras.join(' ')
  const [res, setRes] = useState<{ clave: string; filas: FilaCliente[] } | null>(null)
  useEffect(() => {
    if (palabras.length < 2) return
    let activo = true
    ;(async () => {
      const filas = await buscarClientesPorNombre(palabraParaBuscar(palabras))
      if (activo) setRes({ clave, filas: filas.filter((c) => coincideNombre(palabras, c.name)).slice(0, 3) })
    })()
    return () => {
      activo = false
    }
  }, [clave, palabras])
  return res && res.clave === clave ? res.filas : []
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
  const [dias, setDias] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    if (!nombre.trim() || dias === null || guardando) return
    setGuardando(true)
    const id = nuevoIdLead(Date.now(), Math.random())
    /**
     * 🔴 **La fecha se elige ACÁ, y es obligatoria** (decisión de Bruno, 29-ago-2026).
     *
     * Antes el alta guardaba sin fecha —"eso lo elijo yo al momento de ver si está frío o
     * caliente"— y el resultado medido fue que **no se elegía nunca**: 29 de 37 prospectos
     * activos sin ninguna fecha. Un prospecto sin fecha no entra en ninguna cola de trabajo, así
     * que se carga y ahí queda. Elegir "en cuántos días" es un toque y pasa en la misma
     * conversación, que es cuando se sabe.
     *
     * ⚠️ **No se calcula, se pregunta.** La cadencia automática salió del CRM el 24-ago y no
     * vuelve por acá: el plazo lo pone quien acaba de hablar. Lo único que cambió es que ahora
     * no se puede salir sin ponerlo.
     */
    const lead: Lead = {
      ...leadNuevo(id),
      nombre: nombre.trim(),
      telefono: tel,
      ciudad: ciudad.trim(),
      instagram: instagram.trim(),
      // `diaHabil` corre el fin de semana al lunes, igual que en toda fecha del CRM.
      proximo_manual: diaHabil(addDiasISO(hoyISO(), dias)),
    }
    // La relectura la hace `guardarLeadsConRelectura`, igual que el resto de las escrituras del
    // panel: acá estaba escrita a mano.
    const r = await guardarLeadsConRelectura((m) => ({ ...m, [id]: lead }))
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
      <input className="mo-input" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@instagram" style={{ width: '100%', marginBottom: 8 }} />

      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 4 }}>¿En cuántos días le volvés a escribir?</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
        {PLAZOS_DIAS.map((d) => {
          const elegido = dias === d
          return (
            <button
              key={d}
              type="button"
              disabled={guardando}
              onClick={() => setDias(d)}
              title={`${d === 1 ? 'Mañana' : `En ${d} días`} · ${diaYFecha(diaHabil(addDiasISO(hoyISO(), d)))}`}
              style={{
                minWidth: 34,
                height: 'auto',
                padding: '4px 8px',
                fontSize: font.sm,
                fontWeight: 600,
                color: elegido ? color.brand : color.ink2,
                background: elegido ? color.brandBg : color.surface,
                border: `1px solid ${elegido ? color.brandSolid : color.line2}`,
                borderRadius: radius.md,
                cursor: guardando ? 'not-allowed' : 'pointer',
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 8 }}>
        {dias === null ? 'Elegí cuándo, así aparece solo en la lista ese día.' : `Te lo recuerdo el ${diaYFecha(diaHabil(addDiasISO(hoyISO(), dias)))}.`}
      </div>

      <Button size="sm" disabled={!nombre.trim() || dias === null || guardando} onClick={guardar}>
        {guardando ? 'Guardando…' : 'Guardar como lead'}
      </Button>
    </div>
  )
}
