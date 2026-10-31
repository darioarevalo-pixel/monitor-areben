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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Modal, Notice } from '@/components/ui'
import { color, font, radius, space } from '@/components/ui/tokens'
import {
  anularPedidoPanel, buscarProductosPedido, cambiarPedidoPanel, entrarPedidoPanel, leerPedidoPanel, leerPedidosPanel, leerPreparadosSinPagar, mandarAPrepararPanel,
  type EtapaPedido, type PreparadoSinPagar, type ProductoParaPedido, type FichaPedido, type PagoPedido, type PedidosPanel,
} from '@/lib/erp/cliente'
import { useCuentaPrendida } from './CuentaCorriente'

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
  useEffect(() => {
    if (!prendido || (!clienteId && !tel)) return
    let vivo = true
    leerPedidosPanel({ clienteId, tel })
      .then((r) => { if (vivo) setPedidos(r.prendido ? r : null) })
      .catch(() => { if (vivo) setPedidos(null) })
    return () => { vivo = false; setPedidos(null) }
  }, [prendido, clienteId, tel, vuelta])
  const releer = useCallback(() => setVuelta((v) => v + 1), [])
  return { pedidos, releer }
}

const APAGADO = 'Los pedidos se manejan desde acá el día que BDI pasa al ERP. Hasta entonces, en Gestión Nube.'

/**
 * La tarjeta «Pedidos»: los entrados al ERP (el más nuevo primero) y los que llegaron con el número del chat y todavía no
 * entraron. Tocar uno abre la hoja.
 */
export function TarjetaPedidos({ pedidos, clienteId, personaId, decir, onCambio }: {
  pedidos: Extract<PedidosPanel, { prendido: true }>; clienteId: string | null; personaId: string | null
  decir: (txt: string, mal?: boolean) => void; onCambio: () => void
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [entrando, setEntrando] = useState<string | null>(null)
  if (!pedidos.pedidos.length && !pedidos.sinEntrar.length) return null
  const entrar = async (pedidoId: string) => {
    if (!clienteId) return
    setEntrando(pedidoId)
    try {
      await entrarPedidoPanel({ pedidoId, clienteId, personaId })
      decir('Pedido entrado: el stock queda reservado.')
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
      {pedidos.sinEntrar.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: font.sm, padding: '4px 0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>Pedido {p.numero}</b> <span style={{ color: color.mut2 }}>· {diaMes(p.recibido_en)} · {p.unidades} u · {plata(p.total)}</span>
            <div style={{ fontSize: font.xs, color: color.mut2 }}>Llegó con este número{p.nombre ? ` · «${p.nombre}»` : ''} · sin entrar</div>
          </div>
          <Button size="sm" variant="outline" disabled={!pedidos.escribir || !clienteId || entrando === p.id} title={pedidos.escribir ? undefined : APAGADO} onClick={() => void entrar(p.id)}>
            {entrando === p.id ? 'Entrando…' : 'Entrar'}
          </Button>
        </div>
      ))}
      {pedidos.pedidos.map((p) => (
        <button key={p.id} type="button" onClick={() => setAbierto(p.id)}
          style={{ display: 'flex', width: '100%', height: 'auto', alignItems: 'center', gap: 8, textAlign: 'left', background: 'none', border: 0, borderTop: `1px solid ${color.line2}`, padding: '6px 0', cursor: 'pointer', fontSize: font.sm, color: 'inherit' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>Pedido {p.numero}</b> <span style={{ color: color.mut2 }}>· {diaMes(p.recibido_en)}{p.persona ? ` · pidió ${p.persona}` : ''}</span>
            <div style={{ fontSize: font.xs, color: color.mut2 }}>{ETAPA[p.etapa]} · {p.unidades} u · {plata(p.total)}</div>
          </div>
          {p.pago && p.etapa !== 'anulado' && <b style={{ fontSize: font.xs, color: tonoPago(p.pago), whiteSpace: 'nowrap' }}>{textoPago(p.pago)}</b>}
        </button>
      ))}
      {!pedidos.escribir && <div style={{ fontSize: 11, color: color.mut2, marginTop: 6 }}>{APAGADO}</div>}
      {abierto && <HojaPedido pedidoId={abierto} onCerrar={() => setAbierto(null)} onHecho={(t) => { decir(t); onCambio() }} />}
    </section>
  )
}

/**
 * La hoja del pedido (Darío §2): los productos con el stock real al lado, cambiar cantidades (0 = se saca), agregar productos
 * (buscador del catálogo, precio de la lista mayorista), quién cambió qué, «Enviar a preparar» y anular. ⛔ se toca cuando el depósito ya empezó a escanear.
 */
export function HojaPedido({ pedidoId, onCerrar, onHecho }: { pedidoId: string; onCerrar: () => void; onHecho: (txt: string) => void }) {
  const [ficha, setFicha] = useState<FichaPedido | null>(null)
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
  return (
    <Modal abierto onCerrar={onCerrar} titulo={p ? `Pedido ${p.numero}` : 'Pedido'}
      pie={ficha && (<>
        <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        {cambiado
          ? <Button variant="solid" tone="brand" disabled={!puede || ocupado}
              onClick={() => void hacer(() => cambiarPedidoPanel(pedidoId, [
                ...ficha.lineas.filter((l) => l.size_id != null).map((l) => ({ productId: l.product_id, sizeId: l.size_id as number, cantidad: cantidades[`${l.product_id}:${l.size_id}`] ?? l.cantidad })),
                ...agregados.map((a) => ({ productId: a.product_id, sizeId: a.size_id, cantidad: cantidades[a.k] ?? 0 })).filter((a) => a.cantidad > 0),
              ]), 'Cambio guardado.')}>Guardar</Button>
          : p?.etapa === 'pedido' && <Button variant="solid" tone="brand" disabled={!ficha.escribir || ocupado} onClick={() => void hacer(() => mandarAPrepararPanel(pedidoId), 'Enviado a preparar.')}>Enviar a preparar</Button>}
      </>)}>
      {error && <Notice tone="danger">{error}</Notice>}
      {!ficha && !error && <div style={{ fontSize: font.sm, color: color.mut2 }}>Cargando…</div>}
      {ficha && p && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <div style={{ fontSize: font.sm }}>
            {ETAPA[p.etapa]}{p.persona ? ` · pidió ${p.persona.nombre ?? p.persona.whatsapp}` : ''}
            {p.pago && <> · <b style={{ color: tonoPago(p.pago) }}>{textoPago(p.pago)}</b></>}
            {p.zona === 'pendiente_pago' && p.etapa !== 'anulado' && <div style={{ fontSize: font.xs, color: color.mut2 }}>Sin pagar y sin cuenta corriente: al terminar de prepararlo va a «Pendiente de pago».</div>}
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.sm, borderTop: `1px solid ${color.line2}`, paddingTop: 6 }}>
            <span>Total{cambiado ? ' (se recalcula al guardar)' : ''}</span><b>{plata(p.total)}</b>
          </div>
          {ficha.cambios.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={ROTULO}>Cambios</div>
              {ficha.cambios.map((c, i) => (
                <div key={i} style={{ fontSize: font.xs, color: color.mut2 }}>{diaMes(c.cuando)} · {MOTIVO[c.motivo] ?? c.motivo}{c.usuario ? ` · ${c.usuario}` : ''}</div>
              ))}
            </div>
          )}
          {puede && (anulando ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Field label="¿Por qué se anula?"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="El cliente no lo quiere" /></Field>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button size="sm" variant="outline" onClick={() => setAnulando(false)}>Cancelar</Button>
                <Button size="sm" variant="solid" tone="danger" disabled={!motivo.trim() || ocupado} onClick={() => void hacer(() => anularPedidoPanel(pedidoId, motivo.trim()), 'Pedido anulado: el stock vuelve y lo pagado queda a favor.')}>Anular el pedido</Button>
              </div>
            </div>
          ) : <Button size="sm" variant="ghost" tone="danger" onClick={() => setAnulando(true)}>Anular el pedido</Button>)}
        </div>
      )}
    </Modal>
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
 * «Preparados sin pagar» (Hoy del panel, Darío §3): los pedidos listos de clientes SIN cuenta corriente que deben, con cuánto
 * deben y hace cuánto están listos — para salir a buscar esos pagos. Vacío ⇒ ⛔ se dibuja. Se llena cuando Logística avise
 * que un pedido quedó preparado (con Ger).
 */
export function PreparadosSinPagar() {
  const prendido = useCuentaPrendida()
  const [lista, setLista] = useState<Array<PreparadoSinPagar & { dias: number }>>([])
  useEffect(() => {
    if (!prendido) return
    let vivo = true
    leerPreparadosSinPagar().then((r) => {
      const ahora = Date.now()
      if (vivo) setLista(r.prendido ? r.pedidos.map((p) => ({ ...p, dias: Math.max(0, Math.floor((ahora - new Date(p.preparado_en).getTime()) / 86_400_000)) })) : [])
    }).catch(() => { if (vivo) setLista([]) })
    return () => { vivo = false }
  }, [prendido])
  if (!lista.length) return null
  return (
    <section style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: `${space[2]}px ${space[3]}px`, margin: `${space[2]}px ${space[2]}px 0` }}>
      <div style={{ ...ROTULO, marginBottom: 6 }}>Preparados sin pagar</div>
      {lista.map((p) => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: font.sm, padding: '3px 0' }}>
          <div style={{ minWidth: 0 }}><b>{p.cliente}</b> <span style={{ color: color.mut2 }}>· pedido {p.numero} · listo hace {p.dias} días</span></div>
          <b style={{ color: color.dangerInk, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{plata(p.debe)}</b>
        </div>
      ))}
    </section>
  )
}
