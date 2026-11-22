'use client'

/**
 * «Facturar» desde la Caja (Bruno, 22-nov: «crear cliente, asociar la factura al cliente y emitirle la factura, todo desde el
 * POS»). Sale de la tarjeta de la última venta y de Ventas, sólo para una venta que ya está en Areben Gestión, y abre la MISMA
 * factura a pedido de Areben Gestión › Ventas › Facturación (`FacturaCaja`) con esa venta cargada: ⛔ una copia.
 * 🔑 Primero se vende, después se factura (Bruno, 22-nov): la factura sale de lo ya cobrado. Maqueta aprobada:
 * https://claude.ai/artifact/R6Pgxdw9h62d7E6QvzYsV8
 */

import { Modal } from '@/components/ui'
import { FacturaCaja } from '@/components/erp/FacturaCaja'
import { ProveedorLineaErp, type LineaErp } from '@/lib/erp/linea-erp'
import { marcaDeVentaErp } from '@/lib/caja/corte-caja.core.js'
import type { MarcaErp } from '@/lib/erp/cliente'
import type { Venta } from '@/lib/caja/cliente'

/** La línea de la venta (Zattia y Stunned comparten la Caja): la misma regla que la anota en Areben Gestión. */
function lineaDe(store: MarcaErp, venta: Venta): LineaErp {
  if (store === 'bdi') return ''
  try {
    // La fila guarda la línea de cada renglón aunque el tipo de la pantalla ⛔ la nombre.
    const l = marcaDeVentaErp({ ...venta, store } as unknown as Parameters<typeof marcaDeVentaErp>[0])
    return l === 'stunned' ? 'stunned' : 'zattia'
  } catch {
    return 'zattia'
  }
}

export function FacturarVenta({ store, venta, onCerrar }: { store: MarcaErp; venta: Venta; onCerrar: () => void }) {
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Facturar la venta" ancho="xl">
      <ProveedorLineaErp value={lineaDe(store, venta)}>
        <FacturaCaja cajaInicial={venta.id} store={store} />
      </ProveedorLineaErp>
    </Modal>
  )
}
