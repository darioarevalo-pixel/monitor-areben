/**
 * La llave de «pausar el sync GN↔TN»: `SYNC_GN_TN_PAUSADO=bdi,zattia,stunned`. Sin la variable, ninguna: todo corre como hoy.
 *
 * 🔴 Bruno (18-oct): el ERP manda TODO JUNTO ⇒ se pausan las tres el día del corte, ⛔ de a una (la lista es por tienda sólo
 * para poder probar), junto con prender `STOCK_TN_MANDA` del motor: si GN sigue empujando el stock a TN, los dos se pisan.
 * Una tienda que ⛔ existe hace fallar (un typo ⛔ deja la llave apagada callada).
 *
 * 📌 Esto pausa lo que corre DESDE ESTE REPO (hoy el cron de stock de Stunned). La integración propia de GN con TN
 * (BDI y Zattia) vive del lado de GN: se desactiva a mano en su panel el mismo día, ⛔ desde acá.
 */
export const TIENDAS_SYNC = ['bdi', 'zattia', 'stunned']

export function pausadoEn(tienda, env = process.env) {
  const lista = String(env.SYNC_GN_TN_PAUSADO ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  for (const t of lista) if (!TIENDAS_SYNC.includes(t)) throw new Error(`SYNC_GN_TN_PAUSADO: tienda desconocida «${t}»`)
  return lista.includes(tienda)
}
