/**
 * Mandar un mail desde un script. Va por **Amazon SES**, que es lo que la empresa ya usa.
 *
 * 📌 La firma, el porqué de SES y el porqué de no usar el SDK: `scripts/lib/ses.mjs`.
 *
 * # 🔑 Las tres respuestas son DISTINTAS, y confundirlas es lo que apaga un aviso en silencio
 *
 * - **Sin credenciales** → `{ ok: false, configurado: false }`. ⛔ NO es un error: el mail no está
 *   prendido todavía. Quien llama lo dice en el log y **sigue en verde** — el trabajo del cron son
 *   los hallazgos, y romper la corrida entera por un rider sería peor que no mandarlo.
 * - **Con credenciales y el envío falla** → `{ ok: false, configurado: true, motivo }`. Eso SÍ tiene
 *   que teñir el workflow de rojo: alguien pidió el mail y no llegó.
 * - **Mandado** → `{ ok: true, id }`.
 *
 * ⚠️ Es la misma distinción de `ventana.core.js`: **ausente ⛔ no es lo mismo que roto**, y tratarlas
 * igual es lo que deja un aviso apagado sin que nadie se entere. 🔑 **Este contrato sobrevivió al
 * cambio de proveedor**: se escribió para Resend y no se tocó una línea al pasar a SES — es la señal
 * de que la decisión estaba del lado correcto de la frontera.
 *
 * # El remitente
 *
 * `bdiaccesorios.com.ar` está verificado como DOMINIO en SES y con DKIM andando —lo calienta el
 * mailer todos los días—, así que la entrega está probada. ⛔ **No se manda desde
 * `@arebensrl.com`**: ahí SES tiene verificada la CASILLA y no el dominio, o sea que saldría sin
 * DKIM propio y con la alineación de DMARC floja — a un buzón de Workspace, eso es la carpeta de
 * spam. `monitor@` deja claro de entrada que ⛔ no es un mail de una tienda.
 */

import { pedirSes } from './ses.mjs'

const DE = 'Monitor Areben <monitor@bdiaccesorios.com.ar>'

export async function mandarMail({ para, asunto, texto, html }) {
  const region = process.env.AWS_REGION || 'us-east-1'
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return { ok: false, configurado: false }

  try {
    const { status, cuerpo } = await pedirSes({
      region,
      accessKeyId,
      secretAccessKey,
      metodo: 'POST',
      ruta: '/v2/email/outbound-emails',
      cuerpo: {
        FromEmailAddress: process.env.SES_FROM || DE,
        Destination: { ToAddresses: [para] },
        // 🔴 SIN `ConfigurationSetName`. El del mailer (`areben-mailer`) alimenta sus métricas de
        // entregabilidad y sus eventos de SNS: meter un mail interno ahí adentro le ensucia los
        // números al producto con un destinatario que no es un cliente.
        Content: {
          Simple: {
            Subject: { Data: asunto, Charset: 'UTF-8' },
            Body: {
              Html: { Data: html, Charset: 'UTF-8' },
              Text: { Data: texto, Charset: 'UTF-8' },
            },
          },
        },
      },
    })
    if (status < 200 || status >= 300 || !cuerpo || !cuerpo.MessageId) {
      // El mensaje real de SES: es el que dice si el problema es la identidad, la cuota o la firma.
      const detalle = (cuerpo && (cuerpo.message || cuerpo.Message || cuerpo.__type)) || `HTTP ${status}`
      return { ok: false, configurado: true, motivo: String(detalle).slice(0, 200) }
    }
    return { ok: true, id: cuerpo.MessageId }
  } catch (e) {
    return { ok: false, configurado: true, motivo: e instanceof Error ? e.message : String(e) }
  }
}
