'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { color, font, radius, space } from '@/components/ui/tokens'
import { TEMP_UI } from '@/components/crm/temperatura'
import { CADENCIA_DIAS, siguienteTemperatura } from '@/lib/crm/core'
import { buscarFicha, guardarConRelectura, type FichaPanel, type RespuestaPanel } from '@/lib/crm/panel'
import { armarFicha } from '@/lib/crm/panel'
import { agregarNota, escribiHoy, hoyISO, registrarContacto, setProximoManual, setTemperatura } from '@/lib/crm/seguimiento'
import { leadNuevo, nuevoIdLead, type Lead, type MapaLeads } from '@/lib/crm/leads'
import { AgendaDelDia } from './AgendaDelDia'
import { indexarTelefonos, buscarPorTelefono, normalizeArgPhone } from '@/lib/crm/telefono.core.js'
import { guardarMapa, leerMapa } from '@/lib/kv/cliente'
import type { FilaCliente, MapaSeguimiento, MapaTelefonos, ResultadoContacto } from '@/lib/crm/tipos'

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
 * Las cuatro respuestas del "¿Cómo te fue?".
 *
 * Son las de la libreta, con las palabras de la libreta. **"No le interesa" no apaga al cliente ni
 * lo marca frío**: deja registrado que esta vez dijo que no, que es un dato distinto de que la
 * relación esté muerta. La temperatura se sigue marcando a mano, arriba.
 */
const RESULTADOS: { v: ResultadoContacto; txt: string; ayuda: string }[] = [
  { v: 'contesto', txt: 'Contestó', ayuda: 'Hubo conversación, aunque no haya comprado.' },
  { v: 'no_contesto', txt: 'No contestó', ayuda: 'Se le escribió y no respondió.' },
  { v: 'pidio_precio', txt: 'Pidió precio', ayuda: 'Está mirando: hay que volver.' },
  { v: 'no_interesa', txt: 'No le interesa', ayuda: 'Dijo que no esta vez.' },
]

/** Los tres plazos de "volver a hablarle" + la fecha a dedo. */
const PLAZOS: { dias: number; txt: string }[] = [
  { dias: 3, txt: 'En 3 días' },
  { dias: 7, txt: 'En 1 semana' },
  { dias: 15, txt: 'En 15 días' },
]

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: `${space[2]}px ${space[3]}px`, borderTop: `1px solid ${color.line}` }}>
      <div style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase', marginBottom: 6 }}>
        {titulo}
      </div>
      {children}
    </div>
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
  const [nota, setNota] = useState('')
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
  const kv = useRef<{ seg: MapaSeguimiento; tel: MapaTelefonos }>({ seg: {}, tel: {} })
  const [kvListo, setKvListo] = useState(false)

  useEffect(() => {
    let activo = true
    ;(async () => {
      const [seg, telKv] = await Promise.all([
        leerMapa<MapaSeguimiento[string]>('crmseg', 'bdi'),
        leerMapa<string>('crmtel', 'bdi'),
      ])
      if (!activo) return
      kv.current = { seg: seg.ok ? seg.dato : {}, tel: telKv.ok ? telKv.dato : {} }
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
    async (fn: (m: MapaSeguimiento) => MapaSeguimiento, exito: string) => {
      if (estado.t !== 'ficha' || guardando) return
      setGuardando(true)
      const r = await guardarConRelectura(fn)
      if (!vivo.current) return
      setGuardando(false)
      if (!r.ok) {
        decir('No se pudo guardar: ' + r.motivo, true)
        return
      }
      kv.current = { ...kv.current, seg: r.mapa }
      setCrmSeg(r.mapa)
      // Recalcular con el mapa recién guardado, sin volver a pedirle nada al servidor: las ventas
      // y el padrón no cambiaron, lo que cambió es el seguimiento.
      setEstado({ t: 'ficha', ficha: armarFicha(estado.crudo, r.mapa, today), crudo: estado.crudo })
      decir(exito)
    },
    [estado, guardando, decir, today],
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

  if (estado.t === 'desconocido')
    return (
      <Envoltorio aviso={aviso}>
        {solapas}
        <NuevoLead tel={telNorm} onListo={(txt) => decir(txt)} onError={(txt) => decir(txt, true)} />
      </Envoltorio>
    )

  // ── La ficha ───────────────────────────────────────────────────────────────
  const { cliente: c, compras, segmento, via } = estado.ficha
  const seg = crmSeg[String(c.id)] || {}
  const t = TEMP_UI[c.temperatura]
  const ultNota = (c.notas || [])[0] || null
  const ultimoContacto = (seg.contactos || [])[0] || null

  return (
    <Envoltorio aviso={aviso}>
      {solapas}
      {/* Encabezado */}
      <div style={{ padding: `${space[3]}px ${space[3]}px ${space[2]}px` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink, lineHeight: 1.2 }}>{c.name || `#${c.id}`}</div>
            <div style={{ fontSize: font.xs, color: color.mut2 }}>
              {c.city || 'sin ciudad'} · #{c.id}
            </div>
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

        <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
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
          {ultimoContacto && (
            <Chip>
              {fmtFecha(ultimoContacto.fecha)}: {RESULTADOS.find((r) => r.v === ultimoContacto.resultado)?.txt.toLowerCase()}
            </Chip>
          )}
        </div>
      </div>

      {/* Lo último que llevó */}
      <Bloque titulo="Lo último que llevó">
        {compras.ultima ? (
          <>
            <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 4 }}>{fmtFecha(compras.ultima.fecha)}</div>
            {compras.ultima.items.slice(0, 8).map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: font.sm, padding: '2px 0' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.quantity}× {d.product_name}
                  {d.size ? ` (${d.size})` : ''}
                </span>
                <span style={{ color: color.mut, whiteSpace: 'nowrap' }}>{fmtMonto(parseFloat(String(d.unit_price)) || 0)}</span>
              </div>
            ))}
          </>
        ) : (
          <div style={{ fontSize: font.sm, color: color.mut2 }}>Todavía no le vendimos nada.</div>
        )}
      </Bloque>

      {/* ¿Cómo te fue? */}
      <Bloque titulo="¿Cómo te fue?">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {RESULTADOS.map((r) => (
            <Button
              key={r.v}
              size="sm"
              variant="ghost"
              disabled={guardando}
              title={r.ayuda}
              onClick={() => mutar((m) => registrarContacto(m, c.id, r.v, hoyISO()), 'Anotado')}
            >
              {r.txt}
            </Button>
          ))}
        </div>
      </Bloque>

      {/* Volver a hablarle */}
      <Bloque titulo="Volver a hablarle">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PLAZOS.map((p) => (
            <Button
              key={p.dias}
              size="sm"
              variant="ghost"
              disabled={guardando}
              onClick={() => mutar((m) => escribiHoy(m, c.id, p.dias), 'Listo')}
            >
              {p.txt}
            </Button>
          ))}
          <input
            className="mo-input"
            type="date"
            value={c.proximo_contacto || ''}
            disabled={guardando}
            onChange={(e) => mutar((m) => setProximoManual(m, c.id, e.target.value), 'Listo')}
            style={{ height: 28, fontSize: font.xs, flex: '1 1 120px', minWidth: 120 }}
          />
        </div>
        {seg.cadencia && (
          <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 5 }}>
            Cadencia {seg.cadencia} (cada {CADENCIA_DIAS[seg.cadencia] || 30} días)
          </div>
        )}
      </Bloque>

      {/* Nota */}
      <Bloque titulo="Nota">
        {ultNota && (
          <div style={{ fontSize: font.sm, color: color.mut, marginBottom: 6 }}>
            <span style={{ color: color.mut2 }}>{fmtFecha(ultNota.fecha)}: </span>
            {ultNota.texto}
          </div>
        )}
        <textarea
          className="mo-input"
          value={nota}
          disabled={guardando}
          placeholder="Qué quedó pendiente…"
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          style={{ width: '100%', fontSize: font.sm, resize: 'vertical' }}
        />
        <Button
          size="sm"
          disabled={guardando || !nota.trim()}
          style={{ marginTop: 6 }}
          onClick={async () => {
            const texto = nota.trim()
            await mutar((m) => agregarNota(m, c.id, texto, hoyISO()), 'Nota guardada')
            setNota('')
          }}
        >
          Guardar nota
        </Button>
      </Bloque>

      <div style={{ padding: space[3], borderTop: `1px solid ${color.line}` }}>
        <a href="/clientes" target="_blank" rel="noreferrer" style={{ fontSize: font.sm, color: color.brand, textDecoration: 'none' }}>
          Abrir la ficha completa ↗
        </a>
      </div>
    </Envoltorio>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: font.xs, color: color.mut2 }}>{k}</div>
      <div style={{ fontSize: font.sm, fontWeight: 600, color: color.ink }}>{v}</div>
    </div>
  )
}

function Envoltorio({ children, aviso }: { children: React.ReactNode; aviso?: { txt: string; mal?: boolean } | null }) {
  return (
    <div style={{ background: color.surface, color: color.ink, minHeight: '100vh', fontSize: font.sm }}>
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
function NuevoLead({ tel, onListo, onError }: { tel: string; onListo: (t: string) => void; onError: (t: string) => void }) {
  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [instagram, setInstagram] = useState('')
  const [cadencia, setCadencia] = useState('semanal')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const guardar = async () => {
    if (!nombre.trim() || guardando) return
    setGuardando(true)
    const previo = await leerMapa<Lead>('crmleads', 'bdi')
    if (!previo.ok) {
      setGuardando(false)
      onError('No se pudo leer los leads, así que no se guarda: guardar ahora borraría los que hay.')
      return
    }
    const id = nuevoIdLead(Date.now(), Math.random())
    const lead: Lead = { ...leadNuevo(id), nombre: nombre.trim(), telefono: tel, ciudad: ciudad.trim(), instagram: instagram.trim(), cadencia }
    const mapa: MapaLeads = { ...previo.dato, [id]: lead }
    const r = await guardarMapa({ kind: 'crmleads', store: 'bdi', mapa, cargado: true })
    setGuardando(false)
    if (!r.ok) {
      onError('No se pudo guardar el lead: ' + r.motivo)
      return
    }
    setGuardado(true)
    onListo('Guardado como lead')
  }

  if (guardado)
    return (
      <div style={{ padding: space[3] }}>
        <div style={{ fontSize: font.sm, color: color.ink }}>
          <b>{nombre}</b> quedó guardado como lead.
        </div>
        <a href="/clientes" target="_blank" rel="noreferrer" style={{ fontSize: font.sm, color: color.brand, textDecoration: 'none' }}>
          Verlo en Leads ↗
        </a>
      </div>
    )

  return (
    <div style={{ padding: space[3] }}>
      <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>Número nuevo</div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 10 }}>{tel} · todavía no compró</div>

      <input className="mo-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre o local" style={{ width: '100%', marginBottom: 6 }} />
      <input className="mo-input" value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Ciudad" style={{ width: '100%', marginBottom: 6 }} />
      <input className="mo-input" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@instagram" style={{ width: '100%', marginBottom: 6 }} />
      <select className="mo-input" value={cadencia} onChange={(e) => setCadencia(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
        <option value="semanal">Hablarle cada semana</option>
        <option value="quincenal">Cada 15 días</option>
        <option value="mensual">Una vez por mes</option>
      </select>

      <Button size="sm" disabled={!nombre.trim() || guardando} onClick={guardar}>
        {guardando ? 'Guardando…' : 'Guardar como lead'}
      </Button>
    </div>
  )
}
