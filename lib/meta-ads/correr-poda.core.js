/**
 * **Ejecutar un paso `poda`**: releer, preguntarle al guardarraíl, y recién entonces apagar.
 *
 * # Por qué esto vive en `lib/` y no adentro del handler
 *
 * El mismo motivo que `correr-escalon.core.js`: lo tienen que poder correr el browser (alguien
 * aprieta Seguir en el Panel) y un script de `scripts/`, que no puede importar de `api/`. Y es `.js`
 * plano porque ninguno de los dos pasa por el compilador de Next.
 *
 * # El orden, que es todo
 *
 *   1. **Releer el estado de Meta.** No el de la foto, no el del plan: el de hace un segundo. Si
 *      alguien ya lo pausó a mano, el paso queda `salteado` y no `fallado`.
 *   2. Leer la foto diaria y los umbrales de la marca, **de nuevo en cada paso**.
 *   3. `decidirPoda()`. 🔴 Si Meta le atribuyó compras desde que se armó la lista, **no se apaga** y
 *      el motivo queda escrito.
 *   4. Escribir, releer y **comparar**: `ok` sale de la relectura y nunca del POST.
 *
 * ⚠️ **Cada intento vuelve a preguntar**, igual que el escalón. Un plan armado el lunes no autoriza
 * apagar el jueves algo que el miércoles empezó a vender.
 */

import { quedoPuesto } from './acciones.core.js'
import { graph, graphPost, mensajeError } from './graph.core.js'
import { contextoDeFoto } from './leer-snapshot.core.js'
import { decidirPoda, VENTANA_DIAS } from './podado.core.js'
import { derivarUmbrales, umbralesEfectivos } from './reglas.core.js'

export { VENTANA_DIAS }

/**
 * Los campos con los que se lee el estado de algo antes de apagarlo.
 *
 * 🔑 **`effective_status` y no `status`.** `status` es el interruptor propio del objeto;
 * `effective_status` incluye por qué no entrega aunque el suyo diga ACTIVE —la campaña apagada, el
 * rechazo de política, la cuenta con problemas—. Para decidir si hay algo que apagar, la pregunta es
 * la segunda.
 */
const CAMPOS_ESTADO = 'id,name,status,effective_status'

/**
 * Los umbrales efectivos de una línea y las filas de su foto, listos para `decidirPoda()`.
 *
 * ⚠️ **`gasto_minimo` es DERIVADO**, así que acá no es decorativo como en los escalones: sale del CPA
 * medido de la línea sobre las filas que se acaban de traer. Es lo que hace que la poda por «gastó y
 * no vendió nada» se pueda encender sin que nadie defina un número.
 */
export async function contextoDePoda(sb, linea, hasta, ventana = VENTANA_DIAS) {
  const ctx = await contextoDeFoto(sb, linea, hasta, ventana)
  if (ctx.error) return ctx
  const filas = ctx.filas
  const umbrales = umbralesEfectivos(null, ctx.umbralLinea, derivarUmbrales(filas, { techo: ctx.techo }))
  return { umbrales, filas }
}

/**
 * Apaga un objeto. Devuelve **siempre** una de estas cuatro formas, y las cuatro son estados que la
 * pantalla sabe dibujar:
 *
 * - `{ salteado: true, motivo, evidencia }` — el guardarraíl dijo que no. **No es un fallo.**
 * - `{ ok: true, id, detalle, evidencia }` — quedó apagado y releído.
 * - `{ corte: true, error }` — no se supo si Meta lo aplicó. El paso se repite (PAUSED es absoluto).
 * - `{ error }` — Meta contestó que no, o aceptó y no lo aplicó.
 *
 * @param pedido `{ objetoId, nivel, motivo }`, tal como lo dejó `armarPlanPodar()`
 */
export async function correrPoda(sb, { pedido, linea, hasta, simulacro = false, timeoutMs }) {
  const objetoId = String((pedido && pedido.objetoId) || '')
  const nivel = String((pedido && pedido.nivel) || 'aviso')
  const motivo = String((pedido && pedido.motivo) || 'sin-ventas')
  if (!/^\d+$/.test(objetoId)) return { error: 'La poda no dice sobre qué objeto va.' }

  // 1. El estado de AHORA. 🔴 Nunca el de la foto: la foto es de esta mañana como mucho, y apagar
  //    algo que ya está apagado no es un error que valga la pena reintentar.
  const rel = await graph(`${objetoId}?fields=${CAMPOS_ESTADO}`, 2)
  if (!rel.ok) {
    return { corte: true, error: 'No se pudo leer cómo está esto en Meta, así que no se apagó nada.' }
  }
  const obj = rel.data || {}
  const estadoActual = String(obj.effective_status || obj.status || '')

  // 2. La foto y los umbrales, releídos en cada paso.
  const ctx = await contextoDePoda(sb, linea, hasta)
  if (ctx.error) {
    // 🔴 Que no se pueda leer la foto **no habilita** la poda: sin con qué decidir, no se apaga nada.
    return { salteado: true, motivo: `${ctx.error} Sin eso no se puede confirmar que corresponda apagarlo, así que no se tocó.`, evidencia: {} }
  }

  // 3. La pregunta.
  const d = decidirPoda({ objetoId, nivel, estadoActual, motivo, filas: ctx.filas, umbrales: ctx.umbrales, hasta })
  if (!d.seguir) {
    return { salteado: true, motivo: d.motivo, evidencia: d.evidencia, yaApagado: !!d.yaApagado, vendioDespues: !!d.vendioDespues }
  }

  const campos = { status: 'PAUSED' }
  const detalle = `Apagado. ${d.motivo}`

  if (simulacro) {
    return { ok: true, id: objetoId, detalle: `Simulacro: no se escribió en Meta. ${detalle}`, evidencia: d.evidencia }
  }

  // 4. Escribir, releer, comparar. `ok` sale de la relectura y nunca del POST.
  const r = await graphPost(objetoId, campos, timeoutMs)
  if (!r.ok) {
    return r.status === 0
      ? { corte: true, error: mensajeError(r), uso: r.uso }
      : { error: mensajeError(r), uso: r.uso }
  }
  const rel2 = await graph(`${objetoId}?fields=${CAMPOS_ESTADO}`, 2)
  if (!rel2.ok) return { corte: true, error: 'Meta lo aceptó pero no se pudo confirmar cómo quedó.', uso: r.uso }
  // Contra `status`, que es el campo que se escribió. `effective_status` puede decir otra cosa por
  // motivos ajenos —la campaña de arriba, una revisión— y compararlo con lo que se mandó daría un
  // falso «no lo aplicó».
  const puesto = quedoPuesto(campos, rel2.data || {})
  if (!puesto.ok) {
    return { error: 'Meta lo aceptó pero no lo aplicó: sigue al aire.', uso: r.uso }
  }
  return { ok: true, id: objetoId, detalle, evidencia: d.evidencia, uso: r.uso }
}
