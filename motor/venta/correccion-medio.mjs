/**
 * CORREGIR EL MEDIO DE UN COBRO YA HECHO (sql/042). La red para cuando alguien marca «pagado» en Tienda Nube antes de cargar
 * el cobro en Logística: la venta nació con el medio de TN y la plata entró por otro. El pago ⛔ se edita (`venta_pago` es
 * inmutable): la corrección es una fila con el medio, la cuenta de cobro, la cuenta real, la comisión y la acreditación
 * ANTES y DESPUÉS, el motivo y quién. Lo vigente es el DESPUÉS de la última (`venta_pago_vigente`).
 *
 * Cambia lo que cuelga del medio: la CUENTA (la que tiene el medio en la marca), la cuenta REAL y la comisión (la ruta de
 * cobro vigente al día del cobro), y con eso el IVA (`pendiente_facturar`) y el resultado. El MONTO ⛔ cambia: si la forma de
 * pago nueva traía otro descuento, el precio se corrige aparte (`corregirPrecio`).
 *
 * Con factura (`venta_factura`) ⇒ `FACTURADA`: cambiar de medio puede cambiar si se factura, y eso se resuelve con una nota
 * de crédito. En un cambio ⇒ `ES_CAMBIO` (se corrige en la venta original). Quién puede lo decide el monitor, ⛔ el motor.
 *
 * `db` conectado y sin transacción. Devuelven `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje, campo? } }`.
 */
import { cobroReal, medioDeCuenta, rutaVigente } from '../cuentas/cuentas.mjs'
import { leerConf } from './registrar.mjs'

const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const UUID = /^[0-9a-f-]{36}$/i
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
/** Los medios en que entra plata. `saldo`, `cuenta` y `entrega` ⛔ son un cobro que se corrige acá: tienen su propio libro. */
export const MEDIOS_COBRO = ['efectivo', 'transferencia', 'debito', 'credito', 'mp', 'pagonube']
const NO_ES_PLATA = ['saldo', 'cuenta', 'entrega']

/** Los pagos de la venta tal como VALEN hoy (con su última corrección), con el medio de su cuenta de cobro. */
export async function pagosVigentes(db, ventaId) {
  return q(db, `select p.id::text, p.monto::float, p.medio, p.cuenta_real_id::text, p.comision::float, p.acredita_el::text, p.cobrado_en,
      p.cuenta_cobro_id::text, c.nombre as cuenta, c.medio as cuenta_medio, c.gn_cuenta_id
    from venta_pago_vigente p join cuenta_cobro c on c.id = p.cuenta_cobro_id where p.venta_id = $1 order by p.monto desc, p.id`, [ventaId])
}

/**
 * @param {{ venta_id: string, pago_id?: string, medio: string, cuenta?: string|number, cuenta_real?: string, motivo: string, usuario: string }} e
 *   `pago_id`: hace falta si la venta tiene más de un cobro en plata. `cuenta`: id o número de GN de la cuenta de cobro; sin
 *   ella, la de la marca con ese medio (`cuentaDelMedio`). `cuenta_real`: adónde fue la plata, si ⛔ es la de la ruta. Con una
 *   ruta «se elige en cada cobro» es la elegida; con una ruta que YA dice la cuenta es una EXCEPCIÓN (Bruno 29-oct: TN #135
 *   eligió efectivo y transfirió al alias del local) ⇒ sin comisión ni acreditación de la ruta y aviso `FUERA_DE_RUTA`.
 */
export async function corregirMedioCobro(db, e) {
  if (!UUID.test(String(e?.venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  if (e.pago_id != null && !UUID.test(String(e.pago_id))) return falla('ENTRADA_INVALIDA', 'El pago no es un id', 'pago_id')
  if (!MEDIOS_COBRO.includes(e.medio)) return falla('ENTRADA_INVALIDA', `El medio es ${MEDIOS_COBRO.join(', ')}`, 'medio')
  const motivo = texto(e.motivo)
  if (!motivo) return falla('ENTRADA_INVALIDA', 'Falta el motivo', 'motivo')
  const usuario = texto(e.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién corrige', 'usuario')
  await db.query('begin')
  try {
    const r = await dentro(db, e, motivo, usuario)
    await db.query(r.ok ? 'commit' : 'rollback')
    return r
  } catch (x) {
    await db.query('rollback').catch(() => {})
    throw x
  }
}

const NOMBRE_DEL_MEDIO = { efectivo: 'efectivo', transferencia: 'transferencia', debito: 'debito', credito: 'credito', mp: 'mercado pago', pagonube: 'pago nube' }
const llano = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

/**
 * La cuenta de cobro del medio nuevo: la que dice la pantalla, o la de la marca con ese medio. Con varias (las de GN mezclan
 * medio y regla: «Transferencia CG», «Feria - Efectivo», «Crédito 10% OFF») ⇒ la que se llama como el medio, y si ⛔ hay, la
 * más vieja de GN. ⛔ Se le pregunta a nadie (Bruno 29-oct): adónde fue la plata lo dice la CUENTA REAL (ruta o excepción),
 * y el monto ⛔ cambia ⇒ la regla de la cuenta de GN ⛔ juega en una corrección.
 */
function cuentaDelMedio(conf, marca, medio, cuenta) {
  const deLaMarca = conf.cuentas.filter((c) => c.marca === marca && c.activa !== false)
  if (cuenta != null && cuenta !== '') {
    const c = typeof cuenta === 'string' && !/^\d+$/.test(cuenta) ? deLaMarca.find((x) => x.id === cuenta) : deLaMarca.find((x) => Number(x.gn_cuenta_id) === Number(cuenta))
    if (!c) return falla('CUENTA_DESCONOCIDA', `La cuenta de cobro ${cuenta} no es de ${marca}`, 'cuenta')
    if (medioDeCuenta(c) !== medio) return falla('CUENTA_NO_ES_DEL_MEDIO', `«${c.nombre}» no es una cuenta de ${medio}`, 'cuenta')
    return { cuenta: c }
  }
  const hay = deLaMarca.filter((c) => medioDeCuenta(c) === medio)
  if (!hay.length) return falla('CUENTA_DESCONOCIDA', `${marca} no tiene una cuenta de ${medio}: hay que crearla o elegir otro medio`, 'medio')
  const igual = hay.find((c) => llano(c.nombre) === NOMBRE_DEL_MEDIO[medio])
  const gn = (c) => (c.gn_cuenta_id == null ? Infinity : Number(c.gn_cuenta_id))
  return { cuenta: igual ?? [...hay].sort((a, b) => gn(a) - gn(b) || String(a.nombre).localeCompare(String(b.nombre)))[0] }
}

async function dentro(db, e, motivo, usuario) {
  const [v] = await q(db, 'select id, empresa_id, marca, canal, numero, tipo, estado, ocurrida_en, prueba from venta where id = $1 for update', [e.venta_id])
  if (!v) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  if (v.estado === 'anulada') return falla('ANULADA', `La venta ${v.numero} está anulada`)
  if (v.tipo !== 'venta') return falla('ES_CAMBIO', `La ${v.numero} es un cambio: el cobro se corrige en la venta original`)
  const [f] = await q(db, 'select 1 from venta_factura where venta_id = $1 limit 1', [v.id])
  if (f) return falla('FACTURADA', `La venta ${v.numero} ya tiene factura: el medio se corrige con una nota de crédito`)
  const pagos = await pagosVigentes(db, v.id)
  const cobros = pagos.filter((p) => p.monto > 0 && !NO_ES_PLATA.includes(p.cuenta_medio))
  let p
  if (e.pago_id != null) {
    p = pagos.find((x) => x.id === String(e.pago_id).toLowerCase())
    if (!p) return falla('NO_ENCONTRADA', 'Ese pago no es de la venta', 'pago_id')
    if (p.monto <= 0 || NO_ES_PLATA.includes(p.cuenta_medio)) return falla('NO_ES_COBRO', 'Ese pago no es plata que entró: saldo a favor, cuenta corriente y contraentrega tienen su propio libro', 'pago_id')
  } else {
    if (!cobros.length) return falla('SIN_COBRO', `La venta ${v.numero} no tiene un cobro en plata que corregir`)
    if (cobros.length > 1) return falla('PAGO_AMBIGUO', `La venta ${v.numero} tiene ${cobros.length} cobros: decí cuál (pago_id)`, 'pago_id')
    p = cobros[0]
  }
  const conf = await leerConf(db, v.marca)
  const c = cuentaDelMedio(conf, v.marca, e.medio, e.cuenta)
  if (!c.cuenta) return c
  const en = new Date(p.cobrado_en ?? v.ocurrida_en).toISOString()
  const pide = texto(e.cuenta_real)
  const ruta = rutaVigente(conf.rutas ?? [], { marca: v.marca, canal: v.canal, medio: e.medio, en })
  const seElige = ruta != null && ruta.cuenta_real_id == null
  const real = cobroReal({ monto: p.monto, elegida: seElige ? pide : null }, c.cuenta, { marca: v.marca, canal: v.canal, en }, conf)
  if (!real.ok) return falla(real.codigo, real.mensaje, 'cuenta_real')
  const medioAntes = p.medio ?? medioDeCuenta({ medio: p.cuenta_medio, nombre: p.cuenta })
  let nuevo = real.cobro
  const avisos = []
  if (pide && !seElige && pide !== nuevo.cuenta_real_id) {
    // La EXCEPCIÓN: la plata fue a otra cuenta que la de la ruta. La tasa y el plazo son de la ruta ⇒ ⛔ se aplican.
    const cr = (conf.cuentasReales ?? []).find((x) => x.id === pide)
    if (!cr || !cr.activa) return falla('CUENTA_REAL_DESCONOCIDA', `La cuenta ${pide} no está o está inactiva`, 'cuenta_real')
    nuevo = { ...nuevo, cuenta_real_id: pide, comision: null, acredita_el: null }
    avisos.push('FUERA_DE_RUTA')
  }
  if (p.cuenta_cobro_id === c.cuenta.id && medioAntes === nuevo.medio && (p.cuenta_real_id ?? null) === (nuevo.cuenta_real_id ?? null)) {
    return falla('SIN_CAMBIO', 'El cobro ya es de ese medio y esa cuenta')
  }
  const [k] = await q(db, `insert into venta_pago_correccion (empresa_id, marca, venta_id, venta_pago_id, medio_antes, medio_despues,
      cuenta_cobro_antes, cuenta_cobro_despues, cuenta_real_antes, cuenta_real_despues, comision_antes, comision_despues,
      acredita_el_antes, acredita_el_despues, motivo, usuario, prueba)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) returning id::text, creada_en`,
  [v.empresa_id, v.marca, v.id, p.id, medioAntes ?? 'sin_medio', nuevo.medio, p.cuenta_cobro_id, c.cuenta.id, p.cuenta_real_id ?? null, nuevo.cuenta_real_id ?? null,
    p.comision ?? null, nuevo.comision ?? null, p.acredita_el ?? null, nuevo.acredita_el ?? null, motivo, usuario, v.prueba])
  if (nuevo.cuenta_real_id == null) avisos.push('SIN_CUENTA_REAL')
  return { ok: true, correccion: { id: k.id, venta_id: v.id, numero: Number(v.numero), pago_id: p.id, monto: p.monto,
    medio_antes: medioAntes, medio_despues: nuevo.medio, cuenta_antes: p.cuenta, cuenta_despues: c.cuenta.nombre,
    cuenta_real_antes: p.cuenta_real_id ?? null, cuenta_real_despues: nuevo.cuenta_real_id ?? null,
    comision_antes: p.comision ?? null, comision_despues: nuevo.comision ?? null, motivo, usuario, creada_en: k.creada_en }, avisos }
}

/** Las correcciones de medio de una venta (de la más vieja a la más nueva) y cómo valen hoy sus pagos. */
export async function correccionesDeMedio(db, { venta_id }) {
  if (!UUID.test(String(venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const [v] = await q(db, 'select id from venta where id = $1', [venta_id])
  if (!v) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const correcciones = await q(db, `select k.id::text, k.venta_pago_id::text as pago_id, k.motivo, k.usuario, k.creada_en, k.medio_antes, k.medio_despues,
      ca.nombre as cuenta_antes, cd.nombre as cuenta_despues, k.comision_antes::float, k.comision_despues::float
    from venta_pago_correccion k join cuenta_cobro ca on ca.id = k.cuenta_cobro_antes join cuenta_cobro cd on cd.id = k.cuenta_cobro_despues
    where k.venta_id = $1 order by k.creada_en, k.id`, [venta_id])
  return { ok: true, correcciones, pagos: await pagosVigentes(db, venta_id) }
}
