/**
 * **Un aviso interno por Mailer** (`areben-mailer`, `POST /api/externo/aviso`; Darío, 12-oct-2026).
 * 🔑 El Monitor ⛔ manda mails: los canaliza por Mailer, igual que el ticket de la Caja
 * (`lib/caja/ticket-mail.core.js`), con la MISMA llave (`MAILER_TICKET_KEY`) — ⛔ hay una llave nueva
 * que cargar. Mailer sólo acepta casillas `@arebensrl.com` y respeta su gate de envío.
 *
 * Tres respuestas distintas, como `scripts/lib/mail.mjs`:
 * - sin `MAILER_URL`/`MAILER_TICKET_KEY` → `{ ok: false, configurado: false }` (⛔ es un error del pedido);
 * - Mailer contesta mal → `{ ok: false, configurado: true, motivo }`;
 * - salió a alguien → `{ ok: true, enviados, fallas }` (puede salir a uno y fallar con otro).
 * 🔴 La llave va en el header y ⛔ en ningún texto de error.
 *
 * @param {{ url?: string, key?: string, fetch: typeof fetch }} mailer
 * @param {{ para: string[], asunto: string, html: string, texto: string }} aviso
 */
export async function pedirAvisoInterno(mailer, aviso) {
  if (!mailer.url || !mailer.key) return { ok: false, configurado: false }
  try {
    const r = await mailer.fetch(`${mailer.url.replace(/\/+$/, '')}/api/externo/aviso`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ticket-key': mailer.key },
      body: JSON.stringify(aviso),
      signal: AbortSignal.timeout(20_000),
    })
    const d = await r.json().catch(() => null)
    if (r.status === 401) return { ok: false, configurado: true, motivo: 'Mailer rechazó la llave del Monitor' }
    if (!d) return { ok: false, configurado: true, motivo: `Mailer contestó ${r.status}` }
    const fallas = Array.isArray(d.fallas) ? d.fallas.map((f) => `${f.para}: ${f.motivo}`) : []
    if (!d.ok) return { ok: false, configurado: true, motivo: String(d.error || fallas.join(' · ') || `Mailer contestó ${r.status}`).slice(0, 400) }
    return { ok: true, enviados: (d.enviados || []).map((e) => e.para), fallas }
  } catch (e) {
    return { ok: false, configurado: true, motivo: e instanceof Error ? e.message : String(e) }
  }
}
