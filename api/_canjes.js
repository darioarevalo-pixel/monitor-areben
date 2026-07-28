// Canjes con influencers y creadoras — handler del panel (ver sql/migrate-canjes.sql).
//
// ⚠️⚠️ ESTE HANDLER HABLA CON UNA SOLA BASE: LA DE **BDI**, SIEMPRE, PARA LAS TRES MARCAS. ⚠️⚠️
//
// Va contra la intuición del resto del monitor, donde `cfgFor(store)` rutea a la base de cada
// marca (`api/_reclamos.js:46`). Acá NO: el módulo entero vive en la base de BDI porque
// `canje_personas` es un padrón ÚNICO compartido. La misma creadora trabaja para BDI y para
// Zattia, y "¿hace cuánto no hacemos una acción con ella?" tiene que tener UNA respuesta, no dos.
// De qué marca es cada canje lo dice la columna `store` de `canjes`.
//
// Ventaja lateral confirmada: en `.env` hay `SUPABASE_SERVICE_KEY` (BDI) pero NO existe
// `ZATTIA_SUPABASE_SERVICE_KEY` — Zattia escribe hoy con la anon key. Escribiendo sólo contra la
// maestra de BDI el tema se esquiva por completo.
//
// Lo que se pierde, sin maquillar: la base de BDI guarda datos de Zattia, y si ese proyecto cae se
// cae Canjes de las tres marcas. Con decenas de canjes por mes el impacto es "hoy no cargo un
// canje", no "se para la venta".
//
//   GET  ?recurso=canjes&store=bdi|zattia|stunned                → personas + canjes visibles.
//   GET  ?recurso=canjes&vista=persona&id=N&store=...            → la ficha, con su historial cruzado.
//   GET  ?recurso=canjes&vista=config&store=...                  → la config de la marca.
//   POST { action:'persona-crear', instagram, ... }              → alta por @; si existe, la devuelve.
//   POST { action:'persona-editar', id, ...campos }              → edita la ficha.
//   POST { action:'persona-nota', id, texto }                    → apila una nota (con id propio).
//   POST { action:'persona-nota-borrar', id, nota_id }           → borra POR ID, nunca por índice.
//   POST { action:'persona-archivo', id, url, nombre, tipo }     → suma un archivo a la ficha.
//   POST { action:'persona-archivo-borrar', id, url }            → lo saca.
//   POST { action:'config', store, ...campos }                   → edita la config. ADMIN.
//
//   GET  ?recurso=canjes&vista=canje&id=N&store=...              → el canje con items, entregables y evidencias.
//   POST { action:'canje-crear', persona_id, tipo, tope… }       → nace en 'borrador'.
//   POST { action:'canje-editar', id, ...campos }                → sólo antes del acuerdo.
//   POST { action:'canje-estado', id, estado, motivo? }          → transiciones validadas por TRANSICIONES.
//   POST { action:'canje-aprobar', id }                          → exige el sub que corresponda. Genera el token.
//   POST { action:'canje-rechazar', id, motivo }                 → ídem, con motivo obligatorio.
//   POST { action:'item-agregar', id, ...datos }                 → snapshot del producto, con control del tope.
//   POST { action:'item-quitar', id, item_id, motivo }           → NO borra: marca 'quitado'.
//   POST { action:'compra', id, tn_orden, gn_venta_number? }     → la orden creada a mano en TN.
//   POST { action:'envio', id, via, seguimiento, costo }         → despacho.
//   POST { action:'entregado', id }                              → CONGELA los `vence_el`.
//   POST { action:'entregable-agregar'|'entregable-quitar', … }  → lo que prometió publicar.
//   POST { action:'evidencia-agregar', id, entregable_id, … }    → la carga el EQUIPO, no ella.
//   POST { action:'evidencia-verificar', id, evidencia_id, ok }  → sin verificar, no cuenta.
//   POST { action:'cerrar', id, incompleto?, motivo? }           → congela el balance. `incompleto` exige el sub `cerrar`.
//   POST { action:'no-conservado', id, motivo }                  → devolvió o vendió lo que le mandamos.
//
// Las tres marcas son válidas como `store`, a diferencia del resto del monitor donde son dos.
// Stunned no es marca de primera clase en el código (es una línea de Zattia por prefijo de SKU
// `STU`) pero desde el lado del canje se comporta como una: tiene su Instagram, sus acuerdos y su
// balance.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

/**
 * La base maestra. NO recibe `store` a propósito: no hay a dónde rutear. Si algún día se separa
 * por marca, este es el único lugar que cambia (más `scripts/apply-canjes.mjs`).
 */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

const STORES = ['bdi', 'zattia', 'stunned'];

/**
 * Espejo de `normalizarInstagram` en `lib/canjes/instagram.ts`. Los `api/*.js` no importan TS, así
 * que la deuda de espejo es inevitable (la misma que ya tiene `numeroReclamo`).
 *
 * ⚠️ ESTA es la versión que decide el `unique` de la base. Si diverge de la de TS se crean
 * duplicados en silencio: la UI cree que es la misma persona y el insert crea otra fila.
 * `tests/canjes-core.test.ts` compara las dos contra los mismos casos.
 */
function normalizarInstagram(v) {
  let s = String(v ?? '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (/^(instagram\.com|instagr\.am)\//i.test(s)) {
    s = s.replace(/^(instagram\.com|instagr\.am)\//i, '');
  }
  s = s.split('?')[0].split('#')[0];
  s = s.split('/')[0];
  s = s.replace(/^@+/, '').trim().toLowerCase();
  s = s.replace(/[^a-z0-9._]/g, '');
  s = s.replace(/\.+$/, '');
  return s;
}

/** Espejo de `numeroCanje` en `lib/canjes/tipos.ts`. Mismo formato o los números no coinciden. */
function numeroCanje(id) {
  return 'C-' + String(id).padStart(4, '0');
}

const PERSONA_COLS = `id, instagram, instagram_raw, nombre, apellido, telefono, email, tiktok, ciudad,
  dni, calle, numero, piso, depto, cp, provincia, localidad, direccion_nota,
  talles, modelo_celular, seguidores_ig, seguidores_tt, seguidores_at,
  destacada, destacada_nota, vetada, vetada_motivo, cadencia_dias,
  notas, archivos, historial, usuario, created_at, updated_at`.replace(/\s+/g, ' ');

/**
 * Las columnas de un canje que se pueden ver **de la propia marca**. El `token` NUNCA sale en
 * listados: es la llave del link público, se pide aparte y de a uno.
 */
const CANJE_COLS = `id, persona_id, store, tipo, estado, titulo, nota,
  tope_tipo, tope_pvp, tope_unidades, monto_plata, pago_estado, pago_at, pago_nota,
  aprobado_por, aprobado_at, aprobacion_nivel, rechazado_motivo, rechazado_por, rechazado_at, acordado_at,
  token_vence, datos_confirmados_at,
  tn_orden, compra_estado, compra_at, compra_por, gn_venta_number, stock_estado,
  envio_via, envio_seguimiento, envio_costo, envio_estado, envio_at, envio_direccion,
  aviso_estado, aviso_at, entregado_at, cupon_codigo, cupon_desde, cupon_hasta,
  balance_costo_productos, balance_costo_envio, balance_costo_plata, balance_costo_total,
  balance_alcance, balance_interacciones, balance_cpm, balance_puntaje_manual, balance_nota,
  cerrado_incompleto, cierre_motivo, cerrado_por, cerrado_at,
  producto_no_conservado, producto_no_conservado_motivo, producto_no_conservado_por, producto_no_conservado_at,
  cancelado_motivo, usuario, historial, created_at, updated_at`.replace(/\s+/g, ' ');

/**
 * Lo que se ve de un canje **de otra marca**: marca, fecha y si está cerrado. Nada más.
 *
 * Es el corazón de la decisión de permisos: quien sólo ve Zattia SÍ se entera de que la persona
 * hizo algo para BDI, pero en modo ciego. Ocultar la *existencia* destruiría la única razón por la
 * que el padrón es compartido; ocultar la *plata* no cuesta nada.
 *
 * ⚠️ Se arma **en el servidor**, nunca filtrando en la UI: la plata de la otra marca no viaja al
 * browser. Espejo conceptual de `paraElCliente()` en `api/_reclamo.js`.
 *
 * Exportada para que `tests/canjes-core.test.ts` verifique que no se le escapa ningún campo de
 * plata el día que alguien agregue una columna nueva.
 */
export function resumenCiego(c) {
  return {
    id: c.id,
    numero: numeroCanje(c.id),
    persona_id: c.persona_id,
    store: c.store,
    estado: c.estado,
    acordado_at: c.acordado_at || null,
    entregado_at: c.entregado_at || null,
    cerrado_at: c.cerrado_at || null,
    created_at: c.created_at,
    /** La marca de agua: la UI lo usa para pintarlo gris y no dejar abrirlo. */
    ciego: true,
  };
}

/** Las columnas mínimas que necesita `resumenCiego`. Pedir menos es pedir menos plata al aire. */
const CANJE_COLS_CIEGO = 'id, persona_id, store, estado, acordado_at, entregado_at, cerrado_at, created_at';

/** ¿Puede tocar la config del módulo? Admin o administración, mismo molde que `api/_reclamos.js:87`. */
function esAdministracion(perfil) {
  if (!perfil) return false;
  if (perfil.admin === true) return true;
  const fs = Array.isArray(perfil.funcion) ? perfil.funcion : [];
  return fs.includes('administracion');
}

/**
 * Qué marcas puede ver este perfil. Es lo que decide qué canjes vienen enteros y cuáles ciegos.
 *
 * Stunned viaja con Zattia: quien ve Zattia ve Stunned, porque es una línea de esa misma marca —
 * el mismo criterio que usa `api/sku-map.js` para rutear sus costos.
 */
function marcasVisibles(perfil) {
  if (!perfil) return [];
  if (perfil.admin === true) return [...STORES];
  const cuentas = Array.isArray(perfil.cuenta) ? perfil.cuenta : [perfil.cuenta].filter(Boolean);
  const out = new Set();
  for (const c of cuentas) {
    if (c === 'bdi') out.add('bdi');
    if (c === 'zattia') { out.add('zattia'); out.add('stunned'); }
  }
  return STORES.filter((s) => out.has(s));
}

// ── ESPEJOS DE `lib/canjes/tipos.ts` ────────────────────────────────────────────
//
// Los `api/*.js` no importan TS, así que lo que el servidor tiene que hacer cumplir vive dos
// veces. Es la misma deuda que ya tiene `numeroReclamo`, y se acota con la regla de
// `api/_reclamos.js`: **acá se replica sólo lo que es un CONTROL, nunca un CÁLCULO.**
//
// - Se replica: el grafo de estados, quién firma, el tope y el bloqueo por vencidos. Son gates de
//   seguridad, y un gate que sólo existe en el browser no es un gate.
// - NO se replica: el balance. El cálculo vive en UN solo lugar (`calcularBalance` en TS, con
//   tests) y acá sólo se validan rangos. Duplicar aritmética fue exactamente lo que se
//   desincronizó con el motor viejo de Cambios.
//
// `tests/canjes-flujo.test.ts` compara los dos lados contra los mismos casos.

/** Espejo de `TRANSICIONES`. `cancelado` no figura: se llega desde cualquier no-terminal. */
const TRANSICIONES = {
  borrador: ['propuesta'],
  propuesta: ['acuerdo', 'rechazado'],
  rechazado: [],
  acuerdo: ['preparando'],
  preparando: ['en_curso'],
  en_curso: ['cerrado'],
  cerrado: [],
  cancelado: [],
};
const ESTADOS = Object.keys(TRANSICIONES);
const TERMINALES = ['rechazado', 'cerrado', 'cancelado'];

/** Espejo de `puedeIr`. */
function puedeIr(desde, hasta) {
  if (hasta === 'cancelado') return !TERMINALES.includes(desde);
  return (TRANSICIONES[desde] || []).includes(hasta);
}

/**
 * De qué marca del monitor cuelgan los permisos de esta `store`.
 *
 * Stunned **no existe** en `perfil.acceso`: es una línea de Zattia, no una marca del monitor. Sin
 * esta traducción, tildarle a alguien `canjes.aprobar` en Zattia no le serviría para un canje de
 * Stunned y el permiso parecería roto.
 */
function marcaDePermisos(store) {
  return store === 'bdi' ? 'bdi' : 'zattia';
}

/**
 * Espejo de `puedeSub(perfil, marca, 'canjes', sub)`.
 *
 * ⚠️ Un sub **no se hereda de la función**: `ACCESO_POR_FUNCION` expande áreas a claves de sección
 * (`canjes`), nunca a subclaves (`canjes.aprobar`). O sea que sólo lo tiene el admin o quien lo
 * tenga tildado a mano en Config. Es el paso de puesta en marcha que más fácil se olvida, y sin él
 * ningún canje se puede aprobar nunca.
 */
function puedeSubCanjes(perfil, store, sub) {
  if (!perfil) return false;
  if (perfil.admin === true) return true;
  const marca = marcaDePermisos(store);
  const acc = (perfil.acceso || {})[marca] || {};
  // La excepción negativa (`'-canjes.aprobar'`) gana sobre el tilde, igual que en `estaExcluido`.
  if (acc[`-canjes.${sub}`]) return false;
  return acc[`canjes.${sub}`] === true;
}

/**
 * Espejo de `quienApruebaCanje`. Devuelve el sub que hace falta para firmar ESTE canje.
 *
 * El umbral entra por la config, no es una constante, y `null` significa **todo va a la firma
 * alta** — el default seguro mientras el monto no esté definido.
 */
function subQueApruebe(canje, items, cfg) {
  if (canje.tipo === 'producto_plata') return 'aprobar-plata';
  const umbral = cfg?.umbral_aprobacion_alta;
  if (umbral == null) return 'aprobar-plata';
  const vivos = (items || []).filter((i) => i.estado === 'propuesto' || i.estado === 'confirmado');
  let costo = null;
  if (vivos.length) {
    costo = vivos.reduce((a, i) => a + (Number(i.costo_unit) || 0) * (Number(i.cantidad) || 0), 0);
  } else if (canje.tope_tipo === 'monto' && canje.tope_pvp != null) {
    costo = Number(canje.tope_pvp) * (Number(cfg?.factor_costo_estimado) || 0);
  }
  // No estimable ⇒ firma alta. Prefiero molestar a un gerente que dejar pasar un canje caro.
  if (costo == null) return 'aprobar-plata';
  return costo > Number(umbral) ? 'aprobar-plata' : 'aprobar';
}

/**
 * Espejo de `controlDelTope`. Devuelve `null` si entra, o el motivo en criollo si se pasa.
 *
 * El control es **duro** en los dos modos: sobre la suma de PVP, o sobre el TOTAL de unidades.
 * Sobre el *detalle* de las unidades (que sean un jean y no otra remera) es blando a propósito:
 * la categoría de GN no es lo bastante prolija para colgar de ahí un bloqueo.
 */
function seVaDelTope(canje, items) {
  const vivos = (items || []).filter((i) => i.estado === 'propuesto' || i.estado === 'confirmado');
  if (canje.tope_tipo === 'unidades') {
    const tope = (canje.tope_unidades || []).reduce((a, u) => a + (Number(u.cantidad) || 0), 0);
    if (!tope) return null;
    const usado = vivos.reduce((a, i) => a + (Number(i.cantidad) || 0), 0);
    return usado > tope
      ? `Se pasa del acuerdo: ${usado} ${usado === 1 ? 'unidad' : 'unidades'} contra las ${tope} acordadas.`
      : null;
  }
  if (canje.tope_pvp == null) return null;
  const usado = vivos.reduce((a, i) => a + (Number(i.pvp_unit) || 0) * (Number(i.cantidad) || 0), 0);
  const tope = Number(canje.tope_pvp);
  return usado > tope
    ? `Se pasa del tope: $${usado.toLocaleString('es-AR')} contra los $${tope.toLocaleString('es-AR')} acordados.`
    : null;
}

/** `YYYY-MM-DD` local. Espejo de `fechaISO`: en UTC un canje de la tarde vencería un día antes. */
function fechaISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const num = (v) => (v == null || v === '' ? null : Number(v));
const texto = (v) => (v == null || v === '' ? null : String(v));
const bool = (v) => v === true || v === 'true';

/**
 * Cuántos días vive el link del portal. Más largo que el de un reclamo (15) porque un canje tarda:
 * entre que se acuerda y se despacha pasan días, y el link tiene que seguir sirviendo.
 */
const DIAS_TOKEN = 45;

const TIPOS_ENTREGABLE = ['historia_ig', 'reel_ig', 'post_ig', 'video_tiktok', 'contenido'];
const VIAS_ENVIO = ['correo', 'andreani', 'cadete', 'presencial'];
const PENDIENTES = ['pendiente', 'hecho', 'no_aplica'];
const TIPOS_CANJE = ['producto', 'producto_plata'];
const TOPE_TIPOS = ['monto', 'unidades'];

/**
 * Historial append-only: se re-lee la fila, se apila el evento y se guarda. Copiado de
 * `api/_reclamos.js:102` con su misma advertencia: **no es atómico**. Dos acciones simultáneas
 * sobre la MISMA persona no pasan en la práctica (la carga la hace una persona por vez), y el
 * costo de una transacción real no se justifica para un log.
 */
async function apilar(supabase, tabla, id, evento, extra = {}) {
  const { data: previo } = await supabase.from(tabla).select('historial').eq('id', id).single();
  const historial = Array.isArray(previo?.historial) ? previo.historial : [];
  historial.push(evento);
  const { error } = await supabase.from(tabla).update({ ...extra, historial, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // El `store` acá no elige base: elige qué canjes vienen enteros y cuáles ciegos, y qué fila de
  // `canje_config` se lee.
  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!STORES.includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi, zattia o stunned)' });

  const visibles = marcasVisibles(perfil);
  if (!visibles.includes(store)) {
    return res.status(403).json({ error: 'No tenés acceso a esa marca.' });
  }

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase (base maestra BDI).' });
  const supabase = createClient(cfg.url, cfg.key);
  const usuario = perfil.name || null;
  const ahora = () => new Date().toISOString();

  /** Los canjes de una persona, enteros los de las marcas que ve y ciegos los demás. */
  async function canjesDePersona(personaId) {
    const [propios, ajenos] = await Promise.all([
      supabase.from('canjes').select(CANJE_COLS).eq('persona_id', personaId).in('store', visibles).order('created_at', { ascending: false }),
      supabase.from('canjes').select(CANJE_COLS_CIEGO).eq('persona_id', personaId).not('store', 'in', `(${visibles.join(',')})`).order('created_at', { ascending: false }),
    ]);
    if (propios.error) throw new Error(propios.error.message);
    if (ajenos.error) throw new Error(ajenos.error.message);
    return [
      ...(propios.data || []).map((c) => ({ ...c, numero: numeroCanje(c.id) })),
      ...(ajenos.data || []).map(resumenCiego),
    ];
  }

  /** La config de una marca, con los defaults si la fila no está (no debería, pero no se asume). */
  async function configDe(st) {
    const { data } = await supabase.from('canje_config').select('*').eq('store', st).maybeSingle();
    return data || {
      store: st, umbral_aprobacion_alta: null, cadencia_dias_default: 90,
      plazo_entregable_dias_default: 10, tope_evidencias_por_canje: 30, factor_costo_estimado: 0.4,
      bloquear_por_vencidos: false, cierres_incompletos_no_repetir: 2, drive_url: null,
    };
  }

  /**
   * Trae el canje y **verifica que sea de una marca que este perfil ve**.
   *
   * Es el gate que impide que alguien de Zattia toque un canje de BDI mandando el id a mano. Sin
   * esto el modo ciego sería sólo cosmético: se vería poco, pero se podría escribir igual.
   */
  async function traerCanje(id) {
    const { data, error } = await supabase.from('canjes').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { error: res.status(404).json({ error: 'no existe ese canje' }) };
    if (!visibles.includes(data.store)) {
      return { error: res.status(403).json({ error: 'Ese canje es de otra marca.' }) };
    }
    return { canje: data };
  }

  const itemsDe = async (id) => (await supabase.from('canje_items').select('*').eq('canje_id', id)).data || [];
  const entregablesDe = async (id) => (await supabase.from('canje_entregables').select('*').eq('canje_id', id)).data || [];
  const evidenciasDe = async (id) => (await supabase.from('canje_evidencias').select('*').eq('canje_id', id)).data || [];

  try {
    if (req.method === 'GET') {
      const vista = String(req.query.vista || 'lista');

      if (vista === 'config') {
        const { data, error } = await supabase.from('canje_config').select('*').eq('store', store).maybeSingle();
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, config: data || null });
      }

      if (vista === 'persona') {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { data, error } = await supabase.from('canje_personas').select(PERSONA_COLS).eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return res.status(404).json({ error: 'no existe esa persona' });
        return res.status(200).json({ ok: true, persona: data, canjes: await canjesDePersona(id) });
      }

      // El canje entero: la ficha necesita las cuatro tablas a la vez y pedirlas de a una sería
      // cuatro round-trips por click.
      if (vista === 'canje') {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: 'falta id' });
        const t = await traerCanje(id);
        if (t.error) return t.error;
        const [items, entregables, evidencias, persona] = await Promise.all([
          itemsDe(id), entregablesDe(id), evidenciasDe(id),
          supabase.from('canje_personas').select(PERSONA_COLS).eq('id', t.canje.persona_id).maybeSingle(),
        ]);
        // El token NO viaja en el objeto del canje: se pide aparte con `vista=token`, de a uno.
        const { token, ...sinToken } = t.canje; // eslint-disable-line no-unused-vars
        return res.status(200).json({
          ok: true,
          canje: { ...sinToken, numero: numeroCanje(id) },
          items, entregables, evidencias,
          persona: persona.data || null,
          config: await configDe(t.canje.store),
        });
      }

      // El link del portal, de a uno y a pedido. Mismo criterio que el token de un reclamo: no
      // sale nunca en un listado, porque un listado se loguea, se cachea y se comparte.
      if (vista === 'token') {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: 'falta id' });
        const t = await traerCanje(id);
        if (t.error) return t.error;
        return res.status(200).json({ ok: true, token: t.canje.token || null, vence: t.canje.token_vence || null });
      }

      // La lista: el padrón entero (es transversal, no se filtra por marca) más, de cada persona,
      // las fechas que necesita "hace cuánto no hacemos nada con ella" — cruzando marcas, que es
      // justamente el punto. Los de otras marcas van ciegos.
      const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
      const { data: personas, error } = await supabase
        .from('canje_personas').select(PERSONA_COLS).order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);

      const [propios, ajenos] = await Promise.all([
        supabase.from('canjes').select(CANJE_COLS).in('store', visibles).order('created_at', { ascending: false }),
        supabase.from('canjes').select(CANJE_COLS_CIEGO).not('store', 'in', `(${visibles.join(',')})`).order('created_at', { ascending: false }),
      ]);
      if (propios.error) throw new Error(propios.error.message);
      if (ajenos.error) throw new Error(ajenos.error.message);

      const { data: config } = await supabase.from('canje_config').select('*').eq('store', store).maybeSingle();

      return res.status(200).json({
        ok: true,
        personas: personas || [],
        canjes: [
          ...(propios.data || []).map((c) => ({ ...c, numero: numeroCanje(c.id) })),
          ...(ajenos.data || []).map(resumenCiego),
        ],
        // El resumen de lo vencido viaja con el listado a propósito: el aviso del sidebar lo
        // necesita, y sin esto habría que pedir los entregables de cada canje en cada refresco de
        // los avisos — una consulta por canje, cada tres minutos, para pintar un número.
        vencidos: await resumenDeVencidos(propios.data || []),
        config: config || null,
        marcasVisibles: visibles,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = b.action || '';

    // ── Alta de persona ───────────────────────────────────────────────────────
    // Un solo campo: el @. Que dar de alta cueste un renglón es lo que hace que el padrón se llene;
    // pedirle diez campos al operador es lo que hace que siga en la planilla.
    if (action === 'persona-crear') {
      const instagram = normalizarInstagram(b.instagram);
      if (!instagram) return res.status(400).json({ error: 'falta el Instagram (es el único dato obligatorio)' });

      // Si ya existe se devuelve la que hay, con `existia: true`, y la UI abre esa ficha en vez de
      // tirar un error. Es el caso normal, no el excepcional: la misma creadora vuelve.
      const { data: previa, error: eBusca } = await supabase
        .from('canje_personas').select(PERSONA_COLS).eq('instagram', instagram).maybeSingle();
      if (eBusca) throw new Error(eBusca.message);
      if (previa) return res.status(200).json({ ok: true, persona: previa, existia: true });

      const row = {
        instagram,
        instagram_raw: texto(b.instagram_raw || b.instagram),
        nombre: texto(b.nombre),
        apellido: texto(b.apellido),
        telefono: texto(b.telefono),
        email: texto(b.email),
        tiktok: texto(b.tiktok),
        ciudad: texto(b.ciudad),
        cadencia_dias: num(b.cadencia_dias) || 90,
        usuario,
        historial: [{ at: ahora(), usuario, nota: 'ficha creada' }],
      };
      const { data, error } = await supabase.from('canje_personas').insert(row).select(PERSONA_COLS).single();
      if (error) {
        // Carrera con otro operador dando de alta el mismo @ al mismo tiempo: el unique de la base
        // es la última palabra, y devolver la fila que ganó es mejor que un 500.
        if (/duplicate key|unique/i.test(error.message)) {
          const { data: gano } = await supabase.from('canje_personas').select(PERSONA_COLS).eq('instagram', instagram).maybeSingle();
          if (gano) return res.status(200).json({ ok: true, persona: gano, existia: true });
        }
        throw new Error(error.message);
      }
      return res.status(200).json({ ok: true, persona: data, existia: false });
    }

    const id = parseInt(b.id, 10);

    if (action === 'persona-editar') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const campos = {};

      // Cambiar el @ es re-identificar a la persona: se normaliza igual que en el alta, y el unique
      // de la base sigue siendo el que manda.
      if (b.instagram !== undefined) {
        const ig = normalizarInstagram(b.instagram);
        if (!ig) return res.status(400).json({ error: 'el Instagram no puede quedar vacío' });
        campos.instagram = ig;
        campos.instagram_raw = texto(b.instagram_raw || b.instagram);
      }

      for (const k of ['nombre', 'apellido', 'telefono', 'email', 'tiktok', 'ciudad',
        'dni', 'calle', 'numero', 'piso', 'depto', 'cp', 'provincia', 'localidad', 'direccion_nota',
        'modelo_celular', 'destacada_nota', 'vetada_motivo']) {
        if (b[k] !== undefined) campos[k] = texto(b[k]);
      }
      for (const k of ['seguidores_ig', 'seguidores_tt']) {
        if (b[k] !== undefined) campos[k] = num(b[k]);
      }
      // El número de seguidores sin fecha miente. Se estampa al guardarlo, no se pide aparte.
      if (b.seguidores_ig !== undefined || b.seguidores_tt !== undefined) campos.seguidores_at = ahora();

      if (b.talles !== undefined) campos.talles = (b.talles && typeof b.talles === 'object') ? b.talles : {};
      if (b.cadencia_dias !== undefined) campos.cadencia_dias = num(b.cadencia_dias) || 90;
      if (b.destacada !== undefined) campos.destacada = bool(b.destacada);
      if (b.vetada !== undefined) {
        campos.vetada = bool(b.vetada);
        // Vetar sin motivo es dejarle el problema al que la encuentre en tres meses.
        if (campos.vetada && !texto(b.vetada_motivo) && !campos.vetada_motivo) {
          return res.status(400).json({ error: 'para vetar hace falta un motivo' });
        }
      }

      if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });

      const { error } = await supabase.from('canje_personas')
        .update({ ...campos, updated_at: ahora() }).eq('id', id);
      if (error) {
        if (/duplicate key|unique/i.test(error.message)) {
          return res.status(409).json({ error: 'Ya hay otra ficha con ese Instagram.' });
        }
        throw new Error(error.message);
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'persona-nota') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const t = texto(b.texto);
      if (!t) return res.status(400).json({ error: 'la nota está vacía' });
      const { data: previo, error: eLee } = await supabase.from('canje_personas').select('notas').eq('id', id).single();
      if (eLee) throw new Error(eLee.message);
      const notas = Array.isArray(previo?.notas) ? previo.notas : [];
      // El id propio es la razón de ser de este formato. Ver `persona-nota-borrar`.
      notas.push({ id: randomUUID(), texto: t, at: ahora(), usuario });
      const { error } = await supabase.from('canje_personas').update({ notas, updated_at: ahora() }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, notas });
    }

    if (action === 'persona-nota-borrar') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const notaId = texto(b.nota_id);
      if (!notaId) return res.status(400).json({ error: 'falta nota_id' });
      const { data: previo, error: eLee } = await supabase.from('canje_personas').select('notas').eq('id', id).single();
      if (eLee) throw new Error(eLee.message);
      const notas = Array.isArray(previo?.notas) ? previo.notas : [];
      // ⚠️ Se borra POR ID, nunca por índice. `lib/crm/leads.ts` borra por índice posicional y ya
      // borró la nota equivocada cuando la lista se había reordenado entre el render y el click.
      const quedan = notas.filter((n) => n && n.id !== notaId);
      if (quedan.length === notas.length) return res.status(404).json({ error: 'esa nota ya no está' });
      const { error } = await supabase.from('canje_personas').update({ notas: quedan, updated_at: ahora() }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, notas: quedan });
    }

    if (action === 'persona-archivo') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const url = texto(b.url);
      if (!url) return res.status(400).json({ error: 'falta la url del archivo' });
      const { data: previo, error: eLee } = await supabase.from('canje_personas').select('archivos').eq('id', id).single();
      if (eLee) throw new Error(eLee.message);
      const archivos = Array.isArray(previo?.archivos) ? previo.archivos : [];
      archivos.push({ url, nombre: texto(b.nombre), tipo: texto(b.tipo), at: ahora(), usuario });
      const { error } = await supabase.from('canje_personas').update({ archivos, updated_at: ahora() }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, archivos });
    }

    if (action === 'persona-archivo-borrar') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const url = texto(b.url);
      if (!url) return res.status(400).json({ error: 'falta la url' });
      const { data: previo, error: eLee } = await supabase.from('canje_personas').select('archivos').eq('id', id).single();
      if (eLee) throw new Error(eLee.message);
      const archivos = Array.isArray(previo?.archivos) ? previo.archivos : [];
      const quedan = archivos.filter((a) => a && a.url !== url);
      const { error } = await supabase.from('canje_personas').update({ archivos: quedan, updated_at: ahora() }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, archivos: quedan });
    }

    // ── La config del módulo ──────────────────────────────────────────────────
    // Los números que si no serían constantes escondidas en el código. Se toca con permiso de
    // administración: el umbral de aprobación decide qué firma hace falta, así que no es un ajuste
    // cosmético.
    if (action === 'config') {
      if (!esAdministracion(perfil)) {
        return res.status(403).json({ error: 'Esto lo hace Administración: pedile a alguien con ese permiso.' });
      }
      const campos = {};
      // `null` es un valor válido y significa "todo va a la firma alta": no se puede tratar como
      // "no lo mandaron".
      if (b.umbral_aprobacion_alta !== undefined) campos.umbral_aprobacion_alta = num(b.umbral_aprobacion_alta);
      for (const k of ['cadencia_dias_default', 'plazo_entregable_dias_default',
        'tope_evidencias_por_canje', 'cierres_incompletos_no_repetir']) {
        if (b[k] !== undefined) campos[k] = num(b[k]);
      }
      if (b.factor_costo_estimado !== undefined) campos.factor_costo_estimado = num(b.factor_costo_estimado);
      if (b.bloquear_por_vencidos !== undefined) campos.bloquear_por_vencidos = bool(b.bloquear_por_vencidos);
      if (b.drive_url !== undefined) campos.drive_url = texto(b.drive_url);
      if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });

      const { error } = await supabase.from('canje_config')
        .update({ ...campos, updated_at: ahora() }).eq('store', store);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ══ EL CANJE ══════════════════════════════════════════════════════════════

    if (action === 'canje-crear') {
      const personaId = parseInt(b.persona_id, 10);
      if (!personaId) return res.status(400).json({ error: 'falta la persona' });

      const { data: persona } = await supabase.from('canje_personas')
        .select('id, vetada, vetada_motivo').eq('id', personaId).maybeSingle();
      if (!persona) return res.status(404).json({ error: 'no existe esa persona' });

      // ── §2 bis: el bloqueo ──────────────────────────────────────────────────
      // Se valida ACÁ y no sólo deshabilitando el botón: un gate que sólo vive en el browser no
      // es un gate. Y es TRANSVERSAL a las marcas — si debe algo en BDI, tampoco se le propone en
      // Zattia. Ese es el sentido del padrón único: si no, se esquiva cambiando de marca.
      if (persona.vetada) {
        return res.status(403).json({
          error: persona.vetada_motivo ? `Está vetada: ${persona.vetada_motivo}` : 'Está vetada.',
        });
      }
      const cfgStore = await configDe(store);
      if (cfgStore.bloquear_por_vencidos) {
        const bloqueo = await motivoDeBloqueo(personaId);
        if (bloqueo) return res.status(403).json({ error: bloqueo });
      }

      const tope_tipo = TOPE_TIPOS.includes(b.tope_tipo) ? b.tope_tipo : 'monto';
      const row = {
        persona_id: personaId,
        store,
        tipo: TIPOS_CANJE.includes(b.tipo) ? b.tipo : 'producto',
        estado: 'borrador',
        titulo: texto(b.titulo),
        nota: texto(b.nota),
        tope_tipo,
        tope_pvp: tope_tipo === 'monto' ? num(b.tope_pvp) : null,
        tope_unidades: tope_tipo === 'unidades' && Array.isArray(b.tope_unidades) ? b.tope_unidades : [],
        monto_plata: b.tipo === 'producto_plata' ? num(b.monto_plata) : null,
        // El pendiente de pago sólo existe si hay plata: si no, sería un pendiente que nunca se
        // resuelve y que traba el cierre para siempre.
        pago_estado: b.tipo === 'producto_plata' ? 'pendiente' : 'no_aplica',
        usuario,
        historial: [{ estado: 'borrador', at: ahora(), usuario, nota: 'canje abierto' }],
      };
      const { data, error } = await supabase.from('canjes').insert(row).select('id').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id: data.id, numero: numeroCanje(data.id) });
    }

    const canjeId = parseInt(b.id, 10);
    if (!canjeId) return res.status(400).json({ error: 'falta id' });
    const t = await traerCanje(canjeId);
    if (t.error) return t.error;
    const canje = t.canje;
    const cfgCanje = await configDe(canje.store);

    if (action === 'canje-editar') {
      // Después del acuerdo el trato ya está cerrado con ella: cambiarlo por atrás es cambiarle
      // las condiciones sin avisar. Se cancela y se hace otro.
      if (!['borrador', 'propuesta'].includes(canje.estado)) {
        return res.status(409).json({ error: 'Un canje ya acordado no se edita: cancelalo y armá uno nuevo.' });
      }
      const campos = {};
      if (b.titulo !== undefined) campos.titulo = texto(b.titulo);
      if (b.nota !== undefined) campos.nota = texto(b.nota);
      if (b.tipo !== undefined && TIPOS_CANJE.includes(b.tipo)) {
        campos.tipo = b.tipo;
        campos.pago_estado = b.tipo === 'producto_plata' ? 'pendiente' : 'no_aplica';
        if (b.tipo === 'producto') campos.monto_plata = null;
      }
      if (b.monto_plata !== undefined) campos.monto_plata = num(b.monto_plata);
      if (b.tope_tipo !== undefined && TOPE_TIPOS.includes(b.tope_tipo)) campos.tope_tipo = b.tope_tipo;
      if (b.tope_pvp !== undefined) campos.tope_pvp = num(b.tope_pvp);
      if (b.tope_unidades !== undefined && Array.isArray(b.tope_unidades)) campos.tope_unidades = b.tope_unidades;
      if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });
      const { error } = await supabase.from('canjes').update({ ...campos, updated_at: ahora() }).eq('id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'canje-estado') {
      const destino = String(b.estado || '');
      if (!ESTADOS.includes(destino)) return res.status(400).json({ error: 'estado inválido' });
      if (!puedeIr(canje.estado, destino)) {
        return res.status(409).json({ error: `De "${canje.estado}" no se puede pasar a "${destino}".` });
      }
      // Cancelar sin motivo deja el problema al que lo encuentre en tres meses.
      const motivo = texto(b.motivo);
      if (destino === 'cancelado' && !motivo) return res.status(400).json({ error: 'para cancelar hace falta un motivo' });

      const extra = { estado: destino };
      if (destino === 'cancelado') {
        extra.cancelado_motivo = motivo;
        // Cancelar REVOCA el link: si no, el token sigue vivo y ella carga datos para un canje
        // que ya no existe.
        extra.token = null;
        extra.token_vence = null;
      }
      await apilar(supabase, 'canjes', canjeId, { estado: destino, at: ahora(), usuario, nota: motivo }, extra);
      return res.status(200).json({ ok: true });
    }

    // ── La aprobación ─────────────────────────────────────────────────────────
    if (action === 'canje-aprobar' || action === 'canje-rechazar') {
      if (canje.estado !== 'propuesta') {
        return res.status(409).json({ error: 'Este canje no está esperando aprobación.' });
      }
      // Qué firma hace falta lo decide el canje, no quien lo mira: un canje con plata siempre va a
      // la firma alta, tenga el monto que tenga.
      const nivel = subQueApruebe(canje, await itemsDe(canjeId), cfgCanje);
      // Quien puede firmar lo alto puede firmar lo bajo; al revés no.
      const puede = nivel === 'aprobar'
        ? (puedeSubCanjes(perfil, canje.store, 'aprobar') || puedeSubCanjes(perfil, canje.store, 'aprobar-plata'))
        : puedeSubCanjes(perfil, canje.store, 'aprobar-plata');
      if (!puede) {
        return res.status(403).json({
          error: nivel === 'aprobar-plata'
            ? 'Este canje necesita la firma alta (permiso "aprobar canjes con plata o de monto alto").'
            : 'No tenés permiso para aprobar canjes.',
        });
      }

      if (action === 'canje-rechazar') {
        const motivo = texto(b.motivo);
        if (!motivo) return res.status(400).json({ error: 'para rechazar hace falta un motivo' });
        await apilar(supabase, 'canjes', canjeId, { estado: 'rechazado', at: ahora(), usuario, nota: motivo }, {
          estado: 'rechazado', rechazado_motivo: motivo, rechazado_por: usuario, rechazado_at: ahora(),
        });
        return res.status(200).json({ ok: true });
      }

      // El token nace acá, con el acuerdo: antes no hay nada que ella pueda completar.
      const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''); // 64 hex
      const vence = new Date(Date.now() + DIAS_TOKEN * 86400000).toISOString();
      await apilar(supabase, 'canjes', canjeId, { estado: 'acuerdo', at: ahora(), usuario, nota: `aprobado (${nivel})` }, {
        estado: 'acuerdo',
        aprobado_por: usuario,
        aprobado_at: ahora(),
        // Se GUARDA el nivel, no se recalcula: si mañana cambia el umbral, lo ya aprobado sigue
        // diciendo con qué regla se aprobó.
        aprobacion_nivel: nivel,
        acordado_at: ahora(),
        token,
        token_vence: vence,
      });
      return res.status(200).json({ ok: true, nivel });
    }

    // ── Los productos ─────────────────────────────────────────────────────────
    if (action === 'item-agregar') {
      if (['cerrado', 'cancelado', 'rechazado'].includes(canje.estado)) {
        return res.status(409).json({ error: 'Este canje ya está cerrado.' });
      }
      const cantidad = Math.max(1, parseInt(b.cantidad, 10) || 1);
      const nuevo = {
        canje_id: canjeId,
        sku: texto(b.sku),
        product_id: texto(b.product_id),
        size_id: texto(b.size_id),
        nombre: texto(b.nombre),
        variante: texto(b.variante),
        cantidad,
        // Congelados: el balance necesita el costo DE ESE DÍA, no el de hoy.
        costo_unit: num(b.costo_unit),
        pvp_unit: num(b.pvp_unit),
        origen: b.origen === 'persona' ? 'persona' : 'equipo',
        estado: 'confirmado',
        usuario,
      };
      // El control del tope corre en el servidor con la lista REAL, no con la que tenga el
      // browser en pantalla: dos operadores cargando a la vez se pasarían del tope sin que
      // ninguno de los dos lo viera.
      const previos = await itemsDe(canjeId);
      const seVa = seVaDelTope(canje, [...previos, nuevo]);
      if (seVa) return res.status(409).json({ error: seVa });

      const { data, error } = await supabase.from('canje_items').insert(nuevo).select('*').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, item: data });
    }

    if (action === 'item-quitar') {
      const itemId = parseInt(b.item_id, 10);
      if (!itemId) return res.status(400).json({ error: 'falta item_id' });
      const motivo = texto(b.motivo);
      if (!motivo) return res.status(400).json({ error: 'para quitar un producto hace falta un motivo' });
      const estado = b.sin_stock === true ? 'sin_stock' : 'quitado';
      // NO se borra: que algo se haya caído por falta de stock es información, y al mes siguiente
      // es lo que explica por qué el canje salió distinto de lo acordado.
      const { error } = await supabase.from('canje_items')
        .update({ estado, motivo, updated_at: ahora() }).eq('id', itemId).eq('canje_id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Compra y envío ────────────────────────────────────────────────────────
    if (action === 'compra') {
      // La orden se crea A MANO en el admin de Tienda Nube: este repo no tiene credenciales de TN
      // (todo lo de TN pasa por bdi-catalogo, que no escribe órdenes). Acá sólo se registra.
      const campos = {
        tn_orden: texto(b.tn_orden),
        gn_venta_number: texto(b.gn_venta_number),
        compra_estado: 'hecho',
        compra_at: ahora(),
        compra_por: usuario,
      };
      if (!campos.tn_orden) return res.status(400).json({ error: 'falta el número de orden de Tienda Nube' });
      const extra = canje.estado === 'acuerdo' ? { ...campos, estado: 'preparando' } : campos;
      await apilar(supabase, 'canjes', canjeId, { at: ahora(), usuario, nota: `orden ${campos.tn_orden} cargada` }, extra);
      return res.status(200).json({ ok: true });
    }

    if (action === 'envio') {
      const via = VIAS_ENVIO.includes(b.envio_via) ? b.envio_via : null;
      if (!via) return res.status(400).json({ error: 'falta la vía del envío' });
      const campos = {
        envio_via: via,
        envio_seguimiento: texto(b.envio_seguimiento),
        envio_costo: num(b.envio_costo),
        envio_estado: 'hecho',
        envio_at: ahora(),
      };
      if (campos.envio_costo != null && campos.envio_costo < 0) {
        return res.status(400).json({ error: 'el costo del envío no puede ser negativo' });
      }
      // La dirección se CONGELA acá: si el mes que viene se muda, el histórico no tiene que mentir
      // sobre a dónde se mandó esto.
      const { data: persona } = await supabase.from('canje_personas')
        .select('nombre, apellido, dni, calle, numero, piso, depto, cp, provincia, localidad, direccion_nota, telefono')
        .eq('id', canje.persona_id).maybeSingle();
      if (persona) campos.envio_direccion = persona;

      const extra = canje.estado === 'acuerdo' ? { ...campos, estado: 'preparando' } : campos;
      await apilar(supabase, 'canjes', canjeId, { at: ahora(), usuario, nota: `despachado por ${via}` }, extra);
      return res.status(200).json({ ok: true });
    }

    if (action === 'aviso') {
      await supabase.from('canjes')
        .update({ aviso_estado: 'hecho', aviso_at: ahora(), updated_at: ahora() }).eq('id', canjeId);
      return res.status(200).json({ ok: true });
    }

    /**
     * "Le llegó". **Es el pivote del módulo**: acá y sólo acá los `plazo_dias` se vuelven fechas.
     *
     * El plazo se guarda en días desde la entrega porque al armar el acuerdo todavía no se sabe
     * cuándo llega el pedido. `vence_el` se calcula una vez y se congela: si se recalculara en
     * cada lectura, mover `entregado_at` movería todos los vencimientos hacia atrás y un
     * incumplimiento desaparecería solo.
     */
    if (action === 'entregado') {
      if (canje.entregado_at) return res.status(409).json({ error: 'Este canje ya figura entregado.' });
      const at = ahora();
      const entregables = await entregablesDe(canjeId);
      const base = new Date(at);
      for (const e of entregables) {
        const dias = e.plazo_dias == null ? Number(cfgCanje.plazo_entregable_dias_default) : Number(e.plazo_dias);
        const d = new Date(base);
        d.setDate(d.getDate() + (Number.isFinite(dias) ? dias : 10));
        await supabase.from('canje_entregables')
          .update({ vence_el: fechaISO(d), updated_at: at }).eq('id', e.id);
      }
      await apilar(supabase, 'canjes', canjeId, { estado: 'en_curso', at, usuario, nota: 'le llegó el pedido' }, {
        estado: 'en_curso', entregado_at: at,
      });
      return res.status(200).json({ ok: true, entregables: entregables.length });
    }

    // ── Lo que prometió publicar ──────────────────────────────────────────────
    if (action === 'entregable-agregar') {
      if (!TIPOS_ENTREGABLE.includes(b.tipo)) return res.status(400).json({ error: 'tipo de entregable inválido' });
      const row = {
        canje_id: canjeId,
        tipo: b.tipo,
        cantidad_comprometida: Math.max(1, parseInt(b.cantidad_comprometida, 10) || 1),
        plazo_dias: num(b.plazo_dias) ?? Number(cfgCanje.plazo_entregable_dias_default),
        obligatorio: b.obligatorio === false ? false : true,
        nota: texto(b.nota),
      };
      // Si el pedido YA llegó, el vencimiento se calcula al vuelo: un entregable sumado después
      // sin fecha nunca vencería, y sería la forma de esquivar el control sin querer.
      if (canje.entregado_at) {
        const d = new Date(canje.entregado_at);
        d.setDate(d.getDate() + (Number(row.plazo_dias) || 10));
        row.vence_el = fechaISO(d);
      }
      const { data, error } = await supabase.from('canje_entregables').insert(row).select('*').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, entregable: data });
    }

    if (action === 'entregable-quitar') {
      const eid = parseInt(b.entregable_id, 10);
      if (!eid) return res.status(400).json({ error: 'falta entregable_id' });
      // Acá SÍ se borra, a diferencia de los items: un entregable que se saca del acuerdo no
      // ocurrió nunca, no es un producto que estuvo y se cayó. Las evidencias colgadas quedan
      // huérfanas (`on delete set null`) y siguen visibles en el canje.
      const { error } = await supabase.from('canje_entregables').delete().eq('id', eid).eq('canje_id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── El cumplimiento ───────────────────────────────────────────────────────
    if (action === 'evidencia-agregar') {
      const previas = await evidenciasDe(canjeId);
      const tope = Number(cfgCanje.tope_evidencias_por_canje) || 30;
      if (previas.length >= tope) {
        return res.status(409).json({ error: `Este canje ya tiene ${previas.length} evidencias (el tope es ${tope}).` });
      }
      if (!texto(b.url_publicacion) && !texto(b.captura_url) && !texto(b.archivo_url)) {
        return res.status(400).json({ error: 'hace falta el link de la publicación o una captura' });
      }
      const row = {
        canje_id: canjeId,
        entregable_id: b.entregable_id ? parseInt(b.entregable_id, 10) : null,
        url_publicacion: texto(b.url_publicacion),
        // Las historias vencen a las 24 h: la captura ES la prueba, no un adorno.
        captura_url: texto(b.captura_url),
        archivo_url: texto(b.archivo_url),
        archivo_tipo: texto(b.archivo_tipo),
        fecha_publicacion: texto(b.fecha_publicacion),
        metricas: b.metricas && typeof b.metricas === 'object' ? b.metricas : {},
        subido_por: b.subido_por === 'persona' ? 'persona' : 'equipo',
        usuario,
      };
      const { data, error } = await supabase.from('canje_evidencias').insert(row).select('*').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, evidencia: data });
    }

    if (action === 'evidencia-verificar') {
      const eid = parseInt(b.evidencia_id, 10);
      if (!eid) return res.status(400).json({ error: 'falta evidencia_id' });
      const ok = b.ok !== false;
      const motivo = texto(b.motivo);
      if (!ok && !motivo) return res.status(400).json({ error: 'para rechazar una evidencia hace falta un motivo' });
      // Una evidencia sin verificar NO cuenta para el cumplimiento. Sin este paso, pegar un link
      // roto cerraría el canje.
      const campos = ok
        ? { verificada: true, verificada_por: usuario, verificada_at: ahora(), rechazada_motivo: null }
        : { verificada: false, verificada_por: usuario, verificada_at: ahora(), rechazada_motivo: motivo };
      const { error } = await supabase.from('canje_evidencias')
        .update({ ...campos, updated_at: ahora() }).eq('id', eid).eq('canje_id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'evidencia-borrar') {
      const eid = parseInt(b.evidencia_id, 10);
      if (!eid) return res.status(400).json({ error: 'falta evidencia_id' });
      const { error } = await supabase.from('canje_evidencias').delete().eq('id', eid).eq('canje_id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── La plata ──────────────────────────────────────────────────────────────
    if (action === 'pago') {
      if (canje.tipo !== 'producto_plata') return res.status(409).json({ error: 'Este canje no lleva plata.' });
      // El pago se hace POR FUERA del sistema (transferencia). Acá sólo queda registrado que se
      // hizo, con fecha: es lo que después permite cerrar y lo que evita pagar dos veces.
      await apilar(supabase, 'canjes', canjeId, { at: ahora(), usuario, nota: 'plata pagada' }, {
        pago_estado: 'pagado', pago_at: ahora(), pago_nota: texto(b.pago_nota),
      });
      return res.status(200).json({ ok: true });
    }

    // ── El cierre ─────────────────────────────────────────────────────────────
    if (action === 'cerrar') {
      if (canje.estado === 'cerrado') return res.status(409).json({ error: 'Este canje ya está cerrado.' });
      if (!puedeIr(canje.estado, 'cerrado')) {
        return res.status(409).json({ error: 'Todavía no llegó al punto de poder cerrarse.' });
      }
      const incompleto = bool(b.incompleto);
      const motivo = texto(b.cierre_motivo);
      // "Cerrar igual" es una decisión, no un atajo: exige el sub y un motivo. Queda marcado y en
      // la Fase 3 le baja el puntaje a ella.
      if (incompleto) {
        if (!puedeSubCanjes(perfil, canje.store, 'cerrar')) {
          return res.status(403).json({ error: 'No tenés permiso para cerrar un canje incompleto.' });
        }
        if (!motivo) return res.status(400).json({ error: 'para cerrar igual hace falta un motivo' });
      }

      // ⚠️ El balance lo CALCULA el cliente (`calcularBalance`, con tests) y acá se valida rango.
      // Es la regla de `api/_reclamos.js`: replicar aritmética en JS es la fuente conocida de
      // desincronización. Lo que el servidor no delega es la autorización, que está arriba.
      const balance = {};
      for (const k of ['balance_costo_productos', 'balance_costo_envio', 'balance_costo_plata',
        'balance_costo_total', 'balance_alcance', 'balance_interacciones', 'balance_cpm']) {
        const v = num(b[k]);
        if (v != null && v < 0) return res.status(400).json({ error: `${k} no puede ser negativo` });
        if (v != null) balance[k] = v;
      }
      const pm = num(b.balance_puntaje_manual);
      if (pm != null && (pm < 1 || pm > 5)) return res.status(400).json({ error: 'el puntaje va de 1 a 5' });
      if (pm != null) balance.balance_puntaje_manual = pm;
      if (b.balance_nota !== undefined) balance.balance_nota = texto(b.balance_nota);

      await apilar(supabase, 'canjes', canjeId, {
        estado: 'cerrado', at: ahora(), usuario, nota: incompleto ? `cerrado igual: ${motivo}` : 'cerrado',
      }, {
        ...balance,
        estado: 'cerrado',
        cerrado_incompleto: incompleto,
        cierre_motivo: motivo,
        cerrado_por: usuario,
        cerrado_at: ahora(),
        // El link deja de servir: el canje terminó.
        token: null,
        token_vence: null,
      });
      return res.status(200).json({ ok: true });
    }

    /**
     * Devolvió o vendió lo que le mandamos.
     *
     * Un flag y nada más: **no hay flujo de reingreso ni enganche con Reclamos**, a propósito.
     * Pasa dos veces al año, cada caso es distinto, y armar un flujo entero para eso es
     * complejidad que después nadie usa. Queda en el historial de la persona y en la Fase 3 le
     * baja el puntaje; si amerita, se la veta a mano.
     */
    if (action === 'no-conservado') {
      const motivo = texto(b.motivo);
      if (!motivo) return res.status(400).json({ error: 'hace falta el motivo' });
      await apilar(supabase, 'canjes', canjeId, { at: ahora(), usuario, nota: `no conservó el producto: ${motivo}` }, {
        producto_no_conservado: true,
        producto_no_conservado_motivo: motivo,
        producto_no_conservado_por: usuario,
        producto_no_conservado_at: ahora(),
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `acción desconocida: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }

  /**
   * El motivo por el que NO se le puede proponer un canje nuevo, o `null` si se puede.
   *
   * Mira **todos** los canjes de la persona, de todas las marcas: si debe algo en BDI, tampoco se
   * le propone en Zattia. Es el sentido del padrón único — si no, el bloqueo se esquiva cambiando
   * de marca.
   */
  /**
   * Un renglón por canje con entregables obligatorios vencidos: cuántos faltan y desde cuándo.
   *
   * Deriva lo mismo que `entregablesVencidos` en TS (obligatorio + fecha pasada + sin evidencia
   * verificada que lo complete), pero sobre el conjunto entero y en **dos** consultas, no una por
   * canje. Es lo que alimenta el aviso agrupado del sidebar.
   */
  async function resumenDeVencidos(canjes) {
    const abiertos = canjes.filter((c) => !TERMINALES.includes(c.estado)).map((c) => c.id);
    if (!abiertos.length) return [];
    const [ents, evis] = await Promise.all([
      supabase.from('canje_entregables').select('id, canje_id, tipo, cantidad_comprometida, obligatorio, vence_el').in('canje_id', abiertos),
      supabase.from('canje_evidencias').select('entregable_id, verificada').in('canje_id', abiertos),
    ]);
    const hoyISO = fechaISO(new Date());
    const verificadas = new Map();
    for (const e of evis.data || []) {
      if (!e.verificada || e.entregable_id == null) continue;
      verificadas.set(e.entregable_id, (verificadas.get(e.entregable_id) || 0) + 1);
    }
    const porCanje = new Map();
    for (const e of ents.data || []) {
      if (!e.obligatorio || !e.vence_el || e.vence_el >= hoyISO) continue;
      const comprometidas = Number(e.cantidad_comprometida) || 0;
      const cumplidas = Math.min(verificadas.get(e.id) || 0, comprometidas);
      if (cumplidas >= comprometidas) continue;
      const prev = porCanje.get(e.canje_id) || { cuantas: 0, desde: null };
      prev.cuantas += comprometidas - cumplidas;
      // La fecha del vencimiento más viejo: es la que ordena el aviso.
      const ts = Date.parse(e.vence_el) || 0;
      prev.desde = prev.desde == null ? ts : Math.min(prev.desde, ts);
      porCanje.set(e.canje_id, prev);
    }
    const porId = new Map(canjes.map((c) => [c.id, c]));
    return [...porCanje.entries()].map(([canjeId, v]) => ({
      canjeId,
      store: porId.get(canjeId)?.store || null,
      persona_id: porId.get(canjeId)?.persona_id || null,
      cuantas: v.cuantas,
      desde: v.desde || 0,
    }));
  }

  async function motivoDeBloqueo(personaId) {
    const { data: suyos } = await supabase.from('canjes')
      .select('id, estado').eq('persona_id', personaId).not('estado', 'in', '(rechazado,cerrado,cancelado)');
    if (!suyos || !suyos.length) return null;
    const ids = suyos.map((c) => c.id);
    const [ents, evis] = await Promise.all([
      supabase.from('canje_entregables').select('*').in('canje_id', ids),
      supabase.from('canje_evidencias').select('canje_id, entregable_id, verificada').in('canje_id', ids),
    ]);
    const hoyISO = fechaISO(new Date());
    const verificadas = new Map();
    for (const e of evis.data || []) {
      if (!e.verificada || e.entregable_id == null) continue;
      verificadas.set(e.entregable_id, (verificadas.get(e.entregable_id) || 0) + 1);
    }
    for (const e of ents.data || []) {
      if (!e.obligatorio || !e.vence_el || e.vence_el >= hoyISO) continue;
      const cumplidas = Math.min(verificadas.get(e.id) || 0, Number(e.cantidad_comprometida) || 0);
      if (cumplidas >= (Number(e.cantidad_comprometida) || 0)) continue;
      return `Tiene entregables vencidos del canje ${numeroCanje(e.canje_id)}. Resolvelo antes de proponerle otro.`;
    }
    return null;
  }
}

// `apilar` queda listo para la Fase 1 (los canjes en sí, que sí llevan historial de estados). En la
// Fase 0 las fichas se editan sin apilar: una nota ya es el registro de lo que pasó.
// Los espejos se exportan para que `tests/canjes-flujo.test.ts` los compare contra los de
// `lib/canjes/tipos.ts`. Es lo único que mantiene honesta la duplicación.
export { apilar, normalizarInstagram, numeroCanje, puedeIr, seVaDelTope, subQueApruebe, TRANSICIONES };
