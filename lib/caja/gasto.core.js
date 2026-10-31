/**
 * La CAJA CHICA del local (Bruno, 30-oct; `~/Documents/erp-monitor/erp-stunned.md` §7): un gasto que se paga con el efectivo de la
 * caja abierta es una SALIDA de esa caja con su categoría (`caja_turno_mov.categoria`, `sql/migrate-caja-gasto.sql`) ⇒ resta sola
 * del esperado, como cualquier salida. Lo carga quien tiene `cargar-gasto` en el ERP (Local y Administración) y que además pueda
 * mover el efectivo de esa caja (A8: la cuenta que la abrió o un admin).
 * 🔑 Cada uno ve SÓLO lo que cargó: lo corta el SERVIDOR (`delQueCarga`), ⛔ la pantalla. La lista de todos es de Admin.
 *
 * LA OFICINA y LA REVISIÓN (Bruno, 30-oct, tanda 2): la oficina carga gastos que ⛔ salen de la caja (`gasto_oficina`) y TODO
 * gasto —caja chica incluida— queda PARA REVISAR. Un Admin (Bruno o Darío) lo aprueba o lo rechaza; al aprobar, el servidor lo
 * escribe SOLO en el dashboard (`/api/puente/gastos`, ⛔ el motor: la tabla `gasto` del ERP es la de los gastos COMERCIALES).
 * La caja chica entra PAGADA en efectivo y la oficina PENDIENTE: eso lo decide el dashboard (`lib/puente-gastos.ts` allá).
 * 🔑 Las categorías cuelgan de una categoría QUE EL DASHBOARD YA USA (`dashboard`, medidas en su base el 30-oct): allá entra la
 * categoría, y la sub va al concepto («Limpieza: lavandina»). ⛔ Sueldos, Alquiler, Impuestos, Financieros, Cargas: siguen del bot.
 */

/** Las categorías de la caja chica, en el orden del desplegable. La clave es lo que se guarda; ⛔ cambiar una clave ya usada. */
export const CATEGORIAS_GASTO = [
  { clave: 'limpieza', nombre: 'Limpieza', dashboard: 'Mantenimiento' },
  { clave: 'libreria', nombre: 'Librería e impresiones', dashboard: 'Otros' },
  { clave: 'envio', nombre: 'Envíos y fletes', dashboard: 'Logistica' },
  { clave: 'mantenimiento', nombre: 'Arreglos y mantenimiento', dashboard: 'Mantenimiento' },
  { clave: 'consumo', nombre: 'Agua, café y comida', dashboard: 'Comidas' },
  { clave: 'otro', nombre: 'Otro', dashboard: 'Otros' },
]
/** Las de la caja chica + las que sólo carga la oficina. ⛔ cambiar una clave ya usada. */
export const CATEGORIAS_OFICINA = [
  ...CATEGORIAS_GASTO,
  { clave: 'servicios', nombre: 'Servicios (luz, internet, teléfono…)', dashboard: 'Servicios' },
  { clave: 'suscripciones', nombre: 'Suscripciones (apps, sistemas)', dashboard: 'Suscripciones' },
  { clave: 'equipos', nombre: 'Equipos', dashboard: 'Equipos' },
]
const CLAVES = new Set(CATEGORIAS_GASTO.map((c) => c.clave))
const CLAVES_OFICINA = new Set(CATEGORIAS_OFICINA.map((c) => c.clave))

/** La de la caja chica. @param {unknown} c */
export const categoriaValida = (c) => typeof c === 'string' && CLAVES.has(c)
/** La de la oficina (incluye las de la caja chica). @param {unknown} c */
export const categoriaDeOficinaValida = (c) => typeof c === 'string' && CLAVES_OFICINA.has(c)

/** @param {string | null | undefined} c */
export const nombreDeCategoria = (c) => CATEGORIAS_OFICINA.find((x) => x.clave === c)?.nombre ?? 'Sin categoría'

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

// ── La REVISIÓN (tanda 2) ───────────────────────────────────────────────────────────────────────────────────────────────

/** De dónde salió: la caja chica (`caja_turno_mov`) o la oficina (`gasto_oficina`). */
export const ORIGENES_GASTO = ['caja', 'oficina']
export const NEGOCIOS_DASHBOARD = ['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']
/** Lo que propone el ERP; el Admin lo cambia al aprobar. La caja, la marca de la caja; la oficina, GENERAL (el 99% del dashboard). */
export const negocioPorDefecto = (origen, store) => (origen === 'caja' ? (store === 'bdi' ? 'BDI' : 'ZATTIA') : 'GENERAL')

/**
 * En qué está el gasto. `revision` null = PARA REVISAR. Una salida de caja anulada antes de revisarse queda «anulado» (⛔ se
 * aprueba: la plata volvió a la caja).
 * @param {{ revision?: string | null, anulado_en?: string | null }} f @returns {'revisar' | 'aprobado' | 'rechazado' | 'anulado'}
 */
export function estadoDeGasto(f) {
  if (f.revision === 'aprobado') return 'aprobado'
  if (f.revision === 'rechazado') return 'rechazado'
  if (f.anulado_en) return 'anulado'
  return 'revisar'
}

/** El detalle que escribió la persona, sin el «Gasto · Limpieza: » que le pone `motivoDeGasto` en la caja. Corta cualquier
 * categoría, ⛔ sólo la de la fila: al aprobar, el Admin puede cambiarla y el motivo de la caja ⛔ se reescribe (es del cierre). */
export function detalleDeMotivo(_categoria, motivo) {
  return String(motivo ?? '').replace(/^Gasto · [^:]+: /, '')
}

/** La categoría del DASHBOARD de una clave del ERP. @param {string} clave */
export const categoriaDelDashboard = (clave) => CATEGORIAS_OFICINA.find((x) => x.clave === clave)?.dashboard ?? null

/** El concepto que entra al dashboard: la sub + el detalle («Limpieza: lavandina»). Si la sub ⛔ dice más que la categoría del
 * dashboard (Otro, Servicios, Suscripciones, Equipos), sólo el detalle. */
const SIN_SUB = new Set(['otro', 'servicios', 'suscripciones', 'equipos'])
export function conceptoParaDashboard(clave, detalle) {
  const d = String(detalle ?? '').trim()
  if (SIN_SUB.has(clave) || !categoriaDeOficinaValida(clave)) return d.slice(0, 200)
  return `${nombreDeCategoria(clave)}: ${d}`.slice(0, 200)
}

/**
 * Lo que viaja a `/api/puente/gastos` del dashboard. `categoria` y `negocio` son los que eligió el Admin al aprobar (o los
 * de la fila). El `operacion_id` es el id de la fila: aprobar dos veces carga UN gasto (el dashboard contesta lo de la 1ª).
 * @returns {{ ok: true, cuerpo: Record<string, unknown> } | { ok: false, error: string }}
 */
export function cuerpoParaDashboard({ origen, fila, categoria, negocio, fecha, aprobadoPor }) {
  if (!ORIGENES_GASTO.includes(origen)) return { ok: false, error: 'No se sabe de dónde salió el gasto.' }
  const valida = origen === 'caja' ? categoriaValida : categoriaDeOficinaValida
  if (!valida(categoria)) return { ok: false, error: 'Esa categoría de gasto no existe.' }
  if (!NEGOCIOS_DASHBOARD.includes(negocio)) return { ok: false, error: 'Falta de qué marca es el gasto.' }
  const monto = Number(fila.monto)
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'El gasto no tiene monto.' }
  const detalle = origen === 'caja' ? detalleDeMotivo(fila.categoria, fila.motivo) : fila.detalle
  return {
    ok: true,
    cuerpo: {
      operacion_id: fila.id,
      origen,
      categoria: categoriaDelDashboard(categoria),
      concepto: conceptoParaDashboard(categoria, detalle) || nombreDeCategoria(categoria),
      monto,
      fecha,
      negocio,
      cargado_por: fila.usuario || fila.usuario_cuenta || null,
      aprobado_por: aprobadoPor || null,
    },
  }
}

/** Las columnas de la revisión todavía ⛔ existen (sin `sql/migrate-gasto-revision.sql`). */
export function faltaRevision(error) {
  const m = String((error && error.message) || '')
  return !!error && (error.code === '42P01' || /gasto_oficina|revision/.test(m)) && /column|columna|relation|does not exist|schema cache/i.test(m)
}
export const FALTA_REVISION = 'La revisión de gastos todavía no está disponible en esta marca (falta preparar la base).'
