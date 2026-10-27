/**
 * Ajustes de stock con motivo (pestaña `erp › Ajustes`, paso 7): el conteo va al LIBRO (⛔ Excel) y lo aprueba un admin.
 * Puro: el handler (`api/_erp-ajustes.js`) lee la conciliación, las ventas con PIN y los ajustes del motor
 * (`motor/stock/ajuste.mjs`, sql/026), y esto arma la pantalla y valida lo que manda.
 *
 * 🔑 Hasta el corte GN sirve y el ERP es la PRUEBA (Bruno, 18-oct) ⇒ el ajuste mueve SÓLO el libro: ⛔ GN ni Tienda Nube.
 * La lista «A contar» es lo que la conciliación marca «El ERP dice otro stock» (TN = GN y el libro aparte, también en
 * Mercado Libre) y las prendas de las ventas que entraron con el PIN de la encargada (`detalle.contar`).
 */

export const LINEAS = ['bdi', 'zattia', 'stunned']
/** La base de cada línea (Stunned vive en la de Zattia). */
export const baseDe = (linea) => (linea === 'bdi' ? 'bdi' : 'zattia')

/** Los motivos (Bruno 18-oct, DECISIONES 8), en el orden de la pantalla. «Conteo» pide lo CONTADO; el resto, lo que sale. */
export const MOTIVOS = [
  { key: 'conteo', label: 'Conteo', pide: 'contado' },
  { key: 'fallado', label: 'Fallado', pide: 'sale' },
  { key: 'canje', label: 'Influencer / canje', pide: 'sale' },
  { key: 'regalo', label: 'Regalo / sorteo / donación', pide: 'sale' },
  { key: 'otro', label: 'Otro', pide: 'cantidad' },
]
export const NOMBRE_MOTIVO = Object.fromEntries(MOTIVOS.map((m) => [m.key, m.label]))

/** El depósito que mira cada tienda en la conciliación (copia de `DEPOSITOS_TN` del motor): el que se propone contar. */
export const DEPOSITO_DE_TIENDA = { bdi: 'deposito_minorista', zattia: 'local', stunned: 'local' }

/** Las clases de la conciliación que son trabajo de conteo. */
const A_CONTAR = new Set(['stock_tn/libro_aparte', 'stock_ml/libro_aparte'])

/** Qué dice cada aviso del motor, en palabras del equipo. */
export function textoDeAviso(a) {
  if (a.codigo === 'CONTEO_DE_DEPOSITO_RECIENTE') return `Este producto tiene un conteo de Depósito (C-${a.conteo}) de los últimos días: ese conteo ya entra solo al ERP. Si es el mismo, rechazá este ajuste para no contarlo dos veces.`
  if (a.codigo === 'LIBRO_SE_MOVIO') return `${a.sku || 'Un producto'}: el ERP se movió desde que se contó (${a.antes} → ${a.ahora}). La diferencia se aplica igual.`
  return a.codigo
}

/**
 * La lista «A contar» de una línea.
 * @param {{ linea: string, conciliacion: { fecha: string|null, calculadoEn?: string|null, grupos: any[] } | null, contar?: any[], ajustes?: any[], nombres?: Map<string, {nombre:string,talle:string}> }} x
 *   `contar` = ventas con `detalle.contar` (id, numero, deposito, ocurrida_en, contar[]); `ajustes` = los de `ajustesDe`.
 */
export function armarAContar({ linea, conciliacion, contar = [], ajustes = [], nombres = new Map() }) {
  // El último ajuste NO rechazado de cada prenda, para decir «ya está en A-n».
  const ultimo = new Map()
  for (const a of [...ajustes].sort((x, y) => y.numero - x.numero)) {
    if (a.estado === 'rechazado') continue
    for (const r of a.renglones || []) {
      const k = `${r.product_id}:${r.size_id}`
      if (!ultimo.has(k)) ultimo.set(k, { numero: a.numero, estado: a.estado, deposito: a.deposito, creadoEn: a.creado_en, resueltoEn: a.resuelto_en ?? null })
    }
  }
  // Un ajuste APROBADO antes de que se calculara la conciliación ya está adentro de ella: si la prenda igual ⛔ coincide,
  // vuelve a la lista (el conteo ⛔ la cerró). El que espera aprobación, o se aprobó después, la saca.
  const calculado = conciliacion?.calculadoEn ? new Date(conciliacion.calculadoEn).getTime() : null
  const laCierra = (aj) => aj && (aj.estado === 'para_aprobar' || calculado == null || !aj.resueltoEn || new Date(aj.resueltoEn).getTime() > calculado)
  const filas = new Map()
  for (const g of conciliacion?.grupos || []) {
    if (!A_CONTAR.has(`${g.tipo}/${g.clase}`)) continue
    for (const f of g.filas) {
      if (!f.producto || !f.talle) continue
      const k = `${f.producto}:${f.talle}`
      if (filas.has(k)) { filas.get(k).donde.push(g.tipo === 'stock_ml' ? 'Mercado Libre' : 'Tienda Nube'); continue }
      filas.set(k, {
        clave: k, producto: f.producto, talle: f.talle, nombre: f.nombre, talleNombre: f.talleNombre, sku: f.sku,
        fuente: 'conciliacion', donde: [g.tipo === 'stock_ml' ? 'Mercado Libre' : 'Tienda Nube'],
        tienda: f.tn, erp: f.erp, gn: f.gn, dias: f.dias, venta: null, deposito: DEPOSITO_DE_TIENDA[linea], ajuste: laCierra(ultimo.get(k)) ? ultimo.get(k) : null,
      })
    }
  }
  for (const v of contar) {
    for (const c of Array.isArray(v.contar) ? v.contar : []) {
      const k = `${c.product_id}:${c.size_id}`
      if (filas.has(k)) continue
      const nm = nombres.get(`${c.product_id}/${c.size_id}`)
      // El ajuste que llegó DESPUÉS de la venta la cierra; uno de antes, ⛔.
      const aj = ultimo.get(k)
      filas.set(k, {
        clave: k, producto: String(c.product_id), talle: String(c.size_id), nombre: nm?.nombre ?? null, talleNombre: nm?.talle ?? null, sku: null,
        fuente: 'contar', donde: [], tienda: null, erp: c.nivel ?? null, gn: null, dias: null,
        venta: { numero: v.numero, autoriza: c.autoriza ?? null, ocurridaEn: v.ocurrida_en }, deposito: v.deposito,
        ajuste: aj && new Date(aj.creadoEn) >= new Date(v.ocurrida_en) ? aj : null,
      })
    }
  }
  const lista = [...filas.values()]
  return {
    fecha: conciliacion?.fecha ?? null,
    pendientes: lista.filter((f) => !f.ajuste),
    enAjuste: lista.filter((f) => f.ajuste),
  }
}

const entero = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isInteger(Number(x))

/**
 * Lo que manda la pantalla, listo para `crearAjuste` del motor, o `{ error }`. La regla fina (negativos, signo, «Otro» con
 * porqué) la vuelve a mirar el motor: acá se corta lo que ⛔ tiene forma.
 */
export function leerCrearAjuste(body) {
  const b = body || {}
  if (!LINEAS.includes(b.linea)) return { error: 'Línea inválida' }
  const motivo = MOTIVOS.find((m) => m.key === b.motivo)
  if (!motivo) return { error: 'Elegí el motivo' }
  const deposito = String(b.deposito || '')
  if (!/^[a-z_]+$/.test(deposito)) return { error: 'Elegí el depósito' }
  const fuente = ['mano', 'conciliacion', 'contar'].includes(b.fuente) ? b.fuente : 'mano'
  const renglones = Array.isArray(b.renglones) ? b.renglones : []
  if (!renglones.length) return { error: 'Agregá al menos un producto' }
  if (renglones.length > 500) return { error: 'Más de 500 productos: partí el ajuste' }
  const out = []
  for (const r of renglones) {
    if (!entero(r?.producto) || !entero(r?.talle)) return { error: 'Un producto sin variante' }
    const v = motivo.pide === 'contado' ? r.contado : r.cantidad
    if (!entero(v)) return { error: `Falta ${motivo.pide === 'contado' ? 'lo contado' : 'la cantidad'} de ${r.sku || 'un producto'}` }
    // En pantalla «sale» se escribe en positivo («salen 2»): el motor lo recibe en negativo.
    const n = Number(v)
    out.push({
      product_id: Number(r.producto), size_id: Number(r.talle), sku: r.sku ? String(r.sku) : null, barcode: r.barcode ? String(r.barcode) : null,
      ...(motivo.pide === 'contado' ? { contado: n } : { cantidad: motivo.pide === 'sale' ? -Math.abs(n) : n }),
    })
  }
  return { linea: b.linea, deposito, motivo: motivo.key, detalle: String(b.detalle || '').trim() || null, fuente, renglones: out }
}

/** Un ajuste del motor como lo muestra la pantalla. */
export function filaDeAjuste(a, nombres = new Map()) {
  const renglones = (a.renglones || []).map((r) => {
    const nm = nombres.get(`${r.product_id}/${r.size_id}`)
    return {
      n: r.n, producto: String(r.product_id), talle: String(r.size_id), sku: r.sku, nombre: nm?.nombre ?? null, talleNombre: nm?.talle ?? null,
      antes: r.antes, contado: r.contado, diferencia: r.diferencia, despues: r.antes + r.diferencia, ahora: r.ahora ?? null,
    }
  })
  return {
    id: a.id, numero: a.numero, linea: a.linea, deposito: a.deposito, motivo: a.motivo, motivoNombre: NOMBRE_MOTIVO[a.motivo] ?? a.motivo,
    detalle: a.detalle, fuente: a.fuente, estado: a.estado, creadoPor: a.creado_por, creadoEn: a.creado_en,
    resueltoPor: a.resuelto_por, resueltoEn: a.resuelto_en, rechazo: a.rechazo,
    neto: renglones.reduce((s, r) => s + r.diferencia, 0), renglones,
    seMovio: renglones.filter((r) => r.ahora != null && r.ahora !== r.antes).length,
  }
}
