// "Agenda operativa": qué corre HOY. Tablas `agenda_promos`, `agenda_items` y `agenda_hechos`.
//
//   GET  ?recurso=agenda                                    → { ok, promos, items, hechos, puede }
//   POST { recurso:'agenda', action:'guardar-promo', promo }
//   POST { recurso:'agenda', action:'borrar-promo', id }
//   POST { recurso:'agenda', action:'guardar-item', item }
//   POST { recurso:'agenda', action:'borrar-item', id }
//   POST { recurso:'agenda', action:'marcar', id, fecha, nota }
//   POST { recurso:'agenda', action:'desmarcar', id, fecha }
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
//    firmar como otro. Vale igual para el `usuario` del tilde.
//
// # Lo único que se escribe SIN el sub es el tilde
//
// Cargar un pendiente es de gerencia; marcarlo hecho es de quien lo hace. El alcance del tilde no
// sale de un permiso sino del **destino**, que se filtra acá y no en la pantalla: si filtrara sólo
// la pantalla, un pendiente ajeno igual encendería el badge del menú.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { marcasConAcceso } from '../lib/permisos.core.js';
import { aplicaEn, esFechaIso, motivoReglaInvalida } from '../lib/agenda/reglas.core.js';
// El "¿a quién le llega?" ya estaba resuelto para las novedades y es exactamente la misma pregunta.
// Se importa de su carpeta en vez de mudarlo a `lib/`: mover el archivo tocaría cuatro archivos de
// Novedades, que es código compartido, y la ruta rara cuesta menos que el conflicto.
import { esParaMi, normalizarDestino } from '../lib/novedades/destino.core.js';

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
const CLASES = ['pendiente', 'aviso'];

const CAMPOS =
  'id, banco, medio, beneficio, regla, desde, hasta, condiciones, pasos, canales, marcas, activa, autor, created_at';

const CAMPOS_ITEM =
  'id, clase, titulo, cuerpo, regla, destino, marcas, manual_id, activo, autor, created_at';

const CAMPOS_HECHO = 'item_id, fecha, usuario, nota, hecho_at';

/** Los días de acuse que viajan en el GET. Espejo de `DIAS_CUMPLIMIENTO` en `lib/agenda/tipos.ts`. */
const DIAS_CUMPLIMIENTO = 30;

/**
 * El día de hoy en UTC, que es el reloj del servidor.
 *
 * 🔴 **No es el día de la persona**, y por eso acá se usa sólo para poner topes holgados —la ventana
 * del acuse, el techo de "no se tilda el futuro"—, nunca para decidir qué se ve. A las 21:00 de
 * Argentina esto ya devuelve mañana. El día que se muestra lo manda el navegador.
 */
function hoyUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** `fecha + n` días, en ISO. Sólo para correr los topes; la aritmética fina vive en el motor. */
function masDias(fecha, n) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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

      // Los ítems apagados son de administración, igual que las promos apagadas.
      let qi = supabase.from('agenda_items').select(CAMPOS_ITEM).order('titulo');
      if (!cargar) qi = qi.eq('activo', true);

      // El acuse viaja acotado a la ventana que mira Cumplimiento, con un día de más de colchón por
      // el desfasaje de UTC. Es la única tabla que crece con el uso: sin tope, en un año el GET del
      // shell se llevaría miles de tildes que nadie va a mirar.
      const desdeHechos = masDias(hoyUtc(), -(DIAS_CUMPLIMIENTO + 1));

      const [pro, ite, hec] = await Promise.all([
        q,
        qi,
        supabase.from('agenda_hechos').select(CAMPOS_HECHO).gte('fecha', desdeHechos),
      ]);
      const { data, error } = pro;
      if (error) throw new Error(error.message);
      if (ite.error) throw new Error(ite.error.message);
      if (hec.error) throw new Error(hec.error.message);

      // 🔑 El destino se resuelve ACÁ. Quien carga recibe todos los ítems porque los administra,
      // pero cada uno viaja con `paraMi`: la pestaña Hoy, el bloque de Inicio y el badge miran ese
      // campo, así que administrar un pendiente ajeno no lo mete en la lista de nadie.
      const items = (ite.data || []).map((i) => ({
        id: i.id,
        clase: i.clase,
        titulo: i.titulo,
        cuerpo: i.cuerpo,
        regla: i.regla,
        destino: normalizarDestino(i.destino),
        marcas: i.marcas || [],
        manualId: i.manual_id || null,
        activo: i.activo,
        autor: i.autor,
        creado: i.created_at,
        paraMi: esParaMi(i.destino, perfil),
      }));
      const visibles = cargar ? items : items.filter((i) => i.paraMi);
      const idsVisibles = new Set(visibles.map((i) => i.id));

      return res.status(200).json({
        ok: true,
        items: visibles,
        hechos: (hec.data || [])
          .filter((h) => idsVisibles.has(h.item_id))
          .map((h) => ({
            itemId: h.item_id,
            fecha: h.fecha,
            usuario: h.usuario,
            nota: h.nota,
            hechoAt: h.hecho_at,
          })),
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

    // ─── La escritura abierta: el tilde ───────────────────────────────────────────────────────
    //
    // Va ANTES del control del sub, y es la única que lo saltea. Cargar un pendiente es de gerencia;
    // marcarlo hecho es de quien lo hace, y pedirle un permiso a eso sería pedirle un permiso a
    // trabajar. El alcance sale del `destino`, que ya se evaluó contra este perfil.
    if (action === 'marcar' || action === 'desmarcar') {
      const id = String(b.id || '');
      const fecha = String(b.fecha || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!esFechaIso(fecha)) return res.status(400).json({ error: 'La fecha del tilde no es un día real.' });

      const { data: item, error: errItem } = await supabase
        .from('agenda_items')
        .select('id, regla, destino, activo, clase')
        .eq('id', id)
        .maybeSingle();
      if (errItem) throw new Error(errItem.message);
      if (!item) return res.status(404).json({ error: 'Ese pendiente ya no existe.' });
      if (!esParaMi(item.destino, perfil)) {
        return res.status(403).json({ error: 'Ese pendiente no es tuyo.' });
      }

      if (action === 'desmarcar') {
        // Destildar no pide más que tildar, y es a propósito: en un puesto compartido el que se da
        // cuenta del error rara vez es el mismo que lo cometió.
        const { error } = await supabase.from('agenda_hechos').delete().eq('item_id', id).eq('fecha', fecha);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (!item.activo) return res.status(400).json({ error: 'Ese pendiente está apagado.' });
      if (item.clase !== 'pendiente') return res.status(400).json({ error: 'Un aviso no se tilda.' });
      // Tildar un día en que la rutina no corre ensuciaría Cumplimiento con ocurrencias que no
      // existen, y ahí ya no se puede distinguir lo que se hizo de lo que se tildó de más.
      if (!aplicaEn(item.regla, fecha)) {
        return res.status(400).json({ error: 'Ese pendiente no corre ese día.' });
      }
      // Se puede tildar un día pasado —olvidarse y anotarlo al otro día es exactamente lo que pasa—
      // pero no el futuro. El día de más es el colchón de UTC: el servidor va tres horas adelante.
      if (fecha > masDias(hoyUtc(), 1)) {
        return res.status(400).json({ error: 'Todavía no se puede tildar un día que no llegó.' });
      }

      const nota = b.nota ? String(b.nota).trim().slice(0, 300) : null;
      // 🔑 `ignoreDuplicates`: el tilde lo pone **el primero que llega**. Sin esto, dos personas del
      // mismo puesto tildando a la vez se pisarían el nombre y "quién lo hizo" cambiaría de a ratos.
      const { error } = await supabase
        .from('agenda_hechos')
        .upsert([{ item_id: id, fecha, usuario: yo, nota }], {
          onConflict: 'item_id,fecha',
          ignoreDuplicates: true,
        });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ─── De acá para abajo, todo pide el sub ──────────────────────────────────────────────────
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

    if (action === 'borrar-item') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      // Los tildes se van con él (`on delete cascade`): un acuse sin la rutina que lo explica no le
      // sirve a nadie. Para dejar de verlo sin perder el historial está el interruptor de activo.
      const { error } = await supabase.from('agenda_items').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'guardar-item') {
      const it = b.item || {};
      const id = String(it.id || '');
      const titulo = String(it.titulo || '').trim();
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!titulo) return res.status(400).json({ error: 'Falta el título.' });
      if (!CLASES.includes(String(it.clase))) {
        return res.status(400).json({ error: `Clase inválida (usá ${CLASES.join(', ')}).` });
      }

      const motivo = motivoReglaInvalida(it.regla);
      if (motivo) return res.status(400).json({ error: motivo });

      const marcas = listaDe(it.marcas, MARCAS);
      if (marcas === null) return res.status(400).json({ error: `Marca inválida (usá ${MARCAS.join(', ')}).` });

      const fila = {
        id,
        clase: String(it.clase),
        titulo,
        cuerpo: it.cuerpo && String(it.cuerpo).trim() ? String(it.cuerpo) : null,
        regla: it.regla,
        // Ante la duda, para todos: un destino roto que no le llegue a nadie sería un pendiente
        // invisible, que es peor que uno de más. Lo decide `normalizarDestino`, no este handler.
        destino: normalizarDestino(it.destino),
        marcas,
        manual_id: it.manualId ? String(it.manualId) : null,
        activo: it.activo === undefined ? true : !!it.activo,
        autor: yo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('agenda_items').upsert([fila], { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id });
    }

    return res.status(400).json({ error: `action inválida (${action || 'vacía'})` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
