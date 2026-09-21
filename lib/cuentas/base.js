/**
 * Lo que las cuentas manuales necesitan de la base, compartido entre los dos handlers que las tocan
 * (`api/_cuentas.js` y `api/_compromisos.js`).
 *
 * # 🔑 Por qué apagar la cuenta no vive en la pantalla
 *
 * "Cuando se llega al monto, se limpia" es la regla que Bruno pidió, y el momento exacto en que
 * pasa es **al confirmar un compromiso** — que es un verbo de `_compromisos.js`, no de acá. Si el
 * cierre lo hiciera la pantalla al recargar, una cuenta completada seguiría ofreciéndose para pedir
 * plata hasta que alguien abriera la sección, y el panel de WhatsApp —que es donde se pide— no abre
 * esa sección nunca.
 *
 * Por eso el cierre es una función que se llama **justo después** de anotar la plata que entró, y
 * vive en `lib/` para que los dos handlers usen la misma en vez de copiar la condición.
 *
 * ⛔ Recibe el cliente de Supabase por parámetro: no crea el suyo. Dos clientes con la misma
 * service key es una conexión de más y una forma sutil de que un handler lea de otro lado.
 */

import { resumenObjetivo } from './core.core.js';

/** Los campos con los que se calcula la plata de un objetivo. Nada más: es una suma, no una ficha. */
export const CAMPOS_PLATA = 'id, objetivo_id, estado, monto, monto_confirmado';

/**
 * Lee los compromisos de un objetivo y devuelve su resumen de plata.
 * `objetivo` es la fila de `cuentas_manuales_objetivos`.
 */
export async function plataDelObjetivo(sb, objetivo) {
  const { data, error } = await sb
    .from('compromisos_pago')
    .select(CAMPOS_PLATA)
    .eq('objetivo_id', objetivo.id);
  if (error) throw new Error(error.message);
  return resumenObjetivo(objetivo, data || []);
}

/**
 * Si el objetivo ya llegó a su monto, lo cierra. Devuelve el resumen y si se cerró.
 *
 * ⚠️ **No cancela los compromisos que queden abiertos.** Puede pasar: alguien transfiere bastante
 * más de lo que le tocaba y completa el objetivo mientras otro cliente todavía debe su parte. Ese
 * compromiso sigue existiendo y se puede confirmar o cancelar a mano, porque la plata del cliente
 * puede venir igual y borrarla de una lista no la frena. La pantalla lo dice cuando pasa.
 */
export async function cerrarSiSeCompleto(sb, objetivo, quien) {
  const resumen = await plataDelObjetivo(sb, objetivo);
  if (!resumen.completo || objetivo.estado !== 'juntando') {
    return { resumen, cerrado: false };
  }
  const { error } = await sb
    .from('cuentas_manuales_objetivos')
    .update({
      estado: 'completo',
      cerrado_en: new Date().toISOString(),
      cerrado_por: quien || null,
    })
    .eq('id', objetivo.id)
    // Sólo si sigue abierto: dos confirmaciones que entran juntas cierran una sola vez.
    .eq('estado', 'juntando');
  if (error) throw new Error(error.message);
  return { resumen, cerrado: true };
}
