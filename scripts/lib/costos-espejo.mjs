/**
 * ¿El token de Gestión Nube puede ver los costos, o los estamos borrando sin saberlo?
 *
 * # El defecto que existe para tapar
 *
 * Los cuatro scripts de sync mapeaban el costo así:
 *
 *     unit_cost: p.unit_cost ?? null
 *
 * 🔴 🔑 **Eso convierte «el token no puede ver este campo» en «este producto no tiene costo»** — sin
 * un error, sin un log, sin nada. El sync corre, termina en verde, y el upsert pisa el espejo con
 * NULL. Sobrevivió meses en BDI: medido el 24-ago-2026, **450 productos y 0 con `unit_cost`**,
 * mientras Gestión Nube devuelve el costo con valor en 50 de 50 con los tokens locales. Lo único
 * distinto es que el token de GitHub Actions no tiene `costs:read`.
 *
 * 🔑 **Un cero afirma, y un NULL de golpe en toda la tabla afirma más fuerte todavía**: sostuvo una
 * ficha entera que explicaba la ausencia con una causa inventada.
 *
 * # Por qué el criterio es «NINGUNO», y no «pocos»
 *
 * Cuando el token tiene el permiso, Gestión Nube manda el campo en **todos** los productos (con
 * valor 0 en los que no tienen costo cargado — que en Zattia son 769 de 2.676). Cuando no lo tiene,
 * no lo manda en **ninguno**. La falla es de todo o nada, así que un umbral («menos del 10 %») sería
 * un número inventado que además podría disparar con un catálogo legítimamente sin costos.
 *
 * # ⛔ Por qué no alcanza con correr el sync a mano
 *
 * Correr el script local con el token bueno escribe los costos y **la corrida de las 06:00 del día
 * siguiente los borra**. Un arreglo que dura 18 horas. El arreglo de verdad son dos: el secret
 * `GN_TOKEN` de GitHub (manos de Bruno) y esto, que es lo que hace que no vuelva a pasar callado.
 */

/**
 * Mira los productos que bajaron de Gestión Nube y decide si el costo es legible.
 *
 * @param rows productos crudos de GN
 * @returns `{ total, conCosto, legible, problema }` — `problema` es `null` cuando está todo bien.
 */
export function revisarCostos(rows) {
  const filas = rows || [];
  const total = filas.length;
  // `!= null` a propósito: descarta `null` y `undefined` y **deja pasar el 0**, que es un costo
  // real y cargado. Un `?.` o un truthy acá volvería a confundir «no tiene costo» con «no lo veo».
  const conCosto = filas.filter((p) => p && p.unit_cost != null).length;
  const legible = total === 0 || conCosto > 0;

  return {
    total,
    conCosto,
    legible,
    problema: legible ? null : `costos: Gestión Nube no mandó \`unit_cost\` en NINGUNO de los `
      + `${total} productos. Eso no es «no tienen costo»: es un token sin permiso \`costs:read\`. `
      + `El costo NO se escribió, para no pisar el espejo con NULL. Revisar el secret GN_TOKEN.`,
  };
}

/**
 * Saca `unit_cost` de las filas cuando el token no lo puede ver.
 *
 * 🔴 **Es todo o nada, y no por prolijidad**: PostgREST arma el INSERT con las claves de las filas,
 * así que si unas la traen y otras no, las que faltan se escriben NULL igual — que es exactamente
 * el defecto. Sacarla de **todas** deja la columna fuera del INSERT, y entonces el
 * `ON CONFLICT DO UPDATE` no la toca y el espejo conserva lo que ya tenía.
 *
 * ⚠️ Cuando el costo **sí** es legible no se toca nada: ahí un `unit_cost` nulo de un producto
 * suelto es un dato de verdad («este producto no tiene costo cargado») y tiene que poder escribirse.
 */
export function sinCostoSiNoSeVe(productos, legible) {
  if (legible) return productos;
  return (productos || []).map((p) => {
    const { unit_cost: _omitido, ...resto } = p;
    return resto;
  });
}
