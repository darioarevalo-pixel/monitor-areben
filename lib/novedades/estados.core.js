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
 */
export function sinLeer(novedades, leidas) {
  const vistas = new Set((leidas || []).map((l) => `${l.novedad_id}|${l.version}`));
  return (novedades || []).filter(
    (n) => n.estado === 'publicada' && !vistas.has(`${n.id}|${n.version}`),
  );
}
