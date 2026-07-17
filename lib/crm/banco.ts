/**
 * Banco de mensajes del CRM. Port de index.html:14250-14340.
 *
 * **Hoy `mensajes:bdi` NO EXISTE en el KV** (verificado con `scripts/crm-kv.mjs
 * --dump`, 17-jul-2026): nunca se editó, así que todo el mundo ve esta semilla.
 * Por eso es la primera escritura que se habilita en la sombra — es la única del
 * CRM con **cero datos reales en riesgo**.
 *
 * Ojo con el corolario: en cuanto alguien guarde una edición, la clave pasa a
 * existir y la semilla deja de verse. A partir de ahí este archivo es solo el
 * default para una marca que todavía no editó nada.
 */

export type GrupoMensajes = {
  grupo: string
  mensajes: string[]
}

/** BANCO_MENSAJES (14250), textual. Es lo que se ve hoy en producción. */
export const BANCO_SEMILLA: readonly GrupoMensajes[] = [
  {
    grupo: '👋 Primer contacto (cliente dormido)',
    mensajes: [
      'Hola [Nombre]! ¿Cómo andás? Soy Bruno de BDI. Tanto tiempo 🙌 ¿Seguís con el local?',
      'Buenas [Nombre]! Soy Bruno de BDI Accesorios. Hace mucho no hablamos y me acordé de vos 👀 ¿Cómo viene todo por el local?',
      'Hola [Nombre], ¿todo bien? Soy Bruno de BDI. Te escribo para reconectar y mostrarte lo nuevo que tenemos. ¿Seguís comprando accesorios?',
    ],
  },
  {
    grupo: '📨 Propuestas de contacto',
    mensajes: [
      'Llegaron [producto] nuevos, te paso fotos por si te interesan 👀',
      '¿Necesitás reponer [producto]? Tengo stock fresco de lo tuyo.',
      'Saqué lista nueva con mejores precios en [categoría], ¿te la mando?',
      'Te guardé [producto] que sé que llevás, ¿te lo reservo?',
    ],
  },
  {
    grupo: '📋 Seguimiento de lista / presupuesto enviado',
    mensajes: [
      'Hola [Nombre]! ¿Pudiste ver la lista? Si querés te armo un pedido con lo que más se vende y te aplico el cupón, así lo dejás listo 💪',
      '[Nombre], te recuerdo que el cupón te da el descuento hasta [fecha]. ¿Te armo el pedido antes de que se venza?',
      '[Nombre], de la lista que te pasé, lo que más está saliendo es [producto]. ¿Te lo sumo al pedido con el descuento?',
      '¿Con qué te gustaría arrancar de la lista? Te armo y te paso el total con el cupón ya aplicado 👍',
    ],
  },
  {
    grupo: '💬 Si te responde',
    mensajes: [
      '¡Genial! Renovamos un montón la lista. ¿Qué es lo que más se te vende hoy? Te paso lo nuevo de eso 💪',
      'Te entiendo, son épocas. Te dejo abierta la puerta para cuando quieras. ¿Te sumo al canal donde subo los ingresos? Así ves las novedades sin compromiso 📲',
      '¡Gracias por contarme! Te deseo lo mejor 🙌 Cualquier cosa más adelante, acá estoy.',
    ],
  },
  {
    grupo: '🔁 Si no responde',
    mensajes: [
      '[Nombre], te dejo esto por si te sirve: entraron [producto] y se están moviendo bien. Si querés te paso fotos y precios 👍',
      '[Nombre], última que te tiro 😅 por ser cliente de antes te hago un precio especial en tu primer pedido de reenganche. ¿Lo vemos?',
    ],
  },
  {
    grupo: '💲 "Está caro" / objeciones',
    mensajes: [
      '¿Caro contra qué? Te muestro la cuenta: te sale $X, lo vendés a $Y, te quedan $Z por unidad, y rota rápido. ¿Qué precio te cerraría para arrancar?',
      'Te entiendo. Lo mío incluye stock siempre, envío y cambios sin drama, que al final te ahorra plata. ¿Querés que te arme un pedido de prueba?',
      'Bárbaro que tengas proveedor 🙌 teneme como segunda opción para cuando te quedes sin stock. ¿Te paso la lista igual?',
    ],
  },
  {
    grupo: '👥 Por tipo de cliente',
    mensajes: [
      '[Nombre]! Antes de subirlo al canal te aviso a vos: llegó [producto]. ¿Te lo reservo?',
      'Vi que venís llevando [producto]. Te armo un combo con [producto] que combina y te deja mejor margen, ¿te paso?',
      '[Nombre], hace un par de semanas no te veo 👀 ¿Necesitás reponer algo? Tengo stock fresco de lo tuyo.',
      '¡Gracias por la primera compra, [Nombre]! ¿Cómo te fue con [producto]? Si te sirvió, te paso lo que mejor combina.',
    ],
  },
  {
    grupo: '📣 Invitar al canal',
    mensajes: [
      'Sumate al canal donde subo los ingresos apenas llegan: los de ahí se enteran primero y arman pedido antes de que se agote. Te paso el link.',
      'Te agrego al canal así no te perdés las novedades ni las ofertas que saco solo ahí 📲',
    ],
  },
]

/** Copia profunda de la semilla. El legacy hace JSON.parse(JSON.stringify(...)) por lo mismo. */
export function semillaFresca(): GrupoMensajes[] {
  return BANCO_SEMILLA.map((g) => ({ grupo: g.grupo, mensajes: [...g.mensajes] }))
}

// ── Operaciones puras ────────────────────────────────────────────────────────
// El legacy muta bancoData en el lugar y llama a _bancoGuardar (14322-14332).
// Acá devuelven un banco nuevo: React necesita la referencia distinta para
// re-renderizar, y así el guardado recibe exactamente lo que se va a mostrar.

/**
 * bancoGuardarEdit (14322). **Un texto vacío borra el mensaje**, no guarda un
 * mensaje en blanco: el legacy delega en bancoBorrar con silent=true, o sea sin
 * pedir confirmación. Se porta igual.
 */
export function editarMensaje(banco: GrupoMensajes[], gi: number, mi: number, texto: string): GrupoMensajes[] {
  const v = texto.trim()
  if (!v) return borrarMensaje(banco, gi, mi)
  return banco.map((g, i) => (i !== gi ? g : { ...g, mensajes: g.mensajes.map((m, j) => (j === mi ? v : m)) }))
}

/** bancoBorrar (14328). */
export function borrarMensaje(banco: GrupoMensajes[], gi: number, mi: number): GrupoMensajes[] {
  return banco.map((g, i) => (i !== gi ? g : { ...g, mensajes: g.mensajes.filter((_, j) => j !== mi) }))
}

/** bancoAgregar (14332): agrega uno vacío y lo deja en edición. */
export function agregarMensaje(banco: GrupoMensajes[], gi: number): GrupoMensajes[] {
  return banco.map((g, i) => (i !== gi ? g : { ...g, mensajes: [...g.mensajes, ''] }))
}
