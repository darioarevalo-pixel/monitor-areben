/**
 * `erp › Reglas` (❓ 15, partes 1+2 de `reglas-comerciales.md`): las REGLAS COMERCIALES por forma de pago de cada
 * tienda, cargarlas y probarlas en el simulador. La regla y la cuenta son del motor (`motor/venta/reglas.mjs`, tabla
 * `regla_comercial` de sql/016); acá sólo se junta lo que el motor ⛔ ve: la Agenda (base de BDI), la configuración de la
 * Caja (para comparar y sembrar) y las campañas de Liquidación. Las categorías son las de Tienda Nube y las pone la
 * pantalla con el catálogo (`matchTn`), como en la Caja: la de GN la tienen 135 de 890 productos activos de Zattia.
 *
 * 🔑 Parte 3 (17-oct): «la Caja cobra con las reglas» se PRENDE por marca (`prenderCajaErp`): se copian las reglas activas
 * a `caja_config.reglas.reglasComerciales` y la Caja saca el % de ahí (`lib/caja/core.core.js`, `pctDePago`). Prendida,
 * cada cambio de una regla vuelve a copiar. Apagada, la Caja cobra con `caja_config` como siempre, y la pantalla compara
 * las reglas guardadas con lo que hoy cobra la Caja para que ⛔ se separen callados.
 *
 * 🔑 Stunned (Bruno, 17-oct): sus reglas viven en la pantalla de Zattia (`marca = 'stunned'`, misma base y misma Caja) y se
 * leen, copian y simulan con las de Zattia (`marcasDe`); cada prenda usa las de su línea (`deLaLinea` del motor).
 *
 * Entra por `api/_erp.js` (sólo admin). `deps.conMotor` es el de `_erp.js` (la conexión del motor de la marca);
 * `deps.sb(base)`, opcional, el cliente de Supabase de esa base (para caminarlo sin deploy).
 */
import { createClient } from '@supabase/supabase-js'
import { cfgDeMarca } from './_recepciones-base.js'
import { reglasGuardadas } from './_caja-reglas.js'
import { marcaDeCaja } from '../lib/caja/marcas.core.js'
import { compararConCaja, copiaParaCaja, leerReglaDePantalla, leerSimulacion, marcasDe, queNoCobraLaCaja } from '../lib/erp/reglas.core.js'

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
    const guardadas = await db.leerReglas(pg, { marcas: marcasDe(marca) })
    const rc = config.reglasComerciales
    const prendida = !!(rc && rc.prendida === true)
    return {
      reglas: guardadas, agenda,
      caja: { reglas: caja.reglas, avisos: caja.avisos, feriaCampanias: config.feriaCampanias || [], diferencias: compararConCaja(guardadas.filter((r) => r.marca === marca), caja.reglas) },
      // Parte 3: si la Caja ya cobra con las reglas, con qué copia (y si está al día con las guardadas).
      cobraConReglas: {
        prendida, copiadasEn: (rc && rc.copiadasEn) || null, por: (rc && rc.por) || null,
        alDia: !prendida || JSON.stringify(copiaParaCaja(guardadas, marca)) === JSON.stringify(rc.lista),
        noCobra: queNoCobraLaCaja(guardadas, marca),
      },
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
    return { ok: true, regla: r.regla, nueva: r.nueva, caja: await recopiarSiPrendida(pg, db, marca, usuario, deps) }
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
    const caja = r.seco ? null : await recopiarSiPrendida(pg, db, marca, usuario, deps)
    return { ok: true, sembradas: r.sembradas, yaEstaban: r.yaEstaban, seco: !!r.seco, reglas: r.reglas, avisos: r.avisos, caja }
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
    const v = nucleo.validarRegla({ ...s.borrador, marca: marcasDe(marca).includes(s.borrador.marca) ? s.borrador.marca : marca })
    if (!v.ok) return { status: 400, error: `La regla nueva: ${v.error.mensaje}`, campo: v.error.campo ?? null }
    extra = [{ ...v.regla, id: v.regla.id ?? 'borrador', nombre: `${v.regla.nombre} (sin guardar)` }]
  }
  const sb = clienteDe(marca, deps)
  const [config, agenda] = await Promise.all([configDeCaja(sb, marca), deAgenda(marca, nucleo.reglasDeAgenda, deps)])
  return deps.conMotor(marca, 'El simulador', async (pg) => {
    if (!(await db.hayReglas(pg))) return { status: 409, error: SIN_TABLA }
    let reglas = [...(await db.leerReglas(pg, { marcas: marcasDe(marca) })), ...agenda]
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
        campanias: n ? enCampania.get(n) || [] : r.campanias, categorias: r.categorias, ...(r.linea ? { linea: r.linea } : {}),
      }
    })
    const redondeo = Number(config.redondeo) || 100
    const formas = nucleo.simular({ renglones, reglas, extra, marca, canal: s.canal, fecha: s.fecha, redondeo, rebajaVenta: s.rebaja, credito: s.credito })
    return { renglones, formas, fecha: s.fecha, canal: s.canal, redondeo }
  })
}

/**
 * Escribe la copia de las reglas en `caja_config.reglas.reglasComerciales` (o la apaga), sin pisar otro cambio de la
 * configuración de la Caja hecho al mismo tiempo (mismo candado que `guardarReglas` de `api/_caja.js`: `actualizado_en`).
 * @returns {Promise<{ ok: true, copiadas: number } | { ok: false, error: string }>}
 */
async function escribirEnCaja(sb, marca, { prendida, lista, usuario }) {
  for (let i = 0; i < 4; i++) {
    const { data: fila, error } = await sb.from('caja_config').select('reglas, actualizado_en').eq('store', marca).maybeSingle()
    if (error) return { ok: false, error: `No se pudo leer la configuración de la Caja (${error.message}).` }
    if (!fila) return { ok: false, error: 'La Caja de esta marca todavía no se abrió nunca: no tiene configuración.' }
    const ahora = new Date().toISOString()
    const reglasComerciales = prendida ? { prendida: true, lista, copiadasEn: ahora, por: usuario || 'admin' } : { ...(fila.reglas.reglasComerciales || {}), prendida: false, apagadaEn: ahora, apagadaPor: usuario || 'admin' }
    let q = sb.from('caja_config').update({ reglas: { ...fila.reglas, reglasComerciales }, actualizado_por: usuario || null, actualizado_en: ahora }).eq('store', marca)
    q = fila.actualizado_en == null ? q.is('actualizado_en', null) : q.eq('actualizado_en', fila.actualizado_en)
    const up = await q.select('store').maybeSingle()
    if (up.error) return { ok: false, error: `No se pudo guardar en la Caja (${up.error.message}).` }
    if (up.data) return { ok: true, copiadas: prendida ? lista.length : 0 }
  }
  return { ok: false, error: 'La configuración de la Caja cambió mientras se guardaba: probá de nuevo.' }
}

/** Prendida ⇒ vuelve a copiar las reglas activas a la Caja. Devuelve qué pasó (para que la pantalla lo diga). */
async function recopiarSiPrendida(pg, db, marca, usuario, deps) {
  const sb = clienteDe(marca, deps)
  const config = await configDeCaja(sb, marca)
  if (!(config.reglasComerciales && config.reglasComerciales.prendida === true)) return null
  const lista = copiaParaCaja(await db.leerReglas(pg, { marcas: marcasDe(marca) }), marca)
  const w = await escribirEnCaja(sb, marca, { prendida: true, lista, usuario })
  // 🔴 Si la copia ⛔ se pudo escribir, la Caja sigue cobrando con la ANTERIOR: se dice, ⛔ se calla.
  return w.ok ? { copiadas: w.copiadas } : { error: `La regla se guardó, pero la Caja sigue con las reglas de antes: ${w.error}` }
}

/**
 * Prender o apagar «la Caja cobra con las reglas» en una marca (sólo admin). Prender copia las reglas activas; antes,
 * exige que estén traídas las de la Caja (si no, prenderla con la tabla vacía cobraría TODO a precio de lista).
 */
export async function prenderCajaErp({ marca, body, usuario }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!body || typeof body.prender !== 'boolean') return { status: 400, error: 'Falta si se prende o se apaga' }
  const [, db] = await motor()
  const sb = clienteDe(marca, deps)
  return deps.conMotor(marca, 'La Caja cobra con las reglas', async (pg) => {
    if (!(await db.hayReglas(pg))) return { status: 409, error: SIN_TABLA }
    if (!body.prender) {
      const w = await escribirEnCaja(sb, marca, { prendida: false, lista: [], usuario })
      return w.ok ? { ok: true, prendida: false } : { status: 409, error: w.error }
    }
    const guardadas = await db.leerReglas(pg, { marcas: marcasDe(marca) })
    if (!guardadas.some((r) => r.origen === 'caja')) return { status: 409, error: 'Primero traé las reglas de la Caja: sin ellas, la Caja cobraría todo a precio de lista.' }
    const lista = copiaParaCaja(guardadas, marca)
    const w = await escribirEnCaja(sb, marca, { prendida: true, lista, usuario })
    return w.ok ? { ok: true, prendida: true, copiadas: w.copiadas } : { status: 409, error: w.error }
  })
}
