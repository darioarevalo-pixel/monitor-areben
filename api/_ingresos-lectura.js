// Lee las OC de la API de Ingresos y las guarda como si hubiera llegado el aviso. Qué traduce y por qué: lib/recepciones/lectura.core.js.
//
//   GET ?recurso=ingresos-lectura&tarea=leer         → { ok, marcas } (el cron de vercel.json, cada hora: Bruno, 3-nov, «no hay ingresos todos los días»)
//   GET ?recurso=ingresos-lectura&tarea=leer&seco=1  → lo mismo, sin escribir: dice qué leería
//   GET ?recurso=ingresos-lectura&tarea=costos         → costo y tipo de ingreso (el cron de cada hora; motor `lib/conexion.mjs`). Los costos se
//                                                         escriben sólo desde el corte de la marca (`costoIngresosManda`)
//   GET ?recurso=ingresos-lectura&tarea=costos&seco=1  → qué cargaría, sin escribir nada: es lo que se mira antes de un corte
//
// Cada vuelta anota cómo salió en `conexion_lectura` (motor sql/074): de ahí avisa el vigía si el token se rechaza, vence o no se lee.
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js`. Sin sesión: lo llama el cron y se defiende con `CRON_SECRET`.
// 🔴 El token va sólo en la cabecera y ⛔ se sigue una redirección: se lo llevaría a otro host.
import { createClient } from '@supabase/supabase-js'
import { cfgDelMonitor } from './_recepciones-base.js'
import { procesarEvento } from './_recepciones-procesar.js'
import { aProcesar, aReleer, contadasDe, desdeDe, eventoDeOc, idDeEvento, idDeRelectura, mismaForma, RELECTURA_DIAS } from '../lib/recepciones/lectura.core.js'
import { normalizarEvento } from '../lib/recepciones/webhook.core.js'
import { configPg } from '../lib/pg.core.js'

const BASE = 'https://ingreso2.arebensrl.com/api/ext/v1'
const MARCAS = [
  { store: 'zattia', variable: 'INGRESOS_TOKEN_ZATTIA' },
  { store: 'bdi', variable: 'INGRESOS_TOKEN_BDI' },
]
const ESPERA_MS = 10_000
/**
 * La función tiene 30 s: lo que no entre lo toma la vuelta siguiente, porque se procesa de la más vieja a la más nueva y la hora de lectura es la de la última guardada.
 * 🔴 Con la lectura cada hora pueden llegar varias juntas, y ⛔ se pierde ninguna: sólo tardan una vuelta más (`corto: true`).
 */
const PLAZO_MS = 20_000
const POR_PAGINA = 200
/** La vuelta de costos es más larga: cada una recorre el catálogo entero. Lo que ⛔ entre se repite en la hora siguiente. */
const PLAZO_COSTOS_MS = 25_000
const PG_DE_MARCA = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }

async function pedir(ruta, token) {
  const r = await fetch(`${BASE}${ruta}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(ESPERA_MS),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'AreBenERP/1.0' },
  })
  const cuerpo = await r.json().catch(() => null)
  if (!r.ok) throw Object.assign(new Error(`Ingresos contestó ${r.status}${cuerpo && cuerpo.code ? ` ${cuerpo.code}` : ''}`), { status: r.status, code: cuerpo && cuerpo.code })
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

  for (const resumen of seco ? [] : pendientes) {
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

  // 🔴 Lo que contó menos de lo pedido se vuelve a mirar: BDI confirma antes de contar y `updated_at` ⛔ siempre se mueve (OC-1580: 0 guardadas, 14.185 en la API).
  // Si lo contado es lo mismo, ⛔ se toca nada. Y el libro decide qué hacer: lo de antes de su apertura o del corte de la línea ⛔ lo mueve.
  const lista = await aMirarDeNuevo(sb, store, new Set(candidatas.map((oc) => Number(oc.id))))
  salida.releidas = []
  for (const g of aReleer(lista)) {
    if (Date.now() > hasta) { salida.corto = true; break }
    let oc
    try {
      oc = await pedir(`/purchase-orders/${g.oc_id}`, token)
    } catch (e) {
      // Una OC que ya ⛔ está en Ingresos ⛔ traba al resto: queda como estaba.
      if (e?.status === 404) continue
      throw e
    }
    if (oc.business?.slug !== store) throw new Error(`el token de ${store} leyó una OC de ${oc.business?.slug}`)
    if (contadasDe(oc) === Number(g.unidades_contadas ?? 0)) continue
    const idEvento = idDeRelectura(store, oc)
    salida.releidas.push({ oc: oc.code, antes: Number(g.unidades_contadas ?? 0), ahora: contadasDe(oc) })
    if (seco) continue
    const payload = eventoDeOc(oc)
    const norm = normalizarEvento(payload)
    const guardadas = await renglonesGuardados(sb, store, oc.id)
    if (guardadas.length && norm.ok && !mismaForma(guardadas, norm.lineas)) {
      await anotarFrenada(sb, { store, oc, idEvento, payload, motivo: `cambió de forma: ${guardadas.length} renglones guardados, ${norm.lineas.length} en Ingresos o con otro SKU. Se deja como estaba, para no duplicar stock.` })
      salida.frenadas.push({ oc: oc.code })
      continue
    }
    await procesarEvento({ sb, idEvento, payload, enviadoEn: oc.updated_at })
  }
  return salida
}

/** Lo guardado de esa marca en la ventana de relectura, sin lo que esta vuelta ya vio. */
async function aMirarDeNuevo(sb, store, vistas) {
  const desde = new Date(Date.now() - RELECTURA_DIAS * 864e5).toISOString()
  const { data, error } = await sb.from('recepcion_oc').select('oc_id, unidades_pedidas, unidades_contadas, confirmada_at').eq('store', store).gte('confirmada_at', desde)
  if (error) throw new Error(`recepcion_oc: ${error.message}`)
  return (data || []).filter((o) => !vistas.has(Number(o.oc_id)))
}

/**
 * Las OC que cambiaron y ⛔ se guardaron (`mismaForma`), de los últimos días: el aviso. Se relee cada vuelta porque la lectura se anota entera: sin esto la alerta se cerraría a los 5 min.
 * ⛔ se pudo cambiar la clave a id de línea sin riesgo de duplicar (ver el PENDIENTES): queda frenada, y alguien la mira.
 */
const DIAS_AVISO_FRENADA = 14
async function frenadasDe(sb, store) {
  const desde = new Date(Date.now() - DIAS_AVISO_FRENADA * 864e5).toISOString()
  const { data, error } = await sb.from('recepcion_evento').select('oc_id, payload').eq('store', store).eq('estado', 'ignorado').like('error', 'cambió de forma%').gte('recibido_en', desde)
  if (error) throw new Error(`recepcion_evento: ${error.message}`)
  return [...new Set((data || []).map((e) => e.payload?.data?.orden_compra?.label ?? `#${e.oc_id}`))]
}

/** La base del motor de una marca. Sin la variable ⇒ `null`. */
async function abrirBase(marca) {
  const conexion = process.env[PG_DE_MARCA[marca]]
  if (!conexion) return null
  const { default: pg } = await import('pg')
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: 5000, statement_timeout: 15000 })
  await db.connect()
  return db
}

/** Anota cómo salió la lectura de las OC y hasta cuándo sirve el token. 🔴 Un tropiezo acá ⛔ afecta a la lectura: lo que importa ya se guardó. */
async function anotarLaLectura({ store, token, error, frenadas = [] }) {
  let control
  try {
    control = await abrirBase('bdi')
    if (!control) return
    const { anotarLectura, mirarToken } = await import('../motor/conexion.mjs')
    let falla = error
    let vence
    try { vence = (await mirarToken(store, { token })).vence } catch (e) { falla = falla || e }
    await anotarLectura(control, { sistema: 'ingresos', negocio: store, ok: !falla, status: falla ? falla.status ?? null : 200, code: falla ? falla.code ?? 'sin_respuesta' : frenadas.length ? 'oc_frenada' : null, detalle: !falla && frenadas.length ? `Sin guardar: ${frenadas.join(', ')}. Cambiaron en Ingresos: revisar a mano.` : null, vence })
  } catch (e) {
    if (e?.code !== '42P01') console.error(`[ingresos-lectura] ${store}: no se pudo anotar la lectura (${e?.code ?? 'sin código'})`)
  } finally {
    if (control) await control.end().catch(() => {})
  }
}

/** Costo y tipo de ingreso de una marca: el corte decide si se escribe. */
async function costosDeMarca({ store, token, seco, hasta }) {
  const control = await abrirBase('bdi')
  if (!control) return { error: 'falta la conexión del motor' }
  const db = store === 'bdi' ? control : await abrirBase(store)
  try {
    if (!db) return { error: 'falta la conexión del motor' }
    const [{ correrCostos }, { costoIngresosManda, leerCortes }] = await Promise.all([import('../motor/conexion.mjs'), import('../motor/llave-corte.mjs')])
    const manda = costoIngresosManda(store, await leerCortes(db), process.env)
    return await correrCostos({ control, db, negocio: store, token, manda, seco, hasta })
  } finally {
    await control.end().catch(() => {})
    if (db && db !== control) await db.end().catch(() => {})
  }
}

export default async function handler(req, res) {
  const tarea = String((req.query || {}).tarea || '')
  if (req.method !== 'GET' || !['leer', 'costos'].includes(tarea)) {
    return res.status(400).json({ error: 'Sólo GET con tarea=leer o tarea=costos (lo llama el cron).' })
  }
  const esperado = process.env.CRON_SECRET || ''
  if (!esperado) return res.status(503).json({ error: 'La lectura no está configurada (CRON_SECRET).' })
  if (String(req.headers.authorization || '') !== `Bearer ${esperado}`) return res.status(401).json({ error: 'no autorizado' })

  const seco = String((req.query || {}).seco || '') === '1'
  if (tarea === 'costos') {
    const hastaCostos = Date.now() + PLAZO_COSTOS_MS
    const marcas = {}
    let fallo = false
    for (const { store, variable } of MARCAS) {
      const token = process.env[variable]
      if (!token) { marcas[store] = { sinToken: true }; continue }
      try {
        marcas[store] = await costosDeMarca({ store, token, seco, hasta: hastaCostos })
      } catch (e) {
        marcas[store] = { error: e?.code ?? 'falló la base' }
      }
      if (marcas[store].error) { fallo = true; console.error(`[ingresos-lectura] costos ${store}: ${marcas[store].error}`) }
    }
    return res.status(fallo ? 502 : 200).json({ ok: !fallo, seco, marcas })
  }

  const cfg = cfgDelMonitor()
  if (!cfg.url || !cfg.key) return res.status(503).json({ error: 'sin credenciales de base' })
  const sb = createClient(cfg.url, cfg.key)
  const hasta = Date.now() + PLAZO_MS

  const marcas = {}
  let fallo = false
  for (const { store, variable } of MARCAS) {
    const token = process.env[variable]
    if (!token) { marcas[store] = { sinToken: true }; continue }
    try {
      marcas[store] = await leerMarca({ sb, store, token, seco, hasta })
      if (!seco) await anotarLaLectura({ store, token, frenadas: await frenadasDe(sb, store) })
    } catch (e) {
      fallo = true
      marcas[store] = { error: String((e && e.message) || e).slice(0, 300) }
      console.error(`[ingresos-lectura] ${store}: ${marcas[store].error}`)
      if (!seco) await anotarLaLectura({ store, token, error: e })
    }
  }
  // Una marca caída contesta 502: queda en los logs de Vercel, y la otra igual se leyó.
  return res.status(fallo ? 502 : 200).json({ ok: !fallo, seco, marcas })
}
