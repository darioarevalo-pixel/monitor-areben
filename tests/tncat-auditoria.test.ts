import { describe, it, expect } from 'vitest'
import {
  choquesDe,
  colorEnVariante,
  coloresDe,
  coloresSinFoto,
  estadoDe,
  etiquetaDe,
  familiasEn,
  fichaDe,
  fotosLibresDe,
  huellaDe,
  nombreArchivo,
  sospechasDe,
} from '@/lib/tncat/auditoria'
import { indexarStockGn } from '@/lib/tncat/stock-variante'
import type { ProductoFchk, VarianteFchk } from '@/lib/tncat/tipos'

const v = (color: string | null, image_url: string | null, over: Partial<VarianteFchk> = {}): VarianteFchk => ({
  color,
  image_url,
  ...over,
})
const prod = (variantes: VarianteFchk[], imagenes: { id: string; src: string }[] = []): ProductoFchk => ({
  id: '1',
  name: 'P',
  image_count: imagenes.length,
  imagenes,
  variantes,
})

/**
 * El caso real que originó la auditoría: BORDER CASE tiene la foto de la negra vinculada a
 * BLACK, AZUL TITANIUM y NATURAL TITANIUM. Figura como "4 de 4 colores con foto ✓" y el filtro
 * de problemas de `fchk` lo esconde. Si estos tests no pasan, la pantalla vuelve a ser ciega
 * justo al error que más caro sale.
 */
describe('auditoría de fotos — la misma foto en dos colores', () => {
  it('detecta el choque y lista los colores que se reparten la foto', () => {
    const p = prod([
      v('BLACK', 'negra.jpg'),
      v('AZUL TITANIUM', 'negra.jpg'),
      v('NATURAL TITANIUM', 'negra.jpg'),
      v('SILVER', 'plata.jpg'),
    ])
    const ch = choquesDe(p)
    expect(ch).toHaveLength(1)
    expect(ch[0].foto).toBe('negra.jpg')
    expect(ch[0].colores).toEqual(['AZUL TITANIUM', 'BLACK', 'NATURAL TITANIUM'])
    expect(ch[0].variantes).toBe(3)
  })

  it('una foto por color no es choque', () => {
    expect(choquesDe(prod([v('ROJO', 'a.jpg'), v('AZUL', 'b.jpg')]))).toEqual([])
  })

  it('el mismo color repetido en varios modelos no es choque', () => {
    // Es lo normal: una funda azul para iPhone 14 y para 15 comparten la foto del azul.
    expect(choquesDe(prod([v('AZUL', 'a.jpg'), v('AZUL', 'a.jpg'), v('ROJO', 'b.jpg')]))).toEqual([])
  })

  it('las variantes sin color no participan (usan la foto principal)', () => {
    expect(choquesDe(prod([v(null, 'a.jpg'), v(null, 'a.jpg')]))).toEqual([])
  })

  it('ordena primero el choque que ensucia más publicaciones', () => {
    const p = prod([
      v('A', 'x.jpg'),
      v('B', 'x.jpg'),
      v('C', 'y.jpg'),
      v('C', 'y.jpg'),
      v('D', 'y.jpg'),
      v('D', 'y.jpg'),
    ])
    expect(choquesDe(p).map((c) => c.foto)).toEqual(['y.jpg', 'x.jpg'])
  })
})

describe('auditoría — colores y alcance', () => {
  it('color en la variante es tener más de un color distinto', () => {
    expect(colorEnVariante(prod([v('ROJO', 'a.jpg'), v('AZUL', 'b.jpg')]))).toBe(true)
    // Un producto de un solo color (el color está en el nombre): no hay forma de que se mezcle.
    expect(colorEnVariante(prod([v('ROJO', 'a.jpg'), v('ROJO', 'a.jpg')]))).toBe(false)
    expect(colorEnVariante(prod([v(null, 'a.jpg')]))).toBe(false)
  })

  it('coloresDe devuelve los distintos, ordenados y sin repetir', () => {
    expect(coloresDe(prod([v('ROJO', null), v('AZUL', null), v('ROJO', null)]))).toEqual(['AZUL', 'ROJO'])
  })

  it('un color cuenta como con foto si alguna de sus variantes la tiene', () => {
    // La foto del color sirve para todos los modelos: es la misma funda, cambia el teléfono.
    expect(coloresSinFoto(prod([v('AZUL', null), v('AZUL', 'a.jpg')]))).toEqual([])
    expect(coloresSinFoto(prod([v('AZUL', null), v('ROJO', 'a.jpg')]))).toEqual(['AZUL'])
  })
})

describe('auditoría — las dos colas de trabajo', () => {
  it('si sobran fotos sin usar, el arreglo es de escritorio', () => {
    const p = prod([v('AZUL', null), v('ROJO', 'r.jpg')], [
      { id: '1', src: 'r.jpg' },
      { id: '2', src: 'azul.jpg' },
    ])
    expect(fotosLibresDe(p).map((f) => f.id)).toEqual(['2'])
    expect(estadoDe(p).cola).toBe('escritorio')
  })

  it('sin fotos libres hay que fotografiar: la pantalla no puede hacer nada', () => {
    // CORREA LARGA PARA CELULAR: tres colores compartiendo la única foto que existe.
    const p = prod([v('GRAY', 'u.jpg'), v('OFF WHITE', 'u.jpg'), v('PINK', 'u.jpg')], [{ id: '1', src: 'u.jpg' }])
    expect(fotosLibresDe(p)).toEqual([])
    expect(estadoDe(p).cola).toBe('fotografia')
  })

  it('si las fotos libres no alcanzan para todo lo roto, es mixto', () => {
    const p = prod([v('A', null), v('B', null), v('C', 'c.jpg')], [
      { id: '1', src: 'c.jpg' },
      { id: '2', src: 'libre.jpg' },
    ])
    expect(estadoDe(p).cola).toBe('mixto')
  })

  it('un producto sin NINGUNA foto está roto aunque no tenga colores', () => {
    // Es DISTRIC CASE GRAY: no es de color-en-variante, es un producto suelto sin fotos. Mirando
    // solo los colores quedaba invisible, y en la tienda se ve en blanco.
    const p = prod([], [])
    const e = estadoDe(p)
    expect(e.sinNingunaFoto).toBe(true)
    expect(e.hayProblema).toBe(true)
    expect(e.cola).toBe('fotografia')
  })

  it('con fotos cargadas ya no está en ese estado', () => {
    expect(estadoDe(prod([v('A', 'a.jpg')], [{ id: '1', src: 'a.jpg' }])).sinNingunaFoto).toBe(false)
  })

  it('sin nada roto no hay trabajo', () => {
    const p = prod([v('A', 'a.jpg'), v('B', 'b.jpg')], [
      { id: '1', src: 'a.jpg' },
      { id: '2', src: 'b.jpg' },
    ])
    const e = estadoDe(p)
    expect(e.hayProblema).toBe(false)
    expect(e.cola).toBe('sin-trabajo')
  })
})

/**
 * Se cuentan publicaciones, no productos: BORDER CASE son 3 variantes y el METALIZADO 63.
 * Contar productos los pone en la misma fila y hace que se les dedique el mismo esfuerzo.
 */
describe('auditoría — cuántas publicaciones salen mal', () => {
  it('de N colores con la misma foto, uno es el legítimo', () => {
    // 3 variantes repartidas en 3 colores: 2 están mal, 1 está bien. No se sabe cuál, pero
    // contar las 3 sería inflar el problema.
    const p = prod([v('A', 'x.jpg'), v('B', 'x.jpg'), v('C', 'x.jpg')])
    expect(estadoDe(p).variantesCruzadas).toBe(2)
  })

  it('cuenta variantes, no colores', () => {
    const p = prod([v('A', 'x.jpg'), v('A', 'x.jpg'), v('B', 'x.jpg'), v('B', 'x.jpg')])
    // 4 variantes, 2 colores → la mitad está mal.
    expect(estadoDe(p).variantesCruzadas).toBe(2)
  })

  it('las variantes sin foto se cuentan aparte', () => {
    const p = prod([v('A', null), v('A', null), v('B', 'b.jpg')])
    expect(estadoDe(p).variantesSinFoto).toBe(2)
    expect(estadoDe(p).variantesCruzadas).toBe(0)
  })
})

/**
 * Son dos trabajos distintos y el renglón los sumaba en un solo número: un color que **no está
 * fotografiado** puede necesitar sacarle la foto, y un modelo al que **no le pegaron** la foto de
 * su color se arregla en cinco segundos con una foto que ya existe.
 */
describe('auditoría — el color sin foto vs. el modelo al que no se la pegaron', () => {
  it('el color entero sin foto no cuenta como parcial', () => {
    const p = prod([v('A', null), v('A', null), v('B', 'b.jpg')], [{ id: '1', src: 'b.jpg' }])
    const e = estadoDe(p)
    expect(e.sinFoto).toEqual(['A'])
    expect(e.variantesParciales).toBe(0)
    expect(e.variantesSinFoto).toBe(2)
  })

  it('el modelo sin la foto de su color sí, y su color no figura como sin foto', () => {
    // AZUL tiene foto en un modelo y en el otro quedó sin pegar.
    const p = prod([v('AZUL', 'azul.jpg'), v('AZUL', null), v('ROJO', 'rojo.jpg')], [
      { id: '1', src: 'azul.jpg' },
      { id: '2', src: 'rojo.jpg' },
    ])
    const e = estadoDe(p)
    expect(e.sinFoto).toEqual([])
    expect(e.variantesParciales).toBe(1)
    expect(e.variantesSinFoto).toBe(1)
  })

  it('los dos casos a la vez se cuentan cada uno por su lado', () => {
    const p = prod([v('AZUL', 'azul.jpg'), v('AZUL', null), v('ROJO', null), v('ROJO', null)], [
      { id: '1', src: 'azul.jpg' },
    ])
    const e = estadoDe(p)
    expect(e.sinFoto).toEqual(['ROJO'])
    expect(e.variantesParciales).toBe(1)
    expect(e.variantesSinFoto).toBe(3)
  })
})

/**
 * La ficha es lo que se mira a ojo. Tiene que decir, por color, con quién comparte la foto:
 * es la única forma de saber a cuál de los tres colores le corresponde la funda negra.
 */
describe('auditoría — la ficha del producto', () => {
  it('cada color trae su foto, con quién la comparte y cuántos modelos cubre', () => {
    const p = prod([
      v('BLACK', 'negra.jpg'),
      v('BLACK', 'negra.jpg'),
      v('AZUL TITANIUM', 'negra.jpg'),
      v('SILVER', 'plata.jpg'),
      v('ROJO', null),
    ])
    const f = fichaDe(p)
    expect(f.map((x) => x.color)).toEqual(['AZUL TITANIUM', 'BLACK', 'ROJO', 'SILVER'])

    const black = f.find((x) => x.color === 'BLACK')!
    expect(black.variantes).toBe(2)
    expect(black.comparteCon).toEqual(['AZUL TITANIUM'])

    const silver = f.find((x) => x.color === 'SILVER')!
    expect(silver.comparteCon).toEqual([]) // su foto es solo suya

    const rojo = f.find((x) => x.color === 'ROJO')!
    expect(rojo.foto).toBe(null)
    expect(rojo.variantesSinFoto).toBe(1)
  })

  it('un color con foto en un modelo y sin foto en otro muestra la que tiene', () => {
    const f = fichaDe(prod([v('AZUL', null), v('AZUL', 'azul.jpg')]))
    expect(f[0].foto).toBe('azul.jpg')
    expect(f[0].variantesSinFoto).toBe(1)
  })

  /**
   * El segundo eje es el modelo de teléfono en BDI y el talle en Zattia. Cualquier palabra que
   * se elija va a estar mal en una de las dos marcas, así que se muestra el valor tal cual lo
   * tiene la tienda. Antes decía "1 modelo de teléfono" arriba de un pantalón.
   */
  it('nombra cada variante con su propio valor, sin inventar la palabra', () => {
    const fundas = fichaDe(
      prod([
        v('AZUL', 'a.jpg', { valores: ['iPhone 13', 'AZUL'] }),
        v('AZUL', null, { valores: ['iPhone 14', 'AZUL'] }),
      ]),
    )
    expect(fundas[0].etiquetas).toEqual(['iPhone 13', 'iPhone 14'])
    expect(fundas[0].etiquetasSinFoto).toEqual(['iPhone 14'])

    const ropa = fichaDe(
      prod([
        v('CHOCOLATE', 'c.jpg', { valores: ['M', 'CHOCOLATE'] }),
        v('CHOCOLATE', null, { valores: ['L', 'CHOCOLATE'] }),
      ]),
    )
    expect(ropa[0].etiquetas).toEqual(['M', 'L'])
    expect(ropa[0].etiquetasSinFoto).toEqual(['L'])
  })

  it('saca el color de la etiqueta sin importar mayúsculas ni espacios', () => {
    expect(etiquetaDe({ color: 'Negro', valores: [' negro ', 'XS'] })).toBe('XS')
    expect(etiquetaDe({ color: 'AZUL', valores: ['AZUL'] })).toBe('')
  })

  it('sin valores no rompe: la ficha queda sin etiquetas', () => {
    // Los cachés de payload anteriores al campo no lo traen; la pantalla cae a contar variantes.
    const f = fichaDe(prod([v('AZUL', 'a.jpg'), v('AZUL', null)]))
    expect(f[0].etiquetas).toEqual([])
    expect(f[0].variantes).toBe(2)
    expect(f[0].variantesSinFoto).toBe(1)
  })

  /**
   * Las unidades son lo que decide qué se fotografía primero: un color agotado y uno con 1.200
   * unidades se veían exactamente igual. Salen de Gestión Nube, nunca del stock de TiendaNube,
   * que es de un solo depósito y distinto por marca.
   */
  it('trae las unidades por color y por variante cuando se le pasa el índice', () => {
    const idx = indexarStockGn([
      { sku: 'A13', barcode: '', stock: 34 } as never,
      { sku: 'A14', barcode: '', stock: 12 } as never,
      { sku: 'R13', barcode: '', stock: 5 } as never,
    ])
    const p = prod([
      v('AZUL', 'azul.jpg', { sku: 'A13', valores: ['iPhone 13', 'AZUL'] }),
      v('AZUL', null, { sku: 'A14', valores: ['iPhone 14', 'AZUL'] }),
      v('ROJO', null, { sku: 'R13', valores: ['iPhone 13', 'ROJO'] }),
    ])
    const f = fichaDe(p, idx)
    const azul = f.find((x) => x.color === 'AZUL')!
    expect(azul.unidades).toBe(46) // 34 + 12
    expect(azul.unidadesSinFoto).toBe(12) // solo la que no tiene foto
    expect(azul.porEtiqueta?.get('iPhone 14')).toBe(12)
    expect(f.find((x) => x.color === 'ROJO')!.unidadesSinFoto).toBe(5)
  })

  it('sin índice la ficha sale igual que siempre, sin unidades', () => {
    const f = fichaDe(prod([v('AZUL', 'a.jpg', { sku: 'A13' })]))
    expect(f[0].unidades).toBeUndefined()
    expect(f[0].porEtiqueta).toBeUndefined()
  })

  it('un color que no cruza queda sin dato, no en cero', () => {
    // Un cero se leería como "no hay stock" y haría descartar algo que sí hay que fotografiar.
    const idx = indexarStockGn([{ sku: 'OTRO', barcode: '', stock: 9 } as never])
    const f = fichaDe(prod([v('AZUL', null, { sku: 'NO-ESTA' })]), idx)
    expect(f[0].unidades).toBeUndefined()
    expect(f[0].unidadesSinFoto).toBeUndefined()
  })

  it('lleva la sospecha del nombre de archivo al renglón del color', () => {
    const f = fichaDe(prod([v('AZUL', 'mag-shadow-black.jpg'), v('ROJO', 'rojo.jpg')]))
    expect(f.find((x) => x.color === 'AZUL')!.sospecha?.familiaArchivo).toBe('negro')
    expect(f.find((x) => x.color === 'ROJO')!.sospecha).toBe(null)
  })
})

/**
 * El chequeo por nombre de archivo es una PISTA, no un hecho. Los falsos positivos por idioma
 * (`PINK`→`rosa.jpg`) son los que hacen que la gente deje de mirar la lista: si marca media
 * tienda, no marca nada.
 */
describe('auditoría — nombre de archivo vs color', () => {
  it('el mismo color en otro idioma no es sospecha', () => {
    expect(sospechasDe(prod([v('PINK', 'funda-rosa-ab12cd34.jpg')]))).toEqual([])
    expect(sospechasDe(prod([v('BLACK', 'case-negro.jpg')]))).toEqual([])
    expect(sospechasDe(prod([v('SILVER', 'x-plata.jpg')]))).toEqual([])
    expect(sospechasDe(prod([v('CHOCOLATE', 'y-marron.jpg')]))).toEqual([])
    expect(sospechasDe(prod([v('GRIS', 'z-silver.jpg')]))).toEqual([])
  })

  it('marca cuando el archivo dice otro color', () => {
    const s = sospechasDe(prod([v('AZUL', 'mag-case-shadow-black-9a3af905.jpg')]))
    expect(s).toHaveLength(1)
    expect(s[0].familiaColor).toBe('azul')
    expect(s[0].familiaArchivo).toBe('negro')
  })

  it('un archivo que no nombra ningún color no dice nada', () => {
    expect(sospechasDe(prod([v('AZUL', 'IMG_20240612_0031.jpg')]))).toEqual([])
  })

  it('un color que no se reconoce tampoco', () => {
    expect(sospechasDe(prod([v('TITANIUM', 'foto-negra.jpg')]))).toEqual([])
  })

  it('el nombre de archivo sale limpio de hash y extensión', () => {
    expect(nombreArchivo('https://x.com/a/b/border-negra-9a3af905.jpg?v=1')).toBe('border-negra')
  })

  it('lee las familias de color de un texto libre', () => {
    expect([...familiasEn('AZUL TITANIUM')]).toEqual(['azul'])
    expect(familiasEn('sin color aca').size).toBe(0)
  })
})

/**
 * La huella es lo que hace que el "Verificado" caduque solo. Si no cambia cuando alguien toca
 * las fotos, un verificado viejo tapa un error nuevo — que es peor que no auditar, porque da
 * confianza falsa.
 */
describe('auditoría — huella del estado revisado', () => {
  const base = prod([v('A', 'a.jpg'), v('B', 'b.jpg')], [
    { id: '1', src: 'a.jpg' },
    { id: '2', src: 'b.jpg' },
  ])

  it('el mismo estado da la misma huella', () => {
    expect(huellaDe(base)).toBe(huellaDe(base))
  })

  it('no depende del orden en que TN devuelva las variantes ni las fotos', () => {
    const revuelto = prod([v('B', 'b.jpg'), v('A', 'a.jpg')], [
      { id: '2', src: 'b.jpg' },
      { id: '1', src: 'a.jpg' },
    ])
    expect(huellaDe(revuelto)).toBe(huellaDe(base))
  })

  it('cambia si se revincula una foto', () => {
    const cambiado = prod([v('A', 'b.jpg'), v('B', 'b.jpg')], [
      { id: '1', src: 'a.jpg' },
      { id: '2', src: 'b.jpg' },
    ])
    expect(huellaDe(cambiado)).not.toBe(huellaDe(base))
  })

  it('cambia si se sube una foto nueva aunque no se vincule', () => {
    // Subir sin vincular no toca el mapa color→foto, pero sí cambia lo que hay para revisar.
    const conFotoNueva = prod([v('A', 'a.jpg'), v('B', 'b.jpg')], [
      { id: '1', src: 'a.jpg' },
      { id: '2', src: 'b.jpg' },
      { id: '3', src: 'c.jpg' },
    ])
    expect(huellaDe(conFotoNueva)).not.toBe(huellaDe(base))
  })

  it('cambia si se le quita la foto a un color', () => {
    const sinFoto = prod([v('A', null), v('B', 'b.jpg')], [
      { id: '1', src: 'a.jpg' },
      { id: '2', src: 'b.jpg' },
    ])
    expect(huellaDe(sinFoto)).not.toBe(huellaDe(base))
  })
})
