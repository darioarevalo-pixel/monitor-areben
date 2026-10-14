'use client'

/**
 * ERP › Caja: el CAMBIO en el local (Bruno, 14-oct: hoy se hace en el POS de GN y es por lo que se quiere
 * migrar). Se busca la venta, se marca lo que devuelve, se escanea lo que se lleva y la diferencia se
 * cobra o queda a favor. Lo registra el motor (`registrarCambio`), atado a la venta original.
 *
 * 🔑 Usa el MISMO código de la Caja, ⛔ una copia (`pantallas.md`): buscar la prenda (`buscarProducto`),
 * su precio de etiqueta (`construirPrecios` + `precioDeFeria`), el importe (`renglones`) y la regla de
 * la prenda repetida (`exigirDevolucion`). El día del corte de GN esto se muda al POS.
 * 🔑 Hasta el corte es de PRUEBA: ⛔ mueve el stock ni sale a GN (el local sigue cambiando en GN).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Badge, Button, EmptyState, Field, Input, MoneyText, Notice, NumberField, PasoCantidad, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, space,
} from '@/components/ui'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { construirPrecios } from '@/lib/etiquetas/core'
import { precioDeFeria, renglones } from '@/lib/caja/core.core.js'
import { exigirDevolucion } from '@/lib/caja/repetida.core.js'
import { buscarProducto, elegirVariante, leerConfig, type Candidato, type Config, type Variante } from '@/lib/caja/cliente'
import { marcaParaPOS, usarMarcaCaja } from '@/lib/caja/marca'
import { buscarVentas, cambiarVenta, leerFichaDeVenta, type FichaDeVenta, type MarcaErp, type VentaPropia } from '@/lib/erp/cliente'
import { NOMBRE_MARCA, diferenciaDeCambio } from '@/lib/erp/venta.core.js'

type Nueva = { variante: Variante; cantidad: number; precio: number | '' }
type Hecho = { numero: number; diferencia: number; aFavor: number; ncPendiente: boolean }

const cuando = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}
const nuevoId = () => crypto.randomUUID()

export function CambioCaja() {
  const { marca: delShell } = useSesion()
  // La marca de la Caja ANTES de pedir nada (`lib/caja/cliente.ts` la lee en cada pedido), como la pestaña Caja.
  const store = marcaParaPOS(null, delShell) as MarcaErp
  usarMarcaCaja(store)
  const { datos } = useDatosMonitor()
  const tnIdx = useTnPromo(store)
  const [config, setConfig] = useState<Config | null>(null)

  const [q, setQ] = useState('')
  const [ventas, setVentas] = useState<VentaPropia[] | null>(null)
  const [ficha, setFicha] = useState<FichaDeVenta | null>(null)
  const [devuelve, setDevuelve] = useState<Record<string, number>>({})
  const [nuevas, setNuevas] = useState<Nueva[]>([])
  const [codigoDev, setCodigoDev] = useState('')
  const [codigoNueva, setCodigoNueva] = useState('')
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null)
  const [cuenta, setCuenta] = useState('')
  const [id, setId] = useState(nuevoId)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    let vivo = true
    leerConfig().then((c) => vivo && setConfig(c)).catch((e) => vivo && setError(e.message))
    return () => { vivo = false }
  }, [store])

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

  function empezarDeNuevo() {
    setFicha(null)
    setDevuelve({})
    setNuevas([])
    setCuenta('')
    setCandidatos(null)
    setId(nuevoId())
  }

  const buscar = () => correr(async () => {
    empezarDeNuevo()
    setHecho(null)
    setVentas((await buscarVentas(store, { q, desde: '', hasta: '' })).ventas.filter((v) => v.tipo === 'venta' && v.estado === 'confirmada'))
  }, 'No se pudo buscar.')

  const abrir = (ventaId: string) => correr(async () => {
    empezarDeNuevo()
    setFicha(await leerFichaDeVenta(store, ventaId))
  }, 'No se pudo leer la venta.')

  /** El precio de la etiqueta, con la regla de la Caja (la de Etiquetas, y la de su campaña si es de feria). */
  const precioDe = (productId: number): number | null => {
    const p = datos?.allProductos.find((x) => String(x.id) === String(productId))
    if (!p || !tnIdx) return null
    return precioDeFeria(config?.reglas ?? null, productId) ?? (construirPrecios([p], tnIdx).precios[p.id] || null)
  }

  const vendidas = useMemo(() => (ficha?.lineas ?? []).filter((l) => l.cantidad > 0), [ficha])
  const comoPrenda = (l: (typeof vendidas)[number]) => ({ product_id: Number(l.producto), size_id: Number(l.talle), nombre: l.nombre ?? undefined, talle: l.talleNombre ?? undefined })

  /** Devolver una unidad más de una línea: bloquea lo que esa venta ⛔ vendió (la regla de la Caja). */
  function sumarDevuelta(lineaId: string, n: number) {
    const otra = { ...devuelve, [lineaId]: Math.max(0, n) }
    try {
      exigirDevolucion({
        vendidas: vendidas.map((l) => ({ ...comoPrenda(l), cantidad: l.cantidad })),
        yaDevueltas: vendidas.map((l) => ({ ...comoPrenda(l), cantidad: l.cambiado })),
        devuelve: vendidas.filter((l) => otra[l.id]).map((l) => ({ ...comoPrenda(l), cantidad: otra[l.id] })),
      })
      setDevuelve(otra)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se puede devolver esa prenda.')
    }
  }

  /** Escanear la prenda que devuelve: se busca con la Caja y se marca la línea de ESA venta. */
  const escanearDevuelta = () => correr(async () => {
    const r = await buscarProducto(codigoDev.trim())
    setCodigoDev('')
    if (!('variante' in r)) throw new Error('Ese código es de varias prendas: marcá la devuelta en la lista.')
    const l = vendidas.find((x) => Number(x.producto) === r.variante.product_id && Number(x.talle) === r.variante.size_id)
    if (!l) throw new Error(`${r.variante.product_name} talle ${r.variante.size_name} no está en esa venta: no se puede devolver con este ticket.`)
    sumarDevuelta(l.id, (devuelve[l.id] || 0) + 1)
  }, 'No se pudo buscar la prenda.')

  function sumarNueva(v: Variante) {
    setCandidatos(null)
    setNuevas((xs) => {
      const i = xs.findIndex((x) => x.variante.product_id === v.product_id && x.variante.size_id === v.size_id)
      if (i >= 0) return xs.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1 } : x))
      return [...xs, { variante: v, cantidad: 1, precio: precioDe(v.product_id) ?? '' }]
    })
  }

  const escanearNueva = () => correr(async () => {
    const r = await buscarProducto(codigoNueva.trim())
    setCodigoNueva('')
    if ('variante' in r) sumarNueva(r.variante)
    else if (r.candidatos.length) setCandidatos(r.candidatos)
    else throw new Error('No se encontró la prenda.')
  }, 'No se pudo buscar la prenda.')

  const elegir = (c: Candidato) => correr(async () => {
    const r = await elegirVariante(c)
    if ('variante' in r) sumarNueva(r.variante)
  }, 'No se pudo traer la prenda.')

  // Lo que se lleva, con el importe de la Caja (`renglones`); sin precio todavía ⛔ se puede cobrar.
  const sinPrecio = nuevas.some((n) => !(Number(n.precio) > 0))
  const items = nuevas.map((n) => ({ product_id: n.variante.product_id, size_id: n.variante.size_id, cantidad: n.cantidad, precio: Number(n.precio), sku: n.variante.sku }))
  let filas: Array<{ importe: number }> = []
  try {
    filas = sinPrecio || !items.length ? [] : renglones(items)
  } catch {
    filas = []
  }
  const devueltas = Object.entries(devuelve).filter(([, n]) => n > 0).map(([lineaId, cantidad]) => ({ lineaId, cantidad }))
  const diferencia = ficha ? diferenciaDeCambio({ lineas: ficha.lineas, devueltas, nuevas: filas }) : 0
  const cuentas = Object.entries(config?.reglas.cuentas ?? {})
  const listo = !!ficha && devueltas.length > 0 && !sinPrecio && (diferencia <= 0 || !!cuenta)

  const confirmar = () => correr(async () => {
    if (!ficha) return
    const r = await cambiarVenta(store, {
      id, ventaId: ficha.venta.id, devueltas, items,
      pagos: diferencia > 0 ? [{ cuenta: Number(cuenta), monto: diferencia }] : [],
    })
    setHecho({ numero: r.venta.numero, diferencia, aFavor: r.aFavor, ncPendiente: r.ncPendiente })
    setVentas(null)
    setQ('')
    empezarDeNuevo()
  }, 'No se pudo registrar el cambio.')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title={`Cambio · ${NOMBRE_MARCA[store] ?? store}`} subtitle="Buscá la venta por número o cliente, marcá lo que devuelve y escaneá lo que se lleva.">
        <Notice tone="warning">De prueba hasta que se apague GN: ⛔ mueve el stock ni sale a GN. El cambio de verdad se sigue haciendo en GN.</Notice>
        <form onSubmit={(e) => { e.preventDefault(); void buscar() }} style={{ display: 'flex', gap: space[2], marginTop: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Venta" style={{ flex: '1 1 220px' }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="#123, nombre, DNI o mail" />
          </Field>
          <Button type="submit" disabled={trabajando}>Buscar</Button>
        </form>
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && (
        <Notice tone="success" onClose={() => setHecho(null)}>
          Cambio #{hecho.numero} registrado.{' '}
          {hecho.diferencia > 0 ? <>Se cobraron <MoneyText value={hecho.diferencia} />.</> : hecho.aFavor > 0 ? <>Quedan <MoneyText value={hecho.aFavor} /> a favor de la clienta.</> : 'Sin diferencia.'}
          {hecho.ncPendiente && ' La venta tenía factura: falta la nota de crédito.'}
        </Notice>
      )}

      {ventas && !ficha && (
        <SectionCard title="Ventas">
          {!ventas.length ? <EmptyState title="No hay ventas para cambiar con esa búsqueda." /> : (
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
        <>
          <SectionCard title={`Devuelve · venta #${ficha.venta.numero}`} subtitle="Al precio que se pagó, ⛔ al de hoy.">
            <div style={{ display: 'flex', gap: space[2], marginBottom: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Button variant="outline" onClick={() => { setFicha(null); empezarDeNuevo() }}>Volver a las ventas</Button>
              <form onSubmit={(e) => { e.preventDefault(); if (codigoDev.trim()) void escanearDevuelta() }} style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
                <Field label="Escanear lo que devuelve"><Input value={codigoDev} onChange={(e) => setCodigoDev(e.target.value)} placeholder="Código o SKU" /></Field>
              </form>
            </div>
            <TableWrap>
              <table>
                <THead><Tr><Th>Prenda</Th><Th>Talle</Th><Th style={{ textAlign: 'right' }}>Vendidas</Th><Th style={{ textAlign: 'right' }}>Pagó c/u</Th><Th>Devuelve</Th></Tr></THead>
                <TBody>
                  {vendidas.map((l) => {
                    const queda = l.cantidad - l.cambiado
                    return (
                      <Tr key={l.id}>
                        <Td>{l.nombre ?? `Producto ${l.producto}`}{l.cambiado > 0 && <> <Badge tone="neutral">{l.cambiado} ya cambiada{l.cambiado > 1 ? 's' : ''}</Badge></>}</Td>
                        <Td>{l.talleNombre ?? l.talle}</Td>
                        <Td style={{ textAlign: 'right' }}>{l.cantidad}</Td>
                        <Td style={{ textAlign: 'right' }}><MoneyText value={Math.round((l.importe / l.cantidad) * 100) / 100} /></Td>
                        <Td>{queda > 0 ? <PasoCantidad valor={devuelve[l.id] || 0} onCambio={(n) => sumarDevuelta(l.id, n)} etiqueta="prenda devuelta" etiquetaPlural="prendas devueltas" /> : '—'}</Td>
                      </Tr>
                    )
                  })}
                </TBody>
              </table>
            </TableWrap>
          </SectionCard>

          <SectionCard title="Se lleva" subtitle="Con el precio de la etiqueta; se puede cambiar, como en la Caja.">
            <form onSubmit={(e) => { e.preventDefault(); if (codigoNueva.trim()) void escanearNueva() }} style={{ display: 'flex', gap: space[2], marginBottom: space[3], alignItems: 'flex-end' }}>
              <Field label="Escanear lo que se lleva"><Input value={codigoNueva} onChange={(e) => setCodigoNueva(e.target.value)} placeholder="Código, SKU o nombre" /></Field>
            </form>
            {candidatos && (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
                {candidatos.map((c) => (
                  <Button key={`${c.product_id}/${c.size_id}`} variant="outline" onClick={() => void elegir(c)}>{c.product_name} · {c.size_name}</Button>
                ))}
              </div>
            )}
            {!nuevas.length ? <EmptyState title="Sin prendas nuevas: si no se lleva nada, la diferencia queda a favor." /> : (
              <TableWrap>
                <table>
                  <THead><Tr><Th>Prenda</Th><Th>Talle</Th><Th>Cantidad</Th><Th>Precio</Th></Tr></THead>
                  <TBody>
                    {nuevas.map((n, i) => (
                      <Tr key={`${n.variante.product_id}/${n.variante.size_id}`}>
                        <Td>{n.variante.product_name}</Td>
                        <Td>{n.variante.size_name}</Td>
                        <Td>
                          <PasoCantidad valor={n.cantidad} onCambio={(c) => setNuevas((xs) => (c <= 0 ? xs.filter((_, j) => j !== i) : xs.map((x, j) => (j === i ? { ...x, cantidad: c } : x))))} etiqueta="prenda" etiquetaPlural="prendas" />
                        </Td>
                        <Td><NumberField value={n.precio} prefix="$" onChange={(p) => setNuevas((xs) => xs.map((x, j) => (j === i ? { ...x, precio: p } : x)))} invalid={!(Number(n.precio) > 0)} width={120} /></Td>
                      </Tr>
                    ))}
                  </TBody>
                </table>
              </TableWrap>
            )}
          </SectionCard>

          <SectionCard title="Diferencia">
            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ fontSize: 18 }}>
                {diferencia > 0 ? <>A pagar: <MoneyText value={diferencia} strong /></> : diferencia < 0 ? <>A favor de la clienta: <MoneyText value={-diferencia} strong /></> : 'Sin diferencia'}
              </div>
              {diferencia > 0 && (
                <Field label="Forma de pago">
                  <Select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                    <option value="">Elegir…</option>
                    {cuentas.map(([k, c]) => <option key={k} value={k}>{c.nombre}</option>)}
                  </Select>
                </Field>
              )}
              <span style={{ flex: 1 }} />
              <Button disabled={!listo || trabajando} onClick={() => void confirmar()}>Confirmar cambio</Button>
            </div>
            {sinPrecio && <Notice tone="warning">Falta el precio de una prenda nueva.</Notice>}
            {diferencia > 0 && <Notice tone="action">La diferencia se cobra sin el descuento de la forma de pago (falta decidirlo).</Notice>}
          </SectionCard>
        </>
      )}
    </div>
  )
}
