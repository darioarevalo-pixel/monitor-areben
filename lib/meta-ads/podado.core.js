/**
 * **El guardarraíl de la poda**: la pregunta que se hace ANTES de apagar algo.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `planes.core.js`, `escalado.core.js` y `permisos.core.js`: lo importan
 * `api/_meta-planes.js` y `scripts/avanzar-planes-meta.mjs`, que corren en Node sin pasar por el
 * compilador de Next y **no pueden importar TypeScript**. `podado.ts` es el re-export tipado.
 *
 * # Podar no es escalar con el signo cambiado
 *
 * Los dos releen la foto antes de moverse, los dos pueden terminar `salteado` con el motivo escrito.
 * Pero **la dirección del error barato es la contraria**, y eso cambia dos cosas concretas:
 *
 * 1. 🔴 **La reatribución.** Meta sigue atribuyendo compras hacia atrás durante días
 *    (`DIAS_RELECTURA` existe por eso), así que los últimos días de la foto están **subestimados**.
 *    Para escalar eso es la dirección barata: puede impedir un aumento, nunca provocarlo. Para podar
 *    es la CARA: subestimar las compras apaga algo que sí vende.
 *
 *    🔑 **La salida no es correr la ventana hacia atrás**, que dejaría la poda mirando la semana
 *    pasada. Es notar que **las compras sólo pueden CRECER**: contarlas sobre la ventana entera
 *    —incluidos los días que todavía se mueven— sólo puede *salvar* a un aviso, nunca condenarlo. El
 *    gasto, en cambio, es final desde el día uno. O sea que la ventana normal ya es la conservadora,
 *    siempre que el día en curso quede afuera. Medido el 9-ago-2026 sobre la pauta real: los mismos
 *    5 avisos caen con la ventana terminando en cualquier día entre hoy y hoy−5, y con 7, 10 o 14
 *    días de largo. No son casos de borde.
 *
 * 2. 🔴 **El día en curso queda afuera igual que en los escalones, pero por el motivo contrario.**
 *    Allá una foto a medias cortaba la racha y **frenaba** todo (ningún escalón pasaba). Acá una foto
 *    a medias suma gasto sin compras y **empuja a apagar**. El mismo `ultimoDiaCerrado()`, dos
 *    consecuencias opuestas: por eso está escrito acá y no dado por sabido.
 *
 * ⛔ **Nada de acá escribe.** No importa `graph.core.js` ni el cliente de Supabase: recibe lo ya
 * leído y contesta. Es lo que la hace testeable contra 90 días reales sin tocar la pauta.
 */

import { plata, roas as roasTxt } from './formato.core.js'
import { agrupar, faltanUmbrales, motivoApagada, ventanaDe, VENTANA_DIAS } from './reglas.core.js'

/**
 * Los dos motivos por los que la poda apaga algo, y **el preset que los propuso**.
 *
 * 🔑 Un paso de poda guarda cuál de los dos lo justificó, y el guardarraíl **vuelve a preguntar ese
 * mismo**. Sin eso, un aviso marcado por «gastó y no vendió nada» podría terminar apagado porque
 * horas después cumple otra condición distinta — y el renglón del registro diría un motivo que no es
 * el que se apretó.
 */
export const MOTIVOS_PODA = {
  'sin-ventas': {
    preset: 'freno-emergencia',
    rotulo: 'gastó y no vendió nada',
    // `gasto_minimo` es derivable del CPA medido de la línea: la poda por este motivo se puede
    // encender el día uno, sin que nadie defina un número.
    requiere: ['gasto_minimo'],
  },
  'bajo-roas': {
    preset: 'gastos-hormiga',
    rotulo: 'rinde por debajo del objetivo',
    requiere: ['roas_objetivo', 'gasto_minimo'],
  },
}

export const CLAVES_MOTIVO = Object.keys(MOTIVOS_PODA)

/**
 * Cuántos objetos puede apagar una poda de una.
 *
 * El tope es nuestro y es de sentido, no técnico: una lista más larga que esto no se revisa a ojo, y
 * una poda que no se revisó a ojo es un botón que apaga la pauta. Si hacen falta más, se hacen dos.
 */
export const TOPE_PODA = 20

/**
 * 🔴 **El último día CERRADO. Nunca hoy.** Ver el punto 2 de la cabecera: acá el día a medias empuja
 * a apagar, que es el error caro.
 *
 * Es la misma función que usan los escalones y está repetida a propósito en la documentación de los
 * dos, no en el código: `escalado.core.js` la exporta y de ahí sale.
 */
export { ultimoDiaCerrado } from './escalado.core.js'

/** ¿Está al aire? Meta usa varios `*_PAUSED` según de quién sea el interruptor. */
function estaActivo(estado) {
  return String(estado || '').toUpperCase() === 'ACTIVE'
}

/** Los umbrales que una poda necesita sí o sí, para el cartel de «falta definir…». */
export function faltanParaPodar(umbrales, motivo = 'sin-ventas') {
  const def = MOTIVOS_PODA[motivo]
  if (!def) return []
  return faltanUmbrales(def.preset, umbrales || {})
}

/**
 * ¿Se apaga esto, o no?
 *
 * Devuelve **siempre la misma forma**, y frenar es un resultado válido con su motivo escrito — no una
 * excepción ni un `false` mudo: ese texto es lo que va a leer alguien preguntándose por qué la poda
 * dejó tres de cinco.
 *
 * - `{ seguir: true, motivo, evidencia }`
 * - `{ seguir: false, motivo, evidencia, faltan?, yaApagado?, sinFoto? }`
 *
 * @param objetoId      el aviso (o conjunto) que se apagaría
 * @param nivel         `'aviso' | 'conjunto' | 'campania'`
 * @param estadoActual  el `effective_status` **releído de Meta recién**. No el de la foto.
 * @param motivo        cuál de los `MOTIVOS_PODA` lo justificó
 * @param filas         las filas de `meta_ads_snapshot_dia` de esa línea. Se recortan acá a la ventana.
 * @param umbrales      los umbrales efectivos de la línea (`umbralesEfectivos()`)
 * @param hasta         el último día de la ventana. 🔴 **Un día CERRADO**: sale de `ultimoDiaCerrado()`.
 */
export function decidirPoda({ objetoId, nivel = 'aviso', estadoActual, motivo = 'sin-ventas', filas, umbrales, hasta, ventana = VENTANA_DIAS } = {}) {
  const def = MOTIVOS_PODA[motivo]
  if (!def) return { seguir: false, motivo: `No existe el motivo de poda «${motivo}».`, evidencia: {} }
  const u = umbrales || {}

  // 1. Sin los umbrales no se decide NADA. Un default silencioso acá apaga pauta contra un número que
  //    nadie eligió, que es peor que no apagar nada.
  const faltan = faltanParaPodar(u, motivo)
  if (faltan.length) {
    return { seguir: false, faltan, motivo: motivoApagada(def.preset, faltan), evidencia: {} }
  }

  // 2. 🔑 Si ya está apagado, no hay nada que hacer — y **no es un fallo**. Pasa todo el tiempo: entre
  //    que se armó la poda y se ejecutó, alguien lo pausó a mano en Ads Manager. Un plan que se marca
  //    fallado por haber llegado al estado que quería es un plan que pide reintentar de gusto.
  if (!estaActivo(estadoActual)) {
    return {
      seguir: false,
      yaApagado: true,
      motivo: `Ya estaba apagado en Meta (${estadoActual || 'sin estado'}), así que no había nada que apagar.`,
      evidencia: { estado: estadoActual || null },
    }
  }

  // 3. La foto. 🔴 **Sin datos NO se apaga**: «no encontré filas» y «no vendió» son cosas distintas, y
  //    sólo una de las dos justifica apagar. Pasa de verdad el día que el cron de las 06:30 falla.
  const fechas = ventanaDe(hasta, ventana)
  const g = agrupar(filas, nivel, fechas).find((x) => String(x.objeto_id) === String(objetoId))
  if (!g) {
    return {
      seguir: false,
      sinFoto: true,
      motivo: `No hay ninguna foto diaria de esto en los últimos ${fechas.length} días, así que no se puede saber cómo viene. No se apagó.`,
      evidencia: { hasta, ventana: fechas.length },
    }
  }

  // 4. 🔴 **LA condición de esta pieza: las compras se vuelven a contar.** Meta atribuye hacia atrás
  //    durante días, así que un aviso que se marcó con cero compras el lunes puede tener dos el
  //    miércoles. Contarlas sobre la ventana entera es seguro justamente porque **sólo pueden
  //    crecer**: los días que todavía se mueven pueden salvarlo, nunca condenarlo.
  if (motivo === 'sin-ventas' && g.compras > 0) {
    return {
      seguir: false,
      vendioDespues: true,
      motivo: `Desde que entró en la lista, Meta le atribuyó ${g.compras} ${g.compras === 1 ? 'compra' : 'compras'} por ${plata(g.revenue)}. Ya no es «gastó y no vendió nada»: no se apagó.`,
      evidencia: { compras: g.compras, revenue: g.revenue, spend: g.spend, dias: g.dias },
    }
  }
  if (motivo === 'bajo-roas' && g.roas >= u.roas_objetivo) {
    return {
      seguir: false,
      vendioDespues: true,
      motivo: `Ahora viene en ${roasTxt(g.roas)}, que llega al objetivo de ${roasTxt(u.roas_objetivo)}: no se apagó.`,
      evidencia: { roas: g.roas, roas_objetivo: u.roas_objetivo, spend: g.spend, revenue: g.revenue },
    }
  }

  // 5. Y el piso de gasto, releído. Si alguien le bajó el presupuesto o la ventana se corrió, lo que
  //    justificaba apagarlo puede haber dejado de alcanzar. La vara es la misma que la del detector.
  if (g.spend < u.gasto_minimo) {
    return {
      seguir: false,
      motivo: `Ahora lleva gastados ${plata(g.spend)} en la ventana, por debajo del mínimo para juzgarlo (${plata(u.gasto_minimo)}). Con eso todavía no se puede decir que no anda.`,
      evidencia: { spend: g.spend, gasto_minimo: u.gasto_minimo, dias: g.dias },
    }
  }

  const detalle = motivo === 'sin-ventas'
    ? `Gastó ${plata(g.spend)} en ${g.dias} ${g.dias === 1 ? 'día' : 'días'} sin una sola compra, y con eso se pagaba un cliente (${plata(u.gasto_minimo)}).`
    : `Viene en ${roasTxt(g.roas)} contra un objetivo de ${roasTxt(u.roas_objetivo)}: gastó ${plata(g.spend)} y devolvió ${plata(g.revenue)}.`

  return {
    seguir: true,
    motivo: detalle,
    evidencia: {
      spend: g.spend, compras: g.compras, revenue: g.revenue, roas: g.roas,
      dias: g.dias, gasto_minimo: u.gasto_minimo,
      ...(motivo === 'bajo-roas' ? { roas_objetivo: u.roas_objetivo } : {}),
      // Para poder devolverlo como estaba sin releer nada. Ver `armarPlanPodar()`.
      estado_antes: estadoActual,
    },
  }
}

/**
 * Los candidatos a poda de una línea: lo que hoy cumple la condición, ordenado por lo que más cuesta.
 *
 * 🔑 **Es la misma cuenta que hace el detector, no una segunda.** Si la lista que se ofrece y la que
 * el guardarraíl aprueba salieran de dos lugares, el modal podría ofrecer cinco y el motor saltear
 * tres sin que nadie entienda por qué. Lo único que agrega sobre `evaluarRegla()` es la plata que se
 * libera por día, que es el número con el que se decide.
 */
export function candidatosAPodar({ filas, umbrales, hasta, motivo = 'sin-ventas', nivel = 'aviso', ventana = VENTANA_DIAS } = {}) {
  const def = MOTIVOS_PODA[motivo]
  if (!def) return { ok: false, error: `No existe el motivo de poda «${motivo}».` }
  const u = umbrales || {}
  const faltan = faltanParaPodar(u, motivo)
  if (faltan.length) return { ok: true, faltan, detalle: motivoApagada(def.preset, faltan), candidatos: [] }

  const fechas = ventanaDe(hasta, ventana)
  const candidatos = []
  for (const g of agrupar(filas, nivel, fechas)) {
    // `actual` y no `ultima`: «¿está al aire?» es una pregunta sobre ahora. Ver `agrupar()`.
    if (!estaActivo(g.actual.estado_efectivo || g.actual.estado)) continue
    if (g.spend < u.gasto_minimo) continue
    if (motivo === 'sin-ventas' ? g.compras > 0 : !(g.compras > 0 && g.roas < u.roas_objetivo)) continue
    candidatos.push({
      objetoId: g.objeto_id,
      nivel: g.nivel,
      nombre: g.nombre,
      linea: g.linea,
      cuentaId: g.cuenta_id,
      motivo,
      spend: g.spend,
      compras: g.compras,
      revenue: g.revenue,
      roas: g.roas,
      dias: g.dias,
      // Lo que se deja de gastar por día si se apaga. Es un promedio de la ventana y no el diario
      // configurado: un aviso no tiene presupuesto propio —lo tiene su conjunto—, así que el único
      // número honesto es lo que efectivamente viene gastando.
      porDia: g.dias ? g.spend / g.dias : 0,
    })
  }
  candidatos.sort((a, b) => b.spend - a.spend)
  return { ok: true, faltan: [], candidatos }
}

export { VENTANA_DIAS }
