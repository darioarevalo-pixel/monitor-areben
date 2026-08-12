// "Agenda operativa" — por ahora, las promociones bancarias. Tabla `agenda_promos`.
//
//   GET  ?recurso=agenda                                    → { ok, promos, puede }
//   POST { recurso:'agenda', action:'guardar-promo', promo }
//   POST { recurso:'agenda', action:'borrar-promo', id }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=agenda`. El plan Hobby de
// Vercel admite 12 funciones y hay 9 usadas. Si alguien crea `api/agenda.js` "por prolijidad",
// **frena todos los deploys sin error visible**: Vercel sigue sirviendo la versión anterior y no
// avisa. Ya pasó una vez.
//
// # Tres cosas que van escritas porque su ausencia se leería como un olvido
//
// 1. **No valida `store`.** Una promoción bancaria la define el banco, no BDI ni Zattia (ver el
//    encabezado del `.sql`). Que valga sólo para una marca se dice con la columna `marcas`, que es
//    una lista. El `Content-Type: application/json` del POST **sigue siendo obligatorio**: sin él
//    Vercel no parsea el cuerpo y el síntoma sería "falta id" en vez de un error de formato.
// 2. **No usa `puedeVer` en el GET.** La agenda la ve todo el equipo — es la contracara de que
//    exista: una promo que no le llega a quien cobra no sirve. `agenda` está en `KEYS_SIN_PERMISO`.
// 3. **`autor` sale de `perfil.name`, NUNCA del body.** Si viajara del cliente, cualquiera podría
//    firmar como otro.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { marcasConAcceso } from '../lib/permisos.core.js';
import { esFechaIso, motivoReglaInvalida } from '../lib/agenda/reglas.core.js';

/**
 * Siempre la base de BDI, tenga la sesión la marca que tenga. No es un descuido: acá no hay marca.
 * Además Zattia no tiene service key. Mismo criterio que `_sistema.js`.
 */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

/** Cargar es cross-marca: tildado en cualquiera de las dos alcanza, porque esto no tiene marca. */
function puedeCargar(perfil) {
  return marcasConAcceso(perfil, 'agenda.cargar', ['bdi', 'zattia']).length > 0;
}

const MEDIOS = ['credito', 'debito', 'app', 'qr', 'transferencia'];
const CANALES = ['mostrador', 'web'];
const MARCAS = ['bdi', 'zattia'];

const CAMPOS =
  'id, banco, medio, beneficio, regla, desde, hasta, condiciones, pasos, canales, marcas, activa, autor, created_at';

/** Una lista de strings de un catálogo cerrado, sin repetidos. Devuelve `null` si trae basura. */
function listaDe(v, validos) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map(String))];
  return out.every((x) => validos.includes(x)) ? out : null;
}

/**
 * El beneficio, validado por rama.
 *
 * Los tres se cobran distinto y por eso no se aplanan en un `pct` suelto. `tope` sólo existe en el
 * reintegro —es lo que el banco devuelve después, y sin tope el número no significa nada— y va
 * `null` cuando no lo hay, que no es lo mismo que cero.
 */
function normalizarBeneficio(b) {
  if (!b || typeof b !== 'object') return { error: 'Falta el beneficio.' };
  const pct = Number(b.pct);
  if (b.tipo === 'descuento' || b.tipo === 'reintegro') {
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { error: 'El porcentaje va entre 1 y 100.' };
    if (b.tipo === 'descuento') return { valor: { tipo: 'descuento', pct } };
    const tope = b.tope === null || b.tope === undefined || b.tope === '' ? null : Number(b.tope);
    if (tope !== null && (!Number.isFinite(tope) || tope <= 0)) return { error: 'El tope tiene que ser un monto.' };
    return { valor: { tipo: 'reintegro', pct, tope } };
  }
  if (b.tipo === 'cuotas') {
    const n = Number(b.n);
    if (!Number.isInteger(n) || n < 2 || n > 24) return { error: 'Las cuotas van de 2 a 24.' };
    return { valor: { tipo: 'cuotas', n, sinInteres: !!b.sinInteres } };
  }
  return { error: 'Tipo de beneficio desconocido (descuento, reintegro o cuotas).' };
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const yo = perfil.name || null;
  if (!yo) return res.status(400).json({ error: 'La sesión no tiene nombre; volvé a entrar.' });

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const supabase = createClient(cfg.url, cfg.key);
  const cargar = puedeCargar(perfil);

  try {
    if (req.method === 'GET') {
      // Quien no carga no ve las apagadas: una promo apagada es una que se decidió no dar, y verla
      // en el mostrador se leería como vigente.
      //
      // 🔴 **No se filtra por fecha acá, y es a propósito.** El servidor corre en UTC: a las 21:00 de
      // Argentina ya es mañana, así que una promo que termina hoy desaparecería tres horas antes,
      // justo en el horario en que el local sigue cobrando. El día lo decide el navegador con
      // `hoyIso()`, que es el día que la persona tiene en la cabeza. Son decenas de filas, no miles.
      let q = supabase.from('agenda_promos').select(CAMPOS).order('desde', { ascending: false });
      if (!cargar) q = q.eq('activa', true);
      const { data, error } = await q;
      if (error) throw new Error(error.message);

      return res.status(200).json({
        ok: true,
        promos: (data || []).map((p) => ({
          id: p.id,
          banco: p.banco,
          medio: p.medio,
          beneficio: p.beneficio,
          regla: p.regla,
          desde: p.desde,
          hasta: p.hasta,
          condiciones: p.condiciones || [],
          pasos: p.pasos,
          canales: p.canales || [],
          marcas: p.marcas || [],
          activa: p.activa,
          autor: p.autor,
          creado: p.created_at,
        })),
        puede: { cargar },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = String(b.action || '');

    // Todo lo que escribe pide el sub. No hay ninguna escritura abierta en esta tanda: marcar un
    // pendiente como hecho llega recién con `agenda_items`, y ésa sí va a ser abierta.
    if (!cargar) return res.status(403).json({ error: 'No tenés permiso para cargar en la agenda.' });

    if (action === 'borrar-promo') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const { error } = await supabase.from('agenda_promos').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'guardar-promo') {
      const p = b.promo || {};
      const id = String(p.id || '');
      const banco = String(p.banco || '').trim();
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!banco) return res.status(400).json({ error: 'Falta el banco.' });
      if (!MEDIOS.includes(String(p.medio))) {
        return res.status(400).json({ error: `Medio de pago inválido (usá ${MEDIOS.join(', ')}).` });
      }

      const ben = normalizarBeneficio(p.beneficio);
      if (ben.error) return res.status(400).json({ error: ben.error });

      // 🔑 La regla se valida ANTES de escribir. Una regla mal formada se guarda igual, la promo no
      // aparece nunca y nadie puede diagnosticar por qué — el motivo viaja en el 400 para que se lea
      // en la pantalla de alta, no en un log.
      const motivo = motivoReglaInvalida(p.regla);
      if (motivo) return res.status(400).json({ error: motivo });

      if (!esFechaIso(p.desde)) return res.status(400).json({ error: 'El "desde" tiene que ser un día real (AAAA-MM-DD).' });
      const hasta = p.hasta ? String(p.hasta) : null;
      if (hasta !== null && !esFechaIso(hasta)) {
        return res.status(400).json({ error: 'El "hasta" tiene que ser un día real (AAAA-MM-DD), o quedar vacío.' });
      }
      // Una ventana al revés deja la promo invisible para siempre y se ve como "no anda".
      if (hasta !== null && hasta < String(p.desde)) {
        return res.status(400).json({ error: 'El "hasta" no puede ser anterior al "desde".' });
      }

      const canales = listaDe(p.canales, CANALES);
      if (canales === null) return res.status(400).json({ error: `Canal inválido (usá ${CANALES.join(', ')}).` });
      // Sin canal no la ve nadie en ningún lado. Es el mismo caso que la lista de roles vacía en
      // `normalizarDestino`: no es lo que nadie quiso decir.
      if (canales.length === 0) return res.status(400).json({ error: 'Elegí por lo menos un canal.' });

      // ⚠️ `marcas` vacío SÍ es válido y quiere decir **las dos**. No confundir con `canales`.
      const marcas = listaDe(p.marcas, MARCAS);
      if (marcas === null) return res.status(400).json({ error: `Marca inválida (usá ${MARCAS.join(', ')}).` });

      const condiciones = Array.isArray(p.condiciones)
        ? p.condiciones.map((c) => String(c).trim()).filter(Boolean).slice(0, 20)
        : [];

      const fila = {
        id,
        banco,
        medio: String(p.medio),
        beneficio: ben.valor,
        regla: p.regla,
        desde: String(p.desde),
        hasta,
        condiciones,
        pasos: p.pasos ? String(p.pasos) : null,
        canales,
        marcas,
        // Una promo nace prendida salvo que se diga lo contrario: cargarla y que no aparezca sería
        // el primer bug que reporta quien la cargó.
        activa: p.activa === undefined ? true : !!p.activa,
        autor: yo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('agenda_promos').upsert([fila], { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id });
    }

    return res.status(400).json({ error: `action inválida (${action || 'vacía'})` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
