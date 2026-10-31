/**
 * Lo que lee y escribe el libro en las bases. Las reglas viven en los módulos puros; acá sólo SQL.
 */
import { existe, tieneColumna } from './db.mjs'
import { diaSiguiente, fechaAR, indiceDeVariantes, medianocheAR } from './depositos.mjs'

/**
 * Las variantes, de la tabla PROPIA `variante` (sql/012): hasta el corte la copia de GN cada 2 h (`bin/catalogo.mjs`),
 * después la carga del ERP. Ordenada: un SKU repetido en varias variantes lo gana siempre la misma (con `inventario`
 * ganaba la que el espejo devolviera última).
 */
export async function cargarIndice(db) {
  return indiceDeVariantes(await db.q('select product_id, size_id, sku, barcode from variante order by product_id, size_id'))
}

/**
 * Los cortes por línea (`erp_corte`, sql/063): `{ stunned: '2026-10-28T23:40:27.759Z', … }`. 🔴 Sin la tabla FALLA: proyectar sin
 * saber qué línea cortó contaría dos veces lo que GN siga trayendo de ella (⛔ un default vacío callado).
 */
export async function cargarCortes(db) {
  if (!(await existe(db, 'erp_corte'))) throw new Error('Falta la tabla erp_corte (sql/063): sin ella no se sabe qué línea ya cortó.')
  const rows = await db.q('select linea, instante from erp_corte')
  return Object.freeze(Object.fromEntries(rows.map((r) => [r.linea, new Date(r.instante).toISOString()])))
}

/** La apertura del libro (T0), o null si todavía no se abrió (o si la tabla no existe). */
export async function cargarApertura(db) {
  if (!(await existe(db, 'stock_movimiento'))) return null
  const [r] = await db.q(`select min(ocurrido_en) as tomada_en, count(*)::int as filas from stock_movimiento where tipo = 'apertura'`)
  if (!r.tomada_en) return null
  return { fecha: fechaAR(r.tomada_en), tomada_en: new Date(r.tomada_en).toISOString(), filas: r.filas }
}

/** Las fechas con foto, con la hora de la primera fila de cada una. */
export async function cargarFechasDeFoto(db) {
  if (!(await existe(db, 'stock_foto'))) return []
  const rows = await db.q('select fecha, min(tomada_en) as tomada_en, count(*)::int as filas from stock_foto group by fecha order by fecha')
  return rows.map((r) => ({ fecha: r.fecha, tomada_en: new Date(r.tomada_en).toISOString(), filas: r.filas }))
}

export async function cargarFoto(db, f) {
  return { ...f, filas: await db.q('select product_id, size_id, store_name, cantidad from stock_foto where fecha = $1', [f.fecha]) }
}

/** Las fuentes desde un día (`desde`, `YYYY-MM-DD`). `dbBdi`: las recepciones de las dos marcas viven en BDI. */
export async function cargarFuentes(db, dbBdi, desde) {
  const ventas = await db.q(
    `select id, date_sale, gn_created_at, store, channel, sale_state, integration_id, integration_source, tn_order from ventas where date_sale >= $1`,
    [desde],
  )
  const detalles = await db.q(
    `select d.sale_id, d.product_id, d.size_id, d.quantity from venta_detalles d join ventas v on v.id = d.sale_id where v.date_sale >= $1`,
    [desde],
  )
  const armados = (await existe(db, 'repo_armado'))
    ? await db.q(`select id, sentido, linea, transfer, cerrado_en, actualizado_en from repo_armado where transfer is not null`)
    : []
  // Las tandas de Reposición que ya tienen documento (enviado o recibido) las cuenta el documento, ⛔ el armado.
  const documentadas = (await existe(db, 'stock_transferencia'))
    ? (await db.q(`select origen_ref from stock_transferencia where origen = 'reposicion' and origen_ref is not null and estado in ('en_transito', 'recibida')`)).map((r) => r.origen_ref)
    : []
  const ocs = await dbBdi.q(
    `select id, oc_label, oc_estado, confirmada_at, recibido_en from recepcion_oc where store = $1 and coalesce(confirmada_at, recibido_en) >= $2`,
    [db.base, medianocheAR(desde)],
  )
  const lineas = ocs.length
    ? await dbBdi.q(`select id, oc_ref, sku, codigo_barras, cantidad_contada from recepcion_linea where oc_ref = any($1)`, [ocs.map((o) => o.id)])
    : []
  // Un día antes: los duplicados de un conteo son del mismo día, y así el de id menor siempre entra.
  const conteos = await db.q(
    `select id, ubicacion, fecha_aplicado, created_at, detalle from conteos_deposito where coalesce(fecha_aplicado, created_at) >= $1`,
    [medianocheAR(diaSiguiente(desde, -1))],
  )
  const purgadas = await cargarPurgadas(db, desde)
  const propias = await cargarPropias(db, dbBdi, desde)
  return { ventas, detalles, armados, documentadas, ocs, lineas, conteos, purgadas, ...propias }
}

/**
 * Las fuentes propias (F2). Un día de margen hacia atrás: el filtro fino es `posterioresA`, y un hecho
 * propio puede tomar la hora de su venta de GN.
 */
async function cargarPropias(db, dbBdi, desde) {
  const t = medianocheAR(diaSiguiente(desde, -1))
  // `anulada_en_gn` la anota la Caja (cierre del turno o sync) cuando GN ya no tiene la venta;
  // sin la migración (la corre Bruno) se lee null y queda la deducción por el espejo.
  const cajas = (await existe(db, 'caja_venta'))
    ? await db.q(
        `select id, estado, payload, gn_sale_id, en_gn_en, creada_en, ${(await tieneColumna(db, 'caja_venta', 'anulada_en_gn')) ? 'anulada_en_gn' : 'null as anulada_en_gn'}
         from caja_venta where estado = 'en_gn' and coalesce(en_gn_en, creada_en) >= $1`,
        [t],
      )
    : []
  // La hora del último sync de ventas: lo que el espejo no trae y es anterior, GN ya no lo tiene.
  const [sync] = await db.q(`select updated_at from sync_state where clave = 'diario'`).catch(() => [])
  // Fallas, canjes y solicitudes son tablas chicas: se leen enteras y `posterioresA` filtra.
  const fallas = (await existe(db, 'fallas_deposito'))
    ? await db.q(`select id, product_id, size_id, cantidad, ubicacion, gn_venta_id, historial, created_at from fallas_deposito where gn_venta_id is not null`)
    : []
  const solicitudes = (await existe(db, 'solicitudes'))
    ? await db.q(`select id, store, kind, datos from solicitudes where kind in ('sesionfotos', 'solicitudesinternas') and datos ? 'ventas'`)
    : []
  // Los canjes viven en la base de BDI para todas las marcas, pero sólo los de BDI crean venta en GN.
  let canjes = []
  let canjeItems = []
  if (db.base === 'bdi' && (await existe(dbBdi, 'canjes'))) {
    canjes = await dbBdi.q(`select id, store, gn_venta_id, stock_estado, retiro_local, compra_at, updated_at from canjes where gn_venta_id is not null and store = 'bdi'`)
    canjeItems = canjes.length
      ? await dbBdi.q(`select canje_id, product_id, size_id, sku, cantidad, estado from canje_items where canje_id = any($1)`, [canjes.map((c) => c.id)])
      : []
  }
  // El registro de ventas del monitor (13-oct-2026): mientras la migración no esté, vacío.
  const registro = (await existe(db, 'gn_venta_monitor'))
    ? await db.q(`select gn_venta_id, marca, proposito, ref, store_id, lineas, creada_en, anulada_en from gn_venta_monitor where creada_en >= $1`, [t])
    : []
  return { cajas, fallas, solicitudes, canjes, canjeItems, registro, espejoAl: sync?.updated_at ? new Date(sync.updated_at).toISOString() : null }
}

/** Lo que el libro ya tiene, sumado por hecho (origen, clave). */
export async function cargarExistentes(db, origenes) {
  if (!(await existe(db, 'stock_movimiento'))) return []
  return db.q(
    `select origen, clave, sum(cantidad)::int as suma, count(*)::int as n,
            min(linea) as linea, min(product_id) as product_id, min(size_id) as size_id, min(sku) as sku, min(barcode) as barcode,
            min(deposito) as deposito, min(grupo) as grupo, min(gn_venta_id) as gn_venta_id, min(ocurrido_en) as ocurrido_en, bool_and(hora_exacta) as hora_exacta
       from stock_movimiento where origen = any($1) group by origen, clave`,
    [origenes],
  )
}

const COLUMNAS = `linea text, product_id bigint, size_id bigint, sku text, barcode text, deposito text, cantidad int, tipo text,
  origen text, clave text, origen_ref text, gn_venta_id bigint, ocurrido_en timestamptz, hora_exacta boolean, grupo text, detalle jsonb`

/** Agrega movimientos. Un `origen_ref` que ya está se saltea (dos corridas a la vez ⛔ duplican). */
export async function escribirMovimientos(db, movimientos) {
  let n = 0
  for (let i = 0; i < movimientos.length; i += 1000) {
    n += await db.run(
      `insert into stock_movimiento (linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, gn_venta_id, ocurrido_en, hora_exacta, grupo, detalle)
       select linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, gn_venta_id, ocurrido_en, hora_exacta, grupo, coalesce(detalle, '{}'::jsonb)
         from jsonb_to_recordset($1::jsonb) as x(${COLUMNAS})
       on conflict (origen, origen_ref) do nothing`,
      [JSON.stringify(movimientos.slice(i, i + 1000))],
    )
  }
  return n
}

/**
 * Los movimientos de la ventana (foto anterior, foto actual] y los ingresos/ajustes del día de antes.
 * El filtro fino lo hace `enVentana` (lib/diff.mjs); esto trae un superconjunto.
 */
export async function cargarVentana(db, ant, act) {
  const desde = new Date(Math.min(new Date(ant.tomada_en).getTime() - 24 * 3600e3, medianocheAR(ant.fecha).getTime() - 24 * 3600e3))
  const hasta = new Date(Math.max(new Date(act.tomada_en).getTime(), medianocheAR(act.fecha).getTime()))
  return db.q(
    `select linea, product_id, size_id, deposito, cantidad, tipo, origen, ocurrido_en, hora_exacta from stock_movimiento where ocurrido_en > $1 and ocurrido_en <= $2`,
    [desde, hasta],
  )
}

/** El nivel del libro a la hora de una foto, por variante × depósito. */
export async function cargarNivel(db, act) {
  const rows = await db.q(
    `select product_id, size_id, deposito, sum(cantidad)::int as n from stock_movimiento
      where (hora_exacta and ocurrido_en <= $1) or (not hora_exacta and ocurrido_en < $2)
      group by 1, 2, 3`,
    [act.tomada_en, medianocheAR(act.fecha)],
  )
  return new Map(rows.map((r) => [`${r.product_id}:${r.size_id}:${r.deposito}`, r.n]))
}

export async function cargarResiduos(db, fecha) {
  if (!(await existe(db, 'stock_diff'))) return new Map()
  const rows = await db.q('select product_id, size_id, deposito, delta_gn - delta_libro as r from stock_diff where fecha = $1', [fecha])
  return new Map(rows.map((r) => [`${r.product_id}:${r.size_id}:${r.deposito}`, r.r]))
}

/** Reemplaza el diff de un día entero (el diff ⛔ es el libro: se recalcula). */
export async function escribirDiff(db, { act, ant, filas, reclasificarAyer, resumen }) {
  await db.run('delete from stock_diff where fecha = $1', [act.fecha])
  for (let i = 0; i < filas.length; i += 1000) {
    await db.run(
      `insert into stock_diff (fecha, product_id, size_id, deposito, linea, delta_gn, delta_libro, nivel_gn, nivel_libro, clase, explicacion)
       select * from jsonb_to_recordset($1::jsonb) as x(fecha date, product_id bigint, size_id bigint, deposito text, linea text,
         delta_gn int, delta_libro int, nivel_gn int, nivel_libro int, clase text, explicacion text)`,
      [JSON.stringify(filas.slice(i, i + 1000))],
    )
  }
  for (const k of reclasificarAyer) {
    const [pid, sid, dep] = k.split(':')
    await db.run(
      `update stock_diff set clase = 'en_vuelo', explicacion = 'lo compensa el día siguiente', calculado_en = now()
        where fecha = $1 and product_id = $2 and size_id = $3 and deposito = $4`,
      [ant.fecha, pid, sid, dep],
    )
  }
  await db.run(
    `insert into stock_libro_dia (fecha, foto_desde, foto_hasta, resumen) values ($1, $2, $3, $4)
     on conflict (fecha) do update set foto_desde = excluded.foto_desde, foto_hasta = excluded.foto_hasta, resumen = excluded.resumen, calculado_en = now()`,
    [act.fecha, ant.tomada_en, act.tomada_en, JSON.stringify(resumen)],
  )
}

/**
 * Lo que la purga del espejo borró, listo para la fuente `gn_borrada`. @param {{ q: Function }} db @param {string} desde
 */
export async function cargarPurgadas(db, desde) {
  // Lo que la purga del espejo borró (`ventas_purgadas`, desde el 14-oct): con la venta del espejo al
  // lado para un renglón suelto. Sin la tabla, nada (la fuente queda vacía).
  // 🔴 El sync guarda ANTES de borrar y ⛔ hay unique (code-review de B, 14-oct) ⇒ (1) si un lote del delete
  // falló, queda una fila de una venta que SIGUE en el espejo: cuenta sólo lo que de verdad ya ⛔ está;
  // (2) la misma purgada puede venir repetida: una por (tabla, venta, fila), la ÚLTIMA (la del borrado que
  // anduvo: después de borrada ⛔ se vuelve a purgar ⇒ la clave `b<id>` queda fija).
  return (await existe(db, 'ventas_purgadas'))
    ? await db.q(
      `select * from (
         select distinct on (p.tabla, p.venta_id, p.fila->>'id') p.id, p.purgada_en, p.tabla, p.venta_id, p.fila, p.detalles,
                case when v.id is null then null else jsonb_build_object('store', v.store, 'date_sale', v.date_sale, 'gn_created_at', v.gn_created_at, 'channel', v.channel) end as venta
           from ventas_purgadas p left join ventas v on v.id = p.venta_id
          where case when p.tabla = 'ventas' then v.id is null
                     else not exists (select 1 from venta_detalles d where d.id = (p.fila->>'id')::bigint) end
          order by p.tabla, p.venta_id, p.fila->>'id', p.id desc) u
        where u.purgada_en >= $1`,
      [medianocheAR(diaSiguiente(desde, -1))],
    )
    : []
}

/** Las claves de realineo (`lib/fuentes/conteos.mjs`) que ya están en el libro: se escriben UNA vez. */
export async function realineosEscritos(db, claves) {
  if (!claves.length || !(await existe(db, 'stock_movimiento'))) return new Set()
  const rows = await db.q(`select clave from stock_movimiento where origen = 'realineo' and clave = any($1)`, [claves])
  return new Set(rows.map((r) => r.clave))
}

/** Las claves de conteo propio (`libro:…`, lib/fuentes/conteos.mjs) que ya están en el libro: se escriben UNA vez. */
export async function conteosPropiosEscritos(db, claves) {
  if (!claves.length || !(await existe(db, 'stock_movimiento'))) return new Set()
  const rows = await db.q(`select clave from stock_movimiento where origen = 'conteo' and clave = any($1)`, [claves])
  return new Set(rows.map((r) => r.clave))
}

/** El libro de cada (variante, depósito) ANTES de una hora: `[{ clave, product_id, size_id, deposito, cuando }]` ⇒ clave → nivel. */
export async function nivelesAntesDe(db, pedidos) {
  if (!pedidos.length) return new Map()
  const rows = await db.q(
    `select p.clave, coalesce((select sum(m.cantidad) from stock_movimiento m where m.product_id = p.pid and m.size_id = p.sid
        and m.deposito = p.dep and m.ocurrido_en < p.cuando), 0)::int as nivel
       from unnest($1::text[], $2::bigint[], $3::bigint[], $4::text[], $5::timestamptz[]) as p(clave, pid, sid, dep, cuando)`,
    [pedidos.map((p) => p.clave), pedidos.map((p) => p.product_id), pedidos.map((p) => p.size_id), pedidos.map((p) => p.deposito), pedidos.map((p) => p.cuando)],
  )
  return new Map(rows.map((r) => [r.clave, Number(r.nivel)]))
}
