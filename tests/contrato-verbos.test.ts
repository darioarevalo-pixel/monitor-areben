import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 🔴 **Los verbos que manda el cliente tienen que existir del lado del handler, y ⛔ NADA los ata.**
 *
 * 28-ago-2026, y costó caro: una barrida de vocabulario cambió `action: 'borrar-promo'` por
 * `'eliminar-promo'` en los clientes de `lib/**`, pero los handlers de `api/*.js` **no entraron en
 * esa barrida** y siguieron esperando el nombre viejo. **19 verbos quedaron rotos y todo dio verde**:
 * el typecheck no los mira —son strings sueltos a los dos lados—, el lint tampoco, y ningún test
 * ejercía el par. La pantalla contestaba «acción inválida» y el CI no se enteró.
 *
 * 🔑 **La lección, que ya está escrita en `VOCABULARIO.md`: un verbo de protocolo es un NOMBRE DEL
 * CÓDIGO, ⛔ no una palabra de pantalla.** Se escribe igual que una palabra —`'borrar-promo'`— y por
 * eso una barrida de texto se lo lleva puesto sin que nada chille.
 *
 * ⚠️ Es un contrato de **inclusión, no de igualdad**: un handler puede aceptar verbos que ningún
 * cliente manda todavía (los llama un script, o quedaron por compatibilidad). Lo que ⛔ no puede
 * pasar es al revés.
 */

/** Donde viven los clientes: lo que ARMA el pedido. */
const CLIENTE = ['app', 'components', 'lib']
/** Donde viven los handlers: lo que lo CONTESTA. */
const SERVIDOR = 'api'

function archivos(dir: string, ext: string[]): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada)
    if (statSync(p).isDirectory()) salida.push(...archivos(p, ext))
    else if (ext.some((e) => p.endsWith(e))) salida.push(p)
  }
  return salida
}

/**
 * 🔑 **Sólo lo que SE MANDA, y por eso no alcanza con buscar `accion:` en cualquier lado.**
 * `accion: 'agregar' | 'quitar'` es un **union de tipo** —`lib/tncat/categorias.ts`— y
 * `accion: 'pausar'` adentro de `rendimiento.core.js` es una decisión que nunca sale del núcleo.
 * Ninguno de los dos cruza a `api/`. ⇒ se lee el objeto que va adentro de `postear(…)` o de
 * `JSON.stringify(…)`, que son las dos formas en que este repo arma un pedido.
 */
const ENVIOS = /(?:postear|JSON\.stringify)\s*\(\s*\{/g
const VERBO = /\b(action|accion|recurso)\s*:\s*'([a-z0-9-]+)'/g

/** El `{…}` balanceado que arranca en `desde`, para no cortar en la primera llave que cierre. */
function objeto(src: string, desde: number): string {
  let d = 0
  for (let i = desde; i < src.length; i += 1) {
    if (src[i] === '{') d += 1
    else if (src[i] === '}') {
      d -= 1
      if (d === 0) return src.slice(desde, i + 1)
    }
  }
  return src.slice(desde)
}

function verbosQueManda(): { verbo: string; donde: string; handlers: string[]; campo: string }[] {
  const salida: { verbo: string; donde: string; handlers: string[]; campo: string }[] = []
  for (const raiz of CLIENTE) {
    for (const p of archivos(raiz, ['.ts', '.tsx', '.js'])) {
      const src = readFileSync(p, 'utf8')
      // ⛔ **Un cliente que le habla a OTRA app no tiene handler acá.** `lib/tncat/cliente.ts` y
      // `components/gen-talles/useGenTalles.ts` pegan contra `bdi-catalogo.vercel.app`, que es el
      // repo de Darío: sus verbos viven allá y buscarlos en `api/` daría un rojo permanente, que
      // es la forma más rápida de que nadie mire este test.
      if (/=\s*'https:\/\//.test(src)) continue
      const handlers = handlersDe(src)
      for (const m of src.matchAll(ENVIOS)) {
        const cuerpo = objeto(src, m.index + m[0].length - 1)
        const linea = src.slice(0, m.index).split('\n').length
        for (const v of cuerpo.matchAll(VERBO)) salida.push({ verbo: v[2], donde: `${p}:${linea}`, handlers, campo: v[1] })
      }
    }
  }
  return salida
}

/** Todo string en minúscula-con-guiones que aparece en un handler: contra eso se compara. */
function verbosDe(p: string): Set<string> {
  const salida = new Set<string>()
  for (const m of readFileSync(p, 'utf8').matchAll(/'([a-z0-9-]+)'/g)) salida.add(m[1])
  return salida
}

/** Todo `api/` junto: el piso, para el cliente cuyo handler no se puede resolver. */
function verbosQueContesta(): Set<string> {
  const salida = new Set<string>()
  for (const p of archivos(SERVIDOR, ['.js', '.ts'])) for (const v of verbosDe(p)) salida.add(v)
  return salida
}

/**
 * 🔴 **A QUÉ handler le habla este cliente — y por qué mirar «todo api/» junto no alcanza.**
 *
 * 29-ago-2026: con el contrato de arriba en verde, **ocho verbos `eliminar` seguían rotos en
 * producción** —Atención, Buzón, Calendario, Diseños, Votación, Liquidación, Ideas de Meta y
 * Solicitudes—. La barrida de vocabulario del 28-ago los renombró en `lib/**`, los handlers se
 * quedaron con `borrar`, y **el test no lo vio porque la palabra `'eliminar'` existe en OTRO
 * archivo de `api/`**: el conjunto global la tenía, así que ninguno quedaba huérfano. Se cazó
 * borrando a mano una solicitud de prueba en producción: `400 kind inválido`.
 *
 * 🔑 **El contrato no es «el verbo existe en algún lado»: es «lo conoce EL handler al que le
 * hablás».** El cliente declara su endpoint (`const API = '/api/postventa?recurso=solicitudes'`) y
 * el recurso nombra el archivo (`api/_solicitudes.js`), así que el par se puede resolver leyendo.
 * Donde no se puede, se cae al conjunto global — que es lo de antes, ⛔ no menos.
 */
const ENDPOINT = /=\s*'\/api\/[a-z-]+\?recurso=([a-z0-9-]+)'/g

/**
 * ⚠️ **Los endpoints del archivo, en plural.** Un cliente puede tener dos —`lib/disenos/votacion.ts`
 * tiene el privado y el público del votante— y quedarse con el primero acusaría al archivo de
 * mandarle a uno un verbo que le manda al otro. Con la unión el test es **menos fino y sigue siendo
 * correcto**: lo que caza es el verbo que no conoce NINGUNO de los handlers a los que le habla, que
 * es exactamente el defecto de los ocho `eliminar`.
 */
function handlersDe(src: string): string[] {
  const salida: string[] = []
  for (const m of src.matchAll(ENDPOINT)) {
    const p = join(SERVIDOR, `_${m[1]}.js`)
    try { statSync(p); salida.push(p) } catch { /* el recurso no tiene archivo propio */ }
  }
  return [...new Set(salida)]
}

describe('el verbo que manda el cliente lo conoce el handler', () => {
  it('🔴 ninguno queda sin la otra mitad', () => {
    const conoce = verbosQueContesta()
    const huerfanos = verbosQueManda()
      .filter((x) => !conoce.has(x.verbo))
      // El mensaje nombra el renglón: quien lo rompa lo arregla sin leer este archivo.
      .map((x) => `${x.donde} → manda '${x.verbo}' y ningún handler de api/ lo conoce`)
    expect(huerfanos).toEqual([])
  })

  it('🔴 y lo conoce SU handler, ⛔ no «alguno»: es lo que dejó ocho `eliminar` rotos en prod', () => {
    const cache = new Map<string, Set<string>>()
    const conoce = (h: string, v: string) => {
      if (!cache.has(h)) cache.set(h, verbosDe(h))
      return cache.get(h)!.has(v)
    }
    const huerfanos = verbosQueManda()
      .filter((x) => x.handlers.length)
      // ⛔ **`recurso` no entra acá**: no es un verbo del handler sino la llave con la que
      // `api/datos.js` ELIGE handler, y su lista vive allá. Además el archivo no siempre se llama
      // como el recurso (`votacion` lo atiende `_disenos-votacion.js`), así que pedirle a un
      // handler que «conozca» su propio nombre de ruta es preguntarle lo que no le toca. El
      // contrato de arriba —contra todo `api/`— sí lo mira.
      .filter((x) => x.campo !== 'recurso')
      .filter((x) => !x.handlers.some((h) => conoce(h, x.verbo)))
      .map((x) => `${x.donde} → manda '${x.verbo}' y ${x.handlers.join(' / ')} no lo conoce`)
    expect(huerfanos).toEqual([])
  })

  it('🔑 y el par cliente→handler se resuelve de verdad, o el de arriba mira una lista vacía', () => {
    // 🔴 **El cero afirma.** Si cambia la forma del endpoint —otra convención de nombre, el recurso
    // en una variable— `handlerDe` devuelve `null` para todos y el test de arriba pasa sin mirar
    // nada. Este piso dice cuántos pares se están mirando de verdad.
    const conHandler = verbosQueManda().filter((x) => x.handlers.length && x.campo !== 'recurso')
    expect(new Set(conHandler.flatMap((x) => x.handlers)).size).toBeGreaterThan(8)
    expect(conHandler.length).toBeGreaterThan(20)
  })

  it('🔑 y el barrido encuentra verbos de verdad, o el test de arriba se cumple vacío', () => {
    // 🔴 **El cero afirma.** Si el regex deja de matchear —alguien pasa el verbo por una variable,
    // o cambia el nombre del campo— el test de arriba da verde con CERO verbos mirados, que es
    // exactamente lo que contesta una app rota. Este piso dice contra qué se está midiendo.
    const verbos = verbosQueManda()
    expect(verbos.length).toBeGreaterThan(30)
    expect(new Set(verbos.map((v) => v.verbo)).size).toBeGreaterThan(20)
  })
})
