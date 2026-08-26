/**
 * Canjes: LAS reglas duras. Una sola implementación, para los dos mundos.
 *
 * Es la misma regla que `lib/permisos.core.js:23` —«si un chequeo hace falta en `api/`, va acá.
 * No se copia»— aplicada al módulo donde faltaba. El repo la había aplicado ocho veces (permisos,
 * tienda, meta-ads, agenda, calendario, atención, novedades, sync-tn) y no al handler más grande.
 *
 * # Qué había antes
 *
 * `api/_canjes-reglas.js`, que era un **espejo a mano** de `lib/canjes/tipos.ts`: cada función de
 * ahí empezaba con «Espejo de …» y `tests/canjes-flujo.test.ts` tenía un bloque entero comparando
 * los dos lados par por par. Ese bloque es lo que se paga todos los meses en vez de amortizar, y
 * sólo cubría lo que alguien se acordó de comparar: `controlDelTope` y `listoParaEntregar` —el
 * control que impide que un canje de $80.000 salga $200.000, y el que deja entregar en el
 * mostrador— estaban escritos DOS veces con la misma plata en juego y **sin ningún test de
 * espejo**. Los mensajes coincidían carácter por carácter porque alguien los copió bien, no
 * porque algo lo garantizara.
 *
 * # Por qué `.js` y no `.ts`
 *
 * Los `api/*.js` corren en Node sin pasar por el compilador de Next: no pueden importar
 * TypeScript. Un `.js` con `export` lo importan los dos. `lib/canjes/tipos.ts` re-exporta lo de
 * acá con sus tipos, así que las ~40 pantallas que importan de `tipos` no se enteran de nada.
 *
 * # Por qué en `lib/` y no en `api/`
 *
 * Vivía en `api/_canjes-reglas.js` para que `api/_canje-portal.js` —el único endpoint del módulo
 * **sin sesión y abierto a internet**— pudiera usarlo sin arrastrar `_auth.js` y `permisos.core.js`
 * enteros, que es lo que pasa importando de `_canjes.js`. Esa razón sigue en pie y este archivo la
 * respeta: **no importa nada**. Lo que cambia es que ahora tampoco lo copia el otro mundo.
 */

// ── El ciclo de vida ─────────────────────────────────────────────────────────────

/**
 * El grafo. `cancelado` no figura como origen porque se llega desde **cualquier** estado no
 * terminal — lo resuelve `puedeIr`, no la tabla.
 *
 * ⚠️ `propuesta` (nuestra firma) y `enviada` (su respuesta) son dos esperas distintas, y **no hay
 * atajo de `propuesta` a `acuerdo`**: firmar puertas adentro no es que ella haya dicho que sí.
 */
export const TRANSICIONES = {
  propuesta: ['enviada', 'rechazado'],
  enviada: ['acuerdo', 'no_acepto'],
  rechazado: [],
  no_acepto: [],
  acuerdo: ['preparando'],
  preparando: ['en_curso'],
  en_curso: ['cerrado'],
  cerrado: [],
  cancelado: [],
};

/**
 * Los nueve estados. Sale de las claves del grafo y no de una lista aparte: una lista aparte es
 * exactamente el espejo que este archivo vino a borrar.
 */
export const ESTADOS = Object.keys(TRANSICIONES);

/**
 * Los terminales: de acá no se sale. `cancelado` revoca el token del portal.
 *
 * `rechazado` y `no_acepto` son los dos "no" y tienen dueños distintos a propósito: el primero es
 * nuestro y lo firma quien tiene el sub; el segundo es de ella y lo registra quien lleva la
 * conversación. Uno dice algo de nosotros, el otro dice algo de la persona.
 */
export const TERMINALES = ['rechazado', 'no_acepto', 'cerrado', 'cancelado'];

export function esTerminal(estado) {
  return TERMINALES.includes(estado);
}

/** Cancelar sale de cualquier estado que no haya terminado; el resto lo dice la tabla. */
export function puedeIr(desde, hasta) {
  if (hasta === 'cancelado') return !esTerminal(desde);
  return (TRANSICIONES[desde] || []).includes(hasta);
}

/**
 * Por qué no aceptó. Lista cerrada porque es un dato **sobre la persona**: alimenta filtros y el
 * día de mañana el puntaje, y una lista abierta se llena de `no contestó` / `No respondio` /
 * `ni bola`.
 *
 * `'Ahora no, más adelante'` está para que el registro no se ensucie: no es un no, y sin esa
 * opción termina anotado como "No le interesó", que es lo que después mira quien la vuelva a
 * proponer.
 *
 * 🔑 Es una lista cerrada **de los dos lados**: si el servidor no reconoce el motivo que manda la
 * UI, registrar la respuesta devuelve 400 y el canje queda colgado en "esperando respuesta".
 */
export const MOTIVOS_NO_ACEPTO = [
  'No respondió',
  'No le interesó',
  'Pidió más de lo que ofrecimos',
  'Pidió plata',
  'Trabaja con una marca competidora',
  'Ahora no, más adelante',
  'Otro',
];

/** El único que exige nota: sin eso, "Otro" no dice nada dentro de seis meses. */
export const MOTIVO_NO_ACEPTO_OTRO = 'Otro';

// ── Los items y el tope ──────────────────────────────────────────────────────────

/** Los items que cuentan: un quitado o un sin stock no está en el pedido. */
export function itemsVivos(items) {
  return (items || []).filter((i) => i.estado === 'propuesto' || i.estado === 'confirmado');
}

/**
 * ¿Entra un producto más?
 *
 * **Modo monto:** control **duro** sobre la suma de PVP. "Elegí hasta $80.000" es un número y se
 * compara con un número.
 *
 * **Modo unidades:** control **duro sobre el total de unidades** (4, en `2 fundas + 1 jean + 1
 * remera`) y **blando sobre el detalle**. Deliberadamente no se intenta adivinar si algo "es un
 * jean": la categoría de Gestión Nube no es lo bastante prolija para colgar de ahí un bloqueo, y
 * una validación que se equivoca la mitad de las veces se termina apagando. El operador ve la
 * lista acordada al lado de lo que carga y valida a ojo.
 *
 * El mensaje sale en criollo porque **ahora también lo lee ella**, en el teléfono, desde el portal.
 */
export function controlDelTope(c, items) {
  const vivos = itemsVivos(items);

  if (c.tope_tipo === 'unidades') {
    const tope = (c.tope_unidades || []).reduce((a, u) => a + (Number(u.cantidad) || 0), 0);
    const usado = vivos.reduce((a, i) => a + (Number(i.cantidad) || 0), 0);
    const ok = tope === 0 || usado <= tope;
    return {
      ok,
      usado,
      tope: tope || null,
      unidad: 'u',
      mensaje: !tope
        ? 'El acuerdo no tiene unidades cargadas.'
        : ok
          ? `${usado} de ${tope} ${tope === 1 ? 'unidad' : 'unidades'}`
          : `Se pasa del acuerdo: ${usado} ${usado === 1 ? 'unidad' : 'unidades'} contra las ${tope} acordadas.`,
    };
  }

  const tope = c.tope_pvp == null ? null : Number(c.tope_pvp);
  const usado = vivos.reduce((a, i) => a + (Number(i.pvp_unit) || 0) * (Number(i.cantidad) || 0), 0);
  const ok = tope == null || usado <= tope;
  return {
    ok,
    usado,
    tope,
    unidad: '$',
    mensaje: tope == null
      ? 'El acuerdo no tiene tope cargado.'
      : ok
        ? `$${usado.toLocaleString('es-AR')} de $${tope.toLocaleString('es-AR')}`
        : `Se pasa del tope: $${usado.toLocaleString('es-AR')} contra los $${tope.toLocaleString('es-AR')} acordados.`,
  };
}

/**
 * `null` si entra, o el motivo en criollo si se pasa. Es `controlDelTope` visto desde el lado del
 * que valida, y **no vuelve a calcular nada**: era la misma cuenta escrita dos veces, con los
 * mismos mensajes copiados a mano.
 */
export function seVaDelTope(canje, items) {
  const r = controlDelTope(canje, items);
  return r.ok ? null : r.mensaje;
}

/**
 * Cuánto le queda, para mostrárselo mientras elige. Es `controlDelTope` visto desde su lado.
 *
 * ⚠️ **En modo unidades no viaja plata.** No es un olvido: el portal es lo único del módulo abierto
 * a internet, y el precio de lo que se le manda no es asunto de nadie más. En modo monto sí viaja,
 * porque sin el precio de cada cosa y el saldo ella no puede administrarse el tope sola.
 */
export function saldoDelTope(canje, items) {
  const r = controlDelTope(canje, items);
  return { modo: canje.tope_tipo === 'unidades' ? 'unidades' : 'monto', tope: r.tope, usado: r.usado };
}

// ── El resultado comercial ───────────────────────────────────────────────────────

/**
 * Las cuatro respuestas al «¿rindió?», y son cuatro y no tres.
 *
 * 🔑 **`no_se` existe a propósito y es la más importante**: sin ella, el que no sabe pone «nada» y
 * el canje queda registrado como un fracaso que nadie midió. Un vacío tampoco alcanza —un vacío es
 * indistinguible de «no lo contestaron todavía»—, y la diferencia entre esas dos cosas es
 * exactamente lo que hace falta para saber si la pregunta se está usando.
 *
 * ⚠️ **Es una opinión de quien lo cerró, no una medición**: no hay ningún dato que ate una venta a
 * una creadora (ver la §14 de `sql/migrate-canjes.sql`).
 */
export const RESULTADOS = ['vendio', 'algo', 'nada', 'no_se'];

// ── UGC: cuando lo que se le pide no se publica ──────────────────────────────────

/**
 * Los tipos de entregable que **NO se publican**: el material es para nosotros.
 *
 * Va como lista y no como una comparación contra `'contenido'` aunque hoy tenga un solo valor: lo
 * que nombra es la frontera *publica / no publica*, y el día que se separen videos y fotos de UGC lo
 * que cambia es la lista, no la regla.
 */
export const ENTREGABLES_CRUDOS = ['contenido'];

/**
 * ¿Este canje es UGC? O sea: ¿todo lo que se le pidió es material para nosotros, sin publicación?
 *
 * 🔑 **Se DERIVA de los entregables, ⛔ no se guarda en una columna.** El pedido se puede editar
 * mientras la conversación siga abierta (`canje-editar`), así que una bandera guardada al crear
 * empieza a mentir en cuanto alguien le agrega una historia. La derivación no puede.
 *
 * 🔑 **Todos crudos, ⛔ no "alguno" crudo.** Un canje mixto —2 historias + 3 contenidos— **publica**,
 * y a lo que publica le sigue aplicando la pregunta de la venta. Con `some` en vez de `every`, el
 * acuerdo estándar de la marca pasaría a contestarse con las preguntas de UGC.
 *
 * 🔴 **La lista vacía es `false`.** El cero afirma: sin un solo entregable no hay con qué decir que
 * esto es UGC, y un default optimista acá elige la pregunta equivocada en el único canje del que no
 * se sabe nada.
 */
export function esPedidoUgc(entregables) {
  if (!Array.isArray(entregables) || entregables.length === 0) return false;
  return entregables.every((e) => ENTREGABLES_CRUDOS.includes(e && e.tipo));
}

/**
 * Las cuatro respuestas al «¿rindió?» de un canje **UGC**.
 *
 * 🔴 **Ningún valor se comparte con los de venta, salvo `no_se`, y es a propósito.** Si «sirvió»
 * se guardara como `algo`, al leer la columna dentro de seis meses no habría forma de saber **qué
 * pregunta se contestó** — y las dos preguntas no son comparables entre sí. `no_se` sí se comparte
 * porque quiere decir exactamente lo mismo en las dos.
 *
 * ⚠️ Sigue siendo una **opinión**: acá tampoco hay con qué medir. Que el material se haya usado en
 * una pauta lo sabe la persona, no el sistema.
 */
export const RESULTADOS_UGC = ['uso_pauta', 'sirvio', 'no_sirvio', 'no_se'];

/**
 * Qué juego de respuestas corresponde. **De acá salen los botones de la pantalla Y la validación del
 * handler**, que es todo el punto: escritas por separado, la pantalla ofrece un valor que el
 * servidor contesta con 400.
 */
export function resultadosDe(entregables) {
  return esPedidoUgc(entregables) ? RESULTADOS_UGC : RESULTADOS;
}

// ── El retiro en el local ────────────────────────────────────────────────────────

/**
 * Qué marcas pueden ofrecer "lo retira en el local". Hoy **sólo BDI**: es el único que tiene local
 * (Rosario), y la venta a $0 se crea contra el `store_id` de ese local en Gestión Nube.
 *
 * Es una función y no una constante suelta para que la pantalla y el servidor pregunten lo mismo:
 * si un día Zattia abre local, se agrega acá y no en dos lados.
 */
export function retiroLocalDisponible(store) {
  return store === 'bdi';
}

/**
 * Si el local ya puede entregarlo. **De acá salen el botón habilitado y la validación del
 * handler**, que es todo el punto: escritas por separado, la pantalla ofrece algo que el servidor
 * rechaza.
 *
 * Los items tienen que estar linkeados a Gestión Nube (`product_id` + `size_id`) porque sin eso la
 * venta no se puede crear y el stock no baja: entregar sin descontar es peor que no entregar.
 *
 * ⛔ **No exige llegar al tope.** Si se autorizaron 3 fundas y se lleva 2, se cierra con 2 — el
 * tope es un techo, no una cuota.
 */
export function listoParaEntregar(c, items) {
  if (!c.retiro_local) return { ok: false, motivo: 'Este canje no es de retiro en el local.' };
  if (!retiroLocalDisponible(c.store)) return { ok: false, motivo: 'Esta marca no tiene local.' };
  if (c.entregado_at) return { ok: false, motivo: 'Este canje ya figura entregado.' };
  if (c.estado !== 'acuerdo' && c.estado !== 'preparando') {
    return { ok: false, motivo: 'Todavía no está acordado.' };
  }
  const vivos = itemsVivos(items);
  if (!vivos.length) return { ok: false, motivo: 'Cargá lo que se lleva antes de entregarlo.' };
  if (vivos.some((i) => !i.product_id || !i.size_id)) {
    return { ok: false, motivo: 'Hay un producto sin artículo de Gestión Nube: sin eso no se puede descontar el stock.' };
  }
  const tope = controlDelTope(c, items);
  if (!tope.ok) return { ok: false, motivo: tope.mensaje };
  return { ok: true, motivo: null };
}

/**
 * ¿Ya puede subir el contenido por su link?
 *
 * 🔑 **Son DOS cortes, no uno, porque son dos momentos distintos.** Con envío, el buzón se abre
 * cuando el pedido **llegó** (`entregado_at`): antes no tiene nada que mandarnos y pedírselo sería
 * apurarla. Con **retiro en el local** se abre desde que aceptó, que es lo que decidió Bruno el
 * 24-ago-2026: el producto lo va a tener en la mano el día que pase, no hay tránsito que esperar, y
 * el retiro no tiene —como sí tiene el envío— ningún mensaje que le avise después.
 *
 * ⚠️ El corte viejo (`entregado_at` para los dos) dejaba a las de retiro sin buzón hasta que alguien
 * del mostrador marcaba la entrega, y ese mismo canje **no le mostraba el link a nadie**: el bloque
 * que lo empuja vive en el envío, que con retiro local no se dibuja.
 *
 * Vive acá y no en la pantalla porque la contestan los dos lados: el portal decide si lo dibuja y el
 * servidor decide si acepta el archivo. Escritas por separado, la pantalla ofrece subir algo que el
 * servidor rechaza.
 */
export function buzonAbierto(canje) {
  if (!canje) return false;
  return canje.retiro_local ? true : !!canje.entregado_at;
}

/**
 * `null` si el local ya puede entregarlo, o el motivo. La cara que usa el handler.
 *
 * Devuelve el motivo y no un booleano por lo mismo que `seVaDelTope`: el que lo lee es alguien
 * parado en el mostrador con la persona enfrente, y "no se puede" sin decir por qué lo deja
 * llamando por teléfono.
 */
export function noSePuedeEntregar(canje, items) {
  return listoParaEntregar(canje, items).motivo;
}

// ── El número que ve la gente ────────────────────────────────────────────────────

/**
 * Derivado del id, **no es una columna**. Se usa en la pantalla, en el mensaje que se le manda y
 * en el asunto del mail, así que tiene que dar lo mismo en los dos mundos.
 */
export function numeroCanje(id) {
  return 'C-' + String(id).padStart(4, '0');
}

/**
 * `YYYY-MM-DD` en hora **local**, no en UTC.
 *
 * 🔴 No es un detalle: con `toISOString().slice(0,10)` un canje entregado de tarde en Argentina
 * (UTC−3) se fecha al día siguiente, así que el plazo de entrega vence un día antes de lo que dice
 * la pantalla. Los dos espejos ya lo tenían bien, cada uno con su comentario avisándolo.
 */
export function fechaISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
