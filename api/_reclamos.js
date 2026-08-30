// Reclamos (post-venta) — tabla `devoluciones` (ver sql/migrate-devoluciones.sql).
//
// Un solo motor para todo lo que sale mal después de una venta, **cambios incluidos**. Lo que
// distingue un caso de otro no es un "tipo de reclamo" sino dos decisiones independientes:
// `destino_prenda` (qué pasa con el producto) y `compensacion` (qué recibe el cliente). Un cambio es
// simplemente `compensacion='otro_producto'`: comparte tabla, número (`R-0042`) y pendientes.
//
//   GET  ?store=bdi|zattia[&estado=][&pendientes=1][&limit=]     → lista.
//   GET  ?store=…&vista=retornos                                → la bandeja: columnas mínimas.
//   POST { store, action:'crear', orden_tn, items, motivo, ... } → crea el borrador + token.
//   POST { store, action:'decidir', id, destino_prenda, compensacion, montos… } → ADMIN.
//   POST { store, action:'cambio', id, items_nuevos, forma_pago, envio…, pagado? } → el POS.
//   POST { store, action:'procesar', id, gn_venta_id, gn_venta_number } → registra la venta del cambio.
//   POST { store, action:'recibir', id[, unidades:[i]] }         → llegó (todo, o esas unidades).
//   POST { store, action:'reingreso', id }                       → el devuelto volvió al stock en GN.
//   POST { store, action:'descontado', id[, unidades:[i]][, gn_venta_number] } → la unidad SANA que
//                                                                  se queda el cliente salió de GN.
//   POST { store, action:'cobrado', id }                         → la diferencia del cambio entró.
//   POST { store, action:'despachado', id }                       → salió lo que se le manda.
//   POST { store, action:'cupon-emitido', id, cupon_codigo }      → el cupón existe en la tienda. ADMIN.
//   POST { store, action:'reintegro', id, comprobante? }         → la plata devuelta. ADMIN.
//   POST { store, action:'anulacion', id }                       → la venta anulada en GN. ADMIN.
//   POST { store, action:'gn-baja', id }                         → la unidad fantasma dada de baja en GN.
//   POST { store, action:'estado', id, estado, nota? }           → cambia estado. `cerrado` exige
//                                                                  que no falte nada; `anulado`, ADMIN.
//   POST { store, action:'fotos', id, fotos }                    → suma fotos cargadas por el equipo.
//   POST { store, action:'falla', id, falla_ids }                → linkea las fallas creadas.
//   POST { store, action:'editar', id, ...campos }               → edita.
//   GET  ?store=…&vista=medidor                              → reclamos por cada 100 ventas online.
//   GET  ?store=…&vista=mensajes&id=N                            → qué se le dijo al cliente.
//   POST { store, action:'mensaje', id, tipo, texto }             → apila lo que se le acaba de decir.
//   POST { store, action:'eliminar', id }                        → borra. ADMIN.
//
// ⚠️ **`cambio` y `procesar` NO son de administración, a propósito.** Un cambio no es una decisión
// que alguien tenga que autorizar —ya se sabe qué se hace, se cobra la diferencia y listo—, así que
// el Local lo resuelve de punta a punta. Administración solo entra si la cuenta queda a favor del
// cliente, porque ahí sí sale plata de la caja: eso cae en `reintegro`, que sí está gateado.
//
// ⚠️ DOS COSAS QUE NO HACE Y NO PUEDE HACER
//
// 1. **No anula la venta en Gestión Nube ni reingresa lo devuelto**: GN no expone ninguna de las
//    dos por API (ver api/crear-venta.js y el módulo lib/verif-ventas/, que existe solo para listar
//    lo que hay que anular a mano). Por eso `stock_estado` y `reingreso_estado` son TRAZAS de pasos
//    manuales: lo que el sistema hace es no dejar que nadie se olvide.
// 2. **No recalcula los montos.** El cálculo vive en UN solo lugar, `lib/reclamos/tipos.ts`, con
//    tests. Replicarlo acá en JS sería un espejo TS/JS, que es una fuente conocida de
//    desincronización — ya pasó con el motor viejo de Cambios. Lo que sí hace es **validar
//    rangos**: nada negativo y nada por encima del total de la orden.
//
// Las acciones que mueven plata exigen función de administración TAMBIÉN en el servidor: el gate
// de la UI es comodidad, no seguridad.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
// Los permisos se IMPORTAN, no se copian: la misma implementación que usa la app.
import { esAdmin, puedeVer, puedeVerAlguna, SECCIONES_RECLAMOS, tieneFuncion } from '../lib/permisos.core.js';
import { COLUMNAS_PARA_DEVOLVER, faltaAnularAntesDeDescontar, faltaRecibirAntesDeDevolver, loEjecutado, pendientesDe } from '../lib/reclamos/efectos.core.js';
// Hasta cuándo vale el cupón. ⛔ No se valida sólo en la pantalla: una pantalla que valida es una
// sugerencia, y este módulo ya lo pagó cuatro veces.
import { leerVencimiento } from '../lib/reclamos/cupon.core.js';
// 🔑 El token del portal se acuña en TRES lugares (acá dos, y el alta pública en `_reclamo.js`).
// La regla del link —largo y vencimiento— vive con el link, en `portal.core.js`.
import { COLUMNAS_DEL_PORTAL, elLinkSigueVivo, nuevoToken, venceElLink } from '../lib/reclamos/portal.core.js';
import { costoDeLaFila, ENTRADAS_DEL_COSTO } from '../lib/reclamos/plata.core.js';
// El costo de un producto, con la clave de servicio. **Una sola implementación** (ver `_costos.js`):
// la usan también `_fallas.js` y `_canjes.js`, que tampoco lo muestran — lo GUARDAN.
import { leerCostos } from './_costos.js';
// El caso y su escenario: la lista cerrada de escenarios, si el perfil cambia con el escenario, y
// si hay producto en juego. ⛔ No se copia acá — es la misma tabla que lee la app.
import { camposAlContestarLaOferta, camposAlSoltarLaDecision, COLUMNAS_PARA_CERRAR, esEscenarioDe, ESTADOS_ABIERTOS, faltantesParaCerrar, ofertaEsperandoRespuesta, pideReclamoAlTransportista, productoEnJuego, registroDeRetencion } from '../lib/reclamos/casos.core.js';
// La unidad: qué se espera de cada producto y en qué lista vive lo que vuelve. ⛔ No se copia acá:
// en un `mal_armado` lo que vuelve es `items_correctos`, y equivocarse escribe en la lista que no es.
import { anotarLaOtraVenta, aplicarDestinos, descontarUnidades, DESTINOS, laUnidadVuelve, loQueFaltaDescontar, recibirUnidades, sinLaOtraVenta, trabaParaRecibir } from '../lib/reclamos/unidades.core.js';
// Qué se le dijo al cliente y cuándo. ⛔ No se copia acá: la lista de momentos es cerrada, y un
// `tipo` libre convierte esta columna en un campo de texto.
import { apilarMensaje } from '../lib/reclamos/mensajes.core.js';
import { leerSeguimiento } from '../lib/reclamos/seguimiento.core.js';
// El medidor: cuántos reclamos se registraron por cada 100 ventas online, mes a mes. La regla de
// qué cuenta —y de qué mes es cada fila— vive en el núcleo, ⛔ no en el `select`.
import { desdeDeLosMeses, medirPorMes, mesDelReclamo, mesesHasta, MESES_DEL_MEDIDOR } from '../lib/reclamos/medidor.core.js';
// 🔴 PostgREST corta en 1.000 filas y ⛔ NO avisa. Seis meses de ventas de BDI son ~4.700.
import { leerTodo } from '../lib/supabase/paginar.core.js';
// El mes en curso, en hora de Argentina: esto corre en Vercel, o sea en UTC.
import { diaArgentino } from '../lib/envios/portal.core.js';

function cfgFor(store) {
  if (store === 'zattia') {
    return { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY };
  }
  return { url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co', key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY };
}

// Los ONCE vigentes, más los dos históricos que quedaron en filas viejas (si se sacaran, editar
// un reclamo viejo lo rechazaría por "motivo inválido").
const MOTIVOS = [
  'arrepentimiento', 'no_esperaba', 'no_como_publicado', 'talle', 'falla', 'faltante', 'mal_armado',
  'excedente', 'demora', 'no_llego', 'sin_stock',
  'no_era_lo_esperado', 'otro',
];
const EXPECTATIVAS = ['plata', 'mismo_producto', 'otro_producto', 'completar'];
const COMPENSACIONES = ['plata_total', 'plata_parcial', 'otra_unidad', 'otro_producto', 'reenvio', 'cupon', 'ninguna'];
const FORMAS_PAGO = ['tarjeta', 'transferencia'];
const ESTADOS = ['borrador', 'esperando_cliente', 'en_revision', 'resuelto', 'en_transito', 'recibido', 'cerrado', 'anulado'];
const PENDIENTES = ['pendiente', 'hecho', 'no_aplica'];
const COBROS = ['no_aplica', 'pendiente', 'cobrado'];
// Quién paga el envío del cambio. Cambia el total a cobrar, no solo la logística.
const ENVIO_PAGA = ['cliente', 'nosotros'];
// Cómo vuelve el producto. 'presencial' = la trae al local: sin envío, sin etiqueta, sin seguimiento.
const VIAS = ['correo', 'andreani', 'cadete', 'presencial'];
// Los TRES gestos que se hacen con el paquete en la mano, y lo único que la bandeja de retornos
// habilita por sí sola. Ninguno decide nada: dicen que lo que vuelve llegó, que ya está guardado, y
// que lo que sale ya salió.
//
// 🔴 **`despachado` entró el 28-ago-2026, y su falta era la CUARTA vuelta del agujero propio del
// módulo.** El tercer andén de Retornos se construyó el 26-ago **exactamente porque Depósito ⛔ no
// puede abrir Reclamos**: el botón estaba del lado equivocado de la puerta. El botón se mudó y esta
// lista se quedó igual ⇒ **Depósito apretaba «Despaché» y recibía un 403.** No se vio antes porque
// la bandeja está vacía y el Local sí pasa, por `reclamos-local`.
//
// 🔑 **Lo que lo cierra ⛔ no es esta línea: es el test que la ata a los botones de la pantalla**
// (`tests/retornos.test.ts`). Una lista escrita a mano al lado de una pantalla que crece es
// exactamente la forma que este módulo ya perdió tres veces.
const ACCIONES_DE_LA_BANDEJA = ['recibir', 'reingreso', 'despachado'];

// Lo que la bandeja necesita ver, y nada más (ver `lib/reclamos/retornos.ts`). ⛔ Sin `relato_cliente`,
// sin montos y sin `token`: Depósito abre una caja, no revisa un caso.
// 🔑 `items_nuevos`, `seguimiento_ida` y `envio_nuevo_estado` son **el paquete que SALE**. Sin
// ellos la bandeja mostraba media operación: lo que vuelve sí, y lo que hay que mandarle al
// cliente no — y eso lo despacha la misma persona que abre la caja.
// ⛔ `envio_ida_costo` NO entra: es plata, y por esta puerta angosta Depósito ⛔ no ve montos.
const COLS_RETORNO = `id, orden_tn, cliente, motivo, escenario, estado, items, items_correctos,
  items_nuevos, retorno_decidido, destino_prenda,
  compensacion, via_retorno, seguimiento_vuelta, seguimiento_ida, solicitud_envio,
  reingreso_estado, envio_nuevo_estado, falla_ids,
  historial, created_at, updated_at`.replace(/\s+/g, ' ');

const COLS = `id, store, orden_tn, cliente, token_vence, motivo, escenario, motivo_detalle, relato_cliente, fotos,
  destino_prenda, compensacion, estado, items, monto_producto, monto_acordado, monto_envio_devuelto,
  monto_total, pago_metodo, pago_gateway, devolver_envio, retorno_sugerido, retorno_decidido,
  via_retorno, envio_costo, seguimiento_vuelta, envio_ida_costo, seguimiento_ida,
  gn_venta_id, gn_venta_number, gn_venta_reemplazo_id, gn_venta_reemplazo_number, stock_estado, reintegro_estado,
  tn_stock_estado, envio_nuevo_estado, reintegro_at, reintegro_por, reintegro_comprobante, cupon_codigo, cupon_vence, falla_ids,
  retencion_respuesta, retencion_monto, retencion_forma, retencion_at, cupon_estado,
  costo_caso, expectativa, reclamo_correo, reclamo_correo_estado, items_correctos,
  items_nuevos, forma_pago, diferencia, descuento_manual, solicitud_envio,
  pagado, cobro_estado, envio_paga, reingreso_estado,
  usuario, historial, created_at, updated_at`.replace(/\s+/g, ' ');
// El `token` NUNCA sale en los listados: es la llave del link público. Se pide aparte, de a uno.
//
// 🔑 **`mensajes` tampoco, y por el otro motivo: PESA.** Es la lista entera de lo que se le dijo al
// cliente, con el texto adentro. 📊 Medido sobre los 31 mensajes que arma hoy el módulo: **283
// bytes de promedio, 436 el más largo** ⇒ un reclamo con sus cinco momentos son ~1,4 KB, contra los
// 1,925 KB que pesa hoy la fila entera — o sea que meterlo acá **duplica el listado**, y el listado
// baja 200 filas para dibujar una columna que ⛔ no lo usa. Se pide de a uno por `vista=mensajes`,
// desde el detalle, que es el único lugar donde alguien lee lo que se le dijo. Mismo molde que
// `vista=token`.

// El día que el link deja de servir vive en `portal.core.js` (`DIAS_DEL_LINK`), junto con el
// acuñado del token: eran dos números y dos expresiones escritas a mano en los dos verbos que
// emiten link, y el alta pública iba a ser la tercera copia.

/**
 * Cuántos reclamos ABIERTOS mira el aviso del sidebar como mucho.
 *
 * ⚠️ **Un tope que se pasa tiene que DECIRLO.** Éste es el aviso que cuenta lo que está durmiendo:
 * un corte callado lo deja avisando de menos, y quien lo lee entiende «no hay más», que es el mismo
 * «el cero afirma» que este módulo viene tapando. Por eso el handler pide `TOPE_AVISOS + 1` y
 * devuelve `hayMas`.
 *
 * 📊 El número, **medido de nuevo el 30-ago-2026** sobre las 2 filas reales de BDI: **1.365 bytes
 * por fila** contra 2.725 del listado completo ⇒ 500 abiertos son ~683 KB cada 3 minutos por admin.
 * ⚠️ Eran 344 hasta que el reloj de «la plata salió y el producto todavía no volvió» obligó a
 * llevarse `items` (503 bytes) — el precio de que la regla viva **en un solo lugar**. Y **500
 * reclamos abiertos a la vez ⛔ no es una carga de trabajo, es un incendio**: el tope existe para
 * que una consulta rota no baje la tabla entera, ⛔ no para recortar el trabajo real.
 */
export const TOPE_AVISOS = 500;

/**
 * **Las columnas que baja el aviso del sidebar: las que mira `alertasDe`, y nada más.**
 *
 * 🔴 🔑 **Es un `select` escrito a mano al lado de una regla que vive en otro archivo**: si
 * `alertasDe` mira una columna que ⛔ no está acá, la ve `undefined` y **el aviso nace muerto**,
 * callado y en verde — que es justo lo que iba a pasar con el reloj de «la plata salió y el
 * producto todavía no volvió» (30-ago-2026). Lo ata ahora `tests/reclamos-plata-antes-del-producto.test.ts`
 * con el mismo oráculo que `COLUMNAS_PARA_CERRAR`: **recortar la fila al select ⛔ no puede
 * cambiar las alertas**.
 *
 * ⚠️ **Lo que cuesta, medido sobre las 2 filas reales de BDI** (⛔ no estimado): 775 → 1.365
 * bytes por fila. Las caras son `items` (503) y el `historial` que ya viajaba (575); las otras
 * cuatro suman 107. Se paga porque la alternativa es la regla escrita dos veces —una en el
 * núcleo y otra acá adentro—, que es exactamente como este módulo ya se rompió cuatro veces.
 */
export const COLS_AVISO = `id, motivo, estado, compensacion, reintegro_estado, reintegro_at,
  destino_prenda, retorno_decidido, items, items_correctos,
  historial, created_at, updated_at`.replace(/\s+/g, ' ');

/** ¿Puede mover plata? Admin o función de administración. */
function esAdministracion(perfil) {
  return esAdmin(perfil) || tieneFuncion(perfil, 'administracion');
}

/**
 * **Le completa a cada producto su costo de Gestión Nube.** Devuelve la lista nueva y **cuántos**
 * completó, que es lo que después decide si el `costo_caso` que mandó la pantalla quedó viejo.
 *
 * 🔴 **Por qué hacía falta**: *«lo que nos costó»* contaba la mercadería **en CERO**. `unit_cost`
 * salió del navegador en la Fase S —10 personas mandaban un costo que ⛔ no veían— y
 * `enriquecerConGN` dejó de resolverlo; del lado del servidor, `api/_reclamos.js` era el único de
 * los tres que **guardan** el costo que ⛔ no lo pedía. Resultado: el techo de la oferta y
 * `costoDelCaso` calculados contra precio de lista, con la unidad valiendo nada.
 *
 * 🔑 **Se completa SÓLO si el campo está vacío**, igual que en `_fallas.js`: un `0` tipeado por una
 * persona quiere decir cero, y eso ⛔ no es lo mismo que `null`.
 *
 * ⚠️ **Si no se puede leer el costo, el reclamo se crea igual.** Un costo que falta se completa
 * después; ⛔ no poder abrir el reclamo deja al local con un cliente enojado y sin nada que hacer.
 */
async function conCosto(store, items) {
  const lista = Array.isArray(items) ? items : [];
  const faltan = lista.filter((it) => it && it.costo == null && it.product_id);
  if (!faltan.length) return { lista, completados: 0 };
  try {
    const mapa = await leerCostos(store, faltan.map((it) => it.product_id));
    let completados = 0;
    const nueva = lista.map((it) => {
      if (!it || it.costo != null || !it.product_id) return it;
      const c = mapa[String(it.product_id)];
      if (c == null) return it;
      completados++;
      return { ...it, costo: c };
    });
    return { lista: nueva, completados };
  } catch {
    return { lista, completados: 0 };
  }
}

const num = (v) => (v == null || v === '' ? null : Number(v));
const texto = (v) => (v == null || v === '' ? null : String(v));

/**
 * Historial append-only: se re-lee la fila, se apila el evento y se guarda. No es atómico, pero dos
 * acciones simultáneas sobre el MISMO reclamo no pasan en la práctica (lo maneja una persona por
 * vez).
 */
async function apilar(supabase, id, evento, extra = {}) {
  const { data: previo } = await supabase.from('devoluciones').select('historial').eq('id', id).single();
  const historial = Array.isArray(previo?.historial) ? previo.historial : [];
  historial.push(evento);
  const { error } = await supabase.from('devoluciones').update({ ...extra, historial, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // 🔴 Hasta el 13-ago-2026 el control terminaba en `exigirUsuario`, y de este endpoint sale lo
  // más sensible que tiene el Monitor sobre gente de afuera: nombre, contacto y relato de cada
  // cliente que reclamó, en las dos marcas. Y sale también `vista=token`, o sea **la llave del
  // portal público de cualquier reclamo** — con ella se entra a hacerse pasar por ese cliente.
  //
  // Las pantallas que lo usan son las de Reclamos y Cambios del local, más la de Administración,
  // así que el permiso es «alguna» de las tres. Las acciones que mueven plata siguen pidiendo
  // función de administración más abajo, que es un escalón aparte y no lo reemplaza esto.
  //
  // 🔑 La **bandeja de retornos** (`retornos`) entra por una puerta más angosta, no por ésta: la
  // miran Depósito y Local, que sólo abren la caja y dicen si llegó. Con el permiso de la sección
  // se puede leer `vista=retornos` —columnas mínimas, sin relato, sin montos y sin token— y hacer
  // los dos gestos físicos: `recibir` y `reingreso`. ⛔ Nada más: el listado completo, el token del
  // portal y todo lo que decide plata siguen pidiendo una de las tres secciones de Reclamos.
  const verReclamos = puedeVerAlguna(perfil, store, SECCIONES_RECLAMOS);
  const verRetornos = puedeVer(perfil, store, 'retornos');
  const accionPedida = req.method === 'POST' ? ((req.body || {}).action || 'crear') : null;
  const esDeLaBandeja = req.method === 'GET'
    ? req.query.vista === 'retornos'
    : ACCIONES_DE_LA_BANDEJA.includes(accionPedida);
  if (!verReclamos && !(verRetornos && esDeLaBandeja)) {
    return res.status(403).json({ error: 'No tenés acceso a Reclamos en esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);
  const usuario = perfil.name || null;
  const ahora = () => new Date().toISOString();

  try {
    if (req.method === 'GET') {
      // El link del cliente, de a uno y a pedido. No sale en el listado porque un listado se
      // loguea, se cachea y se comparte; el token es la llave del portal público.
      // Mismo molde que `vista=token` de Canjes (`_canjes.js`).
      if (req.query.vista === 'token') {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { data, error } = await supabase
          .from('devoluciones').select('token, token_vence').eq('store', store).eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return res.status(404).json({ error: 'no existe ese reclamo' });
        return res.status(200).json({ ok: true, token: data.token || null, vence: data.token_vence || null });
      }

      // ── Qué se le dijo al cliente, de a uno y a pedido ─────────────────────────
      //
      // Sale por su propia vista y ⛔ no en `COLS` porque **pesa** (ver el comentario de `COLS`), y
      // porque lo lee una sola pantalla: el detalle de la fila, cuando alguien la abre a
      // preguntarse qué se le prometió.
      //
      // ⚠️ **Una lista vacía ⛔ NO quiere decir que no se le dijo nada**: quiere decir que ⛔ no
      // quedó registrado. La columna la empezó a escribir el 29-ago-2026 y todo lo anterior —los
      // tres mensajes de R-0022 incluidos— ⛔ no está. Es el mismo «vacío ⛔ no es que no pasó, es
      // SIN REGISTRAR» de `retencion_respuesta`, y quien lo dice es la pantalla.
      if (req.query.vista === 'mensajes') {
        const idMsj = parseInt(req.query.id, 10);
        if (!idMsj) return res.status(400).json({ error: 'falta id' });
        const { data, error } = await supabase
          .from('devoluciones').select('mensajes').eq('store', store).eq('id', idMsj).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return res.status(404).json({ error: 'no existe ese reclamo' });
        return res.status(200).json({ ok: true, mensajes: Array.isArray(data.mensajes) ? data.mensajes : [] });
      }

      // Lo único que necesita el aviso del sidebar para saber qué está durmiendo (`alertasDe`).
      // 🔑 **Recorta COLUMNAS**: medido sobre las 10 filas de BDI, **1.925 bytes por fila con `COLS`
      // contra 344 con éstas**, 5,6× — y esto lo pide cada admin cada 3 minutos. ⛔ Sin `cliente` ni
      // un solo monto: un aviso dice que algo duerme, no cuánto ni de quién.
      //
      // 🔴 🔑 **Y desde el 29-ago-2026 recorta ESTADOS también** (D12 de la auditoría del 28-ago).
      // Antes bajaba las 200 más nuevas **de todas**, cerradas incluidas, y el front las filtraba
      // con `estaAbierto`. Lo cerrado crece para siempre y lo abierto no ⇒ con 200 reclamos por mes,
      // **al segundo mes el corte se come reclamos abiertos** y el que duerme deja de contar en el
      // badge, que es exactamente para lo que la alerta existe. La lista sale del núcleo
      // (`ESTADOS_ABIERTOS`), ⛔ no se copia acá: es la misma que filtra el front y la que decide
      // qué es un reclamo vivo.
      //
      // 🔴 🔑 **Y el ORDEN estaba al revés de para qué sirve esto.** Con `created_at` descendente el
      // corte se lleva **los más viejos** — que son justo los que pueden estar durmiendo. Ascendente,
      // lo que queda afuera son los recién abiertos, que ⛔ todavía no pueden tener alerta y entran
      // solos a la ventana al envejecer.
      if (req.query.vista === 'avisos') {
        // Se pide UNO MÁS que el tope: si vuelve, es que hay más y el aviso lo dice. Contar
        // `data.length === TOPE` ⛔ no distingue «entraron justos» de «se cortó».
        const { data, error } = await supabase
          .from('devoluciones').select(COLS_AVISO).eq('store', store)
          .in('estado', ESTADOS_ABIERTOS)
          .order('created_at', { ascending: true }).limit(TOPE_AVISOS + 1);
        if (error) throw new Error(error.message);
        const filas = data || [];
        const hayMas = filas.length > TOPE_AVISOS;
        return res.status(200).json({ ok: true, devoluciones: filas.slice(0, TOPE_AVISOS), hayMas });
      }

      // La bandeja de retornos: lo que estamos esperando que vuelva y lo que llegó y falta guardar.
      // El filtro fino (los dos andenes, el orden por antigüedad) lo hace `bandejaDeRetornos` en el
      // front — acá sólo se recortan las columnas y los estados, que es lo que hace la diferencia
      // de permiso.
      if (req.query.vista === 'retornos') {
        const { data, error } = await supabase
          .from('devoluciones').select(COLS_RETORNO).eq('store', store)
          .in('estado', ['en_transito', 'recibido', 'resuelto'])
          .order('updated_at', { ascending: true }).limit(300);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, devoluciones: data || [] });
      }

      // ── El medidor: reclamos registrados por cada 100 ventas online, mes a mes ──
      //
      // 🔑 **El manómetro de la válvula.** El día que el alta pública multiplique los casos hay
      // cuatro diales para mover, y hasta hoy ⛔ no había contra qué mirarlos: BDI tenía **2
      // reclamos contra 283 ventas online de agosto**. ⚠️ Ese cociente ⛔ **no es la tasa de
      // reclamos, es lo que se registró** — el que se resuelve en un chat ⛔ no deja fila. Lo dice
      // el núcleo, lo dice la pantalla, y por eso salen **seis meses juntos** y ⛔ no un número solo.
      //
      // 🔴 **Las dos consultas van por `leerTodo` y ordenadas por `id`.** Medido el 30-ago-2026
      // sobre las ventas de BDI: paginar **sin `order`** devolvió 4.694 filas con **3.554 ids
      // únicos** —repitió unas y se comió otras— y agosto pasó de 283 ventas online a 89. Un
      // denominador chico infla el cociente, o sea que el modo de falla de este número es
      // **exagerar el problema en silencio**. `date_sale` ⛔ no alcanza como orden: se repite.
      //
      // 🔑 **Y la tercera consulta, la que decide si un cero habla**: el PRIMER reclamo que
      // registró la base, mirando la tabla entera y ⛔ no la ventana. Sin eso, los meses de antes
      // de que el módulo existiera valen «0 cada 100» y el primer mes con formulario se lee como
      // un aumento. Ver el 🔴 de `medirPorMes`.
      if (req.query.vista === 'medidor') {
        const meses = mesesHasta(diaArgentino(Date.now()).slice(0, 7), MESES_DEL_MEDIDOR);
        const desde = desdeDeLosMeses(meses);
        const [reclamos, ventas, primero] = await Promise.all([
          leerTodo(supabase, 'devoluciones', (q) => q
            .select('estado, created_at').eq('store', store).gte('created_at', `${desde}T00:00:00Z`).order('id')),
          // ⚠️ `channel_id` ⛔ no se pide: la tabla de Zattia ⛔ no tiene esa columna y PostgREST
          // rechaza el `select` ENTERO por una que no existe. Mismo recaudo que `_norte.js` y
          // `_insumos.js`. Con `channel` alcanza: `canalDe` clasifica por texto.
          leerTodo(supabase, 'ventas', (q) => q
            .select('date_sale, channel').gte('date_sale', desde).order('id')),
          supabase.from('devoluciones').select('created_at').eq('store', store)
            .order('created_at', { ascending: true }).limit(1).maybeSingle(),
        ]);
        if (primero.error) throw new Error(primero.error.message);
        return res.status(200).json({
          ok: true,
          meses: medirPorMes({ reclamos, ventas, meses, desdeQueSeRegistra: mesDelReclamo(primero.data?.created_at) }),
        });
      }

      // 🔴 **El listado también se cortaba callado** (D12). Las tres pestañas —Abiertos, Durmiendo,
      // Todos— filtran **en el cliente**, sobre lo que bajó: con 200 reclamos por mes, al segundo
      // mes «Abiertos» deja de mostrar los viejos **sin decir una palabra**. El tope se queda —una
      // pantalla ⛔ no puede bajar la tabla entera— pero **avisa cuando se pasó**, y ahí sí hay algo
      // que hacer: filtrar por estado o pedir más.
      const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
      let q = supabase.from('devoluciones').select(COLS).eq('store', store).order('created_at', { ascending: false }).limit(limit + 1);
      if (ESTADOS.includes(req.query.estado)) q = q.eq('estado', req.query.estado);
      // Lo que le falta algo: sirve para el aviso de "hay N reclamos con plata sin devolver".
      if (req.query.pendientes === '1') q = q.or('reintegro_estado.eq.pendiente,stock_estado.eq.pendiente,tn_stock_estado.eq.pendiente');
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const filas = data || [];
      return res.status(200).json({ ok: true, devoluciones: filas.slice(0, limit), hayMas: filas.length > limit });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = b.action || 'crear';

    if (action === 'crear') {
      const items = Array.isArray(b.items) ? b.items : [];
      if (!items.length) return res.status(400).json({ error: 'faltan los productos del reclamo' });
      const motivo = MOTIVOS.includes(b.motivo) ? b.motivo : 'otro';
      // El reclamo por falta de stock es el único que nace sabiendo qué pasa con el producto: nada,
      // porque nunca salió. Y es el único que arranca con el pendiente de corregir TN.
      const sinStock = motivo === 'sin_stock';
      const vence = venceElLink();
      const row = {
        store,
        orden_tn: texto(b.orden_tn),
        cliente: texto(b.cliente),
        token: nuevoToken(), // 64 hex: no se adivina
        token_vence: vence,
        motivo,
        motivo_detalle: texto(b.motivo_detalle),
        expectativa: EXPECTATIVAS.includes(b.expectativa) ? b.expectativa : null,
        // En un `mal_armado` lo que vuelve es esta lista, y son unidades como las otras: si el
        // costo ⛔ no se completa acá, la mitad del caso se sigue valuando en cero.
        items_correctos: (await conCosto(store, Array.isArray(b.items_correctos) ? b.items_correctos : [])).lista,
        // El pedido que se perdió en el camino arranca con el reclamo al transportista pendiente:
        // es plata recuperable y sin este pendiente no la persigue nadie.
        reclamo_correo_estado: motivo === 'no_llego' ? 'pendiente' : 'no_aplica',
        fotos: Array.isArray(b.fotos) ? b.fotos : [],
        destino_prenda: sinStock ? 'no_salio' : (DESTINOS.includes(b.destino_prenda) ? b.destino_prenda : null),
        estado: 'borrador',
        // 🔑 **El costo se resuelve acá, ⛔ no en el navegador**: `unit_cost` salió del cliente en
        // la Fase S y `enriquecerConGN` dejó de pedirlo, así que hasta el 30-ago-2026 la
        // mercadería valía CERO en «lo que nos costó». Ver `conCosto`.
        items: (await conCosto(store, items)).lista,
        monto_producto: num(b.monto_producto),
        pago_metodo: texto(b.pago_metodo),
        pago_gateway: texto(b.pago_gateway),
        gn_venta_id: texto(b.gn_venta_id),
        gn_venta_number: texto(b.gn_venta_number),
        // ⚠️ Los pendientes de plata y de stock nacen en 'no_aplica', NO en 'pendiente'.
        //
        // Antes nacían pendientes y la lista mostraba "anular la venta original en Gestión Nube ·
        // devolver la plata" desde el minuto cero, cuando todavía no se había decidido nada — y en
        // la mitad de los casos la respuesta termina siendo que no hay que anular ni devolver.
        // Un pendiente que aparece antes de la decisión que lo justifica entrena a ignorarlos.
        //
        // Se derivan en `decidir`, que ya los recalcula según destino y compensación. Mientras
        // tanto el único pendiente real es decidir, y eso lo dice `faltantesParaCerrar`.
        stock_estado: 'no_aplica',
        reintegro_estado: 'no_aplica',
        tn_stock_estado: sinStock ? 'pendiente' : 'no_aplica',
        usuario,
        historial: [{ estado: 'borrador', at: ahora(), usuario, nota: 'reclamo abierto' }],
      };
      const { data, error } = await supabase.from('devoluciones').insert(row).select('id, token').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id: data?.id, token: data?.token });
    }

    const id = parseInt(b.id, 10);
    if (!id) return res.status(400).json({ error: 'falta id' });

    // ── Lo que mueve plata o toca stock: solo administración ──────────────────────
    // `gn-baja` NO está acá a propósito: quien ve que el producto no está es Local.
    // `reclasificar` está acá porque **cambia el perfil del caso**: quién paga el envío de ida y si
    // hay producto en juego. No es una corrección de tipeo.
    const DE_ADMIN = ['decidir', 'liberar-decision', 'reclasificar', 'reintegro', 'anulacion', 'eliminar', 'cupon-emitido'];
    if (DE_ADMIN.includes(action) && !esAdministracion(perfil)) {
      return res.status(403).json({ error: 'Esto lo hace Administración: pedile a alguien con ese permiso.' });
    }

    // Regenerar el link del cliente. Hace falta porque el token vence a los DIAS_DEL_LINK y hasta
    // ahora no había forma de emitir uno nuevo: el reclamo quedaba sin link para siempre.
    // Solo mientras el portal siga sirviendo — una vez decidido el reclamo el link muere a
    // propósito y de ahí en más se le avisa por WhatsApp.
    //
    // 🔴 **Acá había una CUARTA copia de la regla del link**, escrita a mano —los tres estados
    // sueltos en un `includes`— al lado de un `select('estado')` que ⛔ no traía `compensacion`.
    // O sea: un cambio ya decidido vuelve a `borrador` a propósito, así que esto **acuñaba un
    // token nuevo y contestaba «listo»**, y el portal después le daba 404 al cliente. El link
    // regenerado ⛔ no servía y ⛔ nada lo decía. Ahora la pregunta y las columnas salen las dos de
    // `portal.core.js`, que es donde vive la regla que el portal aplica del otro lado.
    if (action === 'reemitir-token') {
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones').select(COLUMNAS_DEL_PORTAL.join(', ')).eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      if (!elLinkSigueVivo(fila)) {
        return res.status(400).json({ error: 'El reclamo ya está decidido: el link del cliente no va más. Avisale por WhatsApp.' });
      }
      const token = nuevoToken();
      const vence = venceElLink();
      await apilar(supabase, id, { estado: fila.estado, at: ahora(), usuario, nota: 'link del cliente regenerado' }, { token, token_vence: vence });
      return res.status(200).json({ ok: true, token, vence });
    }

    /**
     * **Liberar la decisión: el reclamo vuelve a estar SIN decidir.**
     *
     * 🔴 Existe porque «Volver a decidir» no significaba nada en la fila. Abría la pantalla y ya;
     * la resolución vieja seguía puesta, el reclamo seguía en Cambios, y el botón seguía diciendo
     * «Volver a decidir» — así que apretarlo dos veces se veía exactamente igual que no apretarlo
     * nunca. Bruno, 27-ago-2026: *«si volvés a decidir, que quede libre la decisión»*.
     *
     * 🔑 **Lo que borra es la RESOLUCIÓN, ⛔ no el análisis.** Se van `compensacion` y los seis
     * pendientes que cuelgan de ella; se quedan el escenario, el costo de traerlo, los destinos por
     * producto, los montos y la oferta de retención. Eso es exactamente lo que hace que se pueda
     * *«terminar el primer paso y seguir más tarde»*: el trabajo hecho sobrevive, lo que se suelta
     * es la conclusión.
     *
     * 🔴 **Y el mismo freno que `decidir`**: si ya se ejecutó algo, no se libera. Soltar una
     * decisión cuya plata ya salió dejaría el reintegro hecho colgando de una resolución que ya no
     * existe. `loEjecutado` es la única lista, acá y allá.
     *
     * ⚠️ Vuelve a `en_revision` y ⛔ no a `borrador`: la evidencia ya está: lo que falta es
     * decidir. Y ése es el estado que enciende el reloj de «esperando una decisión» a los 3 días,
     * que es justo lo que corresponde para una decisión soltada y no terminada.
     */
    if (action === 'liberar-decision') {
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones').select(`motivo, compensacion, items, items_correctos, destino_prenda,
          retorno_decidido, reintegro_estado, stock_estado, reingreso_estado, cobro_estado,
          envio_nuevo_estado, cupon_estado`.replace(/\s+/g, ' '))
        .eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      if (!fila.compensacion) return res.status(400).json({ error: 'este reclamo todavía no está decidido' });
      const yaHecho = loEjecutado(fila);
      if (yaHecho.length) {
        return res.status(409).json({ error: `Esta decisión ya se está ejecutando (${yaHecho.join(' · ')}): no se puede soltar.` });
      }
      const era = fila.compensacion;
      // 🔑 **Qué se borra vive en el NÚCLEO** (`camposAlSoltarLaDecision`), ⛔ no en esta línea:
      // hasta el 30-ago-2026 acá se soltaba sólo `compensacion` y los pendientes, y los montos, el
      // destino y la vía quedaban en la fila — la decisión vieja seguía escrita en las columnas
      // que la contaban (B3). La regla es del reclamo, ⛔ no de este handler.
      await apilar(
        supabase, id,
        { estado: 'en_revision', at: ahora(), usuario, nota: `se soltó la decisión para rehacerla (era: ${era})` },
        camposAlSoltarLaDecision(fila),
      );
      return res.status(200).json({ ok: true, estado: 'en_revision', era });
    }

    if (action === 'decidir') {
      // La decisión de fondo: qué pasa con el producto y qué recibe el cliente. Se guarda también
      // lo que sugirió la cuenta, para poder ver después cuándo se fue en contra y si valió.
      const destino = DESTINOS.includes(b.destino_prenda) ? b.destino_prenda : null;
      const compensacion = COMPENSACIONES.includes(b.compensacion) ? b.compensacion : null;
      // El escenario tiene que ser de ESTE caso: la lista es cerrada, y uno de otro caso llegaría
      // a la fila y después movería el perfil equivocado. Hay que releer el motivo de la base —
      // el cliente manda el escenario, no el caso.
      const { data: filaCaso, error: eCaso } = await supabase
        .from('devoluciones').select(`motivo, escenario, reclamo_correo_estado, items, items_correctos,
          destino_prenda, retorno_decidido, reintegro_estado, stock_estado, reingreso_estado,
          cobro_estado, envio_nuevo_estado, cupon_estado, retencion_at`.replace(/\s+/g, ' '))
        .eq('store', store).eq('id', id).maybeSingle();
      if (eCaso) throw new Error(eCaso.message);
      if (!filaCaso) return res.status(404).json({ error: 'no existe ese reclamo' });
      // 🔴 **Una decisión ya ejecutada ⛔ no se pisa.** Rehacerla vuelve a pasar por `pendientesDe`,
      // así que un pendiente tildado vuelve a `pendiente`: la plata devuelta aparecería otra vez
      // como si no se hubiera devuelto. La pantalla ya esconde el botón, pero el freno vive acá —
      // la regla es del reclamo, no de la pantalla, y hasta hoy `decidir` no tenía ningún guard.
      // ⚠️ En la PRIMERA decisión la lista está vacía por definición, así que esto ⛔ no la estorba.
      const yaHecho = loEjecutado(filaCaso);
      if (yaHecho.length) {
        return res.status(409).json({ error: `Esta decisión ya se está ejecutando (${yaHecho.join(' · ')}): no se puede rehacer.` });
      }
      const motivoActual = filaCaso.motivo;
      // Si no viene en el body, vale el que ya tiene la fila: mandar la decisión desde una pantalla
      // que no conoce el escenario ⛔ no puede BORRARLO — es el dato del que cuelga el perfil.
      const escenario = b.escenario !== undefined ? texto(b.escenario) : (filaCaso.escenario || null);
      if (escenario && !esEscenarioDe(motivoActual, escenario)) {
        return res.status(400).json({ error: `"${escenario}" no es un escenario de ${motivoActual}` });
      }
      // 🔑 **El destino del producto se exige sólo si hay producto en juego.** En una demora y en
      // una cancelación no lo hay: no vuelve nada, no se anula ninguna venta y no hay stock que
      // corregir. Hasta el 25-ago-2026 se exigía siempre, así que una demora **no se podía cerrar
      // nunca** — el final tiene que poder quedar vacío.
      const hayProducto = productoEnJuego(motivoActual, escenario);
      if (!compensacion) return res.status(400).json({ error: 'falta la compensación' });
      if (hayProducto && !destino) return res.status(400).json({ error: 'falta el destino de el producto' });

      // ── El destino de cada producto ──────────────────────────────────────────
      //
      // Un reclamo de dos productos puede terminar con uno volviendo a stock y el otro en poder del
      // cliente: hasta el 25-ago-2026 había **un solo destino para los dos**. Viaja como un mapa
      // índice → destino y ⛔ no reenviando los productos, que son de la orden.
      if (b.destinos != null && !hayProducto) {
        return res.status(400).json({ error: 'en este caso no hay producto en juego: no hay destino que decidir' });
      }
      const conDestinos = aplicarDestinos(filaCaso.items, b.destinos);
      if (conDestinos.error) return res.status(400).json({ error: conDestinos.error });

      // ── La oferta de retención ───────────────────────────────────────────────
      // Qué se le ofreció para que se lo quede y qué contestó. La regla entera vive en
      // `registroDeRetencion` (`casos.core.js`), porque es la misma que tiene que aplicar la
      // pantalla. Sin monto ni respuesta ⛔ no se toca lo ya registrado.
      //
      // 🔑 **`retencionAt` viaja desde la fila y ⛔ no se recalcula acá**: es lo que hace que
      // volver a decidir ⛔ no reinicie el reloj de «hace tres días que no contesta». Es el mismo
      // cuidado que `desdeQueEsta` con `updated_at`, una vuelta más adentro.
      const retencion = registroDeRetencion({
        motivo: motivoActual,
        escenario,
        respuesta: texto(b.retencion_respuesta),
        monto: num(b.retencion_monto),
        forma: texto(b.retencion_forma),
        retornoDecidido: b.retorno_decidido === true,
        retencionAt: filaCaso.retencion_at || null,
        ahora: ahora(),
      });
      if (retencion.error) return res.status(400).json({ error: retencion.error });

      const total = num(b.monto_total);
      if (total != null && total < 0) return res.status(400).json({ error: 'el monto no puede ser negativo' });
      // Red de seguridad contra un monto disparatado: nunca más que lo que se pagó por la orden.
      const techo = num(b.techo_orden);
      if (total != null && techo != null && total > techo + 1) {
        return res.status(400).json({ error: `el monto (${total}) supera lo que se pagó por la orden (${techo})` });
      }

      // Si el producto no vuelve, no hay nada que esperar ni venta que anular por el retorno.
      // 🔑 Sale de `laUnidadVuelve` y ⛔ NO se vuelve a escribir acá. Esta línea era una COPIA de la
      // regla (`destino === 'stock' || (destino === 'falla' && retorno_decidido)`), o sea el modo de
      // falla característico de este módulo: la misma decisión en dos lugares. Sobrevivió a la
      // mudanza del 25-ago-2026, y con el destino `regalada` del 26 habría quedado contestando bien
      // por casualidad — hasta el día que la regla del núcleo cambie y ésta no.
      const vuelve = laUnidadVuelve(destino, b.retorno_decidido === true);
      // Un cambio no se salda con los pendientes de una devolución, y confundirlos lo dejaba
      // trabado sin poder cerrarse nunca. Ver el bloque `esCambio` más abajo.
      const esCambio = compensacion === 'otro_producto';
      const diferencia = num(b.diferencia);
      const extra = {
        // Sin producto en juego el destino queda en null a propósito: inventarle uno ('no_salio')
        // diría que nunca salió del depósito, y en una demora salió y llegó.
        destino_prenda: hayProducto ? destino : null,
        escenario,
        compensacion,
        monto_producto: num(b.monto_producto),
        monto_acordado: num(b.monto_acordado),
        monto_envio_devuelto: num(b.monto_envio_devuelto),
        monto_total: total,
        devolver_envio: b.devolver_envio === true,
        retorno_sugerido: b.retorno_sugerido === true,
        retorno_decidido: b.retorno_decidido === true,
        via_retorno: VIAS.includes(b.via_retorno) ? b.via_retorno : null,
        envio_costo: num(b.envio_costo),
        envio_ida_costo: num(b.envio_ida_costo),
        costo_caso: num(b.costo_caso),
        cupon_codigo: texto(b.cupon_codigo),
        ...retencion.campos,
        // Se puede completar al decidir. Sólo pisa si viene algo: mandar null no borra lo cargado
        // en el alta.
        ...(EXPECTATIVAS.includes(b.expectativa) ? { expectativa: b.expectativa } : {}),
        // "Pedido mal armado": lo que recibió por error. Se carga al decidir, con las fotos.
        ...(Array.isArray(b.items_correctos) ? { items_correctos: b.items_correctos } : {}),
        // Sólo si vino algo: mandar la decisión desde una pantalla que no conoce los destinos por
        // producto ⛔ no puede borrarlos, igual que con el escenario y con la oferta de retención.
        ...(b.destinos != null ? { items: conDestinos.lista } : {}),
        // El reclamo al transportista es plata recuperable NUESTRA y corre en paralelo: no espera
        // a ninguna resolución. Se encendía sólo al crear un `no_llego`; ahora una demora que fue
        // del transporte también lo enciende, y eso lo dice el ESCENARIO, no el caso.
        //
        // ⚠️ Se apaga si dejó de corresponder —corregir el escenario de "transporte" a "quedó en
        // preparación" no puede dejar un pendiente que nadie va a poder tildar nunca— pero ⛔ **sólo
        // si sigue en 'pendiente'**: un 'hecho' es el registro de que el reclamo se presentó de
        // verdad, y eso no se borra desde acá.
        ...(pideReclamoAlTransportista(motivoActual, escenario)
          ? { reclamo_correo_estado: 'pendiente' }
          : (filaCaso.reclamo_correo_estado === 'pendiente' ? { reclamo_correo_estado: 'no_aplica' } : {})),
        // El cambio por otro producto: lo que se lleva y cuánto queda de diferencia.
        items_nuevos: Array.isArray(b.items_nuevos) ? b.items_nuevos : [],
        forma_pago: FORMAS_PAGO.includes(b.forma_pago) ? b.forma_pago : null,
        diferencia,
        descuento_manual: num(b.descuento_manual),
        envio_paga: ENVIO_PAGA.includes(b.envio_paga) ? b.envio_paga : null,
        // **Un cambio decidido acá todavía no existe como cambio: queda en BORRADOR.**
        // Falta lo esencial —qué se lleva, la forma de pago, la diferencia, el cobro— y eso se
        // arma en el POS. Mandarlo a `en_transito` como al resto lo dejaba diciendo "En camino de
        // vuelta" sobre algo que nunca se armó, y encima fuera del estado en el que el POS ofrece
        // "Crear venta": el local no podía terminarlo.
        estado: esCambio ? 'borrador' : (vuelve ? 'en_transito' : 'resuelto'),
        // ── Los pendientes ────────────────────────────────────────────────────────
        //
        // Salen enteros de `EFECTOS_RESOLUCION` (`lib/reclamos/efectos.core.js`): una fila por
        // resolución con las mismas seis preguntas. Antes se derivaban acá con dos condiciones
        // escritas a mano, y **tres de las siete resoluciones no estaban en ellas** — `reenvio`,
        // `cupon` y `ninguna` encendían "devolver la plata" y "anular la venta en GN", que no
        // corresponden en ninguna de las tres. Agregar una resolución ya no es acordarse de dos
        // listas: es agregar una fila.
        ...pendientesDe({ compensacion, diferencia }),
      };

      // ── El costo de la mercadería, que hasta hoy valía CERO ──────────────────
      //
      // 🔴 Los reclamos abiertos **antes** del 30-ago-2026 tienen los ítems sin costo, y los que se
      // abren hoy pueden tenerlo si el producto ⛔ no estaba en GN al crearlos. Decidir es el otro
      // momento en que el número importa, así que se vuelve a intentar acá.
      //
      // 🔑 **Y si acá se completó alguno, el `costo_caso` que mandó la pantalla quedó viejo por
      // definición**: lo calculó con la unidad en cero. Se recalcula del lado del servidor con
      // `costoDeLaFila` —la MISMA función que usa la pantalla, ⛔ no una copia— sobre la fila que
      // está por quedar guardada. Si ⛔ no se completó nada, se respeta lo que vino: el servidor
      // ⛔ no le discute un número a la pantalla sin motivo.
      const itemsDecididos = b.destinos != null ? conDestinos.lista : filaCaso.items;
      const relleno = await conCosto(store, itemsDecididos);
      if (relleno.completados) {
        extra.items = relleno.lista;
        extra.costo_caso = costoDeLaFila({ ...filaCaso, ...extra });
      }

      // La oferta va en la nota porque es lo único del historial que cuenta lo que se INTENTÓ antes
      // de esta resolución: leyendo sólo la resolución, una retención rechazada no existió nunca.
      const notaRetencion = retencion.campos?.retencion_respuesta
        ? ` · se le ofreció ${retencion.campos.retencion_monto} para que se lo quede: ${retencion.campos.retencion_respuesta === 'acepto' ? 'aceptó' : 'no aceptó'}`
        : '';
      await apilar(supabase, id, { estado: extra.estado, at: ahora(), usuario, nota: `decidido: ${destino} · ${compensacion}${notaRetencion}` }, extra);
      return res.status(200).json({ ok: true, estado: extra.estado });
    }

    // ── Mudar el reclamo a otro caso, conservando la historia ────────────────────
    //
    // Cinco de los once casos terminan en "si pasa X, en realidad es otro caso": una disconformidad
    // que resulta ser una publicación mal hecha, un "no llegó" que finalmente llegó tarde, un talle
    // que en realidad era otro producto. Sin esta acción hay que abrir un reclamo nuevo, y ahí se
    // pierden el número, las fotos que cargó el cliente, el relato y el historial.
    //
    // ⚠️ **Borra el escenario**: es de la lista del caso viejo. El caso nuevo se vuelve a mirar.
    if (action === 'reclasificar') {
      const nuevo = MOTIVOS.includes(b.motivo) ? b.motivo : null;
      if (!nuevo) return res.status(400).json({ error: 'falta el caso al que mudarlo' });
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones').select('motivo, estado').eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      if (fila.motivo === nuevo) return res.status(400).json({ error: 'ya es ese caso' });
      const nota = `caso: ${fila.motivo} → ${nuevo}${texto(b.nota) ? ` (${texto(b.nota)})` : ''}`;
      await apilar(supabase, id, { estado: fila.estado, at: ahora(), usuario, nota }, { motivo: nuevo, escenario: null });
      return res.status(200).json({ ok: true, motivo: nuevo });
    }

    // ── El cambio: se arma en dos tiempos y NO lo aprueba Administración ──────────
    //
    // Está deliberadamente fuera de `DE_ADMIN`. Un cambio no es una decisión que alguien tenga que
    // autorizar: es una operación de mostrador donde ya se sabe qué se hace. Mientras `decidir`
    // estuvo siendo el único camino, el Local literalmente no podía armar uno.
    //
    // Guarda el borrador tal como esté, **sin exigir nada**: el cambio se arma en dos tiempos (se
    // elige qué devuelve y qué se lleva, sale la diferencia, se le pasa al cliente, y queda a medio
    // hacer hasta que paga). Lo que sí valida es el gate de facturar, en `procesar`.
    if (action === 'cambio') {
      const campos = {
        compensacion: 'otro_producto',
        destino_prenda: 'stock', // lo que vuelve en un cambio está sano y se revende
      };
      if (b.orden_tn !== undefined) campos.orden_tn = texto(b.orden_tn);
      if (b.cliente !== undefined) campos.cliente = texto(b.cliente);
      if (b.motivo !== undefined && MOTIVOS.includes(b.motivo)) campos.motivo = b.motivo;
      if (b.items !== undefined && Array.isArray(b.items)) campos.items = b.items;
      if (b.items_nuevos !== undefined && Array.isArray(b.items_nuevos)) campos.items_nuevos = b.items_nuevos;
      if (b.forma_pago !== undefined) campos.forma_pago = FORMAS_PAGO.includes(b.forma_pago) ? b.forma_pago : null;
      if (b.via_retorno !== undefined) campos.via_retorno = VIAS.includes(b.via_retorno) ? b.via_retorno : null;
      if (b.envio_paga !== undefined) campos.envio_paga = ENVIO_PAGA.includes(b.envio_paga) ? b.envio_paga : null;
      if (b.envio_costo !== undefined) campos.envio_costo = num(b.envio_costo);
      if (b.descuento_manual !== undefined) campos.descuento_manual = num(b.descuento_manual);
      if (b.solicitud_envio !== undefined) campos.solicitud_envio = texto(b.solicitud_envio);
      // Mismo piso que en `editar`: es la otra puerta por la que entran los dos códigos.
      for (const campo of ['seguimiento_ida', 'seguimiento_vuelta']) {
        if (b[campo] === undefined) continue;
        const r = leerSeguimiento(b[campo]);
        if (!r.ok) return res.status(400).json({ error: r.error });
        campos[campo] = r.codigo;
      }
      if (b.pagado !== undefined) campos.pagado = b.pagado === true;
      // La diferencia la calcula el cliente con `calcularCambio` (un solo lugar, con tests). Acá
      // solo se valida el rango: un cambio no puede cobrar más que el valor de lo que se lleva.
      if (b.diferencia !== undefined) {
        const d = num(b.diferencia);
        const techo = num(b.techo_nuevos);
        if (d != null && techo != null && d > techo + 1) {
          return res.status(400).json({ error: `la diferencia (${d}) supera lo que se lleva (${techo})` });
        }
        campos.diferencia = d;
      }
      // El cobro sigue a la diferencia salvo que ya se haya cobrado: no se pisa un cobro hecho.
      const { data: previo } = await supabase.from('devoluciones').select('estado, cobro_estado').eq('id', id).single();
      if (campos.diferencia !== undefined && previo?.cobro_estado !== 'cobrado') {
        campos.cobro_estado = campos.diferencia > 0 ? 'pendiente' : 'no_aplica';
      }
      // 🔑 **El evento lleva el estado en el que la fila QUEDA, ⛔ no uno escrito a mano.** Hasta el
      // 28-ago-2026 apilaba `'borrador'` fijo sin tocar la columna `estado`, así que armar un cambio
      // sobre un reclamo `en_revision` dejaba en el historial un momento en el que la fila **nunca
      // estuvo**: `desdeQueEsta(d, 'borrador')` devolvía esa fecha. El historial es lo que se lee
      // después para saber qué pasó y desde cuándo — un evento que miente ahí es un reloj que miente.
      await apilar(supabase, id, { estado: previo?.estado || 'borrador', at: ahora(), usuario, nota: b.pagado === true ? 'cambio marcado como pagado' : 'borrador del cambio guardado' }, campos);
      return res.status(200).json({ ok: true });
    }

    // Registra la venta REAL que ya se creó en Gestión Nube (la crea el cliente contra
    // `crear-venta.js`, que es el único que sabe hablar con GN). A partir de acá el producto que
    // vuelve queda como pendiente de reingreso MANUAL: la API de GN no acepta una venta negativa.
    if (action === 'procesar') {
      const extra = {
        gn_venta_id: texto(b.gn_venta_id),
        gn_venta_number: texto(b.gn_venta_number),
        pagado: true,
        estado: 'en_transito',
        reingreso_estado: 'pendiente',
        // La venta original no se anula nunca en un cambio: el cliente se queda con su compra.
        stock_estado: 'no_aplica',
      };
      await apilar(supabase, id, { estado: 'en_transito', at: ahora(), usuario, nota: `venta del cambio creada en GN${b.gn_venta_number ? ` (#${b.gn_venta_number})` : ''}` }, extra);
      return res.status(200).json({ ok: true });
    }

    // ── Llegó ────────────────────────────────────────────────────────────────────
    //
    // 🔑 Es una acción propia y no `estado: 'recibido'` porque **es el gesto que hace Depósito**, y
    // con el permiso de la bandeja tiene que poder hacer ése y ningún otro: la acción `estado`
    // genérica acepta los ocho, cerrar y anular incluidos.
    //
    // ⚠️ Sólo desde `en_transito`. Recibir algo que no estábamos esperando no es un error de tipeo:
    // es que el reclamo no está donde el que lo recibe cree, y taparlo con un update deja la fila
    // diciendo que volvió algo que nunca salió.
    if (action === 'recibir') {
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones')
        .select('estado, motivo, items, items_correctos, destino_prenda, retorno_decidido')
        .eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      if (fila.estado === 'recibido') return res.status(200).json({ ok: true, yaEstaba: true });
      if (fila.estado !== 'en_transito') {
        return res.status(400).json({ error: `este reclamo no está esperando nada (está en "${fila.estado}")` });
      }
      // 🔑 **El cero afirma**: sin esto, un reclamo que no espera ninguna unidad —el caso probable es
      // el `mal_armado` al que no se le cargó qué le llegó por error— contestaría "llegó todo" y
      // pasaría a `recibido` sin que nadie haya abierto una caja.
      const traba = trabaParaRecibir(fila);
      if (traba) return res.status(400).json({ error: traba });

      // Se puede recibir de a UNA. Sin `unidades` llegó todo, que es lo que significaba este verbo
      // hasta el 25-ago-2026 y lo que siguen mandando el botón "Volvió" y el de la bandeja.
      const pedidas = Array.isArray(b.unidades) ? b.unidades : null;
      const r = recibirUnidades(fila, pedidas, ahora());
      if (!r.recibidas) return res.status(400).json({ error: 'ninguno de esos productos está esperado en este reclamo' });

      // ⚠️ Mientras falte una unidad el reclamo **sigue en tránsito**: darlo por recibido con una
      // caja a medias es lo que hacía que la otra no la buscara nadie.
      const estado = r.todoLlego ? 'recibido' : 'en_transito';
      const nota = texto(b.nota) || (r.todoLlego
        ? (r.recibidas > 1 ? `llegaron los ${r.recibidas} productos` : 'llegó')
        : `llegó ${r.recibidas} de ${r.recibidas + r.faltan}: falta${r.faltan > 1 ? 'n' : ''} ${r.faltan}`);
      await apilar(supabase, id, { estado, at: ahora(), usuario, nota }, { [r.campo]: r.lista, estado });
      return res.status(200).json({ ok: true, todoLlego: r.todoLlego, faltan: r.faltan });
    }

    // ── Qué contestó el cliente a la oferta de que se lo quede ──────────────────
    //
    // 🔴 **El eslabón que faltaba del circuito** *(Administración decide · el local habla y
    // ejecuta)*. Hasta el 28-ago-2026 la respuesta sólo se podía anotar reabriendo **Decidir**, que
    // es de Administración: el que escucha al cliente ⛔ no la podía registrar, y entre medio el
    // reclamo se quedaba quieto con una oferta esperando.
    //
    // ⛔ **Por eso NO está en `DE_ADMIN`**, igual que `descontado`, `falla` y `gn-baja`: cuando la
    // oferta salió, Administración ya decidió **las dos ramas** —el monto, la forma, y la salida
    // «por si dice que no», que es la resolución guardada—. Lo único que agrega el local es **cuál
    // de las dos pasó**: anotar un paso que ya ocurrió en el mundo ⛔ no es decidir plata.
    //
    // 🔑 **Lo que se escribe sale entero de `camposAlContestarLaOferta`** (`casos.core.js`), que a
    // su vez deriva de `salidaAlAceptarRetencion`, `destinoDe` y `pendientesDe`. ⛔ Acá no se vuelve
    // a escribir ninguna de las tres: duplicar esa derivación es el bug que este módulo ya tuvo.
    if (action === 'retencion-respuesta') {
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones')
        // ⚠️ `items` entra por `costo_caso`: la unidad que el cliente se queda se valúa **a costo**,
        // y sin la lista el número saldría contando sólo la plata. Es la mitad grande del costo.
        // ⚠️ `compensacion` entra por **D4**: sin ella el rechazo no puede saber si hay una rama
        // «si dice que no» guardada, y la nota del historial lo afirmaba sin mirar.
        .select('estado, motivo, escenario, compensacion, retencion_monto, retencion_forma, retencion_respuesta, diferencia, items')
        .eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      /**
       * 🔴 **El freno vive acá, ⛔ no sólo en la pantalla**, y frena las DOS mitades:
       *
       *  - sin oferta registrada no hay nada que contestar — una respuesta suelta es la media
       *    oferta que después hace mentir la cuenta de cuántas veces funciona la retención;
       *  - **ya contestada tampoco**: aceptar dos veces reescribiría la resolución y **destildaría
       *    los pendientes que ya se ejecutaron** (la plata que salió, el cupón emitido), que es
       *    exactamente lo que `loEjecutado` frena en `decidir`. El mensaje nombra lo que pasó, ⛔ no
       *    dice «no se puede».
       */
      if (fila.retencion_respuesta) {
        return res.status(409).json({ error: `Esta oferta ya está contestada (${fila.retencion_respuesta === 'acepto' ? 'aceptó' : 'no aceptó'}). Para cambiarla, Administración tiene que volver a decidir el reclamo.` });
      }
      if (!ofertaEsperandoRespuesta(fila)) {
        return res.status(409).json({ error: 'Este reclamo no tiene ninguna oferta esperando respuesta.' });
      }
      const r = camposAlContestarLaOferta({
        respuesta: texto(b.respuesta),
        motivo: fila.motivo,
        escenario: fila.escenario || null,
        monto: num(fila.retencion_monto),
        forma: texto(fila.retencion_forma),
        diferencia: num(fila.diferencia),
        // 🔑 **Obligatoria aunque valga `null`** (D4): decide si el rechazo puede decir «sigue lo
        // que estaba decidido» o si el reclamo vuelve a «hay que decidir». `|| null` y ⛔ no
        // `?? null` a propósito: un `''` guardado ⛔ no es una decisión.
        compensacionGuardada: fila.compensacion || null,
        items: Array.isArray(fila.items) ? fila.items : [],
      });
      if (r.error) return res.status(400).json({ error: r.error });
      const acepto = r.campos.retencion_respuesta === 'acepto';
      // 🔴 **La nota sale del núcleo y ⛔ no se arma acá.** La que estaba escrita en este archivo
      // era la premisa falsa palabra por palabra: afirmaba «sigue lo que estaba decidido» sin
      // haber leído `compensacion`, sobre la única fila real que hubo (R-0022).
      const nota = r.nota;
      // ⚠️ El estado del evento es el que queda: aceptar lo mueve a `resuelto`, y rechazar lo
      // vuelve a sellar en `en_revision` cuando ⛔ no hay decisión —que es lo que hace arrancar el
      // reloj de «hay que decidir» en el rechazo—. Poner `fila.estado` fijo dejaría el historial
      // contando otra cosa que la fila.
      await apilar(supabase, id, { estado: r.campos.estado || fila.estado, at: ahora(), usuario, nota }, r.campos);
      return res.status(200).json({ ok: true, acepto, estado: r.campos.estado || fila.estado });
    }

    // ── La unidad SANA que se queda el cliente salió del stock ───────────────────
    //
    // 🔑 Es la mitad que faltaba del descuento. La otra —la unidad fallada— sale por el alta en
    // Fallas, que la valúa y la manda a revender como falla; hacer pasar por ahí una unidad
    // impecable ensuciaba el ledger con mercadería que está sana. Desde el 26-ago-2026 cada mitad
    // tiene su cliente propio en Gestión Nube (`FALLA_CLIENT` / `RECLAMO_CLIENT`).
    //
    // ⚠️ **Es una traza, no un efecto**: la venta técnica la crea `api/crear-venta.js` desde la app
    // —los tokens de ventas de GN sólo viven en producción— y acá se sella cuál unidad ya salió.
    // ⛔ Por eso NO está en `DE_ADMIN`, igual que `falla`, `gn-baja` y `reingreso`: anotar un paso
    // físico que ya ocurrió no es decidir plata. El botón que la dispara sí es de Administración,
    // que es quien corre la venta.
    if (action === 'descontado') {
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones')
        .select('estado, motivo, compensacion, items, items_correctos, destino_prenda, stock_estado')
        .eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      /**
       * 🔴 **Sin resolución ⛔ no sale mercadería del depósito.**
       *
       * `loQueFaltaDescontar` es una pregunta de **inventario** —qué unidades quedaron en poder del
       * cliente y todavía no se descontaron— y hace bien en no saber nada de resoluciones. Pero
       * hasta el 27-ago-2026 alcanzaba con `destino_prenda: 'regalada'` para disparar la baja, y
       * ese campo lo escribía **sólo `decidir`** ⇒ «tener el destino» y «estar decidido» eran lo
       * mismo, y el guard sobraba.
       *
       * Ese día «Confirmar paso» empezó a guardar el destino por `editar`, para poder analizar un
       * reclamo en varias sentadas. Desde entonces **el campo existe antes que la decisión**, y sin
       * este freno se puede sacar stock de un reclamo que todavía nadie resolvió: si después se
       * decide que el producto vuelve, la unidad quedó descontada dos veces y no lo dice nadie.
       *
       * ⚠️ Va **acá y no sólo en la pantalla**: una pantalla que esconde un botón es una sugerencia,
       * no una regla. Y el mensaje nombra lo que falta, ⛔ no dice «no se puede».
       */
      if (!fila.compensacion) {
        return res.status(409).json({ error: 'Este reclamo todavía no está decidido: primero resolvelo y después descontá el stock.' });
      }
      /**
       * 🔴 **Y el ORDEN, que es de lo que cuelga que el stock quede bien.** Anular la venta devuelve
       * la unidad a GN, y esta venta técnica es la que la vuelve a sacar; al revés saca una que
       * todavía no volvió y **el stock queda uno abajo del real**, sin error y hasta el próximo
       * conteo. El aviso vivía sólo en el toast de la pantalla, y sólo en el camino de Fallas.
       *
       * ⚠️ **El freno que sirve está antes de escribir en GN** (`descontarRegaladas`, que corre en
       * la app porque los tokens de ventas viven en producción): acá el sello llega **después** de
       * que la venta exista. Éste es el respaldo para el que entre por otra puerta — la misma
       * repartija que `despachado`, y la misma razón: una pantalla que esconde un botón es una
       * sugerencia, no una regla.
       */
      const trabaOrden = faltaAnularAntesDeDescontar(fila);
      if (trabaOrden) return res.status(409).json({ error: trabaOrden });
      // 🔑 **El cero afirma.** Sin esto, un reclamo donde nada se regala contestaría "descontado
      // todo" sobre una lista vacía y quedaría sellado un paso que nadie hizo.
      if (!loQueFaltaDescontar(fila).unidades.length) {
        return res.status(400).json({ error: 'este reclamo no tiene ningún producto sano pendiente de descontar' });
      }
      const pedidas = Array.isArray(b.unidades) ? b.unidades : null;
      const r = descontarUnidades(fila, pedidas, ahora(), texto(b.gn_venta_number) || null);
      if (!r.descontadas) return res.status(400).json({ error: 'ninguno de esos productos está pendiente de descontar en este reclamo' });
      const nota = texto(b.nota) || `salió${r.descontadas > 1 ? 'n' : ''} de GN ${r.descontadas} producto${r.descontadas > 1 ? 's' : ''} que se queda el cliente`
        + (texto(b.gn_venta_number) ? ` (venta #${texto(b.gn_venta_number)})` : '')
        + (r.faltan ? ` — falta${r.faltan > 1 ? 'n' : ''} ${r.faltan}` : '');
      await apilar(supabase, id, { estado: fila.estado, at: ahora(), usuario, nota }, { [r.campo]: r.lista });
      return res.status(200).json({ ok: true, descontadas: r.descontadas, faltan: r.faltan, seDescontoTodo: r.seDescontoTodo });
    }

    // ── De qué OTRA venta salió el producto de más ───────────────────────────────
    //
    // 🔑 El excedente es el único caso que toca **dos ventas**: al cliente de acá le llegó algo que
    // no compró, y del otro lado hay una venta a la que le falta y un cliente que todavía no
    // reclamó. La pantalla decía «se guarda cuál y se avisa» y ⛔ no se guardaba nada.
    //
    // ⚠️ **Es una traza, no un efecto**, igual que `descontado`: el faltante de la otra venta lo
    // abre una persona y acá se anota cuál es. ⛔ Por eso no está en `DE_ADMIN`.
    if (action === 'otra-venta') {
      const orden = texto(b.otra_orden);
      // 🔑 Exige el número por la misma razón que el cupón exige el código: es lo único que prueba
      // que alguien fue a mirar la otra venta. Sin él esto sería tildar "ya está" sobre nada.
      if (!orden) return res.status(400).json({ error: 'falta el número de la otra venta' });
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones')
        .select('estado, motivo, escenario, items, items_correctos')
        .eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      // El cero afirma: sin esto, un reclamo que no es un excedente contestaría "anotado" sobre una
      // lista vacía y quedaría sellado un paso que nadie hizo.
      if (!sinLaOtraVenta(fila).unidades.length) {
        return res.status(400).json({ error: 'este reclamo no tiene ningún producto de más pendiente de anotar' });
      }
      const pedidas = Array.isArray(b.unidades) ? b.unidades : null;
      const r = anotarLaOtraVenta(fila, pedidas, orden);
      if (!r.anotadas) return res.status(400).json({ error: 'ninguno de esos productos está pendiente de anotar en este reclamo' });
      const nota = `producto de más: salió de la venta #${orden}`
        + (r.faltan ? ` — falta${r.faltan > 1 ? 'n' : ''} ${r.faltan}` : '');
      await apilar(supabase, id, { estado: fila.estado, at: ahora(), usuario, nota }, { [r.campo]: r.lista });
      return res.status(200).json({ ok: true, anotadas: r.anotadas, faltan: r.faltan });
    }

    // El producto devuelto volvió al stock a mano en GN. Como `anulacion`, es una TRAZA de un paso
    // manual: el sistema no lo hace ni puede hacerlo.
    if (action === 'reingreso') {
      await apilar(supabase, id, { estado: 'recibido', at: ahora(), usuario, nota: 'devuelto reingresado a mano en GN' }, { reingreso_estado: 'hecho' });
      return res.status(200).json({ ok: true });
    }

    // ── Lo que sale HACIA el cliente ya salió ────────────────────────────────────
    //
    // El pendiente lo dejan las tres resoluciones que le mandan algo (cambio, reposición, reenvío)
    // y **no tenía con qué tildarse**: se podía dejar el reclamo trabado para siempre, que es el
    // mismo agujero que este módulo ya había tenido con los pendientes mal derivados.
    // ⛔ No es de administración: despacha Depósito.
    //
    // 🔑 **Y desde el 28-ago-2026 mira el pendiente antes de sellarlo.** Este verbo lo puede llamar
    // ahora un perfil cuya ÚNICA puerta es la bandeja (`retornos`), que es angosta a propósito: sin
    // esto, tildarlo sobre un reclamo que no tiene nada para mandar sellaría un paso que nadie hizo
    // — el mismo «el cero afirma» que ya frenan `recibir`, `descontado` y `otra-venta`. La pantalla
    // sólo muestra el botón en el andén que filtra por este pendiente; el freno vive acá porque una
    // pantalla que esconde un botón es una sugerencia, ⛔ no una regla.
    if (action === 'despachado') {
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones').select('estado, envio_nuevo_estado').eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      // Idempotente, igual que `recibir`: dos personas mirando la misma caja no se pisan.
      if (fila.envio_nuevo_estado === 'hecho') return res.status(200).json({ ok: true, yaEstaba: true });
      if (fila.envio_nuevo_estado !== 'pendiente') {
        return res.status(409).json({ error: 'este reclamo no tiene ningún paquete pendiente de despachar' });
      }
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: 'despachado lo que se le manda' }, { envio_nuevo_estado: 'hecho' });
      return res.status(200).json({ ok: true });
    }

    // ── El cupón existe en la tienda ─────────────────────────────────────────────
    //
    // 🔑 **Exige el código.** Sin él esto sería tildar "ya está" sobre una promesa: el cupón se crea
    // a mano en la tienda y lo único que prueba que existe es el código que quedó anotado.
    if (action === 'cupon-emitido') {
      const codigo = texto(b.cupon_codigo);
      if (!codigo) return res.status(400).json({ error: 'falta el código del cupón: sin eso no hay cómo saber que existe' });
      // 🔑 **Y desde el 30-ago-2026 también la fecha**, por el mismo motivo por el que exige el
      // código: un cupón sin vencimiento ⛔ no es un cupón, es una discusión postergada — el que se
      // entera de que venció es el cliente, en la caja. Y sin fecha ⛔ no hay breakage que medir,
      // que es el argumento entero para elegir el cupón sobre la plata. La regla vive en
      // `cupon.core.js` y contesta en criollo qué se rompe.
      const vence = leerVencimiento(b.cupon_vence);
      if (!vence.ok) return res.status(400).json({ error: vence.error });
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: `cupón emitido: ${codigo} (vence ${vence.fecha})` }, {
        cupon_codigo: codigo,
        cupon_vence: vence.fecha,
        cupon_estado: 'hecho',
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'cobrado') {
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: 'diferencia cobrada' }, { cobro_estado: 'cobrado' });
      return res.status(200).json({ ok: true });
    }

    // ── La plata, que ⛔ no sale hasta que el producto vuelva ─────────────────────
    //
    // 🔴 **Hasta el 30-ago-2026 éste era el único verbo que mueve plata SIN LEER LA FILA**: escribía
    // a ciegas, así que se podía devolver la plata de un reclamo `en_transito` con el producto en la
    // calle. Y tildarlo **apaga** el aviso «hace N días que la plata no sale» ⇒ el caso quedaba mudo.
    // La regla y su texto viven en `efectos.core.js`, al lado de la otra regla de ORDEN del módulo.
    //
    // 🔑 **La salida explicada ⛔ no es un agujero: es lo que evita que se haga por afuera.** A veces
    // hay que pagar antes —un cliente que amenaza con el reclamo formal, un monto chico que no vale
    // la espera—, y sin salida esa plata sale igual, por transferencia, y en el sistema ⛔ no queda
    // nada. Con `motivo` sale, con quién y por qué, escrito en el `historial`.
    if (action === 'reintegro') {
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones').select(COLUMNAS_PARA_DEVOLVER.join(', ')).eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      const traba = faltaRecibirAntesDeDevolver(fila);
      const motivo = texto(b.motivo);
      if (traba && !motivo) return res.status(409).json({ error: traba, traba: 'falta-recibir' });
      await apilar(supabase, id, {
        estado: 'resuelto',
        at: ahora(),
        usuario,
        nota: traba ? `plata devuelta ANTES de que vuelva el producto: ${motivo}` : 'plata devuelta',
      }, {
        reintegro_estado: 'hecho',
        reintegro_at: ahora(),
        reintegro_por: usuario,
        reintegro_comprobante: texto(b.comprobante),
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'anulacion') {
      // No la anula: registra que alguien la anuló a mano en GN, porque la API no lo permite.
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: 'venta anulada a mano en GN' }, { stock_estado: 'hecho' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'gn-baja') {
      // El rótulo dice **Gestión Nube** y no "TN": la columna se llama `tn_stock_estado` por su
      // primera versión, pero la baja que se tilda acá es la de GN (ver `tipos.ts`, `TN_STOCK`).
      // El historial es lo que se lee después, y ahí el nombre del sistema equivocado manda a
      // buscar el movimiento a la tienda, donde no está.
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: 'baja del producto en Gestión Nube' }, { tn_stock_estado: 'hecho' });
      return res.status(200).json({ ok: true });
    }

    // ── Cerrar y anular: los dos finales del reclamo ─────────────────────────────
    //
    // 🔑 **Desde el 28-ago-2026 el freno vive acá y ⛔ no sólo en la pantalla.** `faltantesParaCerrar`
    // era la lista que pone gris el botón «Cerrar» en Reclamos y en Cambios, y el handler aceptaba
    // `estado: 'cerrado'` igual: se podía cerrar un reclamo **con la plata sin devolver y la venta
    // sin anular**. Es la regla que este archivo ya tiene escrita tres veces — *una pantalla que
    // esconde un botón es una sugerencia, ⛔ no una regla*.
    //
    // ⚠️ **Cerrar ⛔ NO pide administración, y es a propósito.** La auditoría del 28-ago (D11) pedía
    // las dos cosas juntas; pedir administración le sacaría el botón «Cerrar» al Local en
    // `ArmarCambio.tsx`, que es exactamente lo que el encabezado de este archivo dice que el Local
    // tiene que poder hacer de punta a punta. Lo que protege la plata ⛔ no es el rol: es que no
    // queden pendientes. **Anular sí**: es el hermano de `eliminar` —el reclamo no debió existir—
    // y hoy ⛔ ninguna pantalla lo pone.
    if (action === 'estado') {
      if (!ESTADOS.includes(b.estado)) return res.status(400).json({ error: 'estado inválido' });
      if (b.estado === 'anulado' && !esAdministracion(perfil)) {
        return res.status(403).json({ error: 'Anular un reclamo lo hace Administración: pedile a alguien con ese permiso.' });
      }
      if (b.estado === 'cerrado') {
        const { data: fila, error: eLee } = await supabase
          .from('devoluciones').select(COLUMNAS_PARA_CERRAR.join(', ')).eq('store', store).eq('id', id).maybeSingle();
        if (eLee) throw new Error(eLee.message);
        if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
        // Idempotente, igual que `recibir` y `despachado`: cerrar dos veces ⛔ no es un error.
        if (fila.estado === 'cerrado') return res.status(200).json({ ok: true, yaEstaba: true });
        const faltan = faltantesParaCerrar(fila);
        if (faltan.length) {
          return res.status(409).json({ error: `Todavía falta ${faltan.join(', ')}.`, faltan });
        }
      }
      await apilar(supabase, id, { estado: b.estado, at: ahora(), usuario, nota: texto(b.nota) }, { estado: b.estado });
      return res.status(200).json({ ok: true });
    }

    // ── Lo que se le acaba de decir al cliente ───────────────────────────────────
    //
    // 🔴 **La columna `mensajes` existía desde el día uno, estaba en el `select`, y ⛔ no la
    // escribía nadie** (D9 de la auditoría del 28-ago-2026): R-0022 la traía `[]` después de que se
    // le mandaron el link, la propuesta y la resolución. De la resolución —donde se promete la
    // plata— ⛔ no quedaba rastro.
    //
    // ⛔ **No pasa por `apilar()`, y ⛔ no es un descuido.** `apilar` mueve `updated_at`, y de ahí
    // cuentan dos alertas: *«hace N días que la plata no sale»* y *«esperando una decisión hace N
    // días»*. Copiar el mensaje de resolución **reiniciaría el reloj de que la plata no salió**
    // justo cuando se le está prometiendo al cliente que va a salir. Es la misma lección que ya
    // pagó el reloj de «hace N días que no llega». ⛔ Tampoco apila en `historial`: ahí va el
    // ESTADO en el que la fila queda, y cinco mensajes por reclamo lo llenarían de eventos que no
    // mueven nada.
    //
    // ⛔ **No es de administración**: el que le habla al cliente es el Local, y los cinco botones de
    // mensaje son suyos. Alcanza con la puerta de Reclamos, que ya se chequeó arriba.
    if (action === 'mensaje') {
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones').select('mensajes').eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      const r = apilarMensaje(fila.mensajes, { tipo: b.tipo, texto: b.texto, usuario, at: ahora() });
      if (r.error) return res.status(400).json({ error: r.error });
      // El mismo texto del mismo momento, pegado al anterior: es un doble click, ⛔ no una segunda
      // vez que se le contó. Para el que apretó se copió igual, así que esto ⛔ no es un error.
      if (r.repetido) return res.status(200).json({ ok: true, repetido: true });
      const { error } = await supabase.from('devoluciones').update({ mensajes: r.mensajes }).eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, mensajes: r.mensajes.length });
    }

    if (action === 'fotos') {
      const nuevas = Array.isArray(b.fotos) ? b.fotos : [];
      if (!nuevas.length) return res.status(400).json({ error: 'no vinieron fotos' });
      const { data: previo } = await supabase.from('devoluciones').select('fotos').eq('id', id).single();
      const fotos = (Array.isArray(previo?.fotos) ? previo.fotos : []).concat(nuevas);
      await apilar(supabase, id, { estado: 'en_revision', at: ahora(), usuario, nota: `${nuevas.length} foto(s)` }, { fotos });
      return res.status(200).json({ ok: true, fotos: fotos.length });
    }

    if (action === 'falla') {
      const ids = (Array.isArray(b.falla_ids) ? b.falla_ids : []).map((n) => parseInt(n, 10)).filter(Boolean);
      if (!ids.length) return res.status(400).json({ error: 'faltan los ids de las fallas' });
      const { data: previo } = await supabase.from('devoluciones').select('falla_ids').eq('id', id).single();
      const falla_ids = [...new Set((Array.isArray(previo?.falla_ids) ? previo.falla_ids : []).concat(ids))];
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: `pasó a Fallas (${ids.join(', ')})` }, { falla_ids });
      return res.status(200).json({ ok: true, falla_ids });
    }

    if (action === 'editar') {
      const campos = {};
      if (b.orden_tn !== undefined) campos.orden_tn = texto(b.orden_tn);
      if (b.cliente !== undefined) campos.cliente = texto(b.cliente);
      // ⚠️ Cambiar el caso **borra el escenario**: la lista es cerrada y el del caso anterior no
      // significa nada acá — peor, podría mover el perfil equivocado. Para mudar un reclamo
      // conservando la historia está la acción `reclasificar`, que es lo que usa la pantalla.
      if (b.motivo !== undefined && MOTIVOS.includes(b.motivo)) { campos.motivo = b.motivo; campos.escenario = null; }
      if (b.escenario !== undefined) {
        const motivoDestino = campos.motivo || (await supabase.from('devoluciones').select('motivo').eq('store', store).eq('id', id).maybeSingle()).data?.motivo;
        const esc = texto(b.escenario);
        if (esc && !esEscenarioDe(motivoDestino, esc)) return res.status(400).json({ error: `"${esc}" no es un escenario de ${motivoDestino}` });
        campos.escenario = esc;
      }
      if (b.motivo_detalle !== undefined) campos.motivo_detalle = texto(b.motivo_detalle);
      if (b.relato_cliente !== undefined) campos.relato_cliente = texto(b.relato_cliente);
      if (b.items !== undefined && Array.isArray(b.items)) campos.items = b.items;
      if (b.envio_costo !== undefined) campos.envio_costo = num(b.envio_costo);
      // 🔴 **Los dos códigos se validan acá y ⛔ no sólo en la pantalla.** `seguimiento_vuelta` es
      // el que decide el sub-estado de `en_transito`, el mensaje que se le ofrece al cliente y
      // **cuál de los dos relojes corre** —el nuestro de 2 días o el del transporte de 15—: un
      // código mal tipeado cambia a quién estamos yendo a buscar. Es un piso, ⛔ no un formato:
      // el porqué está en `seguimiento.core.js`.
      for (const campo of ['seguimiento_vuelta', 'seguimiento_ida']) {
        if (b[campo] === undefined) continue;
        const r = leerSeguimiento(b[campo]);
        if (!r.ok) return res.status(400).json({ error: r.error });
        campos[campo] = r.codigo;
      }
      if (b.envio_ida_costo !== undefined) campos.envio_ida_costo = num(b.envio_ida_costo);
      if (b.via_retorno !== undefined && VIAS.includes(b.via_retorno)) campos.via_retorno = b.via_retorno;
      if (b.gn_venta_reemplazo_id !== undefined) campos.gn_venta_reemplazo_id = texto(b.gn_venta_reemplazo_id);
      if (b.gn_venta_reemplazo_number !== undefined) campos.gn_venta_reemplazo_number = texto(b.gn_venta_reemplazo_number);
      if (b.gn_venta_id !== undefined) campos.gn_venta_id = texto(b.gn_venta_id);
      if (b.gn_venta_number !== undefined) campos.gn_venta_number = texto(b.gn_venta_number);
      if (b.cupon_codigo !== undefined) campos.cupon_codigo = texto(b.cupon_codigo);
      if (b.expectativa !== undefined && EXPECTATIVAS.includes(b.expectativa)) campos.expectativa = b.expectativa;
      if (b.reclamo_correo !== undefined) campos.reclamo_correo = texto(b.reclamo_correo);
      // ── El avance de `Decidir`, paso por paso ────────────────────────────────
      //
      // 🔑 **Se puede guardar lo de un paso sin resolver el reclamo.** Hasta el 27-ago-2026 la
      // pantalla era todo o nada: o se confirmaba la decisión entera o no quedaba nada, así que
      // salir a buscar un dato —cuánto salió el envío, qué contestó la clienta— perdía lo cargado.
      //
      // ⚠️ **Esto ⛔ NO decide**: no toca `estado`, ni `compensacion`, ni los pendientes. Y eso es
      // lo que lo hace seguro: la bandeja de Depósito filtra por `estado`
      // (`in ('en_transito','recibido','resuelto')`), así que un `retorno_decidido` guardado a
      // medio camino ⛔ no le aparece a nadie como algo que hay que esperar.
      if (b.destino_prenda !== undefined && DESTINOS.includes(b.destino_prenda)) campos.destino_prenda = b.destino_prenda;
      if (b.retorno_decidido !== undefined) campos.retorno_decidido = b.retorno_decidido === true;
      if (b.retencion_respuesta !== undefined || b.retencion_monto !== undefined) {
        // La regla es la misma que aplica `decidir`, y vive en `casos.core.js`: las dos mitades
        // juntas o ninguna. ⛔ No se reescribe acá — es exactamente el modo de falla de esta
        // sección (la misma regla en dos listas).
        const fila = (await supabase.from('devoluciones').select('motivo, escenario, retorno_decidido, retencion_at').eq('store', store).eq('id', id).maybeSingle()).data;
        if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
        const retencion = registroDeRetencion({
          motivo: fila.motivo,
          escenario: campos.escenario !== undefined ? campos.escenario : (fila.escenario || null),
          respuesta: texto(b.retencion_respuesta),
          monto: num(b.retencion_monto),
          forma: texto(b.retencion_forma),
          // El retorno que vale es el que se está guardando en este mismo gesto, si vino.
          retornoDecidido: campos.retorno_decidido !== undefined ? campos.retorno_decidido : fila.retorno_decidido === true,
          // La fecha de la oferta se sella una sola vez: guardar el paso de nuevo ⛔ no la mueve.
          retencionAt: fila.retencion_at || null,
          ahora: ahora(),
        });
        if (retencion.error) return res.status(400).json({ error: retencion.error });
        Object.assign(campos, retencion.campos);
      }
      if (b.items_correctos !== undefined && Array.isArray(b.items_correctos)) campos.items_correctos = b.items_correctos;
      if (b.items_nuevos !== undefined && Array.isArray(b.items_nuevos)) campos.items_nuevos = b.items_nuevos;
      if (b.forma_pago !== undefined && FORMAS_PAGO.includes(b.forma_pago)) campos.forma_pago = b.forma_pago;
      if (b.solicitud_envio !== undefined) campos.solicitud_envio = texto(b.solicitud_envio);
      if (b.descuento_manual !== undefined) campos.descuento_manual = num(b.descuento_manual);
      if (b.envio_paga !== undefined && ENVIO_PAGA.includes(b.envio_paga)) campos.envio_paga = b.envio_paga;
      if (b.pagado !== undefined) campos.pagado = b.pagado === true;
      if (b.cobro_estado !== undefined && COBROS.includes(b.cobro_estado)) campos.cobro_estado = b.cobro_estado;
      if (b.reclamo_correo_estado !== undefined && PENDIENTES.includes(b.reclamo_correo_estado)) campos.reclamo_correo_estado = b.reclamo_correo_estado;
      // Los pendientes se pueden volver atrás a mano si alguien se apuró a tildarlos.
      for (const k of ['stock_estado', 'reintegro_estado', 'tn_stock_estado', 'reingreso_estado', 'envio_nuevo_estado', 'cupon_estado']) {
        if (b[k] !== undefined && PENDIENTES.includes(b[k])) campos[k] = b[k];
      }
      if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });
      /**
       * 🔴 **`costo_caso` sigue a sus entradas, y hasta el 28-ago-2026 ⛔ no las seguía.**
       *
       * Es el único número que dice cuánto cuestan los errores propios, y **lo escribía sólo
       * `decidir`**. Pero `editar` puede tocar **seis de sus siete entradas** —los dos envíos, los
       * items (que es de donde sale la unidad, valuada a costo), el destino, el retorno y, por la
       * retención, el monto— y las dejaba cambiar sin mover el costo: el número quedaba afirmando
       * lo de una decisión que ya no era. Es lo mismo que le pasó a la rama de la oferta, por otra
       * puerta.
       *
       * ⚠️ **Sólo si el reclamo YA está decidido.** Mientras no lo esté, `editar` es «Confirmar
       * paso» guardando avance a medio camino, `costo_caso` todavía es `null` y quien lo escribe al
       * final es `decidir`: calcularlo antes sería afirmar un costo sobre una decisión que nadie
       * tomó — el mismo *un dato que existe ⛔ no es una decisión tomada* de la columna «A devolver».
       *
       * 🔑 **La cuenta ⛔ no se reescribe acá**: sale de `costoDeLaFila`, la misma que usa la
       * pantalla y la misma que usa aceptar la oferta. Se lee la fila entera y se le aplican encima
       * los campos de este gesto, porque el costo depende de **cómo queda**, no de qué se tocó.
       *
       * ⚠️ Y **la lista de entradas es la de la función** (`ENTRADAS_DEL_COSTO`), ⛔ no una copia:
       * el `select` y la pregunta salen de la misma, así que agregar una entrada al costo ⛔ no
       * puede dejar afuera ni al que la trae ni al que la escucha.
       */
      if (ENTRADAS_DEL_COSTO.some((k) => campos[k] !== undefined)) {
        const previa = (await supabase.from('devoluciones')
          .select(ENTRADAS_DEL_COSTO.join(', ') + ', compensacion')
          .eq('store', store).eq('id', id).maybeSingle()).data;
        if (previa && previa.compensacion) campos.costo_caso = costoDeLaFila({ ...previa, ...campos });
      }
      const { error } = await supabase.from('devoluciones').update({ ...campos, updated_at: ahora() }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'eliminar') {
      const { error } = await supabase.from('devoluciones').delete().eq('id', id).eq('store', store);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `acción desconocida: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}
