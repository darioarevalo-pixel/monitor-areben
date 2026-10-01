/**
 * El armado propuesto con el stock de HOY: qué módulo va a colección o a sale, si va en doble barra
 * o en simple, y qué familia de tipos va en cada barra.
 *
 * 🔑 Lo pidió Bruno el 30-sep-2026: *«ni todo doble ni fijo»*. El armado tiene que seguir al stock
 * del momento, porque la mezcla cambia con cada temporada y con cada pase a sale.
 *
 * 🔴 **⛔ No maximiza perchas.** Con ~600 prendas para ~300 perchas, maximizar llenaría todo de
 * tops (la barra doble de cortos es la que más cuelga) y dejaría los vestidos sin lugar. La regla
 * es **que cada familia quede cubierta en la misma proporción**: la barra siguiente se la lleva la
 * familia con menos de lo suyo colgado. Es una regla elegida, ⛔ no medida.
 *
 * ⚠️ Es una PROPUESTA: llena el editor y nadie la guarda hasta que alguien la mire y apriete Guardar.
 * La isla no se toca (es la vidriera, se arma a mano), y los módulos de frente siguen de frente.
 */

import { AIRE_CM, LARGO_CM, cfgDeTipo, cuelga, cupoDe, despierta, ubicar } from './core'
import { FAMILIAS } from './inicial'
import type { LineaPrenda, MapaLocal, ModoCupo, Modulo, Nivel, Prenda } from './tipos'

/** Las alturas de cada armado: las mismas que usa el editor al cambiar de armado. */
export const ALTURA = { alta: 180, baja: 105, simple: 165, frente: 175 } as const

type Familia = { nombre: string; tipos: string[]; largoCm: number }

/** Las familias con los tipos del mapa; un tipo colgable que no está en ninguna va por su largo. */
export function familiasDe(mapa: MapaLocal, tiposConStock: string[]): Familia[] {
  const largo = (t: string) => LARGO_CM[cfgDeTipo(mapa, t)?.largo ?? 'L2']
  const fams = FAMILIAS.map((f) => ({ nombre: f.nombre, tipos: [...f.tipos] }))
  const yaEsta = new Set(fams.flatMap((f) => f.tipos))
  for (const t of tiposConStock) {
    if (yaEsta.has(t) || !cuelga(mapa, t)) continue
    yaEsta.add(t)
    // corto → tops · medio → blusas · largo → vestidos
    const destino = largo(t) <= LARGO_CM.L1 ? 0 : largo(t) <= LARGO_CM.L2 ? 2 : 4
    fams[destino].tipos.push(t)
  }
  return fams.map((f) => ({ ...f, largoCm: Math.max(...f.tipos.map(largo)) }))
}

/** ¿Entra colgada en esta posición sin tapar la barra de abajo ni tocar el piso? */
function entra(f: Familia, pos: 'alta' | 'baja' | 'frente' | 'simple'): boolean {
  if (pos === 'alta') return f.largoCm + AIRE_CM <= ALTURA.alta - ALTURA.baja
  if (pos === 'frente') return f.largoCm <= LARGO_CM.L1
  return f.largoCm + AIRE_CM <= ALTURA[pos]
}

export type Propuesta = {
  mapa: MapaLocal
  /** Cuántos módulos (de los que se rearman) quedaron para cada línea. */
  modulos: Record<LineaPrenda, number>
}

/**
 * 🔑 **Lo que duerme ⛔ no pide barras** (`despierta`, 1-oct-2026): si los sweaters contaran en verano,
 * la familia de abrigos sería «la menos cubierta» y se llevaría módulos que van a quedar vacíos.
 */
export function proponerArmado(prendas: Prenda[], mapa: MapaLocal, modo: ModoCupo, hoy: string): Propuesta {
  const colgables = prendas.filter((p) => cuelga(mapa, p.tipo) && despierta(mapa, p.tipo, hoy))
  const fams = familiasDe(mapa, [...new Set(colgables.map((p) => p.tipo))])
  const famDe = new Map(fams.flatMap((f, i) => f.tipos.map((t) => [t, i] as const)))

  // La isla queda como está: lo que ya cuelga ahí se descuenta antes de repartir.
  const fijos = mapa.modulos.filter((m) => m.pared === 'isla')
  const libres = mapa.modulos.filter((m) => m.pared !== 'isla').sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo))
  const enFijos = ubicar(colgables, { ...mapa, modulos: fijos }, modo, hoy)
  const colgadas = new Set(Object.values(enFijos.porBarra).flat().map((p) => p.clave))

  // Lo que falta colgar, por línea y familia. Sin línea conocida cuenta como colección.
  const falta: Record<LineaPrenda, number[]> = { nc: fams.map(() => 0), sale: fams.map(() => 0) }
  for (const p of colgables) {
    const i = famDe.get(p.tipo)
    if (i == null || colgadas.has(p.clave)) continue
    falta[p.linea ?? 'nc'][i]++
  }

  const ancho = libres.length ? libres[0].anchoCm : 75
  const nivel = (pos: Nivel['pos'], linea: LineaPrenda, f: Familia): Nivel => ({ pos, alturaCm: ALTURA[pos], linea, tipos: [...f.tipos], cupo: null })
  const cupo = (n: Nivel, m: Pick<Modulo, 'anchoCm'> = { anchoCm: ancho }) => cupoDe(mapa, m, n, modo)

  // Los módulos se reparten entre colección y sale según cuántas barras pide cada una.
  const barrasPedidas = (l: LineaPrenda) => fams.reduce((s, f, i) => s + falta[l][i] / Math.max(1, cupo(nivel('baja', l, f))), 0)
  const pide = { nc: barrasPedidas('nc'), sale: barrasPedidas('sale') }
  let kNc = pide.nc + pide.sale > 0 ? Math.round((libres.length * pide.nc) / (pide.nc + pide.sale)) : libres.length
  if (pide.sale > 0 && kNc >= libres.length) kNc = libres.length - 1
  if (pide.nc > 0 && kNc <= 0) kNc = Math.min(1, libres.length)

  const nuevos = new Map<string, Modulo>()
  for (const linea of ['nc', 'sale'] as const) {
    const suyos = linea === 'nc' ? libres.slice(0, kNc) : libres.slice(kNc)
    const dado = fams.map(() => 0)
    // 🔑 La barra siguiente es para la familia con menos de lo suyo cubierto (empata la que más pide).
    const peor = (pos: 'alta' | 'baja' | 'frente' | 'simple') => {
      let mejor = -1
      for (let i = 0; i < fams.length; i++) {
        if (!(falta[linea][i] > 0) || !entra(fams[i], pos)) continue
        const cov = dado[i] / falta[linea][i]
        const covM = mejor < 0 ? Infinity : dado[mejor] / falta[linea][mejor]
        if (cov < covM || (cov === covM && falta[linea][i] > falta[linea][mejor])) mejor = i
      }
      return mejor
    }
    const poner = (m: Modulo, pos: Nivel['pos'], i: number): Nivel => {
      const n = nivel(pos, linea, fams[i])
      dado[i] += cupo(n, m)
      return n
    }
    for (const m of suyos) {
      let niveles: Nivel[]
      const deFrente = m.niveles.some((n) => n.pos === 'frente')
      const g = peor('simple')
      if (g < 0) {
        // No queda nada de esta línea por colgar: el módulo cambia de línea y conserva su armado.
        niveles = m.niveles.map((n) => ({ ...n, linea }))
      } else if (deFrente) {
        const f = peor('frente')
        const nf = f >= 0 ? poner(m, 'frente', f) : nivel('frente', linea, fams[0])
        const b = peor('baja')
        niveles = [nf, b >= 0 ? poner(m, 'baja', b) : nivel('baja', linea, fams[0])]
      } else if (!entra(fams[g], 'baja')) {
        niveles = [poner(m, 'simple', g)]
      } else if (entra(fams[g], 'alta')) {
        const alta = poner(m, 'alta', g)
        const b = peor('baja')
        niveles = b >= 0 ? [alta, poner(m, 'baja', b)] : [{ ...alta, pos: 'simple', alturaCm: ALTURA.simple }]
      } else {
        const baja = poner(m, 'baja', g)
        const a = peor('alta')
        niveles = a >= 0 ? [poner(m, 'alta', a), baja] : [{ ...baja, pos: 'simple', alturaCm: ALTURA.simple }]
      }
      nuevos.set(m.codigo, { ...m, niveles })
    }
  }

  return {
    mapa: { ...mapa, modulos: mapa.modulos.map((m) => nuevos.get(m.codigo) || m) },
    modulos: { nc: kNc, sale: libres.length - kNc },
  }
}
