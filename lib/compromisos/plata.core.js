/**
 * La plata de los compromisos: leerla de un casillero, escribirla en uno, y mostrarla.
 *
 * # 🔴 Qué estaba pasando
 *
 * La cuenta de "convertir lo que se escribe en el casillero a un número" estaba escrita CUATRO
 * veces —`Pagos.tsx`, `NuevoCompromiso.tsx` y dos veces en `Compromisos.tsx`—, siempre así:
 *
 *     Number(String(monto).replace(/\./g, '').replace(',', '.'))
 *
 * Esa línea lee el punto como separador de MILES, que es lo correcto para lo que teclea una
 * persona ("1.500" son mil quinientos). El problema era el otro lado: el formulario de confirmar
 * arrancaba con `String(c.monto)`, y `String()` escribe el punto como separador DECIMAL. O sea que
 * el mismo número se escribía con un convenio y se leía con el otro:
 *
 *     String(66666.67)  →  "66666.67"  →  la línea de arriba  →  6666667
 *
 * **Cien veces el monto, viajando a la puerta del dashboard**, que no tiene tope: se escribía el
 * pago de verdad en el ledger. Y quedaba tapado dos veces, porque el aviso de "entró de menos"
 * comparaba contra el número ya inflado (no saltaba) y la lista mostraba los montos redondeados a
 * pesos enteros (no se veía la diferencia).
 *
 * No era un caso de laboratorio: lo fabrica el propio flujo de cobro parcial. Se compromete
 * $100.000, entran $33.333,33, el servidor abre el resto por 66666.67 — y ese resto es el que
 * después se confirma.
 *
 * # La regla que arregla la clase entera de bug
 *
 * `paraEditar` y `parsearMonto` son **una la inversa de la otra**, y hay un test que las recorre
 * de ida y vuelta. Cualquier número que salga de acá para un casillero vuelve a entrar igual.
 *
 * ⛔ La regla de uso, para que esto no se reabra: **nunca `String(numero)` hacia un `<input>` de
 * plata.** Va `paraEditar(numero)`. Es la única forma de que el convenio de escritura y el de
 * lectura sean el mismo.
 *
 * # Por qué `.js` y no `.ts`
 *
 * Mismo motivo que `lib/canjes/reglas.core.js`: los `api/*.js` corren en Node sin pasar por el
 * compilador de Next, así que no pueden importar TypeScript. Un `.js` con `export` lo importan los
 * dos mundos, y `lib/compromisos/core.ts` lo re-exporta con sus tipos para las pantallas. Así la
 * resta del cobro parcial —la que decide por cuánto nace el compromiso del resto— es **una sola
 * implementación**, y no la del servidor por un lado y la de los dos formularios por el otro.
 *
 * ⛔ No importa nada, a propósito.
 */

/**
 * A centavos, que es la unidad de la columna (`numeric(15,2)`). Sin esto 0.1 + 0.2 da
 * 0.30000000000000004.
 *
 * ⚠️ `null` y `''` salen `NaN` y **no cero**: `Number(null)` es 0, así que sin este corte una
 * columna vacía se mostraría como "$ 0" —un dato que no está, disfrazado de dato que sí. Mismo
 * criterio que `formatMoney` del kit.
 */
export function redondear(n) {
  if (n == null || n === '') return NaN;
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
}

/**
 * Lo que una persona escribió en un casillero, convertido a número. `NaN` si no se entiende.
 *
 * Acepta lo que se teclea de verdad en Argentina, y también lo que se pega desde otro lado:
 *
 *   "1.234,56"  → 1234.56    coma decimal, punto de miles (el formato local)
 *   "1234,56"   → 1234.56    sin separador de miles
 *   "1.500"     → 1500       un punto y tres dígitos atrás: son miles
 *   "1234.56"   → 1234.56    un punto y dos dígitos atrás: es un decimal pegado de otro lado
 *   "$ 1.234"   → 1234       los adornos se ignoran
 *
 * 🔑 **La ambigüedad del punto se resuelve mirando cuántos dígitos lo siguen**, y no siempre igual.
 * "1.500" y "1.50" son la misma tecla con dos intenciones distintas: nadie escribe mil quinientos
 * como "1.50", y nadie escribe un peso con cincuenta como "1.500". Tres dígitos = miles; uno o dos
 * = decimales. Con coma no hay nada que adivinar: la coma manda y los puntos son de miles.
 */
export function parsearMonto(entrada) {
  if (typeof entrada === 'number') return redondear(entrada);

  // Fuera todo lo que no sea dígito, separador o signo: "$", espacios finos, el NBSP que mete
  // `toLocaleString`, lo que venga.
  const limpio = String(entrada ?? '').replace(/[^\d.,-]/g, '');
  if (!limpio) return NaN;

  const comas = (limpio.match(/,/g) || []).length;
  const puntos = (limpio.match(/\./g) || []).length;

  let normal;
  if (comas > 1) {
    // Dos comas decimales no existen. Es un error de tipeo, y adivinar cuál vale sería peor.
    return NaN;
  } else if (comas === 1) {
    normal = limpio.replace(/\./g, '').replace(',', '.');
  } else if (puntos === 1) {
    const atras = limpio.length - limpio.lastIndexOf('.') - 1;
    normal = atras === 1 || atras === 2 ? limpio : limpio.replace(/\./g, '');
  } else {
    normal = limpio.replace(/\./g, '');
  }

  const n = Number(normal);
  return Number.isFinite(n) ? redondear(n) : NaN;
}

/**
 * Un número, escrito para que entre en un casillero **y vuelva a salir igual**.
 *
 * ⚠️ Es la mitad que faltaba. Los centavos se muestran sólo si los hay: un compromiso de $500.000
 * se edita como "500.000" y no como "500.000,00", pero el resto de un cobro parcial sale
 * "66.666,67" —con coma, que es lo que `parsearMonto` lee sin ninguna ambigüedad.
 */
export function paraEditar(n) {
  const v = redondear(n);
  if (!Number.isFinite(v)) return '';
  const conCentavos = Math.round(Math.abs(v) * 100) % 100 !== 0;
  return v.toLocaleString('es-AR', {
    minimumFractionDigits: conCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Plata para leer, con el signo.
 *
 * 🔑 **Muestra los centavos cuando los hay**, y es a propósito: el formateador general del kit
 * (`formatMoney`) los corta siempre, y en este circuito eso escondía diferencias. Un resto de
 * $66.666,67 se veía como "$ 66.667" en la lista y como otra cosa en el casillero, así que el
 * número mal no tenía dónde delatarse. Los montos redondos se siguen viendo redondos.
 */
export function mostrar(n) {
  const v = redondear(n);
  if (!Number.isFinite(v)) return '—';
  const conCentavos = Math.round(Math.abs(v) * 100) % 100 !== 0;
  return v.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: conCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Cuánto quedaría pendiente si entró menos de lo comprometido. 0 si entró todo (o de más).
 *
 * Es la resta que decide por cuánto nace el compromiso del resto, y estaba escrita tres veces: en
 * el servidor a mano, y en los dos formularios de confirmar para dibujar el aviso de "entró de
 * menos". Ahora los tres preguntan acá, así que el aviso no puede decir una cosa y el servidor
 * anotar otra.
 */
export function restante(comprometido, entro) {
  const falta = redondear(Number(comprometido) - Number(entro));
  return Number.isFinite(falta) ? Math.max(0, falta) : NaN;
}

/**
 * Cuánto se le puede comprometer todavía a un acreedor: lo que se le puede imputar según el
 * dashboard, menos lo que ya está comprometido acá. Nunca negativo.
 *
 * 🔑 **Es LA regla del circuito, y por eso vive donde el servidor también la puede usar.** El
 * dashboard no sabe que hay plata comprometida: su saldo dice "se le debe X" cuando ya hay X−Y
 * camino a él. Sin esta resta, dos charlas con dos clientes en el mismo día comprometen la misma
 * deuda dos veces, y una de las dos transferencias termina siendo un saldo a favor para imputar a
 * mano.
 *
 * ⚠️ Se parte de `disponible` y NO de `saldo`: `disponible` ya descuenta los cheques entregados que
 * el banco no debitó. Usar el saldo haría comprometer plata para una deuda que ya está saldada con
 * un papel en la calle.
 */
export function sePuedeComprometer(disponibleDashboard, yaComprometido) {
  const libre = redondear(Number(disponibleDashboard) - Number(yaComprometido));
  return Number.isFinite(libre) ? Math.max(0, libre) : NaN;
}
