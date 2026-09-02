// El receptor del webhook `oc.confirmada` del sistema de Ingresos.
//
//   POST /api/datos?recurso=oc-webhook     ← ésta es la URL que se le pasa al emisor
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js`. El plan Hobby de Vercel admite 12
// funciones y hay 7 usadas; si alguien crea `api/oc-webhook.js` "porque un webhook merece su
// archivo", **frena todos los deploys sin error visible**. Ya pasó una vez (ver AGENTS.md).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ ESTE VERBO NO PIDE SESIÓN — y por eso está SOLO en este archivo
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Lo llama otro servidor, no una persona: no hay sesión del monitor que pedir. Se defiende con la
// **firma HMAC** del estándar Standard Webhooks, que es la autenticación (no hace falta CORS, ni
// lista de IPs, ni login).
//
// Es el mismo criterio que `disenos-rondas`/`votacion` y que `reclamos`/`reclamo`: **un verbo
// abierto no convive con verbos con login en el mismo archivo**, que es como se cuela el que se
// olvidó de pedir la sesión. La lectura de estas mismas tablas vive en `_recepciones.js`, aparte,
// y ésa sí pide usuario y permiso.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 EL CUERPO SE LEE CRUDO, DEL STREAM — NO DE `req.body`
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// La firma se calcula sobre los bytes exactos que llegaron. `req.body` es el JSON ya parseado:
// volver a serializarlo cambia espacios, orden de claves y forma de los números, y la firma deja de
// validar con el error menos parecido a su causa.
//
// Se puede leer el stream aunque el runtime ya lo haya consumido porque `@vercel/node` lo
// **repone**: `addHelpers` bufferea el cuerpo antes de invocar el handler y después lo vuelve a
// inyectar con un `PassThrough`, parcheando `req.on('data')` y `req.on('end')`. Por eso `leerCrudo`
// usa `on('data')/on('end')` y ⛔ no `for await (const c of req)`: la iteración asíncrona pasa por
// `on('readable')`, que **no** está parcheado y va al stream original, ya vacío.
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { verificarFirma, normalizarEvento } from '../lib/recepciones/webhook.core.js'
import { CAMPO, preguntaDeOc } from '../lib/agenda/pregunta-ingreso.core.js'
import { filaDeLocalSembrado, nuevoIdDeLocal } from '../lib/prm/sembrado.core.js'
import { cfgDelMonitor, cfgDeMarca, LIMITE_CRUDO } from './_recepciones-base.js'

/** Lee el cuerpo tal como llegó. Corta si se pasa del techo: nadie manda una OC de 5 MB. */
function leerCrudo(req) {
  return new Promise((resolve, reject) => {
    const partes = []
    let total = 0
    req.on('data', (c) => {
      const b = Buffer.isBuffer(c) ? c : Buffer.from(c)
      total += b.length
      if (total > LIMITE_CRUDO) {
        reject(new Error('cuerpo demasiado grande'))
        return
      }
      partes.push(b)
    })
    req.on('end', () => resolve(Buffer.concat(partes)))
    req.on('error', reject)
  })
}

/**
 * El cruce contra el espejo de Gestión Nube de la marca del evento.
 *
 * 🔑 **Es mejor esfuerzo y no puede voltear el evento.** Si el espejo no contesta —credenciales de
 * esa marca sin cargar, base lenta, tabla vacía— la OC se guarda igual con `espejo_consultado` en
 * false. Perder el evento sería definitivo: no hay quién lo vuelva a mandar. Perder el cruce no:
 * la pantalla lo vuelve a hacer en vivo cada vez que se abre.
 *
 * ⛔ Devuelve `null` (no un mapa vacío) cuando no se pudo preguntar. Un mapa vacío se leería como
 * "ninguno de estos SKU existe en GN", que es justo la afirmación cara y falsa.
 */
async function cruzarConElEspejo(store, lineas) {
  const cfg = cfgDeMarca(store)
  if (!cfg.url || !cfg.key) return null

  const skus = [...new Set(lineas.map((l) => l.sku).filter(Boolean))]
  const codigos = [...new Set(lineas.map((l) => l.codigo_barras).filter(Boolean))]
  if (!skus.length && !codigos.length) return null

  try {
    const sb = createClient(cfg.url, cfg.key)
    const porSku = new Map()
    const porBarra = new Map()
    // De a 200: el `in` de PostgREST viaja en la query string y una OC de 800 renglones armaría una
    // URL que el proxy corta por largo — y cortada devuelve 200 con menos filas, no un error.
    for (let i = 0; i < skus.length; i += 200) {
      const { data, error } = await sb.from('inventario').select('sku, barcode, product_id').in('sku', skus.slice(i, i + 200))
      if (error) throw new Error(error.message)
      for (const f of data || []) {
        if (f.sku) porSku.set(String(f.sku), String(f.product_id ?? ''))
        if (f.barcode) porBarra.set(String(f.barcode), String(f.product_id ?? ''))
      }
    }
    for (let i = 0; i < codigos.length; i += 200) {
      const { data, error } = await sb.from('inventario').select('sku, barcode, product_id').in('barcode', codigos.slice(i, i + 200))
      if (error) throw new Error(error.message)
      for (const f of data || []) {
        if (f.barcode) porBarra.set(String(f.barcode), String(f.product_id ?? ''))
      }
    }
    return { porSku, porBarra }
  } catch {
    return null
  }
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
 */
async function abrirPreguntaDePuerta(sb, oc) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' })

  let crudo
  try {
    crudo = await leerCrudo(req)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  const h = req.headers || {}
  const idEvento = String(h['webhook-id'] || '')
  const firmado = verificarFirma({
    id: idEvento,
    timestamp: h['webhook-timestamp'],
    firma: h['webhook-signature'],
    cuerpo: crudo,
    secreto: process.env.INGRESO_WEBHOOK_SECRET,
    crypto,
  })
  // ⛔ El texto del error NO dice cuál de las dos firmas se esperaba ni cómo se armó el contenido:
  // del otro lado de este endpoint está internet.
  if (!firmado.ok) return res.status(firmado.status).json({ error: firmado.error })

  let payload
  try {
    payload = JSON.parse(crudo.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'el cuerpo no es JSON' })
  }

  const cfg = cfgDelMonitor()
  if (!cfg.url || !cfg.key) return res.status(503).json({ error: 'sin credenciales de base' })
  const sb = createClient(cfg.url, cfg.key)

  const norm = normalizarEvento(payload)
  const ahora = new Date().toISOString()
  const tsEnviado = Number(h['webhook-timestamp'])
  const enviadoEn = Number.isFinite(tsEnviado) ? new Date(tsEnviado * 1000).toISOString() : null

  try {
    // 1 · Reclamar el id. 🔑 Es un INSERT y no un upsert: el choque de clave primaria ES la
    // idempotencia, y con dos entregas simultáneas del mismo mensaje sólo una gana.
    //
    // Un evento que ya está y quedó en `error` SÍ se vuelve a procesar: si no, un reintento del
    // emisor —que es justo lo que arreglaría una caída de la base— chocaría con la fila del intento
    // fallido y se contestaría 200 dejándolo perdido para siempre.
    const { data: previo } = await sb.from('recepcion_evento').select('estado').eq('webhook_id', idEvento).maybeSingle()
    if (previo && previo.estado !== 'error') {
      return res.status(200).json({ ok: true, repetido: true })
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
      if (String(eEvento.code) === '23505') return res.status(200).json({ ok: true, repetido: true })
      throw new Error(eEvento.message)
    }

    // 2 · Lo que no es para nosotros se acepta y no escribe nada. **200 a propósito**: el emisor no
    // puede arreglar reintentando que su tipo de evento no nos interese.
    if (!norm.ok) return res.status(200).json({ ok: true, ignorado: norm.motivo })

    // 3 · El cruce con el espejo, antes de escribir la OC para que la foto viaje con ella.
    const espejo = await cruzarConElEspejo(norm.store, norm.lineas)
    const lineas = norm.lineas.map((l) => {
      if (!espejo) return l
      const pid = (l.sku && espejo.porSku.get(l.sku)) || (l.codigo_barras && espejo.porBarra.get(l.codigo_barras)) || null
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

    return res.status(200).json({ ok: true, oc: oc.id, lineas: lineas.length, agenda, prm })
  } catch (e) {
    // Queda anotado para poder reprocesarlo, y se contesta 5xx **a propósito**: es el código que
    // hace que el emisor reintente, y sus reintentos cubren casi 17 horas.
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
    return res.status(500).json({ ok: false, error: 'no se pudo procesar' })
  }
}
