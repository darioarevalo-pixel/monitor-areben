'use client'

/**
 * Picker reusable de artículo de Gestión Nube (para Post-venta: fallas, y luego cambios/devoluciones).
 * Busca por SKU o nombre sobre el mirror Supabase de la marca, joineando `inventario` (sku/barcode/
 * variante) con `productos` (precio de lista) por product_id. Lectura pura; no escribe nada.
 * Dedupea las filas por variante (inventario trae una fila por ubicación — Depósito/Local — y acá
 * interesa la variante, con el stock total sumado).
 *
 * 🔴 **`unit_cost` sólo viene cuando `mostrarCosto` es `true`, y sólo si el servidor lo autoriza.**
 * Quien lo necesite para GUARDARLO no lo va a encontrar acá: el costo de un canje o de una falla lo
 * resuelve el handler con la clave de servicio. Ver `api/_costos.js`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CUENTAS } from '@/lib/cuentas'
import { sbFetch } from '@/lib/supabase/rest'
import { traerCostos } from '@/lib/costos'
import type { Marca } from '@/lib/nav.datos'
import { color } from '@/components/ui'

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
type FilaProd = { id: number | string; retailer_price: number | string | null }

export function BuscarArticuloGN({
  marca,
  onSelect,
  mostrarCosto = true,
  inicial = '',
  placeholder = 'Buscar o escanear: SKU, nombre o código de barras…',
}: {
  marca: Marca
  onSelect: (a: ArticuloGN) => void
  mostrarCosto?: boolean
  /**
   * Lo que la persona ya escribió en otra parte, para no hacérselo escribir de nuevo: hoy lo usa
   * Faltantes, que llega desde el buscador de Atención con el nombre del producto en la mano.
   *
   * ⛔ Siembra el campo y dispara la búsqueda, **nunca elige solo**: una sola coincidencia no es una
   * confirmación, y acá lo que se elige es la VARIANTE (el talle), que el texto de entrada no dice.
   */
  inicial?: string
  placeholder?: string
}) {
  const [q, setQ] = useState(inicial)
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
      // El precio de lista por producto (vive en `productos`, no en `inventario`).
      //
      // 🔑 **Sin `unit_cost`**: el costo ya no sale de Supabase con la anon key (pieza B del
      // escalón 3 de la Fase S). `retailer_price` sí sigue por acá — no se cierra, no es plata
      // nuestra sino el precio que ve cualquiera que entre a la tienda.
      const pids = [...new Set(arts.map((a) => a.product_id))]
      if (pids.length) {
        const prods = await sbFetch<FilaProd>(CUENTAS[marca], 'productos', `select=id,retailer_price&id=in.(${pids.join(',')})`)
        const precio = new Map<string, number | null>()
        for (const p of prods) precio.set(String(p.id), p.retailer_price == null ? null : Number(p.retailer_price))
        for (const a of arts) a.retailer_price = precio.get(a.product_id) ?? null

        // El costo sólo se pide cuando se va a MOSTRAR, y el servidor decide si lo da: hoy el único
        // que lo pinta es Post-venta en modo admin. Las otras cuatro pantallas que usan este picker
        // lo pasan en `false` porque nunca lo mostraron — lo leían para estamparlo, y eso ahora lo
        // resuelve el servidor solo (`api/_canjes.js`, `api/_fallas.js`).
        if (mostrarCosto) {
          const costos = await traerCostos(marca, pids)
          for (const a of arts) a.unit_cost = costos[a.product_id] ?? null
        }
      }
      arts.sort((a, b) => (a.sku || '').localeCompare(b.sku || ''))
      setRows(arts.slice(0, 40))
    } catch {
      setRows([])
    } finally {
      setCargando(false)
    }
  }, [marca, mostrarCosto])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQ(v)
    setAbierto(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void buscar(v), 300)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // La búsqueda sembrada sale por un timer y no derecho en el efecto: `setCargando(true)` es
  // síncrono adentro de `buscar` y el lint del repo (`react-hooks/set-state-in-effect`) lo rechaza
  // —con razón: es un render encadenado—. Es el mismo camino que usa el tipeo.
  useEffect(() => {
    const t = inicial.trim()
    if (t.length < 2) return
    const id = setTimeout(() => {
      setAbierto(true)
      void buscar(t)
    }, 0)
    return () => clearTimeout(id)
  }, [inicial, buscar])

  const elegir = (a: ArticuloGN) => {
    onSelect(a)
    // Se limpia el buscador para poder agregar el siguiente producto de una (útil en Cambios).
    setQ('')
    setRows([])
    setAbierto(false)
  }

  const inp: React.CSSProperties = { fontSize: 13, padding: '6px 8px', borderRadius: 8, border: `1px solid ${color.line2}`, outline: 'none', width: '100%' }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={inp}
        value={q}
        onChange={onChange}
        onFocus={() => q.trim().length >= 2 && setAbierto(true)}
        placeholder={placeholder}
      />
      {abierto && (cargando || rows.length > 0) && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: `1px solid ${color.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', maxHeight: 280, overflowY: 'auto' }}>
          {cargando && <div style={{ fontSize: 12, color: color.mut, padding: '8px 10px' }}>Buscando…</div>}
          {!cargando && rows.map((a) => (
            <button
              key={`${a.product_id}-${a.size_id}`}
              onClick={() => elegir(a)}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${color.bg2}`, background: '#fff', padding: '7px 10px', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>
                {a.product_name || '—'} <span style={{ color: color.mut, fontWeight: 400 }}>· {a.size_name || a.size_id}</span>
              </div>
              <div style={{ fontSize: 11, color: color.mut, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
