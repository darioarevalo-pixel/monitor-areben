// El depósito de informes del analista de pauta: el diagnóstico en prosa, guardado y leíble.
//
//   GET  /api/meta-ads?recurso=informes[&linea=…]  → la lista, SIN el html
//   GET  /api/meta-ads?recurso=informe&id=<n>      → uno, con el html
//   POST /api/meta-ads?recurso=informe  { accion: 'guardar' | 'publicar' | 'borrar', … }
//
// ⚠️ Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby.
//
// # Por qué existe esta pantalla, y por qué NO genera nada
//
// El analista de pauta vivía en una carpeta de un solo disco. Sus números ya estaban en el monitor
// (`meta_ads_snapshot_dia`) y sus decisiones también (`meta_ads_decision`); lo único que no tenía
// dónde vivir era el informe en prosa, que es justamente la parte que no se puede derivar.
//
// 🔑 **Guardar el diagnóstico no es automatizarlo.** Acá no hay una sola métrica calculada: llega un
// HTML hecho y se guarda. El día que este archivo empiece a *armar* un informe, dejó de ser un
// depósito y es un dashboard más de los que nadie abre — que es exactamente lo que se descartó.
//
// # Los GET van ANTES del guard del token
//
// Salen de la base y no hablan con Meta, igual que las reglas, los planes y el registro. Y es más
// cierto acá que en ningún lado: el día que el token se venza, lo primero que alguien quiere abrir
// es el último informe para entender qué estaba pasando.
import { lineasQuePuede, lineasQueVe } from '../lib/meta-ads/acciones.core.js';
import {
  aVistaInforme, avisosDelHtml, COLS_INFORME, COLS_LISTA, TABLA_INFORME, validarInforme,
} from '../lib/meta-ads/informes.core.js';
import { clienteBdi } from './_meta-lineas.js';

const quienEs = (perfil) => (perfil && perfil.name) || 'desconocido';

/**
 * Subir, corregir, publicar o borrar un informe pide `pautar`, el mismo permiso que las
 * automatizaciones y por el mismo motivo: es «decidir cómo se pautea», no ejecutar una acción sobre
 * Meta. Leerlos alcanza con ver la sección.
 */
function puedePautar(perfil, linea) {
  if (!linea) return { ok: false, status: 400, error: 'Falta la marca.' };
  if (lineasQuePuede(perfil, 'pautar').includes(linea)) return { ok: true };
  return { ok: false, status: 403, error: 'Para tocar los informes hace falta el permiso «Puede aprobar ideas y corregir la etapa de una campaña» (meta-ads.pautar) en esa marca.' };
}

export async function informesGet(res, perfil, q) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const visibles = lineasQueVe(perfil);
  if (!visibles.length) return res.status(403).json({ error: 'No tenés acceso a la pauta de ninguna marca.' });

  // 🔑 **Quien no puede publicar tampoco ve los borradores.** Un informe a medio revisar leído como
  // definitivo es peor que no tenerlo: el analista se equivoca a propósito en voz alta mientras
  // escribe. El corte va acá y no en la pantalla porque una pantalla que filtra sobre datos que ya
  // viajaron no filtra nada.
  const puedeVerBorradores = visibles.filter((l) => lineasQuePuede(perfil, 'pautar').includes(l));

  if (q.recurso === 'informe') {
    const id = Number(q.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Falta el id del informe.' });
    const { data, error } = await sb.from(TABLA_INFORME).select(COLS_INFORME).eq('id', id).maybeSingle();
    if (error) return res.status(502).json({ error: 'No se pudo leer el informe.', detalle: error.message });
    if (!data || !visibles.includes(data.linea)) return res.status(404).json({ error: 'Ese informe no existe.' });
    if (!data.publicado && !puedeVerBorradores.includes(data.linea)) {
      return res.status(404).json({ error: 'Ese informe no existe.' });
    }
    return res.status(200).json({ ok: true, informe: aVistaInforme(data) });
  }

  let sel = sb.from(TABLA_INFORME).select(COLS_LISTA).in('linea', visibles).order('fecha', { ascending: false });
  if (q.linea) sel = sel.eq('linea', String(q.linea).toLowerCase());
  const { data, error } = await sel;
  if (error) return res.status(502).json({ error: 'No se pudieron leer los informes.', detalle: error.message });

  const filas = (data || []).filter((f) => f.publicado || puedeVerBorradores.includes(f.linea));
  // `puedeEditar` viaja con la respuesta, como en las decisiones: la pantalla no puede deducir el
  // permiso, y un botón que existe y contesta 403 es peor que uno que no está — el 403 no dice que
  // el problema son los permisos.
  return res.status(200).json({ ok: true, informes: filas.map(aVistaInforme), puedeEditar: puedeVerBorradores });
}

export default async function informesPost(req, res, perfil) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const body = req.body || {};
  const accion = String(body.accion || '');

  if (accion === 'guardar') return await guardar(res, sb, perfil, body);
  if (accion === 'publicar') return await publicar(res, sb, perfil, body);
  if (accion === 'borrar') return await borrar(res, sb, perfil, body);
  return res.status(400).json({ error: `Acción desconocida: «${accion}».` });
}

/**
 * Sube un informe nuevo, o corrige el de esa fecha.
 *
 * ⚠️ **Pisar es explícito.** La clave es `(fecha, linea)` porque la convención del analista es uno
 * por fecha y el anterior no se toca: la gracia del historial es leer qué se pensaba en agosto con
 * lo que se sabía en agosto. Sin `pisar: true`, subir dos veces la misma fecha contesta 409 con el
 * título del que ya está, en vez de reemplazarlo en silencio.
 */
async function guardar(res, sb, perfil, body) {
  const visibles = lineasQueVe(perfil);
  const v = validarInforme(body, { lineasValidas: visibles.length ? visibles : ['bdi', 'zattia', 'stunned'] });
  if (!v.ok) return res.status(400).json({ error: v.error });

  const permiso = puedePautar(perfil, v.informe.linea);
  if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.error });

  const previo = await sb
    .from(TABLA_INFORME).select('id, titulo, publicado').eq('fecha', v.informe.fecha).eq('linea', v.informe.linea).maybeSingle();
  if (previo.error) return res.status(502).json({ error: 'No se pudo mirar si ya había uno.', detalle: previo.error.message });

  if (previo.data && !body.pisar) {
    return res.status(409).json({
      error: `Ya hay un informe de ${v.informe.linea} del ${v.informe.fecha}: «${previo.data.titulo}». Para reemplazarlo hay que pedirlo con «pisar».`,
    });
  }

  // 🔑 **Corregir un informe NO lo publica ni lo despublica.** Publicar es un acto aparte y con su
  // propio botón: si el guardado arrastrara el estado, una corrección de una coma en un borrador lo
  // mandaría al equipo, o —peor— una corrección de un publicado lo sacaría de circulación sin que
  // nadie lo pida.
  const fila = { ...v.informe, quien: quienEs(perfil), actualizada: new Date().toISOString() };

  const escrito = previo.data
    ? await sb.from(TABLA_INFORME).update(fila).eq('id', previo.data.id).select(COLS_LISTA).maybeSingle()
    : await sb.from(TABLA_INFORME).insert(fila).select(COLS_LISTA).maybeSingle();
  if (escrito.error) return res.status(502).json({ error: 'No se pudo guardar el informe.', detalle: escrito.error.message });

  return res.status(200).json({
    ok: true,
    informe: aVistaInforme(escrito.data),
    reemplazo: !!previo.data,
    // Los avisos no frenan nada: se escriben para que quien sube sepa cómo se va a ver.
    avisos: avisosDelHtml(v.informe.html),
  });
}

/** Publica o vuelve a borrador. `publicado: false` explícito es lo que lo saca de circulación. */
async function publicar(res, sb, perfil, body) {
  const id = Number(body.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Falta el id del informe.' });

  const previo = await sb.from(TABLA_INFORME).select('id, linea, publicado').eq('id', id).maybeSingle();
  if (previo.error) return res.status(502).json({ error: 'No se pudo leer el informe.', detalle: previo.error.message });
  if (!previo.data) return res.status(404).json({ error: 'Ese informe no existe.' });

  const permiso = puedePautar(perfil, previo.data.linea);
  if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.error });

  const publicado = body.publicado !== false;
  const { data, error } = await sb
    .from(TABLA_INFORME)
    .update({ publicado, publicado_at: publicado ? new Date().toISOString() : null, actualizada: new Date().toISOString() })
    .eq('id', id)
    .select(COLS_LISTA)
    .maybeSingle();
  if (error) return res.status(502).json({ error: 'No se pudo cambiar el estado.', detalle: error.message });
  return res.status(200).json({ ok: true, informe: aVistaInforme(data) });
}

/**
 * Borra un informe. Existe para el caso de haber subido cualquier cosa por error, no para limpiar
 * el historial: un informe viejo que ya no se comparte se despublica, no se borra.
 */
async function borrar(res, sb, perfil, body) {
  const id = Number(body.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Falta el id del informe.' });

  const previo = await sb.from(TABLA_INFORME).select('id, linea').eq('id', id).maybeSingle();
  if (previo.error) return res.status(502).json({ error: 'No se pudo leer el informe.', detalle: previo.error.message });
  if (!previo.data) return res.status(404).json({ error: 'Ese informe no existe.' });

  const permiso = puedePautar(perfil, previo.data.linea);
  if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.error });

  const { error } = await sb.from(TABLA_INFORME).delete().eq('id', id);
  if (error) return res.status(502).json({ error: 'No se pudo borrar.', detalle: error.message });
  return res.status(200).json({ ok: true, borrado: id });
}
