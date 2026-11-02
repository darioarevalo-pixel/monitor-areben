// Lo que le pasa a una OC cuando llega, venga del aviso (`_oc-webhook.js`) o de la lectura de la API de
// Ingresos (`_ingresos-lectura.js`): evento crudo, OC, renglones, pregunta de la Agenda y ficha del PRM.
// ⛔ Archivo `_`: no es una ruta. 🔑 Un solo camino: si cada entrada tuviera el suyo, una OC se guardaría
// distinto según por dónde entró.
import { createClient } from '@supabase/supabase-js'
import { normalizarEvento } from '../lib/recepciones/webhook.core.js'
import { leerEspejo, productoDeLinea } from '../lib/recepciones/espejo.core.js'
import { CAMPO, preguntaDeOc } from '../lib/agenda/pregunta-ingreso.core.js'
import { filaDeLocalSembrado, nuevoIdDeLocal } from '../lib/prm/sembrado.core.js'
import { cfgDeMarca } from './_recepciones-base.js'

/**
 * El cruce contra el espejo de Gestión Nube de la marca del evento.
 *
 * 🔑 **Es mejor esfuerzo y no puede voltear el evento.** Si el espejo no contesta —credenciales de
 * esa marca sin cargar, base lenta, tabla vacía— la OC se guarda igual con `espejo_consultado` en
 * false. Perder el evento sería definitivo: no hay quién lo vuelva a mandar. Perder el cruce no:
 * **quien mira lo vuelve a cruzar en vivo** (Recepciones, el banco de fotos y el PRM lo hacen).
 *
 * 🔑 **La regla vive en `lib/recepciones/espejo.core.js` y acá sólo se elige la base.** Estaba
 * escrita entera acá y otra vez en `_recepciones.js`, con una diferencia callada: aquélla
 * preguntaba sólo por SKU. Dos copias de "a qué producto apunta este renglón" es cómo dos
 * pantallas llegan a productos distintos con el mismo código.
 */
async function cruzarConElEspejo(store, lineas) {
  const cfg = cfgDeMarca(store)
  if (!cfg.url || !cfg.key) return null
  return leerEspejo(createClient(cfg.url, cfg.key), lineas)
}

/**
 * **Abre la pregunta de la puerta en la Agenda.** Devuelve un texto de lo que pasó, siempre.
 *
 * 🔑 **Es MEJOR ESFUERZO y ⛔ no puede voltear el evento**, igual que el cruce con el espejo: si la
 * Agenda no contesta, la OC se guarda lo mismo. Perder el evento sería definitivo —no hay quién lo
 * vuelva a mandar—; perder la pregunta no: el botón «Ingresó mercadería» sigue estando y la próxima
 * confirmación de esa misma OC la vuelve a abrir.
 *
 * ⚠️ **Pero lo que pasó se DICE** —viaja en la respuesta del webhook— y ⛔ no se calla: «no se abrió
 * ninguna pregunta» sin motivo se lee como que el disparador está roto, y es lo que mantiene mudo
 * seis días a un módulo que anda.
 *
 * ⏸️ **EN PAUSA desde el 18-oct-2026** (Darío: «lo de ingresos, por el momento hay que apagarlo y
 * verlo nuevamente»). Diez renglones por orden no los tildaba nadie y se habían juntado 265. Sin la
 * pregunta no se siembra nada, así que apagar la entrada apaga el disparador entero; los moldes
 * quedan cargados. Se vuelve a prender con `AGENDA_PREGUNTA_INGRESO=1` en Vercel.
 */
async function abrirPreguntaDePuerta(sb, oc) {
  if (process.env.AGENDA_PREGUNTA_INGRESO !== '1') return 'sin pregunta: los ingresos de la Agenda están en pausa'
  try {
    // Lo que ya se preguntó y cuántas van hoy, de una sola lectura. ⚠️ El filtro `not.is null` sobre
    // la clave de `datos` lo tiene que resolver LA BASE: un `select *` y un filtro acá traería la
    // tabla entera todos los días.
    const { data, error } = await sb
      .from('agenda_items')
      .select('datos, created_at')
      .not(`datos->${CAMPO}`, 'is', null)
    if (error) throw new Error(error.message)
    const filas = data || []
    const hoy = new Date().toISOString().slice(0, 10)
    const yaPreguntadas = filas.map((f) => (f.datos && f.datos[CAMPO] && f.datos[CAMPO].oc) || '').filter(Boolean)
    const abiertasHoy = filas.filter((f) => String(f.created_at || '').slice(0, 10) === hoy).length

    const r = preguntaDeOc(oc, { yaPreguntadas, abiertasHoy })
    if (r.no) return `sin pregunta: ${r.no}`

    const { fila } = r
    const { error: eIns } = await sb.from('agenda_items').insert([{
      id: `it${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      clase: fila.clase,
      titulo: fila.titulo,
      cuerpo: fila.cuerpo,
      regla: fila.regla,
      destino: fila.destino,
      marcas: fila.marcas,
      manual_id: null,
      activo: true,
      // ⚠️ `autor` es quién lo cargó, y acá no hay persona: lo cargó el aviso de Ingresos. El mismo
      // nombre que usa la puerta externa, para que en la pantalla se lea igual.
      autor: 'Ingresos',
      datos: { arrastra: fila.arrastra, [CAMPO]: fila[CAMPO] },
    }])
    if (eIns) throw new Error(eIns.message)
    return `pregunta abierta para ${oc.id}`
  } catch (e) {
    // ⛔ No relanza: la OC ya está guardada y el evento no se puede perder por esto.
    return `la pregunta no se pudo abrir: ${e.message}`
  }
}

/**
 * **Le abre la ficha del PRM al proveedor, si todavía no tiene.** Devuelve un texto, siempre.
 *
 * 🔴 **El padrón del PRM ENVEJECE SOLO, y por eso esto vive acá y no en un script.** Los 30
 * primeros locales los sembró `scripts/sembrar-prm.mjs` el 30-ago-2026 leyendo las OCs que había
 * ese día: es una **foto**. Dos días después llegaron cuatro proveedores nuevos —`YASANA`,
 * `ELIANA IND`, `AIME`, `AUDAZ`— y sus órdenes no se veían desde ninguna ficha, porque no existía.
 * Un módulo que se alimenta a mano no sobrevive a que la mitad de lo medido no aparezca.
 *
 * 🔑 **Mejor esfuerzo, igual que la pregunta de la puerta**: la OC ya está guardada y el evento
 * ⛔ no se pierde por esto. Y el motivo viaja en la respuesta: callarse se lee como que anda.
 *
 * ⚠️ **La ficha nace SIN zona a propósito** (`filaDeLocalSembrado`): la recorrida filtra por zona,
 * así que un proveedor al que se le compra por mail no entra a un viaje por accidente.
 */
async function abrirFichaDeProveedor(sb, oc) {
  const id = Number(oc.proveedor_id)
  // ⛔ No es un error: hay órdenes que de verdad llegan sin proveedor, y una ficha colgada de
  // `null` la compartirían todas.
  // 🔴 **El corte es `<= 0`, ⛔ no `Number.isFinite`**: `Number(null)` es **0**, y con el finite a
  // secas una OC sin proveedor abría la ficha «Proveedor #0». Lo cazó el test, no la lectura.
  if (!Number.isInteger(id) || id <= 0) return 'la OC no trae proveedor'
  try {
    const { data, error } = await sb
      .from('proveedor_local')
      .select('id')
      .eq('proveedor_id_ingresos', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return `${oc.proveedor_nombre || `#${id}`} ya tenía ficha`

    const fila = filaDeLocalSembrado({
      id: nuevoIdDeLocal({ ahora: Date.now(), azar: Math.random().toString(36).slice(2, 8) }),
      proveedorId: id,
      nombre: oc.proveedor_nombre,
      origen: `Sembrado al llegar ${oc.oc_label || oc.id}`,
    })
    const { error: eIns } = await sb.from('proveedor_local').insert([fila])
    // 23505 = el índice único de `proveedor_id_ingresos`. Dos OCs del mismo proveedor nuevo en la
    // misma tanda: ganó la otra, y eso es exactamente lo que el índice tiene que hacer.
    if (eIns && String(eIns.code) === '23505') return `${fila.nombre} ya tenía ficha`
    if (eIns) throw new Error(eIns.message)
    return `ficha abierta para ${fila.nombre}`
  } catch (e) {
    return `la ficha no se pudo abrir: ${e.message}`
  }
}

/**
 * Procesa un evento `oc.confirmada`. Devuelve `{ repetido }`, `{ ignorado }` o `{ oc, lineas, agenda, prm }`.
 * Si falla, lo deja anotado en `recepcion_evento` con estado `error` y relanza.
 */
export async function procesarEvento({ sb, idEvento, payload, enviadoEn = null }) {
  const norm = normalizarEvento(payload)
  const ahora = new Date().toISOString()

  try {
    // 1 · Reclamar el id. 🔑 Es un INSERT y no un upsert: el choque de clave primaria ES la
    // idempotencia, y con dos entregas simultáneas del mismo mensaje sólo una gana.
    //
    // Un evento que ya está y quedó en `error` SÍ se vuelve a procesar: si no, un reintento del
    // emisor —que es justo lo que arreglaría una caída de la base— chocaría con la fila del intento
    // fallido y se contestaría 200 dejándolo perdido para siempre.
    const { data: previo } = await sb.from('recepcion_evento').select('estado').eq('webhook_id', idEvento).maybeSingle()
    if (previo && previo.estado !== 'error') {
      return { repetido: true }
    }

    const filaEvento = {
      webhook_id: idEvento,
      tipo: String((payload || {}).type || ''),
      store: norm.ok ? norm.store : null,
      oc_id: norm.ok ? norm.oc.oc_id : null,
      payload,
      estado: norm.ok ? 'procesado' : 'ignorado',
      error: norm.ok ? null : `no aplica: ${norm.motivo}`,
      enviado_en: enviadoEn,
      recibido_en: ahora,
    }
    const { error: eEvento } = await sb.from('recepcion_evento').upsert(filaEvento, { onConflict: 'webhook_id' })
    if (eEvento) {
      // 23505 = choque de clave: otra entrega del mismo mensaje ganó la carrera. Es un duplicado,
      // no una falla — 200, o el emisor lo reintenta por algo que ya está hecho.
      if (String(eEvento.code) === '23505') return { repetido: true }
      throw new Error(eEvento.message)
    }

    // 2 · Lo que no es para nosotros se acepta y no escribe nada. **200 a propósito**: el emisor no
    // puede arreglar reintentando que su tipo de evento no nos interese.
    if (!norm.ok) return { ignorado: norm.motivo }

    // 3 · El cruce con el espejo, antes de escribir la OC para que la foto viaje con ella.
    const espejo = await cruzarConElEspejo(norm.store, norm.lineas)
    const lineas = norm.lineas.map((l) => {
      if (!espejo) return l
      const pid = productoDeLinea(l, espejo)
      return { ...l, en_gn: Boolean(pid), producto_id: pid || null }
    })
    const oc = {
      ...norm.oc,
      espejo_consultado: Boolean(espejo),
      skus_sin_espejo: espejo ? lineas.filter((l) => l.en_gn === false).length : null,
      evento_id: idEvento,
      recibido_en: ahora,
      actualizado_en: ahora,
    }

    // 4 · La OC pisa la que hubiera (clave `store:oc_id`), y los renglones se reemplazan enteros:
    // son la foto del último conteo, no un historial. El borrado va ANTES del alta y no al revés —
    // un `delete` después del `insert` se lleva puesto lo que se acaba de escribir.
    const { error: eOc } = await sb.from('recepcion_oc').upsert(oc, { onConflict: 'id' })
    if (eOc) throw new Error(eOc.message)

    const { error: eBorrar } = await sb.from('recepcion_linea').delete().eq('oc_ref', oc.id)
    if (eBorrar) throw new Error(eBorrar.message)
    if (lineas.length) {
      const { error: eLineas } = await sb.from('recepcion_linea').insert(lineas)
      if (eLineas) throw new Error(eLineas.message)
    }

    // 5 · La pregunta de la puerta. Va DESPUÉS de que la OC esté guardada: si fuera antes, un
    // fallo al escribir la OC dejaría una pregunta sobre un ingreso que no está en ningún lado.
    const agenda = await abrirPreguntaDePuerta(sb, oc)

    // 6 · La ficha del proveedor en el PRM. Va al final y por el mismo motivo que la pregunta: es
    // lo único de los seis pasos que se puede recuperar corriendo `scripts/sembrar-prm.mjs`.
    const prm = await abrirFichaDeProveedor(sb, oc)

    return { oc: oc.id, lineas: lineas.length, agenda, prm }
  } catch (e) {
    // Queda anotado para poder reprocesarlo; quien llama decide qué contestar.
    await sb
      .from('recepcion_evento')
      .upsert(
        {
          webhook_id: idEvento,
          tipo: String((payload || {}).type || ''),
          store: norm.ok ? norm.store : null,
          oc_id: norm.ok ? norm.oc.oc_id : null,
          payload,
          estado: 'error',
          error: String(e.message || e).slice(0, 500),
          enviado_en: enviadoEn,
          recibido_en: ahora,
        },
        { onConflict: 'webhook_id' },
      )
      .then(() => {}, () => {})
    throw e
  }
}
