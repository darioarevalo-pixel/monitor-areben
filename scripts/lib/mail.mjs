/**
 * Mandar un mail desde un script. **Sin dependencia nueva**: la API de Resend por `fetch`.
 *
 * # Por qué así y no con una librería
 *
 * `nodemailer` o el SDK de Resend serían dos líneas menos y una dependencia más en un `npm ci` que
 * corre en cada cron. El repo ya evita eso donde puede (`next/og` en vez de una librería de
 * imágenes, `fetch` en vez de un cliente de Graph): son 25 líneas y no hay nada que actualizar.
 *
 * # 🔑 Las tres respuestas son DISTINTAS, y confundirlas es lo que apaga un aviso en silencio
 *
 * - **Sin `RESEND_API_KEY`** → `{ ok: false, configurado: false }`. ⛔ NO es un error: el mail no
 *   está configurado todavía. Quien llama lo dice en el log y **sigue en verde** — el trabajo del
 *   cron son los hallazgos, y romper la corrida entera por un rider sería peor que no mandarlo.
 * - **Con la key y el envío falla** → `{ ok: false, configurado: true, motivo }`. Eso SÍ es un
 *   problema y tiene que teñir el workflow de rojo: alguien pidió el mail y no llegó.
 * - **Mandado** → `{ ok: true, id }`.
 *
 * ⚠️ La diferencia entre las dos primeras es la misma de `ventana.core.js`: ausente ⛔ no es lo
 * mismo que roto, y tratarlas igual es lo que deja un aviso apagado sin que nadie se entere.
 *
 * # El remitente
 *
 * `onboarding@resend.dev` es el que Resend da sin verificar ningún dominio, y **sólo puede escribir
 * a la casilla dueña de la cuenta** — que para esto es exactamente la que queremos. El día que haya
 * que mandarle a alguien más, se verifica `arebensrl.com` en Resend (tres registros en Cloudflare,
 * donde Bruno es Super Admin) y se cambia `MAIL_DE`.
 */

const API = 'https://api.resend.com/emails'

export async function mandarMail({ para, asunto, texto, html }) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, configurado: false }
  const de = process.env.MAIL_DE || 'Monitor Areben <onboarding@resend.dev>'
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: de, to: [para], subject: asunto, text: texto, html }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d || !d.id) {
      // El mensaje real de Resend, que es el que dice si el problema es el dominio o la casilla.
      const detalle = (d && (d.message || d.error)) || `HTTP ${r.status}`
      return { ok: false, configurado: true, motivo: String(detalle).slice(0, 200) }
    }
    return { ok: true, id: d.id }
  } catch (e) {
    return { ok: false, configurado: true, motivo: e instanceof Error ? e.message : String(e) }
  }
}
