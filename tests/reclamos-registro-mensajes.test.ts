import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  apilarMensaje, esMomentoDelMensaje, LARGO_MAXIMO_MENSAJE, MOMENTOS_DEL_MENSAJE,
  SEGUNDOS_DEL_REPETIDO,
} from '@/lib/reclamos/mensajes.core.js'

/**
 * **Qué se le dijo al cliente: la regla, y el cable a los botones que la mandan** (D9 de la
 * auditoría del 28-ago-2026).
 *
 * 🔴 La columna `mensajes` existía desde el día uno, estaba en el `select` del handler, y ⛔ **no la
 * escribía nadie**: R-0022 la traía `[]` después del link, la propuesta y la resolución. De la
 * resolución —donde se promete la plata— ⛔ no quedaba rastro.
 */

const AHORA = '2026-08-29T12:00:00.000Z'
const masTarde = (segundos: number) => new Date(Date.parse(AHORA) + segundos * 1000).toISOString()

describe('apilarMensaje', () => {
  it('apila el mensaje con su momento, su fecha, quién y el texto', () => {
    const r = apilarMensaje([], { tipo: 'resolucion', texto: 'Te devolvemos $13.491.', usuario: 'Lorena', at: AHORA })
    expect(r.mensajes).toEqual([{ tipo: 'resolucion', at: AHORA, por: 'Lorena', texto: 'Te devolvemos $13.491.' }])
  })

  it('los apila en orden, sin pisar los que ya estaban', () => {
    const uno = apilarMensaje([], { tipo: 'pedir_fotos', texto: 'Mandanos fotos.', at: AHORA }).mensajes
    const dos = apilarMensaje(uno, { tipo: 'resolucion', texto: 'Te devolvemos todo.', at: masTarde(3600) }).mensajes
    expect(dos?.map((m) => m.tipo)).toEqual(['pedir_fotos', 'resolucion'])
  })

  /** Una fila que nunca tuvo un mensaje trae `null`, ⛔ no `[]`. */
  it('arranca bien desde una columna vacía o nula', () => {
    expect(apilarMensaje(null, { tipo: 'propuesta', texto: '¿Te lo querés quedar?', at: AHORA }).mensajes).toHaveLength(1)
  })

  /**
   * 🔑 **La lista es cerrada y la valida el servidor.** Un `tipo` libre convierte esta columna en un
   * campo de texto: dos pantallas escribiendo `resolucion` y `resolución` son dos historias
   * distintas del mismo reclamo.
   */
  it('🔴 un momento que ⛔ no existe se rechaza, ⛔ no se guarda como viene', () => {
    const r = apilarMensaje([], { tipo: 'resolución', texto: 'algo', at: AHORA })
    expect(r.error).toBeTruthy()
    expect(r.mensajes).toBeUndefined()
  })

  /**
   * 🔴 **Un registro sin texto es peor que ninguno**: dice «se le mandó la resolución» sin poder
   * contestar qué decía, que es lo único que este registro existe para contestar.
   */
  it('🔴 sin texto ⛔ no se registra nada', () => {
    expect(apilarMensaje([], { tipo: 'resolucion', texto: '   ', at: AHORA }).error).toBeTruthy()
    expect(apilarMensaje([], { tipo: 'resolucion', texto: undefined, at: AHORA }).error).toBeTruthy()
  })

  it('el texto se guarda sin los espacios de los bordes, y con los saltos de adentro', () => {
    const r = apilarMensaje([], { tipo: 'etiqueta', texto: '\n Hola\n\nAcá va.\n ', at: AHORA })
    expect(r.mensajes?.[0].texto).toBe('Hola\n\nAcá va.')
  })

  /**
   * 🔑 **Se rechaza, ⛔ no se recorta**: un registro recortado dice que se le dijo **menos** de lo
   * que se le dijo, y de eso no se vuelve.
   */
  it('🔴 un texto que pasa el tope se rechaza entero, ⛔ no se recorta', () => {
    const largo = 'x'.repeat(LARGO_MAXIMO_MENSAJE + 1)
    const r = apilarMensaje([], { tipo: 'resolucion', texto: largo, at: AHORA })
    expect(r.error).toBeTruthy()
    expect(r.mensajes).toBeUndefined()
    // Y el de justo abajo del tope sí entra: el freno es el tope, ⛔ no «los textos largos».
    expect(apilarMensaje([], { tipo: 'resolucion', texto: 'x'.repeat(LARGO_MAXIMO_MENSAJE), at: AHORA }).mensajes).toHaveLength(1)
  })

  /**
   * ⚠️ El tope es holgura y ⛔ no un límite de negocio: medido sobre los 31 mensajes que arma hoy el
   * módulo, el más largo son 436 bytes. Si esto se pone en rojo es que alguien lo bajó de más.
   */
  it('el tope le queda MUY holgado al mensaje más largo que arma el módulo (436)', () => {
    expect(LARGO_MAXIMO_MENSAJE).toBeGreaterThan(436 * 4)
  })

  describe('el doble click', () => {
    const yaEsta = apilarMensaje([], { tipo: 'resolucion', texto: 'Te devolvemos todo.', at: AHORA }).mensajes

    it('🔴 el mismo texto del mismo momento, pegado, ⛔ NO se apila de nuevo', () => {
      const r = apilarMensaje(yaEsta, { tipo: 'resolucion', texto: 'Te devolvemos todo.', at: masTarde(2) })
      expect(r.repetido).toBe(true)
      expect(r.mensajes).toBeUndefined()
      // ⛔ Y no es un error: para el que apretó, el mensaje se copió igual.
      expect(r.error).toBeUndefined()
    })

    /** Volver a contarle lo mismo más tarde **es un hecho** y tiene que quedar. */
    it('pasada la ventana, el mismo mensaje SÍ se vuelve a apilar', () => {
      const r = apilarMensaje(yaEsta, { tipo: 'resolucion', texto: 'Te devolvemos todo.', at: masTarde(SEGUNDOS_DEL_REPETIDO + 1) })
      expect(r.mensajes).toHaveLength(2)
    })

    it('el mismo momento con OTRO texto se apila, aunque sea al toque', () => {
      const r = apilarMensaje(yaEsta, { tipo: 'resolucion', texto: 'Te devolvemos la mitad.', at: masTarde(2) })
      expect(r.mensajes).toHaveLength(2)
    })

    it('otro momento con el mismo texto también', () => {
      const r = apilarMensaje(yaEsta, { tipo: 'propuesta', texto: 'Te devolvemos todo.', at: masTarde(2) })
      expect(r.mensajes).toHaveLength(2)
    })

    /**
     * ⚠️ Mira **el último**, ⛔ no la lista entera: lo que se tapa es la mano temblando sobre el
     * botón, ⛔ no que el mismo mensaje aparezca dos veces en la vida del reclamo.
     */
    it('el mismo texto que está más atrás en la lista ⛔ no lo frena', () => {
      const conOtroEnElMedio = apilarMensaje(yaEsta, { tipo: 'etiqueta', texto: 'Ahí va la etiqueta.', at: masTarde(1) }).mensajes
      const r = apilarMensaje(conOtroEnElMedio, { tipo: 'resolucion', texto: 'Te devolvemos todo.', at: masTarde(2) })
      expect(r.mensajes).toHaveLength(3)
    })
  })
})

/**
 * **El CABLE: los momentos que mandan las pantallas ⊆ los que acepta el servidor.**
 *
 * 🔑 Sin esto, un `tipo` mal tipeado en el JSX contesta 400 en producción y el mensaje se copia
 * igual —o sea, **el registro se pierde callado**, que es exactamente el defecto que se está
 * arreglando. Es la misma forma del cable de `ACCIONES_DE_LA_BANDEJA` (`retornos.test.ts`), que
 * nació de un 403 por la misma clase de lista escrita a mano al lado de una pantalla que crece.
 */
describe('el cable con las pantallas', () => {
  const fuente = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
  const PANTALLAS = ['../components/reclamos/Reclamos.tsx', '../components/reclamos/ArmarCambio.tsx']

  const tiposQueManda = (p: string) =>
    [...fuente(p).matchAll(/<BotonMensaje[\s\S]*?tipo="([a-z_]+)"/g)].map((m) => m[1])

  it('cada `tipo` que manda una pantalla está en la lista cerrada del servidor', () => {
    const todos = PANTALLAS.flatMap(tiposQueManda)
    expect(todos.length).toBeGreaterThanOrEqual(9) // que la extracción no se haya quedado vacía
    expect(todos.filter((t) => !esMomentoDelMensaje(t))).toEqual([])
  })

  /**
   * 🔴 **La mitad negativa, y la que importa**: el defecto no vuelve por un `tipo` mal escrito —eso
   * lo caza el test de arriba— sino por **un botón de mensaje nuevo puesto con `CopyButton` a
   * secas**, que copia perfecto y ⛔ no registra nada. En verde, y callado.
   */
  it('🔴 ⛔ ningún mensaje al cliente sale por un `CopyButton` pelado', () => {
    for (const p of PANTALLAS) {
      const pelados = [...fuente(p).matchAll(/<CopyButton[\s\S]{0,400}?\/>/g)].map((m) => m[0])
      expect(pelados.filter((b) => /Msj:/.test(b))).toEqual([])
    }
  })

  /**
   * Los momentos de la fila (`MensajeDeLaFila`) tienen que estar todos entre los del núcleo.
   *
   * ⚠️ **Lleva un PISO y ⛔ no un número exacto**, por las dos razones: la lista crece —cada momento
   * mudo que se tapa suma uno— y sin piso el barrido podría dejar de matchear y el test daría verde
   * mirando **cero**, que es exactamente lo que contesta una regla rota. Mismo criterio que
   * `tests/contrato-verbos.test.ts`.
   */
  it('los momentos de `botones.ts` son un subconjunto de los del núcleo', () => {
    const union = fuente('../lib/reclamos/botones.ts').split('export type MensajeDeLaFila =')[1].split('export const')[0]
    const deLaFila = [...union.matchAll(/\|\s*'([a-z_]+)'/g)].map((m) => m[1])
    expect(deLaFila.length).toBeGreaterThanOrEqual(8)
    expect(deLaFila.filter((t) => !MOMENTOS_DEL_MENSAJE.includes(t))).toEqual([])
  })
})
