import { describe, expect, it } from 'vitest'
import { estadoEnCriollo, ESTADO_LABEL, type ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * 🔴 **BKL-01 · «Borrador» era un mal nombre, y encima tapaba DOS estados** (30-ago-2026).
 *
 * El informe pedía renombrarlo *«por un término más adecuado, como Pendiente»*. Tenía razón en la
 * mitad: para quien atiende, «borrador» es un documento a medio escribir, y esto es **un reclamo
 * abierto al que todavía ⛔ no se le escribió al cliente**.
 *
 * ⚠️ **Pero «Pendiente» ⛔ no se puede usar**: en la misma fila, la columna de al lado dice
 * *«Pendientes: anular la venta · devolver la plata»*. Y **«Sin revisar» tampoco**, porque
 * `en_revision` es **«Para revisar»** — dos carteles casi idénticos para los dos estados que más
 * importa distinguir: el que espera que le escribamos y el que espera que decidamos.
 *
 * 🔴 🔑 **Y abajo estaba lo más grande, que el informe ⛔ no vio**: `borrador` significa **dos
 * cosas** (§ 4 de la auditoría del 28-ago). Un **cambio decidido vuelve a `borrador` a propósito**,
 * a esperar que el cliente pague — ése ⛔ no es un reclamo olvidado. Las dos poblaciones mostraban
 * exactamente el mismo cartel.
 *
 * 🔑 **El discriminador ya existía**: `compensacion`. Es el mismo que `alertasDe` usa para ⛔ no
 * acusar de olvidado a un cambio que espera el pago — o sea que **la regla ya estaba aplicada de un
 * lado y ⛔ no del otro** ⇒ [[feedback_areben_dos_lados_bien_y_la_pregunta_del_medio]].
 */

const fila = (extra: Partial<ReclamoRow>): ReclamoRow => ({
  id: 1, store: 'bdi', motivo: 'falla', estado: 'borrador', items: [],
  stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  ...extra,
} as unknown as ReclamoRow)

describe('BKL-01 · el estado que significaba dos cosas', () => {
  it('sin decisión: dice que falta escribirle al cliente', () => {
    expect(estadoEnCriollo(fila({ compensacion: null }))).toBe('Sin escribirle')
  })

  /** 🔑 La mitad que el informe ⛔ no vio: el cambio decidido esperando el pago. */
  it('con decisión guardada: dice que se espera el pago', () => {
    expect(estadoEnCriollo(fila({ compensacion: 'otro_producto' }))).toBe('Esperando que pague')
  })

  /**
   * ⚠️ **Los dos siguen siendo `borrador` en la base.** Lo que cambió es lo que LEE la persona.
   * Sin este test, alguien podría "arreglarlo" partiendo el estado en dos y eso sí sería una
   * migración, con todo lo que cuelga de `ESTADOS_ABIERTOS` y de los frenos.
   */
  it('⛔ la base ⛔ no cambia: los dos son `borrador`', () => {
    expect(fila({ compensacion: 'otro_producto' }).estado).toBe('borrador')
    expect(ESTADO_LABEL.borrador).toBeDefined()
  })

  /**
   * 🔴 **Las dos palabras prohibidas, fijadas.** ⛔ «Pendiente» (la columna de al lado ya la usa) y
   * ⛔ nada que se confunda con «Para revisar» de `en_revision`. Un comentario que lo explique ⛔ no
   * frena a nadie ⇒ [[feedback_areben_invariante_escrito_no_frena]].
   */
  it('⛔ no se llama «Pendiente» ni choca con «Para revisar»', () => {
    const abierto = estadoEnCriollo(fila({ compensacion: null }))
    expect(abierto).not.toMatch(/pendiente/i)
    expect(abierto).not.toBe(ESTADO_LABEL.en_revision)
    // Y la otra punta: que los dos rótulos de `borrador` ⛔ no sean el mismo.
    expect(abierto).not.toBe(estadoEnCriollo(fila({ compensacion: 'otro_producto' })))
  })

  /** ⚠️ Y que el arreglo ⛔ no haya pisado los casos especiales que ya tenía la función. */
  it('⛔ no rompe los dos casos que ya distinguía', () => {
    expect(estadoEnCriollo(fila({ estado: 'en_transito', via_retorno: 'presencial' }))).toBe('Esperando que lo traiga')
    expect(estadoEnCriollo(fila({ estado: 'en_revision', compensacion: null }))).toBe('Para revisar')
  })
})
