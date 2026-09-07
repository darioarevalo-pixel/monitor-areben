/**
 * Baja los datos del chequeo de exhibición: inventario del Local con stock (Supabase)
 * y el catálogo TN crudo (imagen + categorías + tnId + precios por producto). Read-only.
 * Port de exhibCargarDatos (index.html:7599-7633).
 *
 * 🔴 **Acá NO se cruza contra el catálogo de Gestión Nube, y eso es el arreglo del 7-sep-2026.**
 * Antes esta función recibía `productos` (el `allProductos` del ETL) y devolvía los ítems ya
 * cruzados. El problema no era el cruce sino **cuándo** se hacía: el ETL publica asincrónico, así
 * que la pantalla montaba con `productos` en `[]`, se bajaba todo contra una lista vacía y los
 * 870 ítems del Local quedaban en «(Sin categoría)» —el desplegable de categorías con **dos**
 * opciones— para siempre, porque nada volvía a cruzar cuando el ETL llegaba. Se veía en el
 * teléfono, que es donde se entra directo a la pantalla y donde el ETL tarda más.
 * ⇒ **Lo que se baja (lento, una vez por marca) y lo que se cruza (barato, cada vez que cambia
 * una de las dos puntas) son dos cosas distintas y viven separadas.**
 */

import { CUENTAS, type Cuenta } from '@/lib/cuentas'
import { fetchAll } from '@/lib/supabase/rest'
import type { TnProducto } from '@/lib/tn'
import type { Marca } from '@/lib/nav'
import type { FilaInvExhib } from './core'

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

/** Lo bajado, sin cruzar: inventario del Local con stock + catálogo TN crudo. */
export type CrudosExhib = { inv: FilaInvExhib[]; tnProducts: TnProducto[] }

export async function bajarExhib(marca: Marca): Promise<CrudosExhib> {
  const cuenta: Cuenta = CUENTAS[marca]

  // fetchAll pagina (el Local con stock supera las 1000 filas de una sola página).
  const inv = await fetchAll<FilaInvExhib>(cuenta, 'inventario', 'select=product_id,product_name,size_name,sku,barcode,available_quantity&store_name=eq.Local&available_quantity=gt.0')

  let tnProducts: TnProducto[] = []
  try {
    const r = await fetch(`${AUDIT}?store=${marca}`)
    const d = await r.json()
    tnProducts = d.products || []
  } catch {
    tnProducts = []
  }

  return { inv, tnProducts }
}
