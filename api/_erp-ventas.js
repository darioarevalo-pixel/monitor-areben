/**
 * ERP › Ventas (el PILOTO del diseño, `~/Documents/erp-monitor/diseno.md` §8): la LISTA con todas las ventas del motor
 * del período y lo que la base del motor ⛔ tiene todavía, leído de donde está (el cliente y la factura de GN del espejo,
 * el estado del pedido de `tn_orden`). Sólo LEE; las acciones (anular, NC, cambio) siguen por `api/_erp.js`.
 * Lo arma `lib/erp/ventas-lista.core.js`; lo llama `api/_erp.js` (`vista=ventas-lista` y `vista=venta-extra`).
 */

import { createClient } from '@supabase/supabase-js'
import { cfgDeMarca } from './_recepciones-base.js'
import { leerTodo } from '../lib/supabase/paginar.core.js'
import { baseFacturacion } from './_facturacion.js'
import { rangoDeDias } from '../lib/erp/venta.core.js'
import { armarFila, ventasDeTnSinNombre } from '../lib/erp/ventas-lista.core.js'
import { ADMIN } from '../lib/erp/pedidos-tn.core.js'
import { configPg } from '../lib/pg.core.js'

const MARCAS = ['bdi', 'zattia']
const TANDA = 300
const DIA = /^\d{4}-\d{2}-\d{2}$/

/** De a tandas (un `in` largo ⛔ entra en la URL de PostgREST). */
async function enTandas(ids, fn) {
  const out = []
  const unicos = [...new Set(ids.filter((x) => x != null && x !== ''))]
  for (let i = 0; i < unicos.length; i += TANDA) out.push(...await fn(unicos.slice(i, i + TANDA)))
  return out
}

const gnIdDe = (v) => {
  const x = v.gn_sale_id ?? v.detalle?.gn_sale_id
  return x == null || x === '' ? null : String(x)
}
const tnIdDe = (v) => (v.origen === 'tn' ? String(v.origen_ref || '').split(':')[1] || null : null)

/** «B 0005-00012351» como lo imprime ARCA; la de homologación dice «(prueba)». */
export function numeroDeFactura(f) {
  const letra = { 1: 'A', 6: 'B', 3: 'NC A', 8: 'NC B' }[f.tipo] ?? String(f.tipo)
  const n = `${letra} ${String(f.pto_vta).padStart(4, '0')}-${String(f.numero ?? '').padStart(8, '0')}`
  return f.ambiente === 'produccion' ? n : `${n} (prueba)`
}

/** Las facturas del ERP (`facturas`, base de BDI) de esas ventas, autorizadas: id → { numero, tipo, cuando }. */
async function facturasDelErp(ids) {
  const filas = await enTandas(ids, async (t) => {
    const { data, error } = await baseFacturacion().from('facturas').select('id, ambiente, tipo, pto_vta, numero, creado_en, estado').in('id', t).eq('estado', 'autorizada')
    if (error) throw new Error(`facturas: ${error.message}`)
    return data
  })
  return new Map(filas.map((f) => [f.id, { numero: numeroDeFactura(f), nc: f.tipo === 3 || f.tipo === 8, cuando: f.creado_en }]))
}

/**
 * Lo que la venta trae de AFUERA del motor, para un lote de filas de `venta_ficha`: el espejo de GN (cliente, número,
 * estado del mayorista, factura) y el pedido de TN (estado, envío). Devuelve Maps por id.
 */
async function deAfuera(sb, ventas) {
  const tnIds = ventas.map(tnIdDe).filter(Boolean)
  const tnNumeros = ventas.map((v) => v.detalle?.tn?.numero).filter((x) => x != null).map(String)
  const [gnPorId, gnPorTn, ordenes] = await Promise.all([
    enTandas(ventas.map(gnIdDe), async (t) => {
      const { data, error } = await sb.from('ventas').select('id, number, client_name, sale_state').in('id', t)
      if (error) throw new Error(`ventas: ${error.message}`)
      return data
    }),
    enTandas(tnNumeros, async (t) => {
      const { data, error } = await sb.from('ventas').select('id, number, client_name, tn_order').in('tn_order', t)
      if (error) throw new Error(`ventas (TN): ${error.message}`)
      return data
    }),
    enTandas(tnIds, async (t) => {
      const { data, error } = await sb.from('tn_orden').select('tienda, tn_id, numero, estado, envio_tipo, creada_en, actualizada_en').in('tn_id', t)
      if (error) throw new Error(`tn_orden: ${error.message}`)
      return data
    }),
  ])
  const gn = new Map(gnPorId.map((g) => [String(g.id), g]))
  const porTn = new Map(gnPorTn.map((g) => [String(g.tn_order), g]))
  const orden = new Map(ordenes.map((o) => [String(o.tn_id), o]))
  const deVenta = (v) => gn.get(gnIdDe(v)) || (v.detalle?.tn?.numero != null ? porTn.get(String(v.detalle.tn.numero)) : null) || null
  const idsGn = ventas.map((v) => deVenta(v)?.id).filter((x) => x != null)
  const facturasGn = await enTandas(idsGn.map(String), async (t) => {
    const { data, error } = await sb.from('ventas_factura_gn').select('venta_id, numero, fecha').in('venta_id', t)
    if (error) throw new Error(`ventas_factura_gn: ${error.message}`)
    return data
  })
  const facGn = new Map(facturasGn.map((f) => [String(f.venta_id), f]))
  const erp = await facturasDelErp(ventas.flatMap((v) => (v.facturas || []).map((f) => f.factura_id)))
  return { deVenta, orden: (v) => orden.get(tnIdDe(v)) || null, facGn: (g) => (g ? facGn.get(String(g.id)) || null : null), erp }
}

/** `pendienteDeVentas` del motor (§16) → { venta_id: $ }. Si falla, la lista sigue con lo que dejó a cuenta (dicho en la ficha). */
async function leerPendientes(marca, ids) {
  const m = await moduloDelMotor('cuenta')
  const r = await conPg(marca, async (db) => m.pendienteDeVentas(db, { venta_ids: ids })).catch(() => null)
  return r?.ok ? r.pendientes : {}
}

/**
 * Las cuentas con las que se puede COBRAR una venta de esa línea (`cuenta_cobro`): ⛔ «Saldo a favor» ni «Cuenta corriente»
 * (`registrarPagoACuenta` las rechaza: ⛔ es plata que entra).
 */
async function cuentasDeCobro(sb, linea) {
  const { data, error } = await sb.from('cuenta_cobro').select('id, nombre, medio').eq('marca', linea).eq('activa', true).not('medio', 'in', '(saldo,cuenta)').order('nombre')
  if (error) return []
  return data
}

/** La última nota vigente de la vista (`notas`, por fecha) como la lee la lista: texto y de dónde vino. */
function notaVigente(notas) {
  const n = Array.isArray(notas) && notas.length ? notas[notas.length - 1] : null
  return n ? { id: n.id, texto: n.texto, de: deDondeNota(n) } : null
}

/** La fila cruda que entiende `armarFila`. */
function filaCruda(v, a, numeros) {
  const g = a.deVenta(v)
  const o = a.orden(v)
  const fg = a.facGn(g)
  const fe = (v.facturas || []).map((f) => a.erp.get(f.factura_id)).filter((f) => f && !f.nc)[0]
  return {
    kind: 'venta', id: v.id, numero: v.numero, linea: v.marca, tipo: v.tipo, estado: v.estado, origen: v.origen,
    canal: v.canal, deposito: v.deposito, total: v.total, prueba: v.prueba, usuario: v.vendedor || v.usuario, ocurridaEn: v.ocurrida_en, tnCreadaEn: o?.creada_en ?? null,
    nota: notaVigente(v.notas), entrega: v.entrega ?? null, clienteId: v.cliente_id ?? null, vueltaPendiente: a.vueltas.get(v.id) ?? null,
    cliente: v.cliente, clienteGn: g?.client_name ?? null, gnNumero: g?.number ?? null, gnEstado: v.detalle?.sale_state ?? g?.sale_state ?? null,
    tnNumero: v.detalle?.tn?.numero ?? o?.numero ?? null, tnEstado: o?.estado ?? null, envioTipo: o?.envio_tipo ?? null,
    pagos: (v.pagos || []).map((p) => ({ medio: p.medio, cuenta: p.cuenta, monto: Number(p.monto) })),
    facturaErp: fe?.numero ?? null, facturaGn: fg?.numero ?? null, tieneCambio: v.tiene_cambio,
    pendiente: v.pendiente ?? null,
    originalNumero: v.venta_original_id ? numeros.get(v.venta_original_id) ?? null : null,
    link: o && ADMIN[o.tienda] ? `${ADMIN[o.tienda]}/orders/${o.tn_id}` : null,
  }
}

/** Lo que suma la 027 (§16) a `venta_ficha`: lo editable y `notas` (las vigentes, jsonb por fecha). */
const COLUMNAS_027 = 'vendedor, entrega, facturar, notas'
const COLUMNAS_LISTA = 'id, numero, cliente_id, marca, tipo, estado, origen, origen_ref, canal, deposito, total, prueba, usuario, ocurrida_en, gn_sale_id, detalle, pagos, facturas, cliente, tiene_cambio, venta_original_id'

/**
 * Las ventas propias del período (días argentinos, `desde`..`hasta` inclusive) + los pedidos de TN sin pagar (los
 * abiertos HOY, de cualquier fecha: `pedidos` ya leídos por `pedidosSinPagar`), armadas para la lista.
 */
export async function listaDeVentas({ marca, desde, hasta, pedidos = [], tnLeidaEn = null }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!DIA.test(String(desde || '')) || !DIA.test(String(hasta || '')) || desde > hasta) return { status: 400, error: 'Período inválido' }
  const sb = deps.sb || (() => { const { url, key } = cfgDeMarca(marca); return createClient(url, key) })()
  const r = rangoDeDias(desde, hasta)
  const leer = (cols) => leerTodo(sb, 'venta_ficha', (q) => q.select(cols).gte('ocurrida_en', r.desde).lt('ocurrida_en', r.hasta).order('ocurrida_en', { ascending: false }).order('id'))
  // Con la 027 la vista trae lo editable y las notas vigentes; sin ella (otra base, antes de aplicarla) sigue con lo de antes.
  const ventas = await leer(`${COLUMNAS_LISTA}, ${COLUMNAS_027}`).catch(() => leer(COLUMNAS_LISTA))
  // §17: las anuladas que esperan el desarme (o volver) entran SIEMPRE, sean del mes que sean: hasta escanearlas, alguien
  // tiene que hacer algo. Sin la 028 (otra base) la vista ⛔ está y ⛔ hay ninguna.
  const pendientes028 = deps.sb ? { data: [] } : await sb.from('venta_vuelta_pendiente').select('venta_id, vuelta')
  const vueltas = new Map((pendientes028.error ? [] : pendientes028.data).map((x) => [x.venta_id, x.vuelta]))
  const fuera = [...vueltas.keys()].filter((id) => !ventas.some((v) => v.id === id))
  if (fuera.length) ventas.push(...await enTandas(fuera, (t) => leerTodo(sb, 'venta_ficha', (q) => q.select(COLUMNAS_LISTA).in('id', t).order('id'))))
  const numeros = new Map(ventas.map((v) => [v.id, v.numero]))
  const faltan = ventas.map((v) => v.venta_original_id).filter((id) => id && !numeros.has(id))
  for (const o of await enTandas(faltan, async (t) => (await sb.from('venta').select('id, numero').in('id', t)).data || [])) numeros.set(o.id, o.numero)
  const a = { ...await deAfuera(sb, ventas), vueltas }
  const puede = await queSabeElMotor()
  // El saldo REAL (§16): sólo de las que dejaron algo a cuenta (las demás ⛔ deben nada: Σ pagos = total).
  const aCuenta = ventas.filter((v) => (v.pagos || []).some((p) => p.medio === 'cuenta')).map((v) => v.id)
  const pendientes = puede.cobrar && aCuenta.length && !deps.sb ? await leerPendientes(marca, aCuenta) : {}
  for (const v of ventas) if (v.id in pendientes) v.pendiente = pendientes[v.id]
  // Una venta de TN sin nombre ni del ERP ni de GN (Stunned no tiene GN detrás) ⛔ queda «sin nombre» para siempre: se lee de TN EN VIVO,
  // como el pedido sin pagar (Bruno, 26-oct; ⛔ se guarda: lo declarado a TN).
  const crudas = ventas.map((v) => ({ ...filaCruda(v, a, numeros), origen_ref: v.origen_ref }))
  const sinNombre = deps.compradores ? ventasDeTnSinNombre(crudas) : []
  if (sinNombre.length) {
    const nombres = await deps.compradores(sinNombre.map(({ tienda, tnId }) => ({ tienda, tnId })))
    for (const { i, tienda, tnId } of sinNombre) crudas[i].clienteTn = nombres.get(`${tienda}/${tnId}`) ?? null
  }
  const filas = [
    ...crudas.map((c) => armarFila(c)),
    ...pedidos.map((p) => armarFila({
      kind: 'pedido', tienda: p.tienda, tnId: p.tnId, tnNumero: p.numero, creadaEn: p.creadaEn, total: p.total, link: p.link, unidades: p.unidades,
      dias: p.dias, medio: p.medio, gateway: p.gateway, prendas: p.prendas, entregadoSinCobrar: !!p.entregadoSinCobrar, estado: p.estado ?? null, clienteGn: null, clienteTn: p.comprador ?? null,
    })),
  ]
  return { filas, desde, hasta, puede, tnLeidaEn }
}

/**
 * Las funciones del §16 en la copia del motor del monitor (`scripts/traer-motor.mjs`). 🔴 Rutas LITERALES: con la ruta
 * en una variable, Vercel ⛔ mete el archivo en la función. Si la copia todavía ⛔ lo trae, null.
 */
async function moduloDelMotor(cual) {
  try {
    if (cual === 'correccion') return await import('../motor/venta/correccion.mjs')
    if (cual === 'correccion-medio') return await import('../motor/venta/correccion-medio.mjs')
    return cual === 'ficha' ? await import('../motor/venta/ficha.mjs') : await import('../motor/cuenta/cuenta.mjs')
  } catch {
    return null
  }
}

/**
 * Lo que las acciones del piloto necesitan del motor (contrato §16, lo arma A) y si ya está en la copia del monitor:
 * sin la función, la pantalla dibuja la ventana y dice que espera al motor (⛔ inventa un camino).
 */
export async function queSabeElMotor() {
  const [ficha, cuenta, correccion, medio] = await Promise.all([moduloDelMotor('ficha'), moduloDelMotor('cuenta'), moduloDelMotor('correccion'), moduloDelMotor('correccion-medio')])
  return {
    corregir: typeof correccion?.corregirPrecio === 'function',
    corregirMedio: typeof medio?.corregirMedioCobro === 'function',
    editar: typeof ficha?.editarVenta === 'function',
    notas: typeof ficha?.agregarNota === 'function',
    cobrar: typeof cuenta?.pendienteDeVentas === 'function' && typeof cuenta?.registrarPagoACuenta === 'function',
  }
}

export const ESPERA_AL_MOTOR = 'Todavía no está en el motor del monitor (contrato §16, sesión A): se prende cuando se publique.'

const PG_DE_MARCA = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }

/** La conexión del motor de la marca (como `conMotor` de `api/_erp.js`): sin la variable, 409 dicho. */
async function conPg(marca, fn) {
  const conexion = process.env[PG_DE_MARCA[marca]]
  if (!conexion) return { status: 409, error: 'Falta la conexión del motor en Vercel.' }
  const { default: pg } = await import('pg')
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: 5000, statement_timeout: 15000 })
  try {
    await db.connect()
    return await fn(db)
  } finally {
    await db.end().catch(() => {})
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El texto de un error del motor para la pantalla (el código va entre paréntesis para quien lo reporte). */
const errorDe = (e) => ({ status: e.codigo === 'NO_ENCONTRADA' ? 404 : 409, error: `${e.mensaje || 'El motor no lo aceptó.'} (${e.codigo})` })

/** Editar lo que ⛔ mueve stock ni plata (contrato §16): cliente, vendedor, entrega, datos para facturar. */
export async function editarVentaErp({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!UUID.test(String(body?.ventaId || ''))) return { status: 400, error: 'Venta inválida' }
  const m = deps.ficha || await moduloDelMotor('ficha')
  if (typeof m?.editarVenta !== 'function') return { status: 409, error: ESPERA_AL_MOTOR }
  const c = body.cambios || {}
  const cambios = {}
  for (const k of ['cliente_id', 'vendedor', 'entrega', 'facturar']) if (k in c) cambios[k] = c[k]
  const doc = body.clienteDoc == null ? null : String(body.clienteDoc).replace(/\D/g, '')
  if (doc != null && !/^\d{7,11}$/.test(doc)) return { status: 400, error: 'El DNI o CUIT del cliente no es válido.' }
  if (!Object.keys(cambios).length && doc == null) return { status: 400, error: 'No hay nada para guardar.' }
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conPg(marca, fn)
  return correr(async (db) => {
    // La pantalla elige al cliente por su documento (la ficha de `cliente`, §11): acá se vuelve su id, de la MISMA empresa.
    if (doc != null) {
      const [c] = (await db.query('select c.id::text from cliente c join venta v on v.empresa_id = c.empresa_id where v.id = $1 and c.doc = $2 limit 1', [body.ventaId, doc])).rows
      if (!c) return { status: 409, error: 'Ese documento no tiene ficha de cliente en el ERP (nace al hacer una factura A o en Clientes).' }
      cambios.cliente_id = c.id
    }
    const r = await m.editarVenta(db, { venta_id: body.ventaId, cambios, usuario })
    return r.ok ? { ok: true, ediciones: r.ediciones } : errorDe(r.error)
  })
}

/**
 * Corregir el precio de una venta hecha, caso 1 (motor sql/036): una corrección inmutable, ⛔ mueve plata. Devuelve el total
 * nuevo, lo cobrado y la diferencia para resolver a mano. Con factura, anulada o con cambio, el motor la rechaza.
 */
export async function corregirPrecioErp({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!UUID.test(String(body?.ventaId || ''))) return { status: 400, error: 'Venta inválida' }
  const motivo = String(body?.motivo ?? '').trim()
  if (!motivo) return { status: 400, error: 'Escribí el motivo.' }
  const lineas = Array.isArray(body?.lineas) ? body.lineas.map((l) => ({ n: Number(l?.n), precio: Number(l?.precio) })) : []
  if (!lineas.length || lineas.some((l) => !Number.isInteger(l.n) || !Number.isFinite(l.precio) || l.precio < 0)) return { status: 400, error: 'Los precios son números desde 0.' }
  const m = deps.correccion || await moduloDelMotor('correccion')
  if (typeof m?.corregirPrecio !== 'function') return { status: 409, error: ESPERA_AL_MOTOR }
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conPg(marca, fn)
  return correr(async (db) => {
    const r = await m.corregirPrecio(db, { venta_id: body.ventaId, motivo, usuario, lineas })
    return r.ok ? { ok: true, correccion: r.correccion } : errorDe(r.error)
  })
}

/**
 * Corregir el MEDIO de un cobro ya hecho (motor sql/042): la red para cuando alguien marca «pagado» en Tienda Nube antes de
 * cargar el cobro en Logística. Una corrección inmutable con el medio anterior y el nuevo; cambia la cuenta, la cuenta real, la
 * comisión y con eso el IVA. Con factura, anulada o con cambio, el motor la rechaza. `pagoId` sólo si la venta cobró más de una vez.
 */
export async function corregirMedioErp({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!UUID.test(String(body?.ventaId || ''))) return { status: 400, error: 'Venta inválida' }
  const motivo = String(body?.motivo ?? '').trim()
  if (!motivo) return { status: 400, error: 'Escribí el motivo.' }
  const medio = String(body?.medio ?? '').trim()
  if (!medio) return { status: 400, error: 'Elegí el medio de cobro.' }
  if (body?.pagoId != null && body.pagoId !== '' && !UUID.test(String(body.pagoId))) return { status: 400, error: 'Cobro inválido' }
  const m = deps.correccionMedio || await moduloDelMotor('correccion-medio')
  if (typeof m?.corregirMedioCobro !== 'function') return { status: 409, error: ESPERA_AL_MOTOR }
  const pedido = { venta_id: body.ventaId, medio, motivo, usuario }
  if (body.pagoId) pedido.pago_id = body.pagoId
  if (body.cuenta != null && body.cuenta !== '') pedido.cuenta = body.cuenta
  if (body.cuentaReal) pedido.cuenta_real = String(body.cuentaReal)
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conPg(marca, fn)
  return correr(async (db) => {
    const r = await m.corregirMedioCobro(db, pedido)
    return r.ok ? { ok: true, correccion: r.correccion, avisos: r.avisos ?? [] } : errorDe(r.error)
  })
}

/** Agregar (o reemplazar) la nota de una venta. Editar = otra nota con `reemplaza_id` de la ÚLTIMA (§16). */
export async function notaDeVentaErp({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!UUID.test(String(body?.ventaId || ''))) return { status: 400, error: 'Venta inválida' }
  const texto = String(body?.texto ?? '').trim()
  if (!texto) return { status: 400, error: 'Escribí la nota.' }
  const reemplaza = body?.reemplazaId ? String(body.reemplazaId) : null
  if (reemplaza && !UUID.test(reemplaza)) return { status: 400, error: 'Nota inválida' }
  const m = deps.ficha || await moduloDelMotor('ficha')
  if (typeof m?.agregarNota !== 'function') return { status: 409, error: ESPERA_AL_MOTOR }
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conPg(marca, fn)
  return correr(async (db) => {
    const r = await m.agregarNota(db, { venta_id: body.ventaId, texto, origen: 'usuario', usuario, ...(reemplaza ? { reemplaza_id: reemplaza } : {}) })
    return r.ok ? { ok: true, nota: r.nota } : errorDe(r.error)
  })
}

/**
 * Registrar un cobro DE UNA VENTA con saldo: `registrarPagoACuenta` imputado a esa venta (§15/§16). Lo que pase el saldo
 * va a la venta más vieja que debe y sólo queda a favor si no debe nada (lo hace el motor; la ventana lo explica).
 * 🔑 El monto llega como texto y pasa por `parsearMonto` del lado del navegador: acá se valida el número.
 */
export async function cobrarVentaErp({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!UUID.test(String(body?.ventaId || ''))) return { status: 400, error: 'Venta inválida' }
  if (!UUID.test(String(body?.clienteId || ''))) return { status: 400, error: 'La venta no tiene cliente del ERP: sin cliente no hay cuenta corriente.' }
  const monto = Math.round(Number(body?.monto) * 100) / 100
  if (!(monto > 0)) return { status: 400, error: 'Monto inválido' }
  if (!body?.cuenta) return { status: 400, error: 'Elegí la cuenta.' }
  if (!/^[0-9a-f-]{8,}$/i.test(String(body?.ref || ''))) return { status: 400, error: 'Falta la clave del cobro.' }
  const m = deps.cuenta || await moduloDelMotor('cuenta')
  if (typeof m?.registrarPagoACuenta !== 'function') return { status: 409, error: ESPERA_AL_MOTOR }
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conPg(marca, fn)
  return correr(async (db) => {
    const r = await m.registrarPagoACuenta(db, {
      cliente_id: body.clienteId, marca: body.linea || marca, monto, cuenta: String(body.cuenta), origen_ref: `erp-cobro:${body.ref}`,
      usuario, prueba: body.prueba !== false, ...(body.canal ? { canal: String(body.canal) } : {}), imputar: [{ venta_id: body.ventaId, monto: Math.min(monto, Number(body.saldo) || monto) }],
      ...(body.fecha ? { ocurrida_en: `${body.fecha}T15:00:00.000Z` } : {}),
    })
    return r.ok ? { ok: true, pago: r.pago, cuenta: r.cuenta, yaExistia: r.ya_existia } : errorDe(r.error)
  })
}

/**
 * Registrar un cobro A LA CUENTA de un cliente, SIN elegir venta (el botón «Cobrar» de la cuenta corriente): `registrarPagoACuenta`
 * sin `imputar` ⇒ el motor lo aplica a la compra más VIEJA que debe, y lo que sobra a la siguiente (FIFO); sólo queda a favor si el
 * cliente no debe nada (Bruno y Darío, 18-oct). Hermana de `cobrarVentaErp`, que SÍ elige una venta. La clave `ref` evita duplicar.
 */
export async function cobrarCuentaErp({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!UUID.test(String(body?.clienteId || ''))) return { status: 400, error: 'Elegí el cliente.' }
  const monto = Math.round(Number(body?.monto) * 100) / 100
  if (!(monto > 0)) return { status: 400, error: 'Monto inválido' }
  if (!body?.cuenta) return { status: 400, error: 'Elegí la cuenta.' }
  if (!/^[0-9a-f-]{8,}$/i.test(String(body?.ref || ''))) return { status: 400, error: 'Falta la clave del cobro.' }
  const m = deps.cuenta || await moduloDelMotor('cuenta')
  if (typeof m?.registrarPagoACuenta !== 'function') return { status: 409, error: ESPERA_AL_MOTOR }
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conPg(marca, fn)
  return correr(async (db) => {
    const r = await m.registrarPagoACuenta(db, {
      cliente_id: body.clienteId, marca: body.linea || marca, monto, cuenta: String(body.cuenta), origen_ref: `erp-cobro-cuenta:${body.ref}`,
      usuario, prueba: body.prueba !== false, ...(body.canal ? { canal: String(body.canal) } : {}),
      ...(body.fecha ? { ocurrida_en: `${body.fecha}T15:00:00.000Z` } : {}),
    })
    return r.ok ? { ok: true, pago: r.pago, cuenta: r.cuenta, yaExistia: r.ya_existia } : errorDe(r.error)
  })
}

/**
 * Lo de AFUERA del motor para la ficha de UNA venta: cliente y número de GN, pedido de TN (con su link), facturas con
 * número y fecha (del ERP y de GN) para el historial. Las ediciones y notas, cuando el motor las tenga (§16).
 */
export async function extraDeVenta({ marca, id }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return { status: 400, error: 'Venta inválida' }
  const sb = deps.sb || (() => { const { url, key } = cfgDeMarca(marca); return createClient(url, key) })()
  let { data: v, error } = await sb.from('venta_ficha').select(`${COLUMNAS_LISTA}, ${COLUMNAS_027}`).eq('id', id).maybeSingle()
  if (error) ({ data: v, error } = await sb.from('venta_ficha').select(COLUMNAS_LISTA).eq('id', id).maybeSingle())
  if (error) throw new Error(`venta_ficha: ${error.message}`)
  if (!v) return { status: 404, error: 'La venta no existe.' }
  const [a, cuentas] = await Promise.all([deAfuera(sb, [v]), cuentasDeCobro(sb, v.marca)])
  const g = a.deVenta(v)
  const o = a.orden(v)
  const fg = a.facGn(g)
  const facturas = [
    ...(v.facturas || []).map((f) => a.erp.get(f.factura_id)).filter(Boolean).map((f) => ({ numero: f.numero, tipo: f.nc ? 'nc' : 'factura', de: 'erp', cuando: f.cuando })),
    ...(fg ? [{ numero: fg.numero, tipo: 'factura', de: 'gn', cuando: null }] : []),
  ]
  return {
    clienteGn: g?.client_name ?? null, gnNumero: g?.number ?? null, gnEstado: v.detalle?.sale_state ?? g?.sale_state ?? null,
    vendedor: v.vendedor ?? null, entrega: v.entrega ?? null, facturar: v.facturar ?? null, clienteId: v.cliente_id ?? null,
    // 🔑 La ENTREGA QUE COBRA (motor sql/039): si Logística cobró al entregar, la venta lo lleva en `detalle.entrega` (quién, cuándo, con qué; la transferencia queda «por verificar»).
    cobroEnEntrega: v.detalle?.entrega ? { entrego: v.detalle.entrega.entrego ?? null, fecha: v.detalle.entrega.fecha ?? null, formaPago: v.detalle.entrega.forma_pago ?? null, porVerificar: v.detalle.entrega.por_verificar === true } : null,
    tn: o ? { numero: o.numero, estado: o.estado, envioTipo: o.envio_tipo, creadaEn: o.creada_en, actualizadaEn: o.actualizada_en, link: ADMIN[o.tienda] ? `${ADMIN[o.tienda]}/orders/${o.tn_id}` : null } : null,
    facturas, cuentas, ...(await delMotorParaLaFicha(marca, id, deps)),
  }
}

/**
 * Las ediciones y la nota vigente de la venta (§16: `historialDe`, `notasDe`). Sin la función o sin conexión: vacías y
 * `motor` dice por qué (la ficha lo muestra al pie del historial, ⛔ calla).
 */
async function delMotorParaLaFicha(marca, id, deps) {
  const m = deps.ficha !== undefined ? deps.ficha : await moduloDelMotor('ficha')
  if (typeof m?.historialDe !== 'function') return { ediciones: [], notas: [], nota: null, correcciones: [], motor: ESPERA_AL_MOTOR }
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conPg(marca, fn)
  const r = await correr(async (db) => {
    const [h, n] = await Promise.all([m.historialDe(db, { venta_id: id }), m.notasDe(db, { venta_id: id })])
    // Las correcciones de precio (sql/036): una base sin la 036 ⛔ tiene la tabla ⇒ vacías, ⛔ rompe la ficha.
    const c = await (deps.correccion !== undefined ? deps.correccion : await moduloDelMotor('correccion'))?.correccionesDe?.(db, { venta_id: id }).catch(() => null)
    return { h, n, c }
  })
  if (r.status) return { ediciones: [], notas: [], nota: null, correcciones: [], motor: r.error }
  const ediciones = (r.h.ok ? r.h.ediciones : []).map((e) => ({ campo: e.campo, antes: textoDeCampo(e.campo, e.antes), despues: textoDeCampo(e.campo, e.despues), usuario: e.usuario, cuando: e.en }))
  const vigente = (r.n.ok ? r.n.notas : [])[0] || null
  const notas = []
  if (vigente) {
    const versiones = [...(vigente.historial || []), vigente]
    versiones.forEach((x, i) => notas.push({ cuando: x.creada_en, texto: x.texto, de: deDondeNota(x), reemplaza: i ? versiones[i - 1].texto : null }))
  }
  const correcciones = r.c?.ok ? r.c : { correcciones: [], total: null, cobrado: null, diferencia: 0 }
  return { ediciones, notas, nota: vigente ? { id: vigente.id, texto: vigente.texto, de: deDondeNota(vigente) } : null, correcciones, motor: null }
}

/** «camila» · «vino con el pedido de Tienda Nube» · «importada del Excel» (diseño §5). */
export function deDondeNota(n) {
  if (n.origen === 'tn') return 'vino con el pedido de Tienda Nube'
  if (n.origen === 'ml') return 'vino con la venta de Mercado Libre'
  if (n.origen === 'catalogo') return 'vino con el pedido del catálogo'
  if (n.origen === 'importacion') return n.detalle ? `importada · ${n.detalle}` : 'importada'
  return n.usuario || 'usuario'
}

/** Un valor de `venta_edicion` (jsonb) como se lee: el cliente por su nombre, la entrega con su dirección. */
export function textoDeCampo(campo, v) {
  if (v == null) return '—'
  if (campo === 'cliente') return v.nombre || v.id || '—'
  if (campo === 'entrega') return [{ retira: 'Retira', envio: 'Envío', cadete: 'Cadete' }[v.tipo] || v.tipo, v.direccion].filter(Boolean).join(' · ')
  if (campo === 'facturar') return [v.doc, v.condicion_iva].filter(Boolean).join(' · ')
  return String(v)
}
