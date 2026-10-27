'use client'

/**
 * «Editar el producto» en la ficha de Productos (Bruno, 20-oct: «se tiene que poder hacer»): nombre y categoría del producto;
 * talle, SKU y código de barras de cada variante; agregar una variante. ⛔ Sin «desactivar» ni «archivar»: no hay vuelta desde la pantalla y el v8 no lo dibuja. Habla con `api/_erp-catalogo.js`
 * (motor `catalogo-edicion.mjs`, sql/037). Cada cambio guarda quién, antes y después, y queda en «Cambios de la ficha».
 *
 * 🔴 Editar una fila que vino de GN la pasa a «cargada»: la copia de GN ⛔ la actualiza más. Por eso se avisa ANTES de guardar.
 * 🔑 Sólo Admin (permiso `configurar` en la puerta): el que no puede recibe el 403 dicho en pantalla.
 */

import { useState } from 'react'
import { Button, ConfirmDetalle, Field, Input, space, useConfirmar } from '@/components/ui'
import { agregarVarianteErp, editarProductoErp, editarVarianteErp, type FilaProducto, type MarcaErp, type ResultadoEdicion } from '@/lib/erp/cliente'

const vacioANull = (t: string) => (t.trim() === '' ? null : t.trim())

export function EditarProducto({ marca, fila, onError, onListo }: {
  marca: MarcaErp
  fila: FilaProducto
  onError: (e: string) => void
  /** Se guardó (texto de lo hecho y el aviso del motor, si vino): la ficha y la lista se vuelven a leer. */
  onListo: (hecho: string, aviso?: string | null) => void
}) {
  const [nombre, setNombre] = useState(fila.nombre)
  const [categoria, setCategoria] = useState(fila.categoria ?? '')
  const [vars, setVars] = useState(() => Object.fromEntries(fila.variantes.map((v) => [v.talle, { talle: v.talleNombre, sku: v.sku ?? '', barcode: v.barcode ?? '' }])))
  const [nueva, setNueva] = useState<{ talle: string; sku: string; barcode: string } | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const { confirmar } = useConfirmar()

  async function correr(fn: () => Promise<void>, fallo: string) {
    setTrabajando(true)
    try { await fn() } catch (e) { onError(e instanceof Error ? e.message : fallo) } finally { setTrabajando(false) }
  }
  const dicho = (r: ResultadoEdicion, que: string) => (r.cambios.length ? `${que}: ${r.cambios.map((c) => c.campo).join(', ')} guardado.` : `${que}: no había nada distinto.`)
  const aviso = (r: ResultadoEdicion) => r.avisos.map((a) => a.texto).join(' ') || null

  /** Un aviso ANTES de guardar: una fila de GN editada pasa a «cargada». Sólo cuando hay algo para guardar. */
  const confirmarCambio = (titulo: string, filas: [string, string][]) => confirmar({
    titulo,
    mensaje: (
      <div>
        {filas.map(([k, v]) => <ConfirmDetalle key={k} label={k} valor={v} />)}
        <p style={{ marginTop: space[3] }}>Queda anotado quién lo cambió, con el antes y el después. Si el producto venía de Gestión Nube, desde ahora vale lo que cargues acá: la copia de Gestión Nube no lo vuelve a pisar.</p>
      </div>
    ),
    ok: 'Guardar',
    tono: 'warning',
  })

  const guardarProducto = () => correr(async () => {
    const cambios: { nombre?: string; categoria?: string | null } = {}
    if (nombre.trim() !== fila.nombre) cambios.nombre = nombre.trim()
    if ((vacioANull(categoria) ?? null) !== (fila.categoria ?? null)) cambios.categoria = vacioANull(categoria)
    if (!Object.keys(cambios).length) { onError('No cambiaste nada del producto.'); return }
    if (cambios.nombre === '') { onError('El nombre no puede quedar vacía.'); return }
    const filas: [string, string][] = []
    if ('nombre' in cambios) filas.push(['Nombre', `${fila.nombre} → ${cambios.nombre}`])
    if ('categoria' in cambios) filas.push(['Categoría', `${fila.categoria ?? 'Sin categoría'} → ${cambios.categoria ?? 'Sin categoría'}`])
    if (!(await confirmarCambio(`Editar ${fila.nombre}`, filas))) return
    const r = await editarProductoErp(marca, fila.producto, cambios)
    onListo(dicho(r, 'Producto'), aviso(r))
  }, 'No se pudo editar el producto.')

  const guardarVariante = (talle: string, nombreActual: string) => correr(async () => {
    const v = fila.variantes.find((x) => x.talle === talle)
    const e = vars[talle]
    if (!v || !e) return
    const cambios: { talle?: string; sku?: string | null; barcode?: string | null } = {}
    if (e.talle.trim() !== nombreActual) cambios.talle = e.talle.trim()
    if (vacioANull(e.sku) !== (v.sku ?? null)) cambios.sku = vacioANull(e.sku)
    if (vacioANull(e.barcode) !== (v.barcode ?? null)) cambios.barcode = vacioANull(e.barcode)
    if (!Object.keys(cambios).length) { onError('No cambiaste nada de esa variante.'); return }
    if (cambios.talle === '') { onError('La variante no puede quedar vacía.'); return }
    const filas: [string, string][] = []
    if ('talle' in cambios) filas.push(['Variante', `${nombreActual} → ${cambios.talle}`])
    if ('sku' in cambios) filas.push(['código', `${v.sku ?? 'sin código'} → ${cambios.sku ?? 'sin código'}`])
    if ('barcode' in cambios) filas.push(['Código de barras', `${v.barcode ?? 'sin código'} → ${cambios.barcode ?? 'sin código'}`])
    if (!(await confirmarCambio(`Editar la variante ${nombreActual}`, filas))) return
    const r = await editarVarianteErp(marca, fila.producto, talle, cambios)
    onListo(dicho(r, `Variante ${nombreActual}`), aviso(r))
  }, 'No se pudo editar la variante.')

  const agregar = () => correr(async () => {
    if (!nueva || !nueva.talle.trim()) { onError('Falta la variante de la variante nueva.'); return }
    if (!(await confirmarCambio(`Agregar una variante a ${fila.nombre}`, [['Variante', nueva.talle.trim()], ['código', nueva.sku.trim() || 'sin código'], ['Código de barras', nueva.barcode.trim() || 'sin código']]))) return
    const r = await agregarVarianteErp(marca, fila.producto, { talle: nueva.talle.trim(), sku: nueva.sku.trim() || undefined, barcode: nueva.barcode.trim() || undefined })
    setNueva(null)
    onListo(`Variante ${nueva.talle.trim()} agregada.`, aviso(r))
  }, 'No se pudo agregar la variante.')

  const fila3: React.CSSProperties = { display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }
  const poner = (talle: string, k: 'talle' | 'sku' | 'barcode', t: string) => setVars((m) => ({ ...m, [talle]: { ...m[talle], [k]: t } }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={fila3}>
        <Field label="Nombre" style={{ flex: '2 1 220px' }}><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
        <Field label="Categoría" style={{ flex: '1 1 140px' }}><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} /></Field>
        <Button disabled={trabajando} onClick={() => void guardarProducto()}>Guardar producto</Button>
      </div>

      {fila.variantes.map((v) => (
        <div key={v.talle} style={fila3}>
          <Field label="Variante" style={{ flex: '1 1 130px' }}><Input value={vars[v.talle]?.talle ?? ''} onChange={(e) => poner(v.talle, 'talle', e.target.value)} /></Field>
          <Field label="código" style={{ flex: '1 1 120px' }}><Input value={vars[v.talle]?.sku ?? ''} onChange={(e) => poner(v.talle, 'sku', e.target.value)} /></Field>
          <Field label="Código de barras" style={{ flex: '1 1 140px' }}><Input value={vars[v.talle]?.barcode ?? ''} onChange={(e) => poner(v.talle, 'barcode', e.target.value)} inputMode="numeric" /></Field>
          <Button variant="outline" disabled={trabajando} onClick={() => void guardarVariante(v.talle, v.talleNombre)}>Guardar</Button>
        </div>
      ))}

      {nueva ? (
        <div style={fila3}>
          <Field label="Variante nueva" style={{ flex: '1 1 130px' }}><Input value={nueva.talle} onChange={(e) => setNueva({ ...nueva, talle: e.target.value })} /></Field>
          <Field label="código" style={{ flex: '1 1 120px' }}><Input value={nueva.sku} onChange={(e) => setNueva({ ...nueva, sku: e.target.value })} /></Field>
          <Field label="Código de barras" style={{ flex: '1 1 140px' }}><Input value={nueva.barcode} onChange={(e) => setNueva({ ...nueva, barcode: e.target.value })} inputMode="numeric" /></Field>
          <Button disabled={trabajando} onClick={() => void agregar()}>Agregar</Button>
          <Button variant="outline" disabled={trabajando} onClick={() => setNueva(null)}>Cancelar</Button>
        </div>
      ) : (
        <div style={fila3}>
          <Button variant="outline" disabled={trabajando} onClick={() => setNueva({ talle: '', sku: '', barcode: '' })}>Agregar una variante</Button>
        </div>
      )}
    </div>
  )
}
