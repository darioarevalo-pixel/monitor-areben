/**
 * Lo que se deriva de las recepciones, puro y sin red. Es lo que hace que la sección conteste
 * preguntas en vez de mostrar filas: una OC suelta no decide nada, el agregado por proveedor sí.
 *
 * ⛔ Nada de acá pide datos. Las filas llegan de `api/datos?recurso=recepciones`.
 */

export type LineaRecepcion = {
  id: string
  oc_ref: string
  orden: number
  sku: string | null
  codigo_barras: string | null
  nombre: string | null
  talle: string | null
  color: string | null
  cantidad_pedida: number
  cantidad_contada: number
  diferencia: number
  observaciones: string | null
  es_nuevo: boolean
  /** Las fotos que manda Ingresos. `null` en todo lo anterior al 1-sep-2026: antes no las mandaba. */
  imagen_url: string | null
  imagen_thumb_url: string | null
  en_gn: boolean | null
  producto_id: string | null
}

export type Recepcion = {
  id: string
  store: string
  oc_id: number
  oc_label: string | null
  oc_estado: string | null
  fecha_compra: string | null
  fecha_ingreso: string | null
  /** Cuándo se confirmó la orden del otro lado. Es el único instante que el emisor manda SIEMPRE. */
  confirmada_at: string | null
  /**
   * 🔴 **Opcionales porque el servidor los BORRA** cuando el usuario no tiene el sub
   * `recepciones.proveedores` (ver `api/_recepciones.js`). No es que a veces vengan vacíos: a veces
   * el campo no viene. Declararlos requeridos dejaba que la pantalla los leyera sin preguntar.
   */
  proveedor_id?: number | null
  proveedor_nombre?: string | null
  productos: number
  lineas: number
  unidades_pedidas: number
  unidades_contadas: number
  diferencia_unidades: number
  lineas_con_diferencia: number
  unidades_faltantes: number
  unidades_sobrantes: number
  lineas_nuevas: number
  cumplimiento: number | null
  totales_coinciden: boolean
  lineas_recibidas: number
  espejo_consultado: boolean
  skus_sin_espejo: number | null
  recibido_en: string
}

/**
 * La fecha con la que se muestra una orden, ya escrita para leer.
 *
 * 🔴 **`recibido_en` NO es la fecha del ingreso: es cuándo lo agarró el monitor.** El día que se
 * prendió el envío entraron 79 órdenes del historial en el mismo minuto, así que la lista mostraba
 * **27/8/2026 en 62 órdenes que eran de junio y julio**. Con la fecha como primera columna eso pasa
 * de detalle a mentira de portada. El orden de preferencia es el de cuánto se parece cada dato a
 * "cuándo entró la mercadería": la fecha de ingreso que carga una persona, si no el instante en que
 * se confirmó la orden (viene en las 90, sin excepción), y recién al final cuándo nos llegó.
 *
 * 🔑 **La fecha sola se parte a mano y ⛔ no pasa por `new Date`.** `new Date('2026-08-25')` es
 * medianoche **UTC**, que en Argentina es el 24 a las 21:00: formatearla corre todas las fechas un
 * día para atrás. Sólo el instante completo, que sí trae zona, se puede formatear.
 */
export function fechaDeIngreso(
  r: Pick<Recepcion, 'fecha_ingreso' | 'confirmada_at' | 'recibido_en'>,
): string {
  if (r.fecha_ingreso) {
    const [a, m, d] = r.fecha_ingreso.slice(0, 10).split('-')
    if (a && m && d) return `${Number(d)}/${Number(m)}/${a}`
  }
  const instante = r.confirmada_at || r.recibido_en
  if (!instante) return '—'
  const f = new Date(instante)
  return Number.isNaN(f.getTime()) ? '—' : f.toLocaleDateString('es-AR')
}

/** Sin proveedor identificado no se puede agrupar: todas caerían en el mismo montón que miente. */
export const SIN_PROVEEDOR = '— sin proveedor —'

export type FilaProveedor = {
  clave: string
  nombre: string
  ocs: number
  unidades_pedidas: number
  unidades_contadas: number
  unidades_faltantes: number
  unidades_sobrantes: number
  /** contadas / pedidas del proveedor entero. `null` si nunca se le pidió nada. */
  cumplimiento: number | null
  ocs_con_diferencia: number
}

/**
 * El agregado que decide: de cada proveedor, cuánto de lo que se le pidió llegó de verdad.
 *
 * 🔑 **Se suma por unidades, no promediando los cumplimientos de cada OC.** Un promedio de
 * porcentajes le da el mismo peso a una OC de 4 unidades que a una de 900, y el proveedor que
 * falla en las grandes sale mejor que el que falla en una chica.
 */
export function porProveedor(recs: Recepcion[]): FilaProveedor[] {
  const mapa = new Map<string, FilaProveedor>()
  for (const r of recs) {
    const clave = r.proveedor_id != null ? `id:${r.proveedor_id}` : r.proveedor_nombre ? `n:${r.proveedor_nombre}` : 'sin'
    let f = mapa.get(clave)
    if (!f) {
      f = {
        clave,
        nombre: r.proveedor_nombre || SIN_PROVEEDOR,
        ocs: 0,
        unidades_pedidas: 0,
        unidades_contadas: 0,
        unidades_faltantes: 0,
        unidades_sobrantes: 0,
        cumplimiento: null,
        ocs_con_diferencia: 0,
      }
      mapa.set(clave, f)
    }
    f.ocs += 1
    f.unidades_pedidas += r.unidades_pedidas
    f.unidades_contadas += r.unidades_contadas
    f.unidades_faltantes += r.unidades_faltantes
    f.unidades_sobrantes += r.unidades_sobrantes
    if (r.unidades_faltantes > 0 || r.unidades_sobrantes > 0) f.ocs_con_diferencia += 1
  }
  const filas = [...mapa.values()]
  for (const f of filas) {
    f.cumplimiento = f.unidades_pedidas > 0 ? f.unidades_contadas / f.unidades_pedidas : null
  }
  // El que más unidades dejó de entregar arriba: es el que hay que llamar.
  return filas.sort((a, b) => b.unidades_faltantes - a.unidades_faltantes || b.unidades_pedidas - a.unidades_pedidas)
}

export type Resumen = {
  ocs: number
  unidades_pedidas: number
  unidades_contadas: number
  unidades_faltantes: number
  unidades_sobrantes: number
  cumplimiento: number | null
  ocs_con_diferencia: number
  lineas_nuevas: number
  /** OCs cuyos totales no cierran contra sus propios renglones. Es un problema del EMISOR. */
  ocs_inconsistentes: number
}

export function resumen(recs: Recepcion[]): Resumen {
  const r: Resumen = {
    ocs: recs.length,
    unidades_pedidas: 0,
    unidades_contadas: 0,
    unidades_faltantes: 0,
    unidades_sobrantes: 0,
    cumplimiento: null,
    ocs_con_diferencia: 0,
    lineas_nuevas: 0,
    ocs_inconsistentes: 0,
  }
  for (const x of recs) {
    r.unidades_pedidas += x.unidades_pedidas
    r.unidades_contadas += x.unidades_contadas
    r.unidades_faltantes += x.unidades_faltantes
    r.unidades_sobrantes += x.unidades_sobrantes
    r.lineas_nuevas += x.lineas_nuevas
    if (x.unidades_faltantes > 0 || x.unidades_sobrantes > 0) r.ocs_con_diferencia += 1
    if (!x.totales_coinciden) r.ocs_inconsistentes += 1
  }
  r.cumplimiento = r.unidades_pedidas > 0 ? r.unidades_contadas / r.unidades_pedidas : null
  return r
}

/**
 * Los renglones que hay que mirar, en el orden en que duelen: primero lo que falta (y más falta),
 * después lo que sobra. Los que cerraron no entran.
 */
export function renglonesQueNoCerraron<T extends LineaRecepcion>(lineas: T[]): T[] {
  return lineas
    .filter((l) => l.diferencia !== 0)
    .sort((a, b) => a.diferencia - b.diferencia || (a.sku || '').localeCompare(b.sku || ''))
}

/**
 * Lo que llegó y **no existe en Gestión Nube**: hay que darlo de alta o no se puede vender.
 *
 * ⛔ `en_gn === null` NO entra. Null es "no se pudo preguntar", y meterlo acá convertiría un espejo
 * caído en una lista de altas pendientes que nadie pidió.
 */
export function sinAltaEnGN<T extends LineaRecepcion>(lineas: T[]): T[] {
  return lineas.filter((l) => l.en_gn === false)
}

/** `0.9231` → `92%`. `null` → `—`, que es lo único honesto cuando no hay contra qué comparar. */
export function porcentaje(v: number | null | undefined, decimales = 0): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(decimales)}%`
}

/** Cómo se pinta un cumplimiento. El corte de 0,98 sale de que a 2% ya es un renglón entero. */
export function tonoDeCumplimiento(v: number | null): 'ok' | 'aviso' | 'malo' | 'neutro' {
  if (v == null) return 'neutro'
  if (v >= 0.98 && v <= 1.02) return 'ok'
  if (v >= 0.9) return 'aviso'
  return 'malo'
}
