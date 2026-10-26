/**
 * ERP › Ventas › Cobros: lo que se cobró en un período, todo junto (`cobrosDe` del motor, contrato §18: los cobros de
 * las ventas, los pagos a cuenta y las devoluciones en plata). SÓLO LEE. Núcleo de la pantalla: `lib/erp/cobros.core.js`.
 *
 *   GET ?recurso=erp&vista=cobros&marca=bdi|zattia&desde&hasta&prueba=0|1
 *
 * + `contraentregas`: las ventas «Contraentrega» que todavía ⛔ se cerraron (`contraentregasAbiertas`, contrato §20) — lo
 *   que está en la calle HOY, ⛔ depende del período. Una base sin la `sql/032` ⛔ tiene la cuenta ⇒ lista vacía.
 *
 * + `entregasPendientes`: las entregas de Logística que quedaron SIN cobro en el ERP (`entregasSinCobro`, ⛔ depende del período).
 *
 *   POST {recurso:'erp', accion:'reintentar-entregas', marca}   vuelve a intentar el cobro de esas entregas (`reintentarEntregas`
 *   del motor, sólo admin: lo chequea `api/_erp.js`). 🔴 Cada cobro que ahora sí se puede anotar CREA una venta (fila inmutable).
 *
 * 🔴 Hasta el corte, todo lo del ERP es de PRUEBA (corre en paralelo con GN) ⇒ la pantalla abre en `prueba=1`. Los dos
 *    libros ⛔ se suman: se cuenta cuántos hay en el otro para que la pantalla lo diga.
 * Los totales salen del MOTOR (por línea): una venta anulada sin devolución propia ⛔ suma, y eso la fila ⛔ lo trae.
 */
const MARCAS = ['bdi', 'zattia']
const LINEAS = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] }
const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Las entregas de Logística cuyo ÚLTIMO intento de cobro quedó `pendiente` (sql/039 del motor; contrato `ENTREGA.md`): ⛔ depende
 * del período (se queda hasta que se arregle lo que faltaba y `reintentarEntregas` la cobre). Una base sin la tabla ⇒ lista vacía.
 * @param {any} pg @param {string[]} lineas
 */
export async function entregasSinCobro(pg, lineas) {
  const [{ hay }] = (await pg.query(`select to_regclass('public.entrega_cobro') is not null as hay`)).rows
  if (!hay) return []
  return (await pg.query(
    `select e.id, e.marca as linea, e.numero::text, e.forma_pago, e.monto::float as monto, e.entrego, e.entregada_en, e.avisos,
            u.motivo, u.creada_en as intento_en,
            (select count(*) from entrega_cobro c where c.empresa_id = e.empresa_id and c.entrega_id = e.id) as intentos
       from entrega e
       join lateral (select resultado, motivo, creada_en from entrega_cobro c
                      where c.empresa_id = e.empresa_id and c.entrega_id = e.id order by creada_en desc limit 1) u on true
      where e.marca = any($1) and e.forma_pago <> 'ya_pagado' and u.resultado = 'pendiente'
      order by e.entregada_en desc limit 500`, [lineas])).rows
}

/**
 * @param {{ marca: string, desde: string, hasta: string, prueba?: boolean }} p
 * @param {{ conMotor: Function }} deps
 */
export async function cobrosDelPeriodo({ marca, desde, hasta, prueba = false }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!FECHA.test(desde) || !FECHA.test(hasta)) return { status: 400, error: 'Período inválido' }
  return deps.conMotor(marca, 'Los cobros', async (pg) => {
    const [{ cobrosDe }, { contraentregasAbiertas }] = await Promise.all([import('../motor/venta/cobros.mjs'), import('../motor/venta/contraentrega.mjs')])
    const [{ con032 }] = (await pg.query(`select exists (select 1 from information_schema.columns where table_schema = current_schema()
      and table_name = 'venta_pago' and column_name = 'cierre_de') as con032`)).rows
    const lineas = (await pg.query('select id, empresa_id::text from marca where id = any($1)', [LINEAS[marca]])).rows
    const cobros = []
    const contraentregas = []
    /** @type {Record<string, { plata: number, entro: number, salio: number, por_medio: Record<string, number> }>} */
    const totales = {}
    for (const { id: linea, empresa_id } of lineas) {
      const r = await cobrosDe(pg, { empresa_id, marca: linea, desde, hasta, prueba })
      if (!r.ok) return { status: r.error?.codigo === 'ENTRADA_INVALIDA' ? 400 : 409, error: r.error?.mensaje ?? 'El motor no devolvió los cobros.' }
      cobros.push(...r.cobros.map((c) => ({ ...c, linea })))
      totales[linea] = r.totales
      if (con032) contraentregas.push(...(await contraentregasAbiertas(pg, { empresa_id, marca: linea, prueba })).abiertas.map((a) => ({ ...a, linea })))
    }
    const AR = `at time zone 'America/Argentina/Buenos_Aires'`
    const [{ n: otroLibro }] = (await pg.query(
      `select (select count(*) from venta_pago p join venta v on v.id = p.venta_id
                where v.marca = any($1) and v.prueba = $2 and (v.ocurrida_en ${AR})::date between $3::date and $4::date)
            + (select count(*) from cuenta_movimiento m
                where m.tipo = 'pago' and m.marca = any($1) and m.prueba = $2 and (m.ocurrida_en ${AR})::date between $3::date and $4::date) as n`,
      [LINEAS[marca], !prueba, desde, hasta])).rows
    const entregasPendientes = await entregasSinCobro(pg, LINEAS[marca])
    return { desde, hasta, prueba, cobros, totales, contraentregas, entregasPendientes, otroLibro: Number(otroLibro) }
  })
}

/**
 * Vuelve a intentar el cobro de las entregas de Logística que quedaron sin cobrar, línea por línea (el motor reintenta por tienda).
 * Una entrega que sigue sin poder cobrarse ⛔ ensucia: el motor sólo escribe cuando el cobro sale. Devuelve el resumen sumado.
 * @param {{ marca: string }} p
 * @param {{ conMotor: Function }} deps
 */
export async function reintentarEntregasErp({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const { reintentarEntregas } = await import('../motor/tn/entrega.mjs')
  return deps.conMotor(marca, 'El reintento de las entregas', async (pg) => {
    const [{ hay }] = (await pg.query(`select to_regclass('public.entrega_cobro') is not null as hay`)).rows
    if (!hay) return { status: 409, error: 'Las entregas de Logística todavía no están en la base del motor (migración 039).' }
    let revisadas = 0
    let registradas = 0
    /** @type {{ id: string, linea: string, motivo: string | null }[]} */
    const siguen = []
    // Una conexión ⇒ una línea por vez (pg ⛔ las encola en paralelo).
    for (const linea of LINEAS[marca]) {
      const r = await reintentarEntregas({ conexion: pg, tienda: linea })
      revisadas += r.revisadas
      registradas += r.registradas
      siguen.push(...r.siguen.map((s) => ({ id: String(s.id), linea, motivo: s.motivo ?? null })))
    }
    return { ok: true, revisadas, registradas, siguen }
  })
}
