'use client'

/**
 * El PEDIDO MAYORISTA adentro del panel de WhatsApp (plan «BDI directo al ERP», paso 3; pedido de Darío §2-§3, Bruno 30-oct).
 * Los pedidos del cliente del chat con su estado y su pago (Pagado / Pagó una parte / Sin pagar), la hoja del pedido con el
 * stock real al lado de cada producto, cambiar cantidades, «Enviar a preparar» (Darío: «mandar a preparar»; lo decide él, esté pago o no) y anular.
 *
 * 🔑 ESCONDIDO como la cuenta corriente (`CuentaCorriente.tsx`, `docs/secciones/crm.md` § Lo ESCONDIDO): sólo se dibuja con
 * `PANEL_CUENTA_CORRIENTE` prendido para el usuario. Y los botones que ESCRIBEN quedan apagados hasta `VENTA_MAYORISTA_REAL`
 * (el día del corte de BDI): hasta entonces el pedido se maneja en Gestión Nube y el servidor contesta 409.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, CopyButton, Field, Input, Modal, Notice } from '@/components/ui'
import { color, font, radius, space } from '@/components/ui/tokens'
import {
  anotarWhatsappPanel, anularPedidoPanel, ponerEnvioPedidoPanel, buscarClientesPanel, buscarProductosPedido, cambiarPedidoPanel, clienteNuevoPanel, entrarPedidoPanel, leerPedidoPanel, leerPedidosPanel, leerPedidosSinCliente, leerPreparadosSinPagar, mandarAPrepararPanel,
  type ClienteDelPanel, type EtapaPedido, type PedidoDelCliente, type PedidoSinCliente, type PreparadoSinPagar, type ProductoParaPedido, type FichaPedido, type PagoPedido, type PedidosPanel,
} from '@/lib/erp/cliente'
import { HojaCargarPago, mensajeDeLaCuenta, useCuentaPrendida, type CuentaConCliente } from './CuentaCorriente'
import { mensajeTotal } from './CalculadoraEnvio'
import { escribirMonto, parsearMonto } from '@/lib/compromisos/core'
import { FacturarParte, FacturarPedido, LETRA, descargarFactura, numeroComprobante } from './FacturasCliente'
import { codigoPedido } from '@/lib/erp/codigos.core.js'
import { esAprobador } from '@/lib/reposicion/armado.core.js'
import { usePerfilOpcional } from '@/components/SesionProvider'
import { copiarAlPortapapeles } from '@/lib/portapapeles'
import { Bloque, BotonPaso, Cuando, Paso, Renglon } from './pasos-pedido'

const plata = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const diaMes = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }
const ROTULO = { fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase' } as const

export const ETAPA: Record<EtapaPedido, string> = {
  sin_entrar: 'Sin entrar', pedido: 'Pedido', a_preparar: 'Pendiente de preparación', en_preparacion: 'En preparación',
  preparado: 'Preparado', despachado: 'Despachado', anulado: 'Anulado',
}

/** «Pagado» · «Pagó una parte (falta $X)» · «Sin pagar» (Darío §3). */
export function textoPago(p: PagoPedido): string {
  if (p.estado === 'pagado') return 'Pagado'
  if (p.estado === 'parcial') return `Pagó una parte (falta ${plata(p.falta)})`
  return 'Sin pagar'
}
const tonoPago = (p: PagoPedido) => (p.estado === 'pagado' ? color.successInk : color.dangerInk)

/** Los pedidos del cliente del chat; `null` = apagado o cargando (⛔ se dibuja nada). */
export function usePedidosPanel(clienteId: string | null, tel: string | null): { pedidos: Extract<PedidosPanel, { prendido: true }> | null; releer: () => void } {
  const prendido = useCuentaPrendida()
  const [pedidos, setPedidos] = useState<Extract<PedidosPanel, { prendido: true }> | null>(null)
  const [vuelta, setVuelta] = useState(0)
  // Igual que la cuenta: con el mismo número, lo visto queda hasta que llega lo nuevo (⛔ se vacía al llegar el id del cliente).
  const telVisto = useRef(tel)
  useEffect(() => {
    if (telVisto.current !== tel) { telVisto.current = tel; setPedidos(null) }
    if (!prendido || (!clienteId && !tel)) return
    let vivo = true
    leerPedidosPanel({ clienteId, tel })
      .then((r) => { if (vivo) setPedidos(r.prendido ? r : null) })
      .catch(() => {})
    return () => { vivo = false }
  }, [prendido, clienteId, tel, vuelta])
  const releer = useCallback(() => setVuelta((v) => v + 1), [])
  return { pedidos, releer }
}

const APAGADO = 'Los pedidos se manejan desde acá el día que BDI pasa a Areben Gestión. Hasta entonces, en Gestión Nube.'

/**
 * La tarjeta «Pedidos»: los entrados al ERP (el más nuevo primero) y los que llegaron con el número del chat y todavía no
 * entraron. Tocar uno abre la hoja.
 */
export function TarjetaPedidos({ pedidos, clienteId, personaId, tel, cuenta = null, logistica = null, decir, onCambio }: {
  pedidos: Extract<PedidosPanel, { prendido: true }>; clienteId: string | null; personaId: string | null; tel: string | null
  /** El estado en Logística de los pedidos en curso, por número de GN (`null` = todavía no llegó): para los vendidos por GN. */
  logistica?: Map<string, string> | null
  /** La cuenta del cliente: con ella la hoja del pedido deja «Cargar pago» (Darío §4). */
  cuenta?: CuentaConCliente | null
  decir: (txt: string, mal?: boolean) => void; onCambio: () => void
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [entrando, setEntrando] = useState<string | null>(null)
  const [pagando, setPagando] = useState<{ ventaId: string; numero: number; falta: number } | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const deGn = pedidos.deGn ?? []
  if (!pedidos.pedidos.length && !pedidos.sinEntrar.length && !deGn.length) return null
  const aPreparacion = async (p: PedidoDelCliente) => {
    setEnviando(p.id)
    try { await mandarAPrepararPanel(p.id); decir('Enviado a preparación.'); onCambio() } catch (e) { decir(e instanceof Error ? e.message : 'No se pudo enviar a preparación.', true) } finally { setEnviando(null) }
  }
  const entrar = async (pedidoId: string) => {
    if (!clienteId) return
    setEntrando(pedidoId)
    try {
      await entrarPedidoPanel({ pedidoId, clienteId, personaId })
      decir(pedidos.sinEntrar.find((x) => x.id === pedidoId)?.apartado ? 'Listo: el pedido pasó a este cliente.' : 'Pedido entrado.')
      onCambio()
    } catch (e) {
      decir(e instanceof Error ? e.message : 'No se pudo entrar el pedido.', true)
    } finally {
      setEntrando(null)
    }
  }
  return (
    <section style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: `${space[2]}px ${space[3]}px ${space[3]}px`, margin: `0 ${space[2]}px ${space[2]}px` }}>
      <div style={{ ...ROTULO, marginBottom: 6 }}>Pedidos</div>
      {!clienteId && tel && pedidos.sinEntrar.length > 0 && (
        <ElegirCliente tel={tel} persona={pedidos.sinEntrar[0].nombre} escribir={pedidos.escribir} decir={decir} onCambio={onCambio} />
      )}
      {pedidos.sinEntrar.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: font.sm, padding: '4px 0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>Pedido {codigoPedido(p.numero)}</b> <span style={{ color: color.mut2 }}>· {diaMes(p.recibido_en)} · {p.unidades} u · {plata(p.total)}</span>
            <div style={{ fontSize: font.xs, color: p.apartado ? color.dangerInk : color.mut2 }}>
              {p.apartado ? <b>Sin cliente</b> : 'sin entrar'} · llegó con este número{p.nombre ? ` · «${p.nombre}»` : ''}
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={!pedidos.escribir || !clienteId || entrando === p.id} title={pedidos.escribir ? (clienteId ? undefined : 'Primero elegí o creá el cliente de este número') : APAGADO} onClick={() => void entrar(p.id)}>
            {entrando === p.id ? (p.apartado ? 'Pasando…' : 'Entrando…') : (p.apartado ? 'Pasar a este cliente' : 'Entrar')}
          </Button>
        </div>
      ))}
      {deGn.map((p) => (
        <div key={p.id} style={{ fontSize: font.sm, padding: '4px 0' }}>
          <b>Pedido {codigoPedido(p.numero)}</b> <span style={{ color: color.mut2 }}>· {diaMes(p.recibido_en)} · {p.unidades} u · {plata(p.total)}</span>
          <div style={{ fontSize: font.xs, color: color.mut2 }}>
            Vendido por GN #{p.gn_number}{logistica ? ` · ${logistica.has(p.gn_number) ? `Logística: ${logistica.get(p.gn_number)}` : 'no está en curso en Logística'}` : ''}
          </div>
        </div>
      ))}
      {pedidos.pedidos.map((p) => {
        const debe = !!p.pago && p.pago.falta > 0 && p.etapa !== 'anulado'
        const pagar = debe && !!cuenta && !!p.venta_id
        const enviar = p.etapa === 'pedido' && pedidos.escribir
        return (
          <div key={p.id} style={{ borderTop: `1px solid ${color.line2}`, padding: '7px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={() => setAbierto(p.id)}
                style={{ flex: 1, minWidth: 0, height: 'auto', textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: font.sm, color: 'inherit' }}>
                <b>Pedido {codigoPedido(p.numero)}</b> <span style={{ color: color.mut2 }}>· {diaMes(p.recibido_en)}{p.persona ? ` · ${p.persona}` : ''}</span>
                <div style={{ fontSize: font.xs, color: color.mut2 }}>
                  {p.unidades} u · {plata(p.total)}{p.etapa === 'anulado' ? ' · Anulado' : p.pago ? <> · <b style={{ color: tonoPago(p.pago) }}>{textoPago(p.pago).toLowerCase()}</b></> : ''}
                </div>
              </button>
              {pagar
                ? <Button size="sm" variant="solid" tone="brand" onClick={() => setPagando({ ventaId: p.venta_id as string, numero: p.numero, falta: (p.pago as PagoPedido).falta })}>$ Cargar pago</Button>
                : enviar && <Button size="sm" variant="solid" tone="success" disabled={enviando === p.id} onClick={() => void aPreparacion(p)}>Enviar a preparación</Button>}
            </div>
            {pagar && enviar && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 5 }}>
                <Button size="sm" variant="outline" disabled={enviando === p.id} onClick={() => void aPreparacion(p)}>Enviar a preparación</Button>
              </div>
            )}
            {p.etapa !== 'anulado' && <BarraDePasos p={p} />}
          </div>
        )
      })}
      {!pedidos.escribir && <div style={{ fontSize: 11, color: color.mut2, marginTop: 6 }}>{APAGADO}</div>}
      {abierto && <HojaPedido pedidoId={abierto} cuenta={cuenta} onCerrar={() => setAbierto(null)} onHecho={(t) => { decir(t); onCambio() }} />}
      {pagando && cuenta && (
        <HojaCargarPago cuenta={cuenta} pedido={pagando} onCerrar={() => setPagando(null)} onHecho={(t) => { setPagando(null); decir(t); onCambio() }} />
      )}
    </section>
  )
}

/** Las referencias del libro («venta:<id>») de los pedidos abiertos: su deuda se ve en el pedido, ⛔ se repite como compra. */
export function refsDePedidosAbiertos(pedidos: Extract<PedidosPanel, { prendido: true }> | null): Set<string> {
  return new Set((pedidos?.pedidos ?? []).filter((p) => p.etapa !== 'despachado' && p.etapa !== 'anulado').flatMap((p) => (p.venta_id ? [p.venta_id, `venta:${p.venta_id}`] : [])))
}

type Sigue = { k: string; tono: 'rojo' | 'ambar'; titulo: string; detalle: string; mensaje?: { label: string; texto: string } | null }

/**
 * Lo que hay que hacer con este cliente, en orden (Darío 15-nov): 1) pedido sin cliente, 2) armado sin pagar, 3) debe una compra
 * vieja (la de más días primero). Sin botones de pedido: ésos están en la tarjeta de Pedidos (cada botón una sola vez); acá sólo
 * el mensaje para el cliente.
 */
export function loQueSigue(pedidos: Extract<PedidosPanel, { prendido: true }> | null, cuenta: CuentaConCliente | null): Sigue[] {
  const out: Sigue[] = []
  for (const p of pedidos?.sinEntrar ?? []) {
    if (p.apartado) out.push({ k: `sc-${p.id}`, tono: 'rojo', titulo: 'Sin cliente', detalle: `${codigoPedido(p.numero)} · ${p.unidades} u · ${plata(p.total)}` })
  }
  const msj = cuenta ? mensajeDeLaCuenta(cuenta) : null
  for (const p of pedidos?.pedidos ?? []) {
    // Con crédito sale a Despacho igual: ⛔ es «armado sin pagar» (zona del pedido; sin zona, el crédito del pedido).
    if (p.etapa === 'preparado' && p.pago && p.pago.falta > 0 && (p.zona ? p.zona === 'pendiente_pago' : !p.cuenta_habilitada)) {
      out.push({ k: `ps-${p.id}`, tono: 'ambar', titulo: `${codigoPedido(p.numero)} armado, sin pagar`, detalle: `${p.unidades} u · falta ${plata(p.pago.falta)}`, mensaje: msj ? { label: 'Pedir pago', texto: msj } : null })
    }
  }
  // Las compras que deben y ⛔ son de un pedido abierto (ésas ya están arriba o en la tarjeta de Pedidos).
  const abiertas = refsDePedidosAbiertos(pedidos)
  const viejas = (cuenta?.estado.pendientes ?? []).filter((x) => x.pendiente > 0.5 && !abiertas.has(x.ref)).sort((a, b) => b.dias - a.dias)
  for (const v of viejas) {
    out.push({ k: `cv-${v.ref}`, tono: 'rojo', titulo: `Debe ${plata(v.pendiente)} hace ${v.dias} días`, detalle: v.monto > v.pendiente ? `pagó ${plata(v.monto - v.pendiente)} de ${plata(v.monto)}` : `compra del ${v.fecha.slice(8, 10)}/${v.fecha.slice(5, 7)}`, mensaje: msj ? { label: 'Enviar saldo', texto: msj } : null })
  }
  return out
}

/** El recuadro «Lo que sigue», debajo del encabezado: muestra uno y «+N más». Vacío ⇒ ⛔ se dibuja. */
export function LoQueSigue({ items }: { items: Sigue[] }) {
  const [todos, setTodos] = useState(false)
  if (!items.length) return null
  const vista = todos ? items : items.slice(0, 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: `0 ${space[2]}px ${space[2]}px` }}>
      {vista.map((it) => {
        const rojo = it.tono === 'rojo'
        return (
          <div key={it.k} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: radius.lg, padding: '8px 12px', border: `1px solid ${rojo ? color.dangerBorder : color.warningBorder}`, background: rojo ? color.dangerBg : color.warningBg, color: rojo ? color.dangerInk : color.warningInk }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: font.sm }}><b style={{ display: 'block' }}>{it.titulo}</b>{it.detalle}</div>
            {it.mensaje && <CopyButton getText={() => it.mensaje!.texto} label={it.mensaje.label} copiedLabel="✓ Copiado" iconLeft="💬" />}
          </div>
        )
      })}
      {items.length > 1 && (
        <button type="button" onClick={() => setTodos((t) => !t)} style={{ alignSelf: 'flex-start', height: 'auto', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: font.xs, color: color.brand }}>
          {todos ? 'Ver menos' : `+${items.length - 1} más`}
        </button>
      )}
    </div>
  )
}

const PASOS = ['Pedido', 'Pago', 'Preparación', 'Despacho'] as const

/** Qué pasos están hechos: Pedido siempre; Pago si pagó; Preparación si ya está armado; Despacho si salió. */
export function pasosDe(p: Pick<PedidoDelCliente, 'etapa' | 'pago'>): boolean[] {
  const armado = p.etapa === 'preparado' || p.etapa === 'despachado'
  return [true, p.pago?.estado === 'pagado', armado, p.etapa === 'despachado']
}

/** La barra Pedido · Pago · Preparación · Despacho (Darío 15-nov): verde lo hecho, índigo el primero que falta. */
function BarraDePasos({ p }: { p: PedidoDelCliente }) {
  const hechos = pasosDe(p)
  const actual = hechos.indexOf(false)
  return (
    <div aria-label={`Pasos: ${PASOS.map((t, i) => `${t} ${hechos[i] ? 'hecho' : 'falta'}`).join(', ')}`}>
      <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
        {PASOS.map((t, i) => <i key={t} style={{ flex: 1, height: 4, borderRadius: 3, background: hechos[i] ? color.success : i === actual ? color.brand : color.bg2 }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: color.mut2, marginTop: 3 }}>
        {PASOS.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  )
}

/** Los transportes del envío pagado en origen (EM). */
const TRANSPORTES = ['Andreani', 'Correo Argentino']

/**
 * El envío del pedido (Darío 15-nov): lo que paga el cliente en origen (EM) va en el pedido y se suma al total, así el pago
 * cierra justo. Vacío o 0 lo saca. ⛔ se cambia con el pedido facturado (el servidor frena igual).
 */
function EnvioDelPedido({ envio, transporte, sinFactura, cambiar, guardar }: {
  envio: number | null; transporte: string | null; sinFactura: boolean; cambiar: boolean
  guardar: (envio: number | null, transporte: string | null) => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [monto, setMonto] = useState('')
  const [trans, setTrans] = useState<string | null>(null)
  const hay = envio != null && envio > 0
  const abrir = () => { setMonto(hay ? escribirMonto(envio as number) : ''); setTrans(transporte); setAbierto(true) }
  const n = monto.trim() ? parsearMonto(monto) : 0
  const valido = Number.isFinite(n) && n >= 0
  if (!hay && !cambiar) return null
  if (abierto) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${color.line2}`, paddingTop: 6 }}>
      <Field label="Envío"><Input inputMode="decimal" autoFocus value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$" /></Field>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TRANSPORTES.map((t) => (
          <Button key={t} size="sm" variant={trans === t ? 'solid' : 'outline'} tone={trans === t ? 'brand' : undefined} onClick={() => setTrans(trans === t ? null : t)}>{t}</Button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
        {hay && <Button size="sm" variant="ghost" tone="danger" onClick={() => void guardar(null, null).then(() => setAbierto(false))}>Sacar</Button>}
        <Button size="sm" variant="solid" tone="brand" disabled={!valido || n <= 0} onClick={() => void guardar(n, trans).then(() => setAbierto(false))}>Guardar</Button>
      </div>
    </div>
  )
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: font.sm, borderTop: `1px solid ${color.line2}`, paddingTop: 6 }}>
      <span>Envío{transporte && hay ? ` (${transporte})` : ''}{sinFactura ? ': sin factura' : ''}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {cambiar && <Button size="sm" variant="outline" onClick={abrir}>{hay ? 'Cambiar' : '+ Envío'}</Button>}
        {hay && <span>{plata(envio as number)}</span>}
      </span>
    </div>
  )
}

/**
 * La hoja del pedido (Darío §2): los productos con el stock real al lado, cambiar cantidades (0 = se saca), agregar productos
 * (buscador del catálogo, precio de la lista mayorista), quién cambió qué, «Enviar a preparar» y anular. ⛔ se toca cuando el depósito ya empezó a escanear.
 */
export function HojaPedido({ pedidoId, cuenta = null, onCerrar, onHecho }: { pedidoId: string; cuenta?: CuentaConCliente | null; onCerrar: () => void; onHecho: (txt: string) => void }) {
  const [ficha, setFicha] = useState<FichaPedido | null>(null)
  const [pagando, setPagando] = useState(false)
  const [facturando, setFacturando] = useState(false)
  const [porParte, setPorParte] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  /** Los renglones AGREGADOS sin guardar (su cantidad vive en `cantidades`, como la de los demás). */
  const [agregados, setAgregados] = useState<Agregado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [anulando, setAnulando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    let vivo = true
    leerPedidoPanel(pedidoId)
      .then((r) => {
        if (!vivo) return
        if (!r.prendido) { setError('La cuenta corriente del panel está apagada.'); return }
        setFicha(r)
        setCantidades(Object.fromEntries(r.lineas.map((l) => [`${l.product_id}:${l.size_id}`, l.cantidad])))
        setAgregados([])
      })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el pedido.') })
    return () => { vivo = false }
  }, [pedidoId, vuelta])

  const cambiado = useMemo(() => !!ficha && (ficha.lineas.some((l) => cantidades[`${l.product_id}:${l.size_id}`] !== l.cantidad)
    || agregados.some((a) => (cantidades[a.k] ?? 0) > 0)), [ficha, cantidades, agregados])
  /** Elegir una variante del buscador: si ya está en el pedido (o recién agregada), una más; si no, un renglón nuevo con 1. */
  const agregar = (prod: ProductoParaPedido, v: ProductoParaPedido['variantes'][number]) => {
    const k = `${prod.product_id}:${v.size_id}`
    const ya = ficha?.lineas.some((l) => `${l.product_id}:${l.size_id}` === k) || agregados.some((a) => a.k === k)
    if (!ya && prod.precio != null) setAgregados((as) => [...as, { k, product_id: prod.product_id, size_id: v.size_id, nombre: prod.nombre, talle: v.talle, precio: prod.precio as number, stock: v.stock }])
    setCantidades((c) => ({ ...c, [k]: (c[k] ?? 0) + 1 }))
    setBuscando(false)
  }
  const hacer = async (fn: () => Promise<{ avisarDeposito?: boolean; sinCambios?: boolean }>, ok: string) => {
    setOcupado(true)
    setError(null)
    try {
      const r = await fn()
      onHecho(r.avisarDeposito ? `${ok} Al depósito le aparece el aviso de que el pedido cambió.` : ok)
      setVuelta((v) => v + 1)
      setAnulando(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    } finally {
      setOcupado(false)
    }
  }

  const p = ficha?.pedido
  const puede = !!ficha?.escribir && !!p?.editable
  /** Anular: sólo Darío y Bruno, al final de la hoja y con motivo (Darío 15-nov). El servidor frena igual. */
  const perfil = usePerfilOpcional()
  const puedeAnular = puede && esAprobador(perfil)
  return (
    <Modal abierto onCerrar={onCerrar} titulo={p ? `Pedido ${codigoPedido(p.numero)}` : 'Pedido'}
      pie={ficha && (<>
        <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        {cambiado
          ? <Button variant="solid" tone="brand" disabled={!puede || ocupado}
              onClick={() => void hacer(() => cambiarPedidoPanel(pedidoId, [
                ...ficha.lineas.filter((l) => l.size_id != null).map((l) => ({ productId: l.product_id, sizeId: l.size_id as number, cantidad: cantidades[`${l.product_id}:${l.size_id}`] ?? l.cantidad })),
                ...agregados.map((a) => ({ productId: a.product_id, sizeId: a.size_id, cantidad: cantidades[a.k] ?? 0 })).filter((a) => a.cantidad > 0),
              ]), 'Cambio guardado.')}>Guardar</Button>
          : p?.etapa === 'pedido' && <Button variant="solid" tone="brand" disabled={!ficha.escribir || ocupado || !!p.falta_cliente} title={p.falta_cliente ? 'Sin cliente' : undefined} onClick={() => void hacer(() => mandarAPrepararPanel(pedidoId), 'Enviado a preparación.')}>Enviar a preparación</Button>}
      </>)}>
      {error && <Notice tone="danger">{error}</Notice>}
      {!ficha && !error && <div style={{ fontSize: font.sm, color: color.mut2 }}>Cargando…</div>}
      {ficha && p && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <div style={{ fontSize: font.sm }}>
            {ETAPA[p.etapa]}{p.persona ? ` · pidió ${p.persona.nombre ?? p.persona.whatsapp}` : ''}
            {p.pago && <> · <b style={{ color: tonoPago(p.pago) }}>{textoPago(p.pago)}</b></>}
            {p.zona === 'pendiente_pago' && p.etapa !== 'anulado' && <div style={{ fontSize: font.xs, color: color.mut2 }}>Sin pagar y sin cuenta corriente: al terminar de prepararlo va a «Pendiente de pago».</div>}
            {p.pago?.tolerado && <div style={{ fontSize: font.xs, color: color.mut2 }}>Le faltan {plata(p.pago.falta)}: menos de $1.000, se da por pagado y la diferencia queda en su cuenta.</div>}
          </div>
          {cuenta && p.venta_id && p.pago && p.pago.falta > 0 && p.etapa !== 'anulado' && (
            <div><Button size="sm" variant="outline" tone="success" onClick={() => setPagando(true)}>$ Cargar pago</Button></div>
          )}
          {p.falta_cliente && p.etapa !== 'anulado' && <Notice tone="danger"><b>Sin cliente.</b> Elegí el cliente en Hoy › «Sin cliente» o desde el chat de su número{p.contacto?.telefono ? ` (${p.contacto.telefono})` : ''}.</Notice>}
          {!ficha.escribir && <Notice tone="info">{APAGADO}</Notice>}
          {ficha.escribir && !p.editable && p.etapa !== 'anulado' && <Notice tone="info">El depósito ya empezó a prepararlo: no se cambia.</Notice>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...ficha.lineas.map((l) => ({ ...l, nuevo: false })), ...agregados.map((a) => ({ ...a, cantidad: 0, nuevo: true }))].map((l) => {
              const k = `${l.product_id}:${l.size_id}`
              const n = cantidades[k] ?? l.cantidad
              if (l.nuevo && n <= 0) return null
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: font.sm }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{l.nombre ?? `Producto ${l.product_id}`}</b>{l.talle ? ` · ${l.talle}` : ''}{l.nuevo && <span style={{ fontSize: font.xs, color: color.mut2 }}> · agregado</span>}
                    <div style={{ fontSize: font.xs, color: l.stock != null && l.stock < 0 ? color.dangerInk : color.mut2 }}>{plata(l.precio)} c/u · stock {l.stock ?? '—'}</div>
                  </div>
                  {puede && l.size_id != null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Button size="sm" variant="outline" aria-label="Uno menos" disabled={n <= 0} onClick={() => setCantidades((c) => ({ ...c, [k]: Math.max(0, n - 1) }))}>−</Button>
                      <b style={{ minWidth: 24, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{n}</b>
                      <Button size="sm" variant="outline" aria-label="Uno más" onClick={() => setCantidades((c) => ({ ...c, [k]: n + 1 }))}>+</Button>
                    </div>
                  ) : <b style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</b>}
                </div>
              )
            })}
          </div>
          {puede && (buscando
            ? <BuscarProducto pedidoId={pedidoId} onElegir={agregar} onCerrar={() => setBuscando(false)} />
            : <div><Button size="sm" variant="outline" onClick={() => setBuscando(true)}>Agregar producto</Button></div>)}
          {p.etapa !== 'anulado' && (
            <EnvioDelPedido envio={p.envio ?? null} transporte={p.transporte ?? null}
              sinFactura={!!ficha.facturacion?.entera && ficha.facturacion.entera.total < p.total}
              cambiar={ficha.escribir && !cambiado && !ocupado && !(ficha.facturacion?.entera || (ficha.facturacion?.partes ?? 0) > 0)}
              guardar={(envio, transporte) => hacer(() => ponerEnvioPedidoPanel(pedidoId, envio, transporte), envio ? 'Envío guardado.' : 'Envío sacado.')} />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: font.sm, borderTop: `1px solid ${color.line2}`, paddingTop: 6 }}>
            <span>Total{cambiado ? ' (se recalcula al guardar)' : ''}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!cambiado && p.envio != null && p.envio > 0 && p.etapa !== 'anulado' && <CopyButton getText={() => mensajeTotal(p.total)} label="Total" copiedLabel="✓ Copiado" iconLeft="💬" />}
              <b>{plata(p.total)}</b>
            </span>
          </div>
          {p.venta_id && ficha.facturacion && (ficha.facturacion.entera ? (
            <div style={{ fontSize: font.sm, color: color.successInk }}>
              Facturado ✓ · {LETRA[ficha.facturacion.entera.tipo] ?? ''} {numeroComprobante(ficha.facturacion.entera)}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {ficha.facturacion.partes > 0 && <span style={{ fontSize: font.sm }}>Facturado {plata(ficha.facturacion.facturado)} de {plata(ficha.facturacion.total)}</span>}
              {/* Sin facturas, las dos; con partes, sólo la parte (la entera ya ⛔ sale); con la entera, ninguna. */}
              {p.etapa !== 'anulado' && p.cliente_id && !cambiado && ficha.facturacion.partes === 0 && (
                <Button size="sm" variant="outline" disabled={!ficha.escribir} title={ficha.escribir ? undefined : APAGADO} onClick={() => setFacturando(true)}>Facturar</Button>
              )}
              {p.etapa !== 'anulado' && p.cliente_id && !cambiado && ficha.facturacion.queda > 0 && (
                <Button size="sm" variant="outline" disabled={!ficha.escribir} title={ficha.escribir ? undefined : APAGADO} onClick={() => setPorParte(true)}>Facturar una parte</Button>
              )}
            </div>
          ))}
          {ficha.cambios.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={ROTULO}>Cambios</div>
              {ficha.cambios.map((c, i) => (
                <div key={i} style={{ fontSize: font.xs, color: color.mut2 }}>{diaMes(c.cuando)} · {MOTIVO[c.motivo] ?? c.motivo}{c.usuario ? ` · ${c.usuario}` : ''}</div>
              ))}
            </div>
          )}
          {puedeAnular && (anulando ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Field label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="El cliente no lo quiere" /></Field>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button size="sm" variant="outline" onClick={() => setAnulando(false)}>Cancelar</Button>
                <Button size="sm" variant="solid" tone="danger" disabled={!motivo.trim() || ocupado} onClick={() => void hacer(() => anularPedidoPanel(pedidoId, motivo.trim()), 'Pedido anulado: lo pagado queda a favor.')}>Anular el pedido</Button>
              </div>
            </div>
          ) : <div style={{ borderTop: `1px solid ${color.line2}`, paddingTop: 6, textAlign: 'right' }}><Button size="sm" variant="ghost" tone="danger" onClick={() => setAnulando(true)}>Anular</Button></div>)}
        </div>
      )}
      {facturando && p?.cliente_id && (
        <FacturarPedido pedidoId={pedidoId} clienteId={p.cliente_id} total={p.total} envio={p.envio ?? null} preparado={p.etapa === 'preparado' || p.etapa === 'despachado'}
          onCerrar={() => setFacturando(false)}
          onHecha={async (f, yaEstaba) => {
            setFacturando(false)
            onHecho(yaEstaba ? `El pedido ya tenía la factura ${LETRA[f.tipo] ?? ''} ${numeroComprobante(f)}.` : `Factura ${LETRA[f.tipo] ?? ''} ${numeroComprobante(f)} hecha.`)
            setVuelta((v) => v + 1)
            await descargarFactura(f).catch(() => {})
          }} />
      )}
      {porParte && p?.cliente_id && (
        <FacturarParte pedidoId={pedidoId} clienteId={p.cliente_id}
          onCerrar={() => setPorParte(false)}
          onHecha={async (f, queda) => {
            setPorParte(false)
            onHecho(`Factura ${LETRA[f.tipo] ?? ''} ${numeroComprobante(f)} hecha por ${plata(f.total)}. Quedan ${plata(queda)} por facturar.`)
            setVuelta((v) => v + 1)
            await descargarFactura(f).catch(() => {})
          }} />
      )}
      {pagando && cuenta && p?.venta_id && p.pago && (
        <HojaCargarPago cuenta={cuenta} pedido={{ ventaId: p.venta_id, numero: p.numero, falta: p.pago.falta }}
          onCerrar={() => setPagando(false)} onHecho={(t) => { setPagando(false); onHecho(t); setVuelta((v) => v + 1) }} />
      )}
    </Modal>
  )
}

/**
 * «¿Es de un cliente que ya tenés?» (Darío §1): un pedido llegó con un número que el ERP ⛔ conoce. Se pregunta UNA vez:
 * elegir la ficha anota el número en ella y desde ahí sus pedidos entran solos a ese cliente. «Es nuevo» crea la ficha con
 * el nombre; el CUIT/DNI es opcional y se completa al facturar (Darío/Bruno 15-nov) — detrás de la llave de escribir.
 */
export function ElegirCliente({ tel, persona, escribir, decir, onCambio, onElegido }: {
  tel: string; persona: string | null; escribir: boolean; decir: (txt: string, mal?: boolean) => void; onCambio: () => void
  /** Después de anotar el número (o crear la ficha): lo que sigue con ese cliente —«Falta el cliente» le pasa el pedido—; su texto reemplaza al aviso. */
  onElegido?: (c: ClienteDelPanel) => Promise<string>
}) {
  const [quien, setQuien] = useState(persona ?? '')
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<ClienteDelPanel[] | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [doc, setDoc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) return
    let vivo = true
    const espera = setTimeout(() => {
      buscarClientesPanel(t)
        .then((r) => { if (vivo) { setLista(r.prendido ? r.clientes : []); setError(null) } })
        .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo buscar.') })
    }, 300)
    return () => { vivo = false; clearTimeout(espera) }
  }, [q])
  const vista = q.trim().length < 2 ? null : lista
  const hacer = async (fn: () => Promise<string>) => {
    setOcupado(true)
    setError(null)
    try { decir(await fn()); onCambio() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo.') } finally { setOcupado(false) }
  }
  const elegir = (c: ClienteDelPanel) => void hacer(async () => {
    await anotarWhatsappPanel({ clienteId: c.id, whatsapp: tel, nombre: quien.trim() || undefined })
    return onElegido ? onElegido(c) : `Listo: este número entra solo a ${c.nombre}.`
  })
  const crear = () => void hacer(async () => {
    const r = await clienteNuevoPanel({ nombre: nombre.trim(), doc: doc.trim(), whatsapp: tel, persona: quien.trim() || undefined })
    return onElegido ? onElegido(r.cliente) : `Listo: ${r.cliente.nombre} está creado y este número entra solo ahí.`
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${color.line}`, borderRadius: radius.md, padding: space[2], marginBottom: 6 }}>
      <div style={{ fontSize: font.sm }}><b>¿Es de un cliente que ya tenés?</b> <span style={{ color: color.mut2 }}>Este número todavía no está en ningún cliente.</span></div>
      <Field label="¿Quién es?"><Input value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="Ej. Rodrigo, gerente" /></Field>
      {error && <Notice tone="danger">{error}</Notice>}
      {!nuevo ? (<>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o CUIT del cliente" aria-label="Buscar el cliente" />
        {vista && !vista.length && !error && <div style={{ fontSize: font.xs, color: color.mut2 }}>No hay clientes con «{q.trim()}».</div>}
        {vista?.map((c) => (
          <Button key={c.id} size="sm" variant="outline" disabled={ocupado} onClick={() => elegir(c)}>
            {c.nombre}{c.doc ? ` · ${c.doc}` : ''}
          </Button>
        ))}
        <div><Button size="sm" variant="ghost" disabled={!escribir} title={escribir ? undefined : 'Los clientes nuevos se cargan desde acá el día que BDI pasa a Areben Gestión. Hasta entonces, en Gestión Nube.'} onClick={() => setNuevo(true)}>Es nuevo</Button></div>
      </>) : (<>
        <Field label="Nombre del cliente (la empresa)"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Celulares Rosario" /></Field>
        <Field label="CUIT o DNI (opcional)" hint="Si no lo tenés ahora, se completa al facturar."><Input value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" placeholder="30-71850818-1" /></Field>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="outline" onClick={() => setNuevo(false)}>Cancelar</Button>
          <Button size="sm" variant="solid" tone="brand" disabled={!nombre.trim() || ocupado} onClick={crear}>Crear cliente</Button>
        </div>
      </>)}
    </div>
  )
}

type Agregado = { k: string; product_id: number; size_id: number; nombre: string; talle: string | null; precio: number; stock: number }

/**
 * El buscador de «Agregar producto»: el catálogo de la marca del pedido por nombre, SKU o código, cada variante con su stock
 * y el precio mayorista. Un producto SIN precio mayorista se ve pero ⛔ se agrega (el motor contestaría «sin precio»).
 */
function BuscarProducto({ pedidoId, onElegir, onCerrar }: { pedidoId: string; onElegir: (p: ProductoParaPedido, v: ProductoParaPedido['variantes'][number]) => void; onCerrar: () => void }) {
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<ProductoParaPedido[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) return
    let vivo = true
    const espera = setTimeout(() => {
      buscarProductosPedido(pedidoId, t)
        .then((r) => { if (vivo) { setLista(r.prendido ? r.productos : []); setError(null) } })
        .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo buscar.') })
    }, 300)
    return () => { vivo = false; clearTimeout(espera) }
  }, [pedidoId, q])
  // Con menos de 2 letras ⛔ se muestra la lista vieja.
  const vista = q.trim().length < 2 ? null : lista
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${color.line}`, borderRadius: radius.md, padding: space[2] }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, SKU o código" aria-label="Buscar el producto" style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={onCerrar}>Cancelar</Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {vista && !vista.length && !error && <div style={{ fontSize: font.xs, color: color.mut2 }}>No hay productos con «{q.trim()}».</div>}
      {vista?.map((p) => (
        <div key={p.product_id} style={{ fontSize: font.sm }}>
          <b>{p.nombre}</b> <span style={{ fontSize: font.xs, color: p.precio == null ? color.dangerInk : color.mut2 }}>{p.precio == null ? '· sin precio mayorista: no se puede agregar' : `· ${plata(p.precio)} c/u`}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
            {p.variantes.map((v) => (
              <Button key={v.size_id} size="sm" variant="outline" disabled={p.precio == null} onClick={() => onElegir(p, v)}
                title={v.en_pedido ? 'Ya está en el pedido: suma uno' : undefined}>
                {v.talle ?? 'Única'} · stock {v.stock}{v.en_pedido ? ' · ya está' : ''}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const MOTIVO: Record<string, string> = { cambio: 'cambió el pedido', anulado: 'lo anuló', a_preparar: 'lo envió a preparar', edicion: 'Gestión Nube lo editó', borrado: 'Gestión Nube lo borró' }

/**
 * «Retenidos» (antes «Preparados sin pagar»; solapa Pedidos, Darío 15-nov): los pedidos listos de clientes SIN cuenta corriente
 * que deben, con cuánto deben y hace cuánto están listos — para salir a buscar esos pagos. Tocar el pedido abre su hoja;
 * «💬 Cobrar» copia el mensaje. Vacío ⇒ ⛔ se dibuja. `onCuantos` le pasa a la solapa cuántos son y cuánta plata.
 */
export function mensajeCobrar(p: Pick<PreparadoSinPagar, 'numero' | 'debe'>): string {
  return `Hola! Tu pedido ${codigoPedido(p.numero)} ya esta listo. Para despacharlo falta el pago de ${plata(p.debe)}`
}

export function PreparadosSinPagar({ onCuantos }: { onCuantos?: (n: number, plata: number) => void } = {}) {
  const prendido = useCuentaPrendida()
  const [lista, setLista] = useState<PreparadoSinPagar[]>([])
  const [hoja, setHoja] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [copiado, setCopiado] = useState<string | null>(null)
  useEffect(() => {
    if (!prendido) return
    let vivo = true
    leerPreparadosSinPagar().then((r) => { if (vivo) setLista(r.prendido ? r.pedidos : []) }).catch(() => { if (vivo) setLista([]) })
    return () => { vivo = false }
  }, [prendido, vuelta])
  useEffect(() => { onCuantos?.(lista.length, lista.reduce((a, p) => a + p.debe, 0)) }, [lista, onCuantos])
  if (!lista.length) return null
  const cobrar = async (p: PreparadoSinPagar) => {
    const ok = await copiarAlPortapapeles(mensajeCobrar(p))
    setCopiado(ok ? p.id : null)
    if (ok) setTimeout(() => setCopiado(null), 1400)
  }
  return (
    <Bloque titulo="Retenidos" tono="rojo" detalle={`${lista.length} · ${plata(lista.reduce((a, p) => a + p.debe, 0))}`}>
      {lista.map((p) => (
        <Renglon key={p.id} nombre={p.cliente} onTocar={() => setHoja(p.id)} tituloTocar="Ver el pedido"
          detalle={<>{codigoPedido(p.numero)} · {plata(p.debe)} · <Cuando iso={p.preparado_en} /></>}
          botones={<BotonPaso onClick={() => cobrar(p)} title="Copiar el mensaje para cobrarle">{copiado === p.id ? '✓ Copiado' : '💬 Cobrar'}</BotonPaso>} />
      ))}
      {hoja && <HojaPedido pedidoId={hoja} onCerrar={() => setHoja(null)} onHecho={() => setVuelta((v) => v + 1)} />}
    </Bloque>
  )
}

/**
 * «Sin cliente» (solapa Pedidos, primer paso de «Nuevos», Darío 15-nov): los pedidos que entraron a la ficha general «Pedido
 * mayorista» porque el número ⛔ era de un solo cliente. ⛔ Van a preparación hasta elegir su cliente. «Elegir cliente» lo hace
 * desde acá, SIN chat (Bruno 15-nov: el número del pedido puede ⛔ tener chat): elegir o crear la ficha le anota el número —sus
 * próximos pedidos entran solos— y le pasa el pedido. Tocar el pedido abre su hoja. Textos (Darío 15-nov): sin pie, ⛔ aviso al
 * terminar (el pedido pasa solo a su cliente y sale de acá) y ⛔ se habla de fundas «apartadas». Vacío ⇒ ⛔ se dibuja.
 */
export function PedidosSinCliente({ onCuantos }: { onCuantos?: (n: number, plata: number) => void } = {}) {
  const prendido = useCuentaPrendida()
  const [lista, setLista] = useState<PedidoSinCliente[]>([])
  const [abierto, setAbierto] = useState<string | null>(null)
  const [hoja, setHoja] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    if (!prendido) return
    let vivo = true
    leerPedidosSinCliente().then((r) => { if (vivo) setLista(r.prendido ? r.pedidos : []) }).catch(() => { if (vivo) setLista([]) })
    return () => { vivo = false }
  }, [prendido, vuelta])
  useEffect(() => { onCuantos?.(lista.length, lista.reduce((a, p) => a + p.total, 0)) }, [lista, onCuantos])
  return (
    <Paso titulo="Sin cliente" tono="rojo" cuantos={lista.length}>
      {lista.map((p) => (
        <div key={p.id}>
          <Renglon nombre={<>{p.nombre ?? 'Sin nombre'}{p.telefono ? <span style={{ fontWeight: 400, color: color.mut }}> · {p.telefono}</span> : null}</>}
            onTocar={() => setHoja(p.id)} tituloTocar={`Ver el pedido ${codigoPedido(p.numero)}`}
            detalle={<>{codigoPedido(p.numero)} · {plata(p.total)} · {p.unidades} u · <Cuando iso={p.recibido_en} /></>}
            botones={p.telefono && abierto !== p.id ? <BotonPaso solido onClick={() => setAbierto(p.id)}>Elegir cliente</BotonPaso> : undefined} />
          {p.telefono && abierto === p.id && (<div style={{ padding: `0 ${space[3]}px ${space[2]}px` }}>
            <ElegirCliente tel={p.telefono} persona={p.nombre} escribir decir={() => {}}
              onCambio={() => { setAbierto(null); setVuelta((v) => v + 1) }}
              onElegido={async (c) => { await entrarPedidoPanel({ pedidoId: p.id, clienteId: c.id }); return '' }} />
            <Button size="sm" variant="ghost" onClick={() => setAbierto(null)}>Cancelar</Button>
          </div>)}
        </div>
      ))}
      {hoja && <HojaPedido pedidoId={hoja} onCerrar={() => setHoja(null)} onHecho={() => setVuelta((v) => v + 1)} />}
    </Paso>
  )
}
