/**
 * El BOTÓN «mandar el stock del ERP a Tienda Nube» (ERP › Stock › Diferencias; Bruno 27-oct: la diferencia es INFORMATIVA,
 * el arreglo es que el ERP mande). ⛔ escribe en TN: AVISA el trabajo `stock-tn:<tienda>` de la cola (`lib/trabajos.mjs`),
 * que arma el plan contra TN en vivo y escribe SÓLO donde `STOCK_TN_MANDA` lo diga (con su freno y las repetidas afuera);
 * hasta el corte de esa tienda corre SECO y guarda la cuenta de lo que mandaría. Lo toma `api/eventos.js` (cron, cada minuto).
 * 🔴 Es la tienda ENTERA, ⛔ una variante (`reglas-vigentes.md` :12 y :94: el stock va todo junto, ⛔ por partes).
 * `c` = la base de BDI (la cola vive ahí, también para Zattia y Stunned).
 */
import { EMPRESA } from '../alerta.mjs'
import { avisar } from '../evento.mjs'
import { DEPOSITOS_TN } from './stock.mjs'

const mal = (codigo, mensaje) => ({ ok: false, error: { codigo, mensaje } })

/**
 * @param {import('pg').Client} c la base de BDI
 * @param {{ tienda: string, usuario: string }} p
 * @returns {Promise<{ ok: true, id: number, nuevo: boolean } | { ok: false, error: { codigo: string, mensaje: string } }>}
 *   `nuevo: false` = ya había uno esperando: el pedido se suma a ése (⛔ dos empujes de la misma tienda).
 */
export async function pedirEmpujeStock(c, { tienda, usuario }) {
  if (!Object.hasOwn(DEPOSITOS_TN, tienda)) return mal('TIENDA', `Tienda desconocida: ${tienda}`)
  const quien = String(usuario ?? '').trim()
  if (!quien) return mal('USUARIO', 'Falta quién lo pide')
  const r = await avisar(c, { tipo: 'stock-tn', clave: tienda, origen: `boton:${quien}`.slice(0, 60) })
  return { ok: true, ...r }
}

/**
 * Los últimos empujes de stock de esa tienda (los del botón, los que avisa el libro y los PUNTUALES de lo que se movió,
 * `tipo` = 'stock-tn-puntual'), el más nuevo primero: qué pasó,
 * cuándo, y lo que mandó o mandaría (`resultado`: `seco`, `cambios`, `unidades`, `escritos`, `quedan`, `cuenta`…).
 * La cola guarda 30 días (`GUARDAR_DIAS`).
 */
export async function empujesStock(c, { tienda, limite = 5 }) {
  if (!Object.hasOwn(DEPOSITOS_TN, tienda)) return mal('TIENDA', `Tienda desconocida: ${tienda}`)
  const n = Math.min(Math.max(Number(limite) || 5, 1), 50)
  const { rows } = await c.query(
    `select id, tipo, estado, origen, avisos, intentos, creado_en, tomado_en, terminado_en, resultado, error
       from motor_evento where empresa_id = $1 and tipo in ('stock-tn', 'stock-tn-puntual') and clave = $2 order by id desc limit $3`,
    [EMPRESA, tienda, n],
  )
  return { ok: true, empujes: rows.map((r) => ({ ...r, id: Number(r.id) })) }
}
