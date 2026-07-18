'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { dispararSyncStock } from '@/lib/sync-gn'
import { indexarTn } from '@/lib/tn'
import { construirInv } from '@/lib/reposicion/inventario'
import { aplicarCats, catsDisponibles, minimo, moverFinal, objetivo, reporte, sugerido, ubicCmp } from '@/lib/reposicion/core'
import { ordenarModelo } from '@/lib/reposicion/grupos'
import { reposicionPDF } from '@/lib/reposicion/pdf'
import type { RepoCfg, RepoItem } from '@/lib/reposicion/tipos'
import type { Producto } from '@/lib/etl/tipos'
import { useReposicion } from './useReposicion'

export function Reposicion() {
  const { marca } = useSesion()
  const { datos } = useDatosMonitor()
  if (!datos) return <div className="card"><div style={{ padding: 20, color: '#9CA3AF' }}>Cargando…</div></div>
  return <Contenido key={marca} allProductos={datos.allProductos ?? []} />
}

function Contenido({ allProductos }: { allProductos: Producto[] }) {
  const { marca } = useSesion()
  const esBdi = marca === 'bdi'
  const tnIdx = useTnPromo(marca)
  const rep = useReposicion(marca)
  const { cfg } = rep

  const prodById = useMemo(() => Object.fromEntries(allProductos.map((p) => [String(p.id), p])) as Record<string, Producto>, [allProductos])
  const inv = useMemo(
    () => aplicarCats(construirInv(rep.rawInv, prodById, tnIdx ?? indexarTn([]), rep.s7), cfg.catsOff),
    [rep.rawInv, prodById, tnIdx, rep.s7, cfg.catsOff],
  )

  const [manual, setManual] = useState<Record<string, number>>({})
  const [verVentas, setVerVentas] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [syncLabel, setSyncLabel] = useState('🔄 Actualizar reporte')
  const [syncing, setSyncing] = useState(false)

  const report = useMemo(() => reporte(inv, cfg, esBdi), [inv, cfg, esBdi])

  const setMover = (vid: string, val: string) => {
    if (val === '' || val == null) {
      setManual((m) => {
        const n = { ...m }
        delete n[vid]
        return n
      })
      return
    }
    const it = inv.find((x) => x.vid === vid)
    const maxDep = it ? it.deposito : Infinity
    setManual((m) => ({ ...m, [vid]: Math.max(0, Math.min(maxDep, parseInt(val, 10) || 0)) }))
  }

  const onActualizar = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      await dispararSyncStock(marca, setSyncLabel)
      setSyncLabel('↻ Recargando…')
      await rep.traer()
      setManual({})
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setSyncing(false)
      setSyncLabel('🔄 Actualizar reporte')
    }
  }

  const onPDF = async () => {
    const ok = await reposicionPDF(inv, cfg, marca, manual)
    if (!ok) alert('No hay unidades para mover (todas en 0).')
  }

  // Reporte agrupado por producto, ordenado por ubicación física.
  const porProd = useMemo(() => {
    const g: Record<string, { name: string; cat: string; ubic: string; items: RepoItem[] }> = {}
    report.forEach((it) => {
      if (!g[it.pid]) g[it.pid] = { name: it.name, cat: it.cat, ubic: it.ubic || '', items: [] }
      g[it.pid].items.push(it)
    })
    return g
  }, [report])
  const prodKeys = useMemo(() => Object.keys(porProd).sort((a, b) => ubicCmp(porProd[a].ubic, porProd[b].ubic) || porProd[a].name.localeCompare(porProd[b].name, 'es')), [porProd])
  const totalMover = report.reduce((s, it) => s + moverFinal(it, cfg, esBdi, manual), 0)
  const hayEdit = Object.keys(manual).length > 0

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={verVentas} onChange={(e) => setVerVentas(e.target.checked)} /> Ver ventas del local (7d)</label>
          <button className="btn-sm" onClick={onActualizar} disabled={syncing} style={{ background: '#378ADD', color: '#fff' }}>{syncLabel}</button>
          <button className="btn-sm" onClick={onPDF} style={{ background: '#16A34A', color: '#fff' }}>📄 Exportar reposición</button>
        </div>
      </div>

      {rep.cargando && !rep.rawInv.length ? (
        <div style={{ padding: 20, color: '#9CA3AF' }}>Cargando reposición…</div>
      ) : rep.error ? (
        <div style={{ padding: 16, color: '#B91C1C' }}>No pude cargar: {rep.error} <button className="btn-sm" style={{ marginTop: 10 }} onClick={() => void rep.traer()}>Reintentar</button></div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#6B7280' }}>🕒 Reporte actualizado: <b>{rep.lastUpdate ? rep.lastUpdate.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</b></div>
            <button onClick={() => setConfigOpen(true)} style={{ border: '1px solid #D1D5DB', background: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>⚙️ Configurar mínimos</button>
          </div>

          <div style={{ fontSize: 13, margin: '4px 0 8px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span><b>{report.length}</b> variantes para reponer en <b>{prodKeys.length}</b> producto(s) · <b>{totalMover}</b> u. a mover</span>
            {hayEdit && <button onClick={() => setManual({})} style={{ border: '1px solid #E5E7EB', background: '#fff', borderRadius: 6, padding: '2px 9px', fontSize: 11, cursor: 'pointer', color: '#6B7280' }}>↺ Volver a sugeridos</button>}
          </div>
          {report.length > 0 && <div style={{ fontSize: 11.5, color: '#9CA3AF', margin: '-2px 0 8px' }}>✏️ Podés ajustar a mano la cantidad a mover. El PDF usa esos valores (omite las que dejes en 0).</div>}
          {!report.length && <div style={{ color: '#16A34A', padding: 14 }}>Nada para reponer 🎉 (todo por encima del mínimo, o sin stock en depósito).</div>}

          {prodKeys.map((pid) => {
            const g = porProd[pid]
            const items = g.items.slice().sort((a, b) => (a.size || '').localeCompare(b.size || '', 'es', { numeric: true }))
            return (
              <div key={pid}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', margin: '14px 0 6px' }}>
                  {g.ubic
                    ? <span style={{ display: 'inline-block', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', fontWeight: 700, borderRadius: 6, padding: '1px 7px', marginRight: 7, fontSize: 12 }}>📍 {g.ubic}</span>
                    : <span style={{ display: 'inline-block', color: '#D1D5DB', marginRight: 7, fontSize: 12 }}>📍 —</span>}
                  {g.name} <span style={{ color: '#9CA3AF', fontWeight: 400 }}>· {g.cat} · {items.length}</span>
                </div>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                    <colgroup><col /><col style={{ width: 58 }} /><col style={{ width: 62 }} />{verVentas && <col style={{ width: 64 }} />}<col style={{ width: 50 }} /><col style={{ width: 72 }} /></colgroup>
                    <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left', background: '#F9FAFB' }}><th style={{ padding: '6px 8px' }}>Variante</th><th style={{ textAlign: 'center' }}>Local</th><th style={{ textAlign: 'center' }}>Depós.</th>{verVentas && <th style={{ textAlign: 'center' }}>7d local</th>}<th style={{ textAlign: 'center' }}>Mín</th><th style={{ textAlign: 'center' }}>Mover</th></tr></thead>
                    <tbody>
                      {items.map((it) => {
                        const obj = objetivo(it, cfg)
                        const topeado = cfg.topes[String(it.pid)] != null && cfg.topes[String(it.pid)] < minimo(it, cfg)
                        const sug = sugerido(it, cfg, esBdi)
                        const mover = moverFinal(it, cfg, esBdi, manual)
                        const editado = manual[it.vid] !== undefined && manual[it.vid] !== sug
                        return (
                          <tr key={it.vid} style={{ borderTop: '1px solid #F3F4F6' }}>
                            <td style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.size || '—'}{it.sku && <span style={{ fontSize: 11, color: '#9CA3AF' }}> {it.sku}</span>}</td>
                            <td style={{ textAlign: 'center', color: it.local <= 1 ? '#DC2626' : '#374151', fontWeight: 600 }}>{it.local}</td>
                            <td style={{ textAlign: 'center' }}>{it.deposito}</td>
                            {verVentas && <td style={{ textAlign: 'center', color: '#1D9E75', fontWeight: 600 }}>{it.s7}</td>}
                            <td style={{ textAlign: 'center', color: topeado ? '#378ADD' : '#9CA3AF', fontWeight: topeado ? 700 : undefined }} title={topeado ? 'Topeado por diseño' : 'Mínimo del modelo/categoría'}>{obj}</td>
                            <td style={{ textAlign: 'center' }}><input type="number" min={0} max={it.deposito} value={mover} onChange={(e) => setMover(it.vid, e.target.value)} title={`Sugerido: ${sug} · Máx en depósito: ${it.deposito}`} style={{ width: 46, padding: '3px 4px', border: `1px solid ${editado ? '#378ADD' : '#E5E7EB'}`, background: editado ? '#EFF6FF' : undefined, borderRadius: 6, textAlign: 'center', fontWeight: 700, color: mover === 0 ? '#9CA3AF' : '#111827' }} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {cfg.apagados.length > 0 && <div style={{ marginTop: 16, fontSize: 12, color: '#9CA3AF' }}>🔌 {cfg.apagados.length} producto(s) apagado(s) — gestionalos en <b>⚙️ Configurar mínimos</b>.</div>}
        </div>
      )}

      {configOpen && <ConfigModal inv={inv} cfg={cfg} esBdi={esBdi} shareStatus={rep.shareStatus} guardarCfg={rep.guardarCfg} onClose={() => setConfigOpen(false)} />}
    </div>
  )
}

// ── Modal de configuración ──
function ConfigModal({ inv, cfg, esBdi, shareStatus, guardarCfg, onClose }: {
  inv: RepoItem[]; cfg: RepoCfg; esBdi: boolean; shareStatus: { txt: string; color: string }
  guardarCfg: (c: RepoCfg) => void; onClose: () => void
}) {
  const [fundasOpen, setFundasOpen] = useState(false)
  const [topeSearch, setTopeSearch] = useState('')
  const [topeCat, setTopeCat] = useState('')
  const [topeEstado, setTopeEstado] = useState<'' | 'sin' | 'con' | 'apagados'>('')
  const [topeDeposito, setTopeDeposito] = useState<'con' | '' | 'sin'>('con')

  const minKeys = useMemo(() => {
    const keys = [...new Set(inv.map((it) => it.subcat || it.modelo || it.cat || '(sin categoría)'))]
    return {
      modelos: keys.filter((k) => /^iphone/i.test(k)).sort(ordenarModelo),
      cats: keys.filter((k) => !/^iphone/i.test(k)).sort((a, b) => a.localeCompare(b, 'es')),
    }
  }, [inv])
  const catsDisp = useMemo(() => catsDisponibles(inv), [inv])
  const offSet = new Set((cfg.catsOff || []).map((s) => s.toLowerCase()))

  const setDefault = (v: string) => guardarCfg({ ...cfg, defaultMin: parseInt(v, 10) || 0 })
  const setMin = (cat: string, v: string) => {
    const mins = { ...cfg.mins }
    if (v === '') delete mins[cat]
    else mins[cat] = parseInt(v, 10) || 0
    guardarCfg({ ...cfg, mins })
  }
  const setReserva = (v: string) => guardarCfg({ ...cfg, reservaDeposito: Math.max(0, parseInt(v, 10) || 0) })
  const setReservaTodos = (on: boolean) => guardarCfg({ ...cfg, reservaTodos: on })
  const toggleCatOff = (cat: string) => {
    const l = cat.toLowerCase()
    const catsOff = offSet.has(l) ? cfg.catsOff.filter((x) => x.toLowerCase() !== l) : [...cfg.catsOff, cat]
    guardarCfg({ ...cfg, catsOff })
  }
  const setTope = (pid: string, v: string) => {
    const topes = { ...cfg.topes }
    if (v === '') delete topes[pid]
    else topes[pid] = Math.max(0, parseInt(v, 10) || 0)
    guardarCfg({ ...cfg, topes })
  }
  const toggleApagar = (pid: string) => {
    const apagados = cfg.apagados.includes(pid) ? cfg.apagados.filter((x) => x !== pid) : [...cfg.apagados, pid]
    guardarCfg({ ...cfg, apagados })
  }

  // Topes: agregado por producto (con stock) + filtros.
  const topeCats = useMemo(() => {
    const byPid: Record<string, { cat: string; stock: number }> = {}
    inv.forEach((it) => { if (!byPid[it.pid]) byPid[it.pid] = { cat: it.cat, stock: 0 }; byPid[it.pid].stock += it.local + it.deposito })
    return [...new Set(Object.values(byPid).filter((p) => p.stock > 0 && p.cat).map((p) => p.cat))].sort((a, b) => a.localeCompare(b, 'es'))
  }, [inv])
  const topesList = useMemo(() => {
    const byPid: Record<string, { pid: string; name: string; cat: string; local: number; dep: number }> = {}
    inv.forEach((it) => { if (!byPid[it.pid]) byPid[it.pid] = { pid: it.pid, name: it.name, cat: it.cat, local: 0, dep: 0 }; byPid[it.pid].local += it.local; byPid[it.pid].dep += it.deposito })
    let arr = Object.values(byPid).filter((p) => p.local + p.dep > 0)
    const verApagados = topeEstado === 'apagados'
    if (!verApagados) {
      if (topeDeposito === 'con') arr = arr.filter((p) => p.dep > 0)
      else if (topeDeposito === 'sin') arr = arr.filter((p) => p.dep <= 0)
    }
    if (topeCat) arr = arr.filter((p) => String(p.cat || '') === topeCat)
    if (verApagados) arr = arr.filter((p) => cfg.apagados.includes(String(p.pid)))
    else if (topeEstado === 'sin') arr = arr.filter((p) => cfg.topes[String(p.pid)] == null)
    else if (topeEstado === 'con') arr = arr.filter((p) => cfg.topes[String(p.pid)] != null)
    const q = topeSearch.toLowerCase().trim()
    if (q) arr = arr.filter((p) => p.name.toLowerCase().includes(q) || String(p.cat || '').toLowerCase().includes(q))
    arr.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    return arr
  }, [inv, cfg.apagados, cfg.topes, topeEstado, topeDeposito, topeCat, topeSearch])
  const topesShown = topesList.slice(0, 250)

  const minInput = (c: string, small = false) => (
    <label key={c} style={{ fontSize: 12, color: '#374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #F1F5F9', borderRadius: small ? 6 : 7, padding: small ? '3px 8px' : '5px 8px', marginBottom: small ? 5 : 0, breakInside: 'avoid' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
      <input type="number" min={0} defaultValue={cfg.mins[c] ?? ''} placeholder={String(cfg.defaultMin)} onChange={(e) => setMin(c, e.target.value)} onFocus={(e) => e.target.select()} style={{ width: small ? 54 : 60, padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 6, textAlign: 'center', flex: 'none' }} />
    </label>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 3000, padding: 16, overflow: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 18, maxWidth: 720, width: '100%', marginTop: 30, boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <b style={{ fontSize: 15 }}>⚙️ Configurar mínimos</b>
          <button onClick={onClose} className="btn-sm" style={{ background: '#111827', color: '#fff' }}>Listo</button>
        </div>

        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
          Definí cuántas unidades mantener en Local por categoría/modelo. El &quot;tope local&quot; (por producto) puede bajar este número para un producto puntual. <span style={{ fontSize: 11, marginLeft: 6, color: shareStatus.color }}>{shareStatus.txt}</span>
        </div>
        <label style={{ fontSize: 12, color: '#6B7280', display: 'inline-block', marginBottom: 10 }}>Mínimo general (default): <input type="number" min={0} defaultValue={cfg.defaultMin} onChange={(e) => setDefault(e.target.value)} style={{ width: 70, padding: '5px 7px', border: '1px solid #D1D5DB', borderRadius: 7 }} /></label>

        <div style={{ background: '#FFF7FB', border: '1px solid #FBCFE8', borderRadius: 8, padding: '9px 11px', marginBottom: 12, fontSize: 12, color: '#9D174D' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>🛡️ <b>Prioridad venta online:</b> reservar siempre <input type="number" min={0} defaultValue={cfg.reservaDeposito ?? 1} onChange={(e) => setReserva(e.target.value)} style={{ width: 56, padding: '4px 6px', border: '1px solid #FBCFE8', borderRadius: 6, textAlign: 'center' }} /> u. en depósito.</div>
          <div style={{ color: '#9CA3AF', marginTop: 4 }}>Nunca se mueve a Local lo que dejaría el depósito por debajo de esta reserva.</div>
          {esBdi && <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, color: '#374151', cursor: 'pointer', fontWeight: 600 }}><input type="checkbox" checked={cfg.reservaTodos} onChange={(e) => setReservaTodos(e.target.checked)} /> Aplicar a <u>todos los productos</u> (no solo fundas)</label>}
        </div>

        {minKeys.cats.length > 0 && <>
          <div style={secTitle}>Categorías</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>{minKeys.cats.map((c) => minInput(c))}</div>
        </>}
        {minKeys.modelos.length > 0 && <>
          <div onClick={() => setFundasOpen((v) => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginTop: 12, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 12px', fontWeight: 600, fontSize: 13 }}>
            <span>🛡️ Fundas — objetivo por modelo <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({minKeys.modelos.length} modelos)</span></span>
            <span style={{ color: '#9CA3AF' }}>{fundasOpen ? '▴ ocultar' : '▾ definir'}</span>
          </div>
          {fundasOpen && <div style={{ columnWidth: 215, columnGap: 14, marginTop: 8 }}>{minKeys.modelos.map((c) => minInput(c, true))}</div>}
        </>}

        {catsDisp.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Categorías a ignorar al agrupar</div>
            <div style={{ fontSize: 11.5, color: '#9CA3AF', marginBottom: 8 }}>Si un producto tiene varias categorías en TN, apagá las raras para que agrupe por la correcta. Las de promo ya se ignoran solas.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {catsDisp.map((c) => {
                const off = offSet.has(c.toLowerCase())
                return <button key={c} onClick={() => toggleCatOff(c)} style={{ fontSize: 12, border: `1px solid ${off ? '#FCA5A5' : '#BBF7D0'}`, background: off ? '#FEF2F2' : '#F0FDF4', color: off ? '#B91C1C' : '#166534', borderRadius: 14, padding: '3px 10px', cursor: 'pointer', textDecoration: off ? 'line-through' : 'none' }}>{c}</button>
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Topes y apagados por producto <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 12 }}>(tope = máximo en Local; 🔌 = no reponer)</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <select value={topeCat} onChange={(e) => setTopeCat(e.target.value)} style={{ ...selStyle, flex: 1, minWidth: 160 }}><option value="">Todas las categorías</option>{topeCats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select value={topeDeposito} onChange={(e) => setTopeDeposito(e.target.value as typeof topeDeposito)} style={selStyle}><option value="con">Con stock en depósito</option><option value="">Depósito: todos</option><option value="sin">Sin stock en depósito</option></select>
            <select value={topeEstado} onChange={(e) => setTopeEstado(e.target.value as typeof topeEstado)} style={selStyle}><option value="">Todos</option><option value="sin">Sin tope asignado</option><option value="con">Con tope</option><option value="apagados">🔌 Apagados</option></select>
          </div>
          <input value={topeSearch} onChange={(e) => setTopeSearch(e.target.value)} placeholder="Buscar producto o categoría…" style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
          <div style={{ maxHeight: 340, overflow: 'auto' }}>
            <div style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 6px' }}>{topesList.length} producto(s){topesList.length > 250 ? ' · mostrando 250, afiná la búsqueda' : ''}</div>
            {topesShown.map((p) => {
              const t = cfg.topes[String(p.pid)]
              const off = cfg.apagados.includes(String(p.pid))
              return (
                <div key={p.pid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 8px', border: '1px solid #F1F5F9', borderRadius: 6, marginBottom: 4, background: '#fff', opacity: off ? 0.6 : 1 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: off ? 'line-through' : 'none' }}>{p.name} <span style={{ color: '#9CA3AF' }}>· {p.cat} · Local {p.local} · <b style={{ color: '#6B7280' }}>Dep {p.dep}</b></span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                    <input type="number" min={0} defaultValue={t ?? ''} placeholder="—" disabled={off} onChange={(e) => setTope(String(p.pid), e.target.value)} onFocus={(e) => e.target.select()} title="Tope: máximo en Local por variante" style={{ width: 46, padding: '2px 4px', border: `1px solid ${t != null ? '#378ADD' : '#E5E7EB'}`, background: t != null ? '#EFF6FF' : undefined, fontWeight: t != null ? 700 : undefined, borderRadius: 5, textAlign: 'center' }} />
                    <button onClick={() => toggleApagar(String(p.pid))} title={off ? 'Reactivar' : 'Apagar (no reponer)'} style={{ border: `1px solid ${off ? '#DC2626' : '#E5E7EB'}`, background: off ? '#FEF2F2' : '#fff', color: off ? '#DC2626' : '#9CA3AF', borderRadius: 6, padding: '2px 7px', fontSize: 12, cursor: 'pointer' }}>🔌</button>
                  </span>
                </div>
              )
            })}
            {!topesShown.length && <div style={{ color: '#9CA3AF', fontSize: 12, padding: 8 }}>Sin resultados.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

const secTitle: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em', margin: '4px 0 6px' }
const selStyle: CSSProperties = { padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 12.5 }
