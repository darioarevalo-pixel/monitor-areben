// La Biblioteca de anuncios: todos los avisos de todas las cuentas que ve el perfil, juntos.
//
//   GET  /api/meta-ads?recurso=biblioteca[&rango=last_30d]
//   POST /api/meta-ads?recurso=favorito  { objetoId, marcar }
//
// ⚠️ Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby.
//
// # De dónde sale cada cosa
//
// 🔑 **Los números salen de la base y las piezas salen de Meta**, y cada mitad sobrevive sola. La
// foto diaria (`meta_ads_snapshot_dia`, nivel `aviso`) tiene el gasto, las compras y los ratios de
// cada día; Graph tiene la imagen, el copy y el estado de hoy. Si Meta no contesta —o si el token
// se venció— la grilla igual se dibuja con los números, **diciendo por qué no hay fotos**. Al revés
// no: sin la base no hay biblioteca, porque Graph no contesta «cómo venía».
//
// Por eso el GET va ANTES del guard del token en `api/meta-ads.js`, igual que la auditoría, los
// planes y las reglas.
//
// # El estado NO sale de la foto, y no es un olvido
//
// La foto escribe la configuración (`estado`, `diario_crudo`) **sólo en la fila del día en que se
// sacó** —Meta no expone la configuración hacia atrás—, así que en una ventana que no incluya hoy
// no hay ni un estado guardado. Leerlo de ahí daría «pausado» para todo. Viene de la misma llamada
// que trae la pieza, que es donde está.
import { lineasQueVe } from '../lib/meta-ads/acciones.core.js';
import { agruparAvisos, ventanaDe } from '../lib/meta-ads/biblioteca.core.js';
import { piezasDeCuenta, rescatarMiniaturas } from '../lib/meta-ads/creativos.core.js';
import { tokenMeta } from '../lib/meta-ads/graph.core.js';
import { leerSnapshot } from '../lib/meta-ads/leer-snapshot.core.js';
import { clienteBdi } from './_meta-lineas.js';

const TABLA_FAV = 'meta_ads_favorito';

/** Las columnas de la foto que necesita la Biblioteca. Explícitas: la tabla tiene 25. */
const COLS = 'fecha,objeto_id,cuenta_id,campaign_id,adset_id,nombre,linea,spend,impresiones,clicks,compras,revenue';

/** Los rangos que la pantalla puede pedir. Lo que venga de afuera no se cree: ver `lib/meta-ads/rango.ts`. */
const RANGOS = new Set([
  'today', 'yesterday', 'hoy_ayer', 'last_7d', 'last_14d', 'last_30d', 'last_90d',
  'this_month', 'last_month', 'maximum',
]);
const RANGO_DEFAULT = 'last_30d';

const quienEs = (perfil) => (perfil && perfil.name) || 'desconocido';

// ── Lectura ───────────────────────────────────────────────────────────────────────────────────

export async function bibliotecaGet(res, perfil, q) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const visibles = lineasQueVe(perfil);
  if (!visibles.length) return res.status(403).json({ error: 'No tenés acceso a la pauta de ninguna marca.' });

  const rango = RANGOS.has(String(q.rango)) ? String(q.rango) : RANGO_DEFAULT;
  const ventana = ventanaDe(rango);

  const snap = await leerSnapshot(sb, { cols: COLS, desde: ventana.desde, hasta: ventana.hasta, nivel: 'aviso' });
  if (snap.error) return res.status(502).json({ error: 'No se pudo leer la foto diaria.', detalle: snap.error });

  // El corte por permiso se hace acá y no en la consulta a propósito: hace falta poder CONTAR los
  // avisos que quedan afuera por no tener marca asignada. Un aviso sin línea no se puede cortar por
  // permiso —no se sabe de quién es—, así que no se muestra; pero esconderlo sin decirlo deja a la
  // Biblioteca mintiendo por omisión, y el arreglo (asignarle la línea a su campaña) es de una vez.
  const deVisibles = snap.filas.filter((f) => visibles.includes(f.linea));
  const sinLinea = new Set(snap.filas.filter((f) => !f.linea).map((f) => String(f.objeto_id))).size;

  const avisos = agruparAvisos(deVisibles);

  // Los favoritos son del equipo y la tabla es chica: se traen todos y se cruzan contra los avisos
  // que ya quedaron cortados por permiso. Filtrar por `linea` acá dejaría afuera los que se marcaron
  // antes de que su campaña tuviera marca.
  const fav = await sb.from(TABLA_FAV).select('objeto_id,quien,creada');
  const favPorId = new Map();
  if (!fav.error) for (const f of fav.data || []) favPorId.set(String(f.objeto_id), { quien: f.quien, creada: f.creada });

  const { piezas, sinPiezas } = await traerPiezas(avisos);
  for (const a of avisos) {
    const p = piezas.get(a.id) || null;
    if (p) {
      a.pieza = p;
      // El nombre de Meta gana sobre el de la foto: la foto guarda el del día a propósito (una
      // campaña renombrada ayer no debería reescribir su historia) y para BUSCAR sirve el de hoy.
      if (p.nombre) a.nombre = p.nombre;
      a.estado = p.estado;
      a.configurado = p.configurado;
    } else {
      a.pieza = null;
      // 🔑 `null` no es «pausado»: es «Meta no lo devolvió». Pasa con los avisos borrados, cuya
      // historia sigue viva en la foto aunque el objeto ya no exista. La pantalla lo dice así.
      a.estado = null;
      a.configurado = null;
    }
    const f = favPorId.get(a.id);
    a.favorito = f ? { quien: f.quien, creada: f.creada } : null;
  }

  // El rescate de miniaturas va acá y no adentro de `piezasDeCuenta` porque su tope son 50 y hay que
  // gastarlo en los avisos que se van a mostrar, que ya están ordenados por gasto.
  await rescatarMiniaturas(
    avisos.filter((a) => a.pieza).map((a) => a.pieza),
    (p) => p.creativeId,
  );

  return res.status(200).json({
    ok: true,
    rango,
    ventana,
    avisos,
    // Desde cuándo hay foto DE VERDAD, medido sobre lo que se leyó y no sobre una constante que
    // envejece. Es lo que le dice a quien mira «todo el historial» que eso empieza en mayo.
    desdeReal: avisos.reduce((m, a) => (!m || a.primera < m ? a.primera : m), null),
    sinLinea,
    sinPiezas,
    quien: quienEs(perfil),
  });
}

/**
 * Las piezas de las cuentas que aparecen en el resultado, en paralelo.
 *
 * Se piden por CUENTA y no por aviso porque el edge `act_<id>/ads` los trae todos de una: con tres
 * cuentas son seis llamadas en total, contra una por aviso. Cada cuenta falla sola —su motivo queda
 * anotado y sus avisos se dibujan sin foto—, que es la misma regla que el resto de la sección.
 */
async function traerPiezas(avisos) {
  const piezas = new Map();
  if (!tokenMeta()) {
    return { piezas, sinPiezas: 'Meta Ads no configurado: falta META_ADS_TOKEN en el servidor.' };
  }
  const cuentas = [...new Set(avisos.map((a) => a.cuentaId).filter(Boolean))];
  if (!cuentas.length) return { piezas, sinPiezas: null };

  const rs = await Promise.all(cuentas.map((c) => piezasDeCuenta(c)));
  const fallaron = [];
  const sinCopy = [];
  rs.forEach((r, i) => {
    if (!r.ok) { fallaron.push(`${cuentas[i]}: ${r.motivo}`); return; }
    // La rica es un enriquecimiento aparte: si falla, los avisos igual se listan pero con la
    // miniatura chica y sin copy. Es un cartel distinto del de «no hay piezas».
    if (r.sinRico) sinCopy.push(`${cuentas[i]}: ${r.sinRico}`);
    for (const p of r.piezas) piezas.set(p.id, p);
  });
  const partes = [];
  if (fallaron.length) partes.push(`No se pudieron traer las piezas de ${fallaron.join(' · ')}`);
  if (sinCopy.length) partes.push(`Sin el texto ni la imagen grande de ${sinCopy.join(' · ')}`);
  return { piezas, sinPiezas: partes.length ? partes.join('. ') : null };
}

// ── Escritura: marcar y desmarcar ─────────────────────────────────────────────────────────────

/**
 * Marcar (o desmarcar) una pieza.
 *
 * ⛔ **No toca Meta.** Por eso no pide ninguno de los sub-permisos de accionar sobre la pauta: el
 * corte es el de LECTURA, y se hace contra la línea que la FOTO le da al aviso, no contra la que
 * mande el cliente. Creerle a la pantalla dejaría marcar cualquier aviso mandando una línea propia.
 */
export default async function favoritoPost(req, res, perfil) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const visibles = lineasQueVe(perfil);
  if (!visibles.length) return res.status(403).json({ error: 'No tenés acceso a la pauta de ninguna marca.' });

  const cuerpo = req.body || {};
  const objetoId = String(cuerpo.objetoId || '');
  if (!/^\d+$/.test(objetoId)) return res.status(400).json({ error: 'aviso inválido' });

  const { data, error } = await sb
    .from('meta_ads_snapshot_dia')
    .select('linea')
    .eq('nivel', 'aviso')
    .eq('objeto_id', objetoId)
    .order('fecha', { ascending: false })
    .limit(1);
  if (error) return res.status(502).json({ error: 'No se pudo leer de qué marca es el aviso.', detalle: error.message });
  const linea = data && data[0] ? data[0].linea : null;
  // Sin línea no se puede decidir de quién es, así que no se puede marcar. Es el mismo criterio que
  // usa accionar sobre una campaña sin marca, y el arreglo es el mismo: asignarle la línea.
  if (!linea) return res.status(409).json({ error: 'Ese aviso todavía no tiene marca asignada. Asignásela a su campaña en Campañas.' });
  if (!visibles.includes(linea)) return res.status(403).json({ error: 'Ese aviso es de una marca que no ves.' });

  if (cuerpo.marcar === false) {
    const del = await sb.from(TABLA_FAV).delete().eq('objeto_id', objetoId);
    if (del.error) return res.status(502).json({ error: 'No se pudo desmarcar.', detalle: del.error.message });
    return res.status(200).json({ ok: true, favorito: null });
  }

  const quien = quienEs(perfil);
  const up = await sb.from(TABLA_FAV).upsert({ objeto_id: objetoId, linea, quien }, { onConflict: 'objeto_id' }).select();
  if (up.error) return res.status(502).json({ error: 'No se pudo marcar.', detalle: up.error.message });
  const fila = (up.data || [])[0] || {};
  return res.status(200).json({ ok: true, favorito: { quien, creada: fila.creada || null } });
}
