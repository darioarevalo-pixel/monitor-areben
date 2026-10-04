// Caja — el POS propio del local de Zattia (plan del 3-oct-2026, F2). La venta se cobra en el
// monitor y viaja a Gestión Nube con su número, su cuenta de cobro y bajando el stock.
//
//   GET  ?recurso=caja&action=config              → { reglas, politica_cambio } (la siembra si ⛔ hay)
//   GET  ?recurso=caja&action=referencias         → { cuentas: [{ id, nombre, regla }] } — SIN saldos
//   GET  ?recurso=caja&action=producto&codigo=…   → la variante del código + stock Local / Depósito
//   GET  ?recurso=caja&action=pendientes          → las ventas que ⛔ llegaron a GN
//   POST ?recurso=caja  { action: 'confirmar', id, items, pagos, total, email?, pagaCon? }
//   POST ?recurso=caja  { action: 'reintentar', id }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=caja` (12 funciones de Hobby).
//
// 🔑 EL DINERO SE CALCULA ACÁ OTRA VEZ. La pantalla manda renglones y pagos, y el servidor rearma el
// cobro con `lib/caja/core.core.js` —el mismo que usa la pantalla— y las reglas de `caja_config`. Si
// el total de la pantalla ⛔ coincide, 409 y ⛔ se manda nada: la cajera vio un número y GN tendría otro.
//
// 🔑 LA VENTA SE GUARDA ANTES DE MANDARLA, y su `id` es el `integration_id` de GN ⇒ reintentar ⛔
// duplica (GN contesta 409, que es «ya está»: ver `lib/caja/gn.core.js`). Reintentar manda el
// `payload` guardado tal cual: ⛔ se rearma con las reglas de hoy.
//
// 📌 EL PRECIO lo pone la pantalla: es el MISMO de la etiqueta (`construirPrecios`, lib/etiquetas/
// core.ts: TN con su oferta vigente, si no `retailer_price`), y la cajera puede cambiarlo como en el
// POS de GN. Medido el 3-oct sobre 15 renglones de Mi Local: 11 cobrados al precio de TN, 4 a un
// número redondo tipeado a mano. `retailer_price` solo ⛔ sirve: en feria cobra el de antes.
// ⛔ `price_list_id`: GN lo ignora en el POST (#30046).
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { puedeVerAlguna } from '../lib/permisos.core.js'
import { cfgDeMarca } from './_recepciones-base.js'
import { GN_BASE, GN_TOKENS, gnFetch } from './_gn.js'
import { filasVivas } from '../lib/gn/inventario-vivo.core.js'
import { MODO_LOCAL_ZATTIA, REGLAS_INICIALES, armarVentaGN, cobro, reglaDeCuenta, renglones } from '../lib/caja/core.core.js'
import { fechaLocal, normCode, sinSecretos } from '../lib/caja/gn.core.js'
import { COLUMNAS_VENTA as COLUMNAS, enviarVenta } from '../lib/caja/enviar.core.js'

const STORE = 'zattia'
const LOCAL = 11780
const DEPOSITO = 18210
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** El token que escribe ventas. `GN_TOKEN_VENTAS` es el de `crear-venta.js`; el de Zattia también puede (medido el 3-oct). */
const tokenGN = () => process.env.GN_TOKEN_VENTAS || process.env.GN_TOKEN_ZATTIA
const cabeceras = (token) => ({ Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' })

/** Las cuentas de GN, cacheadas por instancia: cambian una vez por año. */
let cacheCuentas = null

async function leerJson(r) {
  const t = await r.text()
  try { return JSON.parse(t) } catch { return t.slice(0, 300) }
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return

  const store = String(req.query.store || (req.body && req.body.store) || STORE).toLowerCase()
  if (store !== STORE) return res.status(400).json({ error: 'La Caja es sólo de Zattia.' })
  // 🔴 `puedeVerAlguna` y ⛔ `puedeVer` pelado: es el gate del servidor (ver lib/permisos.core.js).
  if (!puedeVerAlguna(perfil, store, ['caja'])) return res.status(403).json({ error: 'No tenés acceso a la Caja.' })

  const cfg = cfgDeMarca(store)
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase de Zattia.' })
  const sb = createClient(cfg.url, cfg.key)
  const token = tokenGN()
  const accion = String(req.query.action || (req.body && req.body.action) || '')

  /** La configuración del cobro. La primera vez se siembra con lo que muestra el POS de GN. */
  async function leerConfig() {
    const { data, error } = await sb.from('caja_config').select('reglas, politica_cambio').eq('store', store).maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return data
    const fila = { store, reglas: REGLAS_INICIALES, politica_cambio: null, actualizado_por: perfil.name || null }
    const ins = await sb.from('caja_config').upsert(fila, { onConflict: 'store', ignoreDuplicates: true })
    if (ins.error) throw new Error(ins.error.message)
    return { reglas: REGLAS_INICIALES, politica_cambio: null }
  }

  const enviar = (fila) => enviarVenta(fila, { sb, gnFetch, base: GN_BASE, token })

  try {
    if (req.method === 'GET') {
      if (accion === 'config') return res.status(200).json(await leerConfig())

      if (accion === 'referencias') {
        if (!cacheCuentas) {
          const resp = await gnFetch(`${GN_BASE}/ventas/referencias`, { headers: cabeceras(token) }, 1)
          if (!resp.ok) return res.status(502).json({ error: `Gestión Nube contestó ${resp.status} al pedir las cuentas.` })
          const d = await leerJson(resp)
          // 🔴 Lista blanca: `cuentas` trae el SALDO de cada cuenta (`balance`), que ⛔ va al navegador.
          cacheCuentas = (d && Array.isArray(d.cuentas) ? d.cuentas : []).map(c => ({ id: Number(c.id), nombre: String(c.name || '') }))
        }
        const { reglas } = await leerConfig()
        const cuentas = cacheCuentas.map(c => {
          let regla = null
          try { regla = reglaDeCuenta(c.id, reglas) } catch { /* sin regla o con recargo: la Caja ⛔ la cobra */ }
          return { ...c, regla }
        })
        return res.status(200).json({ cuentas })
      }

      if (accion === 'producto') {
        const codigo = String(req.query.codigo || '').trim()
        if (!codigo) return res.status(400).json({ error: 'Falta el código.' })
        const variantes = await variantesDelCodigo(sb, codigo)
        if (!variantes.length) return res.status(404).json({ error: `El código ${codigo} ⛔ está en el inventario.` })
        if (variantes.length > 1) return res.status(200).json({ candidatos: variantes.map(v => v.variante) })
        const [{ variante, espejo }] = variantes
        let stock
        try {
          // 🔴 Con el token de LECTURA de Zattia, ⛔ el de ventas: en producción `GN_TOKEN_VENTAS` caía
          // siempre al espejo (4-oct), y con éste `inventario/{id}` contesta 200 (es el de los Conteos).
          const resp = await gnFetch(`${GN_BASE}/inventario/${variante.product_id}`, { headers: cabeceras(GN_TOKENS.zattia || token) }, 1)
          if (!resp.ok) throw new Error(`Gestión Nube contestó ${resp.status}`)
          const filas = filasVivas(await leerJson(resp), [LOCAL, DEPOSITO]).filter(f => Number(f.size_id) === variante.size_id)
          const de = (s) => filas.filter(f => f.store_id === s).reduce((t, f) => t + Number(f.available_quantity || 0), 0)
          stock = { local: de(LOCAL), deposito: de(DEPOSITO), fuente: 'vivo' }
        } catch (e) {
          // GN cortó (el tope de 60/min es compartido): el stock de anoche, y la pantalla lo dice. El
          // motivo viaja: un catch callado escondió el 4-oct que el token ⛔ podía leer inventario.
          stock = { ...espejo, fuente: 'espejo', motivo: sinSecretos(e && e.message) }
        }
        return res.status(200).json({ variante, stock })
      }

      if (accion === 'pendientes') {
        const { data, error } = await sb.from('caja_venta').select(COLUMNAS)
          .eq('store', store).neq('estado', 'en_gn').order('creada_en', { ascending: true }).limit(100)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ventas: data || [] })
      }
      return res.status(400).json({ error: 'action inválida (config, referencias, producto, pendientes)' })
    }

    if (req.method === 'POST') {
      const b = req.body || {}
      if (!token) return res.status(500).json({ error: 'Falta el token de Gestión Nube para escribir ventas.' })

      if (accion === 'confirmar') {
        const id = String(b.id || '')
        if (!UUID.test(id)) return res.status(400).json({ error: 'id inválido: lo genera la pantalla (uuid).' })
        const email = b.email == null || b.email === '' ? null : String(b.email).trim().toLowerCase()
        if (email && !MAIL.test(email)) return res.status(400).json({ error: 'El mail ⛔ es válido.' })

        // Idempotente: si la venta ya se guardó (doble click, reintento de la pantalla) se manda la
        // guardada y ⛔ se rearma.
        const previa = await sb.from('caja_venta').select(COLUMNAS_ENVIO).eq('id', id).maybeSingle()
        if (previa.error) throw new Error(previa.error.message)
        if (previa.data) {
          if (previa.data.estado === 'en_gn') return res.status(200).json({ venta: sinPayload(previa.data) })
          const out = await enviar(previa.data)
          return res.status(200).json(out)
        }

        const { reglas } = await leerConfig()
        let filas, c, payload
        try {
          filas = renglones(b.items)
          c = cobro({ filas, pagos: b.pagos, reglas })
          payload = armarVentaGN({ filas, pagos: c.pagos, modoLocal: MODO_LOCAL_ZATTIA, integrationId: id, fecha: fechaLocal(new Date()) })
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
        if (Number(b.total) !== c.total) {
          return res.status(409).json({ error: `El total de la pantalla ($${b.total}) ⛔ coincide con el del servidor ($${c.total}). Recargá la Caja: puede haber cambiado un descuento.`, total: c.total })
        }
        const pagaCon = b.pagaCon == null || b.pagaCon === '' ? null : Number(b.pagaCon)
        const fila = {
          id, store, estado: 'borrador', renglones: filas, pagos: c.pagos, subtotal: c.subtotal, total: c.total,
          paga_con: Number.isFinite(pagaCon) ? pagaCon : null, email, payload, usuario: perfil.name || null,
        }
        const ins = await sb.from('caja_venta').insert(fila).select(COLUMNAS_ENVIO).single()
        if (ins.error && ins.error.code === '23505') {
          // Otro «confirmar» con el mismo id la guardó entre la lectura y el insert: ése la manda.
          return res.status(409).json({ error: 'La venta ya se está mandando. Mirá Pendientes en unos segundos.' })
        }
        if (ins.error) throw new Error(ins.error.message)
        return res.status(200).json(await enviar(ins.data))
      }

      if (accion === 'reintentar') {
        const id = String(b.id || '')
        if (!UUID.test(id)) return res.status(400).json({ error: 'id inválido.' })
        const { data, error } = await sb.from('caja_venta').select(COLUMNAS_ENVIO).eq('id', id).eq('store', store).maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) return res.status(404).json({ error: 'La venta ⛔ existe.' })
        if (data.estado === 'en_gn') return res.status(200).json({ venta: sinPayload(data) })
        return res.status(200).json(await enviar(data))
      }
      return res.status(400).json({ error: 'action inválida (confirmar, reintentar)' })
    }
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    return res.status(500).json({ error: sinSecretos(e && e.message) })
  }
}

const COLUMNAS_ENVIO = `${COLUMNAS}, payload`
const sinPayload = ({ payload: _p, ...v }) => v

/**
 * Las variantes del espejo (`inventario`) que corresponden al código del lector: barcode exacto,
 * barcode normalizado, y SKU — el mismo orden que el chequeo de exhibición (`coincidencias`).
 * Devuelve una entrada por variante (product_id + size_id), con su stock de anoche por si GN ⛔ contesta.
 */
async function variantesDelCodigo(sb, codigo) {
  const COLS = 'product_id, product_name, size_id, size_name, sku, barcode, available_quantity, store_name'
  const nc = normCode(codigo)
  const intentos = [
    () => sb.from('inventario').select(COLS).eq('barcode', codigo),
    () => sb.from('inventario').select(COLS).eq('barcode', nc),
    () => sb.from('inventario').select(COLS).ilike('sku', nc.replace(/[\\%_]/g, (m) => `\\${m}`)),
  ]
  for (const q of intentos) {
    const { data, error } = await q().limit(50)
    if (error) throw new Error(error.message)
    if (data && data.length) return agrupar(data)
  }
  return []
}

function agrupar(filas) {
  const por = new Map()
  for (const f of filas) {
    const k = `${f.product_id}_${f.size_id}`
    if (!por.has(k)) {
      por.set(k, {
        variante: { product_id: Number(f.product_id), size_id: Number(f.size_id), product_name: f.product_name, size_name: f.size_name, sku: f.sku, barcode: f.barcode },
        espejo: { local: 0, deposito: 0 },
      })
    }
    const nombre = String(f.store_name || '').trim().toLowerCase()
    const e = por.get(k).espejo
    if (nombre === 'local') e.local += Number(f.available_quantity || 0)
    else if (nombre.startsWith('deposito') || nombre.startsWith('depósito')) e.deposito += Number(f.available_quantity || 0)
  }
  return [...por.values()]
}
