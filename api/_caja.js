// Caja — el POS propio del local de Zattia (plan del 3-oct-2026, F2). La venta se cobra en el
// monitor y viaja a Gestión Nube con su número, su cuenta de cobro y bajando el stock.
//
//   GET  ?recurso=caja&action=config              → { reglas, politica_cambio } (la siembra si ⛔ hay)
//   GET  ?recurso=caja&action=referencias         → { cuentas: [{ id, nombre, regla }] } — SIN saldos
//   GET  ?recurso=caja&action=producto&codigo=…   → la variante del código + stock Local / Depósito;
//        si el código ⛔ está y tiene letras, busca por NOMBRE y talle ⇒ { candidatos, mas }
//   GET  ?recurso=caja&action=producto&product_id=…&size_id=…  → la variante elegida de la lista
//   GET  ?recurso=caja&action=buscar&q=…         → la lista MIENTRAS se escribe, POR PRODUCTO: { conStock, sinStock, masCon, masSin }
//        de `{ product_id, product_name, local, variantes[] }` (`productosPorStock`)
//        con el stock del local de anoche (⛔ pega a GN: tipear ⛔ gasta el cupo de 60/min)
//   GET  ?recurso=caja&action=cuentas-mp          → { enUso, cuentas? }: dónde se detectan las transferencias
//        (la cuenta de MP en uso de Pagos recibidos, `mp_cuenta_uso`); la lista sólo para admin
//   GET  ?recurso=caja&action=pendientes          → las ventas que ⛔ llegaron a GN
//   GET  ?recurso=caja&action=ventas&turno=…      → las ventas del turno (sin `turno`, el abierto), para reimprimir (B1)
//   GET  ?recurso=caja&action=pedidos-web         → los pedidos de TN por empaquetar (v2, W1):
//        { pedidos, porSku, noLeidas, leidoEn } — ver lib/caja/pedidos-web.core.js
//   GET  ?recurso=caja&action=turno               → el turno abierto (o null) con su resumen y salidas, y
//        los últimos cerrados (v2, W3), con el efectivo cobrado EN GN durante el turno (W3b) — ver lib/caja/cierre.core.js
//   POST ?recurso=caja  { action: 'confirmar', id, items, pagos, total, descuentoVenta, email?, pagaCon? }
//   POST ?recurso=caja  { action: 'reintentar', id }
//   POST ?recurso=caja  { action: 'reintentar-pendientes' } → el POS, cada 3 min: manda las cobradas sin llegar a GN (auditoría E)
//   POST ?recurso=caja  { action: 'cruzar', id, pago? }    → ¿llegó la transferencia? (F5) — `pago` lo elige la cajera
//   POST ?recurso=caja  { action: 'cancelar', id }         → una venta que esperaba la transferencia y ⛔ llegó
//   POST ?recurso=caja  { action: 'confirmar-transferencia', id, comprobante } → sólo admin: la transferencia que el cruce ⛔ ve (B3)
//   POST ?recurso=caja  { action: 'resolver', id, como: 'a_mano' | 'descartar', nota, gn_number? } → la venta que GN RECHAZÓ (B2)
//   POST ?recurso=caja  { action: 'abrir-turno', fondo, conteo? }   → abre el turno (uno solo abierto por marca)
//   POST ?recurso=caja  { action: 'salida', monto, motivo, tipo? } → saca (o con `tipo: 'aporte'`, suma) efectivo del turno abierto;
//        la carga la cuenta que abrió el turno o un admin (A8)
//   POST ?recurso=caja  { action: 'anular-mov', id, motivo } → anula una salida o un aporte del turno abierto (B4)
//   POST ?recurso=caja  { action: 'contar', id, conteo }   → conteo intermedio de billetes: ⛔ cierra ni mueve plata
//        🔑 `confirmar` y `contar` sólo los hace la cuenta que abrió el turno (`puedeUsarPOS`, fase C): 403
//   POST ?recurso=caja  { action: 'cerrar-turno', id, contado, nota?, conteo?, sinCobrosGN? } → cierra con el efectivo contado
//        Si GN ⛔ contestó los cobros del turno: 409 `sinCobrosGN`; con `sinCobrosGN: true` + nota, cierra igual.
//        `conteo` (fase B, 5-oct): `{ [billete]: cantidad }` de la calculadora; el servidor rearma el
//        total con `lib/caja/conteo.core.js` y, si ⛔ es el fondo o el contado, 400.
//   POST ?recurso=caja  { action: 'usar-mp', cuenta_id } → sólo admin: cambia la cuenta de MP en uso (la MISMA de Pagos recibidos)
//   POST ?recurso=caja  { action: 'promos', promos }       → sólo admin: la lista entera de promos (W5), en `caja_config.reglas.promos`
//   POST ?recurso=caja  { action: 'politica', texto }      → sólo admin: la política de cambio del ticket
//   POST ?recurso=caja  { action: 'logo', logo: { src, ancho, alto } | null } → sólo admin: el logo del ticket (sql/migrate-caja-logo.sql)
//   POST ?recurso=caja  { action: 'bajadas', transferenciaA?, feria?, billetes?, feriaProductos? } → sólo admin: a qué cuenta van las
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
// 🔑 LA TRANSFERENCIA SE ESPERA (F5), SIEMPRE (Bruno, 5-oct): si el cobro tiene un pago por
// TRANSFERENCIA —la cuenta de GN que sea: normal, feria, Caja Gerencia— (`montoAEsperar`), la venta queda en `esperando_pago` y ⛔ sale a GN ni se imprime: la pantalla pide
// `cruzar` cada pocos segundos, que lee Mercado Pago con la MISMA lectura de Pagos recibidos y busca
// el monto exacto (`cruzarTransferencia`). Recién con el pago encontrado la venta pasa a `borrador` y
// se manda. El id del pago de MP queda en la fila con índice ÚNICO: un pago confirma UNA venta.
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { esAdmin, puedeVerAlguna } from '../lib/permisos.core.js'
import { cfgDeMarca } from './_recepciones-base.js'
import { GN_BASE, GN_TOKENS, gnFetch } from './_gn.js'
import { filasVivas } from '../lib/gn/inventario-vivo.core.js'
import { REGLAS_INICIALES, armarVentaGN, cobro, exigirCuentas, exigirFeria, idsDeFeria, medioDeCuenta, mismaVenta, montoAEsperar, nombreParaTicket, reglaDeCuenta, renglones } from '../lib/caja/core.core.js'
import { promosDeCreditoEnMostrador } from '../lib/agenda/promos.core.js'
import { cruzarTransferencia } from '../lib/pagos-recibidos/core.core.js'
import { cuentasDe, pagosDelDia, ponerEnUso, usosDe } from './_pagos-recibidos.js'
import { diaArgentino } from '../lib/envios/portal.core.js'
import { fechaLocal, normCode, sinSecretos } from '../lib/caja/gn.core.js'
import { filtrarPorNombre, ordenParaLaBase, palabrasDeBusqueda, productosPorStock } from '../lib/caja/buscar.core.js'
import { COLUMNAS_VENTA as COLUMNAS, SIN_LLEGAR, enviarVenta, pendientesParaReintentar } from '../lib/caja/enviar.core.js'
import { claveDe } from '../lib/ubicaciones-local/core.core.js'
import { MARCA_POR_DEFECTO, marcaDeCaja } from '../lib/caja/marcas.core.js'
import { indicePorSku, ordenesSinLeer, pedidosSinArmar } from '../lib/caja/pedidos-web.core.js'
import { anuladasEnGN, cobrosDeGN, diferencia, puedeAnularMov, puedeMoverEfectivo, puedeUsarPOS, resumenTurno, usuarioDe } from '../lib/caja/cierre.core.js'
import { billetesDe, limpiarConteo, normalizarBilletes, totalDeConteo } from '../lib/caja/conteo.core.js'
import { aplicarPromos, normalizarPromos } from '../lib/caja/promos.core.js'

// 🔑 La marca es CONFIGURACIÓN (rediseño, fase 5): el nombre, el local, el depósito y el modo Local
// salen de `lib/caja/marcas.core.js`. Habilitada hoy: sólo Zattia.
const STORE = MARCA_POR_DEFECTO
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

async function leerPedidosWeb(sobre, ahora, store = STORE) {
  if (cachePedidos && cachePedidos.store === store && ahora - cachePedidos.en < 60_000) return cachePedidos.datos
  // Los tres EN PARALELO: de a uno tardaba ~4 s en frío y el aviso del renglón llegaba después del
  // escaneo (visto en prod, 4-oct). Son 6 consultas a TN contra un cupo de 40; si corta, lo dice `noLeidas`.
  const respuestas = await Promise.all(TRAMOS_PEDIDOS.map(async ([a, b]) => {
    const qs = new URLSearchParams({ ordenes: '1', modo: 'lista', store, from: diaArgentino(ahora - b * DIA_MS), to: diaArgentino(ahora - a * DIA_MS), limite: '200' })
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
  cachePedidos = { en: ahora, store, datos }
  return datos
}

// Los cobros de GN del turno (W3b): el filtro de fechas de `GET /ventas` es por el día de la VENTA,
// ⛔ del cobro, y el pedido web se paga al retirar: 16 de 22 cobros en efectivo de pedidos web se
// cargaron OTRO día que la venta, hasta 5 después (medido el 4-oct sobre 60 días) ⇒ 10 días atrás.
const DIAS_COBROS_GN = 10
/** 60 s por instancia y por turno: la pantalla del turno ⛔ le gasta el cupo a GN. El cierre lee fresco. */
let cacheCobrosGN = null
/** Lo mismo para las anuladas en GN (A12): una lectura de `ventas/obtener` por día del turno. */
let cacheAnuladas = null
export const olvidarCobrosGN = () => { cacheCobrosGN = null; cacheAnuladas = null }

async function leerJson(r) {
  const t = await r.text()
  try { return JSON.parse(t) } catch { return t.slice(0, 300) }
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return

  const store = String(req.query.store || (req.body && req.body.store) || STORE).toLowerCase()
  const marca = marcaDeCaja(store)
  if (!marca) return res.status(400).json({ error: 'La Caja es sólo de Zattia.' })
  // 🔴 `puedeVerAlguna` y ⛔ `puedeVer` pelado: es el gate del servidor (ver lib/permisos.core.js).
  if (!puedeVerAlguna(perfil, store, ['caja'])) return res.status(403).json({ error: 'No tenés acceso a la Caja.' })

  const cfg = cfgDeMarca(store)
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase de Zattia.' })
  const sb = createClient(cfg.url, cfg.key)
  const token = tokenGN()
  const accion = String(req.query.action || (req.body && req.body.action) || '')

  /** La configuración del cobro. La primera vez se siembra con lo que muestra el POS de GN. */
  async function leerConfig() {
    const { data, error } = await sb.from('caja_config').select('reglas, politica_cambio, actualizado_en').eq('store', store).maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return data
    const fila = { store, reglas: REGLAS_INICIALES, politica_cambio: null, actualizado_por: perfil.name || null }
    const ins = await sb.from('caja_config').upsert(fila, { onConflict: 'store', ignoreDuplicates: true })
    if (ins.error) throw new Error(ins.error.message)
    return { reglas: REGLAS_INICIALES, politica_cambio: null, actualizado_en: null }
  }

  /**
   * Robustez (auditoría, 11-oct): `promos` y `bajadas` reescribían `reglas` ENTERO y dos admins a la vez
   * se pisaban. Ahora se escribe sólo si la fila ⛔ cambió desde que se leyó (`actualizado_en`), y si
   * cambió se vuelve a leer y a aplicar el cambio (que toca sólo SU clave). Con `version` (la de la
   * lista que editó la pantalla, `versionDe`), si ESA lista cambió ⇒ `{ conflicto }`: la pantalla recarga.
   * @param {(reglas: any) => any} mutar @param {{ clave: string, version: unknown } | null} lista
   */
  async function guardarReglas(mutar, lista) {
    for (let i = 0; i < 4; i++) {
      const fila = await leerConfig()
      if (lista && lista.version != null && versionDe(fila.reglas, lista.clave) !== String(lista.version)) return { conflicto: true }
      const nuevas = mutar(fila.reglas)
      let q = sb.from('caja_config').update({ reglas: nuevas, actualizado_por: perfil.name || null, actualizado_en: new Date().toISOString() }).eq('store', store)
      q = fila.actualizado_en == null ? q.is('actualizado_en', null) : q.eq('actualizado_en', fila.actualizado_en)
      const up = await q.select('reglas').maybeSingle()
      if (up.error) throw new Error(up.error.message)
      if (up.data) return { reglas: up.data.reglas }
    }
    return { conflicto: true }
  }

  /**
   * ¿Hay HOY una promo bancaria de crédito con descuento en el mostrador? (A6) La lee el servidor de la
   * Agenda —la MISMA de la banda de promos del POS—, ⛔ la manda la pantalla. La Agenda vive en la base
   * de BDI (ver `cfgMaestra` en api/_agenda.js).
   */
  async function promoCreditoHoy() {
    const url = process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co'
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
    const { data, error } = await createClient(url, key).from('agenda_promos')
      .select('banco, medio, beneficio, regla, desde, hasta, canales, marcas, activa').eq('activa', true)
    if (error) throw new Error('No se pudo leer la Agenda para ver la promo de crédito de hoy. Reintentar.')
    return promosDeCreditoEnMostrador(data || [], fechaLocal(new Date()), store).length > 0
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
          // Auditoría (11-oct): cortaba en 5 páginas CALLADO. Leído a medias es ⛔ leído: el cierre frena.
          if (pag === 5) throw new Error('más de 5 páginas de cobros')
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

  /**
   * Las ventas del turno que GN ya ⛔ tiene (A12): una anulada a mano en GN desaparece de `ventas/obtener`.
   * Se leen ENTEROS los días de las ventas `en_gn` del turno; ⛔ se pudo ⇒ `null` (el cierre frena).
   */
  async function anuladasDelTurno(turno, ventas, fresco) {
    const ahora = Date.now()
    if (!fresco && cacheAnuladas && cacheAnuladas.turno === turno.id && ahora - cacheAnuladas.en < 60_000) return cacheAnuladas.datos
    const enGN = ventas.filter((v) => v.estado === 'en_gn' && Number(v.gn_sale_id) > 0)
    const dias = [...new Set(enGN.map((v) => fechaLocal(new Date(v.creada_en))))]
    const tok = GN_TOKENS.zattia || token
    try {
      const ids = []
      for (const dia of dias) {
        for (let pag = 1; ; pag++) {
          if (pag > 5) throw new Error('más de 5 páginas de ventas en un día')
          const r = await gnFetch(`${GN_BASE}/ventas/obtener?from=${dia}&to=${dia}&per_page=200&page=${pag}`, { headers: cabeceras(tok) }, 1)
          if (!r.ok) throw new Error(`GN ${r.status}`)
          const d = await leerJson(r)
          if (!d || !Array.isArray(d.data)) throw new Error('GN contestó otra cosa')
          ids.push(...d.data.map((x) => Number(x && x.id)))
          if (!(d.meta && d.meta.has_more_pages)) break
        }
      }
      const datos = anuladasEnGN({ ventas: enGN, idsGN: ids })
      cacheAnuladas = { turno: turno.id, en: ahora, datos }
      return datos
    } catch {
      return null
    }
  }

  /** El turno con lo que cobró, por cuenta, y sus movimientos. Los nombres de las cuentas, los de GN si contesta. */
  async function conResumen(turno, fresco = false) {
    const [ventas, movs, { reglas }] = await Promise.all([
      sb.from('caja_venta').select('id, estado, pagos, total, creada_en, gn_sale_id, gn_number, a_mano').eq('turno_id', turno.id).limit(2000),
      sb.from('caja_turno_mov').select(COLS_MOV).eq('turno_id', turno.id).order('creado_en', { ascending: true }),
      leerConfig(),
    ])
    if (ventas.error) throw new Error(ventas.error.message)
    if (movs.error) throw new Error(movs.error.message)
    const nombres = {}
    try {
      for (const c of await cuentasGN()) if (c.nombre) nombres[c.id] = c.nombre
    } catch { /* caen los nombres de las reglas */ }
    const [cobrosGN, anuladasGN] = await Promise.all([
      cobrosGNDelTurno(turno, reglas, fresco),
      anuladasDelTurno(turno, ventas.data || [], fresco),
    ])
    const resumen = resumenTurno({ turno, ventas: ventas.data || [], movs: movs.data || [], reglas, nombres, cobrosGN, anuladasGN })
    // `salidas` sigue siendo el nombre de la lista (la pantalla la lee así): son TODOS los movimientos.
    return { ...turno, resumen, salidas: movs.data || [] }
  }

  // El ticket por mail (F4): sin `MAILER_URL` o `MAILER_TICKET_KEY` la venta sale igual, sin mail.
  const mailer = { url: process.env.MAILER_URL, key: process.env.MAILER_TICKET_KEY, fetch }
  const enviar = (fila) => enviarVenta(fila, { sb, gnFetch, base: GN_BASE, token, mailer })

  try {
    if (req.method === 'GET') {
      if (accion === 'config') {
        // El logo del ticket va aparte y tolerante: sin la columna (falta `sql/migrate-caja-logo.sql`)
        // la Caja carga igual y el ticket sale con el nombre.
        const logo = await sb.from('caja_config').select('ticket_logo').eq('store', store).maybeSingle()
        const { actualizado_en: _v, ...conf } = await leerConfig()
        // `versiones`: las de las listas que la pantalla manda ENTERAS, para ⛔ pisar la de otro admin.
        const versiones = { promos: versionDe(conf.reglas, 'promos'), feriaProductos: versionDe(conf.reglas, 'feriaProductos') }
        return res.status(200).json({ ...conf, versiones, ticket_logo: logo.error ? null : (logo.data && logo.data.ticket_logo) || null })
      }

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
          const filas = filasVivas(await leerJson(resp), [marca.local, marca.deposito]).filter(f => Number(f.size_id) === variante.size_id)
          const de = (s) => filas.filter(f => f.store_id === s).reduce((t, f) => t + Number(f.available_quantity || 0), 0)
          stock = { local: de(marca.local), deposito: de(marca.deposito), fuente: 'vivo' }
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
        // Por PRODUCTO (Bruno, 5-oct): la tarjeta es el producto y la variante se elige en el modal.
        const r = await variantesDelNombre(sb, palabras, productosPorStock, (x) => x.conStock.length + x.sinStock.length > 0)
        return res.status(200).json(r || vacio)
      }

      if (accion === 'cuentas-mp') {
        // Dónde se detectan las transferencias (Bruno, 5-oct): la cuenta de MP en uso de Pagos
        // recibidos. Todos ven cuál es; la lista para cambiarla, sólo admin.
        const { cuentas } = await cuentasDe(sb, store)
        const enUso = cuentas.find((x) => x.enUso) || null
        return res.status(200).json({ enUso: enUso && { cuenta_id: enUso.cuenta_id, nombre: enUso.nombre }, ...(esAdmin(perfil) ? { cuentas: cuentas.map((x) => ({ cuenta_id: x.cuenta_id, nombre: x.nombre })) } : {}) })
      }

      if (accion === 'pendientes') {
        const { data, error } = await sb.from('caja_venta').select(COLUMNAS)
          .eq('store', store).in('estado', [...SIN_LLEGAR, 'esperando_pago']).order('creada_en', { ascending: true }).limit(100)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ventas: data || [] })
      }
      if (accion === 'ventas') {
        // B1 (auditoría, 11-oct): las ventas del turno, para reimprimir. Sin `turno`, el abierto.
        let turnoId = String(req.query.turno || '')
        if (turnoId && !UUID.test(turnoId)) return res.status(400).json({ error: 'id de turno inválido.' })
        if (!turnoId) {
          const t = await turnoAbierto()
          if (!t) return res.status(200).json({ ventas: [] })
          turnoId = t.id
        }
        const { data, error } = await sb.from('caja_venta').select(COLUMNAS)
          .eq('store', store).eq('turno_id', turnoId).order('creada_en', { ascending: false }).limit(500)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ventas: (data || []).map(sinPayload) })
      }
      if (accion === 'pedidos-web') {
        try {
          return res.status(200).json(await leerPedidosWeb(req.headers && req.headers['x-monitor-auth'], Date.now(), store))
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
      return res.status(400).json({ error: 'action inválida (config, referencias, producto, buscar, cuentas-mp, pendientes, ventas, pedidos-web, turno)' })
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
      if (accion === 'usar-mp') {
        if (!esAdmin(perfil)) return res.status(403).json({ error: 'Sólo un admin cambia la cuenta de Mercado Pago.' })
        const idMp = Number(b.cuenta_id)
        const { cuentas, enUso } = await cuentasDe(sb, store)
        if (!cuentas.some((x) => x.cuenta_id === idMp)) return res.status(404).json({ error: 'Esa cuenta de Mercado Pago no está cargada (se carga en Pagos recibidos).' })
        if (enUso !== idMp) await ponerEnUso(sb, store, idMp, perfil)
        const x = cuentas.find((y) => y.cuenta_id === idMp)
        return res.status(200).json({ enUso: { cuenta_id: idMp, nombre: x.nombre } })
      }
      if (accion === 'logo') {
        if (!esAdmin(perfil)) return res.status(403).json({ error: 'Sólo un admin cambia el logo del ticket.' })
        let logo = null
        if (b.logo != null) {
          const src = String(b.logo.src || '')
          const ancho = Number(b.logo.ancho)
          const alto = Number(b.logo.alto)
          if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(src)) return res.status(400).json({ error: 'El logo tiene que ser un PNG o un JPG.' })
          if (src.length > 300_000) return res.status(400).json({ error: 'El logo pesa demasiado (más de 300 KB).' })
          if (!Number.isInteger(ancho) || !Number.isInteger(alto) || ancho <= 0 || alto <= 0 || ancho > 2000 || alto > 2000) return res.status(400).json({ error: 'Falta el tamaño del logo.' })
          logo = { src, ancho, alto }
        }
        await leerConfig() // la fila tiene que existir: la siembra si ⛔ hay
        const { error } = await sb.from('caja_config').update({ ticket_logo: logo, actualizado_por: perfil.name || null, actualizado_en: new Date().toISOString() }).eq('store', store)
        if (error && /ticket_logo/.test(error.message || '')) return res.status(409).json({ error: 'Falta correr sql/migrate-caja-logo.sql en la base de Zattia.' })
        if (error) throw new Error(error.message)
        return res.status(200).json({ ticket_logo: logo })
      }
      if (accion === 'promos') {
        // 🔑 W5 (Bruno, 5-oct): las promos son configuración, como los productos de feria: van en
        // `reglas` (⛔ tabla propia: ⛔ SQL). La pantalla manda la lista ENTERA.
        if (!esAdmin(perfil)) return res.status(403).json({ error: 'Sólo un admin carga las promos.' })
        let promos
        try {
          promos = normalizarPromos(b.promos)
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
        const g = await guardarReglas((reglas) => ({ ...reglas, promos }), { clave: 'promos', version: b.version })
        if (g.conflicto) return res.status(409).json({ error: 'Otro admin cambió las promos recién. Recargá la Caja y volvé a cargar el cambio.', conflicto: true })
        return res.status(200).json({ reglas: g.reglas, versiones: { promos: versionDe(g.reglas, 'promos'), feriaProductos: versionDe(g.reglas, 'feriaProductos') } })
      }
      if (accion === 'bajadas') {
        if (!esAdmin(perfil)) return res.status(403).json({ error: 'Sólo un admin cambia a dónde van las transferencias o el modo feria.' })
        const { reglas } = await leerConfig()
        if (!reglas.medios) return res.status(409).json({ error: 'La Caja todavía no tiene las formas de pago: falta correr sql/migrate-caja-medios.sql.' })
        // Lo que cambia, validado UNA vez; se aplica sobre la fila que esté al guardar (`guardarReglas`).
        const nuevas = {}
        if (b.transferenciaA != null) {
          const t = Number(b.transferenciaA)
          if (!reglas.medios.transferencia.opciones.includes(t)) return res.status(400).json({ error: `La cuenta ${b.transferenciaA} no es de transferencias.` })
          nuevas.transferenciaA = t
        }
        if (b.feria != null) nuevas.feria = b.feria === true
        // Los productos de feria trabados: `[{ id, nombre }]`, la lista entera (la pantalla manda todo).
        if (b.feriaProductos != null) {
          if (!Array.isArray(b.feriaProductos) || b.feriaProductos.length > 2000) return res.status(400).json({ error: 'La lista de productos de feria es inválida.' })
          const vistos = new Set()
          const lista = []
          for (const x of b.feriaProductos) {
            const idP = Number(x && x.id)
            if (!Number.isInteger(idP) || idP <= 0) return res.status(400).json({ error: 'Un producto de feria sin id.' })
            if (vistos.has(idP)) continue
            vistos.add(idP)
            lista.push({ id: idP, nombre: String((x && x.nombre) || '').slice(0, 200) })
          }
          nuevas.feriaProductos = lista
        }
        if (b.billetes != null) {
          try {
            nuevas.billetes = normalizarBilletes(b.billetes)
          } catch (e) {
            return res.status(400).json({ error: e.message })
          }
        }
        const deLista = b.feriaProductos != null ? { clave: 'feriaProductos', version: b.version } : null
        const g = await guardarReglas((actual) => ({ ...actual, ...nuevas }), deLista)
        if (g.conflicto) return res.status(409).json({ error: 'Otro admin cambió la configuración recién. Recargá la Caja y volvé a cargar el cambio.', conflicto: true })
        return res.status(200).json({ reglas: g.reglas, versiones: { promos: versionDe(g.reglas, 'promos'), feriaProductos: versionDe(g.reglas, 'feriaProductos') } })
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
        // B4: `tipo: 'aporte'` es el efectivo que ENTRA (el cambio que trae alguien): suma al esperado.
        const tipo = b.tipo === 'aporte' ? 'aporte' : 'salida'
        const nombre = tipo === 'aporte' ? 'El aporte' : 'La salida'
        const monto = Number(b.monto)
        const motivo = String(b.motivo ?? '').trim().slice(0, 200)
        if (!Number.isFinite(monto) || monto <= 0 || monto > MAX_MOVIMIENTO) return res.status(400).json({ error: `${nombre} tiene que ser un monto mayor a cero.` })
        if (!motivo) return res.status(400).json({ error: `Falta el motivo ${tipo === 'aporte' ? 'del aporte' : 'de la salida'}.` })
        const turno = await turnoAbierto()
        if (!turno) return res.status(409).json({ error: 'No hay un turno abierto.' })
        // 🔑 A8 (Bruno, 11-oct): la cuenta que abrió el turno y los admins; ⛔ otra cuenta con permiso de Caja.
        if (!puedeMoverEfectivo(turno, perfil, esAdmin(perfil))) return res.status(403).json({ error: `La caja la abrió ${turno.abierto_por || 'otra cuenta'}: sólo esa cuenta o un admin cargan efectivo que sale o entra.` })
        const ins = await sb.from('caja_turno_mov').insert({ turno_id: turno.id, tipo, monto, motivo, usuario: perfil.name || null, usuario_cuenta: usuarioDe(perfil) })
        if (ins.error && turnoCerrado(ins.error)) return res.status(409).json({ error: 'El turno se cerró recién. Recargá la Caja.' })
        if (ins.error) throw new Error(ins.error.message)
        return res.status(200).json({ turno: await conResumen(turno) })
      }
      if (accion === 'anular-mov') {
        // B4: ⛔ se borra: la fila queda tachada con quién, cuándo y por qué. Sólo en el turno ABIERTO: el
        // cerrado ya tiene su foto.
        const id = String(b.id || '')
        const motivo = String(b.motivo ?? '').trim().slice(0, 200)
        if (!id) return res.status(400).json({ error: 'Falta el movimiento.' })
        if (!motivo) return res.status(400).json({ error: 'Falta por qué se anula.' })
        const turno = await turnoAbierto()
        if (!turno) return res.status(409).json({ error: 'No hay un turno abierto: el cerrado ya tiene su foto.' })
        const mov = await sb.from('caja_turno_mov').select('id, turno_id, tipo, usuario, usuario_cuenta, anulado_en').eq('id', id).eq('turno_id', turno.id).maybeSingle()
        if (mov.error) throw new Error(mov.error.message)
        if (!mov.data) return res.status(404).json({ error: 'Ese movimiento no es del turno abierto.' })
        if (!puedeAnularMov(mov.data, turno, perfil, esAdmin(perfil))) return res.status(403).json({ error: 'Lo anula quien lo cargó (si abrió la caja) o un admin.' })
        if (!mov.data.anulado_en) {
          const up = await sb.from('caja_turno_mov').update({ anulado_en: new Date().toISOString(), anulado_por: perfil.name || null, anulado_motivo: motivo })
            .eq('id', id).is('anulado_en', null).select('id').maybeSingle()
          if (up.error) throw new Error(up.error.message)
        }
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
        const nota = String(b.nota ?? '').trim().slice(0, 500) || null
        const turno = await turnoAbierto()
        if (!turno || turno.id !== id) return res.status(409).json({ error: 'Ese turno ya está cerrado. Recargá la Caja.' })
        // Fresco: un cobro cargado en GN hace un minuto tiene que entrar en la foto del cierre.
        const con = await conResumen(turno, true)
        // 🔴 Auditoría A3 (11-oct): sin los cobros de GN el esperado queda CORTO y el cierre dice que
        // sobra plata, y ⛔ se reabre. Se frena; cerrar igual es una decisión explícita y con nota. Lo mismo
        // si ⛔ se pudo mirar qué ventas se anularon en GN (A12): el esperado podría quedar LARGO.
        if (con.resumen.cobrosGN === null || con.resumen.anuladasGN === null) {
          if (b.sinCobrosGN !== true) return res.status(409).json({ error: 'Gestión Nube no contestó (los cobros web en efectivo o las ventas anuladas): sin eso el esperado puede quedar mal. Reintentar en un minuto.', sinCobrosGN: true })
          if (!nota) return res.status(400).json({ error: 'Para cerrar sin lo de Gestión Nube hace falta una nota.' })
        }
        // 🔑 La foto del cierre queda guardada: si después se toca una venta, el cierre ⛔ cambia.
        const foto = (x) => {
          const esperado = x.resumen.efectivo.esperado
          const dif = diferencia(contado, esperado)
          const f = { esperado, resumen: { ...x.resumen, salidas: x.salidas, diferencia: dif } }
          if (c) f.conteos = { ...(turno.conteos || {}), cierre: { ...c, esperado, diferencia: dif } }
          return f
        }
        const up = await sb.from('caja_turno')
          .update({ cerrado_en: new Date().toISOString(), cerrado_por: perfil.name || null, contado, nota, ...foto(con) })
          .eq('id', id).is('cerrado_en', null).select(COLS_TURNO).maybeSingle()
        if (up.error) throw new Error(up.error.message)
        if (!up.data) return res.status(409).json({ error: 'Ese turno ya está cerrado. Recargá la Caja.' })
        // 🔴 A7 (11-oct): una venta (o una salida) que se guardó mientras se cerraba quedaba en el turno y
        // ⛔ en su foto. Ya cerrado, ⛔ entra nada más (el trigger de sql/migrate-caja-auditoria.sql): se
        // relee y, si cambió, la foto se rehace con lo que de verdad quedó adentro.
        const despues = await conResumen(up.data)
        if (JSON.stringify(despues.resumen) === JSON.stringify(con.resumen) && JSON.stringify(despues.salidas) === JSON.stringify(con.salidas)) {
          return res.status(200).json({ turno: up.data })
        }
        const fix = await sb.from('caja_turno').update(foto(despues)).eq('id', id).select(COLS_TURNO).maybeSingle()
        if (fix.error) throw new Error(fix.error.message)
        return res.status(200).json({ turno: fix.data || up.data, cambioAlCerrar: true })
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
          // 🔴 Auditoría A1 (11-oct): con el MISMO id pero OTRO pedido (la respuesta se perdió y la cajera
          // agregó una prenda) ⛔ es un reintento: devolver la vieja dejaba la prenda nueva sin cobrar.
          if (!mismaVenta(previa.data, b)) {
            const v = previa.data
            const cual = v.gn_number ? `#${v.gn_number}` : `provisoria ${String(v.id).slice(0, 8).toUpperCase()}`
            return res.status(409).json({ error: `Con este número ya se cobró la venta ${cual} por ${pesos(v.total)}, con otro pedido. Si el pedido de ahora es otro, cobralo como venta nueva.`, yaCobrada: true, venta: sinPayload(v) })
          }
          if (!SIN_LLEGAR.includes(previa.data.estado)) return res.status(200).json({ venta: sinPayload(previa.data) })
          const out = await enviar(previa.data)
          return res.status(200).json(out)
        }

        const turno = await turnoAbierto()
        if (!turno) return res.status(409).json({ error: 'No hay un turno abierto: abrí el turno para cobrar.', sinTurno: true })
        // 🔑 Fase C (Bruno, 5-oct): cobra sólo la cuenta que abrió la caja. Cerrarla queda abierto a todos.
        if (!puedeUsarPOS(turno, perfil)) return res.status(403).json({ error: `La caja la abrió ${turno.abierto_por || 'otra cuenta'}: sólo esa cuenta puede cobrar.`, otraCuenta: true })
        const { reglas } = await leerConfig()
        let filas, c, payload, espera, conPromo, descuentoVenta
        try {
          // 🔑 W5: las promos se aplican ACÁ también, con las de la base y la fecha argentina: la
          // pantalla manda los renglones con el descuento A MANO nada más. Las categorías de TN las
          // manda la pantalla (el servidor ⛔ tiene el catálogo de TN): mentirlas da, a lo sumo, una
          // promo — lo mismo que ya puede hacer la cajera con un descuento a mano.
          const crudos = (Array.isArray(b.items) ? b.items : []).map((it) => ({
            ...it,
            categorias: Array.isArray(it && it.categorias) ? it.categorias.slice(0, 30).map((x) => String(x).slice(0, 80)) : [],
          }))
          conPromo = aplicarPromos({ items: crudos, promos: reglas.promos, feriaIds: idsDeFeria(reglas), hoy: fechaLocal(new Date()) })
          filas = renglones(conPromo.items)
          // 🔑 La cajera elige una forma de pago; detrás va una cuenta. Una cuenta que ⛔ está detrás de
          // ninguna forma de pago ⛔ se cobra (Mercado Pago, Naranja X…: fuera de la Caja).
          if (reglas.medios) for (const p of b.pagos || []) {
            if (!medioDeCuenta(p.cuenta, reglas)) throw new Error(`La cuenta ${p.cuenta} no es una forma de pago de la Caja.`)
          }
          // 🔴 Productos de feria trabados (Bruno, 5-oct): sólo efectivo o transferencia, la parte de
          // feria a la cuenta de feria. La pantalla ya los arma así; acá se EXIGE (si no, `curl`).
          if (reglas.medios) exigirFeria({ filas, pagos: b.pagos || [], reglas })
          // El descuento a mano a la venta REEMPLAZA a la promo de compra (Bruno, 5-oct). La de la pantalla
          // viaja como `{ tipo, valor }` y nada más; la promo, SIN la feria (A9).
          const aManoVenta = b.descuentoVenta == null ? null : { tipo: b.descuentoVenta.tipo, valor: b.descuentoVenta.valor }
          descuentoVenta = aManoVenta ?? (conPromo.venta ? { tipo: 'pesos', valor: conPromo.venta.pesos, sinFeria: true } : null)
          // 🔴 A6 (11-oct): cada pago a la cuenta que corresponde HOY (modo feria, la de transferencias, la
          // promo de crédito de la Agenda, el mínimo de 6 cuotas). La Agenda se lee sólo si hace falta.
          if (reglas.medios) {
            const usaPromo = (b.pagos || []).some((p) => Number(p && p.cuenta) === reglas.medios.credito.promo)
            exigirCuentas({ filas, pagos: b.pagos || [], reglas, descuentoVenta, promoCreditoHoy: usaPromo ? await promoCreditoHoy() : false })
          }
          c = cobro({ filas, pagos: b.pagos, reglas, descuentoVenta })
          espera = montoAEsperar(c.pagos, reglas)
          payload = armarVentaGN({ filas, pagos: c.pagos, modoLocal: marca.modoLocal, integrationId: id, fecha: fechaLocal(new Date()) })
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
        if (Number(b.total) !== c.total) {
          return res.status(409).json({ error: `El total de la pantalla ($${b.total}) no coincide con el del servidor ($${c.total}). Recargá la Caja: puede haber cambiado un descuento.`, total: c.total })
        }
        const pagaCon = b.pagaCon == null || b.pagaCon === '' ? null : Number(b.pagaCon)
        if (pagaCon != null && !(Number.isFinite(pagaCon) && pagaCon >= 0 && pagaCon <= MAX_MOVIMIENTO)) return res.status(400).json({ error: 'El monto con que paga no es válido.' })
        // Lo que el ticket por mail necesita y la plata ⛔: el nombre de la prenda, el talle y la foto
        // (los manda la pantalla), y la forma de pago de cada cuenta («Tarjeta de crédito»: la cuenta de
        // GN es interna, Bruno 4-oct). Van a la fila, ⛔ al payload de GN.
        const aTexto = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max) : '') || null
        const conNombre = filas.map((f, i) => {
          const it = b.items[i] || {}
          const promos = conPromo.items[i].promos
          // B5: el precio de la etiqueta cuando la cajera lo cambió (lo manda la pantalla: es para mostrar).
          const lista = Number(it.precioLista)
          const cambiado = Number.isFinite(lista) && lista > 0 && Math.round(lista * 100) !== Math.round(f.precio * 100)
          return { ...f, nombre: aTexto(it.nombre, 120), talle: aTexto(it.talle, 60), foto: /^https:\/\//.test(String(it.foto || '')) ? aTexto(it.foto, 500) : null, ...(promos ? { promos } : {}), ...(cambiado ? { precio_lista: lista } : {}) }
        })
        // 🔑 B5 (Bruno, 11-oct): el descuento a mano y el cambio de precio son LIBRES, pero A LA VISTA: la
        // fila guarda cuánto se rebajó a mano (a la venta, a las prendas, bajando el precio) y el turno lo suma.
        const aMano = {
          venta: b.descuentoVenta == null ? 0 : c.aVenta,
          prendas: centavosJs(filas.reduce((s, f, i) => s + (conPromo.items[i].promos ? 0 : f.cantidad * f.precio - f.importe), 0)),
          precios: centavosJs(conNombre.reduce((s, f) => s + (f.precio_lista ? Math.max(0, f.precio_lista - f.precio) * f.cantidad : 0), 0)),
        }
        const pagosConNombre = c.pagos.map(p => ({ ...p, nombre: nombreParaTicket(p.cuenta, reglas) }))
        const fila = {
          id, store, estado: espera > 0 ? 'esperando_pago' : 'borrador', espera_monto: espera > 0 ? espera : null, renglones: conNombre, pagos: pagosConNombre, subtotal: c.subtotal, total: c.total,
          paga_con: Number.isFinite(pagaCon) ? pagaCon : null, email, payload, usuario: perfil.name || null, turno_id: turno.id, a_mano: aMano,
        }
        const ins = await sb.from('caja_venta').insert(fila).select(COLUMNAS_ENVIO).single()
        if (ins.error && ins.error.code === '23505') {
          // Otro «confirmar» con el mismo id la guardó entre la lectura y el insert: ése la manda.
          return res.status(409).json({ error: 'La venta ya se está mandando. Mirá Pendientes en unos segundos.' })
        }
        // A7: el turno se cerró entre que se leyó y se guardó la venta (el trigger lo frena): ⛔ quedó guardada.
        if (ins.error && turnoCerrado(ins.error)) return res.status(409).json({ error: 'El turno se cerró mientras se cobraba: la venta NO se guardó. Abrí el turno y cobrala de nuevo.', sinTurno: true })
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

      if (accion === 'reintentar-pendientes') {
        // 🔑 Auditoría E (11-oct): el POS reintenta SOLO cada 3 min mientras está abierto. El respaldo de
        // la cola de GitHub corrió ~3 veces por día, ⛔ cada 10 min: con GN caído una venta quedaba horas
        // afuera. De a una y pocas: el techo de la función es 30 s y el cupo de GN es compartido.
        const { pendientes } = await pendientesParaReintentar(sb, store, { corteMs: 2 * 60 * 1000, limite: REINTENTOS_POR_VUELTA, ahora: Date.now() })
        let llegaron = 0
        for (const v of pendientes) {
          const { venta } = await enviar(v)
          if (venta && venta.estado === 'en_gn') llegaron++
        }
        return res.status(200).json({ intentadas: pendientes.length, llegaron })
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
        // 🔴 Auditoría A4 (11-oct): ⛔ sólo el día de la venta. Un pago después de medianoche ⛔ cruzaba
        // nunca: se leen los días desde el de la venta hasta hoy (tope DIAS_CRUCE, MP se lee cada 5 s).
        const dias = diasDelCruce(Date.parse(v.data.creada_en), Date.now())
        const [porDia, reclamados, competidoras] = await Promise.all([
          Promise.all(dias.map((dia) => pagosDelDia(sb, usos, dia))),
          sb.from('caja_venta').select('mp_pago_id').eq('store', store).not('mp_pago_id', 'is', null)
            .gte('creada_en', new Date(Date.parse(v.data.creada_en) - 2 * 86400000).toISOString()),
          // Robustez (11-oct): sólo las de las últimas horas. Una venta vieja olvidada esperando el mismo
          // monto trababa el cruce automático de TODAS las de ese monto, para siempre.
          sb.from('caja_venta').select('id').eq('store', store).eq('estado', 'esperando_pago').eq('espera_monto', v.data.espera_monto).neq('id', id)
            .gte('creada_en', new Date(Date.now() - COMPETIDORAS_MS).toISOString()),
        ])
        if (reclamados.error) throw new Error(reclamados.error.message)
        if (competidoras.error) throw new Error(competidoras.error.message)
        const vistos = new Set()
        const pagos = porDia.flatMap((x) => x.pagos).filter((p) => !vistos.has(p.id) && vistos.add(p.id))
        const d = cruzarTransferencia({
          monto: Number(v.data.espera_monto), desde: v.data.creada_en, pagos, antesManual: ANTES_MANUAL_MS,
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

      if (accion === 'resolver') {
        // B2 (auditoría, 11-oct): una venta que GN RECHAZÓ (`error` y ⛔ reintentable) quedaba en rojo para
        // siempre. Dos salidas: «cargada a mano en GN» (con su número: sigue sumando al turno, la clienta
        // pagó) o «descartar» (⛔ se cobró: deja de sumar). 🔴 Sólo la rechazada: una con error
        // reintentable puede estar en GN (timeout) y cargarla a mano la DUPLICARÍA.
        const id = String(b.id || '')
        if (!UUID.test(id)) return res.status(400).json({ error: 'id inválido.' })
        const como = b.como === 'a_mano' ? 'a_mano' : b.como === 'descartar' ? 'descartada' : null
        if (!como) return res.status(400).json({ error: 'Falta cómo se resuelve (a_mano o descartar).' })
        const nota = String(b.nota ?? '').trim().slice(0, 300)
        if (nota.length < 3) return res.status(400).json({ error: 'Falta una nota: qué pasó con la venta.' })
        const admin = esAdmin(perfil)
        // Descartar saca plata del esperado ⇒ sólo un admin (como anular un aporte). La cargada a mano ⛔
        // mueve plata: también la cuenta que tiene la caja abierta.
        if (como === 'descartada' && !admin) return res.status(403).json({ error: 'Descartar una venta lo hace un admin.' })
        if (como === 'a_mano' && !admin) {
          const t = await turnoAbierto()
          if (!puedeUsarPOS(t, perfil)) return res.status(403).json({ error: 'Lo hace la cuenta que tiene la caja abierta, o un admin.' })
        }
        const gnNumber = Number(b.gn_number)
        if (como === 'a_mano' && !(Number.isInteger(gnNumber) && gnNumber > 0)) return res.status(400).json({ error: 'Falta el número de la venta que se cargó en Gestión Nube.' })
        const v = await sb.from('caja_venta').select(COLUMNAS).eq('id', id).eq('store', store).maybeSingle()
        if (v.error) throw new Error(v.error.message)
        if (!v.data) return res.status(404).json({ error: 'La venta no existe.' })
        if (!(v.data.estado === 'error' && v.data.reintentable === false)) return res.status(409).json({ error: 'Se resuelve a mano sólo una venta que Gestión Nube rechazó. Ésta se sigue reintentando sola.', venta: v.data })
        const ahora = new Date().toISOString()
        const resolucion = { tipo: como, por: perfil.name || null, en: ahora, nota, ...(como === 'a_mano' ? { gn_number: gnNumber } : {}) }
        const cambios = como === 'a_mano'
          ? { estado: 'en_gn', gn_number: gnNumber, reintentable: null, en_gn_en: ahora, resolucion, actualizada_en: ahora }
          : { estado: 'descartada', reintentable: null, resolucion, actualizada_en: ahora }
        const up = await sb.from('caja_venta').update(cambios).eq('id', id).eq('estado', 'error').select(COLUMNAS).maybeSingle()
        if (up.error) throw new Error(up.error.message)
        if (!up.data) return res.status(409).json({ error: 'La venta cambió recién. Recargá la Caja.' })
        return res.status(200).json({ venta: up.data })
      }

      if (accion === 'confirmar-transferencia') {
        // B3 (auditoría, 11-oct): una transferencia que el cruce ⛔ ve nunca (la de Caja Gerencia es la cuenta
        // de un particular, ⛔ cae en el MP de la empresa) quedaba sin salida. La confirma un ADMIN con el
        // comprobante (número de operación o lo que lo identifique) y la venta sale a GN como con el cruce.
        if (!esAdmin(perfil)) return res.status(403).json({ error: 'Confirmar una transferencia a mano lo hace un admin.' })
        const id = String(b.id || '')
        if (!UUID.test(id)) return res.status(400).json({ error: 'id inválido.' })
        const comprobante = String(b.comprobante ?? '').trim().slice(0, 200)
        if (comprobante.length < 4) return res.status(400).json({ error: 'Falta el comprobante: el número de operación o lo que identifique la transferencia.' })
        const ahora = new Date().toISOString()
        const tom = await sb.from('caja_venta')
          .update({ estado: 'borrador', mp_cruce: 'admin', confirmacion: { por: perfil.name || null, en: ahora, comprobante }, actualizada_en: ahora })
          .eq('id', id).eq('store', store).eq('estado', 'esperando_pago').select(COLUMNAS_ENVIO).maybeSingle()
        if (tom.error) throw new Error(tom.error.message)
        if (!tom.data) {
          const ya = await sb.from('caja_venta').select(COLUMNAS).eq('id', id).eq('store', store).maybeSingle()
          if (ya.error) throw new Error(ya.error.message)
          if (!ya.data) return res.status(404).json({ error: 'La venta no existe.' })
          return res.status(409).json({ error: ya.data.estado === 'cancelada' ? 'La venta está cancelada.' : 'La venta ya no espera la transferencia.', venta: ya.data })
        }
        return res.status(200).json(await enviar(tom.data))
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
      return res.status(400).json({ error: 'action inválida (confirmar, reintentar, reintentar-pendientes, cruzar, cancelar, resolver, confirmar-transferencia, usar-mp, politica, logo, bajadas, abrir-turno, salida, anular-mov, contar, cerrar-turno)' })
    }
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    return res.status(500).json({ error: sinSecretos(e && e.message) })
  }
}

const COLUMNAS_ENVIO = `${COLUMNAS}, payload`
/** Cuántas ventas manda el POS por vuelta de `reintentar-pendientes`: cada una puede tardar hasta ~10 s. */
const REINTENTOS_POR_VUELTA = 2
// 🔴 `conteos` y `abierto_por_usuario` son de `sql/migrate-caja-conteos.sql`: sin correrlo, el turno ⛔ carga.
const COLS_MOV = 'id, tipo, monto, motivo, usuario, usuario_cuenta, creado_en, anulado_en, anulado_por, anulado_motivo'
const COLS_TURNO = 'id, abierto_en, abierto_por, abierto_por_usuario, fondo, cerrado_en, cerrado_por, contado, esperado, resumen, nota, conteos'
/** Los conteos intermedios que guarda un turno: los últimos. Un turno normal cuenta dos o tres veces. */
const MAX_INTERMEDIOS = 50
const pesos = (n) => `$${Number(n).toLocaleString('es-AR')}`
/** La versión de una lista de `reglas` (promos, productos de feria): cambia si cambia la lista. */
export const versionDe = (reglas, clave) => createHash('sha1').update(JSON.stringify((reglas && reglas[clave]) || [])).digest('hex').slice(0, 12)
const sinPayload = ({ payload: _p, ...v }) => v
/** El tope de una salida o un aporte: lo que pasa de esto es un error de tipeo. */
const MAX_MOVIMIENTO = 50_000_000
const centavosJs = (n) => Math.round(n * 100) / 100
/** El error del trigger de `sql/migrate-caja-auditoria.sql` (A7): el insert llegó con el turno ya cerrado. */
const turnoCerrado = (e) => /caja_turno_cerrado/.test(String((e && e.message) || ''))

/** Hasta cuánto atrás otra venta esperando el mismo monto obliga a elegir el pago a mano. */
const COMPETIDORAS_MS = 12 * 3600 * 1000
/** Cuántos días de Mercado Pago lee el cruce, desde el de la venta (A4). */
const DIAS_CRUCE = 3
/**
 * Hasta cuánto ANTES de la venta un pago se OFRECE para elegir (A4): la venta que se canceló y se volvió
 * a escanear nace después del pago. Como se lee desde el día de la venta, en la práctica es desde su
 * medianoche. ⛔ Entra solo nunca: lo elige la cajera.
 */
const ANTES_MANUAL_MS = 24 * 3600 * 1000
/**
 * Los días argentinos desde el de la venta hasta hoy. Con más de `DIAS_CRUCE`: el de la venta y los
 * últimos (el pago que llega tarde llega HOY).
 */
export function diasDelCruce(creada, ahora) {
  const hoy = diaArgentino(ahora)
  const dias = []
  for (let t = creada; t <= ahora + DIA_MS; t += DIA_MS) {
    const d = diaArgentino(t)
    if (!dias.includes(d)) dias.push(d)
    if (d === hoy) break
  }
  return dias.length <= DIAS_CRUCE ? dias : [dias[0], ...dias.slice(-(DIAS_CRUCE - 1))]
}

/**
 * Las variantes del espejo (`inventario`) que corresponden al código del lector: barcode exacto,
 * barcode normalizado, y SKU — el mismo orden que el chequeo de exhibición (`coincidencias`).
 * Devuelve una entrada por variante (product_id + size_id), con su stock de anoche por si GN ⛔ contesta.
 */
async function variantesDelCodigo(sb, codigo) {
  const COLS = 'product_id, product_name, size_id, size_name, sku, barcode, available_quantity, store_name'
  const nc = normCode(codigo)
  const escapar = (x) => x.replace(/[\\%_]/g, (m) => `\\${m}`)
  const intentos = [
    () => sb.from('inventario').select(COLS).eq('barcode', codigo),
    () => sb.from('inventario').select(COLS).eq('barcode', nc),
    // Robustez (11-oct): el SKU TAL CUAL antes que el normalizado: `normCode` le saca los guiones y
    // `RVE-0047-NG` ⛔ se encontraba nunca por SKU.
    () => sb.from('inventario').select(COLS).ilike('sku', escapar(String(codigo).trim())),
    () => sb.from('inventario').select(COLS).ilike('sku', escapar(nc)),
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
    // 🔴 PostgREST corta en 1.000 filas SIN avisar, y una fila es variante × sucursal: «top» pasaba de
    // largo y la lista salía recortada. Se pagina (hasta 5.000 filas).
    const filas = []
    for (let desde = 0; desde < 5000; desde += 1000) {
      const { data, error } = await sb.from('inventario').select(COLS).ilike('product_name', `%${p}%`)
        .order('product_id').order('size_id').order('store_name').range(desde, desde + 999)
      if (error) throw new Error(error.message)
      filas.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    const r = armar(agrupar(filas), palabras)
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
