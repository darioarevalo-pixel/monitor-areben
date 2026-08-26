// El contrato del webhook `oc.confirmada` que manda el sistema de Ingresos, en funciones puras.
//
// Es el estándar **Standard Webhooks** (el mismo de Svix, Clerk y Resend): tres cabeceras
// —`webhook-id`, `webhook-timestamp`, `webhook-signature`— y HMAC-SHA256 sobre
// `{id}.{timestamp}.{cuerpo}` con el secreto decodificado de base64.
//
// ⛔ **Es `.js` plano, no TypeScript**, porque lo importa `api/_oc-webhook.js` y los handlers de
// `api/` corren en Node sin pasar por el compilador de Next (ver AGENTS.md).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 LA TRAMPA: LA FIRMA ES SOBRE LOS BYTES, NO SOBRE EL OBJETO
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Nada de acá adentro toca `req.body`. `verificarFirma` recibe el cuerpo **crudo** y lo usa tal
// cual: parsear el JSON y volver a serializarlo cambia un espacio, un orden de claves o la forma
// de un número, y la firma deja de validar. Es el error más común del que recibe, y falla con
// "firma inválida", que no se parece en nada a la causa.
//
// Por eso está partido en dos: `verificarFirma` (bytes) y `normalizarEvento` (objeto). El que
// llama parsea **después** de verificar, nunca antes.

/** La ventana del estándar: fuera de esto el mensaje es viejo y se rechaza con 400. */
export const VENTANA_SEGUNDOS = 300

/**
 * Decodifica el secreto compartido.
 *
 * Viene en base64, con o sin el prefijo `whsec_` que usa el estándar. Aceptar las dos formas no es
 * laxitud: el prefijo es parte de cómo se muestra el secreto en la mayoría de los emisores, y
 * quien lo copia del panel lo copia con prefijo.
 */
export function secretoEnBytes(secreto) {
  const limpio = String(secreto || '').trim().replace(/^whsec_/, '')
  if (!limpio) return null
  const bytes = Buffer.from(limpio, 'base64')
  return bytes.length ? bytes : null
}

/**
 * Verifica cabeceras + firma. Devuelve `{ ok: true }` o `{ ok: false, status, error }`.
 *
 * Los códigos son los que pide el estándar y **cada uno significa algo distinto para el emisor**:
 *
 *   400  el mensaje está viejo o mal formado ⇒ reintentar no lo va a arreglar.
 *   401  la firma no valida ⇒ hay un secreto distinto de cada lado.
 *   503  no tenemos secreto cargado ⇒ es NUESTRO problema y el reintento SÍ sirve: cuando se
 *        cargue la variable, el reintento entra. Por eso no es 401.
 *
 * @param {object} p
 * @param {string} p.id        cabecera `webhook-id`
 * @param {string} p.timestamp cabecera `webhook-timestamp` (segundos Unix)
 * @param {string} p.firma     cabecera `webhook-signature` (`v1,<base64>`, puede traer varias)
 * @param {Buffer|string} p.cuerpo  el cuerpo CRUDO, sin parsear
 * @param {string} p.secreto   el secreto compartido, tal como está en el entorno
 * @param {number} [p.ahoraMs] para poder probar la ventana sin esperar cinco minutos
 * @param {object} p.crypto    el módulo `node:crypto` (se inyecta para que el núcleo no importe nada)
 */
export function verificarFirma({ id, timestamp, firma, cuerpo, secreto, ahoraMs, crypto }) {
  const idTxt = String(id || '')
  const tsTxt = String(timestamp || '')
  if (!idTxt || !tsTxt) return { ok: false, status: 400, error: 'faltan las cabeceras webhook-id / webhook-timestamp' }

  const ts = Number(tsTxt)
  if (!Number.isFinite(ts)) return { ok: false, status: 400, error: 'webhook-timestamp no es un número' }

  const ahora = Number.isFinite(ahoraMs) ? ahoraMs : Date.now()
  if (Math.abs(ahora / 1000 - ts) > VENTANA_SEGUNDOS) {
    return { ok: false, status: 400, error: 'timestamp fuera de la ventana de 5 minutos' }
  }

  // Va DESPUÉS de la ventana y del formato a propósito: un secreto sin cargar no tiene por qué
  // tapar un mensaje que además está mal formado, y el emisor recibiría 503 —"volvé a intentar"—
  // por algo que no se arregla reintentando.
  const clave = secretoEnBytes(secreto)
  if (!clave) return { ok: false, status: 503, error: 'no hay secreto de webhook cargado en el monitor' }

  const bytes = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(String(cuerpo == null ? '' : cuerpo), 'utf8')
  // 🔴 `Buffer.concat` y no un template: `${id}.${ts}.${cuerpo}` fuerza el cuerpo a string, y un
  // byte que no sea UTF-8 válido se convierte en U+FFFD. Eso cambia lo que se firma sin que se vea.
  const contenido = Buffer.concat([Buffer.from(`${idTxt}.${tsTxt}.`, 'utf8'), bytes])
  const esperada = crypto.createHmac('sha256', clave).update(contenido).digest('base64')

  // El estándar admite VARIAS firmas separadas por espacio: es lo que pasa durante una rotación de
  // secreto, cuando el emisor manda la vieja y la nueva. Alcanza con que una valide.
  const partes = String(firma || '').split(' ').filter(Boolean)
  const valida = partes.some((parte) => {
    const coma = parte.indexOf(',')
    if (coma < 0) return false
    if (parte.slice(0, coma) !== 'v1') return false
    const valor = parte.slice(coma + 1)
    const a = Buffer.from(valor, 'utf8')
    const b = Buffer.from(esperada, 'utf8')
    // La comparación es de tiempo constante, pero `timingSafeEqual` **tira** si los largos no
    // coinciden: el largo se chequea antes y no filtra nada (es público).
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })

  return valida ? { ok: true } : { ok: false, status: 401, error: 'firma inválida' }
}

/** Los tipos de evento que este receptor entiende hoy. */
export const TIPOS = ['oc.confirmada']

const enteroDe = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}
const textoDe = (v) => {
  if (v == null) return null
  const t = String(v).trim()
  return t ? t : null
}
/** `null` si no es una fecha ISO: guardar `'0000-00-00'` es peor que no guardar nada. */
const fechaDe = (v) => {
  const t = textoDe(v)
  if (!t) return null
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null
}

/**
 * Pasa el evento ya parseado a las filas del monitor.
 *
 * Devuelve `{ ok, motivo?, store, oc, lineas }`. `ok:false` con `motivo:'tipo'` significa "no es
 * para nosotros" — el que llama contesta **200**, no 400: el emisor no puede arreglar reintentando
 * que su tipo no nos interese, y 17 horas de reintentos por eso son 17 horas de ruido.
 */
export function normalizarEvento(payload) {
  const ev = payload && typeof payload === 'object' ? payload : {}
  const tipo = textoDe(ev.type) || ''
  if (!TIPOS.includes(tipo)) return { ok: false, motivo: 'tipo', tipo }

  const d = ev.data && typeof ev.data === 'object' ? ev.data : {}
  const store = String((d.negocio || {}).slug || '').toLowerCase()
  if (!['bdi', 'zattia'].includes(store)) return { ok: false, motivo: 'store', tipo, store }

  const ocId = enteroDe((d.orden_compra || {}).id)
  if (!ocId) return { ok: false, motivo: 'oc', tipo, store }

  const oc = d.orden_compra || {}
  const prov = d.proveedor || {}
  const tot = d.totales || {}
  const crudas = Array.isArray(d.lineas) ? d.lineas : []

  const lineas = crudas.map((l, i) => {
    const li = l && typeof l === 'object' ? l : {}
    const pedida = enteroDe(li.cantidad_pedida)
    const contada = enteroDe(li.cantidad_contada)
    return {
      id: `${store}:${ocId}:${i}`,
      oc_ref: `${store}:${ocId}`,
      store,
      orden: i,
      sku: textoDe(li.sku),
      codigo_barras: textoDe(li.codigo_barras),
      nombre: textoDe(li.nombre),
      talle: textoDe(li.talle),
      color: textoDe(li.color),
      cantidad_pedida: pedida,
      cantidad_contada: contada,
      // 🔑 La diferencia se RECALCULA, no se copia. Es un dato derivado de otros dos que ya vienen
      // en el mismo renglón: si el emisor manda las tres y no cierran, la que tiene que ganar es la
      // que se puede verificar. Copiarla dejaría un renglón que se contradice a sí mismo.
      diferencia: contada - pedida,
      observaciones: textoDe(li.observaciones),
      es_nuevo: li.es_nuevo === true,
      en_gn: null,
      producto_id: null,
    }
  })

  const pedidas = lineas.reduce((a, l) => a + l.cantidad_pedida, 0)
  const contadas = lineas.reduce((a, l) => a + l.cantidad_contada, 0)
  // Las dos puntas por separado: un neto en cero puede ser "cerró justo" o "falta un talle y sobra
  // otro", y son dos cosas distintas para el que reclama.
  const faltantes = lineas.reduce((a, l) => a + (l.diferencia < 0 ? -l.diferencia : 0), 0)
  const sobrantes = lineas.reduce((a, l) => a + (l.diferencia > 0 ? l.diferencia : 0), 0)

  const totPedidas = enteroDe(tot.unidades_pedidas)
  const totContadas = enteroDe(tot.unidades_contadas)
  const totLineas = enteroDe(tot.lineas)
  // ⚠️ Se compara contra los totales del evento SOLO si vinieron todos los renglones. Un emisor que
  // manda la cabecera completa y los renglones recortados no está mintiendo en los totales, y
  // marcarle discrepancia haría que todas las OC se vean rotas.
  const completo = totLineas > 0 ? lineas.length === totLineas : lineas.length > 0
  const coinciden = !completo || (totPedidas === pedidas && totContadas === contadas)

  return {
    ok: true,
    tipo,
    store,
    oc: {
      id: `${store}:${ocId}`,
      store,
      oc_id: ocId,
      oc_label: textoDe(oc.label),
      oc_estado: textoDe(oc.estado),
      fecha_compra: fechaDe(oc.fecha_compra),
      fecha_ingreso: fechaDe(oc.fecha_ingreso),
      proveedor_id: enteroDe(prov.id) || null,
      proveedor_nombre: textoDe(prov.nombre),

      productos: enteroDe(tot.productos),
      lineas: totLineas,
      unidades_pedidas: totPedidas,
      unidades_contadas: totContadas,
      diferencia_unidades: enteroDe(tot.diferencia_unidades),
      lineas_con_diferencia: enteroDe(tot.lineas_con_diferencia),

      unidades_faltantes: faltantes,
      unidades_sobrantes: sobrantes,
      lineas_nuevas: lineas.filter((l) => l.es_nuevo).length,
      // ⛔ `null` y no 0 cuando no se pidió nada: 0 leería "no llegó nada" y lo que pasa es que no
      // hay contra qué comparar. El cero afirma.
      cumplimiento: pedidas > 0 ? Number((contadas / pedidas).toFixed(4)) : null,

      totales_coinciden: coinciden,
      lineas_recibidas: lineas.length,

      espejo_consultado: false,
      skus_sin_espejo: null,
    },
    lineas,
  }
}
