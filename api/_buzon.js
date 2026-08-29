// "Mensajes de clientes" — tabla `buzon_mensajes` (ver sql/migrate-buzon.sql).
//
//   GET  ?recurso=buzon                                      → { ok, mensajes, puede }
//   GET  ?recurso=buzon&abiertos=1                           → { ok, mensajes } (sólo lo sin resolver)
//   POST { recurso:'buzon', action:'guardar', mensaje }       → alta o edición
//   POST { recurso:'buzon', action:'resolver', id, accion }   → lo cierra, con quién y cuándo
//   POST { recurso:'buzon', action:'reabrir', id }
//   POST { recurso:'buzon', action:'borrar', id }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=buzon`. El plan Hobby de
// Vercel admite 12 funciones y hay 7 usadas. Si alguien crea `api/buzon.js` "por prolijidad",
// **frena todos los deploys sin error visible**. Ya pasó una vez.
//
// # Tres cosas que van escritas porque su ausencia se leería como un olvido
//
// 1. **No valida `store` en la puerta, y cada fila igual lleva el suyo.** Quien mira esta bandeja es
//    quien arma los paquetes de las dos marcas, igual que en Envíos. Pero a diferencia de Envíos,
//    acá la lista **sí se recorta a las marcas que el perfil puede ver** (`marcasConAcceso`): esto
//    guarda nombre, mail y lo que escribió una clienta, y un puesto clavado a una marca no tiene por
//    qué leer la correspondencia de la otra.
// 2. **`resuelto_por` sale de `perfil.name`, NUNCA del body.** Es la firma de quien dijo "esto ya
//    está atendido" sobre un paquete que después sale. Si viajara del cliente, cualquiera podría
//    firmar por otro.
// 3. **Resolver escribe la fecha en el MISMO parche que el tilde.** La base tiene un `check` que no
//    acepta `resuelto = true` sin `resuelto_en`, así que un handler que se olvide la fecha falla
//    fuerte en vez de dejar una fila que no se puede auditar.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { marcasConAcceso } from '../lib/permisos.core.js';
import { filaDe, normalizarOrden, validarMensaje } from '../lib/buzon/reglas.core.js';

/**
 * Siempre la base de BDI, tenga la sesión la marca que tenga. Mismo criterio que `_envios.js`: la
 * bandeja es una sola y Zattia no tiene service key.
 */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

const TABLA = 'buzon_mensajes';

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // Las marcas que esta persona puede ver. Vacío = no tiene la sección en ninguna.
  const marcas = marcasConAcceso(perfil, 'buzon', ['bdi', 'zattia']);
  if (!marcas.length) return res.status(403).json({ error: 'No tenés acceso a los mensajes de clientes.' });

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  // 🔑 El cliente se crea **tarde, y una sola vez**. No es micro-optimización: es la misma propiedad
  // que fija `tests/handlers-autorizacion.test.ts` un escalón más abajo — un pedido mal formado no
  // tiene por qué abrir una conexión con la service key, y así el 400 se puede probar sin base.
  let sb = null;
  const db = () => {
    if (!sb) sb = createClient(cfg.url, cfg.key);
    return sb;
  };
  const yo = perfil.name || perfil.email || null;

  try {
    if (req.method === 'GET') {
      let q = db().from(TABLA).select('*').in('store', marcas).order('recibido_en', { ascending: false });
      // El modo que consulta Envíos: sólo lo que puede frenar un despacho. Es el 99% de las veces
      // que se pide esto, y traer el histórico entero en cada carga de la hoja del día no se paga.
      if (req.query.abiertos === '1') q = q.eq('resuelto', false);
      const { data, error } = await q.limit(500);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, mensajes: data || [], marcas, puede: { escribir: true } });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const ahora = new Date().toISOString();

      if (b.action === 'guardar') {
        const m = b.mensaje || {};
        const mal = validarMensaje(m);
        if (mal) return res.status(400).json({ error: mal });
        // El gate de arriba dice "ve alguna marca"; éste dice "ve ESTA". Sin él, quien está clavado
        // a Zattia podría escribir un mensaje de BDI mandando `store` a mano.
        if (!marcas.includes(String(m.store).toLowerCase())) {
          return res.status(403).json({ error: `No tenés acceso a los mensajes de ${String(m.store).toUpperCase()}.` });
        }
        const fila = filaDe(m, yo, ahora);
        const { error } = await db().from(TABLA).upsert({ ...fila, updated_at: ahora }, { onConflict: 'id' });
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, id: fila.id });
      }

      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!['resolver', 'reabrir', 'borrar', 'atar'].includes(String(b.action))) {
        return res.status(400).json({ error: 'acción desconocida' });
      }
      // La acción es lo único que hace auditable el tilde, y se valida ANTES de leer la fila: un
      // pedido incompleto no abre una conexión con la service key.
      const accion = String(b.accion || '').trim();
      if (b.action === 'resolver' && !accion) {
        return res.status(400).json({ error: 'Contá en una línea qué se hizo con este mensaje.' });
      }

      // Se lee la fila antes de escribirla: sin esto, un id de la otra marca se resolvería igual.
      const { data: actual, error: eLeer } = await db().from(TABLA).select('store, resuelto').eq('id', id).maybeSingle();
      if (eLeer) throw new Error(eLeer.message);
      if (!actual) return res.status(404).json({ error: 'ese mensaje ya no está.' });
      if (!marcas.includes(actual.store)) return res.status(403).json({ error: 'ese mensaje no es de una marca que puedas ver.' });

      if (b.action === 'resolver') {
        const { error } = await db()
          .from(TABLA)
          .update({ resuelto: true, resuelto_por: yo, resuelto_en: ahora, accion: accion.slice(0, 500), updated_at: ahora })
          .eq('id', id);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (b.action === 'reabrir') {
        // 🔑 Se limpian los TRES campos, no sólo el tilde. Un mensaje abierto que dice "resuelto por
        // Sofi el lunes" es el registro de algo que se dio por atendido y no lo está — el mismo
        // criterio que `selloDeEntrega` en Envíos, que borra la hora al volver atrás.
        const { error } = await db()
          .from(TABLA)
          .update({ resuelto: false, resuelto_por: null, resuelto_en: null, accion: null, updated_at: ahora })
          .eq('id', id);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      // ⚠️ El verbo acepta además el nombre viejo (`borrar`). **No es indecisión: es que una pestaña
      // abierta manda el verbo del bundle que bajó**, y el día del deploy los dos conviven.
      if (b.action === 'eliminar' || b.action === 'borrar') {
        const { error } = await db().from(TABLA).delete().eq('id', id);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      // `atar` es el último: las cuatro acciones ya están validadas arriba.
      {
        // Atar un mensaje suelto a una orden. Es el verbo que enciende el freno, así que el número
        // pasa por `normalizarOrden`: `#1234` guardado tal cual no matchea con nada y la pastilla
        // no aparece nunca.
        const orden = normalizarOrden(b.orden_numero);
        const { error } = await db().from(TABLA).update({ orden_numero: orden, updated_at: ahora }).eq('id', id);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, orden_numero: orden });
      }
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
