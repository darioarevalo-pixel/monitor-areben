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
import { facturaLibrePanel, leerFacturasClientePanel, type FacturaDelPanel, type FiscalDelPanel } from '@/lib/erp/cliente'
import { parsearMonto } from '@/lib/compromisos/plata.core.js'

/** El PDF (jsPDF + QR) se carga recién al pedirlo: ⛔ entra al paquete del panel. */
const descargarFactura = async (f: FacturaDelPanel) => (await import('@/lib/arca/factura-pdf')).descargarFactura(f)
const numeroComprobante = (f: { pto_vta: number; numero: number }) => `${String(f.pto_vta).padStart(5, '0')}-${String(f.numero).padStart(8, '0')}`
const plata = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const LETRA: Record<number, string> = { 1: 'A', 6: 'B' }
const ROTULO = { fontSize: 11, fontWeight: 700, color: color.mut2, textTransform: 'uppercase' as const, letterSpacing: 0.4 }
const CONDICIONES: Array<[string, string]> = [['ri', 'Responsable inscripto'], ['monotributo', 'Monotributo'], ['exento', 'Exento'], ['consumidor', 'Consumidor final']]
type Renglon = { descripcion: string; cantidad: string; unitario: string }
const VACIO: Renglon = { descripcion: '', cantidad: '1', unitario: '' }

export function FacturasCliente({ clienteId, decir }: { clienteId: string; decir: (t: string) => void }) {
  const [datos, setDatos] = useState<{ fiscal: FiscalDelPanel; facturas: FacturaDelPanel[]; sinMigrar?: string } | null>(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(false)

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
          </span>
        </div>
      )) : <div style={{ fontSize: font.sm, color: color.mut2 }}>Todavía no hay facturas.</div>)}
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
  const incompleta = !fiscal.condicion || ((fiscal.condicion === 'ri' || fiscal.condicion === 'monotributo') && (!fiscal.doc || !fiscal.razonSocial || !fiscal.domicilio))
  const [pedirDatos, setPedirDatos] = useState(incompleta)
  const [doc, setDoc] = useState(fiscal.doc ?? '')
  const [condicion, setCondicion] = useState<string>(fiscal.condicion ?? '')
  const [razonSocial, setRazonSocial] = useState(fiscal.razonSocial ?? '')
  const [domicilio, setDomicilio] = useState(fiscal.domicilio ?? '')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const leidos = renglones.map((r) => ({ descripcion: r.descripcion.trim(), cantidad: Number(r.cantidad), unitario: parsearMonto(r.unitario) ?? NaN }))
  const total = leidos.reduce((a, r) => a + (Number.isFinite(r.cantidad * r.unitario) ? Math.round(r.cantidad * r.unitario * 100) : 0), 0) / 100
  const poner = (i: number, k: keyof Renglon, v: string) => setRenglones((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const esA = condicion === 'ri' || condicion === 'monotributo'

  async function hacer() {
    setEnviando(true); setError('')
    try {
      const r = await facturaLibrePanel({
        clienteId, renglones: leidos,
        ...(pedirDatos ? { doc: doc.replace(/\D/g, ''), condicion, razonSocial: razonSocial.trim(), domicilio: domicilio.trim() } : {}),
      })
      await onHecha(r.factura)
    } catch (e) {
      const datos = (e as { datos?: { falta?: boolean } }).datos
      if (datos?.falta) setPedirDatos(true)
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

        {pedirDatos ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${color.line2}`, paddingTop: 8 }}>
            <div style={ROTULO}>Datos para facturar (quedan en la ficha)</div>
            <Field label="Condición frente al IVA">
              <Select value={condicion} onChange={(e) => setCondicion(e.target.value)}>
                <option value="">Elegir…</option>
                {CONDICIONES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </Select>
            </Field>
            <Field label={esA ? 'CUIT' : 'CUIT o DNI (opcional)'}><Input value={doc} inputMode="numeric" onChange={(e) => setDoc(e.target.value)} /></Field>
            <Field label={esA ? 'Razón social' : 'Razón social (opcional)'}><Input value={razonSocial} maxLength={120} onChange={(e) => setRazonSocial(e.target.value)} /></Field>
            <Field label={esA ? 'Domicilio' : 'Domicilio (opcional)'}><Input value={domicilio} maxLength={200} onChange={(e) => setDomicilio(e.target.value)} /></Field>
            {condicion && <div style={{ fontSize: font.sm, color: color.mut2 }}>Sale factura {esA ? 'A' : 'B'}.</div>}
          </div>
        ) : (
          <div style={{ fontSize: font.sm, color: color.mut2 }}>
            Sale factura {fiscal.condicion === 'ri' || fiscal.condicion === 'monotributo' ? 'A' : 'B'} a {fiscal.razonSocial || 'el cliente'}{fiscal.doc ? ` (${fiscal.doc})` : ''}.{' '}
            <Button size="sm" variant="ghost" style={{ height: 'auto' }} onClick={() => setPedirDatos(true)}>Cambiar datos</Button>
          </div>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}
