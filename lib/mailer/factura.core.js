/**
 * **La factura por mail al cliente mayorista** (`areben-mailer`, `POST /api/externo/factura`; Darío §5, Bruno 31-oct-2026).
 * Como el aviso interno (`aviso.core.js`): el Monitor ⛔ manda mails, los canaliza por Mailer con la MISMA llave
 * (`MAILER_TICKET_KEY`). Mailer arma el texto, la manda con el remitente verificado de la marca y respeta su gate.
 *
 * - sin `MAILER_URL`/`MAILER_TICKET_KEY` → `{ ok: false, configurado: false }`;
 * - Mailer contesta mal → `{ ok: false, configurado: true, motivo }`;
 * - salió → `{ ok: true, id, de }`.
 * 🔴 La llave va en el header y ⛔ en ningún texto de error.
 *
 * @param {{ url?: string, key?: string, fetch: typeof fetch }} mailer
 * @param {{ marca: string, para: string, comprobante: string, cliente: string, total: number, fecha: string, archivo: string, pdf: string }} factura
 */
export async function pedirFacturaPorMail(mailer, factura) {
  if (!mailer.url || !mailer.key) return { ok: false, configurado: false }
  try {
    const r = await mailer.fetch(`${mailer.url.replace(/\/+$/, '')}/api/externo/factura`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ticket-key': mailer.key },
      body: JSON.stringify(factura),
      signal: AbortSignal.timeout(25_000),
    })
    const d = await r.json().catch(() => null)
    if (r.status === 401) return { ok: false, configurado: true, motivo: 'Mailer rechazó la llave del Monitor' }
    if (r.status === 404) return { ok: false, configurado: true, motivo: 'Mailer todavía no tiene el envío de facturas (falta deployarlo)' }
    if (!d) return { ok: false, configurado: true, motivo: `Mailer contestó ${r.status}` }
    if (!d.ok) return { ok: false, configurado: true, motivo: String(d.error || `Mailer contestó ${r.status}`).slice(0, 300) }
    return { ok: true, id: String(d.id || ''), de: String(d.de || '') }
  } catch (e) {
    return { ok: false, configurado: true, motivo: e instanceof Error ? e.message : String(e) }
  }
}
