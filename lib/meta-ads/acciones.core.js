/**
 * Accionar sobre la pauta de Meta: qué acciones existen, quién las puede hacer y sobre qué.
 * LA implementación, una sola, para los dos mundos.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js` y `lib/meta-ads/ideas.core.js`: `api/_meta-acciones.js`
 * corre en Node sin pasar por el compilador de Next y **no puede importar TypeScript**.
 *
 * Y acá el motivo pesa el triple, porque lo que vive en este archivo es **quién puede mover plata**.
 * La pantalla dibuja los botones con las mismas líneas con que el servidor decide. Escribirlo dos
 * veces es el bug que ya pasó dos veces en este repo: el equipo entero sin ver el padrón de Canjes,
 * y campañas de Meta pausadas por quien tenía el permiso excluido.
 *
 * ⚠️ La UI **no es el control de acceso**: no dibujar un botón no impide un `POST` con `curl`. Esto
 * le da la respuesta a los dos, pero el que manda es el servidor.
 *
 * # El riesgo que ordena todo el archivo
 *
 * **Las tres líneas se pautean desde la MISMA cuenta publicitaria.** Un error de escritura no lo
 * paga una marca sola. Por eso ningún chequeo de acá es un booleano global: todo se pregunta por la
 * LÍNEA de la campaña que se está tocando, y una campaña sin línea asignada no se acciona (ver
 * `SIN_LINEA`).
 */

import { marcasConAcceso } from '../permisos.core.js'
import { ETIQUETA_LINEA, lineasDeMarca } from './lineas.core.js'

/** Las marcas del monitor desde las que cuelgan las líneas de pauta. Stunned viene con Zattia. */
export const MARCAS_META = ['bdi', 'zattia']

/** Los tres niveles de la jerarquía de Meta. El orden es de afuera hacia adentro. */
export const NIVELES = ['campania', 'conjunto', 'aviso']

export const ETIQUETA_NIVEL = {
  campania: 'campaña',
  conjunto: 'conjunto',
  aviso: 'aviso',
}

/**
 * La tabla de acciones. **Todo lo que el servidor deja pasar está acá y en ningún otro lado.**
 *
 * `campos` es una whitelist cerrada: un campo que no está en la lista es un **400**, no un campo
 * ignorado en silencio. La diferencia importa porque quien manda `bid_strategy` en el payload
 * tiene que enterarse de que no se aplicó, no creer que sí.
 *
 * `reintentable` no es una opinión de quien escribe el código: vive acá porque es una propiedad de
 * la acción. Poner `status` o `daily_budget` a un valor ABSOLUTO se puede repetir sin consecuencia;
 * duplicar o crear, no —un reintento hace dos campañas—. La Tanda 2 va a sumar acciones con
 * `reintentable: false` y `graphPost` ya no reintenta por su cuenta.
 *
 * ⛔ **`bid_strategy` no está y no va a estar en la Tanda 1.** Meta exige que el presupuesto y la
 * puja vivan al mismo nivel, y la única forma de no poder violar esa regla es no tener con qué
 * mandar puja. Aparece recién en la Tanda 3, cuando se creen conjuntos enteros.
 */
export const ACCIONES = {
  estado: {
    sub: 'pausar',
    rotulo: 'pausar o activar',
    rotuloPermiso: 'Puede pausar y activar anuncios',
    niveles: ['campania', 'conjunto', 'aviso'],
    campos: ['status'],
    reintentable: true,
  },
  presupuesto: {
    sub: 'presupuesto',
    rotulo: 'cambiar el presupuesto diario',
    rotuloPermiso: 'Puede cambiar el presupuesto',
    // Un aviso no tiene presupuesto propio en Meta: lo hereda del conjunto.
    niveles: ['campania', 'conjunto'],
    campos: ['daily_budget'],
    reintentable: true,
  },
}

export const CLAVES_ACCION = Object.keys(ACCIONES)

/**
 * Los campos que se le piden a Meta al LEER el objeto antes de escribir, por nivel.
 *
 * Cada lista lleva a propósito un campo que **sólo existe en ese nivel** (`objective` en campaña,
 * `campaign_id` en conjunto, `adset_id` en aviso). Así, si alguien manda un id de campaña diciendo
 * que es un aviso, Graph contesta `(#100) Tried accessing nonexisting field` y el pedido muere en
 * la lectura, antes de escribir nada. La verificación positiva (`nivelReal`) es el segundo cerrojo.
 */
export const CAMPOS_LECTURA = {
  campania: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,account_id',
  conjunto: 'id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id,account_id',
  aviso: 'id,name,status,effective_status,adset_id,campaign_id,account_id',
}

/**
 * Qué nivel es DE VERDAD el objeto que devolvió Meta.
 *
 * Un aviso trae `adset_id`; un conjunto trae `campaign_id` y no `adset_id`; una campaña no trae
 * ninguno de los dos. Sin este chequeo, alguien manda un `campaign_id` declarando que es un aviso y
 * se saltea la validación de nivel de la tabla —justo la que decide, por ejemplo, que el
 * presupuesto no se toca a nivel aviso—.
 */
export function nivelReal(obj) {
  if (!obj || typeof obj !== 'object') return null
  if (obj.adset_id) return 'aviso'
  if (obj.campaign_id) return 'conjunto'
  return 'campania'
}

const err = (status, error) => ({ ok: false, status, error })

/**
 * Valida la FORMA del pedido: acción conocida, nivel permitido, id numérico, campos dentro de la
 * whitelist y clave de idempotencia. Todo lo que no necesita hablar con Meta pasa por acá.
 */
export function validarPedido(p) {
  const accion = String((p && p.accion) || '')
  const def = ACCIONES[accion]
  if (!def) return err(400, `No existe la acción «${accion || '(vacía)'}».`)

  const nivel = String((p && p.nivel) || '')
  if (!NIVELES.includes(nivel)) return err(400, `No existe el nivel «${nivel || '(vacío)'}».`)
  if (!def.niveles.includes(nivel)) {
    return err(400, `«${def.rotulo}» no se puede a nivel ${ETIQUETA_NIVEL[nivel]}.`)
  }

  const objetoId = String((p && p.objetoId) || '')
  if (!/^\d+$/.test(objetoId)) return err(400, 'El id del objeto tiene que ser un número de Meta.')

  const campos = p && p.campos
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) {
    return err(400, 'Falta decir qué cambiar.')
  }
  const claves = Object.keys(campos)
  if (!claves.length) return err(400, 'Falta decir qué cambiar.')
  // Un campo fuera de la lista es un 400 y no un campo ignorado: quien lo mandó tiene que
  // enterarse de que no se aplicó, no creer que sí.
  const fuera = claves.filter((k) => !def.campos.includes(k))
  if (fuera.length) {
    return err(400, `«${def.rotulo}» no acepta ${fuera.join(', ')}. Sólo ${def.campos.join(', ')}.`)
  }

  const idem = String((p && p.idem) || '')
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(idem)) {
    return err(400, 'Falta la clave de la acción, que es lo que evita que un doble clic la haga dos veces.')
  }

  const valores = validarValores(accion, campos)
  if (!valores.ok) return valores

  return { ok: true, def, accion, nivel, objetoId, campos, idem }
}

/** Los valores de cada campo. Lo que depende de la cuenta (el mínimo) se chequea aparte. */
export function validarValores(accion, campos) {
  if (accion === 'estado') {
    const s = String(campos.status || '').toUpperCase()
    if (s !== 'ACTIVE' && s !== 'PAUSED') return err(400, 'El estado tiene que ser ACTIVE o PAUSED.')
    return { ok: true }
  }
  if (accion === 'presupuesto') {
    const v = Number(campos.daily_budget)
    if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) {
      return err(400, 'El presupuesto diario tiene que ser un número entero mayor que cero.')
    }
    return { ok: true }
  }
  return { ok: true }
}

/**
 * Las líneas de pauta sobre las que este perfil puede ejercer `sub`.
 *
 * Pide las **dos** cosas: ver Meta Ads en la marca y tener el sub tildado ahí. `puedeSub` sola no
 * mira la sección, y para una acción que mueve plata "tiene el tilde pero no ve la sección" no es
 * un permiso, es un resto de una configuración vieja.
 *
 * `marcasConAcceso` es la misma que usan Inicio, Solicitudes y el censo de etapas: respeta la
 * cuenta fija (que le gana al admin) y la excepción negativa. Stunned entra de la mano de Zattia.
 */
export function lineasQuePuede(perfil, sub) {
  const ve = marcasConAcceso(perfil, 'meta-ads', MARCAS_META)
  const tiene = marcasConAcceso(perfil, `meta-ads.${sub}`, MARCAS_META)
  return ve.filter((m) => tiene.includes(m)).flatMap((m) => lineasDeMarca(m))
}

/**
 * ¿Puede este perfil hacer `accion` sobre una campaña de `linea`? El 403 dice **qué permiso y en
 * qué marca**, porque el que lo lee tiene que poder pedirlo, no adivinar cuál le falta.
 */
export function permiteAccion(perfil, accion, linea) {
  const def = ACCIONES[accion]
  if (!def) return err(400, `No existe la acción «${accion}».`)
  if (lineasQuePuede(perfil, def.sub).includes(linea)) return { ok: true }
  const marca = ETIQUETA_LINEA[linea] || linea
  return err(403, `Para ${def.rotulo} en ${marca} hace falta el permiso «${def.rotuloPermiso}» (meta-ads.${def.sub}) en esa marca.`)
}

/** Las acciones que este perfil puede ejercer sobre una línea. Es lo que dibuja los botones. */
export function accionesQuePuede(perfil, linea) {
  return CLAVES_ACCION.filter((a) => permiteAccion(perfil, a, linea).ok)
}

/**
 * 🔴 Una campaña sin línea asignada **no se acciona**, y esto es un 409 y no un 403.
 *
 * No es un problema de permisos —no hay permiso que lo arregle, ni siquiera el de admin—: es que
 * con las tres marcas en una sola cuenta, accionar sobre una campaña huérfana es mover plata que
 * nadie sabe de quién es. El estado se arregla asignándola, y por eso el cartel lleva el botón.
 */
export const SIN_LINEA = 'Esta campaña todavía no tiene marca. Asignala en Etapas y volvé.'

/**
 * Las reglas de presupuesto que impone Meta, en el orden en que hay que contarlas.
 *
 * `objeto` es lo que se leyó de Meta; `padre` es su campaña (sólo cuando el objeto es un conjunto);
 * `minDiarioCrudo` es el `min_daily_budget_low_freq` de la cuenta, o `null` si no se pudo leer.
 *
 * ⚠️ Todos los montos van en la **unidad menor de la moneda** (en ARS, `150000` = $1.500). Ver
 * `factorMoneda`.
 */
export function revisarPresupuesto(nivel, objeto, padre, minDiarioCrudo, pedido) {
  const diario = Number(objeto && objeto.daily_budget) || 0
  const total = Number(objeto && objeto.lifetime_budget) || 0

  // CBO: si la campaña tiene el presupuesto, el del conjunto no existe y ponerlo no hace nada.
  // El mensaje dice DÓNDE tocarlo, que es lo único útil que se puede contestar acá.
  if (nivel === 'conjunto' && padre && Number(padre.daily_budget) > 0) {
    return err(409, 'El presupuesto de esta campaña se maneja a nivel campaña (Meta lo reparte solo entre los conjuntos). Cambialo en la fila de la campaña.')
  }

  if (!diario && total > 0) {
    return err(409, `Esta ${ETIQUETA_NIVEL[nivel]} usa presupuesto total, no diario. Desde acá se muestra pero no se edita.`)
  }
  if (!diario) {
    return err(409, `Esta ${ETIQUETA_NIVEL[nivel]} no tiene presupuesto diario propio, así que no hay qué cambiarle.`)
  }

  // El mínimo de la cuenta. Si no se pudo leer NO se bloquea: es un enriquecimiento, y negarse a
  // escribir porque falló una lectura secundaria sería peor que dejar que Meta conteste su error.
  if (minDiarioCrudo && Number(pedido) < Number(minDiarioCrudo)) {
    return err(400, `Meta no acepta menos de ${minDiarioCrudo} (en la unidad menor de la moneda) de presupuesto diario en esta cuenta.`)
  }
  return { ok: true }
}

/**
 * Cuántas unidades menores tiene una unidad de esta moneda.
 *
 * 🔑 **La trampa número uno de esta tanda.** Meta maneja `daily_budget` y los mínimos en la unidad
 * MENOR: en ARS, `18000` son $180, no $18.000. Un `×100` de más o de menos es la diferencia entre
 * subir el diario y multiplicarlo por cien, y no lo avisa nadie: Meta acepta los dos.
 *
 * La lista de las monedas sin decimales es la que documenta Meta. Las tres cuentas de acá son ARS
 * (×100), así que en la práctica sólo se usa esa rama; el resto está para que el día que aparezca
 * otra moneda el error salte acá y no en el saldo.
 */
const SIN_DECIMALES = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'])

export function factorMoneda(moneda) {
  return SIN_DECIMALES.has(String(moneda || '').toUpperCase()) ? 1 : 100
}

/** De lo que se tipea ($ 18.000) a lo que entiende Meta (1800000 en ARS). */
export function aCrudo(monto, moneda) {
  return Math.round(Number(monto) * factorMoneda(moneda))
}

/** De lo que devuelve Meta a lo que se muestra. */
export function aMonto(crudo, moneda) {
  return Number(crudo || 0) / factorMoneda(moneda)
}

/**
 * ¿Quedó puesto de verdad?
 *
 * Meta acepta cambios de presupuesto que después no aplica: contesta `success: true` y el valor
 * sigue siendo el de antes. Por eso `ok: true` no sale del POST sino de **releer y comparar**, y lo
 * que va a la auditoría es lo releído, no lo pedido. Mismo patrón que `api/crear-venta.js` y
 * `api/_observaciones.js`.
 */
const NORMALIZA = {
  status: (v) => String(v ?? '').toUpperCase(),
  daily_budget: (v) => String(Math.round(Number(v) || 0)),
}

export function quedoPuesto(campos, releido) {
  const faltan = []
  for (const k of Object.keys(campos || {})) {
    const n = NORMALIZA[k] || ((x) => String(x ?? ''))
    if (n(releido && releido[k]) !== n(campos[k])) faltan.push(k)
  }
  return { ok: faltan.length === 0, faltan }
}

/** El «de» y el «a» que se guardan en la auditoría y se muestran en el cartel de confirmación. */
export function fotoDe(campos, obj) {
  const out = {}
  for (const k of Object.keys(campos || {})) out[k] = (obj && obj[k]) ?? null
  return out
}
