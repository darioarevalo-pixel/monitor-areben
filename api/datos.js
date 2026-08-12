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
//   GET/POST /api/datos?recurso=ignorados|disenos|fotos-verificadas|meta-funnel|calendario|liquidacion|atencion|sistema|agenda&...
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
import { soloMismoOrigen } from './_auth.js';

// `meta-funnel` y `calendario` entran por acá y NO por api/meta-ads.js, aunque el tema sea el
// mismo: aquel endpoint corta con 500 si falta o vence META_ADS_TOKEN, y ni el tablero de ideas ni
// el calendario necesitan hablar con Meta. Atarlos a ese token los mataría justo cuando marketing
// tiene que estar craneando las piezas.
const RECURSOS = {
  ignorados,
  disenos,
  'fotos-verificadas': fotosVerificadas,
  'meta-funnel': metaFunnel,
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
};

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  const recurso = String(req.query?.recurso || (req.body && req.body.recurso) || '');
  const destino = RECURSOS[recurso];
  if (!destino) {
    return res.status(400).json({ error: `recurso inválido (usá ${Object.keys(RECURSOS).join(', ')})` });
  }
  return destino(req, res);
}
