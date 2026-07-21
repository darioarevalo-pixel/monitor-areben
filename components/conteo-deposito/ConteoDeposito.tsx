'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { leerInventarioVivo } from '@/lib/inventario-vivo/cliente'
import { realMap } from '@/lib/inventario-vivo/core'
import {
  abrirProducto,
  aoaAjuste,
  calcularAjuste,
  estadoDe,
  ordenarModelo,
  setCount,
  terminarProducto,
  ultimoMs,
  volverSinTerminar,
} from '@/lib/conteo-deposito/core'
import { guardarConteo, leerHistorial } from '@/lib/conteo-deposito/cliente'
import type { CdepProducto, CdepState, ConteoHistorial, EstadoProd, Preview } from '@/lib/conteo-deposito/tipos'
import { useConteoDeposito } from './useConteoDeposito'

type Vista = 'lista' | 'foco' | 'preview' | 'historial'
type Filtro = 'todos' | 'sin_previo' | 'contados' | 'en_progreso' | 'terminado'

export function ConteoDeposito() {
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const puedeAplicar = esAdmin(perfil) || puedeSub(perfil, marca, 'conteo-deposito', 'aplicar')
  const cd = useConteoDeposito(marca)
  const { products, state, inicio, stockTime, lastCount } = cd

  const [vista, setVista] = useState<Vista>('lista')
  const [focusPid, setFocusPid] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [orderAsc, setOrderAsc] = useState(true)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [hist, setHist] = useState<{ cargando: boolean; conteos: ConteoHistorial[]; error: string | null }>({ cargando: false, conteos: [], error: null })

  const prodDe = (pid: string) => products.find((p) => String(p.pid) === String(pid)) || null

  // ── Acciones ──
  const onOpen = (pid: string) => {
    const prod = prodDe(pid)
    if (!prod) return
    cd.aplicar(abrirProducto(state, prod))
    if (!inicio) cd.setInicio(Date.now())
    setFocusPid(pid)
    setVista('foco')
  }
  const onBack = (pid: string) => {
    cd.aplicar(volverSinTerminar(state, pid))
    setFocusPid(null)
    setVista('lista')
  }
  const onSet = (pid: string, vid: string, val: string) => cd.aplicar(setCount(state, pid, vid, val))
  const onFinish = (prod: CdepProducto) => {
    const st = state[prod.pid]
    const sinCargar = prod.variants.filter((v) => (st?.contado[v.vid] ?? null) == null).length
    if (sinCargar && !confirm(`Quedan ${sinCargar} variante(s) sin cargar. Al terminar se toman como 0 (faltante total). ¿Terminar igual?`)) return
    cd.aplicar(terminarProducto(state, prod, Date.now()))
    setFocusPid(null)
    setVista('lista')
  }
  const onReset = () => {
    if (!confirm('¿Reiniciar el conteo? Se borra todo lo cargado (los ajustes ya aplicados quedan en el Historial).')) return
    cd.reset()
    setFocusPid(null)
    setVista('lista')
  }
  const onActualizarGN = async () => {
    const hayContado = Object.values(state).some((s) => Object.keys(s.contado).length)
    if (hayContado && !confirm('Vas a traer el stock más nuevo de GN. Lo que ya contaste se mantiene (la diferencia de cada producto queda congelada). ¿Seguir?')) return
    await cd.traerStock(true)
    setVista('lista')
  }
  const onAplicar = async () => {
    const terminados = products.filter((p) => estadoDe(state, p.pid) === 'terminado')
    if (!terminados.length) return alert('No hay productos terminados para aplicar.')
    setAplicando(true)
    try {
      const d = await leerInventarioVivo(marca)
      const pv = calcularAjuste(terminados, state, realMap(d.rows || []), d.store_name || 'Deposito Minorista', d.store || marca, stockTime)
      setPreview(pv)
      setVista('preview')
    } catch (e) {
      alert('No pude leer el stock vivo de GN: ' + (e as Error).message)
    } finally {
      setAplicando(false)
    }
  }

  const limpiarTerminados = () => {
    const next: CdepState = { ...state }
    products.forEach((p) => {
      if (estadoDe(state, p.pid) === 'terminado') delete next[p.pid]
    })
    cd.aplicar(next)
    if (!Object.values(next).some((s) => Object.keys(s.contado).length)) cd.setInicio(null)
  }

  const onConfirmar = async () => {
    if (!preview || !preview.rows.length) return
    const marcaU = (preview.store || marca).toUpperCase()
    if (!confirm(`El Excel es de ${marcaU}. Subilo SOLO al Gestión Nube de ${marcaU} — si lo subís a otra marca, GN va a rechazar los IDs ("Inventario no encontrado").\n\n¿Generar el Excel de ${marcaU}?`)) return
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet(aoaAjuste(preview.rows))
      ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 11 }, { wch: 11 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Worksheet')
      const fecha = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `ajuste_deposito_${preview.store || marca}_${fecha}.xlsx`)
      try {
        await guardarConteo({ store: preview.store || marca, ubicacion: preview.ubicacion, usuario, fecha_inicio: inicio ? new Date(inicio).toISOString() : null, resumen: preview.resumen, detalle: preview.registro })
        await cd.refrescarUltimos()
      } catch {
        /* si falla el historial, el Excel ya se generó igual */
      }
      const limpiar = confirm(`✅ Excel generado (${preview.rows.length} línea(s)) y conteo guardado en el historial.\n\nSubilo a GN → "Importar y Ajustar".\n\n¿Limpiar ahora los productos terminados que se ajustaron?`)
      if (limpiar) limpiarTerminados()
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
    const marcaU = (preview.store || marca).toUpperCase()
    if (!confirm(`Se registra el conteo de ${productos.length} producto(s) de ${marcaU} (sin ajuste, porque coincidieron con el sistema). ¿Guardar?`)) return
    try {
      await guardarConteo({ store: preview.store || marca, ubicacion: preview.ubicacion, usuario, fecha_inicio: inicio ? new Date(inicio).toISOString() : null, resumen: preview.resumen, detalle: preview.registro })
      await cd.refrescarUltimos()
      if (confirm('✅ Conteo guardado en el historial (sin ajuste).\n\n¿Limpiar ahora los productos terminados que se registraron?')) limpiarTerminados()
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
      // Solo conteos de depósito: se filtran los de otras secciones (estándar del
      // Local, fundas de BDI) que comparten la tabla por `store` con su propio `modo`.
      const conteos = (await leerHistorial(marca)).filter((c) => {
        const modo = ((c.resumen || {}) as { modo?: string }).modo
        return !modo || modo === 'deposito'
      })
      setHist({ cargando: false, conteos, error: null })
    } catch (e) {
      setHist({ cargando: false, conteos: [], error: (e as Error).message })
    }
  }

  // ── Render ──
  const solViendo = focusPid ? prodDe(focusPid) : null

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-sm" onClick={onActualizarGN} disabled={cd.cargando} style={{ background: '#378ADD', color: '#fff' }}>🔄 Traer stock de GN</button>
          <button className="btn-sm" onClick={onHistorial} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>🕘 Historial</button>
          <button className="btn-sm" onClick={onReset} style={{ background: '#fff', border: '1px solid #FCA5A5', color: '#B91C1C' }}>🗑️ Reiniciar</button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {cd.cargando && !products.length ? (
          <div style={{ padding: 20, color: '#9CA3AF' }}>Cargando depósito en vivo desde Gestión Nube…</div>
        ) : cd.error ? (
          <div style={{ padding: 16, color: '#B91C1C' }}>No pude cargar el stock en vivo: {cd.error}{' '}
            <button className="btn-sm" style={{ marginTop: 10 }} onClick={() => void cd.traerStock()}>Reintentar</button>
          </div>
        ) : vista === 'historial' ? (
          <Historial hist={hist} onVolver={() => setVista('lista')} />
        ) : vista === 'preview' && preview ? (
          <PreviewView preview={preview} onCancel={() => { setPreview(null); setVista('lista') }} onConfirmar={onConfirmar} onGuardarSinDif={onGuardarSinDif} />
        ) : vista === 'foco' && solViendo ? (
          <Foco prod={solViendo} st={state[solViendo.pid]} orderAsc={orderAsc} onToggleOrder={() => setOrderAsc((v) => !v)} onBack={() => onBack(solViendo.pid)} onFinish={() => onFinish(solViendo)} onSet={onSet} />
        ) : (
          <Lista
            products={products}
            state={state}
            lastCount={lastCount}
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
        )}
      </div>
    </div>
  )
}

// ── Vista LISTA ──
function Lista({ products, state, lastCount, stockTime, search, setSearch, filtro, setFiltro, puedeAplicar, aplicando, onOpen, onAplicar }: {
  products: CdepProducto[]; state: CdepState; lastCount: Record<string, number>; stockTime: number | null
  search: string; setSearch: (v: string) => void; filtro: Filtro; setFiltro: (f: Filtro) => void
  puedeAplicar: boolean; aplicando: boolean; onOpen: (pid: string) => void; onAplicar: () => void
}) {
  const term = products.filter((p) => estadoDe(state, p.pid) === 'terminado').length
  const prog = products.filter((p) => estadoDe(state, p.pid) === 'en_progreso').length
  const sinPrev = products.filter((p) => ultimoMs(state, lastCount, p.pid) === 0).length
  const conteados = products.length - sinPrev

  const pasa = (p: CdepProducto) => {
    if (filtro === 'sin_previo') return ultimoMs(state, lastCount, p.pid) === 0
    if (filtro === 'contados') return ultimoMs(state, lastCount, p.pid) > 0
    if (filtro === 'en_progreso') return estadoDe(state, p.pid) === 'en_progreso'
    if (filtro === 'terminado') return estadoDe(state, p.pid) === 'terminado'
    return true
  }
  const q = search.trim().toLowerCase()
  const lista = useMemo(() => products.filter((p) => (!q || p.name.toLowerCase().includes(q)) && pasa(p)), [products, q, filtro, state, lastCount]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!products.length) return <div style={{ padding: 14, color: '#9CA3AF' }}>Sin productos en el depósito. Tocá &quot;Traer stock de GN&quot;.</div>

  const chips: [Filtro, string, number][] = [
    ['todos', 'Todos', products.length],
    ['sin_previo', '🔴 Sin conteo previo', sinPrev],
    ['contados', '📅 Ya contados', conteados],
    ['en_progreso', '✏️ En progreso', prog],
    ['terminado', '✅ Terminados', term],
  ]

  return (
    <div>
      <details style={{ marginBottom: 10, border: '1px solid #BAE6FD', background: '#F0F9FF', borderRadius: 8, padding: '8px 12px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#075985' }}>❓ ¿Cómo cierro un conteo? (para que quede guardado y con fecha)</summary>
        <ol style={{ margin: '8px 0 2px', paddingLeft: 20, fontSize: 12.5, color: '#0C4A6E', lineHeight: 1.7 }}>
          <li>Hacé todo el conteo en <b>la misma compu y la misma pestaña</b>, de principio a fin (no cambies de aparato).</li>
          <li>Abrí cada producto y cargá <b>lo contado</b> por variante.</li>
          <li>Apretá <b>✓ Terminar producto</b> en cada uno. <b>Si no lo terminás, ese producto no se guarda ni recibe fecha.</b></li>
          <li>Cuando terminaste todos, apretá <b>✔️ Aplicar ajuste</b>.</li>
          <li>En la revisión, apretá <b>📥 Generar Excel y guardar</b> (o <b>✅ Guardar el conteo igual</b> si no hubo diferencias). <b>Si salís con Volver o Cancelar, no se guarda nada.</b></li>
        </ol>
      </details>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 Buscá un producto (ej: Cover Case)…" autoComplete="off" style={{ width: '100%', padding: '10px 12px', border: '2px solid #378ADD', borderRadius: 10, fontSize: 15, boxSizing: 'border-box', marginBottom: 10 }} />
      {stockTime && (
        <div style={{ fontSize: 12.5, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          📸 <b>Stock de GN traído: {stockLabel(stockTime)}</b> — <b>desde esa hora no despaches nada</b> hasta terminar el conteo. Si volvés a &quot;Traer stock de GN&quot;, esta hora se actualiza.
        </div>
      )}
      <div style={{ fontSize: 13, marginBottom: 8, color: '#374151' }}><b>{products.length}</b> productos · <b style={{ color: '#166534' }}>{term}</b> terminados · <b style={{ color: '#B45309' }}>{prog}</b> en progreso</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {chips.map(([f, label, n]) => (
          <button key={f} className="btn-sm" onClick={() => setFiltro(f)} style={{ background: filtro === f ? '#378ADD' : '#fff', color: filtro === f ? '#fff' : '#374151', border: `1px solid ${filtro === f ? '#378ADD' : '#D1D5DB'}`, fontWeight: filtro === f ? 700 : 500 }}>{label} <span style={{ opacity: 0.75 }}>({n})</span></button>
        ))}
      </div>
      {puedeAplicar && term > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button className="btn-sm" onClick={onAplicar} disabled={aplicando} style={{ background: '#16A34A', color: '#fff', fontWeight: 600 }}>{aplicando ? '⏳ Leyendo stock vivo…' : `✔️ Aplicar ajuste (${term} producto${term > 1 ? 's' : ''} terminado${term > 1 ? 's' : ''})`}</button>{' '}
          <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>Relee el stock vivo de GN y genera el Excel de ajuste.</span>
        </div>
      )}
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left', background: '#F9FAFB' }}><th style={{ padding: '7px 10px' }}>Producto</th><th style={{ textAlign: 'center', width: 90 }}>Variantes</th><th style={{ textAlign: 'center', width: 130 }}>Estado</th><th style={{ width: 110 }}></th></tr></thead>
          <tbody>
            {lista.slice(0, 400).map((p) => {
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
            {lista.length > 400 && <tr><td colSpan={4} style={{ padding: '8px 10px', color: '#9CA3AF', fontSize: 12 }}>Mostrando 400 de {lista.length}. Afiná la búsqueda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Vista FOCO ──
function Foco({ prod, st, orderAsc, onToggleOrder, onBack, onFinish, onSet }: {
  prod: CdepProducto; st: CdepState[string] | undefined; orderAsc: boolean
  onToggleOrder: () => void; onBack: () => void; onFinish: () => void; onSet: (pid: string, vid: string, val: string) => void
}) {
  const vars = useMemo(() => {
    const v = prod.variants.slice().sort((a, b) => ordenarModelo(a.size, b.size))
    return orderAsc ? v : v.reverse()
  }, [prod, orderAsc])
  const contado = st?.contado || {}
  const snap = st?.snap || {}
  const sinCargar = vars.filter((v) => contado[v.vid] == null).length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div><button className="btn-sm" onClick={onBack} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>← Volver</button> <b style={{ fontSize: 15, marginLeft: 6 }}>{prod.name}</b></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={onToggleOrder} style={{ background: '#fff', border: '1px solid #D1D5DB' }} title="Ordenar los modelos">{orderAsc ? '↓ Modelo ↑' : '↑ Modelo ↓'}</button>
          <button className="btn-sm" onClick={onFinish} style={{ background: '#16A34A', color: '#fff', fontWeight: 600 }}>✓ Terminar producto</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>Cargá la cantidad física de cada variante. Las que dejes en blanco cuentan como <b>0</b> al terminar. {sinCargar ? <b style={{ color: '#B45309' }}>{sinCargar} sin cargar.</b> : null}</div>
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup><col /><col style={{ width: 74 }} /><col style={{ width: 80 }} /><col style={{ width: 60 }} /></colgroup>
          <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left', background: '#F9FAFB' }}><th style={{ padding: '6px 8px' }}>Variante</th><th style={{ textAlign: 'center' }}>Sistema</th><th style={{ textAlign: 'center' }}>Físico</th><th style={{ textAlign: 'center' }}>Dif</th></tr></thead>
          <tbody>
            {vars.map((v) => {
              const sis = snap[v.vid] != null ? snap[v.vid] : v.esperado
              const con = contado[v.vid]
              const dif = con == null ? null : con - sis
              const difCol = dif == null ? '#9CA3AF' : dif === 0 ? '#16A34A' : dif < 0 ? '#B91C1C' : '#B45309'
              return (
                <tr key={v.vid} style={{ borderTop: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.size}</td>
                  <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{sis}</td>
                  <td style={{ textAlign: 'center' }}><input type="number" min={0} inputMode="numeric" defaultValue={con != null ? con : ''} placeholder="—" onChange={(e) => onSet(prod.pid, v.vid, e.target.value)} style={{ width: 56, padding: 4, border: '1px solid #E5E7EB', borderRadius: 6, textAlign: 'center', fontWeight: 700 }} /></td>
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

// ── Vista PREVIEW ──
function PreviewView({ preview, onCancel, onConfirmar, onGuardarSinDif }: { preview: Preview; onCancel: () => void; onConfirmar: () => void; onGuardarSinDif: () => void }) {
  const { rows, resumen, missing } = preview
  const marcaU = (preview.store || '').toUpperCase()
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}><b style={{ fontSize: 15 }}>Revisión del ajuste</b><button className="btn-sm" onClick={onCancel} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>← Volver</button></div>
      <div style={{ fontSize: 13, background: '#EFF6FF', border: '1px solid #93C5FD', color: '#1D4ED8', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontWeight: 600 }}>🏷️ Ajuste de <b>{marcaU}</b> · ubicación <b>{preview.ubicacion || '—'}</b>. El Excel se sube SOLO al GN de {marcaU} (no mezclar marcas).</div>
      <div style={{ fontSize: 13, marginBottom: 10 }}>Se ajustan <b>{resumen.lineas}</b> variante(s): <b style={{ color: '#B45309' }}>{resumen.mas}</b> con sobrante (+) y <b style={{ color: '#B91C1C' }}>{resumen.menos}</b> con faltante (−) · <b>{resumen.unidades_ajustadas}</b> u. de diferencia. El resto no se toca.</div>
      {missing.length > 0 && <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>⚠️ {missing.length} variante(s) con diferencia <b>NO se ajustan</b>: no se pudo confirmar su stock en vivo. <b>Revisalas a mano</b>. Son: {missing.slice(0, 5).map((m) => m.prod + ' · ' + m.size).join(' / ')}{missing.length > 5 ? '…' : ''}</div>}
      {!rows.length ? (
        <>
          <div style={{ padding: 12, color: '#166534', background: '#F0FDF4', border: '1px solid #16A34A', borderRadius: 8 }}>No hay diferencias para ajustar: lo contado coincide con el sistema. 🎉</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn-sm" onClick={onGuardarSinDif} style={{ background: '#16A34A', color: '#fff', fontWeight: 700 }}>✅ Guardar el conteo igual</button>
            <button className="btn-sm" onClick={onCancel} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>Volver</button>
            <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>Sin Excel (no hay ajuste), pero deja registrada la fecha del conteo.</span>
          </div>
        </>
      ) : (
        <>
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'auto', maxHeight: '52vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left', background: '#F9FAFB', position: 'sticky', top: 0 }}><th style={{ padding: '6px 8px' }}>Producto · Variante</th><th style={{ textAlign: 'center' }}>Sistema</th><th style={{ textAlign: 'center' }}>Contado</th><th style={{ textAlign: 'center' }}>Dif</th><th style={{ textAlign: 'center' }}>Vivo GN</th><th style={{ textAlign: 'center' }}>→ Nuevo</th></tr></thead>
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

// ── Vista HISTORIAL ──
function TablaDet({ filas, grayZero }: { filas: Record<string, number | string | null>[]; grayZero?: boolean }) {
  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ color: '#9CA3AF', textAlign: 'left' }}><th style={{ padding: '4px 6px' }}>Producto · Variante</th><th style={{ textAlign: 'center' }}>Sist.</th><th style={{ textAlign: 'center' }}>Cont.</th><th style={{ textAlign: 'center' }}>Dif</th><th style={{ textAlign: 'center' }}>Vivo</th><th style={{ textAlign: 'center' }}>Nuevo</th></tr></thead>
        <tbody>
          {filas.map((d, j) => {
            const dif = Number(d.diferencia || 0)
            return (
              <tr key={j} style={{ borderTop: '1px solid #F3F4F6' }}>
                <td style={{ padding: '4px 6px' }}>{String(d.producto || '')} · {String(d.variante || '')}</td>
                <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{d.sistema != null ? d.sistema : '—'}</td>
                <td style={{ textAlign: 'center' }}>{d.contado != null ? d.contado : '—'}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: dif < 0 ? '#B91C1C' : dif > 0 ? '#B45309' : grayZero ? '#9CA3AF' : '#B45309' }}>{dif > 0 ? '+' : ''}{dif}</td>
                <td style={{ textAlign: 'center', color: '#6B7280' }}>{d.vivo_aplicado != null ? d.vivo_aplicado : '—'}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: '#1D4ED8' }}>{d.nuevo_stock != null ? d.nuevo_stock : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Historial({ hist, onVolver }: { hist: { cargando: boolean; conteos: ConteoHistorial[]; error: string | null }; onVolver: () => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b style={{ fontSize: 15 }}>🕘 Historial de conteos</b><button className="btn-sm" onClick={onVolver} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>← Volver al conteo</button></div>
      {hist.cargando ? <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando historial…</div>
        : hist.error ? <div style={{ padding: 16, color: '#B91C1C' }}>No pude cargar el historial: {hist.error}</div>
        : !hist.conteos.length ? <div style={{ padding: 12, color: '#9CA3AF' }}>Todavía no hay conteos aplicados.</div>
        : hist.conteos.map((c, i) => {
          const rr = c.resumen || {}
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
                  <TablaDet filas={difs} />
                )}
              </div>

              {hayBalance ? (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: '#2563EB' }}>Ver todo lo contado ({det.length} variante{det.length === 1 ? '' : 's'})</summary>
                  <div style={{ marginTop: 6 }}><TablaDet filas={det} grayZero /></div>
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

function ChipEstado({ e }: { e: EstadoProd }) {
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
