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
 * 🔴 Lee el libro de PRUEBA (`LIBRO_DE_PRUEBA`): hasta el corte de BDI, la cuenta corriente del ERP es la de las ventas en
 * paralelo con Gestión Nube, y un pago cargado acá ⛔ baja en Gestión Nube.
 *
 * Cargar el pago es el mismo «Cobrar a la cuenta» de ERP › Clientes (`cobrarCuentaErp`): el motor paga primero la compra
 * más vieja; la vista previa (`repartirPago`) sólo lo dibuja antes de confirmar.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button, CopyButton, Field, Input, Modal, Notice, Select } from '@/components/ui'
import { color, font, radius, space } from '@/components/ui/tokens'
import { anotarWhatsappPanel, cobrarCuentaErp, leerBcraPanel, leerCuentaPanel, leerCuentasCorrientes, sacarWhatsappPanel, type BcraDelPanel, type CuentaDelMotor, type CuentaPanel } from '@/lib/erp/cliente'
import { mensajeDeSaldo, repartirPago, textoSaldo } from '@/lib/erp/cuenta-panel.core.js'
import { SITUACION_BCRA, mesBcra, tonoBcra } from '@/lib/erp/bcra.core.js'
import { FacturasCliente } from './FacturasCliente'
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
  useEffect(() => {
    if (!prendido || (!gnId && !tel)) return
    let vivo = true
    leerCuentaPanel({ gnId, tel, prueba: LIBRO_DE_PRUEBA })
      .then((r) => { if (vivo) setCuenta('hoy' in r ? r : null) })
      .catch(() => { if (vivo) setCuenta(null) })
    return () => { vivo = false; setCuenta(null) }
  }, [prendido, gnId, tel, vuelta])
  const releer = useCallback(() => setVuelta((v) => v + 1), [])
  return { cuenta, releer }
}

/** La franja del encabezado oscuro: el saldo y «$ Cargar pago». Va abajo de los números (Pedidos · Total · Último). */
export function FranjaCuenta({ cuenta, onCargar }: { cuenta: CuentaConCliente; onCargar: () => void }) {
  const { saldo, pendientes } = cuenta.estado
  const vieja = pendientes.reduce((m, p) => Math.max(m, p.dias), 0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: 8, padding: '7px 10px', borderRadius: radius.md, background: color.bg2, border: `1px solid ${color.line}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: color.mut2, textTransform: 'uppercase', letterSpacing: 0.3 }}>Cuenta corriente{cuenta.prueba ? ' · de prueba' : ''}</div>
        <div style={{ fontSize: font.md, fontWeight: 700, lineHeight: 1.2, color: saldo > 0 ? color.dangerInk : color.successInk, fontVariantNumeric: 'tabular-nums' }}>{textoSaldo(saldo, plata)}</div>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>{saldo > 0 ? `debe · la más vieja hace ${vieja} días` : 'no debe nada'}</div>
      </div>
      <Button size="sm" variant="solid" tone="brand" onClick={onCargar}>$ Cargar pago</Button>
    </div>
  )
}

const ROTULO = { fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase' } as const

/**
 * La tarjeta de abajo: las compras que deben (la más vieja primero), los últimos pagos, «Enviar saldo» (pedido de Darío §6)
 * y quién compra por esta empresa (§1).
 */
export function TarjetaCuenta({ cuenta, telChat, decir, onCambio }: {
  cuenta: CuentaConCliente; telChat: string | null; decir: (txt: string, mal?: boolean) => void; onCambio: () => void
}) {
  const pendientes = [...cuenta.estado.pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const mensaje = mensajeDeSaldo({ nombre: cuenta.cliente.nombre, saldo: cuenta.estado.saldo, pendientes }, plata)
  return (
    <section style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: `${space[2]}px ${space[3]}px ${space[3]}px`, margin: `0 ${space[2]}px ${space[2]}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={ROTULO}>Cuenta corriente</div>
        {mensaje && <CopyButton getText={() => mensaje} label="Enviar saldo" copiedLabel="✓ Copiado, pegalo en el chat" iconLeft="💬" />}
      </div>
      {pendientes.length ? (
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
      ) : (
        <div style={{ fontSize: font.sm, color: color.mut2 }}>No debe ninguna compra.</div>
      )}
      <div style={{ borderTop: `1px solid ${color.line2}`, marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase' }}>Últimos pagos</div>
        {cuenta.pagos.length ? cuenta.pagos.map((p, i) => (
          <div key={`${p.fecha}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.sm }}>
            <span>{diaMes(p.fecha)}{p.detalle ? ` · ${p.detalle}` : ''}</span>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{plata(p.monto)}</b>
          </div>
        )) : <div style={{ fontSize: font.sm, color: color.mut2 }}>Todavía no hay pagos.</div>}
      </div>
      <div style={{ fontSize: 11, color: color.mut2, marginTop: 6 }}>Un pago cancela primero la compra más vieja.</div>
      <SituacionBcra key={cuenta.cliente.id} clienteId={cuenta.cliente.id} />
      <FacturasCliente key={`f-${cuenta.cliente.id}`} clienteId={cuenta.cliente.id} decir={decir} />
      {cuenta.personas && <QuienCompra cuenta={cuenta} telChat={telChat} decir={decir} onCambio={onCambio} />}
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
  async function consultar() {
    setR('cargando'); setError('')
    try { setR(await leerBcraPanel(clienteId)) } catch (e) { setR(null); setError(e instanceof Error ? e.message : 'No se pudo consultar el BCRA.') }
  }
  const TONO = { verde: color.successInk, ambar: color.warningInk, rojo: color.dangerInk, neutro: color.mut2 } as const
  let cuerpo: ReactNode
  if (r === null) cuerpo = (
    <Button size="sm" variant="outline" onClick={consultar} style={{ height: 'auto', alignSelf: 'flex-start' }}>Ver situación en el BCRA</Button>
  )
  else if (r === 'cargando') cuerpo = <div style={{ fontSize: font.sm, color: color.mut2 }}>Consultando el BCRA…</div>
  else if (!r.prendido) cuerpo = null
  else if ('sinCuit' in r) cuerpo = <div style={{ fontSize: font.sm, color: color.mut2 }}>Hace falta el CUIT del cliente (con DNI el BCRA no contesta).</div>
  else if (!r.ok) cuerpo = <div style={{ fontSize: font.sm, color: color.dangerInk }}>{r.error}</div>
  else {
    const tono = TONO[tonoBcra(r)]
    const resumen = r.bancos.length
      ? `Situación ${r.peor} (${SITUACION_BCRA[r.peor as keyof typeof SITUACION_BCRA] ?? '?'}) · debe ${plata(r.deuda)} en ${r.bancos.length} ${r.bancos.length === 1 ? 'banco' : 'bancos'}`
      : 'Sin deudas en bancos'
    const cheques = r.cheques == null ? null
      : r.cheques.total === 0 ? 'sin cheques rechazados'
        : `${r.cheques.total} ${r.cheques.total === 1 ? 'cheque rechazado' : 'cheques rechazados'}${r.cheques.sinPagar ? ` · ${r.cheques.sinPagar} sin pagar (${plata(r.cheques.monto)})` : ''}`
    cuerpo = (
      <>
        <div style={{ fontSize: font.sm, color: tono, fontWeight: 700 }}>{resumen}{cheques ? ` · ${cheques}` : ''}</div>
        {r.bancos.slice(0, 4).map((b) => (
          <div key={b.entidad} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: font.xs, color: color.mut2 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.entidad}</span>
            <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>sit. {b.situacion}{b.diasAtraso ? ` · ${b.diasAtraso} días de atraso` : ''}{b.juicio ? ' · en juicio' : ''} · {plata(b.monto)}</span>
          </div>
        ))}
        {r.peor12 != null && r.peor12 > r.peor && (
          <div style={{ fontSize: font.xs, color: TONO.ambar }}>En los últimos 12 meses llegó a situación {r.peor12}.</div>
        )}
        <div style={{ fontSize: 11, color: color.mut2 }}>
          {r.denominacion ? `${r.denominacion} · ` : ''}{r.periodo ? `informado a ${mesBcra(r.periodo)}` : 'último período'} · fuente: BCRA, Central de Deudores
        </div>
      </>
    )
  }
  return (
    <div style={{ borderTop: `1px solid ${color.line2}`, marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={ROTULO}>Situación crediticia</div>
      {cuerpo}
      {error && <div style={{ fontSize: font.sm, color: color.dangerInk }}>{error}</div>}
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
    <div style={{ borderTop: `1px solid ${color.line2}`, marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={ROTULO}>Quién compra</div>
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

  async function confirmar(igual = false) {
    if (n == null || n <= 0) return setError('Poné cuánto pagó.')
    if (!entro) return setError('Elegí a qué cuenta entró.')
    setTrabajando(true)
    setError(null)
    try {
      const r = await cobrarCuentaErp('bdi', {
        clienteId: cuenta.cliente.id, linea: 'bdi', monto: n, cuenta: entro, fecha, ref, prueba: cuenta.prueba,
        ...(operacion.trim() ? { operacion: operacion.trim(), ...(igual ? { operacionRepetida: true } : {}) } : {}),
        ...(pedido && delPedido > 0 ? { imputar: [{ ventaId: pedido.ventaId, monto: Math.min(n, delPedido) }] } : {}),
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
          : <Button tone="success" disabled={trabajando || n == null || n <= 0 || !entro} onClick={() => void confirmar()}>Confirmar pago</Button>}
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
              <option value="">{cuenta.cuentas.length ? 'Elegí la cuenta' : 'No hay cuentas para cobrar'}</option>
              {cuenta.cuentas.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={fecha} max={hoyDia} onChange={(e) => setFecha(e.target.value)} /></Field>
        </div>
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
    leerCuentasCorrientes('bdi', 'bdi', LIBRO_DE_PRUEBA)
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
