// FRÍA vs REMARKETING: a quién le está comprando la plata de esta marca — de UNA línea.
//
//   GET /api/meta-ads?recurso=publicos&linea=bdi[&dias=7|14|30]
//
// ⚠️ Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby.
//
// # Por qué hace falta Graph acá, si la zona de Rendimiento sale entera de la base
//
// Porque la foto **no guarda el público**. Guarda plata, compras y estado por conjunto, y el público
// vive en `targeting{custom_audiences}`, que sólo está en Meta. Es UNA llamada por cuenta
// (`/adsets`, paginada), y es la razón por la que este recurso va DEBAJO del guard del token
// mientras Rendimiento, las reglas y los informes van arriba.
//
// 🔑 **Con Graph caído ⛔ no se calla ni se rompe: contesta el gasto de la ventana sin partir, y
// dice por qué.** El total es un hecho que sale de la foto; lo que falta es el corte. Un 500 acá
// escondería que la plata existe, y un cero repartido afirmaría un reparto que ⛔ no se midió.
//
// # 🔴 Lo que este endpoint NO puede contestar, y lo dice en `cobertura`
//
// Un conjunto que gastó en la ventana y hoy ⛔ no está en Meta —pausado y archivado, o borrado— ⛔ no
// tiene público que leer. Su plata va a `sin-clasificar`, ⛔ nunca repartida entre los otros tres:
// repartirla infla justo el número que se vino a mirar.
import { lineasQueVe } from '../lib/meta-ads/acciones.core.js';
import { esLinea, ETIQUETA_LINEA } from '../lib/meta-ads/lineas.core.js';
import { graph, insightsTodas, mensajeError, tokenMeta } from '../lib/meta-ads/graph.core.js';
import { leerSnapshot } from '../lib/meta-ads/leer-snapshot.core.js';
import { desdeDe, elegirVentana, ultimoDiaCerrado } from '../lib/meta-ads/rendimiento.core.js';
import { publicoDe, repartirPorPublico, sesgoDeAtribucion, veredictoDePublicos } from '../lib/meta-ads/publicos.core.js';
import { clienteBdi } from './_meta-lineas.js';

/**
 * Las columnas que hacen falta. Explícitas y nunca `*`, como todo lo que lee la foto.
 *
 * ⚠️ `capturado_at` ⛔ no es un adorno: es lo único con lo que se sabe **si el último día ya cerró**,
 * y sin eso la ventana termina en un día a medias que se lee como entero.
 */
const COLS = 'fecha,nivel,objeto_id,campaign_id,nombre,linea,estado_efectivo,capturado_at,spend,impresiones,clicks,compras,revenue';

/** Un colchón sobre la ventana: `ultimoDiaCerrado()` se deriva de las filas, así que hay que traer de más. */
const COLCHON = 7;

export default async function publicosGet(res, perfil, q) {
  const visibles = lineasQueVe(perfil);
  if (!visibles.length) return res.status(403).json({ error: 'No tenés acceso a la pauta de ninguna marca.' });

  const linea = String(q.linea || '').toLowerCase();
  if (!linea) return res.status(400).json({ error: 'Falta «linea»: el reparto por público es de una sola línea de pauta.' });
  if (!esLinea(linea)) return res.status(400).json({ error: `«${linea}» no es una línea de pauta.` });
  // 🔑 El corte por permiso se hace ACÁ y ⛔ no confiando en que la pantalla no lo pida: un selector
  // puede quedar viejo, el servidor no. Es el mismo gate que la zona de Rendimiento.
  if (!visibles.includes(linea)) {
    return res.status(403).json({ error: `No tenés acceso a la pauta de «${linea}».` });
  }

  const v = elegirVentana(q.dias);
  if (v.error) return res.status(400).json({ error: v.error });
  const dias = v.dias;

  const sb = clienteBdi();
  if (!sb) return res.status(502).json({ error: 'Faltan las credenciales de Supabase para leer la foto.' });

  const hoyish = new Date().toISOString().slice(0, 10);
  const desdeCrudo = desdeDe(hoyish, dias + COLCHON);
  const snap = await leerSnapshot(sb, { cols: COLS, desde: desdeCrudo, nivel: 'conjunto', lineas: [linea] });
  if (snap.error) return res.status(502).json({ error: 'No se pudo leer la foto diaria.', detalle: snap.error });

  const filas = snap.filas || [];
  const cierre = ultimoDiaCerrado(filas);
  if (!cierre) {
    return res.status(200).json({
      ok: true, linea, dias, partes: null, clasificado: false,
      motivo: filas.length
        ? 'La foto todavía ⛔ no tiene ningún día cerrado de esta línea: el corte de la mañana es el que cierra el anterior.'
        : 'La foto ⛔ no tiene ni una fila de conjunto de esta línea. ¿Corrió el snapshot?',
    });
  }
  const desde = desdeDe(cierre, dias);
  const deLaVentana = filas.filter((f) => {
    const d = String(f.fecha || '').slice(0, 10);
    return d >= desde && d <= cierre;
  });

  const marca = ETIQUETA_LINEA[linea] || linea;
  const censo = await publicosDeMeta();
  const eco = { ok: true, linea, dias, desde, hasta: cierre };

  // 🔴 Sin el público leído ⛔ no se inventa un reparto: se contesta el gasto de la ventana, que es
  // un hecho de la foto, y el motivo. Ver el encabezado.
  if (censo.error) {
    const total = deLaVentana.reduce((s, f) => s + (Number(f.spend) || 0), 0);
    return res.status(200).json({ ...eco, partes: null, clasificado: false, total, motivo: censo.error });
  }

  const { partes, total } = repartirPorPublico(deLaVentana, censo.mapa);
  // Qué tan completa quedó la lectura. Va a la pantalla: «el 12% sin clasificar» cambia cómo se lee
  // todo lo demás, y un reparto que ⛔ no dice su cobertura afirma más de lo que midió.
  const conPlata = new Set(deLaVentana.filter((f) => (Number(f.spend) || 0) > 0).map((f) => String(f.objeto_id)));
  const sinLeer = [...conPlata].filter((id) => !censo.mapa.has(id));
  return res.status(200).json({
    ...eco,
    clasificado: true,
    partes,
    total,
    veredicto: veredictoDePublicos(partes, { total, marca }),
    sesgo: sesgoDeAtribucion(partes),
    cobertura: {
      conjuntosEnMeta: censo.mapa.size,
      conGastoEnLaVentana: conPlata.size,
      sinPublicoLeido: sinLeer.length,
      // ⚠️ Los que Meta lista pero ⛔ no leyeron `targeting`: es una falla de lectura, ⛔ no un
      // público. Van aparte del `sin-clasificar`, que son los que ya ⛔ no están en Meta.
      sinTargeting: censo.sinTargeting,
    },
  });
}

/**
 * El público de cada conjunto de TODAS las cuentas del token, en un `Map` de `id → público`.
 *
 * 🔑 **Se piden todas las cuentas y ⛔ no «la de la línea»**: las tres líneas se pautean desde la
 * MISMA cuenta publicitaria, y el corte por línea ya lo hizo la foto. Es una llamada de censo por
 * cuenta, del mismo orden que la del Embudo.
 *
 * ⚠️ **Una cuenta caída deja el censo INCOMPLETO, y eso vuelve como error y ⛔ no como un mapa a
 * medias**: los conjuntos de esa cuenta caerían en `sin-clasificar` y se leerían como «pausados y
 * archivados», que es otra cosa y manda a mirar a otro lado.
 */
async function publicosDeMeta() {
  if (!tokenMeta()) return { error: 'Meta Ads ⛔ no está configurado (falta o venció el token), así que ⛔ no se pudo leer el público de los conjuntos.' };
  const cuentasRes = await graph('me/adaccounts?fields=account_id&limit=100');
  if (!cuentasRes.ok) return { error: `⛔ No se pudieron listar las cuentas de Meta: ${mensajeError(cuentasRes)}` };
  const cuentas = ((cuentasRes.data && cuentasRes.data.data) || []).map((c) => String(c.account_id));
  if (!cuentas.length) return { error: 'El token ⛔ no ve ninguna cuenta publicitaria.' };

  const mapa = new Map();
  let sinTargeting = 0;
  for (const id of cuentas) {
    const r = await insightsTodas(
      `act_${id}/adsets?fields=id,targeting{custom_audiences,excluded_custom_audiences}&limit=500`,
    );
    if (!r.ok) return { error: `⛔ No se pudieron leer los públicos de la cuenta ${id}: ${r.error}` };
    for (const a of r.rows) {
      const p = publicoDe(a.targeting);
      // ⛔ Un conjunto sin `targeting` legible NO entra al mapa: entraría como `abierta` y eso es
      // plata contada en el balde que menos se puede contradecir.
      if (p) mapa.set(String(a.id), p);
      else sinTargeting += 1;
    }
  }
  return { mapa, sinTargeting };
}
