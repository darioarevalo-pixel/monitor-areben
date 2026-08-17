/**
 * Las ofertas que quedaron colgadas: precio de sale escrito en Gestión Nube que ya no tiene campaña
 * viva que lo justifique.
 *
 * En `.js` plano porque lo arma `api/_liquidacion.js`, y los handlers de `api/*.js` corren en Node
 * sin pasar por el compilador de Next: no pueden importar TypeScript. `lib/liquidacion/colgadas.ts`
 * es el re-export tipado que usa la pantalla. Misma forma que `bitacora.core.js` y `cola.core.js`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 EL RIESGO: SE VENDE AL PRECIO DEL SALE DESPUÉS DEL SALE, Y NADIE LO DICE
 *
 * Una oferta escrita en Gestión Nube no vence sola: se la saca alguien. Mientras esté puesta, la
 * tienda cobra ese precio. Lo pidió Bruno el 16-ago-2026 pensando en el agotado que vuelve con
 * stock en septiembre con el precio de agosto todavía puesto.
 *
 * 🔑 **Medido el 17-ago-2026, el caso que él imaginaba no es el que muerde.** El botón «sacar» de la
 * campaña barre TODOS los ítems en estado `aplicado` (`pidsPorAplicar`), agotados incluidos: levantar
 * el sale no deja al agotado con su oferta. Lo que sí queda colgado es otra cosa, y son tres:
 *
 *  1. **Fuera del alcance del botón.** El producto se quitó de la campaña, o la campaña se borró,
 *     después de tener el precio escrito. La bitácora conserva el evento —por eso se lee de acá— pero
 *     ya no hay ítem `aplicado` que sacar: el botón no lo va a alcanzar nunca más. Es el peor de los
 *     tres porque no se arregla desde el Monitor.
 *  2. **La campaña ya no está viva** (`cerrada`, vuelta a `borrador`, o borrada).
 *  3. **La vigencia venció** y las ofertas siguen puestas: el caso de olvidarse de levantar el sale.
 *
 * ⛔ **No alcanza con mirar el estado de la campaña.** Sacar la última oferta la devuelve a
 * `en_curso`, que es un estado vivo: una campaña que se levantó bien y una que nadie levantó se ven
 * igual desde ahí. Por eso la fecha entra como tercer motivo.
 *
 * 🔑 **El stock parte la lista en dos, no la filtra.** Con stock, la prenda se está vendiendo barata
 * ahora mismo. Sin stock, la oferta está latente y muerde el día que se repone — que es exactamente
 * el caso que Bruno describió. Esconder las latentes sería esperar a que el problema aparezca.
 */

/** Los estados en que una campaña todavía justifica que haya precios puestos en la tienda. */
export const ESTADOS_VIVA = ['en_curso', 'aplicada'];

/**
 * Por qué esta oferta no debería seguir puesta. El orden es de peor a menos peor y es el que decide
 * cuál se muestra cuando valen dos.
 */
export const MOTIVOS = ['fuera-de-alcance', 'campania-cerrada', 'vigencia-vencida'];

/**
 * @param {Array<{pid:string, producto:string, sku:string|null, liqId:string, liqNombre:string, precioA:number|null, cuando:string}>} eventos
 *   El ÚLTIMO movimiento de cada producto. Quien consulta ordena y desduplica: acá llega uno por pid.
 *   `precioA` es lo que quedó puesto; `null` = quedó a precio de lista y no hay nada colgado.
 * @param {Record<string, {nombre:string, estado:string, hasta:string|null}>} campanias  Por id.
 * @param {Record<string, boolean>} aplicadosHoy  pid → está hoy como `aplicado` en alguna campaña.
 * @param {Record<string, number>} stockPorPid    pid → unidades hoy.
 * @param {string} hoy  `YYYY-MM-DD`. Entra por parámetro: esto no lee el reloj.
 */
export function ofertasColgadas(eventos, campanias, aplicadosHoy, stockPorPid, hoy) {
  const colgadas = [];
  for (const ev of eventos || []) {
    if (ev.precioA == null) continue; // quedó a precio de lista: no hay oferta puesta
    const camp = (campanias || {})[ev.liqId] || null;

    const motivo = !(aplicadosHoy || {})[ev.pid]
      ? 'fuera-de-alcance'
      : !camp || !ESTADOS_VIVA.includes(camp.estado)
        ? 'campania-cerrada'
        : camp.hasta && camp.hasta < hoy
          ? 'vigencia-vencida'
          : null;
    if (!motivo) continue;

    colgadas.push({
      pid: ev.pid,
      producto: ev.producto,
      sku: ev.sku,
      liqId: ev.liqId,
      // El nombre se lee de la campaña si existe y si no del evento, que lo lleva copiado justamente
      // para poder leerse cuando la campaña ya no está.
      liqNombre: (camp && camp.nombre) || ev.liqNombre || '',
      precio: Number(ev.precioA),
      cuando: ev.cuando,
      motivo,
      stock: Number((stockPorPid || {})[ev.pid] || 0),
      // Sólo al `aplicado` de una campaña que existe lo alcanza el botón «sacar» de la campaña. Al
      // resto hay que ir a sacarle la oferta a mano en Gestión Nube, y la pantalla tiene que decirlo
      // en vez de ofrecer un botón que va a contestar «no está en la campaña».
      seSacaDesdeAca: motivo !== 'fuera-de-alcance' && !!camp,
    });
  }

  // Primero lo que se está vendiendo barato ahora, y de eso lo que más unidades tiene.
  colgadas.sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0) || b.stock - a.stock);
  return {
    colgadas,
    conStock: colgadas.filter((c) => c.stock > 0).length,
    sinStock: colgadas.filter((c) => c.stock <= 0).length,
  };
}
