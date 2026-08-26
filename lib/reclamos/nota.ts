/**
 * La NOTA de una **venta técnica** de post-venta: la que saca del stock de Gestión Nube una unidad
 * que no se está vendiendo.
 *
 * # Por qué existe
 *
 * Es el mismo problema que ya resolvió `notaTnImport` para el sync de Tienda Nube, y por eso copia
 * su mecanismo: **todas estas ventas se atribuyen al mismo cliente genérico de GN** —«Reclamo»,
 * «Falla», «Cambio»— así que `client_name` dice siempre lo mismo y no distingue un caso de otro.
 * La nota es el ÚNICO lugar donde sobreviven de qué reclamo salió, de qué orden, quién era el
 * cliente de verdad y por qué esa unidad dejó de estar en stock.
 *
 * Sin eso, quien abre la venta en GN —un conteo que no cierra, una revisión de la caja— ve una
 * venta en $0 a nombre de «Reclamo BDI» y **tiene que preguntarle a alguien**.
 *
 * # Qué campos lleva (la lista que faltaba)
 *
 * Bruno lo dejó dicho como *«la nota llevando TODA la información»*. Volverlo una lista es esto,
 * y el orden es el que importa porque los topes son POR CAMPO y el primero es el último que se
 * pierde:
 *
 * 1. **el número de reclamo y qué salida es** — la llave del caso y por qué salió del stock;
 * 2. **la orden de Tienda Nube** — cómo se vuelve a la venta real;
 * 3. **el cliente de verdad** — el que GN no puede decir;
 * 4. **el motivo del reclamo**, con su detalle;
 * 5. **la solicitud de envío (EM)**, cuando hay paquete saliendo;
 * 6. **quién lo decidió** en el Monitor;
 * 7. el sello `(Monitor)`, que la distingue de una cargada a mano.
 *
 * ⛔ **Los productos NO van en la nota**: son los renglones de la venta, y repetirlos gastaría el
 * lugar de lo que GN no puede mostrar de ninguna otra forma.
 *
 * # Por qué acá y no en un `.core.js`
 *
 * `lib/sync-tn/nota.core.js` está en JS plano porque la escribe `api/crear-venta.js`, que corre en
 * Node sin pasar por el compilador. Ésta la arma **siempre el navegador** y viaja en el cuerpo del
 * pedido, así que no tiene ese motivo — y sí gana en que el tipo de `ReclamoRow` la controle.
 * De ahí se reusa `recorte`, ⛔ no se copia: ya pasó en este repo que dos copias de un helper
 * dejaran los tests en verde mirando cada una la suya.
 */

import { recorte } from '@/lib/sync-tn/nota.core.js'
import { MOTIVO_LABEL, etiquetaEM, numeroReclamo } from './tipos'
import type { ReclamoRow } from './tipos'

/**
 * Las cuatro formas en que una unidad sale del stock por post-venta. Son **cuatro ventas técnicas
 * distintas** y la nota tiene que decir cuál es: las dos primeras salen a nombre del cliente
 * RECLAMO y las otras dos al de FALLA y al de CAMBIO.
 */
export type SalidaTecnica = 'regalada' | 'reemplazo' | 'falla' | 'cambio'

/**
 * En criollo y en la voz de quien la va a leer en GN, que no es quien apretó el botón.
 *
 * 🔑 `regalada` y `falla` dicen explícitamente el estado del producto porque **ésa es la diferencia
 * que se perdía**: hasta el 26-ago-2026 las dos salían por el mismo camino y una unidad impecable
 * terminaba anotada como falla.
 */
const QUE_SALIO: Record<SalidaTecnica, string> = {
  regalada: 'se lo queda el cliente (producto sano)',
  reemplazo: 'reemplazo que se le manda al cliente',
  falla: 'la unidad volvió fallada',
  cambio: 'lo que se lleva el cliente en el cambio',
}

/** Lo mínimo que la nota necesita del reclamo. Un `Pick` para que la pueda armar también un cambio. */
export type DatosNota = Pick<ReclamoRow, 'id'> &
  Partial<Pick<ReclamoRow, 'numero' | 'orden_tn' | 'cliente' | 'motivo' | 'motivo_detalle' | 'solicitud_envio'>>

/**
 * @param ctx.usuario Quien apretó el botón en el Monitor. Sin esto la venta no tiene autor: el
 *   usuario de la API de Gestión Nube es siempre el mismo.
 * @param ctx.barcode La etiqueta del depósito de fallas, cuando la unidad entró al ledger. Es
 *   cómo se la encuentra **físicamente**, y por eso viaja sólo en la salida `falla`.
 *
 * Los topes son **por campo** para que un nombre absurdo o un detalle largo no se coma a los demás
 * datos. Con estos, la nota más larga posible da ~270 caracteres — bien abajo del recorte a 500 de
 * `api/crear-venta.js`, que ⛔ no se toca: es la red, no el mecanismo.
 */
export function notaVentaTecnica(
  salida: SalidaTecnica,
  d: DatosNota,
  ctx?: { usuario?: string | null; barcode?: string | null },
): string {
  const numero = recorte(d.numero || numeroReclamo(d.id), 12)
  const motivo = d.motivo ? MOTIVO_LABEL[d.motivo] : ''
  const detalle = recorte(d.motivo_detalle, 40)
  const em = recorte(etiquetaEM(d.solicitud_envio), 20)
  const barcode = salida === 'falla' ? recorte(ctx?.barcode, 24) : ''
  const usuario = recorte(ctx?.usuario, 30)
  return [
    `Reclamo ${numero} — ${QUE_SALIO[salida]}`,
    recorte(d.orden_tn, 20) && `Orden TN: ${recorte(d.orden_tn, 20)}`,
    recorte(d.cliente, 60) && `Cliente: ${recorte(d.cliente, 60)}`,
    motivo && `Motivo: ${recorte(motivo, 40)}${detalle ? ` — ${detalle}` : ''}`,
    em,
    barcode && `Etiqueta: ${barcode}`,
    usuario && `Decidió: ${usuario}`,
    '(Monitor)',
  ]
    .filter(Boolean)
    .join(' · ')
}
