import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { revisarParams } from '@/api/_espejo.js'

/**
 * 🔴 **La pantalla decía «actualizado» cuando el sync no había terminado, y sellaba la hora en la
 * que ella misma había leído.** Dos mentiras distintas que se sostenían mutuamente.
 *
 * El 4-sep-2026 `npm ci` en el workflow del sync pasó de 13 segundos a 7 minutos (un mal momento
 * del registry de npm; el sync en sí siguió tardando 40 s). El total se pasó del techo de espera de
 * `dispararSyncStock`, que devuelve `false` — y Reposición **tiraba ese `false`**: recargaba el
 * espejo viejo, sellaba «Actualizado: <ahora>» y apagaba el botón como si todo hubiera salido bien.
 * El local bajó al depósito con el stock del día anterior. Apretaron de nuevo, y el segundo intento
 * quedó 7 min 40 s haciendo cola detrás del primero (candado `gestion-nube`), sin nada en pantalla
 * que lo dijera.
 *
 * Los tres invariantes de acá abajo son las tres piezas de ese incidente. Los estructurales son
 * texto contra texto a propósito, igual que `blob-upload-sesion.test.ts`: lo que hay que impedir es
 * que alguien vuelva a escribir la forma peligrosa, y eso se ve en el archivo, no en el resultado.
 */

const raiz = join(__dirname, '..')
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8')

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1. Nadie puede volver a tirar el `false` de dispararSyncStock
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Las cinco pantallas que disparan el sync desde un botón. Cuatro miraban el resultado desde
 * siempre; Reposición era la única que no, y fue la única que mintió.
 */
const LLAMADORES = [
  'components/reposicion/Reposicion.tsx',
  'components/exhib/Exhib.tsx',
  'components/ubicaciones/Ubicaciones.tsx',
  'components/caducados/Caducados.tsx',
  'components/productos/BotonActualizarInventario.tsx',
]

describe('el resultado de dispararSyncStock no se puede descartar', () => {
  it('las cinco pantallas guardan lo que devuelve', () => {
    for (const archivo of LLAMADORES) {
      const src = leer(archivo)
      expect(src, `${archivo} importa dispararSyncStock`).toContain('dispararSyncStock')
      // `await dispararSyncStock(` sin un `=` adelante es exactamente la forma que causó el bug.
      const sueltas = src.match(/(?<![=\s]\s{0,4})^\s*await dispararSyncStock\(/gm) || []
      expect(sueltas, `${archivo} descarta el resultado del sync`).toEqual([])
      expect(src, `${archivo} no guarda el resultado`).toMatch(/=\s*await dispararSyncStock\(/)
    }
  })

  it('las cinco avisan cuando el sync no llegó a terminar', () => {
    for (const archivo of LLAMADORES) {
      const src = leer(archivo)
      // Un `done` guardado y nunca mirado sería el mismo bug con un paso más.
      expect(src, `${archivo} no avisa cuando done es false`).toMatch(/if\s*\(!done\)|else\s*\n?\s*toast\.aviso|if\s*\(done\)/)
      // Dos dicen «tardó» y tres «tardando»: se acepta cualquiera de las dos, lo que no se acepta
      // es que no haya aviso.
      expect(src, `${archivo} no tiene el aviso de "tardó más de lo normal"`).toMatch(/tard(ando|ó) más de lo normal/)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2. «Actualizado» es la hora del SYNC, no la de la lectura
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('el reloj de Reposición', () => {
  it('useReposicion no sella lastUpdate con la hora del navegador', () => {
    const src = leer('components/reposicion/useReposicion.ts')
    expect(src, 'volvió el new Date() que hacía ver fresco un espejo de ayer').not.toMatch(/setLastUpdate\(new Date\(\)\)/)
    expect(src).toMatch(/setLastUpdate\(sincro\)/)
    expect(src).toContain('ultimaSincronizacion')
  })

  it('el PDF lleva la hora del sync y no la de la lectura', () => {
    // El papel se lo lleva quien camina el depósito, que no estuvo en esta conversación.
    const src = leer('lib/reposicion/pdf.ts')
    expect(src).toContain('sincronizado')
    expect(src, 'el rótulo viejo decía "Stock leido", que era la hora de la pantalla').not.toContain('Stock leido')
  })

  it('sync_state está abierta en las dos puntas de la puerta del espejo', () => {
    // Si entra en una sola, la pantalla recibe [] con un 200 y vuelve a no tener hora.
    expect(leer('api/_espejo.js'), 'falta sync_state en el CATALOGO del servidor').toMatch(/sync_state:\s*\[/)
    expect(leer('lib/supabase/rest.ts'), 'falta sync_state en POR_EL_SERVIDOR').toContain("'sync_state'")
  })

  it('la puerta acepta la consulta del reloj tal cual la manda la pantalla', () => {
    // 🔴 **El modo de falla silencioso.** `revisarParams` rechaza los paréntesis en `select` y
    // cualquier clave que no sea columna de la tabla; `clave=in.(inventario,diario)` lleva
    // paréntesis. Si la puerta lo rechazara, `ultimaSincronizacion` se comería el error en su
    // `catch` y la pantalla volvería a «sin datos de cuándo se sincronizó» sin que nadie se entere.
    // Por eso el test manda los params EXACTOS, con el `limit`/`offset` que les agrega `fetchAll`.
    const params = 'select=clave,updated_at&clave=in.(inventario,diario)&order=clave&limit=1000&offset=0'
    expect(revisarParams('sync_state', params), 'la puerta rechaza la consulta del reloj').toBeNull()
  })

  it('el sync rápido sella la hora al terminar de escribir el inventario', () => {
    const src = leer('scripts/sync-inventario-solo.js')
    expect(src).toContain("clave: 'inventario'")
    // Después del upsert de inventario, no antes: una hora sellada sobre un sync a medias miente igual.
    expect(src.indexOf('await sellarHora()')).toBeGreaterThan(src.indexOf('[inventario] OK'))
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3. ultimaSincronizacion: qué hora devuelve, y qué hace cuando no hay
// ═══════════════════════════════════════════════════════════════════════════════════════════

const fetchAll = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/rest', () => ({ fetchAll }))

describe('ultimaSincronizacion', () => {
  // ⚠️ Con llaves y sin devolver nada: `beforeEach(() => fetchAll.mockReset())` devuelve el mock,
  // y vitest toma lo que devuelve un hook como función de LIMPIEZA — o sea que al terminar el test
  // llamaba al propio mock, que en el caso de abajo lanza. El test fallaba con el error que el
  // código sí estaba atrapando.
  beforeEach(() => {
    fetchAll.mockReset()
  })

  it('toma la más reciente de los dos syncs que escriben inventario', async () => {
    // El nocturno («diario») y el del botón («inventario») escriben la misma tabla con cadencias
    // distintas: la que vale es la última, sea de quien sea.
    fetchAll.mockResolvedValue([
      { clave: 'diario', updated_at: '2026-09-04T06:12:00.000Z' },
      { clave: 'inventario', updated_at: '2026-09-04T10:30:31.000Z' },
    ])
    const { ultimaSincronizacion } = await import('@/lib/reposicion/cliente')
    const r = await ultimaSincronizacion('bdi')
    expect(r?.toISOString()).toBe('2026-09-04T10:30:31.000Z')
  })

  it('no se deja ganar por el orden en que vuelven las filas', async () => {
    fetchAll.mockResolvedValue([
      { clave: 'inventario', updated_at: '2026-09-01T10:00:00.000Z' },
      { clave: 'diario', updated_at: '2026-09-04T06:12:00.000Z' },
    ])
    const { ultimaSincronizacion } = await import('@/lib/reposicion/cliente')
    expect((await ultimaSincronizacion('bdi'))?.toISOString()).toBe('2026-09-04T06:12:00.000Z')
  })

  it('devuelve null cuando todavía no hay ninguna hora, en vez de inventar una', async () => {
    // Ésta es la diferencia con el bug: «—» es honesto, `new Date()` no.
    fetchAll.mockResolvedValue([])
    const { ultimaSincronizacion } = await import('@/lib/reposicion/cliente')
    expect(await ultimaSincronizacion('bdi')).toBeNull()
  })

  it('ignora las filas sin fecha', async () => {
    fetchAll.mockResolvedValue([{ clave: 'inventario', updated_at: null }])
    const { ultimaSincronizacion } = await import('@/lib/reposicion/cliente')
    expect(await ultimaSincronizacion('bdi')).toBeNull()
  })

  it('si la lectura del reloj falla, no voltea la pantalla', async () => {
    // El stock ya vino; perder la hora no puede costar la sección entera.
    fetchAll.mockImplementation(async () => {
      throw new Error('timeout')
    })
    const { ultimaSincronizacion } = await import('@/lib/reposicion/cliente')
    expect(await ultimaSincronizacion('bdi')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4. Los workflows: el caché que evita que un sync de 40 s tarde 8 minutos
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('workflows de GitHub Actions', () => {
  const dir = join(raiz, '.github/workflows')
  const yamls = readdirSync(dir).filter((f) => f.endsWith('.yml'))

  it('todo workflow que instala dependencias cachea npm', () => {
    // Sin caché se bajan 548 paquetes —Next, React, recharts, vitest— para correr un script que
    // sólo importa @supabase/supabase-js. Un hipo del registry convierte 40 s en 8 minutos.
    const sinCache = yamls.filter((f) => {
      const src = readFileSync(join(dir, f), 'utf8')
      return src.includes('npm ci') && !src.includes("cache: 'npm'")
    })
    expect(sinCache, 'estos workflows instalan sin caché').toEqual([])
  })

  it('los dos syncs que dispara el Monitor dicen la marca en el título del run', () => {
    // La API de GitHub no devuelve los `inputs` al listar runs: sin esto, `api/sync.js` de
    // bdi-catalogo no puede distinguir un run de BDI de uno de Zattia y da el ajeno por propio.
    for (const f of ['sync-inventario.yml', 'sync-ventas-hoy.yml']) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, `${f} sin run-name con la marca`).toMatch(/^run-name:.*\$\{\{\s*inputs\.store\s*\}\}/m)
    }
  })
})
