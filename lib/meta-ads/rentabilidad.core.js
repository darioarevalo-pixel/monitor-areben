/**
 * El piso de rentabilidad de la pauta —**hasta cuánto se puede pagar por una compra**—: LA
 * implementación. Una sola, para los dos mundos.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js`, `lib/meta-ads/lineas.core.js` y `formato.core.js`: los
 * handlers de `api/*.js` corren en Node sin pasar por el compilador de Next y **no pueden importar
 * TypeScript**. `api/_meta-rentabilidad.js` necesita `normalizar()` para no guardar cualquier cosa,
 * y `lib/meta-ads/rentabilidad.ts` es el re-export tipado que usa la pantalla.
 *
 * # Por qué esto existe y por qué el semáforo NO es el ROAS
 *
 * Sin un umbral, cada «rinde / no rinde» era una opinión. El umbral sale de la economía unitaria:
 * de lo que el cliente paga se van el IVA, el producto, Ingresos Brutos, el impuesto al cheque y
 * las comisiones; lo que queda —la **contribución**— es lo único con lo que se puede pagar pauta y
 * ganar plata. Repartirla decide el techo.
 *
 * 🔑 **El techo por compra casi no depende del mix de medios de pago (±0,7%), pero el ROAS sí
 * (±12%)**, porque el ROAS que reporta Meta usa lo que el cliente efectivamente pagó y la
 * transferencia paga menos. Como el mix es un dato que no tenemos, el semáforo es el **costo por
 * compra**: es el único de los dos que no depende de un dato que falta. Corolario que ya confundió
 * una vez: **si crece la transferencia el ROAS de Ads Manager baja ~10% sin que la pauta empeore.**
 *
 * 🔴 **El break-even y el objetivo no son lo mismo.** Entre los dos se gana plata, sólo que menos
 * de lo decidido. Confundirlos hace apagar campañas que están dando ganancia.
 *
 * # De dónde salen los números
 *
 * Portado de `~/Projects/analista-meta/herramientas/roas-minimo-bdi.html` (13-ago-2026), la
 * calculadora con la que se definió el umbral de BDI. **Las fórmulas se movieron tal cual.** Este
 * archivo sólo calcula: quien dibuja es `components/meta-ads/rentabilidad/`.
 *
 * ⚠️ `DEFAULTS` es la economía real de las fundas de BDI y **la pantalla lo lee de acá**: no se
 * repiten los valores en el JSX. Un default que la pantalla no lee es un default que miente.
 */

/**
 * La economía de las fundas de BDI al 13-ago-2026, medida con Bruno.
 *
 * ⚠️ **`pasTransf` es 1%, no 0.** La calculadora original quedó guardada con 0 en ese campo, pero
 * la economía anotada —y el techo de $9.100 que salió de ella— corresponden al 1%. Con 0 el techo
 * da $9.175. La diferencia es chica (0,8%) y no cambia ninguna decisión, pero el valor bueno es el
 * de la economía, no el que quedó tipeado.
 *
 * 🔴 **Son los de BDI, y son el arranque de las TRES líneas.** Zattia y Stunned no tienen su
 * economía medida: hasta que alguien la cargue, su pantalla muestra esto y **lo dice**. Un default
 * que se hace pasar por un dato de la línea es peor que no tener nada.
 */
export const DEFAULTS = {
  precio: 14490, // promedio de $13.990 y $14.990
  raspa: 12.5,
  usaRaspa: 100,
  transf: 10,
  acumulan: true,
  mix: 50,
  costo: 1700,
  iva: 21,
  iibb: 4, // Santa Fe
  cheque: 1.2,
  tnTarjeta: 1,
  pasTarjeta: 8,
  tnTransf: 0, // bonificada
  pasTransf: 1,
  // ⚠️ Los tres que siguen nacen NEUTROS a propósito: `normalizar()` arranca en DEFAULTS y una clave
  // que la fila guardada no tiene se queda con el default ⇒ un default ≠ 0 le cambiaría el techo,
  // en silencio, a toda línea ya guardada. Quien tenga envío, DREI o saldo a favor los carga.
  drei: 0,
  envio: 0,
  saldoIva: false,
  unidades: 2.6, // derivado del ticket real medido ($31.552)
  reparto: 50,
  ventasDia: 100,
  stock: 11000,
  costoHoy: 2472,
}

/**
 * El techo de cada campo, y por qué hay techos.
 *
 * No es paranoia de formulario: lo que entra por acá se guarda y **después lo lee el semáforo**.
 * Un `reparto` de 10.000% o un `precio` negativo no se ven raros en la tabla —se ven como un techo
 * enorme— y recién se notan cuando alguien escaló contra un número inventado. Los porcentajes van
 * a 100, la plata no tiene techo pero sí piso, y `unidades` arranca en 1 porque media unidad por
 * pedido no existe.
 */
const LIMITES = {
  precio: [0, Infinity],
  raspa: [0, 100],
  usaRaspa: [0, 100],
  transf: [0, 100],
  mix: [0, 100],
  costo: [0, Infinity],
  iva: [0, 100],
  iibb: [0, 100],
  cheque: [0, 100],
  tnTarjeta: [0, 100],
  pasTarjeta: [0, 100],
  tnTransf: [0, 100],
  pasTransf: [0, 100],
  drei: [0, 100],
  envio: [0, Infinity],
  unidades: [1, 1000],
  reparto: [0, 100],
  ventasDia: [0, Infinity],
  stock: [0, Infinity],
  costoHoy: [0, Infinity],
}

/**
 * Los supuestos que llegaron de afuera, hechos supuestos usables.
 *
 * 🔑 **Un campo que falta cae al DEFAULT; un campo que vino mal cae al DEFAULT.** No al 0 y no al
 * borde: guardar un 0 porque alguien mandó `"catorce mil"` deja una economía que calcula, que se
 * ve bien y que está mal. Lo que sí se recorta contra el borde es un número válido fuera de rango
 * (un 150%), porque ahí la intención se entiende.
 *
 * Lo devuelve **completo**: la fila guardada siempre tiene los 19 campos, así que agregar uno
 * mañana no deja a las filas viejas con un `undefined` adentro del cálculo.
 */
export function normalizar(crudo) {
  const src = crudo && typeof crudo === 'object' ? crudo : {}
  const out = { ...DEFAULTS }
  for (const k of Object.keys(LIMITES)) {
    const n = aNumero(src[k])
    if (n === null) continue
    const [min, max] = LIMITES[k]
    out[k] = Math.min(Math.max(n, min), max)
  }
  if (typeof src.acumulan === 'boolean') out.acumulan = src.acumulan
  if (typeof src.saldoIva === 'boolean') out.saldoIva = src.saldoIva
  return out
}

/**
 * Un número de verdad, o `null`. **No alcanza con `Number()` + `isFinite`**, y esa es toda la
 * razón por la que esta función existe en vez de una línea suelta.
 *
 * 🔴 `Number(null)`, `Number([])`, `Number('')` y `Number(false)` valen **0**, y el 0 es finito: un
 * `precio: null` pasaba el filtro y se guardaba como un precio de cero. Un precio de cero calcula,
 * dibuja un techo, y está mal —que es exactamente el modo de falla que esto tiene que impedir—.
 * Sólo pasan los números finitos y las cadenas que dicen un número (un JSON descuidado manda
 * `"16990"`, y esa intención sí se entiende).
 */
function aNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Un canal: precio bruto por unidad + sus comisiones → lo que queda. */
function canal(s, bruto, tn, pas) {
  const neto = bruto / (1 + s.iva / 100)
  const comision = bruto * ((tn + pas) / 100)
  const iibb = bruto * (s.iibb / 100)
  const cheque = bruto * (s.cheque / 100)
  const drei = bruto * (s.drei / 100)
  return {
    bruto,
    neto,
    iva: bruto - neto,
    producto: s.costo,
    iibb,
    cheque,
    drei,
    comision,
    contrib: neto - s.costo - iibb - cheque - drei - comision,
  }
}

export function calcularRentabilidad(s) {
  // El raspa se pondera por cuánta gente lo usa: un 12,5% que usa la mitad pesa 6,25%.
  const desc = (s.raspa / 100) * (s.usaRaspa / 100)
  const conRaspa = s.precio * (1 - desc)
  const tarjeta = canal(s, conRaspa, s.tnTarjeta, s.pasTarjeta)
  const transferencia = canal(
    s,
    s.acumulan ? conRaspa * (1 - s.transf / 100) : s.precio * (1 - s.transf / 100),
    s.tnTransf,
    s.pasTransf,
  )

  const m = s.mix / 100
  const w = (a, b) => a * (1 - m) + b * m
  const unidad = {
    bruto: w(tarjeta.bruto, transferencia.bruto),
    neto: w(tarjeta.neto, transferencia.neto),
    iva: w(tarjeta.iva, transferencia.iva),
    producto: w(tarjeta.producto, transferencia.producto),
    iibb: w(tarjeta.iibb, transferencia.iibb),
    cheque: w(tarjeta.cheque, transferencia.cheque),
    drei: w(tarjeta.drei, transferencia.drei),
    comision: w(tarjeta.comision, transferencia.comision),
    contrib: w(tarjeta.contrib, transferencia.contrib),
  }

  // Del por-unidad al por-compra: Meta cobra por compra, no por unidad. El envío es del PEDIDO,
  // no de la unidad: no se multiplica.
  const ticket = unidad.bruto * s.unidades
  // 🔑 El envío se factura CON IVA. De la GANANCIA sale su neto —el crédito se descuenta del débito
  // como cualquier compra con factura—, pero de la CAJA sale entero: cuando hay saldo a favor que
  // no se consume, ese crédito sólo engorda un pozo que no se usa y no vuelve nunca.
  const envioNeto = s.envio / (1 + s.iva / 100)
  const contribPedido = unidad.contrib * s.unidades - envioNeto
  const roasBE = contribPedido > 0 ? ticket / contribPedido : Infinity
  const costoMax = contribPedido * (s.reparto / 100)
  const roasObj = costoMax > 0 ? ticket / costoMax : Infinity

  /**
   * 🔴 **El recupero de saldo NO es ganancia y por eso va en su propio renglón.**
   *
   * Con saldo de IVA a favor que no se consume —el caso de Areben: se importa con crédito y se
   * vende mayormente sin factura—, el IVA débito de una venta facturada **se netea contra ese saldo
   * en vez de salir en efectivo**. Es plata real que entra, pero no la generó la venta: la venta
   * sólo la libera. Tres cosas la separan de la ganancia y las tres cambian decisiones:
   * **no se repite** (el saldo es un stock finito), **no depende de la calidad de la venta** (una
   * vendida a pérdida libera el mismo IVA) y **no la genera la pauta** (la libera igual una venta
   * del local con tarjeta). ⇒ el techo que va al semáforo es el de GANANCIA; el de caja es un techo
   * extra para un empujón deliberado y con fecha. Calibrar el negocio permanente sobre el de caja
   * deja una estructura armada sobre plata que un día se termina.
   */
  const recuperoPedido = s.saldoIva ? ticket * (s.iva / (100 + s.iva)) : 0
  const cajaPedido = s.saldoIva
    ? unidad.contrib * s.unidades - s.envio + recuperoPedido
    : contribPedido
  const roasBECaja = cajaPedido > 0 ? ticket / cajaPedido : Infinity
  const costoMaxCaja = cajaPedido * (s.reparto / 100)
  const roasObjCaja = costoMaxCaja > 0 ? ticket / costoMaxCaja : Infinity

  const compras = s.unidades > 0 ? s.stock / s.unidades : 0
  const dias = s.ventasDia > 0 ? compras / s.ventasDia : 0

  // El techo en los dos extremos del mix. Si apenas se mueve, el mix deja de ser un dato que haga
  // falta averiguar para poder decidir — que es justamente lo que pasa.
  const extremo = (prop) => {
    const bruto = tarjeta.bruto * (1 - prop) + transferencia.bruto * prop
    const contrib = tarjeta.contrib * (1 - prop) + transferencia.contrib * prop
    const cm = (contrib * s.unidades - envioNeto) * (s.reparto / 100)
    return { costoMax: cm, roas: cm > 0 ? (bruto * s.unidades) / cm : Infinity }
  }
  const eT = extremo(0)
  const eX = extremo(1)

  return {
    tarjeta,
    transferencia,
    unidad,
    ticket,
    contribPedido,
    recuperoPedido,
    cajaPedido,
    margenPct: ticket > 0 ? (contribPedido / ticket) * 100 : 0,
    margenCajaPct: ticket > 0 ? (cajaPedido / ticket) * 100 : 0,
    roasBE,
    roasBECaja,
    costoMax,
    costoMaxCaja,
    roasObj,
    roasObjCaja,
    aire: s.costoHoy > 0 ? costoMax / s.costoHoy : Infinity,
    diario: costoMax * s.ventasDia,
    compras,
    dias,
    factu: compras * ticket,
    extremos: {
      tarjeta: eT,
      transferencia: eX,
      spreadPct: eT.costoMax > 0 ? (Math.abs(eX.costoMax - eT.costoMax) / eT.costoMax) * 100 : 0,
    },
  }
}

/**
 * Los cuatro repartos que vale la pena comparar, incluyendo el elegido.
 *
 * El 100% es el break-even y se dibuja en rojo a propósito: **es el punto donde la pauta se lleva
 * toda la ganancia**, no un objetivo. Si el reparto elegido coincide con uno de los fijos, se
 * muestra una sola fila y no dos iguales.
 */
export function escenariosDeFreno(s, r) {
  const base = [
    [100, 'todo — punto de equilibrio', 'danger'],
    [75, 'tres cuartos — al hueso', 'warning'],
    [s.reparto, `${Math.round(s.reparto)}% — el elegido`, 'neutral'],
    [33, 'un tercio — conservador', 'success'],
  ]
  return base
    .filter(([q], i, a) => a.findIndex(([y]) => Math.abs(y - q) < 0.001) === i)
    .sort((a, b) => b[0] - a[0])
    .map(([q, etiqueta, tono]) => {
      const costoMax = r.contribPedido * (q / 100)
      return {
        reparto: q,
        etiqueta,
        tono,
        costoMax,
        roas: costoMax > 0 ? r.ticket / costoMax : Infinity,
        diario: costoMax * s.ventasDia,
        elegido: Math.abs(q - s.reparto) < 0.001,
      }
    })
}

/** El stock a tres precios de compra: el de hoy, la mitad del techo y el techo. */
export function proyeccionStock(s, r) {
  return [
    { etiqueta: 'el de hoy', costoPorCompra: s.costoHoy },
    { etiqueta: 'la mitad del techo', costoPorCompra: r.costoMax * 0.5 },
    { etiqueta: 'el techo', costoPorCompra: r.costoMax },
  ]
    .filter((p) => p.costoPorCompra > 0)
    .map((p) => {
      const pauta = r.compras * p.costoPorCompra
      return {
        ...p,
        pauta,
        ganancia: r.compras * r.contribPedido - pauta,
        roas: p.costoPorCompra > 0 ? r.ticket / p.costoPorCompra : Infinity,
      }
    })
}
