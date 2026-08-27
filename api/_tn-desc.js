// La cola de redacción de descripciones de producto — tabla tn_descripciones
// (ver sql/migrate-tn-descripciones.sql).
//
//   GET  ?recurso=tn-desc&store=zattia                              → { ok, filas, atributos }
//   POST { recurso:'tn-desc', store, tn_id, nombre?, op:'insumo',   insumo }
//   POST { recurso:'tn-desc', store, tn_id, op:'atributos', familia, atributo, valor }
//   POST { recurso:'tn-desc', store, tn_id, op:'borrador', borrador:{parrafo,bullets} }
//   POST { recurso:'tn-desc', store, tn_id, op:'aprobar' }
//   POST { recurso:'tn-desc', store, tn_id, op:'publicar', conservarResiduo? }
//   POST { recurso:'tn-desc', store, tn_id, op:'quitar' }
//
// 🔑 Dos niveles de permiso, y la línea está donde está el costo: cargar el INSUMO ("gasa,
// botones nacarados") lo hace el local y sólo pide la sección; aprobar un borrador pide el
// sub `publicar`, porque de ahí en adelante el texto sale a la tienda en vivo.
//
// 🔴 `publicar` es el único verbo que sale a la tienda, y el ORDEN es el invariante: el
// respaldo (`html_previo`) se escribe y confirma ANTES de que TiendaNube se entere. Si el
// respaldo falla, no se escribe nada — TiendaNube no tiene historial, así que esa fila es la
// única copia que va a existir del texto anterior.
//
// El monitor no habla con TiendaNube: le pide a `bdi-catalogo` (que tiene el token) que lea
// fresco y que escriba con compare-and-swap. Va del lado del servidor y no del navegador para
// que cerrar la pestaña no pueda dejar la tienda escrita y la fila diciendo que no.
//
// Es un archivo `_`: NO es una ruta. Entra por api/datos.js (el plan Hobby de Vercel admite
// 12 funciones por deploy y cada archivo de ruta cuenta una).
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna, puedeSub, esAdmin } from '../lib/permisos.core.js';
import { generarHtml } from '../lib/tn-desc/formato.core.js';
import { componer, conservaLaTabla } from '../lib/tn-desc/bloques.core.js';
import { ATRIBUTOS, FAMILIAS, bulletsDe, esValor } from '../lib/tn-desc/atributos.core.js';

/** El único campo libre de la ficha. El tope es el mismo que tenía un bullet escrito a mano. */
const MAX_DETALLE = 60;

// El repo que tiene el token de TiendaNube. El monitor NUNCA habla con TiendaNube directo:
// las credenciales de la tienda viven de aquel lado y de uno solo.
const CATALOGO = process.env.CATALOGO_URL || 'https://bdi-catalogo.vercel.app/api/tn-categorias';

// `tn_descripciones` tiene RLS PRENDIDO: la clave pública no entra ni a leer ni a escribir.
// Acá pesa más que en ninguna otra tabla, porque adentro vive `html_previo` — la ÚNICA copia
// que existe de la descripción anterior, ya que TiendaNube no tiene historial. Con la pública
// las consultas no fallan: devuelven vacío, y eso se leería como "no hay respaldo". Se grita.
// Se mira **la clave, no el nombre de la variable** (en Vercel la de servicio puede estar
// cargada como `SUPABASE_KEY` a secas). Las keys de Supabase son JWT y traen el rol adentro.
function rolDe(key) {
  if (!key) return null;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8'));
    return payload.role || null;
  } catch {
    return null; // no es un JWT (formato nuevo sb_secret_/sb_publishable_): no se opina
  }
}

function cfgFor(store) {
  const key =
    store === 'zattia'
      ? process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY
      : process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const url =
    store === 'zattia'
      ? process.env.ZATTIA_SUPABASE_URL
      : process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co';
  return { url, key, esPublica: rolDe(key) === 'anon' };
}

const COLUMNAS =
  'tn_id, nombre, insumo, insumo_por, insumo_at, borrador, html_previo, hash_previo, html_escrito, verificado, estado, aprobado_por, aprobado_at, escrito_at, error, updated_at';

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const body = req.method === 'POST' ? req.body || {} : {};
  const store = String((req.method === 'POST' ? body.store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  if (!puedeVerAlguna(perfil, store, ['gen-desc'])) {
    return res.status(403).json({ error: 'No tenés acceso a Redacción en esta marca.' });
  }

  // 🔑 La firma sale de `perfil.name`, NO del body: si saliera del POST, el rastro de quién
  // aprobó un texto que salió a la tienda se podría firmar con el nombre de otro cambiando
  // un campo. Es el molde de `api/_canjes.js` y `api/_tn-fotos-verificadas.js`.
  const yo = perfil.name || null;
  const puedePublicar = esAdmin(perfil) || puedeSub(perfil, store, 'gen-desc', 'publicar');

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  if (cfg.esPublica) {
    const nombre = store === 'zattia' ? 'ZATTIA_SUPABASE_SERVICE_KEY' : 'SUPABASE_SERVICE_KEY';
    return res.status(500).json({
      ok: false,
      error: `En Vercel falta ${nombre} (la que hay es la clave pública). Esta tabla tiene RLS prendido y la pública no entra.`,
    });
  }
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('tn_descripciones').select(COLUMNAS).eq('store', store);
      if (error) throw new Error(error.message);

      // Los atributos viajan en la MISMA respuesta y no en un endpoint aparte: la pantalla los
      // necesita para dibujar cada fila (el contador «4/6») y para componer el bullet, así que
      // dos llamadas serían dos estados que se pueden desincronizar por medio segundo.
      const { data: attrs, error: eAttrs } = await supabase
        .from('tn_atributos')
        .select('tn_id, atributo, valor')
        .eq('store', store);
      if (eAttrs) throw new Error(eAttrs.message);
      const atributos = {};
      for (const a of attrs || []) {
        const id = String(a.tn_id);
        (atributos[id] || (atributos[id] = {}))[a.atributo] = a.valor;
      }

      return res.status(200).json({ ok: true, filas: data || [], atributos, puedePublicar });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no soportado' });

    const tnId = body.tn_id != null ? String(body.tn_id) : '';
    if (!tnId) return res.status(400).json({ error: 'falta tn_id' });
    const op = String(body.op || '');
    const ahora = new Date().toISOString();

    if (op === 'quitar') {
      if (!puedePublicar) return res.status(403).json({ error: 'Sacar una fila de la cola pide el permiso de aprobar.' });
      const { error } = await supabase.from('tn_descripciones').delete().eq('store', store).eq('tn_id', tnId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // El insumo lo carga el local: es la única op que NO pide `publicar`. Sin esto no hay
    // de dónde salga la tela, que es el dato que ni la foto ni Gestión Nube tienen.
    if (op === 'insumo') {
      const fila = {
        store,
        tn_id: tnId,
        nombre: body.nombre != null ? String(body.nombre) : null,
        insumo: String(body.insumo || '').trim() || null,
        insumo_por: yo,
        insumo_at: ahora,
        estado: String(body.insumo || '').trim() ? 'con-insumo' : 'sin-insumo',
        updated_at: ahora,
      };
      const { error } = await supabase.from('tn_descripciones').upsert(fila, { onConflict: 'store,tn_id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // La ficha de atributos la carga el local, igual que el insumo: elegir de una lista es
    // gratis y reversible, y es el dato del que sale el bullet. Tampoco pide `publicar`.
    //
    // Un atributo por llamada y no la ficha entera a propósito: son 6 desplegables y se guarda
    // al elegir cada uno. Un botón «Guardar» que junta los seis es un botón que alguien no
    // aprieta, y ahí se pierde la carga de un producto entero.
    if (op === 'atributos') {
      const familia = String(body.familia || '');
      const atributo = String(body.atributo || '');
      if (!FAMILIAS[familia]) return res.status(400).json({ error: `familia desconocida: ${familia}` });
      if (!ATRIBUTOS[atributo]) return res.status(400).json({ error: `atributo desconocido: ${atributo}` });

      const valor = String(body.valor == null ? '' : body.valor).trim();

      // Vacío = lo destildaron. Se borra la fila en vez de guardar '' — un valor vacío contaría
      // como cargado en el `4/6` y saldría en cualquier `group by` como una categoría más.
      if (!valor) {
        const { error } = await supabase
          .from('tn_atributos')
          .delete()
          .eq('store', store)
          .eq('tn_id', tnId)
          .eq('atributo', atributo);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, valor: null });
      }

      // 🔴 La lista cerrada la chequea el SERVIDOR, no el `<select>`. Un desplegable es una
      // comodidad del que carga; lo único que separa una lista cerrada de un campo de texto
      // —y con eso, un catálogo que se puede sumar de uno que no— es este `if`.
      if (!esValor(familia, atributo, valor)) {
        return res.status(400).json({ error: `«${valor}» no es un valor de ${atributo} para ${familia}` });
      }
      if (atributo === 'detalle' && valor.length > MAX_DETALLE) {
        return res.status(400).json({ error: `el detalle tiene ${valor.length} caracteres y el máximo es ${MAX_DETALLE}` });
      }

      const { error } = await supabase
        .from('tn_atributos')
        .upsert({ store, tn_id: tnId, atributo, valor, por: yo, at: ahora }, { onConflict: 'store,tn_id,atributo' });
      if (error) throw new Error(error.message);

      // 🔑 La familia se guarda en la cola en cada carga. El servidor no ve las categorías de
      // TiendaNube —las tiene el navegador, que ya bajó el catálogo— y sin esto el paso que
      // publica no sabría contra qué lista componer el bullet. `nombre` sólo si vino: pisarlo
      // con null dejaría la cola sin nombre para el que la abra después.
      const cola = { store, tn_id: tnId, familia, updated_at: ahora };
      if (body.nombre != null) cola.nombre = String(body.nombre);
      const { error: eCola } = await supabase.from('tn_descripciones').upsert(cola, { onConflict: 'store,tn_id' });
      if (eCola) throw new Error(eCola.message);

      return res.status(200).json({ ok: true, valor });
    }

    if (!puedePublicar) return res.status(403).json({ error: 'Esta acción pide el permiso de aprobar y publicar.' });

    if (op === 'borrador') {
      const b = body.borrador;
      // ⛔ Se valida la FORMA acá aunque la pantalla ya haya validado: el handler es la
      // frontera, y un borrador que no es un objeto con bullets rompería la pantalla del
      // que lo abra después, no la del que lo guardó.
      if (!b || typeof b !== 'object' || typeof b.parrafo !== 'string' || !Array.isArray(b.bullets)) {
        return res.status(400).json({ error: 'borrador inválido: se espera {parrafo, bullets:[{etiqueta,texto}]}' });
      }
      const fila = {
        store,
        tn_id: tnId,
        nombre: body.nombre != null ? String(body.nombre) : null,
        borrador: b,
        estado: 'borrador',
        // Un borrador nuevo desaprueba lo que hubiera: si no, quedaría aprobado un texto
        // que nadie leyó, con la firma de quien aprobó el anterior.
        aprobado_por: null,
        aprobado_at: null,
        updated_at: ahora,
      };
      const { error } = await supabase.from('tn_descripciones').upsert(fila, { onConflict: 'store,tn_id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (op === 'aprobar') {
      // ⛔ No se aprueba lo que no está: sin borrador guardado, aprobar sellaría una firma
      // sobre nada y la fila diría "listo para publicar" con el campo vacío.
      const { data, error: e1 } = await supabase
        .from('tn_descripciones')
        .select('borrador')
        .eq('store', store)
        .eq('tn_id', tnId)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!data || !data.borrador) return res.status(400).json({ error: 'no hay borrador guardado para aprobar' });
      const { error } = await supabase
        .from('tn_descripciones')
        .update({ estado: 'aprobado', aprobado_por: yo, aprobado_at: ahora, updated_at: ahora })
        .eq('store', store)
        .eq('tn_id', tnId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (op === 'publicar') {
      // Se conserva la prosa vieja sin marcar (y los `<img>` que vengan con ella) salvo que
      // quien revisa lo haya visto en pantalla y lo haya destildado. Sin default destructivo.
      const conservarResiduo = body.conservarResiduo !== false;
      const sobre = req.headers && req.headers['x-monitor-auth'];
      if (!sobre) return res.status(400).json({ error: 'Falta la credencial para hablar con el catálogo.' });

      // ⛔ Sólo sale a la tienda un borrador APROBADO. El HTML se arma acá, del borrador
      // guardado — no de lo que mande el navegador: lo que se aprobó es lo que se publica.
      const { data: fila, error: eFila } = await supabase
        .from('tn_descripciones')
        .select('borrador, estado, familia')
        .eq('store', store)
        .eq('tn_id', tnId)
        .maybeSingle();
      if (eFila) throw new Error(eFila.message);
      if (!fila || !fila.borrador) return res.status(400).json({ error: 'no hay borrador guardado' });
      if (fila.estado !== 'aprobado') {
        return res.status(400).json({ error: `sólo se publica un borrador aprobado (esta fila está en «${fila.estado}»)` });
      }

      // 🔑 Los bullets se componen ACÁ, desde la ficha guardada — no vienen del borrador ni del
      // navegador. Es la misma razón por la que el párrafo sale del borrador guardado: lo que se
      // publica tiene que ser lo que está en la base, y no lo que la pantalla creía tener.
      // La familia se guarda en la fila (`op:'atributos'`) porque el servidor no ve las
      // categorías de TiendaNube y sin ella no sabría qué lista mirar.
      const { data: attrs, error: eAttrs } = await supabase
        .from('tn_atributos')
        .select('atributo, valor')
        .eq('store', store)
        .eq('tn_id', tnId);
      if (eAttrs) throw new Error(eAttrs.message);
      const cargados = Object.fromEntries((attrs || []).map((a) => [a.atributo, a.valor]));
      const bullets = bulletsDe(fila.familia, cargados);

      // 1. Leer la descripción FRESCA de TiendaNube. No sale del audit, que está cacheado: lo
      //    que se lee acá es lo que se va a respaldar y lo que se va a comparar antes de pisar.
      const rLeer = await fetch(`${CATALOGO}?store=${store}&accion=descripcion&productId=${encodeURIComponent(tnId)}`, {
        headers: { 'x-monitor-auth': sobre },
      });
      const dLeer = await rLeer.json().catch(() => ({}));
      if (!rLeer.ok || !dLeer.ok) {
        return res.status(502).json({ error: dLeer.error || `No se pudo leer la descripción en TiendaNube (${rLeer.status})` });
      }
      const actual = typeof dLeer.html === 'string' ? dLeer.html : '';

      // 2. Componer. Una sola vez y en un lugar solo (`lib/tn-desc/bloques.core.js`).
      const nuevo = componer(actual, generarHtml({ parrafo: fila.borrador.parrafo, bullets }), { conservarResiduo });
      if (!conservaLaTabla(actual, nuevo)) {
        return res.status(500).json({ error: 'La composición se come la tabla de talles. No se escribió nada.' });
      }

      // 3. 🔴 EL RESPALDO VA PRIMERO, y tiene que CONFIRMAR. Si esto falla, se corta acá: sin
      //    respaldo, escribir en la tienda destruye el único ejemplar del texto anterior.
      const { error: eResp } = await supabase
        .from('tn_descripciones')
        .update({ html_previo: actual, hash_previo: dLeer.hash, estado: 'escribiendo', error: null, updated_at: ahora })
        .eq('store', store)
        .eq('tn_id', tnId);
      if (eResp) return res.status(500).json({ error: `No se pudo guardar el respaldo, así que no se escribió en la tienda: ${eResp.message}` });

      // 4. Recién ahora, la tienda. `hashPrevio` es lo que hace el compare-and-swap del otro
      //    lado: si alguien la tocó entre la lectura y esto, muere en 409 sin escribir.
      let rEsc, dEsc;
      try {
        rEsc = await fetch(CATALOGO + `?store=${store}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-monitor-auth': sobre },
          body: JSON.stringify({ accion: 'descripcion-prosa', productId: tnId, nuevo, hashPrevio: dLeer.hash }),
        });
        dEsc = await rEsc.json().catch(() => ({}));
      } catch (e) {
        dEsc = { error: e.message };
        rEsc = { ok: false, status: 0 };
      }

      // 5. Lo que pasó queda escrito, salga como salga. Una fila que no dice cuándo se
      //    escribió ni si se verificó es indistinguible de una que nunca se tocó.
      if (!rEsc.ok || !dEsc.ok) {
        const motivo = dEsc.error || `Error ${rEsc.status} al escribir en TiendaNube`;
        await supabase
          .from('tn_descripciones')
          .update({ estado: 'falla', error: motivo, updated_at: new Date().toISOString() })
          .eq('store', store)
          .eq('tn_id', tnId);
        // El 409 se pasa tal cual: significa «alguien la tocó, volvé a mirarla», y es lo único
        // que quien aprieta puede resolver (recargar y republicar). No es un error nuestro.
        return res.status(rEsc.status === 409 ? 409 : 502).json({ ok: false, error: motivo, hashActual: dEsc.hashActual || null });
      }

      const fin = new Date().toISOString();
      const { error: eFin } = await supabase
        .from('tn_descripciones')
        .update({
          html_escrito: typeof dEsc.escrito === 'string' ? dEsc.escrito : null,
          verificado: !!dEsc.verificado,
          estado: 'escrito',
          escrito_at: fin,
          error: dEsc.verificado ? null : 'El PUT dio 200 pero la relectura no coincide.',
          updated_at: fin,
        })
        .eq('store', store)
        .eq('tn_id', tnId);
      if (eFin) throw new Error(eFin.message);

      return res.status(200).json({ ok: true, verificado: !!dEsc.verificado, conservarResiduo });
    }

    return res.status(400).json({ error: `op desconocida: ${op || '(vacía)'}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
