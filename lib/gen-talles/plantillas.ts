/**
 * Plantillas de la Tabla de talles, copiadas TAL CUAL del legacy (GT_M +
 * GEN_TALLES_PLANTILLAS, index.html:7215-7243). Son la fuente de verdad de qué
 * prendas hay, con qué medidas, talles por defecto y textos de "cómo se mide".
 *
 * Se copian literales (no se "mejoran"): el HTML que genera esta sección se pega en
 * las descripciones de Tienda Nube, así que cualquier cambio de wording o de talles
 * cambia lo que ve el cliente. Editar acá para sumar/cambiar prendas.
 */

export type Medida = { letra: string; nombre: string; comoMedir: string }
export type Plantilla = { nombre: string; unidad: string; talles: string[]; medidas: Medida[]; diagramaUrl: string }

/** Textos de "cómo medir" reutilizables. Port de GT_M. */
const GT_M = {
  cintura: { nombre: 'Contorno cintura', comoMedir: 'Medir alrededor de toda la cintura.' },
  cadera: { nombre: 'Contorno cadera', comoMedir: 'Medir alrededor de toda la cadera.' },
  tiro: { nombre: 'Tiro', comoMedir: 'Medir desde el borde superior delantero hasta la costura de unión de las piernas.' },
  largoPant: { nombre: 'Largo', comoMedir: 'Medir desde el extremo de la cintura hacia abajo.' },
  largoTop: { nombre: 'Largo', comoMedir: 'Medir desde el hombro hasta el ruedo.' },
  largoTotal: { nombre: 'Largo total', comoMedir: 'Medir desde el hombro hasta la entrepierna.' },
  busto: { nombre: 'Contorno busto', comoMedir: 'Medir alrededor de la parte más ancha del busto.' },
  hombros: { nombre: 'Ancho de hombros', comoMedir: 'Medir de un hombro al otro por la parte superior.' },
  manga: { nombre: 'Largo de manga', comoMedir: 'Medir desde el hombro hasta el puño.' },
} as const

const m = (letra: string, base: { nombre: string; comoMedir: string }): Medida => ({ letra, nombre: base.nombre, comoMedir: base.comoMedir })

const TALLES_LETRA = ['S', 'M', 'L', 'XL']
const TALLES_NUM = ['34', '36', '38', '40', '42', '44']

/** Plantillas por tipo de prenda. Port literal de GEN_TALLES_PLANTILLAS. */
export const GEN_TALLES_PLANTILLAS: Record<string, Plantilla> = {
  top: { nombre: 'Top', unidad: 'cm', talles: TALLES_LETRA, medidas: [m('A', GT_M.busto), m('B', GT_M.largoTop), m('C', GT_M.hombros)], diagramaUrl: '' },
  remera: { nombre: 'Remera', unidad: 'cm', talles: TALLES_LETRA, medidas: [m('A', GT_M.busto), m('B', GT_M.largoTop), m('C', GT_M.hombros), m('D', GT_M.manga)], diagramaUrl: '' },
  body: { nombre: 'Body', unidad: 'cm', talles: TALLES_LETRA, medidas: [m('A', GT_M.busto), m('B', GT_M.largoTotal), m('C', GT_M.hombros)], diagramaUrl: '' },
  vestido: { nombre: 'Vestido', unidad: 'cm', talles: TALLES_LETRA, medidas: [m('A', GT_M.busto), m('B', GT_M.cintura), m('C', GT_M.cadera), m('D', GT_M.largoTop)], diagramaUrl: '' },
  jean: { nombre: 'Jean', unidad: 'cm', talles: TALLES_NUM, medidas: [m('A', GT_M.largoPant), m('B', GT_M.cadera), m('C', GT_M.cintura), m('D', GT_M.tiro)], diagramaUrl: 'https://i.postimg.cc/zXSFyYRY/Captura-de-pantalla-2026-06-07-a-la(s)-8-36-18-p-m.png' },
  pantalon: { nombre: 'Pantalón', unidad: 'cm', talles: TALLES_NUM, medidas: [m('A', GT_M.largoPant), m('B', GT_M.cadera), m('C', GT_M.cintura), m('D', GT_M.tiro)], diagramaUrl: '' },
  short: { nombre: 'Short', unidad: 'cm', talles: TALLES_NUM, medidas: [m('A', GT_M.largoPant), m('B', GT_M.cadera), m('C', GT_M.cintura), m('D', GT_M.tiro)], diagramaUrl: '' },
  bermuda: { nombre: 'Bermuda', unidad: 'cm', talles: TALLES_NUM, medidas: [m('A', GT_M.largoPant), m('B', GT_M.cadera), m('C', GT_M.cintura), m('D', GT_M.tiro)], diagramaUrl: '' },
  pollera: { nombre: 'Pollera', unidad: 'cm', talles: TALLES_NUM, medidas: [m('A', GT_M.largoPant), m('B', GT_M.cadera), m('C', GT_M.cintura)], diagramaUrl: '' },
  falda: { nombre: 'Falda', unidad: 'cm', talles: TALLES_NUM, medidas: [m('A', GT_M.largoPant), m('B', GT_M.cadera), m('C', GT_M.cintura)], diagramaUrl: '' },
  buzo: { nombre: 'Buzo', unidad: 'cm', talles: TALLES_LETRA, medidas: [m('A', GT_M.busto), m('B', GT_M.largoTop), m('C', GT_M.hombros), m('D', GT_M.manga)], diagramaUrl: '' },
  sweater: { nombre: 'Sweater', unidad: 'cm', talles: TALLES_LETRA, medidas: [m('A', GT_M.busto), m('B', GT_M.largoTop), m('C', GT_M.hombros), m('D', GT_M.manga)], diagramaUrl: '' },
  campera: { nombre: 'Campera', unidad: 'cm', talles: TALLES_LETRA, medidas: [m('A', GT_M.busto), m('B', GT_M.largoTop), m('C', GT_M.hombros), m('D', GT_M.manga)], diagramaUrl: '' },
}

/** El estado guardado de una tabla vinculada a un producto de TN (KV `talles`). */
export type TablaGuardada = {
  tipo: string
  talles: string
  gtData: Record<string, string>
  name?: string
  ts?: string
}
