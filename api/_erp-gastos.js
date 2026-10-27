/**
 * ERP › Gastos COMERCIALES (Bruno, 26-oct; motor `lib/gasto/gasto.mjs`, `sql/055`): comisiones de plataformas, impuestos y otros
 * costos de vender, para sacar el resultado ANTES de gastos operativos (esos siguen en el dashboard, que LEE esto). Sólo admin.
 *
 *   GET  ?recurso=erp&vista=gastos&marca=bdi|zattia&desde&hasta&prueba=0|1   total, por tipo y por mes (+ los cargados a mano)
 *   POST {recurso:'erp', accion:'registrar-gasto', marca, linea?, fecha, tipo, monto, detalle, cuenta?, prueba}   un gasto a mano
 *
 * 🔑 Las COMISIONES salen solas de los cobros (tasa de la ruta × monto) y ⛔ se cargan acá; `cobrosSinComision` cuenta los cobros
 * con tarjeta/MP cuya ruta ⛔ tiene tasa (⛔ se inventa un porcentaje). Zattia suma sus líneas (Zattia y Stunned).
 * Un gasto es inmutable: corregir uno es cargar otro con el monto en negativo.
 */
const MARCAS = ['bdi', 'zattia']
const LINEAS = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] }
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const TIPOS = ['comision', 'impuesto', 'otro']
const cero = () => ({ comision: 0, impuesto: 0, otro: 0 })
const pesos = (x) => Math.round(x * 100) / 100
const errorDe = (r) => ({ status: r.error?.codigo === 'ENTRADA_INVALIDA' ? 400 : 409, error: r.error?.mensaje ?? 'El motor no lo aceptó.' })

/**
 * @param {{ marca: string, desde: string, hasta: string, prueba?: boolean }} p
 * @param {{ conMotor: Function }} deps
 */
export async function gastosDelPeriodo({ marca, desde, hasta, prueba = false }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!FECHA.test(desde) || !FECHA.test(hasta)) return { status: 400, error: 'Período inválido' }
  return deps.conMotor(marca, 'Los gastos', async (pg) => {
    const { gastosComerciales } = await import('../motor/gasto/gasto.mjs')
    const lineas = (await pg.query('select id, empresa_id::text from marca where id = any($1)', [LINEAS[marca]])).rows
    const por_tipo = cero()
    const meses = new Map()
    const gastos = []
    let comisionAutomatica = 0
    let cobrosSinComision = 0
    for (const { id: linea, empresa_id } of lineas) {
      const r = await gastosComerciales(pg, { empresa_id, marca: linea, desde, hasta, prueba })
      if (!r.ok) return errorDe(r)
      for (const t of TIPOS) por_tipo[t] += r.por_tipo[t]
      for (const m of r.meses) {
        const x = meses.get(m.mes) ?? { mes: m.mes, total: 0, por_tipo: cero() }
        for (const t of TIPOS) x.por_tipo[t] = pesos(x.por_tipo[t] + m.por_tipo[t])
        x.total = pesos(x.total + m.total)
        meses.set(m.mes, x)
      }
      gastos.push(...r.gastos.map((g) => ({ ...g, linea })))
      comisionAutomatica += r.comision_automatica
      cobrosSinComision += r.cobrosSinComision
    }
    for (const t of TIPOS) por_tipo[t] = pesos(por_tipo[t])
    return {
      desde, hasta, prueba, total: pesos(TIPOS.reduce((s, t) => s + por_tipo[t], 0)), por_tipo,
      meses: [...meses.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1)), comisionAutomatica: pesos(comisionAutomatica), cobrosSinComision,
      gastos: gastos.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)),
    }
  })
}

/**
 * Cargar un gasto a mano (sólo admin: lo chequea `api/_erp.js`).
 * @param {{ marca: string, body: any, usuario: string|null }} p
 * @param {{ conMotor: Function }} deps
 */
export async function registrarGastoErp({ marca, body, usuario }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const linea = String(body?.linea || marca)
  if (!LINEAS[marca].includes(linea)) return { status: 400, error: 'Esa línea no es de esta marca' }
  if (!usuario) return { status: 400, error: 'Falta quién lo carga' }
  return deps.conMotor(marca, 'El gasto', async (pg) => {
    const { registrarGasto } = await import('../motor/gasto/gasto.mjs')
    const [m] = (await pg.query('select empresa_id::text from marca where id = $1', [linea])).rows
    if (!m) return { status: 400, error: 'Marca inválida' }
    const r = await registrarGasto(pg, {
      empresa_id: m.empresa_id, marca: linea, fecha: String(body?.fecha || ''), tipo: String(body?.tipo || ''), monto: Number(body?.monto),
      detalle: String(body?.detalle || ''), cuenta: body?.cuenta ? String(body.cuenta) : undefined, prueba: body?.prueba !== false, usuario,
    })
    return r.ok ? { ok: true, gasto: r.gasto } : errorDe(r)
  })
}
