// **Lo que entró hace poco y ya se está vendiendo** — los candidatos a recompra de un proveedor.
//
// ⛔ **Es `.js` plano, ⛔ no TypeScript**, por la misma razón que `geo.core.js` y `espejo.core.js`:
// lo necesitan `api/_prm.js` —que corre en Node sin pasar por el compilador de Next— y
// `scripts/estrellas-prm.mjs`, que corre en GitHub Actions con Node 20. `lib/prm/movimiento.ts` lo
// re-exporta tipado para la pantalla. ⛔ No se copia en ninguno de los tres.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 POR QUÉ ⛔ NO ALCANZA EL RANKING QUE YA HABÍA
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `productosOrdenados` ordena por unidades vendidas en toda la ventana, y eso contesta **quién es
// su producto más vendido de siempre**. Lo pidió Bruno el 8-sep-2026 y es otra pregunta:
//
// > «no me sirve los estrella del histórico pq no sirve, pero si algo se trajo hace 15 o 20 días,
// > puede llegar a haber recompra»
//
// El histórico gana siempre por acumulación: un producto de junio con 40 vendidas le pasa por
// arriba a uno de la semana pasada que se colocó entero en cinco días — y **el único de los dos que
// se puede recomprar a tiempo es el segundo**. Por eso acá el corte es **cuándo LLEGÓ**, y el orden
// es **cuándo se termina**.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 SÓLO ENTRA EL QUE LLEGÓ POR PRIMERA VEZ EN LA VENTANA
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Un producto que él ya había traído en junio y **repuso** la semana pasada ⛔ no entra, y ⛔ no es
// un olvido: de ése ⛔ no se puede decir «vendió el 60% de lo que trajo», porque lo que se vendió
// sale de un montón donde también está el stock viejo. Se cuentan aparte (`repuestos`) y la
// pantalla los nombra, porque un producto que desaparece sin explicación se lee como un dato que
// falta.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 EL STOCK DE HOY ⛔ NO ES «LO QUE LE QUEDA DE LO SUYO», Y ESTÁ MEDIDO
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// 📌 **Medido el 8-sep-2026 sobre los 109 productos que entraron en 30 días: `comprado − vendido`
// da el stock en 97 y ⛔ NO en 12.** `TOP TERRA` de CONTAMINA compró **5**, vendió **5** y tiene
// **5**; `TOP SOLENE` compró 8, vendió 7 y tiene 8. Nueve de los doce son del mismo proveedor, que
// repuso sin que entrara una orden. ⇒ La resta acierta casi siempre y **por eso el que falla ⛔ no
// se ve**: es un número plausible que manda a no recomprar algo que ya no está.
// ⇒ El stock viaja **al lado** y como lo que es: *el stock de HOY del producto entero, depósito y
// local*. Es el número que dice si la recompra es urgente o puede esperar, y por eso está — pero
// ⛔ no se resta de nada.
//
// `null` ⛔ no es cero: es «la base de esa marca no contestó».

// ⚠️ **`diasEntre` sale de `lib/fechas/dia.core.js`, que ya usa el mail de la pauta.** `movimiento.ts`
// tiene el suyo porque es TypeScript y éste tiene que ser `.js`; una TERCERA cuenta de días en el
// mismo módulo es exactamente como se llega a dos pantallas que dicen edades distintas del mismo
// producto. La única diferencia es que aquélla contesta `null` con una fecha rota y ésta `NaN`, y
// por eso acá se guarda con `Number.isFinite` y ⛔ no se confía en el valor.
import { diasEntre } from '../fechas/dia.core.js'

/** `diasEntre` con la fecha rota separada del cero: `null` ⛔ no es «llegó hoy». */
function edadEnDias(desde, hoy) {
  const d = diasEntre(desde, hoy)
  return Number.isFinite(d) ? d : null
}

/** Las ventanas que ofrece el bloque. Las dos que nombró Bruno: «el último mes o los últimos 15 días». */
export const VENTANAS_ESTRELLAS = [15, 30]

/**
 * **Cuándo esto merece un mail.**
 *
 * 🔑 **Un solo umbral y en un solo lugar**: lo usan el reloj que manda el mail y la pantalla, que
 * marca las mismas filas. Si cada uno tuviera el suyo, el mail avisaría de algo que la ficha ⛔ no
 * resalta, y quien abriera las dos ⛔ no sabría a cuál creerle.
 *
 * - `vendidas: 3` — con una o dos unidades ⛔ no hay ritmo, hay dos clientas. **Medido el 8-sep**:
 *   sin este piso, una compra de 2 unidades vendida entera encabeza la lista de 109 productos.
 * - `seAgotaEn: 7` — «a este ritmo, en una semana ⛔ no queda nada de lo que trajo». Es el plazo en
 *   el que todavía se llega a ir a Flores y recomprar.
 */
export const UMBRAL_AVISO = { vendidas: 3, seAgotaEn: 7 }

/**
 * **Los productos suyos que llegaron por primera vez adentro de la ventana, ordenados por cuándo
 * se terminan.**
 *
 * @param {Array} productos — `ProductoMovimiento[]`, con `desde` (primera llegada) y `hasta` (la
 *   última). Los devuelve `movimiento()` de `api/_prm.js`.
 * @param {Array} ventas — `VentaMovimiento[]`: `{ store, producto_id, fecha, unidades }`.
 * @param {string} hoy — `YYYY-MM-DD`.
 * @param {{ dias?: number, stock?: Map<string, number> | null }} [opciones] — `stock` mapea
 *   `store:producto_id` → unidades de hoy. `null` o ausente = ⛔ no se pudo preguntar.
 * @returns `{ ventana, filas, repuestos, sinFecha }`
 */
export function estrellas(productos, ventas, hoy, opciones) {
  const ventana = Number((opciones && opciones.dias) || VENTANAS_ESTRELLAS[1])
  const stock = (opciones && opciones.stock) || null

  const nuevos = []
  let repuestos = 0
  let sinFecha = 0
  for (const p of productos || []) {
    if (!p || !p.desde) {
      sinFecha += 1
      continue
    }
    const desde = String(p.desde).slice(0, 10)
    const dias = edadEnDias(desde, hoy)
    if (dias == null) {
      sinFecha += 1
      continue
    }
    if (dias > ventana) {
      // Llegó antes de la ventana. Si además VOLVIÓ a entrar adentro, se cuenta: es una reposición,
      // ⛔ no un producto nuevo, y su venta viene mezclada con el stock que ya había.
      const hasta = p.hasta ? String(p.hasta).slice(0, 10) : null
      const diasUltima = hasta ? edadEnDias(hasta, hoy) : null
      if (diasUltima != null && diasUltima <= ventana) repuestos += 1
      continue
    }
    // ⚠️ Una llegada con fecha futura ⛔ no existe en estos datos (`confirmada_at` lo escribe el
    // webhook al recibir), pero si apareciera, un `dias` negativo inflaría el ritmo al infinito.
    nuevos.push({ p, desde, dias: Math.max(0, dias) })
  }

  // ⚠️ Un índice y ⛔ no un `find` adentro del bucle: son 5.311 renglones de venta contra 109
  // productos en una corrida real de 30 días, y esto corre en el navegador de la ficha.
  const desdeDe = new Map(nuevos.map((n) => [n.p.clave, n.desde]))

  const vendidasPor = new Map()
  const antesPor = new Map()
  for (const v of ventas || []) {
    if (!v) continue
    const k = `${v.store}:${v.producto_id}`
    const arranca = desdeDe.get(k)
    if (!arranca) continue
    const u = Number(v.unidades) || 0
    // 🔴 **Lo vendido ANTES de que llegara ⛔ no cuenta como colocado**, y es la misma regla que
    // `curva()`: ese producto ya estaba en la calle, así que sumarlo diría que él colocó algo que
    // se vendió sin él. Se cuenta aparte y la pantalla lo muestra.
    const destino = String(v.fecha).slice(0, 10) >= arranca ? vendidasPor : antesPor
    destino.set(k, (destino.get(k) || 0) + u)
  }

  const filas = nuevos.map(({ p, desde, dias }) => {
    const unidades = Number(p.unidades) || 0
    const vendidas = vendidasPor.get(p.clave) || 0
    // ⛔ Un guion y ⛔ no un cero: el que llegó hoy ⛔ no tiene ritmo cero, no tiene ritmo.
    const porDia = dias > 0 ? vendidas / dias : null
    // ⛔ Lo mismo con el porcentaje: sin unidades ⛔ no hay de qué sacar una fracción.
    const colocado = unidades > 0 ? vendidas / unidades : null
    const restante = Math.max(0, unidades - vendidas)
    const seAgotaEn = porDia && porDia > 0 ? restante / porDia : null
    return {
      clave: p.clave,
      store: p.store,
      producto_id: p.producto_id,
      nombre: p.nombre || null,
      sku: p.sku || null,
      unidades,
      desde,
      dias,
      vendidas,
      antes: antesPor.get(p.clave) || 0,
      porDia,
      colocado,
      /** Días hasta que ⛔ no quede nada **de lo que él trajo**, al ritmo de hoy. `null` = no vendió. */
      seAgotaEn,
      /** 🔴 El stock de HOY del producto entero, ⛔ no el resto de su compra. `null` = no se pudo preguntar. */
      stock: stock ? (stock.has(p.clave) ? Number(stock.get(p.clave)) || 0 : null) : null,
    }
  })

  // 🔑 **El orden es «de qué me quedo sin primero»**, que es la pregunta de la recompra. El que ya
  // colocó todo va arriba con un 0. A igual plazo manda el que más vendió: entre dos que se
  // agotaron, el de 5 unidades dice más que el de 2.
  filas.sort((a, b) => {
    const sa = a.seAgotaEn == null ? Infinity : a.seAgotaEn
    const sb = b.seAgotaEn == null ? Infinity : b.seAgotaEn
    if (sa !== sb) return sa - sb
    if (b.vendidas !== a.vendidas) return b.vendidas - a.vendidas
    return b.unidades - a.unidades
  })

  return { ventana, filas, repuestos, sinFecha }
}

/**
 * ¿Esta fila merece que suene el teléfono? Ver `UMBRAL_AVISO`.
 *
 * 🔴 **Las dos condiciones van juntas y ⛔ ninguna sola alcanza.** Sólo con el plazo, una compra de
 * 2 unidades vendida entera avisa igual que una de 16; sólo con las unidades, un producto que vendió
 * 5 de 60 en un mes avisaría sin tener nada de urgente.
 */
export function paraAvisar(fila, umbral) {
  // 🔴 **`filas.filter(paraAvisar)` le pasa el ÍNDICE como segundo argumento**, y con un número
  // ahí `u.vendidas` es `undefined`: toda comparación da `false` y **la lista vuelve vacía, sin un
  // error**. Ya pasó midiendo esto el 8-sep-2026 —«5 para avisar» arriba y ninguna fila abajo— y es
  // exactamente el modo de falla que apaga un aviso en silencio. Por eso lo que no es un umbral
  // ⛔ no se usa como umbral.
  const u = umbral && typeof umbral === 'object' ? umbral : UMBRAL_AVISO
  if (!fila) return false
  if (fila.vendidas < u.vendidas) return false
  return fila.seAgotaEn != null && fila.seAgotaEn <= u.seAgotaEn
}
