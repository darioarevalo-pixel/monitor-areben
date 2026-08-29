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
const VERBO = /\b(?:action|accion|recurso)\s*:\s*'([a-z0-9-]+)'/g

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

function verbosQueManda(): { verbo: string; donde: string }[] {
  const salida: { verbo: string; donde: string }[] = []
  for (const raiz of CLIENTE) {
    for (const p of archivos(raiz, ['.ts', '.tsx', '.js'])) {
      const src = readFileSync(p, 'utf8')
      // ⛔ **Un cliente que le habla a OTRA app no tiene handler acá.** `lib/tncat/cliente.ts` y
      // `components/gen-talles/useGenTalles.ts` pegan contra `bdi-catalogo.vercel.app`, que es el
      // repo de Darío: sus verbos viven allá y buscarlos en `api/` daría un rojo permanente, que
      // es la forma más rápida de que nadie mire este test.
      if (/=\s*'https:\/\//.test(src)) continue
      for (const m of src.matchAll(ENVIOS)) {
        const cuerpo = objeto(src, m.index + m[0].length - 1)
        const linea = src.slice(0, m.index).split('\n').length
        for (const v of cuerpo.matchAll(VERBO)) salida.push({ verbo: v[1], donde: `${p}:${linea}` })
      }
    }
  }
  return salida
}

/** Todo string en minúscula-con-guiones que aparece en un handler: contra eso se compara. */
function verbosQueContesta(): Set<string> {
  const salida = new Set<string>()
  for (const p of archivos(SERVIDOR, ['.js', '.ts'])) {
    for (const m of readFileSync(p, 'utf8').matchAll(/'([a-z0-9-]+)'/g)) salida.add(m[1])
  }
  return salida
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

  it('🔑 y el barrido encuentra verbos de verdad, o el test de arriba se cumple vacío', () => {
    // 🔴 **El cero afirma.** Si el regex deja de matchear —alguien pasa el verbo por una variable,
    // o cambia el nombre del campo— el test de arriba da verde con CERO verbos mirados, que es
    // exactamente lo que contesta una app rota. Este piso dice contra qué se está midiendo.
    const verbos = verbosQueManda()
    expect(verbos.length).toBeGreaterThan(30)
    expect(new Set(verbos.map((v) => v.verbo)).size).toBeGreaterThan(20)
  })
})
