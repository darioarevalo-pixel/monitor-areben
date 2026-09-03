/**
 * **La pregunta de la puerta**: qué pasa en la Agenda cuando el sistema de Ingresos confirma una OC.
 *
 * # El problema, y por qué esto existe
 *
 * El disparador del ingreso siembra seis pendientes con dueña, y **dos de esos seis cambian de dueña
 * según por dónde entró el producto** (manual 06: producción propia · compra nacional · importación
 * BDI · accesorios nacionales). Por eso `sembrar` **exige la puerta y sin ella contesta 400**:
 * sembrar «todo» le pone el nombre equivocado a dos renglones de seis, y **un pendiente que ya tiene
 * nombre puesto no lo revisa nadie**.
 *
 * 🔴 **Y el hecho ya está entrando al Monitor sin la puerta.** Medido el 30-ago-2026: el webhook
 * `oc.confirmada` trajo **79 órdenes firmadas** el 27-ago, 0 rotos, `confirmada_at` en 79 de 79.
 * Confirmar una OC **es** el hecho —el evento trae las unidades *contadas*, o sea que alguien las
 * recibió— pero el payload ⛔ **no trae el tipo de ingreso**. Durante seis días el disparador esperó
 * una segunda puerta con un segundo secreto (`INGRESO_SECRETO`) para un hecho que ya entraba por la
 * primera, y sembró **cero**.
 *
 * # Lo que hace este archivo
 *
 * En vez de adivinar la puerta —o de perder el ingreso— la **pregunta**: cada OC confirmada deja
 * **UN** pendiente para Administración («¿Por qué puerta entró OC-0412?») que **arrastra**, y
 * contestarlo siembra los seis. Un click, y mientras no se contesta ⛔ no se pierde.
 *
 * 🔑 **Adivinar por el nombre del proveedor ⛔ NO era una opción**: son 30 proveedores en las 79 OCs;
 * `CHINA` se lee sola, pero `RHOVE`, `ASKDENIM` o `BOUCLE LOCAL` no. Una puerta mal puesta es peor
 * que no sembrar, por lo mismo de arriba.
 *
 * # Por qué es `.js`
 *
 * Lo llaman `api/_oc-webhook.js` y `api/_agenda.js`, que corren en Node sin pasar por el compilador
 * de Next. Mismo motivo que `puertas.core.js` y `plantillas.core.js`.
 */

import { hechoYaPaso } from './plantillas.core.js';
import { puertaValeEnMarca } from './puertas.core.js';

/**
 * Cuántas preguntas puede abrir un día. **Sale de una medición, ⛔ no de la intuición**: en 2026 se
 * confirmaron OCs en 29 días distintos, con un promedio de **2,7** y un máximo de **15** (17-jun).
 * El tope deja aire sobre ese máximo, y **cuando se llega se dice** en la respuesta del webhook: un
 * techo que corta callado se lee como que nunca entró nada.
 */
export const TOPE_PREGUNTAS_DIARIAS = 20;

/**
 * A quién le llega la pregunta.
 *
 * 🔑 **Por ROL y ⛔ no por nombre**, igual que «las tres» de la sesión de fotos: así el renglón sigue
 * siendo correcto el día que cambie quién está en Administración, que es el motivo por el que los
 * renglones son data y no código.
 *
 * ⚠️ **Medido contra el padrón antes de escribirlo** (30-ago-2026, 16 personas): la función
 * `administracion` la tiene **una sola** —Lorena Reyes— y es **la única persona sin `admin` que
 * tiene `agenda.cargar`**, que es el permiso que hace falta para contestar. ⇒ hoy la pregunta le
 * llega a quien puede contestarla. El día que entre alguien más a Administración **sin**
 * `agenda.cargar`, va a ver la pregunta y no va a poder contestarla: por eso la pantalla lo dice en
 * vez de contestar 403 pelado.
 */
export const DESTINO_PREGUNTA = { tipo: 'roles', roles: ['administracion'] };

/** El campo de `datos` donde vive. Es la marca de que este ítem se contesta con un click. */
export const CAMPO = 'preguntaIngreso';

/**
 * La fecha del hecho, en ISO corto.
 *
 * 🔴 **Es `confirmada_at` y ⛔ no `fecha_ingreso` ni `recibido_en`**, y las tres razones son
 * medidas, no preferencias:
 *  - `fecha_ingreso` la carga una persona y **vino en 17 de las 79**: colgar de ella dejaría mudas a
 *    tres de cada cuatro OC.
 *  - `recibido_en` es cuándo lo recibimos NOSOTROS. Un backfill lo pone en hoy para todo el
 *    historial, así que usarlo desarma justamente el freno de abajo.
 *  - `confirmada_at` vino en **79 de 79** y es el instante en que el hecho pasó del otro lado.
 */
export function fechaDelHecho(oc) {
  const t = String((oc && oc.confirmada_at) || '');
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
}

/** El nombre del ingreso, que es el agrupador del título de los seis clones. */
export function nombreDelIngreso(oc) {
  return String((oc && (oc.oc_label || oc.oc_id)) || '').trim();
}

/**
 * ¿Esta OC abre una pregunta, y con qué contenido?
 *
 * Devuelve `{ no: '<motivo>' }` cuando ⛔ no corresponde, y **siempre con motivo**: el webhook lo
 * contesta, y «no se abrió ninguna pregunta» sin decir por qué se lee como que el disparador está
 * roto.
 *
 * @param {Record<string, unknown>} oc la OC ya normalizada (la fila que se guarda en `recepcion_oc`)
 * @param {{ yaPreguntadas?: string[], abiertasHoy?: number, ahora?: number }} [opciones]
 *   `yaPreguntadas`: ids de OC que ya tienen su pregunta · `abiertasHoy`: cuántas van hoy ·
 *   `ahora`: inyectable para los tests.
 * @returns {{ ok?: true, fila?: Record<string, unknown>, no?: string }}
 */
export function preguntaDeOc(oc, { yaPreguntadas = [], abiertasHoy = 0, ahora = Date.now() } = {}) {
  const id = String((oc && oc.id) || '');
  if (!id) return { no: 'la OC no trae id' };

  const nombre = nombreDelIngreso(oc);
  if (!nombre) return { no: 'la OC no trae ni label ni número' };

  const marca = String((oc && oc.store) || '');
  // ⛔ No se cae a una marca por defecto: el clon nace en la marca del hecho, y la equivocada le
  // muestra al que trabaja parado en Zattia los pendientes de un ingreso de fundas.
  if (!['bdi', 'zattia'].includes(marca)) return { no: `marca desconocida «${marca}»` };

  const fecha = fechaDelHecho(oc);
  if (!fecha) return { no: 'la OC no trae confirmada_at' };

  /*
    🔴 **EL FRENO DEL BACKFILL, y vive en la ENTRADA y ⛔ no en la plantilla.**

    Las 79 OCs del 27-ago llegaron en **una sola tanda de trece minutos**. Sin freno, conectar esto
    habría abierto 79 preguntas de golpe —de OCs de junio, julio y agosto—, y una bandeja que nace
    con 79 renglones viejos no la mira nadie: es exactamente el «contador que no baja» que este
    módulo entero viene evitando.

    🔑 **Y por qué acá y no como `noSiembraSiPaso` de la plantilla `ingreso`**, que es la única de
    las cuatro que ⛔ no lo lleva: eso fue una decisión y sigue siendo correcta. El botón a mano
    acepta una fecha vieja porque *la mercadería llega y a veces se avisa dos días después*, y ahí
    el pendiente atrasado es justo lo que hay que ver. **El webhook es otra entrada**: no puede
    traer un hecho viejo salvo que sea un backfill. El mismo hecho, dos puertas, dos frenos.

    Se reusa `hechoYaPaso` —`fecha < ayer`, con el día de margen por el UTC del servidor— y ⛔ no un
    número nuevo: el margen ya cubre las 17 horas de reintentos del emisor.
  */
  if (hechoYaPaso(fecha, ahora)) return { no: `la OC se confirmó el ${fecha}: no se pregunta por lo viejo` };

  // Ya está preguntada. ⛔ Ni siquiera se re-abre la que alguien haya borrado a mano: borrar un
  // renglón es una decisión, y volver a ponerlo sería discutírsela. Misma regla que `sembrar`.
  if (yaPreguntadas.map(String).includes(id)) return { no: 'ya tiene su pregunta' };

  if (abiertasHoy >= TOPE_PREGUNTAS_DIARIAS) {
    return { no: `se llegó al tope de ${TOPE_PREGUNTAS_DIARIAS} preguntas por día` };
  }

  const proveedor = String((oc && oc.proveedor_nombre) || '').trim();
  return {
    ok: true,
    fila: {
      clase: 'pendiente',
      // 🔑 El título nombra la OC y el proveedor porque **es lo único con lo que se contesta**:
      // quien elige la puerta la sabe por quién mandó la mercadería, no por el número de orden.
      titulo: `¿Por qué puerta entró ${nombre}${proveedor ? ` (${proveedor})` : ''}?`,
      cuerpo: 'Elegí la puerta y se cargan solos los pasos del ingreso, cada uno con su dueña. '
        + 'Hasta que la elijas no se siembra nada: el nombre y la descripción cambian de dueña según por dónde entró.',
      regla: { tipo: 'unica', fecha },
      destino: DESTINO_PREGUNTA,
      // La pregunta es del negocio por el que entró la mercadería, como el clon.
      marcas: [marca],
      // 🔑 **Arrastra, y es la mitad de por qué esto sirve**: un ingreso que se pierde porque nadie
      // miró la Agenda ese día es el ingreso que este disparador vino a no perder.
      arrastra: true,
      [CAMPO]: { oc: id, nombre, fecha, marca, proveedor: proveedor || null },
    },
  };
}

/**
 * ¿Este ítem es una pregunta de puerta, y qué hay que sembrar al contestarla?
 *
 * ⚠️ Lee de `datos` y **⛔ no confía en el título**: el título se puede editar desde la pantalla de
 * cargar como cualquier otro ítem, y un gesto que siembra seis pendientes no puede colgar de un
 * texto que alguien puede reescribir sin saber lo que rompe.
 *
 * 🔑 **Devuelve también QUÉ SE CONTESTÓ**, y ése es el agregado del 3-sep-2026. Antes la respuesta
 * se escribía sola en los clones (`datos.puerta` de cada paso sembrado) y ⛔ en ningún lado que la
 * pantalla pudiera leer: la Agenda volvía a dibujar los tres botones sin apretar, y Bruno leía
 * «nadie contestó» sobre una orden ya resuelta. `puerta` es `null` mientras no se contestó — que es
 * un estado distinto de «se contestó y no sé cuál», y por eso ⛔ no se inventa un default.
 */
export function preguntaDeItem(datos) {
  const p = datos && datos[CAMPO];
  if (!p || typeof p !== 'object') return null;
  const nombre = String(p.nombre || '').trim();
  const fecha = String(p.fecha || '');
  const marca = String(p.marca || '');
  if (!nombre || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !['bdi', 'zattia'].includes(marca)) return null;
  // ⚠️ Se valida contra el catálogo: una puerta escrita a mano en la base —o la de una marca donde
  // no existe— viaja como `null` y la pregunta se dibuja abierta, ⛔ no con un rótulo inventado.
  const puerta = puertaValeEnMarca(p.puerta, marca) ? String(p.puerta) : null;
  return {
    oc: String(p.oc || ''),
    nombre,
    fecha,
    marca,
    proveedor: p.proveedor || null,
    puerta,
    contestadaPor: puerta ? (p.contestadaPor || null) : null,
    contestadaAt: puerta ? (p.contestadaAt || null) : null,
  };
}

/**
 * Los `datos` de la pregunta, con la respuesta adentro. Es lo que el handler escribe al contestar.
 *
 * 🔑 Vive acá, al lado de `preguntaDeItem`, porque **el que escribe y el que lee tienen que ser el
 * mismo archivo**: el campo se agregó una vez y ya se había perdido una vez por estar partido.
 */
export function conRespuesta(datos, puerta, usuario, ahora = Date.now()) {
  return {
    ...(datos || {}),
    [CAMPO]: {
      ...((datos && datos[CAMPO]) || {}),
      puerta: String(puerta),
      contestadaPor: usuario || null,
      // ⚠️ ISO y ⛔ no un número: es la misma forma que `hechoAt` del tilde, y la pantalla los lee
      // con la misma función. Dos formatos para «cuándo» en la misma tarjeta es una hora en blanco.
      contestadaAt: new Date(ahora).toISOString(),
    },
  };
}
