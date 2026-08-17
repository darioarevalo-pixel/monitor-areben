/**
 * La cola de reetiquetado: qué prenda hay que volver a etiquetar.
 *
 * `.js` plano porque la arma `api/_liquidacion.js`, y los handlers de `api/*.js` corren en Node sin
 * pasar por el compilador de Next: no pueden importar TypeScript. `lib/etiquetas/cola.ts` es el
 * re-export tipado que usa la pantalla. Misma forma que `permisos.core.js` / `permisos.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * 🔑 LA ETIQUETA LA DISPARA EL CAMBIO DE PRECIO, NO LA CAMPAÑA
 *
 * Hasta acá la lista de «qué etiquetar» la daba una campaña de liquidación, y eso dejaba afuera
 * todo lo que no fuera un sale: una promo puntual de tres productos, un ajuste de precio suelto y
 * —el peor— **el día que se levanta el sale**. Ahí los ítems vuelven de `aplicado` a `confirmado` y
 * la pantalla mostraba CERO justo cuando hay 260 prendas para rehacer a precio de lista.
 *
 * Acá la pregunta es otra y no nombra la liquidación: **¿a esta prenda le cambió el precio después
 * de la última vez que la dimos por etiquetada?**
 */

/**
 * Cuánto stock hace falta para que valga la pena etiquetar. Cero.
 *
 * 🔑 **El agotado sale de la cola, pero eso NO lo borra del mapa.** Sin stock no hay prenda que
 * etiquetar y la caminata no existe; lo decidió Bruno el 16-ago-2026. Lo que se queda **con** stock
 * y sin etiquetar es otra cosa: es una prenda que puede no estar exhibida, y ése es el destino de
 * `sinEtiquetar()`, no la basura.
 *
 * ⛔ **No hay corte por tiempo, a propósito.** Un plazo («a los 30 días sale sola») limpia la
 * pantalla escondiendo al rezagado: desaparece sin que nadie haya decidido nada.
 */
export const STOCK_MINIMO = 0;

/**
 * Arma la cola.
 *
 * @param {Array<{pid:string, producto:string, sku:string|null, cuando:string, precioA:number|null, precioLista:number|null, liqNombre:string|null, modo:string}>} eventos
 *   Los cambios de precio, **el último de cada producto**. Quien consulta los ordena y desduplica:
 *   acá llega uno por pid.
 * @param {Record<string, string>} impresasPorPid  pid → ISO de la última vez que se dio por hecha.
 * @param {Record<string, number>} stockPorPid     pid → unidades hoy.
 */
export function armarCola(eventos, impresasPorPid, stockPorPid) {
  const pendientes = [];
  const hechas = [];
  const sinStock = [];
  for (const ev of eventos || []) {
    const stock = Number((stockPorPid || {})[ev.pid] || 0);
    const impresaEn = (impresasPorPid || {})[ev.pid] || null;
    // 🔑 Estrictamente MAYOR: una impresión y un cambio de precio en el mismo instante quieren decir
    // que se imprimió con el precio nuevo. Con `>=` una prenda etiquetada al segundo de aplicarle el
    // precio volvería a la cola para siempre.
    const alDia = impresaEn != null && Date.parse(impresaEn) >= Date.parse(ev.cuando);
    const fila = { ...ev, stock, impresaEn, alDia };
    if (alDia) hechas.push(fila);
    else if (!(stock > STOCK_MINIMO)) sinStock.push(fila);
    else pendientes.push(fila);
  }
  // Lo más viejo primero: es lo que más tiempo lleva con el cartel equivocado colgando.
  pendientes.sort((a, b) => Date.parse(a.cuando) - Date.parse(b.cuando));
  return { pendientes, hechas, sinStock };
}

/**
 * Lo que quedó con stock y sin etiquetar: candidatos a **no exhibido**.
 *
 * Lo trajo Bruno el 16-ago-2026 y da vuelta el sentido del resto de la cola: *«si está en depósito y
 * no se etiqueta, puede levantar un problema de no exhibido»*. Una prenda con stock a la que nadie
 * le hizo la etiqueta después de N días no es un olvido administrativo — es una prenda que
 * probablemente no está colgada en el salón.
 *
 * ⚠️ **El umbral no es la verdad, es cuándo vale la pena preguntar.** Una prenda que cambió de
 * precio hace dos horas y no se etiquetó no dice nada: recién se hizo.
 */
export function sinEtiquetar(pendientes, ahoraMs, diasParaSospechar = 3) {
  const corte = ahoraMs - diasParaSospechar * 86400000;
  return (pendientes || []).filter((p) => Date.parse(p.cuando) < corte);
}

/** Qué precio quedó puesto en el último movimiento. `null` = quedó a precio de lista. */
export function precioQueQuedo(ev) {
  return ev && ev.precioA != null ? Number(ev.precioA) : null;
}

/** Dos precios son el mismo si redondean al mismo peso: la etiqueta no imprime centavos. */
function mismoPrecio(a, b) {
  if (a == null || b == null) return a == null && b == null;
  return Math.round(Number(a)) === Math.round(Number(b));
}

/**
 * Las prendas cuya etiqueta **dice otro número del que se paga hoy**.
 *
 * 🔴 **Cierra el agujero de la regla por fechas.** Comparar «¿cambió el precio después de
 * etiquetarla?» contra `liquidacion_bitacora` sólo ve lo que escribe el Monitor —el precio
 * promocional— y **deja afuera el precio de lista**, que se carga a mano en Gestión Nube y no deja
 * rastro. Se corregía una lista, la etiqueta quedaba mal, y ninguna pantalla lo decía. Lo preguntó
 * Bruno el 16-ago-2026.
 *
 * 🔑 **Comparando el número, la pregunta deja de depender de quién movió el precio.** Caza el
 * promocional, el de lista, y cualquier cosa que venga después — incluido un precio cambiado por
 * fuera de todos nuestros sistemas.
 *
 * ⚠️ **Un sello sin número no acusa a nadie.** Las filas viejas (el sellado inicial, y las de
 * cualquier etiqueta impresa antes de que se guardara el precio) tienen `precio` en `null`: ahí no
 * hay con qué comparar y manda la regla de fechas. Tratar el `null` como «distinto» mandaría las 262
 * del sellado a la cola el primer día, que es exactamente lo que el sellado vino a evitar.
 *
 * @param impresas  Las filas de `etiquetas_impresas`, por pid.
 * @param precioHoy `pid → {aCobrar, lista}` de hoy. `aCobrar` en `null` = no se sabe, y no acusa.
 * @param stockPorPid  Sin stock no hay prenda que etiquetar, igual que en `armarCola`.
 */
export function etiquetasDesactualizadas(impresas, precioHoy, stockPorPid) {
  const fuera = [];
  for (const [pid, sello] of Object.entries(impresas || {})) {
    if (sello == null || sello.precio == null) continue; // sello viejo: sin número que comparar
    const hoy = (precioHoy || {})[pid];
    // Sin precio hoy no se sabe si la etiqueta está mal: puede ser el catálogo que no cruzó.
    if (!hoy || hoy.aCobrar == null) continue;
    if (!(Number((stockPorPid || {})[pid] || 0) > STOCK_MINIMO)) continue;
    if (mismoPrecio(sello.precio, hoy.aCobrar) && mismoPrecio(sello.precioLista, hoy.lista)) continue;
    fuera.push({ pid, decia: Number(sello.precio), ahora: Number(hoy.aCobrar), cuando: sello.cuando });
  }
  return fuera;
}
