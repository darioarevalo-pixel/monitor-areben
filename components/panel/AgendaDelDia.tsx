'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { color, font, radius, space } from '@/components/ui/tokens'
import { Icono } from '@/components/ui'
import { SOBRE_OSCURO } from './oscuro'
import { TEMP_UI } from '@/components/crm/temperatura'
import { buscarClientesPorNombre, telsQueSonClientes, traerAgenda, traerPorFiltro, type FilaAgenda } from '@/lib/crm/panel'
import { contarCola, contarPorTipo, vistaDe, type FiltroPanel, type VistaTemp } from '@/lib/crm/lista-dia'
import { diasHasta } from '@/lib/crm/core'
import { hoyISO } from '@/lib/crm/seguimiento'
import { leadsDelPanel, type LeadConSeg, type MapaLeads } from '@/lib/crm/leads'
import { indexarEscritos, leEscribisteHoy, type EscritosHoy } from '@/lib/crm/escritos'
import type { FilaCliente, MapaSeguimiento } from '@/lib/crm/tipos'
import { armarFilasPedidos, traerPedidosCatalogo, type FilaPedido, type ResultadoCatalogo, type UltimosMios } from '@/lib/crm/pedidos-catalogo'
import { pasoDe, pendientesLogistica, sugerenciaDe, type PendienteLogistica, type Resultado } from '@/lib/crm/logistica'
import { mostrar as plata } from '@/lib/compromisos/core'

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
  // Rediseño del 19-oct-2026: el mismo color que la ficha — Hoy en amarillo, Sin fecha en gris.
  if (d === null) return { txt: 'Sin fecha', tono: 'neutro' }
  if (d === 0) return { txt: 'Hoy', tono: 'espera' }
  if (d < 0) return { txt: `Atrasado ${-d} d`, tono: -d > 7 ? 'tarde' : 'neutro' }
  return { txt: `En ${d} d`, tono: 'neutro' }
}

/** A quién le escribiste hoy. Va por contexto para no pasarlo por las siete listas de `Fila`. */
const EscritosCtx = createContext<EscritosHoy>(new Set())

/** La temperatura, chica y al lado del nombre. "Sin marcar" no dibuja nada: era ruido en 341 filas. */
const EMOJI_TEMP: Record<VistaTemp, string> = { caliente: '🔥', templado: '🟡', frio: '🧊', sin_marcar: '' }

/**
 * Un renglón: **el nombre abre la ficha y el botón verde abre el chat** (Darío, 15-oct-2026).
 *
 * 🔑 Antes el renglón entero abría el chat, y para corregirle algo a una persona había que pasar por
 * su conversación —con WhatsApp recargando— aunque no se le fuera a escribir. Ahora son dos gestos:
 * mirar/cambiar la ficha, o ir a hablarle.
 *
 * ⚠️ Son dos `<button>` hermanos y no uno adentro del otro: un botón dentro de un botón no es HTML
 * válido y el clic del de adentro dispara también el de afuera.
 */
function Fila({ it, onAbrir, onFicha, hecho }: { it: Item; onAbrir: (id: number, tel: string) => void; onFicha: (id: number, tel: string) => void; hecho?: { dias: number | null } }) {
  // 🔴 Le escribiste hoy (según WhatsApp Web) y sigue sin fecha para adelante: hay que marcarla.
  const escritos = useContext(EscritosCtx)
  const faltaFecha = !hecho && (it.dias === null || it.dias <= 0) && leEscribisteHoy(escritos, [it.telefono])
  const sinTel = !it.telefono
  // Un prospecto se encuentra por teléfono (`id: 0`): sin teléfono no hay ficha que abrir.
  const sinFicha = it.prospecto && sinTel
  const est = estadoDeFila(it.dias)
  const emoji = it.vista ? EMOJI_TEMP[it.vista] : ''
  /**
   * La rayita de la izquierda, con el color de la ficha (rediseño del 19-oct-2026): rojo lo que hay
   * que resolver, amarillo hoy, verde hecho. El atrasado de pocos días queda sin raya, por la misma
   * regla de la chapa: un color en todas las filas no marca ninguna.
   */
  const raya = faltaFecha || est.tono === 'tarde' ? color.danger : hecho ? color.success : it.dias === 0 ? color.warning : 'transparent'
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderTop: `1px solid ${color.line2}`, borderLeft: `3px solid ${raya}`, background: color.surface, opacity: hecho ? 0.6 : 1 }}>
      <button
        type="button"
        disabled={sinFicha}
        onClick={() => onFicha(it.id, it.telefono)}
        title="Ver la ficha"
        style={{
          display: 'block',
          flex: 1,
          minWidth: 0,
          height: 'auto',
          textAlign: 'left',
          background: 'none',
          border: 0,
          padding: `${space[2]}px 0 ${space[2]}px ${MARGEN}px`,
          cursor: sinFicha ? 'default' : 'pointer',
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
          {faltaFecha ? (
            <Chapa tono="tarde">Le escribiste · falta fecha</Chapa>
          ) : hecho ? (
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
      <div style={{ display: 'flex', alignItems: 'center', padding: `0 ${MARGEN}px 0 ${space[2]}px` }}>
        <button
          type="button"
          disabled={sinTel}
          onClick={() => onAbrir(it.id, it.telefono)}
          title={sinTel ? 'No tiene teléfono cargado, así que no puedo abrir el chat' : 'Abrir el chat'}
          aria-label={`Abrir el chat de ${it.nombre}`}
          style={{
            width: 32,
            minWidth: 32,
            height: 32,
            padding: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: radius.md,
            border: sinTel ? `1px solid ${color.line2}` : 0,
            background: sinTel ? 'none' : color.whatsapp,
            color: sinTel ? color.mut2 : color.sideActiveInk,
            cursor: sinTel ? 'default' : 'pointer',
            opacity: sinTel ? 0.5 : 1,
          }}
        >
          <Icono nombre="whatsapp" size={16} />
        </button>
      </div>
    </div>
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

/**
 * Los pedidos del catálogo de hoy y ayer (Darío, 20-oct-2026). Ver `lib/crm/pedidos-catalogo.ts`.
 *
 * 🔑 Se pide al montar y cada 2 minutos mientras el panel está abierto. Lo último que llegó queda
 * en `memoriaPedidos`, afuera del componente: volver de la ficha no lo deja en blanco.
 */
const CADA_PEDIDOS_MS = 2 * 60_000
const memoriaPedidos: { r: ResultadoCatalogo | null } = { r: null }

function usePedidosCatalogo(): ResultadoCatalogo | null {
  const [r, setR] = useState<ResultadoCatalogo | null>(memoriaPedidos.r)
  useEffect(() => {
    let vivo = true
    const pedir = async () => {
      const x = await traerPedidosCatalogo()
      // Un error pasajero no borra lo que ya se estaba viendo.
      if (x.t === 'error' && memoriaPedidos.r?.t === 'ok') return
      memoriaPedidos.r = x
      if (vivo) setR(x)
    }
    pedir()
    const id = setInterval(pedir, CADA_PEDIDOS_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])
  return r
}

const horaDe = (iso: string, ayer: boolean) => {
  const d = new Date(iso)
  const h = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return ayer ? `Ayer ${h}` : `Hoy ${h}`
}

/** Un pedido: el nombre abre la ficha (se busca por teléfono) y el botón verde, el chat. Como `Fila`. */
function FilaDePedido({ p, onAbrir, onFicha }: { p: FilaPedido; onAbrir: (id: number, tel: string) => void; onFicha: (id: number, tel: string) => void }) {
  const sinTel = !p.telefono
  const nombre = p.cliente || 'Sin nombre'
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderTop: `1px solid ${color.line2}`, borderLeft: `3px solid ${p.hablado ? color.success : color.danger}`, background: color.surface, opacity: p.hablado ? 0.6 : 1 }}>
      <button
        type="button"
        disabled={sinTel}
        onClick={() => onFicha(0, p.telefono)}
        title="Ver la ficha"
        style={{ display: 'block', flex: 1, minWidth: 0, height: 'auto', textAlign: 'left', background: 'none', border: 0, padding: `${space[2]}px 0 ${space[2]}px ${MARGEN}px`, cursor: sinTel ? 'default' : 'pointer', font: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: font.md, fontWeight: 700, color: color.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
          <span style={{ flex: 1 }} />
          {p.hablado ? <Chapa tono="hecho">Ya le escribiste</Chapa> : <Chapa tono="tarde">Sin hablar</Chapa>}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {horaDe(p.fecha, p.ayer)} · {p.unidades} u. · {plata(p.total)}
        </div>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', padding: `0 ${MARGEN}px 0 ${space[2]}px` }}>
        <button
          type="button"
          disabled={sinTel}
          onClick={() => onAbrir(0, p.telefono)}
          title="Abrir el chat"
          aria-label={`Abrir el chat de ${nombre}`}
          style={{ width: 32, minWidth: 32, height: 32, padding: 0, display: 'grid', placeItems: 'center', borderRadius: radius.md, border: 0, background: color.whatsapp, color: color.sideActiveInk, cursor: 'pointer' }}
        >
          <Icono nombre="whatsapp" size={16} />
        </button>
      </div>
    </div>
  )
}

/** El grupo «Pidieron hoy y ayer», arriba de todo en «Hoy». Sin permiso no se dibuja. */
function GrupoPedidos({
  r,
  pedidos,
  carritos,
  abierto,
  onToggle,
  onAbrir,
  onFicha,
}: {
  r: ResultadoCatalogo | null
  pedidos: FilaPedido[]
  carritos: FilaPedido[]
  abierto: boolean
  onToggle: () => void
  onAbrir: (id: number, tel: string) => void
  onFicha: (id: number, tel: string) => void
}) {
  if (!r || r.t === 'sin-permiso') return null
  return (
    <Grupo titulo="Pidieron hoy y ayer" cuantas={pedidos.length + carritos.length} abierto={abierto} onToggle={onToggle}>
      {r.t === 'error' && <Aclaracion>No pude traer los pedidos del catálogo. {r.motivo}</Aclaracion>}
      {pedidos.map((p) => (
        <FilaDePedido key={p.key} p={p} onAbrir={onAbrir} onFicha={onFicha} />
      ))}
      {r.t === 'ok' && !pedidos.length && <Aclaracion>Todavía no entró ningún pedido.</Aclaracion>}
      {carritos.length > 0 && (
        <>
          <div style={{ padding: `${space[3]}px ${MARGEN}px ${space[1]}px`, fontSize: font.xs, fontWeight: 700, color: color.mut2 }}>
            Armaron pero no confirmaron <span style={{ fontWeight: 600 }}>{carritos.length}</span>
          </div>
          {carritos.map((p) => (
            <FilaDePedido key={p.key} p={p} onAbrir={onAbrir} onFicha={onFicha} />
          ))}
        </>
      )}
    </Grupo>
  )
}

/**
 * Los pedidos de Logística con algún paso pendiente (Darío, 22-oct-2026): forma de entrega, datos,
 * etiqueta o seguimiento. Como los del catálogo, se piden al montar y cada 2 minutos.
 */
type ResultadoLogistica = Resultado<{ count: number; by_step: Record<string, number>; orders: PendienteLogistica[] }>
const memoriaLogistica: { r: ResultadoLogistica | null } = { r: null }

function usePendientesLogistica(): ResultadoLogistica | null {
  const [r, setR] = useState<ResultadoLogistica | null>(memoriaLogistica.r)
  useEffect(() => {
    let vivo = true
    const pedir = async () => {
      const x = await pendientesLogistica()
      if (x.t === 'error' && memoriaLogistica.r?.t === 'ok') return
      memoriaLogistica.r = x
      if (vivo) setR(x)
    }
    pedir()
    const id = setInterval(pedir, CADA_PEDIDOS_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])
  return r
}

/** Un pedido pendiente: el nombre abre la ficha (por su número de cliente de GN) y el verde, el chat. */
function FilaLogistica({ p, onAbrir, onFicha }: { p: PendienteLogistica; onAbrir: (id: number, tel: string) => void; onFicha: (id: number, tel: string) => void }) {
  const id = Number(p.gn_client_id) || 0
  const tel = p.client_phone || ''
  const sugerencia = sugerenciaDe(p)
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderTop: `1px solid ${color.line2}`, borderLeft: `3px solid ${color.warning}`, background: color.surface }}>
      <button
        type="button"
        disabled={!id && !tel}
        onClick={() => onFicha(id, tel)}
        title="Ver la ficha"
        style={{ display: 'block', flex: 1, minWidth: 0, height: 'auto', textAlign: 'left', background: 'none', border: 0, padding: `${space[2]}px 0 ${space[2]}px ${MARGEN}px`, cursor: 'pointer', font: 'inherit' }}
      >
        <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.client_name || 'Sin nombre'}</div>
        <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2 }}>
          Pedido {p.gn_number || p.id} · {p.status.label}
        </div>
        {/* Las palabras del panel, no las de Logística: ver `pasoDe`. */}
        {p.next_step && <div style={{ fontSize: font.xs, color: color.warningInk, marginTop: 2 }}>{pasoDe(p)}</div>}
        {sugerencia && <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2 }}>{sugerencia}</div>}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', padding: `0 ${MARGEN}px 0 ${space[2]}px` }}>
        <button
          type="button"
          disabled={!tel}
          onClick={() => onAbrir(id, tel)}
          title="Abrir el chat"
          aria-label={`Abrir el chat de ${p.client_name}`}
          style={{ width: 32, minWidth: 32, height: 32, padding: 0, display: 'grid', placeItems: 'center', borderRadius: radius.md, border: 0, background: color.whatsapp, color: color.sideActiveInk, cursor: 'pointer' }}
        >
          <Icono nombre="whatsapp" size={16} />
        </button>
      </div>
    </div>
  )
}

/** «Pendientes en Logística», debajo de los pedidos del catálogo. Sin pendientes no se dibuja. */
function GrupoLogistica({
  r,
  abierto,
  onToggle,
  onAbrir,
  onFicha,
}: {
  r: ResultadoLogistica | null
  abierto: boolean
  onToggle: () => void
  onAbrir: (id: number, tel: string) => void
  onFicha: (id: number, tel: string) => void
}) {
  if (!r || r.t === 'sin-permiso') return null
  if (r.t === 'ok' && !r.datos.orders.length) return null
  return (
    <Grupo titulo="Pendientes en Logística" cuantas={r.t === 'ok' ? r.datos.count : 0} abierto={abierto} onToggle={onToggle}>
      {r.t === 'error' && <Aclaracion>No pude traer los pedidos de Logística. {r.motivo}</Aclaracion>}
      {r.t === 'ok' && r.datos.orders.map((p) => <FilaLogistica key={p.id} p={p} onAbrir={onAbrir} onFicha={onFicha} />)}
    </Grupo>
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
function Resumen({ hoy, atrasados, hechos, pedidos }: { hoy: number; atrasados: number; hechos: number; pedidos?: number | null }) {
  // En azul noche, como el encabezado de la ficha (rediseño del 19-oct-2026), y cada número con el
  // color de su estado: amarillo hoy, rojo atrasado, verde hecho.
  const celda = (n: number, txt: string, tono: string) => (
    <div style={{ flex: 1, minWidth: 0, background: color.bg2, border: `1px solid ${color.line}`, borderRadius: radius.md, padding: '6px 8px' }}>
      <div style={{ fontSize: font.xl, fontWeight: 700, color: n ? tono : color.mut2, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
      <div style={{ fontSize: font.xs, color: color.mut2 }}>{txt}</div>
    </div>
  )
  return (
    <div style={{ ...SOBRE_OSCURO, display: 'flex', gap: space[2], padding: `${space[3]}px ${MARGEN}px` }}>
      {/* Sólo si el catálogo contestó: a quien no es admin no se le muestra un 0 que no es cierto. */}
      {pedidos != null && celda(pedidos, 'Pedidos sin hablar', color.brand)}
      {celda(hoy, 'Para hoy', color.warningInk)}
      {celda(atrasados, 'Atrasados', color.dangerInk)}
      {celda(hechos, 'Hechos hoy', color.successInk)}
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

type EstadoAgenda =
  | { t: 'cargando' }
  | { t: 'error'; motivo: string }
  | { t: 'trabajo'; lista: FilaAgenda[]; frios: FilaAgenda[]; hechos: FilaAgenda[] }
  | { t: 'filtro'; filas: FilaAgenda[] }

/**
 * Lo que la lista recuerda mientras el panel esté abierto, **afuera del componente**.
 *
 * 🔑 **Por qué afuera** (Darío, 15-oct-2026: *"tiene que ser estático salvo movimiento"*). Tocar a
 * alguien lleva a la solapa Cliente, y eso desmonta esta pantalla: al volver se rearmaba de cero —
 * "Cargando la lista…", los grupos plegados de nuevo, arriba de todo y con el orden recalculado.
 * Acá queda lo último que se vio, se dibuja al instante y la consulta corre por detrás.
 *
 * 🔑 **`posiciones` es lo que la deja quieta.** La primera vez que aparece alguien se le da un
 * lugar y lo conserva: registrarle algo a uno lo saca de su grupo y los demás no se corren. El que
 * entra después va al final. Se rearma sólo al recargar el panel.
 */
const memoria: {
  filtro: FiltroPanel
  estado: EstadoAgenda
  abiertos: Record<string, boolean>
  mostrar: number
  mostrarAtrasados: number
  scroll: number
  posiciones: Map<string, number>
} = {
  filtro: 'trabajo',
  estado: { t: 'cargando' },
  abiertos: { pedidos: true, hoy: true, atrasados: true, sinFecha: false, frios: false, hechos: false },
  mostrar: PAGINA,
  mostrarAtrasados: PAGINA,
  scroll: 0,
  posiciones: new Map(),
}

/**
 * Ordena con el orden que trae `base` la primera vez y lo congela (ver `memoria.posiciones`).
 * Es idempotente: dibujar dos veces la misma lista no mueve a nadie.
 */
export function estable<T>(items: T[], clave: (x: T) => string, base: (a: T, b: T) => number): T[] {
  const pos = memoria.posiciones
  for (const it of [...items].sort(base)) {
    const k = clave(it)
    if (!pos.has(k)) pos.set(k, pos.size)
  }
  return [...items].sort((a, b) => (pos.get(clave(a)) ?? 0) - (pos.get(clave(b)) ?? 0))
}

/**
 * El orden de la lista: **el más atrasado arriba**, y a igual atraso 🔥 primero (Darío, 15-oct-2026).
 *
 * ⚠️ No reabre el problema del 27-ago (`urgenciaFecha`): aquel era QUIÉNES entran en el tope de 25,
 * y eso lo sigue decidiendo `listaDelDia` en el servidor con la misma regla. Esto sólo ordena a los
 * que ya entraron, y los de hoy tienen su propio grupo.
 */
const porAtraso = (a: Item, b: Item) => (a.dias ?? 0) - (b.dias ?? 0) || a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')

export function AgendaDelDia({
  crmSeg,
  crmLeads,
  today,
  onAbrirChat,
  onVerFicha,
  puedeAbrirChat,
  escritos,
  ultimos,
}: {
  crmSeg: MapaSeguimiento
  crmLeads: MapaLeads
  today: Date
  onAbrirChat: (id: number, tel: string) => void
  /** Abre la ficha en la solapa Cliente SIN abrir el chat. `id: 0` = prospecto, se busca por teléfono. */
  onVerFicha: (id: number, tel: string) => void
  puedeAbrirChat: boolean
  /** A quién le escribiste hoy según WhatsApp Web. Sin extensión llega vacío. */
  escritos?: EscritosHoy
  /** La hora de tu último mensaje en cada chat desde ayer. `null` con una extensión anterior a la 0.10.0. */
  ultimos?: UltimosMios | null
}) {
  return (
    <EscritosCtx.Provider value={escritos || SIN_ESCRITOS}>
      <Agenda crmSeg={crmSeg} crmLeads={crmLeads} today={today} onAbrirChat={onAbrirChat} onVerFicha={onVerFicha} puedeAbrirChat={puedeAbrirChat} ultimos={ultimos ?? null} />
    </EscritosCtx.Provider>
  )
}

const SIN_ESCRITOS: EscritosHoy = new Set()

function Agenda({
  crmSeg,
  crmLeads,
  today,
  onAbrirChat,
  onVerFicha,
  puedeAbrirChat,
  ultimos,
}: {
  crmSeg: MapaSeguimiento
  crmLeads: MapaLeads
  today: Date
  onAbrirChat: (id: number, tel: string) => void
  onVerFicha: (id: number, tel: string) => void
  puedeAbrirChat: boolean
  ultimos: UltimosMios | null
}) {
  const escritos = useContext(EscritosCtx)
  const catalogo = usePedidosCatalogo()
  const filasPedidos = useMemo(
    () => (catalogo?.t === 'ok' ? armarFilasPedidos(catalogo.datos.pedidos, false, today, ultimos, escritos) : []),
    [catalogo, today, ultimos, escritos],
  )
  const filasCarritos = useMemo(
    () => (catalogo?.t === 'ok' ? armarFilasPedidos(catalogo.datos.carritos, true, today, ultimos, escritos) : []),
    [catalogo, today, ultimos, escritos],
  )
  const pedidosSinHablar = catalogo?.t === 'ok' ? [...filasPedidos, ...filasCarritos].filter((p) => !p.hablado).length : null

  const [filtro, setFiltro] = useState<FiltroPanel>(memoria.filtro)
  const [mostrar, setMostrar] = useState(memoria.mostrar)
  const [estado, setEstado] = useState<EstadoAgenda>(memoria.estado)

  const conteos = useMemo(() => contarPorTipo(crmSeg, today), [crmSeg, today])
  const cola = useMemo(() => contarCola(crmSeg, today), [crmSeg, today])
  /**
   * Qué grupos están abiertos. **Recuperar y Hechos nacen plegados**: los fríos son la segunda
   * etapa del día, y lo hecho es para mirar de reojo. Se recuerda mientras el panel esté abierto,
   * nada más — no es un dato.
   */
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>(memoria.abiertos)
  const alternar = (k: string) => setAbiertos((a) => ({ ...a, [k]: !a[k] }))
  // El grupo de los pedidos: nace abierto, y si `memoria` viene de antes de existir, también.
  const grupoPedidos = (
    <GrupoPedidos
      r={catalogo}
      pedidos={filasPedidos}
      carritos={filasCarritos}
      abierto={abiertos.pedidos !== false}
      onToggle={() => setAbiertos((a) => ({ ...a, pedidos: a.pedidos === false }))}
      onAbrir={onAbrirChat}
      onFicha={onVerFicha}
    />
  )
  const logistica = usePendientesLogistica()
  const grupoLogistica = (
    <GrupoLogistica
      r={logistica}
      abierto={abiertos.logistica !== false}
      onToggle={() => setAbiertos((a) => ({ ...a, logistica: a.logistica === false }))}
      onAbrir={onAbrirChat}
      onFicha={onVerFicha}
    />
  )
  const [mostrarAtrasados, setMostrarAtrasados] = useState(memoria.mostrarAtrasados)

  // Lo que se ve queda guardado para la próxima vez que se monte (ver `memoria`).
  useEffect(() => {
    memoria.filtro = filtro
    memoria.estado = estado
    memoria.abiertos = abiertos
    memoria.mostrar = mostrar
    memoria.mostrarAtrasados = mostrarAtrasados
  }, [filtro, estado, abiertos, mostrar, mostrarAtrasados])

  // Volver a la solapa deja la lista donde estaba, no arriba de todo. El panel corre en su propio
  // iframe, así que la barra es la de la ventana.
  useEffect(() => {
    if (memoria.scroll) requestAnimationFrame(() => window.scrollTo(0, memoria.scroll))
    const alMover = () => {
      memoria.scroll = window.scrollY
    }
    window.addEventListener('scroll', alMover, { passive: true })
    return () => window.removeEventListener('scroll', alMover)
  }, [])

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

  /**
   * 🔴 Los prospectos cuyo teléfono ya es de un cliente que compró no van en la lista (Darío,
   * 19-oct-2026, Vale Coba): al abrir el chat sale la ficha de cliente, así que como prospecto
   * sobra. Se pregunta una vez por cada cambio de la lista de prospectos.
   */
  const telsLeads = useMemo(
    () =>
      Object.values(crmLeads || {})
        .filter((l) => l && l.estado === 'activo' && l.telefono)
        .map((l) => l.telefono)
        .sort()
        .join(','),
    [crmLeads],
  )
  const [leadsClientes, setLeadsClientes] = useState<EscritosHoy>(() => new Set())
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const tels = await telsQueSonClientes(telsLeads ? telsLeads.split(',') : [])
      if (vivo) setLeadsClientes(indexarEscritos(tels))
    })()
    return () => {
      vivo = false
    }
  }, [telsLeads])

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
      Estás viendo esta lista fuera de WhatsApp, así que el botón verde no abre el chat. Adentro del
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
            {estable(filas, (f) => `${filtro}:${f.id}`, () => 0).slice(0, mostrar).map((f) => (
              <Fila key={f.id} it={itemDeCliente(f, today)} onAbrir={onAbrirChat} onFicha={onVerFicha} />
            ))}
            {filas.length > mostrar && <VerMas faltan={filas.length - mostrar} onClick={() => setMostrar((n) => n + PAGINA)} />}
          </>
        )}
      </div>
    )
  }

  // ── La cola de trabajo, que es el default ─────────────────────────────────
  const { lista, frios, hechos } = estado
  // Además del cruce con el servidor, los clientes que ya están en esta lista: si el número de un
  // prospecto es el de uno de ellos, ya se sabe que es cliente (Nuria Encina, 19-oct-2026).
  const telsClientesLista = indexarEscritos([...lista, ...frios, ...hechos].map((f) => f.telefono))
  const leads = leadsDelPanel(crmLeads, today)
    .map(itemDeLead)
    .filter((i) => !leEscribisteHoy(leadsClientes, [i.telefono]) && !leEscribisteHoy(telsClientesLista, [i.telefono]))
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
  const friosItems = frios.map((f) => itemDeCliente(f, today))
  /**
   * 🔴 **Falta la fecha**: a quien le escribiste hoy (según WhatsApp Web) y sigue sin fecha para
   * adelante. Va arriba de todo y SALE de su grupo (Darío, 16-oct-2026: le escribió a un prospecto,
   * salió del chat sin agendarlo y no lo encontraba). Se va solo al ponerle fecha.
   */
  const hechosItems = [
    ...hechos.map((f) => ({ it: itemDeCliente(f, today), dias: f.dias })),
    ...leadsHechos,
  ]
  /**
   * 🔴 **El mismo teléfono puede estar dos veces** (cliente y prospecto, o dos clientes cargados
   * por separado). Darío, 19-oct-2026: le puso "en 2 días" a Nuria y seguía en «Falta la fecha»,
   * porque lo que quedaba era el otro registro con su número. Si a ese teléfono ya se le puso
   * fecha hoy, no falta nada.
   */
  const agendadosHoy = indexarEscritos(hechosItems.map((h) => h.it.telefono))
  const faltaFecha = estable(
    [...deClientes, ...leads, ...friosItems].filter(
      (i) => (i.dias === null || i.dias <= 0) && leEscribisteHoy(escritos, [i.telefono]) && !leEscribisteHoy(agendadosHoy, [i.telefono]),
    ),
    (i) => `falta:${i.key}`,
    porAtraso,
  )
  const sinMarcar = new Set(faltaFecha.map((i) => i.key))
  const fuera = (i: Item) => !sinMarcar.has(i.key)
  const paraHoy = estable([...deClientes.filter((i) => i.dias === 0), ...leads.filter((i) => i.dias === 0)].filter(fuera), (i) => `hoy:${i.key}`, (a, b) => a.orden - b.orden)
  const sinFecha = leads.filter((i) => i.dias === null).filter(fuera)
  /**
   * Atrasados: clientes y prospectos juntos, **el más atrasado arriba** (`porAtraso`) y quietos
   * (`estable`).
   *
   * 🔑 **El número es lo que se ve** (Darío, 15-oct-2026). Antes el título decía la pila entera —383
   * con 25 a la vista— y asustaba sin ayudar. Lo que queda afuera lo dice un renglón al final.
   */
  const todosAtrasados = [...deClientes.filter((i) => i.dias !== 0), ...leads.filter((i) => i.dias !== null && i.dias < 0)]
  const atrasados = estable(todosAtrasados.filter(fuera), (i) => `atr:${i.key}`, porAtraso)
  const leadsAtrasados = leads.filter((i) => i.dias !== null && i.dias < 0).length
  const totalAtrasados = atrasados.length
  const esperando = cola.atrasados + leadsAtrasados - todosAtrasados.length
  const totalHoy = paraHoy.length

  if (!faltaFecha.length && !paraHoy.length && !atrasados.length && !sinFecha.length && !frios.length && !hechosItems.length)
    return (
      <div>
        {pedidosSinHablar != null && <Resumen hoy={0} atrasados={0} hechos={0} pedidos={pedidosSinHablar} />}
        {cabecera}
        {avisoExtension}
        {grupoPedidos}
        {grupoLogistica}
        <div style={{ padding: space[3], fontSize: font.sm, color: color.mut }}>
          No hay nadie para contactar hoy. Cuando venza el próximo, aparece acá.
        </div>
      </div>
    )

  return (
    <div>
      <Resumen hoy={totalHoy} atrasados={totalAtrasados} hechos={hechosItems.length} pedidos={pedidosSinHablar} />
      {cabecera}
      {avisoExtension}
      {grupoPedidos}
      {grupoLogistica}

      {faltaFecha.length > 0 && (
        <Grupo titulo="🔴 Falta la fecha" cuantas={faltaFecha.length} abierto={abiertos.falta !== false} onToggle={() => setAbiertos((a) => ({ ...a, falta: a.falta === false }))}>
          {faltaFecha.map((it) => (
            <Fila key={it.key} it={it} onAbrir={onAbrirChat} onFicha={onVerFicha} />
          ))}
          <Aclaracion>Les escribiste hoy y no tienen cuándo volver a hablarles. Tocá el nombre y elegí los días.</Aclaracion>
        </Grupo>
      )}

      <Grupo titulo="Para hoy" cuantas={totalHoy} abierto={abiertos.hoy} onToggle={() => alternar('hoy')}>
        {paraHoy.map((it) => (
          <Fila key={it.key} it={it} onAbrir={onAbrirChat} onFicha={onVerFicha} />
        ))}
        {!paraHoy.length && <Aclaracion>No hay nadie agendado para hoy.</Aclaracion>}
      </Grupo>

      {atrasados.length > 0 && (
        <Grupo titulo="Atrasados" cuantas={totalAtrasados} abierto={abiertos.atrasados} onToggle={() => alternar('atrasados')}>
          {atrasados.slice(0, mostrarAtrasados).map((it) => (
            <Fila key={it.key} it={it} onAbrir={onAbrirChat} onFicha={onVerFicha} />
          ))}
          {atrasados.length > mostrarAtrasados && (
            <VerMas faltan={atrasados.length - mostrarAtrasados} onClick={() => setMostrarAtrasados((n) => n + PAGINA)} />
          )}
          {/*
            ⚠️ La cola de clientes viene cortada en `TOPE_LISTA` desde `lista-dia.ts`: el título dice
            lo que se ve (15-oct) y esto dice cuántos quedan afuera. Un corte que no se ve es el defecto que
            esta lista ya pagó dos veces.
          */}
          {esperando > 0 && (
            <Aclaracion>
              Hay {esperando} más esperando. Van entrando a medida que atendés a estos.
            </Aclaracion>
          )}
        </Grupo>
      )}

      {sinFecha.length > 0 && (
        <Grupo titulo="Prospectos sin fecha" cuantas={sinFecha.length} abierto={abiertos.sinFecha} onToggle={() => alternar('sinFecha')}>
          {sinFecha.map((it) => (
            <Fila key={it.key} it={it} onAbrir={onAbrirChat} onFicha={onVerFicha} />
          ))}
          <Aclaracion>No están en ninguna lista hasta que les pongas fecha. Abrí el chat y agendalos.</Aclaracion>
        </Grupo>
      )}

      {friosItems.filter(fuera).length > 0 && (
        <Grupo titulo="🧊 Recuperar" cuantas={friosItems.filter(fuera).length} abierto={abiertos.frios} onToggle={() => alternar('frios')}>
          {friosItems.filter(fuera).map((it) => (
            <Fila key={it.key} it={it} onAbrir={onAbrirChat} onFicha={onVerFicha} />
          ))}
          <Aclaracion>La tanda de hoy, primero el que más compró. Para verlos a todos, tocá 🧊 arriba.</Aclaracion>
        </Grupo>
      )}

      {hechosItems.length > 0 && (
        <Grupo titulo="Hechos hoy" cuantas={hechosItems.length} abierto={abiertos.hechos} onToggle={() => alternar('hechos')}>
          {hechosItems.map(({ it, dias: d }) => (
            <Fila key={it.key} it={it} onAbrir={onAbrirChat} onFicha={onVerFicha} hecho={{ dias: d }} />
          ))}
        </Grupo>
      )}
    </div>
  )
}
