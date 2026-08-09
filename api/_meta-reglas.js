// Las automatizaciones de la pauta: reglas que miran la foto diaria y PROPONEN.
//
//   GET  /api/meta-ads?recurso=reglas             → las reglas, los umbrales y el contexto medido
//   GET  /api/meta-ads?recurso=hallazgos[&estado=…] → lo que detectaron, para el Panel
//   POST /api/meta-ads?recurso=regla  { accion: 'guardar' | 'umbrales' | 'calibrar' | 'resolver', … }
//
// ⚠️ Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby.
//
// ⚠️ La lógica —qué detecta cada preset, qué umbral necesita, cómo se calibra— se IMPORTA de
// `lib/meta-ads/reglas.core.js`, que es el mismo archivo que usan el cron y la pantalla. Copiar un
// criterio acá adentro es lo que ya dejó pausar campañas a quien tenía el permiso excluido.
//
// # 🔑 Nada de acá escribe en Meta, y no es una omisión: es el diseño
//
// Una regla propone; ejecutar es apretar un botón, y ese botón usa el POST de acciones que ya
// existe (`_meta-acciones.js`), con su permiso, su `idem`, su relectura y su registro. `resolver`
// sólo mueve el estado del hallazgo DESPUÉS. Si esa segunda llamada falla, la acción igual pasó y
// el hallazgo queda en `nuevo`: se vuelve a proponer, que es la dirección barata del error —lo caro
// sería marcarlo hecho sin que se hiciera.
//
// # Los dos GET van antes del guard del token
//
// Salen de la base y no hablan con Meta. Es la misma razón que la auditoría y los planes: el día
// que el token se venza, la pregunta es qué hay que decidir, y eso no depende de Graph.
import { lineasQuePuede, lineasQueVe } from '../lib/meta-ads/acciones.core.js';
import {
  calibrar, CLAVES_PRESET, contextoUmbrales, permiteAccionarHallazgo, PRESETS, UMBRALES,
} from '../lib/meta-ads/reglas.core.js';
import { clienteBdi } from './_meta-lineas.js';

const TABLA = 'meta_ads_regla';
const TABLA_HALLAZGO = 'meta_ads_hallazgo';
const TABLA_UMBRAL = 'meta_ads_umbral';

/** Cuántos días se leen del snapshot. Los mismos 90 en todos los caminos: ver `evaluar-reglas-meta.mjs`. */
const DIAS_VENTANA = 90;

/** Las columnas del snapshot que necesitan las reglas. Explícitas: a nivel aviso son decenas de miles. */
const COLS_SNAP = [
  'fecha', 'nivel', 'objeto_id', 'cuenta_id', 'nombre', 'linea',
  'estado', 'estado_efectivo', 'estado_real', 'diario_crudo',
  'spend', 'impresiones', 'frecuencia', 'clicks', 'compras', 'revenue',
].join(',');

const quienEs = (perfil) => (perfil && perfil.name) || 'desconocido';
const hoyIso = () => new Date().toISOString().slice(0, 10);

const desdeIso = (dias) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (dias - 1));
  return d.toISOString().slice(0, 10);
};

/**
 * Las filas del snapshot de una ventana, paginadas.
 *
 * ⚠️ **PostgREST corta en 1.000 filas y no avisa**: devuelve las primeras mil como si fueran todas.
 * Con 90 días a nivel aviso son decenas de miles, así que sin esto el calibrador miraría un pedazo
 * del pasado creyendo que es todo — y una regla que mira menos días encuentra menos, en silencio.
 */
async function traerSnapshots(sb, lineas, dias = DIAS_VENTANA) {
  const filas = [];
  const PAGINA = 1000;
  const desde = desdeIso(dias);
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await sb
      .from('meta_ads_snapshot_dia')
      .select(COLS_SNAP)
      .in('linea', lineas)
      .gte('fecha', desde)
      .order('fecha', { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) return { error: error.message };
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return { filas };
}

async function traerUmbrales(sb) {
  const { data, error } = await sb.from(TABLA_UMBRAL).select('*');
  if (error) return { error: error.message };
  return { mapa: new Map((data || []).map((u) => [u.linea, u])) };
}

/** De fila de la base a lo que consume la pantalla. El mapeo vive en UN lado: acá. */
const aVistaRegla = (r) => ({
  id: r.id,
  creada: r.creada,
  quien: r.quien,
  preset: r.preset,
  linea: r.linea,
  cuentaId: r.cuenta_id,
  parametros: r.parametros || {},
  activa: !!r.activa,
  ultimaCorrida: r.ultima_corrida,
  detalle: r.detalle,
});

const aVistaHallazgo = (h, presetPorRegla) => ({
  id: h.id,
  reglaId: h.regla_id,
  preset: presetPorRegla.get(h.regla_id) || null,
  fecha: h.fecha,
  nivel: h.nivel,
  objetoId: h.objeto_id,
  objetoNombre: h.objeto_nombre,
  linea: h.linea,
  cuentaId: h.cuenta_id,
  motivo: h.motivo,
  evidencia: h.evidencia || {},
  sugerencia: h.sugerencia || null,
  estado: h.estado,
  resueltoPor: h.resuelto_por,
  planId: h.plan_id,
});

// ── Lectura ───────────────────────────────────────────────────────────────────────────────────

export async function reglasGet(res, perfil, q) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const visibles = lineasQueVe(perfil);
  if (!visibles.length) return res.status(403).json({ error: 'No tenés acceso a la pauta de ninguna marca.' });

  if (q.recurso === 'hallazgos') return await hallazgos(res, sb, visibles, q);

  const [reglas, umbrales, snap] = await Promise.all([
    sb.from(TABLA).select('*').in('linea', visibles).order('id'),
    traerUmbrales(sb),
    traerSnapshots(sb, visibles),
  ]);
  if (reglas.error) return res.status(502).json({ error: 'No se pudieron leer las reglas.', detalle: reglas.error.message });
  if (umbrales.error) return res.status(502).json({ error: 'No se pudieron leer los umbrales.', detalle: umbrales.error });
  if (snap.error) return res.status(502).json({ error: 'No se pudo leer la foto diaria.', detalle: snap.error });

  // El contexto medido por línea: los números que se muestran al lado del dial para que el umbral
  // no se elija a ciegas. Se calculan acá y no en la pantalla porque salen de las mismas filas que
  // ya se leyeron — mandarlas todas al browser serían megabytes.
  const contexto = {};
  for (const l of visibles) contexto[l] = contextoUmbrales(snap.filas.filter((f) => f.linea === l));

  return res.status(200).json({
    ok: true,
    reglas: (reglas.data || []).map(aVistaRegla),
    umbrales: Object.fromEntries([...umbrales.mapa].filter(([l]) => visibles.includes(l))),
    contexto,
    // El catálogo viaja con la respuesta para que la pantalla no tenga que importar el `.core.js`
    // y quedarse con una copia vieja del texto de un preset.
    presets: CLAVES_PRESET.map((k) => ({ clave: k, ...PRESETS[k] })),
    definicionUmbrales: UMBRALES,
    // Qué líneas puede EDITAR, que no es lo mismo que cuáles ve: el selector las muestra todas y
    // los botones de guardar se apagan donde no corresponde.
    puedeEditar: lineasQuePuede(perfil, 'pautar'),
    dias: DIAS_VENTANA,
  });
}

async function hallazgos(res, sb, visibles, q) {
  const estado = String(q.estado || 'nuevo');
  let sel = sb.from(TABLA_HALLAZGO).select('*').in('linea', visibles).order('fecha', { ascending: false }).limit(200);
  if (estado !== 'todos') sel = sel.eq('estado', estado);
  if (q.regla) sel = sel.eq('regla_id', parseInt(q.regla, 10));
  const { data, error } = await sel;
  if (error) return res.status(502).json({ error: 'No se pudieron leer los hallazgos.', detalle: error.message });

  const ids = [...new Set((data || []).map((h) => h.regla_id))];
  const reglas = ids.length ? await sb.from(TABLA).select('id,preset').in('id', ids) : { data: [] };
  const presetPorRegla = new Map((reglas.data || []).map((r) => [r.id, r.preset]));

  /**
   * 🔑 **Se devuelve UNO por objeto, el más reciente.** Un hallazgo se guarda por (regla, fecha,
   * objeto) para que quede la historia, pero mientras algo siga pasando la regla lo detecta todos
   * los días — y el Panel mostraría el mismo renglón cinco veces. La lista completa está en el
   * historial de la regla; lo que hay que DECIDIR es una cosa por objeto.
   */
  const porObjeto = new Map();
  for (const h of data || []) {
    const k = `${h.regla_id}:${h.objeto_id}`;
    const previo = porObjeto.get(k);
    if (!previo) { porObjeto.set(k, { ...h, veces: 1 }); continue; }
    previo.veces++;
    // Vienen ordenados por fecha desc, así que el primero ya es el más reciente.
  }

  return res.status(200).json({
    ok: true,
    hallazgos: [...porObjeto.values()].map((h) => ({ ...aVistaHallazgo(h, presetPorRegla), veces: h.veces })),
  });
}

// ── Escritura ─────────────────────────────────────────────────────────────────────────────────

export default async function reglasPost(req, res, perfil) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const body = req.body || {};
  const accion = String(body.accion || '');

  if (accion === 'guardar') return await guardarRegla(res, sb, perfil, body);
  if (accion === 'umbrales') return await guardarUmbrales(res, sb, perfil, body);
  if (accion === 'calibrar') return await correrCalibrador(res, sb, perfil, body);
  if (accion === 'resolver') return await resolver(res, sb, perfil, body);
  return res.status(400).json({ error: `Acción desconocida: «${accion}».` });
}

/** Editar reglas y umbrales pide `pautar`: es el permiso de «decidir cómo se pautea». */
function puedePautar(perfil, linea) {
  if (!linea) return { ok: false, status: 400, error: 'Falta la marca.' };
  if (lineasQuePuede(perfil, 'pautar').includes(linea)) return { ok: true };
  return { ok: false, status: 403, error: 'Para tocar las automatizaciones hace falta el permiso «Puede aprobar ideas y corregir la etapa de una campaña» (meta-ads.pautar) en esa marca.' };
}

async function guardarRegla(res, sb, perfil, body) {
  const preset = String(body.preset || '');
  const linea = String(body.linea || '');
  if (!PRESETS[preset]) return res.status(400).json({ error: `No existe la automatización «${preset}».` });
  const permiso = puedePautar(perfil, linea);
  if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.error });

  const fila = {
    preset,
    linea,
    cuenta_id: body.cuentaId ? String(body.cuentaId) : null,
    parametros: limpiarParametros(body.parametros),
    activa: !!body.activa,
    quien: quienEs(perfil),
    actualizada: new Date().toISOString(),
  };

  // Una regla por (preset, línea): dos reglas del mismo preset sobre la misma marca competirían por
  // el mismo `unique(regla_id, fecha, objeto_id)` y darían dos renglones diciendo lo mismo.
  const { data: previa } = await sb.from(TABLA).select('id').eq('preset', preset).eq('linea', linea).maybeSingle();
  const q = previa
    ? sb.from(TABLA).update(fila).eq('id', previa.id).select('*').maybeSingle()
    : sb.from(TABLA).insert(fila).select('*').maybeSingle();
  const { data, error } = await q;
  if (error) return res.status(502).json({ error: 'No se pudo guardar la regla.', detalle: error.message });
  return res.status(200).json({ ok: true, regla: aVistaRegla(data) });
}

/** Sólo las claves que existen, y sólo números. Un `''` del formulario borra el override. */
function limpiarParametros(p) {
  const out = {};
  for (const k of Object.keys(UMBRALES)) {
    const v = p && p[k];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

async function guardarUmbrales(res, sb, perfil, body) {
  const linea = String(body.linea || '');
  const permiso = puedePautar(perfil, linea);
  if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.error });

  // 🔑 Se escriben TODAS las claves, y las vacías van en `null` explícito. Omitirlas dejaría el
  // valor viejo puesto, así que borrar un umbral desde la pantalla no borraría nada — y la regla
  // seguiría corriendo con un número que la persona cree que sacó.
  const fila = { linea, quien: quienEs(perfil), actualizado: new Date().toISOString() };
  const limpios = limpiarParametros(body.umbrales);
  for (const k of Object.keys(UMBRALES)) fila[k] = limpios[k] ?? null;

  const { data, error } = await sb.from(TABLA_UMBRAL).upsert(fila, { onConflict: 'linea' }).select('*').maybeSingle();
  if (error) return res.status(502).json({ error: 'No se pudieron guardar los umbrales.', detalle: error.message });
  return res.status(200).json({ ok: true, umbral: data });
}

/**
 * 🎯 El calibrador: corre un preset hacia atrás con los umbrales que se le pasen, **sin guardar
 * nada**. Es lo que hace elegible un umbral sin definirlo de antemano.
 *
 * Pide sólo ver la línea, no editarla: mirar qué pasaría no cambia nada, y obligar a tener permiso
 * de escritura para poder mirar sería un candado que no protege nada.
 */
async function correrCalibrador(res, sb, perfil, body) {
  const preset = String(body.preset || '');
  const linea = String(body.linea || '');
  if (!PRESETS[preset]) return res.status(400).json({ error: `No existe la automatización «${preset}».` });
  if (!lineasQueVe(perfil).includes(linea)) return res.status(403).json({ error: 'No ves la pauta de esa marca.' });

  const [umbrales, snap] = await Promise.all([traerUmbrales(sb), traerSnapshots(sb, [linea])]);
  if (umbrales.error) return res.status(502).json({ error: 'No se pudieron leer los umbrales.', detalle: umbrales.error });
  if (snap.error) return res.status(502).json({ error: 'No se pudo leer la foto diaria.', detalle: snap.error });

  const r = calibrar(
    { preset, linea, cuentaId: body.cuentaId || null, parametros: limpiarParametros(body.parametros) },
    { filas: snap.filas, umbralLinea: umbrales.mapa.get(linea) || null, hasta: hoyIso(), dias: DIAS_VENTANA },
  );
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  return res.status(200).json({ ok: true, ...r });
}

/**
 * Marca un hallazgo como accionado o ignorado.
 *
 * ⚠️ **No ejecuta la acción**: eso lo hizo el POST de acciones que ya existe, antes de llegar acá.
 * Esto sólo mueve el estado. El orden importa y es el barato: si esta llamada falla, la acción ya
 * pasó y el hallazgo queda en `nuevo`, o sea que se vuelve a proponer. Al revés —marcar primero—
 * dejaría hecho algo que no se hizo.
 */
async function resolver(res, sb, perfil, body) {
  const id = parseInt(body.id, 10);
  const estado = String(body.estado || '');
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Falta el id del hallazgo.' });
  if (estado !== 'accionado' && estado !== 'ignorado') return res.status(400).json({ error: 'El estado tiene que ser «accionado» o «ignorado».' });

  const { data: h, error: e1 } = await sb.from(TABLA_HALLAZGO).select('*').eq('id', id).maybeSingle();
  if (e1) return res.status(502).json({ error: 'No se pudo leer el hallazgo.', detalle: e1.message });
  if (!h) return res.status(404).json({ error: 'Ese hallazgo no existe.' });

  const { data: regla } = await sb.from(TABLA).select('preset').eq('id', h.regla_id).maybeSingle();
  // El permiso se pregunta por la LÍNEA DEL HALLAZGO, no por la que mande el cliente. Y es el sub de
  // la acción que ejecutaría, nunca uno propio: ver `permiteAccionarHallazgo`.
  const permiso = permiteAccionarHallazgo(perfil, (regla && regla.preset) || '', h.linea);
  if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.error });

  /**
   * 🔑 Se resuelven TODOS los hallazgos vivos de ese objeto en esa regla, no sólo el de hoy.
   *
   * La regla detecta lo mismo cada día que siga pasando, así que hay una fila por fecha. Marcar sólo
   * la de hoy dejaría las de ayer y anteayer en `nuevo`, y el renglón volvería mañana como si nadie
   * lo hubiera mirado — que es exactamente la forma en que se aprende a ignorar los avisos.
   */
  const { error: e2 } = await sb
    .from(TABLA_HALLAZGO)
    .update({ estado, resuelto_por: quienEs(perfil), resuelto_en: new Date().toISOString(), plan_id: body.planId ?? null })
    .eq('regla_id', h.regla_id)
    .eq('objeto_id', h.objeto_id)
    .eq('estado', 'nuevo');
  if (e2) return res.status(502).json({ error: 'No se pudo marcar el hallazgo.', detalle: e2.message });
  return res.status(200).json({ ok: true });
}
