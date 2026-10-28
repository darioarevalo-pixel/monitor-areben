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
  // Recorridas: los locales que hay que visitar y el viaje. Es de Compras porque la pregunta que
  // contesta —¿a quién voy a ver y qué le compro?— la decide el que compra, y vive al lado de
  // `recepciones` (lo que entró) y de `ingresos` (lo que viene).
  'recorridas': 'compras',
  // 🔑 **Área propia, al mismo nivel que `clientes`, y las DOS secciones de proveedor viven ahí.**
  // Lo pidió Bruno el 30-ago-2026: *«no es lo mismo comprar o querer comprar que analizar al
  // partner o proveedor»*. `proveedores` (la analítica de ventas) estaba en `compras` y se mudó
  // acá: analizar a un proveedor no es comprarle.
  // ⚠️ **Mover un área es quitarle el acceso a quien la heredaba, y ningún test lo caza** (ver el
  // comentario de `meta` en ACCESO_POR_FUNCION). Se midió antes: **ninguna función lista `compras`**,
  // así que la mudanza no le sacó la sección a nadie — la ven los admin y quien la tenga tildada a
  // mano, y un tilde a mano es por key, no por área.
  'prm': 'proveedores',
  'proveedores': 'proveedores',
  'colores': 'analisis',
  'talles': 'analisis',
  'marketing': 'marketing',
  'mkt-ventas': 'marketing',
  // Precios de campaña: la lista de precios de una liquidación, sin costo ni margen. Es de
  // Marketing y ⛔ no de Análisis aunque el dato salga de una campaña de Liquidación: la pregunta
  // que contesta —¿a qué precio comunico cada producto?— la tiene quien arma las piezas, y es la
  // razón entera por la que la sección existe (`liquidacion` queda afuera de esta función porque
  // lleva el costo adentro; ver ACCESO_POR_FUNCION acá abajo).
  'precios': 'marketing',
  'canjes': 'marketing',
  'calendario': 'marketing',
  'sesion-fotos': 'marketing',
  // Modelos (Model Management): el padrón de las modelos. Es de Marketing y ⛔ no de Clientes
  // aunque sea un padrón de personas: la pregunta que contesta —¿a quién llamo para la próxima
  // producción?— la decide quien arma las sesiones, y vive al lado de `sesion-fotos`, que es su
  // primer lector.
  'modelos': 'marketing',
  'comisiones': 'analisis',
  'liquidacion': 'analisis',
  'margenes': 'analisis',
  'etiquetas': 'local',
  'gen-talles': 'marketing',
  'gen-desc': 'marketing',
  'exhib': 'local',
  'mapa-local': 'local',
  'ubicaciones-local': 'local',
  'pagos-recibidos': 'local',
  'caja': 'local',
  'tncat': 'marketing',
  'disenos': 'compras',
  'ingresos': 'compras',
  'reposicion': 'administracion',
  'cobranzas': 'administracion',
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
  // A quién le debemos: no tiene marca, la deuda con el contador es de la empresa.
  'acreedores': 'direccion',
  // Área propia, sin función que la herede: mientras se construye la ven sólo los admin (Bruno, 12-oct).
  'erp': 'erp',
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
  // Igual que `organizacion`: área `sistema`, ⛔ NO está en KEYS_PARA_TODOS y ninguna función
  // hereda esa área ⇒ la ven **sólo los admin**. Y acá no alcanza con el menú: las dos acciones de
  // `api/blob-upload.js` (ver el inventario y eliminar) piden `esAdmin` por su cuenta, porque
  // mirar el store es ver los nombres de los archivos de las tres marcas y eliminar no se deshace.
  'archivos': 'sistema',
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
  // administración), `resumen` y `liquidacion` entera.
  // ⚠️ **Acá decía que del resultado del sale ve una vista aparte por la llave `?resultado=1` de
  // `api/_liquidacion.js`. Esa llave ⛔ NO EXISTE** —se sacó, y hoy `tests/handlers-autorizacion.
  // test.ts` fija lo contrario: con sólo `mkt-ventas`, ese GET tiene que dar 403—. El gemelo estaba
  // en `api/_mkt-ventas.js`. Se corrige el 10-sep-2026: una afirmación vieja en un comentario manda
  // a construir el rodeo equivocado, que es lo que ya pasó con los docblocks del token de GN.
  // 🔑 **Lo que Marketing SÍ ve de una campaña es `precios`** (área `marketing`, así que entra por
  // el área y ⛔ no hace falta tildarle nada): la lista de precios de la campaña que alguien
  // compartió, **sin costo, sin markup, sin margen y sin ventas**, por la lista blanca de
  // `lib/precios/core.core.js`. Es lo contrario de abrirle `liquidacion`.
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
  // Administración coordina: su área + las solicitudes de las dos marcas, la bandeja de retornos
  // (es quien persigue el paquete que no vuelve y quien decidió que volviera) y **las etiquetas**.
  //
  // 🔑 **`etiquetas` entra por `keys` y ⛔ no moviendo el área** (pedido de Bruno, 11-sep-2026: *«que
  // la sección etiquetas la pueda ver administración y local»*). Mover `etiquetas` de `local` a
  // `administracion` se la SACA al Local, que es quien la usa todos los días —y eso ⛔ no lo caza
  // ningún test, como ya está anotado arriba para `meta`—. Con `keys` la ven las dos.
  //
  // 📌 El caso que lo abrió: la feria del local se etiqueta entre varias personas, y quien imprime
  // las tiradas del depósito es administración. Mismo criterio que `retornos`, que es de Depósito y
  // la heredan el Local y Administración porque son quienes reciben el paquete.
  administracion: { areas: ['administracion'], keys: ['solicitudes', 'retornos', 'etiquetas'] },
  // Los dos roles que sólo existen para el ERP (decisión 13, 18-oct): Mayorista (hoy ⛔ lo usa nadie
  // aparte de Darío, pero que exista) y Consulta (ve, ⛔ toca). ⛔ heredan nada del monitor: lo que
  // pueden en el ERP lo dice `ERP_PERMISOS`, y el área `erp` se les abre con la llave de abajo.
  mayorista: { areas: [] },
  consulta: { areas: [] },
}

/**
 * Secciones que absorbieron a otras: quien tenía permiso de la vieja entra a la nueva.
 *
 * `solicitudes` se comió las dos entradas de menú de Sesión de fotos y Solicitudes internas. Sin
 * este alias, alguien de Marketing con `sesion-fotos` tildado y sin función asignada se quedaba
 * sin ninguna entrada al día siguiente del deploy.
 *
 * ⚠️ El 5-sep-2026 `sesion-fotos` volvió al menú, así que esa historia ya no describe el presente.
 * El alias **se queda igual**: el permiso viejo tiene que seguir abriendo la lista unificada.
 */
export const ALIAS_COMPAT = {
  solicitudes: ['sesion-fotos', 'solicitudes-internas'],
}

/**
 * Secciones que son el DETALLE de otra: quien entra a la madre, entra al detalle.
 *
 * `sesion-fotos` y `solicitudes-internas` dejaron de ser entradas del menú el día que
 * `solicitudes` las absorbió, y pasaron a ser las dos pantallas a las que lleva el botón "Ver" de
 * la vista unificada — pero seguían pidiendo su permiso propio, que vive en otras áreas
 * (`marketing` y `local`).
 *
 * El resultado era una puerta pintada: Depósito recibe `solicitudes` por su función, veía la
 * solicitud de fotos en la lista, la clickeaba y el guard de `app/[[...seccion]]` lo rebotaba a
 * Inicio **sin decir nada**. Lo mismo Administración, y Local con las de fotos. Era el reclamo
 * "las puede ver pero no puede ingresar".
 *
 * 🔴 **Desde el 5-sep-2026 `sesion-fotos` volvió a ser entrada del menú, la puerta de Marketing —
 * y por eso existe `puedeVerPropio`.** Lo que se hereda por acá es **la PANTALLA, ⛔ no el
 * renglón**: si el sidebar preguntara con `puedeVer`, a Depósito, Local y Administración les
 * aparecería un grupo "Marketing" entero, de un solo renglón, que hoy no ven. `solicitudes-internas`
 * sigue siendo sólo detalle, sin entrada propia.
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
 *   1. excepción (-key) → no lo ve, ni por función, ni por default, NI SIENDO ADMIN.
 *   2. admin            → ve todo lo demás.
 *   3. para todos       → las secciones de `KEYS_PARA_TODOS`, sin pedir nada.
 *   4. permiso tildado  → lo ve.
 *   5. su función       → lo ve si la sección está en un área de alguna de sus funciones.
 *   6. su madre         → si `key` es el detalle de otra sección, alcanza con poder ver esa.
 *
 * El orden importa para la compatibilidad: los permisos que ya tiene cada usuario siguen valiendo
 * tal cual (paso 4), así que nadie pierde acceso. La función SUMA. Si alguien queda viendo de más,
 * se recorta con la excepción (paso 1) en vez de destildar sección por sección.
 *
 * ⚠️ **El paso 3 va DESPUÉS de la excepción a propósito.** "La ve todo el equipo" es el default, no
 * un candado: si mañana hay que sacarle Novedades a alguien puntual, la excepción de Config sigue
 * pudiendo. Un default que no se puede recortar obliga a tocar código para un caso de una persona.
 *
 * 🔴 **Y el paso 1 va antes que el admin desde el 3-sep-2026, por el mismo motivo.** Bruno preguntó
 * *«¿puede ser que yo tenga permisos del local? veo lo de descripciones y preparar pedidos»*: se
 * midió el padrón y **no los tenía** —él y Darío están con `funcion: ['direccion']` y CERO tildes—,
 * los veía por ser admin. Con el admin ganando arriba de todo, la única forma de sacarle una
 * sección del menú a un administrador era **destildarle «Administrador»**, que le saca también
 * Config, el memo, el calendario y la liquidación: para esconder una entrada del menú había que
 * degradar a la persona. Ahora una excepción explícita —un tilde apagado en Config, por sección y
 * por marca— vale para cualquiera.
 *
 * ⚠️ **Lo que esto NO cambia: los ~160 `esAdmin(perfil) || …` que hay repartidos en `api/`.** Casi
 * todos contestan «¿puede ESCRIBIR?» (aprobar una liquidación, editar el memo ajeno), no «¿la ve?»,
 * y ahí el admin sigue pudiendo. La consecuencia buscada es que la sección desaparezca del menú y
 * que el guard de la ruta lo rebote —las dos preguntan por `puedeVer`—; que un handler suelto
 * igual conteste el dato ⛔ no es un agujero: es el dueño de la empresa sacándose una entrada de
 * la vista, no un candado de seguridad.
 *
 * ⛔ **No se puede dejar afuera a un admin de Config**: `usuarios` no pasa por acá. El sidebar
 * (`components/layout/Sidebar.tsx`) y el guard (`app/[[...seccion]]/page.tsx`) la gatean con
 * `esAdmin` derecho, así que la excepción no puede cerrar la puerta por la que se desarma.
 */
function ver(perfil, marca, key, heredar) {
  if (!perfil) return false
  if (estaExcluido(perfil, marca, key)) return false
  if (esAdmin(perfil)) return true
  if (KEYS_PARA_TODOS.has(key)) return true
  const acc = (perfil.acceso && perfil.acceso[marca]) || {}
  if (acc[key]) return true
  if ((ALIAS_COMPAT[key] || []).some((k) => acc[k])) return true
  const fs = Array.isArray(perfil.funcion) ? perfil.funcion : []
  if (fs.some((f) => setDeFuncion(f).has(key))) return true
  if (!heredar) return false
  // La recursión termina en un paso: ninguna madre es a su vez detalle de otra.
  const madre = DETALLE_DE[key]
  return !!madre && ver(perfil, marca, madre, true)
}

export function puedeVer(perfil, marca, key) {
  return ver(perfil, marca, key, true)
}

/**
 * Lo mismo que `puedeVer`, pero SIN el paso 6: no hereda de la madre.
 *
 * 🔑 **El menú y la ruta preguntan cosas distintas.** La ruta pregunta *«¿puede abrir esto?»* y ahí
 * la herencia tiene que valer: Depósito, Local y Administración entran a `/sesion-fotos` por el
 * botón «Ver» de la lista unificada, que es para lo que existe `DETALLE_DE`. El menú pregunta
 * *«¿esto es suyo?»*, y ahí la herencia sobra: `sesion-fotos` es la puerta de **Marketing**, y
 * mostrarle el renglón a los tres sectores que sólo la ejecutan les inventa un grupo entero
 * («Marketing») que hoy no ven.
 *
 * **La única diferencia entre las dos son las keys de `DETALLE_DE`**; para todo el resto contestan
 * idéntico, y hay un test que lo recorre entero para que no se separen.
 *
 * ⛔ **El guard de `app/[[...seccion]]/page.tsx` sigue con `puedeVer`, y ⛔ no se "unifica" con
 * ésta.** Cambiarlo reabre el bug de `6d84591` completo y en silencio: la solicitud se ve en la
 * lista, se clickea, y la pantalla rebota a Inicio sin decir nada.
 */
export function puedeVerPropio(perfil, marca, key) {
  return ver(perfil, marca, key, false)
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

/**
 * ERP · PERMISOS POR ROL (decisión 13 del recorrido de GN, 18-oct; tabla del 18-oct; `diseno.md` §6).
 *
 * Los 6 roles del ERP son las FUNCIONES del monitor: Local · Depósito · Administración (ya estaban),
 * Mayorista · Consulta (nuevas) y Admin = `perfil.admin`. Una persona puede tener varias («que Local
 * también use lo de depósito»). La excepción por persona es la de siempre: tildar `erp.<permiso>` en
 * una marca lo da, `-erp.<permiso>` lo saca (también al admin).
 *
 * 🔑 **LA LLAVE es ver la sección `erp`**: ninguna función hereda el área `erp` ⇒ hoy el ERP es
 * sólo admin (Bruno, 12-oct). Abrirlo al equipo = sumar `'erp'` a las `areas` de las 5 funciones de
 * `ERP_ROLES` en `ACCESO_POR_FUNCION` (o tildarle `erp` a una persona para probar con ella).
 *
 * Un permiso que ⛔ está en la lista es SÓLO ADMIN: una acción nueva del ERP nace cerrada.
 */
export const ERP_ROLES = ['local', 'mayorista', 'deposito', 'administracion', 'consulta']

export const ERP_PERMISOS = {
  // Ver las pantallas (sin costos). Consulta «ve todo, no toca nada y no ve costos».
  ver: ERP_ROLES,
  // Cuentas corrientes (deuda por cliente): en BDI hay mucha plata ⇒ Administración y Mayorista (hoy nadie tiene Mayorista: vende Darío, admin);
  // en Zattia no hay clientes con cuenta ⇒ la ven todos. El estado de cobro de CADA venta es `ver`, no esto.
  // 🔑 Un permiso puede ser una lista (igual en las dos marcas) o `{ bdi: [...], zattia: [...] }` (marca sin dato = sólo Admin):
  // es la forma en que se va a guardar la configuración de roles por marca (Usuarios y roles).
  cuentas: { bdi: ['administracion', 'mayorista'], zattia: ERP_ROLES },
  // Costo, resultado, precios por lista con costo al lado: sólo Admin.
  costos: [],
  // Ventas (tabla del 18-oct): editar datos todos menos Consulta · cobro Local/Mayorista/Administración ·
  // cambio Local · anular Local (directo con la aprobación apagada; prendida = sólo Admin).
  'editar-venta': ['local', 'mayorista', 'deposito', 'administracion'],
  cobrar: ['local', 'mayorista', 'administracion'],
  cambiar: ['local'],
  anular: ['local'],
  // Corregir el precio de una venta hecha (sin factura): la oficina; con el interruptor `precio` prendido = sólo Admin.
  'corregir-precio': ['administracion'],
  // Corregir el MEDIO de un cobro ya hecho (alguien marcó «pagado» en TN antes de cargar el cobro): la oficina, ⛔ interruptor aparte.
  'corregir-medio': ['administracion'],
  // §17: confirmar que la prenda de una anulada volvió (el escaneo del desarme): quien desarma el paquete.
  desarmar: ['local', 'deposito'],
  // La factura de una venta (la Caja, el mayorista) y la NC de una anulada: quien vende y la oficina.
  'facturar-venta': ['local', 'mayorista', 'administracion'],
  // El lote del mes, la NC de una factura entera y los proveedores: la oficina.
  facturacion: ['administracion'],
  proveedores: ['administracion'],
  // Stock: los ajustes los carga Depósito («conteos y ajustes»); aprobar, el mismo que carga mientras
  // la aprobación de conteos esté apagada (prendida = sólo Admin).
  ajustar: ['deposito'],
  'aprobar-ajuste': ['deposito'],
  // «El libro MANDA» (sin negativos): quien está en el mostrador puede pedir que una encargada autorice con SU PIN una venta que el libro
  // dice 0 (26-oct, Bruno: Local + Admin). Quién PUEDE autorizar lo decide quién tiene PIN (lo fija sólo Admin: `poner-pin`).
  'autorizar-pin': ['local'],
  // Configuración (reglas, rutas —dónde cae la plata—, cerrar el mes, cargar precio y costo): sólo
  // Admin ⇒ ⛔ va en la lista (`configurar`).
}

/**
 * Aprobaciones (Configuración › Usuarios y roles): armadas y APAGADAS (Bruno, 18-oct: «somos tan
 * pocos que se arma una burocracia»). Apagada = directo y queda quién fue; prendida = sólo Admin.
 * `precio` = corregir el precio de una venta hecha (acción `corregir-precio`).
 */
export const APROBACIONES_ERP = { anular: false, conteo: false, precio: false }
const APROBACION_DE = { anular: 'anular', 'aprobar-ajuste': 'conteo', 'corregir-precio': 'precio' }

/**
 * Los interruptores pueden venir PLANOS (`{ anular, conteo, precio }`, la constante de arriba) o POR MARCA
 * (`{ bdi: {…}, zattia: {…} }`, guardados en la base de cada una: motor sql/035). Marca sin dato = apagado.
 */
export function aprobacionesDeMarca(aprobaciones, marca) {
  if (aprobaciones && ('bdi' in aprobaciones || 'zattia' in aprobaciones)) return aprobaciones[marca] || APROBACIONES_ERP
  return aprobaciones || APROBACIONES_ERP
}

/** Los permisos que se pueden reasignar a roles desde la pantalla: ⛔ `ver`, `costos` ni `configurar` (el Admin y los costos no se reparten). */
export const PERMISOS_EDITABLES = Object.keys(ERP_PERMISOS).filter((p) => p !== 'ver' && p !== 'costos')

/**
 * Los roles que tienen `permiso` en `marca`. La entrada de `ERP_PERMISOS` es el valor por DEFECTO (lista, u objeto por marca);
 * `guardados` (`{ [marca]: { [permiso]: roles[] } }`, motor sql/048) lo pisa si hay fila para esa marca y permiso, y sólo en los editables.
 */
export function rolesDe(permiso, marca, guardados) {
  if (guardados && guardados[marca] && guardados[marca].__error && PERMISOS_EDITABLES.includes(permiso)) return [] // la base no respondió: cerrado
  const g = guardados && guardados[marca] && guardados[marca][permiso]
  if (Array.isArray(g) && PERMISOS_EDITABLES.includes(permiso)) return g.filter((r) => ERP_ROLES.includes(r))
  const r = ERP_PERMISOS[permiso]
  return Array.isArray(r) ? r : (r && r[marca]) || []
}

/**
 * ¿Puede `perfil` hacer `permiso` del ERP en `marca` (bdi|zattia; Stunned es Zattia)?
 * @param {any} perfil
 * @param {string} marca
 * @param {string} permiso
 * @param {any} [aprobaciones] interruptores planos o por marca (`aprobacionesDeMarca`)
 * @param {any} [guardados] roles guardados por marca y permiso (`rolesDe`); sin dato = los de la tabla
 */
export function puedeErp(perfil, marca, permiso, aprobaciones = APROBACIONES_ERP, guardados) {
  aprobaciones = aprobacionesDeMarca(aprobaciones, marca)
  if (!perfil) return false
  if (estaExcluido(perfil, marca, `erp.${permiso}`)) return false
  if (!puedeVer(perfil, marca, 'erp')) return false
  if (esAdmin(perfil)) return true
  if (permiso === 'ver') return true
  const acc = (perfil.acceso && perfil.acceso[marca]) || {}
  if (acc[`erp.${permiso}`]) return true
  if (aprobaciones[APROBACION_DE[permiso]]) return false
  const roles = rolesDe(permiso, marca, guardados)
  const fs = Array.isArray(perfil.funcion) ? perfil.funcion : []
  return fs.some((f) => roles.includes(f))
}

/**
 * Lo que el perfil puede en el ERP, por marca: lo que lee la pantalla para mostrar u ocultar botones.
 * @param {any} perfil
 * @param {any} [aprobaciones] interruptores planos o por marca
 * @param {any} [guardados] roles guardados por marca y permiso (`rolesDe`)
 */
export function permisosErp(perfil, aprobaciones = APROBACIONES_ERP, guardados) {
  const todos = ['ver', 'costos', 'configurar', ...Object.keys(ERP_PERMISOS).filter((p) => p !== 'ver' && p !== 'costos')]
  return Object.fromEntries(['bdi', 'zattia'].map((m) => [m, Object.fromEntries(todos.map((p) => [p, puedeErp(perfil, m, p, aprobaciones, guardados)]))]))
}

/**
 * Qué permiso pide cada pedido a `api/datos?recurso=erp`. Lo que ⛔ está nombrado acá ⇒ `configurar`
 * (sólo Admin): una vista o acción nueva nace cerrada hasta que se la ponga en la tabla.
 */
const PERMISO_DE_VISTA = {
  'pedidos-tn': 'ver', diferencias: 'ver', conciliacion: 'ver', ajustes: 'ver', 'transferencias-doc': 'ver', salidas: 'ver',
  stock: 'ver', 'stock-lista': 'ver', movimientos: 'ver', 'ventas-lista': 'ver', 'ventas-producto': 'ver', 'venta-extra': 'ver', ventas: 'ver', venta: 'ver', 'venta-gn-cambio': 'ver', clientas: 'ver', saldo: 'ver',
  permisos: 'ver', pines: 'configurar', proveedores: 'proveedores', precio: 'costos', facturas: 'facturacion',
  // Listas de lectura (misma vara que `clientas` y `saldo`) y las cuentas corrientes de BDI.
  'clientes-lista': 'ver', 'cliente-ficha': 'ver', 'cuenta-cliente': 'cuentas', 'cuentas-corrientes': 'cuentas',
  cobros: 'ver', 'productos-lista': 'ver', transferencias: 'ver',
  // El resultado comercial del Inicio es del Admin (diseno.md §7), como el resto de lo que lleva costo.
  'inicio-resultado': 'costos',
  // Configuración y lo que hace falta para armarla: sólo Admin, NOMBRADO (un test exige que toda vista del handler esté acá).
  configuracion: 'configurar', gastos: 'configurar', 'empujes-stock': 'configurar', reglas: 'configurar', rutas: 'configurar', redondeo: 'configurar', interruptores: 'configurar', estructura: 'configurar',
  comparacion: 'configurar', 'cargar-venta': 'configurar', roles: 'configurar',
  // El historial de EDICIÓN del producto (tests/erp-catalogo-edicion.test.ts): Admin, igual que editarlo.
  'producto-historial': 'configurar',
}
const PERMISO_DE_ACCION = {
  'editar-venta': 'editar-venta', 'nota-venta': 'editar-venta', 'cobrar-venta': 'cobrar', 'cobrar-cuenta': 'cobrar', cambiar: 'cambiar', anular: 'anular', 'corregir-precio': 'corregir-precio', 'corregir-medio': 'corregir-medio', 'confirmar-vuelta': 'desarmar',
  'facturar-venta': 'facturar-venta', 'facturar-cambio': 'facturar-venta', 'nota-credito-venta': 'facturar-venta',
  facturar: 'facturacion', 'nota-credito': 'facturacion', 'nota-debito': 'facturacion', 'guardar-proveedor': 'proveedores',
  'crear-ajuste': 'ajustar', 'aprobar-ajuste': 'aprobar-ajuste', 'descartar-ajuste': 'aprobar-ajuste',
  'transferencia-crear': 'ajustar', 'transferencia-armar': 'ajustar', 'transferencia-enviar': 'ajustar', 'transferencia-recibir': 'ajustar', 'transferencia-cancelar': 'ajustar',
  // Repartir los permisos entre roles: sólo Admin, NOMBRADO (Usuarios y roles).
  'poner-roles': 'configurar', 'restablecer-roles': 'configurar',
  // El PIN de la encargada: fijarlo y quitarlo es sólo Admin; probarlo en el mostrador lo hace quien tenga `autorizar-pin`.
  'poner-pin': 'configurar', 'quitar-pin': 'configurar', 'verificar-pin': 'autorizar-pin',
  // La salida con vuelta (fotos, producción): la hace quien ajusta stock; el cierre arma ajustes que aprueba el admin.
  'salida-crear': 'ajustar', 'salida-devolver': 'ajustar', 'salida-cerrar': 'ajustar', 'salida-cancelar': 'ajustar',
  // Editar el producto: sólo Admin (`configurar`) hasta que Bruno decida los roles; nombrado acá para que ⛔ dependa de un default.
  'producto-editar': 'configurar', 'variante-editar': 'configurar', 'variante-agregar': 'configurar',
  // Configuración, precio/costo y la carga manual de ventas: sólo Admin, nombrado (lo exige tests/erp-permisos.test.ts).
  'cargar-venta': 'configurar', 'cargar-costo': 'configurar', 'cargar-precio': 'configurar', 'soltar-precio': 'configurar', cerrar: 'configurar',
  'guardar-regla': 'configurar', 'sembrar-reglas': 'configurar', 'simular-reglas': 'configurar', 'prender-caja-reglas': 'configurar',
  'poner-credito': 'configurar', 'poner-contacto': 'configurar', 'registrar-gasto': 'configurar', 'mandar-stock': 'configurar', 'poner-interruptor': 'configurar', 'poner-ruta': 'configurar', 'poner-redondeo': 'configurar',
  'reintentar-entregas': 'configurar',
}
/** @param {{ method: string, vista?: string, accion?: string }} pedido */
export function permisoErpDe({ method, vista, accion }) {
  if (method === 'GET') return vista ? PERMISO_DE_VISTA[vista] || 'configurar' : 'facturacion'
  return PERMISO_DE_ACCION[accion] || 'configurar'
}
