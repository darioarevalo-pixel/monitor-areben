// El reclamo visto por el CLIENTE, desde el link que se le pasa por WhatsApp. **Es lo único de
// todo el módulo que está abierto a internet**, así que conviene leerlo con esa lente.
//
//   GET  /api/postventa?recurso=reclamo&token=XXX          → los pocos datos que el cliente ve.
//   POST { recurso:'reclamo', token, accion:'foto', dataUrl }   → suma UNA foto.
//   POST { recurso:'reclamo', token, accion:'enviar', relato }  → cierra la carga → 'en_revision'.
//
// CÓMO SE PROTEGE (no hay sesión: la llave es el token)
//   - El token son 64 hex aleatorios, único por reclamo, con vencimiento y revocable.
//   - Token inválido, vencido o de un reclamo ya resuelto → **404 pelado**. No dice "existe pero
//     venció" ni "no existe": desde afuera son indistinguibles, así que el link no sirve para
//     averiguar nada.
//   - Solo se puede escribir en el reclamo de ese token, y solo dos campos: fotos y relato.
//   - Tope de 6 fotos por reclamo (evita que alguien con el link llene el Blob).
//   - La respuesta se arma campo por campo: no se hace `select *` ni se filtra después. Lo que no
//     está en `VISIBLE_AL_CLIENTE` no viaja, aunque mañana alguien agregue una columna sensible.
//
// El token se busca en las dos bases (BDI y ZATTIA) porque el link no dice de qué marca es. Son
// dos consultas por índice; el token es único e inadivinable, así que no abre nada.
import { createClient } from '@supabase/supabase-js';
import { subirDataUrl } from './_blob.js';

const STORES = ['bdi', 'zattia'];
const MAX_FOTOS = 6;
/** Estados en los que el link todavía sirve. Después, el reclamo ya se decidió. */
const ABIERTO = ['borrador', 'esperando_cliente', 'en_revision'];

function cfgFor(store) {
  if (store === 'zattia') {
    return { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY };
  }
  return { url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co', key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY };
}

/** Las únicas columnas que se leen. Lo que no está acá no puede filtrarse por error. */
const VISIBLE_AL_CLIENTE = 'id, store, orden_tn, estado, motivo, items, fotos, relato_cliente, token_vence';

/** Busca el reclamo del token en las dos bases. Devuelve null si no existe, venció o ya cerró. */
async function buscarPorToken(token) {
  for (const store of STORES) {
    const cfg = cfgFor(store);
    if (!cfg.url || !cfg.key) continue;
    const supabase = createClient(cfg.url, cfg.key);
    const { data, error } = await supabase.from('devoluciones').select(VISIBLE_AL_CLIENTE).eq('token', token).maybeSingle();
    // El error se loguea aunque el cliente vea 404 igual. Sin esto, un problema de base (una
    // columna que no existe, credenciales vencidas) se ve EXACTAMENTE igual que un link inválido,
    // y nadie entiende por qué "el link no anda". Pasó: el select pedía una columna inexistente.
    if (error) console.error(`[reclamo] ${store}: ${error.message}`);
    if (!data) continue;
    if (data.token_vence && new Date(data.token_vence).getTime() < Date.now()) return null;
    if (!ABIERTO.includes(data.estado)) return null;
    return { fila: data, supabase, store };
  }
  return null;
}

/**
 * Lo que se le muestra al cliente: su reclamo y nada más. Sin precios ni datos internos.
 *
 * Se exporta para poder testearla: es la última barrera antes de que algo salga a internet, y un
 * campo de más acá no rompe nada visible — simplemente se filtra. `tests/reclamo-publico.test.ts`
 * le pasa una fila con todo lo sensible adentro y verifica que no aparezca.
 */
export function paraElCliente(fila) {
  return {
    // El número se DERIVA del id (`R-0042`), no se guarda: es una forma de mostrarlo, no un dato.
    // Espejo de `numeroReclamo` en lib/reclamos/tipos.ts (acá no se puede importar TS): si cambia
    // uno hay que cambiar el otro, y este es el que ve el cliente.
    numero: 'R-' + String(fila.id ?? '').padStart(4, '0'),
    orden: fila.orden_tn,
    estado: fila.estado,
    // Solo qué productos son: ni precio, ni costo, ni ids de Gestión Nube.
    productos: (Array.isArray(fila.items) ? fila.items : []).map((i) => ({
      producto: i.producto,
      variante: i.variante ?? null,
      cantidad: i.cantidad,
    })),
    fotos: (Array.isArray(fila.fotos) ? fila.fotos : []).map((f) => f.url),
    relato: fila.relato_cliente || '',
    puedeSubir: (Array.isArray(fila.fotos) ? fila.fotos.length : 0) < MAX_FOTOS,
  };
}

export default async function handler(req, res) {
  // Este endpoint NO usa `soloMismoOrigen`: lo abre el cliente desde su celular, con el link.
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = String((req.method === 'POST' ? (req.body || {}).token : req.query.token) || '').trim();
  // Un token con forma inválida ni siquiera se consulta.
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return res.status(404).json({ error: 'no encontrado' });

  const hallazgo = await buscarPorToken(token);
  if (!hallazgo) return res.status(404).json({ error: 'no encontrado' });
  const { fila, supabase } = hallazgo;

  try {
    if (req.method === 'GET') return res.status(200).json({ ok: true, reclamo: paraElCliente(fila) });
    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const accion = String((req.body || {}).accion || '');
    const fotos = Array.isArray(fila.fotos) ? fila.fotos : [];

    if (accion === 'foto') {
      if (fotos.length >= MAX_FOTOS) return res.status(400).json({ error: `Ya subiste ${MAX_FOTOS} fotos, que es el máximo.` });
      const r = await subirDataUrl((req.body || {}).dataUrl, 'reclamos');
      if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
      const nuevas = fotos.concat([{ url: r.url, at: new Date().toISOString(), por: 'cliente' }]);
      const { error } = await supabase.from('devoluciones').update({ fotos: nuevas, updated_at: new Date().toISOString() }).eq('id', fila.id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, url: r.url, restantes: MAX_FOTOS - nuevas.length });
    }

    if (accion === 'enviar') {
      const relato = String((req.body || {}).relato || '').slice(0, 2000);
      const historial = [{ estado: 'en_revision', at: new Date().toISOString(), usuario: 'cliente', nota: 'cargó fotos y descripción' }];
      const { data: previo } = await supabase.from('devoluciones').select('historial').eq('id', fila.id).single();
      const { error } = await supabase.from('devoluciones').update({
        relato_cliente: relato || fila.relato_cliente,
        estado: 'en_revision',
        historial: (Array.isArray(previo?.historial) ? previo.historial : []).concat(historial),
        updated_at: new Date().toISOString(),
      }).eq('id', fila.id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'acción desconocida' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 200) });
  }
}
