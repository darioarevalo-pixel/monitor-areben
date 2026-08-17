/**
 * Las reglas de un envío del día: qué valores son válidos, qué tiene que traer una fila, y **cuánto
 * se cobra en cada puerta**.
 *
 * # Por qué es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js` y `lib/tienda.core.js`: `api/_envios.js` corre en Node
 * sin pasar por el compilador de Next y no puede importar TypeScript. Si esto fuera `.ts`, el
 * handler tendría que repetir las listas de estados y turnos, y el día que se agregue un estado
 * habría dos verdades. `lib/envios/core.ts` lo re-exporta tipado para la app.
 *
 * 🔑 **Por eso también vive acá la cuenta de la puerta** (`aCobrar`, `tarifaCadete`, `netoDelEnvio`).
 * Empezó en `core.ts`, pero la lee gente que no puede importar TypeScript: el handler, y el portal
 * que el cadete abre en la calle. Lo que el papel dice que hay que cobrar, lo que la pantalla
 * muestra y lo que el portal deja marcar tienen que salir de **una sola** implementación — dos
 * copias que se contradicen es la forma de que el ticket mande a cobrar algo que la pantalla da por
 * pagado, con el cadete ya en la puerta.
 *
 * # Por qué la validación es del servidor y no sólo del formulario
 *
 * Es la lección de la agenda: una regla mal formada se guarda igual, no aparece nunca en la
 * pantalla, y nadie entiende por qué. Acá es peor —un `turno` mal escrito hace que el envío
 * desaparezca de la hoja del cadete y el paquete no salga— así que el handler valida ANTES de
 * escribir. La base tiene los mismos `check`, pero un error de constraint llega como un 500 críptico
 * en vez de decir qué campo está mal.
 */

import { diaDeSemanaDe } from '../calendario/fechas.core.js';

/** Los dos turnos de reparto. Cerrado a propósito: en la planilla el 53,8% no decía cuál era. */
export const TURNOS = ['mañana', 'tarde'];

/**
 * **Qué turnos existen cada día.** El cadete no sale cualquier día: de lunes a viernes por la tarde,
 * y martes y jueves también por la mañana. Sábado y domingo no hay reparto.
 *
 * 🔴 **Se indexa con `getDay()`: 0 es domingo.** No se reordena para que arranque en lunes. Es la
 * misma convención que `dias` en la agenda (`lib/agenda/reglas.core.js`) y que `DIAS_CORTOS` en
 * `lib/fechas/semana.ts`, donde ya se cometió el error una vez: dar vuelta el array corrió todas las
 * etiquetas un día **sin que fallara nada ni se rompiera un test**.
 */
export const TURNOS_POR_DIA = {
  0: [],                    // domingo
  1: ['tarde'],             // lunes
  2: ['mañana', 'tarde'],   // martes
  3: ['tarde'],             // miércoles
  4: ['mañana', 'tarde'],   // jueves
  5: ['tarde'],             // viernes
  6: [],                    // sábado
};

/** Los turnos que existen ese día. `[]` es "no hay reparto". */
export function turnosDe(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) return [];
  return TURNOS_POR_DIA[diaDeSemanaDe(fecha)] || [];
}

/**
 * ¿Ese día tiene ese turno?
 *
 * 🔑 **Esto NO se valida en el servidor, y es a propósito.** La grilla es lo normal, no una ley: un
 * envío especial un sábado tiene que poder salir sin que haya que tocar el código un día que el
 * local está laburando. La pantalla ofrece sólo los turnos que existen y avisa si se elige otro; el
 * handler lo guarda igual.
 */
export function esTurnoDeGrilla(fecha, turno) {
  return turnosDe(fecha).includes(turno);
}

/**
 * De dónde salió el envío. El 90% son órdenes de Tienda Nube y entran solas; el 10% son ventas por
 * WhatsApp que se cargan a mano y tienen que seguir existiendo.
 */
export const ORIGENES = ['tn', 'manual'];

/**
 * El estado del envío, que en la planilla no existía —y por eso no se pudo medir una sola entrega
 * fallida en dos años de datos—.
 *
 * 🔑 **Son un camino, no una lista.** `pendiente → preparado → en_transito → entregado` es la vida
 * normal de un paquete, y `no_entregado` es la única salida lateral: nadie en casa, dirección
 * equivocada. Por eso la pantalla no tiene un desplegable sino un botón que avanza — elegir de una
 * lista de seis es fricción veinte veces por día, y encima deja elegir hacia atrás sin querer.
 *
 * Eran seis. Se fue `reintento` («vuelve a salir»), que no era un estado sino una decisión de
 * mañana: el paquete que vuelve a salir es uno que se **reprograma** a otro día, y ahí arranca de
 * `pendiente` como cualquiera. Y `despachado` se llama `en_transito`, que es lo que se dice en el
 * local.
 */
export const ESTADOS = ['pendiente', 'preparado', 'en_transito', 'entregado', 'no_entregado'];

/**
 * ⛔ **`ESTADOS_LEGADO` se fue el 17-ago-2026, y las DOS condiciones se midieron antes de sacarlo.**
 *
 * Existía porque prod y los previews comparten una sola base: entre el deploy que renombró los
 * estados y la migración que estrecha el check, había filas escritas por el código viejo, y una
 * pantalla que no supiera leerlas las pintaba sin color con un botón muerto encima de un paquete
 * real. Vivió así del 15 al 17 de agosto.
 *
 * 🔴 **La nota que decía «ya se puede borrar» era falsa durante esos dos días**, y por eso las
 * condiciones se leen de la base y no de un documento:
 *   · `migrate-envios-estados-cierre.sql` **aplicado** ⇒ `pg_get_constraintdef` sobre
 *     `envios_reparto_estado_check` tiene que devolver **cinco** valores, no siete;
 *   · `select estado, count(*) from envios_reparto group by 1` **sin legados** (dio 9 `pendiente`
 *     y 2 `en_transito`).
 *
 * Desde el cierre, la base **rechaza** `despachado` y `reintento`, así que no pueden volver a
 * aparecer ni desde un preview viejo: lo que recibe es un error de constraint.
 */

/** Cómo se dice cada estado en la pantalla y en el portal del cadete. Una sola verdad para los dos. */
export const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  preparado: 'Preparado',
  en_transito: 'En tránsito',
  entregado: 'Entregado',
  no_entregado: 'No entregado',
};

/**
 * El estado que sigue, o `null` si el paquete ya cerró.
 *
 * Los cerrados devuelven `null` y no vuelven al principio. Un ciclo que dé la vuelta convierte un
 * click de más en un paquete que sale de la cuenta del día sin que nadie lo note.
 *
 * 🔑 **Un estado que no está en el camino devuelve `null`, o sea un botón que no se dibuja** — no
 * uno que no hace nada. Mientras existieron los legados esto tenía dos entradas más (`despachado`
 * y `reintento`) justamente para que no quedara un botón muerto sobre un paquete real; desde que la
 * base los rechaza, ese caso no puede existir.
 */
export function siguienteEstado(estado) {
  const camino = { pendiente: 'preparado', preparado: 'en_transito', en_transito: 'entregado' };
  return camino[estado] || null;
}

/** Los estados en los que el paquete todavía no salió: son los que las chicas preparan. */
export const ESTADOS_EN_CASA = ['pendiente', 'preparado'];

/** Un envío que ya no vuelve a la lista del día. */
export const ESTADOS_CERRADOS = ['entregado', 'no_entregado'];

/**
 * El filtro de la bandeja «Sin fecha», tal como lo pide PostgREST.
 *
 * 🔑 **La bandeja no es una bandeja de entrada: es la lista de trabajo.** Son los envíos que hay que
 * coordinar, y un paquete que volvió sin entregar es exactamente eso. Antes preguntaba sólo por
 * `fecha is null`, así que el que volvía quedaba únicamente en la hoja del día que ya pasó — o sea,
 * en una pantalla que nadie vuelve a abrir.
 *
 * Se afirma como string en un test a propósito: un `.or()` mal escrito no falla, **vacía la
 * bandeja**, y una bandeja vacía se lee como «no hay nada que hacer».
 */
export const FILTRO_BANDEJA = 'fecha.is.null,estado.eq.no_entregado';

/**
 * **Las columnas que el handler pide de `envios_reparto`.**
 *
 * Viven acá y no en `api/_envios.js` por el mismo motivo que `FILTRO_BANDEJA`: una columna que no se
 * pide no rompe nada. Llega `undefined`, la pantalla la lee como "no dijo nada", y el defecto se ve
 * recién en la calle. Es exactamente lo que pasó con `cobrado`: el cadete marcaba «no cobré» desde
 * la puerta y del otro lado no se enteraba nadie, porque la columna existía en la base, existía en
 * el portal, y **no estaba en esta lista**. Acá se puede afirmar en un test.
 */
export const CAMPOS =
  'id, store, fecha, turno, origen, orden_numero, cliente, telefono, direccion, piso_depto, ' +
  'localidad, cp, anotacion, monto_envio, envio_pagado, envio_bonificado, monto_pedido_a_cobrar, estado, ' +
  'cobrado, vendedor, cadete, datos, autor, created_at, updated_at';

/**
 * Lo que la cuenta del cadete necesita de cada envío, y nada más.
 *
 * ⚠️ **Sin `datos`, que es la orden de Tienda Nube congelada entera.** La cuenta pide todos los días
 * desde el principio —el acumulado de hoy es la suma de todo lo anterior—, así que traer el jsonb
 * sería mandar el histórico completo de las órdenes al navegador para calcular cuatro sumas.
 */
export const CAMPOS_CUENTA =
  'id, store, fecha, turno, cliente, orden_numero, estado, monto_envio, envio_pagado, ' +
  'envio_bonificado, monto_pedido_a_cobrar, cobrado';

/**
 * **La plata entró, pero no por la mano del cadete**: entregó el paquete y marcó «No cobré».
 *
 * 🔴 **No es una deuda de la clienta, y llamarlo así era el defecto.** La regla del local, dicha por
 * Bruno el 17-ago-2026, es que **un pedido no se entrega si no está pago**: se paga en el momento de
 * entregar, o al cadete o transfiriendo al local. ⇒ un `entregado` con `cobrado === false` es uno que
 * **se pagó por transferencia**, no uno que quedó debiendo. Se llamaba `cobroPendiente` y la pantalla
 * lo mostraba en rojo como «Falta cobrarle a clientas»: eso manda a alguien a reclamarle plata a una
 * clienta que ya pagó. Si de verdad no paga, el paquete **no se entrega** y el envío queda
 * `no_entregado`, que está afuera de toda la cuenta.
 *
 * 🔑 **Para qué sirve entonces**: esa plata **no la tiene el cadete**, así que no entra en lo que él
 * tiene que traer en la rendición. La tarifa se le paga igual —llevó el paquete—, y por eso sale de
 * `cobrado` y no de `tarifas`. La partición sigue siendo exactamente la misma; lo que cambia es qué
 * dice de ella la pantalla.
 *
 * 🔑 **`null` no es `false`.** `null` es "no dijo nada" —el 100% de las filas anteriores al portal, y
 * todas las que se tildan desde la pantalla interna— y se lee como el caso normal: la cobró él.
 * Tratarlo como `false` movería de golpe toda la historia al otro balde.
 *
 * Sólo aplica a los entregados: en un `no_entregado` no se cobró porque no hubo puerta.
 */
export function pagoAlLocal(e) {
  return e.estado === 'entregado' && e.cobrado === false;
}

/**
 * **De lo que llega en el cuerpo al valor de `cobrado`**, que tiene TRES valores y no dos:
 * `true` (la cobró el cadete) · `false` (se pagó al local) · `null` (nadie dijo nada todavía).
 * Devuelve `undefined` cuando lo que llegó no es ninguno de los tres, y ahí el handler rechaza.
 *
 * 🔴 **El campo que falta NO se puede leer como `false`**, que es justo lo que haría el `!!b.cobrado`
 * con el que están escritos `pagado` y `bonificado`: un cuerpo al que se le olvidó el campo escribiría
 * «lo pagó al local» sobre un envío que el cadete sí cobró, y esa plata **sale de lo que él tiene que
 * traer** sin que nada falle. Los otros dos tildes pueden darse ese lujo porque son booleanos de dos
 * valores donde "ausente" y "false" significan lo mismo; acá el tercer valor significa otra cosa.
 */
export function valorDeCobro(v) {
  if (v === true || v === false || v === null) return v;
  return undefined;
}

/**
 * El parche que reprograma un envío que volvió: lo devuelve a `pendiente` y **apila el intento**.
 *
 * 🔑 **Apila, no pisa.** `datos` es donde vive la orden de Tienda Nube congelada —la dirección que
 * salió impresa, los ítems, el teléfono—: escribir `{ intentos }` a secas se la lleva puesta y el
 * envío se queda sin ticket. Por eso se copia lo que había.
 *
 * El intento queda escrito porque al reprogramar la fila **se muda** al día nuevo, y el día que
 * falló deja de mostrarla: sin esto, «cuántas entregas fallan» vuelve a ser una pregunta sin
 * respuesta, que es justamente lo que la planilla no podía contestar en dos años.
 */
export function conIntentoFallido(e, { por, at }) {
  const datos = e && typeof e.datos === 'object' && e.datos ? e.datos : {};
  const previos = Array.isArray(datos.intentos) ? datos.intentos : [];
  return {
    estado: 'pendiente',
    datos: { ...datos, intentos: [...previos, { fecha: e.fecha, turno: e.turno, at, por: por || null }] },
  };
}

export const MARCAS = ['bdi', 'zattia'];

// ── La plata ─────────────────────────────────────────────────────────────────────────────────

/** PostgREST devuelve `numeric` como string. Mismo criterio que `lib/crm/core.js`. */
export function num(v) {
  return parseFloat(String(v)) || 0;
}

/**
 * **Lo que el cadete tiene que cobrar en esta puerta.**
 *
 * Es la única cuenta que importa de todo el módulo, y son dos sumandos:
 *   · el envío, salvo que ya esté saldado —pagado por adelantado o bonificado—;
 *   · el saldo del pedido, si quedó algo por cobrar.
 *
 * 🔴 El caso "no hay que cobrar nada" es lo normal, no el borde: se midió sobre dos años de la
 * planilla que **en la mediana el 100% de lo que el cadete cobra es el envío** —el producto ya se
 * pagó por transferencia antes de despachar—. Un ticket que cobre de más un pedido ya pagado es un
 * problema con el cliente en la puerta, no un error de redondeo.
 */
export function aCobrar(e) {
  const envio = envioSaldado(e) ? 0 : num(e.monto_envio);
  return envio + num(e.monto_pedido_a_cobrar);
}

/**
 * ¿El envío ya está saldado, sea quien sea el que lo pagó?
 *
 * 🔑 **Son dos hechos distintos y por eso son dos tildes, pero en la puerta valen lo mismo**: el
 * cadete no cobra el envío ni cuando la clienta ya lo transfirió (`envio_pagado`) ni cuando se lo
 * regalamos (`envio_bonificado`). Se guardan separados porque después hay que poder preguntar
 * cuánta plata regalamos en envíos, que es una pregunta distinta de cuánta se cobró por adelantado
 * — y esa diferencia se pierde para siempre si se colapsan en un booleano.
 */
export function envioSaldado(e) {
  return !!e.envio_pagado || !!e.envio_bonificado;
}

/** ¿Esta puerta no se cobra? Lo que decide si el ticket dice PAGADO en vez de un monto. */
export function estaTodoPago(e) {
  return aCobrar(e) === 0;
}

/**
 * **Lo que le debemos al cadete por llevar este paquete**, que es el costo del reparto y nada más.
 *
 * 🔑 **`monto_envio` es el costo del envío, exista o no cobro en la puerta.** Hubo una versión con
 * una segunda columna (`pago_cadete`) para el caso bonificado, porque entonces el bonificado se
 * escribía poniendo el precio en cero: el reparto figuraba gratis y la diferencia se la comía él.
 * Se fue el 15-ago-2026, y lo que la reemplaza es más simple y más difícil de romper — el precio
 * **nunca** se borra; lo que cambia es quién lo paga (`envio_pagado` / `envio_bonificado`). Dos
 * columnas para el mismo número es la enfermedad que este módulo persigue en todos lados.
 */
export function tarifaCadete(e) {
  return num(e.monto_envio);
}

/**
 * **Lo que el cadete tiene que traer por este envío**, y el corazón de toda la cuenta.
 *
 * Cobró `aCobrar(e)` en la puerta y le debemos `tarifaCadete(e)` por haberlo llevado. La resta es lo
 * que sobra, y **puede dar negativo**: ahí le debemos nosotros.
 *
 * Los tres casos reales, para que se vea que no hay ninguno raro:
 *   · envío cobrado en la puerta, producto ya pagado → cobra el envío y se lo queda: **0**.
 *   · el envío ya estaba pago o iba bonificado → lo llevó y no cobró nada: **le debemos**.
 *   · cobró el producto en efectivo → **trae esa plata**, menos su envío.
 *
 * Que el caso normal dé cero es la razón por la que la planilla nunca necesitó una cuenta: mientras
 * todo se cobre en la puerta, nadie se debe nada. Los otros dos son los que se arrastraban de
 * memoria.
 */
export function netoDelEnvio(e) {
  return aCobrar(e) - tarifaCadete(e);
}

// ── Los movimientos de la cuenta ─────────────────────────────────────────────────────────────

/**
 * **Las columnas de un movimiento.** Acá y no en `api/_envios.js`, por lo mismo que `CAMPOS`: una
 * columna que no se pide llega `undefined` y no falla nada. `anulado_en` es el caso peligroso — sin
 * él la pantalla suma movimientos anulados y el saldo miente sin que nada se rompa.
 */
export const CAMPOS_MOVIMIENTO = 'id, fecha, monto, nota, autor, created_at, anulado_en, anulado_por';

/**
 * Las dos cosas que le pueden pasar a la plata entre el cadete y el local. **No es una columna de la
 * base**: es lo que muestran los dos botones de la pantalla, y se deriva del signo.
 */
export const CLASES_MOVIMIENTO = ['rindio', 'le_pagamos'];

/** Cómo se dice cada una. Una sola verdad para la pantalla y para el papel. */
export const MOVIMIENTO_LABEL = {
  rindio: 'Rindió',
  le_pagamos: 'Le pagamos',
};

/**
 * **Qué quiere decir el saldo, en castellano.** El número solo no se puede leer: `-47000` y `47000`
 * son igual de plausibles y nadie se acuerda de memoria de qué lado está el menos. Lo que se dice en
 * voz alta es «el cadete tiene plata nuestra» o «le debemos», y de ahí sale el `titulo`; el `monto`
 * va **siempre en positivo**, porque el signo ya lo dijo la frase.
 *
 * 🔑 **Vive acá y no en la pantalla porque el papel dice lo mismo.** Estaba escrito adentro del KPI
 * de `Envios.tsx`, y el recibo que se le imprime al cadete necesita esa misma frase: dos copias del
 * mismo `if` se corrigen de a una, y el día que se corrija sólo la pantalla, el papel que queda en
 * la mano del cadete es el que dice lo viejo.
 */
export function rotuloDeSaldo(saldo) {
  const n = num(saldo);
  if (n === 0) return { titulo: 'Están a mano', monto: 0, sub: '' };
  if (n > 0) return { titulo: 'El cadete tiene plata nuestra', monto: n, sub: 'lo trae en la próxima rendición' };
  return { titulo: 'Le debemos al cadete', monto: -n, sub: 'se lo descuenta de los próximos envíos' };
}

/**
 * **De los dos botones al número con signo.** Es el único lugar del sistema donde el signo se
 * decide.
 *
 * 🔑 `monto` es el efecto sobre el saldo, y el saldo es «cuánta plata nuestra tiene él»: rendir
 * $10.000 lo baja (`-10000`), pagarle $3.000 lo sube (`+3000`). Ver el encabezado de
 * `sql/migrate-envios-movimientos.sql`.
 *
 * Se toma el **valor absoluto** de lo que llega a propósito: la pantalla tiene un input de plata
 * donde nadie tipea un menos, y un `-10000` colado en «Le pagamos» significaría lo contrario de lo
 * que dice el botón que se apretó.
 */
export function montoDelMovimiento(clase, monto) {
  const n = Math.abs(Number(monto));
  if (!Number.isFinite(n)) return NaN;
  return clase === 'rindio' ? -n : n;
}

/**
 * La vuelta: qué clase es un movimiento ya guardado.
 *
 * 🔑 **Se deriva del signo y no de una columna `tipo`.** Con las dos cosas guardadas se pueden
 * contradecir —una fila que diga «Le pagamos» con el monto en negativo— y no hay forma de saber cuál
 * de las dos tiene razón. El texto de la pantalla y el del recibo salen de acá.
 */
export function claseDelMovimiento(monto) {
  return num(monto) < 0 ? 'rindio' : 'le_pagamos';
}

/** ¿Este movimiento sigue contando en el saldo? Los anulados quedan a la vista pero no suman. */
export function movimientoVivo(m) {
  return !m.anulado_en;
}

/**
 * ¿Se puede guardar este movimiento? `null` si está bien, o el motivo en castellano.
 *
 * 🔑 **Cero se rechaza acá y también en la base.** Un movimiento de $0 no dice nada —«no trajo nada»
 * es lo normal en la calle y ya lo dice la ausencia de movimiento— pero ocupa una fila, sale en la
 * pantalla y se le puede imprimir un recibo de cero pesos.
 */
export function validarMovimiento(m) {
  if (!m || typeof m !== 'object') return 'Falta el movimiento.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha || ''))) return 'Falta el día del movimiento (YYYY-MM-DD).';
  const n = Number(m.monto);
  if (!Number.isFinite(n)) return 'El monto tiene que ser un número.';
  if (n === 0) return 'Un movimiento de $0 no dice nada: si no hubo plata, no hay movimiento.';
  return null;
}

/**
 * **La cuenta corriente del cadete**, día por día y con el saldo arrastrado.
 *
 * Se le pasan **todos** los envíos con fecha y todos los cierres, sin filtrar por rango: el
 * acumulado de un día es la suma de todos los anteriores, así que recortar la ventana daría un saldo
 * distinto según por dónde se empiece a mirar. Arranca en cero — al 14-ago-2026 el cadete y el local
 * están a mano — y por eso no hay saldo de apertura que pasarle.
 *
 * ⛔ **Vive acá, en `.js`, y no en `core.ts`** (17-ago-2026). La leen dos lados que no pueden importar
 * TypeScript: `api/_envios.js` y el portal que el cadete abre en la calle, que desde hoy muestra su
 * propia cuenta. Copiarla en el handler era la otra salida y es la que este módulo prohíbe: el saldo
 * que ve el cadete en el teléfono y el que ve el local en la pantalla tienen que salir de **una**
 * implementación, o un día se contradicen con el recibo impreso en la mano de él como único árbitro.
 * `core.ts` la re-exporta tipada, igual que el resto de la plata.
 *
 * 🔑 **Sólo cuentan los entregados.** Un paquete que volvió sin entregar no cobró nada y tampoco se
 * le paga: sumarlo haría que la caja no cierre justo los días que algo salió mal, que es cuando el
 * número tiene que ser confiable.
 *
 * 🔑 **La plata que va y viene son los `movimientos`, y ya vienen con signo.** El día aporta al
 * saldo `(cobrado − tarifas) + Σ movimientos vivos`, y esa suma no tiene ningún `if` que decida si
 * una fila suma o resta — porque no hay dónde invertirlo. Ver `montoDelMovimiento`.
 *
 * **Cero totales guardados**, igual que antes y por lo mismo: si el saldo de ayer quedara congelado
 * en una columna y alguien corrigiera el precio de un envío de ayer, el acumulado de hoy mentiría
 * sin que nada falle.
 *
 * El signo, una sola vez y para todo el módulo: **positivo = el cadete tiene plata nuestra**;
 * negativo = se la debemos.
 */
export function cuentaDelCadete(envios, cierres, movimientos = []) {
  const porDia = new Map();
  for (const e of envios || []) {
    if (!e.fecha) continue;
    const lista = porDia.get(e.fecha);
    if (lista) lista.push(e);
    else porDia.set(e.fecha, [e]);
  }
  // Un día cerrado sin un solo envío entregado igual es una fila de la cuenta: es el día en que se
  // le pagó lo que se le debía y no salió a repartir.
  for (const c of cierres || []) if (!porDia.has(c.fecha)) porDia.set(c.fecha, []);
  // 🔑 **Y los días salen de TRES fuentes, no de dos.** Un movimiento puede caer en un día sin
  // reparto —el jueves que rinde lo del lunes al miércoles, el sábado que se le transfiere lo que se
  // le debía— y ése es justamente el caso que la tabla vieja no sabía anotar: su PK era el día de
  // reparto. Sin esta línea, esa plata existe en la base y no aparece en ninguna fila.
  for (const m of movimientos || []) if (m.fecha && !porDia.has(m.fecha)) porDia.set(m.fecha, []);

  const fechas = [...porDia.keys()].sort();
  let acumulado = 0;
  let sinCobrarTotal = 0;
  const dias = [];

  for (const fecha of fechas) {
    const delDia = porDia.get(fecha) || [];
    const entregados = delDia.filter((e) => e.estado === 'entregado');
    const cierre = (cierres || []).find((c) => c.fecha === fecha) || null;

    // 🔴 **Lo que se pagó al local no se le reclama a él.** Antes toda entrega sumaba `aCobrar` a lo
    // que tenía que traer, tildara lo que tildara en la puerta: el cadete quedaba debiendo plata que
    // nunca tuvo en la mano, y como la pantalla interna ni siquiera pedía la columna, la diferencia
    // se discutía de memoria. La tarifa sí se le paga igual —llevó el paquete—, así que sale de
    // `cobrado` y **no** de `tarifas`.
    //
    // 🔑 **Los dos baldes son «quién tiene la plata», no «entró o no entró»**: un pedido no se
    // entrega si no está pago, así que todo lo entregado ya se cobró; lo único que decide `pagoAlLocal`
    // es si entró por la mano del cadete o por transferencia. Ver su comentario.
    const cobrado = entregados.filter((e) => !pagoAlLocal(e)).reduce((s, e) => s + aCobrar(e), 0);
    const sinCobrar = entregados.filter(pagoAlLocal).reduce((s, e) => s + aCobrar(e), 0);
    const tarifas = entregados.reduce((s, e) => s + tarifaCadete(e), 0);
    sinCobrarTotal += sinCobrar;

    // 🔑 **Los movimientos se SUMAN, tal como vienen.** El signo ya viene adentro del dato
    // (`montoDelMovimiento`), así que acá no hay ningún `if` que decida si esta fila suma o resta —
    // y por lo tanto no hay ninguno que se pueda invertir. Ése era el defecto que escondía el
    // modelo anterior: restar `pagado_aparte` en vez de sumarlo DUPLICABA la deuda en vez de
    // saldarla, y los dos caminos daban un número plausible.
    //
    // Los anulados quedan en la lista para que la pantalla los muestre tachados, pero no suman: la
    // fila no se borra porque puede haber un recibo impreso en la mano del cadete.
    const delDiaMov = (movimientos || []).filter((m) => m.fecha === fecha);
    const movido = delDiaMov.filter(movimientoVivo).reduce((s, m) => s + num(m.monto), 0);

    const debeTraer = cobrado - tarifas;
    const saldoDelDia = debeTraer + movido;
    acumulado += saldoDelDia;

    dias.push({
      fecha,
      envios: delDia.length,
      entregados: entregados.length,
      cobrado,
      sinCobrar,
      tarifas,
      debeTraer,
      movimientos: delDiaMov,
      movido,
      saldoDelDia,
      acumulado,
      cerrado: !!(cierre && cierre.cerrado_en),
      cerradoPor: (cierre && cierre.cerrado_por) || null,
      nota: (cierre && cierre.nota) || null,
    });
  }

  return { dias, saldo: acumulado, sinCobrar: sinCobrarTotal };
}

function esTexto(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** Un número de plata: no negativo y finito. `null`/`''` cuentan como 0. */
function montoValido(v) {
  if (v == null || v === '') return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

/**
 * ¿Se puede guardar esta fila? Devuelve `null` si está bien, o el motivo en castellano si no.
 *
 * El mensaje es el que va a leer quien está cargando un envío a mano con el cliente esperando, así
 * que dice qué falta, no qué constraint se violó.
 */
export function validarEnvio(e) {
  if (!e || typeof e !== 'object') return 'Falta el envío.';
  if (!MARCAS.includes(e.store)) return 'Falta la marca (bdi o zattia).';
  // 🔑 Fecha y turno son **los dos o ninguno**. Sin ninguno es la bandeja de pendientes: el pedido
  // ya se cotizó y todavía no tiene día porque lo confirma el cliente. Con fecha y sin turno es el
  // estado que la planilla vieja tenía en el 53,8% de sus filas, y por eso se rechaza acá y también
  // en la base (`envios_fecha_turno_juntos`).
  const conFecha = e.fecha != null && e.fecha !== '';
  const conTurno = e.turno != null && e.turno !== '';
  if (conFecha && !/^\d{4}-\d{2}-\d{2}$/.test(String(e.fecha))) return 'La fecha del reparto va como YYYY-MM-DD.';
  if (conFecha && !TURNOS.includes(e.turno)) return `Si tiene día, el turno tiene que ser ${TURNOS.join(' o ')}.`;
  if (conTurno && !conFecha) return 'Un turno sin día no se puede repartir: falta la fecha.';
  if (!ORIGENES.includes(e.origen)) return `El origen tiene que ser ${ORIGENES.join(' o ')}.`;
  if (e.estado != null && !ESTADOS.includes(e.estado)) return `Ese estado no existe. Los válidos son: ${ESTADOS.join(', ')}.`;
  if (!esTexto(e.direccion)) return 'Falta la dirección: sin eso el cadete no puede salir.';
  // Una orden de TN sin número no se puede volver a encontrar ni evitar que se duplique.
  if (e.origen === 'tn' && !esTexto(String(e.orden_numero == null ? '' : e.orden_numero))) {
    return 'Un envío de Tienda Nube necesita su número de orden.';
  }
  if (!montoValido(e.monto_envio)) return 'El monto del envío tiene que ser un número de cero para arriba.';
  if (!montoValido(e.monto_pedido_a_cobrar)) return 'El saldo a cobrar tiene que ser un número de cero para arriba.';
  // 🔑 Los dos tildes dicen que el cadete no cobra el envío, pero por motivos opuestos: uno es que
  // la clienta ya lo pagó, el otro que no lo paga nadie. Juntos son dos verdades sobre la misma
  // plata, y el día que haya que contestar «cuánto regalamos en envíos» esas filas no se pueden
  // contar ni dejar afuera. En la puerta no se nota —`aCobrar` da lo mismo—, así que si no se
  // rechaza acá no se rechaza en ningún lado.
  if (e.envio_pagado && e.envio_bonificado) {
    return 'Un envío no puede estar pagado y bonificado a la vez: o lo pagó la clienta, o se lo regalamos.';
  }
  return null;
}

