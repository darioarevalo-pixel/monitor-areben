/**
 * A qué canal se fue una unidad, por el nombre del canal en Gestión Nube. **LA** implementación.
 *
 * # Por qué es `.js` y no vive en `resultado.ts`
 *
 * Mismo motivo que `lib/permisos.core.js` y `lib/meta-ads/rentabilidad.core.js`: los handlers de
 * `api/*.js` corren en Node sin pasar por el compilador de Next y no pueden importar TypeScript.
 * `api/_norte.js` necesita clasificar el canal para calcular la contribución, y
 * `lib/liquidacion/resultado.ts` es el re-export tipado que usa la app.
 *
 * La mudanza estaba escrita de antemano: `scripts/medir-economia-bdi.mjs` tenía una copia con el
 * comentario «si esta clasificación entra alguna vez a un handler, hay que mudarla antes a un
 * `.core.js` que las dos importen». Entró el 18-ago-2026, y se mudó.
 */

/**
 * El canal por su nombre en Gestión Nube. Los de las dos marcas hoy son
 * `Mi Local | Mayorista | Tienda Nube | Minorista | Otro Canal | Ninguno`.
 *
 * Se compara por texto y no por `channel_id` porque Zattia no expone el id — el mismo criterio que
 * usa Reposición para partir local/online.
 *
 * ⚠️ **Esto NO es una copia de `esVentaTecnica` y no hay que unificarlas.** Acá el canal vacío cae
 * en `tecnica` a propósito: la pregunta de esta función es "¿esta unidad cuenta para el precio
 * promedio minorista?", y un canal desconocido no debería mover ese promedio. `esVentaTecnica`
 * contesta otra —"¿la creó el Monitor para descontar stock?"— y ahí el dato faltante tiene que
 * seguir siendo una venta real, para no borrar ventas en silencio si GN deja de mandar el campo.
 * Medido el 9-ago-2026 sobre los fixtures de las dos marcas: hoy no existe ninguna venta con el
 * canal vacío, así que la diferencia todavía no cambia ningún número.
 */
export function canalDe(nombre) {
  const n = (nombre || '').toLowerCase()
  if (!n || n === 'ninguno') return 'tecnica'
  if (n.includes('mayorista')) return 'mayorista'
  if (n.includes('local') || n.includes('minorista')) return 'local'
  if (n.includes('tienda') || n.includes('nube') || n.includes('online')) return 'online'
  return 'otro'
}

/**
 * Los canales que `canalDe` puede devolver. **El vocabulario, en un solo lugar.**
 *
 * Existe desde que las metas de Norte se guardan con un canal: sin esta lista el handler tendría
 * que llevar su propia copia, y una copia vieja acepta un canal que el motor no sabe medir — la
 * meta queda muda para siempre y nada avisa.
 */
export const CANALES = ['local', 'online', 'mayorista', 'tecnica', 'otro'];

/**
 * Cómo se llama cada canal **en la pantalla**. El rótulo, en un solo lugar.
 *
 * 🔑 **Estaba escrito en el JSX de una pantalla** (`components/mkt-ventas/VentaGeneral.tsx`) y por
 * eso cubría sólo tres de los cinco: el día que la serie diaria tuvo que dibujar el cuarto, no
 * había de dónde sacarle el nombre. Un canal sin rótulo no se dibuja mal — **desaparece**, y sus
 * ventas se leen como si no existieran.
 *
 * ⚠️ **`otro` dice «Otros canales» y no un nombre propio a propósito**: adentro cae lo que
 * `canalDe` no reconoce, que hoy en BDI es *Mercadolibre* (13 ventas y $195.644 en 37 días, medido
 * el 23-ago-2026) y *Otro Canal*. Quien lo mire tiene que poder preguntar **cuáles son**, así que
 * la pantalla que use este rótulo muestra al lado los nombres crudos que cayeron adentro.
 *
 * ⚠️ **`tecnica` no es una venta.** Sesión de fotos, Fallas y los canjes crean una venta en Gestión
 * Nube para descontar stock (`lib/etl/tecnica.core.js`), y todo el monitor las excluye. El rótulo
 * existe igual porque **un canal vacío también cae acá**: el día que Gestión Nube deje de mandar el
 * campo, esas ventas tienen que aparecer con nombre y no evaporarse.
 */
export const ETIQUETA_CANAL = {
  online: 'Online',
  local: 'Local',
  mayorista: 'Mayorista',
  otro: 'Otros canales',
  tecnica: 'Sin canal / técnicas',
};
