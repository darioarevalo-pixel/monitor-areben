/**
 * Credencial del Monitor para los scripts que pegan al KV de bdi-catalogo.
 *
 * Desde el 27-jul-2026 `api/ingresos` exige estar en el padrón (`_auth.js` de bdi-catalogo):
 * sin credencial contesta **403 "No se pudo verificar tu sesión del Monitor"**. Los scripts
 * que lo leían anónimo dejaron de andar de un día para el otro, y el mensaje no dice que el
 * problema sea el script.
 *
 * El header es el mismo que arma el navegador en `lib/api-fetch.ts`: `x-monitor-auth` con el
 * base64 de `{user, pass}`. La pass sale de `MONITOR_PASS` en el `.env`; el usuario, de
 * `MONITOR_USER` (default "Bruno Arevalo"), y tiene que coincidir con el nombre del padrón,
 * que es por donde el KV identifica a la persona.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** El `.env` del repo como objeto. Vacío si no existe (que lo reporte quien pida la credencial). */
export function leerEnv() {
  try {
    return Object.fromEntries(
      readFileSync(join(RAIZ, '.env'), 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
        }),
    )
  } catch {
    return {}
  }
}

/**
 * Headers de autenticación para el KV. Si falta la pass **corta el script**: seguir sin ella
 * termina en un 403 que se lee como "el KV está vacío" y eso, en un respaldo, es peor que no
 * correr nada.
 */
export function authKv(env = leerEnv()) {
  const user = process.env.MONITOR_USER || env.MONITOR_USER || 'Bruno Arevalo'
  const pass = process.env.MONITOR_PASS || env.MONITOR_PASS
  if (!pass) {
    console.error('Falta MONITOR_PASS en el .env (agregá la línea MONITOR_PASS=tu-contraseña del Monitor).')
    process.exit(1)
  }
  return { 'x-monitor-auth': Buffer.from(JSON.stringify({ user, pass })).toString('base64') }
}
