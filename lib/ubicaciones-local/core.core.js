/**
 * Ubicaciones depósito — el núcleo (JS plano: lo usan `api/_ubicaciones-local.js`, la pantalla y los tests).
 *
 * 🔑 QUÉ ES (Bruno, 4-oct-2026): el depósito de atrás del local de Zattia. Percha + atrás son UN stock
 * («Local» en GN) y ⛔ eso no se separa: lo que se guarda acá es DÓNDE está guardado cada producto.
 * Plan: `~/Documents/reunion-gerencia/2026-10-04-ubicaciones-deposito-plan-v1.md`.
 *
 * - La ubicación es **por producto**, no por bolsa ni por color: los colores van juntos, en orden de SKU.
 * - La clave del producto es el SKU de la variante SIN el color/talle (`RBT-0137` de `RBT-0137-BE`).
 *   ⛔ No es el `product_id` de GN ni el campo SKU del producto en GN (en 373 de 440 dice cualquier cosa).
 * - Se escanea el ESTANTE (etiqueta `EST-A1`) y después TODAS sus bolsas; eso REEMPLAZA el estante.
 */

/** Prefijo de la etiqueta de estante: lo que distingue «esto es un estante» de «esto es una bolsa». */
export const PREFIJO_ESTANTE = 'EST-'

/** Más que esto por variante en el Local ⇒ no entra en percha (1 a 3 por color) ⇒ tiene que haber bolsa. */
export const TOPE_PERCHA = 3

export const cmpSku = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' })

/**
 * La clave del producto: categoría + número, hasta el primer bloque con números inclusive
 * (`RTO-0013-NG` → `RTO-0013`, `STU-REM-0001-S` → `STU-REM-0001`). Lo que sigue (talle, color) es de
 * la variante. 🔑 Es LA regla de «qué es el producto» en el depósito: `skuBase` del conteo la reusa.
 */
export function claveDe(sku) {
  const s = String(sku || '').trim().toUpperCase()
  if (!s) return ''
  const segs = s.split('-')
  const i = segs.findIndex((seg) => /\d/.test(seg))
  return i < 0 ? s : segs.slice(0, i + 1).join('-')
}

/**
 * Lo que leyó el lector ⇒ estante o bolsa.
 *
 * 🔴 Un lector configurado con teclado en castellano escribe `'` donde la etiqueta dice `-`: se
 * corrige antes de mirar nada (`EST'A1` es el estante A1, `RBT'0137` es la bolsa RBT-0137).
 *
 * @returns {{tipo:'estante', estante:string} | {tipo:'bolsa', codigo:string, clave:string} | {tipo:'vacio'}}
 */
export function leerCodigo(texto) {
  const s = String(texto || '').trim().toUpperCase().replace(/'/g, '-')
  if (!s) return { tipo: 'vacio' }
  if (s.startsWith(PREFIJO_ESTANTE)) {
    const estante = s.slice(PREFIJO_ESTANTE.length).replace(/[^A-Z0-9]/g, '')
    return estante ? { tipo: 'estante', estante } : { tipo: 'vacio' }
  }
  return { tipo: 'bolsa', codigo: s, clave: claveDe(s) }
}

/** Nombre de estante válido: lo que queda de `EST-…`, letras y números, hasta 8. */
export function estanteValido(e) {
  return /^[A-Z0-9]{1,8}$/.test(String(e || ''))
}

/** Tope de estantes por tanda de impresión: un error de tipeo («A1-A1000») no manda mil hojas. */
export const TOPE_ESTANTES = 60

/**
 * Lo que se tipea para imprimir etiquetas de estante ⇒ la lista de nombres.
 *
 * Acepta sueltos y rangos, separados por coma, espacio o renglón: `A1-A12, B1-B4, REJA`.
 * El rango repite la letra o no (`A1-A12` = `A1-12`), y `EST-A1` se toma como `A1`.
 *
 * @returns {{nombres:string[], invalidos:string[], recortado:boolean}} sin repetidos, en el orden tipeado
 */
export function nombresDeEstantes(texto) {
  const nombres = []
  const invalidos = []
  const vistos = new Set()
  const sumar = (n) => {
    if (!vistos.has(n)) { vistos.add(n); nombres.push(n) }
  }
  const tokens = String(texto || '').toUpperCase().replace(/'/g, '-').split(/[\s,;]+/).filter(Boolean)
  for (const crudo of tokens) {
    const t = crudo.startsWith(PREFIJO_ESTANTE) ? crudo.slice(PREFIJO_ESTANTE.length) : crudo
    const r = /^([A-Z]*)(\d+)(?:-|\.\.|…)([A-Z]*)(\d+)$/.exec(t)
    // El rango por la letra del final, para los estantes de un módulo: `D1A-D1F` = `D1A-F`.
    const l = /^([A-Z]*\d+)([A-Z])(?:-|\.\.|…)([A-Z]*\d+)?([A-Z])$/.exec(t)
    if (l && (!l[3] || l[3] === l[1])) {
      const [desde, hasta] = [l[2].charCodeAt(0), l[4].charCodeAt(0)]
      if (hasta < desde) { invalidos.push(crudo); continue }
      for (let c = desde; c <= hasta; c++) sumar(l[1] + String.fromCharCode(c))
    } else if (r && (!r[3] || r[3] === r[1])) {
      const [desde, hasta] = [Number(r[2]), Number(r[4])]
      if (hasta < desde || hasta - desde >= TOPE_ESTANTES) { invalidos.push(crudo); continue }
      for (let i = desde; i <= hasta; i++) sumar(r[1] + i)
    } else if (estanteValido(t)) {
      sumar(t)
    } else {
      invalidos.push(crudo)
    }
  }
  return { nombres: nombres.slice(0, TOPE_ESTANTES), invalidos, recortado: nombres.length > TOPE_ESTANTES }
}

/**
 * 🔑 LA FORMA DEL DEPÓSITO (Bruno, 6-oct-2026): un pasillo con estanterías enfrentadas, **2 módulos a
 * la izquierda y 4 a la derecha, todos de 6 estantes**. Izquierda y derecha, parado en el pasillo
 * mirando a la puerta.
 *
 * El nombre del estante dice dónde ir: **lado + módulo + estante** ⇒ `I1A`, `D3C`.
 * - Lado `I` / `D`. ⚠️ ⛔ No confundir con los módulos de percha del salón (`D01`–`D12`, `I01`–`I02`
 *   del Mapa del local): esos llevan dos dígitos y ninguna letra al final.
 * - Módulo contado **desde la puerta** (1 es el más cerca).
 * - Estante con letra **desde el piso**: `A` es el de abajo de todo, `F` el de arriba.
 *
 * Un estante con otro nombre (`A1`, `REJA`) se puede escanear igual: el mapa lo muestra aparte.
 */
export const DEPOSITO = {
  niveles: 6,
  paredes: [
    { lado: 'I', nombre: 'izquierda', modulos: 2 },
    { lado: 'D', nombre: 'derecha', modulos: 4 },
  ],
}

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Todos los estantes del depósito, por pared, módulo y desde el piso: `I1A`…`I1F`, `I2A`…, `D1A`…`D4F`. */
export function estantesDelDeposito(forma = DEPOSITO) {
  const out = []
  for (const p of forma.paredes)
    for (let m = 1; m <= p.modulos; m++)
      for (let n = 0; n < forma.niveles; n++) out.push(`${p.lado}${m}${LETRAS[n]}`)
  return out
}

/** Lo que se tipea en Etiquetas para imprimir el depósito entero: `I1A-F, I2A-F, D1A-F, …`. */
export function rangosDelDeposito(forma = DEPOSITO) {
  const ult = LETRAS[forma.niveles - 1]
  return forma.paredes.flatMap((p) => Array.from({ length: p.modulos }, (_, i) => `${p.lado}${i + 1}A-${ult}`)).join(', ')
}

/**
 * Dónde queda un estante en el depósito, o `null` si su nombre ⛔ es del mapa (`A1`, `REJA`, `D5A`).
 * @returns {{lado:string, modulo:number, nivel:number} | null}  `nivel` 1 = el del piso
 */
export function partesDeEstante(nombre, forma = DEPOSITO) {
  const r = /^([A-Z])(\d+)([A-Z])$/.exec(String(nombre || '').toUpperCase())
  if (!r) return null
  const pared = forma.paredes.find((p) => p.lado === r[1])
  const modulo = Number(r[2])
  const nivel = LETRAS.indexOf(r[3]) + 1
  if (!pared || modulo < 1 || modulo > pared.modulos || nivel > forma.niveles) return null
  return { lado: r[1], modulo, nivel }
}

/**
 * Las lecturas de un estante ⇒ una fila por producto, con cuántas bolsas se leyeron.
 * Cada lectura repetida es UNA bolsa más (dos bolsas del mismo producto llevan la misma etiqueta).
 *
 * @param {string[]} claves  ya resueltas
 * @returns {{clave:string, bolsas:number}[]} en orden de SKU
 */
export function agruparLecturas(claves) {
  const n = new Map()
  for (const c of claves) {
    const k = String(c || '').trim().toUpperCase()
    if (k) n.set(k, (n.get(k) || 0) + 1)
  }
  return [...n.entries()].map(([clave, bolsas]) => ({ clave, bolsas })).sort((a, b) => cmpSku(a.clave, b.clave))
}

/**
 * En qué estantes está un producto, ordenados.
 * @param {{estante:string, clave:string}[]} foto
 */
export function ubicacionesDe(foto, clave) {
  const k = claveDe(clave)
  if (!k) return []
  return [...new Set(foto.filter((f) => f.clave === k).map((f) => f.estante))].sort(cmpSku)
}

/**
 * Los dos controles del escaneo total, contra el stock del Local.
 *
 * - **Bolsa sin stock**: la clave está en un estante y el Local tiene 0 de todas sus variantes ⇒
 *   la bolsa está vacía o el stock de GN está mal.
 * - **Stock sin bolsa**: alguna variante tiene MÁS de `TOPE_PERCHA` en el Local y la clave ⛔ está en
 *   ningún estante ⇒ bolsa perdida o en un lugar sin escanear. 🔑 Con 3 o menos ⛔ se avisa: puede
 *   estar todo colgado, y eso está bien (eran ~140 productos de ruido el 1-oct).
 *
 * @param {{estante:string, clave:string}[]} foto
 * @param {{sku:string|null, product_name:string, size_name?:string, available_quantity:number}[]} local  filas del Local
 */
export function controles(foto, local) {
  const porClave = new Map()
  for (const r of local) {
    const clave = claveDe(r.sku)
    if (!clave) continue
    const q = Number(r.available_quantity) || 0
    const c = porClave.get(clave) || { clave, nombre: r.product_name, total: 0, max: 0 }
    c.total += Math.max(0, q)
    c.max = Math.max(c.max, q)
    porClave.set(clave, c)
  }
  const enEstante = new Map()
  for (const f of foto) {
    if (!enEstante.has(f.clave)) enEstante.set(f.clave, [])
    enEstante.get(f.clave).push(f.estante)
  }

  const bolsaSinStock = [...enEstante.entries()]
    .filter(([clave]) => !((porClave.get(clave) || {}).total > 0))
    .map(([clave, estantes]) => ({ clave, nombre: (porClave.get(clave) || {}).nombre || null, estantes: [...new Set(estantes)].sort(cmpSku) }))
    .sort((a, b) => cmpSku(a.clave, b.clave))

  const stockSinBolsa = [...porClave.values()]
    .filter((c) => c.max > TOPE_PERCHA && !enEstante.has(c.clave))
    .map((c) => ({ clave: c.clave, nombre: c.nombre, enLocal: c.total, maxVariante: c.max }))
    .sort((a, b) => b.enLocal - a.enLocal || cmpSku(a.clave, b.clave))

  return { bolsaSinStock, stockSinBolsa }
}

/** Más viejo que esto, el estante se marca: el depósito se reacomoda con cada ingreso. */
export const DIAS_ESTANTE_VIEJO = 7

/**
 * El Local del espejo hecho índice, para reconocer cada bolsa EN EL TELÉFONO sin esperar al servidor.
 *
 * 🔑 Es la misma regla que `resolverBolsa` de `api/_ubicaciones-local.js`: primero por la clave
 * (la etiqueta de la bolsa), después por el código de barras de una prenda. El servidor vuelve a
 * resolver al guardar —⛔ se confía en lo de acá sólo para pitar—.
 *
 * @param {{sku?:string|null, barcode?:string|number|null, name?:string, qty?:number, img?:string|null}[]} items
 * @returns {{porClave: Map<string,{clave:string, nombre:string|null, img:string|null, enLocal:number}>, porBarras: Map<string,string>}}
 */
export function indexarLocal(items) {
  const porClave = new Map()
  const porBarras = new Map()
  for (const it of items) {
    const clave = claveDe(it.sku)
    if (!clave) continue
    const c = porClave.get(clave) || { clave, nombre: it.name || null, img: null, enLocal: 0 }
    c.enLocal += Math.max(0, Number(it.qty) || 0)
    if (!c.img && it.img) c.img = it.img
    porClave.set(clave, c)
    const b = String(it.barcode ?? '').trim().toUpperCase()
    if (b && !porBarras.has(b)) porBarras.set(b, clave)
  }
  return { porClave, porBarras }
}

/**
 * Una lectura de bolsa ⇒ el producto del Local, o `null` si el Local ⛔ lo tiene.
 * @param {ReturnType<typeof indexarLocal>} indice
 * @param {{codigo:string, clave:string}} lectura  lo que devolvió `leerCodigo`
 */
export function resolverEnLocal(indice, lectura) {
  const directo = indice.porClave.get(lectura.clave)
  if (directo) return directo
  const clave = indice.porBarras.get(lectura.codigo)
  return (clave && indice.porClave.get(clave)) || null
}
