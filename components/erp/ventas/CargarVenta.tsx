'use client'

/**
 * ERP › Ventas › Cargar venta (a mano; en la lista se ve como «Manual», ⛔ «cargada a mano»): `diseno.md` §7, contrato §19.
 * Fecha, cliente, canal, de dónde sale, prendas con precio editable y cómo paga (o «queda debiendo» con la Cuenta corriente).
 * Servidor: `api/_erp-cargar.js` (`registrarVenta` del motor con `origen: 'manual'`).
 *
 * 🔴 Hasta el corte la venta es DE PRUEBA: ⛔ mueve stock ni pasa a GN (lo dice el panel).
 * 🔑 La clave del formulario (`origen_ref`) nace al ABRIRLO ⇒ apretar dos veces o reintentar ⛔ duplica.
 * ⛔ Todavía: «quién cobra = externo» (decisión de Bruno, §19 ⚠️) y la factura (se hace desde Facturación).
 */

import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Notice, Select, color, font, space } from '@/components/ui'
import { FichaCostado } from '@/components/ui/FichaCostado'
import {
  buscarClientas, buscarPrendas, cargarVenta, leerParaCargar, leerPrecioDeProducto,
  type Clienta, type DatosParaCargar, type MarcaErp, type PrendaEncontrada,
} from '@/lib/erp/cliente'
import { NOMBRE_CANAL, NOMBRE_MARCA } from '@/lib/erp/venta.core.js'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'

type Renglon = { clave: string; prenda: PrendaEncontrada; cantidad: number; precio: number | '' }
type Pago = { clave: string; cuenta: string; monto: number | '' }

const CANAL = NOMBRE_CANAL as Record<string, string>
const MARCA = NOMBRE_MARCA as Record<string, string>
const DEPOSITO = NOMBRE_DEPOSITO as Record<string, string>
const pesos = (x: number) => Math.round(x * 100) / 100
const $ = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const ahoraLocal = () => {
  const d = new Date(Date.now() - 3 * 3600_000)
  return d.toISOString().slice(0, 16)
}
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16).padStart(8, '0')}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`)
/** El precio de la lista que corresponde al canal (si el usuario ve precios). */
const LISTA_DE_CANAL: Record<string, string> = { local: 'local', online: 'online', mayorista: 'mayorista', ml: 'online' }

export function CargarVenta({ marca, onCerrar, onCargada }: { marca: MarcaErp; onCerrar: () => void; onCargada: (texto: string) => void }) {
  const [clave] = useState(uuid)
  const [datos, setDatos] = useState<DatosParaCargar | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [linea, setLinea] = useState<string>(marca)
  const [cuando, setCuando] = useState(ahoraLocal)
  const [canal, setCanal] = useState('local')
  const [deposito, setDeposito] = useState('local')
  const [doc, setDoc] = useState('')
  const [nombre, setNombre] = useState('')
  const [qCliente, setQCliente] = useState('')
  const [clientas, setClientas] = useState<Clienta[]>([])
  const [q, setQ] = useState('')
  const [encontradas, setEncontradas] = useState<PrendaEncontrada[]>([])
  const [buscando, setBuscando] = useState(false)
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [pagos, setPagos] = useState<Pago[]>([{ clave: 'p0', cuenta: '', monto: '' }])
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    leerParaCargar(marca).then((d) => { if (vivo) setDatos(d) }).catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo abrir.') })
    return () => { vivo = false }
  }, [marca])

  const cuentas = useMemo(() => (datos?.cuentas ?? []).filter((c) => c.marca === linea), [datos, linea])
  const total = pesos(renglones.reduce((a, r) => a + (r.precio === '' ? 0 : r.precio) * r.cantidad, 0))
  const pagado = pesos(pagos.reduce((a, p) => a + (p.monto === '' ? 0 : p.monto), 0))
  const aCuenta = pagos.some((p) => cuentas.find((c) => c.id === p.cuenta)?.medio === 'cuenta' && Number(p.monto) > 0)
  const contraentrega = pagos.some((p) => cuentas.find((c) => c.id === p.cuenta)?.medio === 'entrega' && Number(p.monto) > 0)
  const conCliente = doc.replace(/\D/g, '').length >= 7 && nombre.trim().length > 1
  const sinPrecio = renglones.some((r) => r.precio === '')
  const falta = !renglones.length ? 'Agregá al menos una prenda.'
    : sinPrecio ? 'Falta el precio de alguna prenda.'
    : pagos.some((p) => Number(p.monto) > 0 && !p.cuenta) ? 'Elegí la cuenta de cada pago.'
    : pagado !== total ? `Lo que paga (${$(pagado)}) no suma el total (${$(total)}).`
    : aCuenta && !conCliente ? 'Para que quede debiendo hace falta el cliente (documento y nombre).'
    : null

  const buscar = async () => {
    if (q.trim().length < 2) return
    setBuscando(true)
    try {
      const r = await buscarPrendas(marca, q.trim())
      setEncontradas(r.variantes.filter((v) => (marca === 'bdi') || (linea === 'stunned') === String(v.sku ?? '').toUpperCase().startsWith('STU')))
      if (!r.variantes.length) setError('No se encontró esa prenda.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo buscar.') } finally { setBuscando(false) }
  }

  const agregar = async (p: PrendaEncontrada) => {
    const r: Renglon = { clave: uuid(), prenda: p, cantidad: 1, precio: '' }
    setRenglones((x) => [...x, r])
    setEncontradas([])
    setQ('')
    // El precio de lista del canal, si este usuario ve precios (`vista=precio` pide `costos`): si ⛔, se escribe a mano.
    try {
      const pr = await leerPrecioDeProducto(marca, p.producto)
      const fila = pr.listas.find((l) => l.lista === LISTA_DE_CANAL[canal])
      if (fila?.precio != null) setRenglones((x) => x.map((y) => (y.clave === r.clave && y.precio === '' ? { ...y, precio: Number(fila.precio) } : y)))
    } catch { /* sin permiso o sin precio: lo escribe quien carga */ }
  }

  const buscarCliente = async () => {
    if (qCliente.trim().length < 2) return
    try { setClientas((await buscarClientas(marca, qCliente.trim())).clientas) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo buscar el cliente.') }
  }

  const enviar = async () => {
    if (falta || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const r = await cargarVenta(marca, {
        linea, origen_ref: clave, ocurrida_en: new Date(`${cuando}:00-03:00`).toISOString(), canal, deposito,
        ...(conCliente ? { cliente: { doc: doc.replace(/\D/g, ''), nombre: nombre.trim() } } : {}),
        lineas: renglones.map((x) => ({ producto: x.prenda.producto, talle: x.prenda.talle, cantidad: x.cantidad, precio: Number(x.precio), sku: x.prenda.sku, barcode: x.prenda.barcode })),
        pagos: pagos.filter((p) => Number(p.monto) > 0).map((p) => ({ cuenta: p.cuenta, monto: Number(p.monto) })),
        nota: nota.trim() || undefined,
      })
      onCargada(`${r.yaExistia ? 'Ya estaba cargada' : 'Cargada'}: venta ${r.venta.numero} por ${$(r.venta.total)}${r.venta.prueba ? ' (de prueba)' : ''}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la venta.')
    } finally { setEnviando(false) }
  }

  const fila: React.CSSProperties = { display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }
  return (
    <FichaCostado abierta onCerrar={onCerrar} titulo="Cargar venta" etiqueta="Cargar una venta a mano">
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
        <Notice tone="warning">Hasta el corte, la venta queda <b>de prueba</b>: no mueve stock ni pasa a Gestión Nube. En la lista se ve como «Manual».</Notice>
        {datos && !datos.manualHabilitado && <Notice tone="danger">La base de esta marca todavía no acepta ventas manuales.</Notice>}
        {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

        <div style={fila}>
          <Field label="Fecha y hora"><Input type="datetime-local" value={cuando} max={ahoraLocal()} onChange={(e) => setCuando(e.target.value)} /></Field>
          {(datos?.lineas.length ?? 0) > 1 && (
            <Field label="Línea">
              <Select value={linea} disabled={renglones.length > 0} onChange={(e) => { setLinea(e.target.value); setPagos([{ clave: 'p0', cuenta: '', monto: '' }]) }}>
                {datos!.lineas.map((l) => <option key={l} value={l}>{MARCA[l] ?? l}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Canal">
            <Select value={canal} onChange={(e) => setCanal(e.target.value)}>
              {(datos?.canales ?? ['local']).map((c) => <option key={c} value={c}>{CANAL[c] ?? c}</option>)}
            </Select>
          </Field>
          <Field label="Sale de">
            <Select value={deposito} onChange={(e) => setDeposito(e.target.value)}>
              {(datos?.depositos ?? ['local']).map((d) => <option key={d} value={d}>{DEPOSITO[d] ?? d}</option>)}
            </Select>
          </Field>
        </div>

        <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <b style={{ color: color.ink }}>Cliente <span style={{ color: color.mut, fontWeight: 400 }}>(opcional; hace falta para que quede debiendo)</span></b>
          <div style={fila}>
            <Input aria-label="Buscar cliente" placeholder="Nombre o documento" value={qCliente} onChange={(e) => setQCliente(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscarCliente() }} style={{ flex: '1 1 180px' }} />
            <Button variant="outline" onClick={buscarCliente}>Buscar</Button>
          </div>
          {clientas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {clientas.map((c) => (
                <Button key={c.doc} variant="ghost" style={{ justifyContent: 'flex-start', height: 'auto' }} onClick={() => { setDoc(c.doc); setNombre(c.nombre); setClientas([]) }}>{c.nombre} · {c.doc}</Button>
              ))}
            </div>
          )}
          <div style={fila}>
            <Field label="Documento"><Input inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} style={{ width: 140 }} /></Field>
            <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: 220 }} /></Field>
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <b style={{ color: color.ink }}>Prendas</b>
          <div style={fila}>
            <Input aria-label="Buscar prenda" placeholder="SKU, código de barras o nombre" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar() }} style={{ flex: '1 1 180px' }} />
            <Button variant="outline" disabled={buscando} onClick={buscar}>{buscando ? 'Buscando…' : 'Buscar'}</Button>
          </div>
          {encontradas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
              {encontradas.slice(0, 30).map((p) => (
                <Button key={`${p.producto}/${p.talle}`} variant="ghost" style={{ justifyContent: 'flex-start', height: 'auto' }} onClick={() => agregar(p)}>
                  {p.nombre ?? 'Sin nombre'} · {p.talleNombre ?? '—'} <span style={{ color: color.mut }}>&nbsp;{p.sku ?? ''}</span>
                </Button>
              ))}
            </div>
          )}
          {renglones.map((r) => (
            <div key={r.clave} style={{ ...fila, alignItems: 'center', borderTop: `1px solid ${color.bg2}`, paddingTop: space[2] }}>
              <span style={{ flex: '1 1 160px', color: color.ink }}>{r.prenda.nombre} <span style={{ color: color.mut }}>{r.prenda.talleNombre}</span></span>
              <Input aria-label="Cantidad" type="number" min={1} step={1} value={r.cantidad} style={{ width: 70 }}
                onChange={(e) => setRenglones((x) => x.map((y) => (y.clave === r.clave ? { ...y, cantidad: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : y)))} />
              <Input aria-label="Precio" type="number" min={0} step="0.01" placeholder="Precio" value={r.precio} style={{ width: 110 }}
                onChange={(e) => setRenglones((x) => x.map((y) => (y.clave === r.clave ? { ...y, precio: e.target.value === '' ? '' : Number(e.target.value) } : y)))} />
              <Button variant="ghost" onClick={() => setRenglones((x) => x.filter((y) => y.clave !== r.clave))}>Sacar</Button>
            </div>
          ))}
          <div style={{ textAlign: 'right', fontSize: font.lg, color: color.ink }}>Total <b>{$(total)}</b></div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <b style={{ color: color.ink }}>Cómo paga</b>
          {pagos.map((p, i) => (
            <div key={p.clave} style={{ ...fila, alignItems: 'center' }}>
              <Select aria-label="Cuenta" value={p.cuenta} style={{ flex: '1 1 180px' }} onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, cuenta: e.target.value } : y)))}>
                <option value="">Elegí la cuenta</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.medio === 'cuenta' ? `${c.nombre} (queda debiendo)` : c.medio === 'entrega' ? `${c.nombre} (lo cobra el cadete)` : c.nombre}</option>)}
              </Select>
              <Input aria-label="Monto" type="number" min={0} step="0.01" value={p.monto} style={{ width: 120 }}
                onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, monto: e.target.value === '' ? '' : Number(e.target.value) } : y)))} />
              <Button variant="ghost" onClick={() => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, monto: pesos(total - (pagado - (y.monto === '' ? 0 : y.monto))) } : y)))}>Completar</Button>
              {i > 0 && <Button variant="ghost" onClick={() => setPagos((x) => x.filter((y) => y.clave !== p.clave))}>Sacar</Button>}
            </div>
          ))}
          <div><Button variant="outline" onClick={() => setPagos((x) => [...x, { clave: uuid(), cuenta: '', monto: '' }])}>Agregar otro pago</Button></div>
          {aCuenta && <p style={{ margin: 0, color: color.mut, fontSize: font.sm }}>Si el cliente no tiene crédito, o pasó el tope o el plazo, el ERP no la deja quedar debiendo.</p>}
          {contraentrega && <p style={{ margin: 0, color: color.mut, fontSize: font.sm }}>Contraentrega: el cadete cobra al entregar. Hasta que el envío se marque entregado, la venta queda en Ventas › Cobros › Contraentrega.</p>}
        </section>

        <Field label="Nota (opcional)"><Input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} /></Field>

        {falta && renglones.length > 0 && <p style={{ margin: 0, color: color.mut }}>{falta}</p>}
        <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button disabled={!!falta || enviando || !datos?.manualHabilitado} onClick={enviar}>{enviando ? 'Cargando…' : 'Cargar venta'}</Button>
        </div>
      </div>
    </FichaCostado>
  )
}
