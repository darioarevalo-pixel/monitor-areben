// Una puerta para los recursos propios del monitor que no son de post-venta.
//
// Nació como `tienda.js` con un solo recurso y ya tiene dos de dominios distintos —los
// productos apartados de la revisión de fotos y el tablero de diseños—, así que se llama por
// lo que es. Es un router por lo que aprendimos en la Fase 2A: Vercel cuenta **una función serverless por archivo de ruta** en `api/`, y el
// plan Hobby admite 12. Sumar un archivo por cada cosita nueva ya frenó todos los deploys
// una vez —sin error visible, con la app sirviendo la versión anterior—, así que cada
// dominio entra por una puerta y crece con `?recurso=`.
//
// Los archivos con `_` no son rutas (Vercel los ignora), por eso el handler real vive en
// `_tn-ignorados.js` y acá solo se despacha. La auth la valida cada handler.
//
//   GET/POST /api/datos?recurso=ignorados|disenos|disenos-rondas|votacion|norte|fotos-verificadas|tn-desc|tn-desc-ia|meta-funnel|meta-rentabilidad|calendario|liquidacion|atencion|sistema|organizacion|agenda|crm|costos|espejo|buzon|pedidos-clientes|ventas-diarias|clavados|recepciones|oc-webhook|prm&...
import ignorados from './_tn-ignorados.js';
import disenos from './_disenos.js';
import disenosRondas from './_disenos-rondas.js';
import disenosVotacion from './_disenos-votacion.js';
import fotosVerificadas from './_tn-fotos-verificadas.js';
import tnDesc from './_tn-desc.js';
import tnDescIa from './_tn-desc-ia.js';
import metaFunnel from './_meta-funnel.js';
import calendario from './_calendario.js';
import liquidacion from './_liquidacion.js';
import atencion from './_atencion.js';
import sistema from './_sistema.js';
import organizacion from './_organizacion.js';
import agenda from './_agenda.js';
import syncTn from './_sync-tn.js';
import metaRentabilidad from './_meta-rentabilidad.js';
import envios from './_envios.js';
import crm from './_crm.js';
import costos from './_costos.js';
import espejo from './_espejo.js';
import memo from './_memo.js';
import buzon from './_buzon.js';
import pedidosClientes from './_pedidos-clientes.js';
import norte from './_norte.js';
import mktVentas from './_mkt-ventas.js';
import ventasDiarias from './_ventas-diarias.js';
import clavados from './_clavados.js';
import recepciones from './_recepciones.js';
import prm from './_prm.js';
import insumos from './_insumos.js';
import ocWebhook from './_oc-webhook.js';
import { soloMismoOrigen } from './_auth.js';

// `meta-funnel`, `meta-rentabilidad` y `calendario` entran por acá y NO por api/meta-ads.js, aunque
// el tema sea el mismo: aquel endpoint corta con 500 si falta o vence META_ADS_TOKEN, y ninguno de
// los tres necesita hablar con Meta —el umbral de rentabilidad sale de la economía del producto—.
// Atarlos a ese token los mataría justo cuando marketing tiene que estar craneando las piezas, o
// cuando hay que decidir si algo rinde.
const RECURSOS = {
  ignorados,
  disenos,
  // Las rondas de votación del tablero de diseños. Son DOS recursos y no uno a propósito:
  // `disenos-rondas` pide sesión y permiso de la sección, y `votacion` **no pide nada** porque lo
  // abre el equipo desde el celular con el link. Mismo criterio que `reclamos`/`reclamo` y
  // `canjes`/`canje` en `api/postventa.js`: un verbo abierto no convive con verbos con login en el
  // mismo archivo, que es como se cuela el que se olvidó de pedir la sesión.
  'disenos-rondas': disenosRondas,
  votacion: disenosVotacion,
  'fotos-verificadas': fotosVerificadas,
  'tn-desc': tnDesc,
  // El redactor con IA. Entra por acá y no por un archivo propio como todo el resto, y además
  // va SEPARADO de `tn-desc` a propósito: `tn-desc` guarda y no gasta un peso, éste no guarda
  // nada y factura en cada llamada. Mezclarlos dejaría el gasto atrás del mismo `op` que un
  // guardado.
  'tn-desc-ia': tnDescIa,
  'meta-funnel': metaFunnel,
  'meta-rentabilidad': metaRentabilidad,
  calendario,
  // `norte` es la vista de Direccion hacia adelante: cruza el ritmo de venta con las importaciones
  // que vienen y sus plazos de pago. Entra por aca —y no por un archivo de ruta propio— porque el
  // plan Hobby admite 12 funciones y cada ruta cuenta una.
  norte,
  // Ventas de Marketing: un solo verbo, traer las ventas de hoy al espejo. Entra por acá y no por
  // un archivo de ruta propio por lo mismo que `norte` — el plan Hobby admite 12 funciones.
  'mkt-ventas': mktVentas,
  // La venta día a día, por canal, en unidades y en plata. Es la otra pestaña de Ventas mensuales y
  // entra por acá y no por un archivo de ruta propio, como todo el resto (12 funciones en Hobby).
  // Existe como puerta porque **el ETL no baja la plata** y no se lo va a hacer bajar: el
  // razonamiento está en `lib/liquidacion/ventas.ts`. Sólo GET, no escribe nada.
  'ventas-diarias': ventasDiarias,
  clavados,
  liquidacion,
  atencion,
  // `sistema` y `agenda` son los que no tienen marca: novedades, manuales y las promociones
  // bancarias no son de BDI ni de Zattia, y por eso sus handlers no validan `store`. En la agenda,
  // que una promo valga sólo para una marca se dice con su columna `marcas`, que es una lista.
  sistema,
  // "Organización": de quién es cada cosa, sin fecha. Tampoco tiene marca —la misma persona
  // responde en las dos— y entra por acá y no por un archivo de ruta propio, como todo el resto
  // (12 funciones de Hobby, hay 7). Es la contracara de `agenda`: aquélla contesta "¿qué me toca
  // hoy?" y ésta "¿de quién es esto?".
  organizacion,
  agenda,
  // Ledger del sync de ventas TN→GN (Stunned). Entra por acá y no por un archivo propio en `api/`
  // porque el repo está a 3 funciones del límite del plan Hobby.
  'sync-tn': syncTn,
  // Envíos del día: la hoja del cadete. Tampoco tiene `store` en la puerta —el reparto mezcla las
  // dos marcas en la misma mochila— pero cada envío sí lleva la suya.
  envios,
  // El padrón del CRM. Entra por acá porque es el escalón 2 de la Fase S: la tabla `clientes` sale
  // del navegador para que se le pueda revocar el `select` a la anon key.
  crm,
  // El costo de los productos, por lo mismo (pieza B del escalón 3). A diferencia de los otros, es
  // un enriquecimiento opcional: sin permiso contesta 200 con la lista vacía en vez de 403, porque
  // el ETL de las 11 personas que no ven costos tiene que terminar igual.
  costos,
  // El espejo de GN (`inventario` y las 3 vistas materializadas), escalón 4 de la Fase S. A
  // diferencia de los otros dos es un PASE —reenvía la consulta de PostgREST tal cual— porque
  // tiene once lectores en el navegador y once consultas con nombre se desincronizan. Los
  // candados que lo hacen seguro están explicados en `_espejo.js`.
  espejo,
  // El Friday memo de Dirección. Tampoco tiene `store` —el memo es de la empresa y adentro tiene
  // las tres líneas—, y por eso su handler no valida marca. Mismo caso que `sistema`.
  memo,
  // Insumos: lo que la empresa consume y no vende (bolsas, rollos, yerba). Entra por acá y no por
  // un archivo de ruta propio, como todo el resto (12 funciones de Hobby). Sus tablas viven sólo en
  // la base de BDI —una caja de bolsas no es de una marca— pero la puerta SÍ valida `store`, porque
  // el permiso de la sección es por marca.
  insumos,
  // Mensajes de clientes. Entra por acá y no por un archivo de ruta propio como todo el resto: el
  // plan Hobby admite 12 funciones y cada ruta cuenta una. Tampoco valida `store` en la puerta —la
  // bandeja es una sola, como la de Envíos— pero adentro recorta a las marcas del perfil.
  buzon,
  // Faltantes: lo que un cliente pidió y no teníamos. Entra por acá y no por un archivo de ruta
  // propio, como todo el resto (12 funciones de Hobby). Sí valida `store`: su tabla vive en la base
  // de CADA marca, porque lo que se decide con ella es qué compra cada una.
  'pedidos-clientes': pedidosClientes,
  // "Lo que entró": las órdenes de compra que el sistema de Ingresos confirma como recibidas, con
  // lo pedido contra lo contado. Entra por acá y no por un archivo de ruta propio, como todo el
  // resto (12 funciones de Hobby). ⛔ Sólo LEE.
  recepciones,
  // 🔴 **Éste no pide sesión**: lo llama el sistema de Ingresos, que es otro servidor, y se
  // autentica con la firma HMAC del estándar Standard Webhooks. Es el mismo par que
  // `disenos-rondas`/`votacion`: dos recursos y no uno, para que el verbo abierto viva en su
  // archivo y nadie le agregue al lado un verbo que se olvidó de pedir la sesión.
  //
  // ⚠️ La URL que tiene cargada el emisor es exactamente `/api/datos?recurso=oc-webhook`.
  // Cambiarle el nombre al recurso apaga el envío sin que falle nada acá.
  'oc-webhook': ocWebhook,
  // PRM y Recorridas: la relación con el proveedor y el viaje a comprarle. Es UN recurso para DOS
  // secciones (`prm` lee la ficha, `recorridas` escribe lo de la calle) porque es el mismo dato;
  // el permiso se separa adentro, acción por acción.
  prm,
};

// El recurso `crm` es el que manda: con los 12.485 ids del modo «todos» son 25 consultas a
// PostgREST, medidas en 3,9 s. El default de una función de Vercel son 10 s, que hoy alcanzan pero
// sin aire para un día lento de la base. Va en el archivo de RUTA porque es el único lugar donde
// Vercel lee la config — los `_*.js` no son rutas (lo aprendió `_inventario-vivo.js`, que la tenía
// puesta y no hacía nada). El techo es un techo: no cambia lo que tarda el resto.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  const recurso = String(req.query?.recurso || (req.body && req.body.recurso) || '');
  const destino = RECURSOS[recurso];
  if (!destino) {
    return res.status(400).json({ error: `recurso inválido (usá ${Object.keys(RECURSOS).join(', ')})` });
  }
  return destino(req, res);
}
