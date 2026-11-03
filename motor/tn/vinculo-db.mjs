/**
 * «Vincular» contra la base: qué falta vincular, buscar la variante del ERP y guardar lo elegido (sql/076). Desde el corte nadie más
 * vincula: el próximo iPhone se resuelve acá. Devuelve `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje } }`.
 *
 * 🔴 `db.q(sql, params)` devuelve las filas. Los ids de TN son bigint ⇒ pg los trae como texto: acá se pasan a número, y un `Map` por id
 * con los dos tipos da «0 de 94» (ya pasó el 3-nov).
 */
import { indiceDeVariantes, lineaDe } from '../depositos.mjs'
import { comparteStock, valoresDe, vinculosPendientes } from './vinculo.mjs'

const fallo = (codigo, mensaje) => ({ ok: false, error: { codigo, mensaje } })
const SIN_TABLA = fallo('SIN_TABLA', 'Los vínculos de Tienda Nube todavía no están en la base del motor (migración 076).')
const hayTabla = async (db) => (await db.q(`select to_regclass('public.tn_vinculo') is not null as hay`))[0].hay
const baseDe = (tienda) => (tienda === 'bdi' ? 'bdi' : 'zattia')
const TIENDAS = ['bdi', 'zattia', 'stunned']
// 🔴 Tienda Nube dice «CÁMARA» y GN «CAMARA»: sin esto, el nombre que trae la pantalla ⛔ encuentra nada (visto en prod, 3-nov).
const TILDES = 'ÁÉÍÓÚÜÑáéíóúüñ'
const SIN = 'AEIOUUNaeiouun'
const sinTildes = (t) => String(t ?? '').replace(/[ÁÉÍÓÚÜÑáéíóúüñ]/g, (c) => SIN[TILDES.indexOf(c)])

const variantesDeTN = async (db, tienda) => (await db.q(
  `select v.variant_id, v.tn_product_id, v.sku, v.barcode, v.valores, v.stock, p.nombre, p.publicado
     from tn_variante v join tn_producto p on p.tienda = v.tienda and p.tn_id = v.tn_product_id
    where v.tienda = $1`, [tienda],
)).map((v) => ({ ...v, id: Number(v.variant_id), tn_product_id: Number(v.tn_product_id) }))

const indiceConVinculos = async (db) => indiceDeVariantes(
  await db.q('select product_id, size_id, sku, barcode from variante order by product_id, size_id'),
  await db.q('select variant_id, product_id, size_id from tn_vinculo'),
)

/** El nombre de cada variante del ERP (el del espejo de GN, el mismo que lee el catálogo). */
const nombresDeVariantes = async (db, pares) => {
  const ids = [...new Set(pares.map((p) => Number(p.product_id)))]
  if (!ids.length) return new Map()
  const filas = await db.q('select distinct product_id, size_id, product_name, size_name from inventario where product_id = any($1::bigint[])', [ids])
  return new Map(filas.map((f) => [`${Number(f.product_id)}:${Number(f.size_id)}`, `${f.product_name} · ${f.size_name}`]))
}

const fila = (tv) => ({
  variant_id: tv.id, producto: tv.nombre ?? '', publicado: Boolean(tv.publicado), valores: valoresDe(tv),
  sku: tv.sku ?? null, barcode: tv.barcode ?? null, stock: tv.stock == null ? null : Number(tv.stock),
})

/** Lo que falta vincular de una tienda y lo ya elegido en el ERP. */
export async function leerVinculos(db, { tienda }) {
  if (!TIENDAS.includes(tienda)) return fallo('TIENDA_DESCONOCIDA', `Tienda desconocida: ${tienda}`)
  if (!(await hayTabla(db))) return SIN_TABLA
  const variantes = await variantesDeTN(db, tienda)
  const { sin_par, trabados } = vinculosPendientes({ variantes, indice: await indiceConVinculos(db) })
  const elegidas = await db.q(`select variant_id, product_id, size_id, usuario, actualizado_en from tn_vinculo where tienda = $1 and origen = 'erp' order by actualizado_en desc`, [tienda])
  const nombres = await nombresDeVariantes(db, [...trabados, ...elegidas])
  const porId = new Map(variantes.map((v) => [v.id, v]))
  const nombreDe = (p) => nombres.get(`${Number(p.product_id)}:${Number(p.size_id)}`) ?? null
  return {
    ok: true,
    sin_par: sin_par.map(fila),
    trabados: trabados.map((g) => ({ product_id: g.product_id, size_id: g.size_id, nombre: nombreDe(g), variantes: g.variantes.map(fila) })),
    elegidas: elegidas.filter((e) => porId.has(Number(e.variant_id))).map((e) => ({
      ...fila(porId.get(Number(e.variant_id))), product_id: Number(e.product_id), size_id: Number(e.size_id), nombre: nombreDe(e), usuario: e.usuario, actualizado_en: e.actualizado_en,
    })),
  }
}

/** Las variantes del ERP de esa línea que coinciden con TODAS las palabras buscadas (nombre, variante o SKU). */
export async function buscarVariantes(db, { tienda, texto, limite = 30 }) {
  if (!TIENDAS.includes(tienda)) return fallo('TIENDA_DESCONOCIDA', `Tienda desconocida: ${tienda}`)
  const palabras = sinTildes(texto).trim().split(/\s+/).filter(Boolean).slice(0, 6).map((p) => `%${p.replace(/[\\%_]/g, '\\$&')}%`)
  if (!palabras.length) return { ok: true, variantes: [] }
  const filas = await db.q(
    `select distinct i.product_id, i.size_id, i.product_name, i.size_name, v.sku, v.barcode
       from inventario i join variante v on v.product_id = i.product_id and v.size_id = i.size_id
      where (select bool_and(translate(i.product_name || ' ' || i.size_name || ' ' || coalesce(v.sku, ''), '${TILDES}', '${SIN}') ilike p) from unnest($1::text[]) p)
      order by i.product_name, i.size_name limit 500`, [palabras],
  )
  const variantes = filas
    .filter((f) => lineaDe(baseDe(tienda), f.sku) === tienda)
    .slice(0, limite)
    .map((f) => ({ product_id: Number(f.product_id), size_id: Number(f.size_id), producto: f.product_name, talle: f.size_name, sku: f.sku ?? null, barcode: f.barcode ?? null }))
  return { ok: true, variantes }
}

/**
 * Guarda lo elegido por una persona (`origen = 'erp'`: la copia de GN ⛔ lo pisa).
 * 🔑 Bruno, 3-nov: varias variantes de TN sobre una del ERP llevan el mismo stock sólo si cambia el modelo. Con colores distintos ⛔ se guarda.
 * 🔑 Si otra variante de TN ya cruzaba ahí por código o SKU, queda vinculada también: el grupo comparte sólo con todas vinculadas, y sin
 * esto el 18 Pro elegido dejaba trabado al 17 Pro.
 */
export async function guardarVinculoDelERP(db, { tienda, variant_id, product_id, size_id, usuario = null, empresa = 'areben' }) {
  if (!TIENDAS.includes(tienda)) return fallo('TIENDA_DESCONOCIDA', `Tienda desconocida: ${tienda}`)
  if (!(await hayTabla(db))) return SIN_TABLA
  const variantes = await variantesDeTN(db, tienda)
  const tv = variantes.find((v) => v.id === Number(variant_id))
  if (!tv) return fallo('NO_ENCONTRADA', 'Esa variante no está en Tienda Nube.')
  const [erp] = await db.q('select sku from variante where product_id = $1 and size_id = $2', [product_id, size_id])
  if (!erp) return fallo('VARIANTE_DESCONOCIDA', 'Esa variante no está en el ERP.')
  if (lineaDe(baseDe(tienda), erp.sku) !== tienda) return fallo('OTRA_LINEA', 'Esa variante es de otra marca.')

  const indice = await indiceConVinculos(db)
  const cruce = (o) => indice.porVarianteTN(o.id) ?? indice.porBarcode(o.barcode) ?? indice.porSku(o.sku)
  const esLaElegida = (v) => v && Number(v.product_id) === Number(product_id) && Number(v.size_id) === Number(size_id)
  const otras = variantes.filter((o) => o.id !== tv.id && o.stock != null && esLaElegida(cruce(o)))
  // 🔴 SKU repetido (`TWIST CASE`: 7 variantes, varios colores, con el SKU de una): la que YA cruzaba ahí tiene que poder quedarse con su
  // variante aunque las otras todavía ⛔ se movieron; ésas siguen en «Repetidas» y sin stock. Lo que frena es SUMAR una mezcla nueva.
  const yaCruzaba = esLaElegida(cruce(tv))
  const chocan = otras.filter((o) => (indice.porVarianteTN(o.id) || !yaCruzaba) && !comparteStock([tv, o]))
  if (chocan.length) {
    const quien = valoresDe(chocan[0]).join(' / ') || chocan[0].nombre
    return fallo('MEZCLA', `Esa variante ya lleva «${chocan[0].nombre} ${quien}»: no comparten stock si cambia algo más que el modelo. Elegí otra.`)
  }
  const ids = [tv.id, ...otras.filter((o) => !indice.porVarianteTN(o.id) && comparteStock([tv, o])).map((o) => o.id)]
  await db.q(
    `insert into tn_vinculo (empresa_id, tienda, variant_id, product_id, size_id, origen, usuario)
     select $1, $2, x, $4, $5, 'erp', $6 from unnest($3::bigint[]) x
     on conflict (empresa_id, tienda, variant_id) do update
       set product_id = excluded.product_id, size_id = excluded.size_id, origen = 'erp', usuario = excluded.usuario, actualizado_en = now()`,
    [empresa, tienda, ids, product_id, size_id, usuario],
  )
  return { ok: true, vinculadas: ids.length }
}
