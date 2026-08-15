// Friday memo — el depósito semanal de Dirección. Tablas `memo_semana` + `memo_campo`.
//
//   GET  ?recurso=memo                        → { ok, semanas, actual, hoy, puede }
//   GET  ?recurso=memo&id=w2026-08-10         → { ok, memo, campos }
//   GET  ?recurso=memo&vista=foto&id=w…       → { ok, foto }   (calculada en vivo)
//   POST { recurso:'memo', accion:'guardar-campo', id, bloque, clave, texto }
//   POST { recurso:'memo', accion:'senales',       id, senales }
//   POST { recurso:'memo', accion:'cerrar',        id }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=memo`. El plan Hobby de
// Vercel admite 12 funciones y crear `api/memo.js` "por prolijidad" **frena todos los deploys sin
// error visible**: Vercel sigue sirviendo la versión anterior y no avisa. Ya pasó una vez.
//
// # Qué es este archivo y qué NO es
//
// El panel Gerencial es "qué decidir ahora": señales vivas, sin memoria y sin corte. Este es la otra
// mitad — "qué pasó esta semana", con fecha y con firma. Calcula dos bloques (venta y pauta) y
// guarda todo lo demás.
//
// # 🔑 Las dos fotos se congelan en momentos distintos, y confundirlas es el modo de fallar
//
// - **Venta y pauta** son un rango de fechas CERRADO: dan la misma respuesta se pregunten cuando se
//   pregunten. Se congelan cuando la semana terminó (`accion:'cerrar'`), y hasta entonces se
//   calculan en vivo y la pantalla las muestra como parciales.
// - **Capital parado y pendientes** se mueven solos (`daysSinceLast` sube todos los días). Se
//   congelan **cuando se toman** y van rotuladas con esa fecha. Si se congelaran perezosamente —el
//   primero que abre el memo en octubre— el memo de agosto mostraría el stock de octubre con cara
//   de dato de agosto. Eso no es un dato viejo: es un dato falso.
//
// # Por qué las señales llegan del CLIENTE y no las calcula este handler
//
// Capital parado y pendientes salen del ETL, que vive en el navegador (IndexedDB, ~14,7 MB en BDI)
// y lo calculan los detectores de `lib/gerencial/`. Recalcularlos acá sería una segunda
// implementación de la misma pregunta, y dos implementaciones dan dos respuestas. La pantalla manda
// lo que el panel Gerencial ya computó y este archivo lo guarda tal cual, sellando la fecha del
// servidor. Es un depósito, no un segundo detector.
//
// # El cierre no lo dispara un cron
//
// El plan Hobby no da cron por minuto. Lo dispara una persona desde la pantalla, y sólo se puede
// cuando la semana ya terminó. Que dependa de alguien es correcto justamente para venta y pauta:
// no derivan, así que da igual si se cierra el lunes o el jueves siguiente.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, marcasConAcceso } from '../lib/permisos.core.js';
import { leerSnapshot } from '../lib/meta-ads/leer-snapshot.core.js';
import { calcularRentabilidad, normalizar } from '../lib/meta-ads/rentabilidad.core.js';
import { claveValida, cerrada, esFecha, hoyAr, idSemana, semanaAnterior, semanaDe } from '../lib/memo/semana.core.js';
import { fusionarVenta, pautaPorLinea, ventaPorLinea } from '../lib/memo/foto.core.js';

/** La base maestra: el memo no tiene marca. Mismo criterio que novedades. */
function clienteMaestro() {
  const url = process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** La base de una marca, para la consulta de venta. Mismo `cfgFor` que `_liquidacion.js`. */
function clienteDe(store) {
  const cfg = store === 'zattia'
    ? { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY }
    : { url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co', key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY };
  if (!cfg.url || !cfg.key) return null;
  return createClient(cfg.url, cfg.key);
}

/**
 * PostgREST corta en 1.000 filas y NO avisa: devuelve las primeras mil como si fueran todas. Una
 * semana de detalles de BDI ronda las 2.400 filas, así que sin paginar el memo perdería más de la
 * mitad de la venta en silencio — y un número bajo se lee como "una semana floja", no como un bug.
 */
async function leerTodo(sb, tabla, armar) {
  const PAGINA = 1000;
  const out = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar(sb.from(tabla)).range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if ((data || []).length < PAGINA) return out;
  }
}

/**
 * La venta de una marca en un rango, por línea.
 *
 * 🔑 **Por qué esto no sale del ETL.** El ETL trae ventas en ventanas fijas (7/15/30/60/90 días y
 * meses cerrados) y su `select` de `venta_detalles` es `sale_id, product_id, size_id, size,
 * quantity` — **sin plata**. `unit_price` y `total` están en la tabla y no se bajan a propósito: el
 * payload de BDI ya pesa ~14,7 MB y dos columnas más las pagarían las 42 secciones. El razonamiento
 * completo está en `lib/liquidacion/ventas.ts`, que resuelve lo mismo para una campaña.
 *
 * ⚠️ Y la ventana de 7 días del ETL tampoco sirve aunque parezca: es MÓVIL, corta ayer y está en
 * unidades. No es la semana cerrada y no es plata.
 */
async function traerRango(store, desde, hasta) {
  const sb = clienteDe(store);
  if (!sb) return { error: `Faltan credenciales de ${store}.`, ventas: [], detalles: [], skuPor: null };

  try {
    const ventas = await leerTodo(sb, 'ventas', (q) =>
      q.select('id, date_sale').gte('date_sale', desde).lte('date_sale', hasta).order('id'));
    if (!ventas.length) return { ventas: [], detalles: [], skuPor: null };

    // `venta_detalles` no tiene fecha propia: el sale_id es el único puente. El rango de ids
    // arrastra ventas de otras fechas, y por eso el cruce de `ventaPorLinea` filtra por la fecha
    // real y no por el rango.
    const min = ventas[0].id;
    const max = ventas[ventas.length - 1].id;
    const detalles = await leerTodo(sb, 'venta_detalles', (q) =>
      q.select('sale_id, product_id, quantity, total').gte('sale_id', min).lte('sale_id', max).order('sale_id'));

    // El SKU sólo hace falta en Zattia, que es donde vive Stunned. Pedirlo en BDI sería una consulta
    // entera para una pregunta cuya respuesta ya se sabe.
    let skuPor = null;
    if (store === 'zattia') {
      const pids = [...new Set(detalles.map((d) => Number(d.product_id)).filter((n) => Number.isInteger(n) && n > 0))];
      skuPor = new Map();
      for (let i = 0; i < pids.length; i += 200) {
        const grupo = pids.slice(i, i + 200);
        const prods = await leerTodo(sb, 'productos', (q) => q.select('id, sku').in('id', grupo).order('id'));
        for (const p of prods) skuPor.set(String(p.id), p.sku);
      }
    }

    return { ventas, detalles, skuPor };
  } catch (e) {
    return { error: `${store}: ${e.message}`, ventas: [], detalles: [], skuPor: null };
  }
}

/** Los techos de costo por compra, por línea. Se leen; no se recalculan acá. */
async function techosDe(sb) {
  const { data, error } = await sb.from('meta_ads_rentabilidad').select('linea, supuestos');
  if (error) return {};
  const out = {};
  for (const f of data || []) {
    try {
      out[f.linea] = calcularRentabilidad(normalizar(f.supuestos)).costoMax;
    } catch {
      // Un supuesto corrupto de una línea no puede dejar al memo entero sin techos.
    }
  }
  return out;
}

/**
 * Venta y pauta de una semana, con la anterior al lado para el delta.
 *
 * Las dos semanas se piden en UNA consulta de 14 días por base y se parten acá: dos consultas
 * seguidas al mismo rango contiguo es pagar dos veces el mismo viaje.
 */
async function calcularFoto(sb, sem) {
  const prev = semanaAnterior(sem);
  const problemas = [];

  // Las dos semanas salen de UNA consulta de 14 días por base: son un rango contiguo, y pedirlas
  // por separado es pagar dos veces el mismo viaje. `ventaPorLinea` ya filtra por la fecha real de
  // cada venta, así que partirlas después es recortar el mismo cruce con dos rangos distintos.
  const [bdi, zattia] = await Promise.all([
    traerRango('bdi', prev.ini, sem.fin),
    traerRango('zattia', prev.ini, sem.fin),
  ]);
  if (bdi.error) problemas.push(bdi.error);
  if (zattia.error) problemas.push(zattia.error);

  const porSemana = (r) => ({
    actual: ventaPorLinea({ ...r, desde: sem.ini, hasta: sem.fin }),
    previa: ventaPorLinea({ ...r, desde: prev.ini, hasta: prev.fin }),
  });
  const vb = porSemana({ store: 'bdi', ...bdi });
  const vz = porSemana({ store: 'zattia', ...zattia });

  const ventaActual = fusionarVenta(vb.actual, vz.actual);
  const ventaPrevia = fusionarVenta(vb.previa, vz.previa);

  const cols = 'fecha, linea, spend, compras, revenue';
  const { filas, error } = await leerSnapshot(sb, { cols, desde: prev.ini, hasta: sem.fin, nivel: 'campania' });
  if (error) problemas.push(`Meta Ads: ${error}`);
  const dias = filas || [];
  const pautaActual = pautaPorLinea(dias.filter((f) => f.fecha >= sem.ini && f.fecha <= sem.fin));
  const pautaPrevia = pautaPorLinea(dias.filter((f) => f.fecha >= prev.ini && f.fecha <= prev.fin));

  return {
    semana: { ini: sem.ini, fin: sem.fin },
    previa: { ini: prev.ini, fin: prev.fin },
    venta: { actual: ventaActual, previa: ventaPrevia },
    pauta: { actual: pautaActual, previa: pautaPrevia },
    techos: await techosDe(sb),
    problemas,
  };
}

/** ¿Ese id es una semana de verdad? Un id que no es un lunes crearía semanas fantasma. */
function semanaDelId(id) {
  if (typeof id !== 'string' || !id.startsWith('w')) return null;
  const ini = id.slice(1);
  if (!esFecha(ini)) return null;
  const sem = semanaDe(ini);
  return sem.id === idSemana(ini) && sem.ini === ini ? sem : null;
}

/** Crea la fila de la semana si todavía no existe. Escribir es lo que la hace nacer, no abrirla. */
async function asegurarSemana(sb, sem) {
  const { data, error } = await sb.from('memo_semana').select('id').eq('id', sem.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;
  const { error: e2 } = await sb.from('memo_semana').insert([{ id: sem.id, ini: sem.ini, fin: sem.fin }]);
  // Dos personas escribiendo el primer campo a la vez: la segunda choca contra la PK y está bien.
  if (e2 && !String(e2.message).includes('duplicate key')) throw new Error(e2.message);
}

const CAMPOS_SEMANA = 'id, ini, fin, estado, foto, foto_tomada_at, senales, senales_tomadas_at, cerrado_at, cerrado_por, updated_at';

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const yo = perfil.name || null;
  if (!yo) return res.status(400).json({ error: 'La sesión no tiene nombre; volvé a entrar.' });

  const sb = clienteMaestro();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });

  // Ver el memo: el permiso `memo` en cualquiera de las dos marcas (no tiene marca, así que
  // tildarlo en una alcanza). Escribirlo: admin — que es lo que son Bruno y Darío. El día que
  // escriba alguien más, esto pasa a ser un sub-permiso `memo.escribir` y cambia sólo acá.
  const puedeVerMemo = esAdmin(perfil) || marcasConAcceso(perfil, 'memo', ['bdi', 'zattia']).length > 0;
  if (!puedeVerMemo) return res.status(403).json({ error: 'No tenés permiso para ver el memo semanal.' });
  const escribir = esAdmin(perfil);

  const hoy = hoyAr();

  try {
    if (req.method === 'GET') {
      const vista = String(req.query.vista || '');
      const id = String(req.query.id || '');

      if (vista === 'foto') {
        const sem = semanaDelId(id);
        if (!sem) return res.status(400).json({ error: 'semana inválida' });
        return res.status(200).json({ ok: true, foto: await calcularFoto(sb, sem) });
      }

      if (id) {
        const sem = semanaDelId(id);
        if (!sem) return res.status(400).json({ error: 'semana inválida' });
        const { data, error } = await sb.from('memo_semana').select(CAMPOS_SEMANA).eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        const { data: campos, error: e2 } = await sb
          .from('memo_campo').select('bloque, clave, autor, texto, updated_at').eq('memo_id', id);
        if (e2) throw new Error(e2.message);
        // Una semana que nadie escribió todavía NO existe en la base, y contestar 404 obligaría a
        // la pantalla a inventar el caso. Se devuelve la semana vacía: la fila nace al escribir.
        const memo = data || { id: sem.id, ini: sem.ini, fin: sem.fin, estado: 'abierto', foto: null, senales: null };
        return res.status(200).json({ ok: true, memo, campos: campos || [], puede: { escribir }, hoy });
      }

      const { data, error } = await sb
        .from('memo_semana').select('id, ini, fin, estado, cerrado_at').order('ini', { ascending: false }).limit(120);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, semanas: data || [], actual: semanaDe(hoy), hoy, puede: { escribir } });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    // ⚠️ El `Content-Type: application/json` no es opcional: sin él Vercel no parsea el cuerpo y el
    // handler contestaría "falta id" señalando a quien llama en vez de a la cabecera que falta.
    const b = req.body || {};
    if (!escribir) return res.status(403).json({ error: 'Sólo un administrador puede escribir en el memo.' });

    const sem = semanaDelId(String(b.id || ''));
    if (!sem) return res.status(400).json({ error: 'semana inválida' });
    const accion = String(b.accion || '');

    if (accion === 'guardar-campo') {
      const bloque = String(b.bloque || '');
      const clave = String(b.clave || '');
      if (!claveValida(bloque, clave)) return res.status(400).json({ error: `campo inválido (${bloque}/${clave})` });

      await asegurarSemana(sb, sem);
      const ahora = new Date().toISOString();
      // 🔑 Una fila por (semana, bloque, clave, AUTOR). Es lo que hace que Bruno y Darío puedan
      // escribir el mismo tema el mismo viernes sin que el segundo pise al primero.
      const { error } = await sb.from('memo_campo').upsert(
        [{ memo_id: sem.id, bloque, clave, autor: yo, texto: String(b.texto || ''), updated_at: ahora }],
        { onConflict: 'memo_id,bloque,clave,autor' },
      );
      if (error) throw new Error(error.message);
      await sb.from('memo_semana').update({ updated_at: ahora }).eq('id', sem.id);
      return res.status(200).json({ ok: true, autor: yo, updated_at: ahora });
    }

    if (accion === 'senales') {
      // Las señales "al momento" (capital parado, pendientes). Se sellan la PRIMERA vez y no se
      // vuelven a tocar: si se re-escribieran, el memo de agosto terminaría mostrando el stock del
      // día en que alguien lo abrió.
      await asegurarSemana(sb, sem);
      const { data: ya, error: e0 } = await sb.from('memo_semana').select('senales_tomadas_at').eq('id', sem.id).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (ya && ya.senales_tomadas_at) return res.status(200).json({ ok: true, yaEstaba: true });

      const ahora = new Date().toISOString();
      const { error } = await sb.from('memo_semana')
        .update({ senales: b.senales || null, senales_tomadas_at: ahora, updated_at: ahora }).eq('id', sem.id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, senales_tomadas_at: ahora });
    }

    if (accion === 'cerrar') {
      // 🔴 Sólo cuando la semana YA terminó. Cerrar un miércoles congelaría media semana como si
      // fuera la semana entera — y el histórico no tiene forma de decir que le faltan cuatro días.
      if (!cerrada(sem, hoy)) {
        return res.status(400).json({ error: 'Esa semana todavía no terminó. El memo se cierra a partir del lunes siguiente.' });
      }
      await asegurarSemana(sb, sem);
      const foto = await calcularFoto(sb, sem);
      const ahora = new Date().toISOString();
      const { error } = await sb.from('memo_semana').update({
        estado: 'cerrado', foto, foto_tomada_at: ahora, cerrado_at: ahora, cerrado_por: yo, updated_at: ahora,
      }).eq('id', sem.id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, foto, cerrado_por: yo, cerrado_at: ahora });
    }

    return res.status(400).json({ error: `acción inválida (${accion || 'vacía'})` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
