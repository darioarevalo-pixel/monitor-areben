/**
 * La Falla del POS (Bruno, 25-nov): la MISMA venta, en otro estado. Se escanea normal, el total da $0 y «Registrar falla» carga
 * cada renglón como una falla del local, por el MISMO camino que «+Cargar falla» de Post-venta: `crearFalla` (el ledger) y
 * `registrarVentaGN` (en una línea del ERP, el ajuste «Fallado»; antes del corte, la venta técnica a $0 de GN).
 * «la de falla tiene que usarse la estructura actual de la venta, pero se usa escaner y se cobra pasa con $0. y va sin comprobante sin nada»
 *
 * 🔴 **De dónde se descuenta lo decide el STOCK, ⛔ la pantalla** (`docs/secciones/fallas.md`): `ubicacionDeFalla` con el stock
 * partido que trajo el escaneo, ⛔ `'local'` fijo. La sección (Local) decide sólo cuando alcanza en los dos o en ninguno.
 *
 * 🔴 **Si `crearFalla` anduvo y `registrarVentaGN` no, la falla quedó cargada SIN descontar**: reintentar con `crearFalla`
 * crearía otra igual. Por eso el renglón guarda `fallaId` y el reintento sólo descuenta.
 */

import { crearFalla, registrarVentaGN, type CtxVentaFalla } from '@/lib/postventa/fallas/cliente'
import { ubicacionDeFalla } from '@/lib/postventa/fallas/core'
import type { FallaInput, FallaUbicacion } from '@/lib/postventa/fallas/tipos'
import type { Marca } from '@/lib/nav.datos'
import type { Stock, Variante } from './cliente'

/** Lo que hace falta de un renglón del POS para cargarlo como falla. `fallaId`: ya está en el ledger (falta descontar). */
export type RenglonFalla = { variante: Variante; stock: Stock; cantidad: number; precioLista?: number | null; precio?: number | null; fallaId?: number | null; fallaBarcode?: string | null }

export const MOTIVO_FALLA_POS = 'Cargada en el POS'

/** De dónde sale la unidad: el stock la ubica; si alcanza en los dos o en ninguno, el Local (es donde está la prenda en la mano). */
export function ubicacionFallaPOS(r: Pick<RenglonFalla, 'stock' | 'cantidad'>): FallaUbicacion {
  const stock = r.stock && (r.stock.local != null || r.stock.deposito != null) ? { local: Number(r.stock.local) || 0, deposito: Number(r.stock.deposito) || 0 } : null
  return ubicacionDeFalla(stock, Math.max(1, r.cantidad || 1), 'local').origen
}

/** La fila del ledger de fallas, armada del renglón. El precio es el de LISTA (la venta técnica va a lista + 100 % de descuento). */
export function fallaDeRenglon(r: RenglonFalla): FallaInput & { ubicacion: FallaUbicacion } {
  const lista = r.precioLista ?? r.precio ?? null
  return {
    producto: r.variante.product_name,
    sku: r.variante.sku,
    variante: r.variante.size_name || null,
    cantidad: Math.max(1, r.cantidad || 1),
    motivo: MOTIVO_FALLA_POS,
    precio_lista: lista != null && lista > 0 ? lista : null,
    product_id: String(r.variante.product_id),
    size_id: String(r.variante.size_id),
    ubicacion: ubicacionFallaPOS(r),
  }
}

export type ResultadoFalla =
  | { ok: true; fallaId: number; barcode: string | null; erpAjuste: number | null }
  | { ok: false; fallaId: number | null; barcode: string | null; error: string }

/** Las dos funciones de I/O, inyectables para el test. */
export type IOFalla = { crearFalla: typeof crearFalla; registrarVentaGN: typeof registrarVentaGN }

/**
 * Carga UN renglón como falla y lo descuenta. Con `fallaId` (un intento anterior que cargó y ⛔ descontó) sólo descuenta.
 * ⛔ tira: el error vuelve en el resultado con el `fallaId` que haya, para que el reintento ⛔ duplique.
 */
export async function registrarFallaPOS(store: Marca, r: RenglonFalla, ctx: CtxVentaFalla, io: IOFalla = { crearFalla, registrarVentaGN }): Promise<ResultadoFalla> {
  const f = fallaDeRenglon(r)
  let fallaId = r.fallaId ?? null
  let barcode = r.fallaBarcode ?? null
  if (fallaId == null) {
    try {
      const c = await io.crearFalla(store, f, ctx.usuario)
      if (c.id == null) return { ok: false, fallaId: null, barcode: null, error: 'No se pudo cargar la falla.' }
      fallaId = c.id
      barcode = c.barcode ?? null
    } catch (e) {
      return { ok: false, fallaId: null, barcode: null, error: (e as Error).message }
    }
  }
  try {
    const nota = `Falla ${f.sku || ''} — ${MOTIVO_FALLA_POS} — ${barcode || ''} (Monitor)`
    const { erpAjuste } = await io.registrarVentaGN(
      store,
      { id: fallaId, product_id: f.product_id ?? null, size_id: f.size_id ?? null, cantidad: f.cantidad ?? 1, sku: f.sku ?? null, motivo: f.motivo ?? null, barcode, ubicacion: f.ubicacion, precio_lista: f.precio_lista ?? null },
      ctx,
      nota,
    )
    return { ok: true, fallaId, barcode, erpAjuste: erpAjuste ?? null }
  } catch (e) {
    return { ok: false, fallaId, barcode, error: (e as Error).message }
  }
}
