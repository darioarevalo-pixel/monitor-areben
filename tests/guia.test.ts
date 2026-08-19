import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { anclasDeLaGuia, anterior, resolverPaso, siguiente, type PasoGuia } from '@/lib/guia/core'
import { GUIA_ENVIOS } from '@/lib/envios/guia'

/**
 * Dos mitades que prueban cosas distintas:
 *
 * 1. **La lógica** — que un paso cuyo control no está en pantalla se muestre IGUAL, sobre su ancla
 *    estable y diciendo por qué. Es lo único de la pieza que puede estar mal en silencio: si se
 *    saltea, el tour le enseña a la persona una pantalla que no es la suya y le esconde justo el
 *    botón que vino a buscar.
 * 2. **La deriva** — que cada `data-guia` que la guía nombra EXISTA en el JSX. Sin esto, el día que
 *    alguien saque «Sugerir precios» el tour queda señalando el vacío y no falla nada: un globo
 *    flotando en una esquina se lee como un problema de CSS.
 */

const raiz = join(__dirname, '..')
const jsx = readFileSync(join(raiz, 'components/envios/Envios.tsx'), 'utf8')
const tabs = readFileSync(join(raiz, 'components/ui/Tabs.tsx'), 'utf8')

/** Los `data-guia` que el JSX pone de verdad: literales, adentro de un ternario, o vía `TabItem.guia`. */
function anclasDelJsx(fuente: string): Set<string> {
  const halladas = new Set<string>()
  // Las clases de caracteres van acotadas a `[\w.]` a propósito: un `[^"]+` se come media pantalla
  // cuando el atributo es un ternario, y el test empieza a hablar de anclas que no existen.
  for (const m of fuente.matchAll(/data-guia="([\w.]+)"/g)) halladas.add(m[1])
  for (const m of fuente.matchAll(/data-guia=\{[^}]*?'([\w.]+)'/g)) halladas.add(m[1])
  // El ancla de una pestaña no se escribe como atributo: viaja en el `TabItem` y la pone `Tabs`.
  for (const m of fuente.matchAll(/\bguia: '([\w.]+)'/g)) halladas.add(m[1])
  return halladas
}

describe('resolverPaso — el paso nunca se saltea', () => {
  const conFina: PasoGuia = {
    ancla: 'x.estable',
    anclaFina: 'x.fina',
    texto: 'Apretá esto.',
    siNoEsta: 'Aparece cuando hay filas.',
  }
  const sinFina: PasoGuia = { ancla: 'x.estable', texto: 'Mirá esto.' }

  it('usa el control fino cuando está en pantalla, y no dice nada de más', () => {
    const r = resolverPaso(conFina, (a) => a === 'x.fina' || a === 'x.estable')
    expect(r.ancla).toBe('x.fina')
    expect(r.texto).toBe('Apretá esto.')
    expect(r.faltaElControl).toBe(false)
  })

  it('🔴 cuando el control fino NO está, cae al ancla estable Y lo dice', () => {
    const r = resolverPaso(conFina, (a) => a === 'x.estable')
    // Devolver 'x.fina' acá dejaría el globo flotando en una esquina, que nadie lee como un error.
    expect(r.ancla).toBe('x.estable')
    expect(r.texto).toBe('Apretá esto. Aparece cuando hay filas.')
    expect(r.faltaElControl).toBe(true)
  })

  it('un paso sin control fino se para siempre en su ancla', () => {
    const r = resolverPaso(sinFina, () => false)
    expect(r.ancla).toBe('x.estable')
    expect(r.texto).toBe('Mirá esto.')
    expect(r.faltaElControl).toBe(false)
  })

  it('los bordes: el primero no tiene Atrás y el último no tiene Siguiente', () => {
    expect(anterior(0)).toBeNull()
    expect(anterior(3)).toBe(2)
    expect(siguiente(0, 3)).toBe(1)
    expect(siguiente(2, 3)).toBeNull()
  })

  it('anclasDeLaGuia junta las dos anclas de cada paso, sin repetir', () => {
    expect(anclasDeLaGuia([conFina, sinFina])).toEqual(['x.estable', 'x.fina'])
  })
})

describe('la guía de Envíos no puede envejecer', () => {
  it('cada ancla que la guía nombra existe como data-guia en la pantalla', () => {
    const enLaPantalla = anclasDelJsx(jsx)
    for (const ancla of anclasDeLaGuia(GUIA_ENVIOS)) {
      expect(enLaPantalla, `falta data-guia="${ancla}" en components/envios/Envios.tsx`).toContain(ancla)
    }
  })

  it('y no queda ningún data-guia huérfano, que sería un ancla que nadie usa', () => {
    const usadas = new Set(anclasDeLaGuia(GUIA_ENVIOS))
    for (const ancla of anclasDelJsx(jsx)) {
      expect(usadas, `data-guia="${ancla}" no lo nombra ningún paso de lib/envios/guia.ts`).toContain(ancla)
    }
  })

  it('🔴 y `Tabs` sigue escribiendo el ancla de la pestaña', () => {
    // Sin esta línea el `guia: 'envios.tab.dia'` del `TabItem` quedaría puesto y **no llegaría al
    // DOM**: el test de arriba lo daría por existente y el tour se pararía en el centro de la
    // pantalla. Es el mismo agujero que tiene `Th`, que no propaga props sueltas.
    expect(tabs).toContain('data-guia={it.guia}')
  })

  it('las pestañas de los pasos son las que la pantalla tiene de verdad', () => {
    // El `key` de cada `TabItem`. Si alguien renombra una pestaña, el paso pediría abrir una que no
    // existe y el tour se quedaría mudo en la que esté — sin fallar nada.
    const claves = new Set([...jsx.matchAll(/\{ key: '([a-z]+)', label:/g)].map((m) => m[1]))
    expect(claves.size).toBeGreaterThan(0)
    for (const p of GUIA_ENVIOS) {
      if (p.pestania) expect(claves, `la pestaña "${p.pestania}" ya no existe`).toContain(p.pestania)
    }
  })

  it('un paso con control fino siempre trae su "si no está" (lo obliga el tipo, se afirma igual)', () => {
    for (const p of GUIA_ENVIOS) {
      if (p.anclaFina) expect(p.siNoEsta && p.siNoEsta.length > 10).toBe(true)
    }
  })
})
