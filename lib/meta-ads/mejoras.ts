/**
 * **¿Meta va a aceptar esta copia?** — lo que se puede saber ANTES de gastar la escritura.
 *
 * # Por qué existe
 *
 * El 7-ago-2026, apenas se publicó la app y cayó el muro del modo desarrollo, apareció otro: duplicar
 * un conjunto **con avisos** se rechaza con *«incluir el campo de mejoras estándar en el contenido
 * quedó obsoleto»*. Meta deprecó `standard_enhancements` y la copia reenvía el creativo del original,
 * así que el rechazo no lo controla el monitor.
 *
 * 🎯 **Medido el 8-ago sobre las 6 campañas que entregan (55 avisos): NO es «los creativos viejos».**
 * 31 avisos llevan el campo y 24 no, y el **7-ago se crearon de los dos tipos** —así que la fecha no
 * predice nada; la primera lectura, hecha sobre los NOMBRES de los avisos («23/7» lo lleva, «7/8» no),
 * era una deducción y resultó falsa—. El corte real es por aviso, y **un solo aviso con el campo
 * alcanza para que Meta rechace la copia entera**: 15 de los 21 conjuntos quedan afuera por eso.
 *
 * # Por qué esto es un archivo con tests y no dos `if` adentro del modal
 *
 * Mismo motivo que `copia.ts`, que nació adentro del modal y ahí tuvo el error que lo trajo afuera:
 * decide **si se le va a decir a alguien que no vale la pena apretar**, y eso no se verifica mirando
 * un cartel. Acá se cuenta; el texto lo arma la pantalla.
 */

import { TOPE_ADS_SINCRONO, type NivelAccion } from './acciones'
import type { RespuestaMejoras } from './tipos'

/** Qué se sabe de la copia antes de pedirla. */
export type BloqueoCopia =
  /** Todavía se está preguntando. */
  | { fase: 'mirando' }
  /** No se pudo averiguar. `motivo` es lo que se le muestra a la persona; duplicar sigue habilitado. */
  | { fase: 'sin-datos'; motivo: string }
  | {
      fase: 'ok'
      /** Cuántos avisos se van a copiar (los del conjunto, o todos los de la campaña). */
      avisos: number
      /** Cuántos llevan el campo obsoleto. Con uno solo, Meta rechaza la copia entera. */
      obsoletos: number
      /** Los nombres de esos avisos, para poder decir CUÁL hay que ir a arreglar. */
      nombres: string[]
      /** Pasa del tope de la vía síncrona: el servidor lo rechaza antes de intentar la copia. */
      pasaElTope: boolean
      /** Avisos cuyo creativo Meta no devolvió: no se puede afirmar nada de ellos. */
      sinSpec: number
    }

/**
 * El conteo, para el objeto que se está por duplicar.
 *
 * 🔑 **El corte depende del nivel y no es un detalle**: duplicar un conjunto copia sus avisos;
 * duplicar una campaña copia los de TODOS sus conjuntos. Contar siempre los de la campaña haría que
 * un conjunto limpio dentro de una campaña sucia se marcara como imposible —y es justo el caso que
 * salió bien el 8-ago—.
 *
 * ⚠️ **Sin avisos no hay nada que crear y la copia sale siempre.** Es la razón por la que el conjunto
 * vacío fue el conejillo de indias de todas las pruebas de escritura.
 */
export function bloqueoDeLaCopia(
  nivel: NivelAccion,
  objetoId: string,
  r: { ok: true; dato: RespuestaMejoras } | { ok: false; motivo: string },
): BloqueoCopia {
  if (!r.ok) {
    return {
      fase: 'sin-datos',
      motivo: `No se pudo mirar si los creativos se pueden copiar (${r.motivo}).`,
    }
  }

  // Un aviso no se duplica (lo dice `ACCIONES.duplicar.niveles`), así que preguntar por él es un
  // error de quien llama y no algo que haya que contestar con un número.
  if (nivel === 'aviso') return { fase: 'sin-datos', motivo: 'Un aviso no se duplica.' }

  const propios = nivel === 'conjunto'
    ? r.dato.ads.filter((a) => a.conjunto === objetoId)
    : r.dato.ads

  // 🔴 El spec ilegible NO se cuenta como «limpio». Si Meta no devolvió los `degrees_of_freedom_spec`,
  // `obsoleto` es `false` para todos y el cartel diría «se puede copiar» sin haber mirado nada. Se
  // dice que no se sabe, que es distinto.
  if (r.dato.sinSpec && propios.some((a) => !a.spec)) {
    return {
      fase: 'sin-datos',
      motivo: `Meta no devolvió los creativos (${r.dato.sinSpec}), así que no se puede saber de antemano si va a aceptar la copia.`,
    }
  }

  const conElCampo = propios.filter((a) => a.obsoleto)
  return {
    fase: 'ok',
    avisos: propios.length,
    obsoletos: conElCampo.length,
    // Tres alcanzan para saber a qué ir: la lista entera de una campaña con once avisos no la lee
    // nadie, y el número de al lado ya dice cuántos son.
    nombres: conElCampo.slice(0, 3).map((a) => a.nombre),
    pasaElTope: propios.length > TOPE_ADS_SINCRONO,
    sinSpec: propios.filter((a) => !a.spec).length,
  }
}

/**
 * ¿Vale la pena apretar? Lo que decide si el cartel es rojo o no existe.
 *
 * ⛔ **No apaga el botón, a propósito.** Lo medido dice que Meta rechaza cuando el campo está
 * presente, pero la diferencia entre `OPT_IN` y `OPT_OUT` **no se pudo medir** —no hay ningún conjunto
 * cuyos avisos sean todos `OPT_OUT`, y duplicar no existe a nivel aviso—, así que esto puede estar
 * avisando de más. Un cartel que se puede ignorar no le miente a nadie; un botón apagado por una
 * regla sin confirmar sí.
 */
export function copiaCondenada(b: BloqueoCopia): boolean {
  return b.fase === 'ok' && (b.obsoletos > 0 || b.pasaElTope)
}
