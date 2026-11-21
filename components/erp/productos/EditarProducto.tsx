'use client'

/**
 * «Editar el producto» en la ficha de Productos (Bruno, 20-oct: «se tiene que poder hacer»): nombre y categoría del producto;
 * talle, SKU y código de barras de cada variante; agregar una variante; desactivar / activar el producto (Darío 19-nov:
 * las fundas agotadas que no vuelven). Desactivar sólo sin stock; la vuelta es la vista «Inactivos» › Activar. Habla con `api/_erp-catalogo.js`
 * (motor `catalogo-edicion.mjs`, sql/037). Cada cambio guarda quién, antes y después, y queda en «Cambios de la ficha».
 *
 * 🔴 Editar una fila que vino de GN la pasa a «cargada»: la copia de GN ⛔ la actualiza más. Por eso se avisa ANTES de guardar.
 * 🔑 Sólo Admin (permiso `configurar` en la puerta): el que no puede recibe el 403 dicho en pantalla.
 */

import { useState } from 'react'
import { Button, ConfirmDetalle, Field, Input, color, font, space, useConfirmar } from '@/components/ui'
import { agregarVarianteErp, editarProductoErp, editarVarianteErp, type FilaProducto, type MarcaErp } from '@/lib/erp/cliente'

const vacioANull = (t: string) => (t.trim() === '' ? null : t.trim())

type Renglon = { talle: string; sku: string; barcode: string }
const NUEVA: Renglon = { talle: '', sku: '', barcode: '' }

export function EditarProducto({ marca, fila, onError, onListo, onCancelar }: {
  marca: MarcaErp
  fila: FilaProducto
  onError: (e: string) => void
  /** Se guardó (texto de lo hecho y el aviso del motor, si vino): la ficha y la lista se vuelven a leer. */
  onListo: (hecho: string, aviso?: string | null) => void
  /** Cierra la ventana sin guardar. */
  onCancelar?: () => void
}) {
  const [nombre, setNombre] = useState(fila.nombre)
  const [categoria, setCategoria] = useState(fila.categoria ?? '')
  const [vars, setVars] = useState<Record<string, Renglon>>(() => Object.fromEntries(fila.variantes.map((v) => [v.talle, { talle: v.talleNombre, sku: v.sku ?? '', barcode: v.barcode ?? '' }])))
  // Darío 20-nov: las variantes nuevas son renglones más de la MISMA tabla, y todo se guarda con un solo botón.
  const [nuevas, setNuevas] = useState<Renglon[]>([])
  const [trabajando, setTrabajando] = useState(false)
  const { confirmar } = useConfirmar()

  // ── Qué cambió (se calcula en cada dibujo: el botón dice cuántos cambios hay) ──
  const cambiosProducto: { nombre?: string; categoria?: string | null } = {}
  if (nombre.trim() !== fila.nombre) cambiosProducto.nombre = nombre.trim()
  if ((vacioANull(categoria) ?? null) !== (fila.categoria ?? null)) cambiosProducto.categoria = vacioANull(categoria)
  const cambiosVariantes = fila.variantes.flatMap((v) => {
    const e = vars[v.talle]
    if (!e) return []
    const c: { talle?: string; sku?: string | null; barcode?: string | null } = {}
    if (e.talle.trim() !== v.talleNombre) c.talle = e.talle.trim()
    if (vacioANull(e.sku) !== (v.sku ?? null)) c.sku = vacioANull(e.sku)
    if (vacioANull(e.barcode) !== (v.barcode ?? null)) c.barcode = vacioANull(e.barcode)
    return Object.keys(c).length ? [{ v, c }] : []
  })
  const agregadas = nuevas.filter((n) => n.talle.trim() || n.sku.trim() || n.barcode.trim())
  const total = Object.keys(cambiosProducto).length + cambiosVariantes.length + agregadas.length
  const distinto = (talle: string, k: keyof Renglon) => {
    const v = fila.variantes.find((x) => x.talle === talle)
    const e = vars[talle]
    if (!v || !e) return false
    return k === 'talle' ? e.talle.trim() !== v.talleNombre : vacioANull(e[k]) !== ((k === 'sku' ? v.sku : v.barcode) ?? null)
  }

  async function guardar() {
    if (cambiosProducto.nombre === '') return onError('El nombre no puede quedar vacío.')
    if (cambiosVariantes.some(({ c }) => c.talle === '')) return onError('Una variante no puede quedar sin nombre.')
    if (agregadas.some((n) => !n.talle.trim())) return onError('Falta el nombre de la variante nueva.')
    const filas: [string, string][] = []
    if ('nombre' in cambiosProducto) filas.push(['Nombre', `${fila.nombre} → ${cambiosProducto.nombre}`])
    if ('categoria' in cambiosProducto) filas.push(['Categoría', `${fila.categoria ?? 'Sin categoría'} → ${cambiosProducto.categoria ?? 'Sin categoría'}`])
    for (const { v, c } of cambiosVariantes) {
      if ('talle' in c) filas.push([v.talleNombre, `${v.talleNombre} → ${c.talle}`])
      if ('sku' in c) filas.push([`${v.talleNombre} · SKU`, `${v.sku ?? 'sin SKU'} → ${c.sku ?? 'sin SKU'}`])
      if ('barcode' in c) filas.push([`${v.talleNombre} · Código de barras`, `${v.barcode ?? 'sin código'} → ${c.barcode ?? 'sin código'}`])
    }
    for (const n of agregadas) filas.push(['Variante nueva', [n.talle.trim(), n.sku.trim(), n.barcode.trim()].filter(Boolean).join(' · ')])
    const ok = await confirmar({
      titulo: `¿Guardar ${total === 1 ? '1 cambio' : `${total} cambios`} en ${fila.nombre}?`,
      mensaje: <div>{filas.map(([k, v], i) => <ConfirmDetalle key={i} label={k} valor={v} />)}</div>,
      ok: 'Guardar',
      tono: 'brand',
    })
    if (!ok) return
    setTrabajando(true)
    const avisos: string[] = []
    let hechos = 0
    try {
      if (Object.keys(cambiosProducto).length) { const r = await editarProductoErp(marca, fila.producto, cambiosProducto); avisos.push(...r.avisos.map((x) => x.texto)); hechos++ }
      for (const { v, c } of cambiosVariantes) { const r = await editarVarianteErp(marca, fila.producto, v.talle, c); avisos.push(...r.avisos.map((x) => x.texto)); hechos++ }
      for (const n of agregadas) { const r = await agregarVarianteErp(marca, fila.producto, { talle: n.talle.trim(), sku: n.sku.trim() || undefined, barcode: n.barcode.trim() || undefined }); avisos.push(...r.avisos.map((x) => x.texto)); hechos++ }
      onListo(`${fila.nombre}: ${hechos === 1 ? '1 cambio guardado' : `${hechos} cambios guardados`}.`, avisos.join(' ') || null)
    } catch (e) {
      // Lo que ya se guardó, guardado queda: se dice cuánto llegó a guardarse.
      onError(`${hechos ? `Se guardaron ${hechos} de ${total} cambios. ` : ''}${e instanceof Error ? e.message : 'No se pudo guardar.'}`)
      if (hechos) onListo(`${fila.nombre}: ${hechos} de ${total} cambios guardados.`)
    } finally {
      setTrabajando(false)
    }
  }

  const poner = (talle: string, k: keyof Renglon, t: string) => setVars((m) => ({ ...m, [talle]: { ...m[talle], [k]: t } }))
  const ponerNueva = (i: number, k: keyof Renglon, t: string) => setNuevas((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: t } : x)))
  const COLS = 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.1fr) 32px'
  const tit: React.CSSProperties = { fontSize: font.sm, color: color.mut, paddingBottom: 6 }
  // El campo cambiado se marca (borde índigo + fondo suave): se ve qué se va a guardar antes de apretar.
  const marcado = (on: boolean): React.CSSProperties => (on ? { borderColor: 'var(--mo-brand-solid)', background: 'var(--mo-brand-bg)' } : {})
  const quitar = (i: number) => setNuevas((xs) => xs.filter((_, j) => j !== i))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <Field label="Nombre" style={{ flex: '2 1 220px' }}><Input value={nombre} onChange={(e) => setNombre(e.target.value)} style={marcado('nombre' in cambiosProducto)} /></Field>
        <Field label="Categoría" style={{ flex: '1 1 140px' }}><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} style={marcado('categoria' in cambiosProducto)} /></Field>
      </div>

      <section>
        <div role="table" aria-label="Variantes" style={{ display: 'grid', gridTemplateColumns: COLS, columnGap: space[2], rowGap: 6, alignItems: 'center' }}>
          <span role="columnheader" style={tit}>Variante</span>
          <span role="columnheader" style={tit}>SKU</span>
          <span role="columnheader" style={tit}>Código de barras</span>
          <span />
          {fila.variantes.map((v) => (
            <div key={v.talle} role="row" style={{ display: 'contents' }}>
              <Input aria-label={`Variante ${v.talleNombre}`} value={vars[v.talle]?.talle ?? ''} onChange={(e) => poner(v.talle, 'talle', e.target.value)} style={marcado(distinto(v.talle, 'talle'))} />
              <Input aria-label={`SKU de ${v.talleNombre}`} value={vars[v.talle]?.sku ?? ''} onChange={(e) => poner(v.talle, 'sku', e.target.value)} placeholder="sin SKU" style={marcado(distinto(v.talle, 'sku'))} />
              <Input aria-label={`Código de barras de ${v.talleNombre}`} value={vars[v.talle]?.barcode ?? ''} onChange={(e) => poner(v.talle, 'barcode', e.target.value)} placeholder="sin código de barras" inputMode="numeric" style={marcado(distinto(v.talle, 'barcode'))} />
              <span />
            </div>
          ))}
          {nuevas.map((n, i) => (
            <div key={`n${i}`} role="row" style={{ display: 'contents' }}>
              <Input aria-label="Variante nueva" value={n.talle} onChange={(e) => ponerNueva(i, 'talle', e.target.value)} placeholder="Variante nueva" autoFocus style={marcado(true)} />
              <Input aria-label="SKU de la variante nueva" value={n.sku} onChange={(e) => ponerNueva(i, 'sku', e.target.value)} placeholder="sin SKU" style={marcado(true)} />
              <Input aria-label="Código de barras de la variante nueva" value={n.barcode} onChange={(e) => ponerNueva(i, 'barcode', e.target.value)} placeholder="sin código de barras" inputMode="numeric" style={marcado(true)} />
              <button type="button" aria-label="Sacar la variante nueva" onClick={() => quitar(i)} style={{ height: 32, width: 32, padding: 0, border: 0, borderRadius: 8, background: 'transparent', color: color.mut, cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" disabled={trabajando} onClick={() => setNuevas((xs) => [...xs, NUEVA])} style={{ marginTop: space[2] }}>+ Agregar variante</Button>
      </section>

      {/* Pie: guardar, índigo a la derecha. Eliminar/Activar está en la ficha, al lado de Editar (Darío 20-nov). */}
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
        <div style={{ display: 'flex', gap: space[2] }}>
          {onCancelar && <Button variant="outline" disabled={trabajando} onClick={onCancelar}>Cancelar</Button>}
          <Button variant="solid" tone="brand" disabled={trabajando || !total} onClick={() => void guardar()}>{total ? `Guardar ${total === 1 ? '1 cambio' : `${total} cambios`}` : 'Guardar cambios'}</Button>
        </div>
      </div>
    </div>
  )
}
