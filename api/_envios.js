// "Envíos del día": la hoja del cadete. Tablas `envios_reparto` y `envios_turno`.
//
//   GET  ?recurso=envios&fecha=YYYY-MM-DD                    → { ok, envios, cierre, puede }
//   POST { recurso:'envios', action:'traer-tn', fecha, turno, envios:[…] }
//   POST { recurso:'envios', action:'guardar', envio }
//   POST { recurso:'envios', action:'estado', id, estado }
//   POST { recurso:'envios', action:'borrar', id }
//   POST { recurso:'envios', action:'cerrar-turno', fecha, turno, pagado_al_cadete, rendido }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=envios`. El plan Hobby de
// Vercel admite 12 funciones y hay 7 usadas. Si alguien crea `api/envios.js` "por prolijidad",
// **frena todos los deploys sin error visible**: Vercel sigue sirviendo la versión anterior y no
// avisa. Ya pasó una vez.
//
// # Tres cosas que van escritas porque su ausencia se leería como un olvido
//
// 1. **No valida `store` en la puerta, y cada fila igual lleva el suyo.** El cadete sale con
//    paquetes de BDI y de Zattia en la misma mochila: el turno es uno y la rendición es una, así
//    que la pantalla no tiene selector de marca. Pero cada envío sabe de qué marca es, porque sin
//    esa columna el análisis por marca queda ciego —que es exactamente lo que pasó dos años con la
//    planilla—. El permiso se pide sobre las dos marcas: alcanza con tenerlo en una.
// 2. **El día lo manda el navegador.** El servidor corre en UTC y a las 21:00 de Argentina ya
//    devuelve mañana: si el `fecha` saliera de acá, a esa hora la hoja del cadete se vaciaría sola
//    en el medio del turno tarde. Mismo criterio que la agenda.
// 3. **`autor` sale de `perfil.name`, NUNCA del body.** Si viajara del cliente, cualquiera podría
//    firmar el cierre de caja de otro.
//
// # La escritura que de verdad importa es `traer-tn`
//
// Traer los envíos de Tienda Nube dos veces no puede duplicar un paquete: se leen los números de
// orden que ya están y se insertan sólo los que faltan. El índice único parcial de la migración es
// el segundo candado, no el primero — pero si salta, salta como error y no en silencio.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { marcasConAcceso } from '../lib/permisos.core.js';
import { ESTADOS, TURNOS, validarEnvio } from '../lib/envios/reglas.core.js';

/**
 * Siempre la base de BDI, tenga la sesión la marca que tenga. No es un descuido: el reparto no es
 * de una marca. Además Zattia no tiene service key. Mismo criterio que `_agenda.js` y `_sistema.js`.
 */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

/**
 * Ver los envíos del día es cross-marca: tildado en cualquiera de las dos alcanza, porque la hoja
 * del cadete mezcla las dos a propósito.
 *
 * ⚠️ Las marcas salen de `marcasConAcceso` y **no de `perfil.cuenta` a secas**: `cuenta` contesta
 * otra pregunta —¿está clavado a una marca?— y da vacío para todo el que puede cambiar de marca en
 * el header. Ese atajo es el que dejó Canjes roto una vez.
 */
function puedeEnvios(perfil) {
  return marcasConAcceso(perfil, 'envios', ['bdi', 'zattia']).length > 0;
}

const CAMPOS =
  'id, store, fecha, turno, origen, orden_numero, cliente, telefono, direccion, piso_depto, ' +
  'localidad, anotacion, monto_envio, envio_pagado, monto_pedido_a_cobrar, estado, vendedor, ' +
  'cadete, datos, autor, created_at, updated_at';

const CAMPOS_CIERRE = 'fecha, turno, pagado_al_cadete, rendido, cerrado_por, cerrado_en';

const esFechaIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

/** Un monto que llega del cliente. `null`/`''` es "no se cargó", que NO es cero. */
function monto(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined; // `undefined` = venía basura
}

/** `id` propio, con la misma forma que el resto del repo. */
function nuevoId() {
  return `en${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Una fila lista para la base, a partir de lo que mandó el cliente.
 *
 * Los campos que no están en la lista se caen a propósito: el cliente no escribe `created_at`, ni
 * `autor`, ni se inventa columnas. Lo accesorio viaja en `datos`, que es jsonb.
 */
function filaDe(e, yo) {
  const mEnvio = monto(e.monto_envio);
  const mSaldo = monto(e.monto_pedido_a_cobrar);
  return {
    id: e.id || nuevoId(),
    store: e.store,
    fecha: e.fecha,
    turno: e.turno,
    origen: e.origen || 'manual',
    orden_numero: e.orden_numero == null || e.orden_numero === '' ? null : String(e.orden_numero),
    cliente: e.cliente || null,
    telefono: e.telefono || null,
    direccion: String(e.direccion || '').trim(),
    piso_depto: e.piso_depto || null,
    localidad: e.localidad || null,
    anotacion: e.anotacion || null,
    monto_envio: mEnvio == null ? 0 : mEnvio,
    envio_pagado: !!e.envio_pagado,
    monto_pedido_a_cobrar: mSaldo == null ? 0 : mSaldo,
    estado: e.estado || 'pendiente',
    vendedor: e.vendedor || null,
    cadete: e.cadete || null,
    datos: e.datos && typeof e.datos === 'object' ? e.datos : {},
    autor: yo,
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const yo = perfil.name || null;
  if (!yo) return res.status(400).json({ error: 'La sesión no tiene nombre; volvé a entrar.' });

  if (!puedeEnvios(perfil)) {
    return res.status(403).json({ error: 'No tenés acceso a Envíos del día.' });
  }

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const supabase = createClient(cfg.url, cfg.key);
  const b = req.body || {};

  try {
    // ── El día ────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const fecha = req.query.fecha;
      if (!esFechaIso(fecha)) return res.status(400).json({ error: 'Falta la fecha del día (YYYY-MM-DD).' });

      const [env, cie] = await Promise.all([
        supabase.from('envios_reparto').select(CAMPOS).eq('fecha', fecha).order('created_at'),
        supabase.from('envios_turno').select(CAMPOS_CIERRE).eq('fecha', fecha),
      ]);
      if (env.error) throw new Error(env.error.message);
      if (cie.error) throw new Error(cie.error.message);

      return res.status(200).json({ ok: true, fecha, envios: env.data || [], cierres: cie.data || [] });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    // ── Traer los de Tienda Nube ──────────────────────────────────────────────
    //
    // El cliente ya bajó las órdenes (pasa por `apiFetch`, que es quien tiene la credencial del
    // Monitor) y manda las que van a la calle. Acá se validan y se insertan **sólo las que
    // faltan**: apretar el botón dos veces es lo normal —alguien entra a mirar, vuelve, aprieta— y
    // no puede terminar con el mismo paquete dos veces en la hoja.
    if (b.action === 'traer-tn') {
      const lista = Array.isArray(b.envios) ? b.envios : [];
      if (!lista.length) return res.status(400).json({ error: 'No vino ningún envío para traer.' });

      const filas = [];
      for (const e of lista) {
        const fila = filaDe({ ...e, origen: 'tn' }, yo);
        const mal = validarEnvio(fila);
        if (mal) return res.status(400).json({ error: `Orden ${e.orden_numero || '?'}: ${mal}` });
        filas.push(fila);
      }

      // Los que ya están, por (marca, número de orden). Es la misma clave del índice único.
      const numeros = filas.map((f) => f.orden_numero);
      const { data: yaEstan, error: eSel } = await supabase
        .from('envios_reparto')
        .select('store, orden_numero')
        .eq('origen', 'tn')
        .in('orden_numero', numeros);
      if (eSel) throw new Error(eSel.message);

      const vistos = new Set((yaEstan || []).map((x) => `${x.store}|${x.orden_numero}`));
      const nuevas = filas.filter((f) => !vistos.has(`${f.store}|${f.orden_numero}`));

      if (nuevas.length) {
        const { error } = await supabase.from('envios_reparto').insert(nuevas);
        if (error) throw new Error(error.message);
      }
      // Se informan las dos cuentas: "traje 2 y 3 ya estaban" es una respuesta; "listo" no lo es.
      return res.status(200).json({ ok: true, agregados: nuevas.length, ya_estaban: filas.length - nuevas.length });
    }

    // ── Alta o edición a mano (el 10% que no pasa por la tienda) ───────────────
    if (b.action === 'guardar') {
      const fila = filaDe(b.envio || {}, yo);
      const mal = validarEnvio(fila);
      if (mal) return res.status(400).json({ error: mal });

      const { error } = await supabase.from('envios_reparto').upsert(fila, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id: fila.id });
    }

    // ── El tilde del día: preparado, despachado, entregado ────────────────────
    if (b.action === 'estado') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'Falta el envío.' });
      if (!ESTADOS.includes(b.estado)) {
        return res.status(400).json({ error: `Ese estado no existe. Los válidos son: ${ESTADOS.join(', ')}.` });
      }
      const parche = { estado: b.estado, autor: yo, updated_at: new Date().toISOString() };
      // Quién lo llevó se anota cuando sale, no antes.
      if (b.cadete !== undefined) parche.cadete = b.cadete || null;

      const { data, error } = await supabase.from('envios_reparto').update(parche).eq('id', id).select('id');
      if (error) throw new Error(error.message);
      // Sin esto, tildar un envío borrado por otra pantalla contestaría "ok" y no habría pasado nada.
      if (!data || !data.length) return res.status(404).json({ error: 'Ese envío ya no está.' });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'borrar') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'Falta el envío.' });
      const { error } = await supabase.from('envios_reparto').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── El cierre de caja del turno ───────────────────────────────────────────
    //
    // 🔑 `pagado_al_cadete` es el único dato que hoy no existe en ningún lado: la planilla decía
    // cuánto se cobra de envío pero nunca cuánto cuesta el reparto, así que nunca se supo si el
    // envío se subsidia. `null` es "no se cargó" y NO es cero — guardarlo como cero diría que el
    // reparto sale gratis.
    if (b.action === 'cerrar-turno') {
      if (!esFechaIso(b.fecha)) return res.status(400).json({ error: 'Falta la fecha del turno.' });
      if (!TURNOS.includes(b.turno)) return res.status(400).json({ error: `El turno tiene que ser ${TURNOS.join(' o ')}.` });

      const pagado = monto(b.pagado_al_cadete);
      const rendido = monto(b.rendido);
      if (pagado === undefined || rendido === undefined) {
        return res.status(400).json({ error: 'Los montos del cierre tienen que ser números de cero para arriba.' });
      }

      const { error } = await supabase.from('envios_turno').upsert(
        {
          fecha: b.fecha,
          turno: b.turno,
          pagado_al_cadete: pagado,
          rendido,
          cerrado_por: yo,
          cerrado_en: new Date().toISOString(),
        },
        { onConflict: 'fecha,turno' },
      );
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acción desconocida.' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
