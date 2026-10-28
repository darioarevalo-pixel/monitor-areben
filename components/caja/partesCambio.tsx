'use client'

/**
 * Las piezas del modo «Cambios» del POS (maqueta que aprobó Bruno el 27-oct: `maqueta-cambio-pos.html`). Todo el estado y las
 * cuentas viven en `useCambio`; acá sólo se dibuja. Estética del POS (tokens de `app/tokens.css`), ⛔ la del ERP.
 */

import { useEffect, useState } from 'react'
import { Badge, Button, Card, Field, Input, Modal, Notice, NumberField, PasoCantidad, Select, color, font, radius, space, weight } from '@/components/ui'
import { NOMBRE_MEDIO } from '@/lib/caja/core.core.js'
import { plata } from '@/lib/caja/ticket'
import { leerPines, type MarcaErp } from '@/lib/erp/cliente'
import { cuandoCorto } from '@/components/ui/PiezasLista'
import { MEDIOS_CAMBIO, buscarVentasDelCambio, type Cambio, type FilaVenta, type Origen, type VentaOriginal } from '@/components/caja/useCambio'

const tabular = { fontVariantNumeric: 'tabular-nums' as const }

/** La banda naranja de abajo de la cabecera: en qué paso está el cambio y qué sigue. */
export function BandaCambio({ paso, c, onBuscar, onSiguiente, onVolver, onSalir }: { paso: 1 | 2; c: Cambio; onBuscar: () => void; onSiguiente: () => void; onVolver: () => void; onSalir: () => void }) {
  const pasoStyle = (n: number) => ({ fontWeight: n === paso ? weight.bold : weight.medium, opacity: n === paso ? 1 : 0.7 })
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: `${space[2]}px ${space[4]}px`, padding: `${space[2]}px ${space[4]}px`, background: color.warningBg, borderBottom: `1px solid ${color.warningBorder}`, color: color.warningInk }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], fontSize: font.md }}>
        <span style={pasoStyle(1)}>1 Lo que devuelve</span>
        <span aria-hidden="true">▸</span>
        <span style={pasoStyle(2)}>2 Lo que se lleva</span>
      </span>
      <span style={{ flex: '1 1 260px', fontSize: font.base }}>
        {paso === 1 ? 'Tocá o escaneá lo que la clienta devuelve, o buscá la venta original.' : 'Tocá o escaneá lo que se lleva.'}
      </span>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        {paso === 1 ? (
          <>
            <Button variant="outline" onClick={onBuscar}>Buscar la venta</Button>
            <Button variant="solid" tone="brand" onClick={onSiguiente} disabled={!c.devueltas.length || c.trabajando}>Siguiente →</Button>
          </>
        ) : (
          <Button variant="outline" onClick={onVolver}>← Lo que devuelve</Button>
        )}
        <Button variant="outline" tone="danger" onClick={onSalir}>Salir del cambio</Button>
      </div>
    </div>
  )
}

/** La venta que se está mirando en el modal, con sus productos. */
type Mirando = VentaOriginal & { total: number }

const rotuloDe = (o: Origen) => (o.tipo === 'gn' ? 'Gestión Nube' : 'ERP')

/**
 * «Venta original del cambio»: se busca por número de venta (de Gestión Nube o del ERP) o por cliente (las del ERP). Al elegir una,
 * cada producto muestra lo que se pagó y cuántas unidades se devuelven. Se toma lo pagado, ⛔ el precio de hoy.
 */
export function ModalVentaOriginal({ store, c, onCerrar }: { store: MarcaErp; c: Cambio; onCerrar: () => void }) {
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<FilaVenta[] | null>(null)
  const [mirando, setMirando] = useState<Mirando | null>(null)
  const [cant, setCant] = useState<Record<string, number>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  async function buscar() {
    setBuscando(true)
    setAviso(null)
    setMirando(null)
    try {
      const r = await buscarVentasDelCambio(store, q, { gn: true, soloStunned: true })
      setLista(r.filas)
      setAviso(r.aviso)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo buscar.')
    } finally {
      setBuscando(false)
    }
  }

  async function abrir(f: FilaVenta) {
    setBuscando(true)
    try {
      setMirando(await f.abrir())
      setCant({})
      setAviso(null)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo leer la venta.')
    } finally {
      setBuscando(false)
    }
  }

  function agregar() {
    if (!mirando) return
    try {
      c.devolverDeVenta(mirando, cant)
      c.setError(null)
      onCerrar()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo agregar.')
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Venta original del cambio" ancho="xl" cerrarConFondo={false}
      pie={mirando ? (
        <>
          <Button variant="outline" onClick={() => { setMirando(null); setAviso(null) }}>← Elegir otra venta</Button>
          <Button variant="solid" tone="brand" onClick={agregar} disabled={!Object.values(cant).some((n) => n > 0)}>Agregar a la devolución</Button>
        </>
      ) : <Button variant="outline" onClick={onCerrar}>Cerrar</Button>}>
      <div style={{ display: 'grid', gap: space[3] }}>
        {!mirando && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); void buscar() }} style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
              <Field label="Venta" style={{ flex: 1 }}>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscala por número de venta, de factura o por cliente" autoFocus />
              </Field>
              <Button type="submit" variant="solid" tone="brand" loading={buscando}>Buscar</Button>
            </form>
            {aviso && <Notice tone="warning">{aviso}</Notice>}
            {lista && lista.length > 0 && (
              <div style={{ display: 'grid', gap: space[2] }}>
                {lista.map((f) => (
                  <button key={f.clave} type="button" onClick={() => void abrir(f)} style={{ height: 'auto', display: 'flex', alignItems: 'center', gap: space[3], textAlign: 'left', padding: `${space[2]}px ${space[3]}px`, border: `1px solid ${color.line}`, borderRadius: radius.lg, background: color.surface, cursor: 'pointer', color: color.ink }}>
                    <b style={{ minWidth: 64 }}>#{f.numero}</b>
                    <span style={{ flex: 1, minWidth: 0 }}>{f.cliente ?? 'Consumidor final'}</span>
                    <Badge tone={f.rotulo === 'ERP' ? 'brand' : 'neutral'}>{f.rotulo}</Badge>
                    {f.prueba && <Badge tone="warning">Prueba</Badge>}
                    <span style={{ color: color.mut, fontSize: font.sm }}>{f.fecha ? cuandoCorto(f.fecha) : ''}</span>
                    <b style={tabular}>{plata(f.total)}</b>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {mirando && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
              <b style={{ fontSize: font.lg }}>Venta #{mirando.origen.tipo === 'suelto' ? '' : mirando.origen.numero}</b>
              <Badge tone="neutral">{rotuloDe(mirando.origen)}</Badge>
              <span style={{ color: color.mut }}>{mirando.origen.tipo !== 'suelto' && mirando.origen.cliente ? mirando.origen.cliente : 'Consumidor final'}</span>
              <span style={{ marginLeft: 'auto', ...tabular }}><b>{plata(mirando.total)}</b></span>
            </div>
            <span style={{ color: color.mut, fontSize: font.sm }}>Se toma lo que pagó por cada producto; el cambio se guarda sin comprobantes.</span>
            {mirando.vendidas.map((l) => {
              const tope = Math.max(0, l.cantidad - l.cambiado)
              return (
                <div key={l.clave} style={{ display: 'flex', alignItems: 'center', gap: space[3], padding: `${space[2]}px ${space[3]}px`, border: `1px solid ${color.line}`, borderRadius: radius.lg }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: weight.semibold }}>{l.nombre} · {l.talle}</div>
                    <div style={{ color: color.mut, fontSize: font.sm, ...tabular }}>{plata(l.precio)} c/u · vendió {l.cantidad} · ya cambiadas {l.cambiado}</div>
                  </div>
                  {tope > 0
                    ? <PasoCantidad valor={cant[l.clave] || 0} onCambio={(n) => setCant((x) => ({ ...x, [l.clave]: Math.min(tope, n) }))} etiqueta="producto devuelto" etiquetaPlural="productos devueltos" />
                    : <Badge tone="neutral">Ya cambiada</Badge>}
                </div>
              )
            })}
            {aviso && <Notice tone="danger">{aviso}</Notice>}
          </>
        )}
      </div>
    </Modal>
  )
}

/**
 * «Autoriza la encargada»: un cambio sin venta pide el PIN (4 dígitos). La encargada se elige de la lista de quienes tienen PIN
 * (que sólo lee un administrador); si no se puede leer, se escribe su usuario del monitor.
 */
export function ModalEncargada({ c, onCerrar, onListo }: { c: Cambio; onCerrar: () => void; onListo: () => void }) {
  const [personas, setPersonas] = useState<string[] | null>(null)
  useEffect(() => {
    let vivo = true
    leerPines('zattia').then((r) => vivo && setPersonas(r.pines.filter((p) => p.pin).map((p) => p.usuario))).catch(() => vivo && setPersonas([]))
    return () => { vivo = false }
  }, [])
  const e = c.encargada
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Autoriza la encargada" cerrarConFondo={false}
      pie={
        <>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" tone="brand" disabled={c.faltaPin} loading={c.trabajando} onClick={() => { void c.probarPin().then((ok) => { if (ok) onListo() }) }}>Autorizar</Button>
        </>
      }>
      <form onSubmit={(ev) => { ev.preventDefault(); if (!c.faltaPin) void c.probarPin().then((ok) => { if (ok) onListo() }) }} style={{ display: 'grid', gap: space[3] }}>
        <span style={{ color: color.mut }}>Un cambio sin venta lo autoriza la encargada con su PIN.</span>
        <Field label="Encargada">
          {personas && personas.length > 0
            ? <Select value={e.persona} onChange={(ev) => c.setEncargada({ ...e, persona: ev.target.value })}><option value="">Elegir…</option>{personas.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
            : <Input value={e.persona} onChange={(ev) => c.setEncargada({ ...e, persona: ev.target.value })} placeholder="Su usuario del monitor" autoComplete="off" />}
        </Field>
        <Field label="PIN de 4 dígitos">
          <Input type="password" inputMode="numeric" maxLength={4} value={e.pin} onChange={(ev) => c.setEncargada({ ...e, pin: ev.target.value.replace(/\D/g, '').slice(0, 4) })} autoComplete="off" autoFocus style={{ letterSpacing: '0.4em', width: 120 }} />
        </Field>
        {c.error && <Notice tone="danger">{c.error}</Notice>}
      </form>
    </Modal>
  )
}

/** El pedido del cambio (la tarjeta fija de la derecha): lo que devuelve, lo que se lleva y el total siempre abajo. */
export function PedidoCambio({ paso, c, onCobro, puedeCobrar }: { paso: 1 | 2; c: Cambio; onCobro: () => void; puedeCobrar: boolean }) {
  const fila = (izq: React.ReactNode, der: React.ReactNode, fuerte = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2], fontSize: fuerte ? font.lg : font.md, fontWeight: fuerte ? weight.bold : undefined }}>
      <span>{izq}</span><span style={tabular}>{der}</span>
    </div>
  )
  const sinVenta = c.tipo === 'suelto'
  const seguro = c.diferencia
  return (
    <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ padding: `${space[3]}px ${space[4]}px`, borderBottom: `1px solid ${color.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <h2 style={{ margin: 0, fontSize: font.lg, fontWeight: weight.bold, color: color.ink }}>Cambio</h2>
        {c.origen && c.origen.tipo !== 'suelto' && <Badge tone="neutral">{rotuloDe(c.origen)} #{c.origen.numero}</Badge>}
        {sinVenta && <Badge tone="warning">Sin venta</Badge>}
      </div>
      <div className="pos-renglones" style={{ padding: `0 ${space[4]}px ${space[3]}px` }}>
        <div style={{ margin: `${space[3]}px 0 ${space[1]}px`, fontWeight: weight.heavy, fontSize: font.sm, letterSpacing: '.05em', color: color.danger }}>DEVUELVE</div>
        {!c.devueltas.length
          ? <div style={{ color: color.mut, fontSize: font.base, padding: `${space[2]}px 0` }}>Todavía no hay nada devuelto.</div>
          : c.devueltas.map((d) => (
            <div key={d.clave} style={{ display: 'grid', gap: space[1], padding: `${space[2]}px 0`, borderBottom: `1px solid ${color.line}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2] }}>
                <span style={{ fontWeight: weight.semibold, minWidth: 0 }}>{d.nombre} · {d.talle}</span>
                <span style={{ color: color.danger, ...tabular }}>− {plata(Number(d.precio || 0) * d.cantidad)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                {paso === 1
                  ? <PasoCantidad valor={d.cantidad} onCambio={(n) => { try { c.cambiarCantidadDevuelta(d.clave, n); c.setError(null) } catch (e) { c.setError(e instanceof Error ? e.message : 'No se puede devolver ese producto.') } }} etiqueta="producto devuelto" etiquetaPlural="productos devueltos" />
                  : <span style={{ color: color.mut }}>{d.cantidad} {d.cantidad === 1 ? 'unidad' : 'unidades'}</span>}
                {sinVenta && paso === 1
                  ? <NumberField value={d.precio} prefix="$" onChange={(p) => c.ponerPrecioDevuelta(d.clave, p)} invalid={!(Number(d.precio) > 0)} width={120} placeholder="Lo que pagó" />
                  : <Badge tone={sinVenta ? 'warning' : 'neutral'}>{sinVenta ? 'Sin venta' : `${plata(Number(d.precio || 0))} c/u`}</Badge>}
              </div>
            </div>
          ))}
        {paso === 2 && (
          <>
            <div style={{ margin: `${space[3]}px 0 ${space[1]}px`, fontWeight: weight.heavy, fontSize: font.sm, letterSpacing: '.05em', color: color.successInk }}>SE LLEVA</div>
            {!c.nuevas.length
              ? <div style={{ color: color.mut, fontSize: font.base, padding: `${space[2]}px 0` }}>Tocá o escaneá lo que se lleva.</div>
              : c.nuevas.map((n, i) => (
                <div key={`${n.variante.product_id}/${n.variante.size_id}`} style={{ display: 'grid', gap: space[1], padding: `${space[2]}px 0`, borderBottom: `1px solid ${color.line}` }}>
                  <span style={{ fontWeight: weight.semibold }}>{n.variante.product_name} · {n.variante.size_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                    <PasoCantidad valor={n.cantidad} onCambio={(x) => c.cambiarCantidadNueva(i, x)} etiqueta="producto" etiquetaPlural="productos" />
                    <NumberField value={n.precio} prefix="$" onChange={(p) => c.cambiarNueva(i, { precio: p })} invalid={!(Number(n.precio) > 0)} width={120} />
                  </div>
                </div>
              ))}
          </>
        )}
      </div>
      <div style={{ flexShrink: 0, display: 'grid', gap: space[2], padding: `${space[3]}px ${space[4]}px ${space[4]}px`, borderTop: `1px solid ${color.line}`, background: color.bg }}>
        {c.error && <Notice tone="danger" onClose={() => c.setError(null)}>{c.error}</Notice>}
        {paso === 1
          ? (
            // 🔑 El total sólo se calcula en el paso 2, con lo que se lleva (Bruno, 27-oct): acá nada de «queda a favor».
            fila('Devuelve', plata(c.vuelve), true)
          )
          : (
            <>
              {fila('Devuelve', <span style={{ color: color.danger }}>− {plata(c.vuelve)}</span>)}
              {fila('Se lleva', plata(c.seLleva))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space[2], borderTop: `1px dashed ${color.line2}` }}>
                <span style={{ fontWeight: weight.heavy, fontSize: font.md, letterSpacing: '.05em', color: color.ink }}>{seguro > 0 ? 'DIFERENCIA A COBRAR' : seguro < 0 ? 'QUEDA A FAVOR (SALDO)' : 'SIN DIFERENCIA'}</span>
                <span style={{ fontSize: 32, fontWeight: weight.heavy, letterSpacing: '-.02em', lineHeight: 1, color: color.brand, ...tabular }}>{plata(Math.abs(seguro))}</span>
              </div>
              <Button size="lg" tone="success" variant="solid" fullWidth disabled={!puedeCobrar} onClick={onCobro} style={{ height: 52 }}>
                Continuar al cobro <span className="pos-alt">Alt+C</span>
              </Button>
            </>
          )}
        {c.sinPrecio && <Notice tone="warning">Falta el precio de un producto que se lleva.</Notice>}
      </div>
    </Card>
  )
}

/**
 * El cobro del cambio: la clienta (DNI y nombre si queda saldo o se usa el que tiene), el saldo, la forma de pago de la diferencia
 * y confirmar. Si la diferencia es por transferencia, se espera el pago como en la Caja.
 */
export function ModalCobroCambio({ c, onCerrar }: { c: Cambio; onCerrar: () => void }) {
  const { diferencia, aFavor, saldoUsado, resto, cobrado, reglas } = c
  const espera = c.espera
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Cobro del cambio" ancho="xl" cerrarConFondo={false}
      pie={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={c.trabajando}>Volver</Button>
          {!espera && <Button variant="solid" tone="success" disabled={!c.listo || c.trabajando || (resto > 0 && !c.cuenta)} loading={c.trabajando} onClick={() => void c.confirmar()}>{cobrado.espera > 0 ? 'Esperar la transferencia' : 'Confirmar cambio'}</Button>}
        </>
      }>
      <div style={{ display: 'grid', gap: space[3] }}>
        <div style={{ fontSize: font.lg }}>
          {diferencia > 0
            ? <>
              {saldoUsado > 0 && <>Con saldo a favor: <b>{plata(saldoUsado)}</b> · </>}
              {resto > 0 && (cobrado.total > 0 && cobrado.total - saldoUsado !== resto
                ? <>A pagar: <b>{plata(cobrado.total - saldoUsado)}</b> <span style={{ fontSize: font.base }}>({plata(resto)} con el descuento de la forma de pago)</span></>
                : <>A pagar: <b>{plata(resto)}</b></>)}
            </>
            : diferencia < 0 ? <>Queda a favor de la clienta: <b>{plata(aFavor)}</b></> : 'Sin diferencia'}
        </div>
        {diferencia > 0 && resto > 0 && (
          <Field label={saldoUsado > 0 ? 'Forma de pago del resto' : 'Forma de pago'}>
            <Select value={c.medio} onChange={(e) => c.setMedio(e.target.value as typeof c.medio)} disabled={!!espera}>
              <option value="">Elegir…</option>
              {MEDIOS_CAMBIO.filter((m) => reglas?.medios?.[m]).map((m) => <option key={m} value={m}>{NOMBRE_MEDIO[m]}</option>)}
            </Select>
          </Field>
        )}
        {(aFavor > 0 || diferencia > 0) && (
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* El saldo se busca por DNI: se tipea, así que se muestra a quién pertenece antes de usarlo. */}
            <Field label={aFavor > 0 ? 'DNI o CUIT de la clienta' : '¿Tiene saldo a favor? DNI o CUIT'}>
              <Input value={c.clienta.doc} onChange={(e) => c.setClienta({ ...c.clienta, doc: e.target.value })} inputMode="numeric" />
            </Field>
            {diferencia > 0 && <Button variant="outline" disabled={c.trabajando || c.docLimpio.length < 7 || !!espera} onClick={() => void c.buscarSaldo()}>Ver saldo</Button>}
            {diferencia > 0 && c.saldo && c.saldo.doc === c.docLimpio && (
              c.saldo.monto > 0
                ? <label style={{ display: 'flex', gap: space[1], alignItems: 'center' }}><input type="checkbox" checked={c.usaSaldo} disabled={!!espera} onChange={(e) => c.setUsaSaldo(e.target.checked)} /> Usar {plata(Math.min(c.saldo.monto, diferencia))} de su saldo ({plata(c.saldo.monto)}){c.clienta.nombre && <> · {c.clienta.nombre}</>}</label>
                : <span>Sin saldo a favor.</span>
            )}
          </div>
        )}
        {c.pideClienta && (
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Field label="Nombre"><Input value={c.clienta.nombre} onChange={(e) => c.setClienta({ ...c.clienta, nombre: e.target.value })} /></Field>
            <Field label="WhatsApp (opcional)"><Input value={c.clienta.whatsapp} onChange={(e) => c.setClienta({ ...c.clienta, whatsapp: e.target.value })} inputMode="tel" /></Field>
          </div>
        )}
        {c.faltaClienta && <Notice tone="action">El saldo a favor va a nombre de la clienta: cargá su DNI y su nombre.</Notice>}
        {c.errorCobro && <Notice tone="warning">{c.errorCobro}</Notice>}
        {c.error && <Notice tone="danger" onClose={() => c.setError(null)}>{c.error}</Notice>}
        {espera && (
          <div style={{ display: 'grid', gap: space[2] }}>
            <Notice tone="action">
              Esperando la transferencia de <b>{plata(espera.monto)}</b>.{' '}
              {espera.cruce.motivo ?? 'Se mira Mercado Pago cada 5 segundos: el cambio se registra solo cuando llega.'}
            </Notice>
            {espera.recientes.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                <span>{cuandoCorto(p.cuando)}</span><b style={tabular}>{plata(p.monto)}</b>
                {p.coincide && <><Badge tone="success">Coincide</Badge><Button variant="outline" disabled={c.trabajando} onClick={() => void c.confirmar({ pago: p.id })}>Elegir este pago</Button></>}
              </div>
            ))}
            {espera.cruce.estado === 'sin_cuenta' && (
              <form onSubmit={(e) => { e.preventDefault(); void c.confirmar({ comprobante: c.comprobante }) }} style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
                <Field label="Número de operación del comprobante"><Input value={c.comprobante} onChange={(e) => c.setComprobante(e.target.value)} /></Field>
                <Button type="submit" disabled={c.trabajando || c.comprobante.trim().length < 4}>Validar transferencia</Button>
              </form>
            )}
            <div><Button variant="outline" onClick={() => c.setEspera(null)}>Cambiar la forma de pago</Button></div>
          </div>
        )}
      </div>
    </Modal>
  )
}
