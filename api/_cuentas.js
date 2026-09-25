// Cuentas manuales — tablas `cuentas_manuales` y `cuentas_manuales_objetivos`
// (ver sql/migrate-cuentas-manuales.sql).
//
//   GET  ?recurso=cuentas                                      → { ok, cuentas, puede }
//   POST { recurso:'cuentas', action:'crear', cuenta }
//   POST { recurso:'cuentas', action:'editar', id, cuenta }
//   POST { recurso:'cuentas', action:'archivar', id, archivada }
//   POST { recurso:'cuentas', action:'cargar', id, monto, nota }       ← prende la cuenta
//   POST { recurso:'cuentas', action:'cambiar-monto', objetivo_id, monto }
//   POST { recurso:'cuentas', action:'cerrar', objetivo_id, estado }   ← 'completo' | 'cancelado'
//
// Una cuenta manual es un lugar a dónde pedirle a un cliente que transfiera, para algo que el
// dashboard no conoce: la cuota del crédito, las bolsas, el alquiler. El resto del circuito
// —anotar el compromiso, confirmarlo— es el MISMO de siempre y vive en `_compromisos.js`: acá sólo
// se administra la ficha y se prende o se apaga.
//
// # ⛔ Lo que este handler NO hace
//
// No le habla al dashboard, ni para leer ni para escribir. Es la diferencia entera con los
// acreedores y es lo que hace que estas cuentas anden con el dashboard caído. El precio, dicho una
// vez para no repetirlo en cada pantalla: **el pago de verdad se sigue cargando en el dashboard**.
// Esto lleva la cuenta de quién puso qué para juntarlo.
//
// # Permisos: los de acreedores, sin key nueva
//
// Ve el que ve "A quién le debemos"; administra el que puede comprometer (`acreedores.prometer`).
// ⛔ No se inventó un permiso propio a propósito: una key nueva nace apagada para todos y hay que
// tildarla usuario por usuario en el padrón. Este circuito ya perdió los tildes una vez con el
// rename de `prometer` → `comprometer` (4-sep-2026). Quien maneja la cobranza es el mismo que abre
// la cuenta en la que se cobra.
//
// ⛔ Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby admite 12 funciones.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, marcasConAcceso, puedeSub } from '../lib/permisos.core.js';
import { redondear } from '../lib/compromisos/plata.core.js';
import { resumenObjetivo } from '../lib/cuentas/core.core.js';
import { CAMPOS_PLATA } from '../lib/cuentas/base.js';

let sb = null;
function base() {
  if (!sb) {
    sb = createClient(
      process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
    );
  }
  return sb;
}

const CAMPOS_CUENTA =
  'id, nombre, para_que, cuenta_alias, cuenta_cbu, cuenta_banco, cuenta_titular, archivada, ' +
  'creado_en, creado_por';
const CAMPOS_OBJETIVO =
  'id, cuenta_id, monto, nota, estado, abierto_en, abierto_por, cerrado_en, cerrado_por';

function permisos(perfil) {
  const admin = esAdmin(perfil);
  const ve = admin || marcasConAcceso(perfil, 'acreedores', ['bdi', 'zattia']).length > 0;
  return {
    ver: ve,
    // El mismo sub que habilita anotar un compromiso: quien cobra es quien abre la cuenta.
    administrar: admin || (ve && ['bdi', 'zattia'].some((m) => puedeSub(perfil, m, 'acreedores', 'prometer'))),
  };
}

function texto(v, max = 300) {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
}

/** Los cuatro campos de "a dónde transferir", tal como los congela después el compromiso. */
function datosDeCuenta(c) {
  return {
    cuenta_alias: texto(c.cuenta_alias, 60),
    // El CBU sin adornos: es lo que se pega en el home banking.
    cuenta_cbu: texto(String(c.cuenta_cbu ?? '').replace(/[^\d]/g, ''), 30),
    cuenta_banco: texto(c.cuenta_banco, 80),
    cuenta_titular: texto(c.cuenta_titular, 120),
  };
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const puede = permisos(perfil);
  if (!puede.ver) {
    return res.status(403).json({ error: 'No tenés permiso para ver las cuentas.' });
  }

  const quien = perfil.name || null;

  // ── La lista, con la plata de cada vuelta ───────────────────────────────────
  if (req.method === 'GET') {
    const [cuentas, objetivos] = await Promise.all([
      base().from('cuentas_manuales').select(CAMPOS_CUENTA).order('nombre'),
      base().from('cuentas_manuales_objetivos').select(CAMPOS_OBJETIVO).order('abierto_en', { ascending: false }),
    ]);
    if (cuentas.error) return res.status(500).json({ error: cuentas.error.message });
    if (objetivos.error) return res.status(500).json({ error: objetivos.error.message });

    // Todos los compromisos manuales de una, y la suma se hace en memoria: son pocos y así el
    // historial de cada vuelta sale del mismo lote que el objetivo abierto.
    const { data: plata, error: ePlata } = await base()
      .from('compromisos_pago')
      .select(CAMPOS_PLATA)
      .eq('origen', 'manual')
      .limit(5000);
    if (ePlata) return res.status(500).json({ error: ePlata.message });

    const porCuenta = new Map();
    for (const o of objetivos.data || []) {
      const lista = porCuenta.get(o.cuenta_id) || [];
      lista.push({ ...o, monto: Number(o.monto), ...resumenObjetivo(o, plata || []) });
      porCuenta.set(o.cuenta_id, lista);
    }

    const lista = (cuentas.data || []).map((c) => {
      const suyos = porCuenta.get(c.id) || [];
      return {
        ...c,
        // El que está juntando ahora (hay uno solo: lo garantiza un índice único en la base).
        objetivo: suyos.find((o) => o.estado === 'juntando') || null,
        // Las vueltas anteriores, de la más nueva a la más vieja.
        historial: suyos.filter((o) => o.estado !== 'juntando'),
      };
    });

    return res.status(200).json({ ok: true, cuentas: lista, puede });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  if (!puede.administrar) {
    return res.status(403).json({ error: 'No tenés permiso para administrar las cuentas. Se activa en Usuarios.' });
  }

  const body = req.body || {};
  const accion = String(body.action || '');
  const ahora = new Date().toISOString();

  // ── Abrir la ficha ──────────────────────────────────────────────────────────
  if (accion === 'crear') {
    const c = body.cuenta || {};
    const nombre = texto(c.nombre, 120);
    if (!nombre) return res.status(400).json({ error: 'Ponele un nombre a la cuenta.' });

    const { data, error } = await base()
      .from('cuentas_manuales')
      .insert({
        nombre,
        para_que: texto(c.para_que, 500),
        ...datosDeCuenta(c),
        creado_por: quien,
        actualizado_por: quien,
      })
      .select(CAMPOS_CUENTA)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, cuenta: { ...data, objetivo: null, historial: [] } });
  }

  if (accion === 'editar') {
    const c = body.cuenta || {};
    const nombre = texto(c.nombre, 120);
    if (!nombre) return res.status(400).json({ error: 'Ponele un nombre a la cuenta.' });

    const { data, error } = await base()
      .from('cuentas_manuales')
      .update({
        nombre,
        para_que: texto(c.para_que, 500),
        ...datosDeCuenta(c),
        actualizado_en: ahora,
        actualizado_por: quien,
      })
      .eq('id', body.id)
      .select(CAMPOS_CUENTA)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    // ⚠️ Cambiar el CBU acá NO toca los compromisos ya anotados: cada uno congeló a dónde se mandó
    // la plata. Es a propósito (ver el comentario de `cuenta_cbu` en la migración de compromisos).
    return res.status(200).json({ ok: true, cuenta: data });
  }

  // ── Archivar / desarchivar. ⛔ No se elimina: sus compromisos dicen a dónde fue la plata. ──
  if (accion === 'archivar') {
    const archivada = body.archivada !== false;
    if (archivada) {
      const { data: abierto } = await base()
        .from('cuentas_manuales_objetivos')
        .select('id').eq('cuenta_id', body.id).eq('estado', 'juntando').maybeSingle();
      if (abierto) {
        return res.status(409).json({ error: 'Esta cuenta está juntando plata. Cerrá lo que está abierto antes de archivarla.' });
      }
    }
    const { data, error } = await base()
      .from('cuentas_manuales')
      .update({ archivada, actualizado_en: ahora, actualizado_por: quien })
      .eq('id', body.id)
      .select(CAMPOS_CUENTA)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, cuenta: data });
  }

  // ── Prender la cuenta: cuánto hay que juntar ────────────────────────────────
  if (accion === 'cargar') {
    const monto = redondear(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ error: 'Poné cuánta plata hay que juntar.' });
    }

    const { data: cuenta, error: eCuenta } = await base()
      .from('cuentas_manuales').select('id, nombre, archivada').eq('id', body.id).single();
    if (eCuenta || !cuenta) return res.status(404).json({ error: 'No se encontró esa cuenta.' });
    if (cuenta.archivada) return res.status(409).json({ error: 'Esa cuenta está archivada. Sacala de archivadas para volver a usarla.' });

    const { data, error } = await base()
      .from('cuentas_manuales_objetivos')
      .insert({ cuenta_id: cuenta.id, monto, nota: texto(body.nota, 200), abierto_por: quien })
      .select(CAMPOS_OBJETIVO)
      .single();
    if (error) {
      // El índice único `idx_objetivo_abierto_por_cuenta`: ya había uno juntando. Es el candado
      // de verdad del circuito, así que el choque se explica en castellano en vez de salir crudo.
      if (String(error.message || '').includes('idx_objetivo_abierto_por_cuenta')) {
        return res.status(409).json({ error: `${cuenta.nombre} ya está juntando plata. Cerrá eso antes de cargar un monto nuevo.` });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true, objetivo: { ...data, monto: Number(data.monto), ...resumenObjetivo(data, []) } });
  }

  // ── Se movió la cuota: cambiar el monto sin perder lo juntado ───────────────
  if (accion === 'cambiar-monto') {
    const monto = redondear(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ error: 'Poné cuánta plata hay que juntar.' });
    }
    const { data: objetivo, error: eObj } = await base()
      .from('cuentas_manuales_objetivos').select(CAMPOS_OBJETIVO).eq('id', body.objetivo_id).single();
    if (eObj || !objetivo) return res.status(404).json({ error: 'No se encontró eso que se está juntando.' });
    if (objetivo.estado !== 'juntando') return res.status(409).json({ error: 'Eso ya está cerrado.' });

    const { data: plata, error: ePlata } = await base()
      .from('compromisos_pago').select(CAMPOS_PLATA).eq('objetivo_id', objetivo.id);
    if (ePlata) return res.status(500).json({ error: ePlata.message });
    const r = resumenObjetivo(objetivo, plata || []);

    // ⛔ Bajar el objetivo por debajo de lo que YA entró dejaría una cuenta que se completó hacia
    // atrás, con plata de clientes adentro y sin ningún momento en el que alguien haya decidido
    // cerrarla. Si ya alcanza, lo que corresponde es cerrarla a mano — que es un botón al lado.
    if (monto < r.juntado - 0.005) {
      return res.status(409).json({
        error: `Ya se acreditaron $${r.juntado.toLocaleString('es-AR')}, así que el monto no puede ser menor. Si con eso ya está, cerrala con "Marcar pagada".`,
      });
    }

    const { data, error } = await base()
      .from('cuentas_manuales_objetivos')
      .update({ monto, nota: body.nota === undefined ? objetivo.nota : texto(body.nota, 200) })
      .eq('id', objetivo.id)
      .select(CAMPOS_OBJETIVO)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, objetivo: { ...data, monto: Number(data.monto), ...resumenObjetivo(data, plata || []) } });
  }

  // ── Apagar la cuenta a mano ─────────────────────────────────────────────────
  //
  // Lo normal es que se apague sola al llegar al monto (lo hace `_compromisos.js` al confirmar).
  // Esto es para las dos salidas que no son ésa: "ya está pagado" con lo que haya entrado, y "se
  // paga de otra forma, dejá de juntar".
  if (accion === 'cerrar') {
    const estado = body.estado === 'completo' ? 'completo' : 'cancelado';
    const { data: objetivo, error: eObj } = await base()
      .from('cuentas_manuales_objetivos').select(CAMPOS_OBJETIVO).eq('id', body.objetivo_id).single();
    if (eObj || !objetivo) return res.status(404).json({ error: 'No se encontró eso que se está juntando.' });
    if (objetivo.estado !== 'juntando') return res.status(409).json({ error: 'Eso ya está cerrado.' });

    const { data: plata } = await base()
      .from('compromisos_pago').select(CAMPOS_PLATA).eq('objetivo_id', objetivo.id);
    const r = resumenObjetivo(objetivo, plata || []);

    const { data, error } = await base()
      .from('cuentas_manuales_objetivos')
      .update({ estado, cerrado_en: ahora, cerrado_por: quien })
      .eq('id', objetivo.id)
      .eq('estado', 'juntando')
      .select(CAMPOS_OBJETIVO)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      ok: true,
      objetivo: { ...data, monto: Number(data.monto), ...resumenObjetivo(data, plata || []) },
      // Lo que queda colgando se dice acá y no se toca: un compromiso abierto es plata que un
      // cliente todavía puede mandar, y borrarlo de la lista no lo frena.
      abiertos: r.cuantosEnCamino,
    });
  }

  return res.status(400).json({ error: 'Acción desconocida.' });
}
