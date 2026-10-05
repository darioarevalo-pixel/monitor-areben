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
//   GET  ?recurso=caja&action=pedidos-web         → los pedidos de TN por empaquetar (v2, W1):
//        { pedidos, porSku, noLeidas, leidoEn } — ver lib/caja/pedidos-web.core.js
//   GET  ?recurso=caja&action=turno               → el turno abierto (o null) con su resumen y salidas, y
//        los últimos cerrados (v2, W3), con el efectivo cobrado EN GN durante el turno (W3b) — ver lib/caja/cierre.core.js
//   POST ?recurso=caja  { action: 'confirmar', id, items, pagos, total, descuentoVenta, email?, pagaCon? }
//   POST ?recurso=caja  { action: 'reintentar', id }
//   POST ?recurso=caja  { action: 'cruzar', id, pago? }    → ¿llegó la transferencia? (F5) — `pago` lo elige la cajera
//   POST ?recurso=caja  { action: 'cancelar', id }         → una venta que esperaba la transferencia y ⛔ llegó
//   POST ?recurso=caja  { action: 'abrir-turno', fondo, conteo? }   → abre el turno (uno solo abierto por marca)
//   POST ?recurso=caja  { action: 'salida', monto, motivo } → saca efectivo del turno abierto
//   POST ?recurso=caja  { action: 'contar', id, conteo }   → conteo intermedio de billetes: ⛔ cierra ni mueve plata
//        🔑 `confirmar` y `contar` sólo los hace la cuenta que abrió el turno (`puedeUsarPOS`, fase C): 403
//   POST ?recurso=caja  { action: 'cerrar-turno', id, contado, nota?, conteo? } → cierra con el efectivo contado
//        `conteo` (fase B, 5-oct): `{ [billete]: cantidad }` de la calculadora; el servidor rearma el
//        total con `lib/caja/conteo.core.js` y, si ⛔ es el fondo o el contado, 400.
//   POST ?recurso=caja  { action: 'politica', texto }      → sólo admin: la política de cambio del ticket
//   POST ?recurso=caja  { action: 'bajadas', transferenciaA?, feria?, billetes? } → sólo admin: a qué cuenta van las
//        transferencias, el modo feria (bajadas de línea: ⛔ las decide la cajera) y los billetes de la calculadora
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
// 🔑 EL TURNO ES DE LA CAJA (v2, W3, Bruno 4-oct): la API de GN ⛔ tiene turnos y el de GN se deja de
// usar. Sin turno abierto ⛔ se cobra (409): cada venta queda en el turno donde se cobró (`turno_id`).
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
import { indicePorSku, ordenesSinLeer, pedidosSinArmar } from '../lib/caja/pedidos-web.core.js'
import { cobrosDeGN, diferencia, puedeUsarPOS, resumenTurno, usuarioDe } from '../lib/caja/cierre.core.js'
import { billetesDe, limpiarConteo, normalizarBilletes, totalDeConteo } from '../lib/caja/conteo.core.js'

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

// Los pedidos web se leen del audit de bdi-catalogo (el mismo de Envíos y Cobranzas) en TRAMOS de 3
// días: el audit corta en 200 órdenes y 10 días de Zattia eran 240 (medido el 4-oct) ⇒ de un saque
// se perdían las más viejas, que son las más urgentes. El pedido sin armar más viejo de ese día tenía
// 6 días: 9 días alcanzan, y lo que ⛔ se leyó se cuenta en `noLeidas`.
const AUDIT = process.env.CATALOGO_AUDIT_URL || 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
const TRAMOS_PEDIDOS = [[0, 2], [3, 5], [6, 8]]
const DIA_MS = 86_400_000
/** 60 s por instancia: dos pantallas de caja ⛔ le duplican el pedido a TN. */
let cachePedidos = null
export const olvidarPedidosWeb = () => { cachePedidos = null }

async function leerPedidosWeb(sobre, ahora) {
  if (cachePedidos && ahora - cachePedidos.en < 60_000) return cachePedidos.datos
  // Los tres EN PARALELO: de a uno tardaba ~4 s en frío y el aviso del renglón llegaba después del
  // escaneo (visto en prod, 4-oct). Son 6 consultas a TN contra un cupo de 40; si corta, lo dice `noLeidas`.
  const respuestas = await Promise.all(TRAMOS_PEDIDOS.map(async ([a, b]) => {
    const qs = new URLSearchParams({ ordenes: '1', modo: 'lista', store: STORE, from: diaArgentino(ahora - b * DIA_MS), to: diaArgentino(ahora - a * DIA_MS), limite: '200' })
    const r = await fetch(`${AUDIT}?${qs}`, { headers: { 'x-monitor-auth': sobre } })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d || !d.ok) throw new Error(`Tienda Nube no contestó los pedidos (${(d && d.error) || r.status}).`)
    return d
  }))
  const porNumero = new Map()
  let noLeidas = 0
  for (const d of respuestas) {
    const lista = Array.isArray(d.ordenes) ? d.ordenes : []
    for (const o of lista) porNumero.set(o.number, o)
    noLeidas += ordenesSinLeer(d, lista.length)
  }
  const pedidos = pedidosSinArmar([...porNumero.values()], ahora)
  const datos = { pedidos, porSku: indicePorSku(pedidos), noLeidas, leidoEn: new Date(ahora).toISOString() }
  cachePedidos = { en: ahora, datos }
  return datos
}

// Los cobros de GN del turno (W3b): el filtro de fechas de `GET /ventas` es por el día de la VENTA,
// ⛔ del cobro, y el pedido web se paga al retirar: 16 de 22 cobros en efectivo de pedidos web se
// cargaron OTRO día que la venta, hasta 5 después (medido el 4-oct sobre 60 días) ⇒ 10 días atrás.
const DIAS_COBROS_GN = 10
/** 60 s por instancia y por turno: la pantalla del turno ⛔ le gasta el cupo a GN. El cierre lee fresco. */
let cacheCobrosGN = null
export const olvidarCobrosGN = () => { cacheCobrosGN = null }

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

  /** Las cuentas de GN (id y nombre), cacheadas por instancia. Lanza si GN ⛔ contesta. */
  async function cuentasGN() {
    if (cacheCuentas) return cacheCuentas
    const resp = await gnFetch(`${GN_BASE}/ventas/referencias`, { headers: cabeceras(token) }, 1)
    if (!resp.ok) throw new Error(`Gestión Nube contestó ${resp.status} al pedir las cuentas.`)
    const d = await leerJson(resp)
    // 🔴 Lista blanca: `cuentas` trae el SALDO de cada cuenta (`balance`), que ⛔ va al navegador.
    cacheCuentas = (d && Array.isArray(d.cuentas) ? d.cuentas : []).map(c => ({ id: Number(c.id), nombre: String(c.name || '') }))
    return cacheCuentas
  }

  /** El turno abierto de la marca, o null. Hay uno solo: lo asegura el índice único parcial. */
  async function turnoAbierto() {
    const { data, error } = await sb.from('caja_turno').select(COLS_TURNO).eq('store', store).is('cerrado_en', null).maybeSingle()
    if (error) throw new Error(error.message)
    return data
  }

  /**
   * El efectivo cobrado en GN dentro del turno que ⛔ es venta presencial (W3b). `null` si GN ⛔ contesta:
   * el turno se muestra igual y dice que faltan.
   */
  async function cobrosGNDelTurno(turno, reglas, fresco) {
    const ahora = Date.now()
    if (!fresco && cacheCobrosGN && cacheCobrosGN.turno === turno.id && ahora - cacheCobrosGN.en < 60_000) return cacheCobrosGN.datos
    const cuentas = Object.entries(reglas.cuentas || {}).filter(([, r]) => r && r.efectivo).map(([id]) => Number(id))
    const tok = GN_TOKENS.zattia || token
    try {
      const ventas = []
      for (const cuenta of cuentas) {
        for (let pag = 1; pag <= 5; pag++) {
          const qs = new URLSearchParams({
            account_id: String(cuenta), include_payments: '1', per_page: '200', page: String(pag),
            dateFrom: diaArgentino(Date.parse(turno.abierto_en) - DIAS_COBROS_GN * DIA_MS), dateTo: diaArgentino(ahora),
          })
          const r = await gnFetch(`${GN_BASE}/ventas?${qs}`, { headers: cabeceras(tok) }, 1)
          if (!r.ok) throw new Error(`GN ${r.status}`)
          const d = await leerJson(r)
          ventas.push(...(d && Array.isArray(d.data) ? d.data : []))
          if (!(d && d.meta && d.meta.has_more_pages)) break
        }
      }
      const hasta = turno.cerrado_en || new Date(ahora).toISOString()
      const datos = cobrosDeGN({ ventas, desde: turno.abierto_en, hasta, cuentas })
      cacheCobrosGN = { turno: turno.id, en: ahora, datos }
      return datos
    } catch {
      return null
    }
  }

  /**
   * El conteo de billetes que mandó la pantalla, con el total RECALCULADO acá. `null` si ⛔ vino;
   * `{ error }` si una cantidad está mal o, con `monto`, si el total ⛔ es ese monto (el fondo o el contado).
   */
  async function conteoContra(conteo, monto, que) {
    if (conteo == null) return null
    const billetes = billetesDe((await leerConfig()).reglas)
    let limpio, total
    try {
      limpio = limpiarConteo(conteo, billetes)
      total = totalDeConteo(limpio, billetes)
    } catch (e) {
      return { error: e.message }
    }
    if (monto != null && total !== monto) return { error: `Los billetes suman ${pesos(total)} y ${que} dice ${pesos(monto)}.` }
    return { billetes: limpio, total, en: new Date().toISOString(), por: perfil.name || null }
  }

  /** El turno con lo que cobró, por cuenta, y sus salidas. Los nombres de las cuentas, los de GN si contesta. */
  async function conResumen(turno, fresco = false) {
    const [ventas, salidas, { reglas }] = await Promise.all([
      sb.from('caja_venta').select('id, estado, pagos, total, creada_en').eq('turno_id', turno.id).limit(2000),
      sb.from('caja_turno_mov').select('id, tipo, monto, motivo, usuario, creado_en').eq('turno_id', turno.id).order('creado_en', { ascending: true }),
      leerConfig(),
    ])
    if (ventas.error) throw new Error(ventas.error.message)
    if (salidas.error) throw new Error(salidas.error.message)
    const nombres = {}
    try {
      for (const c of await cuentasGN()) if (c.nombre) nombres[c.id] = c.nombre
    } catch { /* caen los nombres de las reglas */ }
    const cobrosGN = await cobrosGNDelTurno(turno, reglas, fresco)
    const resumen = resumenTurno({ turno, ventas: ventas.data || [], salidas: salidas.data || [], reglas, nombres, cobrosGN })
    return { ...turno, resumen, salidas: salidas.data || [] }
  }

  // El ticket por mail (F4): sin `MAILER_URL` o `MAILER_TICKET_KEY` la venta sale igual, sin mail.
  const mailer = { url: process.env.MAILER_URL, key: process.env.MAILER_TICKET_KEY, fetch }
  const enviar = (fila) => enviarVenta(fila, { sb, gnFetch, base: GN_BASE, token, mailer })

  try {
    if (req.method === 'GET') {
      if (accion === 'config') return res.status(200).json(await leerConfig())

      if (accion === 'referencias') {
        try {
          await cuentasGN()
        } catch (e) {
          return res.status(502).json({ error: e.message })
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
          if (!variantes.length) return res.status(404).json({ error: 'Esa prenda no está en el inventario.' })
        } else {
          if (!codigo) return res.status(400).json({ error: 'Falta el código.' })
          variantes = await variantesDelCodigo(sb, codigo)
          let mas = 0
          const palabras = palabrasDeBusqueda(codigo)
          if (!variantes.length && palabras.length) ({ grupos: variantes, mas } = await variantesDelNombre(sb, palabras))
          if (!variantes.length) return res.status(404).json({ error: palabras.length ? `Ninguna prenda se llama «${codigo}».` : `El código ${codigo} no está en el inventario.` })
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
      if (accion === 'pedidos-web') {
        try {
          return res.status(200).json(await leerPedidosWeb(req.headers && req.headers['x-monitor-auth'], Date.now()))
        } catch (e) {
          return res.status(502).json({ error: sinSecretos(e && e.message) })
        }
      }
      if (accion === 'turno') {
        const turno = await turnoAbierto()
        const ultimos = await sb.from('caja_turno').select(COLS_TURNO).eq('store', store).not('cerrado_en', 'is', null)
          .order('abierto_en', { ascending: false }).limit(10)
        if (ultimos.error) throw new Error(ultimos.error.message)
        return res.status(200).json({ turno: turno ? await conResumen(turno) : null, ultimos: ultimos.data || [] })
      }
      return res.status(400).json({ error: 'action inválida (config, referencias, producto, buscar, pendientes, pedidos-web, turno)' })
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
        if (!reglas.medios) return res.status(409).json({ error: 'La Caja todavía no tiene las formas de pago: falta correr sql/migrate-caja-medios.sql.' })
        const nuevas = { ...reglas }
        if (b.transferenciaA != null) {
          const t = Number(b.transferenciaA)
          if (!reglas.medios.transferencia.opciones.includes(t)) return res.status(400).json({ error: `La cuenta ${b.transferenciaA} no es de transferencias.` })
          nuevas.transferenciaA = t
        }
        if (b.feria != null) nuevas.feria = b.feria === true
        if (b.billetes != null) {
          try {
            nuevas.billetes = normalizarBilletes(b.billetes)
          } catch (e) {
            return res.status(400).json({ error: e.message })
          }
        }
        const { error } = await sb.from('caja_config').update({ reglas: nuevas, actualizado_por: perfil.name || null, actualizado_en: new Date().toISOString() }).eq('store', store)
        if (error) throw new Error(error.message)
        return res.status(200).json({ reglas: nuevas })
      }
      if (accion === 'abrir-turno') {
        const fondo = Number(b.fondo)
        if (b.fondo === '' || b.fondo == null || !Number.isFinite(fondo) || fondo < 0) return res.status(400).json({ error: 'El fondo tiene que ser un monto (0 o más).' })
        const c = await conteoContra(b.conteo, fondo, 'el fondo')
        if (c && c.error) return res.status(400).json({ error: c.error })
        // `abierto_por_usuario`: el dato de la cuenta que ⛔ cambia (el mail del padrón): la fase C lo usa para el POS.
        const fila = { store, fondo, abierto_por: perfil.name || null, abierto_por_usuario: usuarioDe(perfil) }
        if (c) fila.conteos = { apertura: c }
        const ins = await sb.from('caja_turno').insert(fila).select(COLS_TURNO).single()
        // El índice único: ya hay un turno abierto (otra pantalla lo abrió recién).
        if (ins.error && ins.error.code === '23505') return res.status(409).json({ error: 'Ya hay un turno abierto. Recargá la Caja.' })
        if (ins.error) throw new Error(ins.error.message)
        return res.status(200).json({ turno: await conResumen(ins.data) })
      }
      if (accion === 'salida') {
        const monto = Number(b.monto)
        const motivo = String(b.motivo ?? '').trim().slice(0, 200)
        if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: 'La salida tiene que ser un monto mayor a cero.' })
        if (!motivo) return res.status(400).json({ error: 'Falta el motivo de la salida.' })
        const turno = await turnoAbierto()
        if (!turno) return res.status(409).json({ error: 'No hay un turno abierto.' })
        const ins = await sb.from('caja_turno_mov').insert({ turno_id: turno.id, tipo: 'salida', monto, motivo, usuario: perfil.name || null })
        if (ins.error) throw new Error(ins.error.message)
        return res.status(200).json({ turno: await conResumen(turno) })
      }
      // El conteo INTERMEDIO (fase B): cuántos billetes hay ahora contra lo que tiene que haber. ⛔ Cierra
      // nada ni mueve plata: queda en `conteos.intermedios` para que se vea desde cualquier pantalla.
      if (accion === 'contar') {
        const id = String(b.id || '')
        if (!UUID.test(id)) return res.status(400).json({ error: 'id de turno inválido.' })
        if (b.conteo == null) return res.status(400).json({ error: 'Falta el conteo de billetes.' })
        const c = await conteoContra(b.conteo, null, '')
        if (c.error) return res.status(400).json({ error: c.error })
        const turno = await turnoAbierto()
        if (!turno || turno.id !== id) return res.status(409).json({ error: 'Ese turno ya está cerrado. Recargá la Caja.' })
        if (!puedeUsarPOS(turno, perfil)) return res.status(403).json({ error: `La caja la abrió ${turno.abierto_por || 'otra cuenta'}: sólo esa cuenta puede contar los billetes del turno.` })
        // Fresco, como el cierre: el conteo se compara con lo que tiene que haber AHORA.
        const con = await conResumen(turno, true)
        const esperado = con.resumen.efectivo.esperado
        const previos = (turno.conteos && Array.isArray(turno.conteos.intermedios)) ? turno.conteos.intermedios : []
        const conteos = { ...(turno.conteos || {}), intermedios: [...previos, { ...c, esperado, diferencia: diferencia(c.total, esperado) }].slice(-MAX_INTERMEDIOS) }
        const up = await sb.from('caja_turno').update({ conteos }).eq('id', id).is('cerrado_en', null).select(COLS_TURNO).maybeSingle()
        if (up.error) throw new Error(up.error.message)
        if (!up.data) return res.status(409).json({ error: 'Ese turno ya está cerrado. Recargá la Caja.' })
        return res.status(200).json({ turno: { ...con, conteos } })
      }
      if (accion === 'cerrar-turno') {
        const id = String(b.id || '')
        if (!UUID.test(id)) return res.status(400).json({ error: 'id de turno inválido.' })
        const contado = Number(b.contado)
        if (b.contado === '' || b.contado == null || !Number.isFinite(contado) || contado < 0) return res.status(400).json({ error: 'Falta el efectivo contado.' })
        const c = await conteoContra(b.conteo, contado, 'el efectivo contado')
        if (c && c.error) return res.status(400).json({ error: c.error })
        const turno = await turnoAbierto()
        if (!turno || turno.id !== id) return res.status(409).json({ error: 'Ese turno ya está cerrado. Recargá la Caja.' })
        // Fresco: un cobro cargado en GN hace un minuto tiene que entrar en la foto del cierre.
        const con = await conResumen(turno, true)
        const esperado = con.resumen.efectivo.esperado
        const dif = diferencia(contado, esperado)
        const nota = String(b.nota ?? '').trim().slice(0, 500) || null
        // 🔑 La foto del cierre queda guardada: si después se toca una venta, el cierre ⛔ cambia.
        const resumen = { ...con.resumen, salidas: con.salidas, diferencia: dif }
        const cambios = { cerrado_en: new Date().toISOString(), cerrado_por: perfil.name || null, contado, esperado, resumen, nota }
        if (c) cambios.conteos = { ...(turno.conteos || {}), cierre: { ...c, esperado, diferencia: dif } }
        const up = await sb.from('caja_turno')
          .update(cambios)
          .eq('id', id).is('cerrado_en', null).select(COLS_TURNO).maybeSingle()
        if (up.error) throw new Error(up.error.message)
        if (!up.data) return res.status(409).json({ error: 'Ese turno ya está cerrado. Recargá la Caja.' })
        return res.status(200).json({ turno: up.data })
      }

      if (!token) return res.status(500).json({ error: 'Falta el token de Gestión Nube para escribir ventas.' })

      if (accion === 'confirmar') {
        const id = String(b.id || '')
        if (!UUID.test(id)) return res.status(400).json({ error: 'id inválido: lo genera la pantalla (uuid).' })
        const email = b.email == null || b.email === '' ? null : String(b.email).trim().toLowerCase()
        if (email && !MAIL.test(email)) return res.status(400).json({ error: 'El mail no es válido.' })

        // Idempotente: si la venta ya se guardó (doble click, reintento de la pantalla) se manda la
        // guardada y ⛔ se rearma.
        const previa = await sb.from('caja_venta').select(COLUMNAS_ENVIO).eq('id', id).maybeSingle()
        if (previa.error) throw new Error(previa.error.message)
        if (previa.data) {
          if (!SIN_LLEGAR.includes(previa.data.estado)) return res.status(200).json({ venta: sinPayload(previa.data) })
          const out = await enviar(previa.data)
          return res.status(200).json(out)
        }

        const turno = await turnoAbierto()
        if (!turno) return res.status(409).json({ error: 'No hay un turno abierto: abrí el turno para cobrar.', sinTurno: true })
        // 🔑 Fase C (Bruno, 5-oct): cobra sólo la cuenta que abrió la caja. Cerrarla queda abierto a todos.
        if (!puedeUsarPOS(turno, perfil)) return res.status(403).json({ error: `La caja la abrió ${turno.abierto_por || 'otra cuenta'}: sólo esa cuenta puede cobrar.`, otraCuenta: true })
        const { reglas } = await leerConfig()
        let filas, c, payload, espera
        try {
          filas = renglones(b.items)
          // 🔑 La cajera elige una forma de pago; detrás va una cuenta. Una cuenta que ⛔ está detrás de
          // ninguna forma de pago ⛔ se cobra (Mercado Pago, Naranja X…: fuera de la Caja).
          if (reglas.medios) for (const p of b.pagos || []) {
            if (!medioDeCuenta(p.cuenta, reglas)) throw new Error(`La cuenta ${p.cuenta} no es una forma de pago de la Caja.`)
          }
          c = cobro({ filas, pagos: b.pagos, reglas, descuentoVenta: b.descuentoVenta ?? null })
          espera = montoAEsperar(c.pagos, reglas)
          payload = armarVentaGN({ filas, pagos: c.pagos, modoLocal: MODO_LOCAL_ZATTIA, integrationId: id, fecha: fechaLocal(new Date()) })
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
        if (Number(b.total) !== c.total) {
          return res.status(409).json({ error: `El total de la pantalla ($${b.total}) no coincide con el del servidor ($${c.total}). Recargá la Caja: puede haber cambiado un descuento.`, total: c.total })
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
          paga_con: Number.isFinite(pagaCon) ? pagaCon : null, email, payload, usuario: perfil.name || null, turno_id: turno.id,
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
        if (!data) return res.status(404).json({ error: 'La venta no existe.' })
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
        if (!v.data) return res.status(404).json({ error: 'La venta no existe.' })
        if (v.data.estado !== 'esperando_pago') return res.status(200).json({ venta: sinPayload(v.data), cruce: { estado: v.data.estado === 'cancelada' ? 'cancelada' : 'ya' } })

        const usos = await usosDe(sb, store)
        if (!usos.length) return res.status(200).json({ venta: sinPayload(v.data), cruce: { estado: 'sin_cuenta', motivo: 'Pagos recibidos no tiene una cuenta de Mercado Pago conectada: la transferencia no se puede ver. Cancelá y cobrá por otra cuenta.' } })
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
        if (!ya.data) return res.status(404).json({ error: 'La venta no existe.' })
        if (ya.data.estado === 'cancelada') return res.status(200).json({ venta: ya.data })
        return res.status(409).json({ error: 'La transferencia ya llegó: la venta está cobrada y no se cancela desde acá.', venta: ya.data })
      }
      return res.status(400).json({ error: 'action inválida (confirmar, reintentar, cruzar, cancelar, politica, bajadas, abrir-turno, salida, contar, cerrar-turno)' })
    }
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    return res.status(500).json({ error: sinSecretos(e && e.message) })
  }
}

const COLUMNAS_ENVIO = `${COLUMNAS}, payload`
// 🔴 `conteos` y `abierto_por_usuario` son de `sql/migrate-caja-conteos.sql`: sin correrlo, el turno ⛔ carga.
const COLS_TURNO = 'id, abierto_en, abierto_por, abierto_por_usuario, fondo, cerrado_en, cerrado_por, contado, esperado, resumen, nota, conteos'
/** Los conteos intermedios que guarda un turno: los últimos. Un turno normal cuenta dos o tres veces. */
const MAX_INTERMEDIOS = 50
const pesos = (n) => `$${Number(n).toLocaleString('es-AR')}`
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
