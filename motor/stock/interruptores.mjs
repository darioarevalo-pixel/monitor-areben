/**
 * LOS INTERRUPTORES DE APROBACIÓN (paso 7, sesión B; Bruno 24-oct: «por marca»). Tabla: sql/035. Los lee el monitor
 * (`api/_erp.js`) y se los pasa a `puedeErp`; los cambia sólo Admin desde Configuración › Usuarios y roles.
 * Sin tabla o sin fila = APAGADO (la conducta de antes). El monitor ⛔ rompe si la migración todavía no corrió.
 */
import { DEVUELTA, PAGADA } from '../venta/pago-tn.mjs'
import { TIENDAS } from '../tn/orden.mjs'

export const CLAVES = ['anular', 'conteo', 'precio']
export const APAGADOS = Object.freeze({ anular: false, conteo: false, precio: false })
/**
 * La CONFIGURACIÓN comparte la tabla (sql/040) pero ⛔ es una aprobación: `interruptoresDe` sigue devolviendo sólo `CLAVES` (la pantalla de
 * Aprobaciones y `puedeErp` esperan esa forma) y la configuración se lee con `configuracionDe`.
 * `sin_pagar_a_preparar` (Darío 26-oct: opción A): prendido = el pedido de Tienda Nube SIN PAGAR entra a «A preparar». Por BASE: bdi, y zattia con Stunned.
 */
export const CONFIGURACION = ['sin_pagar_a_preparar']
export const CONFIG_APAGADA = Object.freeze({ sin_pagar_a_preparar: false })
const SIN_PAGAR_A_PREPARAR = 'sin_pagar_a_preparar'

/** `{ anular, conteo, precio }` de esa línea (booleanos). Sin tabla ⇒ todo apagado. */
export async function interruptoresDe(db, { linea }) {
  const [{ hay }] = (await db.query(`select to_regclass('public.erp_interruptores') is not null as hay`)).rows
  if (!hay) return { ...APAGADOS }
  const { rows } = await db.query('select clave, valor from erp_interruptores where linea = $1', [linea])
  return { ...APAGADOS, ...Object.fromEntries(rows.filter((r) => CLAVES.includes(r.clave)).map((r) => [r.clave, r.valor === true])) }
}

/** `{ sin_pagar_a_preparar }` de esa base (booleanos). Sin tabla o sin fila ⇒ apagado. */
export async function configuracionDe(db, { linea }) {
  const [{ hay }] = (await db.query(`select to_regclass('public.erp_interruptores') is not null as hay`)).rows
  if (!hay) return { ...CONFIG_APAGADA }
  const { rows } = await db.query('select clave, valor from erp_interruptores where linea = $1', [linea])
  return { ...CONFIG_APAGADA, ...Object.fromEntries(rows.filter((r) => CONFIGURACION.includes(r.clave)).map((r) => [r.clave, r.valor === true])) }
}

/** Prende o apaga UNO. `{ ok, interruptores }` o `{ ok: false, error }`. Quién lo cambió queda en la fila. */
export async function ponerInterruptor(db, { linea, clave, valor, usuario }) {
  if (!String(linea ?? '').trim()) return { ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'Falta la línea', campo: 'linea' } }
  if (!CLAVES.includes(clave) && !CONFIGURACION.includes(clave)) return { ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: `Interruptor desconocido: ${clave}`, campo: 'clave' } }
  if (typeof valor !== 'boolean') return { ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'El valor es sí o no', campo: 'valor' } }
  const quien = String(usuario ?? '').trim()
  if (!quien) return { ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'Falta quién lo cambia', campo: 'usuario' } }
  const guardar = () => db.query(
    `insert into erp_interruptores (linea, clave, valor, cambiado_por) values ($1, $2, $3, $4)
     on conflict (linea, clave) do update set valor = excluded.valor, cambiado_por = excluded.cambiado_por, cambiado_en = now()`,
    [linea, clave, valor, quien],
  )
  if (clave !== SIN_PAGAR_A_PREPARAR) {
    await guardar()
    return { ok: true, interruptores: await interruptoresDe(db, { linea }) }
  }
  // 🔑 «Sin pagar → a preparar» cambia el ESTADO de los pedidos que YA están guardados (la red de TN ⛔ vuelve a leer lo viejo):
  // el interruptor y la reclasificación van juntos o ⛔ van. ⛔ Toca stock (la reserva de los sin pagar ya es otra regla).
  await db.query('begin')
  try {
    await guardar()
    const reclasificados = await reclasificarSinPagar(db, { linea, valor })
    await db.query('commit')
    return { ok: true, interruptores: await interruptoresDe(db, { linea }), reclasificados }
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
}

/**
 * Pasa los pedidos de TN SIN PAGAR que ya están guardados de `pedido` a `a_preparar` (valor = true) o al revés (false). Sólo toca los
 * abiertos, sin pagar y sin empaquetar (⛔ los que ya avanzaron). La base de `linea`: bdi, o zattia con Stunned.
 * @returns {Promise<number>} cuántos cambió (0 si esa base ⛔ tiene el estado de los pedidos todavía)
 */
export async function reclasificarSinPagar(db, { linea, valor }) {
  const tiendas = Object.entries(TIENDAS).filter(([, t]) => t.base === linea).map(([k]) => k)
  if (!tiendas.length) return 0
  const [{ hay }] = (await db.query(
    `select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tn_orden' and column_name = 'estado') as hay`,
  )).rows
  if (!hay) return 0
  const r = await db.query(
    `update tn_orden set estado = $1
      where tienda = any($2) and estado = $3 and status = 'open'
        and not (payment_status = any($4)) and not (payment_status = any($5))
        and coalesce(envio_estado, 'UNPACKED') = 'UNPACKED'`,
    [valor ? 'a_preparar' : 'pedido', tiendas, valor ? 'pedido' : 'a_preparar', [...PAGADA], [...DEVUELTA]],
  )
  return r.rowCount
}
