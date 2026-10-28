/**
 * ERP › Stock › Diferencias: el BOTÓN «mandar el stock del ERP a Tienda Nube» (Bruno 27-oct: la diferencia es INFORMATIVA;
 * cuando el ERP esté arriba, el ERP MANDA el stock a todos lados). Motor `lib/tn/pedido-stock.mjs`. Sólo admin.
 *
 *   GET  ?recurso=erp&vista=empujes-stock&marca=bdi|zattia|stunned    los últimos empujes de esa tienda (seco o real)
 *   POST {recurso:'erp', accion:'mandar-stock', marca}                  pide el empuje de la tienda ENTERA
 *
 * 🔑 ⛔ escribe en TN desde acá: avisa el trabajo `stock-tn:<tienda>` de la cola del motor y lo corre `erp.arebensrl.com/api/eventos`
 * (cron, cada minuto). Ese trabajo escribe SÓLO donde `STOCK_TN_MANDA` lo diga (Vercel de `areben-erp`, se prende con el corte de
 * esa tienda); hasta entonces es SECO: guarda lo que mandaría. 🔴 La tienda entera, ⛔ una variante (`reglas-vigentes.md` :12, :94).
 * 🔑 La cola vive en la base de BDI, también para Zattia y Stunned ⇒ `conMotor('bdi')`.
 * ⛔ Mercado Libre (el empuje es un workflow a mano de Actions, `ml-stock.yml`) ni Gestión Nube (⛔ hay escritura de stock a GN).
 */
const TIENDAS = ['bdi', 'zattia', 'stunned']
const errorDe = (r) => ({ status: r.error?.codigo === 'TIENDA' || r.error?.codigo === 'USUARIO' ? 400 : 409, error: r.error?.mensaje ?? 'El motor no lo aceptó.' })

/** Lo que la pantalla necesita de cada empuje (el resultado del trabajo, ⛔ el evento crudo). */
export function aEmpuje(e) {
  const r = e.resultado && typeof e.resultado === 'object' ? e.resultado : null
  return {
    id: e.id, estado: e.estado, pedidoPor: e.origen ?? null, avisos: e.avisos ?? 1,
    pedidoEn: e.creado_en ?? null, terminadoEn: e.terminado_en ?? null, error: e.error ?? null,
    seco: r ? r.seco !== false : null,
    cambios: r?.cambios ?? null, unidades: r?.unidades ?? null, escritos: r?.escritos ?? null, quedan: r?.quedan ?? null,
  }
}

/**
 * @param {{ marca: string }} p  `marca` = la tienda (la línea: Stunned tiene la suya)
 * @param {{ conMotor: Function }} deps
 */
export async function empujesDeStock({ marca }, deps) {
  if (!TIENDAS.includes(marca)) return { status: 400, error: 'Tienda inválida' }
  return deps.conMotor('bdi', 'Los envíos de stock', async (pg) => {
    const { empujesStock } = await import('../motor/tn/pedido-stock.mjs')
    const r = await empujesStock(pg, { tienda: marca, limite: 5 })
    return r.ok ? { tienda: marca, empujes: r.empujes.map(aEmpuje) } : errorDe(r)
  })
}

/**
 * Pide el empuje (sólo admin: lo chequea `api/_erp.js`).
 * @param {{ marca: string, usuario: string|null }} p
 * @param {{ conMotor: Function }} deps
 */
export async function mandarStock({ marca, usuario }, deps) {
  if (!TIENDAS.includes(marca)) return { status: 400, error: 'Tienda inválida' }
  if (!usuario) return { status: 400, error: 'Falta quién lo pide' }
  return deps.conMotor('bdi', 'Mandar el stock', async (pg) => {
    const { pedirEmpujeStock } = await import('../motor/tn/pedido-stock.mjs')
    const r = await pedirEmpujeStock(pg, { tienda: marca, usuario })
    return r.ok ? { ok: true, id: r.id, yaEsperaba: !r.nuevo } : errorDe(r)
  })
}
