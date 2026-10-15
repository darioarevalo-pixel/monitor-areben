'use client'

/**
 * ERP › Ventas. El buscador y la ficha de una venta PROPIA (la que escribe el motor, ⛔ la de GN):
 * prendas, pagos, factura y estado, con sus cambios. Desde la ficha se anula, con motivo y sólo admin
 * (la sección entera es sólo admin). Contrato: `~/Documents/erp-monitor/contrato-venta.md`.
 *
 * 🔑 Una venta ⛔ se edita: anular es otra fila y devuelve las prendas al libro; un cambio es otra
 * venta atada a ésta. Lo marcado «Prueba» entró antes del corte de GN y ⛔ movió el libro.
 */

import { useState } from 'react'
import {
  Badge, Button, EmptyState, Field, Input, Modal, MoneyText, Notice, SectionCard, TableWrap, TBody, Td, Th, THead, Tr, Tabs, space, useConfirmar,
} from '@/components/ui'
import { anularVenta, buscarVentas, leerFichaDeVenta, notaDeCreditoDeVenta, type FichaDeVenta, type MarcaErp, type VentaPropia } from '@/lib/erp/cliente'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import { MOTIVO_MINIMO, NOMBRE_CANAL, NOMBRE_MARCA, NOMBRE_ORIGEN_VENTA } from '@/lib/erp/venta.core.js'

const MARCAS: Array<{ key: MarcaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'bdi', label: 'BDI' }]
const nombreDe = (mapa: Record<string, string>, k: string | null) => (k == null ? '—' : mapa[k] ?? k)
const cuando = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)} ${d.slice(11, 16)}`
}

function Estado({ v }: { v: Pick<VentaPropia, 'estado' | 'tipo' | 'prueba'> }) {
  return (
    <span style={{ display: 'inline-flex', gap: space[1], flexWrap: 'wrap' }}>
      {v.estado === 'anulada' ? <Badge tone="danger">Anulada</Badge> : <Badge tone="success">Confirmada</Badge>}
      {v.tipo === 'cambio' && <Badge tone="action">Cambio</Badge>}
      {v.prueba && <Badge tone="warning">Prueba</Badge>}
    </span>
  )
}

function ListaDeVentas({ ventas, abrir }: { ventas: VentaPropia[]; abrir: (v: VentaPropia) => void }) {
  return (
    <TableWrap>
      <table>
        <THead><Tr><Th>Nº</Th><Th>Cuándo</Th><Th>Marca</Th><Th>Cliente</Th><Th>Canal</Th><Th>Estado</Th><Th style={{ textAlign: 'right' }}>Total</Th></Tr></THead>
        <TBody>
          {ventas.map((v) => (
            <Tr key={v.id} onClick={() => abrir(v)} style={{ cursor: 'pointer' }}>
              <Td>#{v.numero}</Td>
              <Td>{cuando(v.ocurridaEn)}</Td>
              <Td>{nombreDe(NOMBRE_MARCA, v.marca)}</Td>
              <Td>{v.cliente ?? 'Consumidor final'}</Td>
              <Td>{nombreDe(NOMBRE_CANAL, v.canal)}</Td>
              <Td><Estado v={v} /></Td>
              <Td style={{ textAlign: 'right' }}><MoneyText value={v.total} /></Td>
            </Tr>
          ))}
        </TBody>
      </table>
    </TableWrap>
  )
}

export function VentasPropias() {
  const [marca, setMarca] = useState<MarcaErp>('zattia')
  const [filtro, setFiltro] = useState({ q: '', desde: '', hasta: '' })
  const [ventas, setVentas] = useState<VentaPropia[] | null>(null)
  const [cortado, setCortado] = useState(false)
  const [ficha, setFicha] = useState<FichaDeVenta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const { confirmar } = useConfirmar()

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

  const buscar = () => correr(async () => {
    setFicha(null)
    const r = await buscarVentas(marca, filtro)
    setVentas(r.ventas)
    setCortado(r.cortado)
  }, 'No se pudo buscar.')

  const abrir = (id: string) => correr(async () => { setAviso(null); setFicha(await leerFichaDeVenta(marca, id)) }, 'No se pudo leer la venta.')

  const confirmarAnular = () => correr(async () => {
    if (!ficha) return
    const r = await anularVenta(marca, ficha.venta.id, motivo)
    setAnulando(false)
    setMotivo('')
    setAviso(`Venta #${ficha.venta.numero} anulada.${r.ncPendiente ? ' Tenía factura: falta la nota de crédito.' : ''}`)
    setFicha(await leerFichaDeVenta(marca, ficha.venta.id))
  }, 'No se pudo anular.')

  /** La NC de la factura de una venta anulada: con CAE ⛔ se elimina, por eso se confirma. */
  async function hacerNC() {
    if (!ficha) return
    const ok = await confirmar({
      titulo: `Nota de crédito de la venta #${ficha.venta.numero}`,
      mensaje: 'Anula entera la factura de esta venta ante ARCA. Una nota de crédito con CAE ⛔ se elimina.',
      ok: 'Hacer nota de crédito',
      tono: 'danger',
    })
    if (!ok) return
    await correr(async () => {
      const r = await notaDeCreditoDeVenta(marca, ficha.venta.id)
      setAviso(`Nota de crédito ${r.autorizada.numero} autorizada (CAE ${r.autorizada.cae})${r.ambiente !== 'produccion' ? ', de prueba' : ''}.${r.sinAtar ? ` ${r.sinAtar}` : ''}`)
      setFicha(await leerFichaDeVenta(marca, ficha.venta.id))
    }, 'No se pudo hacer la nota de crédito.')
  }

  // Otra marca: lo de antes se limpia en el MISMO cambio.
  function cambiarMarca(k: string) {
    setMarca(k as MarcaErp)
    setVentas(null)
    setFicha(null)
  }

  const v = ficha?.venta
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Ventas" subtitle="Las ventas propias del monitor (⛔ las de GN). Buscá por número, cliente o fecha; sin nada, las últimas.">
        <Tabs items={MARCAS} value={marca} onChange={cambiarMarca} />
        <form
          onSubmit={(e) => { e.preventDefault(); void buscar() }}
          style={{ display: 'flex', gap: space[2], marginTop: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <Field label="Número o cliente" style={{ flex: '1 1 220px' }}>
            <Input value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} placeholder="#123, nombre, DNI o mail" />
          </Field>
          <Field label="Desde"><Input type="date" value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} /></Field>
          <Field label="Hasta"><Input type="date" value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} /></Field>
          <Button type="submit" disabled={trabajando}>Buscar</Button>
        </form>
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {aviso && <Notice tone="success" onClose={() => setAviso(null)}>{aviso}</Notice>}

      {ventas && !ficha && (
        <SectionCard title="Ventas encontradas" subtitle={cortado ? 'Se muestran las 100 más nuevas: afiná la búsqueda.' : undefined}>
          {!ventas.length ? <EmptyState title="No hay ventas propias con esa búsqueda." /> : <ListaDeVentas ventas={ventas} abrir={(x) => void abrir(x.id)} />}
        </SectionCard>
      )}

      {ficha && v && (
        <>
          <SectionCard
            title={`Venta #${v.numero} · ${nombreDe(NOMBRE_MARCA, v.marca)}`}
            subtitle={`${cuando(v.ocurridaEn)} · ${nombreDe(NOMBRE_ORIGEN_VENTA, v.origen)} · ${nombreDe(NOMBRE_CANAL, v.canal)} · sale de ${nombreDe(NOMBRE_DEPOSITO, v.deposito)} · la hizo ${v.usuario}`}
          >
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', marginBottom: space[3] }}>
              <Button variant="outline" onClick={() => setFicha(null)}>Volver a la búsqueda</Button>
              <Estado v={v} />
              {ficha.conNotaDeCredito ? <Badge tone="neutral">Factura anulada con nota de crédito</Badge> : ficha.facturada ? <Badge tone="action">Facturada</Badge> : <Badge tone="neutral">Sin factura</Badge>}
              {ficha.facturada && !ficha.conNotaDeCredito && v.estado === 'anulada' && (
                <Button tone="danger" variant="outline" disabled={trabajando} onClick={() => void hacerNC()}>Hacer nota de crédito</Button>
              )}
              <span style={{ flex: 1 }} />
              <Button tone="danger" disabled={!!ficha.puedeAnular || trabajando} title={ficha.puedeAnular ?? undefined} onClick={() => setAnulando(true)}>Anular venta</Button>
            </div>
            {v.prueba && <Notice tone="warning">Venta de prueba: entró antes del corte de GN, ⛔ movió el stock del libro ni se factura.</Notice>}
            {ficha.anulacion && (
              <Notice tone="danger">Anulada el {cuando(ficha.anulacion.anuladaEn)} por {ficha.anulacion.usuario}: «{ficha.anulacion.motivo}».</Notice>
            )}
            {ficha.original && (
              <Notice tone="action">
                Es un cambio de la venta <button type="button" style={{ height: 'auto', textDecoration: 'underline', background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }} onClick={() => void abrir(ficha.original!.id)}>#{ficha.original.numero}</button>.
              </Notice>
            )}
            <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', marginTop: space[2] }}>
              <div><b>Cliente:</b> {ficha.cliente ? [ficha.cliente.nombre, ficha.cliente.doc, ficha.cliente.email, ficha.cliente.whatsapp].filter(Boolean).join(' · ') : 'Consumidor final'}</div>
              {v.gnSaleId && <div><b>En GN:</b> {v.gnSaleId}</div>}
            </div>
          </SectionCard>

          <SectionCard title="Prendas" subtitle={v.tipo === 'cambio' ? 'Las devueltas van en negativo, al precio que se pagaron.' : undefined}>
            <TableWrap>
              <table>
                <THead><Tr><Th>Prenda</Th><Th>Talle</Th><Th>SKU</Th><Th style={{ textAlign: 'right' }}>Cant.</Th><Th style={{ textAlign: 'right' }}>Precio</Th><Th style={{ textAlign: 'right' }}>Desc.</Th><Th style={{ textAlign: 'right' }}>Importe</Th></Tr></THead>
                <TBody>
                  {ficha.lineas.map((l) => (
                    <Tr key={l.id}>
                      <Td>{l.nombre ?? `Producto ${l.producto}`}{l.devuelta && <> <Badge tone="warning">Devuelta</Badge></>}</Td>
                      <Td>{l.talleNombre ?? l.talle}</Td>
                      <Td>{l.sku ?? '—'}</Td>
                      <Td style={{ textAlign: 'right' }}>{l.cantidad}</Td>
                      <Td style={{ textAlign: 'right' }}><MoneyText value={l.precio} /></Td>
                      <Td style={{ textAlign: 'right' }}>{l.descuento || l.rebaja ? <MoneyText value={l.descuento + l.rebaja} /> : '—'}</Td>
                      <Td style={{ textAlign: 'right' }}><MoneyText value={l.importe} /></Td>
                    </Tr>
                  ))}
                  <Tr><Td colSpan={6} style={{ textAlign: 'right' }}><b>Total</b></Td><Td style={{ textAlign: 'right' }}><MoneyText value={v.total} strong /></Td></Tr>
                </TBody>
              </table>
            </TableWrap>
          </SectionCard>

          <SectionCard title="Pagos">
            {!ficha.pagos.length ? <EmptyState title="Sin pagos (un cambio sin diferencia a pagar)." /> : (
              <TableWrap>
                <table>
                  <THead><Tr><Th>Cuenta</Th><Th>Medio</Th><Th style={{ textAlign: 'right' }}>Monto</Th></Tr></THead>
                  <TBody>
                    {ficha.pagos.map((p, i) => (
                      <Tr key={i}><Td>{p.cuenta ?? '—'}</Td><Td>{p.medio ?? '—'}</Td><Td style={{ textAlign: 'right' }}><MoneyText value={p.monto} /></Td></Tr>
                    ))}
                  </TBody>
                </table>
              </TableWrap>
            )}
          </SectionCard>

          {ficha.cambios.length > 0 && (
            <SectionCard title="Cambios de esta venta">
              <ListaDeVentas ventas={ficha.cambios} abrir={(x) => void abrir(x.id)} />
            </SectionCard>
          )}

          <Modal
            abierto={anulando}
            onCerrar={() => setAnulando(false)}
            titulo={`Anular la venta #${v.numero}`}
            pie={<>
              <Button variant="outline" onClick={() => setAnulando(false)}>Cancelar</Button>
              <Button tone="danger" disabled={trabajando || motivo.trim().length < MOTIVO_MINIMO} onClick={() => void confirmarAnular()}>Anular venta</Button>
            </>}
          >
            <p style={{ marginTop: 0 }}>
              Las prendas vuelven al stock de {nombreDe(NOMBRE_DEPOSITO, v.deposito)} y la plata, a los mismos pagos
              ({ficha.pagos.map((p) => p.cuenta).filter(Boolean).join(', ') || 'sin pagos'}). Una venta anulada ⛔ se puede volver a confirmar.
              {ficha.facturada && ' Tiene factura: después hay que hacer la nota de crédito.'}
            </p>
            <Field label="Motivo" required hint="Queda guardado con tu nombre.">
              <textarea className="mo-input mo-input--multi" style={{ width: '100%', boxSizing: 'border-box' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>
          </Modal>
        </>
      )}
    </div>
  )
}
