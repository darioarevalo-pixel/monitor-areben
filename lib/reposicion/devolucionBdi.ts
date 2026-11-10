/**
 * La devolución grande de fundas de BDI, del local al depósito (Darío, 4/10-nov-2026). Puro.
 *
 * El 4-nov Darío decidió qué fundas vuelven (página «Fundas BDI por antigüedad» y los PDF
 * `devolucion-bdi-*.pdf`):
 * - **Se cierran** (85 diseños): ya no se venden en el local. Vuelve TODO lo del local.
 * - **Queda 1 por modelo** (106 diseños): vuelve todo menos 1 de cada modelo. Si hay una sola, se queda.
 *
 * 🔑 La cantidad sale del stock del DÍA (no de la foto del 4-nov), con esa regla. Los productos se cruzaron
 * por nombre contra Gestión Nube el 10-nov-2026 y quedaron por id. «AG GLASS CASE SILVER» ya no está en
 * Gestión Nube y no entra.
 *
 * ⏳ Es de esta semana: BDI pasa al ERP el 14-nov y la devolución tiene que estar transferida antes.
 */

import type { FilaVentas } from './porVentas'

const CERRAR = new Set([
  '256850', '308523', '337214', '337215', '337217', '348526', '381962', '481245', '481251', '607145',
  '607147', '640935', '640936', '640937', '640938', '640939', '640940', '640941', '640942', '640943',
  '805285', '805286', '805287', '805288', '805289', '805290', '805291', '805292', '805296', '831723',
  '831724', '831726', '831727', '831728', '831729', '831730', '831731', '831732', '831734', '831735',
  '831736', '831984', '831985', '831986', '831987', '835373', '851529', '910897', '937279', '937280',
  '937281', '937283', '937284', '937285', '937288', '937290', '937291', '937292', '937293', '937294',
  '937295', '1001612', '1001613', '1001614', '1001615', '1001616', '1001617', '1001618', '1001619',
  '1006898', '1006900', '1007130', '1007131', '1007132', '1007137', '1007138', '1007139', '1010587',
  '1010588', '1013178', '1038198', '1038199', '1040148', '1044564', '1044565',
])

const QUEDA_1 = new Set([
  '337213', '348522', '348523', '411260', '416341', '481244', '481246', '481247', '481248', '481249',
  '481253', '481254', '481255', '607139', '607140', '607141', '607142', '607143', '607146', '607148',
  '607149', '640917', '640919', '640920', '640921', '640922', '640923', '640924', '640925', '640926',
  '640927', '640928', '640929', '640930', '640931', '640932', '640933', '937286', '937287', '1006902',
  '1006903', '1006904', '1006905', '1007125', '1007126', '1007127', '1007128', '1007129', '1007133',
  '1007134', '1007135', '1007136', '1012886', '1021890', '1021891', '1038195', '1038196', '1038200',
  '1051797', '1051799', '1051800', '1051802', '1051803', '1051804', '1051805', '1051807', '1051808',
  '1051809', '1051810', '1051812', '1051813', '1051814', '1051815', '1051816', '1051818', '1051819',
  '1051820', '1100556', '1100557', '1100558', '1100559', '1100560', '1100562', '1100563', '1100564',
  '1100565', '1100566', '1100567', '1100568', '1100569', '1100570', '1100571', '1100572', '1100573',
  '1100574', '1100575', '1100576', '1100577', '1100578', '1100579', '1100580', '1100581', '1138598',
  '1138599', '1138600', '1138601',
])

export type GrupoBdi = 'cierra' | 'queda-1'

export function grupoBdi(pid: string | number): GrupoBdi | null {
  const p = String(pid)
  return CERRAR.has(p) ? 'cierra' : QUEDA_1.has(p) ? 'queda-1' : null
}

/** Cuántas vuelven de esta variante con el stock del local de hoy. */
export function devolverBdi(pid: string | number, local: number): number {
  const g = grupoBdi(pid)
  const l = Math.max(0, local || 0)
  return g === 'cierra' ? l : g === 'queda-1' ? Math.max(0, l - 1) : 0
}

/**
 * Las filas de BDI con el «devolver» de esta devolución en vez del de la reposición: así la Propuesta
 * de siempre muestra la lista decidida. Lo que no está en ninguna de las dos listas no vuelve.
 */
export function filasDevolucionBdi(filas: FilaVentas[]): FilaVentas[] {
  return filas.map((f) => ({ ...f, d: { ...f.d, devolver: devolverBdi(f.it.pid, f.it.local) } }))
}
