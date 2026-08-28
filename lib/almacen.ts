/**
 * Almacén local asíncrono: un KV chico sobre IndexedDB, con backends de repuesto.
 *
 * Existe por un motivo concreto: el payload del ETL de BDI pesa ~15 MB y **no entra en
 * localStorage**, que tiene un techo de ~5 MB de caracteres por origen. Eso hacía que el
 * caché de BDI no se guardara nunca, en silencio, y que la app bajara todo de nuevo en
 * cada entrada. IndexedDB no tiene ese techo (la cuota es por origen y se mide en cientos
 * de MB) y además guarda con **structured clone**, así que no hay que serializar a texto:
 * se ahorra un `JSON.stringify` de 15 MB al escribir y un `JSON.parse` igual de caro al
 * leer, que corría en el hilo principal.
 *
 * Es una envoltura a mano sobre la API nativa a propósito: sumar `idb` (o `fake-indexeddb`
 * para los tests) traería un paquete entero para las tres operaciones que usamos.
 *
 * **El seam de test.** El env de vitest es `node` y ahí no hay IndexedDB. En vez de
 * simularlo, el módulo expone `usarAlmacen()` para inyectar un backend: los tests usan
 * `almacenMemoria()`, que emula la semántica de IDB (clona al entrar y al salir), y
 * `almacenIDB` queda sin cobertura automática — se verifica a mano en el browser. Es el
 * intercambio deliberado que justifica que exista este archivo.
 */

export type Almacen = {
  leer<T>(clave: string): Promise<T | null>
  guardar(clave: string, valor: unknown): Promise<void>
  borrar(clave: string): Promise<void>
}

const DB = 'monitor'
const STORE = 'cache'
const VERSION = 1

// ── IndexedDB ────────────────────────────────────────────────────────────────────

/** Una sola conexión para todo el proceso: el panel Gerencial lee las dos marcas a la vez. */
let conexion: Promise<IDBDatabase> | null = null

function abrir(): Promise<IDBDatabase> {
  if (conexion) return conexion
  conexion = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('no se pudo abrir IndexedDB'))
    req.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'))
  })
  // Si falló, que el próximo intento no quede pegado a la promesa rechazada.
  conexion.catch(() => {
    conexion = null
  })
  return conexion
}

export function almacenIDB(): Almacen {
  return {
    async leer<T>(clave: string): Promise<T | null> {
      const db = await abrir()
      return new Promise<T | null>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(clave)
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
        req.onerror = () => reject(req.error ?? new Error('lectura fallida'))
      })
    },

    async guardar(clave: string, valor: unknown): Promise<void> {
      const db = await abrir()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        // ⚠️ Se resuelve en `oncomplete`, NO en el `onsuccess` del put. IndexedDB valida la
        // cuota al COMMITEAR la transacción: resolver antes sería reportar que se guardó algo
        // que después aborta — o sea, el mismo fallo silencioso que este módulo vino a matar.
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error ?? new Error('transacción abortada'))
        tx.onerror = () => reject(tx.error ?? new Error('escritura fallida'))
        tx.objectStore(STORE).put(valor, clave)
      })
    },

    async borrar(clave: string): Promise<void> {
      const db = await abrir()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error ?? new Error('transacción abortada'))
        tx.onerror = () => reject(tx.error ?? new Error('eliminado fallido'))
        tx.objectStore(STORE).delete(clave)
      })
    },
  }
}

// ── Repuestos ────────────────────────────────────────────────────────────────────

/**
 * En memoria. Clona al guardar y al leer igual que IndexedDB: si alguien mete algo no
 * clonable (una función, una instancia de clase), el test en node falla como fallaría el
 * browser, en vez de pasar y romper en producción.
 */
export function almacenMemoria(): Almacen {
  const mapa = new Map<string, unknown>()
  return {
    async leer<T>(clave: string): Promise<T | null> {
      const v = mapa.get(clave)
      return v === undefined ? null : (structuredClone(v) as T)
    },
    async guardar(clave: string, valor: unknown): Promise<void> {
      mapa.set(clave, structuredClone(valor))
    },
    async borrar(clave: string): Promise<void> {
      mapa.delete(clave)
    },
  }
}

/** No guarda nada. Es el default en el server (ver `detectar`). */
export function almacenNulo(): Almacen {
  return {
    async leer<T>(): Promise<T | null> {
      return null
    },
    async guardar(): Promise<void> {},
    async borrar(): Promise<void> {},
  }
}

// ── Detección + seam ─────────────────────────────────────────────────────────────

/**
 * Sin `window` el repuesto es el NULO y no el de memoria, y eso no es un detalle: un `Map`
 * a nivel de módulo en un proceso Node se comparte entre requests, así que el payload de
 * ventas de una sesión se le podría servir a otra.
 */
function detectar(): Almacen {
  if (typeof window === 'undefined') return almacenNulo()
  if (typeof indexedDB === 'undefined') return almacenMemoria()
  return almacenIDB()
}

let activo: Almacen | null = null
let degradado = false

/** Inyecta un backend (tests). `null` vuelve a la detección automática. */
export function usarAlmacen(a: Almacen | null): void {
  activo = a
  degradado = false
  conexion = null
}

export function almacenActivo(): Almacen {
  if (!activo) activo = detectar()
  return activo
}

/**
 * Si IndexedDB no se puede abrir (Safari en privado, perfil corrupto), se cae a memoria
 * UNA vez en lugar de reintentar en cada operación: el caché deja de sobrevivir al reload,
 * pero dentro de la pestaña sigue sirviendo — ir y volver entre marcas no vuelve a pagar
 * los ~20 segundos.
 */
export function degradarAMemoria(): void {
  if (degradado) return
  degradado = true
  activo = almacenMemoria()
}
