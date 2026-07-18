'use client'

import { useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { aplicarAsignarLote, previsualizarAsignar, traerCategorias } from '@/lib/tncat/cliente'
import { nombresDeFilas } from '@/lib/tncat/excel'
import type { AsigMatched, AsigPreview, Categoria } from '@/lib/tncat/tipos'

const CHUNK = 20

/**
 * Asignar categoría por Excel (card 4, Zattia). Subís un Excel con nombres de
 * producto (columna A), se previsualiza el cruce contra TN y, al confirmar, se le
 * AGREGA la categoría a los que matcheen (sin borrar las que ya tengan). El cruce y
 * la escritura los hace el server. Port de tncatAsig*.
 */
export function AsignarCard({ marca }: { marca: Marca }) {
  const [categorias, setCategorias] = useState<Categoria[] | null>(null)
  const [catId, setCatId] = useState('')
  const [nombres, setNombres] = useState<string[]>([])
  const [info, setInfo] = useState('')
  const [preview, setPreview] = useState<AsigPreview | null>(null)
  const [prevMsg, setPrevMsg] = useState<React.ReactNode>(null)
  const [matched, setMatched] = useState<AsigMatched[]>([])
  const [catName, setCatName] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<React.ReactNode>(null)
  const [progreso, setProgreso] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const cats = await traerCategorias(marca)
        if (vivo) setCategorias(cats)
      } catch {
        if (vivo) setCategorias([])
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const onArchivo = async (file: File | undefined) => {
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][]
      const nn = nombresDeFilas(rows)
      setNombres(nn)
      setInfo(`${nn.length} nombre(s) cargado(s) de "${file.name}"`)
      await previsualizar(catId, nn)
    } catch (err) {
      alert('No pude leer el Excel: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const previsualizar = async (categoriaId: string, nn: string[]) => {
    setResultado(null)
    if (!nn.length) {
      setPreview(null)
      setPrevMsg(null)
      return
    }
    if (!categoriaId) {
      setPreview(null)
      setPrevMsg(<div style={{ fontSize: 13, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 10 }}>Elegí una categoría para previsualizar.</div>)
      return
    }
    setPrevMsg(<div style={{ color: '#9CA3AF', fontSize: 13, padding: 8 }}>Cruzando con TiendaNube…</div>)
    try {
      const d = await previsualizarAsignar(marca, categoriaId, nn)
      if (!d.ok) {
        setPreview(null)
        setPrevMsg(<div style={{ color: '#DC2626', fontSize: 13 }}>Error: {d.error || 'desconocido'}</div>)
        return
      }
      setMatched(d.matched || [])
      setCatName(d.categoria || '')
      setPreview(d)
      setPrevMsg(null)
    } catch (e) {
      setPreview(null)
      setPrevMsg(<div style={{ color: '#DC2626', fontSize: 13 }}>Error: {e instanceof Error ? e.message : String(e)}</div>)
    }
  }

  const onCat = (id: string) => {
    setCatId(id)
    previsualizar(id, nombres)
  }

  const aplicar = async () => {
    if (!matched.length) return
    if (!confirm(`Se va a agregar la categoría "${catName}" a ${matched.length} producto(s). ¿Confirmás?`)) return
    setAplicando(true)
    setPreview(null)
    const total = matched.length
    let aplicados = 0
    const errores: { nombre?: string; msg?: string; status?: string }[] = []
    setProgreso(0)
    try {
      for (let i = 0; i < total; i += CHUNK) {
        const lote = matched.slice(i, i + CHUNK)
        const d = await aplicarAsignarLote(marca, lote)
        if (d.ok) {
          aplicados += d.aplicados || 0
          if (d.errores) errores.push(...d.errores)
        } else {
          errores.push({ nombre: `(lote ${i / CHUNK + 1})`, msg: d.error || 'error' })
        }
        setProgreso(Math.round((Math.min(i + CHUNK, total) / total) * 100))
      }
      setProgreso(null)
      setResultado(
        <div>
          <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: 12, marginTop: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#047857' }}>✅ Listo</div>
            <div style={{ fontSize: 13, color: '#065F46', marginTop: 3 }}>
              Se agregó <b>{catName}</b> a <b>{aplicados}</b> producto(s).{errores.length ? ` ${errores.length} con error.` : ''}
            </div>
          </div>
          {errores.length ? (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#B91C1C', fontWeight: 600 }}>❌ Errores ({errores.length})</summary>
              <div style={{ fontSize: 12, color: '#374151', maxHeight: 180, overflow: 'auto', marginTop: 4, paddingLeft: 6 }}>
                {errores.map((e, i) => (
                  <div key={i}>{(e.nombre || '') + ': ' + (e.msg || e.status || '')}</div>
                ))}
              </div>
            </details>
          ) : null}
        </div>,
      )
      setMatched([])
    } catch (e) {
      setProgreso(null)
      setResultado(<div style={{ color: '#DC2626', fontSize: 13 }}>Error: {e instanceof Error ? e.message : String(e)} — aplicados {aplicados}/{total}.</div>)
    } finally {
      setAplicando(false)
    }
  }

  const lista = (titulo: string, color: string, arr: string[]) =>
    arr.length ? (
      <details style={{ marginTop: 6 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, color, fontWeight: 600 }}>{titulo} ({arr.length})</summary>
        <div style={{ fontSize: 12, color: '#374151', maxHeight: 180, overflow: 'auto', marginTop: 4, paddingLeft: 6 }}>
          {arr.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
      </details>
    ) : null

  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 700 }}>🗂️ Asignar categoría (Excel)</div>
      <div style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 12px', maxWidth: 680 }}>
        Elegí una categoría y subí un Excel con los <b>nombres de producto</b> en una columna (A1 = encabezado, de A2 para abajo los nombres). Te muestro la previsualización y, al confirmar, se le <b>agrega</b> esa categoría a los que matcheen — sin borrar las que ya tengan.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={catId} onChange={(e) => onCat(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13, minWidth: 220 }}>
          {categorias === null ? (
            <option value="">Cargando categorías…</option>
          ) : (
            <>
              <option value="">— Elegí una categoría —</option>
              {categorias.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </>
          )}
        </select>
        <label className="btn-sm" style={{ background: '#378ADD', color: '#fff', cursor: 'pointer' }}>
          📁 Subir Excel
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { onArchivo(e.target.files?.[0]); e.currentTarget.value = '' }} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{info}</span>
      </div>

      <div>
        {resultado}
        {progreso !== null && (
          <div style={{ margin: '8px 0' }}>
            <div style={{ background: '#E5E7EB', borderRadius: 8, height: 14, overflow: 'hidden' }}>
              <div style={{ background: '#16A34A', height: '100%', width: `${progreso}%`, transition: 'width .2s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>Aplicando en TiendaNube… {progreso}%</div>
          </div>
        )}
        {prevMsg}
        {preview && !resultado && progreso === null && (
          <div>
            <div style={{ fontSize: 13, margin: '6px 0' }}>
              Categoría: <b>{preview.categoria}</b> · <b>{matched.length}</b> se van a asignar de {preview.total} nombre(s).
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ background: '#ECFDF5', color: '#047857', borderRadius: 14, padding: '3px 10px' }}>✓ Matchean: {matched.length}</span>
              <span style={{ background: '#F3F4F6', color: '#6B7280', borderRadius: 14, padding: '3px 10px' }}>Ya la tenían: {preview.yaTenian.length}</span>
              <span style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: 14, padding: '3px 10px' }}>No encontrados: {preview.noEncontrados.length}</span>
            </div>
            {lista('✓ Se van a asignar', '#047857', matched.map((m) => m.nombre))}
            {lista('Ya tenían la categoría', '#6B7280', preview.yaTenian)}
            {lista('⚠️ No encontrados en TiendaNube (revisá el nombre)', '#B91C1C', preview.noEncontrados)}
          </div>
        )}
      </div>

      {matched.length > 0 && !resultado && progreso === null && (
        <div style={{ marginTop: 12 }}>
          <button className="btn-sm" onClick={aplicar} disabled={aplicando} style={{ background: '#16A34A', color: '#fff' }}>
            ✅ Aplicar en TiendaNube
          </button>
        </div>
      )}
    </div>
  )
}
