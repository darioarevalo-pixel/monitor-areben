'use client'

import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { dispararSyncStock } from '@/lib/sync-gn'
import { completarExcel, filtrarVars, gruposOrdenados, resolverScan } from '@/lib/conteo/core'
import { reporteDiferenciasPDF } from '@/lib/conteo/pdf'
import type { Producto } from '@/lib/etl/tipos'
import { useConteo } from './useConteo'

export function Conteo() {
  const { marca } = useSesion()
  const { datos } = useDatosMonitor()
  if (!datos) return <div className="card"><div style={{ padding: 20, color: '#9CA3AF' }}>Cargando…</div></div>
  return <Contenido key={marca} allProductos={datos.allProductos ?? []} />
}

function Contenido({ allProductos }: { allProductos: Producto[] }) {
  const { marca } = useSesion()
  const prodById = useMemo(() => Object.fromEntries(allProductos.map((p) => [String(p.id), p])) as Record<string, Producto>, [allProductos])
  const c = useConteo(marca, prodById)
  const { vars, byBc, count, gruposListos } = c

  const [grupoSel, setGrupoSel] = useState('__todos__')
  const [lastVid, setLastVid] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; texto: string; warn?: boolean } | null>(null)
  const [syncLabel, setSyncLabel] = useState('🔄 Traer stock de GN')
  const [syncing, setSyncing] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onScan = (raw: string) => {
    const vid = resolverScan(byBc, raw)
    if (!vid) {
      setFeedback({ ok: false, texto: 'Código desconocido: ' + raw.trim().toUpperCase() })
      setLastVid(null)
      return
    }
    c.escanear(vid)
    setLastVid(vid)
    const v = vars.find((x) => x.vid === vid)
    const nuevo = (count[vid] || 0) + 1
    if (v) setFeedback({ ok: true, texto: `${v.name} · ${v.size} → ${nuevo}`, warn: nuevo > v.esperado })
    scanRef.current?.focus()
  }

  const onActualizarGN = async () => {
    if (syncing) return
    if (Object.keys(count).length && !confirm('Vas a traer el stock más nuevo de GN. Tu conteo escaneado se mantiene; solo se actualiza el stock del sistema. ¿Seguir?')) return
    setSyncing(true)
    try {
      const done = await dispararSyncStock(marca, setSyncLabel)
      setSyncLabel('↻ Recargando…')
      await c.traer()
      if (!done) alert('La sincronización con GN tardó más de lo normal. Te muestro lo último disponible.')
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setSyncing(false)
      setSyncLabel('🔄 Traer stock de GN')
    }
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    if (!gruposListos.length) {
      alert('Primero marcá al menos un grupo como "contado" (botón en cada modelo). El ajuste solo incluye los grupos marcados, para no pisar lo que no contaste.')
      return
    }
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][]
        const r = completarExcel(aoa, vars, count, gruposListos)
        if (!r.ok) {
          alert(
            r.motivo === 'vacio' ? 'El archivo está vacío.'
              : r.motivo === 'columnas' ? 'El archivo no tiene las columnas esperadas (codigo_barras, ubicacion, nuevo_stock). ¿Es el "Inventario Actual" exportado de GN?'
              : 'No encontré filas del Local de los grupos marcados en este archivo. ¿Es el export de GN de esta cuenta?',
          )
          return
        }
        const ws2 = XLSX.utils.aoa_to_sheet(r.outRows)
        const wb2 = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb2, ws2, wb.SheetNames[0] || 'Worksheet')
        XLSX.writeFile(wb2, `ajuste_local_${marca}_${new Date().toISOString().slice(0, 10)}.xlsx`)
        const limpiar = confirm(`✅ Archivo listo.\n\nGrupos contados: ${gruposListos.length}\nFilas del Local revisadas: ${r.enGrupos}\nCon diferencia a ajustar: ${r.ajustadas}\n\nSubí este archivo a GN → "Importar y Ajustar".\n\n¿Limpiar ahora el conteo de los grupos ya ajustados?`)
        if (limpiar) c.limpiarGrupos(gruposListos)
      } catch (err) {
        alert('No pude procesar el Excel: ' + (err as Error).message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const onReset = () => {
    if (!confirm('¿Reiniciar el conteo? Se borra todo lo escaneado y los grupos marcados.')) return
    c.reset()
    setLastVid(null)
  }

  const grupos = useMemo(() => gruposOrdenados(vars, count), [vars, count])
  const listos = new Set(gruposListos)
  const totalEsp = vars.reduce((s, v) => s + v.esperado, 0)
  const totalCon = vars.reduce((s, v) => s + (count[v.vid] || 0), 0)
  const filas = useMemo(() => filtrarVars(vars, count, grupoSel), [vars, count, grupoSel])

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-sm" onClick={onActualizarGN} disabled={syncing} style={{ background: '#378ADD', color: '#fff' }}>{syncLabel}</button>
          <label className="btn-sm" title="Subí el Excel 'Inventario Actual' de GN → te lo devuelvo con nuevo_stock cargado (solo Local de los modelos contados)." style={{ background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer' }}>
            📤 Subí el Excel de GN → te lo completo
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} style={{ display: 'none' }} />
          </label>
          <button className="btn-sm" onClick={() => reporteDiferenciasPDF(vars, count, marca).catch(() => alert('No se pudo generar el PDF.'))} style={{ background: '#16A34A', color: '#fff' }}>📄 Reporte de diferencias</button>
          <button className="btn-sm" onClick={onReset} style={{ background: '#fff', border: '1px solid #FCA5A5', color: '#B91C1C' }}>🗑️ Reiniciar</button>
        </div>
      </div>

      <div style={{ margin: '12px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={scanRef}
          type="text"
          autoComplete="off"
          placeholder="Escaneá el código de barras…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const v = e.currentTarget.value
              e.currentTarget.value = ''
              onScan(v)
            }
          }}
          style={{ flex: 1, minWidth: 240, padding: '10px 12px', border: '2px solid #378ADD', borderRadius: 10, fontSize: 15 }}
        />
        <span style={{ fontSize: 13, minWidth: 160, color: feedback ? (feedback.ok ? (feedback.warn ? '#B45309' : '#16A34A') : '#B91C1C') : '#9CA3AF' }}>{feedback ? (feedback.ok ? '✓ ' : '❓ ') + feedback.texto : ''}</span>
      </div>

      {c.cargando && !vars.length ? (
        <div style={{ padding: 20, color: '#9CA3AF' }}>Cargando local…</div>
      ) : c.error ? (
        <div style={{ padding: 16, color: '#B91C1C' }}>No pude cargar el local: {c.error} <button className="btn-sm" style={{ marginTop: 10 }} onClick={() => void c.traer()}>Reintentar</button></div>
      ) : !vars.length ? (
        <div style={{ padding: 14, color: '#9CA3AF' }}>Sin productos activos en el Local.</div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <button onClick={() => setGrupoSel('__todos__')} style={chip(grupoSel === '__todos__', false)}>Todos</button>
            {grupos.map((g) => {
              const vs = vars.filter((v) => v.grupo === g)
              const esp = vs.reduce((s, v) => s + v.esperado, 0)
              const con = vs.reduce((s, v) => s + (count[v.vid] || 0), 0)
              const listo = listos.has(g)
              const sel = grupoSel === g
              return (
                <button key={g} onClick={() => setGrupoSel(g)} style={{ ...chip(sel, listo), color: listo ? '#166534' : sel ? '#1D4ED8' : '#374151' }}>
                  {listo ? '✅ ' : ''}{g} <span style={{ opacity: 0.7 }}>{con}/{esp}</span>
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Contado <b>{totalCon}</b> de <b>{totalEsp}</b> esperadas · <b>{gruposListos.length}</b> grupo(s) marcado(s) como contados.</div>

          {grupoSel !== '__todos__' && (
            <div style={{ marginBottom: 8 }}>
              <button onClick={() => c.toggleGrupo(grupoSel)} style={{ border: `1px solid ${listos.has(grupoSel) ? '#16A34A' : '#D1D5DB'}`, background: listos.has(grupoSel) ? '#16A34A' : '#fff', color: listos.has(grupoSel) ? '#fff' : '#374151', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {listos.has(grupoSel) ? '✅ Grupo contado (tocá para desmarcar)' : '☐ Marcar este grupo como contado'}
              </button>{' '}
              <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>Solo los grupos marcados se incluyen en el ajuste a GN.</span>
            </div>
          )}

          <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup><col /><col style={{ width: 66 }} /><col style={{ width: 72 }} /><col style={{ width: 56 }} /></colgroup>
              <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left', background: '#F9FAFB' }}><th style={{ padding: '6px 8px' }}>Producto · Variante</th><th style={{ textAlign: 'center' }}>Sistema</th><th style={{ textAlign: 'center' }}>Contado</th><th style={{ textAlign: 'center' }}>Dif</th></tr></thead>
              <tbody>
                {filas.map((v) => {
                  const con = count[v.vid] || 0
                  const dif = con - v.esperado
                  const color = dif === 0 ? '#16A34A' : dif < 0 ? '#B91C1C' : '#B45309'
                  return (
                    <tr key={v.vid} style={{ borderTop: '1px solid #F3F4F6', background: v.vid === lastVid ? '#EFF6FF' : undefined }}>
                      <td style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name} · {v.size || '—'}</td>
                      <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{v.esperado}</td>
                      <td style={{ textAlign: 'center' }}><input type="number" min={0} value={con || ''} placeholder="0" onChange={(e) => c.setCount(v.vid, e.target.value)} style={{ width: 50, padding: 3, border: '1px solid #E5E7EB', borderRadius: 6, textAlign: 'center', fontWeight: 700 }} /></td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color }}>{dif > 0 ? '+' : ''}{dif}</td>
                    </tr>
                  )
                })}
                {!filas.length && <tr><td colSpan={4} style={{ padding: 10, color: '#9CA3AF' }}>Sin productos en este grupo.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function chip(active: boolean, listo: boolean): CSSProperties {
  return {
    fontSize: 12,
    border: `1px solid ${active ? '#378ADD' : listo ? '#16A34A' : '#E5E7EB'}`,
    background: active ? '#EFF6FF' : listo ? '#F0FDF4' : '#fff',
    color: active ? '#1D4ED8' : '#374151',
    borderRadius: 14,
    padding: '4px 10px',
    cursor: 'pointer',
    fontWeight: active ? 700 : 400,
  }
}
