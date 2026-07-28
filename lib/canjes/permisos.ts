/**
 * Permisos de Canjes.
 *
 * El módulo tiene una asimetría que no tiene ningún otro: **el padrón de personas es transversal a
 * las marcas y los canjes no**. Eso obliga a distinguir tres cosas que en el resto del monitor son
 * una sola:
 *
 * 1. **Ver la sección** — `puedeVer(perfil, marca, 'canjes')`, lo de siempre.
 * 2. **Ver el padrón** — quien entra a la sección ve a **todas** las personas, sin importar para
 *    qué marca trabajaron. Si no fuera así, el padrón compartido no serviría de nada: marketing de
 *    Zattia no se enteraría de que esa creadora ya laburó con BDI, que es exactamente el dato que
 *    hoy se pierde.
 * 3. **Ver un canje** — sólo los de las marcas que le tocan. Los demás llegan **ciegos** (marca,
 *    fecha y estado; sin productos, sin plata, sin balance, sin poder abrirlos), y llegan ciegos
 *    **desde el servidor**: `resumenCiego()` en `api/_canjes.js`. Acá no se filtra plata, porque
 *    filtrar en la UI significa que la plata ya viajó al browser.
 *
 * O sea: lo de este archivo es **presentación**, no seguridad. El gate real está en el handler.
 */

import { puedeSub, puedeVer, type Perfil } from '@/lib/permisos'
import { marcasVisiblesCanjes } from './marcas.js'
import type { Marca } from '@/lib/nav.datos'
import type { CanjeStore, NivelAprobacion } from './tipos'

/**
 * Las marcas cuyos canjes ve enteros.
 *
 * ⚠️ **Ya no es un espejo de nada**: llama a `marcasVisiblesCanjes` (`./marcas.js`), que es la
 * misma función que usa `api/_canjes.js`. Antes había dos implementaciones y se despegaron — el
 * servidor miraba sólo `perfil.cuenta` y devolvía vacío para todo el que podía cambiar de marca,
 * o sea 403 en Canjes entero. `tests/permisos-espejo.test.ts` corre las dos puertas sobre la misma
 * matriz de perfiles.
 *
 * `marcaActiva` y `todas` quedan en la firma por compatibilidad con quien la llama, pero **ya no
 * se usan**: el acceso lo decide el permiso de cada marca, no en cuál estás parado.
 */
export function veMarcaCanjes(perfil: Perfil | null, _marcaActiva?: Marca, _todas?: Marca[]): CanjeStore[] {
  return marcasVisiblesCanjes(perfil) as CanjeStore[]
}

/** ¿Este canje se puede abrir, o llega ciego? */
export function veCanjeEntero(visibles: CanjeStore[], store: CanjeStore): boolean {
  return visibles.includes(store)
}

/**
 * ¿Puede firmar esta aprobación?
 *
 * Los dos niveles son **sub-permisos** de `canjes`, no una función nueva. El monitor no tiene el
 * concepto "gerente" (`Funcion` es `direccion|marketing|local|deposito|administracion`) y agregar
 * una función tocaría `ACCESO_POR_FUNCION`, la pantalla de Usuarios y sus tests para modelar lo
 * mismo. Un sub-permiso es un tilde en Config.
 *
 * ⚠️ Los subs **no se heredan de la función**: hay que tildarlos a mano, en las dos marcas, el día
 * del deploy. Si nadie los tiene, ningún canje se puede aprobar nunca.
 */
export function puedeAprobar(perfil: Perfil | null, marca: Marca, nivel: NivelAprobacion): boolean {
  // Quien puede firmar lo alto puede firmar lo bajo. Al revés no.
  if (nivel === 'aprobar') {
    return puedeSub(perfil, marca, 'canjes', 'aprobar') || puedeSub(perfil, marca, 'canjes', 'aprobar-plata')
  }
  return puedeSub(perfil, marca, 'canjes', 'aprobar-plata')
}

/** El sub que habilita "Cerrar igual" con motivo, cuando la persona no cumplió del todo. */
export function puedeCerrarIncompleto(perfil: Perfil | null, marca: Marca): boolean {
  return puedeSub(perfil, marca, 'canjes', 'cerrar')
}

/** ¿Entra a la sección? Lo mismo que cualquier otra: el padrón, en cambio, lo ve entero. */
export function puedeVerCanjes(perfil: Perfil | null, marca: Marca): boolean {
  return puedeVer(perfil, marca, 'canjes')
}
