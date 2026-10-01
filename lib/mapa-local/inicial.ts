/**
 * El mapa con el que arranca la sección, antes de que nadie lo edite: el armado propuesto el
 * 30-sep-2026 sobre el plano y las fotos del local. ⚠️ **Es un borrador para corregir en pantalla**,
 * ⛔ no una medición: los anchos (0,75 m) los dio Bruno, las alturas salen de la regla de largos.
 *
 * El recorrido: se entra, la pared izquierda corta (I01–I02) y la isla quedan a la vista desde la
 * vidriera; la pared derecha (D01–D12) se camina de la entrada al fondo, donde están los
 * cambiadores. ⇒ colección adelante, un módulo de corte (D08) y el sale al fondo.
 */

import type { LineaBarra, MapaLocal, Modulo, Nivel, TipoCfg } from './tipos'

const ARRIBA_CORTOS = ['TOP', 'BABY TEE', 'MUSCULOSA', 'REMERA', 'BODY', 'CORSET', 'STRAPLESS']
const ABAJO_CORTOS = ['TOP', 'BABY TEE', 'MUSCULOSA', 'REMERA', 'BODY']
const PARTE_DE_ABAJO = ['MINI', 'SHORT', 'BERMUDA', 'SKORT']
const CAMISAS = ['BLUSA', 'CAMISA', 'FALDA', 'POLLERA']
const ABRIGOS = ['SWEATER', 'CARDIGAN', 'BUZO', 'CAMPERA', 'CHALECO']
const LARGOS = ['VESTIDO', 'MONO', 'JEAN', 'PANTALON']

const n = (pos: Nivel['pos'], alturaCm: number, linea: LineaBarra, tipos: string[], cupo: number | null = null): Nivel => ({ pos, alturaCm, linea, tipos, cupo })
const der = (i: number, orden: number, niveles: Nivel[]): Modulo => ({ codigo: `D${String(i).padStart(2, '0')}`, pared: 'der', orden, anchoCm: 75, niveles })

export const TIPOS_INICIALES: TipoCfg[] = [
  ...['TOP', 'BABY TEE', 'BODY', 'STRAPLESS'].map((tipo) => ({ tipo, largo: 'L1' as const, perchasPorM: 22, cuelga: true })),
  { tipo: 'MUSCULOSA', largo: 'L1', perchasPorM: 24, cuelga: true },
  { tipo: 'REMERA', largo: 'L1', perchasPorM: 18, cuelga: true },
  { tipo: 'CORSET', largo: 'L1', perchasPorM: 18, cuelga: true },
  ...['MINI', 'SHORT', 'SKORT'].map((tipo) => ({ tipo, largo: 'L1' as const, perchasPorM: 20, cuelga: true })),
  { tipo: 'BERMUDA', largo: 'L1', perchasPorM: 18, cuelga: true },
  { tipo: 'BLUSA', largo: 'L2', perchasPorM: 18, cuelga: true },
  { tipo: 'CAMISA', largo: 'L2', perchasPorM: 16, cuelga: true },
  { tipo: 'FALDA', largo: 'L2', perchasPorM: 18, cuelga: true },
  { tipo: 'POLLERA', largo: 'L2', perchasPorM: 18, cuelga: true },
  { tipo: 'SWEATER', largo: 'L2', perchasPorM: 10, cuelga: true },
  { tipo: 'CARDIGAN', largo: 'L2', perchasPorM: 10, cuelga: true },
  { tipo: 'BUZO', largo: 'L2', perchasPorM: 10, cuelga: true },
  { tipo: 'CAMPERA', largo: 'L2', perchasPorM: 8, cuelga: true },
  { tipo: 'CHALECO', largo: 'L2', perchasPorM: 12, cuelga: true },
  { tipo: 'VESTIDO', largo: 'L3', perchasPorM: 16, cuelga: true },
  { tipo: 'MONO', largo: 'L3', perchasPorM: 14, cuelga: true },
  { tipo: 'JEAN', largo: 'L3', perchasPorM: 14, cuelga: true },
  { tipo: 'PANTALON', largo: 'L3', perchasPorM: 14, cuelga: true },
  ...['BOMBACHA', 'CORPIÑO', 'FAJA', 'CINTO', 'ACCESORIO', 'PAÑUELO', 'MINI BAG', 'TOTE BAG', 'SHOULDER BAG', 'CHOKER', 'CHOCKER'].map((tipo) => ({ tipo, largo: 'L1' as const, perchasPorM: 20, cuelga: false })),
]

export const MAPA_INICIAL: MapaLocal = {
  version: 1,
  tipos: TIPOS_INICIALES,
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
