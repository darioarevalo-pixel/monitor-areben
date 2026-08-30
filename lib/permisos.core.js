/**
 * Permisos: LA implementación. Una sola, para los dos mundos.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Los handlers de `api/*.js` **no pueden importar TypeScript**: son funciones de Vercel que corren
 * en Node tal cual están, sin pasar por el compilador de Next. Hasta ahora la consecuencia era que
 * cada handler se copiaba a mano el pedazo de `lib/permisos.ts` que necesitaba, y las copias se
 * desincronizaron:
 *
 *   - `api/_canjes.js` decidía qué marcas ve una persona **mirando sólo `perfil.cuenta`**, sin leer
 *     `acceso`. Como `cuenta` sólo la tiene quien está clavado a una marca, todo el que podía
 *     cambiar de marca quedaba con la lista vacía y recibía 403 en TODA la sección — el padrón
 *     incluido. Tildar permisos en Config no cambiaba nada, porque esa función no los leía.
 *   - `api/meta-ads.js` chequeaba el sub-permiso **sin respetar la exclusión negativa**, así que a
 *     alguien a quien se le había sacado el permiso el servidor igual lo dejaba pausar campañas.
 *
 * El repo ya tenía lo necesario para no duplicar y no se estaba usando: `allowJs: true` en
 * `tsconfig.json` y `"type": "module"` en `package.json`. Un `.js` con `export` lo importan los
 * dos lados. `lib/permisos.ts` pasó a ser un re-export tipado de este archivo, así que los ~32
 * archivos que importan de ahí no se enteran.
 *
 * **Regla:** si un chequeo de permisos hace falta en `api/`, va acá. No se copia.
 */

import { baseDeLinea } from './lineas.core.js'

/**
 * A qué área del menú pertenece cada sección.
 *
 * ⚠️ Es un espejo de `PermCat.area` (`lib/nav.datos.ts`), que se queda en TS porque son 520 líneas
 * de datos que conviene tener tipadas y editables a mano. Para que el espejo no se despegue,
 * `tests/permisos-espejo.test.ts` exige que los dos coincidan **exactamente**: agregar una sección
 * sin tocar este mapa rompe la suite. Es la mitad que le faltaba al comentario de `lib/canjes/
 * permisos.ts`, que decía "el test las compara" sobre un test que nunca se escribió.
 */
export const SECCION_AREA = {
  'resumen': 'analisis',
  'productos': 'analisis',
  'variantes': 'analisis',
  'ventas-mensuales': 'analisis',
  // Faltantes: lo que un cliente pidió y no teníamos. Es de Compras y no de Local aunque lo anote
  // el local, porque la pregunta que contesta —qué traer— la decide el que compra. El alta vive
  // adentro de `atencion` justamente para que el permiso de la sección no sea el que gatea anotar.
  'pedidos-clientes': 'compras',
  // "Lo que entró": lo que el sistema de Ingresos confirma que llegó de cada orden de compra. Es de
  // Compras y no de Local aunque lo cuente el depósito: la pregunta que contesta —¿este proveedor
  // entrega lo que le pedimos?— la decide el que compra.
  'recepciones': 'compras',
  // Insumos: lo que se consume y no se vende. Es de Administración y no de Compras aunque termine
  // en una compra: la pregunta que contesta —¿queda el anteúltimo?— la mira todos los días quien
  // maneja el depósito y los locales, y avisar antes de que falte es su responsabilidad escrita.
  'insumos': 'administracion',
  'fundas-modelo': 'compras',
  'clientes': 'clientes',
  'proveedores': 'compras',
  'colores': 'analisis',
  'talles': 'analisis',
  'marketing': 'marketing',
  'mkt-ventas': 'marketing',
  'canjes': 'marketing',
  'calendario': 'marketing',
  'sesion-fotos': 'marketing',
  'comisiones': 'analisis',
  'liquidacion': 'analisis',
  'margenes': 'analisis',
  'etiquetas': 'local',
  'gen-talles': 'marketing',
  'gen-desc': 'marketing',
  'exhib': 'local',
  'tncat': 'marketing',
  'disenos': 'compras',
  'ingresos': 'compras',
  'reposicion': 'administracion',
  'conteo': 'local',
  'conteo-deposito': 'deposito',
  'conteo-estandar-zattia': 'local',
  'conteo-estandar-stunned': 'local',
  'atencion': 'local',
  'cupones': 'local',
  // La hoja del cadete. Es del local aunque el envío sea de cualquiera de las dos marcas: el
  // reparto sale de ahí, y la pantalla no tiene selector de marca a propósito.
  'envios': 'local',
  // Los mensajes de clientes sin resolver. Es del local por la misma razón que Envíos: quien los
  // lee es quien arma el paquete, y su único efecto es frenar ese despacho.
  'buzon': 'local',
  'solicitudes-internas': 'local',
  'solicitudes': 'local',
  'verif-ventas': 'analisis',
  'caducados': 'administracion',
  'ubicaciones': 'deposito',
  'meta-ads': 'meta',
  'gerencial': 'direccion',
  'memo': 'direccion',
  'norte': 'direccion',
  'integraciones': 'integraciones',
  'postventa': 'administracion',
  'postventa-local': 'local',
  'postventa-deposito': 'deposito',
  'cambios-local': 'local',
  'reclamos-local': 'local',
  // La bandeja de retornos es de DEPÓSITO —ahí se abre la caja— pero la ve también el Local, que
  // está abierto muchas más horas y por eso es donde el cliente termina dejando el paquete. El
  // Local y Administración la heredan por `keys` en ACCESO_POR_FUNCION, como `solicitudes`.
  'retornos': 'deposito',
  // Área propia y de una sola sección (por ahora): las novedades no son de un sector. Ninguna
  // función la hereda —`ACCESO_POR_FUNCION` no la lista— y no hace falta: está en KEYS_SIN_PERMISO,
  // o sea que la ve todo el mundo. Acá figura porque el espejo con PERM_CAT tiene que cerrar.
  'novedades': 'sistema',
  'manuales': 'sistema',
  // 🔴 A DIFERENCIA de las otras dos del área: `organizacion` ⛔ **NO está en KEYS_PARA_TODOS**, y
  // eso es deliberado (Bruno, 30-ago-2026): *«dejá organización oculta para la gente, que tenemos
  // que hacer varios cambios»*. Ninguna función hereda el área `sistema` ⇒ hoy la ven **sólo los
  // admin**. Se abre al equipo agregándola de vuelta a `KEYS_PARA_TODOS`, una línea.
  'organizacion': 'sistema',
  // Igual que las de arriba: área propia, nadie la hereda por función y no hace falta, porque
  // está en KEYS_SIN_PERMISO. Lo que sí se tilda a mano es el sub `agenda.cargar`.
  'agenda': 'agenda',
}

/**
 * Qué ve cada función, por ÁREA del menú — no por lista de secciones.
 *
 * Es la respuesta al problema real: hasta ahora cada sección nueva había que tildarla usuario por
 * usuario y marca por marca, así que el alta de un módulo era una tarde de checkboxes y siempre
 * quedaba alguien afuera. Al colgar el acceso del ÁREA, una sección nueva la hereda sola todo el
 * que tenga esa función.
 *
 * Lo que la función NO da son los **sub-permisos** (`etiquetas.dep`, `canjes.aprobar`,
 * `cupones.crear`): son justamente las acciones sensibles y se siguen tildando a mano.
 */
export const ACCESO_POR_FUNCION = {
  // Gerencia: el panel de decisiones y toda la analítica.
  direccion: { areas: ['direccion', 'analisis'] },
  // Marketing usa el monitor como herramienta adicional: lo suyo + pedir productos.
  //
  // 🔴 `meta` va acá y no es opcional. Meta salió de adentro de Marketing y pasó a ser un área
  // propia del menú; si esta lista no la incluyera, **todo el que hoy ve Meta por tener la función
  // `marketing` la perdería de golpe** — `seccionesDeFuncion()` expande por área, así que mover el
  // área es quitar el acceso. Y no se leería como un permiso faltante sino como «Meta desapareció»,
  // que es la clase de bug que nadie reporta bien. Ningún test lo caza: el espejo sólo compara
  // `SECCION_AREA` con `PERM_CAT.area`, y las dos dirían `meta` felizmente.
  // 🔴 **Las cinco de Análisis van por `keys` y NO sumando el área `analisis`.** Decisión de Bruno
  // (18-ago-2026): las campañas se arman sobre el dato fino de venta, así que Marketing ve por
  // producto, por variante, mensuales, colores y talles. ⛔ Lo que el área arrastraría y queda
  // afuera a propósito: `margenes` y `comisiones` (costo y markup), `verif-ventas` (control de
  // administración), `resumen` y `liquidacion` entera. Del resultado del sale ve una vista aparte,
  // por la llave `?resultado=1` de `api/_liquidacion.js`, que no lleva costo.
  marketing: {
    areas: ['marketing', 'meta'],
    // 🔑 `pedidos-clientes` (Faltantes) entra por `keys` y no sumando el área `compras`: lo que
    // Marketing necesita es LA DEMANDA de lo que no tenemos —de ahí salen las campañas y qué se
    // pide en Instagram—, no las importaciones, los proveedores ni los diseños, que es lo que el
    // área entera arrastraría. Mismo criterio que las cinco de Análisis de acá abajo.
    keys: ['solicitudes', 'pedidos-clientes', 'productos', 'variantes', 'ventas-mensuales', 'colores', 'talles'],
  },
  // 🔑 `retornos` entra por `keys` y no sumando el área `deposito`: lo que el Local tiene que ver
  // es lo que estamos esperando que vuelva, no los conteos ni las ubicaciones del depósito.
  local: { areas: ['local'], keys: ['retornos'] },
  deposito: { areas: ['deposito'], keys: ['solicitudes'] },
  // Administración coordina: su área + las solicitudes de las dos marcas, y la bandeja de retornos
  // (es quien persigue el paquete que no vuelve y quien decidió que volviera).
  administracion: { areas: ['administracion'], keys: ['solicitudes', 'retornos'] },
}

/**
 * Secciones que absorbieron a otras: quien tenía permiso de la vieja entra a la nueva.
 *
 * `solicitudes` se comió las dos entradas de menú de Sesión de fotos y Solicitudes internas. Sin
 * este alias, alguien de Marketing con `sesion-fotos` tildado y sin función asignada se quedaba
 * sin ninguna entrada al día siguiente del deploy.
 */
export const ALIAS_COMPAT = {
  solicitudes: ['sesion-fotos', 'solicitudes-internas'],
}

/**
 * Secciones que son el DETALLE de otra: quien entra a la madre, entra al detalle.
 *
 * `sesion-fotos` y `solicitudes-internas` dejaron de ser entradas del menú el día que
 * `solicitudes` las absorbió. Hoy son las dos pantallas a las que lleva el botón "Ver" de la
 * vista unificada — no hay ninguna otra forma de llegar—, pero seguían pidiendo su permiso
 * propio, que vive en otras áreas (`marketing` y `local`).
 *
 * El resultado era una puerta pintada: Depósito recibe `solicitudes` por su función, veía la
 * solicitud de fotos en la lista, la clickeaba y el guard de `app/[[...seccion]]` lo rebotaba a
 * Inicio **sin decir nada**. Lo mismo Administración, y Local con las de fotos. Era el reclamo
 * "las puede ver pero no puede ingresar".
 *
 * Lo que NO viaja por acá son los **sub**-permisos: `sesion-fotos.editar` sigue pidiendo su
 * tilde a mano (el paso 5 mira la clave entera, y `'sesion-fotos.editar'` no está en este mapa).
 * Y la excepción negativa gana igual: `-sesion-fotos` corta antes, en el paso 2.
 */
export const DETALLE_DE = {
  'sesion-fotos': 'solicitudes',
  'solicitudes-internas': 'solicitudes',
}

/** Las secciones que trae puesta una función (expandiendo sus áreas con `SECCION_AREA`). */
export function seccionesDeFuncion(f) {
  const cfg = ACCESO_POR_FUNCION[f]
  if (!cfg) return []
  const { areas, keys = [] } = cfg
  const deArea = Object.keys(SECCION_AREA).filter((k) => areas.includes(SECCION_AREA[k]))
  return [...deArea, ...keys]
}

const POR_FUNCION = new Map()
function setDeFuncion(f) {
  let s = POR_FUNCION.get(f)
  if (!s) {
    s = new Set(seccionesDeFuncion(f))
    POR_FUNCION.set(f, s)
  }
  return s
}

export function esAdmin(perfil) {
  return !!(perfil && perfil.admin)
}

/** ¿Tiene la función `f`? Los admins NO la tienen implícita: es un rol de flujo, ortogonal. */
export function tieneFuncion(perfil, f) {
  const fs = (perfil && perfil.funcion) || []
  return Array.isArray(fs) && fs.includes(f)
}

/**
 * Excepción NEGATIVA: quitarle a alguien una sección que su función le daría.
 *
 * Viaja como una clave con guion adelante dentro del mismo `acceso` (`'-reposicion'`) y no como un
 * campo propio, porque el login de `bdi-catalogo/api/usuarios` arma el perfil con una lista fija de
 * campos: un campo nuevo se guardaría en el KV pero nunca llegaría al navegador.
 */
export const marcaExcluir = (key) => `-${key}`

export function estaExcluido(perfil, marca, key) {
  const acc = (perfil && perfil.acceso && perfil.acceso[marca]) || {}
  return !!acc[marcaExcluir(key)]
}

/**
 * Las secciones que ve TODO EL EQUIPO, sin permiso que valga.
 *
 * 🔴 **Esto vive acá y no en `lib/nav.ts`, y el motivo es la historia de cómo se rompió.** El set
 * `KEYS_SIN_PERMISO` de `nav.ts` dice en su nombre y en su comentario que lo de adentro lo ve todo
 * el mundo, pero **`puedeVer` no lo consultaba nunca**: lo usan `esDeMarca`, `esKeyValida` y
 * `todasLasKeys`, que contestan "¿esta ruta existe?", no "¿esta persona entra?". El sidebar y el
 * guard hacían excepción a mano con `inicio` y `usuarios` y todo lo demás caía en `puedeVer`, así
 * que **Novedades, Manuales y la Agenda estuvieron invisibles para todo el que no fuera admin** —
 * con cuatro comentarios en el código afirmando lo contrario. Nadie lo vio porque la afirmación
 * estaba escrita, no ejecutada.
 *
 * Poniéndolo en la decisión —y no en cada pantalla que la consume— el sidebar, el guard de la ruta
 * y los handlers que preguntan `marcasConAcceso` quedan de acuerdo solos. Es la misma razón por la
 * que los permisos son una implementación sola: dos lugares que contestan lo mismo divergen.
 *
 * ⛔ **`usuarios` y `resumen` NO entran acá**, aunque estén en `KEYS_SIN_PERMISO`. `usuarios` es de
 * admin, y `resumen` son los KPIs del negocio: que su presencia en aquel set fuera inofensiva es
 * exactamente lo que escondía que el set no hacía nada.
 *
 * Lo que sí se sigue tildando son los **subs** (`novedades.publicar`, `agenda.cargar`): leer una
 * promo y cargarla no son la misma cosa.
 */
export const KEYS_PARA_TODOS = new Set(['inicio', 'novedades', 'manuales', 'agenda'])

/**
 * ¿Este perfil ve `key` en `marca`? Precedencia, de más fuerte a más débil:
 *
 *   1. admin            → ve todo.
 *   2. excepción (-key) → no lo ve, aunque su función se lo dé.
 *   3. para todos       → las secciones de `KEYS_PARA_TODOS`, sin pedir nada.
 *   4. permiso tildado  → lo ve.
 *   5. su función       → lo ve si la sección está en un área de alguna de sus funciones.
 *   6. su madre         → si `key` es el detalle de otra sección, alcanza con poder ver esa.
 *
 * El orden importa para la compatibilidad: los permisos que ya tiene cada usuario siguen valiendo
 * tal cual (paso 4), así que nadie pierde acceso. La función SUMA. Si alguien queda viendo de más,
 * se recorta con la excepción (paso 2) en vez de destildar sección por sección.
 *
 * ⚠️ **El paso 3 va DESPUÉS de la excepción a propósito.** "La ve todo el equipo" es el default, no
 * un candado: si mañana hay que sacarle Novedades a alguien puntual, la excepción de Config sigue
 * pudiendo. Un default que no se puede recortar obliga a tocar código para un caso de una persona.
 */
export function puedeVer(perfil, marca, key) {
  if (esAdmin(perfil)) return true
  if (!perfil) return false
  if (estaExcluido(perfil, marca, key)) return false
  if (KEYS_PARA_TODOS.has(key)) return true
  const acc = (perfil.acceso && perfil.acceso[marca]) || {}
  if (acc[key]) return true
  if ((ALIAS_COMPAT[key] || []).some((k) => acc[k])) return true
  const fs = Array.isArray(perfil.funcion) ? perfil.funcion : []
  if (fs.some((f) => setDeFuncion(f).has(key))) return true
  // La recursión termina en un paso: ninguna madre es a su vez detalle de otra.
  const madre = DETALLE_DE[key]
  return !!madre && puedeVer(perfil, marca, madre)
}

/**
 * Permiso granular de sub-acción. Los subs se guardan planos, con la forma `canjes.aprobar`.
 *
 * ⚠️ Un sub **no se hereda de la función**: `ACCESO_POR_FUNCION` expande áreas a claves de sección
 * (`canjes`), nunca a subclaves (`canjes.aprobar`). O sea que sólo lo tiene el admin o quien lo
 * tenga tildado a mano en Config.
 */
export function puedeSub(perfil, marca, key, sub) {
  return puedeVer(perfil, marca, `${key}.${sub}`)
}

/**
 * En qué marcas este perfil ve la sección `key`.
 *
 * Es la pieza que faltaba y por la que Canjes quedó roto: el servidor necesitaba "¿de qué marcas
 * puede ver esto?" y, como no existía, se lo inventó mirando `perfil.cuenta` — que responde otra
 * pregunta (¿está clavado a una marca?) y da vacío para todo el que puede cambiar de marca.
 *
 * `cuenta` sí acota: quien está clavado a una marca no ve las otras aunque tenga el permiso
 * tildado, porque para eso está la cuenta fija.
 *
 * ⚠️ **La cuenta fija le gana incluso al admin**, y es un cambio respecto del servidor viejo (que
 * hacía `if (admin) return [...STORES]` antes de mirar nada). Se eligió así porque es lo que ya
 * hacía el cliente y porque es lo coherente con el resto del monitor: `puedeCambiarMarca()` es
 * literalmente `!perfil.cuenta`, o sea que un admin con cuenta fija tampoco puede cambiar de marca
 * en el header. Que el servidor le devolviera las dos era la incoherencia, no al revés.
 */
export function marcasConAcceso(perfil, key, marcas) {
  if (!perfil) return []
  const fija = perfil.cuenta
  const candidatas = fija ? marcas.filter((m) => m === fija) : marcas
  return candidatas.filter((m) => puedeVer(perfil, m, key))
}

/**
 * De qué marca del monitor cuelgan los permisos de una `store`.
 *
 * **Stunned no es una marca**: es una línea de Zattia por prefijo de SKU, y no existe en
 * `perfil.acceso`. Sin esta traducción, tildarle a alguien un permiso en Zattia no le serviría
 * para nada de Stunned y el permiso parecería roto.
 *
 * 📌 Vivía en `lib/canjes/marcas.js`, que la ató a Canjes por accidente de dónde nació. No es de
 * Canjes: la misma pregunta la tienen el sync de Tienda Nube (`stunned` es una de sus tres stores),
 * el mapa de SKU y los conteos. Subirla acá es la misma regla de siempre — la decisión de permisos
 * vive en un solo lado. `lib/canjes/marcas.js` la re-exporta para no tocar a sus importadores.
 *
 * 🔴 **Devuelve `null` ante una store que no conoce, y eso es el arreglo del 22-ago-2026.** Antes
 * decía `store === 'bdi' ? 'bdi' : 'zattia'`: cualquier string —un `?store=` inventado, un typo, un
 * `undefined`— salía con **permisos de Zattia**, o sea que el gate del servidor contestaba sobre una
 * marca que nadie pidió. Es el mismo defecto que `baseDeLinea` ya no tenía, conviviendo con él.
 * Ahora las dos preguntas las contesta `baseDeLinea` y `null` corta: `puedeVerAlguna` niega, que es
 * la dirección segura.
 */
export function marcaDePermisos(store) {
  return baseDeLinea(store)
}

/**
 * ¿Ve **alguna** de estas secciones en esta `store`?
 *
 * Varios endpoints los comparte más de una pantalla, y ahí el permiso correcto es «alguna de
 * éstas» y no una sola: pedirle `conteo-deposito` a la chica del local de Zattia la dejaría afuera
 * de su propio conteo, y pedirle `postventa` a la de Depósito la dejaría afuera de las fallas que
 * ella misma carga. Un permiso mal elegido no se ve como un error — se ve como "no anda".
 *
 * Traduce la `store` a marca, así que sirve igual con `stunned`.
 *
 * 🔑 **Va por `marcasConAcceso` y no por `puedeVer` a secas, para que la cuenta fija siga
 * valiendo.** Quien está clavado a una marca no ve las otras aunque tenga el permiso tildado —es
 * el contrato de `marcasConAcceso`, el mismo que usa `puedeAtenderRetiroLocal`— y con `puedeVer`
 * pelado esa regla se pierde: alguien del local de Zattia con `bdi.conteo` tildado se bajaba el
 * stock de BDI. Lo cazó el test, no la lectura.
 *
 * 🔴 **Del lado del servidor, éste es EL gate. `puedeVer` a secas no alcanza nunca**, porque la
 * `store` la elige el request: una cuenta clavada a Zattia pide `?store=bdi` a mano y `puedeVer`
 * le dice que sí. En el cliente no pasa —`puedeCambiarMarca()` es literalmente `!perfil.cuenta`,
 * así que quien está clavado nunca pregunta por la otra marca— y por eso el agujero es sólo de
 * este lado y se leía como código correcto.
 *
 * Los cinco gates que quedaban con `puedeVer` pelado se pasaron el 13-ago-2026: `_liquidacion`
 * (y su vista de Etiquetas), `_calendario`, `_atencion` y `_meta-funnel`. `_agenda` ya venía bien
 * —usa `marcasConAcceso` derecho— y estaba en la lista por error. Se midió contra el padrón antes
 * de tocar: de 14 usuarios, 7 tienen cuenta fija y **el cambio mueve a 2**, los puestos
 * compartidos `local` y `bdilocal`, que podían leerse la bandeja de Atención de la otra marca.
 */
export function puedeVerAlguna(perfil, store, keys) {
  const marca = marcaDePermisos(store)
  // 🔴 Store desconocida ⇒ NO. No alcanza con dejar pasar el `null` a `marcasConAcceso`: `puedeVer`
  // le contesta que sí a un admin antes de mirar la marca, así que un `?store=` inventado le abriría
  // el handler. Éste es el gate del servidor; el default seguro es negar.
  if (!marca) return false
  return keys.some((k) => marcasConAcceso(perfil, k, [marca]).length > 0)
}

/**
 * Las cuatro pantallas de conteo físico.
 *
 * Son cuatro secciones distintas —cada local y el depósito cuentan cosas distintas— pero comparten
 * los dos endpoints que leen el stock vivo de Gestión Nube (`api/_inventario-vivo.js`) y guardan
 * los conteos (`api/_conteos-deposito.js`).
 */
export const SECCIONES_CONTEO = ['conteo', 'conteo-deposito', 'conteo-estandar-zattia', 'conteo-estandar-stunned']

/** Las tres pantallas de post-venta, que comparten el endpoint de fallas y el mapa de SKU. */
export const SECCIONES_POSTVENTA = ['postventa', 'postventa-local', 'postventa-deposito']

/**
 * Las tres pantallas de Análisis que muestran ventas y llevan la marca de «vendido en sale».
 *
 * Abren la rama `?vendido=1` de `api/_liquidacion.js`, que cruza la bitácora de Liquidación contra
 * las ventas y devuelve **unidades y fechas, nunca precios**. Van con su propio permiso y no con el
 * de Liquidación: la marca es para el que analiza, no para el que arma el sale.
 */
export const SECCIONES_ANALISIS_VENTAS = ['productos', 'variantes', 'ventas-mensuales']

/**
 * ¿A esta persona le corresponde la historia COMPLETA de ventas, o los últimos 35 días?
 *
 * 🔴 **Cuelga del permiso y no de `esAdmin`, y ésa es toda la corrección.** `desdeVentas`
 * (`lib/datos.ts`) le daba 35 días a **todo el que no es admin**, y hasta el 18-ago-2026 eso no se
 * notaba porque las pantallas que miran más de 35 días eran todas de Dirección. Al abrirle «Por
 * producto» y «Ventas mensuales» a Marketing, con el flag de admin la columna **«Ventas 90 d»
 * habría mostrado 35 días de ventas con el rótulo de 90**, y la comparación contra el año anterior
 * habría salido vacía — las dos **sin un error**, que es el modo de falla que más caro sale acá.
 *
 * ⚠️ Se pregunta por `SECCIONES_ANALISIS_VENTAS` y no por la lista larga: son exactamente las que
 * leen ventana larga. Colores y Talles entran igual porque salen del mismo payload, pero no son las
 * que lo justifican, así que no se nombran.
 */
export function veVentasHistoricas(perfil, store) {
  return esAdmin(perfil) || puedeVerAlguna(perfil, store, SECCIONES_ANALISIS_VENTAS);
}

/** Las que comparten el endpoint de devoluciones: las dos del local más la de Administración. */
export const SECCIONES_RECLAMOS = ['reclamos-local', 'cambios-local', 'postventa']

/**
 * ¿Puede contar en esta `store`? Es la llave de los endpoints compartidos por las cuatro pantallas.
 *
 * 🔴 **Antes no había ninguna.** `_inventario-vivo.js` y `_conteos-deposito.js` llamaban a
 * `exigirUsuario` y nada más, así que cualquier usuario válido —incluidos los puestos compartidos
 * `Depósito`, `Local` y `bdilocal`, cuya contraseña conoce medio equipo— se bajaba el stock vivo
 * completo de las dos marcas o insertaba conteos falsos. El docblock de `api/_auth.js` cuenta que
 * esos mismos endpoints ya habían estado abiertos a internet; lo que quedó sin cerrar fue el
 * escalón de adentro.
 */
export function puedeContar(perfil, store) {
  return puedeVerAlguna(perfil, store, SECCIONES_CONTEO)
}

/**
 * ¿Puede atender el mostrador de los canjes que se retiran en el local?
 *
 * **Es la llave del local a un pedacito de Canjes, que es una sección de Marketing.** Sin esto el
 * gate de `api/_canjes.js` (`marcasVisiblesCanjes`) le devuelve una lista vacía a la chica del
 * local, porque nadie ahí tiene la sección `canjes`.
 *
 * Habilita **exactamente tres cosas y nada más**: leer la vista acotada del local, cargar o sacar
 * los productos de un canje de retiro sin entregar, y entregarlo. No abre la lista de canjes, ni la
 * plata, ni el padrón.
 *
 * 🔑 **Cuelga de `cupones` y NO de un sub propio**, a propósito: un sub no se hereda de la función
 * (ver `puedeSub`), así que habría que tildarlo a mano usuario por usuario y el día del deploy no
 * andaría para nadie. `cupones` ya es la sección del mostrador —la misma gente que aplica un
 * descuento al cobrar es la que entrega las fundas— y ya la tienen tildada.
 *
 * Va por `marcasConAcceso` y no por `puedeVer` para que la cuenta fija siga valiendo: quien está
 * clavado a Zattia no atiende el local de BDI.
 */
export function puedeAtenderRetiroLocal(perfil) {
  return marcasConAcceso(perfil, 'cupones', ['bdi']).length > 0
}
