/**
 * **El mapa de zonas de reparto: en qué zona cae una dirección y cuánto sale llevarle un paquete.**
 *
 * Hasta ahora el precio del envío se tipeaba a mano mirando un mapa aparte (un HTML con polígonos
 * dibujados sobre Rosario). Esto es ese mapa hecho dato: los mismos polígonos, la misma regla de
 * selección, pero adentro del Monitor y sobre el punto que devuelve geocodificar la dirección.
 *
 * # Por qué es `.js` y no `.ts`
 *
 * Mismo motivo que `reglas.core.js` y `portal.core.js`: `api/_envios.js` corre en Node sin pasar por
 * el compilador de Next y no puede importar TypeScript. El precio que propone la pantalla y el que
 * valide el handler tienen que salir de **una sola** implementación.
 *
 * # Por qué no usamos turf, que es lo que usa el mapa
 *
 * El mapa original resuelve el punto-en-polígono con `@turf/turf`, que pesa cientos de KB y viajaría
 * en el bundle de una pantalla que se abre veinte veces por día. Lo que se usa de esa librería son
 * **treinta líneas**, así que están acá — pero copiadas con la misma semántica, no reinventadas:
 * `puntoEnPoligono` es el algoritmo de `booleanPointInPolygon` con `ignoreBoundary: false`,
 * incluyendo el detalle de que **un punto sobre el borde cuenta como adentro**.
 *
 * 🔑 **Que coincida con turf no es un lujo: es lo que hace que la pantalla y el mapa que Bruno mira
 * digan lo mismo.** Si divergen, la discusión pasa a ser cuál de los dos miente, y no hay forma de
 * saberlo desde adentro. Por eso hay un cotejo contra turf punto por punto sobre una grilla —vive
 * fuera de la suite, porque turf no es dependencia del repo— y los casos de borde quedaron acá
 * escritos como tests.
 *
 * # La regla de precio, y por qué puede negarse a contestar
 *
 * 🔴 **El modo de falla que importa no es "no encontré la zona": es contestar el precio equivocado
 * con cara de seguro.** Sin precio, la pantalla ya bloquea mandar el envío a un día y alguien lo
 * tipea; con un precio plausible pero de la zona de al lado, el paquete sale con $3.000 en vez de
 * $8.000 y no se entera nadie. Por eso `precioSugerido` devuelve `ambigua` —y ningún precio— cuando
 * el punto cae en dos zonas empatadas que cobran distinto, en vez de elegir una.
 */

/**
 * ¿El punto cae adentro del polígono?
 *
 * `geometria` es GeoJSON (`Polygon` o `MultiPolygon`), o sea coordenadas en orden **`[lng, lat]`** —
 * al revés de como se nombran las direcciones y al revés de los argumentos de esta función. Dar
 * vuelta ese par no rompe nada visible: devuelve un punto en el mar, afuera de todas las zonas, y la
 * pantalla lo muestra como "sin zona". Hay un test con coordenadas reales de Rosario justamente
 * porque el error es silencioso.
 *
 * Los agujeros (anillos 2 y siguientes de un `Polygon`) restan: un punto adentro del agujero está
 * afuera del polígono. Es lo que permite dibujar "toda esta zona menos este barrio".
 *
 * 🔑 **El borde cuenta como adentro**, igual que en turf. Dos zonas dibujadas pegadas comparten el
 * lado, así que un punto exacto sobre él cae en las dos y decide `precioSugerido` — que es
 * determinista— en vez de depender de por dónde entró el rayo.
 */
export function puntoEnPoligono(lat, lng, geometria) {
  const tipo = geometria && geometria.type;
  const coords = geometria && geometria.coordinates;
  if (!Array.isArray(coords)) return false;
  const partes = tipo === 'MultiPolygon' ? coords : tipo === 'Polygon' ? [coords] : [];
  return partes.some((anillos) => enUnPoligono([lng, lat], anillos));
}

/** Un polígono: el anillo 0 es el contorno y los que siguen son agujeros. */
function enUnPoligono(pt, anillos) {
  if (!Array.isArray(anillos) || !anillos.length) return false;
  if (!enAnillo(pt, anillos[0], false)) return false;
  // El agujero se pregunta con el borde EXCLUIDO: un punto justo sobre el borde de un agujero
  // sigue estando adentro del polígono. Es la misma asimetría que hace turf.
  for (let i = 1; i < anillos.length; i++) {
    if (enAnillo(pt, anillos[i], true)) return false;
  }
  return true;
}

/**
 * Rayo horizontal y paridad de cruces, con el borde resuelto aparte.
 *
 * `bordeAfuera` es el `ignoreBoundary` de turf: qué contestar cuando el punto cae exactamente sobre
 * un lado. La comparación es de igualdad exacta entre flotantes, igual que el original — sirve para
 * un vértice tipeado a mano, no para un punto geocodificado, que nunca cae justo. No se le puso una
 * tolerancia a propósito: una tolerancia en grados es una distancia distinta según la latitud, y
 * acá se estaría inventando un margen que el mapa que Bruno dibuja no tiene.
 */
function enAnillo(pt, anillo, bordeAfuera) {
  if (!Array.isArray(anillo) || anillo.length < 3) return false;
  const [x, y] = pt;
  let ring = anillo;
  const primero = ring[0];
  const ultimo = ring[ring.length - 1];
  if (primero[0] === ultimo[0] && primero[1] === ultimo[1]) ring = ring.slice(0, -1);

  let adentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const sobreElLado =
      y * (xi - xj) + yi * (xj - x) + yj * (x - xi) === 0 &&
      (xi - x) * (xj - x) <= 0 &&
      (yi - y) * (yj - y) <= 0;
    if (sobreElLado) return !bordeAfuera;

    const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (cruza) adentro = !adentro;
  }
  return adentro;
}

/**
 * Todas las zonas que contienen el punto, en el orden en que vinieron.
 *
 * Se expone entera —y no sólo la ganadora— porque la superposición es un hecho del mapa, no un
 * error: las zonas se dibujan a mano y una encima de otra es como se resuelve "Fisherton, pero la
 * parte de allá sale más". Quién gana lo decide `precioSugerido`.
 */
export function zonasDelPunto(lat, lng, zonas) {
  if (!Array.isArray(zonas)) return [];
  return zonas.filter((z) => z && puntoEnPoligono(lat, lng, z.poligono));
}

/**
 * **El precio que la pantalla propone para esa dirección.** Devuelve siempre uno de cuatro estados:
 *
 * - `no_vamos` — cae en una zona de exclusión. Gana sobre cualquier servicio, tenga la prioridad que
 *   tenga: la exclusión existe justamente para tapar un pedazo de una zona que sí se reparte.
 * - `sugerido` — una sola respuesta posible. Viene con `precio` y con la `zona`, que es lo que se le
 *   muestra a quien confirma: un precio sin el nombre de la zona no se puede revisar de un vistazo.
 * - `ambigua` — dos o más zonas empatadas en prioridad que **cobran distinto**. No devuelve precio a
 *   propósito (ver el encabezado). Empatadas con el mismo precio no es ambigüedad: el número es uno
 *   solo y se sugiere igual.
 * - `sin_zona` — no cae en ninguna. Es lo que va a pasar con cada dirección de afuera del mapa y con
 *   cada geocodificación que salga mal, y está bien que sea así: sin precio, mandar el envío a un
 *   día ya está bloqueado.
 *
 * 🔑 **`zonas` son siempre TODAS las que están cargadas.** Filtrar antes por marca o por localidad
 * daría un precio distinto según quién pregunte, y el mapa no sabe de marcas: el cadete sale con la
 * misma moto para las dos.
 */
export function precioSugerido(lat, lng, zonas) {
  const caen = zonasDelPunto(lat, lng, zonas);

  const excluida = caen.find((z) => z.tipo === 'exclusion');
  if (excluida) return { estado: 'no_vamos', precio: null, zona: excluida, zonas: caen };

  const servicios = caen.filter((z) => z.tipo === 'servicio');
  if (!servicios.length) return { estado: 'sin_zona', precio: null, zona: null, zonas: caen };

  const maxima = Math.max(...servicios.map((z) => prioridadDe(z)));
  const candidatas = servicios.filter((z) => prioridadDe(z) === maxima);
  const precios = new Set(candidatas.map((z) => z.precio));
  if (precios.size > 1) {
    return { estado: 'ambigua', precio: null, zona: null, zonas: candidatas };
  }

  return { estado: 'sugerido', precio: candidatas[0].precio, zona: candidatas[0], zonas: caen };
}

/** Sin prioridad escrita, 1. Es lo que pone el mapa cuando no se toca el campo. */
function prioridadDe(zona) {
  const n = Number(zona && zona.prioridad);
  return Number.isFinite(n) ? n : 1;
}

/**
 * **Traduce el JSON que exporta el mapa a las zonas que guarda la base.**
 *
 * El export es una lista de `{ meta, feature }` con las etiquetas del editor en inglés
 * (`service` / `exclude`). Acá se normaliza a lo que usa el resto del código, y se aprovecha el
 * único momento en que alguien está mirando: **una zona con un problema no entra**, y sale listada
 * en `problemas` con qué arreglarle en el mapa.
 *
 * 🔴 **Un servicio sin precio válido es el caso que justifica todo esto.** Si entrara con `0` o con
 * `NaN`, la pantalla propondría "$0" para un barrio entero, y `monto_envio` en cero **no significa
 * "no se cobra"** en ningún lado de esta sección: significa que el reparto salió gratis, que es
 * mentira y es plata que el cadete cobra igual. Que la zona falte es visible —esas direcciones
 * quedan sin precio y sin poder agendarse—; que valga cero, no.
 *
 * Devuelve `{ zonas, problemas }`. El export vacío da `{ zonas: [], problemas: [] }`: no tener zonas
 * no es un error, es no haber importado todavía.
 */
export function zonasDesdeExport(crudo) {
  const zonas = [];
  const problemas = [];
  if (!Array.isArray(crudo)) return { zonas, problemas: [{ zona: '(archivo)', motivo: 'El archivo no es una lista de zonas' }] };

  crudo.forEach((item, i) => {
    const meta = (item && item.meta) || {};
    const nombre = String(meta.name || '').trim();
    const donde = nombre || `zona #${i + 1}`;

    const geometria = item && item.feature && item.feature.geometry;
    const tipoGeo = geometria && geometria.type;
    if (tipoGeo !== 'Polygon' && tipoGeo !== 'MultiPolygon') {
      problemas.push({ zona: donde, motivo: 'No tiene polígono dibujado' });
      return;
    }
    if (!nombre) {
      problemas.push({ zona: donde, motivo: 'No tiene nombre, y el nombre es lo que se muestra al confirmar el precio' });
      return;
    }

    if (meta.type === 'exclude') {
      zonas.push({ nombre, tipo: 'exclusion', precio: null, prioridad: prioridadDe({ prioridad: meta.priority }), poligono: geometria });
      return;
    }
    if (meta.type !== 'service') {
      problemas.push({ zona: donde, motivo: `Tipo desconocido: ${JSON.stringify(meta.type)}` });
      return;
    }

    const precio = Number(meta.price);
    if (!Number.isFinite(precio) || precio <= 0) {
      problemas.push({ zona: donde, motivo: 'No tiene precio, o es cero' });
      return;
    }

    zonas.push({ nombre, tipo: 'servicio', precio, prioridad: prioridadDe({ prioridad: meta.priority }), poligono: geometria });
  });

  return { zonas, problemas };
}
