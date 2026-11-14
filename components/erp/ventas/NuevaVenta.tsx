'use client'

/**
 * ERP › Ventas › «Nueva venta» (Bruno 10-nov; maqueta aprobada https://claude.ai/artifact/3Nutg1d5DUosBacCS6JZnF). Reemplaza al
 * «Cargar venta» del panel angosto: «nadie sabe cómo vender desde ahí».
 *
 * - Pantalla COMPLETA: a la izquierda se busca (escribiendo o escaneando) y se agrega por talle; a la derecha, el ticket.
 * - Dos modos: «Venta del local» (de ahora) y «Corregir una venta pasada» (fecha y motivo obligatorios; permiso `venta-pasada`).
 * - UN «Sale de» para toda la venta («generalmente se entrega todo de un mismo lugar»).
 * - Precio de lista, descuento % de cada producto y % de la forma de pago: EDITABLES («más manual y más libre»). Los % arrancan en
 *   los de la Caja de la tienda; el redondeo es el de la Caja. La cuenta la rearma el servidor con lo mismo (`cuentaDeNuevaVenta`).
 * - «Entra a»: la cuenta real (la de la configuración de cobros, editable).
 * - ⛔ Suma a la caja («el POS sólo recibe ventas del local en el POS, o cobros de pedidos de Tienda Nube») ni espera la transferencia.
 * - «De prueba» se dice SÓLO si la línea todavía ⛔ cortó.
 * Servidor: `api/_erp-cargar.js` (`registrarVenta` del motor con `origen: 'manual'`). 🔑 La clave (`origen_ref`) nace al abrir:
 * apretar dos veces ⛔ duplica.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Field, Input, Notice, Select, color, font, radius, space } from '@/components/ui'
import {
  buscarClientas, buscarPrendas, cargarVenta, leerParaCargar, leerPrecioDeProducto,
  type Clienta, type DatosParaCargar, type FormaDePagoCargar, type MarcaErp, type PrendaEncontrada,
} from '@/lib/erp/cliente'
import { cuentaDeNuevaVenta } from '@/lib/erp/nueva-venta.core.js'
import { NOMBRE_CANAL, NOMBRE_MARCA } from '@/lib/erp/venta.core.js'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import { deLaTienda, useTiendaErp } from '@/lib/erp/linea-erp'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'

type Renglon = { clave: string; prenda: PrendaEncontrada; cantidad: number; precio: number | ''; descuento: number | '' }
type Pago = { clave: string; forma: string; opcion: string; cuenta: string; porcentaje: number | ''; base: number | ''; real: string }
export type VentaGuardada = { id: string; numero: number; total: number; prueba: boolean }

const FRENOS_DE_CUENTA = ['SIN_CREDITO', 'ATRASADO', 'SUPERA_TOPE']
const POS = ['efectivo', 'transferencia', 'debito', 'credito']
const CANAL = NOMBRE_CANAL as Record<string, string>
const MARCA = NOMBRE_MARCA as Record<string, string>
const DEPOSITO = NOMBRE_DEPOSITO as Record<string, string>
const LISTA_DE_CANAL: Record<string, string> = { local: 'local', online: 'online', mayorista: 'mayorista', ml: 'online' }
const $ = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16).padStart(8, '0')}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`)
const num = (v: string): number | '' => (v === '' ? '' : Number(v))

const tarjeta: React.CSSProperties = { background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.xl, padding: space[5], display: 'flex', flexDirection: 'column', gap: space[4] }
const rotulo: React.CSSProperties = { fontSize: font.base, fontWeight: 600, color: color.ink2 }
const chico: React.CSSProperties = { fontSize: font.sm, color: color.mut }

export function NuevaVenta({ marca, onCerrar, onGuardada, onVer, onFacturar }: {
  marca: MarcaErp
  onCerrar: () => void
  /** Avisa a la lista que hay una venta nueva (la vuelve a leer). */
  onGuardada: (texto: string) => void
  onVer: (v: VentaGuardada) => void
  onFacturar: (v: VentaGuardada) => void
}) {
  const puede = usePuedeErp(marca)
  const [clave, setClave] = useState(uuid)
  const [datos, setDatos] = useState<DatosParaCargar | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tienda = useTiendaErp()
  const [linea, setLinea] = useState<string>(marca === 'bdi' || tienda === 'bdi' ? marca : tienda)
  const [modo, setModo] = useState<'local' | 'corregir'>('local')
  const [fecha, setFecha] = useState(hoyAR)
  const [motivo, setMotivo] = useState('')
  const [canalPasado, setCanalPasado] = useState('local')
  const [deposito, setDeposito] = useState('local')
  const [q, setQ] = useState('')
  const [encontradas, setEncontradas] = useState<PrendaEncontrada[]>([])
  const [buscando, setBuscando] = useState(false)
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [mas, setMas] = useState(false)
  const [qCliente, setQCliente] = useState('')
  const [clientas, setClientas] = useState<Clienta[]>([])
  const [cliente, setCliente] = useState<{ doc: string; nombre: string } | null>(null)
  const [crearCliente, setCrearCliente] = useState(false)
  const [nota, setNota] = useState('')
  const [pidePin, setPidePin] = useState(false)
  const [pin, setPin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [guardada, setGuardada] = useState<{ venta: VentaGuardada; resumen: string[] } | null>(null)
  const busquedaRef = useRef(0)

  useEffect(() => {
    let vivo = true
    leerParaCargar(marca).then((d) => { if (vivo) setDatos(d) }).catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo abrir.') })
    return () => { vivo = false }
  }, [marca])

  const canal = modo === 'local' ? 'local' : canalPasado
  const formas = useMemo(() => (datos?.formas?.[linea] ?? []).filter((f) => f.cuenta || f.opciones?.length), [datos, linea])
  const pos = formas.filter((f) => POS.includes(f.clave))
  const otras: FormaDePagoCargar[] = [
    ...formas.filter((f) => !POS.includes(f.clave)),
    ...(datos?.sueltas?.[linea] ?? []).map((c) => ({ clave: `c:${c.id}`, nombre: c.nombre, cuenta: c.id, pct: 0, rutas: {} as FormaDePagoCargar['rutas'] })),
  ]
  const todas = [...pos, ...otras]
  const formaDe = (clave: string) => todas.find((f) => f.clave === clave)
  const paso = datos?.redondeo?.[linea] ?? 0
  const enErp = datos?.enErp?.[linea] ?? false
  const reales = datos?.cuentasReales ?? []

  // La cuenta: la MISMA función que usa el servidor.
  const cuenta = useMemo(() => cuentaDeNuevaVenta({
    lineas: renglones.map((r) => ({ precio: r.precio === '' ? NaN : r.precio, cantidad: r.cantidad, descuentoPct: r.descuento === '' ? 0 : r.descuento })),
    pagos: pagos.map((p, i) => ({ base: i === pagos.length - 1 ? null : (p.base === '' ? NaN : p.base), porcentaje: p.porcentaje === '' ? 0 : p.porcentaje, redondear: POS.includes(p.forma) })),
    paso,
  }), [renglones, pagos, paso])
  const subtotal = renglones.reduce((a, r) => a + (r.precio === '' ? 0 : r.precio * r.cantidad * (1 - (r.descuento === '' ? 0 : r.descuento) / 100)), 0)
  const aCuenta = pagos.some((p) => formaDe(p.forma)?.clave === 'cuenta')
  const conCliente = !!cliente && cliente.doc.replace(/\D/g, '').length >= 7 && cliente.nombre.trim().length > 1
  const falta = !renglones.length ? 'Agregá al menos un producto.'
    : renglones.some((r) => r.precio === '') ? 'Falta el precio de algún producto.'
    : !pagos.length ? 'Elegí cómo pagó.'
    : pagos.some((p) => !p.cuenta) ? 'Elegí la cuenta de cada forma de pago.'
    : !cuenta.ok ? cuenta.error
    : aCuenta && !conCliente ? 'Para que quede debiendo hace falta el cliente (documento y nombre).'
    : modo === 'corregir' && motivo.trim().length < 3 ? 'Escribí por qué se carga ahora.'
    : null

  const agregar = async (p: PrendaEncontrada) => {
    const ya = renglones.find((r) => r.prenda.producto === p.producto && r.prenda.talle === p.talle)
    if (ya) { setRenglones((x) => x.map((y) => (y.clave === ya.clave ? { ...y, cantidad: y.cantidad + 1 } : y))); return }
    const r: Renglon = { clave: uuid(), prenda: p, cantidad: 1, precio: '', descuento: 0 }
    setRenglones((x) => [...x, r])
    try {
      const pr = await leerPrecioDeProducto(marca, p.producto)
      const fila = pr.listas.find((l) => l.lista === LISTA_DE_CANAL[canal])
      if (fila?.precio != null) setRenglones((x) => x.map((y) => (y.clave === r.clave && y.precio === '' ? { ...y, precio: Number(fila.precio) } : y)))
    } catch { /* sin precio: se escribe a mano */ }
  }

  // Buscar mientras se escribe (y Enter, o el escáner, que termina en Enter).
  const buscar = async (texto: string) => {
    const t = texto.trim()
    if (t.length < 3) { setEncontradas([]); return }
    const n = ++busquedaRef.current
    setBuscando(true)
    try {
      const r = await buscarPrendas(marca, t)
      if (n !== busquedaRef.current) return
      const vs = marca === 'bdi' ? r.variantes : deLaTienda(r.variantes, linea === 'stunned' ? 'stunned' : 'zattia')
      // Un escaneo que da UNA sola prenda se agrega solo.
      if (/^\d{8,}$/.test(t) && vs.length === 1) { void agregar(vs[0]); return }
      setEncontradas(vs)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo buscar.') } finally { if (n === busquedaRef.current) setBuscando(false) }
  }
  useEffect(() => {
    const t = setTimeout(() => { void buscar(q) }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const realDe = (f: FormaDePagoCargar | undefined) => f?.rutas?.[canal]?.cuentaId ?? ''
  const elegirForma = (i: number, clave: string, opcion = 'normal') => {
    const f = formaDe(clave)
    if (!f) return
    const op = f.opciones?.find((o) => o.clave === opcion)
    setPagos((x) => {
      const nuevo: Pago = { clave: x[i]?.clave ?? uuid(), forma: clave, opcion, cuenta: op?.cuenta ?? f.cuenta ?? '', porcentaje: op?.pct ?? f.pct ?? 0, base: x[i]?.base ?? '', real: realDe(f) }
      return x.length > i ? x.map((y, j) => (j === i ? nuevo : y)) : [...x, nuevo]
    })
    setMas(false)
  }
  const cambiarPago = (i: number, c: Partial<Pago>) => setPagos((x) => x.map((y, j) => (j === i ? { ...y, ...c } : y)))

  const buscarCliente = async () => {
    if (qCliente.trim().length < 2) return
    try { setClientas((await buscarClientas(marca, qCliente.trim())).clientas) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo buscar el cliente.') }
  }

  const enviar = async () => {
    if (falta || enviando || !cuenta.ok) return
    setEnviando(true)
    setError(null)
    try {
      const r = await cargarVenta(marca, {
        linea, origen_ref: clave, canal, deposito, modo, paso,
        ...(modo === 'corregir' ? { ocurrida_en: new Date(`${fecha}T12:00:00-03:00`).toISOString(), motivo: motivo.trim() } : {}),
        ...(conCliente ? { cliente: { doc: cliente!.doc.replace(/\D/g, ''), nombre: cliente!.nombre.trim() } } : {}),
        lineas: renglones.map((x) => ({ producto: x.prenda.producto, talle: x.prenda.talle, cantidad: x.cantidad, precio: Number(x.precio), descuento_pct: x.descuento === '' ? 0 : x.descuento, sku: x.prenda.sku, barcode: x.prenda.barcode })),
        pagos: pagos.map((p, i) => {
          const f = formaDe(p.forma)
          const cambiada = !!p.real && p.real !== realDe(f)
          return { cuenta: p.cuenta, base: i === pagos.length - 1 ? null : Number(p.base), porcentaje: p.porcentaje === '' ? 0 : p.porcentaje, redondear: POS.includes(p.forma), ...(cambiada ? { cuenta_real: p.real } : {}) }
        }),
        nota: nota.trim() || undefined,
        ...(pidePin && pin ? { pin } : {}),
      })
      const v = r.venta
      const resumen = [
        `${DEPOSITO[deposito] ?? deposito}: ${renglones.map((x) => `${x.prenda.nombre ?? 'Producto'} ${x.prenda.talleNombre ?? ''} −${x.cantidad}`).join(' · ')}`,
        pagos.map((p, i) => {
          const f = formaDe(p.forma)
          const realNombre = reales.find((c) => c.id === p.real)?.nombre
          return `${$(cuenta.ok ? cuenta.pagos[i].monto : 0)} ${f?.nombre ?? ''}${p.porcentaje ? ` (−${p.porcentaje} %)` : ''}${realNombre ? ` a ${realNombre}` : ''}`
        }).join(' · '),
        'No suma a la caja',
        ...(r.avisos.some((a) => a.codigo === 'CUENTA_REAL_SIN_CAMBIAR') ? ['⚠️ La cuenta elegida en «Entra a» no se pudo poner: quedó la de la configuración. Corregila desde la venta.'] : []),
      ]
      setGuardada({ venta: v, resumen })
      onGuardada(`${r.yaExistia ? 'Ya estaba guardada' : 'Guardada'}: venta ${v.numero} por ${$(v.total)}${v.prueba ? ' (de prueba)' : ''}.`)
    } catch (e) {
      const codigo = (e as { codigo?: string }).codigo
      if (codigo && FRENOS_DE_CUENTA.includes(codigo)) setPidePin(true)
      if (pidePin) setPin('')
      setError(e instanceof Error ? e.message : 'No se pudo guardar la venta.')
    } finally { setEnviando(false) }
  }

  const otraVenta = () => {
    setClave(uuid()); setGuardada(null); setRenglones([]); setPagos([]); setCliente(null); setQCliente(''); setNota(''); setMotivo(''); setPidePin(false); setPin(''); setQ(''); setEncontradas([])
  }

  // ── Guardada ──
  if (guardada) {
    const v = guardada.venta
    return (
      <section aria-label="Venta guardada" style={{ ...tarjeta, maxWidth: 640 }}>
        <h2 style={{ margin: 0, fontSize: font['2xl'], color: color.ink }}>Venta #{v.numero} guardada{v.prueba ? ' (de prueba)' : ''}</h2>
        <span style={chico}>{MARCA[linea] ?? linea} · {CANAL[canal] ?? canal} · {$(v.total)}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], fontSize: font.md, color: color.ink }}>
          {guardada.resumen.map((t) => <span key={t}>{t}</span>)}
        </div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <Button onClick={otraVenta}>Nueva venta</Button>
          {puede('facturar-venta') && !v.prueba && <Button variant="outline" onClick={() => onFacturar(v)}>Facturar</Button>}
          <Button variant="outline" onClick={() => onVer(v)}>Ver la venta</Button>
          <Button variant="ghost" onClick={onCerrar}>Volver a Ventas</Button>
        </div>
      </section>
    )
  }

  const fila: React.CSSProperties = { display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }
  const deposDe = (p: PrendaEncontrada) => p.porDeposito?.[deposito] ?? 0
  // Las encontradas, agrupadas por producto con sus talles.
  const grupos = [...encontradas.reduce((m, p) => m.set(p.producto, [...(m.get(p.producto) ?? []), p]), new Map<string, PrendaEncontrada[]>()).values()].slice(0, 20)
  const botonForma = (activa: boolean): React.CSSProperties => ({ height: 64, borderRadius: radius.lg, border: activa ? `2px solid ${color.brandSolid}` : `1px solid ${color.line2}`, background: activa ? color.brandBg : color.surface, color: activa ? color.brand : color.ink, fontSize: font.md, fontWeight: 600, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: font['2xl'], color: color.ink }}>Nueva venta</h2>
        <div role="tablist" aria-label="Qué estás cargando" style={{ display: 'flex', gap: space[1], background: color.bg2, borderRadius: radius.lg, padding: space[1] }}>
          {([['local', 'Venta del local'], ...(puede('venta-pasada') ? [['corregir', 'Corregir una venta pasada']] : [])] as Array<[typeof modo, string]>).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={modo === k} onClick={() => setModo(k)}
              style={{ height: 36, padding: '0 14px', border: 0, borderRadius: radius.md, background: modo === k ? color.surface : 'transparent', fontWeight: modo === k ? 600 : 500, color: color.ink, cursor: 'pointer' }}>{t}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          {(datos?.lineas.length ?? 0) > 1 && (
            <Select aria-label="Línea" value={linea} disabled={renglones.length > 0} onChange={(e) => { setLinea(e.target.value); setPagos([]) }}>
              {datos!.lineas.map((l) => <option key={l} value={l}>{MARCA[l] ?? l}</option>)}
            </Select>
          )}
          <label style={{ display: 'flex', gap: space[1.5], alignItems: 'center', ...rotulo }}>Sale de
            <Select aria-label="Sale de" value={deposito} onChange={(e) => setDeposito(e.target.value)}>
              {(datos?.depositos ?? ['local']).map((d) => <option key={d} value={d}>{DEPOSITO[d] ?? d}</option>)}
            </Select>
          </label>
          <span style={chico}>{modo === 'local' ? 'Hoy · ' : ''}<b>no suma a la caja</b></span>
          <Button variant="ghost" onClick={onCerrar}>Volver a Ventas</Button>
        </div>
      </header>

      {datos && !enErp && <Notice tone="warning">{MARCA[linea] ?? linea} todavía no vende por Areben Gestión: esta venta queda <b>de prueba</b> (no mueve el stock ni pasa a Gestión Nube).</Notice>}
      {datos && !datos.manualHabilitado && <Notice tone="danger">La base de esta marca todavía no acepta ventas a mano.</Notice>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      {modo === 'corregir' && (
        <section aria-label="Cuándo y por qué" style={{ ...tarjeta, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Cuándo fue"><Input type="date" value={fecha} max={hoyAR()} onChange={(e) => setFecha(e.target.value)} /></Field>
          <Field label="Por dónde se vendió">
            <Select value={canalPasado} onChange={(e) => setCanalPasado(e.target.value)}>
              {(datos?.canales ?? ['local']).map((c) => <option key={c} value={c}>{CANAL[c] ?? c}</option>)}
            </Select>
          </Field>
          <div style={{ flex: '1 1 320px' }}><Field label="Por qué se carga ahora (obligatorio)"><Input value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se cobró por transferencia y no se cargó en la caja" /></Field></div>
          <p style={{ ...chico, flexBasis: '100%', margin: 0 }}>Queda con esa fecha, descuenta el stock desde hoy y no suma a ninguna caja. En Ventas se ve como «Manual» con el motivo.</p>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: space[4], alignItems: 'start' }}>
        <section aria-label="Productos" style={tarjeta}>
          <Field label="Escaneá o buscá el producto">
            <Input aria-label="Buscar producto" autoFocus placeholder="código, código de barras o nombre" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void buscar(q) }} style={{ height: 48, fontSize: font.lg }} />
          </Field>
          {buscando && <span style={chico}>Buscando…</span>}
          {!buscando && q.trim().length >= 3 && !grupos.length && <span style={chico}>No se encontró ese producto.</span>}
          {grupos.length > 0 && <span style={chico}>El stock es el de <b>{DEPOSITO[deposito] ?? deposito}</b>, de donde sale la venta.</span>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {grupos.map((vs) => (
              <div key={vs[0].producto} style={{ border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3], display: 'flex', flexDirection: 'column', gap: space[2] }}>
                <span style={{ fontWeight: 600, color: color.ink }}>{vs[0].nombre ?? 'Sin nombre'} <span style={chico}>{vs[0].sku ?? ''}</span></span>
                <div style={{ display: 'flex', gap: space[1.5], flexWrap: 'wrap' }}>
                  {vs.map((p) => (
                    <button key={p.talle} onClick={() => void agregar(p)} aria-label={`Agregar ${p.nombre ?? ''} ${p.talleNombre ?? ''}`}
                      style={{ height: 36, minWidth: 48, padding: '0 10px', borderRadius: radius.md, border: `1px solid ${deposDe(p) > 0 ? color.line2 : color.line}`, background: deposDe(p) > 0 ? color.surface : color.bg, color: deposDe(p) > 0 ? color.ink : color.mut, cursor: 'pointer' }}>
                      {p.talleNombre ?? '—'} <span style={{ color: color.mut }}>· {deposDe(p)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Ticket" style={tarjeta}>
          <span style={rotulo}>Ticket</span>
          {!renglones.length && <span style={chico}>Todavía no hay productos.</span>}
          {renglones.map((r) => {
            const importe = r.precio === '' ? 0 : r.precio * r.cantidad * (1 - (r.descuento === '' ? 0 : r.descuento) / 100)
            return (
              <div key={r.clave} style={{ border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3], display: 'flex', flexDirection: 'column', gap: space[2] }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], alignItems: 'center' }}>
                  <span style={{ color: color.ink }}>{r.prenda.nombre} <span style={{ color: color.mut }}>{r.prenda.talleNombre}</span></span>
                  <Button variant="ghost" size="sm" onClick={() => setRenglones((x) => x.filter((y) => y.clave !== r.clave))}>Sacar</Button>
                </div>
                <div style={fila}>
                  <Field label="Cantidad"><Input aria-label="Cantidad" type="number" min={1} step={1} value={r.cantidad} style={{ width: 80 }}
                    onChange={(e) => setRenglones((x) => x.map((y) => (y.clave === r.clave ? { ...y, cantidad: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : y)))} /></Field>
                  <Field label="Precio de lista"><Input aria-label="Precio de lista" type="number" min={0} step="0.01" value={r.precio} style={{ width: 120 }}
                    onChange={(e) => setRenglones((x) => x.map((y) => (y.clave === r.clave ? { ...y, precio: num(e.target.value) } : y)))} /></Field>
                  <Field label="Desc. %"><Input aria-label="Descuento %" type="number" min={0} max={100} step="1" value={r.descuento} style={{ width: 80 }}
                    onChange={(e) => setRenglones((x) => x.map((y) => (y.clave === r.clave ? { ...y, descuento: num(e.target.value) } : y)))} /></Field>
                  <b style={{ marginLeft: 'auto', color: color.ink, paddingBottom: 8 }}>{$(Math.round(importe * 100) / 100)}</b>
                </div>
              </div>
            )
          })}

          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            <span style={rotulo}>Cómo pagó</span>
            {[0, ...(pagos.length > 1 ? [1] : [])].map((i) => {
              const p = pagos[i]
              const f = p ? formaDe(p.forma) : undefined
              const plata = !!f && f.clave !== 'cuenta' && f.clave !== 'entrega'
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: space[2], ...(i > 0 ? { borderTop: `1px solid ${color.line}`, paddingTop: space[2] } : {}) }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: space[2] }}>
                    {pos.map((x) => (
                      <button key={x.clave} onClick={() => elegirForma(i, x.clave)} style={botonForma(p?.forma === x.clave)} aria-pressed={p?.forma === x.clave}>
                        {x.nombre}<span style={{ fontSize: font.sm, fontWeight: 500, color: x.pct ? color.successInk : color.mut }}>{x.pct ? `−${x.pct} %` : 'lista'}</span>
                      </button>
                    ))}
                  </div>
                  {f && !POS.includes(f.clave) && <span style={{ color: color.ink }}>Forma de pago: <b>{f.nombre}</b></span>}
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setMas((m) => !m)}>Más: {otras.map((o) => o.nombre).join(' · ') || 'nada más'}</Button>
                  </div>
                  {mas && (
                    <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                      {otras.map((o) => <Button key={o.clave} variant="outline" size="sm" onClick={() => elegirForma(i, o.clave)}>{o.nombre}</Button>)}
                    </div>
                  )}
                  {p && (
                    <div style={{ ...fila, background: color.bg, borderRadius: radius.md, padding: space[2] }}>
                      {f?.opciones && f.opciones.length > 1 && (
                        <Field label="Crédito"><Select value={p.opcion} onChange={(e) => elegirForma(i, p.forma, e.target.value)}>
                          {f.opciones.map((o) => <option key={o.clave} value={o.clave}>{o.nombre}</option>)}
                        </Select></Field>
                      )}
                      {i < pagos.length - 1 && <Field label="Cuánto paga así (de lista)"><Input type="number" min={0} step="0.01" value={p.base} style={{ width: 120 }} onChange={(e) => cambiarPago(i, { base: num(e.target.value) })} /></Field>}
                      <Field label="Descuento %"><Input aria-label="Porcentaje de la forma de pago" type="number" min={0} max={100} step="0.5" value={p.porcentaje} style={{ width: 80 }} onChange={(e) => cambiarPago(i, { porcentaje: num(e.target.value) })} /></Field>
                      {plata && (
                        <Field label="Entra a"><Select aria-label="Cuenta del pago" value={p.real} onChange={(e) => cambiarPago(i, { real: e.target.value })}>
                          {!realDe(f) && <option value="">Sin cuenta en la configuración: elegí</option>}
                          {reales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </Select></Field>
                      )}
                      {cuenta.ok && cuenta.pagos[i] && <b style={{ marginLeft: 'auto', color: color.ink, paddingBottom: 8 }}>{$(cuenta.pagos[i].monto)}</b>}
                    </div>
                  )}
                </div>
              )
            })}
            {pagos.length === 1 && <div><Button variant="ghost" size="sm" onClick={() => { const f = formaDe(pagos[0].forma); setPagos((x) => [{ ...x[0], base: Math.round(subtotal / 2) }, { clave: uuid(), forma: x[0].forma, opcion: x[0].opcion, cuenta: x[0].cuenta, porcentaje: x[0].porcentaje, base: '', real: realDe(f) }]) }}>Pagó con dos formas</Button></div>}
            {pagos.length > 1 && <div><Button variant="ghost" size="sm" onClick={() => setPagos((x) => [{ ...x[0], base: '' }])}>Una sola forma</Button></div>}
            {aCuenta && pidePin && (
              <Field label="PIN de admin"><Input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} style={{ width: 140 }} aria-label="PIN de admin" /></Field>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], borderTop: `1px solid ${color.line}`, paddingTop: space[3], color: color.ink2 }}>
            {cuenta.ok && <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{$(cuenta.subtotal)}</span></div>
              {cuenta.pagos.map((x, i) => x.descuento ? <div key={`d${i}`} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{formaDe(pagos[i]?.forma)?.nombre} −{x.porcentaje} %</span><span>− {$(x.descuento)}</span></div> : null)}
              {cuenta.pagos.some((x) => x.redondeo) && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.sm, color: color.mut }}><span>Redondeo</span><span>{$(cuenta.pagos.reduce((a, x) => a + x.redondeo, 0))}</span></div>}
            </>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span>Total</span><b style={{ fontSize: font['3xl'], color: color.ink }}>{$(cuenta.ok ? cuenta.total : Math.round(subtotal * 100) / 100)}</b>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            <span style={rotulo}>Cliente <span style={{ fontWeight: 400, color: color.mut }}>(opcional; hace falta si queda debiendo)</span></span>
            {cliente && !crearCliente ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: color.ink }}>{cliente.nombre}{cliente.doc ? ` · ${cliente.doc}` : ' · sin documento'}</span>
                <Button variant="ghost" size="sm" onClick={() => setCliente(null)}>Cambiar</Button>
              </div>
            ) : (
              <>
                <div style={fila}>
                  <Input aria-label="Buscar cliente" placeholder="Nombre o documento" value={qCliente} onChange={(e) => setQCliente(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void buscarCliente() }} style={{ flex: '1 1 180px' }} />
                  <Button variant="outline" onClick={() => void buscarCliente()}>Buscar</Button>
                  <Button variant="ghost" onClick={() => { setCrearCliente(true); setCliente({ doc: '', nombre: qCliente }) }}>Crear cliente</Button>
                </div>
                {clientas.map((c) => (
                  <Button key={c.doc ?? c.nombre} variant="ghost" style={{ justifyContent: 'flex-start', height: 'auto' }} onClick={() => { setCliente({ doc: c.doc ?? '', nombre: c.nombre }); setClientas([]) }}>{c.nombre}{c.doc ? ` · ${c.doc}` : ' · sin documento'}</Button>
                ))}
                {crearCliente && cliente && (
                  <div style={fila}>
                    <Field label="Documento"><Input inputMode="numeric" value={cliente.doc} onChange={(e) => setCliente({ ...cliente, doc: e.target.value })} style={{ width: 140 }} /></Field>
                    <Field label="Nombre"><Input value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} style={{ width: 220 }} /></Field>
                    <Button variant="ghost" onClick={() => setCrearCliente(false)}>Listo</Button>
                  </div>
                )}
              </>
            )}
          </div>

          <Field label="Nota (opcional)"><Input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} /></Field>

          {falta && renglones.length > 0 && <p style={{ margin: 0, color: color.mut }}>{falta}</p>}
          <Button size="lg" disabled={!!falta || enviando || !datos?.manualHabilitado || (aCuenta && pidePin && pin.length < 4)} onClick={() => void enviar()}>
            {enviando ? 'Guardando…' : `${pidePin && aCuenta ? 'Autorizar y guardar' : 'Guardar venta'}${cuenta.ok ? ` · ${$(cuenta.total)}` : ''}`}
          </Button>
          <p style={{ ...chico, margin: 0, textAlign: 'center' }}>Sale de {DEPOSITO[deposito] ?? deposito} · no suma a la caja · en Ventas se ve como «Manual»</p>
        </section>
      </div>
    </div>
  )
}
