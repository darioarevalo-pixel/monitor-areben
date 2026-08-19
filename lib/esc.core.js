/**
 * El escape de HTML, en JS plano. Copiado literal del legacy (index.html:3075) — de él
 * depende la paridad BYTE-IDÉNTICA de la tabla de talles contra lo que ya está pegado en
 * las descripciones de TiendaNube. ⛔ No tocar.
 *
 * 🔑 Por qué vive acá y no adentro de `lib/gen-talles/core.ts`: lo necesitan las dos puntas
 * que arman HTML para TiendaNube —la tabla de talles y la prosa de Redacción— y la de
 * Redacción termina en `api/_tn-desc.js`, un handler que corre en Node sin pasar por el
 * compilador de Next y **no puede importar TypeScript** (el mismo motivo de
 * `lib/permisos.core.js` y `lib/tn-desc/formato.core.js`). Una sola implementación: copiarlo
 * sería tener dos escapes distintos escribiendo en el mismo campo.
 */
export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
