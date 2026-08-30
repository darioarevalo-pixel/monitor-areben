import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { camposAlContestarLaOferta } from '@/lib/reclamos/casos.core.js'

/**
 * **Qué se escribe cuando el cliente CONTESTA la oferta de que se lo quede** (28-ago-2026).
 *
 * Bruno: *«el local toca "Aceptó" y el sistema cierra la rama»*. Hasta hoy la respuesta sólo se
 * podía anotar reabriendo **Decidir**, que es de Administración: el que escucha al cliente ⛔ no la
 * podía registrar.
 *
 * 🔑 **Y eso ⛔ no es "el local decidiendo plata".** Cuando la oferta salió, Administración ya
 * decidió las dos ramas —el monto, la forma, y la salida «por si dice que no», que es la resolución
 * guardada—. Lo único que agrega el cliente es **cuál de las dos pasó**.
 *
 * ⚠️ Los tests miran **el objeto entero de campos**, ⛔ no `toContain`: la mitad que importa es que
 * `rechazo` ⛔ no toque nada más, y eso sólo se afirma comparando la lista completa.
 */

/**
 * ⚠️ **La fixture lleva `compensacionGuardada` puesta**, y ⛔ no es relleno: es el caso normal —la
 * oferta salió **después** de que Administración decidiera las dos ramas—. El caso sin decisión
 * (D4) es el de abajo, y tiene su propio bloque.
 */
const oferta = {
  motivo: 'no_esperaba', escenario: null,
  monto: 13491, forma: 'plata', diferencia: null,
  compensacionGuardada: 'plata_total',
}

describe('camposAlContestarLaOferta', () => {
  /**
   * 🔴 **Las dos respuestas ⛔ no son simétricas.** Lo decidido ya era la salida «si dice que no»:
   * pisarlo al rechazar sería rehacer una decisión que nadie rehizo, y volvería a poner en
   * `pendiente` la plata que capaz ya salió.
   */
  it('rechazo con decisión guardada: escribe SÓLO la respuesta y ⛔ nada más', () => {
    const r = camposAlContestarLaOferta({ ...oferta, respuesta: 'rechazo' })
    expect(r.error).toBeUndefined()
    expect(r.campos).toEqual({ retencion_respuesta: 'rechazo' })
    // La nota sale del núcleo: el handler ⛔ no la vuelve a escribir.
    expect(r.nota).toBe('el cliente NO aceptó quedárselo: sigue lo que estaba decidido')
  })

  /**
   * ⚠️ **La nota de aceptar también sale del núcleo, y dice la FORMA.** Es lo único que queda
   * escrito de si lo que se le dio fue plata o un cupón — y son dos cosas distintas: una sale de
   * la caja y la otra ⛔ no. Sin este test, un mutante que las intercambia sobrevive.
   */
  it('acepto: la nota dice el monto y la forma', () => {
    expect(camposAlContestarLaOferta({ ...oferta, respuesta: 'acepto' }).nota)
      .toBe('el cliente ACEPTÓ quedárselo por 13491 (plata)')
    expect(camposAlContestarLaOferta({ ...oferta, forma: 'cupon', respuesta: 'acepto' }).nota)
      .toBe('el cliente ACEPTÓ quedárselo por 13491 (cupón)')
  })

  /**
   * 🔑 **Aceptar cierra la rama entera**: resolución, monto, destino, el retorno apagado, el estado
   * y los pendientes. Y las tres derivaciones salen del núcleo —`salidaAlAceptarRetencion`,
   * `destinoDe`, `pendientesDe`—, ⛔ no se reescriben acá.
   */
  it('acepto en plata: plata_parcial, el monto de la oferta y el retorno apagado', () => {
    const r = camposAlContestarLaOferta({ ...oferta, respuesta: 'acepto' })
    expect(r.campos).toEqual({
      retencion_respuesta: 'acepto',
      compensacion: 'plata_parcial',
      monto_total: 13491,
      monto_acordado: 13491,
      retorno_decidido: false,
      via_retorno: null,
      // 🔑 La unidad está SANA y no vuelve ⇒ `regalada`, ⛔ no `falla`. Antes de la partición del
      // 26-ago-2026 el único camino para sacarla del stock era llamarla fallada.
      destino_prenda: 'regalada',
      estado: 'resuelto',
      // Sin `items` no hay unidad que valuar: el costo es la plata que sale, y nada más.
      costo_caso: 13491,
      reintegro_estado: 'pendiente',
      stock_estado: 'pendiente',
      reingreso_estado: 'no_aplica',
      cobro_estado: 'no_aplica',
      envio_nuevo_estado: 'no_aplica',
      cupon_estado: 'no_aplica',
    })
  })

  /**
   * 🔴 **La forma decide en qué TERMINA el reclamo, y por eso ⛔ no es cosmética.** Con cupón no
   * sale plata de la caja hoy —`reintegro_estado` en `no_aplica`— y queda el pendiente de
   * **crearlo en la tienda**. Hasta el 27-ago-2026 aceptar caía siempre en `plata_parcial`: sacaba
   * de la caja una plata que nunca salió y cerraba el reclamo sin que el cupón existiera.
   */
  it('acepto en cupón: cupon, sin monto acordado y con el pendiente de emitirlo', () => {
    const r = camposAlContestarLaOferta({ ...oferta, forma: 'cupon', respuesta: 'acepto' })
    expect(r.campos?.compensacion).toBe('cupon')
    expect(r.campos?.cupon_estado).toBe('pendiente')
    expect(r.campos?.reintegro_estado).toBe('no_aplica')
    // ⚠️ Sin plata acordada: no hay nada que salga de la caja. Un número acá haría que la cuenta
    // de lo que costó el caso sumara plata que nunca se pagó.
    expect(r.campos?.monto_acordado).toBeNull()
    // Y el monto del reclamo sigue siendo el de la oferta: es lo que efectivamente se le da.
    expect(r.campos?.monto_total).toBe(13491)
  })

  /**
   * 🔴 **`costo_caso` se RECALCULA acá** (28-ago-2026). Antes ⛔ no se tocaba y quedaba el de la
   * decisión vieja: R-0022 mostraba *«Se le devuelve $13.491»* al lado de *«Lo que nos costó
   * $20.682»*, con $6.500 de un envío de vuelta que aceptar acababa de apagar. La retención existe
   * para **abaratar** el caso: si funciona y el número no baja, ⛔ nunca se puede leer si valió la
   * pena — y como el error va siempre para arriba, la retención parece más cara de lo que es.
   */
  describe('lo que nos costó, recalculado', () => {
    const items = [{ costo: 3000, cantidad: 2 }]

    it('la plata que sale MÁS la unidad que el cliente se queda, valuada a costo', () => {
      const r = camposAlContestarLaOferta({ ...oferta, items, respuesta: 'acepto' })
      expect(r.campos?.destino_prenda).toBe('regalada')
      expect(r.campos?.costo_caso).toBe(13491 + 6000)
    })

    /**
     * 🔑 **La mitad que muerde: ⛔ NO arrastra los envíos de la decisión vieja.** Aceptar apaga el
     * retorno, así que el envío de vuelta que la cuenta había previsto **ya no se paga**, y la
     * salida es plata o cupón, ⛔ nunca `otra_unidad`: tampoco sale ningún paquete. El número
     * viejo de R-0022 llevaba adentro $6.500 de un envío que no iba a existir.
     */
    it('⛔ no le suma NINGÚN envío: aceptar apaga el retorno y ⛔ no manda nada', () => {
      const r = camposAlContestarLaOferta({ ...oferta, items, respuesta: 'acepto' })
      expect(r.campos?.retorno_decidido).toBe(false)
      // Con envíos adentro el número daría más que esto. Es el control de que no entra ninguno.
      expect(r.campos?.costo_caso).toBe(19491)
    })

    /**
     * ⚠️ **Con cupón hoy no sale plata de la caja**, así que lo único que costó es la unidad. Es la
     * misma regla por la que `monto_acordado` queda en `null`, ⛔ no una nueva — cuánto vale un
     * cupón frente al reembolso sigue siendo **B6**, sin contestar.
     */
    it('en cupón cuesta SÓLO la unidad: no sale plata de la caja', () => {
      const r = camposAlContestarLaOferta({ ...oferta, items, forma: 'cupon', respuesta: 'acepto' })
      expect(r.campos?.costo_caso).toBe(6000)
      expect(r.campos?.monto_total).toBe(13491)
    })

    /**
     * 🔑 **La unidad fallada que se queda también se pierde.** El destino cambia (`falla`, ⛔ no
     * `regalada`) pero el costo es el mismo: se fue por la puerta igual.
     */
    it('en una falla que se queda, la unidad también cuesta', () => {
      const r = camposAlContestarLaOferta({ ...oferta, items, motivo: 'falla', escenario: 'util', respuesta: 'acepto' })
      expect(r.campos?.destino_prenda).toBe('falla')
      expect(r.campos?.costo_caso).toBe(19491)
    })

    /** ⛔ Rechazar ⛔ no toca nada: el costo del caso sigue siendo el de la resolución guardada. */
    it('rechazar ⛔ no lo toca', () => {
      const r = camposAlContestarLaOferta({ ...oferta, items, respuesta: 'rechazo' })
      expect(r.campos).toEqual({ retencion_respuesta: 'rechazo' })
    })
  })

  /**
   * 🔴 **D4 · «No aceptó» sobre un reclamo SIN decidir** (30-ago-2026).
   *
   * `liberar-decision` borra `compensacion` y **deja la oferta en pie a propósito**, así que la
   * fila con una oferta viva y ⛔ ninguna rama guardada existe: así quedó R-0022 el 27-ago. La
   * premisa que este archivo tenía escrita —*«lo decidido ya era la salida si dice que no»*— es
   * falsa justo ahí, y el rechazo dejaba la fila **muda**: apagaba el aviso de la oferta y ⛔ no
   * encendía nada.
   *
   * 🔑 **B1, contestada por Bruno el 30-ago: se parte en dos** — armar la oferta exige la decisión
   * (lo exige `decidir`, que pide `compensacion` antes de llegar acá), **contestarla siempre se
   * puede**, porque un «no aceptó» es un hecho que ya pasó en el mundo.
   */
  describe('D4 · el rechazo sobre un reclamo sin decisión', () => {
    const sinDecidir = { ...oferta, compensacionGuardada: null }

    /**
     * 🔑 **Contestar ⛔ NO se frena.** Frenarlo ⛔ no deshace lo que el cliente dijo: lo deja sin
     * registrar, que es el agujero que `retencion_respuesta` vino a tapar
     * ⇒ [[feedback_areben_freno_sin_valvula]].
     */
    it('la respuesta se registra igual: ⛔ no hay freno', () => {
      const r = camposAlContestarLaOferta({ ...sinDecidir, respuesta: 'rechazo' })
      expect(r.error).toBeUndefined()
      expect(r.campos?.retencion_respuesta).toBe('rechazo')
    })

    /**
     * 🔑 **`estado: 'en_revision'` ⛔ no es un cambio de estado —ya estaba ahí— es el SELLO del
     * instante**: el handler apila el evento con ese estado, y `desdeQueEsta(fila, 'en_revision')`
     * es lo que después hace arrancar el reloj **en el rechazo** y ⛔ no en el último toque.
     * ⛔ Sin migración: la fecha vive en el `historial`.
     */
    it('sella el momento en el historial volviendo a escribir en_revision', () => {
      const r = camposAlContestarLaOferta({ ...sinDecidir, respuesta: 'rechazo' })
      expect(r.campos).toEqual({ retencion_respuesta: 'rechazo', estado: 'en_revision' })
    })

    /**
     * 🔴 **La nota del historial era la premisa falsa, palabra por palabra.** Es lo único que
     * queda escrito de lo que pasó, así que afirmar «sigue lo que estaba decidido» sobre una fila
     * sin decisión es lo que mantuvo el caso mudo.
     */
    it('la nota ⛔ no afirma que siga nada decidido', () => {
      const r = camposAlContestarLaOferta({ ...sinDecidir, respuesta: 'rechazo' })
      expect(r.nota).not.toMatch(/estaba decidido/)
      expect(r.nota).toMatch(/hay que decidir/)
    })

    /**
     * ⚠️ **Aceptar ⛔ no necesita decisión previa y por eso ⛔ no cambia**: la rama que se acepta
     * **trae su propia resolución** (`salidaAlAceptarRetencion`), así que ahí no hay premisa que
     * se caiga. Sin este test, el arreglo podría haber tocado las dos ramas por igual.
     */
    it('aceptar sin decisión previa sigue cerrando la rama entera', () => {
      const r = camposAlContestarLaOferta({ ...sinDecidir, respuesta: 'acepto' })
      expect(r.campos?.compensacion).toBe('plata_parcial')
      expect(r.campos?.estado).toBe('resuelto')
    })

    /**
     * 🔴 🔑 **El parámetro es OBLIGATORIO aunque valga `null`**, igual que el escenario: un
     * llamador que ⛔ no lee `compensacion` tiene que **enterarse de que le falta el dato**, ⛔ no
     * recibir el default seguro. `null` es una respuesta —«no hay decisión»—; `undefined` es que
     * nadie preguntó.
     */
    it('sin el dato ⛔ no contesta: el llamador se entera', () => {
      const { compensacionGuardada: _, ...sinElDato } = oferta
      const r = camposAlContestarLaOferta({ ...sinElDato, respuesta: 'rechazo' } as never)
      expect(r.campos).toBeUndefined()
      expect(r.error).toMatch(/decisión guardada/)
    })
  })

  /** 🔑 En la falla el destino es `falla` aunque se la quede: quedársela ⛔ no la vuelve sana. */
  it('en una falla, la unidad que se queda sigue siendo una falla', () => {
    const r = camposAlContestarLaOferta({ ...oferta, motivo: 'falla', escenario: 'util', respuesta: 'acepto' })
    expect(r.campos?.destino_prenda).toBe('falla')
  })

  describe('lo que NO deja pasar', () => {
    it('una respuesta que no es ninguna de las dos', () => {
      expect(camposAlContestarLaOferta({ ...oferta, respuesta: 'quizas' }).error).toMatch(/acepto/)
      expect(camposAlContestarLaOferta({ ...oferta, respuesta: '' }).campos).toBeUndefined()
    })

    /**
     * ⚠️ **Sin monto ⛔ no hay oferta que contestar.** Es la misma pregunta que
     * `ofertaEsperandoRespuesta`: una respuesta sobre una oferta que nunca se registró es la media
     * oferta que hace mentir la cuenta de cuántas veces funciona, por la otra punta.
     */
    it('una respuesta sobre una oferta que no existe', () => {
      expect(camposAlContestarLaOferta({ ...oferta, monto: null, respuesta: 'acepto' }).error).toMatch(/oferta/)
      expect(camposAlContestarLaOferta({ ...oferta, monto: 0, respuesta: 'rechazo' }).error).toMatch(/oferta/)
    })

    /**
     * 🔑 **Un caso donde no corresponde ofrecer nada.** En una demora o en un faltante no hay
     * producto que quedarse: `ofreceRetencion` lo dice, y el guard vive acá para que ⛔ no dependa
     * de que la pantalla haya escondido el botón.
     */
    it('un caso donde no se ofrece quedárselo', () => {
      expect(camposAlContestarLaOferta({ ...oferta, motivo: 'demora', escenario: 'transporte', respuesta: 'acepto' }).error).toMatch(/no corresponde/)
      expect(camposAlContestarLaOferta({ ...oferta, motivo: 'faltante', escenario: null, respuesta: 'acepto' }).error).toMatch(/no corresponde/)
    })

    /**
     * 🔴 **Una cancelación tampoco**: es el escenario de `arrepentimiento` en que el pedido no
     * salió, así que no hay nada en poder del cliente. El escenario es lo que lo dice — el motivo
     * solo contestaría que sí.
     */
    it('un arrepentimiento que es una cancelación: el ESCENARIO lo apaga', () => {
      expect(camposAlContestarLaOferta({ ...oferta, motivo: 'arrepentimiento', escenario: 'ya_salio', respuesta: 'acepto' }).campos).toBeDefined()
      expect(camposAlContestarLaOferta({ ...oferta, motivo: 'arrepentimiento', escenario: 'se_puede_frenar', respuesta: 'acepto' }).error).toMatch(/no corresponde/)
    })
  })
})

/**
 * 🔴 **El cable: lo que el núcleo LEE de la fila, el `select` lo tiene que traer.**
 *
 * `camposAlContestarLaOferta` recibe un objeto armado a mano en `api/_reclamos.js` con campos de un
 * `select` escrito a mano al lado. **Nada los ata.** Y el modo de falla es callado y siempre para
 * el mismo lado: si el `select` no trae `items`, la unidad que el cliente se queda vale 0 y
 * `costo_caso` sale **más barato de lo que fue** — el mismo número que este arreglo vino a dejar de
 * mentir, mintiendo por la otra punta. ⛔ No tira ningún error: escribe un número creíble.
 *
 * Es el mismo cable que `RetornoRow` contra `COLS_RETORNO` en `tests/retornos.test.ts`, y el mismo
 * que ata los botones de la bandeja a la lista del servidor: **agregar una entrada sin agregar su
 * columna se pone rojo**.
 */
describe('lo que el handler le pasa al núcleo contra lo que trajo de la base', () => {
  const fuente = readFileSync(new URL('../api/_reclamos.js', import.meta.url), 'utf8')
  const rama = fuente.split("if (action === 'retencion-respuesta')")[1].split('\n    if (action ===')[0]

  it('toda columna que la rama usa de la fila, el select la trae', () => {
    const select = (rama.match(/\.select\('([^']+)'\)/) || [])[1] || ''
    const traidas = new Set(select.split(',').map((c) => c.trim()))
    const usadas = [...new Set([...rama.matchAll(/\bfila\.([a-z_]+)/g)].map((m) => m[1]))]

    // Que la extracción no se haya quedado vacía: sin esto el test pasa sobre la nada.
    expect(traidas.has('items')).toBe(true)
    expect(usadas.length).toBeGreaterThan(4)
    expect(usadas.filter((c) => !traidas.has(c))).toEqual([])
  })

  /**
   * ⚠️ La otra mitad: que los `items` **lleguen** al núcleo. La columna puede estar en el `select`
   * y quedarse sin pasar en la llamada, y el resultado es exactamente el mismo cero callado.
   */
  it('y los items viajan en la llamada al núcleo', () => {
    const llamada = rama.split('camposAlContestarLaOferta({')[1].split('});')[0]
    expect(llamada).toMatch(/items:\s*Array\.isArray\(fila\.items\)/)
  })

  /**
   * 🔴 **D4, la misma mitad para `compensacion`.** El parámetro es obligatorio, así que el núcleo
   * ⛔ no puede contestar mal en silencio — pero **el handler es JS y ⛔ no lo compila nadie**: si
   * alguien saca la línea, el error sale recién en producción, sobre una fila real. Acá se ata que
   * el dato **viaje** y que salga de la fila, ⛔ no del body: si viniera de la pantalla, la
   * pregunta «¿hay una decisión guardada?» la contestaría el navegador.
   */
  it('y la decisión guardada viaja, leída de la FILA', () => {
    const llamada = rama.split('camposAlContestarLaOferta({')[1].split('});')[0]
    expect(llamada).toMatch(/compensacionGuardada:\s*fila\.compensacion/)
    expect(llamada).not.toMatch(/compensacionGuardada:\s*b\./)
  })

  /**
   * 🔴 **La nota del historial sale del núcleo.** Era la premisa falsa escrita a mano en este
   * archivo —«sigue lo que estaba decidido»— sobre una fila que ⛔ no tenía ninguna decisión.
   * Que vuelva a armarse acá es exactamente cómo el caso se mantuvo mudo.
   */
  it('la nota ⛔ no se vuelve a escribir en el handler', () => {
    // ⚠️ **Sin comentarios**, o el test se choca con el que EXPLICA el arreglo: la frase vieja
    // sigue escrita ahí a propósito, para que se entienda qué afirmaba de más.
    const codigo = rama.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(codigo).toMatch(/const nota = r\.nota/)
    expect(codigo).not.toMatch(/sigue lo que estaba decidido/)
  })
})
