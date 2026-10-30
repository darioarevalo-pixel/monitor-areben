// Caja — el ARQUEO DE CAJA (Bruno, 30-oct-2026): «hoy tengo los cierres de caja pero no hay registro de si fue
// recibido o no, sólo se cuenta que coincida y listo». Cada cierre lleva un CÓDIGO (`Z-0142`) que sale impreso en
// el ticket del cierre, con código de barras; la cajera lo pone en el sobre, Bruno lo retira (o se lo traen) y en
// ERP › Ventas › Cajas escanea el código y marca «Llegó bien» (⇒ Lista) o «Llegó con diferencia».
//
// 🔑 El código es `caja_turno.numero` (sql/migrate-caja-arqueo.sql), ⛔ el uuid: se tipea a mano si el lector falla.
// 🔑 El SOBRE que se espera es el MISMO del ticket del cierre (`sobreEsperado`, lo usan los dos): con los billetes
//    contados, lo que ⛔ queda de fondo (`armarSobre`); sin billetes, lo contado menos el fondo.
// 🔑 Sólo un admin arquea (Bruno, 30-oct). El arqueo ⛔ toca el cierre: lo contado y lo esperado de la caja quedan
//    como estaban; el arqueo es otra foto, la del sobre.
//
// Puro: lo usan `api/_caja.js`, el ticket (`lib/caja/ticket.ts`) y la pantalla (`lib/erp/cajas.core.js`).

import { armarSobre, billetesDe } from './conteo.core.js'

const PREFIJO = Object.freeze({ zattia: 'Z', bdi: 'B' })
const centavos = (n) => Math.round(n * 100) / 100

/** El código del sobre: `Z-0142` (Zattia) · `B-0031` (BDI). Sin número (la base sin la migración) ⇒ null. */
export function codigoArqueo(store, numero) {
  const p = PREFIJO[String(store || '').toLowerCase()]
  const n = Number(numero)
  if (!p || !Number.isInteger(n) || n <= 0) return null
  return `${p}-${String(n).padStart(4, '0')}`
}

/**
 * Lo que se escaneó o se tipeó ⇒ el número del cierre, o null. Acepta `Z-0142`, `z0142`, `Z 142` y `142` a secas;
 * ⛔ el código de OTRA caja (`B-…` estando en Zattia): ese sobre se arquea desde su marca.
 * @param {string} texto @param {string} store
 * @returns {number | null}
 */
export function leerCodigo(texto, store) {
  const m = /^\s*([a-z])?[\s-]*0*(\d{1,9})\s*$/i.exec(String(texto ?? ''))
  if (!m) return null
  if (m[1] && m[1].toUpperCase() !== PREFIJO[String(store || '').toLowerCase()]) return null
  const n = Number(m[2])
  return n > 0 ? n : null
}

/**
 * Cuánto tiene que traer el sobre de un cierre. La misma regla que imprime el ticket.
 * @param {{ fondo: number | string, contado: number | string | null, conteos?: { cierre?: { billetes?: Record<string, number> } | null } | null }} t
 * @returns {number | null} null si la caja ⛔ se cerró
 */
export function sobreEsperado(t, billetes = billetesDe()) {
  if (t.contado == null) return null
  const fondo = Number(t.fondo) || 0
  const b = t.conteos?.cierre?.billetes
  if (b && Object.values(b).some((n) => Number(n) > 0)) return armarSobre(b, fondo, billetes).totalSobre
  return centavos(Math.max(0, Number(t.contado) - fondo))
}

/**
 * El arqueo de un sobre: lo que trajo contra lo que tenía que traer. «Llegó bien» = lo esperado; con diferencia la
 * nota es obligatoria (Bruno: queda el registro de qué pasó).
 * @param {{ esperado: number, contado: unknown, nota?: unknown }} p
 * @returns {{ arqueo: { estado: 'bien' | 'diferencia', esperado: number, contado: number, diferencia: number, nota: string | null } } | { error: string }}
 */
export function armarArqueo({ esperado, contado, nota }) {
  if (contado === '' || contado == null) return { error: 'Falta cuánto había en el sobre.' }
  const c = Number(contado)
  if (!Number.isFinite(c) || c < 0) return { error: 'Lo que había en el sobre tiene que ser un número.' }
  const e = centavos(Number(esperado) || 0)
  const diferencia = centavos(c - e)
  const estado = Math.abs(diferencia) < 0.005 ? 'bien' : 'diferencia'
  const n = String(nota ?? '').trim().slice(0, 500) || null
  if (estado === 'diferencia' && !n) return { error: 'Con diferencia hace falta una nota: qué pasó con el sobre.' }
  return { arqueo: { estado, esperado: e, contado: centavos(c), diferencia: estado === 'bien' ? 0 : diferencia, nota: n } }
}

/**
 * En qué está el sobre de una caja: abierta (todavía ⛔ hay sobre) · sin recibir · Lista · con diferencia.
 * @param {{ cerrado_en?: string | null, arqueo?: { estado?: string } | null }} t
 * @returns {'abierta' | 'sin_recibir' | 'lista' | 'diferencia'}
 */
export function estadoDelSobre(t) {
  if (!t.cerrado_en) return 'abierta'
  if (!t.arqueo) return 'sin_recibir'
  return t.arqueo.estado === 'bien' ? 'lista' : 'diferencia'
}

/** ¿El error de Supabase es porque las columnas del arqueo todavía ⛔ existen (sin sql/migrate-caja-arqueo.sql)? */
export function faltaColumnaArqueo(error) {
  const m = String(error?.message || '')
  return !!error && /numero|arqueo/.test(m) && /column|columna/i.test(m)
}
export const FALTA_ARQUEO = 'El arqueo de caja todavía no está disponible en esta marca (falta preparar la base).'
