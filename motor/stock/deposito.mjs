/**
 * EL DEPÓSITO QUE SE ACTIVA Y SE DESACTIVA (sql/058; Bruno 29-oct: «tiene que ser un depósito opcional, que se activa y se
 * desactiva»). Hoy es el Evento de Stunned: se activa para una feria, se le transfiere mercadería, se vende desde ahí con un
 * turno de Caja propio y lo que sobra vuelve. ⛔ Se borra nunca (el libro y las ventas lo nombran).
 *
 * 🔑 Se DESACTIVA sólo con el stock en 0 y ninguna transferencia de ida o vuelta abierta: si quedó algo, contesta
 * `CON_STOCK` con la lista ⇒ lo que ⛔ volvió se declara con un ajuste (faltante) y recién ahí se apaga.
 * Sólo los depósitos SIN GN (`gn_store_id` null) se prenden y apagan: Local y Depósito ⛔ se tocan desde acá.
 */
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows

async function hayColumna(db) {
  const [{ hay }] = await q(db, `select exists (select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'deposito' and column_name = 'activo') as hay`)
  return hay
}

/** Lo que hay en el depósito por variante (≠ 0), de la línea. */
async function stockDe(db, linea, deposito) {
  return (await q(db, `select product_id, size_id, max(sku) as sku, sum(cantidad)::int as cantidad from stock_movimiento
    where linea = $1 and deposito = $2 group by 1, 2 having sum(cantidad) <> 0 order by 3 nulls last, 1, 2`, [linea, deposito]))
    .map((r) => ({ product_id: Number(r.product_id), size_id: Number(r.size_id), sku: r.sku, cantidad: r.cantidad }))
}

async function abiertasDe(db, linea, deposito) {
  const [{ hay }] = await q(db, `select to_regclass('public.stock_transferencia') is not null as hay`)
  if (!hay) return []
  return (await q(db, `select numero, desde, hacia, estado from stock_transferencia where linea = $1 and (desde = $2 or hacia = $2)
    and estado in ('borrador', 'armada', 'en_transito') order by numero`, [linea, deposito]))
}

/** Los depósitos de la línea: `{ id, nombre, activo, deGN, unidades }`. Sin la 058 ⇒ todos activos y ⛔ hay activables. */
export async function depositosDe(db, { linea }) {
  const col = await hayColumna(db)
  const filas = await q(db, `select d.id, d.nombre, d.gn_store_id, ${col ? 'd.activo' : 'true as activo'},
    coalesce((select sum(m.cantidad) from stock_movimiento m where m.linea = d.marca and m.deposito = d.id), 0)::int as unidades
    from deposito d where d.marca = $1 order by d.gn_store_id nulls last, d.id`, [linea])
  return filas.map((d) => ({ id: d.id, nombre: d.nombre, activo: d.activo === true, deGN: d.gn_store_id != null, unidades: d.unidades }))
}

async function elDeposito(db, linea, deposito) {
  if (!(await hayColumna(db))) return { error: falla('SIN_MIGRACION', 'Falta la migración 058 (depósito activable) en esta base') }
  const [d] = await q(db, 'select id, nombre, gn_store_id, activo from deposito where marca = $1 and id = $2', [linea, deposito])
  if (!d) return { error: falla('ENTRADA_INVALIDA', `Depósito desconocido para ${linea}: ${deposito}`, 'deposito') }
  if (d.gn_store_id != null) return { error: falla('ENTRADA_INVALIDA', `${d.nombre} ⛔ se apaga: es un depósito fijo`, 'deposito') }
  return { d }
}

/** Prende el depósito. Prenderlo dos veces = `{ ok, ya: true }`. */
export async function activarDeposito(db, { linea, deposito, usuario }) {
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo activa', 'usuario')
  const { d, error } = await elDeposito(db, linea, deposito)
  if (error) return error
  if (d.activo) return { ok: true, ya: true, deposito: d.id }
  await db.query('update deposito set activo = true where marca = $1 and id = $2', [linea, deposito])
  return { ok: true, deposito: d.id }
}

/** Apaga el depósito sólo si quedó vacío y sin transferencias abiertas; si no, `CON_STOCK` / `TRANSFERENCIA_ABIERTA` con la lista. */
export async function desactivarDeposito(db, { linea, deposito, usuario }) {
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo desactiva', 'usuario')
  const { d, error } = await elDeposito(db, linea, deposito)
  if (error) return error
  if (!d.activo) return { ok: true, ya: true, deposito: d.id }
  const abiertas = await abiertasDe(db, linea, deposito)
  if (abiertas.length) return { ...falla('TRANSFERENCIA_ABIERTA', `Hay ${abiertas.length} transferencia(s) sin terminar con ${d.nombre}: recibilas o cancelalas`), abiertas }
  const quedan = await stockDe(db, linea, deposito)
  if (quedan.length) {
    const u = quedan.reduce((s, r) => s + r.cantidad, 0)
    return { ...falla('CON_STOCK', `${d.nombre} todavía tiene ${u} prenda(s): devolvelas con una transferencia o declaralas con un ajuste`), quedan }
  }
  await db.query('update deposito set activo = false where marca = $1 and id = $2', [linea, deposito])
  return { ok: true, deposito: d.id }
}
