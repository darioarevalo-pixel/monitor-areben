import type { Marca } from './nav.generated'

/** Perfil tal como lo devuelve el KV (bdi-catalogo/api/usuarios) y lo guarda el legacy en USERS. */
export type Perfil = {
  name: string
  admin: boolean
  /** Si tiene cuenta fija, no puede cambiar de marca. */
  cuenta: Marca | null
  acceso: Partial<Record<Marca, Record<string, boolean>>>
}

/** Port literal de _esAdmin() (index.html:9321). */
export function esAdmin(perfil: Perfil | null): boolean {
  return !!perfil?.admin
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
