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
 * **Qué localidad nombra cada código postal al que llega la moto.**
 *
 * Es la misma lista de siempre —`CP_DE_REPARTO` de `core.ts` sale de acá, no al revés— con el nombre
 * que antes vivía en un comentario al costado. Se corrige editando estas seis líneas, no con una
 * migración: el mapa de reparto cambia una vez por año.
 *
 * 🔑 **Los nombres van como los escribe Georef, con tilde**, porque son los que se le mandan.
 * ⚠️ **2000 es Rosario entera, Fisherton incluido**: el CP no parte Rosario adentro y por eso no
 * puede decidir entre $3.000 y $4.300. Lo que sí decide —y es donde está la plata— es Rosario contra
 * Funes, Roldán o Villa Gobernador Gálvez.
 */
export const LOCALIDAD_DEL_CP = {
  '2000': 'Rosario',
  '2121': 'Pérez',
  '2124': 'Villa Gobernador Gálvez',
  '2132': 'Funes',
  '2134': 'Roldán',
  '2152': 'Granadero Baigorria',
};

/**
 * Las formas en que las clientas escriben esas seis localidades en el checkout.
 *
 * Medido sobre las 12.552 filas de `clientes`: `vgg`, `Rosario - Rosario` y `rosaroo` son reales.
 * ⛔ **Acá no entran barrios.** «Centro», «Talleres» o «Fisherton» nombran un pedazo de Rosario, no
 * una localidad, y meterlos abre una lista que no termina nunca y que Georef no necesita: sin
 * reconocer, la dirección viaja tal cual y todo sigue como hoy.
 */
const ALIAS_DE_LOCALIDAD = {
  rosario: 'Rosario',
  perez: 'Pérez',
  funes: 'Funes',
  roldan: 'Roldán',
  vgg: 'Villa Gobernador Gálvez',
  'villa gobernador galvez': 'Villa Gobernador Gálvez',
  'granadero baigorria': 'Granadero Baigorria',
  baigorria: 'Granadero Baigorria',
};

/** Sin tildes, sin puntuación y en minúscula: es texto tipeado en un checkout. */
function normalizar(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** La localidad que nombra el código postal, o `null` si no es uno de los seis. */
export function localidadDelCp(cp) {
  const limpio = String(cp == null ? '' : cp).replace(/\D/g, '').slice(0, 4);
  return LOCALIDAD_DEL_CP[limpio] || null;
}

/**
 * **¿Este texto nombra una de las seis localidades de reparto?** Devuelve el nombre canónico o `null`.
 *
 * Se parte por `/`, `-` y `,` antes de comparar, porque `"Rosario - Rosario"` es la forma más común
 * que manda Tienda Nube. 🔑 **Y se compara la pieza ENTERA, no si la contiene**: un `includes` haría
 * que `"San Martin de las Escobas"` —un pueblo real, a 100 km, que existe en prod— matcheara
 * cualquier cosa que se le parezca, y ése es justo el que tiene que salir `null` para que la
 * dirección viaje tal cual y termine, bien, afuera del mapa.
 *
 * Si dos piezas nombran localidades **distintas** devuelve `null`: nombrar dos es no nombrar ninguna.
 */
export function localidadReconocida(texto) {
  const nombres = new Set();
  for (const pieza of String(texto == null ? '' : texto).split(/[/,-]/)) {
    const n = ALIAS_DE_LOCALIDAD[normalizar(pieza)];
    if (n) nombres.add(n);
  }
  return nombres.size === 1 ? [...nombres][0] : null;
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
  localidad_dudosa: 'el código postal y la localidad no coinciden',
  no_ubicada: 'no se pudo ubicar',
  punto_impreciso: 'la calle sí, la altura no',
  sin_zona: 'fuera del mapa',
  no_vamos: 'no vamos a esa zona',
  ambigua: 'cae en dos zonas que cobran distinto',
};

/**
 * El motivo con los dos nombres puestos cuando el estado los tiene.
 *
 * 🔑 **«el código postal y la localidad no coinciden» no se puede trabajar; «el código postal dice
 * Villa Gobernador Gálvez y la dirección dice Rosario» sí**: dice exactamente qué mirar, y quien
 * cotiza resuelve en diez segundos lo que el sistema no puede resolver nunca. Es la misma razón por
 * la que `ambigua` viaja con los nombres de las dos zonas.
 */
export function motivoDeSugerencia(estado, extra) {
  const e = extra || {};
  if (estado === 'localidad_dudosa' && e.delCp && e.dicha) {
    return `el código postal dice ${e.delCp} y la dirección dice ${e.dicha}`;
  }
  return MOTIVO_SUGERENCIA[estado] || null;
}

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
 * # El código postal es la segunda señal, y va AL LADO de la localidad — nunca en su lugar
 *
 * 🔴 **Medido el 17-ago-2026 corriendo el camino real contra Georef vivo, con doce direcciones de
 * `clientes` donde el CP y la localidad se contradicen: tres salían con precio y las tres estaban
 * mal, siempre para el lado barato.** `Saenz peña 1813` con CP 2124 salía $5.300 de una zona de
 * Rosario y es Villa Gobernador Gálvez ($7.500); `Avenida Santa Fe 1283` (CP 2152, Granadero
 * Baigorria) y `9 De Julio 1236` (CP 2121, Pérez) salían **$4.000 de Zona Centro** siendo de dos
 * localidades que ni siquiera están dibujadas en el mapa. Como `tarifaCadete` es `monto_envio`, el
 * viaje largo se lo termina comiendo el cadete.
 *
 * ⇒ **Cuando los dos nombran una localidad de reparto y no es la misma, no se propone nada** y el
 * motivo dice cuáles son. No se elige un ganador porque **los dos mienten**: el CP lo tipea el
 * cliente y cae en 2000 por defecto —en prod hay una fila con CP 2000 y localidad «San Martin de las
 * Escobas», a 100 km—, y «Rosario» es como se llama en la calle a todo el Gran Rosario.
 *
 * ⚠️ **Por eso el CP no puede reemplazar a la localidad, sólo corroborarla**: medido, esa misma fila
 * de Escobas hoy sale `sin_zona` —que es lo correcto, se va del mapa— y preguntando con la localidad
 * del CP saldría `no_ubicada`.
 *
 * 🔑 **Y cuando la localidad no nombra nada reconocible, el CP entra como REINTENTO, no como primera
 * respuesta.** `"Entre esmeralda y chacabuco"` vino así en una orden real y hace fallar la consulta
 * con la calle bien; el orden importa, porque preguntar primero con el texto tal cual es lo que deja
 * que un pueblo real que no es de reparto se vaya, bien, afuera del mapa. Recién si eso no ubica
 * nada se vuelve a preguntar con la localidad del CP: así el reintento **no puede pisar un punto
 * bueno**, sólo llenar un hueco. Es el mismo criterio de la escalera de variantes.
 *
 * Devuelve `{ estado }` cuando no se pregunta, o `{ intentos, localidad, reintento, limpia }`.
 */
export function consultaDe(envio) {
  const e = envio || {};
  const limpia = limpiarDireccion(e.direccion);
  if (!limpia) return { estado: 'sin_direccion' };

  const cruda = String(e.localidad == null ? '' : e.localidad).trim();
  if (!cruda) return { estado: 'sin_localidad', limpia };

  const dicha = localidadReconocida(cruda);
  const delCp = localidadDelCp(e.cp);
  if (dicha && delCp && dicha !== delCp) return { estado: 'localidad_dudosa', limpia, dicha, delCp };

  if (limpia.altura == null && !limpia.esquina) return { estado: 'sin_altura', limpia };

  const intentos = variantes(limpia);
  if (!intentos.length) return { estado: 'sin_direccion', limpia };

  // Reconocida se manda **canónica**: medido, `"vgg"` no lo entiende Georef y
  // `"Villa Gobernador Gálvez"` sí, y `"Rosario - Rosario"` es la forma que más manda Tienda Nube.
  return { intentos, localidad: dicha || cruda, reintento: dicha ? null : delCp, limpia };
}

/**
 * **Quiénes van a la segunda vuelta, y preguntando qué.**
 *
 * 🔴 **Vive acá y no en el handler a propósito.** El mutante que importa de todo el reintento es el
 * de orden —correrlo antes de la primera vuelta, o correrlo también para las que ya resolvieron— y
 * los dos dan una tanda que anda, contesta 200 y devuelve precios plausibles: lo único que cambia es
 * que el punto sale de la localidad del código postal en vez de la que escribió la clienta. En
 * `api/_envios.js` eso no se puede afirmar; acá es una función pura de dos argumentos.
 *
 * `puntos` es lo que devolvió `geocodificarEnEscalera`: la que ya tiene `resultado` **no se vuelve a
 * preguntar nunca**, tenga el CP que tenga.
 */
export function pedidosDelReintento(pedidos, puntos) {
  return (pedidos || [])
    .filter((p) => p.reintento && !((puntos && puntos.get(p.clave)) || {}).resultado)
    .map((p) => ({ ...p, localidad: p.reintento }));
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
