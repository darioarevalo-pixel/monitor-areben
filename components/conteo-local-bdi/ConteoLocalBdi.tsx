'use client'

import { useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { leerInventarioVivo } from '@/lib/inventario-vivo/cliente'
import { realMap } from '@/lib/inventario-vivo/core'
import { guardarConteo, leerHistorial } from '@/lib/conteo-deposito/cliente'
import { aoaAjuste } from '@/lib/conteo-deposito/core'
import type { ConteoHistorial } from '@/lib/conteo-deposito/tipos'
import {
  calcularAjusteModelo,
  contadoModelo,
  escanear,
  esperadoModelo,
  limpiarModelo,
  resolverScan,
  setContado,
  tocadoModelo,
} from '@/lib/conteo-local-bdi/core'
import type { LbPreview, ModeloGrupo } from '@/lib/conteo-local-bdi/tipos'
import { useConteoLocalBdi } from './useConteoLocalBdi'

/**
 * Conteo de Fundas de BDI (Local): 100% escaneo, un conteo = un modelo de celular.
 * Elegís un modelo de la lista → escaneás (con guard de modelo activo) → "Cerrar
 * conteo": lo no escaneado pasa a 0, compara contra el vivo (`nuevo = vivo + dif`),
 * genera el Excel de ajuste (mismo formato que ZATTIA, conserva el id) y guarda el
 * balance en el historial. Reemplaza el "Conteo de local" viejo (subir Excel a mano).
 */

type Vista = 'lista' | 'foco' | 'preview' | 'historial'
type Feedback = { tipo: 'ok' | 'error' | 'warn'; texto: string; talle?: string; count?: number }

let audioCtx: AudioContext | null = null
function beep(ok: boolean) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!audioCtx) audioCtx = new AC()
    const ctx = audioCtx
    if (ctx.state === 'suspended') void ctx.resume()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = ok ? 880 : 300
    o.connect(g)
    g.connect(ctx.destination)
    g.gain.value = 0.08
    o.start()
    o.stop(ctx.currentTime + (ok ? 0.08 : 0.22))
  } catch {
    /* sin audio */
  }
}
function vibrate(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 30 : [60, 40, 60])
  } catch {
    /* sin vibración */
  }
}

function fmtFecha(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDia(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function ConteoLocalBdi() {
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const puedeAplicar = esAdmin(perfil) || puedeSub(perfil, marca, 'conteo', 'aplicar')
  const cf = useConteoLocalBdi(marca)
  const { modelos, byBc, varByVid, state, stockTime, ultimos } = cf

  const [vista, setVista] = useState<Vista>('lista')
  const [modeloSel, setModeloSel] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [preview, setPreview] = useState<LbPreview | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [hist, setHist] = useState<{ cargando: boolean; conteos: ConteoHistorial[]; error: string | null }>({ cargando: false, conteos: [], error: null })
  const scanRef = useRef<HTMLInputElement>(null)

  const grupoSel = useMemo(() => modelos.find((m) => m.modelo === modeloSel) || null, [modelos, modeloSel])

  const onScan = (raw: string) => {
    if (!grupoSel) return
    const bc = raw.trim().toUpperCase()
    if (!bc) return
    const vid = resolverScan(byBc, raw)
    const v = vid ? varByVid[vid] : null
    if (!v) {
      setFeedback({ tipo: 'error', texto: 'Código desconocido: ' + bc })
      beep(false)
      vibrate(false)
      return
    }
    if (v.modelo !== grupoSel.modelo) {
      setFeedback({ tipo: 'error', texto: `Esa funda es de ${v.modelo}, estás contando ${grupoSel.modelo}.` })
      beep(false)
      vibrate(false)
      return
    }
    const yaTenia = (state[v.vid] || 0) > 0
    const next = escanear(state, v.vid)
    cf.aplicar(next)
    const count = next[v.vid]
    if (yaTenia) {
      setFeedback({ tipo: 'warn', texto: `Ojo: ${v.producto} · ${v.talle} ya estaba escaneado — ahora van ${count}. Si es otra unidad, todo bien.`, talle: v.talle, count })
    } else {
      setFeedback({ tipo: 'ok', texto: v.producto, talle: v.talle, count })
    }
    beep(true)
    vibrate(true)
    scanRef.current?.focus()
  }

  const entrarModelo = (modelo: string) => {
    setModeloSel(modelo)
    setFeedback(null)
    setVista('foco')
  }

  const onCerrar = async () => {
    if (!grupoSel) return
    if (!tocadoModelo(state, grupoSel)) {
      alert('Todavía no escaneaste ninguna funda de este modelo.')
      return
    }
    setCerrando(true)
    try {
      const d = await leerInventarioVivo(marca, 'local')
      const pv = calcularAjusteModelo(grupoSel, state, realMap(d.rows || []), d.store_name || 'Local', d.store || String(marca), stockTime)
      setPreview(pv)
      setVista('preview')
    } catch (e) {
      alert('No pude leer el stock vivo del Local: ' + (e as Error).message)
    } finally {
      setCerrando(false)
    }
  }

  const onGenerar = async () => {
    if (!preview || !grupoSel) return
    const marcaU = (preview.store || marca).toUpperCase()
    if (!confirm(`El Excel es del Local de ${marcaU} (${preview.modelo}). Subilo SOLO al Gestión Nube de ${marcaU}.\n\n¿Generar el Excel y cerrar el conteo de ${preview.modelo}?`)) return
    try {
      if (preview.rows.length) {
        const XLSX = await import('xlsx')
        const ws = XLSX.utils.aoa_to_sheet(aoaAjuste(preview.rows))
        ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 11 }, { wch: 11 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Worksheet')
        const fecha = new Date().toISOString().slice(0, 10)
        XLSX.writeFile(wb, `ajuste_fundas_${preview.store || marca}_${preview.modelo.replace(/\s+/g, '-')}_${fecha}.xlsx`)
      }
      try {
        await guardarConteo({ store: preview.store || String(marca), ubicacion: preview.ubicacion, usuario, fecha_inicio: null, resumen: preview.resumen, detalle: preview.registro })
        await cf.refrescarUltimos()
      } catch {
        /* si falla el historial, el Excel ya se generó */
      }
      cf.aplicar(limpiarModelo(state, grupoSel))
      alert(
        preview.rows.length
          ? `✅ Excel generado (${preview.rows.length} línea(s)) y conteo de ${preview.modelo} guardado.\n\nSubilo a GN → "Importar y Ajustar".`
          : `✅ Conteo de ${preview.modelo} guardado (todo coincidió, sin ajuste).`,
      )
      setPreview(null)
      setModeloSel(null)
      setVista('lista')
    } catch (e) {
      alert('Error al generar el Excel: ' + (e as Error).message)
    }
  }

  const onHistorial = async () => {
    setVista('historial')
    setHist({ cargando: true, conteos: [], error: null })
    try {
      const conteos = (await leerHistorial(marca)).filter((c) => ((c.resumen || {}) as { modo?: string }).modo === 'local-bdi')
      setHist({ cargando: false, conteos, error: null })
    } catch (e) {
      setHist({ cargando: false, conteos: [], error: (e as Error).message })
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-sm" onClick={() => cf.traerStock(true)} disabled={cf.cargando} style={{ background: '#378ADD', color: '#fff' }}>🔄 Traer stock de GN</button>
        <button className="btn-sm" onClick={onHistorial} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>🕘 Historial</button>
      </div>

      <div style={{ marginTop: 12 }}>
        {cf.cargando && !modelos.length ? (
          <div style={{ padding: 20, color: '#9CA3AF' }}>Cargando las fundas del Local en vivo desde Gestión Nube…</div>
        ) : cf.error ? (
          <div style={{ padding: 16, color: '#B91C1C' }}>No pude cargar el Local en vivo: {cf.error}{' '}
            <button className="btn-sm" style={{ marginTop: 10 }} onClick={() => void cf.traerStock()}>Reintentar</button>
          </div>
        ) : vista === 'historial' ? (
          <Historial hist={hist} onVolver={() => setVista('lista')} />
        ) : vista === 'preview' && preview ? (
          <PreviewView preview={preview} onCancel={() => { setPreview(null); setVista('foco') }} onGenerar={onGenerar} />
        ) : vista === 'foco' && grupoSel ? (
          <Foco
            grupo={grupoSel}
            state={state}
            scanRef={scanRef}
            feedback={feedback}
            puedeAplicar={puedeAplicar}
            cerrando={cerrando}
            onScan={onScan}
            onBack={() => { setModeloSel(null); setVista('lista') }}
            onCerrar={onCerrar}
            onSet={(vid, val) => cf.aplicar(setContado(state, vid, val))}
          />
        ) : (
          <ListaModelos modelos={modelos} state={state} ultimos={ultimos} stockTime={stockTime} search={search} setSearch={setSearch} onEntrar={entrarModelo} />
        )}
      </div>
    </div>
  )
}

// ── Lista de modelos ──────────────────────────────────────────────────────────

function ListaModelos({ modelos, state, ultimos, stockTime, search, setSearch, onEntrar }: {
  modelos: ModeloGrupo[]
  state: Record<string, number>
  ultimos: Record<string, number>
  stockTime: number | null
  search: string
  setSearch: (v: string) => void
  onEntrar: (modelo: string) => void
}) {
  const q = search.trim().toLowerCase()
  const lista = useMemo(() => (q ? modelos.filter((m) => m.modelo.toLowerCase().includes(q)) : modelos), [modelos, q])

  if (!modelos.length) return <div style={{ padding: 14, color: '#9CA3AF' }}>No hay fundas en el Local. Tocá &quot;Traer stock de GN&quot;.</div>

  return (
    <div>
      <details style={{ marginBottom: 10, border: '1px solid #BAE6FD', background: '#F0F9FF', borderRadius: 8, padding: '8px 12px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#075985' }}>❓ ¿Cómo cuento un modelo? (para que quede guardado y con fecha)</summary>
        <ol style={{ margin: '8px 0 2px', paddingLeft: 20, fontSize: 12.5, color: '#0C4A6E', lineHeight: 1.7 }}>
          <li>Tocá un <b>modelo</b> de la lista (ej. iPhone 11).</li>
          <li>Escaneá <b>todas sus fundas</b>. Si escaneás una de <b>otro modelo</b>, suena error y no la suma.</li>
          <li>Apretá <b>&quot;Cerrar conteo&quot;</b>. Lo que no escaneaste de ese modelo pasa a <b>0</b>, se genera el Excel de ajuste y queda en el historial con fecha.</li>
          <li>Subí ese Excel a GN → &quot;Importar y Ajustar&quot;, y seguí con el próximo modelo.</li>
        </ol>
      </details>

      {stockTime && (
        <div style={{ fontSize: 12.5, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          📸 <b>Stock del Local traído: {fmtDia(stockTime)} hs</b> — arrancá con los pedidos al día. Si volvés a &quot;Traer stock de GN&quot;, esta hora se actualiza.
        </div>
      )}

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 Buscá un modelo (ej: iPhone 12)…" autoComplete="off" style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', marginBottom: 10 }} />
      <div style={{ fontSize: 13, marginBottom: 8, color: '#374151' }}><b>{modelos.length}</b> modelos de funda</div>

      <div style={{ display: 'grid', gap: 8 }}>
        {lista.map((m) => {
          const con = contadoModelo(state, m)
          const esp = esperadoModelo(m)
          const ult = ultimos[m.modelo] || 0
          return (
            <div key={m.modelo} onClick={() => onEntrar(m.modelo)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: con > 0 ? '#FFFBEB' : '#fff' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{m.modelo}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                  {m.variants.length} funda(s) · sistema {esp}
                  {con > 0 && <> · <b style={{ color: '#B45309' }}>escaneadas {con}</b></>}
                  {ult > 0 ? <> · 📅 contado {fmtDia(ult)}</> : <> · <span style={{ color: '#DC2626' }}>sin conteo previo</span></>}
                </div>
              </div>
              <button className="btn-sm" style={{ background: '#378ADD', color: '#fff', whiteSpace: 'nowrap' }}>Contar →</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Foco: contar un modelo ─────────────────────────────────────────────────────

function ScanBox({ scanRef, feedback, onScan }: { scanRef: React.RefObject<HTMLInputElement | null>; feedback: Feedback | null; onScan: (v: string) => void }) {
  const bg = feedback?.tipo === 'ok' ? ['#DCFCE7', '#166534', '#16A34A'] : feedback?.tipo === 'error' ? ['#FEE2E2', '#B91C1C', '#EF4444'] : feedback?.tipo === 'warn' ? ['#FEF3C7', '#B45309', '#F59E0B'] : ['#F9FAFB', '#9CA3AF', '#E5E7EB']
  return (
    <div style={{ marginBottom: 10 }}>
      <input
        ref={scanRef}
        type="text"
        autoComplete="off"
        placeholder="🔫 Escaneá las fundas de este modelo…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const v = e.currentTarget.value
            e.currentTarget.value = ''
            onScan(v)
          }
        }}
        style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '2px solid #378ADD', borderRadius: 10, fontSize: 16 }}
      />
      <div style={{ marginTop: 8, padding: 14, border: `1px solid ${bg[2]}`, borderRadius: 10, fontSize: 16, textAlign: 'center', background: bg[0], color: bg[1] }}>
        {!feedback ? 'Escaneá una funda para empezar…'
          : feedback.tipo === 'ok'
            ? <>✓ <b style={{ fontSize: 18 }}>{feedback.texto}</b>{feedback.talle ? <> · <b>{feedback.talle}</b></> : null}<div style={{ fontSize: 13, marginTop: 2 }}>escaneadas: <b>{feedback.count}</b></div></>
            : (feedback.tipo === 'error' ? '🔴 ' : '⚠️ ') + feedback.texto}
      </div>
    </div>
  )
}

function Foco({ grupo, state, scanRef, feedback, puedeAplicar, cerrando, onScan, onBack, onCerrar, onSet }: {
  grupo: ModeloGrupo
  state: Record<string, number>
  scanRef: React.RefObject<HTMLInputElement | null>
  feedback: Feedback | null
  puedeAplicar: boolean
  cerrando: boolean
  onScan: (v: string) => void
  onBack: () => void
  onCerrar: () => void
  onSet: (vid: string, val: string) => void
}) {
  const con = contadoModelo(state, grupo)
  const esp = esperadoModelo(grupo)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <b style={{ fontSize: 16 }}>{grupo.modelo}</b>
          <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 8 }}>escaneadas <b style={{ color: '#B45309' }}>{con}</b> · sistema {esp}</span>
        </div>
        <button className="btn-sm" onClick={onBack} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>← Volver a modelos</button>
      </div>

      <ScanBox scanRef={scanRef} feedback={feedback} onScan={onScan} />

      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>Estás contando <b>{grupo.modelo}</b>. Al cerrar, las fundas de este modelo que <b>no escaneaste</b> quedan en <b>0</b>.</div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ color: '#9CA3AF', textAlign: 'left', fontSize: 11 }}><th style={{ padding: '4px 6px' }}>Funda</th><th style={{ textAlign: 'center' }}>Sistema</th><th style={{ textAlign: 'center' }}>Escaneado</th></tr></thead>
          <tbody>
            {grupo.variants.map((v) => {
              const c = state[v.vid] || 0
              return (
                <tr key={v.vid} style={{ borderTop: '1px solid #F3F4F6', background: c > 0 ? '#F0FDF4' : undefined }}>
                  <td style={{ padding: '5px 6px' }}>{v.producto}</td>
                  <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{v.esperado}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="number" min={0} value={c || ''} onChange={(e) => onSet(v.vid, e.target.value)} placeholder="0" style={{ width: 64, padding: '4px 6px', textAlign: 'center', border: '1px solid #D1D5DB', borderRadius: 6 }} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}>
        {puedeAplicar ? (
          <button className="btn-sm" onClick={onCerrar} disabled={cerrando} style={{ background: '#16A34A', color: '#fff', fontWeight: 700, fontSize: 14, padding: '9px 16px' }}>
            {cerrando ? '⏳ Leyendo stock vivo…' : `✓ Cerrar conteo de ${grupo.modelo}`}
          </button>
        ) : (
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>No tenés permiso para cerrar/aplicar el ajuste. Pedile a un administrador que te lo active en Usuarios.</div>
        )}
      </div>
    </div>
  )
}

// ── Preview del cierre ─────────────────────────────────────────────────────────

function PreviewView({ preview, onCancel, onGenerar }: { preview: LbPreview; onCancel: () => void; onGenerar: () => void }) {
  const { rows, resumen, missing, registro } = preview
  const enCero = registro.filter((r) => (r.contado || 0) === 0).length
  const marcaU = (preview.store || '').toUpperCase()
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}><b style={{ fontSize: 15 }}>Revisión del ajuste · {preview.modelo}</b><button className="btn-sm" onClick={onCancel} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>← Volver</button></div>
      <div style={{ fontSize: 13, background: '#EFF6FF', border: '1px solid #93C5FD', color: '#1D4ED8', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontWeight: 600 }}>🏷️ Ajuste del <b>Local de {marcaU}</b> · <b>{preview.modelo}</b>. El Excel se sube SOLO al GN de {marcaU}.</div>
      <div style={{ fontSize: 13, marginBottom: 10 }}>Se ajustan <b>{resumen.lineas}</b> talle(s): <b style={{ color: '#B45309' }}>{resumen.mas}</b> con sobrante (+) y <b style={{ color: '#B91C1C' }}>{resumen.menos}</b> con faltante (−) · <b>{resumen.unidades_ajustadas}</b> u.{enCero > 0 && <> · <b>{enCero}</b> funda(s) sin escanear → quedan en 0.</>}</div>
      {missing.length > 0 && <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>⚠️ {missing.length} talle(s) con diferencia <b>NO se ajustan</b>: no se pudo confirmar su stock en vivo. <b>Revisalos a mano</b>.</div>}
      {!rows.length ? (
        <div style={{ padding: 12, color: '#166534', background: '#F0FDF4', border: '1px solid #16A34A', borderRadius: 8 }}>No hay diferencias: lo contado coincide con el sistema. 🎉 Igual se guarda el conteo con la fecha.</div>
      ) : (
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'auto', maxHeight: '52vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left', background: '#F9FAFB', position: 'sticky', top: 0 }}><th style={{ padding: '6px 8px' }}>Funda · Talle</th><th style={{ textAlign: 'center' }}>Sist.</th><th style={{ textAlign: 'center' }}>Cont.</th><th style={{ textAlign: 'center' }}>Dif</th><th style={{ textAlign: 'center' }}>Vivo</th><th style={{ textAlign: 'center' }}>Nuevo</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '6px 8px' }}>{r.producto} · {r.variante}</td>
                  <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{r.sistema != null ? r.sistema : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{r.contado != null ? r.contado : '—'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: r.dif < 0 ? '#B91C1C' : '#B45309' }}>{r.dif > 0 ? '+' : ''}{r.dif}</td>
                  <td style={{ textAlign: 'center', color: '#6B7280' }}>{r.vivo}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#1D4ED8' }}>{r.nuevo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn-sm" onClick={onGenerar} style={{ background: '#16A34A', color: '#fff', fontWeight: 700 }}>{rows.length ? '📥 Generar Excel y cerrar conteo' : '✅ Guardar el conteo igual'}</button>
        <button className="btn-sm" onClick={onCancel} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>Cancelar</button>
      </div>
      {rows.length > 0 && <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 6 }}>Después subí el Excel a GN → &quot;Importar y Ajustar&quot;.</div>}
    </div>
  )
}

// ── Historial (balance por modelo) ─────────────────────────────────────────────

function Historial({ hist, onVolver }: { hist: { cargando: boolean; conteos: ConteoHistorial[]; error: string | null }; onVolver: () => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b style={{ fontSize: 15 }}>🕘 Historial de conteos de fundas</b><button className="btn-sm" onClick={onVolver} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>← Volver</button></div>
      {hist.cargando ? <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando historial…</div>
        : hist.error ? <div style={{ padding: 16, color: '#B91C1C' }}>No pude cargar el historial: {hist.error}</div>
        : !hist.conteos.length ? <div style={{ padding: 12, color: '#9CA3AF' }}>Todavía no hay conteos de fundas.</div>
        : hist.conteos.map((c, i) => {
          const rr = (c.resumen || {}) as { mas?: number; menos?: number; modelo?: string; productos?: { pid?: string; nombre?: string }[] }
          const det = (Array.isArray(c.detalle) ? c.detalle : []) as Record<string, number | string | null>[]
          const difs = det.filter((d) => Number(d.diferencia || 0) !== 0)
          const nombres = Array.isArray(rr.productos) && rr.productos.length
            ? rr.productos.map((p) => String(p?.nombre || '').trim()).filter(Boolean)
            : Array.from(new Set(det.map((d) => String(d.producto || '').trim()).filter(Boolean)))
          const hayBalance = det.length > difs.length
          return (
            <details key={i} style={{ border: '1px solid #E5E7EB', borderRadius: 9, padding: '8px 12px', marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}><b>{rr.modelo || '—'}</b> · {fmtFecha(c.fecha_aplicado)} · {c.usuario || '—'} · <span style={{ color: '#B45309' }}>+{rr.mas || 0}</span> / <span style={{ color: '#B91C1C' }}>−{rr.menos || 0}</span> · {difs.length} con diferencia</summary>

              <div style={{ marginTop: 8, fontSize: 12.5, color: '#374151', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px' }}>
                🧾 <b>Se contaron {nombres.length} producto(s)</b>{nombres.length ? <>: {nombres.join(', ')}</> : null}
              </div>

              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>Líneas con diferencia</div>
                {difs.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: '#166534', background: '#F0FDF4', border: '1px solid #16A34A', borderRadius: 8, padding: '8px 10px' }}>✅ Todo coincidió con el sistema, sin diferencias.</div>
                ) : (
                  <TablaDet filas={difs} />
                )}
              </div>

              {hayBalance ? (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: '#2563EB' }}>Ver todo lo contado ({det.length} funda{det.length === 1 ? '' : 's'})</summary>
                  <div style={{ marginTop: 6 }}><TablaDet filas={det} grayZero /></div>
                </details>
              ) : null}
            </details>
          )
        })}
    </div>
  )
}

function TablaDet({ filas, grayZero }: { filas: Record<string, number | string | null>[]; grayZero?: boolean }) {
  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ color: '#9CA3AF', textAlign: 'left' }}><th style={{ padding: '4px 6px' }}>Funda · Talle</th><th style={{ textAlign: 'center' }}>Sist.</th><th style={{ textAlign: 'center' }}>Cont.</th><th style={{ textAlign: 'center' }}>Dif</th></tr></thead>
        <tbody>
          {filas.map((d, j) => {
            const dif = Number(d.diferencia || 0)
            return (
              <tr key={j} style={{ borderTop: '1px solid #F3F4F6' }}>
                <td style={{ padding: '4px 6px' }}>{String(d.producto || '')} · {String(d.variante || '')}</td>
                <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{d.sistema != null ? d.sistema : '—'}</td>
                <td style={{ textAlign: 'center' }}>{d.contado != null ? d.contado : '—'}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: dif < 0 ? '#B91C1C' : dif > 0 ? '#B45309' : grayZero ? '#9CA3AF' : '#B45309' }}>{dif > 0 ? '+' : ''}{dif}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
