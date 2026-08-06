// Accionar sobre la pauta de Meta: pausar/activar y cambiar el presupuesto diario, a nivel
// campaña, conjunto o aviso. TODO el POST de `/api/meta-ads` entra por acá.
//
//   POST /api/meta-ads { accion, nivel, objetoId, campos:{…}, idem }
//
// ⚠️ Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby. `meta-ads.js`
// queda con una línea de despacho.
//
// ⚠️ Los permisos y la tabla de acciones se IMPORTAN de `lib/meta-ads/acciones.core.js`, que es el
// mismo archivo con el que la pantalla dibuja los botones. Copiar un chequeo acá adentro es lo que
// dejó pausar campañas a quien tenía el permiso excluido.
//
// # El orden es el punto de este archivo
//
// Las tres marcas se pautean desde la MISMA cuenta publicitaria: un error de escritura no lo paga
// una marca sola. Por eso cada paso está antes del que sigue por un motivo, y no se pueden
// reordenar:
//
//   1. Validar la forma (acción, nivel, id, whitelist de campos, idem).
//   2. Reservar el `idem` en la base ANTES de tocar Meta. Es lo que mata el doble clic.
//   3. Leer el objeto en Meta. Paga tres cosas de una: el `campaign_id` real, el valor «de» para el
//      cartel y la auditoría, y el nivel verdadero.
//   4. Verificar que el nivel real coincide con el declarado. Sin esto, alguien manda un
//      `campaign_id` diciendo que es un aviso y se saltea la validación de nivel.
//   5. Resolver la línea. Campaña sin marca → 409, también para admin.
//   6. Permiso, preguntado por la LÍNEA de la campaña, no por la sesión.
//   7. Reglas de negocio de la acción (CBO, presupuesto total, mínimo de la cuenta).
//   8. Escribir. Con reintento SÓLO si la acción es idempotente.
//   9. Releer y comparar: `ok:true` sólo si el valor quedó puesto de verdad.
//  10. Cerrar la fila de auditoría, siempre, también cuando Meta rechaza.
import {
  CAMPOS_LECTURA, ETIQUETA_NIVEL, fotoDe, nivelReal, permiteAccion, quedoPuesto,
  revisarPresupuesto, SIN_LINEA, validarPedido,
} from '../lib/meta-ads/acciones.core.js';
import { codigoError, graph, graphPost, mensajeError, minimosDe } from '../lib/meta-ads/graph.core.js';
import { clienteBdi, leerAsignaciones } from './_meta-lineas.js';

const TABLA = 'meta_ads_accion';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Quién firmó la acción. `perfil.name` es el campo que usa el resto de los handlers. */
const quienEs = (perfil) => (perfil && perfil.name) || 'desconocido';

/**
 * Lo que se guarda en `detalle`: **nuestro mensaje y el de Meta**, en ese orden.
 *
 * El nuestro dice qué pasó en castellano; el de Meta (`error_user_msg`) dice qué hay que ir a
 * arreglar. Guardar uno solo deja la fila sin la mitad que sirve.
 */
function motivoLargo(cuerpo) {
  const partes = [cuerpo && cuerpo.error, cuerpo && cuerpo.detalle].filter(Boolean).map(String);
  if (!partes.length) return null;
  // Sin repetirse: hay salidas donde los dos son el mismo texto.
  const unicas = partes.filter((p, i) => partes.indexOf(p) === i);
  return unicas.join(' — ').slice(0, 500);
}

export default async function accionar(req, res, perfil) {
  const pedido = normalizar(req.body || {});

  const v = validarPedido(pedido);
  if (!v.ok) return res.status(v.status).json({ error: v.error });
  const { def, accion, nivel, objetoId, campos, idem } = v;

  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase para registrar la acción.' });

  // ── 2. Reservar el `idem` ANTES de llamar a Meta ────────────────────────────────────────────
  // Escribir la fila al final sería más prolijo y no serviría de nada: entre el clic y la respuesta
  // de Meta hay segundos, y es justo ahí donde entra el segundo clic.
  const reserva = await reservar(sb, { idem, quien: quienEs(perfil), accion, nivel, objetoId, campos });
  if (reserva.repetida) return contestarRepetida(res, reserva.fila);
  if (reserva.error) {
    // Sin poder registrar no se acciona. No es prolijidad: el registro es también el candado del
    // doble clic, y una escritura sobre plata sin rastro es exactamente lo que esta tabla existe
    // para que no pase. Si la tabla todavía no está, se dice cuál es el script.
    return res.status(500).json({
      error: 'No se pudo registrar la acción, así que no se hizo.',
      detalle: `${reserva.error} — si la tabla ${TABLA} no existe, correr \`node scripts/apply-meta-acciones.mjs\`.`,
    });
  }

  /** Cierra la fila reservada y contesta. Toda salida de acá para abajo pasa por esta función. */
  const cerrar = async (status, resultado, cuerpo, extra = {}) => {
    // 🔴 **Los DOS mensajes, no el primero que haya.** Acá decía `cuerpo.error || cuerpo.detalle`, y
    // cuando venían los dos —que es siempre que Meta rechaza— guardaba el nuestro y TIRABA el de
    // Meta. La fila quedaba diciendo «Meta rechazó la copia», que no le sirve a nadie: lo que dice
    // qué hay que arreglar es el otro («la cuenta publicitaria no tiene acceso a esta cuenta de
    // Instagram»). En la pantalla se ve una vez, en un toast que se va; en la fila queda para
    // siempre, y era justo ahí donde se perdía.
    const guardado = await completar(sb, idem, { resultado, detalle: motivoLargo(cuerpo), ...extra });
    // Si el log falla pero Meta ya aplicó, se contesta ok con advertencia: la plata ya se movió y
    // negarlo es peor que admitir que no quedó escrito.
    const sinRegistro = !guardado.ok && resultado === 'ok';
    return res.status(status).json({ ...cuerpo, ...(sinRegistro ? { sinRegistro: true } : {}) });
  };

  // ── 3. Leer el objeto en Meta, con su padre ─────────────────────────────────────────────────
  const lectura = await graph(`${objetoId}?fields=${CAMPOS_LECTURA[nivel]}`);
  if (!lectura.ok) {
    // `(#100) Tried accessing nonexisting field` es lo que contesta Meta cuando el id no es de ese
    // nivel: cada lista de campos lleva a propósito uno que sólo existe en su nivel.
    const code = codigoError(lectura);
    const suyo = code === 100
      ? `Ese id no parece ser un/a ${ETIQUETA_NIVEL[nivel]} de Meta.`
      : 'No se pudo leer el objeto en Meta, así que no se tocó nada.';
    return cerrar(code === 100 ? 400 : 502, 'rechazado', { error: suyo, detalle: mensajeError(lectura) });
  }
  const obj = lectura.data || {};

  // ── 4. El nivel real tiene que coincidir con el declarado ───────────────────────────────────
  const real = nivelReal(obj);
  if (real !== nivel) {
    return cerrar(400, 'rechazado', {
      error: `Ese id es un/a ${ETIQUETA_NIVEL[real] || real}, no un/a ${ETIQUETA_NIVEL[nivel]}.`,
    });
  }

  const nombre = String(obj.name || '');
  const cuentaId = String(obj.account_id || '');
  const campaignId = nivel === 'campania' ? objetoId : String(obj.campaign_id || '');

  // ── 5. De qué marca es esta plata ───────────────────────────────────────────────────────────
  const asignadas = await leerAsignaciones();
  if (asignadas.error) {
    return cerrar(502, 'error', {
      error: 'No se pudo leer de qué marca es esta campaña, así que no se tocó nada.',
      detalle: asignadas.error,
    }, { objeto_nombre: nombre, campaign_id: campaignId, cuenta_id: cuentaId });
  }
  const fila = asignadas.mapa.get(campaignId);
  if (!fila) {
    // 409 y no 403: no hay permiso que lo arregle, ni el de admin. Con las tres marcas en una sola
    // cuenta, accionar sobre una campaña huérfana es gastar plata que nadie sabe de quién es. El
    // estado se arregla asignándola, y por eso el cartel de la pantalla lleva el botón.
    return cerrar(409, 'rechazado', { error: SIN_LINEA, campaignId, sinLinea: true },
      { objeto_nombre: nombre, campaign_id: campaignId, cuenta_id: cuentaId });
  }
  const linea = String(fila.linea);
  const contexto = { objeto_nombre: nombre, campaign_id: campaignId, cuenta_id: cuentaId, linea };

  // ── 6. Permiso, por la LÍNEA de la campaña ──────────────────────────────────────────────────
  const permiso = permiteAccion(perfil, accion, linea);
  if (!permiso.ok) return cerrar(permiso.status, 'rechazado', { error: permiso.error }, contexto);

  // ── 7 a 10 de duplicar: es otro camino y no una variante ────────────────────────────────────
  // Lo que sigue abajo («escribir campos, releer, comparar») no le sirve: duplicar no cambia el
  // objeto que se lee, **crea uno nuevo**, así que no hay campo que comparar y sí hay una copia que
  // encontrar y adoptar. Meterlo a la fuerza en el mismo camino era la forma segura de que
  // `quedoPuesto()` diera verde sin haber verificado nada.
  if (accion === 'duplicar') return await duplicar({ sb, idem, cerrar, nivel, objetoId, obj, nombre, linea, contexto, quien: quienEs(perfil) });

  // ── 7. Reglas de negocio ────────────────────────────────────────────────────────────────────
  if (accion === 'presupuesto') {
    // El padre sólo hace falta para detectar CBO: si la campaña tiene el presupuesto, el del
    // conjunto no existe y ponerlo no hace nada.
    let padre = null;
    if (nivel === 'conjunto' && campaignId) {
      const p = await graph(`${campaignId}?fields=id,daily_budget,lifetime_budget`);
      if (p.ok) padre = p.data || null;
    }
    // El mínimo de la cuenta es un enriquecimiento: si no se pudo leer no se bloquea, contesta Meta.
    // Va sin moneda a propósito —pedirla sería una llamada más— y el edge devuelve una fila por
    // moneda, que para una cuenta de una sola moneda es la única que hay.
    const mins = await minimosDe(cuentaId, null);
    const reglas = revisarPresupuesto(nivel, obj, padre, mins.minDiarioCrudo || null, Number(campos.daily_budget));
    if (!reglas.ok) return cerrar(reglas.status, 'rechazado', { error: reglas.error }, contexto);
  }

  const de = fotoDe(campos, obj);

  // ── 8. Escribir ─────────────────────────────────────────────────────────────────────────────
  const escrito = await escribir(def, objetoId, campos);
  if (!escrito.ok) {
    return cerrar(502, 'rechazado', { error: 'Meta rechazó el cambio.', detalle: mensajeError(escrito) },
      { ...contexto, de, uso: escrito.uso || null });
  }

  // ── 9. Releer y comparar ────────────────────────────────────────────────────────────────────
  // Meta acepta cambios de presupuesto que después no aplica. `ok:true` sale de acá, no del POST.
  // Dos intentos y no los cuatro del default: acá ya se escribió, y los reintentos con espera de
  // `graph()` se comen el tiempo de la función. Si la relectura no entra, se contesta «no se pudo
  // confirmar» —que es la verdad— en vez de morir por límite y no contestar nada.
  const relectura = await graph(`${objetoId}?fields=${CAMPOS_LECTURA[nivel]}`, 2);
  if (!relectura.ok) {
    return cerrar(502, 'error', {
      error: 'Meta aceptó el cambio pero no se pudo confirmar cómo quedó. Revisalo en Ads Manager antes de repetirlo.',
      detalle: mensajeError(relectura),
    }, { ...contexto, de, uso: escrito.uso || null });
  }
  const despues = relectura.data || {};
  const a = fotoDe(campos, despues);
  const puesto = quedoPuesto(campos, despues);
  if (!puesto.ok) {
    return cerrar(502, 'error', {
      error: `Meta aceptó el cambio pero no lo aplicó (${puesto.faltan.join(', ')} quedó como estaba).`,
      quedo: a,
    }, { ...contexto, de, a, uso: escrito.uso || null });
  }

  // Renombrar una campaña deja desactualizado el nombre que guarda `meta_ads_campania_linea`, que es
  // el que muestran la auditoría y el historial de la asignación. No es cosmético: leer «renombró
  // Ventas mayo» debajo de una fila que ya se llama distinto es lo que hace dudar del registro. Va
  // best-effort y con el nombre RELEÍDO: si falla, Meta ya quedó bien y eso es lo que vale.
  if (accion === 'nombre' && nivel === 'campania') {
    await renombrarLinea(campaignId, String(despues.name || ''));
  }

  // ── 10. Cerrar la fila con lo RELEÍDO, no con lo pedido ─────────────────────────────────────
  return cerrar(200, 'ok', {
    ok: true,
    quedo: a,
    nivel,
    objetoId,
    objetoNombre: String(despues.name || nombre),
    campaignId,
    linea,
  }, { ...contexto, de, a, uso: escrito.uso || null });
}

// ── Duplicar (Tanda 2) ────────────────────────────────────────────────────────────────────────
/**
 * El tope de anuncios que Meta copia en una llamada SÍNCRONA. Con más, la Graph API obliga a la vía
 * asíncrona, que devuelve un `async_session_id` que hay que pollear hasta que termine.
 *
 * ⛔ Esa vía queda afuera a propósito: pollear no entra en una función de Vercel Hobby, y hacerlo a
 * medias dejaría copias a medio crear sin nadie mirando. Se cuenta antes y se dice que no.
 */
const TOPE_ADS_SINCRONO = 3;

/**
 * Duplicar una campaña o un conjunto: `POST /<id>/copies`.
 *
 * Las cuatro decisiones que hacen que esto sea seguro:
 *
 * 1. **`status_option: 'PAUSED'`.** La copia NUNCA nace entregando. Es lo único que hace que un clic
 *    de más cueste cero pesos, y por eso el estado tampoco es un campo que se pueda mandar.
 * 2. **El sufijo del nombre lo generamos nosotros y es único.** No es cosmética: si la llamada se
 *    corta sin respuesta, la recuperación no puede ser reintentar —haría dos campañas— sino
 *    **buscar por ese nombre y adoptar** la que ya se creó.
 * 3. 🔴 **La copia hereda la línea en la MISMA operación.** Sin eso nace sin marca y cae en el 409
 *    de «esta campaña todavía no tiene marca»: quedaría un objeto nuevo en la cuenta que **nadie
 *    puede accionar desde el monitor**, ni siquiera quien lo creó.
 * 4. **Se relee la copia antes de contestar `ok`.** Igual que en el resto: lo que se afirma es lo
 *    leído de Meta, no lo que el POST dijo que hizo.
 */
async function duplicar({ sb, idem, cerrar, nivel, objetoId, obj, nombre, linea, contexto, quien }) {
  // Cuántos avisos cuelgan. `summary=true` da el total sin traer las filas.
  const cuenta = await graph(`${objetoId}/ads?limit=1&summary=true`);
  const cuantos = (cuenta.ok && cuenta.data && cuenta.data.summary && cuenta.data.summary.total_count) ?? null;
  if (cuantos !== null && cuantos > TOPE_ADS_SINCRONO) {
    return cerrar(409, 'rechazado', {
      error: `Esta ${ETIQUETA_NIVEL[nivel]} tiene ${cuantos} avisos y Meta sólo copia hasta ${TOPE_ADS_SINCRONO} de una vez. Duplicala desde Ads Manager.`,
    }, contexto);
  }

  const sufijo = sufijoDeCopia();
  const cuerpo = {
    deep_copy: true,
    status_option: 'PAUSED',
    rename_options: JSON.stringify({ rename_strategy: 'DEEP_RENAME', rename_suffix: sufijo }),
  };

  // 🔑 **El sufijo se anota ANTES del POST**, por el mismo motivo por el que el `idem` se reserva
  // antes: si la llamada se corta sin respuesta, la copia puede haberse creado igual, y el sufijo es
  // lo ÚNICO con lo que se la puede encontrar después. Anotarlo al cerrar lo perdería justo en el
  // caso para el que existe. Su falla no frena nada, pero deja dicho que no se va a poder rastrear.
  const anotado = await completar(sb, idem, { pedido: { copia_de: objetoId, sufijo } });

  // ⛔ Sin reintento: lo dice la tabla (`reintentable: false`) y acá se respeta llamando a `graphPost`
  // una sola vez. Un reintento no repetiría un valor, haría DOS campañas.
  const escrito = await graphPost(`${objetoId}/copies`, cuerpo);
  if (!escrito.ok) {
    // 🔴 **`status: 0` es el corte por timeout, y NO es lo mismo que un rechazo.** Una copia profunda
    // puede tardar más que los 8 s del `fetch`, y si se cortó del lado de acá **Meta pudo haberla
    // creado igual**. Contestar «rechazó» ahí sería invitar a apretar de nuevo y terminar con dos
    // campañas: se contesta `error` —el resultado que la auditoría lee como «no sabemos cómo
    // quedó»— y se manda a buscar por el sufijo, que para eso se anotó antes.
    const corte = escrito.status === 0;
    return cerrar(502, corte ? 'error' : 'rechazado', {
      error: corte
        ? `Se cortó antes de que Meta contestara, así que la copia PUEDE haberse creado igual. Buscá «${sufijo.trim()}» en Ads Manager antes de volver a intentarlo.`
        : 'Meta rechazó la copia.',
      detalle: mensajeError(escrito),
    }, { ...contexto, pedido: { copia_de: objetoId, sufijo }, uso: escrito.uso || null });
  }

  // Meta devuelve el id nuevo con nombres distintos según el nivel; el `copied_*_id` es el que trae
  // la copia profunda. Si ninguno vino, la copia PUEDE haberse hecho igual: se dice eso, que es la
  // verdad, en vez de inventar un éxito o un fracaso.
  const d = escrito.data || {};
  const copiaId = String(d.copied_campaign_id || d.copied_adset_id || d.id || '');
  if (!copiaId) {
    return cerrar(502, 'error', {
      error: `Meta aceptó la copia pero no dijo cuál es. Buscá «${sufijo.trim()}» en Ads Manager antes de volver a intentarlo.`,
      // Si además el sufijo no se pudo anotar, quien lea esto tiene que saber que en el registro
      // tampoco va a estar: es la diferencia entre buscar algo y buscar cualquier cosa.
      ...(anotado.ok ? {} : { sinRastro: true }),
    }, { ...contexto, pedido: { copia_de: objetoId, sufijo }, uso: escrito.uso || null });
  }

  // Releer: `ok` sale de acá, no del POST. Y de paso confirma lo único que de verdad importa, que es
  // que nació PAUSED.
  const rel = await graph(`${copiaId}?fields=${CAMPOS_LECTURA[nivel]}`, 2);
  const copia = (rel.ok && rel.data) || {};
  const estadoCopia = String(copia.effective_status || copia.status || '');

  // La línea, en la misma operación. La copia de un conjunto cuelga de la campaña del original, que
  // ya tiene línea: sólo hace falta escribir fila nueva cuando lo copiado es una campaña.
  let conLinea = true;
  if (nivel === 'campania') {
    const puesta = await heredarLinea({
      campaignId: copiaId, linea, cuentaId: contexto.cuenta_id,
      nombre: String(copia.name || `${nombre}${sufijo}`), objetivo: obj.objective || null, quien,
    });
    conLinea = puesta.ok;
  }

  const a = { copia_id: copiaId, nombre: String(copia.name || ''), estado: estadoCopia, con_linea: conLinea };
  return cerrar(200, 'ok', {
    ok: true,
    quedo: {},
    nivel,
    objetoId,
    objetoNombre: nombre,
    campaignId: contexto.campaign_id,
    linea,
    copia: {
      id: copiaId,
      nombre: String(copia.name || ''),
      // Sin relectura no se afirma que está pausada: se dice que no se sabe, y el cartel lo muestra.
      estado: rel.ok ? estadoCopia : '',
      conLinea,
    },
  }, { ...contexto, pedido: { copia_de: objetoId, sufijo }, a, uso: escrito.uso || null });
}

/** La zona en la que trabaja la gente que lee estos nombres. Ver `sufijoDeCopia`. */
const ZONA = 'America/Argentina/Buenos_Aires';

/**
 * El sufijo del nombre de la copia. **Único a propósito** (ver el punto 2 de arriba): es lo que
 * permite encontrarla si la llamada se cortó sin respuesta, que es el único caso en el que duplicar
 * se puede recuperar sin arriesgar una copia de más.
 *
 * 🔴 **La hora va en la zona de Buenos Aires, forzada.** La primera versión usaba `getHours()`
 * "porque es la hora local", y eso es cierto en una máquina de acá y falso en el servidor: las
 * funciones de Vercel corren en **UTC**. La copia de prueba salió llamándose «copia 06/08 19:47»
 * cuando acá eran las 16:47, o sea que el nombre con el que hay que buscarla en Ads Manager no es el
 * de la hora en que se hizo — y este sufijo existe justamente para poder encontrarla.
 */
function sufijoDeCopia() {
  const f = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const p = (t) => (f.find((x) => x.type === t) || {}).value || '00';
  return ` — copia ${p('day')}/${p('month')} ${p('hour')}:${p('minute')}`;
}

/**
 * La fila de `meta_ads_campania_linea` para la copia, con la línea del original.
 *
 * Su falla NO tumba la respuesta: la campaña ya existe en Meta y negarlo sería peor. Se contesta
 * `conLinea: false` y la pantalla dice que hay que asignarla a mano en Etapas.
 */
async function heredarLinea({ campaignId, linea, cuentaId, nombre, objetivo, quien }) {
  const sb = clienteBdi();
  if (!sb) return { ok: false };
  try {
    const { error } = await sb.from('meta_ads_campania_linea').upsert([{
      campaign_id: campaignId,
      linea,
      cuenta_id: cuentaId || '',
      nombre,
      objetivo,
      linea_previa: null,
      por: quien,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'campaign_id' });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/**
 * Deja el nombre de la campaña al día en `meta_ads_campania_linea`. Es una copia denormalizada —el
 * nombre que manda es el de Meta— y por eso su falla no tumba nada: se actualiza si se puede.
 *
 * ⚠️ `update` y no `upsert`: si la campaña no tiene fila de línea, acá no se llega nunca (el 409 de
 * `SIN_LINEA` corta mucho antes), así que un `upsert` sólo podría crear una fila sin línea.
 */
async function renombrarLinea(campaignId, nombre) {
  const sb = clienteBdi();
  if (!sb || !campaignId || !nombre) return { ok: false };
  try {
    const { error } = await sb.from('meta_ads_campania_linea')
      .update({ nombre, updated_at: new Date().toISOString() })
      .eq('campaign_id', campaignId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/**
 * El POST, con reintento **sólo si la acción es idempotente**.
 *
 * Poner `status` o `daily_budget` a un valor absoluto se puede repetir sin consecuencia; duplicar y
 * crear, no —un reintento hace dos campañas—. Quién es cuál lo dice la tabla de acciones
 * (`reintentable`), no el criterio de quien escribe esta función.
 */
async function escribir(def, id, campos) {
  const intentos = def.reintentable ? 2 : 1;
  let last;
  for (let i = 1; i <= intentos; i++) {
    last = await graphPost(id, campos);
    if (last.ok) return last;
    const code = codigoError(last);
    const transitorio = last.status === 0 || last.status === 429 || last.status >= 500 || code === 4 || code === 17 || code === 613;
    if (!transitorio || i === intentos) return last;
    await sleep(800);
  }
  return last;
}

/**
 * Reserva el `idem` con una fila en `en-curso`. El índice único es el que decide: si ya estaba, el
 * insert falla y se devuelve la fila anterior en vez de llamar a Meta otra vez.
 *
 * ⚠️ **`pedido` se guarda acá y no al cerrar la fila.** Es lo único que sobrevive cuando la acción
 * no llega a aplicarse: `a` es lo releído de Meta, así que en un rechazo queda vacío y la fila decía
 * "Fulano intentó cambiar el presupuesto" sin el número. Los `campos` ya pasaron por `validarPedido`
 * en este punto, o sea que lo que se guarda es lo que de verdad se iba a mandar.
 */
async function reservar(sb, { idem, quien, accion, nivel, objetoId, campos }) {
  try {
    const { error } = await sb.from(TABLA).insert([{
      idem, quien, accion, nivel, objeto_id: objetoId, pedido: campos || null, resultado: 'en-curso',
    }]);
    if (!error) return { ok: true };
    // 23505 = unique_violation. Es el caso esperado del doble clic, no una falla.
    if (String(error.code) === '23505' || /duplicate key|unique/i.test(String(error.message))) {
      const { data } = await sb.from(TABLA)
        .select('resultado, detalle, a, nivel, objeto_id, objeto_nombre, campaign_id, linea')
        .eq('idem', idem).maybeSingle();
      return { repetida: true, fila: data || null };
    }
    return { error: error.message };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

/** Completa la fila reservada. Su falla NO tumba la respuesta: la plata ya se movió o no. */
async function completar(sb, idem, campos) {
  try {
    const { error } = await sb.from(TABLA).update(campos).eq('idem', idem);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * La respuesta de un `idem` repetido: se devuelve lo de la primera vez, sin llamar a Meta.
 *
 * Una fila que sigue en `en-curso` es una escritura que se cortó por tiempo y de la que **no
 * sabemos** si Meta la aplicó. Contestar «ya está» sería inventar; contestar «no se hizo» también.
 * Se dice lo que es y se manda a mirar Ads Manager.
 */
function contestarRepetida(res, fila) {
  if (!fila) return res.status(409).json({ error: 'Esa acción ya se había mandado. Recargá para ver cómo quedó.' });
  if (fila.resultado === 'en-curso') {
    return res.status(409).json({
      error: 'Esa acción quedó sin confirmar (se cortó antes de que Meta contestara). Fijate en Ads Manager cómo quedó antes de repetirla.',
    });
  }
  if (fila.resultado !== 'ok') {
    return res.status(409).json({ error: fila.detalle || 'Esa acción ya se había intentado y no salió.', repetida: true });
  }
  return res.status(200).json({
    ok: true,
    repetida: true,
    quedo: fila.a || {},
    nivel: fila.nivel,
    objetoId: fila.objeto_id,
    objetoNombre: fila.objeto_nombre || '',
    campaignId: fila.campaign_id || null,
    linea: fila.linea || null,
  });
}

/**
 * Traduce el payload viejo de pausar un aviso (`{ad_id, status}`) al de la tabla de acciones.
 *
 * Existe por la ventana del deploy: un navegador con el bundle anterior en caché sigue mandando la
 * forma vieja, y que el botón de pausar deje de andar durante media hora no lo entiende nadie. El
 * `idem` se inventa acá porque aquel payload no lo traía —o sea que para esos pedidos el candado
 * del doble clic no aplica, que es exactamente lo que pasaba antes—.
 */
function normalizar(b) {
  if (b && !b.accion && b.ad_id) {
    return {
      accion: 'estado',
      nivel: 'aviso',
      objetoId: String(b.ad_id),
      campos: { status: String(b.status || '').toUpperCase() },
      idem: `legacy${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
    };
  }
  return b;
}
