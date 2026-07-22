'use client'

/**
 * Integraciones → sync TN↔GN de Stunned. Dos pestañas:
 *  - **Mapeo**: la tabla `sku_map` (store='stunned', vive en la base de Zattia). "Proponer" cruza
 *    las variantes STU de GN (`inventario`) con las de TN (`?variantes=1`) por SKU exacto (+ barcode)
 *    y sube propuestas SIN validar. El sync solo usa las validadas. "Validar verdes" valida de una
 *    todo lo confiable (match por SKU/código de barras).
 *  - **Stock (dry-run)**: compara, por cada variante validada, el stock de GN vs el de TN y muestra
 *    qué ESCRIBIRÍA el sync (TN = GN). Es de SOLO LECTURA: no escribe nada.
 *
 * Nada acá toca stock ni ventas: mapeo (read+write sobre sku_map) y comparación (read-only).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CUENTAS } from '@/lib/cuentas'
import { sbFetch } from '@/lib/supabase/rest'
import { guardarMapeo, leerMapeo, validarSkus } from '@/lib/sku-map/cliente'
import { proponerMapeo, type GnVar, type TnVar } from '@/lib/sku-map/proponer'
import type { MatchMetodo, SkuMapRow } from '@/lib/sku-map/tipos'

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
const TN_STOCK_API = 'https://bdi-catalogo.vercel.app/api/tn-categorias' // acción 'stock'
const STORE = 'stunned' as const

/** Fila del mirror `inventario` de GN (nivel VARIANTE: acá vive el SKU real por talle). */
type FilaInventarioGN = {
  product_id: number | string
  product_name: string | null
  sku: string | null
  barcode: string | null
  size_id: number | string | null
}

/** Un producto de `tiendanube-audit?variantes=1` con su detalle por variante. */
type TnAuditProducto = {
  id?: number | string
  variantes?: Array<{ sku?: string | null; barcode?: string | null; id?: number | string | null; stock?: number | null }>
}

/** Una fila del dry-run de stock: qué haría el sync con esta variante. */
type DryRow = { sku: string; nombre: string | null; tnProductId: string | null; tnVariantId: string | null; gn: number; tn: number | null; delta: number | null }

const META: Record<MatchMetodo, { txt: string; color: string; bg: string }> = {
  sku: { txt: 'SKU exacto', color: '#15803D', bg: '#F0FDF4' },
  barcode: { txt: 'Código de barras', color: '#15803D', bg: '#F0FDF4' },
  nombre: { txt: 'Nombre exacto', color: '#B45309', bg: '#FFFBEB' },
  palabras: { txt: 'Por palabras (revisar)', color: '#B91C1C', bg: '#FEF2F2' },
  manual: { txt: 'Manual', color: '#1D4ED8', bg: '#EFF6FF' },
}
const esConfiable = (m?: MatchMetodo | null) => m === 'sku' || m === 'barcode'

function Badge({ m }: { m?: MatchMetodo | null }) {
  const info = m ? META[m] : null
  if (!info) return <span style={{ color: '#9CA3AF' }}>—</span>
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: info.color, background: info.bg, borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap' }}>
      {info.txt}
    </span>
  )
}

export function Integraciones() {
  const [tab, setTab] = useState<'mapeo' | 'stock'>('mapeo')
  const [rows, setRows] = useState<SkuMapRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [proponiendo, setProponiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // Dry-run de stock
  const [dryRows, setDryRows] = useState<DryRow[]>([])
  const [dryLoading, setDryLoading] = useState(false)
  const [dryMsg, setDryMsg] = useState<string | null>(null)
  const [dryError, setDryError] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState<string | null>(null) // sku que se está escribiendo

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setRows(await leerMapeo(STORE))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  // Carga inicial en un IIFE async: el setState va DESPUÉS del await (no sincrónico en el
  // cuerpo del effect), como useEtiquetasTn — así no dispara react-hooks/set-state-in-effect.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const data = await leerMapeo(STORE)
        if (vivo) setRows(data)
      } catch (e) {
        if (vivo) setError((e as Error).message)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const proponer = useCallback(async () => {
    setProponiendo(true)
    setMsg(null)
    setError(null)
    try {
      // GN a nivel VARIANTE: el SKU real y único (STU-REM-0001-S) vive en `inventario`,
      // no en `productos` (donde el sku es "STUNNED" para toda la línea).
      const gnRaw = await sbFetch<FilaInventarioGN>(
        CUENTAS.zattia,
        'inventario',
        'select=product_id,product_name,sku,barcode,size_id&sku=ilike.STU*&order=sku',
      )
      const gn: GnVar[] = gnRaw
        .filter((v) => v.sku)
        .map((v) => ({
          sku: String(v.sku),
          barcode: v.barcode,
          name: v.product_name,
          gn_product_id: v.product_id != null ? String(v.product_id) : null,
          gn_variant_id: v.size_id != null ? String(v.size_id) : null,
        }))
      // TN: variantes de la tienda propia de Stunned (?variantes=1 expone sku/barcode/id por talle).
      const d = await fetch(`${AUDIT}?store=${STORE}&variantes=1&nc=${Date.now()}`)
        .then((r) => r.json())
        .catch(() => ({}))
      const tnProducts: TnAuditProducto[] = Array.isArray(d?.products) ? d.products : []
      const tn: TnVar[] = []
      for (const p of tnProducts) {
        for (const v of p.variantes || []) {
          tn.push({
            sku: v.sku,
            barcode: v.barcode,
            tn_variant_id: v.id != null ? String(v.id) : null,
            tn_product_id: p.id != null ? String(p.id) : null,
          })
        }
      }

      const { filas, sinMatch } = proponerMapeo(STORE, gn, tn, STORE)
      if (filas.length) await guardarMapeo(STORE, filas)
      setMsg(
        `${gn.length} variantes STU en GN · ${tn.length} en TN → ${filas.length} matcheadas por talle` +
          (sinMatch.length ? ` · ${sinMatch.length} sin par en TN (pendientes)` : '') +
          '. Los verdes (SKU/código de barras) son confiables.',
      )
      await recargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProponiendo(false)
    }
  }, [recargar])

  const toggleValidado = useCallback(async (r: SkuMapRow) => {
    try {
      await validarSkus(STORE, [r.sku], !r.validado)
      setRows((rs) => rs.map((x) => (x.sku === r.sku ? { ...x, validado: !r.validado } : x)))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const validarVerdes = useCallback(async () => {
    const verdes = rows.filter((r) => esConfiable(r.match_metodo) && !r.validado).map((r) => r.sku)
    if (!verdes.length) {
      setMsg('No hay filas verdes (confiables) sin validar.')
      return
    }
    setError(null)
    try {
      await validarSkus(STORE, verdes, true)
      const set = new Set(verdes)
      setRows((rs) => rs.map((r) => (set.has(r.sku) ? { ...r, validado: true } : r)))
      setMsg(`${verdes.length} variantes validadas (match confiable).`)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [rows])

  const correrDryRun = useCallback(async () => {
    setDryLoading(true)
    setDryError(null)
    setDryMsg(null)
    try {
      const validadas = await leerMapeo(STORE, { validado: true })
      if (!validadas.length) {
        setDryRows([])
        setDryMsg('No hay variantes validadas. Validá el mapeo primero (pestaña Mapeo → "Validar verdes").')
        return
      }
      // GN: stock por SKU = suma de available_quantity de todas las ubicaciones (Depósito + Local).
      // Traigo también product_name para mostrar de qué producto es cada SKU.
      const inv = await sbFetch<{ sku: string | null; product_name: string | null; available_quantity: number | null }>(
        CUENTAS.zattia,
        'inventario',
        'select=sku,product_name,available_quantity&sku=ilike.STU*',
      )
      const gnStock = new Map<string, number>()
      const nombrePorSku = new Map<string, string>()
      for (const r of inv) {
        if (!r.sku) continue
        gnStock.set(r.sku, (gnStock.get(r.sku) || 0) + (Number(r.available_quantity) || 0))
        if (r.product_name && !nombrePorSku.has(r.sku)) nombrePorSku.set(r.sku, r.product_name)
      }
      // TN: stock por SKU (de las variantes). refresh=1 evita el caché de 1h del endpoint —
      // clave para que, tras aplicar, el dry-run lea el stock REAL y no el viejo.
      const d = await fetch(`${AUDIT}?store=${STORE}&variantes=1&refresh=1&nc=${Date.now()}`)
        .then((r) => r.json())
        .catch(() => ({}))
      const tnStock = new Map<string, number | null>()
      for (const p of (d?.products || []) as TnAuditProducto[]) {
        for (const v of p.variantes || []) {
          if (v.sku) tnStock.set(v.sku, v.stock ?? null)
        }
      }
      const dry: DryRow[] = validadas.map((m) => {
        const gn = gnStock.get(m.sku) ?? 0
        const tn = tnStock.has(m.sku) ? tnStock.get(m.sku)! : null
        const delta = tn == null ? null : gn - tn
        return { sku: m.sku, nombre: nombrePorSku.get(m.sku) ?? null, tnProductId: m.tn_product_id ?? null, tnVariantId: m.tn_variant_id ?? null, gn, tn, delta }
      })
      dry.sort((a, b) => a.sku.localeCompare(b.sku))
      setDryRows(dry)
      const cambian = dry.filter((x) => x.delta != null && x.delta !== 0).length
      setDryMsg(
        `${dry.length} variantes validadas · ${cambian} con diferencia (el sync pondría TN = GN). ` +
          'Simulación: NO se escribió nada.',
      )
    } catch (e) {
      setDryError((e as Error).message)
    } finally {
      setDryLoading(false)
    }
  }, [])

  // Escribe el stock de UNA variante en TN (GN→TN). Es el primer write real a la tienda en vivo:
  // por eso va con confirmación y de a una. Setea el valor absoluto de GN.
  const aplicarUno = useCallback(async (r: DryRow) => {
    if (r.tnProductId == null || r.tnVariantId == null || r.delta == null || r.delta === 0) return
    if (typeof window !== 'undefined' && !window.confirm(`Escribir stock ${r.gn} en Tienda Nube para ${r.sku}?\n(hoy TN tiene ${r.tn})`)) return
    setAplicando(r.sku)
    setDryError(null)
    setDryMsg(null)
    try {
      // tn-categorias lee la tienda del query param (?store=), no del body. Sin esto asume 'bdi'.
      const resp = await fetch(`${TN_STOCK_API}?store=${STORE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'stock', updates: [{ product_id: r.tnProductId, variant_id: r.tnVariantId, stock: r.gn }] }),
      })
      const d = await resp.json().catch(() => null)
      if (!d?.ok || d.aplicados !== 1) throw new Error(d?.errores?.[0]?.msg || d?.error || 'No se pudo escribir en TN.')
      setDryRows((rs) => rs.map((x) => (x.sku === r.sku ? { ...x, tn: r.gn, delta: 0 } : x)))
      setDryMsg(`✓ ${r.sku}: el stock en TN quedó en ${r.gn}.`)
    } catch (e) {
      setDryError((e as Error).message)
    } finally {
      setAplicando(null)
    }
  }, [])

  const resumen = useMemo(() => {
    const val = rows.filter((r) => r.validado).length
    return { total: rows.length, validados: val, pendientes: rows.length - val }
  }, [rows])

  const btn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer' }
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '6px 8px', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 12, padding: '6px 8px', borderBottom: '1px solid #F3F4F6', whiteSpace: 'nowrap' }
  const tabBtn = (activo: boolean): React.CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 14px',
    borderRadius: 8,
    border: '1px solid ' + (activo ? '#D97706' : '#E5E7EB'),
    background: activo ? '#FFFBEB' : '#fff',
    color: activo ? '#B45309' : '#6B7280',
    cursor: 'pointer',
  })

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button style={tabBtn(tab === 'mapeo')} onClick={() => setTab('mapeo')}>Mapeo</button>
        <button style={tabBtn(tab === 'stock')} onClick={() => setTab('stock')}>Stock (dry-run)</button>
      </div>

      {tab === 'mapeo' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <button style={{ ...btn, borderColor: '#D97706', color: '#B45309' }} onClick={proponer} disabled={proponiendo}>
              {proponiendo ? 'Proponiendo…' : '🔎 Proponer / actualizar mapeo'}
            </button>
            <button style={{ ...btn, borderColor: '#15803D', color: '#15803D' }} onClick={() => void validarVerdes()} disabled={cargando}>
              ✓ Validar verdes
            </button>
            <button style={btn} onClick={() => void recargar()} disabled={cargando}>↻ Recargar</button>
            <span style={{ fontSize: 12, color: '#6B7280' }}>
              {resumen.total} filas · <b style={{ color: '#15803D' }}>{resumen.validados} validadas</b> · {resumen.pendientes} pendientes
            </span>
          </div>

          {msg && <div style={{ fontSize: 12, color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{msg}</div>}
          {error && <div style={{ fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{error}</div>}

          {cargando ? (
            <div style={{ fontSize: 13, color: '#6B7280', padding: 20 }}>Cargando mapeo…</div>
          ) : rows.length === 0 ? (
            <div style={{ fontSize: 13, color: '#6B7280', padding: 20 }}>
              No hay mapeo todavía. Apretá <b>Proponer / actualizar mapeo</b> para poblarlo desde GN (STU) × TN (Stunned).
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>SKU</th>
                    <th style={th}>GN product_id</th>
                    <th style={th}>TN product_id</th>
                    <th style={th}>TN variante (por talle)</th>
                    <th style={th}>Método</th>
                    <th style={th}>Validado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.sku} style={{ background: r.validado ? '#F8FEFB' : undefined }}>
                      <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{r.sku}</td>
                      <td style={{ ...td, color: '#6B7280' }}>{r.gn_product_id ?? '—'}</td>
                      <td style={{ ...td, color: '#6B7280' }}>{r.tn_product_id ?? '—'}</td>
                      <td style={{ ...td, color: '#111827', fontWeight: 600 }}>{r.tn_variant_id ?? '—'}</td>
                      <td style={td}><Badge m={r.match_metodo} /></td>
                      <td style={td}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!r.validado} onChange={() => void toggleValidado(r)} />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <button style={{ ...btn, borderColor: '#D97706', color: '#B45309' }} onClick={() => void correrDryRun()} disabled={dryLoading}>
              {dryLoading ? 'Comparando…' : '▶ Correr dry-run'}
            </button>
            <span style={{ fontSize: 12, color: '#6B7280' }}>Simulación de solo lectura: compara GN vs TN, no escribe.</span>
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10 }}>
            Stock de GN = suma de todas las ubicaciones (Depósito + Local). El sync pondría TN = GN.
          </div>

          {dryMsg && <div style={{ fontSize: 12, color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{dryMsg}</div>}
          {dryError && <div style={{ fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{dryError}</div>}

          {dryRows.length > 0 && (
            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Producto</th>
                    <th style={th}>SKU (talle)</th>
                    <th style={{ ...th, textAlign: 'right' }}>Stock GN</th>
                    <th style={{ ...th, textAlign: 'right' }}>Stock TN</th>
                    <th style={th}>Qué haría el sync</th>
                  </tr>
                </thead>
                <tbody>
                  {dryRows.map((r) => {
                    const cambia = r.delta != null && r.delta !== 0
                    return (
                      <tr key={r.sku} style={{ background: cambia ? '#FFFBEB' : undefined }}>
                        <td style={{ ...td, fontWeight: 600, color: '#111827' }}>{r.nombre ?? '—'}</td>
                        <td style={{ ...td, fontFamily: 'monospace' }}>{r.sku}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{r.gn}</td>
                        <td style={{ ...td, textAlign: 'right', color: '#6B7280' }}>{r.tn == null ? '—' : r.tn}</td>
                        <td style={td}>
                          {r.tn == null ? (
                            <span style={{ color: '#9CA3AF' }}>TN sin stock gestionado</span>
                          ) : cambia ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ color: '#B45309', fontWeight: 600 }}>TN {r.tn} → {r.gn}</span>
                              {r.tnProductId && r.tnVariantId && (
                                <button
                                  style={{ ...btn, padding: '3px 10px', fontSize: 12, borderColor: '#15803D', color: '#15803D' }}
                                  onClick={() => void aplicarUno(r)}
                                  disabled={aplicando != null}
                                >
                                  {aplicando === r.sku ? 'Escribiendo…' : 'Aplicar'}
                                </button>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: '#15803D' }}>ya coincide</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
