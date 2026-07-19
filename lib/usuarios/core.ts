/**
 * Lógica pura de la gestión de usuarios/permisos. Port de las funciones `usu*` del
 * legacy (index.html:9441-9501), sin DOM: el toggle de permisos (con la relación
 * padre/sub), la validación antes de guardar, y el alta de un usuario nuevo.
 *
 * La fuente de las secciones/subs es `PERM_CAT` de `lib/nav` (la misma del menú).
 */

import { PERM_CAT, type Marca } from '@/lib/nav'
import type { UsuarioConfig } from './tipos'

/** Un usuario nuevo, vacío (sin permisos). Port de usuAgregar. */
export function nuevoUsuario(): UsuarioConfig {
  return { name: '', pass: '', admin: false, cuenta: null, acceso: { bdi: {}, zattia: {} } }
}

/** Asegura que `acceso.bdi` / `acceso.zattia` existan (el legacy los rellena al cargar). */
export function normalizar(u: UsuarioConfig): UsuarioConfig {
  const acceso = { ...(u.acceso || {}) }
  acceso.bdi = acceso.bdi || {}
  acceso.zattia = acceso.zattia || {}
  return { ...u, acceso }
}

/**
 * Marca/desmarca un permiso de un usuario en una marca. Port EXACTO de usuTogglePerm:
 * - al marcar un SUB (`key` con punto) se marca también el PADRE;
 * - al desmarcar un PADRE se borran todos sus subs.
 * Devuelve un usuario nuevo (inmutable, para el estado de React).
 */
export function togglePerm(u: UsuarioConfig, brand: Marca, key: string, val: boolean): UsuarioConfig {
  const b: Record<string, boolean> = { ...(u.acceso?.[brand] || {}) }
  if (val) b[key] = true
  else delete b[key]
  const padre = key.split('.')[0]
  if (key.includes('.')) {
    if (val) b[padre] = true
  } else {
    const cat = PERM_CAT.find((c) => c.key === padre)
    if (cat?.subs && !val) cat.subs.forEach((s) => delete b[`${padre}.${s.key}`])
  }
  return { ...u, acceso: { ...u.acceso, [brand]: b } }
}

/**
 * Valida la config antes de guardar. Port de los chequeos de usuariosGuardar: al
 * menos un admin, todos con nombre y contraseña, sin nombres repetidos. Devuelve el
 * mensaje de error o `null` si está OK.
 */
export function validar(users: UsuarioConfig[]): string | null {
  if (!users.some((u) => u.admin)) return 'Tiene que quedar al menos un administrador.'
  if (users.some((u) => !u.name || !u.pass)) return 'Todos los usuarios necesitan nombre y contraseña.'
  const nombres = users.map((u) => (u.name || '').trim())
  if (new Set(nombres).size !== nombres.length) return 'Hay nombres de usuario repetidos.'
  return null
}

/** ¿La checkbox de `key` está marcada para `brand`? (el admin ve todo → siempre marcada). */
export function tienePermiso(u: UsuarioConfig, brand: Marca, key: string): boolean {
  return !!u.admin || !!u.acceso?.[brand]?.[key]
}
