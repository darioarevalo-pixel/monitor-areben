// El receptor del webhook `oc.confirmada` del sistema de Ingresos.
//
//   POST /api/erp/ingreso                  ← la dirección PROPIA DEL ERP (20-oct): es la que se le pasa
//                                             al emisor. Es una reescritura de `vercel.json` a la de abajo.
//   POST /api/datos?recurso=oc-webhook     ← la de siempre: la que el emisor tenía cargada. Sigue andando.
//
// Archivo `_`: NO es una ruta, entra por `api/datos.js`. (El tope de 12 funciones era del plan
// Hobby; desde el 17-ago el proyecto está en Pro.)
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
import { verificarFirma } from '../lib/recepciones/webhook.core.js'
import { cfgDelMonitor, LIMITE_CRUDO } from './_recepciones-base.js'
import { procesarEvento } from './_recepciones-procesar.js'

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

  const tsEnviado = Number(h['webhook-timestamp'])
  const enviadoEn = Number.isFinite(tsEnviado) ? new Date(tsEnviado * 1000).toISOString() : null

  try {
    const r = await procesarEvento({ sb, idEvento, payload, enviadoEn })
    if (r.repetido) return res.status(200).json({ ok: true, repetido: true })
    if (r.ignorado) return res.status(200).json({ ok: true, ignorado: r.ignorado })
    return res.status(200).json({ ok: true, oc: r.oc, lineas: r.lineas, agenda: r.agenda, prm: r.prm })
  } catch {
    // Quedó anotado para poder reprocesarlo, y se contesta 5xx **a propósito**: es el código que
    // hace que el emisor reintente, y sus reintentos cubren casi 17 horas.
    return res.status(500).json({ ok: false, error: 'no se pudo procesar' })
  }
}
