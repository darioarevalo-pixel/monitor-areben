/**
 * **Lo que el CRM y el panel de WhatsApp leen, del ERP** (Bruno 15-nov: «hay que pasar todo al ERP… a Darío le tiene que andar, y
 * no podemos depender de los espejos»). El monitor (`api/_crm.js`) lo usa cuando la línea ya cortó (`erp_corte`); antes, el espejo.
 *
 * 🔑 FORMA: la de GN, la MISMA que `espejo_motor.ventas` / `venta_detalles` (sql/045 + 083): id de venta = `gn_sale_id` o
 *    `id_espejo`; cliente = `gn_client_id` o `id_espejo` (y, para la historia de GN sin ficha, el de la foto `venta_gn`); fecha, canal
 *    por número y total, los de GN para su historia. Sólo las columnas que el CRM pide. Sólo lo confirmado y ⛔ de prueba.
 * 🔑 POR QUÉ ⛔ LA VISTA: filtrada por cliente tarda 5 s (medido 15-nov): `client_id` es una expresión sobre tres tablas y ⛔ usa
 *    índice. Acá se resuelve primero el cliente (índices de 083) y después sus ventas. 🔴 La copia de la regla la amarra
 *    `test/crm-lectura-pg.mjs`: para las mismas ventas, lo de acá = lo de la vista, columna por columna.
 * 🔑 Los números vuelven como números (`float8`/`integer`) y la fecha como 'AAAA-MM-DD': lo que contestaba PostgREST.
 */
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const EMPRESA = 'areben'
const ART = `'America/Argentina/Buenos_Aires'`

/** El canal por número de GN de BDI (sql/083): lo que el CRM usa para separar Mayorista (10) y Whatsapp (8). */
const CANAL_ID = `case when v.marca = 'bdi' then case v.canal when 'online' then 16 when 'local' then 3 when 'mayorista' then 10
  when 'ml' then 7 when 'gn_whatsapp' then 8 when 'gn_ninguno' then 12 when 'gn_influencer' then 15 end end`

/** Las columnas de una venta para el CRM, con la regla de `espejo_motor.ventas`. Sobre `venta v`, `cliente c`, `venta_gn g`. */
const VENTA = `coalesce(v.gn_sale_id, v.id_espejo)::integer as id,
  coalesce(g.fecha, (v.ocurrida_en at time zone ${ART})::date)::text as date_sale,
  coalesce((v.detalle->>'total_gn')::numeric, v.total)::float8 as total_price,
  coalesce(c.gn_client_id, c.id_espejo, g.client_id)::integer as client_id,
  coalesce(g.channel_id, ${CANAL_ID})::integer as channel_id,
  coalesce(v.detalle->>'canal_gn',
    case v.canal when 'local' then 'Mi Local' when 'online' then 'Tienda Nube' when 'mayorista' then 'Mayorista'
         when 'ml' then 'Mercadolibre' when 'gn_whatsapp' then 'Whatsapp' when 'gn_ninguno' then 'Ninguno'
         when 'gn_influencer' then 'Influencer' else v.canal end) as channel,
  coalesce(v.detalle->>'estado_gn',
    case when v.origen in ('tn', 'ml') and v.entrega is null then 'Pedido'
         when v.origen in ('tn', 'ml') then 'Entregado' else 'Cerrado' end) as sale_state`
const JUNTA = `from venta v left join cliente c on c.id = v.cliente_id left join venta_gn g on g.venta_id = v.id`
const VIVA = `v.marca = $1 and v.estado = 'confirmada' and not v.prueba`
const ORDEN = `order by date_sale desc, id desc`

/**
 * El número del cliente (el que ve el CRM y guarda el seguimiento): el de GN, o el propio del ERP (en BDI desde 704.001, sql/083).
 * 🔴 Un cliente de GN TAMBIÉN tiene `id_espejo` (interno, ⛔ se ve) ⇒ al buscar por número, el propio se mira sólo sin número de GN.
 */
const ID_CLIENTE = `coalesce(c.gn_client_id, c.id_espejo)::integer`
const enteros = (ids) => [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]

/**
 * Todas las ventas con cliente (`canal` null), o las de un canal por número más TODAS las de `marcados` (los ★ del CRM).
 * @param {import('pg').Client} db @param {string} marca @param {{ canal?: number|null, marcados?: number[] }} [o]
 */
export async function ventasDelCrm(db, marca, { canal = null, marcados = [] } = {}) {
  const filtro = canal == null ? '' : 'and (x.channel_id = $2 or x.client_id = any($3::integer[]))'
  return q(db, `select x.id, x.date_sale, x.total_price, x.client_id, x.channel_id, x.sale_state, x.channel
    from (select ${VENTA} ${JUNTA} where ${VIVA}) x where x.client_id is not null ${filtro} ${ORDEN}`,
  canal == null ? [marca] : [marca, Number(canal), enteros(marcados)])
}

/**
 * Las ventas de ESTOS clientes (por su número del CRM), con índice: primero las fichas, después sus ventas. `canales` filtra por
 * canal por número (la búsqueda «¿es un cliente mío?»).
 * @param {import('pg').Client} db @param {string} marca @param {number[]} ids @param {{ canales?: number[] }} [o]
 */
export async function ventasDeClientes(db, marca, ids, { canales = null } = {}) {
  const lista = enteros(ids)
  if (!lista.length) return []
  return q(db, `with cand as (
      select v.id from cliente c join venta v on v.cliente_id = c.id
       where c.empresa_id = $3 and (c.gn_client_id = any($2::bigint[]) or (c.gn_client_id is null and c.id_espejo = any($2::bigint[])))
      union
      select g.venta_id from venta_gn g where g.client_id = any($2::bigint[]))
    select x.id, x.date_sale, x.total_price, x.client_id, x.channel_id, x.sale_state, x.channel
      from (select ${VENTA} ${JUNTA} where v.id in (select id from cand) and ${VIVA}) x
     where x.client_id = any($2::bigint[]) ${canales ? 'and x.channel_id = any($4::integer[])' : ''} ${ORDEN}`,
  canales ? [marca, lista, EMPRESA, enteros(canales)] : [marca, lista, EMPRESA])
}

/**
 * Los renglones de estas ventas (por su id del CRM), con la regla de `espejo_motor.venta_detalles`.
 * @param {import('pg').Client} db @param {string} marca @param {number[]} ids
 */
export async function detallesDeVentas(db, marca, ids) {
  const lista = enteros(ids)
  if (!lista.length) return []
  return q(db, `select coalesce(v.gn_sale_id, v.id_espejo)::integer as sale_id, p.nombre as product_name,
      coalesce(va.talle, v.detalle->'talles_gn'->>(l.n::text)) as size, l.cantidad::integer as quantity,
      l.precio::float8 as unit_price, l.importe::float8 as total
    from venta v join venta_linea l on l.venta_id = v.id
    left join producto p on p.empresa_id = v.empresa_id and p.id = l.product_id
    left join variante va on va.empresa_id = v.empresa_id and va.product_id = l.product_id and va.size_id = l.size_id
   where (v.gn_sale_id = any($2::bigint[]) or v.id_espejo = any($2::bigint[])) and ${VIVA}
   order by sale_id, l.n`, [marca, lista])
}

/** Las columnas de una ficha para el CRM (las de `espejo_motor.clientes`). */
const FICHA = `${ID_CLIENTE} as id, btrim(c.nombre) as name, c.email, c.whatsapp as phone, c.ciudad as city, c.provincia as province`

/** Las fichas de estos clientes (por su número del CRM). @param {import('pg').Client} db @param {number[]} ids */
export async function clientesPorId(db, ids) {
  const lista = enteros(ids)
  if (!lista.length) return []
  return q(db, `select ${FICHA} from cliente c
    where c.empresa_id = $1 and (c.gn_client_id = any($2::bigint[]) or (c.gn_client_id is null and c.id_espejo = any($2::bigint[]))) order by 1`, [EMPRESA, lista])
}

/** Todos los teléfonos del padrón: `{ id, phone }` (para el índice del panel). @param {import('pg').Client} db */
export async function telefonosDelPadron(db) {
  return q(db, `select ${ID_CLIENTE} as id, c.whatsapp as phone from cliente c where c.empresa_id = $1 and c.whatsapp is not null order by 1`, [EMPRESA])
}

/**
 * Los que tienen TODOS estos patrones `ILIKE` en el nombre (el armado del patrón es del que llama), por nombre, hasta `tope`.
 * @param {import('pg').Client} db @param {string[]} patrones @param {number} tope
 */
export async function clientesPorNombre(db, patrones, tope) {
  if (!patrones.length) return []
  return q(db, `select ${ID_CLIENTE} as id, btrim(c.nombre) as name, c.ciudad as city, c.whatsapp as phone from cliente c
    where c.empresa_id = $1 and c.nombre ilike all($2::text[]) order by c.nombre limit $3`, [EMPRESA, patrones, tope])
}
