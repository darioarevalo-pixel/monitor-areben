'use client'

/**
 * La ficha AL COSTADO de una cuenta corriente (ERP › Clientes › Cuenta corriente; contrato §15): el saldo en grande, el
 * crédito (y «Marcar crédito», sólo admin), lo que debe venta por venta con su antigüedad, y el MAYOR entre dos fechas con
 * «Exportar» (el CSV para Excel lo arma el motor: `mayorCSV`).
 */

import { useEffect, useState } from 'react'
import { usePantallaAngosta } from '@/lib/movil'
import { Button, Field, Input, MenuAcciones, Modal, MoneyText, Notice, Select, color, font, space, weight, type AccionMenu } from '@/components/ui'
import { formatMoney } from '@/components/ui/MoneyText'
import { DatoFicha, DatosFicha, FichaCostado } from '@/components/ui/FichaCostado'
import { ChipEstado, cuandoCorto } from '@/components/ui/PiezasLista'
import { CampoCuentaReal } from '@/components/erp/ventas/CampoCuentaReal'
import { pideCuentaReal } from '@/lib/erp/cobro-destino.core.js'
import { useChequeDelCobro } from '@/components/erp/ventas/CamposCheque'
import { anularPagoCuentaErp, corregirSaldoInicialErp, cobrarCuentaErp, leerCuentaDeCliente, ponerContactoCliente, ponerCreditoCliente, type CreditoCliente, type CuentaDeCliente, type MarcaErp } from '@/lib/erp/cliente'
import { TRAMOS, nombresDeVentas, textoCredito } from '@/lib/erp/cuenta-corriente.core.js'
import { paraEditar, parsearMonto } from '@/lib/compromisos/plata.core.js'
import { fechaCorta } from './FichaCliente'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { enlaceWhatsapp, numeroWhatsapp } from '@/lib/erp/resumen-cuenta.core.js'
import { imprimirResumenCon } from './resumen-cuenta'

export const ESTADO_CUENTA: Record<string, [tono: 'danger' | 'success' | 'action' | 'neutral', texto: string]> = {
  atrasada: ['danger', 'Atrasada'], aldia: ['success', 'Al día'], favor: ['action', 'A favor'], cero: ['neutral', 'Sin saldo'],
}

type RenglonMayor = CuentaDeCliente['mayor']['renglones'][number]

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

export function FichaCuenta({ marca, fila, prueba, admin, cobrarAlAbrir = false, onCerrar, onCambio }: {
  /** Desde el $ de la fila: la ventana de cobrar se abre sola, sin pasar por la ficha. */
  cobrarAlAbrir?: boolean
  marca: MarcaErp; fila: FilaCuenta; prueba: boolean; admin: boolean; onCerrar: () => void; onCambio: () => void
}) {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [s, setS] = useState<(CuentaDeCliente & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [credito, setCredito] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [contactando, setContactando] = useState(false)
  // El WhatsApp recién guardado: la lista de arriba se refresca con `onCambio`, pero la ficha ya lo usa.
  const [whatsappNuevo, setWhatsappNuevo] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState(cobrarAlAbrir)
  const [anulando, setAnulando] = useState<RenglonMayor | null>(null)
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
  const angosta = usePantallaAngosta()
  const h3: React.CSSProperties = { margin: 0, fontSize: font.lg, fontWeight: weight.bold }
  const celda: React.CSSProperties = { padding: '7px 0', borderBottom: `1px solid ${color.bg2}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const cab = (t: string, derecha: boolean) => <span key={t} role="columnheader" style={{ fontSize: font.sm, color: color.mut, textAlign: derecha ? 'right' : 'left', paddingBottom: 6, borderBottom: `1px solid ${color.line}` }}>{t}</span>
  const wa = enlaceWhatsapp({ whatsapp: whatsappNuevo ?? fila.whatsapp, nombre: fila.nombre, linea: fila.linea, saldo, vencido: e?.vencido ?? fila.vencido })
  const imprimir = () => {
    const w = window.open('', '_blank')
    if (!w) return setError('El navegador bloqueó la ventana del resumen: permitila para este sitio.')
    if (s) imprimirResumenCon(w, fila, prueba, s)
  }

  const waCargado = (whatsappNuevo ?? fila.whatsapp)?.trim()
  const masAcciones: AccionMenu[] = [
    { key: 'imprimir', label: 'Imprimir resumen', icono: 'impresora', onClick: imprimir, disabled: !s },
    ...(admin ? [
      { key: 'wa', label: 'Editar WhatsApp', icono: 'lapiz', onClick: () => { setHecho(null); setContactando(true) } } as AccionMenu,
      { key: 'credito', label: 'Editar crédito', icono: 'lapiz', onClick: () => setCredito(true) } as AccionMenu,
      // Darío 24-nov: anular una venta de ANTES del corte ⛔ baja la deuda (vino en el saldo inicial) ⇒ se corrige acá.
      { key: 'saldo-inicial', label: 'Corregir saldo inicial', icono: 'lapiz', onClick: () => { setHecho(null); setCorrigiendo(true) }, disabled: !s } as AccionMenu,
    ] : []),
  ]

  return (
    <FichaCostado abierta ventana onCerrar={onCerrar} titulo="Cuenta corriente" etiqueta={`Cuenta corriente de ${fila.nombre}`}>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: weight.bold, overflowWrap: 'anywhere' }}>{fila.nombre}</h2>
          {fila.doc && <div style={{ color: color.mut }}>{fila.doc}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <ChipEstado mapa={ESTADO_CUENTA} k={fila.estado} />
            {prueba && <ChipEstado mapa={{ p: ['warning', 'Prueba'] }} k="p" />}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: space[2], flex: '0 0 auto' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: font.sm, color: color.mut }}>Saldo de la cuenta</div>
            <div style={{ fontSize: 26, fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', color: saldo > 0 ? color.ink : saldo < 0 ? 'var(--mo-success-ink)' : color.mut2 }}>
              {formatMoney(Math.abs(saldo))}
            </div>
            <div style={{ fontSize: font.sm, color: saldo < 0 ? 'var(--mo-success-ink)' : color.mut }}>{saldo < 0 ? 'A favor' : `Debe ${formatMoney(e?.debe ?? fila.debe)} · A favor ${formatMoney(e?.a_favor ?? fila.aFavor)}`}</div>
          </div>
          {/* Darío 22-nov: «Cobrar» índigo arriba a la derecha; el resto en ⋯. */}
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            {puedeCobrar && <Button variant="solid" tone="brand" disabled={!s} onClick={() => { setHecho(null); setCobrando(true) }}>Cobrar</Button>}
            <Button variant="outline" disabled={!wa.url} title={wa.motivo ?? undefined} onClick={() => wa.url && window.open(wa.url, '_blank', 'noopener')}>Escribir por WhatsApp</Button>
            <MenuAcciones acciones={masAcciones} etiqueta={`Más acciones de la cuenta de ${fila.nombre}`} vertical />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: angosta ? '1fr' : 'minmax(0, 2fr) minmax(0, 1fr)', gap: angosta ? space[5] : 32, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], minWidth: 0 }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <h3 style={h3}>Ventas con saldo</h3>
        {!s ? <span style={{ color: color.mut }}>Leyendo…</span> : !e!.pendientes.length ? <span style={{ color: color.mut }}>Ninguna.</span> : (
          <div role="table" aria-label="Ventas con saldo" style={{ display: 'grid', gridTemplateColumns: angosta ? 'minmax(0, 1fr) 64px 92px 92px' : 'minmax(0, 1fr) 72px 48px 104px 104px', columnGap: 10, fontVariantNumeric: 'tabular-nums' }}>
            {cab('Venta', false)}{cab('Fecha', false)}{!angosta && cab('Días', true)}{cab('Total', true)}{cab('Pendiente', true)}
            {e!.pendientes.map((p) => (
              <div key={p.ref} role="row" style={{ display: 'contents' }}>
                <span role="cell" style={celda} title={p.ref}>{ventas.get(p.ref) ?? p.ref}</span>
                <span role="cell" style={celda}>{fechaCorta(p.fecha)}</span>
                {!angosta && <span role="cell" style={{ ...celda, textAlign: 'right', color: color.mut }}>{p.dias}</span>}
                <span role="cell" style={{ ...celda, textAlign: 'right' }}><MoneyText value={p.monto} /></span>
                <span role="cell" style={{ ...celda, textAlign: 'right', fontWeight: weight.semibold }}><MoneyText value={p.pendiente} /></span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <h3 style={h3}>Movimientos</h3>
          <Button variant="outline" disabled={!s || s.clave !== clave} onClick={() => s && bajar(s.csv, `cuenta-${slug(fila.nombre)}-${fila.linea}${desde ? `-desde-${desde}` : ''}${hasta ? `-hasta-${hasta}` : ''}.csv`)}>Exportar</Button>
        </div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Desde"><Input type="date" value={desde} max={hasta || undefined} onChange={(ev) => setDesde(ev.target.value)} /></Field>
          <Field label="Hasta"><Input type="date" value={hasta} min={desde || undefined} onChange={(ev) => setHasta(ev.target.value)} /></Field>
        </div>
        {s && (
          <div style={{ overflowX: 'auto', margin: angosta ? '0 -20px' : undefined, padding: angosta ? '0 20px' : undefined }}>
          <div role="table" aria-label="Mayor de la cuenta" style={{ minWidth: angosta ? 580 : undefined, display: 'grid', gridTemplateColumns: `72px minmax(0, 1fr) 96px 96px 104px${admin ? ' 32px' : ''}`, columnGap: 10, fontVariantNumeric: 'tabular-nums' }}>
            {cab('Fecha', false)}{cab('Movimiento', false)}{cab('Debe', true)}{cab('Haber', true)}{cab('Saldo', true)}{admin && cab('', false)}
            {(desde || s.mayor.anterior !== 0) && (
              <div role="row" style={{ display: 'contents' }}>
                <span role="cell" style={celda} />
                <span role="cell" style={{ ...celda, color: color.mut }}>Saldo anterior</span>
                <span role="cell" style={celda} /><span role="cell" style={celda} />
                <span role="cell" style={{ ...celda, textAlign: 'right' }}><MoneyText value={s.mayor.anterior} /></span>
                {admin && <span role="cell" style={celda} />}
              </div>
            )}
            {s.mayor.renglones.map((r) => (
              <div key={r.ref} role="row" style={{ display: 'contents' }}>
                <span role="cell" style={celda}>{fechaCorta(r.fecha)}</span>
                <span role="cell" style={celda} title={r.ref}>{r.tipo === 'compra' ? r.detalle || 'Compra' : `Pago${r.detalle ? ` · ${r.detalle}` : ''}`}</span>
                <span role="cell" style={{ ...celda, textAlign: 'right' }}>{r.debe ? <MoneyText value={r.debe} /> : ''}</span>
                <span role="cell" style={{ ...celda, textAlign: 'right', color: 'var(--mo-success-ink)' }}>{r.haber ? <MoneyText value={r.haber} /> : ''}</span>
                <span role="cell" style={{ ...celda, textAlign: 'right', fontWeight: weight.semibold }}><MoneyText value={r.saldo} /></span>
                {admin && (
                  <span role="cell" style={{ ...celda, overflow: 'visible' }}>
                    {r.tipo === 'pago' && <MenuAcciones acciones={[{ key: 'anular', label: 'Anular pago', icono: 'anular', onClick: () => { setHecho(null); setAnulando(r) } }]} etiqueta={`Más acciones del pago del ${fechaCorta(r.fecha)}`} vertical alinear="izquierda" />}
                  </span>
                )}
              </div>
            ))}
            {!s.mayor.renglones.length && <span style={{ gridColumn: '1 / -1', padding: '8px 0', color: color.mut }}>Sin movimientos.</span>}
          </div>
          </div>
        )}
      </section>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[4], minWidth: 0 }}>
        {(e?.sin_credito ?? fila.sinCredito) && (
          <Notice tone="warning">Sin crédito: lo que debe cuenta como vencido y la próxima venta a cuenta la autoriza un admin.</Notice>
        )}
        <DatosFicha>
          <DatoFicha titulo="Crédito">{textoCredito(cred, formatMoney)}</DatoFicha>
          <DatoFicha titulo="Marcado por">{cred?.puesto_por ? `${cred.puesto_por} · ${cred.puesto_en ? cuandoCorto(cred.puesto_en) : ''}` : '—'}</DatoFicha>
          <DatoFicha titulo="WhatsApp">{waCargado ? (whatsappNuevo ?? fila.whatsapp) : '—'}</DatoFicha>
          <DatoFicha titulo="Vencido">{formatMoney(e?.vencido ?? fila.vencido)}</DatoFicha>
          <DatoFicha titulo="Antigüedad">{(e?.debe ?? fila.debe) ? `${e?.dias_mayor ?? fila.diasMayor} días` : '—'}</DatoFicha>
          {TRAMOS.map((t) => <DatoFicha key={t} titulo={t === 'más de 90' ? '+90 días' : `${t} días`}>{formatMoney((e?.tramos ?? fila.tramos)[t] ?? 0)}</DatoFicha>)}
        </DatosFicha>
      </div>
      </div>

      {cobrando && s && (
        <VentanaCobrarCuenta
          marca={marca} fila={fila} prueba={prueba} saldo={saldo} cuentas={s.cuentas ?? []} rutas={s.rutas} cuentasReales={s.cuentasReales} onCerrar={() => setCobrando(false)}
          onHecho={(m) => { setCobrando(false); setHecho(m); setVuelta((n) => n + 1); onCambio() }}
        />
      )}

      {anulando && (
        <VentanaAnularPago
          marca={marca} fila={fila} renglon={anulando} saldo={saldo} onCerrar={() => setAnulando(null)}
          onHecho={(m) => { setAnulando(null); setHecho(m); setVuelta((x) => x + 1); onCambio() }}
        />
      )}

      {contactando && (
        <VentanaContacto
          marca={marca} fila={fila} actual={whatsappNuevo ?? fila.whatsapp ?? ''} onCerrar={() => setContactando(false)}
          onHecho={(wa) => { setContactando(false); setWhatsappNuevo(wa); setHecho('WhatsApp guardado.'); onCambio() }}
        />
      )}

      {corrigiendo && s && (
        <VentanaSaldoInicial
          marca={marca} fila={fila} prueba={prueba} saldo={saldo}
          actual={s.mayor.renglones.find((r) => r.ref.startsWith('apertura:')) ?? null}
          onCerrar={() => setCorrigiendo(false)}
          onHecho={(aviso) => { setCorrigiendo(false); setHecho(aviso); setVuelta((x) => x + 1); onCambio() }}
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

/** Anular un pago a cuenta cargado mal (sólo Admin): el motivo es obligatorio, la deuda vuelve y en Cobros queda marcado. */
function VentanaAnularPago({ marca, fila, renglon, saldo, onCerrar, onHecho }: {
  marca: MarcaErp; fila: FilaCuenta; renglon: RenglonMayor; saldo: number; onCerrar: () => void; onHecho: (aviso: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const monto = renglon.haber ?? 0

  async function anular() {
    setTrabajando(true)
    try {
      await anularPagoCuentaErp(marca, { clienteId: fila.clienteId, linea: fila.linea, ref: renglon.ref, motivo: motivo.trim() })
      onHecho(`Pago de ${formatMoney(monto)} anulado.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular el pago.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      abierto onCerrar={onCerrar} titulo="¿Anular este pago?"
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button variant="solid" tone="danger" disabled={trabajando || !motivo.trim()} onClick={() => void anular()}>Anular pago</Button>
      </>}
    >
      <p style={{ marginTop: 0, color: color.mut }}>{fila.nombre} · {fechaCorta(renglon.fecha)}{renglon.detalle ? ` · ${renglon.detalle}` : ''}</p>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="Motivo"><Input value={motivo} onChange={(ev) => setMotivo(ev.target.value)} autoFocus /></Field>
        <div style={{ padding: '10px 12px', borderRadius: 9, background: color.bg, border: `1px solid ${color.line}`, display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.base }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Saldo de la cuenta</span><b>{formatMoney(saldo)} → {formatMoney(saldo + monto)}</b></div>
          <div style={{ color: color.mut }}>No se deshace.</div>
        </div>
      </div>
    </Modal>
  )
}

/**
 * «Corregir saldo inicial» (sólo Admin; Darío 24-nov): el saldo que vino del corte con GN. Motivo obligatorio. 0 = sin saldo
 * inicial; otro monto lo reemplaza con la misma fecha. Si el cliente ⛔ tiene saldo inicial, el motor lo dice.
 * `actual` = el renglón del saldo inicial si está en el período que se ve (si se filtró por fecha puede ⛔ estar).
 */
function VentanaSaldoInicial({ marca, fila, prueba, saldo, actual, onCerrar, onHecho }: {
  marca: MarcaErp; fila: FilaCuenta; prueba: boolean; saldo: number; actual: RenglonMayor | null; onCerrar: () => void; onHecho: (aviso: string) => void
}) {
  const [texto, setTexto] = useState('0')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const monto = parsearMonto(texto)
  const valido = Number.isFinite(monto) && motivo.trim().length >= 5
  const antes = actual ? actual.debe - actual.haber : null

  async function corregir() {
    setTrabajando(true)
    try {
      const r = await corregirSaldoInicialErp(marca, { clienteId: fila.clienteId, linea: fila.linea, prueba, monto, motivo: motivo.trim() })
      onHecho(`Saldo inicial corregido. Saldo de la cuenta: ${formatMoney(r.cuenta)}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo corregir el saldo inicial.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      abierto onCerrar={onCerrar} titulo="Corregir saldo inicial"
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button variant="solid" tone="brand" disabled={trabajando || !valido} onClick={() => void corregir()}>Corregir</Button>
      </>}
    >
      <p style={{ marginTop: 0, color: color.mut }}>
        {fila.nombre} · {actual ? `saldo inicial ${formatMoney(antes ?? 0)} (${fechaCorta(actual.fecha)})` : 'el saldo que vino del sistema anterior'}
      </p>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="Saldo inicial nuevo" hint="0 si no debía nada. En negativo, si tenía a favor.">
          <Input inputMode="decimal" value={texto} onChange={(ev) => setTexto(ev.target.value)} autoFocus />
        </Field>
        <Field label="Motivo"><Input value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ej: anulé la venta 33280, que era de antes del corte" /></Field>
        {antes != null && Number.isFinite(monto) && (
          <div style={{ padding: '10px 12px', borderRadius: 9, background: color.bg, border: `1px solid ${color.line}`, display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.base }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Saldo de la cuenta</span><b>{formatMoney(saldo)} → {formatMoney(saldo - antes + monto)}</b></div>
          </div>
        )}
      </div>
    </Modal>
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
      setError(e instanceof Error ? e.message : 'No se pudo: volvé a intentar.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      abierto onCerrar={onCerrar} titulo={`WhatsApp de ${fila.nombre}`}
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button variant="solid" tone="brand" disabled={trabajando || !n} onClick={() => void guardar()}>Guardar</Button>
      </>}
    >
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="WhatsApp" hint="Con código de área, sin el 15. Ej: 11 5555-1234.">
          <Input inputMode="tel" value={texto} onChange={(ev) => setTexto(ev.target.value)} autoFocus />
        </Field>
        <div style={{ color: mal ? 'var(--mo-danger-ink)' : color.mut, fontSize: font.sm }}>
          {!texto.trim() ? '' : mal ? 'Número incompleto o con dígitos de más.' : `Se va a escribir a +${n}.`}
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
        <Button variant="solid" tone="brand" disabled={trabajando || !!mal} onClick={() => void guardar()}>{si ? 'Guardar' : 'Sacar crédito'}</Button>
      </>}
    >
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="¿Puede comprar a cuenta?">
          <Select value={tiene} onChange={(ev) => setTiene(ev.target.value)}>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </Select>
        </Field>
        {si && (
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
            <Field label="Tope" style={{ flex: '1 1 180px' }}><Input inputMode="decimal" value={tope} onChange={(ev) => setTope(ev.target.value)} placeholder="Sin tope" /></Field>
            <Field label="Plazo en días" hint="De 1 a 365." style={{ flex: '1 1 160px' }}><Input inputMode="numeric" value={dias} onChange={(ev) => setDias(ev.target.value)} placeholder="Sin plazo" /></Field>
          </div>
        )}
        <div style={{ color: color.mut, fontSize: font.sm }}>
          {si ? 'Frena la venta a cuenta si pasa el tope o el plazo.' : 'Cada venta a cuenta la autoriza un admin.'} No cambia lo que ya debe.
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
function VentanaCobrarCuenta({ marca, fila, prueba, saldo, cuentas: todasLasCuentas, rutas, cuentasReales, onCerrar, onHecho }: {
  marca: MarcaErp; fila: FilaCuenta; prueba: boolean; saldo: number; cuentas: Array<{ id: string | number; nombre: string; medio: string }>; rutas?: CuentaDeCliente['rutas']; cuentasReales?: CuentaDeCliente['cuentasReales']; onCerrar: () => void; onHecho: (aviso: string) => void
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
  const chq = useChequeDelCobro(marca, todasLasCuentas, cuenta)
  const cuentas = chq.cuentas

  const [cuentaReal, setCuentaReal] = useState('')
  const pide = pideCuentaReal({ cuenta: cuentas.find((c) => String(c.id) === cuenta), rutas, cuentasReales, marca: fila.linea, canal: 'mayorista', fecha })
  const faltaReal = pide && !cuentaReal

  async function registrar() {
    if (n == null || n <= 0) return setError('Escribí el monto.')
    if (!cuenta) return setError('Elegí la cuenta.')
    if (faltaReal) return setError('Elegí a qué cuenta entró la plata.')
    if (chq.falta) return setError(chq.falta)
    setTrabajando(true)
    try {
      const r = await cobrarCuentaErp(marca, { clienteId: fila.clienteId, linea: fila.linea, monto: n, cuenta, ...(pide ? { cuentaReal } : {}), fecha, ref, prueba, ...chq.extra })
      onHecho(r.yaExistia ? 'Ese cobro ya estaba registrado.' : `Cobro de ${formatMoney(n)} registrado.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el cobro.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      abierto onCerrar={onCerrar} titulo="Cobrar"
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button variant="solid" tone="brand" disabled={trabajando || n == null || n <= 0 || !cuenta || faltaReal || !!chq.falta} onClick={() => void registrar()}>Cobrar {n != null && n > 0 ? formatMoney(n) : ''}</Button>
      </>}
    >
      <p style={{ marginTop: 0, color: color.mut }}>{fila.nombre} · {saldo > 0 ? `debe ${formatMoney(saldo)}` : saldo < 0 ? `a favor ${formatMoney(-saldo)}` : 'sin saldo'}{prueba ? ' · de prueba' : ''}</p>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="Monto"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Cuenta" style={{ flex: '1 1 220px' }}>
            <Select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
              <option value="">{cuentas.length ? 'Elegí la cuenta' : 'No hay cuentas para cobrar'}</option>
              {cuentas.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={fecha} max={hoyDia} onChange={(e) => setFecha(e.target.value)} /></Field>
        </div>
        {pide && <CampoCuentaReal cuentas={cuentasReales ?? []} valor={cuentaReal} onCambio={setCuentaReal} />}
        {chq.campos}
        <div style={{ padding: '10px 12px', borderRadius: 9, background: color.bg, border: `1px solid ${color.line}`, display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.base }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Saldo de la cuenta</span><b>{formatMoney(saldo)} → {formatMoney(saldo - (n ?? 0))}</b></div>
          {quedaAFavor > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Queda a favor</span><b>{formatMoney(quedaAFavor)}</b></div>}
          <div style={{ color: color.mut }}>Paga primero la venta más vieja.</div>
        </div>
      </div>
    </Modal>
  )
}
