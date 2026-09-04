// Cajón único de solicitudes — tabla `solicitudes` (ver sql/migrate-solicitudes.sql).
//
// Reemplaza a las dos claves del KV de bdi-catalogo (`sesionfotos:<marca>` /
// `solicitudesinternas:<marca>`), donde el historial entero era un solo JSON que se
// reescribía completo en cada guardado. Acá cada solicitud es una fila y se escribe sola.
//
//   GET  ?store=bdi|zattia|stunned[&kind=sesionfotos|solicitudesinternas][&limit=]  → lista.
//   POST { store, solicitud }        → upsert de UNA solicitud (por store+id).
//   POST { store, action:'borrar', id } → la borra.
//
// `stunned` es una LÍNEA, no una marca (ver docs/lineas.md): sus filas viven en la MISMA tabla de
// la base de Zattia, separadas por la columna `store`, que ya es parte de la clave (`store,id`).
// Quién decide a qué base va es `baseDeLinea`, el helper del núcleo — acá no se escribe la regla.
//
// El documento completo va en `datos`; las columnas de al lado se derivan de él para poder
// filtrar. La fuente de verdad es SIEMPRE `datos`: si mañana el motor agrega un campo, viaja
// solo, sin migración de esquema.
//
// Mismo molde que api/fallas.js y api/sku-map.js: service key (se saltea RLS) y exige usuario
// logueado del Monitor.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { baseDeLinea } from '../lib/lineas.core.js';
// El 2º disparador de la Agenda. Armar una sesión de fotos es un hecho que prende trabajo en tres
// sectores, y sus nueve pasos están escritos con dueña en el manual 05: acá es donde ocurre el hecho.
import { sembrarEnMaestra } from './_agenda.js';
import { esDisparador } from '../lib/solicitudes/disparador.core.js';

function cfgFor(store) {
  // Stunned comparte la base de Zattia: la traducción la hace el núcleo, no un `||` acá.
  if (baseDeLinea(store) === 'zattia') {
    return {
      url: process.env.ZATTIA_SUPABASE_URL,
      key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
    };
  }
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

// 🔑 `sesion-evento` es la sesión de fotos como PADRE (4-sep-2026): mismo cajón, `kind` distinto.
// Sumarlo es esta línea y nada más — la tabla ⛔ no tiene CHECK sobre `kind` (`sql/migrate-solicitudes.sql`).
// 🔴 Y ⛔ NO siembra en la Agenda: la siembra de más abajo exige `kind === 'sesionfotos'`, así que un
// evento ⛔ no entra ahí ni por accidente. Que las tareas salgan del evento es la Fase 5, y hacerlo
// ahora sembraría los nueve pasos una vez por el evento y otra por cada hija.
const KINDS = ['sesionfotos', 'solicitudesinternas', 'sesion-evento'];

/**
 * 🔴 Los kinds que son una SOLICITUD de verdad — los que el GET devuelve cuando ⛔ no le pasan
 * `kind`.
 *
 * El GET siempre aceptó omitirlo y significaba «todo el historial de la marca». Al sumar
 * `sesion-evento` eso pasó a incluir **eventos**, que ⛔ no tienen `items`: cualquier lector que
 * los recibiera como solicitudes se rompería en el primer `s.items.length`. Hoy ⛔ ningún llamador
 * lo omite (todos pasan por `leerTabla`, que siempre manda el kind), y **por eso se arregla ahora**:
 * un `else` de una línea deja el significado viejo intacto en vez de dejar el arma cargada.
 */
const KINDS_SOLICITUD = ['sesionfotos', 'solicitudesinternas'];

/**
 * Fila a partir del documento. Las columnas son proyecciones para filtrar; el documento
 * manda. `destino` sale de `tipo` (así lo llama el motor) y por defecto es retornable:
 * las de sesión de fotos históricas no tienen el campo y todas volvían.
 */
function filaDe(store, kind, s) {
  return {
    id: String(s.id),
    store,
    kind,
    motivo: s.motivo ? String(s.motivo) : null,
    destino: s.tipo === 'consumo' ? 'consumo' : 'retornable',
    estado: String(s.estado || 'pendiente'),
    creado: Number(s.creado) || null,
    creado_por: s.creadoPor ? String(s.creadoPor) : null,
    fecha: s.fecha ? String(s.fecha) : null,
    datos: s,
    updated_at: new Date().toISOString(),
  };
}

/**
 * De las que vienen a guardar, cuáles **todavía no existen**. Una sola consulta.
 *
 * ⚠️ Ante un error de lectura devuelve el conjunto **vacío**, ⛔ no todas: no poder saber si la
 * sesión ya existía no puede significar «entonces es nueva». Sembrar de más le pone pendientes
 * repetidos a tres personas; sembrar de menos deja el caso que ya cubre el próximo guardado.
 */
async function idsNuevos(supabase, store, solicitudes) {
  const ids = solicitudes.map((s) => String(s.id));
  if (!ids.length) return new Set();
  const { data, error } = await supabase.from('solicitudes').select('id').eq('store', store).in('id', ids);
  if (error) return new Set();
  const existen = new Set((data || []).map((r) => String(r.id)));
  return new Set(ids.filter((id) => !existen.has(id)));
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  // 🔴 La lista literal que había acá era la que dejaba a Stunned sin sesión de fotos. `baseDeLinea`
  // acepta las tres líneas y devuelve `null` ante cualquier otra cosa — nunca una marca por descarte.
  if (!baseDeLinea(store)) return res.status(400).json({ error: 'store inválido (usá bdi, zattia o stunned)' });

  // 🔴 Hasta el 13-ago-2026 el control terminaba en `exigirUsuario`: cualquier cuenta válida del
  // Monitor —los puestos compartidos incluidos— leía el historial de solicitudes de las dos marcas y podía borrarlas.
  if (!puedeVerAlguna(perfil, store, ['solicitudes'])) {
    return res.status(403).json({ error: 'No tenés acceso a Solicitudes en esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const kind = req.query.kind ? String(req.query.kind) : null;
      if (kind && !KINDS.includes(kind)) return res.status(400).json({ error: 'kind inválido' });
      // Alto a propósito: la pantalla trabaja con el historial completo de la marca (igual
      // que cuando venía del KV). Si algún día molesta, se pagina por `creado`.
      const limit = Math.min(parseInt(req.query.limit, 10) || 2000, 5000);
      let q = supabase.from('solicitudes').select('datos').eq('store', store);
      if (kind) q = q.eq('kind', kind);
      // Sin `kind` se devuelven **sólo las solicitudes**, que es lo que ese llamado quiso decir
      // siempre: un evento ⛔ no es una solicitud y ⛔ no tiene `items`. Ver `KINDS_SOLICITUD`.
      else q = q.in('kind', KINDS_SOLICITUD);
      const { data, error } = await q.order('creado', { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, list: (data || []).map((r) => r.datos) });
    }

    if (req.method === 'POST') {
      const b = req.body || {};

      // ⚠️ El verbo acepta además el nombre viejo (`borrar`). **No es indecisión: es que una pestaña
      // abierta manda el verbo del bundle que bajó**, y el día del deploy los dos conviven.
      if (b.action === 'eliminar' || b.action === 'borrar') {
        const id = String(b.id || '');
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { error } = await supabase.from('solicitudes').delete().eq('store', store).eq('id', id);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      const kind = String(b.kind || '');
      if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind inválido' });

      // Acepta una o varias: el guardado normal manda una, la migración manda un lote.
      const entrada = Array.isArray(b.solicitudes) ? b.solicitudes : b.solicitud ? [b.solicitud] : [];
      const validas = entrada.filter((s) => s && s.id);
      if (!validas.length) return res.status(400).json({ error: 'falta la solicitud (o no tiene id)' });

      /*
        🔑 **Qué sesiones son NUEVAS se pregunta ANTES de escribir**, porque después de la upsert ya
        no se puede: la tabla no distingue «se creó» de «se guardó otra vez». Y el hecho que dispara
        los nueve pasos es **crear** la sesión, no editarla — sembrar en cada guardado le tiraría los
        pendientes encima a alguien que sólo agregó una prenda.

        ⚠️ Una sola consulta para todas, y sólo cuando puede haber algo que sembrar.
      */
      // 🔴 **Sólo el guardado de a UNA siembra.** El lote es la migración del KV, y ahí «no existe
      // todavía en la tabla» es verdad de TODAS las sesiones históricas: sembraría los nueve pasos
      // de cada sesión de dos años atrás, todos arrastrando, encima de tres personas.
      const unaSola = kind === 'sesionfotos' && !Array.isArray(b.solicitudes) && validas.length === 1;
      const nuevas = unaSola ? await idsNuevos(supabase, store, validas) : new Set();

      const { error } = await supabase
        .from('solicitudes')
        .upsert(validas.map((s) => filaDe(store, kind, s)), { onConflict: 'store,id' });
      if (error) throw new Error(error.message);

      /*
        🔴 **Va DESPUÉS del guardado y no puede voltearlo.** La sesión es el dato; los pendientes son
        una consecuencia. Si sembrar falla —no hay moldes cargados, la base no contesta—, la sesión
        ya está guardada y lo que se pierde es el aviso, que se cuenta en la respuesta.

        ⛔ **Sin origen no se siembra**, y es la misma regla que la puerta del ingreso: de quién es la
        sesión lo decide de dónde viene (faltante → Cande, campaña e ingreso → Sofi), así que sembrar
        «igual» dejaría nueve renglones con la dueña equivocada. El borrador **pregunta** el origen y
        puede quedar vacío a propósito (el botón de Marketing sirve para las dos cosas): cuando queda
        vacío, esto no inventa una dueña.
      */
      const sembrado = [];
      for (const s of validas) {
        if (!nuevas.has(String(s.id))) continue;
        if (!esDisparador(s.disparador)) continue;
        const r = await sembrarEnMaestra({
          plantilla: 'sesion-fotos',
          // El agrupador del título de cada clon. La descripción es lo que la persona escribió para
          // reconocer la sesión; sin ella, la fecha alcanza para no confundir dos del mismo mes.
          nombre: String(s.descripcion || '').trim() || `Sesión ${s.fecha || ''}`.trim(),
          fecha: s.fecha,
          autor: perfil.name || 'Sesión de fotos',
          eje: s.disparador,
          // 🔴 **Stunned no es una marca: es una línea de Zattia**, y la Agenda tiene dos marcas. La
          // traducción la hace el núcleo, igual que para elegir la base — ⛔ no un `||` acá.
          marca: baseDeLinea(store),
          // 🔑 La clave es el **id de la sesión**, ⛔ no `fecha·nombre`: la fecha de una sesión se
          // edita, y con la fecha adentro moverla un día sembraría los nueve otra vez.
          clave: `sesion-fotos·${s.id}`,
        });
        sembrado.push({ id: String(s.id), ...r });
      }

      return res.status(200).json({ ok: true, guardadas: validas.length, ...(sembrado.length ? { sembrado } : {}) });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
