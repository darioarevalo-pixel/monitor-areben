'use client'

/**
 * La ficha AL COSTADO de una cuenta corriente (ERP › Clientes › Cuenta corriente; contrato §15): el saldo en grande, el
 * crédito (y «Marcar crédito», sólo admin), lo que debe venta por venta con su antigüedad, y el MAYOR entre dos fechas con
 * «Exportar» (el CSV para Excel lo arma el motor: `mayorCSV`).
 */

import { useEffect, useState } from 'react'
import { Button, Field, Input, Modal, MoneyText, Notice, Select, color, font, space, weight } from '@/components/ui'
import { formatMoney } from '@/components/ui/MoneyText'
import { DatoFicha, DatosFicha, FichaCostado } from '@/components/ui/FichaCostado'
import { ChipEstado, cuandoCorto } from '@/components/ui/PiezasLista'
import { cobrarCuentaErp, leerCuentaDeCliente, ponerContactoCliente, ponerCreditoCliente, type CreditoCliente, type CuentaDeCliente, type MarcaErp } from '@/lib/erp/cliente'
import { NOMBRE_LINEA, TRAMOS, nombresDeVentas, textoCredito } from '@/lib/erp/cuenta-corriente.core.js'
import { paraEditar, parsearMonto } from '@/lib/compromisos/plata.core.js'
import { fechaCorta } from './FichaCliente'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { enlaceWhatsapp, numeroWhatsapp } from '@/lib/erp/resumen-cuenta.core.js'
import { imprimirResumenCon } from './resumen-cuenta'

export const ESTADO_CUENTA: Record<string, [tono: 'danger' | 'success' | 'action' | 'neutral', texto: string]> = {
  atrasada: ['danger', 'Atrasada'], aldia: ['success', 'Al día'], favor: ['action', 'A favor'], cero: ['neutral', 'Sin saldo'],
}

export type FilaCuenta = {
  id: string; clienteId: string; linea: string; nombre: string; doc: string | null; whatsapp?: string | null
  saldo: number; debe: number; aFavor: number; vencido: number; diasMayor: number; tramos: Record<string, number>
  credito: CreditoCliente; sinCredito: boolean; estado: string
  ventasConSaldo?: number | null; ultimoCobro?: { fecha: string; monto: number } | null
}

function bajar(texto: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function FichaCuenta({ marca, fila, prueba, admin, onCerrar, onCambio }: {
  marca: MarcaErp; fila: FilaCuenta; prueba: boolean; admin: boolean; onCerrar: () => void; onCambio: () => void
}) {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [s, setS] = useState<(CuentaDeCliente & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [credito, setCredito] = useState(false)
  const [contactando, setContactando] = useState(false)
  // El WhatsApp recién guardado: la lista de arriba se refresca con `onCambio`, pero la ficha ya lo usa.
  const [whatsappNuevo, setWhatsappNuevo] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)
  const puedeCobrar = usePuedeErp(marca)('cobrar')
  const [vuelta, setVuelta] = useState(0)
  const clave = `${desde}|${hasta}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerCuentaDeCliente(marca, { clienteId: fila.clienteId, linea: fila.linea, prueba, desde, hasta })
      .then((x) => { if (vivo) { setS({ ...x, clave }); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer la cuenta.'))
    return () => { vivo = false }
  }, [marca, fila.clienteId, fila.linea, prueba, desde, hasta, clave])

  const e = s?.estado
  const saldo = e?.saldo ?? fila.saldo
  const cred = s ? s.credito : fila.credito
  const ventas = nombresDeVentas(s?.mayor)
  const h3: React.CSSProperties = { margin: 0, fontSize: font.lg, fontWeight: weight.bold }
  const celda: React.CSSProperties = { padding: '7px 0', borderBottom: `1px solid ${color.bg2}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const cab = (t: string, derecha: boolean) => <span key={t} role="columnheader" style={{ fontSize: font.sm, color: color.mut, textAlign: derecha ? 'right' : 'left', paddingBottom: 6, borderBottom: `1px solid ${color.line}` }}>{t}</span>
  const linea = NOMBRE_LINEA[fila.linea as keyof typeof NOMBRE_LINEA] ?? fila.linea
  const wa = enlaceWhatsapp({ whatsapp: whatsappNuevo ?? fila.whatsapp, nombre: fila.nombre, linea: fila.linea, saldo, vencido: e?.vencido ?? fila.vencido })
  const imprimir = () => {
    const w = window.open('', '_blank')
    if (!w) return setError('El navegador bloqueó la ventana del resumen: permitila para este sitio.')
    if (s) imprimirResumenCon(w, fila, prueba, s)
  }

  return (
    <FichaCostado abierta onCerrar={onCerrar} titulo={`Cuenta corriente · ${linea}${prueba ? ' · de prueba' : ''}`} etiqueta={`Cuenta corriente de ${fila.nombre}`}>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: weight.bold, overflowWrap: 'anywhere' }}>{fila.nombre}</h2>
          <div style={{ color: color.mut }}>{fila.doc ?? 'sin documento'}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <ChipEstado mapa={ESTADO_CUENTA} k={fila.estado} />
            {prueba && <ChipEstado mapa={{ p: ['warning', 'Prueba'] }} k="p" />}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: font.sm, color: color.mut }}>Saldo de la cuenta</div>
          <div style={{ fontSize: 26, fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', color: saldo > 0 ? color.ink : saldo < 0 ? 'var(--mo-success-ink)' : color.mut2 }}>
            {formatMoney(Math.abs(saldo))}
          </div>
          <div style={{ fontSize: font.sm, color: saldo < 0 ? 'var(--mo-success-ink)' : color.mut }}>{saldo < 0 ? 'a favor' : `debe ${formatMoney(e?.debe ?? fila.debe)} · a favor ${formatMoney(e?.a_favor ?? fila.aFavor)}`}</div>
        </div>
      </div>

      {(e?.sin_credito ?? fila.sinCredito) && (
        <Notice tone="warning">No tiene crédito marcado: todo lo que debe cuenta como vencido y la próxima venta a cuenta se frena{admin ? '' : ' (la autoriza un admin)'}.</Notice>
      )}

      <DatosFicha>
        <DatoFicha titulo="Crédito">{textoCredito(cred, formatMoney)}</DatoFicha>
        <DatoFicha titulo="Lo marcó">{cred?.puesto_por ? `${cred.puesto_por} · ${cred.puesto_en ? cuandoCorto(cred.puesto_en) : ''}` : '—'}</DatoFicha>
        <DatoFicha titulo="WhatsApp">{(whatsappNuevo ?? fila.whatsapp)?.trim() ? (whatsappNuevo ?? fila.whatsapp) : 'Sin cargar'}</DatoFicha>
        <DatoFicha titulo="Vencido">{formatMoney(e?.vencido ?? fila.vencido)}</DatoFicha>
        <DatoFicha titulo="La más vieja">{(e?.debe ?? fila.debe) ? `${e?.dias_mayor ?? fila.diasMayor} días` : '—'}</DatoFicha>
        {TRAMOS.map((t) => <DatoFicha key={t} titulo={t === 'más de 90' ? 'Más de 90 días' : `${t} días`}>{formatMoney((e?.tramos ?? fila.tramos)[t] ?? 0)}</DatoFicha>)}
      </DatosFicha>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        {puedeCobrar && <Button disabled={!s} onClick={() => { setHecho(null); setCobrando(true) }}>Cobrar</Button>}
        <Button variant="outline" disabled={!wa.url} title={wa.motivo ?? undefined} onClick={() => wa.url && window.open(wa.url, '_blank', 'noopener')}>Escribir por WhatsApp</Button>
        <Button variant="outline" disabled={!s} onClick={imprimir}>Resumen de cuenta</Button>
        {admin && <Button variant="outline" onClick={() => { setHecho(null); setContactando(true) }}>{(whatsappNuevo ?? fila.whatsapp)?.trim() ? 'Cambiar el WhatsApp' : 'Cargar el WhatsApp'}</Button>}
        {admin && <Button variant="outline" onClick={() => setCredito(true)}>{cred?.credito ? 'Cambiar el crédito' : 'Marcar crédito'}</Button>}
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div>
          <h3 style={h3}>Ventas con saldo</h3>
          <div style={{ fontSize: font.sm, color: color.mut }}>lo que debe compra por compra; un cobro paga primero la más vieja</div>
        </div>
        {!s ? <span style={{ color: color.mut }}>Leyendo…</span> : !e!.pendientes.length ? <span style={{ color: color.mut }}>No debe ninguna venta.</span> : (
          <div role="table" aria-label="Ventas con saldo" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 72px 64px 104px 104px', columnGap: 10, fontVariantNumeric: 'tabular-nums' }}>
            {cab('Venta', false)}{cab('Fecha', false)}{cab('Días', true)}{cab('Total', true)}{cab('Pendiente', true)}
            {e!.pendientes.map((p) => (
              <div key={p.ref} role="row" style={{ display: 'contents' }}>
                <span role="cell" style={celda} title={p.ref}>{ventas.get(p.ref) ?? p.ref}</span>
                <span role="cell" style={celda}>{fechaCorta(p.fecha)}</span>
                <span role="cell" style={{ ...celda, textAlign: 'right', color: color.mut }}>{p.dias}</span>
                <span role="cell" style={{ ...celda, textAlign: 'right' }}><MoneyText value={p.monto} /></span>
                <span role="cell" style={{ ...celda, textAlign: 'right', fontWeight: weight.semibold }}><MoneyText value={p.pendiente} /></span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}>Mayor</h3>
            <div style={{ fontSize: font.sm, color: color.mut }}>cada compra y cada pago, con el saldo que va quedando</div>
          </div>
          <Button variant="outline" disabled={!s || s.clave !== clave} onClick={() => s && bajar(s.csv, `cuenta-${slug(fila.nombre)}-${fila.linea}${desde ? `-desde-${desde}` : ''}${hasta ? `-hasta-${hasta}` : ''}.csv`)}>Exportar</Button>
        </div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Desde"><Input type="date" value={desde} max={hasta || undefined} onChange={(ev) => setDesde(ev.target.value)} /></Field>
          <Field label="Hasta"><Input type="date" value={hasta} min={desde || undefined} onChange={(ev) => setHasta(ev.target.value)} /></Field>
        </div>
        {s && (
          <div role="table" aria-label="Mayor de la cuenta" style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) 96px 96px 104px', columnGap: 10, fontVariantNumeric: 'tabular-nums' }}>
            {cab('Fecha', false)}{cab('Movimiento', false)}{cab('Debe', true)}{cab('Haber', true)}{cab('Saldo', true)}
            {(desde || s.mayor.anterior !== 0) && (
              <div role="row" style={{ display: 'contents' }}>
                <span role="cell" style={celda} />
                <span role="cell" style={{ ...celda, color: color.mut }}>Saldo anterior</span>
                <span role="cell" style={celda} /><span role="cell" style={celda} />
                <span role="cell" style={{ ...celda, textAlign: 'right' }}><MoneyText value={s.mayor.anterior} /></span>
              </div>
            )}
            {s.mayor.renglones.map((r) => (
              <div key={r.ref} role="row" style={{ display: 'contents' }}>
                <span role="cell" style={celda}>{fechaCorta(r.fecha)}</span>
                <span role="cell" style={celda} title={r.ref}>{r.tipo === 'compra' ? r.detalle || 'Compra' : `Pago${r.detalle ? ` · ${r.detalle}` : ''}`}</span>
                <span role="cell" style={{ ...celda, textAlign: 'right' }}>{r.debe ? <MoneyText value={r.debe} /> : ''}</span>
                <span role="cell" style={{ ...celda, textAlign: 'right', color: 'var(--mo-success-ink)' }}>{r.haber ? <MoneyText value={r.haber} /> : ''}</span>
                <span role="cell" style={{ ...celda, textAlign: 'right', fontWeight: weight.semibold }}><MoneyText value={r.saldo} /></span>
              </div>
            ))}
            {!s.mayor.renglones.length && <span style={{ gridColumn: '1 / -1', padding: '8px 0', color: color.mut }}>Sin movimientos entre esas fechas.</span>}
          </div>
        )}
      </section>

      {cobrando && s && (
        <VentanaCobrarCuenta
          marca={marca} fila={fila} prueba={prueba} saldo={saldo} cuentas={s.cuentas ?? []} onCerrar={() => setCobrando(false)}
          onHecho={(m) => { setCobrando(false); setHecho(m); setVuelta((n) => n + 1); onCambio() }}
        />
      )}

      {contactando && (
        <VentanaContacto
          marca={marca} fila={fila} actual={whatsappNuevo ?? fila.whatsapp ?? ''} onCerrar={() => setContactando(false)}
          onHecho={(wa) => { setContactando(false); setWhatsappNuevo(wa); setHecho(`WhatsApp de ${fila.nombre} guardado.`); onCambio() }}
        />
      )}

      {credito && (
        <VentanaCredito
          marca={marca} fila={fila} credito={cred} onCerrar={() => setCredito(false)}
          onHecho={() => { setCredito(false); setVuelta((x) => x + 1); onCambio() }}
        />
      )}
    </FichaCostado>
  )
}

/**
 * Cargar o corregir el WhatsApp del cliente (sólo admin). El motor lo lleva a 549 + 10 dígitos o lo rechaza: acá se avisa antes
 * de guardar con el MISMO criterio (`numeroWhatsapp`), y se muestra a qué número va a escribir, porque un número mal armado le
 * escribe a otra persona.
 */
function VentanaContacto({ marca, fila, actual, onCerrar, onHecho }: {
  marca: MarcaErp; fila: FilaCuenta; actual: string; onCerrar: () => void; onHecho: (whatsapp: string) => void
}) {
  const [texto, setTexto] = useState(actual)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const n = numeroWhatsapp(texto)
  const mal = texto.trim() !== '' && !n

  async function guardar() {
    setTrabajando(true)
    try {
      const r = await ponerContactoCliente(marca, { clienteId: fila.clienteId, whatsapp: texto })
      onHecho(r.contacto.whatsapp ?? texto)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el WhatsApp.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      abierto onCerrar={onCerrar} titulo={`WhatsApp de ${fila.nombre}`}
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button disabled={trabajando || !n} onClick={() => void guardar()}>Guardar el WhatsApp</Button>
      </>}
    >
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="WhatsApp" hint="Con código de área, sin el 15. Ej: 11 5555-1234.">
          <Input inputMode="tel" value={texto} onChange={(ev) => setTexto(ev.target.value)} autoFocus />
        </Field>
        <div style={{ color: mal ? 'var(--mo-danger-ink)' : color.mut, fontSize: font.sm }}>
          {!texto.trim() ? 'Escribí el número.' : mal ? 'No se entiende como número: falta el código de área o sobran dígitos.' : `Le va a escribir a +${n}.`}
        </div>
      </div>
    </Modal>
  )
}

/** Marcar o sacar el crédito (sólo admin). Cada cambio queda como una fila nueva en el motor, con quién fue. */
function VentanaCredito({ marca, fila, credito, onCerrar, onHecho }: {
  marca: MarcaErp; fila: FilaCuenta; credito: CreditoCliente; onCerrar: () => void; onHecho: () => void
}) {
  const [tiene, setTiene] = useState(credito?.credito ? 'si' : 'no')
  const [tope, setTope] = useState(credito?.tope != null ? paraEditar(credito.tope) : '')
  const [dias, setDias] = useState(credito?.dias != null ? String(credito.dias) : '')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const si = tiene === 'si'
  const t = tope.trim() ? parsearMonto(tope) : null
  const d = dias.trim() ? Number(dias) : null
  const mal = si && ((tope.trim() && !(t != null && t > 0)) || (dias.trim() && !(Number.isInteger(d) && d! >= 1 && d! <= 365)))

  async function guardar() {
    setTrabajando(true)
    try {
      await ponerCreditoCliente(marca, { clienteId: fila.clienteId, credito: si, tope: si ? t : null, dias: si ? d : null })
      onHecho()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar el crédito.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      abierto onCerrar={onCerrar} titulo={`Crédito de ${fila.nombre}`}
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button disabled={trabajando || !!mal} onClick={() => void guardar()}>{si ? 'Guardar el crédito' : 'Sacar el crédito'}</Button>
      </>}
    >
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="¿Puede comprar a cuenta?">
          <Select value={tiene} onChange={(ev) => setTiene(ev.target.value)}>
            <option value="si">Sí, tiene crédito</option>
            <option value="no">No</option>
          </Select>
        </Field>
        {si && (
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
            <Field label="Tope" hint="Vacío = sin tope." style={{ flex: '1 1 180px' }}><Input inputMode="decimal" value={tope} onChange={(ev) => setTope(ev.target.value)} placeholder="Sin tope" /></Field>
            <Field label="Plazo en días" hint="De 1 a 365. Vacío = no se atrasa nunca." style={{ flex: '1 1 160px' }}><Input inputMode="numeric" value={dias} onChange={(ev) => setDias(ev.target.value)} placeholder="Sin plazo" /></Field>
          </div>
        )}
        <div style={{ color: color.mut, fontSize: font.sm }}>
          {si
            ? 'Con crédito, la venta a cuenta se frena sólo si pasa el tope o si debe una compra más vieja que el plazo.'
            : 'Sin crédito, todo lo que debe cuenta como vencido y cada venta a cuenta pide la autorización de un admin.'}
          {' '}Queda guardado quién lo cambió y cuándo; no cambia lo que ya debe.
        </div>
      </div>
    </Modal>
  )
}

/**
 * «Cobrar» a la cuenta, SIN elegir venta (el botón de la cuenta corriente): el motor paga primero la compra más VIEJA que debe y lo
 * que sobra a la siguiente (FIFO); sólo queda a favor si no debe nada (Bruno y Darío, 18-oct). Una clave por ventana abierta:
 * reintentar el MISMO cobro ⛔ lo duplica (el motor deduplica por `origen_ref`).
 */
function VentanaCobrarCuenta({ marca, fila, prueba, saldo, cuentas, onCerrar, onHecho }: {
  marca: MarcaErp; fila: FilaCuenta; prueba: boolean; saldo: number; cuentas: Array<{ id: string | number; nombre: string }>; onCerrar: () => void; onHecho: (aviso: string) => void
}) {
  const [monto, setMonto] = useState(saldo > 0 ? paraEditar(saldo) : '')
  const [cuenta, setCuenta] = useState('')
  const [hoyDia] = useState(() => diaArgentino(Date.now()))
  const [fecha, setFecha] = useState(hoyDia)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [ref] = useState(() => crypto.randomUUID())
  const n = parsearMonto(monto)
  const debe = Math.max(0, saldo)
  const quedaAFavor = n != null && n > debe ? Math.round((n - debe) * 100) / 100 : 0

  async function registrar() {
    if (n == null || n <= 0) return setError('Escribí el monto.')
    if (!cuenta) return setError('Elegí la cuenta.')
    setTrabajando(true)
    try {
      const r = await cobrarCuentaErp(marca, { clienteId: fila.clienteId, linea: fila.linea, monto: n, cuenta, fecha, ref, prueba })
      onHecho(r.yaExistia ? 'Ese cobro ya estaba registrado.' : `Cobro de ${formatMoney(n)} registrado en la cuenta de ${fila.nombre}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el cobro.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      abierto onCerrar={onCerrar} titulo="Cobrar a la cuenta"
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button disabled={trabajando || n == null || n <= 0 || !cuenta} onClick={() => void registrar()}>Cobrar {n != null && n > 0 ? formatMoney(n) : ''}</Button>
      </>}
    >
      <p style={{ marginTop: 0, color: color.mut }}>{fila.nombre} · {saldo > 0 ? `debe ${formatMoney(saldo)}` : saldo < 0 ? `a favor ${formatMoney(-saldo)}` : 'sin saldo'}{prueba ? ' · de prueba' : ''}</p>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="Monto"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Cuenta" hint="Medio y cuenta real salen de la ruta del día." style={{ flex: '1 1 220px' }}>
            <Select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
              <option value="">{cuentas.length ? 'Elegí la cuenta' : 'No hay cuentas para cobrar'}</option>
              {cuentas.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={fecha} max={hoyDia} onChange={(e) => setFecha(e.target.value)} /></Field>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 9, background: color.bg, border: `1px solid ${color.line}`, display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.base }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Saldo de la cuenta</span><b>{formatMoney(saldo)} → {formatMoney(saldo - (n ?? 0))}</b></div>
          {quedaAFavor > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Queda a favor</span><b>{formatMoney(quedaAFavor)}</b></div>}
          <div style={{ color: color.mut }}>No elegís la venta: el cobro paga primero la compra más vieja que debe y lo que sobra, la siguiente. Sólo queda a favor si no debe nada.</div>
        </div>
      </div>
    </Modal>
  )
}
