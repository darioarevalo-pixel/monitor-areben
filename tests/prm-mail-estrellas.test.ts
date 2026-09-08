// El mail de la recompra. 🔑 Lo que fija este archivo es que el mail ⛔ no afirme lo que la ficha
// ⛔ no dice: el cero que ⛔ no es un plazo, el stock que ⛔ no se pudo leer, y el silencio cuando
// ⛔ no hay nada.
import { describe, it, expect } from 'vitest'
// ⚠️ Núcleo en JS plano: lo importan también `api/` y `scripts/*.mjs` (Node 20 en Actions).
import { armarMail, asuntoDe, cuandoSeTermina, renglonDe } from '@/lib/prm/mail-estrellas.core.js'

const fila = (nombre: string, extra: Record<string, unknown> = {}) => ({
  nombre,
  sku: 'SKU',
  producto_id: '1',
  unidades: 12,
  dias: 7,
  vendidas: 7,
  colocado: 7 / 12,
  seAgotaEn: 5,
  stock: 5,
  ...extra,
})

describe('cuandoSeTermina', () => {
  it('🔴 el cero ⛔ no es un plazo: se dice que ya lo colocó', () => {
    expect(cuandoSeTermina(0)).toBe('ya lo colocó entero')
  })
  it('un día es singular', () => {
    expect(cuandoSeTermina(1)).toBe('se termina en 1 día')
  })
  it('el que ⛔ no vendió ⛔ no tiene plazo, y ⛔ no se inventa uno', () => {
    expect(cuandoSeTermina(null)).toBeNull()
  })
})

describe('renglonDe', () => {
  it('dice lo mismo que la fila de la ficha: llegada, compradas, vendidas, plazo y stock', () => {
    const r = renglonDe(fila('TOP ALO'))
    expect(r.nombre).toBe('TOP ALO')
    expect(r.detalle).toContain('llegó hace 7 d')
    expect(r.detalle).toContain('compró 12, vendió 7 (58%)')
    expect(r.detalle).toContain('se termina en 5 días')
    expect(r.detalle).toContain('stock de hoy: 5')
  })

  it('🔴 el stock que ⛔ no se pudo leer se DICE, ⛔ no se dibuja como 0', () => {
    // Un 0 acá manda a Flores a comprar algo de lo que puede haber una pila en el depósito.
    expect(renglonDe(fila('TOP ALO', { stock: null })).detalle).toContain('no se pudo leer')
    expect(renglonDe(fila('TOP ALO', { stock: null })).detalle).not.toContain('stock de hoy: 0')
  })

  it('el stock en 0 SÍ es un 0: quedó sin nada, y eso es lo más urgente que hay', () => {
    expect(renglonDe(fila('TOP ALO', { stock: 0 })).detalle).toContain('stock de hoy: 0')
  })

  it('sin nombre cae al SKU antes que al id: el id ⛔ no le dice nada a nadie', () => {
    expect(renglonDe(fila('', { nombre: null })).nombre).toBe('SKU')
  })
})

describe('armarMail', () => {
  const prov = (nombre: string, filas: ReturnType<typeof fila>[]) => ({ nombre, marca: 'zattia', filas })

  it('🔑 con cero ⛔ NO se manda nada: un mail que dice «no hay nada» enseña a no abrirlo', () => {
    expect(armarMail([], 30)).toBeNull()
    expect(armarMail([prov('ASKDENIM', [])], 30)).toBeNull()
  })

  it('el asunto lleva cuántos productos y de cuántos proveedores', () => {
    expect(asuntoDe([prov('A', [fila('x'), fila('y')]), prov('B', [fila('z')])])).toBe(
      'Proveedores · 3 para recomprar, de 2 proveedores',
    )
  })

  it('con un solo proveedor el asunto ⛔ no dice «proveedores»', () => {
    expect(asuntoDe([prov('A', [fila('x')])])).toBe('Proveedores · 1 para recomprar, de 1 proveedor')
  })

  it('🔑 primero el proveedor del que me quedo sin ANTES, ⛔ no el que más productos tiene', () => {
    const mail = armarMail(
      [
        prov('LENTO', [fila('a', { seAgotaEn: 6 }), fila('b', { seAgotaEn: 7 })]),
        prov('URGENTE', [fila('c', { seAgotaEn: 0 })]),
      ],
      30,
    )!
    expect(mail.texto.indexOf('URGENTE')).toBeLessThan(mail.texto.indexOf('LENTO'))
  })

  it('y adentro de cada proveedor, el más urgente arriba', () => {
    const mail = armarMail([prov('A', [fila('tarde', { seAgotaEn: 7 }), fila('temprano', { seAgotaEn: 1 })])], 30)!
    expect(mail.texto.indexOf('temprano')).toBeLessThan(mail.texto.indexOf('tarde'))
  })

  it('el pie dice la ventana que se miró: «hace 28 d» sin eso ⛔ no se sabe si está al borde', () => {
    expect(armarMail([prov('A', [fila('x')])], 15)!.texto).toContain('últimos 15 días')
  })

  it('🔴 el pie avisa que el stock ⛔ no se resta de la compra', () => {
    const mail = armarMail([prov('A', [fila('x')])], 30)!
    expect(mail.texto).toContain('no se restan entre sí')
    expect(mail.html).toContain('no se restan entre sí')
  })

  it('el HTML escapa lo que viene de la base: un nombre con `<` ⛔ no arma una etiqueta', () => {
    const mail = armarMail([prov('A', [fila('<b>TOP</b>')])], 30)!
    expect(mail.html).toContain('&lt;b&gt;TOP&lt;/b&gt;')
    expect(mail.html).not.toContain('<b>TOP</b>')
  })

  it('🔴 dice CUÁNDO se sincronizó el stock: ese espejo lo aprieta una persona, ⛔ no un reloj', () => {
    expect(armarMail([prov('A', [fila('x')])], 30, '8/9, 11:45 a. m.')!.texto).toContain('se sincronizó el 8/9')
  })

  it('sin esa fecha el mail sale igual, ⛔ pero no inventa una', () => {
    const mail = armarMail([prov('A', [fila('x')])], 30)!
    expect(mail.texto).not.toContain('se sincronizó')
    expect(mail.texto).toContain('no se restan entre sí')
  })

  it('lleva el link a la sección con la marca puesta', () => {
    expect(armarMail([prov('A', [fila('x')])], 30)!.texto).toContain('/prm?m=zattia')
  })
})
