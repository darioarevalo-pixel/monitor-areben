/**
 * El depósito de informes del analista de pauta: validar lo que entra y mapear lo que sale.
 *
 * En JS plano y no en TypeScript por el motivo de siempre en esta carpeta: lo necesitan
 * `api/_meta-informes.js` y `scripts/informe-meta.mjs`, y ninguno de los dos puede importar TS.
 * Los tipos están en `informes.ts`.
 *
 * 🔑 **Acá no hay ni una métrica, y es a propósito.** Un informe es el diagnóstico en prosa: entra
 * hecho y se guarda tal cual. Lo que se descartó al mudar el analista fue *generarlo* solo; lo que
 * esta capa hace es *archivarlo*, que es lo contrario de un dashboard.
 */

export const TABLA_INFORME = 'meta_ads_informe'

/**
 * El tope del `html`. Los dos informes que ya existen pesan 34 y 42 KB, así que 2 MB es holgado
 * incluso para uno con fotos embebidas en base64 — y frena que alguien pegue por error algo que
 * no es un informe. Sin tope, el error aparece como un timeout del `insert` y no dice qué pasó.
 */
export const LIMITE_HTML = 2 * 1024 * 1024

/** Las columnas de la LISTA. ⚠️ Sin `html`: son 40 KB por fila y la lista no lo usa. */
export const COLS_LISTA = 'id, creada, actualizada, quien, fecha, linea, titulo, resumen, publicado, publicado_at'

/** Las de un informe abierto: las mismas más el cuerpo. */
export const COLS_INFORME = `${COLS_LISTA}, html`

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * ¿Este cuerpo puede guardarse como informe?
 *
 * Devuelve `{ ok: true, informe }` con los campos ya normalizados, o `{ ok: false, error }` con una
 * sola frase. Se llama desde el handler y desde el script, así que la respuesta del `--dry` dice
 * exactamente lo mismo que diría el POST: un ensayo que valida con otro criterio no es un ensayo.
 */
export function validarInforme(cuerpo, { lineasValidas }) {
  const c = cuerpo || {}
  const fecha = String(c.fecha || '').trim()
  if (!RE_FECHA.test(fecha)) return { ok: false, error: 'La fecha tiene que ser AAAA-MM-DD.' }

  const linea = String(c.linea || '').trim().toLowerCase()
  if (!lineasValidas.includes(linea)) {
    return { ok: false, error: `«${linea || '—'}» no es una línea de pauta (${lineasValidas.join(', ')}).` }
  }

  const titulo = String(c.titulo || '').trim()
  if (!titulo) return { ok: false, error: 'Falta el título.' }

  const html = typeof c.html === 'string' ? c.html : ''
  if (!html.trim()) return { ok: false, error: 'El informe llegó vacío.' }
  if (html.length > LIMITE_HTML) {
    return { ok: false, error: `El informe pesa ${Math.round(html.length / 1024)} KB y el tope son ${Math.round(LIMITE_HTML / 1024)} KB.` }
  }

  const resumen = String(c.resumen || '').trim()
  return { ok: true, informe: { fecha, linea, titulo, resumen: resumen || null, html } }
}

/**
 * Lo que conviene saber ANTES de guardar, y que no invalida nada.
 *
 * El informe se dibuja en un iframe con `sandbox` **sin `allow-scripts`**, así que un informe que
 * traiga JS se va a ver, pero mudo. Vale decirlo al subir y no descubrirlo abriéndolo: es el mismo
 * criterio que el resto del repo con los avisos que no frenan pero se escriben.
 */
export function avisosDelHtml(html) {
  const out = []
  const txt = String(html || '')
  if (/<script[\s>]/i.test(txt)) {
    out.push('Trae <script>: adentro del iframe no va a correr (sandbox sin allow-scripts).')
  }
  // Un `src`/`href` a otro host se ve sólo si ese host contesta. El informe de la serie es
  // autocontenido a propósito —CSS adentro, sin CDN— justamente para que se lea dentro de diez años.
  if (/(?:src|href)\s*=\s*["']https?:\/\//i.test(txt)) {
    out.push('Apunta a recursos externos: el día que ese host no conteste, el informe se ve incompleto.')
  }
  if (!/<html[\s>]/i.test(txt)) {
    out.push('No parece un documento completo (no hay <html>).')
  }
  return out
}

/**
 * De fila de la base a lo que consume la pantalla. El mapeo vive en UN lado, como en las reglas.
 *
 * `html` sólo viaja cuando la fila lo trae: la lista se pide sin él.
 */
export function aVistaInforme(f) {
  const v = {
    id: Number(f.id),
    creada: f.creada,
    actualizada: f.actualizada,
    quien: f.quien,
    fecha: typeof f.fecha === 'string' ? f.fecha.slice(0, 10) : f.fecha,
    linea: f.linea,
    titulo: f.titulo,
    resumen: f.resumen || '',
    publicado: !!f.publicado,
    publicadoAt: f.publicado_at || null,
    /** Para la lista: cuánto pesa, sin mandar el cuerpo. */
    pesoKb: f.html ? Math.round(f.html.length / 1024) : null,
  }
  if (typeof f.html === 'string') v.html = f.html
  return v
}

/**
 * El nombre del archivo al descargar. Calcado de la carpeta del analista
 * (`informes/AAAA-MM-DD-<marca>.html`), para que bajar uno y el que ya está en disco sean el mismo
 * archivo y no dos con nombres distintos.
 */
export function nombreArchivo(informe) {
  return `${informe.fecha}-${informe.linea}.html`
}
