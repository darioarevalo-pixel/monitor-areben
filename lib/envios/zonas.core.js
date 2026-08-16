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

import { TURNOS } from './reglas.core.js';

/**
 * Lo que la pantalla necesita de una zona. `poligono` viene entero: es lo que se evalúa.
 *
 * ⚠️ Vive acá y no en el handler por lo mismo que `CAMPOS` y `CAMPOS_CUENTA` viven en
 * `reglas.core.js`: una columna que falta en el `select` llega `undefined` a la pantalla, **nada
 * falla**, y el dato simplemente no está. Es el modo de falla que ya se comió el «No cobré» del
 * cadete durante días, y en el handler no se puede afirmar con un test.
 */
export const CAMPOS_ZONA =
  'id, nombre, tipo, precio, prioridad, coordinar, dias, turnos, poligono, autor, created_at, updated_at';

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
 * `opciones.ajuste` suma esa cantidad a cada precio de servicio. No es un capricho: así es como se
 * mueven estos precios — entre el mapa de abril y el de junio hay exactamente **$1.000 de
 * diferencia en las dieciséis zonas**. Tipear dieciséis números para reproducir una suma es la
 * forma de equivocarse en uno solo y no notarlo nunca. El ajuste se aplica ANTES de validar, así
 * que un archivo viejo con precios que quedaron en cero sigue siendo rechazado.
 *
 * Devuelve `{ zonas, problemas }`. El export vacío da `{ zonas: [], problemas: [] }`: no tener zonas
 * no es un error, es no haber importado todavía.
 */
export function zonasDesdeExport(crudo, opciones = {}) {
  const ajuste = Number(opciones.ajuste) || 0;
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

    // 🔴 El precio del archivo se valida ANTES de sumarle el ajuste, y no después. Con un aumento
    // de $1.000 encima, una zona que vino en cero —que es un defecto del archivo— pasaría a valer
    // $1.000: un número plausible, inventado, y para un barrio entero. El ajuste mueve precios que
    // existen; no crea el que falta.
    const base = Number(meta.price);
    if (!Number.isFinite(base) || base <= 0) {
      problemas.push({ zona: donde, motivo: 'No tiene precio, o es cero' });
      return;
    }
    const precio = base + ajuste;
    if (!(precio > 0)) {
      problemas.push({ zona: donde, motivo: `Con el ajuste de $${ajuste} el precio queda en $${precio}` });
      return;
    }

    zonas.push({ nombre, tipo: 'servicio', precio, prioridad: prioridadDe({ prioridad: meta.priority }), poligono: geometria });
  });

  return { zonas, problemas };
}

/**
 * **Qué va a pasar si se importa este archivo, antes de escribir nada.**
 *
 * Existe porque importar es la única operación de esta pantalla que puede pisar trabajo ajeno, y
 * porque la regla que la hace segura no se ve mirando el resultado:
 *
 *     la GEOMETRÍA manda desde el MAPA — se dibuja en el HTML y el archivo la actualiza siempre
 *     el PRECIO manda desde la APP     — el archivo sólo lo pone cuando la zona es NUEVA
 *
 * 🔴 Sin esa asimetría, corregir un polígono en el mapa y re-importar **revertiría todos los
 * precios** al valor que el JSON tenía el día que se exportó, en silencio y de a dieciséis. El
 * aumento de mil pesos se perdería por corregir una zona.
 *
 * `coordinar`, `dias` y `turnos` tampoco viajan en el archivo —el mapa no los conoce— así que se
 * respetan igual que el precio.
 *
 * Una zona que está en la base y **no** viene en el archivo no se borra: se informa. Borrarla deja
 * a esas direcciones sin precio, y eso se descubre recién cuando alguien no puede agendar un envío.
 *
 * Devuelve `{ nuevas, actualizadas, iguales, ausentes, problemas }`. Cada entrada de `actualizadas`
 * trae `cambios`, que es lo que la pantalla lista para que se pueda confirmar con los ojos.
 */
export function planDeImportacion(crudo, actuales, opciones = {}) {
  const { zonas, problemas } = zonasDesdeExport(crudo, opciones);
  const previas = new Map((Array.isArray(actuales) ? actuales : []).map((z) => [clave(z.nombre), z]));

  const nuevas = [];
  const actualizadas = [];
  const iguales = [];

  for (const z of zonas) {
    const previa = previas.get(clave(z.nombre));
    if (!previa) {
      nuevas.push(z);
      continue;
    }
    previas.delete(clave(z.nombre));

    const cambios = [];
    if (JSON.stringify(previa.poligono) !== JSON.stringify(z.poligono)) cambios.push('el dibujo');
    if (previa.tipo !== z.tipo) cambios.push(`pasa a ${z.tipo === 'exclusion' ? 'NO VAMOS' : 'zona con precio'}`);
    if (prioridadDe(previa) !== prioridadDe(z)) cambios.push('la prioridad');

    if (!cambios.length) {
      iguales.push(previa);
      continue;
    }
    actualizadas.push({
      id: previa.id,
      nombre: previa.nombre,
      cambios,
      // Lo del archivo: dibujo, tipo y prioridad.
      poligono: z.poligono,
      tipo: z.tipo,
      prioridad: z.prioridad,
      // Lo de la app, que el archivo no pisa. Salvo que el tipo pase a exclusión, donde el precio
      // TIENE que irse: una zona a la que no vamos no puede seguir cobrando (lo rechaza el check).
      precio: z.tipo === 'exclusion' ? null : previa.precio,
      coordinar: previa.coordinar,
      dias: previa.dias,
      turnos: previa.turnos,
    });
  }

  return { nuevas, actualizadas, iguales, ausentes: [...previas.values()], problemas };
}

const clave = (nombre) => String(nombre || '').trim().toLowerCase();

/**
 * **¿Esa zona sale ese día y en ese turno?** `null` en `dias` o `turnos` es "sin restricción", que
 * es el caso de quince de las dieciséis.
 *
 * 🔑 Se guardan y se preguntan los **dos**, aunque hoy digan lo mismo. El cartel de Funes dice
 * "sólo martes y jueves a la mañana" y hoy martes y jueves son justo los únicos días con turno
 * mañana (`TURNOS_POR_DIA`), así que cualquiera de las dos condiciones bastaría — hasta que la
 * grilla cambie. Deducir una de la otra convertiría un cambio de grilla en un envío a Funes
 * agendado un día que la moto no va para allá.
 *
 * `dia` es `getDay()`: 0 domingo.
 */
export function zonaSaleEse(zona, dia, turno) {
  if (!zona) return true;
  if (Array.isArray(zona.dias) && zona.dias.length && !zona.dias.includes(Number(dia))) return false;
  if (Array.isArray(zona.turnos) && zona.turnos.length && !zona.turnos.includes(turno)) return false;
  return true;
}

/**
 * Lo que el handler exige antes de escribir una zona.
 *
 * Mismo criterio que `validarEnvio`: la base tiene los mismos `check`, pero un error de constraint
 * llega como un 500 críptico en vez de decir qué campo está mal — y acá el campo que se puede
 * escribir mal es el precio de un barrio entero.
 *
 * Devuelve un array de problemas; vacío es que está bien.
 */
export function validarZona(zona) {
  const malos = [];
  const z = zona || {};
  if (!String(z.nombre || '').trim()) malos.push('nombre: hace falta, es lo que se muestra al confirmar el precio');
  if (z.tipo !== 'servicio' && z.tipo !== 'exclusion') malos.push(`tipo: "${z.tipo}" no existe (servicio o exclusion)`);

  const precio = Number(z.precio);
  if (z.tipo === 'servicio') {
    if (!Number.isFinite(precio) || precio <= 0) malos.push('precio: una zona de servicio tiene que tener precio, y mayor que cero');
  } else if (z.precio !== null && z.precio !== undefined) {
    malos.push('precio: una zona de exclusión no cobra nada, va sin precio');
  }

  if (z.prioridad !== undefined && z.prioridad !== null && !Number.isInteger(Number(z.prioridad))) {
    malos.push('prioridad: tiene que ser un número entero');
  }
  if (z.dias !== undefined && z.dias !== null) {
    if (!Array.isArray(z.dias) || z.dias.some((d) => !Number.isInteger(Number(d)) || d < 0 || d > 6)) {
      malos.push('dias: son números del 0 (domingo) al 6');
    }
  }
  if (z.turnos !== undefined && z.turnos !== null) {
    if (!Array.isArray(z.turnos) || z.turnos.some((t) => !TURNOS.includes(t))) {
      malos.push(`turnos: sólo ${TURNOS.join(' o ')}`);
    }
  }

  const tipoGeo = z.poligono && z.poligono.type;
  if (tipoGeo !== 'Polygon' && tipoGeo !== 'MultiPolygon') malos.push('poligono: falta el dibujo, o no es un polígono');

  return malos;
}
