'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { asegurarTnPromo } from '@/components/productos/useTnImages'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { indexarTn, type IndiceTn } from '@/lib/tn'
import { variantesSinStockVisibles } from '@/lib/tncat/variantes-sin-stock'
import type { Marca } from '@/lib/nav.generated'

/**
 * Variantes sin stock (visibles en la tienda) — card read-only (tncat). Lista las
 * variantes en stock 0 (GN) cuyo producto sigue PUBLICADO en TiendaNube, agrupadas por
 * producto, para gestionarlas a mano: TiendaNube NO permite ocultar una variante suelta
 * por API (solo el producto entero). Las de un producto entero agotado se marcan para
 * derivar a "🙈 Ocultar agotados".
 */
export function VariantesSinStockCard({ marca }: { marca: Marca }) {
  const { datos } = useDatosMonitor()
  const [idx, setIdx] = useState<IndiceTn | null>(null)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    let vivo = true
    asegurarTnPromo(marca)
      .then((i) => vivo && setIdx(i))
      .catch(() => vivo && setIdx(indexarTn([])))
    return () => {
      vivo = false
    }
  }, [marca])

  const grupos = useMemo(
    () => (idx && datos ? variantesSinStockVisibles(datos.allProductos, datos.allVariantes, idx) : []),
    [idx, datos],
  )
  const cargando = !idx || !datos

  const q = busqueda.trim().toLowerCase()
  const lista = q
    ? grupos.filter(
        (g) =>
          g.nombre.toLowerCase().includes(q) ||
          (g.sku || '').toLowerCase().includes(q) ||
          g.variantes.some((v) => v.label.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q)),
      )
    : grupos
  const totalVar = lista.reduce((n, g) => n + g.variantes.length, 0)

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>📭 Variantes sin stock (visibles en la tienda)</div>
        <InfoPopover titulo="Variantes sin stock visibles">
          Variantes en stock 0 (según Gestión Nube) cuyo producto sigue <b>publicado</b> en TiendaNube. TiendaNube
          no deja ocultar una variante suelta por API, así que esto es una <b>lista para gestionarlas a mano</b> en el
          admin. Si el producto está <b>entero agotado</b>, conviene despublicarlo completo desde “🙈 Ocultar agotados”.
        </InfoPopover>
      </div>

      {cargando ? (
        <div style={{ color: '#9CA3AF', padding: '10px 2px' }}>Cargando productos y tienda…</div>
      ) : grupos.length === 0 ? (
        <div style={{ color: '#059669', fontSize: 14, padding: '10px 2px' }}>
          ✅ No hay variantes sin stock visibles en la tienda.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="🔎 Buscar producto o SKU…"
              style={{ flex: 1, minWidth: 200, padding: '7px 9px', border: '1px solid #D1D5DB', borderRadius: 7 }}
            />
            <span style={{ fontSize: 13, color: '#6B7280' }}>
              {lista.length} producto(s) · {totalVar} variante(s)
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lista.map((g) => (
              <div key={String(g.tnId)} style={{ border: '1px solid #E5E7EB', borderRadius: 9, padding: '9px 12px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{g.nombre}</div>
                  {g.sku ? <span style={{ fontSize: 12, color: '#9CA3AF' }}>SKU {g.sku}</span> : null}
                  {g.enteroAgotado ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '2px 8px' }}>
                      producto entero agotado — usá 🙈 Ocultar agotados
                    </span>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {g.variantes.map((v) => (
                    <span
                      key={v.vid}
                      title={`SKU ${v.sku}`}
                      style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '2px 8px' }}
                    >
                      {v.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
