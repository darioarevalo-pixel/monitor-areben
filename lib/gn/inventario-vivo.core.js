/**
 * El stock EN VIVO de un producto, leído de `GET /inventario/{product_id}` de GN. JS plano y sin red:
 * la consulta la hace cada handler con su propio `fetch` (`api/_inventario-vivo.js`, `api/_caja.js`)
 * y los dos leen la respuesta con ESTA función.
 *
 * 🔑 Es la consulta puntual y CONFIABLE: a diferencia de paginar el inventario completo (que se
 * corre entre páginas y saltea variantes), `inventario/{id}` devuelve todas las variantes con su
 * stock por tienda de una vez.
 */

/**
 * Las filas (una por variante × tienda) de la respuesta de `GET /inventario/{id}`, sólo de las
 * tiendas pedidas. `storeIds` es obligatorio: ⛔ hay «todas» por defecto.
 * @param {any} d @param {number[]} storeIds
 */
export function filasVivas(d, storeIds) {
  if (!Array.isArray(storeIds) || !storeIds.length) throw new Error('Faltan las tiendas');
  const quiero = new Set(storeIds.map(Number));
  const out = [];
  (d && d.variantes || []).forEach(v => {
    (v.stock_por_tienda || []).forEach(s => {
      if (!quiero.has(Number(s.store_id))) return;
      out.push({ inventory_id: s.inventory_id, product_id: d.product_id, product_name: d.product_name || null, product_code: d.product_code || null, size_id: v.size_id, size_name: v.size_name || null, store_id: Number(s.store_id), store_name: s.store_name || null, sku: v.sku || null, barcode: v.barcode || null, available_quantity: s.available_quantity ?? 0, fuente: 'vivo' });
    });
  });
  return out;
}
