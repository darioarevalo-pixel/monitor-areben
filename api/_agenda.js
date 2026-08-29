// "Agenda operativa": qué corre HOY. Tablas `agenda_promos`, `agenda_items` y `agenda_hechos`.
//
//   GET  ?recurso=agenda                                    → { ok, promos, items, hechos, puede }
//   POST { recurso:'agenda', action:'guardar-promo', promo }
//   POST { recurso:'agenda', action:'borrar-promo', id }
//   POST { recurso:'agenda', action:'guardar-item', item }
//   POST { recurso:'agenda', action:'borrar-item', id }
//   POST { recurso:'agenda', action:'marcar', id, fecha, nota }
//   POST { recurso:'agenda', action:'desmarcar', id, fecha }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=agenda`. El plan Hobby de
// Vercel admite 12 funciones y hay 9 usadas. Si alguien crea `api/agenda.js` "por prolijidad",
// **frena todos los deploys sin error visible**: Vercel sigue sirviendo la versión anterior y no
// avisa. Ya pasó una vez.
//
// # Tres cosas que van escritas porque su ausencia se leería como un olvido
//
// 1. **No valida `store`.** Una promoción bancaria la define el banco, no BDI ni Zattia (ver el
//    encabezado del `.sql`). Que valga sólo para una marca se dice con la columna `marcas`, que es
//    una lista. El `Content-Type: application/json` del POST **sigue siendo obligatorio**: sin él
//    Vercel no parsea el cuerpo y el síntoma sería "falta id" en vez de un error de formato.
// 2. **No usa `puedeVer` en el GET.** La agenda la ve todo el equipo — es la contracara de que
//    exista: una promo que no le llega a quien cobra no sirve. `agenda` está en `KEYS_SIN_PERMISO`.
// 3. **`autor` sale de `perfil.name`, NUNCA del body.** Si viajara del cliente, cualquiera podría
//    firmar como otro. Vale igual para el `usuario` del tilde.
//
// # Lo único que se escribe SIN el sub es el tilde
//
// Cargar un pendiente es de gerencia; marcarlo hecho es de quien lo hace. El alcance del tilde no
// sale de un permiso sino del **destino**, que se filtra acá y no en la pantalla: si filtrara sólo
// la pantalla, un pendiente ajeno igual encendería el badge del menú.
import { createClient } from '@supabase/supabase-js';
import { equipoDelPadron, exigirUsuario } from './_auth.js';
import { marcasConAcceso } from '../lib/permisos.core.js';
import { aplicaEn, esFechaIso, motivoReglaInvalida } from '../lib/agenda/reglas.core.js';
// El "¿a quién le llega?" ya estaba resuelto para las novedades y es exactamente la misma pregunta.
// Se importa de su carpeta en vez de mudarlo a `lib/`: mover el archivo tocaría cuatro archivos de
// Novedades, que es código compartido, y la ruta rara cuesta menos que el conflicto.
import { esParaMi, normalizarDestino } from '../lib/novedades/destino.core.js';
import { CLAVES_PUERTA, moldeCorreEnMarca, puertaDeTipo } from '../lib/agenda/puertas.core.js';
// Las plantillas de siembra y su EJE. Desde el 29-ago-2026 son **dos** —el ingreso de mercadería y
// la sesión de fotos— y este handler no sabe decir «ingreso»: lee cuál es la plantilla, cuál es su
// eje y qué rango de días admite. La lista blanca vive en `plantillas.core.js` porque la pantalla
// la necesita tipada y el handler la necesita en `.js`. Ver su encabezado.
import { CLAVES_PLANTILLA, esClavePlantilla, moldeCorreEnEje, offsetDeMolde, plantillaDe } from '../lib/agenda/plantillas.core.js';
// El techo. Va acá y no en la pantalla por lo mismo que el destino: un pendiente que se
// filtra sólo al dibujar igual enciende el badge y sigue viajando en el JSON.
import { esDeArriba, veLoDeArriba } from '../lib/agenda/jerarquia.core.js';

/**
 * Siempre la base de BDI, tenga la sesión la marca que tenga. No es un descuido: acá no hay marca.
 * Además Zattia no tiene service key. Mismo criterio que `_sistema.js`.
 */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

/** Cargar es cross-marca: tildado en cualquiera de las dos alcanza, porque esto no tiene marca. */
function puedeCargar(perfil) {
  return marcasConAcceso(perfil, 'agenda.cargar', ['bdi', 'zattia']).length > 0;
}

/**
 * ¿Le sirve a esta persona algo marcado para `marcas`?
 *
 * 🔑 **`marcas` vacío es LAS DOS**, no ninguna — una promoción la define el banco y lo normal es que
 * valga para todo lo que se cobre en ese mostrador. Leerlo al revés escondería la mayoría.
 *
 * ⚠️ Las marcas de la persona salen de `marcasConAcceso` y **no de `perfil.cuenta` a secas**: `cuenta`
 * contesta otra pregunta —¿está clavado a una marca?— y da vacío para todo el que puede cambiar de
 * marca en el header. Ese atajo es el que dejó Canjes roto una vez.
 */
function esDeMisMarcas(marcas, mias) {
  const lista = marcas || [];
  return lista.length === 0 || lista.some((m) => mias.includes(m));
}

const MEDIOS = ['credito', 'debito', 'app', 'qr', 'transferencia'];
const CANALES = ['mostrador', 'web'];
const MARCAS = ['bdi', 'zattia'];
const CLASES = ['pendiente', 'aviso'];

/** Cuántos ítems puede sembrar la puerta en un día. Es un techo de cordura, no una regla de uso. */
const TOPE_SEMBRADO_DIARIO = 60;

const CAMPOS =
  'id, banco, medio, beneficio, regla, desde, hasta, condiciones, pasos, canales, marcas, activa, autor, created_at';

// 🔑 `datos` es lo accesorio del ítem, y las columnas de al lado son proyecciones para filtrar y
// ordenar: un campo nuevo viaja por ahí **sin migración**. Estuvo en la tabla desde el día uno y
// vacía; la primera que la usa es `arrastra`.
const CAMPOS_ITEM =
  'id, clase, titulo, cuerpo, regla, destino, marcas, manual_id, activo, datos, autor, created_at';

const CAMPOS_HECHO = 'item_id, fecha, usuario, nota, hecho_at';

/** Los días de acuse que viajan en el GET **de todos los ítems**. Espejo de `lib/agenda/tipos.ts`. */
const DIAS_CUMPLIMIENTO = 30;

/**
 * Hasta dónde va la cola vieja del acuse, **sólo de los ítems que arrastran**. Espejo de
 * `DIAS_ARRASTRE` en `lib/agenda/tipos.ts`.
 *
 * 🔴 **Los dos lados o ninguno.** `ocurrenciaAbierta()` mira hacia atrás exactamente este número de
 * días; si el GET mandara menos, el navegador vería una ocurrencia vieja sin tilde y la llamaría
 * pendiente cuando en realidad el tilde existe y no viajó. Un rojo que no se puede apagar.
 */
const DIAS_ARRASTRE = 120;

/**
 * ¿Vino un número, o vino la ausencia de uno?
 *
 * 🔴 ⛔ **`Number(null)` es `0`, no `NaN`**, así que un `Number.isFinite(Number(x))` a secas
 * convierte «vacío» en «cero». En `arrastraDias` eso sería «vence el mismo día» en vez de «sin
 * tope»: el renglón que desaparece antes de que nadie lo vea. Por eso `null`, `undefined` y `''`
 * se descartan a mano.
 *
 * ⚠️ Lo mismo valía para `offsetDias` y estaba vivo: el formulario devuelve `null` en todo lo que no
 * es molde, así que **cada guardado a mano le escribía `offsetDias: 0` a un ítem que no lo tiene**.
 * Se vio en producción el 25-ago, releyendo la pasada de Tienda Nube después de ponerle el tope. Es
 * inerte —sólo lo miran los moldes, y ahí 0 es el default— pero es basura escrita en `datos` y es la
 * misma trampa, así que se tapa en el mismo lugar.
 */
function numeroDado(v) {
  if (v === null || v === undefined || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

/**
 * El día de hoy en UTC, que es el reloj del servidor.
 *
 * 🔴 **No es el día de la persona**, y por eso acá se usa sólo para poner topes holgados —la ventana
 * del acuse, el techo de "no se tilda el futuro"—, nunca para decidir qué se ve. A las 21:00 de
 * Argentina esto ya devuelve mañana. El día que se muestra lo manda el navegador.
 */
function hoyUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** `fecha + n` días, en ISO. Sólo para correr los topes; la aritmética fina vive en el motor. */
function masDias(fecha, n) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Una lista de strings de un catálogo cerrado, sin repetidos. Devuelve `null` si trae basura. */
function listaDe(v, validos) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map(String))];
  return out.every((x) => validos.includes(x)) ? out : null;
}

/**
 * El beneficio, validado por rama.
 *
 * Los tres se cobran distinto y por eso no se aplanan en un `pct` suelto. `tope` sólo existe en el
 * reintegro —es lo que el banco devuelve después, y sin tope el número no significa nada— y va
 * `null` cuando no lo hay, que no es lo mismo que cero.
 */
function normalizarBeneficio(b) {
  if (!b || typeof b !== 'object') return { error: 'Falta el beneficio.' };
  const pct = Number(b.pct);
  if (b.tipo === 'descuento' || b.tipo === 'reintegro') {
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { error: 'El porcentaje va entre 1 y 100.' };
    if (b.tipo === 'descuento') return { valor: { tipo: 'descuento', pct } };
    const tope = b.tope === null || b.tope === undefined || b.tope === '' ? null : Number(b.tope);
    if (tope !== null && (!Number.isFinite(tope) || tope <= 0)) return { error: 'El tope tiene que ser un monto.' };
    return { valor: { tipo: 'reintegro', pct, tope } };
  }
  if (b.tipo === 'cuotas') {
    const n = Number(b.n);
    if (!Number.isInteger(n) || n < 2 || n > 24) return { error: 'Las cuotas van de 2 a 24.' };
    return { valor: { tipo: 'cuotas', n, sinInteres: !!b.sinInteres } };
  }
  return { error: 'Tipo de beneficio desconocido (descuento, reintegro o cuotas).' };
}

/**
 * Sembrar la lista corta de un hecho: **clona los moldes de una plantilla** con su fecha.
 *
 * Las plantillas son dos —el ingreso de mercadería y la sesión de fotos— y este motor no sabe cuál
 * es cuál: lee de `plantillas.core.js` cuál es su eje, cómo se llama el hecho y qué días admite.
 *
 * 🔑 **Los renglones no están escritos acá y eso es el diseño.** Salen de los ítems marcados como
 * molde (`datos.plantilla`), que se cargan una vez con el mismo formulario de siempre: así la dueña
 * de cada paso —que cambia cuando cambia la gente— se edita en una pantalla y no en un deploy. Sin
 * moldes cargados no hace nada y lo dice, en vez de fingir que sembró.
 *
 * 🔑 **La idempotencia es por `clave`**, no por «ya corrió hoy»: el mismo hecho avisado dos veces
 * —el reintento de un webhook, alguien que aprieta dos veces— no puede duplicar los pendientes. La
 * clave se guarda en el campo que dice la plantilla (`datos.ingreso`, `datos.sesion`), y ⛔ no en
 * uno solo compartido: `datos.ingreso` ya está escrito en la base desde el 24-ago.
 *
 * 🔑 **El eje es obligatorio y no tiene default.** En el ingreso es la PUERTA: dos de los pasos —el
 * nombre y la descripción— cambian de dueña según por dónde entró el producto. En la sesión de
 * fotos es el ORIGEN: de quién es la sesión lo decide si vino de un ingreso, de una campaña o de un
 * faltante. Sembrar «todo» dejaría renglones con la dueña equivocada, que es peor que no sembrar:
 * nadie revisa un pendiente que ya tiene nombre puesto. Mismo criterio que el 503 de la puerta sin
 * secreto: **lo que falta cierra, no abre.**
 *
 * 🔑 **La MARCA también es obligatoria, y por el mismo motivo.** Un paso puede ser de una sola de
 * las dos: la descripción de una compra nacional la escribe **el local si es ropa de Zattia y nunca
 * si son fundas de BDI** (Bruno, 25-ago-2026). Sin saber la marca, esa regla no se puede decir con
 * un molde, así que faltando la marca **se cierra, no se abre**: 400. Se lee igual que el eje:
 * `marcas: []` en el molde quiere decir **las dos**, y por eso los pasos que no cambian se cargan
 * una sola vez.
 *
 * ⛔ **Ni el eje ni la marca entran en la clave de idempotencia.** El mismo ingreso es el mismo
 * ingreso: las dos son propiedades suyas, no parte de su identidad. Avisarlo dos veces con puertas
 * distintas es un error de quien avisa, y duplicar los renglones no lo arreglaría.
 *
 * Devuelve `{ creados, ya }`: `ya` cuenta el caso en que estaba sembrado y no se tocó nada.
 */
export async function sembrar(supabase, { plantilla, nombre, fecha, autor, eje, marca, clave: claveDada }) {
  const p = plantillaDe(plantilla);
  // ⛔ Nunca la primera por descarte: una plantilla desconocida sembraría la lista de otro hecho.
  if (!p) {
    const trajo = String(plantilla === undefined || plantilla === null ? '' : plantilla).trim();
    return { error: `No sé qué es la plantilla «${trajo.slice(0, 40)}». Las plantillas son: ${CLAVES_PLANTILLA.join(', ')}.` };
  }

  const limpio = String(nombre || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
  if (!limpio) return { error: `Falta el nombre ${p.delHecho}.` };
  if (!esFechaIso(fecha)) return { error: `La fecha ${p.delHecho} tiene que ser YYYY-MM-DD.` };
  if (!p.eje.claves.includes(String(eje))) {
    return { error: `${p.eje.pide} (usá ${p.eje.claves.join(', ')}).` };
  }
  // 🔑 Nombra lo que trajo cuando trajo algo: el que llama desde afuera manda su vocabulario y el
  // error es a la vez el pedido, igual que el 400 de `tipo`. ⛔ Y no hay un mapa de marcas como el
  // de las puertas: `bdi` y `zattia` son los dos negocios y no son una traducción de nada.
  if (!MARCAS.includes(String(marca))) {
    const trajo = String(marca === undefined || marca === null ? '' : marca).trim();
    return {
      error: trajo
        ? `No conozco la marca «${trajo.slice(0, 40)}». Las marcas son: ${MARCAS.join(', ')}.`
        : `Falta de qué marca es ${p.elHecho} (usá ${MARCAS.join(', ')}).`,
    };
  }

  /*
    🔑 **La clave la puede dar el que llama, y cuando puede darla es MEJOR que la nuestra.** La del
    ingreso es `fecha·nombre` porque del otro lado no hay un identificador: el aviso de Gerardo trae
    lo que trae. La sesión de fotos SÍ tiene id propio y estable, y ésa es la diferencia que importa:
    **la fecha de una sesión se edita**, y con `fecha·nombre` mover la sesión un día sembraría los
    nueve renglones otra vez.
  */
  const clave = String(claveDada || '').trim() || `${fecha}·${limpio.toLowerCase()}`;

  const { data: existentes, error: eLeer } = await supabase.from('agenda_items')
    .select('id, clase, titulo, cuerpo, regla, destino, marcas, manual_id, datos, created_at');
  if (eLeer) throw new Error(eLeer.message);
  const todos = existentes || [];

  // Ya sembrado: no se toca nada. ⛔ Ni siquiera se re-crea lo que alguien haya borrado a mano —
  // borrar un renglón es una decisión, y volver a ponerlo sería discutírsela.
  if (todos.some((i) => i.datos && i.datos[p.campoClave] === clave)) return { creados: 0, ya: true };

  // 🔑 El tope cuenta los clones de **las dos** plantillas: es un techo de cordura sobre lo que la
  // Agenda puede recibir en un día, y partirlo por plantilla lo duplicaría sin querer.
  const hoy = hoyUtc();
  const esClon = (i) => !!(i.datos && (i.datos.de || CLAVES_PLANTILLA.some((k) => i.datos[plantillaDe(k).campoClave])));
  const sembradosHoy = todos.filter((i) => esClon(i) && String(i.created_at || '').slice(0, 10) === hoy).length;
  if (sembradosHoy >= TOPE_SEMBRADO_DIARIO) return { error: 'Se llegó al tope de listas sembradas por hoy.' };

  const deLaPlantilla = todos.filter((i) => i.datos && i.datos.plantilla === p.key);
  if (!deLaPlantilla.length) return { error: `No hay ningún paso cargado como plantilla de ${p.evento}.` };

  // 🔑 El filtro por eje y por marca va **acá y no en la carga**: el molde de «descripción» de
  // producción propia no existe (ese paso no lleva renglón), y el de compra nacional está cargado
  // dos veces —el local para Zattia, Administración para BDI—. Las dos cosas se dicen cargando o no
  // cargando un molde, y las dos listas vacías quieren decir «todas».
  // ⚠️ La marca la contesta `moldeCorreEnMarca` y ⛔ no `esDeMisMarcas`, que es la de mirar: un
  // ingreso tiene UNA marca y una persona puede tener las dos. Están al lado y dicen cosas
  // distintas; el comentario de `puertas.core.js` explica por qué no son la misma función.
  const moldes = deLaPlantilla
    .filter((i) => moldeCorreEnEje(i.datos[p.eje.campo], eje) && moldeCorreEnMarca(i.marcas, marca))
    .sort((a, b) => (Number(a.datos.offsetDias) || 0) - (Number(b.datos.offsetDias) || 0) || String(a.titulo).localeCompare(String(b.titulo), 'es'));
  // Hay moldes, pero ninguno para esta combinación. ⚠️ Se dice distinto que «no hay moldes» porque
  // la acción es otra: allá hay que cargarlos, acá hay que revisar en qué puertas y en qué marcas
  // corren los que hay. 🔑 Y nombra **las dos**: con una sola, quien lo lea revisa la mitad
  // equivocada y concluye que la carga está bien.
  if (!moldes.length) {
    return { error: `Hay moldes cargados, pero ninguno corre para «${p.eje.rotulo(eje)}» en ${marca}.` };
  }

  const filas = moldes.map((m, n) => ({
    id: `it${Date.now()}_${n}_${Math.random().toString(36).slice(2, 8)}`,
    clase: m.clase,
    // El prefijo es el agrupador, y es un prefijo a propósito: ⛔ no se escribe un motor de
    // agrupación hasta haberlo usado dos veces (decisión de Bruno, 24-ago-2026).
    titulo: `${limpio} · ${m.titulo}`,
    cuerpo: m.cuerpo,
    // Un día puntual: lo del ingreso pasa una vez. El molde dice a cuántos días del hecho, y en la
    // sesión de fotos ese número puede ser NEGATIVO: la modelo se busca 48 h antes. El rango lo
    // validó la carga (`offsetDeMolde`), así que acá se usa tal como está guardado.
    regla: { tipo: 'unica', fecha: masDias(fecha, Math.trunc(Number(m.datos.offsetDias) || 0)) },
    destino: m.destino,
    // 🔑 El clon nace **en la marca del hecho**, ⛔ no con las del molde: un molde sin marca corre
    // en las dos, pero el renglón que salió de un ingreso de BDI es de BDI y de nadie más. Sin
    // esto, los ocho pasos comunes caerían en las dos marcas y el que trabaja parado en Zattia
    // vería los pendientes de un ingreso de fundas.
    marcas: [marca],
    manual_id: m.manual_id || null,
    activo: true,
    // 🔑 El clon **arrastra**: es la razón de ser de esto. Un paso del lanzamiento que se evapora al
    // día siguiente es exactamente el que «se cae porque nadie lo mira». ⛔ Y NO es plantilla: si lo
    // fuera, el molde se clonaría a sí mismo en el próximo ingreso.
    // 🔑 El eje y la marca quedan en el clon aunque nada las lea todavía: son el ÚNICO rastro de
    // por qué este ingreso sembró nueve renglones y no diez. Sin ellas, «faltó el de la
    // descripción» no se puede contestar sin adivinar. ⛔ Ninguna entra en `clave`.
    datos: {
      arrastra: true,
      // De qué plantilla salió. Es lo que deja contar los clones sin adivinar por el campo de la
      // clave, y lo que va a leer el día que la pantalla quiera agrupar por hecho.
      de: p.key,
      [p.campoClave]: clave,
      [p.eje.campoClon]: eje,
      marca,
      // 🔑 El tope lo pone el MOLDE, no el disparador: el formulario del molde es el mismo que el
      // de una rutina, así que si alguien le carga «hasta N días» ahí, tiene que valer para lo que
      // siembre — una pantalla que ofrece un campo que después no viaja igual afirma algo que no
      // es cierto. Sin tope en el molde, el clon queda hasta que lo tilden, que es el caso normal
      // del ingreso: lo que tarda no se puede decir de antemano.
      ...(numeroDado(m.datos.arrastraDias) ? { arrastraDias: Math.trunc(Number(m.datos.arrastraDias)) } : {}),
    },
    autor,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('agenda_items').insert(filas);
  if (error) throw new Error(error.message);
  return { creados: filas.length, ya: false };
}

/**
 * Sembrar desde OTRO handler, con la base maestra.
 *
 * 🔑 **Existe porque el 2º disparador no entra por una puerta: entra por una pantalla nuestra.** El
 * del ingreso lo avisa un sistema de afuera; la sesión de fotos se arma acá adentro, y el hecho que
 * la dispara es que alguien la haya creado. Así que quien tiene que llamar es `api/_solicitudes.js`,
 * que escribe en la base de su marca —y las de Zattia son otra base— mientras la Agenda vive siempre
 * en la maestra. Por eso el cliente lo abre esta función y ⛔ no viaja el del que llama.
 *
 * 🔴 **Nunca tira.** Sembrar es una consecuencia del guardado, no una condición: una sesión que no
 * se pudo guardar es un problema, una sesión guardada cuyos pasos no se sembraron es un aviso. El
 * que llama recibe `{ error }` y decide qué contar, ⛔ pero no pierde lo que la persona cargó.
 */
export async function sembrarEnMaestra(opts) {
  try {
    const cfg = cfgMaestra();
    if (!cfg.url || !cfg.key) return { error: 'Faltan credenciales de Supabase.' };
    return await sembrar(createClient(cfg.url, cfg.key), opts);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function handler(req, res) {
  /*
    🔴 **La puerta del ingreso, y va ANTES de exigir la sesión.** La llama el sistema de Ingresos
    (`ingreso2.arebensrl.com`, que es de Gerardo y ni siquiera tiene SSO), así que del otro lado no
    hay ninguna sesión del Monitor: la llave es un secreto compartido.

    El orden de los guards es la mitad de la seguridad, como en `api/blob-upload.js`. Por eso:

     - **Sin `INGRESO_SECRETO` configurado, la puerta está CERRADA**, no abierta. Una variable que
       falta no puede significar «que pase cualquiera»: es el modo de falla que convierte un olvido
       de configuración en un endpoint público.
     - **Se compara antes de tocar la base.** Lo que no trae el secreto no cuesta una consulta.
     - **Lo único que puede hacer es sembrar la plantilla.** No elige destinatarios, no escribe
       texto libre más allá del nombre del ingreso (80 caracteres, sin saltos de línea) y tiene tope
       diario. Una puerta abierta a internet que pudiera crear cualquier ítem de la Agenda le
       escribe a todo el equipo.
  */
  if (req.method === 'POST' && String((req.body || {}).action || '') === 'ingreso-externo') {
    const esperado = process.env.INGRESO_SECRETO || '';
    const trajo = String(req.headers['x-ingreso-secreto'] || '');
    if (!esperado) return res.status(503).json({ error: 'La puerta del ingreso no está configurada.' });
    if (!trajo || trajo !== esperado) return res.status(401).json({ error: 'no autorizado' });

    const cfgP = cfgMaestra();
    if (!cfgP.url || !cfgP.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
    const sb = createClient(cfgP.url, cfgP.key);
    const b = req.body || {};

    /*
      🔑 **La puerta la elige Administración en `ingreso2`, en la misma carga** (decisión de Bruno,
      24-ago-2026): la sabe quien carga, en el momento en que la sabe. Por eso viaja en el aviso y el
      Monitor no pregunta nada — no hay una rutina nueva que alguien tenga que acordarse de contestar.

      Se aceptan las dos formas y no es indulgencia: `tipo` es el vocabulario de Gerardo —el que va a
      mandar `ingreso2`— y `puerta` es el nuestro, que es lo que se puede probar con un `curl` sin
      esperar a que el mapa esté completo.

      🔴 **Un tipo que no está en el mapa contesta 400 y lo nombra, ⛔ no elige una puerta por
      defecto.** El error es a la vez el pedido: la primera prueba de Gerardo devuelve el texto exacto
      que hay que agregarle a `TIPOS_INGRESO2`.
    */
    const puerta = b.tipo === undefined || b.tipo === null || b.tipo === ''
      ? b.puerta
      : puertaDeTipo(b.tipo);
    if (b.tipo && !puerta) {
      return res.status(400).json({
        error: `No sé a qué puerta corresponde el tipo «${String(b.tipo).slice(0, 40)}». Las puertas son: ${CLAVES_PUERTA.join(', ')}.`,
      });
    }

    const r = await sembrar(sb, {
      plantilla: 'ingreso',
      nombre: b.nombre,
      fecha: esFechaIso(b.fecha) ? b.fecha : hoyUtc(),
      autor: 'Ingresos',
      eje: puerta,
      // 🔑 La marca viaja igual que la puerta y por el mismo motivo: la sabe quien carga el ingreso.
      // ⛔ No se deduce de la puerta —las cuatro existen en los dos negocios— ni se cae a una por
      // defecto: `sembrar` contesta 400 y la nombra.
      marca: b.marca,
    });
    if (r.error) return res.status(400).json({ error: r.error });
    return res.status(200).json({ ok: true, creados: r.creados, ya: r.ya });
  }

  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const yo = perfil.name || null;
  if (!yo) return res.status(400).json({ error: 'La sesión no tiene nombre; volvé a entrar.' });

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const supabase = createClient(cfg.url, cfg.key);
  const cargar = puedeCargar(perfil);
  // ¿Está arriba del techo? El admin y Dirección ven y asignan todo; el resto, ni ve ni asigna nada
  // dirigido a Dirección. Se calcula una sola vez, igual que `cargar`.
  const veArriba = veLoDeArriba(perfil);
  /**
   * El padrón, sólo si hace falta y sólo una vez por request.
   *
   * ⚠️ **Sólo lo pide quien está DEBAJO del techo**, que es el único para el que la respuesta puede
   * cambiar algo: para el admin y para Dirección el filtro no corre, así que ir a buscarlo sería una
   * ida a `bdi-catalogo` por cada carga de agenda de Bruno para no usarla.
   */
  let equipoMemo = null;
  const equipo = async () => {
    if (veArriba) return [];
    if (equipoMemo === null) equipoMemo = await equipoDelPadron(req);
    return equipoMemo;
  };

  try {
    if (req.method === 'GET') {
      // Quien no carga no ve las apagadas: una promo apagada es una que se decidió no dar, y verla
      // en el mostrador se leería como vigente.
      //
      // 🔴 **No se filtra por fecha acá, y es a propósito.** El servidor corre en UTC: a las 21:00 de
      // Argentina ya es mañana, así que una promo que termina hoy desaparecería tres horas antes,
      // justo en el horario en que el local sigue cobrando. El día lo decide el navegador con
      // `hoyIso()`, que es el día que la persona tiene en la cabeza. Son decenas de filas, no miles.
      let q = supabase.from('agenda_promos').select(CAMPOS).order('desde', { ascending: false });
      if (!cargar) q = q.eq('activa', true);

      // Los ítems apagados son de administración, igual que las promos apagadas.
      let qi = supabase.from('agenda_items').select(CAMPOS_ITEM).order('titulo');
      if (!cargar) qi = qi.eq('activo', true);

      // El acuse viaja acotado a la ventana que mira Cumplimiento, con un día de más de colchón por
      // el desfasaje de UTC. Es la única tabla que crece con el uso: sin tope, en un año el GET del
      // shell se llevaría miles de tildes que nadie va a mirar.
      const desdeHechos = masDias(hoyUtc(), -(DIAS_CUMPLIMIENTO + 1));

      const [pro, ite, hec] = await Promise.all([
        q,
        qi,
        supabase.from('agenda_hechos').select(CAMPOS_HECHO).gte('fecha', desdeHechos),
      ]);
      const { data, error } = pro;
      if (error) throw new Error(error.message);
      if (ite.error) throw new Error(ite.error.message);
      if (hec.error) throw new Error(hec.error.message);

      /*
        🔑 **El segundo tramo del acuse: la cola vieja, y sólo de los que arrastran.**

        Un pendiente que arrastra se debe hasta que alguien lo tilde, y un ingreso de mercadería
        —Bruno, 24-ago: «a veces más rápido, a veces más lento»— puede tardar más de un mes. Con la
        ventana de treinta días, ese renglón se evaporaba **callado** el día 31: no se hizo, no está
        tildado, y desaparece igual. Ver `DIAS_ARRASTRE`.

        🔴 **Por qué acotado a los que arrastran y no subiendo la ventana de todos.** Medido el
        25-ago contra producción: el acuse entero de 30 días eran 6 filas (0,8 KB de un GET de
        28,5 KB), pero la agenda tal como está cargada —32 pendientes vivos— genera 6 ocurrencias
        por día, así que 120 días de **todos** serían ~544 tildes (~73 KB), y eso antes del primer
        clon de ingreso. Acotada a los que arrastran, la cola crece con la cantidad de ítems que
        arrastran y no con el uso diario, que es lo que hace la diferencia entre un techo y una
        cuenta que sube sola.

        Va en una consulta aparte y no en un `.or()` porque necesita los ids, que salen de `qi`: es
        un viaje más, contra un GET que hoy tarda ~900 ms. `.lt(desdeHechos)` deja los dos tramos
        sin solapamiento, así que se concatenan y no hay que deduplicar.
      */
      const idsArrastre = (ite.data || [])
        .filter((i) => String(i.clase) === 'pendiente' && i.datos && i.datos.arrastra && !i.datos.plantilla)
        .map((i) => i.id);
      let colaVieja = [];
      if (idsArrastre.length) {
        const desdeArrastre = masDias(hoyUtc(), -(DIAS_ARRASTRE + 1));
        const vie = await supabase.from('agenda_hechos').select(CAMPOS_HECHO)
          .in('item_id', idsArrastre)
          .gte('fecha', desdeArrastre)
          .lt('fecha', desdeHechos);
        if (vie.error) throw new Error(vie.error.message);
        colaVieja = vie.data || [];
      }

      // Las marcas que esta persona puede mirar. Quien no está clavado a una son las dos; quien sí,
      // la suya y nada más — y para ésa, lo de la otra marca no es que no se dibuje: **no viaja**.
      // La pantalla igual filtra por la marca del header, que es la que está mirando en este momento;
      // esto acota lo que sale del servidor, que es otra pregunta.
      const mias = marcasConAcceso(perfil, 'agenda', MARCAS);

      // 🔑 El destino se resuelve ACÁ. Quien carga recibe todos los ítems porque los administra,
      // pero cada uno viaja con `paraMi`: la pestaña Hoy, el bloque de Inicio y el badge miran ese
      // campo, así que administrar un pendiente ajeno no lo mete en la lista de nadie.
      const itemsTodos = (ite.data || []).map((i) => ({
        id: i.id,
        clase: i.clase,
        titulo: i.titulo,
        cuerpo: i.cuerpo,
        regla: i.regla,
        destino: normalizarDestino(i.destino),
        marcas: i.marcas || [],
        manualId: i.manual_id || null,
        activo: i.activo,
        // Sigue apareciendo hasta que lo tilden. El arrastre lo resuelve `pendientesDe()` en el
        // cliente: acá viaja la bandera y nada más.
        arrastra: !!(i.datos && i.datos.arrastra),
        // Cuántos días se debe, si arrastra. **`null` = sin tope**, que es lo que tienen las
        // reuniones y los clones del ingreso. Lo resuelve `ocurrenciaAbierta()`; acá viaja el número.
        arrastraDias: i.datos && Number.isFinite(i.datos.arrastraDias) ? i.datos.arrastraDias : null,
        // De qué plantilla es molde este ítem (ingreso · sesión de fotos). Un molde no corre ningún
        // día: lo filtra `vaEl`.
        plantilla: (i.datos && i.datos.plantilla) || null,
        offsetDias: i.datos && Number.isFinite(i.datos.offsetDias) ? i.datos.offsetDias : null,
        // En qué valores del eje corre el molde. **Vacío = todos**, igual que `marcas`. Son dos
        // campos y no uno «eje» genérico porque cada plantilla tiene el suyo y se guardan así en
        // `datos`: aplanarlos acá obligaría a saber de qué plantilla es para poder leerlos.
        // ⚠️ Al guardar se escribe **sólo el de su plantilla**: cambiarle la plantilla a un molde le
        // borra la lista del otro eje, que es lo correcto —un molde de sesión no corre en puertas—.
        puertas: (i.datos && Array.isArray(i.datos.puertas) ? i.datos.puertas : []),
        disparadores: (i.datos && Array.isArray(i.datos.disparadores) ? i.datos.disparadores : []),
        autor: i.autor,
        creado: i.created_at,
        paraMi: esParaMi(i.destino, perfil),
      }));
      // Quien carga los recibe todos aunque no sean suyos —los administra— pero la marca acota
      // igual a los dos: administrar lo de BDI parado en una cuenta clavada a Zattia no se puede
      // ni mirando, porque el header no cambia.
      const items = itemsTodos.filter((i) => esDeMisMarcas(i.marcas, mias));
      // 🔴 **El techo.** Quien carga sin ser Dirección administra la agenda del equipo, ⛔ no la de
      // arriba: la reunión de los socios y lo que se esté por decidir no le salen ni en «Cargar» ni
      // en «Cumplimiento» ni en el Mes. Los tres cuelgan de esta misma lista, que es el punto de que
      // el corte esté acá.
      //
      // ⚠️ Al que NO carga no le cambia nada: `paraMi` ya es más chico que esto —lo de Dirección no
      // es suyo—, así que el filtro se aplica sólo en la rama de arriba y no se paga el padrón.
      const delEquipo = cargar && !veArriba
        ? await (async () => { const eq = await equipo(); return items.filter((i) => !esDeArriba(i.destino, eq)); })()
        : items;
      const visibles = cargar ? delEquipo : items.filter((i) => i.paraMi);
      const idsVisibles = new Set(visibles.map((i) => i.id));

      return res.status(200).json({
        ok: true,
        items: visibles,
        // Los dos tramos, mezclados: el corto de todos y la cola vieja de los que arrastran. Quien
        // los lee no tiene por qué saber de qué consulta salió cada uno — `.lt`/`.gte` los dejaron
        // sin solapar, así que concatenar alcanza.
        hechos: [...(hec.data || []), ...colaVieja]
          .filter((h) => idsVisibles.has(h.item_id))
          .map((h) => ({
            itemId: h.item_id,
            fecha: h.fecha,
            usuario: h.usuario,
            nota: h.nota,
            hechoAt: h.hecho_at,
          })),
        promos: (data || []).filter((p) => esDeMisMarcas(p.marcas, mias)).map((p) => ({
          id: p.id,
          banco: p.banco,
          medio: p.medio,
          beneficio: p.beneficio,
          regla: p.regla,
          desde: p.desde,
          hasta: p.hasta,
          condiciones: p.condiciones || [],
          pasos: p.pasos,
          canales: p.canales || [],
          marcas: p.marcas || [],
          activa: p.activa,
          autor: p.autor,
          creado: p.created_at,
        })),
        puede: { cargar },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = String(b.action || '');

    // ─── La escritura abierta: el tilde ───────────────────────────────────────────────────────
    //
    // Va ANTES del control del sub, y es la única que lo saltea. Cargar un pendiente es de gerencia;
    // marcarlo hecho es de quien lo hace, y pedirle un permiso a eso sería pedirle un permiso a
    // trabajar. El alcance sale del `destino`, que ya se evaluó contra este perfil.
    if (action === 'marcar' || action === 'desmarcar') {
      const id = String(b.id || '');
      const fecha = String(b.fecha || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!esFechaIso(fecha)) return res.status(400).json({ error: 'La fecha del tilde no es un día real.' });

      const { data: item, error: errItem } = await supabase
        .from('agenda_items')
        .select('id, regla, destino, activo, clase')
        .eq('id', id)
        .maybeSingle();
      if (errItem) throw new Error(errItem.message);
      if (!item) return res.status(404).json({ error: 'Ese pendiente ya no existe.' });
      if (!esParaMi(item.destino, perfil)) {
        return res.status(403).json({ error: 'Ese pendiente no es tuyo.' });
      }

      if (action === 'desmarcar') {
        // Destildar no pide más que tildar, y es a propósito: en un puesto compartido el que se da
        // cuenta del error rara vez es el mismo que lo cometió.
        const { error } = await supabase.from('agenda_hechos').delete().eq('item_id', id).eq('fecha', fecha);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (!item.activo) return res.status(400).json({ error: 'Ese pendiente está apagado.' });
      if (item.clase !== 'pendiente') return res.status(400).json({ error: 'Un aviso no se tilda.' });
      // Tildar un día en que la rutina no corre ensuciaría Cumplimiento con ocurrencias que no
      // existen, y ahí ya no se puede distinguir lo que se hizo de lo que se tildó de más.
      if (!aplicaEn(item.regla, fecha)) {
        return res.status(400).json({ error: 'Ese pendiente no corre ese día.' });
      }
      // Se puede tildar un día pasado —olvidarse y anotarlo al otro día es exactamente lo que pasa—
      // pero no el futuro. El día de más es el colchón de UTC: el servidor va tres horas adelante.
      if (fecha > masDias(hoyUtc(), 1)) {
        return res.status(400).json({ error: 'Todavía no se puede tildar un día que no llegó.' });
      }

      const nota = b.nota ? String(b.nota).trim().slice(0, 300) : null;
      // 🔑 `ignoreDuplicates`: el tilde lo pone **el primero que llega**. Sin esto, dos personas del
      // mismo puesto tildando a la vez se pisarían el nombre y "quién lo hizo" cambiaría de a ratos.
      const { error } = await supabase
        .from('agenda_hechos')
        .upsert([{ item_id: id, fecha, usuario: yo, nota }], {
          onConflict: 'item_id,fecha',
          ignoreDuplicates: true,
        });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ─── De acá para abajo, todo pide el sub ──────────────────────────────────────────────────
    if (!cargar) return res.status(403).json({ error: 'No tenés permiso para cargar en la agenda.' });

    /**
     * 🔴 **El techo, del lado que escribe.** Contesta el 403 si corresponde, o `null` para seguir.
     *
     * Hay que preguntarlo por DOS destinos y ninguno sobra:
     *  - el que **llega** en el body, o asignar para arriba sería tipear un nombre;
     *  - el que **ya tiene** la fila, porque `guardar-item` es un `upsert` por id y `borrar-item` un
     *    delete por id: sin esto, alguien de abajo pisa o borra la reunión de los socios mandando su
     *    id, que no ve pero puede haber visto antes de que se cerrara el techo.
     *
     * ⚠️ **Y si el padrón no se pudo leer, CIERRA.** En el listado la caída deja ver de más, que es
     * un problema chico y transitorio; acá dejaría *escribir* de más, que no se deshace. Es el mismo
     * criterio del 503 de la puerta del ingreso: lo que falta cierra, no abre.
     */
    async function techoBloquea(...destinos) {
      if (veArriba) return null;
      const necesitaPadron = destinos.some((d) => d && normalizarDestino(d).tipo === 'personas');
      const eq = await equipo();
      if (necesitaPadron && !eq.length) {
        return res.status(503).json({ error: 'No se pudo leer el padrón para verificar a quién se le asigna. Probá de nuevo.' });
      }
      if (destinos.some((d) => d && esDeArriba(d, eq))) {
        return res.status(403).json({ error: 'Eso es de Dirección: no lo podés ver ni asignar desde tu perfil.' });
      }
      return null;
    }

    /** El destino que la fila YA tiene, o `null` si no existe todavía (un alta). */
    async function destinoGuardado(id) {
      const { data } = await supabase.from('agenda_items').select('destino').eq('id', id).maybeSingle();
      return data ? data.destino : null;
    }

    if (action === 'borrar-promo') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const { error } = await supabase.from('agenda_promos').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'guardar-promo') {
      const p = b.promo || {};
      const id = String(p.id || '');
      const banco = String(p.banco || '').trim();
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!banco) return res.status(400).json({ error: 'Falta el banco.' });
      if (!MEDIOS.includes(String(p.medio))) {
        return res.status(400).json({ error: `Medio de pago inválido (usá ${MEDIOS.join(', ')}).` });
      }

      const ben = normalizarBeneficio(p.beneficio);
      if (ben.error) return res.status(400).json({ error: ben.error });

      // 🔑 La regla se valida ANTES de escribir. Una regla mal formada se guarda igual, la promo no
      // aparece nunca y nadie puede diagnosticar por qué — el motivo viaja en el 400 para que se lea
      // en la pantalla de alta, no en un log.
      const motivo = motivoReglaInvalida(p.regla);
      if (motivo) return res.status(400).json({ error: motivo });

      if (!esFechaIso(p.desde)) return res.status(400).json({ error: 'El "desde" tiene que ser un día real (AAAA-MM-DD).' });
      const hasta = p.hasta ? String(p.hasta) : null;
      if (hasta !== null && !esFechaIso(hasta)) {
        return res.status(400).json({ error: 'El "hasta" tiene que ser un día real (AAAA-MM-DD), o quedar vacío.' });
      }
      // Una ventana al revés deja la promo invisible para siempre y se ve como "no anda".
      if (hasta !== null && hasta < String(p.desde)) {
        return res.status(400).json({ error: 'El "hasta" no puede ser anterior al "desde".' });
      }

      const canales = listaDe(p.canales, CANALES);
      if (canales === null) return res.status(400).json({ error: `Canal inválido (usá ${CANALES.join(', ')}).` });
      // Sin canal no la ve nadie en ningún lado. Es el mismo caso que la lista de roles vacía en
      // `normalizarDestino`: no es lo que nadie quiso decir.
      if (canales.length === 0) return res.status(400).json({ error: 'Elegí por lo menos un canal.' });

      // ⚠️ `marcas` vacío SÍ es válido y quiere decir **las dos**. No confundir con `canales`.
      const marcas = listaDe(p.marcas, MARCAS);
      if (marcas === null) return res.status(400).json({ error: `Marca inválida (usá ${MARCAS.join(', ')}).` });

      const condiciones = Array.isArray(p.condiciones)
        ? p.condiciones.map((c) => String(c).trim()).filter(Boolean).slice(0, 20)
        : [];

      const fila = {
        id,
        banco,
        medio: String(p.medio),
        beneficio: ben.valor,
        regla: p.regla,
        desde: String(p.desde),
        hasta,
        condiciones,
        pasos: p.pasos ? String(p.pasos) : null,
        canales,
        marcas,
        // Una promo nace prendida salvo que se diga lo contrario: cargarla y que no aparezca sería
        // el primer bug que reporta quien la cargó.
        activa: p.activa === undefined ? true : !!p.activa,
        autor: yo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('agenda_promos').upsert([fila], { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id });
    }

    if (action === 'borrar-item') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const noPuede = await techoBloquea(await destinoGuardado(id));
      if (noPuede) return noPuede;
      // Los tildes se van con él (`on delete cascade`): un acuse sin la rutina que lo explica no le
      // sirve a nadie. Para dejar de verlo sin perder el historial está el interruptor de activo.
      const { error } = await supabase.from('agenda_items').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    /**
     * El alta a mano: «entró mercadería». Siembra los mismos moldes que la puerta.
     *
     * Pide `agenda.cargar` como todo lo que escribe en la Agenda: sembrar seis pendientes con dueña
     * es cargar rutinas, no tildarlas.
     */
    if (action === 'ingreso') {
      // El permiso ya lo pidió el guard de arriba («de acá para abajo, todo pide el sub»): repetirlo
      // acá sería la segunda implementación de la misma regla, que es justo lo que este repo no hace.
      const r = await sembrar(supabase, {
        plantilla: 'ingreso',
        nombre: b.nombre,
        fecha: esFechaIso(b.fecha) ? b.fecha : hoyUtc(),
        autor: yo,
        eje: b.puerta,
        marca: b.marca,
      });
      if (r.error) return res.status(400).json({ error: r.error });
      return res.status(200).json({ ok: true, creados: r.creados, ya: r.ya });
    }

    if (action === 'guardar-item') {
      const it = b.item || {};
      const id = String(it.id || '');
      const titulo = String(it.titulo || '').trim();
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!titulo) return res.status(400).json({ error: 'Falta el título.' });
      if (!CLASES.includes(String(it.clase))) {
        return res.status(400).json({ error: `Clase inválida (usá ${CLASES.join(', ')}).` });
      }

      const motivo = motivoReglaInvalida(it.regla);
      if (motivo) return res.status(400).json({ error: motivo });

      const marcas = listaDe(it.marcas, MARCAS);
      if (marcas === null) return res.status(400).json({ error: `Marca inválida (usá ${MARCAS.join(', ')}).` });

      /*
        El EJE del molde: las puertas del ingreso, o el origen de la sesión de fotos. Se lee como
        `marcas` —**vacío es todos**— y **sólo existe si el ítem es molde**: en un pendiente normal
        «¿para qué puerta?» no quiere decir nada, y guardarlo sería basura en `datos`.

        🔑 Cuál es el eje lo dice la plantilla, ⛔ no este handler: si lo supiera acá, agregar la
        tercera plantilla sería tocar el motor en vez de agregar una fila al catálogo.
      */
      const plant = esClavePlantilla(it.plantilla) ? plantillaDe(String(it.plantilla)) : null;
      const eje = plant ? listaDe(it[plant.eje.campo], plant.eje.claves) : [];
      if (eje === null) {
        return res.status(400).json({ error: `${plant.eje.invalido} (usá ${plant.eje.claves.join(', ')}).` });
      }

      /*
        🔑 **`offsetDias` es del MOLDE**, igual que `arrastraDias` es de lo que arrastra, y **el
        rango lo pone la plantilla**: el ingreso se entera cuando la mercadería ya llegó, así que un
        paso «dos días antes» nacería vencido; la sesión de fotos se arma con fecha y el manual pone
        la modelo 48 h ANTES.

        🔴 Fuera de rango es **400 y lo nombra**, ⛔ no un recorte callado: hasta el 29-ago-2026 un
        `-2` se guardaba como `0` y un `120` como `90` —la pantalla decía una cosa y la base
        guardaba otra—, que es la misma trampa que el monto descartado sin avisar.
      */
      const dioOffset = plant && it.offsetDias !== null && it.offsetDias !== undefined && it.offsetDias !== '';
      const offset = plant ? offsetDeMolde(plant.key, it.offsetDias) : null;
      if (dioOffset && offset === null) {
        return res.status(400).json({
          error: `«A los cuántos días» va entre ${plant.offsetMin} y ${plant.offsetMax} para ${plant.evento}.`,
        });
      }

      // El techo, sobre los dos destinos: el que se quiere poner y el que la fila ya tiene.
      const noPuede = await techoBloquea(it.destino, await destinoGuardado(id));
      if (noPuede) return noPuede;

      const fila = {
        id,
        clase: String(it.clase),
        titulo,
        cuerpo: it.cuerpo && String(it.cuerpo).trim() ? String(it.cuerpo) : null,
        regla: it.regla,
        // Ante la duda, para todos: un destino roto que no le llegue a nadie sería un pendiente
        // invisible, que es peor que uno de más. Lo decide `normalizarDestino`, no este handler.
        destino: normalizarDestino(it.destino),
        marcas,
        manual_id: it.manualId ? String(it.manualId) : null,
        activo: it.activo === undefined ? true : !!it.activo,
        // ⚠️ Se escribe entera, no se mezcla con lo que había: el formulario manda el ítem completo,
        // así que un merge escondería un campo que la pantalla creyó haber borrado.
        datos: {
          arrastra: String(it.clase) === 'pendiente' && !!it.arrastra,
          // ⚠️ Sólo se guarda si arrastra Y trae número: **`null` es el caso normal** —sin tope,
          // queda hasta que lo tilden— y escribirlo sería guardar un campo que dice lo mismo que no
          // estar. Se acota a `DIAS_ARRASTRE` porque más allá el GET no manda el acuse: un tope de
          // 400 días prometería un arrastre que la pantalla no puede sostener.
          ...(String(it.clase) === 'pendiente' && !!it.arrastra && numeroDado(it.arrastraDias)
            ? { arrastraDias: Math.min(DIAS_ARRASTRE, Math.trunc(Number(it.arrastraDias))) }
            : {}),
          ...(plant ? { plantilla: plant.key } : {}),
          // Atarlo a `plantilla` es lo que hace que un ítem que ya se llevó el `0` fantasma se
          // limpie solo la próxima vez que alguien lo guarde.
          ...(offset === null ? {} : { offsetDias: offset }),
          // ⚠️ Sólo se guarda si hay alguno: la lista vacía **es** el caso normal (el paso corre en
          // las cuatro puertas, o en los tres orígenes) y escribirla sería guardar un `[]` que dice
          // lo mismo que no estar.
          ...(eje.length ? { [plant.eje.campo]: eje } : {}),
        },
        autor: yo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('agenda_items').upsert([fila], { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id });
    }

    return res.status(400).json({ error: `action inválida (${action || 'vacía'})` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
