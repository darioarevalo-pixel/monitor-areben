/**
 * El mapa con el que arranca la sección, antes de que nadie lo edite: el armado propuesto el
 * 30-sep-2026 sobre el plano y las fotos del local. ⚠️ **Es un borrador para corregir en pantalla**,
 * ⛔ no una medición: los anchos (0,75 m) los dio Bruno, las alturas salen de la regla de largos.
 *
 * El recorrido: se entra, la pared izquierda corta (I01–I02) y la isla quedan a la vista desde la
 * vidriera; la pared derecha (D01–D12) se camina de la entrada al fondo, donde están los
 * cambiadores. ⇒ colección adelante, un módulo de corte (D08) y el sale al fondo.
 */

import type { LineaBarra, MapaLocal, Modulo, Nivel, Temporada, Temporadas, TipoCfg } from './tipos'

const ARRIBA_CORTOS = ['TOP', 'BABY TEE', 'MUSCULOSA', 'REMERA', 'BODY', 'CORSET', 'STRAPLESS']
const ABAJO_CORTOS = ['TOP', 'BABY TEE', 'MUSCULOSA', 'REMERA', 'BODY']
const PARTE_DE_ABAJO = ['MINI', 'SHORT', 'BERMUDA', 'SKORT']
const CAMISAS = ['BLUSA', 'CAMISA', 'FALDA', 'POLLERA']
const ABRIGOS = ['SWEATER', 'CARDIGAN', 'BUZO', 'CAMPERA', 'CHALECO']
const LARGOS = ['VESTIDO', 'MONO', 'JEAN', 'PANTALON']

/**
 * Las familias de tipos que comparten barra. Las usa también el armado propuesto (`proponer.ts`),
 * así que una barra propuesta acepta lo mismo que una del armado inicial.
 */
export const FAMILIAS: { nombre: string; tipos: string[] }[] = [
  { nombre: 'Tops y remeras', tipos: ARRIBA_CORTOS },
  { nombre: 'Minis y shorts', tipos: PARTE_DE_ABAJO },
  { nombre: 'Blusas, camisas y faldas', tipos: CAMISAS },
  { nombre: 'Abrigos', tipos: ABRIGOS },
  { nombre: 'Vestidos y largos', tipos: LARGOS },
]

const n = (pos: Nivel['pos'], alturaCm: number, linea: LineaBarra, tipos: string[], cupo: number | null = null): Nivel => ({ pos, alturaCm, linea, tipos, cupo })
const der = (i: number, orden: number, niveles: Nivel[]): Modulo => ({ codigo: `D${String(i).padStart(2, '0')}`, pared: 'der', orden, anchoCm: 75, niveles })

/**
 * Las fechas de cada temporada con que arranca la sección. ⚠️ **Son una propuesta para corregir en
 * pantalla** (1-oct-2026), ⛔ no un dato. Se pisan dos veces por año, y lo que se pisa es el cambio
 * de temporada: en marzo y del 15-sep al 15-oct están despiertas las dos.
 * 🔑 El invierno llega al **15-oct** y ⛔ al 30-sep por lo medido el 1-oct-2026: en las dos últimas
 * semanas de septiembre el outlet colgado del local seguía vendiendo sweaters (ARIZONA 14 u, DALLAS 10,
 * VIENNA 9).
 */
export const TEMPORADAS_INICIALES: Temporadas = {
  verano: { desde: '09-15', hasta: '03-31' },
  invierno: { desde: '03-01', hasta: '10-15' },
}

/** Los tipos que sólo van al salón en verano, y los que sólo en invierno (los abrigos). El resto, todo el año. */
const DE_VERANO = ['MUSCULOSA', 'SHORT', 'SKORT', 'BERMUDA', 'BIKINI']
const temporadaInicial = (tipo: string): Temporada => (DE_VERANO.includes(tipo) ? 'verano' : ABRIGOS.includes(tipo) ? 'invierno' : 'todo')

const TIPOS_SIN_TEMPORADA: Omit<TipoCfg, 'temporada'>[] = [
  ...['TOP', 'BABY TEE', 'BODY', 'STRAPLESS'].map((tipo) => ({ tipo, largo: 'L1' as const, perchasPorM: 22, topePorM: null, cuelga: true })),
  { tipo: 'MUSCULOSA', largo: 'L1', perchasPorM: 24, topePorM: null, cuelga: true },
  { tipo: 'REMERA', largo: 'L1', perchasPorM: 18, topePorM: null, cuelga: true },
  { tipo: 'CORSET', largo: 'L1', perchasPorM: 18, topePorM: null, cuelga: true },
  ...['MINI', 'SHORT', 'SKORT'].map((tipo) => ({ tipo, largo: 'L1' as const, perchasPorM: 20, topePorM: null, cuelga: true })),
  { tipo: 'BERMUDA', largo: 'L1', perchasPorM: 18, topePorM: null, cuelga: true },
  // ⚠️ El 1-oct-2026 ⛔ no había ninguna bikini en el Local: el tipo está para que en verano tenga temporada.
  { tipo: 'BIKINI', largo: 'L1', perchasPorM: 20, topePorM: null, cuelga: true },
  // 🔑 el tope de BLUSA lo midió Bruno (30-sep): 38 en una barra de 0,75 m ⇒ 51/m (51 × 0,75 = 38,25).
  { tipo: 'BLUSA', largo: 'L2', perchasPorM: 18, topePorM: 51, cuelga: true },
  { tipo: 'CAMISA', largo: 'L2', perchasPorM: 16, topePorM: null, cuelga: true },
  { tipo: 'FALDA', largo: 'L2', perchasPorM: 18, topePorM: null, cuelga: true },
  { tipo: 'POLLERA', largo: 'L2', perchasPorM: 18, topePorM: null, cuelga: true },
  { tipo: 'SWEATER', largo: 'L2', perchasPorM: 10, topePorM: null, cuelga: true },
  { tipo: 'CARDIGAN', largo: 'L2', perchasPorM: 10, topePorM: null, cuelga: true },
  { tipo: 'BUZO', largo: 'L2', perchasPorM: 10, topePorM: null, cuelga: true },
  { tipo: 'CAMPERA', largo: 'L2', perchasPorM: 8, topePorM: null, cuelga: true },
  { tipo: 'CHALECO', largo: 'L2', perchasPorM: 12, topePorM: null, cuelga: true },
  { tipo: 'VESTIDO', largo: 'L3', perchasPorM: 16, topePorM: null, cuelga: true },
  { tipo: 'MONO', largo: 'L3', perchasPorM: 14, topePorM: null, cuelga: true },
  { tipo: 'JEAN', largo: 'L3', perchasPorM: 14, topePorM: null, cuelga: true },
  { tipo: 'PANTALON', largo: 'L3', perchasPorM: 14, topePorM: null, cuelga: true },
  ...['BOMBACHA', 'CORPIÑO', 'FAJA', 'CINTO', 'ACCESORIO', 'PAÑUELO', 'MINI BAG', 'TOTE BAG', 'SHOULDER BAG', 'CHOKER', 'CHOCKER'].map((tipo) => ({ tipo, largo: 'L1' as const, perchasPorM: 20, topePorM: null, cuelga: false })),
]

export const TIPOS_INICIALES: TipoCfg[] = TIPOS_SIN_TEMPORADA.map((t) => ({ ...t, temporada: temporadaInicial(t.tipo) }))

export const MAPA_INICIAL: MapaLocal = {
  version: 1,
  tipos: TIPOS_INICIALES,
  temporadas: TEMPORADAS_INICIALES,
  modulos: [
    { codigo: 'I01', pared: 'izq', orden: 1, anchoCm: 75, niveles: [n('frente', 175, 'nc', ['TOP', 'BABY TEE']), n('baja', 105, 'nc', CAMISAS)] },
    { codigo: 'I02', pared: 'izq', orden: 2, anchoCm: 75, niveles: [n('frente', 175, 'nc', ['TOP', 'BABY TEE']), n('baja', 105, 'nc', CAMISAS)] },
    { codigo: 'ISLA', pared: 'isla', orden: 3, anchoCm: 150, niveles: [n('simple', 160, 'nc', ['TOP', 'BLUSA', 'CAMISA', 'VESTIDO'], 18)] },
    der(1, 4, [n('alta', 180, 'nc', ARRIBA_CORTOS), n('baja', 105, 'nc', ABAJO_CORTOS)]),
    der(2, 5, [n('alta', 180, 'nc', ARRIBA_CORTOS), n('baja', 105, 'nc', ABAJO_CORTOS)]),
    der(3, 6, [n('alta', 180, 'nc', ARRIBA_CORTOS), n('baja', 105, 'nc', CAMISAS)]),
    der(4, 7, [n('alta', 180, 'nc', ARRIBA_CORTOS), n('baja', 105, 'nc', CAMISAS)]),
    der(5, 8, [n('alta', 180, 'nc', PARTE_DE_ABAJO), n('baja', 105, 'nc', PARTE_DE_ABAJO)]),
    der(6, 9, [n('simple', 165, 'nc', LARGOS)]),
    der(7, 10, [n('frente', 175, 'sale', ['TOP']), n('baja', 105, 'sale', ABRIGOS)]),
    der(8, 11, [n('alta', 180, 'sale', ARRIBA_CORTOS), n('baja', 105, 'sale', ABAJO_CORTOS)]),
    der(9, 12, [n('alta', 180, 'sale', ARRIBA_CORTOS), n('baja', 105, 'sale', CAMISAS)]),
    der(10, 13, [n('alta', 180, 'sale', PARTE_DE_ABAJO), n('baja', 105, 'sale', PARTE_DE_ABAJO)]),
    der(11, 14, [n('alta', 180, 'sale', ARRIBA_CORTOS), n('baja', 105, 'sale', ABRIGOS)]),
    der(12, 15, [n('simple', 165, 'sale', LARGOS)]),
  ],
}
