import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **Las tres reglas que deciden si la contribución es comparable viven en el handler**, donde no
 * llega ningún test de lógica: el núcleo recibe las filas ya elegidas y no puede saber de dónde
 * salieron.
 *
 * 1. **Las ventas técnicas se sacan.** El ETL las saca del payload que mira el navegador
 *    (`lib/datos.ts`), así que el ritmo en unidades ya vive sin ellas. Si el servidor las contara,
 *    las dos mitades quedarían medidas sobre poblaciones distintas y multiplicar unidades por
 *    contribución daría un número que no existe. Medido el 18-ago-2026: en BDI son 11 unidades que
 *    aportan **−$15.608**, porque salen con 100% de descuento y el costo es real.
 * 2. **`channel_id` sólo se pide en BDI.** La tabla de Zattia no tiene esa columna y PostgREST
 *    rechaza el select entero por una columna que no existe ⇒ la contribución de Zattia se caería
 *    con un error de base, no con un renglón vacío.
 * 3. **Las reglas se leen del dashboard, no de una copia.** El día que se cree una cuenta de cobro
 *    nueva en Gestión Nube, una copia local la daría por no facturable: 21% de contribución de más,
 *    en silencio.
 *
 * Es texto contra texto a propósito: lo que se afirma es que el handler siga escrito así.
 */

const raiz = join(__dirname, '..')
const handler = readFileSync(join(raiz, 'api/_norte.js'), 'utf8')

/** El cuerpo de `contribucionDe`, de su firma hasta el `const ES_FECHA` que la sigue. */
const bloque = handler.slice(handler.indexOf('async function contribucionDe('), handler.indexOf('const ES_FECHA'))

describe('🔴 el handler de la contribución', () => {
  it('la función existe y el GET la usa', () => {
    expect(bloque).not.toBe('')
    expect(handler).toContain('contribucionDe(supabase, store, reglas)')
    expect(handler).toContain('contribucion: contrib')
  })

  it('🔴 saca las ventas técnicas con `esVentaTecnica`, que es el mismo criterio que el ETL', () => {
    expect(handler).toContain("from '../lib/etl/tecnica.core.js'")
    expect(bloque).toContain('.filter((v) => !esVentaTecnica(v))')
  })

  it('🔴 pide `channel_id` sólo en BDI: en Zattia esa columna no existe', () => {
    expect(bloque).toContain("store === 'bdi' ? ', channel_id' : ''")
  })

  it('🔴 las reglas salen del dashboard y no de una copia local', () => {
    expect(handler).toContain('DASHBOARD_SUPABASE_URL')
    expect(handler).toContain('DASHBOARD_SUPABASE_SERVICE_KEY')
    expect(handler).toContain("from('cuentas_cobro_gn')")
    expect(handler).toContain("from('comision_medio_pago')")
    // ⛔ Ninguna lista de cuentas escrita a mano acá adentro.
    expect(handler).not.toContain('Transferencia Mayorista')
  })

  it('🔴 que el dashboard no conteste NO puede tumbar la sección', () => {
    // El `catch` devuelve el motivo; la pantalla lo muestra en vez de quedarse sin Norte.
    expect(handler).toContain('disponible: false')
    expect(handler).toContain('motivo:')
  })

  it('la ventana la fija `ventanaUltimos` y no el reloj', () => {
    expect(bloque).toContain('ventanaUltimos(ventas.map((v) => v.date_sale), 30)')
  })

  it('pagina los detalles: PostgREST corta en 1.000 filas sin avisar', () => {
    expect(bloque).toContain("leerTodo(supabase, 'venta_detalles'")
    expect(handler).toContain("from '../lib/supabase/paginar.core.js'")
  })
})
