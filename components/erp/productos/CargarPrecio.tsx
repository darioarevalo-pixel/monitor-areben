'use client'

/**
 * «Cargar en el ERP» de la ficha de un producto: un precio (de una lista) o el costo (`cargarPrecio`/`cargarCosto` del motor,
 * contrato §13). Una fila nueva: lo anterior queda en el historial; manda sobre la copia de GN, pero mientras GN vive ⛔ cambia
 * lo que cobra la Caja ni lo que muestra Tienda Nube. Era el formulario de `PreciosProducto` (15-oct), igual por dentro.
 *
 * 🔑 El proveedor del costo es una FICHA del ERP (sql/013; Bruno, 15-oct): se elige de la lista o se da de alta. Sin la tabla
 *    en la base, se escribe como texto. Viene elegido el proveedor del producto (el de Ingresos).
 * 🔑 El monto pasa por `parsearMonto` (el de compromisos): el punto decimal de `String(n)` ⛔ se lee como miles.
 */

import { useEffect, useState } from 'react'
import { Button, ConfirmDetalle, Field, Input, MoneyText, Select, space, useConfirmar } from '@/components/ui'
import { cargarPrecioCosto, guardarProveedor, leerProveedores, type MarcaErp, type PrecioDeProducto, type ProveedorErp } from '@/lib/erp/cliente'
import { parsearMonto } from '@/lib/compromisos/plata.core.js'
import { useTiendaErp } from '@/lib/erp/linea-erp'

/** En el selector de proveedor: escribir uno que ⛔ está en la lista (texto, como antes de la tabla). */
const OTRO = 'otro'

export function CargarPrecio({ marca, ficha, onListo, onError }: {
  marca: MarcaErp
  ficha: PrecioDeProducto
  /** Se cargó (el texto de lo hecho y, si vino, el aviso del motor): la ficha y la lista se vuelven a leer. */
  onListo: (hecho: string, aviso?: string | null) => void
  onError: (e: string) => void
}) {
  // Los proveedores de la tienda del menú (Bruno, 30-oct): mirando Stunned, ⛔ los talleres de Zattia; y los sin productos.
  const tienda = useTiendaErp()
  const [que, setQue] = useState('costo')
  const [monto, setMonto] = useState('')
  const [desde, setDesde] = useState('')
  const [motivo, setMotivo] = useState('')
  const [proveedor, setProveedor] = useState('')
  // '' = sin proveedor, un id, u OTRO (texto libre). De entrada, el proveedor del producto (el de Ingresos).
  const [proveedorId, setProveedorId] = useState(ficha.proveedor?.id ?? '')
  const [proveedores, setProveedores] = useState<ProveedorErp[] | null>(null)
  const [sinLista, setSinLista] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState<{ nombre: string; cuit: string } | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const { confirmar } = useConfirmar()

  // La lista se lee al abrir el formulario; si la base todavía ⛔ tiene la tabla, queda el texto.
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    let vivo = true
    leerProveedores(marca, tienda, true)
      .then((r) => { if (vivo) { setProveedores(r.proveedores); setSinLista(null) } })
      .catch((e) => { if (vivo) { setProveedores([]); setSinLista(e instanceof Error ? e.message : 'No se pudieron leer los proveedores.') } })
    return () => { vivo = false }
  }, [marca, tienda, vuelta])

  async function correr(fn: () => Promise<void>, fallo: string) {
    setTrabajando(true)
    try {
      await fn()
    } catch (e) {
      onError(e instanceof Error ? e.message : fallo)
    } finally {
      setTrabajando(false)
    }
  }

  async function cargar() {
    const esCosto = que === 'costo'
    const lista = esCosto ? undefined : que.slice('precio:'.length)
    const n = parsearMonto(monto)
    if (!Number.isFinite(n) || n < 0) { onError('El monto es en pesos.'); return }
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
          <p style={{ marginTop: space[3] }}>Queda en el ERP y manda sobre la copia de Gestión Nube. Mientras Gestión Nube funcione, no cambia lo que cobra la Caja ni lo que muestra Tienda Nube.</p>
        </div>
      ),
      ok: 'Cargar',
      tono: 'warning',
    })
    if (!ok) return
    await correr(async () => {
      const r = await cargarPrecioCosto(marca, { que: esCosto ? 'costo' : 'precio', producto: ficha.producto, monto: n, lista, desde, motivo, ...(esCosto ? (conFicha ? { proveedorId } : { proveedor: proveedorId === OTRO ? proveedor : '' }) : {}) })
      setMonto(''); setDesde(''); setMotivo(''); setProveedor('')
      onListo(r.futuro ? `${nombre} cargado: empieza a valer el ${desde}.` : `${nombre} cargado.`, r.aviso)
    }, 'No se pudo cargar.')
  }

  /** Alta de un proveedor desde el formulario del costo: queda elegido. Si ya existía, se elige ése. */
  const altaProveedor = () => correr(async () => {
    if (!nuevo) return
    const r = await guardarProveedor(marca, { nombre: nuevo.nombre, cuit: nuevo.cuit || undefined })
    setNuevo(null)
    // 🔴 Se elige recién cuando la lista se vuelve a leer: si no, el formulario mostraría «Sin proveedor» y mandaría el id.
    const l = await leerProveedores(marca, tienda, true)
    setProveedores(l.proveedores)
    if (!l.proveedores.some((p) => p.id === r.proveedor.id)) {
      // Ya existía y le hace productos a la OTRA tienda: la lista es de ésta (30-oct) ⇒ ⛔ se elige callado.
      if (r.yaExistia) onError(`${r.proveedor.nombre} ya está cargado y es proveedor de la otra marca.`)
      setVuelta((x) => x + 1); return
    }
    setProveedorId(r.proveedor.id)
  }, 'No se pudo guardar el proveedor.')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Qué">
          <Select value={que} onChange={(e) => setQue(e.target.value)}>
            <option value="costo">Costo</option>
            {ficha.listas.map((l) => <option key={l.lista} value={`precio:${l.lista}`}>Precio {l.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Monto" style={{ flex: '1 1 120px' }}>
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="$ 0" />
        </Field>
        <Field label="Desde (opcional)">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
      </div>
      {que === 'costo' && (sinLista ? (
        <Field label="Proveedor (opcional)">
          <Input value={proveedor} onChange={(e) => { setProveedorId(OTRO); setProveedor(e.target.value) }} />
        </Field>
      ) : (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Proveedor (opcional)" style={{ flex: '1 1 200px' }}>
            <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} disabled={proveedores == null}>
              <option value="">{proveedores == null ? 'Leyendo proveedores…' : 'Sin proveedor'}</option>
              {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.cuit ? ` · ${p.cuit}` : ''}</option>)}
              <option value={OTRO}>Otro (escribirlo)</option>
            </Select>
          </Field>
          {proveedorId === OTRO && (
            <Field label="Nombre del proveedor" style={{ flex: '1 1 160px' }}>
              <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
            </Field>
          )}
          {!nuevo && <Button variant="outline" disabled={trabajando || proveedores == null} onClick={() => setNuevo({ nombre: proveedor, cuit: '' })}>Nuevo proveedor</Button>}
        </div>
      ))}
      {que === 'costo' && sinLista && <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>{sinLista}</p>}
      {que === 'costo' && nuevo && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nombre del proveedor nuevo" style={{ flex: '2 1 200px' }}>
            <Input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          </Field>
          <Field label="CUIT (opcional)" style={{ flex: '1 1 140px' }}>
            <Input value={nuevo.cuit} onChange={(e) => setNuevo({ ...nuevo, cuit: e.target.value })} inputMode="numeric" placeholder="11 números" />
          </Field>
          <Button disabled={trabajando || !nuevo.nombre.trim()} onClick={() => void altaProveedor()}>Crear proveedor</Button>
          <Button variant="outline" onClick={() => setNuevo(null)}>Cancelar</Button>
        </div>
      )}
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Motivo (opcional)" style={{ flex: '1 1 220px' }}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Aumento del proveedor, liquidación…" />
        </Field>
        <Button disabled={trabajando || !monto.trim()} onClick={() => void cargar()}>Cargar</Button>
      </div>
    </div>
  )
}
