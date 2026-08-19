/**
 * El formato base, hecho ejecutable.
 *
 * 🔴 Este validador es carga estructural, no un adorno: cuando el borrador lo escriba un
 * modelo, el JSON Schema de structured outputs NO puede fijar «3 o 4 bullets» ni «máximo
 * 220 caracteres» (no soporta minItems/maxItems/maxLength). Si esto no está, no hay nada
 * que sostenga el formato.
 *
 * Los casos de colores son los DOS que ya están mintiendo en la tienda, medidos el
 * 19-ago-2026: TOP EMBER y FAJA CLEO.
 */

import { describe, it, expect } from 'vitest'
import { validarBorrador, generarHtml, ETIQUETAS, MAX_PARRAFO, MAX_BULLET } from '../lib/tn-desc/formato'
import type { Borrador, Contexto, Etiqueta } from '../lib/tn-desc/formato'

const ok: Borrador = {
  parrafo: 'Una camisa fluida que resuelve el día y aguanta la noche sin que te cambies.',
  bullets: [
    { etiqueta: 'Tela', texto: 'gasa liviana con caída' },
    { etiqueta: 'Cuello', texto: 'solapa clásica' },
    { etiqueta: 'Calce', texto: 'holgado, cae del hombro' },
  ],
}
const ctx: Contexto = { variantes: ['S', 'M', 'NEGRO', 'OFF WHITE'], insumo: 'gasa, botones nacarados', nombre: 'CAMISA ALESSA' }
const motivos = (b: Borrador, c: Contexto = ctx) => validarBorrador(b, c).map((p) => p.motivo).join(' | ')

describe('un borrador que cumple pasa', () => {
  it('sin problemas', () => {
    expect(validarBorrador(ok, ctx)).toEqual([])
  })
  it('los talles de una letra NO se confunden con palabras del texto', () => {
    // 'S' y 'M' son variantes, pero buscarlas en prosa daría falsos positivos en cualquier
    // palabra. Por eso sólo se buscan variantes de 3 letras o más.
    expect(validarBorrador(ok, { ...ctx, variantes: ['S', 'M', 'L', 'XL'] })).toEqual([])
  })

  it('🔑 los talles NUMÉRICOS tampoco: «2 bolsillos» no es el talle 2', () => {
    // TiendaNube guarda los talles como valores de variante igual que los colores, y los de
    // pantalón son números (`/^\d{1,3}$/` en la heurística del audit). Sin el piso de 3
    // caracteres, un párrafo que dice «2 bolsillos» quedaría rechazado por «nombrar una
    // variante» — y quien revisa no tendría idea de por qué.
    const b: Borrador = { ...ok, parrafo: 'Jean recto de tiro alto con 2 bolsillos al frente.' }
    expect(validarBorrador(b, { ...ctx, variantes: ['1', '2', '3', 'U'] })).toEqual([])
  })
})

describe('🔴 no nombra colores: es lo que ya está mintiendo en la tienda', () => {
  it('TOP EMBER: el texto prometía beige y las variantes son blanco y negro', () => {
    const b: Borrador = { ...ok, parrafo: 'Top de red con brillos, disponible en beige.' }
    expect(motivos(b, { ...ctx, variantes: ['BEIGE', 'NEGRO', 'BLANCO'] })).toContain('nombra «BEIGE»')
  })
  it('FAJA CLEO: prometía negro y marrón, y sólo existe marrón', () => {
    const b: Borrador = { ...ok, bullets: [...ok.bullets.slice(1), { etiqueta: 'Detalle', texto: 'hebilla redonda en negro' }] }
    expect(motivos(b, { ...ctx, variantes: ['MARRON'] })).not.toContain('nombra')
    expect(motivos(b, { ...ctx, variantes: ['NEGRO'] })).toContain('nombra «NEGRO»')
  })
  it('no se le escapa por el acento ni por las mayúsculas', () => {
    const b: Borrador = { ...ok, parrafo: 'Camisa fluida en Marrón chocolate.' }
    expect(motivos(b, { ...ctx, variantes: ['marron'] })).toContain('nombra')
  })
  it('un color que es PARTE de otra palabra no cuenta', () => {
    const b: Borrador = { ...ok, parrafo: 'Blanquecino y desestructurado, cae sin marcar.' }
    expect(motivos(b, { ...ctx, variantes: ['BLANCO'] })).not.toContain('nombra')
  })
})

describe('🔴 no nombra talles ni medidas: eso lo dice la tabla', () => {
  it('rechaza «talle» y «talles»', () => {
    expect(motivos({ ...ok, parrafo: 'Viene en talle único.' })).toContain('nombra el talle')
    expect(motivos({ ...ok, parrafo: 'Hay dos talles disponibles.' })).toContain('nombra el talle')
  })
  it('rechaza los centímetros', () => {
    expect(motivos({ ...ok, bullets: [...ok.bullets.slice(1), { etiqueta: 'Largo', texto: '104 cm de largo total' }] })).toContain('centímetros')
    expect(motivos({ ...ok, bullets: [...ok.bullets.slice(1), { etiqueta: 'Largo', texto: 'largo 40cm' }] })).toContain('centímetros')
  })
})

describe('🔴 la tela es dato, no adivinanza', () => {
  it('con el insumo vacío y un nombre que no la trae, el bullet de Tela se rechaza', () => {
    expect(motivos(ok, { ...ctx, insumo: '', nombre: 'CAMISA ALESSA' })).toContain('no se inventa')
  })
  it('si la tela está en el insumo, pasa', () => {
    expect(motivos(ok, { ...ctx, insumo: 'gasa' })).not.toContain('no se inventa')
  })
  it('si la tela está en el NOMBRE, también pasa: REMERA de jersey', () => {
    const b: Borrador = { ...ok, bullets: [{ etiqueta: 'Tela', texto: 'jersey 20/1' }, ...ok.bullets.slice(1)] }
    expect(motivos(b, { ...ctx, insumo: '', nombre: 'REMERA HONEST jersey' })).not.toContain('no se inventa')
  })
  it('sin bullet de Tela no se exige nada: es la salida honesta cuando no se sabe', () => {
    const b: Borrador = { ...ok, bullets: ok.bullets.slice(1).concat({ etiqueta: 'Detalle', texto: 'botones nacarados' }) }
    expect(validarBorrador(b, { ...ctx, insumo: '' })).toEqual([])
  })
})

describe('la forma: párrafo y bullets', () => {
  it('el párrafo no puede estar vacío ni pasarse de largo', () => {
    expect(motivos({ ...ok, parrafo: '   ' })).toContain('está vacío')
    expect(motivos({ ...ok, parrafo: 'a'.repeat(MAX_PARRAFO + 1) })).toContain(`el máximo es ${MAX_PARRAFO}`)
    expect(validarBorrador({ ...ok, parrafo: 'a'.repeat(MAX_PARRAFO) }, ctx)).toEqual([])
  })
  it('3 o 4 bullets: ni 2 ni 5', () => {
    expect(motivos({ ...ok, bullets: ok.bullets.slice(0, 2) })).toContain('el mínimo es 3')
    const cinco = [...ok.bullets, { etiqueta: 'Manga', texto: 'larga' }, { etiqueta: 'Largo', texto: 'a la cadera' }]
    expect(motivos({ ...ok, bullets: cinco })).toContain('el máximo es 4')
  })
  it('la etiqueta sale de la lista cerrada, y no se repite', () => {
    expect(motivos({ ...ok, bullets: [{ etiqueta: 'Vibra', texto: 'linda' }, ...ok.bullets.slice(1)] })).toContain('no es una de las admitidas')
    expect(motivos({ ...ok, bullets: [ok.bullets[0], ok.bullets[0], ok.bullets[1]] })).toContain('ya se usó')
    expect(ETIQUETAS).toContain('Tela')
  })
  it('el bullet no va vacío, ni largo, ni termina en punto', () => {
    expect(motivos({ ...ok, bullets: [{ etiqueta: 'Tela', texto: '' }, ...ok.bullets.slice(1)] })).toContain('no dice nada')
    expect(motivos({ ...ok, bullets: [{ etiqueta: 'Cuello', texto: 'a'.repeat(MAX_BULLET + 1) }, ...ok.bullets.slice(1)] })).toContain(`el máximo es ${MAX_BULLET}`)
    expect(motivos({ ...ok, bullets: [{ etiqueta: 'Cuello', texto: 'solapa clásica.' }, ...ok.bullets.slice(1)] })).toContain('termina en punto')
  })
  it('⛔ devuelve TODOS los problemas, no el primero', () => {
    const roto: Borrador = { parrafo: '', bullets: [{ etiqueta: 'Vibra', texto: 'x'.repeat(99) }] }
    expect(validarBorrador(roto, ctx).length).toBeGreaterThanOrEqual(4)
  })
})

describe('generarHtml', () => {
  it('sale envuelto en la firma, con la etiqueta en negrita', () => {
    const h = generarHtml(ok)
    expect(h.startsWith('<!--AREBEN-PROSA-INI-->')).toBe(true)
    expect(h.endsWith('<!--AREBEN-PROSA-FIN-->')).toBe(true)
    expect(h).toContain('<b>Tela:</b> gasa liviana con caída')
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

describe('el .js y los tipos no se separan', () => {
  it('ETIQUETAS es exactamente la unión declarada en formato.ts', () => {
    // 🔑 Las reglas viven en `formato.core.js` (JS plano, para que las alcance
    // `api/_tn-desc-ia.js`) y la unión `Etiqueta` se declara a mano en el `.ts`, porque
    // TypeScript infiere `string[]` de un archivo JS. Agregar una etiqueta en el `.js` sin
    // tocar el `.ts` la dejaría andando en el validador y rechazada por el `<select>` de la
    // pantalla: media regla en cada lado, y ninguna mitad se ve mal sola.
    const declaradas: Etiqueta[] = ['Tela', 'Calce', 'Cuello', 'Escote', 'Detalle', 'Largo', 'Manga', 'Espalda']
    expect([...ETIQUETAS]).toEqual(declaradas)
  })
})
