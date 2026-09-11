import { describe, it, expect } from 'vitest'
import { ambitoDe, GENERAL, idDestacado, indicePorPid as indiceJs } from '@/lib/destacados/core.js'

/** El núcleo es `.js` plano (lo importa el handler), así que acá se le pone la cara tipada UNA vez. */
const indicePorPid = indiceJs as (filas: { id: string; producto_id: number; sacada_en: string | null }[])
  => Record<string, { id: string } | undefined>

/**
 * Los productos estrella: la marca de qué se comunica.
 *
 * 🔴 **Este archivo nació de un defecto que ni los tests ni las sondas de la migración cazaron**, y
 * eso es lo que hay que entender antes de tocarlo. El id llevaba sólo la FECHA
 * (`${store}:${pid}:${ambito}:${iso.slice(0,10)}`, copiado de `clavados`), así que
 * **prender la ⭐, apagarla y volver a prenderla el mismo día** chocaba contra la clave primaria.
 *
 * Y el handler leía ese choque como «ya estaba» —miraba `duplicate key` a secas— y contestaba
 * **200**: la persona apretaba la estrella, ⛔ no pasaba nada, y ⛔ nadie veía un error.
 *
 * ⚠️ **Por qué estaba todo en verde:** ni los tests ni las sondas por `rollback` de
 * `sql/migrate-destacados.sql` vuelven a marcar **en el mismo día** — probaban «sacada + nueva
 * entra» con una fecha vieja escrita a mano. Lo cazó **ejercer el verbo contra la base**.
 *
 * Los mutantes que tienen que caer:
 *
 *  1. `idDestacado` volviendo a `iso.slice(0, 10)`.
 *  2. `ambitoDe('')` devolviendo `''` en vez de `null` — una tercera estrella que nadie puede sacar.
 *  3. `indicePorPid` metiendo las sacadas — la ⭐ se dibuja prendida de algo que alguien apagó.
 */

describe('el id de una estrella', () => {
  it('🔴 dos decisiones del MISMO DÍA no comparten id: prender → apagar → prender es el camino normal', () => {
    const a = idDestacado('bdi', 1, null, '2026-09-11T11:39:14.684Z')
    const b = idDestacado('bdi', 1, null, '2026-09-11T18:02:01.001Z')
    expect(a).not.toBe(b)
  })

  it('la fecha se sigue leyendo adentro, que es para lo que estaba', () => {
    expect(idDestacado('zattia', 941566, 'l178', '2026-09-11T11:39:14.684Z')).toContain('20260911')
  })

  it('el alcance entra en el id: la de la campaña y la general son dos filas distintas', () => {
    const iso = '2026-09-11T11:39:14.684Z'
    expect(idDestacado('bdi', 1, 'lX', iso)).not.toBe(idDestacado('bdi', 1, null, iso))
    expect(idDestacado('bdi', 1, null, iso)).toContain(':gral:')
  })

  it('y la marca también: el 1234 de BDI y el de Zattia son dos productos', () => {
    const iso = '2026-09-11T11:39:14.684Z'
    expect(idDestacado('bdi', 1234, null, iso)).not.toBe(idDestacado('zattia', 1234, null, iso))
  })
})

describe('el alcance', () => {
  it('🔴 vacío es la GENERAL, ⛔ no una campaña que se llama vacío', () => {
    // Un `?liq=` vacío en la URL tiene que significar «la general». Si devolviera `''`, sería una
    // tercera estrella invisible: no la lista ninguna pantalla y nadie la puede sacar.
    expect(ambitoDe('')).toBe(GENERAL)
    expect(ambitoDe(null)).toBe(GENERAL)
    expect(ambitoDe(undefined)).toBe(GENERAL)
    expect(ambitoDe('   ')).toBe(GENERAL)
    expect(ambitoDe('general')).toBe(GENERAL)
  })

  it('y una campaña de verdad viaja limpia', () => {
    expect(ambitoDe('  l1788656536418_tdukfi  ')).toBe('l1788656536418_tdukfi')
  })
})

describe('el índice de la fila', () => {
  const fila = (pid: number, sacada: string | null) => ({
    id: `x${pid}`, producto_id: pid, sacada_en: sacada,
  })

  it('🔴 una estrella SACADA ⛔ no entra: se dibujaría prendida algo que alguien apagó', () => {
    const m = indicePorPid([fila(1, null), fila(2, '2026-09-10T00:00:00Z')])
    expect(Object.keys(m)).toEqual(['1'])
  })

  it('la clave es string: el pid viaja como texto en toda la pantalla', () => {
    expect(indicePorPid([fila(941566, null)])['941566']).toBeTruthy()
  })

  it('sin filas no explota', () => {
    expect(indicePorPid([])).toEqual({})
    expect(indicePorPid(null as never)).toEqual({})
  })
})
