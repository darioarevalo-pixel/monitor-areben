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

const oferta = {
  motivo: 'no_esperaba', escenario: null,
  monto: 13491, forma: 'plata', diferencia: null,
}

describe('camposAlContestarLaOferta', () => {
  /**
   * 🔴 **Las dos respuestas ⛔ no son simétricas.** Lo decidido ya era la salida «si dice que no»:
   * pisarlo al rechazar sería rehacer una decisión que nadie rehizo, y volvería a poner en
   * `pendiente` la plata que capaz ya salió.
   */
  it('rechazo: escribe SÓLO la respuesta y ⛔ nada más', () => {
    const r = camposAlContestarLaOferta({ ...oferta, respuesta: 'rechazo' })
    expect(r.error).toBeUndefined()
    expect(r.campos).toEqual({ retencion_respuesta: 'rechazo' })
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
