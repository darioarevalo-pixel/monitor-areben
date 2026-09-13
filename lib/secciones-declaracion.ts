/**
 * Lo que cada sección DECLARA de sí misma en su propia pantalla: qué hace y qué escribe.
 *
 * # Por qué existe
 *
 * Es el pedido que abrió `PENDIENTES.md`, dicho por Bruno el 25-ago-2026: *«los sectores en monitor
 * no se entienden qué hace ni qué ejecutan»*. El encabezado ya mostraba un renglón corto
 * (`DESCRIPCIONES` en `lib/nav.ts`), que alcanza para reconocer la sección y ⛔ no para saber qué
 * pasa si apretás algo.
 *
 * 🔑 **Y el texto largo YA ESTABA ESCRITO: es el `info` de `PERM_CAT`** (medido el 12-sep-2026: 62 de
 * las 64 secciones registradas lo tienen, y muchos dicen exactamente lo que faltaba — *«Los objetivos
 * se cargan en Norte: acá sólo se miran»*, *«El ajuste a GN se calcula con stock vivo + diferencia»*).
 * Lo que ⛔ no existía era **mostrarlo**: hasta hoy sólo se veía en `/usuarios`, cuando un admin
 * reparte permisos. ⇒ acá ⛔ no se redactan 64 textos nuevos: se publica el que ya está curado y se
 * cubren los dos que faltaban.
 *
 * ⚠️ **Por qué en un archivo nuevo y no adentro de `nav.datos.ts`**, que sería su lugar natural: el
 * 12-sep hay **otra sesión editando ese archivo** y acá no hay merge —
 * `feedback_areben_checkout_compartido_no_hay_merge`—. `PROPIAS` está para mudarse a `PERM_CAT.info`
 * en cuanto el archivo quede libre, y el test de al lado lo obliga a **encogerse**: cada entrada
 * sobra el día que el `info` de esa sección alcance solo.
 */

import { PERM_CAT } from './nav.datos'

/**
 * Las secciones cuyo `info` de `PERM_CAT` ⛔ no alcanza —**no lo tienen, o es un rótulo**—, con el
 * texto sacado de LEER la pantalla, ⛔ no de imaginarla. 🔑 Cada línea dice **qué escribe y dónde**,
 * que es la mitad que el renglón corto ⛔ no contesta nunca — y cuando la sección sólo mira, lo dice:
 * «⛔ no escribe nada» es la respuesta más útil de todas, y la que el usuario ⛔ no podía saber.
 *
 * ⚠️ Las seis cortas salieron MEDIDAS (12-sep-2026), ⛔ no elegidas a dedo: de las 64 secciones, seis
 * declaraban en menos de 60 caracteres. Cinco eran de análisis y el docblock de cada una dice
 * *«read-only sobre el store del ETL»* — de ahí sale el «sólo mira». La sexta era `tncat`, que decía
 * «Herramientas de TiendaNube.» **siendo la que más escribe afuera del monitor**.
 */
export type Propia = {
  texto: string
  /**
   * Por qué esta declaración pisa a la de `PERM_CAT`. ⚠️ Es lo que hace verificable que la entrada
   * siga haciendo falta: el test de al lado la marca de más en cuanto el motivo deje de valer.
   *  - `sin-info`: esa sección ⛔ no tiene `info`.
   *  - `no-dice-si-escribe`: lo tiene, pero ⛔ no dice si toca algo — y eso es justo lo que se
   *    preguntó. «Panel principal con métricas y resumen general del negocio» no contesta si el
   *    botón de esa pantalla escribe en alguna parte.
   */
  porque: 'sin-info' | 'no-dice-si-escribe'
}

export const PROPIAS: Record<string, Propia> = {
  inicio: {
    texto:
    'La casa: qué pasa hoy según la función de cada uno. Muestra los MISMOS avisos que cuenta el ' +
    'badge del sidebar, los pendientes de la Agenda de hoy, las novedades sin leer y lo que viene. ' +
    '⛔ No escribe nada del negocio: lo único que guarda es hasta dónde leíste los avisos, para no ' +
    'volver a marcarlos como nuevos.',
    porque: 'sin-info',
  },
  usuarios: {
    texto:
    'El padrón de usuarios del monitor (sólo admin): quién entra, con qué contraseña, qué funciones ' +
    'tiene y qué permisos por marca. Se edita una copia local y «Guardar» escribe la config ' +
    'COMPLETA de una sola vez — un usuario borrado de la lista se borra al guardar, y no hay ' +
    'deshacer. Los permisos se aplican en el próximo ingreso de esa persona.',
    porque: 'sin-info',
  },
  tncat: {
    texto:
    'Las herramientas que ESCRIBEN sobre la tienda online de Tienda Nube, una por entrada del menú: ' +
    'Fotos y Cola de fotos (sube y ordena imágenes del producto), Categorías (asigna y saca productos ' +
    'de una categoría), Visibilidad (publica u oculta el producto en la tienda) y las dos de texto, ' +
    'Tabla de talles y Descripción. 🔴 Lo que se toca acá se ve en la tienda pública, y Tienda Nube ' +
    'guarda la LISTA COMPLETA de categorías de cada producto: si otra persona está editando el mismo ' +
    'producto, la última en guardar pisa lo de la otra. Eliminar una categoría ⛔ no se puede desde acá: ' +
    'eso es a mano en el admin de Tienda Nube.',
    porque: 'no-dice-si-escribe',
  },
  resumen: {
    texto:
    'El tablero de la marca: los KPIs y el resumen del negocio, con el estado del último sync de ' +
    'Gestión Nube y el botón para volver a traer los datos. ⛔ No escribe nada del negocio: todo sale ' +
    'del ETL y acá sólo se mira — lo único que hace el botón es volver a pedir la foto.',
    porque: 'no-dice-si-escribe',
  },
  'ventas-mensuales': {
    texto:
    'La venta mes a mes (con el corte por categoría y por canal) y, en la otra pestaña, día a día en ' +
    'plata y en unidades contra la semana anterior. ⛔ No escribe nada: es lectura del store del ETL.',
    porque: 'no-dice-si-escribe',
  },
  variantes: {
    texto:
    'Ventas y stock de cada variante —talle, modelo o color— con la vida útil de los últimos 30 días, ' +
    'buscador y orden por columna. ⛔ No escribe nada: es lectura del store del ETL.',
    porque: 'no-dice-si-escribe',
  },
  talles: {
    texto:
    'Qué talles se venden en cada categoría, en gráfico y en tabla, con el rango de meses que elijas. ' +
    'Es de Zattia. ⛔ No escribe nada: es lectura del store del ETL.',
    porque: 'no-dice-si-escribe',
  },
  colores: {
    texto:
    'Qué colores se venden (gráfico y tabla) y el análisis de agotamiento, que congela el ratio de ' +
    'cada color al primer sellout. Es de Zattia. ⛔ No escribe nada: es lectura del store del ETL.',
    porque: 'no-dice-si-escribe',
  },
}

/**
 * Las palabras con las que un texto dice si toca algo — incluido el «⛔ no escribe nada», que es una
 * respuesta y ⛔ no un silencio. Vive acá y la usa el test: dos copias se despegan.
 */
export const SENALES_DE_ESCRITURA = /escrib|guarda|publica|asigna|aplica|sólo se mira|sólo mira|sólo lee|no toca/i

/** `key` de sección → el texto largo que la declara. Se arma una vez: `PERM_CAT` es un literal. */
const MAPA: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const cat of PERM_CAT) {
    if (cat.info) out[cat.key] = cat.info
    // Un sub sólo aporta si su sección no dijo nada: `tncat` tiene cuatro herramientas colgando y el
    // encabezado de la sección es el de la sección, ⛔ no el de la primera de sus cuatro.
    for (const sub of cat.subs ?? []) if (sub.info && !out[sub.key]) out[sub.key] = sub.info
  }
  for (const [k, v] of Object.entries(PROPIAS)) out[k] = v.texto
  return out
})()

/**
 * Qué hace esta sección y qué escribe, en el texto largo. `undefined` si nadie lo declaró —y eso
 * ⛔ no puede pasar: lo veta `tests/seccion-declara.test.ts`.
 */
export function declaracionDe(key: string): string | undefined {
  return MAPA[key]
}
