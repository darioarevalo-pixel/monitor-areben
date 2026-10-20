/**
 * ERP › Ventas › Cobros: lo que se cobró en un período, todo junto (`cobrosDe` del motor, contrato §18: los cobros de
 * las ventas, los pagos a cuenta y las devoluciones en plata). SÓLO LEE. Núcleo de la pantalla: `lib/erp/cobros.core.js`.
 *
 *   GET ?recurso=erp&vista=cobros&marca=bdi|zattia&desde&hasta&prueba=0|1
 *
 * 🔴 Hasta el corte, todo lo del ERP es de PRUEBA (corre en paralelo con GN) ⇒ la pantalla abre en `prueba=1`. Los dos
 *    libros ⛔ se suman: se cuenta cuántos hay en el otro para que la pantalla lo diga.
 * Los totales salen del MOTOR (por línea): una venta anulada sin devolución propia ⛔ suma, y eso la fila ⛔ lo trae.
 */
const MARCAS = ['bdi', 'zattia']
const LINEAS = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] }
const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * @param {{ marca: string, desde: string, hasta: string, prueba?: boolean }} p
 * @param {{ conMotor: Function }} deps
 */
export async function cobrosDelPeriodo({ marca, desde, hasta, prueba = false }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!FECHA.test(desde) || !FECHA.test(hasta)) return { status: 400, error: 'Período inválido' }
  return deps.conMotor(marca, 'Los cobros', async (pg) => {
    const { cobrosDe } = await import('../motor/venta/cobros.mjs')
    const lineas = (await pg.query('select id, empresa_id::text from marca where id = any($1)', [LINEAS[marca]])).rows
    const cobros = []
    /** @type {Record<string, { plata: number, entro: number, salio: number, por_medio: Record<string, number> }>} */
    const totales = {}
    for (const { id: linea, empresa_id } of lineas) {
      const r = await cobrosDe(pg, { empresa_id, marca: linea, desde, hasta, prueba })
      if (!r.ok) return { status: r.error?.codigo === 'ENTRADA_INVALIDA' ? 400 : 409, error: r.error?.mensaje ?? 'El motor no devolvió los cobros.' }
      cobros.push(...r.cobros.map((c) => ({ ...c, linea })))
      totales[linea] = r.totales
    }
    const AR = `at time zone 'America/Argentina/Buenos_Aires'`
    const [{ n: otroLibro }] = (await pg.query(
      `select (select count(*) from venta_pago p join venta v on v.id = p.venta_id
                where v.marca = any($1) and v.prueba = $2 and (v.ocurrida_en ${AR})::date between $3::date and $4::date)
            + (select count(*) from cuenta_movimiento m
                where m.tipo = 'pago' and m.marca = any($1) and m.prueba = $2 and (m.ocurrida_en ${AR})::date between $3::date and $4::date) as n`,
      [LINEAS[marca], !prueba, desde, hasta])).rows
    return { desde, hasta, prueba, cobros, totales, otroLibro: Number(otroLibro) }
  })
}
