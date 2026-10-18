/**
 * ERP › Cuentas de cobro (sólo admin, lo chequea `api/_erp.js`): las RUTAS de gerencia —qué cuenta REAL recibe cada medio,
 * por marca × canal, desde un momento— contra la base del motor (sql/019-020). Leer y poner van por el contrato del motor
 * (`motor/cuentas/rutas.mjs`): una ruta ⛔ se edita, se pone otra, y ⛔ para atrás. El aviso es de `lib/erp/rutas.core.js`.
 *
 *   GET  ?recurso=erp&vista=rutas&marca=bdi|zattia     cuentas, la grilla de cada línea, las reglas (para el aviso) y el historial
 *   POST {recurso:'erp', accion:'poner-ruta', marca, linea?, canal, medio, cuenta_real_id|null, tasa?, dias_acreditacion?, desde?}
 *
 * EN SOMBRA (Bruno, 17-oct): la Caja sigue con su cuenta de MP hasta ACTIVAR el ERP; la ruta sólo anota la cuenta real de
 * cada cobro del motor. ⛔ cambia lo que cobra ni lo que ve nadie.
 */
import { avisoDeRuta, filasDeRutas, leerRutaDePantalla } from '../lib/erp/rutas.core.js'
import { marcasDe } from '../lib/erp/reglas.core.js'

const MARCAS = ['bdi', 'zattia']
const SIN_TABLA = 'Las cuentas de cobro todavía no están en la base del motor (migraciones 019 y 020).'
const STATUS = { DESDE_PASADO: 400, ENTRADA_INVALIDA: 400, CANAL_DESCONOCIDO: 400, MARCA_DESCONOCIDA: 400, CUENTA_REAL_DESCONOCIDA: 400, RUTA_REPETIDA: 409 }
const motor = () => Promise.all([import('../motor/cuentas/rutas.mjs'), import('../motor/venta/reglas-db.mjs')])
const hayRutas = async (pg) => (await pg.query(`select to_regclass('public.ruta_cobro') is not null as hay`)).rows[0].hay

/** Las reglas activas y apagadas de la marca y sus líneas (el aviso mira sólo las activas). Sin la tabla de reglas, []. */
const reglasDe = async (pg, db, marca) => ((await db.hayReglas(pg)) ? db.leerReglas(pg, { marcas: marcasDe(marca) }) : [])

export async function rutasDeMarca({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const [rutas, db] = await motor()
  return deps.conMotor(marca, 'Las cuentas de cobro', async (pg) => {
    if (!(await hayRutas(pg))) return { status: 409, error: SIN_TABLA }
    const lineas = marcasDe(marca)
    // Una conexión ⇒ una consulta por vez (pg ⛔ las encola en paralelo).
    const cuentas = await rutas.cuentasParaRutas(pg)
    const reglas = await reglasDe(pg, db, marca)
    const historial = (await pg.query(`select r.id::text, r.marca, r.canal, r.medio, r.cuenta_real_id::text, r.tasa::float, r.dias_acreditacion, r.desde, r.puesta_por, r.puesta_en,
        c.titular as cuenta_titular, c.nombre as cuenta_nombre, c.banco as cuenta_banco
      from ruta_cobro r left join cuenta_real c on c.id = r.cuenta_real_id where r.marca = any($1) order by r.puesta_en desc limit 200`, [lineas])).rows
    const [copia] = (await pg.query('select max(copiada_en) as en from cuenta_real')).rows
    const grillas = []
    for (const linea of lineas) grillas.push({ linea, filas: filasDeRutas(await rutas.rutasVigentes(pg, { marca: linea }), { linea, reglas }) })
    return { lineas: grillas, cuentas, reglas, historial, cuentasCopiadasEn: copia?.en ?? null }
  })
}

/** Pone una ruta nueva (desde ahora o más adelante) y contesta con el aviso si corresponde: ⛔ frena, avisa. */
export async function ponerRutaErp({ marca, body, usuario }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const l = leerRutaDePantalla(body, { marca, lineas: marcasDe(marca) })
  if (l.error) return { status: 400, error: l.error, campo: l.campo ?? null }
  const [rutas, db] = await motor()
  return deps.conMotor(marca, 'Poner la ruta', async (pg) => {
    if (!(await hayRutas(pg))) return { status: 409, error: SIN_TABLA }
    const r = await rutas.ponerRuta(pg, { ...l.ruta, usuario: usuario || 'admin' })
    if (!r.ok) return { status: STATUS[r.error.codigo] || 400, error: r.error.mensaje, campo: r.error.campo ?? null }
    const cuenta = l.ruta.cuenta_real_id ? (await rutas.cuentasParaRutas(pg)).find((c) => c.id === l.ruta.cuenta_real_id) ?? null : null
    const aviso = avisoDeRuta({ linea: l.ruta.marca, canal: l.ruta.canal, medio: l.ruta.medio, cuenta, reglas: await reglasDe(pg, db, marca) })
    return { ok: true, ruta: r.ruta, aviso }
  })
}
