// El canje visto por la CREADORA, desde el link que se le pasa por WhatsApp. **Es lo único del
// módulo abierto a internet**, así que conviene leerlo con esa lente.
//
//   GET  /api/postventa?recurso=canje&token=XXX               → lo poco que ella ve, prellenado.
//   POST { recurso:'canje', token, accion:'guardar', datos, elecciones? }
//                                                             → sus datos + lo que eligió, junto.
//   POST { recurso:'canje', token, accion:'contenido', url, tipo }
//                                                             → registra UN archivo ya subido al Blob.
//
// CÓMO SE PROTEGE (no hay sesión: la llave es el token)
//   - El token son 64 hex aleatorios, único por canje, con vencimiento, y `cancelar` lo revoca.
//   - Token inválido, vencido, de un canje terminal o todavía sin aprobar → **404 pelado**. No
//     dice "existe pero venció" ni "no existe": desde afuera son indistinguibles, así que el link
//     no sirve para averiguar nada.
//   - Sólo se puede escribir en la persona de ESE canje, y sólo los campos de `CAMPOS_PERSONA`.
//     Nada de plata, nada de estados, nada de otra persona.
//   - La respuesta se arma campo por campo (`paraLaPersona`): no se hace `select *` ni se filtra
//     después. Lo que no está en la whitelist no viaja, aunque mañana alguien agregue una columna.
//
// DIFERENCIA CON `_reclamo.js`, que es su molde: **acá hay UNA sola base**. Todo el módulo de
// canjes vive en la maestra de BDI para las tres marcas (ver el encabezado de `_canjes.js`), así
// que no hay que buscar el token en dos lugares.
//
// LO QUE ESCRIBE, Y POR QUÉ NO APILA HISTORIAL: los datos van a la fila de la **persona** (la
// dirección se muda una vez cada tres años, no es del canje) y la marca de tiempo va a una columna
// propia del canje, `datos_confirmados_at`. Nada de `apilar()`: ese patrón re-lee y reescribe un
// array y **no es atómico**, y acá hay dos escritores por diseño —el operador desde el panel y ella
// desde el portal, al mismo tiempo, sin coordinarse—. Columna propia = no hay carrera que perder.
//
// LA VITRINA (tanda 2): si el canje tiene una colgada, además elige productos. Tres cosas que hacen
// que eso no rompa nada de lo de arriba:
//   - **Todo lo que ve viaja congelado en la vitrina**, foto incluida. Este handler no le pregunta
//     nada a Tienda Nube: no tiene credenciales y el link tiene que abrir aunque el catálogo esté
//     caído. Ver la sección 8 de `sql/migrate-canjes.sql`.
//   - **El tope lo hace cumplir el servidor**, con la lista real y con `seVaDelTope` —la misma
//     función que usa el panel, importada de `lib/canjes/reglas.core.js`, no una copia—. Un control que
//     sólo vive en su pantalla no es un control.
//   - **Escribe en su propia columna del renglón**: los items que carga ella van con
//     `origen:'persona'`, y los del equipo no se tocan nunca desde acá. Siguen siendo dos
//     escritores sin coordinarse, igual que arriba.
import { seVaDelTope } from '../lib/canjes/reglas.core.js';
import {
  buscarPorToken, carpetaDeCanje, clienteMaestro, contarEvidencias, esTokenDeCanje,
  esUrlDeContenido, topeDeEvidencias,
} from './_canje-token.js';

/** Las únicas columnas del canje que se leen. */
const CANJE_COLS = `id, store, estado, persona_id, token_vence, datos_confirmados_at, envio_estado, entregado_at,
  envio_via, envio_seguimiento, intentos, retiro_local,
  vitrina_id, seleccion_cerrada_at, tope_tipo, tope_pvp, tope_unidades`;

/**
 * Los estados en los que **todavía puede elegir**. Espejo de `puedeElegir` en `lib/canjes/tipos.ts`.
 *
 * Es más corto que `ABIERTO` a propósito: en `en_curso` el pedido ya salió, así que el link sigue
 * sirviendo para mirar pero no para elegir.
 */
const ELIGIENDO = ['acuerdo', 'preparando'];

/** Tope de cordura por request. El de verdad es el del acuerdo, y lo aplica `seVaDelTope`. */
const MAX_ELECCIONES = 50;

/**
 * Los únicos campos que ella puede ver y escribir de su propia ficha. Es la whitelist en los dos
 * sentidos: lo que sale y lo que entra.
 *
 * ⚠️ Nunca sumar acá `vetada`, `vetada_motivo`, `destacada_nota`, `notas` ni `cadencia_dias`: son
 * juicios internos sobre ella. `seguidores_*` tampoco — los carga el equipo y son parte del criterio
 * con el que se decide un canje.
 */
const CAMPOS_PERSONA = [
  'nombre', 'apellido', 'telefono', 'email', 'dni',
  'calle', 'numero', 'piso', 'depto', 'cp', 'localidad', 'provincia', 'direccion_nota',
];

/** Espejo de `queDatoPide` en `lib/canjes/tipos.ts`: BDI vende fundas, Zattia y Stunned, ropa. */
function queDatoPide(store) {
  return store === 'bdi' ? 'modelo_celular' : 'talles';
}

/** Espejo de `STORE_LABEL`. Es lo que ella lee en el saludo, así que va con las mayúsculas de la marca. */
const STORE_LABEL = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' };

/** Espejo de `numeroCanje` en `lib/canjes/tipos.ts`. Mismo formato o los números no coinciden. */
function numeroCanje(id) {
  return 'C-' + String(id).padStart(4, '0');
}

const TALLES = ['remera', 'pantalon', 'calzado'];

/** Espejo de `VIA_ENVIO_LABEL` en `lib/canjes/tipos.ts`. Es lo que ella lee, no un enum. */
const VIA_ENVIO_LABEL = { correo: 'Correo Argentino', andreani: 'Andreani', cadete: 'Cadete', presencial: 'Lo retira' };

/**
 * Espejo de `trackingUrl` (`lib/reclamos/tipos.ts:1294`). Se calcula **en el servidor** y no en la
 * pantalla: el portal es público y traerse `lib/reclamos/tipos.ts` —1.300 líneas de reglas
 * internas— al bundle que se descarga un teléfono cualquiera es exactamente lo que no queremos.
 */
function urlDeSeguimiento(via, codigo) {
  const c = String(codigo || '').trim();
  if (!c) return null;
  if (via === 'andreani') return 'https://www.andreani.com/?tab=seguir-envio';
  if (via === 'correo') return `https://www.correoargentino.com.ar/formularios/e-commerce?id=${encodeURIComponent(c)}`;
  return null;
}

/**
 * Por dónde va su pedido. Sólo se arma **después de despachar**: antes no hay nada que contar y
 * mostrar un envío vacío parece un error.
 *
 * De los intentos de entrega sale **la fecha y nada más**. La nota interna ("no había nadie", "la
 * dirección está incompleta") es para nosotros: es un juicio sobre lo que pasó, y en su pantalla se
 * leería como un reproche. Lo que a ella le sirve es saber que pasaron y cuándo.
 */
function elEnvio(canje) {
  if (canje.envio_estado !== 'hecho' && !canje.entregado_at) return null;
  const via = canje.envio_via || null;
  const seguimiento = canje.envio_seguimiento || null;
  const intentos = Array.isArray(canje.intentos) ? canje.intentos : [];
  return {
    via: via ? (VIA_ENVIO_LABEL[via] || via) : null,
    seguimiento,
    trackingUrl: urlDeSeguimiento(via, seguimiento),
    entregadoAt: canje.entregado_at || null,
    intentos: intentos.map((i) => ({ at: i && i.at ? String(i.at) : null })).filter((i) => i.at),
  };
}

const recorte = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Un archivo suyo, como sale a su pantalla. Tres campos y ninguno más: de `canje_evidencias`
 * quedan afuera `verificada`, `rechazada_motivo` y `metricas`, que son nuestra lectura de lo que
 * ella entregó. Que un archivo esté «sin verificar» es una tarea nuestra, no una nota para ella.
 */
function unArchivo(e) {
  return { id: e.id, url: e.archivo_url, tipo: e.archivo_tipo === 'video' ? 'video' : 'imagen', at: e.created_at || null };
}

/**
 * Lo que se le muestra: sus propios datos y nada más. Ni el tope, ni el monto, ni los productos, ni
 * lo que se le exigió publicar, ni una palabra del criterio con el que se la eligió.
 *
 * Se exporta para poder testearla: es la última barrera antes de que algo salga a internet, y un
 * campo de más acá no rompe ninguna pantalla — simplemente se filtra, en silencio, hacia afuera.
 * `tests/canje-portal.test.ts` le pasa una fila con todo lo sensible adentro y verifica que no salga.
 *
 * `contenido` son las filas de `canje_evidencias` que subió ella. Va al final y por separado porque
 * es lo único de esta respuesta que ella misma escribió: no sale de su ficha ni del canje.
 *
 * @returns {{ numero: string, marca: string, pide: 'talles'|'modelo_celular', despachado: boolean,
 *   confirmadoAt: string|null, envio: Record<string, any>|null,
 *   datos: Record<string, any>, contenido: Record<string, any>[], puedeSubir: boolean,
 *   carpetaContenido: string,
 *   vitrina: Record<string, any>|null, elegidos: Record<string, any>[] }}
 */
export function paraLaPersona(canje, persona, cfg, vitrina, items, contenido) {
  const store = canje.store;
  const p = persona || {};
  const datos = {};
  for (const k of CAMPOS_PERSONA) datos[k] = p[k] ?? null;

  // Los dos conviven en la ficha (la misma creadora puede tener talles por Zattia y modelo por BDI)
  // pero se manda sólo el que esta marca pide: pedirle datos que no le sirven a nadie es la forma
  // más barata de que abandone el formulario.
  const pide = queDatoPide(store);
  if (pide === 'talles') {
    const t = (p.talles && typeof p.talles === 'object') ? p.talles : {};
    datos.talles = { remera: t.remera ?? null, pantalon: t.pantalon ?? null, calzado: t.calzado ?? null };
  } else {
    datos.modelo_celular = p.modelo_celular ?? null;
  }

  return {
    numero: numeroCanje(canje.id),
    marca: STORE_LABEL[store] || store,
    pide,
    // Lo retira en el local: la pantalla no le pide el domicilio y le dice dónde pasar a buscarlo.
    retiroLocal: !!canje.retiro_local,
    // Ya despachado: los datos no cambian nada y dejarla editarlos sería mentirle. Se muestra en
    // modo lectura con el aviso, en vez de un 404 que la haría escribirnos para nada.
    despachado: canje.envio_estado === 'hecho' || !!canje.entregado_at || canje.estado === 'en_curso',
    confirmadoAt: canje.datos_confirmados_at || null,
    // 🔴 Acá viajaba `driveUrl`, la carpeta de Drive de la marca. **Ya no**: desde el 21-ago-2026
    // ella sube por este mismo link y esa carpeta pasó a ser el archivo interno del equipo, así que
    // mandarla era publicar un link de la empresa en un portal abierto a internet, para dibujar un
    // cartel que la mandaba al lugar que no funcionaba.
    // Por dónde va, una vez que salió. `null` mientras no se despachó.
    envio: elEnvio(canje),
    datos,
    // Lo que ya subió, para que la pantalla lo dibuje y ella vea que llegó. Ver `unArchivo`.
    contenido: (contenido || []).filter((e) => e && e.archivo_url).map(unArchivo),
    // 🔑 La carpeta del Blob, armada acá. El permiso de subida se firma sobre el `pathname` que
    // manda el browser, así que el browser tiene que decir uno — y lo que se le pasa es éste, para
    // que no lo calcule él. El servidor lo vuelve a exigir al firmar (`permisoDeLaCreadora`) y al
    // registrar la URL (`esUrlDeContenido`): mandarlo no afloja ninguna de las dos.
    carpetaContenido: carpetaDeCanje(canje.id),
    // ⚠️ Es una pista para la pantalla, no el control: el que decide es el servidor, dos veces
    // (antes de firmar el permiso y antes de registrar la URL). Acá se cuentan sólo los suyos
    // porque es lo único que se trajo; el tope de verdad cuenta la tabla entera y puede cortar
    // antes. Que corte antes se ve como un cartel, no como un archivo perdido.
    puedeSubir: (contenido || []).length < topeDeEvidencias(cfg),
    ...laVitrina(canje, vitrina, items),
  };
}

/**
 * Lo de la vitrina que sale a internet: la lista para elegir y lo que ya eligió.
 *
 * Se arma **campo por campo**, como el resto de este archivo: de `canje_vitrina_items` no salen ni
 * el `costo` (no existe en esa tabla, pero el criterio vale igual), ni el `sku`, ni el
 * `tn_product_id`, ni el `activo`. Nada de eso le sirve a ella y todo eso es información nuestra
 * sobre la tienda.
 *
 * ⚠️ **En modo unidades no viaja ni un peso.** No es un olvido: el precio de lo que se le regala no
 * es asunto de nadie más, y este es el único endpoint del módulo abierto a internet. En modo monto
 * sí viaja el precio de cada cosa y el saldo, porque el trato es "elegí hasta $X" y sin los números
 * no puede cumplirlo.
 *
 * Sin vitrina colgada devuelve `vitrina: null` y el link se comporta como siempre: sólo los datos.
 */
function laVitrina(canje, vitrina, items) {
  const elegidosRaw = (items || []).filter((i) => i.origen === 'persona' && i.estado !== 'quitado');
  const porMonto = canje.tope_tipo === 'monto';

  // Lo que ya eligió. Se le muestra **aunque la vitrina se haya archivado o cambiado**: quedó
  // congelado en su canje y es lo que ella pidió, no lo que hoy se ofrece.
  const elegidos = elegidosRaw.map((i) => ({
    nombre: i.nombre || '',
    variante: i.variante || '',
    cantidad: Number(i.cantidad) || 1,
    ...(porMonto ? { pvp: i.pvp_unit == null ? null : Number(i.pvp_unit) } : {}),
  }));

  if (!vitrina) return { vitrina: null, elegidos };

  // El saldo cuenta TODOS los items vivos, no sólo los suyos: si el equipo ya le cargó algo, esa
  // unidad está gastada de verdad y decirle que le quedan tres sería mandarla contra el error.
  const vivos = (items || []).filter((i) => i.estado === 'propuesto' || i.estado === 'confirmado');
  const tope = porMonto
    ? (canje.tope_pvp == null ? null : Number(canje.tope_pvp))
    : (canje.tope_unidades || []).reduce((a, u) => a + (Number(u.cantidad) || 0), 0) || null;
  const usado = porMonto
    ? vivos.reduce((a, i) => a + (Number(i.pvp_unit) || 0) * (Number(i.cantidad) || 0), 0)
    : vivos.reduce((a, i) => a + (Number(i.cantidad) || 0), 0);

  return {
    elegidos,
    vitrina: {
      titulo: vitrina.nombre || '',
      // `false` = ya mandó, o el pedido ya se está preparando. La pantalla la muestra en lectura.
      abierta: !canje.seleccion_cerrada_at && ELIGIENDO.includes(canje.estado),
      modo: porMonto ? 'monto' : 'unidades',
      tope,
      usado,
      items: (vitrina.items || [])
        .filter((i) => i.activo && Array.isArray(i.opciones) && i.opciones.length)
        .map((i) => ({
          id: i.id,
          nombre: i.nombre || '',
          foto: i.foto_url || null,
          // Las demás fotos del producto, para poder verlas grandes. Son las mismas que la tienda ya
          // muestra en público, así que no hay nada acá que no se pueda ver entrando a la web.
          // Una vitrina vieja las trae vacías y el visor cae a la tapa: se comporta como antes.
          fotos: Array.isArray(i.fotos) ? i.fotos.filter(Boolean) : [],
          ...(porMonto ? { pvp: i.pvp == null ? null : Number(i.pvp) } : {}),
          // De cada variante sale lo justo para elegirla y verla: el id (que es lo que ella manda
          // de vuelta), cómo se llama y su foto. El SKU y el código de barras se quedan acá.
          opciones: i.opciones.map((o) => ({
            id: String(o.id),
            valores: Array.isArray(o.valores) ? o.valores : [],
            foto: o.foto || null,
          })),
        })),
    },
  };
}

/**
 * Sanea y valida lo que llega del formulario. Devuelve `{ campos, error }`: `error` en criollo, que
 * es lo que ella va a leer en el teléfono.
 *
 * Se valida **acá además de en el browser**: una validación que sólo existe en el front no es una
 * validación. Y se escribe **sólo lo que vino definido** — una clave ausente no borra lo que el
 * equipo ya había cargado.
 *
 * Exportada para test.
 *
 * @returns {{ campos?: Record<string, any>, error?: string }}
 */
export function camposDeLaPersona(datos, store, retiroLocal) {
  const d = (datos && typeof datos === 'object') ? datos : {};
  /** @type {Record<string, any>} */
  const campos = {};

  for (const k of CAMPOS_PERSONA) {
    if (d[k] === undefined) continue;
    campos[k] = recorte(d[k], k === 'direccion_nota' ? 300 : 120);
  }

  if (queDatoPide(store) === 'talles') {
    if (d.talles !== undefined) {
      const t = (d.talles && typeof d.talles === 'object') ? d.talles : {};
      const limpio = {};
      for (const k of TALLES) limpio[k] = recorte(t[k], 30);
      campos.talles = limpio;
      if (!TALLES.some((k) => limpio[k])) return { error: 'Poné al menos un talle: es lo que necesitamos para elegirte el producto.' };
    }
  } else if (d.modelo_celular !== undefined) {
    campos.modelo_celular = recorte(d.modelo_celular, 60);
    if (!campos.modelo_celular) return { error: 'Falta el modelo de tu celular: sin eso no sabemos qué funda mandarte.' };
  }

  // Los obligatorios se piden sólo si la clave vino: así un guardado parcial (que hoy no existe,
  // pero mañana sí) no se rompe contra una regla pensada para el formulario completo.
  const falta = (k, comoSeLlama) => campos[k] !== undefined && !campos[k] ? comoSeLlama : null;
  const faltantes = [
    falta('nombre', 'tu nombre'),
    // El apellido es obligatorio desde que el formulario dejó de prellenarlos: lo que había en la
    // ficha lo tipeó el equipo, y estos dos son los que salen impresos en la etiqueta del envío.
    falta('apellido', 'tu apellido'),
    falta('telefono', 'tu teléfono'),
    // El email dejó de ser opcional: no va en la orden de Tienda Nube (esa lleva el de la marca),
    // va al padrón y es con lo que se la vuelve a contactar dentro de seis meses. Un dato de
    // contacto que la mitad de las fichas no tiene no sirve para nada.
    falta('email', 'tu email'),
    // El DNI se pide igual: en el correo lo exige el despacho y en el local es con lo que se
    // identifica a quien pasa a buscarlo.
    falta('dni', retiroLocal ? 'tu DNI' : 'tu DNI (lo pide el correo)'),
    // El domicilio SÓLO si se le manda. Si lo retira en el local no hay a dónde despachar nada, y
    // pedirle la dirección es la forma más barata de que abandone el formulario — y de quedarse con
    // un dato que nadie va a usar.
    ...(retiroLocal ? [] : [
      falta('calle', 'la calle'),
      falta('numero', 'la altura'),
      falta('cp', 'el código postal'),
      falta('localidad', 'la localidad'),
      falta('provincia', 'la provincia'),
    ]),
  ].filter(Boolean);
  if (faltantes.length) {
    const lista = faltantes.length === 1
      ? faltantes[0]
      : `${faltantes.slice(0, -1).join(', ')} y ${faltantes[faltantes.length - 1]}`;
    return { error: `Nos falta ${lista}.` };
  }

  // Forma del email, después de la presencia: un `mailgmail.com` pasa el "no está vacío" y deja el
  // dato tan inservible como si no lo hubiera cargado, pero sin que nadie se entere. El chequeo es
  // a propósito mínimo —algo, arroba, algo, punto, algo— porque validar direcciones de verdad es
  // imposible y lo único que se lograría es rebotar a alguien con un mail raro pero válido.
  if (campos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campos.email)) {
    return { error: 'Revisá el email: parece que le falta algo.' };
  }

  if (!Object.keys(campos).length) return { error: 'No llegó ningún dato.' };
  return { campos };
}

/**
 * Convierte lo que ella eligió en filas de `canje_items`. Devuelve `{ filas }` o `{ error }` en
 * criollo, que es lo que va a leer en el teléfono.
 *
 * **Nada se toma de lo que mandó el browser salvo el id y la cantidad.** El nombre, la variante y
 * el precio salen de la vitrina que está en la base: si vinieran del cliente, cualquiera podría
 * mandarse un producto inventado a precio cero y saltarse el tope. Es el mismo criterio con el que
 * `camposDeLaPersona` re-valida los datos que el formulario ya validó.
 *
 * Exportada para test.
 *
 * @returns {{ filas?: Array<Record<string, any>>, error?: string }}
 */
export function eleccionesEnItems(elecciones, vitrina, canjeId) {
  const lista = Array.isArray(elecciones) ? elecciones : [];
  if (!lista.length) return { error: 'No elegiste nada todavía.' };
  if (lista.length > MAX_ELECCIONES) return { error: 'Elegiste demasiadas cosas.' };

  const porId = new Map(
    (vitrina.items || []).filter((i) => i.activo && Array.isArray(i.opciones) && i.opciones.length)
      .map((i) => [String(i.id), i]),
  );

  const filas = [];
  for (const e of lista) {
    const item = porId.get(String((e && e.item_id) ?? ''));
    // Un producto que se apagó entre que abrió el link y mandó. Se lo dice con el nombre si lo
    // tenemos, porque "algo que elegiste ya no está" la obliga a comparar toda la lista a ojo.
    if (!item) return { error: 'Uno de los productos que elegiste ya no está disponible. Recargá la página y probá de nuevo.' };

    const opcion = (item.opciones || []).find((o) => String(o.id) === String((e && e.opcion_id) ?? ''));
    if (!opcion) return { error: `De "${item.nombre}" falta elegir la opción.` };

    const cantidad = parseInt(e && e.cantidad, 10);
    if (!Number.isFinite(cantidad) || cantidad < 1) return { error: `La cantidad de "${item.nombre}" no es válida.` };

    filas.push({
      canje_id: canjeId,
      // Ids de **Tienda Nube**, no de Gestión Nube: la vitrina es un espejo de la tienda. Lo dice
      // `origen`. Ver el comentario de `product_id` en `lib/canjes/tipos.ts`.
      product_id: item.tn_product_id || null,
      size_id: String(opcion.id),
      sku: opcion.sku || item.sku || null,
      nombre: item.nombre,
      variante: (opcion.valores || []).filter(Boolean).join(' · ') || null,
      cantidad,
      // El precio sale de la vitrina congelada. El **costo queda en null a propósito**: vive en
      // Gestión Nube y no se puede cruzar confiable desde acá (el SKU falta o se repite). Lo
      // completa el equipo al confirmar, y mientras tanto el balance lo estima con
      // `factor_costo_estimado`.
      pvp_unit: item.pvp == null ? null : Number(item.pvp),
      costo_unit: null,
      origen: 'persona',
      // **Propuesto, no confirmado**: que ella lo haya elegido no quiere decir que haya stock. El
      // equipo lo confirma o lo marca sin stock, que es el flujo que ya existe.
      estado: 'propuesto',
    });
  }
  return { filas };
}

/**
 * La vitrina del canje con sus productos, o `null` si no tiene.
 *
 * Se leen las columnas de a una y no con `select *` por lo mismo que el resto del archivo: es la
 * tabla de la que sale lo que viaja a internet, y una columna nueva mañana no tiene que colarse
 * sola. `activo` viene porque `laVitrina` filtra por él.
 */
async function traerVitrina(supabase, vitrinaId) {
  if (!vitrinaId) return null;
  const { data: v } = await supabase.from('canje_vitrinas')
    .select('id, nombre, estado').eq('id', vitrinaId).maybeSingle();
  if (!v) return null;
  const { data: items } = await supabase.from('canje_vitrina_items')
    .select('id, tn_product_id, sku, nombre, foto_url, fotos, pvp, opciones, activo')
    .eq('vitrina_id', vitrinaId).order('orden');
  return { ...v, items: items || [] };
}

export default async function handler(req, res) {
  // Este endpoint NO usa `soloMismoOrigen`: lo abre ella desde su celular, con el link.
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = String((req.method === 'POST' ? (req.body || {}).token : req.query.token) || '').trim();
  // Un token con forma inválida ni siquiera se consulta.
  if (!esTokenDeCanje(token)) return res.status(404).json({ error: 'no encontrado' });

  const supabase = clienteMaestro();
  if (!supabase) return res.status(500).json({ error: 'No se pudo abrir el formulario. Escribinos y lo resolvemos.' });

  try {
    const canje = await buscarPorToken(supabase, token, CANJE_COLS);
    if (!canje) return res.status(404).json({ error: 'no encontrado' });

    const [{ data: persona }, { data: cfg }, vitrina, { data: items }, { data: contenido }] = await Promise.all([
      supabase.from('canje_personas')
        .select(`${CAMPOS_PERSONA.join(', ')}, talles, modelo_celular`)
        .eq('id', canje.persona_id).maybeSingle(),
      supabase.from('canje_config').select('tope_evidencias_por_canje').eq('store', canje.store).maybeSingle(),
      traerVitrina(supabase, canje.vitrina_id),
      // Todos los items del canje, no sólo los suyos: el saldo del tope los cuenta a todos.
      supabase.from('canje_items')
        .select('nombre, variante, cantidad, pvp_unit, origen, estado').eq('canje_id', canje.id),
      // Lo que ella misma subió. Se lee de la MISMA tabla que la prueba de publicación
      // (`canje_evidencias`), filtrada por quién la cargó: el modelo previó `subido_por` desde el
      // día uno y hasta hoy no había forma de que valiera `'persona'`.
      supabase.from('canje_evidencias')
        .select('id, archivo_url, archivo_tipo, created_at')
        .eq('canje_id', canje.id).eq('subido_por', 'persona').order('id'),
    ]);

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, canje: paraLaPersona(canje, persona, cfg, vitrina, items, contenido) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const accion = String((req.body || {}).accion || '');

    // ── El contenido que sube ella ────────────────────────────────────────────
    // Registra UN archivo que su celular ya subió al Blob. Los bytes no pasaron por acá (el permiso
    // lo firmó `api/blob-upload.js` y la subida fue directa), así que lo que llega es un string de
    // afuera y hay que tratarlo como tal: `esUrlDeContenido` exige que sea del Blob y de la carpeta
    // de ESTE canje.
    if (accion === 'contenido') {
      const url = String((req.body || {}).url || '').trim();
      if (!esUrlDeContenido(url, canje.id)) return res.status(400).json({ error: 'Ese archivo no se subió desde acá.' });
      const tipo = (req.body || {}).tipo === 'video' ? 'video' : 'imagen';

      // El mismo tope que aplica `evidencia-agregar` en `api/_canjes.js`, contra la misma tabla. Se
      // vuelve a mirar acá aunque `blob-upload.js` ya lo haya mirado antes de firmar: entre firmar
      // y registrar pasa la subida entera, y el tope lo puede haber cruzado otra tanda en paralelo.
      const previas = await contarEvidencias(supabase, canje.id);
      const tope = topeDeEvidencias(cfg);
      if (previas >= tope) return res.status(409).json({ error: 'Ya subiste todo lo que entra. Si falta algo, escribinos.' });

      const ahoraIso = new Date().toISOString();
      const { data: fila, error: eEv } = await supabase.from('canje_evidencias').insert({
        canje_id: canje.id,
        // Suelta a propósito: ella manda el material, **no declara qué entregable cumple**. Atarlo a
        // un entregable es un juicio, y los juicios los hace el equipo desde el panel.
        entregable_id: null,
        archivo_url: url,
        archivo_tipo: tipo,
        subido_por: 'persona',
        // ⛔ Nace SIN verificar, y una evidencia sin verificar no cuenta para el cumplimiento. Que
        // suba diez fotos no puede cerrarle un reel solo.
        verificada: false,
        usuario: 'creadora',
        created_at: ahoraIso,
        updated_at: ahoraIso,
      }).select('id, archivo_url, archivo_tipo, created_at').single();
      if (eEv) throw new Error(eEv.message);

      return res.status(200).json({ ok: true, archivo: unArchivo(fila) });
    }

    if (accion !== 'guardar') return res.status(400).json({ error: 'acción desconocida' });

    // Después del despacho la dirección ya viajó con el paquete: dejarla editar sería hacerle creer
    // que el pedido cambia de rumbo. El canje ya congeló su copia en `envio_direccion`.
    if (canje.envio_estado === 'hecho' || canje.entregado_at) {
      return res.status(409).json({ error: 'Tu pedido ya salió, así que los datos quedaron como estaban. Si algo no coincide, escribinos.' });
    }

    const { campos, error: eValida } = camposDeLaPersona((req.body || {}).datos, canje.store, canje.retiro_local);
    if (eValida) return res.status(400).json({ error: eValida });

    // ── Lo que eligió ─────────────────────────────────────────────────────────
    // Va en el MISMO request que los datos, igual que los entregables en `canje-crear`: si fueran
    // dos llamadas, abandonar entre una y otra le dejaría la elección cerrada y la dirección sin
    // cargar, que es el peor de los dos mundos. Se valida todo antes de escribir nada.
    const elecciones = (req.body || {}).elecciones;
    let filas = null;
    if (elecciones !== undefined) {
      if (!vitrina || !ELIGIENDO.includes(canje.estado)) {
        return res.status(409).json({ error: 'Este pedido ya no admite elegir productos.' });
      }
      if (canje.seleccion_cerrada_at) {
        return res.status(409).json({ error: 'Ya elegiste tus productos. Si querés cambiar algo, escribinos.' });
      }
      const r = eleccionesEnItems(elecciones, vitrina, canje.id);
      if (r.error) return res.status(400).json({ error: r.error });

      // El tope, con la lista REAL de la base y con la misma función que usa el panel. Los suyos
      // anteriores no se suman: se van a reemplazar en el mismo guardado.
      const ajenos = (items || []).filter((i) => i.origen !== 'persona');
      const seVa = seVaDelTope(canje, [...ajenos, ...r.filas]);
      if (seVa) return res.status(409).json({ error: seVa });
      filas = r.filas;
    }

    const ahora = new Date().toISOString();

    // El orden importa. Los productos van primero porque son lo único que puede fallar a mitad de
    // camino, y el borrado previo hace que reintentar sea inofensivo: si el guardado se corta acá,
    // `seleccion_cerrada_at` no llega a estamparse y ella puede mandar de nuevo sin duplicar nada.
    if (filas) {
      const { error: eDel } = await supabase.from('canje_items')
        .delete().eq('canje_id', canje.id).eq('origen', 'persona');
      if (eDel) throw new Error(eDel.message);
      const { error: eIns } = await supabase.from('canje_items').insert(filas);
      if (eIns) throw new Error(eIns.message);
    }

    const { error: eP } = await supabase.from('canje_personas')
      .update({ ...campos, updated_at: ahora }).eq('id', canje.persona_id);
    if (eP) throw new Error(eP.message);

    // Sin historial y sin re-leer: dos columnas, un update. Ver el encabezado.
    const { error: eC } = await supabase.from('canjes')
      .update({
        datos_confirmados_at: ahora,
        ...(filas ? { seleccion_cerrada_at: ahora } : {}),
        updated_at: ahora,
      }).eq('id', canje.id);
    if (eC) throw new Error(eC.message);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 200) });
  }
}
