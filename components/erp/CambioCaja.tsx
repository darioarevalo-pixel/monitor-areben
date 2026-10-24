'use client'

/**
 * ERP › Caja: el CAMBIO en el local (Bruno, 14-oct: hoy se hace en el POS de GN y es por lo que se quiere
 * migrar). Se busca la venta, se marca lo que devuelve, se escanea lo que se lleva y la diferencia se
 * cobra o queda a favor. Lo registra el motor (`registrarCambio`), atado a la venta original.
 *
 * 🔑 Usa el MISMO código de la Caja, ⛔ una copia (`pantallas.md`): buscar la prenda (`buscarProducto`),
 * su precio (`precioDeCaja`: etiqueta o feria; Stunned, su Tienda Nube), el importe (`renglones`) y la regla de
 * la prenda repetida (`exigirDevolucion`). El día del corte de GN esto se muda al POS.
 * 🔑 Hasta el corte es de PRUEBA: ⛔ mueve el stock ni sale a GN (el local sigue cambiando en GN).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Badge, Button, EmptyState, Field, Input, MoneyText, Notice, NumberField, PasoCantidad, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, space,
} from '@/components/ui'
import { cuandoCorto } from '@/components/ui/PiezasLista'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { precioDeCaja } from '@/lib/caja/precio'
import { NOMBRE_MEDIO, cuentaDeMedio, renglones } from '@/lib/caja/core.core.js'
import { exigirDevolucion } from '@/lib/caja/repetida.core.js'
import { buscarProducto, elegirVariante, leerConfig, type Candidato, type Config, type Variante } from '@/lib/caja/cliente'
import { marcaParaPOS, usarMarcaCaja } from '@/lib/caja/marca'
import { buscarVentas, cambiarVenta, leerFichaDeVenta, leerSaldo, type CruceCambio, type FichaDeVenta, type MarcaErp, type PagoMp, type VentaPropia } from '@/lib/erp/cliente'
import { NOMBRE_MARCA, cobroDelCambio, diferenciaDeCambio } from '@/lib/erp/venta.core.js'

type Nueva = { variante: Variante; cantidad: number; precio: number | '' }
type Hecho = { numero: number; cobrado: number; aFavor: number; saldo: number | null; ncPendiente: boolean }
type Medio = 'efectivo' | 'transferencia' | 'debito' | 'credito'
/** La transferencia que se espera (como la Caja): el pedido se repite igual hasta que llega el pago. */
type Espera = { desde: string; monto: number; cruce: CruceCambio; recientes: PagoMp[] }
const MEDIOS: Medio[] = ['efectivo', 'transferencia', 'debito', 'credito']
const CADA_MS = 5000

const nuevoId = () => crypto.randomUUID()

export function CambioCaja() {
  const { marca: delShell } = useSesion()
  // La marca de la Caja ANTES de pedir nada (`lib/caja/cliente.ts` la lee en cada pedido), como la pestaña Caja.
  const store = marcaParaPOS(null, delShell) as MarcaErp
  usarMarcaCaja(store)
  const { datos } = useDatosMonitor()
  const tnIdx = useTnPromo(store)
  // Stunned cobra SU Tienda Nube (Bruno, 16-oct): su índice, como la Caja (`lib/caja/precio.ts`).
  const tnIdxStunned = useTnPromo(store === 'zattia' ? 'stunned' : store)
  const [config, setConfig] = useState<Config | null>(null)

  const [q, setQ] = useState('')
  const [ventas, setVentas] = useState<VentaPropia[] | null>(null)
  const [ficha, setFicha] = useState<FichaDeVenta | null>(null)
  const [devuelve, setDevuelve] = useState<Record<string, number>>({})
  const [nuevas, setNuevas] = useState<Nueva[]>([])
  const [codigoDev, setCodigoDev] = useState('')
  const [codigoNueva, setCodigoNueva] = useState('')
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null)
  const [medio, setMedio] = useState<Medio | ''>('')
  const [clienta, setClienta] = useState({ doc: '', nombre: '', whatsapp: '' })
  const [espera, setEspera] = useState<Espera | null>(null)
  const [comprobante, setComprobante] = useState('')
  /** El saldo a favor de la clienta (por DNI) y si se usa para pagar la diferencia. */
  const [saldo, setSaldo] = useState<{ doc: string; monto: number } | null>(null)
  const [usaSaldo, setUsaSaldo] = useState(false)
  const [id, setId] = useState(nuevoId)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Cada sondeo fallido suma una vuelta: el MISMO error ⛔ cambia el estado y el efecto ⛔ se volvería a armar.
  const [, setVuelta] = useState(0)
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
    setMedio('')
    setClienta({ doc: '', nombre: '', whatsapp: '' })
    setEspera(null)
    setComprobante('')
    setSaldo(null)
    setUsaSaldo(false)
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

  /** El precio de la prenda con la MISMA regla de la Caja (`precioDeCaja`): Zattia etiqueta o feria; Stunned, su Tienda Nube. */
  const precioDe = (v: Variante): number | null => {
    const p = datos?.allProductos.find((x) => String(x.id) === String(v.product_id))
    if (!p || !tnIdx) return null
    return precioDeCaja(p, { store, skuVariante: v.sku, idx: tnIdx, idxStunned: tnIdxStunned, reglas: config?.reglas ?? null }).precio
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
      return [...xs, { variante: v, cantidad: 1, precio: precioDe(v) ?? '' }]
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
  const reglas = config?.reglas ?? null
  // La forma de pago de la Caja ⇒ su cuenta (crédito: la normal; la promo del banco y las 6 cuotas, todavía no).
  const docLimpio = clienta.doc.replace(/\D/g, '')
  // El saldo sólo vale para el DNI con que se buscó (si se cambia el DNI, se vuelve a buscar).
  const saldoUsado = usaSaldo && saldo && saldo.doc === docLimpio && diferencia > 0 ? Math.min(saldo.monto, diferencia) : 0
  const resto = Math.round((diferencia - saldoUsado) * 100) / 100
  let cuenta: number | null = null
  let errorCobro: string | null = null
  try {
    cuenta = medio && reglas && resto > 0 ? cuentaDeMedio(medio, { reglas, total: diferencia, promoCreditoHoy: false, esDelBanco: false, seisCuotas: false }) : null
  } catch (e) {
    errorCobro = e instanceof Error ? e.message : 'Esa forma de pago no se puede usar.'
  }
  // 🔑 El descuento de la forma de pago, con el MISMO cálculo que el servidor (`cobroDelCambio` = `cobro()` de la Caja).
  let cobrado: { pagos: Array<{ cuenta: number; monto: number }>; total: number; espera: number } = { pagos: [], total: 0, espera: 0 }
  try {
    if (reglas && diferencia > 0 && (cuenta || !(resto > 0))) cobrado = cobroDelCambio({ diferencia, pagos: cuenta ? [{ cuenta }] : [], reglas, nuevas: items, saldo: saldoUsado })
  } catch (e) {
    errorCobro = e instanceof Error ? e.message : 'No se pudo calcular el cobro.'
  }
  const aFavor = diferencia < 0 ? -diferencia : 0
  // Saldo a favor (Bruno, 14-oct): se guarda a nombre de la clienta ⇒ DNI y nombre obligatorios.
  const pideClienta = aFavor > 0 || saldoUsado > 0
  const faltaClienta = pideClienta && !(docLimpio.length >= 7 && clienta.nombre.trim().length >= 3)

  const buscarSaldo = () => correr(async () => {
    const r = await leerSaldo(store, docLimpio, ficha?.venta.prueba ?? true)
    setSaldo({ doc: docLimpio, monto: r.saldo })
    if (r.cliente && !clienta.nombre.trim()) setClienta((x) => ({ ...x, nombre: r.cliente?.nombre ?? '' }))
    setUsaSaldo(r.saldo > 0)
  }, 'No se pudo leer el saldo.')
  const listo = !!ficha && devueltas.length > 0 && !sinPrecio && !errorCobro && (diferencia <= 0 || cobrado.total > 0) && !faltaClienta

  /** El pedido del cambio: el mismo cada vez (mismo `id`), así repetirlo ⛔ duplica. */
  async function mandar(extra: { pago?: string | null; comprobante?: string | null } = {}) {
    if (!ficha) return
    const r = await cambiarVenta(store, {
      id, ventaId: ficha.venta.id, devueltas, items,
      pagos: resto > 0 && cuenta ? [{ cuenta }] : [], total: cobrado.total, desde: espera?.desde ?? null,
      saldo: saldoUsado,
      cliente: pideClienta ? { doc: clienta.doc, nombre: clienta.nombre, whatsapp: clienta.whatsapp || null } : null,
      ...extra,
    })
    if (r.esperando) {
      setEspera({ desde: r.desde, monto: r.espera, cruce: r.cruce, recientes: r.recientes ?? [] })
      return
    }
    setHecho({ numero: r.venta.numero, cobrado: r.total, aFavor: r.aFavor, saldo: r.saldo, ncPendiente: r.ncPendiente })
    setVentas(null)
    setQ('')
    empezarDeNuevo()
  }

  const confirmar = (extra?: { pago?: string | null; comprobante?: string | null }) => correr(() => mandar(extra), 'No se pudo registrar el cambio.')

  // Mientras se espera la transferencia, se vuelve a mirar Mercado Pago cada 5 s (como la Caja).
  const esperando = !!espera && espera.cruce.estado === 'esperando'
  useEffect(() => {
    if (!esperando) return
    // Un error se MUESTRA y el sondeo sigue (el cambio de estado vuelve a armar el efecto): callado se cortaba.
    const t = setTimeout(() => { void mandar().catch((e) => { setError(e instanceof Error ? e.message : 'No se pudo mirar Mercado Pago.'); setVuelta((n) => n + 1) }) }, CADA_MS)
    return () => clearTimeout(t)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title={`Cambio · ${NOMBRE_MARCA[store] ?? store}`} subtitle="Buscá la venta por número o cliente, marcá lo que devuelve y escaneá lo que se lleva.">
        <Notice tone="warning">De prueba hasta que se apague GN: no mueve el stock ni sale a GN. El cambio de verdad se sigue haciendo en GN.</Notice>
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
          {hecho.cobrado > 0 ? <>Se cobraron <MoneyText value={hecho.cobrado} />.</> : hecho.aFavor > 0 ? <>Quedan <MoneyText value={hecho.aFavor} /> a favor de la clienta{hecho.saldo != null && <> (saldo: <MoneyText value={hecho.saldo} />)</>}.</> : 'Sin diferencia.'}
          {hecho.ncPendiente && ' La venta tenía factura: facturá el cambio en Caja › Factura (nota de crédito por lo devuelto y factura por lo nuevo).'}
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
                      <Td>{cuandoCorto(v.ocurridaEn)}</Td>
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
          <SectionCard title={`Devuelve · venta #${ficha.venta.numero}`} subtitle="Al precio que se pagó, no al de hoy.">
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
                {diferencia > 0
                  ? <>
                    {saldoUsado > 0 && <>Con saldo a favor: <MoneyText value={saldoUsado} strong /> · </>}
                    {resto > 0 && (cobrado.total > 0 && cobrado.total - saldoUsado !== resto
                      ? <>A pagar: <MoneyText value={cobrado.total - saldoUsado} strong /> <span style={{ fontSize: 14 }}>(<MoneyText value={resto} /> con el descuento de la forma de pago)</span></>
                      : <>A pagar: <MoneyText value={resto} strong /></>)}
                  </>
                  : diferencia < 0 ? <>A favor de la clienta: <MoneyText value={aFavor} strong /></> : 'Sin diferencia'}
              </div>
              {resto > 0 && (
                <Field label={saldoUsado > 0 ? 'Forma de pago del resto' : 'Forma de pago'}>
                  <Select value={medio} onChange={(e) => setMedio(e.target.value as Medio | '')} disabled={!!espera}>
                    <option value="">Elegir…</option>
                    {MEDIOS.filter((m) => reglas?.medios?.[m]).map((m) => <option key={m} value={m}>{NOMBRE_MEDIO[m]}</option>)}
                  </Select>
                </Field>
              )}
              <span style={{ flex: 1 }} />
              {!espera && <Button disabled={!listo || trabajando || (resto > 0 && !cuenta)} onClick={() => void confirmar()}>{cobrado.espera > 0 ? 'Esperar la transferencia' : 'Confirmar cambio'}</Button>}
            </div>
            {(aFavor > 0 || diferencia > 0) && (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[3], alignItems: 'flex-end' }}>
                <Field label={aFavor > 0 ? 'DNI o CUIT de la clienta' : '¿Tiene saldo a favor? DNI o CUIT'}><Input value={clienta.doc} onChange={(e) => setClienta({ ...clienta, doc: e.target.value })} inputMode="numeric" /></Field>
                {diferencia > 0 && <Button variant="outline" disabled={trabajando || docLimpio.length < 7 || !!espera} onClick={() => void buscarSaldo()}>Ver saldo</Button>}
                {diferencia > 0 && saldo && saldo.doc === docLimpio && (
                  saldo.monto > 0
                    ? <label style={{ display: 'flex', gap: space[1], alignItems: 'center' }}><input type="checkbox" checked={usaSaldo} disabled={!!espera} onChange={(e) => setUsaSaldo(e.target.checked)} /> Usar <MoneyText value={Math.min(saldo.monto, diferencia)} /> de su saldo (<MoneyText value={saldo.monto} />)</label>
                    : <span>Sin saldo a favor.</span>
                )}
              </div>
            )}
            {pideClienta && (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
                <Field label="Nombre"><Input value={clienta.nombre} onChange={(e) => setClienta({ ...clienta, nombre: e.target.value })} /></Field>
                <Field label="WhatsApp (opcional)"><Input value={clienta.whatsapp} onChange={(e) => setClienta({ ...clienta, whatsapp: e.target.value })} inputMode="tel" /></Field>
              </div>
            )}
            {faltaClienta && <Notice tone="action">El saldo a favor va a nombre de la clienta: cargá su DNI y su nombre.</Notice>}
            {sinPrecio && <Notice tone="warning">Falta el precio de una prenda nueva.</Notice>}
            {errorCobro && <Notice tone="warning">{errorCobro}</Notice>}
            {espera && (
              <div style={{ marginTop: space[3], display: 'flex', flexDirection: 'column', gap: space[2] }}>
                <Notice tone="action">
                  Esperando la transferencia de <MoneyText value={espera.monto} strong />.{' '}
                  {espera.cruce.motivo ?? 'Se mira Mercado Pago cada 5 segundos: el cambio se registra solo cuando llega.'}
                </Notice>
                {espera.recientes.length > 0 && (
                  <TableWrap>
                    <table>
                      <THead><Tr><Th>Llegó</Th><Th style={{ textAlign: 'right' }}>Monto</Th><Th /></Tr></THead>
                      <TBody>
                        {espera.recientes.map((p) => (
                          <Tr key={p.id}>
                            <Td>{cuandoCorto(p.cuando)}{p.coincide && <> <Badge tone="success">Coincide</Badge></>}</Td>
                            <Td style={{ textAlign: 'right' }}><MoneyText value={p.monto} /></Td>
                            <Td>{p.coincide && <Button variant="outline" disabled={trabajando} onClick={() => void confirmar({ pago: p.id })}>Elegir este pago</Button>}</Td>
                          </Tr>
                        ))}
                      </TBody>
                    </table>
                  </TableWrap>
                )}
                {espera.cruce.estado === 'sin_cuenta' && (
                  <form onSubmit={(e) => { e.preventDefault(); void confirmar({ comprobante }) }} style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
                    <Field label="Número de operación del comprobante"><Input value={comprobante} onChange={(e) => setComprobante(e.target.value)} /></Field>
                    <Button type="submit" disabled={trabajando || comprobante.trim().length < 4}>Validar transferencia</Button>
                  </form>
                )}
                <div><Button variant="outline" onClick={() => setEspera(null)}>Cambiar la forma de pago</Button></div>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
