'use client'

/**
 * Picker reusable de artículo de Gestión Nube (para Post-venta: fallas, y luego cambios/devoluciones).
 * Busca por SKU o nombre sobre el mirror Supabase de la marca, joineando `inventario` (sku/barcode/
 * variante) con `productos` (unit_cost) por product_id. Devuelve la variante elegida con su costo.
 * Lectura pura (sbFetch); no escribe nada. Dedupea las filas por variante (inventario trae una fila
 * por ubicación — Depósito/Local — y acá interesa la variante, con el stock total sumado).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CUENTAS } from '@/lib/cuentas'
import { sbFetch } from '@/lib/supabase/rest'
import type { Marca } from '@/lib/nav.generated'

export type ArticuloGN = {
  product_id: string
  size_id: string
  sku: string | null
  barcode: string | null
  product_name: string | null
  size_name: string | null
  available_quantity: number | null
  unit_cost: number | null
  retailer_price: number | null
}

type FilaInv = {
  product_id: number | string
  product_name: string | null
  size_id: number | string | null
  size_name: string | null
  sku: string | null
  barcode: string | null
  available_quantity: number | null
}
type FilaProd = { id: number | string; unit_cost: number | string | null; retailer_price: number | string | null }

export function BuscarArticuloGN({ marca, onSelect, mostrarCosto = true }: { marca: Marca; onSelect: (a: ArticuloGN) => void; mostrarCosto?: boolean }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ArticuloGN[]>([])
  const [cargando, setCargando] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buscar = useCallback(async (term: string) => {
    const t = term.trim()
    if (t.length < 2) { setRows([]); return }
    setCargando(true)
    try {
      // Limpio caracteres que romperían la sintaxis or()/ilike de PostgREST.
      const like = encodeURIComponent(t.replace(/[%,()*]/g, ' '))
      // Incluye barcode: el local carga escaneando (el escáner tipea el código + Enter).
      const inv = await sbFetch<FilaInv>(
        CUENTAS[marca],
        'inventario',
        `select=product_id,product_name,size_id,size_name,sku,barcode,available_quantity&or=(sku.ilike.*${like}*,product_name.ilike.*${like}*,barcode.ilike.*${like}*)&limit=60`,
      )
      // Dedupe por variante (product_id+size_id), sumando el stock de las ubicaciones.
      const porVariante = new Map<string, ArticuloGN>()
      for (const r of inv) {
        if (r.size_id == null) continue
        const key = `${r.product_id}-${r.size_id}`
        const prev = porVariante.get(key)
        const stock = r.available_quantity != null ? Number(r.available_quantity) : 0
        if (prev) {
          prev.available_quantity = (prev.available_quantity || 0) + stock
        } else {
          porVariante.set(key, {
            product_id: String(r.product_id),
            size_id: String(r.size_id),
            sku: r.sku ?? null,
            barcode: r.barcode ?? null,
            product_name: r.product_name ?? null,
            size_name: r.size_name ?? null,
            available_quantity: stock,
            unit_cost: null,
            retailer_price: null,
          })
        }
      }
      const arts = [...porVariante.values()]
      // Traigo el costo por producto (unit_cost vive en `productos`, no en `inventario`).
      const pids = [...new Set(arts.map((a) => a.product_id))]
      if (pids.length) {
        const prods = await sbFetch<FilaProd>(CUENTAS[marca], 'productos', `select=id,unit_cost,retailer_price&id=in.(${pids.join(',')})`)
        const costo = new Map<string, number | null>()
        const precio = new Map<string, number | null>()
        for (const p of prods) {
          costo.set(String(p.id), p.unit_cost == null ? null : Number(p.unit_cost))
          precio.set(String(p.id), p.retailer_price == null ? null : Number(p.retailer_price))
        }
        for (const a of arts) { a.unit_cost = costo.get(a.product_id) ?? null; a.retailer_price = precio.get(a.product_id) ?? null }
      }
      arts.sort((a, b) => (a.sku || '').localeCompare(b.sku || ''))
      setRows(arts.slice(0, 40))
    } catch {
      setRows([])
    } finally {
      setCargando(false)
    }
  }, [marca])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQ(v)
    setAbierto(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void buscar(v), 300)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const elegir = (a: ArticuloGN) => {
    onSelect(a)
    // Se limpia el buscador para poder agregar el siguiente producto de una (útil en Cambios).
    setQ('')
    setRows([])
    setAbierto(false)
  }

  const inp: React.CSSProperties = { fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #D1D5DB', outline: 'none', width: '100%' }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={inp}
        value={q}
        onChange={onChange}
        onFocus={() => q.trim().length >= 2 && setAbierto(true)}
        placeholder="Buscar o escanear: SKU, nombre o código de barras…"
      />
      {abierto && (cargando || rows.length > 0) && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', maxHeight: 280, overflowY: 'auto' }}>
          {cargando && <div style={{ fontSize: 12, color: '#6B7280', padding: '8px 10px' }}>Buscando…</div>}
          {!cargando && rows.map((a) => (
            <button
              key={`${a.product_id}-${a.size_id}`}
              onClick={() => elegir(a)}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid #F3F4F6', background: '#fff', padding: '7px 10px', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
                {a.product_name || '—'} <span style={{ color: '#6B7280', fontWeight: 400 }}>· {a.size_name || a.size_id}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace' }}>{a.sku || 's/sku'}</span>
                <span>stock {a.available_quantity ?? 0}</span>
                {mostrarCosto && <span>{a.unit_cost != null ? `costo $${a.unit_cost.toLocaleString('es-AR')}` : 'sin costo'}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
