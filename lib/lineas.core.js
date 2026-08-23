/**
 * **La línea de negocio: LA implementación, una sola, para los dos mundos.**
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js`: los handlers de `api/*.js` corren en Node sin pasar por
 * el compilador de Next y **no pueden importar TypeScript**. Esto lo necesitan los dos lados, así
 * que vive acá y `lib/lineas.ts` es el re-export tipado.
 *
 * # Qué es una línea, y por qué no es una marca
 *
 * El monitor tiene **dos marcas** (`lib/nav.datos.ts`: `bdi` y `zattia`) y cada una es **una base de
 * Supabase**. Stunned **no es una tercera**: está cargada adentro del Gestión Nube de Zattia,
 * comparte su base, sus permisos y hasta su depósito y su local — medido el 22-ago-2026: sus 195
 * unidades viven en los mismos `Deposito`/`Local` que Zattia, y **lo único que la separa es el
 * prefijo de SKU**.
 *
 * Convertirla en `Marca` pediría una tercera base que no existe (`CUENTAS` es
 * `Record<Marca, Cuenta>`) y tocaría 514 apariciones de `bdi | zattia` en 143 archivos. Por eso el
 * eje que se ensancha es **la línea**, no la marca.
 *
 * # Por qué está en la raíz de `lib/` y no adentro de una sección
 *
 * Nació en Meta Ads (`lib/meta-ads/lineas.core.js`) y ahí quedó atada por accidente de dónde se
 * escribió. **No es de Meta Ads**: la misma pregunta se la hacen el memo, Norte, los conteos, el
 * mapa de SKU, Canjes, el sync de Tienda Nube y ahora el ETL del navegador. Cuando una regla se
 * copia, las copias se despegan — y acá ya se habían despegado dos veces:
 *
 *   - **«STU ⇒ Stunned» estaba escrita 3 veces y hacía 3 cosas distintas**: clasificaba en
 *     `lib/memo/foto.core.js`, clasificaba sobre variantes en `lib/conteo-estandar/core.ts`, y
 *     **excluía** en `lib/margenes.ts` (de ahí que los 28 productos de Stunned no tuvieran margen en
 *     ninguna pantalla, sin cartel).
 *   - **«de qué marca cuelga» tenía dos helpers con modos de falla OPUESTOS**: `baseDeLinea`
 *     devolvía `null` ante lo desconocido y `marcaDePermisos` devolvía `'zattia'` **por descarte**,
 *     que es exactamente el defecto que `baseDeLinea` vino a matar.
 *
 * ⚠️ **El separador es el SKU y no siempre está.** Medido el 22-ago-2026 en Zattia: 96 productos
 * activos tienen `sku` NULL (47 vendieron $3,1M en 30 días) y para todos ellos `esStunned` sólo
 * puede contestar «no». Hoy ninguno es de Stunned, pero el día que carguen uno de Stunned sin SKU su
 * plata cae en Zattia **sin que falle nada**. No hay otra señal en la base para cruzarla.
 */

/** Las tres líneas del negocio. El orden es el de las grillas. */
export const LINEAS = ['bdi', 'zattia', 'stunned']

/** Cómo se llama cada línea en pantalla. */
export const ETIQUETA_LINEA = {
  bdi: 'BDI',
  zattia: 'Zattia',
  stunned: 'Stunned',
}

export function esLinea(x) {
  return LINEAS.includes(String(x || '').toLowerCase())
}

/**
 * La marca del monitor a la que pertenece una línea: la que manda para **permisos y base de datos**.
 *
 * Es EL helper de todo esto. Stunned no existe como marca: si se le pregunta a `puedeVer` por
 * `'stunned'` contesta `false` y la pantalla tira un 403 que nadie entiende. Todo chequeo de permiso
 * y toda elección de base de Supabase pasan por acá.
 *
 * 🔴 **Devuelve `null` si la línea no existe — nunca una marca por descarte.** Un `?? 'zattia'` acá
 * arriba convertiría cualquier string en un permiso de Zattia, que es el defecto que este archivo
 * existe para no tener.
 */
export function baseDeLinea(linea) {
  const l = String(linea || '').toLowerCase()
  if (l === 'bdi') return 'bdi'
  if (l === 'zattia' || l === 'stunned') return 'zattia'
  return null
}

/** Las líneas que cuelgan de una marca del monitor. Zattia trae a Stunned de la mano. */
export function lineasDeMarca(marca) {
  return LINEAS.filter((l) => baseDeLinea(l) === String(marca || '').toLowerCase())
}

/**
 * La línea que corresponde MOSTRAR: la elegida sólo si pertenece a la marca; si no, la marca.
 *
 * 🔴 **Existe por un defecto que sólo se vio caminando** (23-ago-2026). El selector de línea de una
 * pantalla es un `useState`, que se inicializa **una sola vez**: al cambiar de marca la elección
 * vieja sobrevive, y en Norte eso mostraba **los objetivos de BDI bajo el rótulo de Zattia**, con el
 * selector sin ninguna pestaña marcada. Peor que mirar: «Agregar meta» ahí habría **escrito en la
 * base de BDI** estando parado en Zattia.
 *
 * 🔑 **Es derivado y no un efecto**: no hay ventana en la que la pantalla dibuje lo de la marca
 * anterior antes de que un `useEffect` corrija. Es la misma regla que `useDatosMonitor` aplica con
 * su clave de carga.
 *
 * `null` es «no eligió nada todavía» y contesta la marca, que es el default de todos los selectores.
 */
export function lineaVigente(elegida, marca) {
  const base = String(marca || '').toLowerCase()
  return lineasDeMarca(base).includes(elegida) ? elegida : base
}

/**
 * ¿Este SKU es de Stunned?
 *
 * El prefijo `STU` es la única señal que hay: no existe columna de marca ni depósito propio. Estaba
 * escrito en tres lugares y ahora vive acá.
 *
 * Un SKU ausente contesta `false`, o sea «no es de Stunned» — y no `null`, porque los llamadores lo
 * usan para partir en dos y un tercer valor los obligaría a inventar un default. Lo que se pierde
 * con eso está dicho arriba y es real: un producto de Stunned sin SKU se cuenta como Zattia.
 */
export function esStunned(sku) {
  return !!sku && /^stu/i.test(String(sku))
}

/**
 * La línea de un producto, según de qué base salió y qué SKU tiene.
 *
 * 🔑 **El `store` va primero y no es decorativo**: en BDI el prefijo `STU` no significa nada, así
 * que preguntar sólo por el SKU haría de una funda de BDI un producto de Stunned.
 */
export function lineaDe(store, sku) {
  if (store === 'zattia') return esStunned(sku) ? 'stunned' : 'zattia'
  return 'bdi'
}
