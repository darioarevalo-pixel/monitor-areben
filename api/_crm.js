// El padrón del CRM — tabla `clientes` de BDI, servida con la clave de servicio. Y, desde el
// escalón 3, las líneas de venta con plata que el modal de un cliente muestra; desde el 5, las
// ventas mismas.
//
//   POST { recurso:'crm', ids:[…] }                        → { ok, clientes:[{id,name,email,…}] }
//   POST { recurso:'crm', action:'detalles', ids:[…] }     → { ok, detalles:[{sale_id,…,unit_price,total}] }
//   POST { recurso:'crm', action:'ventas', modo, flagged } → { ok, ventas:[{id,date_sale,total_price,…}] }
//   POST { recurso:'crm', action:'panel', tel|clienteId }   → { ok, encontrado, cliente, ventas, detalles }
//   POST { recurso:'crm', action:'lista', ids:[…], totales? } → { ok, clientes:[{id,name,phone,total_amount}] }
//   POST { recurso:'crm', action:'buscar', q, ids:[…] }     → { ok, clientes:[{id,name,city,phone}] }
//
// Los `ids` del primero son `client_id`; los del segundo, `sale_id`. Sin `action` se contesta el
// padrón, que es como nació: el navegador viejo no manda el campo.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO EXISTE (escalón 2 de la Fase S)
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Hasta acá el navegador leía `clientes` derecho de Supabase con la **anon key**, que viaja en el
// bundle. Medido el 14-ago-2026 desde afuera: cualquiera con esa key se bajaba **nombre, mail,
// teléfono y ciudad de 12.523 personas** en 13 llamadas de un segundo. El escalón 1
// (`sql/migrate-columnas-pii.sql`) ya le había sacado la dirección, el CP y cuánto gastó cada uno,
// pero las cuatro que el CRM muestra tenían que seguir abiertas justamente porque el CRM las lee.
//
// El arreglo no es un login de Supabase —duplicaría el padrón de usuarios y la política seguiría
// diciendo `true`—: es **sacar la lectura del navegador**. Acá hay sesión (`exigirUsuario`) y
// permisos (`puedeVerAlguna`), que es lo que la anon key no puede tener. Con esto puesto, el
// `select` sobre `clientes` se le revoca a `anon` (`sql/migrate-clientes-servidor.sql`).
//
// 🔑 **Bonus que no era el objetivo y vale igual**: hasta hoy el padrón se lo bajaba *cualquier*
// usuario del monitor, tuviera o no tildado el permiso de Clientes — la anon key no sabe de
// permisos. Ahora el gate es el mismo que el de la sección.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA FORMA: los ids van en el BODY y las tandas las arma el servidor
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// El navegador manda de una los client_id de las ventas que ya cargó (12.485 en el modo «todos»,
// 85 KB de body) y esto contesta con las filas. Es **un viaje** en vez de los 63 lotes de 200 que
// hacía antes contra PostgREST.
//
// Medido el 14-ago-2026 contra la base de BDI, con los 12.485 ids reales:
//
//   lotes de 500 ids, 6 en vuelo  → 25 consultas,  3,9 s,  1,76 MB de respuesta
//   lotes de 1000 ids, 6 en vuelo → 13 consultas,  2,3 s   ← más rápido, pero la URL queda en
//                                                             7.048 caracteres y el techo de un
//                                                             proxy HTTP anda por los 8 KB
//
// Van 500. La diferencia son 1,6 s una vez por carga de pantalla; el otro camino se rompe solo el
// día que los ids pasen a siete dígitos, y ese modo de falla es un 414 que nadie va a saber leer.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { buscarPorTelefono, indexarTelefonos } from '../lib/crm/telefono.core.js';
import { esVentaTecnica } from '../lib/etl/tecnica.core.js';

// El select del CRM, palabra por palabra el de `lib/crm/datos.ts` (SEL_CLIENTES). Un campo de menos
// y el agregado computa otra cosa sin un solo error en consola.
const COLUMNAS = 'id, name, email, phone, city, province';

// El select de los detalles, palabra por palabra el de `lib/crm/datos.ts` (SEL_DETALLES).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUÉ TAMBIÉN ESTO (escalón 3 de la Fase S)
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// `venta_detalles` tiene `unit_price` y `total`, y medido el 14-ago-2026 con la anon key desde
// afuera entregaba **122.952 líneas en BDI y 35.426 en Zattia**: la facturación entera, renglón
// por renglón, para cualquiera que abriera el bundle. Es la tabla más grande de las dos bases.
//
// 🔑 **El ETL nunca pidió esas dos columnas** (su select es `sale_id, product_id, size_id, size,
// quantity`). Los únicos que las leían en el navegador son dos pantallas chicas y ya filtradas:
// este resumen de compras y el Resultado de una campaña de Liquidación. Por eso cerrar las
// 122.952 filas no cuesta tocar el ETL: alcanza con mudar estas dos.
const COLUMNAS_DETALLE = 'sale_id, product_name, size, quantity, unit_price, total';

// El select de las ventas del CRM, palabra por palabra el de `lib/crm/datos.ts` (SEL_VENTAS).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUÉ TAMBIÉN ESTO (escalón 5 de la Fase S)
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// El escalón 5 saca del navegador lo último que la anon key seguía leyendo: `ventas`,
// `venta_detalles` y `productos`. Las tres se van por el pase de `api/_espejo.js`, que no tiene
// gate por permiso **porque no lleva plata ni datos de personas** — y esa frase es lo que decide
// qué columnas puede tener el pase.
//
// 🔑 **Por eso `total_price`, `client_id` y `sale_state` NO entran al pase: entran acá.** Medido
// el 16-ago-2026, el CRM es su único lector en todo el navegador; el ETL, Caducados y Reposición
// piden de `ventas` sólo `id, date_sale, channel[, channel_id]`. Si la facturación viajara por el
// pase, cualquier usuario con sesión podría pedirla aunque no tenga Clientes — que es exactamente
// el agujero que el escalón 2 cerró con el padrón.
const COLUMNAS_VENTAS = 'id, date_sale, total_price, client_id, channel_id, sale_state';

// El CRM es **bdi-only por esquema**: `clientes` no existe en la base de Zattia (por eso
// `migrate-columnas-pii.sql` se la saltea ahí). No hay `store` en la puerta a propósito.
const MARCA = 'bdi';

const LOTE = 500;
const EN_VUELO = 6;

// El corte de PostgREST. No es configurable desde acá y `supabase-js` no lo esquiva: se pagina o
// se pierden filas sin enterarse.
const PAGINA = 1000;

// Techo de una respuesta de función en Vercel. Hoy el padrón entero pesa 1,76 MB, o sea 2,5x de
// aire, pero el que se pasa no recibe un error legible: recibe una respuesta cortada, que del otro
// lado se ve como un JSON.parse roto. Mejor decirlo.
const TOPE_RESPUESTA = 4 * 1024 * 1024;

// Cuántos ids acepta `action:'lista'`. El techo está para que un llamador roto no convierta la
// consulta acotada en el padrón entero, que es justo lo que este endpoint existe para evitar.
//
// 🔴 **Antes esto CORTABA en silencio** (`.slice(0, TOPE_IDS_LISTA)`), y el docblock decía "hoy se
// piden ~90". Medido el 29-ago-2026: se piden **236**, a 64 de un techo que no avisa. El que se
// pasara no iba a ver un error — iba a ver una lista del día a la que le faltan clientes, sin
// forma de notarlo. Y el número sube solo: cada cliente que se marca 🧊 suma un id al pedido.
//
// Ahora se rechaza con un error que se lee. El que corta es el llamador, que sabe qué está
// pidiendo: `traerAgenda` pide de a `LOTE_IDS` y une (ver `lib/crm/panel.ts`).
export const TOPE_IDS_LISTA = 300;

/**
 * Trae una página de `ventas` detrás de otra hasta que se acaben, con el filtro que le pasen.
 *
 * 🔴 **El `order` lleva `id` de desempate y no es adorno.** Paginar con `range` sobre un orden que
 * empata —`date_sale` es una FECHA: hay decenas de ventas por día— no está definido: la misma fila
 * puede volver en dos páginas y otra no volver en ninguna. El legacy paginaba así desde el
 * navegador y la pérdida era silenciosa. `id` es único, así que el orden queda total y el visible
 * no cambia: sigue siendo por fecha descendente.
 */
async function paginar(supabase, aplicarFiltro) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const q = aplicarFiltro(supabase.from('ventas').select(COLUMNAS_VENTAS))
      .order('date_sale', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + PAGINA - 1);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if ((data || []).length < PAGINA) break;
  }
  return filas;
}

/**
 * Las ventas del CRM, en los dos modos del select de la pantalla.
 *
 * En modo Mayorista son DOS consultas unidas y deduplicadas por id, igual que antes: las del canal
 * pedido, más **todas** las de los clientes marcados ★ (compren por donde compren). Los ★ los
 * manda el navegador porque salen del KV, que es suyo.
 *
 * 🔑 **Las ventas técnicas las sigue descartando el navegador**, con `esVentaTecnica`. No se mueve
 * acá: es lógica del ETL, la comparten otras pantallas y el filtro tiene que correr sobre la unión
 * —`porMarcados` trae al cliente ★ sin filtro de canal, así que arrastra técnicas.
 */
async function ventasDelCrm(supabase, body, res) {
  const modo = String(body.modo || 'all');
  // El modo se concatena en el filtro de PostgREST: o es `all` o es un número, no hay tercera.
  if (modo !== 'all' && !/^\d+$/.test(modo)) {
    return res.status(400).json({ ok: false, error: 'modo tiene que ser "all" o un id de canal numérico' });
  }

  let filas;
  if (modo === 'all') {
    filas = await paginar(supabase, (q) => q.not('client_id', 'is', null));
  } else {
    const crudos = Array.isArray(body.flagged) ? body.flagged : [];
    const flagged = [...new Set(crudos.map(Number).filter((n) => Number.isInteger(n) && n > 0))];

    const porCanal = await paginar(supabase, (q) => q.eq('channel_id', modo).not('client_id', 'is', null));

    const porMarcados = [];
    for (let i = 0; i < flagged.length; i += LOTE) {
      const lote = flagged.slice(i, i + LOTE);
      porMarcados.push(...(await paginar(supabase, (q) => q.in('client_id', lote).not('client_id', 'is', null))));
    }

    const porId = new Map();
    for (const v of porCanal.concat(porMarcados)) porId.set(v.id, v);
    filas = [...porId.values()];
  }

  const cuerpo = JSON.stringify({ ok: true, ventas: filas });
  // 🔴 **De las tres respuestas de esta puerta, ésta es la que menos aire tiene.** Medido el
  // 16-ago-2026 contra BDI: el modo «todos» son 27.990 ventas y **3,34 MB**, contra un techo de
  // 4,5 — o sea 1,3x, y crece con cada venta. El padrón, para comparar, va 1,76 MB. Cuando esto
  // salte hay que paginarlo hacia el navegador; el error lo dice en vez de mandar un JSON cortado.
  if (cuerpo.length > TOPE_RESPUESTA) {
    return res.status(500).json({
      ok: false,
      error: `Las ventas del CRM ya no entran en una respuesta (${(cuerpo.length / 1024 / 1024).toFixed(1)} MB contra un techo de 4,5). Hay que paginar la acción "ventas" de api/_crm.js.`,
    });
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(cuerpo);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA CONSULTA PUNTUAL POR TELÉFONO (el panel de WhatsApp)
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// La sección Clientes baja el CRM entero: 27.990 ventas y el padrón de 12.485. Son ~6 s y 5 MB, y
// están bien pagados una vez por mañana. **Adentro de WhatsApp no**: ahí el panel se rearma cada
// vez que se cambia de chat, y una carga así lo volvería inusable.
//
// Por eso esta acción es al revés que las otras tres: en vez de traer todo para que el navegador
// filtre, resuelve UN cliente y le trae sólo lo suyo. Son 3 consultas chicas y ninguna trae más de
// lo que entra en la pantalla.
//
// El problema real es el primer paso —de un número de teléfono a un `client_id`—, porque el padrón
// guarda el teléfono **tal como se cargó en Gestión Nube**: con 0, con 15, con guiones, con
// paréntesis. No hay forma de preguntarle eso a PostgREST, así que se normalizan los 12.500 de
// este lado y se compara normalizado contra normalizado (`lib/crm/telefono.core.js`).
//
// 🔑 **Ese índice se arma una vez y queda en memoria de la función.** Son 2 columnas y ~13
// páginas; el costo aparece en la primera consulta después de un arranque en frío y no en las
// siguientes. `TTL_INDICE` es lo que se tarda en ver un cliente nuevo o un teléfono recién
// corregido: 10 minutos, contra un padrón que se sincroniza una vez por día (07:00 UTC,
// `sync-clientes.yml`). Bajarlo no trae datos más frescos, trae más consultas.
//
// ⚠️ La memoria de una función de Vercel **no es un caché compartido**: cada instancia tiene la
// suya y ninguna se entera de las otras. Está bien para esto (el índice se puede reconstruir
// entero en cualquier momento y no guarda nada que se pueda perder), y estaría mal para cualquier
// cosa que hubiera que invalidar a mano.
// ⚠️ Estaba en 10 minutos y se pagaba: el padrón se sincroniza **una vez por día** (07:00 UTC,
// `sync-clientes.yml`), así que 10 minutos no traían nada más fresco — traían rearmar el índice
// varias veces por mañana, y cada rearmado es el primer chat esperando. Con 6 horas, el peor caso
// sigue siendo "ver un cliente cargado hoy con hasta 6 h de demora", contra un padrón que de todas
// formas se actualiza una vez al día.
const TTL_INDICE = 6 * 60 * 60 * 1000;

// Cuántos pedidos hacia atrás se pide el detalle. El panel muestra **lo último que llevó** y poco
// más; traer las 60 compras de un cliente grande sería pagar el detalle entero para dibujar tres
// renglones.
const VENTAS_CON_DETALLE = 20;

let indiceTel = null;
let indiceVence = 0;
// Si dos chats se abren juntos, el segundo espera al índice del primero en vez de armar otro.
let indiceEnVuelo = null;

/**
 * El padrón de teléfonos, en páginas de a `EN_VUELO`.
 *
 * 🔑 **Paralelo y no en fila.** Son ~13 páginas de 1.000 y ninguna depende de la anterior:
 * encadenadas se pagan 13 idas y vueltas seguidas, y eso es lo que hacía esperar al primer chat
 * después de un rato. Se piden de a tandas y se corta cuando una tanda vuelve incompleta.
 */
async function armarIndice(supabase) {
  const filas = [];
  const pagina = (n) =>
    supabase
      .from('clientes')
      .select('id, phone')
      .not('phone', 'is', null)
      .order('id')
      .range(n * PAGINA, n * PAGINA + PAGINA - 1);

  for (let tanda = 0; ; tanda++) {
    const nros = Array.from({ length: EN_VUELO }, (_, i) => tanda * EN_VUELO + i);
    const res = await Promise.all(nros.map(pagina));
    let corta = false;
    for (const { data, error } of res) {
      if (error) throw new Error(error.message);
      filas.push(...(data || []));
      if ((data || []).length < PAGINA) corta = true;
    }
    if (corta) break;
  }
  return indexarTelefonos(filas);
}

async function indiceDeTelefonos(supabase, ahora) {
  if (indiceTel && ahora < indiceVence) return indiceTel;
  if (!indiceEnVuelo) {
    indiceEnVuelo = (async () => {
      try {
        indiceTel = await armarIndice(supabase);
        indiceVence = ahora + TTL_INDICE;
        return indiceTel;
      } finally {
        indiceEnVuelo = null;
      }
    })();
  }
  return indiceEnVuelo;
}

/** Las ventas de UN cliente, sin las técnicas. Son pocas: el que más tiene anda por 60. */
async function ventasDelCliente(supabase, id) {
  const { data, error } = await supabase
    .from('ventas')
    .select(COLUMNAS_VENTAS)
    .eq('client_id', id)
    .order('date_sale', { ascending: false })
    .order('id', { ascending: false })
    .range(0, PAGINA - 1);
  if (error) throw new Error(error.message);
  // El mismo filtro que hace la sección Clientes en el navegador (`datos.ts`): los clientes
  // internos de Gestión Nube —"Sesión de fotos", "Falla", "Cambio"— tienen `client_id` como
  // cualquier persona, y sin esto entran como compras de $0.
  return (data || []).filter((v) => !esVentaTecnica(v));
}

/**
 * La ficha de un cliente para el panel: quién es, qué compró y qué se llevó la última vez.
 *
 * Es la misma información que la sección arma agregando 27.990 ventas, pedida para uno solo. El
 * cálculo (totales, segmento, resumen de compras) lo hace el navegador con `lib/crm/core.ts`, que
 * es el mismo código que usa la ficha grande: acá no se recalcula nada, para que las dos pantallas
 * no puedan decir números distintos.
 */
async function fichaDelPanel(supabase, id) {
  // Las dos consultas van juntas: ninguna necesita el resultado de la otra, y el panel se rearma
  // en cada chat. Encadenadas se pagaba una ida y vuelta de más por cliente, siempre.
  const [ficha, ventas] = await Promise.all([
    supabase.from('clientes').select(COLUMNAS).eq('id', id).limit(1),
    ventasDelCliente(supabase, id),
  ]);
  if (ficha.error) throw new Error(ficha.error.message);
  const cliente = (ficha.data || [])[0] || null;
  if (!cliente) return { encontrado: false };

  const ids = ventas.slice(0, VENTAS_CON_DETALLE).map((v) => v.id);

  let detalles = [];
  if (ids.length) {
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error: e2 } = await supabase
        .from('venta_detalles')
        .select(COLUMNAS_DETALLE)
        .in('sale_id', ids)
        .order('sale_id')
        .range(desde, desde + PAGINA - 1);
      if (e2) throw new Error(e2.message);
      detalles.push(...(data || []));
      if ((data || []).length < PAGINA) break;
    }
  }
  return { encontrado: true, cliente, ventas, detalles };
}

/**
 * El chat abierto en WhatsApp → la ficha del CRM.
 *
 * Con `clienteId` es directo (lo manda el panel cuando el teléfono lo tenía el KV de teléfonos, o
 * cuando el usuario eligió entre dos candidatos). Con `tel` pasa por el índice.
 *
 * Tres desenlaces, y los tres son respuestas normales con 200: **encontrado**, **no está en el
 * padrón** (el panel ofrece guardarlo como lead) y **hay más de un candidato** (el panel pregunta).
 * Un número desconocido es el caso más común del día, no un error.
 */
/**
 * Los tiempos de cada paso, que viajan en la respuesta.
 *
 * 🔑 **Sin esto, "tarda 6 segundos" no se puede investigar**: del lado del navegador todo es una
 * sola espera. Son tres números y se miden igual que se responde.
 */
async function panelPorTelefono(supabase, body, res) {
  const t0 = Date.now();
  const idPedido = Number(body.clienteId);
  if (Number.isInteger(idPedido) && idPedido > 0) {
    const ficha = await fichaDelPanel(supabase, idPedido);
    return res.status(200).json({ ok: true, via: 'id', ms: { indice: 0, ficha: Date.now() - t0 }, ...ficha });
  }

  const tel = String(body.tel || '');
  if (!tel) return res.status(400).json({ ok: false, error: 'falta tel (o clienteId)' });

  const habiaIndice = !!(indiceTel && Date.now() < indiceVence);
  const indice = await indiceDeTelefonos(supabase, Date.now());
  const tIndice = Date.now() - t0;
  const { ids, via } = buscarPorTelefono(indice, tel);

  const ms = () => ({ indice: tIndice, ficha: Date.now() - t0 - tIndice, cacheIndice: habiaIndice });

  if (!ids.length) return res.status(200).json({ ok: true, encontrado: false, via: '', ms: ms() });

  if (ids.length > 1) {
    const { data, error } = await supabase.from('clientes').select(COLUMNAS).in('id', ids);
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true, encontrado: false, via, candidatos: data || [], ms: ms() });
  }

  const ficha = await fichaDelPanel(supabase, ids[0]);
  return res.status(200).json({ ok: true, via, ms: ms(), ...ficha });
}

/**
 * Los datos que le faltan a la lista del día del panel: nombre, teléfono y total comprado de un
 * puñado de clientes.
 *
 * 🔑 **Existe para NO bajar el CRM adentro de WhatsApp.** Quién entra en la lista lo decide el KV
 * (fecha, cadencia, temperatura, descarte), que el panel ya tiene y pesa nada. Lo único que no
 * está ahí es el nombre — y el total, que ordena la tanda de fríos igual que en la sección. Se
 * piden **de los que quedaron**, que son decenas, no de los 12.485 del padrón.
 *
 * ⚠️ El total se suma acá y no se lee de ninguna vista: no hay una con totales por cliente. Son
 * las ventas de ~90 clientes, no las 27.990, y se pagina igual — el corte de 1.000 filas de
 * PostgREST muerde con menos clientes de los que parece (el que más tiene anda por 60 ventas).
 */
async function listaDelPanel(supabase, body, res) {
  const crudos = Array.isArray(body.ids) ? body.ids : [];
  // Mismo saneo que el resto del archivo: estos ids se concatenan en el `in.(…)` de PostgREST.
  const ids = [...new Set(crudos.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return res.status(200).json({ ok: true, clientes: [] });
  // 🔴 Se rechaza, no se recorta. Ver `TOPE_IDS_LISTA`.
  if (ids.length > TOPE_IDS_LISTA) {
    return res.status(400).json({
      ok: false,
      error: `La lista pidió ${ids.length} clientes de un saque y el techo es ${TOPE_IDS_LISTA}. Hay que pedirlos por tanda.`,
    });
  }

  const { data: clientes, error } = await supabase.from('clientes').select('id, name, phone').in('id', ids);
  if (error) throw new Error(error.message);

  // 🔑 **El total es la parte cara y no siempre hace falta.** Sumarlo obliga a recorrer las ventas
  // de cada uno de los ids; con la lista del día (~90) no se nota, pero el filtro 🔥 del panel pide
  // un grupo entero y sólo lo ordena por fecha. Los únicos que lo necesitan son los 🧊 —que salen
  // por lo que compraron, igual que en la sección— y la lista del día, que los tiene adentro.
  if (body.totales === false) {
    return res.status(200).json({ ok: true, clientes: (clientes || []).map((c) => ({ ...c, total_amount: 0 })) });
  }

  // El total comprado, para que la tanda de fríos salga en el mismo orden que en la sección.
  const totales = new Map();
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error: e2 } = await supabase
      .from('ventas')
      .select('client_id, total_price')
      .in('client_id', ids)
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (e2) throw new Error(e2.message);
    for (const v of data || []) {
      totales.set(v.client_id, (totales.get(v.client_id) || 0) + (parseFloat(v.total_price) || 0));
    }
    if ((data || []).length < PAGINA) break;
  }

  return res.status(200).json({
    ok: true,
    clientes: (clientes || []).map((c) => ({ ...c, total_amount: totales.get(c.id) || 0 })),
  });
}

/** Cuántos clientes devuelve la búsqueda por nombre. Es para elegir uno, no para explorar. */
const TOPE_BUSQUEDA = 12;

/**
 * Cuántos nombres se miran ANTES de filtrar por "compró".
 *
 * ⚠️ **Este tope corta en silencio.** Los candidatos salen ordenados por nombre, así que si una
 * búsqueda muy común (un "martin" pelado) trajera más que esto, un cliente que ordene después
 * quedaría afuera sin que nada lo diga. Medido el 25-ago-2026: "martin" da 120 candidatos y sólo 6
 * son clientes del CRM — el filtro saca al 95%, así que hay que mirar MUCHOS nombres para no
 * perder a ninguno. 400 filas de `id,name,city,phone` no se sienten; un cliente que no aparece, sí.
 */
const TOPE_CANDIDATOS = 400;

/** El canal Mayorista. Es el mismo `CANAL_MAYORISTA` de `lib/crm/datos.ts`, del otro lado. */
const CANAL_MAYORISTA = 10;

const ESCAPE = String.fromCharCode(92); // la barra invertida, sin pelearse con los escapes
const RE_COMODINES = new RegExp('[' + ESCAPE + ESCAPE + '%_]', 'g');
const RE_VOCALES = /[aeiouáéíóúAEIOUÁÉÍÓÚ]/g;

/**
 * El patrón `ILIKE` para buscar un nombre. Se exporta para poder probarlo: son dos reemplazos y
 * los dos fallan en silencio —uno deja pasar comodines ajenos, el otro esconde a media agenda—.
 *
 * 1. **Los comodines que escribe la persona son texto.** Un `%` en el cuadro de búsqueda tiene que
 *    buscar un `%`, no traer el padrón entero.
 * 2. **Las vocales pasan a ser comodines.** `ilike` no ignora los acentos: sin esto, "martin" no
 *    encuentra a "Martín" y el que busca concluye que el cliente no está.
 */
export function patronBusqueda(q) {
  return '%' + String(q || '').replace(RE_COMODINES, (c) => ESCAPE + c).replace(RE_VOCALES, '_') + '%';
}

/**
 * Buscar un cliente por nombre, para engancharle el número desde el panel de WhatsApp.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Un cliente cambia de número y te escribe del nuevo. El panel no lo reconoce —busca por teléfono
 * y ese teléfono no es de nadie— y lo único que sabía ofrecer era guardarlo como lead: crear un
 * prospecto de alguien que ya es cliente. La salida existía pero no servía en el momento: cambiarlo
 * en Gestión Nube, que el monitor trae recién a la madrugada siguiente.
 *
 * Con esto se lo engancha en el acto, y **el número viejo sigue funcionando**: el nuevo se guarda
 * en `crm:tel` y el viejo sigue viniendo del padrón. Los dos abren la misma ficha.
 *
 * ⚠️ **No se busca en los 14.131 del padrón**: ahí está cada consumidor final que pasó por el
 * local, y ofrecerlos para "es un cliente mío" es ofrecer 14.000 personas que no lo son.
 *
 * 🔴 **Pero tampoco alcanza con los ids del KV, y ése fue el bug.** La primera versión buscaba
 * entre las claves de `crm:seg`, que NO son "los clientes del CRM" sino "los clientes que alguien
 * ya tocó": el que compró por primera vez la semana pasada y todavía no tiene ni una nota no está
 * ahí. Caso real (Candela Martin, #648111, 25-ago-2026): compró $146.022 el 16-ago, es clienta, y
 * la búsqueda no la encontraba — justo el caso en que más se necesita engancharle el número.
 *
 * Ahora el filtro es el de verdad: **haber comprado por el canal mayorista**. Son dos consultas
 * chicas —primero los nombres que coinciden, después cuáles de ésos tienen una venta— y la segunda
 * corre sobre un puñado de ids, no sobre las 28.260 ventas.
 *
 * ⚠️ **Los acentos NO se ignoran en `ilike`**: "martin" no encuentra a "Martín". Por eso las
 * vocales del texto buscado se reemplazan por `_` (un carácter cualquiera). Es la vuelta barata;
 * la de verdad —`unaccent`— es una extensión de Postgres que hay que instalar.
 *
 * ⚠️ `ilike` con el patrón como PARÁMETRO de supabase-js, no concatenado: el texto lo escribe una
 * persona y termina en la query string de PostgREST. Los `%` y `_` que traiga se escapan.
 */
async function buscarClientes(supabase, body, res) {
  const q = String(body.q || '').trim();
  if (q.length < 2) return res.status(200).json({ ok: true, clientes: [] });

  // Los comodines de LIKE que venga escribiendo la persona son texto, no comodines; y las vocales
  // pasan a ser comodines para que los acentos no escondan a nadie.
  const patron = patronBusqueda(q);

  // Los que coinciden por nombre. Se piden de más porque después se filtra por "compró".
  const { data: candidatos, error } = await supabase
    .from('clientes')
    .select('id, name, city, phone')
    .ilike('name', patron)
    .order('name')
    .limit(TOPE_CANDIDATOS);
  if (error) throw new Error(error.message);
  if (!(candidatos || []).length) return res.status(200).json({ ok: true, clientes: [] });

  // ¿Cuáles de ésos compraron por el canal mayorista? Es lo que los hace clientes del CRM.
  const ids = candidatos.map((c) => c.id);
  const { data: ventas, error: e2 } = await supabase
    .from('ventas')
    .select('client_id')
    .in('client_id', ids)
    .eq('channel_id', CANAL_MAYORISTA);
  if (e2) throw new Error(e2.message);

  const compraron = new Set((ventas || []).map((v) => v.client_id));
  return res.status(200).json({ ok: true, clientes: candidatos.filter((c) => compraron.has(c.id)).slice(0, TOPE_BUSQUEDA) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // 🔴 Tener sesión no es tener permiso. Es el gate de la sección Clientes, y va por
  // `puedeVerAlguna` y no por `puedeVer` pelado para que la cuenta fija siga valiendo.
  if (!puedeVerAlguna(perfil, MARCA, ['clientes'])) {
    return res.status(403).json({ error: 'No tenés acceso a Clientes.' });
  }

  const body = req.body || {};
  const accion = String(body.action || '');
  const detalles = accion === 'detalles';

  const url = process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!key) return res.status(500).json({ error: 'Falta la clave de Supabase de BDI en el entorno.' });
  const supabase = createClient(url, key);

  // ── La ficha de UN cliente para el panel de WhatsApp. Tampoco lleva `ids`. ────────────────────
  if (accion === 'panel') {
    try {
      return await panelPorTelefono(supabase, body, res);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── La lista del día del panel: nombre + teléfono + total de un puñado de ids. ───────────────
  if (accion === 'lista') {
    try {
      return await listaDelPanel(supabase, body, res);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Buscar un cliente por nombre, para engancharle un número nuevo desde el panel. ───────────
  if (accion === 'buscar') {
    try {
      return await buscarClientes(supabase, body, res);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Las ventas del CRM (escalón 5). No lleva `ids`: el filtro es el modo del select. ──────────
  if (accion === 'ventas') {
    try {
      return await ventasDelCrm(supabase, body, res);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  const crudos = Array.isArray(body.ids) ? body.ids : null;
  if (!crudos) {
    return res.status(400).json({ error: `falta ids (una lista de ${detalles ? 'sale_id' : 'client_id'})` });
  }

  // Sólo enteros. No es paranoia de tipos: estos ids se concatenan en el `in.(…)` de PostgREST, y
  // ahí cualquier cosa que no sea un número es una inyección en la query string.
  const ids = [...new Set(crudos.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return res.status(200).json(detalles ? { ok: true, detalles: [] } : { ok: true, clientes: [] });

  try {
    const lotes = [];
    for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE));

    // ── Las líneas con plata de esas ventas. ─────────────────────────────────────────────────
    //
    // 🔴 **Acá sí hace falta paginar, y en el padrón no.** Un lote de 500 `client_id` devuelve
    // como mucho 500 clientes, así que el corte de 1.000 filas de PostgREST nunca llega a
    // morder. Una venta, en cambio, tiene tantas líneas como artículos: 500 sale_ids son ~570
    // renglones de promedio pero no hay ningún tope. Y el corte **también aplica con
    // `supabase-js`** —medido: un `.limit(20000)` devuelve 1.000—, así que sin el `range` la
    // pérdida sería silenciosa: un pedido grande aparecería con menos artículos de los que tuvo.
    if (detalles) {
      const filas = [];
      for (const lote of lotes) {
        for (let desde = 0; ; desde += PAGINA) {
          const { data, error } = await supabase
            .from('venta_detalles')
            .select(COLUMNAS_DETALLE)
            .in('sale_id', lote)
            .order('sale_id')
            .range(desde, desde + PAGINA - 1);
          if (error) throw new Error(error.message);
          filas.push(...(data || []));
          if ((data || []).length < PAGINA) break;
        }
      }
      return res.status(200).json({ ok: true, detalles: filas });
    }

    // Por id, no un array a secas: un id repetido entre lotes no puede pasar (ya vienen únicos),
    // pero el mapa además deja la respuesta estable para el `Record` que arma el cliente.
    const porId = new Map();
    for (let i = 0; i < lotes.length; i += EN_VUELO) {
      const tanda = await Promise.all(
        lotes.slice(i, i + EN_VUELO).map((l) => supabase.from('clientes').select(COLUMNAS).in('id', l)),
      );
      for (const { data, error } of tanda) {
        if (error) throw new Error(error.message);
        for (const c of data || []) porId.set(c.id, c);
      }
    }

    const cuerpo = JSON.stringify({ ok: true, clientes: [...porId.values()] });
    if (cuerpo.length > TOPE_RESPUESTA) {
      return res.status(500).json({
        ok: false,
        error: `El padrón ya no entra en una respuesta (${(cuerpo.length / 1024 / 1024).toFixed(1)} MB contra un techo de 4,5). Hay que paginar api/_crm.js.`,
      });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(cuerpo);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
