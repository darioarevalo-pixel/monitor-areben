'use client'

/**
 * ERP › Facturación. El tope del mes (lo que entró a cuentas de Areben), lo ya facturado (GN + el
 * monitor) y las ventas que faltan facturar; se elige un grupo y se factura con ARCA.
 *
 * 🔴 Lo que se manda son IDS: el monto de cada factura lo rearma el servidor con los cobros, y el
 * servidor rechaza un grupo que pase lo pendiente. La pantalla sólo propone.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge, Button, ConfirmDetalle, EmptyState, Input, KpiCard, Notice, SectionCard, TableWrap, TBody, Td, Th, THead, Tr, Tabs,
  formatMoney, space, useConfirmar,
} from '@/components/ui'
import { cerrarMes, facturar, leerFacturas, leerMes, notaDeCredito, type MarcaErp, type MesFacturacion, type ResultadoLote, type VentaParaFacturar } from '@/lib/erp/cliente'
import { proponerLote } from '@/motor/arca/mes.core.js'
import { descargarFactura, numeroComprobante, type FacturaEmitida } from '@/lib/arca/factura-pdf'
import { EMISOR, faltanDelEmisor } from '@/motor/arca/emisor.core.js'
import { CBTE } from '@/motor/arca/arca.core.js'
import { esDeVentaPropia } from '@/lib/erp/factura.core.js'

/** Qué comprobante es cada fila: la NC resta (sin esto, factura y NC se veían iguales; caminado 16-oct). */
const NOMBRE_CBTE: Record<number, string> = { [CBTE.FACTURA_A]: 'Factura A', [CBTE.FACTURA_B]: 'Factura B', [CBTE.NC_A]: 'NC A', [CBTE.NC_B]: 'NC B' }
const esNC = (tipo: number) => tipo === CBTE.NC_A || tipo === CBTE.NC_B

const MARCAS: Array<{ key: MarcaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'bdi', label: 'BDI' }]
const mesActual = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7)
const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function Facturacion() {
  const { confirmar } = useConfirmar()
  const [mes, setMes] = useState(mesActual)
  const [datos, setDatos] = useState<MesFacturacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [marca, setMarca] = useState<MarcaErp>('zattia')
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoLote | null>(null)
  const [facturas, setFacturas] = useState<FacturaEmitida[] | null>(null)
  const [bajando, setBajando] = useState<string | null>(null)
  /** La factura que se está por anular con nota de crédito (pide confirmar: con CAE ⛔ se borra). */
  const [hechaNC, setHechaNC] = useState<string | null>(null)

  const leer = useCallback(async () => {
    try {
      const [d, f] = await Promise.all([leerMes(mes), leerFacturas(mes).catch(() => null)])
      setDatos(d)
      setFacturas(f ? f.facturas : null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la facturación del mes.')
    }
  }, [mes])

  useEffect(() => {
    void (async () => {
      await leer()
    })()
  }, [leer])

  // Otro mes: lo de antes se limpia en el MISMO cambio, ⛔ en un efecto (renders en cascada).
  function cambiarMes(m: string) {
    setMes(m)
    setDatos(null)
    setFacturas(null)
    setElegidas(new Set())
    setResultado(null)
  }

  const ventas = useMemo(() => (datos?.ventas || []).filter((v) => v.marca === marca), [datos, marca])
  const sumaElegidas = ventas.filter((v) => elegidas.has(v.ventaId)).reduce((a, v) => a + v.monto, 0)
  const pasaDelPendiente = datos != null && sumaElegidas > datos.pendiente + 0.005

  function alternar(v: VentaParaFacturar) {
    setElegidas((s) => {
      const n = new Set(s)
      if (n.has(v.ventaId)) n.delete(v.ventaId)
      else n.add(v.ventaId)
      return n
    })
  }

  function proponer() {
    if (!datos) return
    const tope = Math.min(datos.porPedido, ventas.length)
    setElegidas(new Set(proponerLote(ventas, datos.pendiente).slice(0, tope).map((v: VentaParaFacturar) => v.ventaId)))
  }

  async function mandar() {
    if (!datos || !elegidas.size) return
    const prueba = datos.ambiente !== 'produccion'
    const ok = await confirmar({
      titulo: prueba ? 'Facturar en el ambiente de prueba' : 'Facturar con ARCA',
      mensaje: (
        <div>
          <ConfirmDetalle label="Marca" valor={MARCAS.find((m) => m.key === marca)?.label} />
          <ConfirmDetalle label="Ventas" valor={elegidas.size} />
          <ConfirmDetalle label="Total" valor={pesos(sumaElegidas)} />
          <ConfirmDetalle label="Punto de venta" valor={datos.puntosDeVenta[marca] ?? '—'} />
          <p style={{ marginTop: space[3] }}>
            {prueba
              ? 'Son facturas de PRUEBA (homologación de ARCA): no tienen validez fiscal.'
              : 'Son facturas REALES: una vez autorizadas no se pueden borrar, sólo anular con nota de crédito.'}
          </p>
        </div>
      ),
      ok: `Facturar ${elegidas.size}`,
      tono: prueba ? 'warning' : 'danger',
    })
    if (!ok) return
    setTrabajando(true)
    setResultado(null)
    try {
      setResultado(await facturar(mes, marca, [...elegidas]))
      setElegidas(new Set())
      await leer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo facturar.')
    } finally {
      setTrabajando(false)
    }
  }

  // Las ventas que ya tienen nota de crédito este mes: su factura ⛔ ofrece otra (una por venta, como GN).
  const conNC = useMemo(() => new Set((facturas || []).filter((f) => esNC(f.tipo)).map((f) => `${f.marca}:${f.venta_id}`)), [facturas])

  /** Con el MISMO aviso que facturar: en producción la NC es REAL y con CAE ⛔ se elimina. */
  async function anularConNC(f: FacturaEmitida) {
    const prueba = f.ambiente !== 'produccion'
    const ok = await confirmar({
      titulo: prueba ? 'Nota de crédito en el ambiente de prueba' : 'Nota de crédito con ARCA',
      mensaje: (
        <div>
          <ConfirmDetalle label="Anula la factura" valor={numeroComprobante(f)} />
          <ConfirmDetalle label="Total" valor={pesos(f.total)} />
          <p style={{ marginTop: space[3] }}>
            {prueba
              ? 'Es de PRUEBA (homologación de ARCA): no tiene validez fiscal.'
              : 'Es REAL: una vez autorizada no se puede eliminar.'}
          </p>
        </div>
      ),
      ok: 'Hacer nota de crédito',
      tono: prueba ? 'warning' : 'danger',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const r = await notaDeCredito(f.id)
      setHechaNC(`Nota de crédito ${r.autorizada.numero} autorizada (CAE ${r.autorizada.cae}) por ${pesos(r.autorizada.total)}.`)
      await leer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo hacer la nota de crédito.')
    } finally {
      setTrabajando(false)
    }
  }

  async function bajar(f: FacturaEmitida) {
    setBajando(f.id)
    try {
      await descargarFactura(f)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar el PDF.')
    } finally {
      setBajando(null)
    }
  }

  async function cerrar() {
    if (!datos) return
    const ok = await confirmar({
      titulo: `Cerrar ${mes}`,
      mensaje: (
        <div>
          <ConfirmDetalle label="Tope que queda fijo" valor={pesos(datos.techoCalculado)} />
          <p style={{ marginTop: space[3] }}>
            Desde que se cierra, el tope ya no cambia aunque se reclasifique una cuenta o GN anule una venta. Se sigue
            facturando contra ese número.
          </p>
        </div>
      ),
      ok: 'Cerrar mes',
      tono: 'warning',
    })
    if (!ok) return
    try {
      await cerrarMes(mes)
      await leer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar el mes.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <Input type="month" value={mes} onChange={(e) => e.target.value && cambiarMes(e.target.value)} style={{ width: 170 }} aria-label="Mes" />
        {datos?.estado === 'cerrado'
          ? <Badge tone="neutral">Cerrado{datos.cerradoPor ? ` por ${datos.cerradoPor}` : ''}</Badge>
          : datos && <Button variant="outline" size="sm" onClick={cerrar}>Cerrar mes</Button>}
      </div>

      {datos?.ambiente === 'homologacion' && (
        <Notice tone="warning">Facturación de PRUEBA (homologación de ARCA): las facturas que salen de acá no tienen validez fiscal.</Notice>
      )}
      {datos && !datos.ambiente && <Notice tone="danger">{datos.errorAmbiente}</Notice>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      {datos && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: space[3] }}>
          <KpiCard
            label="Tope del mes"
            value={formatMoney(datos.techo)}
            sub={datos.estado === 'cerrado' ? 'Fijo desde el cierre' : 'Lo cobrado en cuentas de Areben; cambia hasta cerrar el mes'}
          />
          <KpiCard
            label="Facturado"
            value={formatMoney(datos.facturado)}
            sub={`GN ${formatMoney(datos.facturadoGN)} · monitor ${formatMoney(datos.facturadoMonitor)}`}
          />
          <KpiCard
            label="Pendiente de facturar"
            value={formatMoney(datos.pendiente)}
            tone={datos.pendiente < 0 ? 'danger' : datos.pendiente > 0 ? 'warning' : 'success'}
            sub={datos.pendiente < 0 ? 'Se facturó de más' : undefined}
          />
        </div>
      )}

      {datos && datos.sinClasificar.some((s) => s.cuenta !== '(cobro sin cuenta)') && (
        <Notice tone="warning">
          Cuentas de cobro sin clasificar (no suman al tope):{' '}
          {datos.sinClasificar.filter((s) => s.cuenta !== '(cobro sin cuenta)').map((s) => `${s.cuenta} ${formatMoney(s.monto)}`).join(' · ')}
        </Notice>
      )}

      {resultado && (
        <Notice tone={resultado.rechazadas.length || resultado.noSalen.length ? 'warning' : 'success'} onClose={() => setResultado(null)}>
          {resultado.autorizadas.length} factura(s) autorizada(s) en el punto de venta {resultado.ptoVta}
          {resultado.rechazadas.length > 0 && ` · ${resultado.rechazadas.length} rechazada(s): ${resultado.rechazadas.map((r) => `${r.ventaId} (${r.motivos.join(', ')})`).join('; ')}`}
          {resultado.noSalen.length > 0 && ` · ${resultado.noSalen.length} sin facturar: ${resultado.noSalen.map((r) => `${r.ventaId} (${r.motivos.join(', ')})`).join('; ')}`}
        </Notice>
      )}

      <SectionCard
        title="Ventas sin factura"
        subtitle="Cobradas este mes en cuentas de Areben y sin factura de GN ni del monitor. El monto es lo que entró a esas cuentas."
        actions={
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={proponer} disabled={!datos || !ventas.length || (datos?.pendiente ?? 0) <= 0}>
              Proponer hasta el pendiente
            </Button>
            <Button size="sm" onClick={mandar} disabled={!elegidas.size || trabajando || pasaDelPendiente || !datos?.ambiente}>
              {trabajando ? 'Facturando…' : `Facturar ${elegidas.size || ''} (${pesos(sumaElegidas)})`}
            </Button>
          </div>
        }
      >
        <Tabs items={MARCAS.map((m) => ({ key: m.key, label: m.label }))} value={marca} onChange={(k) => { setMarca(k as MarcaErp); setElegidas(new Set()) }} />
        {pasaDelPendiente && <Notice tone="danger" style={{ marginTop: space[3] }}>Lo elegido pasa lo pendiente del mes.</Notice>}
        {!datos && !error && <p style={{ marginTop: space[3] }}>Cargando…</p>}
        {datos && !ventas.length && <EmptyState title="No quedan ventas sin factura en este mes para esta marca." />}
        {datos && ventas.length > 0 && (
          <TableWrap style={{ marginTop: space[3] }}>
            <THead>
              <Tr><Th /> <Th>Último cobro</Th><Th>Venta</Th><Th>Cuentas</Th><Th style={{ textAlign: 'right' }}>Monto</Th></Tr>
            </THead>
            <TBody>
              {ventas.map((v) => (
                <Tr key={v.ventaId} onClick={() => alternar(v)} style={{ cursor: 'pointer' }}>
                  <Td><input type="checkbox" checked={elegidas.has(v.ventaId)} onChange={() => alternar(v)} onClick={(e) => e.stopPropagation()} aria-label={`Elegir la venta ${v.ventaId}`} /></Td>
                  <Td>{dia(v.fecha)}</Td>
                  <Td>{v.ventaId}</Td>
                  <Td>{v.cuentas.join(', ')}</Td>
                  <Td style={{ textAlign: 'right' }}>{pesos(v.monto)}</Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
        )}
      </SectionCard>

      {hechaNC && <Notice tone="success" onClose={() => setHechaNC(null)}>{hechaNC}</Notice>}
      {facturas && facturas.length > 0 && (
        <SectionCard title="Facturas del monitor" subtitle="Las que salieron de acá este mes, con su CAE. El PDF lleva el QR de ARCA.">
          {(() => {
            const faltan = [...new Set(facturas.flatMap((f) => faltanDelEmisor(EMISOR, f.marca) as string[]))]
            return faltan.length > 0 && (
              <Notice tone="warning" style={{ marginBottom: space[3] }}>Para imprimir faltan datos del emisor: {faltan.join(', ')}.</Notice>
            )
          })()}
          <TableWrap>
            <THead>
              <Tr><Th>Comprobante</Th><Th>Fecha</Th><Th>Marca</Th><Th>Venta</Th><Th>CAE</Th><Th style={{ textAlign: 'right' }}>Total</Th><Th /></Tr>
            </THead>
            <TBody>
              {facturas.map((f) => (
                <Tr key={f.id}>
                  <Td>{NOMBRE_CBTE[f.tipo] ?? 'Comprobante'} {numeroComprobante(f)}</Td>
                  <Td>{dia(f.fecha)}</Td>
                  <Td>{MARCAS.find((m) => m.key === f.marca)?.label}</Td>
                  <Td>{f.venta_numero || f.venta_id}</Td>
                  <Td>{f.cae}</Td>
                  <Td style={{ textAlign: 'right' }}>{esNC(f.tipo) ? `− ${pesos(f.total)}` : pesos(f.total)}</Td>
                  <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {(f.tipo === CBTE.FACTURA_A || f.tipo === CBTE.FACTURA_B) && !conNC.has(`${f.marca}:${f.venta_id}`) && esDeVentaPropia(f.venta_id) && (
                      <><Badge tone="neutral">NC desde ERP › Ventas</Badge>{' '}</>
                    )}
                    {(f.tipo === CBTE.FACTURA_A || f.tipo === CBTE.FACTURA_B) && !conNC.has(`${f.marca}:${f.venta_id}`) && !esDeVentaPropia(f.venta_id) && (
                      <><Button size="sm" variant="outline" disabled={trabajando} onClick={() => void anularConNC(f)}>Hacer nota de crédito</Button>{' '}</>
                    )}
                    <Button variant="outline" size="sm" onClick={() => bajar(f)} disabled={bajando === f.id || faltanDelEmisor(EMISOR, f.marca).length > 0}>
                      {bajando === f.id ? 'Armando…' : 'Descargar PDF'}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
        </SectionCard>
      )}
    </div>
  )
}
