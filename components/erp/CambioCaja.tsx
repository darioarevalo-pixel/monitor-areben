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
 * 🔑 Stunned (Bruno, 27-oct) tiene dos caminos más, sin venta del ERP: la venta de Gestión Nube (se busca por número) y el cambio
 * sin ticket, que autoriza la encargada con su PIN. Todo el estado y las cuentas viven en `components/caja/useCambio.ts`, el MISMO
 * que usa el modo «Cambios» del POS.
 */

import { useEffect, useState } from 'react'
import {
  Badge, Button, EmptyState, Field, Input, MoneyText, Notice, NumberField, PasoCantidad, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, space,
} from '@/components/ui'
import { cuandoCorto } from '@/components/ui/PiezasLista'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { precioDeCaja, esDeStunned } from '@/lib/caja/precio'
import { NOMBRE_MEDIO } from '@/lib/caja/core.core.js'
import { buscarProducto, elegirVariante, leerConfig, type Candidato, type Config, type Variante } from '@/lib/caja/cliente'
import { marcaParaPOS, usarMarcaCaja } from '@/lib/caja/marca'
import type { MarcaErp } from '@/lib/erp/cliente'
import { NOMBRE_MARCA } from '@/lib/erp/venta.core.js'
import { MEDIOS_CAMBIO, buscarVentasDelCambio, useCambio, type FilaVenta } from '@/components/caja/useCambio'

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
  // 🔑 Los dos caminos sin venta del ERP son del cambio de Stunned, mientras vende por el ERP (`CAJA_STUNNED_ERP`).
  const conStunned = !!config?.stunned_erp

  /** El precio de la prenda con la MISMA regla de la Caja (`precioDeCaja`): Zattia etiqueta o feria; Stunned, su Tienda Nube. */
  const precioDe = (v: Variante): number | null => {
    const p = datos?.allProductos.find((x) => String(x.id) === String(v.product_id))
    if (!p || !tnIdx) return null
    return precioDeCaja(p, { store, skuVariante: v.sku, idx: tnIdx, idxStunned: tnIdxStunned, reglas: config?.reglas ?? null }).precio
  }
  const esStunned = (v: Variante): boolean => esDeStunned(store, { sku: datos?.allProductos.find((x) => String(x.id) === String(v.product_id))?.sku ?? null }, v.sku)
  const c = useCambio({ store, config, precioDe, esStunned })
  const { venta, origen, tipo, vendidas, devueltas, nuevas, error, hecho } = c

  const [q, setQ] = useState('')
  const [ventas, setVentas] = useState<FilaVenta[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [codigoDev, setCodigoDev] = useState('')
  const [codigoNueva, setCodigoNueva] = useState('')
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null)

  useEffect(() => {
    let vivo = true
    leerConfig().then((x) => vivo && setConfig(x)).catch((e) => vivo && c.setError(e.message))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  const buscar = () => c.correr(async () => {
    c.empezarDeNuevo()
    c.setHecho(null)
    const r = await buscarVentasDelCambio(store, q, conStunned)
    setVentas(r.filas)
    setAviso(r.aviso)
  }, 'No se pudo buscar.')

  const abrir = (f: FilaVenta) => c.correr(async () => {
    c.empezarDeNuevo()
    c.elegirVenta(await f.abrir())
  }, 'No se pudo leer la venta.')

  const volver = () => c.empezarDeNuevo()

  const devolver = (fn: () => void) => { try { fn(); c.setError(null) } catch (e) { c.setError(e instanceof Error ? e.message : 'No se puede devolver ese producto.') } }

  /** Escanear la prenda que devuelve: se busca con la Caja y se marca en la venta (o queda suelta, sin venta). */
  const escanearDevuelta = () => c.correr(async () => {
    const r = await buscarProducto(codigoDev.trim())
    setCodigoDev('')
    if (!('variante' in r)) throw new Error('Ese código es de varios productos: marcá lo devuelto en la lista.')
    c.devolverPrenda(r.variante)
  }, 'No se pudo buscar el producto.')

  const escanearNueva = () => c.correr(async () => {
    const r = await buscarProducto(codigoNueva.trim())
    setCodigoNueva('')
    if ('variante' in r) { setCandidatos(null); c.sumarNueva(r.variante) }
    else if (r.candidatos.length) setCandidatos(r.candidatos)
    else throw new Error('No se encontró el producto.')
  }, 'No se pudo buscar el producto.')

  const elegir = (cand: Candidato) => c.correr(async () => {
    const r = await elegirVariante(cand)
    if ('variante' in r) { setCandidatos(null); c.sumarNueva(r.variante) }
  }, 'No se pudo traer el producto.')

  const { diferencia, resto, saldoUsado, cobrado, aFavor, reglas, espera } = c
  /** Con una venta elegida manda ELLA; sin elegir, avisa si en la lista hay alguna de prueba. */
  const deEnsayo = venta ? c.deEnsayo : (ventas ?? []).some((v) => v.prueba)
  const ventaDeGn = origen?.tipo === 'gn' ? origen : null
  const ventaErp = origen?.tipo === 'erp' ? origen : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title={`Cambio · ${NOMBRE_MARCA[store] ?? store}`} subtitle="Buscá la venta por número o cliente, marcá lo que devuelve y escaneá lo que se lleva.">
        {/* 🔑 El modo lo manda la venta (`prueba`: el motor ⛔ cambia una de prueba con un cambio real ni al revés). El cartel fijo
            seguía diciendo «el cambio de verdad se hace en GN» DESPUÉS del corte de Stunned: ahora sale sólo con una venta de prueba. */}
        {deEnsayo && <Notice tone="warning">Venta de prueba: el cambio no mueve el stock ni sale a Gestión Nube. El cambio de verdad de las ventas que siguen en Gestión Nube se hace allá.</Notice>}
        {/* 🔑 El motor mueve el stock sólo si la venta NO es de prueba y NO tiene venta de GN (`mueveStock`, motor/venta/armar.mjs). */}
        {ventaErp && !ventaErp.prueba && !ventaErp.gnSaleId && <Notice tone="info">Venta real: el cambio mueve el stock y queda atado a la venta #{ventaErp.numero}.</Notice>}
        {ventaErp && !ventaErp.prueba && !!ventaErp.gnSaleId && <Notice tone="info">Esta venta ya está en Gestión Nube: el cambio queda atado a la venta #{ventaErp.numero} y no mueve el stock.</Notice>}
        {ventaDeGn && !ventaDeGn.prueba && <Notice tone="info">Venta {ventaDeGn.numero} de Gestión Nube: el cambio devuelve lo que pagó y mueve el stock de Stunned en el ERP.</Notice>}
        {tipo === 'suelto' && !deEnsayo && <Notice tone="info">Cambio sin venta: lo autoriza la encargada con su PIN y mueve el stock de Stunned en el ERP.</Notice>}
        <form onSubmit={(e) => { e.preventDefault(); void buscar() }} style={{ display: 'flex', gap: space[2], marginTop: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Venta" style={{ flex: '1 1 220px' }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={conStunned ? '#123, número de venta de Gestión Nube, nombre, DNI o mail' : '#123, nombre, DNI o mail'} />
          </Field>
          <Button type="submit" disabled={c.trabajando}>Buscar</Button>
          {conStunned && <Button variant="outline" disabled={c.trabajando || tipo === 'suelto'} onClick={() => { c.empezarDeNuevo(); setVentas(null); c.elegirVenta({ origen: { tipo: 'suelto' }, vendidas: [] }) }}>Cambio sin venta</Button>}
        </form>
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => c.setError(null)}>{error}</Notice>}
      {hecho && (
        <Notice tone="success" onClose={() => c.setHecho(null)}>
          Cambio #{hecho.numero} registrado.{' '}
          {hecho.cobrado > 0 ? <>Se cobraron <MoneyText value={hecho.cobrado} />.</> : hecho.aFavor > 0 ? <>Quedan <MoneyText value={hecho.aFavor} /> a favor de la clienta{hecho.saldo != null && <> (saldo: <MoneyText value={hecho.saldo} />)</>}.</> : 'Sin diferencia.'}
          {hecho.ncPendiente && ' La venta tenía factura: facturá el cambio en Caja › Factura (nota de crédito por lo devuelto y factura por lo nuevo).'}
        </Notice>
      )}

      {ventas && !venta && (
        <SectionCard title="Ventas">
          {aviso && <Notice tone="warning">{aviso}</Notice>}
          {!ventas.length ? <EmptyState title="No hay ventas para cambiar con esa búsqueda." /> : (
            <TableWrap>
              <table>
                <THead><Tr><Th>Nº</Th><Th>Cuándo</Th><Th>Cliente</Th><Th style={{ textAlign: 'right' }}>Total</Th></Tr></THead>
                <TBody>
                  {ventas.map((v) => (
                    <Tr key={v.clave} onClick={() => void abrir(v)} style={{ cursor: 'pointer' }}>
                      <Td>#{v.numero} <Badge tone={v.rotulo === 'ERP' ? 'brand' : 'neutral'}>{v.rotulo}</Badge>{v.prueba && <> <Badge tone="warning">Prueba</Badge></>}</Td>
                      <Td>{v.fecha ? cuandoCorto(v.fecha) : ''}</Td>
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

      {venta && (
        <>
          <SectionCard title={origen && origen.tipo !== 'suelto' ? `Devuelve · venta #${origen.numero}` : 'Devuelve · sin venta'} subtitle={tipo === 'suelto' ? 'Escaneá lo que devuelve y escribí lo que pagó la clienta por cada uno.' : 'Al precio que se pagó, no al de hoy.'}>
            <div style={{ display: 'flex', gap: space[2], marginBottom: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Button variant="outline" onClick={volver}>{tipo === 'suelto' ? 'Salir del cambio sin venta' : 'Volver a las ventas'}</Button>
              <form onSubmit={(e) => { e.preventDefault(); if (codigoDev.trim()) void escanearDevuelta() }} style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
                <Field label="Escanear lo que devuelve"><Input value={codigoDev} onChange={(e) => setCodigoDev(e.target.value)} placeholder="Código" /></Field>
              </form>
            </div>
            {tipo === 'suelto' ? (
              !devueltas.length ? <EmptyState title="Todavía no hay nada devuelto." /> : (
                <TableWrap>
                  <table>
                    <THead><Tr><Th>Producto</Th><Th>Variante</Th><Th>Devuelve</Th><Th>Pagó c/u</Th></Tr></THead>
                    <TBody>
                      {devueltas.map((d) => (
                        <Tr key={d.clave}>
                          <Td>{d.nombre} <Badge tone="warning">Sin venta</Badge></Td>
                          <Td>{d.talle}</Td>
                          <Td><PasoCantidad valor={d.cantidad} onCambio={(n) => devolver(() => c.cambiarCantidadDevuelta(d.clave, n))} etiqueta="producto devuelto" etiquetaPlural="productos devueltos" /></Td>
                          <Td><NumberField value={d.precio} prefix="$" onChange={(p) => c.ponerPrecioDevuelta(d.clave, p)} invalid={!(Number(d.precio) > 0)} width={120} /></Td>
                        </Tr>
                      ))}
                    </TBody>
                  </table>
                </TableWrap>
              )
            ) : (
              <TableWrap>
                <table>
                  <THead><Tr><Th>Producto</Th><Th>Variante</Th><Th style={{ textAlign: 'right' }}>Vendidas</Th><Th style={{ textAlign: 'right' }}>Pagó c/u</Th><Th>Devuelve</Th></Tr></THead>
                  <TBody>
                    {vendidas.map((l) => {
                      const queda = l.cantidad - l.cambiado
                      const actual = devueltas.find((d) => d.clave === l.clave)?.cantidad ?? 0
                      return (
                        <Tr key={l.clave}>
                          <Td>{l.nombre}{l.cambiado > 0 && <> <Badge tone="neutral">{l.cambiado} ya cambiada{l.cambiado > 1 ? 's' : ''}</Badge></>}</Td>
                          <Td>{l.talle}</Td>
                          <Td style={{ textAlign: 'right' }}>{l.cantidad}</Td>
                          <Td style={{ textAlign: 'right' }}><MoneyText value={l.precio} /></Td>
                          <Td>{queda > 0 ? <PasoCantidad valor={actual} onCambio={(n) => devolver(() => c.cambiarCantidadDevuelta(l.clave, n))} etiqueta="producto devuelto" etiquetaPlural="productos devueltos" /> : '—'}</Td>
                        </Tr>
                      )
                    })}
                  </TBody>
                </table>
              </TableWrap>
            )}
          </SectionCard>

          <SectionCard title="Se lleva" subtitle="Con el precio de la etiqueta; se puede cambiar, como en la Caja.">
            <form onSubmit={(e) => { e.preventDefault(); if (codigoNueva.trim()) void escanearNueva() }} style={{ display: 'flex', gap: space[2], marginBottom: space[3], alignItems: 'flex-end' }}>
              <Field label="Escanear lo que se lleva"><Input value={codigoNueva} onChange={(e) => setCodigoNueva(e.target.value)} placeholder="Código o nombre" /></Field>
            </form>
            {candidatos && (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
                {candidatos.map((cand) => (
                  <Button key={`${cand.product_id}/${cand.size_id}`} variant="outline" onClick={() => void elegir(cand)}>{cand.product_name} · {cand.size_name}</Button>
                ))}
              </div>
            )}
            {!nuevas.length ? <EmptyState title="Sin productos nuevos: si no se lleva nada, la diferencia queda a favor." /> : (
              <TableWrap>
                <table>
                  <THead><Tr><Th>Producto</Th><Th>Variante</Th><Th>Cantidad</Th><Th>Precio</Th></Tr></THead>
                  <TBody>
                    {nuevas.map((n, i) => (
                      <Tr key={`${n.variante.product_id}/${n.variante.size_id}`}>
                        <Td>{n.variante.product_name}</Td>
                        <Td>{n.variante.size_name}</Td>
                        <Td><PasoCantidad valor={n.cantidad} onCambio={(x) => c.cambiarCantidadNueva(i, x)} etiqueta="producto" etiquetaPlural="productos" /></Td>
                        <Td><NumberField value={n.precio} prefix="$" onChange={(p) => c.cambiarNueva(i, { precio: p })} invalid={!(Number(n.precio) > 0)} width={120} /></Td>
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
                  <Select value={c.medio} onChange={(e) => c.setMedio(e.target.value as typeof c.medio)} disabled={!!espera}>
                    <option value="">Elegir…</option>
                    {MEDIOS_CAMBIO.filter((m) => reglas?.medios?.[m]).map((m) => <option key={m} value={m}>{NOMBRE_MEDIO[m]}</option>)}
                  </Select>
                </Field>
              )}
              <span style={{ flex: 1 }} />
              {!espera && <Button disabled={!c.listo || c.trabajando || (resto > 0 && !c.cuenta)} onClick={() => void c.confirmar()}>{cobrado.espera > 0 ? 'Esperar la transferencia' : 'Confirmar cambio'}</Button>}
            </div>
            {tipo === 'suelto' && (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[3], alignItems: 'flex-end' }}>
                <Field label="Encargada que autoriza (usuario)"><Input value={c.encargada.persona} onChange={(e) => c.setEncargada({ ...c.encargada, persona: e.target.value })} autoComplete="off" /></Field>
                <Field label="PIN de 4 dígitos"><Input type="password" inputMode="numeric" maxLength={4} value={c.encargada.pin} onChange={(e) => c.setEncargada({ ...c.encargada, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} autoComplete="off" style={{ width: 100 }} /></Field>
              </div>
            )}
            {(aFavor > 0 || diferencia > 0) && (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[3], alignItems: 'flex-end' }}>
                <Field label={aFavor > 0 ? 'DNI o CUIT de la clienta' : '¿Tiene saldo a favor? DNI o CUIT'}><Input value={c.clienta.doc} onChange={(e) => c.setClienta({ ...c.clienta, doc: e.target.value })} inputMode="numeric" /></Field>
                {diferencia > 0 && <Button variant="outline" disabled={c.trabajando || c.docLimpio.length < 7 || !!espera} onClick={() => void c.buscarSaldo()}>Ver saldo</Button>}
                {diferencia > 0 && c.saldo && c.saldo.doc === c.docLimpio && (
                  c.saldo.monto > 0
                    ? <label style={{ display: 'flex', gap: space[1], alignItems: 'center' }}><input type="checkbox" checked={c.usaSaldo} disabled={!!espera} onChange={(e) => c.setUsaSaldo(e.target.checked)} /> Usar <MoneyText value={Math.min(c.saldo.monto, diferencia)} /> de su saldo (<MoneyText value={c.saldo.monto} />)</label>
                    : <span>Sin saldo a favor.</span>
                )}
              </div>
            )}
            {c.pideClienta && (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
                <Field label="Nombre"><Input value={c.clienta.nombre} onChange={(e) => c.setClienta({ ...c.clienta, nombre: e.target.value })} /></Field>
                <Field label="WhatsApp (opcional)"><Input value={c.clienta.whatsapp} onChange={(e) => c.setClienta({ ...c.clienta, whatsapp: e.target.value })} inputMode="tel" /></Field>
              </div>
            )}
            {c.faltaClienta && <Notice tone="action">El saldo a favor va a nombre de la clienta: cargá su DNI y su nombre.</Notice>}
            {c.sinPrecio && <Notice tone="warning">Falta el precio de un producto nuevo.</Notice>}
            {c.sinPrecioDevuelta && <Notice tone="warning">Falta lo que pagó la clienta por un producto que devuelve.</Notice>}
            {c.errorCobro && <Notice tone="warning">{c.errorCobro}</Notice>}
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
                            <Td>{p.coincide && <Button variant="outline" disabled={c.trabajando} onClick={() => void c.confirmar({ pago: p.id })}>Elegir este pago</Button>}</Td>
                          </Tr>
                        ))}
                      </TBody>
                    </table>
                  </TableWrap>
                )}
                {espera.cruce.estado === 'sin_cuenta' && (
                  <form onSubmit={(e) => { e.preventDefault(); void c.confirmar({ comprobante: c.comprobante }) }} style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
                    <Field label="Número de operación del comprobante"><Input value={c.comprobante} onChange={(e) => c.setComprobante(e.target.value)} /></Field>
                    <Button type="submit" disabled={c.trabajando || c.comprobante.trim().length < 4}>Validar transferencia</Button>
                  </form>
                )}
                <div><Button variant="outline" onClick={() => c.setEspera(null)}>Cambiar la forma de pago</Button></div>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
