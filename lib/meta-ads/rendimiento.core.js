/**
 * La ZONA DE RENDIMIENTO: **qué apago, qué escalo, qué testeo hoy** — calculado, no narrado.
 *
 * # Por qué existe, y por qué no es el Parte
 *
 * El Parte (`parte.core.js`) contesta la misma pregunta y la contesta bien, pero es **un botón que
 * copia texto para pegar en otro lado**: la herramienta admite que la decisión se toma afuera. Y no
 * podía ser otra cosa, porque se arma con cinco llamadas a Graph y el cupo de la Marketing API es
 * un porcentaje que se agota ⇒ no se puede pedir solo al entrar.
 *
 * 🔑 **Este módulo sale de la FOTO (`meta_ads_snapshot_dia`), no de Graph.** Esa sola diferencia es
 * la que lo deja ser una pantalla en vez de un botón:
 *
 *  - **se pide sola al montar** y no gasta un peso de cupo;
 *  - **tiene 90 días de historia**, así que puede mostrar el desgaste, las rachas y el marginal —
 *    cosas que Graph no contesta de una;
 *  - **sigue contestando con el token vencido**, que es justo el día en que hay que decidir algo.
 *
 * ⚠️ **Lo que la foto NO puede, y por eso el Parte no se jubila**: el día EN CURSO. Los cortes son
 * ~08:00 y ~20:00, así que lo de hoy o no está o está a medias. Traer hoy sigue siendo el botón.
 *
 * # Las cuatro trampas del dato, que ya están resueltas río arriba
 *
 * 1. **La misma plata está en los cuatro niveles** ⇒ se filtra por nivel antes de sumar nada.
 * 2. **`alcance` y `frecuencia` no se suman entre días** ⇒ `sumarDias()` los devuelve `null`.
 * 3. **El embudo vuelve `null` si ninguna fila lo medía**, nunca `0`.
 * 4. **PostgREST corta en 1.000 filas y no avisa** ⇒ las filas entran por `leerSnapshot()`.
 *
 * Este archivo es PURO: recibe filas y devuelve objetos. No sabe de Supabase, de Graph ni de
 * permisos. Es `.js` plano porque lo importan el handler y `scripts/medir-rendimiento-celdas.mjs`,
 * que corren en Node sin pasar por el compilador de Next.
 */

import { agruparAvisos } from './biblioteca.core.js'
import { cruzarConLaCaja, marginalEntreVentanas, veredicto } from './parte.core.js'
import { soloNivel, sumarDias } from './snapshot.core.js'

/**
 * Las columnas que la zona necesita. Explícitas y nunca `*`: a nivel aviso son decenas de miles de
 * filas y las que no se usan viajarían igual por la red.
 *
 * `capturado_at` no es un adorno: es lo único que deja saber **si el último día de la foto ya
 * cerró**. Ver `ultimoDiaCerrado()`.
 */
export const COLS_RENDIMIENTO = [
  'fecha', 'nivel', 'objeto_id', 'campaign_id', 'adset_id', 'nombre', 'linea', 'cuenta_id',
  'estado', 'estado_efectivo', 'estado_real', 'diario_crudo', 'moneda', 'capturado_at',
  'spend', 'impresiones', 'clicks', 'ctr', 'cpm', 'compras', 'revenue',
  'carritos', 'checkouts', 'lpv',
].join(',')

/** Cuántas conversiones por semana pide Meta para que un conjunto salga de aprendizaje. */
export const CONV_APRENDIZAJE = 50
/** Sobre cuántos días se miden esas conversiones. */
export const DIAS_APRENDIZAJE = 7
/** La ventana por defecto de la zona, y la de cada mitad de la comparación de desgaste. */
export const VENTANA = 7
/** Cuánto sube un escalón. 20% es el paso que Meta recomienda para no reiniciar el aprendizaje. */
export const PASO_ESCALON = 0.2

/**
 * Las ventanas que la zona sabe contestar.
 *
 * 🔴 **Se valida y se contesta 400, ⛔ no se cae a un default en silencio.** Ya mordió: `?dias=N`
 * fuera de los valores permitidos devolvía 30 **sin decir nada**, y *un parámetro público que la
 * propia UI no puede pedir mal es justo el que nadie prueba*.
 */
export const DIAS_ZONA = [7, 14, 30]

/**
 * Lo que el SERVIDOR sabe contestar, que es más que lo que ofrece la barra.
 *
 * 🔑 **Son dos listas y no una a propósito.** Al `1` y al `3` no se llega por un botón «1 día» al
 * lado de «7 días» —significaría otra cosa que sus vecinos— sino **clickeando un día en la tira**,
 * que es como lo pidió Bruno: *«chequear un cambio recién hecho»* y *«hace 3 días»*.
 * `DIAS_ZONA ⊂ DIAS_SERVIBLES` está amarrado por un test.
 */
export const DIAS_SERVIBLES = [1, 3, 7, 14, 30]

/** La ventana pedida, o el motivo por el que no se puede. `null`/vacío ⇒ el defecto. */
export function elegirVentana(crudo) {
  if (crudo == null || crudo === '') return { dias: VENTANA }
  const n = Number(crudo)
  if (!DIAS_SERVIBLES.includes(n)) {
    return { error: `«dias» tiene que ser ${DIAS_SERVIBLES.join(', ')} — vino «${crudo}».` }
  }
  return { dias: n }
}

/**
 * Dónde TERMINA la ventana: el día al que se ancló, o el último cerrado.
 *
 * 🔴 **Un `hasta` posterior al último día cerrado es un ERROR, ⛔ nunca un recorte silencioso.**
 * Recortarlo «para ser amable» sería dibujar medio día como si fuera entero, que es el defecto
 * original de toda esta sección y el motivo por el que existe `ultimoDiaCerrado()`. Y un pedido que
 * el servidor arregla en silencio es el que nadie prueba: ya mordió con `?dias=N` fuera de lista
 * devolviendo 30 sin decir nada.
 *
 * `primeraLeida` es el primer día que la foto trajo: pedir antes de eso no es un día vacío, es una
 * ventana que **el colchón no cubre**, y la diferencia importa porque la segunda se ve igual que
 * «ese día no gastó nadie».
 */
export function elegirCierre(crudo, { cierreReal = '', primeraLeida = '' } = {}) {
  if (crudo == null || crudo === '') return { hasta: cierreReal }
  const d = String(crudo).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: `«hasta» tiene que ser una fecha AAAA-MM-DD — vino «${crudo}».` }
  if (cierreReal && d > cierreReal) {
    return { error: `El ${d} todavía no cerró. El último día cerrado de la foto es el ${cierreReal}.` }
  }
  if (primeraLeida && d < primeraLeida) {
    return { error: `No hay foto cargada para el ${d}: lo más viejo que se leyó es el ${primeraLeida}.` }
  }
  return { hasta: d }
}

/**
 * Cuánto tiene que caer el CTR para llamarlo caída, y cuánto tiene que subir el CPM para culpar a
 * la subasta. Son dos umbrales y no uno porque **contestan preguntas distintas**: el primero dice
 * «pasó algo», el segundo dice «de quién es la culpa».
 */
export const CAIDA_CTR = 15
export const SUBA_CPM = 10
/** A partir de qué porcentaje del diario se considera que la celda está usando la caja. */
export const USA_LA_CAJA = 95
/** Debajo de qué porcentaje del techo una celda con margen es candidata a escalar. */
export const CON_AIRE = 75

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const div = (a, b) => (b ? a / b : 0)

/**
 * El último día de la foto que **ya cerró**.
 *
 * 🔴 **Hace falta y no es paranoia: la foto puede tener el día en curso a medias.** El corte de las
 * ~20:00 escribe la fila de HOY con el gasto de medio día, y `DIAS_RELECTURA` la reescribe cuatro
 * días seguidos. Una celda leída así muestra la mitad del gasto contra la mitad de las compras y el
 * costo sale plausible; el que sale mal es todo lo que compara ventanas —el desgaste y el marginal—,
 * porque un día parcial arrastra el promedio de la ventana que se compara.
 *
 * 🔑 **Se deriva del dato, ⛔ no de un `new Date()`.** Los días los corta Meta en la zona de la
 * CUENTA y esto puede correr en UTC: calcular «ayer» del lado del servidor ya falló dos veces en
 * este repo. La definición que sí se puede leer de la tabla: **un día cerró si alguna de sus filas
 * fue capturada un día posterior** — el corte de las 08:00 del día siguiente reescribe el anterior,
 * así que un día cerrado siempre tiene una captura más nueva que él.
 *
 * Conservador a propósito: si el cron no corrió hoy, devuelve anteayer. Un día de menos se ve; un
 * día parcial contado como entero no.
 */
export function ultimoDiaCerrado(filas) {
  let mejor = null
  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f || !f.fecha || !f.capturado_at) continue
    const fecha = String(f.fecha).slice(0, 10)
    const capturado = String(f.capturado_at).slice(0, 10)
    if (capturado > fecha && (!mejor || fecha > mejor)) mejor = fecha
  }
  return mejor
}

/** Las filas cuya fecha está dentro de `[desde, hasta]`. Los bordes entran. */
export function enVentana(filas, desde, hasta) {
  return (Array.isArray(filas) ? filas : []).filter((f) => {
    if (!f || !f.fecha) return false
    const d = String(f.fecha).slice(0, 10)
    return (!desde || d >= desde) && (!hasta || d <= hasta)
  })
}

/** N días hacia atrás desde `hasta`, inclusive: `desdeDe('2026-08-24', 7)` → `'2026-08-18'`. */
export function desdeDe(hasta, dias) {
  const n = Math.max(1, Math.floor(num(dias)) || 1)
  return new Date(Date.parse(`${hasta}T00:00:00Z`) - (n - 1) * 86400000).toISOString().slice(0, 10)
}

/**
 * Una fila por CELDA (conjunto), con su serie al lado.
 *
 * ⚠️ **El nombre sale del día MÁS NUEVO, no del primero.** La foto guarda el nombre al momento de
 * sacarla —a propósito: una campaña renombrada ayer no reescribe su historia—, así que una celda
 * renombrada tiene dos nombres en su serie. Quedarse con el primero la muestra con un nombre que ya
 * no existe en Ads Manager, que es la clase de diferencia que hace dudar de la pantalla entera.
 * Lo mismo con `estado_real` y `diario_crudo`: el que vale es el último.
 */
export function celdasDeLaFoto(filas) {
  const porId = new Map()
  for (const f of soloNivel(filas, 'conjunto')) {
    if (!f || !f.objeto_id) continue
    const k = String(f.objeto_id)
    if (!porId.has(k)) porId.set(k, [])
    porId.get(k).push(f)
  }
  const celdas = []
  for (const [id, suyas] of porId) {
    const serie = [...suyas].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    const ultima = serie[serie.length - 1]
    const t = sumarDias(serie)
    celdas.push({
      id,
      nombre: ultima.nombre || '(sin nombre)',
      linea: ultima.linea || 'sin-linea',
      campaignId: ultima.campaign_id ? String(ultima.campaign_id) : null,
      cuentaId: ultima.cuenta_id ? String(ultima.cuenta_id) : null,
      moneda: ultima.moneda || null,
      estado: ultima.estado || null,
      estadoReal: ultima.estado_real || null,
      // `diario_crudo` viene en la unidad MENOR de la moneda. El `/100` se hace una vez y se dice.
      diario: ultima.diario_crudo == null ? null : num(ultima.diario_crudo) / 100,
      ...t,
      costo: div(t.spend, t.compras),
      costoCarrito: t.carritos ? div(t.spend, t.carritos) : null,
      // Días con entrega, ⛔ no días de la serie: una celda que existe hace 30 días y gastó 3 no
      // lleva 30 días corriendo, y «días» es lo que decide si ya se la puede juzgar.
      diasConGasto: serie.filter((d) => num(d.spend) > 0).length,
      desde: serie[0].fecha,
      hasta: ultima.fecha,
      serie: serie.map((d) => ({
        fecha: d.fecha,
        spend: num(d.spend),
        compras: num(d.compras),
        clicks: num(d.clicks),
        impresiones: num(d.impresiones),
        diarioCrudo: d.diario_crudo == null ? null : num(d.diario_crudo),
      })),
    })
  }
  return celdas.sort((a, b) => b.spend - a.spend)
}

/**
 * La configuración de HOY de cada celda: el estado, el nombre y el diario más nuevos que haya en la
 * foto, **sin importar dónde termine la ventana**.
 *
 * 🔴 Existe por un defecto real visto en prod el 26-ago-2026. `TEST UNBOXING x SIMILAR` se pausó el
 * 25, la ventana cerraba el 24, y la celda figuraba `ACTIVE` con el botón «Pausar» encima y el
 * veredicto «apagala»: **proponía una acción que ya estaba hecha**. La foto guarda la configuración
 * en la fila del día en que se sacó, así que el último día de la ventana la tiene congelada ahí.
 *
 * 🔑 **La regla que queda: las MÉTRICAS son de la ventana, la CONFIGURACIÓN es de hoy.** Son dos
 * preguntas distintas —«cómo le fue» y «cómo está»— y mezclarlas hace que la pantalla proponga cosas
 * ya hechas, que es exactamente el ruido que hace que se le deje de creer.
 *
 * ⚠️ ⛔ No se le pasa la ventana: se le pasan TODAS las filas leídas. Cortarlas antes es el defecto.
 */
export function configDeHoy(filas) {
  const m = new Map()
  for (const f of soloNivel(filas, 'conjunto')) {
    if (!f || !f.objeto_id) continue
    const k = String(f.objeto_id)
    const prev = m.get(k)
    if (prev && String(prev.fecha) >= String(f.fecha)) continue
    m.set(k, {
      fecha: f.fecha,
      nombre: f.nombre || '(sin nombre)',
      estado: f.estado || null,
      estadoReal: f.estado_real || null,
      diario: f.diario_crudo == null ? null : num(f.diario_crudo) / 100,
    })
  }
  return m
}

/**
 * ¿Se está desgastando la pieza, o se puso cara la subasta?
 *
 * 🔴🔑 **El desgaste tiene FIRMA y es la que decide de quién es la culpa: el CTR cae y el CPM NO
 * sube.** Medido el 23-ago-2026 sobre `AD02 GIRLHOOD COLLECTION`: CTR −42%, CPC +88% y **CPM 0%**
 * ($1.777 → $1.801). Si la subasta hubiera encarecido, el CPM se habría movido; no se movió, y lo
 * que cayó fue la respuesta ⇒ el cuello es la PIEZA, no la plata.
 *
 * ⇒ **Sin las dos series juntas, un costo que sube se explica con «está caro Meta»** — que es la
 * conclusión equivocada y la más cómoda. Por eso esta función devuelve las dos variaciones aunque
 * sólo una decida.
 *
 * ⚠️ La subasta sólo es culpable si el CPM **subió**. Un CPM que bajó mientras el CTR caía no la
 * exculpa a la pieza: significa que las impresiones se abarataron y la respuesta cayó igual.
 *
 * Los ratios se recalculan desde los agregados de cada mitad, ⛔ nunca se promedian los diarios: un
 * día de 10 impresiones pesaría lo mismo que uno de 100.000.
 */
export function desgasteDe(serie, ventana = VENTANA) {
  const n = Math.max(1, Math.floor(num(ventana)) || 1)
  const orden = [...(Array.isArray(serie) ? serie : [])]
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  if (orden.length < n * 2) {
    return {
      firma: 'sin-datos',
      motivo: `hacen falta ${n * 2} dias y hay ${orden.length}`,
      ctrDelta: null, cpmDelta: null, ctrA: null, ctrB: null, cpmA: null, cpmB: null,
    }
  }
  const corte = (fs) => {
    const impresiones = fs.reduce((s, f) => s + num(f.impresiones), 0)
    const clicks = fs.reduce((s, f) => s + num(f.clicks), 0)
    const spend = fs.reduce((s, f) => s + num(f.spend), 0)
    return { ctr: div(clicks, impresiones) * 100, cpm: div(spend, impresiones) * 1000, impresiones }
  }
  const a = corte(orden.slice(-n * 2, -n))
  const b = corte(orden.slice(-n))
  // Sin impresiones en alguna mitad no hay ratio que comparar: dividir daría 0 y un CTR de 0% se
  // lee como «se derrumbó» en vez de como «no entregó».
  if (!a.impresiones || !b.impresiones) {
    return {
      firma: 'sin-datos',
      motivo: a.impresiones ? 'la ventana nueva no tuvo impresiones' : 'la ventana vieja no tuvo impresiones',
      ctrDelta: null, cpmDelta: null, ctrA: a.ctr, ctrB: b.ctr, cpmA: a.cpm, cpmB: b.cpm,
    }
  }
  const ctrDelta = ((b.ctr - a.ctr) / a.ctr) * 100
  const cpmDelta = a.cpm ? ((b.cpm - a.cpm) / a.cpm) * 100 : null
  const cayoElCtr = ctrDelta <= -CAIDA_CTR
  const subioElCpm = cpmDelta != null && cpmDelta >= SUBA_CPM
  const firma = !cayoElCtr ? 'sano' : subioElCpm ? 'subasta' : 'pieza'
  return { firma, motivo: '', ctrDelta, cpmDelta, ctrA: a.ctr, ctrB: b.ctr, cpmA: a.cpm, cpmB: b.cpm }
}

/**
 * Cuánto le falta a una celda para salir de aprendizaje, y **qué presupuesto lo compraría**.
 *
 * 🔑 **El umbral se CALCULA, no se adivina.** Meta pide 50 conversiones en 7 días por conjunto ⇒
 * `presupuesto/día = 50 × CPA ÷ 7`. Es la cuenta que decide si un escalón sirve o es decorativo.
 *
 * 🔴 **Y cada edición significativa de presupuesto REINICIA el contador**, así que una escalera de
 * a 20% puede reiniciarlo tres veces y no cruzar nunca: **un paso que cruza vale más que tres que
 * no.** `reiniciadoEl` es la última fecha en que el diario cambió, y es lo que hace que eso se
 * pueda ver en vez de razonarlo cada vez.
 *
 * ⚠️ Sólo mira pares de días con diario en los DOS: `diario_crudo` es `null` en el backfill (Meta no
 * expone el histórico de presupuestos), y un `null` al lado de un número no es un cambio.
 */
export function aprendizajeDe(celda, ventana = DIAS_APRENDIZAJE) {
  const n = Math.max(1, Math.floor(num(ventana)) || 1)
  const orden = [...((celda && celda.serie) || [])]
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  const ult = orden.slice(-n)
  const compras = ult.reduce((s, d) => s + num(d.compras), 0)
  const spend = ult.reduce((s, d) => s + num(d.spend), 0)
  const cpa = div(spend, compras)
  let reiniciadoEl = null
  for (let i = 1; i < orden.length; i++) {
    const antes = orden[i - 1].diarioCrudo
    const ahora = orden[i].diarioCrudo
    if (antes == null || ahora == null || antes === ahora) continue
    reiniciadoEl = orden[i].fecha
  }
  return {
    convSemana: compras,
    necesita: CONV_APRENDIZAJE,
    faltan: Math.max(0, CONV_APRENDIZAJE - compras),
    cruza: compras >= CONV_APRENDIZAJE,
    // Sin CPA medido no hay presupuesto que calcular: `null` y no 0, porque un 0 se lee como
    // «no necesita plata».
    pide: cpa > 0 ? (CONV_APRENDIZAJE * cpa) / DIAS_APRENDIZAJE : null,
    cpa: cpa || null,
    reiniciadoEl,
  }
}

/**
 * El veredicto de una celda, **con los números que lo sostienen**.
 *
 * 🔑 `porque[]` no es decorativo: es lo que separa una decisión de una corazonada, y es la mitad de
 * por qué esta pantalla existe. Un renglón que dice «apagar» sin decir contra qué se lo comparó es
 * un renglón que nadie aprieta.
 *
 * El orden de las ramas es el orden en que muerden, ⛔ no el alfabético:
 *
 *  1. **Prendida y sin avisos** gana a todo. Meta la muestra `ACTIVE` y no miente: la pregunta
 *     «¿esto está entregando?» simplemente no es la que contesta `status`. Es plata que creés que
 *     está trabajando y no está.
 *  2. **Sin techo** corta antes que cualquier juicio de costo. ⛔ No se inventa un default: un techo
 *     inventado se lee igual que uno medido y decide plata.
 *  3. **El costo contra el techo**, que es el freno — ⛔ no el ROAS, que depende del mix de medios
 *     de pago y el techo casi no.
 *  4. Recién ahí, escalar.
 *
 * El desgaste ⛔ no cambia la clase: se suma como advertencia. Una celda puede comprar barato y
 * estar quemándose, y las dos cosas son ciertas a la vez.
 */
export function veredictoDeCelda(celda, { techo = 0, desgaste = null, aprendizaje = null } = {}) {
  const porque = []
  const v = veredicto(celda.spend, celda.compras, techo)
  const pctTecho = techo > 0 && celda.compras ? (div(celda.spend, celda.compras) / techo) * 100 : null
  const pctDiario = celda.diario ? (celda.spend / celda.diasConGasto / celda.diario) * 100 : null

  const avisar = () => {
    if (desgaste && desgaste.firma === 'pieza') {
      porque.push(
        `el CTR cayó ${Math.abs(Math.round(desgaste.ctrDelta))}% con el CPM ${
          desgaste.cpmDelta == null ? 'sin dato' : Math.abs(desgaste.cpmDelta) < SUBA_CPM ? 'clavado' : `${Math.round(desgaste.cpmDelta)}%`
        } ⇒ se está gastando la PIEZA, no la subasta`,
      )
    } else if (desgaste && desgaste.firma === 'subasta') {
      porque.push(`el CPM subió ${Math.round(desgaste.cpmDelta)}% ⇒ es la subasta, no la pieza`)
    }
    if (aprendizaje && !aprendizaje.cruza && aprendizaje.pide) {
      porque.push(
        `${Math.round(aprendizaje.convSemana)} de ${CONV_APRENDIZAJE} compras/semana: para salir de aprendizaje pide ${Math.round(aprendizaje.pide)}/día`,
      )
    }
    if (aprendizaje && aprendizaje.reiniciadoEl) {
      porque.push(`el presupuesto cambió el ${aprendizaje.reiniciadoEl} ⇒ el contador de aprendizaje arrancó de cero ahí`)
    }
    return { porque, pctTecho, pctDiario }
  }

  // 🔴 Va PRIMERO: sobre algo apagado ninguna acción tiene sentido, y el dato que sí sirve es qué
  // hacía cuando entregaba —para saber si la pausa fue buena o si hay que revertirla—. ⛔ Nunca
  // «apagala»: lo que ya está hecho no se propone.
  if (celda.estado === 'PAUSED' || celda.estadoReal === 'pausado') {
    if (celda.spend && celda.compras) {
      porque.push(`mientras entregó compró a ${Math.round(div(celda.spend, celda.compras))} contra un techo de ${Math.round(techo)}${pctTecho == null ? '' : ` (${Math.round(pctTecho)}%)`}`)
    } else if (celda.spend) {
      porque.push(`gastó ${Math.round(celda.spend)} en la ventana y no compró nada antes de apagarse`)
    } else {
      porque.push('no gastó un peso en la ventana')
    }
    return { clase: 'apagada', titulo: 'Ya está apagada', accion: null, ...avisar() }
  }
  if (celda.estadoReal === 'sin-avisos') {
    porque.push('figura activa y no tiene ningún aviso que pueda entregar')
    return { clase: 'rota', titulo: 'Prendida y sin avisos', accion: 'mirar', ...avisar() }
  }
  if (!celda.spend) {
    porque.push('no gastó un peso en la ventana')
    return { clase: 'quieta', titulo: 'No entregó', accion: null, ...avisar() }
  }
  if (v === '?') {
    porque.push(`gastó ${Math.round(celda.spend)} y compró ${celda.compras}, pero su línea no tiene techo cargado`)
    return { clase: 'sin-techo', titulo: 'Sin techo con qué juzgarla', accion: 'mirar', ...avisar() }
  }
  if (v === 'MIDIENDO') {
    porque.push(`gastó ${Math.round(celda.spend)} sin comprar todavía, y eso es menos que el techo (${Math.round(techo)})`)
    return { clase: 'midiendo', titulo: 'Todavía no se puede juzgar', accion: null, ...avisar() }
  }
  if (v === 'ALTO' && !celda.compras) {
    // 🔑 `SIN-COMPRAS` con el techo ya pasado NO es «todavía no sé»: es un alto probado. Un conjunto
    // que lleva $12.000 sin una compra ya compró cero compras a un precio infinito.
    porque.push(`gastó ${Math.round(celda.spend)} —más que el techo de ${Math.round(techo)}— y no compró NADA`)
    return { clase: 'alto', titulo: 'Gastó más de lo que sale un cliente y no trajo ninguno', accion: 'pausar', ...avisar() }
  }
  if (v === 'ALTO') {
    porque.push(`compra a ${Math.round(div(celda.spend, celda.compras))} contra un techo de ${Math.round(techo)} (${Math.round(pctTecho)}%)`)
    return { clase: 'alto', titulo: 'Compra arriba del techo', accion: 'pausar', ...avisar() }
  }
  // v === 'OK'
  porque.push(`compra a ${Math.round(div(celda.spend, celda.compras))} contra un techo de ${Math.round(techo)} (${Math.round(pctTecho)}%)`)
  if (pctDiario != null && pctDiario >= USA_LA_CAJA && pctTecho != null && pctTecho <= CON_AIRE) {
    porque.push(`usa el ${Math.round(pctDiario)}% de su diario ⇒ el presupuesto la está frenando`)
    return { clase: 'escalar', titulo: 'Rinde y está topeada', accion: 'escalar', ...avisar() }
  }
  if (pctDiario != null && pctDiario < USA_LA_CAJA) {
    // 🔑 Las dos cosas que se confunden todo el tiempo y que sólo estas dos columnas juntas separan:
    // una celda que no gasta porque no le alcanza la caja, y una que no la usa. Subirle el techo a
    // la segunda ⛔ no le manda un peso — está medido.
    porque.push(`usa el ${Math.round(pctDiario)}% de su diario ⇒ subirle el techo ⛔ no le manda un peso`)
  }
  return { clase: 'ok', titulo: 'Rinde', accion: null, ...avisar() }
}

/**
 * Qué parte del gasto se lleva la pieza más grande, y en cuántas cajas corre.
 *
 * 🔴 Medido el 25-ago-2026: **`AD02 GIRLHOOD COLLECTION` era el 52% del gasto de BDI, repartido en
 * TRES cajas** ⇒ una sola pieza sostenía la cuenta, y era justo la que se estaba desgastando. Eso no
 * se ve en ninguna fila: se ve sumando el mismo aviso a través de los conjuntos.
 *
 * ⚠️ **Agrupa por NOMBRE, que es lo único que la foto guarda del creativo.** La misma pieza subida
 * con otro nombre cuenta como dos, y esa cota va dicha en la pantalla: es una medición de la
 * concentración de NOMBRES, que es un piso de la concentración real, nunca un techo.
 */
/**
 * Los AVISOS de cada celda, indexados por el id del conjunto.
 *
 * # Por qué existe
 *
 * Porque el docblock de `TablaCeldas` prometía textual *«abriendo la fila están sus avisos»* y el
 * detalle mostraba el embudo y el día a día, **ni un aviso**. Y porque Bruno lo pidió el 26-ago-2026
 * con tres usos distintos: identificar cuál es cuál, mirar la pieza antes de tocarle la plata, y ver
 * **qué se está gastando la guita**.
 *
 * 🔑 **No cuesta una sola llamada.** La foto guarda los cuatro niveles y `_meta-rendimiento.js` la
 * lee sin filtrar por nivel: las filas de `aviso` con su `adset_id` ya estaban en memoria, y hasta
 * hoy sólo las miraba `concentracionDe()`.
 *
 * 🔴 **Se parte por `adset_id` ANTES de agrupar, y ése es todo el cuidado de esta función.**
 * `agruparAvisos()` agrupa por `objeto_id` a secas —le alcanza, porque la Biblioteca es de la cuenta
 * entera—, así que un mismo aviso corriendo en tres cajas colapsaría en una fila con la suma de las
 * tres. Y ese caso no es hipotético: está medido en este repo — `AD02 - GIRLHOOD COLLECTION` corre
 * en TRES conjuntos y es el 52% del gasto de BDI. Sin partir primero, cada caja mostraría los
 * números de las otras dos y **mentiría con cara de dato**.
 *
 * ⛔ **No devuelve `estado`, y es a propósito.** La configuración se escribe sólo en la fila del día
 * en que se sacó la foto ⇒ en una ventana que no llegue hasta hoy, el estado que se leyera de acá
 * diría «pausado» para todo. El estado vivo llega por otro lado o no llega, y la pantalla lo dice.
 * Es la misma regla que ya obligó a `configDeHoy()`.
 */
export function avisosPorCelda(filas) {
  const porCaja = new Map()
  for (const f of soloNivel(filas, 'aviso')) {
    if (!f || !f.adset_id) continue
    const k = String(f.adset_id)
    if (!porCaja.has(k)) porCaja.set(k, [])
    porCaja.get(k).push(f)
  }
  const salida = new Map()
  for (const [caja, suyas] of porCaja) salida.set(caja, agruparAvisos(suyas))
  return salida
}

export function concentracionDe(filas) {
  const porNombre = new Map()
  let total = 0
  for (const f of soloNivel(filas, 'aviso')) {
    if (!f) continue
    const k = f.nombre || '(sin nombre)'
    const gasto = num(f.spend)
    total += gasto
    const g = porNombre.get(k) || { pieza: k, gasto: 0, compras: 0, cajas: new Set() }
    g.gasto += gasto
    g.compras += num(f.compras)
    if (f.adset_id) g.cajas.add(String(f.adset_id))
    porNombre.set(k, g)
  }
  const piezas = [...porNombre.values()]
    .map((g) => ({ ...g, cajas: g.cajas.size, pct: total ? (g.gasto / total) * 100 : 0 }))
    .sort((a, b) => b.gasto - a.gasto)
  return { total, piezas, mayor: piezas[0] || null }
}

/**
 * Todo lo que la zona dibuja, en un objeto. Es lo que devuelve el handler y lo que imprime el
 * script de medición — **la misma función**, para que la pantalla y el oráculo no puedan discrepar.
 */
export function armarZona({
  filas = [], techo = 0, techoCaja = null, pedidosPorDia = {}, hasta = '', objetivoPedidos = 0,
  ventana = VENTANA,
} = {}) {
  const cierre = hasta || ultimoDiaCerrado(filas) || ''
  const desde = cierre ? desdeDe(cierre, ventana) : ''
  const deLaVentana = enVentana(filas, desde, cierre)

  // 🔑 El desgaste y el aprendizaje se miden sobre la serie LARGA, no sobre la ventana: comparar dos
  // mitades de siete días necesita catorce, y el aprendizaje mira los últimos siete corridos. Se
  // arma UNA vez y se indexa — adentro del `map` serían N recorridas de toda la foto.
  const largas = new Map(celdasDeLaFoto(enVentana(filas, null, cierre)).map((c) => [c.id, c]))

  // 🔴🔑 **LA VENTANA DE JUICIO, y es lo más importante de poder mirar un día suelto.**
  //
  // Las MÉTRICAS pueden ser de un día: es lo que se vino a poder mirar. El VEREDICTO no.
  // `veredicto()` sobre un día suelto manda a **pausar** una celda que ese día gastó más de lo que
  // sale un cliente y no trajo ninguno — y las compras son grumosas, y Meta reatribuye hacia atrás
  // varios días. ⇒ **una vista de un día que propone apagar es una vista que hace apagar cosas que
  // rinden**, que es el daño más caro que puede hacer esta pantalla.
  //
  // Lo mismo el desgaste (compara dos mitades: con `ventana=1` compararía un día contra un día, y
  // 3.000 impresiones mueven el CTR ±30% solas) y el marginal (resta dos promedios).
  //
  // ⇒ la regla que ya tenía esta función se extiende: **las MÉTRICAS son de la ventana, la
  // CONFIGURACIÓN es de HOY, y el VEREDICTO es de la ventana de JUICIO — nunca de un día suelto.**
  const juicio = Math.max(VENTANA, ventana)
  const paraJuzgar = juicio === ventana
    ? largas // no se usa: con juicio === ventana el veredicto sale de la celda de la ventana
    : new Map(celdasDeLaFoto(enVentana(filas, desdeDe(cierre, juicio), cierre)).map((c) => [c.id, c]))
  // ⛔ Sobre `filas` ENTERAS, no sobre la ventana ni sobre la serie larga: las dos están cortadas en
  // el día de cierre, y la configuración que hace falta es la de después. Ver `configDeHoy()`.
  const config = configDeHoy(filas)
  // Los avisos son de la MISMA ventana que las métricas de la celda: si salieran de la serie larga,
  // la fila diría «gastó $40.000» y adentro habría avisos sumando $300.000, que es la clase de
  // diferencia que hace dudar de la pantalla entera.
  const avisos = avisosPorCelda(deLaVentana)
  const celdas = celdasDeLaFoto(deLaVentana).map((c) => {
    const larga = largas.get(c.id) || c
    const desgaste = desgasteDe(larga.serie, juicio)
    const aprendizaje = aprendizajeDe(larga)
    // 🔴🔑 **Las MÉTRICAS son de la ventana; la CONFIGURACIÓN es de HOY.** Sale de un defecto real,
    // visto en prod el 26-ago-2026: `TEST UNBOXING x SIMILAR` se pausó el 25, la ventana cerraba el
    // 24, y la celda figuraba `ACTIVE` con el botón «Pausar» y el veredicto «apagala» encima de algo
    // que ya estaba apagado. La foto guarda la configuración **en la fila del día en que se sacó**,
    // así que el último día de la VENTANA la tiene congelada al día que la ventana termina.
    // ⇒ proponer una acción ya hecha es exactamente el ruido que hace que se le deje de creer a la
    // pantalla, y encima el que la creyera la volvería a apretar.
    const hoy = config.get(c.id)
    const conConfig = (celda) => (hoy
      ? { ...celda, nombre: hoy.nombre, estado: hoy.estado, estadoReal: hoy.estadoReal, diario: hoy.diario }
      : celda)
    const conHoy = conConfig(c)
    // El veredicto se juzga sobre la celda de la ventana de JUICIO, con la configuración de hoy
    // igual: las dos correcciones son independientes y hacen falta las dos.
    const deJuicio = juicio === ventana ? conHoy : conConfig(paraJuzgar.get(c.id) || c)
    return {
      ...conHoy,
      desgaste,
      aprendizaje,
      avisos: avisos.get(c.id) || [],
      veredicto: veredictoDeCelda(deJuicio, { techo, desgaste, aprendizaje }),
    }
  })

  // La serie de la línea, por día, para el cruce con la caja.
  const porFecha = new Map()
  for (const f of soloNivel(enVentana(filas, null, cierre), 'campania')) {
    const d = String(f.fecha).slice(0, 10)
    const t = porFecha.get(d) || { fecha: d, gasto: 0, compras: 0, revenue: 0 }
    t.gasto += num(f.spend)
    t.compras += num(f.compras)
    t.revenue += num(f.revenue)
    porFecha.set(d, t)
  }
  const serieLinea = [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const caja = cruzarConLaCaja(serieLinea, pedidosPorDia, cierre)
  const marginal = marginalEntreVentanas(caja, juicio)

  const t = sumarDias(soloNivel(deLaVentana, 'campania'))
  const pedidos = caja.filter((d) => d.fecha >= desde).reduce((s, d) => s + num(d.pedidos), 0)
  const dias = Math.max(1, caja.filter((d) => d.fecha >= desde).length)

  return {
    desde,
    hasta: cierre,
    // 🔑 Va en la respuesta para que la pantalla pueda ROTULARLO. Si `ventanaJuicio !== dias`, el
    // veredicto, el desgaste y el marginal son de una ventana más larga que los números de al lado,
    // y callarlo sería dejar que se lean como del día que se está mirando.
    ventanaJuicio: juicio,
    // 🔴 Lo que la pantalla tiene que decir en voz alta: hasta acá llegan los datos, y son la foto.
    // Sin esto, «hoy no gastó nada» se lee como una noticia y es el reloj.
    totales: {
      ...t,
      costoMeta: div(t.spend, t.compras),
      pedidos,
      pedidosDia: div(pedidos, dias),
      costoPedidoReal: div(t.spend, pedidos),
      pctTecho: techo > 0 && pedidos ? (div(t.spend, pedidos) / techo) * 100 : null,
    },
    techo,
    techoCaja,
    objetivoPedidos,
    celdas,
    caja,
    marginal,
    concentracion: concentracionDe(deLaVentana),
  }
}
