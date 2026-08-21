// Métricas de Meta Ads (API de Marketing). Lectura por GET; el POST escribe y vive aparte.
//   GET /api/meta-ads                         → lista las cuentas del token con su total (para el selector).
//   GET /api/meta-ads?account=<id>&preset=... → DETALLE de una cuenta: totales + anuncios agrupables por
//                                               campaña + serie diaria + desglose por plataforma/ubicación.
//   GET /api/meta-ads?recurso=cuentas         → el EJE de la sección: las cuentas del token con su
//                                               moneda, zona, cuántas campañas tienen y qué líneas
//                                               de pauta viven adentro. **Sin insights**: es el que
//                                               llena el selector, y no hace falta gasto para eso.
//   GET /api/meta-ads?recurso=etapas          → CENSO de campañas repartido por LÍNEA de pauta (bdi,
//                                               zattia, stunned) para el diagnóstico de etapas
//                                               (TOFU/MOFU/BOFU). Incluye las pausadas.
//   GET /api/meta-ads?recurso=creativos&campania=<id>
//                                             → los AVISOS de una campaña con su creativo (imagen,
//                                               título, texto, botón) y su gasto. A demanda, para
//                                               que Etapas muestre CON QUÉ se está hablando.
//   GET /api/meta-ads?recurso=conjuntos&campania=<id>
//                                             → los CONJUNTOS de una campaña con su presupuesto,
//                                               estado y gasto. A demanda. Es también el modo que
//                                               dice si la campaña es CBO.
//   GET /api/meta-ads?recurso=mejoras&campania=<id>
//                                             → ¿cuáles de sus avisos llevan el campo de «mejoras
//                                               estándar» que Meta deprecó? Es lo que hace que
//                                               duplicar un conjunto CON avisos sea rechazado.
//   GET /api/meta-ads?recurso=biblioteca[&rango=…]
//                                             → TODOS los avisos de todas las cuentas que ve el
//                                               perfil, con sus números de la foto diaria y su
//                                               pieza. Ver `api/_meta-biblioteca.js`.
//   GET /api/meta-ads?recurso=parte&account=<id>[&linea=bdi]
//                                             → EL PARTE DEL DÍA: hoy contra ayer por conjunto y
//                                               por aviso, embudo, serie, y el cruce contra los
//                                               PEDIDOS REALES de la tienda. Texto plano listo
//                                               para copiar. Ver `api/_meta-parte.js`.
//   POST /api/meta-ads?recurso=favorito       → marcar/desmarcar una pieza. No toca Meta.
//   GET /api/meta-ads?recurso=diagnostico     → ¿el token puede ESCRIBIR? (solo admin)
//   GET /api/meta-ads?recurso=auditoria       → QUIÉN accionó sobre la pauta y cómo quedó. Ver
//                                               `api/_meta-auditoria.js`.
//   GET /api/meta-ads?recurso=planes[&estado=todos]
//   GET /api/meta-ads?recurso=plan&id=<n>     → los PLANES por pasos: qué se está armando y por dónde
//                                               va. Salen de la base, así que andan sin token.
//   GET /api/meta-ads?recurso=informes[&linea=…]
//   GET /api/meta-ads?recurso=informe&id=<n>  → los INFORMES del analista de pauta: el diagnóstico
//                                               en prosa, guardado. Sale entero de la base. Ver
//                                               `api/_meta-informes.js`.
//   POST /api/meta-ads?recurso=informe        → subir / publicar / borrar un informe. No toca Meta.
//   POST /api/meta-ads                        → accionar sobre la pauta. Ver `api/_meta-acciones.js`.
//   POST /api/meta-ads?recurso=plan           → crear / avanzar / cancelar un plan por pasos, que es
//                                               lo que hace que duplicar sobreviva a que se corte la
//                                               llamada. Ver `api/_meta-planes.js`.
// Rango por preset (last_30d default) o since/until.
//
// Seguridad: exige un usuario válido del Monitor (patrón observaciones.js).
// Token: META_ADS_TOKEN (system user, no vence). Si falta → 500.
//
// ⚠️ La plomería de Graph (`graph`, `graphPost`, `insightsTodas`, `mensajeError`) se mudó a
// `lib/meta-ads/graph.core.js`: la Tanda 4 la necesita desde un script de `scripts/`, que no puede
// importar de `api/`. Este archivo la usa, no la define.
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
// Los permisos se IMPORTAN, no se copian: la misma implementación que usa la app.
import { esAdmin, marcasConAcceso } from '../lib/permisos.core.js';
// La clasificación por etapa TAMBIÉN se importa, por el mismo motivo y desde un `.js` gemelo.
import { estaAlAire, etapaDeObjetivo, OBJETIVOS_TRAFICO, OBJETIVOS_VENTA } from '../lib/meta-ads/etapas.core.js';
// Qué ventana se puede pedir. Vale la pena leer el encabezado de ese archivo: las cuatro copias que
// reemplaza contestaban una ventana distinta de la pedida sin decirlo.
import { elegirDias, elegirRango } from '../lib/meta-ads/ventana.core.js';
// Y las líneas de pauta, que son las que dicen de qué marca es cada campaña.
import { lineasDeMarca, sugerirLinea } from '../lib/meta-ads/lineas.core.js';
// Qué líneas puede MIRAR un perfil: la misma función con la que la pantalla dibuja el selector, para
// que no ofrezca una vista que el servidor después corta con 403.
import { lineasQueVe } from '../lib/meta-ads/acciones.core.js';
import { codigoError, graph, graphPost, insightsTodas, mensajeError, minimosDe, tokenMeta } from '../lib/meta-ads/graph.core.js';
// Cómo se lee la PIEZA de un aviso. Salió de acá adentro cuando la Biblioteca necesitó lo mismo
// sobre todos los avisos de una cuenta: dos lecturas del mismo creativo no fallan ruidosamente,
// dibujan dos veces la misma pieza con dos formatos distintos.
import { piezaDe, rescatarMiniaturas, TOPE_IDS_GRAPH } from '../lib/meta-ads/creativos.core.js';
// Y cómo se leen los números de una fila de insights. Salió de acá adentro cuando la foto diaria
// (`scripts/snapshot-meta.mjs`) necesitó leerlas igual desde un script: dos lecturas distintas de
// `omni_purchase` no fallan ruidosamente, devuelven dos cifras de ventas parecidas y distintas.
import { accion, accionRe, ATTR, COMPRA, FUNNEL, metricasDe, num, RE_PERFIL, RE_SEGUIDOR, sumaAcciones, TIPO_FUNNEL } from '../lib/meta-ads/metricas.core.js';
import { leerAsignaciones } from './_meta-lineas.js';
import accionar from './_meta-acciones.js';
import auditoria from './_meta-auditoria.js';
import planes, { planesGet } from './_meta-planes.js';
import reglasPost, { reglasGet } from './_meta-reglas.js';
import favoritoPost, { bibliotecaGet } from './_meta-biblioteca.js';
import informesPost, { informesGet } from './_meta-informes.js';
import tendenciaGet from './_meta-tendencia.js';
import parteGet from './_meta-parte.js';

// La lista de períodos y las dos ventanas del censo viven en `lib/meta-ads/ventana.core.js`: eran
// cuatro copias de la misma decisión y las cuatro contestaban otra ventana en silencio cuando les
// pedían una que no tenían.
// `ATTR` (la ventana de atribución), `COMPRA` (`omni_purchase`), `RE_PERFIL` y `RE_SEGUIDOR` se
// mudaron a `lib/meta-ads/metricas.core.js` junto con las funciones que los usan, por el mismo
// motivo por el que `mensajeError` se fue a `graph.core.js`: los necesita un script de `scripts/`.
// `OBJETIVOS_VENTA` / `OBJETIVOS_TRAFICO` viven en `lib/meta-ads/etapas.core.js` (importados
// arriba): son la misma verdad que el mapa de etapas y ahí un test amarra que no se despeguen.

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // 🔑 **Las lecturas que salen de la BASE no necesitan el token**: la auditoría y los planes. Y son
  // justo las que hay que poder abrir cuando el token se venció —el día que Meta deje de contestar,
  // la pregunta es qué se llegó a hacer antes, y qué quedó a medias—. Por eso el guard va después de
  // despacharlas y no arriba de todo.
  const recurso = (req.query || {}).recurso;
  if (req.method === 'GET' && recurso === 'auditoria') return await auditoria(res, perfil, req.query || {});
  // ⚠️ **Un recurso que no figura acá no existe**, y no falla ruidosamente: cae al camino de abajo y
  // contesta cualquier otra cosa. Pasó con `poda`, que llegó a producción con el CI entero en verde y
  // sin que ninguna de las 2.308 pruebas pudiera verlo: el despacho es lo único que no tiene test.
  if (req.method === 'GET' && (recurso === 'plan' || recurso === 'planes' || recurso === 'escalada' || recurso === 'poda')) return await planesGet(res, perfil, req.query || {});
  // Las automatizaciones leen la foto diaria de la base, nunca Graph. Van acá arriba por el mismo
  // motivo: el día que el token se venza, la pregunta sigue siendo qué hay que decidir.
  if (req.method === 'GET' && (recurso === 'reglas' || recurso === 'hallazgos' || recurso === 'decisiones')) return await reglasGet(res, perfil, req.query || {});
  // El POST de reglas tampoco toca Meta: guarda una regla, unos umbrales, corre el calibrador o
  // marca un hallazgo. Ejecutar es el POST de acciones de más abajo, con su permiso y su registro.
  if (req.method === 'POST' && recurso === 'regla') return await reglasPost(req, res, perfil);
  // La Biblioteca **saca los números de la base y las piezas de Meta**, y la mitad de la base
  // sobrevive sola: sin token contesta igual, con la grilla completa y sin fotos, diciendo por qué.
  // Por eso entra acá arriba y el guard de abajo la mataría. Marcar un favorito tampoco toca Meta.
  if (req.method === 'GET' && recurso === 'biblioteca') return await bibliotecaGet(res, perfil, req.query || {});
  if (req.method === 'POST' && recurso === 'favorito') return await favoritoPost(req, res, perfil);
  // «Cómo viene» del Panel: sale entero de la foto diaria. Es lo único de esa pantalla que sabe de
  // historia, y por eso es lo que sigue contestando cuando Graph no contesta.
  if (req.method === 'GET' && recurso === 'tendencia') return await tendenciaGet(res, perfil, req.query || {});
  // Los informes del analista: prosa guardada en la base, cero llamadas a Meta. Es la lectura que
  // MÁS falta cuando Graph no contesta —el último informe es lo que explica qué estaba pasando—, así
  // que va arriba del guard por el mismo motivo que las reglas y el registro. El POST tampoco toca
  // Meta: guarda un HTML, lo publica o lo borra.
  if (req.method === 'GET' && (recurso === 'informes' || recurso === 'informe')) return await informesGet(res, perfil, req.query || {});
  if (req.method === 'POST' && recurso === 'informe') return await informesPost(req, res, perfil);

  if (!tokenMeta()) return res.status(500).json({ error: 'Meta Ads no configurado' });

  // POST = escribir sobre la pauta. Dos puertas: una acción suelta (`_meta-acciones.js`) o un plan
  // por pasos (`_meta-planes.js`). Los dos son archivos con guion bajo y no cuentan contra las 12
  // funciones del plan Hobby.
  if (req.method === 'POST') return recurso === 'plan' ? await planes(req, res, perfil) : await accionar(req, res, perfil);

  const q = req.query || {};

  // Recursos que no son "métricas de una cuenta" entran por acá, como hace `api/datos.js`: el plan
  // Hobby admite 12 funciones y un archivo nuevo en `api/` las frena todas sin error visible.
  // Sin `&marca=`: devuelve las tres líneas de una, porque el censo que hay que pedirle a Meta es el
  // mismo para todas (una sola cuenta publicitaria). Pedirlo tres veces sería triplicar el gasto de
  // Graph para cortar los mismos datos; el corte por permiso igual se hace del lado del servidor.
  if (q.recurso === 'cuentas') return await cuentas(res, perfil);
  // ⚠️ El `dias` viaja CRUDO: parsearlo acá borra la diferencia entre «no pidió nada» y «pidió una
  // ventana que no existe», que es justo la que decide entre el defecto y un 400. Ver
  // `lib/meta-ads/ventana.core.js`.
  if (q.recurso === 'etapas') return await etapas(res, perfil, q.dias);
  if (q.recurso === 'creativos') return await creativos(res, perfil, String(q.campania || ''), q.dias);
  if (q.recurso === 'conjuntos') return await conjuntos(res, perfil, String(q.campania || ''), q.dias);
  if (q.recurso === 'mejoras') return await mejoras(res, perfil, String(q.campania || ''));
  if (q.recurso === 'diagnostico') return await diagnostico(res, perfil, q.probar === '1');
  // El parte va DESPUÉS del guard del token, a diferencia de la tendencia y los informes: sin Meta
  // no hay parte que armar —el día de hoy sólo existe allá— y contestar media tabla con la mitad de
  // la base sería peor que decir que no se pudo.
  if (q.recurso === 'parte') return await parteGet(res, perfil, q);
  // `auditoria` ya se despachó arriba, antes del guard del token. Ver el comentario de allá.

  // El rango sale de UNA sola lectura de la query: `qs` es lo que viaja a Graph y `eco` lo que se
  // devuelve en el cuerpo. Antes eran dos expresiones distintas leyendo lo mismo, y esa es la forma
  // en que dos lecturas del mismo dato se despegan.
  const elegido = elegirRango(q);
  if (elegido.error) return res.status(400).json({ error: elegido.error });

  return q.account
    ? await detalle(res, String(q.account), elegido.qs, elegido.eco)
    : await overview(res, elegido.qs, elegido.eco);
}

// ── Modo cuentas: el EJE de la sección (cuenta × línea), sin insights ────────────────────────────
/**
 * Qué devuelve y por qué no reusa `overview`:
 *
 * `overview` existe para MOSTRAR NÚMEROS y paga **una llamada de insights por cuenta** para armar el
 * chip con el gasto. Este modo existe para ELEGIR, y para elegir no hace falta el gasto: hace falta
 * saber qué cuentas hay, en qué moneda y zona corren, cuántas campañas tienen y **qué líneas de
 * pauta viven adentro**. Insights es lo caro de Graph, así que el selector deja de pagarlo.
 *
 * 🔑 **Las líneas de cada cuenta se MIDEN, no se deducen**: salen de agrupar
 * `meta_ads_campania_linea.cuenta_id`, o sea de lo que una persona asignó campaña por campaña. Un
 * mapa fijo cuenta→marca no tiene ningún valor correcto mientras BDI y Zattia compartan cuenta, y
 * eso ya se pagó una vez (ver `lib/meta-ads/lineas.core.js`).
 *
 * Los tres enriquecimientos por cuenta van en llamadas **aisladas**, y el motivo es el de siempre:
 * un campo equivocado no se ignora, se lleva puesta la respuesta entera. Si alguno falla, esa cuenta
 * se lista igual con el dato en `null` y la pantalla lo dice.
 */
async function cuentas(res, perfil) {
  const visibles = lineasQueVe(perfil);
  if (!visibles.length) return res.status(403).json({ error: 'No tenés permiso para ver Meta Ads.' });

  // Los mismos campos que `overview`, probados en prod. ⚠️ NO sumar `business{name}`: exige
  // `business_management` y Meta rechaza la consulta ENTERA (pasó el 26-jul-2026).
  const cuentasRes = await graph('me/adaccounts?fields=account_id,name,currency,timezone_name&limit=100');
  if (!cuentasRes.ok) return res.status(502).json({ error: 'No se pudieron listar las cuentas de Meta', detalle: mensajeError(cuentasRes) });
  const lista = (cuentasRes.data && cuentasRes.data.data) || [];

  const asignadas = await leerAsignaciones();
  // Un 502 y no un `lineas: []` silencioso: sin esto TODAS las cuentas dirían «ninguna campaña
  // asignada», que es el estado que la pantalla reclama arreglar — y se arreglaría dos veces.
  if (asignadas.error) {
    return res.status(502).json({ error: 'No se pudo leer de qué marca es cada campaña', detalle: asignadas.error });
  }

  // Agrupado por cuenta: qué líneas hay y cuántas campañas ya tienen una.
  const porCuenta = new Map();
  for (const a of asignadas.mapa.values()) {
    const id = String(a.cuenta_id || '');
    if (!id) continue;
    const acc = porCuenta.get(id) || { lineas: new Set(), asignadas: 0 };
    // Recortado a lo que este perfil puede ver: quien no ve Zattia tampoco ve que ahí hay Stunned.
    if (visibles.includes(a.linea)) acc.lineas.add(a.linea);
    acc.asignadas += 1;
    porCuenta.set(id, acc);
  }

  const filas = await Promise.all(lista.map(async (c) => {
    const id = String(c.account_id || '');
    const moneda = c.currency || '';
    const agrupado = porCuenta.get(id) || { lineas: new Set(), asignadas: 0 };
    const [tareasRes, censoRes, mins] = await Promise.all([
      // Sólo `user_tasks`, que es campo DE la cuenta y ya está probado en `diagnostico`.
      graph(`act_${id}?fields=user_tasks`),
      // `summary=true` da el total sin traer las filas: una cuenta con 173 campañas cuesta lo mismo
      // que una vacía. Es lo único que distingue «no pautea» de «no se pudo leer».
      graph(`act_${id}/campaigns?fields=id&limit=1&summary=true`),
      minimosDe(id, moneda),
    ]);
    const tareas = tareasRes.ok && Array.isArray(tareasRes.data && tareasRes.data.user_tasks) ? tareasRes.data.user_tasks : [];
    const total = (censoRes.ok && censoRes.data && censoRes.data.summary && censoRes.data.summary.total_count);
    return {
      id,
      nombre: nombreCuenta(c),
      moneda,
      // La zona es de la CUENTA: `date_preset=today` lo resuelve Meta allá, así que «hoy» puede no
      // ser el hoy de quien mira. Viaja para que el selector lo pueda decir.
      zona: c.timezone_name || '',
      campanias: typeof total === 'number' ? total : 0,
      asignadas: agrupado.asignadas,
      lineas: [...agrupado.lineas],
      // ⚠️ `user_tasks` vacío NO es «no administra»: con un system user Meta a veces no lo informa.
      // Acá eso queda en `false` y el veredicto real lo da `?recurso=diagnostico`, que es la pantalla
      // que existe para distinguir los dos candados. Este campo sólo apaga botones, no acusa a nadie.
      administra: puedePautar(tareas),
      minDiarioCrudo: typeof mins.minDiarioCrudo === 'number' ? mins.minDiarioCrudo : null,
      minimosMotivo: mins.minimosMotivo || null,
      // Lo que falló de ESTA cuenta, sin tumbar la lista. El censo es el único que importa contar:
      // sin él, `campanias: 0` haría que la cuenta se hunda al fondo como si estuviera vacía.
      error: censoRes.ok ? null : mensajeError(censoRes),
    };
  }));

  return res.status(200).json({ ok: true, cuentas: filas, visibles });
}

// ── Modo etapas: el censo de campañas, repartido por línea de pauta (TOFU/MOFU/BOFU) ────────────
/**
 * Por qué esto no reusa el modo `detalle`:
 *
 * 1. **`detalle` no ve las campañas pausadas ni las que no gastaron.** Deriva las campañas de los
 *    anuncios que entregaron, con `filtering: spend > 0`. Para decir "hay 5 de una etapa y ninguna
 *    de la otra" hace falta el censo real, y el `status` de campaña hoy no se trae en ningún lado.
 * 2. **Pesa 9 llamadas por cuenta** y trae demografía, regiones, placements y creativos. Acá no
 *    hace falta nada de eso: son 2 llamadas por cuenta.
 *
 * La ventana es FIJA (30 días, o 90 si se pide) y no la del selector del Resumen: con "Hoy" a las 9
 * de la mañana todas las etapas darían cero y la pantalla gritaría un hueco falso todos los días.
 */
async function etapas(res, perfil, diasPedidos) {
  // Qué líneas puede mirar esta persona. `marcasConAcceso` es la misma que usan Inicio, Solicitudes,
  // Gerencial y el calendario: respeta la cuenta fija (y le gana al admin) y la excepción negativa.
  // Stunned entra de la mano de Zattia, que es de donde cuelga.
  const marcas = marcasConAcceso(perfil, 'meta-ads', ['bdi', 'zattia']);
  if (!marcas.length) return res.status(403).json({ error: 'No tenés permiso para ver Meta Ads.' });
  const visibles = new Set(marcas.flatMap((m) => lineasDeMarca(m)));

  const ventana = elegirDias(diasPedidos);
  if (ventana.error) return res.status(400).json({ error: ventana.error });
  const dias = ventana.dias;
  const rango = `date_preset=last_${dias}d`;
  const attr = `action_attribution_windows=${ATTR}`;

  // `currency` va acá y no en una llamada aparte porque ya lo pide `overview` con esta misma lista
  // de campos y está probado en prod. Lo necesita la palanca de presupuesto: Meta maneja los montos
  // en la unidad MENOR de la moneda, así que sin saber cuál es no se puede ni mostrar ni escribir.
  const cuentasRes = await graph('me/adaccounts?fields=account_id,name,currency&limit=100');
  if (!cuentasRes.ok) return res.status(502).json({ error: 'No se pudieron listar las cuentas de Meta', detalle: mensajeError(cuentasRes) });

  // Ya no hay cuentas "de una marca": las tres líneas se pautean desde la MISMA cuenta publicitaria,
  // así que se consultan todas las del token y el corte se hace campaña por campaña, más abajo.
  const cuentas = ((cuentasRes.data && cuentasRes.data.data) || [])
    .map((c) => ({ id: String(c.account_id), nombre: nombreCuenta(c), moneda: c.currency || '' }));

  const asignadas = await leerAsignaciones();
  if (asignadas.error) {
    return res.status(502).json({ error: 'No se pudo leer de qué marca es cada campaña', detalle: asignadas.error });
  }

  const porCuenta = await Promise.all(cuentas.map(async (cuenta) => {
    const act = `act_${cuenta.id}`;
    const [censoRes, gastoRes] = await Promise.all([
      // El censo: TODAS las campañas, incluidas las pausadas (Meta ya excluye archivadas y borradas).
      insightsTodas(`${act}/campaigns?fields=id,name,objective,status,effective_status,start_time,daily_budget,lifetime_budget&limit=500`),
      insightsTodas(`${act}/insights?level=campaign&fields=campaign_id,spend,impressions,clicks,actions,action_values&${rango}&${attr}&limit=500`),
    ]);
    if (!censoRes.ok) return { error: censoRes.error };

    // El gasto es un enriquecimiento AISLADO: si falla, las campañas igual se listan con 0 y el
    // diagnóstico dice "sin base" en vez de romper la pantalla entera.
    const gastoPorId = new Map();
    if (gastoRes.ok) for (const r of gastoRes.rows) gastoPorId.set(String(r.campaign_id), r);

    return {
      campañas: censoRes.rows.map((c) => {
        const g = gastoPorId.get(String(c.id));
        return {
          id: String(c.id),
          nombre: c.name || '(sin nombre)',
          cuentaId: cuenta.id,
          objetivo: c.objective || null,
          etapaAuto: etapaDeObjetivo(c.objective),
          // `effective_status` es el que manda: `status` dice ACTIVE aunque la cuenta esté frenada.
          estado: c.effective_status || c.status || null,
          // El presupuesto ya venía en el `?fields=` de arriba y se tiraba en este `.map()`. Sin
          // esto la palanca de escala no tiene qué mostrar: son los dos números que decide quien
          // sube o baja el diario. ⚠️ Vienen en la UNIDAD MENOR de la moneda de la cuenta (en ARS,
          // `1800000` es $18.000). Se pasan crudos a propósito; la conversión la hace la pantalla
          // con `factorMoneda()`, para que sea una decisión visible y no un `/100` perdido.
          //
          // Una campaña con `daily_budget` propio es CBO: reparte sola entre sus conjuntos, y el
          // presupuesto de los conjuntos no se puede tocar.
          diarioCrudo: c.daily_budget ? num(c.daily_budget) : 0,
          totalCrudo: c.lifetime_budget ? num(c.lifetime_budget) : 0,
          spend: g ? num(g.spend) : 0,
          impressions: g ? num(g.impressions) : 0,
          clicks: g ? num(g.clicks) : 0,
          purchases: g ? accion(g.actions, COMPRA) : 0,
          revenue: g ? accion(g.action_values, COMPRA) : 0,
        };
      }),
    };
  }));

  const fallo = porCuenta.find((r) => r.error);
  if (fallo && porCuenta.every((r) => r.error)) {
    return res.status(502).json({ error: 'No se pudieron traer las campañas de Meta', detalle: fallo.error });
  }

  const campañas = porCuenta.flatMap((r) => r.campañas || []).sort((a, b) => b.spend - a.spend);

  // El reparto. Una campaña sin fila NO cae en ninguna línea: su plata no se la queda nadie por
  // descarte, que es exactamente el bug que este cambio vino a matar. Queda en `sinAsignar`, con lo
  // que el nombre SUGIERE, y una persona confirma.
  const lineas = {};
  for (const l of visibles) lineas[l] = [];
  const sinAsignar = [];
  for (const c of campañas) {
    const fila = asignadas.mapa.get(c.id);
    if (fila) {
      if (lineas[fila.linea]) lineas[fila.linea].push(c);
      continue;
    }
    // `tuvoActividad` es `estaAlAire` IMPORTADA, no una copia: este flag decide qué campañas se
    // reclaman en ámbar, y reclamar con un criterio distinto del que después las cuenta es prometer
    // un número que no va a moverse.
    //
    // Nació como un `||` y eso llenaba el cartel de publicaciones de Instagram promocionadas: Meta
    // le arma una campaña a cada posteo y quedan `ACTIVE` para siempre aunque hace meses que no
    // entregan. Eran 26 filas de $0 tapando las 5 que se llevaban toda la plata. ⛔ No filtrarlas
    // por el nombre ni por el objetivo: el día que se promocione un posteo con plata de verdad, esa
    // heurística esconde justo la que había que asignar. El gasto en la ventana no se puede fingir,
    // y si una empieza a gastar vuelve sola al cartel.
    sinAsignar.push({ ...c, sugerida: sugerirLinea(c.nombre), tuvoActividad: estaAlAire(c) });
  }

  return res.status(200).json({ ok: true, dias, cuentas, lineas, sinAsignar });
}

// `leerAsignaciones` (campaña → línea, desde la base de BDI) se mudó a `api/_meta-lineas.js`: la
// necesitan también las acciones sobre la pauta, y `_meta-acciones.js` no la puede importar de acá
// sin cerrar un círculo (es este archivo el que lo despacha).
//
// Si falla, el endpoint corta con 502 en vez de devolver el censo sin repartir: mostrar todas las
// campañas como "sin asignar" haría creer que se perdieron las asignaciones, y alguien las volvería
// a cargar encima.

// ── Modo creativos: los avisos de UNA campaña, con qué se ve y qué dice ─────────
/**
 * Para qué existe, si el detalle de cuenta ya lista anuncios.
 *
 * La pantalla de Etapas es **la del que tiene que craneаr los creativos**, no la del que compra
 * medios. Decirle "falta pauta de la segunda etapa" sin dejarle ver con qué pieza se está hablando
 * hoy en la primera lo deja pensando en el aire: lo que hace falta para imaginar el paso siguiente
 * es ver la foto, el gancho y el botón de lo que ya salió. Por eso esto trae el **creativo**, no
 * una fila más de números.
 *
 * Se pide por campaña y a demanda —al desplegar una fila—, no de entrada: el censo de etapas son 2
 * llamadas por cuenta y traer los creativos de las 176 campañas de una tirada lo volvería inusable.
 *
 * ⚠️ **No usa `GET /<ad_id>/previews`**, que es el iframe oficial de Meta. Ese endpoint devuelve un
 * `<iframe src="…&t=<token>">` con el access token adentro de la URL, y este token es de un system
 * user con lectura sobre TODAS las cuentas del portfolio: publicarlo en el HTML lo dejaría al
 * alcance de cualquiera que abra las herramientas del navegador. La vista se arma acá con los
 * campos del creativo (imagen, título, texto, botón) y el link al aviso publicado, que no filtra
 * nada. Si algún día hace falta el iframe de verdad, primero hay que resolver el token.
 */

async function creativos(res, perfil, campaignId, diasPedidos) {
  const gate = await gateCampaña(res, perfil, campaignId);
  if (!gate) return;

  const ventana = elegirDias(diasPedidos);
  if (ventana.error) return res.status(400).json({ error: ventana.error });
  const dias = ventana.dias;

  // Tres llamadas, y las dos últimas son enriquecimientos AISLADOS: si Meta rechaza una, su dato
  // queda vacío y los avisos igual se ven. La primera lleva EXACTAMENTE los campos que el modo
  // `detalle` ya usa en producción (ver `statusRes`), que es lo único probado contra esta cuenta;
  // los campos nuevos van todos en la segunda, para que un nombre de campo equivocado no se lleve
  // puesta la respuesta entera —que es lo que pasó con `business{name}` en julio—.
  //
  // 🔴 **`thumbnail_width`/`thumbnail_height` NO sirven acá, medido en prod el 6-ago-2026.** Son
  // query params de primer nivel (no modificadores de campo) y sobre un `creative{}` anidado en el
  // edge `/ads` Meta **los ignora en silencio**: no rechaza nada —`sinCreativo` vino `null`— y
  // devuelve los 64 px de siempre. Por eso el rescate es la cuarta llamada de abajo, contra el
  // creative directo, que es donde el parámetro sí es de primer nivel.
  const [baseRes, ricoRes, insRes] = await Promise.all([
    graph(`${campaignId}/ads?fields=id,name,effective_status,creative{thumbnail_url,effective_object_story_id,instagram_permalink_url}&limit=200`),
    graph(`${campaignId}/ads?fields=id,creative{id,image_url,body,title,object_story_spec}&limit=200`),
    insightsTodas(`${campaignId}/insights?level=ad&fields=ad_id,spend,impressions,clicks,actions,action_values,video_3_sec_watched_actions&date_preset=last_${dias}d&action_attribution_windows=${ATTR}&limit=200`),
  ]);

  if (!baseRes.ok) {
    return res.status(502).json({ error: 'No se pudieron traer los avisos de la campaña', detalle: mensajeError(baseRes) });
  }

  const ricoPorId = new Map();
  if (ricoRes.ok && ricoRes.data && Array.isArray(ricoRes.data.data)) {
    for (const a of ricoRes.data.data) ricoPorId.set(String(a.id), a.creative || {});
  }
  const insPorId = new Map();
  if (insRes.ok) for (const r of insRes.rows) insPorId.set(String(r.ad_id), r);

  const ads = ((baseRes.data && baseRes.data.data) || []).map((a) => {
    const id = String(a.id);
    const base = a.creative || {};
    const cr = { ...base, ...(ricoPorId.get(id) || {}) };
    const g = insPorId.get(id);
    const impresiones = g ? num(g.impressions) : 0;
    const plays3s = g ? sumaAcciones(g.video_3_sec_watched_actions) : 0;
    return {
      id,
      nombre: a.name || '(sin nombre)',
      estado: a.effective_status || null,
      ...piezaDe(cr),
      spend: g ? num(g.spend) : 0,
      impressions: impresiones,
      clicks: g ? num(g.clicks) : 0,
      purchases: g ? accion(g.actions, COMPRA) : 0,
      revenue: g ? accion(g.action_values, COMPRA) : 0,
      hookRate: impresiones ? (plays3s / impresiones) * 100 : 0,
    };
  }).sort((x, y) => y.spend - x.spend);

  await rescatarMiniaturas(ads, (a) => (ricoPorId.get(a.id) || {}).id);

  // `sinCreativo` es diagnóstico, no adorno: si la llamada rica falla, todos los avisos quedan con
  // la miniatura de 64 px y sin una palabra de copy, y la pantalla tiene que poder decir por qué en
  // vez de dar a entender que los avisos no tienen texto.
  return res.status(200).json({ ok: true, dias, ads, sinCreativo: !ricoRes.ok ? mensajeError(ricoRes) : null });
}

/**
 * «¿Podés mirar ESTA campaña?» — el gate que comparten los dos modos por campaña.
 *
 * El corte por marca no lo puede hacer la cuenta: las tres líneas salen de una sola cuenta
 * publicitaria, así que "puede ver la cuenta" no alcanza para decidir. Una campaña **sin asignar no
 * se corta** —se ve igual en el cartel de pendientes de la misma pantalla—, y por eso devuelve la
 * fila (o `null`) en vez de un booleano: quien acciona necesita saber si la hay.
 *
 * Contesta él mismo el error y devuelve `null`; el llamador sólo tiene que cortar.
 */
async function gateCampaña(res, perfil, campaignId) {
  if (!/^\d+$/.test(campaignId)) {
    res.status(400).json({ error: 'campaña inválida' });
    return null;
  }
  const marcas = marcasConAcceso(perfil, 'meta-ads', ['bdi', 'zattia']);
  if (!marcas.length) {
    res.status(403).json({ error: 'No tenés permiso para ver Meta Ads.' });
    return null;
  }
  const visibles = new Set(marcas.flatMap((m) => lineasDeMarca(m)));

  const asignadas = await leerAsignaciones();
  if (asignadas.error) {
    res.status(502).json({ error: 'No se pudo leer de qué marca es cada campaña', detalle: asignadas.error });
    return null;
  }
  const fila = asignadas.mapa.get(campaignId) || null;
  if (fila && !visibles.has(fila.linea)) {
    res.status(403).json({ error: 'Esa campaña es de una marca que no ves.' });
    return null;
  }
  return { fila };
}

// ── Modo conjuntos: los adsets de UNA campaña, con su presupuesto ───────────────
/**
 * Para qué existe: **no había ni un dato de conjunto en todo el sistema.** Ni el censo ni el
 * detalle traen adsets, y accionar a nivel conjunto —que es donde vive el presupuesto cuando la
 * campaña no es CBO— necesita una lectura nueva.
 *
 * Es también el modo que contesta **si la campaña es CBO**: si la campaña tiene `daily_budget`
 * propio, reparte sola entre sus conjuntos y el presupuesto de los conjuntos no se toca. Eso no se
 * puede saber mirando el conjunto: hay que mirar al padre, y acá se mira una sola vez.
 *
 * A demanda al desplegar la fila, calcado de `?recurso=creativos` y por el mismo motivo: el censo
 * lista más de 170 campañas y pedirle los conjuntos a todas de una tirada lo volvería inusable.
 *
 * ⚠️ Los presupuestos van CRUDOS, en la unidad menor de la moneda. Ver `factorMoneda()`.
 */
async function conjuntos(res, perfil, campaignId, diasPedidos) {
  const gate = await gateCampaña(res, perfil, campaignId);
  if (!gate) return;

  const ventana = elegirDias(diasPedidos);
  if (ventana.error) return res.status(400).json({ error: ventana.error });
  const dias = ventana.dias;

  // El gasto es un enriquecimiento AISLADO, igual que en el censo: si falla, los conjuntos igual se
  // listan con 0 y se los puede accionar, que es a lo que se vino.
  const [campRes, setsRes, insRes] = await Promise.all([
    graph(`${campaignId}?fields=id,name,daily_budget,lifetime_budget`),
    insightsTodas(`${campaignId}/adsets?fields=id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal&limit=200`),
    insightsTodas(`${campaignId}/insights?level=adset&fields=adset_id,spend,impressions,clicks,actions,action_values&date_preset=last_${dias}d&action_attribution_windows=${ATTR}&limit=200`),
  ]);

  if (!setsRes.ok) {
    return res.status(502).json({ error: 'No se pudieron traer los conjuntos de la campaña', detalle: setsRes.error });
  }

  const insPorId = new Map();
  if (insRes.ok) for (const r of insRes.rows) insPorId.set(String(r.adset_id), r);

  const camp = (campRes.ok && campRes.data) || {};
  const diarioCampaña = num(camp.daily_budget);

  const filas = setsRes.rows.map((s) => {
    const g = insPorId.get(String(s.id));
    return {
      id: String(s.id),
      nombre: s.name || '(sin nombre)',
      estado: s.effective_status || s.status || null,
      // 🔑 **El estado CONFIGURADO va aparte del efectivo, y no es un detalle.** Una copia recién
      // creada viene `effective_status: 'IN_PROCESS'` con `status: 'PAUSED'`: mostrando sólo el
      // efectivo, la tabla dice «in process» de algo que está pausado, y el botón ofrece la acción
      // que corresponde al estado que no es. El efectivo dice si ENTREGA (y arrastra el estado de sus
      // padres: `CAMPAIGN_PAUSED`); el configurado dice qué se le pidió a ESTE objeto, que es lo que
      // se acciona.
      configurado: s.status || null,
      diarioCrudo: s.daily_budget ? num(s.daily_budget) : 0,
      totalCrudo: s.lifetime_budget ? num(s.lifetime_budget) : 0,
      objetivo: s.optimization_goal || null,
      spend: g ? num(g.spend) : 0,
      impressions: g ? num(g.impressions) : 0,
      clicks: g ? num(g.clicks) : 0,
      purchases: g ? accion(g.actions, COMPRA) : 0,
      revenue: g ? accion(g.action_values, COMPRA) : 0,
    };
  }).sort((a, b) => b.spend - a.spend);

  return res.status(200).json({
    ok: true,
    dias,
    // `cbo` con el nombre que usa Meta en su interfaz ("presupuesto de la campaña"), porque es el
    // que va a leer quien tenga que ir a tocarlo allá.
    cbo: diarioCampaña > 0,
    campania: {
      id: campaignId,
      nombre: camp.name || '',
      diarioCrudo: diarioCampaña,
      totalCrudo: num(camp.lifetime_budget),
    },
    conjuntos: filas,
    sinCampania: !campRes.ok ? mensajeError(campRes) : null,
  });
}

// ── Modo mejoras: ¿por qué Meta no deja copiar los avisos de esta campaña? ──────
/**
 * Contesta una pregunta concreta y medible: **cuáles de los avisos que hay hoy llevan el campo de
 * «mejoras estándar» que Meta deprecó**. Es el muro que apareció el 7-ago-2026, apenas se publicó la
 * app y cayó el del modo desarrollo, al duplicar un conjunto CON avisos:
 *
 *   «Incluir el campo de mejoras estándar en el contenido quedó obsoleto. En su lugar, elige
 *    configurar funciones individuales.»
 *
 * 🔑 **Preguntar sale mucho más barato que probar.** La alternativa era duplicar conjunto por
 * conjunto hasta ver cuáles fallan: cada intento come cupo de escritura, contesta por UN conjunto y
 * —cuando sale bien— deja una copia que alguien tiene que ir a borrar a mano a Ads Manager, porque
 * el monitor no borra. Esto contesta por toda la campaña con dos lecturas y sin escribir nada.
 *
 * ⚠️ **`degrees_of_freedom_spec` se le pide al CREATIVE directo con `?ids=`, no anidado en
 * `creative{}` dentro del edge `/ads`.** Ese anidado ya mordió una vez: los `thumbnail_width` que
 * Meta **ignora en silencio** ahí y sí respeta contra el creative. Un campo ignorado no se distingue
 * de un campo vacío, así que se pide donde está probado que se respeta.
 *
 * La primera llamada lleva sólo campos que los modos `creativos`/`conjuntos` ya usan en prod
 * (`id,name,adset_id,effective_status,creative{id}`); el campo nuevo va SOLO en la segunda, aislado,
 * para que un nombre equivocado no se lleve puesta la respuesta entera —lo de `business{name}`—.
 * Si esa segunda falla, se devuelven los avisos igual y el motivo va en `sinSpec`.
 */
async function mejoras(res, perfil, campaignId) {
  const gate = await gateCampaña(res, perfil, campaignId);
  if (!gate) return;

  // La fecha de creación va en su propia llamada por la misma razón que el spec: es un campo que
  // ningún modo probado usa. Y no es un adorno — el patrón sólo se ve con ella: si el campo obsoleto
  // aparece en todo lo creado antes de una fecha y en nada de lo posterior, «los creativos viejos» es
  // una medición; sin ella es una deducción a partir del nombre del aviso, que lo escribió una
  // persona y puede decir cualquier cosa.
  const [baseRes, fechaRes] = await Promise.all([
    graph(`${campaignId}/ads?fields=id,name,adset_id,effective_status,creative{id}&limit=200`),
    graph(`${campaignId}/ads?fields=id,created_time&limit=200`),
  ]);
  if (!baseRes.ok) {
    return res.status(502).json({ error: 'No se pudieron traer los avisos de la campaña', detalle: mensajeError(baseRes) });
  }

  const fechaPorAd = new Map();
  if (fechaRes.ok && fechaRes.data && Array.isArray(fechaRes.data.data)) {
    for (const a of fechaRes.data.data) if (a.created_time) fechaPorAd.set(String(a.id), String(a.created_time));
  }

  const ads = ((baseRes.data && baseRes.data.data) || []).map((a) => ({
    id: String(a.id),
    nombre: a.name || '(sin nombre)',
    conjunto: a.adset_id ? String(a.adset_id) : null,
    estado: a.effective_status || null,
    creativo: (a.creative && a.creative.id) ? String(a.creative.id) : null,
    creado: fechaPorAd.get(String(a.id)) || null,
  }));

  const ids = [...new Set(ads.map((a) => a.creativo).filter(Boolean))].slice(0, TOPE_IDS_GRAPH);
  let sinSpec = null;
  const specPorCreativo = new Map();
  if (ids.length) {
    const r = await graph(`?ids=${ids.join(',')}&fields=degrees_of_freedom_spec`);
    if (r.ok && r.data) {
      for (const [cid, c] of Object.entries(r.data)) specPorCreativo.set(String(cid), (c && c.degrees_of_freedom_spec) || null);
    } else {
      sinSpec = mensajeError(r);
    }
  }

  for (const a of ads) {
    const spec = a.creativo ? (specPorCreativo.get(a.creativo) || null) : null;
    // El spec CRUDO va en la respuesta a propósito: el veredicto de abajo es una lectura mía de cómo
    // Meta nombra hoy lo que deprecó, y si el nombre fuera otro habría que poder verlo en vez de
    // creerle a un booleano. Es chico (un objeto de banderas), así que no hay razón para resumirlo.
    a.spec = spec;
    const se = spec && spec.creative_features_spec && spec.creative_features_spec.standard_enhancements;
    // 🔑 **El veredicto es la PRESENCIA del campo, y el `enroll_status` va aparte.** Meta no dice
    // «está prendido», dice «incluir el campo quedó obsoleto», así que un `OPT_OUT` también lo
    // incluye. Se separan porque la diferencia todavía no está medida: hay 4 avisos en `OPT_OUT`
    // sobre 55, y hasta que uno de ellos se intente copiar, «presencia» es la lectura prudente
    // —dice «puede fallar» de un aviso que quizá copie bien, y no al revés—.
    a.obsoleto = !!se;
    a.enroll = se ? (se.enroll_status || null) : null;
  }

  // El corte por conjunto es el que importa: **se duplica el conjunto, no el aviso**, y un solo aviso
  // con el campo obsoleto alcanza para que Meta rechace la copia entera. Se suma también cuántos
  // avisos cuelgan, porque el otro motivo por el que una copia no sale es el tope de 3 de la vía
  // síncrona, y desde afuera los dos se ven igual: «no se pudo duplicar».
  const porConjunto = new Map();
  for (const a of ads) {
    const k = a.conjunto || '(sin conjunto)';
    const c = porConjunto.get(k) || { id: k, avisos: 0, obsoletos: 0, optIn: 0, optOut: 0, sinSpec: 0 };
    c.avisos++;
    if (a.obsoleto) c.obsoletos++;
    if (a.enroll === 'OPT_IN') c.optIn++;
    else if (a.enroll) c.optOut++;
    if (!a.spec) c.sinSpec++;
    porConjunto.set(k, c);
  }

  return res.status(200).json({
    ok: true,
    campania: campaignId,
    ads,
    conjuntos: [...porConjunto.values()],
    // Cuántos quedaron sin consultar por el tope de `?ids=`: sin esto, «0 obsoletos» de una campaña
    // con 60 avisos se leería como «ninguno», cuando son «los primeros 50, ordenados por lo que trajo
    // Graph». Un recorte que no se anuncia se lee como cobertura completa.
    creativosConsultados: ids.length,
    creativosTotales: new Set(ads.map((a) => a.creativo).filter(Boolean)).size,
    sinSpec,
  });
}

// La lectura de la PIEZA (`piezaDe`, `rescatarMiniaturas`, los rótulos de los botones) bajó a
// `lib/meta-ads/creativos.core.js`: la Biblioteca pregunta lo mismo sobre todos los avisos de una
// cuenta y su handler no puede importar de acá sin cerrar un círculo. Ver la cabecera de ese archivo.

// ── Modo diagnóstico: ¿el token puede ESCRIBIR? (solo admin) ────────────────────
/**
 * Para accionar sobre la pauta (pausar, cambiar presupuesto, duplicar) hay que pasar **dos
 * candados distintos**, y confundirlos cuesta horas:
 *
 *   1. El **scope del token**: `ads_management` además de `ads_read`. Si falta, Meta contesta
 *      `(#200) Requires ads_management permission`.
 *   2. El **permiso del system user sobre la cuenta**: "Administrar campañas" y no sólo "Ver
 *      rendimiento". Si falta, Meta contesta `(#272) ... requires the user to be an admin`.
 *
 * `user_tasks` responde el candado 2 sin escribir nada: `["ANALYZE"]` es solo lectura, `MANAGE`
 * es el objetivo. El candado 1 no se puede ver de otra forma que intentando, así que `?probar=1`
 * hace la **escritura más inofensiva que existe**: pisar el nombre de una campaña con el nombre
 * que ya tiene. No cambia nada y devuelve el código de error crudo, que es el que distingue los
 * dos casos.
 *
 * `/me/permissions` va tolerado a propósito: con un token de system user Meta no siempre lo
 * contesta, y que falle no significa nada sobre los scopes.
 */
async function diagnostico(res, perfil, probar) {
  if (!esAdmin(perfil)) return res.status(403).json({ error: 'El diagnóstico del token es solo para administradores.' });

  // Los campos de la lista son los MISMOS que ya usa `overview` y están probados en prod: un
  // nombre de campo equivocado se lleva puesta la respuesta entera de Graph (pasó con
  // `business{name}` en julio). Lo nuevo va en una llamada aparte, por cuenta y aislada.
  const cuentasRes = await graph('me/adaccounts?fields=account_id,name&limit=100');
  if (!cuentasRes.ok) return res.status(502).json({ error: 'No se pudieron listar las cuentas de Meta', detalle: mensajeError(cuentasRes) });
  const cuentas = (cuentasRes.data && cuentasRes.data.data) || [];

  const permRes = await graph('me/permissions');
  const scopes = permRes.ok && permRes.data && Array.isArray(permRes.data.data)
    ? permRes.data.data.filter((p) => p.status === 'granted').map((p) => p.permission)
    : null;

  const filas = await Promise.all(cuentas.map((c) => diagnosticoCuenta(c, probar)));
  return res.status(200).json({
    ok: true,
    scopes,                                    // null = Meta no lo contestó, NO "no tiene ninguno"
    scopesMotivo: permRes.ok ? null : mensajeError(permRes),
    puedeEscribir: filas.some((f) => f.veredicto === 'escribe'),
    cuentas: filas,
    ...(await paginasDelToken()),
  });
}

/**
 * Las páginas que el token dice manejar, preguntadas **por el canal que sus scopes permiten**.
 *
 * 🔴 Nació de un diagnóstico que costó una hora el 9-ago-2026. Armar una pieza fallaba con
 * *«El token no puede ver la página 264601567300555»* —que es la de BDI Accesorios—, y en el
 * Business Manager esa página figuraba **«Ya se asignó»** al system user. Las dos cosas eran
 * ciertas: el activo estaba, y el token igual no podía **leer la ficha** de la página.
 *
 * 🔑 **Son permisos distintos.** `GET /<page_id>?fields=…` lee el nodo Página y pide
 * `pages_read_engagement`; el token tiene `pages_show_list`, que habilita **listar** las páginas
 * (`/me/accounts`) y nada más. ⇒ preguntar por el nodo es preguntar por la puerta equivocada, y la
 * respuesta —`(#100) missing permission`— manda a arreglar una asignación que ya está bien.
 *
 * ⚠️ Esto **no** dice si se puede crear un creativo con esa página: crear va con `ads_management` y
 * el activo asignado, sin leer nada. Dice si el token la ve por donde puede verla, que es lo que
 * hacía falta para dejar de adivinar.
 */
async function paginasDelToken() {
  const r = await graph('me/accounts?fields=id,name,tasks&limit=100');
  if (!r.ok) return { paginasToken: null, paginasTokenMotivo: mensajeError(r) };
  const filas = (r.data && r.data.data) || [];
  return {
    paginasToken: filas.map((p) => ({
      id: String(p.id),
      nombre: String(p.name || ''),
      tareas: Array.isArray(p.tasks) ? p.tasks : [],
    })),
    paginasTokenMotivo: null,
  };
}

/**
 * ¿Estas `user_tasks` alcanzan para accionar sobre la pauta?
 *
 * 🔑 **La tarea que da "Administrar campañas (anuncios)" es `ADVERTISE`, no `MANAGE`.** `MANAGE`
 * corresponde a "Administrar cuentas publicitarias", el acceso TOTAL que también controla las
 * finanzas y los permisos de la cuenta — a propósito no se lo dimos al system user. Medido el
 * 6-ago-2026: las tres cuentas quedaron en `DRAFT, ANALYZE, ADVERTISE` y las dos que pudieron
 * probar escribieron bien, así que `ADVERTISE` es suficiente y `MANAGE` era de más.
 *
 * Buscar `MANAGE` dejaba a la única cuenta sin campañas —la que no puede correr la prueba de
 * escritura— marcada como "solo lectura", mandando a arreglar un permiso que ya estaba bien.
 */
function puedePautar(tareas) {
  return tareas.includes('ADVERTISE') || tareas.includes('MANAGE');
}

async function diagnosticoCuenta(c, probar) {
  const id = String(c.account_id || '');
  const base = { id, nombre: nombreCuenta(c) };
  // Sólo campos DE la cuenta. Los mínimos de presupuesto NO son campos suyos —son un edge— y
  // pedirlos acá devolvía `(#100) Tried accessing nonexisting field`, que se lleva puesta la
  // respuesta entera y dejaba las tres cuentas en "no se pudo leer". Van aparte, abajo.
  const d = await graph(`act_${id}?fields=user_tasks,account_status,disable_reason,currency`);
  if (!d.ok) return { ...base, veredicto: 'no-se-pudo-leer', detalle: mensajeError(d) };
  const t = d.data || {};
  const tareas = Array.isArray(t.user_tasks) ? t.user_tasks : [];
  const mins = await minimosDe(id, t.currency);
  const fila = {
    ...base,
    tareas,
    moneda: t.currency || '',
    ...mins,
    estadoCuenta: t.account_status ?? null,
    motivoBaja: t.disable_reason ?? null,
    administra: puedePautar(tareas),
    // ⚠️ `user_tasks` VACÍO no es "no administra": con un token de system user Meta a veces no
    // informa el campo. Decir "solo lectura" ahí mandaría a arreglar un permiso que puede estar
    // bien, que es exactamente la confusión entre los dos candados que este modo existe para
    // evitar. Sin el dato, se dice que no se sabe y lo resuelve la prueba de escritura.
    veredicto: puedePautar(tareas) ? 'permiso-de-cuenta-ok' : tareas.length ? 'sin-permiso-de-cuenta' : 'tareas-desconocidas',
  };
  if (!probar) return fila;
  return { ...fila, ...(await pruebaDeEscritura(id)), ...(await paginasDe(id)) };
}

/**
 * Las páginas que el token puede usar para PUBLICAR en esta cuenta.
 *
 * 🔑 **Es superficie nueva desde que existe «probar piezas».** Todo lo que el motor creó hasta ahora
 * —campañas, conjuntos, avisos— reusa un `creative_id` que ya existe, y eso nunca toca la página. Un
 * creativo NUEVO lleva `page_id` adentro y exige que la página esté asignada al usuario del sistema.
 * O sea: un token que escribe perfecto en todo lo demás puede no poder armar una pieza.
 *
 * ⚠️ Va en una llamada aparte y no como un campo más de `act_<id>?fields=…`, por la trampa de
 * siempre: un campo bloqueado se lleva puesta la respuesta ENTERA y dejaría las cuatro cuentas en
 * «no se pudo leer». Mismo criterio que `minimosDe`.
 *
 * Una lista vacía **no es** «no tiene ninguna»: puede ser que Meta no lo informe. Por eso se
 * devuelve el motivo al lado en vez de un booleano que afirme de más.
 */
async function paginasDe(cuentaId) {
  const r = await graph(`act_${cuentaId}/promote_pages?fields=id,name&limit=25`);
  if (!r.ok) return { paginas: null, paginasMotivo: mensajeError(r) };
  const filas = (r.data && r.data.data) || [];
  return { paginas: filas.map((p) => ({ id: String(p.id), nombre: String(p.name || '') })), paginasMotivo: null };
}

// `minimosDe` se mudó a `lib/meta-ads/graph.core.js`: la palanca de presupuesto lo necesita para
// validar antes de mandarle a Meta un número que va a rechazar, y ese chequeo vive del otro lado.

/**
 * La escritura idempotente: `POST /<campaign_id>` con el nombre que la campaña YA tiene.
 * Es la única forma de saber si el scope alcanza sin arriesgar nada.
 */
async function pruebaDeEscritura(cuentaId) {
  const camp = await graph(`act_${cuentaId}/campaigns?fields=id,name&limit=1`);
  const c0 = camp.ok && camp.data && camp.data.data && camp.data.data[0];
  if (!c0) return { prueba: { corrida: false, motivo: camp.ok ? 'la cuenta no tiene campañas para probar' : mensajeError(camp) } };

  const w = await graphPost(c0.id, { name: c0.name });
  if (w.ok) return { veredicto: 'escribe', prueba: { corrida: true, ok: true, campania: c0.name } };

  const code = codigoError(w);
  // Los dos códigos que distinguen los candados. El resto se muestra crudo antes que adivinar.
  const veredicto = code === 200 ? 'sin-scope' : code === 272 ? 'sin-permiso-de-cuenta' : code === 190 ? 'token-invalido' : 'rechazo-desconocido';
  return { veredicto, prueba: { corrida: true, ok: false, codigo: code, campania: c0.name, detalle: mensajeError(w) } };
}

// La mutación (pausar/activar, presupuesto) se mudó ENTERA a `api/_meta-acciones.js`. Lo que había
// acá era un solo camino —pausar UN anuncio— con un gate que era un booleano global: `.some()`
// sobre las dos marcas, sin mirar de quién era la campaña. Con las tres líneas en una sola cuenta
// publicitaria eso alcanzaba para que alguien de una marca pausara la pauta de otra.

/**
 * Nombre presentable de una cuenta publicitaria.
 *
 * Meta NO deja vacío el `name` de una cuenta sin nombre propio: le pone el ID. Así, el selector
 * mostraba `1145878766790149` como si fuera un nombre.
 *
 * El portfolio dueño (`business.name`) sería el mejor reemplazo, pero pedirlo rompe la consulta
 * entera por permisos (ver `overview`), así que queda como opcional: si vino, se usa; si no, la
 * cuenta se llama "Cuenta ####" con los últimos 4 dígitos, que al menos es legible y no se
 * confunde con un nombre. El ID completo va en el title del chip.
 */
function nombreCuenta(c) {
  const id = String(c.account_id || '');
  const n = String(c.name || '').trim();
  if (n && n !== id && n !== `act_${id}`) return n;
  const biz = (c.business && String(c.business.name || '').trim()) || '';
  const cola = id.slice(-4);
  return biz ? `${biz} · ${cola}` : `Cuenta ${cola}`;
}

// ── Modo overview: las 3 cuentas con su total (para el selector) ────────────────
async function overview(res, rango, rangoEco) {
  // ⚠️ NO agregar `business{name}` acá. Exige el permiso `business_management`, que este token
  // (solo `ads_read`) no tiene, y Meta no lo ignora: rechaza la consulta ENTERA con
  // `(#100) Requires business_management permission` — o sea que la sección se queda sin una
  // sola cuenta. Pasó en producción el 26-jul-2026.
  // Una cuenta sin nombre propio cae a "Cuenta ####" (ver `nombreCuenta`); si molesta, se
  // resuelve poniéndole nombre en Ads Manager, no ampliando los permisos del token.
  const cuentasRes = await graph('me/adaccounts?fields=account_id,name,currency,timezone_name&limit=100');
  if (!cuentasRes.ok) return res.status(502).json({ error: 'No se pudieron listar las cuentas de Meta', detalle: mensajeError(cuentasRes) });
  const cuentas = (cuentasRes.data && cuentasRes.data.data) || [];

  const filas = await Promise.all(
    cuentas.map(async (c) => {
      // La zona horaria es de la CUENTA, no del navegador: `date_preset=today` lo resuelve Meta
      // allá, así que "Hoy" puede no ser el hoy de quien mira. Se muestra para que se note.
      const base = { id: c.account_id, nombre: nombreCuenta(c), moneda: c.currency || '', zona: c.timezone_name || '' };
      const ins = await graph(`act_${c.account_id}/insights?fields=spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values,purchase_roas&${rango}&action_attribution_windows=${ATTR}`);
      if (!ins.ok) return { ...base, error: mensajeError(ins) };
      const row = ins.data && ins.data.data && ins.data.data[0];
      if (!row) return { ...base, sinDatos: true };
      return { ...base, ...metricasDe(row) };
    }),
  );
  return res.status(200).json({ ok: true, rango: rangoEco, cuentas: filas });
}

// ── Modo detalle: una cuenta, con anuncios/campañas + diaria + placements ────────
async function detalle(res, account, rango, rangoEco) {
  if (!/^\d+$/.test(account)) return res.status(400).json({ error: 'account inválido' });
  const act = `act_${account}`;
  const attr = `action_attribution_windows=${ATTR}`;
  // El filtro de gasto > 0 recorta el ruido de cuentas con cientos de anuncios dormidos, pero en
  // un rango CORTO esconde justo lo que se quiere mirar: a la mañana un anuncio que todavía no
  // gastó desaparece, y "Hoy" se ve vacío aunque esté entregando. Ahí se pide todo.
  const rangoCorto = esRangoCorto(rangoEco);
  const filtroGasto = rangoCorto
    ? ''
    : `filtering=${encodeURIComponent(JSON.stringify([{ field: 'spend', operator: 'GREATER_THAN', value: 0 }]))}&`;

  // Las 4 primeras son las llamadas núcleo (no se tocan); las 4 nuevas son enriquecimientos
  // AISLADOS: si alguna falla, su dato queda vacío y el resto del detalle igual responde.
  const [totRes, adsRes, dayRes, plRes, extraRes, statusRes, ageRes, regRes, campRes] = await Promise.all([
    graph(`${act}/insights?fields=account_name,account_currency,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas&${rango}&${attr}`),
    insightsTodas(`${act}/insights?level=ad&fields=ad_id,ad_name,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,inline_link_clicks,actions,action_values,purchase_roas&${filtroGasto}${rango}&${attr}&limit=500`),
    graph(`${act}/insights?fields=spend,actions,action_values&time_increment=1&${rango}&${attr}&limit=500`),
    graph(`${act}/insights?fields=spend,actions,action_values&breakdowns=publisher_platform,platform_position&${rango}&${attr}&limit=500`),
    // Diagnóstico de creativos + video por anuncio (call separada para no arriesgar la de anuncios).
    insightsTodas(`${act}/insights?level=ad&fields=ad_id,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,impressions,video_3_sec_watched_actions,video_thruplay_watched_actions&${filtroGasto}${rango}&${attr}&limit=500`),
    // Estado de entrega (activo/pausado/en aprendizaje) + preview del creativo + links por anuncio.
    graph(`${act}/ads?fields=id,effective_status,creative{thumbnail_url,effective_object_story_id,instagram_permalink_url}&limit=500`),
    // Quién: edad × género. Dónde: región.
    graph(`${act}/insights?breakdowns=age,gender&fields=spend,impressions,actions,action_values&${rango}&${attr}&limit=500`),
    graph(`${act}/insights?breakdowns=region&fields=spend,actions,action_values&${rango}&${attr}&limit=500`),
    // Objetivo de cada campaña: es lo único que distingue una pauta de VENTA de una de tráfico,
    // y no viene en insights. Enriquecimiento aislado: si falla, no hay ROAS de venta y listo.
    graph(`${act}/campaigns?fields=id,objective&limit=500`),
  ]);

  if (!adsRes.ok) return res.status(502).json({ error: 'No se pudieron traer los anuncios de la cuenta', detalle: adsRes.error });

  const totRow = totRes.ok && totRes.data && totRes.data.data && totRes.data.data[0];
  const moneda = (totRow && totRow.account_currency) || '';
  // `account_name` trae el mismo ID cuando la cuenta no tiene nombre propio; el overview
  // sí conoce el portfolio, así que la pantalla usa aquel nombre y este es el respaldo.
  const nombre = nombreCuenta({ account_id: account, name: totRow && totRow.account_name });
  const totales = totRow ? metricasDe(totRow) : sumar(adsRes.rows.map(adDe));

  // Índices de los enriquecimientos por ad_id.
  const extraPorId = new Map();
  if (extraRes.ok) for (const r of extraRes.rows) extraPorId.set(String(r.ad_id), r);
  const statusPorId = new Map();
  if (statusRes.ok && statusRes.data && Array.isArray(statusRes.data.data)) {
    for (const a of statusRes.data.data) {
      const cr = a.creative || {};
      // Link al aviso publicado: permalink de IG si lo hay, si no la historia de FB (page_post).
      const story = cr.effective_object_story_id ? `https://www.facebook.com/${cr.effective_object_story_id}` : null;
      const permalink = cr.instagram_permalink_url || story || null;
      statusPorId.set(String(a.id), { status: a.effective_status || null, thumb: cr.thumbnail_url || null, permalink });
    }
  }

  // Embudo (de los totales de cuenta) + video de cuenta (sumando las filas de extra).
  const funnel = totRow ? embudoDe(totRow) : [];
  const videoTotal = extraRes.ok
    ? extraRes.rows.reduce(
        (t, r) => {
          const v = videoDe(r);
          return { plays3s: t.plays3s + v.plays3s, thruplay: t.thruplay + v.thruplay, impressions: t.impressions + num(r.impressions) };
        },
        { plays3s: 0, thruplay: 0, impressions: 0 },
      )
    : { plays3s: 0, thruplay: 0, impressions: 0 };
  videoTotal.hookRate = videoTotal.impressions ? (videoTotal.plays3s / videoTotal.impressions) * 100 : 0;

  // Demografía (edad×género) y regiones, ordenadas por gasto, solo con gasto > 0.
  const demografia = (ageRes.ok ? ageRes.data.data || [] : [])
    .map((row) => ({ age: row.age || '', gender: row.gender || '', ...ventaDe(row) }))
    .filter((d) => d.spend > 0)
    .sort((a, b) => b.spend - a.spend);
  const regiones = (regRes.ok ? regRes.data.data || [] : [])
    .map((row) => ({ region: row.region || '—', ...ventaDe(row) }))
    .filter((d) => d.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 15);

  // Anuncios → agrupar por campaña, subtotal por campaña, ordenar por gasto.
  const ads = adsRes.rows.map((row) => {
    const base = adDe(row);
    const ex = extraPorId.get(String(row.ad_id));
    const st = statusPorId.get(String(row.ad_id)) || null;
    return {
      ...base,
      status: st ? st.status : null,
      thumb: st ? st.thumb : null,
      permalink: st ? st.permalink : null,
      ranking: ex ? { quality: ex.quality_ranking || null, engagement: ex.engagement_rate_ranking || null, conversion: ex.conversion_rate_ranking || null } : null,
      video: ex ? videoDe(ex) : { plays3s: 0, thruplay: 0, hookRate: 0 },
    };
  });
  // Objetivo por campaña (de la consulta aislada; si falló, quedan todas sin objetivo).
  const objetivoPorId = new Map();
  if (campRes.ok && campRes.data && Array.isArray(campRes.data.data)) {
    for (const c of campRes.data.data) objetivoPorId.set(String(c.id), c.objective || null);
  }

  const porCamp = new Map();
  for (const a of ads) {
    if (!porCamp.has(a.campaign_id)) porCamp.set(a.campaign_id, { id: a.campaign_id, nombre: a.campaign_name, ads: [] });
    porCamp.get(a.campaign_id).ads.push(a);
  }
  const campañas = [...porCamp.values()]
    .map((c) => {
      const objetivo = objetivoPorId.get(String(c.id)) || null;
      return {
        id: c.id,
        nombre: c.nombre,
        objetivo,
        // `tipo` es lo que la pantalla usa para decidir QUÉ métrica mostrar: una campaña de venta
        // se juzga por ROAS y una de tráfico por lo que cuesta traer a alguien al perfil.
        tipo: objetivo && OBJETIVOS_VENTA.has(objetivo) ? 'venta' : objetivo && OBJETIVOS_TRAFICO.has(objetivo) ? 'trafico' : 'otro',
        totales: sumar(c.ads),
        ads: c.ads.sort((x, y) => y.spend - x.spend),
      };
    })
    .sort((a, b) => b.totales.spend - a.totales.spend);

  // ROAS de las pautas de VENTA: se calcula sobre el gasto y los ingresos de esas campañas nada
  // más. El `roas` de la cuenta sigue existiendo y no se toca (lo consume la alerta del panel
  // Gerencial): esto se suma al lado, no lo reemplaza.
  // Qué action_types trajo Meta en esta cuenta. Es diagnóstico, no métrica: el nombre exacto de
  // la visita al perfil no está documentado de forma estable, así que si `perfil` da 0 esta lista
  // dice con qué nombre viene de verdad, sin tener que abrir la Graph API a mano.
  const accionesVistas = totRow && Array.isArray(totRow.actions)
    ? [...new Set(totRow.actions.map((a) => String((a && a.action_type) || '')).filter(Boolean))].sort()
    : [];

  const deVenta = campañas.filter((c) => c.tipo === 'venta');
  const gastoVenta = deVenta.reduce((t, c) => t + c.totales.spend, 0);
  const ingresoVenta = deVenta.reduce((t, c) => t + c.totales.revenue, 0);
  const ventasVenta = deVenta.reduce((t, c) => t + c.totales.purchases, 0);
  const venta = objetivoPorId.size
    ? { campañas: deVenta.length, spend: gastoVenta, revenue: ingresoVenta, purchases: ventasVenta, roas: gastoVenta ? ingresoVenta / gastoVenta : 0 }
    : null;

  const daily = (dayRes.ok ? (dayRes.data.data || []) : [])
    .map((row) => ({ date: row.date_start, spend: num(row.spend), revenue: accion(row.action_values, COMPRA), purchases: accion(row.actions, COMPRA) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const placements = (plRes.ok ? (plRes.data.data || []) : [])
    .map((row) => ({ platform: row.publisher_platform || '', position: row.platform_position || '', spend: num(row.spend), purchases: accion(row.actions, COMPRA), revenue: accion(row.action_values, COMPRA) }))
    .filter((p) => p.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  return res.status(200).json({ ok: true, rango: rangoEco, cuenta: { id: account, nombre, moneda }, totales, venta, accionesVistas, funnel, video: videoTotal, demografia, regiones, campañas, daily, placements });
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
// `rangoQS` se mudó a `lib/meta-ads/ventana.core.js` como `elegirRango`, que además devuelve el eco
// y contesta con un motivo en vez de sustituir el rango pedido por otro.

// `accion`, `sumaAcciones` y `accionRe` viven en `lib/meta-ads/metricas.core.js` (importadas arriba).

// `FUNNEL` y `TIPO_FUNNEL` viven en `lib/meta-ads/metricas.core.js`: los comparte el parte.

// Embudo (cantidad + costo por paso) de una fila de insights.
function embudoDe(row) {
  const spend = num(row.spend);
  return FUNNEL.map((p) => {
    const count = accion(row.actions, p.type);
    return { key: p.key, label: p.label, count, costo: count ? spend / count : 0 };
  });
}
// Métricas de video de una fila (hook = reproducciones de 3s ÷ impresiones).
function videoDe(row) {
  const plays3s = sumaAcciones(row.video_3_sec_watched_actions);
  const thruplay = sumaAcciones(row.video_thruplay_watched_actions);
  const impr = num(row.impressions);
  return { plays3s, thruplay, hookRate: impr ? (plays3s / impr) * 100 : 0 };
}
// Ventas/ingresos de una fila de breakdown (demografía/región).
function ventaDe(row) {
  return { spend: num(row.spend), purchases: accion(row.actions, COMPRA), revenue: accion(row.action_values, COMPRA) };
}

// `metricasDe` vive en `lib/meta-ads/metricas.core.js` (importada arriba).

// Una fila de anuncio (level=ad).
function adDe(row) {
  return {
    ad_id: row.ad_id,
    ad_name: row.ad_name || '(sin nombre)',
    adset_name: row.adset_name || '',
    campaign_id: row.campaign_id || 'sin-campaña',
    campaign_name: row.campaign_name || '(sin campaña)',
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks: num(row.clicks),
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    purchases: accion(row.actions, COMPRA),
    revenue: accion(row.action_values, COMPRA),
    roas: accion(row.purchase_roas, COMPRA),
    // 🔑 Los tres pasos de ANTES de la compra, por aviso. Meta los manda en el mismo `actions` que
    // ya se pide para las compras —o sea que no cuestan una llamada ni un campo más— y la
    // proyección los tiraba. Es lo único que deja comparar dos piezas que todavía no vendieron,
    // que son casi todas casi siempre: el costo por CARRITO se mueve mucho antes que el costo por
    // compra, y con 3 compras en un día el costo por compra no distingue nada.
    lpv: accion(row.actions, TIPO_FUNNEL.landing_page_view),
    carritos: accion(row.actions, TIPO_FUNNEL.add_to_cart),
    checkouts: accion(row.actions, TIPO_FUNNEL.initiate_checkout),
    perfil: accionRe(row.actions, RE_PERFIL),
    seguidores: accionRe(row.actions, RE_SEGUIDOR),
  };
}

// Suma un conjunto de filas (para el subtotal de campaña / fallback de cuenta). Los ratios se recalculan
// desde los agregados (no se promedian); reach NO se suma (es dedup) → se omite en subtotales.
function sumar(rows) {
  const t = { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, perfil: 0, seguidores: 0 };
  for (const r of rows) {
    t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks; t.purchases += r.purchases; t.revenue += r.revenue;
    t.perfil += r.perfil || 0; t.seguidores += r.seguidores || 0;
  }
  return {
    ...t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
    roas: t.spend ? t.revenue / t.spend : 0,
    costoPerfil: t.perfil ? t.spend / t.perfil : 0,
    costoSeguidor: t.seguidores ? t.spend / t.seguidores : 0,
  };
}

/**
 * ¿El rango es de pocos días? Define si se pide TODO o solo lo que gastó. Cubre los presets
 * cortos y también el rango con fechas de "Hoy y ayer", que la pantalla manda como since/until
 * porque Meta no tiene un preset para eso.
 */
function esRangoCorto(rangoEco) {
  if (rangoEco === 'today' || rangoEco === 'yesterday') return true;
  if (!rangoEco || typeof rangoEco !== 'object') return false;
  const a = Date.parse(rangoEco.since), b = Date.parse(rangoEco.until);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(b - a) <= 2 * 86400000;
}

// `num` se mudó a `lib/meta-ads/metricas.core.js` (importada arriba), y `mensajeError` —que
// prioriza `error_user_msg`, el texto que Meta escribe para una persona— a `graph.core.js` junto
// con el resto de la plomería.
