/**
 * LOS INTERRUPTORES DE APROBACIÓN (paso 7, sesión B; Bruno 24-oct: «por marca»). Tabla: sql/035. Los lee el monitor
 * (`api/_erp.js`) y se los pasa a `puedeErp`; los cambia sólo Admin desde Configuración › Usuarios y roles.
 * Sin tabla o sin fila = APAGADO (la conducta de antes). El monitor ⛔ rompe si la migración todavía no corrió.
 */
export const CLAVES = ['anular', 'conteo', 'precio']
export const APAGADOS = Object.freeze({ anular: false, conteo: false, precio: false })

/** `{ anular, conteo, precio }` de esa línea (booleanos). Sin tabla ⇒ todo apagado. */
export async function interruptoresDe(db, { linea }) {
  const [{ hay }] = (await db.query(`select to_regclass('public.erp_interruptores') is not null as hay`)).rows
  if (!hay) return { ...APAGADOS }
  const { rows } = await db.query('select clave, valor from erp_interruptores where linea = $1', [linea])
  return { ...APAGADOS, ...Object.fromEntries(rows.map((r) => [r.clave, r.valor === true])) }
}

/** Prende o apaga UNO. `{ ok, interruptores }` o `{ ok: false, error }`. Quién lo cambió queda en la fila. */
export async function ponerInterruptor(db, { linea, clave, valor, usuario }) {
  if (!String(linea ?? '').trim()) return { ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'Falta la línea', campo: 'linea' } }
  if (!CLAVES.includes(clave)) return { ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: `Interruptor desconocido: ${clave}`, campo: 'clave' } }
  if (typeof valor !== 'boolean') return { ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'El valor es sí o no', campo: 'valor' } }
  const quien = String(usuario ?? '').trim()
  if (!quien) return { ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'Falta quién lo cambia', campo: 'usuario' } }
  await db.query(
    `insert into erp_interruptores (linea, clave, valor, cambiado_por) values ($1, $2, $3, $4)
     on conflict (linea, clave) do update set valor = excluded.valor, cambiado_por = excluded.cambiado_por, cambiado_en = now()`,
    [linea, clave, valor, quien],
  )
  return { ok: true, interruptores: await interruptoresDe(db, { linea }) }
}
