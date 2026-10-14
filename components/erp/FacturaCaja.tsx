'use client'

/**
 * ERP › Caja › Factura: la factura A PEDIDO en el mostrador. Se busca la venta propia, se elige B (consumidor
 * final, con o sin DNI/CUIT) o A (CUIT y condición de IVA) y sale UNA factura con su CAE, por el mismo lote que
 * la facturación masiva (`facturar-venta` en `api/_erp.js`). El PDF es el mismo de «Facturas del monitor».
 *
 * 🔑 Hasta el corte de GN la venta es de PRUEBA y la factura real del local sale de GN: en producción el
 * servidor la frena (`puedeFacturar`). 🔴 Una factura con CAE ⛔ se elimina: se anula con nota de crédito.
 */

import { useState } from 'react'
import {
  Badge, Button, ConfirmDetalle, EmptyState, Field, Input, MoneyText, Notice, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, space, useConfirmar,
} from '@/components/ui'
import { useSesion } from '@/components/SesionProvider'
import { marcaParaPOS, usarMarcaCaja } from '@/lib/caja/marca'
import { descargarFactura, numeroComprobante, type FacturaEmitida } from '@/lib/arca/factura-pdf'
import { buscarVentas, facturarVenta, leerFichaDeVenta, type FichaDeVenta, type MarcaErp, type PedidoFactura, type VentaPropia } from '@/lib/erp/cliente'
import { NOMBRE_MARCA } from '@/lib/erp/venta.core.js'

const cuando = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}

export function FacturaCaja() {
  const { marca: delShell } = useSesion()
  const store = marcaParaPOS(null, delShell) as MarcaErp
  usarMarcaCaja(store)
  const { confirmar } = useConfirmar()

  const [q, setQ] = useState('')
  const [ventas, setVentas] = useState<VentaPropia[] | null>(null)
  const [ficha, setFicha] = useState<FichaDeVenta | null>(null)
  const [clase, setClase] = useState<'A' | 'B'>('B')
  const [doc, setDoc] = useState('')
  const [condicion, setCondicion] = useState<'' | 'ri' | 'monotributo'>('')
  const [hecha, setHecha] = useState<{ factura: FacturaEmitida; yaEstaba: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function correr(fn: () => Promise<void>, fallo: string) {
    setTrabajando(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : fallo)
    } finally {
      setTrabajando(false)
    }
  }

  const limpiar = () => { setFicha(null); setClase('B'); setDoc(''); setCondicion(''); setHecha(null) }

  const buscar = () => correr(async () => {
    limpiar()
    setVentas((await buscarVentas(store, { q, desde: '', hasta: '' })).ventas.filter((v) => v.tipo === 'venta' && v.estado === 'confirmada'))
  }, 'No se pudo buscar.')

  const abrir = (id: string) => correr(async () => {
    limpiar()
    setFicha(await leerFichaDeVenta(store, id))
  }, 'No se pudo leer la venta.')

  const docLimpio = doc.replace(/\D/g, '')
  const faltaDato = clase === 'A' ? docLimpio.length !== 11 || !condicion : !!docLimpio && ![7, 8, 11].includes(docLimpio.length)

  async function facturar() {
    if (!ficha) return
    const pedido: PedidoFactura = { ventaId: ficha.venta.id, clase, ...(docLimpio ? { doc: docLimpio } : {}), ...(clase === 'A' && condicion ? { condicion } : {}) }
    const ok = await confirmar({
      titulo: `Factura ${clase} de la venta #${ficha.venta.numero}`,
      mensaje: (
        <div>
          <ConfirmDetalle label="Total" valor={<MoneyText value={ficha.venta.total} />} />
          <ConfirmDetalle label="Para" valor={clase === 'A' ? `CUIT ${docLimpio} · ${condicion === 'ri' ? 'Responsable inscripta' : 'Monotributista'}` : docLimpio ? `Consumidor final · ${docLimpio}` : 'Consumidor final'} />
          <p style={{ marginTop: space[3] }}>Una factura con CAE ⛔ se elimina: si sale mal, se anula con nota de crédito.</p>
        </div>
      ),
      ok: 'Facturar',
      tono: 'warning',
    })
    if (!ok) return
    await correr(async () => {
      const r = await facturarVenta(store, pedido)
      setHecha({ factura: r.factura, yaEstaba: r.yaEstaba })
      setFicha(await leerFichaDeVenta(store, ficha.venta.id))
    }, 'No se pudo facturar.')
  }

  const bajar = (f: FacturaEmitida) => correr(() => descargarFactura(f), 'No se pudo armar el PDF.')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title={`Factura · ${NOMBRE_MARCA[store] ?? store}`} subtitle="La factura que pide la clienta en el mostrador: buscá la venta y elegí A o B.">
        <Notice tone="warning">Hasta que se apague GN la factura real del local sale de GN: acá sólo sale en el ambiente de prueba de ARCA.</Notice>
        <form onSubmit={(e) => { e.preventDefault(); void buscar() }} style={{ display: 'flex', gap: space[2], marginTop: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Venta" style={{ flex: '1 1 220px' }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="#123, nombre, DNI o mail" />
          </Field>
          <Button type="submit" disabled={trabajando}>Buscar</Button>
        </form>
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecha && (
        <Notice tone="success" onClose={() => setHecha(null)}>
          {hecha.yaEstaba ? 'La venta ya tenía esta factura' : 'Factura autorizada'}: {numeroComprobante(hecha.factura)} · CAE {hecha.factura.cae}
          {hecha.factura.ambiente !== 'produccion' && ' (de prueba, sin validez fiscal)'}.{' '}
          <Button variant="outline" disabled={trabajando} onClick={() => void bajar(hecha.factura)}>Descargar PDF</Button>
        </Notice>
      )}

      {ventas && !ficha && (
        <SectionCard title="Ventas">
          {!ventas.length ? <EmptyState title="No hay ventas para facturar con esa búsqueda." /> : (
            <TableWrap>
              <table>
                <THead><Tr><Th>Nº</Th><Th>Cuándo</Th><Th>Cliente</Th><Th style={{ textAlign: 'right' }}>Total</Th></Tr></THead>
                <TBody>
                  {ventas.map((v) => (
                    <Tr key={v.id} onClick={() => void abrir(v.id)} style={{ cursor: 'pointer' }}>
                      <Td>#{v.numero}{v.prueba && <> <Badge tone="warning">Prueba</Badge></>}</Td>
                      <Td>{cuando(v.ocurridaEn)}</Td>
                      <Td>{v.cliente ?? 'Consumidor final'}</Td>
                      <Td style={{ textAlign: 'right' }}><MoneyText value={v.total} /></Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableWrap>
          )}
        </SectionCard>
      )}

      {ficha && (
        <SectionCard title={`Venta #${ficha.venta.numero}`} subtitle={`${cuando(ficha.venta.ocurridaEn)} · ${ficha.cliente?.nombre ?? 'Consumidor final'}`}>
          <div style={{ marginBottom: space[3] }}>
            <Button variant="outline" onClick={limpiar}>Volver a las ventas</Button>
          </div>
          <TableWrap>
            <table>
              <THead><Tr><Th>Prenda</Th><Th style={{ textAlign: 'right' }}>Cant.</Th><Th style={{ textAlign: 'right' }}>Importe</Th></Tr></THead>
              <TBody>
                {ficha.lineas.map((l) => (
                  <Tr key={l.id}>
                    <Td>{l.nombre ?? l.sku ?? `Prenda ${l.producto}`}{l.talleNombre && ` · ${l.talleNombre}`}</Td>
                    <Td style={{ textAlign: 'right' }}>{l.cantidad}</Td>
                    <Td style={{ textAlign: 'right' }}><MoneyText value={l.importe} /></Td>
                  </Tr>
                ))}
                <Tr><Td><strong>Total cobrado</strong></Td><Td /><Td style={{ textAlign: 'right' }}><strong><MoneyText value={ficha.venta.total} /></strong></Td></Tr>
              </TBody>
            </table>
          </TableWrap>

          {ficha.facturada ? (
            <Notice tone="neutral">Esta venta ya tiene factura. Para volver a bajar el PDF, tocá «Facturar» de nuevo: sale la MISMA, ⛔ una nueva.</Notice>
          ) : null}
          <div style={{ display: 'flex', gap: space[2], marginTop: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Factura">
              <Select value={clase} onChange={(e) => { setClase(e.target.value as 'A' | 'B'); setCondicion('') }}>
                <option value="B">B · consumidor final</option>
                <option value="A">A · responsable inscripta o monotributista</option>
              </Select>
            </Field>
            <Field label={clase === 'A' ? 'CUIT' : 'DNI o CUIT (opcional)'} style={{ flex: '1 1 180px' }}>
              <Input value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" placeholder={clase === 'A' ? '30-12345678-9' : 'Vacío = sin identificar'} />
            </Field>
            {clase === 'A' && (
              <Field label="Condición de IVA">
                <Select value={condicion} onChange={(e) => setCondicion(e.target.value as '' | 'ri' | 'monotributo')}>
                  <option value="">Elegir…</option>
                  <option value="ri">Responsable inscripta</option>
                  <option value="monotributo">Monotributista</option>
                </Select>
              </Field>
            )}
            <Button disabled={trabajando || faltaDato} onClick={() => void facturar()}>Facturar</Button>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
