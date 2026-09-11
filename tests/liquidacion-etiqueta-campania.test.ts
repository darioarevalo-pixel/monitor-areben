/**
 * EL DISEÑO DE LA ETIQUETA DE UNA CAMPAÑA — lo que se guarda y termina dibujado en la prenda.
 *
 * 🔴 **Es una lista blanca y por eso hay test.** Lo que salga de acá se dibuja en un PDF y sale por
 * la Zebra: un `tam` que no existe, treinta renglones o un texto de dos mil caracteres ⛔ no rompen
 * ninguna pantalla — se ven cuando ya salieron doscientas etiquetas mal.
 *
 * Y el otro error, el opuesto: que una campaña **vieja**, sin nada guardado, deje de dibujar la
 * etiqueta que dibujaba siempre.
 */
import { describe, it, expect } from 'vitest'
import {
  etiquetaDeCampania, etiquetaPersonalizada, MAX_LINEAS_ABAJO, MAX_TEXTO_LINEA, TAM_PRECIO_DEFAULT, TAM_PRECIO_MAX, TAM_PRECIO_MIN,
} from '../lib/liquidacion/etiqueta.core.js'

describe('etiquetaDeCampania', () => {
  it('una campaña sin diseño dibuja lo de siempre', () => {
    // 🔴 El caso que ⛔ no puede fallar: las campañas que ya existen no tienen el campo, y tienen
    // que seguir sacando la etiqueta que sacaban antes de que esto existiera.
    for (const vacio of [undefined, null, {}]) {
      expect(etiquetaDeCampania(vacio)).toEqual({ abajo: [], tamPrecio: TAM_PRECIO_DEFAULT, tamTitulo: 'titulo' })
      expect(etiquetaPersonalizada(vacio)).toBe(false)
    }
  })

  it('normaliza cada renglón y tira los vacíos', () => {
    const e = etiquetaDeCampania({
      abajo: [
        { texto: '  EFECTIVO · TRANSFERENCIA  ', tam: 'chico', bold: true },
        { texto: '   ', tam: 'normal', bold: false },
        { texto: 'SIN CAMBIO', tam: 'inventado', bold: 'sí' },
      ],
    })
    expect(e.abajo).toEqual([
      { texto: 'EFECTIVO · TRANSFERENCIA', tam: 'chico', bold: true },
      // Un `tam` que el PDF no sabe dibujar cae a 'chico', que es el que no se come la etiqueta.
      { texto: 'SIN CAMBIO', tam: 'chico', bold: true },
    ])
  })

  it('corta los renglones de más y el texto largo', () => {
    const e = etiquetaDeCampania({
      abajo: Array.from({ length: 10 }, (_, i) => ({ texto: `renglon ${i}`.padEnd(80, 'x'), tam: 'chico', bold: false })),
    })
    expect(e.abajo).toHaveLength(MAX_LINEAS_ABAJO)
    for (const l of e.abajo) expect(l.texto.length).toBeLessThanOrEqual(MAX_TEXTO_LINEA)
  })

  it('acota el tamaño del precio a algo dibujable', () => {
    expect(etiquetaDeCampania({ tamPrecio: 22 }).tamPrecio).toBe(22)
    expect(etiquetaDeCampania({ tamPrecio: 999 }).tamPrecio).toBe(TAM_PRECIO_MAX)
    expect(etiquetaDeCampania({ tamPrecio: 1 }).tamPrecio).toBe(TAM_PRECIO_MIN)
    // 🔑 Lo que no es un número no es «cero»: es «no lo tocaron».
    for (const basura of [0, -5, 'grande', null, undefined, NaN]) {
      expect(etiquetaDeCampania({ tamPrecio: basura }).tamPrecio).toBe(TAM_PRECIO_DEFAULT)
    }
  })

  it('aguanta un `abajo` que no es una lista', () => {
    for (const basura of ['EFECTIVO', 42, { texto: 'x' }]) {
      expect(etiquetaDeCampania({ abajo: basura }).abajo).toEqual([])
    }
  })

  it('«personalizada» distingue el diseño tocado del que no', () => {
    expect(etiquetaPersonalizada({ abajo: [{ texto: 'EFECTIVO', tam: 'chico', bold: false }] })).toBe(true)
    expect(etiquetaPersonalizada({ tamPrecio: 22 })).toBe(true)
    expect(etiquetaPersonalizada({ tamTitulo: 'normal' })).toBe(true)
    // Escribir el default no es personalizar: un renglón vacío se descarta y el resto queda igual.
    expect(etiquetaPersonalizada({ abajo: [{ texto: '  ', tam: 'chico', bold: false }], tamPrecio: TAM_PRECIO_DEFAULT })).toBe(false)
  })
})
