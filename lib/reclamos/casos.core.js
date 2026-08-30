import { pendientesDe } from './efectos.core.js';
import { costoDeLaFila } from './plata.core.js';
import { loQueFaltaDescontar, loQueFaltaLlegar, sinLaOtraVenta } from './unidades.core.js';

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
 * Los estados en los que un reclamo **sigue vivo**. `cerrado` y `anulado` quedan afuera.
 *
 * 🔴 Vive en el núcleo y ⛔ no en la pantalla porque lo leen **tres lugares**: la lista de Reclamos,
 * el aviso del sidebar y —desde el 29-ago-2026— **el `select` del handler**. Una segunda copia es el
 * modo de falla propio de este módulo, y acá se pagaría caro: un reclamo `anulado` con un pendiente
 * viejo sin tildar sigue cumpliendo la condición de la alerta de plata, así que la copia que se
 * olvide de filtrarlo avisa **para siempre** de algo que ya no existe.
 *
 * 🔑 **Bajó de `tipos.ts` a este archivo el 29-ago-2026 (D12)** por el motivo de siempre: lo
 * necesita `api/_reclamos.js`, y `api/*.js` ⛔ no puede importar TypeScript. En `tipos.ts` quedó la
 * cara tipada, igual que `faltantesParaCerrar`, `destinoDe` y `perfilDe`.
 */
export const ESTADOS_ABIERTOS = [
  'borrador', 'esperando_cliente', 'en_revision', 'resuelto', 'en_transito', 'recibido',
];

/** ¿El reclamo sigue vivo? Ver `ESTADOS_ABIERTOS`. */
export function estaAbierto(d) {
  return ESTADOS_ABIERTOS.includes(d && d.estado);
}

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
 * **¿Este caso tiene fotos que pedirle al cliente?**
 *
 * 🔴 La regla vivía **sólo en `tipos.ts`** (`pideFotos`), o sea en TypeScript, y por eso el portal
 * del cliente —`api/_reclamo.js`, que ⛔ no puede importar TS— ⛔ no la podía leer: exigía una foto
 * para poder enviar **en todos los casos**. En «todavía no me llegó» y en una demora eso es pedirle
 * una foto **de la nada** a quien ⛔ no recibió el paquete ⇒ el botón de enviar ⛔ nunca se prendía y
 * el reclamo se quedaba en `borrador` para siempre. Del lado del cliente eso se ve igual que «el
 * link no anda», y lo abre justo el caso más caro de dejar sin atender.
 *
 * 🔑 Baja acá por el motivo de siempre —lo necesita un `api/*.js`— y `tipos.ts` se queda con la
 * **cara tipada**, igual que `faltantesParaCerrar`, `destinoDe` y `perfilDe`. Una segunda copia es
 * el modo de falla propio de este módulo: la del portal ya se despegó cuatro veces.
 *
 * ⚠️ Es **por MOTIVO y ⛔ no por escenario**: `fotos` ⛔ no está en `PERFIL_MOVIBLE`, así que ningún
 * escenario lo mueve. Ver el `si_quiere_plata` de `tipos.ts`, que quedó equivalente a `siempre` a
 * propósito.
 */
export function pideFotosAlCliente(motivo) {
  return (PERFIL_MOTIVO[motivo] || {}).fotos !== 'nunca';
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
 * **En qué se le ofrece que se lo quede.** Las dos cuestan cosas distintas y por eso hay que saber
 * cuál fue: la plata sale de la caja **hoy**; el cupón sale **sólo si el cliente vuelve a comprar**.
 *
 * 🔑 Sin esta distinción un `acepto` por $6.500 en efectivo y uno por $6.500 en cupón salen iguales
 * de la base — que es el mismo agujero que `retencion_respuesta` vino a tapar el 25-ago-2026:
 * **existía el numerador y no el denominador.** Acá existía el monto y no en qué estaba expresado.
 *
 * ▶️ **Cuánto vale el cupón frente al reembolso está SIN DEFINIR a propósito** (Bruno, 27-ago:
 * *«habría que definirlo según análisis económico»*). Hasta entonces el monto lo tipea la persona y
 * ⛔ no lo deriva nadie. ⚠️ El costo de eso: con el monto libre se puede medir cuántas veces se
 * ofreció cada forma y cuántas funcionó, pero ⛔ **no si el monto era el correcto**.
 */
export const FORMAS_RETENCION = {
  plata: 'Le devolvemos una parte',
  cupon: 'Le damos un cupón',
};

export function esFormaRetencion(v) {
  return Object.prototype.hasOwnProperty.call(FORMAS_RETENCION, String(v));
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
 * **En qué termina el reclamo cuando ACEPTA quedárselo.**
 *
 * 🔴 ⛔ No es cosmético y por eso no vive en la pantalla: de la resolución cuelga
 * `EFECTOS_RESOLUCION`, y `cupon` es la única que deja **`cupon_estado: 'pendiente'`** — o sea el
 * pendiente de **crearlo en la tienda**. Hasta el 27-ago-2026 aceptar la oferta caía siempre en
 * `plata_parcial`: con un cupón eso hacía dos cosas mal a la vez —**sacaba de la caja una plata que
 * nunca salió** y **cerraba el reclamo sin que el cupón existiera**, así que el cliente se enteraba
 * en la próxima compra de que el código no anda—. Es el mismo agujero que el módulo ya tuvo con la
 * promesa del cupón, entrando por otra puerta.
 *
 * @param {string} forma
 * @returns {string}
 */
export function salidaAlAceptarRetencion(forma) {
  return forma === 'cupon' ? 'cupon' : 'plata_parcial';
}

/**
 * Lo que se guarda de la oferta, validado. Devuelve `{ error }` o `{ campos }`.
 *
 * Los parámetros son **obligatorios** aunque varios puedan valer `null`, por lo mismo que el
 * escenario: un llamador que no los manda no puede terminar guardando un registro a medias sin
 * enterarse de que le faltaba el dato.
 *
 * ⚠️ **`forma` entró el 27-ago-2026 y es el sexto obligatorio**, por lo mismo que los otros: una
 * oferta registrada sin decir si fue plata o cupón queda indistinguible de la otra, y las dos
 * cuestan cosas distintas. Un llamador que no la manda ⛔ no puede guardar la oferta a medias.
 *
 * 🔴 **«Le ofrecí y todavía no contestó» es un ESTADO, ⛔ no un error** (27-ago-2026). Hasta hoy
 * esta función exigía monto, forma y respuesta **las tres juntas**, así que el momento más común
 * del circuito —Administración arma la propuesta, el local la manda, el cliente tarda un día en
 * contestar— **no se podía guardar en ningún lado**. La regla de «las tres juntas» se había
 * escrito por una razón buena (media oferta hace mentir la cuenta de cuántas veces funciona),
 * pero confundía dos cosas distintas:
 *
 *   - **nada registrado** — no sabemos si hubo oferta ⇒ `{ campos: {} }`, ⛔ no se toca nada;
 *   - **oferta hecha, sin respuesta** — monto + forma, `retencion_respuesta` en `null` ⇒ es el
 *     estado que espera al cliente, y es lo que el local tiene que poder ver y contestar;
 *   - **oferta contestada** — las tres.
 *
 * 🔑 El denominador de la métrica sale de la **oferta HECHA**, no de la contestada: registrar la
 * que todavía no volvió ⛔ no ensucia la cuenta, la completa. Lo que sí seguiría mintiendo es una
 * respuesta sin monto ("no aceptó" ¿qué?), y eso sigue siendo error.
 *
 * ⚠️ **Una respuesta ⛔ no se borra sola.** Un llamador que sólo sabe del monto manda
 * `respuesta: null` y deja la fila sin respuesta — que es correcto cuando está registrando la
 * oferta, y es por eso que la pantalla ⛔ no manda el monto cuando no está tocando la oferta.
 *
 * ## `retencion_at`: desde cuándo se espera
 *
 * 🔴 **La fecha de la oferta se sella UNA sola vez** (`retencionAt || ahora`) y ⛔ no se reescribe
 * al volver a guardar. Es literalmente la lección de `updated_at`: si cada toque la moviera,
 * **ocuparse del caso apagaría el reloj de que nadie contestó**, que es exactamente lo que el
 * reloj existe para mostrar. Subir la oferta tampoco lo reinicia: lo que se mide es hace cuánto
 * que se está esperando una respuesta, no hace cuánto que se dijo el último número.
 *
 * ⚠️ **`ahora` es lo que separa VALIDAR de ESCRIBIR.** Quien sólo valida —la pantalla, con
 * `faltantesDeLaDecision`— manda `ahora: null` y recibe los campos sin fecha; quien escribe manda
 * la suya. La clave ⛔ no se agrega nunca en `null`: un `update` con `retencion_at: null` borraría
 * la fecha de la oferta que ya estaba esperando.
 *
 * @param {{ motivo: string, escenario: string|null, respuesta: string|null, monto: number|null,
 *           forma: string|null, retornoDecidido: boolean, retencionAt: string|null,
 *           ahora: string|null }} o
 */
export function registroDeRetencion(o) {
  const { motivo, escenario, respuesta, monto, forma, retornoDecidido, retencionAt, ahora } = o;
  const hayMonto = monto != null && Number(monto) > 0;
  const hayRespuesta = respuesta != null && respuesta !== '';

  // Nada registrado: mandar la decisión desde una pantalla que no conoce la oferta ⛔ no puede
  // BORRAR la que ya estaba. Misma regla que el escenario.
  if (!hayMonto && !hayRespuesta) return { campos: {} };
  // Media oferta al revés: "no aceptó" ¿qué? Sin el monto la cuenta no se puede leer.
  if (!hayMonto) return { error: 'falta cuánto se le ofreció' };
  if (!ofreceRetencion(motivo, escenario)) {
    return { error: `en este caso no se ofrece que se lo quede, así que no hay oferta que registrar` };
  }
  // 🔑 La tercera mitad de la oferta. ⛔ No tiene default: caer en `'plata'` cuando nadie lo dijo
  // contaría como salida de caja una oferta que capaz fue un cupón, y al revés — y ése es
  // exactamente el número que la columna existe para poder medir.
  if (!esFormaRetencion(forma)) {
    return { error: 'falta en qué se le ofreció que se lo quede: plata o cupón' };
  }
  if (hayRespuesta && !esRespuestaRetencion(respuesta)) {
    return { error: `"${respuesta}" no es una respuesta a la oferta` };
  }
  // Si se lo queda, no vuelve nada. Registrar las dos cosas a la vez deja el producto contado dos
  // veces: esperándolo en la bandeja de retornos y en poder del cliente.
  if (respuesta === 'acepto' && retornoDecidido === true) {
    return { error: 'si acepta quedárselo, el producto no vuelve: sacá el pedido de retorno' };
  }
  const campos = {
    retencion_respuesta: hayRespuesta ? respuesta : null,
    retencion_monto: Number(monto),
    retencion_forma: forma,
  };
  const desde = retencionAt || ahora;
  if (desde) campos.retencion_at = desde;
  return { campos };
}

/**
 * ¿Hay una oferta hecha esperando que el cliente conteste?
 *
 * 🔴 Vive en el núcleo porque lo preguntan **cuatro lugares** —el resumen, el reloj de alertas, la
 * fila del local y la pantalla de decidir—, y es la clase de condición de dos campos que este
 * módulo ya repartió en dos listas antes.
 *
 * ⚠️ Se pregunta por el **monto**, ⛔ no por `retencion_at`: las filas anteriores a esa columna
 * pueden tener una oferta registrada sin fecha, y darlas por "no hay oferta" las haría desaparecer
 * de la única pantalla donde alguien las puede cerrar.
 *
 * @param {{ retencion_monto?: number|null, retencion_respuesta?: string|null }} fila
 */
export function ofertaEsperandoRespuesta(fila) {
  return fila.retencion_monto != null && Number(fila.retencion_monto) > 0 && !fila.retencion_respuesta;
}

// ── El destino de la unidad, y qué pasa cuando el cliente CONTESTA la oferta ────

/**
 * **El destino del producto queda determinado por el motivo, salvo en la falla.**
 *
 * 🔑 **Vivía en `tipos.ts` y se mudó acá el 28-ago-2026**, por lo mismo que `perfilDe` y que
 * `permisos.core.js`: ahora lo necesita también `api/_reclamos.js`. Mientras estaba en TypeScript,
 * el único que podía derivar el destino era la pantalla — y un handler que ⛔ no puede aplicar la
 * regla termina recibiéndola por el body, o sea confiando en que la pantalla la aplicó bien.
 *
 * @param {string} motivo
 * @param {boolean} vuelve  ¿se pidió que el producto vuelva?
 * @param {string|null|undefined} escenario
 * @returns {string|null}
 */
export function destinoDe(motivo, vuelve, escenario) {
  // 🔑 Devuelve `null` cuando no hay producto en juego (demora), y eso NO es un caso sin resolver:
  // es que no hay nada que decidir. El destino nulo es lo que deja cerrar una demora.
  if (!productoEnJuego(motivo, escenario)) return null;
  // ⚠️ Sale del PERFIL y no de `NUNCA_SALIO` a propósito, aunque hoy las dos formas den lo mismo:
  // el único escenario que mueve `salio` es la cancelación, y esa ya salió por el `return null` de
  // arriba. O sea que **el mutante que lo vuelve a la lista de motivos sobrevive** — y se deja así
  // igual, porque el día que un escenario mueva `salio` sin apagar el producto, la lista contesta
  // mal y nadie lo va a ver.
  if (!perfilDe(motivo, escenario).salio) return 'no_salio';
  if (motivo === 'no_llego') return 'perdida';
  // 🔑 La falla va a `falla` **aunque no vuelva**: si está fallada, está fallada — que el cliente se
  // la quede no la vuelve sana. Por eso este `if` queda ARRIBA del reparto de abajo.
  if (motivo === 'falla') return 'falla';
  // 🔑 Y acá está la partición que hasta el 26-ago-2026 no se podía hacer: en todos los demás casos
  // la unidad está **sana**, así que si no vuelve no es una falla, es una unidad regalada. Antes
  // esta línea contestaba `'falla'` y era el único camino que había para sacarla del stock.
  return vuelve ? 'stock' : 'regalada';
}

/**
 * **Lo que hay que escribir cuando el cliente CONTESTA la oferta de que se lo quede.**
 *
 * # Por qué existe, y por qué acá
 *
 * Bruno, 28-ago-2026: *«el local toca "Aceptó" y el sistema cierra la rama»*. Hasta hoy la única
 * forma de anotar la respuesta era que **Administración reabriera Decidir**, así que el circuito
 * —*Administración decide · el local habla y ejecuta*— estaba cortado justo en el eslabón del
 * local: el que escucha la respuesta ⛔ no la podía registrar.
 *
 * 🔑 **Y eso ⛔ no es "el local decidiendo plata".** Cuando la oferta salió, Administración ya
 * decidió **las dos ramas**: el monto y la forma (que es la que determina en qué termina el
 * reclamo) y la salida *«por si dice que no»*, que es la resolución que ya está guardada en la
 * fila. Lo único que agrega el cliente es **cuál de las dos pasó**. Por eso el gesto del local es
 * el mismo que `descontado` o `gn-baja`: **anotar un paso que ya ocurrió en el mundo.**
 *
 * 🔴 **Vive en el núcleo y ⛔ no en el handler** porque es la derivación que este módulo ya
 * duplicó dos veces (`laUnidadVuelve`, los pendientes escritos a mano). Los pendientes salen de
 * `pendientesDe`, el destino de `destinoDe` y la salida de `salidaAlAceptarRetencion`: acá ⛔ no se
 * vuelve a escribir ninguna de las tres.
 *
 * # Las dos respuestas ⛔ no son simétricas
 *
 * | | qué se escribe |
 * |---|---|
 * | `rechazo` | **sólo la respuesta.** Lo decidido ya era la salida «si dice que no»: pisarlo sería rehacer una decisión que nadie rehizo |
 * | `acepto` | la respuesta **y la rama**: resolución, monto, destino, el retorno apagado y los pendientes |
 *
 * 🔑 **Aceptar APAGA el pedido de retorno** (`retorno_decidido: false`, `via_retorno: null`):
 * tenerlos prendidos contaba el producto **dos veces** —en la bandeja de Depósito y en poder del
 * cliente—. Y por eso el destino se deriva con `vuelve: false`: la unidad sana que se queda es
 * `regalada`, ⛔ no `falla`.
 *
 * ⚠️ **El monto de la oferta pasa a ser el monto del reclamo** (`monto_total`), porque es lo que
 * efectivamente se le da. Con `cupon`, `monto_acordado` queda en `null`: no hay plata acordada que
 * salga de la caja, y ⛔ hay un cupón que crear en la tienda — ese pendiente lo enciende
 * `pendientesDe` solo, por la resolución.
 *
 * # Y `costo_caso` se recalcula acá
 *
 * 🔴 **Hasta el 28-ago-2026 ⛔ no se tocaba**, y quedaba el de la decisión vieja: R-0022 mostraba
 * *«Se le devuelve $13.491»* al lado de *«Lo que nos costó $20.682»*, con $6.500 de un envío de
 * vuelta que aceptar acababa de apagar. **La retención existe para abaratar el caso**: si funciona
 * y el número no baja, ⛔ nunca se puede leer si valió la pena — y como el error va siempre para
 * arriba, la retención iba a parecer más cara de lo que es.
 *
 * Los tres sumandos, y por qué dos son cero:
 *
 *  - **el envío de vuelta ⛔ no existe**: aceptar apaga el retorno (`retorno_decidido: false`), así
 *    que no hay nada que traer ni etiqueta que pagar;
 *  - **el envío de ida tampoco**: la salida es plata o cupón, ⛔ nunca `otra_unidad` — de acá no
 *    sale ningún paquete;
 *  - **la unidad sí se pierde**, valuada a costo, porque el cliente se la queda (`regalada` o
 *    `falla`); eso lo decide `destino_prenda`, que es el mismo que se acaba de escribir arriba.
 *
 * ⚠️ **Con `cupon` el monto devuelto es CERO**, por la misma razón por la que `monto_acordado`
 * queda en `null`: hoy no sale plata de la caja. Es la regla que la pantalla ya usaba
 * (`DecidirReclamo.tsx`, `montoAcordado: 0` con cupón), ⛔ no una nueva — cuánto vale realmente un
 * cupón frente al reembolso sigue siendo **B6**, sin contestar.
 *
 * # 🔴 D4 · «No aceptó» sobre un reclamo SIN decidir
 *
 * La premisa de arriba —*«lo decidido ya era la salida si dice que no»*— **es falsa en el único
 * caso real que hubo**. `liberar-decision` borra `compensacion` **y deja la oferta en pie a
 * propósito** (para poder rehacer la decisión con el número a la vista), así que existe la fila
 * con una oferta esperando y ⛔ ninguna rama guardada: así quedó R-0022 el 27-ago-2026.
 *
 * Ahí un `rechazo` dejaba la fila **muda y con el reloj en cero**: `ofertaEsperandoRespuesta` pasa
 * a `false` ⇒ se apaga el aviso de la oferta, `estaDecidido` sigue en `false` ⇒ `mensajesDeLaFila`
 * ⛔ no ofrece ni `propuesta` ni `resolucion`, y el único reloj que quedaba —`sinDecidir`— contaba
 * desde `updated_at`, **que la respuesta que se acaba de escribir movió**. O sea: el gesto de
 * registrar que el cliente dijo que no **apagaba las tres formas que tenía el caso de aparecer**.
 *
 * 🔑 **Bruno, 30-ago-2026 (B1): se parte en dos.** ARMAR una oferta exige que la decisión esté
 * —y ya lo exige `decidir`, que pide `compensacion` antes de llegar acá—; **CONTESTARLA siempre se
 * puede**, porque un «no aceptó» es un hecho que ya pasó en el mundo y frenarlo ⛔ no lo deshace:
 * lo deja sin registrar. Es la misma partición que D15 con las fotos.
 *
 * ⇒ el rechazo **sin decisión** escribe además `estado: 'en_revision'`, que ⛔ no es un cambio de
 * estado —ya estaba ahí— sino **el sello del instante**: el evento que apila el handler es el que
 * después lee `desdeQueEsta(fila, 'en_revision')`, así que el reloj de «hay que decidir» arranca
 * **en el rechazo** y ⛔ no en el último toque. ⛔ Sin migración: la fecha vive en el `historial`.
 *
 * ⚠️ **`compensacionGuardada` es OBLIGATORIO aunque valga `null`**, igual que el escenario: si
 * fuera opcional, un llamador que ⛔ no la lee contestaría con el default seguro —«sigue lo que
 * estaba decidido»— **sin enterarse de que le falta el dato**, que es exactamente cómo la nota del
 * historial venía afirmando de más.
 *
 * # La nota del historial sale de acá
 *
 * 🔴 Porque **la que estaba escrita en el handler era la premisa falsa, palabra por palabra**:
 * *«el cliente NO aceptó quedárselo: sigue lo que estaba decidido»* sobre una fila sin ninguna
 * decisión guardada. El texto vive con la regla que lo decide, ⛔ no al lado.
 *
 * @param {{ respuesta: string, motivo: string, escenario: string|null,
 *           monto: number|null, forma: string|null, diferencia: number|null,
 *           compensacionGuardada: string|null,
 *           items?: Array<{ costo?: unknown, cantidad?: unknown }> }} o
 * @returns {{ error?: string, campos?: Record<string, unknown>, nota?: string }}
 */
export function camposAlContestarLaOferta(o) {
  const { respuesta, motivo, escenario, monto, forma, diferencia, items } = o;
  const compensacionGuardada = o.compensacionGuardada;
  // El parámetro obligatorio: `null` es "no hay decisión" y es una respuesta; `undefined` es que
  // el llamador ⛔ no la leyó, y eso ⛔ no se puede adivinar sin volver a mentir en el historial.
  if (compensacionGuardada === undefined) {
    return { error: 'falta saber si el reclamo tiene una decisión guardada' };
  }
  if (!esRespuestaRetencion(respuesta)) {
    return { error: 'la respuesta tiene que ser "acepto" o "rechazo"' };
  }
  if (!ofreceRetencion(motivo, escenario)) {
    return { error: 'en este caso no corresponde ofrecerle que se lo quede' };
  }
  // 🔑 **Sin monto ⛔ no hay oferta que contestar.** Es la misma pregunta que `ofertaEsperandoRespuesta`
  // y por eso se hace acá: una respuesta sobre una oferta que nunca se registró es la media oferta
  // que hace mentir la cuenta de cuántas veces funciona, entrando por la otra punta.
  if (!(Number(monto) > 0)) {
    return { error: 'no hay ninguna oferta registrada para contestar' };
  }
  if (respuesta === 'rechazo') {
    // Con decisión guardada, el rechazo ⛔ no toca nada más: la salida «si dice que no» ya está en
    // la fila y pisarla sería rehacer una decisión que nadie rehizo.
    if (compensacionGuardada) {
      return {
        campos: { retencion_respuesta: 'rechazo' },
        nota: 'el cliente NO aceptó quedárselo: sigue lo que estaba decidido',
      };
    }
    return {
      campos: { retencion_respuesta: 'rechazo', estado: 'en_revision' },
      nota: 'el cliente NO aceptó quedárselo y el reclamo no tiene decisión guardada: hay que decidir',
    };
  }
  const compensacion = salidaAlAceptarRetencion(forma);
  const destino = destinoDe(motivo, false, escenario);
  return {
    campos: {
      retencion_respuesta: 'acepto',
      compensacion,
      monto_total: Number(monto),
      monto_acordado: forma === 'cupon' ? null : Number(monto),
      retorno_decidido: false,
      via_retorno: null,
      destino_prenda: destino,
      estado: 'resuelto',
      // 🔑 Sale de `costoDeLaFila` con **la fila que se está escribiendo**, ⛔ no con condiciones
      // repetidas acá: los dos envíos se apagan solos —el retorno queda en `false` y la salida
      // ⛔ nunca es `otra_unidad`— porque la regla es la misma en todos lados.
      costo_caso: costoDeLaFila({
        compensacion,
        monto_total: Number(monto),
        retorno_decidido: false,
        items,
        destino_prenda: destino,
      }),
      ...pendientesDe({ compensacion, diferencia: diferencia ?? null }),
    },
    nota: `el cliente ACEPTÓ quedárselo por ${Number(monto)} (${forma === 'cupon' ? 'cupón' : 'plata'})`,
  };
}


// ── Lo que falta para poder cerrar ──────────────────────────────────────────────

/**
 * **Las columnas que `faltantesParaCerrar` lee.** Es su contrato, escrito una sola vez: de acá sale
 * el `select` del handler que la usa como freno. Mismo arreglo que `ENTRADAS_DEL_COSTO`: con dos
 * listas escritas a mano, agregar un pendiente y olvidarse de una de las dos deja el freno
 * mirando `undefined` — o sea, **dejando pasar** justo el caso que vino a frenar.
 */
export const COLUMNAS_PARA_CERRAR = [
  'estado', 'motivo', 'escenario', 'compensacion', 'destino_prenda', 'diferencia', 'retorno_decidido',
  'items', 'items_correctos', 'fotos',
  'reintegro_estado', 'stock_estado', 'reingreso_estado', 'cobro_estado', 'envio_nuevo_estado',
  'cupon_estado', 'tn_stock_estado', 'reclamo_correo_estado',
];

/**
 * **Lo que falta para poder cerrar el reclamo, en criollo.** Vacío = se puede cerrar.
 *
 * 🔑 **El cuerpo se mudó acá el 28-ago-2026** —en `tipos.ts` quedó la cara tipada— porque hasta ese
 * día la miraba **sólo la pantalla** (`Reclamos.tsx`, `ArmarCambio.tsx`): el botón se ponía gris y
 * el handler aceptaba `estado: 'cerrado'` igual, viniera de donde viniera. O sea que se podía
 * cerrar un reclamo **con la plata sin devolver y la venta sin anular** sin que nada lo frenara —
 * y es la misma regla que este módulo ya tiene escrita tres veces: *una pantalla que esconde un
 * botón es una sugerencia, ⛔ no una regla*.
 *
 * Es la contracara de `pendientesDe`: una **deriva** los pendientes al decidir, ésta **lee** los
 * que quedaron.
 *
 * @param {Record<string, any>} d la fila; las columnas que mira son `COLUMNAS_PARA_CERRAR`
 * @returns {string[]}
 */
export function faltantesParaCerrar(d) {
  const faltan = [];
  const cambio = d.compensacion === 'otro_producto';

  // Mientras no haya decisión, el único pendiente real es decidir. Los de plata y stock salen de
  // la decisión, así que antes de tenerla no se sabe si van a existir — y en la mitad de los casos
  // no existen. Antes nacían en 'pendiente' y la fila mostraba "anular la venta original en
  // Gestión Nube · devolver la plata" desde el minuto cero: pendientes inventados, que es la forma
  // más rápida de que la gente aprenda a no mirar la columna.
  if (!d.compensacion && d.estado !== 'anulado') {
    // 🔑 Hay un escenario en que todavía NO hay nada que decidir: el pedido sigue viajando. Decir
    // "decidir qué se hace" ahí es pedir que alguien resuelva un caso que todavía no existe —
    // hasta el 25-ago-2026 un `no_llego` se daba por perdido desde el minuto cero.
    faltan.push(esSoloSeguimiento(d.motivo, d.escenario)
      ? 'seguir el envío: el caso se abre cuando se dé por extraviado'
      : 'decidir qué se hace');
    // El reclamo al transportista corre en paralelo y no espera a nadie: es plata recuperable y si
    // el reclamo se cierra sin presentarlo, se perdió.
    if (d.reclamo_correo_estado === 'pendiente') faltan.push('presentar el reclamo al transportista');
    if (d.tn_stock_estado === 'pendiente') faltan.push('dar de baja el producto en Gestión Nube');
    return faltan;
  }

  if (cambio) {
    if (d.reingreso_estado === 'pendiente') faltan.push('reingresar en Gestión Nube el producto devuelto');
    if (d.cobro_estado === 'pendiente') faltan.push('cobrar la diferencia');
    // Solo cuando la cuenta quedó a favor del cliente sale plata de la caja.
    if (d.reintegro_estado === 'pendiente' && (d.diferencia ?? 0) < 0) faltan.push('devolverle la diferencia');
  } else {
    if (d.stock_estado === 'pendiente') faltan.push('anular la venta original en Gestión Nube');
    if (d.reintegro_estado === 'pendiente') faltan.push('devolver la plata');
  }

  if (d.tn_stock_estado === 'pendiente') faltan.push('dar de baja el producto en Gestión Nube');
  // Lo que sale hacia el cliente. Va acá y no adentro del `if (cambio)` porque las tres
  // resoluciones que mandan algo —cambio, reposición, reenvío— tienen el mismo pendiente.
  if (d.envio_nuevo_estado === 'pendiente') faltan.push('despachar lo que se le manda');
  // El cupón es una promesa hasta que existe en la tienda: sin esto se cierra el reclamo y el
  // cliente descubre en la próxima compra que el código no anda.
  if (d.cupon_estado === 'pendiente') faltan.push('crear el cupón en la tienda y anotar el código');
  // Plata recuperable: si el reclamo se cierra sin esto, esa plata se perdió y nadie se entera.
  if (d.reclamo_correo_estado === 'pendiente') faltan.push('presentar el reclamo al transportista');
  // 🔑 **El otro cliente.** Un excedente toca dos ventas: al de acá le llegó algo de más, y del
  // otro lado hay una venta a la que le falta y alguien que todavía no reclamó. Cerrar sin anotar
  // cuál es deja ese faltante sin abrir, y el que se entera es el otro cliente.
  const sinOtraVenta = sinLaOtraVenta(d).unidades.length;
  if (sinOtraVenta === 1) faltan.push('anotar de qué otra venta salió el producto de más, y abrirle el faltante');
  else if (sinOtraVenta > 1) faltan.push(`anotar de qué otras ventas salieron los ${sinOtraVenta} productos de más, y abrirles el faltante`);
  // 🔑 **Recibir es por PRODUCTO.** Antes esto miraba `destino_prenda === 'stock'` y el estado de la
  // fila, así que un reclamo de dos productos se daba por recibido entero con uno solo en la mano —
  // y en BDI 3 de cada 10 tienen dos. `estado === 'recibido'` sigue valiendo como "llegó todo": es
  // lo que significaba antes de que las unidades se tildaran de a una.
  if (d.estado !== 'recibido' && d.estado !== 'cerrado') {
    const faltanUnidades = loQueFaltaLlegar(d).length;
    if (faltanUnidades === 1) faltan.push('recibir el producto');
    else if (faltanUnidades > 1) faltan.push(`recibir los ${faltanUnidades} productos que faltan`);
  }
  // Cuando el producto se le queda al cliente, la foto es la única prueba de que la falla existió.
  if (d.destino_prenda === 'falla' && !(d.fotos || []).length) faltan.push('al menos una foto del producto');
  // 🔑 **El descuento de lo regalado es "siempre", no "si alguien se acuerda".** La unidad sana que
  // se queda el cliente salió del depósito y Gestión Nube la sigue contando: si el reclamo se
  // cierra sin sacarla, el stock queda de más hasta que la encuentre un conteo. Es la misma clase
  // de agujero que tapó `descontarReemplazo`, del otro lado del mostrador.
  const sinDescontar = loQueFaltaDescontar(d).unidades.length;
  if (sinDescontar === 1) faltan.push('descontar de Gestión Nube el producto que se queda el cliente');
  else if (sinDescontar > 1) faltan.push(`descontar de Gestión Nube los ${sinDescontar} productos que se queda el cliente`);
  return faltan;
}
