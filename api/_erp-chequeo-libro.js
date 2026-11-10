/**
 * ERP › «Chequeo del libro»: corre EN VIVO las reglas del propio libro (`motor/invariantes.mjs`, las mismas del workflow
 * nocturno «Reglas del libro» del motor) contra la base de una marca. Sólo LEE. Sólo Admin (`reglas-libro: 'configurar'`).
 *
 *   GET ?recurso=erp&vista=reglas-libro&marca=bdi|zattia
 *
 * La base de Zattia trae también Stunned (una base, dos líneas): las reglas son de la BASE, ⛔ de la línea.
 */
import { chequeoDelLibro } from '../lib/erp/chequeo-libro.core.js'

const MARCAS = ['bdi', 'zattia']

/**
 * @param {{ marca: string }} p
 * @param {{ conMotor: Function, revisar?: Function, ahora?: () => Date }} deps  `revisar`: para los tests (por defecto `revisarLibro` del motor)
 */
export async function reglasDelLibro({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const revisar = deps.revisar || (await import('../motor/invariantes.mjs')).revisarLibro
  const ahora = deps.ahora ? deps.ahora() : new Date()
  return deps.conMotor(marca, 'El chequeo de movimientos', async (pg) => {
    // El motor habla `db.q(sql, params) ⇒ filas` (lib/db.mjs); acá la conexión es un `pg.Client`.
    const db = { q: async (sql, params = []) => (await pg.query(sql, params)).rows }
    const resultados = await revisar(db, { ahora })
    return { marca, revisadoEn: ahora.toISOString(), ...chequeoDelLibro(resultados) }
  })
}
