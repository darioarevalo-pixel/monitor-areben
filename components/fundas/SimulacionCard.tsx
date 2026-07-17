'use client'
/* eslint-disable @next/next/no-img-element -- las fotos son data URLs base64 (thumbs de pedidos), next/image no aplica */

import { useState } from 'react'
import { computeFrom, repartir, sumaVars, varActivo } from '@/lib/fundas/simulacion'
import { iphoneModelSort } from '@/lib/fundas/ranking'
import { bloqueToCanvas, copiarOdescargarPNG } from '@/lib/fundas/export'
import { imgAThumb } from '@/lib/imagenes'
import type { SimVar } from '@/lib/fundas/tipos'

/** El estado del editor de simulación, propiedad del shell (FundasModelo). */
export type EditorSim = {
  total: string
  rows: { model: string; pct: number }[]
  vars: SimVar[]
  varOn: boolean
  img: string | null
  editando: string | null
}

/** Modelos sugeridos en el autocompletar (index.html:4498, la línea 18 arriba). */
const FM_MODELOS = [
  'iPhone 18', 'iPhone 18 Air', 'iPhone 18 Pro', 'iPhone 18 Pro Max',
  'iPhone 17', 'iPhone 17 Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
  'iPhone 16', 'iPhone 16e', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
  'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
  'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
  'iPhone 13', 'iPhone 13 Mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
  'iPhone 12', 'iPhone 12 Mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
  'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
  'iPhone XR', 'iPhone XS Max', 'iPhone XS', 'iPhone X',
  'iPhone SE 3', 'iPhone SE 2', 'iPhone 8 Plus', 'iPhone 8',
]
const LINEA_18 = ['iPhone 18', 'iPhone 18 Pro', 'iPhone 18 Pro Max', 'iPhone 18 Air']

type Props = {
  editor: EditorSim
  setEditor: (updater: (e: EditorSim) => EditorSim) => void
  onGuardar: () => void
  onNuevo: () => void
  onVaciar: () => void
}

/**
 * Editor de la simulación de pedido. Port de fmSimRender/Recalc + variantes + foto
 * + copiar (index.html:4510-5103). La diferencia grande con el legacy: la mutación
 * por índice (`fmSimRows[i].model=...`, 4538) pasa a **setState inmutable**.
 *
 * "Imagen" (copiar como PNG) queda inerte hasta el Paso 4.
 */
export function SimulacionCard({ editor, setEditor, onGuardar, onNuevo, onVaciar }: Props) {
  const [sort, setSort] = useState<{ col: 'model' | 'pct' | null; dir: number }>({ col: null, dir: 1 })
  const [copiado, setCopiado] = useState('')
  const [imgMsg, setImgMsg] = useState('')

  const { total, rows, vars, varOn, img } = editor
  const totalNum = parseFloat(total) || 0
  const activo = varActivo(vars, varOn)
  const vpcts = vars.map((v) => v.pct)
  const vExact = Math.abs(vpcts.reduce((a, b) => a + b, 0) - 100) < 0.05

  const partsDe = (qty: number) => (vExact ? repartir(qty, vpcts) : vpcts.map((p) => Math.round((qty * p) / 100)))

  const flash = (k: string) => { setCopiado(k); setTimeout(() => setCopiado(''), 1500) }
  const copiar = (texto: string, k: string) => {
    navigator.clipboard.writeText(texto).then(() => flash(k)).catch(() => alert('Copiá esto manualmente:\n\n' + texto))
  }

  // ── Mutaciones del editor (inmutables) ──
  const set = (patch: Partial<EditorSim>) => setEditor((e) => ({ ...e, ...patch }))
  const setRows = (fn: (r: EditorSim['rows']) => EditorSim['rows']) => setEditor((e) => ({ ...e, rows: fn(e.rows) }))
  const setVars = (fn: (v: SimVar[]) => SimVar[]) => setEditor((e) => ({ ...e, vars: fn(e.vars) }))

  const agregarFila = () => setRows((r) => [...r, { model: '', pct: 0 }])
  const agregarLinea18 = () =>
    setRows((r) => {
      const ya = new Set(r.map((x) => (x.model || '').trim().toLowerCase()))
      return [...r, ...LINEA_18.filter((m) => !ya.has(m.toLowerCase())).map((m) => ({ model: m, pct: 0 }))]
    })
  const eliminarFila = (i: number) => setRows((r) => r.filter((_, j) => j !== i))
  const ordenar = (col: 'model' | 'pct') => {
    const dir = sort.col === col ? -sort.dir : col === 'model' ? 1 : -1
    setSort({ col, dir })
    setRows((r) =>
      [...r].sort((a, b) => (col === 'model' ? iphoneModelSort(a.model || '', b.model || '') * dir : (a.pct - b.pct) * dir)),
    )
  }
  const arrow = (c: 'model' | 'pct') => (sort.col === c ? (sort.dir < 0 ? ' ▼' : ' ▲') : '')

  const toggleVar = (on: boolean) =>
    setEditor((e) => ({
      ...e,
      varOn: on,
      vars: on && e.vars.length === 0 ? [{ name: '', pct: 0, img: null }, { name: '', pct: 0, img: null }] : e.vars,
    }))
  const agregarVar = () => setVars((v) => [...v, { name: '', pct: 0, img: null }])
  const eliminarVar = (i: number) => setVars((v) => v.filter((_, j) => j !== i))
  const setVarCampo = (i: number, patch: Partial<SimVar>) => setVars((v) => v.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  // ── Copiar ──
  const copiarTabla = (modo: 'ambos' | 'cantidad') => {
    const lineas = computeFrom(totalNum, rows, vars, activo)
    let text: string
    if (activo) {
      const names = vars.map((v, j) => v.name || 'Var ' + (j + 1))
      text =
        modo === 'ambos'
          ? [['Modelo', ...names].join('\t'), ...lineas.map((r) => [r.model, ...(r.parts || [])].join('\t'))].join('\n')
          : lineas.map((r) => (r.parts || []).join('\t')).join('\n')
    } else {
      text = lineas.map((r) => (modo === 'ambos' ? `${r.model}\t${r.qty}` : `${r.qty}`)).join('\n')
    }
    copiar(text, 'tabla-' + modo)
  }
  const copiarColumna = (arg: number | 'total' | 'cant') => {
    const lineas = computeFrom(totalNum, rows, vars, activo)
    if (!lineas.length) return
    let prefijo = '', items: string[]
    if (typeof arg === 'number') {
      prefijo = (vars[arg]?.name || 'Var ' + (arg + 1)) + ': '
      items = lineas.map((r) => `${r.model} ${(r.parts && r.parts[arg]) || 0}u`)
    } else {
      prefijo = arg === 'total' ? 'Total: ' : ''
      items = lineas.map((r) => `${r.model} ${r.qty}u`)
    }
    copiar(prefijo + items.join(' / '), 'col-' + arg)
  }
  const copiarFila = (i: number) => {
    const r = rows[i]
    if (!r || !r.model) return
    const qty = Math.round((totalNum * r.pct) / 100)
    let texto: string
    if (activo) {
      const parts = partsDe(qty)
      texto = `${r.model}: ${vars.map((v, j) => `${v.name || 'Var ' + (j + 1)} ${parts[j]}u`).join(' / ')}`
    } else {
      texto = `${r.model}: ${qty}u`
    }
    copiar(texto, 'fila-' + i)
  }

  // Copiar la simulación actual como imagen PNG (fmSimCopiarImagen, 5250).
  const copiarImagen = async () => {
    if (!computeFrom(totalNum, rows, vars, activo).length) return
    setImgMsg('Generando...')
    try {
      const canvas = await bloqueToCanvas({ nombre: '', total: totalNum, rows, vars, varOn, img })
      const res = await copiarOdescargarPNG(canvas, 'pedido.png')
      setImgMsg(res === 'copiado' ? '✓ Copiado' : '✓ Descargado')
    } catch {
      setImgMsg('')
      alert('No se pudo generar la imagen.')
      return
    }
    setTimeout(() => setImgMsg(''), 1500)
  }

  // ── Totales del pie ──
  let sumPct = 0, sumQty = 0
  const vcolTot = vars.map(() => 0)
  rows.forEach((r) => {
    const qty = Math.round((totalNum * r.pct) / 100)
    sumPct += r.pct
    sumQty += qty
    if (activo) partsDe(qty).forEach((q, j) => { vcolTot[j] += q })
  })

  const sumaV = sumaVars(vars)
  const sumaVok = Math.abs(sumaV - 100) < 0.05
  const copyIcon = (k: string) => (copiado === k ? '✓' : '⎘')

  return (
    <div className="card" id="fm-sim-card" style={{ marginTop: 4 }}>
      <datalist id="fm-sim-modelos">{FM_MODELOS.map((m) => <option key={m} value={m} />)}</datalist>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>Simulación de pedido</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#666' }}>Total a pedir:</label>
          <input type="number" min={1} value={total} onChange={(e) => set({ total: e.target.value })} style={{ width: 90, textAlign: 'center', fontWeight: 600 }} />
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>unidades</span>
        </div>
      </div>

      {/* Foto general del pedido */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <label title="Foto del pedido (opcional)" style={{ cursor: 'pointer', flex: 'none' }}>
          <input type="file" accept="image/*" onChange={(e) => imgAThumb(e.target.files?.[0], (url) => set({ img: url }))} style={{ display: 'none' }} />
          {img ? (
            <img src={img} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E7EB', display: 'block' }} />
          ) : (
            <span style={{ display: 'flex', width: 46, height: 46, alignItems: 'center', justifyContent: 'center', border: '1px dashed #CBD5E1', borderRadius: 8, color: '#9CA3AF', fontSize: 18 }}>📷</span>
          )}
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 12, color: '#666' }}>Foto del pedido <span style={{ color: '#9CA3AF' }}>(opcional)</span></span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>Aparece arriba en la imagen y el PDF. Ideal si todo el pedido es del mismo diseño.</span>
        </div>
        {img && <button onClick={() => set({ img: null })} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 11 }}>quitar</button>}
      </div>

      {/* Variantes */}
      <div style={{ marginBottom: 14, padding: '10px 12px', background: '#F9FAFB', border: '1px solid #EEF0F2', borderRadius: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#444', cursor: 'pointer' }}>
          <input type="checkbox" checked={varOn} onChange={(e) => toggleVar(e.target.checked)} />
          Separar cada modelo por variantes (color o diseño)
        </label>
        {varOn && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>Definí las variantes y qué % del pedido va a cada una. Tienen que sumar 100%.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {vars.map((v, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label title="Foto (opcional)" style={{ cursor: 'pointer', flex: 'none' }}>
                    <input type="file" accept="image/*" onChange={(e) => imgAThumb(e.target.files?.[0], (url) => setVarCampo(i, { img: url }))} style={{ display: 'none' }} />
                    {v.img ? (
                      <img src={v.img} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 6, border: '1px solid #E5E7EB', display: 'block' }} />
                    ) : (
                      <span style={{ display: 'flex', width: 38, height: 38, alignItems: 'center', justifyContent: 'center', border: '1px dashed #CBD5E1', borderRadius: 6, color: '#9CA3AF', fontSize: 16 }}>📷</span>
                    )}
                  </label>
                  {v.img && <button onClick={() => setVarCampo(i, { img: null })} title="Quitar foto" style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 11, padding: 0 }}>quitar</button>}
                  <input value={v.name} placeholder={`Variante ${i + 1} (ej: Negro, Serpiente...)`} onChange={(e) => setVarCampo(i, { name: e.target.value })} style={{ flex: 1, maxWidth: 240, padding: '5px 8px', fontSize: 13 }} />
                  <input type="number" min={0} max={100} step={0.1} value={v.pct} onChange={(e) => setVarCampo(i, { pct: parseFloat(e.target.value) || 0 })} style={{ width: 70, textAlign: 'center', padding: '5px 6px', fontSize: 13 }} />
                  <span style={{ fontSize: 12, color: '#888' }}>%</span>
                  <button onClick={() => eliminarVar(i)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
              <button onClick={agregarVar} style={{ background: 'none', border: 'none', color: '#378ADD', cursor: 'pointer', fontSize: 12, padding: 0 }}>+ Agregar variante</button>
              <span style={{ fontSize: 12, fontWeight: 600, color: sumaVok ? '#16A34A' : '#DC2626' }}>
                Σ {sumaV.toFixed(1)}%{sumaVok ? ' ✓' : sumaV < 100 ? ` — falta ${(100 - sumaV).toFixed(1)}%` : ` — sobra ${(sumaV - 100).toFixed(1)}%`}
              </span>
            </div>
          </div>
        )}
      </div>

      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th onClick={() => ordenar('model')} style={{ cursor: 'pointer' }}>Modelo{arrow('model')}</th>
            <th onClick={() => ordenar('pct')} style={{ width: activo ? 88 : 110, textAlign: 'center', cursor: 'pointer' }}>{activo ? '% pedido' : '% del pedido'}{arrow('pct')}</th>
            <th style={{ width: activo ? 64 : 110, textAlign: 'center' }}>
              {activo ? 'Cant. ' : 'Cantidad '}
              <span onClick={() => copiarColumna(activo ? 'total' : 'cant')} title="Copiar modelos con su cantidad" style={{ cursor: 'pointer', color: '#9CA3AF', fontSize: 11 }}>{copyIcon(activo ? 'col-total' : 'col-cant')}</span>
            </th>
            {activo && vars.map((v, j) => (
              <th key={j} style={{ textAlign: 'center', minWidth: 62 }}>
                {v.img && <img src={v.img} alt="" style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 4, display: 'block', margin: '0 auto 3px' }} />}
                {v.name || 'Var ' + (j + 1)}<br />
                <span onClick={() => copiarColumna(j)} title="Copiar esta variante" style={{ cursor: 'pointer', color: '#9CA3AF', fontSize: 11 }}>{copyIcon('col-' + j)}</span>
              </th>
            ))}
            <th style={{ width: activo ? 36 : 40 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const qty = Math.round((totalNum * r.pct) / 100)
            const parts = activo ? partsDe(qty) : null
            return (
              <tr key={i}>
                <td><input list="fm-sim-modelos" value={r.model} onChange={(e) => setRows((rr) => rr.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)))} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, padding: '4px 0' }} /></td>
                <td style={{ textAlign: 'center' }}><input type="number" value={r.pct} min={0} max={100} step={0.1} onChange={(e) => setRows((rr) => rr.map((x, j) => (j === i ? { ...x, pct: parseFloat(e.target.value) || 0 } : x)))} style={{ width: 75, textAlign: 'center', padding: '4px 6px', fontSize: 13 }} /></td>
                <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 13 }}>{qty}</td>
                {activo && parts?.map((q, j) => <td key={j} style={{ textAlign: 'center', fontSize: 13, color: '#1F4E78' }}>{q}</td>)}
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {activo && <button onClick={() => copiarFila(i)} title="Copiar este modelo con sus variantes" style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 13, marginRight: 4 }}>{copyIcon('fila-' + i)}</button>}
                  <button onClick={() => eliminarFila(i)} title="Eliminar fila" style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: '#F9FAFB' }}>
            <td style={{ fontWeight: 600, fontSize: 12, padding: '8px 12px' }}>
              <button onClick={agregarFila} style={{ background: 'none', border: 'none', color: '#378ADD', cursor: 'pointer', fontSize: 12, padding: 0 }}>+ Agregar modelo</button>
              <button onClick={agregarLinea18} style={{ background: 'none', border: 'none', color: '#7C3AED', cursor: 'pointer', fontSize: 12, padding: 0, marginLeft: 12 }}>+ Línea 18</button>
            </td>
            <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{sumPct.toFixed(1)}%</td>
            <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{sumQty}</td>
            {activo && vcolTot.map((t, j) => <td key={j} style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{t}</td>)}
            <td />
          </tr>
        </tfoot>
      </table>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>Los porcentajes y modelos son editables. <b>Tip:</b> tocá <b>⎘</b> en una columna para copiar esa línea lista para tipear en la tienda.</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={onGuardar} title="Guarda este pedido en la lista de abajo" style={{ background: '#378ADD', color: '#fff' }}>💾 Guardar pedido</button>
          <button className="btn-sm" onClick={onNuevo} title="Vacía el editor para armar otro pedido">➕ Nuevo</button>
          <button className="btn-sm" onClick={onVaciar} title="Borra todo y empieza de cero" style={{ color: '#DC2626' }}>🗑 Vaciar</button>
          <button className="btn-sm" onClick={() => copiarTabla('ambos')} title="Copia modelo y cantidad separados por tabulación">{copiado === 'tabla-ambos' ? '✓ Copiado' : '⎘ Modelo + Cantidad'}</button>
          <button className="btn-sm" onClick={() => copiarTabla('cantidad')} title="Copia solo las cantidades">{copiado === 'tabla-cantidad' ? '✓ Copiado' : '⎘ Solo cantidad'}</button>
          <button className="btn-sm" onClick={copiarImagen} disabled={imgMsg === 'Generando...'} title="Copia la tabla como imagen para pegar en WhatsApp" style={{ background: '#25D366', color: '#fff' }}>{imgMsg || '📷 Imagen'}</button>
        </div>
      </div>
    </div>
  )
}
