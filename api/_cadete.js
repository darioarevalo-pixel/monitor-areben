// La hoja del día vista por el CADETE, desde el link que le mandan por WhatsApp. **Es lo único de
// Envíos abierto a internet**, así que conviene leerlo con esa lente.
//
//   GET  /api/postventa?recurso=cadete&token=XXX&pin=NNNN[&fecha=YYYY-MM-DD]
//   POST { recurso:'cadete', token, pin, id, accion:'entregado'|'no_entregado'|'cobrado'|'no_cobrado' }
//
// CÓMO SE PROTEGE (no hay sesión: la llave es el token + el PIN)
//   - El token son 64 hex aleatorios, con vencimiento, y se rota el 1º de cada mes desde la pantalla.
//   - Token con forma inválida → 404 **sin tocar la base**.
//   - Token inexistente y token vencido → **el mismo 404 pelado**. Desde afuera son indistinguibles,
//     así que el link no sirve para averiguar si alguna vez existió.
//   - PIN incorrecto → 401, y **con el cuerpo vacío**: la lista no se arma antes de chequearlo.
//     Es una desviación deliberada del 404-para-todo, y es correcta: lo que no puede ser sondeable
//     es el token; el PIN el cadete lo tiene que poder corregir arriba de la moto.
//   - 10 fallos de PIN → trabado 15 minutos. Cuatro dígitos son 10.000 combinaciones.
//   - 🔴 **El día se acota a ±1 del día del servidor.** Sin eso, un link filtrado devuelve la agenda
//     entera de direcciones y teléfonos. Es la barrera más importante del archivo.
//   - La respuesta se arma campo por campo en `paraElCadete`: nunca `select *` ni `{...fila}`.
//   - La escritura es una lista cerrada de cuatro parches fijos: el body no se copia nunca.
//
// ⛔ Archivo `_`: NO es una ruta. Entra por `api/postventa.js` con `?recurso=cadete`, que es la
// puerta donde ya viven los otros dos portales sin sesión. Crear `api/cadete.js` "por prolijidad"
// frena todos los deploys sin error visible.
import { createClient } from '@supabase/supabase-js';
import { fechaDelPortal, MAX_FALLOS_PIN, MINUTOS_TRABADO, paraElCadete, parcheDeAccion, pinTrabado } from '../lib/envios/portal.core.js';

/**
 * Siempre la base de BDI, como todo Envíos: el reparto no es de una marca y el cadete sale con las
 * dos en la misma mochila. Mismo criterio —y mismos valores— que `cfgMaestra` en `_envios.js`.
 */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

/**
 * Las únicas columnas que se leen de un envío.
 *
 * ⛔ **Sin `datos`.** Ahí adentro está la orden de Tienda Nube entera: mail de la clienta, total,
 * medio de pago, cuotas, ítems. Tampoco `vendedor` ni `autor`, que son nombres de gente de acá.
 * Lo que no está en esta lista no puede filtrarse por error, ni aunque mañana alguien agregue una
 * columna sensible a la tabla.
 */
const VISIBLE_AL_CADETE =
  'id, store, turno, orden_numero, cliente, telefono, direccion, piso_depto, localidad, anotacion, ' +
  'monto_envio, envio_pagado, envio_bonificado, monto_pedido_a_cobrar, estado, cobrado';

/** El día de hoy según el servidor, en ISO. Corre en UTC: por eso `fechaDelPortal` da ±1 de gracia. */
function hoyDelServidor() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  // Este endpoint NO usa `soloMismoOrigen`: lo abre el cadete desde su celular, con el link.
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const body = req.body || {};
  const token = String((req.method === 'POST' ? body.token : req.query.token) || '').trim();
  const pin = String((req.method === 'POST' ? body.pin : req.query.pin) || '').trim();

  // Un token con forma inválida ni siquiera se consulta.
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return res.status(404).json({ error: 'no encontrado' });

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales.' });
  const supabase = createClient(cfg.url, cfg.key);

  const { data: portal, error: ePortal } = await supabase
    .from('envios_portal')
    .select('id, token, token_vence, pin, pin_fallos, pin_bloqueado_hasta')
    .eq('id', 'cadete')
    .maybeSingle();
  // Se loguea aunque afuera se vea un 404 igual: sin esto, un problema de base —una columna que no
  // existe, credenciales vencidas— se ve EXACTAMENTE igual que un link inválido, y nadie entiende
  // por qué "el link no anda". Ya pasó en el portal de reclamos, con esas palabras.
  if (ePortal) console.error(`[cadete] portal: ${ePortal.message}`);

  const ahora = new Date().toISOString();
  // 🔑 Token que no coincide y token vencido salen por la MISMA puerta y con el mismo cuerpo.
  if (!portal || portal.token !== token) return res.status(404).json({ error: 'no encontrado' });
  if (Date.parse(portal.token_vence) < Date.parse(ahora)) return res.status(404).json({ error: 'no encontrado' });

  if (pinTrabado(portal, ahora)) {
    return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en un rato.' });
  }

  // 🔴 El PIN se chequea ANTES de armar nada. El mutante es leer los envíos primero y mandarlos
  // igual junto al 401: el cuerpo viaja lo mismo y el PIN deja de proteger algo.
  if (!portal.pin || pin !== portal.pin) {
    const fallos = (portal.pin_fallos || 0) + 1;
    const parche = { pin_fallos: fallos };
    if (fallos >= MAX_FALLOS_PIN) {
      parche.pin_bloqueado_hasta = new Date(Date.now() + MINUTOS_TRABADO * 60000).toISOString();
      parche.pin_fallos = 0;
    }
    await supabase.from('envios_portal').update(parche).eq('id', 'cadete');
    return res.status(401).json({ error: 'PIN incorrecto', envios: [] });
  }

  // Un PIN correcto borra la cuenta: los fallos que importan son los seguidos.
  if (portal.pin_fallos) await supabase.from('envios_portal').update({ pin_fallos: 0 }).eq('id', 'cadete');

  try {
    const pedida = req.method === 'POST' ? body.fecha : req.query.fecha;
    const fecha = fechaDelPortal(pedida, hoyDelServidor());
    if (!fecha) return res.status(400).json({ error: 'Ese día no se puede pedir desde acá.' });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('envios_reparto')
        .select(VISIBLE_AL_CADETE)
        .eq('fecha', fecha)
        .order('turno');
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, fecha, envios: (data || []).map(paraElCadete) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const id = String(body.id || '');
    if (!id) return res.status(400).json({ error: 'Falta el envío.' });

    // 🔴 El parche sale de la lista cerrada, NUNCA del body. El mutante es `{ ...body }`: con eso,
    // cualquiera con el link reescribe precios, nombres y direcciones.
    const parche = parcheDeAccion(String(body.accion || ''));
    if (!parche) return res.status(400).json({ error: 'Esa acción no existe.' });

    const { data, error } = await supabase
      .from('envios_reparto')
      .update({
        ...parche,
        // Literal, nunca del body: si viajara del cliente, cualquiera firmaría por otro. Y no se
        // escribe la columna `cadete` (el nombre): eso sería texto libre desde internet.
        autor: 'cadete (portal)',
        updated_at: ahora,
      })
      .eq('id', id)
      // 🔑 El día ata la escritura. Un id filtrado de otro día no se toca ni por error.
      .eq('fecha', fecha)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data || !data.length) return res.status(404).json({ error: 'Ese envío no es de hoy.' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(`[cadete] ${e.message}`);
    return res.status(500).json({ error: 'No se pudo guardar.' });
  }
}
