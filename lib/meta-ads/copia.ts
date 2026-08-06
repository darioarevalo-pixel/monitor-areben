/**
 * Dónde va el presupuesto de una copia.
 *
 * # Por qué esto es un archivo aparte y no dos funciones adentro del modal
 *
 * Porque decide **a qué objeto de Meta se le escribe la plata**, y eso no se puede verificar
 * mirando un modal: nació adentro de `ConfirmAccion.tsx` y ahí tuvo el error que lo trajo acá.
 *
 * 🔴 **El error, para que no vuelva**: la tabla de campañas manda `sinPresupuesto = diarioCrudo <= 0`,
 * que es correcto para el botón «Presupuesto» —en una campaña ABO no hay nada que tocar ahí—. La
 * primera versión de esto lo leyó como «no hay nada que ajustar en la copia» y cortaba de una. Pero
 * **toda la pauta es ABO**, así que TODAS las campañas caían en ese corte y el conteo de conjuntos
 * no corría nunca: la mitad de «duplicar y ajustar» era código muerto en producción. El mismo dato
 * contesta dos preguntas distintas —«¿hay algo que tocar en ESTE objeto?» y «¿dónde va la plata de
 * la copia?»— y la respuesta no es la misma.
 */

import type { NivelAccion } from './acciones'
import type { RespuestaConjuntos } from './tipos'

/** Qué se le puede ofrecer de presupuesto a la copia, y dónde iría. */
export type Presupuestable =
  /** Hay que preguntarle a Meta por los conjuntos antes de poder contestar. */
  | { fase: 'mirando' }
  /** No hay un único lugar donde ponerlo. `motivo` es lo que se le muestra a la persona. */
  | { fase: 'no-aplica'; motivo: string }
  | {
      fase: 'listo'
      /**
       * `copia` es la copia misma (un conjunto duplicado, o una campaña con presupuesto propio);
       * `conjunto-unico` es el único conjunto de una campaña copiada, que sólo se puede resolver
       * DESPUÉS de crearla porque los ids son nuevos.
       */
      destino: 'copia' | 'conjunto-unico'
      /** El diario de hoy, crudo, con el que arranca el campo. */
      baseCruda: number
      /** A qué objeto se le va a escribir, en castellano. */
      donde: string
    }

/**
 * La primera respuesta, con lo que la fila ya sabe y sin hablar con Meta.
 *
 * `sinPresupuesto` sólo se usa para el mensaje de un conjunto: ahí significa CBO (lo maneja su
 * campaña), que se lee distinto de «usa presupuesto total».
 */
export function dondeVaElPresupuesto(nivel: NivelAccion, diarioCrudo: number, sinPresupuesto: boolean): Presupuestable {
  // Un objeto con diario propio: la copia lo estrena y el lugar donde escribir es ella misma. Es el
  // conjunto normal, y la campaña con presupuesto de campaña (CBO).
  if (diarioCrudo > 0) {
    return {
      fase: 'listo',
      destino: 'copia',
      baseCruda: diarioCrudo,
      donde: nivel === 'conjunto' ? 'Se le pone a la copia del conjunto.' : 'Se le pone a la copia de la campaña.',
    }
  }

  // 🔴 Una campaña SIN diario propio no es «no hay nada que ajustar»: es ABO, y es justo el caso
  // para el que existe esta pantalla. Ver el comentario de arriba del archivo.
  if (nivel === 'campania') return { fase: 'mirando' }

  // Un conjunto sin diario propio: o lo maneja su campaña (CBO), o usa presupuesto total.
  return {
    fase: 'no-aplica',
    motivo: sinPresupuesto
      ? 'El presupuesto de este conjunto lo maneja su campaña, así que la copia también lo va a heredar de ahí.'
      : 'Este conjunto no tiene un presupuesto diario propio que la copia pueda estrenar.',
  }
}

/**
 * La respuesta definitiva, una vez que se sabe qué conjuntos tiene la campaña.
 *
 * 🔑 **Se ofrece el campo sólo si hay UN conjunto con diario propio.** Con dos o más no hay forma de
 * que el número que se tipea signifique algo: aplicárselo «a alguno» sería ponerle la plata a la
 * mitad de la copia sin decirlo, y repartirlo entre todos es una decisión de pauta que no la puede
 * tomar un modal.
 */
export function segunLosConjuntos(r: { ok: true; dato: RespuestaConjuntos } | { ok: false; motivo: string }): Presupuestable {
  if (!r.ok) {
    return { fase: 'no-aplica', motivo: `No se pudieron mirar los conjuntos (${r.motivo}). La copia sale con los mismos montos que el original.` }
  }
  const cs = r.dato.conjuntos
  const conDiario = cs.filter((c) => c.diarioCrudo > 0)

  if (cs.length === 1 && conDiario.length === 1) {
    return {
      fase: 'listo',
      destino: 'conjunto-unico',
      baseCruda: conDiario[0].diarioCrudo,
      donde: `Se le pone al conjunto «${conDiario[0].nombre}» de la copia, que es donde vive la plata.`,
    }
  }
  if (cs.length === 0) {
    return { fase: 'no-aplica', motivo: 'Esta campaña no tiene conjuntos, así que no hay presupuesto que ajustar.' }
  }
  // No debería llegar acá —una campaña CBO tiene diario propio y se resuelve antes—, pero si
  // llegara, decir «ajustalos uno por uno» mandaría a tocar algo que Meta no deja tocar.
  if (r.dato.cbo) {
    return { fase: 'no-aplica', motivo: 'El presupuesto de esta campaña se maneja a nivel campaña: la copia lo hereda igual y se cambia desde su fila.' }
  }
  if (!conDiario.length) {
    return {
      fase: 'no-aplica',
      motivo: cs.length === 1
        ? 'Su único conjunto no usa presupuesto diario, así que no hay diario que estrenar.'
        : `Esta campaña tiene ${cs.length} conjuntos y ninguno usa presupuesto diario, así que no hay diario que estrenar.`,
    }
  }
  return {
    fase: 'no-aplica',
    motivo: `Esta campaña tiene ${cs.length} conjuntos: la copia sale con los mismos montos y se ajustan uno por uno desde la fila de cada conjunto.`,
  }
}
