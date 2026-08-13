// El umbral de rentabilidad de cada línea de pauta — tabla `meta_ads_rentabilidad`
// (ver sql/migrate-meta-rentabilidad.sql).
//
//   GET  ?recurso=meta-rentabilidad&linea=bdi|zattia|stunned
//   POST { recurso:'meta-rentabilidad', linea, supuestos:{…} }
//
// ⚠️ **Por qué esto NO vive en api/meta-ads.js**, que sería el lugar obvio: ese endpoint corta con
// 500 si falta o vence `META_ADS_TOKEN`, y esta pantalla no le pide NADA a Meta —sale de la
// economía del producto—. Atarla a ese token la mataría justo cuando hay que decidir si algo rinde.
// Mismo motivo por el que el tablero de ideas y el calendario entran por acá.
//
// ⚠️ **El eje es la LÍNEA, no el store.** El techo se compara contra el costo por compra de un
// conjunto y los conjuntos cuelgan de una línea; Stunned tiene su propia cuenta y su propia
// economía, y no es una `Marca`. El permiso se pregunta con `puedeVerAlguna(perfil, linea, …)`,
// que traduce la línea a marca sola y hace valer la cuenta fija. El razonamiento largo está arriba
// del SQL.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12
// funciones por deploy y cada archivo de ruta cuenta una.
//
// ⚠️ Los permisos se IMPORTAN de lib/permisos.core.js y la normalización de
// lib/meta-ads/rentabilidad.core.js — la MISMA que usa la pantalla. Copiar cualquiera de las dos
// acá adentro es cómo se termina con dos umbrales distintos para la misma línea.
import { exigirUsuario } from './_auth.js';
import { esAdmin, puedeVerAlguna } from '../lib/permisos.core.js';
import { esLinea } from '../lib/meta-ads/lineas.core.js';
import { DEFAULTS, normalizar } from '../lib/meta-ads/rentabilidad.core.js';
// La base donde viven las tablas cross-marca de Meta Ads. Una sola implementación: la comparte con
// el censo de etapas, las acciones sobre la pauta y las asignaciones de línea.
import { clienteBdi } from './_meta-lineas.js';

const TABLA = 'meta_ads_rentabilidad';

/**
 * 🔴 **Guardar el umbral es de ADMIN, y ver es de cualquiera que vea Meta Ads en esa marca.**
 *
 * No es un permiso de más: este número es lo que TODAS las otras pantallas leen como «rinde». Los
 * cuatro sub-permisos que ya existen (`pausar`, `presupuesto`, `crear`, `pautar`) son sobre actos
 * puntuales de la pauta; esto es la política contra la que esos actos se juzgan, y los datos que la
 * arman —costo sin IVA, comisiones reales, mix de cobro— son de dirección.
 *
 * Se eligió reusar `esAdmin` en vez de inventar un sub nuevo porque un sub que nadie tiene tildado
 * termina en lo mismo (sólo admin) pero además le suma una fila a la pantalla de permisos que
 * alguien va a tildar sin saber qué abre. Si mañana hace falta que el equipo lo edite, es esta
 * función y nada más.
 */
function poderes(perfil, linea) {
  return {
    // 🔴 **`puedeVerAlguna` y NO `puedeVer` a secas.** Del lado del servidor la línea la elige el
    // request: alguien clavado a Zattia (`perfil.cuenta`) pide `?linea=bdi` a mano y `puedeVer` le
    // dice que sí, porque sólo mira la marca que le pasan. Es el agujero que se cerró el
    // 13-ago-2026 en otros cinco handlers, y éste nació el mismo día con la misma forma. La función
    // traduce la línea a marca sola, así que `stunned` entra derecho.
    ver: puedeVerAlguna(perfil, linea, ['meta-ads']),
    // Se pregunta DESPUÉS de `ver`, y por eso alcanza con `esAdmin`: al POST no se llega sin haber
    // pasado el gate de arriba, que es el que hace valer la cuenta fija.
    editar: esAdmin(perfil),
  };
}

/** Quién firmó. `perfil.name` es el campo que usa el resto de los handlers. */
const quienEs = (perfil) => perfil?.name || null;

/**
 * La fila de una línea, o los defaults si todavía no tiene.
 *
 * 🔑 **`guardado: false` viaja hasta la pantalla.** Los defaults son la economía de las fundas de
 * BDI: si Zattia los devolviera sin distinguir, su techo se leería como un dato medido de Zattia.
 * Devolver «no hay nada, y esto es prestado» es la única respuesta honesta.
 */
async function leer(sb, linea) {
  const { data, error } = await sb
    .from(TABLA)
    .select('linea, supuestos, por, updated_at')
    .eq('linea', linea)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { linea, supuestos: DEFAULTS, guardado: false, por: null, cuando: null };
  return {
    linea,
    // Se normaliza también a la SALIDA, no sólo al guardar: una fila vieja no tiene el campo que se
    // agregó esta semana, y sin esto la pantalla calcularía con un `undefined` adentro.
    supuestos: normalizar(data.supuestos),
    guardado: true,
    por: data.por || null,
    cuando: data.updated_at || null,
  };
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const crudaLinea = req.method === 'POST' ? (req.body || {}).linea : req.query.linea;
  const linea = String(crudaLinea || '').toLowerCase();
  if (!esLinea(linea)) return res.status(400).json({ error: 'línea inválida (usá bdi, zattia o stunned)' });

  // 🔑 **Los dos 403 salen ANTES de tocar la base**, y por eso están los dos acá arriba en vez de
  // cada uno al lado de su rama. Un gate que contesta 403 después de abrir el cliente ya dejó al
  // proceso con la llave en la mano, y el día que alguien mueva un `return` no se rompe ninguna
  // vista: es lo que fija `tests/meta-rentabilidad-handler.test.ts`, y así lo cazó.
  const puede = poderes(perfil, linea);
  if (!puede.ver) return res.status(403).json({ error: 'No tenés acceso a Meta Ads en esta marca.' });
  if (req.method === 'POST' && !puede.editar) {
    return res.status(403).json({ error: 'Sólo un admin puede cambiar el umbral de rentabilidad.' });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'método no permitido' });
  }

  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, ...(await leer(sb, linea)), puede: { editar: puede.editar } });
    }

    // Lo que entra se normaliza SIEMPRE: un campo que falta o que vino mal cae al default, y uno
    // fuera de rango se recorta. Guardar el crudo dejaría un techo inventado que se ve razonable.
    const supuestos = normalizar((req.body || {}).supuestos);
    const ahora = new Date().toISOString();

    const { error } = await sb
      .from(TABLA)
      .upsert({ linea, supuestos, por: quienEs(perfil), updated_at: ahora }, { onConflict: 'linea' });
    if (error) throw new Error(error.message);

    // Se devuelve lo LEÍDO de vuelta, no lo que se mandó: así la pantalla muestra exactamente lo
    // que quedó guardado —ya normalizado y con su firma— en vez de lo que creía estar guardando.
    return res.status(200).json({ ok: true, ...(await leer(sb, linea)), puede: { editar: puede.editar } });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error inesperado' });
  }
}
