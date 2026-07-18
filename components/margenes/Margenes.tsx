'use client'

import { useMemo, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { useTnPromo } from '@/components/productos/useTnImages'
import {
  OBJETIVO_DEFAULT,
  buscar,
  colorDesfase,
  computarFilas,
  etiquetaDesfase,
  ordenar,
  resumen,
  type FilaMargen,
  type OrdenMargen,
} from '@/lib/margenes'
import { indexarTn } from '@/lib/tn'

/**
 * "📊 Margen por producto" (key `margenes`, BDI + Zattia) en Next — Tanda A #5.
 *
 * Port de renderMargenes/renderMargenesGrid (index.html:8510-8624): grilla de
 * tarjetas con foto (TN), markup/margen y desfase vs un objetivo editable (default
 * 130%), sobre los productos disponibles. Read-only. La lógica en `lib/margenes.ts`;
 * el índice de TN (fotos + promo) vía `useTnPromo`. Flip directo.
 */
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function Margenes() {
  const { datos, error } = useDatosMonitor()
  const { marca } = useSesion()
  const tnPromo = useTnPromo(marca)

  const [objetivo, setObjetivo] = useState(OBJETIVO_DEFAULT)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<OrdenMargen>('markup-desc')

  const productos = useMemo(() => datos?.allProductos ?? [], [datos])
  // Mientras TN no cargó, se usa un índice vacío: precio = minorista, sin foto (el
  // legacy también renderiza sin promo/foto hasta que llega el payload).
  const idx = useMemo(() => tnPromo ?? indexarTn([]), [tnPromo])
  const filas = useMemo(() => computarFilas(productos, idx, objetivo), [productos, idx, objetivo])
  const lista = useMemo(() => ordenar(buscar(filas, busqueda), orden), [filas, busqueda, orden])
  const res = useMemo(() => resumen(lista), [lista])

  if (error && !datos) {
    return <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>No se pudieron cargar los datos: {error}</div>
  }
  if (!datos) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📊 Margen por producto</div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
            Solo productos <b>disponibles</b> (con stock). <b>Markup</b> = recargo sobre el costo (objetivo actual <b>{objetivo}%</b>). Se calcula con el precio efectivo (promo si hay, si no minorista).
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#6B7280' }}>
            Objetivo %
            <input type="number" value={objetivo} step={5} onChange={(e) => setObjetivo(parseFloat(e.target.value) || OBJETIVO_DEFAULT)} style={{ width: 64, marginLeft: 4 }} />
          </label>
          <input type="text" placeholder="Buscar producto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ width: 160 }} />
          <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenMargen)}>
            <option value="markup-desc">Markup: mayor a menor (más desfasados primero)</option>
            <option value="markup-asc">Markup: menor a mayor</option>
            <option value="desfase-desc">Desfase vs objetivo: mayor primero</option>
            <option value="name">Nombre (A-Z)</option>
            <option value="pvp-desc">Precio: mayor a menor</option>
            <option value="stock-desc">Stock: mayor a menor</option>
          </select>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>
        {res ? (
          <>
            <b>{res.count}</b> disponibles · markup promedio <b>{res.prom.toFixed(0)}%</b> · mediana <b>{res.mediana.toFixed(0)}%</b> · <b style={{ color: '#DC2626' }}>{res.desfasados}</b> por encima del objetivo (+15pts)
          </>
        ) : null}
      </div>

      {lista.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#9CA3AF' }}>No hay productos disponibles que coincidan.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 12 }}>
          {lista.map((f) => (
            <TarjetaMargen key={f.p.id} f={f} />
          ))}
        </div>
      )}
    </div>
  )
}

function TarjetaMargen({ f }: { f: FilaMargen }) {
  const { p, foto, precio, esPromo, markup, margin, desfase } = f
  const { color, bg } = colorDesfase(desfase)
  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} loading="lazy" alt={p.name} style={{ width: '100%', height: 150, objectFit: 'cover', background: '#F3F4F6' }} />
      ) : (
        <div style={{ width: '100%', height: 150, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1', fontSize: 11 }}>sin foto</div>
      )}
      <div style={{ padding: '10px 11px' }}>
        <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, marginBottom: 6, minHeight: 31 }} title={p.name}>{p.name}</div>
        <div style={{ background: bg, borderRadius: 8, padding: '6px 9px', marginBottom: 7 }}>
          <div style={{ color, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>
            {markup.toFixed(0)}% <span style={{ fontSize: 11, fontWeight: 600 }}>markup</span>
          </div>
          <div style={{ color, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{etiquetaDesfase(desfase)}</div>
        </div>
        <Linea label="Margen s/ venta" valor={`${margin.toFixed(0)}%`} />
        <Linea label="Costo" valor={fmt(p.unit_cost)} />
        <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <span>Precio</span>
          {esPromo ? (
            <span style={{ color: '#374151', fontWeight: 500 }}>
              {fmt(precio)} <span style={{ color: '#16A34A', fontSize: 10, fontWeight: 600 }}>promo</span>{' '}
              <span style={{ color: '#9CA3AF', textDecoration: 'line-through', fontWeight: 400 }}>{fmt(p.retailer_price)}</span>
            </span>
          ) : (
            <span style={{ color: '#374151', fontWeight: 500 }}>{fmt(precio)}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', justifyContent: 'space-between', marginTop: 3, borderTop: '1px solid #F3F4F6', paddingTop: 4 }}>
          <span>Stock</span>
          <span style={{ color: '#374151', fontWeight: 500 }}>{p.stock}</span>
        </div>
      </div>
    </div>
  )
}

function Linea({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ color: '#374151', fontWeight: 500 }}>{valor}</span>
    </div>
  )
}
