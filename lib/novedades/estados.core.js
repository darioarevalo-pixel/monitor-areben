/**
 * Los estados de una novedad. En `.js` plano porque los valida `api/_sistema.js`, y los handlers de
 * `api/*.js` corren en Node sin el compilador de Next (mismo motivo que `lib/permisos.core.js`).
 *
 *   borrador  — la escribí yo al terminar un cambio. Sólo la ve quien puede publicar.
 *   publicada — la ve el equipo, cuenta para el badge, y si es `importante` frena al entrar.
 *   archivada — vieja. Sale del listado principal y del cartel; queda en "Ver anteriores".
 *
 * Borrar borra de verdad (y se lleva las lecturas por cascade): una novedad mal redactada no tiene
 * por qué quedar dando vueltas.
 */

export const ESTADOS = ['borrador', 'publicada', 'archivada'];

export function esEstado(v) {
  return ESTADOS.includes(String(v));
}

/**
 * Las que todavía no leyó esta persona, en la versión que tienen HOY.
 *
 * Se compara contra la versión y no contra el id: si una novedad se corrigió y se le subió la
 * versión, la lectura vieja sigue guardada pero ya no cuenta como leída. Es lo que permite volver
 * a mostrar algo sin borrar el registro de que se había leído antes.
 *
 * ⚠️ Deja afuera las que no son para esta persona (`paraMi === false`, que lo decide el servidor:
 * ver `destino.core.js`). Sin eso, quien publica —que recibe la lista entera para administrarla—
 * tendría el badge encendido por novedades que mandó a otro grupo. Las que no traen `paraMi`
 * cuentan: es lo que devolvía el endpoint antes de que existieran los destinos.
 */
/**
 * Las que se dan por leídas con sólo abrir la sección Novedades.
 *
 * 🔴 **Las importantes NO entran, y ése es todo el punto.** Sin esta excepción, el circuito se
 * comía a sí mismo: el badge lleva a Novedades, la sección marcaba TODO como leído al abrirse, y
 * entonces la importante quedaba leída sin que nadie hubiera visto el cartel. O sea que el cartel
 * que bloquea no se disparaba **nunca** para quien entra por el badge — que es por donde entra todo
 * el mundo. Lo cazó la primera prueba en vivo, no los tests.
 *
 * Una importante se marca leída de una sola forma: apretando «Entendido» en el cartel. Eso es lo
 * que significa que corte — es un acuse, no un "vi el título en una lista".
 */
export function seMarcanAlEntrar(novedades) {
  return (novedades || []).filter(
    (n) => n.estado === 'publicada' && n.paraMi !== false && !n.importante,
  );
}

export function sinLeer(novedades, leidas) {
  const vistas = new Set((leidas || []).map((l) => `${l.novedad_id}|${l.version}`));
  return (novedades || []).filter(
    (n) => n.estado === 'publicada' && n.paraMi !== false && !vistas.has(`${n.id}|${n.version}`),
  );
}
