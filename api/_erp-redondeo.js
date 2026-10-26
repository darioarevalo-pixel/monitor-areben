/**
 * ERP › Configuración › Redondeo (sólo admin, lo chequea `api/_erp.js`): a cuánto se redondea el precio de cada canal, por línea,
 * desde un momento, contra la base del motor (sql/029). Leer y poner van por el contrato del motor (`motor/venta/redondeo-db.mjs`):
 * un redondeo ⛔ se edita, se pone otro, y ⛔ para atrás. La forma de lo que manda la pantalla es de `lib/erp/redondeo.core.js`.
 *
 *   GET  ?recurso=erp&vista=redondeo&marca=bdi|zattia     por línea: un renglón por canal (vigente y próximo) + el historial
 *   POST {recurso:'erp', accion:'poner-redondeo', marca, linea?, canal, paso, modo, desde?}
 *
 * ⛔ cambia lo que cobra la Caja: ella sigue con su `redondeo: 100` propio (`lib/caja/marcas.core.js`) hasta que lea esto; hoy
 * lo lee el pedido mayorista (`api/pedido-mayorista.js`).
 */
import { filasDeRedondeo, leerRedondeoDePantalla } from '../lib/erp/redondeo.core.js'
import { marcasDe } from '../lib/erp/reglas.core.js'

const MARCAS = ['bdi', 'zattia']
const SIN_TABLA = 'El redondeo todavía no está en la base del motor (migración 029).'
const STATUS = { DESDE_PASADO: 400, ENTRADA_INVALIDA: 400, CANAL_DESCONOCIDO: 400, MARCA_DESCONOCIDA: 400, REDONDEO_REPETIDO: 409 }
const motor = () => import('../motor/venta/redondeo-db.mjs')
const hayRedondeo = async (pg) => (await pg.query(`select to_regclass('public.redondeo') is not null as hay`)).rows[0].hay

export async function redondeoDeMarca({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const db = await motor()
  return deps.conMotor(marca, 'El redondeo', async (pg) => {
    if (!(await hayRedondeo(pg))) return { status: 409, error: SIN_TABLA }
    const lineas = marcasDe(marca)
    // Una conexión ⇒ una consulta por vez (pg ⛔ las encola en paralelo).
    const grillas = []
    for (const linea of lineas) grillas.push({ linea, filas: filasDeRedondeo(await db.redondeosDe(pg, { marca: linea })) })
    const historial = (await pg.query(`select id::text, marca, canal, paso::float, modo, desde, puesto_por, puesto_en
      from redondeo where marca = any($1) order by puesto_en desc limit 200`, [lineas])).rows
    return { lineas: grillas, historial }
  })
}

/** Pone un redondeo nuevo (desde ahora o más adelante). */
export async function ponerRedondeoErp({ marca, body, usuario }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const l = leerRedondeoDePantalla(body, { marca, lineas: marcasDe(marca) })
  if (l.error) return { status: 400, error: l.error, campo: l.campo ?? null }
  const db = await motor()
  return deps.conMotor(marca, 'Poner el redondeo', async (pg) => {
    if (!(await hayRedondeo(pg))) return { status: 409, error: SIN_TABLA }
    const r = await db.ponerRedondeo(pg, { ...l.redondeo, usuario: usuario || 'admin' })
    if (!r.ok) return { status: STATUS[r.error.codigo] || 400, error: r.error.mensaje, campo: r.error.campo ?? null }
    return { ok: true, id: r.id }
  })
}
