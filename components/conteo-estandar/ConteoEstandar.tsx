'use client'

import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { leerInventarioVivo } from '@/lib/inventario-vivo/cliente'
import { realMap } from '@/lib/inventario-vivo/core'
import { aoaAjuste } from '@/lib/conteo-deposito/core'
import { guardarConteo, leerHistorial } from '@/lib/conteo-deposito/cliente'
import type { ConteoHistorial } from '@/lib/conteo-deposito/tipos'
import {
  abrir,
  calcularAjuste,
  escanear,
  estadoDe,
  normBc,
  resolverScan,
  setDeposito,
  setExhibido,
  terminar,
  ultimoMs,
  volverSinTerminar,
} from '@/lib/conteo-estandar/core'
import type { CePreview, CeProducto, CeState, Linea } from '@/lib/conteo-estandar/tipos'
import { ordenarModelo } from '@/lib/conteo-deposito/core'
import { useConteoEstandar } from './useConteoEstandar'

type Vista = 'lista' | 'foco' | 'preview' | 'historial'
type Filtro = 'todos' | 'sin_previo' | 'contados' | 'en_progreso' | 'terminado'
type Feedback = { tipo: 'ok' | 'error' | 'warn'; texto: string; size?: string; count?: number }

const lineaLabel = (l: Linea) => (l === 'stunned' ? '👕 Stunned' : 'Zattia')

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
    o.frequency.value = ok ? 880 : 200
    g.gain.value = 0.06
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + (ok ? 0.09 : 0.28))
  } catch {
    /* sin audio */
  }
}
function vibrate(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 55 : [90, 60, 90])
  } catch {
    /* sin vibración */
  }
}

export function ConteoEstandar() {
  const params = useParams()
  const seg = Array.isArray(params.seccion) ? params.seccion[0] : params.seccion
  const linea: Linea = seg === 'conteo-estandar-stunned' ? 'stunned' : 'zattia'

  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const puedeAplicar = esAdmin(perfil) || puedeSub(perfil, marca, `conteo-estandar-${linea}`, 'aplicar')
  const ce = useConteoEstandar(marca, linea)
  const { products, byBc, state, inicio, stockTime, lastCount } = ce

  const [vista, setVista] = useState<Vista>('lista')
  const [focusPid, setFocusPid] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [orderAsc, setOrderAsc] = useState(true)
  const [preview, setPreview] = useState<CePreview | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hist, setHist] = useState<{ cargando: boolean; conteos: ConteoHistorial[]; error: string | null }>({ cargando: false, conteos: [], error: null })
  const scanRef = useRef<HTMLInputElement>(null)

  const prodDe = (pid: string) => products.find((p) => String(p.pid) === String(pid)) || null
  const solViendo = focusPid ? prodDe(focusPid) : null

  const onScan = (raw: string) => {
    const bc = normBc(raw)
    if (!bc) return
    const vid = resolverScan(byBc, raw)
    if (!vid) {
      setFeedback({ tipo: 'error', texto: 'Código desconocido: ' + bc })
      beep(false)
      vibrate(false)
      return
    }
    const pid = vid.split('_')[0]
    const prod = prodDe(pid)
    if (!prod) return
    if (prod.linea !== linea) {
      setFeedback({ tipo: 'warn', texto: `${prod.name} es de la línea ${lineaLabel(prod.linea)}, no de ${lineaLabel(linea)}.` })
      beep(false)
      vibrate(false)
      return
    }
    const next = escanear(state, prod, vid)
    ce.aplicar(next)
    if (!inicio) ce.setInicio(Date.now())
    const v = prod.variants.find((x) => x.vid === vid)
    setFeedback({ tipo: 'ok', texto: prod.name, size: v?.size, count: next[pid].exhibido[vid] })
    beep(true)
    vibrate(true)
    scanRef.current?.focus()
  }

  const onOpen = (pid: string) => {
    const prod = prodDe(pid)
    if (!prod) return
    ce.aplicar(abrir(state, prod))
    if (!inicio) ce.setInicio(Date.now())
    setFocusPid(pid)
    setVista('foco')
  }
  const onBack = (pid: string) => {
    ce.aplicar(volverSinTerminar(state, pid))
    setFocusPid(null)
    setVista('lista')
  }
  const onFinish = (prod: CeProducto) => {
    const st = state[prod.pid]
    const sinCargar = prod.variants.filter((v) => !(st && ((st.exhibido[v.vid] || 0) > 0 || st.deposito[v.vid] != null))).length
    if (sinCargar && !confirm(`Quedan ${sinCargar} talle(s) sin tocar. Al terminar se toman como 0 (faltante total). ¿Terminar igual?`)) return
    ce.aplicar(terminar(state, prod, Date.now()))
    setFocusPid(null)
    setVista('lista')
  }
  const onReset = () => {
    if (!confirm('¿Reiniciar el conteo del Local? Se borra todo lo cargado (Zattia y Stunned). Los ajustes ya aplicados quedan en el Historial.')) return
    ce.reset()
    setFocusPid(null)
    setVista('lista')
  }
  const onActualizarGN = async () => {
    const hay = Object.values(state).some((s) => Object.keys(s.exhibido).length || Object.keys(s.deposito).length)
    if (hay && !confirm('Vas a traer el stock más nuevo del Local. Lo que ya contaste se mantiene (la diferencia queda congelada). ¿Seguir?')) return
    await ce.traerStock(true)
    setVista('lista')
  }
  const onAplicar = async () => {
    const terminados = products.filter((p) => p.linea === linea && estadoDe(state, p.pid) === 'terminado')
    if (!terminados.length) return alert('No hay productos terminados de esta línea para aplicar.')
    setAplicando(true)
    try {
      const d = await leerInventarioVivo(marca, 'local')
      const pv = calcularAjuste(terminados, state, realMap(d.rows || []), d.store_name || 'Local', d.store || marca, stockTime, linea)
      setPreview(pv)
      setVista('preview')
    } catch (e) {
      alert('No pude leer el stock vivo del Local: ' + (e as Error).message)
    } finally {
      setAplicando(false)
    }
  }

  const limpiarTerminados = () => {
    const next: CeState = { ...state }
    products.filter((p) => p.linea === linea).forEach((p) => {
      if (estadoDe(state, p.pid) === 'terminado') delete next[p.pid]
    })
    ce.aplicar(next)
    if (!Object.values(next).some((s) => Object.keys(s.exhibido).length || Object.keys(s.deposito).length)) ce.setInicio(null)
  }

  const onConfirmar = async () => {
    if (!preview || !preview.rows.length) return
    const marcaU = (preview.store || marca).toUpperCase()
    if (!confirm(`El Excel es del Local de ${marcaU} (${lineaLabel(linea)}). Subilo SOLO al Gestión Nube de ${marcaU}.\n\n¿Generar el Excel?`)) return
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet(aoaAjuste(preview.rows))
      ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 11 }, { wch: 11 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Worksheet')
      const fecha = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `ajuste_local_${preview.store || marca}_${linea}_${fecha}.xlsx`)
      try {
        await guardarConteo({ store: preview.store || marca, ubicacion: preview.ubicacion, usuario, fecha_inicio: inicio ? new Date(inicio).toISOString() : null, resumen: preview.resumen, detalle: preview.registro })
        await ce.refrescarUltimos()
      } catch {
        /* si falla el historial, el Excel ya se generó */
      }
      if (confirm(`✅ Excel generado (${preview.rows.length} línea(s)) y conteo guardado.\n\nSubilo a GN → "Importar y Ajustar".\n\n¿Limpiar ahora los productos terminados de esta línea?`)) limpiarTerminados()
      setPreview(null)
      setVista('lista')
    } catch (e) {
      alert('Error al generar el Excel: ' + (e as Error).message)
    }
  }

  const onGuardarSinDif = async () => {
    if (!preview) return
    const productos = preview.resumen.productos || []
    if (!productos.length) return alert('No hay productos para guardar.')
    if (!confirm(`Se registra el conteo de ${productos.length} producto(s) de ${lineaLabel(linea)} (sin ajuste). ¿Guardar?`)) return
    try {
      await guardarConteo({ store: preview.store || marca, ubicacion: preview.ubicacion, usuario, fecha_inicio: inicio ? new Date(inicio).toISOString() : null, resumen: preview.resumen, detalle: preview.registro })
      await ce.refrescarUltimos()
      if (confirm('✅ Conteo guardado en el historial (sin ajuste).\n\n¿Limpiar los productos terminados de esta línea?')) limpiarTerminados()
      setPreview(null)
      setVista('lista')
    } catch (e) {
      alert('No pude guardar el conteo: ' + (e as Error).message)
    }
  }

  const onHistorial = async () => {
    setVista('historial')
    setHist({ cargando: true, conteos: [], error: null })
    try {
      const conteos = (await leerHistorial(marca)).filter((c) => {
        const rr = (c.resumen || {}) as { modo?: string; linea?: string }
        return rr.modo === 'estandar' && rr.linea === linea
      })
      setHist({ cargando: false, conteos, error: null })
    } catch (e) {
      setHist({ cargando: false, conteos: [], error: (e as Error).message })
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-sm" onClick={onActualizarGN} disabled={ce.cargando} style={{ background: '#378ADD', color: '#fff' }}>🔄 Traer stock de GN</button>
          <button className="btn-sm" onClick={onHistorial} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>🕘 Historial</button>
          <button className="btn-sm" onClick={onReset} style={{ background: '#fff', border: '1px solid #FCA5A5', color: '#B91C1C' }}>🗑️ Reiniciar</button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {ce.cargando && !products.length ? (
          <div style={{ padding: 20, color: '#9CA3AF' }}>Cargando el Local en vivo desde Gestión Nube…</div>
        ) : ce.error ? (
          <div style={{ padding: 16, color: '#B91C1C' }}>No pude cargar el Local en vivo: {ce.error}{' '}
            <button className="btn-sm" style={{ marginTop: 10 }} onClick={() => void ce.traerStock()}>Reintentar</button>
          </div>
        ) : vista === 'historial' ? (
          <Historial hist={hist} linea={linea} onVolver={() => setVista('lista')} />
        ) : vista === 'preview' && preview ? (
          <PreviewView preview={preview} linea={linea} onCancel={() => { setPreview(null); setVista('lista') }} onConfirmar={onConfirmar} onGuardarSinDif={onGuardarSinDif} />
        ) : vista === 'foco' && solViendo ? (
          <>
            <ScanBox scanRef={scanRef} feedback={feedback} onScan={onScan} />
            <Foco prod={solViendo} st={state[solViendo.pid]} orderAsc={orderAsc} onToggleOrder={() => setOrderAsc((v) => !v)} onBack={() => onBack(solViendo.pid)} onFinish={() => onFinish(solViendo)} onExhib={(pid, vid, val) => ce.aplicar(setExhibido(state, pid, vid, val))} onDep={(pid, vid, val) => ce.aplicar(setDeposito(state, pid, vid, val))} />
          </>
        ) : (
          <>
            <ScanBox scanRef={scanRef} feedback={feedback} onScan={onScan} />
            <Lista
              products={products}
              state={state}
              lastCount={lastCount}
              linea={linea}
              stockTime={stockTime}
              search={search}
              setSearch={setSearch}
              filtro={filtro}
              setFiltro={setFiltro}
              puedeAplicar={puedeAplicar}
              aplicando={aplicando}
              onOpen={onOpen}
              onAplicar={onAplicar}
            />
          </>
        )}
      </div>
    </div>
  )
}

function ScanBox({ scanRef, feedback, onScan }: { scanRef: React.RefObject<HTMLInputElement | null>; feedback: Feedback | null; onScan: (v: string) => void }) {
  const bg = feedback?.tipo === 'ok' ? ['#DCFCE7', '#166534', '#16A34A'] : feedback?.tipo === 'error' ? ['#FEE2E2', '#B91C1C', '#EF4444'] : feedback?.tipo === 'warn' ? ['#FEF3C7', '#B45309', '#F59E0B'] : ['#F9FAFB', '#9CA3AF', '#E5E7EB']
  return (
    <div style={{ marginBottom: 10 }}>
      <input
        ref={scanRef}
        type="text"
        autoComplete="off"
        placeholder="🔫 Escaneá lo EXHIBIDO (suma 1)…"
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
        {!feedback ? 'Escaneá un producto para empezar…'
          : feedback.tipo === 'ok'
            ? <>✓ <b style={{ fontSize: 20 }}>{feedback.texto}</b>{feedback.size ? <> · <b>{feedback.size}</b></> : null}<div style={{ fontSize: 13, marginTop: 2 }}>exhibido: <b>{feedback.count}</b></div></>
            : (feedback.tipo === 'error' ? '❓ ' : '⚠️ ') + feedback.texto}
      </div>
    </div>
  )
}

function Lista({ products, state, lastCount, linea, stockTime, search, setSearch, filtro, setFiltro, puedeAplicar, aplicando, onOpen, onAplicar }: {
  products: CeProducto[]; state: CeState; lastCount: Record<string, number>; linea: Linea; stockTime: number | null
  search: string; setSearch: (v: string) => void; filtro: Filtro; setFiltro: (f: Filtro) => void
  puedeAplicar: boolean; aplicando: boolean; onOpen: (pid: string) => void; onAplicar: () => void
}) {
  const dela = products.filter((p) => p.linea === linea)
  const term = dela.filter((p) => estadoDe(state, p.pid) === 'terminado').length
  const prog = dela.filter((p) => estadoDe(state, p.pid) === 'en_progreso').length
  const sinPrev = dela.filter((p) => ultimoMs(state, lastCount, p.pid) === 0).length

  const pasa = (p: CeProducto) => {
    if (filtro === 'sin_previo') return ultimoMs(state, lastCount, p.pid) === 0
    if (filtro === 'contados') return ultimoMs(state, lastCount, p.pid) > 0
    if (filtro === 'en_progreso') return estadoDe(state, p.pid) === 'en_progreso'
    if (filtro === 'terminado') return estadoDe(state, p.pid) === 'terminado'
    return true
  }
  const q = search.trim().toLowerCase()
  const lista = useMemo(() => dela.filter((p) => (!q || p.name.toLowerCase().includes(q)) && pasa(p)), [dela, q, filtro, state, lastCount]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!products.length) return <div style={{ padding: 14, color: '#9CA3AF' }}>Sin productos en el Local. Tocá &quot;Traer stock de GN&quot;.</div>

  const chips: [Filtro, string, number][] = [
    ['todos', 'Todos', dela.length],
    ['sin_previo', '🔴 Sin conteo previo', sinPrev],
    ['contados', '📅 Ya contados', dela.length - sinPrev],
    ['en_progreso', '✏️ En progreso', prog],
    ['terminado', '✅ Terminados', term],
  ]

  return (
    <div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>Línea: <b>{lineaLabel(linea)}</b>. El escaneo solo suma dentro de esta línea. El <b>Depósito local</b> lo cargás a mano abriendo cada producto.</div>
      <details style={{ marginBottom: 10, border: '1px solid #BAE6FD', background: '#F0F9FF', borderRadius: 8, padding: '8px 12px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#075985' }}>❓ ¿Cómo cierro un conteo? (para que quede guardado y con fecha)</summary>
        <ol style={{ margin: '8px 0 2px', paddingLeft: 20, fontSize: 12.5, color: '#0C4A6E', lineHeight: 1.7 }}>
          <li>Hacé todo el conteo en <b>la misma compu y la misma pestaña</b>, de principio a fin (no cambies de aparato).</li>
          <li>Por cada producto: escaneá lo <b>exhibido</b> y cargá el <b>depósito</b> a mano.</li>
          <li>Apretá <b>✓ Terminar producto</b> en cada uno. <b>Si no lo terminás, ese producto no se guarda ni recibe fecha.</b></li>
          <li>Cuando terminaste todos, apretá <b>✔️ Aplicar ajuste</b>.</li>
          <li>En la revisión, apretá <b>📥 Generar Excel y guardar</b> (o <b>✅ Guardar el conteo igual</b> si no hubo diferencias). <b>Si salís con Volver o Cancelar, no se guarda nada.</b></li>
        </ol>
      </details>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 Buscá un producto…" autoComplete="off" style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', marginBottom: 10 }} />
      {stockTime && <div style={{ fontSize: 12.5, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>📸 <b>Stock del Local traído: {stockLabel(stockTime)}</b> — arrancá con los pedidos al día. Si volvés a &quot;Traer stock de GN&quot;, esta hora se actualiza.</div>}
      <div style={{ fontSize: 13, marginBottom: 8, color: '#374151' }}><b>{dela.length}</b> productos · <b style={{ color: '#166534' }}>{term}</b> terminados · <b style={{ color: '#B45309' }}>{prog}</b> en progreso</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {chips.map(([f, label, n]) => <button key={f} className="btn-sm" onClick={() => setFiltro(f)} style={{ background: filtro === f ? '#378ADD' : '#fff', color: filtro === f ? '#fff' : '#374151', border: `1px solid ${filtro === f ? '#378ADD' : '#D1D5DB'}`, fontWeight: filtro === f ? 700 : 500 }}>{label} <span style={{ opacity: 0.75 }}>({n})</span></button>)}
      </div>
      {puedeAplicar && term > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button className="btn-sm" onClick={onAplicar} disabled={aplicando} style={{ background: '#16A34A', color: '#fff', fontWeight: 600 }}>{aplicando ? '⏳ Leyendo stock vivo…' : `✔️ Aplicar ajuste (${term} terminado${term > 1 ? 's' : ''} de ${lineaLabel(linea)})`}</button>{' '}
          <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>Relee el stock vivo del Local y genera el Excel.</span>
        </div>
      )}
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left', background: '#F9FAFB' }}><th style={{ padding: '7px 10px' }}>Producto</th><th style={{ textAlign: 'center', width: 80 }}>Talles</th><th style={{ textAlign: 'center', width: 130 }}>Estado</th><th style={{ width: 110 }}></th></tr></thead>
          <tbody>
            {lista.slice(0, 500).map((p) => {
              const e = estadoDe(state, p.pid)
              const ult = ultimoMs(state, lastCount, p.pid)
              return (
                <tr key={p.pid} style={{ borderTop: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '7px 10px' }}>{p.name}</td>
                  <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{p.variants.length}</td>
                  <td style={{ textAlign: 'center' }}><ChipEstado e={e} />{ult ? <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 3 }}>📅 Último: {fechaLabel(ult)}</div> : <div style={{ fontSize: 10.5, color: '#C4C4C4', marginTop: 3 }}>Sin conteo previo</div>}</td>
                  <td style={{ textAlign: 'right', paddingRight: 10 }}><button className="btn-sm" onClick={() => onOpen(p.pid)} style={{ background: e === 'sin_iniciar' ? '#378ADD' : '#fff', color: e === 'sin_iniciar' ? '#fff' : '#1D4ED8', border: '1px solid #378ADD' }}>{e === 'terminado' ? 'Ver / editar' : e === 'en_progreso' ? 'Seguir' : 'Contar'}</button></td>
                </tr>
              )
            })}
            {!lista.length && <tr><td colSpan={4} style={{ padding: 12, color: '#9CA3AF' }}>No hay productos que coincidan.</td></tr>}
            {lista.length > 500 && <tr><td colSpan={4} style={{ padding: '8px 10px', color: '#9CA3AF', fontSize: 12 }}>Mostrando 500 de {lista.length}. Afiná la búsqueda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Foco({ prod, st, orderAsc, onToggleOrder, onBack, onFinish, onExhib, onDep }: {
  prod: CeProducto; st: CeState[string] | undefined; orderAsc: boolean
  onToggleOrder: () => void; onBack: () => void; onFinish: () => void
  onExhib: (pid: string, vid: string, val: string) => void; onDep: (pid: string, vid: string, val: string) => void
}) {
  const vars = useMemo(() => {
    const v = prod.variants.slice().sort((a, b) => ordenarModelo(a.size, b.size))
    return orderAsc ? v : v.reverse()
  }, [prod, orderAsc])
  const exhibido = st?.exhibido || {}
  const deposito = st?.deposito || {}
  const snap = st?.snap || {}
  const sinCargar = vars.filter((v) => !((exhibido[v.vid] || 0) > 0 || deposito[v.vid] != null)).length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div><button className="btn-sm" onClick={onBack} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>← Volver</button> <b style={{ fontSize: 15, marginLeft: 6 }}>{prod.name}</b> <span style={{ fontSize: 11, color: '#9CA3AF' }}>{lineaLabel(prod.linea)}</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={onToggleOrder} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>{orderAsc ? '↓ Talle ↑' : '↑ Talle ↓'}</button>
          <button className="btn-sm" onClick={onFinish} style={{ background: '#16A34A', color: '#fff', fontWeight: 600 }}>✓ Terminar producto</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>Total = <b>Exhibido</b> (escaneado, editable) + <b>Depósito local</b> (a mano). Lo que dejes sin tocar cuenta como <b>0</b> al terminar. {sinCargar ? <b style={{ color: '#B45309' }}>{sinCargar} sin tocar.</b> : null}</div>
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup><col /><col style={{ width: 66 }} /><col style={{ width: 76 }} /><col style={{ width: 82 }} /><col style={{ width: 58 }} /><col style={{ width: 52 }} /></colgroup>
          <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left', background: '#F9FAFB' }}><th style={{ padding: '6px 8px' }}>Talle</th><th style={{ textAlign: 'center' }}>Sistema</th><th style={{ textAlign: 'center' }}>🔫 Exhib.</th><th style={{ textAlign: 'center' }}>✍️ Depósito</th><th style={{ textAlign: 'center' }}>Total</th><th style={{ textAlign: 'center' }}>Dif</th></tr></thead>
          <tbody>
            {vars.map((v) => {
              const sis = snap[v.vid] != null ? snap[v.vid] : v.esperado
              const ex = exhibido[v.vid] || 0
              const dep = deposito[v.vid] != null ? deposito[v.vid] : null
              const tocada = ex > 0 || dep != null
              const tot = ex + (dep || 0)
              const dif = !tocada ? null : tot - sis
              const difCol = dif == null ? '#9CA3AF' : dif === 0 ? '#16A34A' : dif < 0 ? '#B91C1C' : '#B45309'
              return (
                <tr key={v.vid} style={{ borderTop: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.size}</td>
                  <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{sis}</td>
                  <td style={{ textAlign: 'center' }}><input type="number" min={0} inputMode="numeric" value={ex || ''} placeholder="0" onChange={(e) => onExhib(prod.pid, v.vid, e.target.value)} style={{ width: 48, padding: 4, border: '1px solid #E5E7EB', borderRadius: 6, textAlign: 'center' }} /></td>
                  <td style={{ textAlign: 'center' }}><input type="number" min={0} inputMode="numeric" value={dep != null ? dep : ''} placeholder="—" onChange={(e) => onDep(prod.pid, v.vid, e.target.value)} style={{ width: 56, padding: 4, border: '1px solid #E5E7EB', borderRadius: 6, textAlign: 'center', fontWeight: 700 }} /></td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{tocada ? tot : '—'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: difCol }}>{dif == null ? '—' : (dif > 0 ? '+' : '') + dif}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PreviewView({ preview, linea, onCancel, onConfirmar, onGuardarSinDif }: { preview: CePreview; linea: Linea; onCancel: () => void; onConfirmar: () => void; onGuardarSinDif: () => void }) {
  const { rows, resumen, missing } = preview
  const marcaU = (preview.store || '').toUpperCase()
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}><b style={{ fontSize: 15 }}>Revisión del ajuste · {lineaLabel(linea)}</b><button className="btn-sm" onClick={onCancel} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>← Volver</button></div>
      <div style={{ fontSize: 13, background: '#EFF6FF', border: '1px solid #93C5FD', color: '#1D4ED8', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontWeight: 600 }}>🏷️ Ajuste del <b>Local de {marcaU}</b> · ubicación <b>{preview.ubicacion || '—'}</b>. El Excel se sube SOLO al GN de {marcaU}.</div>
      <div style={{ fontSize: 13, marginBottom: 10 }}>Se ajustan <b>{resumen.lineas}</b> talle(s): <b style={{ color: '#B45309' }}>{resumen.mas}</b> con sobrante (+) y <b style={{ color: '#B91C1C' }}>{resumen.menos}</b> con faltante (−) · <b>{resumen.unidades_ajustadas}</b> u. El resto no se toca.</div>
      {missing.length > 0 && <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>⚠️ {missing.length} talle(s) con diferencia <b>NO se ajustan</b>: no se pudo confirmar su stock en vivo. <b>Revisalos a mano</b>.</div>}
      {!rows.length ? (
        <>
          <div style={{ padding: 12, color: '#166534', background: '#F0FDF4', border: '1px solid #16A34A', borderRadius: 8 }}>No hay diferencias: lo contado coincide con el sistema. 🎉</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn-sm" onClick={onGuardarSinDif} style={{ background: '#16A34A', color: '#fff', fontWeight: 700 }}>✅ Guardar el conteo igual</button>
            <button className="btn-sm" onClick={onCancel} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>Volver</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'auto', maxHeight: '52vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left', background: '#F9FAFB', position: 'sticky', top: 0 }}><th style={{ padding: '6px 8px' }}>Producto · Talle</th><th style={{ textAlign: 'center' }}>Sist.</th><th style={{ textAlign: 'center' }}>Total</th><th style={{ textAlign: 'center' }}>Dif</th><th style={{ textAlign: 'center' }}>Vivo</th><th style={{ textAlign: 'center' }}>Nuevo</th></tr></thead>
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
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={onConfirmar} style={{ background: '#16A34A', color: '#fff', fontWeight: 700 }}>📥 Generar Excel y guardar</button>
            <button className="btn-sm" onClick={onCancel} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>Cancelar</button>
          </div>
          <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 6 }}>Después subí el Excel a GN → &quot;Importar y Ajustar&quot;.</div>
        </>
      )}
    </div>
  )
}

function Historial({ hist, linea, onVolver }: { hist: { cargando: boolean; conteos: ConteoHistorial[]; error: string | null }; linea: Linea; onVolver: () => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b style={{ fontSize: 15 }}>🕘 Historial · {lineaLabel(linea)}</b><button className="btn-sm" onClick={onVolver} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>← Volver al conteo</button></div>
      {hist.cargando ? <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando historial…</div>
        : hist.error ? <div style={{ padding: 16, color: '#B91C1C' }}>No pude cargar el historial: {hist.error}</div>
        : !hist.conteos.length ? <div style={{ padding: 12, color: '#9CA3AF' }}>Todavía no hay conteos de esta línea.</div>
        : hist.conteos.map((c, i) => {
          const rr = (c.resumen || {}) as { mas?: number; menos?: number; lineas?: number; productos?: { pid?: string; nombre?: string }[] }
          const f = c.fecha_aplicado ? new Date(c.fecha_aplicado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
          const det = (Array.isArray(c.detalle) ? c.detalle : []) as Record<string, number | string | null>[]
          const difs = det.filter((d) => Number(d.diferencia || 0) !== 0)
          // Nombres de lo contado: del resumen (todos los terminados) o, si el
          // conteo es viejo y no lo trae, de las líneas del detalle.
          const nombres = Array.isArray(rr.productos) && rr.productos.length
            ? rr.productos.map((p) => String(p?.nombre || '').trim()).filter(Boolean)
            : Array.from(new Set(det.map((d) => String(d.producto || '').trim()).filter(Boolean)))
          const hayBalance = det.length > difs.length // guardó líneas sin diferencia = conteo nuevo
          return (
            <details key={i} style={{ border: '1px solid #E5E7EB', borderRadius: 9, padding: '8px 12px', marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}><b>{f}</b> · {c.usuario || '—'} · <span style={{ color: '#B45309' }}>+{rr.mas || 0}</span> / <span style={{ color: '#B91C1C' }}>−{rr.menos || 0}</span> · {difs.length} con diferencia · {nombres.length} producto(s)</summary>

              <div style={{ marginTop: 8, fontSize: 12.5, color: '#374151', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px' }}>
                🧾 <b>Se contaron {nombres.length} producto(s)</b>{nombres.length ? <>: {nombres.join(', ')}</> : null}
              </div>

              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>Líneas con diferencia</div>
                {difs.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: '#166534', background: '#F0FDF4', border: '1px solid #16A34A', borderRadius: 8, padding: '8px 10px' }}>✅ Todo coincidió con el sistema, sin diferencias.</div>
                ) : (
                  <div style={{ overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead><tr style={{ color: '#9CA3AF', textAlign: 'left' }}><th style={{ padding: '4px 6px' }}>Producto · Talle</th><th style={{ textAlign: 'center' }}>Sist.</th><th style={{ textAlign: 'center' }}>Total</th><th style={{ textAlign: 'center' }}>Dif</th></tr></thead>
                      <tbody>
                        {difs.map((d, j) => {
                          const dif = Number(d.diferencia || 0)
                          return (
                            <tr key={j} style={{ borderTop: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '4px 6px' }}>{String(d.producto || '')} · {String(d.variante || '')}</td>
                              <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{d.sistema != null ? d.sistema : '—'}</td>
                              <td style={{ textAlign: 'center' }}>{d.contado != null ? d.contado : '—'}</td>
                              <td style={{ textAlign: 'center', fontWeight: 700, color: dif < 0 ? '#B91C1C' : '#B45309' }}>{dif > 0 ? '+' : ''}{dif}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {hayBalance ? (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: '#2563EB' }}>Ver todo lo contado ({det.length} talle{det.length === 1 ? '' : 's'})</summary>
                  <div style={{ overflow: 'auto', marginTop: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead><tr style={{ color: '#9CA3AF', textAlign: 'left' }}><th style={{ padding: '4px 6px' }}>Producto · Talle</th><th style={{ textAlign: 'center' }}>Sist.</th><th style={{ textAlign: 'center' }}>Total</th><th style={{ textAlign: 'center' }}>Dif</th></tr></thead>
                      <tbody>
                        {det.map((d, j) => {
                          const dif = Number(d.diferencia || 0)
                          return (
                            <tr key={j} style={{ borderTop: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '4px 6px' }}>{String(d.producto || '')} · {String(d.variante || '')}</td>
                              <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{d.sistema != null ? d.sistema : '—'}</td>
                              <td style={{ textAlign: 'center' }}>{d.contado != null ? d.contado : '—'}</td>
                              <td style={{ textAlign: 'center', fontWeight: 700, color: dif < 0 ? '#B91C1C' : dif > 0 ? '#B45309' : '#9CA3AF' }}>{dif > 0 ? '+' : ''}{dif}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : difs.length > 0 ? (
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>Este conteo es anterior a la mejora: solo guardó las diferencias, no el balance completo.</div>
              ) : null}
            </details>
          )
        })}
    </div>
  )
}

function ChipEstado({ e }: { e: 'sin_iniciar' | 'en_progreso' | 'terminado' }) {
  if (e === 'terminado') return <span style={chip('#F0FDF4', '#166534', '#16A34A')}>✅ Terminado</span>
  if (e === 'en_progreso') return <span style={chip('#FFFBEB', '#B45309', '#F59E0B')}>✏️ En progreso</span>
  return <span style={chip('#F9FAFB', '#6B7280', '#E5E7EB')}>Sin iniciar</span>
}
function chip(bg: string, col: string, bd: string): CSSProperties {
  return { fontSize: 11, background: bg, color: col, border: `1px solid ${bd}`, borderRadius: 12, padding: '2px 8px' }
}
function stockLabel(ms: number): string {
  const d = new Date(ms), now = new Date()
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const dia = d.toDateString() === now.toDateString() ? 'hoy' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  return `${dia} ${hora} hs`
}
function fechaLabel(ms: number): string {
  const d = new Date(ms)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'hoy ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const mismoAnio = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('es-AR', mismoAnio ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' })
}
