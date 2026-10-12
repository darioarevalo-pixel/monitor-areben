/**
 * **Qué voz habla** (Darío, 11-oct-2026: *«hoy la voz es demasiado eléctrica»*).
 *
 * 🔑 Hasta ese día `decir` pedía sólo `lang = 'es-AR'` y el teléfono elegía solo: casi nunca hay una
 * voz `es-AR`, y el navegador caía en la de por defecto, que en iPhone suele ser la **compacta** —la
 * más robótica—. Las buenas existen y son gratis: Apple trae voces **mejoradas** y **premium** en
 * español que se bajan una vez desde Ajustes. Acá se ordenan y se elige la mejor que haya; quien
 * camina puede elegir otra en «Escuchar los avisos», y queda guardada en ese teléfono.
 *
 * ⚠️ Es puro (recibe la lista) para poder probarlo: `speechSynthesis.getVoices()` no existe en un test.
 */

/** Lo que se mira de una voz del navegador (`SpeechSynthesisVoice`). */
export type VozInfo = { name: string; lang: string; voiceURI: string; localService?: boolean }

export type Calidad = 'premium' | 'mejorada' | 'comun' | 'juguete'

/**
 * La calidad, leída del id de la voz en iPhone/Mac (`com.apple.voice.premium.es-MX.Paulina`).
 * 🔴 **Las «eloquence» y las de fantasía (Eddy, Flo, Grandma, Rocko…) son las MÁS eléctricas**:
 * suenan a computadora de los 80 y nunca se eligen solas.
 */
export function calidadDe(v: Pick<VozInfo, 'name' | 'voiceURI'>): Calidad {
  const id = `${v.voiceURI} ${v.name}`.toLowerCase()
  if (/premium/.test(id)) return 'premium'
  if (/enhanced|mejorada/.test(id)) return 'mejorada'
  // ⚠️ En Chrome el id ES el nombre («Eddy (español (México))»): por eso también se reconocen por nombre.
  if (/eloquence|speech\.synthesis\.voice/.test(id) || JUGUETES.has(primeraPalabra(v.name))) return 'juguete'
  return 'comun'
}

/** Las voces de fantasía de Apple. Medido el 11-oct-2026 en Chrome de la Mac: 16 de las 20 en español. */
const JUGUETES = new Set(['eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley', 'albert', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'fred', 'jester', 'junior', 'kathy', 'organ', 'ralph', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox'])
const primeraPalabra = (n: string) => n.trim().split(/[\s(]/)[0].toLowerCase()

const PUNTOS: Record<Calidad, number> = { premium: 30, mejorada: 20, comun: 10, juguete: 0 }

/** El acento: primero el de acá, después el latino, después el de España. */
function acento(lang: string): number {
  const l = lang.toLowerCase().replace('_', '-')
  if (l === 'es-ar') return 3
  if (/^es-(mx|us|419|co|cl|uy)/.test(l)) return 2
  if (l === 'es-es') return 1
  return 0
}

export const esEspanol = (v: Pick<VozInfo, 'lang'>) => /^es([-_]|$)/i.test(v.lang)

/** Las voces en español, de la que mejor suena a la peor. */
export function ordenarVoces<T extends VozInfo>(voces: T[]): T[] {
  const es = voces.filter(esEspanol)
  // Las de fantasía ⛔ se ofrecen: llenaban el desplegable. Sólo si ⛔ hay otra cosa.
  const serias = es.filter((v) => calidadDe(v) !== 'juguete')
  return (serias.length ? serias : es)
    .map((v) => ({ v, p: PUNTOS[calidadDe(v)] + acento(v.lang) + (v.localService === false ? 0 : 0.5) }))
    .sort((a, b) => b.p - a.p || a.v.name.localeCompare(b.v.name))
    .map((x) => x.v)
}

/** La voz a usar: la elegida en este teléfono si sigue instalada; si no, la mejor. */
export function elegirVoz<T extends VozInfo>(voces: T[], guardada: string | null): T | null {
  const orden = ordenarVoces(voces)
  return (guardada && orden.find((v) => v.voiceURI === guardada)) || orden[0] || null
}

const PAIS: Record<string, string> = { ar: 'Argentina', mx: 'México', us: 'Estados Unidos', es: 'España', co: 'Colombia', cl: 'Chile' }

/** Cómo se lee en el desplegable: «Paulina · México · premium». */
export function nombreDeVoz(v: VozInfo): string {
  const nombre = v.name
    .replace(/\s*\((premium|enhanced|mejorada|compact)\)\s*/gi, ' ')
    .replace(/\s*\(español \([^)]*\)\)/i, '')
    .trim()
  const pais = PAIS[v.lang.toLowerCase().split(/[-_]/)[1] ?? ''] ?? v.lang
  const c = calidadDe(v)
  return [nombre, pais, c === 'premium' ? 'premium' : c === 'mejorada' ? 'mejorada' : null].filter(Boolean).join(' · ')
}
