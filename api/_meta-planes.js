// El motor de planes por pasos sobre la pauta de Meta.
//
//   POST /api/meta-ads?recurso=plan  { accion: 'crear' | 'avanzar' | 'cancelar', … }
//   GET  /api/meta-ads?recurso=plan&id=<n>          → un plan con sus pasos
//   GET  /api/meta-ads?recurso=planes[&estado=…]    → los planes que este perfil puede ver
//
// ⚠️ Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby.
//
// ⚠️ La lógica —qué pasos existen, cuáles se pueden repetir, qué hacer con uno que quedó en curso—
// se IMPORTA de `lib/meta-ads/planes.core.js`, que es el mismo archivo con el que la pantalla dibuja
// el progreso. Copiar un criterio acá adentro es lo que ya dejó pausar campañas a quien tenía el
// permiso excluido, en el archivo de al lado.
//
// # Por qué existe, en una línea
//
// Una acción suelta entra en un request; duplicar un conjunto con 6 avisos son 7 POSTs y no entra.
// El motor parte la operación en pasos chicos, **anota la marca de cada uno ANTES de mandarlo**, y
// deja que el avance se retome donde quedó. Si se corta, nadie tiene que hacer nada: se aprieta
// Seguir y el motor sondea el paso dudoso, lo adopta si Meta lo creó y termina lo que falta.
//
// # El orden de `crear` es el punto, igual que en `_meta-acciones.js`
//
//   1. Validar la forma (tipo de plan, idem, nivel, ids).
//   2. Leer en Meta el objeto y su censo. **La línea sale de la campaña**, nunca de lo que manda el
//      cliente: el cliente puede mentir y la plata es de una marca.
//   3. Permiso, preguntado por la LÍNEA. Un plan no suma un sub nuevo: pide el de la acción que ejecuta.
//   4. Armar los pasos con el núcleo puro y persistirlos. **`crear` no escribe en Meta**: el plan se
//      revisa antes de ejecutarlo, que es la mitad del valor de tener un plan.
import {
  CAMPOS_LECTURA, ETIQUETA_NIVEL, lineasQueVe, nivelReal, quedoPuesto, revisarPresupuesto, SIN_LINEA,
} from '../lib/meta-ads/acciones.core.js';
import {
  armarPlanDuplicar, armarPlanMoverPlata, entraOtroPaso, estadoDePlan, marcaDePaso, marcadorDe,
  nombreConMarca, permitePlan, politicaReintento, siguientePaso, sustituir, TIMEOUT_PASO_MS,
  TIPOS_PASO, TIPOS_PLAN,
} from '../lib/meta-ads/planes.core.js';
import { codigoError, graph, graphPost, insightsTodas, mensajeError, minimosDe } from '../lib/meta-ads/graph.core.js';
import {
  CAMPOS_RECETA, conDiario, escalonesDeDiario, esRechazoDePresupuesto, recetaDeConjunto, VALIDAR_SOLO,
} from '../lib/meta-ads/receta.core.js';
import { clienteBdi, leerAsignaciones } from './_meta-lineas.js';

const TABLA = 'meta_ads_plan';
const TABLA_PASO = 'meta_ads_plan_paso';

/** Cuánto dura el lock del avance. Corto a propósito: si una función muere, el plan se destraba solo. */
const LOCK_MS = 25000;

const quienEs = (perfil) => (perfil && perfil.name) || 'desconocido';
const ahoraIso = () => new Date().toISOString();

// ── Lectura ───────────────────────────────────────────────────────────────────────────────────

/**
 * Los dos GET. Se despachan **antes del guard del token**, al lado de la auditoría y por el mismo
 * motivo: el día que el token se venza, la pregunta es qué se llegó a hacer, y eso sale de la base.
 */
export async function planesGet(res, perfil, q) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const visibles = lineasQueVe(perfil);
  if (!visibles.length) return res.status(403).json({ error: 'No tenés acceso a la pauta de ninguna marca.' });

  if (q.recurso === 'plan') {
    const id = parseInt(q.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Falta el id del plan.' });
    const leido = await leerPlan(sb, id);
    if (leido.error) return res.status(leido.status || 502).json({ error: leido.error });
    if (!visibles.includes(leido.plan.linea)) return res.status(403).json({ error: 'Ese plan es de una marca que no ves.' });
    return res.status(200).json({ ok: true, plan: aVista(leido.plan, leido.pasos) });
  }

  // La lista. Por defecto sólo lo que sigue vivo: un plan terminado no es una tarea pendiente y el
  // Panel se llenaría de historia. El Registro sí los pide todos (`estado=todos`).
  const vivos = ['pendiente', 'en-curso', 'atascado'];
  let sel = sb.from(TABLA).select('*').in('linea', visibles).order('creado', { ascending: false }).limit(50);
  if (String(q.estado || '') !== 'todos') sel = sel.in('estado', vivos);
  const { data, error } = await sel;
  if (error) return res.status(502).json({ error: 'No se pudieron leer los planes.', detalle: error.message });

  const ids = (data || []).map((p) => p.id);
  const pasos = ids.length ? await sb.from(TABLA_PASO).select('*').in('plan_id', ids).order('orden') : { data: [] };
  const porPlan = new Map();
  for (const p of pasos.data || []) {
    if (!porPlan.has(p.plan_id)) porPlan.set(p.plan_id, []);
    porPlan.get(p.plan_id).push(p);
  }
  return res.status(200).json({ ok: true, planes: (data || []).map((p) => aVista(p, porPlan.get(p.id) || [])) });
}

async function leerPlan(sb, id) {
  const { data, error } = await sb.from(TABLA).select('*').eq('id', id).maybeSingle();
  if (error) return { error: 'No se pudo leer el plan.', status: 502 };
  if (!data) return { error: 'No hay ningún plan con ese id.', status: 404 };
  const { data: pasos, error: e2 } = await sb.from(TABLA_PASO).select('*').eq('plan_id', id).order('orden');
  if (e2) return { error: 'No se pudieron leer los pasos del plan.', status: 502 };
  return { plan: data, pasos: pasos || [] };
}

/**
 * De la fila de la base a la forma que mira la pantalla **y el núcleo**.
 *
 * ⚠️ La traducción va acá y en un solo lado a propósito: con las dos formas dando vueltas, un
 * `ultimo_en` que le llega al núcleo como `undefined` hace que la espera de la sonda se pierda en
 * silencio y «no la encontré» vuelva a leerse como «no se creó».
 */
const aPaso = (f) => ({
  orden: f.orden, tipo: f.tipo, rotulo: f.rotulo, estado: f.estado, intentos: f.intentos || 0,
  pedido: f.pedido || null, resultadoId: f.resultado_id || null, marca: f.marca || null,
  detalle: f.detalle || null, ultimoEn: f.ultimo_en || null,
  puedeReintentar: !!f.puede_reintentar,
});

const aVista = (p, pasos) => ({
  id: p.id, idem: p.idem, marcador: p.marcador, creado: p.creado, quien: p.quien, tipo: p.tipo,
  variante: p.variante, cuentaId: p.cuenta_id, linea: p.linea, entrada: p.entrada || {},
  contexto: p.contexto || {}, simulacro: !!p.simulacro, estado: p.estado, detalle: p.detalle || null,
  pasos: (pasos || []).map(aPaso),
});

// ── El despacho de los POST ───────────────────────────────────────────────────────────────────

export default async function planes(req, res, perfil) {
  const b = req.body || {};
  const accion = String(b.accion || '');
  if (accion === 'crear') return await crear(res, perfil, b);
  if (accion === 'avanzar') return await avanzar(res, perfil, b);
  if (accion === 'reintentar') return await reintentar(res, perfil, b);
  if (accion === 'cancelar') return await cancelar(res, perfil, b);
  return res.status(400).json({ error: `No existe «${accion || '(vacía)'}» sobre un plan.` });
}

// ── Crear ─────────────────────────────────────────────────────────────────────────────────────

async function crear(res, perfil, b) {
  const tipo = String(b.tipo || '');
  if (!TIPOS_PLAN[tipo]) return res.status(400).json({ error: `No existe el plan «${tipo || '(vacío)'}».` });

  const idem = String(b.idem || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(idem)) {
    return res.status(400).json({ error: 'Falta la clave del plan, que es lo que evita que un doble clic lo arme dos veces.' });
  }

  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase para registrar el plan.' });

  // El candado del doble clic, antes de gastar una sola lectura de Graph: si el plan ya existe se
  // devuelve el que hay, igual que hace `_meta-acciones.js` con su `idem`.
  const { data: yaEsta } = await sb.from(TABLA).select('id').eq('idem', idem).maybeSingle();
  if (yaEsta) {
    const leido = await leerPlan(sb, yaEsta.id);
    if (leido.error) return res.status(leido.status || 502).json({ error: leido.error });
    return res.status(200).json({ ok: true, plan: aVista(leido.plan, leido.pasos), repetido: true });
  }

  const marcador = marcadorDe(idem);
  const armado = tipo === 'duplicar'
    ? await prepararDuplicar(perfil, b, marcador)
    : await prepararMoverPlata(perfil, b);
  if (!armado.ok) return res.status(armado.status || 400).json({ error: armado.error, ...(armado.extra || {}) });

  const { data: fila, error } = await sb.from(TABLA).insert([{
    idem, marcador, quien: quienEs(perfil), tipo, variante: armado.variante,
    cuenta_id: armado.cuentaId, linea: armado.linea, entrada: armado.entrada || {},
    contexto: {}, simulacro: !!b.simulacro, estado: 'pendiente',
  }]).select('*').maybeSingle();
  if (error || !fila) {
    return res.status(502).json({
      error: 'No se pudo registrar el plan, así que no se armó.',
      detalle: `${(error && error.message) || 'sin fila'} — si las tablas ${TABLA} no existen, correr \`node scripts/apply-meta-planes.mjs\`.`,
    });
  }

  const filasPaso = armado.pasos.map((p) => ({
    plan_id: fila.id, orden: p.orden, tipo: p.tipo, rotulo: p.rotulo,
    pedido: p.pedido || null, marca: p.marca || null, estado: 'pendiente',
  }));
  const { error: e2 } = await sb.from(TABLA_PASO).insert(filasPaso);
  if (e2) {
    // Un plan sin pasos no se puede avanzar y tampoco se puede dejar como si estuviera vivo: se
    // cierra atascado con el motivo, que es lo que la pantalla sabe mostrar.
    await sb.from(TABLA).update({ estado: 'atascado', detalle: `No se pudieron guardar los pasos: ${e2.message}` }).eq('id', fila.id);
    return res.status(502).json({ error: 'No se pudieron guardar los pasos del plan.', detalle: e2.message });
  }

  const leido = await leerPlan(sb, fila.id);
  return res.status(200).json({ ok: true, plan: aVista(leido.plan || fila, leido.pasos || []) });
}

/**
 * Todo lo que hay que MEDIR en Meta antes de poder armar un plan de duplicar.
 *
 * 🔑 El censo se lee acá y se congela en el plan: cuántos conjuntos y avisos tiene el original y con
 * qué `creative_id`. Deducirlo después obligaría al núcleo a hablar con Meta. Mismo criterio que el
 * resto del repo: lo que existe se mide, no se deduce.
 */
async function prepararDuplicar(perfil, b, marcador) {
  const nivel = String(b.nivel || '');
  const objetoId = String(b.objetoId || '');
  if (!CAMPOS_LECTURA[nivel]) return { ok: false, status: 400, error: `No existe el nivel «${nivel || '(vacío)'}».` };
  if (!/^\d+$/.test(objetoId)) return { ok: false, status: 400, error: 'El id del objeto tiene que ser un número de Meta.' };

  const lectura = await graph(`${objetoId}?fields=${CAMPOS_LECTURA[nivel]}`);
  if (!lectura.ok) {
    const code = codigoError(lectura);
    return {
      ok: false, status: code === 100 ? 400 : 502,
      error: code === 100 ? `Ese id no parece ser un/a ${ETIQUETA_NIVEL[nivel]} de Meta.` : 'No se pudo leer el objeto en Meta, así que no se armó nada.',
    };
  }
  const obj = lectura.data || {};
  const real = nivelReal(obj);
  if (real !== nivel) return { ok: false, status: 400, error: `Ese id es un/a ${ETIQUETA_NIVEL[real] || real}, no un/a ${ETIQUETA_NIVEL[nivel]}.` };

  const cuentaId = String(obj.account_id || '');
  const campaignId = nivel === 'campania' ? objetoId : String(obj.campaign_id || '');

  const linea = await lineaDe(campaignId);
  if (!linea.ok) return linea;
  const permiso = permitePlan(perfil, 'duplicar', linea.linea);
  if (!permiso.ok) return { ok: false, ...permiso };

  // El censo. Dos llamadas como mucho: los avisos de una campaña ya traen su `adset_id`, así que no
  // hace falta una llamada por conjunto.
  const censo = {};
  if (nivel === 'conjunto') {
    const ads = await insightsTodas(`${objetoId}/ads?fields=id,name,creative{id}&limit=200`);
    if (!ads.ok) return { ok: false, status: 502, error: `No se pudieron leer los avisos del conjunto (${ads.error}).` };
    censo.avisos = ads.rows.map(aAvisoCenso);
  } else {
    const [sets, ads] = await Promise.all([
      insightsTodas(`${objetoId}/adsets?fields=id,name,daily_budget&limit=200`),
      insightsTodas(`${objetoId}/ads?fields=id,name,adset_id,creative{id}&limit=200`),
    ]);
    if (!sets.ok) return { ok: false, status: 502, error: `No se pudieron leer los conjuntos de la campaña (${sets.error}).` };
    if (!ads.ok) return { ok: false, status: 502, error: `No se pudieron leer los avisos de la campaña (${ads.error}).` };
    censo.conjuntos = sets.rows.map((s) => ({
      id: String(s.id), nombre: String(s.name || ''),
      avisos: ads.rows.filter((a) => String(a.adset_id) === String(s.id)).map(aAvisoCenso),
    }));
    if (!censo.conjuntos.length) return { ok: false, status: 409, error: 'Esa campaña no tiene conjuntos, así que copiarla dejaría una campaña vacía.' };
  }

  // 🔴 Un aviso sin `creative_id` no se puede recrear: sin él no hay con qué armar el aviso nuevo.
  // Se dice cuáles antes de armar nada, en vez de dejar que el plan muera en el paso 5 de 7.
  const sinCreativo = (censo.avisos || []).concat(...(censo.conjuntos || []).map((c) => c.avisos))
    .filter((a) => !a.creativeId);
  if (sinCreativo.length) {
    return {
      ok: false, status: 409,
      error: `${sinCreativo.length} aviso(s) no tienen creativo legible, así que no se pueden recrear: ${sinCreativo.map((a) => `«${a.nombre}»`).join(', ')}.`,
    };
  }

  // Las recetas: la configuración de cada conjunto, corregida y **ya validada contra Meta**. Es lo
  // que hace que armar un plan deje de ser una promesa — ver `recetaValidada`.
  const minimos = await minimosDe(cuentaId);
  const diarioPedido = b.presupuestoCrudo ? Math.round(Number(b.presupuestoCrudo)) : null;
  let receta = null;
  if (nivel === 'conjunto') {
    const r = await recetaValidada(cuentaId, objetoId, campaignId, { diarioPedido, minimos });
    if (!r.ok) return r;
    receta = r.receta;
  } else {
    const rs = await Promise.all((censo.conjuntos || []).map((c) => recetaValidada(cuentaId, c.id, objetoId, {
      // El diario pedido sólo se aplica cuando hay UN conjunto: repartirlo entre varios sería
      // inventar un criterio de reparto que nadie pidió.
      diarioPedido: (censo.conjuntos || []).length === 1 ? diarioPedido : null,
      minimos,
    })));
    const mala = rs.find((r) => !r.ok);
    if (mala) return mala;
    (censo.conjuntos || []).forEach((c, i) => { c.receta = rs[i].receta; });
  }

  const entrada = {
    nivel, objetoId, cuentaId, campaignId, nombreOriginal: String(obj.name || ''),
    copias: Number(b.copias) || 1,
    nombre: b.nombre ? String(b.nombre).trim() : null,
    presupuestoCrudo: diarioPedido,
    censo,
    receta,
    // Lo que la receta tuvo que tocar, junto, para que la pantalla lo pueda mostrar ANTES de
    // «Empezar». Una corrección silenciosa sobre la segmentación de algo que gasta plata es
    // exactamente lo que después nadie puede auditar.
    avisos: [...new Set([
      ...((receta && receta.notas) || []),
      ...[].concat(...(censo.conjuntos || []).map((c) => (c.receta && c.receta.notas) || [])),
    ])],
  };
  const armado = armarPlanDuplicar(entrada, marcador);
  if (!armado.ok) return armado;
  return { ok: true, pasos: armado.pasos, variante: armado.variante, cuentaId, linea: linea.linea, entrada };
}

/**
 * El nombre con el que se valida. **No se crea nada con él** —`validate_only` no escribe—, pero si
 * alguna vez apareciera en Ads Manager sería la prueba de que Meta dejó de honrar el flag, y por eso
 * se dice en el nombre en vez de usar uno cualquiera.
 */
const NOMBRE_VALIDACION = 'validación del monitor · no se crea nada con este nombre';

/**
 * La receta de UN conjunto: leída de Meta, corregida, y **preguntada a Meta antes de prometer nada**.
 *
 * 🔑 `validate_only` es lo que cambia la naturaleza de armar un plan. Antes, `crear` sólo leía el
 * censo y escribía los pasos, así que un plan podía nacer «listo» y morir en el paso 1 contra un
 * rechazo que se sabía de entrada — que es exactamente lo que pasó el 8-ago con el emplazamiento
 * «Explorar». Ahora, un plan armado es un plan que Meta ya dijo que acepta.
 *
 * Y el diario, cuando hace falta subirlo, **no se calcula: se prueba escalón por escalón de menor a
 * mayor**, así la copia nace lo más parecida posible al original. Ver `escalonesDeDiario()`.
 */
async function recetaValidada(cuentaId, adsetId, campaignIdValidacion, opciones) {
  const o = opciones || {};
  const l = await graph(`${adsetId}?fields=${CAMPOS_RECETA}`);
  if (!l.ok) {
    return { ok: false, status: 502, error: `No se pudo leer la configuración del conjunto en Meta (${mensajeError(l)}), así que no se armó nada.` };
  }
  const arm = recetaDeConjunto(l.data);
  if (!arm.ok) return arm;

  const nombre = String(l.data.name || adsetId);
  const cuerpo = { ...arm.cuerpo };
  if (o.diarioPedido) cuerpo.daily_budget = String(o.diarioPedido);

  const fijos = { name: NOMBRE_VALIDACION, campaign_id: String(campaignIdValidacion), status: 'PAUSED' };
  const primero = await graphPost(`act_${cuentaId}/adsets`, { ...cuerpo, ...fijos, ...VALIDAR_SOLO }, TIMEOUT_PASO_MS);
  if (primero.ok) return { ok: true, receta: { cuerpo, notas: arm.notas } };

  const noVa = { ok: false, status: 409, error: `Meta no acepta recrear «${nombre}» como está: ${mensajeError(primero)}` };
  // ⛔ Si el diario lo eligió una persona, no se le cambia por atrás: se le dice qué contestó Meta.
  if (o.diarioPedido || !esRechazoDePresupuesto(primero.error)) return noVa;

  for (const escalon of escalonesDeDiario(mensajeError(primero), o.minimos)) {
    const suba = conDiario(cuerpo, escalon);
    if (!suba.ok) continue;
    const v = await graphPost(`act_${cuentaId}/adsets`, { ...suba.cuerpo, ...fijos, ...VALIDAR_SOLO }, TIMEOUT_PASO_MS);
    if (v.ok) return { ok: true, receta: { cuerpo: suba.cuerpo, notas: [...arm.notas, suba.nota] } };
  }
  return noVa;
}

const aAvisoCenso = (a) => ({
  id: String(a.id), nombre: String(a.name || ''),
  creativeId: String((a.creative && a.creative.id) || ''),
});

/**
 * Mover plata entre dos conjuntos.
 *
 * 🔴 **Los dos conjuntos tienen que ser de la MISMA línea**, y esto no es una comodidad: con las tres
 * marcas pautando desde una cuenta, mover presupuesto de un conjunto de BDI a uno de Stunned es
 * gastarle la plata a una marca en otra. No hay permiso que lo arregle, así que es 409 y no 403.
 */
async function prepararMoverPlata(perfil, b) {
  const deId = String(b.deId || '');
  const aId = String(b.aId || '');
  if (!/^\d+$/.test(deId) || !/^\d+$/.test(aId)) return { ok: false, status: 400, error: 'Faltan los conjuntos de origen y destino.' };

  const [ld, la] = await Promise.all([
    graph(`${deId}?fields=${CAMPOS_LECTURA.conjunto}`),
    graph(`${aId}?fields=${CAMPOS_LECTURA.conjunto}`),
  ]);
  if (!ld.ok || !la.ok) {
    return { ok: false, status: 502, error: `No se pudo leer ${!ld.ok ? 'el conjunto de origen' : 'el conjunto de destino'} en Meta, así que no se armó nada.` };
  }
  const de = ld.data || {}, a = la.data || {};
  if (nivelReal(de) !== 'conjunto' || nivelReal(a) !== 'conjunto') {
    return { ok: false, status: 400, error: 'Mover plata es entre CONJUNTOS: uno de los dos ids no lo es.' };
  }

  const lineaDeOrigen = await lineaDe(String(de.campaign_id || ''));
  if (!lineaDeOrigen.ok) return lineaDeOrigen;
  const lineaDestino = await lineaDe(String(a.campaign_id || ''));
  if (!lineaDestino.ok) return lineaDestino;
  if (lineaDeOrigen.linea !== lineaDestino.linea) {
    return { ok: false, status: 409, error: 'Esos dos conjuntos son de marcas distintas: mover plata entre marcas no se hace desde acá.' };
  }
  const permiso = permitePlan(perfil, 'mover-plata', lineaDeOrigen.linea);
  if (!permiso.ok) return { ok: false, ...permiso };

  const cuentaId = String(de.account_id || '');
  // Las mismas reglas que corta una acción suelta de presupuesto: CBO y presupuesto total. Se
  // preguntan por los dos lados, porque el que no se puede tocar puede ser cualquiera.
  for (const [obj, cual] of [[de, 'origen'], [a, 'destino']]) {
    const padreId = String(obj.campaign_id || '');
    let padre = null;
    if (padreId) {
      const p = await graph(`${padreId}?fields=id,daily_budget,lifetime_budget`);
      if (p.ok) padre = p.data || null;
    }
    const reglas = revisarPresupuesto('conjunto', obj, padre, null, Number(obj.daily_budget) || 0);
    if (!reglas.ok) return { ok: false, status: reglas.status, error: `El conjunto de ${cual}: ${reglas.error}` };
  }

  const mins = await minimosDe(cuentaId, null);
  const entrada = {
    deId, aId, deNombre: String(de.name || ''), aNombre: String(a.name || ''),
    montoCrudo: Math.round(Number(b.montoCrudo)),
    // 🔑 El «de» se lee de Meta, NO se acepta del cliente: el valor que la pantalla tiene en la mano
    // puede estar viejo si alguien lo cambió en Ads Manager, y ahí el reparto movería otra cifra.
    deActualCrudo: Number(de.daily_budget) || 0,
    aActualCrudo: Number(a.daily_budget) || 0,
    minDiarioCrudo: mins.minDiarioCrudo || null,
  };
  const armado = armarPlanMoverPlata(entrada);
  if (!armado.ok) return armado;
  return { ok: true, pasos: armado.pasos, variante: armado.variante, cuentaId, linea: lineaDeOrigen.linea, entrada };
}

/** De qué marca es esta plata. Sale de la campaña, nunca de lo que dice el cliente. */
async function lineaDe(campaignId) {
  if (!campaignId) return { ok: false, status: 409, error: SIN_LINEA, extra: { sinLinea: true } };
  const asignadas = await leerAsignaciones();
  if (asignadas.error) return { ok: false, status: 502, error: 'No se pudo leer de qué marca es esta campaña, así que no se armó nada.' };
  const fila = asignadas.mapa.get(String(campaignId));
  if (!fila) return { ok: false, status: 409, error: SIN_LINEA, extra: { sinLinea: true, campaignId } };
  return { ok: true, linea: String(fila.linea) };
}

// ── Avanzar: el bucle ─────────────────────────────────────────────────────────────────────────

/**
 * Ejecuta pasos mientras le entre el tiempo, y devuelve `seguir:true` si quedan.
 *
 * Los tres candados contra la doble ejecución, en capas: el `idem` único del plan, el
 * `unique(plan_id, orden)` de cada paso y el **lock optimista** de acá, que es el que impide que dos
 * pestañas ejecuten el mismo paso a la vez. Y por debajo de todo, la marca.
 */
async function avanzar(res, perfil, b) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const id = parseInt(b.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Falta el id del plan.' });

  const leido = await leerPlan(sb, id);
  if (leido.error) return res.status(leido.status || 502).json({ error: leido.error });
  const plan = leido.plan;

  if (plan.estado === 'cancelado') return res.status(409).json({ error: 'Ese plan está cancelado.' });
  const permiso = permitePlan(perfil, plan.tipo, plan.linea);
  if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.error });

  // El lock. Si otro avance lo tiene tomado se contesta que espere, en vez de correr los dos.
  const ahora = Date.now();
  if (plan.lock_hasta && new Date(plan.lock_hasta).getTime() > ahora) {
    return res.status(409).json({ error: 'Este plan se está avanzando desde otro lado. Esperá unos segundos.' });
  }
  const hasta = new Date(ahora + LOCK_MS).toISOString();
  const { data: tomado } = await sb.from(TABLA)
    .update({ lock_hasta: hasta, estado: 'en-curso', actualizado: ahoraIso() })
    .eq('id', id)
    // 🔑 El `is`/`lt` es lo que hace al lock OPTIMISTA: si otro lo tomó entre la lectura y esta
    // escritura, no vuelve fila y no se avanza. Sin esto el chequeo de arriba sería decorativo.
    // ⚠️ El valor va entre comillas: un ISO trae puntos (`.000Z`) y PostgREST parte `col.op.valor`
    // por puntos. Sin comillas, la mitad de la fecha se lee como parte del operador.
    .or(`lock_hasta.is.null,lock_hasta.lt."${new Date(ahora).toISOString()}"`)
    .select('id').maybeSingle();
  if (!tomado) return res.status(409).json({ error: 'Este plan se está avanzando desde otro lado. Esperá unos segundos.' });

  const inicio = Date.now();
  let pasos = leido.pasos.map(aPaso);
  const contexto = { ...(plan.contexto || {}) };
  let hechos = 0;
  let motivo = null;

  while (entraOtroPaso(Date.now() - inicio)) {
    const paso = siguientePaso(pasos);
    if (!paso) break;
    const politica = politicaReintento(paso, Date.now());

    if (politica === 'esperar') { motivo = 'Meta todavía está armando lo del paso anterior. Volvé a apretar Seguir en un momento.'; break; }
    if (politica === 'rendirse') {
      // Se puede reintentar a mano: que el motor se haya rendido después de tres vueltas no
      // significa que el problema no se pueda arreglar afuera. Lo que no se hace solo es insistir.
      await guardarPaso(sb, plan.id, paso.orden, {
        estado: 'fallado', puede_reintentar: true, detalle: paso.detalle || 'Se agotaron los intentos.',
      });
      pasos = pasos.map((p) => (p.orden === paso.orden ? { ...p, estado: 'fallado' } : p));
      motivo = `El paso ${paso.orden} («${paso.rotulo}») no se pudo completar.`;
      break;
    }

    const r = politica === 'sondear'
      ? await sondar(sb, plan, paso, contexto)
      : await ejecutar(sb, plan, paso, contexto);

    pasos = pasos.map((p) => (p.orden === paso.orden ? { ...p, ...r.paso } : p));
    if (r.resultadoId) contexto[String(paso.orden)] = r.resultadoId;
    if (r.hecho) hechos++;
    if (r.cortar) { motivo = r.motivo || null; break; }
  }

  const estado = estadoDePlan(pasos);
  const quedan = !!siguientePaso(pasos) && estado !== 'atascado';
  await sb.from(TABLA).update({
    contexto, estado, lock_hasta: null, actualizado: ahoraIso(),
    ...(motivo ? { detalle: motivo } : {}),
  }).eq('id', plan.id);

  const fin = await leerPlan(sb, plan.id);
  return res.status(200).json({
    ok: true,
    plan: aVista(fin.plan || plan, fin.pasos || []),
    // `seguir` es «volvé a llamarme», no «terminó mal». El cliente vuelve hasta que sea `false`.
    seguir: quedan,
    hechos,
    // 🔑 `pausa` es lo que impide que el cliente martille. Quedan pasos, pero el avance se frenó por
    // algo que el tiempo arregla —Meta armando la copia, una llamada cortada— y volver enseguida
    // gasta llamadas para recibir el mismo «todavía no». Sin esta bandera, `seguir:true` es
    // indistinguible de «seguí ya», que es el bucle que fabrica el rate limit.
    ...(motivo ? { motivo, pausa: true } : {}),
  });
}

/**
 * Ejecuta un paso. **La anotación va ANTES del POST**, por el mismo motivo por el que el `idem` se
 * reserva antes: si la llamada se corta sin respuesta, el objeto puede haberse creado igual y la
 * marca es lo único con lo que se lo puede encontrar después.
 */
async function ejecutar(sb, plan, paso, contexto) {
  const sus = sustituir(paso.pedido || {}, contexto);
  if (!sus.ok) {
    // ⛔ Sin reintento manual: lo que falta no es de este paso sino del anterior, y mandarlo de
    // nuevo sin ese id daría el mismo error. Lo que hay que reintentar es el otro.
    await guardarPaso(sb, plan.id, paso.orden, {
      estado: 'fallado', puede_reintentar: false,
      detalle: `Falta el resultado del paso ${sus.faltan.join(', ')}.`,
    });
    return { paso: { estado: 'fallado' }, cortar: true, motivo: 'Un paso anterior no dejó el id que este necesita.' };
  }
  const pedido = sus.pedido;

  await guardarPaso(sb, plan.id, paso.orden, {
    estado: 'en-curso', intentos: (paso.intentos || 0) + 1, ultimo_en: ahoraIso(),
  });

  // Simulacro: arma y no escribe. Es el pre-vuelo de cualquier plan antes de gastar una escritura.
  if (plan.simulacro) {
    await guardarPaso(sb, plan.id, paso.orden, { estado: 'hecho', resultado_id: `simulacro:${paso.orden}`, detalle: 'Simulacro: no se escribió en Meta.' });
    return { paso: { estado: 'hecho' }, resultadoId: `simulacro:${paso.orden}`, hecho: true };
  }

  const r = await correr(plan, paso, pedido);

  if (r.ok) {
    await guardarPaso(sb, plan.id, paso.orden, {
      estado: 'hecho', resultado_id: r.id || null, uso: r.uso || null, detalle: r.detalle || null,
    });
    return { paso: { estado: 'hecho', resultadoId: r.id || null }, resultadoId: r.id || null, hecho: true };
  }

  // 🔴 **El corte (`status: 0`) NO es un rechazo.** Meta pudo haberlo aplicado igual. El paso queda
  // `en-curso` —que es «no sabemos»— y la próxima vuelta lo sondea o lo repite según su tipo. Marcarlo
  // fallado acá invitaría a rearmar el plan y terminar con dos objetos.
  if (r.corte) {
    await guardarPaso(sb, plan.id, paso.orden, { estado: 'en-curso', detalle: r.error || 'Se cortó antes de que Meta contestara.' });
    return {
      paso: { estado: 'en-curso' }, cortar: true,
      motivo: TIPOS_PASO[paso.tipo].crea
        ? 'Se cortó antes de que Meta contestara. Apretá Seguir: el motor va a ir a mirar si quedó hecho.'
        : 'Se cortó antes de que Meta contestara. Apretá Seguir para reintentarlo.',
    };
  }

  // Un rechazo de verdad (Meta contestó que no): el paso falla y el plan queda atascado con el
  // motivo de Meta, que es el que dice qué hay que ir a arreglar.
  //
  // 🔑 **Y se puede reintentar a mano.** Un rechazo de validación es determinístico y **no creó
  // nada**: cuando el motivo que Meta nombró se arregla afuera —tildar un emplazamiento, rearmar un
  // aviso— mandar el paso de nuevo no puede duplicar nada. Sin esto, un plan de 9 pasos con el
  // último rechazado obliga a rehacer los 8 que ya salieron.
  await guardarPaso(sb, plan.id, paso.orden, {
    estado: 'fallado', puede_reintentar: true,
    detalle: r.error || 'Meta lo rechazó.', uso: r.uso || null,
  });
  return { paso: { estado: 'fallado' }, cortar: true, motivo: `Meta rechazó el paso ${paso.orden}: ${r.error || 'sin motivo'}` };
}

/**
 * Lo que hace cada tipo de paso contra Meta. **Todo lo que el motor sabe escribir está acá.**
 *
 * Las decisiones que hacen que un plan cortado no cueste un peso:
 * - Todo nace `PAUSED`, en los tres niveles. Un corte a la mitad deja objetos pausados, no gastando.
 * - La copia es *shallow*: un POST chico, que entra en el timeout del paso. Los avisos van uno por
 *   uno reusando el `creative_id`, que además esquiva el rechazo por `degrees_of_freedom_spec`.
 * - Un paso que pone un valor absoluto se **relee y se compara**: Meta acepta cambios de presupuesto
 *   que después no aplica, y acá eso sería plata que se cree movida y no se movió.
 */
async function correr(plan, paso, pedido) {
  const marca = paso.marca || marcaDePaso(plan.marcador, paso.orden);

  if (paso.tipo === 'copiar-campania' || paso.tipo === 'copiar-conjunto') {
    const cuerpo = {
      deep_copy: 'false',
      status_option: 'PAUSED',
      // Sin hijos que renombrar: la copia es shallow, así que sólo se renombra el de arriba.
      rename_options: JSON.stringify({ rename_strategy: 'ONLY_TOP_LEVEL_RENAME', rename_suffix: marca }),
      ...(paso.tipo === 'copiar-conjunto' && pedido.campaignId ? { campaign_id: String(pedido.campaignId) } : {}),
    };
    const r = await graphPost(`${pedido.objetoId}/copies`, cuerpo, TIMEOUT_PASO_MS);
    if (!r.ok) return fallo(r);
    const d = r.data || {};
    const id = String(d.copied_campaign_id || d.copied_adset_id || d.id || '');
    // Sin id no se afirma nada: el paso queda para la sonda, que lo va a buscar por la marca.
    if (!id) return { ok: false, corte: true, error: 'Meta aceptó la copia pero no dijo cuál es.', uso: r.uso };
    return { ok: true, id, uso: r.uso };
  }

  // El conjunto se ARMA, no se fotocopia: el cuerpo es la receta que ya se validó al armar el plan.
  // ⚠️ `status`, `name` y `campaign_id` van DESPUÉS del cuerpo y pisan lo que traiga: que la copia
  // nazca pausada y con su marca son invariantes del motor, no datos del original.
  if (paso.tipo === 'crear-conjunto') {
    const r = await graphPost(`act_${pedido.cuentaId}/adsets`, {
      ...(pedido.cuerpo || {}),
      name: nombreConMarca(pedido.nombreBase, marca),
      campaign_id: String(pedido.campaignId),
      status: 'PAUSED',
    }, TIMEOUT_PASO_MS);
    if (!r.ok) return fallo(r);
    const id = String((r.data && r.data.id) || '');
    if (!id) return { ok: false, corte: true, error: 'Meta aceptó el conjunto pero no dijo cuál es.', uso: r.uso };
    return { ok: true, id, uso: r.uso };
  }

  if (paso.tipo === 'crear-aviso') {
    const r = await graphPost(`act_${pedido.cuentaId}/ads`, {
      name: nombreConMarca(pedido.nombreBase, marca),
      adset_id: String(pedido.adsetId),
      creative: JSON.stringify({ creative_id: String(pedido.creativeId) }),
      status: 'PAUSED',
    }, TIMEOUT_PASO_MS);
    if (!r.ok) return fallo(r);
    const id = String((r.data && r.data.id) || '');
    if (!id) return { ok: false, corte: true, error: 'Meta aceptó el aviso pero no dijo cuál es.', uso: r.uso };
    return { ok: true, id, uso: r.uso };
  }

  if (paso.tipo === 'presupuesto' || paso.tipo === 'nombre') {
    const campos = paso.tipo === 'presupuesto'
      ? { daily_budget: String(pedido.daily_budget) }
      : { name: String(pedido.name) };
    const r = await graphPost(String(pedido.objetoId), campos, TIMEOUT_PASO_MS);
    if (!r.ok) return fallo(r);
    // Releer y comparar: `ok` sale de acá, no del POST. Es la misma regla que en `_meta-acciones.js`
    // y acá pesa más, porque lo que sigue del plan asume que este paso quedó.
    const rel = await graph(`${pedido.objetoId}?fields=id,name,daily_budget`, 2);
    if (!rel.ok) return { ok: false, corte: true, error: 'Meta lo aceptó pero no se pudo confirmar cómo quedó.', uso: r.uso };
    const puesto = quedoPuesto(campos, rel.data || {});
    if (!puesto.ok) {
      return { ok: false, error: `Meta lo aceptó pero no lo aplicó (${puesto.faltan.join(', ')} quedó como estaba).`, uso: r.uso };
    }
    return { ok: true, id: String(pedido.objetoId), uso: r.uso };
  }

  if (paso.tipo === 'heredar-linea') {
    // El nombre se RELEE de Meta y no se copia de la entrada: el de la entrada es el del original, y
    // la copia se llama distinto (lleva la marca). Guardar el viejo dejaría la fila de la asignación
    // mintiendo sobre qué campaña es, que es justo lo que hace dudar del registro.
    const rel = await graph(`${pedido.campaignId}?fields=id,name`, 2);
    const puesta = await heredarLinea({
      campaignId: String(pedido.campaignId), linea: plan.linea, cuentaId: plan.cuenta_id, quien: plan.quien,
      nombre: String((rel.ok && rel.data && rel.data.name) || (plan.entrada && plan.entrada.nombreOriginal) || ''),
    });
    if (!puesta.ok) return { ok: false, error: 'No se pudo guardar la marca de la copia. Asignala en el Embudo.' };
    return { ok: true, id: String(pedido.campaignId) };
  }

  return { ok: false, error: `El motor no sabe hacer «${paso.tipo}».` };
}

/** Un fallo de Graph, separando el corte (no sabemos) del rechazo (Meta dijo que no). */
const fallo = (r) => ({ ok: false, corte: r.status === 0, error: mensajeError(r), uso: r.uso });

/**
 * **La sonda: ir a mirar si Meta lo hizo, SIN escribir.**
 *
 * Es lo que permite adoptar en vez de reintentar. No puede crear un segundo objeto ni aunque se la
 * llame cien veces: sólo lista y compara nombres contra la marca del paso.
 *
 * 🔑 **«No la encontré» NO es «no se creó».** Ese caso deja el paso `dudoso` y vuelve más tarde, en
 * vez de darlo por fallado — que es lo que invitaría a rearmar el plan y terminar con dos objetos.
 * ⛔ **Más de un candidato NUNCA se elige**: se atasca y se dice cuántos aparecieron.
 */
async function sondar(sb, plan, paso, contexto) {
  const def = TIPOS_PASO[paso.tipo] || {};
  if (!def.crea) {
    // Un paso reintentable no se sondea: se repite. No debería llegar acá.
    return { paso: {}, cortar: true, motivo: 'Ese paso no se sondea.' };
  }
  const sus = sustituir(paso.pedido || {}, contexto);
  if (!sus.ok) return { paso: {}, cortar: true, motivo: 'No se puede sondear sin el id del paso anterior.' };
  const pedido = sus.pedido;
  const marca = paso.marca || marcaDePaso(plan.marcador, paso.orden);

  const donde = def.sondaEn === 'cuenta' ? `act_${plan.cuenta_id}/campaigns`
    : def.sondaEn === 'campania' ? `${pedido.campaignId}/adsets`
      : `${pedido.adsetId}/ads`;

  const hijos = await insightsTodas(`${donde}?fields=id,name&limit=200`);
  if (!hijos.ok) {
    return { paso: {}, cortar: true, motivo: `No se pudo mirar en Meta si el paso ${paso.orden} quedó hecho (${hijos.error}).` };
  }
  const candidatos = hijos.rows.filter((h) => String(h.name || '').includes(marca));

  if (!candidatos.length) {
    await guardarPaso(sb, plan.id, paso.orden, { estado: 'dudoso', ultimo_en: ahoraIso(), detalle: `Todavía no aparece nada llamado «${marca}».` });
    return {
      paso: { estado: 'dudoso' }, cortar: true,
      motivo: `Todavía no aparece lo del paso ${paso.orden}. Puede que Meta lo esté armando: apretá Seguir en un momento.`,
    };
  }
  if (candidatos.length > 1) {
    // ⛔ **Sin reintento manual, y es el único caso que lo prohíbe de plano.** No se sabe cuál de los
    // que aparecieron es el bueno, así que mandarlo de nuevo agregaría un tercero al problema.
    await guardarPaso(sb, plan.id, paso.orden, {
      estado: 'fallado', puede_reintentar: false,
      detalle: `Aparecieron ${candidatos.length} con la marca «${marca}».`,
    });
    return {
      paso: { estado: 'fallado' }, cortar: true,
      motivo: `Aparecieron ${candidatos.length} objetos con la marca «${marca}». Mirá en Ads Manager cuál dejar antes de seguir.`,
    };
  }

  const id = String(candidatos[0].id);
  await guardarPaso(sb, plan.id, paso.orden, {
    estado: 'hecho', resultado_id: id,
    // Queda dicho en la fila que se cerró mirando, no contestando.
    detalle: `Se cortó la llamada y se encontró después por su marca («${marca}»).`,
  });
  return { paso: { estado: 'hecho', resultadoId: id }, resultadoId: id, hecho: true };
}

async function guardarPaso(sb, planId, orden, campos) {
  try {
    await sb.from(TABLA_PASO).update(campos).eq('plan_id', planId).eq('orden', orden);
  } catch { /* la falla del log no tumba el paso: lo que importa es lo que pasó en Meta */ }
}

/**
 * La fila de `meta_ads_campania_linea` para la campaña nueva. Es lo que la hace accionable desde el
 * monitor: sin ella cae en el 409 de «esta campaña todavía no tiene marca», y ni siquiera quien la
 * creó puede tocarla.
 */
async function heredarLinea({ campaignId, linea, cuentaId, nombre, quien }) {
  const sb = clienteBdi();
  if (!sb) return { ok: false };
  try {
    const { error } = await sb.from('meta_ads_campania_linea').upsert([{
      campaign_id: campaignId, linea, cuenta_id: cuentaId || '', nombre, objetivo: null,
      linea_previa: null, por: quien, updated_at: ahoraIso(),
    }], { onConflict: 'campaign_id' });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

// ── Reintentar un paso fallado ────────────────────────────────────────────────────────────────

/**
 * **«Ya arreglé lo que Meta pedía, mandalo de nuevo.»**
 *
 * Deja el paso `pendiente` con los intentos en cero y el plan vuelve a estar vivo. Lo que ya salió
 * **no se rehace**: el plan sigue desde donde quedó, que es la mitad del punto de tener pasos.
 *
 * # Por qué esto no puede duplicar nada
 *
 * Porque sólo alcanza a los pasos marcados `puede_reintentar`, y esa marca se pone **únicamente
 * cuando Meta contestó que NO**: un rechazo de validación es determinístico y no creó nada. El corte
 * sin respuesta —el único caso donde el objeto puede existir igual— no llega nunca acá: ese deja el
 * paso `en-curso` y lo resuelve la sonda, que lee y adopta.
 *
 * ⛔ El paso que murió por ambigüedad (dos objetos con la misma marca) queda **afuera a propósito**:
 * ahí no se sabe cuál es el bueno y mandarlo de nuevo agregaría un tercero.
 *
 * ⚠️ **Es siempre una persona la que lo pide.** El motor no reintenta un `fallado` por su cuenta —si
 * lo hiciera, un rechazo permanente sería un bucle— y por eso los intentos se ponen en cero: quien
 * aprieta ya sabe que el de antes falló.
 */
async function reintentar(res, perfil, b) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const id = parseInt(b.id, 10);
  const orden = parseInt(b.orden, 10);
  if (!Number.isFinite(id) || !Number.isFinite(orden)) {
    return res.status(400).json({ error: 'Falta decir qué plan y qué paso reintentar.' });
  }

  const leido = await leerPlan(sb, id);
  if (leido.error) return res.status(leido.status || 502).json({ error: leido.error });
  const permiso = permitePlan(perfil, leido.plan.tipo, leido.plan.linea);
  if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.error });
  if (leido.plan.estado === 'cancelado') return res.status(409).json({ error: 'Ese plan está cancelado.' });

  const paso = leido.pasos.find((p) => p.orden === orden);
  if (!paso) return res.status(404).json({ error: 'Ese plan no tiene ese paso.' });
  if (paso.estado !== 'fallado') return res.status(409).json({ error: 'Ese paso no está fallado, así que no hay nada que reintentar.' });
  if (!paso.puede_reintentar) {
    return res.status(409).json({
      error: 'Ese paso no se puede volver a mandar desde acá: hay que mirar en Ads Manager cómo quedó antes de tocar nada.',
    });
  }

  await sb.from(TABLA_PASO)
    .update({ estado: 'pendiente', intentos: 0, detalle: `Lo mandó de nuevo ${quienEs(perfil)} después de un rechazo de Meta.` })
    .eq('plan_id', id).eq('orden', orden);
  await sb.from(TABLA).update({ estado: 'en-curso', detalle: null, lock_hasta: null, actualizado: ahoraIso() }).eq('id', id);

  const fin = await leerPlan(sb, id);
  return res.status(200).json({ ok: true, plan: aVista(fin.plan || leido.plan, fin.pasos || leido.pasos) });
}

// ── Cancelar ──────────────────────────────────────────────────────────────────────────────────

/**
 * Cancelar **no deshace**: deja de avanzar.
 *
 * Es una diferencia que la pantalla tiene que decir con todas las letras. Lo que el plan ya creó
 * sigue en Meta —pausado, porque todo nace PAUSED— y lo que ya movió de presupuesto sigue movido.
 * Un «cancelar» que prometiera rollback sería la mentira más cara de esta sección: Meta no tiene
 * transacciones y fingirlas es peor que no tenerlas.
 */
async function cancelar(res, perfil, b) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const id = parseInt(b.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Falta el id del plan.' });

  const leido = await leerPlan(sb, id);
  if (leido.error) return res.status(leido.status || 502).json({ error: leido.error });
  const permiso = permitePlan(perfil, leido.plan.tipo, leido.plan.linea);
  if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.error });
  if (leido.plan.estado === 'hecho') return res.status(409).json({ error: 'Ese plan ya terminó: no hay nada que cancelar.' });

  const hechos = leido.pasos.filter((p) => p.estado === 'hecho').length;
  await sb.from(TABLA).update({
    estado: 'cancelado', lock_hasta: null, actualizado: ahoraIso(),
    detalle: hechos
      ? `Cancelado por ${quienEs(perfil)} con ${hechos} paso(s) ya hechos: lo que se creó sigue en Meta, pausado.`
      : `Cancelado por ${quienEs(perfil)} antes de tocar nada.`,
  }).eq('id', id);

  const fin = await leerPlan(sb, id);
  return res.status(200).json({ ok: true, plan: aVista(fin.plan || leido.plan, fin.pasos || leido.pasos), hechosAntes: hechos });
}
