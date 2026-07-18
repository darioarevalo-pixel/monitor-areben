/**
 * Lectura del inventario del Local (espejo Supabase) para el conteo. Port del
 * fetchAll de conteoInit (index.html:11374). Read-only; el stock fresco se trae con
 * el sync de GN aparte (dispararSyncStock).
 */

import { CUENTAS } from '../cuentas'
import type { Marca } from '../nav.generated'
import { fetchAll } from '../supabase/rest'
import type { FilaInvLocal } from './tipos'

export async function leerInventarioLocal(marca: Marca): Promise<FilaInvLocal[]> {
  return fetchAll<FilaInvLocal>(
    CUENTAS[marca],
    'inventario',
    'select=product_id,product_name,size_id,size_name,barcode,available_quantity,store_name&store_name=eq.Local',
  )
}
