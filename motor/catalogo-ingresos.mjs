/**
 * EL PRODUCTO NUEVO NACE EN INGRESOS (Bruno, 3-nov: «actualizar ingresos, y los seleccionas y lo importas»; «el corte es un antes y un después»). Hasta el
 * corte de una marca el catálogo se copia de GN (`lib/catalogo.mjs`); desde el corte esa cadena se corta y lo nuevo se trae A PEDIDO: ⛔ hay cron ni importación
 * con el corte, porque Ingresos puede tener productos en precarga. Medido 3-nov: Zattia 285 de 285 productos creados en TN desde agosto tienen SKU en Ingresos, BDI 99 de 100.
 *
 * - En la lista, lo que ya está es «Listo» (`listos`) y lo que falta, «Pendiente» (Bruno, 3-nov: «te aparece lo viejo como ya listo»).
 * - QUÉ SE OFRECE (`candidatos`), Bruno 3-nov: «OC confirmada, se trae». `habitual` (Admin y Administración): sólo el producto con un renglón confirmado de una OC desde el corte que
 *   ⛔ cruza con el ERP, aunque su `updated_at` sea anterior (sin eso, ese restock quedaría sin stock). `excepcional` (sólo Admin): el producto SIN esa OC tocado en Ingresos desde el
 *   corte: entra con stock 0. `prueba` (`PRODUCTO_INGRESOS_PRUEBA`, antes del corte, sólo Admin): todo lo que falta, para traerlo antes de cortar. `deleted` ⛔ se ofrece en ninguna.
 *   Lo cargado antes del corte, sin OC nueva, ⛔ aparece en las de después del corte: se trae antes de cortar.
 * - El vínculo es el SKU (o el código): una variante que ya cruza con el ERP ⛔ se crea.
 * - Producto sin ninguna variante en el ERP ⇒ producto nuevo con sus variantes. Con variantes en UN producto nuestro ⇒ lo que falta se le agrega a ése. Con variantes en DOS o
 *   más, o un talle ya ocupado ⇒ ⛔ se crea: va a `a_vincular`, lo decide una persona.
 * - Variante sin SKU, inactiva o de otra línea (`STU…` en Zattia) ⛔ se importa y se cuenta.
 * - Los ids salen de `catalogo_id` (≥ 1.000.000.000) y la fila es `fuente = 'carga'`: la copia de GN ⛔ la toca. De dónde vino queda en `catalogo_edicion` (`alta`).
 * - 🔴 ⛔ crea stock: la unidad entra por la OC (`lib/fuentes/recepciones.mjs`), que cruza por el mismo SKU y entra cuando aparece la variante, con su hora.
 */
import { lineaDe } from './depositos.mjs'

const norm = (x) => String(x ?? '').trim().toUpperCase()

/**
 * El talle como lo escribe GN (medido 3-nov contra lo que ya cruza): sólo talle o sólo color tal cual; con los dos, BDI `iPhone 13 - AZUL` y
 * Zattia `NEGRO - M`; sin ninguno, `Variante Única`.
 */
export function talleDe(v, marca) {
  const s = String(v?.size ?? '').trim()
  const c = String(v?.color ?? '').trim()
  if (s && c) return marca === 'bdi' ? `${s} - ${c}` : `${c} - ${s}`
  return s || c || 'Variante Única'
}

/**
 * @param {{ marca: 'bdi'|'zattia', base?: string, productos: any[], variantes: Array<{ product_id: any, sku?: string|null, barcode?: string|null, talle?: string|null }> }} o
 */
export function planImportar({ marca, productos, variantes }) {
  if (!['bdi', 'zattia'].includes(marca)) throw new Error(`planImportar: ${marca} ⛔ se importa de Ingresos`)
  const r = { leidos: productos.length, borrados: 0, ya_estan: 0, sin_sku: 0, inactivas: 0, otra_linea: 0, codigo_repetido: 0, a_vincular: [], crear: [], agregar: [], listos: [] }
  const porSku = new Map()
  const porCodigo = new Map()
  const talles = new Map()
  for (const v of variantes) {
    const pid = String(v.product_id)
    if (norm(v.sku)) { if (!porSku.has(norm(v.sku))) porSku.set(norm(v.sku), new Set()); porSku.get(norm(v.sku)).add(pid) }
    if (norm(v.barcode)) porCodigo.set(norm(v.barcode), pid)
    if (!talles.has(pid)) talles.set(pid, new Set())
    if (v.talle) talles.get(pid).add(String(v.talle).trim().toLowerCase())
  }
  const codigosDeLaTanda = new Set()
  for (const p of productos) {
    if (p.status === 'deleted') { r.borrados++; continue }
    const nuestros = new Set()
    const faltan = []
    for (const v of p.variants ?? []) {
      const sku = norm(v.sku)
      const enSku = sku ? porSku.get(sku) : null
      const enCodigo = norm(v.barcode) ? porCodigo.get(norm(v.barcode)) : null
      if (enSku || enCodigo) {
        r.ya_estan++
        for (const pid of enSku ?? []) nuestros.add(pid)
        if (enCodigo) nuestros.add(enCodigo)
        continue
      }
      if (v.active === false) { r.inactivas++; continue }
      if (!sku) { r.sin_sku++; continue }
      if (lineaDe(marca, sku) !== marca) { r.otra_linea++; continue }
      let barcode = String(v.barcode ?? '').trim() || null
      if (barcode && codigosDeLaTanda.has(norm(barcode))) { r.codigo_repetido++; barcode = null }
      if (barcode) codigosDeLaTanda.add(norm(barcode))
      faltan.push({ ingresos_id: v.id ?? null, sku: String(v.sku).trim(), barcode, talle: talleDe(v, marca) })
    }
    if (!faltan.length) {
      if (nuestros.size) r.listos.push({ ingresos_id: p.id, nombre: p.name ?? null, status: p.status ?? null, updated_at: p.updated_at ?? null, variantes: (p.variants ?? []).length })
      continue
    }
    if (nuestros.size > 1) {
      r.a_vincular.push({ ingresos_id: p.id, nombre: p.name ?? null, motivo: 'en_varios_productos', productos: [...nuestros], variantes: faltan.length })
      continue
    }
    // Dos variantes con el mismo talle en un producto: ⛔ se sabe cuál es cuál.
    const ocupados = new Set(nuestros.size ? talles.get([...nuestros][0]) ?? [] : [])
    const repetido = faltan.find((f) => { const t = f.talle.toLowerCase(); const ya = ocupados.has(t); ocupados.add(t); return ya })
    if (repetido) {
      r.a_vincular.push({ ingresos_id: p.id, nombre: p.name ?? null, motivo: 'talle_repetido', talle: repetido.talle, variantes: faltan.length })
      continue
    }
    if (nuestros.size === 1) r.agregar.push({ ingresos_id: p.id, nombre: p.name ?? null, status: p.status ?? null, updated_at: p.updated_at ?? null, product_id: [...nuestros][0], variantes: faltan })
    else r.crear.push({ ingresos_id: p.id, nombre: String(p.name ?? '').trim() || '(sin nombre)', categoria: String(p.category ?? '').trim() || null, status: p.status ?? null, updated_at: p.updated_at ?? null, variantes: faltan })
  }
  return r
}

const leerVariantes = async (db) => (await db.query('select product_id, sku, barcode, talle from variante')).rows

/** Qué lista se pide. */
export const MODOS = ['habitual', 'excepcional', 'prueba']

/**
 * Lo que Ingresos tiene y el ERP ⛔, para elegir. Puro.
 * @param {{ marca: 'bdi'|'zattia', productos: any[], variantes: any[], corte: string, skusDeOc?: Map<string, { oc: string }>, modo: 'habitual'|'excepcional'|'prueba' }} o `skusDeOc`: los de OC desde el corte que ⛔ cruzan, por SKU normalizado
 */
export function candidatos({ marca, productos, variantes, corte, skusDeOc = new Map(), modo }) {
  if (!MODOS.includes(modo)) throw new Error(`candidatos: modo desconocido «${modo}»`)
  const desde = Date.parse(corte)
  if (Number.isNaN(desde)) throw new Error('candidatos: falta el instante del corte')
  const deOc = (p) => (p.variants ?? []).filter((v) => skusDeOc.has(norm(v.sku)))
  const entra = {
    habitual: (p) => deOc(p).length > 0,
    excepcional: (p) => !deOc(p).length && Date.parse(p.updated_at ?? '') >= desde,
    prueba: () => true,
  }[modo]
  const elegibles = productos.filter(entra)
  const plan = planImportar({ marca, productos: elegibles, variantes })
  const oc = new Map(productos.map((p) => [p.id, [...new Set(deOc(p).map((v) => skusDeOc.get(norm(v.sku)).oc))]]))
  // «Listo»: todo lo que Ingresos tiene vivo y el ERP ya tiene, sea de cuando sea. «Pendiente» sí mira el corte; esto ⛔ importa nada.
  plan.listos = planImportar({ marca, productos, variantes }).listos
  for (const x of [...plan.crear, ...plan.agregar, ...plan.a_vincular]) x.ocs = oc.get(x.ingresos_id) ?? []
  // El SKU de una OC que ningún producto vivo de Ingresos trae: ⛔ se puede importar, y ⛔ entra stock. Se dice.
  const vivos = new Set(productos.filter((p) => p.status !== 'deleted').flatMap((p) => (p.variants ?? []).map((v) => norm(v.sku))))
  plan.oc_sin_producto = [...skusDeOc.entries()].filter(([s]) => !vivos.has(s)).map(([sku, d]) => ({ sku, oc: d.oc }))
  return plan
}

/**
 * Los SKU de los renglones CONFIRMADOS de OC desde el corte que ⛔ cruzan con el ERP. Una OC `confirmada` lo está entera (BDI confirma antes de contar); de una `parcial`, cuenta el
 * renglón que ya contó: el aviso guarda 0 en el que todavía ⛔ se confirmó. Las OC viven en la base de BDI para las dos marcas.
 * @returns {Promise<Map<string, { oc: string }>>}
 */
export async function skusDeOcSinCruzar({ control, db, marca, corte }) {
  const lineas = (await control.query(`select l.sku, l.codigo_barras, o.oc_label from recepcion_linea l join recepcion_oc o on o.id = l.oc_ref
    where o.store = $1 and o.confirmada_at >= $2 and l.sku is not null and (o.oc_estado <> 'parcial' or coalesce(l.cantidad_contada, 0) > 0)`, [marca, corte])).rows
  const hay = await leerVariantes(db)
  const skus = new Set(hay.map((v) => norm(v.sku)).filter(Boolean))
  const codigos = new Set(hay.map((v) => norm(v.barcode)).filter(Boolean))
  const salida = new Map()
  for (const l of lineas) {
    if (skus.has(norm(l.sku)) || (norm(l.codigo_barras) && codigos.has(norm(l.codigo_barras)))) continue
    if (!salida.has(norm(l.sku))) salida.set(norm(l.sku), { oc: l.oc_label ?? null })
  }
  return salida
}

/**
 * Importa los productos ELEGIDOS, de los que hoy se ofrecen. Se vuelve a calcular con el candado: lo que entró en el medio ⛔ se duplica, y un id que ya ⛔ se ofrece
 * ⛔ se importa (vuelve en `no_disponibles`).
 * @param {import('pg').ClientBase} db la base de la marca, sin transacción abierta
 * @param {{ marca: 'bdi'|'zattia', productos: any[], corte: string, skusDeOc?: Map<string, { oc: string }>, elegidos: number[], usuario: string, modo: 'habitual'|'excepcional'|'prueba' }} o
 */
export async function importarElegidos(db, { marca, productos, corte, skusDeOc, elegidos, usuario, modo }) {
  if (!String(usuario ?? '').trim()) throw new Error('importarElegidos: falta quién importa')
  const pedidos = new Set(elegidos.map(Number))
  const [{ empresa_id: empresa } = {}] = (await db.query('select empresa_id from marca where id = $1', [marca])).rows
  if (!empresa) throw new Error(`Falta la marca ${marca} en esta base`)
  const anotar = (entidad, product_id, size_id, despues) => db.query(
    `insert into catalogo_edicion (empresa_id, entidad, product_id, size_id, campo, antes, despues, desde_gn, usuario) values ($1, $2, $3, $4, 'alta', null, $5, false, $6)`,
    [empresa, entidad, product_id, size_id, despues, usuario],
  )
  await db.query('begin')
  try {
    await db.query(`select pg_advisory_xact_lock(hashtext('copiar-catalogo'))`)
    const plan = candidatos({ marca, productos, variantes: await leerVariantes(db), corte, skusDeOc, modo })
    const crear = plan.crear.filter((p) => pedidos.has(Number(p.ingresos_id)))
    const agregar = plan.agregar.filter((p) => pedidos.has(Number(p.ingresos_id)))
    const hechos = new Set([...crear, ...agregar].map((p) => Number(p.ingresos_id)))
    const ponerVariantes = async (product_id, variantes) => {
      for (const v of variantes) {
        const [{ size_id }] = (await db.query(`select nextval('catalogo_id')::bigint as size_id`)).rows
        await db.query(`insert into variante (empresa_id, product_id, size_id, talle, sku, barcode, fuente, usuario) values ($1, $2, $3, $4, $5, $6, 'carga', $7)`,
          [empresa, product_id, size_id, v.talle, v.sku, v.barcode, usuario])
        await anotar('variante', product_id, size_id, `${v.talle} · Ingresos ${v.ingresos_id ?? '?'}`)
      }
    }
    for (const p of crear) {
      const [{ id }] = (await db.query(`select nextval('catalogo_id')::bigint as id`)).rows
      await db.query(`insert into producto (empresa_id, id, marca, nombre, categoria, activo, fuente, usuario) values ($1, $2, $3, $4, $5, true, 'carga', $6)`,
        [empresa, id, marca, p.nombre, p.categoria, usuario])
      await anotar('producto', id, null, `${p.nombre} · Ingresos ${p.ingresos_id}`)
      await ponerVariantes(id, p.variantes)
    }
    for (const p of agregar) await ponerVariantes(p.product_id, p.variantes)
    await db.query('commit')
    return {
      productos_nuevos: crear.length, productos_con_agregadas: agregar.length,
      variantes_nuevas: [...crear, ...agregar].reduce((a, p) => a + p.variantes.length, 0),
      no_disponibles: [...pedidos].filter((id) => !hechos.has(id)),
      // Los códigos que entraron: quien llama recalcula su stock y el espejo de esas variantes.
      skus: [...crear, ...agregar].flatMap((p) => p.variantes.map((v) => v.sku)),
    }
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
}

export { leerVariantes as variantesDelErp }
