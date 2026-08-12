'use client'

/**
 * Integraciones → sync TN↔GN de Stunned. Tres pestañas:
 *  - **Mapeo**: la tabla `sku_map` (store='stunned', vive en la base de Zattia). "Proponer" cruza
 *    las variantes STU de GN (`inventario`) con las de TN (`?variantes=1`) por SKU exacto (+ barcode)
 *    y sube propuestas SIN validar. El sync solo usa las validadas. "Validar verdes" valida de una
 *    todo lo confiable (match por SKU/código de barras).
 *  - **Stock (dry-run)**: compara, por cada variante validada, el stock de GN vs el de TN y muestra
 *    qué ESCRIBIRÍA el sync (TN = GN). Es de SOLO LECTURA: no escribe nada.
 *  - **Ventas (dry-run)**: las órdenes de la tienda de Stunned que HOY no llegan a Gestión Nube
 *    (alguien las carga a mano como si fueran del local), y qué venta crearía el sync por cada una.
 *    Con `ESCRITURA_HABILITADA` en true suma un botón "Importar" por fila, que crea la venta en GN.
 *
 * El dry-run es de solo lectura: lo único que escribe ventas es ese botón, de a una y con confirmación.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CUENTAS } from '@/lib/cuentas'
import { apiFetch } from '@/lib/api-fetch'
import { sbFetch } from '@/lib/supabase/rest'
import { guardarMapeo, leerMapeo, validarSkus } from '@/lib/sku-map/cliente'
import { proponerMapeo, type GnVar, type TnVar } from '@/lib/sku-map/proponer'
import type { MatchMetodo, SkuMapRow } from '@/lib/sku-map/tipos'
import { importarOrden, leerOrdenes, leerProcesados } from '@/lib/sync-tn/cliente'
import { TEXTO_MOTIVO, planificar } from '@/lib/sync-tn/core'
import { CFG_STUNNED, CORTE_STUNNED } from '@/lib/sync-tn/config'
import type { MotivoCola, PlanSync, PlanVenta } from '@/lib/sync-tn/tipos'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Badge as BadgeKit, Button, EmptyState, Esqueleto, Notice, TBody, THead, TableWrap, Tabs, Td, Th, Tr, color, font, space } from '@/components/ui'

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
const TN_STOCK_API = 'https://bdi-catalogo.vercel.app/api/tn-categorias' // acción 'stock'
const STORE = 'stunned' as const

/**
 * La importación de ventas a Gestión Nube nació APAGADA y se prendió el 11-ago-2026, con la fecha de
 * corte acordada (`lib/sync-tn/config.ts`) y el cliente de GN creado (`TN_IMPORT_CLIENT` en
 * `api/crear-venta.js`). Apagarla de nuevo es cambiar este `true`.
 *
 * 🔴 Prenderla NO importa nada sola: hace aparecer el botón "Importar" fila por fila, y cada uno pide
 * confirmación con el detalle de la venta. Es a propósito. La advertencia de duplicado AVISA, NO
 * BLOQUEA, y GN no permite anular una venta por API — una duplicada se limpia a mano en la web de GN.
 * Por eso no hay "importar todo" ni cron: el volumen es de 1-2 órdenes online por mes y conviene que
 * un humano mire el cartel amarillo antes de crear la venta.
 */
const ESCRITURA_HABILITADA = true

/** Tope del rango de fechas del dry-run de ventas: TN es lento y el endpoint corta a los 20 s. */
const RANGO_MAX_DIAS = 31

// Buenos Aires es UTC-3 fijo. `toISOString()` a secas da el día UTC, así que a la noche de acá
// proponía como "hasta" el día de MAÑANA. Se resta el offset antes de recortar.
const AR_OFFSET_MS = 3 * 3_600_000
const diaAr = (t: number) => new Date(t - AR_OFFSET_MS).toISOString().slice(0, 10)
const hoyIso = () => diaAr(Date.now())
const hace = (dias: number) => diaAr(Date.now() - dias * 86_400_000)
const diasEntre = (a: string, b: string) => Math.abs(Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000

const TONO_MOTIVO: Record<MotivoCola, 'success' | 'warning' | 'danger' | 'action' | 'neutral'> = {
  anterior_al_corte: 'neutral',
  ya_importada: 'success',
  en_revision: 'danger',
  ya_en_gn: 'success',
  cancelada: 'warning',
  no_paga: 'warning',
  sku_sin_mapeo: 'danger',
  cantidad_invalida: 'danger',
}

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
  const [tab, setTab] = useState<'mapeo' | 'stock' | 'ventas'>('mapeo')
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

  // Dry-run de ventas (TN → GN)
  const [vDesde, setVDesde] = useState(CORTE_STUNNED || hace(7))
  const [vHasta, setVHasta] = useState(hoyIso())
  const [vPlan, setVPlan] = useState<PlanSync | null>(null)
  const [vLoading, setVLoading] = useState(false)
  const [vMsg, setVMsg] = useState<string | null>(null)
  const [vError, setVError] = useState<string | null>(null)
  const [vImportando, setVImportando] = useState<string | null>(null) // número de orden que se está escribiendo

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
      const d = await apiFetch(`${AUDIT}?store=${STORE}&variantes=1&nc=${Date.now()}`)
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
      const d = await apiFetch(`${AUDIT}?store=${STORE}&variantes=1&refresh=1&nc=${Date.now()}`)
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
      const resp = await apiFetch(`${TN_STOCK_API}?store=${STORE}`, {
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

  // Dry-run de VENTAS: las órdenes de la tienda de Stunned contra lo que ya está en GN.
  // Junta las tres fuentes y se las da al motor puro (lib/sync-tn/core.ts), que decide todo.
  const correrDryRunVentas = useCallback(async () => {
    if (diasEntre(vDesde, vHasta) > RANGO_MAX_DIAS) {
      setVError(`El rango no puede pasar de ${RANGO_MAX_DIAS} días: Tienda Nube es lenta y el endpoint corta.`)
      return
    }
    setVLoading(true)
    setVError(null)
    setVMsg(null)
    try {
      const [tn, mapa, procesados] = await Promise.all([leerOrdenes(vDesde, vHasta), leerMapeo(STORE, { validado: true }), leerProcesados(STORE)])
      const plan = planificar({ ordenes: tn.ordenes, ventasGn: tn.ventasGn, mapa, procesados, cfg: CFG_STUNNED })
      setVPlan(plan)
      const avisos: string[] = [
        `${plan.resumen.ordenes} órdenes en el rango · ${plan.resumen.a_crear} se importarían (${plan.resumen.unidades} u.) · ${plan.cola.length} en cola`,
      ]
      // Lo que se dejó afuera se DICE. Un tope silencioso se lee como "no había más".
      if (tn.truncado) avisos.push(`⚠ Hay ${tn.total_en_rango} órdenes en el rango y se leyeron las primeras: achicá el rango.`)
      if (tn.fallidas) avisos.push(`⚠ ${tn.fallidas} órdenes no se pudieron leer de Tienda Nube.`)
      if (plan.resumen.con_advertencia) avisos.push(`⚠ ${plan.resumen.con_advertencia} ya podrían estar cargadas a mano en GN.`)
      avisos.push('Simulación: NO se escribió nada.')
      setVMsg(avisos.join(' · '))
    } catch (e) {
      setVError((e as Error).message)
    } finally {
      setVLoading(false)
    }
  }, [vDesde, vHasta])

  // La ÚNICA escritura del sync de ventas: crea la venta en GN por UNA orden. De a una y con
  // confirmación, porque GN no anula ventas por API.
  const importarUna = useCallback(async (p: PlanVenta) => {
    const dup = p.advertencias.find((a) => a.tipo === 'duplicado_manual')
    const detalle = [
      `Importar la orden #${p.numero} a Gestión Nube?`,
      '',
      `Fecha: ${p.dia}${p.cliente ? ` · ${p.cliente}` : ''}`,
      ...p.lineas.map((l) => `  ${l.sku} ×${l.quantity} — ${l.unit_price.toLocaleString('es-AR')}`),
      p.descuento ? `Descuento: ${p.descuento.toLocaleString('es-AR')}` : '',
      `Descuenta ${p.unidades} u. del Local.`,
      dup ? `\n⚠ OJO: puede que ya esté cargada a mano en GN (venta ${dup.gn_number ?? dup.gn_venta_id} del ${dup.date_sale}). Gestión Nube NO permite anular por API.` : '',
    ]
      .filter(Boolean)
      .join('\n')
    if (typeof window !== 'undefined' && !window.confirm(detalle)) return
    setVImportando(p.numero)
    setVError(null)
    try {
      const r = await importarOrden(p)
      setVPlan((pl) => (pl ? { ...pl, crear: pl.crear.filter((x) => x.numero !== p.numero) } : pl))
      setVMsg(`✓ Orden #${p.numero} importada: venta ${r.venta?.number ?? r.venta?.id ?? ''} en Gestión Nube.`)
    } catch (e) {
      setVError((e as Error).message)
    } finally {
      setVImportando(null)
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
        ) : tab === 'stock' ? (
          <Button variant="solid" tone="brand" onClick={() => void correrDryRun()} loading={dryLoading}>
            {dryLoading ? 'Comparando…' : 'Correr dry-run'}
          </Button>
        ) : (
          <>
            <label style={{ fontSize: font.sm, color: color.ink2, display: 'inline-flex', alignItems: 'center', gap: space[2] }}>
              Desde
              <input className="mo-input" type="date" value={vDesde} onChange={(e) => setVDesde(e.target.value)} style={{ width: 150 }} />
            </label>
            <label style={{ fontSize: font.sm, color: color.ink2, display: 'inline-flex', alignItems: 'center', gap: space[2] }}>
              Hasta
              <input className="mo-input" type="date" value={vHasta} onChange={(e) => setVHasta(e.target.value)} style={{ width: 150 }} />
            </label>
            <Button variant="solid" tone="brand" onClick={() => void correrDryRunVentas()} loading={vLoading}>
              {vLoading ? 'Leyendo Tienda Nube…' : 'Correr dry-run'}
            </Button>
          </>
        )}
      </HeaderAcciones>

      <Tabs
        items={[
          { key: 'mapeo', label: 'Mapeo' },
          { key: 'stock', label: 'Stock (dry-run)' },
          { key: 'ventas', label: 'Ventas (dry-run)' },
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
      ) : tab === 'stock' ? (
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
      ) : (
        <>
          <Notice tone="neutral" icon="ℹ" style={{ marginBottom: space[3] }}>
            Simulación de <b>solo lectura</b>: muestra qué ventas crearía en Gestión Nube por las órdenes de la tienda de Stunned. <b>No escribe nada.</b>
            {CORTE_STUNNED ? (
              <>
                {' '}
                La carga manual de las ventas online de Stunned se frena a partir del <b>{CORTE_STUNNED}</b>.
              </>
            ) : (
              <>
                {' '}
                <b>Falta acordar la fecha de corte</b> (desde cuándo se hace cargo el sync y quien las carga a mano deja de hacerlo): hasta entonces no se propone
                importar nada.
              </>
            )}
          </Notice>

          {vMsg && (
            <Notice tone="success" icon="✓" style={{ marginBottom: space[3] }}>
              {vMsg}
            </Notice>
          )}
          {vError && (
            <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
              {vError}
            </Notice>
          )}

          {vLoading ? (
            <Esqueleto forma="tabla" filas={6} />
          ) : !vPlan ? (
            <EmptyState icon="🧾" title="Elegí el rango y tocá “Correr dry-run”" hint="Se leen las órdenes de stunned.com.ar y las ventas de Gestión Nube del mismo rango." dashed />
          ) : (
            <>
              <p style={{ fontSize: font.base, color: color.ink2, margin: `0 0 ${space[2]} 0` }}>
                <b>Se crearían ({vPlan.crear.length})</b>
              </p>
              {vPlan.crear.length === 0 ? (
                <EmptyState icon="✅" title="No hay ninguna orden para importar en este rango" dashed />
              ) : (
                <TableWrap maxHeight={480}>
                  <THead>
                    <Tr>
                      <Th>Orden</Th>
                      <Th>Fecha</Th>
                      <Th>Cliente</Th>
                      <Th>Ítems</Th>
                      <Th align="right">Total TN</Th>
                      <Th align="right">Descuento</Th>
                      <Th>Qué haría el sync</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {vPlan.crear.map((p) => {
                      const dup = p.advertencias.find((a) => a.tipo === 'duplicado_manual')
                      return (
                        <Tr key={p.numero} style={dup ? { background: color.warningBg } : undefined}>
                          <Td mono strong>
                            #{p.numero}
                          </Td>
                          <Td style={{ color: color.mut }}>{p.dia}</Td>
                          <Td wrap>{p.cliente ?? '—'}</Td>
                          <Td mono style={{ fontSize: font.sm }}>
                            {p.lineas.map((l) => `${l.sku} ×${l.quantity}`).join(' · ')}
                          </Td>
                          <Td align="right" strong>
                            {p.total_tn == null ? '—' : p.total_tn.toLocaleString('es-AR')}
                          </Td>
                          <Td align="right" style={{ color: p.descuento ? color.warningInk : color.mut2 }}>
                            {p.descuento ? p.descuento.toLocaleString('es-AR') : '—'}
                          </Td>
                          <Td tall wrap>
                            <span style={{ color: color.ink2 }}>
                              Venta en GN · Local · canal Tienda Nube · descuenta {p.unidades} u.
                            </span>
                            {ESCRITURA_HABILITADA && (
                              <span style={{ display: 'inline-flex', marginLeft: space[3] }}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  tone={dup ? 'warning' : 'success'}
                                  onClick={() => void importarUna(p)}
                                  loading={vImportando === p.numero}
                                  disabled={vImportando != null}
                                >
                                  {vImportando === p.numero ? 'Creando…' : 'Importar'}
                                </Button>
                              </span>
                            )}
                            {dup && (
                              <div style={{ color: color.warningInk, fontWeight: 600, marginTop: space[1] }}>
                                ⚠ Puede que ya esté cargada a mano: venta {dup.gn_number ? `N° ${dup.gn_number}` : `id ${dup.gn_venta_id}`}
                                {dup.canal ? ` (${dup.canal})` : ''} del {dup.date_sale ?? '—'}. Mirala en GN antes de importar.
                              </div>
                            )}
                          </Td>
                        </Tr>
                      )
                    })}
                  </TBody>
                </TableWrap>
              )}

              <p style={{ fontSize: font.base, color: color.ink2, margin: `${space[4]} 0 ${space[2]} 0` }}>
                <b>En cola ({vPlan.cola.length})</b> — qué queda afuera y por qué
              </p>
              {vPlan.cola.length === 0 ? (
                <EmptyState icon="—" title="No quedó ninguna orden afuera" dashed />
              ) : (
                <TableWrap maxHeight={480}>
                  <THead>
                    <Tr>
                      <Th>Orden</Th>
                      <Th>Fecha</Th>
                      <Th>Cliente</Th>
                      <Th>Motivo</Th>
                      <Th>Detalle</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {vPlan.cola.map((c) => (
                      <Tr key={c.numero}>
                        <Td mono strong>
                          #{c.numero}
                        </Td>
                        <Td style={{ color: color.mut }}>{c.dia}</Td>
                        <Td wrap>{c.cliente ?? '—'}</Td>
                        <Td>
                          <BadgeKit tone={TONO_MOTIVO[c.motivo]} subtle>
                            {TEXTO_MOTIVO[c.motivo]}
                          </BadgeKit>
                        </Td>
                        <Td wrap style={{ color: color.mut }}>
                          {c.detalle ?? '—'}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </TableWrap>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}
