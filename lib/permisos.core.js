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
  'fundas-modelo': 'compras',
  'clientes': 'clientes',
  'proveedores': 'compras',
  'colores': 'analisis',
  'talles': 'analisis',
  'marketing': 'marketing',
  'canjes': 'marketing',
  'sesion-fotos': 'marketing',
  'comisiones': 'analisis',
  'margenes': 'analisis',
  'etiquetas': 'local',
  'gen-talles': 'marketing',
  'exhib': 'local',
  'tncat': 'marketing',
  'disenos': 'compras',
  'ingresos': 'compras',
  'reposicion': 'administracion',
  'conteo': 'local',
  'conteo-deposito': 'deposito',
  'conteo-estandar-zattia': 'local',
  'conteo-estandar-stunned': 'local',
  'cupones': 'local',
  'solicitudes-internas': 'local',
  'solicitudes': 'local',
  'verif-ventas': 'analisis',
  'caducados': 'administracion',
  'ubicaciones': 'local',
  'meta-ads': 'marketing',
  'gerencial': 'direccion',
  'integraciones': 'integraciones',
  'postventa': 'administracion',
  'postventa-local': 'local',
  'postventa-deposito': 'deposito',
  'cambios-local': 'local',
  'reclamos-local': 'local',
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
  marketing: { areas: ['marketing'], keys: ['solicitudes'] },
  local: { areas: ['local'] },
  deposito: { areas: ['deposito'], keys: ['solicitudes'] },
  // Administración coordina: su área + las solicitudes de las dos marcas.
  administracion: { areas: ['administracion'], keys: ['solicitudes'] },
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
 * ¿Este perfil ve `key` en `marca`? Precedencia, de más fuerte a más débil:
 *
 *   1. admin            → ve todo.
 *   2. excepción (-key) → no lo ve, aunque su función se lo dé.
 *   3. permiso tildado  → lo ve.
 *   4. su función       → lo ve si la sección está en un área de alguna de sus funciones.
 *
 * El orden importa para la compatibilidad: los permisos que ya tiene cada usuario siguen valiendo
 * tal cual (paso 3), así que nadie pierde acceso. La función SUMA. Si alguien queda viendo de más,
 * se recorta con la excepción (paso 2) en vez de destildar sección por sección.
 */
export function puedeVer(perfil, marca, key) {
  if (esAdmin(perfil)) return true
  if (!perfil) return false
  if (estaExcluido(perfil, marca, key)) return false
  const acc = (perfil.acceso && perfil.acceso[marca]) || {}
  if (acc[key]) return true
  if ((ALIAS_COMPAT[key] || []).some((k) => acc[k])) return true
  const fs = Array.isArray(perfil.funcion) ? perfil.funcion : []
  return fs.some((f) => setDeFuncion(f).has(key))
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
