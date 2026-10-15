'use client'

/**
 * ERP (key `erp`, sólo admin): lo que el monitor va construyendo para reemplazar a Gestión Nube.
 * Bruno, 12-oct-2026: todo el ERP en UNA sección que ven él y Darío mientras dura el desarrollo,
 * para poder probarlo y opinar sin que lo vea el equipo; cuando reemplace a GN se reparte en las
 * secciones de siempre. Cada parte es una pestaña.
 */

import { useState } from 'react'
import { SectionCard, Tabs, space } from '@/components/ui'
import { Facturacion } from './Facturacion'
import { StockPrenda, type PrendaPedida } from './StockPrenda'
import { DiferenciasDia } from './DiferenciasDia'
import { PedidosSinPagar } from './PedidosSinPagar'
import { PreciosProducto } from './PreciosProducto'

const PESTANIAS = [{ key: 'facturacion', label: 'Facturación' }, { key: 'stock', label: 'Stock' }, { key: 'diferencias', label: 'Diferencias del día' }, { key: 'pedidos-tn', label: 'Pedidos sin pagar' }, { key: 'precios', label: 'Precios' }]

export function Erp() {
  const [pestania, setPestania] = useState('facturacion')
  const [prenda, setPrenda] = useState<PrendaPedida | null>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="ERP" subtitle="En construcción: lo que va a reemplazar a Gestión Nube. Lo ven sólo los administradores.">
        <Tabs items={PESTANIAS} value={pestania} onChange={(k) => { setPrenda(null); setPestania(k) }} />
      </SectionCard>
      {pestania === 'facturacion' && <Facturacion />}
      {pestania === 'stock' && <StockPrenda key={prenda ? `${prenda.marca}/${prenda.producto}/${prenda.talle}` : 'buscar'} pedida={prenda} />}
      {pestania === 'pedidos-tn' && <PedidosSinPagar />}
      {pestania === 'precios' && <PreciosProducto />}
      {pestania === 'diferencias' && <DiferenciasDia abrirPrenda={(p) => { setPrenda(p); setPestania('stock') }} />}
    </div>
  )
}
