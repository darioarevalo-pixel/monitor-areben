// El portal de votación de diseños: lo que ve y manda quien abre `/votacion/<token>`.
//
//   GET  /api/datos?recurso=votacion&token=XXX&votanteId=YYY   → { ok, votacion, miBoleta }
//   POST { recurso:'votacion', token, votanteId, nombre, puntajes }  → guarda SU boleta
//
// ⚠️ **Es lo único de Diseños abierto a internet**, así que conviene leerlo con esa lente.
//
// CÓMO SE PROTEGE (no hay sesión: la llave es el token)
//   - El token son 64 hex aleatorios, único por ronda, con vencimiento, y `cerrar` lo revoca.
//   - Token inválido, vencido o de una ronda cerrada → **404 pelado**. No dice "existe pero se
//     cerró" ni "no existe": desde afuera son indistinguibles, así que el link no sirve para
//     averiguar nada.
//   - La respuesta se arma campo por campo (`paraElVotante`, en `lib/disenos/votacion.core.js`):
//     no se hace `select *` ni se filtra después. **La `nota` del tablero no viaja** —"Pros /
//     contras" es un juicio interno del equipo— ni el `estado`, ni los 👍/👎 de la oficina.
//   - Sólo se puede escribir la boleta de ESE `votanteId` en ESA ronda, y sólo `nombre` y
//     `puntajes`. Nada de la ronda, nada de otra persona, nada del tablero.
//   - Topes: nombre 60 chars, 200 puntajes por boleta, 300 votantes por ronda (para que alguien
//     con el link no llene la tabla). Los hace cumplir el servidor, no la pantalla.
//
// POR QUÉ BUSCA EN LAS DOS BASES: el link no dice de qué marca es la ronda, y el tablero de
// diseños es dual-base. Mismo caso —y mismo molde— que `buscarPorToken` en `api/_reclamo.js`.
//
// POR QUÉ EL SNAPSHOT ESTÁ CONGELADO EN LA FILA: este handler no le pregunta nada a la tabla
// `disenos`. El link tiene que abrir aunque alguien saque el diseño del tablero mientras la gente
// vota, y así el portal no tiene forma de leer un diseño que no está en su ronda.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby admite 12 funciones.
import { createClient } from '@supabase/supabase-js';
import { paraElVotante, sanearPuntajes, TOPE_NOMBRE, TOPE_VOTANTES } from '../lib/disenos/votacion.core.js';

const STORES = ['bdi', 'zattia'];

/** Idéntica a la de `api/_disenos.js` y `api/_disenos-rondas.js`. */
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

/** Las únicas columnas que se leen. Lo que no está acá no puede filtrarse por error. */
const COLS = 'id, store, titulo, disenos, token_vence, cerrada_at';

/**
 * Busca la ronda del token en las dos bases. `null` si no existe, venció o ya se cerró — las tres
 * se contestan igual desde afuera.
 */
async function buscarPorToken(token) {
  for (const store of STORES) {
    const cfg = cfgFor(store);
    if (!cfg.url || !cfg.key) continue;
    const supabase = createClient(cfg.url, cfg.key);
    const { data, error } = await supabase.from('disenos_rondas').select(COLS).eq('token', token).maybeSingle();
    // El error se loguea aunque el votante vea 404 igual. Sin esto, un problema de base (una
    // columna que no existe, credenciales vencidas) se ve EXACTAMENTE igual que un link inválido,
    // y nadie entiende por qué "el link no anda". Ya pasó en `_reclamo.js`.
    if (error) console.error(`[votacion] ${store}: ${error.message}`);
    if (!data) continue;
    if (data.cerrada_at) return null;
    if (data.token_vence && new Date(data.token_vence).getTime() < Date.now()) return null;
    return { fila: data, supabase };
  }
  return null;
}

export default async function handler(req, res) {
  // Este endpoint NO usa `soloMismoOrigen`: lo abre el equipo desde su celular, con el link. (El
  // router `api/datos.js` sí lo aplica, y alcanza: el portal se sirve del mismo dominio.)
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = String((req.method === 'POST' ? (req.body || {}).token : req.query.token) || '').trim();
  // Un token con forma inválida ni siquiera se consulta.
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return res.status(404).json({ error: 'no encontrado' });

  const hallazgo = await buscarPorToken(token);
  if (!hallazgo) return res.status(404).json({ error: 'no encontrado' });
  const { fila, supabase } = hallazgo;

  try {
    const votanteId = String((req.method === 'POST' ? (req.body || {}).votanteId : req.query.votanteId) || '').slice(0, 60);

    if (req.method === 'GET') {
      // Su propia boleta, para que pueda volver al link y corregir lo que puso. Sólo la suya: las
      // de los demás no salen del portal, se ven adentro del monitor.
      let miBoleta = null;
      if (votanteId) {
        const { data } = await supabase
          .from('disenos_votos')
          .select('nombre, puntajes')
          .eq('ronda_id', fila.id)
          .eq('votante_id', votanteId)
          .maybeSingle();
        if (data) miBoleta = { nombre: data.nombre || '', puntajes: data.puntajes || {} };
      }
      return res.status(200).json({ ok: true, votacion: paraElVotante(fila), miBoleta });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
    if (!votanteId) return res.status(400).json({ error: 'falta votanteId' });

    const b = req.body || {};
    // Filtrado contra los ids de ESTA ronda y contra la escala. Un control que sólo vive en la
    // pantalla del votante no es un control.
    const ids = paraElVotante(fila).disenos.map((d) => d.id);
    const puntajes = sanearPuntajes(b.puntajes, ids);
    const nombre = String(b.nombre || '').trim().slice(0, TOPE_NOMBRE);

    // El tope de votantes se mira antes de insertar, y sólo si es alguien nuevo: quien ya votó
    // puede corregir siempre, aunque la ronda esté llena.
    const { count, error: eC } = await supabase
      .from('disenos_votos')
      .select('votante_id', { count: 'exact', head: true })
      .eq('ronda_id', fila.id);
    if (eC) throw new Error(eC.message);
    if ((count || 0) >= TOPE_VOTANTES) {
      const { data: ya } = await supabase
        .from('disenos_votos')
        .select('votante_id')
        .eq('ronda_id', fila.id)
        .eq('votante_id', votanteId)
        .maybeSingle();
      if (!ya) return res.status(400).json({ error: 'Esta votación ya tiene demasiados votantes.' });
    }

    // La boleta entera se pisa (clave `ronda_id, votante_id`): volver al link CORRIGE el voto en
    // vez de apilar otro. Y por eso no hay `apilar()` acá: no hay array que releer y reescribir.
    const { error } = await supabase.from('disenos_votos').upsert(
      { ronda_id: fila.id, votante_id: votanteId, nombre, puntajes, updated_at: new Date().toISOString() },
      { onConflict: 'ronda_id,votante_id' },
    );
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true, guardados: Object.keys(puntajes).length });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 200) });
  }
}
