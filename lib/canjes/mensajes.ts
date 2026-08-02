/**
 * Los mensajes que se le mandan a la creadora, armados por el sistema.
 *
 * **Por qué no los escribe la persona de marketing:** cada versión distinta del mismo mensaje es
 * una promesa distinta, y después ella reclama sobre lo que le dijeron. Acá el texto sale con los
 * datos ya puestos —qué se acordó, el link, el seguimiento— y queda registrado qué se le dijo.
 *
 * Mismo patrón que `lib/reclamos/mensajes.ts`. Archivo PURO y con tests: son textos que salen a
 * una persona de afuera, no se improvisan.
 */

import {
  ENTREGABLE_LABEL, ENTREGABLE_LABEL_PLURAL, STORE_LABEL, VIA_ENVIO_LABEL,
  entregableEnCriollo, nombrePersona, queDatoPide,
  type CanjeEntregable, type CanjePersona, type CanjeRow, type CanjeStore, type ViaEnvio,
} from './tipos'

/**
 * `$ 80.000`.
 *
 * El `replace` no es cosmético: `toLocaleString('es-AR')` separa el símbolo con un **espacio duro**
 * (U+00A0). En un panel da igual, pero esto se pega en WhatsApp y alguien puede querer buscarlo o
 * copiarlo — un carácter invisible distinto es la clase de detalle que después nadie entiende.
 */
const money = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).replace(/ /g, ' ')

/** El nombre de pila alcanza y suena mejor que el nombre completo. Si no lo sabemos, va el @. */
function comoLaLlamamos(p: Pick<CanjePersona, 'nombre' | 'apellido' | 'instagram' | 'instagram_raw'>): string {
  const pila = (p.nombre || '').trim().split(/\s+/)[0]
  if (pila) return pila.charAt(0).toUpperCase() + pila.slice(1)
  return nombrePersona(p)
}

/** "2 historias de Instagram y 1 reel de Instagram" — lo que se acordó, en una línea. */
export function listaEntregables(entregables: Pick<CanjeEntregable, 'tipo' | 'cantidad_comprometida'>[]): string {
  const partes = entregables.map((e) => entregableEnCriollo(e.tipo, Number(e.cantidad_comprometida) || 1))
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** Lo que se le manda, según cómo se pactó el tope. */
export function loQueLeMandamos(c: Pick<CanjeRow, 'tope_tipo' | 'tope_pvp' | 'tope_unidades'>): string {
  if (c.tope_tipo === 'unidades') {
    const partes = (c.tope_unidades || []).map((u) => `${u.cantidad} ${u.descripcion}`)
    if (!partes.length) return 'lo que acordamos'
    if (partes.length === 1) return partes[0]
    return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
  }
  return c.tope_pvp != null ? `productos por hasta ${money(Number(c.tope_pvp))}` : 'lo que acordamos'
}

// ── La propuesta ────────────────────────────────────────────────────────────────

/**
 * El primer mensaje: el que se le manda para preguntarle si le interesa.
 *
 * Dice **todo el trato en tres renglones** —qué le mandamos, qué esperamos de ella— porque la
 * negociación pasa por las redes y lo que no esté acá se termina hablando por audios. Y es lo que
 * después permite que "generar cambios" tenga sentido: se acordó sobre algo escrito.
 *
 * No pregunta por la dirección ni por el talle: eso va después, con el link, y sólo si dice que sí.
 */
export function mensajePropuesta(
  persona: Pick<CanjePersona, 'nombre' | 'apellido' | 'instagram' | 'instagram_raw'>,
  c: Pick<CanjeRow, 'store' | 'tipo' | 'monto_plata' | 'tope_tipo' | 'tope_pvp' | 'tope_unidades'>,
  entregables: Pick<CanjeEntregable, 'tipo' | 'cantidad_comprometida'>[],
): string {
  const vos = comoLaLlamamos(persona)
  const pide = listaEntregables(entregables)
  const plata = c.tipo === 'producto_plata' && c.monto_plata != null
    ? ` más ${money(Number(c.monto_plata))}`
    : ''

  return [
    `¡Hola ${vos}! Te escribimos de ${STORE_LABEL[c.store]} porque nos interesaba hacer un canje con vos.`,
    '',
    pide
      ? `Habíamos pensado en ${loQueLeMandamos(c)}${plata} a cambio de ${pide}.`
      : `Habíamos pensado en ${loQueLeMandamos(c)}${plata}.`,
    '',
    'Avisanos si te interesa y lo terminamos de armar.',
  ].join('\n')
}

// ── El link del portal ──────────────────────────────────────────────────────────

/**
 * El link para que cargue sus datos. **Hay dos versiones y la diferencia importa:** no es lo mismo
 * la primera vez que la quinta.
 *
 * En el segundo canje el formulario abre **prellenado** con lo que ya está en su ficha, así que
 * pedirle "completá tus datos" suena a que perdimos todo lo que ya nos dio. El mensaje lo dice
 * explícitamente: verificá o corregí.
 *
 * `esPrimeraVez` lo decide el llamador mirando si la persona ya tiene canjes anteriores, no un
 * flag guardado: un flag se desincroniza el día que alguien borre un canje.
 *
 * **Con vitrina el mensaje cambia entero**, y no es un matiz de redacción: lo que se le pide dejó
 * de ser un trámite ("cargá tus datos") y pasó a ser lo divertido ("elegí lo que te guste"). Un
 * mensaje que arranca por la dirección hace que el link parezca un formulario, que es exactamente
 * lo que hay que evitar para que lo abra.
 */
export function mensajeLinkDatos(
  persona: Pick<CanjePersona, 'nombre' | 'apellido' | 'instagram' | 'instagram_raw'>,
  store: CanjeStore,
  link: string,
  esPrimeraVez: boolean,
  /** `true` si el canje tiene una vitrina colgada: además de los datos, elige los productos. */
  conVitrina = false,
): string {
  const vos = comoLaLlamamos(persona)
  const queDato = queDatoPide(store) === 'talles' ? 'tus talles' : 'el modelo de tu celular'

  if (conVitrina) {
    return [
      `¡Hola ${vos}! Te escribimos de ${STORE_LABEL[store]}.`,
      '',
      'Te dejo el link para que elijas lo que más te guste y nos dejes la dirección para mandártelo:',
      link,
      '',
      `Ah: cuando entres nos vas a tener que decir ${queDato}, así te mandamos lo que te queda bien.`,
    ].join('\n')
  }

  if (esPrimeraVez) {
    return [
      `¡Hola ${vos}! Te escribimos de ${STORE_LABEL[store]}.`,
      '',
      `Para mandarte el pedido necesitamos algunos datos: cómo contactarte, la dirección de envío y ${queDato}.`,
      'Te dejo el link, son dos minutos:',
      link,
      '',
      '¡Gracias!',
    ].join('\n')
  }

  return [
    `¡Hola ${vos}! Te escribimos de ${STORE_LABEL[store]}.`,
    '',
    'Tenemos tus datos de la acción anterior, así que te paso el link para que los verifiques o los edites si cambió algo:',
    link,
    '',
    'Si está todo bien, con confirmar alcanza.',
  ].join('\n')
}

// ── El acuerdo ──────────────────────────────────────────────────────────────────

/**
 * El resumen de lo pactado, para dejarlo por escrito en el chat. No lo manda el sistema solo: lo
 * copia la persona de marketing cuando cierra el acuerdo, y es lo que después evita el "yo
 * entendí otra cosa".
 */
export function mensajeAcuerdo(
  persona: Pick<CanjePersona, 'nombre' | 'apellido' | 'instagram' | 'instagram_raw'>,
  c: Pick<CanjeRow, 'store' | 'tipo' | 'monto_plata' | 'tope_tipo' | 'tope_pvp' | 'tope_unidades'>,
  entregables: Pick<CanjeEntregable, 'tipo' | 'cantidad_comprometida' | 'plazo_dias'>[],
): string {
  const vos = comoLaLlamamos(persona)
  const lineas = [
    `¡Hola ${vos}! Te resumo lo que quedamos, así lo tenemos los dos por escrito:`,
    '',
    `• Te mandamos: ${loQueLeMandamos(c)}`,
  ]
  if (c.tipo === 'producto_plata' && c.monto_plata) {
    lineas.push(`• Más ${money(Number(c.monto_plata))}`)
  }
  if (entregables.length) {
    lineas.push(`• Vos subís: ${listaEntregables(entregables)}`)
    // El plazo se cuenta desde que le llega, no desde hoy: al acordar todavía no sabemos cuándo
    // llega el pedido, y decirle "en 10 días" hoy sería prometerle una fecha que no controlamos.
    const plazos = [...new Set(entregables.map((e) => e.plazo_dias).filter((p): p is number => p != null))]
    if (plazos.length === 1) {
      lineas.push(`• Plazo: ${plazos[0]} ${plazos[0] === 1 ? 'día' : 'días'} desde que te llega el pedido`)
    }
  }
  lineas.push('', 'Cualquier cosa me decís. ¡Gracias!')
  return lineas.join('\n')
}

// ── El despacho ─────────────────────────────────────────────────────────────────

/**
 * "Ya salió". Lleva el seguimiento sólo si la vía lo tiene: mandarle un código a alguien que va a
 * retirar en mano es ruido, y mandarle un link que no funciona es peor.
 */
export function mensajeDespacho(
  persona: Pick<CanjePersona, 'nombre' | 'apellido' | 'instagram' | 'instagram_raw'>,
  c: Pick<CanjeRow, 'store' | 'envio_via' | 'envio_seguimiento'>,
  linkSeguimiento: string | null,
): string {
  const vos = comoLaLlamamos(persona)
  const via = c.envio_via as ViaEnvio | null

  if (via === 'presencial') {
    return [
      `¡Hola ${vos}! Ya tenemos tu pedido de ${STORE_LABEL[c.store]} listo para que lo pases a buscar.`,
      '',
      'Avisanos cuándo te queda cómodo.',
    ].join('\n')
  }

  const lineas = [`¡Hola ${vos}! Tu pedido de ${STORE_LABEL[c.store]} ya salió.`]
  if (c.envio_seguimiento) {
    lineas.push('', `Va por ${via ? VIA_ENVIO_LABEL[via] : 'correo'} y lo podés seguir con este código: ${c.envio_seguimiento}`)
    if (linkSeguimiento) lineas.push(linkSeguimiento)
  } else if (via) {
    lineas.push('', `Va por ${VIA_ENVIO_LABEL[via]}.`)
  }
  lineas.push('', 'Cuando te llegue, contanos qué te pareció.')
  return lineas.join('\n')
}

// ── El recordatorio ─────────────────────────────────────────────────────────────

/**
 * El recordatorio de lo que falta.
 *
 * ⚠️ Se genera **a pedido**, no se manda solo. El plan es explícito en esto: no se le corre atrás
 * por el sistema, ella ya sabe lo que acordó. Esto existe para cuando alguien decide escribirle,
 * y sirve para que el texto no salga distinto cada vez.
 */
export function mensajeRecordatorio(
  persona: Pick<CanjePersona, 'nombre' | 'apellido' | 'instagram' | 'instagram_raw'>,
  faltantes: { tipo: CanjeEntregable['tipo']; cuantas: number }[],
): string {
  const vos = comoLaLlamamos(persona)
  const partes = faltantes.map((f) =>
    `${f.cuantas} ${(f.cuantas === 1 ? ENTREGABLE_LABEL[f.tipo] : ENTREGABLE_LABEL_PLURAL[f.tipo]).toLowerCase()}`,
  )
  const lista = partes.length <= 1
    ? partes[0] ?? ''
    : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`

  return [
    `¡Hola ${vos}! ¿Cómo va?`,
    '',
    `Te consulto por ${lista} que habíamos quedado. Si ya las subiste pasame el link así lo registramos, y si necesitás más tiempo no hay drama, avisame.`,
  ].join('\n')
}
