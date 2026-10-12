/**
 * **Los percheros del chequeo con mapa** (Darío, 12-oct-2026): para elegir el lugar con UN toque desde
 * la ubicación flotante (`UbicacionFlotante.tsx`) en vez de las cinco filas de botones de
 * `ElegirEspacio`.
 *
 * 🔴 **Del mapa guardado se toman SÓLO los nombres de los percheros**, ⛔ cómo están armados: el
 * sábado 10-oct se cambiaron cosas de lugar y el mapa ⛔ se actualizó (*«si mañana quiero hacer un
 * chequeo me liquida no poder hacerlo»*). Por eso cada perchero ofrece SIEMPRE Arriba y Abajo, y
 * elige quien está parada delante.
 * 🔑 **El orden es el del recorrido, fijo** (Darío): I01 → I02 → … → ISLA → D01 → … → D12. ⛔ Es el
 * `orden` del mapa, que es el de la clienta caminando y sirve para otra cosa.
 * 🔑 **Frontal** = la exhibición que repite a propósito para que se vea lleno. Es un ATRIBUTO de la
 * barra, ⛔ una barra más: D03 arriba puede ser frontal y D03 abajo normal (Darío). Se prende con un
 * botón y se guarda como `D03 arriba frontal`; lo repetido ahí ⛔ sale como duplicado (`esFrontal`
 * en `reporte.ts`). Se apaga solo al pasar a otra barra.
 * 🔑 **Un perchero ya escaneado se deja de ofrecer** al pasar a otro (*«normalmente no se vuelve a un
 * lugar donde ya chequeaste»*).
 */

import { leerEspacio, lugarDe, type PosEspacio } from '@/lib/mapa-local/relevamiento'
import type { MapaLocal } from '@/lib/mapa-local/tipos'

export type Perchero = {
  /** `D01`, `ISLA`: la clave para saber si ya se escaneó. */
  codigo: string
  /** Lo que se lee en la lista y se guarda: `D07`. Un doble largo del mapa sale como D07 y D08. */
  nombre: string
  isla: boolean
  /** Tiene arriba y abajo (todos menos la isla): la flecha pasa de arriba a abajo antes de ir al siguiente. */
  doble: boolean
}

/** Las posiciones que se eligen en cada perchero. */
export type PosParada = PosEspacio

const ORDEN_PARED = { izq: 0, isla: 1, der: 2 } as const

/** Los percheros del mapa, en el orden del recorrido: izquierda, isla, derecha, cada pared por número. */
export function percherosDelChequeo(mapa: Pick<MapaLocal, 'modulos'> | null): Perchero[] {
  const vistos = new Set<string>()
  const out: (Perchero & { pared: keyof typeof ORDEN_PARED; numero: number })[] = []
  for (const m of mapa?.modulos ?? []) {
    const e = leerEspacio(m.codigo)
    if (!e) continue
    // 🔑 Todo perchero tiene Arriba y Abajo (Darío, 12-oct-2026: «Única no la usamos»): ⛔ se le cree al
    // mapa, que tenía I02 con una sola barra.
    const doble = e.pared !== 'isla'
    // 🔑 Un perchero de DOBLE LARGO del mapa (`D07`, 150 cm) se ofrece como DOS: D07 y D08 (Darío,
    // 12-oct-2026: «yo los separaría»). En el salón se escanea por número.
    const numeros = e.pared !== 'isla' && (m.anchoCm ?? 0) >= 150 ? [e.numero, e.numero + 1] : [e.numero]
    for (const numero of numeros) {
      const codigo = lugarDe({ pared: e.pared, numero, pos: 'simple' })
      if (vistos.has(codigo)) continue
      vistos.add(codigo)
      out.push({ codigo, nombre: codigo, isla: e.pared === 'isla', doble, pared: e.pared, numero })
    }
  }
  out.sort((a, b) => ORDEN_PARED[a.pared] - ORDEN_PARED[b.pared] || a.numero - b.numero)
  return out.map(({ codigo, nombre, isla, doble }) => ({ codigo, nombre, isla, doble }))
}

/** El texto del lugar que se guarda en cada escaneo: `D01 arriba`, `D07-08 abajo`, `ISLA`. */
export function lugarDeParada(p: Perchero, pos: PosParada): string {
  if (p.isla || pos === 'simple') return p.nombre
  return `${p.nombre} ${pos === 'alta' ? 'arriba' : 'abajo'}`
}

/** ¿El lugar es una exhibición frontal? Ahí se repite a propósito: ⛔ es duplicado. */
export function esFrontal(lugar: string | null | undefined): boolean {
  return /\bfrontal\b/i.test(String(lugar || ''))
}

/** El lugar sin la marca de frontal: `D03 arriba frontal` → `D03 arriba`. */
export function sinFrontal(lugar: string): string {
  return String(lugar || '').replace(/\s*\bfrontal\b/gi, '').trim()
}

/** Prende o apaga la marca de frontal de la barra donde está parada. */
export function conFrontal(lugar: string, frontal: boolean): string {
  const base = sinFrontal(lugar)
  return frontal && base ? `${base} frontal` : base
}

/** El perchero (`D01`, `ISLA`) que nombra un lugar, frontal incluido. `null` si ⛔ es del mapa. */
export function percheroDe(lugar: string): string | null {
  return leerEspacio(sinFrontal(lugar))?.codigo ?? null
}

/**
 * La clave de la BARRA de un lugar para comparar dos textos: `D7 abajo`, `D07 baja`, `D07-08 abajo`
 * y `D07-08 abajo frontal` son la misma barra (frontal es un atributo, ⛔ otra barra). Lo que ⛔ es
 * del mapa, en minúscula y sin espacios de más.
 */
export function claveLugar(lugar: string): string {
  const base = sinFrontal(lugar)
  const e = leerEspacio(base)
  if (e) return `${e.codigo}|${e.pos}`
  return base.toLowerCase().replace(/\s+/g, ' ')
}

/** Los percheros (`D01`, `ISLA`) que ya tienen al menos un escaneo en el recorrido. */
export function percherosHechos(escaneos: { lugar: string }[]): Set<string> {
  const out = new Set<string>()
  for (const e of escaneos) {
    const p = percheroDe(e.lugar)
    if (p) out.add(p)
  }
  return out
}

/** Los lugares exactos (por `claveLugar`) que ya tienen escaneos. */
export function lugaresHechos(escaneos: { lugar: string }[]): Set<string> {
  return new Set(escaneos.map((e) => claveLugar(e.lugar)).filter(Boolean))
}

/** La primera posición de un perchero al llegar: arriba si el mapa le conoce dos barras. */
function primera(p: Perchero): string {
  return lugarDeParada(p, p.isla ? 'simple' : p.doble ? 'alta' : 'simple')
}

/**
 * A dónde lleva la flecha: de `D01 arriba` a `D01 abajo` (si el mapa lo tiene doble y abajo ⛔ se
 * escaneó), y si no, al próximo perchero sin escanear. Al final vuelve a uno salteado. `null` = ya
 * están todos. Sin lugar todavía: el primero del recorrido.
 */
export function siguienteLugar(percheros: Perchero[], actual: string, escaneos: { lugar: string }[]): string | null {
  const hechos = percherosHechos(escaneos)
  const lugares = lugaresHechos(escaneos)
  const cod = percheroDe(actual)
  const i = cod ? percheros.findIndex((p) => p.codigo === cod) : -1
  const aqui = i >= 0 ? percheros[i] : null
  const e = leerEspacio(sinFrontal(actual))
  if (aqui && aqui.doble && e?.pos === 'alta') {
    const abajo = lugarDeParada(aqui, 'baja')
    if (!lugares.has(claveLugar(abajo))) return abajo
  }
  const libre = (p: Perchero) => p.codigo !== cod && !hechos.has(p.codigo)
  const p = percheros.slice(i + 1).find(libre) ?? percheros.slice(0, Math.max(i, 0)).find(libre)
  return p ? primera(p) : null
}

/** Cuántos percheros quedan sin escanear (el actual cuenta como hecho si ya tiene algo). */
export function percherosPendientes(percheros: Perchero[], escaneos: { lugar: string }[]): number {
  const hechos = percherosHechos(escaneos)
  return percheros.filter((p) => !hechos.has(p.codigo)).length
}

