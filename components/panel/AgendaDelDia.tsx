'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { color, font, radius, space } from '@/components/ui/tokens'
import { TEMP_UI } from '@/components/crm/temperatura'
import { buscarClientesPorNombre, traerAgenda, traerPorFiltro, type FilaAgenda } from '@/lib/crm/panel'
import { contarCola, contarPorTipo, vistaDe, type FiltroPanel, type VistaTemp } from '@/lib/crm/lista-dia'
import { diasHasta, urgenciaFecha } from '@/lib/crm/core'
import { hoyISO } from '@/lib/crm/seguimiento'
import { leadsDelPanel, type LeadConSeg, type MapaLeads } from '@/lib/crm/leads'
import type { FilaCliente, MapaSeguimiento } from '@/lib/crm/tipos'

/**
 * "Hoy" — la lista del día adentro del panel de WhatsApp.
 *
 * **El problema que cierra.** El panel sabía todo del chat abierto y nada de a quién había que
 * abrir: para eso había que ir al monitor, elegir un nombre, buscarlo en WhatsApp y volver. Con
 * esto el circuito se cierra de un lado solo — tocás un nombre, se abre su chat, aparece su ficha,
 * registrás cómo te fue y seguís.
 *
 * 🔑 **No baja el CRM.** Quiénes entran lo decide el KV (`lib/crm/lista-dia.ts`); el nombre, el
 * teléfono y el total se piden de los que quedaron (`action:'lista'`). La sección baja 27.990
 * ventas para armar su tabla: eso, al costado del chat y rearmándose todo el tiempo, es inviable.
 *
 * ⚠️ **Abrir el chat lo hace la EXTENSIÓN, no esta pantalla.** Acá adentro corre el monitor dentro
 * de un iframe del panel de Chrome: no puede tocar la pestaña de WhatsApp. Le manda el teléfono al
 * contenedor por `postMessage` y la extensión navega. Si el panel se abriera fuera de la extensión
 * (una pestaña normal del monitor), el mensaje no lo escucha nadie y el clic no hace nada — por eso
 * hay un cartel abajo diciéndolo.
 *
 * ═══ Los filtros por tipo (29-ago-2026) ═══
 *
 * 🔴 **La pantalla hace DOS cosas y antes hacía sólo una.** "Hoy" es la cola de trabajo: lo que
 * vence, con tope. Los botones son ir a buscar: todos los de un tipo, venzan o no, sin tope. La
 * diferencia la pidió Darío y es conceptual, no de comodidad — *"que le mande un mensaje a un frío
 * no lo vuelve tibio; la temperatura describe al cliente, no la cola de trabajo"*. De ahí que
 * escribirle a alguien desde un filtro **no le cambie nada**: sólo lo saca de la cola cuando se le
 * pone fecha nueva.
 *
 * ⚠️ **Los botones sólo alcanzan a quien ya está en el KV** (730 clientes, los que alguien tocó
 * alguna vez). Para el resto de los 12.485 del padrón está el buscador, que pregunta al servidor.
 * Por eso los dos conviven: no son dos caminos al mismo lugar.
 */

/** La plata corta, para un renglón de 350 px: "$5,8 M", "$450 mil", "$8.000". */
function fmtCorto(n: number): string {
  const v = Math.round(n)
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M'
  if (v >= 10_000) return '$' + Math.round(v / 1000).toLocaleString('es-AR') + ' mil'
  return '$' + v.toLocaleString('es-AR')
}

/** De a cuántos se muestra. Ver `TOPE_LISTA`: allá es un corte de datos, acá uno que se ve. */
const PAGINA = 25

/** Un solo margen lateral para toda la solapa, como en Pagos. */
const MARGEN = space[3]

/** Días entre una fecha `YYYY-MM-DD` y hoy. Positivo = pasado. */
function haceDias(iso: string, today: Date): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((base.getTime() - new Date(a, m - 1, d).getTime()) / 86400000)
}

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/**
 * Una fila de trabajo, venga de un cliente o de un prospecto.
 *
 * 🔑 **Los prospectos van en la MISMA lista** (Darío, 28-sep-2026). El 29-ago se habían dejado abajo
 * y aparte —un lead no tiene temperatura, y mezclarlo decía que era lo mismo que un cliente—, y
 * en la práctica quedaban debajo de 35 filas: los contactos más frescos eran los que nadie veía.
 * Las dos objeciones se resuelven en la fila, no separando listas: el prospecto lleva su chapa en
 * lugar de la temperatura, y en vez de "última compra" dice que todavía no compró. **Los datos
 * siguen separados** (`crm:leads` y `crm:seg:bdi`); esto es sólo cómo se muestran.
 */
type Item = {
  key: string
  /** 0 = prospecto: el panel lo cruza por teléfono. Ver "`id: 0` = cruzalo por teléfono" en la ficha. */
  id: number
  telefono: string
  nombre: string
  dias: number | null
  prospecto: boolean
  vista: VistaTemp | null
  /** El renglón principal: el ⏳ si hay, si no la última nota. */
  principal: string
  esPendiente: boolean
  /** El renglón chico de abajo: la última compra, o que todavía no compró. */
  meta: string
  /** El escalón de temperatura para ordenar. El prospecto cuenta como templado: no tiene marca. */
  orden: number
}

function itemDeCliente(f: FilaAgenda, today: Date): Item {
  const partes: string[] = []
  if (f.ultimaCompra) {
    const n = haceDias(f.ultimaCompra, today)
    partes.push(n <= 0 ? 'Compró hoy' : `Última compra hace ${dias(n)}`)
  }
  if (f.total > 0) partes.push(`${fmtCorto(f.total)} en total`)
  return {
    key: `c${f.id}`,
    id: f.id,
    telefono: f.telefono,
    nombre: f.nombre,
    dias: f.dias,
    prospecto: false,
    vista: vistaDe(f),
    principal: f.pendiente || f.nota,
    esPendiente: !!f.pendiente,
    meta: partes.join(' · '),
    orden: f.temperatura === 'caliente' ? 0 : 1,
  }
}

function itemDeLead(l: LeadConSeg): Item {
  return {
    key: l.id,
    id: 0,
    telefono: l.telefono,
    nombre: l.nombre || '(sin nombre)',
    dias: l._seg.estado === 'none' || l._seg.estado === 'pendiente' ? null : l._seg.dias,
    prospecto: true,
    vista: null,
    principal: (l.notas || [])[0]?.texto || '',
    esPendiente: false,
    meta: l.ciudad ? `${l.ciudad} · todavía no compró` : 'Todavía no compró',
    orden: 1,
  }
}

/**
 * Una chapita. Las medidas son las de `Chapa` en `Pagos.tsx` y del `Chip` de la ficha (11 px / 600 /
 * 2-8): el mismo panel no puede tener la misma chapita a dos tamaños.
 */
function Chapa({ children, tono = 'neutro' }: { children: React.ReactNode; tono?: 'neutro' | 'nuestro' | 'tarde' | 'espera' | 'hecho' }) {
  const c =
    tono === 'nuestro'
      ? { fg: color.brand, bg: color.brandBg, bd: color.brandBorder }
      : tono === 'tarde'
        ? { fg: color.dangerInk, bg: color.dangerBg, bd: color.dangerBorder }
        : tono === 'hecho'
          ? { fg: color.successInk, bg: color.successBg, bd: color.successBorder }
          : tono === 'espera'
            ? { fg: color.warningInk, bg: color.warningBg, bd: color.warningBorder }
            : { fg: color.mut2, bg: color.bg2, bd: color.line2 }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', border: `1px solid ${c.bd}`, background: c.bg, color: c.fg }}>
      {children}
    </span>
  )
}

/**
 * El estado de la fila, **con nombre y no con frase**: Hoy / Atrasado / Sin fecha.
 *
 * 🔴 **El rojo es sólo para lo que se pasó de una semana.** Antes las 25 filas decían "vencido hace
 * X días" en rojo, y un color que está en todas las filas no marca ninguna: 3 días y 34 días se
 * veían iguales.
 */
function estadoDeFila(d: number | null): { txt: string; tono: 'neutro' | 'nuestro' | 'tarde' | 'espera' } {
  if (d === null) return { txt: 'Sin fecha', tono: 'espera' }
  if (d === 0) return { txt: 'Hoy', tono: 'nuestro' }
  if (d < 0) return { txt: `Atrasado ${-d} d`, tono: -d > 7 ? 'tarde' : 'neutro' }
  return { txt: `En ${d} d`, tono: 'neutro' }
}

/** La temperatura, chica y al lado del nombre. "Sin marcar" no dibuja nada: era ruido en 341 filas. */
const EMOJI_TEMP: Record<VistaTemp, string> = { caliente: '🔥', templado: '🟡', frio: '🧊', sin_marcar: '' }

function Fila({ it, onAbrir, hecho }: { it: Item; onAbrir: (id: number, tel: string) => void; hecho?: { dias: number | null } }) {
  const sinTel = !it.telefono
  const est = estadoDeFila(it.dias)
  const emoji = it.vista ? EMOJI_TEMP[it.vista] : ''
  return (
    <button
      type="button"
      disabled={sinTel}
      onClick={() => onAbrir(it.id, it.telefono)}
      title={sinTel ? 'No tiene teléfono cargado, así que no puedo abrir el chat' : 'Abrir el chat'}
      style={{
        display: 'block',
        width: '100%',
        height: 'auto',
        textAlign: 'left',
        background: color.surface,
        border: 0,
        borderTop: `1px solid ${color.line2}`,
        padding: `${space[2]}px ${MARGEN}px`,
        cursor: sinTel ? 'default' : 'pointer',
        opacity: sinTel || hecho ? 0.6 : 1,
        font: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {emoji && (
          <span title={it.vista ? TEMP_UI[it.vista].txt : undefined} style={{ fontSize: 11, lineHeight: 1 }}>
            {emoji}
          </span>
        )}
        <span style={{ fontSize: font.md, fontWeight: 700, color: color.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {it.nombre}
        </span>
        {it.prospecto && <Chapa>Prospecto</Chapa>}
        <span style={{ flex: 1 }} />
        {hecho ? (
          <Chapa tono="hecho">✓ {hecho.dias !== null && hecho.dias > 0 ? `Vuelve en ${hecho.dias} d` : 'Hecho'}</Chapa>
        ) : (
          <Chapa tono={est.tono}>{est.txt}</Chapa>
        )}
      </div>
      {it.principal && (
        <div
          style={{
            fontSize: font.sm,
            color: color.ink,
            marginTop: 3,
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {it.esPendiente && '⏳ '}
          {it.principal}
        </div>
      )}
      {(it.meta || sinTel) && (
        <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {it.meta}
          {sinTel && (it.meta ? ' · ' : '') + 'sin teléfono'}
        </div>
      )}
    </button>
  )
}

/**
 * El título de un grupo, que además lo pliega.
 *
 * ⚠️ El número va apagado y separado, no con un punto: `Atrasados · 337` se leía como una frase de
 * tres partes del mismo peso. Lo que se busca es la palabra (mismo criterio que `Titulo` en Pagos).
 */
function Grupo({
  titulo,
  cuantas,
  abierto,
  onToggle,
  primero,
  children,
}: {
  titulo: string
  cuantas: number
  abierto: boolean
  onToggle: () => void
  primero?: boolean
  children: React.ReactNode
}) {
  return (
    <section>
      {!primero && <div style={{ height: 8, background: color.bg2, borderTop: `1px solid ${color.line2}` }} />}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: 'auto',
          background: 'none',
          border: 0,
          borderTop: primero ? 0 : `1px solid ${color.line2}`,
          padding: `${space[3]}px ${MARGEN}px ${space[2]}px`,
          cursor: 'pointer',
          font: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: font.sm, fontWeight: 700, color: color.ink }}>{titulo}</span>
        <span style={{ marginLeft: 6, fontSize: font.sm, fontWeight: 600, color: color.mut2, fontVariantNumeric: 'tabular-nums' }}>{cuantas}</span>
        <span style={{ flex: 1 }} />
        {/* El ▾ de texto salía de 4 px con DM Sans: una flecha dibujada se ve igual en todos lados. */}
        <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" style={{ color: color.mut2, transform: abierto ? 'none' : 'rotate(-90deg)', transition: 'transform 0.12s ease' }}>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {abierto && children}
    </section>
  )
}

/** Un renglón gris adentro de un grupo: vacío, o el aviso de que hay más de lo que se ve. */
function Aclaracion({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: `${space[1]}px ${MARGEN}px ${space[3]}px`, fontSize: font.xs, color: color.mut2 }}>{children}</div>
}

/**
 * Los tres números de arriba: Para hoy · Atrasados · Hechos.
 *
 * 🔑 **Es lo que la lista no tenía: una forma de ver que avanza.** Antes el que atendía a alguien
 * lo veía desaparecer y subir al siguiente, y la pantalla quedaba igual. Ahora "Hechos" sube.
 */
function Resumen({ hoy, atrasados, hechos }: { hoy: number; atrasados: number; hechos: number }) {
  const celda = (n: number, txt: string, tono: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: font.xl, fontWeight: 700, color: tono, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
      <div style={{ fontSize: font.xs, color: color.mut2 }}>{txt}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: space[2], padding: `${space[3]}px ${MARGEN}px`, borderTop: `1px solid ${color.line2}`, marginTop: space[2] }}>
      {celda(hoy, 'Para hoy', color.brand)}
      {celda(atrasados, 'Atrasados', atrasados ? color.ink : color.mut2)}
      {celda(hechos, 'Hechos hoy', hechos ? color.successInk : color.mut2)}
    </div>
  )
}

/** El botón de "ver más". Es el único corte de esta pantalla, y se ve — a diferencia del tope. */
function VerMas({ faltan, onClick }: { faltan: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        height: 'auto',
        padding: `${space[2]}px`,
        borderTop: `1px solid ${color.line2}`,
        background: 'none',
        border: 0,
        cursor: 'pointer',
        fontSize: font.xs,
        fontWeight: 700,
        color: color.brand,
      }}
    >
      Ver {Math.min(faltan, PAGINA)} más · quedan {faltan}
    </button>
  )
}

/**
 * Los cinco botones. Los números salen del KV, así que no cuestan una consulta.
 *
 * ⚠️ **"Sin marcar" no es un estado que se guarde**: es la falta de las otras tres marcas. Va
 * separado porque son 340 de 730 y estaban escondidos adentro de 🟡, que tiene 4.
 */
function Filtros({
  filtro,
  conteos,
  onFiltro,
}: {
  filtro: FiltroPanel
  conteos: Record<VistaTemp | 'todos', number>
  onFiltro: (f: FiltroPanel) => void
}) {
  const chips: Array<{ k: FiltroPanel; txt: string; n?: number }> = [
    { k: 'trabajo', txt: 'Lista del día' },
    { k: 'caliente', txt: '🔥', n: conteos.caliente },
    { k: 'templado', txt: '🟡', n: conteos.templado },
    { k: 'sin_marcar', txt: '⚪', n: conteos.sin_marcar },
    { k: 'frio', txt: '🧊', n: conteos.frio },
    { k: 'todos', txt: 'Todos', n: conteos.todos },
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: `${space[2]}px ${space[3]}px 0` }}>
      {chips.map((c) => {
        const activo = filtro === c.k
        return (
          <button
            key={c.k}
            type="button"
            onClick={() => onFiltro(c.k)}
            title={c.k === 'trabajo' ? 'Lo que hay que hacer hoy' : c.k === 'todos' ? 'Todos los clientes que tocaste alguna vez' : TEMP_UI[c.k as VistaTemp].ayuda}
            style={{
              height: 'auto',
              padding: '3px 8px',
              borderRadius: 999,
              fontSize: font.xs,
              fontWeight: 700,
              cursor: 'pointer',
              border: `1px solid ${activo ? color.brandSolid : color.line2}`,
              background: activo ? color.brandBg : 'transparent',
              color: activo ? color.brand : color.mut,
              whiteSpace: 'nowrap',
            }}
          >
            {c.txt}
            {c.n !== undefined && ` ${c.n}`}
          </button>
        )
      })}
    </div>
  )
}

/**
 * El buscador por nombre.
 *
 * 🔑 **Es la única forma de llegar a alguien que nunca tocaste.** Pregunta al servidor por todos
 * los que compraron por el canal mayorista, no por los 730 del KV — o sea que encuentra a la
 * clienta que compró por primera vez la semana pasada, que es justo cuando más falta hace. Ya
 * existía, escondido adentro de "ya es cliente mío, cambió de número".
 */
function Buscador({ onAbrir }: { onAbrir: (id: number, tel: string) => void }) {
  const [q, setQ] = useState('')
  /**
   * El resultado **junto con el texto que lo produjo**, y no un estado aparte de "buscando".
   *
   * ⚠️ Guardar la fase en su propio `useState` obliga a un `setState` sincrónico adentro del
   * efecto, que encadena renders y que el lint del repo rechaza. Con el término adentro del
   * resultado, "está buscando" se deduce en el render: hay texto y todavía no hay respuesta PARA
   * ESE texto. De paso arregla solo el resultado viejo que se ve mientras se sigue tecleando.
   */
  const [res, setRes] = useState<{ q: string; filas: FilaCliente[] } | null>(null)
  const texto = q.trim()
  const corto = texto.length < 2
  const buscando = !corto && res?.q !== texto

  // Se busca al soltar el teclado medio segundo, no en cada tecla: cada búsqueda es una consulta.
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) return
    let vivo = true
    const id = setTimeout(async () => {
      const filas = await buscarClientesPorNombre(t)
      if (vivo) setRes({ q: t, filas })
    }, 400)
    return () => {
      vivo = false
      clearTimeout(id)
    }
  }, [q])

  return (
    <div style={{ padding: `${space[2]}px ${space[3]}px 0` }}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre…"
        style={{
          width: '100%',
          padding: '5px 8px',
          fontSize: font.sm,
          border: `1px solid ${color.line2}`,
          borderRadius: radius.sm,
          background: color.bg,
          color: color.ink,
        }}
      />
      {buscando && <div style={{ fontSize: font.xs, color: color.mut2, padding: '4px 0' }}>Buscando…</div>}
      {!corto && !buscando && !res?.filas.length && (
        <div style={{ fontSize: font.xs, color: color.mut2, padding: '4px 0' }}>Ningún cliente con ese nombre.</div>
      )}
      {!corto &&
        !buscando &&
        (res?.filas || []).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onAbrir(c.id, c.phone || '')}
            disabled={!c.phone}
            title={c.phone ? 'Abrir el chat' : 'No tiene teléfono cargado, así que no puedo abrir el chat'}
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
              textAlign: 'left',
              background: 'none',
              border: 0,
              borderTop: `1px solid ${color.line2}`,
              padding: '5px 0',
              cursor: c.phone ? 'pointer' : 'default',
              opacity: c.phone ? 1 : 0.55,
              font: 'inherit',
            }}
          >
            <div style={{ fontSize: font.sm, fontWeight: 700, color: color.ink }}>{c.name || `#${c.id}`}</div>
            <div style={{ fontSize: font.xs, color: color.mut2 }}>{c.city || 'sin ciudad'}{!c.phone && ' · sin teléfono'}</div>
          </button>
        ))}
    </div>
  )
}

export function AgendaDelDia({
  crmSeg,
  crmLeads,
  today,
  onAbrirChat,
  puedeAbrirChat,
}: {
  crmSeg: MapaSeguimiento
  crmLeads: MapaLeads
  today: Date
  onAbrirChat: (id: number, tel: string) => void
  puedeAbrirChat: boolean
}) {
  const [filtro, setFiltro] = useState<FiltroPanel>('trabajo')
  const [mostrar, setMostrar] = useState(PAGINA)
  const [estado, setEstado] = useState<
    { t: 'cargando' } | { t: 'error'; motivo: string } | { t: 'trabajo'; lista: FilaAgenda[]; frios: FilaAgenda[]; hechos: FilaAgenda[] } | { t: 'filtro'; filas: FilaAgenda[] }
  >({ t: 'cargando' })

  const conteos = useMemo(() => contarPorTipo(crmSeg, today), [crmSeg, today])
  const cola = useMemo(() => contarCola(crmSeg, today), [crmSeg, today])
  /**
   * Qué grupos están abiertos. **Recuperar y Hechos nacen plegados**: los fríos son la segunda
   * etapa del día, y lo hecho es para mirar de reojo. Se recuerda mientras el panel esté abierto,
   * nada más — no es un dato.
   */
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({ hoy: true, atrasados: true, sinFecha: false, frios: false, hechos: false })
  const alternar = (k: string) => setAbiertos((a) => ({ ...a, [k]: !a[k] }))
  const [mostrarAtrasados, setMostrarAtrasados] = useState(PAGINA)

  const pedir = useCallback(async () => {
    if (filtro === 'trabajo') {
      const r = await traerAgenda(crmSeg, today)
      return r.ok ? ({ t: 'trabajo', lista: r.lista, frios: r.frios, hechos: r.hechos } as const) : ({ t: 'error', motivo: r.motivo } as const)
    }
    const r = await traerPorFiltro(crmSeg, today, filtro)
    return r.ok ? ({ t: 'filtro', filas: r.filas } as const) : ({ t: 'error', motivo: r.motivo } as const)
  }, [crmSeg, today, filtro])

  // Se recarga cuando cambia el mapa de seguimiento: al registrar un contacto en la ficha, el que
  // se acaba de atender tiene que salir de la lista sin que haya que refrescar nada. Y cuando
  // cambia el filtro, que es otra consulta con otros ids.
  //
  // ⚠️ El estado se toca DESPUÉS del await, nunca en el cuerpo del efecto: un setState sincrónico
  // acá encadena renders (y el lint del repo lo rechaza).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const e = await pedir()
      if (vivo) setEstado(e)
    })()
    return () => {
      vivo = false
    }
  }, [pedir])

  const cambiarFiltro = (f: FiltroPanel) => {
    if (f === filtro) return
    setFiltro(f)
    setMostrar(PAGINA)
    setEstado({ t: 'cargando' })
  }

  const reintentar = () => {
    setEstado({ t: 'cargando' })
    pedir().then(setEstado)
  }

  /**
   * El buscador y los botones se dibujan SIEMPRE, también mientras carga.
   *
   * 🔑 Son los controles, no el resultado: si desaparecieran al tocar un botón, la pantalla
   * saltaría en cada filtro y el que lo tocó no vería que su clic hizo algo.
   *
   * ⚠️ **El cartel de "fuera de WhatsApp" NO va acá**, y está amarrado por
   * `crm-panel-agenda.test.tsx`: mientras carga no se sabe todavía si va a haber lista, y un aviso
   * sobre algo que no se ve es ruido.
   */
  const cabecera = (
    <>
      <Buscador onAbrir={onAbrirChat} />
      <Filtros filtro={filtro} conteos={conteos} onFiltro={cambiarFiltro} />
    </>
  )

  const avisoExtension = !puedeAbrirChat && (
    <div style={{ margin: space[3], fontSize: font.xs, color: color.mut, background: color.bg2, border: `1px solid ${color.line2}`, borderRadius: radius.sm, padding: '6px 8px' }}>
      Estás viendo esta lista fuera de WhatsApp, así que tocar un nombre no abre nada. Adentro del
      panel de la extensión sí.
    </div>
  )

  if (estado.t === 'cargando')
    return (
      <div>
        {cabecera}
        <div style={{ padding: space[3], fontSize: font.xs, color: color.mut2 }}>Cargando la lista…</div>
      </div>
    )

  if (estado.t === 'error')
    return (
      <div>
        {cabecera}
        <div style={{ padding: space[3] }}>
          <div style={{ fontSize: font.xs, color: color.dangerInk, background: color.dangerBg, border: `1px solid ${color.dangerBorder}`, borderRadius: radius.sm, padding: '6px 8px' }}>
            No pude traer la lista. {estado.motivo}
          </div>
          <button type="button" onClick={reintentar} style={{ marginTop: 8, height: 'auto', fontSize: font.xs, color: color.brand, background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
            Probar de nuevo
          </button>
        </div>
      </div>
    )

  // ── Un tipo: todos los de ese tipo, venzan o no, de a PAGINA ───────────────
  if (estado.t === 'filtro') {
    const { filas } = estado
    const nombre = filtro === 'todos' ? 'Todos' : TEMP_UI[filtro as VistaTemp].txt
    return (
      <div>
        {cabecera}
        {avisoExtension}
        {!filas.length ? (
          <div style={{ padding: space[3], fontSize: font.sm, color: color.mut }}>
            No hay ningún cliente {filtro === 'todos' ? 'en la lista' : `marcado ${nombre.toLowerCase()}`}.
          </div>
        ) : (
          <>
            <div style={{ padding: `${space[3]}px ${MARGEN}px ${space[2]}px`, borderTop: `1px solid ${color.line2}`, marginTop: space[2] }}>
              <span style={{ fontSize: font.sm, fontWeight: 700, color: color.ink }}>{nombre}</span>
              <span style={{ marginLeft: 6, fontSize: font.sm, fontWeight: 600, color: color.mut2, fontVariantNumeric: 'tabular-nums' }}>{filas.length}</span>
              <div style={{ fontSize: font.xs, color: color.mut2 }}>
                {filtro === 'frio' ? 'Atrasados primero, y adentro el que más compró.' : 'Atrasados primero. Los que no vencen también están.'}
              </div>
            </div>
            {filas.slice(0, mostrar).map((f) => (
              <Fila key={f.id} it={itemDeCliente(f, today)} onAbrir={onAbrirChat} />
            ))}
            {filas.length > mostrar && <VerMas faltan={filas.length - mostrar} onClick={() => setMostrar((n) => n + PAGINA)} />}
          </>
        )}
      </div>
    )
  }

  // ── La cola de trabajo, que es el default ─────────────────────────────────
  const { lista, frios, hechos } = estado
  const leads = leadsDelPanel(crmLeads, today).map(itemDeLead)
  const hoyISOs = hoyISO(today)
  const leadsHechos = Object.values(crmLeads || {})
    .filter((l) => l && l.estado === 'activo' && l.ultimo_contacto === hoyISOs)
    .map((l) => ({ it: itemDeLead({ ...l, _seg: { proximo: l.proximo_manual, estado: 'aldia', dias: diasHasta(l.proximo_manual, today) } }), dias: diasHasta(l.proximo_manual, today) }))

  /**
   * Para hoy = lo agendado para hoy, clientes y prospectos. Los clientes van primero: vienen ya
   * ordenados por temperatura.
   *
   * ⚠️ **Los prospectos SIN FECHA no van acá, van a su propio grupo.** La idea era meterlos en
   * "Para hoy" para empujar a agendarlos; con los datos reales del 28-sep eran **29 de 51** y
   * llenaban el grupo entero de prospectos, tapando a los clientes. Plegados y aparte se ve cuántos
   * son sin que se coman la lista.
   */
  const deClientes = lista.map((f) => itemDeCliente(f, today))
  const paraHoy = [...deClientes.filter((i) => i.dias === 0), ...leads.filter((i) => i.dias === 0)].sort((a, b) => a.orden - b.orden)
  const sinFecha = leads.filter((i) => i.dias === null)
  /**
   * Atrasados: el mismo orden que `listaDelDia` — 🔥 primero, y adentro el más reciente primero
   * (`urgenciaFecha`, el del 27-ago). Los prospectos entran como templados, mezclados por fecha.
   * ⚠️ Ordenar sólo por fecha mandaba a un 🔥 de hace 27 días debajo de veinte tibios de ayer.
   */
  const porOrden = (a: Item, b: Item) => a.orden - b.orden || urgenciaFecha(a.dias) - urgenciaFecha(b.dias)
  const atrasados = [...deClientes.filter((i) => i.dias !== 0), ...leads.filter((i) => i.dias !== null && i.dias < 0)].sort(porOrden)
  const leadsAtrasados = leads.filter((i) => i.dias !== null && i.dias < 0).length
  const totalAtrasados = cola.atrasados + leadsAtrasados
  const totalHoy = cola.hoy + leads.filter((i) => i.dias === 0).length
  const hechosItems = [
    ...hechos.map((f) => ({ it: itemDeCliente(f, today), dias: f.dias })),
    ...leadsHechos,
  ]

  if (!paraHoy.length && !atrasados.length && !sinFecha.length && !frios.length && !hechosItems.length)
    return (
      <div>
        {cabecera}
        {avisoExtension}
        <div style={{ padding: space[3], fontSize: font.sm, color: color.mut }}>
          No hay nadie para contactar hoy. Cuando venza el próximo, aparece acá.
        </div>
      </div>
    )

  return (
    <div>
      {cabecera}
      {avisoExtension}
      <Resumen hoy={totalHoy} atrasados={totalAtrasados} hechos={hechosItems.length} />

      <Grupo titulo="Para hoy" cuantas={totalHoy} abierto={abiertos.hoy} onToggle={() => alternar('hoy')}>
        {paraHoy.map((it) => (
          <Fila key={it.key} it={it} onAbrir={onAbrirChat} />
        ))}
        {!paraHoy.length && <Aclaracion>No hay nadie agendado para hoy.</Aclaracion>}
      </Grupo>

      {atrasados.length > 0 && (
        <Grupo titulo="Atrasados" cuantas={totalAtrasados} abierto={abiertos.atrasados} onToggle={() => alternar('atrasados')}>
          {atrasados.slice(0, mostrarAtrasados).map((it) => (
            <Fila key={it.key} it={it} onAbrir={onAbrirChat} />
          ))}
          {atrasados.length > mostrarAtrasados && (
            <VerMas faltan={atrasados.length - mostrarAtrasados} onClick={() => setMostrarAtrasados((n) => n + PAGINA)} />
          )}
          {/*
            ⚠️ La cola de clientes viene cortada en `TOPE_LISTA` desde `lista-dia.ts`: el título dice
            la pila entera y esto dice que no se ve toda. Un corte que no se ve es el defecto que
            esta lista ya pagó dos veces.
          */}
          {totalAtrasados > atrasados.length && (
            <Aclaracion>
              Se ven los {atrasados.length} más recientes. A medida que los agendás, suben los siguientes.
            </Aclaracion>
          )}
        </Grupo>
      )}

      {sinFecha.length > 0 && (
        <Grupo titulo="Prospectos sin fecha" cuantas={sinFecha.length} abierto={abiertos.sinFecha} onToggle={() => alternar('sinFecha')}>
          {sinFecha.map((it) => (
            <Fila key={it.key} it={it} onAbrir={onAbrirChat} />
          ))}
          <Aclaracion>No están en ninguna lista hasta que les pongas fecha. Abrí el chat y agendalos.</Aclaracion>
        </Grupo>
      )}

      {frios.length > 0 && (
        <Grupo titulo="🧊 Recuperar" cuantas={frios.length} abierto={abiertos.frios} onToggle={() => alternar('frios')}>
          {frios.map((f) => (
            <Fila key={f.id} it={itemDeCliente(f, today)} onAbrir={onAbrirChat} />
          ))}
          <Aclaracion>La tanda de hoy, primero el que más compró. Para verlos a todos, tocá 🧊 arriba.</Aclaracion>
        </Grupo>
      )}

      {hechosItems.length > 0 && (
        <Grupo titulo="Hechos hoy" cuantas={hechosItems.length} abierto={abiertos.hechos} onToggle={() => alternar('hechos')}>
          {hechosItems.map(({ it, dias: d }) => (
            <Fila key={it.key} it={it} onAbrir={onAbrirChat} hecho={{ dias: d }} />
          ))}
        </Grupo>
      )}
    </div>
  )
}
