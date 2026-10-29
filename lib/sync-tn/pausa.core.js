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

/**
 * 🔴 Las tiendas que YA CORTARON: viven en el ERP y GN ⛔ escribe más en su TN —ni el cron ni la pantalla de Integraciones—,
 * con o sin la variable. Stunned cortó el 28-oct. La variable sirve para PROBAR; un corte es un hecho y ⛔ se apaga con un env.
 * (Lo frenó Bruno el 28-oct: la variable sólo la leía el cron y la pantalla podía pisar TN con el stock de GN, que ya no se mueve.)
 */
export const TIENDAS_CORTADAS = ['stunned']

/** La tienda ya vive en el ERP: lo que lee la PANTALLA, que no tiene la variable (vive en GitHub Actions). */
export const cortada = (tienda) => TIENDAS_CORTADAS.includes(tienda)

export function pausadoEn(tienda, env = process.env) {
  const lista = String(env.SYNC_GN_TN_PAUSADO ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  for (const t of lista) if (!TIENDAS_SYNC.includes(t)) throw new Error(`SYNC_GN_TN_PAUSADO: tienda desconocida «${t}»`)
  return cortada(tienda) || lista.includes(tienda)
}
