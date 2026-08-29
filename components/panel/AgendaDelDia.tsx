'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { color, font, radius, space } from '@/components/ui/tokens'
import { TEMP_UI } from '@/components/crm/temperatura'
import { buscarClientesPorNombre, traerAgenda, traerPorFiltro, type FilaAgenda } from '@/lib/crm/panel'
import { contarPorTipo, vistaDe, type FiltroPanel, type VistaTemp } from '@/lib/crm/lista-dia'
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

const fmtMonto = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

/** De a cuántos se muestra. Ver `TOPE_LISTA`: allá es un corte de datos, acá uno que se ve. */
const PAGINA = 25

/** Hace cuánto vence, en el idioma en que se piensa la lista. */
function cuando(dias: number | null): string {
  if (dias === null) return 'sin agendar'
  if (dias === 0) return 'vence hoy'
  if (dias < 0) return `vencido hace ${-dias} ${-dias === 1 ? 'día' : 'días'}`
  return `en ${dias} ${dias === 1 ? 'día' : 'días'}`
}

function Fila({ f, onAbrir }: { f: FilaAgenda; onAbrir: (id: number, tel: string) => void }) {
  const t = TEMP_UI[vistaDe(f)]
  const sinTel = !f.telefono
  return (
    <button
      type="button"
      disabled={sinTel}
      onClick={() => onAbrir(f.id, f.telefono)}
      title={sinTel ? 'No tiene teléfono cargado, así que no puedo abrir el chat' : 'Abrir el chat'}
      style={{
        display: 'block',
        width: '100%',
        height: 'auto',
        textAlign: 'left',
        background: 'none',
        border: 0,
        borderTop: `1px solid ${color.line2}`,
        padding: `${space[2]}px ${space[3]}px`,
        cursor: sinTel ? 'default' : 'pointer',
        opacity: sinTel ? 0.55 : 1,
        font: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: font.sm, fontWeight: 700, color: color.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.nombre}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, border: `1px solid ${t.bd}`, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>
          {t.txt}
        </span>
      </div>
      <div style={{ fontSize: font.xs, color: f.dias !== null && f.dias < 0 ? color.dangerInk : color.mut2 }}>
        {cuando(f.dias)}
        {sinTel && ' · sin teléfono'}
      </div>
      {f.nota && (
        <div style={{ fontSize: font.xs, color: color.mut, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          “{f.nota}”
        </div>
      )}
    </button>
  )
}

function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ padding: `${space[3]}px ${space[3]}px ${space[2]}px` }}>
      <div style={{ fontSize: font.sm, fontWeight: 700, color: color.ink }}>{children}</div>
      {sub && <div style={{ fontSize: font.xs, color: color.mut2 }}>{sub}</div>}
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
    { k: 'trabajo', txt: 'Hoy' },
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

/**
 * Los prospectos, **abajo y aparte**.
 *
 * 🔴 **Decisión de Bruno el 29-ago-2026: aparte, no mezclados con los botones.** Un lead no tiene
 * temperatura —es activo, comprado o descartado— así que no cabe adentro de 🔥/🟡/⚪/🧊 sin
 * inventarle una; y mezclarlo en la misma lista diría que un lead y un cliente son la misma cosa,
 * cuando de uno se sabe lo que compró y del otro nada todavía.
 */
function Leads({ leads, today, onAbrirChat }: { leads: MapaLeads; today: Date; onAbrirChat: (id: number, tel: string) => void }) {
  const lista: LeadConSeg[] = useMemo(() => leadsDelPanel(leads, today), [leads, today])
  const [mostrar, setMostrar] = useState(PAGINA)
  if (!lista.length) return null

  return (
    <>
      <div style={{ height: 8, background: color.bg2, borderTop: `1px solid ${color.line2}`, borderBottom: `1px solid ${color.line2}`, marginTop: space[3] }} />
      <Titulo sub="Todavía no compraron. Los que no tienen fecha van al final.">Prospectos · {lista.length}</Titulo>
      {lista.slice(0, mostrar).map((l) => {
        const sinTel = !l.telefono
        return (
          <button
            key={l.id}
            type="button"
            disabled={sinTel}
            onClick={() => onAbrirChat(0, l.telefono)}
            title={sinTel ? 'No tiene teléfono cargado, así que no puedo abrir el chat' : 'Abrir el chat'}
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
              textAlign: 'left',
              background: 'none',
              border: 0,
              borderTop: `1px solid ${color.line2}`,
              padding: `${space[2]}px ${space[3]}px`,
              cursor: sinTel ? 'default' : 'pointer',
              opacity: sinTel ? 0.55 : 1,
              font: 'inherit',
            }}
          >
            <div style={{ fontSize: font.sm, fontWeight: 700, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {l.nombre || '(sin nombre)'}
            </div>
            <div style={{ fontSize: font.xs, color: l._seg.estado === 'vencido' ? color.dangerInk : color.mut2 }}>
              {l._seg.estado === 'none' || l._seg.estado === 'pendiente' ? 'sin agendar' : cuando(l._seg.dias)}
              {l.ciudad && ` · ${l.ciudad}`}
              {sinTel && ' · sin teléfono'}
            </div>
            {(l.notas || [])[0] && (
              <div style={{ fontSize: font.xs, color: color.mut, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                “{l.notas[0].texto}”
              </div>
            )}
          </button>
        )
      })}
      {lista.length > mostrar && <VerMas faltan={lista.length - mostrar} onClick={() => setMostrar((n) => n + PAGINA)} />}
    </>
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
    { t: 'cargando' } | { t: 'error'; motivo: string } | { t: 'trabajo'; lista: FilaAgenda[]; frios: FilaAgenda[] } | { t: 'filtro'; filas: FilaAgenda[] }
  >({ t: 'cargando' })

  const conteos = useMemo(() => contarPorTipo(crmSeg, today), [crmSeg, today])

  const pedir = useCallback(async () => {
    if (filtro === 'trabajo') {
      const r = await traerAgenda(crmSeg, today)
      return r.ok ? ({ t: 'trabajo', lista: r.lista, frios: r.frios } as const) : ({ t: 'error', motivo: r.motivo } as const)
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
            <Titulo sub={filtro === 'frio' ? 'Vencidos primero, y adentro el que más compró.' : 'Vencidos primero. Los que no vencen también están.'}>
              {nombre} · {filas.length}
            </Titulo>
            {filas.slice(0, mostrar).map((f) => (
              <Fila key={f.id} f={f} onAbrir={onAbrirChat} />
            ))}
            {filas.length > mostrar && <VerMas faltan={filas.length - mostrar} onClick={() => setMostrar((n) => n + PAGINA)} />}
          </>
        )}
      </div>
    )
  }

  // ── La cola de trabajo, que es el default ─────────────────────────────────
  const { lista, frios } = estado
  const leadsHay = leadsDelPanel(crmLeads, today).length > 0
  if (!lista.length && !frios.length && !leadsHay)
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

      <Titulo sub="Tibios y calientes que ya vencen. Los de hoy primero.">Para contactar · {lista.length}</Titulo>
      {lista.map((f) => (
        <Fila key={f.id} f={f} onAbrir={onAbrirChat} />
      ))}
      {!lista.length && (
        <div style={{ padding: `0 ${space[3]}px ${space[2]}px`, fontSize: font.xs, color: color.mut2 }}>
          Nada pendiente. Terminaste la lista del día.
        </div>
      )}

      {frios.length > 0 && (
        <>
          <div style={{ height: 8, background: color.bg2, borderTop: `1px solid ${color.line2}`, borderBottom: `1px solid ${color.line2}`, marginTop: space[3] }} />
          <Titulo sub={`La tanda de hoy. Primero el que más compró: ${fmtMonto(frios[0].total)} el primero.`}>
            🧊 Recuperar · {frios.length}
          </Titulo>
          {frios.map((f) => (
            <Fila key={f.id} f={f} onAbrir={onAbrirChat} />
          ))}
          <div style={{ padding: `0 ${space[3]}px ${space[2]}px`, fontSize: font.xs, color: color.mut2 }}>
            Para verlos a todos, tocá 🧊 acá arriba.
          </div>
        </>
      )}

      <Leads leads={crmLeads} today={today} onAbrirChat={onAbrirChat} />
    </div>
  )
}
