/**
 * Organización — las reglas, en un solo lugar.
 *
 * `.js` plano y no TypeScript por el mismo motivo que `lib/permisos.core.js`: los handlers de
 * `api/*.js` corren en Node sin pasar por el compilador de Next y no pueden importar TS. El
 * re-export tipado que usa la app es `lib/organizacion/tipos.ts`. ⛔ **Nunca se copia una de estas
 * reglas adentro de un handler ni de una pantalla**: duplicar el chequeo es lo que ya dejó pasar
 * cosas en Canjes y en Meta.
 *
 * # La regla que sostiene el módulo
 *
 * 🔑 **`persona = null` es una fila válida, y sólo en la clase `responde`.** Es el gris: algo de lo
 * que el sector responde y ninguna persona reclamó. Se guarda, se cuenta y se muestra — un gris
 * escondido es el que se cobra. Las otras cuatro clases son afirmaciones SOBRE una persona («qué
 * decide sola», «qué publica», «qué NO es suyo», «qué entrega»): sin persona no dicen nada, así que
 * ahí `persona` es obligatoria.
 */

/**
 * Las cinco clases, en el orden en que se leen en la ficha de una persona.
 *
 * Salen de la forma que ya tenían los manuales 01 y 09 («Responde por · Entrega · Decide sola ·
 * Publica · No es suyo»), que es la que Bruno corrigió y confirmó. ⛔ No se inventa una sexta sin
 * que exista antes en el manual: la ficha y el manual son dos vistas del mismo texto.
 */
export const CLASES = [
  { key: 'responde', label: 'Responde por', ayuda: 'De qué responde, aunque no lo haga con las manos.' },
  { key: 'entrega', label: 'Entrega', ayuda: 'Lo que sale de sus manos, y cuándo.' },
  { key: 'decide', label: 'Decide sola', ayuda: 'Lo que no tiene que preguntar.' },
  { key: 'publica', label: 'Publica', ayuda: 'Qué canal aprieta. La dueña de la pieza no es siempre la que publica.' },
  { key: 'no_es_suyo', label: 'No es suyo', ayuda: 'Lo que se le pide seguido y no le toca. Vale tanto como lo de arriba.' },
];

/** La única clase que admite una fila sin dueño. */
export const CLASE_DEL_GRIS = 'responde';

export const KEYS_CLASE = CLASES.map((c) => c.key);

export function esClase(x) {
  return KEYS_CLASE.includes(String(x));
}

/** El rótulo de una clase; el propio key si no la conoce, para que nunca dibuje vacío. */
export function labelDeClase(key) {
  const c = CLASES.find((x) => x.key === key);
  return c ? c.label : String(key || '');
}

/**
 * ¿Esta fila es un gris?
 *
 * Se pregunta por el DATO (`persona`), ⛔ nunca por una bandera aparte: una bandera se puede
 * desincronizar del campo que describe, y entonces habría dos verdades sobre lo mismo.
 */
export function sinDueno(fila) {
  return !fila || !fila.persona;
}

/**
 * ¿La fila se puede guardar? Devuelve `null` si está bien, o el motivo.
 *
 * El mismo freno lo corre el handler antes de escribir y la pantalla antes de habilitar el botón.
 */
export function filaValida(fila, sectores) {
  if (!fila || !String(fila.id || '')) return 'falta id';
  if (!String(fila.titulo || '').trim()) return 'falta el título';
  if (!esClase(fila.clase)) return `clase inválida (usá ${KEYS_CLASE.join(', ')})`;
  const sector = String(fila.sector || '');
  if (!sector) return 'falta el sector';
  if (Array.isArray(sectores) && sectores.length && !sectores.includes(sector)) {
    return `sector inválido (usá ${sectores.join(', ')})`;
  }
  if (sinDueno(fila) && fila.clase !== CLASE_DEL_GRIS) {
    return `«${labelDeClase(fila.clase)}» necesita una persona: sin dueña no afirma nada. Sin dueña sólo se puede dejar «${labelDeClase(CLASE_DEL_GRIS)}».`;
  }
  return null;
}

/** Las activas de un sector, ordenadas por clase y después por `orden` y título. */
export function delSector(filas, sector) {
  return ordenar((filas || []).filter((f) => f.activo !== false && f.sector === sector));
}

/** Las activas de una persona. La clave es el `name` exacto del padrón. */
export function deLaPersona(filas, persona) {
  return ordenar((filas || []).filter((f) => f.activo !== false && f.persona === persona));
}

/**
 * **Los grises**: lo activo que ningún nombre reclamó.
 *
 * Es la lista que justifica la sección, así que se calcula acá y no en la pantalla — la pantalla la
 * dibuja y también la CUENTA, y las dos tienen que salir del mismo lado o el número miente.
 */
export function grises(filas) {
  return ordenar((filas || []).filter((f) => f.activo !== false && sinDueno(f)));
}

function ordenar(filas) {
  const peso = (f) => {
    const i = KEYS_CLASE.indexOf(f.clase);
    return i === -1 ? KEYS_CLASE.length : i;
  };
  return filas.slice().sort((a, b) => (
    peso(a) - peso(b)
    || (a.orden || 0) - (b.orden || 0)
    || String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es')
  ));
}

/**
 * **El puesto que cubre esta persona**, o `null`.
 *
 * 🔑 **Karen no responde por «lo de Karen»: cubre el turno mañana de Local BDI y responde por lo
 * del PUESTO.** El reparto del local se escribe una vez, contra la cuenta del puesto, porque el
 * mismo humano escribe desde dos identidades y en BDI el puesto lo tapa 4,8×. Escribirlo cuatro
 * veces —una por persona— serían cuatro copias que hay que reescribir cada vez que cambia alguien.
 *
 * ⚠️ Pero sin esto la persona quedaba con la ficha VACÍA, que se lee como «no responde por nada».
 * Esta función es lo que deja decir la verdad: **su ficha es la del puesto que cubre.**
 * Devuelve la `persona` del nodo-puesto (la cuenta), ⛔ no su id: es la clave con la que están
 * guardadas las responsabilidades.
 */
export function puestoDe(nodos, persona) {
  const vivos = (nodos || []).filter((n) => n && n.id && n.activo !== false);
  const porId = new Map(vivos.map((n) => [n.id, n]));
  for (const n of vivos) {
    if (n.persona !== persona) continue;
    const padre = n.padre_id ? porId.get(n.padre_id) : null;
    if (padre && padre.tipo === 'puesto' && padre.persona && padre.persona !== persona) return padre.persona;
  }
  return null;
}

/**
 * Los nodos que puede ver este perfil.
 *
 * 🔑 **`interno` ARRASTRA a los hijos.** Esconder «Operativo» y dejar colgando «Venta mayorista»
 * sería peor que no esconder nada: la rama aparece igual, ahora sin su título, y `arbol()` la sube
 * a la raíz —donde queda al lado de los dueños de la empresa—. El recorte se hace acá, sobre la
 * lista plana, para que el árbol no tenga que saber nada de permisos.
 *
 * ⚠️ Va en el SERVIDOR: lo que no viaja no se puede dibujar por accidente. Mismo criterio que
 * `_sistema.js` con las novedades que no son de uno.
 */
export function visiblesPara(nodos, esAdmin) {
  const vivos = (nodos || []).filter((n) => n && n.id);
  if (esAdmin) return vivos;
  const porId = new Map(vivos.map((n) => [n.id, n]));
  const escondido = (n) => {
    const visto = new Set();
    let actual = n;
    while (actual && !visto.has(actual.id)) {
      if (actual.interno) return true;
      visto.add(actual.id);
      actual = actual.padre_id ? porId.get(actual.padre_id) : null;
    }
    return false;
  };
  return vivos.filter((n) => !escondido(n));
}

/**
 * El organigrama, de lista plana a árbol.
 *
 * ⚠️ **Un nodo cuyo padre no existe (o se apagó) sube a la raíz en vez de desaparecer.** Un
 * organigrama al que le falta gente es peor que uno con un nodo fuera de lugar: el primero se lee
 * como «esa persona no está», el segundo se ve mal y alguien lo arregla.
 * ⚠️ Y un ciclo (`a` cuelga de `b` y `b` de `a`) no cuelga la pantalla: los nodos que no llegan a la
 * raíz se emiten al final, en el nivel de arriba.
 */
export function arbol(nodos) {
  const vivos = (nodos || []).filter((n) => n && n.activo !== false && n.id);
  const porId = new Map(vivos.map((n) => [n.id, { ...n, hijos: [] }]));
  const raiz = [];
  const colgados = new Set();

  for (const n of porId.values()) {
    const padre = n.padre_id ? porId.get(n.padre_id) : null;
    if (padre && padre.id !== n.id && !esDescendiente(porId, padre, n.id)) {
      padre.hijos.push(n);
      colgados.add(n.id);
    } else {
      raiz.push(n);
    }
  }
  // Lo que quedó en un ciclo no está colgado de nadie y tampoco entró a la raíz: se muestra igual.
  for (const n of porId.values()) if (!colgados.has(n.id) && !raiz.includes(n)) raiz.push(n);

  const porOrden = (a, b) => (a.orden || 0) - (b.orden || 0) || String(a.label || '').localeCompare(String(b.label || ''), 'es');
  const ordenarHijos = (ns) => { ns.sort(porOrden); ns.forEach((n) => ordenarHijos(n.hijos)); };
  ordenarHijos(raiz);
  return raiz;
}

function esDescendiente(porId, nodo, id) {
  let actual = nodo;
  const visto = new Set();
  while (actual && !visto.has(actual.id)) {
    if (actual.id === id) return true;
    visto.add(actual.id);
    actual = actual.padre_id ? porId.get(actual.padre_id) : null;
  }
  return false;
}
