/**
 * El portal del cadete: lo que decide qué sale a internet.
 *
 * # Por qué es `.js` y no `.ts`
 *
 * Mismo motivo que `reglas.core.js`: lo importa `api/_cadete.js`, que corre en Node sin pasar por el
 * compilador de Next. Y acá pesa más que en ningún lado — **lo que el cadete ve tiene que ser la
 * misma cuenta que dice el papel y que muestra la pantalla interna**, o un día el ticket manda a
 * cobrar algo que el portal da por saldado, con la clienta esperando en la puerta.
 *
 * # Qué se defiende acá
 *
 * Esto es lo único de Envíos abierto a internet, y lo que hay del otro lado no es plata: son
 * **nombres, direcciones y teléfonos de clientas**. Las tres barreras, en orden:
 *
 *   1. `fechaQueSePuedeLeer` — el link sirve para esta semana, no para la agenda entera. Sin esto,
 *      un link filtrado devuelve todas las direcciones que pasaron por la moto.
 *   2. `paraElCadete` / `paraElCadeteFuturo` — la salida se arma campo por campo. Nunca `{...fila}`:
 *      `datos` tiene la orden de Tienda Nube completa (mail, total, medio de pago, ítems).
 *   3. `ACCIONES` — la escritura es una lista cerrada de cuatro parches fijos. El body no se copia.
 *
 * ⚠️ **Lo que la ventana de 7 días sí entrega**: nombre de la clienta y localidad de los envíos que
 * vienen. Se decidió a cambio de que el cadete pueda organizarse, y lo que la acota es que la
 * dirección exacta y el teléfono **no salen hasta el día del reparto** (ver `paraElCadeteFuturo`).
 */

import { aCobrar, envioSaldado, ESTADO_LABEL } from './reglas.core.js';

/**
 * La ventana del link, en días alrededor de hoy.
 *
 *   · **Leer** va de ayer a la semana que viene: el cadete quiere saber qué le espera.
 *   · **Escribir** sigue siendo ±1 y no se mueve. Ver `fechaQueSePuedeEscribir`.
 */
const DIAS_ATRAS = 1;
const DIAS_ADELANTE = 7;
const DIAS_DE_GRACIA = 1;

const esFechaIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

/** Los días entre dos fechas ISO, sin husos: se comparan a mediodía UTC para que no muerda el borde. */
function distanciaEnDias(a, b) {
  const ms = Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`);
  return Math.round(ms / 86400000);
}

/** Sumar días a una fecha ISO, por el mediodía UTC para no pisar el borde. */
function sumarDiasIso(fecha, dias) {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
}

/**
 * El día de hoy **en Argentina**, calculado en el servidor.
 *
 * 🔴 **El servidor corre en UTC, y eso le vaciaba la hoja al cadete a las 21:00.** `new Date()
 * .toISOString()` devuelve el día UTC: de 21:00 a 24:00 de acá ya es mañana allá, así que el portal
 * saltaba al día siguiente —vacío— en el medio del turno tarde, y los toques de «Entregado» iban a
 * parar a los envíos de mañana. El ±1 existía para esto pero no alcanzaba: sólo se ejerce cuando
 * alguien pide una fecha, y la pantalla nunca pedía ninguna.
 *
 * 🔑 **Offset fijo y no `toLocaleDateString`**, aunque el nombre de la zona se lea mejor: así es una
 * función pura de un número y el test prueba exactamente lo que corre en prod. Con la zona horaria,
 * un runtime sin la tabla de husos completa devuelve otro formato **en silencio**, y eso aparecería
 * como un 400 en la calle. Argentina no cambia la hora desde 2009; si vuelve, se cambia acá.
 */
const OFFSET_AR_MS = -3 * 3600000;

export function diaArgentino(ahoraMs) {
  return new Date(ahoraMs + OFFSET_AR_MS).toISOString().slice(0, 10);
}

/**
 * Qué día puede **leer** el portal: de ayer a la semana que viene.
 *
 * 🔴 **Es la barrera más importante de todo el módulo.** Sin esto, cualquiera con el link pide
 * `?fecha=2026-01-05` y se lleva la agenda entera: nombre, dirección y teléfono de cada clienta que
 * pasó por la moto. La ventana es corta y **asimétrica a propósito** — el historial es justo lo que
 * un link filtrado nunca puede dar, así que para atrás sólo llega el día de gracia del huso.
 *
 * Sin fecha pedida, contesta el día de hoy: es lo que hace que el link pelado funcione.
 */
export function fechaQueSePuedeLeer(pedida, hoyAR) {
  if (!esFechaIso(hoyAR)) return null;
  if (pedida == null || pedida === '') return hoyAR;
  if (!esFechaIso(pedida)) return null;
  const d = distanciaEnDias(pedida, hoyAR);
  return d >= -DIAS_ATRAS && d <= DIAS_ADELANTE ? pedida : null;
}

/**
 * Qué día puede **escribir** el portal: hoy, y ayer por el borde del huso.
 *
 * 🔴 **Va aparte de la lectura y no como un parámetro.** Un flag mal pasado en un llamador nuevo
 * dejaría marcar entregada la semana entera desde un link filtrado; dos funciones con nombres
 * distintos no se confunden en una llamada.
 *
 * El ±1 tampoco es holgura acá: a las 00:30 el cadete todavía está cerrando el reparto de ayer.
 */
export function fechaQueSePuedeEscribir(pedida, hoyAR) {
  if (!esFechaIso(hoyAR)) return null;
  if (pedida == null || pedida === '') return hoyAR;
  if (!esFechaIso(pedida)) return null;
  return Math.abs(distanciaEnDias(pedida, hoyAR)) <= DIAS_DE_GRACIA ? pedida : null;
}

/** El rango de días que el portal puede mirar, para pedirle a la base los que tienen envíos. */
export function rangoDeLectura(hoyAR) {
  return { desde: sumarDiasIso(hoyAR, -DIAS_ATRAS), hasta: sumarDiasIso(hoyAR, DIAS_ADELANTE) };
}

/**
 * El rótulo corto de un día, para los chips del teléfono: `lun 17-ago`.
 *
 * 🔑 **Lo arma el servidor.** El portal es público y su bundle se baja en la calle: importar el
 * `rotuloFecha` de la app arrastra el árbol del calendario y de Meta Ads a la pantalla del cadete.
 *
 * 🔴 Los arreglos van indexados por `getDay()`: **0 es domingo**. No se reordenan «para que arranquen
 * en lunes» — el corrimiento de un día no rompe nada visible y sale a la calle.
 */
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function rotuloCorto(fecha) {
  if (!esFechaIso(fecha)) return '';
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${DIAS_CORTOS[d.getUTCDay()]} ${d.getUTCDate()}-${MESES_CORTOS[d.getUTCMonth()]}`;
}

/**
 * Los días con envíos, contados y rotulados, para la fila de chips.
 *
 * 🔑 **Sólo los que tienen algo.** Una fila con los siete días de la semana, cinco de ellos vacíos,
 * es una fila que hay que leer entera para encontrar los dos que importan.
 */
export function diasConEnvios(fechas, hoyAR) {
  const cuenta = new Map();
  for (const f of fechas || []) {
    if (esFechaIso(f)) cuenta.set(f, (cuenta.get(f) || 0) + 1);
  }
  return [...cuenta.keys()]
    .sort()
    .map((fecha) => ({ fecha, cuantos: cuenta.get(fecha), rotulo: fecha === hoyAR ? 'Hoy' : rotuloCorto(fecha) }));
}

/**
 * Un envío de un día que **todavía no llegó**: para saber qué viene, no para ir a la puerta.
 *
 * 🔴 **Sin dirección, sin teléfono y sin la anotación.** Es lo que permite que el portal muestre la
 * semana sin que un link filtrado entregue siete días de direcciones en vez de uno. La anotación se
 * va con ellos porque «dejar en la portería del 3ºB» es media dirección.
 *
 * Tampoco lleva `id`: sin botones no hace falta, y un id es lo que haría falta para escribir.
 */
export function paraElCadeteFuturo(fila) {
  return {
    marca: fila.store,
    cliente: fila.cliente,
    localidad: fila.localidad,
    turno: fila.turno,
    estado: fila.estado,
    estadoTexto: ESTADO_LABEL[fila.estado] || fila.estado,
    // La plata, ya resuelta: cuánto pedir en esta puerta y por qué.
    aCobrar: aCobrar(fila),
    envioSaldado: envioSaldado(fila),
  };
}

/**
 * Un envío del día que se está repartiendo, visto desde la moto.
 *
 * 🔴 **Se arma campo por campo, y ese es todo el punto.** El mutante es `{...fila}` o un `select *`:
 * `datos` tiene la orden de Tienda Nube entera —mail de la clienta, total, medio de pago, cuotas,
 * ítems— y `vendedor`, `autor` y `cadete` son nombres de gente que trabaja acá. Nada de eso tiene
 * que ver con dejar un paquete en una puerta.
 *
 * 🔑 **Se construye ENCIMA de la forma flaca**, en vez de ser otra lista de campos al lado. Dos
 * listas armadas a mano divergen: alguien agrega un dato a ésta, se olvida de la otra, y la de
 * afuera queda mostrando de menos o —peor— la de adentro empieza a mostrar de más.
 *
 * 🔑 **`aCobrar` se calcula acá y no se manda `monto_envio` crudo.** Es la misma función que usa el
 * ticket impreso y la pantalla interna: si el portal hiciera su propia resta, el papel y el teléfono
 * podrían decir números distintos sobre la misma puerta.
 */
export function paraElCadete(fila) {
  return {
    ...paraElCadeteFuturo(fila),
    id: fila.id,
    orden: fila.orden_numero,
    direccion: fila.direccion,
    piso: fila.piso_depto,
    anotacion: fila.anotacion,
    telefono: fila.telefono,
    // `null` = el cadete todavía no dijo nada. No es `false`: "no cobré" es una respuesta.
    cobrado: fila.cobrado == null ? null : !!fila.cobrado,
  };
}

/**
 * El mensaje que el cadete le manda a la clienta antes de salir, ya escrito.
 *
 * 🔑 **Es el que ya mandan, no uno nuevo.** Lo escribían a mano en cada puerta, con el teléfono en
 * la calle: por eso arrancaba preguntando el nombre y la dirección — datos que el sistema **ya
 * tiene**—. Acá van puestos, así lo único que queda por preguntar es lo que de verdad falta: la
 * ubicación para el GPS y el piso.
 *
 * 🔑 **Se precarga, no se manda.** `wa.me` abre el chat con el texto escrito; enviarlo lo decide la
 * persona, que además puede corregirlo antes.
 *
 * 🔴 Sin `encodeURIComponent` el mensaje se corta en el primer `&` o `#`, y una anotación como
 * «timbre 2 # depto» lo dejaría a la mitad.
 */
export function mensajeParaLaPuerta(envio) {
  const marca = envio && envio.marca === 'zattia' ? 'Zattia' : 'BDI';
  const nombre = (envio && envio.cliente ? String(envio.cliente).trim().split(/\s+/)[0] : '') || '';
  const donde = [envio && envio.direccion, envio && envio.localidad].filter(Boolean).join(', ');
  return [
    `Hola${nombre ? ' ' + nombre : ''}! Somos Claudia y Jorge, los cadetes de ${marca}.`,
    donde ? `Te llevamos tu pedido a ${donde}.` : 'Te llevamos tu pedido.',
    '¿Me pasás la ubicación por acá para el GPS? Y si es piso o departamento, decime cuál.',
    'Ando en moto negra. Si no me llegás a contestar, hoy no voy a poder pasar. ¡Gracias!',
  ].join(' ');
}

/** El link de WhatsApp con el mensaje puesto. `tel` ya viene normalizado (con el 9). */
export function linkDeWhatsapp(tel, mensaje) {
  if (!tel) return null;
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje || '')}`;
}

/**
 * Los días entre los que se puede caminar con las flechas.
 *
 * 🔑 **Son los días CON envíos, no los siete corridos.** Mismo criterio que las flechas de la
 * pantalla interna: los días sin reparto son pantallas siempre vacías, y pasar por ellas de a un
 * toque es lo que hace que nadie use la navegación.
 *
 * 🔴 **Hoy entra SIEMPRE, tenga envíos o no.** Es el único día que el cadete puede tocar, así que
 * sacarlo de la lista cuando está vacío deja al que se fue a mirar el martes sin camino de vuelta.
 */
export function diasNavegables(proximos, hoyAR) {
  const lista = (proximos || []).filter((d) => d && esFechaIso(d.fecha));
  if (!lista.some((d) => d.fecha === hoyAR)) lista.push({ fecha: hoyAR, cuantos: 0, rotulo: 'Hoy' });
  return lista.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

/** El día anterior (`paso: -1`) o el siguiente (`paso: 1`) de esa lista, o `null` si es la punta. */
export function diaVecino(dias, actual, paso) {
  const i = (dias || []).findIndex((d) => d.fecha === actual);
  if (i < 0) return null;
  const v = dias[i + paso];
  return v ? v.fecha : null;
}

/**
 * Los envíos de un día, con la forma que le corresponde a ese día.
 *
 * 🔴 **Vive acá y no en el handler porque es la decisión, no el plumbing**: elegir mal la forma es
 * exactamente el defecto que abrir la ventana a siete días podría introducir —mirar la semana
 * entregaría siete días de direcciones y teléfonos en vez de uno—, y en el handler no hay test que
 * lo cace.
 *
 * 🔑 **La decide poder ESCRIBIR ese día, no que sea hoy.** A las 00:30 el cadete todavía está
 * cerrando el reparto de ayer: con `fecha === hoy` se quedaría sin la dirección del paquete que
 * tiene en la mano, y con los botones andando.
 */
export function enviosDelDia(filas, editable) {
  return (filas || []).map((f) => (editable ? paraElCadete(f) : paraElCadeteFuturo(f)));
}

/**
 * Lo único que el portal puede escribir.
 *
 * 🔴 **Parches fijos, no campos del body.** El mutante es copiar lo que llegó
 * (`{ ...req.body }`): con eso, cualquiera con el link reescribe precios, nombres y direcciones.
 * Acá la acción elige de esta lista y el resto del cuerpo se ignora, exista o no.
 *
 * `no_cobrado` escribe `false` y no borra: "no me pagó" es un hecho que el cadete reporta, distinto
 * de "todavía no dijo nada" (`null`). Sin esa diferencia, la rendición del día no puede distinguir
 * un envío que falta cobrar de uno que nadie tocó.
 */
export const ACCIONES = {
  entregado: { estado: 'entregado' },
  no_entregado: { estado: 'no_entregado' },
  cobrado: { cobrado: true },
  no_cobrado: { cobrado: false },
};

/** El parche de una acción, o `null` si no existe. */
export function parcheDeAccion(accion) {
  return Object.prototype.hasOwnProperty.call(ACCIONES, accion) ? { ...ACCIONES[accion] } : null;
}

// ── El link y su PIN ─────────────────────────────────────────────────────────────────────────

/** Cuántos fallos de PIN antes de trabar, y por cuánto. Ver `pinTrabado`. */
export const MAX_FALLOS_PIN = 10;
export const MINUTOS_TRABADO = 15;

/**
 * ¿El PIN está trabado por intentos fallidos?
 *
 * 🔴 **Sin contador, cuatro dígitos son 10.000 combinaciones y eso es un rato de script.** El PIN no
 * es una contraseña de persona: es un segundo factor sobre 64 hex, y su trabajo es que un link
 * reenviado por WhatsApp no alcance solo. Pero sin traba, no hace ni ese trabajo.
 */
export function pinTrabado(fila, ahora) {
  const hasta = fila && fila.pin_bloqueado_hasta ? Date.parse(fila.pin_bloqueado_hasta) : 0;
  return !!hasta && hasta > Date.parse(ahora);
}

/**
 * Hasta cuándo vale un link que se genera hoy: **el 1º del mes que viene**.
 *
 * 🔑 Lo decidió Bruno así, y la fecha fija es mejor que "30 días" por un motivo práctico: el día que
 * hay que renovarlo es siempre el mismo y se puede poner en la agenda, en vez de depender de cuándo
 * se generó el anterior.
 *
 * 🔴 **Con el piso de 15 días**, que es lo que evita el caso bobo: un link generado el 29 moriría a
 * los dos días, y el cadete se quedaría sin la hoja un martes a la mañana. Ahí salta al 1º del mes
 * siguiente.
 */
export function venceElProximoPrimero(hoyIso) {
  if (!esFechaIso(hoyIso)) return null;
  const [a, m] = hoyIso.split('-').map(Number);
  const primero = (anio, mes) => `${anio + Math.floor((mes - 1) / 12)}-${String(((mes - 1) % 12) + 1).padStart(2, '0')}-01`;
  const proximo = primero(a, m + 1);
  return distanciaEnDias(proximo, hoyIso) >= 15 ? proximo : primero(a, m + 2);
}
