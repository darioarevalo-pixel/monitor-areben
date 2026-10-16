/**
 * PROVEEDORES del ERP (`sql/013-proveedor.sql`; Bruno, 15-oct ❓ i: tabla propia, cruzada con PRM). Viaja con `traer-motor`.
 *
 * Devuelven `{ ok: true, … }` o `{ ok: false, error }`; sólo lanzan si la BASE falla.
 */
const q = async (db, sql, params = []) => (await db.query(sql, params)).rows
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * ¿Se pueden usar los proveedores en esta base? La tabla (sql/013) Y el permiso de quien entra: 013 aplicada sin re-dar el rol
 * `motor` da 42501 (code-review 15-oct). UNA regla para el motor, `bin/proveedor.mjs` y el monitor.
 */
export async function hayProveedores(db) {
  const [h] = await q(db, `select to_regclass('public.proveedor') is not null
    and has_table_privilege('public.proveedor', 'INSERT') and has_table_privilege('public.producto', 'UPDATE') as hay`)
  return !!h.hay
}

/** Para ILIKE: `%` y `_` del texto son letras, ⛔ comodines. */
const literal = (t) => t.replace(/[\\%_]/g, (c) => `\\${c}`)

async function empresaDe(db, marca) {
  const [m] = await q(db, 'select empresa_id from marca where id = $1', [String(marca ?? '')])
  return m?.empresa_id ?? null
}

/**
 * Da de alta un proveedor a mano (`fuente = 'carga'`). Un nombre que ya existe (sin mayúsculas ni espacios) ⛔ se repite:
 * devuelve `YA_EXISTE` con el que está, para elegirlo.
 * @param {import('pg').ClientBase} db
 * Con `nombre_gn` (cómo figura en GN) la copia del catálogo le ata los productos con ese texto; uno que ya usa OTRO proveedor
 * frena (`NOMBRE_GN_USADO`). Un repetido sin `nombre_gn` lo toma (⛔ pisa uno que ya tiene).
 * @param {{ marca: string, nombre: string, cuit?: string, nombre_gn?: string, usuario: string }} e
 */
export async function guardarProveedor(db, e) {
  const nombre = texto(e?.nombre)
  if (!nombre) return falla('ENTRADA_INVALIDA', 'Falta el nombre', 'nombre')
  if (nombre.length > 120) return falla('ENTRADA_INVALIDA', 'El nombre es muy largo', 'nombre')
  const cuit = texto(e.cuit)?.replace(/\D/g, '') || null
  if (cuit && !/^\d{11}$/.test(cuit)) return falla('ENTRADA_INVALIDA', 'El CUIT tiene 11 números', 'cuit')
  const usuario = texto(e.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién carga', 'usuario')
  const empresa = await empresaDe(db, e.marca)
  if (!empresa) return falla('MARCA_DESCONOCIDA', `Marca desconocida: ${e.marca}`, 'marca')
  const nombreGn = texto(e.nombre_gn)
  if (nombreGn) {
    const [otro] = await q(db, `select nombre from proveedor where empresa_id = $1 and lower(trim(nombre_gn)) = lower($2) and lower(trim(nombre)) <> lower($3)`, [empresa, nombreGn, nombre])
    if (otro) return falla('NOMBRE_GN_USADO', `«${nombreGn}» de GN ya es de «${otro.nombre}»`, 'nombre_gn')
  }
  // UNA sentencia: el repetido devuelve la fila que está (el `do update` ⛔ cambia nada; `xmax <> 0` dice que ya existía).
  const [fila] = await q(db,
    `insert into proveedor (empresa_id, nombre, cuit, nombre_gn, fuente, usuario) values ($1, $2, $3, $5, 'carga', $4)
     on conflict (empresa_id, (lower(trim(nombre)))) do update set nombre_gn = coalesce(proveedor.nombre_gn, excluded.nombre_gn)
     returning *, (xmax <> 0) as ya_existia`, [empresa, nombre, cuit, usuario, nombreGn])
  const { ya_existia: ya, ...proveedor } = fila
  if (!ya) return { ok: true, proveedor }
  return { ...falla('YA_EXISTE', `Ya hay un proveedor «${proveedor.nombre}»`, 'nombre'), proveedor }
}

/**
 * Los proveedores de la empresa de la marca, por nombre (o todos, hasta `limite`). Con cuántos productos tiene cada uno.
 * @param {import('pg').ClientBase} db
 * @param {{ marca: string, q?: string, limite?: number }} e
 */
export async function buscarProveedores(db, e) {
  const empresa = await empresaDe(db, e?.marca)
  if (!empresa) return falla('MARCA_DESCONOCIDA', `Marca desconocida: ${e?.marca}`, 'marca')
  const limite = Math.min(Math.max(Number(e.limite) || 50, 1), 200)
  const t = texto(e.q)
  const filas = await q(db,
    `select p.id, p.nombre, p.cuit, p.nombre_gn, p.prm_id, p.ingresos_id, p.activo, p.fuente,
       (select count(*)::int from producto x where x.empresa_id = p.empresa_id and x.proveedor_id = p.id) as productos
     from proveedor p where p.empresa_id = $1 and ($2::text is null or p.nombre ilike '%' || $2 || '%' or p.nombre_gn ilike '%' || $2 || '%')
     order by p.activo desc, lower(p.nombre) limit $3`, [empresa, t && literal(t), limite])
  return { ok: true, proveedores: filas }
}

/**
 * SEMILLA desde PRM (`proveedor_local` del monitor, que vive en la base de BDI): un proveedor por local, con su id de PRM,
 * de Ingresos y su nombre en GN. Idempotente por `prm_id`; lo que vino de PRM se actualiza si PRM cambió, lo cargado a mano
 * ⛔ se toca. Un proveedor cargado a mano con el mismo nombre y sin PRM se ADOPTA (`adoptados`); uno de OTRO PRM choca
 * (`nombre_choca`).
 * Sin `escribir`, sólo cuenta.
 * @param {import('pg').ClientBase} db   la base donde se siembra
 * @param {{ empresa: string, prm: Array<{ id: string, nombre: string, proveedor_gn?: string|null, proveedor_id_ingresos?: string|null }>, escribir?: boolean, usuario?: string }} o
 */
export async function sembrarProveedores(db, { empresa, prm, escribir = false, usuario = 'prm-semilla' }) {
  const filas = prm.map((p) => ({ prm_id: String(p.id), nombre: texto(p.nombre), nombre_gn: texto(p.proveedor_gn), ingresos_id: p.proveedor_id_ingresos == null ? null : String(p.proveedor_id_ingresos) }))
    .filter((p) => p.nombre)
  const cuenta = { prm: prm.length, nuevos: 0, cambiados: 0, iguales: 0, adoptados: 0, nombre_choca: 0, nombre_gn_choca: 0 }
  if (escribir) await db.query('begin')
  try {
    if (escribir) await db.query(`select pg_advisory_xact_lock(hashtext('sembrar-proveedores'))`)
    for (const f of filas) {
      const [ya] = await q(db, 'select * from proveedor where empresa_id = $1 and prm_id = $2', [empresa, f.prm_id])
      const chocaNombre = (await q(db, 'select 1 from proveedor where empresa_id = $1 and lower(trim(nombre)) = lower($2) and prm_id is distinct from $3', [empresa, f.nombre, f.prm_id])).length > 0
      const chocaGn = f.nombre_gn && (await q(db, 'select 1 from proveedor where empresa_id = $1 and lower(trim(nombre_gn)) = lower($2) and prm_id is distinct from $3', [empresa, f.nombre_gn, f.prm_id])).length > 0
      // Uno CARGADO a mano con el mismo nombre y sin PRM (alguien lo creó antes de la semilla): se lo ADOPTA (toma el id de PRM,
      // el de Ingresos y el nombre de GN; el nombre y el CUIT cargados quedan). Si ya es de otro PRM, choca y se cuenta.
      const [huerfano] = chocaNombre ? await q(db, `select id from proveedor where empresa_id = $1 and lower(trim(nombre)) = lower($2) and prm_id is null and fuente = 'carga'`, [empresa, f.nombre]) : []
      if (huerfano && !ya) {
        if (f.nombre_gn && (await q(db, 'select 1 from proveedor where empresa_id = $1 and lower(trim(nombre_gn)) = lower($2) and id <> $3', [empresa, f.nombre_gn, huerfano.id])).length) { cuenta.nombre_gn_choca++; continue }
        cuenta.adoptados++
        if (escribir) await db.query(`update proveedor set prm_id = $3, nombre_gn = coalesce(nombre_gn, $4), ingresos_id = $5, actualizado_en = now() where empresa_id = $1 and id = $2`,
          [empresa, huerfano.id, f.prm_id, f.nombre_gn, f.ingresos_id])
        continue
      }
      if (chocaNombre) { cuenta.nombre_choca++; continue }
      if (chocaGn) { cuenta.nombre_gn_choca++; continue }
      if (!ya) {
        cuenta.nuevos++
        if (escribir) await db.query(`insert into proveedor (empresa_id, nombre, nombre_gn, prm_id, ingresos_id, fuente, usuario) values ($1, $2, $3, $4, $5, 'prm', $6)`,
          [empresa, f.nombre, f.nombre_gn, f.prm_id, f.ingresos_id, usuario])
      } else if (ya.fuente === 'prm' && (ya.nombre !== f.nombre || ya.nombre_gn !== f.nombre_gn || ya.ingresos_id !== f.ingresos_id)) {
        cuenta.cambiados++
        if (escribir) await db.query(`update proveedor set nombre = $3, nombre_gn = $4, ingresos_id = $5, actualizado_en = now() where empresa_id = $1 and prm_id = $2`,
          [empresa, f.prm_id, f.nombre, f.nombre_gn, f.ingresos_id])
      } else cuenta.iguales++
    }
    if (escribir) await db.query('commit')
  } catch (e) {
    if (escribir) await db.query('rollback').catch(() => {})
    throw e
  }
  return { ...cuenta, escribio: escribir }
}

/**
 * Ata cada producto copiado de GN a su proveedor por el TEXTO de GN (`nombre_gn`). Sólo filas `gn` (lo cargado ⛔ se toca).
 * Un texto sin proveedor en la tabla deja `proveedor_id` en null y se cuenta (`sin_ficha`, por nombre): ⛔ se crea solo.
 * Lo corre la copia del catálogo; sin 013, no hace nada.
 * @param {import('pg').ClientBase} db  dentro de la transacción de la copia, o suelto
 */
export async function atarProveedores(db, { escribir = false } = {}) {
  if (!(await hayProveedores(db))) return { hay_tabla: false }
  const resolver = `select x.empresa_id, x.id, (select p.id from proveedor p where p.empresa_id = x.empresa_id and x.proveedor is not null
      and lower(trim(p.nombre_gn)) = lower(trim(x.proveedor))) as nuevo from producto x where x.fuente = 'gn'`
  const [c] = await q(db, `with r as (${resolver}) select
      count(*) filter (where r.nuevo is distinct from x.proveedor_id)::int as a_cambiar,
      count(*) filter (where r.nuevo is not null)::int as con_ficha
    from r join producto x using (empresa_id, id)`)
  const sinFicha = await q(db, `select min(trim(x.proveedor)) as nombre, count(*)::int as productos from producto x
    where x.fuente = 'gn' and nullif(trim(x.proveedor), '') is not null and not exists (select 1 from proveedor p where p.empresa_id = x.empresa_id
      and lower(trim(p.nombre_gn)) = lower(trim(x.proveedor))) group by lower(trim(x.proveedor)) order by 2 desc, 1`)
  if (escribir && c.a_cambiar) {
    await db.query(`update producto x set proveedor_id = r.nuevo, actualizado_en = now() from (${resolver}) r
      where r.empresa_id = x.empresa_id and r.id = x.id and r.nuevo is distinct from x.proveedor_id`)
  }
  return { hay_tabla: true, ...c, sin_ficha: sinFicha }
}

/**
 * Bruno, 16-oct («sí»): un proveedor por cada TEXTO de GN que todavía ⛔ tiene ficha, de una vez. El nombre de la ficha en
 * MAYÚSCULAS (como las de PRM) y `nombre_gn` = el texto tal cual. 🔴 Una ficha de PRM con ese nombre y SIN `nombre_gn` (FEI,
 * NOX… el 16-oct: 6 de 13) se ADOPTA — `guardarProveedor` le completa el `nombre_gn` —, ⛔ se duplica. Una que ya tiene OTRO
 * `nombre_gn`, o un texto que es de otra ficha, se cuenta en `quedan` y ⛔ se toca. Después hay que `atarProveedores`.
 * @param {import('pg').ClientBase} db
 * @param {{ marca: string, usuario: string, escribir?: boolean }} e
 */
export async function fichasDeGn(db, { marca, usuario, escribir = false }) {
  const empresa = await empresaDe(db, marca)
  if (!empresa) return falla('MARCA_DESCONOCIDA', `Marca desconocida: ${marca}`, 'marca')
  const textos = await q(db, `select min(trim(x.proveedor)) as texto, count(*)::int as productos,
      (select p.nombre_gn from proveedor p where p.empresa_id = $1 and lower(trim(p.nombre)) = lower(trim(min(x.proveedor)))) as gn_de_la_ficha,
      exists (select 1 from proveedor p where p.empresa_id = $1 and lower(trim(p.nombre)) = lower(trim(min(x.proveedor)))) as hay_ficha
    from producto x where x.empresa_id = $1 and x.fuente = 'gn' and nullif(trim(x.proveedor), '') is not null
      and not exists (select 1 from proveedor p where p.empresa_id = x.empresa_id and lower(trim(p.nombre_gn)) = lower(trim(x.proveedor)))
    group by lower(trim(x.proveedor)) order by 2 desc, 1`, [empresa])
  const r = { ok: true, nuevos: [], adoptados: [], quedan: [] }
  for (const t of textos) {
    const fila = { texto: t.texto, productos: t.productos }
    if (t.hay_ficha && t.gn_de_la_ficha) { r.quedan.push({ ...fila, motivo: `la ficha ya es de «${t.gn_de_la_ficha}» en GN` }); continue }
    if (!escribir) { (t.hay_ficha ? r.adoptados : r.nuevos).push(fila); continue }
    const g = await guardarProveedor(db, { marca, nombre: t.texto.toUpperCase(), nombre_gn: t.texto, usuario })
    if (g.ok) r.nuevos.push({ ...fila, id: g.proveedor.id })
    else if (g.error.codigo === 'YA_EXISTE' && g.proveedor.nombre_gn?.toLowerCase() === t.texto.toLowerCase()) r.adoptados.push({ ...fila, id: g.proveedor.id })
    else r.quedan.push({ ...fila, motivo: g.error.mensaje })
  }
  return r
}
