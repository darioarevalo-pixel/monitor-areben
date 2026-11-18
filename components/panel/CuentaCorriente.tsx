'use client'

/**
 * La cuenta corriente adentro del panel de WhatsApp (plan «BDI directo al ERP», Bruno 30-oct; maqueta aprobada:
 * https://claude.ai/artifact/APXuDdjqPV4o1PkXmDn5iY). Darío trabaja todo el día en el panel ⇒ el saldo del cliente del chat,
 * sus compras con saldo, los últimos pagos y «$ Cargar pago» van acá, ⛔ en ERP › Clientes.
 *
 * 🔑 ESCONDIDO detrás de `PANEL_CUENTA_CORRIENTE` (lo contesta el servidor, `cuentaDelPanel` de `api/_erp-clientes.js`):
 * apagado ⇒ ⛔ se dibuja nada y el panel queda igual a hoy. Se pregunta UNA vez por sesión; recién prendido se lee la cuenta
 * de cada chat. Si el servidor rebota (sin permiso de cuentas corrientes) también queda apagado, callado.
 *
 * 🔴 El libro lo decide el SERVIDOR (`libroDePruebaDelPanel`): hasta el corte de BDI es el de PRUEBA (las ventas en paralelo con
 * Gestión Nube; un pago cargado acá ⛔ baja en Gestión Nube) y desde el corte, el REAL. La pantalla pide prueba y carga el pago con el
 * `prueba` que le contestaron.
 *
 * Cargar el pago es el mismo «Cobrar a la cuenta» de ERP › Clientes (`cobrarCuentaErp`): el motor paga primero la compra
 * más vieja; la vista previa (`repartirPago`) sólo lo dibuja antes de confirmar.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Field, Input, Modal, Notice, Select } from '@/components/ui'
import { color, font, radius, space } from '@/components/ui/tokens'
import { CampoCuentaReal } from '@/components/erp/ventas/CampoCuentaReal'
import { pideCuentaReal } from '@/lib/erp/cobro-destino.core.js'
import { useChequeDelCobro } from '@/components/erp/ventas/CamposCheque'
import { anotarWhatsappPanel, cobrarCuentaErp, leerBcraPanel, leerCuentaPanel, leerCuentasCorrientes, sacarWhatsappPanel, type BcraDelPanel, type CuentaDelMotor, type CuentaPanel } from '@/lib/erp/cliente'
import { mensajeDeSaldo, repartirPago } from '@/lib/erp/cuenta-panel.core.js'
import { ResumenBcra } from './Bcra'
import { ConsultaCuit } from './ConsultaCuit'
import { FacturasCliente } from './FacturasCliente'
import { Pliegue } from './Pliegue'
import { paraEditar, parsearMonto } from '@/lib/compromisos/plata.core.js'
import { diaArgentino } from '@/lib/envios/portal.core.js'

/** Hasta el corte de BDI la cuenta corriente del ERP es la de PRUEBA (las ventas en paralelo con Gestión Nube). */
const LIBRO_DE_PRUEBA = true

const plata = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const diaMes = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

export type CuentaConCliente = Extract<CuentaPanel, { hoy: string }>

/** ¿Está prendido para este usuario? Una sola pregunta por sesión (null = todavía no se sabe). */
let prendidoCache: Promise<boolean> | null = null
function preguntarPrendido(): Promise<boolean> {
  prendidoCache ??= leerCuentaPanel({ prueba: LIBRO_DE_PRUEBA }).then((r) => r.prendido).catch(() => false)
  return prendidoCache
}

/** Si el interruptor está prendido para este usuario (la solapa Pagos lo usa para mostrar «Cuentas»). */
export function useCuentaPrendida(): boolean {
  const [prendido, setPrendido] = useState(false)
  useEffect(() => {
    let vivo = true
    void preguntarPrendido().then((p) => { if (vivo) setPrendido(p) })
    return () => { vivo = false }
  }, [])
  return prendido
}

/**
 * La cuenta del cliente del chat: por su id de Gestión Nube y, si ⛔ tiene, por el teléfono. `null` = apagado, sin cliente
 * en el ERP o todavía cargando: ⛔ se dibuja nada.
 */
export function useCuentaPanel(gnId: number | null, tel: string | null): { cuenta: CuentaConCliente | null; releer: () => void } {
  const prendido = useCuentaPrendida()
  const [cuenta, setCuenta] = useState<CuentaConCliente | null>(null)
  const [vuelta, setVuelta] = useState(0)
  // Lo que se ve queda mientras se vuelve a pedir para el MISMO número (llegó el id de GN, o «releer»): ⛔ parpadea ni
  // se vacía. Otro número ⇒ se borra en el acto, para no ver la cuenta del chat anterior.
  const telVisto = useRef(tel)
  useEffect(() => {
    if (telVisto.current !== tel) { telVisto.current = tel; setCuenta(null) }
    if (!prendido || (!gnId && !tel)) return
    let vivo = true
    leerCuentaPanel({ gnId, tel, prueba: LIBRO_DE_PRUEBA })
      .then((r) => { if (vivo) setCuenta('hoy' in r ? r : null) })
      .catch(() => {})
    return () => { vivo = false }
  }, [prendido, gnId, tel, vuelta])
  const releer = useCallback(() => setVuelta((v) => v + 1), [])
  return { cuenta, releer }
}

/**
 * Al enganchar un número nuevo a un cliente del CRM («Ya es cliente mío»), anotarlo también en «Quién compra» del ERP
 * (Darío 16-nov): así los pedidos que haga ese número entran solos a ese cliente, sin cargarlo dos veces.
 * Devuelve el texto para el aviso, o null si no hubo nada que hacer (panel apagado, cliente sin ERP o ya anotado).
 * ⛔ Nunca tira: el enganche del CRM ya quedó hecho y no se deshace por esto.
 */
export async function anotarEnQuienCompra(gnId: number, tel: string, nombre?: string): Promise<string | null> {
  try {
    if (!gnId || !tel || !(await preguntarPrendido())) return null
    const r = await leerCuentaPanel({ gnId, tel, prueba: LIBRO_DE_PRUEBA })
    if (!('hoy' in r) || r.delChat) return null
    await anotarWhatsappPanel({ clienteId: r.cliente.id, whatsapp: tel, nombre: nombre?.trim() || undefined })
    return `También quedó en «Quién compra» de ${r.cliente.nombre}: sus pedidos entran solos.`
  } catch {
    return 'Quedó en la ficha, pero no se pudo sumar a «Quién compra». Agregalo desde «Más del cliente».'
  }
}

/**
 * ¿Este número desconocido ya está en «Quién compra» de algún cliente del ERP? (Darío 16-nov: cargó a Lore en Joel y el
 * panel igual decía «Número nuevo»). Devuelve el nombre del cliente, para ofrecerlo; null si no está o no se sabe.
 */
export function useClienteQueCompraConEsteNumero(tel: string): string | null {
  const prendido = useCuentaPrendida()
  const [res, setRes] = useState<{ tel: string; nombre: string | null } | null>(null)
  useEffect(() => {
    if (!prendido || !tel) return
    let vivo = true
    leerCuentaPanel({ tel, prueba: LIBRO_DE_PRUEBA })
      .then((r) => { if (vivo) setRes({ tel, nombre: 'hoy' in r && r.delChat ? r.cliente.nombre : null }) })
      .catch(() => { if (vivo) setRes({ tel, nombre: null }) })
    return () => { vivo = false }
  }, [prendido, tel])
  return res && res.tel === tel ? res.nombre : null
}

/** «Sin crédito» · «Con crédito · hasta $X · N días» (Darío 15-nov; el crédito se marca en ERP › Clientes). */
export function textoCredito(c: CuentaConCliente['credito']): string {
  if (!c?.credito) return 'Sin crédito'
  return ['Con crédito', c.tope != null ? `hasta ${plata(c.tope)}` : null, c.dias ? `${c.dias} días` : null].filter(Boolean).join(' · ')
}

/**
 * El saldo en UNA línea, abajo de los números (Pedidos · Total · Último), con el crédito al lado (Darío 15-nov: «Saldo» en vez de
 * «Cuenta corriente»). «$ Cargar pago» va acá sin un pedido abierto que deba, o si debe MÁS que esos pedidos (saldo viejo); si no, el pago va en el pedido
 * (cada botón una sola vez) ⇒ `onCargar = null`.
 */
export function FranjaCuenta({ cuenta, onCargar }: { cuenta: CuentaConCliente; onCargar: (() => void) | null }) {
  const { saldo } = cuenta.estado
  const conCredito = !!cuenta.credito?.credito
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: 8 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', fontSize: font.sm, color: color.mut }}>
        <span>Saldo{cuenta.prueba ? ' (prueba)' : ''} · <b style={{ color: saldo > 0 ? color.dangerInk : color.successInk, fontVariantNumeric: 'tabular-nums' }}>{saldo > 0 ? `debe ${plata(saldo)}` : saldo < 0 ? `${plata(-saldo)} a favor` : 'al día'}</b></span>
        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '1px 8px', border: `1px solid ${conCredito ? color.brand : color.line}`, color: conCredito ? color.brand : color.mut2, whiteSpace: 'nowrap' }}>{textoCredito(cuenta.credito)}</span>
      </div>
      {onCargar && <Button size="sm" variant="solid" tone="brand" onClick={onCargar}>$ Cargar pago</Button>}
    </div>
  )
}

const ROTULO = { fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase' } as const

/** El mensaje de «💬 Enviar saldo» / «💬 Pedir pago» de esta cuenta (`null` = no debe ni tiene a favor). */
export function mensajeDeLaCuenta(cuenta: CuentaConCliente): string | null {
  const pendientes = [...cuenta.estado.pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))
  return mensajeDeSaldo({ nombre: cuenta.cliente.nombre, saldo: cuenta.estado.saldo, pendientes }, plata)
}

/**
 * La tarjeta de la cuenta (Darío 15-nov): SÓLO cuando debe —al día no hay más bloques—, con las compras que deben (la más
 * vieja primero) y los últimos pagos. «Enviar saldo» pasó a «Lo que sigue»; BCRA, Facturas y Quién compra, a «Más del cliente».
 */
export function TarjetaCuenta({ cuenta, sinRefs }: { cuenta: CuentaConCliente; /** Las deudas de pedidos abiertos: se ven en el pedido. */ sinRefs?: Set<string> }) {
  const pendientes = [...cuenta.estado.pendientes].filter((p) => !sinRefs?.has(p.ref)).sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (!pendientes.length) return null
  return (
    <section style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: `${space[2]}px ${space[3]}px ${space[3]}px`, margin: `0 ${space[2]}px ${space[2]}px` }}>
      <div style={{ ...ROTULO, marginBottom: 6 }}>Cuenta corriente</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pendientes.map((p) => (
          <div key={p.ref} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: font.sm }}>
            <div style={{ minWidth: 0 }}>
              <b>{p.nombre || 'Compra'}</b> <span style={{ color: color.mut2 }}>· {diaMes(p.fecha)} · hace {p.dias} días</span>
              <div style={{ fontSize: font.xs, color: color.mut2 }}>total {plata(p.monto)}{p.monto > p.pendiente ? ` · pagó ${plata(p.monto - p.pendiente)}` : ''}</div>
            </div>
            <b style={{ color: color.dangerInk, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{plata(p.pendiente)}</b>
          </div>
        ))}
      </div>
      {cuenta.pagos.length > 0 && (
        <div style={{ borderTop: `1px solid ${color.line2}`, marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={ROTULO}>Últimos pagos</div>
          {cuenta.pagos.map((p, i) => (
            <div key={`${p.fecha}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.sm }}>
              <span>{diaMes(p.fecha)}{p.detalle ? ` · ${p.detalle}` : ''}</span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{plata(p.monto)}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * «Más del cliente» (Darío 15-nov): Quién compra, Facturas y Situación crediticia plegados, con la cantidad. Quién compra se abre
 * solo si escribe un número que ⛔ está anotado (para anotarlo ahí mismo).
 */
export function MasDelCliente({ cuenta, telChat, decir, onCambio }: {
  cuenta: CuentaConCliente; telChat: string | null; decir: (txt: string, mal?: boolean) => void; onCambio: () => void
}) {
  const sinAnotar = !!telChat && !!cuenta.personas && !cuenta.delChat
  const [abierto, setAbierto] = useState<'quien' | 'facturas' | 'bcra' | null>(sinAnotar ? 'quien' : null)
  const tocar = (k: 'quien' | 'facturas' | 'bcra') => setAbierto((a) => (a === k ? null : k))
  const n = cuenta.personas?.length ?? 0
  return (
    <section style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: `${space[2]}px ${space[3]}px 2px`, margin: `0 ${space[2]}px ${space[2]}px` }}>
      <div style={{ ...ROTULO, marginBottom: 4 }}>Más del cliente</div>
      {cuenta.personas && (
        <Pliegue titulo="Quién compra" cantidad={n ? `${n} ${n === 1 ? 'número' : 'números'}` : 'ninguno anotado'} abierto={abierto === 'quien'} onTocar={() => tocar('quien')}>
          <QuienCompra cuenta={cuenta} telChat={telChat} decir={decir} onCambio={onCambio} />
        </Pliegue>
      )}
      <FacturasCliente key={`f-${cuenta.cliente.id}`} clienteId={cuenta.cliente.id} decir={decir} plegado={{ abierto: abierto === 'facturas', onTocar: () => tocar('facturas') }} />
      <Pliegue titulo="Situación crediticia (BCRA)" cantidad="consultar" abierto={abierto === 'bcra'} onTocar={() => tocar('bcra')}>
        <SituacionBcra key={cuenta.cliente.id} clienteId={cuenta.cliente.id} />
      </Pliegue>
    </section>
  )
}

/**
 * La situación crediticia del cliente en el BCRA (Central de Deudores, pública; Bruno 31-oct). Se consulta al ABRIR, ⛔ sola:
 * son tres llamadas a afuera por chat. Cambiar de cliente la vuelve a cero (`key`). El CUIT lo lee el servidor de la ficha; con DNI o sin documento lo dice.
 */
function SituacionBcra({ clienteId }: { clienteId: string }) {
  const [r, setR] = useState<BcraDelPanel | 'cargando' | null>(null)
  const [error, setError] = useState('')
  const [otro, setOtro] = useState(false)
  async function consultar() {
    setR('cargando'); setError('')
    try { setR(await leerBcraPanel(clienteId)) } catch (e) { setR(null); setError(e instanceof Error ? e.message : 'No se pudo consultar el BCRA.') }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="sm" variant="ghost" style={{ height: 'auto' }} onClick={() => setOtro(true)}>Consultar un CUIT</Button>
      </div>
      {r === null
        ? <Button size="sm" variant="outline" onClick={consultar} style={{ height: 'auto', alignSelf: 'flex-start' }}>Ver situación en el BCRA</Button>
        : <ResumenBcra r={r} />}
      {error && <div style={{ fontSize: font.sm, color: color.dangerInk }}>{error}</div>}
      {otro && <ConsultaCuit onCerrar={() => setOtro(false)} />}
    </div>
  )
}

/**
 * Quién compra por esta empresa (pedido de Darío §1: habla el dueño, los encargados…). Un número anotado entra solo a este
 * cliente la próxima vez; si el del chat ⛔ está, se ofrece anotarlo con quién es. Sacar a alguien ⛔ borra su historial.
 */
function QuienCompra({ cuenta, telChat, decir, onCambio }: {
  cuenta: CuentaConCliente; telChat: string | null; decir: (txt: string, mal?: boolean) => void; onCambio: () => void
}) {
  const [quien, setQuien] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const personas = cuenta.personas ?? []
  const fin = (w: string) => `…${w.slice(-4)}`
  async function correr(f: () => Promise<string>) {
    setTrabajando(true)
    try { decir(await f()); onCambio() } catch (e) { decir(e instanceof Error ? e.message : 'No se pudo.', true) } finally { setTrabajando(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {personas.length ? personas.map((p) => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: font.sm, gap: 8 }}>
          <span>{p.nombre || 'Sin nombre'} <span style={{ color: color.mut2 }}>· {fin(p.whatsapp)}{cuenta.delChat?.id === p.id ? ' · este chat' : ''}</span></span>
          <button
            type="button" disabled={trabajando}
            onClick={() => void correr(async () => { await sacarWhatsappPanel(p.id); return `${p.nombre || 'Ese número'} ya no compra por ${cuenta.cliente.nombre}.` })}
            style={{ height: 'auto', padding: 0, border: 0, background: 'none', font: 'inherit', fontSize: font.xs, color: color.mut, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Sacar
          </button>
        </div>
      )) : <div style={{ fontSize: font.sm, color: color.mut2 }}>Todavía no hay números anotados.</div>}
      {telChat && !cuenta.delChat && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <Input value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="¿Quién es? (ej. Rodrigo, gerente)" style={{ flex: 1, minWidth: 0 }} />
          <Button
            size="sm" variant="outline" disabled={trabajando}
            onClick={() => void correr(async () => {
              await anotarWhatsappPanel({ clienteId: cuenta.cliente.id, whatsapp: telChat, nombre: quien.trim() || undefined })
              setQuien('')
              return `Listo: este número entra solo a ${cuenta.cliente.nombre}.`
            })}
          >
            Agregar este número
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * La hoja de «Cargar pago»: cuánto pagó, a qué cuenta entró, la fecha y el número de operación; antes de confirmar se ve qué
 * compra cancela y cómo queda el saldo. Una clave por hoja abierta: reintentar el MISMO pago ⛔ lo duplica (el motor
 * deduplica por la clave). Desde un PEDIDO (Darío §4: «le sumo otro pago al mismo pedido») el pago va primero a ese pedido
 * y lo que sobra, a lo más viejo (regla del 18-oct). Número de operación ya usado ⇒ avisa y se puede «Cargar igual».
 */
export function HojaCargarPago({ cuenta, pedido = null, onCerrar, onHecho }: {
  cuenta: CuentaConCliente; pedido?: { ventaId: string; numero: number; falta: number } | null
  onCerrar: () => void; onHecho: (aviso: string) => void
}) {
  const saldo = cuenta.estado.saldo
  const pendientes = cuenta.estado.pendientes
  const vieja = [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
  const refPedido = pedido ? `venta:${pedido.ventaId}` : null
  const [monto, setMonto] = useState(() => (pedido && pedido.falta > 0 ? paraEditar(pedido.falta) : ''))
  const [operacion, setOperacion] = useState('')
  const [repetida, setRepetida] = useState<string | null>(null)
  const [entro, setEntro] = useState(cuenta.cuentas.length === 1 ? String(cuenta.cuentas[0].id) : '')
  const [cuentaReal, setCuentaReal] = useState('')
  const [hoyDia] = useState(() => diaArgentino(Date.now()))
  const [fecha, setFecha] = useState(hoyDia)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [ref] = useState(() => crypto.randomUUID())
  const n = parsearMonto(monto)
  const { partes, aFavor } = repartirPago(pendientes, n ?? 0, refPedido)
  const nombre = (r: string) => (r === refPedido && pedido ? `Pedido ${pedido.numero}` : pendientes.find((p) => p.ref === r)?.nombre || 'Compra')
  const delPedido = refPedido ? pendientes.find((p) => p.ref === refPedido)?.pendiente ?? 0 : 0
  const despues = saldo - (n ?? 0)
  const chq = useChequeDelCobro('bdi', cuenta.cuentas, entro)
  const pide = pideCuentaReal({ cuenta: chq.cuentas.find((c) => String(c.id) === entro), rutas: cuenta.rutas, cuentasReales: cuenta.cuentasReales, marca: 'bdi', canal: 'mayorista', fecha })
  const faltaReal = pide && !cuentaReal

  async function confirmar(igual = false) {
    if (n == null || n <= 0) return setError('Poné cuánto pagó.')
    if (!entro) return setError('Elegí a qué cuenta entró.')
    if (faltaReal) return setError('Elegí a qué cuenta entró la plata.')
    if (chq.falta) return setError(chq.falta)
    setTrabajando(true)
    setError(null)
    try {
      const r = await cobrarCuentaErp('bdi', {
        clienteId: cuenta.cliente.id, linea: 'bdi', monto: n, cuenta: entro, ...(pide ? { cuentaReal } : {}), fecha, ref, prueba: cuenta.prueba,
        ...(operacion.trim() ? { operacion: operacion.trim(), ...(igual ? { operacionRepetida: true } : {}) } : {}),
        ...(pedido && delPedido > 0 ? { imputar: [{ ventaId: pedido.ventaId, monto: Math.min(n, delPedido) }] } : {}),
        ...chq.extra,
      })
      setRepetida(null)
      onHecho(r.yaExistia ? 'Ese pago ya estaba cargado.' : `Pago de ${plata(n)} cargado. ${despues > 0 ? `Ahora debe ${plata(despues)}.` : despues < 0 ? `Le quedan ${plata(-despues)} a favor.` : 'Quedó al día.'}`)
    } catch (e) {
      const txt = e instanceof Error ? e.message : 'No se pudo cargar el pago.'
      if (txt.includes('(OPERACION_REPETIDA)')) setRepetida(txt.replace(/\s*\(OPERACION_REPETIDA\)\s*$/, ''))
      else setError(txt)
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      abierto onCerrar={onCerrar} titulo={pedido ? `Cargar pago · pedido ${pedido.numero}` : 'Cargar pago'}
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        {repetida
          ? <Button tone="warning" disabled={trabajando} onClick={() => void confirmar(true)}>Cargar igual</Button>
          : <Button tone="success" disabled={trabajando || n == null || n <= 0 || !entro || faltaReal || !!chq.falta} onClick={() => void confirmar()}>Confirmar pago</Button>}
      </>}
    >
      <p style={{ marginTop: 0, color: color.mut }}>{cuenta.cliente.nombre} · {saldo > 0 ? `debe ${plata(saldo)}` : saldo < 0 ? `${plata(-saldo)} a favor` : 'al día'}{cuenta.prueba ? ' · de prueba' : ''}</p>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {repetida && <Notice tone="warning">{repetida}. Fijate que no sea el mismo comprobante; si es otro pago, «Cargar igual».</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="Cuánto pagó">
          <Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$ 0" autoFocus />
        </Field>
        {(vieja || saldo > 0) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: -6 }}>
            {pedido && delPedido > 0 && <Button size="sm" variant="outline" onClick={() => setMonto(paraEditar(delPedido))}>Lo que falta del pedido · {plata(delPedido)}</Button>}
            {!pedido && vieja && <Button size="sm" variant="outline" onClick={() => setMonto(paraEditar(vieja.pendiente))}>La más vieja · {plata(vieja.pendiente)}</Button>}
            {saldo > 0 && <Button size="sm" variant="outline" onClick={() => setMonto(paraEditar(saldo))}>Todo · {plata(saldo)}</Button>}
          </div>
        )}
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Entró a" style={{ flex: '1 1 180px' }}>
            <Select value={entro} onChange={(e) => setEntro(e.target.value)}>
              <option value="">{chq.cuentas.length ? 'Elegí la cuenta' : 'No hay cuentas para cobrar'}</option>
              {chq.cuentas.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={fecha} max={hoyDia} onChange={(e) => setFecha(e.target.value)} /></Field>
        </div>
        {pide && <CampoCuentaReal cuentas={cuenta.cuentasReales ?? []} valor={cuentaReal} onCambio={setCuentaReal} />}
        {chq.campos}
        <Field label="N° de operación (opcional)">
          <Input value={operacion} onChange={(e) => { setOperacion(e.target.value); setRepetida(null) }} placeholder="El del comprobante" />
        </Field>
        <div style={{ padding: '10px 12px', borderRadius: 9, background: color.bg, border: `1px solid ${color.line}`, display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.sm }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Saldo hoy</span><b>{plata(saldo)}</b></div>
          {n != null && n > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Pago</span><b style={{ color: color.successInk }}>− {plata(n)}</b></div>
              <ul style={{ margin: '2px 0', paddingLeft: 18 }}>
                {partes.map((p) => <li key={p.ref}>{nombre(p.ref)} ({diaMes(p.fecha)}): {plata(p.paga)} · {p.queda > 0 ? `le quedan ${plata(p.queda)}` : <b>queda pagada</b>}</li>)}
                {aFavor > 0 && <li>{plata(aFavor)} quedan <b>a favor</b></li>}
              </ul>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${color.line2}`, paddingTop: 4 }}>
                <span>Saldo después</span><b style={{ color: despues > 0 ? color.dangerInk : color.successInk }}>{despues > 0 ? plata(despues) : despues < 0 ? `${plata(-despues)} a favor` : 'al día'}</b>
              </div>
            </>
          ) : <div style={{ color: color.mut2 }}>Poné el monto y ves cómo queda.</div>}
        </div>
      </div>
    </Modal>
  )
}

/**
 * Pagos › Cuentas: los que deben a BDI, de la deuda más vieja a la más nueva. Tocar el nombre abre su ficha (su chat si
 * tiene WhatsApp); «$ Cargar pago» abre la hoja ahí mismo.
 */
export function ListaCuentas({ onIrAlCliente }: { onIrAlCliente: ((c: { cliente_id: string | null; cliente_telefono: string | null }) => void) | null }) {
  const [filas, setFilas] = useState<CuentaDelMotor[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoja, setHoja] = useState<CuentaConCliente | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    let vivo = true
    leerCuentasCorrientes('bdi', 'bdi', LIBRO_DE_PRUEBA, { panel: true })
      .then((r) => { if (vivo) setFilas(r.cuentas.filter((c) => c.saldo > 0).sort((a, b) => b.dias_mayor - a.dias_mayor)) })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer la cuenta corriente.') })
    return () => { vivo = false }
  }, [vuelta])

  async function abrirHoja(c: CuentaDelMotor) {
    try {
      const r = await leerCuentaPanel({ gnId: Number(c.gn_client_id) || null, tel: c.gn_client_id ? null : c.whatsapp ?? null, prueba: LIBRO_DE_PRUEBA })
      if ('hoy' in r) setHoja(r)
      else setError('No se encontró la cuenta de ese cliente.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la cuenta.')
    }
  }

  if (error) return <div style={{ padding: `0 ${space[3]}px` }}><Notice tone="danger" onClose={() => setError(null)}>{error}</Notice></div>
  if (!filas) return <div style={{ padding: space[3], fontSize: font.sm, color: color.mut2 }}>Cargando las cuentas…</div>
  const total = filas.reduce((s, c) => s + c.saldo, 0)
  const vencidas = filas.filter((c) => c.dias_mayor > 30).length
  return (
    <div>
      {aviso && <div style={{ padding: `0 ${space[3]}px`, marginBottom: space[2] }}><Notice tone="success" onClose={() => setAviso(null)}>{aviso}</Notice></div>}
      <div style={{ display: 'flex', gap: space[2], padding: `0 ${space[3]}px`, marginBottom: space[3] }}>
        {([[plata(total), 'Le deben a BDI'], [String(vencidas), 'Más de 30 días'], [String(filas.length), 'Cuentas']] as const).map(([v, t]) => (
          <div key={t} style={{ flex: 1, minWidth: 0, background: color.bg2, border: `1px solid ${color.line}`, borderRadius: radius.md, padding: '6px 8px' }}>
            <div style={{ fontSize: font.lg, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
            <div style={{ fontSize: font.xs, color: color.mut2 }}>{t}</div>
          </div>
        ))}
      </div>
      {filas.length ? filas.map((c) => (
        <div key={c.cliente_id} style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[2]}px ${space[3]}px`, borderTop: `1px solid ${color.line2}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{plata(c.saldo)}</b>{' '}
            <button
              type="button"
              disabled={!onIrAlCliente || (!c.gn_client_id && !c.whatsapp)}
              onClick={() => onIrAlCliente?.({ cliente_id: c.gn_client_id ?? null, cliente_telefono: c.whatsapp ?? null })}
              style={{ height: 'auto', padding: 0, border: 0, background: 'none', font: 'inherit', fontWeight: 600, color: color.brand, cursor: 'pointer', textAlign: 'left' }}
            >
              {c.nombre}
            </button>
            <div style={{ fontSize: font.xs, color: color.mut2 }}>la más vieja hace {c.dias_mayor} días</div>
          </div>
          <Button size="sm" variant="solid" tone="brand" onClick={() => void abrirHoja(c)}>$ Cargar pago</Button>
        </div>
      )) : <div style={{ padding: space[3], fontSize: font.sm, color: color.mut2 }}>Nadie debe nada.</div>}
      {hoja && (
        <HojaCargarPago
          cuenta={hoja}
          onCerrar={() => setHoja(null)}
          onHecho={(t) => { setHoja(null); setAviso(t); setVuelta((v) => v + 1) }}
        />
      )}
    </div>
  )
}
