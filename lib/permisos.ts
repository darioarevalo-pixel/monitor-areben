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
  veVentasHistoricas as veVentasHistoricasJs,
  estaExcluido as estaExcluidoJs,
  KEYS_PARA_TODOS as KEYS_PARA_TODOS_JS,
  marcaDePermisos as marcaDePermisosJs,
  marcaExcluir as marcaExcluirJs,
  marcasConAcceso as marcasConAccesoJs,
  puedeContar as puedeContarJs,
  SECCIONES_CONTEO as SECCIONES_CONTEO_JS,
  puedeAtenderRetiroLocal as puedeAtenderRetiroLocalJs,
  puedeSub as puedeSubJs,
  puedeVer as puedeVerJs,
  puedeVerAlguna as puedeVerAlgunaJs,
  SECCIONES_ANALISIS_VENTAS as SECCIONES_ANALISIS_VENTAS_JS,
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

/**
 * Las secciones que ve todo el equipo sin permiso. **Es la puerta abierta de verdad** — no
 * `KEYS_SIN_PERMISO` de `lib/nav.ts`, que sólo dice qué rutas existen. El porqué, en el core.
 */
export const KEYS_PARA_TODOS: Set<string> = KEYS_PARA_TODOS_JS

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

/**
 * El cumpleaños de alguien del equipo, como llega con el login.
 *
 * 🔑 **Es a propósito lo más chico que se puede mandar**: apodo y día, nada más. Saber quién cumple
 * exige el padrón, que es admin-only (`action:'config'`), así que la alternativa era abrirlo o
 * inventar un endpoint — y en Hobby quedan tres funciones. `bdi-catalogo/api/usuarios.js` lo
 * devuelve al lado del perfil (`cumplesDe`), sin mails, sin permisos y sin año de nacimiento: con
 * esta lista en la mano no se puede deducir nada más que a quién saludar.
 */
export type Cumple = {
  apodo: string
  /** `MM-DD` */
  cumple: string
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
/** De qué marca del monitor cuelgan los permisos de una `store`. Stunned NO es una marca. */
export const marcaDePermisos: (store: string) => Marca = marcaDePermisosJs

/** Las cuatro pantallas de conteo físico, que comparten los endpoints de stock vivo. */
export const SECCIONES_CONTEO: readonly string[] = SECCIONES_CONTEO_JS

/**
 * Las tres pantallas de Análisis que muestran ventas: la llave de la marca de «vendido en sale»
 * (`?vendido=1` de `api/_liquidacion.js`).
 */
export const SECCIONES_ANALISIS_VENTAS: readonly string[] = SECCIONES_ANALISIS_VENTAS_JS

/** ¿Puede ver **alguna** de esas secciones en la marca? La forma en que los handlers abren una
    puerta compartida por varias pantallas, sin copiar el chequeo adentro de cada rama. */
export function puedeVerAlguna(perfil: Perfil | null, store: string, keys: readonly string[]): boolean {
  return puedeVerAlgunaJs(perfil, store, [...keys])
}

/** ¿Puede contar en esta `store`? La llave de `_inventario-vivo.js` y `_conteos-deposito.js`. */
export function puedeContar(perfil: Perfil | null, store: string): boolean {
  return puedeContarJs(perfil, store)
}

export function puedeAtenderRetiroLocal(perfil: Perfil | null): boolean {
  return puedeAtenderRetiroLocalJs(perfil)
}

/**
 * ¿Le corresponde la historia COMPLETA de ventas, o los últimos 35 días? La implementación —y el
 * porqué de que cuelgue del permiso y no del flag de admin— vive en `lib/permisos.core.js`.
 *
 * Reemplazó a `userRole()`, que era el port de `_userRole()` del legacy (index.html:9324) y cuyo
 * único llamador era justamente esto: decidir cuánta venta baja el ETL.
 */
export function veVentasHistoricas(perfil: Perfil | null, store: string): boolean {
  return veVentasHistoricasJs(perfil, store)
}

/** Si el perfil tiene cuenta fija, el switch de marca no se muestra (renderUserInfo, index.html:9542). */
export function puedeCambiarMarca(perfil: Perfil | null): boolean {
  return !perfil?.cuenta
}

export function marcaInicial(perfil: Perfil | null, guardada?: Marca | null): Marca {
  return perfil?.cuenta ?? guardada ?? 'bdi'
}
