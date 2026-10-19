'use client'

/**
 * La FICHA de una venta, al costado de la lista (diseño §5): número grande (total o saldo), chips, botones (principal +
 * Editar + Hacer cambio + ⋯), datos, nota, prendas y totales, e HISTORIAL. Anular (con motivo) y la nota de crédito de
 * una anulada facturada son las de siempre (`anularVenta`, `notaDeCreditoDeVenta`), mudadas del buscador viejo.
 * Un pedido de TN sin pagar ⛔ es venta todavía: su ficha dice eso y lleva a Tienda Nube.
 */

import { useEffect, useState } from 'react'
import { Button, Field, MenuAcciones, Modal, Notice, color, font, space, useConfirmar, weight, type AccionMenu } from '@/components/ui'
import { DatoFicha, DatosFicha, FichaCostado, Historial, type HechoHistorial } from '@/components/ui/FichaCostado'
import { ChipEstado, cuandoCorto } from '@/components/ui/PiezasLista'
import {
  anularVenta, leerExtraDeVenta, leerFichaDeVenta, notaDeCreditoDeVenta,
  type ExtraDeVenta, type FichaDeVenta, type FilaVentaLista, type MarcaErp, type QueSabeElMotor,
} from '@/lib/erp/cliente'
import { COBRO, ESTADO, historialDeVenta, plata } from '@/lib/erp/ventas-lista.core.js'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import { MOTIVO_MINIMO, NOMBRE_CANAL } from '@/lib/erp/venta.core.js'

const ENTREGA: Record<string, string> = { retira: 'Retira', envio: 'Envío', cadete: 'Cadete' }
const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }

export function FichaVenta({ marca, fila, accionInicial, puede, onCerrar, onCambio, abrirVentana, irACaja, version }: {
  marca: MarcaErp
  fila: FilaVentaLista
  accionInicial?: 'anular'
  puede: QueSabeElMotor
  onCerrar: () => void
  onCambio: (aviso: string) => void
  abrirVentana: (tipo: 'cobro' | 'editar') => void
  irACaja: (que: 'cambio' | 'factura') => void
  version: number
}) {
  const [ficha, setFicha] = useState<FichaDeVenta | null>(null)
  const [extra, setExtra] = useState<ExtraDeVenta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState(accionInicial === 'anular')
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const { confirmar } = useConfirmar()
  const esPedido = fila.kind === 'pedido'

  useEffect(() => {
    if (esPedido) return
    let vivo = true
    Promise.all([leerFichaDeVenta(marca, fila.id), leerExtraDeVenta(marca, fila.id)])
      .then(([f, x]) => { if (vivo) { setFicha(f); setExtra(x); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer la venta.'))
    return () => { vivo = false }
  }, [marca, fila.id, esPedido, version])

  async function correr(fn: () => Promise<void>, fallo: string) {
    setTrabajando(true)
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : fallo)
    } finally {
      setTrabajando(false)
    }
  }

  const confirmarAnular = () => correr(async () => {
    const r = await anularVenta(marca, fila.id, motivo)
    setAnulando(false)
    setMotivo('')
    onCambio(`Venta ${fila.ref} anulada.${r.ncPendiente ? ' Tenía factura: falta la nota de crédito.' : ''}`)
  }, 'No se pudo anular.')

  async function hacerNC() {
    const ok = await confirmar({
      titulo: `Nota de crédito de la venta ${fila.ref}`,
      mensaje: 'Anula entera la factura de esta venta ante ARCA. Una nota de crédito con CAE no se elimina.',
      ok: 'Hacer nota de crédito', tono: 'danger',
    })
    if (!ok) return
    await correr(async () => {
      const r = await notaDeCreditoDeVenta(marca, fila.id)
      onCambio(`Nota de crédito ${r.autorizada.numero} autorizada (CAE ${r.autorizada.cae})${r.ambiente !== 'produccion' ? ', de prueba' : ''}.${r.sinAtar ? ` ${r.sinAtar}` : ''}`)
    }, 'No se pudo hacer la nota de crédito.')
  }

  const titulo = `${esPedido ? `Pedido ${fila.ref}` : `Venta ${fila.ref}`} · ${cuandoCorto(fila.ocurridaEn)}`
  const debe = fila.saldo > 0 && !esPedido
  const v = ficha?.venta
  const menu: AccionMenu[] = esPedido ? [] : [
    ...(ficha?.facturada && v?.estado === 'anulada' && !ficha.acreditadaEntera ? [{ key: 'nc', label: 'Hacer nota de crédito', icono: 'factura' as const, tone: 'danger' as const, onClick: () => void hacerNC() }] : []),
    ...(!fila.facturada && !fila.anulada && fila.tipo === 'venta' ? [{ key: 'fac', label: 'Facturar (Caja › Factura)', icono: 'factura' as const, onClick: () => irACaja('factura') }] : []),
    { key: 'anular', label: 'Anular…', icono: 'anular', tone: 'danger', disabled: !!ficha?.puedeAnular || fila.anulada, hint: ficha?.puedeAnular ?? undefined, onClick: () => setAnulando(true) },
  ]
  const hechos: HechoHistorial[] = ficha ? (historialDeVenta(ficha, { ...extra, tn: extra?.tn ?? undefined }) as HechoHistorial[]) : []
  const h3: React.CSSProperties = { margin: 0, fontSize: font.lg, fontWeight: weight.bold }
  const nota = extra?.nota ?? fila.nota

  return (
    <FichaCostado abierta onCerrar={onCerrar} titulo={titulo} etiqueta={`Ficha de la venta ${fila.ref}`}>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: weight.bold, overflowWrap: 'anywhere' }}>{fila.cliente}</h2>
          {fila.clienteDe === 'gn' && <div style={{ fontSize: font.sm, color: color.mut }}>el nombre sale de GN</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <ChipEstado mapa={ESTADO} k={fila.estadoKey} /><ChipEstado mapa={COBRO} k={fila.cobroKey} />{fila.prueba && <ChipEstado mapa={{ p: ['warning', 'Prueba'] }} k="p" />}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: font.sm, color: color.mut }}>{debe || esPedido ? 'Saldo' : 'Total'}</div>
          <div style={{ fontSize: 26, fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', color: debe || esPedido ? 'var(--mo-warning-ink)' : color.ink }}>{plata(debe || esPedido ? fila.saldo : fila.total)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
        {debe && <Button onClick={() => abrirVentana('cobro')}>Registrar cobro</Button>}
        {fila.link && <Button variant={esPedido ? 'solid' : 'outline'} onClick={() => window.open(fila.link!, '_blank', 'noopener')}>Ver el pedido en Tienda Nube ↗</Button>}
        {!esPedido && <Button variant="outline" disabled={fila.anulada} onClick={() => abrirVentana('editar')}>Editar</Button>}
        {!esPedido && <Button variant="outline" disabled={fila.anulada} onClick={() => irACaja('cambio')}>Hacer cambio</Button>}
        <MenuAcciones acciones={menu} etiqueta={`Más acciones de la venta ${fila.ref}`} vertical />
      </div>

      {esPedido ? (
        <Notice tone="warning">Pedido de Tienda Nube <b>sin pagar</b>: todavía no es una venta. Pasa a venta solo cuando Tienda Nube avisa que se pagó; hasta el día del corte se cobra en Tienda Nube.{fila.unidades != null && ` Retiene ${fila.unidades} ${fila.unidades === 1 ? 'prenda' : 'prendas'}.`}</Notice>
      ) : !ficha ? (
        <span style={{ color: color.mut }}>Leyendo la venta…</span>
      ) : (
        <>
          {v?.prueba && <Notice tone="warning">De prueba: corre en paralelo con GN y no movió el stock del libro. La factura real sale de GN.</Notice>}
          {ficha.anulacion && <Notice tone="danger">Anulada el {cuandoCorto(ficha.anulacion.anuladaEn)} por {ficha.anulacion.usuario}: «{ficha.anulacion.motivo}».</Notice>}

          <DatosFicha>
            <DatoFicha titulo="Origen">{fila.origenTexto}</DatoFicha>
            <DatoFicha titulo="Factura">{fila.factura ? `${fila.factura.numero}${fila.factura.de === 'gn' ? ' (GN)' : ''}` : 'Sin factura'}</DatoFicha>
            <DatoFicha titulo="Vendió">{extra?.vendedor || fila.vendio}</DatoFicha>
            <DatoFicha titulo="Sale de">{NOMBRE_DEPOSITO[v!.deposito as keyof typeof NOMBRE_DEPOSITO] ?? v!.deposito}</DatoFicha>
            <DatoFicha titulo="Canal">{NOMBRE_CANAL[v!.canal as keyof typeof NOMBRE_CANAL] ?? v!.canal}</DatoFicha>
            <DatoFicha titulo="Línea">{LINEA[v!.marca] ?? v!.marca}</DatoFicha>
            {extra?.entrega && <DatoFicha titulo="Entrega">{[ENTREGA[extra.entrega.tipo], extra.entrega.direccion].filter(Boolean).join(' · ')}</DatoFicha>}
            {extra?.gnNumero && <DatoFicha titulo="En GN">{`venta ${extra.gnNumero}`}</DatoFicha>}
          </DatosFicha>

          {nota ? (
            <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', padding: '12px 14px', borderRadius: 10, background: 'var(--mo-warning-bg)', border: '1px solid var(--mo-warning-border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: font.sm, color: 'var(--mo-warning-ink)', fontWeight: weight.semibold }}>Nota · <span style={{ fontWeight: weight.normal }}>{nota.de}</span></div>
                <div style={{ color: color.ink, overflowWrap: 'anywhere' }}>{nota.texto}</div>
              </div>
              {!fila.anulada && <Button size="sm" variant="ghost" onClick={() => abrirVentana('editar')}>Editar</Button>}
            </div>
          ) : !fila.anulada && <div><Button size="sm" variant="outline" onClick={() => abrirVentana('editar')}>Agregar nota</Button></div>}

          <section>
            <h3 style={h3}>Prendas</h3>
            {ficha.lineas.map((l) => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], padding: '10px 0', borderBottom: `1px solid ${color.bg2}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: weight.semibold }}>{l.nombre ?? `Producto ${l.producto}`}{l.devuelta && <span style={{ marginLeft: 6, color: 'var(--mo-warning-ink)', fontSize: font.sm }}>devuelta</span>}</div>
                  <div style={{ fontSize: font.sm, color: color.mut }}>Talle {l.talleNombre ?? l.talle} · {l.cantidad} u.{l.sku ? ` · ${l.sku}` : ''}{l.descuento || l.rebaja ? ` · desc. ${plata(l.descuento + l.rebaja)}` : ''}</div>
                </div>
                <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{plata(l.importe)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontWeight: weight.bold }}><span>Total</span><span>{plata(v!.total)}</span></div>
            {ficha.pagos.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', color: color.mut }}>
                <span>{p.medio === 'cuenta' ? 'Quedó a cuenta' : p.cuenta ?? p.medio ?? 'Pago'}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.medio === 'cuenta' ? '' : '− '}{plata(p.monto)}</span>
              </div>
            ))}
            {debe && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', fontWeight: weight.bold, color: 'var(--mo-warning-ink)' }}><span>Saldo</span><span>{plata(fila.saldo)}</span></div>}
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            <div><h3 style={h3}>Historial de la venta</h3><span style={{ fontSize: font.sm, color: color.mut }}>todo lo que le pasó, con quién y cuándo</span></div>
            <Historial hechos={hechos} cuandoTexto={cuandoCorto} />
            {extra?.motor && <span style={{ fontSize: font.sm, color: color.mut2 }}>Las ediciones y las notas todavía no se leen: {extra.motor}</span>}
            {!puede.editar && !extra?.motor && <span style={{ fontSize: font.sm, color: color.mut2 }}>Editar espera al motor.</span>}
          </section>
        </>
      )}

      <Modal
        abierto={anulando} onCerrar={() => setAnulando(false)} titulo={`Anular la venta ${fila.ref}`}
        pie={<>
          <Button variant="outline" onClick={() => setAnulando(false)}>Cancelar</Button>
          <Button tone="danger" disabled={trabajando || motivo.trim().length < MOTIVO_MINIMO || !!ficha?.puedeAnular} onClick={() => void confirmarAnular()}>Anular venta</Button>
        </>}
      >
        {ficha?.puedeAnular ? <Notice tone="warning">{ficha.puedeAnular}</Notice> : (
          <p style={{ marginTop: 0 }}>
            {v?.prueba ? 'Es de prueba: el stock no se mueve. La plata vuelve' : `Las prendas vuelven al stock de ${v ? NOMBRE_DEPOSITO[v.deposito as keyof typeof NOMBRE_DEPOSITO] ?? v.deposito : 'su depósito'} y la plata,`} a los mismos pagos.
            Una venta anulada no se puede volver a confirmar.{ficha?.facturada && ' Tiene factura: después hay que hacer la nota de crédito.'}
          </p>
        )}
        <Field label="Motivo" required hint="Queda guardado con tu nombre.">
          <textarea className="mo-input mo-input--multi" style={{ width: '100%', boxSizing: 'border-box' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
      </Modal>
    </FichaCostado>
  )
}
