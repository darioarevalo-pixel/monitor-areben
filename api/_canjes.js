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
// Los canjes en sí (crear, aprobar, items, envío, entregables, cierre) entran en la Fase 1. La
// Fase 0 es el padrón: eso solo ya reemplaza la planilla.
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

const num = (v) => (v == null || v === '' ? null : Number(v));
const texto = (v) => (v == null || v === '' ? null : String(v));
const bool = (v) => v === true || v === 'true';

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

    return res.status(400).json({ error: `acción desconocida: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}

// `apilar` queda listo para la Fase 1 (los canjes en sí, que sí llevan historial de estados). En la
// Fase 0 las fichas se editan sin apilar: una nota ya es el registro de lo que pasó.
export { apilar, normalizarInstagram, numeroCanje };
