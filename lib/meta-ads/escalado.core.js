/**
 * **El guardarraíl de los escalones**: la pregunta que se hace ANTES de subirle plata a algo.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `planes.core.js`, `reglas.core.js` y `permisos.core.js`: lo importan
 * `api/_meta-planes.js` y `scripts/avanzar-planes-meta.mjs`, que corren en Node sin pasar por el
 * compilador de Next y **no pueden importar TypeScript**. `escalado.ts` es el re-export tipado.
 *
 * # Qué es un escalón y qué lo hace distinto de un paso de presupuesto
 *
 * Un paso `presupuesto` pone un número. Un `escalon` **pregunta primero**: lee la foto diaria, mira si
 * el objeto sigue viniendo por encima del objetivo, y recién entonces calcula cuánto subir. Si la
 * respuesta es que no, el paso queda `salteado` **con el motivo escrito** y el plan sigue existiendo.
 *
 * 🔑 **Eso —que frenar deje un renglón en vez de un silencio— es todo el valor de la pieza.** Una
 * escalada que sube sola y no cuenta nada es indistinguible de una que no corrió; una que dice «el
 * escalón 3 no se dio porque el ROAS cayó a 1,8× el jueves» es una decisión que se puede discutir.
 *
 * # Las tres cosas que se recalculan y NUNCA se creen guardadas
 *
 * 1. **El diario del que se parte se relee de Meta en cada escalón**, no sale del plan. Entre el
 *    escalón de ayer y el de hoy alguien pudo tocarlo en Ads Manager, y —peor— un aumento guardado
 *    sin publicar deja a la Graph devolviendo el valor viejo sin avisar. Ese agujero no se puede
 *    tapar: lo único honesto es partir siempre de lo que Meta contesta hoy.
 * 2. **La racha se cuenta contra la foto de hoy**, no contra la del día en que se armó el plan.
 * 3. **El techo se relee de `meta_ads_umbral`**: bajarlo tiene que frenar las escaladas en curso, o
 *    sería un freno que sólo sirve para las próximas.
 *
 * ⛔ **Nada de acá escribe.** No importa `graph.core.js` ni el cliente de Supabase: recibe lo ya
 * leído y contesta. Es lo que la hace testeable contra 90 días reales sin gastar un peso.
 */

import {
  DIAS_SEGUIDOS_DEFECTO, PASO_ESCALON, VENTANA_DIAS,
  agrupar, faltanUmbrales, hayRacha, motivoApagada, proximoDiario, ventanaDe,
} from './reglas.core.js'
import { plata, roas as roasTxt } from './formato.core.js'
// 🔴 De unidad menor a pesos va SIEMPRE por acá y nunca con un `/100` escrito a mano: hay monedas
// sin decimales, donde el factor es 1. Es el mismo `/100` perdido contra el que advierte ese archivo.
import { aMonto } from './acciones.core.js'

/** El preset cuya condición ES el guardarraíl. Ver `decidirEscalon()`. */
export const PRESET_GUARDARRAIL = 'ganador-escalar'

/**
 * 🔴 **El último día CERRADO, que es hasta dónde se puede mirar. Nunca hoy.**
 *
 * Esto no es una prolijidad: sin esto el guardarraíl no dejaba pasar **un solo** escalón, y los tests
 * no lo veían porque sus series terminaban en un día completo. Medido contra la pauta real el
 * 9-ago-2026: la foto del día en curso existe desde las 06:30 UTC con lo poco que se juntó —un
 * conjunto que gasta ~$2.700 por día figuraba con **$335 y cero ventas**—, y como la racha se cuenta
 * desde el día más nuevo hacia atrás, ese día a medias la cortaba siempre en cero. Un conjunto que
 * venía en 22× siete días seguidos daba «racha 0».
 *
 * ⚠️ Que la reatribución de Meta deje los últimos ~72 h todavía incompletos **no** pide el mismo
 * arreglo: eso subestima el ROAS, o sea que puede impedir un aumento pero nunca provocarlo. La
 * dirección del error es la barata. El día en curso, en cambio, rompía la función entera.
 */
export function ultimoDiaCerrado(ahora) {
  const t = ahora instanceof Date ? ahora.getTime() : Number(ahora)
  if (!Number.isFinite(t)) return null
  return new Date(t - 86400000).toISOString().slice(0, 10)
}

/** Cuántas horas se espera entre un escalón y el siguiente si nadie dijo otra cosa. */
export const HORAS_ESCALON_DEFECTO = 24

/** Lo menos que se puede esperar entre escalones. Menos de un día no deja ver el efecto del anterior. */
export const HORAS_ESCALON_MINIMO = 12

/**
 * Cuántos escalones puede tener una escalada.
 *
 * No es un límite técnico sino de sentido: seis escalones del 20% multiplican el diario por tres, y
 * armar de una algo que va a correr durante seis días sin que nadie lo mire es más plan del que
 * conviene tener. Si hacen falta más, se arma otra escalada mirando cómo salió ésta.
 */
export const TOPE_ESCALONES = 6

export { HORAS_ESCALON_DEFECTO as HORAS_DEFECTO, PASO_ESCALON, TOPE_ESCALONES as TOPE }

/**
 * Los diarios por los que va a ir pasando una escalada, de menor a mayor.
 *
 * Es una **previsión**, no una promesa: lo que se aplique en cada escalón lo decide `decidirEscalon()`
 * partiendo del valor releído. Sirve para dos cosas concretas: mostrar en la confirmación adónde
 * llegaría esto si todo sale bien, y saber **cuántos pasos tiene el plan** — que la escalera se corte
 * sola contra el techo es lo que evita armar seis pasos cuando desde el tercero ya no hay margen.
 */
export function escalera(diarioCrudo, pasos, techoCrudo) {
  const n = Math.max(0, Math.min(Math.floor(Number(pasos) || 0), TOPE_ESCALONES))
  const out = []
  let actual = Math.round(Number(diarioCrudo) || 0)
  for (let i = 0; i < n; i++) {
    const prox = proximoDiario(actual, techoCrudo)
    if (prox === null) break
    out.push(prox)
    actual = prox
  }
  return out
}

/**
 * ¿Se da este escalón, y de cuánto?
 *
 * Devuelve **siempre la misma forma**, y frenar es un resultado válido con su motivo escrito — no una
 * excepción ni un `false` mudo: ese texto es lo que va a leer alguien tres días después preguntándose
 * por qué la escalada se quedó en el segundo paso.
 *
 * - `{ seguir: true, aCrudo, desdeCrudo, motivo, evidencia }`
 * - `{ seguir: false, motivo, evidencia, faltan? }`
 *
 * @param objetoId    el conjunto (o campaña) al que se le sube el diario
 * @param nivel       `'conjunto' | 'campania'`
 * @param diarioCrudo el diario **releído de Meta recién**, en unidad menor. No el del plan.
 * @param filas       las filas de `meta_ads_snapshot_dia` de esa línea. Se recortan acá a la ventana.
 * @param umbrales    los umbrales efectivos de la línea (`umbralesEfectivos()`)
 * @param hasta       el último día de la ventana, ISO `YYYY-MM-DD`. 🔴 **Tiene que ser un día
 *                    CERRADO** — sale de `ultimoDiaCerrado()`, nunca de `hoy`. Ver el porqué ahí:
 *                    con el día en curso adentro, la racha da cero siempre y no pasa ningún escalón.
 */
export function decidirEscalon({ objetoId, nivel = 'conjunto', diarioCrudo, filas, umbrales, hasta, moneda = 'ARS', ventana = VENTANA_DIAS } = {}) {
  const u = umbrales || {}

  // 1. Sin los umbrales no se decide NADA. Un default silencioso acá no es un renglón de más: es
  //    plata subiendo contra un número que nadie eligió.
  const faltan = faltanUmbrales(PRESET_GUARDARRAIL, u)
  if (faltan.length) {
    return { seguir: false, faltan, motivo: motivoApagada(PRESET_GUARDARRAIL, faltan), evidencia: {} }
  }

  const desde = Math.round(Number(diarioCrudo) || 0)
  // 2. Sin diario propio no hay escalón: el conjunto lo hereda de una campaña con CBO, y subírselo
  //    a él no haría nada. Va antes que la foto porque es un hecho de Meta de hace un segundo.
  if (desde <= 0) {
    return {
      seguir: false,
      motivo: 'Ya no tiene un presupuesto diario propio: lo hereda de su campaña. Un escalón acá no cambiaría nada.',
      evidencia: { diario_crudo: desde },
    }
  }

  // 3. El techo. Llegar es la forma BUENA de que una escalada se termine, y por eso el motivo no
  //    habla de un problema.
  const techo = Math.round(Number(u.techo_diario_crudo) || 0)
  if (desde >= techo) {
    return {
      seguir: false,
      llegoAlTecho: true,
      motivo: `Ya está en el techo de presupuesto (${plata(aMonto(techo, moneda))} por día). La escalada terminó acá.`,
      evidencia: { diario_crudo: desde, techo_diario_crudo: techo },
    }
  }

  // 4. La foto. 🔴 **Sin datos se FRENA, no se supone**: «no encontré filas» y «viene mal» son cosas
  //    distintas, y sólo una de las dos justifica no subir — pero ninguna justifica subir. Pasa de
  //    verdad el día que el cron de las 06:30 falla y el de los planes corre igual a las 07:00.
  const fechas = ventanaDe(hasta, ventana)
  const g = agrupar(filas, nivel, fechas).find((x) => String(x.objeto_id) === String(objetoId))
  if (!g) {
    return {
      seguir: false,
      sinFoto: true,
      motivo: `No hay ninguna foto diaria de esto en los últimos ${fechas.length} días, así que no se puede saber cómo viene. El escalón queda para cuando la haya.`,
      evidencia: { hasta, ventana: fechas.length },
    }
  }

  // 5. La racha, contra la foto de hoy. La misma cuenta que hace el detector que lo propuso.
  const racha = hayRacha(g.filas, u)
  if (!racha.ok) {
    return {
      seguir: false,
      motivo: `Pedía ${racha.piden} días seguidos por encima de ${roasTxt(u.roas_objetivo)} y lleva ${racha.seguidos === 0 ? 'ninguno' : racha.seguidos}: viene en ${roasTxt(g.roas)} en los últimos ${g.dias} días. No se le sube.`,
      evidencia: { roas: g.roas, roas_objetivo: u.roas_objetivo, dias_seguidos: racha.seguidos, piden: racha.piden, spend: g.spend, revenue: g.revenue },
    }
  }

  const aCrudo = proximoDiario(desde, techo)
  // No debería pasar —el techo ya se chequeó arriba—, pero si el redondeo dejara el próximo igual al
  // actual, escribirlo sería un POST que no cambia nada y un paso «hecho» que no hizo nada.
  if (aCrudo === null) {
    return {
      seguir: false,
      llegoAlTecho: true,
      motivo: `Subirle el ${Math.round(PASO_ESCALON * 100)}% lo dejaría donde está: el techo no da para otro escalón.`,
      evidencia: { diario_crudo: desde, techo_diario_crudo: techo },
    }
  }

  return {
    seguir: true,
    desdeCrudo: desde,
    aCrudo,
    motivo: `Lleva ${racha.seguidos} días seguidos por encima del objetivo (${roasTxt(g.roas)} contra ${roasTxt(u.roas_objetivo)}): de ${plata(aMonto(desde, moneda))} a ${plata(aMonto(aCrudo, moneda))} por día.`,
    evidencia: {
      roas: g.roas, roas_objetivo: u.roas_objetivo, dias_seguidos: racha.seguidos,
      desde_crudo: desde, a_crudo: aCrudo, techo_diario_crudo: techo, spend: g.spend, revenue: g.revenue,
    },
  }
}

/**
 * Cuándo se toca el próximo escalón. `null` cuando no queda ninguno.
 *
 * 🔑 **Se cuenta desde AHORA y no desde que se armó el plan**, y esa es la diferencia entre «un
 * escalón por día» y «los cuatro escalones el martes». Un plan que estuvo tres días esperando a que
 * alguien lo mirara no tiene tres escalones vencidos: tiene uno, y el resto se corre.
 */
export function proximoEn(ahora, horas) {
  const t = ahora instanceof Date ? ahora.getTime() : Number(ahora)
  if (!Number.isFinite(t)) return null
  const h = Math.max(HORAS_ESCALON_MINIMO, Math.floor(Number(horas) || HORAS_ESCALON_DEFECTO))
  return new Date(t + h * 3600000).toISOString()
}

/** ¿Este plan está esperando su próximo escalón? */
export function estaEsperando(plan, ahora) {
  const p = plan || {}
  if (!p.proximo_en && !p.proximoEn) return false
  const t = new Date(p.proximo_en || p.proximoEn).getTime()
  const n = ahora instanceof Date ? ahora.getTime() : Number(ahora) || 0
  return Number.isFinite(t) && t > n
}

/** Los umbrales que una escalada necesita sí o sí, para el cartel de «falta definir…». */
export function faltanParaEscalar(umbrales) {
  return faltanUmbrales(PRESET_GUARDARRAIL, umbrales || {})
}

export { DIAS_SEGUIDOS_DEFECTO }
