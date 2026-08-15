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
//   GET/POST /api/datos?recurso=ignorados|disenos|fotos-verificadas|meta-funnel|meta-rentabilidad|calendario|liquidacion|atencion|sistema|agenda|crm|costos|espejo&...
import ignorados from './_tn-ignorados.js';
import disenos from './_disenos.js';
import fotosVerificadas from './_tn-fotos-verificadas.js';
import metaFunnel from './_meta-funnel.js';
import calendario from './_calendario.js';
import liquidacion from './_liquidacion.js';
import atencion from './_atencion.js';
import sistema from './_sistema.js';
import agenda from './_agenda.js';
import syncTn from './_sync-tn.js';
import metaRentabilidad from './_meta-rentabilidad.js';
import envios from './_envios.js';
import crm from './_crm.js';
import costos from './_costos.js';
import espejo from './_espejo.js';
import memo from './_memo.js';
import { soloMismoOrigen } from './_auth.js';

// `meta-funnel`, `meta-rentabilidad` y `calendario` entran por acá y NO por api/meta-ads.js, aunque
// el tema sea el mismo: aquel endpoint corta con 500 si falta o vence META_ADS_TOKEN, y ninguno de
// los tres necesita hablar con Meta —el umbral de rentabilidad sale de la economía del producto—.
// Atarlos a ese token los mataría justo cuando marketing tiene que estar craneando las piezas, o
// cuando hay que decidir si algo rinde.
const RECURSOS = {
  ignorados,
  disenos,
  'fotos-verificadas': fotosVerificadas,
  'meta-funnel': metaFunnel,
  'meta-rentabilidad': metaRentabilidad,
  calendario,
  liquidacion,
  atencion,
  // `sistema` y `agenda` son los que no tienen marca: novedades, manuales y las promociones
  // bancarias no son de BDI ni de Zattia, y por eso sus handlers no validan `store`. En la agenda,
  // que una promo valga sólo para una marca se dice con su columna `marcas`, que es una lista.
  sistema,
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
