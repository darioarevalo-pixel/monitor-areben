// El contrato entre el cliente y el handler de Insumos: **los nombres de los verbos**.
//
// 🔴 **Existe porque ya se rompió, el 28-ago-2026.** Una pasada de vocabulario renombró los verbos
// en `lib/insumos/cliente.ts` (`borrar-insumo` → `eliminar-insumo`) y `api/_insumos.js` se quedó
// con los viejos. Tres acciones —eliminar un insumo, un movimiento y un pedido— contestaban
// «acción inválida» y **nada se puso en rojo**: la suite del núcleo no usa el cliente, la del
// handler le pasa el `action` a mano, y la caminata invoca el handler derecho. Los tres oráculos
// miraban un lado cada uno y ninguno miraba **el medio**.
//
// 🔑 Es el patrón de «dos lados que deciden sobre lo mismo»: el bug no vive en ninguno de los dos,
// vive en la pregunta que los une. Un test de forma —⛔ no de comportamiento— es lo único que lo
// agarra, porque el defecto es que dos listas de strings dejaron de ser la misma.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')

/** Lo que el navegador manda: `action: 'x'` en la capa fetch. */
function verbosDelCliente(): string[] {
  const src = readFileSync(join(raiz, 'lib/insumos/cliente.ts'), 'utf8')
  return [...src.matchAll(/action:\s*'([a-z-]+)'/g)].map((m) => m[1])
}

/** Lo que el handler contesta: `action === 'x'`. */
function verbosDelHandler(): string[] {
  const src = readFileSync(join(raiz, 'api/_insumos.js'), 'utf8')
  return [...src.matchAll(/action === '([a-z-]+)'/g)].map((m) => m[1])
}

describe('el cliente y el handler de Insumos se llaman igual', () => {
  it('🔴 todo verbo que el cliente manda, el handler lo contesta', () => {
    const handler = new Set(verbosDelHandler())
    const huerfanos = [...new Set(verbosDelCliente())].filter((v) => !handler.has(v))
    // El mensaje nombra el verbo: quien lo rompa lo arregla sin leer este archivo.
    expect(huerfanos).toEqual([])
  })

  it('y el cliente manda más de un verbo — si no, el test de arriba no prueba nada', () => {
    // 🔑 El guardia del guardia: si un refactor deja la capa fetch sin ningún `action`, el test de
    // arriba pasa con la lista vacía y se vuelve decorativo. Un oráculo que no puede fallar miente.
    expect(verbosDelCliente().length).toBeGreaterThan(4)
    expect(verbosDelHandler().length).toBeGreaterThan(4)
  })

  it('⚠️ los verbos que el handler acepta de más son ALIAS de uno vivo, ⛔ no código muerto', () => {
    // Un verbo que el handler contesta y el cliente ya no manda es una pestaña abierta con el
    // bundle viejo: es válido tenerlo. Lo que ⛔ no es válido es que no sea el alias de NADA — ahí
    // es un verbo que nadie llama y que nadie se anima a sacar porque no sabe si alguien lo llama.
    //
    // 🔑 La regla es ESTRUCTURAL y no una lista: el alias tiene el mismo sufijo que un verbo vivo
    // (`borrar-pedido` ↔ `eliminar-pedido`). Una lista escrita a mano acá habría que actualizarla
    // en cada pasada de vocabulario, y el día que alguien la actualice sin pensar deja de defender.
    const sufijo = (v: string) => v.split('-').slice(1).join('-')
    const vivos = new Set(verbosDelCliente().map(sufijo))
    const huerfanos = [...new Set(verbosDelHandler())]
      .filter((v) => !new Set(verbosDelCliente()).has(v))
      .filter((v) => !vivos.has(sufijo(v)))
    expect(huerfanos).toEqual([])
  })
})
