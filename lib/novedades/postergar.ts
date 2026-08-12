/**
 * «Después»: postergar el cartel de una novedad importante por unos minutos.
 *
 * Nació de que la única salida del cartel era «Entendido», y «Entendido» **registra que la leíste**.
 * Quien lo recibe en medio de un conteo aprieta igual y sigue — o sea, el cartel consigue lo
 * contrario de lo que quería. Con «Después» hay una salida que no miente: el cartel se va, la
 * lectura no se escribe, y a los 10 minutos vuelve.
 *
 * 🔑 **Va en localStorage y no en el servidor**, y la razón está escrita en `store/useSistema.ts`:
 * la *lectura* es del usuario y va a la base; posponer 10 minutos es de este navegador y de este
 * momento. En el servidor sería un estado que después hay que limpiar.
 *
 * Se keyea **por usuario** como `lib/notificaciones/visto.ts` (y no suelta como el snooze del panel
 * Gerencial): `Local` y `Depósito` son puestos, no personas, y dos personas comparten el navegador.
 *
 * La clave lleva la **versión** además del id, igual que `novedades_leidas`: subir la versión de una
 * importante tiene que volver a frenar a todos, no heredar el «después» de la versión anterior.
 */

/** Cuánto se posterga. Un número solo: elegir entre 5 y 10 es una decisión más para nada. */
export const MINUTOS_POSTERGAR = 10

const CLAVE = 'monitor_novedades_postergadas'

/** `{ '<usuario>|<novedadId>|<version>': expiraTs }`. Una entrada vencida es como si no existiera. */
export type MapaPostergadas = Record<string, number>

/** El id que se guarda. Va en minúsculas por el usuario, igual que en `visto.ts`. */
export function claveDe(usuario: string | null | undefined, id: string, version: number): string {
  return `${String(usuario || '(anon)').toLowerCase()}|${id}|${version}`
}

/** Lo que sigue postergado a la hora `ahora`. Es lo único con lógica, y por eso es puro y se testea. */
export function vigentes(m: MapaPostergadas, ahora: number): MapaPostergadas {
  const out: MapaPostergadas = {}
  for (const [k, exp] of Object.entries(m || {})) {
    if (typeof exp === 'number' && exp > ahora) out[k] = exp
  }
  return out
}

function leer(): MapaPostergadas {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(CLAVE)
    return raw ? (JSON.parse(raw) as MapaPostergadas) : {}
  } catch {
    return {}
  }
}

function guardar(m: MapaPostergadas): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CLAVE, JSON.stringify(m))
  } catch {
    /* localStorage lleno o bloqueado: postergar es best-effort, y el lado seguro es que el cartel vuelva */
  }
}

/**
 * Las `<id>|<version>` que esta persona postergó y siguen vigentes (y limpia las vencidas, de las
 * suyas y de las ajenas). `Date.now()` va acá, en código de módulo, nunca en un render.
 */
export function postergadas(usuario: string | null | undefined): Set<string> {
  const vivas = vigentes(leer(), Date.now())
  guardar(vivas)
  const prefijo = `${String(usuario || '(anon)').toLowerCase()}|`
  const out = new Set<string>()
  for (const k of Object.keys(vivas)) {
    if (k.startsWith(prefijo)) out.add(k.slice(prefijo.length))
  }
  return out
}

/** Posterga una novedad `MINUTOS_POSTERGAR` a partir de ahora. */
export function postergar(usuario: string | null | undefined, id: string, version: number): void {
  const m = vigentes(leer(), Date.now())
  m[claveDe(usuario, id, version)] = Date.now() + MINUTOS_POSTERGAR * 60_000
  guardar(m)
}

/**
 * Cuándo vence el primer «después» de esta persona, en ms desde ahora, o `null` si no tiene ninguno.
 * Es el tiempo que hay que esperar para volver a mirar: con eso el cartel reaparece **solo**, sin
 * recargar y sin un `setInterval` que pregunte cada tanto.
 */
export function faltaParaElPrimero(usuario: string | null | undefined): number | null {
  const ahora = Date.now()
  const prefijo = `${String(usuario || '(anon)').toLowerCase()}|`
  let primero: number | null = null
  for (const [k, exp] of Object.entries(vigentes(leer(), ahora))) {
    if (!k.startsWith(prefijo)) continue
    if (primero === null || exp < primero) primero = exp
  }
  return primero === null ? null : Math.max(0, primero - ahora)
}
