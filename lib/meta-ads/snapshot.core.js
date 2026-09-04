/**
 * La foto diaria de la pauta: cómo se arma una fila y cómo se leen varias juntas.
 * LA implementación, una sola, para el script y para la pantalla.
 *
 * # Por qué este archivo es `.js`
 *
 * Lo importa `scripts/snapshot-meta.mjs`, que corre en GitHub Actions sin pasar por el compilador
 * de Next. `lib/meta-ads/snapshot.ts` es el re-export tipado que usa la app.
 *
 * # Qué problema resuelve
 *
 * Graph contesta "cómo está hoy", nunca "cómo venía". Sin serie no hay tendencia, ni fatiga, ni
 * "este conjunto ya gastó lo suficiente para juzgarlo". Este archivo tiene las tres decisiones que
 * hacen que una serie sea comparable consigo misma: qué se guarda por día, qué NO se puede sumar
 * entre días, y cómo se recalculan los ratios al agregar.
 */

import { metricasDe } from './metricas.core.js'

/** Los niveles de la jerarquía de Meta que se fotografían. De afuera hacia adentro. */
export const NIVELES_SNAPSHOT = ['cuenta', 'campania', 'conjunto', 'aviso']

/**
 * De qué campos de una fila de insights sale el id y el nombre del objeto, según el nivel.
 * Es lo único que cambia entre niveles: el resto de la fila se lee igual.
 */
const IDENTIDAD = {
  cuenta: { id: 'account_id', nombre: 'account_name' },
  campania: { id: 'campaign_id', nombre: 'campaign_name' },
  conjunto: { id: 'adset_id', nombre: 'adset_name' },
  aviso: { id: 'ad_id', nombre: 'ad_name' },
}

/**
 * Cuántos días pide cada llamada del backfill.
 *
 * 30 y no 90 de una: con `time_increment=1` a nivel aviso, 90 días son miles de filas y varias
 * páginas de cursor, y una sola llamada gigante que falla a la mitad se pierde entera. Tres
 * llamadas que fallan de a una dejan dos tercios cargados.
 */
export const DIAS_POR_TRAMO = 30

/**
 * Cuántos días hacia atrás se releen en cada corrida diaria.
 *
 * 🔑 No es sólo "ayer". Meta reatribuye conversiones hacia atrás durante la ventana de atribución
 * (`7d_click`): la fila de anteayer CAMBIA. Guardarla una vez y no volver a mirarla la congela en
 * su primera lectura, que es siempre la más baja. Es la misma lección que el sync de ventas, que
 * relee 90 días porque una venta anulada dejaba de venir sin avisar.
 */
export const DIAS_RELECTURA = 4

/** La fecha de un `Date` en ISO, tomando el día LOCAL (`toISOString()` es UTC y corre el día). */
export function isoDia(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * La fecha de un `Date` en ISO **en la zona de la cuenta publicitaria**, que es la única que
 * define qué día es «hoy» para Meta.
 *
 * 🔴 **Por qué la zona es obligatoria y no cae a la del proceso.** `isoDia(new Date())` toma la
 * hora de quien corre, y en GitHub Actions eso es **UTC**. Pasadas las 00:00 UTC —las 21:00 en
 * Argentina— el runner cree que ya es el día siguiente, mientras que para la cuenta el día en
 * curso todavía no terminó. El 3-sep-2026 eso dejó al monitor **ciego durante tres horas**: la
 * fila del día en curso caía en el lote SIN configuración (ver `CONFIG_COLS` en
 * `scripts/snapshot-meta.mjs`), así que un cambio de presupuesto o una PAUSA hechos a las 22:00
 * ⛔ no se registraban, y el objeto seguía figurando `ACTIVE` con su presupuesto viejo. Se
 * descubrió queriendo verificar un −20% recién aplicado: la foto decía el valor anterior y **no
 * estaba desmintiendo el cambio, no podía verlo**. Un default silencioso acá reestrena ese error
 * cada vez que alguien llame a la función sin pensarlo ⇒ **sin zona, tira**.
 */
export function isoDiaEnZona(d, zona) {
  if (!zona) {
    throw new Error(
      'isoDiaEnZona: falta la zona de la cuenta. Sin ella el día sale de la hora del proceso, ' +
        'que en GitHub Actions es UTC y a partir de las 21:00 de Argentina ya es el día siguiente.',
    )
  }
  // `en-CA` es el locale que formatea como YYYY-MM-DD, que es justo el ISO que se guarda.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/**
 * Parte un rango de fechas en tramos de a lo sumo `dias`, de más viejo a más nuevo.
 * Devuelve `[{since, until}]` con fechas ISO inclusivas, que es como las quiere Meta.
 */
export function tramosDe(desdeIso, hastaIso, dias = DIAS_POR_TRAMO) {
  const desde = Date.parse(`${desdeIso}T00:00:00Z`)
  const hasta = Date.parse(`${hastaIso}T00:00:00Z`)
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde > hasta) return []
  const paso = Math.max(1, Math.floor(dias))
  const tramos = []
  const DIA = 86400000
  for (let ini = desde; ini <= hasta; ini += paso * DIA) {
    const fin = Math.min(ini + (paso - 1) * DIA, hasta)
    tramos.push({
      since: new Date(ini).toISOString().slice(0, 10),
      until: new Date(fin).toISOString().slice(0, 10),
    })
  }
  return tramos
}

/**
 * El estado que la API no contesta aunque no mienta.
 *
 * Un conjunto puede figurar `ACTIVE` con TODOS sus avisos apagados: no está pausado y tampoco
 * puede entregar. `status` dice `ACTIVE` y `effective_status` también, y los dos tienen razón —
 * la pregunta "¿esto está entregando?" simplemente no es la que contestan. Hasta ahora esto se
 * miraba a ojo en la columna "Entrega" de Ads Manager.
 *
 * `avisos` es la lista de los avisos que cuelgan, con su `status`/`effective_status`. Si no se
 * pudo leer (`null`), devuelve `null`: **no saber no es lo mismo que estar apagado**, y un
 * `'avisos-desactivados'` inventado mandaría a pausar algo que estaba entregando bien.
 */
export function estadoRealDe(estadoConjunto, avisos) {
  const est = String(estadoConjunto || '').toUpperCase()
  if (est && est !== 'ACTIVE') return 'pausado'
  if (!Array.isArray(avisos)) return null
  if (avisos.length === 0) return 'sin-avisos'
  const vivos = avisos.filter((a) => entregando(a && (a.effective_status || a.status)))
  return vivos.length ? 'entregando' : 'avisos-desactivados'
}

/**
 * ¿Este `effective_status` es de algo que todavía puede entregar?
 *
 * 🔑 **Un aviso en revisión NO cuenta como apagado**: todavía puede terminar entregando, y tratarlo
 * de pausado manda a alguien a «reactivar» algo que no está frenado. Es un criterio y no una lista
 * suelta porque lo preguntan dos lugares —el `estado_real` de un conjunto y el filtro de estado de
 * la Biblioteca—, y dos listas parecidas repartirían los mismos avisos en dos grupos distintos.
 *
 * `null`/vacío devuelve `false`, pero **eso no es «pausado»: es «no se sabe»**, y quien necesite
 * distinguirlo tiene que preguntar por el `null` antes de llamar acá.
 */
export function entregando(estado) {
  const s = String(estado || '').toUpperCase()
  return s === 'ACTIVE' || s === 'PENDING_REVIEW' || s === 'IN_PROCESS' || s === 'PENDING_PROCESSING'
}

/**
 * Una fila de insights de Meta convertida en fila de `meta_ads_snapshot_dia`.
 *
 * `extras` trae lo que NO viene en insights y hay que leer aparte (la configuración del objeto):
 * `linea`, `objetivo`, `estado`, `estadoEfectivo`, `estadoReal`, `diarioCrudo`, `moneda`.
 *
 * 🔴 **`capturado_at` viaja EXPLÍCITO y se refresca en CADA escritura** (1-sep-2026). Antes no
 * estaba en la fila: lo ponía el default de la base, o sea que el `ON CONFLICT DO UPDATE` no lo
 * tocaba y quedaba clavado en el momento en que la fila se INSERTÓ por primera vez. Medido ese
 * día: se corrió la foto dos veces (08:35 y 14:00) y las 28 filas seguían diciendo 08:35 mientras
 * los presupuestos y estados SÍ se habían actualizado. Rompía dos cosas a la vez:
 *   1. el reloj de frescura del parte del día gritaba «foto VIEJA» toda la tarde aunque se acabara
 *      de refrescar, y ⛔ no servía para confirmar que una escritura había llegado;
 *   2. peor, `ultimoDiaCerrado()` deriva de `capturado_at > fecha` si un día ya cerró. Con el
 *      sello clavado, el día de ayer releído hoy seguía figurando ABIERTO, y la pantalla
 *      `/meta-ads` trabajaba con una ventana corrida un día para atrás.
 * ⚠️ Por eso ⛔ NO va en `CONFIG_COLS` de `snapshot-meta.mjs`: esas se borran al reescribir un día
 * viejo para no inventarle un presupuesto histórico, pero el sello de lectura tiene que refrescarse
 * justamente en esos días — es lo que los hace pasar a CERRADOS.
 *
 * ⚠️ **`diarioCrudo` es el presupuesto de HOY, no el del día de la fila.** En la corrida diaria eso
 * es correcto —la foto se saca el mismo día—, pero en el backfill no hay forma de saberlo: Meta no
 * expone el histórico de presupuestos por ninguna vía. Ahí va `null`, que es la verdad. La
 * consecuencia práctica: **el efecto de un escalón sólo se puede medir hacia adelante**. Para los
 * cambios hechos desde el monitor el dato igual existe, en `meta_ads_accion`.
 */
export function filaSnapshot(row, nivel, cuentaId, extras = {}) {
  const ident = IDENTIDAD[nivel]
  if (!ident) return null
  const objetoId = row && row[ident.id] ? String(row[ident.id]) : ''
  // Sin fecha o sin id la fila no tiene clave primaria: se descarta en vez de escribir basura con
  // una fecha inventada, que después es indistinguible de un día real sin gasto.
  const fecha = row && row.date_start ? String(row.date_start) : ''
  if (!objetoId || !fecha) return null

  const m = metricasDe(row)
  return {
    fecha,
    nivel,
    objeto_id: objetoId,
    cuenta_id: String(cuentaId || row.account_id || ''),
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    adset_id: row.adset_id ? String(row.adset_id) : null,
    nombre: row[ident.nombre] ? String(row[ident.nombre]) : null,
    linea: extras.linea ?? null,
    objetivo: extras.objetivo ?? null,
    estado: extras.estado ?? null,
    estado_efectivo: extras.estadoEfectivo ?? null,
    estado_real: extras.estadoReal ?? null,
    diario_crudo: extras.diarioCrudo ?? null,
    moneda: extras.moneda ?? (row.account_currency ? String(row.account_currency) : null),
    capturado_at: extras.capturadoAt ?? new Date().toISOString(),

    spend: m.spend,
    impresiones: m.impressions,
    alcance: m.reach,
    frecuencia: m.frequency,
    clicks: m.clicks,
    link_clicks: m.linkClicks,
    ctr: m.ctr,
    cpc: m.cpc,
    cpm: m.cpm,
    compras: m.purchases,
    revenue: m.revenue,
    roas: m.roas,
    carritos: m.carritos,
    checkouts: m.checkouts,
    lpv: m.lpv,
    visitas_perfil: m.perfil,
    seguidores: m.seguidores,
  }
}

/**
 * 🔴 **El nivel del que salen los totales, y por qué no da igual cuál.**
 *
 * La tabla guarda los cuatro niveles y **la misma plata está en los cuatro**: el gasto de un aviso
 * está también en su conjunto, en su campaña y en su cuenta. Sumar las filas sin filtrar por nivel
 * cuenta cada peso tres veces (la cuenta queda afuera sola, porque no lleva línea).
 *
 * Va `campania` y no `aviso` porque es el único nivel COMPLETO: una campaña sin avisos igual gastó
 * si tuvo entrega, y hay conjuntos que no cuelgan de ningún aviso vivo. Los ratios sobrevivirían al
 * triplicado —numerador y denominador escalan parejo— pero el gasto que se le muestra a una
 * persona, no.
 *
 * Vive acá y no en `reglas.core.js` —donde nació— porque es un hecho de la FOTO, no de las
 * automatizaciones: lo necesita igual cualquiera que sume la tabla. Ver `sumarDias()`.
 */
export const NIVEL_TOTALES = 'campania'

/** Las filas de un nivel, descartando lo que no es de ese nivel. */
export function soloNivel(filas, nivel) {
  return (Array.isArray(filas) ? filas : []).filter((f) => f && f.nivel === nivel)
}

/**
 * Suma varias filas diarias en una ventana (los "últimos 7", los "últimos 30").
 *
 * Dos reglas, y las dos son la razón de que esto sea una función y no un `reduce` suelto en cada
 * pantalla que lo necesite:
 *
 * 1. **Los ratios se RECALCULAN desde los agregados, no se promedian.** El CTR promedio de siete
 *    días no es el CTR de la semana: un día de 10 impresiones pesa lo mismo que uno de 100.000.
 * 2. 🔴 **`alcance` y `frecuencia` vuelven en `null`, y no es un olvido.** El alcance de Meta es
 *    gente única deduplicada dentro del período consultado: sumar siete días cuenta siete veces a
 *    quien vio el aviso los siete días, y el número sale inflado y creíble. Un alcance de 7 días
 *    hay que **pedírselo a Meta con ese rango**. Devolver `null` obliga a quien lo necesite a ir a
 *    buscarlo bien; devolver una suma lo dejaría usar un número mal.
 * 3. 🔴 **El embudo (`carritos`/`checkouts`/`lpv`) vuelve `null` si NINGUNA fila de la ventana lo
 *    tenía, y nunca `0`.** Esas tres columnas nacieron el 23-ago-2026 y las filas anteriores quedan
 *    en `null` **a propósito**: un `0` afirmaría «no hubo ni un agregar al carrito», y esas filas no
 *    pueden afirmar eso. Sumarlas con `Number(null) || 0` —que es lo que hace el resto de esta
 *    función— habría convertido «no lo medíamos» en «dio cero» al cruzar la frontera de esa fecha,
 *    en silencio y con cara de dato. Por eso van con su propio contador, y `diasConEmbudo` dice
 *    sobre cuántos días se sumó cada paso.
 */
export function sumarDias(filas) {
  const t = {
    spend: 0, impresiones: 0, clicks: 0, compras: 0, revenue: 0, visitas_perfil: 0, seguidores: 0,
  }
  // 🔴 El embudo se suma APARTE, contando cuántas filas tenían el dato. Ver `sumaEmbudo()`.
  const emb = { carritos: 0, checkouts: 0, lpv: 0, link_clicks: 0 }
  const conDato = { carritos: 0, checkouts: 0, lpv: 0, link_clicks: 0 }
  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f) continue
    t.spend += Number(f.spend) || 0
    t.impresiones += Number(f.impresiones) || 0
    t.clicks += Number(f.clicks) || 0
    t.compras += Number(f.compras) || 0
    t.revenue += Number(f.revenue) || 0
    t.visitas_perfil += Number(f.visitas_perfil) || 0
    t.seguidores += Number(f.seguidores) || 0
    for (const k of ['carritos', 'checkouts', 'lpv', 'link_clicks']) {
      if (f[k] == null) continue
      emb[k] += Number(f[k]) || 0
      conDato[k] += 1
    }
  }
  return {
    ...t,
    // Un paso sin una sola fila que lo haya medido vuelve `null`, no `0`. Ver arriba.
    carritos: conDato.carritos ? emb.carritos : null,
    checkouts: conDato.checkouts ? emb.checkouts : null,
    lpv: conDato.lpv ? emb.lpv : null,
    // 🔴 `link_clicks` va acá y NO en `t` por lo mismo: nació el 27-ago-2026 y las filas
    // anteriores están en `null`. Sumarlo con `Number(null) || 0` convertiría "no lo pedíamos" en
    // "nadie hizo click al link", que es justo el error que esta columna vino a arreglar.
    link_clicks: conDato.link_clicks ? emb.link_clicks : null,
    // Sobre cuántos días de la ventana hay embudo. Sin esto, `carritos: 30` sobre 7 días no se
    // distingue de `carritos: 30` sobre 2 días con cinco sin medir, y el costo por carrito sale mal.
    // ⚠️ `link_clicks` tiene su propio contador y arranca DESPUÉS que los otros tres (27-ago contra
    // 23-ago): en una ventana que cruce esa frontera, `diasConEmbudo.lpv` y
    // `diasConEmbudo.link_clicks` NO son iguales, y la tasa click→landing se calcula sobre los días
    // que tienen los dos, no sobre la ventana entera.
    diasConEmbudo: conDato,
    alcance: null,
    frecuencia: null,
    ctr: t.impresiones ? (t.clicks / t.impresiones) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpm: t.impresiones ? (t.spend / t.impresiones) * 1000 : 0,
    // Acá sí es `revenue / spend`: el `roas` de Meta es por fila y no se puede sumar. Al agregar,
    // el único ROAS defendible es el de los totales — y por eso `dias` viaja al lado, para que
    // quien lo lea sepa sobre cuántos días se calculó.
    roas: t.spend ? t.revenue / t.spend : 0,
    dias: Array.isArray(filas) ? filas.length : 0,
  }
}
