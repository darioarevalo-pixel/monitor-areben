/**
 * El validador del PÁRRAFO — lo único de una descripción que sigue escribiendo un modelo.
 *
 * 🔴 Hasta el 27-ago-2026 este archivo probaba el borrador entero: etiquetas, conteo de bullets,
 * largo de cada uno, y que la tela se apoyara en el insumo. **Esas pruebas ya no existen, y no
 * porque se haya aflojado la regla**: los bullets se componen desde la ficha de atributos
 * (`lib/tn-desc/atributos.core.js`, con sus propios tests). Una etiqueta inválida o una tela
 * inventada dejaron de ser casos posibles.
 *
 * Los casos de colores son los DOS que ya están mintiendo en la tienda, medidos el 19-ago-2026:
 * TOP EMBER y FAJA CLEO. Los dos nuevos —el arranque y la repetición— salieron de la primera
 * corrida real contra tres productos mudos de Zattia, el 27-ago-2026.
 */

import { describe, it, expect } from 'vitest'
import { validarParrafo, validarTip, generarHtml, tipoDe, MAX_PARRAFO, PRIMEROS } from '../lib/tn-desc/formato'
import type { Contexto } from '../lib/tn-desc/formato'

const ctx: Contexto = {
  variantes: ['S', 'M', 'NEGRO', 'OFF WHITE'],
  nombre: 'CAMISA ALESSA',
  bullets: [
    { etiqueta: 'Tela', texto: 'gasa' },
    { etiqueta: 'Cuello', texto: 'solapa' },
    { etiqueta: 'Calce', texto: 'holgado' },
  ],
}

const OK = 'Camisa fluida que resuelve el día y aguanta la noche sin que te cambies.'
const motivos = (p: string, c: Contexto = ctx) => validarParrafo(p, c).map((x) => x.motivo).join(' | ')

describe('un párrafo que cumple pasa', () => {
  it('sin problemas', () => {
    expect(validarParrafo(OK, ctx)).toEqual([])
  })

  it('sin bullets tampoco se queja: una ficha a medias no bloquea el texto', () => {
    expect(validarParrafo(OK, { ...ctx, bullets: [] })).toEqual([])
  })
})

describe('🔴 no nombra colores: es lo que ya está mintiendo en la tienda', () => {
  it('TOP EMBER promete beige, negro y blanco, y las variantes son blanco y negro', () => {
    const c: Contexto = { ...ctx, nombre: 'TOP EMBER', variantes: ['BLANCO', 'NEGRO'] }
    expect(motivos('Top de red con brillos en blanco para la noche.', c)).toContain('nombra «BLANCO»')
  })

  it('FAJA CLEO promete negro y marrón, y sólo existe marrón', () => {
    const c: Contexto = { ...ctx, nombre: 'FAJA CLEO', variantes: ['MARRON'] }
    expect(motivos('Faja de ecocuero marron que ajusta cualquier conjunto.', c)).toContain('nombra «MARRON»')
  })

  it('los talles NO disparan el falso positivo: «2 bolsillos» no es el talle 2', () => {
    const c: Contexto = { ...ctx, nombre: 'JEAN DUSK', variantes: ['1', '2', '3', 'U'], bullets: [] }
    expect(validarParrafo('Jean de tiro medio con 2 bolsillos al frente.', c)).toEqual([])
  })
})

describe('🔴 no nombra talles ni medidas: eso lo dice la tabla', () => {
  it('la palabra talle', () => {
    expect(motivos('Camisa que va con todo, pedila un talle más grande.')).toContain('nombra el talle')
  })

  it('los centímetros', () => {
    expect(motivos('Camisa con 86 cm de largo total, cae sola.')).toContain('centímetros')
  })
})

describe('🆕 arranca nombrando la prenda (27-ago-2026)', () => {
  it('«Esta prenda…» se rechaza: los tres de la primera corrida arrancaron así', () => {
    expect(motivos('Esta prenda cuenta con un calce cómodo y relajado.')).toContain('arranca con «esta»')
  })

  it('«Este top…» también', () => {
    const c: Contexto = { ...ctx, nombre: 'TOP BLISS', bullets: [] }
    expect(motivos('Este top de un solo hombro destaca por su diseño.', c)).toContain('arranca con «este»')
  })

  it('un artículo NO se rechaza: «Un jean…» ya dice la prenda en la primera línea', () => {
    const c: Contexto = { ...ctx, nombre: 'JEAN LESKA', bullets: [] }
    expect(validarParrafo('Un jean de corte amplio para sumar presencia al conjunto diario.', c)).toEqual([])
  })

  it(`la prenda tiene que estar en los primeros ${PRIMEROS} caracteres, que son los del feed`, () => {
    const c: Contexto = { ...ctx, nombre: 'CAMISA ALESSA', bullets: [] }
    const tarde = 'Para el día y para la noche, sin pensarlo dos veces, llega la camisa.'
    expect(motivos(tarde, c)).toContain(`primeros ${PRIMEROS} caracteres`)
  })

  it('sin nombre de producto no inventa una regla', () => {
    expect(validarParrafo(OK, { ...ctx, nombre: '', bullets: [] })).toEqual([])
  })

  it('los moldes de dos palabras: el tipo de «BABY TEE ICON» es «baby tee», no «baby»', () => {
    expect(tipoDe('BABY TEE ICON BLACK')).toBe('BABY TEE')
    expect(tipoDe('LONG TEE SENSE')).toBe('LONG TEE')
    expect(tipoDe('CAMISA ALESSA')).toBe('CAMISA')
    expect(tipoDe('')).toBe('')
  })
})

describe('🆕 no repite lo que ya dicen los bullets (27-ago-2026)', () => {
  it('si la tela está en el bullet, no va en el párrafo', () => {
    expect(motivos('Camisa de gasa liviana que resuelve el día.')).toContain('repite lo que ya dicen los bullets (gasa)')
  })

  it('TOP BLISS repitió «asimétrico» en el párrafo y en el bullet', () => {
    const c: Contexto = {
      variantes: [],
      nombre: 'TOP BLISS',
      bullets: [{ etiqueta: 'Detalle', texto: 'diseño asimétrico de un solo hombro' }],
    }
    expect(motivos('Top de un solo hombro con diseño asimetrico y caída fluida.', c)).toContain('repite')
  })

  it('las palabras cortas no cuentan: «de», «con» y «que» están en todos lados', () => {
    const c: Contexto = { variantes: [], nombre: 'CAMISA ALESSA', bullets: [{ etiqueta: 'Calce', texto: 'con vuelo' }] }
    expect(validarParrafo('Camisa que se pone con jean y resuelve la semana.', c)).toEqual([])
  })
})

describe('la forma', () => {
  it('el párrafo no puede estar vacío ni pasarse de largo', () => {
    expect(motivos('   ')).toContain('está vacío')
    expect(motivos('Camisa ' + 'a'.repeat(MAX_PARRAFO))).toContain(`el máximo es ${MAX_PARRAFO}`)
  })

  it('vacío corta ahí: no tiene sentido decirle además que no nombra la prenda', () => {
    expect(validarParrafo('', ctx)).toHaveLength(1)
  })

  it('⛔ devuelve TODOS los problemas, no el primero', () => {
    const c: Contexto = { ...ctx, nombre: 'TOP EMBER', variantes: ['BLANCO'] }
    const roto = 'Esta prenda en blanco mide 86 cm y es de gasa, pedila un talle más.'
    expect(validarParrafo(roto, c).length).toBeGreaterThanOrEqual(4)
  })
})

describe('generarHtml', () => {
  const b = { parrafo: OK, bullets: ctx.bullets! }

  it('sale envuelto en la firma, con la etiqueta en negrita', () => {
    const h = generarHtml(b)
    expect(h.startsWith('<!--AREBEN-PROSA-INI-->')).toBe(true)
    expect(h.endsWith('<!--AREBEN-PROSA-FIN-->')).toBe(true)
    expect(h).toContain('<b>Tela:</b> gasa')
  })

  it('escapa el HTML: un bullet con < o & no rompe la ficha', () => {
    const h = generarHtml({ parrafo: 'Cae <bien> & liviano', bullets: [{ etiqueta: 'Tela', texto: 'gasa & tul' }] })
    expect(h).toContain('&lt;bien&gt; &amp; liviano')
    expect(h).toContain('gasa &amp; tul')
    expect(h).not.toContain('<bien>')
  })

  it('sin bullets no deja una lista vacía colgada', () => {
    expect(generarHtml({ parrafo: 'Sola.', bullets: [] })).not.toContain('<ul')
  })
})

describe('🆕 el tip de look (4-sep-2026)', () => {
  // Decisión de Bruno mirando FALDA SAGE: el tip va, pero opcional — un tip flojo pesa más que la
  // falta de tip. Por eso vacío ⛔ no es un problema.
  it('vacío está bien: es opcional', () => {
    expect(validarTip('', { variantes: [] })).toEqual([])
    expect(validarTip('   ', { variantes: [] })).toEqual([])
  })

  it('el de FALDA SAGE pasa', () => {
    expect(validarTip('Con un top básico metido adentro para marcar la cintura.', { variantes: [] })).toEqual([])
  })

  it('le corren las mismas reglas duras que al párrafo: viven en el mismo campo de TN', () => {
    expect(validarTip('Queda bien con el pantalón off white.', { variantes: ['OFF WHITE'] })).toHaveLength(1)
    expect(validarTip('Pedí un talle más para que quede holgado.', { variantes: [] })).toHaveLength(1)
    expect(validarTip('Dobla 5 cm el ruedo y queda perfecta.', { variantes: [] })).toHaveLength(1)
  })

  it('⛔ pero NO le corre la de arrancar por la prenda: un tip arranca por cómo se usa', () => {
    expect(validarTip('Esta se lleva con las botas de caña alta.', { variantes: [] })).toEqual([])
  })

  it('un tip largo se rechaza: es una línea, no un segundo párrafo', () => {
    expect(validarTip('x'.repeat(121), { variantes: [] })).toHaveLength(1)
  })
})

describe('🆕 el HTML: cuidados y tip (4-sep-2026)', () => {
  const base = { parrafo: 'Jean de tiro bajo con caída amplia.', bullets: [{ etiqueta: 'Tela', texto: 'denim rígido' }] }

  it('sin tip y sin cuidados sale exactamente lo de antes', () => {
    const h = generarHtml(base)
    expect(h).not.toContain('Tip de look')
    expect(h).not.toContain('Cuidados de la prenda')
  })

  it('el orden es párrafo → bullets → tip → cuidados', () => {
    const h = generarHtml({ ...base, tip: 'Con zapatilla blanca y remera corta.', cuidados: { grupo: 'denim', lineas: ['No poner en secadora.'] } })
    expect(h.indexOf('Jean de tiro bajo')).toBeLessThan(h.indexOf('denim rígido'))
    expect(h.indexOf('denim rígido')).toBeLessThan(h.indexOf('Tip de look'))
    expect(h.indexOf('Tip de look')).toBeLessThan(h.indexOf('Cuidados de la prenda'))
  })

  it('🔑 y todo queda ADENTRO de la firma, para que se pueda reemplazar entero', () => {
    const h = generarHtml({ ...base, tip: 'Un tip.', cuidados: { grupo: 'denim', lineas: ['No poner en secadora.'] } })
    const cuerpo = h.slice(h.indexOf('<!--AREBEN-PROSA-INI-->'), h.indexOf('<!--AREBEN-PROSA-FIN-->'))
    expect(cuerpo).toContain('Un tip.')
    expect(cuerpo).toContain('No poner en secadora.')
  })
})
