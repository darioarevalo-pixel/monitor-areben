/**
 * Las ventas **técnicas** del propio Monitor. **LA** implementación.
 *
 * Sesión de Fotos y Fallas crean una venta en Gestión Nube para descontar stock: no son ventas y no
 * tienen que entrar en ninguna analítica. El ETL las saca del payload entero (`lib/datos.ts:258`),
 * así que todo lo que mira el navegador ya vive sin ellas.
 *
 * **Se identifican en positivo, nunca por ausencia de dato.** Un `channel` vacío es «no sabemos el
 * canal», no «es técnica»: si GN dejara de mandar el campo en una tanda, un criterio por ausencia
 * borraría ventas reales sin que nadie se entere.
 *
 * El texto sirve para las dos marcas; el `channel_id` cubre BDI por las dudas. Medido contra los
 * fixtures reales el 9-ago-2026: en BDI los dos criterios coinciden exactamente (15 y 15), y Zattia
 * no expone `channel_id`, así que ahí manda el texto (37 ventas).
 *
 * ⚠️ `canalDe` (`lib/liquidacion/canal.core.js`) **no** usa esto, y está bien: ahí la pregunta es
 * otra —«¿este canal cuenta para el precio promedio minorista?»— y para eso el canal desconocido se
 * descarta a propósito. Son dos preguntas distintas, no dos copias de la misma.
 *
 * # Por qué es `.js`
 *
 * Se mudó acá el 18-ago-2026, cuando `api/_norte.js` tuvo que calcular la contribución por canal:
 * el servidor **tiene que sacar las mismas ventas que el ETL saca**, o el ritmo en unidades y la
 * plata quedan medidos sobre poblaciones distintas y su multiplicación es un número que no existe.
 * Los handlers de `api/` corren en Node sin pasar por el compilador de Next y no pueden importar
 * TypeScript; `lib/etl/helpers.ts` es el re-export tipado.
 */
export function esVentaTecnica(v) {
  return v.channel === 'Ninguno' || Number(v.channel_id) === 12
}
