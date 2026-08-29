// Calendario editorial — tablas `calendario_hitos`, `calendario_fechas_fijadas` y
// `calendario_decision` (ver sql/migrate-calendario.sql).
//
//   GET  ?recurso=calendario&store=bdi|zattia
//   POST { recurso:'calendario', store, hito:{...} }                       → alta / edición
//        🔑 y un hito `lanzamiento` que queda FIRME siembra sus once pendientes en la Agenda
//   POST { recurso:'calendario', store, id, action:'borrar' }
//   POST { recurso:'calendario', store, action:'fijar', clave, anio, fecha }
//   POST { recurso:'calendario', store, action:'desfijar', clave, anio }
//   POST { recurso:'calendario', store, action:'decidir', entradaId, prioridad, arrancar }
//   POST { recurso:'calendario', store, action:'indecidir', entradaId }
//
// Las fechas comerciales NO se guardan: se calculan en `lib/calendario/fechas.core.js`. Acá vive
// sólo lo que una persona decide y la máquina no puede saber sola — los hitos propios, la fecha
// real de una comercial anunciada (Hot Sale, CyberMonday, Día del Niño), que la define una cámara,
// y con cuánta fuerza el equipo elige jugar cada fecha.
//
// ⚠️ **Por qué no cuelga de api/meta-ads.js**: ese endpoint corta con 500 si falta o vence
// `META_ADS_TOKEN`, y el calendario no tiene nada que ver con Meta. Que se caiga junto con el token
// sería atarlo a una dependencia que no tiene.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12
// funciones por deploy y cada archivo de ruta cuenta una.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
// El 3º disparador de la Agenda. Decidir un lanzamiento prende trabajo en cuatro sectores, y sus
// renglones están escritos con dueña en el manual 08: acá es donde el lanzamiento tiene fecha.
import { sembrarEnMaestra } from './_agenda.js';
import { esAdmin, puedeVerAlguna } from '../lib/permisos.core.js';
import {
  CLAVES_COMERCIALES, CLAVES_PRIORIDAD, CLAVES_TIPO_HITO, normalizarHora, partirIdComercial,
} from '../lib/calendario/fechas.core.js';

function cfgFor(store) {
  if (store === 'zattia') {
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

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // Sin sub-permiso propio, y es deliberado: los subs NO se heredan de la función, así que ponerle
  // uno a "cargar un hito" garantizaría que nadie lo pueda usar hasta que alguien tildee a mano,
  // marca por marca, a todo el equipo. Es información interna de bajo riesgo — una fecha de
  // lanzamiento —, así que la carga cualquiera que ya vea la sección. Lo único reservado es borrar
  // un hito ajeno.
  //
  // 🔑 Va por `puedeVerAlguna` y no por `puedeVer` pelado, que es lo que había: `puedeVer` **no
  // aplica la cuenta fija**. Del lado del cliente da igual —quien está clavado a una marca no
  // puede cambiarla en el header, así que nunca pregunta por la otra—, pero acá la `store` la
  // elige el request, y con `puedeVer` alcanzaba con pedir `?store=bdi` desde una cuenta clavada
  // a Zattia para leer el calendario de BDI.
  if (!puedeVerAlguna(perfil, store, ['calendario'])) {
    return res.status(403).json({ error: 'No tenés acceso al calendario en esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  const yo = perfil.name || null;
  const ahora = new Date().toISOString();

  try {
    if (req.method === 'GET') {
      const [h, f, d] = await Promise.all([
        supabase.from('calendario_hitos').select('datos').eq('store', store).order('fecha', { ascending: true }),
        supabase.from('calendario_fechas_fijadas').select('clave, anio, fecha, por').eq('store', store),
        supabase.from('calendario_decision').select('entrada_id, prioridad, arrancar, por').eq('store', store),
      ]);
      if (h.error) throw new Error(h.error.message);
      if (f.error) throw new Error(f.error.message);
      // Las decisiones NO tumban el calendario si la tabla todavía no está migrada en esta marca:
      // se pierde la prioridad y el resto sigue sirviendo. Es el mismo criterio que usa la pantalla
      // con las ideas — una migración pendiente en una de las dos bases no puede dejar sin fechas a
      // la marca que sí está al día.
      return res.status(200).json({
        ok: true,
        hitos: (h.data || []).map((r) => r.datos),
        fijadas: f.data || [],
        decisiones: d.error ? [] : (d.data || []).map((r) => ({
          entradaId: r.entrada_id,
          prioridad: r.prioridad,
          arrancar: r.arrancar,
          por: r.por,
        })),
        puede: { admin: esAdmin(perfil) },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
    const b = req.body || {};

    // ── Confirmar (o soltar) la fecha real de una comercial anunciada. ─────────────────────────
    if (b.action === 'fijar' || b.action === 'desfijar') {
      const clave = String(b.clave || '');
      const anio = Number(b.anio);
      // Se valida contra el catálogo a propósito: una clave inventada guardaría una fila que
      // después no se muestra en ningún lado y nadie entendería por qué la confirmación no tomó.
      if (!CLAVES_COMERCIALES.includes(clave)) return res.status(400).json({ error: `"${clave}" no es una fecha comercial conocida.` });
      if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return res.status(400).json({ error: 'año inválido' });

      if (b.action === 'desfijar') {
        const { error } = await supabase.from('calendario_fechas_fijadas')
          .delete().eq('store', store).eq('clave', clave).eq('anio', anio);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      const fecha = String(b.fecha || '');
      if (!ES_FECHA.test(fecha)) return res.status(400).json({ error: 'la fecha va como YYYY-MM-DD' });
      if (Number(fecha.slice(0, 4)) !== anio) return res.status(400).json({ error: 'la fecha no cae en el año que se está confirmando' });

      const { error } = await supabase.from('calendario_fechas_fijadas')
        .upsert([{ store, clave, anio, fecha, por: yo, updated_at: ahora }], { onConflict: 'store,clave,anio' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Con cuánta fuerza jugamos una fecha. ───────────────────────────────────────────────────
    //
    // Es la decisión que el catálogo no puede tomar solo: si nos sumamos al Día del Niño depende
    // del stock y de las manos que haya esa semana, no del almanaque. `indecidir` borra la fila y
    // la fecha vuelve a "sin decidir", que es un estado real y no un `pasamos` disfrazado — el
    // equipo tiene que poder decir "me equivoqué, esto lo volvemos a hablar".
    if (b.action === 'decidir' || b.action === 'indecidir') {
      const entradaId = String(b.entradaId || '');
      // Se valida contra el catálogo: un id inventado guardaría una fila que no se muestra en
      // ningún lado y nadie entendería por qué la decisión no tomó.
      if (!partirIdComercial(entradaId)) {
        return res.status(400).json({ error: `"${entradaId}" no es una fecha comercial conocida.` });
      }

      if (b.action === 'indecidir') {
        const { error } = await supabase.from('calendario_decision')
          .delete().eq('store', store).eq('entrada_id', entradaId);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      const prioridad = String(b.prioridad || '');
      if (!CLAVES_PRIORIDAD.includes(prioridad)) {
        return res.status(400).json({ error: `prioridad inválida (usá ${CLAVES_PRIORIDAD.join(', ')})` });
      }
      // `arrancar` es opcional: una fecha que dejamos pasar no tiene nada que producir, y una que
      // jugamos puede quedar marcada antes de que alguien resuelva desde cuándo.
      const arrancar = b.arrancar ? String(b.arrancar) : null;
      if (arrancar && !ES_FECHA.test(arrancar)) return res.status(400).json({ error: 'el arranque va como YYYY-MM-DD' });

      const { error } = await supabase.from('calendario_decision').upsert(
        [{ store, entrada_id: entradaId, prioridad, arrancar, por: yo, updated_at: ahora }],
        { onConflict: 'store,entrada_id' },
      );
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Hitos propios. ─────────────────────────────────────────────────────────────────────────
    // ⚠️ El verbo acepta además el nombre viejo (`borrar`). **No es indecisión: es que una pestaña
    // abierta manda el verbo del bundle que bajó**, y el día del deploy los dos conviven.
    if (b.action === 'eliminar' || b.action === 'borrar') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const { data, error: e0 } = await supabase.from('calendario_hitos')
        .select('creado_por').eq('store', store).eq('id', id).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!data) return res.status(200).json({ ok: true });
      if (!esAdmin(perfil) && String(data.creado_por || '') !== String(yo || '')) {
        return res.status(403).json({ error: 'Ese hito lo cargó otra persona: pedile a un admin que lo borre.' });
      }
      const { error } = await supabase.from('calendario_hitos').delete().eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    const entrada = b.hito;
    if (!entrada || !entrada.id) return res.status(400).json({ error: 'falta el hito (o no tiene id)' });
    const titulo = String(entrada.titulo || '').trim();
    if (!titulo) return res.status(400).json({ error: 'el hito necesita un título' });
    if (!ES_FECHA.test(String(entrada.fecha || ''))) return res.status(400).json({ error: 'la fecha va como YYYY-MM-DD' });
    const tipo = String(entrada.tipo || 'otro');
    if (!CLAVES_TIPO_HITO.includes(tipo)) return res.status(400).json({ error: `tipo inválido (usá ${CLAVES_TIPO_HITO.join(', ')})` });
    // La hora es opcional: vacía es "ese día", no medianoche. Una escrita mal se rechaza en vez de
    // guardarse en null — el hito se guardaría igual y nadie entendería por qué la hora no quedó.
    const hora = normalizarHora(entrada.hora);
    if (entrada.hora && !hora) return res.status(400).json({ error: 'la hora va como HH:MM' });

    const { data: previo, error: e1 } = await supabase.from('calendario_hitos')
      .select('datos, creado_por').eq('store', store).eq('id', String(entrada.id)).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (previo && !esAdmin(perfil) && String(previo.creado_por || '') !== String(yo || '')) {
      return res.status(403).json({ error: 'Ese hito lo cargó otra persona: pedile a ella (o a un admin) que lo cambie.' });
    }

    const hito = {
      ...(previo?.datos || {}),
      ...entrada,
      id: String(entrada.id),
      titulo,
      tipo,
      hora,
      // `firme: false` es una fecha proyectada, que se puede mover sin borrar nada. Es el default de
      // la nada porque una fecha que alguien tipeó sin marcarla firme casi nunca lo es.
      firme: entrada.firme === true,
      nota: entrada.nota ? String(entrada.nota) : null,
      creado: previo?.datos?.creado || Date.now(),
      creadoPor: previo?.creado_por || yo,
    };

    const { error } = await supabase.from('calendario_hitos').upsert([{
      id: hito.id,
      store,
      fecha: hito.fecha,
      firme: hito.firme,
      titulo: hito.titulo,
      tipo: hito.tipo,
      nota: hito.nota,
      creado_por: hito.creadoPor,
      datos: hito,
      updated_at: ahora,
    }], { onConflict: 'store,id' });
    if (error) throw new Error(error.message);

    /*
      🔑 **EL 3º DISPARADOR: un lanzamiento que queda FIRME siembra sus once renglones.**

      El manual 08 dice que la lista *«se abre al decidir el lanzamiento, no el día antes»*, y el
      objeto que dice eso ya existía: un **hito propio de tipo `lanzamiento`**, con su fecha
      objetivo. ⛔ No hizo falta inventar un botón — el dato ya lo sabía el código y lo estaba
      tirando.

      🔴 **El hecho es «quedó FIRME», ⛔ no «se creó», y ésa es la diferencia que importa acá.**
      `firme: false` es una fecha **proyectada, que se puede mover**: colgar once pendientes de una
      fecha que todavía se mueve es sembrar once fechas equivocadas. Y como el hecho es un ESTADO y
      no un alta, esto anda igual en los dos caminos —nace firme, o alguien lo marca firme después—
      sin preguntar si el hito existía: **la idempotencia por clave hace las dos cosas**.

      🔴 **Sembrar ⛔ no puede voltear el guardado.** El hito es el dato; los pendientes son la
      consecuencia. Si no hay moldes cargados, el hito igual quedó guardado y el error se cuenta.
    */
    const sembrado = hito.tipo === 'lanzamiento' && hito.firme
      ? await sembrarEnMaestra({
        plantilla: 'lanzamiento',
        // El agrupador del título de cada clon: cómo llamó al lanzamiento quien lo cargó.
        nombre: hito.titulo,
        // 🔑 La fecha OBJETIVO, que es de lo que cuelgan los once. El reloj del ingreso es otro —la
        // fecha en que llegó el camión— y por eso son dos disparadores y no uno.
        fecha: hito.fecha,
        autor: yo,
        // El calendario sólo acepta las dos marcas de la Agenda: acá ⛔ no hay línea que traducir.
        marca: store,
        // 🔑 La clave es el ID del hito: la fecha objetivo **se mueve** hasta que queda firme, y con
        // la fecha adentro un lanzamiento movido sembraría los once otra vez.
        clave: `lanzamiento·${hito.id}`,
      })
      : null;

    /*
      ⚠️ **La fecha vencida la contesta el NÚCLEO, ⛔ no este handler.** Hasta el 29-ago-2026 la
      pregunta «¿ya pasó?» estaba escrita acá, y el 4º disparador —el cambio de condición comercial,
      que entra por otro handler— necesitaba la misma. Dos copias de la misma regla es la forma más
      barata de que mañana digan cosas distintas, así que vive en `plantillas.core.js` y se le pasa
      el hecho igual: `sembrar` devuelve el error que dice que ya pasó.

      ⚠️ **Y ese error se cuenta, ⛔ no se calla**: quien acaba de guardar un lanzamiento firme
      espera que le caiga el trabajo, y el silencio se lee como que cayó.
    */
    return res.status(200).json({ ok: true, hito, ...(sembrado ? { sembrado } : {}) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
