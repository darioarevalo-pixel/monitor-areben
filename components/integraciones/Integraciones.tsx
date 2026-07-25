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
import { HeaderAcciones } from '@/components/layout/acciones'
import { Badge as BadgeKit, Button, EmptyState, Esqueleto, Notice, TBody, THead, TableWrap, Tabs, Td, Th, Tr, color, font, space } from '@/components/ui'

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

/** Qué tan confiable es cada forma de emparejar un SKU de GN con una variante de TN. */
const META: Record<MatchMetodo, { txt: string; tone: 'success' | 'warning' | 'danger' | 'action' }> = {
  sku: { txt: 'SKU exacto', tone: 'success' },
  barcode: { txt: 'Código de barras', tone: 'success' },
  nombre: { txt: 'Nombre exacto', tone: 'warning' },
  palabras: { txt: 'Por palabras (revisar)', tone: 'danger' },
  manual: { txt: 'Manual', tone: 'action' },
}
const esConfiable = (m?: MatchMetodo | null) => m === 'sku' || m === 'barcode'

function Badge({ m }: { m?: MatchMetodo | null }) {
  const info = m ? META[m] : null
  if (!info) return <span style={{ color: color.mut2 }}>—</span>
  return (
    <BadgeKit tone={info.tone} subtle>
      {info.txt}
    </BadgeKit>
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

  return (
    <>
      <HeaderAcciones>
        {tab === 'mapeo' ? (
          <>
            <Button variant="ghost" onClick={() => void recargar()} disabled={cargando}>
              ↻ Recargar
            </Button>
            <Button variant="outline" tone="success" onClick={() => void validarVerdes()} disabled={cargando}>
              Validar verdes
            </Button>
            <Button variant="solid" tone="brand" onClick={proponer} loading={proponiendo}>{proponiendo ? 'Proponiendo…' : 'Proponer / actualizar mapeo'}</Button>
          </>
        ) : (
          <Button variant="solid" tone="brand" onClick={() => void correrDryRun()} loading={dryLoading}>
            {dryLoading ? 'Comparando…' : 'Correr dry-run'}
          </Button>
        )}
      </HeaderAcciones>

      <Tabs
        items={[
          { key: 'mapeo', label: 'Mapeo' },
          { key: 'stock', label: 'Stock (dry-run)' },
        ]}
        value={tab}
        onChange={(k) => setTab(k as typeof tab)}
        style={{ marginBottom: space[4] }}
      />

      {tab === 'mapeo' ? (
        <>
          <p style={{ fontSize: font.base, color: color.ink2, marginBottom: space[3] }}>
            {resumen.total} filas · <b style={{ color: color.successInk }}>{resumen.validados} validadas</b> · {resumen.pendientes} pendientes
          </p>

          {msg && (
            <Notice tone="success" icon="✓" style={{ marginBottom: space[3] }}>
              {msg}
            </Notice>
          )}
          {error && (
            <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
              {error}
            </Notice>
          )}

          {cargando ? (
            <Esqueleto forma="tabla" filas={8} />
          ) : rows.length === 0 ? (
            <EmptyState icon="🔗" title="Todavía no hay mapeo" hint="Apretá “Proponer / actualizar mapeo” para poblarlo desde GN (STU) × TN (Stunned)." dashed />
          ) : (
            <TableWrap maxHeight={620}>
              <THead>
                <Tr>
                  <Th>SKU</Th>
                  <Th>GN product_id</Th>
                  <Th>TN product_id</Th>
                  <Th>TN variante (por talle)</Th>
                  <Th>Método</Th>
                  <Th align="center" width={90}>
                    Validado
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <Tr key={r.sku} style={r.validado ? { background: color.successBg } : undefined}>
                    <Td mono strong>
                      {r.sku}
                    </Td>
                    <Td style={{ color: color.mut }}>{r.gn_product_id ?? '—'}</Td>
                    <Td style={{ color: color.mut }}>{r.tn_product_id ?? '—'}</Td>
                    <Td strong>{r.tn_variant_id ?? '—'}</Td>
                    <Td>
                      <Badge m={r.match_metodo} />
                    </Td>
                    <Td align="center">
                      <input
                        type="checkbox"
                        checked={!!r.validado}
                        onChange={() => void toggleValidado(r)}
                        aria-label={`Validar el mapeo de ${r.sku}`}
                        style={{ accentColor: 'var(--mo-brand-solid)', cursor: 'pointer' }}
                      />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          )}
        </>
      ) : (
        <>
          <Notice tone="neutral" icon="ℹ" style={{ marginBottom: space[3] }}>
            Simulación de <b>solo lectura</b>: compara GN contra TN y no escribe nada hasta que toques Aplicar en una fila. El stock de GN es la suma de todas las
            ubicaciones (Depósito + Local); el sync pondría TN = GN.
          </Notice>

          {dryMsg && (
            <Notice tone="success" icon="✓" style={{ marginBottom: space[3] }}>
              {dryMsg}
            </Notice>
          )}
          {dryError && (
            <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
              {dryError}
            </Notice>
          )}

          {dryRows.length > 0 && (
            <TableWrap maxHeight={620}>
              <THead>
                <Tr>
                  <Th>Producto</Th>
                  <Th>SKU (talle)</Th>
                  <Th align="right">Stock GN</Th>
                  <Th align="right">Stock TN</Th>
                  <Th>Qué haría el sync</Th>
                </Tr>
              </THead>
              <TBody>
                {dryRows.map((r) => {
                  const cambia = r.delta != null && r.delta !== 0
                  return (
                    <Tr key={r.sku} style={cambia ? { background: color.warningBg } : undefined}>
                      <Td wrap strong>
                        {r.nombre ?? '—'}
                      </Td>
                      <Td mono>{r.sku}</Td>
                      <Td align="right" strong>
                        {r.gn}
                      </Td>
                      <Td align="right" style={{ color: color.mut }}>
                        {r.tn == null ? '—' : r.tn}
                      </Td>
                      <Td tall>
                        {r.tn == null ? (
                          <span style={{ color: color.mut2 }}>TN sin stock gestionado</span>
                        ) : cambia ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
                            <span style={{ color: color.warningInk, fontWeight: 600 }}>
                              TN {r.tn} → {r.gn}
                            </span>
                            {r.tnProductId && r.tnVariantId && (
                              <Button size="sm" variant="outline" tone="success" onClick={() => void aplicarUno(r)} loading={aplicando === r.sku} disabled={aplicando != null}>
                                {aplicando === r.sku ? 'Escribiendo…' : 'Aplicar'}
                              </Button>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: color.successInk }}>ya coincide</span>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </TableWrap>
          )}
        </>
      )}
    </>
  )
}
