'use client'

/**
 * ERP (key `erp`, sólo admin): lo que el monitor va construyendo para reemplazar a Gestión Nube.
 * Bruno, 12-oct-2026: todo el ERP en UNA sección que ven él y Darío mientras dura el desarrollo,
 * para poder probarlo y opinar sin que lo vea el equipo; cuando reemplace a GN se reparte en las
 * secciones de siempre. Cada parte es una pestaña.
 */

import { useState } from 'react'
import { SectionCard, Tabs, space } from '@/components/ui'
import { CambioCaja } from './CambioCaja'
import { FacturaCaja } from './FacturaCaja'
import { Facturacion } from './Facturacion'
import { StockPrenda, type PrendaPedida } from './StockPrenda'
import { DiferenciasDia } from './DiferenciasDia'
import { ConciliacionDia } from './ConciliacionDia'
import { PedidosSinPagar } from './PedidosSinPagar'
import { PreciosProducto } from './PreciosProducto'
import { ReglasComerciales } from './ReglasComerciales'
import { RutasCobro } from './RutasCobro'
import { VentasPropias } from './VentasPropias'

/** La Caja del ERP: lo que el local todavía hace en GN (el cambio y la factura a pedido). */
const EN_CAJA = [{ key: 'cambio', label: 'Cambio' }, { key: 'factura', label: 'Factura' }]
const PESTANIAS = [{ key: 'facturacion', label: 'Facturación' }, { key: 'stock', label: 'Stock' }, { key: 'diferencias', label: 'Diferencias del día' }, { key: 'conciliacion', label: 'Conciliación' }, { key: 'pedidos-tn', label: 'Pedidos sin pagar' }, { key: 'ventas', label: 'Ventas' }, { key: 'caja', label: 'Caja' }, { key: 'precios', label: 'Precios' }, { key: 'reglas', label: 'Reglas' }, { key: 'cuentas', label: 'Cuentas de cobro' }]

export function Erp() {
  const [pestania, setPestania] = useState('facturacion')
  const [prenda, setPrenda] = useState<PrendaPedida | null>(null)
  const [enCaja, setEnCaja] = useState('cambio')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="ERP" subtitle="En construcción: lo que va a reemplazar a Gestión Nube. Lo ven sólo los administradores.">
        <Tabs items={PESTANIAS} value={pestania} onChange={(k) => { setPrenda(null); setPestania(k) }} />
      </SectionCard>
      {pestania === 'facturacion' && <Facturacion />}
      {pestania === 'stock' && <StockPrenda key={prenda ? `${prenda.marca}/${prenda.producto}/${prenda.talle}` : 'buscar'} pedida={prenda} />}
      {pestania === 'pedidos-tn' && <PedidosSinPagar />}
      {pestania === 'precios' && <PreciosProducto />}
      {pestania === 'reglas' && <ReglasComerciales />}
      {pestania === 'cuentas' && <RutasCobro />}
      {pestania === 'diferencias' && <DiferenciasDia abrirPrenda={(p) => { setPrenda(p); setPestania('stock') }} />}
      {pestania === 'conciliacion' && <ConciliacionDia abrirPrenda={(p) => { setPrenda(p); setPestania('stock') }} />}
      {pestania === 'ventas' && <VentasPropias />}
      {pestania === 'caja' && (
        <>
          <Tabs items={EN_CAJA} value={enCaja} onChange={setEnCaja} />
          {enCaja === 'cambio' ? <CambioCaja /> : <FacturaCaja />}
        </>
      )}
    </div>
  )
}
