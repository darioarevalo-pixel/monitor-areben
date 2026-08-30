// El reclamo visto por el CLIENTE, desde el link que se le pasa por WhatsApp. **Es lo único de
// todo el módulo que está abierto a internet**, así que conviene leerlo con esa lente.
//
//   GET  /api/postventa?recurso=reclamo&token=XXX          → los pocos datos que el cliente ve.
//   POST { recurso:'reclamo', token, accion:'foto', dataUrl }   → suma UNA foto.
//   POST { recurso:'reclamo', token, accion:'enviar', relato }  → cierra la carga → 'en_revision'.
//   POST { recurso:'reclamo', accion:'alta', store, orden, mail, opcion, productos:[i] }
//                                                          → **CREA** el reclamo y devuelve el token.
//
// 🔴 **El alta es el primer verbo de todo el repo abierto a internet que CREA FILAS.** Los otros
// tres se apoyan en un token que ya existe; éste no tiene ninguno todavía, así que su llave es otra
// —el mail con el que se compró, cruzado contra Tienda Nube del lado del SERVIDOR— y sus frenos
// también. Ver `ALTA PÚBLICA` más abajo antes de tocarlo.
//
// CÓMO SE PROTEGE (no hay sesión: la llave es el token)
//   - El token son 64 hex aleatorios, único por reclamo, con vencimiento y revocable.
//   - Token inválido, vencido o de un reclamo ya resuelto → **404 pelado**. No dice "existe pero
//     venció" ni "no existe": desde afuera son indistinguibles, así que el link no sirve para
//     averiguar nada.
//   - Solo se puede escribir en el reclamo de ese token, y solo dos campos: fotos y relato.
//   - Tope de 6 fotos por reclamo (evita que alguien con el link llene el Blob).
//   - La respuesta se arma campo por campo: no se hace `select *` ni se filtra después. Lo que no
//     está en `VISIBLE_AL_CLIENTE` no viaja, aunque mañana alguien agregue una columna sensible.
//
// El token se busca en las dos bases (BDI y ZATTIA) porque el link no dice de qué marca es. Son
// dos consultas por índice; el token es único e inadivinable, así que no abre nada.
import { createClient } from '@supabase/supabase-js';
import { subirDataUrl } from './_blob.js';
// 🔴 Cuándo contesta el portal es UNA regla y vive en un solo lugar. Acá había una lista escrita a
// mano (`ABIERTO`) y en `botones.ts` había otra, con el comentario «tiene que ser el mismo
// conjunto» — y **ya habían dejado de coincidir**: la lista dejó de ofrecer el link de un cambio
// decidido y este archivo se quedó mirando sólo el estado (D16).
import { COLUMNAS_DEL_PORTAL, elLinkSigueVivo, nuevoToken, venceElLink } from '../lib/reclamos/portal.core.js';
import { altaBienFormada, API_ORDEN_VERIFICADA, esTiendaDelAlta, itemsDelAlta, motivoDeAlta, TOPE_ALTAS_POR_HORA } from '../lib/reclamos/alta-publica.core.js';
import { ESTADOS_ABIERTOS, pideFotosAlCliente } from '../lib/reclamos/casos.core.js';

const STORES = ['bdi', 'zattia'];
const MAX_FOTOS = 6;

function cfgFor(store) {
  if (store === 'zattia') {
    return { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY };
  }
  return { url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co', key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY };
}

/**
 * Las únicas columnas que se leen. Lo que no está acá no puede filtrarse por error.
 *
 * ⚠️ **⛔ No todo lo que se lee se muestra.** `COLUMNAS_DEL_PORTAL` trae lo que la regla del link
 * necesita —hoy `compensacion`—, y eso ⛔ **no viaja**: la respuesta la arma `paraElCliente` campo
 * por campo. Se lee **por la lista de la regla** y ⛔ no a mano, porque un `select` que se olvide
 * de una columna deja el freno mirando `undefined` — o sea dejando pasar justo lo que vino a
 * frenar. `tests/reclamo-publico.test.ts` ata las dos puntas.
 */
const VISIBLE_AL_CLIENTE = ['id', 'store', 'orden_tn', 'motivo', 'items', 'fotos', 'relato_cliente', 'token_vence']
  .concat(COLUMNAS_DEL_PORTAL).join(', ');

/** Busca el reclamo del token en las dos bases. Devuelve null si no existe, venció o ya cerró. */
async function buscarPorToken(token) {
  for (const store of STORES) {
    const cfg = cfgFor(store);
    if (!cfg.url || !cfg.key) continue;
    const supabase = createClient(cfg.url, cfg.key);
    const { data, error } = await supabase.from('devoluciones').select(VISIBLE_AL_CLIENTE).eq('token', token).maybeSingle();
    // El error se loguea aunque el cliente vea 404 igual. Sin esto, un problema de base (una
    // columna que no existe, credenciales vencidas) se ve EXACTAMENTE igual que un link inválido,
    // y nadie entiende por qué "el link no anda". Pasó: el select pedía una columna inexistente.
    if (error) console.error(`[reclamo] ${store}: ${error.message}`);
    if (!data) continue;
    if (data.token_vence && new Date(data.token_vence).getTime() < Date.now()) return null;
    // 🔴 Las DOS mitades, y la segunda faltaba: `borrador` significa también «cambio decidido
    // esperando el pago», así que mirar sólo el estado dejaba abierto a internet un reclamo ya
    // resuelto — y `accion: 'enviar'` lo devolvía a `en_revision` desde afuera.
    if (!elLinkSigueVivo(data)) return null;
    return { fila: data, supabase, store };
  }
  return null;
}

/**
 * Lo que se le muestra al cliente: su reclamo y nada más. Sin precios ni datos internos.
 *
 * Se exporta para poder testearla: es la última barrera antes de que algo salga a internet, y un
 * campo de más acá no rompe nada visible — simplemente se filtra. `tests/reclamo-publico.test.ts`
 * le pasa una fila con todo lo sensible adentro y verifica que no aparezca.
 */
export function paraElCliente(fila) {
  return {
    // El número se DERIVA del id (`R-0042`), no se guarda: es una forma de mostrarlo, no un dato.
    // Espejo de `numeroReclamo` en lib/reclamos/tipos.ts (acá no se puede importar TS): si cambia
    // uno hay que cambiar el otro, y este es el que ve el cliente.
    numero: 'R-' + String(fila.id ?? '').padStart(4, '0'),
    orden: fila.orden_tn,
    estado: fila.estado,
    // Solo qué productos son: ni precio, ni costo, ni ids de Gestión Nube.
    productos: (Array.isArray(fila.items) ? fila.items : []).map((i) => ({
      producto: i.producto,
      variante: i.variante ?? null,
      cantidad: i.cantidad,
    })),
    fotos: (Array.isArray(fila.fotos) ? fila.fotos : []).map((f) => f.url),
    relato: fila.relato_cliente || '',
    puedeSubir: (Array.isArray(fila.fotos) ? fila.fotos.length : 0) < MAX_FOTOS,
    /**
     * 🔴 **Si este caso tiene una foto que pedir.** ⛔ No es el motivo: el cliente ⛔ no tiene por
     * qué ver nuestra taxonomía, y publicar `motivo` acá le diría *«esto entró como demora»* sobre
     * una clasificación que todavía ⛔ no miró nadie.
     *
     * Va porque la pantalla lo necesita para **prender el botón de enviar**: hasta el 30-ago-2026
     * exigía una foto siempre, así que el reclamo de quien ⛔ no recibió el paquete ⛔ no se podía
     * enviar nunca. Ver `pideFotosAlCliente`.
     */
    pideFotos: pideFotosAlCliente(fila.motivo),
  };
}

// ── ALTA PÚBLICA ────────────────────────────────────────────────────────────────
//
// La URL de la orden de Tienda Nube vive en el núcleo (`API_ORDEN_VERIFICADA`) porque la leen las
// **dos puntas**: la pantalla del alta, para mostrarle el pedido a quien lo abre, y esto, que
// vuelve a girar la llave. Mismo valor que `lib/reclamos/cliente.ts` y `lib/canjes/cliente.ts`.

/**
 * Quién figura como autor de la fila. 🔑 Es lo que separa el alta pública de las internas **sin una
 * columna nueva**: el `usuario` ya existe y en las de adentro lleva el mail de quien la cargó.
 * También es por lo que cuenta el fusible.
 */
const USUARIO_DEL_ALTA = 'cliente';

/**
 * **La verificación corre en el SERVIDOR, y ⛔ no en el navegador.**
 *
 * 🔴 🔑 Éste es el punto en que esta puerta se rompe si se la escribe de la forma cómoda. Lo natural
 * es que el formulario llame a la verificación, muestre los productos, y después postee acá *«creá
 * el reclamo con estos productos»* — y ahí **la verificación ⛔ no sirvió para nada**: el segundo
 * POST lo puede escribir cualquiera con `curl`, sin haber pasado por el primero. La llave tiene que
 * volver a girar del lado de adentro, en el mismo pedido que crea la fila.
 *
 * ⇒ acá se manda **el mail** y se recibe **la orden verificada**, y de esa orden —⛔ no del body—
 * salen los productos. El mail viaja en el body del POST, ⛔ nunca en la query string.
 *
 * Devuelve `null` en todo lo que ⛔ no sea una orden verificada: no existe, no trae mail, no
 * coincide, o el otro repo se cayó. **Las cuatro se ven iguales desde afuera** — distinguirlas
 * convierte esto en un oráculo de «¿existe la orden N?» sobre una numeración correlativa.
 */
async function ordenVerificada(store, orden, mail) {
  try {
    const r = await fetch(`${API_ORDEN_VERIFICADA}?orden=${encodeURIComponent(orden)}&store=${encodeURIComponent(store)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mail }),
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return (d && d.ok && d.orden) || null;
  } catch (e) {
    // Se loguea aunque el cliente vea 404 igual: sin esto, el otro repo caído se ve EXACTAMENTE
    // igual que un mail equivocado, y nadie entiende por qué "el formulario no anda".
    console.error(`[alta] no se pudo verificar la orden ${orden}: ${String((e && e.message) || e)}`);
    return null;
  }
}

/**
 * **Los tres frenos**, en el orden en que salen más barato.
 *
 * 1. **Un reclamo abierto por orden.** Si ya hay uno, ⛔ no se crea otro: se devuelve **el token del
 *    que ya existe**. Es seguro porque quien pregunta ya probó el mail de esa orden, y es lo único
 *    que ⛔ no deja al cliente golpeando una puerta cerrada — que es como se termina abriendo el
 *    segundo reclamo por WhatsApp, o sea afuera del sistema.
 * 2. **El fusible por hora y por marca** (`TOPE_ALTAS_POR_HORA`). ⛔ No es un antiflood por persona
 *    —de eso ya se encargan la llave y el freno 1—: es para el día que algo se rompa de un modo que
 *    nadie previó. **Deja rastro en el log**, o es un freno que nadie va a mirar.
 * 3. Sin cruce, nada. Eso lo contesta `ordenVerificada` antes de llegar acá.
 *
 * ⚠️ Los dos leen `created_at`/`estado` de `devoluciones` y ⛔ no de una tabla nueva: el dato ya
 * está, y una tabla de intentos sería un lugar más donde guardar mails de gente.
 */
async function frenosDelAlta(supabase, store, orden) {
  const { data: abierto, error: e1 } = await supabase
    .from('devoluciones').select('token, estado')
    .eq('store', store).eq('orden_tn', String(orden)).in('estado', ESTADOS_ABIERTOS)
    .limit(1).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (abierto) return { corta: true, token: abierto.token || null, yaExistia: true };

  const desde = new Date(Date.now() - 3600000).toISOString();
  const { count, error: e2 } = await supabase
    .from('devoluciones').select('id', { count: 'exact', head: true })
    .eq('store', store).eq('usuario', USUARIO_DEL_ALTA).gte('created_at', desde);
  if (e2) throw new Error(e2.message);
  if ((count || 0) >= TOPE_ALTAS_POR_HORA) {
    console.error(`[alta] FUSIBLE: ${count} altas públicas en una hora en ${store}. Nadie reclama así: mirar qué pasó.`);
    return { corta: true, fundido: true };
  }
  return { corta: false };
}

/**
 * **El alta: cuatro toques y una fila en `borrador`.**
 *
 * ⚠️ **Contesta 404 pelado en TODO lo que no salga bien**, menos el fusible (429) y la forma del
 * pedido (400, que ⛔ no dice nada de ninguna orden). Un 404 en la puerta pública ⛔ no es
 * cortesía: es que las razones de un «no» ⛔ no se distingan desde afuera.
 *
 * 🔑 **Lo que se guarda ⛔ no viene del body**, y ésa es toda la seguridad de esto:
 *
 * | qué | de dónde sale |
 * |---|---|
 * | los productos | de la orden **verificada** de Tienda Nube, por índice |
 * | el nombre del cliente | de la orden verificada |
 * | el motivo | de `motivoDeAlta(opcion)`, ⛔ **nunca** de un `motivo` del body |
 * | el token | acuñado acá (`nuevoToken`) |
 *
 * ⛔ **Ni un solo monto**, ni acá ni en lo que contestó TN: el alta necesita saber qué compró, ⛔ no
 * cuánto pagó. La plata la carga Administración con la orden completa delante.
 */
async function alta(req, res) {
  const b = req.body || {};
  const forma = altaBienFormada(b);
  if (!forma.ok) {
    console.warn(`[alta] pedido mal formado: ${forma.motivo}`);
    return res.status(400).json({ error: 'Faltan datos para abrir el reclamo.' });
  }
  // ⚠️ Las tiendas del alta ⛔ no son `STORES`: ésas son **las dos bases** donde se busca un token,
  // y la lista de por dónde se puede ENTRAR es otra pregunta, con su propio motivo (ver
  // `TIENDAS_DEL_ALTA`). Hoy coinciden; el día que no, la que manda acá es la de la puerta.
  const store = String(b.store || '').trim();
  if (!esTiendaDelAlta(store)) return res.status(400).json({ error: 'Faltan datos para abrir el reclamo.' });

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) {
    console.error(`[alta] ${store} sin credenciales de base`);
    return res.status(500).json({ error: 'No pudimos abrir el reclamo. Escribinos y lo hacemos nosotros.' });
  }
  const supabase = createClient(cfg.url, cfg.key);
  const orden = String(b.orden).trim();

  // 🔴 La llave gira ACÁ, del lado del servidor, en el mismo pedido que crea la fila. Ver
  // `ordenVerificada`: hacerlo en el navegador es no hacerlo.
  const ordenTN = await ordenVerificada(store, orden, String(b.mail).trim());
  if (!ordenTN) return res.status(404).json({ error: 'No encontramos ese pedido con ese mail.' });

  const items = itemsDelAlta(ordenTN, b.productos);
  // Un índice que ⛔ no existe en la orden ⛔ no se saltea: se cae el alta entera. Crear el reclamo
  // con menos productos de los que la persona tocó es peor que no crearlo.
  if (!items) return res.status(404).json({ error: 'No encontramos ese pedido con ese mail.' });

  const freno = await frenosDelAlta(supabase, store, orden);
  if (freno.corta && freno.fundido) {
    return res.status(429).json({ error: 'Estamos recibiendo muchos reclamos justo ahora. Probá en un rato.' });
  }
  // Ya tenía uno abierto: se le devuelve **ese** link en vez de un segundo expediente por el mismo
  // pedido. Para el cliente es la misma pantalla; para nosotros, un solo caso.
  if (freno.corta) return res.status(200).json({ ok: true, token: freno.token, yaExistia: true });

  const motivo = motivoDeAlta(b.opcion);
  const ahora = new Date().toISOString();
  const { data, error } = await supabase.from('devoluciones').insert({
    store,
    orden_tn: orden,
    cliente: ordenTN.cliente || null,
    token: nuevoToken(),
    token_vence: venceElLink(),
    motivo,
    items,
    fotos: [],
    estado: 'borrador',
    // ⚠️ Los tres pendientes nacen en `'no_aplica'` **planos**, y ⛔ no derivados como en `crear`:
    // los dos motivos que nacen con algo prendido —`no_llego` (reclamo al transportista) y
    // `sin_stock` (corregir TN)— ⛔ **no pueden ser motivo de entrada**, y eso está atado por test
    // en `tests/reclamos-alta-publica.test.ts`. Si mañana una opción pública entrara por uno de
    // ellos, el test se pone rojo antes de que esta línea empiece a mentir.
    stock_estado: 'no_aplica',
    reintegro_estado: 'no_aplica',
    tn_stock_estado: 'no_aplica',
    reclamo_correo_estado: 'no_aplica',
    usuario: USUARIO_DEL_ALTA,
    historial: [{ estado: 'borrador', at: ahora, usuario: USUARIO_DEL_ALTA, nota: `el cliente abrió el reclamo desde el link (${b.opcion})` }],
  }).select('token').single();
  if (error) {
    console.error(`[alta] no se pudo crear el reclamo de la orden ${orden} en ${store}: ${error.message}`);
    return res.status(500).json({ error: 'No pudimos abrir el reclamo. Escribinos y lo hacemos nosotros.' });
  }
  return res.status(200).json({ ok: true, token: data?.token || null });
}

export default async function handler(req, res) {
  // Este endpoint NO usa `soloMismoOrigen`: lo abre el cliente desde su celular, con el link.
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // 🔴 El alta va ANTES de la puerta del token, y es la única acción que puede: todavía no hay
  // token que mostrar — crearlo es justamente lo que viene a hacer.
  if (req.method === 'POST' && (req.body || {}).accion === 'alta') return await alta(req, res);

  const token = String((req.method === 'POST' ? (req.body || {}).token : req.query.token) || '').trim();
  // Un token con forma inválida ni siquiera se consulta.
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return res.status(404).json({ error: 'no encontrado' });

  const hallazgo = await buscarPorToken(token);
  if (!hallazgo) return res.status(404).json({ error: 'no encontrado' });
  const { fila, supabase } = hallazgo;

  try {
    if (req.method === 'GET') return res.status(200).json({ ok: true, reclamo: paraElCliente(fila) });
    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const accion = String((req.body || {}).accion || '');
    const fotos = Array.isArray(fila.fotos) ? fila.fotos : [];

    if (accion === 'foto') {
      if (fotos.length >= MAX_FOTOS) return res.status(400).json({ error: `Ya subiste ${MAX_FOTOS} fotos, que es el máximo.` });
      const r = await subirDataUrl((req.body || {}).dataUrl, 'reclamos');
      if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
      const nuevas = fotos.concat([{ url: r.url, at: new Date().toISOString(), por: 'cliente' }]);
      const { error } = await supabase.from('devoluciones').update({ fotos: nuevas, updated_at: new Date().toISOString() }).eq('id', fila.id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, url: r.url, restantes: MAX_FOTOS - nuevas.length });
    }

    if (accion === 'enviar') {
      const relato = String((req.body || {}).relato || '').slice(0, 2000);
      const historial = [{ estado: 'en_revision', at: new Date().toISOString(), usuario: 'cliente', nota: 'cargó fotos y descripción' }];
      const { data: previo } = await supabase.from('devoluciones').select('historial').eq('id', fila.id).single();
      const { error } = await supabase.from('devoluciones').update({
        relato_cliente: relato || fila.relato_cliente,
        estado: 'en_revision',
        historial: (Array.isArray(previo?.historial) ? previo.historial : []).concat(historial),
        updated_at: new Date().toISOString(),
      }).eq('id', fila.id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'acción desconocida' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 200) });
  }
}
