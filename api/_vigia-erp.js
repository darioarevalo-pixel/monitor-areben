// El vigía de la PUERTA DEL ERP (erp.arebensrl.com), mirado desde el monitor. Qué decide y por qué: lib/vigia-erp.core.js.
//
//   GET ?recurso=vigia-erp&tarea=mirar   → { ok, sana, detalle, mail, enviado }   (el cron de vercel.json, cada 15 min)
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js`. Sin sesión: lo llama el cron de Vercel y se defiende con
// `CRON_SECRET`, igual que el correo diario de la Agenda. El estado vive en `vigia_puerta` (sql/002, base de BDI) y el
// mail sale por Mailer (`pedirAvisoInterno`) a `MAIL_VIGIA_A` (casillas @arebensrl.com, separadas por coma).
import { createClient } from '@supabase/supabase-js'
import { cfgMaestra } from './_canje-token.js'
import { pedirAvisoInterno } from '../lib/mailer/aviso.core.js'
import { armarMail, decidir, ESPERA_MS, estadoAGuardar, leerSonda, PUERTA_ERP } from '../lib/vigia-erp.core.js'

export default async function handler(req, res) {
  if (req.method !== 'GET' || String((req.query || {}).tarea || '') !== 'mirar') {
    return res.status(400).json({ error: 'Sólo GET con tarea=mirar (lo llama el cron).' })
  }
  const esperado = process.env.CRON_SECRET || ''
  if (!esperado) return res.status(503).json({ error: 'El vigía no está configurado (CRON_SECRET).' })
  if (String(req.headers.authorization || '') !== `Bearer ${esperado}`) return res.status(401).json({ error: 'no autorizado' })

  const cfg = cfgMaestra()
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' })
  const sb = createClient(cfg.url, cfg.key)

  let status = null
  let error = null
  try {
    status = (await fetch(PUERTA_ERP, { signal: AbortSignal.timeout(ESPERA_MS), redirect: 'manual' })).status
  } catch (e) {
    error = e && e.name === 'TimeoutError' ? `más de ${ESPERA_MS / 1000} s sin respuesta` : String((e && e.message) || e)
  }
  const sonda = leerSonda(status, error)

  const { data: fila, error: eLeer } = await sb.from('vigia_puerta').select('fallas_seguidas, caida_desde, avisado').eq('puerta', 'erp').maybeSingle()
  if (eLeer) return res.status(500).json({ error: `vigia_puerta: ${eLeer.message}` })
  const decision = decidir(fila, sonda, new Date())

  let envio = null
  if (decision.mail) {
    const para = String(process.env.MAIL_VIGIA_A || '').split(',').map((x) => x.trim()).filter(Boolean)
    envio = para.length
      ? await pedirAvisoInterno({ url: process.env.MAILER_URL, key: process.env.MAILER_TICKET_KEY, fetch }, { para, ...armarMail(decision.mail, { caidaDesde: decision.caidaDesde, detalle: sonda.detalle }) })
      : { ok: false, motivo: 'Falta MAIL_VIGIA_A en Vercel.' }
  }

  const guardar = estadoAGuardar(decision, !!(envio && envio.ok))
  const { error: eGuardar } = await sb.from('vigia_puerta').upsert({ puerta: 'erp', ...guardar, ultima_sonda: new Date().toISOString(), ultimo_detalle: sonda.detalle })
  if (eGuardar) return res.status(500).json({ error: `vigia_puerta: ${eGuardar.message}` })
  // Un mail que tocaba y ⛔ salió contesta 502: queda en los logs de Vercel y el cron siguiente lo reintenta.
  if (envio && !envio.ok) return res.status(502).json({ ok: false, sana: sonda.sana, detalle: sonda.detalle, mail: decision.mail, error: envio.motivo || 'Mailer no está configurado.' })
  return res.status(200).json({ ok: true, sana: sonda.sana, detalle: sonda.detalle, mail: decision.mail, enviado: envio ? envio.ok : null })
}
