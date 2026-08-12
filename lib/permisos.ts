/**
 * Permisos — la cara tipada.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/permisos.core.js`**, en JS plano, porque los handlers de
 * `api/*.js` no pueden importar TypeScript y necesitan exactamente estos mismos chequeos. Antes
 * cada handler se copiaba el pedazo que precisaba y las copias se despegaron — el bug que dejó a
 * todo el mundo sin ver el padrón de Canjes salió de ahí. El detalle está en el docblock del core.
 *
 * Este archivo aporta los **tipos** y las funciones que sólo usa la app (`FUNCIONES`, `userRole`,
 * `marcaInicial`). La API pública no cambió: los ~32 archivos que importan de acá siguen igual.
 */

import type { Marca } from './nav.datos'
import {
  ACCESO_POR_FUNCION as ACCESO_POR_FUNCION_JS,
  esAdmin as esAdminJs,
  estaExcluido as estaExcluidoJs,
  marcaExcluir as marcaExcluirJs,
  marcasConAcceso as marcasConAccesoJs,
  puedeAtenderRetiroLocal as puedeAtenderRetiroLocalJs,
  puedeSub as puedeSubJs,
  puedeVer as puedeVerJs,
  seccionesDeFuncion as seccionesDeFuncionJs,
  SECCION_AREA as SECCION_AREA_JS,
  tieneFuncion as tieneFuncionJs,
} from './permisos.core.js'

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

/** Qué ve cada función, por ÁREA del menú. Ver el core para el porqué. */
export const ACCESO_POR_FUNCION: Record<Funcion, { areas: string[]; keys?: string[] }> =
  ACCESO_POR_FUNCION_JS

/** A qué área pertenece cada sección. Espejo de `PermCat.area`, amarrado por test. */
export const SECCION_AREA: Record<string, string> = SECCION_AREA_JS

/** Perfil tal como lo devuelve el KV (bdi-catalogo/api/usuarios). */
export type Perfil = {
  name: string
  admin: boolean
  /** Si tiene cuenta fija, no puede cambiar de marca. */
  cuenta: Marca | null
  acceso: Partial<Record<Marca, Record<string, boolean>>>
  /** Funciones/roles de flujo de trabajo (opcional; ausente = sin función asignada). */
  funcion?: Funcion[]
  /**
   * Mail de Workspace, la clave que une esta persona con su cuenta en producción y en el
   * dashboard. Null en las cuentas que son un puesto y no una persona (Depósito, Local,
   * bdilocal): esas no pueden tener casilla y entran con contraseña.
   */
  email?: string | null
  /**
   * Cómo le decimos, para que el Monitor la reciba por su nombre. Opcional a propósito: sin
   * apodo se cae al `name`, que es el usuario de login (`bdilocal`, `deposito`) y por eso no
   * alcanza solo. Se lee SIEMPRE por `comoLeLlamamos()` (`lib/inicio/core.ts`), nunca a mano.
   */
  apodo?: string | null
  /** Cumpleaños como `MM-DD`, sin año: para saludar, no para saber la edad. */
  cumple?: string | null
}

/** Las secciones que trae puesta una función (expandiendo sus áreas). */
export function seccionesDeFuncion(f: Funcion): string[] {
  return seccionesDeFuncionJs(f)
}

/** La función por la que este perfil llega a `key` (para explicarlo en Config), o null. */
export function funcionQueDa(perfil: Perfil | null, key: string): Funcion | null {
  return (perfil?.funcion ?? []).find((f) => seccionesDeFuncion(f).includes(key)) ?? null
}

/** Marca una sección como excluida para este perfil (`'-reposicion'`). */
export const marcaExcluir: (key: string) => string = marcaExcluirJs

export function estaExcluido(perfil: Perfil | null, marca: Marca, key: string): boolean {
  return estaExcluidoJs(perfil, marca, key)
}

export function esAdmin(perfil: Perfil | null): boolean {
  return esAdminJs(perfil)
}

/** ¿El perfil tiene la función `f`? (los admins NO la tienen implícita: es un rol de flujo). */
export function tieneFuncion(perfil: Perfil | null, f: Funcion): boolean {
  return tieneFuncionJs(perfil, f)
}

/** ¿Este perfil ve `key` en `marca`? Precedencia y matices, en el core. */
export function puedeVer(perfil: Perfil | null, marca: Marca, key: string): boolean {
  return puedeVerJs(perfil, marca, key)
}

/** Permiso granular de sub-acción (`canjes.aprobar`). Los subs NO se heredan de la función. */
export function puedeSub(perfil: Perfil | null, marca: Marca, key: string, sub: string): boolean {
  return puedeSubJs(perfil, marca, key, sub)
}

/** En qué marcas este perfil ve la sección `key`. La cuenta fija acota. */
export function marcasConAcceso(perfil: Perfil | null, key: string, marcas: readonly Marca[]): Marca[] {
  return marcasConAccesoJs(perfil, key, [...marcas]) as Marca[]
}

/**
 * ¿Atiende el mostrador de los canjes que se retiran en el local? Cuelga de `cupones` en BDI, no de
 * un sub propio: un sub habría que tildarlo usuario por usuario. Ver el docblock del core.
 */
export function puedeAtenderRetiroLocal(perfil: Perfil | null): boolean {
  return puedeAtenderRetiroLocalJs(perfil)
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
