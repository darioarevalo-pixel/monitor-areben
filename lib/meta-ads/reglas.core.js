/**
 * Las automatizaciones de la pauta: **la lógica pura**, sin Meta y sin base.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `planes.core.js` y `permisos.core.js`: lo importan `api/_meta-reglas.js` y
 * `scripts/evaluar-reglas-meta.mjs`, que corren en Node sin pasar por el compilador de Next y **no
 * pueden importar TypeScript**. `reglas.ts` es el re-export tipado que usa la pantalla.
 *
 * # Qué es esto
 *
 * Siete detectores sobre `meta_ads_snapshot_dia`. Cada uno mira la serie de un objeto y, si algo
 * pasa, devuelve un HALLAZGO: la frase que se lee, los números que la justifican y —cuando existe—
 * la `entrada` lista para que el motor de planes arme la acción.
 *
 * ⛔ **Nada de acá ejecuta.** Ni siquiera puede: no importa `graph.core.js`. Lo único que produce
 * son renglones para el Panel. Escribir en Meta es apretar el botón, y de ahí en adelante manda
 * `planes.core.js`, con sus permisos, su sonda y su registro.
 *
 * 🔑 **Y no habla con la base tampoco**: recibe las filas ya leídas. Por eso el calibrador —correr
 * una regla hacia atrás sobre 90 días con otro umbral— es gratis: es la misma función con otros
 * argumentos, no una segunda implementación que podría discrepar.
 *
 * # Las dos trampas del dato, que están acá y en ningún otro lado
 *
 * 1. 🔴 **`frecuencia` y `alcance` NO se suman entre días.** Son dedup dentro del período que se le
 *    pidió a Meta: sumar siete días cuenta siete veces a quien vio el aviso los siete días, y sale
 *    un número inflado y creíble. `sumarDias()` los devuelve en `null` justamente para que nadie los
 *    sume sin darse cuenta, y acá la fatiga lee **la fila de un día**. Ver `frecuenciaPico()`.
 * 2. **`spend` viene en PESOS y `diario_crudo` en unidad menor.** Por eso `gasto_minimo` es numeric
 *    en pesos y `techo_diario_crudo` es bigint: cada umbral vive en la unidad de aquello contra lo
 *    que se compara, para que no haya un `/100` en el medio de una comparación.
 */

import { lineasQuePuede } from './acciones.core.js'
import { diasEntre } from '../fechas/dia.core.js'
import { decimal, entero, plata, roas as roasTxt } from './formato.core.js'
// `NIVEL_TOTALES` y `soloNivel` nacieron acá y se mudaron a la foto: son un hecho de la TABLA (la
// misma plata está en los cuatro niveles), no de las automatizaciones, y «vs período anterior» los
// necesita igual. Se re-exportan más abajo porque `reglas.ts` y los tests ya los importan de acá.
import { partir } from './decisiones.core.js'
// 🔑 El mismo juicio de un día que usa el parte y que usa la zona de Rendimiento. Que la regla
// tuviera el suyo es exactamente cómo se llega a que la pantalla diga «rinde» y el cron proponga
// apagarlo: ver `hayRacha()`, que existe por lo mismo.
import { veredicto } from './parte.core.js'
// El «con aire» de la zona: debajo de qué porcentaje del techo una celda es candidata a escalar.
// Se importa y ⛔ no se copia — un 75 en dos archivos es un 75 que un día va a ser 70 en uno solo.
import { CON_AIRE } from './rendimiento.core.js'
import { NIVEL_TOTALES, soloNivel } from './snapshot.core.js'

/** Cuántos días mira una regla hacia atrás por defecto. Cada preset puede pedir otra ventana. */
export const VENTANA_DIAS = 7

/**
 * Los umbrales que existen, y **cuáles se pueden deducir de los datos y cuáles no**.
 *
 * 🔑 Esta distinción es la que hace usable el módulo sin que Bruno defina nada de antemano, y no es
 * una comodidad: es la diferencia entre un HECHO y una DECISIÓN.
 *
 * - `derivable: true` — el número sale de medir los 90 días que ya están. El CPA de una línea es lo
 *   que efectivamente cuesta traer un cliente ahí; no hay nada que opinar.
 * - `derivable: false` — el número es una decisión de negocio y **no se autocompleta nunca**. El
 *   ROAS mediano es lo que se OBTIENE, no lo que se QUIERE: usarlo como objetivo dejaría a la mitad
 *   de la pauta permanentemente «por debajo del objetivo», que es ruido con cara de dato. Se
 *   SUGIERE con su contexto medido, y la regla queda apagada hasta que alguien confirme.
 * - `desdeFicha` — 🆕 una decisión de negocio **que ya está tomada en otra pantalla**, y de ahí se
 *   lee. Es el caso del techo de costo por compra: se firma en la ficha de rentabilidad. No es una
 *   tercera forma de inventar un número —sin ficha no hay número—: es no pedir dos veces el mismo,
 *   que era exactamente el defecto medido el 26-ago-2026, con `cpa_maximo` teniendo columna, dial y
 *   ningún preset que lo consumiera.
 */
export const UMBRALES = {
  roas_objetivo: {
    rotulo: 'ROAS objetivo',
    unidad: 'x',
    derivable: false,
    ayuda: 'Debajo de esto, algo no está rindiendo. Es una decisión de negocio: el ROAS que venís sacando es el que TENÉS, no el que querés.',
  },
  cpa_maximo: {
    rotulo: 'CPA máximo',
    unidad: '$',
    derivable: false,
    /**
     * 🔑 **Ni derivable ni de dial: es una decisión YA TOMADA en otra pantalla.**
     *
     * El techo de costo por compra se firma en la ficha de rentabilidad (`meta_ads_rentabilidad`),
     * donde sale de la economía unitaria de la marca. Traerlo de ahí ⛔ no es autocompletar una
     * decisión de negocio —la decisión ya la tomó alguien, con sus números a la vista—: es dejar de
     * pedirla dos veces. Y pedirla dos veces es peor que no pedirla, porque las dos copias se
     * despegan y la pantalla termina mostrando un techo y la regla cortando por otro.
     *
     * ⚠️ Sin ficha cargada NO hay número: va `null` y la regla que lo pide se queda apagada
     * diciendo que falta la ficha. Un techo inventado se lee igual que uno medido y decide plata.
     */
    desdeFicha: 'rentabilidad',
    ayuda: 'Lo más que estás dispuesto a pagar por una compra. Sale solo del techo de la ficha de rentabilidad de la marca; cargarlo acá lo pisa.',
  },
  gasto_minimo: {
    rotulo: 'Gasto mínimo para juzgar',
    unidad: '$',
    derivable: true,
    ayuda: 'Cuánto tiene que haber gastado algo antes de que su resultado signifique algo. Se deduce del CPA medido de la línea: gastar lo que sale un cliente y no traer ninguno ya es una señal. En una marca con menos de cinco compras no se deduce solo —ahí «el CPA» sería casi todo el gasto— y hay que ponerlo a mano.',
  },
  frecuencia_maxima: {
    rotulo: 'Frecuencia máxima por día',
    unidad: 'x',
    derivable: false,
    ayuda: 'Cuántas veces por día puede verte la misma persona antes de que se queme. Depende del tamaño del público y del creativo: no hay un número universal.',
  },
  techo_diario_crudo: {
    rotulo: 'Techo del presupuesto diario',
    unidad: '$crudo',
    derivable: false,
    ayuda: 'Hasta dónde puede llegar un escalón. Sin esto, «subí mientras el ROAS aguante» no tiene freno.',
  },
  dias_seguidos: {
    rotulo: 'Días seguidos',
    unidad: 'días',
    derivable: true,
    ayuda: 'Cuántos días tiene que cumplirse algo antes de moverse. Separa una tendencia de un día bueno.',
  },
}

/** Cuántos días seguidos se exigen si nadie dijo otra cosa. Tres es el estándar y es explicable. */
export const DIAS_SEGUIDOS_DEFECTO = 3

/**
 * Cuánto se tolera por encima del techo antes de proponer apagar, y en cuántos días se mide.
 *
 * 🔑 **La regla es a propósito MÁS EXIGENTE que la pantalla, y la diferencia es quién decide.** La
 * zona de Rendimiento dice «pausar» apenas el costo pasa el techo (100%): ahí hay una persona
 * mirando, con el desgaste y el aprendizaje al lado, y equivocarse cuesta una lectura. Esto otro
 * corre solo todas las mañanas y deja un renglón que propone escribir en Meta: un hallazgo por cada
 * celda que pasó el techo un día sería ruido diario, y **una regla que grita todos los días se deja
 * de mirar, y ahí se pierde también la que tenía razón**.
 *
 * 1,5× sobre 5 días no es un número elegido en el aire: es la banda donde caía `GIRLHOOD FRIO -
 * INTERESES 1` el 25-ago-2026 —185% del techo, cuatro compras en cinco días, ~$10.000 por día— que
 * es el caso que hay que cazar. Cinco días y no siete porque a $10.000/día, dos días de más son
 * $20.000; y no tres, porque con 1-2 compras diarias por celda tres días son una moneda al aire.
 */
export const TOLERANCIA_COSTO = 1.5
export const VENTANA_COSTO = 5

/**
 * Cuántas compras hacen falta para que `gasto ÷ compras` sea un CPA y no una división.
 *
 * 🔴 **Con una sola compra el «CPA» de una línea ES TODO SU GASTO**, y de ahí sale el piso que
 * decide si algo se puede juzgar: medido el 26-ago-2026, `stunned` llevaba 1 compra en 90 días
 * ⇒ piso derivado **$330.528** ⇒ el freno de emergencia pedía gastar eso sin vender para hablar, y
 * la marca entera nunca lo iba a cruzar. **La regla figuraba prendida y era imposible que saltara.**
 * Con un piso puesto a mano encuentra 2 avisos y 4 saltos en la última semana.
 *
 * 🔑 Y el modo de fallar es el peor que hay: **callado**. Una regla apagada dice por qué; ésta decía
 * «0 hallazgos», que se lee «acá está todo bien» sobre la marca que más plata quema.
 *
 * Cinco y no dos: una compra de más o de menos mueve el piso 1/n, y recién en 5 esa sacudida (20%)
 * baja de la tolerancia con la que corta el propio módulo. Debajo de eso el número existe pero no
 * significa —y un número que no significa, acá, apaga una regla sin decirlo.
 */
export const COMPRAS_MINIMAS_CPA = 5

/**
 * La fatiga se mide en TRES SEMANAS, y la caída del CTR tiene que ser de verdad.
 *
 * 🔴 **Con la ventana de 7 días la regla no puede ver lo que dice medir.** El desgaste tarda
 * semanas, así que comparar la primera mitad de una semana contra la segunda compara dos mitades
 * ya gastadas. Medido sobre la cuenta entera el 26-ago-2026 (`scripts/medir-ctr-fatiga.mjs`):
 *
 * | ventana | mayor caída de la cuenta | `AD02 - GIRLHOOD COLLECTION` | avisos que caen >20% |
 * |---|---|---|---|
 * | 7 días | −14% | **−2%** (3,90 → 3,83) | **0** |
 * | 21 días | −58% | **−31%** (5,87 → 4,05) | 7 |
 *
 * ⇒ a 7 días el CTR de la pieza que este repo tiene identificada como el desgaste que traba todo
 * se movía **menos que el ruido** —había avisos SUBIENDO 2% y 4% la misma semana— y la regla igual
 * decía *«Está quemado»*, porque `despues < antes` no mira la magnitud. A 21 días la misma pieza
 * muestra la caída real.
 *
 * 🔑 **Y la frecuencia sigue siendo de la última semana**: el desgaste es una TENDENCIA y la
 * sobreexposición es un ESTADO. Un pico de hace tres semanas no dice que hoy se esté quemando a
 * nadie. Es la misma distinción que en la zona: las métricas son de la ventana, la configuración
 * es de hoy.
 *
 * El 20% no es redondo por gusto: a 21 días deja 7 avisos en toda la cuenta, y cruzado con el
 * dial de frecuencia deja **uno solo** —el que hay que mirar—. A 10% entrarían 12 y volvería a ser
 * una lista que nadie abre.
 */
export const VENTANA_FATIGA = 21
export const CAIDA_CTR_MINIMA = 0.2

/**
 * Los SIETE presets. **Todo lo que las automatizaciones saben detectar está acá y en ningún otro
 * lado**, igual que `ACCIONES` con las acciones sueltas y `TIPOS_PASO` con los pasos del motor.
 *
 * `requiere` es la lista de umbrales sin los cuales el preset **no corre**. Los tres que la tienen
 * vacía se pueden prender el día uno, y no es una casualidad de diseño: son los tres que detectan
 * un HECHO (un conjunto que no puede entregar, una compra que llegó tarde, plata gastada contra
 * cero ventas) en vez de comparar contra una vara elegida.
 *
 * `sub` es el permiso que hace falta para ACCIONAR el hallazgo — el de la acción que ejecutaría, no
 * uno propio. Un hallazgo no suma tildes: pausar pide `pausar`, subir el diario pide `presupuesto`.
 */
export const PRESETS = {
  'sin-avisos': {
    rotulo: 'Se quedó sin avisos',
    resumen: 'Un conjunto que figura activo y no tiene ningún aviso que pueda entregar.',
    porQue: 'Meta lo muestra como ACTIVE y no miente: la pregunta «¿esto está entregando?» simplemente no es la que contesta `status`. Es plata que creés que está trabajando y no está.',
    nivel: 'conjunto',
    ventana: 1,
    requiere: [],
    sub: 'pausar',
    // El único que no propone una escritura: qué hacer depende de por qué se apagaron
    // los avisos (rechazados, pausados a mano, borrados), y eso hay que mirarlo.
    proponeAccion: false,
  },
  'atribucion-tardia': {
    rotulo: 'Radar de atribución tardía',
    resumen: 'Algo que pausaste hace poco y que desde entonces igual sumó compras.',
    porQue: 'Meta reatribuye conversiones durante ~72 h, así que un aviso puede haberse apagado por «no vende» y aparecer vendiendo dos días después. La foto diaria relee esa ventana justamente por eso.',
    nivel: 'aviso',
    ventana: VENTANA_DIAS,
    requiere: [],
    sub: 'pausar',
    proponeAccion: true,
    /**
     * 🔴 **El único preset que necesita HISTORIAL DE ESTADO, y por eso arranca sin poder correr.**
     *
     * Detecta una transición —estaba al aire, lo apagaste, siguió vendiendo—, y el estado sólo se
     * escribe en la fila **del día en que se sacó la foto**: Meta no expone el histórico de
     * configuración por ninguna vía, así que el backfill de 90 días trajo métricas pero un solo día
     * de estado. La serie se construye hacia adelante, un día por corrida del cron.
     *
     * Sin esta bandera la regla mostraría «0 saltos en 90 días», que se lee como «esto no pasa
     * nunca» cuando la verdad es «todavía no se puede saber». Es el mismo error que un umbral
     * inventado: un número que parece un dato y no lo es.
     */
    requiereHistorialEstado: true,
  },
  'freno-emergencia': {
    rotulo: 'Freno de emergencia',
    resumen: 'Gastó más de lo que sale un cliente y no trajo ninguno.',
    porQue: 'Cero compras no es un umbral, es un hecho. Lo único que hace falta es un piso de gasto para no gritar por un aviso que gastó $300, y ese piso se DEDUCE del CPA medido de la línea.',
    nivel: 'aviso',
    ventana: VENTANA_DIAS,
    requiere: ['gasto_minimo'],
    sub: 'pausar',
    proponeAccion: true,
  },
  'gastos-hormiga': {
    rotulo: 'Gastos hormiga',
    resumen: 'Avisos que solos gastan poco, pero juntos suman y rinden por debajo del objetivo.',
    porQue: 'Ninguno llama la atención por separado y por eso sobreviven meses. El daño es la suma.',
    nivel: 'aviso',
    ventana: VENTANA_DIAS,
    requiere: ['roas_objetivo'],
    sub: 'pausar',
    proponeAccion: true,
  },
  fatiga: {
    rotulo: 'Fatiga de creativo',
    resumen: 'La misma gente lo está viendo demasiadas veces por día y el CTR viene cayendo.',
    porQue: 'Una frecuencia alta sola no dice nada —un público chico la tiene siempre—; lo que la vuelve fatiga es que el CTR baje mientras sube. La caída se mira en TRES semanas porque el desgaste tarda semanas: en una sola, las dos mitades ya vienen gastadas y la caída se confunde con el ruido.',
    nivel: 'aviso',
    ventana: VENTANA_FATIGA,
    requiere: ['frecuencia_maxima'],
    // Renovar un creativo no es un POST: lo que se propone es anotar la idea en el tablero.
    sub: 'pautar',
    proponeAccion: false,
  },
  'costo-alto': {
    rotulo: 'Compra muy arriba del techo',
    resumen: `Viene comprando a más de ${Math.round(TOLERANCIA_COSTO * 100)}% del techo de la marca durante ${VENTANA_COSTO} días.`,
    porQue: 'Es el corte que manda: el freno de la pauta es el COSTO POR COMPRA, ⛔ no el ROAS —el ROAS que reporta Meta se mueve ±12% con el mix de medios de pago y el techo casi no—. Y el techo no se elige acá: se firma en la ficha de rentabilidad de la marca.',
    nivel: 'conjunto',
    ventana: VENTANA_COSTO,
    // `gasto_minimo` es derivable y `cpa_maximo` sale de la ficha ⇒ **este preset se prende el día
    // uno en toda marca que tenga su ficha cargada**, sin que nadie toque un dial.
    requiere: ['cpa_maximo', 'gasto_minimo'],
    sub: 'pausar',
    proponeAccion: true,
  },

  'ganador-escalar': {
    rotulo: 'Ganador para escalar',
    resumen: 'Viene bien varios días seguidos y tiene margen de presupuesto.',
    porQue: 'Es el único que propone SUBIR plata, y por eso es el que más umbrales pide y el que conviene prender último. La vara es el COSTO si la marca tiene ficha, y el ROAS si no.',
    nivel: 'conjunto',
    ventana: VENTANA_DIAS,
    requiere: ['techo_diario_crudo'],
    /**
     * 🔴 **Una vara u otra, ⛔ nunca las dos.** Antes pedía `roas_objetivo` a secas, y eso dejaba la
     * escalada apagada en una marca que ya tenía firmado su techo de costo — pidiéndole a alguien
     * que eligiera un ROAS objetivo, que es justo el número que este repo tiene escrito en tres
     * lados que **no** hay que usar como vara. Con la ficha cargada alcanza; sin ficha, el ROAS
     * sigue sirviendo y la regla lo pide.
     */
    requiereUno: ['cpa_maximo', 'roas_objetivo'],
    sub: 'presupuesto',
    proponeAccion: true,
  },
}

export const CLAVES_PRESET = Object.keys(PRESETS)

/** Cuánto sube un escalón de presupuesto. 20% es el paso que Meta recomienda para no resetear el aprendizaje. */
export const PASO_ESCALON = 0.2

/**
 * ¿Puede este perfil ACCIONAR este hallazgo?
 *
 * 🔑 Igual que un plan, un hallazgo **no suma un sub-permiso nuevo**: pide el de la acción que
 * ejecutaría. Cero tildes nuevas por persona y por marca para habilitar algo que ya se podía hacer
 * a mano desde Campañas.
 */
export function permiteAccionarHallazgo(perfil, preset, linea) {
  const def = PRESETS[preset]
  if (!def) return { ok: false, status: 400, error: `No existe la automatización «${preset}».` }
  if (lineasQuePuede(perfil, def.sub).includes(linea)) return { ok: true }
  return {
    ok: false,
    status: 403,
    error: `Para accionar «${def.rotulo}» hace falta el permiso meta-ads.${def.sub} en esa marca.`,
  }
}

// ── Los umbrales: derivar, sugerir, resolver ────────────────────────────────────

// El nivel del que salen los totales vive en `snapshot.core.js`, al lado de `sumarDias()`: es un
// hecho de la tabla. Se re-exporta para no romper a quien ya lo importa de acá.
export { NIVEL_TOTALES, soloNivel }
// Y el «con aire» se re-exporta para que el guardarraíl de los escalones lo saque del mismo lugar
// que la racha que lo usa, y no vuelva a atarse a `rendimiento.core.js` por su cuenta.
export { CON_AIRE }

/**
 * Los umbrales que NO hay que ir a buscar a un dial: los que se deducen de las filas, y el que ya
 * está firmado en la ficha de rentabilidad.
 *
 * `gasto_minimo` sale del CPA real de la línea: lo que efectivamente costó traer un cliente. Gastar
 * eso y no traer ninguno es la definición mínima de «esto no está andando», y no hay nada que
 * opinar al respecto — por eso este umbral se autocompleta y `roas_objetivo` no.
 *
 * `cpa_maximo` sale del `techo` que se le pasa, que es el de la ficha de la marca. Va acá y no en
 * `umbralesEfectivos` para que caiga en el escalón MÁS BAJO de la precedencia: lo que alguien haya
 * escrito a mano en el dial de la línea, o en la regla, sigue pisándolo. Ver `umbralesEfectivos()`.
 *
 * ⚠️ Si la línea no llegó a `COMPRAS_MINIMAS_CPA`, el CPA no significa y devuelve `null`. No se
 * inventa un piso: sin ventas suficientes no hay con qué decir cuánto es mucho, y una regla apagada
 * con el motivo escrito es mejor que una que grita contra un número sacado del aire —o, peor, que
 * una que se queda MUDA porque el número le quedó impagable. Lo mismo el techo sin ficha.
 */
export function derivarUmbrales(filas, { techo = null } = {}) {
  let gasto = 0
  let compras = 0
  for (const f of soloNivel(filas, NIVEL_TOTALES)) {
    gasto += Number(f.spend) || 0
    compras += Number(f.compras) || 0
  }
  const t = Number(techo)
  return {
    gasto_minimo: compras >= COMPRAS_MINIMAS_CPA ? Math.round(gasto / compras) : null,
    dias_seguidos: DIAS_SEGUIDOS_DEFECTO,
    /**
     * 🔴 **El techo de la ficha, y el de GANANCIA — nunca el de caja.** El de caja incluye el
     * recupero del saldo de IVA, que es plata real pero que no la genera la pauta y se termina: una
     * regla calibrada sobre él arma estructura encima de un stock finito. Ver `calcularRentabilidad`.
     *
     * Sin ficha va `null`, que es lo que deja la regla apagada con el motivo escrito.
     */
    cpa_maximo: Number.isFinite(t) && t > 0 ? Math.round(t) : null,
  }
}

/**
 * Los números que la pantalla MUESTRA al lado del dial, para que el umbral no se elija a ciegas.
 *
 * No se aplican solos: son contexto. La diferencia con `derivarUmbrales` es toda la de este módulo —
 * aquello son hechos que se usan, esto son referencias que se miran.
 */
export function contextoUmbrales(filas) {
  const conGasto = soloNivel(filas, NIVEL_TOTALES).filter((f) => (Number(f.spend) || 0) > 0)
  let gasto = 0
  let revenue = 0
  let compras = 0
  for (const f of conGasto) {
    gasto += Number(f.spend) || 0
    revenue += Number(f.revenue) || 0
    compras += Number(f.compras) || 0
  }
  return {
    dias: new Set(conGasto.map((f) => f.fecha)).size,
    campanias: new Set(conGasto.map((f) => f.objeto_id)).size,
    gastoTotal: gasto,
    // El ROAS de los totales, que es el único defendible al agregar. Ver `sumarDias()`.
    roasMedio: gasto ? revenue / gasto : 0,
    cpaMedio: compras ? gasto / compras : null,
    // 🔴 La frecuencia se mide sobre los AVISOS, que es el nivel donde la mira la regla de fatiga, y
    // como PICO de un día, nunca sumada. Es el número contra el que tiene sentido elegir un máximo:
    // «hoy tu peor día es 3,4».
    frecuenciaPico: frecuenciaPico(soloNivel(filas, 'aviso')),
  }
}

/**
 * Cuántos días DISTINTOS de la ventana tienen el estado escrito.
 *
 * El estado va sólo en la fila del día en que se sacó la foto (ver `guardar()` en
 * `scripts/snapshot-meta.mjs`): escribirlo en una fila de hace dos meses sería inventar una
 * configuración histórica que Meta no expone. La consecuencia es que la serie de estados **empieza
 * el día que arrancó el cron**, y hay reglas que sin ella no pueden decir nada.
 */
export function diasConEstado(filas, fechas) {
  const dentro = new Set(fechas)
  const dias = new Set()
  for (const f of Array.isArray(filas) ? filas : []) {
    if (f && dentro.has(f.fecha) && (f.estado || f.estado_efectivo)) dias.add(f.fecha)
  }
  return dias.size
}

/** El mayor valor de frecuencia observado en UN día. 🔴 Nunca una suma: ver la cabecera del archivo. */
export function frecuenciaPico(filas) {
  let max = 0
  for (const f of Array.isArray(filas) ? filas : []) {
    const v = Number(f && f.frecuencia) || 0
    if (v > max) max = v
  }
  return max
}

/**
 * Los umbrales que rigen para una regla: lo suyo pisa lo de la línea, y lo de la línea pisa lo
 * derivado. Un `null` explícito NO pisa — pisar con «no definido» sería borrar.
 */
export function umbralesEfectivos(regla, umbralLinea, derivados) {
  const out = {}
  for (const k of Object.keys(UMBRALES)) {
    const cands = [regla && regla.parametros && regla.parametros[k], umbralLinea && umbralLinea[k], derivados && derivados[k]]
    const hit = cands.find((v) => v !== undefined && v !== null && v !== '')
    out[k] = hit === undefined ? null : Number(hit)
  }
  return out
}

/**
 * Qué umbrales le faltan a un preset para poder correr. Vacío = corre.
 *
 * `requiere` son todos obligatorios. `requiereUno` es un grupo del que alcanza con **uno**: si no
 * hay ninguno, faltan todos —y `motivoApagada()` los junta con un «o», que es la única forma de que
 * el cartel no le pida a alguien dos números para una sola vara.
 */
export function faltanUmbrales(preset, efectivos) {
  const def = PRESETS[preset]
  if (!def) return []
  const hay = (k) => {
    const v = efectivos && efectivos[k]
    return v !== null && v !== undefined && Number.isFinite(Number(v))
  }
  const faltan = def.requiere.filter((k) => !hay(k))
  const uno = Array.isArray(def.requiereUno) ? def.requiereUno : []
  if (uno.length && !uno.some(hay)) faltan.push(...uno)
  return faltan
}

/**
 * La frase de por qué una regla no está corriendo. Es información, no un error.
 *
 * 🔑 **Un umbral que sale de la ficha manda a la ficha, ⛔ no al dial.** «Falta definir CPA máximo»
 * sobre un número que nadie tiene que definir a mano manda a la persona a la pantalla equivocada, y
 * el que vuelve de ahí sin encontrar qué tocar es el que deja de creerle a la sección.
 */
export function motivoApagada(preset, faltan) {
  const def = PRESETS[preset]
  const enGrupo = new Set((def && Array.isArray(def.requiereUno) ? def.requiereUno : []).filter((k) => faltan.includes(k)))
  const rotulo = (k) => `«${UMBRALES[k] ? UMBRALES[k].rotulo : k}»`
  const sueltos = faltan.filter((k) => !enGrupo.has(k))

  // El caso que más va a pasar el día uno: la marca sin ficha de rentabilidad. Merece su propia
  // frase, con el nombre de la pantalla adonde hay que ir.
  if (sueltos.length === 1 && !enGrupo.size && UMBRALES[sueltos[0]] && UMBRALES[sueltos[0]].desdeFicha) {
    return `Esta marca todavía no tiene cargada su ficha de rentabilidad, y de ahí sale el techo de costo por compra (${rotulo(sueltos[0])}).`
  }

  // Y si el que falta viaja acompañado, igual se dice de dónde sale: la mitad de la frase que
  // manda a la pantalla correcta no puede perderse porque además falte otra cosa.
  const frases = sueltos.map((k) => (UMBRALES[k] && UMBRALES[k].desdeFicha
    ? `${rotulo(k)}, que sale de la ficha de rentabilidad de la marca,`
    : rotulo(k)))
  if (enGrupo.size) frases.push([...enGrupo].map(rotulo).join(' o '))
  if (frases.length === 1) return `Falta definir ${frases[0]} para esta marca.`
  return `Faltan definir ${frases.join(' y ')} para esta marca.`
}

/**
 * Por qué el bloque «Qué hay que decidir» está vacío, cuando lo está.
 *
 * 🔴 **Nace de un cartel que AFIRMABA algo que nunca había preguntado.** Hasta el 26-ago-2026 el
 * vacío decía, con el texto clavado, «no hay reglas cargadas». Era cierto el día que se escribió y
 * dejó de serlo esa misma tarde: `meta_ads_regla` pasó a **11 filas** y la pantalla siguió diciendo
 * que no había ninguna. Lo peor no es el número: es que el cartel manda a cargar reglas a alguien
 * que ya las cargó, y **el que va y no encuentra qué tocar deja de creerle a la sección**.
 *
 * ⇒ El silencio tiene TRES causas distintas y sólo una es buena noticia:
 * - `sin-reglas` — no hay ninguna prendida. El silencio no dice nada de la pauta.
 * - `nunca-corrio` — están prendidas y el reloj todavía no pasó por ellas. Tampoco dice nada, y es
 *   el estado exacto del día en que se prenden: se cargan a la tarde y el cron es a las 07:50.
 * - `todo-bien` — corrieron y no encontraron nada. **Es el único caso en que «vacío» significa
 *   «está todo bien»**, y por eso lleva la fecha: un «no encontró nada» de hace cinco días es otra
 *   cosa (⇒ ver `feedback_areben_updated_at_no_mide_la_espera`: lo que se cuenta es el EVENTO).
 *
 * `ahora` es obligatorio y ⛔ no hay `Date.now()` adentro: es la misma razón por la que el resto de
 * este núcleo recibe `hasta`. Un reloj escondido hace que el texto no se pueda probar.
 *
 * @param {Array<{activa?: boolean, ultimaCorrida?: string|null}>|null} reglas — `null` cuando
 *   todavía no se pudieron leer: ahí ⛔ no se afirma nada.
 * @param {Date|number} ahora
 */
export function silencioDeReglas(reglas, ahora) {
  if (!Array.isArray(reglas)) {
    return {
      clase: 'no-se-sabe',
      prendidas: 0,
      texto: 'No se pudieron leer las automatizaciones, así que este silencio no dice si está todo bien o si no se miró.',
    }
  }
  const activas = reglas.filter((r) => r && r.activa)
  if (!activas.length) {
    return {
      clase: 'sin-reglas',
      prendidas: 0,
      texto: 'Ninguna regla dejó un hallazgo, y eso ⛔ no significa «está todo bien»: no hay ninguna regla prendida. Los detectores existen y evalúan la foto todas las mañanas, pero sin reglas no producen nada.',
    }
  }
  const corridas = activas
    .map((r) => Date.parse(r.ultimaCorrida || ''))
    .filter((t) => Number.isFinite(t))
  const cuantas = `${activas.length} ${activas.length === 1 ? 'regla prendida' : 'reglas prendidas'}`
  if (!corridas.length) {
    return {
      clase: 'nunca-corrio',
      prendidas: activas.length,
      texto: `Hay ${cuantas} y todavía no corrió ninguna, así que este vacío ⛔ tampoco significa «está todo bien». Evalúan la foto del día cerrado a las 07:50; el primer hallazgo llega mañana a esa hora.`,
    }
  }
  // 🔑 **Se miran las DOS puntas.** Con sólo la más reciente, diez reglas de esta mañana tapan la
  // que quedó atrás hace cinco días, y el cartel diría «corrieron hace 1 hora» sobre una que no.
  // Es la misma trampa que `updated_at` para medir una espera: el número existe y no significa.
  const ultima = Math.max(...corridas)
  const atrasada = Math.min(...corridas)
  const cuando = haceTexto(ultima, ahora) === haceTexto(atrasada, ahora)
    ? `corrieron ${haceTexto(ultima, ahora)}`
    : `corrieron —la más reciente ${haceTexto(ultima, ahora)}, la más atrasada ${haceTexto(atrasada, ahora)}—`
  const faltan = activas.length - corridas.length
  const cola = faltan > 0
    ? ` (${faltan} de ellas todavía no corrió nunca)`
    : ''
  return {
    clase: 'todo-bien',
    prendidas: activas.length,
    ultima: new Date(ultima).toISOString(),
    texto: `Las ${cuantas} ${cuando} y no encontraron nada que decidir${cola}.`,
  }
}

/** «hace 3 h» / «hace 2 días». Es lo único que necesita el cartel de arriba, y va acá para probarlo. */
export function haceTexto(cuando, ahora) {
  const ms = (ahora instanceof Date ? ahora.getTime() : Number(ahora)) - Number(cuando)
  const min = ms / 60000
  // Un reloj adelantado no puede imprimir «hace -4 min»: se dice recién y listo.
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${Math.round(min)} min`
  const h = min / 60
  if (h < 24) return `hace ${Math.round(h)} ${Math.round(h) === 1 ? 'hora' : 'horas'}`
  const d = Math.floor(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

// ── Agrupar las filas ───────────────────────────────────────────────────────────

/** Las fechas de la ventana, de más nueva a más vieja, incluyendo `hasta`. */
export function ventanaDe(hastaIso, dias) {
  const t = Date.parse(`${hastaIso}T00:00:00Z`)
  if (!Number.isFinite(t)) return []
  const n = Math.max(1, Math.floor(dias))
  return Array.from({ length: n }, (_, i) => new Date(t - i * 86400000).toISOString().slice(0, 10))
}

/** ¿Esta fila trae escrita la configuración, o sólo las métricas del día? Ver `configActual()`. */
function tieneConfig(f) {
  return !!(f && (f.estado || f.estado_efectivo))
}

/**
 * Las filas de un nivel, agrupadas por objeto y recortadas a la ventana.
 *
 * Cada grupo lleva sus filas ordenadas de **más vieja a más nueva** (así una tendencia se lee en el
 * orden en que pasó) y dos fotos que **no son la misma y no hay que confundir**:
 *
 * - `ultima` — la última fila **de la ventana**. Es la que corresponde cuando la pregunta es sobre el
 *   período que se está mirando (el radar de atribución tardía mira si se apagó *acá adentro*).
 * - `actual` — 🔴 **la fila con configuración más nueva que exista del objeto, esté o no en la
 *   ventana.** Es la que corresponde cuando la pregunta es sobre AHORA: «¿esto está al aire?»,
 *   «¿cuánto gasta por día?».
 *
 * # 🔴 Por qué `actual` existe: sin él, el calibrador miraba 2 días de 90 y no lo decía
 *
 * La configuración (`estado`, `estado_real`, `diario_crudo`) **se escribe sólo en la fila del día en
 * que se sacó la foto** — a propósito, porque escribirla hacia atrás sería inventar una configuración
 * histórica que Meta no expone por ninguna vía. La consecuencia es que las filas del backfill traen
 * métricas y `estado` en `null`.
 *
 * Cinco de los siete detectores arrancan con `if (!estaActivo(...)) return null`, que es una pregunta
 * sobre el presente: *no tiene sentido proponer pausar algo que ya está pausado*. Preguntándosela a
 * `ultima`, el calibrador —que corre la regla hacia atrás sobre 90 días, moviendo `hasta`— la contesta
 * con la fila de aquel día, que no tiene estado, y devuelve `null` **todos los días anteriores al
 * primero con foto de configuración**. Medido contra la pauta real el 9-ago-2026: `freno-emergencia`
 * reportaba 8 saltos en 2 días donde había 86 en 41, y con el ROAS objetivo en 50× —donde tendría que
 * caer absolutamente todo— `gastos-hormiga` contestaba «4». Eso no se lee como «la herramienta está
 * ciega»: se lee como «esta regla casi no salta», que es la conclusión contraria. El dial con el que
 * se eligen los umbrales estaba clavado.
 *
 * ⚖️ **Sí, `actual` puede ser una fila POSTERIOR a `hasta`, y es deliberado.** En una corrida del
 * calibrador la pregunta que se contesta pasa a ser «de lo que **hoy** está al aire, cuántas veces
 * habría saltado esta regla en 90 días», que es exactamente la que sirve para elegir un umbral —y la
 * única contestable, porque de lo que estaba al aire en junio no hay registro. Lo que **no** se hace
 * es usar `actual` para detectar una transición: eso necesita historia de verdad, lo pide un solo
 * preset y ese preset ya lo declara con `requiereHistorialEstado`.
 */
export function agrupar(filas, nivel, fechas) {
  const dentro = new Set(fechas)
  const por = new Map()
  // La foto de configuración más nueva de cada objeto, mirando TODAS las filas y no sólo la ventana.
  // Se queda con la última que tenga configuración escrita: una fila sin `estado` no dice «apagado»,
  // dice «no se sabe», y tratarlas igual es justamente el defecto que este mapa arregla.
  const config = new Map()
  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f || f.nivel !== nivel) continue
    const id = String(f.objeto_id)
    if (tieneConfig(f)) {
      const previa = config.get(id)
      if (!previa || String(f.fecha) > String(previa.fecha)) config.set(id, f)
    }
    if (!dentro.has(f.fecha)) continue
    if (!por.has(id)) por.set(id, [])
    por.get(id).push(f)
  }
  return [...por.entries()].map(([objeto_id, fs]) => {
    const orden = fs.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    const ultima = orden[orden.length - 1]
    // Sin ninguna fila con configuración cae en `ultima`, que es lo que se miraba antes: un objeto del
    // que nunca hubo foto de configuración se sigue leyendo como se leía, no peor.
    const actual = config.get(objeto_id) || ultima
    let spend = 0
    let compras = 0
    let revenue = 0
    let impresiones = 0
    let clicks = 0
    for (const f of orden) {
      spend += Number(f.spend) || 0
      compras += Number(f.compras) || 0
      revenue += Number(f.revenue) || 0
      impresiones += Number(f.impresiones) || 0
      clicks += Number(f.clicks) || 0
    }
    return {
      objeto_id,
      nivel,
      filas: orden,
      ultima,
      actual,
      // El nombre y la línea salen de la foto más nueva: en una corrida del calibrador, reconocer el
      // aviso por el nombre que tiene hoy es lo útil, no por el que tenía en junio.
      nombre: actual.nombre || ultima.nombre || objeto_id,
      linea: actual.linea || ultima.linea || null,
      cuenta_id: actual.cuenta_id || ultima.cuenta_id || null,
      dias: orden.length,
      spend,
      compras,
      revenue,
      impresiones,
      clicks,
      // 🔴 El ROAS de los totales, no el promedio de los `roas` diarios. Ver `sumarDias()`.
      roas: spend ? revenue / spend : 0,
      // 🔴 Y la frecuencia como PICO de un día, nunca sumada.
      frecuenciaPico: frecuenciaPico(orden),
    }
  })
}

// ── Los detectores ──────────────────────────────────────────────────────────────

/** ¿Está activo según la última foto? Meta usa varios `*_PAUSED` según de quién sea el interruptor. */
function estaActivo(fila) {
  const s = String((fila && (fila.estado_efectivo || fila.estado)) || '').toUpperCase()
  return s === 'ACTIVE'
}

/**
 * El índice del primer día APAGADO después del último día activo de la ventana, o `null` si nunca
 * estuvo activo acá adentro.
 *
 * Ese `null` es lo que distingue «lo apagaste esta semana» de «está apagado desde mayo», y es la
 * diferencia entre un aviso que se lee y uno que se ignora. Ver el detector de atribución tardía.
 */
export function apagadoEn(filas) {
  const fs = Array.isArray(filas) ? filas : []
  let ultimoActivo = -1
  for (let i = 0; i < fs.length; i++) if (estaActivo(fs[i])) ultimoActivo = i
  if (ultimoActivo === -1) return null
  return ultimoActivo + 1 < fs.length ? ultimoActivo + 1 : null
}

const DETECTORES = {
  // `actual` y no `ultima`: «no puede entregar» es una afirmación sobre ahora, y `estado_real` sólo
  // está escrito en las filas con foto de configuración. Ver la cabecera de `agrupar()`.
  'sin-avisos': (g) => {
    const real = String(g.actual.estado_real || '')
    if (real !== 'avisos-desactivados' && real !== 'sin-avisos') return null
    const detalle = real === 'sin-avisos'
      ? 'no tiene ningún aviso colgando'
      : 'tiene avisos, pero están todos apagados'
    return {
      motivo: `El conjunto figura activo y ${detalle}: no puede entregar nada.`,
      evidencia: { estado_real: real, estado: g.actual.estado, diario_crudo: g.actual.diario_crudo },
    }
  },

  /**
   * 🔴 **El único que se queda con `ultima`, y tiene que quedarse.** Los demás preguntan «¿esto está
   * al aire ahora?»; éste pregunta «¿esto se apagó ADENTRO de la ventana?», que es una transición y
   * necesita historia de verdad. Cambiarlo a `actual` lo rompería en silencio: leería el estado de
   * hoy como si fuera el del último día de la ventana.
   */
  'atribucion-tardia': (g) => {
    if (estaActivo(g.ultima)) return null
    /**
     * 🔴 **La atribución tardía es un EVENTO, no un estado**, y confundirlos fue el defecto que sólo
     * apareció corriendo el calibrador contra los 90 días reales: «está pausado y tuvo compras» es
     * cierto para siempre, así que un aviso saltaba **81 días seguidos**. Una regla que grita todos
     * los días se deja de mirar, y ahí se pierde también la que tenía razón.
     *
     * Lo que la vuelve un evento es que **la pausa tiene que haber pasado adentro de la ventana**:
     * hubo un día activo y después uno apagado. Algo pausado hace dos meses no es una decisión que
     * se esté por revisar. `apagadoEn` devuelve `null` si nunca estuvo activo en la ventana, y ese
     * `null` es todo el arreglo.
     */
    const corte = apagadoEn(g.filas)
    if (corte === null) return null
    const desde = g.filas.slice(corte)
    let compras = 0
    let revenue = 0
    for (const f of desde) {
      compras += Number(f.compras) || 0
      revenue += Number(f.revenue) || 0
    }
    // Las compras tienen que ser DE LOS DÍAS EN QUE YA ESTABA APAGADO. Contar las de cuando estaba
    // al aire diría «vendía cuando lo pausaste», que es otra cosa (y casi siempre cierta).
    if (compras <= 0) return null
    const dias = desde.length
    return {
      motivo: `Lo pausaste hace ${dias} ${dias === 1 ? 'día' : 'días'} y desde entonces igual registró ${entero(compras)} ${compras === 1 ? 'compra' : 'compras'} por ${plata(revenue)}. Meta se las atribuyó tarde.`,
      evidencia: { compras, revenue, dias_apagado: dias, desde: desde[0].fecha, estado: g.ultima.estado },
      sugerencia: { accion: 'estado', objetoId: g.objeto_id, nivel: g.nivel, status: 'ACTIVE' },
    }
  },

  'freno-emergencia': (g, u) => {
    if (g.compras > 0) return null
    if (g.spend < u.gasto_minimo) return null
    if (!estaActivo(g.actual)) return null
    return {
      motivo: `Gastó ${plata(g.spend)} en ${g.dias} ${g.dias === 1 ? 'día' : 'días'} sin una sola compra, y con eso se pagaba un cliente (el gasto mínimo para juzgar es ${plata(u.gasto_minimo)}).`,
      evidencia: { spend: g.spend, compras: 0, dias: g.dias, gasto_minimo: u.gasto_minimo },
      sugerencia: { accion: 'estado', objetoId: g.objeto_id, nivel: g.nivel, status: 'PAUSED' },
    }
  },

  /**
   * 🔴 **El corte que manda.** Ver `TOLERANCIA_COSTO` para por qué la vara está en 1,5× y no en 1×,
   * que es donde la pone la pantalla.
   */
  'costo-alto': (g, u) => {
    if (!estaActivo(g.actual)) return null
    // Sin una sola compra no habla ésta sino el freno de emergencia. Dos renglones diciendo lo
    // mismo del mismo objeto es la forma más rápida de que se deje de leer la lista.
    if (g.compras <= 0) return null
    // Y con menos de lo que sale un cliente no hay con qué: un costo por compra calculado sobre
    // media compra es aritmética, no evidencia.
    if (g.spend < u.gasto_minimo) return null
    const cpa = g.spend / g.compras
    const limite = u.cpa_maximo * TOLERANCIA_COSTO
    if (cpa <= limite) return null
    const pct = Math.round((cpa / u.cpa_maximo) * 100)
    return {
      motivo: `Compra a ${plata(cpa)} contra un techo de ${plata(u.cpa_maximo)} —el ${pct}%— en ${g.dias} ${g.dias === 1 ? 'día' : 'días'}: ${entero(g.compras)} ${g.compras === 1 ? 'compra' : 'compras'} por ${plata(g.spend)}.`,
      evidencia: {
        spend: g.spend, compras: g.compras, cpa, cpa_maximo: u.cpa_maximo,
        tolerancia: TOLERANCIA_COSTO, limite, pct_techo: pct, dias: g.dias,
      },
      sugerencia: { accion: 'estado', objetoId: g.objeto_id, nivel: g.nivel, status: 'PAUSED' },
    }
  },

  'gastos-hormiga': (g, u) => {
    // Gastó, vendió algo (si no vendió nada es el freno de emergencia, y un objeto no debería
    // salir en dos renglones diciendo lo mismo), y rinde por debajo del objetivo.
    if (g.spend <= 0 || g.compras <= 0) return null
    if (g.roas >= u.roas_objetivo) return null
    if (!estaActivo(g.actual)) return null
    return {
      motivo: `Viene en ${roasTxt(g.roas)} contra un objetivo de ${roasTxt(u.roas_objetivo)}: gastó ${plata(g.spend)} en ${g.dias} días y devolvió ${plata(g.revenue)}.`,
      evidencia: { spend: g.spend, revenue: g.revenue, compras: g.compras, roas: g.roas, roas_objetivo: u.roas_objetivo, dias: g.dias },
      sugerencia: { accion: 'estado', objetoId: g.objeto_id, nivel: g.nivel, status: 'PAUSED' },
    }
  },

  fatiga: (g, u) => {
    if (!estaActivo(g.actual)) return null
    /**
     * 🔑 **La frecuencia es de la ÚLTIMA SEMANA, aunque la ventana sea de tres.** El desgaste es
     * una tendencia y la sobreexposición es un estado: un pico de hace tres semanas no dice que hoy
     * se le esté repitiendo a nadie. Son los últimos días que ENTREGARON —no los últimos siete del
     * calendario—, porque un día sin entrega no cuenta ni a favor ni en contra.
     * 🔴 Y el pico de UN día, nunca la suma. Ver la cabecera.
     */
    const frecuencia = frecuenciaPico(g.filas.slice(-VENTANA_DIAS))
    if (frecuencia < u.frecuencia_maxima) return null
    const ctr = compararCtr(g.filas)
    // Frecuencia alta con el CTR firme es un público chico, no fatiga. Sin la segunda condición
    // esta regla gritaría todos los días sobre las mismas remarketing.
    //
    // 🔴 Y con la magnitud, ⛔ no sólo con la dirección: `despues < antes` a secas dejaba decir
    // «Está quemado» sobre una caída del 2% —3,90% a 3,83%— la misma semana en que otros avisos
    // SUBÍAN 2% y 4%. Ver `CAIDA_CTR_MINIMA`.
    if (!ctr || ctr.caida < CAIDA_CTR_MINIMA) return null
    return {
      motivo: `La misma gente lo vio hasta ${decimal(frecuencia)} veces en un día (el máximo es ${decimal(u.frecuencia_maxima)}) y el CTR cayó ${Math.round(ctr.caida * 100)}%, de ${decimal(ctr.antes)}% a ${decimal(ctr.despues)}%, en ${g.dias} días. Está quemado.`,
      evidencia: {
        frecuencia_pico: frecuencia,
        frecuencia_maxima: u.frecuencia_maxima,
        ctr_antes: ctr.antes,
        ctr_despues: ctr.despues,
        caida_ctr: ctr.caida,
        caida_minima: CAIDA_CTR_MINIMA,
        dias: g.dias,
      },
    }
  },

  'ganador-escalar': (g, u) => {
    if (!estaActivo(g.actual)) return null
    // El diario también sale de la foto de configuración más nueva: sin esto, la propuesta de escalar
    // era invisible en todo el pasado del calibrador (34 saltos en 27 días leídos como 1 en 1).
    const diario = Number(g.actual.diario_crudo) || 0
    // Sin presupuesto propio no hay escalón que dar: el conjunto lo hereda de una campaña con CBO.
    if (diario <= 0) return null
    if (diario >= u.techo_diario_crudo) return null
    const racha = hayRacha(g.filas, u)
    if (!racha.ok) return null
    // El escalón se calcula sobre el diario RELEÍDO en la última foto, y el paso que lo ejecute lo
    // vuelve a leer de Meta: un aumento guardado sin publicar en Ads Manager no está aplicado y la
    // API devuelve el valor viejo sin avisar. Ver el agujero declarado en el plan del módulo.
    const propuesto = proximoDiario(diario, u.techo_diario_crudo)
    if (propuesto === null) return null
    return {
      motivo: `${fraseDeRacha(racha, g)}, y todavía tiene margen de presupuesto.`.replace(/^./, (c) => c.toUpperCase()),
      evidencia: {
        vara: racha.vara, roas: g.roas, roas_objetivo: u.roas_objetivo, cpa: racha.cpa, cpa_maximo: u.cpa_maximo,
        dias_seguidos: racha.seguidos, diario_crudo: diario, techo_diario_crudo: u.techo_diario_crudo, propuesto_crudo: propuesto,
      },
      sugerencia: { accion: 'presupuesto', objetoId: g.objeto_id, nivel: g.nivel, daily_budget: String(propuesto), desdeCrudo: diario },
    }
  },
}

/**
 * El CTR de la primera mitad de la ventana contra el de la segunda.
 *
 * Se recalcula desde clics e impresiones agregados y **no se promedian los CTR diarios**: un día de
 * 10 impresiones pesaría lo mismo que uno de 100.000. Es la misma regla que `sumarDias()`.
 * Devuelve `null` con menos de cuatro días o sin impresiones: no hay con qué hablar de tendencia.
 */
export function compararCtr(filas) {
  const fs = Array.isArray(filas) ? filas : []
  if (fs.length < 4) return null
  const corte = Math.floor(fs.length / 2)
  const ctrDe = (arr) => {
    let imp = 0
    let cl = 0
    for (const f of arr) {
      imp += Number(f.impresiones) || 0
      cl += Number(f.clicks) || 0
    }
    return imp ? (cl / imp) * 100 : null
  }
  const antes = ctrDe(fs.slice(0, corte))
  const despues = ctrDe(fs.slice(corte))
  if (antes === null || despues === null || antes === 0) return null
  // 🔑 `caida` es la magnitud RELATIVA y es lo único comparable entre avisos: medio punto de CTR es
  // el 10% de un aviso al 5% y el 25% de uno al 2%. Negativa cuando subió.
  // Esta función MIDE y ⛔ no decide: el corte lo aplica el detector, con `CAIDA_CTR_MINIMA`.
  return { antes, despues, cae: despues < antes, caida: (antes - despues) / antes }
}

/**
 * Cuántos días SEGUIDOS, contando desde el más reciente hacia atrás, estuvo por encima del objetivo.
 *
 * Desde el final y no desde el principio: «tres días seguidos» quiere decir los tres últimos. Una
 * buena racha de hace una semana, cortada ayer, no es motivo para subir plata hoy. Los días sin
 * gasto **cortan la racha** en vez de saltarse: un objeto que no entregó ayer no confirmó nada.
 */
export function diasSeguidosPorEncima(filas, objetivo) {
  const fs = Array.isArray(filas) ? filas : []
  let n = 0
  for (let i = fs.length - 1; i >= 0; i--) {
    const f = fs[i]
    const spend = Number(f.spend) || 0
    if (spend <= 0) break
    const revenue = Number(f.revenue) || 0
    if (revenue / spend < objetivo) break
    n++
  }
  return n
}

/**
 * Cuántos días CONFIRMÓ estar barato, contando desde el más reciente hacia atrás y sin ningún día
 * caro en el medio.
 *
 * 🔑 **Los tres estados de un día son tres cosas distintas y esta función es donde se separan**, con
 * el mismo `veredicto()` que usan el parte y la zona:
 *
 * - `OK` — compró por debajo del techo. **Confirma**: suma.
 * - `ALTO` — compró arriba del techo, o gastó más que un cliente sin comprar ninguno. **Corta.**
 * - `MIDIENDO` — gastó menos que un cliente y todavía no compró. ⛔ **Ni suma ni corta**: no probó
 *   nada. Sumarlo sería el defecto grande de esta función —una celda que gotea $500 por día y no
 *   vende nunca acumularía siete días de «racha» y terminaría con una propuesta de SUBIRLE plata—;
 *   cortar sería lo contrario, que un día flojo tire abajo una semana buena.
 * - sin gasto — corta, igual que en la vara del ROAS: un día que no entregó no confirmó nada.
 */
export function diasSeguidosBajoElTecho(filas, techo) {
  const fs = Array.isArray(filas) ? filas : []
  let n = 0
  for (let i = fs.length - 1; i >= 0; i--) {
    const f = fs[i]
    const v = veredicto(Number(f.spend) || 0, Number(f.compras) || 0, techo)
    if (v !== 'OK' && v !== 'MIDIENDO') break
    if (v === 'OK') n++
  }
  return n
}

/**
 * ¿Viene bien hace suficientes días como para moverle plata?
 * `{ vara, objetivo, seguidos, piden, cpa, conAire, ok }`.
 *
 * 🔑 **Existe como función suelta porque la comparten dos lugares que NO pueden opinar distinto**: el
 * detector `ganador-escalar`, que PROPONE la escalada, y `decidirEscalon()`, el guardarraíl que la
 * deja pasar horas después. Si cada uno contara la racha a su manera, el Panel podría ofrecer subir
 * y el motor frenar el escalón por una condición que nadie ve — o peor, al revés.
 *
 * 🔴 **La vara es el COSTO si la marca tiene techo, y el ROAS sólo si no lo tiene.** No es una
 * preferencia de estilo: el ROAS que reporta Meta se mueve ±12% con el mix de medios de pago y el
 * techo por compra ±0,7%, así que subir plata contra el ROAS es subirla contra un número que cambia
 * cuando cambia cómo paga la gente. Ver la cabecera de `rentabilidad.core.js`.
 *
 * Con la vara del costo se piden **dos cosas**, y las dos por el mismo motivo —que un escalón es la
 * única acción de todo el módulo que MANDA MÁS PLATA—:
 *  1. la racha de días confirmados, que dice que no fue un día suelto, y
 *  2. que el costo de la ventana entera esté debajo del **{@link CON_AIRE}% del techo**, que dice
 *     que hay margen para que empeore un poco al subir. Subir algo que compra al 98% del techo es
 *     comprarse el problema: el escalón casi siempre encarece antes de asentarse.
 */
export function hayRacha(filas, u) {
  const piden = Math.max(1, Math.floor((u && u.dias_seguidos) || DIAS_SEGUIDOS_DEFECTO))
  const techo = Number(u && u.cpa_maximo)
  if (Number.isFinite(techo) && techo > 0) {
    const fs = Array.isArray(filas) ? filas : []
    let spend = 0
    let compras = 0
    for (const f of fs) {
      spend += Number(f.spend) || 0
      compras += Number(f.compras) || 0
    }
    const cpa = compras > 0 ? spend / compras : null
    const conAire = cpa !== null && cpa <= techo * (CON_AIRE / 100)
    const seguidos = diasSeguidosBajoElTecho(fs, techo)
    return { vara: 'costo', objetivo: techo, seguidos, piden, cpa, conAire, ok: seguidos >= piden && conAire }
  }
  const objetivo = (u && u.roas_objetivo) || 0
  const seguidos = diasSeguidosPorEncima(filas, objetivo)
  return { vara: 'roas', objetivo, seguidos, piden, cpa: null, conAire: null, ok: seguidos >= piden }
}

/**
 * La frase que explica la racha, **una sola para los dos lugares que la dicen**: el detector que
 * propone el escalón y el guardarraíl que lo deja pasar. Dos redacciones del mismo hecho se
 * despegan, y la que se lee tres días después es la del motivo guardado.
 */
export function fraseDeRacha(racha, g) {
  if (racha.vara === 'costo') {
    const pct = racha.cpa !== null && racha.objetivo ? Math.round((racha.cpa / racha.objetivo) * 100) : null
    return `compra a ${racha.cpa === null ? '—' : plata(racha.cpa)} contra un techo de ${plata(racha.objetivo)}${pct === null ? '' : ` (${pct}%)`} y lleva ${racha.seguidos} ${racha.seguidos === 1 ? 'día' : 'días'} sin un día caro`
  }
  return `lleva ${racha.seguidos} días seguidos por encima del objetivo (${roasTxt(g ? g.roas : 0)} contra ${roasTxt(racha.objetivo)})`
}

/**
 * El diario que sigue después de éste, o `null` si ya no hay adónde subir.
 *
 * Sube `PASO_ESCALON` y **corta contra el techo en vez de pasarlo**: el último escalón de una escalera
 * casi nunca es del 20% justo, es el pedacito que falta para llegar al tope. Devolver `null` cuando el
 * resultado no supera al actual es lo que hace que una escalera se termine sola en vez de repetir el
 * mismo número para siempre.
 */
export function proximoDiario(actualCrudo, techoCrudo) {
  const actual = Math.round(Number(actualCrudo) || 0)
  const techo = Math.round(Number(techoCrudo) || 0)
  if (actual <= 0 || techo <= 0) return null
  const prox = Math.min(Math.round(actual * (1 + PASO_ESCALON)), techo)
  return prox > actual ? prox : null
}

// ── La evaluación ───────────────────────────────────────────────────────────────

/**
 * Evalúa una regla sobre un conjunto de filas de snapshot. **Pura**: no lee ni escribe nada.
 *
 * Devuelve siempre la misma forma, y el caso «apagada» es un resultado válido con su motivo escrito
 * —no una excepción ni un array vacío mudo—: la pantalla tiene que poder decir *por qué* no grita,
 * o el silencio se lee como que la sección está rota.
 *
 * `decisiones` es el índice de `indexar()` de `decisiones.core.js`, o `null` para no filtrar nada.
 * Va como opción y no como parámetro obligatorio a propósito: quien no sepa de decisiones —los
 * ensayos, un llamador viejo— sigue obteniendo exactamente lo de antes.
 */
export function evaluarRegla(regla, { filas, umbralLinea, hasta, decisiones = null, techo = null }) {
  const def = PRESETS[regla && regla.preset]
  if (!def) return { ok: false, status: 400, error: `No existe la automatización «${(regla && regla.preset) || ''}».` }

  const linea = regla.linea
  // Las dos grafías a propósito: la fila de la base trae `cuenta_id` y el tipo de la app usa
  // `cuentaId` (igual que `Plan`). Aceptar las dos evita que el handler tenga que acordarse de
  // mapear en un camino y no en el otro — y ese olvido no rompería nada: silenciosamente dejaría de
  // filtrar por cuenta y la regla miraría toda la línea.
  const cuenta = regla.cuentaId ?? regla.cuenta_id ?? null
  // El universo de la línea (y de la cuenta, si la regla la acota). Los umbrales derivados salen de
  // ACÁ y no de la ventana: el CPA de una línea se mide con toda la historia que haya, no con siete
  // días que pueden no tener una sola venta.
  const suyas = (Array.isArray(filas) ? filas : []).filter((f) => {
    if (!f || f.linea !== linea) return false
    if (cuenta && String(f.cuenta_id) !== String(cuenta)) return false
    return true
  })

  // ⚖️ El techo es el de HOY aplicado a toda la ventana, igual que la configuración en `agrupar()`:
  // la ficha guarda un solo juego de supuestos y no hay histórico de cuál regía en junio. La
  // pregunta que se contesta es «con el techo que tengo hoy, esto estaba caro», que es la que sirve.
  const derivados = derivarUmbrales(suyas, { techo })
  const u = umbralesEfectivos(regla, umbralLinea, derivados)
  const faltan = faltanUmbrales(regla.preset, u)
  if (faltan.length) {
    // `silenciados` va en los tres caminos por lo mismo que `hallazgos`: quien lea el resultado no
    // tiene que preguntarse si el campo existe según por dónde salió.
    return { ok: true, apagada: true, faltan, umbrales: u, detalle: motivoApagada(regla.preset, faltan), hallazgos: [], silenciados: [] }
  }

  const fechas = ventanaDe(hasta, def.ventana)

  // 🔴 Los presets que detectan una TRANSICIÓN necesitan al menos dos días con estado escrito, y el
  // estado sólo existe en la fila del día en que se sacó cada foto. Devolver «0 hallazgos» sin
  // decirlo se leería como «esto no pasa», cuando la verdad es «todavía no hay con qué mirarlo».
  if (def.requiereHistorialEstado) {
    const conEstado = diasConEstado(suyas, fechas)
    if (conEstado < 2) {
      return {
        ok: true,
        apagada: true,
        faltan: [],
        sinHistorial: true,
        umbrales: u,
        detalle: `Necesita ver un cambio de estado y por ahora hay ${conEstado === 1 ? 'un solo día' : `${conEstado} días`} de historial en la ventana. Meta no expone la configuración hacia atrás: la serie la arma el cron, un día por vez.`,
        hallazgos: [],
        silenciados: [],
      }
    }
  }

  const detectar = DETECTORES[regla.preset]
  const hallazgos = []
  for (const g of agrupar(suyas, def.nivel, fechas)) {
    const hit = detectar(g, u)
    if (!hit) continue
    hallazgos.push({
      fecha: hasta,
      nivel: g.nivel,
      objeto_id: g.objeto_id,
      objeto_nombre: g.nombre,
      linea: g.linea,
      cuenta_id: g.cuenta_id,
      motivo: hit.motivo,
      evidencia: hit.evidencia || {},
      // `undefined` no sobrevive a un `JSON.stringify`, y en la base la columna es nullable: se
      // normaliza acá para que el handler no tenga que acordarse.
      sugerencia: hit.sugerencia || null,
    })
  }
  // Del más caro al más barato: el orden con el que se leen en el Panel es el orden en que conviene
  // mirarlos, y ordenarlo en la UI lo dejaría distinto entre pantallas. Cae a `revenue` porque no
  // todos los detectores hablan de gasto — el radar de atribución tardía habla de plata ENTRADA, y
  // ordenarlo por un `spend` que no puso lo mandaría siempre al fondo.
  const peso = (h) => Number(h.evidencia.spend) || Number(h.evidencia.revenue) || 0
  hallazgos.sort((a, b) => peso(b) - peso(a))

  /**
   * 🔑 **Las decisiones humanas se aplican ACÁ**, sobre la lista ya armada, y no afuera en el script
   * que guarda.
   *
   * Si el filtro viviera en `scripts/evaluar-reglas-meta.mjs`, el **calibrador quedaría mintiendo**:
   * `calibrar()` llama a esta misma función, así que el dial diría «43 saltos» donde el Panel
   * muestra 12. Todo este archivo está construido sobre que el calibrador y la corrida real son la
   * misma función con otros argumentos; partir el filtro rompe justo eso.
   *
   * ⚠️ Una decisión vigente calla **toda la ventana del calibrador**, incluidos días anteriores al
   * día en que se decidió. Es a propósito: el dial no cuenta historia, contesta «si dejo el umbral
   * acá, cuánto ruido voy a tener **de acá en adelante**», y de acá en adelante esa decisión va a
   * seguir callando. Contar los gritos viejos que hoy estarían callados sobrestimaría el ruido.
   */
  const partidos = partir(hallazgos, decisiones, { preset: regla.preset, hasta })
  return {
    ok: true,
    apagada: false,
    faltan: [],
    umbrales: u,
    detalle: null,
    hallazgos: partidos.hallazgos,
    // Nunca se pierde de vista lo callado: el script lo loguea y la pantalla lo muestra colapsado.
    silenciados: partidos.silenciados,
  }
}

/**
 * 🎯 **El calibrador: la regla corrida HACIA ATRÁS sobre la historia que ya está.**
 *
 * Es la pieza que hace usable el módulo sin que nadie tenga que definir un umbral de antemano. En
 * vez de preguntar «¿cuál es tu ROAS objetivo?» —que nadie sabe contestar en abstracto—, se mueve el
 * dial y esto contesta *«con 2,5 habría saltado 43 veces en 90 días; con 1,5, 6 veces»*, con la
 * lista de cuáles. El umbral deja de ser una definición y pasa a ser algo que se mira.
 *
 * 🔑 **Es `evaluarRegla` con otros argumentos, no una segunda implementación.** Si el calibrador
 * tuviera su propia lógica podría decir 6 y la regla gritar 40, que es exactamente la clase de
 * mentira que hace desconfiar de la herramienta entera. Corre gratis porque lee snapshots, no Meta.
 */
export function calibrar(regla, { filas, umbralLinea, hasta, dias = 90, decisiones = null, techo = null }) {
  const fechas = ventanaDe(hasta, dias)

  // 🔑 **HOY primero, y no es un detalle de orden.** «¿Esta regla puede correr?» es una pregunta
  // sobre AHORA. Recorriendo de lo más viejo a lo más nuevo y cortando en el primer apagado, una
  // regla que hoy funciona pero que en mayo no tenía historial reportaría el estado de mayo — y el
  // cartel diría «0 días de historial» sobre una regla que está andando.
  const hoy = evaluarRegla(regla, { filas, umbralLinea, hasta, decisiones, techo })
  if (!hoy.ok) return hoy
  if (hoy.apagada) {
    return {
      ok: true,
      apagada: true,
      faltan: hoy.faltan,
      sinHistorial: !!hoy.sinHistorial,
      detalle: hoy.detalle,
      dias,
      total: 0,
      objetos: 0,
      porFecha: [],
      ejemplos: [],
    }
  }

  const porFecha = []
  const vistos = new Map()
  for (const fecha of fechas.slice().reverse()) {
    // 🔑 Las mismas decisiones que en la corrida real. Un dial que contara los gritos que hoy están
    // callados mandaría a mover un umbral para arreglar un ruido que ya no existe.
    const r = evaluarRegla(regla, { filas, umbralLinea, hasta: fecha, decisiones, techo })
    if (!r.ok) return r
    // Un día sin historial de estado en el pasado no apaga el calibrador: simplemente no aportó
    // nada. Cortar ahí borraría toda la serie por los días viejos del backfill.
    if (r.apagada) continue
    porFecha.push({ fecha, n: r.hallazgos.length })
    for (const h of r.hallazgos) {
      // Por objeto y no por (objeto, fecha): lo que importa saber es a cuántas cosas DISTINTAS
      // habría señalado, no cuántas veces habría repetido el mismo renglón siete días seguidos.
      if (!vistos.has(h.objeto_id)) vistos.set(h.objeto_id, { ...h, veces: 0 })
      vistos.get(h.objeto_id).veces++
    }
  }

  const ejemplos = [...vistos.values()].sort((a, b) => b.veces - a.veces)
  return {
    ok: true,
    apagada: false,
    dias,
    // Cuántas veces habría saltado en total (la misma cosa varios días cuenta varias veces: es lo
    // que se leería en el Panel, o sea el ruido real).
    total: porFecha.reduce((s, d) => s + d.n, 0),
    // Y a cuántas cosas distintas. Los dos números juntos son el dato: 40 saltos sobre 3 objetos es
    // una regla repetitiva, 40 sobre 40 es una regla que encontró algo.
    objetos: ejemplos.length,
    porFecha,
    ejemplos: ejemplos.slice(0, 20),
  }
}

// ── Los hallazgos, agrupados para leerlos ────────────────────────────────────────

/**
 * Cuánto grita un hallazgo. **Sale de lo que PROPONE, ⛔ no del preset**: dos reglas distintas
 * pueden terminar las dos en «pausá esto», y lo que ordena la lectura es si hay plata quemándose o
 * una oportunidad esperando.
 *
 * 🔑 **Vive acá y ⛔ no en la pantalla porque la leen DOS**: el badge del sidebar
 * (`avisosDeHallazgo`, que la convierte en su `Tone`) y el mail de la mañana, que la usa para
 * ordenar y para el asunto. Copiada, el día que se agregue una acción nueva una de las dos se
 * entera y la otra no — que es el bug del mismo número con dos implementaciones.
 *
 * - `quema` — hay plata saliendo AHORA. Es la única que propone pausar.
 * - `oportunidad` — plata que se está dejando de ganar: reactivar, subir el presupuesto.
 * - `mirar` — no propone nada. Es la que más fácil se queda quieta, porque nadie sabe qué apretar.
 */
export function gravedadDeHallazgo(sugerencia) {
  const s = sugerencia
  if (s && s.accion === 'estado' && s.status === 'PAUSED') return 'quema'
  if (s) return 'oportunidad'
  return 'mirar'
}

/** El orden de lectura. `quema` primero: es lo único que cuesta plata mientras se lo mira. */
export const ORDEN_GRAVEDAD = { quema: 0, mirar: 1, oportunidad: 2 }


/**
 * Los hallazgos crudos de la base, agrupados **uno por (regla, objeto)** y con desde cuándo lo
 * viene diciendo.
 *
 * Vivía adentro de `api/_meta-reglas.js`, en doce líneas sin test, y de ahí salían dos números que
 * la pantalla afirma. Baja acá por lo mismo de siempre: **lo que se afirma se prueba**.
 *
 * 🔴 **`veces` decía «cuántos días seguidos lleva» y contaba FILAS.** Un conjunto que cruzó el techo
 * el lunes, aflojó el martes y volvió a cruzarlo hoy tenía dos filas en `nuevo` y se leía «2 días
 * seguidos», que es una afirmación sobre una racha que no existió. Ahora se cuenta la racha de
 * verdad: se camina hacia atrás desde el día más reciente y se corta en el primer hueco.
 *
 * 🔑 **Y de ahí sale `desde`, que es lo que hay que mirar: cuándo EMPEZÓ, ⛔ no cuándo se tocó por
 * última vez.** Es la misma trampa que `updated_at` para medir una espera — con la fecha del último
 * renglón, un problema de hace cinco días parece de esta mañana todos los días, y el aviso que
 * cuenta «lo que apareció desde tu última visita» se prendería de nuevo cada mañana por lo mismo.
 *
 * ⚠️ El precio del corte por hueco: **una mañana sin cron parte la racha** y el hallazgo se lee más
 * joven de lo que es. Es la dirección barata del error —subestimar la espera hace que el aviso
 * grite menos, ⛔ nunca que grite por algo que no pasó— y se ve en `ultima_corrida` de la regla.
 *
 * @param {Array<{regla_id: number, objeto_id: string, fecha: string}>} filas — como vienen de la
 *   tabla. ⛔ No se asume el orden: se ordena acá.
 */
/**
 * **Reparte los hallazgos entre las filas de la tabla de celdas.**
 *
 * # 🔴 Por qué, y qué defecto arregla — medido el 30-ago-2026
 *
 * Contra producción: **21 hallazgos, 13 grupos, los 21 en `nuevo`. Ninguno accionado en cuatro
 * días.** El motor encuentra todas las mañanas y nadie contesta. Tres causas, y ninguna es que falte
 * la pantalla:
 *
 *  1. El bloque «Qué hay que decidir» estaba **al final de una página larga** —después de la banda,
 *     los planes, los KPIs, la tira, la tabla entera y el oráculo—.
 *  2. Un hallazgo de cuatro días se veía **igual** que uno de esta mañana: `veces` y `desde` los
 *     calculaba `agruparHallazgos` y la pantalla los tiraba.
 *  3. 🔑 **La mano estaba partida en dos.** El hallazgo decía «pausá GIRLHOOD FRIO» en un bloque, y la
 *     fila de GIRLHOOD FRIO con su botón de pausar estaba ochocientos píxeles más arriba. Dos lugares
 *     para el mismo gesto sobre el mismo objeto.
 *
 * ⇒ el que tiene fila **va en su fila**; el que no, en un bloque **arriba** de la tabla.
 *
 * # 🔑 Un hallazgo de AVISO también tiene celda
 *
 * Los hallazgos vienen a nivel conjunto **y** a nivel aviso (`AD01 - UNBOXING LOCAL` vendiendo dos
 * días después de pausado). Un aviso ⛔ no es una fila de la tabla, pero **vive adentro de una**: se
 * lo busca entre los `avisos` de cada celda. Sin esto, la mitad de los hallazgos quedaría suelta
 * arriba hablando de algo que está dibujado abajo.
 *
 * ⚠️ Lo que ⛔ **no** se toca es la `sugerencia`: sigue apuntando al objeto del hallazgo. Un hallazgo
 * de aviso pegado a la fila de su celda **pausa el aviso**, ⛔ no la caja — y el rótulo lo dice
 * nombrando el objeto.
 */
export function repartirHallazgos(celdas, hallazgos) {
  const deCelda = new Map()
  for (const c of celdas || []) {
    deCelda.set(String(c.id), String(c.id))
    for (const a of c.avisos || []) deCelda.set(String(a.id), String(c.id))
  }
  const porCelda = new Map()
  const sueltos = []
  for (const h of hallazgos || []) {
    const celdaId = deCelda.get(String(h.objetoId))
    if (!celdaId) { sueltos.push(h); continue }
    if (!porCelda.has(celdaId)) porCelda.set(celdaId, [])
    porCelda.get(celdaId).push(h)
  }
  return { porCelda, sueltos }
}

/**
 * El renglón de arriba: **cuántas cosas hay que decidir y cuántas están quemando plata.**
 *
 * 🔑 Es el mismo criterio que el asunto del mail de las 07:50 (`Pauta · 4 cosas para decidir, 1
 * quemando plata`), y ⛔ no una cuenta nueva: si la pantalla y el mail contaran distinto, el que
 * abre el mail y después la pantalla no sabría a cuál creerle.
 *
 * «Quemando plata» son las que proponen **pausar**: es lo único de la lista donde cada día que pasa
 * cuesta. ⛔ No se cuenta por preset —un preset nuevo que proponga pausar tiene que entrar solo.
 */
export function contarParaDecidir(hallazgos) {
  const total = (hallazgos || []).length
  const quemando = (hallazgos || []).filter(
    (h) => h.sugerencia && h.sugerencia.accion === 'estado' && h.sugerencia.status === 'PAUSED',
  ).length
  return { total, quemando }
}

/**
 * **Hace cuántos días viene diciendo lo mismo**, para que uno de cuatro días ⛔ no se vea igual que
 * uno de esta mañana.
 *
 * 🔴 Los dos números que hacen falta —`veces` y `desde`— los calculaba `agruparHallazgos` desde el
 * 26-ago-2026 **y la pantalla los tiraba**: el pill decía «Detectado» y nada más. Medido el 30-ago:
 * 21 hallazgos, cuatro días seguidos de los mismos, ninguno accionado. Un aviso que no envejece a la
 * vista es un aviso que se mira una vez.
 *
 * 🔑 **`null` con `veces <= 1`, y ⛔ no «1 día»**: el de hoy es la noticia, y marcarlo con una edad le
 * quitaría peso justamente al único que todavía no se ignoró. Lo que hay que ver es el que insiste.
 */
export function insistenciaDe(hallazgo) {
  const h = hallazgo || {}
  const veces = Number(h.veces) || 0
  if (veces <= 1) return null
  return { dias: veces, texto: `${veces} días seguidos`, desde: h.desde || null }
}

export function agruparHallazgos(filas) {
  const porGrupo = new Map()
  for (const h of filas || []) {
    const k = `${h.regla_id}:${h.objeto_id}`
    if (!porGrupo.has(k)) porGrupo.set(k, [])
    porGrupo.get(k).push(h)
  }
  return [...porGrupo.values()].map((lista) => {
    const orden = lista.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    // Hacia atrás desde el más reciente: el primer hueco corta. `fin` es la fila más vieja de la
    // racha y ⛔ no se deduce de `veces`: un empate de fecha —dos filas del mismo día, que el
    // `unique` no debería dejar entrar— avanza la fila sin sumar un día, y los dos números se
    // despegarían.
    let veces = 1
    let fin = 0
    for (let i = 1; i < orden.length; i++) {
      const salto = diasEntre(orden[i].fecha, orden[i - 1].fecha)
      if (salto > 1) break
      fin = i
      if (salto === 1) veces++
    }
    return { ...orden[0], veces, desde: orden[fin].fecha }
  })
}
