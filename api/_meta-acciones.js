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
    const guardado = await completar(sb, idem, { resultado, detalle: cuerpo.error || cuerpo.detalle || null, ...extra });
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
