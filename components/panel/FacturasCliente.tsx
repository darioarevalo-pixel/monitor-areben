'use client'
/**
 * Las facturas del cliente en la tarjeta de cuenta del panel (facturación de mayoristas, pedido de Darío §5; Bruno 31-oct):
 * la lista de las que salieron desde acá (con su PDF) y «Hacer factura libre» —sin venta: «100 fundas» con precio a mano; suma
 * al tope del mes, ⛔ mueve stock ni la cuenta corriente—. Si la ficha ⛔ tiene los datos fiscales, se piden en el MISMO paso.
 * A o B la decide la condición frente al IVA (lo que acepta ARCA). Escondida como el resto del panel; facturar, además detrás de
 * `VENTA_MAYORISTA_REAL` (el servidor contesta 409 mientras GN siga facturando).
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Field, Input, Modal, Notice, Select } from '@/components/ui'
import { color, font } from '@/components/ui/tokens'
import {
  emitirPartePanel, enviarFacturaPanel, facturaLibrePanel, facturarPedidoPanel, leerFacturasClientePanel, proponerPartePanel,
  type EstadoParte, type FacturaDelPanel, type FiscalDelPanel, type RenglonParte,
} from '@/lib/erp/cliente'
import { parsearMonto } from '@/lib/compromisos/plata.core.js'

/** El PDF (jsPDF + QR) se carga recién al pedirlo: ⛔ entra al paquete del panel. */
export const descargarFactura = async (f: FacturaDelPanel) => (await import('@/lib/arca/factura-pdf')).descargarFactura(f)
const facturaEnBase64 = async (f: FacturaDelPanel) => (await import('@/lib/arca/factura-pdf')).facturaEnBase64(f)
export const numeroComprobante = (f: { pto_vta: number; numero: number }) => `${String(f.pto_vta).padStart(5, '0')}-${String(f.numero).padStart(8, '0')}`
const plata = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
export const LETRA: Record<number, string> = { 1: 'A', 6: 'B' }
const ROTULO = { fontSize: 11, fontWeight: 700, color: color.mut2, textTransform: 'uppercase' as const, letterSpacing: 0.4 }
const CONDICIONES: Array<[string, string]> = [['ri', 'Responsable inscripto'], ['monotributo', 'Monotributo'], ['exento', 'Exento'], ['consumidor', 'Consumidor final']]
type Renglon = { descripcion: string; cantidad: string; unitario: string }
const VACIO: Renglon = { descripcion: '', cantidad: '1', unitario: '' }

export function FacturasCliente({ clienteId, decir }: { clienteId: string; decir: (t: string) => void }) {
  const [datos, setDatos] = useState<{ ambiente: string; fiscal: FiscalDelPanel; facturas: FacturaDelPanel[]; sinMigrar?: string } | null>(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(false)
  const [porMail, setPorMail] = useState<FacturaDelPanel | null>(null)

  const [vuelta, setVuelta] = useState(0)
  const cargar = useCallback(() => setVuelta((v) => v + 1), [])
  useEffect(() => {
    let vivo = true
    leerFacturasClientePanel(clienteId)
      .then((r) => { if (vivo) { setDatos(r.prendido ? r : null); setError('') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron leer las facturas.') })
    return () => { vivo = false }
  }, [clienteId, vuelta])

  if (!datos && !error) return null
  return (
    <div style={{ borderTop: `1px solid ${color.line2}`, marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={ROTULO}>Facturas</div>
        {datos && !datos.sinMigrar && (
          <Button size="sm" variant="outline" onClick={() => setAbierta(true)} style={{ height: 'auto' }}>Hacer factura libre</Button>
        )}
      </div>
      {error && <div style={{ fontSize: font.sm, color: color.dangerInk }}>{error}</div>}
      {datos?.sinMigrar && <div style={{ fontSize: font.sm, color: color.mut2 }}>{datos.sinMigrar}</div>}
      {datos && !datos.sinMigrar && (datos.facturas.length ? datos.facturas.slice(0, 8).map((f) => (
        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: font.sm }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {LETRA[f.tipo] ?? f.tipo} {numeroComprobante(f)} · {f.fecha.split('-').reverse().join('/')}{f.clase === 'libre' ? ' · libre' : ''}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{plata(f.total)}</span>
            <Button size="sm" variant="ghost" style={{ height: 'auto' }} onClick={() => descargarFactura(f).catch(() => decir('No se pudo hacer el PDF.'))}>PDF</Button>
            <Button size="sm" variant="ghost" style={{ height: 'auto' }} onClick={() => setPorMail(f)}>Mail</Button>
          </span>
        </div>
      )) : <div style={{ fontSize: font.sm, color: color.mut2 }}>Todavía no hay facturas.</div>)}
      {porMail && datos && (
        <EnviarPorMail clienteId={clienteId} factura={porMail} sugerido={datos.fiscal.email ?? ''} ambiente={datos.ambiente}
          onCerrar={() => setPorMail(null)} onEnviada={(t) => { setPorMail(null); decir(t) }} />
      )}
      {abierta && datos && (
        <FacturaLibre clienteId={clienteId} fiscal={datos.fiscal} onCerrar={() => setAbierta(false)}
          onHecha={async (f) => { setAbierta(false); decir(`Factura ${LETRA[f.tipo] ?? ''} ${numeroComprobante(f)} hecha.`); cargar(); await descargarFactura(f).catch(() => {}) }} />
      )}
    </div>
  )
}

/** El formulario de la factura LIBRE: renglones a mano y, si faltan, los datos fiscales del cliente. */
function FacturaLibre({ clienteId, fiscal, onCerrar, onHecha }: {
  clienteId: string; fiscal: FiscalDelPanel; onCerrar: () => void; onHecha: (f: FacturaDelPanel) => void | Promise<void>
}) {
  const [renglones, setRenglones] = useState<Renglon[]>([{ ...VACIO }])
  const fis = useDatosFiscales(fiscal)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const leidos = renglones.map((r) => ({ descripcion: r.descripcion.trim(), cantidad: Number(r.cantidad), unitario: parsearMonto(r.unitario) ?? NaN }))
  const total = leidos.reduce((a, r) => a + (Number.isFinite(r.cantidad * r.unitario) ? Math.round(r.cantidad * r.unitario * 100) : 0), 0) / 100
  const poner = (i: number, k: keyof Renglon, v: string) => setRenglones((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  async function hacer() {
    setEnviando(true); setError('')
    try {
      const r = await facturaLibrePanel({
        clienteId, renglones: leidos,
        ...fis.cuerpo(),
      })
      await onHecha(r.factura)
    } catch (e) {
      const datos = (e as { datos?: { falta?: boolean } }).datos
      if (datos?.falta) fis.setPedirDatos(true)
      setError(e instanceof Error ? e.message : 'No se pudo hacer la factura.')
    } finally { setEnviando(false) }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Factura libre" pie={<>
      <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
      <Button tone="brand" onClick={hacer} disabled={enviando || !(total > 0)}>{enviando ? 'Pidiendo el CAE…' : `Facturar ${plata(total)}`}</Button>
    </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: font.sm, color: color.mut2 }}>
          Sin pedido: no mueve stock ni la cuenta corriente. Suma a lo facturado del mes.
        </div>
        {renglones.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px 110px auto', gap: 6, alignItems: 'end' }}>
            <Field label={i === 0 ? 'Producto' : ''}><Input value={r.descripcion} maxLength={120} placeholder="Fundas iPhone" onChange={(e) => poner(i, 'descripcion', e.target.value)} /></Field>
            <Field label={i === 0 ? 'Cantidad' : ''}><Input value={r.cantidad} inputMode="numeric" onChange={(e) => poner(i, 'cantidad', e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label={i === 0 ? 'Precio unitario' : ''}><Input value={r.unitario} inputMode="decimal" placeholder="$" onChange={(e) => poner(i, 'unitario', e.target.value)} /></Field>
            <Button size="sm" variant="ghost" style={{ height: 'auto' }} disabled={renglones.length === 1} onClick={() => setRenglones((rs) => rs.filter((_, j) => j !== i))}>Sacar</Button>
          </div>
        ))}
        <Button size="sm" variant="outline" style={{ height: 'auto', alignSelf: 'flex-start' }} disabled={renglones.length >= 40} onClick={() => setRenglones((rs) => [...rs, { ...VACIO }])}>Agregar renglón</Button>
        <div style={{ fontSize: font.md, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>Total {plata(total)}</div>

        <CamposFiscales fiscal={fiscal} f={fis} />
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

/** «Enviar por mail»: el mismo PDF de «PDF», adjunto, al mail de la ficha (corregible). Sale con el remitente de la marca. */
function EnviarPorMail({ clienteId, factura, sugerido, ambiente, onCerrar, onEnviada }: {
  clienteId: string; factura: FacturaDelPanel; sugerido: string; ambiente: string; onCerrar: () => void; onEnviada: (texto: string) => void
}) {
  const [para, setPara] = useState(sugerido)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para.trim())

  async function enviar() {
    setEnviando(true); setError('')
    try {
      const pdf = await facturaEnBase64(factura)
      const r = await enviarFacturaPanel({ clienteId, facturaId: factura.id, para: para.trim(), pdf })
      onEnviada(`Factura ${r.comprobante} enviada a ${r.para}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mandar la factura.')
    } finally { setEnviando(false) }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Enviar la factura ${LETRA[factura.tipo] ?? ''} ${numeroComprobante(factura)}`} pie={<>
      <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
      <Button tone="brand" onClick={enviar} disabled={enviando || !valido}>{enviando ? 'Enviando…' : 'Enviar'}</Button>
    </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Mail del cliente"><Input value={para} type="email" inputMode="email" maxLength={200} placeholder="cliente@ejemplo.com" onChange={(e) => setPara(e.target.value)} /></Field>
        <div style={{ fontSize: font.sm, color: color.mut2 }}>
          Le llega con el PDF adjunto, por {plata(factura.total)}. Si contesta, la respuesta llega a la casilla de la marca.
          {ambiente !== 'produccion' ? ' Es una factura de PRUEBA: sólo se manda a una casilla @arebensrl.com.' : ''}
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

const esCondicionA = (c: string | null | undefined) => c === 'ri' || c === 'monotributo'

/** Los datos fiscales del cliente, de la ficha o pedidos en el mismo paso (quedan en la ficha). Lo usan la libre y la del pedido. */
function useDatosFiscales(fiscal: FiscalDelPanel) {
  const incompleta = !fiscal.condicion || (esCondicionA(fiscal.condicion) && (!fiscal.doc || !fiscal.razonSocial || !fiscal.domicilio))
  const [pedirDatos, setPedirDatos] = useState(incompleta)
  const [doc, setDoc] = useState(fiscal.doc ?? '')
  const [condicion, setCondicion] = useState<string>(fiscal.condicion ?? '')
  const [razonSocial, setRazonSocial] = useState(fiscal.razonSocial ?? '')
  const [domicilio, setDomicilio] = useState(fiscal.domicilio ?? '')
  const cuerpo = () => (pedirDatos ? { doc: doc.replace(/\D/g, ''), condicion, razonSocial: razonSocial.trim(), domicilio: domicilio.trim() } : {})
  return { pedirDatos, setPedirDatos, doc, setDoc, condicion, setCondicion, razonSocial, setRazonSocial, domicilio, setDomicilio, cuerpo }
}

function CamposFiscales({ fiscal, f }: { fiscal: FiscalDelPanel; f: ReturnType<typeof useDatosFiscales> }) {
  const esA = esCondicionA(f.condicion)
  return f.pedirDatos ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${color.line2}`, paddingTop: 8 }}>
      <div style={ROTULO}>Datos para facturar (quedan en la ficha)</div>
      <Field label="Condición frente al IVA">
        <Select value={f.condicion} onChange={(e) => f.setCondicion(e.target.value)}>
          <option value="">Elegir…</option>
          {CONDICIONES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </Select>
      </Field>
      <Field label={esA ? 'CUIT' : 'CUIT o DNI (opcional)'}><Input value={f.doc} inputMode="numeric" onChange={(e) => f.setDoc(e.target.value)} /></Field>
      <Field label={esA ? 'Razón social' : 'Razón social (opcional)'}><Input value={f.razonSocial} maxLength={120} onChange={(e) => f.setRazonSocial(e.target.value)} /></Field>
      <Field label={esA ? 'Domicilio' : 'Domicilio (opcional)'}><Input value={f.domicilio} maxLength={200} onChange={(e) => f.setDomicilio(e.target.value)} /></Field>
      {f.condicion && <div style={{ fontSize: font.sm, color: color.mut2 }}>Sale factura {esA ? 'A' : 'B'}.</div>}
    </div>
  ) : (
    <div style={{ fontSize: font.sm, color: color.mut2 }}>
      Sale factura {esCondicionA(fiscal.condicion) ? 'A' : 'B'} a {fiscal.razonSocial || 'el cliente'}{fiscal.doc ? ` (${fiscal.doc})` : ''}.{' '}
      <Button size="sm" variant="ghost" style={{ height: 'auto' }} onClick={() => f.setPedirDatos(true)}>Cambiar datos</Button>
    </div>
  )
}

/**
 * «Facturar» desde la HOJA DEL PEDIDO (Darío §5): la factura ENTERA de su venta, por el total del pedido como está ahora,
 * a la ficha del pedido. Si faltan datos fiscales se piden acá mismo. Al salir, baja el PDF.
 */
export function FacturarPedido({ pedidoId, clienteId, total, preparado, onCerrar, onHecha }: {
  pedidoId: string; clienteId: string; total: number; preparado: boolean; onCerrar: () => void; onHecha: (f: FacturaDelPanel, yaEstaba: boolean) => void | Promise<void>
}) {
  const [fiscal, setFiscal] = useState<FiscalDelPanel | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    leerFacturasClientePanel(clienteId)
      .then((r) => { if (vivo) { if (r.prendido) setFiscal(r.fiscal); else setError('La cuenta corriente del panel está apagada.') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer la ficha del cliente.') })
    return () => { vivo = false }
  }, [clienteId])
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Facturar el pedido" pie={!fiscal ? <Button variant="outline" onClick={onCerrar}>Cancelar</Button> : undefined}>
      {!fiscal && !error && <div style={{ fontSize: font.sm, color: color.mut2 }}>Cargando…</div>}
      {!fiscal && error && <Notice tone="danger">{error}</Notice>}
      {fiscal && <FormFacturarPedido pedidoId={pedidoId} fiscal={fiscal} total={total} preparado={preparado} onCerrar={onCerrar} onHecha={onHecha} />}
    </Modal>
  )
}

function FormFacturarPedido({ pedidoId, fiscal, total, preparado, onCerrar, onHecha }: {
  pedidoId: string; fiscal: FiscalDelPanel; total: number; preparado: boolean; onCerrar: () => void; onHecha: (f: FacturaDelPanel, yaEstaba: boolean) => void | Promise<void>
}) {
  const fis = useDatosFiscales(fiscal)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function hacer() {
    setEnviando(true); setError('')
    try {
      const r = await facturarPedidoPanel({ pedidoId, ...fis.cuerpo() })
      await onHecha(r.factura, r.yaEstaba)
    } catch (e) {
      if ((e as { datos?: { falta?: boolean } }).datos?.falta) fis.setPedirDatos(true)
      setError(e instanceof Error ? e.message : 'No se pudo hacer la factura.')
    } finally { setEnviando(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: font.md, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Total del pedido {plata(total)}</div>
      {!preparado && <Notice tone="info">El pedido todavía no está preparado. Si en el depósito falta algo, primero se corrige el pedido y después se factura.</Notice>}
      <CamposFiscales fiscal={fiscal} f={fis} />
      {error && <Notice tone="danger">{error}</Notice>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button tone="brand" onClick={hacer} disabled={enviando || !(total > 0)}>{enviando ? 'Pidiendo el CAE…' : `Facturar ${plata(total)}`}</Button>
      </div>
    </div>
  )
}

type RenglonEditable = { clave: string | null; descripcion: string; cantidad: string; unitario: string }
const editable = (r: RenglonParte): RenglonEditable => ({ clave: r.clave ?? null, descripcion: r.descripcion, cantidad: String(r.cantidad), unitario: String(r.unitario) })

/**
 * «Facturar una parte» desde la HOJA DEL PEDIDO (Darío §5; Bruno 31-oct): un MONTO de lo que queda de la venta. Primero se
 * pregunta si el cliente quiere los precios REALES; si no —«la mayoría»— los precios se AJUSTAN para que el total dé justo el
 * monto. Los renglones propuestos se pueden corregir antes de facturar. ⛔ mueve stock ni la cuenta corriente.
 */
export function FacturarParte({ pedidoId, clienteId, onCerrar, onHecha }: {
  pedidoId: string; clienteId: string; onCerrar: () => void; onHecha: (f: FacturaDelPanel, queda: number) => void | Promise<void>
}) {
  const [fiscal, setFiscal] = useState<FiscalDelPanel | null>(null)
  const [estado, setEstado] = useState<EstadoParte | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    Promise.all([leerFacturasClientePanel(clienteId), proponerPartePanel({ pedidoId })])
      .then(([r, e]) => {
        if (!vivo) return
        if (!r.prendido) { setError('La cuenta corriente del panel está apagada.'); return }
        setFiscal(r.fiscal); setEstado(e)
      })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el pedido.') })
    return () => { vivo = false }
  }, [clienteId, pedidoId])
  const listo = fiscal && estado
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Facturar una parte" pie={!listo ? <Button variant="outline" onClick={onCerrar}>Cancelar</Button> : undefined}>
      {!listo && !error && <div style={{ fontSize: font.sm, color: color.mut2 }}>Cargando…</div>}
      {!listo && error && <Notice tone="danger">{error}</Notice>}
      {listo && <FormFacturarParte pedidoId={pedidoId} fiscal={fiscal} estado={estado} onCerrar={onCerrar} onHecha={onHecha} />}
    </Modal>
  )
}

function FormFacturarParte({ pedidoId, fiscal, estado, onCerrar, onHecha }: {
  pedidoId: string; fiscal: FiscalDelPanel; estado: EstadoParte; onCerrar: () => void; onHecha: (f: FacturaDelPanel, queda: number) => void | Promise<void>
}) {
  const fis = useDatosFiscales(fiscal)
  const [monto, setMonto] = useState('')
  const [reales, setReales] = useState('no')
  const [renglones, setRenglones] = useState<RenglonEditable[] | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const leidos = (renglones ?? []).map((r) => ({ clave: r.clave, descripcion: r.descripcion.trim(), cantidad: Number(r.cantidad), unitario: parsearMonto(r.unitario) ?? NaN }))
  const total = leidos.reduce((a, r) => a + (Number.isFinite(r.cantidad * r.unitario) ? Math.round(r.cantidad * r.unitario * 100) : 0), 0) / 100
  const sePasa = Math.round(total * 100) > Math.round(estado.queda * 100)
  const poner = (i: number, k: keyof RenglonEditable, v: string) => setRenglones((rs) => (rs ?? []).map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  async function proponer() {
    const m = parsearMonto(monto)
    if (!(m && m > 0)) { setError('Poné el monto a facturar.'); return }
    setOcupado(true); setError('')
    try {
      const r = await proponerPartePanel({ pedidoId, monto: m, precios: reales === 'si' ? 'reales' : 'ajustados' })
      setRenglones((r.propuesta?.renglones ?? []).map(editable))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo proponer la parte.')
    } finally { setOcupado(false) }
  }

  async function facturar() {
    setOcupado(true); setError('')
    try {
      const r = await emitirPartePanel({ pedidoId, renglones: leidos, ...fis.cuerpo() })
      await onHecha(r.factura, r.queda)
    } catch (e) {
      if ((e as { datos?: { falta?: boolean } }).datos?.falta) fis.setPedirDatos(true)
      setError(e instanceof Error ? e.message : 'No se pudo hacer la factura.')
    } finally { setOcupado(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: font.sm, color: color.mut2 }}>
        Quedan <b style={{ color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{plata(estado.queda)}</b> por facturar de {plata(estado.total)}. No mueve stock ni la cuenta corriente.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6, alignItems: 'end' }}>
        <Field label="Monto a facturar"><Input value={monto} inputMode="decimal" placeholder="$" onChange={(e) => setMonto(e.target.value)} /></Field>
        <Field label="¿Quiere los precios reales?">
          <Select value={reales} onChange={(e) => setReales(e.target.value)}>
            <option value="no">No: se ajustan al monto</option>
            <option value="si">Sí: precios reales</option>
          </Select>
        </Field>
      </div>
      <Button size="sm" variant="outline" style={{ height: 'auto', alignSelf: 'flex-start' }} disabled={ocupado} onClick={proponer}>
        {renglones ? 'Volver a proponer los renglones' : 'Proponer los renglones'}
      </Button>

      {renglones && renglones.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px 110px auto', gap: 6, alignItems: 'end' }}>
          <Field label={i === 0 ? 'Producto' : ''}><Input value={r.descripcion} maxLength={120} onChange={(e) => poner(i, 'descripcion', e.target.value)} /></Field>
          <Field label={i === 0 ? 'Cantidad' : ''}><Input value={r.cantidad} inputMode="numeric" onChange={(e) => poner(i, 'cantidad', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label={i === 0 ? 'Precio unitario' : ''}><Input value={r.unitario} inputMode="decimal" placeholder="$" onChange={(e) => poner(i, 'unitario', e.target.value)} /></Field>
          <Button size="sm" variant="ghost" style={{ height: 'auto' }} disabled={renglones.length === 1} onClick={() => setRenglones((rs) => (rs ?? []).filter((_, j) => j !== i))}>Sacar</Button>
        </div>
      ))}
      {renglones && (
        <>
          <Button size="sm" variant="outline" style={{ height: 'auto', alignSelf: 'flex-start' }} disabled={renglones.length >= 40}
            onClick={() => setRenglones((rs) => [...(rs ?? []), { clave: null, descripcion: '', cantidad: '1', unitario: '' }])}>Agregar renglón</Button>
          <div style={{ fontSize: font.md, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>Total {plata(total)}</div>
          {sePasa && <Notice tone="danger">Se pasa de lo que queda por facturar ({plata(estado.queda)}).</Notice>}
          <CamposFiscales fiscal={fiscal} f={fis} />
        </>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        {renglones && (
          <Button tone="brand" onClick={facturar} disabled={ocupado || !(total > 0) || sePasa}>{ocupado ? 'Pidiendo el CAE…' : `Facturar ${plata(total)}`}</Button>
        )}
      </div>
    </div>
  )
}
