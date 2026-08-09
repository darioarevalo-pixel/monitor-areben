/**
 * **Ejecutar un paso `escalon`**: releer, preguntarle al guardarraíl, y recién entonces escribir.
 *
 * # Por qué esto vive en `lib/` y no adentro del handler
 *
 * Un escalón lo puede disparar **el browser** (alguien aprieta Seguir en el Panel) o **el cron**
 * (`scripts/avanzar-planes-meta.mjs`, cada hora, que es la única forma de que un plan de cuatro días
 * avance sin que nadie esté mirando). Los dos tienen que hacer exactamente lo mismo, y "exactamente
 * lo mismo" escrito dos veces son dos cosas que se despegan el día que una se arregla.
 *
 * Es el mismo motivo por el que `graph.core.js` vive en `lib/` y no en `api/_graph.js`: los scripts
 * no pueden importar de `api/`. Y es `.js` plano porque lo importan los dos, y ninguno pasa por el
 * compilador de Next.
 *
 * # El orden, que es todo
 *
 *   1. **Releer el diario de Meta.** No el del plan, no el de la foto: el de hace un segundo.
 *   2. Leer la foto diaria y los umbrales de la marca.
 *   3. `decidirEscalon()`. Si dice que no, el paso queda **`salteado` con el motivo escrito** y el
 *      plan sigue vivo — no es un fallo, es una decisión que se puede leer tres días después.
 *   4. Escribir, releer y **comparar**: `ok` sale de la relectura y nunca del POST. Meta acepta
 *      cambios de presupuesto que después no aplica, y acá eso sería plata que se cree movida.
 *
 * ⚠️ **Cada intento vuelve a preguntar.** Si entre el primer intento y el reintento el ROAS se cayó,
 * el escalón ya no corresponde: por eso el guardarraíl está adentro del paso y no en el momento de
 * armar el plan. Un plan armado el lunes no autoriza un aumento el jueves.
 */

import { aMonto, quedoPuesto } from './acciones.core.js'
import { decidirEscalon } from './escalado.core.js'
import { plata } from './formato.core.js'
import { graph, graphPost, mensajeError } from './graph.core.js'
import { COLS_REGLA, leerSnapshot, leerUmbrales } from './leer-snapshot.core.js'
import { derivarUmbrales, umbralesEfectivos, VENTANA_DIAS } from './reglas.core.js'

/** Los días de foto que mira el guardarraíl. El mismo que la regla que propone escalar. */
export { VENTANA_DIAS }

const diaMenos = (hastaIso, dias) => new Date(Date.parse(`${hastaIso}T00:00:00Z`) - dias * 86400000).toISOString().slice(0, 10)

/**
 * Los umbrales efectivos de una línea y las filas de su foto, listos para `decidirEscalon()`.
 *
 * Se lee **en cada escalón** y no una vez al armar el plan: bajar el techo de una marca tiene que
 * frenar lo que ya está en curso, o sería un freno que sólo sirve para las escaladas futuras.
 */
export async function contextoDeEscalon(sb, linea, hasta, ventana = VENTANA_DIAS) {
  const [u, snap] = await Promise.all([
    leerUmbrales(sb),
    // Un día de más: `ventanaDe()` incluye `hasta`, así que N días son N-1 hacia atrás. Pedir uno
    // extra es una fila más y evita que la racha se corte por un borde.
    leerSnapshot(sb, { cols: COLS_REGLA, desde: diaMenos(hasta, ventana), hasta, lineas: [linea] }),
  ])
  if (u.error) return { error: `No se pudieron leer los umbrales: ${u.error}` }
  if (snap.error) return { error: `No se pudo leer la foto diaria: ${snap.error}` }

  const filas = snap.filas || []
  // ⚠️ Los derivados salen de TODAS las filas de la línea que se trajeron, igual que en `evaluarRegla`.
  // Ninguno de los dos umbrales que pide escalar es derivable, así que hoy esto no cambia ninguna
  // decisión — va igual para que el día que alguno lo sea, no haya dos formas de resolverlo.
  const umbrales = umbralesEfectivos(null, u.mapa.get(linea) || null, derivarUmbrales(filas))
  const moneda = (filas.find((f) => f.moneda) || {}).moneda || 'ARS'
  return { umbrales, filas, moneda }
}

/**
 * Corre un escalón. Devuelve **siempre** una de estas cuatro formas, y las cuatro son estados que la
 * pantalla sabe dibujar:
 *
 * - `{ salteado: true, motivo, evidencia }` — el guardarraíl dijo que no. **No es un fallo.**
 * - `{ ok: true, id, desdeCrudo, aCrudo, detalle, uso }` — quedó puesto y releído.
 * - `{ corte: true, error }` — no se supo si Meta lo aplicó. El paso se repite (es un valor absoluto).
 * - `{ error }` — Meta contestó que no, o aceptó y no lo aplicó.
 *
 * @param pedido `{ objetoId, nivel, previstoCrudo }`, tal como lo dejó `armarPlanEscalar()`
 */
export async function correrEscalon(sb, { pedido, linea, hasta, simulacro = false, timeoutMs }) {
  const objetoId = String((pedido && pedido.objetoId) || '')
  const nivel = String((pedido && pedido.nivel) || 'conjunto')
  if (!/^\d+$/.test(objetoId)) return { error: 'El escalón no dice sobre qué objeto va.' }

  // 1. El diario de AHORA. 🔴 Nunca el del plan: entre un escalón y el siguiente pasan horas, y en
  //    esas horas alguien pudo tocarlo en Ads Manager.
  const rel = await graph(`${objetoId}?fields=id,name,daily_budget`, 2)
  if (!rel.ok) {
    return { corte: true, error: 'No se pudo leer el presupuesto de ahora, así que no se subió nada.' }
  }
  const diarioCrudo = Number((rel.data || {}).daily_budget) || 0

  // 2. La foto y los umbrales, releídos en cada escalón.
  const ctx = await contextoDeEscalon(sb, linea, hasta)
  if (ctx.error) {
    // 🔴 Que no se pueda leer la foto **no habilita** el escalón: sin con qué decidir, no se sube. Es
    // el mismo criterio que `sinFoto` adentro del guardarraíl, un renglón más arriba en la cadena.
    return { salteado: true, motivo: `${ctx.error} Sin eso no se puede decidir si corresponde subir, así que el escalón no se dio.`, evidencia: {} }
  }

  // 3. La pregunta.
  const d = decidirEscalon({
    objetoId, nivel, diarioCrudo, filas: ctx.filas, umbrales: ctx.umbrales, hasta, moneda: ctx.moneda,
  })
  if (!d.seguir) return { salteado: true, motivo: d.motivo, evidencia: d.evidencia, llegoAlTecho: !!d.llegoAlTecho }

  const campos = { daily_budget: String(d.aCrudo) }
  const detalle = `De ${plata(aMonto(d.desdeCrudo, ctx.moneda))} a ${plata(aMonto(d.aCrudo, ctx.moneda))}. ${d.motivo}`

  if (simulacro) {
    return { ok: true, id: objetoId, desdeCrudo: d.desdeCrudo, aCrudo: d.aCrudo, detalle: `Simulacro: no se escribió en Meta. ${detalle}`, evidencia: d.evidencia }
  }

  // 4. Escribir, releer, comparar.
  const r = await graphPost(objetoId, campos, timeoutMs)
  if (!r.ok) {
    return r.status === 0
      ? { corte: true, error: mensajeError(r), uso: r.uso }
      : { error: mensajeError(r), uso: r.uso }
  }
  const rel2 = await graph(`${objetoId}?fields=id,name,daily_budget`, 2)
  if (!rel2.ok) return { corte: true, error: 'Meta lo aceptó pero no se pudo confirmar cómo quedó.', uso: r.uso }
  const puesto = quedoPuesto(campos, rel2.data || {})
  if (!puesto.ok) {
    return { error: 'Meta lo aceptó pero no lo aplicó: el presupuesto quedó como estaba.', uso: r.uso }
  }
  return { ok: true, id: objetoId, desdeCrudo: d.desdeCrudo, aCrudo: d.aCrudo, detalle, evidencia: d.evidencia, uso: r.uso }
}
