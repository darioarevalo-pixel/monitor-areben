/**
 * **De la dirección tipeada por una clienta al punto que el mapa de zonas puede evaluar.**
 *
 * `zonas.core.js` contesta "en qué zona cae este punto y cuánto sale". Lo que falta para poder
 * preguntárselo es el punto, porque la orden de Tienda Nube **no trae coordenadas**: trae un texto
 * libre que escribió la clienta en el checkout ("Riccheri 1152 4 piso 3", "Paraguay 777 Piso 14
 * Centro (2000)", "Rioja y Corrientes"). Este archivo es la traducción, y sobre todo **el candado
 * que decide cuándo NO se traduce**.
 *
 * # Por qué el candado no puede vivir adentro del motor
 *
 * 🔴 **Georef contesta igual sin número de puerta**: le mandás "Cafferata" y te devuelve un punto
 * cualquiera de la calle entera, con la misma cara que si le hubieras dado la altura. Ese punto cae
 * adentro de alguna zona y `precioSugerido` propone un precio perfectamente plausible — **un punto es
 * un punto, el motor no tiene con qué distinguirlo**. Por eso la validación va acá, antes, y no allá.
 *
 * **Medido el 16-ago-2026 sobre 200 direcciones reales**: de las 100 sin número, **66 salían con
 * precio** si no se las frenaba, y `"(2000)"` —una dirección **vacía**, sólo el código postal— salía
 * **$4.800**, porque Georef la matcheó contra `PJE 2007`. Con el candado puesto, cero.
 *
 * # Por qué el candado es lo que hace segura la escalera de variantes
 *
 * 🔑 Georef es caprichoso con los prefijos y los nombres de pila: `Av Pellegrini` resuelve y
 * `Av San Martin` no; `Moreno 1192` sí y `Mariano Moreno 1192` no; `Alem 1517` sí y
 * `Leandro N. Alem 1517` no. La forma de recuperar esas es probar variantes en escalera.
 *
 * 🔴 **Y esa escalera, sola, EMPEORA las cosas**: al agregarle intentos, los puntos precisos subieron
 * de 92 a 95 y los precios inventados **de 30 a 68**, porque lo que más recupera son las calles
 * peladas — justo las que no hay que geocodificar. Con el candado adelante la escalera es ganancia
 * limpia: los intentos de más sólo pueden agregar puntos precisos, y los imprecisos se descartan.
 *
 * # Con calle y número resuelve el 95%
 *
 * De 100 direcciones con calle + altura —que es lo que manda Tienda Nube—: 93 con zona y precio,
 * 2 `sin_zona` correctas (afuera del mapa) y 3 que **se niegan** en vez de inventar. El candado
 * además atajó dos donde Georef había contestado **otra calle** (`Calle 1331 2983` → `CALLE 1335`),
 * porque al no ser la calle pedida contestó sin altura.
 *
 * # Por qué es `.js` y no `.ts`
 *
 * Igual que `reglas.core.js`, `portal.core.js` y `zonas.core.js`: lo lee `api/_envios.js`, que corre
 * en Node sin pasar por el compilador de Next. El candado tiene que ser **uno solo**: si la pantalla
 * tuviera su copia, alcanzaría con que una de las dos se afloje para que vuelva el precio inventado.
 */

import { precioSugerido } from './zonas.core.js';

/**
 * Los meses, para no confundir el número de una calle con la altura.
 *
 * 🔴 En Rosario hay calles que **empiezan con número** (9 de Julio, 27 de Febrero, 3 de Febrero,
 * 1º de Mayo). Cortar en "el primer número" manda `9` como nombre de calle y la dirección se pierde
 * entera — o peor, matchea otra cosa.
 */
const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';

/**
 * Cuántas formas distintas se le prueban a Georef como máximo.
 *
 * La escalera saca nombres de pila **de a uno** ("Olegario Victor Andrade 1961" son tres intentos),
 * así que el largo lo pone el nombre de la calle. El tope existe porque cada escalón es una vuelta de
 * consultas contra un servicio ajeno y gratis, y una dirección con veinte palabras —que es basura,
 * no una calle— no puede costar veinte vueltas para todos los demás.
 */
const MAX_INTENTOS = 5;

/**
 * **Saca "calle + altura" de un texto libre.** Devuelve `null` si no hay nada que geocodificar.
 *
 * Georef entiende `calle altura`, no una dirección con piso, barrio y código postal: mandada tal
 * cual resuelve el **47,5%** y cortada acá el **82,5%** (medido sobre las mismas 200).
 *
 * - `{ calle, altura, texto }` cuando hay número de puerta.
 * - `{ esquina: true, texto }` cuando es un cruce ("Rioja y Corrientes"): no tiene altura pero **sí
 *   es un punto exacto**, así que pasa el candado.
 * - `{ calle, altura: null }` cuando es una calle pelada: se devuelve —sirve para explicar qué se
 *   entendió— pero **no pasa el candado**.
 */
export function limpiarDireccion(cruda) {
  const s = String(cruda == null ? '' : cruda)
    .replace(/\(\s*\d{4}\s*\)/g, ' ') // el código postal entre paréntesis: "(2000)"
    .replace(/\s*[/,-]\s*rosario\b/gi, ' ') // la localidad pegada al final
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;

  const tk = s.split(' ');
  for (let i = 0; i < tk.length; i++) {
    if (!/^\d{1,5}$/.test(tk[i])) continue;

    // "9 DE julio": el número es parte del nombre de la calle, no la altura.
    const sig = (tk[i + 1] || '').toLowerCase().replace(/[.,]/g, '');
    const sig2 = (tk[i + 2] || '').toLowerCase().replace(/[.,]/g, '');
    if (sig === 'de' && new RegExp(`^(${MESES})$`).test(sig2)) continue;

    // Sin una sola letra antes del número no hay calle: "1776 5", "2499". Son las direcciones que
    // quedaron partidas al copiarlas de otro lado, y mandarlas así es pedirle a Georef que invente.
    const calle = tk.slice(0, i).join(' ').trim();
    if (!/[a-záéíóúñ]/i.test(calle)) return null;

    return { texto: `${calle} ${tk[i]}`, calle, altura: Number(tk[i]), esquina: false };
  }

  const esq = s.match(/^(.+?)\s+(?:y|esq\.?|esquina)\s+(.+)$/i);
  if (esq) return { texto: `${esq[1].trim()} y ${esq[2].trim()}`, calle: null, altura: null, esquina: true };
  return { texto: s, calle: s, altura: null, esquina: false };
}

/**
 * **Las formas que se le van a probar a Georef, en orden**, de la más fiel a la más despojada.
 *
 * Los nombres de pila se sacan **de a uno**: sacar sólo el primero no alcanza —"Leandro N. Alem
 * 1517" únicamente resuelve como "Alem 1517"—. Se prueban en escalera y se para en la primera que
 * conteste, así que la más fiel siempre gana.
 *
 * ⚠️ **Una esquina no se despoja**: sacarle palabras a "Rioja y Corrientes" deja "y Corrientes", que
 * no es un cruce sino otra consulta, y la respuesta sería un punto de otra calle.
 */
export function variantes(limpia) {
  if (!limpia || !limpia.texto) return [];
  if (limpia.esquina) return [limpia.texto];

  const v = [limpia.texto];
  const sinPrefijo = limpia.texto.replace(
    /^(av|avda|avenida|bv|blvd|bulevar|boulevard|calle|pje|pasaje|dr|dra|gral|pte|presidente)\.?\s+/i,
    '',
  );
  if (sinPrefijo !== limpia.texto) v.push(sinPrefijo);

  const base = sinPrefijo.split(' ');
  for (let i = 1; i <= base.length - 2; i++) v.push(base.slice(i).join(' '));

  return [...new Set(v)].slice(0, MAX_INTENTOS);
}

/**
 * **Cómo se le dice a quien cotiza por qué no hay precio.** Una sola redacción para el handler y la
 * pantalla: el motivo se muestra al lado del campo vacío, y es lo único que le explica a alguien por
 * qué esta fila se tipea a mano y la de arriba no.
 */
export const MOTIVO_SUGERENCIA = {
  sin_direccion: 'sin dirección',
  sin_localidad: 'falta la localidad',
  sin_altura: 'falta la altura',
  no_ubicada: 'no se pudo ubicar',
  punto_impreciso: 'la calle sí, la altura no',
  sin_zona: 'fuera del mapa',
  no_vamos: 'no vamos a esa zona',
  ambigua: 'cae en dos zonas que cobran distinto',
};

/**
 * **El candado, primera mitad: qué se le pregunta a Georef y qué ni se le pregunta.**
 *
 * Devuelve `{ estado }` cuando la fila no se puede geocodificar —y ahí termina, sin gastar una
 * consulta— o `{ intentos, localidad, limpia }` cuando sí.
 *
 * 🔴 **Sin localidad tampoco se pregunta.** Georef necesita saber el pueblo, y la diferencia entre
 * Rosario ($4.300) y Funes ($9.000) la decide justamente ese dato: preguntar sólo por la provincia
 * haría que una calle de Funes matchee su homónima de Rosario y devuelva un punto **preciso** en la
 * zona equivocada. Ése es el único error que este módulo no puede permitirse, porque sale plausible.
 *
 * ⚠️ Por lo mismo, cuando la localidad es un disparate —`"Entre esmeralda y chacabuco"` vino así en
 * una orden real— **no se reintenta sin ella**: la consulta falla, la fila queda sin propuesta y se
 * tipea a mano. Reintentar sin localidad recupera esa dirección y arruina las de Funes.
 */
export function consultaDe(envio) {
  const e = envio || {};
  const limpia = limpiarDireccion(e.direccion);
  if (!limpia) return { estado: 'sin_direccion' };

  const localidad = String(e.localidad == null ? '' : e.localidad).trim();
  if (!localidad) return { estado: 'sin_localidad', limpia };

  if (limpia.altura == null && !limpia.esquina) return { estado: 'sin_altura', limpia };

  const intentos = variantes(limpia);
  if (!intentos.length) return { estado: 'sin_direccion', limpia };

  return { intentos, localidad, limpia };
}

/**
 * **El candado, segunda mitad: el punto que contestó Georef, ¿es exacto?**
 *
 * Se le pidió calle y altura, pero contesta igual cuando encuentra sólo la calle — y devuelve la
 * geometría de la calle entera con un punto adentro. La respuesta trae `altura.valor` **sólo si
 * ubicó el número**, y la nomenclatura dice `(ESQUINA …)` cuando resolvió un cruce. Todo lo demás es
 * un punto de la cuadra que le tocó.
 *
 * Devuelve `null` si no hay punto usable.
 *
 * 🔴 **`nomenclatura` NO se muestra tal cual: su campo del medio es el DEPARTAMENTO, no la
 * localidad.** Roldán pertenece al departamento San Lorenzo, así que una dirección de Roldán
 * perfectamente resuelta vuelve como `"TUCUMAN 963, San Lorenzo, Santa Fe"` — y quien la lee entiende
 * que el geocoder se fue a otro pueblo. Pasó de verdad: en la revisión del mapa se marcaron como
 * equivocadas dos direcciones que estaban bien, **o sea que el cartel llegó a corromper la medición
 * que se estaba haciendo con los ojos**. Lo mismo con Funes, Pérez, Villa Gobernador Gálvez, Ibarlucea
 * y Soldini, que son del departamento Rosario y volvían diciendo «Rosario». Por eso `encontrado` se
 * arma con `localidad_censal`, y `nomenclatura` queda sólo para detectar la esquina.
 */
export function puntoDeGeoref(direccion) {
  const d = direccion || {};
  const u = d.ubicacion || {};
  const lat = Number(u.lat);
  const lng = Number(u.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const nomenclatura = String(d.nomenclatura || '');
  const altura = d.altura && d.altura.valor != null ? Number(d.altura.valor) : null;
  const esquina = /\(ESQUINA/i.test(nomenclatura);

  return {
    lat,
    lng,
    altura,
    esquina,
    preciso: Boolean(altura || esquina),
    nomenclatura,
    localidad: (d.localidad_censal && d.localidad_censal.nombre) || null,
    encontrado: comoSeLee(nomenclatura, d),
  };
}

/**
 * La misma dirección que encontró Georef, pero con la **localidad** en vez del departamento.
 *
 * Se corrige por posición y no rearmando la calle desde `calle.nombre`: así la esquina conserva su
 * cruce (`RIOJA (ESQUINA AV CORRIENTES)`), que es justo lo que se perdería al rearmarla. Si la
 * nomenclatura no tiene la forma esperada, se devuelve tal cual: un texto raro es mejor que uno
 * inventado.
 */
function comoSeLee(nomenclatura, d) {
  const localidad = d.localidad_censal && d.localidad_censal.nombre;
  const provincia = d.provincia && d.provincia.nombre;
  const partes = nomenclatura.split(',').map((s) => s.trim());
  if (partes.length < 3 || !localidad || !provincia) return nomenclatura;
  return `${partes.slice(0, partes.length - 2).join(', ')}, ${localidad}, ${provincia}`;
}

/**
 * **Lo que contestó Georef, puesto al lado de lo que se le preguntó.**
 *
 * 🔴 **El defecto que esta función existe para hacer imposible es el peor de todo el módulo**: la
 * consulta por lote devuelve una lista paralela a la que se mandó, y si alguna vez viniera con un
 * elemento de menos, todas las direcciones a partir de ahí quedarían **corridas un lugar** — cada
 * clienta con el punto de la siguiente, cada una con un precio preciso, plausible y ajeno. No hay
 * forma de verlo mirando la pantalla. Por eso, largo distinto **tira error** en vez de acomodar como
 * se pueda: quedarse sin propuestas es barato, dieciséis precios cruzados no.
 *
 * Devuelve un array del mismo largo, con la primera dirección de cada resultado o `null`.
 */
export function alinear(consultas, resultados) {
  const pedidas = Array.isArray(consultas) ? consultas.length : 0;
  if (!Array.isArray(resultados) || resultados.length !== pedidas) {
    throw new Error(
      `El geocoder contestó ${Array.isArray(resultados) ? resultados.length : 'nada'} para ${pedidas} direcciones.`,
    );
  }
  return resultados.map((r) => {
    const lista = r && Array.isArray(r.direcciones) ? r.direcciones : [];
    return lista[0] || null;
  });
}

/**
 * **La sugerencia final para una fila**: el precio que se le propone a quien cotiza, o por qué no.
 *
 * `resultado` es lo que contestó Georef para esa dirección (la primera de `direcciones`), o `null`
 * si ninguna de las variantes resolvió.
 *
 * 🔑 **El nombre de la zona viaja siempre al lado del precio.** "Zona 7 — $4.500" se puede revisar de
 * un vistazo; "$4.500" solo, no. Es la misma razón por la que `precioSugerido` devuelve la zona.
 *
 * 🔑 **`estado: 'sugerido'` es el único que trae precio.** Los otros seis son la parte que importa:
 * cada uno deja la fila exactamente como está hoy —sin precio, bloqueada para mandar a un día— y con
 * un motivo escrito. Eso es barato. Un precio de la zona de al lado no lo caza nadie.
 */
export function sugerenciaDePunto(resultado, zonas) {
  const punto = puntoDeGeoref(resultado);
  if (!punto) return { estado: 'no_ubicada', precio: null, zona: null, punto: null };
  if (!punto.preciso) {
    return { estado: 'punto_impreciso', precio: null, zona: null, punto: null, encontrado: punto.encontrado };
  }

  const p = precioSugerido(punto.lat, punto.lng, zonas);
  return {
    estado: p.estado,
    precio: p.precio,
    zona: p.zona ? { id: p.zona.id, nombre: p.zona.nombre, coordinar: !!p.zona.coordinar } : null,
    // Las empatadas se nombran igual que la ganadora: sin los dos nombres, "cae en dos zonas" no le
    // dice a nadie cuáles son ni cuál tendría que ganar en el mapa.
    zonas: (p.zonas || []).map((z) => z.nombre),
    punto: { lat: punto.lat, lng: punto.lng },
    encontrado: punto.encontrado,
  };
}
