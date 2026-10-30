/**
 * La CAJA CHICA del local (Bruno, 30-oct; `~/Documents/erp-monitor/erp-stunned.md` §7): un gasto que se paga con el efectivo de la
 * caja abierta es una SALIDA de esa caja con su categoría (`caja_turno_mov.categoria`, `sql/migrate-caja-gasto.sql`) ⇒ resta sola
 * del esperado, como cualquier salida. Lo carga quien tiene `cargar-gasto` en el ERP (Local y Administración) y que además pueda
 * mover el efectivo de esa caja (A8: la cuenta que la abrió o un admin).
 * 🔑 Cada uno ve SÓLO lo que cargó: lo corta el SERVIDOR (`delQueCarga`), ⛔ la pantalla. La lista de todos es de Admin.
 * Lo de la OFICINA (gastos que ⛔ salen de la caja y Admin filtra antes del dashboard) es otra tanda.
 */

/** Las categorías de la caja chica, en el orden del desplegable. La clave es lo que se guarda; ⛔ cambiar una clave ya usada. */
export const CATEGORIAS_GASTO = [
  { clave: 'limpieza', nombre: 'Limpieza' },
  { clave: 'libreria', nombre: 'Librería e impresiones' },
  { clave: 'envio', nombre: 'Envíos y fletes' },
  { clave: 'mantenimiento', nombre: 'Arreglos y mantenimiento' },
  { clave: 'consumo', nombre: 'Agua, café y comida' },
  { clave: 'otro', nombre: 'Otro' },
]
const CLAVES = new Set(CATEGORIAS_GASTO.map((c) => c.clave))

/** @param {unknown} c */
export const categoriaValida = (c) => typeof c === 'string' && CLAVES.has(c)

/** @param {string | null | undefined} c */
export const nombreDeCategoria = (c) => CATEGORIAS_GASTO.find((x) => x.clave === c)?.nombre ?? 'Sin categoría'

/** El motivo que ve el cierre de caja (la columna `motivo` sigue obligatoria): «Gasto · Limpieza: lavandina». */
export const motivoDeGasto = (categoria, detalle) => `Gasto · ${nombreDeCategoria(categoria)}: ${String(detalle).trim()}`.slice(0, 200)

/** Días hacia atrás que lee «Mis gastos». */
export const DIAS_MIS_GASTOS = 31

/**
 * Las filas que puede ver esta cuenta: admin, todas; el resto, sólo las que cargó (por `usuario_cuenta`, el mail del padrón,
 * que ⛔ cambia). Sin cuenta ⇒ ninguna.
 * @param {Array<{ usuario_cuenta?: string | null }>} filas @param {string | null} cuenta @param {boolean} admin
 */
export function delQueCarga(filas, cuenta, admin) {
  if (admin) return filas
  if (!cuenta) return []
  return filas.filter((f) => String(f.usuario_cuenta ?? '').trim().toLowerCase() === cuenta)
}

/** La columna `categoria` todavía ⛔ existe en esa base. */
export function faltaColumnaGasto(error) {
  return !!error && /categoria/.test(String(error.message || '')) && /column|columna/i.test(String(error.message || ''))
}
export const FALTA_GASTO = 'Cargar un gasto todavía no está disponible en esta marca (falta preparar la base).'
