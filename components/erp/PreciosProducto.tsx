'use client'

/**
 * ERP › Precios. El precio de un producto en cada lista (local, online, mayorista) y su costo, como los tiene el ERP,
 * con de dónde salió cada uno (la copia de GN, cargado en el ERP, Tienda Nube) y su historial; al lado, lo que dicen
 * GN y Tienda Nube. «Cargar en el ERP» agrega un precio o un costo (`cargarPrecio`/`cargarCosto` del motor, contrato §13):
 * manda sobre las copias, pero mientras GN vive ⛔ cambia lo que cobra la Caja ni lo que muestra Tienda Nube.
 *
 * 🔑 Mientras GN vive el ERP COPIA precio y costo de GN cada 2 h: la ficha avisa donde Tienda Nube dice otra cosa,
 * que es lo que hay que resolver antes de cortar (Bruno, 14-oct: el precio del local sale de TN o de una lista propia;
 * el costo, de la importación de TN).
 *
 * 🔑 El local SIGUE a lo que cobra Tienda Nube con la oferta (motor sql/018). Un precio cargado en una lista que sigue a otra
 * se puede SOLTAR («Volver a seguir»): una fila nueva, la carga queda en el historial.
 *
 * 🔑 El proveedor del costo es una FICHA del ERP (sql/013; Bruno, 15-oct: tabla propia cruzada con PRM): se elige de la lista
 * o se da de alta. Sin la tabla en la base, se escribe como texto (como antes).
 */

import { useRef, useState } from 'react'
import {
  Button, ConfirmDetalle, EmptyState, Field, Input, MoneyText, Notice, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, Tabs, space, useConfirmar,
} from '@/components/ui'
import { buscarPrendas, cargarPrecioCosto, guardarProveedor, leerPrecioDeProducto, leerProveedores, soltarPrecio, type FilaPrecio, type MarcaErp, type PrecioDeProducto, type ProveedorErp } from '@/lib/erp/cliente'
import { parsearMonto } from '@/lib/compromisos/plata.core.js'
import { NOMBRE_FUENTE } from '@/lib/erp/precio.core.js'

const MARCAS: Array<{ key: MarcaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'bdi', label: 'BDI' }]
const FUENTE: Record<string, string> = NOMBRE_FUENTE
const cuando = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}
const plata = (n: number | null | undefined) => (n == null ? '—' : <MoneyText value={n} />)
/** Una lectura de TN de más de un día ya puede no ser lo que dice la tienda. */
const VIEJA_MS = 24 * 3600_000
/** En el selector de proveedor: escribir uno que ⛔ está en la lista (texto, como antes de la tabla). */
const OTRO = 'otro'

type Encontrado = { producto: string; nombre: string | null; skus: string[] }

export function PreciosProducto() {
  const [marca, setMarca] = useState<MarcaErp>('zattia')
  const [texto, setTexto] = useState('')
  const [encontrados, setEncontrados] = useState<Encontrado[] | null>(null)
  const [cortado, setCortado] = useState(false)
  const [ficha, setFicha] = useState<PrecioDeProducto | null>(null)
  const [tnVieja, setTnVieja] = useState(false)
  const [que, setQue] = useState('costo')
  const [monto, setMonto] = useState('')
  const [desde, setDesde] = useState('')
  const [motivo, setMotivo] = useState('')
  const [proveedor, setProveedor] = useState('')
  // La ficha elegida: '' = sin proveedor, un id, u OTRO (texto libre, el de antes). `null` en la lista = todavía ⛔ se leyó.
  const [proveedorId, setProveedorId] = useState('')
  const [proveedores, setProveedores] = useState<ProveedorErp[] | null>(null)
  const [sinListaProveedores, setSinListaProveedores] = useState<string | null>(null)
  const [nuevoProveedor, setNuevoProveedor] = useState<{ nombre: string; cuit: string } | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const { confirmar } = useConfirmar()
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

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

  // La búsqueda de Stock trae variantes: acá se agrupan por producto (precio y costo son del producto).
  const buscar = () => correr(async () => {
    setFicha(null)
    setHecho(null)
    const r = await buscarPrendas(marca, texto)
    const porProducto = new Map<string, Encontrado>()
    for (const v of r.variantes) {
      const p = porProducto.get(v.producto) || { producto: v.producto, nombre: v.nombre, skus: [] }
      if (v.sku && !p.skus.includes(v.sku)) p.skus.push(v.sku)
      porProducto.set(v.producto, p)
    }
    setEncontrados([...porProducto.values()])
    setCortado(r.cortado)
  }, 'No se pudo buscar.')

  // La marca de AHORA: una respuesta que llega después de cambiar de marca es de la otra base y se descarta.
  const marcaActual = useRef(marca)

  // La lista se lee una vez por marca, al abrir la primera ficha; si la base todavía ⛔ tiene la tabla, queda el texto.
  // Devuelve si quedó leída (para elegir la recién creada sólo si está en la lista).
  async function cargarProveedores(): Promise<boolean> {
    const de = marca
    try {
      const r = await leerProveedores(de)
      if (marcaActual.current !== de) return false
      setProveedores(r.proveedores)
      setSinListaProveedores(null)
      return true
    } catch (e) {
      if (marcaActual.current !== de) return false
      setProveedores([])
      setSinListaProveedores(e instanceof Error ? e.message : 'No se pudieron leer los proveedores.')
      return false
    }
  }

  const abrir = (producto: string) => correr(async () => {
    setHecho(null)
    if (proveedores == null) void cargarProveedores()
    const f = await leerPrecioDeProducto(marca, producto)
    setFicha(f)
    setTnVieja(f.tnLeidaEn ? Date.now() - Date.parse(f.tnLeidaEn) > VIEJA_MS : false)
  }, 'No se pudo leer el precio.')

  /** «Cargar en el ERP»: `que` es `costo` o `precio:<lista>`. */
  async function cargar() {
    if (!ficha) return
    const esCosto = que === 'costo'
    const lista = esCosto ? undefined : que.slice('precio:'.length)
    const n = parsearMonto(monto)
    if (!Number.isFinite(n) || n < 0) { setError('El monto es en pesos.'); return }
    const nombre = esCosto ? 'Costo' : `Precio ${ficha.listas.find((l) => l.lista === lista)?.nombre ?? lista}`
    const conFicha = esCosto && proveedorId !== '' && proveedorId !== OTRO
    const nombreProveedor = !esCosto ? null : conFicha ? proveedores?.find((p) => p.id === proveedorId)?.nombre ?? null : proveedorId === OTRO ? proveedor.trim() || null : null
    const ok = await confirmar({
      titulo: `Cargar ${nombre.toLowerCase()} de ${ficha.nombre ?? `producto ${ficha.producto}`}`,
      mensaje: (
        <div>
          <ConfirmDetalle label={nombre} valor={<MoneyText value={n} />} />
          <ConfirmDetalle label="Desde" valor={desde || 'Ahora'} />
          {esCosto && <ConfirmDetalle label="Proveedor" valor={nombreProveedor ?? 'Sin proveedor'} />}
          <p style={{ marginTop: space[3] }}>Queda en el ERP y manda sobre la copia de GN. Mientras GN funcione, no cambia lo que cobra la Caja ni lo que muestra Tienda Nube.</p>
        </div>
      ),
      ok: 'Cargar',
      tono: 'warning',
    })
    if (!ok) return
    await correr(async () => {
      const r = await cargarPrecioCosto(marca, { que: esCosto ? 'costo' : 'precio', producto: ficha.producto, monto: n, lista, desde, motivo, ...(esCosto ? (conFicha ? { proveedorId } : { proveedor: proveedorId === OTRO ? proveedor : '' }) : {}) })
      setHecho(r.futuro ? `${nombre} cargado: empieza a valer el ${desde}.` : `${nombre} cargado.`)
      if (r.aviso) setError(r.aviso)
      setMonto(''); setDesde(''); setMotivo(''); setProveedor(''); setProveedorId('')
      const f = await leerPrecioDeProducto(marca, ficha.producto)
      setFicha(f)
      setTnVieja(f.tnLeidaEn ? Date.now() - Date.parse(f.tnLeidaEn) > VIEJA_MS : false)
    }, 'No se pudo cargar.')
  }

  /** «Volver a seguir»: el precio cargado de la lista se suelta y vuelve a valer el de la lista que sigue. */
  async function soltar(l: FilaPrecio) {
    if (!ficha || !l.sigue) return
    const aQuien = ficha.listas.find((x) => x.lista === l.sigue)
    const ok = await confirmar({
      titulo: `${l.nombre}: volver a seguir a ${aQuien?.nombre ?? l.sigue}`,
      mensaje: (
        <div>
          <ConfirmDetalle label="Cargado hoy" valor={<MoneyText value={l.precio ?? 0} />} />
          <ConfirmDetalle label={`Pasa a valer (${aQuien?.nombre ?? l.sigue})`} valor={aQuien?.precio != null ? <MoneyText value={aQuien.precio} /> : 'Sin precio'} />
          <p style={{ marginTop: space[3] }}>El precio cargado queda en el historial. Mientras GN funcione, no cambia lo que cobra la Caja ni lo que muestra Tienda Nube.</p>
        </div>
      ),
      ok: 'Volver a seguir',
      tono: 'warning',
    })
    if (!ok) return
    await correr(async () => {
      const r = await soltarPrecio(marca, { producto: ficha.producto, lista: l.lista, motivo: motivo || undefined })
      setHecho(`${l.nombre}: vuelve a seguir a ${aQuien?.nombre ?? l.sigue}${r.precio != null ? ` ($${r.precio.toLocaleString('es-AR')})` : ''}.`)
      const f = await leerPrecioDeProducto(marca, ficha.producto)
      setFicha(f)
      setTnVieja(f.tnLeidaEn ? Date.now() - Date.parse(f.tnLeidaEn) > VIEJA_MS : false)
    }, 'No se pudo volver a seguir.')
  }

  /** Alta de un proveedor desde el formulario del costo: queda elegido. Si ya existía, se elige ése. */
  const altaProveedor = () => correr(async () => {
    if (!nuevoProveedor) return
    const r = await guardarProveedor(marca, { nombre: nuevoProveedor.nombre, cuit: nuevoProveedor.cuit || undefined })
    setNuevoProveedor(null)
    // 🔴 Se elige sólo si la lista se volvió a leer: si no, el formulario mostraría «Sin proveedor» y mandaría el id.
    if (!(await cargarProveedores())) { setHecho(`Proveedor «${r.proveedor.nombre}» ${r.yaExistia ? 'ya estaba' : 'creado'}, pero la lista no se pudo volver a leer: elegilo de nuevo.`); return }
    setProveedorId(r.proveedor.id)
    setHecho(r.yaExistia ? `Ya había un proveedor «${r.proveedor.nombre}»: quedó elegido.` : `Proveedor «${r.proveedor.nombre}» creado.`)
  }, 'No se pudo guardar el proveedor.')

  function cambiarMarca(k: string) {
    marcaActual.current = k as MarcaErp
    setMarca(k as MarcaErp)
    setProveedores(null)
    setProveedorId('')
    setNuevoProveedor(null)
    setEncontrados(null)
    setFicha(null)
    setHecho(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Precio y costo de un producto" subtitle="Lo que tiene el ERP por lista y el costo, de dónde salió cada uno, y al lado GN y Tienda Nube.">
        <Tabs items={MARCAS} value={marca} onChange={cambiarMarca} />
        <form onSubmit={(e) => { e.preventDefault(); void buscar() }} style={{ display: 'flex', gap: space[2], marginTop: space[3], flexWrap: 'wrap' }}>
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="SKU, código de barras o nombre" aria-label="Buscar producto" style={{ flex: '1 1 240px' }} />
          <Button type="submit" disabled={trabajando || texto.trim().length < 3}>Buscar</Button>
        </form>
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}

      {encontrados && !ficha && (
        <SectionCard title="Productos" subtitle={cortado ? 'La búsqueda trajo demasiadas prendas y se cortó: afiná la búsqueda si no aparece el producto.' : undefined}>
          {!encontrados.length ? <EmptyState title="No hay productos con ese SKU, código o nombre." /> : (
            <TableWrap>
              <table>
                <THead><Tr><Th>Producto</Th><Th>SKU</Th></Tr></THead>
                <TBody>
                  {encontrados.map((p) => (
                    <Tr key={p.producto} onClick={() => void abrir(p.producto)} style={{ cursor: 'pointer' }}>
                      <Td>{p.nombre}</Td><Td>{p.skus.slice(0, 3).join(' · ')}{p.skus.length > 3 && ` y ${p.skus.length - 3} más`}</Td>
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
          <SectionCard title={ficha.nombre ?? `Producto ${ficha.producto}`} subtitle={`Producto ${ficha.producto} · ${ficha.skus} SKU`}>
            <div style={{ marginBottom: space[3] }}>
              <Button variant="outline" onClick={() => { setFicha(null); setHecho(null) }}>Volver a la búsqueda</Button>
            </div>
            {ficha.feria != null && (
              <Notice tone="neutral">Está en oferta (Liquidación): en el local se cobra {plata(ficha.feria)}, el precio de su campaña, sin el descuento de la forma de pago. Tienda Nube muestra otro precio para la venta online.</Notice>
            )}
            {ficha.avisos.map((a) => <Notice key={a} tone="warning">{a}</Notice>)}
            <TableWrap>
              <table>
                <THead><Tr><Th>Lista</Th><Th style={{ textAlign: 'right' }}>ERP</Th><Th>De dónde</Th><Th>Desde</Th><Th style={{ textAlign: 'right' }}>GN</Th><Th style={{ textAlign: 'right' }}>Tienda Nube</Th></Tr></THead>
                <TBody>
                  {ficha.listas.map((l) => (
                    <Tr key={l.lista}>
                      <Td>{l.nombre}</Td>
                      <Td style={{ textAlign: 'right' }}>{plata(l.precio)}</Td>
                      <Td>
                        {l.fuente ? FUENTE[l.fuente] ?? l.fuente : 'Sin precio'}{l.deLista && ` · sigue a ${ficha.listas.find((x) => x.lista === l.deLista)?.nombre ?? l.deLista}`}
                        {l.puedeSoltar && <> <Button variant="outline" disabled={trabajando} onClick={() => void soltar(l)}>Volver a seguir</Button></>}
                      </Td>
                      <Td>{cuando(l.desde)}</Td>
                      <Td style={{ textAlign: 'right' }}>{plata(l.lista === 'local' ? ficha.gn?.precio : l.lista === 'mayorista' ? ficha.gn?.mayorista : null)}</Td>
                      <Td style={{ textAlign: 'right' }}>{l.lista === 'online' ? plata(ficha.tn?.precio) : l.lista === 'local' || l.lista === 'oferta' ? plata(ficha.tn?.cobra) : '—'}{l.lista === 'online' && ficha.tn?.promocional != null && <> (oferta {plata(ficha.tn.promocional)})</>}</Td>
                    </Tr>
                  ))}
                  <Tr>
                    <Td><strong>Costo</strong>{ficha.costo?.proveedor && ` · ${ficha.costo.proveedor}`}</Td>
                    <Td style={{ textAlign: 'right' }}><strong>{plata(ficha.costo?.costo)}</strong></Td>
                    <Td>{ficha.costo ? FUENTE[ficha.costo.fuente] ?? ficha.costo.fuente : 'Sin costo'}</Td>
                    <Td>{cuando(ficha.costo?.desde ?? null)}</Td>
                    <Td style={{ textAlign: 'right' }}>{plata(ficha.gn?.costo)}</Td>
                    <Td style={{ textAlign: 'right' }}>{plata(ficha.tn?.costo)}</Td>
                  </Tr>
                </TBody>
              </table>
            </TableWrap>
            <p style={{ marginTop: space[2], fontSize: 13, opacity: 0.75 }}>
              Tienda Nube: lo que se leyó el {cuando(ficha.tnLeidaEn)}{tnVieja && ' (hace más de un día: puede haber cambiado)'}.
            </p>
          </SectionCard>

          <SectionCard title="Cargar en el ERP" subtitle="Una fila nueva: lo anterior queda en el historial. Mientras GN funcione, no cambia la Caja ni Tienda Nube.">
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="Qué">
                <Select value={que} onChange={(e) => setQue(e.target.value)}>
                  <option value="costo">Costo</option>
                  {ficha.listas.map((l) => <option key={l.lista} value={`precio:${l.lista}`}>Precio {l.nombre}</option>)}
                </Select>
              </Field>
              <Field label="Monto" style={{ flex: '1 1 140px' }}>
                <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="$ 0" />
              </Field>
              <Field label="Desde (opcional)">
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </Field>
              {que === 'costo' && (sinListaProveedores ? (
                <Field label="Proveedor (opcional)" style={{ flex: '1 1 180px' }}>
                  <Input value={proveedor} onChange={(e) => { setProveedorId(OTRO); setProveedor(e.target.value) }} />
                </Field>
              ) : (
                <>
                  <Field label="Proveedor (opcional)" style={{ flex: '1 1 200px' }}>
                    <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} disabled={proveedores == null}>
                      <option value="">{proveedores == null ? 'Leyendo proveedores…' : 'Sin proveedor'}</option>
                      {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.cuit ? ` · ${p.cuit}` : ''}</option>)}
                      <option value={OTRO}>Otro (escribirlo)</option>
                    </Select>
                  </Field>
                  {proveedorId === OTRO && (
                    <Field label="Nombre del proveedor" style={{ flex: '1 1 180px' }}>
                      <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
                    </Field>
                  )}
                  {!nuevoProveedor && <Button variant="outline" disabled={trabajando || proveedores == null} onClick={() => setNuevoProveedor({ nombre: proveedor, cuit: '' })}>Nuevo proveedor</Button>}
                </>
              ))}
              <Field label="Motivo (opcional)" style={{ flex: '2 1 220px' }}>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Aumento del proveedor, liquidación…" />
              </Field>
              <Button disabled={trabajando || !monto.trim()} onClick={() => void cargar()}>Cargar</Button>
            </div>
            {que === 'costo' && sinListaProveedores && <p style={{ marginTop: space[2], fontSize: 13, opacity: 0.75 }}>{sinListaProveedores}</p>}
            {que === 'costo' && nuevoProveedor && (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end', marginTop: space[3] }}>
                <Field label="Nombre del proveedor nuevo" style={{ flex: '2 1 220px' }}>
                  <Input value={nuevoProveedor.nombre} onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, nombre: e.target.value })} />
                </Field>
                <Field label="CUIT (opcional)" style={{ flex: '1 1 160px' }}>
                  <Input value={nuevoProveedor.cuit} onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, cuit: e.target.value })} inputMode="numeric" placeholder="11 números" />
                </Field>
                <Button disabled={trabajando || !nuevoProveedor.nombre.trim()} onClick={() => void altaProveedor()}>Crear proveedor</Button>
                <Button variant="outline" onClick={() => setNuevoProveedor(null)}>Cancelar</Button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Historial" subtitle="El más nuevo arriba. Un precio o un costo nuevo es otra fila: lo anterior no se edita.">
            {!ficha.historial.length ? <EmptyState title="Todavía no hay precios ni costos de este producto en el ERP." /> : (
              <TableWrap>
                <table>
                  <THead><Tr><Th>Desde</Th><Th>Qué</Th><Th style={{ textAlign: 'right' }}>Valor</Th><Th>De dónde</Th><Th>Quién</Th><Th>Motivo</Th></Tr></THead>
                  <TBody>
                    {ficha.historial.map((h, i) => (
                      <Tr key={`${h.que}-${h.lista}-${h.desde}-${i}`}>
                        <Td>{cuando(h.desde)}</Td>
                        <Td>{h.que === 'costo' ? 'Costo' : `Precio ${ficha.listas.find((l) => l.lista === h.lista)?.nombre ?? h.lista}`}</Td>
                        <Td style={{ textAlign: 'right' }}>{plata(h.valor)}</Td>
                        <Td>{FUENTE[h.fuente] ?? h.fuente}</Td>
                        <Td>{h.usuario}</Td>
                        <Td>{h.motivo ?? '—'}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </table>
              </TableWrap>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
