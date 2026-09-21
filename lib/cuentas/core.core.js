/**
 * Las cuentas manuales: la cuenta de la plata de una vuelta.
 *
 * Una cuenta manual sirve para juntar plata de clientes para algo que el dashboard no conoce —la
 * cuota de un crédito, las bolsas—. La ficha es permanente y está dormida hasta que alguien le
 * carga un **objetivo**: cuánto hay que juntar. Cuando lo confirmado llega a ese número el objetivo
 * se cierra y la cuenta vuelve a quedar libre.
 *
 * # 🔑 Los dos números que no son el mismo
 *
 * **Falta juntar** es lo que todavía no entró (objetivo − confirmado). **Se le puede pedir** es lo
 * que queda después de descontar lo que ya está comprometido con otros clientes y no entró. El
 * primero se muestra, el segundo decide: pedir contra el primero es comprometer dos veces la misma
 * plata, que es el error que este circuito ya cometió del lado de los acreedores.
 *
 * Es la misma forma que `sePuedeComprometer` de `../compromisos/plata.core.js`, con la deuda del
 * dashboard reemplazada por el objetivo cargado a mano.
 *
 * # Por qué `.js` y no `.ts`
 *
 * Porque `api/_cuentas.js` y `api/_compromisos.js` corren en Node sin pasar por el compilador de
 * Next y no pueden importar TypeScript. `lib/cuentas/cliente.ts` lo re-exporta con tipos para las
 * pantallas. Así el número que dibuja el formulario y el que aplica el servidor son **la misma
 * cuenta**, que es la lección más cara que dejó este circuito.
 *
 * ⛔ Lo único que importa es `redondear`, para no reescribir los centavos.
 */

import { redondear } from '../compromisos/plata.core.js';

/** Los dos estados en los que un compromiso todavía ocupa plata. Copiado de `compromisos/core.ts`. */
function abierto(c) {
  return c.estado === 'prometido' || c.estado === 'transferido';
}

function suma(lista, campo) {
  let t = 0;
  for (const c of lista) t = redondear(t + Number(c[campo] ?? 0));
  return Number.isFinite(t) ? t : 0;
}

/**
 * La plata de un objetivo, a partir de SUS compromisos (los que tienen ese `objetivo_id`).
 *
 * - `juntado`      lo que entró de verdad: la suma de lo confirmado.
 * - `comprometido` lo que prometieron y todavía no entró.
 * - `falta`        objetivo − juntado. Es lo que hay que conseguir para pagar.
 * - `sePuedePedir` falta − comprometido. Es el techo de un compromiso nuevo.
 * - `completo`     ya se juntó todo: la cuenta se apaga.
 *
 * ⚠️ `juntado` suma `monto_confirmado` y no `monto`: cuando el cliente transfiere de menos, el
 * compromiso se cierra por lo que entró y el resto nace como otro. Sumar lo prometido daría por
 * juntada plata que no llegó.
 */
export function resumenObjetivo(objetivo, compromisos) {
  const monto = redondear(objetivo?.monto);
  const mios = (compromisos || []).filter((c) => String(c.objetivo_id || '') === String(objetivo?.id || ''));
  const confirmados = mios.filter((c) => c.estado === 'confirmado');
  const enCamino = mios.filter(abierto);

  const juntado = suma(confirmados, 'monto_confirmado');
  const comprometido = suma(enCamino, 'monto');
  const falta = Number.isFinite(monto) ? Math.max(0, redondear(monto - juntado)) : NaN;
  const sePuedePedir = Number.isFinite(falta) ? Math.max(0, redondear(falta - comprometido)) : NaN;

  return {
    objetivo: monto,
    juntado,
    comprometido,
    falta,
    sePuedePedir,
    // El medio centavo de tolerancia es el mismo de todo el circuito: sin él, un objetivo se queda
    // abierto para siempre por una diferencia que no se ve en pantalla.
    completo: Number.isFinite(monto) && juntado >= monto - 0.005,
    cuantos: mios.length,
    cuantosEnCamino: enCamino.length,
  };
}

/**
 * Cuánto de más entró respecto de lo que faltaba juntar. 0 si entró justo o de menos.
 *
 * 🔑 **Se acepta y se avisa; no se rechaza.** La plata ya se movió: rebotar la confirmación no la
 * devuelve, sólo deja el sistema diciendo que no entró algo que entró. Y no hay dónde guardar un
 * saldo a favor, porque la cuenta se apaga cuando se completa — así que lo único honesto es
 * anotarlo y decir cuánto se pasó, para que quien mira el banco sepa que ahí sobra plata.
 */
export function seExcede(falta, entro) {
  const dif = redondear(Number(entro) - Number(falta));
  return Number.isFinite(dif) ? Math.max(0, dif) : 0;
}

/**
 * Cómo se lee una cuenta en la lista, en una palabra.
 *
 * ⚠️ `dormida` **no es** "sin plata": es "nadie está juntando para esto ahora". Es el estado normal
 * de una cuenta que se usa dos veces al año, y por eso no se dibuja como un problema.
 */
export function estadoCuenta(cuenta) {
  if (cuenta?.archivada) return 'archivada';
  return cuenta?.objetivo ? 'juntando' : 'dormida';
}
