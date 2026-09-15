/**
 * El spike del «aviso de cero»: **qué acepta Meta en un creativo nuevo que hoy el monitor no manda.**
 *
 * # Por qué existe
 *
 * El plan de piezas arma el creativo copiando página, destino y botón de un aviso modelo, y NUNCA
 * escribe `degrees_of_freedom_spec` (ver la cabecera de `lib/meta-ads/pieza.core.js`). Antes de abrir
 * esos campos en el núcleo hay que medir tres cosas que no están en ningún archivo:
 *
 * 1. **Con qué mejoras nació un creativo que armó el monitor** — o sea, si Meta le prende solo el
 *    catálogo (`product_extensions`) o la optimización de texto cuando no se le dice nada. Se lee.
 * 2. **Qué forma de `degrees_of_freedom_spec` acepta al escribir** para apagarlas. La memoria dice
 *    que «lo rechaza en varias cuentas», pero eso se midió duplicando avisos VIEJOS con el campo
 *    obsoleto `standard_enhancements`, no creando uno nuevo con funciones individuales.
 * 3. **Si acepta un destino y un botón elegidos** (no copiados) y `url_tags`.
 *
 * # ⛔ No crea nada
 *
 * Todo POST va con `execution_options=["validate_only"]` (`VALIDAR_SOLO`): Meta contesta
 * `{"success":true}` sin id y no aparece nada en la cuenta. Lo único que se usa de verdad es un video
 * YA subido y su miniatura, que se leen.
 *
 * # Uso (en Actions, por el token — ver `.github/workflows/ensayo-meta.yml`)
 *
 *   node scripts/ensayo-creativo-meta.mjs --cuenta 1145878766790149 --aviso <adId>
 *
 * `--aviso` es un aviso armado por el motor de piezas: de ahí salen el video, la página y el
 * Instagram con los que se arman las variantes.
 */

import { graph, graphPost, mensajeError } from '../lib/meta-ads/graph.core.js'
import { VALIDAR_SOLO } from '../lib/meta-ads/receta.core.js'

const argv = process.argv.slice(2)
const valor = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const CUENTA = valor('--cuenta')
const AVISO = valor('--aviso')
const DESTINO = valor('--destino') || 'https://bdiaccesorios.com.ar/fundas/moods-collection/'

if (!CUENTA || !AVISO) {
  console.error('Uso: --cuenta <id> --aviso <adId> [--destino <url>]')
  process.exit(1)
}

const linea = (s = '') => console.log(s)
const corto = (o) => JSON.stringify(o, null, 1).slice(0, 1500)

// ── 1. Lo que ya existe: el aviso, su creativo y con qué mejoras nació ──────────────────────────
const ad = await graph(`${AVISO}?fields=id,name,creative{id}`)
if (!ad.ok) { console.error('No se pudo leer el aviso:', mensajeError(ad)); process.exit(1) }
const creativeId = ad.data.creative && ad.data.creative.id
linea(`AVISO ${ad.data.name} · creativo ${creativeId}`)

const cr = await graph(`${creativeId}?fields=object_story_spec,url_tags`)
if (!cr.ok) { console.error('No se pudo leer el creativo:', mensajeError(cr)); process.exit(1) }
const spec = cr.data.object_story_spec || {}
const video = spec.video_data || {}
linea(`page ${spec.page_id} · ig ${spec.instagram_user_id || spec.instagram_actor_id || '-'} · video ${video.video_id}`)
linea(`url_tags actuales: ${cr.data.url_tags || '(ninguno)'}`)

// Aislado en su propia llamada: un campo bloqueado anula la consulta entera (ver `CAMPOS_RECETA`).
const dof = await graph(`?ids=${creativeId}&fields=degrees_of_freedom_spec`)
linea('\n━━ 1. CON QUÉ MEJORAS NACIÓ (degrees_of_freedom_spec leído) ━━')
linea(dof.ok ? corto(dof.data[creativeId] && dof.data[creativeId].degrees_of_freedom_spec) : `no se pudo leer: ${mensajeError(dof)}`)

if (!video.video_id) { console.error('El aviso no es de video: el spike necesita uno de video.'); process.exit(1) }
const th = await graph(`${video.video_id}/thumbnails?fields=uri,is_preferred`, 2)
const filas = (th.ok && th.data && th.data.data) || []
const mini = (filas.find((t) => t.is_preferred) || filas[0] || {}).uri
if (!mini) { console.error('Sin miniatura para el video.'); process.exit(1) }

// ── 2 y 3. Las variantes, todas con validate_only ────────────────────────────────────────────────
const base = (extra = {}) => ({
  page_id: spec.page_id,
  ...(spec.instagram_user_id ? { instagram_user_id: spec.instagram_user_id } : {}),
  video_data: {
    video_id: String(video.video_id),
    image_url: mini,
    message: 'ensayo del monitor · validate_only · no se crea nada',
    title: 'ensayo',
    call_to_action: { type: extra.cta || 'SHOP_NOW', value: { link: extra.destino || DESTINO } },
  },
})

const OPT_OUT = { enroll_status: 'OPT_OUT' }
const VARIANTES = [
  { nombre: 'A · destino y botón ELEGIDOS, sin mejoras', cuerpo: { object_story_spec: JSON.stringify(base()) } },
  { nombre: 'B · + url_tags', cuerpo: { object_story_spec: JSON.stringify(base()), url_tags: 'utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}' } },
  { nombre: 'C · botón LEARN_MORE', cuerpo: { object_story_spec: JSON.stringify(base({ cta: 'LEARN_MORE' })) } },
  {
    nombre: 'D · dof: catálogo OPT_OUT (product_extensions)',
    cuerpo: { object_story_spec: JSON.stringify(base()), degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: { product_extensions: OPT_OUT } }) },
  },
  {
    nombre: 'E · dof: catálogo + texto + mejoras individuales OPT_OUT',
    cuerpo: {
      object_story_spec: JSON.stringify(base()),
      degrees_of_freedom_spec: JSON.stringify({
        creative_features_spec: {
          product_extensions: OPT_OUT,
          text_optimizations: OPT_OUT,
          inline_comment: OPT_OUT,
          enhance_cta: OPT_OUT,
          image_brightness_and_contrast: OPT_OUT,
          video_auto_crop: OPT_OUT,
        },
      }),
    },
  },
  {
    nombre: 'F · dof: el campo OBSOLETO standard_enhancements (control: se espera rechazo)',
    cuerpo: { object_story_spec: JSON.stringify(base()), degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: { standard_enhancements: OPT_OUT } }) },
  },
  { nombre: 'G · destino FUERA de la tienda (control: ¿Meta lo frena o lo tiene que frenar el núcleo?)', cuerpo: { object_story_spec: JSON.stringify(base({ destino: 'https://example.com/' })) } },
]

linea('\n━━ 2 y 3. VARIANTES (validate_only) ━━')
for (const v of VARIANTES) {
  const r = await graphPost(`act_${CUENTA}/adcreatives`, { ...v.cuerpo, name: `ensayo validate_only · ${v.nombre}`, ...VALIDAR_SOLO })
  linea(`${r.ok ? '✅ ACEPTA ' : '⛔ RECHAZA'} · ${v.nombre}`)
  if (!r.ok) {
    const e = r.error || {}
    linea(`     code ${e.code} · subcode ${e.error_subcode} · ${e.error_user_title || ''} · ${e.error_user_msg || e.message || mensajeError(r)}`)
  } else {
    linea(`     ${corto(r.data)}`)
  }
}
