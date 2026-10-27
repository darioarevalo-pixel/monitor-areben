/**
 * ERP › Búsqueda global (⌘K) y atajos (🎨 26-oct, Resto; `Piezas.dc.html`, «Buscador global» y «Atajos»). Núcleo puro.
 * 🔑 No inventa lecturas: reparte lo que se escribe entre las 3 que YA existen (ventas · prendas · clientas) y los saltos a
 * las pantallas. Pedido de TN y factura (`TN-…`, `B-0005-…`) ⛔ tienen lectura por número ⇒ no se buscan (se dice, ⛔ se adivina).
 */

/** Lo que se escribe, quitando tildes y mayúsculas, para comparar. */
export const limpio = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Qué lecturas correr con lo escrito. Las mismas reglas de cada lectura (`leerBusqueda`, `stockDePrenda`):
 * `#296` o hasta 6 cifras → la venta · 12 cifras o más → el código de barras de una prenda · 7 a 11 cifras (DNI/CUIT) → clienta
 * y ventas del cliente (y prenda: un SKU numérico) · con letras, 3 o más → prenda, clienta y ventas del cliente.
 * @returns {{ ventas: boolean, prendas: boolean, clientas: boolean, texto: string }}
 */
export function queBuscar(escrito) {
  const texto = String(escrito ?? '').trim()
  const nada = { ventas: false, prendas: false, clientas: false, texto }
  if (!texto) return nada
  const num = texto.replace(/^#/, '')
  if (/^\d+$/.test(num)) {
    if (texto.startsWith('#') || num.length <= 6) return { ...nada, ventas: true }
    if (num.length >= 12) return { ...nada, prendas: true }
    return { ...nada, ventas: true, prendas: true, clientas: true }
  }
  if (texto.length < 3) return nada
  return { ...nada, ventas: true, prendas: true, clientas: true }
}

/**
 * Un escaneo del lector: sólo cifras, 8 o más (EAN-8/13, o un código interno largo), o UNA palabra con letras y cifras
 * (el código de barras de la casa es el SKU sin guiones: `RRE0052BL`; con guiones también). Es lo que abre la prenda directo.
 */
export const esEscaneo = (escrito) => {
  const t = String(escrito ?? '').trim()
  return /^\d{8,14}$/.test(t) || /^(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9-]{6,24}$/i.test(t)
}

/**
 * Los saltos a pantallas que coinciden con lo escrito («stock» → Stock › Stock, «cuenta» → Cuenta corriente…).
 * @param {string} escrito
 * @param {Array<{ key: string, titulo: string, pestanias: Array<{ key: string, label: string }> }>} secciones
 */
export function saltosA(escrito, secciones, tope = 6) {
  const t = limpio(escrito)
  if (t.length < 2) return []
  const salida = []
  for (const s of secciones) {
    const pests = s.pestanias.length ? s.pestanias : [{ key: null, label: s.titulo }]
    for (const p of pests) {
      const etiqueta = p.key == null || limpio(p.label) === limpio(s.titulo) ? s.titulo : `${s.titulo} › ${p.label}`
      const haystack = limpio(`${s.titulo} ${p.label}`)
      if (!t.split(/\s+/).every((w) => haystack.includes(w))) continue
      // Lo que EMPIEZA con lo escrito va primero; después, lo que lo contiene.
      salida.push({ seccion: s.key, pestania: p.key, etiqueta, peso: limpio(p.label).startsWith(t) || limpio(s.titulo).startsWith(t) ? 0 : 1 })
    }
  }
  return salida.sort((a, b) => a.peso - b.peso).slice(0, tope).map(({ peso: _peso, ...r }) => r)
}

/**
 * Los resultados de las tres lecturas en una sola lista, en grupos y en el orden en que se recorren con ↑↓.
 * Cada resultado trae `id` (estable, para la tecla) y `destino` (lo que hace Enter).
 * @param {{ ventas?: any[], prendas?: any[], clientas?: any[], saltos?: any[] }} datos
 * @param {{ conMarca?: boolean }} [opciones]
 */
export function gruposDe({ ventas = [], prendas = [], clientas = [], saltos = [] }, { conMarca = false } = {}) {
  const marcaDe = (m) => (conMarca && m ? ` · ${m === 'bdi' ? 'BDI' : 'Zattia'}` : '')
  const grupos = [
    {
      key: 'ventas', titulo: 'Ventas',
      items: ventas.map((v) => ({
        id: `venta/${v.marca}/${v.id}`, titulo: `Venta #${v.numero}`,
        detalle: [v.cliente || 'Sin cliente', v.estado === 'anulada' ? 'anulada' : null, v.prueba ? 'de prueba' : null].filter(Boolean).join(' · ') + marcaDe(v.buscadaEn),
        destino: { tipo: 'venta', marca: v.buscadaEn || v.marca, id: v.id, ocurridaEn: v.ocurridaEn, numero: v.numero },
      })),
    },
    {
      key: 'prendas', titulo: 'Prendas',
      items: prendas.map((p) => ({
        id: `prenda/${p.buscadaEn || ''}/${p.producto}/${p.talle}`, titulo: `${p.nombre || 'Prenda'}${p.talleNombre ? ` · ${p.talleNombre}` : ''}`,
        detalle: [p.sku, p.barcode].filter(Boolean).join(' · ') + marcaDe(p.buscadaEn),
        destino: { tipo: 'prenda', marca: p.buscadaEn, producto: p.producto, talle: p.talle },
      })),
    },
    {
      key: 'clientas', titulo: 'Clientes',
      items: clientas.map((c) => ({
        id: `cliente/${c.buscadaEn || ''}/${c.doc}`, titulo: c.nombre,
        detalle: [c.doc, c.razonSocial && c.razonSocial !== c.nombre ? c.razonSocial : null].filter(Boolean).join(' · ') + marcaDe(c.buscadaEn),
        destino: { tipo: 'cliente', marca: c.buscadaEn, doc: c.doc || null, nombre: c.nombre },
      })),
    },
    {
      key: 'saltos', titulo: 'Ir a',
      items: saltos.map((s) => ({ id: `ir/${s.seccion}/${s.pestania}`, titulo: s.etiqueta, detalle: '', destino: { tipo: 'ir', seccion: s.seccion, pestania: s.pestania } })),
    },
  ]
  return grupos.filter((g) => g.items.length)
}

/** Las ventas que se pueden abrir desde acá: Ventas lista «Este mes» y «El mes pasado»; antes de eso no hay ficha a mano. */
export function desdeBusquedaDeVentas(hoy) {
  const [a, m] = hoy.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** El período de Ventas que contiene el día `ocurridaEn` (ISO), o null si es más viejo que «El mes pasado». */
export function periodoDeVenta(ocurridaEn, hoy) {
  // El día ARGENTINO de la venta (UTC−3): una venta de las 22:00 ya es del día siguiente en UTC.
  const ms = Date.parse(String(ocurridaEn ?? ''))
  if (Number.isNaN(ms)) return null
  const dia = new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10)
  const [a, m] = hoy.split('-').map(Number)
  const mes = (y, mm) => `${y}-${String(mm).padStart(2, '0')}`
  if (dia.slice(0, 7) === mes(a, m)) return 'mes'
  const ant = new Date(Date.UTC(a, m - 2, 1))
  if (dia.slice(0, 7) === mes(ant.getUTCFullYear(), ant.getUTCMonth() + 1)) return 'anterior'
  return null
}

/** Los atajos que el ERP tiene HOY (los de la Caja —F2, F4— son de la Caja y ⛔ se tocan). `[tecla, qué hace]`. */
export const ATAJOS = [
  ['⌘K', 'Buscar una venta, prenda o cliente (en Windows, Ctrl+K)'],
  ['/', 'Lo mismo, si no estás escribiendo'],
  ['↑ ↓', 'Moverse por los resultados'],
  ['Enter', 'Abrir el resultado elegido'],
  ['Esc', 'Cerrar el buscador o la ficha abierta'],
  ['?', 'Ver estos atajos'],
]

/** ¿El foco está en algo donde se escribe? (ahí «/» y «?» son letras, ⛔ atajos). */
export function estaEscribiendo(el) {
  if (!el || !el.tagName) return false
  const t = String(el.tagName).toLowerCase()
  return t === 'input' || t === 'textarea' || t === 'select' || el.isContentEditable === true
}

/** Qué hace una tecla: 'buscar' | 'atajos' | null. `⌘K`/`Ctrl+K` abren siempre; `/` y `?` sólo fuera de un campo. */
export function accionDeTecla(e, escribiendo) {
  const k = String(e.key ?? '')
  if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'k') return 'buscar'
  if (e.metaKey || e.ctrlKey || e.altKey || escribiendo) return null
  if (k === '/') return 'buscar'
  if (k === '?') return 'atajos'
  return null
}
