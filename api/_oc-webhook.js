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

    return res.status(200).json({ ok: true, oc: oc.id, lineas: lineas.length })
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
