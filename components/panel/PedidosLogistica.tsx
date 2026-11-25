'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { claveHueco, useHuecosLogistica } from '@/components/panel/huecos-logistica'
import { color, font, radius, space } from '@/components/ui/tokens'
import {
  cambiosDeEnvio,
  catalogosLogistica,
  correoDe,
  despachar,
  estadoDeposito,
  formaCorta,
  generarEtiqueta,
  guardarEM,
  guardarEntrega,
  leerMensaje,
  mensajeSeguimiento,
  pasoPanel,
  vistaPrevia,
  type CampoEnvio,
  type Envio,
  pedidosDelCliente,
  pendientesRecientes,
  traerPedido,
  ESTADOS_CERRADOS,
  LISTO,
  TRANSPORTE,
  type Catalogos,
  type PedidoLogistica,
  type PendienteLogistica,
  type Resultado,
} from '@/lib/crm/logistica'
import { enviarMedicion, marca } from '@/lib/medir'
import { codigoPedido } from '@/lib/erp/codigos.core.js'
import { Button } from '@/components/ui'

/** Cada cuánto y hasta cuándo la ficha mira sola si llegó a Logística lo que se mandó a preparar (Darío 18-nov). */
const CADA_MS = 5_000
const VUELTAS = 12

/**
 * Los pedidos del cliente que están en curso en Logística, en la ficha del chat (Darío, 22-oct-2026:
 * no olvidarse de elegir la forma de entrega, cargar el EM y pasar el seguimiento). La forma de
 * entrega se elige acá (sólo admin: el servidor lo corta).
 *
 * Diseño cerrado el 24-oct-2026 (propuesta «Lo que sigue»): un renglón por pedido y UN botón, el
 * paso que te toca. Elegir la forma de entrega y completar lo que sigue es un solo paso. Lo que se
 * usa poco (modificar, abrir en Logística) va en «⋯». Sin estado de Logística con color ni avisos
 * repetidos: lo que falta ya lo dice el botón.
 *
 * Sin pedidos en curso no se dibuja nada: es lo normal y no hace falta anunciarlo. Un error sí se
 * ve, en un renglón, para que «no aparece» no se lea como «no tiene pedidos».
 */
export function PedidosLogistica({ clienteId, tel, despacho, onLeidos, codigos = '', enviados = '' }: {
  clienteId: number | null; tel: string | null; despacho?: string
  /**
   * Los códigos («M-0112,M-0113») de sus pedidos abiertos en el ERP: si por cliente y teléfono no aparece nada, se buscan
   * en los pendientes de Logística por código (Darío 17-nov: el de Lucila llegó a Logística sin teléfono ni cliente).
   */
  codigos?: string
  /**
   * Los números del ERP («113,116») de sus pedidos ya mandados a preparar. Los que todavía no se ven acá se le piden a
   * Logística en el momento y otra vez cada 5 s durante un minuto (Darío 18-nov: «nunca va a aparecer si no toco nada»).
   */
  enviados?: string
  /** Lo que contestó Logística (para que la tarjeta de Pedidos muestre el estado de los vendidos por GN). */
  onLeidos?: (pedidos: PedidoLogistica[]) => void
}) {
  // Lo que llegó va con a quién era: al cambiar de chat no se ve un instante el pedido del anterior.
  const clave = `${clienteId ?? ''}|${tel ?? ''}`
  const [montada] = useState(marca)
  const [porCliente, setPorCliente] = useState<{ clave: string; r: Resultado<PedidoLogistica[]>; ms: number } | null>(null)
  useEffect(() => {
    let vivo = true
    if (!clienteId && !tel) return
    const deEsta = `${clienteId ?? ''}|${tel ?? ''}`
    const t0 = marca()
    pedidosDelCliente(clienteId, tel).then((r) => {
      if (vivo) setPorCliente({ clave: deEsta, r, ms: Math.round(marca() - t0) })
    })
    return () => {
      vivo = false
    }
  }, [clienteId, tel])

  /**
   * ⚡ Por código, EN PARALELO y no después (Darío 18-nov: ~7 s). Antes se esperaba a que la búsqueda por cliente volviera
   * vacía, y recién ahí se bajaba la lista entera de pendientes; y cuando llegaban los códigos del ERP se repetía todo.
   * La lista es la misma que ya bajó Pedidos: `pendientesRecientes` la reusa si tiene menos de un minuto.
   */
  const [porCodigo, setPorCodigo] = useState<{ codigos: string; orders: PendienteLogistica[] } | null>(null)
  useEffect(() => {
    if (!codigos) return
    let vivo = true
    pendientesRecientes().then((x) => {
      if (vivo && x.t === 'ok') setPorCodigo({ codigos, orders: x.datos.orders })
    })
    return () => {
      vivo = false
    }
  }, [codigos])

  const llegado = useMemo((): { clave: string; r: Resultado<PedidoLogistica[]> } | null => {
    if (!porCliente) return null
    const r = porCliente.r
    if (r.t !== 'ok' || r.datos.length || !codigos) return porCliente
    if (porCodigo?.codigos !== codigos) return porCliente
    const buscados = codigos.split(',')
    return { clave: porCliente.clave, r: { t: 'ok', datos: porCodigo.orders.filter((o) => buscados.includes(String(o.gn_number ?? '').trim())) } }
  }, [porCliente, porCodigo, codigos])

  useEffect(() => {
    if (!llegado || llegado.clave !== clave) return
    if (llegado.r.t === 'ok') onLeidos?.(llegado.r.datos)
    // ⏱️ Desde que se montó la ficha (y lo que tardó la búsqueda por cliente).
    enviarMedicion('ficha-logistica', montada, { buscando: porCliente?.ms ?? null, codigos: codigos ? codigos.split(',').length : 0, hay: llegado.r.t === 'ok' ? llegado.r.datos.length : llegado.r.t }, `ficha-${llegado.clave}-${codigos}`)
  }, [llegado, clave, onLeidos, montada, codigos, porCliente])

  // Lo despachado o recién guardado en esta ficha pisa lo que llegó.
  const [cambios, setCambios] = useState<{ clave: string; quitados: number[]; nuevos: PedidoLogistica[] }>({ clave: '', quitados: [], nuevos: [] })

  // Lo que usó la vez anterior sale sólo de la lista de pendientes: se pide si algún pedido no tiene
  // forma de entrega, para dejar marcada esa opción.
  const [sugerencias, setSugerencias] = useState<Map<number, PendienteLogistica['suggestion']>>(new Map())
  const faltaElegir = llegado?.r.t === 'ok' && llegado.r.datos.some((p) => !p.dispatch_option)
  useEffect(() => {
    if (!faltaElegir) return
    let vivo = true
    pendientesRecientes().then((x) => {
      if (vivo && x.t === 'ok') setSugerencias(new Map(x.datos.orders.map((o) => [o.id, o.suggestion])))
    })
    return () => {
      vivo = false
    }
  }, [faltaElegir])

  /** Un pedido que volvió de Logística (guardado, o cómo quedó si cambió en el medio) reemplaza al viejo. */
  const reemplazar = (nuevo: PedidoLogistica) =>
    setCambios((c) => ({ clave, quitados: c.clave === clave ? c.quitados : [], nuevos: [...(c.clave === clave ? c.nuevos.filter((p) => p.id !== nuevo.id) : []), nuevo] }))
  /** Despachado: sale de la lista al instante, sin cartel. */
  const quitar = (id: number) =>
    setCambios((c) => ({ clave, quitados: [...(c.clave === clave ? c.quitados : []), id], nuevos: c.clave === clave ? c.nuevos : [] }))

  const r0 = llegado?.clave === clave ? llegado.r : null
  const r: Resultado<PedidoLogistica[]> | null =
    r0 && r0.t === 'ok' && cambios.clave === clave
      ? {
          t: 'ok',
          datos: [
            ...r0.datos.map((p) => cambios.nuevos.find((n) => n.id === p.id) ?? p),
            // Los que trajo «Llegando a Logística…» van al final.
            ...cambios.nuevos.filter((n) => !r0.datos.some((p) => p.id === n.id)),
          ].filter((p) => !cambios.quitados.includes(p.id)),
        }
      : r0

  // ⏳ Mandados a preparar que acá todavía no se ven. Los que Logística no carga (anulado, ya cerrado) dejan de buscarse.
  const [descartados, setDescartados] = useState<{ clave: string; nums: string[]; avisos: string[] }>({ clave: '', nums: [], avisos: [] })
  const desc: { nums: string[]; avisos: string[] } = descartados.clave === clave ? descartados : { nums: [], avisos: [] }
  const vistos = r?.t === 'ok' ? new Set(r.datos.map((p) => String(p.gn_number ?? '').trim())) : null
  const faltan = vistos ? (enviados ? enviados.split(',') : []).filter((n) => !vistos.has(codigoPedido(n)) && !desc.nums.includes(n)) : []
  const faltanKey = faltan.join(',')
  const [espera, setEspera] = useState<{ clave: string; nums: string; agotada: boolean; vuelta: number }>({ clave: '', nums: '', agotada: false, vuelta: 0 })
  const agotada = espera.clave === clave && espera.nums === faltanKey && espera.agotada
  const vuelta = espera.clave === clave ? espera.vuelta : 0
  useEffect(() => {
    if (!faltanKey) return
    let vivo = true
    let vueltas = 0
    let t: ReturnType<typeof setTimeout> | undefined
    const mirar = async () => {
      const nums = faltanKey.split(',')
      const rs = await Promise.all(nums.map((n) => traerPedido(Number(n))))
      if (!vivo) return
      const fuera: string[] = []
      const avisos: string[] = []
      rs.forEach((x, i) => {
        // El que llegó deja de buscarse aunque su número en Logística venga escrito distinto.
        if (x.t === 'llego') {
          if (!ESTADOS_CERRADOS.includes(x.pedido.status?.code)) reemplazar(x.pedido)
          fuera.push(nums[i])
        }
        else if (x.t === 'ignorado') {
          fuera.push(nums[i])
          avisos.push(`${codigoPedido(nums[i])}: ${x.motivo}`)
        }
      })
      if (fuera.length) setDescartados((d) => ({ clave, nums: [...(d.clave === clave ? d.nums : []), ...fuera], avisos: [...(d.clave === clave ? d.avisos : []), ...avisos] }))
      if (fuera.length === nums.length) return
      vueltas++
      if (vueltas >= VUELTAS) setEspera((e) => ({ clave, nums: faltanKey, agotada: true, vuelta: e.clave === clave ? e.vuelta : 0 }))
      else t = setTimeout(() => void mirar(), CADA_MS)
    }
    void mirar()
    return () => {
      vivo = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reemplazar` cambia en cada dibujo; lo que manda es qué falta.
  }, [faltanKey, clave, vuelta])

  const huecos = useHuecosLogistica()?.huecos ?? {}
  const huecoDe = (codigo: string | number | null | undefined) => huecos[claveHueco(codigo)] ?? null
  if (!r || r.t === 'sin-permiso') return null
  if (r.t === 'error')
    return (
      <Caja>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>Logística: {r.motivo}</div>
      </Caja>
    )
  // Debajo de su pedido cuando la tarjeta de Pedidos lo muestra (Darío 18-nov); el resto, en el cuadro de siempre.
  const sueltos = r.datos.filter((p) => !huecoDe(p.gn_number))
  const faltanSueltos = faltan.filter((n) => !huecoDe(codigoPedido(n)))
  const lineaFaltan = (nums: string[], enPedido = false) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: font.sm, color: color.mut2, padding: '4px 0' }}>
      <span>{enPedido ? '🚚 ' : `${nums.map((n) => codigoPedido(n)).join(', ')} · `}{agotada ? 'Todavía no llegó a Logística' : 'Llegando a Logística…'}</span>
      {agotada && (
        <Button size="sm" variant="soft" onClick={() => setEspera((e) => ({ clave, nums: '', agotada: false, vuelta: (e.clave === clave ? e.vuelta : 0) + 1 }))}>
          Volver a mirar
        </Button>
      )}
    </div>
  )
  const portales = [
    ...r.datos.filter((p) => huecoDe(p.gn_number)).map((p) => createPortal(
      <Pedido p={p} primero enPedido sugerencia={sugerencias.get(p.id) ?? null} despacho={despacho} onCambio={reemplazar} onSale={quitar} />,
      huecoDe(p.gn_number) as HTMLElement, `logi-${p.id}`)),
    ...faltan.filter((n) => huecoDe(codigoPedido(n))).map((n) => createPortal(lineaFaltan([n], true), huecoDe(codigoPedido(n)) as HTMLElement, `falta-${n}`)),
  ]
  if (!sueltos.length && !faltanSueltos.length && !desc.avisos.length) return portales.length ? <>{portales}</> : null
  return (
    <>
      {portales}
      <Caja>
        <div style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase', marginBottom: 6 }}>
          Logística
        </div>
        {sueltos.map((p, i) => (
          <Pedido key={p.id} p={p} primero={i === 0} sugerencia={sugerencias.get(p.id) ?? null} despacho={despacho} onCambio={reemplazar} onSale={quitar} />
        ))}
        {faltanSueltos.length > 0 && lineaFaltan(faltanSueltos)}
        {desc.avisos.map((a) => (
          <div key={a} style={{ fontSize: font.xs, color: color.mut2, padding: '2px 0' }}>{a}</div>
        ))}
      </Caja>
    </>
  )
}

function Caja({ children }: { children: React.ReactNode }) {
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
      {children}
    </section>
  )
}

type Modo = 'forma' | 'etiqueta' | 'em' | 'despachar'

function Pedido({
  p,
  primero,
  enPedido = false,
  sugerencia,
  despacho,
  onCambio,
  onSale,
}: {
  p: PedidoLogistica
  primero: boolean
  /** Debajo de su pedido en la tarjeta de Pedidos: sin el número (ya está arriba), con 🚚. */
  enPedido?: boolean
  sugerencia: PendienteLogistica['suggestion']
  despacho?: string
  onCambio: (p: PedidoLogistica) => void
  onSale: (id: number) => void
}) {
  const [modo, setModo] = useState<Modo | null>(null)
  const [menu, setMenu] = useState(false)
  const [despachando, setDespachando] = useState(false)
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null)
  const paso = pasoPanel(p)
  const forma = formaCorta(p)
  // La etiqueta se arma acá sólo en Etiqueta libre y Transporte. En EM se carga sólo su número: la
  // etiqueta y los datos los pone Envío Nube.
  const llevaEtiqueta = p.dispatch_option?.code === 2 || p.dispatch_option?.code === TRANSPORTE
  const esEM = p.dispatch_option?.code === 1
  const abierto = p.status.code <= LISTO

  const abrir = (m: Modo) => {
    setMenu(false)
    setAviso(null)
    setModo(m)
  }
  const cerrar = (nuevo: PedidoLogistica | null, txt: string, mal?: boolean) => {
    if (nuevo) onCambio(nuevo)
    setAviso({ txt, mal })
    if (!mal) setModo(null)
  }
  const confirmarDespacho = async () => {
    setDespachando(true)
    const r = await despachar(p)
    setDespachando(false)
    if (r.t === 'ok') return onSale(p.id)
    if (r.t === 'cambio' && r.pedido) onCambio(r.pedido)
    setModo(null)
    setAviso({ txt: r.motivo, mal: true })
  }

  const botonSiguiente = () => {
    if (!abierto || modo) return null
    if (paso === 'deposito') {
      const pct = p.units.total ? Math.round((p.units.scanned / p.units.total) * 100) : 0
      return (
        <>
          <div style={{ marginTop: 7, fontSize: font.sm, color: color.mut }}>{estadoDeposito(p)}</div>
          {p.units.scanned > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: font.sm, color: color.mut }}>
              <span style={{ flex: 1, height: 5, background: color.line2, borderRadius: 99, overflow: 'hidden' }}>
                <i style={{ display: 'block', height: '100%', width: `${pct}%`, background: color.mut2 }} />
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {p.units.scanned} de {p.units.total}
              </span>
            </div>
          )}
        </>
      )
    }
    const entrega = p.dispatch_option?.code === 2
    return (
      <>
        <BotonGrande onClick={() => abrir(paso === 'despachar' ? 'despachar' : 'forma')}>
          {paso === 'despachar' ? (entrega ? 'Entregado' : 'Despachado') : 'Elegir forma de entrega'}
        </BotonGrande>
        {paso === 'etiqueta' && p.missing.length > 0 && (
          <div style={{ marginTop: 4, fontSize: font.xs, color: color.warningInk }}>Datos faltantes: {p.missing.join(', ')}</div>
        )}
      </>
    )
  }

  return (
    <div style={enPedido ? { marginTop: 6 } : { paddingTop: primero ? 0 : space[2], marginTop: primero ? 0 : space[2], borderTop: primero ? 0 : `1px solid ${color.line2}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {enPedido
          ? <span aria-label="Logística" style={{ fontSize: font.sm }}>🚚</span>
          : <span style={{ fontSize: font.base, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>{p.gn_number || p.id}</span>}
        <span
          style={{
            fontSize: font.sm,
            color: forma ? color.mut : color.warningInk,
            fontWeight: forma ? 400 : 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {forma ?? 'Sin forma de entrega'}
        </span>
        <span style={{ flex: 1 }} />
        {abierto && (
          <button
            type="button"
            aria-label="Más"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            style={{ width: 28, minWidth: 28, height: 26, padding: 0, borderRadius: 7, border: `1px solid ${menu ? color.line : 'transparent'}`, background: menu ? color.bg2 : 'transparent', color: color.mut, fontSize: 16, lineHeight: 1, cursor: 'pointer' }}
          >
            ⋯
          </button>
        )}
      </div>
      {menu && (
        <div style={{ marginTop: 6, border: `1px solid ${color.line}`, borderRadius: radius.lg, background: color.surface, overflow: 'hidden' }}>
          {p.dispatch_option && <ItemMenu onClick={() => abrir('forma')}>Cambiar forma de entrega</ItemMenu>}
          {llevaEtiqueta && p.has_label && <ItemMenu onClick={() => abrir('etiqueta')}>Cambiar etiqueta</ItemMenu>}
          {esEM && p.em && <ItemMenu onClick={() => abrir('em')}>Cambiar EM</ItemMenu>}
          <a href={p.url} target="_blank" rel="noreferrer" style={{ ...itemStyle, textDecoration: 'none', display: 'block' }}>
            Abrir en Logística ↗
          </a>
        </div>
      )}
      {botonSiguiente()}
      {!modo && p.tracking_number && <Seguimiento p={p} informable={esEM} />}
      {aviso && <div style={{ marginTop: 6, fontSize: font.sm, color: aviso.mal ? color.dangerInk : color.successInk }}>{aviso.txt}</div>}
      {modo === 'forma' && <ElegirYCompletar p={p} sugerencia={sugerencia} despacho={despacho} onCancelar={() => setModo(null)} onListo={cerrar} />}
      {modo === 'em' && <CargarEM p={p} onCancelar={() => setModo(null)} onListo={cerrar} />}
      {modo === 'etiqueta' && <ArmarEtiqueta p={p} despacho={despacho} onCancelar={() => setModo(null)} onListo={cerrar} />}
      {modo === 'despachar' && (
        <div style={{ marginTop: 8, padding: space[2], border: `1px solid ${color.line}`, borderRadius: radius.lg, background: color.bg2, display: 'flex', gap: 6, alignItems: 'center' }}>
          <BotonChico fuerte onClick={confirmarDespacho} disabled={despachando}>
            {despachando ? 'Guardando…' : p.dispatch_option?.code === 2 ? 'Confirmar entrega' : 'Confirmar despacho'}
          </BotonChico>
          <BotonChico onClick={() => setModo(null)} disabled={despachando}>
            Cancelar
          </BotonChico>
        </div>
      )}
      {p.tracking_needs_manual && !modo && (
        <Aviso>No se pudo leer el seguimiento del PDF: cargalo en Logística</Aviso>
      )}
      {p.status.code === LISTO && !p.units.complete && !modo && (
        <Aviso>
          Preparado con {p.units.scanned} de {p.units.total} unidades
        </Aviso>
      )}
    </div>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 6, fontSize: font.sm, color: color.warningInk, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: radius.sm, padding: '4px 8px' }}>
      {children}
    </div>
  )
}

const itemStyle: React.CSSProperties = {
  width: '100%',
  height: 'auto',
  textAlign: 'left',
  background: 'none',
  border: 0,
  borderTop: `1px solid ${color.line2}`,
  padding: '8px 12px',
  fontSize: font.sm,
  color: color.ink,
  cursor: 'pointer',
}
function ItemMenu({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={itemStyle}>
      {children}
    </button>
  )
}

/** El número de seguimiento. En EM, «Informar seguimiento» copia el mensaje para el cliente (no lo manda). */
function Seguimiento({ p, informable }: { p: PedidoLogistica; informable: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    const msg = mensajeSeguimiento(p)
    if (!msg) return
    try {
      await navigator.clipboard.writeText(msg)
      setCopiado(true)
    } catch {
      /* sin permiso de portapapeles: el número queda a la vista igual */
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>{(informable && correoDe(p.tracking_number)) || 'Seguimiento'}</div>
        <b style={{ fontSize: font.sm, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-all', color: color.ink }}>{p.tracking_number}</b>
      </div>
      {informable && (
        <BotonChico onClick={copiar} disabled={copiado} sinMargen>
          {copiado ? 'Copiado ✓' : 'Informar seguimiento'}
        </BotonChico>
      )}
    </div>
  )
}

function BotonGrande({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ marginTop: 8, width: '100%', height: 32, padding: '0 10px', fontSize: font.base, fontWeight: 600, borderRadius: radius.md, border: `1px solid ${color.brand}`, background: color.brand, color: '#fff', cursor: 'pointer' }}
    >
      {children}
    </button>
  )
}

function BotonChico({ children, onClick, disabled, fuerte, sinMargen }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; fuerte?: boolean; sinMargen?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        marginTop: sinMargen ? 0 : 6,
        height: 28,
        padding: '0 10px',
        fontSize: font.xs,
        fontWeight: 600,
        borderRadius: radius.md,
        border: `1px solid ${fuerte ? color.brand : color.line}`,
        background: fuerte ? color.brand : color.bg2,
        color: fuerte ? '#fff' : color.ink,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        flex: sinMargen ? 'none' : undefined,
      }}
    >
      {children}
    </button>
  )
}

const FORMA_EM = 1
const FORMA_LIBRE = 2
const NOMBRE_FORMA: Record<number, string> = { [FORMA_EM]: 'EM' }

/**
 * Elegir la forma de entrega y completar lo que sigue en el MISMO lugar (diseño del 24-oct-2026):
 * · EM → el número, y nada más.
 * · Etiqueta libre → nombre, apellido y una descripción; «Ver etiqueta» → «Guardar y generar».
 * · Transporte → el transporte y el mensaje del cliente; «✨ Completar etiqueta con IA» arma la
 *   etiqueta y la muestra; «Guardar y generar».
 * Nace marcada con lo que tiene el pedido o, si no tiene, con lo que el cliente usó la vez anterior.
 *
 * 🔑 **Guardar la etiqueta pide haberla visto con ESOS datos**: tocar un dato después de verla vuelve
 * a pedirla. Guardar y generar manda forma, transporte y datos en una sola carga (con `expected`).
 */
function ElegirYCompletar({
  p,
  sugerencia,
  despacho,
  onCancelar,
  onListo,
}: {
  p: PedidoLogistica
  sugerencia: PendienteLogistica['suggestion']
  despacho?: string
  onCancelar: () => void
  onListo: (nuevo: PedidoLogistica | null, txt: string, mal?: boolean) => void
}) {
  const [cat, setCat] = useState<Resultado<Catalogos> | null>(null)
  const [codigo, setCodigo] = useState<number | null>(p.dispatch_option?.code ?? sugerencia?.dispatch_option.code ?? null)
  const [carrier, setCarrier] = useState<string>(p.carrier?.slug ?? sugerencia?.carrier?.slug ?? '')
  const [em, setEm] = useState(p.em ? String(p.em) : '')
  const [mensaje, setMensaje] = useState(despacho || '')
  const [leido, setLeido] = useState(false)
  const [envio, setEnvio] = useState<Envio>(() => ({ ...(p.shipping || {}) }))
  const partes = (p.client_name || '').trim().split(/\s+/)
  const [nom, setNom] = useState(p.shipping?.first_name ?? partes[0] ?? '')
  const [ape, setApe] = useState(p.shipping?.last_name ?? partes.slice(1).join(' '))
  const [txt, setTxt] = useState(p.shipping?.free_text ?? '')
  const [ocupado, setOcupado] = useState<'ver' | 'guardar' | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const [previa, setPrevia] = useState<{ png: string; de: string } | null>(null)
  useEffect(() => {
    catalogosLogistica().then(setCat)
  }, [])

  if (!cat) return <Panel>Cargando…</Panel>
  if (cat.t !== 'ok')
    return (
      <Panel>
        <span style={{ color: color.dangerInk }}>{cat.t === 'error' ? cat.motivo : 'Sin acceso.'}</span> <BotonChico onClick={onCancelar}>Cancelar</BotonChico>
      </Panel>
    )

  const esTransporte = codigo === TRANSPORTE
  const esLibre = codigo === FORMA_LIBRE
  const esEM = codigo === FORMA_EM

  const datosCon = (e: Envio, c: string) => ({
    dispatch_option: codigo as number,
    ...(esTransporte ? { carrier: c || null } : {}),
    shipping: cambiosDeEnvio(p.shipping, esLibre ? { ...e, first_name: nom, last_name: ape, free_text: txt } : e),
  })
  const datos = datosCon(envio, carrier)
  const huella = JSON.stringify(datos)
  const vista = previa?.de === huella

  // Cambiar cualquier dato obliga a volver a ver la etiqueta.
  const tocar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setProblema(null)
  }
  const elegir = (c: number) => {
    setCodigo(c)
    setProblema(null)
  }

  const numeroEM = /^\d{1,10}$/.test(em) ? Number(em) : null

  /** Transporte: leer el mensaje con la IA y, con lo que salió, mostrar la etiqueta. */
  const completar = async () => {
    setOcupado('ver')
    setProblema(null)
    const l = await leerMensaje(mensaje)
    if (l.t !== 'ok') {
      setOcupado(null)
      return setProblema(l.motivo)
    }
    // Lo que la IA no encontró no borra lo que ya estaba.
    const e: Envio = { ...envio }
    for (const [k, v] of Object.entries(l.shipping) as [CampoEnvio, string | null][]) if (v) e[k] = v
    let c = carrier
    if (l.carrier && !c) {
      const hallado = cat.datos.carriers.find((x) => x.slug === l.carrier || x.label.toLowerCase() === l.carrier!.toLowerCase())
      c = hallado ? hallado.slug : l.carrier
    }
    setEnvio(e)
    setCarrier(c)
    setLeido(true)
    await ver(datosCon(e, c))
  }

  const ver = async (d = datos) => {
    setOcupado('ver')
    setProblema(null)
    const r = await vistaPrevia(p, d)
    setOcupado(null)
    if (r.t !== 'ok') return setProblema(r.motivo)
    setPrevia({ png: r.png, de: JSON.stringify(d) })
  }

  const guardarEtiqueta = async () => {
    if (!vista) return
    setOcupado('guardar')
    setProblema(null)
    const r = await generarEtiqueta(p, datos)
    setOcupado(null)
    if (r.t === 'ok') return onListo(r.pedido, 'Etiqueta generada')
    if (r.t === 'cambio') return onListo(r.pedido, `${r.motivo} Fijate cómo quedó antes de volver a guardar.`, true)
    setProblema(r.motivo)
  }

  /** EM: la forma (si cambió) y el número, uno atrás del otro. */
  const guardarNumero = async () => {
    if (!numeroEM || codigo === null) return
    setOcupado('guardar')
    setProblema(null)
    let actual = p
    if (p.dispatch_option?.code !== FORMA_EM) {
      const f = await guardarEntrega(p, FORMA_EM, null)
      if (f.t !== 'ok') {
        setOcupado(null)
        if (f.t === 'cambio') return onListo(f.pedido, `${f.motivo} Fijate cómo quedó.`, true)
        return setProblema(f.motivo)
      }
      actual = f.pedido
    }
    if (Number(actual.em) !== numeroEM) {
      const r = await guardarEM(actual, numeroEM)
      setOcupado(null)
      if (r.t === 'ok') return onListo(r.pedido, 'EM guardado')
      if (r.t === 'cambio') return onListo(r.pedido, `${r.motivo} Fijate cómo quedó.`, true)
      return setProblema(r.motivo)
    }
    setOcupado(null)
    onListo(actual, 'Guardado')
  }

  const hayCarrier = !!carrier
  const faltanCampos = esTransporte && leido ? CAMPOS_BASICOS.some((k) => !(envio[k] ?? '').toString().trim()) : false

  return (
    <Panel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {/* Sólo EM, Etiqueta libre y Transporte (Darío 25-nov: Correo Argentino hoy no se usa); si el pedido ya tiene otra, se sigue viendo. */}
        {cat.datos.dispatch_options.filter((o) => [FORMA_EM, FORMA_LIBRE, TRANSPORTE].includes(o.code) || codigo === o.code).map((o) => (
          <button
            key={o.code}
            type="button"
            onClick={() => elegir(o.code)}
            aria-pressed={codigo === o.code}
            style={{
              height: 'auto',
              padding: '5px 10px',
              fontSize: font.xs,
              fontWeight: 600,
              borderRadius: 999,
              border: `1px solid ${codigo === o.code ? color.brand : color.line}`,
              background: codigo === o.code ? color.brand : color.surface,
              color: codigo === o.code ? '#fff' : color.ink,
              cursor: 'pointer',
            }}
          >
            {NOMBRE_FORMA[o.code] ?? o.label}
          </button>
        ))}
      </div>

      {esEM && (
        <input
          value={em}
          onChange={(e) => tocar(setEm)(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && guardarNumero()}
          inputMode="numeric"
          autoFocus
          placeholder="Número de EM"
          aria-label="Número de EM"
          style={campoStyle}
        />
      )}

      {esLibre && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <input value={nom} onChange={(e) => tocar(setNom)(e.target.value)} placeholder="Nombre" aria-label="Nombre" style={campoStyle} />
            <input value={ape} onChange={(e) => tocar(setApe)(e.target.value)} placeholder="Apellido" aria-label="Apellido" style={campoStyle} />
          </div>
          <textarea value={txt} onChange={(e) => tocar(setTxt)(e.target.value)} rows={2} placeholder="Descripción" aria-label="Descripción" style={{ ...campoStyle, height: 'auto', padding: 8, fontFamily: 'inherit' }} />
        </>
      )}

      {esTransporte && (
        <>
          <select value={carrier} onChange={(e) => tocar(setCarrier)(e.target.value)} aria-label="Transporte" style={campoStyle}>
            <option value="">Elegí el transporte</option>
            {cat.datos.carriers.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
            {carrier && !cat.datos.carriers.some((c) => c.slug === carrier) && <option value={carrier}>{carrier} (nuevo)</option>}
          </select>
          <textarea
            value={mensaje}
            onChange={(e) => {
              setMensaje(e.target.value)
              setLeido(false)
            }}
            rows={3}
            placeholder="Pegá el mensaje con los datos del cliente"
            aria-label="Datos del cliente"
            style={{ ...campoStyle, height: 'auto', padding: 8, fontFamily: 'inherit' }}
          />
          {leido && (
            <details open={faltanCampos} style={{ fontSize: font.xs, color: color.mut2 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Revisar datos</summary>
              <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                <CamposDeEnvio p={p} codigo={TRANSPORTE} envio={envio} poner={(k, v) => setEnvio((e) => ({ ...e, [k]: v }))} />
              </div>
            </details>
          )}
        </>
      )}

      {problema && <div style={{ fontSize: font.xs, color: color.dangerInk }}>{problema}</div>}

      {(esTransporte || esLibre) && previa && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previa.png} alt="Vista previa de la etiqueta" style={{ width: '100%', border: `1px solid ${color.line}`, borderRadius: radius.sm, background: '#fff', opacity: vista ? 1 : 0.4 }} />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {esEM && (
          <BotonChico fuerte onClick={guardarNumero} disabled={!numeroEM || !!ocupado || (numeroEM === Number(p.em) && p.dispatch_option?.code === FORMA_EM)}>
            {ocupado === 'guardar' ? 'Guardando…' : 'Guardar'}
          </BotonChico>
        )}
        {(esTransporte || esLibre) &&
          (vista ? (
            <BotonChico fuerte onClick={guardarEtiqueta} disabled={!!ocupado}>
              {ocupado === 'guardar' ? 'Guardando…' : 'Guardar y generar'}
            </BotonChico>
          ) : esTransporte && !leido ? (
            <BotonChico fuerte onClick={completar} disabled={!hayCarrier || !mensaje.trim() || !!ocupado}>
              {ocupado === 'ver' ? 'Leyendo…' : '✨ Completar etiqueta con IA'}
            </BotonChico>
          ) : (
            <BotonChico fuerte onClick={() => ver()} disabled={!!ocupado || (esTransporte && !hayCarrier) || (esLibre && !nom.trim())}>
              {ocupado === 'ver' ? 'Armando…' : 'Ver etiqueta'}
            </BotonChico>
          ))}
        <BotonChico onClick={onCancelar} disabled={!!ocupado}>
          Cancelar
        </BotonChico>
      </div>
    </Panel>
  )
}

/** Los datos mínimos de una etiqueta de transporte: si falta alguno, «Revisar datos» se abre solo. */
const CAMPOS_BASICOS: CampoEnvio[] = ['first_name', 'last_name', 'dni', 'phone', 'locality', 'province', 'zipcode']

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8, padding: space[2], border: `1px solid ${color.line}`, borderRadius: radius.lg, background: color.bg2, display: 'grid', gap: 6, fontSize: font.xs, color: color.mut2 }}>
      {children}
    </div>
  )
}

/** Los datos de quien recibe, en el orden de la etiqueta. `solo` = sólo para esa forma de entrega. */
const CAMPOS: { k: CampoEnvio; txt: string; ayuda?: string; solo?: number; si?: 'domicilio' | 'sucursal' }[] = [
  { k: 'first_name', txt: 'Nombre' },
  { k: 'last_name', txt: 'Apellido' },
  { k: 'dni', txt: 'DNI o CUIT' },
  { k: 'phone', txt: 'Teléfono' },
  { k: 'branch_name', txt: 'Sucursal', si: 'sucursal' },
  { k: 'address', txt: 'Dirección', ayuda: 'Calle, número, piso y depto', si: 'domicilio' },
  { k: 'locality', txt: 'Localidad' },
  { k: 'province', txt: 'Provincia' },
  { k: 'zipcode', txt: 'Código postal' },
  { k: 'insurance_amount', txt: 'Seguro', ayuda: 'Vacío = mínimo', solo: TRANSPORTE },
  { k: 'payment_info', txt: 'Pago', ayuda: 'Vacío = en destino', solo: TRANSPORTE },
  { k: 'free_text', txt: 'Texto libre', solo: 2 },
]

const campoStyle: React.CSSProperties = {
  width: '100%',
  height: 30,
  padding: '0 8px',
  fontSize: font.sm,
  borderRadius: radius.sm,
  border: `1px solid ${color.line}`,
  background: color.surface,
  color: color.ink,
  boxSizing: 'border-box',
}

/** Los campos de «Datos de quien recibe», sueltos para usarlos en las dos pantallas de la etiqueta. */
function CamposDeEnvio({ p, codigo, envio, poner }: { p: PedidoLogistica; codigo: number; envio: Envio; poner: (k: CampoEnvio, v: string) => void }) {
  const entrega = envio.delivery_type === 'domicilio' ? 'domicilio' : envio.delivery_type === 'sucursal' ? 'sucursal' : null
  return (
    <>
      <label style={{ fontSize: font.xs, color: color.mut2 }}>
        Entrega
        <select value={entrega ?? ''} onChange={(e) => poner('delivery_type', e.target.value)} style={{ ...campoStyle, marginTop: 2 }}>
          <option value="">Elegí</option>
          <option value="sucursal">En sucursal</option>
          <option value="domicilio">A domicilio</option>
        </select>
      </label>

      {CAMPOS.filter((c) => (!c.solo || c.solo === codigo) && (!c.si || !entrega || c.si === entrega)).map((c) => (
        <label key={c.k} style={{ fontSize: font.xs, color: c.k && p.missing.length && esFaltante(p, c.txt) ? color.warningInk : color.mut2 }}>
          {c.txt}
          {c.ayuda && <span style={{ color: color.mut2 }}> · {c.ayuda}</span>}
          {c.k === 'free_text' ? (
            <textarea value={envio[c.k] ?? ''} onChange={(e) => poner(c.k, e.target.value)} rows={2} style={{ ...campoStyle, height: 'auto', padding: 8, marginTop: 2, fontFamily: 'inherit' }} />
          ) : (
            <input value={envio[c.k] ?? ''} onChange={(e) => poner(c.k, e.target.value)} style={{ ...campoStyle, marginTop: 2 }} />
          )}
        </label>
      ))}
    </>
  )
}

/**
 * Armar la etiqueta desde el chat (Darío, 22-oct-2026): pegar el mensaje del cliente → la IA de
 * Logística separa los datos → se revisan → se ve la etiqueta → «Guardar y generar». La imprime el
 * depósito; el panel no imprime.
 *
 * 🔑 **Guardar pide haber visto la etiqueta con ESOS datos**: tocar un campo después de la vista
 * previa vuelve a pedirla. Es todo o nada en Logística, pero lo que se guarda es real.
 */
function ArmarEtiqueta({
  p,
  despacho,
  onCancelar,
  onListo,
}: {
  p: PedidoLogistica
  despacho?: string
  onCancelar: () => void
  onListo: (nuevo: PedidoLogistica | null, txt: string, mal?: boolean) => void
}) {
  const codigo = p.dispatch_option?.code ?? TRANSPORTE
  const [mensaje, setMensaje] = useState(despacho || '')
  const [envio, setEnvio] = useState<Envio>(() => ({ ...(p.shipping || {}) }))
  const [carrier, setCarrier] = useState<string>(p.carrier?.slug ?? '')
  const [cat, setCat] = useState<Catalogos | null>(null)
  const [ocupado, setOcupado] = useState<'leer' | 'ver' | 'guardar' | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const [previa, setPrevia] = useState<{ png: string; de: string } | null>(null)
  useEffect(() => {
    if (codigo === TRANSPORTE) catalogosLogistica().then((r) => r.t === 'ok' && setCat(r.datos))
  }, [codigo])

  const datos = {
    dispatch_option: codigo,
    ...(codigo === TRANSPORTE ? { carrier: carrier || null } : {}),
    shipping: cambiosDeEnvio(p.shipping, envio),
  }
  const huella = JSON.stringify(datos)
  const vista = previa?.de === huella

  const poner = (k: CampoEnvio, v: string) => setEnvio((e) => ({ ...e, [k]: v }))

  const leer = async () => {
    setOcupado('leer')
    setProblema(null)
    const r = await leerMensaje(mensaje)
    setOcupado(null)
    if (r.t !== 'ok') return setProblema(r.motivo)
    // Lo que la IA no encontró no borra lo que ya estaba.
    setEnvio((e) => {
      const n = { ...e }
      for (const [k, v] of Object.entries(r.shipping) as [CampoEnvio, string | null][]) if (v) n[k] = v
      return n
    })
    if (r.carrier && codigo === TRANSPORTE) {
      const c = cat?.carriers.find((x) => x.slug === r.carrier || x.label.toLowerCase() === r.carrier!.toLowerCase())
      setCarrier(c ? c.slug : r.carrier)
    }
  }

  const ver = async () => {
    setOcupado('ver')
    setProblema(null)
    const r = await vistaPrevia(p, datos)
    setOcupado(null)
    if (r.t !== 'ok') return setProblema(r.motivo)
    setPrevia({ png: r.png, de: huella })
  }

  const guardar = async () => {
    if (!vista) return
    setOcupado('guardar')
    setProblema(null)
    const r = await generarEtiqueta(p, datos)
    setOcupado(null)
    if (r.t === 'ok') return onListo(r.pedido, 'Etiqueta generada: la imprime el depósito')
    if (r.t === 'cambio') return onListo(r.pedido, `${r.motivo} Fijate cómo quedó antes de volver a guardar.`, true)
    setProblema(r.motivo)
  }

  return (
    <div style={{ marginTop: 6, padding: space[2], border: `1px solid ${color.line}`, borderRadius: radius.md, background: color.bg2, display: 'grid', gap: 6 }}>
      <label style={{ fontSize: font.xs, color: color.mut2 }}>
        Mensaje del cliente
        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          rows={3}
          placeholder="Pegá acá el mensaje con sus datos"
          style={{ ...campoStyle, height: 'auto', padding: 8, marginTop: 2, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>
      <div>
        <BotonChico onClick={leer} disabled={!mensaje.trim() || !!ocupado}>
          {ocupado === 'leer' ? 'Leyendo…' : 'Completar con el mensaje'}
        </BotonChico>
      </div>

      {codigo === TRANSPORTE && (
        <label style={{ fontSize: font.xs, color: color.mut2 }}>
          Transporte
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} style={{ ...campoStyle, marginTop: 2 }}>
            <option value="">Elegí el transporte</option>
            {(cat?.carriers || []).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
            {carrier && cat && !cat.carriers.some((c) => c.slug === carrier) && <option value={carrier}>{carrier} (nuevo)</option>}
          </select>
        </label>
      )}

      <CamposDeEnvio p={p} codigo={codigo} envio={envio} poner={poner} />

      {problema && <div style={{ fontSize: font.xs, color: color.dangerInk }}>{problema}</div>}

      {previa && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previa.png} alt="Vista previa de la etiqueta" style={{ width: '100%', border: `1px solid ${color.line}`, borderRadius: radius.sm, background: '#fff', opacity: vista ? 1 : 0.4 }} />
      )}
      {previa && !vista && <div style={{ fontSize: font.xs, color: color.mut2 }}>Cambiaste algo: volvé a ver la etiqueta antes de guardar.</div>}
      {/* Darío, 24-oct-2026: «no me deja poner guardar y generar». El botón apagado no decía por qué. */}
      {!previa && <div style={{ fontSize: font.xs, color: color.mut2 }}>Para guardar, primero tocá «Ver etiqueta».</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <BotonChico onClick={ver} disabled={!!ocupado}>
          {ocupado === 'ver' ? 'Armando…' : 'Ver etiqueta'}
        </BotonChico>
        <BotonChico fuerte onClick={guardar} disabled={!vista || !!ocupado}>
          {ocupado === 'guardar' ? 'Guardando…' : 'Guardar y generar'}
        </BotonChico>
        <BotonChico onClick={onCancelar} disabled={!!ocupado}>
          Cancelar
        </BotonChico>
      </div>
    </div>
  )
}

/** ¿Logística dice que falta este dato? (`missing` viene con los nombres de su pantalla.) */
function esFaltante(p: PedidoLogistica, txt: string): boolean {
  const t = txt.toLowerCase()
  return p.missing.some((m) => m.toLowerCase() === t || m.toLowerCase().startsWith(t.split(' ')[0]))
}

/** El número de EM que da Envío Nube. Sólo dígitos. */
function CargarEM({
  p,
  onCancelar,
  onListo,
}: {
  p: PedidoLogistica
  onCancelar: () => void
  onListo: (nuevo: PedidoLogistica | null, txt: string, mal?: boolean) => void
}) {
  const [valor, setValor] = useState(p.em ? String(p.em) : '')
  const [guardando, setGuardando] = useState(false)
  const numero = /^\d{1,10}$/.test(valor) ? Number(valor) : null
  const guardar = async () => {
    if (!numero || guardando) return
    setGuardando(true)
    const r = await guardarEM(p, numero)
    setGuardando(false)
    if (r.t === 'ok') return onListo(r.pedido, 'EM guardado en Logística')
    if (r.t === 'cambio') return onListo(r.pedido, `${r.motivo} Fijate cómo quedó.`, true)
    onListo(null, r.motivo, true)
  }
  return (
    <div style={{ marginTop: 6, padding: space[2], border: `1px solid ${color.line}`, borderRadius: radius.md, background: color.bg2 }}>
      <label style={{ fontSize: font.xs, color: color.mut2 }}>
        Número de EM
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && guardar()}
          inputMode="numeric"
          autoFocus
          style={{ ...campoStyle, marginTop: 2 }}
        />
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <BotonChico fuerte onClick={guardar} disabled={!numero || numero === Number(p.em) || guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </BotonChico>
        <BotonChico onClick={onCancelar} disabled={guardando}>
          Cancelar
        </BotonChico>
      </div>
    </div>
  )
}
