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

import { HuecoLogistica } from '@/components/panel/huecos-logistica'
import { useCallback, useEffect, useRef, useState } from 'react'
import { adelantarPedidoPanel, tomarPedidoPanel } from '@/lib/erp/pedido-adelantado'
import { enviarMedicion, marca } from '@/lib/medir'
import { Badge, Button, CopyButton, Field, Input, Modal, Notice } from '@/components/ui'
import { color, font, radius, space } from '@/components/ui/tokens'
import {
  anotarWhatsappPanel, anularPedidoPanel, ponerEnvioPedidoPanel, buscarClientesPanel, buscarProductosPedido, cambiarPedidoPanel, clienteNuevoPanel, entrarPedidoPanel, leerPedidoPanel, leerPedidosPanel, leerPedidosSinCliente, leerPreparadosSinPagar, mandarAPrepararPanel,
  type ClienteDelPanel, type EtapaPedido, type PedidoDelCliente, type PedidoSinCliente, type PreparadoSinPagar, type ProductoParaPedido, type FichaPedido, type PagoPedido, type PedidosPanel, type PackTienda, type TipoPrecio,
} from '@/lib/erp/cliente'
import { HojaCargarPago, mensajeDeLaCuenta, useCuentaPrendida, type CuentaConCliente } from './CuentaCorriente'
import { mensajeTotal } from './CalculadoraEnvio'
import { escribirMonto, parsearMonto } from '@/lib/compromisos/core'
import { FacturarParte, FacturarPedido, LETRA, descargarFactura, numeroComprobante } from './FacturasCliente'
import { codigoPedido } from '@/lib/erp/codigos.core.js'
import { redondear as redondearTotal } from '@/motor/venta/redondeo.mjs'
import { cuentaDelPedido } from '@/lib/erp/precio-tienda.core.js'
import { esAprobador } from '@/lib/reposicion/armado.core.js'
import { usePerfilOpcional } from '@/components/SesionProvider'
import { copiarAlPortapapeles } from '@/lib/portapapeles'
import { Bloque, BotonLink, BotonPaso, Cuando, Paso, Renglon } from './pasos-pedido'
import { linksDePedidos, type LinkPedido } from '@/lib/crm/pedidos-catalogo'
import { Pliegue } from './Pliegue'

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
export function usePedidosPanel(clienteId: string | null, tel: string | null): {
  pedidos: Extract<PedidosPanel, { prendido: true }> | null; releer: () => void
  /** Ya llegaron los pedidos de ESTE cliente (⛔ los de antes de saber quién es): hasta entonces la cuenta ⛔ muestra sus compras sueltas. */
  listos: boolean
} {
  const prendido = useCuentaPrendida()
  const [pedidos, setPedidos] = useState<Extract<PedidosPanel, { prendido: true }> | null>(null)
  const [para, setPara] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  // Igual que la cuenta: con el mismo número, lo visto queda hasta que llega lo nuevo (⛔ se vacía al llegar el id del cliente).
  const telVisto = useRef(tel)
  useEffect(() => {
    if (telVisto.current !== tel) { telVisto.current = tel; setPedidos(null) }
    if (!prendido || (!clienteId && !tel)) return
    let vivo = true
    leerPedidosPanel({ clienteId, tel })
      .then((r) => { if (vivo) { setPedidos(r.prendido ? r : null); setPara(clienteId) } })
      .catch(() => { if (vivo) setPara(clienteId) })
    return () => { vivo = false }
  }, [prendido, clienteId, tel, vuelta])
  const releer = useCallback(() => setVuelta((v) => v + 1), [])
  return { pedidos, releer, listos: !prendido || (!!clienteId && para === clienteId) }
}

const APAGADO = 'Los pedidos se manejan desde acá el día que BDI pasa a Areben Gestión. Hasta entonces, en Gestión Nube.'

/**
 * La tarjeta «Pedidos»: los entrados al ERP (el más nuevo primero) y los que llegaron con el número del chat y todavía no
 * entraron. Tocar uno abre la hoja.
 */
export function TarjetaPedidos({ pedidos, clienteId, personaId, tel, cuenta = null, decir, onCambio }: {
  pedidos: Extract<PedidosPanel, { prendido: true }>; clienteId: string | null; personaId: string | null; tel: string | null
  /** La cuenta del cliente: con ella la hoja del pedido deja «Cargar pago» (Darío §4). */
  cuenta?: CuentaConCliente | null
  decir: (txt: string, mal?: boolean) => void; onCambio: () => void
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [entrando, setEntrando] = useState<string | null>(null)
  const [pagando, setPagando] = useState<{ ventaId: string; numero: number; falta: number } | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  // Sólo lo que pide algo (Darío 17-nov: «es molesto»): ⛔ los vendidos por GN ni los ya pagos y enviados a preparar —eso
  // ya lo dice «Última compra»—. Queda lo que falta entrar, pagar o enviar a preparación.
  const conAlgo = pedidos.pedidos.filter((p) => p.etapa !== 'anulado' && ((!!p.pago && p.pago.falta > 0) || (p.etapa === 'pedido' && pedidos.escribir)))
  // 🧾 Los ya pagos, plegados (Darío 25-nov: «no me permite ver sus últimos pedidos para facturarle», caso Camila #118): tocar
  // uno abre su hoja, que tiene «Facturar».
  const anteriores = pedidos.pedidos.filter((p) => p.etapa !== 'anulado' && !conAlgo.includes(p))
  const [verAnteriores, setVerAnteriores] = useState(false)
  const [cuantosAnteriores, setCuantosAnteriores] = useState(10)
  // ⚡ Los pedidos sin terminar se traen ya: al tocarlo, la hoja abre al instante (Darío 18-nov: tardaba 3 s).
  const abiertos = conAlgo.slice(0, 3).map((p) => p.id).join(',')
  useEffect(() => {
    for (const id of abiertos ? abiertos.split(',') : []) adelantarPedidoPanel(id)
  }, [abiertos])
  // 🔗 El link que recibió la clienta al confirmar en la tienda (Darío 24-nov), para volver a pasárselo. Sólo los que salieron
  // de la tienda lo tienen (y dura 90 días); si no hay, el botón ⛔ aparece.
  const numeros = conAlgo.map((p) => String(p.numero ?? '')).filter(Boolean).sort().join(',')
  const [links, setLinks] = useState<Record<string, LinkPedido>>({})
  useEffect(() => {
    if (!numeros) return
    let vivo = true
    linksDePedidos(numeros.split(',')).then((l) => vivo && setLinks(l))
    return () => { vivo = false }
  }, [numeros])
  if (!conAlgo.length && !pedidos.sinEntrar.length && !anteriores.length) return null
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
      {conAlgo.map((p) => {
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
              {links[String(p.numero)] && <BotonLink l={{ link: links[String(p.numero)].link, total: p.total }} />}
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
            {p.etapa !== 'anulado' && <HuecoLogistica codigo={codigoPedido(p.numero)} />}
          </div>
        )
      })}
      {anteriores.length > 0 && (
        <Pliegue titulo="Anteriores" cantidad={String(anteriores.length)} abierto={verAnteriores} onTocar={() => setVerAnteriores((v) => !v)}>
          {anteriores.slice(0, cuantosAnteriores).map((p) => (
            <button key={p.id} type="button" onClick={() => setAbierto(p.id)} title={`Ver el pedido ${codigoPedido(p.numero)}`}
              style={{ display: 'block', width: '100%', height: 'auto', textAlign: 'left', background: 'none', border: 0, padding: '4px 0', cursor: 'pointer', fontSize: font.sm, color: 'inherit' }}>
              <b>Pedido {codigoPedido(p.numero)}</b> <span style={{ color: color.mut2 }}>· {diaMes(p.recibido_en)} · {p.unidades} u · {plata(p.total)}</span>
            </button>
          ))}
          {anteriores.length > cuantosAnteriores && (
            <Button size="sm" variant="ghost" onClick={() => setCuantosAnteriores((n) => n + 10)}>Ver más</Button>
          )}
        </Pliegue>
      )}
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
const TRANSPORTES = ['Andreani'] // Correo Argentino fuera: hoy no se usa (Darío 25-nov)

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
        {hay && <Button size="sm" variant="ghost" tone="danger" onClick={() => { setAbierto(false); void guardar(null, null) }}>Sacar</Button>}
        <Button size="sm" variant="solid" tone="brand" disabled={!valido || n <= 0} onClick={() => { setAbierto(false); void guardar(n, trans) }}>Guardar</Button>
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
  /** Precio a mano sobre un renglón que YA estaba en el pedido (Darío 25-nov, M-124: antes se perdía sin avisar). */
  const [aManoYa, setAManoYa] = useState<Record<string, number>>({})
  /** Packs por diseño (Darío 18-nov): cuántos lleva cada uno (los del pedido y los agregados) y su armado. */
  const [packs, setPacks] = useState<Record<string, number>>({})
  const [packInfo, setPackInfo] = useState<Record<string, InfoPack>>({})
  const [buscando, setBuscando] = useState(false)
  const [verProductos, setVerProductos] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [anulando, setAnulando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [vuelta, setVuelta] = useState(0)
  const mostrar = (r: FichaPedido) => {
    setFicha(r)
    setCantidades(Object.fromEntries(r.lineas.map((l) => [`${l.product_id}:${l.size_id}`, l.cantidad])))
    setAgregados([])
    setAManoYa({})
    const enPack = Object.entries(r.tienda?.packs ?? {}).filter(([, x]) => x.enPedido > 0)
    setPacks(Object.fromEntries(enPack.map(([id, x]) => [id, x.enPedido])))
    setPackInfo(Object.fromEntries(enPack.map(([id, x]) => [id, { pack: x, inicial: x.enPedido, nombre: r.lineas.find((l) => String(l.product_id) === id)?.nombre ?? `Producto ${id}` }])))
  }
  useEffect(() => {
    let vivo = true
    // La primera vez, la que la ficha ya trajo (`adelantarPedidoPanel`); después de un cambio, siempre al servidor.
    const t0 = marca()
    ;(vuelta === 0 ? tomarPedidoPanel(pedidoId) : leerPedidoPanel(pedidoId))
      .then((r) => {
        if (!vivo) return
        if (vuelta === 0) enviarMedicion('hoja-pedido', t0, {}, `hoja-${pedidoId}-${t0}`)
        if (!r.prendido) { setError('La cuenta corriente del panel está apagada.'); return }
        mostrar(r)
      })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el pedido.') })
    return () => { vivo = false }
  }, [pedidoId, vuelta])

  /** Los diseños que van en pack en el pedido: sus renglones ⛔ se tocan uno por uno, se cambian por packs. */
  const enPackOriginal = new Set(Object.entries(ficha?.tienda?.packs ?? {}).filter(([, x]) => x.enPedido > 0).map(([id]) => id))
  const packsCambiados = Object.keys({ ...packs, ...Object.fromEntries([...enPackOriginal].map((id) => [id, 0])) })
    .some((id) => (packs[id] ?? 0) !== (ficha?.tienda?.packs?.[id]?.enPedido ?? 0))
  const cambiado = (!!ficha && (ficha.lineas.some((l) => !enPackOriginal.has(String(l.product_id)) && cantidades[`${l.product_id}:${l.size_id}`] !== l.cantidad)
    || agregados.some((a) => (cantidades[a.k] ?? 0) > 0)
    || ficha.lineas.some((l) => { const m = aManoYa[`${l.product_id}:${l.size_id}`]; return m != null && m !== (l.base ?? l.precio) }))) || packsCambiados
  /**
   * La cuenta en el momento, como en la tienda (Darío 18-nov): subtotal, el descuento por monto que aparece o se va, el
   * redondeo mayorista y el envío. Sin las reglas de la tienda, renglones × precio como antes.
   */
  const cuentaTienda = (() => {
    if (!ficha) return null
    const sueltos = [
      ...ficha.lineas.filter((l) => !enPackOriginal.has(String(l.product_id)))
        .map((l) => { const m = aManoYa[`${l.product_id}:${l.size_id}`]; return { base: m ?? l.base ?? l.precio, tipo: m != null ? 'fijo' : l.tipo ?? 'fijo', promo: l.promo ?? null, cantidad: cantidades[`${l.product_id}:${l.size_id}`] ?? l.cantidad } }),
      ...agregados.map((a) => ({ base: a.precio, tipo: a.tipo, promo: a.promo, cantidad: cantidades[a.k] ?? 0 })),
      ...Object.entries(packs).map(([id, n]) => ({ base: packInfo[id]?.pack.precio ?? 0, tipo: 'pack', cantidad: n * (packInfo[id]?.pack.fundas ?? 0) })),
    ].filter((r) => r.cantidad > 0)
    if (!ficha.tienda) {
      const sub = sueltos.reduce((a, r) => a + r.base * r.cantidad, 0)
      return { subtotal: sub, total: sub, descuento: 0, pct: 0, conPromo: false, proximo: null as null | { pct: number; falta: number } }
    }
    return cuentaDelPedido({ escala: ficha.tienda.escala, promos: ficha.tienda.promos ?? [] }, sueltos)
  })()
  const envioDelPedido = ficha?.pedido.envio != null && ficha.pedido.envio > 0 ? ficha.pedido.envio : 0
  const totalAhora = !ficha || !cuentaTienda ? 0 : !cambiado ? ficha.pedido.total : redondearTotal(cuentaTienda.total, ficha.redondeo ?? null) + envioDelPedido
  /** Lo elegido en el buscador, de una (Darío 18-nov: filas con cantidad): si ya está en el pedido suma; si no, renglón nuevo. Los packs, por diseño. */
  const agregar = ({ sueltas: elegidos, packs: nuevosPacks }: { sueltas: Elegido[]; packs: Array<{ prod: ProductoParaPedido; n: number }> }) => {
    const nuevos: Agregado[] = []
    for (const { prod, v, precio } of elegidos) {
      const k = `${prod.product_id}:${v.size_id}`
      const ya = ficha?.lineas.some((l) => `${l.product_id}:${l.size_id}` === k) || agregados.some((a) => a.k === k) || nuevos.some((a) => a.k === k)
      const deTienda = v.precio ?? prod.precio
      const final = precio ?? deTienda
      // Precio a mano sobre lo que YA está: lo toma ese renglón (⛔ se pierde en silencio).
      if (ya && precio != null) {
        if (ficha?.lineas.some((l) => `${l.product_id}:${l.size_id}` === k)) setAManoYa((m) => ({ ...m, [k]: precio }))
        else setAgregados((as) => as.map((a) => (a.k === k ? { ...a, precio, tipo: 'fijo', aMano: true } : a)))
        const nuevo = nuevos.find((a) => a.k === k)
        if (nuevo) Object.assign(nuevo, { precio, tipo: 'fijo', aMano: true })
      }
      if (!ya && final != null) nuevos.push({ k, product_id: prod.product_id, size_id: v.size_id, nombre: prod.nombre, talle: v.talle, precio: final, tipo: precio != null ? 'fijo' : (v.tipo ?? 'lista'), promo: prod.promo ?? null, aMano: precio != null, stock: v.stock })
    }
    setAgregados((as) => [...as, ...nuevos])
    setCantidades((c) => {
      const out = { ...c }
      for (const { prod, v, cantidad } of elegidos) {
        const k = `${prod.product_id}:${v.size_id}`
        out[k] = (out[k] ?? ficha?.lineas.find((l) => `${l.product_id}:${l.size_id}` === k)?.cantidad ?? 0) + cantidad
      }
      return out
    })
    if (nuevosPacks.length) {
      setPacks((m) => { const o = { ...m }; for (const { prod, n } of nuevosPacks) o[String(prod.product_id)] = (o[String(prod.product_id)] ?? 0) + n; return o })
      setPackInfo((m) => { const o = { ...m }; for (const { prod } of nuevosPacks) if (prod.pack) o[String(prod.product_id)] = { pack: prod.pack, nombre: prod.nombre, inicial: o[String(prod.product_id)]?.inicial ?? 0 }; return o })
    }
    setBuscando(false)
  }
  const hacer = async (fn: () => Promise<{ avisarDeposito?: boolean; sinCambios?: boolean; ficha?: FichaPedido; avisos?: string[] }>, ok: string, que = 'guardar') => {
    setOcupado(true)
    setError(null)
    const t0 = marca()
    try {
      const r = await fn()
      // La hoja nueva viene en la respuesta (cambio y envío): se muestra ya, sin volver a pedirla (Darío 18-nov, ~5 s).
      if (r.ficha?.prendido) mostrar(r.ficha)
      else setVuelta((v) => v + 1)
      enviarMedicion(`hoja-${que}`, t0, { conHoja: !!r.ficha }, `hoja-${que}-${t0}`)
      const extra = [r.avisarDeposito ? 'Al depósito le aparece el aviso de que el pedido cambió.' : '', ...((r as { avisos?: string[] }).avisos ?? [])].filter(Boolean).join(' ')
      onHecho(extra ? `${ok} ${extra}` : ok)
      setAnulando(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
      if (que === 'envio') setVuelta((v) => v + 1) // el total adelantado vuelve a lo guardado
    } finally {
      setOcupado(false)
    }
  }

  const p = ficha?.pedido
  /** Los productos plegados (Darío 25-nov: arriba los montos); las unidades, con lo cambiado sin guardar. */
  const unidadesAhora = !ficha ? 0 : [...ficha.lineas.filter((l) => !enPackOriginal.has(String(l.product_id))).map((l) => cantidades[`${l.product_id}:${l.size_id}`] ?? l.cantidad),
    ...agregados.map((x) => cantidades[x.k] ?? 0)].reduce((x, n) => x + n, 0) + Object.entries(packs).reduce((x, [id, n]) => x + n * (packInfo[id]?.pack.fundas ?? 0), 0)
  const puede = !!ficha?.escribir && !!p?.editable
  /** Anular: sólo Darío y Bruno, al final de la hoja y con motivo (Darío 15-nov). El servidor frena igual. */
  const perfil = usePerfilOpcional()
  const puedeAnular = puede && esAprobador(perfil)
  return (
    <Modal abierto onCerrar={onCerrar} titulo={p ? `Pedido ${codigoPedido(p.numero)}` : 'Pedido'}
      pie={ficha && (<>
        <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        {puede && <Button variant="solid" tone="brand" disabled={!cambiado || ocupado}
              onClick={() => void hacer(() => cambiarPedidoPanel(pedidoId, [
                ...ficha.lineas.filter((l) => l.size_id != null && !enPackOriginal.has(String(l.product_id))).map((l) => { const k = `${l.product_id}:${l.size_id}`; return { productId: l.product_id, sizeId: l.size_id as number, cantidad: cantidades[k] ?? l.cantidad, ...(aManoYa[k] != null ? { precio: aManoYa[k] } : {}) } }),
                ...agregados.map((a) => ({ productId: a.product_id, sizeId: a.size_id, cantidad: cantidades[a.k] ?? 0, ...(a.aMano ? { precio: a.precio } : {}) })).filter((a) => a.cantidad > 0),
              ], Object.entries({ ...Object.fromEntries([...enPackOriginal].map((id) => [id, 0])), ...packs }).map(([id, n]) => ({ productId: Number(id), packs: n }))), 'Cambio guardado.')}>Guardar</Button>}
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
          {p.etapa !== 'anulado' && (
            <EnvioDelPedido envio={p.envio ?? null} transporte={p.transporte ?? null}
              sinFactura={!!ficha.facturacion?.entera && ficha.facturacion.entera.total < p.total}
              cambiar={ficha.escribir && !cambiado && !ocupado && !(ficha.facturacion?.entera || (ficha.facturacion?.partes ?? 0) > 0)}
              guardar={(envio, transporte) => {
                // El total cambia YA (Darío 18-nov: tardaba ~9 s); el guardado sigue atrás y la hoja que vuelve lo confirma.
                setFicha((f) => f && { ...f, pedido: { ...f.pedido, envio: envio || null, transporte: envio ? transporte : null, total: f.pedido.total - envioDelPedido + (envio || 0) } })
                return hacer(() => ponerEnvioPedidoPanel(pedidoId, envio, transporte), envio ? 'Envío guardado.' : 'Envío sacado.', 'envio')
              }} />
          )}
          {cuentaTienda && cuentaTienda.descuento > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: font.sm, borderTop: `1px solid ${color.line2}`, paddingTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Productos</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{plata(cuentaTienda.subtotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: color.successInk, fontWeight: 600 }}><span>Descuento{cuentaTienda.pct && !cuentaTienda.conPromo ? ` ${cuentaTienda.pct}%` : ''}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>−{plata(cuentaTienda.descuento)}</span></div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: font.sm, borderTop: `1px solid ${color.line2}`, paddingTop: 6 }}>
            <span>Total{cambiado ? ' (sin guardar)' : ''}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!cambiado && p.envio != null && p.envio > 0 && p.etapa !== 'anulado' && <CopyButton getText={() => mensajeTotal(p.total)} label="Total" copiedLabel="✓ Copiado" iconLeft="💬" />}
              <b>{plata(totalAhora)}</b>
            </span>
          </div>
          {/* El total guardado ⛔ coincide con la cuenta de la tienda (ej. un cambio viejo le sacó una promo, #121 18-nov): se rehace con los mismos renglones. */}
          {puede && !cambiado && ficha.tienda && cuentaTienda && Math.abs(redondearTotal(cuentaTienda.total, ficha.redondeo ?? null) + envioDelPedido - p.total) > 1 && (
            <Notice tone="warning">
              Con los precios de la tienda el total es {plata(redondearTotal(cuentaTienda.total, ficha.redondeo ?? null) + envioDelPedido)}.{' '}
              <Button size="sm" variant="outline" disabled={ocupado} onClick={() => void hacer(() => cambiarPedidoPanel(pedidoId,
                ficha.lineas.filter((l) => l.size_id != null && !enPackOriginal.has(String(l.product_id))).map((l) => ({ productId: l.product_id, sizeId: l.size_id as number, cantidad: l.cantidad })),
                [...enPackOriginal].map((id) => ({ productId: Number(id), packs: packs[id] ?? 0 }))), 'Precios actualizados.')}>Actualizar precios</Button>
            </Notice>
          )}
          {cuentaTienda?.proximo && p.etapa !== 'anulado' && (
            <div style={{ fontSize: font.xs, color: color.mut2 }}>Faltan <b style={{ color: color.ink2 }}>{plata(cuentaTienda.proximo.falta)}</b> para el {cuentaTienda.proximo.pct}%</div>
          )}
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
          <Pliegue titulo="Productos" cantidad={`${unidadesAhora} u`} abierto={verProductos} onTocar={() => setVerProductos((v) => !v)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              <RenglonesPorDiseno
                renglones={[...ficha.lineas.filter((l) => !enPackOriginal.has(String(l.product_id))).map((l) => { const m = aManoYa[`${l.product_id}:${l.size_id}`]; return m != null ? { ...l, precio: m, tipo: 'fijo' as const, nuevo: false } : { ...l, nuevo: false } }),
                  ...agregados.map((a) => ({ ...a, cantidad: 0, nuevo: true }))]}
                cantidades={cantidades} puede={puede}
                poner={(k, n) => setCantidades((c) => ({ ...c, [k]: Math.max(0, n) }))}
                packs={packs} packInfo={packInfo}
                ponerPacks={(id, n) => setPacks((m) => ({ ...m, [id]: Math.max(0, n) }))} />
              {puede && (buscando
                ? <BuscarProducto pedidoId={pedidoId} onElegir={agregar} onCerrar={() => setBuscando(false)} precioManual={!!ficha.precioManual}
                    sueltos={new Set([...ficha.lineas.filter((l) => !enPackOriginal.has(String(l.product_id))).map((l) => String(l.product_id)), ...agregados.map((a) => String(a.product_id))])}
                    enPack={new Set(Object.entries(packs).filter(([, n]) => n > 0).map(([id]) => id))} />
                : <div><Button size="sm" variant="outline" onClick={() => setBuscando(true)}>+ Agregar</Button></div>)}
            </div>
          </Pliegue>
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
      {/* La búsqueda PRIMERO (Darío 18-nov: escribía en «¿Quién es?» creyendo que buscaba, y no aparecía nadie). */}
      <div style={{ fontSize: font.sm }}><b>Buscar el cliente</b></div>
      {error && <Notice tone="danger">{error}</Notice>}
      {!nuevo ? (<>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: nombre, WhatsApp o CUIT" aria-label="Buscar el cliente" autoFocus />
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
      <Field label="Quién escribe (opcional)"><Input value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="Ej. Rodrigo, el encargado" /></Field>
    </div>
  )
}

type Agregado = { k: string; product_id: number; size_id: number; nombre: string; talle: string | null; precio: number; tipo: TipoPrecio; promo: string | null; /** Precio a mano (Darío). */ aMano: boolean; stock: number }

/** La marca del precio (Darío 18-nov): una palabra. Lo de lista ⛔ lleva. */
function MarcaPrecio({ tipo }: { tipo?: TipoPrecio }) {
  if (tipo === 'pack') return <Badge tone="brand">Pack</Badge>
  if (tipo === 'oferta') return <Badge tone="danger">Oferta</Badge>
  if (tipo === 'fijo') return <Badge tone="neutral">Especial</Badge>
  return null
}

const sinIphone = (t: string | null) => (t ?? 'Única').replace(/^iPhone\s+/i, '')
/**
 * Los modelos como en la tienda mayorista: del más nuevo al más viejo (17 Pro Max arriba, 13 abajo; Darío 18-nov). Por el
 * número del modelo; dentro del mismo número, al revés de como vienen (vienen 17 · 17 Pro · 17 Pro Max). Sin número, al final.
 */
export function nuevosPrimero<T>(lista: T[], talle: (x: T) => string | null): T[] {
  const gen = (x: T) => { const m = (talle(x) ?? '').match(/\d+/); return m ? Number(m[0]) : -1 }
  return lista.map((x, i) => ({ x, i, g: gen(x) }))
    .sort((a, b) => (a.g < 0) !== (b.g < 0) ? (a.g < 0 ? 1 : -1) : b.g - a.g || (a.g < 0 ? a.i - b.i : b.i - a.i))
    .map((e) => e.x)
}

/** Un pack del pedido: su armado y cuántos tenía al abrir la hoja (ya descontados de la tienda). */
type InfoPack = { pack: PackTienda; nombre: string; inicial: number }

type RenglonHoja = { product_id: number; size_id: number | null; nombre: string | null; talle: string | null; precio: number; tipo?: TipoPrecio; stock: number | null; cantidad: number; nuevo: boolean }

/**
 * Los productos de la hoja AGRUPADOS por diseño (Darío 18-nov): un bloque por diseño con sus modelos de a dos por fila, cada
 * uno con − cantidad +; el diseño en pack, con «− packs +» y lo que lleva de cada modelo.
 */
function RenglonesPorDiseno({ renglones, cantidades, puede, poner, packs, packInfo, ponerPacks }: {
  renglones: RenglonHoja[]; cantidades: Record<string, number>; puede: boolean; poner: (k: string, n: number) => void
  packs: Record<string, number>; packInfo: Record<string, InfoPack>; ponerPacks: (id: string, n: number) => void
}) {
  const grupos = new Map<number, RenglonHoja[]>()
  for (const r of renglones) {
    const n = cantidades[`${r.product_id}:${r.size_id}`] ?? r.cantidad
    if (r.nuevo && n <= 0) continue
    grupos.set(r.product_id, [...(grupos.get(r.product_id) ?? []), r])
  }
  const caja = { border: `1px solid ${color.line}`, borderRadius: radius.md, overflow: 'hidden' } as const
  const cabeza = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: color.bg, fontSize: font.sm } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[...grupos.entries()].map(([pid, rs]) => {
        const u = rs.reduce((a, r) => a + (cantidades[`${r.product_id}:${r.size_id}`] ?? r.cantidad), 0)
        const precios = [...new Set(rs.map((r) => r.precio))]
        const tipos = [...new Set(rs.map((r) => r.tipo))]
        return (
          <div key={pid} style={caja}>
            <div style={cabeza}>
              <b style={{ flex: 1, minWidth: 0 }}>{rs[0].nombre ?? `Producto ${pid}`}</b>
              {tipos.length === 1 && <MarcaPrecio tipo={tipos[0]} />}
              <span style={{ fontSize: font.xs, color: color.mut2, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{u} u · {precios.length === 1 ? `${plata(precios[0])} c/u` : `desde ${plata(Math.min(...precios))}`}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {rs.map((r) => {
                const k = `${r.product_id}:${r.size_id}`
                const n = cantidades[k] ?? r.cantidad
                const nombre = `${r.nombre ?? ''} ${r.talle ?? ''}`.trim()
                return (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderTop: `1px solid ${color.line}`, fontSize: font.sm }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {sinIphone(r.talle)}{tipos.length > 1 && <> <MarcaPrecio tipo={r.tipo} /></>}{r.nuevo && <span style={{ fontSize: font.xs, color: color.brand }}> · nuevo</span>}
                      <div style={{ fontSize: font.xs, color: r.stock != null && r.stock < 0 ? color.dangerInk : color.mut2 }}>stock {r.stock ?? '—'}{precios.length > 1 ? ` · ${plata(r.precio)}` : ''}</div>
                    </div>
                    {puede && r.size_id != null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Button size="sm" variant="outline" aria-label={`Uno menos de ${nombre}`} disabled={n <= 0} onClick={() => poner(k, n - 1)}>−</Button>
                        <b style={{ minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{n}</b>
                        <Button size="sm" variant="outline" aria-label={`Uno más de ${nombre}`} onClick={() => poner(k, n + 1)}>+</Button>
                      </div>
                    ) : <b style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</b>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {Object.entries(packs).filter(([id]) => packInfo[id]).map(([id, n]) => {
        const { pack, nombre, inicial } = packInfo[id]
        // Los que ya tenía el pedido ya se descontaron de la tienda: el tope es esos + los que quedan.
        const tope = pack.quedan == null ? Infinity : inicial + pack.quedan
        return (
          <div key={`pack-${id}`} style={caja}>
            <div style={cabeza}>
              <b style={{ flex: 1, minWidth: 0 }}>{nombre}</b>
              <MarcaPrecio tipo="pack" />
              <span style={{ fontSize: font.xs, color: color.mut2, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{n * pack.fundas} u · {plata(pack.precio)} c/u</span>
              {puede ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Button size="sm" variant="outline" aria-label={`Un pack menos de ${nombre}`} disabled={n <= 0} onClick={() => ponerPacks(id, n - 1)}>−</Button>
                  <b style={{ minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{n}</b>
                  <Button size="sm" variant="outline" aria-label={`Un pack más de ${nombre}`} disabled={n >= tope} onClick={() => ponerPacks(id, n + 1)}>+</Button>
                </div>
              ) : <b>{n}</b>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', padding: '5px 10px', borderTop: `1px solid ${color.line}`, fontSize: font.xs, color: color.mut }}>
              {pack.modelos.map((m) => <span key={m.size_id}>{sinIphone(m.talle)} <b style={{ color: color.ink2 }}>×{m.cantidad * n}</b></span>)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * El buscador de «Agregar»: el catálogo de la marca del pedido por nombre, SKU o código, cada talle con su stock y el PRECIO
 * DE LA TIENDA (Darío 18-nov: pack, oferta, precio por modelo). El diseño con pack elige Pack o Suelta. Darío puede poner
 * precio a mano. Un producto SIN precio mayorista se ve pero ⛔ se agrega (el motor contestaría «sin precio»).
 */
type Elegido = { prod: ProductoParaPedido; v: ProductoParaPedido['variantes'][number]; cantidad: number; /** A mano (Darío). */ precio?: number }

function BuscarProducto({ pedidoId, onElegir, onCerrar, precioManual, sueltos, enPack }: {
  pedidoId: string; onElegir: (e: { sueltas: Elegido[]; packs: Array<{ prod: ProductoParaPedido; n: number }> }) => void; onCerrar: () => void
  precioManual: boolean; /** Diseños que ya van sueltos en el pedido (⛔ pack) y en pack (⛔ suelta). */ sueltos: Set<string>; enPack: Set<string>
}) {
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<ProductoParaPedido[] | null>(null)
  const [sinTienda, setSinTienda] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Cuántas de cada talle (Darío 18-nov: filas, para cargar varios de una). Sobrevive a otra búsqueda. */
  const [pedir, setPedir] = useState<Record<string, Elegido>>({})
  const [packsPedidos, setPacksPedidos] = useState<Record<string, { prod: ProductoParaPedido; n: number }>>({})
  const [modo, setModo] = useState<Record<string, 'pack' | 'suelta'>>({})
  const [aMano, setAMano] = useState<Record<string, string>>({})
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) return
    let vivo = true
    const espera = setTimeout(() => {
      buscarProductosPedido(pedidoId, t)
        .then((r) => { if (vivo) { setLista(r.prendido ? r.productos : []); setSinTienda(r.prendido && r.productos.length > 0 && r.tienda === false); setError(null) } })
        .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo buscar.') })
    }, 300)
    return () => { vivo = false; clearTimeout(espera) }
  }, [pedidoId, q])
  // Con menos de 2 letras ⛔ se muestra la lista vieja.
  const vista = q.trim().length < 2 ? null : lista
  const poner = (prod: ProductoParaPedido, v: ProductoParaPedido['variantes'][number], n: number) =>
    setPedir((m) => ({ ...m, [`${prod.product_id}:${v.size_id}`]: { prod, v, cantidad: Math.max(0, Math.min(9999, Math.floor(n) || 0)) } }))
  const precioDe = (pid: number) => { const n = parsearMonto(aMano[pid] ?? ''); return n != null && n > 0 ? n : undefined }
  /** Pack o suelta: lo que se puede, y si se pueden las dos, lo elegido (arranca en Pack). */
  const modoDe = (p: ProductoParaPedido): 'pack' | 'suelta' => {
    const puedePack = !!p.pack && !sueltos.has(String(p.product_id))
    const puedeSuelta = !p.soloPack && !enPack.has(String(p.product_id))
    return !puedePack ? 'suelta' : !puedeSuelta ? 'pack' : (modo[p.product_id] ?? 'pack')
  }
  const elegidos = Object.values(pedir).filter((e) => e.cantidad > 0 && modoDe(e.prod) === 'suelta')
    .map((e) => ({ ...e, precio: precioManual ? precioDe(e.prod.product_id) : undefined }))
  const packsElegidos = Object.values(packsPedidos).filter((x) => x.n > 0 && modoDe(x.prod) === 'pack')
  const unidades = elegidos.reduce((a, e) => a + e.cantidad, 0) + packsElegidos.reduce((a, x) => a + x.n * (x.prod.pack?.fundas ?? 0), 0)
  const seg = (activo: boolean) => ({ fontSize: font.xs, fontWeight: 600, padding: '2px 10px', height: 'auto', border: 0, cursor: 'pointer', background: activo ? color.brandSolid : color.surface, color: activo ? '#fff' : color.mut } as const)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${color.line}`, borderRadius: radius.md, padding: space[2] }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Diseño, modelo, SKU o código" aria-label="Buscar el producto" style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={onCerrar}>Cancelar</Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {sinTienda && <Notice tone="warning">No pude leer los precios de la tienda: probá en un minuto.</Notice>}
      {vista && !vista.length && !error && <div style={{ fontSize: font.xs, color: color.mut2 }}>No hay productos con «{q.trim()}».</div>}
      {vista?.map((p) => {
        const id = String(p.product_id)
        const pack = p.pack ?? null
        const puedePack = !!pack && !sueltos.has(id)
        const puedeSuelta = !p.soloPack && !enPack.has(id)
        const m = modoDe(p)
        const sinPrecio = p.precio == null && !p.variantes.some((v) => v.precio != null)
        const tope = pack ? Math.min(pack.quedan ?? Infinity, pack.alcanza ?? Infinity) : 0
        const nPacks = packsPedidos[id]?.n ?? 0
        const tipos = [...new Set(p.variantes.map((v) => v.tipo))]
        return (
          <div key={p.product_id} style={{ fontSize: font.sm, border: `1px solid ${color.line}`, borderRadius: radius.md, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', flexWrap: 'wrap' }}>
              <b style={{ flex: 1, minWidth: 0 }}>{p.nombre}</b>
              {m === 'suelta' && tipos.length === 1 && <MarcaPrecio tipo={tipos[0]} />}
              {pack && (puedePack && puedeSuelta) && (
                <span role="group" aria-label="Cómo se vende" style={{ display: 'inline-flex', border: `1px solid ${color.line2}`, borderRadius: 7, overflow: 'hidden' }}>
                  <button type="button" aria-pressed={m === 'pack'} style={seg(m === 'pack')} onClick={() => setModo((x) => ({ ...x, [p.product_id]: 'pack' }))}>Pack</button>
                  <button type="button" aria-pressed={m === 'suelta'} style={seg(m === 'suelta')} onClick={() => setModo((x) => ({ ...x, [p.product_id]: 'suelta' }))}>Suelta</button>
                </span>
              )}
              {pack && !puedePack && <span style={{ fontSize: font.xs, color: color.mut2 }}>ya va suelta</span>}
              {sinPrecio && <span style={{ fontSize: font.xs, color: color.dangerInk }}>sin precio mayorista</span>}
            </div>
            {m === 'pack' && pack ? (<>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', padding: '5px 9px', borderTop: `1px solid ${color.line}`, fontSize: font.xs, color: color.mut }}>
                {nuevosPrimero(pack.modelos, (x) => x.talle).map((x) => <span key={x.size_id}>{sinIphone(x.talle)} <b style={{ color: color.ink2 }}>×{x.cantidad}</b></span>)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', borderTop: `1px solid ${color.line}`, fontSize: font.xs, color: color.mut }}>
                <span style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}>{pack.fundas} fundas · {plata(pack.precio)} c/u{pack.quedan != null ? ` · quedan ${pack.quedan}` : ''}</span>
                <Button size="sm" variant="outline" aria-label="Un pack menos" disabled={nPacks <= 0} onClick={() => setPacksPedidos((x) => ({ ...x, [id]: { prod: p, n: nPacks - 1 } }))}>−</Button>
                <b style={{ minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: color.ink }}>{nPacks}</b>
                <Button size="sm" variant="outline" aria-label="Un pack más" disabled={nPacks >= tope} onClick={() => setPacksPedidos((x) => ({ ...x, [id]: { prod: p, n: nPacks + 1 } }))}>+</Button>
              </div>
            </>) : (<>
              {precioManual && !sinPrecio && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderTop: `1px solid ${color.line}`, fontSize: font.xs, color: color.mut }}>
                  <span style={{ flex: 1 }}>Precio a mano</span>
                  <Input value={aMano[p.product_id] ?? ''} inputMode="decimal" placeholder={plata(p.variantes.find((v) => v.precio != null)?.precio ?? p.precio ?? 0)} aria-label={`Precio a mano de ${p.nombre}`}
                    onChange={(e) => setAMano((x) => ({ ...x, [p.product_id]: e.target.value }))} style={{ width: 96, textAlign: 'right' }} />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
                {nuevosPrimero(p.variantes, (v) => v.talle).map((v) => {
                  const n = pedir[`${p.product_id}:${v.size_id}`]?.cantidad ?? 0
                  const nombre = v.talle ?? 'Única'
                  const precio = precioDe(p.product_id) ?? v.precio ?? p.precio
                  const no = precio == null || !puedeSuelta
                  return (
                    <div key={v.size_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderTop: `1px solid ${color.line}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {sinIphone(v.talle)}{tipos.length > 1 && <> <MarcaPrecio tipo={v.tipo} /></>}
                        <div style={{ fontSize: font.xs, color: v.stock <= 0 ? color.dangerInk : color.mut2, fontVariantNumeric: 'tabular-nums' }}>{precio != null ? plata(precio) : '—'} · stock {v.stock}{v.en_pedido ? ' · ya está' : ''}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Button size="sm" variant="outline" aria-label={`Uno menos de ${nombre}`} disabled={no || n <= 0} onClick={() => poner(p, v, n - 1)}>−</Button>
                        <Input value={n ? String(n) : ''} inputMode="numeric" placeholder="0" aria-label={`Cantidad de ${nombre}`} disabled={no}
                          onChange={(e) => poner(p, v, Number(e.target.value.replace(/\D/g, '')))} onFocus={(e) => e.target.select()}
                          style={{ width: 42, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
                        <Button size="sm" variant="outline" aria-label={`Uno más de ${nombre}`} disabled={no} onClick={() => poner(p, v, n + 1)}>+</Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>)}
          </div>
        )
      })}
      {unidades > 0 && <div><Button size="sm" variant="solid" tone="brand" onClick={() => onElegir({ sueltas: elegidos, packs: packsElegidos })}>Agregar {unidades} u.</Button></div>}
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
