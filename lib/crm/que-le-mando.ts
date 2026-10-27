/**
 * «Qué le mando»: el cuestionario de la ficha del panel que da el recontacto que sigue, en la voz
 * de Darío, y cuándo volver a escribirle (Darío, 27-oct-2026, sobre dos maquetas).
 *
 * 🔑 **Las reglas y los textos salen de la guía de recontactos**, que Darío corrige en Claude Docs:
 * https://claude.ai/artifact/FgX8oBCpvQY3u58zqqrTwE. Si la guía cambia, se cambia acá; ⛔ no se
 * inventan mensajes nuevos.
 *
 * Decisiones de Darío que el código no dice solo:
 *
 * - ⛔ **No pregunta «¿te contestó?»**: si contestó, esto no se abre (le responde él, a su ritmo).
 * - **Lo que el panel ya sabe no se pregunta**: si es cliente (las ventas), si está en la comunidad
 *   (elige solo el cierre) y si es local o emprendedor (se guarda en la ficha la primera vez).
 * - ⛔ **«Hace cuánto le escribiste» se pregunta SIEMPRE.** Tocar un botón de días no prueba que
 *   le escribió: a veces pone la fecha para NO hablarle hasta que entre algo (Darío, 27-oct-2026).
 * - Las opciones de «¿qué fue lo último que le mandaste?» llevan el nombre del MENSAJE y sus
 *   primeras palabras, ⛔ nunca «1º/2º recontacto»: Darío no las reconocía.
 * - Más de 2 meses = **«Recaptar»** (palabra de Darío).
 * - La novedad de la semana se carga una vez, SIN pregunta; la pregunta la suma esto según el
 *   cliente (`conPregunta`).
 *
 * Todo es puro: el componente (`components/panel/QueLeMando.tsx`) guarda y dibuja.
 */

import type { Banco } from './mensajes'

export type Tipo = 'C' | 'B' | 'A' | 'E'
export type Perfil = 'local' | 'emprendedor'

/** Lo que el panel sabe del cliente antes de preguntar nada. */
export type LoQueSabe = {
  esCliente: boolean
  /** `null` = no se pudo leer la comunidad todavía: se ofrecen los dos cierres. */
  enComunidad: boolean | null
  perfil: Perfil | null
  /** La novedad de la semana, sin pregunta. Vacía = no hay. */
  novedad: string
}

/** Las respuestas, en el orden en que se piden. */
export type Respuestas = {
  dijo?: 'si' | 'no'
  perfil?: Perfil
  tiempo?: 'corto' | 'largo'
  ultimo?: string
}

export type Opcion = { valor: string; texto: string; detalle?: string }
export type Pregunta = { campo: keyof Respuestas; texto: string; opciones: Opcion[] }

export type Mensaje = { etiqueta: string | null; texto: string }
export type Agendar = { dias: number; etiqueta: string | null }
export type Resultado = {
  /** «Ya compró · 1º». */
  situacion: string
  mensajes: Mensaje[]
  agendar: Agendar[]
  nota: string | null
}

/** Más de esto sin escribirle es «Recaptar». */
export const DIAS_RECAPTAR = 60

/** Los mensajes de la guía, tal cual (sin tildes, sin ¿, con !: así escribe Darío). */
export const M = {
  vendio: 'Queria consultarte, como se vendieron las fundas de tu ultima compra?',
  frenoCorto: 'Hace unos dias me habias dicho que ibas a armar un pedido! Hubo algo que te freno para hacerlo?',
  frenoLargo: 'Hace unos meses me habias dicho que ibas a armar un pedido! Hubo algo que te freno para hacerlo?',
  chusmear: 'Pudiste chusmear la tienda? Ya trabajas fundas de diseño en el local?',
  videos: 'Te puedo compartir algunos videos para que veas como quedan las fundas puestas?',
  facturaA:
    'Me olvide de contarte, todos los precios son con iva incluido y te hacemos factura A sin costo! Pudiste ver algo en particular para el local?',
  descuento: 'Te cuento que si el pedido pasa el $1.000.000 tenes 5% de descuento, y arriba de $2.000.000 el 10%!',
  minimo: 'Te cuento que el minimo es de $100.000, asi podes arrancar con poco y probar varios diseños! Pudiste ver algo en particular?',
  tepaso:
    'Hace unos meses me habias pedido la lista, desde ahi nos entraron un monton de diseños nuevos! Te paso la tienda asi los ves con stock y precios al dia?',
  cierreComunidad:
    'Nos entraron diseños nuevos y se vienen mas muy pronto! Los ingresos los avisamos primero en la comunidad mayorista, queres que te sume?',
  cierreVideos: 'Queres que te pase videos de algunos diseños para que veas como quedan puestas?',
  emprendedor:
    'Te cuento que el minimo es de $100.000, asi podes arrancar con poco y probar varios diseños! Si queres te sumo a la comunidad mayorista, ahi avisamos primero los diseños nuevos',
} as const

/** La de la guía, para cuando nadie cargó una. */
export const NOVEDAD_DE_FABRICA = 'Nos entraron diseños nuevos de fundas, ya estan en la tienda!'

/** El nombre del grupo del banco de mensajes donde vive la novedad (se edita también en el CRM). */
export const GRUPO_NOVEDAD = 'Novedad de la semana'

/**
 * La novedad vive en el banco de mensajes (`mensajes:bdi`), en su propio grupo: así se carga una vez
 * —desde el panel o desde «Mensajes» del CRM— y la usan todas las fichas. Vacía = no hay.
 */
export function novedadDelBanco(banco: Banco): string {
  const g = banco.find((x) => x.grupo.trim().toLowerCase() === GRUPO_NOVEDAD.toLowerCase())
  return (g?.mensajes[0] || '').trim()
}

/** El banco con la novedad nueva. Los demás grupos quedan como estaban; vacía deja el grupo sin mensaje. */
export function conNovedad(banco: Banco, texto: string): Banco {
  const t = (texto || '').trim()
  const i = banco.findIndex((x) => x.grupo.trim().toLowerCase() === GRUPO_NOVEDAD.toLowerCase())
  if (i < 0) return t ? [...banco, { grupo: GRUPO_NOVEDAD, mensajes: [t] }] : banco
  return banco.map((g, j) => (j === i ? { ...g, mensajes: t ? [t] : [] } : g))
}

/** La novedad + la única pregunta, al final. Al local se le pregunta por el local. */
export function conPregunta(novedad: string, local: boolean): string {
  const n = (novedad || '').trim() || NOVEDAD_DE_FABRICA
  return `${n} ${local ? 'Pudiste ver algo en particular para el local?' : 'Pudiste ver algo en particular?'}`
}

export function tipoDe(sabe: LoQueSabe, r: Respuestas): Tipo | null {
  if (sabe.esCliente) return 'C'
  if (r.dijo === 'si') return 'B'
  if (r.dijo === 'no') {
    const p = r.perfil || sabe.perfil
    return p === 'local' ? 'A' : p === 'emprendedor' ? 'E' : null
  }
  return null
}

const ULTIMO: Record<Tipo, Opcion[]> = {
  A: [
    { valor: 'tienda0', texto: 'La tienda con factura A', detalle: '«Te paso la tienda mayorista… 🧾 IVA incluido y factura A»' },
    { valor: 'viejo', texto: 'La tienda vieja, sin factura A', detalle: '«📣 Comunidad mayorista BDI…» + «🛒 Tienda online…»' },
    { valor: 'tepaso', texto: 'Te paso la tienda?', detalle: '«Hace unos meses me habias pedido la lista…»' },
    { valor: 'chusmear', texto: 'Pudiste chusmear la tienda?', detalle: '«Pudiste chusmear la tienda? Ya trabajas fundas…»' },
    { valor: 'facturaA', texto: 'Factura A', detalle: '«Me olvide de contarte, todos los precios son con iva…»' },
    { valor: 'novedad', texto: 'Novedad o videos', detalle: '«Nos entraron…» o «Te puedo compartir algunos videos…»' },
    { valor: 'cierre', texto: 'Comunidad o videos de cierre', detalle: '«…queres que te sume?» o «Queres que te pase videos…»' },
  ],
  C: [
    { valor: 'compra', texto: 'Nada desde su compra' },
    { valor: 'r1', texto: 'Cómo se vendió', detalle: '«Queria consultarte, como se vendieron las fundas…»' },
    { valor: 'r2', texto: 'Novedad', detalle: '«Nos entraron…»' },
    { valor: 'cierre', texto: 'Descuento', detalle: '«Te cuento que si el pedido pasa el $1.000.000…»' },
  ],
  B: [
    { valor: 'dijo', texto: 'Nada desde que me dijo que compraba' },
    { valor: 'r1', texto: 'Qué lo frenó', detalle: '«…Hubo algo que te freno para hacerlo?»' },
    { valor: 'r2', texto: 'Descuento o mínimo', detalle: '«…si el pedido pasa el $1.000.000…» o «…el minimo es de $100.000…»' },
    { valor: 'cierre', texto: 'Comunidad o videos de cierre', detalle: '«…queres que te sume?» o «Queres que te pase videos…»' },
  ],
  E: [
    { valor: 'tienda1', texto: 'La tienda para emprendedores', detalle: '«Te paso la tienda mayorista… 💵 Mínimo de $100.000»' },
    { valor: 'r1', texto: 'Mínimo + comunidad', detalle: '«Te cuento que el minimo es de $100.000… Si queres te sumo…»' },
  ],
}

/** La pregunta que sigue, o `null` si ya hay resultado. */
export function siguientePregunta(sabe: LoQueSabe, r: Respuestas): Pregunta | null {
  if (!sabe.esCliente && !r.dijo)
    return { campo: 'dijo', texto: '¿Te dijo que iba a comprar?', opciones: [{ valor: 'si', texto: 'Sí' }, { valor: 'no', texto: 'No' }] }
  const t = tipoDe(sabe, r)
  if (!t)
    return {
      campo: 'perfil',
      texto: '¿Tiene local o es emprendedor?',
      opciones: [{ valor: 'local', texto: 'Local' }, { valor: 'emprendedor', texto: 'Emprendedor' }],
    }
  const tiempo = r.tiempo
  if (t !== 'E' && !tiempo)
    return {
      campo: 'tiempo',
      texto: '¿Hace cuánto le escribiste por última vez?',
      opciones: [{ valor: 'corto', texto: 'Menos de 2 meses' }, { valor: 'largo', texto: 'Más de 2 meses' }],
    }
  if (t !== 'E' && tiempo === 'largo') return null
  if (!r.ultimo) return { campo: 'ultimo', texto: '¿Qué fue lo último que le mandaste?', opciones: ULTIMO[t] }
  return null
}

const NOMBRE: Record<Tipo, string> = { C: 'Ya compró', B: 'Iba a comprar', A: 'Local', E: 'Emprendedor' }

/** El cierre según la comunidad: si no está, se le ofrece; si está, videos. Sin saber, los dos. */
function cierres(sabe: LoQueSabe): Mensaje[] {
  if (sabe.enComunidad === false) return [{ etiqueta: null, texto: M.cierreComunidad }]
  if (sabe.enComunidad === true) return [{ etiqueta: null, texto: M.cierreVideos }]
  return [
    { etiqueta: 'Si no está en la comunidad', texto: M.cierreComunidad },
    { etiqueta: 'Si ya está', texto: M.cierreVideos },
  ]
}

const PROXIMO: Agendar[] = [{ dias: 3, etiqueta: null }]
/** Vuelta nueva: 15 días si tiene más de un local, 30 si tiene uno. A los que compraron, 30. */
const VUELTA_LOCAL: Agendar[] = [
  { dias: 15, etiqueta: 'Más de un local' },
  { dias: 30, etiqueta: 'Un local' },
]
const VUELTA_CLIENTE: Agendar[] = [{ dias: 30, etiqueta: null }]

/** El resultado, cuando `siguientePregunta` ya no tiene nada que preguntar. */
export function resultado(sabe: LoQueSabe, r: Respuestas): Resultado | null {
  if (siguientePregunta(sabe, r)) return null
  const t = tipoDe(sabe, r)
  if (!t) return null
  const R = (paso: string, mensajes: Mensaje[], agendar: Agendar[], nota: string | null = null): Resultado => ({
    situacion: `${NOMBRE[t]} · ${paso}`,
    mensajes,
    agendar,
    nota,
  })
  const uno = (texto: string): Mensaje[] => [{ etiqueta: null, texto }]
  const tiempo = r.tiempo

  if (t !== 'E' && tiempo === 'largo') {
    if (t === 'A') return R('Recaptar', uno(M.tepaso), PROXIMO, 'Si contesta que sí, le pasás la tienda.')
    if (t === 'C') return R('Recaptar', uno(M.vendio), PROXIMO)
    return R('Recaptar', uno(M.frenoLargo), PROXIMO, 'Si sabés el mes, queda mejor: «En julio me habias dicho…».')
  }

  const u = r.ultimo
  if (t === 'E') {
    if (u === 'tienda1')
      return R('Único recontacto', uno(M.emprendedor), [], 'Es el único. Si no contesta, no le escribís más: le llegan las novedades por la comunidad.')
    return R('Listo', [], [], 'No le escribas más. Le llegan las novedades por la comunidad.')
  }

  if (t === 'A') {
    if (u === 'tienda0') return R('1º', uno(M.chusmear), PROXIMO)
    if (u === 'viejo' || u === 'tepaso') return R('1º', uno(M.facturaA), PROXIMO)
    if (u === 'chusmear' || u === 'facturaA')
      return R(
        '2º',
        sabe.novedad.trim()
          ? [
              { etiqueta: 'Novedad', texto: conPregunta(sabe.novedad, true) },
              { etiqueta: 'Si esta semana no hay novedad: videos', texto: M.videos },
            ]
          : [{ etiqueta: 'No hay novedad cargada: videos', texto: M.videos }],
        PROXIMO,
      )
    if (u === 'novedad') return R('3º · Cierre', cierres(sabe), VUELTA_LOCAL, sabe.enComunidad === true ? null : 'Si en el 2º le ofreciste videos, mandá el de comunidad.')
    if (u === 'cierre') return R('Vuelta terminada', [], VUELTA_LOCAL, 'No le escribas hasta la vuelta nueva. Esa vuelta arranca con algo nuevo.')
  }

  if (t === 'C') {
    if (u === 'compra') return R('1º', uno(M.vendio), PROXIMO)
    if (u === 'r1') return R('2º', uno(conPregunta(sabe.novedad, false)), PROXIMO)
    if (u === 'r2') return R('3º · Cierre', uno(M.descuento), VUELTA_CLIENTE)
    if (u === 'cierre') return R('Vuelta terminada', [], VUELTA_CLIENTE, 'A los que compraron no se los suelta: vuelta nueva a los 30 días.')
  }

  if (t === 'B') {
    if (u === 'dijo') return R('1º', uno(M.frenoCorto), PROXIMO, 'Cambiá «unos dias» por el tiempo real: «hace una semana», «la semana pasada».')
    if (u === 'r1') {
      const p = r.perfil || sabe.perfil
      if (p === 'local') return R('2º', uno(M.descuento), PROXIMO)
      if (p === 'emprendedor') return R('2º', uno(M.minimo), PROXIMO)
      return R(
        '2º',
        [
          { etiqueta: 'Si tiene local: descuento', texto: M.descuento },
          { etiqueta: 'Si es emprendedor: mínimo', texto: M.minimo },
        ],
        PROXIMO,
      )
    }
    if (u === 'r2') return R('3º · Cierre', cierres(sabe), VUELTA_LOCAL)
    if (u === 'cierre') return R('Vuelta terminada', [], VUELTA_LOCAL, 'No le escribas hasta la vuelta nueva. Esa vuelta arranca con algo nuevo.')
  }
  return null
}
