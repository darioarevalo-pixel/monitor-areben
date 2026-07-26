/**
 * Lógica pura de la gestión de usuarios/permisos. Port de las funciones `usu*` del
 * legacy (index.html:9441-9501), sin DOM: el toggle de permisos (con la relación
 * padre/sub), la validación antes de guardar, y el alta de un usuario nuevo.
 *
 * La fuente de las secciones/subs es `PERM_CAT` de `lib/nav` (la misma del menú).
 */

import { PERM_CAT, type Marca } from '@/lib/nav'
import { funcionQueDa, marcaExcluir, type Funcion } from '@/lib/permisos'
import type { UsuarioConfig } from './tipos'

/** Un usuario nuevo, vacío (sin permisos ni funciones). Port de usuAgregar. */
export function nuevoUsuario(): UsuarioConfig {
  return { name: '', pass: '', email: '', admin: false, cuenta: null, acceso: { bdi: {}, zattia: {} }, funcion: [] }
}

/** Asegura que `acceso.bdi` / `acceso.zattia` y `funcion` existan (el legacy los rellena al cargar). */
export function normalizar(u: UsuarioConfig): UsuarioConfig {
  const acceso = { ...(u.acceso || {}) }
  acceso.bdi = acceso.bdi || {}
  acceso.zattia = acceso.zattia || {}
  return { ...u, acceso, funcion: Array.isArray(u.funcion) ? u.funcion : [] }
}

/** Marca/desmarca una función del usuario (lista sin duplicados). Devuelve un usuario nuevo (inmutable). */
export function toggleFuncion(u: UsuarioConfig, f: Funcion, val: boolean): UsuarioConfig {
  const actual = Array.isArray(u.funcion) ? u.funcion : []
  const funcion = val ? [...new Set([...actual, f])] : actual.filter((x) => x !== f)
  return { ...u, funcion }
}

/**
 * De dónde le viene a este usuario el acceso a `key` en `brand`. Es lo que la pantalla
 * de Config necesita mostrar para que se entienda por qué algo está tildado:
 *
 * - `admin`     → es administrador, ve todo.
 * - `explicito` → se lo tildaron a él.
 * - `funcion`   → lo trae su función (Local, Marketing, …). No hace falta tildarlo.
 * - `excluido`  → su función se lo daría, pero se lo quitaron a propósito.
 * - `no`        → no lo tiene.
 */
export type OrigenPermiso = 'admin' | 'explicito' | 'funcion' | 'excluido' | 'no'

export function origenPermiso(u: UsuarioConfig, brand: Marca, key: string): OrigenPermiso {
  if (u.admin) return 'admin'
  const b = u.acceso?.[brand] || {}
  const porFuncion = !!funcionQueDa(u, key)
  if (b[marcaExcluir(key)]) return 'excluido'
  if (b[key]) return 'explicito'
  return porFuncion ? 'funcion' : 'no'
}

/**
 * Marca/desmarca un permiso de un usuario en una marca. Mantiene el comportamiento del
 * legacy (usuTogglePerm) —marcar un SUB marca el PADRE; desmarcar un PADRE borra sus
 * subs— y le suma la capa de funciones:
 *
 * - destildar algo que **viene por función** no borra nada (no hay nada que borrar):
 *   deja la EXCEPCIÓN `-key`, que es lo único que puede ganarle a la función;
 * - volver a tildarlo saca la excepción, y solo agrega el permiso explícito si la
 *   función no se lo daba ya (así la config no se llena de tildes redundantes).
 */
export function togglePerm(u: UsuarioConfig, brand: Marca, key: string, val: boolean): UsuarioConfig {
  const b: Record<string, boolean> = { ...(u.acceso?.[brand] || {}) }
  const excl = marcaExcluir(key)
  const porFuncion = !key.includes('.') && !!funcionQueDa(u, key)

  if (val) {
    delete b[excl]
    if (!porFuncion) b[key] = true
  } else {
    delete b[key]
    if (porFuncion) b[excl] = true
  }

  const padre = key.split('.')[0]
  if (key.includes('.')) {
    // Un sub no sirve sin su padre: si el padre no viene por función, se tilda.
    if (val && !funcionQueDa(u, padre)) b[padre] = true
    if (val) delete b[marcaExcluir(padre)]
  } else {
    const cat = PERM_CAT.find((c) => c.key === padre)
    if (cat?.subs && !val) cat.subs.forEach((s) => delete b[`${padre}.${s.key}`])
  }
  return { ...u, acceso: { ...u.acceso, [brand]: b } }
}

/**
 * Copia los permisos de una marca a la otra (pisa lo que haya en destino).
 *
 * Existe porque el permiso es por marca y casi todo el mundo trabaja igual en las dos:
 * sin esto, dar de alta a alguien es tildar la misma lista dos veces, y ahí es donde
 * aparecen las diferencias que después nadie entiende ("en BDI lo ve y en Zattia no").
 */
export function copiarPermisos(u: UsuarioConfig, origen: Marca, destino: Marca): UsuarioConfig {
  return { ...u, acceso: { ...u.acceso, [destino]: { ...(u.acceso?.[origen] || {}) } } }
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

/** ¿La checkbox de `key` está marcada para `brand`? (admin y función también la marcan). */
export function tienePermiso(u: UsuarioConfig, brand: Marca, key: string): boolean {
  const o = origenPermiso(u, brand, key)
  return o === 'admin' || o === 'explicito' || o === 'funcion'
}
