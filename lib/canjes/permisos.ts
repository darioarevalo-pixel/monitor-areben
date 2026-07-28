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
import { marcasQueVe } from '@/lib/solicitudes/overview'
import type { Marca } from '@/lib/nav.datos'
import { CANJE_STORES, type CanjeStore, type NivelAprobacion } from './tipos'

/**
 * Las marcas cuyos canjes ve enteros.
 *
 * Envuelve `marcasQueVe` (`lib/solicitudes/overview.ts:176`) y le suma el paso que ese helper no
 * puede dar: **Stunned viaja con Zattia**. No es una marca del monitor (es una línea de Zattia por
 * prefijo de SKU `STU`), así que no aparece en `Marca` ni en el switch de marca; pero desde el lado
 * del canje se elige como una más. Quien ve Zattia ve Stunned — el mismo criterio con el que
 * `api/sku-map.js` rutea sus costos.
 *
 * ⚠️ Esto es el espejo de `marcasVisibles()` en `api/_canjes.js`. La que manda es la del servidor;
 * si divergen, la UI muestra de menos (molesto) o promete de más (un 403 al abrir). El test las
 * compara.
 */
export function veMarcaCanjes(perfil: Perfil | null, marcaActiva: Marca, todas: Marca[]): CanjeStore[] {
  const marcas = marcasQueVe(perfil, marcaActiva, todas)
  const out = new Set<CanjeStore>()
  for (const m of marcas) {
    out.add(m)
    if (m === 'zattia') out.add('stunned')
  }
  return CANJE_STORES.filter((s) => out.has(s))
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
