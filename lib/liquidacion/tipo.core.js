/**
 * Qué clase de cambio de precio es una campaña. JS plano porque lo valida `api/_liquidacion.js`, y
 * los handlers no pueden importar TypeScript (misma forma que `lib/permisos.ts` sobre
 * `lib/permisos.core.js`). Los rótulos, que son de pantalla, viven en `tipos.ts`.
 *
 * 🔑 **La lista vive en un solo lado a propósito.** El handler tiene que rechazar un tipo inventado
 * —`datos` es jsonb y ahí entra cualquier cosa que no se valide— y la pantalla tiene que ofrecer
 * exactamente los mismos: dos listas se separan el día que se agregue el cuarto.
 */

export const TIPOS_CAMPANIA = ['liquidacion', 'promo', 'ajuste']

/**
 * El tipo de una campaña, con el default de las que nacieron antes del campo.
 *
 * Las campañas creadas hasta agosto de 2026 no traen `tipo` y eran todas liquidaciones: leerlas
 * como tal no es una suposición, es lo que la sección hacía.
 */
export function tipoDe(c) {
  const t = c && c.tipo
  return TIPOS_CAMPANIA.includes(t) ? t : 'liquidacion'
}
