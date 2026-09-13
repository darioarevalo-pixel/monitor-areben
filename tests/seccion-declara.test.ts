import { describe, it, expect } from 'vitest'
import { SECCIONES } from '@/components/secciones/registro'
import { PERM_CAT } from '@/lib/nav.datos'
import { PROPIAS, SENALES_DE_ESCRITURA, declaracionDe } from '@/lib/secciones-declaracion'

/** El piso de «esto es una explicación y ⛔ no un rótulo». Ver el test de abajo. */
const PISO = 40

/**
 * P1 de `PENDIENTES.md`: **cada sección declara, en su pantalla, qué hace y qué escribe.**
 *
 * El renglón corto ya lo exige `seccion-header.test.ts`. Esto exige el LARGO, que es el que dice qué
 * pasa si apretás algo. 🔑 Sin un test, «todas las secciones lo tienen» dura hasta la próxima sección
 * nueva: el `info` es opcional en el tipo (`PermCat.info?`), así que nada lo pedía.
 */
describe('cada sección declara qué hace y qué escribe', () => {
  it('TODA sección registrada tiene su declaración (no se olvida ninguna)', () => {
    const sin = Object.keys(SECCIONES).filter((k) => !declaracionDe(k))
    expect(sin).toEqual([])
  })

  /**
   * Un rótulo de dos palabras pasaría el test de arriba sin declarar nada. El piso es bajo a
   * propósito —⛔ no se mide la calidad de un texto con un número— pero corta el caso que sí importa:
   * copiar el título de la sección en el campo y darlo por hecho.
   */
  it('la declaración es una explicación, ⛔ no un rótulo', () => {
    const cortas = Object.keys(SECCIONES)
      .map((k) => [k, declaracionDe(k) ?? ''] as const)
      .filter(([, t]) => t.trim().length < PISO)
    expect(cortas).toEqual([])
  })

  /**
   * ⚠️ `PROPIAS` es un PARCHE con fecha: existe porque el 12-sep había otra sesión editando
   * `nav.datos.ts`, el lugar donde estos textos van a vivir. Este test lo obliga a ENCOGERSE — el día
   * que el `info` de esa sección alcance solo, la entrada de acá sobra y el test lo dice. Es el mismo
   * patrón que la allowlist del glosario: una excepción tiene que seguir excusando algo.
   */
  it('ninguna entrada de PROPIAS sigue haciendo falta de más', () => {
    const info = new Map<string, string>()
    for (const cat of PERM_CAT) {
      if (cat.info) info.set(cat.key, cat.info)
      for (const sub of cat.subs ?? []) if (sub.info && !info.has(sub.key)) info.set(sub.key, sub.info)
    }
    // Cada motivo se verifica por separado, porque son dos huecos distintos: uno es la ausencia del
    // texto y el otro es que el texto no contesta la pregunta.
    const sobran = Object.entries(PROPIAS).filter(([k, v]) => {
      const t = info.get(k)
      if (v.porque === 'sin-info') return !!t && t.trim().length >= PISO
      return !!t && SENALES_DE_ESCRITURA.test(t)
    }).map(([k]) => k)
    expect(sobran).toEqual([])
  })

  /**
   * 🔑 Y la otra mitad del mismo trato: una entrada que pisa al `info` por «⛔ no dice si escribe»
   * tiene que DECIRLO ella. Sin esto, el motivo es una etiqueta y el texto nuevo puede ser igual de
   * mudo que el que reemplazó — que es exactamente lo que pasó hasta hoy con el renglón corto.
   */
  it('toda entrada de PROPIAS dice si la sección escribe (o que ⛔ no escribe)', () => {
    const mudas = Object.entries(PROPIAS)
      .filter(([, v]) => !SENALES_DE_ESCRITURA.test(v.texto))
      .map(([k]) => k)
    expect(mudas).toEqual([])
  })

  it('y toda entrada de PROPIAS es una sección que existe', () => {
    const fantasmas = Object.keys(PROPIAS).filter((k) => !(k in SECCIONES))
    expect(fantasmas).toEqual([])
  })
})
