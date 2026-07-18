'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useGenTalles } from './useGenTalles'
import { extraerTabla, tablaActualHtml } from './tabla-dom'
import {
  computarPendientes,
  emparejarMedidas,
  filtrarPendientes,
  generarHtml,
  limpiarData,
  parseTalles,
  tipoDesdeNombre,
  type FiltrosPendientes,
} from '@/lib/gen-talles/core'
import { GEN_TALLES_PLANTILLAS, type TablaGuardada } from '@/lib/gen-talles/plantillas'
import type { TnProducto } from '@/lib/tn'

const PRIMER_TIPO = Object.keys(GEN_TALLES_PLANTILLAS)[0] // 'top', como la 1ª opción del legacy

export function GenTalles() {
  const { marca } = useSesion()
  const gt = useGenTalles(marca)
  const { datos } = useDatosMonitor()

  const [tipo, setTipo] = useState<string>(PRIMER_TIPO)
  const [tallesStr, setTallesStr] = useState<string>(GEN_TALLES_PLANTILLAS[PRIMER_TIPO].talles.join(', '))
  const [gtData, setGtData] = useState<Record<string, string>>({})
  const [elegido, setElegido] = useState<TnProducto | null>(null)
  const [copyMsg, setCopyMsg] = useState('')
  const [tnMsg, setTnMsg] = useState('')
  const [cargandoTN, setCargandoTN] = useState(false)

  const plantilla = GEN_TALLES_PLANTILLAS[tipo]
  const talles = useMemo(() => parseTalles(tallesStr), [tallesStr])
  const html = useMemo(() => generarHtml(plantilla, talles, gtData), [plantilla, talles, gtData])

  // Cambiar de tipo: resetea talles al default de la plantilla y limpia la grilla.
  const onTipo = (k: string) => {
    setTipo(k)
    setTallesStr(GEN_TALLES_PLANTILLAS[k].talles.join(', '))
    setGtData({})
  }
  // Cambiar los talles: limpia las claves de gtData que ya no correspondan.
  const onTalles = (v: string) => {
    setTallesStr(v)
    setGtData((prev) => limpiarData(prev, plantilla, parseTalles(v)))
  }
  const onCell = (talle: string, letra: string, val: string) => setGtData((prev) => ({ ...prev, [talle + '|' + letra]: val }))

  const onElegir = (p: TnProducto) => {
    setElegido(p)
    const tk = tipoDesdeNombre(p.name || '', GEN_TALLES_PLANTILLAS)
    if (tk) onTipo(tk)
  }

  const onCargarGuardada = () => {
    if (!elegido) return
    const s = gt.guardadas[String(elegido.id)]
    if (!s) return
    setTipo(s.tipo || 'remera')
    setTallesStr(s.talles || '')
    setGtData({ ...(s.gtData || {}) })
  }

  const onImportar = () => {
    if (!elegido) return
    const ext = extraerTabla(elegido.raw_desc)
    if (!ext) {
      alert('No pude leer la tabla. Cargá los datos a mano desde la tabla de arriba.')
      return
    }
    setTallesStr(ext.talles.join(', '))
    setGtData(emparejarMedidas(ext.talles, ext.medidas, plantilla))
    alert(`✓ Datos recuperados sobre el tipo "${plantilla.nombre}". Revisá que cada medida quedó en su columna antes de cargar en TN.`)
  }

  const guardarActual = async (): Promise<boolean> => {
    if (!elegido) return false
    const tabla: TablaGuardada = { tipo, talles: tallesStr, gtData: { ...gtData }, name: elegido.name || '', ts: new Date().toISOString() }
    return gt.guardarVinculado(String(elegido.id), tabla)
  }

  const onCopiar = async () => {
    try {
      await navigator.clipboard.writeText(html)
      setCopyMsg('✓ Copiado — pegalo en la descripción del producto')
      setTimeout(() => setCopyMsg(''), 4000)
    } catch {
      alert('No se pudo copiar automáticamente.')
    }
  }

  const onCargarEnTN = async () => {
    if (!elegido) {
      alert('Elegí un producto primero.')
      return
    }
    if (!confirm(`Cargar esta tabla de talles en la descripción de "${elegido.name}" en Tienda Nube?\n\nNo se borra el resto de la descripción; si ya tenía una tabla nuestra, se reemplaza.`)) return
    setCargandoTN(true)
    setTnMsg('')
    const r = await gt.cargarEnTN(elegido.id!, html)
    if (!r.ok) {
      alert('No se pudo cargar en TN.\n' + (r.error || ''))
      setCargandoTN(false)
      return
    }
    await guardarActual()
    const fresco = await gt.refrescarAudit(elegido.id)
    if (fresco) setElegido(fresco)
    setTnMsg(r.accion === 'reemplazada' ? '✓ Tabla actualizada en TN' : '✓ Tabla cargada en TN')
    setTimeout(() => setTnMsg(''), 5000)
    setCargandoTN(false)
  }

  const tablaActual = elegido ? tablaActualHtml(elegido.raw_desc) : null

  return (
    <div>
      {marca === 'zattia' && (
        <PendientesCard
          productos={(datos?.allProductos ?? []) as { name?: string | null; sku?: string | null; stock?: number; ingresoMes?: string | null }[]}
          idx={gt.tnIdx}
          guardadas={gt.guardadas}
          elegidoId={elegido?.id}
          onElegir={onElegir}
        />
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: '#666' }}>
            Tipo de prenda
            <br />
            <select value={tipo} onChange={(e) => onTipo(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, minWidth: 160 }}>
              {Object.entries(GEN_TALLES_PLANTILLAS).map(([k, p]) => (
                <option key={k} value={k}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: '#666' }}>
            Talles (separados por coma)
            <br />
            <input value={tallesStr} onChange={(e) => onTalles(e.target.value)} style={{ width: 260, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8 }} />
          </label>
        </div>

        <div style={{ borderTop: '1px solid #F1F5F9', margin: '6px 0 14px', paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
            Vincular a un producto de Tienda Nube (opcional)
          </div>
          <VincularProducto
            productos={gt.tnProducts}
            elegido={elegido}
            tieneGuardada={!!(elegido && gt.guardadas[String(elegido.id)])}
            tipoDetectado={elegido ? (tipoDesdeNombre(elegido.name || '', GEN_TALLES_PLANTILLAS) ? plantilla.nombre : null) : null}
            onElegir={onElegir}
            onCargarGuardada={onCargarGuardada}
          />
          {elegido && (
            <div style={{ marginTop: 10 }}>
              {tablaActual ? (
                <>
                  <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>Tabla actual del producto en TN:</div>
                  <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 10, overflowX: 'auto', background: '#fff' }} dangerouslySetInnerHTML={{ __html: tablaActual }} />
                  <button className="btn-sm" onClick={onImportar} style={{ marginTop: 8 }}>⬇️ Recuperar datos de esta tabla</button>
                  <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>Si no se carga bien, copiá los números a mano desde la tabla de arriba.</span>
                </>
              ) : (
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>Este producto todavía no tiene tabla en su descripción.</div>
              )}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Cargá las medidas</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thGrid}>Talle</th>
                {plantilla.medidas.map((m) => (
                  <th key={m.letra} style={thGrid}>{m.nombre} ({m.letra})</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {talles.map((t) => (
                <tr key={t}>
                  <td style={{ padding: '6px 8px', border: '1px solid #E5E7EB', fontWeight: 600, textAlign: 'center', background: '#FAFAFA' }}>{t}</td>
                  {plantilla.medidas.map((m) => (
                    <td key={m.letra} style={{ padding: 3, border: '1px solid #E5E7EB' }}>
                      <input
                        value={gtData[t + '|' + m.letra] || ''}
                        onChange={(e) => onCell(t, m.letra, e.target.value)}
                        style={{ width: 62, textAlign: 'center', padding: '5px 4px', border: '1px solid #E5E7EB', borderRadius: 6 }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            Vista previa <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 12 }}>(así se va a ver en Tienda Nube)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {tnMsg && <span style={{ fontSize: 12, color: '#16A34A' }}>{tnMsg}</span>}
            {copyMsg && <span style={{ fontSize: 12, color: '#16A34A' }}>{copyMsg}</span>}
            {elegido && (
              <button className="btn-sm" onClick={onCargarEnTN} disabled={cargandoTN} style={{ background: '#0F766E', color: '#fff' }}>
                {cargandoTN ? '⏳ Cargando…' : '📤 Cargar en TN'}
              </button>
            )}
            <button className="btn-sm" onClick={onCopiar} style={{ background: '#1F2937', color: '#fff' }}>📋 Copiar HTML para TN</button>
          </div>
        </div>
        <div style={{ border: '1px dashed #E5E7EB', borderRadius: 10, padding: 16, background: '#fff' }} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}

function VincularProducto({
  productos,
  elegido,
  tieneGuardada,
  tipoDetectado,
  onElegir,
  onCargarGuardada,
}: {
  productos: TnProducto[]
  elegido: TnProducto | null
  tieneGuardada: boolean
  tipoDetectado: string | null
  onElegir: (p: TnProducto) => void
  onCargarGuardada: () => void
}) {
  const [q, setQ] = useState('')
  const matches = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (qq.length < 2) return []
    return productos.filter((p) => (p.name || '').toLowerCase().includes(qq) || (p.sku || '').toLowerCase().includes(qq)).slice(0, 8)
  }, [q, productos])

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar producto por nombre o SKU…"
        style={{ width: '100%', maxWidth: 520, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8 }}
      />
      {q.trim().length >= 2 && (
        <div style={{ marginTop: 6 }}>
          {matches.length ? (
            matches.map((p) => (
              <button
                key={String(p.id)}
                className="btn-sm"
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }}
                onClick={() => {
                  onElegir(p)
                  setQ('')
                }}
              >
                {p.name}{p.sku ? ' · ' + p.sku : ''}
              </button>
            ))
          ) : (
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Sin resultados.</div>
          )}
        </div>
      )}
      {elegido && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          Producto: <strong>{elegido.name}</strong>
          {tipoDetectado && <span style={{ color: '#0F766E' }}> · tipo detectado: {tipoDetectado}</span>}
          {tieneGuardada && (
            <button className="btn-sm" onClick={onCargarGuardada} style={{ marginLeft: 8 }}>↺ Cargar la guardada</button>
          )}
        </div>
      )}
    </div>
  )
}

function PendientesCard({
  productos,
  idx,
  guardadas,
  elegidoId,
  onElegir,
}: {
  productos: { name?: string | null; sku?: string | null; stock?: number; ingresoMes?: string | null }[]
  idx: ReturnType<typeof useGenTalles>['tnIdx']
  guardadas: Record<string, TablaGuardada>
  elegidoId?: string | number
  onElegir: (p: TnProducto) => void
}) {
  const [estado, setEstado] = useState<FiltrosPendientes['estado']>('todas')
  const [categoria, setCategoria] = useState('')
  const [mes, setMes] = useState('')
  const [soloStock, setSoloStock] = useState(true)

  const base = useMemo(() => computarPendientes(productos, idx, guardadas), [productos, idx, guardadas])
  const cats = useMemo(() => [...new Set(base.flatMap((x) => x.categoriasTN))].sort((a, b) => a.localeCompare(b, 'es')), [base])
  const meses = useMemo(() => [...new Set(base.map((x) => x.ingresoMes).filter((m): m is string => !!m))].sort().reverse(), [base])
  const items = useMemo(() => filtrarPendientes(base, { estado, categoria, mes, soloStock }), [base, estado, categoria, mes, soloStock])

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>📋 Pendientes de tabla de talles</div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Productos sin nuestra tabla nueva (vieja o sin tabla). Elegí uno para actualizarlo abajo.</div>
        </div>
        <span style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>{items.length} {items.length === 1 ? 'pendiente' : 'pendientes'}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: '#666' }}>
          Estado
          <br />
          <select value={estado} onChange={(e) => setEstado(e.target.value as FiltrosPendientes['estado'])} style={selP}>
            <option value="todas">A migrar (todas)</option>
            <option value="vieja">Tabla vieja</option>
            <option value="sin">Sin tabla</option>
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#666' }}>
          Categoría
          <br />
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={selP}>
            <option value="">Todas las categorías</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#666' }}>
          Mes de ingreso
          <br />
          <select value={mes} onChange={(e) => setMes(e.target.value)} style={selP}>
            <option value="">Todos los meses</option>
            {meses.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingBottom: 7 }}>
          <input type="checkbox" checked={soloStock} onChange={(e) => setSoloStock(e.target.checked)} /> Solo con stock
        </label>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {items.length ? (
          items.map((x) => {
            const hl = elegidoId != null && x.tn.id === elegidoId
            const cat = x.categoriasTN[0] ? ' · ' + x.categoriasTN[0] : ''
            return (
              <button
                key={String(x.tn.id)}
                className="btn-sm"
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4, ...(hl ? { background: '#ECFDF5', borderColor: '#16A34A' } : {}) }}
                onClick={() => onElegir(x.tn)}
              >
                {x.nombre} <span style={{ color: '#9CA3AF' }}>· stock {x.stock}{cat}</span>
                {x.tablaVieja ? <span style={{ color: '#B45309', fontSize: 11 }}> · tabla vieja</span> : <span style={{ color: '#DC2626', fontSize: 11 }}> · sin tabla</span>}
              </button>
            )
          })
        ) : (
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>No hay pendientes con esos filtros 🎉</div>
        )}
      </div>
    </div>
  )
}

const thGrid: CSSProperties = { padding: '6px 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', fontSize: 12, whiteSpace: 'nowrap' }
const selP: CSSProperties = { padding: '6px 9px', border: '1px solid #D1D5DB', borderRadius: 8, minWidth: 150 }
