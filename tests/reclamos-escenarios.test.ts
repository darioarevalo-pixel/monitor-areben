/**
 * El ESCENARIO — el nivel del medio del chasis de Postventa.
 *
 * Lo que se prueba acá no es una tabla de datos: es que **el escenario mueve la plata**. Tres casos
 * de once no se pueden resolver mirando el motivo, y si alguna de esas derivaciones se despega, no
 * rompe ninguna pantalla — se ve en la caja, semanas después, cuando alguien nota que a veces se
 * devolvió el envío y a veces no por el mismo motivo.
 *
 * El oráculo de cada `it` es el documento del chasis (24-ago-2026) y las respuestas de Bruno, no
 * el código: por eso los tests dicen *qué tiene que pasar en el negocio*, no *qué devuelve la
 * función*.
 */
import { describe, expect, it } from 'vitest'
import {
  CASOS,
  MOTIVOS_VIGENTES,
  compensacionesDe,
  destinoDe,
  devuelveElEnvioDeIda,
  escenariosDe,
  esEscenarioDe,
  esSoloSeguimiento,
  ofreceRetencion,
  perfilDe,
  pideReclamoAlTransportista,
  productoEnJuego,
  puedeVolverLaPrenda,
  reclasificaA,
  pendientesDe,
  registroDeRetencion,
  salidaAlAceptarRetencion,
  type MotivoReclamo,
} from '@/lib/reclamos/tipos'

describe('la forma del centro: una pregunta, una lista cerrada', () => {
  /**
   * La regla de diseño, textual: *"si una ficha no tiene una pregunta única, el caso no está
   * entendido"*. Un caso con dos preguntas es un caso que en realidad son dos.
   */
  it('los once casos vigentes tienen su ficha, con UNA sola pregunta', () => {
    for (const m of MOTIVOS_VIGENTES) {
      const caso = CASOS[m]
      expect(caso, m).toBeTruthy()
      expect(caso!.pregunta.trim().length, m).toBeGreaterThan(0)
      // Una pregunta, no una lista de cosas a analizar: un solo signo de cierre.
      expect(caso!.pregunta.split('?').length - 1, m).toBe(1)
    }
  })

  it('ningún caso se queda sin escenarios, y ninguno tiene uno solo', () => {
    // Con un solo escenario la pregunta no decide nada: sería un cartel, no una respuesta.
    for (const m of MOTIVOS_VIGENTES) {
      expect(escenariosDe(m).length, m).toBeGreaterThan(1)
    }
  })

  it('las claves no se repiten adentro de un caso', () => {
    for (const m of MOTIVOS_VIGENTES) {
      const claves = escenariosDe(m).map((e) => e.clave)
      expect(new Set(claves).size, m).toBe(claves.length)
    }
  })

  /** La lista es cerrada: un escenario de OTRO caso no vale, aunque exista. */
  it('un escenario de otro caso no se acepta', () => {
    expect(esEscenarioDe('demora', 'antes_despacho')).toBe(true)
    expect(esEscenarioDe('falla', 'antes_despacho')).toBe(false)
    expect(esEscenarioDe('demora', 'cualquier_cosa')).toBe(false)
  })

  it('a dónde manda cada salida de escape es un caso que existe', () => {
    for (const m of MOTIVOS_VIGENTES) {
      for (const e of escenariosDe(m)) {
        if (!e.reclasificaA) continue
        expect(MOTIVOS_VIGENTES, `${m}/${e.clave}`).toContain(e.reclasificaA)
        expect(e.reclasificaA, `${m}/${e.clave}`).not.toBe(m)
      }
    }
  })
})

/**
 * 🔑 **Acá está la plata.** Tres casos cuyo perfil NO lo fija el motivo. Si estas cuatro pruebas
 * pasan, el nivel del escenario está haciendo lo único que justifica que exista.
 */
describe('el escenario determina la plata', () => {
  /**
   * "No es como en la publicación" es culpa nuestra **sólo si la diferencia es objetiva**. Si el
   * producto coincide con lo publicado y lo que falló fue la expectativa, no lo es — y de eso
   * depende quién paga el envío de ida.
   */
  it('la publicación: sólo la diferencia objetiva devuelve el envío de ida', () => {
    expect(devuelveElEnvioDeIda('no_como_publicado', 'diferencia_objetiva')).toBe(true)
    expect(devuelveElEnvioDeIda('no_como_publicado', 'menor_esperable')).toBe(false)
    // Sin escenario cargado cae en el default del caso, que es el que NO regala plata.
    expect(devuelveElEnvioDeIda('no_como_publicado', null)).toBe(false)
  })

  /**
   * La demora es nuestra sólo si el pedido quedó parado en preparación. Si fue del transporte o del
   * plazo mal informado, no se compensa: el servicio de logística nacional no depende nuestro.
   */
  it('la demora: sólo la que quedó en preparación se compensa, y con un cupón', () => {
    expect(perfilDe('demora', 'antes_despacho').errorPropio).toBe(true)
    expect(perfilDe('demora', 'transporte').errorPropio).toBe(false)

    expect(compensacionesDe('demora', 'antes_despacho')).toContain('cupon')
    expect(compensacionesDe('demora', 'transporte')).not.toContain('cupon')
    // Y en ningún escenario sale plata de la caja por una demora.
    for (const e of escenariosDe('demora')) {
      expect(compensacionesDe('demora', e.clave), e.clave).not.toContain('plata_total')
    }
  })

  /**
   * El reclamo al transportista es plata recuperable **nuestra**, no del cliente. En "no llegó" va
   * siempre; en una demora va **sólo si fue del transporte** — segundo lugar donde el escenario, y
   * no el caso, decide adónde va la plata.
   */
  it('el reclamo al transportista lo enciende el escenario, no el caso', () => {
    expect(pideReclamoAlTransportista('no_llego', null)).toBe(true)
    expect(pideReclamoAlTransportista('demora', 'transporte')).toBe(true)
    expect(pideReclamoAlTransportista('demora', 'antes_despacho')).toBe(false)
    expect(pideReclamoAlTransportista('demora', null)).toBe(false)
  })

  /**
   * La cancelación no es un caso: es el escenario de `arrepentimiento` en que el pedido todavía no
   * salió. Y eso cambia tres cosas físicas a la vez.
   */
  it('la cancelación: el pedido no salió, no recibió nada y no hay producto en juego', () => {
    const cancela = perfilDe('arrepentimiento', 'se_puede_frenar')
    expect(cancela.salio).toBe(false)
    expect(cancela.recibioAlgo).toBe(false)
    expect(cancela.productoEnJuego).toBe(false)

    const salio = perfilDe('arrepentimiento', 'ya_salio')
    expect(salio.salio).toBe(true)
    expect(salio.productoEnJuego).toBe(true)
  })

  /**
   * ⚠️ La consecuencia de plata de la cancelación, que es la que se paga si se equivoca: nunca
   * recibió el paquete, así que **el envío vuelve entero**. No por error nuestro —no lo hubo— sino
   * porque el servicio no se prestó.
   */
  it('la cancelación devuelve el envío; el arrepentimiento no', () => {
    expect(devuelveElEnvioDeIda('arrepentimiento', 'se_puede_frenar')).toBe(true)
    expect(devuelveElEnvioDeIda('arrepentimiento', 'ya_salio')).toBe(false)
  })

  /**
   * El excedente **no tiene salida de plata**: el cliente no pagó ese producto, así que no hay nada
   * que compensarle. Lo único que se decide es si la unidad vuelve — el final del excedente es de
   * stock, no de caja. Ofrecerle "le devolvemos la plata" ahí sería regalar plata por un error que
   * no le costó nada.
   */
  it('el excedente no tiene ninguna salida de plata', () => {
    expect(compensacionesDe('excedente', null)).toEqual(['ninguna'])
    for (const e of escenariosDe('excedente')) {
      expect(compensacionesDe('excedente', e.clave), e.clave).toEqual(['ninguna'])
    }
  })

  /**
   * Faltó un componente, no el producto: la unidad entera **sigue estando** en el depósito, así que
   * `unidadExiste` no se toca. Ponerlo en `false` pediría darla de baja en Gestión Nube, que es el
   * movimiento contrario al que corresponde. El "sin reingreso" sale de la resolución, no de acá.
   */
  it('faltó un componente no cambia dónde está la unidad', () => {
    expect(perfilDe('faltante', 'componente').unidadExiste).toBe(true)
    expect(perfilDe('faltante', 'no_preparado').unidadExiste).toBe(true)
  })

  it('en una cancelación no se ofrece cambio: no hay producto contra el cual armarlo', () => {
    expect(compensacionesDe('arrepentimiento', 'se_puede_frenar')).not.toContain('otro_producto')
    expect(compensacionesDe('arrepentimiento', 'ya_salio')).toContain('otro_producto')
  })
})

/**
 * El final tiene que **poder quedar vacío**. Una demora no genera ningún movimiento: ni plata, ni
 * stock, ni producto que vuelva. Hasta el 25-ago-2026 `decidir` exigía un destino de producto
 * siempre, así que una demora no se podía cerrar nunca.
 */
describe('el final vacío: la tercera pregunta física', () => {
  it('sólo la demora y la cancelación no tienen producto en juego', () => {
    const sinProducto: string[] = []
    for (const m of MOTIVOS_VIGENTES) {
      if (!productoEnJuego(m, null)) sinProducto.push(m)
      for (const e of escenariosDe(m)) {
        if (!productoEnJuego(m, e.clave)) sinProducto.push(`${m}/${e.clave}`)
      }
    }
    expect([...new Set(sinProducto)].sort()).toEqual([
      'arrepentimiento/se_puede_frenar', 'demora', 'demora/antes_despacho',
      'demora/plazo_mal_informado', 'demora/transporte',
    ])
  })

  it('sin producto en juego no hay destino que elegir, y eso no es un dato faltante', () => {
    expect(destinoDe('demora', false, 'transporte')).toBeNull()
    expect(destinoDe('arrepentimiento', true, 'se_puede_frenar')).toBeNull()
    // Con producto, el destino sigue saliendo como siempre.
    expect(destinoDe('arrepentimiento', true, 'ya_salio')).toBe('stock')
  })

  it('tampoco hay producto que vuelva ni descuento que ofrecer para que se lo quede', () => {
    expect(puedeVolverLaPrenda('demora', 'transporte')).toBe(false)
    expect(puedeVolverLaPrenda('arrepentimiento', 'se_puede_frenar')).toBe(false)
    expect(puedeVolverLaPrenda('arrepentimiento', 'ya_salio')).toBe(true)

    // La retención es ofrecerle plata para que se quede con algo que TIENE. En una cancelación no
    // tiene nada, así que ofrecerlo sería negociar sobre un producto que nunca salió del depósito.
    expect(ofreceRetencion('arrepentimiento', 'se_puede_frenar')).toBe(false)
    expect(ofreceRetencion('arrepentimiento', 'ya_salio')).toBe(true)
  })
})

describe('las salidas de escape conservan el caso, no lo duplican', () => {
  it('la disconformidad con diferencia objetiva se muda a la publicación, y a la inversa', () => {
    expect(reclasificaA('no_esperaba', 'diferencia_objetiva')).toBe('no_como_publicado')
    expect(reclasificaA('no_como_publicado', 'coincide')).toBe('no_esperaba')
  })

  it('un talle que en realidad era otro producto es un pedido mal armado', () => {
    expect(reclasificaA('talle', 'otro_talle')).toBe('mal_armado')
  })

  it('el que finalmente llegó, tarde, deja de ser "no llegó"', () => {
    expect(reclasificaA('no_llego', 'llego_tarde')).toBe('demora')
  })

  it('los escenarios que se quedan en su caso no mudan nada', () => {
    expect(reclasificaA('falla', 'inutil')).toBeNull()
    expect(reclasificaA('demora', 'transporte')).toBeNull()
    expect(reclasificaA('no_llego', null)).toBeNull()
  })
})

/**
 * En "no llegó" los tres primeros escenarios son **seguimiento**: el paquete sigue viajando y
 * todavía no hay nada que decidir. Hasta ahora un `no_llego` se daba por perdido desde el minuto
 * cero, y un pedido que aparecía no tenía salida.
 */
describe('lo que todavía no es un caso', () => {
  it('sólo "no llegó" tiene escenarios de puro seguimiento', () => {
    const seguimiento: string[] = []
    for (const m of MOTIVOS_VIGENTES) {
      for (const e of escenariosDe(m)) if (esSoloSeguimiento(m, e.clave)) seguimiento.push(`${m}/${e.clave}`)
    }
    expect(seguimiento.sort()).toEqual([
      'no_llego/demorado', 'no_llego/en_transito', 'no_llego/sin_movimientos',
    ])
  })

  it('el extraviado sí es un caso: es donde se da por perdido', () => {
    expect(esSoloSeguimiento('no_llego', 'extraviado')).toBe(false)
  })
})

/**
 * Lo que un escenario tiene permitido mover está acotado a las preguntas físicas. Es un candado
 * barato contra la forma de bug que ya tuvo este módulo: la regla repartida en dos listas.
 */
describe('el escenario no puede mover cualquier cosa', () => {
  it('sólo toca las preguntas físicas, nunca las fotos ni las expectativas', () => {
    const permitido = new Set(['salio', 'unidadExiste', 'recibioAlgo', 'errorPropio', 'productoEnJuego'])
    for (const m of MOTIVOS_VIGENTES) {
      for (const e of escenariosDe(m)) {
        for (const k of Object.keys(e.perfil || {})) {
          expect(permitido.has(k), `${m}/${e.clave}: ${k}`).toBe(true)
        }
      }
    }
  })

  it('un escenario que no cambia nada devuelve el MISMO perfil del caso, no una copia distinta', () => {
    for (const m of MOTIVOS_VIGENTES as MotivoReclamo[]) {
      const base = perfilDe(m, null)
      for (const e of escenariosDe(m)) {
        if (e.perfil) continue
        expect(perfilDe(m, e.clave), `${m}/${e.clave}`).toEqual(base)
      }
    }
  })
})

/**
 * **La oferta de retención: qué se ofreció y qué contestó.**
 *
 * El oráculo es Bruno, 24-ago-2026: *"la salida ideal es el cupón, pero capaz la persona puede no
 * aceptarlo, y continúa el cambio o devolución"* ⇒ hay que registrar **las dos**. La aceptada se
 * podía adivinar por la resolución; la rechazada no dejaba rastro en ningún lado, y sin ella el
 * numerador existe y el denominador no: no se puede decir cuántas veces funciona.
 */
describe('el registro de la oferta de retención', () => {
  // ⚠️ `forma` entró el 27-ago-2026 y es obligatoria: la base la trae para que cada caso hable de
  // lo suyo. Los casos que la prueban a ella la pisan.
  const base = { motivo: 'talle' as MotivoReclamo, escenario: null, retornoDecidido: false, forma: 'plata' as const }

  it('sin respuesta no toca nada: mandar la decisión desde otra pantalla ⛔ no borra la oferta ya registrada', () => {
    expect(registroDeRetencion({ ...base, respuesta: null, monto: null }).campos).toEqual({})
    expect(registroDeRetencion({ ...base, respuesta: null, monto: null }).error).toBeUndefined()
  })

  it('media oferta se rechaza por las dos mitades: un monto sin respuesta y una respuesta sin monto', () => {
    // Las dos formas de mentir después: "le ofrecí $6.000" sin saber qué dijo, y "no aceptó" qué.
    expect(registroDeRetencion({ ...base, respuesta: null, monto: 6000 }).error).toBeTruthy()
    expect(registroDeRetencion({ ...base, respuesta: 'rechazo', monto: null }).error).toBeTruthy()
    expect(registroDeRetencion({ ...base, respuesta: 'rechazo', monto: 0 }).error).toBeTruthy()
  })

  it('la respuesta sale de una lista cerrada', () => {
    expect(registroDeRetencion({ ...base, respuesta: 'quizas' as never, monto: 6000 }).error).toBeTruthy()
    expect(registroDeRetencion({ ...base, respuesta: 'rechazo', monto: 6000 }).campos)
      .toEqual({ retencion_respuesta: 'rechazo', retencion_monto: 6000, retencion_forma: 'plata' })
  })

  it('⛔ no se puede registrar una oferta en un caso donde no hay nada que quedarse', () => {
    // En una demora el pedido llegó, y en una cancelación nunca salió: no hay producto en juego,
    // así que una oferta registrada ahí es una fila que después cuenta mal.
    expect(registroDeRetencion({ motivo: 'demora', escenario: 'transporte', retornoDecidido: false, respuesta: 'rechazo', monto: 6000, forma: 'plata' }).error).toBeTruthy()
    expect(registroDeRetencion({ motivo: 'arrepentimiento', escenario: 'se_puede_frenar', retornoDecidido: false, respuesta: 'acepto', monto: 6000, forma: 'plata' }).error).toBeTruthy()
    // El mismo caso con el pedido ya despachado sí admite la oferta: el cliente lo tiene.
    expect(registroDeRetencion({ motivo: 'arrepentimiento', escenario: 'ya_salio', retornoDecidido: false, respuesta: 'acepto', monto: 6000, forma: 'plata' }).campos)
      .toEqual({ retencion_respuesta: 'acepto', retencion_monto: 6000, retencion_forma: 'plata' })
  })

  it('si acepta quedárselo, el producto ⛔ no puede estar pedido de vuelta a la vez', () => {
    // Las dos cosas prendidas contaban el producto dos veces: esperándolo en la bandeja de retornos
    // y en poder del cliente.
    expect(registroDeRetencion({ ...base, respuesta: 'acepto', monto: 6000, retornoDecidido: true }).error).toBeTruthy()
    // La RECHAZADA sí convive con el retorno: justamente por eso vuelve.
    expect(registroDeRetencion({ ...base, respuesta: 'rechazo', monto: 6000, retornoDecidido: true }).campos)
      .toEqual({ retencion_respuesta: 'rechazo', retencion_monto: 6000, retencion_forma: 'plata' })
  })

  /**
   * 🆕 **La FORMA, 27-ago-2026.** Las dos ofertas cuestan cosas distintas —la plata sale de la caja
   * hoy, el cupón sale sólo si el cliente vuelve a comprar— y sin registrar cuál fue, un `acepto`
   * por $6.500 en efectivo y uno por $6.500 en cupón salen iguales de la base.
   */
  it('la forma es obligatoria: una oferta sin decir en qué queda indistinguible de la otra', () => {
    expect(registroDeRetencion({ ...base, respuesta: 'acepto', monto: 6000, forma: null }).error).toBeTruthy()
    expect(registroDeRetencion({ ...base, respuesta: 'acepto', monto: 6000, forma: 'tarjeta' as never }).error).toBeTruthy()
  })

  it('y las dos formas se guardan distintas', () => {
    expect(registroDeRetencion({ ...base, respuesta: 'acepto', monto: 6000, forma: 'cupon' }).campos)
      .toEqual({ retencion_respuesta: 'acepto', retencion_monto: 6000, retencion_forma: 'cupon' })
    expect(registroDeRetencion({ ...base, respuesta: 'acepto', monto: 6000, forma: 'plata' }).campos)
      .toEqual({ retencion_respuesta: 'acepto', retencion_monto: 6000, retencion_forma: 'plata' })
  })

  /**
   * ⚠️ **Sin respuesta la forma ⛔ no alcanza para escribir nada.** El desplegable arranca en
   * `'plata'` por default, así que si la forma sola bastara, cada reclamo que alguien abre y cierra
   * sin ofrecer nada quedaría con una oferta registrada que nunca existió.
   */
  it('la forma sola ⛔ no registra una oferta', () => {
    expect(registroDeRetencion({ ...base, respuesta: null, monto: null, forma: 'cupon' }).campos).toEqual({})
  })

  /**
   * 🔴 **Aceptar un CUPÓN ⛔ no es lo mismo que aceptar plata**, y no por el rótulo: de la
   * resolución cuelga `EFECTOS_RESOLUCION`, y `cupon` es la única que deja el pendiente de
   * **crearlo en la tienda**. Con `plata_parcial` fijo, aceptar un cupón hacía dos cosas mal a la
   * vez: sacaba de la caja una plata que nunca salió, y cerraba el reclamo sin que el cupón
   * existiera — el cliente se entera en la próxima compra de que el código no anda.
   */
  it('aceptar un cupón termina en `cupon`, y eso es lo que deja el pendiente de crearlo', () => {
    expect(salidaAlAceptarRetencion('cupon')).toBe('cupon')
    expect(salidaAlAceptarRetencion('plata')).toBe('plata_parcial')
    // La contracara, que es lo que hace que importe: sólo una de las dos pide emitir el cupón.
    expect(pendientesDe({ compensacion: salidaAlAceptarRetencion('cupon') }).cupon_estado).toBe('pendiente')
    expect(pendientesDe({ compensacion: salidaAlAceptarRetencion('plata') }).cupon_estado).toBe('no_aplica')
    // Y sólo una de las dos saca plata de la caja.
    expect(pendientesDe({ compensacion: salidaAlAceptarRetencion('plata') }).reintegro_estado).toBe('pendiente')
  })

})
