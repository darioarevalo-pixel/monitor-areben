/**
 * `erp › Reglas` (❓ 15, partes 1+2 de `reglas-comerciales.md`): las REGLAS COMERCIALES por forma de pago de cada
 * tienda, cargarlas y probarlas en el simulador. La regla y la cuenta son del motor (`motor/venta/reglas.mjs`, tabla
 * `regla_comercial` de sql/016); acá sólo se junta lo que el motor ⛔ ve: la Agenda (base de BDI), la configuración de la
 * Caja (para comparar y sembrar) y las campañas de Liquidación. Las categorías son las de Tienda Nube y las pone la
 * pantalla con el catálogo (`matchTn`), como en la Caja: la de GN la tienen 135 de 890 productos activos de Zattia.
 *
 * 🔴 Hasta la parte 3 la Caja ⛔ cobra con esto: cobra con `caja_config` como siempre. La pantalla lo dice, y compara
 * las reglas guardadas con lo que hoy cobra la Caja para que ⛔ se separen callados.
 *
 * Entra por `api/_erp.js` (sólo admin). `deps.conMotor` es el de `_erp.js` (la conexión del motor de la marca);
 * `deps.sb(base)`, opcional, el cliente de Supabase de esa base (para caminarlo sin deploy).
 */
import { createClient } from '@supabase/supabase-js'
import { cfgDeMarca } from './_recepciones-base.js'
import { reglasGuardadas } from './_caja-reglas.js'
import { marcaDeCaja } from '../lib/caja/marcas.core.js'
import { compararConCaja, leerReglaDePantalla, leerSimulacion } from '../lib/erp/reglas.core.js'

const MARCAS = ['bdi', 'zattia']
const SIN_TABLA = 'Las reglas todavía no están en esta base (falta la migración 016 del motor).'

const motor = () => Promise.all([import('../motor/venta/reglas.mjs'), import('../motor/venta/reglas-db.mjs')])

const clienteDe = (base, deps) => {
  if (deps && deps.sb) return deps.sb(base)
  const { url, key } = cfgDeMarca(base)
  return createClient(url, key)
}

/** La promo bancaria del mostrador, LEÍDA de la Agenda (base de BDI), como reglas. */
async function deAgenda(marca, reglasDeAgenda, deps) {
  const { data, error } = await clienteDe('bdi', deps).from('agenda_promos')
    .select('id, banco, medio, beneficio, regla, desde, hasta, canales, marcas, activa').eq('activa', true)
  if (error) throw new Error(`No se pudo leer la Agenda (${error.message}).`)
  return reglasDeAgenda(data || [], { marca })
}

/** La configuración guardada de la Caja de la marca. */
async function configDeCaja(sb, marca) {
  const cajaDe = marcaDeCaja(marca)
  if (!cajaDe) throw new Error('La marca no tiene Caja.')
  return reglasGuardadas(sb, marca, cajaDe)
}

/**
 * Todo lo de la pantalla: las reglas guardadas (activas y apagadas), las de la Agenda, cómo cobra HOY la Caja traducido
 * a reglas (y si las guardadas dicen lo mismo) y las campañas de Liquidación para elegir.
 */
export async function reglasDeMarca({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const sb = clienteDe(marca, deps)
  const [[nucleo, db], config, campanias] = await Promise.all([
    motor(), configDeCaja(sb, marca),
    sb.from('liquidaciones').select('id, nombre, estado, created_at').eq('store', marca).order('created_at', { ascending: false }).limit(60),
  ])
  if (campanias.error) throw new Error(`liquidaciones: ${campanias.error.message}`)
  const agenda = await deAgenda(marca, nucleo.reglasDeAgenda, deps)
  const caja = nucleo.reglasDeCaja(config, { marca })
  return deps.conMotor(marca, 'Las reglas', async (pg) => {
    if (!(await db.hayReglas(pg))) return { status: 409, error: SIN_TABLA }
    const guardadas = await db.leerReglas(pg, { marcas: [marca] })
    return {
      reglas: guardadas, agenda,
      caja: { reglas: caja.reglas, avisos: caja.avisos, feriaCampanias: config.feriaCampanias || [], diferencias: compararConCaja(guardadas, caja.reglas) },
      campanias: (campanias.data || []).map((c) => ({ id: c.id, nombre: c.nombre, estado: c.estado, feria: (config.feriaCampanias || []).includes(c.id) })),
    }
  })
}

/** Cargar o corregir/apagar una regla. La marca la pone el servidor (la de la pantalla). */
export async function guardarReglaErp({ marca, body, usuario }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const l = leerReglaDePantalla(body && body.regla, { marca })
  if (l.error) return { status: 400, error: l.error }
  const [, db] = await motor()
  return deps.conMotor(marca, 'Guardar reglas', async (pg) => {
    if (!(await db.hayReglas(pg))) return { status: 409, error: SIN_TABLA }
    const r = await db.guardarRegla(pg, { regla: l.regla, usuario: usuario || 'admin' })
    if (!r.ok) return { status: r.error.codigo === 'NO_EXISTE' ? 404 : 400, error: r.error.mensaje, campo: r.error.campo ?? null }
    return { ok: true, regla: r.regla, nueva: r.nueva }
  })
}

/** Traer las reglas de HOY de la Caja como filas (una sola vez por marca). `escribir: false` = qué traería. */
export async function sembrarReglasErp({ marca, body, usuario }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const config = await configDeCaja(clienteDe(marca, deps), marca)
  const [, db] = await motor()
  return deps.conMotor(marca, 'Traer las reglas de la Caja', async (pg) => {
    if (!(await db.hayReglas(pg))) return { status: 409, error: SIN_TABLA }
    const r = await db.sembrarDeCaja(pg, { marca, config, usuario: usuario || 'admin', escribir: body && body.escribir === true })
    if (!r.ok) return { status: 400, error: r.error.mensaje }
    return { ok: true, sembradas: r.sembradas, yaEstaban: r.yaEstaban, seco: !!r.seco, reglas: r.reglas, avisos: r.avisos }
  })
}

/**
 * EL SIMULADOR: prendas + fecha (+ banco/cuotas del crédito, + una regla en borrador) ⇒ cuánto con cada forma de pago y
 * por qué regla. El servidor completa cada prenda: sus campañas de Liquidación (aplicadas) y su PRECIO DE CAMPAÑA (la
 * campaña primero, Bruno 16-oct). Las categorías (de TN) vienen de la pantalla. Con la regla en borrador, la prueba antes
 * de guardarla.
 */
export async function simularReglasErp({ marca, body }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const s = leerSimulacion(body, { marca, ahora: Date.now() })
  if (s.error) return { status: 400, error: s.error }
  const [nucleo, db] = await motor()
  let extra = []
  if (s.borrador) {
    const v = nucleo.validarRegla({ ...s.borrador, marca })
    if (!v.ok) return { status: 400, error: `La regla nueva: ${v.error.mensaje}`, campo: v.error.campo ?? null }
    extra = [{ ...v.regla, id: v.regla.id ?? 'borrador', nombre: `${v.regla.nombre} (sin guardar)` }]
  }
  const sb = clienteDe(marca, deps)
  const [config, agenda] = await Promise.all([configDeCaja(sb, marca), deAgenda(marca, nucleo.reglasDeAgenda, deps)])
  return deps.conMotor(marca, 'El simulador', async (pg) => {
    if (!(await db.hayReglas(pg))) return { status: 409, error: SIN_TABLA }
    let reglas = [...(await db.leerReglas(pg, { marcas: [marca] })), ...agenda]
    // Corregir una regla en el borrador reemplaza a la guardada en la prueba.
    if (extra.length && s.borrador.id) reglas = reglas.filter((r) => r.id !== String(s.borrador.id))
    // Las campañas que importan: las de las reglas (y la del borrador) y las de oferta de la Caja.
    const ids = [...new Set([...reglas, ...extra].map((r) => r.campania).filter(Boolean).concat(config.feriaCampanias || []))]
    const pids = s.renglones.map((r) => r.producto).filter(Boolean)
    const items = ids.length && pids.length
      ? await sb.from('liquidacion_items').select('pid, liq_id, datos').eq('store', marca).in('liq_id', ids).in('pid', pids.map(String)).eq('estado', 'aplicado')
      : { data: [], error: null }
    if (items.error) throw new Error(`liquidacion_items: ${items.error.message}`)
    const enCampania = new Map(), precioCampania = new Map()
    const cuando = new Map()
    for (const f of items.data || []) {
      const n = Number(f.pid)
      enCampania.set(n, [...(enCampania.get(n) || []), f.liq_id])
      const d = f.datos || {}
      const p = Number((d.aplicacion && d.aplicacion.precioEscrito) ?? (d.decision && d.decision.precioSale))
      const t = Number((d.aplicacion && d.aplicacion.aplicadoEn) || 0)
      if (p > 0 && !(cuando.get(n) > t)) { precioCampania.set(n, p); cuando.set(n, t) }
    }
    const renglones = s.renglones.map((r) => {
      const n = r.producto ? Number(r.producto) : null
      const deCampania = n && precioCampania.has(n) ? precioCampania.get(n) : null
      return {
        product_id: n || 0, nombre: r.nombre || 'Prenda', cantidad: r.cantidad,
        precio: deCampania ?? r.precio, precioCargado: r.precio, precioDeCampania: deCampania,
        campanias: n ? enCampania.get(n) || [] : r.campanias, categorias: r.categorias,
      }
    })
    const redondeo = Number(config.redondeo) || 100
    const formas = nucleo.simular({ renglones, reglas, extra, marca, canal: s.canal, fecha: s.fecha, redondeo, rebajaVenta: s.rebaja, credito: s.credito })
    return { renglones, formas, fecha: s.fecha, canal: s.canal, redondeo }
  })
}
