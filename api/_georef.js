// **Georef: el geocoder del Estado.** `apis.datos.gob.ar`, gratis, sin clave y sin cupo declarado.
//
// ⛔ Archivo `_`: NO es una ruta y no cuenta contra las 12 funciones del plan Hobby. Lo usa
// `api/_envios.js` para proponer el precio del envío por zona.
//
// # Por qué éste y no otro
//
// 🔴 **Nominatim quedó descartado en la primera prueba**: `Rodriguez 1062, Rosario` devolvió una casa
// en **Álvarez, a 60 km**, con cara de resultado bueno. Un geocoder que inventa lejos es peor que no
// tener geocoder, porque el precio que sale de ese punto es un número plausible que nadie revisa.
//
// # Por qué desde el servidor y no desde la pantalla
//
// Tres razones, y la primera sola alcanza: la consulta **por lote** manda las cuarenta direcciones de
// la bandeja en un solo llamado, y apretar "Sugerir precios" tiene que costar una vuelta, no
// cuarenta. Además el punto y la zona se resuelven del mismo lado que las zonas (que ya viven acá) y
// no dependemos de que un servicio ajeno mande las cabeceras que el navegador exige.
//
// # Lo que NO hace
//
// No guarda nada. Se consulta cada vez que alguien aprieta el botón: la dirección se corrige a mano
// seguido —es texto que tipeó una clienta— y un punto cacheado sobrevive a la corrección, así que el
// precio quedaría atado a la dirección vieja sin que se note.
import { alinear } from '../lib/envios/direccion.core.js';

const URL_GEOREF = 'https://apis.datos.gob.ar/georef/api/direcciones';

/** Cuántas direcciones entran en una consulta. Es lo que se midió; el servicio admite más. */
const POR_LOTE = 100;

/**
 * Una consulta al lote, con reintento.
 *
 * 🔑 **El reintento no es de lujo.** Un `fetch` pelado contra un servicio ajeno tira `fetch failed`
 * ante cualquier hipo de red y se lleva puesta la tanda entera — es exactamente lo que estuvo mal
 * durante meses en cinco de los diez `gnFetch` de los scripts de sync. Acá el costo de que falle es
 * que nadie pueda cotizar de una, así que se reintenta una vez y recién después se cuenta.
 */
async function pedir(direcciones) {
  let ultimo;
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await fetch(URL_GEOREF, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ direcciones }),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`Georef contestó ${r.status}`);
      const json = await r.json();
      return alinear(direcciones, json && json.resultados);
    } catch (e) {
      ultimo = e;
    }
  }
  throw new Error(`No se pudo consultar el geocoder: ${ultimo instanceof Error ? ultimo.message : ultimo}`);
}

/**
 * **Geocodifica en escalera y devuelve, por clave, la dirección que contestó Georef (o `null`).**
 *
 * `pedidos` son `{ clave, intentos, localidad }`: `intentos` es la lista de formas que salió de
 * `variantes`, de la más fiel a la más despojada.
 *
 * 🔑 **La escalera va por vueltas, no por dirección.** Todas las que siguen sin resolver prueban su
 * siguiente forma en la misma consulta por lote: así el peor caso son cinco llamados para toda la
 * bandeja, y no cinco por dirección. Se para en la primera forma que conteste, así que la más fiel
 * siempre gana — que es lo que hace que despojar el nombre no cambie el resultado de las que ya
 * andaban.
 *
 * 🔴 **Y para de verdad: no sigue buscando aunque el punto haya salido impreciso.** La tentación es
 * seguir despojando hasta conseguir uno con altura, pero cada escalón que se saca es un nombre menos
 * y una calle más parecida a otra: "Av San Martin 1200" sin altura es una fila que se tipea a mano,
 * mientras que seguir hasta que "Martin 1200" matchee alguna calle con ese número **es un punto
 * exacto de la calle equivocada**, o sea el precio inventado que todo esto existe para evitar.
 */
export async function geocodificarEnEscalera(pedidos) {
  const pendientes = (pedidos || []).map((p) => ({ ...p, resultado: null, usada: null }));
  const vueltas = Math.max(0, ...pendientes.map((p) => (p.intentos || []).length));

  for (let v = 0; v < vueltas; v++) {
    const toca = pendientes.filter((p) => !p.resultado && (p.intentos || [])[v]);
    if (!toca.length) continue;

    for (let i = 0; i < toca.length; i += POR_LOTE) {
      const parte = toca.slice(i, i + POR_LOTE);
      const res = await pedir(
        parte.map((p) => ({ direccion: p.intentos[v], provincia: 'Santa Fe', localidad: p.localidad, max: 1 })),
      );
      parte.forEach((p, k) => {
        if (res[k]) {
          p.resultado = res[k];
          p.usada = p.intentos[v];
        }
      });
    }
  }

  const porClave = new Map();
  for (const p of pendientes) porClave.set(p.clave, { resultado: p.resultado, usada: p.usada });
  return porClave;
}
