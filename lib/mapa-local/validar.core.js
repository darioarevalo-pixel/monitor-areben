/**
 * Mapa del local — el saneo del mapa que manda la pantalla, ANTES de guardarlo.
 *
 * Es `.js` plano porque lo importa `api/_mapa-local.js`, que corre en Node sin pasar por el
 * compilador (igual que `lib/permisos.core.js`). La forma es la de `lib/mapa-local/tipos.ts`.
 *
 * 🔴 **⛔ No se guarda lo que venga.** El mapa entero es UNA fila jsonb que la pantalla reescribe
 * en cada guardado: un campo roto o un número absurdo quedaría como el armado oficial del local, y
 * de ahí sale la hoja que se le pasa al salón. Se arma un mapa nuevo con la lista blanca de cada
 * campo y se rechaza lo que no cierra, con el porqué.
 */

const POS = ['alta', 'baja', 'simple', 'frente']
const LINEAS = ['nc', 'sale', 'ambas']
const PAREDES = ['der', 'izq', 'isla']
const LARGOS = ['L1', 'L2', 'L3']
const TEMPORADAS = ['todo', 'verano', 'invierno']
const DIAS_DEL_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** `MM-DD` válido (el 29-feb vale: es una fecha del calendario, ⛔ no de un año). `null` si no cierra. */
function mesDia(v) {
  const m = /^(\d{2})-(\d{2})$/.exec(String(v || '').trim())
  if (!m) return null
  const mes = Number(m[1])
  const dia = Number(m[2])
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= DIAS_DEL_MES[mes - 1] ? `${m[1]}-${m[2]}` : null
}

const entero = (v, min, max) => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}
const tipo = (t) => String(t || '').trim().toUpperCase().replace(/\s+/g, ' ')

/** @returns {{ ok: true, mapa: import('./tipos').MapaLocal } | { ok: false, error: string }} */
export function sanearMapa(crudo) {
  if (!crudo || typeof crudo !== 'object') return { ok: false, error: 'El mapa vino vacío.' }
  if (!Array.isArray(crudo.modulos) || !crudo.modulos.length) return { ok: false, error: 'El mapa no tiene módulos.' }
  if (crudo.modulos.length > 60) return { ok: false, error: 'Más de 60 módulos: el local no tiene tantos.' }

  const codigos = new Set()
  const modulos = []
  for (const m of crudo.modulos) {
    const codigo = String((m && m.codigo) || '').trim().toUpperCase()
    if (!/^[A-Z0-9-]{1,10}$/.test(codigo)) return { ok: false, error: `Código de módulo inválido: «${codigo}».` }
    if (codigos.has(codigo)) return { ok: false, error: `El módulo ${codigo} está repetido.` }
    codigos.add(codigo)
    const pared = PAREDES.includes(m.pared) ? m.pared : null
    if (!pared) return { ok: false, error: `${codigo}: pared inválida.` }
    const orden = entero(m.orden, 1, 999)
    const anchoCm = entero(m.anchoCm, 10, 1000)
    if (orden == null) return { ok: false, error: `${codigo}: el orden en el recorrido tiene que ser un número.` }
    if (anchoCm == null) return { ok: false, error: `${codigo}: el ancho tiene que estar entre 10 y 1000 cm.` }
    if (!Array.isArray(m.niveles) || !m.niveles.length || m.niveles.length > 4) return { ok: false, error: `${codigo}: tiene que tener entre 1 y 4 barras.` }
    const posiciones = new Set()
    const niveles = []
    for (const n of m.niveles) {
      const pos = POS.includes(n && n.pos) ? n.pos : null
      if (!pos) return { ok: false, error: `${codigo}: barra con posición inválida.` }
      if (posiciones.has(pos)) return { ok: false, error: `${codigo}: dos barras en la misma posición (${pos}).` }
      const choca = pos === 'simple' ? posiciones.has('alta') || posiciones.has('baja') : (pos === 'alta' || pos === 'baja') && posiciones.has('simple')
      if (choca) return { ok: false, error: `${codigo}: una barra simple no convive con alta o baja.` }
      posiciones.add(pos)
      const alturaCm = entero(n.alturaCm, 20, 300)
      if (alturaCm == null) return { ok: false, error: `${codigo}: la altura de la barra tiene que estar entre 20 y 300 cm.` }
      const linea = LINEAS.includes(n.linea) ? n.linea : null
      if (!linea) return { ok: false, error: `${codigo}: línea inválida.` }
      const tipos = [...new Set((Array.isArray(n.tipos) ? n.tipos : []).map(tipo).filter(Boolean))].slice(0, 40)
      const cupo = n.cupo == null || n.cupo === '' ? null : entero(n.cupo, 0, 500)
      if (n.cupo != null && n.cupo !== '' && cupo == null) return { ok: false, error: `${codigo}: el cupo tiene que estar entre 0 y 500.` }
      niveles.push({ pos, alturaCm, linea, tipos, cupo })
    }
    const alta = niveles.find((n) => n.pos === 'alta')
    const baja = niveles.find((n) => n.pos === 'baja')
    if (alta && baja && alta.alturaCm <= baja.alturaCm) return { ok: false, error: `${codigo}: la barra alta tiene que estar más arriba que la baja.` }
    modulos.push({ codigo, pared, orden, anchoCm, niveles })
  }

  const vistos = new Set()
  const tipos = []
  for (const t of Array.isArray(crudo.tipos) ? crudo.tipos : []) {
    const nombre = tipo(t && t.tipo)
    if (!nombre || vistos.has(nombre)) continue
    vistos.add(nombre)
    const largo = LARGOS.includes(t.largo) ? t.largo : null
    const perchasPorM = entero(t.perchasPorM, 1, 80)
    if (!largo) return { ok: false, error: `${nombre}: largo inválido (L1, L2 o L3).` }
    if (perchasPorM == null) return { ok: false, error: `${nombre}: las perchas por metro tienen que estar entre 1 y 80.` }
    // El tope vacío es «sin medir» (⛔ no es cero), y nunca puede ser menos que lo cómodo.
    const sinTope = t.topePorM == null || t.topePorM === ''
    const topePorM = sinTope ? null : entero(t.topePorM, 1, 150)
    if (!sinTope && topePorM == null) return { ok: false, error: `${nombre}: el tope por metro tiene que estar entre 1 y 150.` }
    if (topePorM != null && topePorM < perchasPorM) return { ok: false, error: `${nombre}: el tope (${topePorM}/m) no puede ser menos que lo cómodo (${perchasPorM}/m).` }
    // Sin temporada se guarda sin el campo: el núcleo cae a la del armado inicial (`temporadaDe`).
    if (t.temporada != null && !TEMPORADAS.includes(t.temporada)) return { ok: false, error: `${nombre}: la temporada tiene que ser todo el año, verano o invierno.` }
    const fila = { tipo: nombre, largo, perchasPorM, topePorM, cuelga: t.cuelga !== false }
    if (t.temporada != null) fila.temporada = t.temporada
    tipos.push(fila)
  }

  const mapa = { version: 1, modulos, tipos }
  if (crudo.temporadas != null) {
    const temporadas = {}
    for (const k of ['verano', 'invierno']) {
      const r = crudo.temporadas[k]
      const desde = mesDia(r && r.desde)
      const hasta = mesDia(r && r.hasta)
      if (!desde || !hasta) return { ok: false, error: `Las fechas del ${k} tienen que ser días del año (MM-DD).` }
      if (desde === hasta) return { ok: false, error: `El ${k} empieza y termina el mismo día.` }
      temporadas[k] = { desde, hasta }
    }
    mapa.temporadas = temporadas
  }

  return { ok: true, mapa }
}
