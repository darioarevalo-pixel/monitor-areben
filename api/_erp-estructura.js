/**
 * ERP › Configuración › Cuentas y › Marcas, depósitos y puntos de venta (v8 `Configuracion.dc.html`, tabs `cuentas` y
 * `estructura`). SÓLO LEE, de la base del motor. Núcleo de la pantalla: `lib/erp/estructura.core.js`.
 *
 *   GET ?recurso=erp&vista=estructura&marca=bdi|zattia
 *
 * Cuentas = `cuenta_real`, la COPIA de las del dashboard (⛔ el ERP arma otra lista ni guarda saldos: eso es del dashboard)
 * + qué rutas VIGENTES de esta marca caen en cada una. Estructura = `empresa` · `marca` (punto de venta, nombre fiscal) ·
 * `deposito`. Sin permiso propio ⇒ `configurar` (sólo admin), como las rutas.
 */
const MARCAS = ['bdi', 'zattia']
const LINEAS = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] }

/** @param {{ marca: string }} p @param {{ conMotor: Function }} deps */
export async function estructuraDeMarca({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  return deps.conMotor(marca, 'La configuración', async (pg) => {
    // Una conexión ⇒ una consulta por vez.
    const empresas = (await pg.query('select id, razon_social, cuit, condicion_iva, ingresos_brutos from empresa order by id')).rows
    const marcas = (await pg.query(`select id, empresa_id, nombre, tienda, nombre_fiscal, punto_venta, domicilio_fiscal, inicio_actividades
      from marca where id = any($1) order by array_position($1::text[], id)`, [LINEAS[marca]])).rows
    const depositos = (await pg.query(`select marca, id, nombre, vende, gn_store_id from deposito where marca = any($1) order by marca, vende desc, nombre`, [LINEAS[marca]])).rows
    const cuentas = (await pg.query(`select id::text, titular, nombre, banco, tipo, activa, copiada_en from cuenta_real order by activa desc, titular, banco, nombre`)).rows
    const conRutas = (await pg.query(`select to_regclass('public.ruta_cobro') is not null as hay`)).rows[0].hay
    // La ruta VIGENTE de cada línea × canal × medio = la de `desde` más nuevo que ya empezó (como `rutasVigentes` del motor).
    const rutas = conRutas ? (await pg.query(`select distinct on (marca, canal, medio) marca, canal, medio, cuenta_real_id::text
      from ruta_cobro where marca = any($1) and desde <= now() order by marca, canal, medio, desde desc`, [LINEAS[marca]])).rows : []
    return { empresas, marcas, depositos, cuentas, rutas, cuentasCopiadasEn: cuentas.reduce((a, c) => (c.copiada_en && (!a || c.copiada_en > a) ? c.copiada_en : a), null) }
  })
}
