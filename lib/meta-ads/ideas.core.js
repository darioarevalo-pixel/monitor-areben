/**
 * El ciclo de vida de una idea de creativo: LA implementación, una sola, para los dos mundos.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js` y `lib/meta-ads/etapas.core.js`: `api/_meta-funnel.js`
 * corre en Node sin pasar por el compilador de Next y **no puede importar TypeScript**.
 *
 * Y acá el motivo pesa el doble, porque lo que vive en este archivo es **quién puede hacer qué**.
 * Si la máquina de estados se escribiera dos veces —una para dibujar los botones y otra para
 * validar en el servidor—, las dos copias se despegarían y el resultado sería el bug que ya pasó
 * dos veces en este repo: el equipo entero sin ver el padrón de Canjes, y campañas de Meta
 * pausadas por quien tenía el permiso excluido. La UI y el guard leen las mismas líneas.
 *
 * ⚠️ La UI **no es el control de acceso**: no dibujar un botón no impide un `POST` con `curl`. Esto
 * le da la respuesta a los dos, pero el que manda es el servidor.
 *
 * # Cómo se reparte la pelota
 *
 * Los extremos son de Bruno y el medio del equipo de marketing, y eso no es burocracia: es lo que
 * hace que la pelota **se vea** cambiar de mano. Marketing anota la idea, Bruno la aprueba,
 * marketing la produce, Bruno la pautea. Cada paso deja a alguien esperando algo concreto de
 * alguien concreto, que es lo que un tablero de ideas necesita para no llenarse de propuestas que
 * nadie mira.
 */

/** Los seis estados. `descartada` es final salvo que alguien la reabra. */
export const ESTADOS_IDEA = ['propuesta', 'aprobada', 'en-produccion', 'lista', 'pauteada', 'descartada']

/** Cómo se llama cada estado en pantalla (la columna del tablero). */
export const ETIQUETA_ESTADO = {
  propuesta: 'Propuesta',
  aprobada: 'Aprobada',
  'en-produccion': 'En producción',
  lista: 'Lista',
  pauteada: 'Pauteada',
  descartada: 'Descartada',
}

/**
 * El sub-permiso que separa a Bruno del resto. **Uno solo, y es deliberado.**
 *
 * Los sub-permisos NO se heredan de la función (`lib/permisos.core.js`): cada uno es un tilde
 * manual, usuario por usuario y **marca por marca**, el día del deploy. Tres subs serían seis
 * tildes que alguien se olvida, y el tablero queda muerto sin que nadie entienda por qué.
 */
export const SUB_PAUTAR = 'pautar'

/**
 * Las transiciones válidas y quién las puede hacer.
 *
 * `quien: 'pautar'` = admin o quien tenga `meta-ads.pautar`. `quien: 'equipo'` = cualquiera que vea
 * la sección en esa marca.
 *
 * Volver atrás en la producción no está: si una pieza en producción no va más, se **reabre** (que
 * es de Bruno) y el paso queda escrito en el historial. Dejar que cualquiera la mueva para los dos
 * lados haría que el estado no signifique nada.
 */
export const TRANSICIONES = [
  { de: 'propuesta', a: 'aprobada', quien: 'pautar', rotulo: 'Aprobar' },
  { de: 'propuesta', a: 'descartada', quien: 'pautar', rotulo: 'Descartar', exigeMotivo: true },
  { de: 'aprobada', a: 'en-produccion', quien: 'equipo', rotulo: 'Empezar a producir' },
  { de: 'en-produccion', a: 'lista', quien: 'equipo', rotulo: 'Marcar como lista' },
  { de: 'lista', a: 'pauteada', quien: 'pautar', rotulo: 'Ya la pauteé' },
  // Reabrir: vuelve a la primera casilla desde cualquier lado. Es de Bruno porque deshace su ok.
  { de: 'aprobada', a: 'propuesta', quien: 'pautar', rotulo: 'Reabrir' },
  { de: 'en-produccion', a: 'propuesta', quien: 'pautar', rotulo: 'Reabrir' },
  { de: 'lista', a: 'propuesta', quien: 'pautar', rotulo: 'Reabrir' },
  { de: 'descartada', a: 'propuesta', quien: 'pautar', rotulo: 'Reabrir' },
]

/** La transición `de → a`, o `null` si ese salto no existe. */
export function transicion(de, a) {
  return TRANSICIONES.find((t) => t.de === de && t.a === a) || null
}

/**
 * ¿Puede este perfil mover la idea de `de` a `a`? Devuelve `{ ok }` o `{ ok: false, motivo }` con un
 * texto que se le puede mostrar tal cual a la persona.
 *
 * Recibe `puede` en vez de importar `lib/permisos.core.js` para que la decisión de permisos siga
 * teniendo una sola implementación y esta no sea una segunda: el llamador arma `{ ver, pautar }`
 * con `puedeVer`/`puedeSub` y acá solo se combina con la máquina de estados.
 */
export function puedeTransicionar(puede, de, a) {
  if (!ESTADOS_IDEA.includes(a)) return { ok: false, motivo: `"${a}" no es un estado de idea.` }
  if (de === a) return { ok: false, motivo: 'La idea ya está en ese estado.' }
  const t = transicion(de, a)
  if (!t) return { ok: false, motivo: `Una idea ${ETIQUETA_ESTADO[de] ? ETIQUETA_ESTADO[de].toLowerCase() : de} no puede pasar a "${ETIQUETA_ESTADO[a] || a}".` }
  if (!puede.ver) return { ok: false, motivo: 'No tenés acceso a Meta Ads en esta marca.' }
  if (t.quien === 'pautar' && !puede.pautar) {
    return { ok: false, motivo: `"${t.rotulo}" lo hace quien tenga el permiso «Puede aprobar ideas» (meta-ads.pautar).` }
  }
  return { ok: true, transicion: t }
}

/** Las transiciones que este perfil puede hacer desde `de`. Es lo que dibuja los botones. */
export function transicionesDesde(puede, de) {
  return TRANSICIONES.filter((t) => t.de === de && puedeTransicionar(puede, de, t.a).ok)
}

/**
 * ¿Puede editar o borrar esta idea? Solo su autor y solo mientras esté en `propuesta`.
 *
 * Una vez aprobada deja de ser suya: alguien la firmó y puede haber otro produciéndola, así que
 * cambiarle el texto por abajo le movería el piso. Los admins pueden siempre, para poder limpiar.
 */
export function puedeEditarIdea(puede, idea, quien) {
  if (puede.admin) return true
  if (!idea || idea.estado !== 'propuesta') return false
  return !!quien && String(idea.creadoPor || '') === String(quien)
}

/** Los formatos de pieza. Lista corta a propósito: es para orientar la producción, no un catálogo. */
export const FORMATOS_IDEA = [
  { key: 'reel', label: 'Reel / video corto' },
  { key: 'carrusel', label: 'Carrusel' },
  { key: 'foto', label: 'Foto' },
  { key: 'historia', label: 'Historia' },
  { key: 'otro', label: 'Otro' },
]

export const CLAVES_FORMATO = FORMATOS_IDEA.map((f) => f.key)

/**
 * Le apila un paso al historial. El historial va adentro de `datos` y no en una tabla aparte porque
 * se lee siempre entero y junto con la idea, nunca por su cuenta.
 */
export function conPaso(idea, paso) {
  const historial = Array.isArray(idea.historial) ? idea.historial : []
  return { ...idea, historial: [...historial, paso] }
}
