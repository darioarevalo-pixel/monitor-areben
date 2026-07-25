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
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  BuscarInput,
  DatosGate,
  EmptyState,
  FilterBar,
  NumberField,
  Select,
  color,
  font,
  space,
  useFiltroUrl,
} from '@/components/ui'

/**
 * "📊 Margen por producto" (key `margenes`, BDI + Zattia).
 *
 * Grilla de tarjetas con foto (TN), markup/margen y desfase contra un objetivo editable
 * (default 130%), sobre los productos disponibles. Read-only: la lógica vive en
 * `lib/margenes.ts` y el índice de TN (fotos + promo) en `useTnPromo`.
 *
 * Rediseño jul-2026 (patrón Analítica): el resumen —cuántos productos, markup promedio,
 * mediana, cuántos desfasados— era una línea de texto gris de 12px arriba de la grilla;
 * ahora es la primera lectura de la pantalla. El buscador queda en la URL. La grilla se
 * achica sola en el teléfono.
 */
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function Margenes() {
  const { datos, error, progreso, origen } = useDatosMonitor()
  const { marca } = useSesion()
  const tnPromo = useTnPromo(marca)

  const [objetivo, setObjetivo] = useState(OBJETIVO_DEFAULT)
  const [busqueda, setBusqueda] = useFiltroUrl<string>('q', '')
  const [orden, setOrden] = useFiltroUrl<OrdenMargen>('orden', 'markup-desc')

  const productos = useMemo(() => datos?.allProductos ?? [], [datos])
  // Mientras TN no cargó se usa un índice vacío: precio = minorista, sin foto.
  const idx = useMemo(() => tnPromo ?? indexarTn([]), [tnPromo])
  const filas = useMemo(() => computarFilas(productos, idx, objetivo), [productos, idx, objetivo])
  const lista = useMemo(() => ordenar(buscar(filas, busqueda), orden), [filas, busqueda, orden])
  const res = useMemo(() => resumen(lista), [lista])

  return (
    <>
      <HeaderAcciones>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.mut }}>
          Objetivo
          <NumberField value={objetivo} onChange={(n) => setObjetivo(n || OBJETIVO_DEFAULT)} step={5} min={0} width={84} />
          <span>%</span>
        </label>
      </HeaderAcciones>

      <DatosGate datos={datos} error={error} progreso={progreso} origen={origen} esqueleto="tarjetas">
        {() => (
          <>
            {res && (
              <div style={{ display: 'flex', gap: space[5], flexWrap: 'wrap', marginBottom: space[4] }}>
                <Dato label="Disponibles" valor={res.count.toLocaleString('es-AR')} />
                <Dato label="Markup promedio" valor={`${res.prom.toFixed(0)}%`} />
                <Dato label="Mediana" valor={`${res.mediana.toFixed(0)}%`} />
                <Dato
                  label={`Por encima del objetivo (+15pts)`}
                  valor={res.desfasados.toLocaleString('es-AR')}
                  tono={res.desfasados > 0 ? color.danger : undefined}
                />
              </div>
            )}

            <FilterBar>
              <BuscarInput value={busqueda} onChange={setBusqueda} placeholder="Buscar producto…" />
              <Select value={orden} onChange={(e) => setOrden(e.target.value as OrdenMargen)} style={{ width: 260 }} aria-label="Orden">
                <option value="markup-desc">Markup: mayor a menor</option>
                <option value="markup-asc">Markup: menor a mayor</option>
                <option value="desfase-desc">Desfase vs objetivo: mayor primero</option>
                <option value="name">Nombre (A-Z)</option>
                <option value="pvp-desc">Precio: mayor a menor</option>
                <option value="stock-desc">Stock: mayor a menor</option>
              </Select>
            </FilterBar>

            {lista.length === 0 ? (
              <EmptyState
                icon="🔍"
                title="No hay productos disponibles que coincidan"
                hint={busqueda ? `Nada para "${busqueda}". Probá con menos palabras.` : 'Puede que no haya stock disponible en esta marca.'}
                dashed
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: space[3] }}>
                {lista.map((f) => (
                  <TarjetaMargen key={f.p.id} f={f} />
                ))}
              </div>
            )}
          </>
        )}
      </DatosGate>
    </>
  )
}

/** Un número del resumen, con su etiqueta arriba. Reemplaza la línea de texto corrida. */
function Dato({ label, valor, tono }: { label: string; valor: string; tono?: string }) {
  return (
    <div>
      <div style={{ fontSize: font.xs, color: color.mut, letterSpacing: 0, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: font.xl, fontWeight: 700, color: tono ?? color.ink, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
    </div>
  )
}

function TarjetaMargen({ f }: { f: FilaMargen }) {
  const { p, foto, precio, esPromo, markup, margin, desfase } = f
  const { color: c, bg } = colorDesfase(desfase)
  return (
    <div className="mo-card mo-card--interactive" style={{ padding: 0, overflow: 'hidden' }}>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} loading="lazy" alt={p.name} style={{ width: '100%', height: 150, objectFit: 'cover', background: color.bg2, display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: 150, background: color.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.mut2, fontSize: font.xs }}>
          sin foto
        </div>
      )}
      <div style={{ padding: '10px 11px' }}>
        <div style={{ fontWeight: 600, fontSize: font.sm, lineHeight: 1.3, marginBottom: 6, minHeight: 31, color: color.ink }} title={p.name}>
          {p.name}
        </div>
        <div style={{ background: bg, borderRadius: 8, padding: '6px 9px', marginBottom: 7 }}>
          <div style={{ color: c, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>
            {markup.toFixed(0)}% <span style={{ fontSize: font.xs, fontWeight: 600 }}>markup</span>
          </div>
          <div style={{ color: c, fontSize: font.xs, fontWeight: 600, marginTop: 2 }}>{etiquetaDesfase(desfase)}</div>
        </div>
        <Linea label="Margen s/ venta" valor={`${margin.toFixed(0)}%`} />
        <Linea label="Costo" valor={fmt(p.unit_cost)} />
        <div style={{ fontSize: font.xs, color: color.mut, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <span>Precio</span>
          {esPromo ? (
            <span style={{ color: color.ink2, fontWeight: 500 }}>
              {fmt(precio)} <span style={{ color: color.success, fontSize: 10, fontWeight: 600 }}>promo</span>{' '}
              <span style={{ color: color.mut2, textDecoration: 'line-through', fontWeight: 400 }}>{fmt(p.retailer_price)}</span>
            </span>
          ) : (
            <span style={{ color: color.ink2, fontWeight: 500 }}>{fmt(precio)}</span>
          )}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut, display: 'flex', justifyContent: 'space-between', marginTop: 3, borderTop: `1px solid ${color.line}`, paddingTop: 4 }}>
          <span>Stock</span>
          <span style={{ color: color.ink2, fontWeight: 500 }}>{p.stock}</span>
        </div>
      </div>
    </div>
  )
}

function Linea({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ fontSize: font.xs, color: color.mut, display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ color: color.ink2, fontWeight: 500 }}>{valor}</span>
    </div>
  )
}
