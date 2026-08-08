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
 * El nivel con su demostrativo y su pronombre. Existe porque `campaña` es femenino y
 * `conjunto`/`aviso` masculinos, y armar la frase con `ETIQUETA_NIVEL` sola produce **«Esta conjunto
 * tiene 6 avisos… Duplicala»**, que fue exactamente lo que salió en pantalla. Un mensaje mal
 * concordado se lee como un error del sistema y le saca autoridad justo al cartel que está
 * explicando por qué no se pudo hacer algo.
 */
export const ESTE_NIVEL = {
  campania: 'Esta campaña',
  conjunto: 'Este conjunto',
  aviso: 'Este aviso',
}

export const PRONOMBRE_NIVEL = {
  campania: 'la',
  conjunto: 'lo',
  aviso: 'lo',
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
  nombre: {
    // Mismo sub que duplicar: no es un descuido. Renombrar nació como el segundo paso de «duplicar y
    // ajustar» —la copia sale con el sufijo que genera el servidor y hay que poderle poner el nombre
    // de verdad—, así que quien puede duplicar tiene que poder terminarlo. Un sub propio serían dos
    // tildes más por persona y por marca para habilitar la mitad de una operación.
    sub: 'crear',
    rotulo: 'renombrar',
    rotuloPermiso: 'Puede duplicar y crear campañas',
    // Los tres niveles: un aviso mal nombrado es tan ilegible como una campaña mal nombrada, y
    // renombrar no mueve un peso en ninguno.
    niveles: ['campania', 'conjunto', 'aviso'],
    campos: ['name'],
    // Poner un nombre ABSOLUTO se puede repetir sin consecuencia: el segundo intento deja lo mismo
    // que el primero.
    reintentable: true,
  },
  duplicar: {
    // El sub `crear` cubre también renombrar y la Tanda 3: cada sub son dos tildes manuales por
    // persona y por marca, y uno más es uno más que alguien se olvida de dar.
    sub: 'crear',
    rotulo: 'duplicar',
    rotuloPermiso: 'Puede duplicar y crear campañas',
    // Un aviso no se duplica por ahora: la copia de un aviso suelto sin su conjunto no tiene dónde
    // entregar, y el caso real es «sacá otra igual», que empieza en la campaña o en el conjunto.
    niveles: ['campania', 'conjunto'],
    // 🔑 **Sin campos, y no es un olvido.** Lo que se duplica no lo elige quien aprieta: el nombre
    // de la copia lo genera el servidor (con un sufijo único, que es lo que permite «releer y
    // adoptar» si la llamada se corta) y el estado es siempre PAUSED. Un campo acá sería una
    // decisión que el que mira el cartel no puede tomar bien.
    campos: [],
    // ⛔ **Jamás `true`.** Un reintento de esto no repite un valor: hace DOS campañas. Es la razón
    // por la que `reintentable` vive en esta tabla y no en el criterio de quien escribe el handler.
    reintentable: false,
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
  const objeto = campos && typeof campos === 'object' && !Array.isArray(campos)
  const claves = objeto ? Object.keys(campos) : []

  // Una acción SIN campos (duplicar) no recibe ninguno: lo que va a hacer no lo decide quien
  // aprieta. Aceptarlos "por las dudas" abriría la puerta a mandar un `status` en el mismo pedido y
  // que la copia naciera activa, que es exactamente lo que la whitelist existe para impedir.
  if (!def.campos.length) {
    if (claves.length) {
      return err(400, `«${def.rotulo}» no acepta campos: qué se copia y cómo lo decide el servidor.`)
    }
  } else {
    if (!objeto || !claves.length) return err(400, 'Falta decir qué cambiar.')
    // Un campo fuera de la lista es un 400 y no un campo ignorado: quien lo mandó tiene que
    // enterarse de que no se aplicó, no creer que sí.
    const fuera = claves.filter((k) => !def.campos.includes(k))
    if (fuera.length) {
      return err(400, `«${def.rotulo}» no acepta ${fuera.join(', ')}. Sólo ${def.campos.join(', ')}.`)
    }
  }

  const idem = String((p && p.idem) || '')
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(idem)) {
    return err(400, 'Falta la clave de la acción, que es lo que evita que un doble clic la haga dos veces.')
  }

  const valores = validarValores(accion, objeto ? campos : {})
  if (!valores.ok) return valores

  // Lo que sale de acá es lo que se manda **y** lo que se guarda como `pedido` en la auditoría. Por
  // eso la normalización va antes de las dos cosas y no en el medio: si se guardara sin limpiar, la
  // fila diría un nombre y Meta tendría otro.
  return { ok: true, def, accion, nivel, objetoId, campos: normalizarCampos(accion, objeto ? campos : {}), idem }
}

/**
 * El tope de largo del nombre. **Es nuestro, no de Meta**: Meta acepta nombres mucho más largos.
 * Lo ponemos porque un nombre que no entra en una fila de la tabla no lo lee nadie, y porque el que
 * duplica pega el nombre viejo con el sufijo y sin tope se acumulan «— copia — copia — copia».
 */
export const LARGO_NOMBRE = 255

/**
 * El tope de anuncios que Meta copia en una llamada SÍNCRONA. Con más, la Graph API obliga a la vía
 * asíncrona (`/asyncbatch`), que hay que pollear.
 *
 * 🔑 **Vive acá y no en el handler porque la pantalla lo nombra.** El modal de duplicar avisa «este
 * conjunto tiene 6 avisos y Meta copia hasta 3» ANTES de gastar una escritura, y el servidor contesta
 * 409 con la misma frase: dos números distintos serían un cartel que promete lo que el servidor
 * niega. Mismo criterio que la tabla de acciones con la que se dibujan los botones.
 */
export const TOPE_ADS_SINCRONO = 3

/**
 * Deja los campos como se van a mandar. Hoy sólo el nombre, que llega con los espacios de quien lo
 * tipeó: Meta los recorta al guardar, así que sin este `trim` la relectura no coincidiría con lo
 * pedido y `quedoPuesto()` diría que Meta no lo aplicó. Ver `NORMALIZA`.
 */
export function normalizarCampos(accion, campos) {
  if (accion === 'nombre') return { name: String((campos && campos.name) ?? '').trim() }
  return campos
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
  if (accion === 'nombre') {
    const n = String(campos.name ?? '').trim()
    if (!n) return err(400, 'El nombre no puede quedar vacío.')
    if (n.length > LARGO_NOMBRE) return err(400, `El nombre no puede pasar de ${LARGO_NOMBRE} caracteres.`)
    // Un salto de línea o un tabulador rompen la fila de la tabla y, peor, el buscador de Ads
    // Manager: quien después vaya a buscar la campaña por su nombre no la encuentra.
    if (/[\r\n\t]/.test(n)) return err(400, 'El nombre tiene que ir en un solo renglón.')
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
  const ve = lineasQueVe(perfil)
  const tiene = marcasConAcceso(perfil, `meta-ads.${sub}`, MARCAS_META).flatMap((m) => lineasDeMarca(m))
  return ve.filter((l) => tiene.includes(l))
}

/**
 * Las líneas de pauta que este perfil puede MIRAR. Es el eje de toda la sección: el selector dibuja
 * estas y el servidor contesta sólo por estas.
 *
 * Vive acá y no en la pantalla porque **es una sola implementación para los dos lados**, igual que
 * `lineasQuePuede`: un selector que ofrezca una línea que el endpoint después corta con 403 es peor
 * que no ofrecerla, porque el 403 no dice que el problema es de permisos y no de Meta.
 *
 * Ojo: esto NO reemplaza el corte del servidor. Lo repite del lado de la pantalla para que no
 * prometa lo que la otra punta niega.
 */
export function lineasQueVe(perfil) {
  return marcasConAcceso(perfil, 'meta-ads', MARCAS_META).flatMap((m) => lineasDeMarca(m))
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
  // Meta recorta los espacios de los extremos al guardar el nombre. Sin este `trim` de los dos
  // lados, pedir «  Ventas ago  » terminaría en «Meta aceptó el cambio pero no lo aplicó», que es
  // justo lo contrario de lo que pasó. Ver `normalizarCampos`.
  name: (v) => String(v ?? '').trim(),
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
