/**
 * La conexión a las dos bases del monitor (Postgres directo, ⛔ PostgREST: con la key pública el RLS
 * devuelve 0 filas SIN error, y eso ya engañó una medición el 12-oct).
 *
 * 🔑 Sin `--escribir`, todo corre en una transacción READ ONLY: el modo de prueba no puede escribir
 * aunque quiera. Con `--escribir`, una sola transacción por comando: o queda todo o nada.
 *
 * Las URLs: `DATABASE_URL_BDI` / `DATABASE_URL_ZATTIA` del entorno (Actions) o del `.env` de esta
 * carpeta; si no hay, del `.env` del monitor (`~/Projects/monitor-areben/.env`), para correrlo desde
 * la Mac sin copiar secretos.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { SUPABASE_CA } from './supabase-ca.mjs'

// `date` como texto (`2026-10-12`): como Date, pg lo pone a la medianoche de la máquina y corre el día.
pg.types.setTypeParser(1082, (v) => v)
// bigint como número: los ids de GN y las sumas de unidades entran holgados en un double.
pg.types.setTypeParser(20, (v) => Number(v))

export function leerEnv(ruta) {
  if (!existsSync(ruta)) return {}
  return Object.fromEntries(
    readFileSync(ruta, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

export function urlDe(base, { soloMonitor = false } = {}) {
  const nombre = `DATABASE_URL_${base.toUpperCase()}`
  const delMonitor = leerEnv(join(homedir(), 'Projects/monitor-areben/.env'))[nombre]
  const url = soloMonitor ? delMonitor : process.env[nombre] || leerEnv(join(process.cwd(), '.env'))[nombre] || delMonitor
  if (!url) throw new Error(`Falta ${nombre} (entorno, .env de esta carpeta o el del monitor)`)
  return url
}

/**
 * Parte la URL a mano: la contraseña puede traer caracteres que `new URL` no acepta. Fuera de la Mac, TLS VERIFICADO contra
 * la raíz de Supabase (auditoría 20-oct; antes `rejectUnauthorized: false` aceptaba cualquier certificado).
 */
export function config(raw) {
  const sinProto = raw.slice(raw.indexOf('://') + 3)
  const at = sinProto.lastIndexOf('@')
  const userpass = sinProto.slice(0, at)
  const hostpart = sinProto.slice(at + 1)
  const ci = userpass.indexOf(':')
  const slash = hostpart.indexOf('/')
  const [host, port] = hostpart.slice(0, slash).split(':')
  const local = host === 'localhost' || host === '127.0.0.1'
  return { user: userpass.slice(0, ci), password: userpass.slice(ci + 1), host, port: Number(port) || 5432, database: hostpart.slice(slash + 1).split('?')[0], ssl: local ? false : { ca: SUPABASE_CA, rejectUnauthorized: true, servername: host } }
}

/**
 * Abre una transacción contra una base. `cerrar(true)` confirma (sólo si se abrió para escribir);
 * cualquier otra cosa vuelve atrás.
 */
export async function abrir(base, { escribir = false, url = urlDe(base) } = {}) {
  const client = new pg.Client(config(url))
  await client.connect()
  await client.query(escribir ? 'begin' : 'begin read only')
  return {
    base,
    escribir,
    q: async (sql, params = []) => (await client.query(sql, params)).rows,
    run: async (sql, params = []) => (await client.query(sql, params)).rowCount,
    cerrar: async (ok) => {
      try { await client.query(escribir && ok ? 'commit' : 'rollback') } finally { await client.end() }
    },
  }
}

/**
 * Un cliente pg CONECTADO y SIN transacción, para lo que maneja la suya (`registrarVenta` y compañía del motor).
 * `end()` lo cierra.
 */
export async function conectar(base, { url = urlDe(base) } = {}) {
  const client = new pg.Client(config(url))
  await client.connect()
  return client
}

/** Si una tabla existe (antes de migrar, el modo de prueba igual tiene que poder correr). */
export async function existe(db, tabla) {
  const [r] = await db.q('select to_regclass($1) is not null as hay', [`public.${tabla}`])
  return r.hay
}

/** Si la columna existe: una migración que corre Bruno puede llegar después que el código. */
export async function tieneColumna(db, tabla, columna) {
  const [r] = await db.q(
    `select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [tabla, columna],
  )
  return r.n > 0
}
