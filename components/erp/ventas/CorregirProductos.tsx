'use client'

/**
 * «Corregir productos» de una venta ya hecha, con el MISMO número (motor sql/088; Bruno 16/18-nov: la #33748 de BDI se cargó
 * con TEMPLADO 9D en vez de 9D PREMIUM). Por renglón se elige cuánto QUEDA (−/+), y se agregan prendas con el buscador de
 * Nueva venta al precio de la lista del canal. El motor agrega líneas (⛔ edita), mueve el stock en el depósito de la venta y
 * compara el total nuevo con lo cobrado: la diferencia queda a la vista, ⛔ se mueve plata.
 */

import { useEffect, useRef, useState } from 'react'
import { Button, Field, Input, Modal, Notice, color, font, space } from '@/components/ui'
import {
  buscarPrendas, corregirProductosDeVenta, leerPrecioDeProducto,
  type FichaDeVenta, type FilaVentaLista, type MarcaErp, type PrendaEncontrada,
} from '@/lib/erp/cliente'
import { deLaTienda } from '@/lib/erp/linea-erp'
import { plata } from '@/lib/erp/ventas-lista.core.js'
import { MOTIVO_MINIMO } from '@/lib/erp/venta.core.js'
import { cuentaDeCorreccion } from '@/lib/erp/correccion-productos.core.js'

const LISTA_DE_CANAL: Record<string, string> = { local: 'local', online: 'online', mayorista: 'mayorista', ml: 'online' }

type Agregada = { clave: string; producto: string; talle: string; nombre: string; talleNombre: string | null; cantidad: number; precio: string }

export function CorregirProductos({ marca, fila, ficha, abierto, onCerrar, onListo }: {
  marca: MarcaErp
  fila: FilaVentaLista
  ficha: FichaDeVenta
  abierto: boolean
  onCerrar: () => void
  onListo: (aviso: string) => void
}) {
  const lineas = ficha.lineas.filter((l) => !l.devuelta)
  // Se monta al abrir (FichaVenta): todo como está y un identificador nuevo para el guardado (el reintento devuelve lo mismo).
  const [quedan, setQuedan] = useState<Record<string, number>>(() => Object.fromEntries(lineas.map((l) => [l.id, l.cantidad - l.cambiado])))
  const [agregadas, setAgregadas] = useState<Agregada[]>([])
  const [motivo, setMotivo] = useState('')
  const [q, setQ] = useState('')
  const [encontradas, setEncontradas] = useState<PrendaEncontrada[]>([])
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [ref] = useState(() => crypto.randomUUID())
  const busqueda = useRef(0)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current) }, [])

  // Buscar mientras se escribe (350 ms después de la última tecla), como Nueva venta.
  const escribir = (texto: string) => {
    setQ(texto)
    if (espera.current) clearTimeout(espera.current)
    const t = texto.trim()
    const n = ++busqueda.current
    if (t.length < 3) { setEncontradas([]); return }
    espera.current = setTimeout(() => {
      buscarPrendas(marca, t)
        .then((r) => { if (n === busqueda.current) setEncontradas(marca === 'bdi' ? r.variantes : deLaTienda(r.variantes, fila.linea === 'stunned' ? 'stunned' : 'zattia')) })
        .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo buscar.'))
    }, 350)
  }

  const agregar = async (p: PrendaEncontrada) => {
    const clave = `${p.producto}/${p.talle}`
    if (agregadas.some((a) => a.clave === clave)) { setAgregadas((x) => x.map((a) => (a.clave === clave ? { ...a, cantidad: a.cantidad + 1 } : a))); return }
    setAgregadas((x) => [...x, { clave, producto: p.producto, talle: p.talle, nombre: p.nombre ?? p.sku ?? `Producto ${p.producto}`, talleNombre: p.talleNombre, cantidad: 1, precio: '' }])
    escribir('')
    try {
      const pr = await leerPrecioDeProducto(marca, p.producto)
      const f = pr.listas.find((l) => l.lista === LISTA_DE_CANAL[fila.canal ?? 'local'])
      if (f?.precio != null) setAgregadas((x) => x.map((a) => (a.clave === clave && a.precio === '' ? { ...a, precio: String(f.precio) } : a)))
    } catch { /* sin precio de lista: se escribe a mano */ }
  }

  const cuenta = cuentaDeCorreccion({
    total: ficha.venta.total,
    lineas: lineas.map((l) => ({ id: l.id, cantidad: l.cantidad, cambiado: l.cambiado, importe: l.importe })),
    quedan,
    agregadas: agregadas.map((a) => ({ cantidad: a.cantidad, precio: Number(String(a.precio).replace(',', '.')) })),
  })
  const listo = !cuenta.error && cuenta.hayCambio && motivo.trim().length >= MOTIVO_MINIMO

  const guardar = async () => {
    setTrabajando(true)
    try {
      const r = await corregirProductosDeVenta(marca, fila.id, {
        motivo: motivo.trim(), ref,
        sacar: cuenta.sacar,
        agregar: agregadas.map((a) => ({ producto: a.producto, talle: a.talle, cantidad: a.cantidad, precio: Number(String(a.precio).replace(',', '.')) })),
      })
      const d = r.correccion.diferencia
      const sinStock = r.avisos.filter((a) => a.codigo === 'SIN_STOCK_EN_LIBRO').map((a) => a.sku ?? 'un producto')
      onListo(`Productos de la venta ${fila.ref} corregidos: total ${plata(r.correccion.total_despues)}.${d === 0 ? '' : d > 0 ? ` Faltan cobrar ${plata(d)}: registrá el cobro.` : ` Sobran ${plata(-d)}: hay que devolverlos.`} No se movió plata.${sinStock.length ? ` Sin stock en el sistema: ${sinStock.join(', ')} (queda en negativo).` : ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron corregir los productos.')
    } finally {
      setTrabajando(false)
    }
  }

  const fila2: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: space[2], justifyContent: 'space-between', flexWrap: 'wrap' }
  const chico: React.CSSProperties = { fontSize: font.sm, color: color.mut }
  const masMenos = (valor: number, poner: (n: number) => void, max: number) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}>
      <Button size="sm" variant="outline" disabled={valor <= 0} onClick={() => poner(valor - 1)} aria-label="Una menos">−</Button>
      <b style={{ minWidth: 24, textAlign: 'center' }}>{valor}</b>
      <Button size="sm" variant="outline" disabled={valor >= max} onClick={() => poner(valor + 1)} aria-label="Una más">+</Button>
    </span>
  )

  return (
    <Modal
      abierto={abierto} onCerrar={onCerrar} titulo={`Corregir los productos de la venta ${fila.ref}`}
      pie={<>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button disabled={trabajando || !listo} onClick={() => void guardar()}>Corregir productos</Button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Notice tone="neutral">La venta sigue con el mismo número. Lo que sacás vuelve al stock y lo que agregás sale, del depósito de la venta. No mueve plata: el total nuevo se compara con lo cobrado y la diferencia queda a la vista. Con factura no se puede (va nota de crédito).</Notice>
        {error && <Notice tone="danger">{error}</Notice>}
        <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <b>Cuántas quedan de cada una</b>
          {lineas.map((l) => {
            const max = l.cantidad - l.cambiado
            return (
              <div key={l.id} style={fila2}>
                <span>{l.nombre ?? l.sku ?? `Producto ${l.producto}`}{l.talleNombre ? ` · ${l.talleNombre}` : ''} <span style={chico}>{plata(l.cantidad ? l.importe / l.cantidad : 0)} c/u{l.cambiado ? ` · ${l.cambiado} ya cambiada${l.cambiado === 1 ? '' : 's'}` : ''}</span></span>
                {max > 0 ? masMenos(quedan[l.id] ?? max, (n) => setQuedan({ ...quedan, [l.id]: n }), max) : <span style={chico}>ya cambiada</span>}
              </div>
            )
          })}
        </section>
        <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <b>Agregar productos</b>
          <Input value={q} onChange={(e) => escribir(e.target.value)} placeholder="Nombre, variante o SKU" aria-label="Buscar un producto para agregar" />
          {encontradas.slice(0, 20).map((p) => (
            <Button key={`${p.producto}/${p.talle}`} size="sm" variant="soft" onClick={() => void agregar(p)} style={{ justifyContent: 'flex-start', height: 'auto' }}>
              {p.nombre ?? p.sku}{p.talleNombre ? ` · ${p.talleNombre}` : ''}
            </Button>
          ))}
          {agregadas.map((a) => (
            <div key={a.clave} style={fila2}>
              <span>{a.nombre}{a.talleNombre ? ` · ${a.talleNombre}` : ''}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2] }}>
                {masMenos(a.cantidad, (n) => setAgregadas((x) => (n ? x.map((y) => (y.clave === a.clave ? { ...y, cantidad: n } : y)) : x.filter((y) => y.clave !== a.clave))), 999)}
                <Input style={{ width: 110 }} inputMode="decimal" value={a.precio} placeholder="Precio c/u" aria-label="Precio por unidad"
                  onChange={(e) => setAgregadas((x) => x.map((y) => (y.clave === a.clave ? { ...y, precio: e.target.value } : y)))} />
              </span>
            </div>
          ))}
        </section>
        <div style={{ fontSize: font.md }}>
          Total: {plata(ficha.venta.total)} → <b>{cuenta.error ? '—' : plata(cuenta.totalNuevo)}</b>
          {cuenta.error && <span style={{ color: color.danger }}> · {cuenta.error}</span>}
        </div>
        <Field label="Motivo" required hint="Queda guardado con tu nombre.">
          <textarea className="mo-input mo-input--multi" style={{ width: '100%', boxSizing: 'border-box' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
