/**
 * Insumos — las listas cerradas y la validación, para los dos mundos.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js` y `lib/agenda/reglas.core.js`: `api/_insumos.js` corre en
 * Node sin pasar por el compilador de Next y **no puede importar TypeScript**. El handler tiene que
 * validar antes de escribir —un movimiento con una ubicación que no existe se guarda igual, no
 * aparece en ninguna suma, y nadie entiende por qué el stock no cierra—, así que lo que valida vive
 * acá y `lib/insumos/core.ts` es el re-export tipado más lo derivado.
 *
 * ⛔ **Lo derivado NO está acá.** Stock, precio de referencia, ritmo y «hay que reponer» viven en
 * `core.ts`: los usa la pantalla y el derivador de avisos, ninguno de los dos corre en un handler.
 */

/**
 * Los tipos de insumo. La lista es corta a propósito y arranca de lo que se pide de verdad en los
 * chats: bolsas, rollos y cajas (comercial) y yerba, azúcar y café (comestible). `otro` existe para
 * que nadie tenga que esperar un deploy para cargar algo — 🔑 si `otro` se llena, eso ES el pedido
 * de un tipo nuevo, y se lee contando filas, no adivinando.
 */
export const TIPOS = [
  { key: 'comercial', label: 'Comercial' },      // bolsas, etiquetas, ribbon, cajas, papel de seda
  { key: 'comestible', label: 'Comestible' },    // yerba, azúcar, café
  { key: 'limpieza', label: 'Limpieza' },        // papel higiénico, desodorante de ambiente
  { key: 'oficina', label: 'Oficina' },          // resmas, biromes, gomitas
  { key: 'otro', label: 'Otro' },
]

/**
 * La unidad en la que se cuenta el insumo. 🔴 **Es UNA sola por insumo y el libro entero viaja en
 * ella.** Se compra una caja de 1.000 bolsas y se consume de a una: si la compra guardara «1 caja»
 * y el consumo «3 bolsas», la resta mentiría sin fallar. Cómo se compra se dice aparte
 * (`bulto`/`por_bulto`), y eso es **ayuda para tipear**, no una segunda unidad.
 */
export const UNIDADES = [
  { key: 'unidad', label: 'unidad', plural: 'unidades' },
  { key: 'rollo', label: 'rollo', plural: 'rollos' },
  { key: 'caja', label: 'caja', plural: 'cajas' },
  { key: 'paquete', label: 'paquete', plural: 'paquetes' },
  { key: 'kg', label: 'kg', plural: 'kg' },
  { key: 'litro', label: 'litro', plural: 'litros' },
  { key: 'metro', label: 'metro', plural: 'metros' },
]

/**
 * Dónde está el insumo.
 *
 * 🔑 **El stock es por lugar y no un total**, porque el que se queda sin bolsas es el local mientras
 * el depósito tiene: «no hay más bolsas en local» y «si me pueden subir del depo» son el mismo día.
 * Un total taparía eso y el aviso llegaría cuando ya no hay en ningún lado.
 *
 * ⚠️ Es una lista cerrada: un local nuevo se suma acá y sale con un deploy. Se eligió así porque son
 * tres y el catálogo de ubicaciones **gobierna** a dónde apunta el aviso; una tabla de ubicaciones
 * editable no cambiaría nada hoy y agregaría una pantalla que nadie pidió.
 */
export const UBICACIONES = [
  { key: 'deposito', label: 'Depósito' },
  { key: 'local-bdi', label: 'Local BDI' },
  { key: 'local-zattia', label: 'Local Zattia' },
]

/**
 * Los cuatro movimientos.
 *
 * `traslado` no figura como un signo: **son dos filas** (una salida y una entrada) con el mismo
 * `grupo`. Con una sola fila y una columna `destino`, todo el que sume stock tendría que acordarse
 * de restar de un lado y sumar del otro, y el que se olvide falla callado.
 *
 * `recuento` tampoco tiene signo: **fija** el stock de esa ubicación ese día y corta el libro.
 */
export const TIPOS_MOVIMIENTO = [
  { key: 'compra', label: 'Entró una compra' },
  { key: 'consumo', label: 'Se consumió' },
  { key: 'traslado', label: 'Se trasladó' },
  { key: 'recuento', label: 'Se contó' },
]

/**
 * 🔴 **El signo vive acá y en ningún otro lado.** `cantidad` se guarda siempre positiva —la base
 * también lo exige— así que el mismo hecho no se puede escribir de dos formas, y un signo tipeado a
 * mano no puede dejar un stock negativo.
 *
 * Las dos patas de un traslado son un `consumo` y una `compra` en cuanto a signo, pero se guardan
 * con `tipo: 'traslado'` para que el historial diga la verdad de lo que pasó; el signo lo decide la
 * pata (`datos.pata`), ver `SIGNO_DE_PATA`.
 */
export const SIGNO_POR_TIPO = { compra: 1, consumo: -1, traslado: 0, recuento: 0 }
export const SIGNO_DE_PATA = { salida: -1, entrada: 1 }

export const CLAVES_TIPO = TIPOS.map((t) => t.key)
export const CLAVES_UNIDAD = UNIDADES.map((u) => u.key)
export const CLAVES_UBICACION = UBICACIONES.map((u) => u.key)
export const CLAVES_MOVIMIENTO = TIPOS_MOVIMIENTO.map((m) => m.key)

/** Las dos marcas que puede llevar un insumo. `[]` = las dos, igual que en la Agenda. */
export const MARCAS = ['bdi', 'zattia']

/** `YYYY-MM-DD` y que exista de verdad: `2026-02-31` matchea el regex y no es un día. */
export function esFechaIso(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** Un número que sirve para contar: finito y no negativo. `null`/`''` ⛔ no son 0, son «no lo sé». */
function numeroNoNegativo(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/**
 * El motivo, en castellano, por el que un insumo no se puede guardar — o `null` si está bien.
 *
 * Devuelve la frase y no un booleano porque es lo que contesta el 400 del handler: un «datos
 * inválidos» pelado obliga a adivinar cuál de los diez campos es, y el que adivina es el que carga.
 */
export function motivoInsumoInvalido(i) {
  if (!i || typeof i !== 'object') return 'falta el insumo'
  if (typeof i.nombre !== 'string' || !i.nombre.trim()) return 'falta el nombre'
  if (!CLAVES_TIPO.includes(i.tipo)) return `tipo inválido (usá ${CLAVES_TIPO.join(', ')})`
  if (!CLAVES_UNIDAD.includes(i.unidad)) return `unidad inválida (usá ${CLAVES_UNIDAD.join(', ')})`
  if (!Array.isArray(i.marcas)) return 'marcas tiene que ser una lista ([] = las dos)'
  if (i.marcas.some((m) => !MARCAS.includes(m))) return `marcas sólo acepta ${MARCAS.join(' y ')}`
  if (!numeroNoNegativo(i.minimo)) return 'el mínimo tiene que ser un número (0 o más)'
  // 🔑 `por_bulto` en 0 sería una división por cero al mostrar el equivalente en cajas, y un bulto
  // que no trae nada no es un bulto.
  if (i.porBulto != null && !(typeof i.porBulto === 'number' && Number.isFinite(i.porBulto) && i.porBulto > 0)) {
    return 'cuántas unidades trae el bulto tiene que ser un número mayor a 0'
  }
  // ⚠️ `null` es «no se sabe cuánto tarda en llegar» y es válido. Lo que no puede es ser 0: un
  // insumo que se repone el mismo día no necesitaría este campo, y un 0 apagaría el corte por días
  // pareciendo que lo prende.
  if (i.diasReposicion != null && !(Number.isInteger(i.diasReposicion) && i.diasReposicion > 0)) {
    return 'los días que tarda en reponerse tienen que ser un número entero mayor a 0'
  }
  return motivoConsumoInvalido(i.consumo)
}

/**
 * La regla de consumo automático. `{}` o ausente = se mide a mano, que es lo válido para la yerba y
 * el papel higiénico: no hay ninguna venta a la que atarlos.
 */
export function motivoConsumoInvalido(c) {
  if (c == null) return null
  if (typeof c !== 'object' || Array.isArray(c)) return 'la regla de consumo tiene que ser un objeto'
  if (!c.modo) return null
  if (c.modo === 'manual') return null
  if (c.modo !== 'por-venta') return "el modo de consumo sólo puede ser 'por-venta' o 'manual'"
  if (c.canal != null && !['local', 'online', 'mayorista'].includes(c.canal)) {
    return 'el canal sólo puede ser local, online o mayorista (vacío = todos)'
  }
  if (!(typeof c.porVenta === 'number' && Number.isFinite(c.porVenta) && c.porVenta > 0)) {
    return 'cuánto se gasta por venta tiene que ser un número mayor a 0'
  }
  return null
}

/** Lo mismo para un movimiento del libro. */
export function motivoMovimientoInvalido(m) {
  if (!m || typeof m !== 'object') return 'falta el movimiento'
  if (typeof m.insumoId !== 'string' || !m.insumoId) return 'falta el insumo'
  if (!CLAVES_MOVIMIENTO.includes(m.tipo)) return `tipo inválido (usá ${CLAVES_MOVIMIENTO.join(', ')})`
  if (!CLAVES_UBICACION.includes(m.ubicacion)) return `ubicación inválida (usá ${CLAVES_UBICACION.join(', ')})`
  if (!numeroNoNegativo(m.cantidad)) return 'la cantidad tiene que ser un número (0 o más)'
  if (!esFechaIso(m.fecha)) return 'la fecha tiene que ser un día real (YYYY-MM-DD)'
  // 🔴 Un precio en 0 es «todavía no lo sé», ⛔ no gratis: si entrara como 0 se metería en el
  // promedio de referencia y lo tiraría abajo sin que nadie lo vea. El que no lo sabe lo deja
  // vacío, y vacío llega como `null`.
  if (m.precioTotal != null && !(typeof m.precioTotal === 'number' && Number.isFinite(m.precioTotal) && m.precioTotal > 0)) {
    return 'el precio tiene que ser un número mayor a 0 (dejalo vacío si no lo sabés)'
  }
  if (m.tipo !== 'compra' && m.precioTotal != null) return 'sólo una compra lleva precio'
  if (m.tipo === 'traslado') {
    if (!['salida', 'entrada'].includes(m.pata)) return 'un traslado va como salida y entrada'
    if (typeof m.grupo !== 'string' || !m.grupo) return 'las dos patas del traslado necesitan el mismo grupo'
  }
  return null
}

/**
 * Las dos filas de un traslado, armadas en un solo lugar.
 *
 * 🔑 Está acá y no en la pantalla porque es **la** definición de qué es un traslado: si la pantalla
 * armara las dos filas, un script que mueva mercadería tendría que volver a saber que son dos.
 */
export function patasDeTraslado({ insumoId, origen, destino, cantidad, fecha, usuario, nota, grupo }) {
  const g = grupo || `tr${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const base = { insumoId, tipo: 'traslado', cantidad, fecha, usuario, nota, grupo: g }
  return [
    { ...base, ubicacion: origen, pata: 'salida' },
    { ...base, ubicacion: destino, pata: 'entrada' },
  ]
}

/** El signo con el que un movimiento entra a la suma del stock. */
export function signoDe(mov) {
  if (mov.tipo === 'traslado') return SIGNO_DE_PATA[mov.pata] ?? 0
  return SIGNO_POR_TIPO[mov.tipo] ?? 0
}

/**
 * El motivo por el que un pedido no se puede guardar — o `null` si está bien.
 *
 * 🔑 **`cantidad` es opcional a propósito.** «Lo pedí» sin saber cuánto viene sigue siendo la
 * información que hace falta —el aviso se calla igual— y exigir un número haría que alguien
 * inventara uno. Lo que ⛔ no se acepta es un 0: eso afirmaría que se pidió nada.
 */
export function motivoPedidoInvalido(p) {
  if (!p || typeof p !== 'object') return 'falta el pedido'
  if (typeof p.insumoId !== 'string' || !p.insumoId) return 'falta el insumo'
  if (!esFechaIso(p.pedidoAt)) return 'la fecha del pedido tiene que ser un día real (YYYY-MM-DD)'
  if (p.cantidad != null && !(typeof p.cantidad === 'number' && Number.isFinite(p.cantidad) && p.cantidad > 0)) {
    return 'la cantidad tiene que ser un número mayor a 0 (dejala vacía si no sabés cuánto viene)'
  }
  if (p.promesaAt != null) {
    if (!esFechaIso(p.promesaAt)) return 'la fecha prometida tiene que ser un día real (YYYY-MM-DD)'
    // 🔑 Una promesa anterior al pedido es un tipeo, y silencioso: el pedido nacería demorado el
    // mismo día que se carga. La base tiene el mismo candado, para el que escriba derecho.
    if (p.promesaAt < p.pedidoAt) return 'la fecha prometida no puede ser anterior a la del pedido'
  }
  return null
}
