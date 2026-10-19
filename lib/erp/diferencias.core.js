/**
 * Diferencias del día del libro de stock (pestaña `erp › Diferencias`, `pantallas.md` #9): lo que el libro
 * ⛔ pudo explicar al comparar su día con el de GN, para RESOLVERLO. Hoy sale por consola (`bin/libro.mjs dia`).
 * Puro: el handler (`api/_erp.js`) lee `stock_diff`, `stock_libro_dia` y los negativos del libro, y esto los arma.
 *
 * 🔑 `stock_diff` guarda por día y variante × depósito sólo lo que NO cerró, con su clase (`lib/diff.mjs` del
 * motor). Las clases EXPLICADAS (en vuelo, pendiente en GN, transferencia hecha en GN) se cuentan y se esconden;
 * las INEXPLICADAS son la lista de trabajo.
 * 🔑 La SOBREVENTA del último par (dos ventas de la misma última prenda, local y online) ⛔ es una clase del diff:
 * si GN también quedó en negativo el día cierra. Se ve como lo que es: el LIBRO en negativo hoy.
 */

/** Las que nadie explicó: la lista de trabajo. En el orden en que se miran. */
export const INEXPLICADAS = ['gn_sin_causa', 'libro_sin_gn', 'distinto', 'solo_nivel']

/** Qué quiere decir cada clase y qué mirar para resolverla, en palabras del equipo. */
export const CLASE = {
  gn_sin_causa: { nombre: 'GN cambió sin causa', mirar: 'GN movió el stock y el libro no tiene por qué: una transferencia o un ajuste hecho a mano en GN, o una venta eliminada en GN.' },
  libro_sin_gn: { nombre: 'El libro movió y GN no', mirar: 'Hubo un movimiento (reposición, venta, ingreso) que GN no muestra: ¿se aplicó en GN?' },
  distinto: { nombre: 'Los dos movieron, distinto', mirar: 'GN y el libro movieron cantidades distintas: mirá el historial de la prenda.' },
  solo_nivel: { nombre: 'Arrastra una diferencia', mirar: 'El día cerró, pero el stock ya venía distinto de otro día.' },
  en_vuelo: { nombre: 'En vuelo', mirar: 'Un movimiento pegado a la hora de la foto: se acomoda solo.' },
  ingreso_pendiente_gn: { nombre: 'Ingreso que GN todavía no muestra', mirar: 'Se ingresó en el monitor y falta en GN.' },
  ajuste_pendiente_gn: { nombre: 'Ajuste por conteo sin pasar a GN', mirar: 'El conteo se cargó y falta importarlo en GN.' },
  transferencia_por_gn: { nombre: 'Transferencia hecha en GN', mirar: 'Se transfirió por la pantalla de GN (el libro la detectó).' },
  ajuste_erp: { nombre: 'Ajuste del ERP', mirar: 'Se aprobó un ajuste en ERP › Ajustes: movió sólo el ERP, GN sigue como estaba.' },
}

const n = (x) => Number(x || 0)

/**
 * El día armado para la pantalla.
 * @param {{ filas: any[], nombres: Map<string, { nombre: string, talle: string }>, resumen?: any, negativos?: any[] }} x
 *   `filas` = `stock_diff` del día; `nombres` = del espejo (`product_id/size_id`); `negativos` = variante × depósito con el libro < 0.
 */
export function armarDiferencias({ filas, nombres, resumen = null, negativos = [] }) {
  const prenda = (r) => {
    const nm = nombres.get(`${r.product_id}/${r.size_id}`)
    return { producto: String(r.product_id), talle: String(r.size_id), nombre: nm?.nombre ?? null, talleNombre: nm?.talle ?? null }
  }
  const aFila = (r) => ({
    ...prenda(r), linea: r.linea, deposito: r.deposito, clase: r.clase, explicacion: r.explicacion ?? null,
    deltaGN: n(r.delta_gn), deltaLibro: n(r.delta_libro), nivelGN: n(r.nivel_gn), nivelLibro: n(r.nivel_libro),
    // GN − libro del día: lo que hay que explicar (+ = GN tiene más).
    diferencia: n(r.delta_gn) - n(r.delta_libro),
  })
  const todas = filas.map(aFila)
  const grupos = INEXPLICADAS.map((clase) => {
    const del = todas.filter((f) => f.clase === clase).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia) || (a.nombre ?? '').localeCompare(b.nombre ?? ''))
    return { clase, ...CLASE[clase], filas: del, unidades: del.reduce((s, f) => s + Math.abs(clase === 'solo_nivel' ? f.nivelGN - f.nivelLibro : f.diferencia), 0) }
  }).filter((g) => g.filas.length)
  const explicadas = Object.keys(CLASE).filter((c) => !INEXPLICADAS.includes(c))
    .map((clase) => ({ clase, nombre: CLASE[clase].nombre, variantes: todas.filter((f) => f.clase === clase).length }))
    .filter((e) => e.variantes)
  const desconocidas = todas.filter((f) => !CLASE[f.clase]).length
  return {
    grupos, explicadas, desconocidas,
    inexplicadas: grupos.reduce((s, g) => s + g.filas.length, 0),
    sobreventa: negativos.map((r) => ({ ...prenda(r), linea: r.linea, deposito: r.deposito, nivelLibro: n(r.nivel) }))
      .sort((a, b) => a.nivelLibro - b.nivelLibro || (a.nombre ?? '').localeCompare(b.nombre ?? '')),
    porLinea: resumen?.porLinea ?? null,
  }
}

/** El día pedido (YYYY-MM-DD) o el último calculado. */
export function leerFecha(x) {
  const s = String(x ?? '').trim()
  if (!s) return { fecha: null }
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { fecha: s } : { error: 'Fecha inválida' }
}
