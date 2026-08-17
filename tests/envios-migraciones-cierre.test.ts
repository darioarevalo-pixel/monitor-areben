import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **Un cierre de tanda tiene que ser DURADERO, y no lo era.**
 *
 * `scripts/apply-envios.mjs` aplica una lista de archivos en **cada** corrida —son idempotentes, o
 * eso decían— y los cierres entran sólo con su bandera (`--cerrar-tanda-a`, `--cerrar-tanda-g`).
 * El problema es que dos de los archivos de siempre **deshacían** lo que un cierre había hecho:
 *
 *   · `migrate-envios-estados.sql` hacía `drop constraint` + `add` del check **ancho** (siete
 *     estados), así que volvía a aceptar `despachado` y `reintento` después de que el cierre lo
 *     hubiera estrechado a cinco;
 *   · `migrate-envios-cuenta.sql` hacía `add column if not exists pago_cadete`, que después de un
 *     `drop column` **no es idempotente: es una resurrección**.
 *
 * 🔴 **Pasó de verdad el 17-ago-2026.** Corrió `--cerrar-tanda-a` (check en cinco, `pago_cadete`
 * dropeada), y veinte minutos después `--cerrar-tanda-g` dejó el check otra vez en siete y la columna
 * de vuelta. Se cazó porque la misma salida del script decía «pago_cadete: se fue ✓» en una corrida y
 * «sigue» en la siguiente — 🔑 **dos corridas del mismo comando contestando distinto sobre el mismo
 * hecho es el síntoma**, y el script lo informaba como si faltara cerrar una tanda ya cerrada.
 *
 * Es peligroso **en una sola dirección**: la app ya borró `ESTADOS_LEGADO`, así que una base que
 * acepta lo que la app no sabe leer es exactamente el orden inseguro que la ventana quería evitar.
 *
 * Esto no prueba comportamiento —no hay base contra la que correr en el CI—: prueba que los dos
 * archivos **sigan preguntando antes de escribir**. Es texto contra texto, como
 * `envios-cobrado-handler.test.ts` y `blob-upload-sesion.test.ts`.
 */

const raiz = join(__dirname, '..')
const sql = (n: string) => readFileSync(join(raiz, 'sql', n), 'utf8')

const estados = sql('migrate-envios-estados.sql')
const cuenta = sql('migrate-envios-cuenta.sql')
const script = readFileSync(join(raiz, 'scripts/apply-envios.mjs'), 'utf8')

/** Los que se aplican SIEMPRE: los de la lista base, sin las banderas. */
const listaBase = script.slice(script.indexOf('const archivos = ['), script.indexOf(']', script.indexOf('const archivos = [')))

describe('🔴 los cierres de tanda no los puede deshacer una corrida posterior', () => {
  it('los dos archivos en cuestión están en la lista que corre siempre', () => {
    expect(listaBase).toContain('migrate-envios-estados.sql')
    expect(listaBase).toContain('migrate-envios-cuenta.sql')
    // Y los cierres NO: entran sólo con su bandera.
    expect(listaBase).not.toContain('migrate-envios-estados-cierre.sql')
    expect(listaBase).not.toContain('migrate-envios-plata-drop.sql')
  })

  // 🔴 El mutante es volver a las dos líneas sueltas de antes.
  it('🔴 el check ancho se re-crea sólo si el cierre NO corrió', () => {
    expect(estados).toContain('pg_get_constraintdef')
    expect(estados).toContain("def not like '%despachado%'")
    // La guarda tiene que estar ANTES del `drop constraint`, o no guarda nada.
    expect(estados.indexOf('pg_get_constraintdef')).toBeLessThan(estados.indexOf('drop constraint if exists envios_reparto_estado_check'))
  })

  it('🔴 `pago_cadete` no se resucita después de que el cierre la dropeó', () => {
    expect(cuenta).toContain("column_name = 'envio_bonificado'")
    expect(cuenta.indexOf("column_name = 'envio_bonificado'")).toBeLessThan(cuenta.indexOf('add column if not exists pago_cadete'))
  })

  // 🔑 El guard de `pago_cadete` se apoya en que la columna que la reemplaza se agrega DESPUÉS.
  // Si alguien reordena la lista, el guard pasa a leer una columna que ya existe en la primera
  // corrida y la migración deja de crear `pago_cadete` en una base nueva, en silencio.
  it('🔑 el orden del que la crea y el que la reemplaza es parte del guard', () => {
    expect(listaBase.indexOf('migrate-envios-cuenta.sql')).toBeLessThan(listaBase.indexOf('migrate-envios-plata.sql'))
  })
})
