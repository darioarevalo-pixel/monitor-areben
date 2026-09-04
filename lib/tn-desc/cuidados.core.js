/**
 * El bloque de CUIDADOS de la prenda, derivado de la TELA.
 *
 * Por qué existe (decisión de Bruno, 4-sep-2026, mirando FALDA SAGE): las descripciones escritas
 * a mano que quedaron bien tienen un bloque de cuidados y las nuestras no. Es el dato que más
 * consulta la clienta después del talle, y ⛔ el que menos puede inventar un modelo: un cuidado
 * equivocado no es una frase floja, es una prenda arruinada que vuelve como cambio.
 *
 * 🔑 Por eso ⛔ no lo escribe nadie: **sale de la tela**, que ya es una lista cerrada en la ficha.
 * Es la misma jugada que los bullets — en vez de una regla mejor escrita, un caso que no puede
 * salir mal. El día que se agregue una tela, el test de cobertura de abajo se pone rojo hasta que
 * alguien decida en qué grupo va.
 *
 * 🔑 **Cinco grupos y no veintidós textos**, porque lo dijo Bruno y es verdad: «casi siempre es
 * más o menos el mismo». Veintidós redacciones serían veintidós cosas que mantener y veintiuna
 * maneras de que dos telas parecidas digan cosas distintas sin motivo.
 *
 * 🔴 **Con dos telas gana la MÁS RESTRICTIVA, ⛔ no la principal.** También de Bruno: «capaz la
 * microfibra no necesita, pero si tiene otra tela, capaz la tiene que cuidar». Una falda de
 * microfibra con capa de microtul —FALDA SAGE, el caso que lo disparó— se cuida como el microtul.
 * El orden de `GRUPOS` **es** esa prioridad: el primero que aparezca gana.
 *
 * ⛔ Sin tela no hay bloque, y arriba de eso `sinTela()` impide redactar y publicar: una prenda
 * sin tela cargada ⛔ no sale a la tienda (decisión de Bruno del 4-sep-2026).
 */

import { TELA_SIN_IDENTIFICAR, telasDe } from './atributos.core.js';

/**
 * Los grupos, **en orden de restricción**: el primero que matchea es el que sale.
 *
 * ⚠️ «No van al agua» va antes que «delicadas» a propósito. Un ecocuero con detalle de encaje
 * tiene que decir «no lavar en lavarropas», que es lo que arruina la prenda si se hace mal — y
 * «lavar a mano con agua fría» ya la habría metido en el agua.
 */
export const GRUPOS = [
  {
    key: 'no-agua',
    nombre: 'No van al agua',
    telas: ['ecocuero', 'piel'],
    lineas: [
      'No lavar en lavarropas ni sumergir.',
      'Limpiar con un paño húmedo y dejar secar a la sombra.',
      'No planchar.',
    ],
  },
  {
    key: 'delicadas',
    nombre: 'Delicadas',
    telas: ['encaje', 'microtul', 'red', 'lurex', 'satén', 'gasa', 'batista'],
    // ⛔ Sin «bolsa de red»: lo sacó Bruno el 4-sep-2026 — «no es algo habitual». Un cuidado que
    // pide algo que la clienta no tiene en casa no se cumple, y encima suena a excusa.
    lineas: [
      'Lavar a mano con agua fría, o en ciclo delicado.',
      'No retorcer.',
      'No poner en secadora.',
      'Planchar del revés y a temperatura baja, o con una tela encima.',
    ],
  },
  {
    key: 'deforman',
    nombre: 'Se deforman',
    telas: ['morley', 'lanilla', 'frisa', 'crepe'],
    lineas: [
      'Lavar del revés con agua fría y ciclo corto.',
      'No colgar mojada: secar en plano y a la sombra.',
      'No poner en secadora.',
      'Planchar del revés a temperatura baja.',
    ],
  },
  {
    key: 'denim',
    nombre: 'Denim y rústicos',
    telas: ['denim rígido', 'denim elastizado', 'corderoy', 'lino', 'bengalina'],
    lineas: [
      'Lavar del revés con agua fría, junto con prendas de color similar.',
      'Lavarla lo menos posible ayuda a que no destiña.',
      'No poner en secadora.',
      'Planchar del revés.',
    ],
  },
  {
    key: 'punto',
    nombre: 'Punto y básicos',
    telas: ['microfibra', 'jersey de algodón', 'ribb de algodón', 'lycra'],
    lineas: [
      'Lavar del revés con agua fría.',
      'No poner en secadora.',
      'Planchar del revés a temperatura baja.',
    ],
  },
];

/** El grupo de una tela, o `null` si esa palabra no es una tela con cuidado propio. */
export function grupoDe(tela) {
  const t = String(tela || '').trim();
  if (!t || t === TELA_SIN_IDENTIFICAR) return null;
  return GRUPOS.find((g) => g.telas.includes(t)) || null;
}



/**
 * El bloque de cuidados de un producto: `{ grupo, lineas }`, o `null` si no tiene tela.
 *
 * Gana el grupo más restrictivo de todas sus telas — el orden de `GRUPOS` es la prioridad.
 */
export function cuidadosDe(cargados) {
  const grupos = telasDe(cargados)
    .map(grupoDe)
    .filter(Boolean);
  if (!grupos.length) return null;
  const gana = GRUPOS.find((g) => grupos.includes(g));
  return gana ? { grupo: gana.key, lineas: gana.lineas.slice() } : null;
}
