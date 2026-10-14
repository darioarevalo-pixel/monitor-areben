/**
 * El emisor desde las TABLAS del motor (`empresa`, `marca`; sql/005 y 006), con la misma forma que `EMISOR`
 * de `emisor.core.js` ⇒ `faltanDelEmisor` y el PDF lo usan igual. Seguro barato (Bruno, 14-oct): el CUIT y
 * los datos fiscales son FILAS, ⛔ constantes; `EMISOR` queda como la semilla de donde salieron.
 *
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }} db
 * @param {string} empresaId
 * @returns {Promise<import('./emisor.core.js').Emisor & { puntosDeVenta: Record<string, number|null> }>}
 */
export async function emisorDe(db, empresaId = 'areben') {
  const { rows: [e] } = await db.query('select cuit, razon_social, condicion_iva, ingresos_brutos from empresa where id = $1', [empresaId])
  if (!e) throw new Error(`No está la empresa ${empresaId}: falta la semilla (sql/006)`)
  const { rows } = await db.query('select id, nombre_fiscal, punto_venta, domicilio_fiscal, inicio_actividades from marca where empresa_id = $1 order by id', [empresaId])
  return {
    cuit: Number(e.cuit),
    razonSocial: e.razon_social,
    condicionIva: e.condicion_iva,
    ingresosBrutos: e.ingresos_brutos,
    marcas: Object.fromEntries(rows.map((m) => [m.id, { nombre: m.nombre_fiscal, domicilio: m.domicilio_fiscal, inicioActividades: m.inicio_actividades }])),
    puntosDeVenta: Object.fromEntries(rows.map((m) => [m.id, m.punto_venta])),
  }
}
