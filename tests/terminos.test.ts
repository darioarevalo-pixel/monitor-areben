import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

/**
 * 🔴 **Los términos del negocio (`VOCABULARIO.md` §5)** — Bruno, 12-oct-2026: *«siempre que hago código,
 * siempre tengo que estar arreglando eso»*. Cada fila de la tabla dice qué palabra ⛔ va en qué carpetas;
 * este test saca de esas carpetas **sólo el texto que lee una persona** y falla con el archivo y la frase.
 *
 * 🔑 **Por qué el parser de TypeScript y ⛔ los identificadores** (como `vocabulario.test.ts`): `turno` es
 * a la vez un nombre de código (`caja_turno`, `turnoId`, `action: 'abrir-turno'`) y una palabra que la
 * pantalla ya ⛔ puede decir. Se separan por la FORMA: un string o un texto de JSX que es una frase (tiene
 * un espacio, o arranca en mayúscula como un rótulo de una palabra). Una clave como `'abrir-turno'` ⛔ lo es.
 *
 * ⛔ **La tabla vive en el `.md`, ⛔ acá**: corregir una palabra es agregar una fila allá, que es lo que
 * lee la próxima sesión ANTES de escribir; este test es el que la hace cumplir después.
 */

const RAIZ = process.cwd()
const DOC = readFileSync(join(RAIZ, 'VOCABULARIO.md'), 'utf8')

type Fila = { dice: string; prohibidas: string[]; donde: string[] }

/** Las filas de la §5 que son del monitor. */
function filas(): Fila[] {
  const sec = DOC.split(/^## 5 · /m)[1] ?? ''
  const celdas = (l: string) => l.split('|').slice(1, -1).map((c) => c.trim())
  const codigos = (c: string) => [...c.matchAll(/`([^`]+)`/g)].map((m) => m[1])
  return sec
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l) && !/^\|\s*se dice/.test(l))
    .map(celdas)
    .filter((c) => c[2] === 'monitor')
    .map((c) => ({ dice: c[0], prohibidas: codigos(c[1]), donde: codigos(c[3]) }))
}

/**
 * Las frases que se muestran y ⛔ son de esta app: el NOMBRE que viene de otro sistema y se muestra tal
 * cual. Cada una con su motivo; si la frase deja de existir, el test de abajo pide sacarla.
 */
/** `frase` es el COMIENZO de la frase excusada (un mensaje largo con datos adentro se excusa por cómo empieza). */
const EXCEPCIONES: Array<{ archivo: string; frase: string; motivo: string }> = [
  // La DIRECCIÓN de la sección Ingresos del monitor (`/recepciones`): es una ruta, ⛔ texto que se lee.
  { archivo: 'components/erp/stock/RecepcionesStock.tsx', frase: '/recepciones?oc=', motivo: 'ruta de la sección' },
  // La lista de verbos del protocolo (`action=turno`): son NOMBRES de la API, ⛔ texto de la caja.
  { archivo: 'api/_caja.js', frase: 'action inválida (config, referencias,', motivo: 'verbos del protocolo' },
  // Los nombres de las cuentas de feria en Gestión Nube, sembrados como vienen de allá.
  { archivo: 'lib/caja/core.core.js', frase: 'Feria - Efectivo', motivo: 'nombre de la cuenta en Gestión Nube' },
  { archivo: 'lib/caja/core.core.js', frase: 'Feria - Transferencia', motivo: 'nombre de la cuenta en Gestión Nube' },
  // El nombre de la cuenta de GN, que la pantalla nombra para que un admin la encuentre allá.
  { archivo: 'components/caja/partes.tsx', frase: 'El recargo va sólo sobre los productos en oferta, a la cuenta «Feria TC» de Gestión Nube; el resto del pedido sigue con su regla.', motivo: 'nombre de la cuenta en Gestión Nube' },
  // Identificadores que arman una clave (`tn:<id>`, `gn/<venta>`): ⛔ se leen en pantalla.
  { archivo: 'lib/erp/busqueda-global.core.js', frase: 'prenda/', motivo: 'id interno de un resultado' },
  { archivo: 'lib/erp/facturacion-lista.core.js', frase: 'gn/', motivo: 'id interno de una fila' },
  { archivo: 'lib/erp/transferencias.core.js', frase: 'libro:', motivo: 'id interno de una fila' },
  { archivo: 'lib/erp/comparacion.core.js', frase: 'tn:', motivo: 'id interno de una fila' },
  { archivo: 'lib/erp/ventas-lista.core.js', frase: 'tn:', motivo: 'id interno de una fila' },
]

function* archivos(p: string): Generator<string> {
  if (!existsSync(p)) return
  if (statSync(p).isFile()) {
    if (/\.(tsx?|jsx?|mjs)$/.test(p)) yield p
    return
  }
  for (const f of readdirSync(p)) if (f !== 'node_modules') yield* archivos(join(p, f))
}

const esFrase = (t: string) => /[a-záéíóúñ]/i.test(t) && (/\s/.test(t) || /^[A-ZÁÉÍÓÚÑ¿¡+]/.test(t))

/** El texto de pantalla de un archivo: strings y texto de JSX con forma de frase (⛔ comentarios, ⛔ imports). */
function textos(archivo: string): string[] {
  const kind = archivo.endsWith('.tsx') ? ts.ScriptKind.TSX : archivo.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const sf = ts.createSourceFile(archivo, readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true, kind)
  const out: string[] = []
  const ver = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text)
    else if (ts.isTemplateExpression(n)) out.push([n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' … '))
    else if (ts.isJsxText(n)) out.push(n.text)
    ts.forEachChild(n, ver)
  }
  ver(sf)
  return out.map((t) => t.replace(/\s+/g, ' ').trim()).filter(esFrase)
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('VOCABULARIO §5 · los términos del negocio', () => {
  const lista = filas()

  it('🔴 la tabla se lee: hay filas del monitor y cada una dice qué se prohíbe y dónde (⛔ verde mirando cero)', () => {
    expect(lista.length).toBeGreaterThanOrEqual(4)
    for (const f of lista) {
      expect(f.prohibidas.length, `«${f.dice}»: sin palabras prohibidas`).toBeGreaterThan(0)
      expect(f.donde.length, `«${f.dice}»: sin carpetas`).toBeGreaterThan(0)
      for (const d of f.donde) expect(existsSync(join(RAIZ, d)), `«${f.dice}»: ${d} ⛔ existe`).toBe(true)
    }
  })

  for (const f of filas()) {
    it(`se dice ${f.dice}, ⛔ ${f.prohibidas.join(' / ')}`, () => {
      // Bordes: ⛔ adentro de un nombre de código (`pos-turno`, `turno_id`, `&turno=`, `.turno`).
      const re = new RegExp(`(^|[^\\p{L}_.&?=-])(${f.prohibidas.map(escapar).join('|')})(?![\\p{L}_=-])`, 'iu')
      const malas: string[] = []
      let leidas = 0
      for (const d of f.donde)
        for (const a of archivos(join(RAIZ, d))) {
          const rel = a.slice(RAIZ.length + 1)
          for (const t of textos(a)) {
            leidas++
            if (re.test(t) && !EXCEPCIONES.some((e) => e.archivo === rel && t.startsWith(e.frase))) malas.push(`${rel} → «${t.slice(0, 120)}»`)
          }
        }
      // El piso: si el parser dejara de encontrar texto, esto daría verde mirando nada.
      expect(leidas).toBeGreaterThan(20)
      expect(malas).toEqual([])
    })
  }

  it('cada excepción sigue excusando una frase que existe (o se saca)', () => {
    for (const e of EXCEPCIONES) expect(textos(join(RAIZ, e.archivo)).some((t) => t.startsWith(e.frase)), `${e.archivo}: «${e.frase}» ya ⛔ está — sacar la excepción`).toBe(true)
  })
})
