// El caso y su ESCENARIO — el nivel del medio del chasis de Postventa.
//
// Un reclamo tiene tres bandas: el **inicio** (igual en los once casos: qué venta, quién lo abre,
// qué caso, sobre qué productos, qué pide), el **centro** (distinto en cada uno) y el **final**
// (igual en los once: resolución → movimientos → cierre, que ya vive en `efectos.core.js`).
//
// Este archivo es el centro. Cada caso aporta siempre las mismas cuatro cosas:
//
//   1. **La pregunta que decide.** Una sola. No una lista de "qué debe analizarse": si un caso no
//      se puede reducir a una pregunta, el caso no está entendido.
//   2. **La lista cerrada de escenarios** que la contestan. Es el nivel que hasta el 25-ago-2026
//      NO EXISTÍA: se iba del motivo a la decisión de una, sin dejar registrado qué se encontró.
//   3. **Quién contesta**: nosotros con la evidencia, el cliente, o el sistema (en `no_llego` y en
//      la cancelación la respuesta es el estado del envío, no un relato).
//   4. **La salida de escape**: `reclasificaA`. Cinco casos terminan en "si pasa X, en realidad es
//      otro caso", y eso tiene que ser una acción que conserva la historia, no un consejo al lado.
//
// 🔑 **EL ESCENARIO NO ES UN DATO PARA EL INFORME: ES LO QUE DETERMINA LA PLATA.** Dos casos de
// once no se pueden resolver mirando el motivo:
//
//   - `no_como_publicado` es culpa nuestra **sólo si la diferencia con la publicación es
//     objetiva**. Si el producto coincide y fue una expectativa, no lo es.
//   - `demora` es nuestra **sólo si el pedido quedó parado en preparación**. Si la demora fue del
//     transporte, no — el servicio de logística nacional no depende nuestro.
//   - Y la cancelación **no es un caso**: es el escenario de `arrepentimiento` en que el pedido
//     todavía no salió. Lo único que la separa del arrepentimiento es el estado del pedido, y eso
//     lo contesta el sistema.
//
// Por eso el escenario **modifica el perfil**, y por eso el perfil se mudó acá desde `tipos.ts`:
// lo necesita `api/_reclamos.js` para saber si la decisión puede quedar vacía, y **cuando la regla
// se copia, las copias se despegan** — mismo arreglo que `permisos.core.js` y `efectos.core.js`.
// La cara tipada está en `lib/reclamos/tipos.ts`; acá no hay tipos, hay reglas.

// ── El perfil de cada caso ──────────────────────────────────────────────────────
//
// Todo lo que cambia de un caso a otro sale de acá, y sale de **tres preguntas físicas**: ¿el
// producto salió del depósito? ¿la unidad existe? ¿el producto está en juego? Con eso se derivan
// el stock, la plata, las fotos y qué se le puede ofrecer. Antes cada una de esas respuestas era
// un `includes` suelto en un archivo distinto, y por eso se contradecían.
//
// ⚠️ `talle`, `arrepentimiento` y `no_esperaba` son **el mismo flujo con tres etiquetas**. Se
// mantienen separados a propósito: cada uno mide algo distinto y es la única señal de por qué
// vuelven las cosas — el talle mide la guía de talles, "no era lo que esperaba" mide la ficha de
// producto, y el arrepentimiento no mide nada nuestro. Fusionarlos ahorraría una línea de código y
// perdería el dato.

export const PERFIL_MOTIVO = {
  talle: {
    ayuda: 'Llegó lo que pidió, en buen estado, pero no le entra. Es lo que mide si la guía de talles está bien.',
    salio: true, unidadExiste: true, recibioAlgo: true, errorPropio: false, ventaCompleta: false, decideCliente: true,
    productoEnJuego: true,
    fotos: 'si_quiere_plata', expectativas: ['otro_producto', 'plata'], retencion: true,
  },
  arrepentimiento: {
    ayuda: 'Se arrepintió, sin más. Llegó bien y es lo que pidió: no mide nada nuestro. Si el pedido todavía no salió, el escenario lo vuelve una cancelación.',
    salio: true, unidadExiste: true, recibioAlgo: true, errorPropio: false, ventaCompleta: false, decideCliente: true,
    productoEnJuego: true,
    fotos: 'si_quiere_plata', expectativas: ['plata', 'otro_producto'], retencion: true,
  },
  no_esperaba: {
    ayuda: 'Llegó lo que pidió pero no era como se lo imaginaba. Es lo que mide si la ficha de producto (fotos, descripción, medidas) está engañando.',
    // ⚠️ Hasta el 25-ago-2026 este motivo mezclaba DOS casos: "no me gustó" (no es nuestro) y "la
    // publicación está mal" (sí lo es). El segundo salió a `no_como_publicado`, así que acá queda
    // sólo la expectativa — y por eso `errorPropio` se queda en `false` sin depender del escenario.
    salio: true, unidadExiste: true, recibioAlgo: true, errorPropio: false, ventaCompleta: false, decideCliente: true,
    productoEnJuego: true,
    fotos: 'si_quiere_plata', expectativas: ['plata', 'otro_producto'], retencion: true,
  },
  no_como_publicado: {
    ayuda: 'Lo que recibió no coincide con lo que publicamos. Se mide contra la ficha y las fotos, no contra el relato: la decidimos nosotros, y por eso es distinto de "no era lo que esperaba".',
    // 🔑 Arranca en `errorPropio: false` A PROPÓSITO y lo sube el escenario. Sin escenario cargado
    // no se sabe si la diferencia es objetiva, y afirmarlo por default sería regalar el envío en
    // cada caso que en realidad era una expectativa.
    salio: true, unidadExiste: true, recibioAlgo: true, errorPropio: false, ventaCompleta: false, decideCliente: false,
    productoEnJuego: true,
    fotos: 'siempre', expectativas: ['plata', 'otro_producto'], retencion: true,
  },
  falla: {
    ayuda: 'Llegó con un defecto: mancha, costura, rotura. Error nuestro o del proveedor. Las fotos son la prueba y las decidimos nosotros.',
    salio: true, unidadExiste: true, recibioAlgo: true, errorPropio: true, ventaCompleta: false, decideCliente: false,
    productoEnJuego: true,
    fotos: 'siempre', expectativas: ['mismo_producto', 'plata', 'otro_producto'], retencion: true,
  },
  faltante: {
    ayuda: 'El paquete llegó pero faltaba un producto adentro. La unidad sigue en el depósito: no salió. Distinto de "pedido mal armado", donde llegó otra cosa en su lugar.',
    salio: false, unidadExiste: true, recibioAlgo: true, errorPropio: true, ventaCompleta: false, decideCliente: false,
    productoEnJuego: true,
    fotos: 'de_lo_recibido', expectativas: ['completar', 'plata'], retencion: false,
  },
  mal_armado: {
    ayuda: 'Le llegó un producto distinto al que compró. Hay que corregir dos stocks: el que pidió no salió y el que se mandó por error salió sin descontarse.',
    salio: false, unidadExiste: true, recibioAlgo: true, errorPropio: true, ventaCompleta: false, decideCliente: false,
    productoEnJuego: true,
    fotos: 'siempre', expectativas: ['completar', 'plata'], retencion: false,
  },
  excedente: {
    ayuda: 'Le llegó un producto DE MÁS, que no compró. Es el único caso que toca DOS ventas: se anota de qué otra venta salió —y cerrar lo exige—, y el faltante de esa otra lo abre una persona.',
    // No hay plata del cliente en juego —no pagó nada de más—, así que la resolución normal es
    // recuperar la unidad o cerrar sin recuperarla. Lo que sí hay es una unidad que salió del
    // depósito sin que GN se entere.
    salio: true, unidadExiste: true, recibioAlgo: true, errorPropio: true, ventaCompleta: false, decideCliente: false,
    productoEnJuego: true,
    fotos: 'de_lo_recibido', expectativas: [], retencion: false,
  },
  demora: {
    ayuda: 'El pedido llegó (o va a llegar) tarde. No vuelve nada y no hay stock que mover: lo único que se decide es si la demora fue nuestra, y eso lo contesta el escenario con las fechas.',
    // 🔑 El caso que obliga al final a tolerar CERO movimientos: `productoEnJuego: false`. El
    // producto llegó y se queda con él, así que no hay destino que elegir — y hasta el 25-ago-2026
    // `decidir` exigía uno, o sea que una demora no se podía cerrar nunca.
    salio: true, unidadExiste: true, recibioAlgo: true, errorPropio: false, ventaCompleta: true, decideCliente: false,
    productoEnJuego: false,
    fotos: 'nunca', expectativas: [], retencion: false,
  },
  no_llego: {
    ayuda: 'El pedido nunca llegó a destino: se perdió en el transporte. Va sobre la venta completa y en paralelo se le reclama al transportista, que es plata recuperable.',
    // 🔑 El error es del TRANSPORTISTA, no nuestro — y aun así se le devuelve el envío, porque no
    // recibió nada. Son dos razones distintas para el mismo resultado, y por eso son dos preguntas.
    salio: true, unidadExiste: false, recibioAlgo: false, errorPropio: false, ventaCompleta: true, decideCliente: true,
    productoEnJuego: true,
    fotos: 'nunca', expectativas: ['completar', 'plata'], retencion: false,
  },
  sin_stock: {
    ayuda: 'Entró la venta pero el producto no existe. El cliente no recibió nada ni está enterado: se le avisa y ELIGE ÉL entre cambiarlo o que le devolvamos la plata.',
    salio: false, unidadExiste: false, recibioAlgo: false, errorPropio: true, ventaCompleta: true, decideCliente: true,
    productoEnJuego: true,
    fotos: 'nunca', expectativas: ['otro_producto', 'plata'], retencion: false,
  },
  // Históricos: quedan para que una fila vieja no reviente. Se comportan como su equivalente.
  no_era_lo_esperado: {
    ayuda: 'Motivo histórico. Usá "No era lo que esperaba".',
    salio: true, unidadExiste: true, recibioAlgo: true, errorPropio: false, ventaCompleta: false, decideCliente: true,
    productoEnJuego: true,
    fotos: 'si_quiere_plata', expectativas: ['plata', 'otro_producto'], retencion: true,
  },
  otro: {
    ayuda: 'Motivo histórico, sin flujo propio. Elegí el que corresponda.',
    // Catch-all, y también lo que se guarda en un cambio sin motivo. No se puede afirmar que el
    // error fue nuestro, así que no se regala el envío.
    salio: true, unidadExiste: true, recibioAlgo: true, errorPropio: false, ventaCompleta: false, decideCliente: false,
    productoEnJuego: true,
    fotos: 'si_quiere_plata', expectativas: ['plata', 'otro_producto'], retencion: true,
  },
};

/**
 * **Los casos en que el producto está SANO por definición**, o sea donde ⛔ no se puede elegir
 * «Fallado» como destino.
 *
 * 🔴 Es política, ⛔ no una derivación: ninguna bandera del perfil dice «acá no hay defecto».
 * Los cuatro son el mismo caso visto de cuatro maneras — llegó lo que pidió, en buen estado, y no
 * le sirve. Ofrecer «Fallado» ahí mete una unidad impecable en el ledger de Fallas, valuada a PVP
 * de feria, y ensucia el único número que dice cuánta plata se pierde en fallas de verdad.
 *
 * ⚠️ **Si además de no gustarle vino con un defecto, el camino es `reclasificar`**, que muda el
 * caso conservando número, fotos e historial. Esconder la opción es lo que empuja a usarlo.
 */
export const MOTIVOS_SIN_FALLA = ['arrepentimiento', 'no_esperaba', 'talle', 'no_era_lo_esperado'];

/**
 * **Los destinos que tiene sentido ofrecer para este caso.** Vacío = no hay producto en juego.
 *
 * 🔑 Sale del perfil **con el escenario aplicado**, igual que `destinoDe` — y por eso el escenario
 * es parámetro obligatorio. Hasta el 27-ago-2026 la pantalla ofrecía **los cinco siempre**, así que
 * se podía marcar «Se perdió en el transporte» sobre un producto que el cliente tenía en la mano, o
 * «Nunca salió del depósito» sobre uno que llegó.
 *
 * 🔴 **El invariante que lo ata a la realidad**: lo que sugiere `destinoDe` tiene que estar SIEMPRE
 * en esta lista. Si no, la pantalla arrancaría con un destino que ella misma no ofrece — y hay un
 * test que lo recorre caso por caso y escenario por escenario.
 *
 * @param {string} motivo
 * @param {string|null|undefined} escenario
 * @returns {string[]}
 */
export function destinosDe(motivo, escenario) {
  const p = perfilDe(motivo, escenario);
  // Una demora, una cancelación: no vuelve nada y no hay stock que mover. El final queda vacío.
  if (!p.productoEnJuego) return [];
  // La unidad sigue en el depósito (faltante, mal armado, sin stock): nunca salió, y por eso no
  // puede estar ni sana en manos del cliente ni perdida en el camino.
  if (!p.salio) return ['no_salio'];
  // Salió y no llegó: sólo se pudo perder. ⛔ No hay unidad que vuelva ni que se quede nadie.
  if (!p.recibioAlgo) return ['perdida'];
  // El cliente la tiene: vuelve sana, vuelve fallada, o se la queda.
  return MOTIVOS_SIN_FALLA.includes(motivo)
    ? ['stock', 'regalada']
    : ['stock', 'falla', 'regalada'];
}

// ── Los escenarios ──────────────────────────────────────────────────────────────
//
// Cada caso: la pregunta que decide, quién la contesta, y la lista CERRADA que la responde.
//
// Un escenario puede traer tres cosas, todas opcionales:
//   - `perfil`: lo que cambia del perfil del caso. **Es la plata**, y por eso está acotado a las
//     mismas claves del perfil: nadie inventa un campo nuevo en una fila de esta tabla.
//   - `reclasificaA`: el caso que corresponde de verdad. La pantalla ofrece mudarlo, y el reclamo
//     conserva su número y su historia.
//   - `soloSeguimiento`: todavía no hay caso que decidir, hay algo que mirar.

/** Quién contesta la pregunta que decide. El sistema son las fechas y los estados del envío. */
export const CONTESTA = {
  NOSOTROS: 'nosotros',
  CLIENTE: 'cliente',
  SISTEMA: 'sistema',
};

export const CASOS = {
  no_esperaba: {
    pregunta: '¿La diferencia es objetiva, o es una expectativa?',
    contesta: CONTESTA.NOSOTROS,
    detalle: 'Nosotros clasificamos; la salida la elige el cliente. Es la línea de base contra la que se lee "no es como en la publicación".',
    escenarios: [
      { clave: 'coincide', label: 'Coincide con lo vendido — no le gustó, y eso no es una falla' },
      { clave: 'info_confusa', label: 'La información comercial pudo confundir — hay algo que revisar en la publicación' },
      { clave: 'diferencia_objetiva', label: 'Hay una diferencia objetiva — ya no es este caso', reclasificaA: 'no_como_publicado' },
    ],
  },
  no_como_publicado: {
    pregunta: '¿Lo que recibió coincide con lo que publicamos?',
    contesta: CONTESTA.NOSOTROS,
    detalle: 'La foto va contra la publicación, no contra el relato.',
    escenarios: [
      { clave: 'coincide', label: 'Coincide — es una expectativa, no un error nuestro', reclasificaA: 'no_esperaba' },
      { clave: 'menor_esperable', label: 'Diferencia menor o esperable — variación de lote, tolerancia de medida: hay que decir si estaba informada' },
      // 🔑 La única fila de todo el archivo que enciende `errorPropio` en un caso que arranca en
      // `false`. Con esto se le devuelve también el envío de ida: la publicación estaba mal.
      { clave: 'diferencia_objetiva', label: 'Diferencia objetiva y relevante — la publicación está mal', perfil: { errorPropio: true } },
      { clave: 'no_es_el_producto', label: 'No es el producto que compró — es otro artículo', reclasificaA: 'mal_armado' },
    ],
  },
  falla: {
    pregunta: '¿Está a una reparación de poder usarse?',
    contesta: CONTESTA.NOSOTROS,
    detalle: 'Acá la foto es la prueba: sin ella no se decide. Y no es para repararlo nosotros — es para saber cuánto conviene ofrecerle para que se lo quede.',
    // Las claves son las de `GRAVEDAD_DEF` (`util` / `inutil`) a propósito: la gravedad ya existía
    // como estado suelto de la pantalla de decidir y de ahí sale el PVP de feria. Ahora se guarda.
    escenarios: [
      { clave: 'util', label: 'Sí — un botón, una costura chica, un hilo suelto. Con un arreglo queda usable' },
      { clave: 'inutil', label: 'No se recupera — mancha grande, rotura, falla estructural' },
    ],
  },
  mal_armado: {
    pregunta: '¿Qué salió del depósito, y qué tendría que haber salido?',
    contesta: CONTESTA.NOSOTROS,
    detalle: 'Con foto de lo que recibió. El producto que salió mal se descuenta siempre con una venta técnica, vuelva o se lo quede el cliente.',
    escenarios: [
      { clave: 'otro_producto', label: 'Error confirmado — salió otro producto' },
      { clave: 'otra_variante', label: 'Diferencia parcial — es el producto, pero no la variante' },
      { clave: 'sin_diferencia', label: 'No hay diferencia — coincide con la compra', reclasificaA: 'talle' },
    ],
  },
  faltante: {
    pregunta: '¿Faltó el producto entero, o una parte de él?',
    contesta: CONTESTA.NOSOTROS,
    detalle: 'Foto de lo que SÍ recibió, no de lo que falta. Mide la preparación.',
    escenarios: [
      { clave: 'no_preparado', label: 'No se preparó — nunca entró al bulto' },
      { clave: 'descuadre', label: 'Descuadre entre lo registrado y el contenido real' },
      { clave: 'traslado', label: 'Incidencia en el traslado' },
      // 🔑 Cambia el movimiento: se manda el componente y NO hay reingreso. ⛔ Y NO mueve el
      // perfil: `unidadExiste` sigue en `true` porque la unidad sigue estando en el depósito, y
      // ponerlo en `false` pediría darla de baja en GN, que es el movimiento contrario. El "sin
      // reingreso" ya sale solo de la resolución (`reenvio` no reingresa nada en la tabla de
      // efectos): es un efecto del final, no una pregunta física del caso.
      { clave: 'componente', label: 'Faltó un componente — el producto principal llegó bien' },
    ],
  },
  excedente: {
    pregunta: '¿De qué venta es el producto que llegó de más?',
    contesta: CONTESTA.NOSOTROS,
    detalle: 'Si está identificada se anota el número, y cerrar el reclamo lo exige: del otro lado hay un cliente al que le falta esto y todavía no reclamó. Abrirle el faltante lo hace una persona.',
    escenarios: [
      { clave: 'otra_venta', label: 'Es de otra venta, identificada — se guarda cuál y se avisa' },
      { clave: 'sin_identificar', label: 'Es de otra venta, sin identificar — queda para investigar' },
      { clave: 'de_nadie', label: 'Se envió por error y no es de nadie' },
    ],
  },
  demora: {
    pregunta: '¿La demora fue antes o después del despacho?',
    contesta: CONTESTA.SISTEMA,
    detalle: 'Lo contestan las fechas de venta, preparación, despacho y entrega. Si fue del transporte, enciende el reclamo al transportista: esa plata es nuestra, no del cliente.',
    escenarios: [
      // La única demora que se compensa, y con un cupón a compra futura: quedó parada en casa.
      { clave: 'antes_despacho', label: 'Antes del despacho — es nuestra: quedó en preparación', perfil: { errorPropio: true } },
      { clave: 'transporte', label: 'Durante el transporte — es del transportista' },
      { clave: 'plazo_mal_informado', label: 'El plazo informado no era claro — es de la comunicación comercial' },
    ],
  },
  no_llego: {
    pregunta: '¿Dónde está el paquete?',
    contesta: CONTESTA.SISTEMA,
    detalle: 'Lo contestan primero los movimientos del envío, y después nosotros. Se da por perdido recién en el último escenario.',
    escenarios: [
      { clave: 'en_transito', label: 'Sigue en tránsito — todavía no es un caso perdido', soloSeguimiento: true },
      { clave: 'demorado', label: 'Demora significativa — hay que seguirlo', soloSeguimiento: true },
      { clave: 'sin_movimientos', label: 'Sin movimientos recientes — hay que investigarlo', soloSeguimiento: true },
      { clave: 'dice_entregado', label: 'El sistema dice entregado y el cliente dice que no' },
      { clave: 'extraviado', label: 'Extraviado — recién acá se da por perdido' },
      { clave: 'llego_tarde', label: 'Finalmente llegó, tarde — ya no es este caso', reclasificaA: 'demora' },
    ],
  },
  talle: {
    pregunta: '¿Hay stock del talle que pide?',
    contesta: CONTESTA.CLIENTE,
    detalle: 'El cliente elige; nosotros verificamos el stock. Mide la guía de talles.',
    escenarios: [
      { clave: 'hay_stock', label: 'Hay stock — sigue el cambio' },
      { clave: 'sin_stock', label: 'No hay — hay que ofrecer una alternativa' },
      { clave: 'otro_talle', label: 'Recibió un talle distinto al que compró — no es este caso', reclasificaA: 'mal_armado' },
    ],
  },
  arrepentimiento: {
    pregunta: '¿En qué estado está el pedido?',
    contesta: CONTESTA.SISTEMA,
    detalle: 'Arrepentimiento y cancelación son UN caso con dos escenarios: lo único que los separa es el estado del pedido. Monitor registra y avisa si todavía se puede frenar — no detiene la preparación ni escribe en Gestión Nube.',
    escenarios: [
      // 🔑 La cancelación. El pedido no salió, el cliente no recibió nada y no hay producto en
      // juego: el final queda vacío de movimientos de producto y sólo vuelve la plata (con el
      // envío, porque nunca prestó servicio).
      {
        clave: 'se_puede_frenar',
        label: 'Pendiente · en preparación · preparado — todavía se puede frenar: es una cancelación',
        perfil: { salio: false, recibioAlgo: false, productoEnJuego: false },
      },
      { clave: 'ya_salio', label: 'Despachado · en tránsito · entregado — ya no se puede frenar: hay que traerlo de vuelta' },
    ],
  },
  sin_stock: {
    pregunta: '¿Se repone, hay una alternativa, o no hay nada?',
    contesta: CONTESTA.CLIENTE,
    detalle: 'Es el único caso donde la decisión es del cliente, porque ni siquiera sabía que había un problema. Y es lo único que no se puede reenviar: el producto no existe.',
    escenarios: [
      { clave: 'se_repone', label: 'Se repone en un plazo razonable — se le puede proponer esperar' },
      { clave: 'hay_alternativa', label: 'Hay un producto alternativo — se le ofrece' },
      { clave: 'no_hay', label: 'No hay disponibilidad — hay que definir la salida' },
    ],
  },
};

/** Las claves del perfil que un escenario tiene permitido mover. Nada más entra. */
const PERFIL_MOVIBLE = ['salio', 'unidadExiste', 'recibioAlgo', 'errorPropio', 'productoEnJuego'];

/** Los escenarios de un caso, en el orden en que se preguntan. Vacío = el caso no tiene centro. */
export function escenariosDe(motivo) {
  return CASOS[motivo]?.escenarios || [];
}

/** La ficha del centro: la pregunta que decide, quién contesta, y la lista. */
export function casoDe(motivo) {
  return CASOS[motivo] || null;
}

/** Un escenario concreto, o null. Un escenario de OTRO caso no cuenta: la lista es cerrada. */
export function escenarioDe(motivo, escenario) {
  if (!escenario) return null;
  return escenariosDe(motivo).find((e) => e.clave === escenario) || null;
}

/** ¿Este escenario pertenece a este caso? Es lo que valida el handler antes de guardar. */
export function esEscenarioDe(motivo, escenario) {
  return !!escenarioDe(motivo, escenario);
}

/**
 * **El perfil del caso con el escenario aplicado.** Es la única función que sabe combinarlos, y
 * todo lo que decide plata o stock sale de acá.
 *
 * El escenario es un parámetro **obligatorio**, aunque valga `null`: sin él, un caso cuyo perfil
 * depende del escenario (la publicación, la demora, la cancelación) contestaría en silencio con el
 * default seguro y nadie se enteraría de que faltaba el dato.
 */
export function perfilDe(motivo, escenario) {
  const base = PERFIL_MOTIVO[motivo] || PERFIL_MOTIVO.otro;
  const esc = escenarioDe(motivo, escenario);
  if (!esc || !esc.perfil) return base;
  const perfil = { ...base };
  for (const k of PERFIL_MOVIBLE) {
    if (Object.prototype.hasOwnProperty.call(esc.perfil, k)) perfil[k] = esc.perfil[k];
  }
  return perfil;
}

/**
 * ¿Hay un producto en juego?
 *
 * La **tercera pregunta física**, al lado de "¿salió del depósito?" y "¿la unidad existe?". En una
 * demora y en una cancelación la respuesta es NO: no hay nada que devolver, reingresar ni dar de
 * baja. Es lo que deja que el final quede vacío sin que sea un error — hasta el 25-ago-2026
 * `decidir` exigía un destino de producto siempre, así que una demora no se podía cerrar nunca.
 */
export function productoEnJuego(motivo, escenario) {
  return perfilDe(motivo, escenario).productoEnJuego !== false;
}

/**
 * El caso al que hay que mudarlo, si el escenario dice que en realidad es otro.
 *
 * ⚠️ Es una **salida de escape con historia**: se muda el caso y el reclamo conserva su número, sus
 * fotos y su relato. El `.docx` de casos lo decía como un consejo al costado ("si pasa X, en
 * realidad es otro caso") y así no lo hace nadie.
 */
export function reclasificaA(motivo, escenario) {
  return escenarioDe(motivo, escenario)?.reclasificaA || null;
}

/** ¿El escenario dice que todavía no hay caso, sino algo que mirar? Sólo pasa en `no_llego`. */
export function esSoloSeguimiento(motivo, escenario) {
  return escenarioDe(motivo, escenario)?.soloSeguimiento === true;
}

/**
 * ¿Hay que presentarle un reclamo al transportista?
 *
 * Es **plata recuperable NUESTRA**, no del cliente, y corre en paralelo: no espera a ninguna
 * resolución. Si el caso se cierra sin presentarlo, esa plata se perdió y nadie se entera.
 *
 *   - `no_llego`: siempre. Ya se encendía al crear el reclamo.
 *   - `demora`: **sólo si la demora fue del transporte**. Es el segundo lugar donde el escenario, y
 *     no el caso, decide adónde va la plata.
 */
export function pideReclamoAlTransportista(motivo, escenario) {
  if (motivo === 'no_llego') return true;
  return motivo === 'demora' && escenario === 'transporte';
}

// ── La oferta de retención: qué se ofreció y qué contestó ───────────────────────
//
// *"La salida ideal es el cupón, pero capaz la persona puede no aceptarlo, y continúa el cambio o
// devolución"* (Bruno, 24-ago-2026).
//
// Hasta el 25-ago-2026 de la retención existía **sólo el permiso**: `retencion` en el perfil dice
// si se le puede ofrecer, y de la oferta en sí no quedaba nada. La que salía bien se podía
// adivinar —el reclamo termina en `plata_parcial` o en `cupon`—, pero **la rechazada no dejaba
// rastro**, y con la mitad de los casos invisible no se puede decir cuántas veces funciona.
// Sin ese número, negociar un cupón es una forma de pagar menos de lo que corresponde sin que
// nadie se entere.
//
// 🔑 **Las dos mitades van juntas o no va ninguna.** Un monto sin respuesta ("le ofrecí $6.000" y
// nunca se supo) o una respuesta sin monto ("no aceptó" qué) son media oferta, y media oferta es
// justo lo que hace que la cuenta mienta después.
//
// ⚠️ **Vacío ⛔ NO es "no se le ofreció": es SIN REGISTRAR.** Es el mismo cuidado que las tres
// respuestas de "¿qué se fotografió?": los reclamos anteriores a esta columna no contestaron nada,
// y darlos por negativa contaría como rechazo una oferta que capaz se hizo.

/** Las dos respuestas posibles. Lista cerrada: la valida el handler antes de escribir. */
export const RESPUESTAS_RETENCION = {
  acepto: 'Aceptó: se lo queda',
  rechazo: 'No aceptó: sigue el cambio o la devolución',
};

export function esRespuestaRetencion(v) {
  return Object.prototype.hasOwnProperty.call(RESPUESTAS_RETENCION, String(v));
}

/**
 * ¿Se le puede ofrecer un descuento o un cupón para que se lo quede?
 *
 * Vive acá y ya no en `tipos.ts` porque ahora lo necesita también `api/_reclamos.js`: es el que
 * decide si una oferta registrada corresponde. Mismo arreglo que `perfilDe`.
 *
 * Sólo tiene sentido si el producto está en su poder: en una demora o en una cancelación no hay
 * nada que quedarse. La cuenta de cuánto ofrecer la hace `cuentaDescuento` (`tipos.ts`).
 */
export function ofreceRetencion(motivo, escenario) {
  return perfilDe(motivo, escenario).retencion === true && productoEnJuego(motivo, escenario);
}

/**
 * Lo que se guarda de la oferta, validado. Devuelve `{ error }` o `{ campos }`.
 *
 * Los cinco parámetros son **obligatorios** aunque tres puedan valer `null`, por lo mismo que el
 * escenario: un llamador que no los manda no puede terminar guardando un registro a medias sin
 * enterarse de que le faltaba el dato.
 *
 * @param {{ motivo: string, escenario: string|null, respuesta: string|null, monto: number|null,
 *           retornoDecidido: boolean }} o
 */
export function registroDeRetencion(o) {
  const { motivo, escenario, respuesta, monto, retornoDecidido } = o;
  const hayMonto = monto != null && Number(monto) > 0;

  // Sin respuesta no se toca nada: mandar la decisión desde una pantalla que no conoce la oferta
  // ⛔ no puede BORRAR la que ya estaba registrada. Misma regla que el escenario.
  if (respuesta == null || respuesta === '') {
    return hayMonto ? { error: 'falta qué contestó a la oferta de que se lo quede' } : { campos: {} };
  }
  if (!esRespuestaRetencion(respuesta)) {
    return { error: `"${respuesta}" no es una respuesta a la oferta` };
  }
  if (!ofreceRetencion(motivo, escenario)) {
    return { error: `en este caso no se ofrece que se lo quede, así que no hay oferta que registrar` };
  }
  if (!hayMonto) {
    return { error: 'falta cuánto se le ofreció' };
  }
  // Si se lo queda, no vuelve nada. Registrar las dos cosas a la vez deja el producto contado dos
  // veces: esperándolo en la bandeja de retornos y en poder del cliente.
  if (respuesta === 'acepto' && retornoDecidido === true) {
    return { error: 'si acepta quedárselo, el producto no vuelve: sacá el pedido de retorno' };
  }
  return { campos: { retencion_respuesta: respuesta, retencion_monto: Number(monto) } };
}
