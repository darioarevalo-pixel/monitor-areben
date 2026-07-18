'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { BotonActualizarInventario } from '@/components/productos/BotonActualizarInventario'
import { useEtiquetasTn } from './useEtiquetasTn'
import {
  agruparCantidades,
  construirPrecios,
  filtrarVariantes,
  resolverScan,
  secuenciaLabels,
  totalEtiquetas,
  variantesEtiquetables,
  variantesSinCodigo,
} from '@/lib/etiquetas/core'
import { buildEtiquetasPdf, buildLibrePdf, imprimirPdf, type CtxEtiqueta } from '@/lib/etiquetas/pdf'
import type { Cantidades, LineaEtiqueta, ModoEtiqueta, VarianteEti } from '@/lib/etiquetas/tipos'
import type { Marca } from '@/lib/nav.generated'

const CAP = 500
const FP_DEFAULT: LineaEtiqueta[] = [
  { texto: 'FORMAS DE PAGO', tam: 'titulo', bold: true },
  { texto: '3 cuotas sin interés', tam: 'normal', bold: false },
  { texto: '10% OFF Transferencia', tam: 'normal', bold: false },
  { texto: '15% OFF Efectivo', tam: 'normal', bold: false },
]

// ── localStorage (mismas claves que el legacy → el flip preserva lo guardado) ──
const keyCant = (modo: string, marca: Marca) => `monitor_etiquetas_${modo}_${marca}`
const keyAutoClear = (marca: Marca) => `monitor_eti_autoclear_${marca}`
const keyFP = (marca: Marca) => `monitor_eti_fp_v3_${marca}`
function lsGet<T>(key: string, fallback: T): T {
  try {
    const r = localStorage.getItem(key)
    return r ? (JSON.parse(r) as T) : fallback
  } catch {
    return fallback
  }
}
function lsSet(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* cuota llena: se ignora, como el legacy tras liberar caché */
  }
}

export function Etiquetas() {
  const { marca } = useSesion()
  const { datos } = useDatosMonitor()
  const tn = useEtiquetasTn(marca)

  const allVariantes = useMemo(() => (datos?.allVariantes ?? []) as VarianteEti[], [datos])
  const vars = useMemo(() => variantesEtiquetables(allVariantes), [allVariantes])
  const varsById = useMemo(() => Object.fromEntries(vars.map((v) => [v.id, v])) as Record<string, VarianteEti>, [vars])
  const sinCodigo = useMemo(() => variantesSinCodigo(allVariantes), [allVariantes])
  const { precios, promos } = useMemo(() => construirPrecios(datos?.allProductos ?? [], tn.tnIdx), [datos, tn.tnIdx])
  const precioDe = useCallback((v: VarianteEti) => precios[v.pid] || 0, [precios])
  const promoDe = useCallback((v: VarianteEti) => promos[v.pid] || null, [promos])

  const [sub, setSub] = useState<ModoEtiqueta | 'libre'>('dep')

  // Estado persistido (recargado al cambiar de marca).
  const [cant, setCant] = useState<Record<ModoEtiqueta, Cantidades>>({ dep: {}, loc: {}, promo: {}, sku: {} })
  const [autoClear, setAutoClear] = useState(true)
  const [fpLines, setFpLines] = useState<LineaEtiqueta[]>(FP_DEFAULT)
  // Carga en un IIFE async (no setState sincrónico en el effect: dispararía cascada
  // y lo marca el CI) y sin leer localStorage en el SSR (evita el mismatch de
  // hidratación). Mismas claves del legacy → el flip preserva lo guardado.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const c: Record<ModoEtiqueta, Cantidades> = {
        dep: lsGet(keyCant('dep', marca), {}),
        loc: lsGet(keyCant('loc', marca), {}),
        promo: lsGet(keyCant('promo', marca), {}),
        sku: lsGet(keyCant('sku', marca), {}),
      }
      // El autoclear es un string CRUDO ('1'/'0') en el legacy, no JSON.
      const ac = localStorage.getItem(keyAutoClear(marca)) !== '0'
      const fp = lsGet<LineaEtiqueta[]>(keyFP(marca), FP_DEFAULT)
      if (!vivo) return
      setCant(c)
      setAutoClear(ac)
      setFpLines(fp)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const setCantModo = (modo: ModoEtiqueta, id: string, val: string) => {
    setCant((prev) => {
      const next = { ...prev[modo] }
      const n = parseInt(val, 10)
      if (n > 0) next[id] = n
      else delete next[id]
      lsSet(keyCant(modo, marca), next)
      return { ...prev, [modo]: next }
    })
  }
  const limpiar = (modo: ModoEtiqueta) => {
    if (!Object.keys(cant[modo]).length) return
    if (!confirm('¿Borrar todas las cantidades cargadas?')) return
    setCant((prev) => {
      lsSet(keyCant(modo, marca), {})
      return { ...prev, [modo]: {} }
    })
  }
  const onAutoClear = (on: boolean) => {
    setAutoClear(on)
    try {
      localStorage.setItem(keyAutoClear(marca), on ? '1' : '0') // string crudo, como el legacy
    } catch {
      /* cuota llena */
    }
  }
  const guardarFP = (lines: LineaEtiqueta[]) => {
    setFpLines(lines)
    lsSet(keyFP(marca), lines)
  }

  const ctx: CtxEtiqueta = { precioDe, promoDe, fpLines }

  const imprimir = async (modo: ModoEtiqueta, opts: { sep: boolean; conFP: boolean }) => {
    const grupos = agruparCantidades(cant[modo], varsById, modo)
    if (!grupos.length) {
      alert(modo === 'sku' ? 'No hay variantes con SKU entre las cantidades cargadas.' : 'Cargá al menos una cantidad.')
      return
    }
    const labels = secuenciaLabels(grupos, opts)
    imprimirPdf(await buildEtiquetasPdf(labels, modo, ctx))
    setTimeout(() => {
      const hacer = autoClear || confirm('Etiquetas enviadas a imprimir. ¿Borro las cantidades cargadas?')
      if (hacer) {
        setCant((prev) => {
          lsSet(keyCant(modo, marca), {})
          return { ...prev, [modo]: {} }
        })
      }
    }, 600)
  }

  const imprimirUno = async (modo: ModoEtiqueta, v: VarianteEti, conFP: boolean) => {
    imprimirPdf(await buildEtiquetasPdf(conFP ? [v, { __fp: true }] : [v], modo, ctx))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <SubBtn k="dep" sub={sub} set={setSub}>🏬 Depósito</SubBtn>
          <SubBtn k="loc" sub={sub} set={setSub}>🏪 Local</SubBtn>
          <SubBtn k="promo" sub={sub} set={setSub}>🔥 Promo</SubBtn>
          <SubBtn k="sku" sub={sub} set={setSub}>🔢 SKU</SubBtn>
          <SubBtn k="libre" sub={sub} set={setSub}>✏️ Libre</SubBtn>
        </div>
        <BotonActualizarInventario />
      </div>

      {sub !== 'libre' ? (
        <ModoPanel
          key={sub}
          modo={sub}
          vars={vars}
          sinCodigo={sinCodigo}
          cant={cant[sub]}
          setCant={(id, val) => setCantModo(sub, id, val)}
          limpiar={() => limpiar(sub)}
          autoClear={autoClear}
          setAutoClear={onAutoClear}
          precioDe={precioDe}
          promoDe={promoDe}
          catalogoListo={!tn.cargando}
          onRefrescarPrecios={tn.refrescar}
          onImprimir={imprimir}
          onImprimirUno={imprimirUno}
          fpLines={fpLines}
          guardarFP={guardarFP}
        />
      ) : (
        <LibreEditor />
      )}
    </div>
  )
}

function SubBtn({ k, sub, set, children }: { k: ModoEtiqueta | 'libre'; sub: string; set: (s: ModoEtiqueta | 'libre') => void; children: ReactNode }) {
  return (
    <button className={`tab${sub === k ? ' active' : ''}`} onClick={() => set(k)}>
      {children}
    </button>
  )
}

function ModoPanel({
  modo,
  vars,
  sinCodigo,
  cant,
  setCant,
  limpiar,
  autoClear,
  setAutoClear,
  precioDe,
  promoDe,
  catalogoListo,
  onRefrescarPrecios,
  onImprimir,
  onImprimirUno,
  fpLines,
  guardarFP,
}: {
  modo: ModoEtiqueta
  vars: VarianteEti[]
  sinCodigo: VarianteEti[]
  cant: Cantidades
  setCant: (id: string, val: string) => void
  limpiar: () => void
  autoClear: boolean
  setAutoClear: (on: boolean) => void
  precioDe: (v: VarianteEti) => number
  promoDe: (v: VarianteEti) => { normal: number; promo: number } | null
  catalogoListo: boolean
  onRefrescarPrecios: () => Promise<void>
  onImprimir: (modo: ModoEtiqueta, opts: { sep: boolean; conFP: boolean }) => void
  onImprimirUno: (modo: ModoEtiqueta, v: VarianteEti, conFP: boolean) => void
  fpLines: LineaEtiqueta[]
  guardarFP: (l: LineaEtiqueta[]) => void
}) {
  const [q, setQ] = useState('')
  const [sep, setSep] = useState(false)
  const [conFP, setConFP] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; html: string } | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)

  const conPrecio = modo === 'loc'
  const esPromo = modo === 'promo'
  const listaBase = esPromo ? vars.filter((v) => promoDe(v)) : vars
  const lista = filtrarVariantes(listaBase, q)
  const shown = lista.slice(0, CAP)
  const total = totalEtiquetas(cant)

  const onScan = async () => {
    const inp = scanRef.current
    if (!inp) return
    const code = inp.value.trim()
    inp.value = ''
    if (!code) return
    const v = resolverScan(vars, code)
    if (!v) {
      setFeedback({ ok: false, html: `✗ No se encontró ningún producto con el código «${code}».` })
      inp.focus()
      return
    }
    if (modo === 'sku' && !v.sku) {
      setFeedback({ ok: false, html: `✗ ${v.name || ''} no tiene SKU cargado.` })
      inp.focus()
      return
    }
    if (modo === 'promo' && !promoDe(v)) {
      setFeedback({ ok: false, html: `✗ ${v.name || ''} no está en promoción en TiendaNube.` })
      inp.focus()
      return
    }
    onImprimirUno(modo, v, modo === 'loc' && conFP)
    const p = precioDe(v)
    const pr = modo === 'promo' ? promoDe(v) : null
    const extra =
      modo === 'sku' ? ` · SKU ${v.sku}` : pr ? ` · $${Math.round(pr.normal).toLocaleString('es-AR')} → $${Math.round(pr.promo).toLocaleString('es-AR')}` : modo === 'loc' && p ? ` · $${Math.round(p).toLocaleString('es-AR')}` : ''
    setFeedback({ ok: true, html: `✓ Imprimiendo: ${v.name || ''} · ${v.size || ''}${extra}` })
    inp.focus()
  }

  const scanBorder = esPromo ? '#DB2777' : '#378ADD'
  const cardScanStyle: CSSProperties = esPromo
    ? { border: '1px solid #FBCFE8', background: '#FDF2F8' }
    : { border: '1px solid #BFDBFE', background: '#F0F7FF' }

  return (
    <div>
      <div className="card" style={cardScanStyle}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>⚡ Impresión rápida (escáner)</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
          Escaneá el código de barras de un producto: imprime su etiqueta de <b>{modo === 'loc' ? 'local (con precio)' : modo === 'promo' ? 'promo (antes/ahora)' : modo === 'sku' ? 'solo SKU' : 'depósito (sin precio)'}</b> al instante.
        </div>
        <input
          ref={scanRef}
          type="text"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void onScan()
            }
          }}
          placeholder="🔫 Escaneá acá el código de barras…"
          style={{ width: 320, maxWidth: '100%', fontSize: 15, padding: '9px 12px', border: `2px solid ${scanBorder}`, borderRadius: 8, boxSizing: 'border-box' }}
        />
        {feedback && <div style={{ fontSize: 13, marginTop: 8, color: feedback.ok ? '#16A34A' : '#DC2626' }}>{feedback.html}</div>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{titulo(modo)}</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{subtitulo(modo)}</div>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, SKU o código…" style={{ width: 240, maxWidth: '100%', padding: '7px 9px', border: '1px solid #D1D5DB', borderRadius: 7 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <button className="btn-sm" disabled={!total} onClick={() => onImprimir(modo, { sep: modo === 'dep' && sep, conFP: modo === 'loc' && conFP })} style={{ background: '#1F2937', color: '#fff', opacity: total ? 1 : 0.5 }}>🖨️ Imprimir etiquetas</button>
          {(conPrecio || esPromo) && (
            <button
              className="btn-sm"
              disabled={refrescando}
              onClick={async () => {
                setRefrescando(true)
                await onRefrescarPrecios()
                setRefrescando(false)
              }}
              style={{ background: '#fff', border: '1px solid #D1D5DB' }}
            >
              {refrescando ? '⏳ Actualizando precios…' : '🔄 Actualizar precios'}
            </button>
          )}
          <button className="btn-sm" onClick={limpiar}>Limpiar cantidades</button>
          <label style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoClear} onChange={(e) => setAutoClear(e.target.checked)} /> Borrar cantidades al imprimir
          </label>
          <span style={{ fontSize: 12, color: '#6B7280' }}>{total ? `${total} etiquetas en ${Object.keys(cant).length} variantes` : 'Cargá cantidades para imprimir'}</span>
        </div>

        {modo === 'dep' && (
          <label style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={sep} onChange={(e) => setSep(e.target.checked)} /> Dejar una etiqueta en blanco al cambiar de variante (para separar más fácil)
          </label>
        )}
        {modo === 'loc' && (
          <label style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={conFP} onChange={(e) => setConFP(e.target.checked)} /> Imprimir también la etiqueta de <b>&nbsp;formas de pago</b>&nbsp; (1 después de cada precio)
          </label>
        )}

        <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
          {sinCodigo.length > 0 && <AvisoSinCodigo lista={sinCodigo} />}
          {shown.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {th('Producto')}
                  {th('Variante')}
                  {th('SKU')}
                  {th('Código')}
                  {conPrecio && th('Precio', 'right')}
                  {esPromo && th('Antes', 'right')}
                  {esPromo && th('Ahora', 'right')}
                  {th('Stock', 'center')}
                  {th('Etiquetas', 'center')}
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => {
                  const pr = esPromo ? promoDe(v) : null
                  return (
                    <tr key={v.id} style={{ borderTop: '1px solid #EEF0F2' }}>
                      <td style={tdC}>{v.name || '—'}</td>
                      <td style={tdC}>{v.size || '—'}</td>
                      <td style={{ ...tdC, color: '#666' }}>{v.sku || '—'}</td>
                      <td style={{ ...tdC, color: '#666', fontFamily: 'monospace', fontSize: 12 }}>{v.barcode}</td>
                      {conPrecio && <td style={{ ...tdC, textAlign: 'right', fontWeight: 600 }}>{precioDe(v) ? '$' + Math.round(precioDe(v)).toLocaleString('es-AR') : '—'}</td>}
                      {esPromo && <td style={{ ...tdC, textAlign: 'right', color: '#9CA3AF', textDecoration: 'line-through' }}>{pr ? '$' + Math.round(pr.normal).toLocaleString('es-AR') : '—'}</td>}
                      {esPromo && <td style={{ ...tdC, textAlign: 'right', fontWeight: 700, color: '#DB2777' }}>{pr ? '$' + Math.round(pr.promo).toLocaleString('es-AR') : '—'}</td>}
                      <td style={{ ...tdC, textAlign: 'center', color: '#9CA3AF' }}>{v.stock || 0}</td>
                      <td style={{ ...tdC, textAlign: 'center' }}>
                        <input type="number" min={0} value={cant[v.id] || ''} onChange={(e) => setCant(v.id, e.target.value)} style={{ width: 64, textAlign: 'center', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 6 }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ color: '#9CA3AF', padding: 24, textAlign: 'center' }}>
              {esPromo ? 'No hay productos en promoción (con código de barras) que coincidan.' : 'No hay variantes con código de barras que coincidan.'}
            </div>
          )}
          {lista.length > CAP && <div style={{ fontSize: 11, color: '#9CA3AF', padding: 8 }}>Mostrando {CAP} de {lista.length}. Refiná la búsqueda para ver el resto.</div>}
        </div>
      </div>

      {modo === 'loc' && <FPEditor fpLines={fpLines} guardarFP={guardarFP} catalogoListo={catalogoListo} />}
    </div>
  )
}

function AvisoSinCodigo({ lista }: { lista: VarianteEti[] }) {
  const items = lista.slice(0, 80)
  return (
    <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#92400E' }}>
      ⚠️ <b>{lista.length} producto(s) con stock SIN código de barras.</b> No se pueden etiquetar hasta tener el código (cargalo en GN; a veces GN tarda en sincronizarlo).
      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer' }}>Ver cuáles</summary>
        {items.map((v, i) => (
          <div key={i} style={{ marginTop: 2 }}>
            • {v.name || '—'}{v.size && v.size !== '—' ? ' · ' + v.size : ''}{v.sku ? ' · ' + v.sku : ''} <span style={{ color: '#B45309' }}>(stock {v.stock || 0})</span>
          </div>
        ))}
        {lista.length > 80 && <div style={{ marginTop: 2, color: '#9CA3AF' }}>…y {lista.length - 80} más</div>}
      </details>
    </div>
  )
}

// ── Editor de formas de pago ──
const FP_TAM: [LineaEtiqueta['tam'], string][] = [['titulo', 'Título'], ['subtitulo', 'Subtítulo'], ['normal', 'Normal'], ['chico', 'Chico']]
function FPEditor({ fpLines, guardarFP, catalogoListo }: { fpLines: LineaEtiqueta[]; guardarFP: (l: LineaEtiqueta[]) => void; catalogoListo: boolean }) {
  const setLinea = (i: number, campo: keyof LineaEtiqueta, val: string | boolean) => guardarFP(fpLines.map((l, idx) => (idx === i ? { ...l, [campo]: val } : l)))
  const add = () => guardarFP([...fpLines, { texto: '', tam: 'normal', bold: false }])
  const del = (i: number) => {
    const next = fpLines.filter((_, idx) => idx !== i)
    guardarFP(next.length ? next : [{ texto: '', tam: 'normal', bold: false }])
  }
  const imprimirSolo = async () => {
    if (!fpLines.filter((l) => l.texto.trim()).length) {
      alert('La etiqueta de formas de pago está vacía.')
      return
    }
    const n = parseInt(prompt('¿Cuántas etiquetas de formas de pago querés imprimir?', '10') || '', 10)
    if (!n || n < 1) return
    const labels = Array.from({ length: n }, () => ({ __fp: true as const }))
    imprimirPdf(await buildEtiquetasPdf(labels, 'loc', { precioDe: () => 0, promoDe: () => null, fpLines }))
  }

  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 700 }}>💳 Etiqueta de formas de pago</div>
      <div style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 12px' }}>Diseñala una vez (queda guardada). Se imprime junto a las etiquetas de precio cuando tildás la opción de arriba. Tamaño 5 × 2,5 cm.</div>
      {fpLines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input value={l.texto} placeholder="Texto" onChange={(e) => setLinea(i, 'texto', e.target.value)} style={{ flex: 1, minWidth: 160, padding: '6px 9px', border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 13 }} />
          <select value={l.tam} onChange={(e) => setLinea(i, 'tam', e.target.value)} style={{ padding: 6, border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 12 }}>
            {FP_TAM.map(([val, t]) => <option key={val} value={val}>{t}</option>)}
          </select>
          <label style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" checked={l.bold} onChange={(e) => setLinea(i, 'bold', e.target.checked)} /> Negrita
          </label>
          <button onClick={() => del(i)} title="Quitar" style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      ))}
      <button className="btn-sm" onClick={add} style={{ marginTop: 4 }}>+ Agregar línea</button>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
        <div style={{ fontSize: 12, color: '#888' }}>Vista previa:</div>
        <div style={{ width: 200, height: 100, border: '1px solid #E5E7EB', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 6, background: '#fff' }}>
          {fpLines.filter((l) => l.texto.trim()).map((l, i) => (
            <div key={i} style={{ fontSize: l.tam === 'titulo' ? 13 : l.tam === 'subtitulo' ? 11 : l.tam === 'chico' ? 8 : 10, fontWeight: l.bold ? 700 : 400, lineHeight: 1.25 }}>{l.texto}</div>
          )) || <span style={{ color: '#CBD5E1', fontSize: 11 }}>(vacía)</span>}
        </div>
        <button className="btn-sm" disabled={!catalogoListo} onClick={imprimirSolo}>🖨️ Imprimir solo formas de pago…</button>
      </div>
    </div>
  )
}

// ── Editor de etiqueta libre ──
function LibreEditor() {
  const [lineas, setLineas] = useState<LineaEtiqueta[]>([{ texto: '', tam: 'titulo', bold: true }])
  const [grande, setGrande] = useState(false)
  const [copias, setCopias] = useState('1')
  const [barcode, setBarcode] = useState('')
  const [precio, setPrecio] = useState('')

  const setLinea = (i: number, campo: keyof LineaEtiqueta, val: string | boolean) => setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: val } : l)))
  const add = () => setLineas((prev) => [...prev, { texto: '', tam: 'normal', bold: false }])
  const del = (i: number) => setLineas((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [{ texto: '', tam: 'normal', bold: false }]))

  const build = async () => {
    const pdf = await buildLibrePdf({
      grande,
      copias: Math.max(1, parseInt(copias, 10) || 1),
      barcode: barcode.trim(),
      precio: precio !== '' ? Math.round(parseFloat(precio)) : null,
      lineas,
    })
    if (!pdf) {
      alert('Cargá al menos una línea de texto, un código de barras o un precio.')
      return null
    }
    return pdf
  }
  const imprimir = async () => {
    const pdf = await build()
    if (pdf) imprimirPdf(pdf)
  }
  const preview = async () => {
    const pdf = await build()
    if (!pdf) return
    const url = pdf.output('bloburl')
    if (!window.open(url, 'etiquetas_print')) pdf.save('etiqueta.pdf')
  }

  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>✏️ Etiqueta libre (editor)</div>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 14 }}>Armá una etiqueta a medida con texto, código de barras y/o precio. Ideal para cajas, bolsas y rótulos de envío.</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: '#666' }}>Tamaño<br />
          <select value={grande ? 'grande' : 'chica'} onChange={(e) => setGrande(e.target.value === 'grande')} style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, minWidth: 150 }}>
            <option value="chica">5 × 2,5 cm (chica)</option>
            <option value="grande">10 × 15 cm (caja / rótulo)</option>
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#666' }}>Copias<br />
          <input type="number" value={copias} min={1} onChange={(e) => setCopias(e.target.value)} style={{ width: 80, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8 }} />
        </label>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Líneas de texto</div>
      {lineas.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input value={l.texto} placeholder={`Texto de la línea ${i + 1}`} onChange={(e) => setLinea(i, 'texto', e.target.value)} style={{ flex: 1, minWidth: 160, padding: '6px 9px', border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 13 }} />
          <select value={l.tam} onChange={(e) => setLinea(i, 'tam', e.target.value)} style={{ padding: 6, border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 12 }}>
            {FP_TAM.map(([val, t]) => <option key={val} value={val}>{t}</option>)}
          </select>
          <label style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" checked={l.bold} onChange={(e) => setLinea(i, 'bold', e.target.checked)} /> Negrita
          </label>
          <button onClick={() => del(i)} title="Quitar línea" style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      ))}
      <button className="btn-sm" onClick={add} style={{ marginTop: 4 }}>+ Agregar línea</button>
      <div style={{ borderTop: '1px solid #EEF0F2', margin: '16px 0 12px' }} />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: 12, color: '#666' }}>Código de barras (opcional)<br />
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="número o texto a codificar" style={{ width: 240, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8 }} />
        </label>
        <label style={{ fontSize: 12, color: '#666' }}>Precio (opcional)<br />
          <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="ej. 12990" style={{ width: 140, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8 }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn-sm" onClick={preview}>👁️ Vista previa</button>
        <button className="btn-sm" onClick={imprimir} style={{ background: '#1F2937', color: '#fff' }}>🖨️ Imprimir</button>
      </div>
    </div>
  )
}

function titulo(modo: ModoEtiqueta): string {
  return modo === 'loc' ? '🏪 Etiquetas Local' : modo === 'promo' ? '🔥 Etiquetas Promo' : modo === 'sku' ? '🔢 Etiquetas SKU' : '🏬 Etiquetas Depósito'
}
function subtitulo(modo: ModoEtiqueta): string {
  return modo === 'loc'
    ? 'Igual que depósito + precio (el de TiendaNube: promocional si está activo, si no el normal).'
    : modo === 'promo'
      ? 'Solo productos con precio promocional en TiendaNube: precio anterior tachado (chico) y nuevo (grande).'
      : modo === 'sku'
        ? 'Etiquetas 5 × 2,5 cm con solo el SKU (grande y centrado).'
        : 'Etiquetas 5 × 2,5 cm: nombre, variante, SKU y código de barras (Code 128). Sin precio.'
}

const thStyle: CSSProperties = { padding: '6px 10px', position: 'sticky', top: 0, background: '#F3F4F6' }
function th(t: string, align: 'left' | 'right' | 'center' = 'left') {
  return <th style={{ ...thStyle, textAlign: align }}>{t}</th>
}
const tdC: CSSProperties = { padding: '5px 10px' }
