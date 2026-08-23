import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * **La pantalla que tiene selector de línea le habla a la Tienda Nube de la LÍNEA.**
 *
 * Esto existe porque el defecto no está en ninguna función: está en **qué argumento le pasa la
 * pantalla al hook**. `lib/tn-audit.ts` bajaba por línea desde el 22-ago-2026 y `matchTn` es puro y
 * correcto — los 4.246 tests estaban verdes y aun así, en producción, Márgenes con Stunned mostraba
 * **24 de 24 «sin foto»** y un **markup de 180 %** al lado del **88 %** de Zattia, porque las
 * tarjetas de Stunned se valuaban a precio de LISTA (no engancha el promo de otra tienda) y las de
 * Zattia con el de **promo** (304 de 449, el 68 %). Dos mediciones distintas bajo el mismo rótulo.
 * 📌 Lo encontró caminar las OCHO pantallas del selector, no un test.
 *
 * 🔑 **Se amarra en las dos direcciones a propósito**, como el mapa de `AGENTS.md`:
 *   - la pantalla **con** selector no puede pasar `marca` — es el defecto del 23-ago;
 *   - la pantalla **sin** selector no puede pasar `linea` — no tiene ninguna, y si algún día la
 *     tiene, este test la obliga a decidir en vez de heredar.
 *
 * ⚠️ Lo que NO dice este test: que pasar la línea alcance. Comisiones, Reposición, Gerencial,
 * Liquidación y las cards de tncat pasan `marca` **a propósito** (mercadería entera) y acá salen
 * bien; lo suyo se defiende en sus propias fichas.
 */

const raiz = fileURLToPath(new URL('..', import.meta.url))

/** Los tres caminos de la app al catálogo de Tienda Nube (`components/productos/useTnImages.ts`). */
const HOOKS = ['useTnImages', 'useTnPromo', 'asegurarTnPromo']

function tsx(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = `${dir}/${e}`
    if (statSync(full).isDirectory()) tsx(full, out)
    else if (e.endsWith('.tsx') || e.endsWith('.ts')) out.push(full)
  }
  return out
}

/** Los argumentos con los que un archivo llama a los tres hooks: `useTnPromo(marca)` ⇒ `'marca'`. */
function argumentos(src: string): string[] {
  const args: string[] = []
  for (const h of HOOKS) {
    for (const m of src.matchAll(new RegExp(`\\b${h}\\(([^),]*)`, 'g'))) {
      const a = m[1].trim()
      // La definición del propio hook y los tipos no son llamadas.
      if (a && !a.includes(':')) args.push(a)
    }
  }
  return args
}

const archivos = tsx(`${raiz}/components`).map((f) => ({
  ruta: f.slice(raiz.length),
  src: readFileSync(f, 'utf8'),
}))

const conSelector = archivos.filter((a) => a.src.includes('<SelectorLinea') && !a.ruta.includes('/ui/'))
const llamanTn = archivos.filter((a) => argumentos(a.src).length > 0)

describe('el catálogo de TN se pide por LÍNEA donde hay selector', () => {
  it('las pantallas con selector existen y son las ocho conocidas', () => {
    // Si este número cambia sin que cambie la lista de abajo, alguien agregó un selector y no miró
    // qué más había que cortar. Es exactamente lo que pasó el 22-ago con las cinco de plata.
    expect(conSelector.map((a) => a.ruta).sort()).toEqual([
      '/components/margenes/Margenes.tsx',
      '/components/marketing/Marketing.tsx',
      '/components/mkt-ventas/MktVentas.tsx',
      '/components/productos/ProductosTable.tsx',
      '/components/resumen/Resumen.tsx',
      '/components/sesionfotos/SesionFotos.tsx',
      '/components/tncat/ImagenesCard.tsx',
      '/components/variantes/VariantesTable.tsx',
    ])
  })

  it('🔴 con selector, ningún hook de TN recibe `marca`', () => {
    const culpables = conSelector
      .map((a) => ({ ruta: a.ruta, args: argumentos(a.src).filter((x) => x === 'marca') }))
      .filter((x) => x.args.length)
    expect(culpables).toEqual([])
  })

  it('🔴 sin selector, ningún hook de TN recibe `linea`', () => {
    const rutasConSelector = new Set(conSelector.map((a) => a.ruta))
    const culpables = llamanTn
      .filter((a) => !rutasConSelector.has(a.ruta))
      .map((a) => ({ ruta: a.ruta, args: argumentos(a.src).filter((x) => x === 'linea') }))
      .filter((x) => x.args.length)
    expect(culpables).toEqual([])
  })

  it('el hook mismo está tipado por línea, no por marca', () => {
    // El tipo es lo que hace que la próxima pantalla no pueda equivocarse en silencio.
    const src = readFileSync(`${raiz}/components/productos/useTnImages.ts`, 'utf8')
    expect(src).toContain("import type { Linea } from '@/lib/lineas'")
    expect(src).not.toMatch(/\bmarca: Marca\b/)
  })
})
