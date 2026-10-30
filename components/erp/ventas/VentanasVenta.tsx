'use client'

/**
 * Las dos ventanas de una venta (diseño §5): REGISTRAR COBRO de una venta con saldo y EDITAR lo que ⛔ mueve stock ni
 * plata. Desde la fila abren solas (⛔ la ficha detrás); desde la ficha, vuelven a la ficha.
 *
 * 🔑 Editar (contrato §16, `editarVenta`): cliente · quién vendió · entrega · datos para facturar (⛔ si ya está
 * facturada: va con nota de crédito) + la nota (`agregarNota`, editar = otra que reemplaza la última). Prendas, precios
 * y cobros con CANDADO: llevan a Hacer cambio / Registrar cobro / Anular, que dejan rastro.
 * 🔑 Cobrar (§15/§16): `registrarPagoACuenta` imputado a ESTA venta. Lo que pase el saldo va a la venta más vieja que
 * deba; sólo queda a favor si no debe nada (aprobado por Bruno y Darío, 18-oct).
 */

import { useEffect, useState } from 'react'
import { Button, Field, Input, Modal, Notice, Select, color, font, space, weight } from '@/components/ui'
import {
  cobrarVentaErp, editarVentaErp, guardarNotaDeVenta, leerExtraDeVenta,
  type CambiosDeVenta, type ExtraDeVenta, type FilaVentaLista, type MarcaErp, type QueSabeElMotor,
} from '@/lib/erp/cliente'
import { paraEditar, parsearMonto } from '@/lib/compromisos/plata.core.js'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { plata } from '@/lib/erp/ventas-lista.core.js'
import { cuandoCorto } from '@/components/ui/PiezasLista'

const ESPERA = 'Todavía no está disponible: se prende cuando esté lista la ficha de la venta.'

/** Lee lo de afuera de la venta (cuentas, lo editable, la nota vigente) para la ventana. */
function useExtra(marca: MarcaErp, id: string, activo: boolean) {
  const [extra, setExtra] = useState<ExtraDeVenta | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!activo) return
    let vivo = true
    leerExtraDeVenta(marca, id).then((x) => vivo && setExtra(x)).catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer la venta.'))
    return () => { vivo = false }
  }, [marca, id, activo])
  return { extra, error }
}

export function VentanaCobro({ marca, fila, puede, onCerrar, onHecho }: {
  marca: MarcaErp
  fila: FilaVentaLista
  puede: QueSabeElMotor
  onCerrar: () => void
  onHecho: (aviso: string) => void
}) {
  const { extra, error: errLeer } = useExtra(marca, fila.id, true)
  const [monto, setMonto] = useState(paraEditar(fila.saldo))
  const [cuenta, setCuenta] = useState('')
  const [hoyDia] = useState(() => diaArgentino(Date.now()))
  const [fecha, setFecha] = useState(hoyDia)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  // Una clave por ventana abierta: reintentar el MISMO cobro ⛔ lo duplica (el motor deduplica por `origen_ref`).
  const [ref] = useState(() => crypto.randomUUID())
  const n = parsearMonto(monto)
  const cuentas = extra?.cuentas ?? []
  const sinCliente = !fila.clienteId
  const bloqueo = !puede.cobrar ? ESPERA : sinCliente ? 'La venta no tiene cliente del ERP: sin cliente no hay cuenta corriente.' : null
  const resto = n != null && n > fila.saldo ? Math.round((n - fila.saldo) * 100) / 100 : 0

  async function registrar() {
    if (n == null || n <= 0) return setError('Escribí el monto.')
    if (!cuenta) return setError('Elegí la cuenta.')
    setTrabajando(true)
    try {
      await cobrarVentaErp(marca, { ventaId: fila.id, clienteId: fila.clienteId!, linea: fila.linea, monto: n, saldo: fila.saldo, cuenta, canal: fila.canal ?? null, fecha, ref, prueba: fila.prueba })
      onHecho(`Cobro de ${plata(n)} registrado en la venta ${fila.ref}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el cobro.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      abierto onCerrar={onCerrar} titulo="Registrar cobro"
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button disabled={!!bloqueo || trabajando || n == null || n <= 0 || !cuenta} onClick={() => void registrar()}>Registrar {n != null && n > 0 ? plata(n) : ''}</Button>
      </>}
    >
      <p style={{ marginTop: 0, color: color.mut }}>Venta {fila.ref} · {fila.cliente} · saldo {plata(fila.saldo)}</p>
      {bloqueo && <Notice tone="warning">{bloqueo}</Notice>}
      {(error || errLeer) && <Notice tone="danger" onClose={() => setError(null)}>{error || errLeer}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="Monto"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Cuenta" hint="La forma de pago y la cuenta salen de «¿A qué cuenta va?» del día." style={{ flex: '1 1 220px' }}>
            <Select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
              <option value="">{extra ? 'Elegí la cuenta' : 'Leyendo…'}</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={fecha} max={hoyDia} onChange={(e) => setFecha(e.target.value)} /></Field>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 9, background: color.bg, border: `1px solid ${color.line}`, display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.base }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Saldo de la venta</span><b>{plata(fila.saldo)} → {plata(Math.max(0, fila.saldo - (n ?? 0)))}</b></div>
          {resto > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Lo que sobra ({plata(resto)})</span><span>a la venta más vieja que deba</span></div>}
          <div style={{ color: color.mut }}>Si cobrás más que el saldo de esta venta, el resto va a la venta más vieja que tenga pendiente; sólo queda a favor si no debe nada.</div>
        </div>
      </div>
    </Modal>
  )
}

const CONDICIONES: Array<[string, string]> = [['5', 'Consumidor final'], ['6', 'Monotributo'], ['1', 'Responsable inscripto'], ['4', 'Exento']]

type PropsEditar = {
  marca: MarcaErp
  fila: FilaVentaLista
  puede: QueSabeElMotor
  vendedores: string[]
  onCerrar: () => void
  onHecho: (aviso: string) => void
  irACaja: (que: 'cambio' | 'factura') => void
  abrirCobro: () => void
  anular: () => void
}

/** Lee lo de hoy y recién ahí arma el formulario (los campos nacen con lo que la venta tiene). */
export function VentanaEditar(p: PropsEditar) {
  const { extra, error } = useExtra(p.marca, p.fila.id, true)
  if (!extra) {
    return (
      <Modal abierto onCerrar={p.onCerrar} titulo={`Editar la venta ${p.fila.ref}`} pie={<Button variant="outline" onClick={p.onCerrar}>Cancelar</Button>}>
        {error ? <Notice tone="danger">{error}</Notice> : <span style={{ color: color.mut }}>Leyendo la venta…</span>}
      </Modal>
    )
  }
  return <FormEditar {...p} extra={extra} />
}

function FormEditar({ marca, fila, puede, vendedores, onCerrar, onHecho, irACaja, abrirCobro, anular, extra }: PropsEditar & { extra: ExtraDeVenta }) {
  // Lo de hoy: lo que se compara para mandar SÓLO lo que cambió.
  const hoy = {
    vendedor: extra.vendedor ?? '', entrega: extra.entrega?.tipo ?? '', direccion: extra.entrega?.direccion ?? '',
    facDoc: extra.facturar?.doc ?? '', facCond: extra.facturar ? String(extra.facturar.condicion_iva) : '', nota: extra.nota?.texto ?? fila.nota?.texto ?? '',
  }
  const [doc, setDoc] = useState('')
  const [vendedor, setVendedor] = useState(hoy.vendedor)
  const [entrega, setEntrega] = useState(hoy.entrega)
  const [direccion, setDireccion] = useState(hoy.direccion)
  const [facDoc, setFacDoc] = useState(hoy.facDoc)
  const [facCond, setFacCond] = useState(hoy.facCond)
  const [nota, setNota] = useState(hoy.nota)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const cambios: CambiosDeVenta = {}
  if (vendedor.trim() !== hoy.vendedor) cambios.vendedor = vendedor.trim() || null
  if (entrega !== hoy.entrega || direccion.trim() !== hoy.direccion) cambios.entrega = entrega ? { tipo: entrega as 'retira' | 'envio' | 'cadete', ...(direccion.trim() ? { direccion: direccion.trim() } : {}) } : null
  if (!fila.facturada && (facDoc.trim() !== hoy.facDoc || facCond !== hoy.facCond)) cambios.facturar = facDoc.trim() && facCond ? { doc: facDoc.replace(/\D/g, ''), condicion_iva: Number(facCond) as 1 | 4 | 5 | 6 } : null
  const cambiaNota = nota.trim() !== hoy.nota.trim() && !!nota.trim()
  const cambiaCliente = !!doc.trim()
  const hayAlgo = Object.keys(cambios).length > 0 || cambiaNota || cambiaCliente
  const faltaDireccion = (entrega === 'envio' || entrega === 'cadete') && !direccion.trim()
  const bloqueoEditar = !puede.editar && (Object.keys(cambios).length > 0 || cambiaCliente) ? ESPERA : null
  const bloqueoNota = !puede.notas && cambiaNota ? ESPERA : null

  async function guardar() {
    setTrabajando(true)
    try {
      if (Object.keys(cambios).length || cambiaCliente) await editarVentaErp(marca, fila.id, cambios, cambiaCliente ? doc : null)
      if (cambiaNota) await guardarNotaDeVenta(marca, fila.id, nota.trim(), extra.nota?.id ?? null)
      onHecho(`Venta ${fila.ref}: cambios guardados (quedan en el historial).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setTrabajando(false)
    }
  }

  const fila2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: space[3] }
  return (
    <Modal
      abierto onCerrar={onCerrar} titulo={`Editar la venta ${fila.ref}`} ancho="ancho" cerrarConFondo={false}
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button disabled={!hayAlgo || trabajando || faltaDireccion || !!bloqueoEditar || !!bloqueoNota} onClick={() => void guardar()}>Guardar cambios</Button>
      </>}
    >
      <p style={{ marginTop: 0, color: color.mut }}>{fila.cliente} · {cuandoCorto(fila.pedidoEn)}</p>
      {(bloqueoEditar || bloqueoNota) && <Notice tone="warning">{bloqueoEditar || bloqueoNota}</Notice>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
        <div style={fila2}>
          <Field label="Cliente" hint={`Hoy: ${fila.cliente}${fila.clienteDe === 'gn' ? ' (de Gestión Nube)' : ''}. Para cambiarlo, el DNI o CUIT de su ficha.`}>
            <Input inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="DNI o CUIT" />
          </Field>
          <Field label="Vendió">
            <Input list="erp-vendedores" value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder={fila.vendio} />
            <datalist id="erp-vendedores">{vendedores.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label="Entrega">
            <Select value={entrega} onChange={(e) => setEntrega(e.target.value)}>
              <option value="">Sin dato</option><option value="retira">Retira</option><option value="envio">Envío</option><option value="cadete">Cadete</option>
            </Select>
          </Field>
          {(entrega === 'envio' || entrega === 'cadete') && (
            <Field label="Dirección" required><Input value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Field>
          )}
        </div>
        <div style={fila2}>
          <Field label="Datos para facturar · documento" hint={fila.facturada ? 'Ya está facturada: se cambia con nota de crédito.' : undefined}>
            <Input inputMode="numeric" disabled={fila.facturada} value={facDoc} onChange={(e) => setFacDoc(e.target.value)} placeholder="DNI o CUIT" />
          </Field>
          <Field label="Condición frente al IVA">
            <Select disabled={fila.facturada} value={facCond} onChange={(e) => setFacCond(e.target.value)}>
              <option value="">Sin dato</option>{CONDICIONES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Nota de la venta" hint={extra.nota ? `La de hoy es de ${extra.nota.de}. Cambiarla deja la anterior en el historial.` : 'De dónde viene, si se importó, o algo a tener en cuenta.'}>
          <textarea className="mo-input mo-input--multi" style={{ width: '100%', boxSizing: 'border-box' }} value={nota} onChange={(e) => setNota(e.target.value)} />
        </Field>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: color.bg, border: `1px dashed ${color.line2}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: weight.semibold }}>Productos, precios y cobros</span>
          <span style={{ fontSize: font.base, color: color.mut }}>No se editan acá: mueven stock, plata o la factura. Para cambiarlos:</span>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button size="sm" variant="outline" onClick={() => irACaja('cambio')}>Hacer cambio</Button>
            <Button size="sm" variant="outline" disabled={!(fila.saldo > 0)} onClick={abrirCobro}>Registrar cobro</Button>
            <Button size="sm" variant="outline" tone="danger" onClick={anular}>Anular…</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
