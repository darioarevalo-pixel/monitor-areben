// Lee las OC de la API de Ingresos y las guarda como si hubiera llegado el aviso. Qué traduce y por qué: lib/recepciones/lectura.core.js.
//
//   GET ?recurso=ingresos-lectura&tarea=leer         → { ok, marcas } (el cron de vercel.json)
//   GET ?recurso=ingresos-lectura&tarea=leer&seco=1  → lo mismo, sin escribir: dice qué leería
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js`. Sin sesión: lo llama el cron y se defiende con `CRON_SECRET`.
// 🔴 El token va sólo en la cabecera y ⛔ se sigue una redirección: se lo llevaría a otro host.
import { createClient } from '@supabase/supabase-js'
import { cfgDelMonitor } from './_recepciones-base.js'
import { procesarEvento } from './_recepciones-procesar.js'
import { aProcesar, desdeDe, eventoDeOc, idDeEvento, mismaForma } from '../lib/recepciones/lectura.core.js'
import { normalizarEvento } from '../lib/recepciones/webhook.core.js'

const BASE = 'https://ingreso2.arebensrl.com/api/ext/v1'
const MARCAS = [
  { store: 'zattia', variable: 'INGRESOS_TOKEN_ZATTIA' },
  { store: 'bdi', variable: 'INGRESOS_TOKEN_BDI' },
]
const ESPERA_MS = 10_000
/** La función tiene 30 s: lo que no entre lo toma la vuelta siguiente, porque se procesa de la más vieja a la más nueva. */
const PLAZO_MS = 20_000
const POR_PAGINA = 200

async function pedir(ruta, token) {
  const r = await fetch(`${BASE}${ruta}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(ESPERA_MS),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'AreBenERP/1.0' },
  })
  const cuerpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`Ingresos contestó ${r.status}${cuerpo && cuerpo.code ? ` ${cuerpo.code}` : ''}`)
  return cuerpo
}

/** Todo el listado desde ese instante. */
async function listar(desde, token) {
  const items = []
  for (let offset = 0; ; offset += POR_PAGINA) {
    const p = await pedir(`/purchase-orders?updated_since=${encodeURIComponent(desde)}&limit=${POR_PAGINA}&offset=${offset}`, token)
    items.push(...(p.items || []))
    if (offset + POR_PAGINA >= (p.total || 0)) return items
  }
}

async function ultimoLeido(sb, store) {
  const { data, error } = await sb.from('recepcion_evento').select('enviado_en')
    .like('webhook_id', `api:${store}:%`).eq('estado', 'procesado')
    .order('enviado_en', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`recepcion_evento: ${error.message}`)
  return data ? data.enviado_en : null
}

async function yaProcesados(sb, ids) {
  if (!ids.length) return new Set()
  const { data, error } = await sb.from('recepcion_evento').select('webhook_id, estado').in('webhook_id', ids)
  if (error) throw new Error(`recepcion_evento: ${error.message}`)
  return new Set((data || []).filter((f) => f.estado !== 'error').map((f) => f.webhook_id))
}

async function renglonesGuardados(sb, store, ocId) {
  const { data, error } = await sb.from('recepcion_linea').select('sku, codigo_barras').eq('oc_ref', `${store}:${ocId}`).order('orden')
  if (error) throw new Error(`recepcion_linea: ${error.message}`)
  return data || []
}

/** La OC que cambió de forma ⛔ se guarda (ver `mismaForma`): queda anotada, y como `ignorado` ⛔ se vuelve a pedir. */
async function anotarFrenada(sb, { store, oc, idEvento, payload, motivo }) {
  const { error } = await sb.from('recepcion_evento').upsert({
    webhook_id: idEvento, tipo: payload.type, store, oc_id: oc.id, payload, estado: 'ignorado', error: motivo,
    enviado_en: oc.updated_at, recibido_en: new Date().toISOString(),
  }, { onConflict: 'webhook_id' })
  if (error) throw new Error(`recepcion_evento: ${error.message}`)
  console.error(`[ingresos-lectura] ${store} ${oc.code}: ${motivo}`)
}

async function leerMarca({ sb, store, token, seco, hasta }) {
  const desde = desdeDe(await ultimoLeido(sb, store))
  const candidatas = aProcesar(await listar(desde, token))
  const ya = await yaProcesados(sb, candidatas.map((oc) => idDeEvento(store, oc)))
  const pendientes = candidatas.filter((oc) => !ya.has(idDeEvento(store, oc)))
  const salida = { desde, vistas: candidatas.length, pendientes: pendientes.map((oc) => oc.code), guardadas: [], frenadas: [] }
  if (seco) return salida

  for (const resumen of pendientes) {
    if (Date.now() > hasta) { salida.corto = true; break }
    const oc = await pedir(`/purchase-orders/${resumen.id}`, token)
    // 🔴 Un token de otro negocio guardaría la OC en la marca equivocada.
    if (oc.business?.slug !== store) throw new Error(`el token de ${store} leyó una OC de ${oc.business?.slug}`)
    const idEvento = idDeEvento(store, oc)
    const payload = eventoDeOc(oc)
    const guardadas = await renglonesGuardados(sb, store, oc.id)
    const norm = normalizarEvento(payload)
    if (guardadas.length && norm.ok && !mismaForma(guardadas, norm.lineas)) {
      const motivo = `cambió de forma: ${guardadas.length} renglones guardados, ${norm.lineas.length} en Ingresos o con otro SKU. Se deja como estaba, para no duplicar stock.`
      await anotarFrenada(sb, { store, oc, idEvento, payload, motivo })
      salida.frenadas.push({ oc: oc.code, motivo })
      continue
    }
    // Una falla corta la marca: seguir adelantaría la hora de lectura y esta OC ⛔ se volvería a pedir.
    const r = await procesarEvento({ sb, idEvento, payload, enviadoEn: oc.updated_at })
    salida.guardadas.push({ oc: oc.code, ...r })
  }
  return salida
}

export default async function handler(req, res) {
  if (req.method !== 'GET' || String((req.query || {}).tarea || '') !== 'leer') {
    return res.status(400).json({ error: 'Sólo GET con tarea=leer (lo llama el cron).' })
  }
  const esperado = process.env.CRON_SECRET || ''
  if (!esperado) return res.status(503).json({ error: 'La lectura no está configurada (CRON_SECRET).' })
  if (String(req.headers.authorization || '') !== `Bearer ${esperado}`) return res.status(401).json({ error: 'no autorizado' })

  const cfg = cfgDelMonitor()
  if (!cfg.url || !cfg.key) return res.status(503).json({ error: 'sin credenciales de base' })
  const sb = createClient(cfg.url, cfg.key)
  const seco = String((req.query || {}).seco || '') === '1'
  const hasta = Date.now() + PLAZO_MS

  const marcas = {}
  let fallo = false
  for (const { store, variable } of MARCAS) {
    const token = process.env[variable]
    if (!token) { marcas[store] = { sinToken: true }; continue }
    try {
      marcas[store] = await leerMarca({ sb, store, token, seco, hasta })
    } catch (e) {
      fallo = true
      marcas[store] = { error: String((e && e.message) || e).slice(0, 300) }
      console.error(`[ingresos-lectura] ${store}: ${marcas[store].error}`)
    }
  }
  // Una marca caída contesta 502: queda en los logs de Vercel, y la otra igual se leyó.
  return res.status(fallo ? 502 : 200).json({ ok: !fallo, seco, marcas })
}
