import type { Marca } from './nav.generated'

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
 * Port literal de _puedeVer(brand, key) (index.html:9322).
 * El admin ve todo; el resto, solo lo que tenga marcado en acceso[marca][key].
 */
export function puedeVer(perfil: Perfil | null, marca: Marca, key: string): boolean {
  if (esAdmin(perfil)) return true
  return !!perfil?.acceso?.[marca]?.[key]
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
