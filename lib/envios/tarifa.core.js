/**
 * **La tarifa del cadete: por KM desde el local en Rosario, y precio fijo por localidad afuera.**
 *
 * Reemplaza al precio por zona dibujada (15-nov-2026, lo pidió Bruno con el cartel de Jorge, el
 * cadete nuevo). El mapa de zonas queda sólo para lo que **no** es precio: las zonas de exclusión
 * («no vamos») siguen mandando por encima de cualquier tarifa.
 *
 * # Por qué es `.js` y no `.ts`
 *
 * Mismo motivo que `zonas.core.js`: lo lee `api/_envios.js`, que corre en Node sin compilador.
 *
 * # Los km son POR CALLE, no en línea recta
 *
 * 🔴 **Medido el 15-nov-2026 desde Santa Fe 1435**: Pellegrini 3000 da 2,45 km en línea recta y
 * 3,41 km por calle; Garay Bis 47, 3,89 contra 5,48. **En los dos casos la recta cobraba una franja
 * menos** de lo que cobra la moto (factor ~1,4). Por eso los km salen de un ruteador (`api/_osrm.js`)
 * y ⛔ **no hay fallback a línea recta**: si el ruteador no contesta, no se propone precio y se tipea.
 * Una recta «por las dudas» es exactamente el precio plausible y barato que este módulo existe para
 * no dar.
 *
 * # Los precios viven ACÁ
 *
 * Cambiar la tarifa es cambiar estas dos tablas y deployar. Son las del cartel de Jorge, tal cual:
 * `monto_envio` es lo que cobra el cadete (ver la ficha), así que ⛔ no se les suma nada.
 */

import { zonasDelPunto } from './zonas.core.js';

/**
 * **De dónde sale la moto, por marca.** Puntos de Georef de cada dirección (15-nov-2026).
 * Stunned es una línea de Zattia y sale del local de Zattia; cualquier marca que no sea `bdi`, también.
 */
export const LOCALES = {
  zattia: { direccion: 'Santa Fe 1435, Rosario', lat: -32.94422081127837, lng: -60.64251529808698 },
  bdi: { direccion: 'Santa Fe 1671, Rosario', lat: -32.94362972751071, lng: -60.64579702746565 },
};

export function localDe(marca) {
  return marca === 'bdi' ? LOCALES.bdi : LOCALES.zattia;
}

/**
 * Rosario, por km. `hasta` es el último km que entra en la franja **leído con un decimal**, como lo
 * lee el cadete en el mapa: «0 a 1.9», «2 a 3.9»… y la última es «12 a 14».
 */
export const TRAMOS_ROSARIO = [
  { hasta: 1.9, precio: 5000 },
  { hasta: 3.9, precio: 5500 },
  { hasta: 5.9, precio: 6000 },
  { hasta: 7.9, precio: 6500 },
  { hasta: 9.9, precio: 7000 },
  { hasta: 11.9, precio: 7500 },
  { hasta: 14, precio: 8000 },
];

/** Afuera de Rosario: precio fijo por localidad, con el nombre que devuelve Georef (`localidad_censal`). */
export const LOCALIDADES_FIJAS = [
  { localidad: 'Funes', precio: 12000 },
  { localidad: 'Villa Gobernador Gálvez', precio: 8500 },
  { localidad: 'Granadero Baigorria', precio: 10000 },
  { localidad: 'Pérez', precio: 10000 },
  { localidad: 'Ibarlucea', precio: 10000 },
];

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/** Los metros del ruteador, leídos como los lee el cadete: km con un decimal. */
export function kmLeido(metros) {
  const m = Number(metros);
  if (metros == null || !Number.isFinite(m) || m < 0) return null;
  return Math.round(m / 100) / 10;
}

/** El precio de la franja, o `null` arriba de 14 km (el cartel no dice: se tipea). */
export function precioPorKm(km) {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  const t = TRAMOS_ROSARIO.find((x) => km <= x.hasta);
  return t ? t.precio : null;
}

/** ¿Este punto necesita km? Sólo Rosario se cobra por distancia. */
export function esPorKm(localidad) {
  return norm(localidad) === 'rosario';
}

/**
 * **El precio de un punto ya ubicado.** `punto` es lo que arma `puntoDeGeoref` (lat, lng, localidad);
 * `km` es la distancia por calle desde el local, o `null` si el ruteador no contestó.
 *
 * Devuelve `{ estado, precio, zona, km }`, con `zona.nombre` listo para mostrar al lado del número
 * («Rosario · 3,4 km» o «Funes»): un precio sin de dónde sale no se puede revisar de un vistazo.
 *
 * - `no_vamos`  — cae en una zona de exclusión del mapa. Gana sobre cualquier tarifa.
 * - `sugerido`  — localidad de precio fijo, o Rosario con km dentro del cartel.
 * - `sin_km`    — Rosario, pero el ruteador no contestó. ⛔ Sin fallback a línea recta.
 * - `muy_lejos` — Rosario a más de 14 km: el cartel no tiene precio.
 * - `sin_zona`  — cualquier otra localidad (Roldán, Soldini…): el cartel no la nombra.
 */
/**
 * @param {{ lat: number, lng: number, localidad: string | null }} punto
 * @param {{ zonas?: any[], km?: number | null }} [opciones]
 */
export function tarifaDePunto(punto, { zonas = [], km = null } = {}) {
  const exclusion = zonasDelPunto(punto.lat, punto.lng, zonas).find((z) => z.tipo === 'exclusion');
  if (exclusion) {
    return { estado: 'no_vamos', precio: null, zona: { id: exclusion.id || null, nombre: exclusion.nombre, coordinar: false }, km: null };
  }

  const fija = LOCALIDADES_FIJAS.find((l) => norm(l.localidad) === norm(punto.localidad));
  if (fija) {
    return { estado: 'sugerido', precio: fija.precio, zona: { id: `loc:${norm(fija.localidad)}`, nombre: fija.localidad, coordinar: false }, km: null };
  }

  if (!esPorKm(punto.localidad)) return { estado: 'sin_zona', precio: null, zona: null, km: null };

  if (km == null) return { estado: 'sin_km', precio: null, zona: null, km: null };
  const precio = precioPorKm(km);
  const nombre = `Rosario · ${String(km).replace('.', ',')} km`;
  if (precio == null) return { estado: 'muy_lejos', precio: null, zona: { id: 'rosario', nombre, coordinar: false }, km };
  return { estado: 'sugerido', precio, zona: { id: 'rosario', nombre, coordinar: false }, km };
}
