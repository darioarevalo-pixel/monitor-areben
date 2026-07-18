/**
 * Baja los datos del chequeo de exhibición: inventario del Local con stock (Supabase)
 * cruzado con el catálogo TN (imagen + categorías + tnId por producto). Read-only.
 * Port de exhibCargarDatos (index.html:7599-7633).
 */

import { CUENTAS, type Cuenta } from '@/lib/cuentas'
import { fetchAll } from '@/lib/supabase/rest'
import { indexarTn, matchTn, type TnProducto } from '@/lib/tn'
import type { Marca } from '@/lib/nav'
import type { Producto } from '@/lib/etl/tipos'
import { construirItems, ordenarCats, type FilaInvExhib, type ProdMap } from './core'
import type { ExhibErrores, ExhibItem } from './tipos'

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

export type DatosExhib = { items: ExhibItem[]; cats: string[] }

export async function cargarDatosExhib(marca: Marca, productos: Producto[], errores: ExhibErrores): Promise<DatosExhib> {
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
  const idx = indexarTn(tnProducts)

  const prodMap: ProdMap = {}
  productos.forEach((p) => {
    const tn = matchTn(p, idx)
    prodMap[String(p.id)] = { img: (tn && tn.images && tn.images[0]) || null, tnCats: (tn && tn.categories) || [], tnId: (tn && tn.id) || null }
  })

  const items = construirItems(inv, prodMap, errores)
  return { items, cats: ordenarCats(items) }
}
