/**
 * El cartel de «Ganadores por tanda»: **qué ranking manda y por qué**, en palabras.
 *
 * 🔑 Una pantalla que ordena sin decir con qué ordena afirma igual: sin este cartel, un orden hecho
 * con el mayorista se lee como el gusto del público, que es justamente el sesgo que la vista vino a
 * sacar.
 */

import type { RankingTanda } from './tipos'

export type Cartel = { tono: 'success' | 'brand' | 'warning' | 'neutral'; titulo: string; detalle: string }

const u = (n: number) => `${n.toLocaleString('es-AR')} ${n === 1 ? 'unidad' : 'unidades'}`
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

export function cartelDeTanda(r: RankingTanda, umbralPorModelo: number): Cartel {
  const vara = `${r.modelos} modelos × ${umbralPorModelo} = ${u(r.umbralUnidades)}`
  if (r.senal === 'sin-ventas') {
    return {
      tono: 'neutral',
      titulo: 'Todavía no hay ventas de esta tanda',
      detalle: 'Ni el público ni el mayorista compraron todavía: el orden es alfabético y no dice nada.',
    }
  }
  if (r.senal === 'mayorista') {
    return {
      tono: 'brand',
      titulo: 'Ordena el mayorista, como anticipo',
      detalle:
        `El público lleva ${r.uMin.toLocaleString('es-AR')} de las ${u(r.umbralUnidades)} que hacen falta (${vara}). ` +
        'Hasta llegar, el orden es el del mayorista, que en las tandas anteriores anticipó lo que después compró el público.',
    }
  }
  if (r.ruido) {
    return {
      tono: 'warning',
      titulo: 'Ordena el público, con pocas ventas',
      detalle:
        `El mayorista no compró esta tanda, así que no hay anticipo. Con ${u(r.uMin)} de ${u(r.umbralUnidades)} ` +
        `(${vara}), el orden todavía puede cambiar mucho.`,
    }
  }
  return {
    tono: 'success',
    titulo: 'Ordena el público',
    detalle:
      `La tanda ya juntó ${u(r.uMin)} vendidas al público` +
      (r.diasMin ? ` en ${dias(r.diasMin)}` : '') +
      ` (hacían falta ${u(r.umbralUnidades)}: ${vara}). Desde acá el mayorista es sólo referencia.`,
  }
}

/** Los dos relojes, en una línea. */
export function relojesDeTanda(r: RankingTanda): string {
  const pub = r.diasMin ? `Público: ${dias(r.diasMin)} desde su primera venta` : 'Público: sin ventas todavía'
  const may = r.diasMay ? `Mayorista: ${dias(r.diasMay)} desde el alta` : 'Mayorista: sin fecha de alta'
  return `${pub} · ${may}`
}
