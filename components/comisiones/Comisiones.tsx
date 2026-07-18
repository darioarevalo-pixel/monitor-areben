'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { esAdmin as esAdminFn } from '@/lib/permisos'
import { guardarAdminPass, leerAdminPass } from '@/lib/sesion'
import { matchTn, type IndiceTn } from '@/lib/tn'
import { useComisiones } from './useComisiones'
import {
  armarItemSale,
  breakevenMarkup,
  calcular,
  canales as canalesDe,
  comFmt,
  markupDePvp,
  pisoPvp,
  pvpDeMarkup,
  redondear90,
} from '@/lib/comisiones/core'
import { exportarSalePDF, exportarSaleXLSX } from '@/lib/comisiones/export'
import type { Celda, ComCfg, ResultadoMargen } from '@/lib/comisiones/tipos'
import type { Producto } from '@/lib/etl/tipos'

function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (prompt('Ingresá tu contraseña del Monitor (te la pido una sola vez):') || '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

const CELDA_DEF: Celda = { comision: 0, finan: 0, dias: 0, descuento: 0, aplicaImp: true }
const num = (s: string) => parseFloat(s) || 0

export function Comisiones() {
  const { marca, perfil } = useSesion()
  const admin = esAdminFn(perfil)
  const { datos } = useDatosMonitor()
  const tnIdx = useTnPromo(marca)
  const com = useComisiones(marca, admin, { user: perfil?.name || '', obtenerPass })
  const { cfg, guardar } = com

  const cans = useMemo(() => canalesDe(marca === 'zattia'), [marca])
  const [canalSel, setCanalSel] = useState(cans[0])
  const canal = cans.includes(canalSel) ? canalSel : cans[0]

  const [costo, setCosto] = useState('')
  const [markup, setMarkup] = useState('')
  const [pvp, setPvp] = useState('')
  const [prodSel, setProdSel] = useState<Producto | null>(null)
  const [detalle, setDetalle] = useState<{ forma: string; canal: string } | null>(null)
  const [pisoObj, setPisoObj] = useState('40')

  // Inputs vinculados: costo + (markup ⇄ PVP).
  const onMarkup = (v: string) => {
    setMarkup(v)
    const c = num(costo)
    const mk = parseFloat(v)
    if (c > 0 && mk >= 0) setPvp(String(pvpDeMarkup(c, mk)))
  }
  const onPvp = (v: string) => {
    setPvp(v)
    const c = num(costo)
    const p = parseFloat(v)
    if (c > 0 && p > 0) setMarkup(String(markupDePvp(c, p)))
  }
  const onCosto = (v: string) => {
    setCosto(v)
    const c = parseFloat(v)
    if (markup !== '' && c > 0 && parseFloat(markup) >= 0) setPvp(String(pvpDeMarkup(c, parseFloat(markup))))
    else {
      const p = num(pvp)
      if (c > 0 && p > 0) setMarkup(String(markupDePvp(c, p)))
    }
  }
  const simularPrecio = (precio: number) => {
    setPvp(String(Math.round(precio)))
    const c = num(costo)
    if (c > 0 && precio > 0) setMarkup(String(markupDePvp(c, precio)))
  }

  // ── Mutadores de config (clonan y persisten) ──
  const setImp = (k: keyof ComCfg['imp'], v: string) => guardar({ ...cfg, imp: { ...cfg.imp, [k]: num(v) } })
  const setSaldo = (on: boolean) => guardar({ ...cfg, saldoIva: on })
  const setCostoCanal = (patch: Partial<ComCfg['costoCanal'][string]>) =>
    guardar({ ...cfg, costoCanal: { ...cfg.costoCanal, [canal]: { ...(cfg.costoCanal[canal] || { valor: 0, tipo: '$' }), ...patch } } })
  const setCelda = (forma: string, campo: keyof Celda, v: number | boolean) => {
    const cel = { ...(cfg.matriz[canal]?.[forma] || CELDA_DEF), [campo]: v }
    guardar({ ...cfg, matriz: { ...cfg.matriz, [canal]: { ...cfg.matriz[canal], [forma]: cel } } })
  }
  const addForma = () => {
    const nombre = (prompt('Nombre de la forma de pago:') || '').trim()
    if (!nombre) return
    if (cfg.formas.includes(nombre)) return alert('Ya existe esa forma de pago.')
    const matriz = { ...cfg.matriz }
    cans.forEach((c) => (matriz[c] = { ...matriz[c], [nombre]: { ...CELDA_DEF } }))
    guardar({ ...cfg, formas: [...cfg.formas, nombre], matriz })
  }
  const removeForma = (forma: string) => {
    if (!confirm(`¿Quitar la forma de pago "${forma}"?`)) return
    const matriz = { ...cfg.matriz }
    cans.forEach((c) => {
      const m = { ...matriz[c] }
      delete m[forma]
      matriz[c] = m
    })
    guardar({ ...cfg, formas: cfg.formas.filter((f) => f !== forma), matriz })
  }

  const costoN = parseFloat(costo)
  const pvpN = parseFloat(pvp)
  const simListo = costoN >= 0 && pvpN > 0

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>💵 Comisiones y margen por forma de pago y canal</div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
          Margen neto real contemplando comisiones, costo financiero, IIBB, DREI, Ganancias e IVA. La configuración es <b>compartida</b>: la editan los admins y la ven todos.
        </div>
      </div>

      {/* PARTE 1: CONFIGURACIÓN */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>1 · Configuración</div>
          <span style={{ fontSize: 11, color: com.shareStatus.color }}>{com.shareStatus.txt}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          {(['iva', 'iibb', 'drei', 'ganancias'] as const).map((k) => (
            <label key={k} style={lbl}>
              {k === 'ganancias' ? 'Ganancias' : k.toUpperCase()} %<br />
              <input type="number" step={0.1} value={cfg.imp[k]} onChange={(e) => setImp(k, e.target.value)} style={{ width: 80, ...inp }} />
            </label>
          ))}
          <label style={{ fontSize: 12, color: '#444', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: '#F3F4F6', borderRadius: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.saldoIva} onChange={(e) => setSaldo(e.target.checked)} /> Saldo IVA a favor <b>{cfg.saldoIva ? 'ACTIVO' : 'AGOTADO'}</b>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10, borderTop: '1px solid #EEF0F2', paddingTop: 12 }}>
          <label style={lbl}>Canal<br />
            <select value={canal} onChange={(e) => setCanalSel(e.target.value)} style={{ minWidth: 130, ...inp }}>
              {cans.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={lbl}>Costo de canal por venta<br />
            <input type="number" step={0.01} value={cfg.costoCanal[canal]?.valor ?? 0} onChange={(e) => setCostoCanal({ valor: num(e.target.value) })} style={{ width: 90, ...inp }} />
            <select value={cfg.costoCanal[canal]?.tipo ?? '$'} onChange={(e) => setCostoCanal({ tipo: e.target.value as '$' | '%' })} style={{ padding: 6, border: '1px solid #D1D5DB', borderRadius: 8, marginLeft: 4 }}>
              <option value="$">$</option>
              <option value="%">% del PVP</option>
            </select>
          </label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 12 }}>
                <th style={thc}>Forma de pago</th>
                <th style={{ ...thc, textAlign: 'center' }}>Comisión %</th>
                <th style={{ ...thc, textAlign: 'center' }}>Costo financiero %</th>
                <th style={{ ...thc, textAlign: 'center' }}>Descuento %</th>
                <th style={{ ...thc, textAlign: 'center' }} title="Si está apagado, esta forma no aplica IVA/IIBB/DREI">Aplica imp.</th>
                <th style={{ ...thc, textAlign: 'center' }}>Días acred.</th>
                <th style={thc}></th>
              </tr>
            </thead>
            <tbody>
              {cfg.formas.map((f) => {
                const m = cfg.matriz[canal]?.[f] || CELDA_DEF
                const cellInp = (campo: keyof Celda, v: number) => (
                  <input type="number" step={0.01} value={v} onChange={(e) => setCelda(f, campo, num(e.target.value))} style={{ width: 90, textAlign: 'center', border: '1px solid #E5E7EB', borderRadius: 6, padding: '4px 6px' }} />
                )
                return (
                  <tr key={f}>
                    <td style={{ padding: '4px 6px', fontWeight: 500 }}>{f}</td>
                    <td style={{ textAlign: 'center' }}>{cellInp('comision', m.comision)}</td>
                    <td style={{ textAlign: 'center' }}>{cellInp('finan', m.finan)}</td>
                    <td style={{ textAlign: 'center' }}>{cellInp('descuento', m.descuento || 0)}</td>
                    <td style={{ textAlign: 'center' }}><input type="checkbox" checked={m.aplicaImp} onChange={(e) => setCelda(f, 'aplicaImp', e.target.checked)} title="Aplica IVA / IIBB / DREI" /></td>
                    <td style={{ textAlign: 'center' }}>{cellInp('dias', m.dias)}</td>
                    <td style={{ textAlign: 'center' }}><button onClick={() => removeForma(f)} title="Quitar" style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 15 }}>×</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button className="btn-sm" onClick={addForma} style={{ marginTop: 8 }}>+ Agregar forma de pago</button>
      </div>

      {/* PARTE 2: SIMULADOR */}
      <div className="card" style={{ marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>2 · Simulador de margen por producto</div>
        <BuscadorProducto
          productos={datos?.allProductos ?? []}
          tnIdx={tnIdx}
          onElegir={(p, tn) => {
            setProdSel(p)
            setCosto(p.unit_cost ? String(p.unit_cost) : '')
            const normal = tn && (tn.price || 0) > 0 ? tn.price! : p.retailer_price || 0
            if (normal > 0) simularPrecio(normal)
          }}
          onSimular={simularPrecio}
          onAgregarSale={() => {
            if (!prodSel) return alert('Primero traé un producto.')
            const sale = parseFloat(pvp)
            const c = num(costo)
            if (!sale || sale <= 0) return alert('Definí un precio de sale (poné un % de descuento o el precio).')
            const tn = tnIdx ? matchTn(prodSel, tnIdx) : null
            const actual = tn && (tn.price || 0) > 0 ? tn.price! : prodSel.retailer_price || 0
            com.agregarSale(armarItemSale(prodSel, sale, c, actual))
          }}
        />

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', margin: '12px 0' }}>
          <label style={lbl}>Costo neto (sin IVA) $<br /><input type="number" step={0.01} value={costo} onChange={(e) => onCosto(e.target.value)} style={{ width: 120, ...inp }} /></label>
          <label style={lbl}>Markup % (s/ costo)<br /><input type="number" step={1} value={markup} onChange={(e) => onMarkup(e.target.value)} placeholder="ej. 130" style={{ width: 110, ...inp }} /></label>
          <label style={lbl}>PVP (IVA incluido) $<br /><input type="number" step={0.01} value={pvp} onChange={(e) => onPvp(e.target.value)} style={{ width: 120, ...inp }} /></label>
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', margin: '-4px 0 12px' }}>Cargá <b>costo</b> y luego el <b>markup</b> (se calcula el PVP) o el <b>PVP</b> (se calcula el markup). Son intercambiables.</div>

        {simListo ? (
          <>
            <MatrizSim cfg={cfg} cans={cans} costo={costoN} pvp={pvpN} onCelda={(forma, c) => setDetalle({ forma, canal: c })} />
            <Breakeven cfg={cfg} cans={cans} costo={costoN} markup={markup} />
            {detalle && <Detalle cfg={cfg} costo={costoN} pvp={pvpN} forma={detalle.forma} canal={detalle.canal} onCerrar={() => setDetalle(null)} />}
          </>
        ) : (
          <div style={{ color: '#9CA3AF', fontSize: 13, padding: 10 }}>Cargá el costo neto y el markup (o el PVP) para ver el margen.</div>
        )}
      </div>

      {/* LISTA DE PRECIOS DE SALE */}
      <div className="card" style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>🏷️ Lista de precios de sale</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={() => exportarSaleXLSX(com.saleList, marca).catch(() => alert('No se pudo exportar el Excel.'))} style={{ background: '#107C41', color: '#fff' }}>⬇️ Excel (.xlsx)</button>
            <button className="btn-sm" onClick={() => exportarSalePDF(com.saleList, marca).catch(() => alert('No se pudo exportar el PDF.'))} style={{ background: '#16A34A', color: '#fff' }}>📄 PDF</button>
            <button className="btn-sm" onClick={com.vaciarSale} style={{ background: '#fff', border: '1px solid #FCA5A5', color: '#DC2626' }}>Vaciar</button>
          </div>
        </div>
        <ListaSale saleList={com.saleList} onQuitar={com.quitarSale} />
      </div>

      {/* PISO DE PRECIO */}
      <div className="card" style={{ marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>3 · Piso de precio (PVP mínimo para un margen objetivo)</div>
        <div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
          Usa el <b>Costo neto</b> de arriba. Margen objetivo %
          <input type="number" step={1} value={pisoObj} onChange={(e) => setPisoObj(e.target.value)} style={{ width: 80, marginLeft: 6, ...inp }} />
        </div>
        <Piso cfg={cfg} cans={cans} costo={costoN} objetivo={num(pisoObj) / 100} />
      </div>
    </div>
  )
}

function BuscadorProducto({
  productos,
  tnIdx,
  onElegir,
  onSimular,
  onAgregarSale,
}: {
  productos: Producto[]
  tnIdx: IndiceTn | null
  onElegir: (p: Producto, tn: ReturnType<typeof matchTn>) => void
  onSimular: (precio: number) => void
  onAgregarSale: () => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Producto | null>(null)
  const [descPct, setDescPct] = useState('')
  const [precioNuevo, setPrecioNuevo] = useState('')
  const res = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (qq.length < 2) return []
    return productos
      .filter((p) => String(p.name || '').toLowerCase().includes(qq) || String(p.sku || '').toLowerCase().includes(qq))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
      .slice(0, 25)
  }, [q, productos])

  const tn = sel && tnIdx ? matchTn(sel, tnIdx) : null
  const normal = tn && (tn.price || 0) > 0 ? tn.price! : sel?.retailer_price || 0
  const promo = tn && (tn.promo_price || 0) > 0 ? tn.promo_price! : null
  const foto = tn?.images?.[0] || null
  const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-AR')

  const elegir = (p: Producto) => {
    setSel(p)
    setQ(`${p.name}${p.sku ? ' · ' + p.sku : ''}`)
    onElegir(p, tnIdx ? matchTn(p, tnIdx) : null)
  }

  return (
    <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 9, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0369A1', marginBottom: 8 }}>🔎 Traer un producto real (en vez de simular a mano)</div>
      <label style={lbl}>Producto
        <input value={q} onChange={(e) => { setQ(e.target.value); setSel(null) }} autoComplete="off" placeholder="Buscá por nombre o SKU…" style={{ display: 'block', width: 300, maxWidth: '100%', marginTop: 3, ...inp }} />
      </label>
      {!sel && q.trim().length >= 2 && (
        <div style={{ marginTop: 4, maxWidth: 340 }}>
          {res.length ? (
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, maxHeight: 240, overflow: 'auto', background: '#fff' }}>
              {res.map((p) => (
                <div key={p.id} onClick={() => elegir(p)} style={{ padding: '7px 10px', borderTop: '1px solid #F1F5F9', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{p.name || '—'}</span>
                  {p.sku && <span style={{ color: '#9CA3AF', fontSize: 11, whiteSpace: 'nowrap' }}>{p.sku}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#9CA3AF', padding: '4px 2px' }}>Sin resultados.</div>
          )}
        </div>
      )}
      {sel && (
        <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" style={{ width: 66, height: 66, objectFit: 'cover', borderRadius: 8, background: '#F3F4F6', flex: 'none', border: '1px solid #E5E7EB' }} />
          ) : (
            <div style={{ width: 66, height: 66, borderRadius: 8, background: '#F3F4F6', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#9CA3AF' }}>Sin foto</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}><b>{sel.name}</b>{sel.sku ? ' · ' : ''}{sel.sku && <span style={{ color: '#9CA3AF' }}>{sel.sku}</span>} · Costo: <b>{sel.unit_cost ? fmt(sel.unit_cost) : '—'}</b></div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ fontSize: 12, color: '#666' }}>Precio normal TN<br /><div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}><b style={{ fontSize: 14 }}>{normal ? fmt(normal) : '—'}</b>{normal > 0 && <button onClick={() => onSimular(normal)} style={simBtn('#378ADD')}>Simular</button>}</div></div>
              <div style={{ fontSize: 12, color: '#666' }}>Precio promo TN<br /><div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}><b style={{ fontSize: 14, color: '#16A34A' }}>{promo ? fmt(promo) : '—'}</b>{promo && promo > 0 && <button onClick={() => onSimular(promo)} style={simBtn('#16A34A')}>Simular</button>}</div></div>
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #E5E7EB' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#DB2777', marginBottom: 6 }}>🏷️ Definir precio de sale</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={lbl}>% descuento<br /><input type="number" value={descPct} placeholder="ej. 20" onChange={(e) => {
                  setDescPct(e.target.value)
                  const pct = parseFloat(e.target.value)
                  if (normal > 0 && !isNaN(pct)) {
                    const nuevo = redondear90(normal * (1 - pct / 100))
                    setPrecioNuevo(String(nuevo))
                    onSimular(nuevo)
                  }
                }} style={{ width: 80, ...inp }} /></label>
                <label style={lbl}>Precio sale (termina en 90)<br /><input type="number" value={precioNuevo} placeholder="$" onChange={(e) => setPrecioNuevo(e.target.value)} style={{ width: 120, ...inp }} /></label>
                <button onClick={() => { const v = parseFloat(precioNuevo); if (!v || v <= 0) return alert('Cargá el precio de sale (o un % de descuento).'); onSimular(v) }} style={{ ...simBtn('#DB2777'), padding: '7px 11px' }}>Simular</button>
                <button onClick={onAgregarSale} style={{ ...simBtn('#111827'), padding: '7px 11px' }}>➕ Agregar a la lista</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MatrizSim({ cfg, cans, costo, pvp, onCelda }: { cfg: ComCfg; cans: string[]; costo: number; pvp: number; onCelda: (forma: string, canal: string) => void }) {
  const cells = cfg.formas.flatMap((f) => cans.map((c) => ({ f, c, m: calcular(cfg, costo, pvp, f, c).margen })))
  const best = cells.length ? cells.reduce((a, b) => (b.m > a.m ? b : a)) : null
  const worst = cells.length ? cells.reduce((a, b) => (b.m < a.m ? b : a)) : null
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ textAlign: 'left', padding: '6px 10px' }}>Forma de pago</th>{cans.map((c) => <th key={c} style={{ textAlign: 'center', padding: '6px 10px', fontSize: 12 }}>{c}</th>)}</tr></thead>
        <tbody>
          {cfg.formas.map((f) => (
            <tr key={f}>
              <td style={{ padding: '6px 10px', fontWeight: 500, borderTop: '1px solid #EEF0F2' }}>{f}</td>
              {cans.map((c) => {
                const r = calcular(cfg, costo, pvp, f, c)
                const bg = best && best.f === f && best.c === c ? '#DCFCE7' : worst && worst.f === f && worst.c === c ? '#FEE2E2' : undefined
                const cel = cfg.matriz[c]?.[f]
                const tags: string[] = []
                if (r.desc > 0) tags.push(`−${r.desc}%`)
                if (cel && cel.aplicaImp === false) tags.push('s/imp')
                return (
                  <td key={c} onClick={() => onCelda(f, c)} title="Ver detalle" style={{ textAlign: 'center', padding: '6px 10px', borderTop: '1px solid #EEF0F2', cursor: 'pointer', background: bg }}>
                    <div style={{ fontWeight: 700, color: r.margen < 0 ? '#DC2626' : '#111' }}>{comFmt(r.margen)}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>{r.margenPct.toFixed(1)}% · {r.dias}d</div>
                    {tags.length > 0 && <div style={{ fontSize: 10, color: '#9333EA' }}>{tags.join(' · ')}</div>}
                    {cfg.saldoIva && <div style={{ fontSize: 10, color: '#2563EB' }}>IVA recup. {comFmt(r.ivaRecuperado)}</div>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>🟩 mejor · 🟥 peor · <b>tocá una celda para ver el detalle</b> · margen $ y % · &quot;d&quot; = días de acreditación{cfg.saldoIva ? ' · IVA recup. = saldo a favor que recuperás (no es costo)' : ' · IVA descontado como costo (saldo agotado)'}</div>
    </div>
  )
}

function Breakeven({ cfg, cans, costo, markup }: { cfg: ComCfg; cans: string[]; costo: number; markup: string }) {
  if (!(costo > 0)) return null
  const mkActual = parseFloat(markup)
  const hayMk = markup !== '' && mkActual >= 0
  const filas = cfg.formas.map((f) => ({ f, celdas: cans.map((c) => ({ c, be: breakevenMarkup(cfg, costo, f, c) })) }))
  const conBe = filas.flatMap((fl) => fl.celdas.filter((cd) => cd.be != null).map((cd) => ({ f: fl.f, c: cd.c, be: cd.be as number })))
  const peor = conBe.length ? conBe.reduce((a, b) => (b.be > a.be ? b : a)) : null
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 14px', background: '#FAFAFA' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>⚖️ Markup de equilibrio (breakeven)</div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10 }}>Markup mínimo sobre el costo para no perder. Por <b>debajo</b> de este %, esa venta da pérdida.{hayMk ? ' 🟢 = tu markup zafa · 🔴 = estás por debajo (pérdida).' : ''}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ textAlign: 'left', padding: '6px 10px' }}>Forma de pago</th>{cans.map((c) => <th key={c} style={{ textAlign: 'center', padding: '6px 10px', fontSize: 12 }}>{c}</th>)}</tr></thead>
          <tbody>
            {filas.map(({ f, celdas }) => (
              <tr key={f}>
                <td style={{ padding: '6px 10px', fontWeight: 500, borderTop: '1px solid #EEF0F2' }}>{f}</td>
                {celdas.map(({ c, be }) => {
                  let bg: string | undefined, col: string | undefined
                  if (be != null && hayMk) { const ok = mkActual >= be; bg = ok ? '#DCFCE7' : '#FEE2E2'; col = ok ? '#16A34A' : '#DC2626' }
                  return <td key={c} style={{ textAlign: 'center', padding: '6px 10px', borderTop: '1px solid #EEF0F2', fontWeight: 600, background: bg, color: col }}>{be == null ? <span style={{ color: '#9CA3AF' }}>—</span> : be.toFixed(0) + '%'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {peor && <div style={{ fontSize: 12, color: '#444', marginTop: 8 }}>Para estar a salvo en <b>todas</b> las formas/canales, el markup tiene que superar <b>{peor.be.toFixed(0)}%</b> (lo exige <b>{peor.f} · {peor.c}</b>).</div>}
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>⚠️ Este equilibrio cubre impuestos y comisiones, <b>no</b> los gastos fijos de estructura (alquiler, sueldos, tiempo de venta). El piso real es más alto.</div>
      </div>
    </div>
  )
}

function Detalle({ cfg, costo, pvp, forma, canal, onCerrar }: { cfg: ComCfg; costo: number; pvp: number; forma: string; canal: string; onCerrar: () => void }) {
  const r: ResultadoMargen = calcular(cfg, costo, pvp, forma, canal)
  const fila = (lbl: string, val: number, o: { signo?: boolean; tot?: boolean; col?: string } = {}) => {
    const monto = o.signo ? '−' + comFmt(Math.abs(val)) : comFmt(val)
    const c = o.col || (o.signo ? '#DC2626' : val < 0 ? '#DC2626' : '#111')
    return (
      <tr style={{ borderTop: o.tot ? '1px solid #D1D5DB' : undefined }}>
        <td style={{ padding: '3px 0', fontWeight: o.tot ? 700 : undefined, color: '#444' }}>{lbl}</td>
        <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: o.tot ? 700 : 500, color: c }}>{monto}</td>
      </tr>
    )
  }
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', background: '#FAFAFA', maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Detalle — {forma} · {canal}</div>
          <button onClick={onCerrar} title="Cerrar" style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {fila('Precio de lista (PVP)', r.pvp)}
            {r.desc > 0 && fila(`Descuento (${r.desc}%)`, r.pvp - r.pvpEf, { signo: true, col: '#9333EA' })}
            {fila('Precio que cobrás', r.pvpEf, { tot: true })}
            {fila(r.aplicaImp ? 'Precio neto (sin IVA)' : 'Precio (sin impuestos)', r.precioNeto)}
            {fila('Costo del producto', r.costoNeto, { signo: true })}
            {fila(`Comisión (${r.com}%)`, r.comisionM, { signo: true })}
            {r.finanM > 0 && fila(`Costo financiero (${r.fin}%)`, r.finanM, { signo: true })}
            {r.aplicaImp && fila(`IIBB (${cfg.imp.iibb}% s/neto)`, r.iibbM, { signo: true })}
            {r.aplicaImp && fila(`DREI (${cfg.imp.drei}% c/IVA)`, r.dreiM, { signo: true })}
            {r.canalM > 0 && fila('Costo de canal', r.canalM, { signo: true })}
            {r.aplicaImp && !cfg.saldoIva && fila('IVA a pagar', r.ivaPagar, { signo: true })}
            {fila('= Contribución', r.contrib, { tot: true })}
            {fila(`Impuesto a las Ganancias (${cfg.imp.ganancias}%)`, r.ganancias, { signo: true })}
            {fila('= MARGEN NETO FINAL', r.margen, { tot: true, col: r.margen < 0 ? '#DC2626' : '#16A34A' })}
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Margen <b>{r.margenPct.toFixed(1)}%</b> · acreditación <b>{r.dias} días</b>
          {r.aplicaImp && cfg.saldoIva ? <> · IVA recuperado (saldo a favor, no es costo): <b>{comFmt(r.ivaPagar)}</b></> : null}
          {!r.aplicaImp ? ' · sin IVA/IIBB/DREI' : ''}
        </div>
      </div>
    </div>
  )
}

function Piso({ cfg, cans, costo, objetivo }: { cfg: ComCfg; cans: string[]; costo: number; objetivo: number }) {
  if (!(costo >= 0)) return <div style={{ color: '#9CA3AF', fontSize: 13, padding: 10 }}>Cargá el costo neto (en el simulador de arriba).</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ textAlign: 'left', padding: '6px 10px' }}>Forma de pago</th>{cans.map((c) => <th key={c} style={{ textAlign: 'center', padding: '6px 10px', fontSize: 12 }}>{c}</th>)}</tr></thead>
        <tbody>
          {cfg.formas.map((f) => (
            <tr key={f}>
              <td style={{ padding: '6px 10px', fontWeight: 500, borderTop: '1px solid #EEF0F2' }}>{f}</td>
              {cans.map((c) => {
                const p = pisoPvp(cfg, costo, objetivo, f, c)
                return <td key={c} style={{ textAlign: 'center', padding: '6px 10px', borderTop: '1px solid #EEF0F2', fontWeight: 600 }}>{p == null ? <span style={{ color: '#9CA3AF' }}>—</span> : comFmt(p)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>PVP mínimo (IVA incluido) para ese margen objetivo. &quot;—&quot; = inalcanzable con esa configuración.</div>
    </div>
  )
}

function ListaSale({ saleList, onQuitar }: { saleList: import('@/lib/comisiones/tipos').ItemSale[]; onQuitar: (pid: string) => void }) {
  if (!saleList.length) return <div style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 0' }}>Todavía no agregaste productos. Traé un producto, definí el sale (% o precio) y tocá &quot;➕ Agregar a la lista&quot;.</div>
  const fmt = (v: number | null) => (v == null ? '—' : '$' + Math.round(v).toLocaleString('es-AR'))
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left' }}><th style={{ padding: '5px 6px' }}>Producto</th><th style={{ textAlign: 'right' }}>Actual</th><th style={{ textAlign: 'right' }}>Sale</th><th style={{ textAlign: 'center' }}>% desc</th><th style={{ textAlign: 'center' }}>Markup</th><th style={{ textAlign: 'center' }}>Margen</th><th></th></tr></thead>
      <tbody>
        {saleList.map((x) => (
          <tr key={x.pid} style={{ borderTop: '1px solid #F3F4F6' }}>
            <td style={{ padding: '5px 6px', fontWeight: 500 }}>{x.name}{x.sku && <span style={{ fontSize: 11, color: '#9CA3AF' }}> {x.sku}</span>}</td>
            <td style={{ textAlign: 'right', color: '#9CA3AF' }}>{fmt(x.actual)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: '#DB2777' }}>{fmt(x.sale)}</td>
            <td style={{ textAlign: 'center' }}>{x.desc}%</td>
            <td style={{ textAlign: 'center' }}>{x.markup != null ? Math.round(x.markup) + '%' : '—'}</td>
            <td style={{ textAlign: 'center', color: x.margin != null && x.margin < 0 ? '#DC2626' : '#16A34A', fontWeight: 600 }}>{x.margin != null ? Math.round(x.margin) + '%' : '—'}</td>
            <td style={{ textAlign: 'right' }}><button onClick={() => onQuitar(String(x.pid))} title="Quitar" style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 15 }}>×</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const lbl: CSSProperties = { fontSize: 12, color: '#666' }
const inp: CSSProperties = { padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 8 }
const thc: CSSProperties = { padding: '6px' }
function simBtn(bg: string): CSSProperties {
  return { background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 9px', fontSize: 12, cursor: 'pointer' }
}
