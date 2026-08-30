/**
 * **La geografía del PRM: dónde queda cada local y en qué orden conviene caminarlos.**
 *
 * ⚠️ Es `.js` plano —y no TypeScript— porque lo importa `api/_prm.js`, que corre en Node sin pasar
 * por el compilador de Next. `lib/prm/core.ts` lo re-exporta tipado para las pantallas: es el mismo
 * arreglo que `lib/permisos.core.js` / `lib/permisos.ts`, y por la misma razón.
 *
 * 🔴 La alternativa —copiar el orden del recorrido adentro del handler— es exactamente el bug que
 * en este repo ya dejó a todo el equipo sin ver el padrón de Canjes: dos copias que se despegan.
 */
import { limpiarDireccion, variantes } from '../envios/direccion.core.js';

const RADIO_TIERRA_KM = 6371;

/** Distancia en km entre dos puntos. Haversine y no la aproximación plana: son cinco líneas. */
export function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * **El orden en que conviene caminarlos**: vecino más próximo desde el punto de arranque.
 *
 * 🔑 **Los que no tienen punto van al FINAL y salen nombrados en `sinPunto`.** Ponerlos primero o
 * intercalarlos los volvería invisibles: la lista se ve completa y el recorrido es peor sin que
 * nadie sepa por qué. Que la pantalla pueda decir "estos 4 no se geocodificaron" es la mitad del
 * valor de ordenar.
 *
 * ⚠️ **Vecino más próximo no da el óptimo** y no hace falta que lo dé: son 15 paradas en una grilla
 * de diez cuadras y el que camina se desvía igual. Lo que evita es el zigzag que sale de listarlos
 * en el orden en que se cargaron.
 *
 * 🔑 **Empate resuelto por `id`**, para que dos corridas den lo mismo y el test pueda afirmarlo.
 */
export function ordenarPorCercania(paradas, desde) {
  const lista = paradas || [];
  const tienePunto = (p) => typeof p.lat === 'number' && typeof p.lng === 'number';
  const conPunto = lista.filter(tienePunto);
  const sinPunto = lista.filter((p) => !tienePunto(p)).map((p) => p.id);

  const orden = [];
  const quedan = [...conPunto];
  let actual = desde || null;

  while (quedan.length) {
    let mejor = 0;
    if (actual) {
      let mejorD = Infinity;
      for (let i = 0; i < quedan.length; i++) {
        const d = distanciaKm(actual, quedan[i]);
        if (d < mejorD || (d === mejorD && quedan[i].id < quedan[mejor].id)) {
          mejorD = d;
          mejor = i;
        }
      }
    } else {
      // Sin punto de arranque se empieza por el primero en orden de id: es arbitrario, pero
      // arbitrario y ESTABLE, que es lo que hace que la lista no se reordene sola al reabrirla.
      for (let i = 1; i < quedan.length; i++) if (quedan[i].id < quedan[mejor].id) mejor = i;
    }
    const elegido = quedan.splice(mejor, 1)[0];
    orden.push(elegido.id);
    actual = elegido;
  }

  return { orden: [...orden, ...sinPunto], sinPunto };
}

/**
 * **La consulta al geocoder para un local, o por qué no se puede preguntar.**
 *
 * 🔴 `provincia` viaja siempre y del otro lado es obligatoria (`api/_georef.js`): hasta el
 * 30-ago-2026 estaba clavada en `'Santa Fe'`, y con eso una dirección de Flores resolvía **en Santa
 * Fe y contestaba un punto plausible**. Un geocoder que inventa lejos es peor que no tener ninguno.
 */
export function consultaDeLocal(local) {
  const limpia = limpiarDireccion(local && local.direccion);
  if (!limpia) return { motivo: 'sin dirección' };
  if (limpia.altura == null && !limpia.esquina) return { motivo: 'la dirección no tiene altura' };
  const intentos = variantes(limpia);
  if (!intentos.length) return { motivo: 'sin dirección' };
  return { clave: local.id, intentos, localidad: local.localidad, provincia: local.provincia };
}
