import { PERM_CAT, type Marca } from './nav.datos'

/**
 * Función del usuario dentro del sistema (rol de flujo de trabajo, distinto de los
 * permisos granulares y de `admin`). Gobierna qué parte de una Solicitud ve cada uno
 * (p.ej. Local ve lo de retirar en local; Depósito lo de preparar). Un usuario puede
 * tener VARIAS. `administracion` es un rol de oficina/coordinación, NO es la gerencia
 * (esa es `direccion`).
 */
export type Funcion = 'direccion' | 'marketing' | 'local' | 'deposito' | 'administracion'

/** Catálogo de funciones con su rótulo y ayuda (fuente única para la UI de usuarios). */
export const FUNCIONES: { key: Funcion; label: string; info: string }[] = [
  { key: 'direccion', label: 'Dirección', info: 'Gerencia: ve todo. Su Inicio NO arranca con las solicitudes de fotos para armar.' },
  { key: 'marketing', label: 'Marketing', info: 'Crea las solicitudes y ve la solicitud COMPLETA (todos los productos y su estado).' },
  { key: 'local', label: 'Local', info: 'Ve solo lo que tiene que RETIRAR en local (ítems de origen local).' },
  { key: 'deposito', label: 'Depósito', info: 'PREPARA los productos de depósito (ítems de origen depósito).' },
  { key: 'administracion', label: 'Administración', info: 'Rol de oficina/coordinación. Distinto de Dirección.' },
]

/**
 * Qué ve cada función, por ÁREA del menú (`PermCat.area`) — no por lista de secciones.
 *
 * Es la respuesta al problema real: hasta ahora cada sección nueva había que tildarla
 * usuario por usuario y marca por marca, así que el alta de un módulo era una tarde de
 * checkboxes y siempre quedaba alguien afuera. Al colgar el acceso del ÁREA, una
 * sección nueva la hereda sola todo el que tenga esa función: se asigna una vez, al
 * rol, cuando se define en qué área vive.
 *
 * Lo que la función NO da son los **sub-permisos** (`etiquetas.dep`, `conteo.aplicar`,
 * `cupones.crear`, `sesion-fotos.quitar-item`): son justamente las acciones sensibles
 * —aplicar un ajuste de stock, crear cupones— y se siguen tildando a mano.
 */
export const ACCESO_POR_FUNCION: Record<Funcion, { areas: string[]; keys?: string[] }> = {
  // Gerencia: el panel de decisiones y toda la analítica.
  direccion: { areas: ['direccion', 'analisis'] },
  // Marketing usa el monitor como herramienta adicional: lo suyo + pedir productos.
  marketing: { areas: ['marketing'], keys: ['solicitudes'] },
  local: { areas: ['local'] },
  deposito: { areas: ['deposito'], keys: ['solicitudes'] },
  // Administración coordina: su área + las solicitudes de las dos marcas.
  administracion: { areas: ['administracion'], keys: ['solicitudes'] },
}

/** Las secciones que trae puesta una función (expandiendo sus áreas con PERM_CAT). */
export function seccionesDeFuncion(f: Funcion): string[] {
  const { areas, keys = [] } = ACCESO_POR_FUNCION[f]
  return [...PERM_CAT.filter((p) => areas.includes(p.area)).map((p) => p.key), ...keys]
}

const POR_FUNCION = new Map<Funcion, Set<string>>()
function setDeFuncion(f: Funcion): Set<string> {
  let s = POR_FUNCION.get(f)
  if (!s) {
    s = new Set(seccionesDeFuncion(f))
    POR_FUNCION.set(f, s)
  }
  return s
}

/** La función por la que este perfil llega a `key` (para explicarlo en Config), o null. */
export function funcionQueDa(perfil: Perfil | null, key: string): Funcion | null {
  return (perfil?.funcion ?? []).find((f) => setDeFuncion(f).has(key)) ?? null
}

/**
 * Excepción NEGATIVA: quitarle a alguien una sección que su función le daría.
 *
 * Viaja como una clave con guion adelante dentro del mismo `acceso` (`'-reposicion'`)
 * en vez de un campo propio, y eso es a propósito: el login de `bdi-catalogo/api/usuarios`
 * arma el perfil con una lista fija de campos (`name/admin/cuenta/acceso/funcion`), así
 * que un campo nuevo se guardaría en el KV pero **nunca llegaría al navegador**. Ninguna
 * key real empieza con guion, así que la convención no colisiona.
 */
export const marcaExcluir = (key: string) => `-${key}`

export function estaExcluido(perfil: Perfil | null, marca: Marca, key: string): boolean {
  return !!perfil?.acceso?.[marca]?.[marcaExcluir(key)]
}

/** Perfil tal como lo devuelve el KV (bdi-catalogo/api/usuarios) y lo guarda el legacy en USERS. */
export type Perfil = {
  name: string
  admin: boolean
  /** Si tiene cuenta fija, no puede cambiar de marca. */
  cuenta: Marca | null
  acceso: Partial<Record<Marca, Record<string, boolean>>>
  /** Funciones/roles de flujo de trabajo (opcional; ausente = sin función asignada). */
  funcion?: Funcion[]
}

/** Port literal de _esAdmin() (index.html:9321). */
export function esAdmin(perfil: Perfil | null): boolean {
  return !!perfil?.admin
}

/** ¿El perfil tiene la función `f`? (los admins NO la tienen implícita: es un rol de flujo, ortogonal). */
export function tieneFuncion(perfil: Perfil | null, f: Funcion): boolean {
  return !!perfil?.funcion?.includes(f)
}

/**
 * ¿Este perfil ve `key` en `marca`? Precedencia, de más fuerte a más débil:
 *
 *   1. admin           → ve todo.
 *   2. excepción (-key) → no lo ve, aunque su función se lo dé.
 *   3. permiso tildado  → lo ve (es lo que hacía el legacy, _puedeVer, index.html:9322).
 *   4. su función       → lo ve si la sección está en un área de alguna de sus funciones.
 *
 * El orden importa para la compatibilidad: los permisos que ya tiene cada usuario
 * siguen valiendo tal cual (paso 3), así que **nadie pierde acceso** al activar esto.
 * La función SUMA. Si alguien queda viendo de más, se recorta con la excepción (paso 2)
 * en vez de tener que destildar sección por sección.
 */
export function puedeVer(perfil: Perfil | null, marca: Marca, key: string): boolean {
  if (esAdmin(perfil)) return true
  if (!perfil) return false
  if (estaExcluido(perfil, marca, key)) return false
  if (perfil.acceso?.[marca]?.[key]) return true
  if ((ALIAS_COMPAT[key] ?? []).some((k) => perfil.acceso?.[marca]?.[k])) return true
  return (perfil.funcion ?? []).some((f) => setDeFuncion(f).has(key))
}

/**
 * Secciones que absorbieron a otras: quien tenía permiso de la vieja entra a la nueva.
 *
 * `solicitudes` se comió las dos entradas de menú de Sesión de fotos y Solicitudes internas
 * (Fase 2: pasaron a ser motivos de una misma cosa). Sin este alias, alguien de Marketing
 * con `sesion-fotos` tildado y sin función asignada se quedaba sin ninguna entrada al día
 * siguiente del deploy — el permiso viejo ya no apunta a nada del menú. Las rutas viejas
 * siguen existiendo para los links directos.
 */
const ALIAS_COMPAT: Record<string, string[]> = {
  solicitudes: ['sesion-fotos', 'solicitudes-internas'],
}

/**
 * Permiso granular de sub-acción: en PERM_CAT los subs se guardan planos,
 * con la forma "etiquetas.dep" o "sesion-fotos.quitar-item" (ver DEFAULT_USERS,
 * index.html:9302). Los admins pueden siempre.
 */
export function puedeSub(perfil: Perfil | null, marca: Marca, key: string, sub: string): boolean {
  return puedeVer(perfil, marca, `${key}.${sub}`)
}

/** Port de _userRole() (index.html:9324): el legacy lo usa para limitar la carga de datos. */
export function userRole(perfil: Perfil | null): 'admin' | 'marketing' {
  return esAdmin(perfil) ? 'admin' : 'marketing'
}

/** Si el perfil tiene cuenta fija, el switch de marca no se muestra (renderUserInfo, index.html:9542). */
export function puedeCambiarMarca(perfil: Perfil | null): boolean {
  return !perfil?.cuenta
}

export function marcaInicial(perfil: Perfil | null, guardada?: Marca | null): Marca {
  return perfil?.cuenta ?? guardada ?? 'bdi'
}
