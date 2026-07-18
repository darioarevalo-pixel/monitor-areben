/**
 * Tipos de Verificación de ventas: cruza los pedidos cancelados en TiendaNube con las
 * ventas activas en Gestión Nube (el cruce lo hace server-side el endpoint
 * `tiendanube-audit?verificar_ventas=1`). El cliente solo muestra el resultado y
 * lleva un checklist de "ya anuladas a mano en GN" (KV, kind `verifventas`). Port de
 * index.html:11120-11201.
 */

/** Un pedido cancelado en TN que sigue ACTIVO en GN (hay que anularlo a mano). */
export type Discrepancia = {
  tn_order: string | number
  gn_number?: string | number
  gn_id?: string | number
  date_sale?: string
  client_name?: string
  total_price?: number
}

export type VvtaData = {
  resumen?: { tn_cancelados?: number }
  discrepancias?: Discrepancia[]
  tn_debug?: { status?: number }
  error?: string
}

/** Una entrada del checklist de resueltas. */
export type ResueltaEntry = { resuelto: boolean; por: string; fecha: string; mes: string }
export type Resueltas = Record<string, ResueltaEntry>
