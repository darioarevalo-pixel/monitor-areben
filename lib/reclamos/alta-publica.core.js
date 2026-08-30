/**
 * **El alta pública: las cinco opciones en criollo, y con qué motivo entra cada una.**
 *
 * # Qué es esto
 *
 * El cliente abre su propio reclamo desde un link, sin login: pone el número de pedido y el mail con
 * el que compró (la llave, que vive en `bdi-catalogo/api/_verificacion-orden.js`), toca el o los
 * productos, elige **una de cinco opciones** y sube fotos. La fila nace en `borrador` **exactamente
 * como hoy**, y de ahí la máquina de estados ⛔ no cambia en nada.
 *
 * # 🔑 Las cinco opciones ⛔ no son motivos: son FAMILIAS
 *
 * Adentro hay once motivos y el cliente ⛔ no puede elegir entre ellos, porque **la diferencia entre
 * los de una familia ⛔ no la sabe él**: si la publicación está objetivamente mal o si era una
 * expectativa suya lo decidimos nosotros con la ficha delante; si el paquete se perdió o sólo está
 * demorado lo dice el seguimiento; si es un faltante o un armado equivocado depende de qué salió del
 * depósito. ⇒ cada opción pública mapea a una **familia** de motivos y entra por **uno** de ellos.
 *
 * ⚠️ Las familias salen de `MOTIVOS_VIGENTES` y ⛔ no se escriben a mano al lado: un motivo nuevo
 * sin puerta pública se queda sin puerta **callado**, y eso es justo lo que el cable de
 * `tests/reclamos-alta-publica.test.ts` no deja pasar.
 *
 * # 🔴 Con cuál de la familia ENTRA, y por qué ⛔ no da lo mismo
 *
 * Un toque del cliente ⛔ no puede afirmar cosas que él no sabe ni encender trabajo que nadie
 * decidió. Dos reglas duras, las dos atadas por test contra el código que las paga:
 *
 * 1. 🔴 **La entrada ⛔ nunca nace con un pendiente prendido.** `crear` (`api/_reclamos.js`) enciende
 *    `reclamo_correo_estado: 'pendiente'` en `no_llego` —el reclamo al transportista— y
 *    `tn_stock_estado: 'pendiente'` en `sin_stock`. Entrar por ahí sería que **tocar un botón le
 *    ponga a alguien una tarea en la lista** sobre un hecho que todavía no se miró. Por eso «todavía
 *    no me llegó» entra por `demora`, que ⛔ no afirma que se perdió nada, y `no_llego` lo pone una
 *    persona cuando el seguimiento lo dice.
 * 2. 🔴 **La entrada ⛔ nunca es un caso en que el cliente no sea el perjudicado.** `excedente` es
 *    que le llegó algo **de más**: ⛔ no le falta nada, ⛔ no hay expectativa que cumplirle
 *    (`expectativas: []`) y es el único caso del repertorio que toca **dos ventas** —la otra, con
 *    su faltante, la abre una persona—. Quien toca «me falta algo» ⛔ no está diciendo eso.
 *
 * Y una tercera, más blanda pero del mismo orden: **entre dos de la misma familia entra la que ⛔ no
 * afirma culpa nuestra**, porque afirmarla ya es plata (`no_como_publicado` con su escenario
 * objetivo regala el envío). Por eso «no es lo que esperaba» entra por `no_esperaba` — y el propio
 * perfil lo dice: `no_como_publicado` tiene `decideCliente: false`, o sea que **la decidimos
 * nosotros**.
 *
 * ⚠️ **El camino de vuelta ya existe y es `reclasificar`**, que muda el caso conservando número,
 * fotos e historial. Por eso entrar por el motivo más callado ⛔ no pierde nada: lo que el cliente
 * escribe en el relato es lo que después mueve el caso al lugar que le toca.
 *
 * # 🔑 El ESCENARIO ⛔ no lo toca el cliente
 *
 * Es lo que determina la plata en tres casos y se contesta con la evidencia delante. Acá ⛔ no hay
 * ni una opción que lo escriba.
 *
 * ⚠️ Es `.core.js` y ⛔ no `.ts` porque lo lee `api/_reclamo.js`, que ⛔ no puede importar
 * TypeScript — mismo arreglo que `portal.core.js`, `casos.core.js` y `permisos.core.js`.
 */

import { PERFIL_MOTIVO, pideFotosAlCliente } from './casos.core.js';

/**
 * **Las cinco opciones, tal como las lee el cliente.**
 *
 * `entra` es el motivo con el que se crea la fila; `familia` es adonde puede terminar el caso
 * después de que una persona lo mire. `entra` está **siempre** adentro de su familia (atado por
 * test: una entrada que se escape de su familia es un motivo elegido a dedo).
 */
export const OPCIONES_PUBLICAS = [
  {
    clave: 'fallado',
    label: 'Me llegó fallado',
    ayuda: 'Vino con una mancha, una costura abierta, algo roto.',
    entra: 'falla',
    familia: ['falla'],
  },
  {
    clave: 'no_esperaba',
    label: 'No es lo que esperaba',
    ayuda: 'Es lo que pediste y está bien, pero no era como te lo imaginabas.',
    // Entra por el que ⛔ no afirma culpa nuestra. `no_como_publicado` la decidimos nosotros
    // mirando la ficha (`decideCliente: false`), y su escenario objetivo regala el envío.
    entra: 'no_esperaba',
    familia: ['no_esperaba', 'no_como_publicado'],
  },
  {
    clave: 'talle',
    label: 'Me quedó mal el talle',
    ayuda: 'Te queda grande o chico. Es lo que nos dice si la guía de talles está bien.',
    // `talle` y `arrepentimiento` son el mismo flujo con dos etiquetas, y la etiqueta **es** el
    // dato: entra por lo que el cliente dijo, ⛔ no por el genérico.
    entra: 'talle',
    familia: ['talle', 'arrepentimiento'],
  },
  {
    clave: 'falta_algo',
    label: 'Me falta algo, o me llegó otra cosa',
    ayuda: 'Abriste el paquete y no estaba todo, o había algo que no compraste.',
    // 🔴 ⛔ NO entra por `excedente`: ahí al cliente ⛔ no le falta nada —le sobra—, ⛔ no hay nada
    // que ofrecerle, y el caso toca una SEGUNDA venta que abre una persona. `faltante` es lo que
    // el botón dice, y de los tres es el que ⛔ no mueve un segundo stock.
    entra: 'faltante',
    familia: ['faltante', 'mal_armado', 'excedente'],
  },
  {
    clave: 'no_llego',
    label: 'Todavía no me llegó',
    ayuda: 'Pasó el plazo y el paquete no aparece.',
    // 🔴 ⛔ NO entra por `no_llego`: ése nace con el reclamo al transportista PENDIENTE, o sea que
    // un toque le pondría a alguien una tarea sobre un hecho que todavía no se miró.
    entra: 'demora',
    familia: ['no_llego', 'demora'],
  },
];

/**
 * **El único motivo vigente sin puerta pública, y por qué.**
 *
 * 🔑 Nombrado y con motivo, ⛔ no ausente: el cable de los tests exige que **todo motivo vigente
 * tenga puerta o esté acá**. Un motivo nuevo que no entre por ninguna opción rompe el test en vez de
 * quedarse afuera callado.
 */
export const SIN_PUERTA_PUBLICA = {
  sin_stock: 'Le vendimos algo que no teníamos: el cliente ⛔ no recibió nada ni está enterado. Lo abre quien ve el faltante, y el aviso sale de acá para afuera.',
};

/** La opción, por su clave. `null` si no existe — una clave inventada ⛔ no abre nada. */
export function opcionPublica(clave) {
  return OPCIONES_PUBLICAS.find((o) => o.clave === clave) || null;
}

/**
 * **Con qué motivo se crea la fila.** `null` si la clave ⛔ no es una de las cinco.
 *
 * 🔑 El servidor lee **esto** y ⛔ nunca un `motivo` que venga en el body: aceptar el motivo de
 * afuera sería dejar que el cliente elija `sin_stock` —que afirma que le vendimos algo que no
 * teníamos— o `no_llego`, que enciende el reclamo al transportista.
 */
export function motivoDeAlta(clave) {
  const o = opcionPublica(clave);
  return o ? o.entra : null;
}

/**
 * **¿Se le piden fotos en el alta, y con qué fuerza?**
 *
 * Se deriva de `PERFIL_MOTIVO[entra].fotos`, que es la regla que ya tiene el módulo — ⛔ no una
 * lista nueva al lado:
 *
 * - `'no'` — no hay nada que fotografiar (`fotos: 'nunca'`). Pedirle una foto a quien ⛔ no recibió
 *   el paquete es pedirle una foto de la nada.
 * - `'exige'` — la foto **es** la prueba (`fotos: 'siempre'`): falla y armado equivocado.
 * - `'ofrece'` — ayuda y ⛔ no traba (`'si_quiere_plata'`, `'de_lo_recibido'`).
 *
 * ⚠️ **`'exige'` es de la PANTALLA, ⛔ no del servidor.** El alta crea la fila sin fotos a
 * propósito: las fotos entran después por `accion: 'foto'` del portal, que ya existe, tiene tope de
 * 6 y sube al Blob. Trabar la creación por una foto es perder el reclamo entero en el momento en que
 * la cámara falla — y el caso queda **afuera del sistema**, que es lo que este módulo vino a evitar.
 */
export function fotosEnElAlta(clave) {
  const motivo = motivoDeAlta(clave);
  if (!motivo) return 'no';
  // 🔑 El `'no'` ⛔ no se decide acá comparando el string: es la MISMA pregunta que contesta el
  // portal para prender su botón de enviar (`pideFotosAlCliente`). Con dos comparaciones al
  // `'nunca'`, la pantalla del alta podía dejar de pedir fotos y el portal seguir exigiéndolas.
  if (!pideFotosAlCliente(motivo)) return 'no';
  return (PERFIL_MOTIVO[motivo] || {}).fotos === 'siempre' ? 'exige' : 'ofrece';
}

/**
 * **Dónde vive la llave.** Es **el otro repo** (`bdi-catalogo`), el único que habla con la API de
 * Tienda Nube: `POST ?orden=N&store=X` con `{ mail }` en el body contesta la orden **recortada**
 * —qué compró, ⛔ ni un monto— y sólo si el mail es el de esa orden.
 *
 * 🔑 **La leen los DOS lados y por eso vive acá**: la pantalla, para mostrarle a la persona su
 * pedido antes de que elija los productos, y `api/_reclamo.js`, que **vuelve a girar la llave** en
 * el mismo pedido que crea la fila. Escrita dos veces, el día que cambie el dominio la puerta que
 * se olvida es siempre la del servidor — y ésa es la que verifica.
 */
export const API_ORDEN_VERIFICADA = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit';

/**
 * **Las tiendas por las que se puede entrar, y cómo se llaman para el que compró.**
 *
 * ⚠️ **STUNNED ⛔ no está, y ⛔ no es un olvido.** Su tienda de Tienda Nube es **otra**
 * (`store=stunned` en `bdi-catalogo`) pero sus reclamos vivirían en la base de **Zattia**, donde el
 * freno de «un reclamo abierto por orden» compara `(store, orden_tn)`: dos órdenes distintas —una
 * de Zattia y una de Stunned— pueden tener **el mismo número**, y ahí el freno le contestaría a una
 * persona **el token del reclamo de otra**. Agregar la tercera puerta es agregar antes la columna
 * que las separa, ⛔ no una línea en esta lista.
 */
export const TIENDAS_DEL_ALTA = [
  { clave: 'bdi', label: 'BDI' },
  { clave: 'zattia', label: 'Zattia' },
];

/** ¿Se puede abrir un reclamo público para esta tienda? Ver el ⚠️ de `TIENDAS_DEL_ALTA`. */
export function esTiendaDelAlta(clave) {
  return TIENDAS_DEL_ALTA.some((t) => t.clave === clave);
}

/**
 * **Cuántos reclamos públicos por hora y por marca acepta la puerta antes de fundirse.**
 *
 * ⚠️ Es un **fusible, ⛔ no un antiflood por persona**: por persona ya frenan las otras dos puertas
 * —hace falta el mail de la orden, y una orden ⛔ no puede tener dos reclamos abiertos—. Esto es
 * para el día que algo salga mal de un modo que nadie previó, y **tiene que dejar rastro en el log**
 * o es un freno que nadie va a mirar.
 *
 * 📊 El número sale de lo medido: BDI hizo **283 ventas online en agosto de 2026**, o sea ~9 por
 * día. Veinte reclamos en una hora ⛔ no es un pico de demanda: es que algo se rompió.
 */
export const TOPE_ALTAS_POR_HORA = 20;

/**
 * ¿Este pedido de alta tiene la forma mínima para siquiera consultar Tienda Nube?
 *
 * 🔴 **Falla cerrado**, como la llave: devuelve el motivo **para el log del servidor** y ⛔ nunca
 * para la respuesta. Las razones de un `false` tienen que verse idénticas desde afuera — distinguir
 * «esa orden no existe» de «ese mail no es» convierte la puerta en un oráculo sobre una numeración
 * correlativa.
 */
export function altaBienFormada(b) {
  if (!b || typeof b !== 'object') return { ok: false, motivo: 'sin-body' };
  if (!/^\d{1,12}$/.test(String(b.orden || '').trim())) return { ok: false, motivo: 'orden-mal-formada' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.mail || '').trim())) return { ok: false, motivo: 'mail-mal-formado' };
  if (!opcionPublica(b.opcion)) return { ok: false, motivo: 'opcion-desconocida' };
  const p = b.productos;
  if (!Array.isArray(p) || !p.length) return { ok: false, motivo: 'sin-productos' };
  if (!p.every((i) => Number.isInteger(i) && i >= 0 && i < 100)) return { ok: false, motivo: 'indice-invalido' };
  if (new Set(p).size !== p.length) return { ok: false, motivo: 'indice-repetido' };
  return { ok: true, motivo: 'ok' };
}

/**
 * **Los ítems del reclamo, armados con los productos de la orden VERIFICADA.**
 *
 * 🔴 🔑 **Los productos salen de la orden que contestó Tienda Nube y ⛔ NUNCA del body.** El cliente
 * manda **índices**, ⛔ no productos: si mandara los productos, la verificación del mail ⛔ no
 * serviría de nada — cualquiera podría postear el reclamo de un artículo que nunca compró, con el
 * SKU y el nombre que se le ocurra. El índice sólo puede señalar algo que ya está en la orden.
 *
 * ⚠️ Un índice que ⛔ no existe en la orden **no se ignora**: devuelve `null` y el alta no se crea.
 * Saltearlo callado dejaría entrar un reclamo con menos productos de los que la persona tocó.
 *
 * ⛔ **Sin `precio` ni `pagado`, a propósito**: por la puerta pública ⛔ no viaja un solo monto —la
 * orden verificada tampoco los trae—. La plata la carga Administración con la orden completa
 * delante. Misma forma que arma `Reclamos.tsx`, menos eso.
 */
export function itemsDelAlta(orden, indices) {
  const productos = (orden && Array.isArray(orden.products) ? orden.products : []);
  if (!productos.length) return null;
  const out = [];
  for (const i of indices) {
    const p = productos[i];
    if (!p) return null;
    out.push({
      sku: p.sku == null ? null : String(p.sku),
      tn_product_id: p.product_id == null ? null : String(p.product_id),
      variant_id: p.variant_id == null ? null : String(p.variant_id),
      producto: p.name || 'Sin nombre',
      cantidad: p.quantity == null ? 1 : p.quantity,
    });
  }
  return out;
}
