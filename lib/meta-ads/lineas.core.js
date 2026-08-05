/**
 * Línea de pauta de una campaña de Meta: LA implementación. Una sola, para los dos mundos.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js` y `lib/meta-ads/etapas.core.js`: los handlers de `api/*.js`
 * corren en Node sin pasar por el compilador de Next y **no pueden importar TypeScript**. Esto lo
 * necesitan los dos lados —el endpoint para repartir las campañas y chequear permisos, la pantalla
 * para dibujar la grilla y ofrecer la asignación—, así que vive acá y `lib/meta-ads/lineas.ts` es el
 * re-export tipado.
 *
 * # Qué problema resuelve
 *
 * BDI, Zattia y Stunned se pautean **todas desde la misma cuenta publicitaria**. La versión anterior
 * atribuía la plata con un mapa `cuenta → marca` (`MARCA_POR_CUENTA`), y para una cuenta compartida
 * ese mapa no tiene ningún valor correcto: cualquiera que se cargue le regala a una marca la pauta
 * de las tres. La unidad de atribución real es la **campaña**, y no se puede deducir de nada que hoy
 * traiga la Graph API: la pone una persona.
 *
 * # La tercera línea
 *
 * Stunned NO es una `Marca` del monitor (`lib/nav.datos.ts` sólo conoce `bdi` y `zattia`): es una
 * línea adentro de Zattia, igual que `sku_map` con `store='stunned'` en la base de Zattia. Por eso
 * el eje se llama **línea de pauta** y vive acá, local a Meta Ads, en vez de ensancharse `Marca` —
 * que la importan ~32 archivos y arrastra los permisos y el test de espejo de secciones.
 */

/** Las tres líneas que se pautean. El orden es el de la grilla. */
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
 * Es EL helper de todo este cambio. Stunned no existe como marca: si se le pregunta a `puedeVer` por
 * `'stunned'` contesta `false` y la pantalla tira un 403 que nadie entiende. Todo chequeo de permiso
 * y toda elección de base de Supabase pasan por acá.
 *
 * Devuelve `null` si la línea no existe — nunca una marca por descarte, que es exactamente el bug
 * que este archivo vino a matar.
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
 * Qué línea PARECE ser una campaña, mirando su nombre.
 *
 * ⚠️ **Sugiere, no decide.** El valor que devuelve prellena el botón de la pantalla y ahí termina:
 * lo que queda guardado es lo que una persona confirmó. Ante un nombre ambiguo (nombra a dos líneas)
 * o que no matchea nada, devuelve `null` y la campaña se queda «sin asignar», que es un estado real
 * y no una falla.
 *
 * La versión anterior de esto era una regex que **caía a `bdi` en silencio** cuando no matcheaba
 * (`lib/gerencial/detectores/ads.ts`), y un número mal atribuido se ve razonable justo cuando está
 * mal. Por eso el empate y el vacío devuelven lo mismo: nada.
 *
 * `stunned` se chequea antes que `zattia` a propósito — no por prioridad, sino porque van a un
 * `Set` y el empate se resuelve abajo: "Zattia x Stunned" nombra a dos y no se asigna sola.
 */
const PISTAS = [
  ['stunned', /stunned|(^|[^a-z])stu([^a-z]|$)/i],
  ['zattia', /zattia/i],
  ['bdi', /(^|[^a-z])bdi([^a-z]|$)|buenos\s*dias\s*intimidad/i],
]

export function sugerirLinea(nombre) {
  const n = String(nombre || '')
  if (!n.trim()) return null
  const halladas = PISTAS.filter(([, re]) => re.test(n)).map(([linea]) => linea)
  return halladas.length === 1 ? halladas[0] : null
}
