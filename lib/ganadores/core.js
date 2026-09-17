/**
 * **Ganadores por tanda**: qué fundas de un ingreso venden mejor, leído del lado que corresponde.
 *
 * Pedido de Bruno (17-sep-2026): para decidir a qué productos se les hace publicidad hace falta el
 * ranking del **público**, y el de siempre sumaba el canal Mayorista —en BDI, el 88 % de las
 * unidades—. Con Moods Collection se vio el sesgo: CHERRY HEART iba **18ª en mayorista y 3ª en
 * minorista**.
 *
 * 🔑 **Sin historia minorista, el mayorista es el ANTICIPO** (decisión de Bruno). Un ingreso le llega
 * al mayorista días antes de publicarse en Tienda Nube, y en Girlhood el top 12 del mayorista de la
 * 1ª semana traía 11 de los 12 primeros del minorista. Pero **el minorista tiene que poder hacer su
 * propio historial**: cuando la tanda junta suficientes UNIDADES minoristas, manda el minorista.
 *
 * 🔑 **El cambio es de la TANDA entera, ⛔ nunca modelo por modelo.** Un ranking que ordena unos
 * productos por su mayorista y otros por su minorista compara dos cosas que no se comparan. Los dos
 * rankings se devuelven siempre; lo que cambia es cuál **manda**.
 *
 * 🔑 **El umbral es un parámetro OBLIGATORIO.** No hay un número escondido acá adentro: lo pone quien
 * llama (`UMBRAL_MIN_POR_MODELO`, con su medición al lado) y un umbral ausente tira, ⛔ no cae a un
 * default que parezca decidido.
 *
 * Puro: no lee la hora ni la red. `hoy` entra por parámetro.
 */

const DIA_MS = 86400000

/**
 * Unidades minoristas **por modelo** a partir de las cuales el ranking minorista manda.
 *
 * 📊 Calibrado el 17-sep-2026 con `scripts/calibrar-umbral-ganadores.mjs` sobre las 11 tandas de BDI
 * con ≥ 10 modelos y 30 días de historia minorista. La verdad es el ranking minorista a 30 días; se
 * mide día a día la rho de Spearman del minorista acumulado y del mayorista acumulado contra ella.
 * En las tandas donde los dos lados tienen señal, el minorista pasa al mayorista **y no vuelve a
 * perder** a partir de: Girlhood (ago-26) 3,6 u/modelo · feb-26 2,3 · sep-25 5,8 · ene-25 **10,8**.
 * ⇒ con 10 el minorista ya le gana al anticipo en todas; es el extremo prudente del rango.
 * ⚠️ La medición favorece al minorista (el acumulado es parte de su propia verdad), y por eso se
 * eligió el extremo alto y no la mediana.
 */
export const UMBRAL_MIN_POR_MODELO = 10

/** Una tanda con menos modelos que esto ⛔ no se ofrece: 1 o 2 altas sueltas no son un ingreso. */
export const MIN_MODELOS_TANDA = 3

/** `YYYY-MM-DD` → días enteros entre dos fechas, contando el primero (el día de la fecha vale 1). */
function diasDesde(fecha, hoy) {
  const d = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10))
  const h = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(1, Math.floor((h - d) / DIA_MS) + 1)
}

/**
 * Puesto «de competencia»: los empatados comparten puesto y el siguiente salta (1, 2, 2, 4).
 * 🔑 A pocas unidades casi todo empata, y un 1-2-3-4 inventaría un orden que el dato no tiene.
 */
function puestos(lista, clave) {
  const orden = [...lista].sort((a, b) => clave(b) - clave(a))
  const out = new Map()
  orden.forEach((x, i) => {
    const prev = i > 0 ? orden[i - 1] : null
    out.set(x.id, prev && clave(prev) === clave(x) ? out.get(prev.id) : i + 1)
  })
  return out
}

/**
 * Agrupa los productos por su fecha de alta en Gestión Nube, más reciente primero.
 * Los que no tienen alta quedan afuera: una tanda inventada desde la primera venta ⛔ es un hecho.
 */
export function tandasDe(productos, minModelos = MIN_MODELOS_TANDA) {
  const por = new Map()
  for (const p of productos) {
    if (!p.ingresoFecha) continue
    if (!por.has(p.ingresoFecha)) por.set(p.ingresoFecha, [])
    por.get(p.ingresoFecha).push(p)
  }
  return [...por.entries()]
    .filter(([, ps]) => ps.length >= minModelos)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, ps]) => ({ fecha, productos: ps }))
}

/**
 * El ranking de una tanda.
 *
 * Cada producto trae `ventasMin` y `ventasMay` (`{ total, first }`), y `minOnline` / `minLocal`.
 *
 * **Los relojes:**
 *   - mayorista: desde el **alta** (el mayorista compra antes de que exista la ficha pública);
 *   - minorista: desde la **primera venta minorista de la tanda**, que es lo más cerca que el dato
 *     llega de la publicación en TN (Gestión Nube no la guarda). ⛔ No desde el alta: Moods se dio de
 *     alta el 11-sep y se publicó el 15, y esos 4 días le partirían la velocidad casi a la mitad.
 *
 * @param {Array} productos los de UNA tanda
 * @param {{ umbralMinPorModelo: number, hoy: Date }} opts
 */
export function rankingDeTanda(productos, { umbralMinPorModelo, hoy } = {}) {
  if (!(typeof umbralMinPorModelo === 'number' && umbralMinPorModelo > 0)) {
    throw new Error('rankingDeTanda: falta umbralMinPorModelo (número > 0)')
  }
  if (!(hoy instanceof Date)) throw new Error('rankingDeTanda: falta hoy')

  const n = productos.length
  const alta = productos.map((p) => p.ingresoFecha).filter(Boolean).sort()[0] || null
  const primerasMin = productos.map((p) => p.ventasMin.first).filter(Boolean).sort()
  const inicioMin = primerasMin[0] || null

  const uMin = productos.reduce((s, p) => s + p.ventasMin.total, 0)
  const uMay = productos.reduce((s, p) => s + p.ventasMay.total, 0)
  const umbralUnidades = umbralMinPorModelo * n
  // 🔴 **Un mayorista que no compró nada no es un anticipo**: pasó en 3 de las 11 tandas calibradas
  // (rho 0 todos los días). Ahí manda el minorista aunque tenga poco, y `ruido` lo dice.
  const senal = uMin >= umbralUnidades ? 'minorista' : uMay > 0 ? 'mayorista' : uMin > 0 ? 'minorista' : 'sin-ventas'
  const ruido = uMin < umbralUnidades

  const diasMin = inicioMin ? diasDesde(inicioMin, hoy) : null
  const diasMay = alta ? diasDesde(alta, hoy) : null

  const pMin = puestos(productos, (p) => p.ventasMin.total)
  const pMay = puestos(productos, (p) => p.ventasMay.total)

  const filas = productos.map((p) => {
    const puestoMin = pMin.get(p.id)
    const puestoMay = pMay.get(p.id)
    return {
      id: p.id,
      name: p.name,
      precio: p.retailer_price,
      stock: p.stock,
      uMin: p.ventasMin.total,
      uOnline: p.minOnline,
      uLocal: p.minLocal,
      uMay: p.ventasMay.total,
      velMin: diasMin ? p.ventasMin.total / diasMin : null,
      velMay: diasMay ? p.ventasMay.total / diasMay : null,
      puestoMin,
      puestoMay,
      puesto: senal === 'mayorista' ? puestoMay : puestoMin,
      // Positivo = el público lo quiere MÁS de lo que dice el mayorista (el caso CHERRY HEART).
      desacople: puestoMay - puestoMin,
    }
  })

  // El orden de la tabla es el de la señal que manda; el otro lado desempata.
  const [a, b] = senal === 'mayorista' ? ['uMay', 'uMin'] : ['uMin', 'uMay']
  filas.sort((x, y) => y[a] - x[a] || y[b] - x[b] || String(x.name).localeCompare(String(y.name), 'es'))

  return {
    alta,
    modelos: n,
    inicioMin,
    diasMin,
    diasMay,
    uMin,
    uMay,
    umbralUnidades,
    progreso: Math.min(1, uMin / umbralUnidades),
    senal,
    /** El minorista todavía no llegó al umbral: si manda, es porque no hay anticipo. */
    ruido,
    filas,
  }
}
