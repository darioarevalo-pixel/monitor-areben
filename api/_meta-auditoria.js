// Quién accionó sobre la pauta de Meta, qué tocó y cómo quedó: la lectura de `meta_ads_accion`.
//
//   GET /api/meta-ads?recurso=auditoria[&campania=<id>][&limite=N]
//
// ⚠️ Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby.
//
// # Por qué existe
//
// La tabla se venía escribiendo desde la Tanda 1 y **no la leía nadie**: no había endpoint ni
// pantalla, y "quién movió esto" sólo se podía contestar entrando a Supabase a mano. La mitad del
// pedido —confirmación *y registro*— estaba a medias.
//
// # Qué se ve y qué no
//
// El corte es por **línea de la campaña**, no por cuenta: las líneas se pautean desde más de una
// cuenta publicitaria y una misma cuenta tiene campañas de varias líneas, así que "ve la cuenta" no
// alcanza para decidir. Es el mismo criterio con que el servidor contesta 403 al accionar.
//
// 🔑 **Las filas SIN línea se ven igual.** Son los rechazos que murieron antes de resolverla: el 409
// de «esta campaña no tiene marca», un id inválido, una lectura de Meta que falló. Cortarlas por
// marca las escondería de todos —no son de nadie— y son justo las que hay que mirar. Mismo criterio
// que Etapas, donde las campañas sin asignar se le muestran a todo el mundo.
import { esAdmin, marcasConAcceso } from '../lib/permisos.core.js';
import { MARCAS_META } from '../lib/meta-ads/acciones.core.js';
import { lineasDeMarca } from '../lib/meta-ads/lineas.core.js';
import { graph, mensajeError, tokenMeta } from '../lib/meta-ads/graph.core.js';
import { clienteBdi } from './_meta-lineas.js';

const TABLA = 'meta_ads_accion';

/**
 * Cuántas filas por pedido. El tope duro existe porque esta tabla sólo crece: sin él, el día que
 * tenga 40.000 filas la pantalla se cuelga sola y nadie va a saber por qué.
 */
const LIMITE_DEFAULT = 100;
const LIMITE_MAX = 500;

export default async function auditoria(res, perfil, q) {
  const marcas = marcasConAcceso(perfil, 'meta-ads', MARCAS_META);
  if (!marcas.length) return res.status(403).json({ error: 'No tenés permiso para ver Meta Ads.' });
  const visibles = marcas.flatMap((m) => lineasDeMarca(m));

  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase para leer el registro.' });

  const campania = String((q && q.campania) || '');
  if (campania && !/^\d+$/.test(campania)) return res.status(400).json({ error: 'campaña inválida' });

  const pedido = parseInt((q && q.limite) || '', 10);
  const limite = Number.isFinite(pedido) ? Math.min(Math.max(pedido, 1), LIMITE_MAX) : LIMITE_DEFAULT;

  // Se piden `limite + 1` para poder decir «hay más» sin contar la tabla entera: un `count` exacto
  // sobre una tabla que sólo crece cuesta un scan y la respuesta no lo necesita para nada.
  let sel = sb.from(TABLA)
    .select('id, idem, cuando, quien, accion, nivel, objeto_id, objeto_nombre, campaign_id, linea, cuenta_id, de, a, pedido, resultado, detalle, uso')
    .order('cuando', { ascending: false })
    .limit(limite + 1);
  if (campania) sel = sel.eq('campaign_id', campania);
  // El filtro va en la consulta y no en un `.filter()` de acá: recortar después de traer significa
  // traer las de las otras marcas igual, y que se vean o no dependa de que nadie mire la respuesta.
  sel = sel.or(`linea.is.null,linea.in.(${visibles.join(',')})`);

  const { data, error } = await sel;
  if (error) {
    return res.status(502).json({
      error: 'No se pudo leer el registro de acciones.',
      detalle: `${error.message} — si la tabla ${TABLA} no existe, correr \`node scripts/apply-meta-acciones.mjs\`.`,
    });
  }

  const crudas = data || [];
  const hayMas = crudas.length > limite;
  const filas = crudas.slice(0, limite).map((f) => fila(f, esAdmin(perfil)));

  // Las monedas de las cuentas que aparecen. Es lo que convierte `190000` en «$1.900», y va como
  // enriquecimiento AISLADO: si Meta no contesta, el registro igual se lee (con el monto crudo y un
  // cartel que lo dice). Negarse a mostrar quién apagó qué porque falló Graph sería exactamente al
  // revés de para qué existe esta pantalla.
  const monedas = filas.some((f) => f.cuentaId) ? await monedasDeCuentas() : { mapa: {}, motivo: null };

  return res.status(200).json({
    ok: true,
    filas,
    hayMas,
    limite,
    monedas: monedas.mapa,
    monedasMotivo: monedas.motivo,
  });
}

/**
 * De la fila de la base a lo que viaja. `idem` y `uso` van **sólo para admin**: el primero es la
 * clave del doble clic (sirve para rastrear un pedido, no para leer la historia) y el segundo es el
 * cupo de escritura que va quedando en Meta, que es diagnóstico de infraestructura.
 */
function fila(f, admin) {
  return {
    id: f.id,
    cuando: f.cuando,
    quien: f.quien || '',
    accion: f.accion,
    nivel: f.nivel,
    objetoId: String(f.objeto_id || ''),
    objetoNombre: f.objeto_nombre || null,
    campaignId: f.campaign_id ? String(f.campaign_id) : null,
    linea: f.linea || null,
    cuentaId: f.cuenta_id ? String(f.cuenta_id) : null,
    de: f.de || null,
    a: f.a || null,
    // ⚠️ Viene en `null` en todo lo anterior al 6-ago-2026: la columna se sumó después de la Tanda 1
    // y esas filas no la tienen. La pantalla lo dice, no lo rellena.
    pedido: f.pedido || null,
    resultado: f.resultado,
    detalle: f.detalle || null,
    ...(admin ? { idem: f.idem, uso: f.uso || null } : {}),
  };
}

/**
 * `cuenta_id → moneda`, para poder mostrar los montos.
 *
 * Los presupuestos se guardan crudos, en la unidad menor de la moneda (en ARS, `190000` es $1.900),
 * y la tabla no guarda la moneda porque es de la cuenta y no de la acción. Se pide una sola vez por
 * respuesta con los mismos campos que ya usa el overview en producción.
 */
async function monedasDeCuentas() {
  // Sin token no se pregunta: este endpoint se puede abrir justamente cuando el de Meta se venció, y
  // gastar 8 segundos de timeout para llegar al mismo «no se pudo» sería colgar la única pantalla que
  // sirve en ese momento.
  if (!tokenMeta()) return { mapa: {}, motivo: 'no hay token de Meta configurado' };
  const r = await graph('me/adaccounts?fields=account_id,currency&limit=100');
  if (!r.ok) return { mapa: {}, motivo: mensajeError(r) };
  const mapa = {};
  for (const c of (r.data && r.data.data) || []) {
    if (c && c.account_id) mapa[String(c.account_id)] = c.currency || '';
  }
  return { mapa, motivo: null };
}
