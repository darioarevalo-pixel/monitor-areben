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

import { esAdmin, puedeSub, puedeVer, tieneFuncion, type Perfil } from '@/lib/permisos'
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
 * Ya no recibe la marca activa ni la lista de marcas: el acceso lo decide el permiso de cada marca,
 * no en cuál estás parado.
 */
export function veMarcaCanjes(perfil: Perfil | null): CanjeStore[] {
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

/**
 * Qué firmas tiene, para una marca. Es lo que le pasa el modal de propuesta a `naceEn` para
 * anticipar si el canje sale directo o va a la pestaña de aprobaciones.
 *
 * Sigue siendo presentación: quien decide en qué estado nace es el servidor, con la misma función.
 */
export function nivelesQueFirma(perfil: Perfil | null, marca: Marca): NivelAprobacion[] {
  const niveles: NivelAprobacion[] = []
  if (puedeSub(perfil, marca, 'canjes', 'aprobar')) niveles.push('aprobar')
  if (puedeSub(perfil, marca, 'canjes', 'aprobar-plata')) niveles.push('aprobar-plata')
  return niveles
}

/** El sub que habilita "Cerrar igual" con motivo, cuando la persona no cumplió del todo. */
export function puedeCerrarIncompleto(perfil: Perfil | null, marca: Marca): boolean {
  return puedeSub(perfil, marca, 'canjes', 'cerrar')
}

/** ¿Entra a la sección? Lo mismo que cualquier otra: el padrón, en cambio, lo ve entero. */
export function puedeVerCanjes(perfil: Perfil | null, marca: Marca): boolean {
  return puedeVer(perfil, marca, 'canjes')
}

/**
 * ¿Puede tocar los números del módulo (la pestaña Ajustes)?
 *
 * ⚠️ Espejo de `esAdministracion()` en `api/_canjes.js`, que es el gate de verdad: acá sirve para
 * no mostrar una pantalla que el servidor va a rechazar. **No es por marca**: la config sí lo es,
 * pero quién puede tocarla no — es la misma gente que maneja los números del resto del monitor.
 */
export function puedeConfigurarCanjes(perfil: Perfil | null): boolean {
  return esAdmin(perfil) || tieneFuncion(perfil, 'administracion')
}
