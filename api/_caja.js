// Caja — el POS propio del local de Zattia (plan del 3-oct-2026, F2). La venta se cobra en el
// monitor y viaja a Gestión Nube con su número, su cuenta de cobro y bajando el stock.
//
//   GET  ?recurso=caja&action=config              → { reglas, politica_cambio } (la siembra si ⛔ hay)
//   GET  ?recurso=caja&action=referencias         → { cuentas: [{ id, nombre, regla }] } — SIN saldos
//   GET  ?recurso=caja&action=producto&codigo=…   → la variante del código + stock Local / Depósito;
//        si el código ⛔ está y tiene letras, busca por NOMBRE y talle ⇒ { candidatos, mas }
//   GET  ?recurso=caja&action=producto&product_id=…&size_id=…  → la variante elegida de la lista
//   GET  ?recurso=caja&action=buscar&q=…         → la lista MIENTRAS se escribe: { conStock, sinStock, masCon, masSin }
//        con el stock del local de anoche (⛔ pega a GN: tipear ⛔ gasta el cupo de 60/min)
//   GET  ?recurso=caja&action=pendientes          → las ventas que ⛔ llegaron a GN
//   POST ?recurso=caja  { action: 'confirmar', id, items, pagos, total, descuentoVenta, email?, pagaCon? }
//   POST ?recurso=caja  { action: 'reintentar', id }
//   POST ?recurso=caja  { action: 'cruzar', id, pago? }    → ¿llegó la transferencia? (F5) — `pago` lo elige la cajera
//   POST ?recurso=caja  { action: 'cancelar', id }         → una venta que esperaba la transferencia y ⛔ llegó
//   POST ?recurso=caja  { action: 'politica', texto }      → sólo admin: la política de cambio del ticket
//   POST ?recurso=caja  { action: 'bajadas', transferenciaA?, feria? } → sólo admin: a qué cuenta van las
//        transferencias y el modo feria (bajadas de línea: ⛔ las decide la cajera)
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
//
// 🔑 LA TRANSFERENCIA SE ESPERA (F5). Si el cobro tiene un pago en una cuenta con `esperaPago`
// (Transferencia), la venta queda en `esperando_pago` y ⛔ sale a GN ni se imprime: la pantalla pide
// `cruzar` cada pocos segundos, que lee Mercado Pago con la MISMA lectura de Pagos recibidos y busca
// el monto exacto (`cruzarTransferencia`). Recién con el pago encontrado la venta pasa a `borrador` y
// se manda. El id del pago de MP queda en la fila con índice ÚNICO: un pago confirma UNA venta.
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { esAdmin, puedeVerAlguna } from '../lib/permisos.core.js'
import { cfgDeMarca } from './_recepciones-base.js'
import { GN_BASE, GN_TOKENS, gnFetch } from './_gn.js'
import { filasVivas } from '../lib/gn/inventario-vivo.core.js'
import { MODO_LOCAL_ZATTIA, REGLAS_INICIALES, armarVentaGN, cobro, medioDeCuenta, montoAEsperar, nombreParaTicket, reglaDeCuenta, renglones } from '../lib/caja/core.core.js'
import { cruzarTransferencia } from '../lib/pagos-recibidos/core.core.js'
import { pagosDelDia, usosDe } from './_pagos-recibidos.js'
import { diaArgentino } from '../lib/envios/portal.core.js'
import { fechaLocal, normCode, sinSecretos } from '../lib/caja/gn.core.js'
import { filtrarPorNombre, listasPorStock, ordenParaLaBase, palabrasDeBusqueda } from '../lib/caja/buscar.core.js'
import { COLUMNAS_VENTA as COLUMNAS, enviarVenta } from '../lib/caja/enviar.core.js'
import { claveDe } from '../lib/ubicaciones-local/core.core.js'

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

  // El ticket por mail (F4): sin `MAILER_URL` o `MAILER_TICKET_KEY` la venta sale igual, sin mail.
  const mailer = { url: process.env.MAILER_URL, key: process.env.MAILER_TICKET_KEY, fetch }
  const enviar = (fila) => enviarVenta(fila, { sb, gnFetch, base: GN_BASE, token, mailer })

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
        const pid = Number(req.query.product_id), sid = Number(req.query.size_id)
        let variantes
        if (pid > 0 && sid > 0) {
          // La elegida de la lista: por la variante EXACTA. Re-escanear su barcode volvía a dar la lista
          // si el código lo comparten varias prendas.
          variantes = await variantesExactas(sb, pid, sid)
          if (!variantes.length) return res.status(404).json({ error: 'Esa prenda ⛔ está en el inventario.' })
        } else {
          if (!codigo) return res.status(400).json({ error: 'Falta el código.' })
          variantes = await variantesDelCodigo(sb, codigo)
          let mas = 0
          const palabras = palabrasDeBusqueda(codigo)
          if (!variantes.length && palabras.length) ({ grupos: variantes, mas } = await variantesDelNombre(sb, palabras))
          if (!variantes.length) return res.status(404).json({ error: palabras.length ? `Ninguna prenda se llama «${codigo}».` : `El código ${codigo} ⛔ está en el inventario.` })
          // Con la lista va el stock del LOCAL de anoche: alcanza para elegir; el vivo se lee al elegir.
          if (variantes.length > 1) return res.status(200).json({ candidatos: variantes.map(v => ({ ...v.variante, local: v.espejo.local })), mas })
        }
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
        stock.atras = await estantesDe(sb, store, variante.sku)
        return res.status(200).json({ variante, stock })
      }

      if (accion === 'buscar') {
        const palabras = palabrasDeBusqueda(String(req.query.q || ''))
        const vacio = { conStock: [], sinStock: [], masCon: 0, masSin: 0 }
        if (!palabras.length) return res.status(200).json(vacio)
        const r = await variantesDelNombre(sb, palabras, listasPorStock, (x) => x.conStock.length + x.sinStock.length > 0)
        if (!r) return res.status(200).json(vacio)
        const plano = (g) => ({ ...g.variante, local: g.espejo.local })
        return res.status(200).json({ conStock: r.conStock.map(plano), sinStock: r.sinStock.map(plano), masCon: r.masCon, masSin: r.masSin })
      }

      if (accion === 'pendientes') {
        const { data, error } = await sb.from('caja_venta').select(COLUMNAS)
          .eq('store', store).in('estado', [...SIN_LLEGAR, 'esperando_pago']).order('creada_en', { ascending: true }).limit(100)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ventas: data || [] })
      }
      return res.status(400).json({ error: 'action inválida (config, referencias, producto, pendientes)' })
    }

    if (req.method === 'POST') {
      const b = req.body || {}
      if (accion === 'politica') {
        if (!esAdmin(perfil)) return res.status(403).json({ error: 'Sólo un admin cambia la política de cambio del ticket.' })
        const texto = String(b.texto ?? '').trim().slice(0, 1000) || null
        await leerConfig() // la fila tiene que existir: la siembra si ⛔ hay
        const { error } = await sb.from('caja_config').update({ politica_cambio: texto, actualizado_por: perfil.name || null, actualizado_en: new Date().toISOString() }).eq('store', store)
        if (error) throw new Error(error.message)
        return res.status(200).json({ politica_cambio: texto })
      }
      if (accion === 'bajadas') {
        if (!esAdmin(perfil)) return res.status(403).json({ error: 'Sólo un admin cambia a dónde van las transferencias o el modo feria.' })
        const { reglas } = await leerConfig()
        if (!reglas.medios) return res.status(409).json({ error: 'La Caja todavía ⛔ tiene las formas de pago: falta correr sql/migrate-caja-medios.sql.' })
        const nuevas = { ...reglas }
        if (b.transferenciaA != null) {
          const t = Number(b.transferenciaA)
          if (!reglas.medios.transferencia.opciones.includes(t)) return res.status(400).json({ error: `La cuenta ${b.transferenciaA} ⛔ es de transferencias.` })
          nuevas.transferenciaA = t
        }
        if (b.feria != null) nuevas.feria = b.feria === true
        const { error } = await sb.from('caja_config').update({ reglas: nuevas, actualizado_por: perfil.name || null, actualizado_en: new Date().toISOString() }).eq('store', store)
        if (error) throw new Error(error.message)
        return res.status(200).json({ reglas: nuevas })
      }
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
          if (!SIN_LLEGAR.includes(previa.data.estado)) return res.status(200).json({ venta: sinPayload(previa.data) })
          const out = await enviar(previa.data)
          return res.status(200).json(out)
        }

        const { reglas } = await leerConfig()
        let filas, c, payload, espera
        try {
          filas = renglones(b.items)
          // 🔑 La cajera elige una forma de pago; detrás va una cuenta. Una cuenta que ⛔ está detrás de
          // ninguna forma de pago ⛔ se cobra (Mercado Pago, Naranja X…: fuera de la Caja).
          if (reglas.medios) for (const p of b.pagos || []) {
            if (!medioDeCuenta(p.cuenta, reglas)) throw new Error(`La cuenta ${p.cuenta} ⛔ es una forma de pago de la Caja.`)
          }
          c = cobro({ filas, pagos: b.pagos, reglas, descuentoVenta: b.descuentoVenta ?? null })
          espera = montoAEsperar(c.pagos, reglas)
          payload = armarVentaGN({ filas, pagos: c.pagos, modoLocal: MODO_LOCAL_ZATTIA, integrationId: id, fecha: fechaLocal(new Date()) })
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
        if (Number(b.total) !== c.total) {
          return res.status(409).json({ error: `El total de la pantalla ($${b.total}) ⛔ coincide con el del servidor ($${c.total}). Recargá la Caja: puede haber cambiado un descuento.`, total: c.total })
        }
        const pagaCon = b.pagaCon == null || b.pagaCon === '' ? null : Number(b.pagaCon)
        // Lo que el ticket por mail necesita y la plata ⛔: el nombre de la prenda, el talle y la foto
        // (los manda la pantalla), y la forma de pago de cada cuenta («Tarjeta de crédito»: la cuenta de
        // GN es interna, Bruno 4-oct). Van a la fila, ⛔ al payload de GN.
        const aTexto = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max) : '') || null
        const conNombre = filas.map((f, i) => {
          const it = b.items[i] || {}
          return { ...f, nombre: aTexto(it.nombre, 120), talle: aTexto(it.talle, 60), foto: /^https:\/\//.test(String(it.foto || '')) ? aTexto(it.foto, 500) : null }
        })
        const pagosConNombre = c.pagos.map(p => ({ ...p, nombre: nombreParaTicket(p.cuenta, reglas) }))
        const fila = {
          id, store, estado: espera > 0 ? 'esperando_pago' : 'borrador', espera_monto: espera > 0 ? espera : null, renglones: conNombre, pagos: pagosConNombre, subtotal: c.subtotal, total: c.total,
          paga_con: Number.isFinite(pagaCon) ? pagaCon : null, email, payload, usuario: perfil.name || null,
        }
        const ins = await sb.from('caja_venta').insert(fila).select(COLUMNAS_ENVIO).single()
        if (ins.error && ins.error.code === '23505') {
          // Otro «confirmar» con el mismo id la guardó entre la lectura y el insert: ése la manda.
          return res.status(409).json({ error: 'La venta ya se está mandando. Mirá Pendientes en unos segundos.' })
        }
        if (ins.error) throw new Error(ins.error.message)
        // La transferencia todavía ⛔ llegó: la venta espera, y la pantalla pide `cruzar`.
        if (ins.data.estado === 'esperando_pago') return res.status(200).json({ venta: sinPayload(ins.data) })
        return res.status(200).json(await enviar(ins.data))
      }

      if (accion === 'reintentar') {
        const id = String(b.id || '')
        if (!UUID.test(id)) return res.status(400).json({ error: 'id inválido.' })
        const { data, error } = await sb.from('caja_venta').select(COLUMNAS_ENVIO).eq('id', id).eq('store', store).maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) return res.status(404).json({ error: 'La venta ⛔ existe.' })
        if (data.estado === 'en_gn') return res.status(200).json({ venta: sinPayload(data) })
        // 🔴 Reintentar ⛔ saltea el cruce: una venta que espera la transferencia sale a GN sólo con el pago.
        if (!SIN_LLEGAR.includes(data.estado)) return res.status(409).json({ error: data.estado === 'cancelada' ? 'La venta está cancelada.' : 'La venta espera la transferencia: se manda sola cuando llega.' })
        return res.status(200).json(await enviar(data))
      }

      if (accion === 'cruzar') {
        const id = String(b.id || '')
        if (!UUID.test(id)) return res.status(400).json({ error: 'id inválido.' })
        const v = await sb.from('caja_venta').select(COLUMNAS_ENVIO).eq('id', id).eq('store', store).maybeSingle()
        if (v.error) throw new Error(v.error.message)
        if (!v.data) return res.status(404).json({ error: 'La venta ⛔ existe.' })
        if (v.data.estado !== 'esperando_pago') return res.status(200).json({ venta: sinPayload(v.data), cruce: { estado: v.data.estado === 'cancelada' ? 'cancelada' : 'ya' } })

        const usos = await usosDe(sb, store)
        if (!usos.length) return res.status(200).json({ venta: sinPayload(v.data), cruce: { estado: 'sin_cuenta', motivo: 'Pagos recibidos ⛔ tiene una cuenta de Mercado Pago conectada: la transferencia ⛔ se puede ver. Cancelá y cobrá por otra cuenta.' } })
        const dia = diaArgentino(Date.parse(v.data.creada_en))
        const [{ pagos }, reclamados, competidoras] = await Promise.all([
          pagosDelDia(sb, usos, dia),
          sb.from('caja_venta').select('mp_pago_id').eq('store', store).not('mp_pago_id', 'is', null)
            .gte('creada_en', new Date(Date.parse(v.data.creada_en) - 2 * 86400000).toISOString()),
          sb.from('caja_venta').select('id').eq('store', store).eq('estado', 'esperando_pago').eq('espera_monto', v.data.espera_monto).neq('id', id),
        ])
        if (reclamados.error) throw new Error(reclamados.error.message)
        if (competidoras.error) throw new Error(competidoras.error.message)
        const d = cruzarTransferencia({
          monto: Number(v.data.espera_monto), desde: v.data.creada_en, pagos,
          reclamados: (reclamados.data || []).map(r => r.mp_pago_id), competidoras: (competidoras.data || []).length,
          elegido: b.pago == null ? null : String(b.pago),
        })
        if (d.estado !== 'llego') return res.status(200).json({ venta: sinPayload(v.data), cruce: d })

        // 🔑 Se toma el pago SÓLO si la venta sigue esperando: dos `cruzar` a la vez ⇒ uno lo toma.
        // El índice único de `mp_pago_id` frena que el MISMO pago confirme otra venta (23505).
        const ahora = new Date().toISOString()
        const tom = await sb.from('caja_venta')
          .update({ estado: 'borrador', mp_pago_id: d.pago.id, mp_pago_en: d.pago.cuando, mp_cruce: d.por, actualizada_en: ahora })
          .eq('id', id).eq('estado', 'esperando_pago').select(COLUMNAS_ENVIO).maybeSingle()
        if (tom.error && tom.error.code === '23505') return res.status(409).json({ error: 'Ese pago lo acaba de tomar otra venta. Esperá la transferencia de ésta.' })
        if (tom.error) throw new Error(tom.error.message)
        if (!tom.data) {
          // Otro `cruzar` (la otra pantalla) la tomó primero: ése la manda e imprime, ⛔ éste.
          const ya = await sb.from('caja_venta').select(COLUMNAS).eq('id', id).maybeSingle()
          if (ya.error) throw new Error(ya.error.message)
          return res.status(200).json({ venta: ya.data, cruce: { estado: 'ya' } })
        }
        return res.status(200).json({ ...(await enviar(tom.data)), cruce: { estado: 'llego', por: d.por, pago: d.pago } })
      }

      if (accion === 'cancelar') {
        const id = String(b.id || '')
        if (!UUID.test(id)) return res.status(400).json({ error: 'id inválido.' })
        const ahora = new Date().toISOString()
        const can = await sb.from('caja_venta')
          .update({ estado: 'cancelada', cancelada_por: perfil.name || null, actualizada_en: ahora })
          .eq('id', id).eq('store', store).eq('estado', 'esperando_pago').select(COLUMNAS).maybeSingle()
        if (can.error) throw new Error(can.error.message)
        if (can.data) return res.status(200).json({ venta: can.data })
        // ⛔ estaba esperando: o ya llegó el pago (y salió a GN) o ⛔ existe. ⛔ Se cancela una venta cobrada.
        const ya = await sb.from('caja_venta').select(COLUMNAS).eq('id', id).eq('store', store).maybeSingle()
        if (ya.error) throw new Error(ya.error.message)
        if (!ya.data) return res.status(404).json({ error: 'La venta ⛔ existe.' })
        if (ya.data.estado === 'cancelada') return res.status(200).json({ venta: ya.data })
        return res.status(409).json({ error: 'La transferencia ya llegó: la venta está cobrada y ⛔ se cancela desde acá.', venta: ya.data })
      }
      return res.status(400).json({ error: 'action inválida (confirmar, reintentar, cruzar, cancelar, politica)' })
    }
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    return res.status(500).json({ error: sinSecretos(e && e.message) })
  }
}

const COLUMNAS_ENVIO = `${COLUMNAS}, payload`
/** Los estados de una venta COBRADA que todavía ⛔ está en GN: los únicos que se mandan. */
const SIN_LLEGAR = ['borrador', 'enviando', 'error']
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

async function variantesExactas(sb, productId, sizeId) {
  const COLS = 'product_id, product_name, size_id, size_name, sku, barcode, available_quantity, store_name'
  const { data, error } = await sb.from('inventario').select(COLS).eq('product_id', productId).eq('size_id', sizeId).limit(50)
  if (error) throw new Error(error.message)
  return agrupar(data || [])
}

/**
 * Por nombre y talle: la base filtra por una palabra (la más larga primero) y el resto lo decide
 * `buscar.core.js`. Si esa palabra ⛔ trae nada se prueba la siguiente: `ilike` ⛔ ignora las tildes,
 * y «corazon» ⛔ encuentra «CORAZÓN» (la de al lado sí puede).
 */
async function variantesDelNombre(sb, palabras, armar = filtrarPorNombre, hay = (r) => r.grupos.length > 0) {
  const COLS = 'product_id, product_name, size_id, size_name, sku, barcode, available_quantity, store_name'
  for (const p of ordenParaLaBase(palabras).slice(0, 3)) {
    const { data, error } = await sb.from('inventario').select(COLS).ilike('product_name', `%${p}%`).limit(1000)
    if (error) throw new Error(error.message)
    const r = armar(agrupar(data || []), palabras)
    if (hay(r)) return r
  }
  return armar === filtrarPorNombre ? { grupos: [], mas: 0 } : null
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

/**
 * En qué estantes del depósito de atrás está el producto (Ubicaciones depósito): «atrás: A1 · A2».
 * ⛔ Frena la venta: si la tabla ⛔ existe o la consulta falla, la Caja simplemente ⛔ lo dice.
 */
async function estantesDe(sb, store, sku) {
  const clave = claveDe(sku)
  if (!clave) return []
  try {
    const { data, error } = await sb.from('ubicacion_local').select('estante').eq('store', store).eq('clave', clave)
    if (error) return []
    return [...new Set((data || []).map((f) => f.estante))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  } catch {
    return []
  }
}
