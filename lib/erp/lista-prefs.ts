/**
 * Lo que cada persona eligió en una lista del ERP (columnas y su orden): «queda guardado por usuario»
 * (diseño §3). Va en `localStorage` keyeado por usuario, como `lib/notificaciones/visto.ts`: es preferencia de este
 * navegador, ⛔ del equipo (en otra compu arranca con las de siempre). Si falla (privado, bloqueado), las de siempre.
 * Lo que se lee pasa por el `normalizar` de la lista: una columna que ya ⛔ existe se cae sola.
 */

const CLAVE = 'erp_lista_prefs'

type Todas = Record<string, Record<string, unknown>>

function leerTodas(): Todas {
  try {
    const raw = localStorage.getItem(CLAVE)
    return raw ? (JSON.parse(raw) as Todas) : {}
  } catch {
    return {}
  }
}

const clave = (lista: string, usuario: string | null | undefined) => `${lista}:${String(usuario || '(anon)').toLowerCase()}`

export function leerPrefsDeLista(lista: string, usuario: string | null | undefined): unknown {
  return leerTodas()[clave(lista, usuario)] ?? null
}

export function guardarPrefsDeLista(lista: string, usuario: string | null | undefined, prefs: Record<string, unknown>): void {
  try {
    const t = leerTodas()
    t[clave(lista, usuario)] = prefs
    localStorage.setItem(CLAVE, JSON.stringify(t))
  } catch {
    // Sin almacenamiento: la lista sigue con lo elegido mientras la pantalla esté abierta.
  }
}
